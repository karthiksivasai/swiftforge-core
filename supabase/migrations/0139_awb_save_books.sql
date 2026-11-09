-- ===========================================================================
-- 0139  Save books the AWB
-- ---------------------------------------------------------------------------
-- Save claims the AWB number, rates on the server, and commits BOOKED in one
-- transaction. A later error rolls the number back with the row.
-- Amounts, weights, GST, and the vendor divisor come from the server.
-- A blank customer billing state or branch state stops the save.
-- Unlock is a separate permission (txn.awb-unlock) and writes an audit row.
-- ===========================================================================

alter table public.vendor_contracts
  add column if not exists cm_divisor numeric(12,3),
  add column if not exists inch_divisor numeric(12,3);

comment on column public.vendor_contracts.cm_divisor is
  'Vendor volumetric divisor for centimetres. Rating uses this, not the customer divisor.';
comment on column public.vendor_contracts.inch_divisor is
  'Vendor volumetric divisor for inches. 305 is the kilogram equivalent of a 5000 cm divisor.';

-- Contracts that never stored a divisor get the standard factor on the vendor
-- row itself. Rating no longer borrows the customer volumetric row.
update public.vendor_contracts
   set cm_divisor = 5000
 where deleted_at is null
   and cm_divisor is null;

update public.vendor_contracts
   set inch_divisor = 305
 where deleted_at is null
   and inch_divisor is null;

alter table public.shipment_pieces
  add column if not exists measurement_unit text not null default 'Centimeter';

comment on column public.shipment_pieces.measurement_unit is
  'Centimeter or Inch. The server picks the matching divisor.';

-- Tenant-wide 18% GST. CGST and SGST are each half. The booking function
-- reads these columns and does not hardcode the percent.
insert into public.tax_rates (
  tenant_id, from_date, igst_pct, cgst_pct, sgst_pct, tax_type, tax_on_fuel, status
)
select t.id, date '2026-04-01', 18, 9, 9, 'GST', true, 'ACTIVE'
  from public.tenants t
 where not exists (
   select 1
     from public.tax_rates tr
    where tr.tenant_id = t.id
      and tr.deleted_at is null
      and tr.customer_id is null
      and tr.product_id is null
      and tr.status = 'ACTIVE'
      and tr.from_date <= current_date
      and (tr.to_date is null or tr.to_date >= current_date)
 );

insert into public.permission_modules (slug, section, name, under_menu, sort_order)
select 'txn.awb-unlock', 'TRANSACTION', 'AWB Unlock', 'Entry',
       coalesce((select max(sort_order) + 1 from public.permission_modules), 1)
 where not exists (
   select 1 from public.permission_modules where slug = 'txn.awb-unlock'
 );

