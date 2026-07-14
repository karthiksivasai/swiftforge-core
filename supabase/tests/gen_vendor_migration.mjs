// Generates supabase/migrations/0025_vendor_aggregate.sql by extending 0023 import/lookup.
// Run: node supabase/tests/gen_vendor_migration.mjs
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync(new URL("../migrations/0023_customer_aggregate.sql", import.meta.url), "utf8");

const importStart = src.indexOf("-- EXTEND public.import_master (0016–0022)");
const importEnd = src.indexOf("grant execute on function public.import_master", importStart);
let importBlock = src.slice(importStart, importEnd);

importBlock = importBlock.replace(
  "-- EXTEND public.import_master (0016–0022) — all prior branches kept verbatim; customer",
  "-- EXTEND public.import_master (0016–0024) — all prior branches kept verbatim; vendor\n-- aggregate (0025) appended; customer",
);
importBlock = importBlock.replace(
  `    when 'customers'           then 'mst.customer-master'\n    else null end;`,
  `    when 'customers'           then 'mst.customer-master'\n    -- party aggregate (0025)\n    when 'vendors'             then 'mst.vendor-master'\n    else null end;`,
);
importBlock = importBlock.replace(
  `    when 'consignees', 'shippers' then\n      v_map_states := app.import_build_code_map(v_tenant, 'states',\n        app.import_distinct_codes(p_rows, array['state_code']));\n      v_map_countries := app.import_build_code_map(v_tenant, 'countries',\n        app.import_distinct_codes(p_rows, array['country_code']));\n      v_map_customers := app.import_build_code_map(v_tenant, 'customers',\n        app.import_distinct_codes(p_rows, array['customer_code']));`,
  `    when 'vendors' then\n      v_map_states := app.import_build_code_map(v_tenant, 'states',\n        app.import_distinct_codes(p_rows, array['state_code']));\n      v_map_destinations := app.import_build_code_map(v_tenant, 'destinations',\n        app.import_distinct_codes(p_rows, array['origin_destination_code','destination_code']));\n    when 'consignees', 'shippers' then\n      v_map_states := app.import_build_code_map(v_tenant, 'states',\n        app.import_distinct_codes(p_rows, array['state_code']));\n      v_map_countries := app.import_build_code_map(v_tenant, 'countries',\n        app.import_distinct_codes(p_rows, array['country_code']));\n      v_map_customers := app.import_build_code_map(v_tenant, 'customers',\n        app.import_distinct_codes(p_rows, array['customer_code']));`,
);

const vendorImportArm = `
      -- ---------------------- VENDOR AGGREGATE (0025) --------------------
      -- TODO(catalog-split): move to app.import_vendors(v_tenant, v_row, v_map_states, v_map_destinations).
      when 'vendors' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        if coalesce(btrim(v_row->>'mobile'),'') = '' then v_col:='mobile'; raise exception using errcode='CMS01', message='Mobile is required'; end if;
        v_col := 'state_code'; v_state := app.import_lookup(v_map_states, v_row->>'state_code', 'State code');
        v_col := 'origin_destination_code';
        v_dest := app.import_lookup(v_map_destinations, coalesce(v_row->>'origin_destination_code', v_row->>'destination_code'), 'Origin destination code');
        v_col := null;
        insert into public.vendors
          (tenant_id, code, name, contact_person, address1, address2, pin_code, city, state_id,
           phone1, phone2, fax, mobile, email, website, gst_no, mode, vendor_class, fuel_head,
           currency, origin_destination_id, vendor_zip, is_global, gst_applies, vol_weight_round_off, status)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'),
                nullif(btrim(coalesce(v_row->>'contact_person', v_row->>'contact','')),''),
                nullif(btrim(coalesce(v_row->>'address1','')),''),
                nullif(btrim(coalesce(v_row->>'address2','')),''),
                nullif(btrim(coalesce(v_row->>'pin_code', v_row->>'pincode','')),''),
                nullif(btrim(coalesce(v_row->>'city','')),''),
                v_state,
                nullif(btrim(coalesce(v_row->>'phone1', v_row->>'phone','')),''),
                nullif(btrim(coalesce(v_row->>'phone2','')),''),
                nullif(btrim(coalesce(v_row->>'fax','')),''),
                btrim(v_row->>'mobile'),
                nullif(btrim(coalesce(v_row->>'email','')),''),
                nullif(btrim(coalesce(v_row->>'website','')),''),
                nullif(btrim(coalesce(v_row->>'gst_no','')),''),
                upper(replace(coalesce(nullif(btrim(v_row->>'mode'), ''), 'COURIER'), ' ', '_')),
                upper(replace(coalesce(nullif(btrim(v_row->>'vendor_class'), ''), 'VENDOR'), ' ', '_')),
                nullif(btrim(coalesce(v_row->>'fuel_head','')),''),
                coalesce(nullif(btrim(v_row->>'currency'), ''), 'INR'),
                v_dest,
                nullif(btrim(coalesce(v_row->>'vendor_zip','')),''),
                coalesce((v_row->>'is_global')::boolean, false),
                coalesce((v_row->>'gst_applies')::boolean, true),
                coalesce((v_row->>'vol_weight_round_off')::boolean, false),
                app.norm_enum(v_row->>'status', array['ACTIVE','INACTIVE'], 'Status', 'ACTIVE'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;`;

