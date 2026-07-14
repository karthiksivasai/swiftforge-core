-- ===========================================================================
-- 0009  RBAC resolution functions + RLS policies + grants (Phase 2)
-- ---------------------------------------------------------------------------
-- Permissions are resolved DATABASE-SIDE per request (never from JWT claims),
-- exactly as the blueprint requires (Part 2 §2 last bullet, §3.1-3.2).
-- All functions are SECURITY DEFINER so policy checks read RBAC tables without
-- recursing into their own RLS (same pattern as Phase 1 app.user_tenant_ids()).
-- ===========================================================================

-- ---- current app user + admin -------------------------------------------
create or replace function app.current_app_user_id(p_tenant uuid)
returns uuid
language sql stable security definer set search_path = public, app
as $$
  select u.id from public.users u
  where u.auth_user_id = auth.uid()
    and u.tenant_id = p_tenant
    and u.status = 'ACTIVE'
    and u.deleted_at is null
  limit 1
$$;

create or replace function app.is_tenant_admin(p_tenant uuid)
returns boolean
language sql stable security definer set search_path = public, app
as $$
  select app.is_platform_admin()
      or exists (
        select 1 from public.users u
        where u.auth_user_id = auth.uid()
          and u.tenant_id = p_tenant
          and u.user_type = 'ADMIN'
          and u.status = 'ACTIVE'
          and u.deleted_at is null
      )
$$;

-- ---- effective permission (OR across the user's groups) ------------------
-- Tenant/platform admins implicitly hold every permission.
create or replace function app.user_has_permission(p_tenant uuid, p_slug text, p_action text)
returns boolean
language sql stable security definer set search_path = public, app
as $$
  select case
    when app.is_tenant_admin(p_tenant) then true
    else exists (
      select 1
      from public.users u
      join public.user_group_members m on m.user_id = u.id
      join public.user_groups g       on g.id = m.group_id
                                      and g.status = 'ACTIVE' and g.deleted_at is null
      join public.group_permissions gp on gp.group_id = m.group_id
      join public.permission_modules pm on pm.id = gp.module_id
      where u.auth_user_id = auth.uid()
        and u.tenant_id = p_tenant
        and u.status = 'ACTIVE' and u.deleted_at is null
        and pm.slug = p_slug
        and (
          gp.all_access
          or (p_action = 'add'    and gp.can_add)
          or (p_action = 'modify' and gp.can_modify)
          or (p_action = 'delete' and gp.can_delete)
          or (p_action = 'list'   and gp.can_list)
          or (p_action = 'search' and gp.can_search)
        )
    )
  end
$$;

-- ---- branch scope --------------------------------------------------------
create or replace function app.user_branch_ids(p_tenant uuid)
returns setof uuid
language sql stable security definer set search_path = public, app
as $$
  select b.id
  from public.branches b
  where b.tenant_id = p_tenant
    and b.deleted_at is null
    and (
      app.is_tenant_admin(p_tenant)
      or exists (
        select 1 from public.users u
        where u.auth_user_id = auth.uid() and u.tenant_id = p_tenant
          and u.is_global and u.status = 'ACTIVE' and u.deleted_at is null
      )
      or b.id in (
        select u.home_branch_id from public.users u
          where u.auth_user_id = auth.uid() and u.tenant_id = p_tenant and u.home_branch_id is not null
        union
        select uba.branch_id from public.user_branch_access uba
          join public.users u on u.id = uba.user_id
          where u.auth_user_id = auth.uid() and u.tenant_id = p_tenant
      )
    )
$$;

create or replace function app.user_can_access_branch(p_tenant uuid, p_branch uuid)
returns boolean
language sql stable security definer set search_path = public, app
as $$
  select p_branch in (select app.user_branch_ids(p_tenant))
$$;

-- ===========================================================================
-- RLS
-- ===========================================================================
alter table public.users               enable row level security;
alter table public.user_groups         enable row level security;
alter table public.user_group_members  enable row level security;
alter table public.user_branch_access  enable row level security;
alter table public.permission_modules  enable row level security;
alter table public.group_permissions   enable row level security;

-- ---- permission_modules: global read-only catalog -----------------------
drop policy if exists permission_modules_select on public.permission_modules;
create policy permission_modules_select on public.permission_modules
  for select using (auth.uid() is not null);
drop policy if exists permission_modules_admin_write on public.permission_modules;
create policy permission_modules_admin_write on public.permission_modules
  for all using (app.is_platform_admin()) with check (app.is_platform_admin());

-- ---- users --------------------------------------------------------------
drop policy if exists users_select on public.users;
create policy users_select on public.users
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());

