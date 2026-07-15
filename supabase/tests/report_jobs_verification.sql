-- ===========================================================================
-- report_jobs_verification.sql — Phase 5 Milestone 5G (0048).
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000048','authenticated','authenticated','jobs@a.test'),
  ('99999999-1111-4111-8111-00000000b048','authenticated','authenticated','jobs@b.test'),
  ('99999999-1111-4111-8111-00000000d048','authenticated','authenticated','jobsstaff@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid; v_tb uuid;
begin
  v_t := app.bootstrap_tenant('jobs-a', 'Jobs A', 'JobsA');
  perform app.link_tenant_admin(v_t, '99999999-1111-4111-8111-000000000048',
          'jobsadm', 'Jobs Admin', 'jobs@a.test');
  perform set_config('rj.tenant', v_t::text, false);

  v_tb := app.bootstrap_tenant('jobs-b', 'Jobs B', 'JobsB');
  perform app.link_tenant_admin(v_tb, '99999999-1111-4111-8111-00000000b048',
          'jobsadmb', 'Jobs Admin B', 'jobs@b.test');
  perform set_config('rj.tenant_b', v_tb::text, false);
end $$;

do $$
begin
  if to_regclass('public.report_jobs') is null then raise exception 'FAIL [table]'; end if;
  if to_regprocedure('public.create_report_job(text,jsonb,text)') is null then
    raise exception 'FAIL [fn] create';
  end if;
  if to_regprocedure('public.list_report_jobs(text,text,integer,integer)') is null then
    raise exception 'FAIL [fn] list';
  end if;
  if to_regprocedure('public.get_report_job(uuid)') is null then
    raise exception 'FAIL [fn] get';
  end if;
  if to_regprocedure('public.cancel_report_job(uuid)') is null then
    raise exception 'FAIL [fn] cancel';
  end if;
  if to_regprocedure('public.execute_report_job(uuid)') is null then
    raise exception 'FAIL [fn] execute';
  end if;
  if not exists (
    select 1 from public.report_definitions
     where report_key = 'awb-register' and 'CSV' = any(allowed_formats)
  ) then
    raise exception 'FAIL [formats]';
  end if;
  raise notice 'PASS [structure]';
end $$;

do $$
declare
  v_t uuid := current_setting('rj.tenant')::uuid;
  v_branch uuid; v_cust uuid; v_pt uuid; v_prod uuid; v_dest uuid;
  v_uid uuid; v_gid uuid;
begin
  select id into v_branch from public.branches
   where tenant_id = v_t and deleted_at is null
   order by case when is_head_office then 0 else 1 end limit 1;

  insert into public.product_types (tenant_id, code, name)
  values (v_t, 'JPT', 'Jobs PT') on conflict do nothing;
  select id into v_pt from public.product_types where tenant_id = v_t and code = 'JPT';

  insert into public.products (tenant_id, code, name, product_type_id, status)
  values (v_t, 'JPX', 'Jobs Express', v_pt, 'ACTIVE') on conflict do nothing;
  select id into v_prod from public.products where tenant_id = v_t and code = 'JPX';

  insert into public.customers (tenant_id, code, name, mobile, status)
  values (v_t, 'JOBCUST', 'Jobs Customer', '9444444444', 'ACTIVE') on conflict do nothing;
  select id into v_cust from public.customers where tenant_id = v_t and code = 'JOBCUST';

  insert into public.destinations (tenant_id, code, name, status)
  values (v_t, 'JOBDEST', 'Jobs Dest', 'ACTIVE') on conflict do nothing;
  select id into v_dest from public.destinations where tenant_id = v_t and code = 'JOBDEST';

  insert into public.shipments (
    tenant_id, awb_no, book_date, customer_id, product_id, destination_id,
    branch_id, pieces, charge_weight, current_status, grand_total)
  values
    (v_t, 'JOB-AWB-1', current_date, v_cust, v_prod, v_dest, v_branch, 1, 1, 'BOOKED', 100),
    (v_t, 'JOB-AWB-2', current_date, v_cust, v_prod, v_dest, v_branch, 1, 2, 'BOOKED', 200);

  insert into public.tenant_users (tenant_id, user_id, role, status)
  values (v_t, '99999999-1111-4111-8111-00000000d048', 'MEMBER', 'ACTIVE')
  on conflict (tenant_id, user_id) do update set status = 'ACTIVE';

  insert into public.users (
    tenant_id, auth_user_id, username, user_type, full_name, email, home_branch_id, status)
  values (
    v_t, '99999999-1111-4111-8111-00000000d048', 'jobsstaff', 'STAFF',
    'Jobs Staff', 'jobsstaff@a.test', v_branch, 'ACTIVE')
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
     and pm.slug = 'rpt.awb-report';

  raise notice 'PASS [seed]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000048';

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
    'to_date', current_date::text);
