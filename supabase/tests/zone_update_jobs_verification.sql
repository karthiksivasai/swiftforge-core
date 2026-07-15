-- ===========================================================================
-- zone_update_jobs_verification.sql — Phase 6 Milestone 6C (0051).
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000051','authenticated','authenticated','zone@a.test'),
  ('99999999-1111-4111-8111-00000000b051','authenticated','authenticated','zone@b.test'),
  ('99999999-1111-4111-8111-00000000d051','authenticated','authenticated','zonestaff@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid; v_tb uuid;
begin
  v_t := app.bootstrap_tenant('zone-a', 'Zone A', 'ZoneA');
  perform app.link_tenant_admin(v_t, '99999999-1111-4111-8111-000000000051',
          'zoneadm', 'Zone Admin', 'zone@a.test');
  perform set_config('zu.tenant', v_t::text, false);

  v_tb := app.bootstrap_tenant('zone-b', 'Zone B', 'ZoneB');
  perform app.link_tenant_admin(v_tb, '99999999-1111-4111-8111-00000000b051',
          'zoneadmb', 'Zone Admin B', 'zone@b.test');
  perform set_config('zu.tenant_b', v_tb::text, false);
end $$;

do $$
begin
  if to_regclass('public.zone_update_jobs') is null then raise exception 'FAIL [table]'; end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'shipments' and column_name = 'zone_id'
  ) then
    raise exception 'FAIL [shipments.zone_id]';
  end if;
  if to_regprocedure('public.create_zone_update_job(jsonb,boolean)') is null then
    raise exception 'FAIL [fn] create';
  end if;
  if to_regprocedure('public.execute_zone_update_job(uuid)') is null then
    raise exception 'FAIL [fn] execute';
  end if;
  if to_regprocedure('public.list_zone_update_jobs(text,integer,integer)') is null then
    raise exception 'FAIL [fn] list';
  end if;
  if to_regprocedure('public.get_zone_update_job(uuid)') is null then
    raise exception 'FAIL [fn] get';
  end if;
  if to_regprocedure('public.cancel_zone_update_job(uuid)') is null then
    raise exception 'FAIL [fn] cancel';
  end if;
  raise notice 'PASS [structure]';
end $$;

do $$
declare
  v_t uuid := current_setting('zu.tenant')::uuid;
  v_branch uuid; v_cust uuid; v_pt uuid; v_prod uuid;
  v_dest uuid; v_origin uuid;
  v_zone_old uuid; v_zone_new uuid;
  v_s1 uuid; v_s2 uuid; v_s3 uuid; v_s4 uuid;
  v_uid uuid; v_gid uuid;
