-- ===========================================================================
-- 0033  shipment booking completion — Phase 4 Milestone 3B
-- ---------------------------------------------------------------------------
-- Completes the booking workflow on top of 0032. No manifest/DRS/tracking.
--
--   * app.validate_shipment_for_booking() — structured field errors (jsonb)
--   * public.confirm_booking()            — replace: validate, AWB allocate if
--                                           missing, DRAFT→BOOKED, pickup
--                                           ASSIGNED→PICKED linkage, event+audit
--   * public.validate_shipment_booking()  — optional pre-check RPC for UI
--
-- Status transitions still go through app.assert_status_transition only.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- validate_shipment_for_booking — returns jsonb array of {field, message}
-- ---------------------------------------------------------------------------
create or replace function app.validate_shipment_for_booking(p_shipment public.shipments)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_errors jsonb := '[]'::jsonb;
  v_piece_cnt integer;
begin
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

  return v_errors;
end
$$;

comment on function app.validate_shipment_for_booking(public.shipments) is
  'Returns jsonb array of {field, message} booking validation errors. Empty array = valid.';

-- ---------------------------------------------------------------------------
-- public.validate_shipment_booking — UI pre-check (does not mutate)
-- ---------------------------------------------------------------------------
create or replace function public.validate_shipment_booking(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_s      public.shipments;
  v_errors jsonb;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  select * into v_s from public.shipments
    where id = p_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;

  v_errors := app.validate_shipment_for_booking(v_s);
  return jsonb_build_object(
    'ok', jsonb_array_length(v_errors) = 0,
    'errors', v_errors,
    'status', v_s.current_status,
    'awb_no', v_s.awb_no
  );
end
$$;

revoke all on function public.validate_shipment_booking(uuid) from public;
grant execute on function public.validate_shipment_booking(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- confirm_booking — enhanced booking completion
-- ---------------------------------------------------------------------------
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

  -- Status machine: only DRAFT → BOOKED
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
    select * into v_alloc
      from app.allocate_document_no(v_tenant, 'AWB', v_s.branch_id, v_fy);
    v_awb := v_alloc.formatted_no;
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

  -- Pickup linkage: ASSIGNED → PICKED (reuse pickup status machine)
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
      'pickup_id', v_s.pickup_id
    ));

  perform app.write_audit_log(
    p_tenant_id => v_tenant, p_entity_type => 'shipments', p_action => 'MODIFY',
    p_entity_id => v_s.id, p_module_slug => 'txn.awb-entry',
    p_new => jsonb_build_object('status', 'BOOKED', 'awb_no', v_s.awb_no,
                                'pickup_id', v_s.pickup_id));

  return v_s;
end
$$;

comment on function public.confirm_booking(uuid, integer) is
  'Book a DRAFT shipment: validate, allocate AWB if needed, DRAFT→BOOKED, link pickup ASSIGNED→PICKED.';

revoke all on function public.confirm_booking(uuid, integer) from public;
grant execute on function public.confirm_booking(uuid, integer)
  to authenticated, service_role;
