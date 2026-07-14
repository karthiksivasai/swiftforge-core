-- ===========================================================================
-- 0041  rating engine foundation — Phase 4 Milestone 4H (FINAL Phase 4)
-- ---------------------------------------------------------------------------
-- Booking-time charge computation. No invoices, GST filing, IRN, reports,
-- carrier APIs, background jobs, or subscription billing.
--
-- Creates deferred rating masters (Phase 3 gaps) once — never duplicates:
--   customer_rates, zone_mappings, fuel_surcharge_rates, tax_rates
-- Reuses: charges (as charge_definitions view), vendor_contracts/slabs,
--         customer_other_charges, customer_fuel_surcharges,
--         shipment_charge_snapshots
--
-- RPCs: calculate_shipment_rating, recalculate_shipment_rating,
--       get_rating_breakdown
-- Pipeline order (frozen): lane → customer rate → charges → fuel → tax →
--                          vendor cost → persist snapshot
-- Permission: txn.awb-entry (reuse; no new permission concepts)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- shipment money columns (blueprint §2.8) + rating metadata
-- ---------------------------------------------------------------------------
alter table public.shipments
  add column if not exists fuel_amount numeric(14,2) not null default 0,
  add column if not exists tax_amount numeric(14,2) not null default 0,
  add column if not exists grand_total numeric(14,2) not null default 0,
  add column if not exists rated_at timestamptz,
  add column if not exists rating_version integer not null default 0,
  add column if not exists invoice_id uuid;

-- ---------------------------------------------------------------------------
-- charge_definitions — compatibility view over existing charges master
-- ---------------------------------------------------------------------------
create or replace view public.charge_definitions as
  select * from public.charges where deleted_at is null;

-- ---------------------------------------------------------------------------
-- customer_rates (blueprint §2.7) — deferred from Phase 3
-- ---------------------------------------------------------------------------
create table if not exists public.customer_rates (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants(id) on delete cascade,
  customer_id             uuid not null,
  product_id              uuid,
  service                 text,
  origin_destination_id   uuid,
  destination_id          uuid,
  zone_id                 uuid,
  from_date               date not null default current_date,
  to_date                 date,
  min_weight              numeric(14,3) not null default 0 check (min_weight >= 0),
  rate_per_kg             numeric(14,4) not null default 0 check (rate_per_kg >= 0),
  fuel_pct                numeric(7,4) not null default 0,
  other_charges           numeric(14,2) not null default 0,
  status                  text not null default 'ACTIVE'
                            check (status in ('ACTIVE','INACTIVE')),
  created_at              timestamptz not null default now(),
  created_by              uuid,
  updated_at              timestamptz not null default now(),
  updated_by              uuid,
  deleted_at              timestamptz,
  row_version             integer not null default 1,
  constraint customer_rates_tenant_id_uq unique (tenant_id, id),
  constraint customer_rates_customer_fk foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete cascade,
  constraint customer_rates_product_fk foreign key (tenant_id, product_id)
    references public.products (tenant_id, id) on delete set null,
  constraint customer_rates_origin_fk foreign key (tenant_id, origin_destination_id)
    references public.destinations (tenant_id, id) on delete set null,
  constraint customer_rates_dest_fk foreign key (tenant_id, destination_id)
    references public.destinations (tenant_id, id) on delete set null,
  constraint customer_rates_zone_fk foreign key (tenant_id, zone_id)
    references public.zones (tenant_id, id) on delete set null
);
create index if not exists customer_rates_lookup_idx
  on public.customer_rates (tenant_id, customer_id, product_id, from_date desc)
  where deleted_at is null;

select app.attach_master_triggers('customer_rates', 'mst.customer-contract-master');
alter table public.customer_rates enable row level security;
drop policy if exists customer_rates_select on public.customer_rates;
create policy customer_rates_select on public.customer_rates
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());
drop policy if exists customer_rates_insert on public.customer_rates;
create policy customer_rates_insert on public.customer_rates
  for insert with check (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'mst.customer-contract-master', 'add'));
drop policy if exists customer_rates_update on public.customer_rates;
create policy customer_rates_update on public.customer_rates
  for update using (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'mst.customer-contract-master', 'modify'));

