-- ===========================================================================
-- 0141  AWB lock actor — who locked it, when, and who unlocked it.
-- ---------------------------------------------------------------------------
-- is_locked alone did not record the person or the time. Unlock identity lived
-- only inside the audit JSON. These columns keep the last lock and the last
-- unlock on the shipment. locked_by / unlocked_by store auth.uid(), the same
-- identity as created_by and updated_by. A lock does not clear the previous
-- unlock, and an unlock does not clear who locked it.
-- ===========================================================================

alter table public.shipments
  add column if not exists locked_by uuid,
  add column if not exists locked_at timestamptz,
  add column if not exists unlocked_by uuid,
  add column if not exists unlocked_at timestamptz;

comment on column public.shipments.locked_by is
  'auth.uid() of the user who last locked this AWB. Kept after unlock.';
comment on column public.shipments.locked_at is
  'When this AWB was last locked.';
comment on column public.shipments.unlocked_by is
  'auth.uid() of the user who last unlocked this AWB.';
comment on column public.shipments.unlocked_at is
  'When this AWB was last unlocked.';

create or replace function app.tg_shipments_lock_stamp()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_locked then
      new.locked_by := coalesce(new.locked_by, auth.uid());
      new.locked_at := coalesce(new.locked_at, now());
    end if;
    return new;
  end if;

  if new.is_locked is true and old.is_locked is distinct from true then
    new.locked_by := auth.uid();
    new.locked_at := now();
  elsif new.is_locked is distinct from true and old.is_locked is true then
    new.unlocked_by := auth.uid();
    new.unlocked_at := now();
  end if;
  return new;
end
$$;

comment on function app.tg_shipments_lock_stamp() is
  'Stamp locked_by/locked_at or unlocked_by/unlocked_at when is_locked changes.';

drop trigger if exists trg_shipments_lock_stamp on public.shipments;
create trigger trg_shipments_lock_stamp
  before insert or update of is_locked on public.shipments
  for each row execute function app.tg_shipments_lock_stamp();

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
  v_locked_by uuid;
  v_locked_at timestamptz;
  v_product_code text;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'p_fields must be a JSON object' using errcode = '22023';
  end if;

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

  if v_lock then
    update public.shipments
       set is_locked = true,
           updated_by = auth.uid()
     where id = v_s.id
     returning locked_by, locked_at into v_locked_by, v_locked_at;
    perform app.write_audit_log(
      p_tenant_id => v_s.tenant_id, p_entity_type => 'shipments', p_action => 'MODIFY',
      p_entity_id => v_s.id, p_module_slug => 'txn.awb-entry',
      p_old => jsonb_build_object('is_locked', false, 'awb_no', v_s.awb_no),
      p_new => jsonb_build_object(
        'awb_no', v_s.awb_no,
        'is_locked', true,
        'change', 'lock',
        'locked_by', v_locked_by,
        'locked_at', v_locked_at));
  end if;

  select * into v_s from public.shipments where id = v_s.id;
  return v_s;
end
$$;

create or replace function public.unlock_shipment(p_id uuid)
returns public.shipments
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_s public.shipments;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not app.user_has_permission(v_tenant, 'txn.awb-unlock', 'modify') then
    raise exception 'Permission denied: txn.awb-unlock' using errcode = '42501';
  end if;

  select * into v_s
    from public.shipments
   where id = p_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;

  update public.shipments set
    is_locked = false,
    updated_by = auth.uid()
  where id = v_s.id
  returning * into v_s;

  perform app.write_audit_log(
    p_tenant_id => v_tenant,
    p_entity_type => 'shipments',
    p_action => 'MODIFY',
    p_entity_id => v_s.id,
    p_module_slug => 'txn.awb-unlock',
    p_old => jsonb_build_object(
      'is_locked', true,
      'awb_no', v_s.awb_no,
      'locked_by', v_s.locked_by,
      'locked_at', v_s.locked_at),
    p_new => jsonb_build_object(
      'change', 'unlock',
      'is_locked', false,
      'awb_no', v_s.awb_no,
      'unlocked_by', v_s.unlocked_by,
      'unlocked_at', v_s.unlocked_at,
      'locked_by', v_s.locked_by,
      'locked_at', v_s.locked_at));

  return v_s;
end
$$;

grant execute on function public.book_awb_shipment(uuid, integer, jsonb, jsonb, jsonb, jsonb, jsonb)
  to authenticated, service_role;
grant execute on function public.unlock_shipment(uuid)
  to authenticated, service_role;

comment on function public.book_awb_shipment(uuid, integer, jsonb, jsonb, jsonb, jsonb, jsonb) is
  'Validate, save, rate, and set BOOKED in one transaction. A locked save records who locked it and when.';
comment on function public.unlock_shipment(uuid) is
  'Clear is_locked. Requires txn.awb-unlock. Records who unlocked it and when, and keeps who locked it.';

notify pgrst, 'reload schema';
