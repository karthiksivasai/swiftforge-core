-- ===========================================================================
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

-- ===========================================================================
-- save_vendor — extended aggregate (+ documents / services / API credentials)
-- ===========================================================================
drop function if exists public.save_vendor(uuid, integer, jsonb, jsonb, jsonb, jsonb, jsonb);

create or replace function public.save_vendor(
  p_id                uuid,
  p_row_version       integer,
  p_fields            jsonb,
  p_wizard_extras     jsonb default '{}'::jsonb,
  p_addresses         jsonb default '[]'::jsonb,
  p_contacts          jsonb default '[]'::jsonb,
  p_bank_accounts     jsonb default '[]'::jsonb,
  p_documents         jsonb default '[]'::jsonb,
  p_services          jsonb default '[]'::jsonb,
  p_api_credentials   jsonb default '[]'::jsonb
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

  -- documents (file_id FK deferred)
  delete from public.vendor_documents where tenant_id = v_tenant and vendor_id = v_v.id;
  if p_documents is not null and jsonb_typeof(p_documents) = 'array' then
    insert into public.vendor_documents (
      tenant_id, vendor_id, seq, doc_type, file_name, file_id, remark)
    select v_tenant, v_v.id, t.ord,
      btrim(coalesce(t.row->>'doc_type', t.row->>'docType','')),
      nullif(btrim(coalesce(t.row->>'file_name', t.row->>'fileName','')),''),
      nullif(btrim(coalesce(t.row->>'file_id', t.row->>'fileId','')),'')::uuid,
      nullif(btrim(coalesce(t.row->>'remark','')),'')
    from jsonb_array_elements(p_documents) with ordinality as t(row, ord)
    where coalesce(btrim(coalesce(t.row->>'doc_type', t.row->>'docType','')), '') <> '';
  end if;

  -- services
  delete from public.vendor_services where tenant_id = v_tenant and vendor_id = v_v.id;
  if p_services is not null and jsonb_typeof(p_services) = 'array' then
    insert into public.vendor_services (
      tenant_id, vendor_id, seq, service, billing_vendor_id,
      min_weight, max_weight, vendor_link, is_single_piece, status)
    select v_tenant, v_v.id, t.ord,
      nullif(btrim(coalesce(t.row->>'service','')),''),
      nullif(btrim(coalesce(t.row->>'billing_vendor_id', t.row->>'billingVendorId','')),'')::uuid,
      nullif(btrim(coalesce(t.row->>'min_weight', t.row->>'minWeight','')),'')::numeric,
      nullif(btrim(coalesce(t.row->>'max_weight', t.row->>'maxWeight','')),'')::numeric,
      nullif(btrim(coalesce(t.row->>'vendor_link', t.row->>'vendorLink','')),''),
      coalesce((t.row->>'is_single_piece')::boolean, coalesce((t.row->>'isSinglePiece')::boolean, false)),
      app.norm_enum(t.row->>'status', array['ACTIVE','INACTIVE'], 'Status', 'ACTIVE')
    from jsonb_array_elements(p_services) with ordinality as t(row, ord)
    where coalesce(btrim(coalesce(t.row->>'service','')), '') <> '';
  end if;

  -- API credentials
  delete from public.vendor_api_credentials where tenant_id = v_tenant and vendor_id = v_v.id;
  if p_api_credentials is not null and jsonb_typeof(p_api_credentials) = 'array' then
    insert into public.vendor_api_credentials (
      tenant_id, vendor_id, seq, carrier_code, api_key, api_secret,
      endpoint_url, username, is_active, remark)
    select v_tenant, v_v.id, t.ord,
      btrim(coalesce(t.row->>'carrier_code', t.row->>'carrierCode','')),
      nullif(btrim(coalesce(t.row->>'api_key', t.row->>'apiKey','')),''),
      nullif(btrim(coalesce(t.row->>'api_secret', t.row->>'apiSecret','')),''),
      nullif(btrim(coalesce(t.row->>'endpoint_url', t.row->>'endpointUrl','')),''),
      nullif(btrim(coalesce(t.row->>'username','')),''),
      coalesce((t.row->>'is_active')::boolean, coalesce((t.row->>'isActive')::boolean, true)),
      nullif(btrim(coalesce(t.row->>'remark','')),'')
    from jsonb_array_elements(p_api_credentials) with ordinality as t(row, ord)
    where coalesce(btrim(coalesce(t.row->>'carrier_code', t.row->>'carrierCode','')), '') <> '';
  end if;

  perform app.write_audit_log(
    v_tenant, 'vendors',
    case when p_id is null then 'ADD' else 'MODIFY' end,
    v_v.id, 'mst.vendor-master', null,
    jsonb_build_object(
      'addresses', coalesce(p_addresses, '[]'::jsonb),
      'contacts', coalesce(p_contacts, '[]'::jsonb),
      'bank_accounts', coalesce(p_bank_accounts, '[]'::jsonb),
      'documents', coalesce(p_documents, '[]'::jsonb),
      'services', coalesce(p_services, '[]'::jsonb),
      'api_credentials', coalesce(p_api_credentials, '[]'::jsonb)));

  return v_v;
end $$;

comment on function public.save_vendor(uuid, integer, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) is
  'Aggregate Save: vendors root + addresses/contacts/bank/documents/services/API credential child collections (replace semantics). wizard_extras holds rates metadata only.';

grant execute on function public.save_vendor(uuid, integer, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb)
  to authenticated, service_role;

