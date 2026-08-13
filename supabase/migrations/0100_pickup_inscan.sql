-- ===========================================================================
-- 0100  pickup inscan — Phase 1 Persistence, Schema, Masters & Inscan RPC
-- ---------------------------------------------------------------------------
-- Physical custody reception event:
--   * public.pickup_inscan_events           — append-only inscan event records
--   * public.inscan_remarks                 — standardized inscan remarks master
--   * lookup key 'inscan-remark'            — master lookup integration
--   * public.record_pickup_inscan()         — atomic inscan RPC with duplicate guard,
--                                             pickup status CONFIRMED hand-off,
--                                             shipment PICKUP_INSCANNED status, and
--                                             append-only scan audit logging
--   * public.get_inscan_reconciliation()    — promised vs received gap reporting
--
-- Permission slugs: txn.pickup-inscan / txn.pickup-insacn (0010)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. State Machine Transitions
-- ---------------------------------------------------------------------------
insert into app.status_transitions (entity_kind, from_status, to_status) values
  ('SHIPMENT', 'BOOKED', 'PICKUP_INSCANNED'),
  ('SHIPMENT', 'DRAFT', 'PICKUP_INSCANNED'),
  ('PICKUP', 'OPEN', 'CONFIRMED'),
  ('PICKUP', 'ASSIGNED', 'CONFIRMED'),
  ('PICKUP', 'PICKED', 'CONFIRMED')
on conflict do nothing;

-- Ensure permission modules are registered
insert into public.permission_modules (slug, section, name, under_menu, sort_order) values
  ('txn.pickup-inscan', 'TRANSACTION', 'Pickup Inscan', 'Entry', 33),
  ('mst.inscan-remarks', 'MASTERS', 'Inscan Remarks Master', 'Masters', 32)
on conflict (slug) do update set
  name = excluded.name,
  section = excluded.section,
  under_menu = excluded.under_menu;

-- ---------------------------------------------------------------------------
-- 2. Inscan Remarks Master
-- ---------------------------------------------------------------------------
create table if not exists public.inscan_remarks (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  code          text not null,
  name          text not null,
  category      text not null default 'GENERAL'
                  check (category in ('GENERAL', 'HOLD', 'DAMAGE', 'MISROUTE')),
  status        text not null default 'ACTIVE'
                  check (status in ('ACTIVE', 'INACTIVE')),
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  deleted_at    timestamptz,
  row_version   integer not null default 1,
  constraint inscan_remarks_tenant_code_uq unique (tenant_id, code)
);

create index if not exists inscan_remarks_tenant_idx
  on public.inscan_remarks (tenant_id);
create index if not exists inscan_remarks_status_idx
  on public.inscan_remarks (tenant_id, status) where deleted_at is null;

select app.attach_master_triggers('inscan_remarks', 'mst.inscan-remarks');
select app.attach_transaction_policies('inscan_remarks', 'mst.inscan-remarks');

-- Seed standard inscan remark codes across all existing tenants
insert into public.inscan_remarks (tenant_id, code, name, category, status)
select t.id, r.code, r.name, r.category, 'ACTIVE'
from public.tenants t
cross join (
  values
    ('OK', 'Normal Inscan / No Exception', 'GENERAL'),
    ('DAMAGED', 'Damaged Parcel / Packaging', 'DAMAGE'),
    ('SHORTAGE', 'Shortage / Content Discrepancy', 'DAMAGE'),
    ('MISROUTE', 'Misrouted Shipment Received', 'MISROUTE'),
    ('HELD_CUSTOMER_REQUEST', 'Held on Customer Request', 'HOLD'),
    ('KYC_PENDING', 'KYC / Documentation Pending', 'HOLD'),
    ('WEIGHT_DISCREPANCY', 'Weight Discrepancy Found', 'HOLD'),
    ('UNSERVICEABLE_PIN', 'Destination Pincode Unserviceable', 'HOLD')
) as r(code, name, category)
on conflict (tenant_id, code) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Pickup Inscan Events Table
-- ---------------------------------------------------------------------------
create table if not exists public.pickup_inscan_events (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  service_center_id     uuid references public.branches(id) on delete set null,
  service_center_code   text not null,
  scan_date             date not null default (current_date),
  scan_time             text not null,
  pickup_id             uuid references public.pickups(id) on delete set null,
  pickup_no             text,
  awb_no                text not null,
  shipment_id           uuid references public.shipments(id) on delete set null,
  field_executive_id    uuid references public.field_executives(id) on delete set null,
  field_executive_code  text,
  vendor_id             uuid references public.vendors(id) on delete set null,
  vendor_code           text,
  product_id            uuid references public.products(id) on delete set null,
  product_code          text,
  payment_type          text,
  consignee_name        text,
  is_held               boolean not null default false,
  hold_reason_code      text,
  remark_code           text,
  hub_scan              boolean not null default true,
  created_at            timestamptz not null default now(),
  created_by            uuid,
  updated_at            timestamptz not null default now(),
  updated_by            uuid,
  deleted_at            timestamptz,
  row_version           integer not null default 1,
  constraint pickup_inscan_events_tenant_id_uq unique (tenant_id, id)
);

