-- ===========================================================================
-- 0109  un-delivery scan — failed-delivery return receipt at hub
-- ---------------------------------------------------------------------------
-- When a DRS shipment could not be delivered, the field executive brings it
-- back to the hub. The operator scans the AWB at the hub to confirm physical
-- receipt, recording "Shipment Undelivered Received".
--
-- Reuses: public.pickup_inscan_events (extended with event_type column)
--         app.assert_status_transition (already seeded in 0030)
--         public.shipment_scan_events  (append-only audit)
--
-- State machine path:
--   OUT_FOR_DELIVERY → UNDELIVERED → UNDELIVERED_RECEIVED
--   (both transitions already seeded in 0030_transaction_core.sql lines 52-53)
--
-- New RPC: public.record_undelivery_scan()
-- Permission slug: txn.un-delivery-scan (already seeded in 0010)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Add event_type column to pickup_inscan_events (idempotent)
--    Allows the shared table to distinguish PICKUP_INSCAN vs UNDELIVERY_SCAN.
-- ---------------------------------------------------------------------------
alter table public.pickup_inscan_events
  add column if not exists event_type text not null
    default 'PICKUP_INSCAN'
    check (event_type in ('PICKUP_INSCAN', 'UNDELIVERY_SCAN'));

-- ---------------------------------------------------------------------------
-- 2. Drop the existing dup-guard unique index and recreate it scoped per type
--    so that a pickup-inscan and undelivery-scan of the same AWB on the same
--    day at the same hub cannot each duplicate, but the two types don't block
--    each other (a shipment could theoretically be re-dispatched and returned).
-- ---------------------------------------------------------------------------
drop index if exists public.pickup_inscan_events_dup_uq;

create unique index if not exists pickup_inscan_events_pickup_dup_uq
  on public.pickup_inscan_events (tenant_id, service_center_code, awb_no, scan_date)
  where deleted_at is null and event_type = 'PICKUP_INSCAN';

create unique index if not exists pickup_inscan_events_undelivery_dup_uq
  on public.pickup_inscan_events (tenant_id, service_center_code, awb_no, scan_date)
  where deleted_at is null and event_type = 'UNDELIVERY_SCAN';

