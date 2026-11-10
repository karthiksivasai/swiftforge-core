-- 0146  Proforma Customs Compliance, Exchange Rates, and CSB-IV Limit Gates.
-- Adds customs_exchange_rates table and tenant_settings lookup.
-- Updates branch LUT columns.
-- Tightens app.awb_field_errors in book_awb_shipment for:
--   1. Mutual exclusivity between Bond/UT and Pay of IGST.
--   2. Commercial shipments filed as gifts loophole.
--   3. Mandatory AD Code on server for CSB-V / Commercial exports.
--   4. Valid LUT number required when Bond/UT = 'Yes'.
--   5. CSB-IV statutory value limit check against customs exchange rate.

-- 1. LUT columns on branches
alter table public.branches
  add column if not exists lut_number text default '',
  add column if not exists lut_expiry_date date;

-- 2. Customs Exchange Rates table
create table if not exists public.customs_exchange_rates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '00000000-0000-0000-0000-000000000000'::uuid,
  currency char(3) not null,
  rate_to_inr numeric(12, 4) not null check (rate_to_inr > 0),
  valid_from date not null,
  valid_to date not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (valid_to >= valid_from)
);

create index if not exists customs_exchange_rates_curr_idx
  on public.customs_exchange_rates (currency, valid_from, valid_to);

alter table public.customs_exchange_rates enable row level security;

drop policy if exists customs_exchange_rates_select on public.customs_exchange_rates;
create policy customs_exchange_rates_select on public.customs_exchange_rates
  for select to authenticated
  using (true);

drop policy if exists customs_exchange_rates_admin on public.customs_exchange_rates;
create policy customs_exchange_rates_admin on public.customs_exchange_rates
  for all to authenticated
  using (app.is_platform_admin() or (tenant_id in (select app.user_tenant_ids())));

-- Seed standard baseline rates if not exists
insert into public.customs_exchange_rates (currency, rate_to_inr, valid_from, valid_to)
values
  ('INR', 1.0000, '2026-01-01', '2030-12-31'),
  ('USD', 86.5000, '2026-01-01', '2030-12-31'),
  ('EUR', 92.0000, '2026-01-01', '2030-12-31'),
  ('GBP', 110.0000, '2026-01-01', '2030-12-31'),
  ('AED', 23.5500, '2026-01-01', '2030-12-31'),
  ('CAD', 61.2000, '2026-01-01', '2030-12-31'),
  ('AUD', 55.4000, '2026-01-01', '2030-12-31'),
  ('SGD', 64.5000, '2026-01-01', '2030-12-31')
on conflict do nothing;

-- 3. Exchange Rate lookup function
create or replace function app.get_customs_exchange_rate(
  p_currency text,
  p_as_of date default current_date
)
returns numeric
language plpgsql
stable
as $$
declare
  v_curr text := upper(btrim(coalesce(p_currency, 'INR')));
  v_rate numeric;
begin
  if v_curr = 'INR' or v_curr = '' then
    return 1.0000;
  end if;

  select r.rate_to_inr into v_rate
    from public.customs_exchange_rates r
   where r.currency = v_curr
     and p_as_of between r.valid_from and r.valid_to
   order by r.valid_from desc
   limit 1;

  if v_rate is not null and v_rate > 0 then
    return v_rate;
  end if;

  -- Fallback default if not in table
  if v_curr = 'USD' then return 86.5000;
  elsif v_curr = 'EUR' then return 92.0000;
  elsif v_curr = 'GBP' then return 110.0000;
  elsif v_curr = 'AED' then return 23.5500;
  else return 1.0000;
  end if;
end;
$$;

-- 4. CSB-IV value limit lookup helper
create or replace function app.get_csb_iv_limit(p_tenant uuid)
returns numeric
language plpgsql
stable
as $$
declare
  v_val jsonb;
  v_limit numeric;
begin
  select ts.value into v_val
    from public.tenant_settings ts
   where ts.tenant_id = p_tenant
     and ts.key = 'csb_iv_value_limit'
   limit 1;

  if v_val is not null then
    if jsonb_typeof(v_val) = 'number' then
      return v_val::text::numeric;
    elsif jsonb_typeof(v_val) = 'object' and v_val ? 'amount' then
      return (v_val->>'amount')::numeric;
    end if;
  end if;

  return 100000.00; -- Statutory ₹1,00,000 INR default
