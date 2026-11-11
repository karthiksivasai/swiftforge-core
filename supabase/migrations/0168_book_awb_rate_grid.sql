-- Let a booking use the rate grid when the customer has no rate card.
-- A matching cell is accepted. A grid that has no cell for the weight and zone
-- blocks the booking. A customer with no card and no grid keeps the old message.
-- This is the 0156 booking function with that rate check added.

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
  v_delivery_vendor uuid;
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
  v_fwd text;
  v_dup_awb text;
  v_grid numeric;
  v_dest_country uuid;
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
  v_delivery_vendor := app.resolve_tenant_row_id(
    v_tenant, 'vendors',
    nullif(btrim(coalesce(p_fields->>'delivery_vendor_id','')),'')::uuid,
    p_fields->>'delivery_vendor_code');
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
  v_phone := btrim(coalesce(nullif(v_consignee->>'mobile',''), nullif(v_consignee->>'telephone',''), ''));
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
      select d.country_id into v_dest_country
        from public.destinations d
       where d.id = v_dest and d.tenant_id = v_tenant;
      v_grid := null;
      if v_vendor is not null then
        v_grid := app.resolve_zone_rate_freight(
          v_tenant, v_vendor, v_service, v_zone, v_dest_country,
          coalesce(nullif(p_fields->>'charge_weight', '')::numeric, nullif(p_fields->>'actual_weight', '')::numeric, 0),
          v_as_of, v_customer, v_origin, v_product);
      end if;
      if v_grid is null then
        if v_vendor is not null and exists (
          select 1
            from public.zone_rate_prices p
           where p.tenant_id = v_tenant
             and p.deleted_at is null
             and p.vendor_id = v_vendor
             and upper(btrim(p.service)) = upper(btrim(coalesce(v_service, '')))
             and p.effective_date <= v_as_of
             and (p.customer_id is null or p.customer_id = v_customer)
        ) then
          v_errors := v_errors || jsonb_build_array(jsonb_build_object(
            'field','rate',
            'message','No price in the rate grid for this weight and zone. Nothing was charged.'));
        else
          v_errors := v_errors || jsonb_build_array(jsonb_build_object(
            'field','rate',
            'message','No customer rate was found for this origin, destination, and product'));
        end if;
      end if;
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

  -- FW-12 (Decision D6): Block duplicate non-null forwarding AWB for the same vendor
  v_fwd := nullif(btrim(coalesce(p_fields->>'forwarding_awb','')),'');
  if v_fwd is not null then
    select s.awb_no into v_dup_awb
      from public.shipments s
     where s.tenant_id = v_tenant
       and s.deleted_at is null
       and (p_id is null or s.id <> p_id)
       and coalesce(s.delivery_vendor_id, s.vendor_id) = coalesce(v_delivery_vendor, v_vendor)
       and upper(btrim(s.forwarding_awb)) = upper(v_fwd)
     limit 1;
    if v_dup_awb is not null then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field', 'forwarding_awb',
        'message', format('Forwarding AWB %s is already in use for this vendor on AWB %s', v_fwd, v_dup_awb)));
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
    -- FW-14 (Decision D10): Record old and new forwarding fields in audit log
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
        'pieces', v_before.pieces,
        'forwarding_awb', v_before.forwarding_awb,
        'delivery_awb', v_before.delivery_awb,
        'delivery_vendor_id', v_before.delivery_vendor_id,
        'delivery_service', v_before.delivery_service),
      p_new => jsonb_build_object(
        'awb_no', v_s.awb_no,
        'status', v_s.current_status,
        'charge_weight', v_s.charge_weight,
        'grand_total', v_s.grand_total,
        'pieces', v_s.pieces,
        'product_code', v_product_code,
        'forwarding_awb', v_s.forwarding_awb,
        'delivery_awb', v_s.delivery_awb,
        'delivery_vendor_id', v_s.delivery_vendor_id,
        'delivery_service', v_s.delivery_service));
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