drop policy if exists users_insert on public.users;
create policy users_insert on public.users
  for insert with check (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'utl.user-setup', 'add')
  );

drop policy if exists users_update on public.users;
create policy users_update on public.users
  for update using (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'utl.user-setup', 'modify')
  ) with check (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'utl.user-setup', 'modify')
  );

drop policy if exists users_delete on public.users;
create policy users_delete on public.users
  for delete using (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'utl.user-setup', 'delete')
  );

-- ---- user_groups --------------------------------------------------------
drop policy if exists user_groups_select on public.user_groups;
create policy user_groups_select on public.user_groups
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());

drop policy if exists user_groups_insert on public.user_groups;
create policy user_groups_insert on public.user_groups
  for insert with check (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'utl.user-setup', 'add')
  );

drop policy if exists user_groups_update on public.user_groups;
create policy user_groups_update on public.user_groups
  for update using (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'utl.user-setup', 'modify')
  ) with check (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'utl.user-setup', 'modify')
  );

drop policy if exists user_groups_delete on public.user_groups;
create policy user_groups_delete on public.user_groups
  for delete using (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'utl.user-setup', 'delete')
  );

-- ---- user_group_members -------------------------------------------------
drop policy if exists user_group_members_select on public.user_group_members;
create policy user_group_members_select on public.user_group_members
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());

drop policy if exists user_group_members_insert on public.user_group_members;
create policy user_group_members_insert on public.user_group_members
  for insert with check (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'utl.user-setup', 'modify')
  );

drop policy if exists user_group_members_delete on public.user_group_members;
create policy user_group_members_delete on public.user_group_members
  for delete using (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'utl.user-setup', 'modify')
  );

-- ---- user_branch_access -------------------------------------------------
drop policy if exists user_branch_access_select on public.user_branch_access;
create policy user_branch_access_select on public.user_branch_access
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());

drop policy if exists user_branch_access_insert on public.user_branch_access;
create policy user_branch_access_insert on public.user_branch_access
  for insert with check (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'utl.user-setup', 'modify')
  );

drop policy if exists user_branch_access_delete on public.user_branch_access;
create policy user_branch_access_delete on public.user_branch_access
  for delete using (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'utl.user-setup', 'modify')
  );

-- ---- group_permissions (gated by Access Rights permission) --------------
drop policy if exists group_permissions_select on public.group_permissions;
create policy group_permissions_select on public.group_permissions
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());

drop policy if exists group_permissions_insert on public.group_permissions;
create policy group_permissions_insert on public.group_permissions
  for insert with check (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'utl.access-rights', 'add')
  );

drop policy if exists group_permissions_update on public.group_permissions;
create policy group_permissions_update on public.group_permissions
  for update using (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'utl.access-rights', 'modify')
  ) with check (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'utl.access-rights', 'modify')
  );

drop policy if exists group_permissions_delete on public.group_permissions;
create policy group_permissions_delete on public.group_permissions
  for delete using (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'utl.access-rights', 'delete')
  );

-- ---- grants (explicit; complements Phase 1 0007 default privileges) -----
grant execute on function
  app.current_app_user_id(uuid),
  app.is_tenant_admin(uuid),
  app.user_has_permission(uuid, text, text),
  app.user_branch_ids(uuid),
  app.user_can_access_branch(uuid, uuid)
to anon, authenticated, service_role;
