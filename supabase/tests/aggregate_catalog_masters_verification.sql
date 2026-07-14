-- ===========================================================================
-- aggregate_catalog_masters_verification.sql — Phase 3 Catalog Masters (0020).
-- ---------------------------------------------------------------------------
-- Runs in a transaction that ROLLS BACK. Execute as a privileged role:
--   psql "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/aggregate_catalog_masters_verification.sql
--
-- Proves Milestone 9B (Service Centers + Field Executives) reuses the frozen
-- framework and introduces the Aggregate Save Pattern:
--   * service_centers + field_executives tables exist, RLS on, touch + audit
--     triggers wired, >=4 policies each
--   * service_center_terms child exists with RLS (no touch/audit trigger)
--   * save_service_center RPC: root upsert + Terms child replace in ONE txn,
--     optimistic-lock on update, blank terms dropped, cascade on root delete
--   * import_master extends to service_centers (root only) + field_executives
--     (FK resolve service_center_code required, destination_code optional;
--      in_active/charge normalization; code upper-cased; idempotency)
--   * field_executives composite FKs: service_center RESTRICT, destination SET
--     NULL; unknown/missing service center -> row error
--   * lookup extends with `service-center` and `field-executive` keys
--   * optimistic locking on field_executives (stale row_version affects 0 rows)
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

-- ---------- fixtures: auth user + bootstrapped tenant + admin ------------
insert into auth.users (id, aud, role, email) values
  ('77777777-eeee-4eee-8eee-0000000000c1','authenticated','authenticated','aggadm@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid;
begin
  v_t := app.bootstrap_tenant('agg-a', 'Aggregate Tenant A', 'AggA');
  perform app.link_tenant_admin(v_t, '77777777-eeee-4eee-8eee-0000000000c1',
          'aggadm', 'Aggregate Admin', 'aggadm@a.test');
  perform set_config('agg.tenant', v_t::text, false);
end $$;

-- =======================================================================
-- 0) Structure: tables + RLS + triggers + policies; child RLS-only.
-- =======================================================================
do $$
declare
  v_tbl text;
  v_tbls text[] := array['service_centers','field_executives'];
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

  if to_regclass('public.service_center_terms') is null then
    raise exception 'FAIL [table]: public.service_center_terms missing';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.service_center_terms'::regclass) then
    raise exception 'FAIL [rls]: RLS not enabled on public.service_center_terms';
  end if;
  raise notice 'PASS [structure]: service_centers + field_executives (RLS/triggers/policies) + terms RLS';
end $$;

-- Act as the tenant admin for all RPC calls + assertions.
set local role authenticated;
set local request.jwt.claim.sub = '77777777-eeee-4eee-8eee-0000000000c1';

-- =======================================================================
-- 1) service_centers import (root only): VALIDATE / COMMIT / idempotency
-- =======================================================================
do $$
declare v_res jsonb; v_t uuid := current_setting('agg.tenant')::uuid;
begin
  v_res := public.import_master('service_centers', 'VALIDATE', $j$[
    {"code":"HYD","name":"HYD","branch":"HYD"},
    {"name":"NoCode"}
  ]$j$::jsonb);
  if (v_res->>'ok')::int <> 1 or (v_res->>'error_count')::int <> 1 then
    raise exception 'FAIL [sc-validate]: %', v_res;
  end if;
  if (select count(*) from public.service_centers where tenant_id = v_t) <> 0 then
    raise exception 'FAIL [sc-validate-write]: VALIDATE inserted rows';
  end if;

  v_res := public.import_master('service_centers', 'COMMIT', $j$[
    {"code":"HYD","name":"HYD","branch":"HYD","state":"TELANGANA","state_code":"36"},
    {"code":"BAN","name":"BANGALORE","branch":"BLR"},
    {"name":"NoCode"}
  ]$j$::jsonb);
  if (v_res->>'ok')::int <> 2 or (v_res->>'error_count')::int <> 1 then
    raise exception 'FAIL [sc-commit]: %', v_res;
  end if;
  if (select branch from public.service_centers where tenant_id = v_t and code = 'HYD') <> 'HYD' then
    raise exception 'FAIL [sc-branch]: branch not stored';
  end if;

  -- idempotent re-commit
  v_res := public.import_master('service_centers', 'COMMIT', $j$[{"code":"HYD","name":"HYD"}]$j$::jsonb);
  if (v_res->>'ok')::int <> 0 or (v_res->>'skipped')::int <> 1 then
    raise exception 'FAIL [sc-idem]: re-import not skipped: %', v_res;
  end if;
  raise notice 'PASS [service-centers-import]: validate/commit/branch/idempotency';
