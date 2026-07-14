// Generates supabase/migrations/0027_service_mapping_master.sql by extending 0025 import/lookup.
// Run: node supabase/tests/gen_service_mapping_migration.mjs
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync(new URL("../migrations/0025_vendor_aggregate.sql", import.meta.url), "utf8");

const importStart = src.indexOf("-- EXTEND public.import_master (0016–0024)");
const importEnd = src.indexOf("-- EXTEND public.lookup", importStart);
let importBlock = src.slice(importStart, importEnd);

importBlock = importBlock.replace(
  /-- EXTEND public\.import_master \(0016–0024\)[^\n]*/,
  "-- EXTEND public.import_master (0016–0025) — all prior branches kept verbatim; service_mappings (0027) appended.",
);
importBlock = importBlock.replace(
  `  v_customer uuid;       -- customer_id (consignees/shippers/customers)`,
  `  v_customer uuid;       -- customer_id (consignees/shippers/customers)
  v_vendor   uuid;       -- vendor_id (service_mappings)
  v_bvendor  uuid;       -- billing_vendor_id (service_mappings)`,
);
importBlock = importBlock.replace(
  `  v_map_customers       jsonb := '{}'::jsonb;`,
  `  v_map_customers       jsonb := '{}'::jsonb;
  v_map_vendors         jsonb := '{}'::jsonb;`,
);
importBlock = importBlock.replace(
  `    when 'vendors'             then 'mst.vendor-master'\n    else null end;`,
  `    when 'vendors'             then 'mst.vendor-master'\n    when 'service_mappings'    then 'mst.service-mapping'\n    else null end;`,
);
importBlock = importBlock.replace(
  `    when 'vendors' then
      v_map_states := app.import_build_code_map(v_tenant, 'states',
        app.import_distinct_codes(p_rows, array['state_code']));
      v_map_destinations := app.import_build_code_map(v_tenant, 'destinations',
        app.import_distinct_codes(p_rows, array['origin_destination_code','destination_code']));`,
  `    when 'vendors' then
      v_map_states := app.import_build_code_map(v_tenant, 'states',
        app.import_distinct_codes(p_rows, array['state_code']));
      v_map_destinations := app.import_build_code_map(v_tenant, 'destinations',
        app.import_distinct_codes(p_rows, array['origin_destination_code','destination_code']));
    when 'service_mappings' then
      v_map_vendors := app.import_build_code_map(v_tenant, 'vendors',
        app.import_distinct_codes(p_rows, array['vendor_code','billing_vendor_code']));`,
);
importBlock = importBlock.replace(
  `    v_ptype := null; v_prod := null; v_exc := null; v_sc := null;`,
  `    v_ptype := null; v_prod := null; v_exc := null; v_sc := null;
    v_customer := null; v_vendor := null; v_bvendor := null;`,
);

const serviceMappingsImportArm = `
      -- ---------------------- SERVICE MAPPING (0027) ----------------------
      when 'service_mappings' then
        if coalesce(btrim(v_row->>'vendor_code'),'') = '' then v_col:='vendor_code'; raise exception using errcode='CMS01', message='Vendor code is required'; end if;
        if coalesce(btrim(v_row->>'service'),'') = '' then v_col:='service'; raise exception using errcode='CMS01', message='Service is required'; end if;
        v_col := 'vendor_code'; v_vendor := app.import_lookup(v_map_vendors, v_row->>'vendor_code', 'Vendor code');
        v_col := 'billing_vendor_code'; v_bvendor := app.import_lookup(v_map_vendors, v_row->>'billing_vendor_code', 'Billing vendor code');
        v_col := null;
        insert into public.service_mappings
          (tenant_id, vendor_id, service, service_type, billing_vendor_id,
           min_weight, max_weight, vendor_link, is_single_piece, status)
        values (v_tenant, v_vendor, btrim(v_row->>'service'),
                nullif(btrim(coalesce(v_row->>'service_type','')),''),
                v_bvendor,
                coalesce(nullif(btrim(v_row->>'min_weight'),'')::numeric, 0),
                coalesce(nullif(btrim(v_row->>'max_weight'),'')::numeric, 99999),
                nullif(btrim(coalesce(v_row->>'vendor_link','')),''),
                coalesce((v_row->>'is_single_piece')::boolean, false),
                app.norm_enum(v_row->>'status', array['ACTIVE','INACTIVE'], 'Status', 'ACTIVE'))
        on conflict (tenant_id, vendor_id, service) where deleted_at is null do nothing;`;

