-- 0145  AWB series split, booking permission, freight tax-on-fuel flag.
-- AUTO numbers come from the branch allotment, 100001-499999.
-- MANUAL numbers stay 500001-899999. The two ranges cannot overlap.
-- Existing AWBs 000028-000043 are below 100001 and are left as they are.

update public.branch_awb_allotments
   set start_no = 100001,
       end_no = 499999
 where series_type = 'AUTO'
   and deleted_at is null
   and (start_no <> 100001 or end_no <> 499999);

update public.branch_awb_allotments
   set start_no = 500001,
       end_no = 899999
 where series_type = 'MANUAL'
   and deleted_at is null
   and start_no < 500001
   and end_no > 499999;

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
  v_awb text;
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
      select 1 from public.branch_awb_allotments a
       where a.tenant_id = p_tenant
         and a.branch_id = p_branch
         and a.series_type = 'AUTO'
         and a.deleted_at is null
         and a.is_active
         and v_number between a.start_no and a.end_no
    ) then
      raise exception 'Manual AWB % overlaps the auto series', v_requested
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

  if p_branch is null then
    raise exception 'Branch is required to allocate an AWB' using errcode = '22023';
  end if;

  select * into v_series
    from public.branch_awb_allotments a
   where a.tenant_id = p_tenant
     and a.branch_id = p_branch
     and a.series_type = 'AUTO'
     and a.is_active
     and a.deleted_at is null
     and a.status = 'ACTIVE'
   order by a.start_no
   limit 1
   for update;
  if v_series.id is null then
    raise exception 'This branch has no auto AWB series' using errcode = 'CMS03';
  end if;
  if v_series.start_no > v_series.end_no
     or v_series.start_no < 100001
     or v_series.end_no > 499999 then
    raise exception 'Auto AWB series must stay inside 100001 to 499999'
      using errcode = '22023';
  end if;
  if exists (
    select 1 from public.branch_awb_allotments m
     where m.tenant_id = p_tenant
       and m.branch_id = p_branch
       and m.series_type = 'MANUAL'
       and m.deleted_at is null
       and m.is_active
       and m.start_no <= v_series.end_no
       and m.end_no >= v_series.start_no
  ) then
    raise exception 'AUTO and MANUAL AWB series overlap for this branch'
      using errcode = '22023';
  end if;

  v_width := length(v_series.end_no::text);
  select coalesce(max(s.awb_no::bigint), v_series.start_no - 1) + 1
    into v_number
    from public.shipments s
   where s.tenant_id = p_tenant
     and s.deleted_at is null
     and s.awb_no ~ '^[0-9]+$'
     and length(s.awb_no) = v_width
     and s.awb_no::bigint between v_series.start_no and v_series.end_no;

  loop
    if v_number > v_series.end_no then
      update public.branch_awb_allotments
         set status = 'EXHAUSTED'
       where id = v_series.id;
      raise exception 'No free AWB number is left in this series' using errcode = 'CMS03';
    end if;
    v_awb := lpad(v_number::text, v_width, '0');
    exit when not exists (
      select 1 from public.shipments s
       where s.tenant_id = p_tenant and s.awb_no = v_awb and s.deleted_at is null
    );
    v_number := v_number + 1;
  end loop;

  if v_number < 100001 or v_number > 499999 or v_number between 500001 and 899999 then
    raise exception 'Auto AWB % is outside 100001 to 499999', v_awb using errcode = '22023';
  end if;
  if exists (
    select 1 from public.branch_awb_allotments m
     where m.tenant_id = p_tenant
       and m.branch_id = p_branch
       and m.series_type = 'MANUAL'
       and m.deleted_at is null
       and m.is_active
       and v_number between m.start_no and m.end_no
  ) then
    raise exception 'Auto AWB % overlaps the manual series', v_awb using errcode = '22023';
  end if;

  update public.branch_awb_allotments
     set used_count = used_count + 1
   where id = v_series.id;
  return v_awb;
end
$$;

