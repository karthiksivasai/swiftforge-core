-- ===========================================================================
-- 0127  AWB number claim
-- ---------------------------------------------------------------------------
-- A new AWB Entry save allocates the next series number. That counter had
-- fallen behind numbers already stored on shipments, so Save hit the unique
-- AWB index and the screen showed "A record with this value already exists."
-- claim_awb_no keeps a typed manual number when it is free, and otherwise
-- walks the series until it finds a number that is not on a live shipment.
-- ===========================================================================

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
begin
  if p_tenant is null then
    raise exception 'Tenant is required to allocate an AWB' using errcode = '22023';
  end if;

  if v_requested is not null then
    if exists (
      select 1
      from public.shipments s
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
      raise exception 'No free AWB number is left in this series'
        using errcode = 'CMS03';
    end if;

    select * into v_alloc
      from app.allocate_document_no(p_tenant, 'AWB', p_branch, p_fin_year);
    v_awb := v_alloc.formatted_no;

    exit when not exists (
      select 1
      from public.shipments s
      where s.tenant_id = p_tenant
        and s.awb_no = v_awb
        and s.deleted_at is null
    );
  end loop;

  return v_awb;
end
$$;

comment on function app.claim_awb_no(uuid, uuid, uuid, text) is
  'Reserve an AWB. A typed number is kept when free; otherwise the next unused series number is returned.';

revoke all on function app.claim_awb_no(uuid, uuid, uuid, text) from public;
grant execute on function app.claim_awb_no(uuid, uuid, uuid, text)
  to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_shipment(p_id uuid, p_row_version integer, p_fields jsonb, p_pieces jsonb DEFAULT '[]'::jsonb, p_charges jsonb DEFAULT '[]'::jsonb, p_comments jsonb DEFAULT '[]'::jsonb, p_attachments jsonb DEFAULT '[]'::jsonb)
 RETURNS shipments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
declare
  v_tenant   uuid;
  v_s        public.shipments;
  v_alloc    record;
  v_awb      text;
  v_branch   uuid;
  v_fy       uuid;
  v_customer uuid;
  v_origin   uuid;
  v_dest     uuid;
  v_product  uuid;
  v_vendor   uuid;
  v_dvendor  uuid;
  v_fe       uuid;
  v_pickup   uuid;
  v_pieces_u text;
  v_date     date;
  v_time     time;
  v_shipper  jsonb;
  v_consignee jsonb;
  v_extras   jsonb;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'p_fields must be a JSON object' using errcode = '22023';
  end if;

  v_customer := app.resolve_tenant_row_id(
    v_tenant, 'customers',
    nullif(btrim(coalesce(p_fields->>'customer_id','')),'')::uuid,
    p_fields->>'customer_code');
  if v_customer is null then
    raise exception 'Customer is required' using errcode = '22023';
  end if;

  v_product := app.resolve_tenant_row_id(
    v_tenant, 'products',
    nullif(btrim(coalesce(p_fields->>'product_id','')),'')::uuid,
    p_fields->>'product_code');
  if v_product is null then
    raise exception 'Product is required' using errcode = '22023';
  end if;

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
  v_dvendor := app.resolve_tenant_row_id(
    v_tenant, 'vendors',
    nullif(btrim(coalesce(p_fields->>'delivery_vendor_id','')),'')::uuid,
    p_fields->>'delivery_vendor_code');
  v_fe := app.resolve_tenant_row_id(
    v_tenant, 'field_executives',
    nullif(btrim(coalesce(p_fields->>'field_executive_id','')),'')::uuid,
    p_fields->>'field_executive_code');
  v_branch := app.resolve_tenant_row_id(
    v_tenant, 'branches',
    nullif(btrim(coalesce(p_fields->>'branch_id','')),'')::uuid,
    p_fields->>'branch_code');
  if v_branch is null then
    select id into v_branch from public.branches
      where tenant_id = v_tenant and deleted_at is null
      order by is_head_office desc, code limit 1;
  end if;

  v_pickup := nullif(btrim(coalesce(p_fields->>'pickup_id','')),'')::uuid;
  if v_pickup is not null then
    if not exists (
      select 1 from public.pickups p
       where p.id = v_pickup and p.tenant_id = v_tenant and p.deleted_at is null
    ) then
      raise exception 'Pickup not found in tenant' using errcode = '22023';
    end if;
  end if;

  begin
    v_date := coalesce((p_fields->>'book_date')::date, current_date);
  exception when others then
    raise exception 'Invalid book_date' using errcode = '22023';
  end;
  begin
    v_time := nullif(btrim(coalesce(p_fields->>'book_time','')),'')::time;
  exception when others then
    raise exception 'Invalid book_time' using errcode = '22023';
  end;

  v_pieces_u := upper(coalesce(nullif(btrim(p_fields->>'pieces_unit'),''), 'DOX'));
  if v_pieces_u not in ('DOX','NDOX','ENV') then v_pieces_u := 'DOX'; end if;

  v_shipper := coalesce(p_fields->'shipper', '{}'::jsonb);
  if jsonb_typeof(v_shipper) <> 'object' then v_shipper := '{}'::jsonb; end if;
  v_consignee := coalesce(p_fields->'consignee', '{}'::jsonb);
  if jsonb_typeof(v_consignee) <> 'object' then v_consignee := '{}'::jsonb; end if;
  v_extras := coalesce(p_fields->'wizard_extras', '{}'::jsonb);
  if jsonb_typeof(v_extras) <> 'object' then v_extras := '{}'::jsonb; end if;

  select fy.id into v_fy
    from public.financial_years fy
   where fy.tenant_id = v_tenant and fy.deleted_at is null and fy.is_active
     and (fy.branch_id is not distinct from v_branch or fy.branch_id is null)
   order by case when fy.branch_id = v_branch then 0 else 1 end, fy.from_date desc
   limit 1;

  if p_id is null then
    if not app.user_has_permission(v_tenant, 'txn.awb-entry', 'add') then
      raise exception 'Permission denied: txn.awb-entry add' using errcode = '42501';
    end if;

    v_awb := app.claim_awb_no(
      v_tenant,
      v_branch,
      v_fy,
      nullif(btrim(coalesce(p_fields->>'awb_no','')), '')
    );

    insert into public.shipments (
      tenant_id, awb_no, book_date, book_time, reference_no,
      customer_id, branch_id, origin_destination_id, destination_id,
      shipper, consignee, product_id, vendor_id, airline, service, payment_type,
      content, instruction, field_executive_id, pickup_id,
      pieces, pieces_unit, actual_weight, weight_unit, vol_weight, charge_weight,
      shipment_value, currency, is_commercial, is_oda, medical_charges,
      customer_charges_total, vendor_charges_total,
      cash_receipt_no, amount_received, balance_amount, cash_receipt_date,
      forwarding_awb, delivery_awb, return_awb, delivery_vendor_id, delivery_service,
      flight_no, current_status, status_at, is_locked, wizard_extras,
      created_by, updated_by)
    values (
      v_tenant, v_awb, v_date, v_time,
      nullif(btrim(coalesce(p_fields->>'reference_no','')),''),
      v_customer, v_branch, v_origin, v_dest,
      v_shipper, v_consignee, v_product, v_vendor,
      nullif(btrim(coalesce(p_fields->>'airline','')),''),
      nullif(btrim(coalesce(p_fields->>'service','')),''),
      nullif(btrim(coalesce(p_fields->>'payment_type','')),''),
      nullif(btrim(coalesce(p_fields->>'content','')),''),
      nullif(btrim(coalesce(p_fields->>'instruction','')),''),
      v_fe, v_pickup,
      coalesce(nullif(btrim(coalesce(p_fields->>'pieces','')),'')::integer, 1),
      v_pieces_u,
      coalesce(nullif(btrim(coalesce(p_fields->>'actual_weight','')),'')::numeric, 0),
      coalesce(nullif(btrim(p_fields->>'weight_unit'),''), 'KG'),
      coalesce(nullif(btrim(coalesce(p_fields->>'vol_weight','')),'')::numeric, 0),
      coalesce(nullif(btrim(coalesce(p_fields->>'charge_weight','')),'')::numeric, 0),
      nullif(btrim(coalesce(p_fields->>'shipment_value','')),'')::numeric,
      coalesce(nullif(btrim(p_fields->>'currency'),''), 'INR'),
      coalesce((p_fields->>'is_commercial')::boolean, false),
      coalesce((p_fields->>'is_oda')::boolean, false),
      coalesce((p_fields->>'medical_charges')::boolean, false),
      coalesce(nullif(btrim(coalesce(p_fields->>'customer_charges_total','')),'')::numeric, 0),
      coalesce(nullif(btrim(coalesce(p_fields->>'vendor_charges_total','')),'')::numeric, 0),
      nullif(btrim(coalesce(p_fields->>'cash_receipt_no','')),''),
      nullif(btrim(coalesce(p_fields->>'amount_received','')),'')::numeric,
      nullif(btrim(coalesce(p_fields->>'balance_amount','')),'')::numeric,
      nullif(btrim(coalesce(p_fields->>'cash_receipt_date','')),'')::date,
      nullif(btrim(coalesce(p_fields->>'forwarding_awb','')),''),
      nullif(btrim(coalesce(p_fields->>'delivery_awb','')),''),
      nullif(btrim(coalesce(p_fields->>'return_awb','')),''),
      v_dvendor,
      nullif(btrim(coalesce(p_fields->>'delivery_service','')),''),
      nullif(btrim(coalesce(p_fields->>'flight_no','')),''),
      'DRAFT', now(), coalesce((p_fields->>'is_locked')::boolean, false), v_extras,
      auth.uid(), auth.uid())
    returning * into v_s;

    perform app.sync_shipment_pieces(v_tenant, v_s.id, p_pieces);
    perform app.sync_shipment_charge_snapshots(v_tenant, v_s.id, p_charges);
    perform app.sync_shipment_comments(v_tenant, v_s.id, p_comments);
    perform app.sync_shipment_attachments(v_tenant, v_s.id, p_attachments);

    perform app.append_shipment_event(
      v_tenant, v_s.id, 'CREATED', 'Shipment Created',
      jsonb_build_object('awb_no', v_s.awb_no, 'status', v_s.current_status));

    perform app.write_audit_log(
      p_tenant_id => v_tenant, p_entity_type => 'shipments', p_action => 'ADD',
      p_entity_id => v_s.id, p_module_slug => 'txn.awb-entry',
      p_new => jsonb_build_object('awb_no', v_s.awb_no, 'status', 'DRAFT'));
  else
    if not app.user_has_permission(v_tenant, 'txn.awb-entry', 'modify') then
      raise exception 'Permission denied: txn.awb-entry modify' using errcode = '42501';
    end if;

    select * into v_s from public.shipments
      where id = p_id and tenant_id = v_tenant and deleted_at is null;
    if not found then
      raise exception 'Shipment not found' using errcode = 'P0002';
    end if;
    if v_s.current_status <> 'DRAFT' then
      raise exception 'Only DRAFT shipments can be edited' using errcode = 'CMS02';
    end if;
    if v_s.is_locked then
      raise exception 'Shipment is locked' using errcode = 'CMS02';
    end if;

    update public.shipments set
      book_date = v_date,
      book_time = v_time,
      reference_no = nullif(btrim(coalesce(p_fields->>'reference_no','')),''),
      customer_id = v_customer,
      branch_id = v_branch,
      origin_destination_id = v_origin,
      destination_id = v_dest,
      shipper = v_shipper,
      consignee = v_consignee,
      product_id = v_product,
      vendor_id = v_vendor,
      airline = nullif(btrim(coalesce(p_fields->>'airline','')),''),
      service = nullif(btrim(coalesce(p_fields->>'service','')),''),
      payment_type = nullif(btrim(coalesce(p_fields->>'payment_type','')),''),
      content = nullif(btrim(coalesce(p_fields->>'content','')),''),
      instruction = nullif(btrim(coalesce(p_fields->>'instruction','')),''),
      field_executive_id = v_fe,
      pickup_id = v_pickup,
      pieces = coalesce(nullif(btrim(coalesce(p_fields->>'pieces','')),'')::integer, pieces),
      pieces_unit = v_pieces_u,
      actual_weight = coalesce(nullif(btrim(coalesce(p_fields->>'actual_weight','')),'')::numeric, actual_weight),
      weight_unit = coalesce(nullif(btrim(p_fields->>'weight_unit'),''), weight_unit),
      vol_weight = coalesce(nullif(btrim(coalesce(p_fields->>'vol_weight','')),'')::numeric, vol_weight),
      charge_weight = coalesce(nullif(btrim(coalesce(p_fields->>'charge_weight','')),'')::numeric, charge_weight),
      shipment_value = nullif(btrim(coalesce(p_fields->>'shipment_value','')),'')::numeric,
      currency = coalesce(nullif(btrim(p_fields->>'currency'),''), currency),
      is_commercial = coalesce((p_fields->>'is_commercial')::boolean, is_commercial),
      is_oda = coalesce((p_fields->>'is_oda')::boolean, is_oda),
      medical_charges = coalesce((p_fields->>'medical_charges')::boolean, medical_charges),
      customer_charges_total = coalesce(nullif(btrim(coalesce(p_fields->>'customer_charges_total','')),'')::numeric, customer_charges_total),
      vendor_charges_total = coalesce(nullif(btrim(coalesce(p_fields->>'vendor_charges_total','')),'')::numeric, vendor_charges_total),
      cash_receipt_no = nullif(btrim(coalesce(p_fields->>'cash_receipt_no','')),''),
      amount_received = nullif(btrim(coalesce(p_fields->>'amount_received','')),'')::numeric,
      balance_amount = nullif(btrim(coalesce(p_fields->>'balance_amount','')),'')::numeric,
      cash_receipt_date = nullif(btrim(coalesce(p_fields->>'cash_receipt_date','')),'')::date,
      forwarding_awb = nullif(btrim(coalesce(p_fields->>'forwarding_awb','')),''),
      delivery_awb = nullif(btrim(coalesce(p_fields->>'delivery_awb','')),''),
      return_awb = nullif(btrim(coalesce(p_fields->>'return_awb','')),''),
      delivery_vendor_id = v_dvendor,
      delivery_service = nullif(btrim(coalesce(p_fields->>'delivery_service','')),''),
      flight_no = nullif(btrim(coalesce(p_fields->>'flight_no','')),''),
      is_locked = coalesce((p_fields->>'is_locked')::boolean, is_locked),
      wizard_extras = v_extras,
      updated_by = auth.uid()
    where id = p_id and tenant_id = v_tenant and deleted_at is null
      and row_version = p_row_version
    returning * into v_s;

    if not found then
      raise exception 'This record was changed by someone else. Reload and try again.'
        using errcode = '40001';
    end if;

    perform app.sync_shipment_pieces(v_tenant, v_s.id, p_pieces);
    perform app.sync_shipment_charge_snapshots(v_tenant, v_s.id, p_charges);
    perform app.sync_shipment_comments(v_tenant, v_s.id, p_comments);
    perform app.sync_shipment_attachments(v_tenant, v_s.id, p_attachments);

    perform app.append_shipment_event(
      v_tenant, v_s.id, 'UPDATED', 'Shipment Updated',
      jsonb_build_object('awb_no', v_s.awb_no, 'row_version', v_s.row_version));
  end if;

  return v_s;
end
$function$;

CREATE OR REPLACE FUNCTION public.confirm_booking(p_id uuid, p_row_version integer)
 RETURNS shipments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
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
$function$;

-- Move each AWB counter past numbers already stored, so the next Save
-- does not start on a taken number. Cancelled shipments still occupy
-- their number because they are not deleted.
update public.sequence_counters sc
set next_no = greatest(
  sc.next_no,
  coalesce((
    select max(s.awb_no::bigint) + 1
    from public.shipments s
    where s.tenant_id = sc.tenant_id
      and s.deleted_at is null
      and s.awb_no ~ '^[0-9]+$'
      and length(s.awb_no) between 1 and 12
      and (coalesce(sc.prefix, '') = '' or s.awb_no like sc.prefix || '%')
  ), sc.next_no)
)
where sc.doc_type = 'AWB';
