-- ===========================================================================
-- 0125  permission gates for older client RPCs
-- ---------------------------------------------------------------------------
-- Adds app.user_has_permission on client-callable SECURITY DEFINER functions
-- that previously checked only the tenant. Signatures and the rest of each
-- body are unchanged. all_access and tenant admins already pass inside
-- app.user_has_permission. Failure is errcode 42501, same shape as Bagging
-- and User Setup.
--
-- Left unchanged on purpose (see the contract test allowlist):
--   session identity (me, me_permissions, me_navigation, record_login,
--   record_logout, my_session_is_active, public_track_shipment)
--   secret readers granted only to service_role
--   functions whose slug depends on an argument or is shared across screens
-- ===========================================================================

-- source: 0037_drs_completion.sql
create or replace function public.get_drs_completion_board(p_drs_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_d public.drs;
  v_lines jsonb;
  v_total integer;
  v_ofd integer;
  v_attempted integer;
  v_delivered integer;
  v_undelivered integer;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  if not app.user_has_permission(v_tenant, 'txn.drs-scan', 'list')
     and not app.user_has_permission(v_tenant, 'txn.drs-scan', 'search') then
    raise exception 'Drs Scan permission is required' using errcode = '42501';
  end if;

  select * into v_d from public.drs
   where id = p_drs_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'DRS not found' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(x order by (x->>'sequence_no')::int), '[]'::jsonb),
         count(*),
         count(*) filter (where (x->>'shipment_status') = 'OUT_FOR_DELIVERY'),
         count(*) filter (where (x->>'shipment_status') = 'DELIVERY_ATTEMPTED'),
         count(*) filter (where (x->>'outcome') = 'DELIVERED'
                          or (x->>'shipment_status') in ('DELIVERED_PENDING_POD','DELIVERED')),
         count(*) filter (where (x->>'outcome') = 'UNDELIVERED'
                          or (x->>'shipment_status') = 'UNDELIVERED')
    into v_lines, v_total, v_ofd, v_attempted, v_delivered, v_undelivered
  from (
    select jsonb_build_object(
      'sequence_no', dl.sequence_no,
      'shipment_id', dl.shipment_id,
      'awb_no', dl.awb_no,
      'outcome', dl.outcome,
      'outcome_at', dl.outcome_at,
      'attempt_count', dl.attempt_count,
      'shipment_status', s.current_status,
      'terminal', coalesce(dl.outcome in ('DELIVERED','UNDELIVERED'), false)
                 or s.current_status in ('DELIVERED_PENDING_POD','UNDELIVERED','DELIVERED')
    ) as x
    from public.drs_lines dl
    join public.shipments s
      on s.tenant_id = dl.tenant_id and s.id = dl.shipment_id
    where dl.tenant_id = v_tenant
      and dl.drs_id = p_drs_id
      and dl.deleted_at is null
  ) q;

  return jsonb_build_object(
    'drs_id', v_d.id,
    'drs_no', v_d.drs_no,
    'status', v_d.status,
    'total', coalesce(v_total, 0),
    'out_for_delivery', coalesce(v_ofd, 0),
    'attempted', coalesce(v_attempted, 0),
    'delivered', coalesce(v_delivered, 0),
    'undelivered', coalesce(v_undelivered, 0),
    'pending', greatest(coalesce(v_total, 0) - coalesce(v_delivered, 0) - coalesce(v_undelivered, 0), 0),
    'lines', coalesce(v_lines, '[]'::jsonb)
  );
end
$$
;

revoke all on function public.get_drs_completion_board(uuid) from public;
grant execute on function public.get_drs_completion_board(uuid) to authenticated, service_role;

-- source: 0100_pickup_inscan.sql
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
  if not app.user_has_permission(v_tenant, 'txn.pickup-insacn', 'list')
     and not app.user_has_permission(v_tenant, 'txn.pickup-insacn', 'search') then
    raise exception 'Pickup Inscan permission is required' using errcode = '42501';
  end if;
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
$$
;

