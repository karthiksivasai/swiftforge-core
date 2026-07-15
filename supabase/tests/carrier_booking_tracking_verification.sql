-- ===========================================================================
-- carrier_booking_tracking_verification.sql — Phase 7 Milestone 7B
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000056','authenticated','authenticated','car@a.test'),
  ('99999999-1111-4111-8111-00000000b056','authenticated','authenticated','car@b.test'),
  ('99999999-1111-4111-8111-00000000d056','authenticated','authenticated','carstaff@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid; v_tb uuid;
begin
  v_t := app.bootstrap_tenant('car-a', 'Car A', 'CarA');
  perform app.link_tenant_admin(v_t, '99999999-1111-4111-8111-000000000056',
          'caradm', 'Car Admin', 'car@a.test');
  perform set_config('cb.tenant', v_t::text, false);

  v_tb := app.bootstrap_tenant('car-b', 'Car B', 'CarB');
  perform app.link_tenant_admin(v_tb, '99999999-1111-4111-8111-00000000b056',
          'caradmb', 'Car Admin B', 'car@b.test');
  perform set_config('cb.tenant_b', v_tb::text, false);
end $$;

do $$
begin
  if to_regprocedure('public.book_shipment_carrier(uuid,integer,text)') is null then
    raise exception 'FAIL [fn] book';
  end if;
  if to_regprocedure('public.cancel_shipment_carrier(uuid,integer)') is null then
    raise exception 'FAIL [fn] cancel';
  end if;
  if to_regprocedure('public.refresh_shipment_carrier_tracking(uuid,integer)') is null then
    raise exception 'FAIL [fn] track';
  end if;
  if to_regprocedure('public.get_shipment_carrier_label(uuid,integer)') is null then
    raise exception 'FAIL [fn] label';
  end if;
  if to_regprocedure('public.check_carrier_serviceability(text,text,text)') is null then
    raise exception 'FAIL [fn] serviceability';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='shipments' and column_name='carrier_booking_ref'
  ) then raise exception 'FAIL [col] carrier_booking_ref'; end if;
  raise notice 'PASS [structure]';
end $$;

do $$
declare
  v_t uuid := current_setting('cb.tenant')::uuid;
  v_branch uuid; v_uid uuid; v_gid uuid;
  v_pt uuid; v_prod uuid; v_cust uuid; v_orig uuid; v_dest uuid;
  v_vendor uuid; v_zone uuid;
