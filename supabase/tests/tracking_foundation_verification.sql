-- ===========================================================================
-- tracking_foundation_verification.sql — Phase 4 Milestone 4F (0039).
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000039','authenticated','authenticated','trk@a.test'),
  ('99999999-1111-4111-8111-00000000b039','authenticated','authenticated','trk@b.test'),
  ('99999999-1111-4111-8111-00000000c039','authenticated','authenticated','trkstaff@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid; v_tb uuid;
begin
  v_t := app.bootstrap_tenant('trk-a', 'Tracking A', 'TrkA');
  perform app.link_tenant_admin(v_t, '99999999-1111-4111-8111-000000000039',
          'trkadm', 'Tracking Admin', 'trk@a.test');
  perform set_config('trk.tenant', v_t::text, false);

  v_tb := app.bootstrap_tenant('trk-b', 'Tracking B', 'TrkB');
  perform app.link_tenant_admin(v_tb, '99999999-1111-4111-8111-00000000b039',
          'trkadmb', 'Tracking Admin B', 'trk@b.test');
  perform set_config('trk.tenant_b', v_tb::text, false);
end $$;

do $$
begin
  if to_regclass('public.shipment_holds') is null then
    raise exception 'FAIL [table]: shipment_holds';
  end if;
  if to_regclass('public.tracking_events') is null then
    raise exception 'FAIL [table]: tracking_events';
  end if;
  if to_regprocedure('public.get_shipment_tracking(text)') is null then
    raise exception 'FAIL [fn]: get_shipment_tracking';
  end if;
  if to_regprocedure('public.add_tracking_progress(text,jsonb)') is null then
    raise exception 'FAIL [fn]: add_tracking_progress';
  end if;
  if to_regprocedure('public.add_tracking_comment(text,jsonb)') is null then
    raise exception 'FAIL [fn]: add_tracking_comment';
  end if;
  if to_regprocedure('public.hold_shipment(text,integer,jsonb)') is null then
    raise exception 'FAIL [fn]: hold_shipment';
  end if;
  if to_regprocedure('public.release_shipment_hold(text,integer,jsonb)') is null then
    raise exception 'FAIL [fn]: release_shipment_hold';
  end if;
  raise notice 'PASS [structure]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000039';

-- seed booked shipment + exception for optional transition
do $$
declare
  v_t uuid := current_setting('trk.tenant')::uuid;
  v_pt uuid;
  v_s public.shipments;
  v_m public.manifests;
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
  values (v_t, 'HYD', 'Hyderabad SC', 'HO') on conflict do nothing;
  insert into public.delivery_exceptions (tenant_id, code, name, exc_type)
  values (v_t, 'IN_TRANSIT', 'In Transit', 'UNDELIVERED'),
         (v_t, 'AT_HUB', 'Arrived at Hub', 'UNDELIVERED')
  on conflict do nothing;

  v_s := public.save_shipment(null, null,
    jsonb_build_object('customer_code','CUST1','product_code','SPX','origin_code','HYD','destination_code','BLR','book_date', current_date::text, 'pieces','1'),
    jsonb_build_array(jsonb_build_object('pieces','1','charge_weight','1')),
    '[]'::jsonb,'[]'::jsonb,'[]'::jsonb);
  v_s := public.confirm_booking(v_s.id, v_s.row_version);
  perform set_config('trk.ship1', v_s.id::text, false);
  perform set_config('trk.awb1', v_s.awb_no, false);
  perform set_config('trk.rv', v_s.row_version::text, false);

  -- second shipment through manifest close for status transition test
  v_s := public.save_shipment(null, null,
    jsonb_build_object('customer_code','CUST1','product_code','SPX','origin_code','HYD','destination_code','BLR','book_date', current_date::text, 'pieces','1'),
    jsonb_build_array(jsonb_build_object('pieces','1','charge_weight','2')),
    '[]'::jsonb,'[]'::jsonb,'[]'::jsonb);
  v_s := public.confirm_booking(v_s.id, v_s.row_version);
  perform set_config('trk.ship2', v_s.id::text, false);
  perform set_config('trk.awb2', v_s.awb_no, false);

  v_m := public.save_manifest(null, null,
    jsonb_build_object('manifest_date', current_date::text, 'to_service_center_code', 'HYD'),
    jsonb_build_array(jsonb_build_object('shipment_id', current_setting('trk.ship2'))),
    '[]'::jsonb, '[]'::jsonb);
  v_m := public.close_manifest(v_m.id, v_m.row_version);
  if (select current_status from public.shipments where id = current_setting('trk.ship2')::uuid)
       <> 'MANIFESTED' then
    raise exception 'FAIL [seed-manifested]';
  end if;

  raise notice 'PASS [seed]';
end $$;

-- tracking progress (no status change) + timeline
do $$
declare
  v_res jsonb;
  v_view jsonb;
  v_tev int;
  v_sev int;
  v_aud int;
begin
  v_res := public.add_tracking_progress(
    current_setting('trk.awb1'),
    jsonb_build_object(
      'event_date', current_date::text,
      'event_time', '1430',
      'exception_code', 'AT_HUB',
      'service_center_code', 'HYD',
      'remark', 'Arrived hub'));
  if coalesce((v_res->>'ok')::boolean, false) is not true then
    raise exception 'FAIL [progress]: %', v_res;
  end if;
  if (v_res->>'to_status') <> 'BOOKED' then
    raise exception 'FAIL [progress-status-unchanged]: %', v_res;
  end if;

  select count(*) into v_tev from public.tracking_events
   where shipment_id = current_setting('trk.ship1')::uuid and status_text = 'Arrived at Hub';
  if v_tev < 1 then raise exception 'FAIL [progress-tracking-event]'; end if;

  select count(*) into v_sev from public.shipment_events
   where shipment_id = current_setting('trk.ship1')::uuid and event_type = 'PROGRESS';
  if v_sev < 1 then raise exception 'FAIL [progress-shipment-event]'; end if;

  select count(*) into v_aud from public.audit_logs
   where entity_type = 'shipments' and entity_id = current_setting('trk.ship1')::uuid
     and module_slug = 'txn.progress-comments-update';
  if v_aud < 1 then raise exception 'FAIL [progress-audit]'; end if;

  v_view := public.get_shipment_tracking(current_setting('trk.awb1'));
  if coalesce((v_view->>'found')::boolean, false) is not true then
    raise exception 'FAIL [timeline-found]: %', v_view;
  end if;
  if jsonb_array_length(v_view->'tracking_events') < 1 then
    raise exception 'FAIL [timeline-tracking]';
  end if;
  if jsonb_array_length(v_view->'shipment_events') < 1 then
    raise exception 'FAIL [timeline-events]';
  end if;
  if (v_view->'shipment'->>'current_status') is null then
    raise exception 'FAIL [timeline-summary]';
  end if;

  raise notice 'PASS [progress + timeline]';
end $$;

-- illegal transition rejection
do $$
begin
  begin
    perform public.add_tracking_progress(
      current_setting('trk.awb1'),
      jsonb_build_object('to_status', 'DELIVERED', 'remark', 'skip'));
    raise exception 'FAIL [illegal-transition]';
  exception when sqlstate 'CMS02' then null;
           when sqlstate 'CMS04' then null;
  end;
  raise notice 'PASS [illegal-transition-rejection]';
end $$;

-- valid status transition via progress (MANIFESTED → IN_TRANSIT)
do $$
declare v_res jsonb; v_st text;
begin
  v_res := public.add_tracking_progress(
    current_setting('trk.awb2'),
    jsonb_build_object(
      'exception_code', 'IN_TRANSIT',
      'remark', 'Departed'));
  if (v_res->>'to_status') <> 'IN_TRANSIT' then
    raise exception 'FAIL [transition]: %', v_res;
  end if;
  select current_status into v_st from public.shipments
   where id = current_setting('trk.ship2')::uuid;
  if v_st <> 'IN_TRANSIT' then raise exception 'FAIL [transition-ship]: %', v_st; end if;
  raise notice 'PASS [tracking-progress-transition]';
end $$;

-- comment creation
do $$
declare v_res jsonb; v_view jsonb; v_cnt int;
begin
  v_res := public.add_tracking_comment(
    current_setting('trk.awb1'),
    jsonb_build_object('comment', 'Customer called for ETA'));
  if coalesce((v_res->>'ok')::boolean, false) is not true then
    raise exception 'FAIL [comment]: %', v_res;
  end if;

  select count(*) into v_cnt from public.shipment_comments
   where shipment_id = current_setting('trk.ship1')::uuid and deleted_at is null;
  if v_cnt < 1 then raise exception 'FAIL [comment-row]'; end if;

  v_view := public.get_shipment_tracking(current_setting('trk.awb1'));
  if jsonb_array_length(v_view->'comments') < 1 then
    raise exception 'FAIL [timeline-comments]';
  end if;
  raise notice 'PASS [comment-creation]';
end $$;

-- hold + release + optimistic locking
do $$
declare
  v_res jsonb;
  v_rv integer;
  v_hold_cnt int;
  v_view jsonb;
begin
  select row_version into v_rv from public.shipments
   where id = current_setting('trk.ship1')::uuid;

  begin
    perform public.hold_shipment(
      current_setting('trk.awb1'), 999999,
      jsonb_build_object('remark', 'stale'));
    raise exception 'FAIL [optlock-hold]';
  exception when sqlstate '40001' then null;
  end;

  v_res := public.hold_shipment(
    current_setting('trk.awb1'), v_rv,
    jsonb_build_object('remark', 'Docs pending', 'send_mail', false));
  if coalesce((v_res->>'is_hold')::boolean, false) is not true then
    raise exception 'FAIL [hold]: %', v_res;
  end if;
  v_rv := (v_res->>'row_version')::integer;

  -- progress status change blocked while held
  begin
    perform public.add_tracking_progress(
      current_setting('trk.awb1'),
      jsonb_build_object('to_status', 'PICKUP_INSCANNED', 'remark', 'blocked'));
    raise exception 'FAIL [hold-blocks-transition]';
  exception when sqlstate 'CMS04' then null;
  end;

  -- informational progress still allowed
  perform public.add_tracking_progress(
    current_setting('trk.awb1'),
    jsonb_build_object('remark', 'Note while held', 'status_text', 'Held Note'));

  begin
    perform public.release_shipment_hold(
      current_setting('trk.awb1'), 999999,
      jsonb_build_object('remark', 'stale'));
    raise exception 'FAIL [optlock-release]';
  exception when sqlstate '40001' then null;
  end;

  v_res := public.release_shipment_hold(
    current_setting('trk.awb1'), v_rv,
    jsonb_build_object('remark', 'Docs received'));
  if coalesce((v_res->>'is_hold')::boolean, true) is not false then
    raise exception 'FAIL [release]: %', v_res;
  end if;

  select count(*) into v_hold_cnt from public.shipment_holds
   where shipment_id = current_setting('trk.ship1')::uuid;
  if v_hold_cnt < 2 then raise exception 'FAIL [hold-history]: %', v_hold_cnt; end if;

  -- never delete history
  begin
    delete from public.shipment_holds
     where shipment_id = current_setting('trk.ship1')::uuid;
    select count(*) into v_hold_cnt from public.shipment_holds
     where shipment_id = current_setting('trk.ship1')::uuid;
    if v_hold_cnt = 0 then raise exception 'FAIL [hold-deleted]'; end if;
  exception when sqlstate '0A000' then null;
  end;

  v_view := public.get_shipment_tracking(current_setting('trk.awb1'));
  if jsonb_array_length(v_view->'holds') < 2 then
    raise exception 'FAIL [timeline-holds]';
  end if;

  raise notice 'PASS [hold + release + optlock]';
end $$;

-- append-only tracking_events
do $$
declare v_eid uuid; v_cnt integer;
begin
  select id into v_eid from public.tracking_events
   where shipment_id = current_setting('trk.ship1')::uuid limit 1;
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
  raise notice 'PASS [append-only-history]';
end $$;

-- permission enforcement
do $$
declare
  v_t uuid := current_setting('trk.tenant')::uuid;
  v_uid uuid;
  v_gid uuid;
  v_branch uuid;
begin
  select id into v_branch from public.branches where tenant_id = v_t and deleted_at is null limit 1;
  insert into public.users (
    tenant_id, auth_user_id, username, user_type, full_name, email, home_branch_id, status)
  values (
    v_t, '99999999-1111-4111-8111-00000000c039', 'trkstaff', 'STAFF',
    'Trk Staff', 'trkstaff@a.test', v_branch, 'ACTIVE')
  on conflict (auth_user_id) do update set deleted_at = null
  returning id into v_uid;

  select id into v_gid from public.user_groups
   where tenant_id = v_t and name = 'OPERATIONS' and deleted_at is null;
  insert into public.user_group_members (tenant_id, user_id, group_id)
  values (v_t, v_uid, v_gid) on conflict (user_id, group_id) do nothing;

  update public.group_permissions gp
     set can_modify = false, can_add = false, all_access = false,
         can_list = false, can_search = false
    from public.permission_modules pm
   where gp.module_id = pm.id and gp.group_id = v_gid
     and pm.slug in (
       'txn.progress-comments-update',
       'txn.awb-query-progress-update',
       'txn.awb-query-comment-update',
       'txn.awb-hold-unhold',
       'txn.awb-query');
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000c039';
do $$
declare v_t uuid := current_setting('trk.tenant')::uuid;
begin
  if app.user_has_permission(v_t, 'txn.progress-comments-update', 'add') then
    raise exception 'FAIL [perm-setup]';
  end if;
  begin
    perform public.add_tracking_progress(
      current_setting('trk.awb1'),
      jsonb_build_object('remark', 'denied'));
    raise exception 'FAIL [perm-progress]';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.hold_shipment(
      current_setting('trk.awb1'),
      (select row_version from public.shipments where id = current_setting('trk.ship1')::uuid),
      jsonb_build_object('remark', 'denied'));
    raise exception 'FAIL [perm-hold]';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'PASS [permission-enforcement]';
end $$;

-- tenant isolation
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000b039';
do $$
declare v_view jsonb;
begin
  v_view := public.get_shipment_tracking(current_setting('trk.awb1'));
  if coalesce((v_view->>'found')::boolean, false) then
    raise exception 'FAIL [tenant-timeline]';
  end if;
  begin
    perform public.add_tracking_comment(
      current_setting('trk.awb1'),
      jsonb_build_object('comment', 'cross'));
    raise exception 'FAIL [tenant-comment]';
  exception
    when sqlstate 'P0002' then null;
    when sqlstate '42501' then null;
  end;
  raise notice 'PASS [tenant-isolation]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000039';

do $$
begin
  raise notice '==========================================================';
  raise notice 'TRACKING FOUNDATION VERIFICATION PASSED.';
  raise notice '==========================================================';
end $$;

rollback;