revoke all on function public.get_inscan_reconciliation(date, date, uuid) from public;
grant execute on function public.get_inscan_reconciliation(date, date, uuid) to authenticated, service_role;

-- source: 0100_pickup_inscan.sql
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
  if not app.user_has_permission(v_tenant, 'txn.pickup-insacn', 'add') then
    raise exception 'Pickup Inscan permission is required' using errcode = '42501';
  end if;
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
$$
;

revoke all on function public.record_pickup_inscan(date, text, text, text, text, uuid, text, uuid, text, uuid, text, text, text, boolean, text, text, boolean) from public;
grant execute on function public.record_pickup_inscan(date, text, text, text, text, uuid, text, uuid, text, uuid, text, text, text, boolean, text, text, boolean) to authenticated, service_role;

-- source: 0108_manifest_inscan_enhancements.sql
create or replace function public.get_manifest_inscan_board(p_manifest_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant  uuid;
  v_m       public.manifests;
  v_lines   jsonb;
  v_scanned integer;
  v_pending integer;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  if not app.user_has_permission(v_tenant, 'txn.manifest-in-scan', 'list')
     and not app.user_has_permission(v_tenant, 'txn.manifest-in-scan', 'search') then
    raise exception 'Manifest In Scan permission is required' using errcode = '42501';
  end if;

  select * into v_m from public.manifests
   where id = p_manifest_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'Manifest not found' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(x order by (x->>'seq')::int), '[]'::jsonb),
         count(*) filter (where (x->>'scanned')::boolean),
         count(*) filter (where not (x->>'scanned')::boolean)
    into v_lines, v_scanned, v_pending
  from (
    select jsonb_build_object(
      'seq', ml.seq,
      'shipment_id', ml.shipment_id,
      'awb_no', ml.awb_no,
      'forwarding_no', ml.forwarding_no,
      'bag_no', ml.bag_no,
      'origin_name', ml.origin_name,
      'destination_name', ml.destination_name,
      'customer_name', ml.customer_name,
      'consignee_name', ml.consignee_name,
      'pieces', coalesce(ml.pieces, s.pieces, 1),
      'charge_weight', coalesce(ml.charge_weight, s.charge_weight, 0),
      'shipment_status', s.current_status,
      'scanned', exists (
        select 1 from public.manifest_scan_events e
         where e.tenant_id = v_tenant
           and e.manifest_id = p_manifest_id
           and e.shipment_id = ml.shipment_id
           and e.deleted_at is null
           and e.event_type = 'INSCAN'
      ),
      'inscan_at', (
        select e.created_at from public.manifest_scan_events e
         where e.tenant_id = v_tenant
           and e.manifest_id = p_manifest_id
           and e.shipment_id = ml.shipment_id
           and e.deleted_at is null
           and e.event_type = 'INSCAN'
         order by e.created_at desc limit 1
      ),
      'inscan_weight', (
        select nullif((e.payload->>'inscan_weight')::numeric, 0) from public.manifest_scan_events e
         where e.tenant_id = v_tenant
           and e.manifest_id = p_manifest_id
           and e.shipment_id = ml.shipment_id
           and e.deleted_at is null
           and e.event_type = 'INSCAN'
         order by e.created_at desc limit 1
      ),
      'has_weight_discrepancy', (
        select coalesce((e.payload->>'is_weight_discrepancy')::boolean, false) from public.manifest_scan_events e
         where e.tenant_id = v_tenant
           and e.manifest_id = p_manifest_id
           and e.shipment_id = ml.shipment_id
           and e.deleted_at is null
           and e.event_type = 'INSCAN'
         order by e.created_at desc limit 1
      )
    ) as x
    from public.manifest_lines ml
    join public.shipments s
      on s.tenant_id = ml.tenant_id and s.id = ml.shipment_id
    where ml.tenant_id = v_tenant
      and ml.manifest_id = p_manifest_id
      and ml.deleted_at is null
  ) q;

  return jsonb_build_object(
    'manifest_id', v_m.id,
    'manifest_no', v_m.manifest_no,
    'status', v_m.status,
    'scanned_count', coalesce(v_scanned, 0),
    'pending_count', coalesce(v_pending, 0),
    'lines', coalesce(v_lines, '[]'::jsonb)
  );
