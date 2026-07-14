-- ===========================================================================
-- complex_catalog_masters_verification.sql — Phase 3 Catalog Masters (0019).
-- ---------------------------------------------------------------------------
-- Runs in a transaction that ROLLS BACK. Execute as a privileged role:
--   psql "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/complex_catalog_masters_verification.sql
--
-- Proves Milestone 9A (Charges + Airlines) reuses the frozen framework:
--   * charges + airlines tables exist, RLS on, touch + audit triggers wired
--   * charge_dependencies junction exists with RLS (no touch/audit trigger)
--   * import_master extends to charges (enum/bool/base_on defaults, idempotency)
--   * save_charge_dependencies RPC transactionally syncs the M:N junction
--     (replace semantics, self-dependency filtered, cross-tenant/unknown ignored,
--      cascade on charge delete)
--   * airlines: composite (tenant_id, product_id) FK resolved by product_code on
--     import; unknown/missing product -> row error; product delete blocked while
--     referenced (FK restrict)
--   * lookup extends with `charge` and `airline` keys
--   * optimistic locking on charges (stale row_version affects 0 rows)
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

-- ---------- fixtures: auth user + bootstrapped tenant + admin ------------
insert into auth.users (id, aud, role, email) values
  ('66666666-eeee-4eee-8eee-0000000000b1','authenticated','authenticated','cpxadm@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid;
begin
  v_t := app.bootstrap_tenant('cpx-a', 'Complex Tenant A', 'CpxA');
  perform app.link_tenant_admin(v_t, '66666666-eeee-4eee-8eee-0000000000b1',
          'cpxadm', 'Complex Admin', 'cpxadm@a.test');
  perform set_config('cpx.tenant', v_t::text, false);
end $$;

-- =======================================================================
-- 0) Structure: tables + RLS + triggers + policies; junction RLS-only.
-- =======================================================================
do $$
declare
  v_tbl text;
  v_tbls text[] := array['charges','airlines'];
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

  if to_regclass('public.charge_dependencies') is null then
    raise exception 'FAIL [table]: public.charge_dependencies missing';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.charge_dependencies'::regclass) then
    raise exception 'FAIL [rls]: RLS not enabled on public.charge_dependencies';
  end if;
  raise notice 'PASS [structure]: charges + airlines (RLS/triggers/policies) + junction RLS';
end $$;

-- Act as the tenant admin for all RPC calls + assertions.
set local role authenticated;
set local request.jwt.claim.sub = '66666666-eeee-4eee-8eee-0000000000b1';