-- Unique index blocking duplicate scan of same AWB at same hub on same date
create unique index if not exists pickup_inscan_events_dup_uq
  on public.pickup_inscan_events (tenant_id, service_center_code, awb_no, scan_date)
  where deleted_at is null;

create index if not exists pickup_inscan_events_tenant_date_idx
  on public.pickup_inscan_events (tenant_id, scan_date desc);
create index if not exists pickup_inscan_events_awb_idx
  on public.pickup_inscan_events (tenant_id, awb_no);
create index if not exists pickup_inscan_events_pickup_idx
  on public.pickup_inscan_events (tenant_id, pickup_no);
create index if not exists pickup_inscan_events_fe_idx
  on public.pickup_inscan_events (tenant_id, field_executive_id);

select app.attach_append_only_guard('pickup_inscan_events');
select app.attach_event_policies('pickup_inscan_events', 'txn.pickup-inscan');

-- ---------------------------------------------------------------------------
-- 4. Update lookup() RPC for 'inscan-remark' and 'vendor'
-- ---------------------------------------------------------------------------
create or replace function public.lookup(
  p_key   text,
  p_q     text default null,
  p_limit integer default 50
)
returns table (id uuid, code text, name text, hint text)
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_pat text := '%' ||
    replace(replace(coalesce(btrim(p_q), ''), '%', '\%'), '_', '\_') || '%';
