-- ===========================================================================
-- party_masters_verification.sql — Phase 3 Party Masters (0022).
-- ---------------------------------------------------------------------------
-- Runs in a transaction that ROLLS BACK. Execute as a privileged role:
--   psql "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/party_masters_verification.sql
--
-- Proves Milestone 10A (Consignees + Shippers) reuses the frozen framework:
--   * consignees + shippers tables exist, RLS on, touch + audit triggers wired
--   * import_master extends to consignees/shippers with state_code/country_code
--     FK resolution, mobile required, customer alias, status normalization,
--     VALIDATE dry-run, COMMIT + idempotency
--   * lookup extends with `consignee` and `shipper` keys (ACTIVE only)
--   * optimistic locking (stale row_version affects 0 rows) on consignees
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

-- ---------- fixtures: auth user + bootstrapped tenant + admin ------------
insert into auth.users (id, aud, role, email) values
  ('88888888-eeee-4eee-8eee-0000000000d1','authenticated','authenticated','partyadm@a.test')
on conflict (id) do nothing;

do $$
declare
  v_t uuid;
  v_zone uuid;
begin
  v_t := app.bootstrap_tenant('party-a', 'Party Tenant A', 'PartyA');
  perform app.link_tenant_admin(v_t, '88888888-eeee-4eee-8eee-0000000000d1',
          'partyadm', 'Party Admin', 'partyadm@a.test');

  insert into public.zones (tenant_id, code, name) values (v_t, 'S', 'South')
  on conflict do nothing;
  select id into v_zone from public.zones where tenant_id = v_t and code = 'S';

  insert into public.countries (tenant_id, code, name, currency) values
    (v_t, 'IN', 'India', 'INR')
  on conflict do nothing;

  insert into public.states (tenant_id, code, name, zone_id, gst_alias) values
    (v_t, 'KA', 'Karnataka', v_zone, '29')
  on conflict do nothing;

  perform set_config('party.tenant', v_t::text, false);
end $$;

-- =======================================================================
-- 0) Structure: two tables exist, RLS on, touch + audit triggers wired
-- =======================================================================
do $$
declare
  v_tbl text;
  v_tbls text[] := array['consignees','shippers'];
begin
  foreach v_tbl in array v_tbls loop
    if to_regclass('public.' || v_tbl) is null then
      raise exception 'FAIL [table]: public.% missing', v_tbl;
    end if;
    if not (select relrowsecurity from pg_class where oid = ('public.' || v_tbl)::regclass) then
      raise exception 'FAIL [rls]: RLS not enabled on public.%', v_tbl;
    end if;
    if (select count(*) from pg_trigger
          where tgrelid = ('public.' || v_tbl)::regclass
            and tgname in ('trg_touch_' || v_tbl, 'trg_audit_' || v_tbl)) <> 2 then
      raise exception 'FAIL [triggers]: touch+audit triggers missing on public.%', v_tbl;
    end if;
    if (select count(*) from pg_policies
          where schemaname = 'public' and tablename = v_tbl) < 4 then
      raise exception 'FAIL [policies]: expected >=4 RLS policies on public.%', v_tbl;
    end if;
  end loop;
  raise notice 'PASS [structure]: consignees + shippers (RLS/triggers/policies)';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '88888888-eeee-4eee-8eee-0000000000d1';

-- =======================================================================
-- 1) consignees import: VALIDATE, COMMIT, FK resolve, mobile required
-- =======================================================================
do $$
declare v_res jsonb; v_t uuid := current_setting('party.tenant')::uuid;
        v_state uuid; v_country uuid;
