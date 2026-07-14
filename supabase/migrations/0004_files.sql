-- ===========================================================================
-- 0004  files — object-storage metadata (tenant-owned).
-- ---------------------------------------------------------------------------
-- One row per uploaded object in the private `tenant-files` bucket. The actual
-- bytes live in Supabase Storage; this table holds searchable metadata, the
-- scan status, and the polymorphic owner link.
-- ===========================================================================

create table if not exists public.files (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  branch_id     uuid references public.branches(id) on delete set null,
  storage_bucket text not null default 'tenant-files',
  storage_key   text not null,                 -- tenants/{tenant_id}/{module}/{uuid}-{name}
  original_name text not null,
  mime          text,
  size_bytes    bigint check (size_bytes is null or size_bytes >= 0),
  sha256        text,
  scan_status   text not null default 'PENDING'
                  check (scan_status in ('PENDING','CLEAN','INFECTED')),
  owner_type    text,                          -- e.g. CUSTOMER, SHIPMENT, EXPENSE
  owner_id      uuid,
  uploaded_by   uuid,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  deleted_at    timestamptz,
  row_version   integer not null default 1
);
create unique index if not exists files_storage_key_uq
  on public.files (storage_bucket, storage_key) where deleted_at is null;
create index if not exists files_tenant_idx on public.files (tenant_id);
create index if not exists files_tenant_owner_idx on public.files (tenant_id, owner_type, owner_id);

drop trigger if exists trg_touch_files on public.files;
create trigger trg_touch_files before insert or update on public.files
  for each row execute function app.tg_touch_row();

alter table public.files enable row level security;

drop policy if exists files_select on public.files;
create policy files_select on public.files
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());

drop policy if exists files_insert on public.files;
create policy files_insert on public.files
  for insert with check (tenant_id in (select app.user_tenant_ids()));

drop policy if exists files_update on public.files;
create policy files_update on public.files
  for update using (tenant_id in (select app.user_tenant_ids()))
  with check (tenant_id in (select app.user_tenant_ids()));

drop policy if exists files_delete on public.files;
create policy files_delete on public.files
  for delete using (tenant_id in (select app.user_tenant_ids()));
