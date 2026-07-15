-- ===========================================================================
-- reporting_foundation_verification.sql — Phase 5 Milestone 5A (0042).
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000042','authenticated','authenticated','rpt@a.test'),
  ('99999999-1111-4111-8111-00000000b042','authenticated','authenticated','rpt@b.test'),
  ('99999999-1111-4111-8111-00000000d042','authenticated','authenticated','rptstaff@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid; v_tb uuid;
begin
  v_t := app.bootstrap_tenant('rpt-a', 'Report A', 'RptA');
  perform app.link_tenant_admin(v_t, '99999999-1111-4111-8111-000000000042',
          'rptadm', 'Report Admin', 'rpt@a.test');
  perform set_config('rp.tenant', v_t::text, false);

  v_tb := app.bootstrap_tenant('rpt-b', 'Report B', 'RptB');
  perform app.link_tenant_admin(v_tb, '99999999-1111-4111-8111-00000000b042',
          'rptadmb', 'Report Admin B', 'rpt@b.test');
  perform set_config('rp.tenant_b', v_tb::text, false);
end $$;

do $$
begin
  if to_regclass('public.report_definitions') is null then raise exception 'FAIL [table]: definitions'; end if;
  if to_regclass('public.report_filters') is null then raise exception 'FAIL [table]: filters'; end if;
  if to_regclass('public.report_categories') is null then raise exception 'FAIL [table]: categories'; end if;
  if to_regclass('public.saved_report_filters') is null then raise exception 'FAIL [table]: saved'; end if;
  if to_regprocedure('public.get_report_definition(text)') is null then raise exception 'FAIL [fn]: get'; end if;
  if to_regprocedure('public.validate_report_filters(text,jsonb)') is null then raise exception 'FAIL [fn]: validate'; end if;
  if to_regprocedure('public.execute_report(text,jsonb,integer,integer,text,text)') is null then raise exception 'FAIL [fn]: execute'; end if;
  if to_regprocedure('public.list_report_definitions(text)') is null then raise exception 'FAIL [fn]: list'; end if;
  if not exists (select 1 from public.report_definitions where report_key = 'awb-register') then
    raise exception 'FAIL [seed]: awb-register';
  end if;
  raise notice 'PASS [structure]';
end $$;

-- seed data under service role
do $$
declare
  v_t uuid := current_setting('rp.tenant')::uuid;
  v_pt uuid; v_prod uuid; v_cust uuid; v_dest uuid; v_branch uuid;
  v_uid uuid; v_gid uuid; v_s public.shipments;
begin
  select id into v_branch from public.branches
   where tenant_id = v_t and deleted_at is null
   order by case when is_head_office then 0 else 1 end limit 1;

  insert into public.product_types (tenant_id, code, name)
  values (v_t, 'PT1', 'Express Type') on conflict do nothing;
  select id into v_pt from public.product_types where tenant_id = v_t and code = 'PT1';

  insert into public.products (tenant_id, code, name, product_type_id, status)
  values (v_t, 'SPX', 'Express', v_pt, 'ACTIVE') on conflict do nothing;

  insert into public.customers (tenant_id, code, name, mobile, status)
  values (v_t, 'CUST1', 'Client One', '9000000001', 'ACTIVE') on conflict do nothing;

  insert into public.destinations (tenant_id, code, name, status)
  values (v_t, 'BLR', 'Bangalore', 'ACTIVE') on conflict do nothing;

  select id into v_cust from public.customers where tenant_id = v_t and code = 'CUST1';
  select id into v_prod from public.products where tenant_id = v_t and code = 'SPX';
  select id into v_dest from public.destinations where tenant_id = v_t and code = 'BLR';

  insert into public.shipments (
    tenant_id, awb_no, book_date, customer_id, product_id, destination_id,
    branch_id, pieces, charge_weight, current_status, grand_total)
  values (
    v_t, 'RPT-AWB-1', current_date, v_cust, v_prod, v_dest,
    v_branch, 1, 1.5, 'BOOKED', 250.00);

  insert into public.login_logs (tenant_id, username, event, user_type, detail)
  values (v_t, 'rptadm', 'LOGIN_SUCCESS', 'STAFF', 'test login');

  -- staff without report list
  insert into public.tenant_users (tenant_id, user_id, role, status)
  values (v_t, '99999999-1111-4111-8111-00000000d042', 'MEMBER', 'ACTIVE')
  on conflict (tenant_id, user_id) do update set status = 'ACTIVE';

  insert into public.users (
    tenant_id, auth_user_id, username, user_type, full_name, email, home_branch_id, status)
  values (
    v_t, '99999999-1111-4111-8111-00000000d042', 'rptstaff', 'STAFF',
    'Rpt Staff', 'rptstaff@a.test', v_branch, 'ACTIVE')
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
     and pm.slug in ('rpt.awb-report','rpt.manifest-report','rpt.operation-report',
                     'rpt.statement-report','rpt.login-log');

  raise notice 'PASS [seed]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000042';

-- metadata loading
do $$
declare
  v_def jsonb;
  v_list jsonb;
begin
  v_def := public.get_report_definition('awb-register');
  if v_def->>'report_key' <> 'awb-register' then raise exception 'FAIL [meta key]'; end if;
  if jsonb_typeof(v_def->'filters') <> 'array' then raise exception 'FAIL [meta filters]'; end if;
  if jsonb_typeof(v_def->'columns') <> 'array' then raise exception 'FAIL [meta columns]'; end if;
  if v_def->>'permission_slug' is null then raise exception 'FAIL [meta perm]'; end if;

  v_list := public.list_report_definitions(null);
  if jsonb_array_length(v_list) < 5 then
    raise exception 'FAIL [list] got %', jsonb_array_length(v_list);
  end if;
  raise notice 'PASS [metadata loading]';
end $$;

-- filter validation
do $$
declare
  v_ok jsonb;
  v_bad jsonb;
begin
  v_ok := public.validate_report_filters('awb-register', jsonb_build_object(
    'from_date', current_date::text,
    'to_date', current_date::text
  ));
  if not (v_ok->>'ok')::boolean then raise exception 'FAIL [val ok] %', v_ok; end if;

  v_bad := public.validate_report_filters('awb-register', jsonb_build_object(
    'from_date', (current_date - 40)::text,
    'to_date', current_date::text
  ));
  if (v_bad->>'ok')::boolean then raise exception 'FAIL [31-day]'; end if;

  v_bad := public.validate_report_filters('awb-register', jsonb_build_object(
    'from_date', current_date::text,
    'to_date', (current_date - 1)::text
  ));
  if (v_bad->>'ok')::boolean then raise exception 'FAIL [date order]'; end if;

  raise notice 'PASS [filter validation]';
end $$;

-- execution + pagination
do $$
declare
  v_r jsonb;
  v_total bigint;
begin
  v_r := public.execute_report(
    'awb-register',
    jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
    1, 10, 'book_date', 'desc');
  v_total := (v_r->>'total')::bigint;
  if v_total < 1 then raise exception 'FAIL [exec total]'; end if;
  if jsonb_array_length(v_r->'rows') < 1 then raise exception 'FAIL [exec rows]'; end if;
  if (v_r->>'page')::int <> 1 then raise exception 'FAIL [page]'; end if;

  v_r := public.execute_report(
    'login-log',
    jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
    1, 10, null, 'desc');
  if (v_r->>'total')::bigint < 1 then raise exception 'FAIL [login exec]'; end if;

  raise notice 'PASS [execution + pagination]';
end $$;

-- permission enforcement
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000d042';
do $$
begin
  begin
    perform public.get_report_definition('awb-register');
    raise exception 'FAIL [perm get]';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.execute_report(
      'awb-register',
      jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
      1, 10, null, 'desc');
    raise exception 'FAIL [perm exec]';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'PASS [permissions]';
end $$;

-- tenant isolation
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000b042';
do $$
declare v_r jsonb;
begin
  -- definitions are global; execution must not leak tenant A rows
  v_r := public.execute_report(
    'awb-register',
    jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
    1, 50, null, 'desc');
  if (v_r->>'total')::bigint <> 0 then
    raise exception 'FAIL [tenant leak] total=%', v_r->>'total';
  end if;
  raise notice 'PASS [RLS / tenant isolation]';
end $$;

reset role;
do $$
begin
  raise notice '==========================================================';
  raise notice 'REPORTING FOUNDATION VERIFICATION PASSED.';
  raise notice '==========================================================';
end $$;

rollback;