begin
  -- create + execute CSV
  v_job := public.create_report_job('awb-register', v_filters, 'CSV');
  if v_job->>'status' <> 'QUEUED' then raise exception 'FAIL [create status]'; end if;
  v_id := (v_job->>'id')::uuid;

  v_exec := public.execute_report_job(v_id);
  if v_exec->>'status' <> 'COMPLETED' then raise exception 'FAIL [exec status] %', v_exec; end if;
  if (v_exec->>'row_count')::int < 2 then raise exception 'FAIL [row count]'; end if;
  if v_exec->>'file_id' is null then raise exception 'FAIL [file_id]'; end if;

  if not exists (
    select 1 from public.files f
     where f.id = (v_exec->>'file_id')::uuid
       and f.owner_type = 'REPORT_JOB'
       and f.scan_status = 'CLEAN'
  ) then
    raise exception 'FAIL [file creation]';
  end if;

  v_get := public.get_report_job(v_id);
  if v_get->>'status' <> 'COMPLETED' then raise exception 'FAIL [get status]'; end if;
  if v_get->'download' is null or v_get->'download' = 'null'::jsonb then
    raise exception 'FAIL [download]';
  end if;
  if coalesce(v_get->'download'->>'content_base64','') = '' then
    raise exception 'FAIL [download content]';
  end if;

  v_list := public.list_report_jobs('COMPLETED', 'awb-register', 1, 20);
  if (v_list->>'total')::int < 1 then raise exception 'FAIL [list]'; end if;

  -- cancel before complete
  v_job := public.create_report_job('awb-register', v_filters, 'XLSX');
  v_id2 := (v_job->>'id')::uuid;
  v_cancel := public.cancel_report_job(v_id2);
  if v_cancel->>'status' <> 'CANCELLED' then raise exception 'FAIL [cancel]'; end if;

  begin
    perform public.execute_report_job(v_id2);
    raise exception 'FAIL [exec cancelled]';
  exception when sqlstate 'CMS04' then null;
  end;

  -- reject completed cancel
  begin
    perform public.cancel_report_job(v_id);
    raise exception 'FAIL [cancel completed]';
  exception when sqlstate 'CMS04' then null;
  end;

  raise notice 'PASS [lifecycle / file / download / cancel]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000d048';
do $$
declare
  v_filters jsonb := jsonb_build_object(
    'from_date', current_date::text,
    'to_date', current_date::text);
begin
  begin
    perform public.create_report_job('awb-register', v_filters, 'CSV');
    raise exception 'FAIL [perm create]';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'PASS [permissions]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000b048';
do $$
declare
  v_list jsonb;
  v_t_a uuid := current_setting('rj.tenant')::uuid;
  v_job_id uuid;
begin
  select id into v_job_id from public.report_jobs
   where tenant_id = v_t_a and status = 'COMPLETED' limit 1;

  v_list := public.list_report_jobs(null, null, 1, 50);
  if (v_list->>'total')::int <> 0 then raise exception 'FAIL [tenant list leak]'; end if;

  if v_job_id is not null then
    begin
      perform public.get_report_job(v_job_id);
      raise exception 'FAIL [tenant get leak]';
    exception when sqlstate 'P0002' then null;
    end;
  end if;

  raise notice 'PASS [tenant isolation]';
end $$;

reset role;
do $$
begin
  raise notice '==========================================================';
  raise notice 'REPORT JOBS VERIFICATION PASSED.';
  raise notice '==========================================================';
end $$;

rollback;
