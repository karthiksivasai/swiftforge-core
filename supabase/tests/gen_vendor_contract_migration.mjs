// Generates supabase/migrations/0028_vendor_contract_aggregate.sql by extending 0027 import/lookup.
// Run: node supabase/tests/gen_vendor_contract_migration.mjs
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync(new URL("../migrations/0027_service_mapping_master.sql", import.meta.url), "utf8");

const importStart = src.indexOf("-- EXTEND public.import_master (0016–0025)");
const importEnd = src.indexOf("-- EXTEND public.lookup", importStart);
let importBlock = src.slice(importStart, importEnd);

importBlock = importBlock.replace(
  /-- EXTEND public\.import_master \(0016–0025\)[^\n]*/,
  "-- EXTEND public.import_master (0016–0027) — all prior branches kept verbatim; vendor_contracts (0028) appended.",
);
importBlock = importBlock.replace(
  `  v_bvendor  uuid;       -- billing_vendor_id (service_mappings)`,
  `  v_bvendor  uuid;       -- billing_vendor_id (service_mappings)
  v_origin   uuid;       -- origin_destination_id (vendor_contracts)`,
);
importBlock = importBlock.replace(
  `    when 'service_mappings'    then 'mst.service-mapping'
    else null end;`,
  `    when 'service_mappings'    then 'mst.service-mapping'
    when 'vendor_contracts'    then 'mst.vendor-contract-master'
    else null end;`,
);
importBlock = importBlock.replace(
  `    when 'service_mappings' then
      v_map_vendors := app.import_build_code_map(v_tenant, 'vendors',
        app.import_distinct_codes(p_rows, array['vendor_code','billing_vendor_code']));`,
  `    when 'service_mappings' then
      v_map_vendors := app.import_build_code_map(v_tenant, 'vendors',
        app.import_distinct_codes(p_rows, array['vendor_code','billing_vendor_code']));
    when 'vendor_contracts' then
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
);
importBlock = importBlock.replace(
  `    v_customer := null; v_vendor := null; v_bvendor := null;`,
  `    v_customer := null; v_vendor := null; v_bvendor := null; v_origin := null;`,
);

const vendorContractImportArm = `
      -- ---------------------- VENDOR CONTRACT (0028) ----------------------
      -- Aggregate ROOT only — slabs are managed through public.save_vendor_contract.
      when 'vendor_contracts' then
        if coalesce(btrim(v_row->>'vendor_code'),'') = '' then v_col:='vendor_code'; raise exception using errcode='CMS01', message='Vendor code is required'; end if;
        if coalesce(btrim(v_row->>'product_code'),'') = '' then v_col:='product_code'; raise exception using errcode='CMS01', message='Product code is required'; end if;
        if coalesce(btrim(v_row->>'contract_no'),'') = '' then v_col:='contract_no'; raise exception using errcode='CMS01', message='Contract no is required'; end if;
        if coalesce(btrim(v_row->>'from_date'),'') = '' then v_col:='from_date'; raise exception using errcode='CMS01', message='From date is required'; end if;
        v_col := 'vendor_code'; v_vendor := app.import_lookup(v_map_vendors, v_row->>'vendor_code', 'Vendor code');
        v_col := 'product_code'; v_prod := app.import_lookup(v_map_products, v_row->>'product_code', 'Product code');
        v_col := 'zone_code'; v_zone := app.import_lookup(v_map_zones, v_row->>'zone_code', 'Zone code');
        v_col := 'country_code'; v_country := app.import_lookup(v_map_countries, v_row->>'country_code', 'Country code');
        v_col := 'origin_destination_code'; v_origin := app.import_lookup(v_map_destinations, v_row->>'origin_destination_code', 'Origin destination code');
        v_col := 'destination_code'; v_dest := app.import_lookup(v_map_destinations, v_row->>'destination_code', 'Destination code');
        v_col := null;
        insert into public.vendor_contracts
          (tenant_id, contract_no, from_date, vendor_id, origin_destination_id,
           zone_id, country_id, destination_id, product_id, service, unit, transit_days, status)
        values (v_tenant, btrim(v_row->>'contract_no'), (v_row->>'from_date')::date, v_vendor, v_origin,
                v_zone, v_country, v_dest, v_prod,
                nullif(btrim(coalesce(v_row->>'service','')),''),
                app.norm_enum(v_row->>'unit', array['KG','LB','CBM','PIECE'], 'Unit', 'KG'),
                nullif(btrim(v_row->>'transit_days'),'')::integer,
                app.norm_enum(v_row->>'status', array['ACTIVE','INACTIVE'], 'Status', 'ACTIVE'))
        on conflict (tenant_id, vendor_id, contract_no, from_date, product_id) where deleted_at is null do nothing;`;

importBlock = importBlock.replace(
  `        on conflict (tenant_id, vendor_id, service) where deleted_at is null do nothing;
      end case;`,
  `        on conflict (tenant_id, vendor_id, service) where deleted_at is null do nothing;${vendorContractImportArm}
      end case;`,
);
importBlock = importBlock.replace(
  `'Reusable master CSV import (geo + catalog + party incl. customers/vendors/consignees/shippers/service_mappings):`,
  `'Reusable master CSV import (geo + catalog + party incl. customers/vendors/consignees/shippers/service_mappings/vendor_contracts):`,
);

