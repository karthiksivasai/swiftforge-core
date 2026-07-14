-- ===========================================================================
-- drs_completion_verification.sql — Phase 4 Milestone 4D (0037).
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000037','authenticated','authenticated','dc@a.test'),
  ('99999999-1111-4111-8111-00000000b037','authenticated','authenticated','dc@b.test')
on conflict (id) do nothing;

do $$
declare v_t uuid; v_tb uuid;
begin
  v_t := app.bootstrap_tenant('dc-a', 'DRS Complete A', 'DcA');
  perform app.link_tenant_admin(v_t, '99999999-1111-4111-8111-000000000037',
          'dcadm', 'DC Admin', 'dc@a.test');
  perform set_config('dc.tenant', v_t::text, false);

  v_tb := app.bootstrap_tenant('dc-b', 'DRS Complete B', 'DcB');
  perform app.link_tenant_admin(v_tb, '99999999-1111-4111-8111-00000000b037',
          'dcadmb', 'DC Admin B', 'dc@b.test');
  perform set_config('dc.tenant_b', v_tb::text, false);
end $$;

do $$
begin
  if to_regprocedure('public.complete_drs(uuid,integer)') is null then
    raise exception 'FAIL [fn]: complete_drs';
  end if;
  if to_regprocedure('public.reopen_drs(uuid,integer,text)') is null then
    raise exception 'FAIL [fn]: reopen_drs';
  end if;
  if to_regprocedure('public.mark_shipment_delivery_attempt(uuid,uuid,text,text,text)') is null then
    raise exception 'FAIL [fn]: mark_shipment_delivery_attempt';
  end if;
  if not app.status_transition_allowed('DRS','DISPATCHED','COMPLETED') then
    raise exception 'FAIL [status]: DISPATCHED->COMPLETED';
  end if;
  if not app.status_transition_allowed('DRS','COMPLETED','DISPATCHED') then
    raise exception 'FAIL [status]: COMPLETED->DISPATCHED';
  end if;
  if not app.status_transition_allowed('SHIPMENT','OUT_FOR_DELIVERY','DELIVERED_PENDING_POD') then
    raise exception 'FAIL [status]: OFD->DELIVERED_PENDING_POD';
  end if;
  if not app.status_transition_allowed('SHIPMENT','OUT_FOR_DELIVERY','DELIVERY_ATTEMPTED') then
    raise exception 'FAIL [status]: OFD->DELIVERY_ATTEMPTED';
  end if;
  raise notice 'PASS [structure]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000037';

-- seed through inscan → DRS dispatch (two OFD shipments)
do $$
declare
  v_t uuid := current_setting('dc.tenant')::uuid;
  v_pt uuid;
  v_s public.shipments;
  v_m public.manifests;
  v_d public.drs;
  v_res jsonb;
