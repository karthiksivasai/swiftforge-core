-- ===========================================================================
-- 0008  RBAC core tables (Phase 2)
-- ---------------------------------------------------------------------------
-- users, user_groups, user_group_members, user_branch_access,
-- permission_modules (global catalog), group_permissions.
-- Tables + indexes + touch triggers only. Helper functions and RLS policies
-- live in 0009 (they depend on ALL these tables existing first).
--
-- Builds on Phase 1: tenant context is still anchored by `tenant_users` +
-- `app.user_tenant_ids()`. This migration does NOT modify Phase 1 objects.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- users — tenant-scoped application user profile, 1:1 with an auth.users row.
-- Password/identity live in Supabase Auth; this holds tenant username, type,
-- branch scope, and the User-Setup feature flags from the blueprint.
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  auth_user_id          uuid not null references auth.users(id) on delete cascade,
  username              text not null,
  user_type             text not null default 'STAFF'
                          check (user_type in ('ADMIN','STAFF','CUSTOMER')),
  customer_id           uuid,                 -- FK added in Phase 3 (customers)
  home_branch_id        uuid references public.branches(id) on delete set null,
  is_global             boolean not null default false,  -- widens branch scope
  full_name             text,
  email                 text,
  mobile                text,
  status                text not null default 'ACTIVE'
                          check (status in ('ACTIVE','INACTIVE')),
  application_type       text not null default 'PORTAL'
                          check (application_type in ('ALL','MOBILE','PORTAL')),
  weight_unit           text not null default 'KG' check (weight_unit in ('KG','LB')),
  -- User-Setup operational flags (blueprint §3.1 user-level constraints)
  otp_login_enabled     boolean not null default false,
  global_manifest       boolean not null default false,
  allow_changing_awb_no boolean not null default false,
  add_entry_on_manifest boolean not null default false,
  backdating_modules    text[] not null default '{}',
  allow_changing_date   text,
  birth_date            date,
  joining_date          date,
  created_at            timestamptz not null default now(),
  created_by            uuid,
  updated_at            timestamptz not null default now(),
  updated_by            uuid,
  deleted_at            timestamptz,
  row_version           integer not null default 1,
  constraint users_customer_requires_customer_id
    check (user_type <> 'CUSTOMER' or customer_id is not null)
);
create unique index if not exists users_auth_user_uq on public.users (auth_user_id);
create unique index if not exists users_tenant_username_uq
  on public.users (tenant_id, lower(username)) where deleted_at is null;
create index if not exists users_tenant_idx on public.users (tenant_id);
create index if not exists users_tenant_branch_idx on public.users (tenant_id, home_branch_id);

-- ---------------------------------------------------------------------------
-- user_groups — RBAC groups (roles). Seeded per tenant on provisioning.
-- ---------------------------------------------------------------------------
create table if not exists public.user_groups (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null,
  description text,
  is_system   boolean not null default false,   -- TENANT_ADMIN/OPERATIONS/ACCOUNTS
  status      text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  deleted_at  timestamptz,
  row_version integer not null default 1
);
create unique index if not exists user_groups_tenant_name_uq
  on public.user_groups (tenant_id, lower(name)) where deleted_at is null;
create index if not exists user_groups_tenant_idx on public.user_groups (tenant_id);

-- ---------------------------------------------------------------------------
-- user_group_members — many-to-many users <-> groups.
-- ---------------------------------------------------------------------------
create table if not exists public.user_group_members (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  group_id   uuid not null references public.user_groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (user_id, group_id)
);
create index if not exists user_group_members_tenant_idx on public.user_group_members (tenant_id);
create index if not exists user_group_members_group_idx on public.user_group_members (tenant_id, group_id);

-- ---------------------------------------------------------------------------
-- user_branch_access — branches a user may access beyond home_branch.
-- ---------------------------------------------------------------------------
create table if not exists public.user_branch_access (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  branch_id  uuid not null references public.branches(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (user_id, branch_id)
);
create index if not exists user_branch_access_tenant_idx on public.user_branch_access (tenant_id);
create index if not exists user_branch_access_user_idx on public.user_branch_access (tenant_id, user_id);

-- ---------------------------------------------------------------------------
-- permission_modules — GLOBAL catalog (~168), shared across tenants (like
-- plans). No tenant_id. Seeded in 0010.
-- ---------------------------------------------------------------------------
create table if not exists public.permission_modules (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null,               -- e.g. 'txn.freight-amount-edit'
  section      text not null
                 check (section in ('MASTERS','TRANSACTION','DOCUMENTS','REPORTS','UTILITIES','MOBILE')),
  name         text not null,
  under_menu   text,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists permission_modules_slug_uq on public.permission_modules (slug);
create index if not exists permission_modules_section_idx on public.permission_modules (section, sort_order);

-- ---------------------------------------------------------------------------
-- group_permissions — per group x module CRUDLS grant. Tenant-owned.
-- ---------------------------------------------------------------------------
create table if not exists public.group_permissions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  group_id    uuid not null references public.user_groups(id) on delete cascade,
  module_id   uuid not null references public.permission_modules(id) on delete cascade,
  all_access  boolean not null default false,
  can_add     boolean not null default false,
  can_modify  boolean not null default false,
  can_delete  boolean not null default false,
  can_list    boolean not null default false,
  can_search  boolean not null default false,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  row_version integer not null default 1,
  unique (group_id, module_id)
);
create index if not exists group_permissions_tenant_idx on public.group_permissions (tenant_id);
create index if not exists group_permissions_group_idx on public.group_permissions (tenant_id, group_id);

-- ---------------------------------------------------------------------------
-- touch triggers (updated_at / row_version)
-- ---------------------------------------------------------------------------
drop trigger if exists trg_touch_users on public.users;
create trigger trg_touch_users before insert or update on public.users
  for each row execute function app.tg_touch_row();
drop trigger if exists trg_touch_user_groups on public.user_groups;
create trigger trg_touch_user_groups before insert or update on public.user_groups
  for each row execute function app.tg_touch_row();
drop trigger if exists trg_touch_group_permissions on public.group_permissions;
create trigger trg_touch_group_permissions before insert or update on public.group_permissions
  for each row execute function app.tg_touch_row();
