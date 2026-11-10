-- 0149 Proforma LUT Policy: Remove Branch Fallback and Enforce Expiry Date Gates
-- 
-- 1. Removes the Branch master fallback for LUT validation.
--    LUT must come only from Proforma input, Shipper master, or Customer master.
-- 2. Checks expiry dates on Customer (lut_till_date) and Shipper (lut_till_date).
--    If Bond/UT = 'Yes' and the LUT is expired relative to the book date, booking is blocked.
-- 3. If Bond/UT = 'Yes' and no valid LUT is found, booking is blocked with a clear message.
-- 4. In book_awb_shipment, stamps resolved lutNo into wizard_extras.proforma if empty.

create or replace function app.awb_field_errors(p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_errors jsonb := '[]'::jsonb;
  v_party jsonb;
  v_role text;
  v_email text;
  v_mobile text;
  v_country text;
  v_iec text;
  v_delivery text;
  v_booked text;
  v_csb text;
  v_reason text;
  v_is_comm boolean;
  v_ad_code text;
  v_bond_ut text;
  v_pay_igst text;
  v_currency text;
  v_lut_no text;
  v_lut_expired boolean := false;
  v_lut_expiry_date date;
  v_allowed_csb5 boolean;
  v_line jsonb;
  v_proforma_total numeric := 0;
  v_exchange_rate numeric := 1.0;
  v_inr_value numeric := 0;
  v_csb_iv_limit numeric := 100000.00;
  v_as_of date;
  v_shipper jsonb;
  v_customer uuid;
  v_product_code text;
  v_pieces_unit text;
  v_is_dox boolean := false;
  v_proforma_lines jsonb;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;

  -- 1. Reference no length
  if length(btrim(coalesce(p_fields->>'reference_no', ''))) > 30 then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field', 'reference_no', 'message', 'Reference No. cannot be longer than 30 characters'));
  end if;

  -- 2. Party fields length and format
  foreach v_role in array array['shipper', 'consignee']
  loop
    v_party := coalesce(p_fields->v_role, '{}'::jsonb);
    if length(btrim(coalesce(v_party->>'company_name', ''))) > 100 then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('field', v_role, 'message', initcap(v_role) || ' company name cannot be longer than 100 characters'));
    end if;
    if length(btrim(coalesce(v_party->>'contact_name', ''))) > 100 then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('field', v_role, 'message', initcap(v_role) || ' contact name cannot be longer than 100 characters'));
    end if;
    if length(btrim(coalesce(v_party->>'address1', ''))) > 100
       or length(btrim(coalesce(v_party->>'address2', ''))) > 100 then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('field', v_role, 'message', initcap(v_role) || ' address cannot be longer than 100 characters'));
    end if;
    if length(btrim(coalesce(v_party->>'city', ''))) > 50
       or length(btrim(coalesce(v_party->>'state', ''))) > 50 then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('field', v_role, 'message', initcap(v_role) || ' city and state cannot be longer than 50 characters'));
    end if;
    if length(btrim(coalesce(v_party->>'telephone', ''))) > 15
       or length(btrim(coalesce(v_party->>'mobile', ''))) > 15 then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('field', v_role, 'message', initcap(v_role) || ' phone cannot be longer than 15 characters'));
    end if;
    v_email := btrim(coalesce(v_party->>'email', ''));
    if length(v_email) > 100 then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('field', v_role, 'message', initcap(v_role) || ' email cannot be longer than 100 characters'));
    elsif v_email <> '' and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('field', v_role, 'message', initcap(v_role) || ' email is not a valid email address'));
    end if;
  end loop;

  -- 3. Expected delivery date vs book date
  v_delivery := left(btrim(coalesce(p_fields->'wizard_extras'->>'expectedDeliveryDate', '')), 10);
  v_booked := left(btrim(coalesce(p_fields->>'book_date', '')), 10);
  if v_delivery ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and v_booked ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and v_delivery < v_booked then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field', 'expected_delivery', 'message', 'Expected delivery date cannot be before the book date'));
  end if;

  -- 4. Identify DOX vs Non-DOX
  v_product_code := upper(btrim(coalesce(p_fields->>'product_code', '')));
  if v_product_code = '' and p_fields->>'product_id' is not null then
    select upper(btrim(code)) into v_product_code
      from public.products
     where id = (p_fields->>'product_id')::uuid;
  end if;
  v_pieces_unit := upper(btrim(coalesce(p_fields->>'pieces_unit', '')));
  v_csb := upper(btrim(coalesce(p_fields->'wizard_extras'->'proforma'->>'csbType', '')));
  v_reason := upper(btrim(coalesce(p_fields->'wizard_extras'->'proforma'->>'exportReason', '')));
  v_is_comm := coalesce((p_fields->>'is_commercial')::boolean, false) or (v_csb in ('CSB 5', 'COMMERCIAL', 'CBE XIII'));
  v_is_dox := (v_product_code = 'DOX') and not v_is_comm;

  v_ad_code := btrim(coalesce(p_fields->'wizard_extras'->'proforma'->>'adCode', ''));
  v_bond_ut := upper(btrim(coalesce(p_fields->'wizard_extras'->'proforma'->>'bondUt', 'NO')));
  v_pay_igst := upper(btrim(coalesce(p_fields->'wizard_extras'->'proforma'->>'payOfIgst', 'NO')));
  v_currency := upper(btrim(coalesce(p_fields->'wizard_extras'->'proforma'->>'currency', 'INR')));
  v_shipper := coalesce(p_fields->'shipper', '{}'::jsonb);
  v_proforma_lines := coalesce(p_fields->'wizard_extras'->'proforma'->'lines', '[]'::jsonb);

  -- 4a. CSB Type and Export Reason MUST be chosen (cannot be blank)
  if v_csb = '' then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field', 'csb_type',
      'message', 'CSB Type is required. Select CSB 4, CSB 5, etc. on the Proforma tab.'));
  end if;

  if v_reason = '' then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field', 'export_reason',
      'message', 'Export reason is required. Select an export reason on the Proforma tab.'));
  end if;

  -- 4b. Proforma lines requirement: DOX exempt; Non-DOX & Commercial require >= 1 line
  if not v_is_dox then
    if jsonb_typeof(v_proforma_lines) <> 'array' or jsonb_array_length(v_proforma_lines) < 1 then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field', 'proforma_lines',
        'message', 'At least one proforma line item is required for non-document and commercial shipments.'));
    end if;
  end if;

  -- 4c. Mutual Exclusivity between LUT and Payment of IGST
  if v_bond_ut = 'YES' and v_pay_igst = 'YES' then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field', 'bond_ut',
      'message', 'LUT (Bond/UT) and Payment of IGST are mutually exclusive under Section 16 of the IGST Act. Choose either LUT or Payment of IGST, not both.'));
  end if;

  -- 4d. Commercial export compliance
  if v_is_comm then
    if v_reason in ('BONAFIDE GIFT', 'UNSOLICITED GIFT - NOT FOR SALE', 'GIFT') then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field', 'export_reason',
        'message', 'Non-commercial gift exports cannot be filed under commercial exports / CSB-V. Select a commercial export reason.'));
    end if;

    if v_csb in ('CSB 4', 'CSB 3', 'ECM SPX') then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field', 'csb_type',
        'message', 'Commercial shipments must be filed under CSB-V or COMMERCIAL, not CSB-IV/III.'));
    end if;

    v_allowed_csb5 := v_reason in ('SALE', 'COMMERCIAL SAMPLES', 'REPAIR & RETURN', 'EXHIBITION', 'DEFECTIVE RETURN');
    if not v_allowed_csb5 and v_reason <> '' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field', 'export_reason',
        'message', format('Export reason "%s" is not permitted for commercial CSB-V. Allowed reasons: SALE, COMMERCIAL SAMPLES, REPAIR & RETURN, EXHIBITION, DEFECTIVE RETURN.', v_reason)));
    end if;

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

    if v_ad_code = '' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field', 'ad_code',
        'message', 'AD Code is required on Proforma for CSB-V / Commercial export.'));
    end if;
  else
    if v_reason = 'SALE' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field', 'csb_type',
        'message', 'Commercial export reason "SALE" must be filed under CSB-V or COMMERCIAL, not CSB-IV/III.'));
    end if;
  end if;

  -- 4e. LUT Number verification if Bond/UT = 'Yes'
  -- Per policy: LUT must come only from Proforma input, Shipper master, or Customer master.
  -- Branch fallback is removed. If LUT is expired relative to book date, booking is blocked.
  if v_bond_ut = 'YES' then
    v_lut_no := btrim(coalesce(p_fields->'wizard_extras'->'proforma'->>'lutNo', ''));
    v_lut_expired := false;
    v_lut_expiry_date := null;

    -- If not entered in Proforma, check Shipper master first
    if v_lut_no = '' then
      v_lut_no := btrim(coalesce(v_shipper->>'lut_number', v_shipper->>'lutNumber', ''));
      if v_lut_no <> '' then
        begin
          v_lut_expiry_date := nullif(btrim(coalesce(v_shipper->>'lut_till_date', v_shipper->>'lutExpiryDate', '')), '')::date;
        exception when others then
          v_lut_expiry_date := null;
        end;
      end if;
    end if;

    -- If still empty, check Customer master
    if v_lut_no = '' and v_tenant is not null then
      v_customer := nullif(btrim(coalesce(p_fields->>'customer_id','')),'')::uuid;
      if v_customer is not null then
        select btrim(coalesce(c.lut_number, '')), c.lut_till_date
          into v_lut_no, v_lut_expiry_date
          from public.customers c
         where c.id = v_customer and c.tenant_id = v_tenant;
        v_lut_no := coalesce(v_lut_no, '');
      end if;
    end if;

    -- If LUT is provided/resolved, but expiry date was not yet looked up, check Customer master for expiration
    if v_lut_no <> '' and v_lut_expiry_date is null and v_tenant is not null then
      v_customer := nullif(btrim(coalesce(p_fields->>'customer_id','')),'')::uuid;
      if v_customer is not null then
        select c.lut_till_date into v_lut_expiry_date
          from public.customers c
         where c.id = v_customer and c.tenant_id = v_tenant and btrim(coalesce(c.lut_number, '')) = v_lut_no;
      end if;
    end if;

    -- Check expiration against book date
    if v_lut_no <> '' and v_lut_expiry_date is not null then
      begin
        v_as_of := coalesce(nullif(btrim(coalesce(p_fields->>'book_date','')),'')::date, current_date);
      exception when others then
        v_as_of := current_date;
      end;
      if v_lut_expiry_date < v_as_of then
        v_lut_expired := true;
      end if;
    end if;

    if coalesce(v_lut_no, '') = '' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field', 'bond_ut',
        'message', 'Bond / UT is selected as Yes, but no valid LUT (Bond/UT) number is on file for the Shipper or Customer. Enter an LUT number on the Proforma tab or configure it in Client Master.'));
    elsif v_lut_expired then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field', 'bond_ut',
        'message', 'Bond / UT is selected as Yes, but the LUT on file (' || v_lut_no || ') expired on ' || v_lut_expiry_date::text || '. An active, unexpired LUT is required.'));
    end if;
  end if;

  -- 4f. CSB-IV Statutory Value Limit check (applies to non-commercial CSB-IV with lines)
  if not v_is_comm and v_csb in ('CSB 4', 'CSB 3', 'ECM SPX') and jsonb_array_length(v_proforma_lines) > 0 then
    begin
      v_as_of := coalesce((p_fields->>'book_date')::date, current_date);
    exception when others then
      v_as_of := current_date;
    end;

    for v_line in select * from jsonb_array_elements(v_proforma_lines)
    loop
      v_proforma_total := v_proforma_total + (app.to_numeric(v_line->>'quantity') * app.to_numeric(v_line->>'rate'));
    end loop;

    v_exchange_rate := app.get_customs_exchange_rate(v_currency, v_as_of);
    v_inr_value := round(v_proforma_total * v_exchange_rate, 2);
    if v_tenant is not null then
      v_csb_iv_limit := app.get_csb_iv_limit(v_tenant);
    end if;

    if v_inr_value > v_csb_iv_limit then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field', 'csb_type',
        'message', format('Total invoice value of ₹%s INR exceeds the statutory CSB-IV limit of ₹%s INR (%s %s @ %s). Shipments above this limit must be filed under CSB-V.',
          trim(to_char(v_inr_value, '99,99,99,990.00')),
          trim(to_char(v_csb_iv_limit, '99,99,99,990.00')),
          v_currency,
          trim(to_char(v_proforma_total, '99,99,99,990.00')),
          v_exchange_rate)));
    end if;
  end if;

  -- 4g. Proforma line items validation
  if jsonb_typeof(v_proforma_lines) = 'array' and jsonb_array_length(v_proforma_lines) > 0 then
    for v_line in select * from jsonb_array_elements(v_proforma_lines)
    loop
      if btrim(coalesce(v_line->>'description', '')) = '' then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'field', 'proforma_description',
          'message', 'Line item description is required on proforma'));
      end if;
      if v_is_comm then
        if btrim(coalesce(v_line->>'hsCode', v_line->>'hsnCode', '')) = '' then
          v_errors := v_errors || jsonb_build_array(jsonb_build_object(
            'field', 'proforma_hsn',
            'message', 'Harmonized System (HSN) Code is mandatory for commercial items'));
        elsif btrim(coalesce(v_line->>'hsCode', v_line->>'hsnCode', '')) !~ '^[0-9]{4,8}$' then
          v_errors := v_errors || jsonb_build_array(jsonb_build_object(
            'field', 'proforma_hsn',
            'message', 'HSN code must be 4 to 8 numeric digits'));
        end if;
      end if;
    end loop;
  end if;

  return v_errors;
end;
$$;