importBlock = importBlock.replace(
  `        on conflict (tenant_id, code) where deleted_at is null do nothing;\n      end case;`,
  `        on conflict (tenant_id, code) where deleted_at is null do nothing;${vendorImportArm}\n      end case;`,
);
importBlock = importBlock.replace(
  `'Reusable master CSV import (geo + catalog + party incl. customers/consignees/shippers):`,
  `'Reusable master CSV import (geo + catalog + party incl. customers/vendors/consignees/shippers):`,
);

const lookupStart = src.lastIndexOf("-- EXTEND public.lookup");
const lookupEnd = src.indexOf("grant execute on function public.lookup", lookupStart);
let lookupBlock = src.slice(lookupStart, lookupEnd);
lookupBlock = lookupBlock.replace(
  /-- EXTEND public\.lookup \(0017–0022\)[^\n]*/,
  "-- EXTEND public.lookup (0017–0024) — all prior keys kept verbatim; vendor + bank keys appended.",
);
const vendorLookup = `
  -- ---------------------- VENDOR AGGREGATE (0025) --------------------
  elsif p_key = 'vendor' then
    return query
      select v.id, v.code, v.name, v.mode
      from public.vendors v
      where v.tenant_id in (select app.user_tenant_ids())
        and v.deleted_at is null
        and v.status = 'ACTIVE'
        and (v.name ilike v_pat or v.code ilike v_pat)
      order by v.name, v.code, v.id
      limit v_limit;

  elsif p_key = 'bank' then
    return query
      select b.id, b.code, b.name, null::text
      from public.banks b
      where b.tenant_id in (select app.user_tenant_ids())
        and b.deleted_at is null
        and b.status = 'ACTIVE'
        and (b.name ilike v_pat or b.code ilike v_pat)
      order by b.name, b.code, b.id
      limit v_limit;
`;
lookupBlock = lookupBlock.replace("\n  else\n    raise exception", vendorLookup + "\n  else\n    raise exception");
lookupBlock = lookupBlock.replace(
  "service-center, field-executive, consignee, shipper, customer.",
  "service-center, field-executive, consignee, shipper, customer, vendor, bank.",
);

const saveVendor = readFileSync(new URL("./save_vendor_fn.sql", import.meta.url), "utf8");