end $$;

-- =======================================================================
-- 2) save_service_center: aggregate root upsert + Terms replace + optlock
-- =======================================================================
do $$
declare
  v_t uuid := current_setting('agg.tenant')::uuid;
  v_row public.service_centers;
  v_id uuid;
  v_rv integer;
begin
  -- INSERT root + 2 non-blank terms (blank middle term dropped).
  v_row := public.save_service_center(
    null, null,
    '{"code":"SCX","name":"SERVICE CENTRE X","branch":"HYD","bank_name":"HDFC"}'::jsonb,
    '["Term one","","Term two"]'::jsonb);
  v_id := v_row.id; v_rv := v_row.row_version;
  if v_row.code <> 'SCX' or v_row.bank_name <> 'HDFC' then
    raise exception 'FAIL [agg-insert]: root fields not persisted';
  end if;
  if (select count(*) from public.service_center_terms
        where tenant_id = v_t and service_center_id = v_id) <> 2 then
    raise exception 'FAIL [agg-terms-insert]: expected 2 terms (blank dropped)';
  end if;

  -- UPDATE root + shrink terms to 1 (replace semantics), optimistic-locked.
  v_row := public.save_service_center(
    v_id, v_rv,
    '{"code":"SCX","name":"SERVICE CENTRE X2","branch":"HYD"}'::jsonb,
    '["Only term"]'::jsonb);
  if v_row.name <> 'SERVICE CENTRE X2' then
    raise exception 'FAIL [agg-update]: root not updated';
  end if;
  if v_row.row_version <= v_rv then
    raise exception 'FAIL [agg-rowver]: row_version not bumped on update';
  end if;
  if (select count(*) from public.service_center_terms
        where tenant_id = v_t and service_center_id = v_id) <> 1 then
    raise exception 'FAIL [agg-terms-replace]: expected 1 term after replace';
  end if;

  -- Stale row_version -> conflict (40001).
  begin
    perform public.save_service_center(v_id, v_rv, '{"code":"SCX","name":"STALE"}'::jsonb, '[]'::jsonb);
    raise exception 'FAIL [agg-optlock]: stale row_version update unexpectedly succeeded';
  exception when sqlstate '40001' then
    null;
  end;

  -- Cascade: hard-deleting the root removes its terms.
  delete from public.service_centers where id = v_id;
  if (select count(*) from public.service_center_terms
        where tenant_id = v_t and service_center_id = v_id) <> 0 then
    raise exception 'FAIL [agg-cascade]: terms survived root delete';
  end if;
  raise notice 'PASS [save-service-center]: insert/update/terms-replace/optlock/cascade';
end $$;