begin
  select id into v_branch from public.branches
   where tenant_id = v_t and deleted_at is null
   order by case when is_head_office then 0 else 1 end limit 1;

  insert into public.zones (tenant_id, code, name)
  values (v_t, 'ZZOLD', 'Zone Old'), (v_t, 'ZZNEW', 'Zone New')
  on conflict do nothing;
  select id into v_zone_old from public.zones where tenant_id = v_t and code = 'ZZOLD';
  select id into v_zone_new from public.zones where tenant_id = v_t and code = 'ZZNEW';

  insert into public.product_types (tenant_id, code, name)
  values (v_t, 'ZPT', 'Zone PT') on conflict do nothing;
  select id into v_pt from public.product_types where tenant_id = v_t and code = 'ZPT';

  insert into public.products (tenant_id, code, name, product_type_id, status)
  values (v_t, 'ZPX', 'Zone Express', v_pt, 'ACTIVE') on conflict do nothing;
  select id into v_prod from public.products where tenant_id = v_t and code = 'ZPX';

  insert into public.customers (tenant_id, code, name, mobile, status)
  values (v_t, 'ZONECUST', 'Zone Customer', '9333333333', 'ACTIVE') on conflict do nothing;
  select id into v_cust from public.customers where tenant_id = v_t and code = 'ZONECUST';

  insert into public.destinations (tenant_id, code, name, status, zone_id)
  values
    (v_t, 'ZONEORIG', 'Zone Origin', 'ACTIVE', v_zone_old),
    (v_t, 'ZONEDEST', 'Zone Dest', 'ACTIVE', v_zone_old)
  on conflict do nothing;
  select id into v_origin from public.destinations where tenant_id = v_t and code = 'ZONEORIG';
  select id into v_dest from public.destinations where tenant_id = v_t and code = 'ZONEDEST';

  -- Mapping that remaps destination to ZZNEW (overrides destination.zone_id)
  insert into public.zone_mappings (
    tenant_id, destination_id, zone_id, effective_date)
  values (v_t, v_dest, v_zone_new, current_date - 1);

  -- editable: wrong current zone → should update (+ optional rerate)
  insert into public.shipments (
    tenant_id, awb_no, book_date, customer_id, product_id,
    origin_destination_id, destination_id, branch_id,
    pieces, charge_weight, actual_weight, current_status, zone_id)
  values (v_t, 'ZONE-OK-1', current_date, v_cust, v_prod,
          v_origin, v_dest, v_branch, 1, 2, 2, 'BOOKED', v_zone_old)
  returning id into v_s1;

  -- unchanged zone already ZZNEW → skip
  insert into public.shipments (
    tenant_id, awb_no, book_date, customer_id, product_id,
    origin_destination_id, destination_id, branch_id,
    pieces, charge_weight, current_status, zone_id)
  values (v_t, 'ZONE-SAME-1', current_date, v_cust, v_prod,
          v_origin, v_dest, v_branch, 1, 1, 'BOOKED', v_zone_new)
  returning id into v_s4;

  -- locked → skip
  insert into public.shipments (
    tenant_id, awb_no, book_date, customer_id, product_id,
    origin_destination_id, destination_id, branch_id,
    pieces, charge_weight, current_status, is_locked, zone_id)
  values (v_t, 'ZONE-LOCK-1', current_date, v_cust, v_prod,
          v_origin, v_dest, v_branch, 1, 1, 'BOOKED', true, v_zone_old)
  returning id into v_s2;

  -- invoiced → skip
  insert into public.shipments (
    tenant_id, awb_no, book_date, customer_id, product_id,
    origin_destination_id, destination_id, branch_id,
    pieces, charge_weight, current_status, invoice_id, zone_id)
  values (v_t, 'ZONE-INV-1', current_date, v_cust, v_prod,
          v_origin, v_dest, v_branch, 1, 1, 'BOOKED', gen_random_uuid(), v_zone_old)
  returning id into v_s3;

  -- cancelled → skip
  insert into public.shipments (
    tenant_id, awb_no, book_date, customer_id, product_id,
    origin_destination_id, destination_id, branch_id,
    pieces, charge_weight, current_status, zone_id)
  values (v_t, 'ZONE-CXL-1', current_date, v_cust, v_prod,
          v_origin, v_dest, v_branch, 1, 1, 'CANCELLED', v_zone_old);

  perform set_config('zu.ship_ok', v_s1::text, false);
  perform set_config('zu.ship_same', v_s4::text, false);
  perform set_config('zu.zone_new', v_zone_new::text, false);

  insert into public.tenant_users (tenant_id, user_id, role, status)
  values (v_t, '99999999-1111-4111-8111-00000000d051', 'MEMBER', 'ACTIVE')
  on conflict (tenant_id, user_id) do update set status = 'ACTIVE';

  insert into public.users (
    tenant_id, auth_user_id, username, user_type, full_name, email, home_branch_id, status)
  values (
    v_t, '99999999-1111-4111-8111-00000000d051', 'zonestaff', 'STAFF',
    'Zone Staff', 'zonestaff@a.test', v_branch, 'ACTIVE')
  on conflict (auth_user_id) do update set deleted_at = null
  returning id into v_uid;

  select id into v_gid from public.user_groups
   where tenant_id = v_t and name = 'OPERATIONS' and deleted_at is null;
  insert into public.user_group_members (tenant_id, user_id, group_id)
  values (v_t, v_uid, v_gid) on conflict (user_id, group_id) do nothing;

  update public.group_permissions gp
     set can_add = false, can_modify = false, can_list = false, can_search = false,
         all_access = false
    from public.permission_modules pm
   where gp.module_id = pm.id and gp.group_id = v_gid
     and pm.slug = 'utl.zone-update';

  raise notice 'PASS [seed]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000051';

do $$
declare
  v_job jsonb;
  v_id uuid;
  v_exec jsonb;
  v_get jsonb;
  v_list jsonb;
  v_cancel jsonb;
  v_id2 uuid;
  v_filters jsonb := jsonb_build_object(
    'from_date', current_date::text,
    'to_date', current_date::text,
    'customer_code', 'ZONECUST');
  v_zone uuid;
  v_audit int;
  v_rated_at timestamptz;
