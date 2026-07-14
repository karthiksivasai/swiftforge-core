-- ===========================================================================
-- pod_foundation_verification.sql — Phase 4 Milestone 4E (0038).
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000038','authenticated','authenticated','pod@a.test'),
  ('99999999-1111-4111-8111-00000000b038','authenticated','authenticated','pod@b.test')
on conflict (id) do nothing;

do $$
declare v_t uuid; v_tb uuid;
begin
  v_t := app.bootstrap_tenant('pod-a', 'POD Foundation A', 'PodA');
  perform app.link_tenant_admin(v_t, '99999999-1111-4111-8111-000000000038',
          'podadm', 'POD Admin', 'pod@a.test');
  perform set_config('pod.tenant', v_t::text, false);

  v_tb := app.bootstrap_tenant('pod-b', 'POD Foundation B', 'PodB');
  perform app.link_tenant_admin(v_tb, '99999999-1111-4111-8111-00000000b038',
          'podadmb', 'POD Admin B', 'pod@b.test');
  perform set_config('pod.tenant_b', v_tb::text, false);
end $$;

do $$
begin
  if to_regclass('public.pod_records') is null then
    raise exception 'FAIL [table]: pod_records';
  end if;
  if to_regclass('public.tracking_events') is null then
    raise exception 'FAIL [table]: tracking_events';
  end if;
  if to_regprocedure('public.save_pod(uuid,text,jsonb)') is null then
    raise exception 'FAIL [fn]: save_pod';
  end if;
  if to_regprocedure('public.update_pod(uuid,integer,jsonb)') is null then
    raise exception 'FAIL [fn]: update_pod';
  end if;
  if to_regprocedure('public.cancel_pod(uuid,integer,text)') is null then
    raise exception 'FAIL [fn]: cancel_pod';
  end if;
  if to_regprocedure('public.get_pod_by_awb(text)') is null then
    raise exception 'FAIL [fn]: get_pod_by_awb';
  end if;
  if not app.status_transition_allowed('SHIPMENT','DELIVERED_PENDING_POD','DELIVERED') then
    raise exception 'FAIL [status]: DELIVERED_PENDING_POD->DELIVERED';
  end if;
  if not app.status_transition_allowed('SHIPMENT','DELIVERED','DELIVERED_PENDING_POD') then
    raise exception 'FAIL [status]: DELIVERED->DELIVERED_PENDING_POD';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'shipments' and column_name = 'pod_receiver'
  ) then
    raise exception 'FAIL [col]: shipments.pod_receiver';
  end if;
  raise notice 'PASS [structure]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000038';

-- seed: book → manifest → inscan → DRS → OFD → DELIVERED_PENDING_POD
do $$
declare
  v_t uuid := current_setting('pod.tenant')::uuid;
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
  perform set_config('pod.ship1', v_s.id::text, false);
  perform set_config('pod.awb1', v_s.awb_no, false);

  v_s := public.save_shipment(null, null,
    jsonb_build_object('customer_code','CUST1','product_code','SPX','origin_code','HYD','destination_code','BLR','book_date', current_date::text, 'pieces','1'),
    jsonb_build_array(jsonb_build_object('pieces','1','charge_weight','2')),
    '[]'::jsonb,'[]'::jsonb,'[]'::jsonb);
  v_s := public.confirm_booking(v_s.id, v_s.row_version);
  perform set_config('pod.ship2', v_s.id::text, false);
  perform set_config('pod.awb2', v_s.awb_no, false);

  v_m := public.save_manifest(null, null,
    jsonb_build_object('manifest_date', current_date::text, 'to_service_center_code', 'BLR'),
    jsonb_build_array(
      jsonb_build_object('shipment_id', current_setting('pod.ship1')),
      jsonb_build_object('shipment_id', current_setting('pod.ship2'))),
    '[]'::jsonb, '[]'::jsonb);
  v_m := public.close_manifest(v_m.id, v_m.row_version);
  perform public.scan_manifest(v_m.id, current_setting('pod.awb1'), null, null, 'AWB');
  perform public.scan_manifest(v_m.id, current_setting('pod.awb2'), null, null, 'AWB');

  v_d := public.save_drs(null, null,
    jsonb_build_object('drs_date', current_date::text, 'delivery_executive_code', 'FE1', 'area_code', 'HYD'),
    jsonb_build_array(
      jsonb_build_object('shipment_id', current_setting('pod.ship1')),
      jsonb_build_object('shipment_id', current_setting('pod.ship2'))));
  v_d := public.dispatch_drs(v_d.id, v_d.row_version);

  v_res := public.mark_shipment_delivery_attempt(
    v_d.id, current_setting('pod.ship1')::uuid, null, 'DELIVERED_PENDING_POD', 'handed');
  if (v_res->>'to_status') <> 'DELIVERED_PENDING_POD' then
    raise exception 'FAIL [seed-pending]: %', v_res;
  end if;

  -- ship2 stays OFD for invalid-status tests
  raise notice 'PASS [seed]';
