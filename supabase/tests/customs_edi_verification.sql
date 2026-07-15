-- ===========================================================================
-- customs_edi_verification.sql — Phase 7 Milestone 7F
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000060','authenticated','authenticated','csb@a.test'),
  ('99999999-1111-4111-8111-00000000b060','authenticated','authenticated','csb@b.test'),
  ('99999999-1111-4111-8111-00000000d060','authenticated','authenticated','csbstaff@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid; v_tb uuid;
begin
  v_t := app.bootstrap_tenant('csb-a', 'Csb A', 'CsbA');
  perform app.link_tenant_admin(v_t, '99999999-1111-4111-8111-000000000060',
          'csbadm', 'Csb Admin', 'csb@a.test');
  perform set_config('csb.tenant', v_t::text, false);

  v_tb := app.bootstrap_tenant('csb-b', 'Csb B', 'CsbB');
  perform app.link_tenant_admin(v_tb, '99999999-1111-4111-8111-00000000b060',
          'csbadmb', 'Csb Admin B', 'csb@b.test');
  perform set_config('csb.tenant_b', v_tb::text, false);
end $$;

do $$
begin
  if to_regclass('public.csb_exports') is null then
    raise exception 'FAIL [table] csb_exports';
  end if;
  if to_regclass('public.csb_export_logs') is null then
    raise exception 'FAIL [table] csb_export_logs';
  end if;
  if to_regprocedure('public.generate_csb_export(jsonb)') is null then
    raise exception 'FAIL [fn] generate_csb_export';
  end if;
  if to_regprocedure('public.download_csb_export(uuid)') is null then
    raise exception 'FAIL [fn] download_csb_export';
  end if;
  if to_regprocedure('public.list_csb_exports(text,integer)') is null then
    raise exception 'FAIL [fn] list_csb_exports';
  end if;
  if to_regprocedure('public.validate_csb_export(jsonb)') is null then
    raise exception 'FAIL [fn] validate_csb_export';
  end if;
  if to_regprocedure('public.test_customs_connection(uuid)') is null then
    raise exception 'FAIL [fn] test_customs_connection';
  end if;
  if not exists (
    select 1 from public.integration_providers
     where provider_type = 'CUSTOMS' and provider_code in ('CUSTOMS_EDI','ICEGATE_SANDBOX')
  ) then
    raise exception 'FAIL [providers] CUSTOMS not seeded';
  end if;
  raise notice 'PASS [structure]';
end $$;

do $$
declare
  v_t uuid := current_setting('csb.tenant')::uuid;
  v_branch uuid; v_uid uuid; v_gid uuid; v_prov uuid;
begin
  select id into v_branch from public.branches
   where tenant_id = v_t and deleted_at is null
   order by case when is_head_office then 0 else 1 end limit 1;

  insert into public.tenant_users (tenant_id, user_id, role, status)
  values (v_t, '99999999-1111-4111-8111-00000000d060', 'MEMBER', 'ACTIVE')
  on conflict (tenant_id, user_id) do update set status = 'ACTIVE';

  insert into public.users (
    tenant_id, auth_user_id, username, user_type, full_name, email, home_branch_id, status)
  values (
    v_t, '99999999-1111-4111-8111-00000000d060', 'csbstaff', 'STAFF',
    'Csb Staff', 'csbstaff@a.test', v_branch, 'ACTIVE')
  on conflict (auth_user_id) do update set deleted_at = null
  returning id into v_uid;

  select id into v_gid from public.user_groups
   where tenant_id = v_t and name = 'OPERATIONS' and deleted_at is null;
  insert into public.user_group_members (tenant_id, user_id, group_id)
  values (v_t, v_uid, v_gid) on conflict (user_id, group_id) do nothing;

  update public.group_permissions gp
     set can_add = false, can_modify = false, can_list = false, can_search = false,
         can_delete = false, all_access = false
    from public.permission_modules pm
   where gp.module_id = pm.id and gp.group_id = v_gid
     and pm.slug in ('rpt.edi-csb-files', 'txn.bagging', 'mst.vendor-master');

  select id into v_prov from public.integration_providers where provider_code = 'CUSTOMS_EDI';
  insert into public.integration_credentials (
    tenant_id, provider_id, username, password_enc, account_number, endpoint,
    sandbox_mode, is_active, remark, created_by, updated_by)
  values (
    v_t, v_prov, 'CHA001',
    app.encrypt_integration_secret('customs-secret'),
    'IEC1234567',
    '/exports/customs',
    true, true,
    'branch=BR01;port=INMAA1',
    '99999999-1111-4111-8111-000000000060',
    '99999999-1111-4111-8111-000000000060'
  )
  on conflict do nothing;

  raise notice 'PASS [seed]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000060';

-- Seed masters + shipment + bagging manifest
do $$
declare
  v_t uuid := current_setting('csb.tenant')::uuid;
  v_pt uuid;
  v_s public.shipments;
  v_m public.manifests;
  v_sc uuid;
begin
  insert into public.product_types (tenant_id, code, name)
  values (v_t, 'CSBPT', 'CSB Type') on conflict do nothing;
  select id into v_pt from public.product_types where tenant_id = v_t and code = 'CSBPT';

  insert into public.products (tenant_id, code, name, product_type_id, status)
  values (v_t, 'CSBPX', 'CSB Express', v_pt, 'ACTIVE') on conflict do nothing;

  insert into public.customers (tenant_id, code, name, mobile, status, iec_no)
  values (v_t, 'CSBCUST', 'CSB Client', '9111111111', 'ACTIVE', 'IEC1234567')
  on conflict do nothing;

  insert into public.destinations (tenant_id, code, name, status)
  values (v_t, 'HYD', 'Hyderabad', 'ACTIVE'),
         (v_t, 'DXB', 'Dubai', 'ACTIVE')
  on conflict do nothing;

  insert into public.service_centers (tenant_id, code, name, branch)
  values (v_t, 'CSBSC', 'CSB Centre', 'HO') on conflict do nothing;
  select id into v_sc from public.service_centers where tenant_id = v_t and code = 'CSBSC';

  v_s := public.save_shipment(
    null, null,
    jsonb_build_object(
      'product_code', 'CSBPX',
      'customer_code', 'CSBCUST',
      'origin_code', 'HYD',
      'destination_code', 'DXB',
      'book_date', current_date::text,
      'pieces', '1',
      'charge_weight', '1.250',
      'shipment_value', '500',
      'currency', 'USD',
      'consignee', jsonb_build_object('name', 'Buyer', 'country', 'AE'),
      'shipper', jsonb_build_object('name', 'Seller', 'iec_no', 'IEC1234567'),
      'wizard_extras', jsonb_build_object(
        'proforma', jsonb_build_object(
          'csbType', 'CSB-V',
          'lines', jsonb_build_array(jsonb_build_object('hsCode', '85171200', 'amount', 500))
        )
      )
    ),
    jsonb_build_array(jsonb_build_object('pieces','1','charge_weight','1.250')),
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
  );
  v_s := public.confirm_booking(v_s.id, v_s.row_version);

  v_m := public.save_manifest(
    null, null,
    jsonb_build_object(
      'manifest_date', current_date::text,
      'manifest_kind', 'BAGGING',
      'to_type', 'SERVICE_CENTER',
      'to_service_center_code', 'CSBSC',
      'master_awb_no', 'MAWB-CSB-001',
      'flight', 'EK500',
      'total_bags', 1
    ),
    jsonb_build_array(
      jsonb_build_object(
        'shipment_id', v_s.id,
        'bag_no', 'BAG1'
      )
    ),
    '[]'::jsonb, '[]'::jsonb
  );

  perform set_config('csb.ship', v_s.id::text, false);
  perform set_config('csb.manifest', v_m.id::text, false);
  raise notice 'PASS [shipment/manifest seed]';
end $$;

do $$
declare
  v_test jsonb;
  v_val jsonb;
  v_gen3 jsonb;
  v_gen4 jsonb;
  v_gen5 jsonb;
  v_dl jsonb;
  v_list jsonb;
  v_fail jsonb;
  v_cred jsonb;
  v_cnt int;
  v_mid uuid := current_setting('csb.manifest')::uuid;
  v_id uuid;
begin
  v_test := public.test_customs_connection(null);
  if coalesce((v_test->>'ok')::boolean, false) is not true then
    raise exception 'FAIL [test] %', v_test;
  end if;

  -- Validation failure: missing manifest
  v_fail := public.validate_csb_export(jsonb_build_object('export_type', 'CSB_III'));
  if coalesce((v_fail->>'ok')::boolean, true) is not false then
    raise exception 'FAIL [validate missing manifest] %', v_fail;
  end if;

  v_val := public.validate_csb_export(jsonb_build_object(
    'export_type', 'CSB_III',
    'manifest_id', v_mid
  ));
  if coalesce((v_val->>'ok')::boolean, false) is not true then
    raise exception 'FAIL [validate ok] %', v_val;
  end if;

  v_gen3 := public.generate_csb_export(jsonb_build_object(
    'export_type', 'CSB_III', 'manifest_id', v_mid));
  if coalesce((v_gen3->>'ok')::boolean, false) is not true then
    raise exception 'FAIL [CSB_III] %', v_gen3;
  end if;
  if coalesce(v_gen3->'export'->>'status', '') <> 'GENERATED' then
    raise exception 'FAIL [CSB_III status] %', v_gen3;
  end if;

  v_gen4 := public.generate_csb_export(jsonb_build_object(
    'export_type', 'CSB_IV', 'manifest_id', v_mid));
  if coalesce((v_gen4->>'ok')::boolean, false) is not true then
    raise exception 'FAIL [CSB_IV] %', v_gen4;
  end if;

  v_gen5 := public.generate_csb_export(jsonb_build_object(
    'export_type', 'CSB_V', 'manifest_id', v_mid));
  if coalesce((v_gen5->>'ok')::boolean, false) is not true then
    raise exception 'FAIL [CSB_V] %', v_gen5;
  end if;

  v_id := (v_gen3->'export'->>'id')::uuid;
  v_dl := public.download_csb_export(v_id);
  if coalesce((v_dl->>'ok')::boolean, false) is not true then
    raise exception 'FAIL [download] %', v_dl;
  end if;
  if coalesce(v_dl->'export'->>'status', '') <> 'DOWNLOADED' then
    raise exception 'FAIL [download status] %', v_dl;
  end if;
  if coalesce(v_dl->>'content', '') = '' then
    raise exception 'FAIL [download content]';
  end if;

  v_list := public.list_csb_exports(null, 20);
  if jsonb_array_length(coalesce(v_list->'rows', '[]'::jsonb)) < 3 then
    raise exception 'FAIL [list] %', v_list;
  end if;

  select count(*) into v_cnt from public.csb_export_logs
   where tenant_id = current_setting('csb.tenant')::uuid
     and operation in ('VALIDATE','GENERATE','DOWNLOAD','TEST');
  if v_cnt < 5 then
    raise exception 'FAIL [logs] count=%', v_cnt;
  end if;

  select count(*) into v_cnt from public.audit_logs
   where tenant_id = current_setting('csb.tenant')::uuid
     and (
       (new_values ? 'csb_generate')
       or (new_values ? 'csb_download')
       or (new_values->>'operation' = 'TEST')
     );
  if v_cnt < 2 then
    raise exception 'FAIL [audit] count=%', v_cnt;
  end if;

  -- Secret protection
  v_cred := public.get_integration_credentials(
    (select id from public.integration_credentials
      where tenant_id = current_setting('csb.tenant')::uuid and deleted_at is null
      order by created_at desc limit 1),
    null
  );
  if v_cred ? 'password' or v_cred ? 'api_secret' then
    raise exception 'FAIL [secret leak] %', v_cred;
  end if;

  raise notice 'PASS [connection / CSB-III/IV/V / validate / download / history / audit]';
end $$;

-- Validation failure: empty manifest stays DRAFT
do $$
declare
  v_empty public.manifests;
  v_fail jsonb;
begin
  v_empty := public.save_manifest(
    null, null,
    jsonb_build_object(
      'manifest_date', current_date::text,
      'manifest_kind', 'BAGGING',
      'to_type', 'SERVICE_CENTER',
      'to_service_center_code', 'CSBSC',
      'master_awb_no', 'MAWB-EMPTY'
    ),
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb
  );
  v_fail := public.generate_csb_export(jsonb_build_object(
    'export_type', 'CSB_IV', 'manifest_id', v_empty.id));
  if coalesce((v_fail->>'ok')::boolean, true) is not false then
    raise exception 'FAIL [empty validation] %', v_fail;
  end if;
  if coalesce(v_fail->'export'->>'status', '') <> 'DRAFT' then
    raise exception 'FAIL [empty stays DRAFT] %', v_fail;
  end if;
  raise notice 'PASS [validation failures]';
end $$;

-- Permissions
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000d060';
do $$
declare v_ok boolean := false;
begin
  begin
    perform public.generate_csb_export(jsonb_build_object(
      'export_type', 'CSB_III',
      'manifest_id', current_setting('csb.manifest')::uuid
    ));
  exception when others then
    v_ok := position('Permission denied' in SQLERRM) > 0 or SQLSTATE = '42501';
  end;
  if not v_ok then
    raise exception 'FAIL [permissions] staff should be denied';
  end if;
  raise notice 'PASS [permissions]';
end $$;

-- Tenant isolation
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000b060';
do $$
declare
  v_cnt int;
  v_foreign uuid;
begin
  select id into v_foreign from public.csb_exports
   where tenant_id = current_setting('csb.tenant')::uuid
   limit 1;

  begin
    perform public.download_csb_export(v_foreign);
    raise exception 'FAIL [tenant] cross-tenant download succeeded';
  exception when others then
    null;
  end;

  select count(*) into v_cnt from public.csb_export_logs
   where tenant_id = current_setting('csb.tenant')::uuid;
  if v_cnt <> 0 then
    raise exception 'FAIL [tenant logs leak] count=%', v_cnt;
  end if;

  raise notice 'PASS [tenant isolation]';
end $$;

do $$
begin
  raise notice '==========================================================';
  raise notice 'CUSTOMS EDI VERIFICATION PASSED.';
  raise notice '==========================================================';
end $$;

rollback;