-- ---------------------------------------------------------------------------
-- zone_mappings
-- ---------------------------------------------------------------------------
create table if not exists public.zone_mappings (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants(id) on delete cascade,
  origin_destination_id   uuid,
  vendor_id               uuid,
  service                 text,
  product_id              uuid,
  country_id              uuid,
  destination_id          uuid,
  zone_id                 uuid not null,
  effective_date          date not null default current_date,
  created_at              timestamptz not null default now(),
  created_by              uuid,
  updated_at              timestamptz not null default now(),
  updated_by              uuid,
  deleted_at              timestamptz,
  row_version             integer not null default 1,
  constraint zone_mappings_tenant_id_uq unique (tenant_id, id),
  constraint zone_mappings_zone_fk foreign key (tenant_id, zone_id)
    references public.zones (tenant_id, id) on delete restrict,
  constraint zone_mappings_origin_fk foreign key (tenant_id, origin_destination_id)
    references public.destinations (tenant_id, id) on delete set null,
  constraint zone_mappings_dest_fk foreign key (tenant_id, destination_id)
    references public.destinations (tenant_id, id) on delete set null,
  constraint zone_mappings_vendor_fk foreign key (tenant_id, vendor_id)
    references public.vendors (tenant_id, id) on delete set null,
  constraint zone_mappings_product_fk foreign key (tenant_id, product_id)
    references public.products (tenant_id, id) on delete set null,
  constraint zone_mappings_country_fk foreign key (tenant_id, country_id)
    references public.countries (tenant_id, id) on delete set null
);
create index if not exists zone_mappings_lookup_idx
  on public.zone_mappings (tenant_id, effective_date desc)
  where deleted_at is null;

select app.attach_master_triggers('zone_mappings', 'utl.zone-update');
alter table public.zone_mappings enable row level security;
drop policy if exists zone_mappings_select on public.zone_mappings;
create policy zone_mappings_select on public.zone_mappings
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());
drop policy if exists zone_mappings_insert on public.zone_mappings;
create policy zone_mappings_insert on public.zone_mappings
  for insert with check (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'utl.zone-update', 'add'));
drop policy if exists zone_mappings_update on public.zone_mappings;
create policy zone_mappings_update on public.zone_mappings
  for update using (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'utl.zone-update', 'modify'));

-- ---------------------------------------------------------------------------
-- fuel_surcharge_rates (global; customer child rows remain customer_fuel_surcharges)
-- ---------------------------------------------------------------------------
create table if not exists public.fuel_surcharge_rates (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  entry_code        text,
  customer_id       uuid,
  vendor_id         uuid,
  product_id        uuid,
  destination_id    uuid,
  service_type_id   uuid,
  from_date         date not null default current_date,
  to_date           date,
  percentage        numeric(7,4) not null default 0,
  created_at        timestamptz not null default now(),
  created_by        uuid,
  updated_at        timestamptz not null default now(),
  updated_by        uuid,
  deleted_at        timestamptz,
  row_version       integer not null default 1,
  constraint fuel_surcharge_rates_tenant_id_uq unique (tenant_id, id),
  constraint fuel_surcharge_rates_customer_fk foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete cascade,
  constraint fuel_surcharge_rates_vendor_fk foreign key (tenant_id, vendor_id)
    references public.vendors (tenant_id, id) on delete set null,
  constraint fuel_surcharge_rates_product_fk foreign key (tenant_id, product_id)
    references public.products (tenant_id, id) on delete set null,
  constraint fuel_surcharge_rates_dest_fk foreign key (tenant_id, destination_id)
    references public.destinations (tenant_id, id) on delete set null
);
create index if not exists fuel_surcharge_rates_lookup_idx
  on public.fuel_surcharge_rates (tenant_id, from_date desc)
  where deleted_at is null;

select app.attach_master_triggers('fuel_surcharge_rates', 'utl.fuel-setup');
alter table public.fuel_surcharge_rates enable row level security;
drop policy if exists fuel_surcharge_rates_select on public.fuel_surcharge_rates;
create policy fuel_surcharge_rates_select on public.fuel_surcharge_rates
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());
drop policy if exists fuel_surcharge_rates_insert on public.fuel_surcharge_rates;
create policy fuel_surcharge_rates_insert on public.fuel_surcharge_rates
  for insert with check (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'utl.fuel-setup', 'add'));
