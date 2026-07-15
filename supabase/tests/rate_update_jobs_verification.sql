-- ===========================================================================
-- rate_update_jobs_verification.sql — Phase 6 Milestone 6B (0050).
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000050','authenticated','authenticated','rate@a.test'),
  ('99999999-1111-4111-8111-00000000b050','authenticated','authenticated','rate@b.test'),
  ('99999999-1111-4111-8111-00000000d050','authenticated','authenticated','ratestaff@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid; v_tb uuid;
begin
  v_t := app.bootstrap_tenant('rate-a', 'Rate A', 'RateA');
  perform app.link_tenant_admin(v_t, '99999999-1111-4111-8111-000000000050',
          'rateadm', 'Rate Admin', 'rate@a.test');
  perform set_config('ru.tenant', v_t::text, false);

  v_tb := app.bootstrap_tenant('rate-b', 'Rate B', 'RateB');
  perform app.link_tenant_admin(v_tb, '99999999-1111-4111-8111-00000000b050',
          'rateadmb', 'Rate Admin B', 'rate@b.test');
  perform set_config('ru.tenant_b', v_tb::text, false);
end $$;

do $$
begin
  if to_regclass('public.rate_update_jobs') is null then raise exception 'FAIL [table]'; end if;
  if to_regprocedure('public.create_rate_update_job(text,jsonb)') is null then
    raise exception 'FAIL [fn] create';
  end if;
  if to_regprocedure('public.execute_rate_update_job(uuid)') is null then
    raise exception 'FAIL [fn] execute';
  end if;
  if to_regprocedure('public.list_rate_update_jobs(text,integer,integer)') is null then
    raise exception 'FAIL [fn] list';
  end if;
  if to_regprocedure('public.get_rate_update_job(uuid)') is null then
    raise exception 'FAIL [fn] get';
  end if;
  if to_regprocedure('public.cancel_rate_update_job(uuid)') is null then
    raise exception 'FAIL [fn] cancel';
  end if;
  raise notice 'PASS [structure]';
end $$;

do $$
declare
  v_t uuid := current_setting('ru.tenant')::uuid;
  v_branch uuid; v_cust uuid; v_pt uuid; v_prod uuid; v_dest uuid; v_zone uuid;
  v_s1 uuid; v_s2 uuid; v_s3 uuid;
  v_uid uuid; v_gid uuid;
begin
  select id into v_branch from public.branches
   where tenant_id = v_t and deleted_at is null
   order by case when is_head_office then 0 else 1 end limit 1;

  insert into public.zones (tenant_id, code, name)
  values (v_t, 'RZ1', 'Rate Zone') on conflict do nothing;
  select id into v_zone from public.zones where tenant_id = v_t and code = 'RZ1';

  insert into public.product_types (tenant_id, code, name)
  values (v_t, 'RPT', 'Rate PT') on conflict do nothing;
  select id into v_pt from public.product_types where tenant_id = v_t and code = 'RPT';

  insert into public.products (tenant_id, code, name, product_type_id, status)
  values (v_t, 'RPX', 'Rate Express', v_pt, 'ACTIVE') on conflict do nothing;
  select id into v_prod from public.products where tenant_id = v_t and code = 'RPX';

  insert into public.customers (tenant_id, code, name, mobile, status)
  values (v_t, 'RATECUST', 'Rate Customer', '9222222222', 'ACTIVE') on conflict do nothing;
  select id into v_cust from public.customers where tenant_id = v_t and code = 'RATECUST';

  insert into public.destinations (tenant_id, code, name, status, zone_id)
  values (v_t, 'RATEDEST', 'Rate Dest', 'ACTIVE', v_zone) on conflict do nothing;
  select id into v_dest from public.destinations where tenant_id = v_t and code = 'RATEDEST';

  -- editable shipment
  insert into public.shipments (
    tenant_id, awb_no, book_date, customer_id, product_id, destination_id,
    branch_id, pieces, charge_weight, actual_weight, current_status)
  values (v_t, 'RATE-OK-1', current_date, v_cust, v_prod, v_dest, v_branch, 1, 2, 2, 'BOOKED')
  returning id into v_s1;

  -- locked → skip
  insert into public.shipments (
    tenant_id, awb_no, book_date, customer_id, product_id, destination_id,
    branch_id, pieces, charge_weight, current_status, is_locked)
  values (v_t, 'RATE-LOCK-1', current_date, v_cust, v_prod, v_dest, v_branch, 1, 1, 'BOOKED', true)
  returning id into v_s2;

  -- invoiced → skip
  insert into public.shipments (
    tenant_id, awb_no, book_date, customer_id, product_id, destination_id,
    branch_id, pieces, charge_weight, current_status, invoice_id)
  values (v_t, 'RATE-INV-1', current_date, v_cust, v_prod, v_dest, v_branch, 1, 1, 'BOOKED', gen_random_uuid())
  returning id into v_s3;

  -- cancelled → skip
  insert into public.shipments (
    tenant_id, awb_no, book_date, customer_id, product_id, destination_id,
    branch_id, pieces, charge_weight, current_status)
  values (v_t, 'RATE-CXL-1', current_date, v_cust, v_prod, v_dest, v_branch, 1, 1, 'CANCELLED');

  perform set_config('ru.ship_ok', v_s1::text, false);

  insert into public.tenant_users (tenant_id, user_id, role, status)
  values (v_t, '99999999-1111-4111-8111-00000000d050', 'MEMBER', 'ACTIVE')
  on conflict (tenant_id, user_id) do update set status = 'ACTIVE';

  insert into public.users (
    tenant_id, auth_user_id, username, user_type, full_name, email, home_branch_id, status)
  values (
    v_t, '99999999-1111-4111-8111-00000000d050', 'ratestaff', 'STAFF',
    'Rate Staff', 'ratestaff@a.test', v_branch, 'ACTIVE')
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
     and pm.slug = 'utl.rate-update';

  raise notice 'PASS [seed]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000050';

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
    'customer_code', 'RATECUST');
  v_rated numeric;
  v_audit int;