-- ---------------------------------------------------------------------------
-- Piece sync keeps the measurement unit.
-- ---------------------------------------------------------------------------
create or replace function app.sync_shipment_pieces(
  p_tenant uuid,
  p_shipment uuid,
  p_pieces jsonb
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_elem jsonb;
  v_seq  integer := 0;
  v_unit text;
begin
  delete from public.shipment_pieces
   where tenant_id = p_tenant and shipment_id = p_shipment;

  if p_pieces is null or jsonb_typeof(p_pieces) <> 'array' then
    return;
  end if;

  for v_elem in select * from jsonb_array_elements(p_pieces)
  loop
    v_seq := v_seq + 1;
    v_unit := coalesce(nullif(btrim(v_elem->>'measurement_unit'), ''), 'Centimeter');
    insert into public.shipment_pieces (
      tenant_id, shipment_id, seq, child_awb,
      actual_weight_per_pc, pieces, length, breadth, height, divisor,
      vol_weight, charge_weight, measurement_unit, created_by, updated_by)
    values (
      p_tenant, p_shipment, v_seq,
      nullif(btrim(coalesce(v_elem->>'child_awb','')),''),
      coalesce(nullif(btrim(coalesce(v_elem->>'actual_weight_per_pc','')),'')::numeric, 0),
      coalesce(nullif(btrim(coalesce(v_elem->>'pieces','')),'')::integer, 1),
      nullif(btrim(coalesce(v_elem->>'length','')),'')::numeric,
      nullif(btrim(coalesce(v_elem->>'breadth','')),'')::numeric,
      nullif(btrim(coalesce(v_elem->>'height','')),'')::numeric,
      nullif(btrim(coalesce(v_elem->>'divisor','')),'')::numeric,
      coalesce(nullif(btrim(coalesce(v_elem->>'vol_weight','')),'')::numeric, 0),
      coalesce(nullif(btrim(coalesce(v_elem->>'charge_weight','')),'')::numeric, 0),
      v_unit,
      auth.uid(), auth.uid());
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- IEC is stored as iec_no. Accept iecNo as well.
-- ---------------------------------------------------------------------------
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

  v_csb := upper(coalesce(p_shipment.wizard_extras->'proforma'->>'csbType', ''));
  v_reason := upper(coalesce(p_shipment.wizard_extras->'proforma'->>'exportReason', ''));
  v_is_comm := coalesce(p_shipment.is_commercial, false) or (v_csb in ('CSB 5', 'COMMERCIAL', 'CBE XIII'));

  if v_is_comm then
    v_iec := btrim(coalesce(
      p_shipment.shipper->>'iec_no',
      p_shipment.shipper->>'iecNo',
      case when upper(coalesce(p_shipment.shipper->>'documentType', p_shipment.shipper->>'document_type', '')) = 'IEC'
           then coalesce(p_shipment.shipper->>'documentNo', p_shipment.shipper->>'document_no')
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

-- ---------------------------------------------------------------------------
-- Weights from dimensions. Browser totals are ignored.
-- ---------------------------------------------------------------------------
create or replace function app.piece_volumetric_kg(
  p_length numeric,
  p_breadth numeric,
  p_height numeric,
  p_pieces integer,
  p_unit text,
  p_cm numeric,
  p_inch numeric
)
returns numeric
language sql
immutable
as $$
  select case
    when coalesce(p_length, 0) <= 0
      or coalesce(p_breadth, 0) <= 0
      or coalesce(p_height, 0) <= 0 then 0
    when upper(coalesce(p_unit, '')) like 'INCH%' then
      (p_length * p_breadth * p_height * greatest(coalesce(p_pieces, 1), 1))
        / nullif(coalesce(p_inch, 305), 0)
    else
      (p_length * p_breadth * p_height * greatest(coalesce(p_pieces, 1), 1))
        / nullif(coalesce(p_cm, 5000), 0)
  end
$$;

create or replace function app.recalculate_shipment_weights(p_shipment uuid)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_s public.shipments;
  v_product_code text;
  v_vendor_code text;
  v_vendor_name text;
  v_cm numeric := 5000;
  v_inch numeric := 305;
  v_piece public.shipment_pieces;
  v_pcs integer;
  v_line_act numeric;
  v_line_vol numeric;
  v_line_chg numeric;
  v_div numeric;
  v_child text;
  v_pieces integer := 0;
  v_actual numeric := 0;
  v_vol numeric := 0;
  v_charge numeric := 0;
  v_unit text := 'DOX';
begin
  select * into v_s from public.shipments where id = p_shipment;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;

  select upper(p.code) into v_product_code
    from public.products p
   where p.id = v_s.product_id and p.tenant_id = v_s.tenant_id;

  select v.code, v.name into v_vendor_code, v_vendor_name
    from public.vendors v
   where v.id = v_s.vendor_id and v.tenant_id = v_s.tenant_id;

  select cv.cm_divisor, cv.inch_divisor
    into v_cm, v_inch
    from public.customer_volumetrics cv
   where cv.tenant_id = v_s.tenant_id
     and cv.customer_id = v_s.customer_id
     and (
       nullif(btrim(coalesce(cv.product, '')), '') is null
       or upper(cv.product) = v_product_code
     )
     and (
       nullif(btrim(coalesce(cv.vendor, '')), '') is null
       or upper(cv.vendor) = upper(coalesce(v_vendor_code, ''))
       or upper(cv.vendor) = upper(coalesce(v_vendor_name, ''))
       or upper(coalesce(v_vendor_name, '')) like '%' || upper(cv.vendor) || '%'
       or upper(cv.vendor) like '%' || upper(coalesce(v_vendor_code, '')) || '%'
     )
     and (
       nullif(btrim(coalesce(cv.service, '')), '') is null
       or upper(cv.service) = upper(coalesce(v_s.service, ''))
     )
   order by
     (case when nullif(btrim(coalesce(cv.product, '')), '') is not null then 4 else 0 end)
     + (case when nullif(btrim(coalesce(cv.vendor, '')), '') is not null then 2 else 0 end)
     + (case when nullif(btrim(coalesce(cv.service, '')), '') is not null then 1 else 0 end) desc,
     cv.seq
   limit 1;

  v_cm := coalesce(v_cm, 5000);
  v_inch := coalesce(v_inch, 305);

  for v_piece in
    select * from public.shipment_pieces sp
     where sp.shipment_id = v_s.id and sp.tenant_id = v_s.tenant_id
     order by sp.seq
  loop
    v_pcs := greatest(coalesce(v_piece.pieces, 1), 1);
    v_line_act := round(coalesce(v_piece.actual_weight_per_pc, 0) * v_pcs, 3);
    v_line_vol := round(coalesce(app.piece_volumetric_kg(
      v_piece.length, v_piece.breadth, v_piece.height, v_pcs,
      v_piece.measurement_unit, v_cm, v_inch
    ), 0), 3);
    v_line_chg := greatest(v_line_act, v_line_vol);
    v_div := case
      when upper(coalesce(v_piece.measurement_unit, '')) like 'INCH%' then v_inch
      else v_cm
    end;
    v_child := nullif(btrim(coalesce(v_piece.child_awb, '')), '');
    if v_child is null and nullif(btrim(coalesce(v_s.awb_no, '')), '') is not null then
      v_child := v_s.awb_no || '-' || v_piece.seq::text;
    end if;

    update public.shipment_pieces set
      pieces = v_pcs,
      vol_weight = v_line_vol,
      charge_weight = v_line_chg,
      divisor = v_div,
      child_awb = v_child,
      updated_by = auth.uid()
    where id = v_piece.id;

    v_pieces := v_pieces + v_pcs;
    v_actual := v_actual + v_line_act;
    v_vol := v_vol + v_line_vol;
    v_charge := v_charge + v_line_chg;
  end loop;

  if v_product_code = 'NDOX' then
    v_unit := 'NDOX';
  elsif v_product_code = 'ENV' then
    v_unit := 'ENV';
  end if;

  update public.shipments set
    pieces = greatest(v_pieces, 0),
    pieces_unit = v_unit,
    actual_weight = v_actual,
    vol_weight = v_vol,
    charge_weight = v_charge,
    updated_by = auth.uid()
  where id = v_s.id;
end
$$;

create or replace function app.vendor_chargeable_weight(p_shipment uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_s public.shipments;
  v_cm numeric := 5000;
  v_inch numeric := 305;
  v_piece public.shipment_pieces;
  v_pcs integer;
  v_act numeric;
  v_vol numeric;
  v_total numeric := 0;
begin
  select * into v_s from public.shipments where id = p_shipment;
  if not found then
    return 0;
  end if;

  select vc.cm_divisor, vc.inch_divisor
    into v_cm, v_inch
    from public.vendor_contracts vc
   where vc.tenant_id = v_s.tenant_id
     and vc.deleted_at is null
     and vc.status = 'ACTIVE'
     and vc.vendor_id = v_s.vendor_id
     and vc.product_id = v_s.product_id
     and vc.from_date <= coalesce(v_s.book_date, current_date)
     and (vc.origin_destination_id is null or vc.origin_destination_id = v_s.origin_destination_id)
     and (vc.destination_id is null or vc.destination_id = v_s.destination_id)
     and (
       nullif(btrim(coalesce(vc.service, '')), '') is null
       or upper(vc.service) = upper(coalesce(v_s.service, ''))
     )
   order by
     (case when vc.destination_id is not null then 4 else 0 end)
     + (case when vc.origin_destination_id is not null then 2 else 0 end)
     + (case when nullif(btrim(coalesce(vc.service, '')), '') is not null then 1 else 0 end) desc,
     vc.from_date desc
   limit 1;

  v_cm := coalesce(v_cm, 5000);
  v_inch := coalesce(v_inch, 305);

  for v_piece in
    select * from public.shipment_pieces sp
     where sp.shipment_id = v_s.id and sp.tenant_id = v_s.tenant_id
  loop
    v_pcs := greatest(coalesce(v_piece.pieces, 1), 1);
    v_act := round(coalesce(v_piece.actual_weight_per_pc, 0) * v_pcs, 3);
    v_vol := round(coalesce(app.piece_volumetric_kg(
      v_piece.length, v_piece.breadth, v_piece.height, v_pcs,
      v_piece.measurement_unit, v_cm, v_inch
    ), 0), 3);
    v_total := v_total + greatest(v_act, v_vol);
  end loop;

  return coalesce(v_total, 0);
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
  v_total numeric := 0;
  v_as_of date;
begin
  select * into v_s from public.shipments where id = p_shipment;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;

  v_as_of := coalesce(v_s.book_date, current_date);
  v_weight := app.vendor_chargeable_weight(v_s.id);
  v_zone := app.resolve_rating_zone(
    v_s.tenant_id, v_s.origin_destination_id, v_s.destination_id,
    v_s.vendor_id, v_s.product_id, v_s.service, v_as_of);

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

    if v_use_igst then
      v_igst := round((v_freight + v_fuel) * coalesce(v_igst_pct, 0) / 100.0, 2);
    else
      v_cgst := round((v_freight + v_fuel) * coalesce(v_cgst_pct, 0) / 100.0, 2);
      v_sgst := round((v_freight + v_fuel) * coalesce(v_sgst_pct, 0) / 100.0, 2);
    end if;
    v_tax := v_igst + v_cgst + v_sgst;
    v_total := v_freight + v_fuel + v_tax;

    update public.shipment_charge_snapshots set
      rate = v_freight,
      amount = v_freight,
      fuel_applies = v_fuel > 0,
      fuel_amount = v_fuel,
      tax_applies = v_tax > 0,
      igst = v_igst,
      cgst = v_cgst,
      sgst = v_sgst,
      total = v_total,
      updated_by = auth.uid()
    where tenant_id = v_s.tenant_id
      and shipment_id = v_s.id
      and side = 'VENDOR';
  end if;

  update public.shipments set
    vendor_charges_total = v_total,
    customer_charges_total = coalesce(grand_total, 0),
    balance_amount = coalesce(grand_total, 0) - coalesce(amount_received, 0),
    updated_by = auth.uid()
  where id = v_s.id;
end
$$;

-- Allow an unlocked BOOKED AWB to be saved again. A locked row still stops.
create or replace function public.save_shipment(
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
  v_tenant   uuid;
  v_s        public.shipments;
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
    select u.home_branch_id into v_branch
      from public.users u
     where u.tenant_id = v_tenant
       and u.auth_user_id = auth.uid()
       and u.deleted_at is null
       and u.home_branch_id is not null
     limit 1;
  end if;
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
      0, coalesce(nullif(btrim(p_fields->>'weight_unit'),''), 'KG'), 0, 0,
      nullif(btrim(coalesce(p_fields->>'shipment_value','')),'')::numeric,
      coalesce(nullif(btrim(p_fields->>'currency'),''), 'INR'),
      coalesce((p_fields->>'is_commercial')::boolean, false),
      coalesce((p_fields->>'is_oda')::boolean, false),
      coalesce((p_fields->>'medical_charges')::boolean, false),
      0, 0,
      nullif(btrim(coalesce(p_fields->>'cash_receipt_no','')),''),
      nullif(btrim(coalesce(p_fields->>'amount_received','')),'')::numeric,
      null,
      nullif(btrim(coalesce(p_fields->>'cash_receipt_date','')),'')::date,
      nullif(btrim(coalesce(p_fields->>'forwarding_awb','')),''),
      nullif(btrim(coalesce(p_fields->>'delivery_awb','')),''),
      nullif(btrim(coalesce(p_fields->>'return_awb','')),''),
      v_dvendor,
      nullif(btrim(coalesce(p_fields->>'delivery_service','')),''),
      nullif(btrim(coalesce(p_fields->>'flight_no','')),''),
      'DRAFT', now(), false, v_extras,
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
    if v_s.current_status in ('CANCELLED', 'VOID') then
      raise exception 'Cancelled shipments cannot be edited' using errcode = 'CMS02';
    end if;
    if v_s.current_status not in ('DRAFT', 'BOOKED') then
      raise exception 'This shipment can no longer be edited from AWB Entry' using errcode = 'CMS02';
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
      weight_unit = coalesce(nullif(btrim(p_fields->>'weight_unit'),''), weight_unit),
      shipment_value = nullif(btrim(coalesce(p_fields->>'shipment_value','')),'')::numeric,
      currency = coalesce(nullif(btrim(p_fields->>'currency'),''), currency),
      is_commercial = coalesce((p_fields->>'is_commercial')::boolean, is_commercial),
      is_oda = coalesce((p_fields->>'is_oda')::boolean, is_oda),
      medical_charges = coalesce((p_fields->>'medical_charges')::boolean, medical_charges),
      cash_receipt_no = nullif(btrim(coalesce(p_fields->>'cash_receipt_no','')),''),
      amount_received = nullif(btrim(coalesce(p_fields->>'amount_received','')),'')::numeric,
      cash_receipt_date = nullif(btrim(coalesce(p_fields->>'cash_receipt_date','')),'')::date,
      forwarding_awb = nullif(btrim(coalesce(p_fields->>'forwarding_awb','')),''),
      delivery_awb = nullif(btrim(coalesce(p_fields->>'delivery_awb','')),''),
      return_awb = nullif(btrim(coalesce(p_fields->>'return_awb','')),''),
      delivery_vendor_id = v_dvendor,
      delivery_service = nullif(btrim(coalesce(p_fields->>'delivery_service','')),''),
      flight_no = nullif(btrim(coalesce(p_fields->>'flight_no','')),''),
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
    p_old => jsonb_build_object('is_locked', true, 'awb_no', v_s.awb_no),
    p_new => jsonb_build_object(
      'change', 'unlock',
      'is_locked', false,
      'awb_no', v_s.awb_no,
      'unlocked_by', auth.uid(),
      'unlocked_at', now()));

  return v_s;
end
$$;

grant execute on function public.book_awb_shipment(uuid, integer, jsonb, jsonb, jsonb, jsonb, jsonb)
  to authenticated, service_role;
grant execute on function public.unlock_shipment(uuid)
  to authenticated, service_role;

comment on function public.book_awb_shipment(uuid, integer, jsonb, jsonb, jsonb, jsonb, jsonb) is
  'Validate, save, rate, and set BOOKED in one transaction. Rolls back the AWB number on any failure.';
comment on function public.unlock_shipment(uuid) is
  'Clear is_locked. Requires txn.awb-unlock. Writes who unlocked it and when.';
