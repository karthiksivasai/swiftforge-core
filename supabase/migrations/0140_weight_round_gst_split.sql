-- Branch state, half-kg charge weight, and one GST rounding rule.
-- Telangana is stored as states.code 'TS' (the value rating compares).
-- GST state code 36 is stored on states.gst_alias, the existing GST alias column.
-- Charge weight rounds up to the next 0.5 kg only when the vendor's
-- vol_weight_round_off flag is on. Service mappings have no separate flag.
-- GST: round the total tax to 2 decimals, then split that amount in half.

update public.states
   set gst_alias = '36'
 where code = 'TS'
   and name = 'Telangana'
   and deleted_at is null
   and coalesce(gst_alias, '') = '';

update public.branches
   set state_code = 'TS'
 where code in ('HO', 'HYD')
   and deleted_at is null
   and coalesce(state_code, '') = '';

-- The international test carriers should use the existing round-off switch.
update public.vendors
   set vol_weight_round_off = true
 where code in ('FEDE', 'DHL')
   and deleted_at is null
   and vol_weight_round_off = false;

create or replace function app.ceil_half_kg(p_weight numeric)
returns numeric
language sql
immutable
as $$
  select case
    when coalesce(p_weight, 0) <= 0 then 0
    else round(ceil(p_weight * 2 - 0.000000001) / 2, 3)
  end
$$;

create or replace function app.split_gst(
  p_taxable numeric,
  p_use_igst boolean,
  p_igst_pct numeric,
  p_cgst_pct numeric,
  p_sgst_pct numeric,
  out o_igst numeric,
  out o_cgst numeric,
  out o_sgst numeric,
  out o_tax numeric
)
language plpgsql
immutable
as $$
declare
  v_rate numeric;
  v_tax numeric;
  v_half numeric;
begin
  o_igst := 0;
  o_cgst := 0;
  o_sgst := 0;
  o_tax := 0;
  if coalesce(p_use_igst, true) then
    v_rate := coalesce(p_igst_pct, 0);
  else
    v_rate := coalesce(p_cgst_pct, 0) + coalesce(p_sgst_pct, 0);
  end if;
  v_tax := round(coalesce(p_taxable, 0) * v_rate / 100.0, 2);
  if coalesce(p_use_igst, true) then
    o_igst := v_tax;
  else
    v_half := round(v_tax / 2, 2);
    o_cgst := v_half;
    o_sgst := round(v_tax - v_half, 2);
  end if;
  o_tax := o_igst + o_cgst + o_sgst;
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
  v_round boolean := false;
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

  select v.code, v.name, coalesce(v.vol_weight_round_off, false)
    into v_vendor_code, v_vendor_name, v_round
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
    if v_round then
      v_line_chg := app.ceil_half_kg(v_line_chg);
    end if;
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
  v_round boolean := false;
  v_cm numeric := 5000;
  v_inch numeric := 305;
  v_piece public.shipment_pieces;
  v_pcs integer;
  v_act numeric;
  v_vol numeric;
  v_line numeric;
  v_total numeric := 0;
begin
  select * into v_s from public.shipments where id = p_shipment;
  if not found then
    return 0;
  end if;

  select coalesce(v.vol_weight_round_off, false) into v_round
    from public.vendors v
   where v.id = v_s.vendor_id and v.tenant_id = v_s.tenant_id;

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
    v_line := greatest(v_act, v_vol);
    if v_round then
      v_line := app.ceil_half_kg(v_line);
    end if;
    v_total := v_total + v_line;
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

  -- Customer GST already stored by rating. Re-split it with the one rule.
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
    customer_charges_total = v_grand,
    balance_amount = v_grand - coalesce(v_s.amount_received, 0),
    updated_by = auth.uid()
  where id = v_s.id;
end
$$;
