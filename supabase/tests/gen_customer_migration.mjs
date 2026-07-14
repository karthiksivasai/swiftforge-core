// Generates supabase/migrations/0023_customer_aggregate.sql by extending 0022.
// Run: node supabase/tests/gen_customer_migration.mjs
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync(new URL("../migrations/0022_party_masters_simple.sql", import.meta.url), "utf8");

const importStart = src.indexOf("-- EXTEND public.import_master (0016–0021)");
const importEnd = src.indexOf("grant execute on function public.import_master", importStart);
let importBlock = src.slice(importStart, importEnd);

importBlock = importBlock.replace(
  "-- EXTEND public.import_master (0016–0021) — all prior branches kept verbatim; party",
  "-- EXTEND public.import_master (0016–0022) — all prior branches kept verbatim; customer\n-- aggregate (0023) + party customer_id resolution appended.",
);
importBlock = importBlock.replace(
  `  v_sc       uuid;       -- service_center_id (field_executives)`,
  `  v_sc       uuid;       -- service_center_id (field_executives)\n  v_customer uuid;       -- customer_id (consignees/shippers/customers)`,
);
importBlock = importBlock.replace(
  `  v_map_service_centers jsonb := '{}'::jsonb;`,
  `  v_map_service_centers jsonb := '{}'::jsonb;\n  v_map_customers       jsonb := '{}'::jsonb;`,
);
importBlock = importBlock.replace(
  `    when 'shippers'            then 'mst.shipper-master'\n    else null end;`,
  `    when 'shippers'            then 'mst.shipper-master'\n    -- party aggregate (0023)\n    when 'customers'           then 'mst.customer-master'\n    else null end;`,
);
importBlock = importBlock.replace(
  `    when 'consignees', 'shippers' then\n      v_map_states := app.import_build_code_map(v_tenant, 'states',\n        app.import_distinct_codes(p_rows, array['state_code']));\n      v_map_countries := app.import_build_code_map(v_tenant, 'countries',\n        app.import_distinct_codes(p_rows, array['country_code']));`,
  `    when 'customers' then\n      v_map_service_centers := app.import_build_code_map(v_tenant, 'service_centers',\n        app.import_distinct_codes(p_rows, array['service_center_code']));\n    when 'consignees', 'shippers' then\n      v_map_states := app.import_build_code_map(v_tenant, 'states',\n        app.import_distinct_codes(p_rows, array['state_code']));\n      v_map_countries := app.import_build_code_map(v_tenant, 'countries',\n        app.import_distinct_codes(p_rows, array['country_code']));\n      v_map_customers := app.import_build_code_map(v_tenant, 'customers',\n        app.import_distinct_codes(p_rows, array['customer_code']));`,
);

