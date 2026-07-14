-- ===========================================================================
-- service_mapping_verification.sql — Phase 3 Operation Masters (0027).
-- ---------------------------------------------------------------------------
-- Proves service_mappings table + RLS + import arm resolving vendor codes.
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000027','authenticated','authenticated','svmap@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid;
begin
  v_t := app.bootstrap_tenant('svmap-a', 'Service Map Tenant A', 'SvMapA');
  perform app.link_tenant_admin(v_t, '99999999-1111-4111-8111-000000000027',
          'svmapadm', 'Service Map Admin', 'svmap@a.test');
  perform set_config('svmap.tenant', v_t::text, false);
end $$;

do $$
declare v_tbl text; v_tbls text[] := array['service_mappings'];
begin
  foreach v_tbl in array v_tbls loop
    if to_regclass('public.' || v_tbl) is null then raise exception 'FAIL [table]: %', v_tbl; end if;
    if not (select relrowsecurity from pg_class where oid = ('public.' || v_tbl)::regclass) then
      raise exception 'FAIL [rls]: %', v_tbl;
    end if;
    if (select count(*) from pg_trigger where tgrelid = ('public.' || v_tbl)::regclass
          and tgname in ('trg_touch_' || v_tbl, 'trg_audit_' || v_tbl)) <> 2 then
      raise exception 'FAIL [triggers]: %', v_tbl;
    end if;
  end loop;
  raise notice 'PASS [structure]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000027';

-- seed vendors for FK resolution
do $$
declare v_t uuid := current_setting('svmap.tenant')::uuid;
begin
  insert into public.vendors (tenant_id, code, name, mobile, status)
  values
    (v_t, 'COUR', 'COURIERWALA', '9999999991', 'ACTIVE'),
    (v_t, 'FEDE', 'FEDEX', '9999999992', 'ACTIVE');
  raise notice 'PASS [vendor-seed]';
end $$;

-- service_mappings import
do $$
declare v_res jsonb; v_t uuid := current_setting('svmap.tenant')::uuid; v_cnt int;
begin
  v_res := public.import_master('service_mappings', 'COMMIT', $j$[
    {"vendor_code":"COUR","service":"ECONOMY","billing_vendor_code":"COUR","min_weight":"0","max_weight":"99999","status":"active"},
    {"vendor_code":"FEDE","service":"EXPRESS","billing_vendor_code":"COUR","service_type":"FEDEX - EXPRESS"},
    {"vendor_code":"","service":"X"}
  ]$j$::jsonb);
  if (v_res->>'ok')::int <> 2 or (v_res->>'error_count')::int <> 1 then
    raise exception 'FAIL [import]: %', v_res;
  end if;
  select count(*) into v_cnt from public.service_mappings where tenant_id = v_t;
  if v_cnt <> 2 then raise exception 'FAIL [rows]: got %', v_cnt; end if;
  if not exists (
    select 1 from public.service_mappings sm
    join public.vendors v on v.id = sm.billing_vendor_id and v.code = 'COUR'
    where sm.tenant_id = v_t and sm.service = 'EXPRESS'
  ) then
    raise exception 'FAIL [billing-vendor-fk]';
  end if;
  raise notice 'PASS [service-mappings-import]';
end $$;

-- duplicate natural key skipped
do $$
declare v_res jsonb;
begin
  v_res := public.import_master('service_mappings', 'COMMIT', $j$[
    {"vendor_code":"COUR","service":"ECONOMY","billing_vendor_code":"COUR"}
  ]$j$::jsonb);
  if (v_res->>'ok')::int <> 0 or (v_res->>'skipped')::int <> 1 then
    raise exception 'FAIL [duplicate-skip]: %', v_res;
  end if;
  raise notice 'PASS [duplicate-skip]';
end $$;

reset role;
do $$ begin raise notice 'SERVICE MAPPING VERIFICATION PASSED'; end $$;
rollback;
