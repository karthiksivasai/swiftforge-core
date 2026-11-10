-- 0148 Proforma DOX Exemption, Mandatory CSB Type/Export Reason, and Exchange Rate Note

-- 1. Add note column to customs_exchange_rates to track TEST/Official status
alter table public.customs_exchange_rates
  add column if not exists note text default 'TEST - Placeholder rate';

update public.customs_exchange_rates
   set note = 'TEST - Placeholder rate'
 where note is null or note = '';

-- 2. Update app.awb_field_errors(p_fields jsonb)
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

-- 3. Enhance book_awb_shipment to stamp exchange rate metadata onto wizard_extras
create or replace function public.book_awb_shipment(
  p_id uuid,
  p_row_version integer,
  p_fields jsonb,
  p_pieces jsonb default '[]'::jsonb,
  p_charges jsonb default '[]'::jsonb,
  p_comments jsonb default '[]'::jsonb,
  p_attachments jsonb default '[]'::jsonb
)
returns public.shipments
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_errors jsonb := '[]'::jsonb;
  v_s public.shipments;
  v_before public.shipments;
  v_customer uuid;
  v_origin uuid;
  v_dest uuid;
  v_product uuid;
  v_vendor uuid;
  v_branch uuid;
  v_zone uuid;
  v_rate public.customer_rates;
  v_as_of date;
  v_shipper jsonb;
  v_consignee jsonb;
  v_csb text;
  v_reason text;
  v_iec text;
  v_postcode text;
  v_company text;
  v_phone text;
  v_country text;
  v_city text;
  v_address text;
  v_billing uuid;
  v_billing_code text;
  v_branch_state text;
  v_service text;
  v_min numeric;
  v_max numeric;
  v_weight numeric := 0;
  v_elem jsonb;
  v_lock boolean;
  v_product_code text;
  v_currency text;
  v_exchange_rate numeric := 1.0;
  v_exchange_note text := 'TEST - Placeholder rate';
  v_proforma jsonb;
  v_proforma_lines jsonb;
  v_line jsonb;
  v_proforma_total numeric := 0;
  v_inr_value numeric := 0;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  if not app.user_has_permission(v_tenant, 'txn.awb-entry', 'add')
     and not app.user_has_permission(v_tenant, 'txn.awb-entry', 'modify') then
    raise exception 'AWB Entry add or modify permission is required' using errcode = '42501';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'p_fields must be a JSON object' using errcode = '22023';
  end if;

  p_fields := p_fields || jsonb_build_object(
    'reference_no', btrim(coalesce(p_fields->>'reference_no', '')),
    'shipper', app.trim_party(coalesce(p_fields->'shipper', '{}'::jsonb)),
    'consignee', app.trim_party(coalesce(p_fields->'consignee', '{}'::jsonb))
  );

  if p_id is not null then
    select * into v_before
      from public.shipments
     where id = p_id and tenant_id = v_tenant and deleted_at is null;
    if not found then
      raise exception 'Shipment not found' using errcode = 'P0002';
    end if;
    if v_before.is_locked then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field', 'is_locked',
        'message', 'This AWB is locked. An admin has to unlock it before it can be saved.'));
    end if;
  end if;

  v_customer := app.resolve_tenant_row_id(
    v_tenant, 'customers',
    nullif(btrim(coalesce(p_fields->>'customer_id','')),'')::uuid,
    p_fields->>'customer_code');
  v_product := app.resolve_tenant_row_id(
    v_tenant, 'products',
    nullif(btrim(coalesce(p_fields->>'product_id','')),'')::uuid,
    p_fields->>'product_code');
  v_origin := app.resolve_tenant_row_id(
    v_tenant, 'destinations',
    nullif(btrim(coalesce(p_fields->>'origin_destination_id','')),'')::uuid,
    p_fields->>'origin_code');
  v_dest := app.resolve_tenant_row_id(
    v_tenant, 'destinations',
    nullif(btrim(coalesce(p_fields->>'destination_id','')),'')::uuid,
    p_fields->>'destination_code');
  v_vendor := app.resolve_tenant_row_id(
    v_tenant, 'vendors',
    nullif(btrim(coalesce(p_fields->>'vendor_id','')),'')::uuid,
    p_fields->>'vendor_code');
  v_branch := app.resolve_tenant_row_id(
    v_tenant, 'branches',
    nullif(btrim(coalesce(p_fields->>'branch_id','')),'')::uuid,
    p_fields->>'branch_code');
  if v_branch is null then
    select u.home_branch_id into v_branch
      from public.users u
     where u.tenant_id = v_tenant and u.auth_user_id = auth.uid() and u.deleted_at is null
     limit 1;
  end if;
  if v_branch is null then
    select id into v_branch from public.branches
     where tenant_id = v_tenant and deleted_at is null
     order by is_head_office desc, code limit 1;
  end if;

  if v_customer is null then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('field','customer_id','message','Customer is required'));
  end if;
  if v_origin is null then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('field','origin','message','Origin is required'));
  end if;
  if v_dest is null then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('field','destination','message','Destination is required'));
  end if;
  if v_product is null then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('field','product_id','message','Product is required'));
  end if;
  if p_pieces is null or jsonb_typeof(p_pieces) <> 'array' or jsonb_array_length(p_pieces) < 1 then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('field','pieces','message','At least one shipment piece is required'));
  end if;

  v_shipper := coalesce(p_fields->'shipper', '{}'::jsonb);
  v_consignee := coalesce(p_fields->'consignee', '{}'::jsonb);
  v_service := nullif(btrim(coalesce(p_fields->>'service','')), '');
  if v_vendor is not null and v_service is null then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('field','service','message','Service is required'));
  end if;

  v_company := btrim(coalesce(v_consignee->>'company_name', v_consignee->>'name', ''));
  v_address := btrim(coalesce(v_consignee->>'address1', ''));
  v_city := btrim(coalesce(v_consignee->>'city', ''));
  v_postcode := btrim(coalesce(v_consignee->>'pincode', ''));
  v_country := btrim(coalesce(v_consignee->>'country', ''));
  v_phone := btrim(coalesce(v_consignee->>'mobile', v_consignee->>'telephone', ''));
  if v_company = '' then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('field','consignee_company','message','Consignee company name is required'));
  end if;
  if v_address = '' then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('field','consignee_address1','message','Consignee address 1 is required'));
  end if;
  if v_city = '' then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('field','consignee_city','message','Consignee city is required'));
  end if;
  if v_postcode = '' then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('field','consignee_postcode','message','Consignee postcode is required'));
  elsif v_postcode !~ '^[A-Za-z0-9][A-Za-z0-9 -]{0,15}$' then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field','consignee_postcode',
      'message','Consignee postcode can use letters, numbers, spaces, and hyphens only'));
  end if;
  if v_country = '' then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('field','consignee_country','message','Consignee country is required'));
  end if;
  if v_phone = '' then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('field','consignee_phone','message','Consignee phone is required'));
  end if;

  if v_customer is not null then
    select coalesce(c.billing_state_id, c.state_id) into v_billing
      from public.customers c
     where c.id = v_customer and c.tenant_id = v_tenant;
    if v_billing is null then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field','billing_state',
        'message','Customer billing state is required. Set it on the customer before saving this AWB.'));
    else
      select s.code into v_billing_code
        from public.states s
       where s.id = v_billing and s.tenant_id = v_tenant;
      if nullif(btrim(coalesce(v_billing_code, '')), '') is null then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'field','billing_state',
          'message','Customer billing state is required. Set it on the customer before saving this AWB.'));
      end if;
    end if;
  end if;

  if v_branch is null then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field','branch','message','Branch is required before GST can be calculated.'));
  else
    select b.state_code into v_branch_state
      from public.branches b
     where b.id = v_branch and b.tenant_id = v_tenant;
    if nullif(btrim(coalesce(v_branch_state, '')), '') is null then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field','branch_state',
        'message','Branch state is required before GST can be calculated. Set the branch state and try again.'));
    end if;
  end if;

  if v_customer is not null and v_product is not null and v_origin is not null and v_dest is not null then
    begin
      v_as_of := coalesce((p_fields->>'book_date')::date, current_date);
    exception when others then
      v_as_of := current_date;
    end;
    v_zone := app.resolve_rating_zone(
      v_tenant, v_origin, v_dest, v_vendor, v_product, v_service, v_as_of);
    v_rate := app.resolve_customer_rate(
      v_tenant, v_customer, v_product, v_service, v_origin, v_dest, v_zone, v_as_of);
    if v_rate is null or v_rate.id is null then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field','rate',
        'message','No customer rate was found for this origin, destination, and product'));
    end if;
  end if;

  if v_vendor is not null and v_service is not null and jsonb_typeof(p_pieces) = 'array' then
    for v_elem in select * from jsonb_array_elements(p_pieces)
    loop
      v_weight := v_weight + greatest(
        coalesce(nullif(v_elem->>'actual_weight_per_pc','')::numeric, 0)
          * greatest(coalesce(nullif(v_elem->>'pieces','')::numeric, 1), 1),
        round(coalesce(app.piece_volumetric_kg(
          nullif(v_elem->>'length','')::numeric,
          nullif(v_elem->>'breadth','')::numeric,
          nullif(v_elem->>'height','')::numeric,
          greatest(coalesce(nullif(v_elem->>'pieces','')::integer, 1), 1),
          v_elem->>'measurement_unit',
          5000, 305), 0), 3));
    end loop;
    select sm.min_weight, sm.max_weight into v_min, v_max
      from public.service_mappings sm
     where sm.tenant_id = v_tenant
       and sm.vendor_id = v_vendor
       and sm.deleted_at is null
       and sm.status = 'ACTIVE'
       and upper(sm.service) = upper(v_service)
     limit 1;
    if v_max is not null and v_weight > v_max then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field','charge_weight',
        'message', format('Charge weight %s kg is above the %s maximum of %s kg', v_weight, v_service, v_max)));
    end if;
    if v_min is not null and v_weight > 0 and v_weight < v_min then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field','charge_weight',
        'message', format('Charge weight %s kg is below the %s minimum of %s kg', v_weight, v_service, v_min)));
    end if;
  end if;

  -- Customs and field validation gates
  v_errors := v_errors || app.awb_field_errors(p_fields);
  if jsonb_array_length(v_errors) > 0 then
    raise exception 'Booking validation failed: %', v_errors::text using errcode = 'CMS04';
  end if;

  -- Compute and stamp customs exchange rate metadata on wizard_extras.proforma
  v_proforma := coalesce(p_fields->'wizard_extras'->'proforma', '{}'::jsonb);
  v_currency := upper(btrim(coalesce(v_proforma->>'currency', 'INR')));
  begin
    v_as_of := coalesce((p_fields->>'book_date')::date, current_date);
  exception when others then
    v_as_of := current_date;
  end;

  v_exchange_rate := app.get_customs_exchange_rate(v_currency, v_as_of);
  select coalesce(r.note, 'TEST - Placeholder rate') into v_exchange_note
    from public.customs_exchange_rates r
   where r.currency = v_currency
     and v_as_of between r.valid_from and r.valid_to
   limit 1;

  v_proforma_lines := coalesce(v_proforma->'lines', '[]'::jsonb);
  for v_line in select * from jsonb_array_elements(v_proforma_lines)
  loop
    v_proforma_total := v_proforma_total + (app.to_numeric(v_line->>'quantity') * app.to_numeric(v_line->>'rate'));
  end loop;
  v_inr_value := round(v_proforma_total * v_exchange_rate, 2);

  v_proforma := v_proforma || jsonb_build_object(
    'exchangeRate', v_exchange_rate,
    'exchangeRateDate', v_as_of::text,
    'exchangeRateNote', coalesce(v_exchange_note, 'TEST - Placeholder rate'),
    'inrAmount', v_inr_value
  );

  p_fields := jsonb_set(
    p_fields,
    '{wizard_extras,proforma}',
    v_proforma,
    true
  );

  v_lock := coalesce((p_fields->>'is_locked')::boolean, false);
  v_s := public.save_shipment(
    p_id, p_row_version, p_fields || jsonb_build_object('is_locked', false),
    p_pieces, p_charges, p_comments, p_attachments);

  perform app.recalculate_shipment_weights(v_s.id);
  select * into v_s from public.shipments where id = v_s.id;

  select upper(p.code) into v_product_code
    from public.products p where p.id = v_s.product_id;

  if v_s.charge_weight is not null and v_s.vendor_id is not null and v_s.service is not null then
    select sm.min_weight, sm.max_weight into v_min, v_max
      from public.service_mappings sm
     where sm.tenant_id = v_s.tenant_id
       and sm.vendor_id = v_s.vendor_id
       and sm.deleted_at is null
       and sm.status = 'ACTIVE'
       and upper(sm.service) = upper(v_s.service)
     limit 1;
    if v_max is not null and v_s.charge_weight > v_max then
      raise exception 'Booking validation failed: %',
        jsonb_build_array(jsonb_build_object(
          'field','charge_weight',
          'message', format('Charge weight %s kg is above the %s maximum of %s kg', v_s.charge_weight, v_s.service, v_max)))::text
        using errcode = 'CMS04';
    end if;
  end if;

  if v_s.current_status = 'DRAFT' then
    v_s := public.confirm_booking(v_s.id, v_s.row_version);
  else
    perform app.run_shipment_rating(v_s.id, true);
    select * into v_s from public.shipments where id = v_s.id;
    perform app.write_audit_log(
      p_tenant_id => v_s.tenant_id,
      p_entity_type => 'shipments',
      p_action => 'MODIFY',
      p_entity_id => v_s.id,
      p_module_slug => 'txn.awb-entry',
      p_old => jsonb_build_object(
        'awb_no', v_before.awb_no,
        'status', v_before.current_status,
        'charge_weight', v_before.charge_weight,
        'grand_total', v_before.grand_total,
        'pieces', v_before.pieces),
      p_new => jsonb_build_object(
        'awb_no', v_s.awb_no,
        'status', v_s.current_status,
        'charge_weight', v_s.charge_weight,
        'grand_total', v_s.grand_total,
        'pieces', v_s.pieces,
        'product_code', v_product_code));
  end if;

  perform app.apply_booked_money(v_s.id);
  perform app.price_manual_charges(v_s.id, p_charges);

  if v_lock then
    update public.shipments set is_locked = true, updated_by = auth.uid()
     where id = v_s.id;
    perform app.write_audit_log(
      p_tenant_id => v_s.tenant_id, p_entity_type => 'shipments', p_action => 'MODIFY',
      p_entity_id => v_s.id, p_module_slug => 'txn.awb-entry',
      p_new => jsonb_build_object('awb_no', v_s.awb_no, 'is_locked', true, 'change', 'lock'));
  end if;

  select * into v_s from public.shipments where id = v_s.id;
  return v_s;
end;
$$;
