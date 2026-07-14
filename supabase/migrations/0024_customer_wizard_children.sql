-- ===========================================================================
-- 0024  customer wizard children (Phase 3 — Party Masters, Milestone 10C)
-- ---------------------------------------------------------------------------
-- Normalizes fuel surcharges, other charges, volumetrics, and KYC wizard tabs
-- into dedicated child tables synced by save_customer (replace semantics).
-- wizard_extras retains contract / other / notification prefs only.
-- ===========================================================================

-- ===========================================================================
-- customer_fuel_surcharges
-- ===========================================================================
create table if not exists public.customer_fuel_surcharges (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  customer_id   uuid not null,
  seq           integer not null,
  entry_code    text,
  from_date     date,
  to_date       date,
  vendor        text,
  product       text,
  destination   text,
  percentage    numeric(7,4),
  constraint customer_fuel_surcharges_customer_fk foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete cascade,
  constraint customer_fuel_surcharges_uq unique (tenant_id, customer_id, seq)
);
create index if not exists customer_fuel_surcharges_customer_idx
  on public.customer_fuel_surcharges (tenant_id, customer_id);

-- ===========================================================================
-- customer_other_charges
-- ===========================================================================
create table if not exists public.customer_other_charges (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  customer_id   uuid not null,
  seq           integer not null,
  charge_type   text,
  from_date     date,
  to_date       date,
  vendor        text,
  service       text,
  product       text,
  origin        text,
  destination   text,
  amount        numeric(14,2),
  minimum_value numeric(14,2),
  constraint customer_other_charges_customer_fk foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete cascade,
  constraint customer_other_charges_uq unique (tenant_id, customer_id, seq)
);
create index if not exists customer_other_charges_customer_idx
  on public.customer_other_charges (tenant_id, customer_id);

-- ===========================================================================
-- customer_volumetrics
-- ===========================================================================
create table if not exists public.customer_volumetrics (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  customer_id   uuid not null,
  seq           integer not null,
  product       text,
  vendor        text,
  service       text,
  cm_divisor    numeric(12,3),
  inch_divisor  numeric(12,3),
  cft           numeric(12,3),
  constraint customer_volumetrics_customer_fk foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete cascade,
  constraint customer_volumetrics_uq unique (tenant_id, customer_id, seq)
);
create index if not exists customer_volumetrics_customer_idx
  on public.customer_volumetrics (tenant_id, customer_id);

-- ===========================================================================
-- customer_kyc_documents (wizard tab; file upload deferred)
-- ===========================================================================
create table if not exists public.customer_kyc_documents (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  customer_id   uuid not null,
  seq           integer not null,
  kyc_type      text not null,
  file_name     text,
  constraint customer_kyc_documents_customer_fk foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete cascade,
  constraint customer_kyc_documents_uq unique (tenant_id, customer_id, seq)
);
create index if not exists customer_kyc_documents_customer_idx
  on public.customer_kyc_documents (tenant_id, customer_id);

-- Child RLS (customer-master gated; modify covers replace writes).
do $$
declare r record;
begin
  for r in (
    select * from (values
      ('customer_fuel_surcharges'),
      ('customer_other_charges'),
      ('customer_volumetrics'),
      ('customer_kyc_documents')
    ) as t(tbl)
  ) loop
    execute format('alter table public.%I enable row level security;', r.tbl);
    execute format('drop policy if exists %I on public.%I;', r.tbl || '_select', r.tbl);
    execute format($p$create policy %I on public.%I for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());$p$, r.tbl || '_select', r.tbl);
    execute format('drop policy if exists %I on public.%I;', r.tbl || '_insert', r.tbl);
    execute format($p$create policy %I on public.%I for insert with check (tenant_id in (select app.user_tenant_ids()) and app.user_has_permission(tenant_id, 'mst.customer-master', 'add'));$p$, r.tbl || '_insert', r.tbl);
    execute format('drop policy if exists %I on public.%I;', r.tbl || '_delete', r.tbl);
    execute format($p$create policy %I on public.%I for delete using (tenant_id in (select app.user_tenant_ids()) and app.user_has_permission(tenant_id, 'mst.customer-master', 'modify'));$p$, r.tbl || '_delete', r.tbl);
  end loop;
end $$;

-- ===========================================================================
-- save_customer — extended aggregate (addresses + 4 wizard child collections)
-- ===========================================================================
drop function if exists public.save_customer(uuid, integer, jsonb, jsonb, jsonb);