create or replace function public.confirm_booking(
  p_id          uuid,
  p_row_version integer
)
returns public.shipments
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_s      public.shipments;
  v_errors jsonb;
  v_alloc  record;
  v_fy     uuid;
  v_awb    text;
  v_pickup public.pickups;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not app.user_has_permission(v_tenant, 'txn.awb-entry', 'modify') then
    raise exception 'Permission denied: txn.awb-entry modify' using errcode = '42501';
  end if;

  select * into v_s from public.shipments
    where id = p_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;

  perform app.assert_status_transition('SHIPMENT', v_s.current_status, 'BOOKED');

  v_errors := app.validate_shipment_for_booking(v_s);
  if jsonb_array_length(v_errors) > 0 then
    raise exception 'Booking validation failed: %', v_errors::text
      using errcode = 'CMS04';
  end if;

  v_awb := nullif(btrim(coalesce(v_s.awb_no, '')), '');
  if v_awb is null then
    select fy.id into v_fy
      from public.financial_years fy
     where fy.tenant_id = v_tenant and fy.deleted_at is null and fy.is_active
       and (fy.branch_id is not distinct from v_s.branch_id or fy.branch_id is null)
     order by case when fy.branch_id = v_s.branch_id then 0 else 1 end, fy.from_date desc
     limit 1;
    v_awb := app.claim_awb_no(v_tenant, v_s.branch_id, v_fy, null);
  end if;

  update public.shipments set
    awb_no = v_awb,
    current_status = 'BOOKED',
    status_at = now(),
    booked_at = now(),
    booked_by = auth.uid(),
    updated_by = auth.uid()
  where id = p_id and tenant_id = v_tenant and deleted_at is null
    and row_version = p_row_version
  returning * into v_s;

  if not found then
    raise exception 'This record was changed by someone else. Reload and try again.'
      using errcode = '40001';
  end if;

  -- Server-authoritative rating at booking (never trust client totals)
  perform app.run_shipment_rating(v_s.id, true);
  select * into v_s from public.shipments
   where id = p_id and tenant_id = v_tenant;

  if v_s.pickup_id is not null then
    select * into v_pickup from public.pickups
      where id = v_s.pickup_id and tenant_id = v_tenant and deleted_at is null
      for update;
    if found then
      if v_pickup.status = 'ASSIGNED' then
        perform app.assert_status_transition('PICKUP', v_pickup.status, 'PICKED');
        update public.pickups set
          status = 'PICKED',
          awb_id = v_s.id,
          awb_no = v_s.awb_no,
          edited_by = auth.uid(),
          updated_by = auth.uid()
        where id = v_pickup.id and tenant_id = v_tenant;
      elsif v_pickup.status in ('PICKED', 'CONFIRMED') then
        update public.pickups set
          awb_id = coalesce(awb_id, v_s.id),
          awb_no = coalesce(nullif(btrim(coalesce(awb_no,'')),''), v_s.awb_no),
          edited_by = auth.uid(),
          updated_by = auth.uid()
        where id = v_pickup.id and tenant_id = v_tenant;
      end if;
    end if;
  end if;

  perform app.append_shipment_event(
    v_tenant, v_s.id, 'BOOKED', 'Shipment Booked',
    jsonb_build_object(
      'awb_no', v_s.awb_no,
      'pickup_id', v_s.pickup_id,
      'grand_total', v_s.grand_total
    ));

  perform app.write_audit_log(
    p_tenant_id => v_tenant, p_entity_type => 'shipments', p_action => 'MODIFY',
    p_entity_id => v_s.id, p_module_slug => 'txn.awb-entry',
    p_new => jsonb_build_object('status', 'BOOKED', 'awb_no', v_s.awb_no,
                                'pickup_id', v_s.pickup_id,
                                'grand_total', v_s.grand_total));

  return v_s;
end
$$;