end;
$$;

-- 5. Updated app.awb_field_errors with strict customs compliance
create or replace function app.awb_field_errors(
  p_tenant uuid,
  p_fields jsonb,
  p_pieces jsonb,
  p_charges jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_errors jsonb := '[]'::jsonb;
  v_customer uuid;
  v_product uuid;
  v_origin uuid;
  v_dest uuid;
  v_vendor uuid;
  v_branch uuid;
  v_service text;
  v_payment text;
  v_shipper jsonb;
  v_consignee jsonb;
  v_delivery text;
  v_booked text;
  v_elem jsonb;
  v_weight numeric := 0;
  v_as_of date;
  v_zone uuid;
  v_rate public.customer_rates%rowtype;
  v_branch_state text;
  v_csb text;
  v_reason text;
  v_is_comm boolean;
  v_iec text;
  v_ad_code text;
  v_bond_ut text;
  v_pay_igst text;
  v_lut_no text;
  v_currency text;
  v_proforma_total numeric := 0;
  v_exchange_rate numeric := 1.0;
  v_inr_value numeric := 0;
  v_csb_iv_limit numeric := 100000.00;
  v_line jsonb;
  v_allowed_csb5 boolean;
begin
  if p_tenant is null then
    return jsonb_build_array(jsonb_build_object('field', 'tenant_id', 'message', 'Tenant is required'));
  end if;

  v_customer := nullif(p_fields->>'customer_id', '')::uuid;
  v_product := nullif(p_fields->>'product_id', '')::uuid;
  v_origin := nullif(p_fields->>'origin_destination_id', '')::uuid;
  v_dest := nullif(p_fields->>'destination_id', '')::uuid;
  v_vendor := nullif(p_fields->>'vendor_id', '')::uuid;
  v_branch := nullif(p_fields->>'branch_id', '')::uuid;
  v_service := nullif(btrim(coalesce(p_fields->>'service', '')), '');
  v_payment := upper(btrim(coalesce(p_fields->>'payment_type', '')));
  v_shipper := coalesce(p_fields->'shipper', '{}'::jsonb);
  v_consignee := coalesce(p_fields->'consignee', '{}'::jsonb);

  if v_customer is null then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('field', 'customer_id', 'message', 'Client is required'));
  end if;
  if v_origin is null then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('field', 'origin_destination_id', 'message', 'Origin is required'));
  end if;
  if v_dest is null then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('field', 'destination_id', 'message', 'Destination is required'));
  end if;
  if v_product is null then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('field', 'product_id', 'message', 'Product is required'));
  end if;
  if v_service is null then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('field', 'service', 'message', 'Service is required'));
  end if;
  if v_vendor is null then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('field', 'vendor_id', 'message', 'Vendor is required'));
  end if;
  if v_branch is null then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('field', 'branch_id', 'message', 'Branch is required'));
  end if;
  if btrim(coalesce(p_fields->>'book_date', '')) = '' then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('field', 'book_date', 'message', 'Book date is required'));
  end if;
  if coalesce(nullif(btrim(coalesce(p_fields->>'pieces', '')), '')::integer, 0) < 1 then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('field', 'pieces', 'message', 'Pieces must be at least 1'));
  end if;
  if btrim(coalesce(v_shipper->>'address1', '')) = '' then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('field', 'shipper_address1', 'message', 'Shipper Address 1 is required'));
  end if;
  if btrim(coalesce(v_shipper->>'pincode', '')) = '' then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('field', 'shipper_pincode', 'message', 'Shipper Pincode is required'));
  end if;
  if btrim(coalesce(v_shipper->>'city', '')) = '' then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('field', 'shipper_city', 'message', 'Shipper City is required'));
  end if;
  if btrim(coalesce(v_shipper->>'state', '')) = '' then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('field', 'shipper_state', 'message', 'Shipper State is required'));
  end if;
  if btrim(coalesce(v_shipper->>'mobile', v_shipper->>'mobileNo', '')) = '' then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('field', 'shipper_mobile', 'message', 'Shipper Mobile is required'));
  end if;

  if v_payment = 'CASH' then
    if btrim(coalesce(p_fields->>'cash_receipt_no', '')) = '' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('field', 'cash_receipt_no', 'message', 'Cash Receipt No. is required for a cash payment'));
    end if;
    if coalesce(nullif(btrim(coalesce(p_fields->>'amount_received', '')), '')::numeric, 0) <= 0 then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('field', 'amount_received', 'message', 'Amount Received is required for a cash payment'));
    end if;
    if btrim(coalesce(p_fields->>'cash_receipt_date', '')) = '' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('field', 'cash_receipt_date', 'message', 'Cash Receipt Date is required for a cash payment'));
    end if;
  end if;

  v_delivery := left(btrim(coalesce(p_fields->'wizard_extras'->>'expectedDeliveryDate', '')), 10);
  v_booked := left(btrim(coalesce(p_fields->>'book_date', '')), 10);
  if v_delivery ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and v_booked ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and v_delivery < v_booked then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field', 'expected_delivery', 'message', 'Expected delivery date cannot be before the book date'));
  end if;

  if v_branch is not null then
    select b.state_code into v_branch_state
      from public.branches b
     where b.id = v_branch and b.tenant_id = p_tenant;
    if nullif(btrim(coalesce(v_branch_state, '')), '') is null then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field','branch_state',
        'message','Branch state is required before GST can be calculated. Set the branch state and try again.'));
    end if;
  end if;

  -- Proforma Customs & GST checks
  v_csb := upper(coalesce(p_fields->'wizard_extras'->'proforma'->>'csbType', 'CSB 4'));
  v_reason := upper(coalesce(p_fields->'wizard_extras'->'proforma'->>'exportReason', ''));
  v_is_comm := coalesce((p_fields->>'is_commercial')::boolean, false) or (v_csb in ('CSB 5', 'COMMERCIAL', 'CBE XIII'));
  v_ad_code := btrim(coalesce(p_fields->'wizard_extras'->'proforma'->>'adCode', ''));
  v_bond_ut := upper(btrim(coalesce(p_fields->'wizard_extras'->'proforma'->>'bondUt', 'NO')));
  v_pay_igst := upper(btrim(coalesce(p_fields->'wizard_extras'->'proforma'->>'payOfIgst', 'NO')));
  v_currency := upper(btrim(coalesce(p_fields->'wizard_extras'->'proforma'->>'currency', 'INR')));

  -- 1. Mutual Exclusivity between LUT and Payment of IGST
  if v_bond_ut = 'YES' and v_pay_igst = 'YES' then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field', 'bond_ut',
      'message', 'LUT (Bond/UT) and Payment of IGST are mutually exclusive under Section 16 of the IGST Act. Choose either LUT or Payment of IGST, not both.'));
  end if;

  -- 2. Commercial export compliance
  if v_is_comm then
    -- Disallow gift declaration for commercial shipments
    if v_reason in ('BONAFIDE GIFT', 'UNSOLICITED GIFT - NOT FOR SALE', 'GIFT') then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field', 'export_reason',
        'message', 'Non-commercial gift exports cannot be filed under commercial exports / CSB-V. Select a commercial export reason.'));
    end if;

    -- Commercial shipments must be filed under CSB-V / Commercial
    if v_csb in ('CSB 4', 'CSB 3', 'ECM SPX') then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field', 'csb_type',
        'message', 'Commercial shipments must be filed under CSB-V or COMMERCIAL, not CSB-IV/III.'));
    end if;

    -- Allowed export reasons for CSB 5
    v_allowed_csb5 := v_reason in ('SALE', 'COMMERCIAL SAMPLES', 'REPAIR & RETURN', 'EXHIBITION', 'DEFECTIVE RETURN');
    if not v_allowed_csb5 and v_reason <> '' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field', 'export_reason',
        'message', format('Export reason "%s" is not permitted for commercial CSB-V. Allowed reasons: SALE, COMMERCIAL SAMPLES, REPAIR & RETURN, EXHIBITION, DEFECTIVE RETURN.', v_reason)));
    end if;

    -- Mandatory IEC for commercial export
    v_iec := btrim(coalesce(
      v_shipper->>'iec_no', v_shipper->>'iecNo',
      case when upper(coalesce(v_shipper->>'document_type', v_shipper->>'documentType', '')) = 'IEC'
           then coalesce(v_shipper->>'document_no', v_shipper->>'documentNo')
           else null end, ''));
    if v_iec = '' or v_iec !~* '^[A-Z0-9]{10}$' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field', 'shipper_iec',
        'message', 'Valid 10-character alphanumeric IEC is required on Shipper for CSB-V / Commercial export.'));
    end if;

    -- Mandatory AD Code for commercial export
    if v_ad_code = '' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field', 'ad_code',
        'message', 'AD Code is required on Proforma for CSB-V / Commercial export.'));
    end if;
  else
    -- Non-commercial exports cannot declare commercial reasons
    if v_reason = 'SALE' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field', 'csb_type',
        'message', 'Commercial export reason "SALE" must be filed under CSB-V or COMMERCIAL, not CSB-IV/III.'));
    end if;
  end if;

  -- 3. LUT Number verification if Bond/UT = 'Yes'
  if v_bond_ut = 'YES' then
    v_lut_no := btrim(coalesce(
      v_shipper->>'lut_number', v_shipper->>'lutNumber', ''
    ));
    if v_lut_no = '' and v_customer is not null then
      select btrim(coalesce(c.lut_number, '')) into v_lut_no
        from public.customers c
       where c.id = v_customer and c.tenant_id = p_tenant;
    end if;
    if v_lut_no = '' and v_branch is not null then
      select btrim(coalesce(b.lut_number, '')) into v_lut_no
        from public.branches b
       where b.id = v_branch and b.tenant_id = p_tenant;
    end if;

    if coalesce(v_lut_no, '') = '' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field', 'bond_ut',
        'message', 'A valid LUT Number is required when exporting under Bond/UT. Add LUT details to Shipper, Customer, or Branch master.'));
    end if;
  end if;

  -- 4. CSB-IV Statutory Value Limit check
  if not v_is_comm and v_csb in ('CSB 4', 'CSB 3', 'ECM SPX') then
    begin
      v_as_of := coalesce((p_fields->>'book_date')::date, current_date);
    exception when others then
      v_as_of := current_date;
    end;

    for v_line in select * from jsonb_array_elements(coalesce(p_fields->'wizard_extras'->'proforma'->'lines', '[]'::jsonb))
    loop
      v_proforma_total := v_proforma_total + (app.to_numeric(v_line->>'quantity') * app.to_numeric(v_line->>'rate'));
    end loop;

    v_exchange_rate := app.get_customs_exchange_rate(v_currency, v_as_of);
    v_inr_value := round(v_proforma_total * v_exchange_rate, 2);
    v_csb_iv_limit := app.get_csb_iv_limit(p_tenant);

    if v_inr_value > v_csb_iv_limit then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field', 'csb_type',
        'message', format('CSB-IV shipment value of ₹%s INR exceeds the statutory customs limit of ₹%s INR. Commercial filing under CSB-V is required.',
          to_char(v_inr_value, 'FM99,99,990.00'),
          to_char(v_csb_iv_limit, 'FM99,99,990'))));
    end if;
  end if;

  -- Rating validation
  if v_customer is not null and v_product is not null and v_origin is not null and v_dest is not null then
    begin
      v_as_of := coalesce((p_fields->>'book_date')::date, current_date);
    exception when others then
      v_as_of := current_date;
    end;
    v_zone := app.resolve_rating_zone(
      p_tenant, v_origin, v_dest, v_vendor, v_product, v_service, v_as_of);
    v_rate := app.resolve_customer_rate(
      p_tenant, v_customer, v_product, v_service, v_origin, v_dest, v_zone, v_as_of);
    if v_rate is null or v_rate.id is null then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field','rate',
        'message','No customer rate was found for this origin, destination, and product'));
    end if;
  end if;

  return v_errors;
end;
$$;