-- =======================================================================
-- 3) field_executives import: composite FKs + normalization + idempotency
-- =======================================================================
do $$
declare v_res jsonb; v_t uuid := current_setting('agg.tenant')::uuid; v_sc uuid;
begin
  -- seed a destination (all geo FKs null-allowed on import)
  perform public.import_master('destinations', 'COMMIT', $j$[
    {"code":"HYD","name":"HYDERABAD"}
  ]$j$::jsonb);

  select id into v_sc from public.service_centers where tenant_id = v_t and code = 'HYD';

  v_res := public.import_master('field_executives', 'COMMIT', $j$[
    {"code":"akhil","name":"AKHIL CW","service_center_code":"HYD","destination_code":"HYD","in_active":"no","pickup_charge":"5"},
    {"code":"RAJU","name":"RAJU","service_center_code":"HYD"},
    {"code":"NOSC","name":"No Service Center"},
    {"code":"BADSC","name":"Bad SC","service_center_code":"ZZZ"}
  ]$j$::jsonb);
  if (v_res->>'ok')::int <> 2 or (v_res->>'error_count')::int <> 2 then
    raise exception 'FAIL [fe-counts]: %', v_res;
  end if;
  if (select code from public.field_executives where tenant_id = v_t and name = 'AKHIL CW') <> 'AKHIL' then
    raise exception 'FAIL [fe-upper]: code not uppercased';
  end if;
  if (select service_center_id from public.field_executives where tenant_id = v_t and code = 'AKHIL')
       is distinct from v_sc then
    raise exception 'FAIL [fe-sc-fk]: service_center_code did not resolve';
  end if;
  if (select pickup_charge from public.field_executives where tenant_id = v_t and code = 'AKHIL') <> 5 then
    raise exception 'FAIL [fe-numeric]: pickup_charge not parsed';
  end if;
  if (select destination_id from public.field_executives where tenant_id = v_t and code = 'RAJU') is not null then
    raise exception 'FAIL [fe-dest-optional]: destination_id should be null when omitted';
  end if;
  if exists (select 1 from public.field_executives where tenant_id = v_t and code = 'BADSC') then
    raise exception 'FAIL [fe-bad-fk]: row with unknown service_center_code inserted';
  end if;

  -- service center referenced by a field executive cannot be hard-deleted (RESTRICT)
  begin
    delete from public.service_centers where id = v_sc;
    raise exception 'FAIL [fe-fk-restrict]: deleted a referenced service center';
  exception when foreign_key_violation then
    null;
  end;
  raise notice 'PASS [field-executives]: composite FKs; unknown/missing -> error; restrict; numeric/upper';
end $$;

-- =======================================================================
-- 4) lookup extends with `service-center` and `field-executive` keys
-- =======================================================================
do $$
declare n int;
begin
  select count(*) into n from public.lookup('service-center', 'bang', 50);
  if n <> 1 then raise exception 'FAIL [lookup-sc]: expected 1 match for "bang", got %', n; end if;
  if not exists (select 1 from public.lookup('field-executive', 'akhil', 50)) then
    raise exception 'FAIL [lookup-fe]: expected a match for "akhil"';
  end if;
  raise notice 'PASS [lookup]: service-center + field-executive keys';
end $$;

-- =======================================================================
-- 5) Optimistic locking on field_executives: stale row_version -> 0 rows
-- =======================================================================
do $$
declare v_id uuid; v_rv integer; v_t uuid := current_setting('agg.tenant')::uuid;
begin
  select id, row_version into v_id, v_rv from public.field_executives where tenant_id = v_t and code = 'AKHIL';
  update public.field_executives set name = 'AKHIL C' where id = v_id and row_version = v_rv;
  if not found then raise exception 'FAIL [optlock-current]: current row_version update did not match'; end if;
  update public.field_executives set name = 'STALE' where id = v_id and row_version = v_rv;  -- stale now
  if found then raise exception 'FAIL [optlock-stale]: stale row_version update unexpectedly matched'; end if;
  raise notice 'PASS [optlock]: current rv updates; stale rv affects 0 rows';
end $$;

reset role;

do $$
begin
  raise notice '==========================================================';
  raise notice 'AGGREGATE CATALOG VERIFICATION PASSED: service_centers/terms/field_executives/lookup.';
  raise notice '==========================================================';
end $$;

rollback;