const ddl = `-- ===========================================================================
-- 0025  vendor aggregate (Phase 3 — Party Masters, Milestone 11B)
-- ---------------------------------------------------------------------------
-- Vendor aggregate ROOT + Addresses / Contacts / Bank Accounts children.
-- Permission slug: mst.vendor-master (0010). Import + lookup EXTENDED.
-- wizard_extras jsonb holds rates-file metadata until Documents tab (11D).
-- ===========================================================================

-- ===========================================================================
-- vendors (aggregate ROOT)
-- ===========================================================================
create table if not exists public.vendors (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants(id) on delete cascade,
  code                    text not null,
  name                    text not null,
  contact_person          text,
  address1                text,
  address2                text,
  pin_code                text,
  city                    text,
  state_id                uuid,
  phone1                  text,
  phone2                  text,
  fax                     text,
  mobile                  text not null,
  email                   text,
  website                 text,
  gst_no                  text,
  mode                    text not null default 'COURIER'
                            check (mode in ('AIR','SURFACE','TRAIN','COURIER','EXPRESS')),
  vendor_class            text not null default 'VENDOR'
                            check (vendor_class in ('OBC','DELIVERY','VENDOR','AIRLINE')),
  fuel_head               text,
  currency                text not null default 'INR',
  origin_destination_id   uuid,
  vendor_zip              text,
  is_global               boolean not null default false,
  gst_applies             boolean not null default true,
  vol_weight_round_off    boolean not null default false,
  wizard_extras           jsonb not null default '{}'::jsonb,
  status                  text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  created_at              timestamptz not null default now(),
  created_by              uuid,
  updated_at              timestamptz not null default now(),
  updated_by              uuid,
  deleted_at              timestamptz,
  row_version             integer not null default 1,
  constraint vendors_tenant_id_uq unique (tenant_id, id),
  constraint vendors_state_fk foreign key (tenant_id, state_id)
    references public.states (tenant_id, id) on delete set null,
  constraint vendors_origin_destination_fk foreign key (tenant_id, origin_destination_id)
    references public.destinations (tenant_id, id) on delete set null
);
create unique index if not exists vendors_tenant_code_uq
  on public.vendors (tenant_id, code) where deleted_at is null;
create index if not exists vendors_tenant_idx on public.vendors (tenant_id);
create index if not exists vendors_tenant_status_idx on public.vendors (tenant_id, status);
create index if not exists vendors_name_trgm on public.vendors using gin (name gin_trgm_ops);
create index if not exists vendors_code_trgm on public.vendors using gin (code gin_trgm_ops);

-- ===========================================================================
-- vendor_addresses (1:N child)
-- ===========================================================================
create table if not exists public.vendor_addresses (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  vendor_id     uuid not null,
  seq           integer not null,
  address_type  text,
  name          text,
  address1      text,
  address2      text,
  address3      text,
  pin_code      text,
  city          text,
  state_id      uuid,
  country_id    uuid,
  phone         text,
  mobile        text,
  email         text,
  is_default    boolean not null default false,
  remark        text,
  constraint vendor_addresses_vendor_fk foreign key (tenant_id, vendor_id)
    references public.vendors (tenant_id, id) on delete cascade,
  constraint vendor_addresses_state_fk foreign key (tenant_id, state_id)
    references public.states (tenant_id, id) on delete set null,
  constraint vendor_addresses_country_fk foreign key (tenant_id, country_id)
    references public.countries (tenant_id, id) on delete set null,
  constraint vendor_addresses_uq unique (tenant_id, vendor_id, seq)
);
create index if not exists vendor_addresses_vendor_idx
  on public.vendor_addresses (tenant_id, vendor_id);

-- ===========================================================================
-- vendor_contacts (1:N child)
-- ===========================================================================
create table if not exists public.vendor_contacts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  vendor_id     uuid not null,
  seq           integer not null,
  contact_type  text,
  name          text,
  designation   text,
  email         text,
  mobile        text,
  landline      text,
  extension     text,
  is_primary    boolean not null default false,
  remark        text,
  constraint vendor_contacts_vendor_fk foreign key (tenant_id, vendor_id)
    references public.vendors (tenant_id, id) on delete cascade,
  constraint vendor_contacts_uq unique (tenant_id, vendor_id, seq)
);
create index if not exists vendor_contacts_vendor_idx
  on public.vendor_contacts (tenant_id, vendor_id);

-- ===========================================================================
-- vendor_bank_accounts (1:N child)
-- ===========================================================================
create table if not exists public.vendor_bank_accounts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  vendor_id     uuid not null,
  seq           integer not null,
  bank_id       uuid,
  account_name  text,
  account_no    text,
  ifsc          text,
  branch        text,
  is_default    boolean not null default false,
  remark        text,
  constraint vendor_bank_accounts_vendor_fk foreign key (tenant_id, vendor_id)
    references public.vendors (tenant_id, id) on delete cascade,
  constraint vendor_bank_accounts_bank_fk foreign key (tenant_id, bank_id)
    references public.banks (tenant_id, id) on delete set null,
  constraint vendor_bank_accounts_uq unique (tenant_id, vendor_id, seq)
);
create index if not exists vendor_bank_accounts_vendor_idx
  on public.vendor_bank_accounts (tenant_id, vendor_id);

-- Activate deferred pincodes.vendor_id FK (0015).
alter table public.pincodes drop constraint if exists pincodes_vendor_fk;
alter table public.pincodes add constraint pincodes_vendor_fk
  foreign key (tenant_id, vendor_id) references public.vendors (tenant_id, id) on delete set null;

select app.attach_master_triggers('vendors', 'mst.vendor-master');

do $$
declare r record;
begin
  for r in (select 'vendors' as tbl, 'mst.vendor-master' as slug)
  loop
    execute format('alter table public.%I enable row level security;', r.tbl);
    execute format('drop policy if exists %I on public.%I;', r.tbl || '_select', r.tbl);
    execute format($p$create policy %I on public.%I for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());$p$, r.tbl || '_select', r.tbl);
    execute format('drop policy if exists %I on public.%I;', r.tbl || '_insert', r.tbl);
    execute format($p$create policy %I on public.%I for insert with check (tenant_id in (select app.user_tenant_ids()) and app.user_has_permission(tenant_id, %L, 'add'));$p$, r.tbl || '_insert', r.tbl, r.slug);
    execute format('drop policy if exists %I on public.%I;', r.tbl || '_update', r.tbl);
    execute format($p$create policy %I on public.%I for update using (tenant_id in (select app.user_tenant_ids()) and app.user_has_permission(tenant_id, %L, 'modify')) with check (tenant_id in (select app.user_tenant_ids()) and app.user_has_permission(tenant_id, %L, 'modify'));$p$, r.tbl || '_update', r.tbl, r.slug, r.slug);
    execute format('drop policy if exists %I on public.%I;', r.tbl || '_delete', r.tbl);
    execute format($p$create policy %I on public.%I for delete using (tenant_id in (select app.user_tenant_ids()) and app.user_has_permission(tenant_id, %L, 'delete'));$p$, r.tbl || '_delete', r.tbl, r.slug);
  end loop;
end $$;

-- Child RLS (vendor-master gated; modify covers replace writes).
do $$
declare r record;
begin
  for r in (
    select * from (values
      ('vendor_addresses'),
      ('vendor_contacts'),
      ('vendor_bank_accounts')
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

${importBlock}

${lookupBlock}
`;

writeFileSync(new URL("../migrations/0025_vendor_aggregate.sql", import.meta.url), ddl);
console.log("Wrote supabase/migrations/0025_vendor_aggregate.sql");
