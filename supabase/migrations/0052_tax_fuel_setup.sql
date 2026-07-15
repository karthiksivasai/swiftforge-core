-- ===========================================================================
-- 0052  tax & fuel setup — Phase 6 Milestone 6D
-- ---------------------------------------------------------------------------
-- Completes fuel_surcharge_rates / tax_rates configuration masters used by
-- Phase 4H rating (app.resolve_fuel_pct / app.resolve_tax_pcts).
-- CRUD RPCs + overlap validation + soft delete + audit.
-- No automatic rerating — admins run Rate Update (6B) / Zone Update (6C).
-- No notifications / email / pincode / workers / Phase 7.
-- Permissions: utl.fuel-setup, utl.tax-surcharge-setup
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Schema completion
-- ---------------------------------------------------------------------------
alter table public.fuel_surcharge_rates
  add column if not exists zone_id uuid,
  add column if not exists status text not null default 'ACTIVE';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fuel_surcharge_rates_zone_fk'
  ) then
    alter table public.fuel_surcharge_rates
      add constraint fuel_surcharge_rates_zone_fk
      foreign key (tenant_id, zone_id)
      references public.zones (tenant_id, id) on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fuel_surcharge_rates_status_chk'
  ) then
    alter table public.fuel_surcharge_rates
      add constraint fuel_surcharge_rates_status_chk
      check (status in ('ACTIVE','INACTIVE'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fuel_surcharge_rates_pct_chk'
  ) then
    alter table public.fuel_surcharge_rates
      add constraint fuel_surcharge_rates_pct_chk
      check (percentage >= 0 and percentage <= 100);
  end if;
end $$;

alter table public.tax_rates
  add column if not exists tax_type text not null default 'GST',
  add column if not exists tax_on_fuel boolean not null default true,
  add column if not exists status text not null default 'ACTIVE';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tax_rates_status_chk'
  ) then
    alter table public.tax_rates
      add constraint tax_rates_status_chk
      check (status in ('ACTIVE','INACTIVE'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tax_rates_pct_chk'
  ) then
    alter table public.tax_rates
      add constraint tax_rates_pct_chk
      check (
        igst_pct >= 0 and igst_pct <= 100
        and cgst_pct >= 0 and cgst_pct <= 100
        and sgst_pct >= 0 and sgst_pct <= 100
      );
  end if;
end $$;

create index if not exists fuel_surcharge_rates_zone_idx
  on public.fuel_surcharge_rates (tenant_id, zone_id, from_date desc)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Overlap helpers (identical scope + overlapping effective dates)
-- ---------------------------------------------------------------------------
create or replace function app.fuel_rate_scope_key(
  p_customer uuid, p_product uuid, p_zone uuid,
  p_vendor uuid, p_destination uuid
)
returns text
language sql
immutable
as $$
  select concat_ws('|',
    coalesce(p_customer::text, '*'),
    coalesce(p_product::text, '*'),
    coalesce(p_zone::text, '*'),
    coalesce(p_vendor::text, '*'),
    coalesce(p_destination::text, '*'));
$$;

create or replace function app.assert_fuel_rate_no_overlap(
  p_tenant uuid,
  p_id uuid,
  p_customer uuid,
  p_product uuid,
  p_zone uuid,
  p_vendor uuid,
  p_destination uuid,
  p_from date,
  p_to date
)
returns void
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_hit uuid;
  v_to date := coalesce(p_to, '9999-12-31'::date);
begin
  if p_from is null then
    raise exception 'from_date is required' using errcode = 'CMS04';
  end if;
  if p_to is not null and p_to < p_from then
    raise exception 'to_date must be on or after from_date' using errcode = 'CMS04';
  end if;

  select f.id into v_hit
    from public.fuel_surcharge_rates f
   where f.tenant_id = p_tenant
     and f.deleted_at is null
     and (p_id is null or f.id <> p_id)
     and f.customer_id is not distinct from p_customer
     and f.product_id is not distinct from p_product
     and f.zone_id is not distinct from p_zone
     and f.vendor_id is not distinct from p_vendor
     and f.destination_id is not distinct from p_destination
     and daterange(f.from_date, coalesce(f.to_date, '9999-12-31'::date), '[]')
         && daterange(p_from, v_to, '[]')
   limit 1;

  if v_hit is not null then
    raise exception 'Overlapping fuel rate for the same scope and date range'
      using errcode = 'CMS04';
  end if;
end
$$;

create or replace function app.assert_tax_rate_no_overlap(
  p_tenant uuid,
  p_id uuid,
  p_customer uuid,
  p_product uuid,
  p_tax_type text,
  p_from date,
  p_to date
)
returns void
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_hit uuid;
  v_to date := coalesce(p_to, '9999-12-31'::date);
  v_type text := coalesce(nullif(btrim(p_tax_type),''), 'GST');
begin
  if p_from is null then
    raise exception 'from_date is required' using errcode = 'CMS04';
  end if;
  if p_to is not null and p_to < p_from then
    raise exception 'to_date must be on or after from_date' using errcode = 'CMS04';
  end if;

  select t.id into v_hit
    from public.tax_rates t
   where t.tenant_id = p_tenant
     and t.deleted_at is null
     and (p_id is null or t.id <> p_id)
     and t.customer_id is not distinct from p_customer
     and t.product_id is not distinct from p_product
     and coalesce(nullif(btrim(t.tax_type),''), 'GST') = v_type
     and daterange(t.from_date, coalesce(t.to_date, '9999-12-31'::date), '[]')
         && daterange(p_from, v_to, '[]')
   limit 1;

  if v_hit is not null then
    raise exception 'Overlapping tax rate for the same scope and date range'
      using errcode = 'CMS04';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Rating lookup — same function names; zone-aware fuel precedence
-- Customer+Product+Zone → Product+Zone → Global (ACTIVE only)
-- ---------------------------------------------------------------------------
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
  v_zone uuid;
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

  if p_dest is not null then
    select d.zone_id into v_zone
      from public.destinations d
     where d.id = p_dest and d.tenant_id = p_tenant and d.deleted_at is null;
  end if;

  select f.percentage into v_pct
    from public.fuel_surcharge_rates f
   where f.tenant_id = p_tenant and f.deleted_at is null
     and f.status = 'ACTIVE'
     and f.from_date <= p_as_of
     and (f.to_date is null or f.to_date >= p_as_of)
     and (f.customer_id is null or f.customer_id = p_customer)
     and (f.product_id is null or f.product_id = p_product)
     and (f.zone_id is null or f.zone_id = v_zone)
     and (f.vendor_id is null or f.vendor_id = p_vendor)
     and (f.destination_id is null or f.destination_id = p_dest)
   order by
     (case when f.customer_id is not null then 16 else 0 end)
   + (case when f.product_id is not null then 8 else 0 end)
   + (case when f.zone_id is not null then 4 else 0 end)
   + (case when f.destination_id is not null then 2 else 0 end)
   + (case when f.vendor_id is not null then 1 else 0 end) desc,
     f.from_date desc
   limit 1;

  return coalesce(v_pct, v_cust_pct, p_rate_fuel_pct, 0);
end
$$;

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
     and tr.status = 'ACTIVE'
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

-- ---------------------------------------------------------------------------
-- Permission helpers
-- ---------------------------------------------------------------------------
create or replace function app.assert_fuel_setup_permission(
  p_tenant uuid, p_action text
)
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
  if app.user_has_permission(p_tenant, 'utl.fuel-setup', p_action) then
    return;
  end if;
  -- list/search also allow modify/add for read convenience
  if p_action in ('list','search')
     and (
       app.user_has_permission(p_tenant, 'utl.fuel-setup', 'add')
       or app.user_has_permission(p_tenant, 'utl.fuel-setup', 'modify')
       or app.user_has_permission(p_tenant, 'utl.fuel-setup', 'list')
       or app.user_has_permission(p_tenant, 'utl.fuel-setup', 'search')
     ) then
    return;
  end if;
  raise exception 'Permission denied: utl.fuel-setup' using errcode = '42501';
end
$$;

create or replace function app.assert_tax_setup_permission(
  p_tenant uuid, p_action text
)
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
  if app.user_has_permission(p_tenant, 'utl.tax-surcharge-setup', p_action) then
    return;
  end if;
  if p_action in ('list','search')
     and (
       app.user_has_permission(p_tenant, 'utl.tax-surcharge-setup', 'add')
       or app.user_has_permission(p_tenant, 'utl.tax-surcharge-setup', 'modify')
       or app.user_has_permission(p_tenant, 'utl.tax-surcharge-setup', 'list')
       or app.user_has_permission(p_tenant, 'utl.tax-surcharge-setup', 'search')
     ) then
    return;
  end if;
  raise exception 'Permission denied: utl.tax-surcharge-setup' using errcode = '42501';
end
$$;

create or replace function app.current_tenant_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  return v_tenant;
end
$$;

-- ---------------------------------------------------------------------------
-- Fuel CRUD
-- ---------------------------------------------------------------------------
create or replace function public.save_fuel_rate(
  p_fields jsonb,
  p_id uuid default null,
  p_row_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_f jsonb := coalesce(p_fields, '{}'::jsonb);
  v_row public.fuel_surcharge_rates;
  v_cust uuid; v_prod uuid; v_zone uuid; v_vendor uuid; v_dest uuid;
  v_from date; v_to date; v_pct numeric(7,4); v_status text;
  v_entry text; v_code text;
begin
  if p_id is null then
    perform app.assert_fuel_setup_permission(v_tenant, 'add');
  else
    perform app.assert_fuel_setup_permission(v_tenant, 'modify');
  end if;

  begin
    v_from := nullif(btrim(coalesce(v_f->>'from_date','')),'')::date;
    v_to := nullif(btrim(coalesce(v_f->>'to_date','')),'')::date;
    v_pct := coalesce(nullif(btrim(coalesce(v_f->>'percentage','')),'')::numeric, -1);
  exception when others then
    raise exception 'Invalid date or percentage' using errcode = 'CMS04';
  end;
  if v_from is null then
    raise exception 'from_date is required' using errcode = 'CMS04';
  end if;
  if v_pct < 0 or v_pct > 100 then
    raise exception 'percentage must be between 0 and 100' using errcode = 'CMS04';
  end if;
  v_status := upper(coalesce(nullif(btrim(v_f->>'status'),''), 'ACTIVE'));
  if v_status not in ('ACTIVE','INACTIVE') then
    raise exception 'Invalid status' using errcode = 'CMS04';
  end if;
  v_entry := nullif(btrim(coalesce(v_f->>'entry_code','')),'');

  v_cust := nullif(btrim(coalesce(v_f->>'customer_id','')),'')::uuid;
  v_code := nullif(btrim(coalesce(v_f->>'customer_code','')),'');
  if v_cust is null and v_code is not null then
    select id into v_cust from public.customers
     where tenant_id = v_tenant and code = v_code and deleted_at is null;
    if v_cust is null then
      raise exception 'Customer "%" not found', v_code using errcode = 'CMS04';
    end if;
  end if;

  v_prod := nullif(btrim(coalesce(v_f->>'product_id','')),'')::uuid;
  v_code := nullif(btrim(coalesce(v_f->>'product_code','')),'');
  if v_prod is null and v_code is not null then
    select id into v_prod from public.products
     where tenant_id = v_tenant and code = v_code and deleted_at is null;
    if v_prod is null then
      raise exception 'Product "%" not found', v_code using errcode = 'CMS04';
    end if;
  end if;

  v_zone := nullif(btrim(coalesce(v_f->>'zone_id','')),'')::uuid;
  v_code := nullif(btrim(coalesce(v_f->>'zone_code','')),'');
  if v_zone is null and v_code is not null then
    select id into v_zone from public.zones
     where tenant_id = v_tenant and code = v_code and deleted_at is null;
    if v_zone is null then
      raise exception 'Zone "%" not found', v_code using errcode = 'CMS04';
    end if;
  end if;

  v_vendor := nullif(btrim(coalesce(v_f->>'vendor_id','')),'')::uuid;
  v_code := nullif(btrim(coalesce(v_f->>'vendor_code','')),'');
  if v_vendor is null and v_code is not null then
    select id into v_vendor from public.vendors
     where tenant_id = v_tenant and code = v_code and deleted_at is null;
    if v_vendor is null then
      raise exception 'Vendor "%" not found', v_code using errcode = 'CMS04';
    end if;
  end if;

  v_dest := nullif(btrim(coalesce(v_f->>'destination_id','')),'')::uuid;
  v_code := nullif(btrim(coalesce(v_f->>'destination_code','')),'');
  if v_dest is null and v_code is not null then
    select id into v_dest from public.destinations
     where tenant_id = v_tenant and code = v_code and deleted_at is null;
    if v_dest is null then
      raise exception 'Destination "%" not found', v_code using errcode = 'CMS04';
    end if;
  end if;

  perform app.assert_fuel_rate_no_overlap(
    v_tenant, p_id, v_cust, v_prod, v_zone, v_vendor, v_dest, v_from, v_to);

  if p_id is null then
    insert into public.fuel_surcharge_rates (
      tenant_id, entry_code, customer_id, vendor_id, product_id, zone_id,
      destination_id, from_date, to_date, percentage, status,
      created_by, updated_by)
    values (
      v_tenant, v_entry, v_cust, v_vendor, v_prod, v_zone, v_dest,
      v_from, v_to, v_pct, v_status, auth.uid(), auth.uid())
    returning * into v_row;

    perform app.write_audit_log(
      v_tenant, 'fuel_surcharge_rates', 'ADD', v_row.id, 'utl.fuel-setup',
      null, to_jsonb(v_row));
  else
    select * into v_row from public.fuel_surcharge_rates
     where id = p_id and tenant_id = v_tenant and deleted_at is null
     for update;
    if not found then
      raise exception 'Fuel rate not found' using errcode = 'P0002';
    end if;
    if p_row_version is not null and v_row.row_version <> p_row_version then
      raise exception 'Optimistic lock conflict' using errcode = 'CMS04';
    end if;

    update public.fuel_surcharge_rates
       set entry_code = coalesce(v_entry, entry_code),
           customer_id = v_cust,
           vendor_id = v_vendor,
           product_id = v_prod,
           zone_id = v_zone,
           destination_id = v_dest,
           from_date = v_from,
           to_date = v_to,
           percentage = v_pct,
           status = v_status,
           updated_by = auth.uid(),
           updated_at = now(),
           row_version = row_version + 1
     where id = p_id and tenant_id = v_tenant
     returning * into v_row;

    perform app.write_audit_log(
      v_tenant, 'fuel_surcharge_rates', 'MODIFY', v_row.id, 'utl.fuel-setup',
      null, to_jsonb(v_row));
  end if;

  return to_jsonb(v_row);
end
$$;

revoke all on function public.save_fuel_rate(jsonb, uuid, integer) from public;
grant execute on function public.save_fuel_rate(jsonb, uuid, integer)
  to authenticated, service_role;

create or replace function public.delete_fuel_rate(
  p_id uuid,
  p_row_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_row public.fuel_surcharge_rates;
begin
  if not (
    app.is_platform_admin() or app.is_tenant_admin(v_tenant)
    or app.user_has_permission(v_tenant, 'utl.fuel-setup', 'delete')
    or app.user_has_permission(v_tenant, 'utl.fuel-setup', 'modify')
  ) then
    raise exception 'Permission denied: utl.fuel-setup' using errcode = '42501';
  end if;

  select * into v_row from public.fuel_surcharge_rates
   where id = p_id and tenant_id = v_tenant and deleted_at is null
   for update;
  if not found then
    raise exception 'Fuel rate not found' using errcode = 'P0002';
  end if;
  if p_row_version is not null and v_row.row_version <> p_row_version then
    raise exception 'Optimistic lock conflict' using errcode = 'CMS04';
  end if;

  update public.fuel_surcharge_rates
     set deleted_at = now(),
         updated_at = now(),
         updated_by = auth.uid(),
         row_version = row_version + 1
   where id = p_id
   returning * into v_row;

  perform app.write_audit_log(
    v_tenant, 'fuel_surcharge_rates', 'DELETE', v_row.id, 'utl.fuel-setup',
    to_jsonb(v_row), null);

  return jsonb_build_object('id', v_row.id, 'deleted', true);
end
$$;

revoke all on function public.delete_fuel_rate(uuid, integer) from public;
grant execute on function public.delete_fuel_rate(uuid, integer)
  to authenticated, service_role;

create or replace function public.list_fuel_rates(
  p_search text default null,
  p_status text default null,
  p_page integer default 1,
  p_page_size integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_page integer := greatest(coalesce(p_page,1), 1);
  v_size integer := least(greatest(coalesce(p_page_size,50), 1), 200);
  v_offset integer;
  v_status text := nullif(upper(btrim(coalesce(p_status,''))),'');
  v_q text := nullif(btrim(coalesce(p_search,'')),'');
  v_total bigint;
  v_rows jsonb;
begin
  perform app.assert_fuel_setup_permission(v_tenant, 'list');
  v_offset := (v_page - 1) * v_size;

  select count(*) into v_total
    from public.fuel_surcharge_rates f
   where f.tenant_id = v_tenant
     and f.deleted_at is null
     and (v_status is null or f.status = v_status)
     and (v_q is null
          or f.entry_code ilike '%'||v_q||'%'
          or f.percentage::text ilike '%'||v_q||'%');

  select coalesce(jsonb_agg(to_jsonb(t) order by t.from_date desc, t.created_at desc), '[]'::jsonb)
    into v_rows
    from (
      select
        f.*,
        c.code as customer_code, c.name as customer_name,
        p.code as product_code, p.name as product_name,
        z.code as zone_code, z.name as zone_name,
        v.code as vendor_code, v.name as vendor_name,
        d.code as destination_code, d.name as destination_name
      from public.fuel_surcharge_rates f
      left join public.customers c on c.id = f.customer_id and c.tenant_id = f.tenant_id
      left join public.products p on p.id = f.product_id and p.tenant_id = f.tenant_id
      left join public.zones z on z.id = f.zone_id and z.tenant_id = f.tenant_id
      left join public.vendors v on v.id = f.vendor_id and v.tenant_id = f.tenant_id
      left join public.destinations d on d.id = f.destination_id and d.tenant_id = f.tenant_id
      where f.tenant_id = v_tenant
        and f.deleted_at is null
        and (v_status is null or f.status = v_status)
        and (v_q is null
             or f.entry_code ilike '%'||v_q||'%'
             or coalesce(c.code,'') ilike '%'||v_q||'%'
             or coalesce(p.code,'') ilike '%'||v_q||'%'
             or coalesce(z.code,'') ilike '%'||v_q||'%')
      order by f.from_date desc, f.created_at desc
      limit v_size offset v_offset
    ) t;

  return jsonb_build_object(
    'rows', v_rows, 'total', v_total, 'page', v_page, 'page_size', v_size);
end
$$;

revoke all on function public.list_fuel_rates(text, text, integer, integer) from public;
grant execute on function public.list_fuel_rates(text, text, integer, integer)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tax CRUD
-- ---------------------------------------------------------------------------
create or replace function public.save_tax_rate(
  p_fields jsonb,
  p_id uuid default null,
  p_row_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_f jsonb := coalesce(p_fields, '{}'::jsonb);
  v_row public.tax_rates;
  v_cust uuid; v_prod uuid;
  v_from date; v_to date;
  v_igst numeric(7,4); v_cgst numeric(7,4); v_sgst numeric(7,4);
  v_status text; v_tax_type text; v_tax_on_fuel boolean;
  v_code text;
begin
  if p_id is null then
    perform app.assert_tax_setup_permission(v_tenant, 'add');
  else
    perform app.assert_tax_setup_permission(v_tenant, 'modify');
  end if;

  begin
    v_from := nullif(btrim(coalesce(v_f->>'from_date','')),'')::date;
    v_to := nullif(btrim(coalesce(v_f->>'to_date','')),'')::date;
    v_igst := coalesce(nullif(btrim(coalesce(v_f->>'igst_pct','')),'')::numeric, 0);
    v_cgst := coalesce(nullif(btrim(coalesce(v_f->>'cgst_pct','')),'')::numeric, 0);
    v_sgst := coalesce(nullif(btrim(coalesce(v_f->>'sgst_pct','')),'')::numeric, 0);
  exception when others then
    raise exception 'Invalid date or tax percentage' using errcode = 'CMS04';
  end;
  if v_from is null then
    raise exception 'from_date is required' using errcode = 'CMS04';
  end if;
  if v_igst < 0 or v_igst > 100 or v_cgst < 0 or v_cgst > 100
     or v_sgst < 0 or v_sgst > 100 then
    raise exception 'Tax percentages must be between 0 and 100' using errcode = 'CMS04';
  end if;

  v_status := upper(coalesce(nullif(btrim(v_f->>'status'),''), 'ACTIVE'));
  if v_status not in ('ACTIVE','INACTIVE') then
    raise exception 'Invalid status' using errcode = 'CMS04';
  end if;
  v_tax_type := coalesce(nullif(btrim(v_f->>'tax_type'),''), 'GST');
  v_tax_on_fuel := case lower(btrim(coalesce(v_f->>'tax_on_fuel','true')))
    when 'false' then false when 'no' then false when '0' then false
    when 'f' then false else true end;

  v_cust := nullif(btrim(coalesce(v_f->>'customer_id','')),'')::uuid;
  v_code := nullif(btrim(coalesce(v_f->>'customer_code','')),'');
  if v_cust is null and v_code is not null then
    select id into v_cust from public.customers
     where tenant_id = v_tenant and code = v_code and deleted_at is null;
    if v_cust is null then
      raise exception 'Customer "%" not found', v_code using errcode = 'CMS04';
    end if;
  end if;

  v_prod := nullif(btrim(coalesce(v_f->>'product_id','')),'')::uuid;
  v_code := nullif(btrim(coalesce(v_f->>'product_code','')),'');
  if v_prod is null and v_code is not null then
    select id into v_prod from public.products
     where tenant_id = v_tenant and code = v_code and deleted_at is null;
    if v_prod is null then
      raise exception 'Product "%" not found', v_code using errcode = 'CMS04';
    end if;
  end if;

  perform app.assert_tax_rate_no_overlap(
    v_tenant, p_id, v_cust, v_prod, v_tax_type, v_from, v_to);

  if p_id is null then
    insert into public.tax_rates (
      tenant_id, customer_id, product_id, from_date, to_date,
      igst_pct, cgst_pct, sgst_pct, tax_type, tax_on_fuel, status,
      created_by, updated_by)
    values (
      v_tenant, v_cust, v_prod, v_from, v_to,
      v_igst, v_cgst, v_sgst, v_tax_type, v_tax_on_fuel, v_status,
      auth.uid(), auth.uid())
    returning * into v_row;

    perform app.write_audit_log(
      v_tenant, 'tax_rates', 'ADD', v_row.id, 'utl.tax-surcharge-setup',
      null, to_jsonb(v_row));
  else
    select * into v_row from public.tax_rates
     where id = p_id and tenant_id = v_tenant and deleted_at is null
     for update;
    if not found then
      raise exception 'Tax rate not found' using errcode = 'P0002';
    end if;
    if p_row_version is not null and v_row.row_version <> p_row_version then
      raise exception 'Optimistic lock conflict' using errcode = 'CMS04';
    end if;

    update public.tax_rates
       set customer_id = v_cust,
           product_id = v_prod,
           from_date = v_from,
           to_date = v_to,
           igst_pct = v_igst,
           cgst_pct = v_cgst,
           sgst_pct = v_sgst,
           tax_type = v_tax_type,
           tax_on_fuel = v_tax_on_fuel,
           status = v_status,
           updated_by = auth.uid(),
           updated_at = now(),
           row_version = row_version + 1
     where id = p_id and tenant_id = v_tenant
     returning * into v_row;

    perform app.write_audit_log(
      v_tenant, 'tax_rates', 'MODIFY', v_row.id, 'utl.tax-surcharge-setup',
      null, to_jsonb(v_row));
  end if;

  return to_jsonb(v_row);
end
$$;

revoke all on function public.save_tax_rate(jsonb, uuid, integer) from public;
grant execute on function public.save_tax_rate(jsonb, uuid, integer)
  to authenticated, service_role;

create or replace function public.delete_tax_rate(
  p_id uuid,
  p_row_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_row public.tax_rates;
begin
  if not (
    app.is_platform_admin() or app.is_tenant_admin(v_tenant)
    or app.user_has_permission(v_tenant, 'utl.tax-surcharge-setup', 'delete')
    or app.user_has_permission(v_tenant, 'utl.tax-surcharge-setup', 'modify')
  ) then
    raise exception 'Permission denied: utl.tax-surcharge-setup' using errcode = '42501';
  end if;

  select * into v_row from public.tax_rates
   where id = p_id and tenant_id = v_tenant and deleted_at is null
   for update;
  if not found then
    raise exception 'Tax rate not found' using errcode = 'P0002';
  end if;
  if p_row_version is not null and v_row.row_version <> p_row_version then
    raise exception 'Optimistic lock conflict' using errcode = 'CMS04';
  end if;

  update public.tax_rates
     set deleted_at = now(),
         updated_at = now(),
         updated_by = auth.uid(),
         row_version = row_version + 1
   where id = p_id
   returning * into v_row;

  perform app.write_audit_log(
    v_tenant, 'tax_rates', 'DELETE', v_row.id, 'utl.tax-surcharge-setup',
    to_jsonb(v_row), null);

  return jsonb_build_object('id', v_row.id, 'deleted', true);
end
$$;

revoke all on function public.delete_tax_rate(uuid, integer) from public;
grant execute on function public.delete_tax_rate(uuid, integer)
  to authenticated, service_role;

create or replace function public.list_tax_rates(
  p_search text default null,
  p_status text default null,
  p_page integer default 1,
  p_page_size integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_page integer := greatest(coalesce(p_page,1), 1);
  v_size integer := least(greatest(coalesce(p_page_size,50), 1), 200);
  v_offset integer;
  v_status text := nullif(upper(btrim(coalesce(p_status,''))),'');
  v_q text := nullif(btrim(coalesce(p_search,'')),'');
  v_total bigint;
  v_rows jsonb;
begin
  perform app.assert_tax_setup_permission(v_tenant, 'list');
  v_offset := (v_page - 1) * v_size;

  select count(*) into v_total
    from public.tax_rates t
   where t.tenant_id = v_tenant
     and t.deleted_at is null
     and (v_status is null or t.status = v_status);

  select coalesce(jsonb_agg(to_jsonb(x) order by x.from_date desc, x.created_at desc), '[]'::jsonb)
    into v_rows
    from (
      select
        t.*,
        c.code as customer_code, c.name as customer_name,
        p.code as product_code, p.name as product_name
      from public.tax_rates t
      left join public.customers c on c.id = t.customer_id and c.tenant_id = t.tenant_id
      left join public.products p on p.id = t.product_id and p.tenant_id = t.tenant_id
      where t.tenant_id = v_tenant
        and t.deleted_at is null
        and (v_status is null or t.status = v_status)
        and (v_q is null
             or coalesce(c.code,'') ilike '%'||v_q||'%'
             or coalesce(p.code,'') ilike '%'||v_q||'%'
             or t.tax_type ilike '%'||v_q||'%')
      order by t.from_date desc, t.created_at desc
      limit v_size offset v_offset
    ) x;

  return jsonb_build_object(
    'rows', v_rows, 'total', v_total, 'page', v_page, 'page_size', v_size);
end
$$;

revoke all on function public.list_tax_rates(text, text, integer, integer) from public;
grant execute on function public.list_tax_rates(text, text, integer, integer)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Import row helpers (used by import_master CASE arms)
-- ---------------------------------------------------------------------------
create or replace function app.import_fuel_surcharge_rate_row(
  p_tenant uuid,
  p_row jsonb,
  p_map_customers jsonb,
  p_map_products jsonb,
  p_map_zones jsonb,
  p_map_vendors jsonb,
  p_map_destinations jsonb
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_cust uuid; v_prod uuid; v_zone uuid; v_vendor uuid; v_dest uuid;
  v_from date; v_to date; v_pct numeric(7,4);
begin
  v_cust := app.import_lookup(p_map_customers, p_row->>'customer_code', 'Customer code');
  v_prod := app.import_lookup(p_map_products, p_row->>'product_code', 'Product code');
  v_zone := app.import_lookup(p_map_zones, p_row->>'zone_code', 'Zone code');
  v_vendor := app.import_lookup(p_map_vendors, p_row->>'vendor_code', 'Vendor code');
  v_dest := app.import_lookup(p_map_destinations, p_row->>'destination_code', 'Destination code');

  begin
    v_from := nullif(btrim(coalesce(p_row->>'from_date','')),'')::date;
    v_to := nullif(btrim(coalesce(p_row->>'to_date','')),'')::date;
    v_pct := coalesce(nullif(btrim(coalesce(p_row->>'percentage','')),'')::numeric, -1);
  exception when others then
    raise exception using errcode='CMS01', message='Invalid from_date/to_date/percentage';
  end;
  if v_from is null then
    raise exception using errcode='CMS01', message='from_date is required';
  end if;
  if v_pct < 0 or v_pct > 100 then
    raise exception using errcode='CMS01', message='percentage must be between 0 and 100';
  end if;

  begin
    perform app.assert_fuel_rate_no_overlap(
      p_tenant, null, v_cust, v_prod, v_zone, v_vendor, v_dest, v_from, v_to);
  exception when sqlstate 'CMS04' then
    raise exception using errcode='CMS01', message=SQLERRM;
  end;

  insert into public.fuel_surcharge_rates (
    tenant_id, entry_code, customer_id, vendor_id, product_id, zone_id,
    destination_id, from_date, to_date, percentage, status)
  values (
    p_tenant,
    nullif(btrim(coalesce(p_row->>'entry_code','')),''),
    v_cust, v_vendor, v_prod, v_zone, v_dest,
    v_from, v_to, v_pct,
    app.norm_enum(p_row->>'status', array['ACTIVE','INACTIVE'], 'Status', 'ACTIVE'));
end
$$;

create or replace function app.import_tax_rate_row(
  p_tenant uuid,
  p_row jsonb,
  p_map_customers jsonb,
  p_map_products jsonb
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_cust uuid; v_prod uuid;
  v_from date; v_to date;
  v_igst numeric(7,4); v_cgst numeric(7,4); v_sgst numeric(7,4);
  v_tax_type text;
begin
  v_cust := app.import_lookup(p_map_customers, p_row->>'customer_code', 'Customer code');
  v_prod := app.import_lookup(p_map_products, p_row->>'product_code', 'Product code');

  begin
    v_from := nullif(btrim(coalesce(p_row->>'from_date','')),'')::date;
    v_to := nullif(btrim(coalesce(p_row->>'to_date','')),'')::date;
    v_igst := coalesce(nullif(btrim(coalesce(p_row->>'igst_pct', p_row->>'igst','')),'')::numeric, 0);
    v_cgst := coalesce(nullif(btrim(coalesce(p_row->>'cgst_pct', p_row->>'cgst','')),'')::numeric, 0);
    v_sgst := coalesce(nullif(btrim(coalesce(p_row->>'sgst_pct', p_row->>'sgst','')),'')::numeric, 0);
  exception when others then
    raise exception using errcode='CMS01', message='Invalid date or tax percentage';
  end;
  if v_from is null then
    raise exception using errcode='CMS01', message='from_date is required';
  end if;
  if v_igst < 0 or v_igst > 100 or v_cgst < 0 or v_cgst > 100
     or v_sgst < 0 or v_sgst > 100 then
    raise exception using errcode='CMS01', message='Tax percentages must be between 0 and 100';
  end if;

  v_tax_type := coalesce(nullif(btrim(p_row->>'tax_type'),''), 'GST');
  begin
    perform app.assert_tax_rate_no_overlap(
      p_tenant, null, v_cust, v_prod, v_tax_type, v_from, v_to);
  exception when sqlstate 'CMS04' then
    raise exception using errcode='CMS01', message=SQLERRM;
  end;

  insert into public.tax_rates (
    tenant_id, customer_id, product_id, from_date, to_date,
    igst_pct, cgst_pct, sgst_pct, tax_type, tax_on_fuel, status)
  values (
    p_tenant, v_cust, v_prod, v_from, v_to,
    v_igst, v_cgst, v_sgst, v_tax_type,
    app.norm_bool(p_row->>'tax_on_fuel', true),
    app.norm_enum(p_row->>'status', array['ACTIVE','INACTIVE'], 'Status', 'ACTIVE'));
end
$$;

comment on function public.save_fuel_rate(jsonb, uuid, integer) is
  'Create/update fuel surcharge rate with overlap validation. No auto-rerate.';
comment on function public.save_tax_rate(jsonb, uuid, integer) is
  'Create/update tax rate with overlap validation. Interstate logic stays in resolve_tax_pcts.';

-- ---------------------------------------------------------------------------
-- import_master — extended with fuel_surcharge_rates / tax_rates (from 0029)
-- ---------------------------------------------------------------------------
create or replace function public.import_master(p_master text, p_mode text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant   uuid;
  v_slug     text;
  v_mode     text := upper(coalesce(p_mode, 'VALIDATE'));
  v_job      uuid;
  v_total    int := 0;
  v_ok       int := 0;     -- inserted (COMMIT) / would-insert (VALIDATE)
  v_skipped  int := 0;     -- duplicate natural key (ON CONFLICT DO NOTHING)
  v_errcnt   int := 0;
  v_errors   jsonb := '[]'::jsonb;
  v_row      jsonb;
  v_idx      int := 0;
  v_rc       int;
  v_col      text;
  v_msg      text;
  v_country  uuid; v_state uuid; v_zone uuid; v_dest uuid;
  v_branch   uuid; v_mbranch uuid; v_manbranch uuid;
  v_ptype    uuid;       -- product_type_id (catalog)
  v_prod     uuid;       -- product_id (airlines)
  v_exc      text;       -- normalized delivery_exception type
  v_sc       uuid;       -- service_center_id (field_executives)
  v_customer uuid;       -- customer_id (consignees/shippers/customers)
  v_vendor   uuid;       -- vendor_id (service_mappings)
  v_bvendor  uuid;       -- billing_vendor_id (service_mappings)
  v_origin   uuid;       -- origin_destination_id (vendor_contracts)
  v_bstate   uuid;       -- billing_state_id (local_branches)
  -- Preloaded referenced-master maps (code -> id), built once before the loop.
  v_map_countries       jsonb := '{}'::jsonb;
  v_map_zones           jsonb := '{}'::jsonb;
  v_map_states          jsonb := '{}'::jsonb;
  v_map_destinations    jsonb := '{}'::jsonb;
  v_map_branches        jsonb := '{}'::jsonb;
  v_map_product_types   jsonb := '{}'::jsonb;
  v_map_products        jsonb := '{}'::jsonb;
  v_map_service_centers jsonb := '{}'::jsonb;
  v_map_customers       jsonb := '{}'::jsonb;
  v_map_vendors         jsonb := '{}'::jsonb;
begin
  -- ---- master -> permission slug (also validates supported master) --------
  v_slug := case p_master
    -- geo (0015/0016)
    when 'countries'           then 'mst.country-master'
    when 'zones'               then 'mst.zone-master'
    when 'states'              then 'mst.state-master'
    when 'destinations'        then 'mst.destination-master'
    when 'pincodes'            then 'mst.pincode-master'
    when 'country_pincodes'    then 'mst.country-pincodes'
    when 'areas'               then 'mst.area-master'
    -- catalog simple (0018)
    when 'product_types'       then 'mst.product-type'
    when 'products'            then 'mst.product-master'
    when 'banks'               then 'mst.bank-master'
    when 'industries'          then 'mst.industry-master'
    when 'contents'            then 'mst.content-master'
    when 'instructions'        then 'mst.instruction-master'
    when 'sales_executives'    then 'mst.sales-executive-master'
    when 'flights'             then 'mst.flight-no-master'
    when 'delivery_exceptions' then 'mst.delivery-exception-master'
    -- catalog complex (0019)
    when 'charges'             then 'mst.charge-master'
    when 'airlines'            then 'mst.airlines'
    -- catalog aggregate (0020)
    when 'service_centers'     then 'mst.service-center-master'
    when 'field_executives'    then 'mst.field-executive-master'
    -- party simple (0022)
    when 'consignees'          then 'mst.consignee-master'
    when 'shippers'            then 'mst.shipper-master'
    -- party aggregate (0023)
    when 'customers'           then 'mst.customer-master'
    -- party aggregate (0025)
    when 'vendors'             then 'mst.vendor-master'
    when 'service_mappings'    then 'mst.service-mapping'
    when 'vendor_contracts'    then 'mst.vendor-contract-master'
    when 'local_branches'      then 'mst.local-branch-master'
    -- utility tax/fuel (0052)
    when 'fuel_surcharge_rates' then 'utl.fuel-setup'
    when 'tax_rates'            then 'utl.tax-surcharge-setup'
    else null end;
  if v_slug is null then
    raise exception 'Unsupported master: %', p_master using errcode = '22023';
  end if;
  if v_mode not in ('VALIDATE','COMMIT') then
    raise exception 'Unsupported mode: % (expected VALIDATE or COMMIT)', p_mode using errcode = '22023';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'Too many rows (max 5000 per call); chunk the import' using errcode = '54000';
  end if;

  -- ---- tenant context (resolved from the authenticated user only) ---------
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  -- ---- permission: import requires ADD on the master ----------------------
  if not app.user_has_permission(v_tenant, v_slug, 'add') then
    raise exception 'Permission denied: % add', v_slug using errcode = '42501';
  end if;

  -- ---- COMMIT: open the job + suppress per-row audit (summary instead) -----
  if v_mode = 'COMMIT' then
    insert into public.import_jobs
      (tenant_id, import_type, master, mode, status, total_rows, requested_by)
    values
      (v_tenant, 'MASTER_CSV', p_master, 'COMMIT', 'RUNNING', jsonb_array_length(p_rows), auth.uid())
    returning id into v_job;
    perform set_config('app.suppress_row_audit', 'on', true);
  end if;

  -- ---- preload referenced masters ONCE (set-based; no per-row queries) ----
  case p_master
    when 'states' then
      v_map_zones := app.import_build_code_map(v_tenant, 'zones',
        app.import_distinct_codes(p_rows, array['zone_code']));
    when 'destinations' then
      v_map_countries := app.import_build_code_map(v_tenant, 'countries',
        app.import_distinct_codes(p_rows, array['country_code']));
      v_map_states := app.import_build_code_map(v_tenant, 'states',
        app.import_distinct_codes(p_rows, array['state_code']));
      v_map_zones := app.import_build_code_map(v_tenant, 'zones',
        app.import_distinct_codes(p_rows, array['zone_code']));
      v_map_branches := app.import_build_code_map(v_tenant, 'branches',
        app.import_distinct_codes(p_rows, array['main_branch_code','manifest_branch_code']));
    when 'pincodes' then
      v_map_branches := app.import_build_code_map(v_tenant, 'branches',
        app.import_distinct_codes(p_rows, array['branch_code']));
      v_map_destinations := app.import_build_code_map(v_tenant, 'destinations',
        app.import_distinct_codes(p_rows, array['destination_code']));
      v_map_zones := app.import_build_code_map(v_tenant, 'zones',
        app.import_distinct_codes(p_rows, array['zone_code']));
      v_map_states := app.import_build_code_map(v_tenant, 'states',
        app.import_distinct_codes(p_rows, array['state_code']));
    when 'country_pincodes' then
      v_map_countries := app.import_build_code_map(v_tenant, 'countries',
        app.import_distinct_codes(p_rows, array['country_code']));
    when 'areas' then
      v_map_branches := app.import_build_code_map(v_tenant, 'branches',
        app.import_distinct_codes(p_rows, array['branch_code']));
      v_map_destinations := app.import_build_code_map(v_tenant, 'destinations',
        app.import_distinct_codes(p_rows, array['destination_code']));
    when 'products' then
      v_map_product_types := app.import_build_code_map(v_tenant, 'product_types',
        app.import_distinct_codes(p_rows, array['product_type_code']));
    when 'airlines' then
      v_map_products := app.import_build_code_map(v_tenant, 'products',
        app.import_distinct_codes(p_rows, array['product_code']));
    when 'field_executives' then
      v_map_service_centers := app.import_build_code_map(v_tenant, 'service_centers',
        app.import_distinct_codes(p_rows, array['service_center_code']));
      v_map_destinations := app.import_build_code_map(v_tenant, 'destinations',
        app.import_distinct_codes(p_rows, array['destination_code']));
    when 'customers' then
      v_map_service_centers := app.import_build_code_map(v_tenant, 'service_centers',
        app.import_distinct_codes(p_rows, array['service_center_code']));
    when 'vendors' then
      v_map_states := app.import_build_code_map(v_tenant, 'states',
        app.import_distinct_codes(p_rows, array['state_code']));
      v_map_destinations := app.import_build_code_map(v_tenant, 'destinations',
        app.import_distinct_codes(p_rows, array['origin_destination_code','destination_code']));
    when 'service_mappings' then
      v_map_vendors := app.import_build_code_map(v_tenant, 'vendors',
        app.import_distinct_codes(p_rows, array['vendor_code','billing_vendor_code']));
    when 'vendor_contracts' then
      v_map_vendors := app.import_build_code_map(v_tenant, 'vendors',
        app.import_distinct_codes(p_rows, array['vendor_code']));
      v_map_products := app.import_build_code_map(v_tenant, 'products',
        app.import_distinct_codes(p_rows, array['product_code']));
      v_map_zones := app.import_build_code_map(v_tenant, 'zones',
        app.import_distinct_codes(p_rows, array['zone_code']));
      v_map_countries := app.import_build_code_map(v_tenant, 'countries',
        app.import_distinct_codes(p_rows, array['country_code']));
      v_map_destinations := app.import_build_code_map(v_tenant, 'destinations',
        app.import_distinct_codes(p_rows, array['origin_destination_code','destination_code']));
    when 'local_branches' then
      v_map_branches := app.import_build_code_map(v_tenant, 'branches',
        app.import_distinct_codes(p_rows, array['branch_code']));
      v_map_states := app.import_build_code_map(v_tenant, 'states',
        app.import_distinct_codes(p_rows, array['state_code','billing_state_code']));
    when 'consignees', 'shippers' then
      v_map_states := app.import_build_code_map(v_tenant, 'states',
        app.import_distinct_codes(p_rows, array['state_code']));
      v_map_countries := app.import_build_code_map(v_tenant, 'countries',
        app.import_distinct_codes(p_rows, array['country_code']));
      v_map_customers := app.import_build_code_map(v_tenant, 'customers',
        app.import_distinct_codes(p_rows, array['customer_code']));
    when 'fuel_surcharge_rates' then
      v_map_customers := app.import_build_code_map(v_tenant, 'customers',
        app.import_distinct_codes(p_rows, array['customer_code']));
      v_map_products := app.import_build_code_map(v_tenant, 'products',
        app.import_distinct_codes(p_rows, array['product_code']));
      v_map_zones := app.import_build_code_map(v_tenant, 'zones',
        app.import_distinct_codes(p_rows, array['zone_code']));
      v_map_vendors := app.import_build_code_map(v_tenant, 'vendors',
        app.import_distinct_codes(p_rows, array['vendor_code']));
      v_map_destinations := app.import_build_code_map(v_tenant, 'destinations',
        app.import_distinct_codes(p_rows, array['destination_code']));
    when 'tax_rates' then
      v_map_customers := app.import_build_code_map(v_tenant, 'customers',
        app.import_distinct_codes(p_rows, array['customer_code']));
      v_map_products := app.import_build_code_map(v_tenant, 'products',
        app.import_distinct_codes(p_rows, array['product_code']));
    else
      null;  -- countries / zones / flat catalogs / charges / service_centers have no FK references

  end case;

  -- ---- per-row processing --------------------------------------------------
  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_idx := v_idx + 1;
    v_total := v_total + 1;
    v_col := null; v_msg := null;
    v_country := null; v_state := null; v_zone := null; v_dest := null;
    v_branch := null; v_mbranch := null; v_manbranch := null;
    v_ptype := null; v_prod := null; v_exc := null; v_sc := null;
    v_customer := null; v_vendor := null; v_bvendor := null; v_origin := null; v_bstate := null;

    begin
      -- ============ per-master validate + FK resolve + insert =============
      case p_master

      -- ------------------------------- GEO -------------------------------
      when 'countries' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        insert into public.countries (tenant_id, code, name, weight_unit, currency, isd_code)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'),
                app.norm_enum(v_row->>'weight_unit', array['KGS','LBS'], 'Weight unit', null),
                nullif(btrim(coalesce(v_row->>'currency','')),''),
                nullif(btrim(coalesce(v_row->>'isd_code','')),''))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      when 'zones' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        insert into public.zones (tenant_id, code, name)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      when 'states' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        v_col := 'zone_code'; v_zone := app.import_lookup(v_map_zones, v_row->>'zone_code', 'Zone code'); v_col := null;
        insert into public.states (tenant_id, code, name, zone_id, gst_alias, is_union_territory)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'), v_zone,
                nullif(btrim(coalesce(v_row->>'gst_alias','')),''),
                app.norm_bool(v_row->>'is_union_territory', false))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      when 'destinations' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        v_col := 'country_code';         v_country   := app.import_lookup(v_map_countries, v_row->>'country_code', 'Country code');
        v_col := 'state_code';           v_state     := app.import_lookup(v_map_states, v_row->>'state_code', 'State code');
        v_col := 'zone_code';            v_zone      := app.import_lookup(v_map_zones, v_row->>'zone_code', 'Zone code');
        v_col := 'main_branch_code';     v_mbranch   := app.import_lookup(v_map_branches, v_row->>'main_branch_code', 'Main branch code');
        v_col := 'manifest_branch_code'; v_manbranch := app.import_lookup(v_map_branches, v_row->>'manifest_branch_code', 'Manifest branch code');
        v_col := null;
        insert into public.destinations
          (tenant_id, dest_type, code, name, country_id, state_id, service_type, zone_id,
           main_branch_id, manifest_branch_id, email, mobile, status)
        values (v_tenant,
                app.norm_enum(v_row->>'dest_type', array['DOMESTIC','INTERNATIONAL','LOCAL'], 'Destination type', 'DOMESTIC'),
                btrim(v_row->>'code'), btrim(v_row->>'name'), v_country, v_state,
                app.norm_enum(v_row->>'service_type', array['REGULAR','METRO','REMOTE'], 'Service type', null),
                v_zone, v_mbranch, v_manbranch,
                nullif(btrim(coalesce(v_row->>'email','')),''),
                nullif(btrim(coalesce(v_row->>'mobile','')),''),
                app.norm_enum(v_row->>'status', array['ACTIVE','INACTIVE'], 'Status', 'ACTIVE'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      when 'pincodes' then
        if coalesce(btrim(v_row->>'pin_code'),'') = '' then v_col:='pin_code'; raise exception using errcode='CMS01', message='Pin code is required'; end if;
        v_col := 'branch_code';      v_branch := app.import_lookup(v_map_branches, v_row->>'branch_code', 'Branch code');
        v_col := 'destination_code'; v_dest   := app.import_lookup(v_map_destinations, v_row->>'destination_code', 'Destination code');
        v_col := 'zone_code';        v_zone   := app.import_lookup(v_map_zones, v_row->>'zone_code', 'Zone code');
        v_col := 'state_code';       v_state  := app.import_lookup(v_map_states, v_row->>'state_code', 'State code');
        v_col := null;
        insert into public.pincodes
          (tenant_id, pin_code, pin_name, branch_id, destination_id, zone_id, state_id,
           is_oda, is_serviceable, pickup_available, distance_km)
        values (v_tenant, btrim(v_row->>'pin_code'),
                nullif(btrim(coalesce(v_row->>'pin_name','')),''),
                v_branch, v_dest, v_zone, v_state,
                app.norm_bool(v_row->>'is_oda', false),
                app.norm_bool(v_row->>'is_serviceable', true),
                app.norm_bool(v_row->>'pickup_available', false),
                app.norm_numeric(v_row->>'distance_km'))
        on conflict (tenant_id, pin_code) where deleted_at is null do nothing;

      when 'country_pincodes' then
        v_col := 'country_code';
        v_country := app.import_lookup(v_map_countries, v_row->>'country_code', 'Country code');
        if v_country is null then raise exception using errcode='CMS01', message='Country code is required'; end if;
        v_col := 'pin_code';
        if coalesce(btrim(v_row->>'pin_code'),'') = '' then raise exception using errcode='CMS01', message='Pin code is required'; end if;
        v_col := null;
        insert into public.country_pincodes (tenant_id, country_id, pin_code, city_name, state_name)
        values (v_tenant, v_country, btrim(v_row->>'pin_code'),
                btrim(coalesce(v_row->>'city_name','')),
                nullif(btrim(coalesce(v_row->>'state_name','')),''))
        on conflict (tenant_id, country_id, pin_code, city_name) where deleted_at is null do nothing;

      when 'areas' then
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        v_col := 'branch_code';
        v_branch := app.import_lookup(v_map_branches, v_row->>'branch_code', 'Branch code');
        if v_branch is null then raise exception using errcode='CMS01', message='Branch code is required'; end if;
        v_col := 'destination_code'; v_dest := app.import_lookup(v_map_destinations, v_row->>'destination_code', 'Destination code'); v_col := null;
        insert into public.areas (tenant_id, branch_id, name, destination_id)
        values (v_tenant, v_branch, upper(btrim(v_row->>'name')), v_dest)
        on conflict (tenant_id, branch_id, name) where deleted_at is null do nothing;

      -- --------------------------- CATALOG (0018) ------------------------
      when 'product_types' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        insert into public.product_types (tenant_id, code, name)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      when 'products' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        v_col := 'product_type_code';
        v_ptype := app.import_lookup(v_map_product_types, v_row->>'product_type_code', 'Product type code');
        v_col := null;
        insert into public.products
          (tenant_id, code, name, product_type_id, service, fuel_charge, gst_reverse,
           shipment_type, status, group_type)
        values (v_tenant, btrim(v_row->>'code'),
                nullif(btrim(coalesce(v_row->>'name','')),''),
                v_ptype,
                nullif(btrim(coalesce(v_row->>'service','')),''),
                app.norm_bool(v_row->>'fuel_charge', false),
                app.norm_bool(v_row->>'gst_reverse', false),
                app.norm_enum(v_row->>'shipment_type', array['DOX','NDOX'], 'Shipment type', 'DOX'),
                app.norm_enum(v_row->>'status', array['ACTIVE','INACTIVE'], 'Status', 'ACTIVE'),
                app.norm_enum(v_row->>'group_type', array['AIR','SURFACE','TRAIN','ALL'], 'Group type', null))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      when 'banks' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        insert into public.banks (tenant_id, code, name, status)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'),
                app.norm_enum(v_row->>'status', array['ACTIVE','INACTIVE'], 'Status', 'ACTIVE'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      when 'industries' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        insert into public.industries (tenant_id, code, name)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      when 'contents' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        insert into public.contents (tenant_id, code, name)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      when 'instructions' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        insert into public.instructions (tenant_id, code, name)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      when 'sales_executives' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        v_col := 'commission';
        insert into public.sales_executives (tenant_id, code, name, commission)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'),
                coalesce(app.norm_numeric(v_row->>'commission'), 0));
        v_col := null;

      when 'flights' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        insert into public.flights (tenant_id, code, name, flight_type)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'),
                app.norm_enum(v_row->>'flight_type', array['PRIME','GCR'], 'Flight type', 'PRIME'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      when 'delivery_exceptions' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        v_exc := case upper(replace(btrim(coalesce(v_row->>'exc_type','')), '-', ''))
                   when 'DELIVERED' then 'DELIVERED' else 'UNDELIVERED' end;
        insert into public.delivery_exceptions (tenant_id, code, name, exc_type, inscan, show_on_mobile)
        values (v_tenant, upper(btrim(v_row->>'code')), btrim(v_row->>'name'), v_exc,
                app.norm_bool(v_row->>'inscan', false),
                app.norm_bool(v_row->>'show_on_mobile', false))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      -- --------------------------- CATALOG (0019) ------------------------
      -- TODO(catalog-split): move to app.import_charges(v_tenant, v_row).
      when 'charges' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        insert into public.charges
          (tenant_id, code, name, base_on, charge_type, charge_rate,
           apply_fuel, apply_tax_on_fuel, apply_tax, hsn_code, sequence)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'),
                coalesce(nullif(btrim(coalesce(v_row->>'base_on','')),''), 'Actual Weight'),
                app.norm_enum(v_row->>'charge_type',
                  array['AIRWAYBILL','EXPENSE','INCOME','OBC','PURCHASE'], 'Charge type', 'AIRWAYBILL'),
                coalesce(app.norm_numeric(v_row->>'charge_rate'), 0),
                app.norm_bool(v_row->>'apply_fuel', false),
                app.norm_bool(v_row->>'apply_tax_on_fuel', false),
                app.norm_bool(v_row->>'apply_tax', false),
                nullif(btrim(coalesce(v_row->>'hsn_code','')),''),
                coalesce(app.norm_numeric(v_row->>'sequence'), 0)::int)
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      -- TODO(catalog-split): move to app.import_airlines(v_tenant, v_row, v_map_products).
      when 'airlines' then
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        v_col := 'product_code';
        v_prod := app.import_lookup(v_map_products, v_row->>'product_code', 'Product code');
        if v_prod is null then raise exception using errcode='CMS01', message='Product code is required'; end if;
        v_col := null;
        insert into public.airlines (tenant_id, name, product_id)
        values (v_tenant, upper(btrim(v_row->>'name')), v_prod)
        on conflict (tenant_id, name) where deleted_at is null do nothing;

      -- --------------------------- CATALOG (0020) ------------------------
      -- TODO(catalog-split): move to app.import_service_centers(v_tenant, v_row).
      -- Aggregate ROOT only — Terms (the child collection) are managed through
      -- public.save_service_center, not bulk import (like charge dependencies).
      when 'service_centers' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        insert into public.service_centers
          (tenant_id, code, name, sub_name, branch, destination, state, state_code,
           pin_code, telephone, email, gst_no)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'),
                nullif(btrim(coalesce(v_row->>'sub_name','')),''),
                nullif(btrim(coalesce(v_row->>'branch','')),''),
                nullif(btrim(coalesce(v_row->>'destination','')),''),
                nullif(btrim(coalesce(v_row->>'state','')),''),
                nullif(btrim(coalesce(v_row->>'state_code','')),''),
                nullif(btrim(coalesce(v_row->>'pin_code','')),''),
                nullif(btrim(coalesce(v_row->>'telephone','')),''),
                nullif(btrim(coalesce(v_row->>'email','')),''),
                nullif(btrim(coalesce(v_row->>'gst_no','')),''))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      -- TODO(catalog-split): move to app.import_field_executives(v_tenant, v_row, v_map_service_centers, v_map_destinations).
      when 'field_executives' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        v_col := 'service_center_code';
        v_sc := app.import_lookup(v_map_service_centers, v_row->>'service_center_code', 'Service center code');
        if v_sc is null then raise exception using errcode='CMS01', message='Service center code is required'; end if;
        v_col := 'destination_code';
        v_dest := app.import_lookup(v_map_destinations, v_row->>'destination_code', 'Destination code');
        v_col := null;
        insert into public.field_executives
          (tenant_id, code, name, mobile, pickup_charge, delivery_charge,
           service_center_id, destination_id, tld_batch_no, in_active)
        values (v_tenant, upper(btrim(v_row->>'code')), btrim(v_row->>'name'),
                nullif(btrim(coalesce(v_row->>'mobile','')),''),
                coalesce(app.norm_numeric(v_row->>'pickup_charge'), 0),
                coalesce(app.norm_numeric(v_row->>'delivery_charge'), 0),
                v_sc, v_dest,
                nullif(btrim(coalesce(v_row->>'tld_batch_no','')),''),
                app.norm_bool(v_row->>'in_active', false))
        on conflict (tenant_id, code) where deleted_at is null do nothing;
      -- --------------------------- PARTY (0022) ------------------------
      -- TODO(catalog-split): move to app.import_consignees(v_tenant, v_row, v_map_states, v_map_countries).
      when 'consignees' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        if coalesce(btrim(v_row->>'mobile'),'') = '' then v_col:='mobile'; raise exception using errcode='CMS01', message='Mobile is required'; end if;
        v_col := 'state_code'; v_state := app.import_lookup(v_map_states, v_row->>'state_code', 'State code');
        v_col := 'country_code'; v_country := app.import_lookup(v_map_countries, v_row->>'country_code', 'Country code');
        v_col := 'customer_code'; v_customer := app.import_lookup(v_map_customers, v_row->>'customer_code', 'Customer code');
        v_col := null;
        insert into public.consignees
          (tenant_id, code, name, customer_id, customer_name, mobile, email, address, pin_code, city,
           state_id, country_id, status)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'),
                v_customer,
                nullif(btrim(coalesce(v_row->>'customer_name', v_row->>'customer','')),''),
                btrim(v_row->>'mobile'),
                nullif(btrim(coalesce(v_row->>'email','')),''),
                nullif(btrim(coalesce(v_row->>'address','')),''),
                nullif(btrim(coalesce(v_row->>'pin_code', v_row->>'pincode','')),''),
                nullif(btrim(coalesce(v_row->>'city','')),''),
                v_state, v_country,
                app.norm_enum(v_row->>'status', array['ACTIVE','INACTIVE'], 'Status', 'ACTIVE'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      -- TODO(catalog-split): move to app.import_shippers(v_tenant, v_row, v_map_states, v_map_countries, v_map_customers).
      when 'shippers' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        if coalesce(btrim(v_row->>'mobile'),'') = '' then v_col:='mobile'; raise exception using errcode='CMS01', message='Mobile is required'; end if;
        v_col := 'state_code'; v_state := app.import_lookup(v_map_states, v_row->>'state_code', 'State code');
        v_col := 'country_code'; v_country := app.import_lookup(v_map_countries, v_row->>'country_code', 'Country code');
        v_col := 'customer_code'; v_customer := app.import_lookup(v_map_customers, v_row->>'customer_code', 'Customer code');
        v_col := null;
        insert into public.shippers
          (tenant_id, code, name, customer_id, customer_name, mobile, email, address, pin_code, city,
           state_id, country_id, status)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'),
                v_customer,
                nullif(btrim(coalesce(v_row->>'customer_name', v_row->>'customer','')),''),
                btrim(v_row->>'mobile'),
                nullif(btrim(coalesce(v_row->>'email','')),''),
                nullif(btrim(coalesce(v_row->>'address','')),''),
                nullif(btrim(coalesce(v_row->>'pin_code', v_row->>'pincode','')),''),
                nullif(btrim(coalesce(v_row->>'city','')),''),
                v_state, v_country,
                app.norm_enum(v_row->>'status', array['ACTIVE','INACTIVE'], 'Status', 'ACTIVE'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;
      -- ---------------------- CUSTOMER AGGREGATE (0023) --------------------
      -- TODO(catalog-split): move to app.import_customers(v_tenant, v_row, v_map_service_centers).
      when 'customers' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        if coalesce(btrim(v_row->>'mobile'),'') = '' then v_col:='mobile'; raise exception using errcode='CMS01', message='Mobile is required'; end if;
        v_col := 'service_center_code'; v_sc := app.import_lookup(v_map_service_centers, v_row->>'service_center_code', 'Service center code');
        v_col := null;
        insert into public.customers
          (tenant_id, code, name, branch, contact_person, phone, email, mobile, contract_head,
           service_center_id, status)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'),
                nullif(btrim(coalesce(v_row->>'branch','')),''),
                nullif(btrim(coalesce(v_row->>'contact_person', v_row->>'contact','')),''),
                nullif(btrim(coalesce(v_row->>'phone','')),''),
                nullif(btrim(coalesce(v_row->>'email','')),''),
                btrim(v_row->>'mobile'),
                nullif(btrim(coalesce(v_row->>'contract_head','')),''),
                v_sc,
                app.norm_enum(v_row->>'status', array['ACTIVE','INACTIVE'], 'Status', 'ACTIVE'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;
      -- ---------------------- VENDOR AGGREGATE (0025) --------------------
      -- TODO(catalog-split): move to app.import_vendors(v_tenant, v_row, v_map_states, v_map_destinations).
      when 'vendors' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        if coalesce(btrim(v_row->>'mobile'),'') = '' then v_col:='mobile'; raise exception using errcode='CMS01', message='Mobile is required'; end if;
        v_col := 'state_code'; v_state := app.import_lookup(v_map_states, v_row->>'state_code', 'State code');
        v_col := 'origin_destination_code';
        v_dest := app.import_lookup(v_map_destinations, coalesce(v_row->>'origin_destination_code', v_row->>'destination_code'), 'Origin destination code');
        v_col := null;
        insert into public.vendors
          (tenant_id, code, name, contact_person, address1, address2, pin_code, city, state_id,
           phone1, phone2, fax, mobile, email, website, gst_no, mode, vendor_class, fuel_head,
           currency, origin_destination_id, vendor_zip, is_global, gst_applies, vol_weight_round_off, status)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'),
                nullif(btrim(coalesce(v_row->>'contact_person', v_row->>'contact','')),''),
                nullif(btrim(coalesce(v_row->>'address1','')),''),
                nullif(btrim(coalesce(v_row->>'address2','')),''),
                nullif(btrim(coalesce(v_row->>'pin_code', v_row->>'pincode','')),''),
                nullif(btrim(coalesce(v_row->>'city','')),''),
                v_state,
                nullif(btrim(coalesce(v_row->>'phone1', v_row->>'phone','')),''),
                nullif(btrim(coalesce(v_row->>'phone2','')),''),
                nullif(btrim(coalesce(v_row->>'fax','')),''),
                btrim(v_row->>'mobile'),
                nullif(btrim(coalesce(v_row->>'email','')),''),
                nullif(btrim(coalesce(v_row->>'website','')),''),
                nullif(btrim(coalesce(v_row->>'gst_no','')),''),
                upper(replace(coalesce(nullif(btrim(v_row->>'mode'), ''), 'COURIER'), ' ', '_')),
                upper(replace(coalesce(nullif(btrim(v_row->>'vendor_class'), ''), 'VENDOR'), ' ', '_')),
                nullif(btrim(coalesce(v_row->>'fuel_head','')),''),
                coalesce(nullif(btrim(v_row->>'currency'), ''), 'INR'),
                v_dest,
                nullif(btrim(coalesce(v_row->>'vendor_zip','')),''),
                coalesce((v_row->>'is_global')::boolean, false),
                coalesce((v_row->>'gst_applies')::boolean, true),
                coalesce((v_row->>'vol_weight_round_off')::boolean, false),
                app.norm_enum(v_row->>'status', array['ACTIVE','INACTIVE'], 'Status', 'ACTIVE'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;
      -- ---------------------- SERVICE MAPPING (0027) ----------------------
      when 'service_mappings' then
        if coalesce(btrim(v_row->>'vendor_code'),'') = '' then v_col:='vendor_code'; raise exception using errcode='CMS01', message='Vendor code is required'; end if;
        if coalesce(btrim(v_row->>'service'),'') = '' then v_col:='service'; raise exception using errcode='CMS01', message='Service is required'; end if;
        v_col := 'vendor_code'; v_vendor := app.import_lookup(v_map_vendors, v_row->>'vendor_code', 'Vendor code');
        v_col := 'billing_vendor_code'; v_bvendor := app.import_lookup(v_map_vendors, v_row->>'billing_vendor_code', 'Billing vendor code');
        v_col := null;
        insert into public.service_mappings
          (tenant_id, vendor_id, service, service_type, billing_vendor_id,
           min_weight, max_weight, vendor_link, is_single_piece, status)
        values (v_tenant, v_vendor, btrim(v_row->>'service'),
                nullif(btrim(coalesce(v_row->>'service_type','')),''),
                v_bvendor,
                coalesce(nullif(btrim(v_row->>'min_weight'),'')::numeric, 0),
                coalesce(nullif(btrim(v_row->>'max_weight'),'')::numeric, 99999),
                nullif(btrim(coalesce(v_row->>'vendor_link','')),''),
                coalesce((v_row->>'is_single_piece')::boolean, false),
                app.norm_enum(v_row->>'status', array['ACTIVE','INACTIVE'], 'Status', 'ACTIVE'))
        on conflict (tenant_id, vendor_id, service) where deleted_at is null do nothing;
      -- ---------------------- VENDOR CONTRACT (0028) ----------------------
      -- Aggregate ROOT only — slabs are managed through public.save_vendor_contract.
      when 'vendor_contracts' then
        if coalesce(btrim(v_row->>'vendor_code'),'') = '' then v_col:='vendor_code'; raise exception using errcode='CMS01', message='Vendor code is required'; end if;
        if coalesce(btrim(v_row->>'product_code'),'') = '' then v_col:='product_code'; raise exception using errcode='CMS01', message='Product code is required'; end if;
        if coalesce(btrim(v_row->>'contract_no'),'') = '' then v_col:='contract_no'; raise exception using errcode='CMS01', message='Contract no is required'; end if;
        if coalesce(btrim(v_row->>'from_date'),'') = '' then v_col:='from_date'; raise exception using errcode='CMS01', message='From date is required'; end if;
        v_col := 'vendor_code'; v_vendor := app.import_lookup(v_map_vendors, v_row->>'vendor_code', 'Vendor code');
        v_col := 'product_code'; v_prod := app.import_lookup(v_map_products, v_row->>'product_code', 'Product code');
        v_col := 'zone_code'; v_zone := app.import_lookup(v_map_zones, v_row->>'zone_code', 'Zone code');
        v_col := 'country_code'; v_country := app.import_lookup(v_map_countries, v_row->>'country_code', 'Country code');
        v_col := 'origin_destination_code'; v_origin := app.import_lookup(v_map_destinations, v_row->>'origin_destination_code', 'Origin destination code');
        v_col := 'destination_code'; v_dest := app.import_lookup(v_map_destinations, v_row->>'destination_code', 'Destination code');
        v_col := null;
        insert into public.vendor_contracts
          (tenant_id, contract_no, from_date, vendor_id, origin_destination_id,
           zone_id, country_id, destination_id, product_id, service, unit, transit_days, status)
        values (v_tenant, btrim(v_row->>'contract_no'), (v_row->>'from_date')::date, v_vendor, v_origin,
                v_zone, v_country, v_dest, v_prod,
                nullif(btrim(coalesce(v_row->>'service','')),''),
                app.norm_enum(v_row->>'unit', array['KG','LB','CBM','PIECE'], 'Unit', 'KG'),
                nullif(btrim(v_row->>'transit_days'),'')::integer,
                app.norm_enum(v_row->>'status', array['ACTIVE','INACTIVE'], 'Status', 'ACTIVE'))
        on conflict (tenant_id, vendor_id, contract_no, from_date, product_id) where deleted_at is null do nothing;
      -- ---------------------- LOCAL BRANCH (0029) ----------------------
      when 'local_branches' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        v_col := 'branch_code'; v_branch := app.import_lookup(v_map_branches, v_row->>'branch_code', 'Branch code');
        v_col := 'state_code'; v_state := app.import_lookup(v_map_states, v_row->>'state_code', 'State code');
        v_col := 'billing_state_code'; v_bstate := app.import_lookup(v_map_states, v_row->>'billing_state_code', 'Billing state code');
        v_col := null;
        insert into public.local_branches
          (tenant_id, code, name, branch_id, address1, address2, city, pin_code,
           state_id, billing_state_id, gst_no, phone, email, status)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'), v_branch,
                nullif(btrim(coalesce(v_row->>'address1','')),''),
                nullif(btrim(coalesce(v_row->>'address2','')),''),
                nullif(btrim(coalesce(v_row->>'city','')),''),
                nullif(btrim(coalesce(v_row->>'pin_code', v_row->>'pincode','')),''),
                v_state, v_bstate,
                nullif(btrim(coalesce(v_row->>'gst_no','')),''),
                nullif(btrim(coalesce(v_row->>'phone', v_row->>'telephone','')),''),
                nullif(btrim(coalesce(v_row->>'email','')),''),
                app.norm_enum(v_row->>'status', array['ACTIVE','INACTIVE'], 'Status', 'ACTIVE'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      -- --------------------------- UTILITY TAX/FUEL (0052) ---------------
      when 'fuel_surcharge_rates' then
        perform app.import_fuel_surcharge_rate_row(
          v_tenant, v_row, v_map_customers, v_map_products, v_map_zones,
          v_map_vendors, v_map_destinations);

      when 'tax_rates' then
        perform app.import_tax_rate_row(
          v_tenant, v_row, v_map_customers, v_map_products);
      end case;

      get diagnostics v_rc = row_count;

      -- VALIDATE: discard the write by raising an intentional rollback signal.
      if v_mode = 'VALIDATE' then
        raise exception using errcode = 'CMS00', message = 'dry-run';
      end if;

      -- COMMIT success: inserted (1) or duplicate-skipped (0).
      if v_rc = 1 then v_ok := v_ok + 1; else v_skipped := v_skipped + 1; end if;

    exception
      when sqlstate 'CMS00' then
        if v_rc = 1 then v_ok := v_ok + 1; else v_skipped := v_skipped + 1; end if;

      when sqlstate 'CMS01' then
        v_msg := SQLERRM;
        v_errcnt := v_errcnt + 1;
        v_errors := v_errors || jsonb_build_object('row_no', v_idx, 'column', v_col, 'message', v_msg);
        if v_mode = 'COMMIT' then
          insert into public.import_row_errors (tenant_id, job_id, row_no, column_name, message, raw)
          values (v_tenant, v_job, v_idx, v_col, v_msg, v_row);
        end if;

      when unique_violation or check_violation or foreign_key_violation
         or not_null_violation or invalid_text_representation then
        v_msg := SQLERRM;
        v_errcnt := v_errcnt + 1;
        v_errors := v_errors || jsonb_build_object('row_no', v_idx, 'column', v_col, 'message', v_msg);
        if v_mode = 'COMMIT' then
          insert into public.import_row_errors (tenant_id, job_id, row_no, column_name, message, raw)
          values (v_tenant, v_job, v_idx, v_col, v_msg, v_row);
        end if;
    end;
  end loop;

  -- ---- finalize ------------------------------------------------------------
  if v_mode = 'COMMIT' then
    update public.import_jobs
       set status = 'DONE', ok_rows = v_ok, skipped_rows = v_skipped, error_rows = v_errcnt
     where id = v_job;
    perform set_config('app.suppress_row_audit', 'off', true);
    perform app.write_audit_log(
      v_tenant, 'import_jobs', 'ADD', v_job, v_slug, null,
      jsonb_build_object('master', p_master, 'mode', 'COMMIT',
                         'total', v_total, 'ok', v_ok, 'skipped', v_skipped, 'errors', v_errcnt));
  end if;

  return jsonb_build_object(
    'master', p_master,
    'mode', v_mode,
    'job_id', v_job,
    'total', v_total,
    'ok', v_ok,
    'skipped', v_skipped,
    'error_count', v_errcnt,
    'errors', v_errors
  );
end
$$;


comment on function public.import_master(text, text, jsonb) is
  'Reusable VALIDATE/COMMIT CSV import. Masters include fuel_surcharge_rates and tax_rates (0052).';
