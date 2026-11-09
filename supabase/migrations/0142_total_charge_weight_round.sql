-- Round the shipment charge weight once, after the piece weights are added.
-- Each piece stays at max(actual, volumetric). The vendor flag
-- vol_weight_round_off still decides whether that total steps up to the next
-- 0.5 kg. Vendor contracts have no per-piece rounding column; unit is only
-- how the rate is charged (KG, LB, CBM, or PIECE). Customer rating uses the
-- shipment total. Vendor rating uses the same sum-then-round rule on the
-- vendor divisor.

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

  if v_round then
    v_charge := app.ceil_half_kg(v_charge);
  end if;

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
    v_total := v_total + v_line;
  end loop;

  if v_round then
    v_total := app.ceil_half_kg(v_total);
  end if;

  return coalesce(v_total, 0);
end
$$;

