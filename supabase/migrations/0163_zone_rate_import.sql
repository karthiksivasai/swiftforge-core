-- 0163  Zone rate grid.
-- The courier sheet is a finished freight amount for a weight and a zone.
-- It is not a per-kg customer rate. A customer rate card still wins.
-- This grid is used only when that card is missing. Fuel and tax stay on top.
-- A rate import does not change a booked AWB.

alter table public.audit_logs drop constraint if exists audit_logs_action_check;

alter table public.audit_logs
  add constraint audit_logs_action_check
  check (action in (
    'ADD', 'MODIFY', 'DELETE', 'LOGIN', 'LOGOUT', 'ACCESS',
    'RATE_UPDATE', 'ZONE_IMPORT', 'ZONE_MAPPING_DELETE', 'RATE_IMPORT'
  ));

create table if not exists public.zone_rate_prices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  vendor_id uuid not null,
  service text not null,
  zone_id uuid not null,
  weight_from numeric(14,3) not null,
  weight_to numeric(14,3) not null,
  amount numeric(14,2) not null,
  effective_date date not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  constraint zone_rate_prices_weight_chk check (weight_to > weight_from and weight_from >= 0),
  constraint zone_rate_prices_amount_chk check (amount >= 0),
  constraint zone_rate_prices_vendor_fk foreign key (tenant_id, vendor_id)
    references public.vendors (tenant_id, id),
  constraint zone_rate_prices_zone_fk foreign key (tenant_id, zone_id)
    references public.zones (tenant_id, id)
);

create unique index if not exists zone_rate_prices_slab_uq
  on public.zone_rate_prices (
    tenant_id,
    vendor_id,
    upper(btrim(service)),
    zone_id,
    weight_to,
    effective_date
  )
  where deleted_at is null;

create index if not exists zone_rate_prices_lookup_idx
  on public.zone_rate_prices (tenant_id, vendor_id, zone_id, effective_date desc)
  where deleted_at is null;

alter table public.zone_rate_prices enable row level security;

drop policy if exists zone_rate_prices_select on public.zone_rate_prices;
create policy zone_rate_prices_select on public.zone_rate_prices
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());

create or replace function app.resolve_zone_rate_freight(
  p_tenant uuid,
  p_vendor uuid,
  p_service text,
  p_zone uuid,
  p_weight numeric,
  p_as_of date
)
returns numeric
language sql
stable
security definer
set search_path = public, app
as $$
  select p.amount
    from public.zone_rate_prices p
   where p.tenant_id = p_tenant
     and p.deleted_at is null
     and p.vendor_id = p_vendor
     and p.zone_id = p_zone
     and p.effective_date <= coalesce(p_as_of, current_date)
     and upper(btrim(p.service)) = upper(btrim(coalesce(p_service, '')))
     and p.weight_from < p_weight
     and p.weight_to >= p_weight
   order by p.effective_date desc, p.weight_to asc
   limit 1;
$$;

create or replace function app.assert_rate_import_permission(p_tenant uuid, p_action text)
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
  if app.user_has_permission(p_tenant, 'utl.rate-import', p_action) then
    return;
  end if;
  if p_action = 'search'
     and app.user_has_permission(p_tenant, 'utl.rate-import', 'list') then
    return;
  end if;
  if p_action = 'modify'
     and app.user_has_permission(p_tenant, 'utl.rate-import', 'add') then
    return;
  end if;
  raise exception 'Permission denied: utl.rate-import %', p_action using errcode = '42501';
end
$$;

