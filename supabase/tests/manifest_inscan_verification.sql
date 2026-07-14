-- ===========================================================================
-- manifest_inscan_verification.sql — Phase 4 Milestone 4B (0035).
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000035','authenticated','authenticated','mi@a.test'),
  ('99999999-1111-4111-8111-00000000b035','authenticated','authenticated','mi@b.test')
on conflict (id) do nothing;

do $$
declare v_t uuid; v_tb uuid;
begin
  v_t := app.bootstrap_tenant('mi-a', 'Inscan Tenant A', 'MiA');
  perform app.link_tenant_admin(v_t, '99999999-1111-4111-8111-000000000035',
          'miadm', 'Inscan Admin', 'mi@a.test');
  perform set_config('mi.tenant', v_t::text, false);

  v_tb := app.bootstrap_tenant('mi-b', 'Inscan Tenant B', 'MiB');
  perform app.link_tenant_admin(v_tb, '99999999-1111-4111-8111-00000000b035',
          'miadmb', 'Inscan Admin B', 'mi@b.test');
  perform set_config('mi.tenant_b', v_tb::text, false);
end $$;

do $$
begin
  if to_regclass('public.manifest_scan_events') is null then
    raise exception 'FAIL [table]: manifest_scan_events';
  end if;
  if to_regclass('public.shipment_scan_events') is null then
    raise exception 'FAIL [table]: shipment_scan_events';
  end if;
  if to_regprocedure('public.scan_manifest(uuid,text,uuid,text,text)') is null then
    raise exception 'FAIL [fn]: scan_manifest';
  end if;
  if to_regprocedure('public.get_manifest_inscan_board(uuid)') is null then
    raise exception 'FAIL [fn]: get_manifest_inscan_board';
  end if;
  if not app.status_transition_allowed('SHIPMENT','MANIFESTED','MANIFEST_INSCANNED') then
    raise exception 'FAIL [status]: MANIFESTED->MANIFEST_INSCANNED';
  end if;
  raise notice 'PASS [structure]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000035';

-- seed masters + closed manifest with MANIFESTED shipments
do $$
declare
  v_t uuid := current_setting('mi.tenant')::uuid;
  v_pt uuid;
  v_s public.shipments;
  v_m public.manifests;
  v_s2 public.shipments;
  v_sc uuid;
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
  values (v_t, 'BLR', 'Bangalore SC', 'HO') on conflict do nothing
  returning id into v_sc;
  if v_sc is null then
    select id into v_sc from public.service_centers where tenant_id = v_t and code = 'BLR';
  end if;

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
  perform set_config('mi.ship1', v_s.id::text, false);
  perform set_config('mi.awb1', v_s.awb_no, false);

  v_s2 := public.save_shipment(
    null, null,
    jsonb_build_object(
      'customer_code','CUST1','product_code','SPX',
      'origin_code','HYD','destination_code','BLR',
      'book_date', current_date::text, 'pieces','1'
    ),
    jsonb_build_array(jsonb_build_object('pieces','1','charge_weight','2')),
    '[]'::jsonb,'[]'::jsonb,'[]'::jsonb);
  v_s2 := public.confirm_booking(v_s2.id, v_s2.row_version);
  perform set_config('mi.ship2', v_s2.id::text, false);
  perform set_config('mi.awb2', v_s2.awb_no, false);

  -- cancelled shipment (for reject path)
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
  v_s := public.cancel_shipment(v_s.id, v_s.row_version, 'test cancel');
  perform set_config('mi.cancelled', v_s.id::text, false);
  perform set_config('mi.cancelled_awb', v_s.awb_no, false);

  v_m := public.save_manifest(
    null, null,
    jsonb_build_object(
      'manifest_date', current_date::text,
      'to_type', 'SERVICE_CENTER',
      'to_service_center_code', 'BLR',
      'location_code', 'HYD',
      'connect_station', 'Bangalore'
    ),
    jsonb_build_array(
      jsonb_build_object('shipment_id', current_setting('mi.ship1'), 'bag_no', 'B1'),
      jsonb_build_object('shipment_id', current_setting('mi.ship2'), 'bag_no', 'B2')
    ),
    '[]'::jsonb, '[]'::jsonb);
  v_m := public.close_manifest(v_m.id, v_m.row_version);
  if v_m.status <> 'CLOSED' then raise exception 'FAIL [seed-close]: %', v_m.status; end if;
  perform set_config('mi.manifest', v_m.id::text, false);
  perform set_config('mi.manifest_no', v_m.manifest_no, false);

  -- DRAFT manifest (must reject inscan)
  v_m := public.save_manifest(
    null, null,
    jsonb_build_object('manifest_date', current_date::text, 'to_service_center_code', 'BLR'),
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb);
  perform set_config('mi.draft_manifest', v_m.id::text, false);

  raise notice 'PASS [seed]';
