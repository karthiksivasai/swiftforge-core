-- Migration 0160: Forwarding Tab Batch 2 - Vendor Cost Ex-GST, Vendor GST, Rating Engine Integration (FW-02, FW-03, FW-04, FW-06)
-- 1. Add charges_gst_on_export to public.vendors (default true)
-- 2. Add vendor_tax_total to public.shipments (default 0)
-- 3. Update app.run_shipment_rating to use delivery_vendor / delivery_service, calculate vendor contract fuel + vendor GST, and store vendor_charges_total ex-GST
-- 4. Update app.price_manual_charges to price manual VENDOR charge lines with vendor fuel % and vendor GST, adding to vendor_charges_total (ex-GST) and vendor_tax_total

-- Step 1: Add vendor export GST flag
alter table public.vendors
  add column if not exists charges_gst_on_export boolean not null default true;

comment on column public.vendors.charges_gst_on_export is
  'Whether the vendor levies GST on export shipments (default true, pending CA confirmation).';

-- Step 2: Add vendor_tax_total column on shipments
alter table public.shipments
  add column if not exists vendor_tax_total numeric(14,2) default 0;

comment on column public.shipments.vendor_tax_total is
  'Total GST charged by vendor across contract and manual vendor charge lines.';

-- Step 3: Update app.run_shipment_rating
create or replace function app.run_shipment_rating(
  p_shipment_id uuid,
  p_persist boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_s public.shipments;
  v_cust public.customers;
  v_zone uuid;
  v_rate public.customer_rates;
  v_as_of date;
  v_weight numeric(14,3);
  v_chargeable numeric(14,3);
  v_freight numeric(14,2) := 0;
  v_other numeric(14,2) := 0;
  v_fuel_pct numeric(7,4) := 0;
  v_fuel numeric(14,2) := 0;
  v_use_igst boolean := true;
  v_igst_pct numeric(7,4) := 0;
  v_cgst_pct numeric(7,4) := 0;
  v_sgst_pct numeric(7,4) := 0;
  v_taxable numeric(14,2) := 0;
  v_igst numeric(14,2) := 0;
  v_cgst numeric(14,2) := 0;
  v_sgst numeric(14,2) := 0;
  v_tax numeric(14,2) := 0;

  -- Vendor rating variables
  v_eff_vendor uuid;
  v_eff_service text;
  v_vendor_rec public.vendors;
  v_vendor numeric(14,2) := 0;
  v_vendor_fuel_pct numeric(7,4) := 0;
  v_vendor_fuel numeric(14,2) := 0;
  v_vendor_use_igst boolean := true;
  v_vendor_igst numeric(14,2) := 0;
  v_vendor_cgst numeric(14,2) := 0;
  v_vendor_sgst numeric(14,2) := 0;
  v_vendor_tax numeric(14,2) := 0;
  v_vendor_taxable numeric(14,2) := 0;
  v_vendor_state text;
  v_branch_state text;

  v_total numeric(14,2) := 0;
  v_apply_fuel boolean := true;
  v_apply_tax boolean := true;
  v_lines jsonb := '[]'::jsonb;
  v_seq integer := 0;
  v_line_amt numeric(14,2);
  v_line_fuel numeric(14,2);
  v_line_igst numeric(14,2);
  v_line_cgst numeric(14,2);
  v_line_sgst numeric(14,2);
  v_line_total numeric(14,2);
  v_row record;
  v_breakdown jsonb;
  v_ver integer;
begin
  select * into v_s from public.shipments
   where id = p_shipment_id and deleted_at is null;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;

  perform app.assert_shipment_rating_editable(v_s);

  v_as_of := coalesce(v_s.book_date, current_date);
  v_weight := coalesce(nullif(v_s.charge_weight,0), v_s.actual_weight, 0);

  if v_s.customer_id is not null then
    select * into v_cust from public.customers
     where id = v_s.customer_id and tenant_id = v_s.tenant_id and deleted_at is null;
    if found then
      v_apply_fuel := coalesce(v_cust.fuel_surcharge, true);
      v_apply_tax := coalesce(v_cust.tax, true);
    end if;
  end if;

  -- 1. Lane & Customer Freight
  v_zone := app.resolve_rating_zone(
    v_s.tenant_id, v_s.origin_destination_id, v_s.destination_id,
    v_s.vendor_id, v_s.product_id, v_s.service, v_as_of);

  v_rate := app.resolve_customer_rate(
    v_s.tenant_id, v_s.customer_id, v_s.product_id, v_s.service,
    v_s.origin_destination_id, v_s.destination_id, v_zone, v_as_of);

  if v_rate.id is not null then
    v_chargeable := greatest(v_weight, coalesce(v_rate.min_weight, 0));
    v_freight := round(v_chargeable * coalesce(v_rate.rate_per_kg, 0), 2);
  end if;

  -- 2. Customer other charges
  if v_s.customer_id is not null then
    for v_row in
      select * from public.customer_other_charges coc
       where coc.tenant_id = v_s.tenant_id and coc.customer_id = v_s.customer_id
         and coc.deleted_at is null and coc.status = 'ACTIVE'
         and (coc.product_id is null or coc.product_id = v_s.product_id)
         and (coc.destination_id is null or coc.destination_id = v_s.destination_id)
         and (coc.service is null or coc.service = v_s.service)
         and coc.from_date <= v_as_of
         and (coc.to_date is null or coc.to_date >= v_as_of)
       order by coc.seq
    loop
      v_line_amt := round(case
        when v_row.rate_type = 'FLAT' then v_row.rate
        when v_row.rate_type = 'PER_KG' then v_weight * v_row.rate
        else 0
      end, 2);
      if v_line_amt > 0 then
        v_other := v_other + v_line_amt;
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'code', coalesce(v_row.charge_type,'OTHER'),
          'description', coalesce(v_row.charge_type,'Other Charges'),
          'amount', v_line_amt,
          'fuel_applies', false, 'tax_applies', true, 'tax_on_fuel', false,
          'side', 'CUSTOMER', 'source', 'customer_other_charge'));
      end if;
    end loop;
  end if;

  -- 3. Customer Fuel
  if v_apply_fuel then
    v_fuel_pct := app.resolve_fuel_pct(
      v_s.tenant_id, v_s.customer_id, v_s.vendor_id, v_s.product_id,
      v_s.destination_id, v_as_of, coalesce(v_rate.fuel_pct, 0));
    v_fuel := round((v_freight + v_other) * coalesce(v_fuel_pct,0) / 100.0, 2);
  end if;

  -- 4. Customer Tax
  if v_apply_tax then
    select r.o_use_igst, r.o_igst, r.o_cgst, r.o_sgst
      into v_use_igst, v_igst_pct, v_cgst_pct, v_sgst_pct
      from app.resolve_tax_pcts(
        v_s.tenant_id, v_s.customer_id, v_s.product_id, v_s.branch_id, v_as_of) as r;
    v_taxable := v_freight + v_other + v_fuel;
    if v_use_igst then
      v_igst := round(v_taxable * v_igst_pct / 100.0, 2);
    else
      v_cgst := round(v_taxable * v_cgst_pct / 100.0, 2);
      v_sgst := round(v_taxable * v_sgst_pct / 100.0, 2);
    end if;
    v_tax := v_igst + v_cgst + v_sgst;
  end if;

  -- 5. Vendor Cost (FW-06 / D8 / D9): Effective Vendor & Delivery Service
  v_eff_vendor := coalesce(v_s.delivery_vendor_id, v_s.vendor_id);
  v_eff_service := coalesce(v_s.delivery_service, v_s.service);

  if v_eff_vendor is not null then
    select * into v_vendor_rec from public.vendors
     where id = v_eff_vendor and tenant_id = v_s.tenant_id;

    v_vendor := app.compute_vendor_cost(
      v_s.tenant_id, v_eff_vendor, v_s.product_id,
      v_s.origin_destination_id, v_s.destination_id, v_zone,
      v_eff_service, v_weight, v_as_of);

    v_vendor_fuel_pct := coalesce(app.resolve_fuel_pct(
      v_s.tenant_id, null, v_eff_vendor, v_s.product_id,
      v_s.destination_id, v_as_of, null), 0);

    if v_vendor > 0 and v_vendor_fuel_pct > 0 then
      v_vendor_fuel := round(v_vendor * v_vendor_fuel_pct / 100.0, 2);
    end if;

    -- Vendor GST resolution (D4)
    if coalesce(v_vendor_rec.charges_gst_on_export, true) and (v_vendor > 0 or v_vendor_fuel > 0) then
      select coalesce(st.code, substring(v_vendor_rec.gst_no from 1 for 2)) into v_vendor_state
        from public.vendors v
        left join public.states st on st.id = v.state_id
       where v.id = v_eff_vendor and v.tenant_id = v_s.tenant_id;

      select coalesce(b.state_code, st2.code) into v_branch_state
        from public.branches b
        left join public.states st2 on st2.id = b.state_id
       where b.id = v_s.branch_id and b.tenant_id = v_s.tenant_id;

      if v_vendor_state is not null and v_branch_state is not null
         and upper(btrim(v_vendor_state)) = upper(btrim(v_branch_state)) then
        v_vendor_use_igst := false;
      else
        v_vendor_use_igst := true;
      end if;

      v_vendor_taxable := v_vendor + v_vendor_fuel;
      if v_vendor_use_igst then
        v_vendor_igst := round(v_vendor_taxable * 0.18, 2);
        v_vendor_cgst := 0;
        v_vendor_sgst := 0;
      else
        v_vendor_cgst := round(v_vendor_taxable * 0.09, 2);
        v_vendor_sgst := round(v_vendor_taxable * 0.09, 2);
        v_vendor_igst := 0;
      end if;
      v_vendor_tax := v_vendor_igst + v_vendor_cgst + v_vendor_sgst;
    end if;
  end if;

  v_total := v_freight + v_other + v_fuel + v_tax;

  v_breakdown := jsonb_build_object(
    'as_of', v_as_of,
    'lane', jsonb_build_object(
      'origin_destination_id', v_s.origin_destination_id,
      'destination_id', v_s.destination_id,
      'zone_id', v_zone,
      'service', v_s.service),
    'freight', v_freight,
    'other_charges', v_other,
    'fuel', jsonb_build_object('pct', v_fuel_pct, 'amount', v_fuel, 'applied', v_apply_fuel),
    'tax', jsonb_build_object('amount', v_tax, 'applied', v_apply_tax),
    'vendor_cost', v_vendor,
    'vendor_fuel', v_vendor_fuel,
    'vendor_tax', v_vendor_tax,
    'vendor_cost_ex_gst', v_vendor + v_vendor_fuel,
    'total', v_total,
    'weight', v_weight);

  if not p_persist then
    return v_breakdown || jsonb_build_object('shipment_id', v_s.id, 'persisted', false);
  end if;

  -- Persist immutable snapshot for SYSTEM charges
  delete from public.shipment_charge_snapshots
   where tenant_id = v_s.tenant_id and shipment_id = v_s.id
     and charges_type = 'SYSTEM';

  -- Customer Freight Line
  v_seq := 1;
  v_line_fuel := case when v_apply_fuel then v_fuel else 0 end;
  v_line_igst := v_igst; v_line_cgst := v_cgst; v_line_sgst := v_sgst;
  v_line_total := v_freight + v_line_fuel + v_line_igst + v_line_cgst + v_line_sgst;
  insert into public.shipment_charge_snapshots (
    tenant_id, shipment_id, seq, side, description, rate, amount,
    fuel_applies, fuel_amount, tax_applies, tax_on_fuel,
    igst, sgst, cgst, total, charges_type, created_by, updated_by)
  values (
    v_s.tenant_id, v_s.id, v_seq, 'CUSTOMER', 'Freight',
    coalesce(v_rate.rate_per_kg, 0), v_freight,
    v_apply_fuel, v_line_fuel, v_apply_tax, false,
    v_line_igst, v_line_sgst, v_line_cgst, v_line_total, 'SYSTEM',
    auth.uid(), auth.uid());

  -- Customer Other Lines
  for v_row in select * from jsonb_array_elements(v_lines) t(elem)
  loop
    v_seq := v_seq + 1;
    v_line_amt := coalesce((v_row.elem->>'amount')::numeric, 0);
    insert into public.shipment_charge_snapshots (
      tenant_id, shipment_id, seq, side, description, rate, amount,
      fuel_applies, fuel_amount, tax_applies, tax_on_fuel,
      igst, sgst, cgst, total, charges_type, created_by, updated_by)
    values (
      v_s.tenant_id, v_s.id, v_seq, 'CUSTOMER',
      coalesce(v_row.elem->>'description','Other'),
      v_line_amt, v_line_amt,
      coalesce((v_row.elem->>'fuel_applies')::boolean, false), 0,
      coalesce((v_row.elem->>'tax_applies')::boolean, false), false,
      0, 0, 0, v_line_amt, 'SYSTEM', auth.uid(), auth.uid());
  end loop;

  -- Vendor Freight Line (contract freight + contract fuel + contract tax)
  if v_vendor > 0 or v_vendor_fuel > 0 then
    v_seq := v_seq + 1;
    insert into public.shipment_charge_snapshots (
      tenant_id, shipment_id, seq, side, description, rate, amount,
      fuel_applies, fuel_amount, tax_applies, tax_on_fuel,
      igst, sgst, cgst, total, charges_type, created_by, updated_by)
    values (
      v_s.tenant_id, v_s.id, v_seq, 'VENDOR', 'Vendor Freight',
      v_vendor, v_vendor,
      (v_vendor_fuel > 0), v_vendor_fuel,
      (v_vendor_tax > 0), (v_vendor_fuel > 0),
      v_vendor_igst, v_vendor_sgst, v_vendor_cgst,
      v_vendor + v_vendor_fuel + v_vendor_tax,
      'SYSTEM', auth.uid(), auth.uid());
  end if;

  v_ver := coalesce(v_s.rating_version, 0) + 1;

  -- Store vendor_charges_total EXCLUDING GST (D3, D4): contract freight + contract fuel
  -- Store vendor_tax_total separately (D4): contract GST
  update public.shipments set
    customer_charges_total = v_freight + v_other,
    vendor_charges_total = v_vendor + v_vendor_fuel,
    vendor_tax_total = v_vendor_tax,
    fuel_amount = v_fuel,
    tax_amount = v_tax,
    grand_total = v_total,
    rating_version = v_ver,
    rated_at = now(),
    updated_at = now(),
    updated_by = auth.uid(),
    row_version = row_version + 1
  where id = v_s.id and tenant_id = v_s.tenant_id;

  return v_breakdown || jsonb_build_object('shipment_id', v_s.id, 'persisted', true);
