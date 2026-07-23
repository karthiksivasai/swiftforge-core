-- ===========================================================================
-- pickup_verification.sql — Phase 4 Milestone 2 (0031 pickups).
-- ---------------------------------------------------------------------------
-- Proves: pickups table + triggers/RLS; save_pickup numbering + status;
-- cancel/confirm/transfer guards; sales-executive lookup key.
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000031','authenticated','authenticated','pickup@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid;
begin
  v_t := app.bootstrap_tenant('pickup-a', 'Pickup Tenant A', 'PickA');
  perform app.link_tenant_admin(v_t, '99999999-1111-4111-8111-000000000031',
          'pickupadm', 'Pickup Admin', 'pickup@a.test');
  perform set_config('pk.tenant', v_t::text, false);
end $$;

do $$
begin
  if to_regclass('public.pickups') is null then
    raise exception 'FAIL [table]: pickups missing';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.pickups'::regclass) then
    raise exception 'FAIL [rls]: pickups';
  end if;
  if (select count(*) from pg_trigger where tgrelid = 'public.pickups'::regclass
        and tgname in ('trg_touch_pickups','trg_audit_pickups')) <> 2 then
    raise exception 'FAIL [triggers]: pickups';
  end if;
  if to_regprocedure('public.save_pickup(uuid,integer,jsonb)') is null then
    raise exception 'FAIL [fn]: save_pickup';
  end if;
  if to_regprocedure('public.cancel_pickup(uuid,integer,text)') is null then
    raise exception 'FAIL [fn]: cancel_pickup';
  end if;
  if to_regprocedure('public.confirm_pickup(uuid,integer)') is null then
    raise exception 'FAIL [fn]: confirm_pickup';
  end if;
  if to_regprocedure('public.transfer_pickups(date,uuid,uuid,text,text)') is null then
    raise exception 'FAIL [fn]: transfer_pickups';
  end if;
  raise notice 'PASS [structure]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000031';

-- seed masters needed for FKs
do $$
declare
  v_t uuid := current_setting('pk.tenant')::uuid;
  v_sc uuid;
  v_dest uuid;
  v_fe1 uuid;
  v_fe2 uuid;
begin
  select id into v_sc from public.branches where tenant_id = v_t and code = 'HO' limit 1;
  if v_sc is null then
    insert into public.branches (tenant_id, code, name, status, is_head_office)
    values (v_t, 'HO', 'Head Office', 'ACTIVE', true)
    returning id into v_sc;
  end if;
  perform set_config('pk.branch', v_sc::text, false);

  insert into public.zones (tenant_id, code, name) values (v_t, 'Z1', 'Zone 1')
  on conflict do nothing;
  insert into public.destinations (tenant_id, code, name, status)
  values (v_t, 'HYD', 'Hyderabad', 'ACTIVE')
  on conflict do nothing;
  select id into v_dest from public.destinations where tenant_id = v_t and code = 'HYD';

  insert into public.service_centers (tenant_id, code, name, branch)
  values (v_t, 'HYD', 'Hyderabad SC', 'HO')
  on conflict do nothing;

  insert into public.field_executives (
    tenant_id, code, name, mobile, service_center_id)
  select v_t, 'FE1', 'Ravi FE', '9000000001', sc.id
    from public.service_centers sc where sc.tenant_id = v_t and sc.code = 'HYD'
  on conflict do nothing;
  insert into public.field_executives (
    tenant_id, code, name, mobile, service_center_id)
  select v_t, 'FE2', 'Kiran FE', '9000000002', sc.id
    from public.service_centers sc where sc.tenant_id = v_t and sc.code = 'HYD'
  on conflict do nothing;

  select id into v_fe1 from public.field_executives where tenant_id = v_t and code = 'FE1';
  select id into v_fe2 from public.field_executives where tenant_id = v_t and code = 'FE2';
  perform set_config('pk.fe1', v_fe1::text, false);
  perform set_config('pk.fe2', v_fe2::text, false);
  perform set_config('pk.dest', v_dest::text, false);

  insert into public.sales_executives (tenant_id, code, name)
  values (v_t, 'SE1', 'Sales One')
  on conflict do nothing;

  insert into public.shippers (tenant_id, code, name, mobile, status)
  values (v_t, 'SH1', 'Acme Shipper', '9888888888', 'ACTIVE')
  on conflict do nothing;

  raise notice 'PASS [seed]';
end $$;

-- create pickup without FE -> OPEN, pickup_no = 1
do $$
declare
  v_p public.pickups;
begin
  v_p := public.save_pickup(null, null, jsonb_build_object(
    'mobile_no', '9876543210',
    'shipper_name', 'Walk-in Shipper',
    'branch_code', 'HO',
    'origin_code', 'HYD',
    'pickup_date', current_date::text,
    'pickup_time', '10:30',
    'pay_option', 'Cash',
    'vehicle_type', 'Bike'
  ));
  if v_p.pickup_no <> 1 then
    raise exception 'FAIL [create-no]: expected 1, got %', v_p.pickup_no;
  end if;
  if v_p.status <> 'OPEN' then
    raise exception 'FAIL [create-status]: expected OPEN, got %', v_p.status;
  end if;
  if v_p.vehicle_type <> 'BIKE' then
    raise exception 'FAIL [vehicle]: expected BIKE, got %', v_p.vehicle_type;
  end if;
  if v_p.user_id is distinct from 'pickupadm' then
    raise exception 'FAIL [user_id]: expected pickupadm, got %', v_p.user_id;
  end if;
  perform set_config('pk.id1', v_p.id::text, false);
  perform set_config('pk.rv1', v_p.row_version::text, false);
  raise notice 'PASS [create-open]';