drop policy if exists fuel_surcharge_rates_update on public.fuel_surcharge_rates;
create policy fuel_surcharge_rates_update on public.fuel_surcharge_rates
  for update using (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'utl.fuel-setup', 'modify'));

-- ---------------------------------------------------------------------------
-- tax_rates
-- ---------------------------------------------------------------------------
create table if not exists public.tax_rates (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  customer_id   uuid,
  product_id    uuid,
  from_date     date not null default current_date,
  to_date       date,
  igst_pct      numeric(7,4) not null default 0,
  cgst_pct      numeric(7,4) not null default 0,
  sgst_pct      numeric(7,4) not null default 0,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  deleted_at    timestamptz,
  row_version   integer not null default 1,
  constraint tax_rates_tenant_id_uq unique (tenant_id, id),
  constraint tax_rates_customer_fk foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete cascade,
  constraint tax_rates_product_fk foreign key (tenant_id, product_id)
    references public.products (tenant_id, id) on delete set null
);
create index if not exists tax_rates_lookup_idx
  on public.tax_rates (tenant_id, from_date desc)
  where deleted_at is null;

select app.attach_master_triggers('tax_rates', 'utl.tax-surcharge-setup');
alter table public.tax_rates enable row level security;
drop policy if exists tax_rates_select on public.tax_rates;
create policy tax_rates_select on public.tax_rates
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());
drop policy if exists tax_rates_insert on public.tax_rates;
create policy tax_rates_insert on public.tax_rates
  for insert with check (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'utl.tax-surcharge-setup', 'add'));
drop policy if exists tax_rates_update on public.tax_rates;
create policy tax_rates_update on public.tax_rates
  for update using (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'utl.tax-surcharge-setup', 'modify'));

-- ---------------------------------------------------------------------------
-- rating_audit — append-only calculation trees (immutable history)
-- ---------------------------------------------------------------------------
create table if not exists public.rating_audit (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  shipment_id   uuid not null,
  rating_version integer not null default 1,
  as_of_date    date not null default current_date,
  breakdown     jsonb not null default '{}'::jsonb,
  freight       numeric(14,2) not null default 0,
  fuel          numeric(14,2) not null default 0,
  tax           numeric(14,2) not null default 0,
  other_charges numeric(14,2) not null default 0,
  vendor_cost   numeric(14,2) not null default 0,
  total         numeric(14,2) not null default 0,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  deleted_at    timestamptz,
  row_version   integer not null default 1,
  constraint rating_audit_shipment_fk foreign key (tenant_id, shipment_id)
    references public.shipments (tenant_id, id) on delete cascade
);
create index if not exists rating_audit_shipment_idx
  on public.rating_audit (tenant_id, shipment_id, rating_version desc);

select app.attach_append_only_guard('rating_audit');
select app.attach_event_policies('rating_audit', 'txn.awb-entry');

-- ===========================================================================
-- Rating helpers (pipeline order frozen)
-- ===========================================================================

create or replace function app.assert_shipment_rating_editable(p_s public.shipments)
returns void
language plpgsql
stable
set search_path = public, app
as $$
begin
  if p_s.is_locked then
    raise exception 'Shipment is locked; rating recalculation rejected'
      using errcode = 'CMS04';
  end if;
  if p_s.invoice_id is not null then
    raise exception 'Shipment is invoiced; rating recalculation rejected'
      using errcode = 'CMS04';
  end if;
  if p_s.current_status in ('CANCELLED','VOID') then
    raise exception 'Shipment status % is not editable for rating', p_s.current_status
      using errcode = 'CMS04';
  end if;
end
$$;

