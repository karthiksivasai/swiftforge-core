// Generates supabase/migrations/0029_local_branch_master.sql by extending 0028 import/lookup.
// Run: node supabase/tests/gen_local_branch_migration.mjs
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync(new URL("../migrations/0028_vendor_contract_aggregate.sql", import.meta.url), "utf8");

const importStart = src.indexOf("-- EXTEND public.import_master (0016–0027)");
const importEnd = src.indexOf("-- EXTEND public.lookup", importStart);
let importBlock = src.slice(importStart, importEnd);

importBlock = importBlock.replace(
  /-- EXTEND public\.import_master \(0016–0027\)[^\n]*/,
  "-- EXTEND public.import_master (0016–0028) — all prior branches kept verbatim; local_branches (0029) appended.",
);
importBlock = importBlock.replace(
  `  v_origin   uuid;       -- origin_destination_id (vendor_contracts)`,
  `  v_origin   uuid;       -- origin_destination_id (vendor_contracts)
  v_bstate   uuid;       -- billing_state_id (local_branches)`,
);
importBlock = importBlock.replace(
  `    when 'vendor_contracts'    then 'mst.vendor-contract-master'
    else null end;`,
  `    when 'vendor_contracts'    then 'mst.vendor-contract-master'
    when 'local_branches'      then 'mst.local-branch-master'
    else null end;`,
);
importBlock = importBlock.replace(
  `    when 'vendor_contracts' then
      v_map_vendors := app.import_build_code_map(v_tenant, 'vendors',
        app.import_distinct_codes(p_rows, array['vendor_code']));
      v_map_products := app.import_build_code_map(v_tenant, 'products',
        app.import_distinct_codes(p_rows, array['product_code']));
      v_map_zones := app.import_build_code_map(v_tenant, 'zones',
        app.import_distinct_codes(p_rows, array['zone_code']));
      v_map_countries := app.import_build_code_map(v_tenant, 'countries',
        app.import_distinct_codes(p_rows, array['country_code']));
      v_map_destinations := app.import_build_code_map(v_tenant, 'destinations',
        app.import_distinct_codes(p_rows, array['origin_destination_code','destination_code']));`,
  `    when 'vendor_contracts' then
      v_map_vendors := app.import_build_code_map(v_tenant, 'vendors',
        app.import_distinct_codes(p_rows, array['vendor_code']));
      v_map_products := app.import_build_code_map(v_tenant, 'products',
        app.import_distinct_codes(p_rows, array['product_code']));
      v_map_zones := app.import_build_code_map(v_tenant, 'zones',
        app.import_distinct_codes(p_rows, array['zone_code']));
      v_map_countries := app.import_build_code_map(v_tenant, 'countries',
        app.import_distinct_codes(p_rows, array['country_code']));
      v_map_destinations := app.import_build_code_map(v_tenant, 'destinations',
        app.import_distinct_codes(p_rows, array['origin_destination_code','destination_code']));
    when 'local_branches' then
      v_map_branches := app.import_build_code_map(v_tenant, 'branches',
        app.import_distinct_codes(p_rows, array['branch_code']));
      v_map_states := app.import_build_code_map(v_tenant, 'states',
        app.import_distinct_codes(p_rows, array['state_code','billing_state_code']));`,
);
importBlock = importBlock.replace(
  `    v_customer := null; v_vendor := null; v_bvendor := null; v_origin := null;`,
  `    v_customer := null; v_vendor := null; v_bvendor := null; v_origin := null; v_bstate := null;`,
);

const localBranchesImportArm = `
      -- ---------------------- LOCAL BRANCH (0029) ----------------------
      when 'local_branches' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        v_col := 'branch_code'; v_branch := app.import_lookup(v_map_branches, v_row->>'branch_code', 'Branch code');
        v_col := 'state_code'; v_state := app.import_lookup(v_map_states, v_row->>'state_code', 'State code');
        v_col := 'billing_state_code'; v_bstate := app.import_lookup(v_map_states, v_row->>'billing_state_code', 'Billing state code');
        v_col := null;
        insert into public.local_branches
          (tenant_id, code, name, branch_id, address1, address2, city, pin_code,
           state_id, billing_state_id, gst_no, phone, email, status)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'), v_branch,
                nullif(btrim(coalesce(v_row->>'address1','')),''),
                nullif(btrim(coalesce(v_row->>'address2','')),''),
                nullif(btrim(coalesce(v_row->>'city','')),''),
                nullif(btrim(coalesce(v_row->>'pin_code', v_row->>'pincode','')),''),
                v_state, v_bstate,
                nullif(btrim(coalesce(v_row->>'gst_no','')),''),
                nullif(btrim(coalesce(v_row->>'phone', v_row->>'telephone','')),''),
                nullif(btrim(coalesce(v_row->>'email','')),''),
                app.norm_enum(v_row->>'status', array['ACTIVE','INACTIVE'], 'Status', 'ACTIVE'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;`;

