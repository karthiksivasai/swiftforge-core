-- ===========================================================================
-- audit_security_reports_verification.sql — Phase 5 Milestone 5E (0046).
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000046','authenticated','authenticated','aud@a.test'),
  ('99999999-1111-4111-8111-00000000b046','authenticated','authenticated','aud@b.test'),
  ('99999999-1111-4111-8111-00000000d046','authenticated','authenticated','audstaff@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid; v_tb uuid;
begin
  v_t := app.bootstrap_tenant('aud-a', 'Audit A', 'AudA');
  perform app.link_tenant_admin(v_t, '99999999-1111-4111-8111-000000000046',
          'audadm', 'Audit Admin', 'aud@a.test');
  perform set_config('aud.tenant', v_t::text, false);

  v_tb := app.bootstrap_tenant('aud-b', 'Audit B', 'AudB');
  perform app.link_tenant_admin(v_tb, '99999999-1111-4111-8111-00000000b046',
          'audadmb', 'Audit Admin B', 'aud@b.test');
  perform set_config('aud.tenant_b', v_tb::text, false);
end $$;

do $$
declare
  v_keys text[] := array[
    'action-log','module-action-log','record-history-report','user-activity-report',
    'permission-change-report','login-log','failed-login-attempts','session-activity',
    'forced-logout-history','authentication-activity'
  ];
  v_k text;
begin
  foreach v_k in array v_keys loop
    if not exists (
      select 1 from public.report_definitions
       where report_key = v_k and deleted_at is null and is_active and hub = 'AUDIT'
    ) then
      raise exception 'FAIL [meta]: missing %', v_k;
    end if;
  end loop;
  if not exists (
    select 1 from public.report_definitions
     where report_key = 'action-log' and source_entity = 'AUDIT_LOGS'
  ) then
    raise exception 'FAIL [meta]: audit source';
  end if;
  if not exists (
    select 1 from public.report_definitions
     where report_key = 'session-activity' and source_entity = 'SESSIONS'
  ) then
    raise exception 'FAIL [meta]: sessions source';
  end if;
  raise notice 'PASS [metadata registration]';
end $$;

do $$
declare
  v_t uuid := current_setting('aud.tenant')::uuid;
  v_branch uuid; v_uid uuid; v_gid uuid; v_user uuid; v_sess uuid;
begin
  select id into v_branch from public.branches
   where tenant_id = v_t and deleted_at is null
   order by case when is_head_office then 0 else 1 end limit 1;

  select id into v_user from public.users
   where auth_user_id = '99999999-1111-4111-8111-000000000046' and tenant_id = v_t;

  perform app.write_audit_log(
    v_t, 'customers', 'ADD', gen_random_uuid(), 'mst.customer',
    null, jsonb_build_object('code','X'), '127.0.0.1'::inet, 'req-aud-1');

  perform set_config('request.jwt.claim.sub', '99999999-1111-4111-8111-000000000046', true);
  -- write_audit uses auth.uid(); set role later for RPCs

  insert into public.audit_logs (
    tenant_id, entity_type, entity_id, action, module_slug, actor_id, new_values, ip_address, request_id)
  values (
    v_t, 'shipments', gen_random_uuid(), 'MODIFY', 'txn.awb-entry',
    '99999999-1111-4111-8111-000000000046',
    jsonb_build_object('status','BOOKED'), '10.0.0.8'::inet, 'req-aud-2');

  insert into public.login_logs (
    tenant_id, user_id, username, event, user_type, ip_address, detail)
  values
    (v_t, v_user, 'audadm', 'LOGIN_SUCCESS', 'ADMIN', '10.0.0.1'::inet, 'ok'),
    (v_t, null, 'audadm', 'LOGIN_FAILED', 'ADMIN', '10.0.0.2'::inet, 'bad password'),
    (v_t, v_user, 'audadm', 'FORCED_LOGOUT', 'ADMIN', '10.0.0.3'::inet, 'admin revoke'),
    (v_t, v_user, 'audadm', 'PERMISSION_CHANGE', 'ADMIN', '10.0.0.4'::inet, 'rights updated');

  insert into public.sessions (
    tenant_id, user_id, auth_user_id, app, ip_address, user_agent)
  values (
    v_t, v_user, '99999999-1111-4111-8111-000000000046', 'WEB',
    '10.0.0.9'::inet, 'vitest')
  returning id into v_sess;

  insert into public.sessions (
    tenant_id, user_id, auth_user_id, app, ip_address, revoked_at, revoke_reason)
  values (
    v_t, v_user, '99999999-1111-4111-8111-000000000046', 'WEB',
    '10.0.0.10'::inet, now(), 'forced');

  insert into public.tenant_users (tenant_id, user_id, role, status)
  values (v_t, '99999999-1111-4111-8111-00000000d046', 'MEMBER', 'ACTIVE')
  on conflict (tenant_id, user_id) do update set status = 'ACTIVE';

  insert into public.users (
    tenant_id, auth_user_id, username, user_type, full_name, email, home_branch_id, status)
  values (
    v_t, '99999999-1111-4111-8111-00000000d046', 'audstaff', 'STAFF',
    'Aud Staff', 'audstaff@a.test', v_branch, 'ACTIVE')
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
     and pm.slug in ('rpt.action-log','rpt.login-log','rpt.user-analysis-report');

  raise notice 'PASS [seed]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000046';

do $$
declare
  v_r jsonb;
  v_val jsonb;
begin
  perform public.get_report_definition('action-log');

  v_val := public.validate_report_filters('login-log', jsonb_build_object(
    'from_date', current_date::text, 'to_date', current_date::text));
  if not (v_val->>'ok')::boolean then raise exception 'FAIL [val] %', v_val; end if;

  v_r := public.execute_report(
    'action-log',
    jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
    1, 1, 'created_at', 'desc');
  if (v_r->>'total')::bigint < 1 then raise exception 'FAIL [action total]'; end if;
  if jsonb_array_length(v_r->'rows') <> 1 then raise exception 'FAIL [pagination]'; end if;

  v_r := public.execute_report(
    'module-action-log',
    jsonb_build_object(
      'from_date', current_date::text, 'to_date', current_date::text,
      'module_slug', 'txn.awb-entry'),
    1, 50, null, 'desc');
  if (v_r->>'total')::bigint < 1 then raise exception 'FAIL [module]'; end if;

  v_r := public.execute_report(
    'record-history-report',
    jsonb_build_object(
      'from_date', current_date::text, 'to_date', current_date::text,
      'entity_type', 'shipments'),
    1, 50, null, 'desc');
  if (v_r->>'total')::bigint < 1 then raise exception 'FAIL [record history]'; end if;

  v_r := public.execute_report(
    'user-activity-report',
    jsonb_build_object(
      'from_date', current_date::text, 'to_date', current_date::text,
      'username', 'audadm'),
    1, 50, null, 'desc');
  if (v_r->>'total')::bigint < 1 then raise exception 'FAIL [user activity]'; end if;

  v_r := public.execute_report(
    'login-log',
    jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
    1, 50, null, 'desc');
  if (v_r->>'total')::bigint < 4 then raise exception 'FAIL [login log]'; end if;

  v_r := public.execute_report(
    'failed-login-attempts',
    jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
    1, 50, null, 'desc');
  if (v_r->>'total')::bigint < 1 then raise exception 'FAIL [failed]'; end if;
  if exists (
    select 1 from jsonb_array_elements(v_r->'rows') x where x->>'event' <> 'LOGIN_FAILED'
  ) then raise exception 'FAIL [failed preset]'; end if;

  v_r := public.execute_report(
    'forced-logout-history',
    jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
    1, 50, null, 'desc');
  if (v_r->>'total')::bigint < 1 then raise exception 'FAIL [forced]'; end if;

  v_r := public.execute_report(
    'permission-change-report',
    jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
    1, 50, null, 'desc');
  if (v_r->>'total')::bigint < 1 then raise exception 'FAIL [perm change]'; end if;

  v_r := public.execute_report(
    'authentication-activity',
    jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
    1, 50, null, 'desc');
  if (v_r->>'total')::bigint < 3 then raise exception 'FAIL [auth activity]'; end if;

  v_r := public.execute_report(
    'session-activity',
    jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
    1, 50, null, 'desc');
  if (v_r->>'total')::bigint < 2 then raise exception 'FAIL [sessions]'; end if;

  v_r := public.execute_report(
    'session-activity',
    jsonb_build_object(
      'from_date', current_date::text, 'to_date', current_date::text,
      'session_state', 'REVOKED'),
    1, 50, null, 'desc');
  if (v_r->>'total')::bigint < 1 then raise exception 'FAIL [revoked sessions]'; end if;

  raise notice 'PASS [validation / pagination / audit / login correctness]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000d046';
do $$
begin
  begin
    perform public.execute_report(
      'action-log',
      jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
      1, 10, null, 'desc');
    raise exception 'FAIL [perm]';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'PASS [permissions]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000b046';
do $$
declare v_r jsonb;
begin
  v_r := public.execute_report(
    'action-log',
    jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
    1, 50, null, 'desc');
  if (v_r->>'total')::bigint <> 0 then
    raise exception 'FAIL [tenant leak]';
  end if;
  raise notice 'PASS [tenant isolation]';
end $$;

reset role;
do $$
begin
  raise notice '==========================================================';
  raise notice 'AUDIT SECURITY REPORTS VERIFICATION PASSED.';
  raise notice '==========================================================';
end $$;

rollback;
