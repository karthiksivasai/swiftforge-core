-- ===========================================================================
-- rbac_verification.sql — proves Phase 2 auth/RBAC guarantees.
-- ---------------------------------------------------------------------------
-- Runs in a transaction that ROLLS BACK. Execute as a privileged role:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rbac_verification.sql
-- Proves: unauthenticated blocked, cross-tenant blocked, branch scoping,
-- missing-permission blocked, tenant-admin cannot cross tenants, force-logoff
-- invalidates the session. Any failure raises and aborts.
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

-- ---------- fixtures (privileged setup; RLS bypassed) --------------------
insert into auth.users (id, aud, role, email) values
  ('11111111-aaaa-4aaa-8aaa-00000000ad0a','authenticated','authenticated','admina@a.test'),
  ('11111111-aaaa-4aaa-8aaa-00000000c0fa','authenticated','authenticated','staffa@a.test'),
  ('22222222-bbbb-4bbb-8bbb-00000000ad0b','authenticated','authenticated','adminb@b.test')
on conflict (id) do nothing;

insert into public.tenants (id, slug, name, status) values
  ('11111111-aaaa-4aaa-8aaa-000000000001','rbac-a','RBAC Tenant A','ACTIVE'),
  ('22222222-bbbb-4bbb-8bbb-000000000002','rbac-b','RBAC Tenant B','ACTIVE')
on conflict (id) do nothing;

insert into public.branches (id, tenant_id, code, name) values
  ('11111111-aaaa-4aaa-8aaa-0000000000a1','11111111-aaaa-4aaa-8aaa-000000000001','A1','A Branch 1'),
  ('11111111-aaaa-4aaa-8aaa-0000000000a2','11111111-aaaa-4aaa-8aaa-000000000001','A2','A Branch 2'),
  ('22222222-bbbb-4bbb-8bbb-0000000000b1','22222222-bbbb-4bbb-8bbb-000000000002','B1','B Branch 1')
on conflict do nothing;

-- Provision + admins via the real provisioning functions.
select app.link_tenant_admin(
  '11111111-aaaa-4aaa-8aaa-000000000001','11111111-aaaa-4aaa-8aaa-00000000ad0a','admina','Admin A','admina@a.test',
  '11111111-aaaa-4aaa-8aaa-0000000000a1');
select app.link_tenant_admin(
  '22222222-bbbb-4bbb-8bbb-000000000002','22222222-bbbb-4bbb-8bbb-00000000ad0b','adminb','Admin B','adminb@b.test',
  '22222222-bbbb-4bbb-8bbb-0000000000b1');

-- Limited staff in tenant A: OPERATIONS group, home branch A1 only.
insert into public.tenant_users (tenant_id, user_id, role, status)
values ('11111111-aaaa-4aaa-8aaa-000000000001','11111111-aaaa-4aaa-8aaa-00000000c0fa','MEMBER','ACTIVE')
on conflict do nothing;
insert into public.users (id, tenant_id, auth_user_id, username, user_type, home_branch_id, status)
values ('11111111-aaaa-4aaa-8aaa-0000000000f1','11111111-aaaa-4aaa-8aaa-000000000001',
        '11111111-aaaa-4aaa-8aaa-00000000c0fa','staffa','STAFF','11111111-aaaa-4aaa-8aaa-0000000000a1','ACTIVE')
on conflict do nothing;
insert into public.user_group_members (tenant_id, user_id, group_id)
select '11111111-aaaa-4aaa-8aaa-000000000001','11111111-aaaa-4aaa-8aaa-0000000000f1', g.id
from public.user_groups g
where g.tenant_id = '11111111-aaaa-4aaa-8aaa-000000000001' and g.name = 'OPERATIONS'
on conflict do nothing;

-- =======================================================================
-- 1) UNAUTHENTICATED cannot access protected data
-- =======================================================================
set local role authenticated;
set local request.jwt.claim.sub = '';
do $$
begin
  if (select count(*) from public.users) <> 0 then
    raise exception 'FAIL [unauth-users]: anonymous can read users';
  end if;
  if (select count(*) from public.permission_modules) <> 0 then
    raise exception 'FAIL [unauth-modules]: anonymous can read permission_modules';
  end if;
  if (select count(*) from public.me()) <> 0 then
    raise exception 'FAIL [unauth-me]: me() returned a row for anonymous';
  end if;
  raise notice 'PASS [unauth]: anonymous blocked from users/modules/me';
end $$;
reset role;

-- =======================================================================
-- 2) CROSS-TENANT + 5) TENANT ADMIN cannot reach another tenant
-- =======================================================================
set local role authenticated;
set local request.jwt.claim.sub = '11111111-aaaa-4aaa-8aaa-00000000ad0a';  -- admin A
do $$
begin
  -- read isolation
  if (select count(*) from public.users
        where tenant_id = '22222222-bbbb-4bbb-8bbb-000000000002') <> 0 then
    raise exception 'FAIL [xtenant-read]: admin A can read tenant B users';
  end if;
  -- admin A is not admin of B
  if app.is_tenant_admin('22222222-bbbb-4bbb-8bbb-000000000002') then
    raise exception 'FAIL [xtenant-admin]: admin A is_tenant_admin(B) true';
  end if;
  -- write isolation
  begin
    insert into public.user_groups (tenant_id, name) values
      ('22222222-bbbb-4bbb-8bbb-000000000002','hacked');
    raise exception 'FAIL [xtenant-write]: admin A inserted a group into tenant B';
  exception when insufficient_privilege then
    raise notice 'PASS [xtenant-write]: cross-tenant insert blocked';
  end;
  raise notice 'PASS [xtenant]: tenant admin confined to own tenant';
