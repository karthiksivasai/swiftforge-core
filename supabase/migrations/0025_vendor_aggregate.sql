-- ===========================================================================
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

-- ===========================================================================
-- save_vendor — aggregate (addresses + contacts + bank accounts)
-- ===========================================================================
create or replace function public.save_vendor(
  p_id              uuid,
  p_row_version     integer,
  p_fields          jsonb,
  p_wizard_extras   jsonb default '{}'::jsonb,
  p_addresses       jsonb default '[]'::jsonb,
  p_contacts        jsonb default '[]'::jsonb,
  p_bank_accounts   jsonb default '[]'::jsonb
)
returns public.vendors
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_v      public.vendors;
  v_status text;
  v_mode   text;
  v_class  text;
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
  v_mode := upper(replace(coalesce(nullif(btrim(p_fields->>'mode'), ''), 'COURIER'), ' ', '_'));
  if v_mode not in ('AIR','SURFACE','TRAIN','COURIER','EXPRESS') then v_mode := 'COURIER'; end if;
  v_class := upper(replace(coalesce(nullif(btrim(p_fields->>'vendor_class'), ''), 'VENDOR'), ' ', '_'));
  if v_class not in ('OBC','DELIVERY','VENDOR','AIRLINE') then v_class := 'VENDOR'; end if;

  if p_id is null then
    if not app.user_has_permission(v_tenant, 'mst.vendor-master', 'add') then
      raise exception 'Permission denied: mst.vendor-master add' using errcode = '42501';
    end if;
    insert into public.vendors (
      tenant_id, code, name, contact_person, address1, address2, pin_code, city, state_id,
      phone1, phone2, fax, mobile, email, website, gst_no, mode, vendor_class, fuel_head,
      currency, origin_destination_id, vendor_zip, is_global, gst_applies, vol_weight_round_off,
      wizard_extras, status)
    values (
      v_tenant, btrim(p_fields->>'code'), btrim(p_fields->>'name'),
      nullif(btrim(coalesce(p_fields->>'contact_person','')),''),
      nullif(btrim(coalesce(p_fields->>'address1','')),''),
      nullif(btrim(coalesce(p_fields->>'address2','')),''),
      nullif(btrim(coalesce(p_fields->>'pin_code','')),''),
      nullif(btrim(coalesce(p_fields->>'city','')),''),
      nullif(btrim(p_fields->>'state_id'),'')::uuid,
      nullif(btrim(coalesce(p_fields->>'phone1','')),''),
      nullif(btrim(coalesce(p_fields->>'phone2','')),''),
      nullif(btrim(coalesce(p_fields->>'fax','')),''),
      btrim(p_fields->>'mobile'),
      nullif(btrim(coalesce(p_fields->>'email','')),''),
      nullif(btrim(coalesce(p_fields->>'website','')),''),
      nullif(btrim(coalesce(p_fields->>'gst_no','')),''),
      v_mode, v_class,
      nullif(btrim(coalesce(p_fields->>'fuel_head','')),''),
      coalesce(nullif(btrim(p_fields->>'currency'), ''), 'INR'),
      nullif(btrim(p_fields->>'origin_destination_id'),'')::uuid,
      nullif(btrim(coalesce(p_fields->>'vendor_zip','')),''),
      coalesce((p_fields->>'is_global')::boolean, false),
      coalesce((p_fields->>'gst_applies')::boolean, true),
      coalesce((p_fields->>'vol_weight_round_off')::boolean, false),
      coalesce(p_wizard_extras, '{}'::jsonb),
      v_status)
    returning * into v_v;
  else
    if not app.user_has_permission(v_tenant, 'mst.vendor-master', 'modify') then
      raise exception 'Permission denied: mst.vendor-master modify' using errcode = '42501';
    end if;
    update public.vendors set
      code = btrim(p_fields->>'code'),
      name = btrim(p_fields->>'name'),
      contact_person = nullif(btrim(coalesce(p_fields->>'contact_person','')),''),
      address1 = nullif(btrim(coalesce(p_fields->>'address1','')),''),
      address2 = nullif(btrim(coalesce(p_fields->>'address2','')),''),
      pin_code = nullif(btrim(coalesce(p_fields->>'pin_code','')),''),
      city = nullif(btrim(coalesce(p_fields->>'city','')),''),
      state_id = nullif(btrim(p_fields->>'state_id'),'')::uuid,
      phone1 = nullif(btrim(coalesce(p_fields->>'phone1','')),''),
      phone2 = nullif(btrim(coalesce(p_fields->>'phone2','')),''),
      fax = nullif(btrim(coalesce(p_fields->>'fax','')),''),
      mobile = btrim(p_fields->>'mobile'),
      email = nullif(btrim(coalesce(p_fields->>'email','')),''),
      website = nullif(btrim(coalesce(p_fields->>'website','')),''),
      gst_no = nullif(btrim(coalesce(p_fields->>'gst_no','')),''),
      mode = v_mode,
      vendor_class = v_class,
      fuel_head = nullif(btrim(coalesce(p_fields->>'fuel_head','')),''),
      currency = coalesce(nullif(btrim(p_fields->>'currency'), ''), 'INR'),
      origin_destination_id = nullif(btrim(p_fields->>'origin_destination_id'),'')::uuid,
      vendor_zip = nullif(btrim(coalesce(p_fields->>'vendor_zip','')),''),
      is_global = coalesce((p_fields->>'is_global')::boolean, false),
      gst_applies = coalesce((p_fields->>'gst_applies')::boolean, true),
      vol_weight_round_off = coalesce((p_fields->>'vol_weight_round_off')::boolean, false),
      wizard_extras = coalesce(p_wizard_extras, wizard_extras),
      status = v_status
    where id = p_id and tenant_id = v_tenant and deleted_at is null and row_version = p_row_version
    returning * into v_v;
    if not found then
      raise exception 'This record was changed by someone else. Reload and try again.' using errcode = '40001';
    end if;
  end if;

  -- addresses
  delete from public.vendor_addresses where tenant_id = v_tenant and vendor_id = v_v.id;
  if p_addresses is not null and jsonb_typeof(p_addresses) = 'array' then
    insert into public.vendor_addresses (
      tenant_id, vendor_id, seq, address_type, name, address1, address2, address3,
      pin_code, city, state_id, country_id, phone, mobile, email, is_default, remark)
    select v_tenant, v_v.id, t.ord,
      nullif(btrim(coalesce(t.row->>'address_type', t.row->>'addressType','')),''),
      nullif(btrim(coalesce(t.row->>'name','')),''),
      nullif(btrim(coalesce(t.row->>'address1','')),''),
      nullif(btrim(coalesce(t.row->>'address2','')),''),
      nullif(btrim(coalesce(t.row->>'address3','')),''),
      nullif(btrim(coalesce(t.row->>'pin_code', t.row->>'pinCode','')),''),
      nullif(btrim(coalesce(t.row->>'city','')),''),
      nullif(btrim(t.row->>'state_id'),'')::uuid,
      nullif(btrim(t.row->>'country_id'),'')::uuid,
      nullif(btrim(coalesce(t.row->>'phone','')),''),
      nullif(btrim(coalesce(t.row->>'mobile','')),''),
      nullif(btrim(coalesce(t.row->>'email','')),''),
      coalesce((t.row->>'is_default')::boolean, coalesce((t.row->>'isDefault')::boolean, false)),
      nullif(btrim(coalesce(t.row->>'remark','')),'')
    from jsonb_array_elements(p_addresses) with ordinality as t(row, ord)
    where coalesce(btrim(coalesce(t.row->>'name', t.row->>'address1','')), '') <> '';
  end if;

  -- contacts
  delete from public.vendor_contacts where tenant_id = v_tenant and vendor_id = v_v.id;
  if p_contacts is not null and jsonb_typeof(p_contacts) = 'array' then
    insert into public.vendor_contacts (
      tenant_id, vendor_id, seq, contact_type, name, designation,
      email, mobile, landline, extension, is_primary, remark)
    select v_tenant, v_v.id, t.ord,
      nullif(btrim(coalesce(t.row->>'contact_type', t.row->>'contactType','')),''),
      nullif(btrim(coalesce(t.row->>'name','')),''),
      nullif(btrim(coalesce(t.row->>'designation','')),''),
      nullif(btrim(coalesce(t.row->>'email','')),''),
      nullif(btrim(coalesce(t.row->>'mobile','')),''),
      nullif(btrim(coalesce(t.row->>'landline','')),''),
      nullif(btrim(coalesce(t.row->>'extension','')),''),
      coalesce((t.row->>'is_primary')::boolean, coalesce((t.row->>'isPrimary')::boolean, false)),
      nullif(btrim(coalesce(t.row->>'remark','')),'')
    from jsonb_array_elements(p_contacts) with ordinality as t(row, ord)
    where coalesce(btrim(coalesce(t.row->>'name','')), '') <> '';
  end if;

  -- bank accounts
  delete from public.vendor_bank_accounts where tenant_id = v_tenant and vendor_id = v_v.id;
  if p_bank_accounts is not null and jsonb_typeof(p_bank_accounts) = 'array' then
    insert into public.vendor_bank_accounts (
      tenant_id, vendor_id, seq, bank_id, account_name, account_no, ifsc, branch, is_default, remark)
    select v_tenant, v_v.id, t.ord,
      nullif(btrim(t.row->>'bank_id'),'')::uuid,
      nullif(btrim(coalesce(t.row->>'account_name', t.row->>'accountName','')),''),
      nullif(btrim(coalesce(t.row->>'account_no', t.row->>'accountNo','')),''),
      nullif(btrim(coalesce(t.row->>'ifsc','')),''),
      nullif(btrim(coalesce(t.row->>'branch','')),''),
      coalesce((t.row->>'is_default')::boolean, coalesce((t.row->>'isDefault')::boolean, false)),
      nullif(btrim(coalesce(t.row->>'remark','')),'')
    from jsonb_array_elements(p_bank_accounts) with ordinality as t(row, ord)
    where coalesce(btrim(coalesce(t.row->>'account_no', t.row->>'accountNo','')), '') <> '';
  end if;

  perform app.write_audit_log(
    v_tenant, 'vendors',
    case when p_id is null then 'ADD' else 'MODIFY' end,
    v_v.id, 'mst.vendor-master', null,
    jsonb_build_object(
      'addresses', coalesce(p_addresses, '[]'::jsonb),
      'contacts', coalesce(p_contacts, '[]'::jsonb),
      'bank_accounts', coalesce(p_bank_accounts, '[]'::jsonb)));

  return v_v;
