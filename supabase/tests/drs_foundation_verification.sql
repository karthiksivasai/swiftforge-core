-- ===========================================================================
-- drs_foundation_verification.sql — Phase 4 Milestone 4C (0036).
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000036','authenticated','authenticated','drs@a.test'),
  ('99999999-1111-4111-8111-00000000b036','authenticated','authenticated','drs@b.test')
on conflict (id) do nothing;

do $$
declare v_t uuid; v_tb uuid;
begin
  v_t := app.bootstrap_tenant('drs-a', 'DRS Tenant A', 'DrA');
  perform app.link_tenant_admin(v_t, '99999999-1111-4111-8111-000000000036',
          'drsadm', 'DRS Admin', 'drs@a.test');
  perform set_config('drs.tenant', v_t::text, false);

  v_tb := app.bootstrap_tenant('drs-b', 'DRS Tenant B', 'DrB');
  perform app.link_tenant_admin(v_tb, '99999999-1111-4111-8111-00000000b036',
          'drsadmb', 'DRS Admin B', 'drs@b.test');
  perform set_config('drs.tenant_b', v_tb::text, false);
end $$;

do $$
begin
  if to_regclass('public.drs') is null then raise exception 'FAIL [table]: drs'; end if;
  if to_regclass('public.drs_lines') is null then raise exception 'FAIL [table]: lines'; end if;
  if to_regclass('public.drs_events') is null then raise exception 'FAIL [table]: events'; end if;
  if to_regprocedure('public.save_drs(uuid,integer,jsonb,jsonb)') is null then
    raise exception 'FAIL [fn]: save_drs';
  end if;
  if to_regprocedure('public.dispatch_drs(uuid,integer)') is null then
    raise exception 'FAIL [fn]: dispatch_drs';
  end if;
  if to_regprocedure('public.cancel_drs(uuid,integer,text)') is null then
    raise exception 'FAIL [fn]: cancel_drs';
  end if;
  if not app.status_transition_allowed('DRS','DRAFT','DISPATCHED') then
    raise exception 'FAIL [status]: DRAFT->DISPATCHED';
  end if;
  if not app.status_transition_allowed('SHIPMENT','MANIFEST_INSCANNED','OUT_FOR_DELIVERY') then
    raise exception 'FAIL [status]: MANIFEST_INSCANNED->OUT_FOR_DELIVERY';
  end if;
  raise notice 'PASS [structure]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000036';

-- seed masters + MANIFEST_INSCANNED shipments via book→manifest→inscan
do $$
declare
  v_t uuid := current_setting('drs.tenant')::uuid;
  v_pt uuid;
  v_s public.shipments;
  v_m public.manifests;
  v_res jsonb;
  v_fe uuid;
begin
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

  insert into public.service_centers (tenant_id, code, name, branch)
  values (v_t, 'BLR', 'Bangalore SC', 'HO') on conflict do nothing;

  insert into public.field_executives (tenant_id, code, name, mobile, service_center_id)
  select v_t, 'FE1', 'Rider One', '9000000099', sc.id
    from public.service_centers sc
   where sc.tenant_id = v_t and sc.code = 'BLR'
  on conflict do nothing;
  select id into v_fe from public.field_executives where tenant_id = v_t and code = 'FE1';
  perform set_config('drs.fe', v_fe::text, false);

  -- ship1 booked → manifested → inscanned
  v_s := public.save_shipment(
    null, null,
    jsonb_build_object(
      'customer_code','CUST1','product_code','SPX',
      'origin_code','HYD','destination_code','BLR',
      'book_date', current_date::text, 'pieces','1'
    ),
    jsonb_build_array(jsonb_build_object('pieces','1','charge_weight','1')),
    '[]'::jsonb,'[]'::jsonb,'[]'::jsonb);
  v_s := public.confirm_booking(v_s.id, v_s.row_version);
  perform set_config('drs.ship1', v_s.id::text, false);
  perform set_config('drs.awb1', v_s.awb_no, false);

  v_s := public.save_shipment(
    null, null,
    jsonb_build_object(
      'customer_code','CUST1','product_code','SPX',
      'origin_code','HYD','destination_code','BLR',
      'book_date', current_date::text, 'pieces','1'
    ),
    jsonb_build_array(jsonb_build_object('pieces','1','charge_weight','2')),
    '[]'::jsonb,'[]'::jsonb,'[]'::jsonb);
  v_s := public.confirm_booking(v_s.id, v_s.row_version);
  perform set_config('drs.ship2', v_s.id::text, false);
  perform set_config('drs.awb2', v_s.awb_no, false);

  -- BOOKED only (ineligible for DRS)
  v_s := public.save_shipment(
    null, null,
    jsonb_build_object(
      'customer_code','CUST1','product_code','SPX',
      'origin_code','HYD','destination_code','BLR',
      'book_date', current_date::text, 'pieces','1'
    ),
    jsonb_build_array(jsonb_build_object('pieces','1','charge_weight','1')),
    '[]'::jsonb,'[]'::jsonb,'[]'::jsonb);
  v_s := public.confirm_booking(v_s.id, v_s.row_version);
  perform set_config('drs.booked', v_s.id::text, false);

  v_m := public.save_manifest(
    null, null,
    jsonb_build_object(
      'manifest_date', current_date::text,
      'to_type', 'SERVICE_CENTER',
      'to_service_center_code', 'BLR'
    ),
    jsonb_build_array(
      jsonb_build_object('shipment_id', current_setting('drs.ship1')),
      jsonb_build_object('shipment_id', current_setting('drs.ship2'))
    ),
    '[]'::jsonb, '[]'::jsonb);
  v_m := public.close_manifest(v_m.id, v_m.row_version);

  v_res := public.scan_manifest(v_m.id, current_setting('drs.awb1'), null, null, 'AWB');
  if coalesce((v_res->>'ok')::boolean,false) is not true then
    raise exception 'FAIL [seed-inscan1]: %', v_res;
  end if;
  v_res := public.scan_manifest(v_m.id, current_setting('drs.awb2'), null, null, 'AWB');
  if coalesce((v_res->>'ok')::boolean,false) is not true then
    raise exception 'FAIL [seed-inscan2]: %', v_res;
  end if;

  raise notice 'PASS [seed]';