end;
$$
;

revoke all on function public.get_manifest_inscan_board(uuid) from public;
grant execute on function public.get_manifest_inscan_board(uuid) to authenticated, service_role;

-- source: 0109_undelivery_scan.sql
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
  if not app.user_has_permission(v_tenant, 'txn.un-delivery-scan', 'add') then
    raise exception 'Un-Delivery Scan permission is required' using errcode = '42501';
  end if;
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
$$
;

revoke all on function public.record_undelivery_scan(date, text, text, text, text, uuid, text, text, boolean) from public;
grant execute on function public.record_undelivery_scan(date, text, text, text, text, uuid, text, text, boolean) to authenticated, service_role;

-- source: 0038_pod_foundation.sql
create or replace function public.get_pod_by_awb(p_awb_no text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_ship public.shipments;
  v_pod public.pod_records;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  if not app.user_has_permission(v_tenant, 'txn.pod-entry-ok-update', 'list')
     and not app.user_has_permission(v_tenant, 'txn.pod-entry-ok-update', 'search') then
    raise exception 'POD Entry permission is required' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_awb_no,'')),'') is null then
    return null;
  end if;

  select * into v_ship from public.shipments
   where tenant_id = v_tenant and awb_no = btrim(p_awb_no) and deleted_at is null;
  if not found then
    return jsonb_build_object('found', false, 'awb_no', btrim(p_awb_no));
  end if;

  select * into v_pod from public.pod_records
   where tenant_id = v_tenant and shipment_id = v_ship.id and deleted_at is null
   order by case when status = 'DELIVERED' then 0 else 1 end, updated_at desc
   limit 1;

  return jsonb_build_object(
    'found', true,
    'shipment_id', v_ship.id,
    'awb_no', v_ship.awb_no,
    'current_status', v_ship.current_status,
    'pod_status', v_ship.pod_status,
    'pod_date', v_ship.pod_date,
    'pod_receiver', v_ship.pod_receiver,
    'pod_remark', v_ship.pod_remark,
    'delivered_at', v_ship.delivered_at,
    'receiver', v_ship.receiver,
    'pod', case when v_pod.id is null then null else jsonb_build_object(
      'id', v_pod.id,
      'row_version', v_pod.row_version,
      'pod_date', v_pod.pod_date,
      'receiver_name', v_pod.receiver_name,
      'remark', v_pod.remark,
      'status', v_pod.status,
      'signature_file_id', v_pod.signature_file_id,
      'photo_file_id', v_pod.photo_file_id,
      'source', v_pod.source
    ) end
  );
end
$$
;

revoke all on function public.get_pod_by_awb(text) from public;
grant execute on function public.get_pod_by_awb(text) to authenticated, service_role;