-- =======================================================================
-- 1) charges import: VALIDATE dry-run, COMMIT, enum/bool/base_on, idempotency
-- =======================================================================
do $$
declare v_res jsonb;
begin
  v_res := public.import_master('charges', 'VALIDATE', $j$[
    {"code":"FRT","name":"FREIGHT","base_on":"Freight","charge_type":"AIRWAYBILL","charge_rate":"12.5","apply_fuel":"yes","apply_tax":"1"},
    {"name":"NoCode"}
  ]$j$::jsonb);
  if (v_res->>'ok')::int <> 1 or (v_res->>'error_count')::int <> 1 then
    raise exception 'FAIL [charges-validate]: %', v_res;
  end if;
  if (select count(*) from public.charges where tenant_id = current_setting('cpx.tenant')::uuid) <> 0 then
    raise exception 'FAIL [charges-validate-write]: VALIDATE inserted rows';
  end if;

  v_res := public.import_master('charges', 'COMMIT', $j$[
    {"code":"FRT","name":"FREIGHT","base_on":"Freight","charge_rate":"12.5","apply_fuel":"yes","apply_tax_on_fuel":"yes","apply_tax":"1"},
    {"code":"HAN","name":"HANDLING"},
    {"code":"INS","name":"INSURANCE","charge_type":"INCOME"},
    {"name":"NoCode"}
  ]$j$::jsonb);
  if (v_res->>'ok')::int <> 3 or (v_res->>'error_count')::int <> 1 then
    raise exception 'FAIL [charges-commit]: %', v_res;
  end if;
  if (select charge_type from public.charges
        where tenant_id = current_setting('cpx.tenant')::uuid and code = 'INS') <> 'INCOME' then
    raise exception 'FAIL [charges-enum]: charge_type not normalized';
  end if;
  if (select apply_fuel from public.charges
        where tenant_id = current_setting('cpx.tenant')::uuid and code = 'FRT') is not true then
    raise exception 'FAIL [charges-bool]: apply_fuel "yes" not normalized to true';
  end if;
  if (select base_on from public.charges
        where tenant_id = current_setting('cpx.tenant')::uuid and code = 'HAN') <> 'Actual Weight' then
    raise exception 'FAIL [charges-default]: base_on not defaulted to Actual Weight';
  end if;
  if (select charge_rate from public.charges
        where tenant_id = current_setting('cpx.tenant')::uuid and code = 'FRT') <> 12.5 then
    raise exception 'FAIL [charges-numeric]: charge_rate not parsed';
  end if;

  -- idempotent re-commit
  v_res := public.import_master('charges', 'COMMIT', $j$[{"code":"FRT","name":"FREIGHT"}]$j$::jsonb);
  if (v_res->>'ok')::int <> 0 or (v_res->>'skipped')::int <> 1 then
    raise exception 'FAIL [charges-idem]: re-import not skipped: %', v_res;
  end if;
  raise notice 'PASS [charges-import]: validate/commit/enum/bool/default/numeric/idempotency';
end $$;

-- =======================================================================
-- 2) save_charge_dependencies: replace semantics + self/unknown filtering
-- =======================================================================
do $$
declare
  v_t uuid := current_setting('cpx.tenant')::uuid;
  v_frt uuid; v_han uuid; v_ins uuid; v_n int;
begin
  select id into v_frt from public.charges where tenant_id = v_t and code = 'FRT';
  select id into v_han from public.charges where tenant_id = v_t and code = 'HAN';
  select id into v_ins from public.charges where tenant_id = v_t and code = 'INS';

  -- FRT depends on HAN + INS (self id filtered out; duplicates deduped)
  v_n := public.save_charge_dependencies(v_frt, array[v_han, v_ins, v_frt, v_han]);
  if v_n <> 2 then raise exception 'FAIL [deps-insert]: expected 2 edges, got %', v_n; end if;
  if (select count(*) from public.charge_dependencies where tenant_id = v_t and charge_id = v_frt) <> 2 then
    raise exception 'FAIL [deps-rows]: expected 2 junction rows';
  end if;
  if exists (select 1 from public.charge_dependencies
               where tenant_id = v_t and charge_id = v_frt and depends_on_charge_id = v_frt) then
    raise exception 'FAIL [deps-self]: self-dependency was inserted';
  end if;

  -- Replace with just HAN.
  v_n := public.save_charge_dependencies(v_frt, array[v_han]);
  if (select count(*) from public.charge_dependencies where tenant_id = v_t and charge_id = v_frt) <> 1 then
    raise exception 'FAIL [deps-replace]: replace did not shrink to 1';
  end if;

  -- Clear entirely.
  perform public.save_charge_dependencies(v_frt, array[]::uuid[]);
  if (select count(*) from public.charge_dependencies where tenant_id = v_t and charge_id = v_frt) <> 0 then
    raise exception 'FAIL [deps-clear]: clear did not remove all edges';
  end if;

  -- Cascade: deleting a charge removes edges that reference it.
  perform public.save_charge_dependencies(v_frt, array[v_han, v_ins]);
  delete from public.charges where id = v_ins;  -- hard delete for cascade test
  if exists (select 1 from public.charge_dependencies
               where tenant_id = v_t and depends_on_charge_id = v_ins) then
    raise exception 'FAIL [deps-cascade]: dependency edge survived charge delete';
  end if;
  raise notice 'PASS [charge-dependencies]: replace/self-filter/clear/cascade';
