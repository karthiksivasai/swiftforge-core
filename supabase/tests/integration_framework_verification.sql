-- ===========================================================================
-- integration_framework_verification.sql — Phase 7 Milestone 7A
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000055','authenticated','authenticated','int@a.test'),
  ('99999999-1111-4111-8111-00000000b055','authenticated','authenticated','int@b.test'),
  ('99999999-1111-4111-8111-00000000d055','authenticated','authenticated','intstaff@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid; v_tb uuid;
begin
  v_t := app.bootstrap_tenant('int-a', 'Int A', 'IntA');
  perform app.link_tenant_admin(v_t, '99999999-1111-4111-8111-000000000055',
          'intadm', 'Int Admin', 'int@a.test');
  perform set_config('ig.tenant', v_t::text, false);

  v_tb := app.bootstrap_tenant('int-b', 'Int B', 'IntB');
  perform app.link_tenant_admin(v_tb, '99999999-1111-4111-8111-00000000b055',
          'intadmb', 'Int Admin B', 'int@b.test');
  perform set_config('ig.tenant_b', v_tb::text, false);
end $$;

do $$
begin
  if to_regclass('public.integration_providers') is null then raise exception 'FAIL [providers]'; end if;
  if to_regclass('public.integration_credentials') is null then raise exception 'FAIL [credentials]'; end if;
  if to_regclass('public.integration_logs') is null then raise exception 'FAIL [logs]'; end if;
  if to_regprocedure('public.save_integration_credentials(jsonb,uuid,integer)') is null then
    raise exception 'FAIL [fn] save';
  end if;
  if to_regprocedure('public.list_integration_credentials()') is null then
    raise exception 'FAIL [fn] list';
  end if;
  if to_regprocedure('public.get_integration_credentials(uuid,text)') is null then
    raise exception 'FAIL [fn] get';
  end if;
  if to_regprocedure('public.delete_integration_credentials(uuid,integer)') is null then
    raise exception 'FAIL [fn] delete';
  end if;
  if to_regprocedure('public.list_integration_providers(text)') is null then
    raise exception 'FAIL [fn] providers';
  end if;
  if to_regprocedure('public.test_integration_connection(uuid,text)') is null then
    raise exception 'FAIL [fn] test';
  end if;
  if not exists (select 1 from public.integration_providers where provider_code = 'FEDEX') then
    raise exception 'FAIL [seed] FEDEX';
  end if;
  if not exists (select 1 from public.integration_providers where provider_code = 'DHL') then
    raise exception 'FAIL [seed] DHL';
  end if;
  raise notice 'PASS [structure]';
end $$;

do $$
declare
  v_t uuid := current_setting('ig.tenant')::uuid;
  v_branch uuid; v_uid uuid; v_gid uuid;
begin
  select id into v_branch from public.branches
   where tenant_id = v_t and deleted_at is null
   order by case when is_head_office then 0 else 1 end limit 1;

  insert into public.tenant_users (tenant_id, user_id, role, status)
  values (v_t, '99999999-1111-4111-8111-00000000d055', 'MEMBER', 'ACTIVE')
  on conflict (tenant_id, user_id) do update set status = 'ACTIVE';

  insert into public.users (
    tenant_id, auth_user_id, username, user_type, full_name, email, home_branch_id, status)
  values (
    v_t, '99999999-1111-4111-8111-00000000d055', 'intstaff', 'STAFF',
    'Int Staff', 'intstaff@a.test', v_branch, 'ACTIVE')
  on conflict (auth_user_id) do update set deleted_at = null
  returning id into v_uid;

  select id into v_gid from public.user_groups
   where tenant_id = v_t and name = 'OPERATIONS' and deleted_at is null;
  insert into public.user_group_members (tenant_id, user_id, group_id)
  values (v_t, v_uid, v_gid) on conflict (user_id, group_id) do nothing;

  update public.group_permissions gp
     set can_add = false, can_modify = false, can_list = false, can_search = false,
         can_delete = false, all_access = false
    from public.permission_modules pm
   where gp.module_id = pm.id and gp.group_id = v_gid
     and pm.slug in ('mst.vendor-master', 'mst.service-mapping');

  raise notice 'PASS [seed]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000055';

do $$
declare
  v_cred jsonb; v_get jsonb; v_list jsonb; v_prov jsonb; v_test jsonb;
  v_id uuid; v_rv int; v_raw text; v_dup boolean := false;
begin
  v_prov := public.list_integration_providers('ACTIVE');
  if jsonb_array_length(v_prov->'rows') < 7 then
    raise exception 'FAIL [providers count]';
  end if;

  v_cred := public.save_integration_credentials(jsonb_build_object(
    'provider_code', 'FEDEX',
    'username', 'fedex_user',
    'password', 'secret-pass',
    'api_key', 'key-123',
    'api_secret', 'sec-456',
    'account_number', 'ACC1',
    'endpoint', 'https://api.sandbox.fedex.example',
    'sandbox_mode', true,
    'is_active', true));
  if v_cred->>'provider_code' <> 'FEDEX' then raise exception 'FAIL [save]'; end if;
  if (v_cred->>'has_password')::boolean is not true then raise exception 'FAIL [pwd set]'; end if;
  if (v_cred->>'has_api_key')::boolean is not true then raise exception 'FAIL [key set]'; end if;
  if (v_cred->>'has_api_secret')::boolean is not true then raise exception 'FAIL [secret set]'; end if;
  if v_cred ? 'password' or v_cred ? 'password_enc' or v_cred ? 'api_key' or v_cred ? 'api_secret'
     or v_cred ? 'api_key_enc' or v_cred ? 'api_secret_enc' then
    raise exception 'FAIL [secret leaked]';
  end if;
  v_id := (v_cred->>'id')::uuid;
  v_rv := (v_cred->>'row_version')::int;

  -- uniqueness
  begin
    perform public.save_integration_credentials(jsonb_build_object(
      'provider_code', 'FEDEX', 'username', 'other'));
    v_dup := true;
  exception when sqlstate 'CMS04' then null;
  end;
  if v_dup then raise exception 'FAIL [uniqueness]'; end if;

  -- get never returns secrets
  v_get := public.get_integration_credentials(v_id, null);
  if v_get ? 'password' or v_get ? 'api_key' or v_get ? 'api_secret' then
    raise exception 'FAIL [get secrets]';
  end if;

  -- write-only password keep
  select encode(password_enc, 'hex') into v_raw
    from public.integration_credentials where id = v_id;
  v_cred := public.save_integration_credentials(
    jsonb_build_object(
      'provider_code', 'FEDEX',
      'username', 'fedex_user2',
      'sandbox_mode', false,
      'is_active', true),
    v_id, v_rv);
  if encode((select password_enc from public.integration_credentials where id = v_id), 'hex') <> v_raw then
    raise exception 'FAIL [write-only password]';
  end if;
  if (v_cred->>'sandbox_mode')::boolean is not false then raise exception 'FAIL [sandbox]'; end if;
  if (v_cred->>'username') <> 'fedex_user2' then raise exception 'FAIL [username]'; end if;

  -- optimistic lock
  begin
    perform public.save_integration_credentials(
      jsonb_build_object('provider_code','FEDEX','is_active',true),
      v_id, 1);
    raise exception 'FAIL [opt lock]';
  exception when sqlstate 'CMS04' then null;
  end;

  -- test connection placeholder
  v_test := public.test_integration_connection(v_id, null);
  if v_test->>'status' <> 'NOT_IMPLEMENTED' then raise exception 'FAIL [test]'; end if;
  if not exists (
    select 1 from public.integration_logs
     where tenant_id = current_setting('ig.tenant')::uuid
       and operation = 'TEST' and status = 'NOT_IMPLEMENTED'
  ) then raise exception 'FAIL [log]'; end if;

  -- second provider
  perform public.save_integration_credentials(jsonb_build_object(
    'provider_code', 'DHL',
    'api_key', 'dhl-key',
    'sandbox_mode', true,
    'is_active', true));

  v_list := public.list_integration_credentials();
  if jsonb_array_length(v_list->'rows') <> 2 then raise exception 'FAIL [list]'; end if;

  if not exists (
    select 1 from public.audit_logs
     where entity_type = 'integration_credentials' and module_slug = 'mst.vendor-master'
  ) then raise exception 'FAIL [audit]'; end if;

  -- soft delete
  v_cred := public.delete_integration_credentials(
    (v_list->'rows'->1->>'id')::uuid,
    (v_list->'rows'->1->>'row_version')::int);
  if (v_cred->>'deleted')::boolean is not true then raise exception 'FAIL [delete]'; end if;
  v_list := public.list_integration_credentials();
  if jsonb_array_length(v_list->'rows') <> 1 then raise exception 'FAIL [list after delete]'; end if;

  raise notice 'PASS [crud / uniqueness / encryption / write-only / audit / opt-lock]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000d055';
do $$
begin
  begin
    perform public.save_integration_credentials(jsonb_build_object(
      'provider_code', 'UPS', 'api_key', 'x'));
    raise exception 'FAIL [perm]';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'PASS [permissions]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000b055';
do $$
declare v_list jsonb;
begin
  v_list := public.list_integration_credentials();
  if jsonb_array_length(v_list->'rows') <> 0 then raise exception 'FAIL [tenant]'; end if;
  raise notice 'PASS [tenant isolation]';
end $$;

reset role;
do $$
begin
  raise notice '==========================================================';
  raise notice 'INTEGRATION FRAMEWORK VERIFICATION PASSED.';
  raise notice '==========================================================';
end $$;

rollback;
