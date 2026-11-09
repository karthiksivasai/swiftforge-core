-- Manual charge fuel and GST are calculated here. A typed AWB must be a
-- number from the branch manual series. Field executives come from the
-- database, and party text is limited before the row is stored.

create or replace function app.trim_party(p_party jsonb)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'origin_code', btrim(coalesce(p_party->>'origin_code', '')),
    'origin_name', btrim(coalesce(p_party->>'origin_name', '')),
    'origin_id', p_party->'origin_id',
    'company_code', btrim(coalesce(p_party->>'company_code', '')),
    'company_name', btrim(coalesce(p_party->>'company_name', '')),
    'company_id', p_party->'company_id',
    'contact_name', btrim(coalesce(p_party->>'contact_name', '')),
    'address1', btrim(coalesce(p_party->>'address1', '')),
    'address2', btrim(coalesce(p_party->>'address2', '')),
    'pincode', btrim(coalesce(p_party->>'pincode', '')),
    'city', btrim(coalesce(p_party->>'city', '')),
    'state', btrim(coalesce(p_party->>'state', '')),
    'telephone', btrim(coalesce(p_party->>'telephone', '')),
    'mobile', btrim(coalesce(p_party->>'mobile', '')),
    'email', btrim(coalesce(p_party->>'email', '')),
    'country', btrim(coalesce(p_party->>'country', '')),
    'iec_no', btrim(coalesce(p_party->>'iec_no', '')),
    'document_type', btrim(coalesce(p_party->>'document_type', '')),
    'document_no', btrim(coalesce(p_party->>'document_no', ''))
  );
$$;

create or replace function app.awb_field_errors(p_fields jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_errors jsonb := '[]'::jsonb;
  v_party jsonb;
  v_role text;
  v_email text;
  v_mobile text;
  v_country text;
  v_iec text;
  v_delivery text;
  v_booked text;
begin
  if length(btrim(coalesce(p_fields->>'reference_no', ''))) > 30 then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field', 'reference_no', 'message', 'Reference No. cannot be longer than 30 characters'));
  end if;

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
    v_mobile := btrim(coalesce(v_party->>'mobile', ''));
    v_country := upper(btrim(coalesce(v_party->>'country', '')));
    if v_role = 'shipper' and v_mobile <> '' and (v_country = '' or v_country in ('INDIA', 'IN'))
       and v_mobile !~ '^[0-9]{10}$' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('field', 'shipper_mobile', 'message', 'Shipper mobile must be 10 digits'));
    end if;
    v_iec := btrim(coalesce(v_party->>'iec_no', ''));
    if v_iec <> '' and v_iec !~ '^[A-Za-z0-9]{10}$' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('field', v_role, 'message', initcap(v_role) || ' IEC must be 10 letters or numbers'));
    end if;
  end loop;

  if upper(btrim(coalesce(p_fields->>'payment_type', ''))) = 'CASH' then
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

  return v_errors;
end
$$;

create or replace function app.claim_awb_no(
  p_tenant uuid,
  p_branch uuid,
  p_fin_year uuid,
  p_requested text
)
returns text
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_requested text := nullif(btrim(coalesce(p_requested, '')), '');
  v_alloc record;
  v_awb text;
  v_tries integer := 0;
  v_series public.branch_awb_allotments%rowtype;
  v_width integer;
  v_number bigint;
begin
  if p_tenant is null then
    raise exception 'Tenant is required to allocate an AWB' using errcode = '22023';
  end if;

  if v_requested is not null then
    if v_requested !~ '^[0-9]+$' then
      raise exception 'Manual AWB must be numbers only' using errcode = '22023';
    end if;

    select * into v_series
      from public.branch_awb_allotments a
     where a.tenant_id = p_tenant
       and a.branch_id = p_branch
       and a.series_type = 'MANUAL'
       and a.is_active
       and a.deleted_at is null
       and a.status = 'ACTIVE'
     order by a.start_no
     limit 1;
    if v_series.id is null then
      raise exception 'This branch has no manual AWB series' using errcode = '22023';
    end if;

    v_width := length(v_series.end_no::text);
    if length(v_requested) <> v_width then
      raise exception 'Manual AWB must be % digits', v_width using errcode = '22023';
    end if;
    v_number := v_requested::bigint;
    if v_number < v_series.start_no or v_number > v_series.end_no then
      raise exception 'Manual AWB % is outside this branch series % to %',
        v_requested, v_series.start_no, v_series.end_no
        using errcode = '22023';
    end if;
    if exists (
      select 1 from public.shipments s
       where s.tenant_id = p_tenant
         and upper(s.awb_no) = upper(v_requested)
         and s.deleted_at is null
    ) then
      raise exception 'AWB % is already used by another shipment', v_requested
        using errcode = '23505';
    end if;
    return v_requested;
  end if;

  loop
    v_tries := v_tries + 1;
    if v_tries > 10000 then
      raise exception 'No free AWB number is left in this series' using errcode = 'CMS03';
    end if;
    select * into v_alloc
      from app.allocate_document_no(p_tenant, 'AWB', p_branch, p_fin_year);
    v_awb := v_alloc.formatted_no;
    exit when not exists (
      select 1 from public.shipments s
       where s.tenant_id = p_tenant and s.awb_no = v_awb and s.deleted_at is null
    );
  end loop;
  return v_awb;