create or replace function public.save_customer(
  p_id                uuid,
  p_row_version       integer,
  p_fields            jsonb,
  p_addresses         jsonb,
  p_wizard_extras     jsonb default '{}'::jsonb,
  p_fuel_surcharges   jsonb default '[]'::jsonb,
  p_other_charges     jsonb default '[]'::jsonb,
  p_volumetrics       jsonb default '[]'::jsonb,
  p_kyc_documents     jsonb default '[]'::jsonb
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

  -- addresses
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

  -- fuel surcharges
  delete from public.customer_fuel_surcharges where tenant_id = v_tenant and customer_id = v_c.id;
  if p_fuel_surcharges is not null and jsonb_typeof(p_fuel_surcharges) = 'array' then
    insert into public.customer_fuel_surcharges (
      tenant_id, customer_id, seq, entry_code, from_date, to_date,
      vendor, product, destination, percentage)
    select v_tenant, v_c.id, t.ord,
      nullif(btrim(coalesce(t.row->>'entry_code', t.row->>'entryCode','')),''),
      nullif(btrim(coalesce(t.row->>'from_date', t.row->>'fromDate','')),'')::date,
      nullif(btrim(coalesce(t.row->>'to_date', t.row->>'toDate','')),'')::date,
      nullif(btrim(coalesce(t.row->>'vendor','')),''),
      nullif(btrim(coalesce(t.row->>'product','')),''),
      nullif(btrim(coalesce(t.row->>'destination','')),''),
      nullif(btrim(coalesce(t.row->>'percentage','')),'')::numeric
    from jsonb_array_elements(p_fuel_surcharges) with ordinality as t(row, ord)
    where coalesce(btrim(coalesce(t.row->>'entry_code', t.row->>'entryCode','')), '') <> '';
  end if;

  -- other charges
  delete from public.customer_other_charges where tenant_id = v_tenant and customer_id = v_c.id;
  if p_other_charges is not null and jsonb_typeof(p_other_charges) = 'array' then
    insert into public.customer_other_charges (
      tenant_id, customer_id, seq, charge_type, from_date, to_date,
      vendor, service, product, origin, destination, amount, minimum_value)
    select v_tenant, v_c.id, t.ord,
      nullif(btrim(coalesce(t.row->>'charge_type', t.row->>'chargeType','')),''),
      nullif(btrim(coalesce(t.row->>'from_date', t.row->>'fromDate','')),'')::date,
      nullif(btrim(coalesce(t.row->>'to_date', t.row->>'toDate','')),'')::date,
      nullif(btrim(coalesce(t.row->>'vendor','')),''),
      nullif(btrim(coalesce(t.row->>'service','')),''),
      nullif(btrim(coalesce(t.row->>'product','')),''),
      nullif(btrim(coalesce(t.row->>'origin','')),''),
      nullif(btrim(coalesce(t.row->>'destination','')),''),
      nullif(btrim(coalesce(t.row->>'amount','')),'')::numeric,
      nullif(btrim(coalesce(t.row->>'minimum_value', t.row->>'minimumValue','')),'')::numeric
    from jsonb_array_elements(p_other_charges) with ordinality as t(row, ord)
    where coalesce(btrim(coalesce(t.row->>'charge_type', t.row->>'chargeType','')), '') <> '';
  end if;

  -- volumetrics
  delete from public.customer_volumetrics where tenant_id = v_tenant and customer_id = v_c.id;
  if p_volumetrics is not null and jsonb_typeof(p_volumetrics) = 'array' then
    insert into public.customer_volumetrics (
      tenant_id, customer_id, seq, product, vendor, service, cm_divisor, inch_divisor, cft)
    select v_tenant, v_c.id, t.ord,
      nullif(btrim(coalesce(t.row->>'product','')),''),
      nullif(btrim(coalesce(t.row->>'vendor','')),''),
      nullif(btrim(coalesce(t.row->>'service','')),''),
      nullif(btrim(coalesce(t.row->>'cm_divisor', t.row->>'cmDivide','')),'')::numeric,
      nullif(btrim(coalesce(t.row->>'inch_divisor', t.row->>'inchDivide','')),'')::numeric,
      nullif(btrim(coalesce(t.row->>'cft','')),'')::numeric
    from jsonb_array_elements(p_volumetrics) with ordinality as t(row, ord)
    where coalesce(
      btrim(coalesce(t.row->>'product', t.row->>'service', t.row->>'vendor','')), '') <> '';
  end if;

  -- kyc documents
  delete from public.customer_kyc_documents where tenant_id = v_tenant and customer_id = v_c.id;
  if p_kyc_documents is not null and jsonb_typeof(p_kyc_documents) = 'array' then
    insert into public.customer_kyc_documents (tenant_id, customer_id, seq, kyc_type, file_name)
    select v_tenant, v_c.id, t.ord,
      btrim(coalesce(t.row->>'kyc_type', t.row->>'type','')),
      nullif(btrim(coalesce(t.row->>'file_name', t.row->>'fileName','')),'')
    from jsonb_array_elements(p_kyc_documents) with ordinality as t(row, ord)
    where coalesce(btrim(coalesce(t.row->>'kyc_type', t.row->>'type','')), '') <> '';
  end if;

  perform app.write_audit_log(
    v_tenant, 'customers',
    case when p_id is null then 'ADD' else 'MODIFY' end,
    v_c.id, 'mst.customer-master', null,
    jsonb_build_object(
      'addresses', coalesce(p_addresses, '[]'::jsonb),
      'fuel_surcharges', coalesce(p_fuel_surcharges, '[]'::jsonb),
      'other_charges', coalesce(p_other_charges, '[]'::jsonb),
      'volumetrics', coalesce(p_volumetrics, '[]'::jsonb),
      'kyc_documents', coalesce(p_kyc_documents, '[]'::jsonb)));

  return v_c;
end $$;

comment on function public.save_customer(uuid, integer, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) is
  'Aggregate Save: customers root + addresses + fuel/other/volumetric/KYC child collections (replace semantics). wizard_extras holds contract/other/notification only.';

grant execute on function public.save_customer(uuid, integer, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb)
  to authenticated, service_role;