-- 1. Resolve lane → zone
create or replace function app.resolve_rating_zone(
  p_tenant uuid,
  p_origin uuid,
  p_dest uuid,
  p_vendor uuid,
  p_product uuid,
  p_service text,
  p_as_of date
)
returns uuid
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_zone uuid;
begin
  select zm.zone_id into v_zone
    from public.zone_mappings zm
   where zm.tenant_id = p_tenant
     and zm.deleted_at is null
     and zm.effective_date <= p_as_of
     and (zm.origin_destination_id is null or zm.origin_destination_id = p_origin)
     and (zm.destination_id is null or zm.destination_id = p_dest)
     and (zm.vendor_id is null or zm.vendor_id = p_vendor)
     and (zm.product_id is null or zm.product_id = p_product)
     and (zm.service is null or nullif(btrim(zm.service),'') is null
          or upper(zm.service) = upper(coalesce(p_service,'')))
   order by
     (case when zm.destination_id is not null then 8 else 0 end)
   + (case when zm.origin_destination_id is not null then 4 else 0 end)
   + (case when zm.vendor_id is not null then 2 else 0 end)
   + (case when zm.product_id is not null then 2 else 0 end)
   + (case when nullif(btrim(coalesce(zm.service,'')),'') is not null then 1 else 0 end) desc,
     zm.effective_date desc
   limit 1;

  if v_zone is null and p_dest is not null then
    select d.zone_id into v_zone from public.destinations d
     where d.id = p_dest and d.tenant_id = p_tenant and d.deleted_at is null;
  end if;
  return v_zone;
end
$$;

-- 2. Customer rate (most specific date-effective lane)
create or replace function app.resolve_customer_rate(
  p_tenant uuid,
  p_customer uuid,
  p_product uuid,
  p_service text,
  p_origin uuid,
  p_dest uuid,
  p_zone uuid,
  p_as_of date
)
returns public.customer_rates
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_r public.customer_rates;
begin
  select cr.* into v_r
    from public.customer_rates cr
   where cr.tenant_id = p_tenant
     and cr.deleted_at is null
     and cr.status = 'ACTIVE'
     and cr.customer_id = p_customer
     and cr.from_date <= p_as_of
     and (cr.to_date is null or cr.to_date >= p_as_of)
     and (cr.product_id is null or cr.product_id = p_product)
     and (cr.service is null or nullif(btrim(cr.service),'') is null
          or upper(cr.service) = upper(coalesce(p_service,'')))
     and (cr.origin_destination_id is null or cr.origin_destination_id = p_origin)
     and (cr.destination_id is null or cr.destination_id = p_dest)
     and (cr.zone_id is null or cr.zone_id = p_zone)
   order by
     (case when cr.destination_id is not null then 16 else 0 end)
   + (case when cr.zone_id is not null then 8 else 0 end)
   + (case when cr.origin_destination_id is not null then 4 else 0 end)
   + (case when cr.product_id is not null then 2 else 0 end)
   + (case when nullif(btrim(coalesce(cr.service,'')),'') is not null then 1 else 0 end) desc,
     cr.from_date desc
   limit 1;
  return v_r;
end
$$;

-- 4. Fuel % (most specific)
create or replace function app.resolve_fuel_pct(
  p_tenant uuid,
  p_customer uuid,
  p_vendor uuid,
  p_product uuid,
  p_dest uuid,
  p_as_of date,
  p_rate_fuel_pct numeric default null
)
returns numeric
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_pct numeric(7,4);
  v_cust_pct numeric(7,4);
begin
  -- customer wizard child rows (text product/dest — soft match)
  select cfs.percentage into v_cust_pct
    from public.customer_fuel_surcharges cfs
   where cfs.tenant_id = p_tenant and cfs.customer_id = p_customer
     and (cfs.from_date is null or cfs.from_date <= p_as_of)
     and (cfs.to_date is null or cfs.to_date >= p_as_of)
     and cfs.percentage is not null
   order by cfs.seq
   limit 1;

  select f.percentage into v_pct
    from public.fuel_surcharge_rates f
   where f.tenant_id = p_tenant and f.deleted_at is null
     and f.from_date <= p_as_of
     and (f.to_date is null or f.to_date >= p_as_of)
     and (f.customer_id is null or f.customer_id = p_customer)
     and (f.vendor_id is null or f.vendor_id = p_vendor)
     and (f.product_id is null or f.product_id = p_product)
     and (f.destination_id is null or f.destination_id = p_dest)
   order by
     (case when f.customer_id is not null then 8 else 0 end)
   + (case when f.destination_id is not null then 4 else 0 end)
   + (case when f.product_id is not null then 2 else 0 end)
   + (case when f.vendor_id is not null then 1 else 0 end) desc,
     f.from_date desc
   limit 1;

  return coalesce(v_pct, v_cust_pct, p_rate_fuel_pct, 0);