const lookupStart = src.lastIndexOf("-- EXTEND public.lookup");
const lookupEnd = src.length;
const lookupBlock = src.slice(lookupStart, lookupEnd);

const ddl = `-- ===========================================================================
-- 0028  vendor contract aggregate (Phase 3 — Operation Masters)
-- ---------------------------------------------------------------------------
-- Vendor rate contracts: header (vendor_contracts) + slab lines
-- (vendor_contract_slabs). Permission slug: mst.vendor-contract-master (0010).
-- Import EXTENDED (root only); lookup unchanged (search-gated UI uses filters).
-- ===========================================================================

create table if not exists public.vendor_contracts (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants(id) on delete cascade,
  contract_no             text not null,
  from_date               date not null,
  vendor_id               uuid not null,
  origin_destination_id   uuid,
  zone_id                 uuid,
  country_id              uuid,
  destination_id          uuid,
  product_id              uuid not null,
  service                 text,
  unit                    text not null default 'KG' check (unit in ('KG','LB','CBM','PIECE')),
  transit_days            integer,
  status                  text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  created_at              timestamptz not null default now(),
  created_by              uuid,
  updated_at              timestamptz not null default now(),
  updated_by              uuid,
  deleted_at              timestamptz,
  row_version             integer not null default 1,
  constraint vendor_contracts_tenant_id_uq unique (tenant_id, id),
  constraint vendor_contracts_vendor_fk foreign key (tenant_id, vendor_id)
    references public.vendors (tenant_id, id),
  constraint vendor_contracts_origin_fk foreign key (tenant_id, origin_destination_id)
    references public.destinations (tenant_id, id) on delete set null,
  constraint vendor_contracts_zone_fk foreign key (tenant_id, zone_id)
    references public.zones (tenant_id, id) on delete set null,
  constraint vendor_contracts_country_fk foreign key (tenant_id, country_id)
    references public.countries (tenant_id, id) on delete set null,
  constraint vendor_contracts_destination_fk foreign key (tenant_id, destination_id)
    references public.destinations (tenant_id, id) on delete set null,
  constraint vendor_contracts_product_fk foreign key (tenant_id, product_id)
    references public.products (tenant_id, id)
);
create unique index if not exists vendor_contracts_natural_uq
  on public.vendor_contracts (tenant_id, vendor_id, contract_no, from_date, product_id)
  where deleted_at is null;
create index if not exists vendor_contracts_tenant_idx on public.vendor_contracts (tenant_id);
create index if not exists vendor_contracts_vendor_idx on public.vendor_contracts (tenant_id, vendor_id);
create index if not exists vendor_contracts_from_date_idx on public.vendor_contracts (tenant_id, from_date desc);
create index if not exists vendor_contracts_contract_no_trgm
  on public.vendor_contracts using gin (contract_no gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- vendor_contract_slabs — 1:N ordered child collection (replace-sync via RPC)
-- ---------------------------------------------------------------------------
create table if not exists public.vendor_contract_slabs (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  contract_id uuid not null,
  seq         integer not null,
  rate_type   text not null check (rate_type in ('FLAT','PER_KG','PER_SLAB','MINIMUM')),
  weight      numeric(12,3) not null default 0,
  rate        numeric(14,4) not null default 0,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  constraint vendor_contract_slabs_contract_fk foreign key (tenant_id, contract_id)
    references public.vendor_contracts (tenant_id, id) on delete cascade,
  constraint vendor_contract_slabs_uq unique (tenant_id, contract_id, seq)
);
create index if not exists vendor_contract_slabs_contract_idx
  on public.vendor_contract_slabs (tenant_id, contract_id);

select app.attach_master_triggers('vendor_contracts', 'mst.vendor-contract-master');

do $$
declare r record;
begin
  for r in (select 'vendor_contracts' as tbl, 'mst.vendor-contract-master' as slug)
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

alter table public.vendor_contract_slabs enable row level security;

drop policy if exists vendor_contract_slabs_select on public.vendor_contract_slabs;
create policy vendor_contract_slabs_select on public.vendor_contract_slabs
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());

drop policy if exists vendor_contract_slabs_insert on public.vendor_contract_slabs;
create policy vendor_contract_slabs_insert on public.vendor_contract_slabs
  for insert with check (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'mst.vendor-contract-master', 'modify'));

drop policy if exists vendor_contract_slabs_delete on public.vendor_contract_slabs;
create policy vendor_contract_slabs_delete on public.vendor_contract_slabs
  for delete using (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'mst.vendor-contract-master', 'modify'));

-- ===========================================================================
-- public.save_vendor_contract — aggregate save (root + slab replace-sync)
-- ===========================================================================
create or replace function public.save_vendor_contract(
  p_id          uuid,
  p_row_version integer,
  p_fields      jsonb,
  p_slabs       jsonb
)
returns public.vendor_contracts
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_vc     public.vendor_contracts;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'p_fields must be a JSON object' using errcode = '22023';
  end if;
  if coalesce(btrim(p_fields->>'contract_no'), '') = '' then
    raise exception 'Contract no is required' using errcode = '22023';
  end if;
  if coalesce(btrim(p_fields->>'from_date'), '') = '' then
    raise exception 'From date is required' using errcode = '22023';
  end if;
  if coalesce(btrim(p_fields->>'vendor_id'), '') = '' then
    raise exception 'Vendor is required' using errcode = '22023';
  end if;
  if coalesce(btrim(p_fields->>'product_id'), '') = '' then
    raise exception 'Product is required' using errcode = '22023';
  end if;

  if p_id is null then
    if not app.user_has_permission(v_tenant, 'mst.vendor-contract-master', 'add') then
      raise exception 'Permission denied: mst.vendor-contract-master add' using errcode = '42501';
    end if;
    insert into public.vendor_contracts (
      tenant_id, contract_no, from_date, vendor_id, origin_destination_id,
      zone_id, country_id, destination_id, product_id, service, unit, transit_days, status)
    values (
      v_tenant,
      btrim(p_fields->>'contract_no'),
      (p_fields->>'from_date')::date,
      (p_fields->>'vendor_id')::uuid,
      nullif(btrim(coalesce(p_fields->>'origin_destination_id','')), '')::uuid,
      nullif(btrim(coalesce(p_fields->>'zone_id','')), '')::uuid,
      nullif(btrim(coalesce(p_fields->>'country_id','')), '')::uuid,
      nullif(btrim(coalesce(p_fields->>'destination_id','')), '')::uuid,
      (p_fields->>'product_id')::uuid,
      nullif(btrim(coalesce(p_fields->>'service','')),''),
      app.norm_enum(p_fields->>'unit', array['KG','LB','CBM','PIECE'], 'Unit', 'KG'),
      nullif(btrim(coalesce(p_fields->>'transit_days','')), '')::integer,
      app.norm_enum(p_fields->>'status', array['ACTIVE','INACTIVE'], 'Status', 'ACTIVE'))
    returning * into v_vc;
  else
    if not app.user_has_permission(v_tenant, 'mst.vendor-contract-master', 'modify') then
      raise exception 'Permission denied: mst.vendor-contract-master modify' using errcode = '42501';
    end if;
    update public.vendor_contracts set
      contract_no           = btrim(p_fields->>'contract_no'),
      from_date             = (p_fields->>'from_date')::date,
      vendor_id             = (p_fields->>'vendor_id')::uuid,
      origin_destination_id = nullif(btrim(coalesce(p_fields->>'origin_destination_id','')), '')::uuid,
      zone_id               = nullif(btrim(coalesce(p_fields->>'zone_id','')), '')::uuid,
      country_id            = nullif(btrim(coalesce(p_fields->>'country_id','')), '')::uuid,
      destination_id        = nullif(btrim(coalesce(p_fields->>'destination_id','')), '')::uuid,
      product_id            = (p_fields->>'product_id')::uuid,
      service               = nullif(btrim(coalesce(p_fields->>'service','')),''),
      unit                  = app.norm_enum(p_fields->>'unit', array['KG','LB','CBM','PIECE'], 'Unit', 'KG'),
      transit_days          = nullif(btrim(coalesce(p_fields->>'transit_days','')), '')::integer,
      status                = app.norm_enum(p_fields->>'status', array['ACTIVE','INACTIVE'], 'Status', 'ACTIVE')
    where id = p_id
      and tenant_id = v_tenant
      and deleted_at is null
      and row_version = p_row_version
    returning * into v_vc;

    if not found then
      raise exception 'This record was changed by someone else. Reload and try again.'
        using errcode = '40001';
    end if;
  end if;

  delete from public.vendor_contract_slabs
  where tenant_id = v_tenant and contract_id = v_vc.id;

  if p_slabs is not null and jsonb_typeof(p_slabs) = 'array' then
    insert into public.vendor_contract_slabs (tenant_id, contract_id, seq, rate_type, weight, rate)
    select v_tenant, v_vc.id, t.ord,
      app.norm_enum(
        coalesce(t.row->>'rate_type', t.row->>'rateType'),
        array['FLAT','PER_KG','PER_SLAB','MINIMUM'], 'Rate type', 'FLAT'),
      coalesce(nullif(btrim(coalesce(t.row->>'weight','')), '')::numeric, 0),
      coalesce(nullif(btrim(coalesce(t.row->>'rate','')), '')::numeric, 0)
    from jsonb_array_elements(p_slabs) with ordinality as t(row, ord)
    where coalesce(btrim(coalesce(t.row->>'rate','')), '') <> '';
  end if;

  perform app.write_audit_log(
    v_tenant, 'vendor_contracts',
    case when p_id is null then 'ADD' else 'MODIFY' end,
    v_vc.id, 'mst.vendor-contract-master', null,
    jsonb_build_object('slabs', coalesce(p_slabs, '[]'::jsonb)));

  return v_vc;
end
$$;

comment on function public.save_vendor_contract(uuid, integer, jsonb, jsonb) is
  'Aggregate Save Pattern: upsert vendor_contracts root (optimistic-locked on update) and replace vendor_contract_slabs child collection in ONE transaction.';

grant execute on function public.save_vendor_contract(uuid, integer, jsonb, jsonb) to authenticated, service_role;

${importBlock}

${lookupBlock}
`;

writeFileSync(new URL("../migrations/0028_vendor_contract_aggregate.sql", import.meta.url), ddl);
console.log("Wrote supabase/migrations/0028_vendor_contract_aggregate.sql");
