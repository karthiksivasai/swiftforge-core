-- ===========================================================================
-- 0108  manifest inscan enhancements (re-measurement, bag atomic scan, board)
-- ---------------------------------------------------------------------------
-- 1. Adds re-measurement & remark columns to public.shipments.
-- 2. Enhances public.get_manifest_inscan_board with line metadata (origin, dest,
--    customer, consignee, weight, inscan timestamp, discrepancy flag).
-- 3. Extends public.scan_manifest with re-measured weight, dims, vol wt, remark,
--    booking weight flag, and revenue-protection discrepancy detection.
-- 4. Adds public.scan_manifest_bag for atomic whole-bag receiving.
-- ===========================================================================

-- 1. Add re-measurement columns to public.shipments
alter table public.shipments add column if not exists inscan_weight numeric(12,3);
alter table public.shipments add column if not exists inscan_length numeric(10,2);
alter table public.shipments add column if not exists inscan_breadth numeric(10,2);
alter table public.shipments add column if not exists inscan_height numeric(10,2);
alter table public.shipments add column if not exists inscan_vol_weight numeric(12,3);
alter table public.shipments add column if not exists inscan_remark text;
alter table public.shipments add column if not exists inscan_has_weight_discrepancy boolean default false;

-- 2. Enhanced get_manifest_inscan_board
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
$$;

revoke all on function public.get_manifest_inscan_board(uuid) from public;
grant execute on function public.get_manifest_inscan_board(uuid) to authenticated, service_role;

