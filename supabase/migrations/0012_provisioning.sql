-- ===========================================================================
-- 0012  provisioning functions (privileged — service role / SQL editor only)
-- ---------------------------------------------------------------------------
-- app.provision_tenant_rbac(tenant)  -> seed TENANT_ADMIN/OPERATIONS/ACCOUNTS
--                                       groups + their permission grants.
-- app.link_tenant_admin(...)         -> create the first ADMIN user, membership
--                                       anchor, and TENANT_ADMIN group link.
-- Both idempotent. NOT granted to `authenticated` (privileged provisioning).
-- ===========================================================================

create or replace function app.provision_tenant_rbac(p_tenant uuid)
returns void
language plpgsql security definer set search_path = public, app
as $$
declare
  g_admin uuid; g_ops uuid; g_acc uuid;
begin
  -- --- groups (idempotent: partial unique index prevents ON CONFLICT here) --
  select id into g_admin from public.user_groups
    where tenant_id = p_tenant and lower(name) = 'tenant_admin' and deleted_at is null;
  if g_admin is null then
    insert into public.user_groups (tenant_id, name, description, is_system)
    values (p_tenant, 'TENANT_ADMIN', 'Full access', true) returning id into g_admin;
  end if;

  select id into g_ops from public.user_groups
    where tenant_id = p_tenant and lower(name) = 'operations' and deleted_at is null;
  if g_ops is null then
    insert into public.user_groups (tenant_id, name, description, is_system)
    values (p_tenant, 'OPERATIONS', 'Transaction + reports', true) returning id into g_ops;
  end if;

  select id into g_acc from public.user_groups
    where tenant_id = p_tenant and lower(name) = 'accounts' and deleted_at is null;
  if g_acc is null then
    insert into public.user_groups (tenant_id, name, description, is_system)
    values (p_tenant, 'ACCOUNTS', 'Finance + reports', true) returning id into g_acc;
  end if;

  -- --- TENANT_ADMIN: all access on every module ----------------------------
  insert into public.group_permissions
    (tenant_id, group_id, module_id, all_access, can_add, can_modify, can_delete, can_list, can_search)
  select p_tenant, g_admin, pm.id, true, true, true, true, true, true
  from public.permission_modules pm
  on conflict (group_id, module_id) do update set
    all_access = excluded.all_access, can_add = excluded.can_add, can_modify = excluded.can_modify,
    can_delete = excluded.can_delete, can_list = excluded.can_list, can_search = excluded.can_search;

  -- --- OPERATIONS: masters r/o, transaction r/w (no delete), reports r/o ----
  insert into public.group_permissions
    (tenant_id, group_id, module_id, all_access, can_add, can_modify, can_delete, can_list, can_search)
  select p_tenant, g_ops, pm.id, false,
         (pm.section = 'TRANSACTION'),
         (pm.section = 'TRANSACTION'),
         false,
         (pm.section in ('TRANSACTION','REPORTS','MASTERS')),
         (pm.section in ('TRANSACTION','REPORTS','MASTERS'))
  from public.permission_modules pm
  where pm.section in ('TRANSACTION','REPORTS','MASTERS')
  on conflict (group_id, module_id) do update set
    all_access = excluded.all_access, can_add = excluded.can_add, can_modify = excluded.can_modify,
    can_delete = excluded.can_delete, can_list = excluded.can_list, can_search = excluded.can_search;

  -- --- ACCOUNTS: documents r/w, reports r/o, finance transactions r/w ------
  insert into public.group_permissions
    (tenant_id, group_id, module_id, all_access, can_add, can_modify, can_delete, can_list, can_search)
  select p_tenant, g_acc, pm.id, false,
         (pm.section = 'DOCUMENTS' or pm.slug in (
            'txn.receipt-entry','txn.expense-entry','txn.expense-authorize','txn.debit-note',
            'txn.credit-note','txn.customer-pay','txn.receipt-adjustment')),
         (pm.section = 'DOCUMENTS' or pm.slug in (
            'txn.receipt-entry','txn.expense-entry','txn.expense-authorize','txn.debit-note',
            'txn.credit-note','txn.customer-pay','txn.receipt-adjustment')),
         false,
         true, true
  from public.permission_modules pm
  where pm.section in ('DOCUMENTS','REPORTS')
     or pm.slug in ('txn.receipt-entry','txn.expense-entry','txn.expense-authorize','txn.debit-note',
                    'txn.credit-note','txn.customer-pay','txn.receipt-adjustment')
  on conflict (group_id, module_id) do update set
    all_access = excluded.all_access, can_add = excluded.can_add, can_modify = excluded.can_modify,
    can_delete = excluded.can_delete, can_list = excluded.can_list, can_search = excluded.can_search;
end
$$;

create or replace function app.link_tenant_admin(
  p_tenant       uuid,
  p_auth_user    uuid,
  p_username     text,
  p_full_name    text default null,
  p_email        text default null,
  p_home_branch  uuid default null
)
returns uuid
language plpgsql security definer set search_path = public, app
as $$
declare v_user_id uuid; g_admin uuid;
begin
  perform app.provision_tenant_rbac(p_tenant);

  -- Phase 1 membership anchor (RLS tenant context).
  insert into public.tenant_users (tenant_id, user_id, role, status)
  values (p_tenant, p_auth_user, 'OWNER', 'ACTIVE')
  on conflict (tenant_id, user_id) do update set status = 'ACTIVE', role = 'OWNER';

  -- Phase 2 user profile.
  insert into public.users (tenant_id, auth_user_id, username, user_type, full_name, email, home_branch_id, status)
  values (p_tenant, p_auth_user, p_username, 'ADMIN', p_full_name, p_email, p_home_branch, 'ACTIVE')
  on conflict (auth_user_id) do update set
    tenant_id = excluded.tenant_id, username = excluded.username, user_type = 'ADMIN',
    full_name = coalesce(excluded.full_name, public.users.full_name),
    email = coalesce(excluded.email, public.users.email),
    status = 'ACTIVE', deleted_at = null
  returning id into v_user_id;

  select id into g_admin from public.user_groups
    where tenant_id = p_tenant and lower(name) = 'tenant_admin' and deleted_at is null;

  insert into public.user_group_members (tenant_id, user_id, group_id)
  values (p_tenant, v_user_id, g_admin)
  on conflict (user_id, group_id) do nothing;

  return v_user_id;
end
$$;

-- Privileged: provisioning is a service-role / SQL-editor action, never a
-- normal user request.
grant execute on function app.provision_tenant_rbac(uuid) to service_role;
grant execute on function app.link_tenant_admin(uuid, uuid, text, text, text, uuid) to service_role;
