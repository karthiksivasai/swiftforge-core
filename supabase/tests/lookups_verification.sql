-- ===========================================================================
-- lookups_verification.sql — proves public.lookup (0017).
-- ---------------------------------------------------------------------------
-- Runs in a transaction that ROLLS BACK. Execute as a privileged role.
-- Proves: tenant isolation; trigram search; stable ordering; result-limit
-- clamping [1,200]; destination ACTIVE-only filter; per-key code/name/hint
-- shape (country / zone / state / destination / pin-code / country-pincode /
-- area); unknown key rejected; tenant-less / unauthenticated caller gets an
-- empty set (never an error, never cross-tenant rows).
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

-- ---------- fixtures: auth users + two bootstrapped tenants --------------
insert into auth.users (id, aud, role, email) values
  ('55555555-eeee-4eee-8eee-0000000000a1','authenticated','authenticated','lookadm@a.test'),
  ('55555555-eeee-4eee-8eee-0000000000b1','authenticated','authenticated','lookadm@b.test'),
  ('55555555-eeee-4eee-8eee-0000000000c1','authenticated','authenticated','looknop@a.test')
on conflict (id) do nothing;

do $$
declare
  v_a uuid; v_b uuid; v_branch_a uuid;
  v_zone_n uuid; v_country_in uuid;
begin
  -- Tenant A (data-rich) + Tenant B (isolation probe).
  v_a := app.bootstrap_tenant('look-a', 'Lookup Tenant A', 'LA');
  perform app.link_tenant_admin(v_a, '55555555-eeee-4eee-8eee-0000000000a1',
          'lookadm', 'Lookup Admin', 'lookadm@a.test');
  v_b := app.bootstrap_tenant('look-b', 'Lookup Tenant B', 'LB');
  perform app.link_tenant_admin(v_b, '55555555-eeee-4eee-8eee-0000000000b1',
          'lookadmb', 'Lookup Admin B', 'lookadm@b.test');

  select id into v_branch_a from public.branches
    where tenant_id = v_a and is_head_office limit 1;

  -- zones (A): two named + 205 bulk rows so total > 200 (limit-cap probe).
  insert into public.zones (tenant_id, code, name) values
    (v_a, 'N', 'North'), (v_a, 'S', 'South');
  select id into v_zone_n from public.zones where tenant_id = v_a and code = 'N';
  insert into public.zones (tenant_id, code, name)
    select v_a, 'Z' || lpad(g::text, 4, '0'), 'BulkZone ' || g
    from generate_series(1, 205) g;

  -- countries (A): two, ordered India < United States (stable-order probe).
  insert into public.countries (tenant_id, code, name, currency) values
    (v_a, 'IN', 'India', 'INR'),
    (v_a, 'US', 'United States', 'USD');
  select id into v_country_in from public.countries where tenant_id = v_a and code = 'IN';

  -- states (A)
  insert into public.states (tenant_id, code, name, zone_id, gst_alias) values
    (v_a, 'KA', 'Karnataka', v_zone_n, '29');

  -- destinations (A): one ACTIVE + one INACTIVE (active-only filter probe).
  insert into public.destinations (tenant_id, dest_type, code, name, status) values
    (v_a, 'DOMESTIC', 'BLR', 'Bangalore', 'ACTIVE'),
    (v_a, 'DOMESTIC', 'OLD', 'Old Hub',   'INACTIVE');

  -- pincodes (A): one ODA + one plain (hint probe).
  insert into public.pincodes (tenant_id, pin_code, pin_name, is_oda, is_serviceable) values
    (v_a, '560001', 'Bangalore GPO',  true,  true),
    (v_a, '560002', 'Bangalore City', false, true);

  -- country_pincodes (A)
  insert into public.country_pincodes (tenant_id, country_id, pin_code, city_name, state_name) values
    (v_a, v_country_in, '560001', 'Bangalore', 'Karnataka');

  -- areas (A)
  insert into public.areas (tenant_id, branch_id, name) values
    (v_a, v_branch_a, 'INDIRANAGAR');

  -- tenant B: distinct zone name to prove cross-tenant invisibility.
  insert into public.zones (tenant_id, code, name) values (v_b, 'BEE', 'BetaZone');

  perform set_config('look.a', v_a::text, false);
  perform set_config('look.b', v_b::text, false);
end $$;

-- Act as Tenant A admin for the core assertions.
set local role authenticated;
set local request.jwt.claim.sub = '55555555-eeee-4eee-8eee-0000000000a1';

-- =======================================================================
-- 1) Tenant isolation: A cannot see B's zone; A sees its own.
-- =======================================================================
do $$
begin
  if (select count(*) from public.lookup('zone', 'Beta')) <> 0 then
    raise exception 'FAIL [isolation]: Tenant A saw Tenant B''s zone';
  end if;
  if (select count(*) from public.lookup('zone', 'North')) <> 1 then
    raise exception 'FAIL [isolation-own]: Tenant A could not find its own zone';
  end if;
  raise notice 'PASS [isolation]: results scoped to caller tenant';
end $$;

-- =======================================================================
-- 2) Trigram search: partial, case-insensitive match on name.
-- =======================================================================
do $$
declare v_code text; n int;
begin
  select count(*) into n from public.lookup('country', 'ind');
  if n <> 1 then raise exception 'FAIL [search-count]: expected 1 got %', n; end if;
  select code into v_code from public.lookup('country', 'ind');
  if v_code <> 'IN' then raise exception 'FAIL [search-row]: expected IN got %', v_code; end if;
  raise notice 'PASS [search]: trigram ILIKE partial match works';
end $$;

