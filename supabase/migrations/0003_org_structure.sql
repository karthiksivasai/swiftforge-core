-- ===========================================================================
-- 0003  org structure: branches, financial_years, sequence_counters,
--       tenant_settings, usage_counters
-- ---------------------------------------------------------------------------
-- Tenant-owned operational scaffolding. Every table carries tenant_id, a
-- tenant-leading index, soft delete where relevant, row_version, and RLS whose
-- USING/WITH CHECK is `tenant_id in (select app.user_tenant_ids())`.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- branches — service centres.
-- ---------------------------------------------------------------------------
create table if not exists public.branches (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  code            text not null,
  name            text not null,
  sub_name        text,
  address1        text,
  address2        text,
  address3        text,
  address4        text,
  state_code      text,
  pin_code        text,
  telephone       text,
  email           text,
  gst_no          text,
  pan_no          text,
  icn_no          text,
  st_no           text,
  terms           text[] not null default '{}',
  bank_name       text,
  bank_account_no text,
  bank_account_name text,
  bank_address    text,
  bank_ifsc       text,
  bank_micr       text,
  branch_type     text not null default 'BRANCH'
                    check (branch_type in ('BRANCH','FRANCHISE','OTHER')),
  is_head_office  boolean not null default false,
  status          text not null default 'ACTIVE'
                    check (status in ('ACTIVE','INACTIVE')),
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  deleted_at      timestamptz,
  row_version     integer not null default 1
);
create unique index if not exists branches_tenant_code_uq
  on public.branches (tenant_id, code) where deleted_at is null;
create index if not exists branches_tenant_idx on public.branches (tenant_id);

-- ---------------------------------------------------------------------------
-- financial_years — accounting periods (tenant-wide or branch-scoped).
-- ---------------------------------------------------------------------------
create table if not exists public.financial_years (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  branch_id   uuid references public.branches(id) on delete cascade,
  label       text not null,                 -- e.g. "2026-27"
  from_date   date not null,
  to_date     date not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  deleted_at  timestamptz,
  row_version integer not null default 1,
  constraint financial_years_range_chk check (to_date > from_date)
);
create unique index if not exists financial_years_tenant_label_uq
  on public.financial_years (tenant_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), label)
  where deleted_at is null;
create index if not exists financial_years_tenant_idx on public.financial_years (tenant_id);

-- ---------------------------------------------------------------------------
-- sequence_counters — gapless document numbering source (invoice, awb, etc.).
-- ---------------------------------------------------------------------------
create table if not exists public.sequence_counters (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  branch_id   uuid references public.branches(id) on delete cascade,
  fin_year_id uuid references public.financial_years(id) on delete cascade,
  doc_type    text not null
                check (doc_type in (
                  'INVOICE','FREEFORM_INVOICE','DEBIT_NOTE','CREDIT_NOTE','RECEIPT',
                  'EXPENSE','MANIFEST','DRS','PICKUP','BAG_MANIFEST','OBC','AWB')),
  prefix      text not null default '',
  suffix      text not null default '',
  next_no     bigint not null default 1 check (next_no >= 0),
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  row_version integer not null default 1
);
create unique index if not exists sequence_counters_uq
  on public.sequence_counters (
    tenant_id,
    coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(fin_year_id, '00000000-0000-0000-0000-000000000000'::uuid),
    doc_type
  );
create index if not exists sequence_counters_tenant_idx on public.sequence_counters (tenant_id);

-- ---------------------------------------------------------------------------
-- tenant_settings — key/value config (tenant- or branch-scoped).
-- ---------------------------------------------------------------------------
create table if not exists public.tenant_settings (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  scope       text not null default 'TENANT' check (scope in ('TENANT','BRANCH')),
  branch_id   uuid references public.branches(id) on delete cascade,
  key         text not null,
  value       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  row_version integer not null default 1,
  constraint tenant_settings_scope_branch_chk
    check ((scope = 'BRANCH' and branch_id is not null)
        or (scope = 'TENANT' and branch_id is null))
);
create unique index if not exists tenant_settings_uq
  on public.tenant_settings (
    tenant_id,
    scope,
    coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
    key
  );
create index if not exists tenant_settings_tenant_idx on public.tenant_settings (tenant_id);

-- ---------------------------------------------------------------------------
-- usage_counters — metering for plan-limit enforcement.
-- ---------------------------------------------------------------------------
create table if not exists public.usage_counters (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  metric      text not null
                check (metric in ('shipments','storage_bytes','api_calls','users','branches')),
  period      text not null check (period ~ '^\d{4}-\d{2}$'),  -- YYYY-MM
  value       bigint not null default 0 check (value >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  row_version integer not null default 1,
  unique (tenant_id, metric, period)
);
create index if not exists usage_counters_tenant_idx on public.usage_counters (tenant_id, period);

-- ---------------------------------------------------------------------------
-- touch triggers
-- ---------------------------------------------------------------------------
drop trigger if exists trg_touch_branches on public.branches;
create trigger trg_touch_branches before insert or update on public.branches
  for each row execute function app.tg_touch_row();
drop trigger if exists trg_touch_financial_years on public.financial_years;
create trigger trg_touch_financial_years before insert or update on public.financial_years
  for each row execute function app.tg_touch_row();
drop trigger if exists trg_touch_sequence_counters on public.sequence_counters;
create trigger trg_touch_sequence_counters before insert or update on public.sequence_counters
  for each row execute function app.tg_touch_row();
drop trigger if exists trg_touch_tenant_settings on public.tenant_settings;
create trigger trg_touch_tenant_settings before insert or update on public.tenant_settings
  for each row execute function app.tg_touch_row();
drop trigger if exists trg_touch_usage_counters on public.usage_counters;
create trigger trg_touch_usage_counters before insert or update on public.usage_counters
  for each row execute function app.tg_touch_row();

-- ===========================================================================
-- Row Level Security — standard tenant-scoped policy on each table.
-- ===========================================================================
alter table public.branches         enable row level security;
alter table public.financial_years  enable row level security;
alter table public.sequence_counters enable row level security;
alter table public.tenant_settings  enable row level security;
alter table public.usage_counters   enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'branches','financial_years','sequence_counters','tenant_settings','usage_counters'
  ] loop
    execute format('drop policy if exists %I_select on public.%I;', t, t);
    execute format($p$create policy %I_select on public.%I
      for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());$p$, t, t);

    execute format('drop policy if exists %I_insert on public.%I;', t, t);
    execute format($p$create policy %I_insert on public.%I
      for insert with check (tenant_id in (select app.user_tenant_ids()));$p$, t, t);

    execute format('drop policy if exists %I_update on public.%I;', t, t);
    execute format($p$create policy %I_update on public.%I
      for update using (tenant_id in (select app.user_tenant_ids()))
      with check (tenant_id in (select app.user_tenant_ids()));$p$, t, t);

    execute format('drop policy if exists %I_delete on public.%I;', t, t);
    execute format($p$create policy %I_delete on public.%I
      for delete using (tenant_id in (select app.user_tenant_ids()));$p$, t, t);
  end loop;
end
$$;