end
$$;

-- 5. Tax rates + IGST vs CGST+SGST
create or replace function app.resolve_tax_pcts(
  p_tenant uuid,
  p_customer uuid,
  p_product uuid,
  p_branch uuid,
  p_as_of date,
  out o_use_igst boolean,
  out o_igst numeric,
  out o_cgst numeric,
  out o_sgst numeric
)
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_cust_state uuid;
  v_cust_state_code text;
  v_branch_state text;
  v_tr public.tax_rates;
begin
  o_use_igst := true;
  o_igst := 0; o_cgst := 0; o_sgst := 0;

  select coalesce(c.billing_state_id, c.state_id) into v_cust_state
    from public.customers c
   where c.id = p_customer and c.tenant_id = p_tenant;

  if v_cust_state is not null then
    select s.code into v_cust_state_code from public.states s
     where s.id = v_cust_state and s.tenant_id = p_tenant;
  end if;

  select b.state_code into v_branch_state from public.branches b
   where b.id = p_branch and b.tenant_id = p_tenant;

  if v_cust_state_code is not null and v_branch_state is not null
     and upper(v_cust_state_code) = upper(v_branch_state) then
    o_use_igst := false;
  end if;

  select tr.* into v_tr
    from public.tax_rates tr
   where tr.tenant_id = p_tenant and tr.deleted_at is null
     and tr.from_date <= p_as_of
     and (tr.to_date is null or tr.to_date >= p_as_of)
     and (tr.customer_id is null or tr.customer_id = p_customer)
     and (tr.product_id is null or tr.product_id = p_product)
   order by
     (case when tr.customer_id is not null then 4 else 0 end)
   + (case when tr.product_id is not null then 2 else 0 end) desc,
     tr.from_date desc
   limit 1;

  if found then
    o_igst := coalesce(v_tr.igst_pct, 0);
    o_cgst := coalesce(v_tr.cgst_pct, 0);
    o_sgst := coalesce(v_tr.sgst_pct, 0);
  end if;
end
$$;