end $$;

-- create DRAFT + numbering
do $$
declare
  v_d public.drs;
  v_no1 text;
  v_lc int;
begin
  v_d := public.save_drs(
    null, null,
    jsonb_build_object(
      'drs_date', current_date::text,
      'drs_time', '14:30',
      'delivery_executive_code', 'FE1',
      'area_code', 'HYD',
      'area_name', 'Hyderabad',
      'area_seq', '1',
      'vehicle_no', 'TS09AB1234',
      'remarks', 'Morning run'
    ),
    jsonb_build_array(
      jsonb_build_object('shipment_id', current_setting('drs.ship1'))
    )
  );
  if v_d.status <> 'DRAFT' then raise exception 'FAIL [create-status]: %', v_d.status; end if;
  if v_d.drs_no is null or v_d.drs_no = '' then raise exception 'FAIL [no]'; end if;
  v_no1 := v_d.drs_no;
  select count(*) into v_lc from public.drs_lines where drs_id = v_d.id;
  if v_lc <> 1 then raise exception 'FAIL [lines]: %', v_lc; end if;
  perform set_config('drs.id1', v_d.id::text, false);
  perform set_config('drs.rv1', v_d.row_version::text, false);
  perform set_config('drs.no1', v_no1, false);
  raise notice 'PASS [create-draft] no=%', v_no1;
end $$;

-- gapless numbering
do $$
declare
  v_d public.drs;
begin
  v_d := public.save_drs(
    null, null,
    jsonb_build_object('drs_date', current_date::text, 'delivery_executive_code', 'FE1'),
    '[]'::jsonb);
  if v_d.drs_no = current_setting('drs.no1') then raise exception 'FAIL [gapless]'; end if;
  perform set_config('drs.id2', v_d.id::text, false);
  perform set_config('drs.rv2', v_d.row_version::text, false);
  raise notice 'PASS [numbering-gapless]';
end $$;

-- reject BOOKED shipment
do $$
declare
  v_id uuid := current_setting('drs.id2')::uuid;
  v_rv integer;
begin
  select row_version into v_rv from public.drs where id = v_id;
  begin
    perform public.save_drs(
      v_id, v_rv,
      jsonb_build_object('drs_date', current_date::text, 'delivery_executive_code', 'FE1'),
      jsonb_build_array(jsonb_build_object('shipment_id', current_setting('drs.booked'))));
    raise exception 'FAIL [booked-line]';
  exception when sqlstate 'CMS04' then null;
  end;
  raise notice 'PASS [reject-not-inscanned]';
end $$;

-- reject duplicate on another active DRS
do $$
declare
  v_id uuid := current_setting('drs.id2')::uuid;
  v_rv integer;
begin
  select row_version into v_rv from public.drs where id = v_id;
  begin
    perform public.save_drs(
      v_id, v_rv,
      jsonb_build_object('drs_date', current_date::text, 'delivery_executive_code', 'FE1'),
      jsonb_build_array(jsonb_build_object('shipment_id', current_setting('drs.ship1'))));
    raise exception 'FAIL [dup-active]';
  exception when sqlstate 'CMS04' then null;
  end;
  raise notice 'PASS [reject-duplicate-active]';
end $$;

-- optimistic lock
do $$
begin
  begin
    perform public.save_drs(
      current_setting('drs.id1')::uuid, 999,
      jsonb_build_object('drs_date', current_date::text, 'delivery_executive_code', 'FE1'),
      jsonb_build_array(jsonb_build_object('shipment_id', current_setting('drs.ship1'))));
    raise exception 'FAIL [optlock]';
  exception when sqlstate '40001' then null;
  end;
  raise notice 'PASS [optimistic-locking]';
end $$;

-- dispatch → OUT_FOR_DELIVERY
do $$
declare
  v_d public.drs;
  v_st text;
  v_ev int;