begin
  insert into public.product_types (tenant_id, code, name)
  values (v_t, 'PT1', 'Express Type') on conflict do nothing;
  select id into v_pt from public.product_types where tenant_id = v_t and code = 'PT1';
  insert into public.products (tenant_id, code, name, product_type_id, status)
  values (v_t, 'SPX', 'Express', v_pt, 'ACTIVE') on conflict do nothing;
  insert into public.customers (tenant_id, code, name, mobile, status)
  values (v_t, 'CUST1', 'Client One', '9000000001', 'ACTIVE') on conflict do nothing;
  insert into public.destinations (tenant_id, code, name, status)
  values (v_t, 'HYD', 'Hyderabad', 'ACTIVE'), (v_t, 'BLR', 'Bangalore', 'ACTIVE')
  on conflict do nothing;
  insert into public.service_centers (tenant_id, code, name, branch)
  values (v_t, 'BLR', 'Bangalore SC', 'HO') on conflict do nothing;
  insert into public.field_executives (tenant_id, code, name, mobile, service_center_id)
  select v_t, 'FE1', 'Rider One', '9000000099', sc.id
    from public.service_centers sc where sc.tenant_id = v_t and sc.code = 'BLR'
  on conflict do nothing;

  v_s := public.save_shipment(null, null,
    jsonb_build_object('customer_code','CUST1','product_code','SPX','origin_code','HYD','destination_code','BLR','book_date', current_date::text, 'pieces','1'),
    jsonb_build_array(jsonb_build_object('pieces','1','charge_weight','1')),
    '[]'::jsonb,'[]'::jsonb,'[]'::jsonb);
  v_s := public.confirm_booking(v_s.id, v_s.row_version);
  perform set_config('dc.ship1', v_s.id::text, false);
  perform set_config('dc.awb1', v_s.awb_no, false);

  v_s := public.save_shipment(null, null,
    jsonb_build_object('customer_code','CUST1','product_code','SPX','origin_code','HYD','destination_code','BLR','book_date', current_date::text, 'pieces','1'),
    jsonb_build_array(jsonb_build_object('pieces','1','charge_weight','2')),
    '[]'::jsonb,'[]'::jsonb,'[]'::jsonb);
  v_s := public.confirm_booking(v_s.id, v_s.row_version);
  perform set_config('dc.ship2', v_s.id::text, false);
  perform set_config('dc.awb2', v_s.awb_no, false);

  v_m := public.save_manifest(null, null,
    jsonb_build_object('manifest_date', current_date::text, 'to_service_center_code', 'BLR'),
    jsonb_build_array(
      jsonb_build_object('shipment_id', current_setting('dc.ship1')),
      jsonb_build_object('shipment_id', current_setting('dc.ship2'))),
    '[]'::jsonb, '[]'::jsonb);
  v_m := public.close_manifest(v_m.id, v_m.row_version);
  perform public.scan_manifest(v_m.id, current_setting('dc.awb1'), null, null, 'AWB');
  perform public.scan_manifest(v_m.id, current_setting('dc.awb2'), null, null, 'AWB');

  v_d := public.save_drs(null, null,
    jsonb_build_object('drs_date', current_date::text, 'delivery_executive_code', 'FE1', 'area_code', 'HYD'),
    jsonb_build_array(
      jsonb_build_object('shipment_id', current_setting('dc.ship1')),
      jsonb_build_object('shipment_id', current_setting('dc.ship2'))));
  v_d := public.dispatch_drs(v_d.id, v_d.row_version);
  if v_d.status <> 'DISPATCHED' then raise exception 'FAIL [seed-dispatch]'; end if;
  perform set_config('dc.drs', v_d.id::text, false);
  perform set_config('dc.rv', v_d.row_version::text, false);
  raise notice 'PASS [seed]';
end $$;

-- cannot complete while pending
do $$
begin
  begin
    perform public.complete_drs(
      current_setting('dc.drs')::uuid,
      (select row_version from public.drs where id = current_setting('dc.drs')::uuid));
    raise exception 'FAIL [complete-pending]';
  exception when sqlstate 'CMS04' then null;
  end;
  raise notice 'PASS [reject-complete-while-pending]';
end $$;

-- delivery attempt then delivered for ship1
do $$
declare
  v_res jsonb;
  v_st text;
  v_out text;
begin
  v_res := public.mark_shipment_delivery_attempt(
    current_setting('dc.drs')::uuid,
    current_setting('dc.ship1')::uuid,
    null, 'DELIVERY_ATTEMPTED', 'first knock');
  if (v_res->>'to_status') <> 'DELIVERY_ATTEMPTED' then
    raise exception 'FAIL [attempt]: %', v_res;
  end if;

  begin
    perform public.mark_shipment_delivery_attempt(
      current_setting('dc.drs')::uuid,
      current_setting('dc.ship1')::uuid,
      null, 'DELIVERY_ATTEMPTED', 'dup');
    raise exception 'FAIL [dup-attempt]';
  exception when sqlstate 'CMS04' then null;
  end;

  v_res := public.mark_shipment_delivery_attempt(
    current_setting('dc.drs')::uuid,
    current_setting('dc.ship1')::uuid,
    null, 'DELIVERED_PENDING_POD', 'handed over');
  if (v_res->>'to_status') <> 'DELIVERED_PENDING_POD' then
    raise exception 'FAIL [delivered]: %', v_res;
  end if;
  select current_status into v_st from public.shipments where id = current_setting('dc.ship1')::uuid;
  if v_st <> 'DELIVERED_PENDING_POD' then raise exception 'FAIL [ship1-st]: %', v_st; end if;
  select outcome into v_out from public.drs_lines
   where drs_id = current_setting('dc.drs')::uuid and shipment_id = current_setting('dc.ship1')::uuid;
  if v_out <> 'DELIVERED' then raise exception 'FAIL [line-outcome]: %', v_out; end if;

  begin
    perform public.mark_shipment_delivery_attempt(
      current_setting('dc.drs')::uuid,
      current_setting('dc.ship1')::uuid,
      null, 'UNDELIVERED', 'late');
    raise exception 'FAIL [dup-terminal]';
  exception when sqlstate 'CMS04' then null;
  end;

  raise notice 'PASS [attempt + delivered + duplicate guards]';