end $$;

comment on function public.save_vendor(uuid, integer, jsonb, jsonb, jsonb, jsonb, jsonb) is
  'Aggregate Save: vendors root + addresses/contacts/bank child collections (replace semantics). wizard_extras holds rates metadata only.';

grant execute on function public.save_vendor(uuid, integer, jsonb, jsonb, jsonb, jsonb, jsonb)
  to authenticated, service_role;


-- EXTEND public.import_master (0016–0024) — all prior branches kept verbatim; vendor
-- aggregate (0025) appended; customer
-- aggregate (0023) + party customer_id resolution appended.
-- branches (consignees, shippers) appended. — geo + simple/complex catalog
-- branches kept verbatim; aggregate branches (service_centers,
-- field_executives) appended. Per-master arms are self-contained. Public
-- signature is UNCHANGED.
--
-- TODO(catalog-split): once the catalog slice is complete, split the per-master
-- CASE arms into helper functions — app.import_countries(), app.import_products(),
-- app.import_charges(), app.import_service_centers(), app.import_field_executives(),
-- … — and reduce this function to a thin dispatcher. The public signature
-- import_master(text,text,jsonb) must not change; only the internals move.
-- ===========================================================================
create or replace function public.import_master(p_master text, p_mode text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant   uuid;
  v_slug     text;
  v_mode     text := upper(coalesce(p_mode, 'VALIDATE'));
  v_job      uuid;
  v_total    int := 0;
  v_ok       int := 0;     -- inserted (COMMIT) / would-insert (VALIDATE)
  v_skipped  int := 0;     -- duplicate natural key (ON CONFLICT DO NOTHING)
  v_errcnt   int := 0;
  v_errors   jsonb := '[]'::jsonb;
  v_row      jsonb;
  v_idx      int := 0;
  v_rc       int;
  v_col      text;
  v_msg      text;
  v_country  uuid; v_state uuid; v_zone uuid; v_dest uuid;
  v_branch   uuid; v_mbranch uuid; v_manbranch uuid;
  v_ptype    uuid;       -- product_type_id (catalog)
  v_prod     uuid;       -- product_id (airlines)
  v_exc      text;       -- normalized delivery_exception type
  v_sc       uuid;       -- service_center_id (field_executives)
  v_customer uuid;       -- customer_id (consignees/shippers/customers)
  -- Preloaded referenced-master maps (code -> id), built once before the loop.
  v_map_countries       jsonb := '{}'::jsonb;
  v_map_zones           jsonb := '{}'::jsonb;
  v_map_states          jsonb := '{}'::jsonb;
  v_map_destinations    jsonb := '{}'::jsonb;
  v_map_branches        jsonb := '{}'::jsonb;
  v_map_product_types   jsonb := '{}'::jsonb;
  v_map_products        jsonb := '{}'::jsonb;
  v_map_service_centers jsonb := '{}'::jsonb;
  v_map_customers       jsonb := '{}'::jsonb;
begin
  -- ---- master -> permission slug (also validates supported master) --------
  v_slug := case p_master
    -- geo (0015/0016)
    when 'countries'           then 'mst.country-master'
    when 'zones'               then 'mst.zone-master'
    when 'states'              then 'mst.state-master'
    when 'destinations'        then 'mst.destination-master'
    when 'pincodes'            then 'mst.pincode-master'
    when 'country_pincodes'    then 'mst.country-pincodes'
    when 'areas'               then 'mst.area-master'
    -- catalog simple (0018)
    when 'product_types'       then 'mst.product-type'
    when 'products'            then 'mst.product-master'
    when 'banks'               then 'mst.bank-master'
    when 'industries'          then 'mst.industry-master'
    when 'contents'            then 'mst.content-master'
    when 'instructions'        then 'mst.instruction-master'
    when 'sales_executives'    then 'mst.sales-executive-master'
    when 'flights'             then 'mst.flight-no-master'
    when 'delivery_exceptions' then 'mst.delivery-exception-master'
    -- catalog complex (0019)
    when 'charges'             then 'mst.charge-master'
    when 'airlines'            then 'mst.airlines'
    -- catalog aggregate (0020)
    when 'service_centers'     then 'mst.service-center-master'
    when 'field_executives'    then 'mst.field-executive-master'
    -- party simple (0022)
    when 'consignees'          then 'mst.consignee-master'
    when 'shippers'            then 'mst.shipper-master'
    -- party aggregate (0023)
    when 'customers'           then 'mst.customer-master'
    -- party aggregate (0025)
    when 'vendors'             then 'mst.vendor-master'
    else null end;
  if v_slug is null then
    raise exception 'Unsupported master: %', p_master using errcode = '22023';
  end if;
  if v_mode not in ('VALIDATE','COMMIT') then
    raise exception 'Unsupported mode: % (expected VALIDATE or COMMIT)', p_mode using errcode = '22023';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'Too many rows (max 5000 per call); chunk the import' using errcode = '54000';
  end if;

  -- ---- tenant context (resolved from the authenticated user only) ---------
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  -- ---- permission: import requires ADD on the master ----------------------
  if not app.user_has_permission(v_tenant, v_slug, 'add') then
    raise exception 'Permission denied: % add', v_slug using errcode = '42501';
  end if;

  -- ---- COMMIT: open the job + suppress per-row audit (summary instead) -----
  if v_mode = 'COMMIT' then
    insert into public.import_jobs
      (tenant_id, import_type, master, mode, status, total_rows, requested_by)
    values
      (v_tenant, 'MASTER_CSV', p_master, 'COMMIT', 'RUNNING', jsonb_array_length(p_rows), auth.uid())
    returning id into v_job;
    perform set_config('app.suppress_row_audit', 'on', true);
  end if;

  -- ---- preload referenced masters ONCE (set-based; no per-row queries) ----
  case p_master
    when 'states' then
      v_map_zones := app.import_build_code_map(v_tenant, 'zones',
        app.import_distinct_codes(p_rows, array['zone_code']));
    when 'destinations' then
      v_map_countries := app.import_build_code_map(v_tenant, 'countries',
        app.import_distinct_codes(p_rows, array['country_code']));
      v_map_states := app.import_build_code_map(v_tenant, 'states',
        app.import_distinct_codes(p_rows, array['state_code']));
      v_map_zones := app.import_build_code_map(v_tenant, 'zones',
        app.import_distinct_codes(p_rows, array['zone_code']));
      v_map_branches := app.import_build_code_map(v_tenant, 'branches',
        app.import_distinct_codes(p_rows, array['main_branch_code','manifest_branch_code']));
    when 'pincodes' then
      v_map_branches := app.import_build_code_map(v_tenant, 'branches',
        app.import_distinct_codes(p_rows, array['branch_code']));
      v_map_destinations := app.import_build_code_map(v_tenant, 'destinations',
        app.import_distinct_codes(p_rows, array['destination_code']));
      v_map_zones := app.import_build_code_map(v_tenant, 'zones',
        app.import_distinct_codes(p_rows, array['zone_code']));
      v_map_states := app.import_build_code_map(v_tenant, 'states',
        app.import_distinct_codes(p_rows, array['state_code']));
    when 'country_pincodes' then
      v_map_countries := app.import_build_code_map(v_tenant, 'countries',
        app.import_distinct_codes(p_rows, array['country_code']));
    when 'areas' then
      v_map_branches := app.import_build_code_map(v_tenant, 'branches',
        app.import_distinct_codes(p_rows, array['branch_code']));
      v_map_destinations := app.import_build_code_map(v_tenant, 'destinations',
        app.import_distinct_codes(p_rows, array['destination_code']));
    when 'products' then
      v_map_product_types := app.import_build_code_map(v_tenant, 'product_types',
        app.import_distinct_codes(p_rows, array['product_type_code']));
    when 'airlines' then
      v_map_products := app.import_build_code_map(v_tenant, 'products',
        app.import_distinct_codes(p_rows, array['product_code']));
    when 'field_executives' then
      v_map_service_centers := app.import_build_code_map(v_tenant, 'service_centers',
        app.import_distinct_codes(p_rows, array['service_center_code']));
      v_map_destinations := app.import_build_code_map(v_tenant, 'destinations',
        app.import_distinct_codes(p_rows, array['destination_code']));
    when 'customers' then
      v_map_service_centers := app.import_build_code_map(v_tenant, 'service_centers',
        app.import_distinct_codes(p_rows, array['service_center_code']));
    when 'vendors' then
      v_map_states := app.import_build_code_map(v_tenant, 'states',
        app.import_distinct_codes(p_rows, array['state_code']));
      v_map_destinations := app.import_build_code_map(v_tenant, 'destinations',
        app.import_distinct_codes(p_rows, array['origin_destination_code','destination_code']));
    when 'consignees', 'shippers' then
      v_map_states := app.import_build_code_map(v_tenant, 'states',
        app.import_distinct_codes(p_rows, array['state_code']));
      v_map_countries := app.import_build_code_map(v_tenant, 'countries',
        app.import_distinct_codes(p_rows, array['country_code']));
      v_map_customers := app.import_build_code_map(v_tenant, 'customers',
        app.import_distinct_codes(p_rows, array['customer_code']));
    else
      null;  -- countries / zones / flat catalogs / charges / service_centers have no FK references
  end case;

  -- ---- per-row processing --------------------------------------------------
  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_idx := v_idx + 1;
    v_total := v_total + 1;
    v_col := null; v_msg := null;
    v_country := null; v_state := null; v_zone := null; v_dest := null;
    v_branch := null; v_mbranch := null; v_manbranch := null;
    v_ptype := null; v_prod := null; v_exc := null; v_sc := null;

    begin
      -- ============ per-master validate + FK resolve + insert =============
      case p_master

      -- ------------------------------- GEO -------------------------------
      when 'countries' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        insert into public.countries (tenant_id, code, name, weight_unit, currency, isd_code)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'),
                app.norm_enum(v_row->>'weight_unit', array['KGS','LBS'], 'Weight unit', null),
                nullif(btrim(coalesce(v_row->>'currency','')),''),
                nullif(btrim(coalesce(v_row->>'isd_code','')),''))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      when 'zones' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        insert into public.zones (tenant_id, code, name)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      when 'states' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        v_col := 'zone_code'; v_zone := app.import_lookup(v_map_zones, v_row->>'zone_code', 'Zone code'); v_col := null;
        insert into public.states (tenant_id, code, name, zone_id, gst_alias, is_union_territory)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'), v_zone,
                nullif(btrim(coalesce(v_row->>'gst_alias','')),''),
                app.norm_bool(v_row->>'is_union_territory', false))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      when 'destinations' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        v_col := 'country_code';         v_country   := app.import_lookup(v_map_countries, v_row->>'country_code', 'Country code');
        v_col := 'state_code';           v_state     := app.import_lookup(v_map_states, v_row->>'state_code', 'State code');
        v_col := 'zone_code';            v_zone      := app.import_lookup(v_map_zones, v_row->>'zone_code', 'Zone code');
        v_col := 'main_branch_code';     v_mbranch   := app.import_lookup(v_map_branches, v_row->>'main_branch_code', 'Main branch code');
        v_col := 'manifest_branch_code'; v_manbranch := app.import_lookup(v_map_branches, v_row->>'manifest_branch_code', 'Manifest branch code');
        v_col := null;
        insert into public.destinations
          (tenant_id, dest_type, code, name, country_id, state_id, service_type, zone_id,
           main_branch_id, manifest_branch_id, email, mobile, status)
        values (v_tenant,
                app.norm_enum(v_row->>'dest_type', array['DOMESTIC','INTERNATIONAL','LOCAL'], 'Destination type', 'DOMESTIC'),
                btrim(v_row->>'code'), btrim(v_row->>'name'), v_country, v_state,
                app.norm_enum(v_row->>'service_type', array['REGULAR','METRO','REMOTE'], 'Service type', null),
                v_zone, v_mbranch, v_manbranch,
                nullif(btrim(coalesce(v_row->>'email','')),''),
                nullif(btrim(coalesce(v_row->>'mobile','')),''),
                app.norm_enum(v_row->>'status', array['ACTIVE','INACTIVE'], 'Status', 'ACTIVE'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      when 'pincodes' then
        if coalesce(btrim(v_row->>'pin_code'),'') = '' then v_col:='pin_code'; raise exception using errcode='CMS01', message='Pin code is required'; end if;
        v_col := 'branch_code';      v_branch := app.import_lookup(v_map_branches, v_row->>'branch_code', 'Branch code');
        v_col := 'destination_code'; v_dest   := app.import_lookup(v_map_destinations, v_row->>'destination_code', 'Destination code');
        v_col := 'zone_code';        v_zone   := app.import_lookup(v_map_zones, v_row->>'zone_code', 'Zone code');
        v_col := 'state_code';       v_state  := app.import_lookup(v_map_states, v_row->>'state_code', 'State code');
        v_col := null;
        insert into public.pincodes
          (tenant_id, pin_code, pin_name, branch_id, destination_id, zone_id, state_id,
           is_oda, is_serviceable, pickup_available, distance_km)
        values (v_tenant, btrim(v_row->>'pin_code'),
                nullif(btrim(coalesce(v_row->>'pin_name','')),''),
                v_branch, v_dest, v_zone, v_state,
                app.norm_bool(v_row->>'is_oda', false),
                app.norm_bool(v_row->>'is_serviceable', true),
                app.norm_bool(v_row->>'pickup_available', false),
                app.norm_numeric(v_row->>'distance_km'))
        on conflict (tenant_id, pin_code) where deleted_at is null do nothing;

      when 'country_pincodes' then
        v_col := 'country_code';
        v_country := app.import_lookup(v_map_countries, v_row->>'country_code', 'Country code');
        if v_country is null then raise exception using errcode='CMS01', message='Country code is required'; end if;
        v_col := 'pin_code';
        if coalesce(btrim(v_row->>'pin_code'),'') = '' then raise exception using errcode='CMS01', message='Pin code is required'; end if;
        v_col := null;
        insert into public.country_pincodes (tenant_id, country_id, pin_code, city_name, state_name)
        values (v_tenant, v_country, btrim(v_row->>'pin_code'),
                btrim(coalesce(v_row->>'city_name','')),
                nullif(btrim(coalesce(v_row->>'state_name','')),''))
        on conflict (tenant_id, country_id, pin_code, city_name) where deleted_at is null do nothing;

      when 'areas' then
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        v_col := 'branch_code';
        v_branch := app.import_lookup(v_map_branches, v_row->>'branch_code', 'Branch code');
        if v_branch is null then raise exception using errcode='CMS01', message='Branch code is required'; end if;
        v_col := 'destination_code'; v_dest := app.import_lookup(v_map_destinations, v_row->>'destination_code', 'Destination code'); v_col := null;
        insert into public.areas (tenant_id, branch_id, name, destination_id)
        values (v_tenant, v_branch, upper(btrim(v_row->>'name')), v_dest)
        on conflict (tenant_id, branch_id, name) where deleted_at is null do nothing;

      -- --------------------------- CATALOG (0018) ------------------------
      when 'product_types' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        insert into public.product_types (tenant_id, code, name)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      when 'products' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        v_col := 'product_type_code';
        v_ptype := app.import_lookup(v_map_product_types, v_row->>'product_type_code', 'Product type code');
        v_col := null;
        insert into public.products
          (tenant_id, code, name, product_type_id, service, fuel_charge, gst_reverse,
           shipment_type, status, group_type)
        values (v_tenant, btrim(v_row->>'code'),
                nullif(btrim(coalesce(v_row->>'name','')),''),
                v_ptype,
                nullif(btrim(coalesce(v_row->>'service','')),''),
                app.norm_bool(v_row->>'fuel_charge', false),
                app.norm_bool(v_row->>'gst_reverse', false),
                app.norm_enum(v_row->>'shipment_type', array['DOX','NDOX'], 'Shipment type', 'DOX'),
                app.norm_enum(v_row->>'status', array['ACTIVE','INACTIVE'], 'Status', 'ACTIVE'),
                app.norm_enum(v_row->>'group_type', array['AIR','SURFACE','TRAIN','ALL'], 'Group type', null))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      when 'banks' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        insert into public.banks (tenant_id, code, name, status)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'),
                app.norm_enum(v_row->>'status', array['ACTIVE','INACTIVE'], 'Status', 'ACTIVE'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      when 'industries' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        insert into public.industries (tenant_id, code, name)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      when 'contents' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        insert into public.contents (tenant_id, code, name)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      when 'instructions' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        insert into public.instructions (tenant_id, code, name)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      when 'sales_executives' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        v_col := 'commission';
        insert into public.sales_executives (tenant_id, code, name, commission)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'),
                coalesce(app.norm_numeric(v_row->>'commission'), 0));
        v_col := null;

      when 'flights' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        insert into public.flights (tenant_id, code, name, flight_type)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'),
                app.norm_enum(v_row->>'flight_type', array['PRIME','GCR'], 'Flight type', 'PRIME'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      when 'delivery_exceptions' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        v_exc := case upper(replace(btrim(coalesce(v_row->>'exc_type','')), '-', ''))
                   when 'DELIVERED' then 'DELIVERED' else 'UNDELIVERED' end;
        insert into public.delivery_exceptions (tenant_id, code, name, exc_type, inscan, show_on_mobile)
        values (v_tenant, upper(btrim(v_row->>'code')), btrim(v_row->>'name'), v_exc,
                app.norm_bool(v_row->>'inscan', false),
                app.norm_bool(v_row->>'show_on_mobile', false))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      -- --------------------------- CATALOG (0019) ------------------------
      -- TODO(catalog-split): move to app.import_charges(v_tenant, v_row).
      when 'charges' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        insert into public.charges
          (tenant_id, code, name, base_on, charge_type, charge_rate,
           apply_fuel, apply_tax_on_fuel, apply_tax, hsn_code, sequence)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'),
                coalesce(nullif(btrim(coalesce(v_row->>'base_on','')),''), 'Actual Weight'),
                app.norm_enum(v_row->>'charge_type',
                  array['AIRWAYBILL','EXPENSE','INCOME','OBC','PURCHASE'], 'Charge type', 'AIRWAYBILL'),
                coalesce(app.norm_numeric(v_row->>'charge_rate'), 0),
                app.norm_bool(v_row->>'apply_fuel', false),
                app.norm_bool(v_row->>'apply_tax_on_fuel', false),
                app.norm_bool(v_row->>'apply_tax', false),
                nullif(btrim(coalesce(v_row->>'hsn_code','')),''),
                coalesce(app.norm_numeric(v_row->>'sequence'), 0)::int)
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      -- TODO(catalog-split): move to app.import_airlines(v_tenant, v_row, v_map_products).
      when 'airlines' then
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        v_col := 'product_code';
        v_prod := app.import_lookup(v_map_products, v_row->>'product_code', 'Product code');
        if v_prod is null then raise exception using errcode='CMS01', message='Product code is required'; end if;
        v_col := null;
        insert into public.airlines (tenant_id, name, product_id)
        values (v_tenant, upper(btrim(v_row->>'name')), v_prod)
        on conflict (tenant_id, name) where deleted_at is null do nothing;

      -- --------------------------- CATALOG (0020) ------------------------
      -- TODO(catalog-split): move to app.import_service_centers(v_tenant, v_row).
      -- Aggregate ROOT only — Terms (the child collection) are managed through
      -- public.save_service_center, not bulk import (like charge dependencies).
      when 'service_centers' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        insert into public.service_centers
          (tenant_id, code, name, sub_name, branch, destination, state, state_code,
           pin_code, telephone, email, gst_no)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'),
                nullif(btrim(coalesce(v_row->>'sub_name','')),''),
                nullif(btrim(coalesce(v_row->>'branch','')),''),
                nullif(btrim(coalesce(v_row->>'destination','')),''),
                nullif(btrim(coalesce(v_row->>'state','')),''),
                nullif(btrim(coalesce(v_row->>'state_code','')),''),
                nullif(btrim(coalesce(v_row->>'pin_code','')),''),
                nullif(btrim(coalesce(v_row->>'telephone','')),''),
                nullif(btrim(coalesce(v_row->>'email','')),''),
                nullif(btrim(coalesce(v_row->>'gst_no','')),''))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      -- TODO(catalog-split): move to app.import_field_executives(v_tenant, v_row, v_map_service_centers, v_map_destinations).
      when 'field_executives' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        v_col := 'service_center_code';
        v_sc := app.import_lookup(v_map_service_centers, v_row->>'service_center_code', 'Service center code');
        if v_sc is null then raise exception using errcode='CMS01', message='Service center code is required'; end if;
        v_col := 'destination_code';
        v_dest := app.import_lookup(v_map_destinations, v_row->>'destination_code', 'Destination code');
        v_col := null;
        insert into public.field_executives
          (tenant_id, code, name, mobile, pickup_charge, delivery_charge,
           service_center_id, destination_id, tld_batch_no, in_active)
        values (v_tenant, upper(btrim(v_row->>'code')), btrim(v_row->>'name'),
                nullif(btrim(coalesce(v_row->>'mobile','')),''),
                coalesce(app.norm_numeric(v_row->>'pickup_charge'), 0),
                coalesce(app.norm_numeric(v_row->>'delivery_charge'), 0),
                v_sc, v_dest,
                nullif(btrim(coalesce(v_row->>'tld_batch_no','')),''),
                app.norm_bool(v_row->>'in_active', false))
        on conflict (tenant_id, code) where deleted_at is null do nothing;
      -- --------------------------- PARTY (0022) ------------------------
      -- TODO(catalog-split): move to app.import_consignees(v_tenant, v_row, v_map_states, v_map_countries).
      when 'consignees' then
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
        on conflict (tenant_id, code) where deleted_at is null do nothing;
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
        on conflict (tenant_id, code) where deleted_at is null do nothing;
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
        on conflict (tenant_id, code) where deleted_at is null do nothing;
      end case;

      get diagnostics v_rc = row_count;

      -- VALIDATE: discard the write by raising an intentional rollback signal.
      if v_mode = 'VALIDATE' then
        raise exception using errcode = 'CMS00', message = 'dry-run';
      end if;

      -- COMMIT success: inserted (1) or duplicate-skipped (0).
      if v_rc = 1 then v_ok := v_ok + 1; else v_skipped := v_skipped + 1; end if;

    exception
      when sqlstate 'CMS00' then
        if v_rc = 1 then v_ok := v_ok + 1; else v_skipped := v_skipped + 1; end if;

      when sqlstate 'CMS01' then
        v_msg := SQLERRM;
        v_errcnt := v_errcnt + 1;
        v_errors := v_errors || jsonb_build_object('row_no', v_idx, 'column', v_col, 'message', v_msg);
        if v_mode = 'COMMIT' then
          insert into public.import_row_errors (tenant_id, job_id, row_no, column_name, message, raw)
          values (v_tenant, v_job, v_idx, v_col, v_msg, v_row);
        end if;

      when unique_violation or check_violation or foreign_key_violation
         or not_null_violation or invalid_text_representation then
        v_msg := SQLERRM;
        v_errcnt := v_errcnt + 1;
        v_errors := v_errors || jsonb_build_object('row_no', v_idx, 'column', v_col, 'message', v_msg);
        if v_mode = 'COMMIT' then
          insert into public.import_row_errors (tenant_id, job_id, row_no, column_name, message, raw)
          values (v_tenant, v_job, v_idx, v_col, v_msg, v_row);
        end if;
    end;
  end loop;

  -- ---- finalize ------------------------------------------------------------
  if v_mode = 'COMMIT' then
    update public.import_jobs
       set status = 'DONE', ok_rows = v_ok, skipped_rows = v_skipped, error_rows = v_errcnt
     where id = v_job;
    perform set_config('app.suppress_row_audit', 'off', true);
    perform app.write_audit_log(
      v_tenant, 'import_jobs', 'ADD', v_job, v_slug, null,
      jsonb_build_object('master', p_master, 'mode', 'COMMIT',
                         'total', v_total, 'ok', v_ok, 'skipped', v_skipped, 'errors', v_errcnt));
  end if;

  return jsonb_build_object(
    'master', p_master,
    'mode', v_mode,
    'job_id', v_job,
    'total', v_total,
    'ok', v_ok,
    'skipped', v_skipped,
    'error_count', v_errcnt,
    'errors', v_errors
  );
end
$$;

comment on function public.import_master(text, text, jsonb) is
  'Reusable master CSV import (geo + catalog + party incl. customers/vendors/consignees/shippers): VALIDATE (dry-run, no writes) or COMMIT (atomic; row errors -> import_row_errors, unexpected error -> full rollback).';


-- EXTEND public.lookup (0017–0021) — all prior keys kept verbatim; party keys appended. — geo + catalog keys kept verbatim;
-- aggregate keys appended. New keys: service-center, field-executive, consignee, shipper. Signature
-- UNCHANGED.
--
-- TODO(catalog-split): after the catalog slice is complete, replace this if/elsif
-- ladder with a dispatcher over per-key helper functions
-- (app.lookup_country(), app.lookup_product(), app.lookup_service_center(), …).
-- The public signature lookup(text,text,integer) must not change.
-- ===========================================================================
create or replace function public.lookup(
  p_key   text,
  p_q     text default null,
  p_limit integer default 50
)
returns table (id uuid, code text, name text, hint text)
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_pat text := '%' ||
    replace(replace(coalesce(btrim(p_q), ''), '%', '\%'), '_', '\_') || '%';
begin
  if app.current_user_id() is null then
    return;
  end if;

  if p_key = 'country' then
    return query
      select c.id, c.code, c.name, c.currency
      from public.countries c
      where c.tenant_id in (select app.user_tenant_ids())
        and c.deleted_at is null
        and (c.name ilike v_pat or c.code ilike v_pat)
      order by c.name, c.code, c.id
      limit v_limit;

  elsif p_key = 'zone' then
    return query
      select z.id, z.code, z.name, null::text
      from public.zones z
      where z.tenant_id in (select app.user_tenant_ids())
        and z.deleted_at is null
        and (z.name ilike v_pat or z.code ilike v_pat)
      order by z.name, z.code, z.id
      limit v_limit;

  elsif p_key = 'state' then
    return query
      select s.id, s.code, s.name, s.gst_alias
      from public.states s
      where s.tenant_id in (select app.user_tenant_ids())
        and s.deleted_at is null
        and (s.name ilike v_pat or s.code ilike v_pat)
      order by s.name, s.code, s.id
      limit v_limit;

  elsif p_key = 'destination' then
    return query
      select d.id, d.code, d.name, d.dest_type
      from public.destinations d
      where d.tenant_id in (select app.user_tenant_ids())
        and d.deleted_at is null
        and d.status = 'ACTIVE'
        and (d.name ilike v_pat or d.code ilike v_pat)
      order by d.name, d.code, d.id
      limit v_limit;

  elsif p_key = 'pin-code' then
    return query
      select p.id,
             p.pin_code,
             coalesce(p.pin_name, p.pin_code),
             nullif(concat_ws(' · ',
               case when p.is_oda then 'ODA' end,
               case when not p.is_serviceable then 'Non-serviceable' end), '')
      from public.pincodes p
      where p.tenant_id in (select app.user_tenant_ids())
        and p.deleted_at is null
        and (p.pin_code ilike v_pat or p.pin_name ilike v_pat)
      order by p.pin_code, p.id
      limit v_limit;

  elsif p_key = 'country-pincode' then
    return query
      select cp.id,
             cp.pin_code,
             coalesce(nullif(cp.city_name, ''), cp.pin_code),
             cp.state_name
      from public.country_pincodes cp
      where cp.tenant_id in (select app.user_tenant_ids())
        and cp.deleted_at is null
        and (cp.pin_code ilike v_pat or cp.city_name ilike v_pat)
      order by cp.pin_code, cp.id
      limit v_limit;

  elsif p_key = 'area' then
    return query
      select a.id, a.name, a.name, null::text
      from public.areas a
      where a.tenant_id in (select app.user_tenant_ids())
        and a.deleted_at is null
        and a.name ilike v_pat
      order by a.name, a.id
      limit v_limit;

  -- --------------------------- CATALOG (0018) ------------------------
  elsif p_key = 'product-type' then
    return query
      select pt.id, pt.code, pt.name, null::text
      from public.product_types pt
      where pt.tenant_id in (select app.user_tenant_ids())
        and pt.deleted_at is null
        and (pt.name ilike v_pat or pt.code ilike v_pat)
      order by pt.name, pt.code, pt.id
      limit v_limit;

  elsif p_key = 'product' then
    return query
      select pr.id, pr.code, coalesce(nullif(pr.name, ''), pr.code), pr.shipment_type
      from public.products pr
      where pr.tenant_id in (select app.user_tenant_ids())
        and pr.deleted_at is null
        and pr.status = 'ACTIVE'
        and (pr.name ilike v_pat or pr.code ilike v_pat)
      order by pr.name, pr.code, pr.id
      limit v_limit;

  -- --------------------------- CATALOG (0019) ------------------------
  elsif p_key = 'charge' then
    return query
      select ch.id, ch.code, ch.name, ch.charge_type
      from public.charges ch
      where ch.tenant_id in (select app.user_tenant_ids())
        and ch.deleted_at is null
        and (ch.name ilike v_pat or ch.code ilike v_pat)
      order by ch.name, ch.code, ch.id
      limit v_limit;

  elsif p_key = 'airline' then
    return query
      select al.id, al.name, al.name, null::text
      from public.airlines al
      where al.tenant_id in (select app.user_tenant_ids())
        and al.deleted_at is null
        and al.name ilike v_pat
      order by al.name, al.id
      limit v_limit;

  -- --------------------------- CATALOG (0020) ------------------------
  elsif p_key = 'service-center' then
    return query
      select sc.id, sc.code, sc.name, sc.branch
      from public.service_centers sc
      where sc.tenant_id in (select app.user_tenant_ids())
        and sc.deleted_at is null
        and (sc.name ilike v_pat or sc.code ilike v_pat)
      order by sc.name, sc.code, sc.id
      limit v_limit;

  elsif p_key = 'field-executive' then
    return query
      select fe.id, fe.code, fe.name, fe.mobile
      from public.field_executives fe
      where fe.tenant_id in (select app.user_tenant_ids())
        and fe.deleted_at is null
        and fe.in_active = false
        and (fe.name ilike v_pat or fe.code ilike v_pat)
      order by fe.name, fe.code, fe.id
      limit v_limit;

  -- --------------------------- PARTY (0022) ------------------------
  elsif p_key = 'consignee' then
    return query
      select c.id, c.code, c.name, c.city
      from public.consignees c
      where c.tenant_id in (select app.user_tenant_ids())
        and c.deleted_at is null
        and c.status = 'ACTIVE'
        and (c.name ilike v_pat or c.code ilike v_pat)
      order by c.name, c.code, c.id
      limit v_limit;

  elsif p_key = 'shipper' then
    return query
      select s.id, s.code, s.name, s.city
      from public.shippers s
      where s.tenant_id in (select app.user_tenant_ids())
        and s.deleted_at is null
        and s.status = 'ACTIVE'
        and (s.name ilike v_pat or s.code ilike v_pat)
      order by s.name, s.code, s.id
      limit v_limit;

  else
    raise exception 'Unknown lookup key: %', p_key using errcode = '22023';
  end if;
end
$$;

comment on function public.lookup(text, text, integer) is
  'Shared tenant-safe autocomplete for master pickers. Keys: country, zone, state, destination, pin-code, country-pincode, area, product-type, product, charge, airline, service-center, field-executive. Trigram ILIKE search, stable order, limit clamped to [1,200].';


grant execute on function public.lookup(text, text, integer) to authenticated, service_role;
-- EXTEND public.lookup (0017–0022) — all prior keys kept verbatim; customer key appended. — geo + catalog keys kept verbatim;
-- aggregate keys appended. New keys: service-center, field-executive, consignee, shipper, customer. Signature
-- UNCHANGED.
--
-- TODO(catalog-split): after the catalog slice is complete, replace this if/elsif
-- ladder with a dispatcher over per-key helper functions
-- (app.lookup_country(), app.lookup_product(), app.lookup_service_center(), …).
-- The public signature lookup(text,text,integer) must not change.
-- ===========================================================================
create or replace function public.lookup(
  p_key   text,
  p_q     text default null,
  p_limit integer default 50
)
returns table (id uuid, code text, name text, hint text)
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_pat text := '%' ||
    replace(replace(coalesce(btrim(p_q), ''), '%', '\%'), '_', '\_') || '%';
begin
  if app.current_user_id() is null then
    return;
  end if;

  if p_key = 'country' then
    return query
      select c.id, c.code, c.name, c.currency
      from public.countries c
      where c.tenant_id in (select app.user_tenant_ids())
        and c.deleted_at is null
        and (c.name ilike v_pat or c.code ilike v_pat)
      order by c.name, c.code, c.id
      limit v_limit;

  elsif p_key = 'zone' then
    return query
      select z.id, z.code, z.name, null::text
      from public.zones z
      where z.tenant_id in (select app.user_tenant_ids())
        and z.deleted_at is null
        and (z.name ilike v_pat or z.code ilike v_pat)
      order by z.name, z.code, z.id
      limit v_limit;

  elsif p_key = 'state' then
    return query
      select s.id, s.code, s.name, s.gst_alias
      from public.states s
      where s.tenant_id in (select app.user_tenant_ids())
        and s.deleted_at is null
        and (s.name ilike v_pat or s.code ilike v_pat)
      order by s.name, s.code, s.id
      limit v_limit;

  elsif p_key = 'destination' then
    return query
      select d.id, d.code, d.name, d.dest_type
      from public.destinations d
      where d.tenant_id in (select app.user_tenant_ids())
        and d.deleted_at is null
        and d.status = 'ACTIVE'
        and (d.name ilike v_pat or d.code ilike v_pat)
      order by d.name, d.code, d.id
      limit v_limit;

  elsif p_key = 'pin-code' then
    return query
      select p.id,
             p.pin_code,
             coalesce(p.pin_name, p.pin_code),
             nullif(concat_ws(' · ',
               case when p.is_oda then 'ODA' end,
               case when not p.is_serviceable then 'Non-serviceable' end), '')
      from public.pincodes p
      where p.tenant_id in (select app.user_tenant_ids())
        and p.deleted_at is null
        and (p.pin_code ilike v_pat or p.pin_name ilike v_pat)
      order by p.pin_code, p.id
      limit v_limit;

  elsif p_key = 'country-pincode' then
    return query
      select cp.id,
             cp.pin_code,
             coalesce(nullif(cp.city_name, ''), cp.pin_code),
             cp.state_name
      from public.country_pincodes cp
      where cp.tenant_id in (select app.user_tenant_ids())
        and cp.deleted_at is null
        and (cp.pin_code ilike v_pat or cp.city_name ilike v_pat)
      order by cp.pin_code, cp.id
      limit v_limit;

  elsif p_key = 'area' then
    return query
      select a.id, a.name, a.name, null::text
      from public.areas a
      where a.tenant_id in (select app.user_tenant_ids())
        and a.deleted_at is null
        and a.name ilike v_pat
      order by a.name, a.id
      limit v_limit;

  -- --------------------------- CATALOG (0018) ------------------------
  elsif p_key = 'product-type' then
    return query
      select pt.id, pt.code, pt.name, null::text
      from public.product_types pt
      where pt.tenant_id in (select app.user_tenant_ids())
        and pt.deleted_at is null
        and (pt.name ilike v_pat or pt.code ilike v_pat)
      order by pt.name, pt.code, pt.id
      limit v_limit;

  elsif p_key = 'product' then
    return query
      select pr.id, pr.code, coalesce(nullif(pr.name, ''), pr.code), pr.shipment_type
      from public.products pr
      where pr.tenant_id in (select app.user_tenant_ids())
        and pr.deleted_at is null
        and pr.status = 'ACTIVE'
        and (pr.name ilike v_pat or pr.code ilike v_pat)
      order by pr.name, pr.code, pr.id
      limit v_limit;

  -- --------------------------- CATALOG (0019) ------------------------
  elsif p_key = 'charge' then
    return query
      select ch.id, ch.code, ch.name, ch.charge_type
      from public.charges ch
      where ch.tenant_id in (select app.user_tenant_ids())
        and ch.deleted_at is null
        and (ch.name ilike v_pat or ch.code ilike v_pat)
      order by ch.name, ch.code, ch.id
      limit v_limit;

  elsif p_key = 'airline' then
    return query
      select al.id, al.name, al.name, null::text
      from public.airlines al
      where al.tenant_id in (select app.user_tenant_ids())
        and al.deleted_at is null
        and al.name ilike v_pat
      order by al.name, al.id
      limit v_limit;

  -- --------------------------- CATALOG (0020) ------------------------
  elsif p_key = 'service-center' then
    return query
      select sc.id, sc.code, sc.name, sc.branch
      from public.service_centers sc
      where sc.tenant_id in (select app.user_tenant_ids())
        and sc.deleted_at is null
        and (sc.name ilike v_pat or sc.code ilike v_pat)
      order by sc.name, sc.code, sc.id
      limit v_limit;

  elsif p_key = 'field-executive' then
    return query
      select fe.id, fe.code, fe.name, fe.mobile
      from public.field_executives fe
      where fe.tenant_id in (select app.user_tenant_ids())
        and fe.deleted_at is null
        and fe.in_active = false
        and (fe.name ilike v_pat or fe.code ilike v_pat)
      order by fe.name, fe.code, fe.id
      limit v_limit;

  -- --------------------------- PARTY (0022) ------------------------
  elsif p_key = 'consignee' then
    return query
      select c.id, c.code, c.name, c.city
      from public.consignees c
      where c.tenant_id in (select app.user_tenant_ids())
        and c.deleted_at is null
        and c.status = 'ACTIVE'
        and (c.name ilike v_pat or c.code ilike v_pat)
      order by c.name, c.code, c.id
      limit v_limit;

  elsif p_key = 'shipper' then
    return query
      select s.id, s.code, s.name, s.city
      from public.shippers s
      where s.tenant_id in (select app.user_tenant_ids())
        and s.deleted_at is null
        and s.status = 'ACTIVE'
        and (s.name ilike v_pat or s.code ilike v_pat)
      order by s.name, s.code, s.id
      limit v_limit;

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

  else
    raise exception 'Unknown lookup key: %', p_key using errcode = '22023';
  end if;
end
$$;

comment on function public.lookup(text, text, integer) is
  'Shared tenant-safe autocomplete for master pickers. Keys: country, zone, state, destination, pin-code, country-pincode, area, product-type, product, charge, airline, service-center, field-executive. Trigram ILIKE search, stable order, limit clamped to [1,200].';



grant execute on function public.lookup(text, text, integer) to authenticated, service_role;

-- EXTEND public.lookup (0017–0024) — all prior keys kept verbatim; vendor + bank keys appended.
-- aggregate keys appended. New keys: service-center, field-executive, consignee, shipper, customer, vendor, bank. Signature
-- UNCHANGED.
--
-- TODO(catalog-split): after the catalog slice is complete, replace this if/elsif
-- ladder with a dispatcher over per-key helper functions
-- (app.lookup_country(), app.lookup_product(), app.lookup_service_center(), …).
-- The public signature lookup(text,text,integer) must not change.
-- ===========================================================================
create or replace function public.lookup(
  p_key   text,
  p_q     text default null,
  p_limit integer default 50
)
returns table (id uuid, code text, name text, hint text)
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_pat text := '%' ||
    replace(replace(coalesce(btrim(p_q), ''), '%', '\%'), '_', '\_') || '%';
begin
  if app.current_user_id() is null then
    return;
  end if;

  if p_key = 'country' then
    return query
      select c.id, c.code, c.name, c.currency
      from public.countries c
      where c.tenant_id in (select app.user_tenant_ids())
        and c.deleted_at is null
        and (c.name ilike v_pat or c.code ilike v_pat)
      order by c.name, c.code, c.id
      limit v_limit;

  elsif p_key = 'zone' then
    return query
      select z.id, z.code, z.name, null::text
      from public.zones z
      where z.tenant_id in (select app.user_tenant_ids())
        and z.deleted_at is null
        and (z.name ilike v_pat or z.code ilike v_pat)
      order by z.name, z.code, z.id
      limit v_limit;

  elsif p_key = 'state' then
    return query
      select s.id, s.code, s.name, s.gst_alias
      from public.states s
      where s.tenant_id in (select app.user_tenant_ids())
        and s.deleted_at is null
        and (s.name ilike v_pat or s.code ilike v_pat)
      order by s.name, s.code, s.id
      limit v_limit;

  elsif p_key = 'destination' then
    return query
      select d.id, d.code, d.name, d.dest_type
      from public.destinations d
      where d.tenant_id in (select app.user_tenant_ids())
        and d.deleted_at is null
        and d.status = 'ACTIVE'
        and (d.name ilike v_pat or d.code ilike v_pat)
      order by d.name, d.code, d.id
      limit v_limit;

  elsif p_key = 'pin-code' then
    return query
      select p.id,
             p.pin_code,
             coalesce(p.pin_name, p.pin_code),
             nullif(concat_ws(' · ',
               case when p.is_oda then 'ODA' end,
               case when not p.is_serviceable then 'Non-serviceable' end), '')
      from public.pincodes p
      where p.tenant_id in (select app.user_tenant_ids())
        and p.deleted_at is null
        and (p.pin_code ilike v_pat or p.pin_name ilike v_pat)
      order by p.pin_code, p.id
      limit v_limit;

  elsif p_key = 'country-pincode' then
    return query
      select cp.id,
             cp.pin_code,
             coalesce(nullif(cp.city_name, ''), cp.pin_code),
             cp.state_name
      from public.country_pincodes cp
      where cp.tenant_id in (select app.user_tenant_ids())
        and cp.deleted_at is null
        and (cp.pin_code ilike v_pat or cp.city_name ilike v_pat)
      order by cp.pin_code, cp.id
      limit v_limit;

  elsif p_key = 'area' then
    return query
      select a.id, a.name, a.name, null::text
      from public.areas a
      where a.tenant_id in (select app.user_tenant_ids())
        and a.deleted_at is null
        and a.name ilike v_pat
      order by a.name, a.id
      limit v_limit;

  -- --------------------------- CATALOG (0018) ------------------------
  elsif p_key = 'product-type' then
    return query
      select pt.id, pt.code, pt.name, null::text
      from public.product_types pt
      where pt.tenant_id in (select app.user_tenant_ids())
        and pt.deleted_at is null
        and (pt.name ilike v_pat or pt.code ilike v_pat)
      order by pt.name, pt.code, pt.id
      limit v_limit;

  elsif p_key = 'product' then
    return query
      select pr.id, pr.code, coalesce(nullif(pr.name, ''), pr.code), pr.shipment_type
      from public.products pr
      where pr.tenant_id in (select app.user_tenant_ids())
        and pr.deleted_at is null
        and pr.status = 'ACTIVE'
        and (pr.name ilike v_pat or pr.code ilike v_pat)
      order by pr.name, pr.code, pr.id
      limit v_limit;

  -- --------------------------- CATALOG (0019) ------------------------
  elsif p_key = 'charge' then
    return query
      select ch.id, ch.code, ch.name, ch.charge_type
      from public.charges ch
      where ch.tenant_id in (select app.user_tenant_ids())
        and ch.deleted_at is null
        and (ch.name ilike v_pat or ch.code ilike v_pat)
      order by ch.name, ch.code, ch.id
      limit v_limit;

  elsif p_key = 'airline' then
    return query
      select al.id, al.name, al.name, null::text
      from public.airlines al
      where al.tenant_id in (select app.user_tenant_ids())
        and al.deleted_at is null
        and al.name ilike v_pat
      order by al.name, al.id
      limit v_limit;

  -- --------------------------- CATALOG (0020) ------------------------
  elsif p_key = 'service-center' then
    return query
      select sc.id, sc.code, sc.name, sc.branch
      from public.service_centers sc
      where sc.tenant_id in (select app.user_tenant_ids())
        and sc.deleted_at is null
        and (sc.name ilike v_pat or sc.code ilike v_pat)
      order by sc.name, sc.code, sc.id
      limit v_limit;

  elsif p_key = 'field-executive' then
    return query
      select fe.id, fe.code, fe.name, fe.mobile
      from public.field_executives fe
      where fe.tenant_id in (select app.user_tenant_ids())
        and fe.deleted_at is null
        and fe.in_active = false
        and (fe.name ilike v_pat or fe.code ilike v_pat)
      order by fe.name, fe.code, fe.id
      limit v_limit;

  -- --------------------------- PARTY (0022) ------------------------
  elsif p_key = 'consignee' then
    return query
      select c.id, c.code, c.name, c.city
      from public.consignees c
      where c.tenant_id in (select app.user_tenant_ids())
        and c.deleted_at is null
        and c.status = 'ACTIVE'
        and (c.name ilike v_pat or c.code ilike v_pat)
      order by c.name, c.code, c.id
      limit v_limit;

  elsif p_key = 'shipper' then
    return query
      select s.id, s.code, s.name, s.city
      from public.shippers s
      where s.tenant_id in (select app.user_tenant_ids())
        and s.deleted_at is null
        and s.status = 'ACTIVE'
        and (s.name ilike v_pat or s.code ilike v_pat)
      order by s.name, s.code, s.id
      limit v_limit;

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

  else
    raise exception 'Unknown lookup key: %', p_key using errcode = '22023';
  end if;
end
$$;

comment on function public.lookup(text, text, integer) is
  'Shared tenant-safe autocomplete for master pickers. Keys: country, zone, state, destination, pin-code, country-pincode, area, product-type, product, charge, airline, service-center, field-executive. Trigram ILIKE search, stable order, limit clamped to [1,200].';