end $$;

-- invalid status rejection (OFD)
do $$
begin
  begin
    perform public.save_pod(
      current_setting('pod.ship2')::uuid, null,
      jsonb_build_object('receiver_name','X','pod_date', current_date::text));
    raise exception 'FAIL [invalid-status]';
  exception when sqlstate 'CMS04' then null;
  end;
  raise notice 'PASS [invalid-status-rejection]';
end $$;

-- valid delivery (save_pod)
do $$
declare
  v_pod public.pod_records;
  v_st text;
  v_recv text;
  v_sev int;
  v_tev int;
  v_aud int;
  v_view jsonb;
begin
  v_pod := public.save_pod(
    null, current_setting('pod.awb1'),
    jsonb_build_object(
      'receiver_name', 'JOHN SMITH',
      'pod_date', current_date::text,
      'remark', 'Received in good condition',
      'source', 'MANUAL'));

  if v_pod.status <> 'DELIVERED' then raise exception 'FAIL [pod-status]: %', v_pod.status; end if;
  if v_pod.receiver_name <> 'JOHN SMITH' then raise exception 'FAIL [pod-recv]'; end if;

  select current_status, pod_receiver into v_st, v_recv
    from public.shipments where id = current_setting('pod.ship1')::uuid;
  if v_st <> 'DELIVERED' then raise exception 'FAIL [ship-st]: %', v_st; end if;
  if v_recv <> 'JOHN SMITH' then raise exception 'FAIL [ship-recv]: %', v_recv; end if;

  select count(*) into v_sev from public.shipment_events
   where shipment_id = current_setting('pod.ship1')::uuid and event_type = 'DELIVERED';
  if v_sev < 1 then raise exception 'FAIL [shipment-event]'; end if;

  select count(*) into v_tev from public.tracking_events
   where shipment_id = current_setting('pod.ship1')::uuid and status_text = 'Delivered';
  if v_tev < 1 then raise exception 'FAIL [tracking-event]'; end if;

  select count(*) into v_aud from public.audit_logs
   where entity_type = 'pod_records' and entity_id = v_pod.id and action = 'ADD';
  if v_aud < 1 then raise exception 'FAIL [audit-add]'; end if;

  v_view := public.get_pod_by_awb(current_setting('pod.awb1'));
  if coalesce((v_view->>'found')::boolean, false) is not true then
    raise exception 'FAIL [get-pod]: %', v_view;
  end if;

  perform set_config('pod.pod1', v_pod.id::text, false);
  perform set_config('pod.rv', v_pod.row_version::text, false);
  raise notice 'PASS [valid-delivery]';
end $$;

-- duplicate POD rejection
do $$
begin
  begin
    perform public.save_pod(
      current_setting('pod.ship1')::uuid, null,
      jsonb_build_object('receiver_name','DUP','pod_date', current_date::text));
    raise exception 'FAIL [dup-pod]';
  exception when sqlstate 'CMS04' then null;
  end;
  raise notice 'PASS [duplicate-pod-rejection]';
end $$;

-- update_pod + optimistic locking
do $$
declare
  v_pod public.pod_records;
  v_sev int;