create or replace function app.classify_zone_rate_rows(
  p_tenant uuid,
  p_vendor uuid,
  p_effective_date date,
  p_rows jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_vendor uuid;
  v_row jsonb;
  v_service text;
  v_zone text;
  v_zone_id uuid;
  v_from numeric(14,3);
  v_to numeric(14,3);
  v_amount numeric(14,2);
  v_existing uuid;
  v_old_amount numeric(14,2);
  v_old_from numeric(14,3);
  v_reasons text[];
  v_status text;
  v_outcome text;
  v_rows jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_ok integer := 0;
  v_failed integer := 0;
  v_new integer := 0;
  v_replace integer := 0;
  v_unchanged integer := 0;
begin
  select v.id into v_vendor
    from public.vendors v
   where v.tenant_id = p_tenant and v.deleted_at is null and v.id = p_vendor;
  if v_vendor is null then
    raise exception 'Vendor was not found' using errcode = '22023';
  end if;
  if p_effective_date is null then
    raise exception 'Effective date is required' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_rows, 'null'::jsonb)) is distinct from 'array' then
    raise exception 'Rate file rows are missing' using errcode = '22023';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_total := v_total + 1;
    v_reasons := array[]::text[];
    v_zone_id := null;
    v_existing := null;
    v_outcome := null;
    v_service := btrim(coalesce(v_row->>'service', ''));
    v_zone := btrim(coalesce(v_row->>'zone', ''));
    v_from := round(nullif(v_row->>'weight_from', '')::numeric, 3);
    v_to := round(nullif(v_row->>'weight_to', '')::numeric, 3);
    v_amount := round(nullif(v_row->>'amount', '')::numeric, 2);

    if v_service = '' then
      v_reasons := v_reasons || array['unknown service'];
    end if;
    if v_zone = '' then
      v_reasons := v_reasons || array['unknown zone'];
    else
      select z.id into v_zone_id
        from public.zones z
       where z.tenant_id = p_tenant and z.deleted_at is null
         and upper(z.code) = upper(v_zone)
       limit 1;
      if v_zone_id is null then
        v_reasons := v_reasons || array['unknown zone'];
      end if;
    end if;
    if v_from is null or v_to is null or v_to <= v_from or v_from < 0 then
      v_reasons := v_reasons || array['bad weight'];
    end if;
    if v_amount is null or v_amount < 0 then
      v_reasons := v_reasons || array['bad amount'];
    end if;

    if cardinality(v_reasons) = 0 then
      select p.id, p.amount, p.weight_from
        into v_existing, v_old_amount, v_old_from
        from public.zone_rate_prices p
       where p.tenant_id = p_tenant and p.deleted_at is null
         and p.vendor_id = v_vendor
         and p.zone_id = v_zone_id
         and p.effective_date = p_effective_date
         and p.weight_to = v_to
         and upper(btrim(p.service)) = upper(v_service)
       limit 1;
      if v_existing is not null
         and v_old_amount = v_amount
         and v_old_from = v_from then
        v_outcome := 'UNCHANGED';
        v_unchanged := v_unchanged + 1;
      elsif v_existing is not null then
        v_outcome := 'REPLACE';
        v_replace := v_replace + 1;
      else
        v_outcome := 'NEW';
        v_new := v_new + 1;
      end if;
      v_status := 'OK';
      v_ok := v_ok + 1;
    else
      v_status := 'FAILED';
      v_failed := v_failed + 1;
    end if;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'row_no', coalesce((v_row->>'row_no')::integer, v_total),
      'service', v_service,
      'zone', v_zone,
      'zone_id', v_zone_id,
      'weight_from', v_from,
      'weight_to', v_to,
      'amount', v_amount,
      'status', v_status,
      'outcome', v_outcome,
      'reason', nullif(array_to_string(v_reasons, ', '), '')
    ));
  end loop;

  return jsonb_build_object(
    'total', v_total,
    'ok_count', v_ok,
    'failed_count', v_failed,
    'new_count', v_new,
    'replace_count', v_replace,
    'unchanged_count', v_unchanged,
    'rows', v_rows
  );
end
$$;

