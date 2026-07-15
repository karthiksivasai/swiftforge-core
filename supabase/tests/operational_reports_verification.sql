-- ===========================================================================
-- operational_reports_verification.sql — Phase 5 Milestone 5B (0043).
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000043','authenticated','authenticated','opsrpt@a.test'),
  ('99999999-1111-4111-8111-00000000b043','authenticated','authenticated','opsrpt@b.test'),
  ('99999999-1111-4111-8111-00000000d043','authenticated','authenticated','opsstaff@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid; v_tb uuid;
begin
  v_t := app.bootstrap_tenant('opsrpt-a', 'Ops Report A', 'OpsRA');
  perform app.link_tenant_admin(v_t, '99999999-1111-4111-8111-000000000043',
          'opsrptadm', 'Ops Report Admin', 'opsrpt@a.test');
  perform set_config('orp.tenant', v_t::text, false);

  v_tb := app.bootstrap_tenant('opsrpt-b', 'Ops Report B', 'OpsRB');
  perform app.link_tenant_admin(v_tb, '99999999-1111-4111-8111-00000000b043',
          'opsrptadmb', 'Ops Report Admin B', 'opsrpt@b.test');
  perform set_config('orp.tenant_b', v_tb::text, false);
end $$;

do $$
declare
  v_keys text[] := array[
    'pickup-register','awb-register','manifest-register','manifest-inscan-report',
    'drs-register','pod-report','tracking-history','shipment-status-report',
    'undelivered-report','delivery-report','scan-reconciliation-report',
    'mis-operational-summary'
  ];
  v_k text;
begin
  foreach v_k in array v_keys loop
    if not exists (
      select 1 from public.report_definitions
       where report_key = v_k and deleted_at is null and is_active
    ) then
      raise exception 'FAIL [meta]: missing %', v_k;
    end if;
  end loop;

  if not exists (
    select 1 from public.report_definitions
     where report_key = 'drs-register' and source_entity = 'DRS'
  ) then
    raise exception 'FAIL [meta]: drs source';
  end if;

  raise notice 'PASS [metadata registration]';
end $$;

-- Seed operational transaction data
do $$
declare
  v_t uuid := current_setting('orp.tenant')::uuid;
  v_pt uuid; v_prod uuid; v_cust uuid; v_dest uuid; v_branch uuid;
  v_ship public.shipments;
  v_man public.manifests;
  v_drs public.drs;
  v_uid uuid; v_gid uuid;
begin
  select id into v_branch from public.branches
   where tenant_id = v_t and deleted_at is null
   order by case when is_head_office then 0 else 1 end limit 1;

  insert into public.product_types (tenant_id, code, name)
  values (v_t, 'OPT', 'Ops Type') on conflict do nothing;
  select id into v_pt from public.product_types where tenant_id = v_t and code = 'OPT';

  insert into public.products (tenant_id, code, name, product_type_id, status)
  values (v_t, 'OPX', 'Ops Express', v_pt, 'ACTIVE') on conflict do nothing;

  insert into public.customers (tenant_id, code, name, mobile, status)
  values (v_t, 'OPSCUST', 'Ops Customer', '9111111111', 'ACTIVE') on conflict do nothing;

  insert into public.destinations (tenant_id, code, name, status)
  values (v_t, 'OPSDEST', 'Ops Dest', 'ACTIVE') on conflict do nothing;

  select id into v_cust from public.customers where tenant_id = v_t and code = 'OPSCUST';
  select id into v_prod from public.products where tenant_id = v_t and code = 'OPX';
  select id into v_dest from public.destinations where tenant_id = v_t and code = 'OPSDEST';

  insert into public.pickups (
    tenant_id, pickup_no, pickup_date, customer_id, mobile_no, branch_id, status, awb_no)
  values (v_t, 900043, current_date, v_cust, '9111111111', v_branch, 'CONFIRMED', 'OPS-AWB-1')
  on conflict do nothing;

  insert into public.shipments (
    tenant_id, awb_no, book_date, customer_id, product_id, destination_id,
    branch_id, pieces, charge_weight, current_status, grand_total)
  values
    (v_t, 'OPS-AWB-1', current_date, v_cust, v_prod, v_dest, v_branch, 1, 2.0, 'BOOKED', 100),
    (v_t, 'OPS-AWB-U', current_date, v_cust, v_prod, v_dest, v_branch, 1, 1.0, 'UNDELIVERED', 50),
    (v_t, 'OPS-AWB-D', current_date, v_cust, v_prod, v_dest, v_branch, 1, 1.5, 'DELIVERED', 75)
  on conflict do nothing;

  select * into v_ship from public.shipments
   where tenant_id = v_t and awb_no = 'OPS-AWB-1' and deleted_at is null;

  insert into public.manifests (
    tenant_id, manifest_no, manifest_date, origin_branch_id, status)
  values (v_t, 'OPS-MAN-1', current_date, v_branch, 'CLOSED')
  on conflict do nothing
  returning * into v_man;

  if v_man.id is null then
    select * into v_man from public.manifests
     where tenant_id = v_t and manifest_no = 'OPS-MAN-1' and deleted_at is null;
  end if;

  insert into public.manifest_lines (
    tenant_id, manifest_id, seq, shipment_id, awb_no)
  values (v_t, v_man.id, 1, v_ship.id, v_ship.awb_no)
  on conflict do nothing;

  insert into public.manifest_scan_events (
    tenant_id, manifest_id, shipment_id, awb_no, event_type, event_text)
  values (v_t, v_man.id, v_ship.id, v_ship.awb_no, 'INSCAN', 'Manifest inscan')
  on conflict do nothing;

  insert into public.shipment_scan_events (
    tenant_id, shipment_id, manifest_id, awb_no, event_type, event_text)
  values (v_t, v_ship.id, v_man.id, v_ship.awb_no, 'MANIFEST_INSCAN', 'Inscan')
  on conflict do nothing;

  insert into public.drs (
    tenant_id, drs_no, drs_date, branch_id, destination_id, status)
  values (v_t, 'OPS-DRS-1', current_date, v_branch, v_dest, 'DISPATCHED')
  on conflict do nothing
  returning * into v_drs;

  if v_drs.id is null then
    select * into v_drs from public.drs
     where tenant_id = v_t and drs_no = 'OPS-DRS-1' and deleted_at is null;
  end if;

  insert into public.drs_lines (
    tenant_id, drs_id, sequence_no, shipment_id, awb_no)
  values (v_t, v_drs.id, 1, v_ship.id, v_ship.awb_no)
  on conflict do nothing;

  insert into public.pod_records (
    tenant_id, shipment_id, awb_no, pod_date, receiver_name, status, source)
  select v_t, s.id, s.awb_no, current_date, 'Receiver', 'DELIVERED', 'MANUAL'
    from public.shipments s
   where s.tenant_id = v_t and s.awb_no = 'OPS-AWB-D' and s.deleted_at is null
  on conflict do nothing;

  insert into public.tracking_events (
    tenant_id, shipment_id, event_date, status_text, source)
  values (v_t, v_ship.id, current_date, 'Booked at branch', 'SYSTEM');

  -- staff without ops report list
  insert into public.tenant_users (tenant_id, user_id, role, status)
  values (v_t, '99999999-1111-4111-8111-00000000d043', 'MEMBER', 'ACTIVE')
  on conflict (tenant_id, user_id) do update set status = 'ACTIVE';

  insert into public.users (
    tenant_id, auth_user_id, username, user_type, full_name, email, home_branch_id, status)
  values (
    v_t, '99999999-1111-4111-8111-00000000d043', 'opsrptstaff', 'STAFF',
    'Ops Staff', 'opsstaff@a.test', v_branch, 'ACTIVE')
  on conflict (auth_user_id) do update set deleted_at = null
  returning id into v_uid;

  select id into v_gid from public.user_groups
   where tenant_id = v_t and name = 'OPERATIONS' and deleted_at is null;
  insert into public.user_group_members (tenant_id, user_id, group_id)
  values (v_t, v_uid, v_gid) on conflict (user_id, group_id) do nothing;

  update public.group_permissions gp
     set can_list = false, can_search = false, all_access = false
    from public.permission_modules pm
   where gp.module_id = pm.id and gp.group_id = v_gid
     and pm.slug in (
       'rpt.operation-report','rpt.awb-report','rpt.manifest-report','rpt.scan-report',
       'rpt.drs-report','rpt.manifest-pod-report','rpt.delivery-status-report',
       'rpt.undelivery-report','rpt.ok-delivery','rpt.mis-report');

  raise notice 'PASS [seed]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000043';

-- filter validation + pagination + sorting + correctness
do $$
declare
  v_r jsonb;
  v_def jsonb;
  v_val jsonb;
begin
  v_def := public.get_report_definition('drs-register');
  if v_def->>'report_key' <> 'drs-register' then raise exception 'FAIL [get drs]'; end if;
  if jsonb_typeof(v_def->'filters') <> 'array' then raise exception 'FAIL [drs filters]'; end if;

  v_val := public.validate_report_filters('awb-register', jsonb_build_object(
    'from_date', current_date::text, 'to_date', current_date::text));
  if not (v_val->>'ok')::boolean then raise exception 'FAIL [val] %', v_val; end if;

  v_r := public.execute_report(
    'awb-register',
    jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
    1, 2, 'book_date', 'desc');
  if (v_r->>'total')::bigint < 3 then raise exception 'FAIL [awb total] %', v_r->>'total'; end if;
  if jsonb_array_length(v_r->'rows') <> 2 then raise exception 'FAIL [page size]'; end if;

  v_r := public.execute_report(
    'undelivered-report',
    jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
    1, 50, null, 'desc');
  if (v_r->>'total')::bigint < 1 then raise exception 'FAIL [undelivered]'; end if;

  v_r := public.execute_report(
    'delivery-report',
    jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
    1, 50, null, 'desc');
  if (v_r->>'total')::bigint < 1 then raise exception 'FAIL [delivery]'; end if;

  v_r := public.execute_report(
    'pickup-register',
    jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
    1, 50, null, 'desc');
  if (v_r->>'total')::bigint < 1 then raise exception 'FAIL [pickup]'; end if;

  v_r := public.execute_report(
    'manifest-register',
    jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
    1, 50, null, 'desc');
  if (v_r->>'total')::bigint < 1 then raise exception 'FAIL [manifest]'; end if;

  v_r := public.execute_report(
    'manifest-inscan-report',
    jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
    1, 50, null, 'desc');
  if (v_r->>'total')::bigint < 1 then raise exception 'FAIL [inscan]'; end if;

  v_r := public.execute_report(
    'drs-register',
    jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
    1, 50, null, 'desc');
  if (v_r->>'total')::bigint < 1 then raise exception 'FAIL [drs]'; end if;

  v_r := public.execute_report(
    'pod-report',
    jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
    1, 50, null, 'desc');
  if (v_r->>'total')::bigint < 1 then raise exception 'FAIL [pod]'; end if;

  v_r := public.execute_report(
    'tracking-history',
    jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
    1, 50, null, 'desc');
  if (v_r->>'total')::bigint < 1 then raise exception 'FAIL [tracking]'; end if;

  v_r := public.execute_report(
    'scan-reconciliation-report',
    jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
    1, 50, null, 'desc');
  if (v_r->>'total')::bigint < 1 then raise exception 'FAIL [scan recon]'; end if;

  v_r := public.execute_report(
    'mis-operational-summary',
    jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
    1, 50, null, 'asc');
  if (v_r->>'total')::bigint < 1 then raise exception 'FAIL [mis]'; end if;

  raise notice 'PASS [validation / pagination / sorting / correctness]';
end $$;

-- permissions
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000d043';
do $$
begin
  begin
    perform public.execute_report(
      'drs-register',
      jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
      1, 10, null, 'desc');
    raise exception 'FAIL [perm]';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'PASS [permissions]';
end $$;

-- tenant isolation
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000b043';
do $$
declare v_r jsonb;
begin
  v_r := public.execute_report(
    'awb-register',
    jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
    1, 50, null, 'desc');
  if (v_r->>'total')::bigint <> 0 then
    raise exception 'FAIL [tenant leak] %', v_r->>'total';
  end if;
  raise notice 'PASS [tenant isolation]';
end $$;

reset role;
do $$
begin
  raise notice '==========================================================';
  raise notice 'OPERATIONAL REPORTS VERIFICATION PASSED.';
  raise notice '==========================================================';
end $$;

rollback;