end $$;

-- second pickup with FE -> ASSIGNED, pickup_no = 2
do $$
declare
  v_p public.pickups;
begin
  v_p := public.save_pickup(null, null, jsonb_build_object(
    'mobile_no', '9876543211',
    'shipper_code', 'SH1',
    'branch_code', 'HO',
    'field_executive_code', 'FE1',
    'sales_executive_code', 'SE1',
    'pickup_date', current_date::text
  ));
  if v_p.pickup_no <> 2 then
    raise exception 'FAIL [create2-no]: expected 2, got %', v_p.pickup_no;
  end if;
  if v_p.status <> 'ASSIGNED' then
    raise exception 'FAIL [create2-status]: expected ASSIGNED, got %', v_p.status;
  end if;
  if v_p.shipper_name is distinct from 'Acme Shipper' then
    raise exception 'FAIL [shipper-name]: %', v_p.shipper_name;
  end if;
  perform set_config('pk.id2', v_p.id::text, false);
  perform set_config('pk.rv2', v_p.row_version::text, false);
  raise notice 'PASS [create-assigned]';
end $$;

-- update OPEN pickup: assign FE -> ASSIGNED
do $$
declare
  v_p public.pickups;
  v_id uuid := current_setting('pk.id1')::uuid;
  v_rv integer := current_setting('pk.rv1')::integer;
begin
  v_p := public.save_pickup(v_id, v_rv, jsonb_build_object(
    'mobile_no', '9876543210',
    'shipper_name', 'Walk-in Shipper',
    'branch_code', 'HO',
    'field_executive_code', 'FE1',
    'pickup_date', current_date::text
  ));
  if v_p.status <> 'ASSIGNED' then
    raise exception 'FAIL [assign]: expected ASSIGNED, got %', v_p.status;
  end if;
  perform set_config('pk.rv1', v_p.row_version::text, false);
  raise notice 'PASS [assign-fe]';
end $$;

-- stale row_version -> 40001
do $$
declare
  v_id uuid := current_setting('pk.id1')::uuid;
begin
  begin
    perform public.save_pickup(v_id, 1, jsonb_build_object(
      'mobile_no', '9876543210',
      'shipper_name', 'X',
      'pickup_date', current_date::text
    ));
    raise exception 'FAIL [optlock]: should have raised 40001';
  exception when sqlstate '40001' then
    null;
  end;
  raise notice 'PASS [optlock]';
end $$;

-- transfer FE1 -> FE2 for today
do $$
declare
  v_cnt integer;
begin
  v_cnt := public.transfer_pickups(
    current_date,
    null, null,
    'FE1', 'FE2');
  if v_cnt < 1 then
    raise exception 'FAIL [transfer]: expected >=1, got %', v_cnt;
  end if;
  if exists (
    select 1 from public.pickups p
    join public.field_executives fe on fe.id = p.field_executive_id
    where p.tenant_id = current_setting('pk.tenant')::uuid
      and p.deleted_at is null
      and p.pickup_date = current_date
      and fe.code = 'FE1'
  ) then
    raise exception 'FAIL [transfer]: FE1 still assigned';
  end if;
  raise notice 'PASS [transfer]';
end $$;

-- cancel
do $$
declare
  v_p public.pickups;
  v_id uuid := current_setting('pk.id2')::uuid;
  v_rv integer;
begin
  select row_version into v_rv from public.pickups where id = v_id;
  v_p := public.cancel_pickup(v_id, v_rv, 'Customer cancelled');
  if v_p.status <> 'CANCELLED' then
    raise exception 'FAIL [cancel]: %', v_p.status;
  end if;
  raise notice 'PASS [cancel]';
end $$;

-- confirm rejected from ASSIGNED (only PICKED → CONFIRMED)
do $$
declare
  v_id uuid := current_setting('pk.id1')::uuid;
  v_rv integer;
begin
  select row_version into v_rv from public.pickups where id = v_id;
  begin
    perform public.confirm_pickup(v_id, v_rv);
    raise exception 'FAIL [confirm-guard]: should reject ASSIGNED -> CONFIRMED';
  exception when sqlstate 'CMS02' then
    null;
  end;
  raise notice 'PASS [confirm-guard]';
end $$;

-- force PICKED then confirm
do $$
declare
  v_p public.pickups;
  v_id uuid := current_setting('pk.id1')::uuid;
  v_rv integer;
begin
  update public.pickups set status = 'PICKED' where id = v_id
    returning row_version into v_rv;
  -- touch trigger bumps row_version on update
  select row_version into v_rv from public.pickups where id = v_id;
  v_p := public.confirm_pickup(v_id, v_rv);
  if v_p.status <> 'CONFIRMED' then
    raise exception 'FAIL [confirm]: %', v_p.status;
  end if;
  raise notice 'PASS [confirm]';
end $$;

-- sales-executive lookup
do $$
declare
  v_cnt integer;
begin
  select count(*) into v_cnt from public.lookup('sales-executive', 'SE');
  if v_cnt < 1 then
    raise exception 'FAIL [lookup]: sales-executive returned %', v_cnt;
  end if;
  raise notice 'PASS [lookup-sales-executive]';
end $$;

do $$
begin
  raise notice '==========================================================';
  raise notice 'PICKUP VERIFICATION PASSED.';
  raise notice '==========================================================';
end $$;

rollback;
