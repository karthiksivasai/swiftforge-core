-- ===========================================================================
-- 0103  awb compliance and iec export validation gates
-- ---------------------------------------------------------------------------
-- Enforces compliance gating during booking validation:
--   1. Valid 10-character alphanumeric IEC required for CSB-V / Commercial export
--   2. Consistency between CSB filing type and declared Export Reason
-- ===========================================================================

create or replace function app.validate_shipment_for_booking(p_shipment public.shipments)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_errors    jsonb := '[]'::jsonb;
  v_piece_cnt integer;
  v_is_comm   boolean;
  v_csb       text;
  v_reason    text;
  v_iec       text;
begin
  -- 1. Customer requirement
  if p_shipment.customer_id is null then
    v_errors := v_errors || jsonb_build_array(
      jsonb_build_object('field', 'customer_id', 'message', 'Customer is required'));
  elsif not exists (
    select 1 from public.customers c
     where c.id = p_shipment.customer_id
       and c.tenant_id = p_shipment.tenant_id
       and c.deleted_at is null
  ) then
    v_errors := v_errors || jsonb_build_array(
      jsonb_build_object('field', 'customer_id', 'message', 'Customer does not exist'));
  end if;

  -- 2. Origin & Destination requirement
  if p_shipment.origin_destination_id is null then
    v_errors := v_errors || jsonb_build_array(
      jsonb_build_object('field', 'origin_destination_id', 'message', 'Origin is required'));
  elsif not exists (
    select 1 from public.destinations d
     where d.id = p_shipment.origin_destination_id
       and d.tenant_id = p_shipment.tenant_id
       and d.deleted_at is null
  ) then
    v_errors := v_errors || jsonb_build_array(
      jsonb_build_object('field', 'origin_destination_id', 'message', 'Origin does not exist'));
  end if;

  if p_shipment.destination_id is null then
    v_errors := v_errors || jsonb_build_array(
      jsonb_build_object('field', 'destination_id', 'message', 'Destination is required'));
  elsif not exists (
    select 1 from public.destinations d
     where d.id = p_shipment.destination_id
       and d.tenant_id = p_shipment.tenant_id
       and d.deleted_at is null
  ) then
    v_errors := v_errors || jsonb_build_array(
      jsonb_build_object('field', 'destination_id', 'message', 'Destination does not exist'));
  end if;

  -- 3. Product & Book Date
  if p_shipment.product_id is null then
    v_errors := v_errors || jsonb_build_array(
      jsonb_build_object('field', 'product_id', 'message', 'Product is required'));
  elsif not exists (
    select 1 from public.products p
     where p.id = p_shipment.product_id
       and p.tenant_id = p_shipment.tenant_id
       and p.deleted_at is null
  ) then
    v_errors := v_errors || jsonb_build_array(
      jsonb_build_object('field', 'product_id', 'message', 'Product does not exist'));
  end if;

  if p_shipment.book_date is null then
    v_errors := v_errors || jsonb_build_array(
      jsonb_build_object('field', 'book_date', 'message', 'Book date is required'));
  end if;

  -- 4. Pieces requirement
  if coalesce(p_shipment.pieces, 0) < 1 then
    v_errors := v_errors || jsonb_build_array(
      jsonb_build_object('field', 'pieces', 'message', 'Pieces must be at least 1'));
  end if;

  select count(*) into v_piece_cnt
    from public.shipment_pieces sp
   where sp.tenant_id = p_shipment.tenant_id
     and sp.shipment_id = p_shipment.id
     and sp.deleted_at is null;

  if v_piece_cnt < 1 then
    v_errors := v_errors || jsonb_build_array(
      jsonb_build_object('field', 'pieces', 'message', 'At least one shipment piece is required'));
  end if;

  -- 5. Pickup linkage
  if p_shipment.pickup_id is not null then
    if not exists (
      select 1 from public.pickups pk
       where pk.id = p_shipment.pickup_id
         and pk.tenant_id = p_shipment.tenant_id
         and pk.deleted_at is null
    ) then
      v_errors := v_errors || jsonb_build_array(
        jsonb_build_object('field', 'pickup_id', 'message', 'Pickup does not exist in tenant'));
    elsif exists (
      select 1 from public.pickups pk
       where pk.id = p_shipment.pickup_id
         and pk.tenant_id = p_shipment.tenant_id
         and pk.deleted_at is null
         and pk.status not in ('ASSIGNED', 'PICKED', 'CONFIRMED')
    ) then
      v_errors := v_errors || jsonb_build_array(
        jsonb_build_object('field', 'pickup_id', 'message', 'Pickup must be ASSIGNED (or already PICKED) before booking'));
    end if;
  end if;

  -- 6. IEC compliance for CSB-V / Commercial Export
  v_csb := upper(coalesce(p_shipment.wizard_extras->'proforma'->>'csbType', ''));
  v_reason := upper(coalesce(p_shipment.wizard_extras->'proforma'->>'exportReason', ''));
  v_is_comm := coalesce(p_shipment.is_commercial, false) or (v_csb in ('CSB 5', 'COMMERCIAL', 'CBE XIII'));

  if v_is_comm then
    v_iec := btrim(coalesce(
      p_shipment.shipper->>'iecNo',
      case when upper(coalesce(p_shipment.shipper->>'documentType', '')) = 'IEC'
           then p_shipment.shipper->>'documentNo'
           else null
      end,
      ''
    ));

    if v_iec = '' or not (v_iec ~* '^[A-Z0-9]{10}$') then
      v_errors := v_errors || jsonb_build_array(
        jsonb_build_object(
          'field', 'shipper_iec',
          'message', 'Valid 10-character alphanumeric IEC is required on Shipper for CSB-V / Commercial export'
        )
      );
    end if;
  end if;

  -- 7. CSB Type vs Export Reason consistency
  if v_csb in ('CSB 4', 'CSB 3', 'ECM SPX') and v_reason = 'SALE' then
    v_errors := v_errors || jsonb_build_array(
      jsonb_build_object(
        'field', 'csb_type',
        'message', 'Commercial export reason "SALE" must be filed under CSB-V or COMMERCIAL, not CSB-IV/III'
      )
    );
  elsif v_csb in ('CSB 5', 'COMMERCIAL') and v_reason in ('BONAFIDE GIFT', 'UNSOLICITED GIFT - NOT FOR SALE') then
    v_errors := v_errors || jsonb_build_array(
      jsonb_build_object(
        'field', 'csb_type',
        'message', 'Non-commercial gift exports cannot be filed under commercial CSB-V'
      )
    );
  end if;

  return v_errors;
end;
$$;

comment on function app.validate_shipment_for_booking(public.shipments) is
  'Structured booking validation rules including IEC compliance and CSB consistency. Empty array = valid.';