end $$;

-- undelivered ship2 via awb
do $$
declare v_res jsonb;
begin
  v_res := public.mark_shipment_delivery_attempt(
    current_setting('dc.drs')::uuid,
    null, current_setting('dc.awb2'), 'UNDELIVERED', 'refused');
  if (v_res->>'to_status') <> 'UNDELIVERED' then
    raise exception 'FAIL [undel]: %', v_res;
  end if;
  raise notice 'PASS [undelivered]';
end $$;

-- complete
do $$
declare
  v_d public.drs;
  v_board jsonb;
  v_ev int;
begin
  v_d := public.complete_drs(
    current_setting('dc.drs')::uuid,
    (select row_version from public.drs where id = current_setting('dc.drs')::uuid));
  if v_d.status <> 'COMPLETED' then raise exception 'FAIL [complete]: %', v_d.status; end if;

  select count(*) into v_ev from public.drs_events
   where drs_id = v_d.id and event_type = 'COMPLETED';
  if v_ev < 1 then raise exception 'FAIL [event-completed]'; end if;

  -- locked: cannot mark more attempts
  begin
    perform public.mark_shipment_delivery_attempt(
      v_d.id, current_setting('dc.ship1')::uuid, null, 'UNDELIVERED', 'x');
    raise exception 'FAIL [modify-completed]';
  exception when sqlstate 'CMS02' then null;
  end;

  v_board := public.get_drs_completion_board(v_d.id);
  if (v_board->>'delivered')::int < 1 then raise exception 'FAIL [board-del]: %', v_board; end if;
  if (v_board->>'undelivered')::int < 1 then raise exception 'FAIL [board-ud]: %', v_board; end if;
  if (v_board->>'pending')::int <> 0 then raise exception 'FAIL [board-pend]: %', v_board; end if;

  perform set_config('dc.rv', v_d.row_version::text, false);
  raise notice 'PASS [complete + locked + board]';
end $$;

-- reopen
do $$
declare v_d public.drs;
begin
  v_d := public.reopen_drs(
    current_setting('dc.drs')::uuid,
    current_setting('dc.rv')::integer,
    'fix outcome');
  if v_d.status <> 'DISPATCHED' then raise exception 'FAIL [reopen]: %', v_d.status; end if;
  if not exists (
    select 1 from public.drs_events where drs_id = v_d.id and event_type = 'REOPENED'
  ) then raise exception 'FAIL [event-reopen]'; end if;

  -- cannot reopen again from DISPATCHED
  begin
    perform public.reopen_drs(v_d.id, v_d.row_version, 'x');
    raise exception 'FAIL [reopen-dispatched]';
  exception when sqlstate 'CMS04' then null;
  end;
  raise notice 'PASS [reopen rules]';
end $$;

-- not on DRS
do $$
begin
  begin
    perform public.mark_shipment_delivery_attempt(
      current_setting('dc.drs')::uuid, null, 'NO-AWB', 'UNDELIVERED', null);
    raise exception 'FAIL [not-assigned]';
  exception when sqlstate 'CMS04' then null;
  end;
  raise notice 'PASS [reject-not-assigned]';
end $$;

-- append-only
do $$
declare v_eid uuid; v_text text; v_cnt integer;
begin
  select id, event_text into v_eid, v_text from public.drs_events
   where drs_id = current_setting('dc.drs')::uuid limit 1;
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

-- tenant isolation
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000b037';
do $$
begin
  begin
    perform public.complete_drs(
      current_setting('dc.drs')::uuid,
      (select row_version from public.drs where id = current_setting('dc.drs')::uuid));
    raise exception 'FAIL [tenant]';
  exception
    when sqlstate 'P0002' then null;
    when sqlstate '42501' then null;
  end;
  raise notice 'PASS [tenant-isolation]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000037';

do $$
begin
  raise notice '==========================================================';
  raise notice 'DRS COMPLETION VERIFICATION PASSED.';
  raise notice '==========================================================';
end $$;

rollback;