begin
  if app.current_user_id() is null then
    return;
  end if;

  if p_key = 'country' then
    return query
      select c.id, c.code, c.name, c.currency
      from public.countries c
      where c.tenant_id in (select app.user_tenant_ids())
        and c.deleted_at is null
        and (c.name ilike v_pat or c.code ilike v_pat)
      order by c.name, c.code, c.id
      limit v_limit;

  elsif p_key = 'zone' then
    return query
      select z.id, z.code, z.name, null::text
      from public.zones z
      where z.tenant_id in (select app.user_tenant_ids())
        and z.deleted_at is null
        and (z.name ilike v_pat or z.code ilike v_pat)
      order by z.name, z.code, z.id
      limit v_limit;

  elsif p_key = 'state' then
    return query
      select s.id, s.code, s.name, s.gst_alias
      from public.states s
      where s.tenant_id in (select app.user_tenant_ids())
        and s.deleted_at is null
        and (s.name ilike v_pat or s.code ilike v_pat)
      order by s.name, s.code, s.id
      limit v_limit;

  elsif p_key = 'destination' then
    return query
      select d.id, d.code, d.name, d.dest_type
      from public.destinations d
      where d.tenant_id in (select app.user_tenant_ids())
        and d.deleted_at is null
        and d.status = 'ACTIVE'
        and (d.name ilike v_pat or d.code ilike v_pat)
      order by d.name, d.code, d.id
      limit v_limit;

  elsif p_key = 'pin-code' then
    return query
      select p.id,
             p.pin_code,
             coalesce(p.pin_name, p.pin_code),
             nullif(concat_ws(' · ',
               case when p.is_oda then 'ODA' end,
               case when not p.is_serviceable then 'Non-serviceable' end), '')
      from public.pincodes p
      where p.tenant_id in (select app.user_tenant_ids())
        and p.deleted_at is null
        and (p.pin_code ilike v_pat or p.pin_name ilike v_pat)
      order by p.pin_code, p.id
      limit v_limit;

  elsif p_key = 'country-pincode' then
    return query
      select cp.id,
             cp.pin_code,
             coalesce(nullif(cp.city_name, ''), cp.pin_code),
             cp.state_name
      from public.country_pincodes cp
      where cp.tenant_id in (select app.user_tenant_ids())
        and cp.deleted_at is null
        and (cp.pin_code ilike v_pat or cp.city_name ilike v_pat)
      order by cp.pin_code, cp.id
      limit v_limit;

  elsif p_key = 'branch' or p_key = 'service-center' then
    return query
      select b.id, b.code, b.name, b.city
      from public.branches b
      where b.tenant_id in (select app.user_tenant_ids())
        and b.deleted_at is null
        and b.status = 'ACTIVE'
        and (b.name ilike v_pat or b.code ilike v_pat or b.city ilike v_pat)
      order by b.name, b.code, b.id
      limit v_limit;

  elsif p_key = 'customer' then
    return query
      select c.id, c.code, c.name, c.city
      from public.customers c
      where c.tenant_id in (select app.user_tenant_ids())
        and c.deleted_at is null
        and c.status = 'ACTIVE'
        and (c.name ilike v_pat or c.code ilike v_pat or c.city ilike v_pat)
      order by c.name, c.code, c.id
      limit v_limit;

  elsif p_key = 'shipper' then
    return query
      select s.id, s.code, s.name, s.city
      from public.shippers s
      where s.tenant_id in (select app.user_tenant_ids())
        and s.deleted_at is null
        and s.status = 'ACTIVE'
        and (s.name ilike v_pat or s.code ilike v_pat or s.city ilike v_pat)
      order by s.name, s.code, s.id
      limit v_limit;

  elsif p_key = 'field-executive' or p_key = 'fieldExecutive' then
    return query
      select fe.id, fe.code, fe.name, fe.phone
      from public.field_executives fe
      where fe.tenant_id in (select app.user_tenant_ids())
        and fe.deleted_at is null
        and fe.status = 'ACTIVE'
        and (fe.name ilike v_pat or fe.code ilike v_pat)
      order by fe.name, fe.code, fe.id
      limit v_limit;

  elsif p_key = 'sales-executive' or p_key = 'salesExecutive' then
    return query
      select se.id, se.code, se.name, se.phone
      from public.sales_executives se
      where se.tenant_id in (select app.user_tenant_ids())
        and se.deleted_at is null
        and se.status = 'ACTIVE'
        and (se.name ilike v_pat or se.code ilike v_pat)
      order by se.name, se.code, se.id
      limit v_limit;

  elsif p_key = 'vendor' then
    return query
      select v.id, v.code, v.name, v.mode
      from public.vendors v
      where v.tenant_id in (select app.user_tenant_ids())
        and v.deleted_at is null
        and v.status = 'ACTIVE'
        and (v.name ilike v_pat or v.code ilike v_pat)
      order by v.name, v.code, v.id
      limit v_limit;

  elsif p_key = 'product' then
    return query
      select pr.id, pr.code, pr.name, pr.product_type
      from public.products pr
      where pr.tenant_id in (select app.user_tenant_ids())
        and pr.deleted_at is null
        and pr.status = 'ACTIVE'
        and (pr.name ilike v_pat or pr.code ilike v_pat)
      order by pr.name, pr.code, pr.id
      limit v_limit;

  elsif p_key = 'area' then
    return query
      select a.id, a.code, a.name, null::text
      from public.areas a
      where a.tenant_id in (select app.user_tenant_ids())
        and a.deleted_at is null
        and (a.name ilike v_pat or a.code ilike v_pat)
      order by a.name, a.code, a.id
      limit v_limit;

  elsif p_key = 'inscan-remark' or p_key = 'inscanRemark' then
    return query
      select ir.id, ir.code, ir.name, ir.category
      from public.inscan_remarks ir
      where ir.tenant_id in (select app.user_tenant_ids())
        and ir.deleted_at is null
        and ir.status = 'ACTIVE'
        and (ir.code ilike v_pat or ir.name ilike v_pat)
      order by ir.code, ir.id
      limit v_limit;

  end if;
end;
$$;

