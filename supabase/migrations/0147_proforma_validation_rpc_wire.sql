-- 0147  Wire app.awb_field_errors(p_fields jsonb) to full proforma customs compliance checks

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
  v_allowed_csb5 boolean;
  v_line jsonb;
  v_proforma_total numeric := 0;
  v_exchange_rate numeric := 1.0;
  v_inr_value numeric := 0;
  v_csb_iv_limit numeric := 100000.00;
  v_as_of date;
  v_shipper jsonb;
  v_customer uuid;
  v_branch uuid;
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

  -- 4. Proforma Customs & GST checks
  v_csb := upper(coalesce(p_fields->'wizard_extras'->'proforma'->>'csbType', 'CSB 4'));
  v_reason := upper(coalesce(p_fields->'wizard_extras'->'proforma'->>'exportReason', ''));
  v_is_comm := coalesce((p_fields->>'is_commercial')::boolean, false) or (v_csb in ('CSB 5', 'COMMERCIAL', 'CBE XIII'));
  v_ad_code := btrim(coalesce(p_fields->'wizard_extras'->'proforma'->>'adCode', ''));
  v_bond_ut := upper(btrim(coalesce(p_fields->'wizard_extras'->'proforma'->>'bondUt', 'NO')));
  v_pay_igst := upper(btrim(coalesce(p_fields->'wizard_extras'->'proforma'->>'payOfIgst', 'NO')));
  v_currency := upper(btrim(coalesce(p_fields->'wizard_extras'->'proforma'->>'currency', 'INR')));
  v_shipper := coalesce(p_fields->'shipper', '{}'::jsonb);

  -- 4a. Mutual Exclusivity between LUT and Payment of IGST
  if v_bond_ut = 'YES' and v_pay_igst = 'YES' then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field', 'bond_ut',
      'message', 'LUT (Bond/UT) and Payment of IGST are mutually exclusive under Section 16 of the IGST Act. Choose either LUT or Payment of IGST, not both.'));
  end if;

  -- 4b. Commercial export compliance
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

  -- 4c. LUT Number verification if Bond/UT = 'Yes'
  if v_bond_ut = 'YES' then
    v_lut_no := btrim(coalesce(
      p_fields->'wizard_extras'->'proforma'->>'lutNo',
      v_shipper->>'lut_number', v_shipper->>'lutNumber', ''
    ));
    if v_lut_no = '' and v_tenant is not null then
      v_customer := nullif(btrim(coalesce(p_fields->>'customer_id','')),'')::uuid;
      if v_customer is not null then
        select btrim(coalesce(c.lut_number, '')) into v_lut_no
          from public.customers c
         where c.id = v_customer and c.tenant_id = v_tenant;
      end if;
      if coalesce(v_lut_no, '') = '' then
        v_branch := nullif(btrim(coalesce(p_fields->>'branch_id','')),'')::uuid;
        if v_branch is not null then
          select btrim(coalesce(b.lut_number, '')) into v_lut_no
            from public.branches b
           where b.id = v_branch and b.tenant_id = v_tenant;
        end if;
      end if;
    end if;

    if coalesce(v_lut_no, '') = '' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field', 'bond_ut',
        'message', 'A valid LUT Number is required when exporting under Bond/UT. Add LUT details to Shipper, Customer, or Branch master.'));
    end if;
  end if;

  -- 4d. CSB-IV Statutory Value Limit check
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
    if v_tenant is not null then
      v_csb_iv_limit := app.get_csb_iv_limit(v_tenant);
    end if;

    if v_inr_value > v_csb_iv_limit then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field', 'csb_type',
        'message', format('Proforma value (%s %s = ₹%s INR) exceeds the statutory CSB-IV limit of ₹%s INR. Commercial CSB-V export is mandatory for shipments exceeding this limit.',
          trim(to_char(v_proforma_total, 'FM999,999,999.00')),
          v_currency,
          trim(to_char(v_inr_value, 'FM999,999,999.00')),
          trim(to_char(v_csb_iv_limit, 'FM999,999,999.00')))));
    end if;
  end if;

  return v_errors;
end;
$$;