create or replace function public.get_shipment_document(
  p_shipment_id uuid,
  p_document_type text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_row public.shipment_documents;
  v_available boolean;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context' using errcode = '42501';
  end if;

  if not app.user_has_permission(v_tenant, 'txn.awb-entry', 'list')
     and not app.user_has_permission(v_tenant, 'txn.awb-entry', 'search') then
    raise exception 'AWB Entry permission is required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.shipments
    where id = p_shipment_id and tenant_id = v_tenant and deleted_at is null
  ) then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;

  select * into v_row
  from public.shipment_documents d
  where d.tenant_id = v_tenant
    and d.shipment_id = p_shipment_id
    and d.document_type = upper(btrim(p_document_type))
    and d.deleted_at is null
  order by d.version desc, d.created_at desc
  limit 1;

  if not found then
    return null;
  end if;

  v_available :=
    coalesce(v_row.raw_meta->>'placeholder', '') <> 'true'
    and coalesce(v_row.raw_meta->>'sandbox', '') <> 'true'
    and coalesce(v_row.raw_meta->>'generator', '') not like 'internal-authority%'
    and (
      nullif(btrim(coalesce(v_row.file_url, '')), '') is not null
      or (
        v_row.content_b64 is not null
        and (
          v_row.source = 'USER_UPLOAD'
          or (
            length(v_row.content_b64) > 900
            and (
              upper(btrim(p_document_type)) <> 'AUTHORITY_LETTER'
              or v_row.source = 'VENDOR'
            )
          )
        )
      )
    );

  if not v_available then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'type', v_row.document_type,
    'source', v_row.source,
    'vendor', v_row.vendor,
    'fileName', v_row.file_name,
    'url', v_row.file_url,
    'content_b64', v_row.content_b64,
    'mimeType', coalesce(v_row.mime_type, 'application/pdf'),
    'fileSize', v_row.file_size,
    'version', v_row.version,
    'status', 'AVAILABLE',
    'createdAt', v_row.created_at,
    'available', true
  );
end;
$$
;


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
  v_tenant uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_pat text := '%' || replace(replace(coalesce(btrim(p_q), ''), '%', ''), '_', '') || '%';
  v_location text := nullif(upper(btrim(coalesce(p_location, ''))), '');
begin
  if app.current_user_id() is null then
    return;
  end if;
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not app.user_has_permission(v_tenant, 'txn.awb-entry', 'list')
     and not app.user_has_permission(v_tenant, 'txn.awb-entry', 'search') then
    raise exception 'AWB Entry permission is required' using errcode = '42501';
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


create or replace function app.apply_booked_money(p_shipment uuid)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_s public.shipments;
  v_zone uuid;
  v_weight numeric;
  v_freight numeric := 0;
  v_fuel_pct numeric := 0;
  v_fuel numeric := 0;
  v_use_igst boolean := true;
  v_igst_pct numeric := 0;
  v_cgst_pct numeric := 0;
  v_sgst_pct numeric := 0;
  v_igst numeric := 0;
  v_cgst numeric := 0;
  v_sgst numeric := 0;
  v_tax numeric := 0;
  v_taxable numeric := 0;
  v_grand numeric := 0;
  v_total numeric := 0;
  v_as_of date;