const updatedConsigneeArm = `      when 'consignees' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        if coalesce(btrim(v_row->>'mobile'),'') = '' then v_col:='mobile'; raise exception using errcode='CMS01', message='Mobile is required'; end if;
        v_col := 'state_code'; v_state := app.import_lookup(v_map_states, v_row->>'state_code', 'State code');
        v_col := 'country_code'; v_country := app.import_lookup(v_map_countries, v_row->>'country_code', 'Country code');
        v_col := 'customer_code'; v_customer := app.import_lookup(v_map_customers, v_row->>'customer_code', 'Customer code');
        v_col := null;
        insert into public.consignees
          (tenant_id, code, name, customer_id, customer_name, mobile, email, address, pin_code, city,
           state_id, country_id, status)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'),
                v_customer,
                nullif(btrim(coalesce(v_row->>'customer_name', v_row->>'customer','')),''),
                btrim(v_row->>'mobile'),
                nullif(btrim(coalesce(v_row->>'email','')),''),
                nullif(btrim(coalesce(v_row->>'address','')),''),
                nullif(btrim(coalesce(v_row->>'pin_code', v_row->>'pincode','')),''),
                nullif(btrim(coalesce(v_row->>'city','')),''),
                v_state, v_country,
                app.norm_enum(v_row->>'status', array['ACTIVE','INACTIVE'], 'Status', 'ACTIVE'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      -- TODO(catalog-split): move to app.import_shippers(v_tenant, v_row, v_map_states, v_map_countries, v_map_customers).
      when 'shippers' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        if coalesce(btrim(v_row->>'mobile'),'') = '' then v_col:='mobile'; raise exception using errcode='CMS01', message='Mobile is required'; end if;
        v_col := 'state_code'; v_state := app.import_lookup(v_map_states, v_row->>'state_code', 'State code');
        v_col := 'country_code'; v_country := app.import_lookup(v_map_countries, v_row->>'country_code', 'Country code');
        v_col := 'customer_code'; v_customer := app.import_lookup(v_map_customers, v_row->>'customer_code', 'Customer code');
        v_col := null;
        insert into public.shippers
          (tenant_id, code, name, customer_id, customer_name, mobile, email, address, pin_code, city,
           state_id, country_id, status)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'),
                v_customer,
                nullif(btrim(coalesce(v_row->>'customer_name', v_row->>'customer','')),''),
                btrim(v_row->>'mobile'),
                nullif(btrim(coalesce(v_row->>'email','')),''),
                nullif(btrim(coalesce(v_row->>'address','')),''),
                nullif(btrim(coalesce(v_row->>'pin_code', v_row->>'pincode','')),''),
                nullif(btrim(coalesce(v_row->>'city','')),''),
                v_state, v_country,
                app.norm_enum(v_row->>'status', array['ACTIVE','INACTIVE'], 'Status', 'ACTIVE'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;`;

importBlock = importBlock.replace(
  /      when 'consignees' then[\s\S]*?on conflict \(tenant_id, code\) where deleted_at is null do nothing;\n\n      -- TODO\(catalog-split\): move to app\.import_shippers[\s\S]*?on conflict \(tenant_id, code\) where deleted_at is null do nothing;/,
  updatedConsigneeArm,
);

const customerImportArm = `
      -- ---------------------- CUSTOMER AGGREGATE (0023) --------------------
      -- TODO(catalog-split): move to app.import_customers(v_tenant, v_row, v_map_service_centers).
      when 'customers' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        if coalesce(btrim(v_row->>'mobile'),'') = '' then v_col:='mobile'; raise exception using errcode='CMS01', message='Mobile is required'; end if;
        v_col := 'service_center_code'; v_sc := app.import_lookup(v_map_service_centers, v_row->>'service_center_code', 'Service center code');
        v_col := null;
        insert into public.customers
          (tenant_id, code, name, branch, contact_person, phone, email, mobile, contract_head,
           service_center_id, status)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'),
                nullif(btrim(coalesce(v_row->>'branch','')),''),
                nullif(btrim(coalesce(v_row->>'contact_person', v_row->>'contact','')),''),
                nullif(btrim(coalesce(v_row->>'phone','')),''),
                nullif(btrim(coalesce(v_row->>'email','')),''),
                btrim(v_row->>'mobile'),
                nullif(btrim(coalesce(v_row->>'contract_head','')),''),
                v_sc,
                app.norm_enum(v_row->>'status', array['ACTIVE','INACTIVE'], 'Status', 'ACTIVE'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;`;

importBlock = importBlock.replace(
  `        on conflict (tenant_id, code) where deleted_at is null do nothing;\n\n      end case;`,
  `        on conflict (tenant_id, code) where deleted_at is null do nothing;${customerImportArm}\n      end case;`,
);
importBlock = importBlock.replace(
  `'Reusable master CSV import (geo + catalog + party incl. consignees/shippers):`,
  `'Reusable master CSV import (geo + catalog + party incl. customers/consignees/shippers):`,
);