-- ---------------------------------------------------------------------------
-- 3. record_undelivery_scan() RPC
-- ---------------------------------------------------------------------------
create or replace function public.record_undelivery_scan(
  p_scan_date             date,
  p_scan_time             text,
  p_service_center_code   text,
  p_awb_no                text,
  p_pickup_no             text    default null,
  p_vendor_id             uuid    default null,
  p_vendor_code           text    default null,
  p_remark_code           text    default null,
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
  v_clean_awb    text := upper(btrim(coalesce(p_awb_no, '')));
  v_clean_sc     text := upper(btrim(coalesce(p_service_center_code, '')));
  v_clean_pno    text := btrim(coalesce(p_pickup_no, ''));
  v_clean_remark text := btrim(coalesce(p_remark_code, ''));
  v_sc_id        uuid;
  v_shipment     public.shipments%rowtype;
  v_inserted     public.pickup_inscan_events%rowtype;
begin
  -- ── 1. Input validation ──────────────────────────────────────────────────
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

  -- ── 2. Resolve branch ID ──────────────────────────────────────────────────
  select b.id into v_sc_id
  from public.branches b
  where b.tenant_id = v_tenant
    and b.deleted_at is null
    and upper(b.code) = v_clean_sc
  limit 1;

  -- ── 3. Duplicate guard (same AWB + hub + date, event_type = UNDELIVERY_SCAN)
  if exists (
    select 1
    from public.pickup_inscan_events pie
    where pie.tenant_id    = v_tenant
      and pie.deleted_at   is null
      and pie.event_type   = 'UNDELIVERY_SCAN'
      and upper(pie.service_center_code) = v_clean_sc
      and upper(pie.awb_no)              = v_clean_awb
      and pie.scan_date    = p_scan_date
  ) then
    raise exception 'AWB % is already un-delivery-scanned at service center % on %',
      v_clean_awb, v_clean_sc, p_scan_date;
  end if;

  -- ── 4. Fetch shipment & eligibility gate ──────────────────────────────────
  select s.* into v_shipment
  from public.shipments s
  where s.tenant_id  = v_tenant
    and s.deleted_at is null
    and s.awb_no     = v_clean_awb
  limit 1;

  if v_shipment.id is null then
    raise exception 'AWB % not found in system', v_clean_awb;
  end if;

  if v_shipment.current_status <> 'OUT_FOR_DELIVERY' then
    raise exception 'AWB % is in status % — only OUT_FOR_DELIVERY shipments can be un-delivery-scanned',
      v_clean_awb, v_shipment.current_status;
  end if;

  -- ── 5. State machine: OUT_FOR_DELIVERY → UNDELIVERED → UNDELIVERED_RECEIVED
  --    Both edges are seeded in 0030_transaction_core.sql (lines 52-53).
  perform app.assert_status_transition('SHIPMENT', 'OUT_FOR_DELIVERY', 'UNDELIVERED');
  perform app.assert_status_transition('SHIPMENT', 'UNDELIVERED', 'UNDELIVERED_RECEIVED');

  update public.shipments
  set current_status = 'UNDELIVERED_RECEIVED',
      updated_at     = now(),
      updated_by     = v_user,
      row_version    = v_shipment.row_version + 1
  where id = v_shipment.id;

  -- ── 6. Append-only audit event ────────────────────────────────────────────
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
    v_shipment.id,
    v_clean_awb,
    'UNDELIVERY_SCAN',
    format('Shipment Undelivered Received at %s', v_clean_sc),
    jsonb_build_object(
      'service_center',  v_clean_sc,
      'scan_date',       p_scan_date,
      'scan_time',       p_scan_time,
      'pickup_no',       v_clean_pno,
      'vendor',          p_vendor_code,
      'remark',          v_clean_remark,
      'from_status',     'OUT_FOR_DELIVERY',
      'to_status',       'UNDELIVERED_RECEIVED'
    ),
    v_user,
    v_user
  );

  -- ── 7. Insert scan event row ──────────────────────────────────────────────
  insert into public.pickup_inscan_events (
    tenant_id,
    service_center_id,
    service_center_code,
    scan_date,
    scan_time,
    pickup_no,
    awb_no,
    shipment_id,
    vendor_id,
    vendor_code,
    remark_code,
    hub_scan,
    event_type,
    created_by,
    updated_by
  ) values (
    v_tenant,
    v_sc_id,
    v_clean_sc,
    p_scan_date,
    p_scan_time,
    nullif(v_clean_pno, ''),
    v_clean_awb,
    v_shipment.id,
    p_vendor_id,
    p_vendor_code,
    nullif(v_clean_remark, ''),
    coalesce(p_hub_scan, true),
    'UNDELIVERY_SCAN',
    v_user,
    v_user
  )
  returning * into v_inserted;

  return jsonb_build_object(
    'id',                   v_inserted.id,
    'awb_no',               v_inserted.awb_no,
    'service_center_code',  v_inserted.service_center_code,
    'scan_date',            v_inserted.scan_date,
    'scan_time',            v_inserted.scan_time,
    'remark_code',          v_inserted.remark_code,
    'created_at',           v_inserted.created_at
  );
end;
$$;

revoke all on function public.record_undelivery_scan from public;
grant execute on function public.record_undelivery_scan to authenticated, service_role;

comment on function public.record_undelivery_scan is
  'Atomic un-delivery scan: validates OUT_FOR_DELIVERY eligibility, transitions shipment '
  'OUT_FOR_DELIVERY→UNDELIVERED→UNDELIVERED_RECEIVED, writes append-only audit event, '
  'and inserts a UNDELIVERY_SCAN row into pickup_inscan_events.';