importBlock = importBlock.replace(
  `        on conflict (tenant_id, vendor_id, contract_no, from_date, product_id) where deleted_at is null do nothing;
      end case;`,
  `        on conflict (tenant_id, vendor_id, contract_no, from_date, product_id) where deleted_at is null do nothing;${localBranchesImportArm}
      end case;`,
);
importBlock = importBlock.replace(
  `'Reusable master CSV import (geo + catalog + party incl. customers/vendors/consignees/shippers/service_mappings/vendor_contracts):`,
  `'Reusable master CSV import (geo + catalog + party incl. customers/vendors/consignees/shippers/service_mappings/vendor_contracts/local_branches):`,
);

let lookupBlock = src.slice(src.lastIndexOf("-- EXTEND public.lookup"));
lookupBlock = lookupBlock.replace(
  `  elsif p_key = 'bank' then
    return query
      select b.id, b.code, b.name, null::text
      from public.banks b
      where b.tenant_id in (select app.user_tenant_ids())
        and b.deleted_at is null
        and b.status = 'ACTIVE'
        and (b.name ilike v_pat or b.code ilike v_pat)
      order by b.name, b.code, b.id
      limit v_limit;

  else`,
  `  elsif p_key = 'bank' then
    return query
      select b.id, b.code, b.name, null::text
      from public.banks b
      where b.tenant_id in (select app.user_tenant_ids())
        and b.deleted_at is null
        and b.status = 'ACTIVE'
        and (b.name ilike v_pat or b.code ilike v_pat)
      order by b.name, b.code, b.id
      limit v_limit;

  elsif p_key = 'branch' then
    return query
      select br.id, br.code, br.name, br.sub_name
      from public.branches br
      where br.tenant_id in (select app.user_tenant_ids())
        and br.deleted_at is null
        and br.status = 'ACTIVE'
        and (br.name ilike v_pat or br.code ilike v_pat)
      order by br.name, br.code, br.id
      limit v_limit;

  elsif p_key = 'local-branch' then
    return query
      select lb.id, lb.code, lb.name, lb.city
      from public.local_branches lb
      where lb.tenant_id in (select app.user_tenant_ids())
        and lb.deleted_at is null
        and lb.status = 'ACTIVE'
        and (lb.name ilike v_pat or lb.code ilike v_pat)
      order by lb.name, lb.code, lb.id
      limit v_limit;

  else`,
);
lookupBlock = lookupBlock.replace(
  `-- EXTEND public.lookup (0017–0024)`,
  `-- EXTEND public.lookup (0017–0028) — branch + local-branch keys appended.`,
);

const ddl = `-- ===========================================================================
-- 0029  local branch master (Phase 3 — Sales Masters)
-- ---------------------------------------------------------------------------
-- Tenant local branch profiles linked to org branches (service centres).
-- Permission slug: mst.local-branch-master (0010). Import + lookup EXTENDED.
-- Child collections (terms, bank, voucher, fin years) deferred to wizard_extras.
-- serviceable_pincodes stored as jsonb array on the root row.
-- ===========================================================================

create table if not exists public.local_branches (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  code                 text not null,
  name                 text not null,
  branch_id            uuid,
  address1             text,
  address2             text,
  city                 text,
  pin_code             text,
  state_id             uuid,
  billing_state_id     uuid,
  gst_no               text,
  phone                text,
  email                text,
  serviceable_pincodes jsonb not null default '[]'::jsonb,
  wizard_extras        jsonb not null default '{}'::jsonb,
  status               text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  created_at           timestamptz not null default now(),
  created_by           uuid,
  updated_at           timestamptz not null default now(),
  updated_by           uuid,
  deleted_at           timestamptz,
  row_version          integer not null default 1,
  constraint local_branches_tenant_id_uq unique (tenant_id, id),
  constraint local_branches_branch_fk foreign key (tenant_id, branch_id)
    references public.branches (tenant_id, id) on delete set null,
  constraint local_branches_state_fk foreign key (tenant_id, state_id)
    references public.states (tenant_id, id) on delete set null,
  constraint local_branches_billing_state_fk foreign key (tenant_id, billing_state_id)
    references public.states (tenant_id, id) on delete set null
);
create unique index if not exists local_branches_tenant_code_uq
  on public.local_branches (tenant_id, code) where deleted_at is null;
create index if not exists local_branches_tenant_idx on public.local_branches (tenant_id);
create index if not exists local_branches_tenant_branch_idx on public.local_branches (tenant_id, branch_id);
create index if not exists local_branches_tenant_state_idx on public.local_branches (tenant_id, state_id);
create index if not exists local_branches_name_trgm
  on public.local_branches using gin (name gin_trgm_ops);
create index if not exists local_branches_code_trgm
  on public.local_branches using gin (code gin_trgm_ops);

select app.attach_master_triggers('local_branches', 'mst.local-branch-master');

do $$
declare r record;
begin
  for r in (select 'local_branches' as tbl, 'mst.local-branch-master' as slug)
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

writeFileSync(new URL("../migrations/0029_local_branch_master.sql", import.meta.url), ddl);
console.log("Wrote supabase/migrations/0029_local_branch_master.sql");