begin
  select id into v_branch from public.branches
   where tenant_id = v_t and deleted_at is null
   order by case when is_head_office then 0 else 1 end limit 1;

  insert into public.product_types (tenant_id, code, name)
  values (v_t, 'PT1', 'Express Type') on conflict do nothing;
  select id into v_pt from public.product_types where tenant_id = v_t and code = 'PT1';

  insert into public.products (tenant_id, code, name, product_type_id, status)
  values (v_t, 'SPX', 'Express', v_pt, 'ACTIVE') on conflict do nothing;
  select id into v_prod from public.products where tenant_id = v_t and code = 'SPX';

  insert into public.customers (tenant_id, code, name, mobile, status)
  values (v_t, 'CUST1', 'Client One', '9000000056', 'ACTIVE') on conflict do nothing;
  select id into v_cust from public.customers where tenant_id = v_t and code = 'CUST1';

  insert into public.destinations (tenant_id, code, name, status)
  values (v_t, 'HYD', 'Hyderabad', 'ACTIVE'), (v_t, 'BLR', 'Bangalore', 'ACTIVE')
  on conflict do nothing;
  select id into v_orig from public.destinations where tenant_id = v_t and code = 'HYD';
  select id into v_dest from public.destinations where tenant_id = v_t and code = 'BLR';

  insert into public.zones (tenant_id, code, name)
  values (v_t, 'Z1', 'Zone 1') on conflict do nothing;
  select id into v_zone from public.zones where tenant_id = v_t and code = 'Z1';

  insert into public.vendors (tenant_id, code, name, mobile, status)
  values (v_t, 'FEDEX', 'FedEx Vendor', '9000000057', 'ACTIVE')
  on conflict do nothing;
  select id into v_vendor from public.vendors where tenant_id = v_t and code = 'FEDEX';

  insert into public.service_mappings (
    tenant_id, vendor_id, service, vendor_link, status)
  values (v_t, v_vendor, 'EXPRESS', 'FEDEX', 'ACTIVE')
  on conflict do nothing;

  insert into public.pincodes (
    tenant_id, pin_code, pin_name, branch_id, destination_id, zone_id, is_serviceable)
  values
    (v_t, '500001', 'Hyd', v_branch, v_orig, v_zone, true),
    (v_t, '560001', 'Blr', v_branch, v_dest, v_zone, true),
    (v_t, '560099', 'Bad', v_branch, v_dest, v_zone, false)
  on conflict do nothing;

  -- Active FEDEX credentials
  perform set_config('request.jwt.claim.sub', '99999999-1111-4111-8111-000000000056', true);
  -- credentials saved under authenticated later

  insert into public.tenant_users (tenant_id, user_id, role, status)
  values (v_t, '99999999-1111-4111-8111-00000000d056', 'MEMBER', 'ACTIVE')
  on conflict (tenant_id, user_id) do update set status = 'ACTIVE';

  insert into public.users (
    tenant_id, auth_user_id, username, user_type, full_name, email, home_branch_id, status)
  values (
    v_t, '99999999-1111-4111-8111-00000000d056', 'carstaff', 'STAFF',
    'Car Staff', 'carstaff@a.test', v_branch, 'ACTIVE')
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
     and pm.slug in ('txn.awb-entry', 'txn.awb-query');

  perform set_config('cb.vendor', v_vendor::text, false);
  raise notice 'PASS [seed]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000056';

do $$
declare
  v_cred jsonb;
  v_s public.shipments;
  v_book jsonb; v_track jsonb; v_label jsonb; v_svc jsonb; v_cancel jsonb;
  v_rv int;