end $$;
reset role;

-- =======================================================================
-- 3) BRANCH SCOPE
-- =======================================================================
set local role authenticated;
set local request.jwt.claim.sub = '11111111-aaaa-4aaa-8aaa-00000000c0fa';  -- staff A
do $$
begin
  if not app.user_can_access_branch('11111111-aaaa-4aaa-8aaa-000000000001','11111111-aaaa-4aaa-8aaa-0000000000a1') then
    raise exception 'FAIL [branch-home]: staff cannot access home branch A1';
  end if;
  if app.user_can_access_branch('11111111-aaaa-4aaa-8aaa-000000000001','11111111-aaaa-4aaa-8aaa-0000000000a2') then
    raise exception 'FAIL [branch-unassigned]: staff can access unassigned branch A2';
  end if;
  raise notice 'PASS [branch]: staff limited to assigned branch';
end $$;
reset role;

-- =======================================================================
-- 4) MISSING PERMISSION blocks; present permission allows
-- =======================================================================
set local role authenticated;
set local request.jwt.claim.sub = '11111111-aaaa-4aaa-8aaa-00000000c0fa';  -- staff A (OPERATIONS)
do $$
begin
  -- OPERATIONS lacks Access Rights permission.
  if app.user_has_permission('11111111-aaaa-4aaa-8aaa-000000000001','utl.access-rights','modify') then
    raise exception 'FAIL [perm-neg]: staff has access-rights.modify unexpectedly';
  end if;
  -- ...so updating group_permissions affects 0 rows.
  update public.group_permissions set can_add = true
    where tenant_id = '11111111-aaaa-4aaa-8aaa-000000000001';
  if found then
    raise exception 'FAIL [perm-block]: staff updated group_permissions';
  end if;
  -- ...and updating users affects 0 rows (no user-setup.modify).
  update public.users set full_name = 'x'
    where tenant_id = '11111111-aaaa-4aaa-8aaa-000000000001';
  if found then
    raise exception 'FAIL [perm-block-users]: staff updated users';
  end if;
  -- Positive: OPERATIONS does grant transaction list.
  if not app.user_has_permission('11111111-aaaa-4aaa-8aaa-000000000001','txn.pickup','list') then
    raise exception 'FAIL [perm-pos]: staff missing txn.pickup.list';
  end if;
  raise notice 'PASS [perm]: matrix blocks missing and allows granted actions';
end $$;
reset role;

-- Admin A DOES have access-rights.modify -> update succeeds.
set local role authenticated;
set local request.jwt.claim.sub = '11111111-aaaa-4aaa-8aaa-00000000ad0a';
do $$
begin
  update public.group_permissions set can_search = can_search
    where tenant_id = '11111111-aaaa-4aaa-8aaa-000000000001';
  if not found then
    raise exception 'FAIL [perm-admin]: admin could not update group_permissions';
  end if;
  raise notice 'PASS [perm-admin]: admin can update group_permissions';
end $$;
reset role;

-- =======================================================================
-- 6) FORCE-LOGOFF invalidates the intended active session
-- =======================================================================
-- staff A logs in (creates a session)
set local role authenticated;
set local request.jwt.claim.sub = '11111111-aaaa-4aaa-8aaa-00000000c0fa';
do $$
declare v_sid uuid;
begin
  v_sid := public.record_login('WEB', '203.0.113.9'::inet, 'pg-test');
  if not app.is_session_active(v_sid) then
    raise exception 'FAIL [session-active]: new session not active';
  end if;
  -- stash for the admin step
  perform set_config('rbac.test_sid', v_sid::text, true);
  raise notice 'PASS [session-active]: staff session created & active';
end $$;
reset role;

-- admin B (other tenant) must NOT be able to force-logoff staff A's session
set local role authenticated;
set local request.jwt.claim.sub = '22222222-bbbb-4bbb-8bbb-00000000ad0b';
do $$
begin
  begin
    perform public.revoke_session(current_setting('rbac.test_sid')::uuid);
    raise exception 'FAIL [force-xtenant]: admin B force-logged-off tenant A session';
  exception when insufficient_privilege then
    raise notice 'PASS [force-xtenant]: cross-tenant force-logoff blocked';
  end;
end $$;
reset role;

-- admin A forces logoff -> session becomes inactive
set local role authenticated;
set local request.jwt.claim.sub = '11111111-aaaa-4aaa-8aaa-00000000ad0a';
do $$
declare v_sid uuid := current_setting('rbac.test_sid')::uuid;
begin
  perform public.revoke_session(v_sid);
  if app.is_session_active(v_sid) then
    raise exception 'FAIL [force-logoff]: session still active after revoke';
  end if;
  if (select count(*) from public.login_logs
        where session_id = v_sid and event = 'FORCED_LOGOUT') < 1 then
    raise exception 'FAIL [force-log]: no FORCED_LOGOUT login_log written';
  end if;
  raise notice 'PASS [force-logoff]: admin force-logoff invalidated the session';
end $$;
reset role;

do $$
begin
  raise notice '==========================================================';
  raise notice 'RBAC VERIFICATION PASSED: auth + tenant + branch + perms.';
  raise notice '==========================================================';
end $$;

rollback;
