-- ===========================================================================
-- shipment_booking_verification.sql — Phase 4 Milestone 3B (0033).
-- ---------------------------------------------------------------------------
-- Proves: booking validation, confirm_booking, optlock, pickup ASSIGNED→PICKED,
-- append-only events, audit, permission enforcement, immutable BOOKED.
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000033','authenticated','authenticated','book@a.test'),
  ('99999999-1111-4111-8111-00000000c033','authenticated','authenticated','bookstaff@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid;
begin
  v_t := app.bootstrap_tenant('book-a', 'Booking Tenant A', 'BookA');
  perform app.link_tenant_admin(v_t, '99999999-1111-4111-8111-000000000033',
          'bookadm', 'Booking Admin', 'book@a.test');
  perform set_config('bk.tenant', v_t::text, false);
end $$;

do $$
begin
  if to_regprocedure('public.confirm_booking(uuid,integer)') is null then
    raise exception 'FAIL [fn]: confirm_booking';
  end if;
  if to_regprocedure('public.validate_shipment_booking(uuid)') is null then
    raise exception 'FAIL [fn]: validate_shipment_booking';
  end if;
  if to_regprocedure('app.validate_shipment_for_booking(public.shipments)') is null then
    raise exception 'FAIL [fn]: validate_shipment_for_booking';
  end if;
  raise notice 'PASS [structure]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000033';

-- seed masters + FE for ASSIGNED pickup
do $$
declare
  v_t uuid := current_setting('bk.tenant')::uuid;
  v_pt uuid;
  v_sc uuid;
  v_fe uuid;
  v_branch uuid;
begin
  select id into v_branch from public.branches
   where tenant_id = v_t and deleted_at is null
   order by case when is_head_office then 0 else 1 end limit 1;

  insert into public.product_types (tenant_id, code, name)
  values (v_t, 'PT1', 'Express Type') on conflict do nothing;
  select id into v_pt from public.product_types where tenant_id = v_t and code = 'PT1';

  insert into public.products (tenant_id, code, name, product_type_id, status)
  values (v_t, 'SPX', 'Express', v_pt, 'ACTIVE') on conflict do nothing;

  insert into public.customers (tenant_id, code, name, mobile, status)
  values (v_t, 'CUST1', 'Client One', '9000000001', 'ACTIVE') on conflict do nothing;

  insert into public.destinations (tenant_id, code, name, status)
  values (v_t, 'HYD', 'Hyderabad', 'ACTIVE'),
         (v_t, 'BLR', 'Bangalore', 'ACTIVE')
  on conflict do nothing;

  insert into public.zones (tenant_id, code, name)
  values (v_t, 'Z1', 'Zone 1') on conflict do nothing;

  insert into public.service_centers (tenant_id, code, name, branch)
  values (v_t, 'HYD', 'Hyderabad SC', 'HO') on conflict do nothing;

  insert into public.field_executives (
    tenant_id, code, name, mobile, service_center_id)
  select v_t, 'FE1', 'Ravi FE', '9000000001', sc.id
    from public.service_centers sc where sc.tenant_id = v_t and sc.code = 'HYD'
  on conflict do nothing;

  select id into v_fe from public.field_executives where tenant_id = v_t and code = 'FE1';
  perform set_config('bk.fe', v_fe::text, false);
  perform set_config('bk.branch', coalesce(v_branch::text, ''), false);
  raise notice 'PASS [seed]';
end $$;

-- invalid booking: missing pieces / origin / destination rejected (CMS04)
do $$
declare
  v_s public.shipments;
  v_rv integer;
  v_chk jsonb;
begin
  v_s := public.save_shipment(
    null, null,
    jsonb_build_object(
      'customer_code', 'CUST1',
      'product_code', 'SPX',
      'book_date', current_date::text,
      'pieces', '0'
    ),
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb);

  v_chk := public.validate_shipment_booking(v_s.id);
  if (v_chk->>'ok')::boolean then
    raise exception 'FAIL [validate-precheck]: expected errors';
  end if;
  if jsonb_array_length(v_chk->'errors') < 1 then
    raise exception 'FAIL [validate-errors]: empty';
  end if;

  select row_version into v_rv from public.shipments where id = v_s.id;
  begin
    perform public.confirm_booking(v_s.id, v_rv);
    raise exception 'FAIL [invalid-book]: should reject';
  exception when sqlstate 'CMS04' then null;
  end;

  if (select current_status from public.shipments where id = v_s.id) <> 'DRAFT' then
    raise exception 'FAIL [invalid-book-status]';
  end if;
  perform set_config('bk.invalid_id', v_s.id::text, false);
  raise notice 'PASS [invalid-booking-rejection]';
end $$;

-- create ASSIGNED pickup then book shipment with pickup_id
do $$
declare
  v_p public.pickups;
  v_s public.shipments;
  v_ev int;
  v_audit int;
  v_t uuid := current_setting('bk.tenant')::uuid;
begin
  v_p := public.save_pickup(null, null, jsonb_build_object(
    'mobile_no', '9876543210',
    'shipper_name', 'Walk-in',
    'origin_code', 'HYD',
    'pickup_date', current_date::text,
    'field_executive_code', 'FE1'
  ));
  if v_p.status <> 'ASSIGNED' then
    raise exception 'FAIL [pickup-status]: %', v_p.status;
  end if;

  v_s := public.save_shipment(
    null, null,
    jsonb_build_object(
      'customer_code', 'CUST1',
      'product_code', 'SPX',
      'origin_code', 'HYD',
      'destination_code', 'BLR',
      'book_date', current_date::text,
      'pieces', '1',
      'pickup_id', v_p.id::text,
      'shipper', jsonb_build_object('name','Ship A'),
      'consignee', jsonb_build_object('name','Cons B')
    ),
    jsonb_build_array(
      jsonb_build_object('pieces','1','actual_weight_per_pc','1.0','charge_weight','1.0')
    ),
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb);

  if v_s.pickup_id is distinct from v_p.id then
    raise exception 'FAIL [pickup-link-save]';
  end if;

  v_s := public.confirm_booking(v_s.id, v_s.row_version);
  if v_s.current_status <> 'BOOKED' then
    raise exception 'FAIL [book-status]: %', v_s.current_status;
  end if;
  if v_s.booked_at is null then
    raise exception 'FAIL [booked-at]';
  end if;

  select status, awb_id, awb_no into v_p.status, v_p.awb_id, v_p.awb_no
    from public.pickups where id = v_p.id;
  if v_p.status <> 'PICKED' then
    raise exception 'FAIL [pickup-picked]: %', v_p.status;
  end if;
  if v_p.awb_id is distinct from v_s.id then
    raise exception 'FAIL [pickup-awb-id]';
  end if;
  if v_p.awb_no is distinct from v_s.awb_no then
    raise exception 'FAIL [pickup-awb-no]';
  end if;

  select count(*) into v_ev from public.shipment_events
   where shipment_id = v_s.id and event_type = 'BOOKED';
  if v_ev <> 1 then raise exception 'FAIL [event-booked]: %', v_ev; end if;

  select count(*) into v_audit from public.audit_logs
   where tenant_id = v_t and entity_type = 'shipments' and entity_id = v_s.id
     and action = 'MODIFY' and module_slug = 'txn.awb-entry'
     and (new_values->>'status') = 'BOOKED';
  if v_audit < 1 then raise exception 'FAIL [audit-booked]'; end if;

  -- immutable BOOKED
  begin
    perform public.save_shipment(v_s.id, v_s.row_version,
      jsonb_build_object(
        'customer_code','CUST1','product_code','SPX',
        'origin_code','HYD','destination_code','BLR',
        'book_date', current_date::text, 'pieces','1'
      ),
      jsonb_build_array(jsonb_build_object('pieces','1','charge_weight','1')),
      '[]'::jsonb,'[]'::jsonb,'[]'::jsonb);
    raise exception 'FAIL [immutable-booked]';
  exception when sqlstate 'CMS02' then null;
  end;

  perform set_config('bk.id', v_s.id::text, false);
  perform set_config('bk.rv', v_s.row_version::text, false);
  perform set_config('bk.pickup', v_p.id::text, false);
  raise notice 'PASS [booking-transition + pickup-linkage + audit + immutable]';
end $$;

-- optimistic locking on confirm
do $$
declare
  v_s public.shipments;
  v_id uuid;
begin
  v_s := public.save_shipment(
    null, null,
    jsonb_build_object(
      'customer_code','CUST1','product_code','SPX',
      'origin_code','HYD','destination_code','BLR',
      'book_date', current_date::text, 'pieces','1'
    ),
    jsonb_build_array(jsonb_build_object('pieces','1','charge_weight','1')),
    '[]'::jsonb,'[]'::jsonb,'[]'::jsonb);
  v_id := v_s.id;
  begin
    perform public.confirm_booking(v_id, 999);
    raise exception 'FAIL [optlock-confirm]';
  exception when sqlstate '40001' then null;
  end;
  if (select current_status from public.shipments where id = v_id) <> 'DRAFT' then
    raise exception 'FAIL [optlock-status]';
  end if;
  raise notice 'PASS [optimistic-locking]';
end $$;

-- cancel BOOKED + events append-only
do $$
declare
  v_id uuid := current_setting('bk.id')::uuid;
  v_rv integer := current_setting('bk.rv')::integer;
  v_s public.shipments;
  v_eid uuid;
  v_text text;
  v_cnt integer;
begin
  v_s := public.cancel_shipment(v_id, v_rv, 'booking test cancel');
  if v_s.current_status <> 'CANCELLED' then
    raise exception 'FAIL [cancel-booked]: %', v_s.current_status;
  end if;
  if not exists (
    select 1 from public.shipment_events
     where shipment_id = v_id and event_type = 'CANCELLED'
  ) then raise exception 'FAIL [event-cancelled]'; end if;

  select id, event_text into v_eid, v_text from public.shipment_events
   where shipment_id = v_id and event_type = 'BOOKED' limit 1;

  begin
    update public.shipment_events set event_text = 'mutated' where id = v_eid;
    if (select event_text from public.shipment_events where id = v_eid) is not distinct from 'mutated' then
      raise exception 'FAIL [append-only-update]';
    end if;
  exception when sqlstate '0A000' then null;
  end;

  begin
    delete from public.shipment_events where id = v_eid;
    select count(*) into v_cnt from public.shipment_events where id = v_eid;
    if v_cnt = 0 then raise exception 'FAIL [append-only-delete]'; end if;
  exception when sqlstate '0A000' then null;
  end;

  if (select event_text from public.shipment_events where id = v_eid) is distinct from v_text then
    raise exception 'FAIL [append-only]: event mutated';
  end if;
  raise notice 'PASS [cancel + append-only-events]';
end $$;

-- permission enforcement: OPERATIONS staff without modify cannot confirm
-- (create staff as admin, then switch JWT)
do $$
declare
  v_t uuid := current_setting('bk.tenant')::uuid;
  v_s public.shipments;
  v_uid uuid;
  v_gid uuid;
  v_branch uuid;
begin
  v_s := public.save_shipment(
    null, null,
    jsonb_build_object(
      'customer_code','CUST1','product_code','SPX',
      'origin_code','HYD','destination_code','BLR',
      'book_date', current_date::text, 'pieces','1'
    ),
    jsonb_build_array(jsonb_build_object('pieces','1','charge_weight','1')),
    '[]'::jsonb,'[]'::jsonb,'[]'::jsonb);
  perform set_config('bk.perm_id', v_s.id::text, false);
  perform set_config('bk.perm_rv', v_s.row_version::text, false);

  select id into v_branch from public.branches
   where tenant_id = v_t and deleted_at is null limit 1;

  insert into public.users (
    tenant_id, auth_user_id, username, user_type, full_name, email, home_branch_id, status)
  values (
    v_t, '99999999-1111-4111-8111-00000000c033', 'bookstaff', 'STAFF',
    'Book Staff', 'bookstaff@a.test', v_branch, 'ACTIVE')
  on conflict (auth_user_id) do update set deleted_at = null
  returning id into v_uid;

  select id into v_gid from public.user_groups
   where tenant_id = v_t and name = 'OPERATIONS' and deleted_at is null;

  insert into public.user_group_members (tenant_id, user_id, group_id)
  values (v_t, v_uid, v_gid)
  on conflict (user_id, group_id) do nothing;

  update public.group_permissions gp
     set can_modify = false, can_add = false, all_access = false
    from public.permission_modules pm
   where gp.module_id = pm.id
     and gp.group_id = v_gid
     and pm.slug = 'txn.awb-entry';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000c033';
do $$
declare
  v_t uuid := current_setting('bk.tenant')::uuid;
  v_id uuid := current_setting('bk.perm_id')::uuid;
  v_rv integer := current_setting('bk.perm_rv')::integer;
begin
  if app.user_has_permission(v_t, 'txn.awb-entry', 'modify') then
    raise exception 'FAIL [perm-setup]: staff still has modify';
  end if;

  begin
    perform public.confirm_booking(v_id, v_rv);
    raise exception 'FAIL [perm-confirm]: staff confirmed booking';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'PASS [permission-enforcement]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000033';
do $$
declare
  v_id uuid := current_setting('bk.perm_id')::uuid;
begin
  if (select current_status from public.shipments where id = v_id) <> 'DRAFT' then
    raise exception 'FAIL [perm-status]';
  end if;
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000033';

do $$
begin
  raise notice '==========================================================';
  raise notice 'SHIPMENT BOOKING VERIFICATION PASSED.';
  raise notice '==========================================================';
end $$;

rollback;
