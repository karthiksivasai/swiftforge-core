// Generates supabase/migrations/0026_vendor_wizard_extensions.sql (Milestone 11D–11F).
// Run: node supabase/tests/gen_vendor_wizard_migration.mjs
import { readFileSync, writeFileSync } from "node:fs";

const saveVendor = readFileSync(new URL("./save_vendor_extended_fn.sql", import.meta.url), "utf8");

const ddl = `-- ===========================================================================
-- 0026  vendor wizard extensions (Phase 3 — Party Masters, Milestone 11D–11F)
-- ---------------------------------------------------------------------------
-- Normalizes Documents, Services, and API Credentials wizard tabs into dedicated
-- child tables synced by save_vendor (replace semantics).
-- wizard_extras retains rates-file metadata only. import_master / lookup unchanged.
-- ===========================================================================

-- ===========================================================================
-- vendor_documents (wizard tab; file storage FK deferred)
-- ===========================================================================
create table if not exists public.vendor_documents (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  vendor_id     uuid not null,
  seq           integer not null,
  doc_type      text not null,
  file_name     text,
  file_id       uuid,
  remark        text,
  constraint vendor_documents_vendor_fk foreign key (tenant_id, vendor_id)
    references public.vendors (tenant_id, id) on delete cascade,
  constraint vendor_documents_uq unique (tenant_id, vendor_id, seq)
);
create index if not exists vendor_documents_vendor_idx
  on public.vendor_documents (tenant_id, vendor_id);

-- ===========================================================================
-- vendor_services
-- ===========================================================================
create table if not exists public.vendor_services (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  vendor_id           uuid not null,
  seq                 integer not null,
  service             text,
  billing_vendor_id   uuid,
  min_weight          numeric(14,3),
  max_weight          numeric(14,3),
  vendor_link         text,
  is_single_piece     boolean not null default false,
  status              text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  constraint vendor_services_vendor_fk foreign key (tenant_id, vendor_id)
    references public.vendors (tenant_id, id) on delete cascade,
  constraint vendor_services_billing_vendor_fk foreign key (tenant_id, billing_vendor_id)
    references public.vendors (tenant_id, id) on delete set null,
  constraint vendor_services_uq unique (tenant_id, vendor_id, seq)
);
create index if not exists vendor_services_vendor_idx
  on public.vendor_services (tenant_id, vendor_id);

-- ===========================================================================
-- vendor_api_credentials
-- ===========================================================================
create table if not exists public.vendor_api_credentials (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  vendor_id     uuid not null,
  seq           integer not null,
  carrier_code  text not null,
  api_key       text,
  api_secret    text,
  endpoint_url  text,
  username      text,
  is_active     boolean not null default true,
  remark        text,
  constraint vendor_api_credentials_vendor_fk foreign key (tenant_id, vendor_id)
    references public.vendors (tenant_id, id) on delete cascade,
  constraint vendor_api_credentials_uq unique (tenant_id, vendor_id, seq)
);
create index if not exists vendor_api_credentials_vendor_idx
  on public.vendor_api_credentials (tenant_id, vendor_id);

-- Child RLS (vendor-master gated; modify covers replace writes).
do $$
declare r record;
begin
  for r in (
    select * from (values
      ('vendor_documents'),
      ('vendor_services'),
      ('vendor_api_credentials')
    ) as t(tbl)
  ) loop
    execute format('alter table public.%I enable row level security;', r.tbl);
    execute format('drop policy if exists %I on public.%I;', r.tbl || '_select', r.tbl);
    execute format($p$create policy %I on public.%I for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());$p$, r.tbl || '_select', r.tbl);
    execute format('drop policy if exists %I on public.%I;', r.tbl || '_insert', r.tbl);
    execute format($p$create policy %I on public.%I for insert with check (tenant_id in (select app.user_tenant_ids()) and app.user_has_permission(tenant_id, 'mst.vendor-master', 'add'));$p$, r.tbl || '_insert', r.tbl);
    execute format('drop policy if exists %I on public.%I;', r.tbl || '_delete', r.tbl);
    execute format($p$create policy %I on public.%I for delete using (tenant_id in (select app.user_tenant_ids()) and app.user_has_permission(tenant_id, 'mst.vendor-master', 'modify'));$p$, r.tbl || '_delete', r.tbl);
  end loop;
end $$;

${saveVendor}
`;

writeFileSync(new URL("../migrations/0026_vendor_wizard_extensions.sql", import.meta.url), ddl);
console.log("Wrote supabase/migrations/0026_vendor_wizard_extensions.sql");