begin
  select id into v_state from public.states where tenant_id = v_t and code = 'KA';
  select id into v_country from public.countries where tenant_id = v_t and code = 'IN';

  v_res := public.import_master('consignees', 'VALIDATE', $j$[
    {"code":"CN1","name":"Acme Receiver","mobile":"9999999999","state_code":"KA","country_code":"IN","customer":"Walk-in"},
    {"code":"","name":"NoCode","mobile":"1"}
  ]$j$::jsonb);
  if (v_res->>'ok')::int <> 1 or (v_res->>'error_count')::int <> 1 then
    raise exception 'FAIL [cn-validate]: %', v_res;
  end if;
  if (select count(*) from public.consignees where tenant_id = v_t) <> 0 then
    raise exception 'FAIL [cn-validate-write]: VALIDATE inserted rows';
  end if;

  v_res := public.import_master('consignees', 'COMMIT', $j$[
    {"code":"CN1","name":"Acme Receiver","mobile":"9999999999","state_code":"KA","country_code":"IN","customer":"Walk-in","status":"active"},
    {"code":"CN2","name":"Inactive One","mobile":"8888888888","status":"in-active"},
    {"code":"CN3","name":"No Mobile"},
    {"code":"CN4","name":"Bad State","mobile":"7777777777","state_code":"ZZ"}
  ]$j$::jsonb);
  if (v_res->>'ok')::int <> 2 or (v_res->>'error_count')::int <> 2 then
    raise exception 'FAIL [cn-commit]: %', v_res;
  end if;
  if (select customer_name from public.consignees where tenant_id = v_t and code = 'CN1') <> 'Walk-in' then
    raise exception 'FAIL [cn-customer-alias]: customer column not mapped to customer_name';
  end if;
  if (select state_id from public.consignees where tenant_id = v_t and code = 'CN1') is distinct from v_state then
    raise exception 'FAIL [cn-state-fk]: state_code KA not resolved';
  end if;
  if (select country_id from public.consignees where tenant_id = v_t and code = 'CN1') is distinct from v_country then
    raise exception 'FAIL [cn-country-fk]: country_code IN not resolved';
  end if;
  if (select status from public.consignees where tenant_id = v_t and code = 'CN2') <> 'INACTIVE' then
    raise exception 'FAIL [cn-status]: in-active not normalized to INACTIVE';
  end if;

  v_res := public.import_master('consignees', 'COMMIT', $j$[{"code":"CN1","name":"Acme Receiver","mobile":"9999999999"}]$j$::jsonb);
  if (v_res->>'ok')::int <> 0 or (v_res->>'skipped')::int <> 1 then
    raise exception 'FAIL [cn-idem]: re-import not skipped: %', v_res;
  end if;
  raise notice 'PASS [consignees-import]: validate/commit/FK/customer/status/idempotency';
end $$;

-- =======================================================================
-- 2) shippers import: COMMIT + idempotency
-- =======================================================================
do $$
declare v_res jsonb; v_t uuid := current_setting('party.tenant')::uuid;
begin
  v_res := public.import_master('shippers', 'COMMIT', $j$[
    {"code":"SH1","name":"Acme Sender","mobile":"6666666666","pin_code":"560001","city":"Bangalore","state_code":"KA","country_code":"IN"},
    {"name":"NoCode","mobile":"1"}
  ]$j$::jsonb);
  if (v_res->>'ok')::int <> 1 or (v_res->>'error_count')::int <> 1 then
    raise exception 'FAIL [sh-commit]: %', v_res;
  end if;
  if (select pin_code from public.shippers where tenant_id = v_t and code = 'SH1') <> '560001' then
    raise exception 'FAIL [sh-pin]: pin_code not stored';
  end if;

  v_res := public.import_master('shippers', 'COMMIT', $j$[{"code":"SH1","name":"Acme Sender","mobile":"6666666666"}]$j$::jsonb);
  if (v_res->>'ok')::int <> 0 or (v_res->>'skipped')::int <> 1 then
    raise exception 'FAIL [sh-idem]: re-import not skipped: %', v_res;
  end if;
  raise notice 'PASS [shippers-import]: commit/pin/idempotency';
end $$;

-- =======================================================================
-- 3) lookup: consignee + shipper keys, ACTIVE only
-- =======================================================================
do $$
declare n int; v_code text;
begin
  select count(*) into n from public.lookup('consignee', null);
  if n <> 1 then raise exception 'FAIL [lookup-cn-active]: expected 1 ACTIVE consignee, got %', n; end if;
  select code into v_code from public.lookup('consignee', 'acme');
  if v_code <> 'CN1' then raise exception 'FAIL [lookup-cn-search]: got %', v_code; end if;

  select count(*) into n from public.lookup('shipper', null);
  if n <> 1 then raise exception 'FAIL [lookup-sh-active]: expected 1 ACTIVE shipper, got %', n; end if;
  select code into v_code from public.lookup('shipper', 'acme');
  if v_code <> 'SH1' then raise exception 'FAIL [lookup-sh-search]: got %', v_code; end if;

  raise notice 'PASS [lookup]: consignee + shipper ACTIVE-only + search';
end $$;

-- =======================================================================
-- 4) optimistic locking on consignees
-- =======================================================================
do $$
declare v_id uuid; v_rv int;
begin
  select id, row_version into v_id, v_rv from public.consignees
    where tenant_id = current_setting('party.tenant')::uuid and code = 'CN1';

  update public.consignees set name = 'Updated' where id = v_id and row_version = v_rv;
  if not found then raise exception 'FAIL [optlock-current]: current rv did not update'; end if;

  update public.consignees set name = 'STALE' where id = v_id and row_version = v_rv;
  if found then raise exception 'FAIL [optlock-stale]: stale rv unexpectedly matched'; end if;

  raise notice 'PASS [optlock]: consignees row_version guard';
end $$;

reset role;

do $$
begin
  raise notice '==========================================================';
  raise notice 'PARTY MASTERS VERIFICATION PASSED: structure/import/lookup.';
  raise notice '==========================================================';
end $$;

rollback;