-- 6. Vendor cost from contract slabs
create or replace function app.compute_vendor_cost(
  p_tenant uuid,
  p_vendor uuid,
  p_product uuid,
  p_origin uuid,
  p_dest uuid,
  p_zone uuid,
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
  v_contract uuid;
  v_slab record;
  v_cost numeric(14,2) := 0;
  v_min numeric(14,2) := 0;
  v_w numeric := coalesce(p_weight, 0);
begin
  if p_vendor is null then return 0; end if;

  select vc.id into v_contract
    from public.vendor_contracts vc
   where vc.tenant_id = p_tenant and vc.deleted_at is null and vc.status = 'ACTIVE'
     and vc.vendor_id = p_vendor
     and vc.product_id = p_product
     and vc.from_date <= p_as_of
     and (vc.origin_destination_id is null or vc.origin_destination_id = p_origin)
     and (vc.destination_id is null or vc.destination_id = p_dest)
     and (vc.zone_id is null or vc.zone_id = p_zone)
     and (vc.service is null or nullif(btrim(vc.service),'') is null
          or upper(vc.service) = upper(coalesce(p_service,'')))
   order by
     (case when vc.destination_id is not null then 8 else 0 end)
   + (case when vc.zone_id is not null then 4 else 0 end)
   + (case when vc.origin_destination_id is not null then 2 else 0 end) desc,
     vc.from_date desc
   limit 1;

  if v_contract is null then return 0; end if;

  for v_slab in
    select * from public.vendor_contract_slabs s
     where s.tenant_id = p_tenant and s.contract_id = v_contract
     order by s.seq
  loop
    if v_slab.rate_type = 'FLAT' then
      v_cost := v_slab.rate;
    elsif v_slab.rate_type = 'PER_KG' then
      v_cost := round(v_w * v_slab.rate, 2);
    elsif v_slab.rate_type = 'PER_SLAB' then
      if v_w <= coalesce(nullif(v_slab.weight,0), v_w) then
        v_cost := v_slab.rate;
        exit;
      end if;
    elsif v_slab.rate_type = 'MINIMUM' then
      v_min := greatest(v_min, v_slab.rate);
    end if;
  end loop;

  return greatest(v_cost, v_min);
end
$$;

-- Core pipeline + persist
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
  v_vendor numeric(14,2) := 0;
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

  -- 1. Lane
  v_zone := app.resolve_rating_zone(
    v_s.tenant_id, v_s.origin_destination_id, v_s.destination_id,
    v_s.vendor_id, v_s.product_id, v_s.service, v_as_of);

  -- 2. Customer rate → freight
  if v_s.customer_id is not null then
    v_rate := app.resolve_customer_rate(
      v_s.tenant_id, v_s.customer_id, v_s.product_id, v_s.service,
      v_s.origin_destination_id, v_s.destination_id, v_zone, v_as_of);
  end if;

  if v_rate.id is not null then
    v_chargeable := greatest(v_weight, coalesce(v_rate.min_weight, 0));
    v_freight := round(v_chargeable * coalesce(v_rate.rate_per_kg, 0), 2);
    v_other := v_other + coalesce(v_rate.other_charges, 0);
  end if;

  -- 3. Charge definitions + customer_other_charges
  for v_row in
    select c.code, c.name, c.charge_rate, c.apply_fuel, c.apply_tax, c.apply_tax_on_fuel, c.base_on
      from public.charges c
     where c.tenant_id = v_s.tenant_id and c.deleted_at is null
       and c.charge_type = 'AIRWAYBILL'
       and upper(c.code) <> 'FREIGHT'
     order by c.sequence, c.code
  loop
    v_line_amt := coalesce(v_row.charge_rate, 0);
    if upper(coalesce(v_row.base_on,'')) like '%WEIGHT%'
       or upper(coalesce(v_row.base_on,'')) like '%CHARGE%' then
      v_line_amt := round(v_weight * coalesce(v_row.charge_rate, 0), 2);
    end if;
    if v_line_amt > 0 then
      v_other := v_other + v_line_amt;
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'code', v_row.code, 'description', v_row.name, 'amount', v_line_amt,
        'fuel_applies', coalesce(v_row.apply_fuel, false),
        'tax_applies', coalesce(v_row.apply_tax, false),
        'tax_on_fuel', coalesce(v_row.apply_tax_on_fuel, false),
        'side', 'CUSTOMER', 'source', 'charge_definition'));
    end if;
  end loop;

  if v_s.customer_id is not null then
    for v_row in
      select coc.charge_type, coc.amount, coc.minimum_value
        from public.customer_other_charges coc
       where coc.tenant_id = v_s.tenant_id and coc.customer_id = v_s.customer_id
         and (coc.from_date is null or coc.from_date <= v_as_of)
         and (coc.to_date is null or coc.to_date >= v_as_of)
    loop
      v_line_amt := greatest(coalesce(v_row.amount,0), coalesce(v_row.minimum_value,0));
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

  -- 4. Fuel
  if v_apply_fuel then
    v_fuel_pct := app.resolve_fuel_pct(
      v_s.tenant_id, v_s.customer_id, v_s.vendor_id, v_s.product_id,
      v_s.destination_id, v_as_of, coalesce(v_rate.fuel_pct, 0));
    v_fuel := round((v_freight + v_other) * coalesce(v_fuel_pct,0) / 100.0, 2);
  end if;

  -- 5. Tax
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

  -- 6. Vendor cost
  v_vendor := app.compute_vendor_cost(
    v_s.tenant_id, v_s.vendor_id, v_s.product_id,
    v_s.origin_destination_id, v_s.destination_id, v_zone,
    v_s.service, v_weight, v_as_of);

  v_total := v_freight + v_other + v_fuel + v_tax;

  v_breakdown := jsonb_build_object(
    'as_of', v_as_of,
    'lane', jsonb_build_object(
      'origin_destination_id', v_s.origin_destination_id,
      'destination_id', v_s.destination_id,
      'zone_id', v_zone,
      'service', v_s.service),
    'customer_rate', case when v_rate.id is null then null else jsonb_build_object(
      'id', v_rate.id, 'min_weight', v_rate.min_weight,
      'rate_per_kg', v_rate.rate_per_kg, 'chargeable_weight', v_chargeable) end,
    'freight', v_freight,
    'other_charges', v_other,
    'other_lines', v_lines,
    'fuel', jsonb_build_object('pct', v_fuel_pct, 'amount', v_fuel, 'applied', v_apply_fuel),
    'tax', jsonb_build_object(
      'use_igst', v_use_igst, 'igst_pct', v_igst_pct, 'cgst_pct', v_cgst_pct,
      'sgst_pct', v_sgst_pct, 'igst', v_igst, 'cgst', v_cgst, 'sgst', v_sgst,
      'amount', v_tax, 'applied', v_apply_tax),
    'vendor_cost', v_vendor,
    'total', v_total,
    'weight', v_weight);

  if not p_persist then
    return v_breakdown || jsonb_build_object(
      'shipment_id', v_s.id, 'persisted', false,
      'snapshot', '[]'::jsonb);
  end if;

  -- 7. Persist immutable snapshot (replace all charge lines for this shipment)
  delete from public.shipment_charge_snapshots
   where tenant_id = v_s.tenant_id and shipment_id = v_s.id;

  -- Freight line
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

  -- Other customer lines (tax already rolled into freight line totals for simplicity
  -- when only one tax base; allocate zero tax on other lines to avoid double-count UI)
  for v_row in
    select * from jsonb_array_elements(v_lines) t(elem)
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

  if v_vendor > 0 then
    v_seq := v_seq + 1;
    insert into public.shipment_charge_snapshots (
      tenant_id, shipment_id, seq, side, description, rate, amount,
      fuel_applies, fuel_amount, tax_applies, tax_on_fuel,
      igst, sgst, cgst, total, charges_type, created_by, updated_by)
    values (
      v_s.tenant_id, v_s.id, v_seq, 'VENDOR', 'Vendor Freight',
      v_vendor, v_vendor, false, 0, false, false,
      0, 0, 0, v_vendor, 'SYSTEM', auth.uid(), auth.uid());
  end if;

  v_ver := coalesce(v_s.rating_version, 0) + 1;

  update public.shipments set
    customer_charges_total = v_freight + v_other,
    vendor_charges_total = v_vendor,
    fuel_amount = v_fuel,
    tax_amount = v_tax,
    grand_total = v_total,
    rated_at = now(),
    rating_version = v_ver,
    updated_by = auth.uid()
  where id = v_s.id and tenant_id = v_s.tenant_id
  returning * into v_s;

  insert into public.rating_audit (
    tenant_id, shipment_id, rating_version, as_of_date, breakdown,
    freight, fuel, tax, other_charges, vendor_cost, total, created_by, updated_by)
  values (
    v_s.tenant_id, v_s.id, v_ver, v_as_of, v_breakdown,
    v_freight, v_fuel, v_tax, v_other, v_vendor, v_total, auth.uid(), auth.uid());

  perform app.write_audit_log(
    p_tenant_id => v_s.tenant_id, p_entity_type => 'shipments', p_action => 'MODIFY',
    p_entity_id => v_s.id, p_module_slug => 'txn.awb-entry',
    p_new => jsonb_build_object(
      'rating_version', v_ver, 'freight', v_freight, 'fuel', v_fuel,
      'tax', v_tax, 'total', v_total));

  return v_breakdown || jsonb_build_object(
    'shipment_id', v_s.id,
    'rating_version', v_ver,
    'persisted', true,
    'row_version', v_s.row_version,
    'freight', v_freight,
    'fuel', v_fuel,
    'tax', v_tax,
    'other_charges', v_other,
    'vendor_cost', v_vendor,
    'total', v_total);
