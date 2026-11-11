-- ===========================================================================
-- 0151  Safe Rate Update. Jobs no longer rewrite booked AWBs.
-- ---------------------------------------------------------------------------
-- Preview reads. Apply writes, and only after the user confirms.
-- Invoiced, locked, and cancelled AWBs are never changed.
-- Manual charge lines are kept. Nothing in this migration deletes rows
-- or drops rate_update_jobs / zone_update_jobs. Those tables stay as history.
-- The job screens are removed in the app. The execute functions refuse.
-- ===========================================================================

create or replace function app.assert_rate_update_execute_permission(p_tenant uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, app
as $$
begin
  if app.is_platform_admin() or app.is_tenant_admin(p_tenant) then
    return;
  end if;
  if app.user_has_permission(p_tenant, 'utl.rate-update', 'modify') then
    return;
  end if;
  raise exception 'Permission denied: utl.rate-update modify' using errcode = '42501';
end
$$;

-- Resolve the on-screen filters. Every filter that is sent is applied.
create or replace function app.normalize_rate_update_filters(
  p_tenant uuid,
  p_filters jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_from date;
  v_to date;
  v_cust uuid;
  v_prod uuid;
  v_dest uuid;
  v_branch uuid;
  v_zone uuid;
  v_origin uuid;
  v_vendor uuid;
  v_code text;
  v_pay text;
  v_pay_code text;
  v_contract text;
  v_confirm boolean;
begin
  begin
    v_from := nullif(btrim(coalesce(v_f->>'from_date','')),'')::date;
    v_to := nullif(btrim(coalesce(v_f->>'to_date','')),'')::date;
  exception when others then
    raise exception 'Invalid date range in filters' using errcode = 'CMS04';
  end;
  if v_from is null or v_to is null then
    raise exception 'from_date and to_date are required' using errcode = 'CMS04';
  end if;
  if v_to < v_from then
    raise exception 'Invalid date range' using errcode = 'CMS04';
  end if;
  if (v_to - v_from) > 92 then
    raise exception 'Date range cannot exceed 92 days' using errcode = 'CMS04';
  end if;

  v_cust := nullif(btrim(coalesce(v_f->>'customer_id','')),'')::uuid;
  v_code := nullif(btrim(coalesce(v_f->>'customer_code','')),'');
  if v_cust is null and v_code is not null then
    select id into v_cust from public.customers
     where tenant_id = p_tenant and code = v_code and deleted_at is null;
    if v_cust is null then
      raise exception 'Customer "%" not found', v_code using errcode = 'CMS04';
    end if;
  end if;

  v_prod := nullif(btrim(coalesce(v_f->>'product_id','')),'')::uuid;
  v_code := nullif(btrim(coalesce(v_f->>'product_code','')),'');
  if v_prod is null and v_code is not null then
    select id into v_prod from public.products
     where tenant_id = p_tenant and code = v_code and deleted_at is null;
    if v_prod is null then
      raise exception 'Product "%" not found', v_code using errcode = 'CMS04';
    end if;
  end if;

  v_dest := nullif(btrim(coalesce(v_f->>'destination_id','')),'')::uuid;
  v_code := nullif(btrim(coalesce(v_f->>'destination_code','')),'');
  if v_dest is null and v_code is not null then
    select id into v_dest from public.destinations
     where tenant_id = p_tenant and code = v_code and deleted_at is null;
    if v_dest is null then
      raise exception 'Destination "%" not found', v_code using errcode = 'CMS04';
    end if;
  end if;

  v_origin := nullif(btrim(coalesce(v_f->>'origin_id','')),'')::uuid;
  v_code := nullif(btrim(coalesce(v_f->>'origin_code','')),'');
  if v_origin is null and v_code is not null then
    select id into v_origin from public.destinations
     where tenant_id = p_tenant and code = v_code and deleted_at is null;
    if v_origin is null then
      raise exception 'Origin "%" not found', v_code using errcode = 'CMS04';
    end if;
  end if;

  v_vendor := nullif(btrim(coalesce(v_f->>'vendor_id','')),'')::uuid;
  v_code := nullif(btrim(coalesce(v_f->>'vendor_code','')),'');
  if v_vendor is null and v_code is not null then
    select id into v_vendor from public.vendors
     where tenant_id = p_tenant and code = v_code and deleted_at is null;
    if v_vendor is null then
      raise exception 'Vendor "%" not found', v_code using errcode = 'CMS04';
    end if;
  end if;

  v_branch := nullif(btrim(coalesce(v_f->>'branch_id','')),'')::uuid;
  v_code := nullif(btrim(coalesce(v_f->>'branch_code','')),'');
  if v_branch is null and v_code is not null then
    select id into v_branch from public.branches
     where tenant_id = p_tenant and code = v_code and deleted_at is null;
    if v_branch is null then
      raise exception 'Branch "%" not found', v_code using errcode = 'CMS04';
    end if;
  end if;

  v_zone := nullif(btrim(coalesce(v_f->>'zone_id','')),'')::uuid;
  v_code := nullif(btrim(coalesce(v_f->>'zone_code','')),'');
  if v_zone is null and v_code is not null then
    select id into v_zone from public.zones
     where tenant_id = p_tenant and code = v_code and deleted_at is null;
    if v_zone is null then
      raise exception 'Zone "%" not found', v_code using errcode = 'CMS04';
    end if;
  end if;

  v_pay := nullif(btrim(coalesce(v_f->>'payment_type','')),'');
  v_pay_code := nullif(btrim(coalesce(v_f->>'payment_code','')),'');
  v_contract := case
    when lower(coalesce(v_f->>'contract_mode','')) in ('zero','zero-contract') then 'zero'
    else 'all'
  end;
  v_confirm := coalesce(v_f->'confirm_all', 'false'::jsonb) = 'true'::jsonb;

  if v_cust is null and v_vendor is null and v_dest is null and not v_confirm then
    raise exception 'Choose a customer, vendor, or destination, or tick I confirm all shipments in this date range'
      using errcode = 'CMS04';
  end if;

  return jsonb_build_object(
    'from_date', v_from,
    'to_date', v_to,
    'customer_id', v_cust,
    'product_id', v_prod,
    'destination_id', v_dest,
    'origin_id', v_origin,
    'vendor_id', v_vendor,
    'branch_id', v_branch,
    'zone_id', v_zone,
    'payment_type', v_pay,
    'payment_code', v_pay_code,
    'contract_mode', v_contract,
    'confirm_all', v_confirm);
end
$$;

-- Every matching shipment. No silent cap.
create or replace function app.rate_update_candidate_ids(
  p_tenant uuid,
  p_filters jsonb
)
returns table (shipment_id uuid, row_version integer, skip_reason text)
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_from date := (p_filters->>'from_date')::date;
  v_to date := (p_filters->>'to_date')::date;
  v_cust uuid := nullif(p_filters->>'customer_id','')::uuid;
  v_prod uuid := nullif(p_filters->>'product_id','')::uuid;
  v_dest uuid := nullif(p_filters->>'destination_id','')::uuid;
  v_origin uuid := nullif(p_filters->>'origin_id','')::uuid;
  v_vendor uuid := nullif(p_filters->>'vendor_id','')::uuid;
  v_branch uuid := nullif(p_filters->>'branch_id','')::uuid;
  v_zone uuid := nullif(p_filters->>'zone_id','')::uuid;
  v_pay text := nullif(btrim(coalesce(p_filters->>'payment_type','')),'');
  v_pay_code text := nullif(btrim(coalesce(p_filters->>'payment_code','')),'');
  v_zero boolean := coalesce(p_filters->>'contract_mode','') = 'zero';
begin
  return query
  select
    s.id,
    s.row_version,
    case
      when s.is_locked then 'locked'
      when s.invoice_id is not null then 'invoiced'
      when s.current_status in ('CANCELLED','VOID') then 'cancelled'
      else null
    end as skip_reason
  from public.shipments s
  left join public.destinations d
    on d.id = s.destination_id and d.tenant_id = s.tenant_id
  where s.tenant_id = p_tenant
    and s.deleted_at is null
    and s.book_date between v_from and v_to
    and (v_cust is null or s.customer_id = v_cust)
    and (v_prod is null or s.product_id = v_prod)
    and (v_dest is null or s.destination_id = v_dest)
    and (v_origin is null or s.origin_destination_id = v_origin)
    and (v_vendor is null or s.vendor_id = v_vendor)
    and (v_branch is null or s.branch_id = v_branch)
    and (
      v_pay is null
      or upper(btrim(coalesce(s.payment_type,''))) = upper(v_pay)
      or (v_pay_code is not null and upper(btrim(coalesce(s.payment_type,''))) = upper(v_pay_code))
    )
    and (
      not v_zero
      or coalesce((
        select scs.amount
          from public.shipment_charge_snapshots scs
         where scs.tenant_id = s.tenant_id
           and scs.shipment_id = s.id
           and scs.deleted_at is null
           and scs.side = 'CUSTOMER'
           and scs.charges_type = 'SYSTEM'
           and upper(btrim(scs.description)) in ('FREIGHT','FREIGHT CHARGE')
         order by scs.seq
         limit 1
      ), 0) = 0
    )
    and (
      v_zone is null
      or d.zone_id = v_zone
      or s.zone_id = v_zone
      or exists (
        select 1 from public.zone_mappings zm
         where zm.tenant_id = p_tenant
           and zm.deleted_at is null
           and zm.zone_id = v_zone
           and (zm.origin_destination_id is null
                or zm.origin_destination_id is not distinct from s.origin_destination_id)
           and (zm.destination_id is null
                or zm.destination_id is not distinct from s.destination_id)
      )
    )
  order by s.book_date, s.awb_no;
end
$$;

-- One AWB. Does not write. Manual lines stay in the total and are not repriced.
create or replace function app.quote_rate_update_shipment(
  p_s public.shipments,
  p_update_type text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_type text := upper(btrim(coalesce(p_update_type,'')));
  v_skip text;
  v_line_id uuid;
  v_vendor_line_id uuid;
  v_old_freight numeric(14,2) := 0;
  v_old_fuel numeric(14,2) := 0;
  v_old_igst numeric(14,2) := 0;
  v_old_cgst numeric(14,2) := 0;
  v_old_sgst numeric(14,2) := 0;
  v_old_tax numeric(14,2) := 0;
  v_manual_total numeric(14,2) := 0;
  v_manual_fuel numeric(14,2) := 0;
  v_manual_tax numeric(14,2) := 0;
  v_other numeric(14,2) := 0;
  v_old_vendor numeric(14,2) := 0;
  v_old_total numeric(14,2) := 0;
  v_new_freight numeric(14,2) := 0;
  v_new_fuel numeric(14,2) := 0;
  v_new_tax numeric(14,2) := 0;
  v_new_igst numeric(14,2) := 0;
  v_new_cgst numeric(14,2) := 0;
  v_new_sgst numeric(14,2) := 0;
  v_new_vendor numeric(14,2) := 0;
  v_new_total numeric(14,2) := 0;
  v_difference numeric(14,2) := 0;
  v_weight numeric(14,3) := 0;
  v_chargeable numeric(14,3) := 0;
  v_zone uuid;
  v_new_zone uuid;
  v_rate public.customer_rates;
  v_fuel_pct numeric := 0;
  v_use_igst boolean := true;
  v_igst_pct numeric := 0;
  v_cgst_pct numeric := 0;
  v_sgst_pct numeric := 0;
  v_contract uuid;
  v_as_of date;
  v_old_zone_code text;
  v_new_zone_code text;
  v_cust_code text;
  v_cust_name text;
  v_changed boolean := false;
begin
  v_skip := case
    when p_s.is_locked then 'locked'
    when p_s.invoice_id is not null then 'invoiced'
    when p_s.current_status in ('CANCELLED','VOID') then 'cancelled'
    else null
  end;

  select scs.id, scs.amount, scs.fuel_amount, scs.igst, scs.cgst, scs.sgst
    into v_line_id, v_old_freight, v_old_fuel, v_old_igst, v_old_cgst, v_old_sgst
    from public.shipment_charge_snapshots scs
   where scs.tenant_id = p_s.tenant_id
     and scs.shipment_id = p_s.id
     and scs.deleted_at is null
     and scs.side = 'CUSTOMER'
     and scs.charges_type = 'SYSTEM'
     and upper(btrim(scs.description)) in ('FREIGHT','FREIGHT CHARGE')
   order by scs.seq
   limit 1;

  v_old_freight := coalesce(v_old_freight, 0);
  v_old_fuel := coalesce(v_old_fuel, 0);
  v_old_tax := coalesce(v_old_igst, 0) + coalesce(v_old_cgst, 0) + coalesce(v_old_sgst, 0);

  select coalesce(sum(scs.total), 0),
         coalesce(sum(scs.fuel_amount), 0),
         coalesce(sum(scs.igst + scs.cgst + scs.sgst), 0)
    into v_manual_total, v_manual_fuel, v_manual_tax
    from public.shipment_charge_snapshots scs
   where scs.tenant_id = p_s.tenant_id
     and scs.shipment_id = p_s.id
     and scs.deleted_at is null
     and scs.side = 'CUSTOMER'
     and scs.charges_type = 'MANUAL';

  select coalesce(sum(scs.total), 0)
    into v_other
    from public.shipment_charge_snapshots scs
   where scs.tenant_id = p_s.tenant_id
     and scs.shipment_id = p_s.id
     and scs.deleted_at is null
     and scs.side = 'CUSTOMER'
     and scs.charges_type = 'SYSTEM'
     and (v_line_id is null or scs.id <> v_line_id);

  select scs.id
    into v_vendor_line_id
    from public.shipment_charge_snapshots scs
   where scs.tenant_id = p_s.tenant_id
     and scs.shipment_id = p_s.id
     and scs.deleted_at is null
     and scs.side = 'VENDOR'
     and scs.charges_type = 'SYSTEM'
   order by scs.seq
   limit 1;

  v_old_vendor := coalesce(p_s.vendor_charges_total, 0);
  v_old_total := round(v_old_freight + v_old_fuel + v_old_tax + v_manual_total + v_other, 2);
  v_new_freight := v_old_freight;
  v_new_fuel := v_old_fuel;
  v_new_tax := v_old_tax;
  v_new_igst := coalesce(v_old_igst, 0);
  v_new_cgst := coalesce(v_old_cgst, 0);
  v_new_sgst := coalesce(v_old_sgst, 0);
  v_new_vendor := v_old_vendor;
  v_new_zone := p_s.zone_id;
  v_as_of := coalesce(p_s.book_date, current_date);

  if v_skip is null and v_type = 'AWB_RATE' then
    v_weight := coalesce(nullif(p_s.charge_weight, 0), p_s.actual_weight, 0);
    v_zone := app.resolve_rating_zone(
      p_s.tenant_id, p_s.origin_destination_id, p_s.destination_id,
      p_s.vendor_id, p_s.product_id, p_s.service, v_as_of);
    v_new_zone := coalesce(v_zone, p_s.zone_id);
    v_rate := app.resolve_customer_rate(
      p_s.tenant_id, p_s.customer_id, p_s.product_id, p_s.service,
      p_s.origin_destination_id, p_s.destination_id, v_new_zone, v_as_of);
    if v_rate.id is not null then
      v_chargeable := greatest(v_weight, coalesce(v_rate.min_weight, 0));
      v_new_freight := round(v_chargeable * coalesce(v_rate.rate_per_kg, 0), 2);
    end if;
    v_fuel_pct := coalesce(app.resolve_fuel_pct(
      p_s.tenant_id, p_s.customer_id, p_s.vendor_id, p_s.product_id,
      p_s.destination_id, v_as_of, null), 0);
    v_new_fuel := round(v_new_freight * v_fuel_pct / 100.0, 2);
    select r.o_use_igst, r.o_igst, r.o_cgst, r.o_sgst
      into v_use_igst, v_igst_pct, v_cgst_pct, v_sgst_pct
      from app.resolve_tax_pcts(
        p_s.tenant_id, p_s.customer_id, p_s.product_id, p_s.branch_id, v_as_of) as r;
    select g.o_igst, g.o_cgst, g.o_sgst, g.o_tax
      into v_new_igst, v_new_cgst, v_new_sgst, v_new_tax
      from app.split_gst(v_new_freight + v_new_fuel, v_use_igst, v_igst_pct, v_cgst_pct, v_sgst_pct) as g;
  elsif v_skip is null and v_type = 'TAX_FUEL' then
    v_fuel_pct := coalesce(app.resolve_fuel_pct(
      p_s.tenant_id, p_s.customer_id, p_s.vendor_id, p_s.product_id,
      p_s.destination_id, v_as_of, null), 0);
    v_new_fuel := round(v_old_freight * v_fuel_pct / 100.0, 2);
    select r.o_use_igst, r.o_igst, r.o_cgst, r.o_sgst
      into v_use_igst, v_igst_pct, v_cgst_pct, v_sgst_pct
      from app.resolve_tax_pcts(
        p_s.tenant_id, p_s.customer_id, p_s.product_id, p_s.branch_id, v_as_of) as r;
    select g.o_igst, g.o_cgst, g.o_sgst, g.o_tax
      into v_new_igst, v_new_cgst, v_new_sgst, v_new_tax
      from app.split_gst(v_old_freight + v_new_fuel, v_use_igst, v_igst_pct, v_cgst_pct, v_sgst_pct) as g;
  elsif v_skip is null and v_type = 'VENDOR_RATE' then
    v_zone := coalesce(p_s.zone_id, app.resolve_rating_zone(
      p_s.tenant_id, p_s.origin_destination_id, p_s.destination_id,
      p_s.vendor_id, p_s.product_id, p_s.service, v_as_of));
    v_weight := coalesce(nullif(p_s.charge_weight, 0), p_s.actual_weight, 0);
    select vc.id into v_contract
      from public.vendor_contracts vc
     where vc.tenant_id = p_s.tenant_id
       and vc.deleted_at is null
       and vc.status = 'ACTIVE'
       and vc.vendor_id = p_s.vendor_id
       and vc.product_id = p_s.product_id
       and vc.from_date <= v_as_of
       and (vc.origin_destination_id is null or vc.origin_destination_id = p_s.origin_destination_id)
       and (vc.destination_id is null or vc.destination_id = p_s.destination_id)
       and (vc.zone_id is null or vc.zone_id = v_zone)
       and (vc.service is null or nullif(btrim(vc.service),'') is null
            or upper(vc.service) = upper(coalesce(p_s.service,'')))
     limit 1;
    if v_contract is not null then
      v_new_vendor := coalesce(app.compute_vendor_cost(
        p_s.tenant_id, p_s.vendor_id, p_s.product_id, p_s.origin_destination_id,
        p_s.destination_id, v_zone, p_s.service, v_weight, v_as_of), 0);
    end if;
  end if;

  v_old_total := round(v_old_freight + v_old_fuel + v_old_tax + v_manual_total + v_other, 2);
  v_new_total := round(v_new_freight + v_new_fuel + v_new_tax + v_manual_total + v_other, 2);
  if v_type = 'VENDOR_RATE' then
    v_difference := case when v_skip is null then round(v_new_vendor - v_old_vendor, 2) else 0 end;
    v_old_total := v_old_vendor;
    v_new_total := case when v_skip is null then v_new_vendor else v_old_vendor end;
  else
    v_difference := case when v_skip is null then round(v_new_total - v_old_total, 2) else 0 end;
  end if;

  if v_skip is not null then
    v_new_freight := v_old_freight;
    v_new_fuel := v_old_fuel;
    v_new_tax := v_old_tax;
    v_new_vendor := v_old_vendor;
    v_new_zone := p_s.zone_id;
    v_new_total := v_old_total;
    v_difference := 0;
  end if;

  select z.code into v_old_zone_code from public.zones z
   where z.id = p_s.zone_id and z.tenant_id = p_s.tenant_id;
  select z.code into v_new_zone_code from public.zones z
   where z.id = v_new_zone and z.tenant_id = p_s.tenant_id;
  select c.code, c.name into v_cust_code, v_cust_name
    from public.customers c
   where c.id = p_s.customer_id and c.tenant_id = p_s.tenant_id;

  v_changed := v_skip is null and (
    v_difference <> 0
    or (v_type = 'AWB_RATE' and v_new_zone is distinct from p_s.zone_id)
  );

  return jsonb_build_object(
    'shipment_id', p_s.id,
    'awb_no', p_s.awb_no,
    'customer_code', v_cust_code,
    'customer_name', v_cust_name,
    'old_zone', v_old_zone_code,
    'new_zone', v_new_zone_code,
    'old_zone_id', p_s.zone_id,
    'new_zone_id', v_new_zone,
    'old_freight', v_old_freight,
    'new_freight', v_new_freight,
    'old_fuel', v_old_fuel,
    'new_fuel', v_new_fuel,
    'old_tax', v_old_tax,
    'new_tax', v_new_tax,
    'new_igst', v_new_igst,
    'new_cgst', v_new_cgst,
    'new_sgst', v_new_sgst,
    'old_total', v_old_total,
    'new_total', v_new_total,
    'old_vendor', v_old_vendor,
    'new_vendor', v_new_vendor,
    'difference', v_difference,
    'manual_total', v_manual_total,
    'manual_fuel', v_manual_fuel,
    'manual_tax', v_manual_tax,
    'other_total', v_other,
    'freight_line_id', v_line_id,
    'vendor_line_id', v_vendor_line_id,
    'rate_per_kg', case when v_rate.id is null then null else v_rate.rate_per_kg end,
    'skip_reason', v_skip,
    'changed', v_changed);
end
$$;

create or replace function public.preview_rate_update(
  p_update_type text default 'AWB_RATE',
  p_filters jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_type text := upper(nullif(btrim(coalesce(p_update_type,'AWB_RATE')),''));
  v_filters jsonb;
  v_row record;
  v_s public.shipments;
  v_quote jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_change int := 0;
  v_skip int := 0;
  v_unchanged int := 0;
  v_diff numeric(14,2) := 0;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  perform app.assert_rate_update_execute_permission(v_tenant);

  if v_type = 'OBC_RATE' then
    raise exception 'Vendor OBC Rate is not a separate price. Use Vendor Rate.'
      using errcode = 'CMS04';
  end if;
  if v_type not in ('AWB_RATE','VENDOR_RATE','TAX_FUEL') then
    raise exception 'Unsupported update_type: %', v_type using errcode = 'CMS04';
  end if;

  v_filters := app.normalize_rate_update_filters(v_tenant, p_filters);

  for v_row in
    select c.shipment_id from app.rate_update_candidate_ids(v_tenant, v_filters) c
  loop
    select * into v_s from public.shipments
     where id = v_row.shipment_id and tenant_id = v_tenant;
    begin
      v_quote := app.quote_rate_update_shipment(v_s, v_type);
    exception when others then
      v_quote := jsonb_build_object(
        'shipment_id', v_s.id,
        'awb_no', v_s.awb_no,
        'customer_code', null,
        'customer_name', null,
        'old_zone', null, 'new_zone', null,
        'old_freight', 0, 'new_freight', 0,
        'old_fuel', 0, 'new_fuel', 0,
        'old_tax', 0, 'new_tax', 0,
        'old_total', 0, 'new_total', 0,
        'difference', 0,
        'skip_reason', sqlerrm,
        'changed', false);
    end;

    if v_quote->>'skip_reason' is not null then
      v_skip := v_skip + 1;
      v_rows := v_rows || jsonb_build_array(v_quote);
    elsif coalesce((v_quote->>'changed')::boolean, false) then
      v_change := v_change + 1;
      v_diff := v_diff + coalesce((v_quote->>'difference')::numeric, 0);
      v_rows := v_rows || jsonb_build_array(v_quote);
    else
      v_unchanged := v_unchanged + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'update_type', v_type,
    'rows', v_rows,
    'change_count', v_change,
    'skip_count', v_skip,
    'unchanged_count', v_unchanged,
    'difference_total', round(v_diff, 2),
    'truncated', false,
    'omitted_count', 0);
end
$$;

revoke all on function public.preview_rate_update(text, jsonb) from public;
grant execute on function public.preview_rate_update(text, jsonb) to authenticated, service_role;

create or replace function public.apply_rate_update(
  p_update_type text default 'AWB_RATE',
  p_filters jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_type text := upper(nullif(btrim(coalesce(p_update_type,'AWB_RATE')),''));
  v_filters jsonb;
  v_row record;
  v_s public.shipments;
  v_quote jsonb;
  v_applied int := 0;
  v_skip int := 0;
  v_unchanged int := 0;
  v_diff numeric(14,2) := 0;
  v_seq integer;
  v_line uuid;
  v_freight numeric(14,2);
  v_fuel numeric(14,2);
  v_tax numeric(14,2);
  v_igst numeric(14,2);
  v_cgst numeric(14,2);
  v_sgst numeric(14,2);
  v_total numeric(14,2);
  v_vendor numeric(14,2);
  v_manual_fuel numeric(14,2);
  v_manual_tax numeric(14,2);
  v_job_id uuid;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  perform app.assert_rate_update_execute_permission(v_tenant);

  if v_type = 'OBC_RATE' then
    raise exception 'Vendor OBC Rate is not a separate price. Use Vendor Rate.'
      using errcode = 'CMS04';
  end if;
  if v_type not in ('AWB_RATE','VENDOR_RATE','TAX_FUEL') then
    raise exception 'Unsupported update_type: %', v_type using errcode = 'CMS04';
  end if;

  v_filters := app.normalize_rate_update_filters(v_tenant, p_filters);

  for v_row in
    select c.shipment_id from app.rate_update_candidate_ids(v_tenant, v_filters) c
  loop
    select * into v_s from public.shipments
     where id = v_row.shipment_id and tenant_id = v_tenant
     for update;
    v_quote := app.quote_rate_update_shipment(v_s, v_type);

    if v_quote->>'skip_reason' is not null then
      v_skip := v_skip + 1;
      continue;
    end if;
    if coalesce((v_quote->>'changed')::boolean, false) is not true then
      v_unchanged := v_unchanged + 1;
      continue;
    end if;

    v_freight := coalesce((v_quote->>'new_freight')::numeric, 0);
    v_fuel := coalesce((v_quote->>'new_fuel')::numeric, 0);
    v_tax := coalesce((v_quote->>'new_tax')::numeric, 0);
    v_igst := coalesce((v_quote->>'new_igst')::numeric, 0);
    v_cgst := coalesce((v_quote->>'new_cgst')::numeric, 0);
    v_sgst := coalesce((v_quote->>'new_sgst')::numeric, 0);
    v_vendor := coalesce((v_quote->>'new_vendor')::numeric, 0);
    v_manual_fuel := coalesce((v_quote->>'manual_fuel')::numeric, 0);
    v_manual_tax := coalesce((v_quote->>'manual_tax')::numeric, 0);
    v_line := nullif(v_quote->>'freight_line_id','')::uuid;

    if v_type in ('AWB_RATE','TAX_FUEL') then
      v_total := round(v_freight + v_fuel + v_tax, 2);
      if v_line is not null then
        update public.shipment_charge_snapshots set
          amount = case when v_type = 'AWB_RATE' then v_freight else amount end,
          rate = case
            when v_type = 'AWB_RATE' and v_quote->>'rate_per_kg' is not null
              then (v_quote->>'rate_per_kg')::numeric
            else rate
          end,
          fuel_amount = v_fuel,
          fuel_applies = v_fuel <> 0,
          tax_applies = v_tax <> 0,
          igst = v_igst,
          cgst = v_cgst,
          sgst = v_sgst,
          total = v_total,
          updated_at = now(),
          updated_by = auth.uid(),
          row_version = row_version + 1
        where id = v_line
          and tenant_id = v_tenant
          and shipment_id = v_s.id
          and charges_type = 'SYSTEM'
          and side = 'CUSTOMER';
      else
        select coalesce(max(seq), 0) + 1 into v_seq
          from public.shipment_charge_snapshots
         where tenant_id = v_tenant and shipment_id = v_s.id and side = 'CUSTOMER';
        insert into public.shipment_charge_snapshots (
          tenant_id, shipment_id, seq, side, description, rate, amount,
          fuel_applies, fuel_amount, tax_applies, tax_on_fuel,
          igst, sgst, cgst, total, charges_type, created_by, updated_by)
        values (
          v_tenant, v_s.id, v_seq, 'CUSTOMER', 'Freight',
          coalesce((v_quote->>'rate_per_kg')::numeric, 0), v_freight,
          v_fuel <> 0, v_fuel, v_tax <> 0, false,
          v_igst, v_sgst, v_cgst, v_total, 'SYSTEM', auth.uid(), auth.uid());
      end if;

      update public.shipments set
        zone_id = case
          when v_type = 'AWB_RATE' then nullif(v_quote->>'new_zone_id','')::uuid
          else zone_id
        end,
        fuel_amount = round(v_fuel + v_manual_fuel, 2),
        tax_amount = round(v_tax + v_manual_tax, 2),
        grand_total = coalesce((v_quote->>'new_total')::numeric, grand_total),
        customer_charges_total = coalesce((v_quote->>'new_total')::numeric, customer_charges_total),
        rating_version = coalesce(rating_version, 0) + 1,
        rated_at = now(),
        updated_at = now(),
        updated_by = auth.uid(),
        row_version = row_version + 1
      where id = v_s.id and tenant_id = v_tenant;
    else
      v_line := nullif(v_quote->>'vendor_line_id','')::uuid;
      if v_line is not null then
        update public.shipment_charge_snapshots set
          amount = v_vendor,
          rate = v_vendor,
          total = v_vendor,
          updated_at = now(),
          updated_by = auth.uid(),
          row_version = row_version + 1
        where id = v_line
          and tenant_id = v_tenant
          and shipment_id = v_s.id
          and charges_type = 'SYSTEM'
          and side = 'VENDOR';
      else
        select coalesce(max(seq), 0) + 1 into v_seq
          from public.shipment_charge_snapshots
         where tenant_id = v_tenant and shipment_id = v_s.id and side = 'VENDOR';
        insert into public.shipment_charge_snapshots (
          tenant_id, shipment_id, seq, side, description, rate, amount,
          fuel_applies, fuel_amount, tax_applies, tax_on_fuel,
          igst, sgst, cgst, total, charges_type, created_by, updated_by)
        values (
          v_tenant, v_s.id, v_seq, 'VENDOR', 'Vendor Freight',
          v_vendor, v_vendor, false, 0, false, false,
          0, 0, 0, v_vendor, 'SYSTEM', auth.uid(), auth.uid());
      end if;

      update public.shipments set
        vendor_charges_total = v_vendor,
        updated_at = now(),
        updated_by = auth.uid(),
        row_version = row_version + 1
      where id = v_s.id and tenant_id = v_tenant;
    end if;

    perform app.write_audit_log(
      p_tenant_id => v_tenant,
      p_entity_type => 'shipments',
      p_action => 'RATE_UPDATE',
      p_entity_id => v_s.id,
      p_module_slug => 'utl.rate-update',
      p_old => jsonb_build_object(
        'update_type', v_type,
        'zone', v_quote->>'old_zone',
        'freight', v_quote->'old_freight',
        'fuel', v_quote->'old_fuel',
        'tax', v_quote->'old_tax',
        'total', v_quote->'old_total',
        'vendor', v_quote->'old_vendor'),
      p_new => jsonb_build_object(
        'update_type', v_type,
        'zone', v_quote->>'new_zone',
        'freight', v_quote->'new_freight',
        'fuel', v_quote->'new_fuel',
        'tax', v_quote->'new_tax',
        'total', v_quote->'new_total',
        'vendor', v_quote->'new_vendor',
        'difference', v_quote->'difference'));

    v_applied := v_applied + 1;
    v_diff := v_diff + coalesce((v_quote->>'difference')::numeric, 0);
  end loop;

  if v_applied > 0 then
    insert into public.rate_update_jobs (
      tenant_id, update_type, filters, status, progress,
      total_shipments, processed_shipments, updated_shipments,
      skipped_shipments, created_by, started_at, completed_at)
    values (
      v_tenant, v_type, v_filters, 'COMPLETED', 100,
      v_applied + v_skip + v_unchanged, v_applied + v_skip + v_unchanged, v_applied,
      v_skip, auth.uid(), now(), now())
    returning id into v_job_id;
  end if;

  return jsonb_build_object(
    'applied', v_applied,
    'skipped', v_skip,
    'unchanged', v_unchanged,
    'difference_total', round(v_diff, 2),
    'history_id', v_job_id);
end
$$;

revoke all on function public.apply_rate_update(text, jsonb) from public;
grant execute on function public.apply_rate_update(text, jsonb) to authenticated, service_role;

-- The old job runner rewrote booked AWBs with no preview. It now refuses.
create or replace function public.execute_rate_update_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
begin
  raise exception 'Rate update jobs are retired. Use Rate Update preview, then confirm.'
    using errcode = 'CMS04';
end
$$;

create or replace function public.execute_zone_update_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
begin
  raise exception 'Zone update jobs are retired. A zone import does not change booked AWBs.'
    using errcode = 'CMS04';
end
$$;

comment on function public.preview_rate_update(text, jsonb) is
  'Read-only Rate Update preview. Nothing is saved.';
comment on function public.apply_rate_update(text, jsonb) is
  'Apply a confirmed Rate Update. Skips locked, invoiced, and cancelled AWBs. Keeps manual charge lines.';
comment on function public.execute_rate_update_job(uuid) is
  'Retired. Rate update jobs are retired. Use Rate Update preview, then confirm.';
comment on function public.execute_zone_update_job(uuid) is
  'Retired. Zone update jobs are retired. A zone import does not change booked AWBs.';

-- Hide the job screens from Access Rights. Grants stay. Tables stay.
update public.permission_modules
   set is_active = false,
       updated_at = now()
 where slug in ('utl.rate-update-jobs', 'utl.zone-update-jobs');