-- 3. Extended scan_manifest with re-measurement & discrepancy tracking
create or replace function public.scan_manifest(
  p_manifest_id          uuid,
  p_awb_no               text default null,
  p_shipment_id          uuid default null,
  p_bag_no               text default null,
  p_mode                 text default 'AWB',
  p_weight               numeric default null,
  p_length               numeric default null,
  p_breadth              numeric default null,
  p_height               numeric default null,
  p_vol_weight           numeric default null,
  p_remark               text default null,
  p_is_booking_weight    boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant               uuid;
  v_m                    public.manifests;
  v_line                 public.manifest_lines;
  v_ship                 public.shipments;
  v_mode                 text;
  v_board                jsonb;
  v_exists               boolean;
  v_booked_wt            numeric := 0;
  v_inscan_wt            numeric;
  v_vol_wt               numeric;
  v_has_discrepancy      boolean := false;
  v_discrepancy_variance numeric := 0;
  v_payload              jsonb;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not (app.user_has_permission(v_tenant, 'txn.manifest-in-scan', 'add')
       or app.user_has_permission(v_tenant, 'txn.manifest-in-scan', 'modify')) then
    raise exception 'Permission denied: txn.manifest-in-scan' using errcode = '42501';
  end if;

  if p_manifest_id is null then
    raise exception 'Manifest is required' using errcode = '22023';
  end if;

  v_mode := upper(coalesce(nullif(btrim(p_mode),''), 'AWB'));
  if v_mode not in ('AWB','BAG') then v_mode := 'AWB'; end if;

  select * into v_m from public.manifests
   where id = p_manifest_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'Manifest not found' using errcode = 'P0002';
  end if;
  if v_m.status <> 'CLOSED' then
    raise exception 'Manifest must be CLOSED to inscan (is %)', v_m.status
      using errcode = 'CMS04';
  end if;

  if p_shipment_id is not null then
    select * into v_line from public.manifest_lines
     where tenant_id = v_tenant and manifest_id = p_manifest_id
       and shipment_id = p_shipment_id and deleted_at is null;
  elsif nullif(btrim(coalesce(p_awb_no,'')),'') is not null then
    select * into v_line from public.manifest_lines
     where tenant_id = v_tenant and manifest_id = p_manifest_id
       and (awb_no = btrim(p_awb_no) or forwarding_no = btrim(p_awb_no)) and deleted_at is null;
  else
    raise exception 'AWB No or shipment_id is required' using errcode = '22023';
  end if;

  if not found then
    raise exception 'Shipment is not on this manifest' using errcode = 'CMS04';
  end if;

  select * into v_ship from public.shipments
   where id = v_line.shipment_id and tenant_id = v_tenant and deleted_at is null
   for update;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;

  if v_ship.current_status in ('CANCELLED','VOID') then
    raise exception 'Cancelled shipments cannot be inscanned (AWB %)', v_ship.awb_no
      using errcode = 'CMS04';
  end if;

  select exists (
    select 1 from public.manifest_scan_events e
     where e.tenant_id = v_tenant
       and e.manifest_id = p_manifest_id
       and e.shipment_id = v_ship.id
       and e.deleted_at is null
       and e.event_type = 'INSCAN'
  ) into v_exists;

  if v_exists or v_ship.current_status = 'MANIFEST_INSCANNED' then
    v_board := public.get_manifest_inscan_board(p_manifest_id);
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'message', format('AWB %s already inscanned', v_ship.awb_no),
      'manifest_id', v_m.id,
      'manifest_no', v_m.manifest_no,
      'shipment_id', v_ship.id,
      'awb_no', v_ship.awb_no,
      'status', v_ship.current_status,
      'scanned_count', (v_board->>'scanned_count')::int,
      'pending_count', (v_board->>'pending_count')::int
    );
  end if;

  if v_ship.current_status <> 'MANIFESTED' then
    raise exception 'Shipment % must be MANIFESTED to inscan (is %)',
      v_ship.awb_no, v_ship.current_status
      using errcode = 'CMS04';
  end if;

  perform app.assert_status_transition('SHIPMENT', v_ship.current_status, 'MANIFEST_INSCANNED');

  -- Re-measurement & discrepancy calculations
  v_booked_wt := coalesce(v_ship.charge_weight, 0);
  v_inscan_wt := case when p_is_booking_weight then v_booked_wt else coalesce(p_weight, v_booked_wt) end;
  v_vol_wt := coalesce(p_vol_weight, case when coalesce(p_length, 0) > 0 and coalesce(p_breadth, 0) > 0 and coalesce(p_height, 0) > 0 then round((p_length * p_breadth * p_height / 5000.0), 3) else null end);

  if not p_is_booking_weight and p_weight is not null and p_weight > v_booked_wt then
    v_has_discrepancy := true;
    v_discrepancy_variance := p_weight - v_booked_wt;
  end if;

  update public.shipments set
    current_status = 'MANIFEST_INSCANNED',
    status_at = now(),
    inscan_weight = v_inscan_wt,
    inscan_length = p_length,
    inscan_breadth = p_breadth,
    inscan_height = p_height,
    inscan_vol_weight = v_vol_wt,
    inscan_remark = nullif(btrim(coalesce(p_remark, '')), ''),
    inscan_has_weight_discrepancy = v_has_discrepancy,
    updated_by = auth.uid()
  where id = v_ship.id and tenant_id = v_tenant
  returning * into v_ship;

  v_payload := jsonb_build_object(
    'manifest_id', v_m.id,
    'manifest_no', v_m.manifest_no,
    'mode', v_mode,
    'bag_no', coalesce(nullif(btrim(coalesce(p_bag_no,'')),''), v_line.bag_no),
    'booked_weight', v_booked_wt,
    're_measured_weight', p_weight,
    'inscan_weight', v_inscan_wt,
    'length', p_length,
    'breadth', p_breadth,
    'height', p_height,
    'vol_weight', v_vol_wt,
    'remark', p_remark,
    'is_booking_weight', p_is_booking_weight,
    'is_weight_discrepancy', v_has_discrepancy,
    'weight_variance', v_discrepancy_variance
  );

  insert into public.manifest_scan_events (
    tenant_id, manifest_id, shipment_id, awb_no, bag_no, scan_mode,
    event_type, event_text, payload, created_by, updated_by)
  values (
    v_tenant, v_m.id, v_ship.id, v_ship.awb_no,
    coalesce(nullif(btrim(coalesce(p_bag_no,'')),''), v_line.bag_no),
    v_mode, 'INSCAN',
    case when v_has_discrepancy
      then format('Manifest Inscan (Weight Discrepancy: Booked %s kg, Re-measured %s kg)', v_booked_wt, p_weight)
      else 'Manifest Inscan'
    end,
    v_payload,
    auth.uid(), auth.uid());

  insert into public.shipment_scan_events (
    tenant_id, shipment_id, manifest_id, awb_no,
    event_type, event_text, payload, created_by, updated_by)
  values (
    v_tenant, v_ship.id, v_m.id, v_ship.awb_no,
    'MANIFEST_INSCAN',
    case when v_has_discrepancy
      then format('Shipment Manifest Inscanned (+%s kg weight variance)', v_discrepancy_variance)
      else 'Shipment Manifest Inscanned'
    end,
    v_payload,
    auth.uid(), auth.uid());

  perform app.append_shipment_event(
    v_tenant, v_ship.id, 'MANIFEST_INSCANNED',
    case when v_has_discrepancy
      then format('Shipment Manifest Inscanned with weight discrepancy (+%s kg)', v_discrepancy_variance)
      else 'Shipment Manifest Inscanned'
    end,
    v_payload);

  perform app.append_manifest_event(
    v_tenant, v_m.id, 'INSCAN',
    format('Shipment %s Inscanned%s', v_ship.awb_no, case when v_has_discrepancy then ' (Weight Discrepancy)' else '' end),
    v_payload);

  perform app.write_audit_log(
    p_tenant_id => v_tenant, p_entity_type => 'shipments', p_action => 'MODIFY',
    p_entity_id => v_ship.id, p_module_slug => 'txn.manifest-in-scan',
    p_new => v_payload || jsonb_build_object('status', 'MANIFEST_INSCANNED', 'awb_no', v_ship.awb_no));

  v_board := public.get_manifest_inscan_board(p_manifest_id);

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'message', format('AWB %s inscanned%s', v_ship.awb_no, case when v_has_discrepancy then ' (Weight discrepancy noted)' else '' end),
    'manifest_id', v_m.id,
    'manifest_no', v_m.manifest_no,
    'shipment_id', v_ship.id,
    'awb_no', v_ship.awb_no,
    'from_status', 'MANIFESTED',
    'to_status', 'MANIFEST_INSCANNED',
    'has_weight_discrepancy', v_has_discrepancy,
    'inscan_weight', v_inscan_wt,
    'booked_weight', v_booked_wt,
    'scanned_count', (v_board->>'scanned_count')::int,
    'pending_count', (v_board->>'pending_count')::int
  );