begin
  v_job := public.create_rate_update_job('AWB_RATE', v_filters);
  if v_job->>'status' <> 'QUEUED' then raise exception 'FAIL [create]'; end if;
  if (v_job->>'total_shipments')::int < 4 then raise exception 'FAIL [total filter]'; end if;
  v_id := (v_job->>'id')::uuid;

  v_exec := public.execute_rate_update_job(v_id);
  if v_exec->>'status' <> 'COMPLETED' then raise exception 'FAIL [exec] %', v_exec; end if;
  if (v_exec->>'updated_shipments')::int < 1 then raise exception 'FAIL [updated]'; end if;
  if (v_exec->>'skipped_shipments')::int < 3 then raise exception 'FAIL [skipped] %', v_exec; end if;

  select grand_total into v_rated from public.shipments
   where id = current_setting('ru.ship_ok')::uuid;
  if v_rated is null then raise exception 'FAIL [snapshot]'; end if;

  select count(*) into v_audit from public.rating_audit
   where shipment_id = current_setting('ru.ship_ok')::uuid;
  if v_audit < 1 then raise exception 'FAIL [rating audit]'; end if;

  if not exists (
    select 1 from public.audit_logs a
     where a.entity_type = 'rate_update_jobs'
       and a.entity_id = v_id
  ) then
    raise exception 'FAIL [job audit]';
  end if;

  v_get := public.get_rate_update_job(v_id);
  if (v_get->>'progress')::int <> 100 then raise exception 'FAIL [progress]'; end if;

  v_list := public.list_rate_update_jobs('COMPLETED', 1, 20);
  if (v_list->>'total')::int < 1 then raise exception 'FAIL [list]'; end if;

  -- cancel before complete
  v_job := public.create_rate_update_job('TAX_FUEL', v_filters);
  v_id2 := (v_job->>'id')::uuid;
  v_cancel := public.cancel_rate_update_job(v_id2);
  if v_cancel->>'status' <> 'CANCELLED' then raise exception 'FAIL [cancel]'; end if;

  begin
    perform public.execute_rate_update_job(v_id2);
    raise exception 'FAIL [exec cancelled]';
  exception when sqlstate 'CMS04' then null;
  end;

  raise notice 'PASS [lifecycle / skip / snapshot / audit / cancel]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000d050';
do $$
begin
  begin
    perform public.create_rate_update_job(
      'AWB_RATE',
      jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text));
    raise exception 'FAIL [perm]';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'PASS [permissions]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000b050';
do $$
declare v_list jsonb; v_id uuid;
begin
  select id into v_id from public.rate_update_jobs
   where tenant_id = current_setting('ru.tenant')::uuid limit 1;

  v_list := public.list_rate_update_jobs(null, 1, 50);
  if (v_list->>'total')::int <> 0 then raise exception 'FAIL [tenant list]'; end if;

  if v_id is not null then
    begin
      perform public.get_rate_update_job(v_id);
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
  raise notice 'RATE UPDATE JOBS VERIFICATION PASSED.';
  raise notice '==========================================================';
end $$;

rollback;