end
$$;

-- ---------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------
create or replace function public.calculate_shipment_rating(p_shipment_id uuid)
returns jsonb
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
  if not app.user_has_permission(v_tenant, 'txn.awb-entry', 'modify')
     and not app.user_has_permission(v_tenant, 'txn.awb-entry', 'add') then
    raise exception 'Permission denied: txn.awb-entry' using errcode = '42501';
  end if;

  select * into v_s from public.shipments
   where id = p_shipment_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;

  return app.run_shipment_rating(p_shipment_id, true);
end
$$;

revoke all on function public.calculate_shipment_rating(uuid) from public;
grant execute on function public.calculate_shipment_rating(uuid)
  to authenticated, service_role;

create or replace function public.recalculate_shipment_rating(
  p_shipment_id uuid,
  p_row_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_s public.shipments;
  v_result jsonb;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not app.user_has_permission(v_tenant, 'txn.awb-entry', 'modify') then
    raise exception 'Permission denied: txn.awb-entry modify' using errcode = '42501';
  end if;

  select * into v_s from public.shipments
   where id = p_shipment_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;
  if v_s.row_version is distinct from p_row_version then
    raise exception 'This record was changed by someone else. Reload and try again.'
      using errcode = '40001';
  end if;

  perform app.assert_shipment_rating_editable(v_s);
  v_result := app.run_shipment_rating(p_shipment_id, true);
  return v_result;
end
$$;

revoke all on function public.recalculate_shipment_rating(uuid, integer) from public;
grant execute on function public.recalculate_shipment_rating(uuid, integer)
  to authenticated, service_role;

create or replace function public.get_rating_breakdown(p_shipment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_s public.shipments;
  v_audit public.rating_audit;
  v_snaps jsonb;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not app.user_has_permission(v_tenant, 'txn.awb-entry', 'list')
     and not app.user_has_permission(v_tenant, 'txn.awb-entry', 'modify')
     and not app.user_has_permission(v_tenant, 'txn.awb-entry', 'add') then
    raise exception 'Permission denied: txn.awb-entry' using errcode = '42501';
  end if;

  select * into v_s from public.shipments
   where id = p_shipment_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;

  select * into v_audit from public.rating_audit ra
   where ra.tenant_id = v_tenant and ra.shipment_id = p_shipment_id
     and ra.deleted_at is null
   order by ra.rating_version desc limit 1;

  select coalesce(jsonb_agg(to_jsonb(scs) order by scs.seq, scs.side), '[]'::jsonb)
    into v_snaps
    from public.shipment_charge_snapshots scs
   where scs.tenant_id = v_tenant and scs.shipment_id = p_shipment_id
     and scs.deleted_at is null;

  if v_audit.id is null then
    return app.run_shipment_rating(p_shipment_id, false)
      || jsonb_build_object('snapshot', v_snaps, 'from_audit', false);
  end if;

  return v_audit.breakdown || jsonb_build_object(
    'shipment_id', p_shipment_id,
    'rating_version', v_audit.rating_version,
    'freight', v_audit.freight,
    'fuel', v_audit.fuel,
    'tax', v_audit.tax,
    'other_charges', v_audit.other_charges,
    'vendor_cost', v_audit.vendor_cost,
    'total', v_audit.total,
    'snapshot', v_snaps,
    'from_audit', true,
    'grand_total', v_s.grand_total,
    'customer_charges_total', v_s.customer_charges_total,
    'vendor_charges_total', v_s.vendor_charges_total);
end
$$;

revoke all on function public.get_rating_breakdown(uuid) from public;
grant execute on function public.get_rating_breakdown(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Booking integration: confirm_booking invokes server-side rating
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
$$;

comment on function public.confirm_booking(uuid, integer) is
  'Book DRAFT→BOOKED, allocate AWB, run server rating snapshot, link pickup ASSIGNED→PICKED.';

comment on function public.calculate_shipment_rating(uuid) is
  'Run rating pipeline and persist immutable charge snapshot + rating_audit.';

comment on function public.recalculate_shipment_rating(uuid, integer) is
  'Recalculate rating when shipment not locked/invoiced; optimistic-locked.';

comment on function public.get_rating_breakdown(uuid) is
  'Return full rating calculation tree (from audit) plus charge snapshots.';