-- source: 0033_shipment_booking.sql
create or replace function public.validate_shipment_booking(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_s      public.shipments;
  v_errors jsonb;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  if not app.user_has_permission(v_tenant, 'txn.awb-entry', 'list')
     and not app.user_has_permission(v_tenant, 'txn.awb-entry', 'search') then
    raise exception 'AWB Entry permission is required' using errcode = '42501';
  end if;

  select * into v_s from public.shipments
    where id = p_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;

  v_errors := app.validate_shipment_for_booking(v_s);
  return jsonb_build_object(
    'ok', jsonb_array_length(v_errors) = 0,
    'errors', v_errors,
    'status', v_s.current_status,
    'awb_no', v_s.awb_no
  );
end
$$
;

revoke all on function public.validate_shipment_booking(uuid) from public;
grant execute on function public.validate_shipment_booking(uuid) to authenticated, service_role;

-- source: 0076_awb_entry_drafts.sql
create or replace function public.get_awb_entry_draft()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_user   uuid;
  v_payload jsonb;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    return null;
  end if;

  if not app.user_has_permission(v_tenant, 'txn.awb-entry', 'list')
     and not app.user_has_permission(v_tenant, 'txn.awb-entry', 'search') then
    raise exception 'AWB Entry permission is required' using errcode = '42501';
  end if;

  select u.id into v_user
  from public.users u
  where u.auth_user_id = auth.uid() and u.deleted_at is null
  limit 1;
  if v_user is null then
    return null;
  end if;

  select d.payload into v_payload
  from public.awb_entry_drafts d
  where d.tenant_id = v_tenant and d.user_id = v_user;

  return v_payload;
end;
$$
;

revoke all on function public.get_awb_entry_draft() from public;
grant execute on function public.get_awb_entry_draft() to authenticated, service_role;

-- source: 0076_awb_entry_drafts.sql
create or replace function public.upsert_awb_entry_draft(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_user   uuid;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  if not app.user_has_permission(v_tenant, 'txn.awb-entry', 'add')
     and not app.user_has_permission(v_tenant, 'txn.awb-entry', 'modify') then
    raise exception 'AWB Entry permission is required' using errcode = '42501';
  end if;

  select u.id into v_user
  from public.users u
  where u.auth_user_id = auth.uid() and u.deleted_at is null
  limit 1;
  if v_user is null then
    raise exception 'User profile not found' using errcode = '42501';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'p_payload must be a JSON object' using errcode = '22023';
  end if;

  insert into public.awb_entry_drafts (tenant_id, user_id, payload, saved_at)
  values (v_tenant, v_user, p_payload, now())
  on conflict (tenant_id, user_id) do update
    set payload = excluded.payload,
        saved_at = now(),
        updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$
;

revoke all on function public.upsert_awb_entry_draft(jsonb) from public;
grant execute on function public.upsert_awb_entry_draft(jsonb) to authenticated, service_role;

-- source: 0076_awb_entry_drafts.sql
create or replace function public.clear_awb_entry_draft()
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_user   uuid;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    return jsonb_build_object('ok', true);
  end if;

  if not app.user_has_permission(v_tenant, 'txn.awb-entry', 'delete') then
    raise exception 'AWB Entry permission is required' using errcode = '42501';
  end if;

  select u.id into v_user
  from public.users u
  where u.auth_user_id = auth.uid() and u.deleted_at is null
  limit 1;
  if v_user is null then
    return jsonb_build_object('ok', true);
  end if;

  delete from public.awb_entry_drafts
  where tenant_id = v_tenant and user_id = v_user;

  return jsonb_build_object('ok', true);
end;
$$
;

revoke all on function public.clear_awb_entry_draft() from public;
grant execute on function public.clear_awb_entry_draft() to authenticated, service_role;

-- source: 0102_awb_stock_allotment_and_gating.sql
create or replace function public.get_branch_awb_stock_summary(p_branch_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant       uuid;
  v_branch       uuid := p_branch_id;
  v_branch_code  text := 'HYD';
  v_limit        bigint := 0;
  v_used         bigint := 0;
  v_balance      bigint := 0;
  v_loc_balance  bigint := 0;
  v_auto_start   bigint := 0;
  v_auto_end     bigint := 0;
  v_manual_start bigint := 0;
  v_manual_end   bigint := 0;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  if not app.user_has_permission(v_tenant, 'txn.awb-entry', 'list')
     and not app.user_has_permission(v_tenant, 'txn.awb-entry', 'search') then
    raise exception 'AWB Entry permission is required' using errcode = '42501';
  end if;

  if v_branch is null then
    select b.id, b.code into v_branch, v_branch_code
    from public.branches b
    where b.tenant_id = v_tenant and b.deleted_at is null
    order by b.is_head_office desc, b.code asc limit 1;
  else
    select b.code into v_branch_code
    from public.branches b
    where b.id = v_branch and b.tenant_id = v_tenant and b.deleted_at is null;
  end if;

  -- Compute Auto series metrics
  select
    coalesce(sum(a.end_no - a.start_no + 1), 0),
    coalesce(sum(a.used_count), 0),
    coalesce(min(a.start_no), 0),
    coalesce(max(a.end_no), 0)
  into v_limit, v_used, v_auto_start, v_auto_end
  from public.branch_awb_allotments a
  where a.tenant_id = v_tenant
    and a.branch_id = v_branch
    and a.series_type = 'AUTO'
    and a.deleted_at is null
    and a.is_active = true;

  if v_limit = 0 then
    v_limit := 50000;
    v_used := (
      select count(*)
      from public.shipments s
      where s.tenant_id = v_tenant and s.branch_id = v_branch and s.deleted_at is null
    );
  end if;

  v_balance := greatest(0, v_limit - v_used);
  v_loc_balance := v_balance;

  -- Manual series bounds
  select
    coalesce(min(a.start_no), 0),
    coalesce(max(a.end_no), 0)
  into v_manual_start, v_manual_end
  from public.branch_awb_allotments a
  where a.tenant_id = v_tenant
    and a.branch_id = v_branch
    and a.series_type = 'MANUAL'
    and a.deleted_at is null
    and a.is_active = true;

  return jsonb_build_object(
    'branch_id', v_branch,
    'branch_code', coalesce(v_branch_code, 'HYD'),
    'limit', v_limit,
    'used', v_used,
    'balance', v_balance,
    'location_balance', v_loc_balance,
    'auto_start', v_auto_start,
    'auto_end', v_auto_end,
    'manual_start', v_manual_start,
    'manual_end', v_manual_end,
    'is_exhausted', (v_balance <= 0)
  );
end;
$$
;

revoke all on function public.get_branch_awb_stock_summary(uuid) from public;
grant execute on function public.get_branch_awb_stock_summary(uuid) to authenticated, service_role;

-- source: 0102_awb_stock_allotment_and_gating.sql
create or replace function public.validate_manual_awb(
  p_branch_id uuid,
  p_awb_no    text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant     uuid;
  v_clean_awb  text := trim(p_awb_no);
  v_numeric_no bigint;
  v_allotment  public.branch_awb_allotments%rowtype;
  v_exists     boolean;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  if not app.user_has_permission(v_tenant, 'txn.awb-entry', 'list')
     and not app.user_has_permission(v_tenant, 'txn.awb-entry', 'search') then
    raise exception 'AWB Entry permission is required' using errcode = '42501';
  end if;

  if v_clean_awb is null or v_clean_awb = '' then
    return jsonb_build_object(
      'valid', false,
      'message', 'AWB Number is required'
    );
  end if;

  -- 1. Check uniqueness: AWB cannot be used in any active shipment
  select exists (
    select 1
    from public.shipments s
    where s.tenant_id = v_tenant
      and upper(s.awb_no) = upper(v_clean_awb)
      and s.deleted_at is null
  ) into v_exists;

  if v_exists then
    return jsonb_build_object(
      'valid', false,
      'message', 'AWB ' || v_clean_awb || ' is already used by an existing shipment'
    );
  end if;

  -- 2. Extract numeric portion if possible
  begin
    v_numeric_no := regexp_replace(v_clean_awb, '\D', '', 'g')::bigint;
  exception when others then
    v_numeric_no := null;
  end;

  -- 3. Check against branch allotments if active manual series exists
  if v_numeric_no is not null and p_branch_id is not null then
    select * into v_allotment
    from public.branch_awb_allotments a
    where a.tenant_id = v_tenant
      and a.branch_id = p_branch_id
      and a.is_active = true
      and a.deleted_at is null
      and v_numeric_no between a.start_no and a.end_no
    order by case when a.series_type = 'MANUAL' then 0 else 1 end
    limit 1;

    if v_allotment.id is null and exists (
      select 1 from public.branch_awb_allotments a
      where a.tenant_id = v_tenant and a.branch_id = p_branch_id and a.is_active = true and a.deleted_at is null
    ) then
      return jsonb_build_object(
        'valid', false,
        'message', 'Manual AWB ' || v_clean_awb || ' falls outside the branch allotted series'
      );
    end if;

    if v_allotment.id is not null and v_allotment.status = 'EXHAUSTED' then
      return jsonb_build_object(
        'valid', false,
        'message', 'The allotted series range for this branch is exhausted'
      );
    end if;
  end if;

  return jsonb_build_object(
    'valid', true,
    'awb_no', v_clean_awb,
    'message', 'AWB ' || v_clean_awb || ' is available for manual booking'
  );
end;
$$
;

revoke all on function public.validate_manual_awb(uuid, text) from public;
grant execute on function public.validate_manual_awb(uuid, text) to authenticated, service_role;

-- source: 0096_international_destination_lookup.sql
create or replace function public.lookup_international_destinations(
  p_q text default null,
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

  if not app.user_has_permission(app.current_tenant_id(), 'mst.destination-master', 'list')
     and not app.user_has_permission(app.current_tenant_id(), 'mst.destination-master', 'search') then
    raise exception 'Destination Master permission is required' using errcode = '42501';
  end if;

  return query
  select d.id, d.code, d.name, d.dest_type
  from public.destinations d
  where d.tenant_id in (select app.user_tenant_ids())
    and d.deleted_at is null
    and d.status = 'ACTIVE'
    and d.dest_type = 'INTERNATIONAL'
    and (d.name ilike v_pat or d.code ilike v_pat)
  order by d.name, d.code, d.id
  limit v_limit;
end;
$$
;

revoke all on function public.lookup_international_destinations(text, integer) from public;
grant execute on function public.lookup_international_destinations(text, integer) to authenticated;

-- source: 0115_fix_list_shipment_documents_rpc.sql
create or replace function public.list_shipment_documents(p_shipment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_s public.shipments;
  v_rows jsonb;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context' using errcode = '42501';
  end if;

  if not app.user_has_permission(v_tenant, 'txn.awb-entry', 'list')
     and not app.user_has_permission(v_tenant, 'txn.awb-entry', 'search') then
    raise exception 'AWB Entry permission is required' using errcode = '42501';
  end if;

  select * into v_s
  from public.shipments
  where id = p_shipment_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;

  with catalog(document_type, title, default_status) as (
    values
      ('AUTHORITY_LETTER', 'Authority Letter', 'WAITING'),
      ('AWB_LABEL', 'AWB Label', 'WAITING'),
      ('INVOICE', 'Invoice', 'WAITING'),
      ('VENDOR_AWB', 'Vendor AWB', 'WAITING'),
      ('VENDOR_INVOICE', 'Vendor Invoice', 'WAITING'),
      ('KYC', 'KYC', 'NOT_REQUIRED')
  ),
  latest as (
    select distinct on (d.document_type)
      d.id, d.document_type, d.source, d.vendor, d.file_name, d.file_url,
      d.content_b64, d.mime_type, d.file_size, d.version, d.status,
      d.created_at, d.updated_at, d.raw_meta
    from public.shipment_documents d
    where d.tenant_id = v_tenant
      and d.shipment_id = p_shipment_id
      and d.deleted_at is null
    order by d.document_type, d.version desc, d.created_at desc
  ),
  scored as (
    select
      c.document_type,
      c.title,
      c.default_status,
      l.id,
      l.source,
      l.vendor,
      l.file_name,
      l.file_url,
      l.content_b64,
      l.mime_type,
      l.file_size,
      l.version,
      l.status,
      l.created_at,
      l.updated_at,
      l.raw_meta,
      case
        when l.id is null then false
        when coalesce(l.raw_meta->>'placeholder', '') = 'true' then false
        when coalesce(l.raw_meta->>'sandbox', '') = 'true' then false
        when coalesce(l.raw_meta->>'generator', '') like 'internal-authority%' then false
        when c.document_type = 'AUTHORITY_LETTER'
          and nullif(btrim(coalesce(l.file_url, '')), '') is null
          and not (
            l.content_b64 is not null
            and l.source = 'VENDOR'
            and length(l.content_b64) > 900
          )
          then false
        when nullif(btrim(coalesce(l.file_url, '')), '') is not null then true
        when l.content_b64 is not null and length(l.content_b64) > 900 then true
        else false
      end as is_available
    from catalog c
    left join latest l on l.document_type = c.document_type
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'type', s.document_type,
      'title', s.title,
      'status', case
        when s.id is null then s.default_status
        when s.is_available then 'AVAILABLE'
        else 'WAITING'
      end,
      'id', s.id,
      'url', s.file_url,
      'fileName', coalesce(s.file_name, s.title),
      'mimeType', coalesce(s.mime_type, 'application/pdf'),
      'fileSize', s.file_size,
      'version', s.version,
      'source', s.source,
      'vendor', s.vendor,
      'createdAt', s.created_at,
      'updatedAt', s.updated_at,
      'available', s.is_available,
      'hasContent', (s.content_b64 is not null and s.is_available)
    )
    order by array_position(
      array['AUTHORITY_LETTER','AWB_LABEL','INVOICE','VENDOR_AWB','VENDOR_INVOICE','KYC'],
      s.document_type
    )
  ), '[]'::jsonb)
  into v_rows
  from scored s;

  return v_rows;
end;
$$
;

revoke all on function public.list_shipment_documents(uuid) from public;
grant execute on function public.list_shipment_documents(uuid) to authenticated, service_role;

-- source: 0088_purge_blank_vendor_docs.sql
create or replace function public.get_shipment_document(
  p_shipment_id uuid,
  p_document_type text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_row public.shipment_documents;
  v_available boolean;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context' using errcode = '42501';
  end if;

  if not app.user_has_permission(v_tenant, 'txn.awb-entry', 'list')
     and not app.user_has_permission(v_tenant, 'txn.awb-entry', 'search') then
    raise exception 'AWB Entry permission is required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.shipments
    where id = p_shipment_id and tenant_id = v_tenant and deleted_at is null
  ) then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;

  select * into v_row
  from public.shipment_documents d
  where d.tenant_id = v_tenant
    and d.shipment_id = p_shipment_id
    and d.document_type = upper(btrim(p_document_type))
    and d.deleted_at is null
  order by d.version desc, d.created_at desc
  limit 1;

  if not found then
    return null;
  end if;

  v_available :=
    coalesce(v_row.raw_meta->>'placeholder', '') <> 'true'
    and coalesce(v_row.raw_meta->>'sandbox', '') <> 'true'
    and coalesce(v_row.raw_meta->>'generator', '') not like 'internal-authority%'
    and (
      nullif(btrim(coalesce(v_row.file_url, '')), '') is not null
      or (
        v_row.content_b64 is not null
        and length(v_row.content_b64) > 900
        and (
          upper(btrim(p_document_type)) <> 'AUTHORITY_LETTER'
          or v_row.source = 'VENDOR'
        )
      )
    );

  if not v_available then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'type', v_row.document_type,
    'source', v_row.source,
    'vendor', v_row.vendor,
    'fileName', v_row.file_name,
    'url', v_row.file_url,
    'content_b64', v_row.content_b64,
    'mimeType', coalesce(v_row.mime_type, 'application/pdf'),
    'fileSize', v_row.file_size,
    'version', v_row.version,
    'status', 'AVAILABLE',
    'createdAt', v_row.created_at,
    'available', true
  );
end;
$$
;

revoke all on function public.get_shipment_document(uuid, text) from public;
grant execute on function public.get_shipment_document(uuid, text) to authenticated, service_role;