importBlock = importBlock.replace(
  `        on conflict (tenant_id, code) where deleted_at is null do nothing;
      end case;`,
  `        on conflict (tenant_id, code) where deleted_at is null do nothing;${serviceMappingsImportArm}
      end case;`,
);
importBlock = importBlock.replace(
  `'Reusable master CSV import (geo + catalog + party incl. customers/vendors/consignees/shippers):`,
  `'Reusable master CSV import (geo + catalog + party incl. customers/vendors/consignees/shippers/service_mappings):`,
);

const lookupStart = src.lastIndexOf("-- EXTEND public.lookup");
const lookupEnd = src.length;
const lookupBlock = src.slice(lookupStart, lookupEnd);

const ddl = `-- ===========================================================================
-- 0027  service mapping master (Phase 3 — Operation Masters)
-- ---------------------------------------------------------------------------
-- Maps vendor services to billing vendors with weight bands and carrier links.
-- Permission slug: mst.service-mapping (0010). Import EXTENDED; lookup unchanged.
-- ===========================================================================

create table if not exists public.service_mappings (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  vendor_id           uuid not null,
  service             text not null,
  service_type        text,
  billing_vendor_id   uuid,
  min_weight          numeric(12,3) not null default 0,
  max_weight          numeric(12,3) not null default 99999,
  vendor_link         text,
  is_single_piece     boolean not null default false,
  status              text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  created_at          timestamptz not null default now(),
  created_by          uuid,
  updated_at          timestamptz not null default now(),
  updated_by          uuid,
  deleted_at          timestamptz,
  row_version         integer not null default 1,
  constraint service_mappings_tenant_id_uq unique (tenant_id, id),
  constraint service_mappings_vendor_fk foreign key (tenant_id, vendor_id)
    references public.vendors (tenant_id, id),
  constraint service_mappings_billing_vendor_fk foreign key (tenant_id, billing_vendor_id)
    references public.vendors (tenant_id, id) on delete set null
);
create unique index if not exists service_mappings_tenant_vendor_service_uq
  on public.service_mappings (tenant_id, vendor_id, service) where deleted_at is null;
create index if not exists service_mappings_tenant_idx on public.service_mappings (tenant_id);
create index if not exists service_mappings_vendor_idx on public.service_mappings (tenant_id, vendor_id);
create index if not exists service_mappings_tenant_status_idx on public.service_mappings (tenant_id, status);
create index if not exists service_mappings_service_trgm
  on public.service_mappings using gin (service gin_trgm_ops);

select app.attach_master_triggers('service_mappings', 'mst.service-mapping');

do $$
declare r record;
begin
  for r in (select 'service_mappings' as tbl, 'mst.service-mapping' as slug)
  loop
    execute format('alter table public.%I enable row level security;', r.tbl);

    execute format('drop policy if exists %I on public.%I;', r.tbl || '_select', r.tbl);
    execute format($p$create policy %I on public.%I
      for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());$p$,
      r.tbl || '_select', r.tbl);

    execute format('drop policy if exists %I on public.%I;', r.tbl || '_insert', r.tbl);
    execute format($p$create policy %I on public.%I
      for insert with check (
        tenant_id in (select app.user_tenant_ids())
        and app.user_has_permission(tenant_id, %L, 'add'));$p$,
      r.tbl || '_insert', r.tbl, r.slug);

    execute format('drop policy if exists %I on public.%I;', r.tbl || '_update', r.tbl);
    execute format($p$create policy %I on public.%I
      for update using (
        tenant_id in (select app.user_tenant_ids())
        and app.user_has_permission(tenant_id, %L, 'modify'))
      with check (
        tenant_id in (select app.user_tenant_ids())
        and app.user_has_permission(tenant_id, %L, 'modify'));$p$,
      r.tbl || '_update', r.tbl, r.slug, r.slug);

    execute format('drop policy if exists %I on public.%I;', r.tbl || '_delete', r.tbl);
    execute format($p$create policy %I on public.%I
      for delete using (
        tenant_id in (select app.user_tenant_ids())
        and app.user_has_permission(tenant_id, %L, 'delete'));$p$,
      r.tbl || '_delete', r.tbl, r.slug);
  end loop;
end $$;

${importBlock}

${lookupBlock}
`;

writeFileSync(new URL("../migrations/0027_service_mapping_master.sql", import.meta.url), ddl);
console.log("Wrote supabase/migrations/0027_service_mapping_master.sql");