const lookupStart = src.indexOf("-- EXTEND public.lookup (0017–0021)");
const lookupEnd = src.indexOf("grant execute on function public.lookup", lookupStart);
let lookupBlock = src.slice(lookupStart, lookupEnd);
lookupBlock = lookupBlock.replace(
  "-- EXTEND public.lookup (0017–0021) — all prior keys kept verbatim; party keys appended.",
  "-- EXTEND public.lookup (0017–0022) — all prior keys kept verbatim; customer key appended.",
);
const customerLookup = `
  -- ---------------------- CUSTOMER AGGREGATE (0023) --------------------
  elsif p_key = 'customer' then
    return query
      select c.id, c.code, c.name, c.branch
      from public.customers c
      where c.tenant_id in (select app.user_tenant_ids())
        and c.deleted_at is null
        and c.status = 'ACTIVE'
        and (c.name ilike v_pat or c.code ilike v_pat)
      order by c.name, c.code, c.id
      limit v_limit;
`;
lookupBlock = lookupBlock.replace("\n  else\n    raise exception", customerLookup + "\n  else\n    raise exception");
lookupBlock = lookupBlock.replace(
  "service-center, field-executive, consignee, shipper.",
  "service-center, field-executive, consignee, shipper, customer.",
);

const ddl = `-- ===========================================================================
-- 0023  customer aggregate (Phase 3 — Party Masters, Milestone 10B)
-- ---------------------------------------------------------------------------
-- Customer aggregate ROOT + Addresses child; links consignees/shippers/users.
-- Permission slug: mst.customer-master (0010). Import + lookup EXTENDED.
-- wizard_extras jsonb holds wizard tabs not yet normalized (fuel/KYC/etc.).
-- ===========================================================================

-- ===========================================================================
-- customers (aggregate ROOT)
-- ===========================================================================
create table if not exists public.customers (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  code                text not null,
  name                text not null,
  branch              text,
  contact_person      text,
  phone               text,
  email               text,
  mobile              text not null,
  contract_head       text,
  address1            text,
  address2            text,
  pin_code            text,
  city                text,
  state_id            uuid,
  billing_state_id    uuid,
  tel1                text,
  tel2                text,
  fax                 text,
  service_center_id   uuid,
  start_date          date,
  origin              text,
  gst_no              text,
  aadhar_no           text,
  dob_on_aadhar       date,
  passport_no         text,
  pan_no              text,
  tan_no              text,
  invoice_format      text,
  customer_type       text not null default 'CUSTOMER'
                        check (customer_type in ('CUSTOMER','VENDOR','AGENT')),
  register_type       text not null default 'B2B'
                        check (register_type in ('B2B','B2C')),
  payment_type        text,
  billing_cycle       text,
  credit_limit        numeric(14,2),
  credit_days         integer,
  registration_no     text,
  instructions        text,
  credit_alert_pct    numeric(7,4),
  closing_balance     numeric(14,2) not null default 0,
  unbilled_amount     numeric(14,2),
  ledger_head         text,
  contract_origin     text,
  business_channel    text,
  iec_no              text,
  bank_ad_code        text,
  bank_account        text,
  bank_ifsc           text,
  firm                text,
  lut_number          text,
  lut_issue_date      date,
  lut_till_date       date,
  shipper_type        text,
  nfei                boolean not null default false,
  fuel_surcharge      boolean not null default true,
  tax                 boolean not null default true,
  no_tariff           boolean not null default false,
  inclusive_tax       boolean not null default false,
  allow_login_with_otp boolean not null default false,
  wizard_extras       jsonb not null default '{}'::jsonb,
  status              text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  created_at          timestamptz not null default now(),
  created_by          uuid,
  updated_at          timestamptz not null default now(),
  updated_by          uuid,
  deleted_at          timestamptz,
  row_version         integer not null default 1,
  constraint customers_tenant_id_uq unique (tenant_id, id),
  constraint customers_state_fk foreign key (tenant_id, state_id)
    references public.states (tenant_id, id) on delete set null,
  constraint customers_billing_state_fk foreign key (tenant_id, billing_state_id)
    references public.states (tenant_id, id) on delete set null,
  constraint customers_service_center_fk foreign key (tenant_id, service_center_id)
    references public.service_centers (tenant_id, id) on delete set null
);
create unique index if not exists customers_tenant_code_uq
  on public.customers (tenant_id, code) where deleted_at is null;
create index if not exists customers_tenant_idx on public.customers (tenant_id);
create index if not exists customers_tenant_sc_idx on public.customers (tenant_id, service_center_id);
create index if not exists customers_name_trgm on public.customers using gin (name gin_trgm_ops);
create index if not exists customers_code_trgm on public.customers using gin (code gin_trgm_ops);

-- ===========================================================================
-- customer_addresses (1:N child — synced by save_customer)
-- ===========================================================================
create table if not exists public.customer_addresses (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  customer_id       uuid not null,
  seq               integer not null,
  contact_type      text,
  from_date         date,
  name              text,
  designation       text,
  email             text,
  mobile            text,
  landline          text,
  extension         text,
  address1          text,
  address2          text,
  address3          text,
  pin_code          text,
  city              text,
  state_id          uuid,
  country_id        uuid,
  remark            text,
  passport_no       text,
  aadhar_no         text,
  gst_no            text,
  pan_no            text,
  iec_no            text,
  ad_code           text,
  lut_no            text,
  is_default_shipper boolean not null default false,
  kyc_file_name     text,
  constraint customer_addresses_customer_fk foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete cascade,
  constraint customer_addresses_state_fk foreign key (tenant_id, state_id)
    references public.states (tenant_id, id) on delete set null,
  constraint customer_addresses_country_fk foreign key (tenant_id, country_id)
    references public.countries (tenant_id, id) on delete set null,
  constraint customer_addresses_uq unique (tenant_id, customer_id, seq)
);
create index if not exists customer_addresses_customer_idx
  on public.customer_addresses (tenant_id, customer_id);

-- Link party address books + portal users to customers (0023).
alter table public.consignees
  add column if not exists customer_id uuid;
alter table public.shippers
  add column if not exists customer_id uuid;

alter table public.consignees drop constraint if exists consignees_customer_fk;
alter table public.consignees add constraint consignees_customer_fk
  foreign key (tenant_id, customer_id) references public.customers (tenant_id, id) on delete set null;
alter table public.shippers drop constraint if exists shippers_customer_fk;
alter table public.shippers add constraint shippers_customer_fk
  foreign key (tenant_id, customer_id) references public.customers (tenant_id, id) on delete set null;

create index if not exists consignees_tenant_customer_idx on public.consignees (tenant_id, customer_id);
create index if not exists shippers_tenant_customer_idx on public.shippers (tenant_id, customer_id);

alter table public.users drop constraint if exists users_tenant_id_uq;
alter table public.users add constraint users_tenant_id_uq unique (tenant_id, id);
alter table public.users drop constraint if exists users_customer_fk;
alter table public.users add constraint users_customer_fk
  foreign key (tenant_id, customer_id) references public.customers (tenant_id, id) on delete set null;

select app.attach_master_triggers('customers', 'mst.customer-master');

do $$
declare r record;
begin
  for r in (select 'customers' as tbl, 'mst.customer-master' as slug)
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

alter table public.customer_addresses enable row level security;
drop policy if exists customer_addresses_select on public.customer_addresses;
create policy customer_addresses_select on public.customer_addresses
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());
drop policy if exists customer_addresses_insert on public.customer_addresses;
create policy customer_addresses_insert on public.customer_addresses
  for insert with check (tenant_id in (select app.user_tenant_ids()) and app.user_has_permission(tenant_id, 'mst.customer-master', 'add'));
drop policy if exists customer_addresses_delete on public.customer_addresses;
create policy customer_addresses_delete on public.customer_addresses
  for delete using (tenant_id in (select app.user_tenant_ids()) and app.user_has_permission(tenant_id, 'mst.customer-master', 'modify'));

-- ===========================================================================
-- public.save_customer — Aggregate Save Pattern (root + addresses child)
-- ===========================================================================
create or replace function public.save_customer(
  p_id          uuid,
  p_row_version integer,
  p_fields      jsonb,
  p_addresses   jsonb,
  p_wizard_extras jsonb default '{}'::jsonb
)
returns public.customers
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_c      public.customers;
  v_status text;
  v_ctype  text;
  v_rtype  text;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'p_fields must be a JSON object' using errcode = '22023';
  end if;
  if coalesce(btrim(p_fields->>'code'), '') = '' then
    raise exception 'Code is required' using errcode = '22023';
  end if;
  if coalesce(btrim(p_fields->>'name'), '') = '' then
    raise exception 'Name is required' using errcode = '22023';
  end if;
  if coalesce(btrim(p_fields->>'mobile'), '') = '' then
    raise exception 'Mobile is required' using errcode = '22023';
  end if;

  v_status := app.norm_enum(p_fields->>'status', array['ACTIVE','INACTIVE'], 'Status', 'ACTIVE');
  v_ctype := upper(replace(coalesce(nullif(btrim(p_fields->>'customer_type'), ''), 'CUSTOMER'), ' ', '_'));
  if v_ctype not in ('CUSTOMER','VENDOR','AGENT') then v_ctype := 'CUSTOMER'; end if;
  v_rtype := upper(coalesce(nullif(btrim(p_fields->>'register_type'), ''), 'B2B'));
  if v_rtype not in ('B2B','B2C') then v_rtype := 'B2B'; end if;

  if p_id is null then
    if not app.user_has_permission(v_tenant, 'mst.customer-master', 'add') then
      raise exception 'Permission denied: mst.customer-master add' using errcode = '42501';
    end if;
    insert into public.customers (
      tenant_id, code, name, branch, contact_person, phone, email, mobile, contract_head,
      address1, address2, pin_code, city, state_id, billing_state_id,
      tel1, tel2, fax, service_center_id, start_date, origin,
      gst_no, aadhar_no, dob_on_aadhar, passport_no, pan_no, tan_no, invoice_format,
      customer_type, register_type, payment_type, billing_cycle, credit_limit, credit_days,
      registration_no, instructions, credit_alert_pct, closing_balance, unbilled_amount,
      ledger_head, contract_origin, business_channel, iec_no, bank_ad_code, bank_account, bank_ifsc,
      firm, lut_number, lut_issue_date, lut_till_date, shipper_type,
      nfei, fuel_surcharge, tax, no_tariff, inclusive_tax, allow_login_with_otp,
      wizard_extras, status)
    values (
      v_tenant, btrim(p_fields->>'code'), btrim(p_fields->>'name'),
      nullif(btrim(coalesce(p_fields->>'branch','')),''),
      nullif(btrim(coalesce(p_fields->>'contact_person','')),''),
      nullif(btrim(coalesce(p_fields->>'phone','')),''),
      nullif(btrim(coalesce(p_fields->>'email','')),''),
      btrim(p_fields->>'mobile'),
      nullif(btrim(coalesce(p_fields->>'contract_head','')),''),
      nullif(btrim(coalesce(p_fields->>'address1','')),''),
      nullif(btrim(coalesce(p_fields->>'address2','')),''),
      nullif(btrim(coalesce(p_fields->>'pin_code','')),''),
      nullif(btrim(coalesce(p_fields->>'city','')),''),
      nullif(btrim(p_fields->>'state_id'),'')::uuid,
      nullif(btrim(p_fields->>'billing_state_id'),'')::uuid,
      nullif(btrim(coalesce(p_fields->>'tel1','')),''),
      nullif(btrim(coalesce(p_fields->>'tel2','')),''),
      nullif(btrim(coalesce(p_fields->>'fax','')),''),
      nullif(btrim(p_fields->>'service_center_id'),'')::uuid,
      nullif(btrim(p_fields->>'start_date'),'')::date,
      nullif(btrim(coalesce(p_fields->>'origin','')),''),
      nullif(btrim(coalesce(p_fields->>'gst_no','')),''),
      nullif(btrim(coalesce(p_fields->>'aadhar_no','')),''),
      nullif(btrim(p_fields->>'dob_on_aadhar'),'')::date,
      nullif(btrim(coalesce(p_fields->>'passport_no','')),''),
      nullif(btrim(coalesce(p_fields->>'pan_no','')),''),
      nullif(btrim(coalesce(p_fields->>'tan_no','')),''),
      nullif(btrim(coalesce(p_fields->>'invoice_format','')),''),
      v_ctype, v_rtype,
      nullif(btrim(coalesce(p_fields->>'payment_type','')),''),
      nullif(btrim(coalesce(p_fields->>'billing_cycle','')),''),
      nullif(btrim(p_fields->>'credit_limit'),'')::numeric,
      nullif(btrim(p_fields->>'credit_days'),'')::integer,
      nullif(btrim(coalesce(p_fields->>'registration_no','')),''),
      nullif(btrim(coalesce(p_fields->>'instructions','')),''),
      nullif(btrim(p_fields->>'credit_alert_pct'),'')::numeric,
      coalesce(nullif(btrim(p_fields->>'closing_balance'),'')::numeric, 0),
      nullif(btrim(p_fields->>'unbilled_amount'),'')::numeric,
      nullif(btrim(coalesce(p_fields->>'ledger_head','')),''),
      nullif(btrim(coalesce(p_fields->>'contract_origin','')),''),
      nullif(btrim(coalesce(p_fields->>'business_channel','')),''),
      nullif(btrim(coalesce(p_fields->>'iec_no','')),''),
      nullif(btrim(coalesce(p_fields->>'bank_ad_code','')),''),
      nullif(btrim(coalesce(p_fields->>'bank_account','')),''),
      nullif(btrim(coalesce(p_fields->>'bank_ifsc','')),''),
      nullif(btrim(coalesce(p_fields->>'firm','')),''),
      nullif(btrim(coalesce(p_fields->>'lut_number','')),''),
      nullif(btrim(p_fields->>'lut_issue_date'),'')::date,
      nullif(btrim(p_fields->>'lut_till_date'),'')::date,
      nullif(btrim(coalesce(p_fields->>'shipper_type','')),''),
      coalesce((p_fields->>'nfei')::boolean, false),
      coalesce((p_fields->>'fuel_surcharge')::boolean, true),
      coalesce((p_fields->>'tax')::boolean, true),
      coalesce((p_fields->>'no_tariff')::boolean, false),
      coalesce((p_fields->>'inclusive_tax')::boolean, false),
      coalesce((p_fields->>'allow_login_with_otp')::boolean, false),
      coalesce(p_wizard_extras, '{}'::jsonb),
      v_status)
    returning * into v_c;
  else
    if not app.user_has_permission(v_tenant, 'mst.customer-master', 'modify') then
      raise exception 'Permission denied: mst.customer-master modify' using errcode = '42501';
    end if;
    update public.customers set
      code = btrim(p_fields->>'code'),
      name = btrim(p_fields->>'name'),
      branch = nullif(btrim(coalesce(p_fields->>'branch','')),''),
      contact_person = nullif(btrim(coalesce(p_fields->>'contact_person','')),''),
      phone = nullif(btrim(coalesce(p_fields->>'phone','')),''),
      email = nullif(btrim(coalesce(p_fields->>'email','')),''),
      mobile = btrim(p_fields->>'mobile'),
      contract_head = nullif(btrim(coalesce(p_fields->>'contract_head','')),''),
      address1 = nullif(btrim(coalesce(p_fields->>'address1','')),''),
      address2 = nullif(btrim(coalesce(p_fields->>'address2','')),''),
      pin_code = nullif(btrim(coalesce(p_fields->>'pin_code','')),''),
      city = nullif(btrim(coalesce(p_fields->>'city','')),''),
      state_id = nullif(btrim(p_fields->>'state_id'),'')::uuid,
      billing_state_id = nullif(btrim(p_fields->>'billing_state_id'),'')::uuid,
      tel1 = nullif(btrim(coalesce(p_fields->>'tel1','')),''),
      tel2 = nullif(btrim(coalesce(p_fields->>'tel2','')),''),
      fax = nullif(btrim(coalesce(p_fields->>'fax','')),''),
      service_center_id = nullif(btrim(p_fields->>'service_center_id'),'')::uuid,
      start_date = nullif(btrim(p_fields->>'start_date'),'')::date,
      origin = nullif(btrim(coalesce(p_fields->>'origin','')),''),
      gst_no = nullif(btrim(coalesce(p_fields->>'gst_no','')),''),
      aadhar_no = nullif(btrim(coalesce(p_fields->>'aadhar_no','')),''),
      dob_on_aadhar = nullif(btrim(p_fields->>'dob_on_aadhar'),'')::date,
      passport_no = nullif(btrim(coalesce(p_fields->>'passport_no','')),''),
      pan_no = nullif(btrim(coalesce(p_fields->>'pan_no','')),''),
      tan_no = nullif(btrim(coalesce(p_fields->>'tan_no','')),''),
      invoice_format = nullif(btrim(coalesce(p_fields->>'invoice_format','')),''),
      customer_type = v_ctype,
      register_type = v_rtype,
      payment_type = nullif(btrim(coalesce(p_fields->>'payment_type','')),''),
      billing_cycle = nullif(btrim(coalesce(p_fields->>'billing_cycle','')),''),
      credit_limit = nullif(btrim(p_fields->>'credit_limit'),'')::numeric,
      credit_days = nullif(btrim(p_fields->>'credit_days'),'')::integer,
      registration_no = nullif(btrim(coalesce(p_fields->>'registration_no','')),''),
      instructions = nullif(btrim(coalesce(p_fields->>'instructions','')),''),
      credit_alert_pct = nullif(btrim(p_fields->>'credit_alert_pct'),'')::numeric,
      closing_balance = coalesce(nullif(btrim(p_fields->>'closing_balance'),'')::numeric, 0),
      unbilled_amount = nullif(btrim(p_fields->>'unbilled_amount'),'')::numeric,
      ledger_head = nullif(btrim(coalesce(p_fields->>'ledger_head','')),''),
      contract_origin = nullif(btrim(coalesce(p_fields->>'contract_origin','')),''),
      business_channel = nullif(btrim(coalesce(p_fields->>'business_channel','')),''),
      iec_no = nullif(btrim(coalesce(p_fields->>'iec_no','')),''),
      bank_ad_code = nullif(btrim(coalesce(p_fields->>'bank_ad_code','')),''),
      bank_account = nullif(btrim(coalesce(p_fields->>'bank_account','')),''),
      bank_ifsc = nullif(btrim(coalesce(p_fields->>'bank_ifsc','')),''),
      firm = nullif(btrim(coalesce(p_fields->>'firm','')),''),
      lut_number = nullif(btrim(coalesce(p_fields->>'lut_number','')),''),
      lut_issue_date = nullif(btrim(p_fields->>'lut_issue_date'),'')::date,
      lut_till_date = nullif(btrim(p_fields->>'lut_till_date'),'')::date,
      shipper_type = nullif(btrim(coalesce(p_fields->>'shipper_type','')),''),
      nfei = coalesce((p_fields->>'nfei')::boolean, false),
      fuel_surcharge = coalesce((p_fields->>'fuel_surcharge')::boolean, true),
      tax = coalesce((p_fields->>'tax')::boolean, true),
      no_tariff = coalesce((p_fields->>'no_tariff')::boolean, false),
      inclusive_tax = coalesce((p_fields->>'inclusive_tax')::boolean, false),
      allow_login_with_otp = coalesce((p_fields->>'allow_login_with_otp')::boolean, false),
      wizard_extras = coalesce(p_wizard_extras, wizard_extras),
      status = v_status
    where id = p_id and tenant_id = v_tenant and deleted_at is null and row_version = p_row_version
    returning * into v_c;
    if not found then
      raise exception 'This record was changed by someone else. Reload and try again.' using errcode = '40001';
    end if;
  end if;

  delete from public.customer_addresses where tenant_id = v_tenant and customer_id = v_c.id;
  if p_addresses is not null and jsonb_typeof(p_addresses) = 'array' then
    insert into public.customer_addresses (
      tenant_id, customer_id, seq, contact_type, from_date, name, designation,
      email, mobile, landline, extension, address1, address2, address3,
      pin_code, city, state_id, country_id, remark, passport_no, aadhar_no,
      gst_no, pan_no, iec_no, ad_code, lut_no, is_default_shipper, kyc_file_name)
    select v_tenant, v_c.id, t.ord,
      nullif(btrim(coalesce(t.row->>'contact_type','')),''),
      nullif(btrim(t.row->>'from_date'),'')::date,
      nullif(btrim(coalesce(t.row->>'name','')),''),
      nullif(btrim(coalesce(t.row->>'designation','')),''),
      nullif(btrim(coalesce(t.row->>'email','')),''),
      nullif(btrim(coalesce(t.row->>'mobile','')),''),
      nullif(btrim(coalesce(t.row->>'landline','')),''),
      nullif(btrim(coalesce(t.row->>'extension','')),''),
      nullif(btrim(coalesce(t.row->>'address1','')),''),
      nullif(btrim(coalesce(t.row->>'address2','')),''),
      nullif(btrim(coalesce(t.row->>'address3','')),''),
      nullif(btrim(coalesce(t.row->>'pin_code','')),''),
      nullif(btrim(coalesce(t.row->>'city','')),''),
      nullif(btrim(t.row->>'state_id'),'')::uuid,
      nullif(btrim(t.row->>'country_id'),'')::uuid,
      nullif(btrim(coalesce(t.row->>'remark','')),''),
      nullif(btrim(coalesce(t.row->>'passport_no','')),''),
      nullif(btrim(coalesce(t.row->>'aadhar_no','')),''),
      nullif(btrim(coalesce(t.row->>'gst_no','')),''),
      nullif(btrim(coalesce(t.row->>'pan_no','')),''),
      nullif(btrim(coalesce(t.row->>'iec_no','')),''),
      nullif(btrim(coalesce(t.row->>'ad_code','')),''),
      nullif(btrim(coalesce(t.row->>'lut_no','')),''),
      coalesce((t.row->>'is_default_shipper')::boolean, false),
      nullif(btrim(coalesce(t.row->>'kyc_file_name','')),'')
    from jsonb_array_elements(p_addresses) with ordinality as t(row, ord)
    where coalesce(btrim(coalesce(t.row->>'name', t.row->>'address1','')), '') <> '';
  end if;

  perform app.write_audit_log(
    v_tenant, 'customers',
    case when p_id is null then 'ADD' else 'MODIFY' end,
    v_c.id, 'mst.customer-master', null,
    jsonb_build_object('addresses', coalesce(p_addresses, '[]'::jsonb)));

  return v_c;
end $$;

comment on function public.save_customer(uuid, integer, jsonb, jsonb, jsonb) is
  'Aggregate Save Pattern: upsert customers root (optimistic-locked on update) and replace customer_addresses child collection in ONE transaction.';

grant execute on function public.save_customer(uuid, integer, jsonb, jsonb, jsonb) to authenticated, service_role;

`;

const out =
  ddl +
  "\n" +
  importBlock +
  "\n" +
  lookupBlock +
  "\ngrant execute on function public.lookup(text, text, integer) to authenticated, service_role;\n";

writeFileSync(new URL("../migrations/0023_customer_aggregate.sql", import.meta.url), out);
console.log(`Wrote ${out.length} chars to 0023_customer_aggregate.sql`);