begin
  select * into v_s from public.shipments where id = p_shipment;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;

  v_as_of := coalesce(v_s.book_date, current_date);

  v_taxable := round(coalesce(v_s.grand_total, 0) - coalesce(v_s.tax_amount, 0), 2);
  select r.o_use_igst, r.o_igst, r.o_cgst, r.o_sgst
    into v_use_igst, v_igst_pct, v_cgst_pct, v_sgst_pct
    from app.resolve_tax_pcts(
      v_s.tenant_id, v_s.customer_id, v_s.product_id, v_s.branch_id, v_as_of) as r;
  select g.o_igst, g.o_cgst, g.o_sgst, g.o_tax
    into v_igst, v_cgst, v_sgst, v_tax
    from app.split_gst(v_taxable, v_use_igst, v_igst_pct, v_cgst_pct, v_sgst_pct) as g;
  v_grand := v_taxable + v_tax;

  update public.shipment_charge_snapshots set
    igst = v_igst,
    cgst = v_cgst,
    sgst = v_sgst,
    tax_on_fuel = true,
    total = coalesce(amount, 0) + coalesce(fuel_amount, 0) + v_tax,
    updated_by = auth.uid()
  where tenant_id = v_s.tenant_id
    and shipment_id = v_s.id
    and side = 'CUSTOMER'
    and upper(description) = 'FREIGHT';

  update public.shipments set
    tax_amount = v_tax,
    grand_total = v_grand,
    updated_by = auth.uid()
  where id = v_s.id;

  v_weight := app.vendor_chargeable_weight(v_s.id);
  v_zone := app.resolve_rating_zone(
    v_s.tenant_id, v_s.origin_destination_id, v_s.destination_id,
    v_s.vendor_id, v_s.product_id, v_s.service, v_as_of);

  v_igst := 0; v_cgst := 0; v_sgst := 0; v_tax := 0;
  if v_s.vendor_id is not null then
    v_freight := coalesce(app.compute_vendor_cost(
      v_s.tenant_id, v_s.vendor_id, v_s.product_id,
      v_s.origin_destination_id, v_s.destination_id, v_zone,
      v_s.service, v_weight, v_as_of), 0);
    v_fuel_pct := coalesce(app.resolve_fuel_pct(
      v_s.tenant_id, v_s.customer_id, v_s.vendor_id, v_s.product_id,
      v_s.destination_id, v_as_of, null), 0);
    v_fuel := round(v_freight * v_fuel_pct / 100.0, 2);

    select r.o_use_igst, r.o_igst, r.o_cgst, r.o_sgst
      into v_use_igst, v_igst_pct, v_cgst_pct, v_sgst_pct
      from app.resolve_tax_pcts(
        v_s.tenant_id, v_s.customer_id, v_s.product_id, v_s.branch_id, v_as_of) as r;

    select g.o_igst, g.o_cgst, g.o_sgst, g.o_tax
      into v_igst, v_cgst, v_sgst, v_tax
      from app.split_gst(
        v_freight + v_fuel, v_use_igst, v_igst_pct, v_cgst_pct, v_sgst_pct) as g;
    v_total := v_freight + v_fuel + v_tax;

    update public.shipment_charge_snapshots set
      rate = v_freight,
      amount = v_freight,
      fuel_applies = v_fuel > 0,
      fuel_amount = v_fuel,
      tax_applies = v_tax > 0,
      tax_on_fuel = true,
      igst = v_igst,
      cgst = v_cgst,
      sgst = v_sgst,
      total = v_total,
      updated_by = auth.uid()
    where tenant_id = v_s.tenant_id
      and shipment_id = v_s.id
      and side = 'VENDOR'
      and upper(description) in ('FREIGHT', 'VENDOR FREIGHT');
  end if;

  update public.shipments set
    vendor_charges_total = v_total,
    customer_charges_total = v_grand,
    balance_amount = v_grand - coalesce(v_s.amount_received, 0),
    updated_by = auth.uid()
  where id = v_s.id;
end
$$;

update public.shipment_charge_snapshots
   set tax_on_fuel = true
 where deleted_at is null
   and upper(description) in ('FREIGHT', 'VENDOR FREIGHT');


create or replace function public.purge_test_shipment_audit(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_count integer := 0;
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    return 0;
  end if;
  alter table public.audit_logs disable trigger trg_audit_logs_block_mutations;
  begin
    delete from public.audit_logs
     where entity_type = 'shipments'
       and entity_id = any(p_ids);
    get diagnostics v_count = row_count;
    alter table public.audit_logs enable trigger trg_audit_logs_block_mutations;
    return v_count;
  exception when others then
    alter table public.audit_logs enable trigger trg_audit_logs_block_mutations;
    raise;
  end;
end
$$;

revoke all on function public.purge_test_shipment_audit(uuid[]) from public, anon, authenticated;
grant execute on function public.purge_test_shipment_audit(uuid[]) to service_role;

create or replace function public.reset_awb_series_after_test_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
begin
  update public.branch_awb_allotments a
     set start_no = 100001,
         end_no = 499999,
         status = 'ACTIVE',
         used_count = (
           select count(*)
             from public.shipments s
            where s.tenant_id = a.tenant_id
              and s.branch_id = a.branch_id
              and s.deleted_at is null
              and s.awb_no ~ '^[0-9]+$'
              and length(s.awb_no) = 6
              and s.awb_no::bigint between 100001 and 499999
         )
   where a.series_type = 'AUTO'
     and a.deleted_at is null;

  update public.branch_awb_allotments
     set start_no = 500001,
         end_no = 899999,
         status = 'ACTIVE'
   where series_type = 'MANUAL'
     and deleted_at is null;

  update public.sequence_counters
     set next_no = 100001
   where doc_type = 'AWB';

  return jsonb_build_object(
    'auto_range', '100001-499999',
    'manual_range', '500001-899999',
    'next_auto', '100001',
    'old_counter_parked_at', 100001
  );
end
$$;

revoke all on function public.reset_awb_series_after_test_cleanup() from public, anon, authenticated;
grant execute on function public.reset_awb_series_after_test_cleanup() to service_role;

notify pgrst, 'reload schema';
