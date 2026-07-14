-- ===========================================================================
-- manifest_foundation_verification.sql — Phase 4 Milestone 4A (0034).
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000034','authenticated','authenticated','mf@a.test'),
  ('99999999-1111-4111-8111-00000000c034','authenticated','authenticated','mfstaff@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid;
begin
  v_t := app.bootstrap_tenant('mf-a', 'Manifest Tenant A', 'MfA');
  perform app.link_tenant_admin(v_t, '99999999-1111-4111-8111-000000000034',
          'mfadm', 'Manifest Admin', 'mf@a.test');
  perform set_config('mf.tenant', v_t::text, false);
end $$;

do $$
begin
  if to_regclass('public.manifests') is null then raise exception 'FAIL [table]: manifests'; end if;
  if to_regclass('public.manifest_lines') is null then raise exception 'FAIL [table]: lines'; end if;
  if to_regclass('public.manifest_comments') is null then raise exception 'FAIL [table]: comments'; end if;
  if to_regclass('public.manifest_attachments') is null then raise exception 'FAIL [table]: attachments'; end if;
  if to_regclass('public.manifest_events') is null then raise exception 'FAIL [table]: events'; end if;
  if to_regprocedure('public.save_manifest(uuid,integer,jsonb,jsonb,jsonb,jsonb)') is null then
    raise exception 'FAIL [fn]: save_manifest';
  end if;
  if to_regprocedure('public.close_manifest(uuid,integer)') is null then
    raise exception 'FAIL [fn]: close_manifest';
  end if;
  if to_regprocedure('public.cancel_manifest(uuid,integer,text)') is null then
    raise exception 'FAIL [fn]: cancel_manifest';
  end if;
  if not app.status_transition_allowed('MANIFEST','DRAFT','CLOSED') then
    raise exception 'FAIL [status]: DRAFT->CLOSED';
  end if;
  if not app.status_transition_allowed('SHIPMENT','BOOKED','MANIFESTED') then
    raise exception 'FAIL [status]: BOOKED->MANIFESTED';
  end if;
  raise notice 'PASS [structure]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000034';

-- seed masters + BOOKED shipments
do $$
declare
  v_t uuid := current_setting('mf.tenant')::uuid;
  v_pt uuid;
  v_s public.shipments;
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

  insert into public.vendors (tenant_id, code, name, mobile, status)
  values (v_t, 'DHL1', 'DHL Partner', '9000000099', 'ACTIVE') on conflict do nothing;

  -- booked shipment 1
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
  perform set_config('mf.ship1', v_s.id::text, false);
  perform set_config('mf.awb1', v_s.awb_no, false);

  -- booked shipment 2
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
  perform set_config('mf.ship2', v_s.id::text, false);
  perform set_config('mf.awb2', v_s.awb_no, false);

  -- draft shipment (ineligible)
  v_s := public.save_shipment(
    null, null,
    jsonb_build_object(
      'customer_code','CUST1','product_code','SPX',
      'origin_code','HYD','destination_code','BLR',
      'book_date', current_date::text, 'pieces','1'
    ),
    jsonb_build_array(jsonb_build_object('pieces','1','charge_weight','1')),
    '[]'::jsonb,'[]'::jsonb,'[]'::jsonb);
  perform set_config('mf.draft', v_s.id::text, false);

  raise notice 'PASS [seed]';
end $$;

-- create DRAFT manifest + lines + numbering
do $$
declare
  v_m public.manifests;
  v_lc int;
  v_ev int;
  v_no1 text;
begin
  v_m := public.save_manifest(
    null, null,
    jsonb_build_object(
      'manifest_date', current_date::text,
      'manifest_time', '14:30',
      'to_type', 'SERVICE_CENTER',
      'to_service_center_code', 'BLR',
      'location_code', 'HYD',
      'connect_station', 'Bangalore'
    ),
    jsonb_build_array(
      jsonb_build_object('shipment_id', current_setting('mf.ship1'), 'bag_no', 'B1')
    ),
    jsonb_build_array(jsonb_build_object('comment','Created via harness')),
    '[]'::jsonb
  );
  if v_m.status <> 'DRAFT' then raise exception 'FAIL [create-status]: %', v_m.status; end if;
  if v_m.manifest_no is null or v_m.manifest_no = '' then raise exception 'FAIL [no]'; end if;
  v_no1 := v_m.manifest_no;

  select count(*) into v_lc from public.manifest_lines where manifest_id = v_m.id;
  select count(*) into v_ev from public.manifest_events where manifest_id = v_m.id and event_type = 'CREATED';
  if v_lc <> 1 then raise exception 'FAIL [lines]: %', v_lc; end if;
  if v_ev <> 1 then raise exception 'FAIL [event-created]'; end if;

  perform set_config('mf.id1', v_m.id::text, false);
  perform set_config('mf.rv1', v_m.row_version::text, false);
  perform set_config('mf.no1', v_no1, false);
  raise notice 'PASS [create-draft] no=%', v_no1;
end $$;

-- gapless next number
do $$
declare
  v_m public.manifests;
  v_no1 text := current_setting('mf.no1');
begin
  v_m := public.save_manifest(
    null, null,
    jsonb_build_object('manifest_date', current_date::text, 'to_type', 'THIRD_PARTY', 'vendor_code', 'DHL1'),
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb);
  if v_m.manifest_no = v_no1 then raise exception 'FAIL [gapless]: duplicate'; end if;
  perform set_config('mf.id2', v_m.id::text, false);
  perform set_config('mf.rv2', v_m.row_version::text, false);
  raise notice 'PASS [numbering-gapless]';
end $$;

-- reject DRAFT shipment on line
do $$
declare
  v_id uuid := current_setting('mf.id2')::uuid;
  v_rv integer;
begin
  select row_version into v_rv from public.manifests where id = v_id;
  begin
    perform public.save_manifest(
      v_id, v_rv,
      jsonb_build_object('manifest_date', current_date::text, 'vendor_code', 'DHL1', 'to_type', 'THIRD_PARTY'),
      jsonb_build_array(jsonb_build_object('shipment_id', current_setting('mf.draft'))),
      '[]'::jsonb, '[]'::jsonb);
    raise exception 'FAIL [draft-line]';
  exception when sqlstate 'CMS04' then null;
  end;
  raise notice 'PASS [shipment-eligibility-draft]';
end $$;

-- optimistic lock
do $$
declare v_id uuid := current_setting('mf.id1')::uuid;
begin
  begin
    perform public.save_manifest(
      v_id, 999,
      jsonb_build_object('manifest_date', current_date::text, 'to_service_center_code', 'BLR'),
      jsonb_build_array(jsonb_build_object('shipment_id', current_setting('mf.ship1'))),
      '[]'::jsonb, '[]'::jsonb);
    raise exception 'FAIL [optlock]';
  exception when sqlstate '40001' then null;
  end;
  raise notice 'PASS [optimistic-locking]';
end $$;

-- close → MANIFESTED + audit + immutable
do $$
declare
  v_m public.manifests;
  v_id uuid := current_setting('mf.id1')::uuid;
  v_rv integer;
  v_st text;
  v_ev int;
  v_audit int;
  v_t uuid := current_setting('mf.tenant')::uuid;
begin
  select row_version into v_rv from public.manifests where id = v_id;
  v_m := public.close_manifest(v_id, v_rv);
  if v_m.status <> 'CLOSED' then raise exception 'FAIL [close]: %', v_m.status; end if;

  select current_status into v_st from public.shipments where id = current_setting('mf.ship1')::uuid;
  if v_st <> 'MANIFESTED' then raise exception 'FAIL [ship-manifested]: %', v_st; end if;

  select count(*) into v_ev from public.manifest_events where manifest_id = v_id and event_type = 'CLOSED';
  if v_ev <> 1 then raise exception 'FAIL [event-closed]'; end if;

  if not exists (
    select 1 from public.shipment_events
     where shipment_id = current_setting('mf.ship1')::uuid and event_type = 'MANIFESTED'
  ) then raise exception 'FAIL [ship-event]'; end if;

  select count(*) into v_audit from public.audit_logs
   where tenant_id = v_t and entity_type = 'manifests' and entity_id = v_id
     and action = 'MODIFY' and (new_values->>'status') = 'CLOSED';
  if v_audit < 1 then raise exception 'FAIL [audit-closed]'; end if;

  begin
    perform public.save_manifest(
      v_id, v_m.row_version,
      jsonb_build_object('manifest_date', current_date::text, 'to_service_center_code', 'BLR'),
      jsonb_build_array(jsonb_build_object('shipment_id', current_setting('mf.ship1'))),
      '[]'::jsonb, '[]'::jsonb);
    raise exception 'FAIL [edit-closed]';
  exception when sqlstate 'CMS02' then null;
  end;

  -- already manifested cannot be added to another DRAFT
  begin
    perform public.save_manifest(
      current_setting('mf.id2')::uuid,
      (select row_version from public.manifests where id = current_setting('mf.id2')::uuid),
      jsonb_build_object('manifest_date', current_date::text, 'vendor_code', 'DHL1', 'to_type', 'THIRD_PARTY'),
      jsonb_build_array(jsonb_build_object('shipment_id', current_setting('mf.ship1'))),
      '[]'::jsonb, '[]'::jsonb);
    raise exception 'FAIL [already-manifested]';
  exception when sqlstate 'CMS04' then null;
  end;

  perform set_config('mf.rv1', v_m.row_version::text, false);
  raise notice 'PASS [close + manifested + immutable]';
end $$;

-- aggregate sync: update DRAFT id2 with ship2 then replace
do $$
declare
  v_m public.manifests;
  v_id uuid := current_setting('mf.id2')::uuid;
  v_rv integer;
  v_lc int;
begin
  select row_version into v_rv from public.manifests where id = v_id;
  v_m := public.save_manifest(
    v_id, v_rv,
    jsonb_build_object('manifest_date', current_date::text, 'vendor_code', 'DHL1', 'to_type', 'THIRD_PARTY'),
    jsonb_build_array(jsonb_build_object('shipment_id', current_setting('mf.ship2'), 'bag_no', 'X')),
    '[]'::jsonb, '[]'::jsonb);
  select count(*) into v_lc from public.manifest_lines where manifest_id = v_id;
  if v_lc <> 1 then raise exception 'FAIL [sync-lines]: %', v_lc; end if;
  perform set_config('mf.rv2', v_m.row_version::text, false);
  raise notice 'PASS [aggregate-sync]';
end $$;

-- cancel DRAFT id2
do $$
declare
  v_m public.manifests;
begin
  v_m := public.cancel_manifest(
    current_setting('mf.id2')::uuid,
    current_setting('mf.rv2')::integer,
    'test cancel');
  if v_m.status <> 'CANCELLED' then raise exception 'FAIL [cancel]: %', v_m.status; end if;
  if not exists (
    select 1 from public.manifest_events
     where manifest_id = v_m.id and event_type = 'CANCELLED'
  ) then raise exception 'FAIL [event-cancelled]'; end if;
  raise notice 'PASS [cancel]';
end $$;

-- append-only events
do $$
declare
  v_eid uuid;
  v_text text;
  v_cnt integer;
begin
  select id, event_text into v_eid, v_text from public.manifest_events
   where manifest_id = current_setting('mf.id1')::uuid limit 1;

  begin
    update public.manifest_events set event_text = 'x' where id = v_eid;
    if (select event_text from public.manifest_events where id = v_eid) is not distinct from 'x' then
      raise exception 'FAIL [append-only-update]';
    end if;
  exception when sqlstate '0A000' then null;
  end;

  begin
    delete from public.manifest_events where id = v_eid;
    select count(*) into v_cnt from public.manifest_events where id = v_eid;
    if v_cnt = 0 then raise exception 'FAIL [append-only-delete]'; end if;
  exception when sqlstate '0A000' then null;
  end;

  if (select event_text from public.manifest_events where id = v_eid) is distinct from v_text then
    raise exception 'FAIL [append-only]: event mutated';
  end if;
  raise notice 'PASS [append-only-events]';
end $$;

-- permission enforcement
do $$
declare
  v_t uuid := current_setting('mf.tenant')::uuid;
  v_s public.shipments;
  v_m public.manifests;
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
  v_s := public.confirm_booking(v_s.id, v_s.row_version);

  v_m := public.save_manifest(
    null, null,
    jsonb_build_object('manifest_date', current_date::text, 'to_service_center_code', 'BLR'),
    jsonb_build_array(jsonb_build_object('shipment_id', v_s.id::text)),
    '[]'::jsonb, '[]'::jsonb);
  perform set_config('mf.perm_id', v_m.id::text, false);
  perform set_config('mf.perm_rv', v_m.row_version::text, false);

  select id into v_branch from public.branches where tenant_id = v_t and deleted_at is null limit 1;
  insert into public.users (
    tenant_id, auth_user_id, username, user_type, full_name, email, home_branch_id, status)
  values (
    v_t, '99999999-1111-4111-8111-00000000c034', 'mfstaff', 'STAFF',
    'Mf Staff', 'mfstaff@a.test', v_branch, 'ACTIVE')
  on conflict (auth_user_id) do update set deleted_at = null
  returning id into v_uid;

  select id into v_gid from public.user_groups
   where tenant_id = v_t and name = 'OPERATIONS' and deleted_at is null;
  insert into public.user_group_members (tenant_id, user_id, group_id)
  values (v_t, v_uid, v_gid) on conflict (user_id, group_id) do nothing;

  update public.group_permissions gp
     set can_modify = false, can_add = false, all_access = false
    from public.permission_modules pm
   where gp.module_id = pm.id and gp.group_id = v_gid and pm.slug = 'txn.manifest-scan';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000c034';
do $$
declare
  v_t uuid := current_setting('mf.tenant')::uuid;
begin
  if app.user_has_permission(v_t, 'txn.manifest-scan', 'modify') then
    raise exception 'FAIL [perm-setup]';
  end if;
  begin
    perform public.close_manifest(
      current_setting('mf.perm_id')::uuid,
      current_setting('mf.perm_rv')::integer);
    raise exception 'FAIL [perm-close]';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'PASS [permission-enforcement]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000034';

do $$
begin
  raise notice '==========================================================';
  raise notice 'MANIFEST FOUNDATION VERIFICATION PASSED.';
  raise notice '==========================================================';
end $$;

rollback;
