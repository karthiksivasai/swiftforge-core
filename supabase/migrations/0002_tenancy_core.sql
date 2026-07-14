-- ===========================================================================
-- 0002  tenancy core: plans, tenants, tenant_users (membership), subscriptions
-- ---------------------------------------------------------------------------
-- Establishes the SaaS root (tenants), the billing catalog (plans), the
-- tenant<->auth.user membership anchor (tenant_users) that RLS resolves tenant
-- context from, and per-tenant subscriptions. Enables RLS on all of them.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- plans — global subscription catalog (NOT tenant-owned).
-- ---------------------------------------------------------------------------
create table if not exists public.plans (
  id            uuid primary key default gen_random_uuid(),
  code          text not null,
  name          text not null,
  price_monthly numeric(14,2) not null default 0 check (price_monthly >= 0),
  price_yearly  numeric(14,2) not null default 0 check (price_yearly  >= 0),
  currency      text not null default 'INR',
  limits        jsonb not null default '{}'::jsonb,   -- max_users, max_branches, max_shipments_month, storage_gb
  features      jsonb not null default '{}'::jsonb,   -- feature flags
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  row_version   integer not null default 1
);
create unique index if not exists plans_code_uq on public.plans (code);

-- ---------------------------------------------------------------------------
-- tenants — one row per courier company (SaaS root; no tenant_id column).
-- ---------------------------------------------------------------------------
create table if not exists public.tenants (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null,                          -- subdomain label
  name          text not null,
  short_name    text,
  logo_initials text,
  support_email text,
  support_phone text,
  custom_domain text,
  branding      jsonb not null default '{}'::jsonb,     -- white-label config
  status        text not null default 'TRIAL'
                  check (status in ('TRIAL','ACTIVE','SUSPENDED','CLOSED')),
  plan_id       uuid references public.plans(id),
  trial_ends_at timestamptz,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  deleted_at    timestamptz,
  row_version   integer not null default 1,
  constraint tenants_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$')
);
create unique index if not exists tenants_slug_uq
  on public.tenants (slug) where deleted_at is null;
create unique index if not exists tenants_custom_domain_uq
  on public.tenants (custom_domain) where custom_domain is not null and deleted_at is null;

-- ---------------------------------------------------------------------------
-- tenant_users — MINIMAL membership anchor linking auth.users -> tenants.
-- This is the secure tenant-context source for RLS. Phase 2's full user/RBAC
-- system extends this (groups, permissions, profile fields); it does not
-- replace it. Kept intentionally small here.
-- ---------------------------------------------------------------------------
create table if not exists public.tenant_users (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  role              text not null default 'MEMBER'
                      check (role in ('OWNER','ADMIN','MEMBER')),
  is_platform_admin boolean not null default false,     -- cross-tenant platform staff
  status            text not null default 'ACTIVE'
                      check (status in ('ACTIVE','INACTIVE')),
  created_at        timestamptz not null default now(),
  created_by        uuid,
  updated_at        timestamptz not null default now(),
  updated_by        uuid,
  row_version       integer not null default 1,
  unique (tenant_id, user_id)
);
create index if not exists tenant_users_tenant_idx on public.tenant_users (tenant_id);
create index if not exists tenant_users_user_idx   on public.tenant_users (user_id);

-- ---------------------------------------------------------------------------
-- tenant_subscriptions — per-tenant subscription history.
-- ---------------------------------------------------------------------------
create table if not exists public.tenant_subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  plan_id              uuid not null references public.plans(id),
  status               text not null default 'TRIALING'
                         check (status in ('TRIALING','ACTIVE','PAST_DUE','CANCELLED')),
  current_period_start timestamptz,
  current_period_end   timestamptz,
  payment_gateway_ref  text,
  created_at           timestamptz not null default now(),
  created_by           uuid,
  updated_at           timestamptz not null default now(),
  updated_by           uuid,
  deleted_at           timestamptz,
  row_version          integer not null default 1,
  constraint tenant_subscriptions_period_chk
    check (current_period_end is null or current_period_start is null
           or current_period_end >= current_period_start)
);
create index if not exists tenant_subscriptions_tenant_idx
  on public.tenant_subscriptions (tenant_id, created_at desc);

