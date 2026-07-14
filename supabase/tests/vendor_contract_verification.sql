-- ===========================================================================
-- vendor_contract_verification.sql — Phase 3 Operation Masters (0028).
-- ---------------------------------------------------------------------------
-- Proves vendor_contracts aggregate + save_vendor_contract + import (root).
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-2222-4222-8222-000000000028','authenticated','authenticated','vcont@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid;
begin
  v_t := app.bootstrap_tenant('vcont-a', 'Vendor Contract Tenant A', 'VContA');
  perform app.link_tenant_admin(v_t, '99999999-2222-4222-8222-000000000028',
          'vcontadm', 'Vendor Contract Admin', 'vcont@a.test');
  perform set_config('vcont.tenant', v_t::text, false);
end $$;

do $$
declare v_tbl text; v_tbls text[] := array['vendor_contracts'];
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
  if to_regclass('public.vendor_contract_slabs') is null then raise exception 'FAIL [child]'; end if;
  raise notice 'PASS [structure]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-2222-4222-8222-000000000028';

-- seed FK masters
do $$
declare
  v_t uuid := current_setting('vcont.tenant')::uuid;
  v_zone uuid; v_country uuid; v_origin uuid; v_dest uuid; v_prod uuid; v_vendor uuid;
begin
  insert into public.zones (tenant_id, code, name) values (v_t, 'Z1', 'Zone 1')
    on conflict do nothing;
  select id into v_zone from public.zones where tenant_id = v_t and code = 'Z1';

  insert into public.countries (tenant_id, code, name) values (v_t, 'IN', 'India')
    on conflict do nothing;
  select id into v_country from public.countries where tenant_id = v_t and code = 'IN';

  insert into public.destinations (tenant_id, dest_type, code, name, status)
  values
    (v_t, 'DOMESTIC', 'HYD', 'Hyderabad', 'ACTIVE'),
    (v_t, 'DOMESTIC', 'BLR', 'Bangalore', 'ACTIVE')
  on conflict do nothing;
  select id into v_origin from public.destinations where tenant_id = v_t and code = 'HYD';
  select id into v_dest from public.destinations where tenant_id = v_t and code = 'BLR';

  insert into public.products (tenant_id, code, name, status)
  values (v_t, 'EXP', 'Express', 'ACTIVE')
  on conflict do nothing;
  select id into v_prod from public.products where tenant_id = v_t and code = 'EXP';

  insert into public.vendors (tenant_id, code, name, mobile, status)
  values (v_t, 'COUR', 'Courier Co', '9999999999', 'ACTIVE')
  on conflict do nothing;
  select id into v_vendor from public.vendors where tenant_id = v_t and code = 'COUR';

  perform set_config('vcont.zone', v_zone::text, false);
  perform set_config('vcont.country', v_country::text, false);
  perform set_config('vcont.origin', v_origin::text, false);
  perform set_config('vcont.dest', v_dest::text, false);
  perform set_config('vcont.prod', v_prod::text, false);
  perform set_config('vcont.vendor', v_vendor::text, false);
  raise notice 'PASS [seed-fk]';
end $$;

-- import root only
do $$
declare v_res jsonb; v_t uuid := current_setting('vcont.tenant')::uuid; v_cnt int;
begin
  v_res := public.import_master('vendor_contracts', 'COMMIT', $j$[
    {"vendor_code":"COUR","product_code":"EXP","contract_no":"VC-001","from_date":"2026-01-01","origin_destination_code":"HYD","destination_code":"BLR","zone_code":"Z1","country_code":"IN","service":"ECONOMY","unit":"KG","transit_days":"3","status":"active"},
    {"vendor_code":"","product_code":"EXP","contract_no":"X","from_date":"2026-01-01"}
  ]$j$::jsonb);
  if (v_res->>'ok')::int <> 1 or (v_res->>'error_count')::int <> 1 then
    raise exception 'FAIL [import]: %', v_res;
  end if;
  select count(*) into v_cnt from public.vendor_contracts where tenant_id = v_t;
  if v_cnt <> 1 then raise exception 'FAIL [import-rows]: got %', v_cnt; end if;
  raise notice 'PASS [vendor-contracts-import]';
end $$;

-- save_vendor_contract aggregate + slab replace
do $$
declare
  v_t uuid := current_setting('vcont.tenant')::uuid;
  v_vendor uuid := current_setting('vcont.vendor')::uuid;
  v_prod uuid := current_setting('vcont.prod')::uuid;
  v_origin uuid := current_setting('vcont.origin')::uuid;
  v_vc public.vendor_contracts;
  v_slabs jsonb;
begin
  v_slabs := $j$[
    {"rate_type":"FLAT","weight":"0","rate":"100"},
    {"rate_type":"PER_KG","weight":"5","rate":"25"}
  ]$j$::jsonb;

  v_vc := public.save_vendor_contract(null, null,
    jsonb_build_object(
      'contract_no','VC-002','from_date','2026-02-01',
      'vendor_id', v_vendor, 'product_id', v_prod,
      'origin_destination_id', v_origin, 'service','EXPRESS',
      'unit','KG','transit_days',2,'status','ACTIVE'),
    v_slabs);

  if (select count(*) from public.vendor_contract_slabs where contract_id = v_vc.id) <> 2 then
    raise exception 'FAIL [save-slabs]';
  end if;

  v_vc := public.save_vendor_contract(v_vc.id, v_vc.row_version,
    jsonb_build_object(
      'contract_no','VC-002','from_date','2026-02-01',
      'vendor_id', v_vendor, 'product_id', v_prod,
      'origin_destination_id', v_origin, 'service','EXPRESS',
      'unit','KG','transit_days',2,'status','ACTIVE'),
    $j$[{"rate_type":"MINIMUM","weight":"1","rate":"50"}]$j$::jsonb);

  if (select count(*) from public.vendor_contract_slabs where contract_id = v_vc.id) <> 1 then
    raise exception 'FAIL [save-slab-replace]';
  end if;

  begin
    perform public.save_vendor_contract(v_vc.id, v_vc.row_version - 1,
      jsonb_build_object(
        'contract_no','VC-002','from_date','2026-02-01',
        'vendor_id', v_vendor, 'product_id', v_prod,
        'service','EXPRESS','unit','KG','status','ACTIVE'),
      '[]'::jsonb);
    raise exception 'FAIL [optlock-missed]';
  exception when sqlstate '40001' then
    null;
  end;

  raise notice 'PASS [save_vendor_contract]';
end $$;

reset role;
do $$ begin raise notice 'VENDOR CONTRACT VERIFICATION PASSED'; end $$;
rollback;