create or replace function public.preview_zone_rate_import(
  p_vendor_id uuid,
  p_effective_date date,
  p_rows jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_result jsonb;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  perform app.assert_rate_import_permission(v_tenant, 'search');
  v_result := app.classify_zone_rate_rows(v_tenant, p_vendor_id, p_effective_date, p_rows);
  return jsonb_build_object(
    'total', v_result->'total',
    'ok_count', v_result->'ok_count',
    'failed_count', v_result->'failed_count',
    'new_count', v_result->'new_count',
    'replace_count', v_result->'replace_count',
    'unchanged_count', v_result->'unchanged_count',
    'rows', (
      select coalesce(jsonb_agg(r - 'zone_id'), '[]'::jsonb)
      from jsonb_array_elements(v_result->'rows') r
    )
  );
end
$$;

create or replace function public.apply_zone_rate_import(
  p_vendor_id uuid,
  p_effective_date date,
  p_rows jsonb,
  p_skip_failed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_class jsonb;
  v_row jsonb;
  v_existing uuid;
  v_imported integer := 0;
  v_new integer := 0;
  v_replace integer := 0;
  v_unchanged integer := 0;
  v_skipped integer := 0;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  perform app.assert_rate_import_permission(v_tenant, 'modify');
  v_class := app.classify_zone_rate_rows(v_tenant, p_vendor_id, p_effective_date, p_rows);
  if coalesce((v_class->>'failed_count')::integer, 0) > 0 and coalesce(p_skip_failed, false) is not true then
    raise exception 'Rate import saved nothing. % price(s) failed. Tick skip failed prices to import the rest.',
      v_class->>'failed_count'
      using errcode = 'CMS04';
  end if;

  for v_row in select value from jsonb_array_elements(v_class->'rows')
  loop
    if v_row->>'status' <> 'OK' then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    if v_row->>'outcome' = 'UNCHANGED' then
      v_unchanged := v_unchanged + 1;
      continue;
    end if;

    select p.id into v_existing
      from public.zone_rate_prices p
     where p.tenant_id = v_tenant and p.deleted_at is null
       and p.vendor_id = p_vendor_id
       and p.zone_id = (v_row->>'zone_id')::uuid
       and p.effective_date = p_effective_date
       and p.weight_to = (v_row->>'weight_to')::numeric
       and upper(btrim(p.service)) = upper(btrim(v_row->>'service'))
     limit 1;

    if v_existing is not null then
      update public.zone_rate_prices set
        weight_from = (v_row->>'weight_from')::numeric,
        amount = (v_row->>'amount')::numeric,
        service = v_row->>'service',
        updated_at = now(),
        updated_by = auth.uid()
      where id = v_existing and tenant_id = v_tenant;
      v_replace := v_replace + 1;
    else
      insert into public.zone_rate_prices (
        tenant_id, vendor_id, service, zone_id, weight_from, weight_to,
        amount, effective_date, created_by, updated_by)
      values (
        v_tenant, p_vendor_id, v_row->>'service', (v_row->>'zone_id')::uuid,
        (v_row->>'weight_from')::numeric, (v_row->>'weight_to')::numeric,
        (v_row->>'amount')::numeric, p_effective_date, auth.uid(), auth.uid());
      v_new := v_new + 1;
    end if;
    v_imported := v_imported + 1;
  end loop;

  perform app.write_audit_log(
    p_tenant_id => v_tenant,
    p_entity_type => 'zone_rate_prices',
    p_action => 'RATE_IMPORT',
    p_entity_id => p_vendor_id,
    p_module_slug => 'utl.rate-import',
    p_new => jsonb_build_object(
      'vendor_id', p_vendor_id,
      'effective_date', p_effective_date,
      'imported', v_imported,
      'new_count', v_new,
      'replace_count', v_replace,
      'unchanged_count', v_unchanged,
      'skipped', v_skipped
    ));

  return jsonb_build_object(
    'imported', v_imported,
    'new_count', v_new,
    'replace_count', v_replace,
    'unchanged_count', v_unchanged,
    'skipped', v_skipped
  );
end
$$;

create or replace function public.quote_zone_rate_freight(
  p_vendor text,
  p_origin text,
  p_destination text,
  p_product text,
  p_service text,
  p_weight numeric,
  p_as_of date
)
returns numeric
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_vendor uuid;
  v_origin uuid;
  v_dest uuid;
  v_product uuid;
  v_zone uuid;
  v_vendor_text text := btrim(coalesce(p_vendor, ''));
  v_origin_text text := btrim(coalesce(p_origin, ''));
  v_dest_text text := btrim(coalesce(p_destination, ''));
  v_product_text text := btrim(coalesce(p_product, ''));
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not (app.is_platform_admin() or app.is_tenant_admin(v_tenant))
     and not app.user_has_permission(v_tenant, 'txn.awb-entry', 'search')
     and not app.user_has_permission(v_tenant, 'txn.awb-entry', 'list') then
    raise exception 'Permission denied: txn.awb-entry search' using errcode = '42501';
  end if;
  if v_vendor_text = '' or v_origin_text = '' or v_dest_text = '' or coalesce(p_weight, 0) <= 0 then
    return null;
  end if;

  select v.id into v_vendor
    from public.vendors v
   where v.tenant_id = v_tenant and v.deleted_at is null
     and (upper(v.code) = upper(v_vendor_text) or upper(v.name) = upper(v_vendor_text))
   order by case when upper(v.code) = upper(v_vendor_text) then 0 else 1 end, v.code
   limit 1;
  select d.id into v_origin
    from public.destinations d
   where d.tenant_id = v_tenant and d.deleted_at is null
     and (upper(d.code) = upper(v_origin_text) or upper(d.name) = upper(v_origin_text))
   order by case when upper(d.code) = upper(v_origin_text) then 0 else 1 end, d.code
   limit 1;
  select d.id into v_dest
    from public.destinations d
   where d.tenant_id = v_tenant and d.deleted_at is null
     and (upper(d.code) = upper(v_dest_text) or upper(d.name) = upper(v_dest_text))
   order by case when upper(d.code) = upper(v_dest_text) then 0 else 1 end, d.code
   limit 1;
  if v_product_text <> '' then
    select p.id into v_product
      from public.products p
     where p.tenant_id = v_tenant and p.deleted_at is null
       and (upper(p.code) = upper(v_product_text) or upper(p.name) = upper(v_product_text))
     order by case when upper(p.code) = upper(v_product_text) then 0 else 1 end, p.code
     limit 1;
  end if;
  if v_vendor is null or v_origin is null or v_dest is null then
    return null;
  end if;

  v_zone := app.resolve_rating_zone(
    v_tenant, v_origin, v_dest, v_vendor, v_product, p_service, coalesce(p_as_of, current_date));
  if v_zone is null then
    return null;
  end if;
  return app.resolve_zone_rate_freight(
    v_tenant, v_vendor, p_service, v_zone, p_weight, coalesce(p_as_of, current_date));
end
$$;

revoke all on function public.preview_zone_rate_import(uuid, date, jsonb) from public;
grant execute on function public.preview_zone_rate_import(uuid, date, jsonb) to authenticated, service_role;

revoke all on function public.apply_zone_rate_import(uuid, date, jsonb, boolean) from public;
grant execute on function public.apply_zone_rate_import(uuid, date, jsonb, boolean) to authenticated, service_role;

revoke all on function public.quote_zone_rate_freight(text, text, text, text, text, numeric, date) from public;
grant execute on function public.quote_zone_rate_freight(text, text, text, text, text, numeric, date) to authenticated, service_role;

-- Freight below is the 0162 function with one change.
-- A customer rate card still uses weight x rate_per_kg.
-- The zone rate grid is used only when that card is missing.

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
  v_grid_freight numeric(14,2);
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

  v_grid_freight := null;
  if v_zone is not null and v_s.vendor_id is not null then
    v_grid_freight := app.resolve_zone_rate_freight(
      v_s.tenant_id, v_s.vendor_id, v_s.service, v_zone, v_weight, v_as_of);
  end if;

  if v_rate.id is not null then
    v_chargeable := greatest(v_weight, coalesce(v_rate.min_weight, 0));
    v_freight := round(v_chargeable * coalesce(v_rate.rate_per_kg, 0), 2);
  elsif v_grid_freight is not null then
    v_chargeable := v_weight;
    v_freight := v_grid_freight;
  end if;

  -- 2. Customer other charges
  if v_s.customer_id is not null then
    for v_row in
      select coc.charge_type, coc.amount, coc.minimum_value
        from public.customer_other_charges coc
       where coc.tenant_id = v_s.tenant_id and coc.customer_id = v_s.customer_id
         and (coc.from_date is null or coc.from_date <= v_as_of)
         and (coc.to_date is null or coc.to_date >= v_as_of)
    loop
      v_line_amt := greatest(coalesce(v_row.amount, 0), coalesce(v_row.minimum_value, 0));
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

      select coalesce(b.state_code, substring(b.gst_no from 1 for 2)) into v_branch_state
        from public.branches b
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

create or replace function app.price_manual_charges(
  p_shipment uuid,
  p_charges jsonb
)
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

    select coalesce(b.state_code, substring(b.gst_no from 1 for 2)) into v_branch_state
      from public.branches b
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