begin
  -- Job without rerate: zone change only
  v_job := public.create_zone_update_job(v_filters, false);
  if v_job->>'status' <> 'QUEUED' then raise exception 'FAIL [create]'; end if;
  if (v_job->>'total_shipments')::int < 5 then raise exception 'FAIL [total filter]'; end if;
  if (v_job->>'rerate_after_update')::boolean <> false then
    raise exception 'FAIL [rerate flag]';
  end if;
  v_id := (v_job->>'id')::uuid;

  v_exec := public.execute_zone_update_job(v_id);
  if v_exec->>'status' <> 'COMPLETED' then raise exception 'FAIL [exec] %', v_exec; end if;
  if (v_exec->>'updated_shipments')::int < 1 then raise exception 'FAIL [updated]'; end if;
  -- locked + invoiced + cancelled + unchanged = at least 4 skips
  if (v_exec->>'skipped_shipments')::int < 4 then
    raise exception 'FAIL [skipped] %', v_exec;
  end if;

  select zone_id into v_zone from public.shipments
   where id = current_setting('zu.ship_ok')::uuid;
  if v_zone is distinct from current_setting('zu.zone_new')::uuid then
    raise exception 'FAIL [zone recalc]';
  end if;

  -- unchanged shipment still ZZNEW
  select zone_id into v_zone from public.shipments
   where id = current_setting('zu.ship_same')::uuid;
  if v_zone is distinct from current_setting('zu.zone_new')::uuid then
    raise exception 'FAIL [unchanged preserve]';
  end if;

  if not exists (
    select 1 from public.audit_logs a
     where a.entity_type = 'shipments'
       and a.entity_id = current_setting('zu.ship_ok')::uuid
       and a.module_slug = 'utl.zone-update'
  ) then
    raise exception 'FAIL [shipment audit]';
  end if;

  if not exists (
    select 1 from public.audit_logs a
     where a.entity_type = 'zone_update_jobs'
       and a.entity_id = v_id
  ) then
    raise exception 'FAIL [job audit]';
  end if;

  v_get := public.get_zone_update_job(v_id);
  if (v_get->>'progress')::int <> 100 then raise exception 'FAIL [progress]'; end if;

  v_list := public.list_zone_update_jobs('COMPLETED', 1, 20);
  if (v_list->>'total')::int < 1 then raise exception 'FAIL [list]'; end if;

  -- Optional rerate path: reset zone, run with rerate_after_update=true
  update public.shipments
     set zone_id = (
       select id from public.zones
        where tenant_id = current_setting('zu.tenant')::uuid and code = 'ZZOLD'
     ),
         rated_at = null
   where id = current_setting('zu.ship_ok')::uuid;

  v_job := public.create_zone_update_job(v_filters, true);
  v_id := (v_job->>'id')::uuid;
  v_exec := public.execute_zone_update_job(v_id);
  if v_exec->>'status' <> 'COMPLETED' then raise exception 'FAIL [rerate exec] %', v_exec; end if;
  if (v_exec->>'updated_shipments')::int < 1 then raise exception 'FAIL [rerate updated]'; end if;

  select rated_at into v_rated_at from public.shipments
   where id = current_setting('zu.ship_ok')::uuid;
  if v_rated_at is null then raise exception 'FAIL [optional rerate]'; end if;

  select count(*) into v_audit from public.rating_audit
   where shipment_id = current_setting('zu.ship_ok')::uuid;
  if v_audit < 1 then raise exception 'FAIL [rating audit]'; end if;

  -- cancel before complete
  v_job := public.create_zone_update_job(v_filters, false);
  v_id2 := (v_job->>'id')::uuid;
  v_cancel := public.cancel_zone_update_job(v_id2);
  if v_cancel->>'status' <> 'CANCELLED' then raise exception 'FAIL [cancel]'; end if;

  begin
    perform public.execute_zone_update_job(v_id2);
    raise exception 'FAIL [exec cancelled]';
  exception when sqlstate 'CMS04' then null;
  end;

  raise notice 'PASS [lifecycle / zone / skip / rerate / audit / cancel]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000d051';
do $$
begin
  begin
    perform public.create_zone_update_job(
      jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
      false);
    raise exception 'FAIL [perm]';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'PASS [permissions]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000b051';
do $$
declare v_list jsonb; v_id uuid;
begin
  select id into v_id from public.zone_update_jobs
   where tenant_id = current_setting('zu.tenant')::uuid limit 1;

  v_list := public.list_zone_update_jobs(null, 1, 50);
  if (v_list->>'total')::int <> 0 then raise exception 'FAIL [tenant list]'; end if;

  if v_id is not null then
    begin
      perform public.get_zone_update_job(v_id);
      raise exception 'FAIL [tenant get]';
    exception when sqlstate 'P0002' then null;
    end;
  end if;
  raise notice 'PASS [tenant isolation]';
end $$;

reset role;
do $$
begin
  raise notice '==========================================================';
  raise notice 'ZONE UPDATE JOBS VERIFICATION PASSED.';
  raise notice '==========================================================';
end $$;

rollback;