begin
  -- Credentials required
  begin
    perform public.book_shipment_carrier(
      '00000000-0000-4000-8000-000000000001'::uuid, 1, 'FEDEX');
    raise exception 'FAIL [cred missing expected]';
  exception when sqlstate 'P0002' then null;
           when sqlstate 'CMS04' then null;
  end;

  v_cred := public.save_integration_credentials(jsonb_build_object(
    'provider_code', 'FEDEX',
    'api_key', 'fx-key',
    'api_secret', 'fx-sec',
    'sandbox_mode', true,
    'is_active', true));
  if v_cred->>'provider_code' <> 'FEDEX' then raise exception 'FAIL [cred save]'; end if;

  -- Create + confirm shipment
  v_s := public.save_shipment(
    null, null,
    jsonb_build_object(
      'customer_code', 'CUST1',
      'product_code', 'SPX',
      'vendor_code', 'FEDEX',
      'origin_code', 'HYD',
      'destination_code', 'BLR',
      'service', 'EXPRESS',
      'book_date', current_date::text,
      'pieces', '1',
      'actual_weight', '1',
      'charge_weight', '1',
      'branch_code', 'HO',
      'consignee', jsonb_build_object('name','Test Consignee','mobile','9000000000')
    ),
    jsonb_build_array(jsonb_build_object('pieces','1','actual_weight_per_pc','1','charge_weight','1')),
    '[]'::jsonb);

  v_s := public.confirm_booking(v_s.id, v_s.row_version);
  if v_s.current_status <> 'BOOKED' then raise exception 'FAIL [confirm]'; end if;

  -- Book with carrier
  v_book := public.book_shipment_carrier(v_s.id, v_s.row_version, null);
  if v_book->>'provider_code' <> 'FEDEX' then raise exception 'FAIL [book provider]'; end if;
  if nullif(v_book->>'booking_ref','') is null then raise exception 'FAIL [booking ref]'; end if;
  if nullif(v_book->>'tracking_no','') is null then raise exception 'FAIL [tracking]'; end if;
  v_rv := (v_book->>'row_version')::int;

  if not exists (
    select 1 from public.integration_logs
     where shipment_id = v_s.id and operation = 'BOOK' and status = 'SUCCESS'
  ) then raise exception 'FAIL [book log]'; end if;

  if not exists (
    select 1 from public.tracking_events
     where shipment_id = v_s.id and source = 'CARRIER_API'
  ) then raise exception 'FAIL [book event]'; end if;

  if not exists (
    select 1 from public.audit_logs
     where entity_id = v_s.id and entity_type = 'shipments'
       and new_values ? 'carrier_book'
  ) then raise exception 'FAIL [book audit]'; end if;

  -- Optimistic lock
  begin
    perform public.book_shipment_carrier(v_s.id, 1, 'FEDEX');
    raise exception 'FAIL [opt lock]';
  exception when sqlstate 'CMS04' then null;
  end;

  -- Tracking refresh
  v_track := public.refresh_shipment_carrier_tracking(v_s.id, v_rv);
  if v_track->>'provider_code' <> 'FEDEX' then raise exception 'FAIL [track]'; end if;
  v_rv := (v_track->>'row_version')::int;
  if not exists (
    select 1 from public.integration_logs
     where shipment_id = v_s.id and operation = 'TRACK' and status = 'SUCCESS'
  ) then raise exception 'FAIL [track log]'; end if;

  -- Label
  v_label := public.get_shipment_carrier_label(v_s.id, v_rv);
  if v_label->>'file_id' is null then raise exception 'FAIL [label file]'; end if;
  v_rv := (v_label->>'row_version')::int;
  if not exists (
    select 1 from public.files f
     where f.id = (v_label->>'file_id')::uuid and f.owner_type = 'SHIPMENT'
  ) then raise exception 'FAIL [label meta]'; end if;

  -- Serviceability
  v_svc := public.check_carrier_serviceability('FEDEX', '500001', '560001');
  if (v_svc->>'serviceable')::boolean is not true then raise exception 'FAIL [svc ok]'; end if;
  v_svc := public.check_carrier_serviceability('FEDEX', '500001', '560099');
  if (v_svc->>'serviceable')::boolean is not false then raise exception 'FAIL [svc bad]'; end if;

  -- Cancel
  v_cancel := public.cancel_shipment_carrier(v_s.id, v_rv);
  if v_cancel->>'carrier_booking_status' <> 'CANCELLED' then
    raise exception 'FAIL [cancel]';
  end if;
  if not exists (
    select 1 from public.integration_logs
     where shipment_id = v_s.id and operation = 'CANCEL' and status = 'SUCCESS'
  ) then raise exception 'FAIL [cancel log]'; end if;

  -- Credential lookup: DHL without creds fails
  begin
    perform public.check_carrier_serviceability('DHL', '500001', '560001');
    raise exception 'FAIL [dhl creds]';
  exception when sqlstate 'CMS04' then null;
  end;

  raise notice 'PASS [booking / cancel / track / label / serviceability / logs / audit / opt-lock]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000d056';
do $$
declare v_id uuid;
begin
  select id into v_id from public.shipments
   where tenant_id = current_setting('cb.tenant')::uuid and deleted_at is null
   limit 1;
  begin
    perform public.refresh_shipment_carrier_tracking(v_id, null);
    raise exception 'FAIL [perm]';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'PASS [permissions]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000b056';
do $$
declare v_id uuid;
begin
  select id into v_id from public.shipments
   where tenant_id = current_setting('cb.tenant')::uuid and deleted_at is null
   limit 1;
  begin
    perform public.refresh_shipment_carrier_tracking(v_id, null);
    raise exception 'FAIL [tenant]';
  exception when sqlstate 'P0002' then null;
           when sqlstate '42501' then null;
  end;
  raise notice 'PASS [tenant isolation]';
end $$;

reset role;
do $$
begin
  raise notice '==========================================================';
  raise notice 'CARRIER BOOKING / TRACKING VERIFICATION PASSED.';
  raise notice '==========================================================';
end $$;

rollback;