revoke all on function public.lookup(text, text, integer) from public;
grant execute on function public.lookup(text, text, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. record_pickup_inscan() RPC
-- ---------------------------------------------------------------------------
create or replace function public.record_pickup_inscan(
  p_scan_date             date,
  p_scan_time             text,
  p_service_center_code   text,
  p_awb_no                text,
  p_pickup_no             text default null,
  p_field_executive_id    uuid default null,
  p_field_executive_code  text default null,
  p_vendor_id             uuid default null,
  p_vendor_code           text default null,
  p_product_id            uuid default null,
  p_product_code          text default null,
  p_payment_type          text default null,
  p_consignee_name        text default null,
  p_is_held               boolean default false,
  p_hold_reason_code      text default null,
  p_remark_code           text default null,
  p_hub_scan              boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant       uuid := app.current_tenant_id();
  v_user         uuid := auth.uid();
  v_clean_awb    text := btrim(coalesce(p_awb_no, ''));
  v_clean_sc     text := btrim(coalesce(p_service_center_code, ''));
  v_clean_pno    text := btrim(coalesce(p_pickup_no, ''));
  v_clean_remark text := btrim(coalesce(p_remark_code, p_hold_reason_code, ''));
  v_sc_id        uuid;
  v_pickup       public.pickups%rowtype;
  v_pickup_id    uuid;
  v_shipment     public.shipments%rowtype;
  v_shipment_id  uuid;
  v_is_held      boolean := coalesce(p_is_held, false);
  v_inserted     public.pickup_inscan_events%rowtype;
begin
  -- 1. Validation & Guards
  if v_clean_awb = '' then
    raise exception 'AWB No. is required';
  end if;
  if v_clean_sc = '' then
    raise exception 'Service Center is required';
  end if;
  if p_scan_date is null then
    raise exception 'Scan Date is required';
  end if;
  if btrim(coalesce(p_scan_time, '')) = '' then
    raise exception 'Scan Time is required';
  end if;

  -- Resolve branch ID for service center code
  select b.id into v_sc_id
  from public.branches b
  where b.tenant_id = v_tenant
    and b.deleted_at is null
    and upper(b.code) = upper(v_clean_sc)
  limit 1;

  -- 2. Duplicate Inscan Prevention (Same AWB + Same Hub + Same Date)
  if exists (
    select 1
    from public.pickup_inscan_events pie
    where pie.tenant_id = v_tenant
      and pie.deleted_at is null
      and upper(pie.service_center_code) = upper(v_clean_sc)
      and upper(pie.awb_no) = upper(v_clean_awb)
      and pie.scan_date = p_scan_date
  ) then
    raise exception 'AWB % is already inscanned at service center % on %',
      v_clean_awb, v_clean_sc, p_scan_date;
  end if;

  -- 3. Hold Gate Enforcement (Remark required if Held)
  if v_is_held and v_clean_remark = '' then
    raise exception 'A standardized remark code is required when shipment is placed on hold';
  end if;

  -- 4. Pickup Verification & Handoff to CONFIRMED
  if v_clean_pno <> '' then
    select p.* into v_pickup
    from public.pickups p
    where p.tenant_id = v_tenant
      and p.deleted_at is null
      and (
        p.pickup_no::text = v_clean_pno or
        p.awb_no = v_clean_awb
      )
    limit 1;

    if v_pickup.id is not null then
      if v_pickup.status = 'CANCELLED' then
        raise exception 'Pickup #% is cancelled and cannot be inscanned', v_clean_pno;
      end if;

      v_pickup_id := v_pickup.id;

      -- Transition pickup status to CONFIRMED upon successful physical inscan
      update public.pickups
      set status = 'CONFIRMED',
          awb_no = coalesce(nullif(v_pickup.awb_no, ''), v_clean_awb),
          confirmed_at = now(),
          confirmed_by = v_user,
          updated_at = now(),
          updated_by = v_user,
          row_version = v_pickup.row_version + 1
      where id = v_pickup.id;
    end if;
  end if;

  -- 5. Shipment Status Transition (BOOKED/DRAFT -> PICKUP_INSCANNED)
  select s.* into v_shipment
  from public.shipments s
  where s.tenant_id = v_tenant
    and s.deleted_at is null
    and s.awb_no = v_clean_awb
  limit 1;

  if v_shipment.id is not null then
    v_shipment_id := v_shipment.id;

    if v_shipment.current_status in ('BOOKED', 'DRAFT') then
      update public.shipments
      set current_status = 'PICKUP_INSCANNED',
          is_held = v_is_held,
          hold_reason = case when v_is_held then v_clean_remark else null end,
          vendor_id = coalesce(p_vendor_id, v_shipment.vendor_id),
          updated_at = now(),
          updated_by = v_user,
          row_version = v_shipment.row_version + 1
      where id = v_shipment.id;
    end if;

    -- Append-only tracking event
    insert into public.shipment_scan_events (
      tenant_id,
      shipment_id,
      awb_no,
      event_type,
      event_text,
      payload,
      created_by,
      updated_by
    ) values (
      v_tenant,
      v_shipment_id,
      v_clean_awb,
      'PICKUP_INSCAN',
      format('Pickup Inscan recorded at %s (%s)', v_clean_sc, case when v_is_held then 'HELD: ' || v_clean_remark else 'OK' end),
      jsonb_build_object(
        'service_center', v_clean_sc,
        'scan_date', p_scan_date,
        'scan_time', p_scan_time,
        'pickup_no', v_clean_pno,
        'field_executive', p_field_executive_code,
        'vendor', p_vendor_code,
        'is_held', v_is_held,
        'remark', v_clean_remark
      ),
      v_user,
      v_user
    );
  end if;

  -- 6. Insert into public.pickup_inscan_events
  insert into public.pickup_inscan_events (
    tenant_id,
    service_center_id,
    service_center_code,
    scan_date,
    scan_time,
    pickup_id,
    pickup_no,
    awb_no,
    shipment_id,
    field_executive_id,
    field_executive_code,
    vendor_id,
    vendor_code,
    product_id,
    product_code,
    payment_type,
    consignee_name,
    is_held,
    hold_reason_code,
    remark_code,
    hub_scan,
    created_by,
    updated_by
  ) values (
    v_tenant,
    v_sc_id,
    v_clean_sc,
    p_scan_date,
    p_scan_time,
    v_pickup_id,
    nullif(v_clean_pno, ''),
    v_clean_awb,
    v_shipment_id,
    p_field_executive_id,
    p_field_executive_code,
    p_vendor_id,
    p_vendor_code,
    p_product_id,
    p_product_code,
    p_payment_type,
    p_consignee_name,
    v_is_held,
    case when v_is_held then coalesce(p_hold_reason_code, v_clean_remark) else null end,
    nullif(v_clean_remark, ''),
    coalesce(p_hub_scan, true),
    v_user,
    v_user
  )
  returning * into v_inserted;

  return jsonb_build_object(
    'id', v_inserted.id,
    'awb_no', v_inserted.awb_no,
    'pickup_no', v_inserted.pickup_no,
    'service_center_code', v_inserted.service_center_code,
    'scan_date', v_inserted.scan_date,
    'scan_time', v_inserted.scan_time,
    'is_held', v_inserted.is_held,
    'remark_code', v_inserted.remark_code,
    'pickup_confirmed', (v_pickup_id is not null),
    'created_at', v_inserted.created_at
  );
end;
$$;

revoke all on function public.record_pickup_inscan from public;
grant execute on function public.record_pickup_inscan to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. get_inscan_reconciliation() RPC
-- ---------------------------------------------------------------------------
create or replace function public.get_inscan_reconciliation(
  p_from_date date default current_date,
  p_to_date   date default current_date,
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_result jsonb;
begin
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'total_pickups_promised', count(distinct p.id),
      'total_pickups_confirmed', count(distinct case when p.status = 'CONFIRMED' then p.id end),
      'total_pickups_pending', count(distinct case when p.status in ('OPEN', 'ASSIGNED', 'PICKED') then p.id end),
      'total_inscans_recorded', count(distinct pie.id),
      'total_inscans_held', count(distinct case when pie.is_held then pie.id end)
    ),
    'pending_pickups', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'pickup_no', p.pickup_no,
            'pickup_date', p.pickup_date,
            'status', p.status,
            'customer_name', c.name,
            'shipper_name', p.shipper_name,
            'field_executive', fe.name,
            'mobile_no', p.mobile_no,
            'area', a.name
          )
          order by p.pickup_no desc
        )
        from public.pickups p
        left join public.customers c on c.id = p.customer_id
        left join public.field_executives fe on fe.id = p.field_executive_id
        left join public.areas a on a.id = p.area_id
        where p.tenant_id = v_tenant
          and p.deleted_at is null
          and p.pickup_date between p_from_date and p_to_date
          and p.status in ('OPEN', 'ASSIGNED', 'PICKED')
          and (p_branch_id is null or p.branch_id = p_branch_id)
      ),
      '[]'::jsonb
    )
  ) into v_result
  from public.pickups p
  left join public.pickup_inscan_events pie
    on pie.tenant_id = p.tenant_id
   and (pie.pickup_id = p.id or pie.pickup_no = p.pickup_no::text)
   and pie.deleted_at is null
  where p.tenant_id = v_tenant
    and p.deleted_at is null
    and p.pickup_date between p_from_date and p_to_date
    and (p_branch_id is null or p.branch_id = p_branch_id);

  return v_result;
end;
$$;

revoke all on function public.get_inscan_reconciliation from public;
grant execute on function public.get_inscan_reconciliation to authenticated, service_role;