end
$$;

create or replace function public.validate_manual_awb(
  p_branch_id uuid,
  p_awb_no text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_clean text := btrim(coalesce(p_awb_no, ''));
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not app.user_has_permission(v_tenant, 'txn.awb-entry', 'list')
     and not app.user_has_permission(v_tenant, 'txn.awb-entry', 'search') then
    raise exception 'AWB Entry permission is required' using errcode = '42501';
  end if;
  if v_clean = '' then
    return jsonb_build_object('valid', false, 'message', 'AWB Number is required');
  end if;
  begin
    perform app.claim_awb_no(v_tenant, p_branch_id, null, v_clean);
  exception when others then
    return jsonb_build_object('valid', false, 'message', sqlerrm);
  end;
  -- claim_awb_no only checks. It does not consume a number when called this way,
  -- because the number is returned and no shipment row is written.
  return jsonb_build_object('valid', true, 'awb_no', v_clean, 'message', 'AWB ' || v_clean || ' is available for manual booking');
end
$$;

revoke all on function public.validate_manual_awb(uuid, text) from public;
grant execute on function public.validate_manual_awb(uuid, text) to authenticated, service_role;

create or replace function app.price_manual_charges(p_shipment uuid, p_charges jsonb)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_s public.shipments;
  v_elem jsonb;
  v_desc text;
  v_side text;
  v_kind text;
  v_amount numeric;
  v_fuel_on boolean;
  v_tax_on boolean;
  v_tax_fuel boolean;
  v_fuel_pct numeric;
  v_fuel numeric;
  v_taxable numeric;
  v_use_igst boolean;
  v_igst_pct numeric;
  v_cgst_pct numeric;
  v_sgst_pct numeric;
  v_igst numeric;
  v_cgst numeric;
  v_sgst numeric;
  v_tax numeric;
  v_total numeric;
  v_seq integer;
  v_extra numeric := 0;
  v_extra_fuel numeric := 0;
  v_extra_tax numeric := 0;
  v_as_of date;
  v_grand numeric;
begin
  select * into v_s from public.shipments where id = p_shipment;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;
  if p_charges is null or jsonb_typeof(p_charges) <> 'array' then
    return;
  end if;

  v_as_of := coalesce(v_s.book_date, current_date);
  select coalesce(max(seq), 0) into v_seq
    from public.shipment_charge_snapshots
   where shipment_id = v_s.id and tenant_id = v_s.tenant_id;

  for v_elem in select * from jsonb_array_elements(p_charges)
  loop
    v_desc := btrim(coalesce(v_elem->>'description', ''));
    v_side := upper(coalesce(nullif(btrim(v_elem->>'side'), ''), 'CUSTOMER'));
    v_kind := upper(coalesce(v_elem->>'charges_type', 'MANUAL'));
    if v_desc = '' or v_side <> 'CUSTOMER' or upper(v_desc) = 'FREIGHT' or v_kind = 'SYSTEM' then
      continue;
    end if;
    v_amount := round(coalesce(nullif(btrim(coalesce(v_elem->>'amount', '')), '')::numeric, 0), 2);
    if v_amount <= 0 then
      continue;
    end if;
    v_fuel_on := coalesce((v_elem->>'fuel_applies')::boolean, false);
    v_tax_on := coalesce((v_elem->>'tax_applies')::boolean, false);
    v_tax_fuel := coalesce((v_elem->>'tax_on_fuel')::boolean, false);
    v_fuel_pct := 0;
    if v_fuel_on then
      v_fuel_pct := coalesce(app.resolve_fuel_pct(
        v_s.tenant_id, v_s.customer_id, v_s.vendor_id, v_s.product_id,
        v_s.destination_id, v_as_of, null), 0);
    end if;
    v_fuel := case when v_fuel_on then round(v_amount * v_fuel_pct / 100.0, 2) else 0 end;
    v_taxable := (case when v_tax_on then v_amount else 0 end) + (case when v_tax_fuel then v_fuel else 0 end);
    v_igst := 0; v_cgst := 0; v_sgst := 0; v_tax := 0;
    if v_taxable > 0 then
      select r.o_use_igst, r.o_igst, r.o_cgst, r.o_sgst
        into v_use_igst, v_igst_pct, v_cgst_pct, v_sgst_pct
        from app.resolve_tax_pcts(
          v_s.tenant_id, v_s.customer_id, v_s.product_id, v_s.branch_id, v_as_of) as r;
      select g.o_igst, g.o_cgst, g.o_sgst, g.o_tax
        into v_igst, v_cgst, v_sgst, v_tax
        from app.split_gst(v_taxable, v_use_igst, v_igst_pct, v_cgst_pct, v_sgst_pct) as g;
    end if;
    v_total := v_amount + v_fuel + v_tax;
    v_seq := v_seq + 1;
    insert into public.shipment_charge_snapshots (
      tenant_id, shipment_id, seq, side, description, rate, amount,
      fuel_applies, fuel_amount, tax_applies, tax_on_fuel,
      igst, sgst, cgst, total, charges_type, created_by, updated_by)
    values (
      v_s.tenant_id, v_s.id, v_seq, 'CUSTOMER', v_desc, v_amount, v_amount,
      v_fuel_on, v_fuel, v_tax_on, v_tax_fuel,
      v_igst, v_sgst, v_cgst, v_total, 'MANUAL', auth.uid(), auth.uid());
    v_extra := v_extra + v_total;
    v_extra_fuel := v_extra_fuel + v_fuel;
    v_extra_tax := v_extra_tax + v_tax;
  end loop;

  v_grand := round(coalesce(v_s.grand_total, 0) + v_extra, 2);
  if coalesce(v_s.amount_received, 0) > v_grand then
    raise exception 'Amount received cannot be more than the total' using errcode = '22023';
  end if;

  update public.shipments set
    grand_total = v_grand,
    customer_charges_total = round(coalesce(customer_charges_total, 0) + v_extra, 2),
    fuel_amount = round(coalesce(fuel_amount, 0) + v_extra_fuel, 2),
    tax_amount = round(coalesce(tax_amount, 0) + v_extra_tax, 2),
    balance_amount = v_grand - coalesce(amount_received, 0),
    updated_by = auth.uid()
  where id = v_s.id;
end
$$;

create or replace function public.lookup_field_executives(
  p_q text default null,
  p_branch uuid default null,
  p_location text default null,
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
  v_pat text := '%' || replace(replace(coalesce(btrim(p_q), ''), '%', ''), '_', '') || '%';
  v_location text := nullif(upper(btrim(coalesce(p_location, ''))), '');
begin
  if app.current_user_id() is null then
    return;
  end if;

  return query
    select fe.id, fe.code, fe.name, sc.code
      from public.field_executives fe
      left join public.service_centers sc on sc.id = fe.service_center_id
     where fe.tenant_id in (select app.user_tenant_ids())
       and fe.deleted_at is null
       and coalesce(fe.in_active, false) = false
       and (
         coalesce(btrim(p_q), '') = ''
         or fe.name ilike v_pat
         or fe.code ilike v_pat
       )
       and (
         fe.service_center_id is null
         or fe.service_center_id = p_branch
         or (v_location is not null and upper(coalesce(sc.code, '')) = v_location)
         or exists (
           select 1 from public.branches b
            where b.id = p_branch
              and b.deleted_at is null
              and upper(b.code) = upper(coalesce(sc.code, ''))
         )
       )
     order by fe.name, fe.code, fe.id
     limit v_limit;
end
$$;

revoke all on function public.lookup_field_executives(text, uuid, text, integer) from public;
grant execute on function public.lookup_field_executives(text, uuid, text, integer) to authenticated, service_role;

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
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
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

  v_csb := upper(coalesce(p_fields->'wizard_extras'->'proforma'->>'csbType', ''));
  v_reason := upper(coalesce(p_fields->'wizard_extras'->'proforma'->>'exportReason', ''));
  if coalesce((p_fields->>'is_commercial')::boolean, false) or v_csb in ('CSB 5', 'COMMERCIAL', 'CBE XIII') then
    v_iec := btrim(coalesce(
      v_shipper->>'iec_no', v_shipper->>'iecNo',
      case when upper(coalesce(v_shipper->>'document_type', v_shipper->>'documentType', '')) = 'IEC'
           then coalesce(v_shipper->>'document_no', v_shipper->>'documentNo')
           else null end, ''));
    if v_iec = '' or v_iec !~* '^[A-Z0-9]{10}$' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field','shipper_iec',
        'message','Valid 10-character alphanumeric IEC is required on Shipper for CSB-V / Commercial export'));
    end if;
  end if;
  if v_csb in ('CSB 4', 'CSB 3', 'ECM SPX') and v_reason = 'SALE' then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field','csb_type',
      'message','Commercial export reason "SALE" must be filed under CSB-V or COMMERCIAL, not CSB-IV/III'));
  elsif v_csb in ('CSB 5', 'COMMERCIAL') and v_reason in ('BONAFIDE GIFT', 'UNSOLICITED GIFT - NOT FOR SALE') then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field','csb_type',
      'message','Non-commercial gift exports cannot be filed under commercial CSB-V'));
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

  v_errors := v_errors || app.awb_field_errors(p_fields);
  if jsonb_array_length(v_errors) > 0 then
    raise exception 'Booking validation failed: %', v_errors::text using errcode = 'CMS04';
  end if;

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
end
$$;

notify pgrst, 'reload schema';