end;
$$;

-- Step 4: Update app.price_manual_charges to price both CUSTOMER and VENDOR manual lines
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

  -- Customer additions
  v_extra_cust numeric := 0;
  v_extra_cust_fuel numeric := 0;
  v_extra_cust_tax numeric := 0;

  -- Vendor additions
  v_extra_vendor_ex_gst numeric := 0;
  v_extra_vendor_tax numeric := 0;
  v_eff_vendor uuid;
  v_vendor_rec public.vendors;
  v_vendor_fuel_pct numeric := 0;
  v_vendor_state text;
  v_branch_state text;
  v_vendor_use_igst boolean := true;

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
  v_eff_vendor := coalesce(v_s.delivery_vendor_id, v_s.vendor_id);

  if v_eff_vendor is not null then
    select * into v_vendor_rec from public.vendors
     where id = v_eff_vendor and tenant_id = v_s.tenant_id;

    v_vendor_fuel_pct := coalesce(app.resolve_fuel_pct(
      v_s.tenant_id, null, v_eff_vendor, v_s.product_id,
      v_s.destination_id, v_as_of, null), 0);

    select coalesce(st.code, substring(v_vendor_rec.gst_no from 1 for 2)) into v_vendor_state
      from public.vendors v
      left join public.states st on st.id = v.state_id
     where v.id = v_eff_vendor and v.tenant_id = v_s.tenant_id;

    select coalesce(b.state_code, st2.code) into v_branch_state
      from public.branches b
      left join public.states st2 on st2.id = b.state_id
     where b.id = v_s.branch_id and b.tenant_id = v_s.tenant_id;

    if v_vendor_state is not null and v_branch_state is not null
       and upper(btrim(v_vendor_state)) = upper(btrim(v_branch_state)) then
      v_vendor_use_igst := false;
    else
      v_vendor_use_igst := true;
    end if;
  end if;

  select coalesce(max(seq), 0) into v_seq
    from public.shipment_charge_snapshots
   where shipment_id = v_s.id and tenant_id = v_s.tenant_id;

  for v_elem in select * from jsonb_array_elements(p_charges)
  loop
    v_desc := btrim(coalesce(v_elem->>'description', ''));
    v_side := upper(coalesce(nullif(btrim(v_elem->>'side'), ''), 'CUSTOMER'));
    v_kind := upper(coalesce(v_elem->>'charges_type', 'MANUAL'));

    if v_desc = '' or upper(v_desc) in ('FREIGHT', 'VENDOR FREIGHT') or v_kind = 'SYSTEM' then
      continue;
    end if;

    v_amount := round(coalesce(nullif(btrim(coalesce(v_elem->>'amount', '')), '')::numeric, 0), 2);
    if v_amount <= 0 then
      continue;
    end if;

    v_fuel_on := coalesce((v_elem->>'fuel_applies')::boolean, false);
    v_tax_on := coalesce((v_elem->>'tax_applies')::boolean, false);
    v_tax_fuel := coalesce((v_elem->>'tax_on_fuel')::boolean, false);

    if v_side = 'CUSTOMER' then
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

      v_extra_cust := v_extra_cust + v_total;
      v_extra_cust_fuel := v_extra_cust_fuel + v_fuel;
      v_extra_cust_tax := v_extra_cust_tax + v_tax;

    elsif v_side = 'VENDOR' then
      -- Vendor manual line pricing (D3, D4)
      v_fuel := case when v_fuel_on then round(v_amount * v_vendor_fuel_pct / 100.0, 2) else 0 end;
      v_taxable := (case when v_tax_on then v_amount else 0 end) + (case when v_tax_fuel then v_fuel else 0 end);
      v_igst := 0; v_cgst := 0; v_sgst := 0; v_tax := 0;

      if v_taxable > 0 and coalesce(v_vendor_rec.charges_gst_on_export, true) then
        if v_vendor_use_igst then
          v_igst := round(v_taxable * 0.18, 2);
        else
          v_cgst := round(v_taxable * 0.09, 2);
          v_sgst := round(v_taxable * 0.09, 2);
        end if;
        v_tax := v_igst + v_cgst + v_sgst;
      end if;

      v_total := v_amount + v_fuel + v_tax;

      v_seq := v_seq + 1;
      insert into public.shipment_charge_snapshots (
        tenant_id, shipment_id, seq, side, description, rate, amount,
        fuel_applies, fuel_amount, tax_applies, tax_on_fuel,
        igst, sgst, cgst, total, charges_type, created_by, updated_by)
      values (
        v_s.tenant_id, v_s.id, v_seq, 'VENDOR', v_desc, v_amount, v_amount,
        v_fuel_on, v_fuel, v_tax_on, v_tax_fuel,
        v_igst, v_sgst, v_cgst, v_total, 'MANUAL', auth.uid(), auth.uid());

      -- Vendor cost EXCLUDING GST: manual amount + manual fuel
      v_extra_vendor_ex_gst := v_extra_vendor_ex_gst + v_amount + v_fuel;
      -- Vendor GST: igst or cgst+sgst
      v_extra_vendor_tax := v_extra_vendor_tax + v_tax;
    end if;
  end loop;

  v_grand := round(coalesce(v_s.grand_total, 0) + v_extra_cust, 2);
  if coalesce(v_s.amount_received, 0) > v_grand then
    raise exception 'Amount received cannot be more than the total' using errcode = '22023';
  end if;

  update public.shipments set
    grand_total = v_grand,
    customer_charges_total = round(coalesce(customer_charges_total, 0) + v_extra_cust, 2),
    fuel_amount = round(coalesce(fuel_amount, 0) + v_extra_cust_fuel, 2),
    tax_amount = round(coalesce(tax_amount, 0) + v_extra_cust_tax, 2),
    vendor_charges_total = round(coalesce(vendor_charges_total, 0) + v_extra_vendor_ex_gst, 2),
    vendor_tax_total = round(coalesce(vendor_tax_total, 0) + v_extra_vendor_tax, 2),
    balance_amount = v_grand - coalesce(amount_received, 0),
    updated_by = auth.uid()
  where id = v_s.id;
end;
$$;