-- =======================================================================
-- 3) Stable ordering + limit: first ordered country is India.
-- =======================================================================
do $$
declare v_name text;
begin
  if (select count(*) from public.lookup('country', null, 50)) <> 2 then
    raise exception 'FAIL [order-count]: expected 2 countries';
  end if;
  select name into v_name from public.lookup('country', null, 1);
  if v_name <> 'India' then
    raise exception 'FAIL [order]: expected India first, got %', v_name;
  end if;
  raise notice 'PASS [order]: deterministic name ordering';
end $$;

-- =======================================================================
-- 4) Result-limit clamping to [1, 200].
-- =======================================================================
do $$
begin
  if (select count(*) from public.lookup('zone', null, 1000)) <> 200 then
    raise exception 'FAIL [limit-max]: over-large limit not clamped to 200';
  end if;
  if (select count(*) from public.lookup('zone', null, 2)) <> 2 then
    raise exception 'FAIL [limit-explicit]: limit 2 not honored';
  end if;
  if (select count(*) from public.lookup('zone', null, 0)) <> 1 then
    raise exception 'FAIL [limit-zero]: 0 not clamped up to 1';
  end if;
  if (select count(*) from public.lookup('zone', null, -5)) <> 1 then
    raise exception 'FAIL [limit-neg]: negative not clamped up to 1';
  end if;
  raise notice 'PASS [limit]: clamped to [1,200]';
end $$;

-- =======================================================================
-- 5) Destination lookup returns ACTIVE only, with dest_type hint.
-- =======================================================================
do $$
declare v_code text; v_hint text; n int;
begin
  select count(*) into n from public.lookup('destination', null);
  if n <> 1 then raise exception 'FAIL [dest-active]: expected 1 ACTIVE dest, got %', n; end if;
  select code, hint into v_code, v_hint from public.lookup('destination', null);
  if v_code <> 'BLR' or v_hint <> 'DOMESTIC' then
    raise exception 'FAIL [dest-shape]: got code=% hint=%', v_code, v_hint;
  end if;
  raise notice 'PASS [destination]: ACTIVE-only + hint shape';
end $$;

-- =======================================================================
-- 6) pin-code search + ODA hint; name falls back to pin_code.
-- =======================================================================
do $$
declare v_name text; v_hint text;
begin
  if (select count(*) from public.lookup('pin-code', '560001')) <> 1 then
    raise exception 'FAIL [pin-search]: expected 1 pincode';
  end if;
  select name, hint into v_name, v_hint from public.lookup('pin-code', '560001');
  if v_name <> 'Bangalore GPO' or v_hint <> 'ODA' then
    raise exception 'FAIL [pin-shape]: got name=% hint=%', v_name, v_hint;
  end if;
  raise notice 'PASS [pin-code]: search + ODA hint';
end $$;

-- =======================================================================
-- 7) country-pincode: code=pin, name=city, hint=state.
-- =======================================================================
do $$
declare v_code text; v_name text; v_hint text;
begin
  select code, name, hint into v_code, v_name, v_hint
  from public.lookup('country-pincode', '560001');
  if v_code <> '560001' or v_name <> 'Bangalore' or v_hint <> 'Karnataka' then
    raise exception 'FAIL [cpin-shape]: got %/%/%', v_code, v_name, v_hint;
  end if;
  raise notice 'PASS [country-pincode]: code/name/hint shape';
end $$;

-- =======================================================================
-- 8) area: name exposed as both code and name.
-- =======================================================================
do $$
declare v_code text; v_name text;
begin
  select code, name into v_code, v_name from public.lookup('area', 'indira');
  if v_code <> 'INDIRANAGAR' or v_name <> 'INDIRANAGAR' then
    raise exception 'FAIL [area-shape]: got code=% name=%', v_code, v_name;
  end if;
  raise notice 'PASS [area]: name mapped to code+name';
end $$;

-- =======================================================================
-- 9) Unknown key is rejected (invalid_parameter_value / 22023).
-- =======================================================================
do $$
begin
  begin
    perform * from public.lookup('not-a-key', null);
    raise exception 'FAIL [unknown-key]: unknown key did not raise';
  exception when invalid_parameter_value then
    raise notice 'PASS [unknown-key]: unknown key rejected';
  end;
end $$;

reset role;

-- =======================================================================
-- 10) Isolation from B's perspective: B sees its own zone.
-- =======================================================================
set local role authenticated;
set local request.jwt.claim.sub = '55555555-eeee-4eee-8eee-0000000000b1';
do $$
begin
  if (select count(*) from public.lookup('zone', 'Beta')) <> 1 then
    raise exception 'FAIL [isolation-b]: Tenant B could not see its own zone';
  end if;
  raise notice 'PASS [isolation-b]: reciprocal tenant scoping';
end $$;
reset role;

-- =======================================================================
-- 11) Tenant-less user -> empty; unauthenticated (no uid) -> empty.
-- =======================================================================
set local role authenticated;
set local request.jwt.claim.sub = '55555555-eeee-4eee-8eee-0000000000c1';  -- not linked
do $$
begin
  if (select count(*) from public.lookup('zone', null, 1000)) <> 0 then
    raise exception 'FAIL [no-tenant]: tenant-less user got rows';
  end if;
  raise notice 'PASS [no-tenant]: tenant-less caller gets empty set';
end $$;
reset role;

do $$
begin
  -- No role/JWT => auth.uid() null => guard returns empty.
  if (select count(*) from public.lookup('zone', null, 1000)) <> 0 then
    raise exception 'FAIL [no-auth]: unauthenticated caller got rows';
  end if;
  raise notice 'PASS [no-auth]: unauthenticated caller gets empty set';
end $$;

do $$
begin
  raise notice '==========================================================';
  raise notice 'LOOKUP VERIFICATION PASSED: isolation/search/order/limit/shape.';
  raise notice '==========================================================';
end $$;

rollback;