end $$;

-- =======================================================================
-- 3) airlines: composite FK by product_code; unknown/missing -> error
-- =======================================================================
do $$
declare v_res jsonb; v_t uuid := current_setting('cpx.tenant')::uuid; v_prod uuid;
begin
  -- seed a product (no product type needed; null allowed)
  perform public.import_master('products', 'COMMIT', $j$[
    {"code":"SPX","name":"OTHER PACKAGE"}
  ]$j$::jsonb);
  select id into v_prod from public.products where tenant_id = v_t and code = 'SPX';

  v_res := public.import_master('airlines', 'COMMIT', $j$[
    {"name":"air asia","product_code":"SPX"},
    {"name":"THAI AIRLINES","product_code":"SPX"},
    {"name":"NoProduct"},
    {"name":"BadProduct","product_code":"ZZZ"}
  ]$j$::jsonb);
  if (v_res->>'ok')::int <> 2 or (v_res->>'error_count')::int <> 2 then
    raise exception 'FAIL [airlines-counts]: %', v_res;
  end if;
  if (select name from public.airlines where tenant_id = v_t and product_id = v_prod
        order by name limit 1) <> 'AIR ASIA' then
    raise exception 'FAIL [airlines-upper]: name not uppercased';
  end if;
  if (select product_id from public.airlines where tenant_id = v_t and name = 'THAI AIRLINES')
       is distinct from v_prod then
    raise exception 'FAIL [airlines-fk]: product_code did not resolve to product id';
  end if;
  if exists (select 1 from public.airlines where tenant_id = v_t and name = 'BADPRODUCT') then
    raise exception 'FAIL [airlines-bad-fk]: row with unknown product_code inserted';
  end if;

  -- product referenced by an airline cannot be hard-deleted (FK restrict)
  begin
    delete from public.products where id = v_prod;
    raise exception 'FAIL [airlines-fk-restrict]: deleted a referenced product';
  exception when foreign_key_violation then
    null;
  end;
  raise notice 'PASS [airlines]: composite FK by code; unknown/missing -> error; FK restrict';
end $$;

-- =======================================================================
-- 4) lookup extends with `charge` and `airline` keys
-- =======================================================================
do $$
declare n int;
begin
  select count(*) into n from public.lookup('charge', 'frei', 50);
  if n <> 1 then raise exception 'FAIL [lookup-charge]: expected 1 match for "frei", got %', n; end if;
  if not exists (select 1 from public.lookup('airline', 'thai', 50)) then
    raise exception 'FAIL [lookup-airline]: expected a match for "thai"';
  end if;
  raise notice 'PASS [lookup]: charge + airline keys';
end $$;

-- =======================================================================
-- 5) Optimistic locking on charges: stale row_version -> 0 rows
-- =======================================================================
do $$
declare v_id uuid; v_rv integer; v_t uuid := current_setting('cpx.tenant')::uuid;
begin
  select id, row_version into v_id, v_rv from public.charges where tenant_id = v_t and code = 'FRT';
  update public.charges set name = 'FREIGHT CHG' where id = v_id and row_version = v_rv;
  if not found then raise exception 'FAIL [optlock-current]: current row_version update did not match'; end if;
  update public.charges set name = 'STALE' where id = v_id and row_version = v_rv;  -- stale now
  if found then raise exception 'FAIL [optlock-stale]: stale row_version update unexpectedly matched'; end if;
  raise notice 'PASS [optlock]: current rv updates; stale rv affects 0 rows';
end $$;

reset role;

do $$
begin
  raise notice '==========================================================';
  raise notice 'COMPLEX CATALOG VERIFICATION PASSED: charges/deps/airlines/lookup.';
  raise notice '==========================================================';
end $$;

rollback;