end $$;

-- happy path inscan
do $$
declare
  v_res jsonb;
  v_st text;
  v_mse int;
  v_sse int;
  v_se int;
  v_me int;
begin
  v_res := public.scan_manifest(
    current_setting('mi.manifest')::uuid,
    current_setting('mi.awb1'),
    null, 'B1', 'AWB');
  if coalesce((v_res->>'ok')::boolean, false) is not true then
    raise exception 'FAIL [scan-ok]: %', v_res;
  end if;
  if coalesce((v_res->>'duplicate')::boolean, true) then
    raise exception 'FAIL [scan-not-dup]: %', v_res;
  end if;
  if (v_res->>'to_status') <> 'MANIFEST_INSCANNED' then
    raise exception 'FAIL [to_status]: %', v_res;
  end if;

  select current_status into v_st from public.shipments
   where id = current_setting('mi.ship1')::uuid;
  if v_st <> 'MANIFEST_INSCANNED' then raise exception 'FAIL [ship-status]: %', v_st; end if;

  select count(*) into v_mse from public.manifest_scan_events
   where manifest_id = current_setting('mi.manifest')::uuid
     and shipment_id = current_setting('mi.ship1')::uuid
     and event_type = 'INSCAN';
  if v_mse <> 1 then raise exception 'FAIL [manifest-scan-events]: %', v_mse; end if;

  select count(*) into v_sse from public.shipment_scan_events
   where shipment_id = current_setting('mi.ship1')::uuid
     and event_type = 'MANIFEST_INSCAN';
  if v_sse <> 1 then raise exception 'FAIL [shipment-scan-events]: %', v_sse; end if;

  select count(*) into v_se from public.shipment_events
   where shipment_id = current_setting('mi.ship1')::uuid
     and event_type = 'MANIFEST_INSCANNED';
  if v_se < 1 then raise exception 'FAIL [shipment-events]'; end if;

  select count(*) into v_me from public.manifest_events
   where manifest_id = current_setting('mi.manifest')::uuid
     and event_type = 'INSCAN';
  if v_me < 1 then raise exception 'FAIL [manifest-events]'; end if;

  raise notice 'PASS [happy-path-inscan]';
end $$;

-- duplicate scan (friendly, no extra events / no state change)
do $$
declare
  v_res jsonb;
  v_mse int;
  v_sse int;
  v_st text;
begin
  v_res := public.scan_manifest(
    current_setting('mi.manifest')::uuid,
    current_setting('mi.awb1'),
    null, null, 'AWB');
  if coalesce((v_res->>'duplicate')::boolean, false) is not true then
    raise exception 'FAIL [dup-flag]: %', v_res;
  end if;
  if coalesce((v_res->>'ok')::boolean, false) is not true then
    raise exception 'FAIL [dup-ok]: %', v_res;
  end if;

  select count(*) into v_mse from public.manifest_scan_events
   where manifest_id = current_setting('mi.manifest')::uuid
     and shipment_id = current_setting('mi.ship1')::uuid
     and event_type = 'INSCAN';
  if v_mse <> 1 then raise exception 'FAIL [dup-mse]: %', v_mse; end if;

  select count(*) into v_sse from public.shipment_scan_events
   where shipment_id = current_setting('mi.ship1')::uuid
     and event_type = 'MANIFEST_INSCAN';
  if v_sse <> 1 then raise exception 'FAIL [dup-sse]: %', v_sse; end if;

  select current_status into v_st from public.shipments
   where id = current_setting('mi.ship1')::uuid;
  if v_st <> 'MANIFEST_INSCANNED' then raise exception 'FAIL [dup-status]: %', v_st; end if;

  raise notice 'PASS [duplicate-scan]';
end $$;

-- append-only enforcement on scan event tables
do $$
declare
  v_eid uuid;
  v_text text;
  v_cnt integer;
begin
  select id, event_text into v_eid, v_text from public.manifest_scan_events
   where manifest_id = current_setting('mi.manifest')::uuid limit 1;

  begin
    update public.manifest_scan_events set event_text = 'x' where id = v_eid;
    if (select event_text from public.manifest_scan_events where id = v_eid) is not distinct from 'x' then
      raise exception 'FAIL [ao-mse-update]';
    end if;
  exception when sqlstate '0A000' then null;
  end;

  begin
    delete from public.manifest_scan_events where id = v_eid;
    select count(*) into v_cnt from public.manifest_scan_events where id = v_eid;
    if v_cnt = 0 then raise exception 'FAIL [ao-mse-delete]'; end if;
  exception when sqlstate '0A000' then null;
  end;

  if (select event_text from public.manifest_scan_events where id = v_eid) is distinct from v_text then
    raise exception 'FAIL [ao-mse-mutated]';
  end if;

  select id, event_text into v_eid, v_text from public.shipment_scan_events
   where shipment_id = current_setting('mi.ship1')::uuid limit 1;

  begin
    update public.shipment_scan_events set event_text = 'x' where id = v_eid;
    if (select event_text from public.shipment_scan_events where id = v_eid) is not distinct from 'x' then
      raise exception 'FAIL [ao-sse-update]';
    end if;
  exception when sqlstate '0A000' then null;
  end;

  begin
    delete from public.shipment_scan_events where id = v_eid;
    select count(*) into v_cnt from public.shipment_scan_events where id = v_eid;
    if v_cnt = 0 then raise exception 'FAIL [ao-sse-delete]'; end if;
  exception when sqlstate '0A000' then null;
  end;

  raise notice 'PASS [append-only]';