begin
  v_d := public.dispatch_drs(
    current_setting('drs.id1')::uuid,
    (select row_version from public.drs where id = current_setting('drs.id1')::uuid));
  if v_d.status <> 'DISPATCHED' then raise exception 'FAIL [dispatch]: %', v_d.status; end if;

  select current_status into v_st from public.shipments
   where id = current_setting('drs.ship1')::uuid;
  if v_st <> 'OUT_FOR_DELIVERY' then raise exception 'FAIL [ship-ofd]: %', v_st; end if;

  select count(*) into v_ev from public.drs_events
   where drs_id = v_d.id and event_type = 'DISPATCHED';
  if v_ev < 1 then raise exception 'FAIL [event-dispatched]'; end if;

  if not exists (
    select 1 from public.shipment_events
     where shipment_id = current_setting('drs.ship1')::uuid
       and event_type = 'OUT_FOR_DELIVERY'
  ) then raise exception 'FAIL [ship-event]'; end if;

  -- cannot edit after dispatch
  begin
    perform public.save_drs(
      v_d.id, v_d.row_version,
      jsonb_build_object('drs_date', current_date::text, 'delivery_executive_code', 'FE1'),
      jsonb_build_array(jsonb_build_object('shipment_id', current_setting('drs.ship1'))));
    raise exception 'FAIL [edit-dispatched]';
  exception when sqlstate 'CMS02' then null;
  end;

  perform set_config('drs.rv1', v_d.row_version::text, false);
  raise notice 'PASS [dispatch + shipment transition]';
end $$;

-- cancel DRAFT id2 (empty lines ok)
do $$
declare
  v_d public.drs;
begin
  -- add ship2 then cancel (unassign)
  v_d := public.save_drs(
    current_setting('drs.id2')::uuid,
    (select row_version from public.drs where id = current_setting('drs.id2')::uuid),
    jsonb_build_object('drs_date', current_date::text, 'delivery_executive_code', 'FE1'),
    jsonb_build_array(jsonb_build_object('shipment_id', current_setting('drs.ship2'))));

  v_d := public.cancel_drs(v_d.id, v_d.row_version, 'test cancel');
  if v_d.status <> 'CANCELLED' then raise exception 'FAIL [cancel]: %', v_d.status; end if;
  if exists (select 1 from public.drs_lines where drs_id = v_d.id) then
    raise exception 'FAIL [cancel-unassign]';
  end if;
  -- ship2 still MANIFEST_INSCANNED
  if (select current_status from public.shipments where id = current_setting('drs.ship2')::uuid)
     <> 'MANIFEST_INSCANNED' then
    raise exception 'FAIL [cancel-ship-status]';
  end if;
  raise notice 'PASS [cancel-draft]';
end $$;

-- cannot cancel DISPATCHED
do $$
begin
  begin
    perform public.cancel_drs(
      current_setting('drs.id1')::uuid,
      (select row_version from public.drs where id = current_setting('drs.id1')::uuid),
      'nope');
    raise exception 'FAIL [cancel-dispatched]';
  exception when sqlstate 'CMS04' then null;
  end;
  raise notice 'PASS [reject-cancel-dispatched]';
end $$;

-- append-only
do $$
declare
  v_eid uuid;
  v_text text;
  v_cnt integer;
begin
  select id, event_text into v_eid, v_text from public.drs_events
   where drs_id = current_setting('drs.id1')::uuid limit 1;

  begin
    update public.drs_events set event_text = 'x' where id = v_eid;
    if (select event_text from public.drs_events where id = v_eid) is not distinct from 'x' then
      raise exception 'FAIL [ao-update]';
    end if;
  exception when sqlstate '0A000' then null;
  end;

  begin
    delete from public.drs_events where id = v_eid;
    select count(*) into v_cnt from public.drs_events where id = v_eid;
    if v_cnt = 0 then raise exception 'FAIL [ao-delete]'; end if;
  exception when sqlstate '0A000' then null;
  end;

  raise notice 'PASS [append-only]';
end $$;

-- lookup drs + field-executive
do $$
declare
  v_cnt int;
begin
  select count(*) into v_cnt from public.lookup('drs', current_setting('drs.no1'), 50);
  if v_cnt < 1 then raise exception 'FAIL [lookup-drs]'; end if;
  select count(*) into v_cnt from public.lookup('field-executive', 'FE1', 50);
  if v_cnt < 1 then raise exception 'FAIL [lookup-fe]'; end if;
  raise notice 'PASS [lookup]';
end $$;

-- tenant isolation
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000b036';
do $$
begin
  begin
    perform public.dispatch_drs(
      current_setting('drs.id1')::uuid,
      (select row_version from public.drs where id = current_setting('drs.id1')::uuid));
    raise exception 'FAIL [tenant-isolation]';
  exception
    when sqlstate 'P0002' then null;
    when sqlstate '42501' then null;
  end;
  raise notice 'PASS [tenant-isolation]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000036';

do $$
begin
  raise notice '==========================================================';
  raise notice 'DRS FOUNDATION VERIFICATION PASSED.';
  raise notice '==========================================================';
end $$;

rollback;