-- ===========================================================================
-- Tenant-context helper functions (SECURITY DEFINER so policy checks can read
-- membership without triggering recursive RLS on tenant_users).
-- ===========================================================================
create or replace function app.user_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tu.tenant_id
  from public.tenant_users tu
  where tu.user_id = auth.uid()
    and tu.status = 'ACTIVE'
$$;

create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid()
      and tu.is_platform_admin
      and tu.status = 'ACTIVE'
  )
$$;

comment on function app.user_tenant_ids() is
  'Tenant ids the current authenticated user actively belongs to. RLS anchor.';

-- Keep updated_at / row_version correct on writes.
drop trigger if exists trg_touch_plans on public.plans;
create trigger trg_touch_plans before insert or update on public.plans
  for each row execute function app.tg_touch_row();
drop trigger if exists trg_touch_tenants on public.tenants;
create trigger trg_touch_tenants before insert or update on public.tenants
  for each row execute function app.tg_touch_row();
drop trigger if exists trg_touch_tenant_users on public.tenant_users;
create trigger trg_touch_tenant_users before insert or update on public.tenant_users
  for each row execute function app.tg_touch_row();
drop trigger if exists trg_touch_tenant_subscriptions on public.tenant_subscriptions;
create trigger trg_touch_tenant_subscriptions before insert or update on public.tenant_subscriptions
  for each row execute function app.tg_touch_row();

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
alter table public.plans                enable row level security;
alter table public.tenants               enable row level security;
alter table public.tenant_users          enable row level security;
alter table public.tenant_subscriptions  enable row level security;

-- plans: any authenticated user may read the active catalog; only platform
-- admins (or the service role, which bypasses RLS) may write.
drop policy if exists plans_select on public.plans;
create policy plans_select on public.plans
  for select using (auth.uid() is not null);
drop policy if exists plans_admin_write on public.plans;
create policy plans_admin_write on public.plans
  for all using (app.is_platform_admin()) with check (app.is_platform_admin());

-- tenants: members can see their own tenant; platform admins see all;
-- writes restricted to platform admins (provisioning uses the service role).
drop policy if exists tenants_select on public.tenants;
create policy tenants_select on public.tenants
  for select using (id in (select app.user_tenant_ids()) or app.is_platform_admin());
drop policy if exists tenants_admin_write on public.tenants;
create policy tenants_admin_write on public.tenants
  for all using (app.is_platform_admin()) with check (app.is_platform_admin());

-- tenant_users: a user sees their own memberships; tenant OWNER/ADMIN manage
-- memberships within their tenant; platform admins manage all.
drop policy if exists tenant_users_select on public.tenant_users;
create policy tenant_users_select on public.tenant_users
  for select using (
    user_id = auth.uid()
    or app.is_platform_admin()
    or tenant_id in (select app.user_tenant_ids())
  );
drop policy if exists tenant_users_admin_write on public.tenant_users;
create policy tenant_users_admin_write on public.tenant_users
  for all using (
    app.is_platform_admin()
    or exists (
      select 1 from public.tenant_users me
      where me.user_id = auth.uid()
        and me.tenant_id = tenant_users.tenant_id
        and me.role in ('OWNER','ADMIN')
        and me.status = 'ACTIVE'
    )
  ) with check (
    app.is_platform_admin()
    or exists (
      select 1 from public.tenant_users me
      where me.user_id = auth.uid()
        and me.tenant_id = tenant_users.tenant_id
        and me.role in ('OWNER','ADMIN')
        and me.status = 'ACTIVE'
    )
  );

-- tenant_subscriptions: readable by tenant members; writable by platform admin.
drop policy if exists tenant_subscriptions_select on public.tenant_subscriptions;
create policy tenant_subscriptions_select on public.tenant_subscriptions
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());
drop policy if exists tenant_subscriptions_admin_write on public.tenant_subscriptions;
create policy tenant_subscriptions_admin_write on public.tenant_subscriptions
  for all using (app.is_platform_admin()) with check (app.is_platform_admin());