begin
  begin
    perform public.update_pod(
      current_setting('pod.pod1')::uuid,
      999999,
      jsonb_build_object('receiver_name','STALE'));
    raise exception 'FAIL [optlock]';
  exception when sqlstate '40001' then null;
  end;

  v_pod := public.update_pod(
    current_setting('pod.pod1')::uuid,
    current_setting('pod.rv')::integer,
    jsonb_build_object('receiver_name','JANE DOE', 'remark', 'Updated receiver'));

  if v_pod.receiver_name <> 'JANE DOE' then raise exception 'FAIL [update-recv]'; end if;
  if (select pod_receiver from public.shipments where id = current_setting('pod.ship1')::uuid)
       <> 'JANE DOE' then
    raise exception 'FAIL [update-ship-recv]';
  end if;

  select count(*) into v_sev from public.shipment_events
   where shipment_id = current_setting('pod.ship1')::uuid and event_type = 'POD_UPDATED';
  if v_sev < 1 then raise exception 'FAIL [update-event]'; end if;

  perform set_config('pod.rv', v_pod.row_version::text, false);
  raise notice 'PASS [update + optimistic-locking]';
end $$;

-- cancel_pod
do $$
declare
  v_pod public.pod_records;
  v_st text;
  v_sev int;
  v_tev int;
  v_cnt int;
begin
  v_pod := public.cancel_pod(
    current_setting('pod.pod1')::uuid,
    current_setting('pod.rv')::integer,
    'incorrect receiver');

  if v_pod.status <> 'PENDING' then raise exception 'FAIL [cancel-status]: %', v_pod.status; end if;

  select current_status into v_st from public.shipments
   where id = current_setting('pod.ship1')::uuid;
  if v_st <> 'DELIVERED_PENDING_POD' then raise exception 'FAIL [cancel-ship]: %', v_st; end if;

  select count(*) into v_sev from public.shipment_events
   where shipment_id = current_setting('pod.ship1')::uuid and event_type = 'POD_CANCELLED';
  if v_sev < 1 then raise exception 'FAIL [cancel-ship-event]'; end if;

  select count(*) into v_tev from public.tracking_events
   where shipment_id = current_setting('pod.ship1')::uuid and status_text = 'POD Cancelled';
  if v_tev < 1 then raise exception 'FAIL [cancel-track-event]'; end if;

  -- history retained (row not deleted)
  select count(*) into v_cnt from public.pod_records
   where id = current_setting('pod.pod1')::uuid and deleted_at is null;
  if v_cnt <> 1 then raise exception 'FAIL [history-retained]'; end if;

  -- can save again after cancel
  v_pod := public.save_pod(
    current_setting('pod.ship1')::uuid, null,
    jsonb_build_object('receiver_name','RE-DELIVERED','pod_date', current_date::text));
  if v_pod.status <> 'DELIVERED' then raise exception 'FAIL [re-save]'; end if;
  if (select current_status from public.shipments where id = current_setting('pod.ship1')::uuid)
       <> 'DELIVERED' then
    raise exception 'FAIL [re-save-ship]';
  end if;

  raise notice 'PASS [cancel-pod + re-save]';
end $$;

-- append-only tracking_events
do $$
declare v_eid uuid; v_text text; v_cnt integer;
begin
  select id, status_text into v_eid, v_text from public.tracking_events
   where shipment_id = current_setting('pod.ship1')::uuid limit 1;
  begin
    update public.tracking_events set status_text = 'x' where id = v_eid;
    if (select status_text from public.tracking_events where id = v_eid) is not distinct from 'x' then
      raise exception 'FAIL [ao-update]';
    end if;
  exception when sqlstate '0A000' then null;
  end;
  begin
    delete from public.tracking_events where id = v_eid;
    select count(*) into v_cnt from public.tracking_events where id = v_eid;
    if v_cnt = 0 then raise exception 'FAIL [ao-delete]'; end if;
  exception when sqlstate '0A000' then null;
  end;
  raise notice 'PASS [append-only-events]';
end $$;

-- tenant isolation
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000b038';
do $$
begin
  begin
    perform public.save_pod(
      current_setting('pod.ship1')::uuid, null,
      jsonb_build_object('receiver_name','X','pod_date', current_date::text));
    raise exception 'FAIL [tenant]';
  exception
    when sqlstate 'P0002' then null;
    when sqlstate '42501' then null;
    when sqlstate 'CMS04' then null;
  end;
  raise notice 'PASS [tenant-isolation]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000038';

do $$
begin
  raise notice '==========================================================';
  raise notice 'POD FOUNDATION VERIFICATION PASSED.';
  raise notice '==========================================================';
end $$;

rollback;