end;
$$;

revoke all on function public.scan_manifest(uuid, text, uuid, text, text, numeric, numeric, numeric, numeric, numeric, text, boolean) from public;
grant execute on function public.scan_manifest(uuid, text, uuid, text, text, numeric, numeric, numeric, numeric, numeric, text, boolean)
  to authenticated, service_role;

-- 4. Atomic Whole-Bag Inscan
create or replace function public.scan_manifest_bag(
  p_manifest_id uuid,
  p_bag_no      text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant         uuid;
  v_m              public.manifests;
  v_clean_bag      text := nullif(btrim(coalesce(p_bag_no, '')), '');
  v_line           record;
  v_ship           public.shipments;
  v_scanned_count  integer := 0;
  v_skipped_count  integer := 0;
  v_total_in_bag   integer := 0;
  v_board          jsonb;
  v_exists         boolean;
  v_payload        jsonb;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not (app.user_has_permission(v_tenant, 'txn.manifest-in-scan', 'add')
       or app.user_has_permission(v_tenant, 'txn.manifest-in-scan', 'modify')) then
    raise exception 'Permission denied: txn.manifest-in-scan' using errcode = '42501';
  end if;

  if p_manifest_id is null then
    raise exception 'Manifest ID is required' using errcode = '22023';
  end if;
  if v_clean_bag is null then
    raise exception 'Bag No is required' using errcode = '22023';
  end if;

  select * into v_m from public.manifests
   where id = p_manifest_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'Manifest not found' using errcode = 'P0002';
  end if;
  if v_m.status <> 'CLOSED' then
    raise exception 'Manifest must be CLOSED to inscan (is %)', v_m.status
      using errcode = 'CMS04';
  end if;

  -- Count total lines in bag
  select count(*) into v_total_in_bag
    from public.manifest_lines
   where tenant_id = v_tenant and manifest_id = p_manifest_id
     and bag_no = v_clean_bag and deleted_at is null;

  if v_total_in_bag = 0 then
    raise exception 'Bag "%" is not on manifest %', v_clean_bag, v_m.manifest_no
      using errcode = 'CMS04';
  end if;

  -- Process all shipments in the bag
  for v_line in
    select ml.shipment_id, ml.awb_no
      from public.manifest_lines ml
     where ml.tenant_id = v_tenant and ml.manifest_id = p_manifest_id
       and ml.bag_no = v_clean_bag and ml.deleted_at is null
  loop
    select * into v_ship from public.shipments
     where id = v_line.shipment_id and tenant_id = v_tenant and deleted_at is null
     for update;

    if not found or v_ship.current_status in ('CANCELLED','VOID') then
      v_skipped_count := v_skipped_count + 1;
      continue;
    end if;

    select exists (
      select 1 from public.manifest_scan_events e
       where e.tenant_id = v_tenant
         and e.manifest_id = p_manifest_id
         and e.shipment_id = v_ship.id
         and e.deleted_at is null
         and e.event_type = 'INSCAN'
    ) into v_exists;

    if v_exists or v_ship.current_status = 'MANIFEST_INSCANNED' then
      v_skipped_count := v_skipped_count + 1;
      continue;
    end if;

    if v_ship.current_status <> 'MANIFESTED' then
      v_skipped_count := v_skipped_count + 1;
      continue;
    end if;

    perform app.assert_status_transition('SHIPMENT', v_ship.current_status, 'MANIFEST_INSCANNED');

    update public.shipments set
      current_status = 'MANIFEST_INSCANNED',
      status_at = now(),
      updated_by = auth.uid()
    where id = v_ship.id and tenant_id = v_tenant;

    v_payload := jsonb_build_object(
      'manifest_id', v_m.id,
      'manifest_no', v_m.manifest_no,
      'mode', 'BAG',
      'bag_no', v_clean_bag,
      'booked_weight', coalesce(v_ship.charge_weight, 0)
    );

    insert into public.manifest_scan_events (
      tenant_id, manifest_id, shipment_id, awb_no, bag_no, scan_mode,
      event_type, event_text, payload, created_by, updated_by)
    values (
      v_tenant, v_m.id, v_ship.id, v_ship.awb_no, v_clean_bag,
      'BAG', 'INSCAN', format('Bag %s Inscan', v_clean_bag),
      v_payload, auth.uid(), auth.uid());

    insert into public.shipment_scan_events (
      tenant_id, shipment_id, manifest_id, awb_no,
      event_type, event_text, payload, created_by, updated_by)
    values (
      v_tenant, v_ship.id, v_m.id, v_ship.awb_no,
      'MANIFEST_INSCAN', format('Bag %s Manifest Inscanned', v_clean_bag),
      v_payload, auth.uid(), auth.uid());

    perform app.append_shipment_event(
      v_tenant, v_ship.id, 'MANIFEST_INSCANNED',
      format('Shipment Manifest Inscanned via Bag %s', v_clean_bag),
      v_payload);

    v_scanned_count := v_scanned_count + 1;
  end loop;

  perform app.append_manifest_event(
    v_tenant, v_m.id, 'INSCAN_BAG',
    format('Bag %s Inscanned (%s shipments received, %s skipped)', v_clean_bag, v_scanned_count, v_skipped_count),
    jsonb_build_object('bag_no', v_clean_bag, 'scanned_count', v_scanned_count, 'skipped_count', v_skipped_count));

  v_board := public.get_manifest_inscan_board(p_manifest_id);

  return jsonb_build_object(
    'ok', true,
    'manifest_id', v_m.id,
    'manifest_no', v_m.manifest_no,
    'bag_no', v_clean_bag,
    'total_in_bag', v_total_in_bag,
    'newly_scanned', v_scanned_count,
    'skipped', v_skipped_count,
    'message', format('Bag %s: %s shipment(s) inscanned%s',
      v_clean_bag, v_scanned_count,
      case when v_skipped_count > 0 then format(' (%s already inscanned)', v_skipped_count) else '' end),
    'scanned_count', (v_board->>'scanned_count')::int,
    'pending_count', (v_board->>'pending_count')::int
  );
end;
$$;

revoke all on function public.scan_manifest_bag(uuid, text) from public;
grant execute on function public.scan_manifest_bag(uuid, text) to authenticated, service_role;