end $$;

-- invalid: draft manifest
do $$
begin
  begin
    perform public.scan_manifest(
      current_setting('mi.draft_manifest')::uuid,
      current_setting('mi.awb2'), null, null, 'AWB');
    raise exception 'FAIL [draft-manifest]';
  exception when sqlstate 'CMS04' then null;
  end;
  raise notice 'PASS [reject-draft-manifest]';
end $$;

-- invalid: shipment not on manifest
do $$
begin
  begin
    perform public.scan_manifest(
      current_setting('mi.manifest')::uuid,
      'NO-SUCH-AWB', null, null, 'AWB');
    raise exception 'FAIL [not-on-manifest]';
  exception when sqlstate 'CMS04' then null;
  end;
  raise notice 'PASS [reject-not-on-manifest]';
end $$;

-- invalid: cancelled shipment (if somehow on board — simulate by scanning cancelled awb not on manifest already covered;
-- put cancelled on a fresh closed manifest is blocked because cancel after booked — use status force via exception path:
-- scan ship2 first succeeds; then try ship with wrong status by asserting BOOKED path via direct check of cancelled awb not on lines)
do $$
begin
  begin
    perform public.scan_manifest(
      current_setting('mi.manifest')::uuid,
      current_setting('mi.cancelled_awb'), null, null, 'AWB');
    raise exception 'FAIL [cancelled-on-manifest]';
  exception when sqlstate 'CMS04' then null;
  end;
  raise notice 'PASS [reject-cancelled-not-on-manifest]';
end $$;

-- second shipment inscan (state machine)
do $$
declare
  v_res jsonb;
  v_st text;
  v_board jsonb;
begin
  v_res := public.scan_manifest(
    current_setting('mi.manifest')::uuid,
    null,
    current_setting('mi.ship2')::uuid,
    'B2', 'BAG');
  if coalesce((v_res->>'duplicate')::boolean, true) then
    raise exception 'FAIL [ship2-dup]: %', v_res;
  end if;
  select current_status into v_st from public.shipments
   where id = current_setting('mi.ship2')::uuid;
  if v_st <> 'MANIFEST_INSCANNED' then raise exception 'FAIL [ship2-status]: %', v_st; end if;

  v_board := public.get_manifest_inscan_board(current_setting('mi.manifest')::uuid);
  if (v_board->>'scanned_count')::int <> 2 then
    raise exception 'FAIL [board-scanned]: %', v_board;
  end if;
  if (v_board->>'pending_count')::int <> 0 then
    raise exception 'FAIL [board-pending]: %', v_board;
  end if;
  raise notice 'PASS [state-machine + board]';
end $$;

-- lookup manifest returns CLOSED only
do $$
declare
  v_cnt int;
  v_draft_hit int;
begin
  select count(*) into v_cnt
    from public.lookup('manifest', current_setting('mi.manifest_no'), 50);
  if v_cnt < 1 then raise exception 'FAIL [lookup-closed]'; end if;

  select count(*) into v_draft_hit
    from public.lookup('manifest', '%', 200) l
    join public.manifests m on m.id = l.id
   where m.status <> 'CLOSED';
  if v_draft_hit <> 0 then raise exception 'FAIL [lookup-non-closed]: %', v_draft_hit; end if;
  raise notice 'PASS [lookup-manifest]';
end $$;

-- tenant isolation: tenant B cannot inscan tenant A manifest
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000b035';
do $$
begin
  begin
    perform public.scan_manifest(
      current_setting('mi.manifest')::uuid,
      current_setting('mi.awb1'), null, null, 'AWB');
    raise exception 'FAIL [tenant-isolation]';
  exception
    when sqlstate 'P0002' then null;
    when sqlstate '42501' then null;
  end;
  raise notice 'PASS [tenant-isolation]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000035';

do $$
begin
  raise notice '==========================================================';
  raise notice 'MANIFEST INSCAN VERIFICATION PASSED.';
  raise notice '==========================================================';
end $$;

rollback;
