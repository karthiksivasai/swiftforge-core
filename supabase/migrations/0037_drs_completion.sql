-- ===========================================================================
-- 0037  drs completion — Phase 4 Milestone 4D
-- ---------------------------------------------------------------------------
-- Driver delivery workflow only. No POD / signature / photo / GPS / tracking
-- timeline / finance / rating.
--
-- Blueprint alignment:
--   DRS OPEN→DISPATCHED→CLOSED  ≈  DRAFT→DISPATCHED→COMPLETED (4C naming)
--   drs_lines.outcome (DELIVERED|UNDELIVERED) per blueprint §2.8
--   OUT_FOR_DELIVERY → UNDELIVERED (failed) | DELIVERED_PENDING_POD (pre-POD)
--   DELIVERY_ATTEMPTED = intermediate attempt before terminal outcome
--   Full DELIVERED + POD capture deferred to Milestone 4E
--
-- RPCs: complete_drs, reopen_drs, mark_shipment_delivery_attempt
-- Slug: txn.drs-scan
-- ===========================================================================

insert into app.status_transitions (entity_kind, from_status, to_status) values
  ('DRS','COMPLETED','DISPATCHED'),
  ('SHIPMENT','OUT_FOR_DELIVERY','DELIVERY_ATTEMPTED'),
  ('SHIPMENT','OUT_FOR_DELIVERY','DELIVERED_PENDING_POD'),
  ('SHIPMENT','DELIVERY_ATTEMPTED','DELIVERED_PENDING_POD'),
  ('SHIPMENT','DELIVERY_ATTEMPTED','UNDELIVERED')
on conflict do nothing;
-- OUT_FOR_DELIVERY → UNDELIVERED already seeded in 0030

alter table public.shipments drop constraint if exists shipments_current_status_check;
alter table public.shipments add constraint shipments_current_status_check
  check (current_status in (
    'DRAFT','BOOKED','PICKUP_INSCANNED','BAGGED','MANIFESTED','MANIFEST_INSCANNED',
    'IN_TRANSIT','RECEIVED_AT_HUB','ON_DRS','MISROUTED',
    'OUT_FOR_DELIVERY','DELIVERY_ATTEMPTED','DELIVERED_PENDING_POD',
    'DELIVERED','UNDELIVERED',
    'UNDELIVERED_RECEIVED','RTO_INITIATED','RTO_DELIVERED',
    'CANCELLED','VOID'));

-- Blueprint §2.8: line outcome snapshot (no POD payload yet)
alter table public.drs_lines
  add column if not exists outcome text
    check (outcome is null or outcome in ('DELIVERED','UNDELIVERED')),
  add column if not exists outcome_at timestamptz,
  add column if not exists attempt_count integer not null default 0
    check (attempt_count >= 0);

-- ---------------------------------------------------------------------------
-- mark_shipment_delivery_attempt
-- ---------------------------------------------------------------------------
create or replace function public.mark_shipment_delivery_attempt(
  p_drs_id      uuid,
  p_shipment_id uuid default null,
  p_awb_no      text default null,
  p_outcome     text default 'DELIVERY_ATTEMPTED',
  p_remark      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_d      public.drs;
  v_line   public.drs_lines;
  v_ship   public.shipments;
  v_outcome text;
  v_to_status text;
  v_line_outcome text;
  v_from text;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not (app.user_has_permission(v_tenant, 'txn.drs-scan', 'add')
       or app.user_has_permission(v_tenant, 'txn.drs-scan', 'modify')) then
    raise exception 'Permission denied: txn.drs-scan' using errcode = '42501';
  end if;

  if p_drs_id is null then
    raise exception 'DRS is required' using errcode = '22023';
  end if;

  v_outcome := upper(nullif(btrim(coalesce(p_outcome,'')),''));
  if v_outcome is null then v_outcome := 'DELIVERY_ATTEMPTED'; end if;

  -- UI aliases → canonical status targets
  if v_outcome in ('DELIVERED','MARK_DELIVERED','OK') then
    v_outcome := 'DELIVERED_PENDING_POD';
  elsif v_outcome in ('FAILED','UD','MARK_UNDELIVERED') then
    v_outcome := 'UNDELIVERED';
  elsif v_outcome in ('ATTEMPT','ATTEMPTED') then
    v_outcome := 'DELIVERY_ATTEMPTED';
  end if;

  if v_outcome not in ('DELIVERY_ATTEMPTED','UNDELIVERED','DELIVERED_PENDING_POD') then
    raise exception 'Invalid delivery outcome: %', v_outcome using errcode = '22023';
  end if;

  select * into v_d from public.drs
   where id = p_drs_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'DRS not found' using errcode = 'P0002';
  end if;
  if v_d.status = 'COMPLETED' then
    raise exception 'Completed DRS cannot be modified' using errcode = 'CMS02';
  end if;
  if v_d.status = 'CANCELLED' then
    raise exception 'Cancelled DRS cannot be modified' using errcode = 'CMS02';
  end if;
  if v_d.status <> 'DISPATCHED' then
    raise exception 'DRS must be DISPATCHED to record delivery attempts (is %)', v_d.status
      using errcode = 'CMS04';
  end if;

  if p_shipment_id is not null then
    select * into v_line from public.drs_lines
     where tenant_id = v_tenant and drs_id = p_drs_id
       and shipment_id = p_shipment_id and deleted_at is null;
  elsif nullif(btrim(coalesce(p_awb_no,'')),'') is not null then
    select * into v_line from public.drs_lines
     where tenant_id = v_tenant and drs_id = p_drs_id
       and awb_no = btrim(p_awb_no) and deleted_at is null;
  else
    raise exception 'shipment_id or awb_no is required' using errcode = '22023';
  end if;

  if not found then
    raise exception 'Shipment is not assigned to this DRS' using errcode = 'CMS04';
  end if;

  select * into v_ship from public.shipments
   where id = v_line.shipment_id and tenant_id = v_tenant and deleted_at is null
   for update;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;

  if v_ship.current_status in ('CANCELLED','VOID') then
    raise exception 'Cancelled shipments cannot be updated (AWB %)', v_ship.awb_no
      using errcode = 'CMS04';
  end if;

  -- Duplicate / already terminal
  if v_line.outcome in ('DELIVERED','UNDELIVERED')
     or v_ship.current_status in ('DELIVERED_PENDING_POD','UNDELIVERED','DELIVERED') then
    raise exception 'Delivery outcome already recorded for AWB %', v_ship.awb_no
      using errcode = 'CMS04';
  end if;

  if v_outcome = 'DELIVERY_ATTEMPTED'
     and v_ship.current_status = 'DELIVERY_ATTEMPTED' then
    raise exception 'Delivery attempt already recorded for AWB %', v_ship.awb_no
      using errcode = 'CMS04';
  end if;

  v_from := v_ship.current_status;
  v_to_status := v_outcome;

  if v_from not in ('OUT_FOR_DELIVERY','DELIVERY_ATTEMPTED') then
    raise exception 'Shipment % must be OUT_FOR_DELIVERY (or DELIVERY_ATTEMPTED) (is %)',
      v_ship.awb_no, v_from
      using errcode = 'CMS04';
  end if;

  -- From DELIVERY_ATTEMPTED only terminal outcomes allowed (not another attempt)
  if v_from = 'DELIVERY_ATTEMPTED' and v_to_status = 'DELIVERY_ATTEMPTED' then
    raise exception 'Delivery attempt already recorded for AWB %', v_ship.awb_no
      using errcode = 'CMS04';
  end if;

  perform app.assert_status_transition('SHIPMENT', v_from, v_to_status);

  update public.shipments set
    current_status = v_to_status,
    status_at = now(),
    updated_by = auth.uid()
  where id = v_ship.id and tenant_id = v_tenant
  returning * into v_ship;

  v_line_outcome := case
    when v_to_status = 'DELIVERED_PENDING_POD' then 'DELIVERED'
    when v_to_status = 'UNDELIVERED' then 'UNDELIVERED'
    else null
  end;

  update public.drs_lines set
    attempt_count = attempt_count + 1,
    outcome = coalesce(v_line_outcome, outcome),
    outcome_at = case when v_line_outcome is not null then now() else outcome_at end,
    remarks = coalesce(nullif(btrim(coalesce(p_remark,'')),''), remarks),
    updated_by = auth.uid()
  where tenant_id = v_tenant and id = v_line.id
  returning * into v_line;

  perform app.append_shipment_event(
    v_tenant, v_ship.id, v_to_status,
    case v_to_status
      when 'DELIVERED_PENDING_POD' then 'Delivered (pending POD)'
      when 'UNDELIVERED' then 'Undelivered'
      else 'Delivery Attempted'
    end,
    jsonb_build_object(
      'drs_id', v_d.id, 'drs_no', v_d.drs_no,
      'from_status', v_from, 'remark', nullif(btrim(coalesce(p_remark,'')),'')));

  perform app.append_drs_event(
    v_tenant, v_d.id, v_to_status,
    format('AWB %s → %s', v_ship.awb_no, v_to_status),
    jsonb_build_object(
      'shipment_id', v_ship.id, 'awb_no', v_ship.awb_no,
      'from_status', v_from, 'to_status', v_to_status));

  perform app.write_audit_log(
    p_tenant_id => v_tenant, p_entity_type => 'shipments', p_action => 'MODIFY',
    p_entity_id => v_ship.id, p_module_slug => 'txn.drs-scan',
    p_new => jsonb_build_object(
      'status', v_to_status, 'awb_no', v_ship.awb_no, 'drs_id', v_d.id));

  return jsonb_build_object(
    'ok', true,
    'drs_id', v_d.id,
    'drs_no', v_d.drs_no,
    'shipment_id', v_ship.id,
    'awb_no', v_ship.awb_no,
    'from_status', v_from,
    'to_status', v_to_status,
    'line_outcome', v_line.outcome,
    'attempt_count', v_line.attempt_count
  );
end
$$;

comment on function public.mark_shipment_delivery_attempt(uuid, uuid, text, text, text) is
  'Record delivery attempt/outcome on a DISPATCHED DRS line. Pre-POD; no signature/photo.';

revoke all on function public.mark_shipment_delivery_attempt(uuid, uuid, text, text, text) from public;
grant execute on function public.mark_shipment_delivery_attempt(uuid, uuid, text, text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- complete_drs — DISPATCHED → COMPLETED (blueprint CLOSED)
-- ---------------------------------------------------------------------------
create or replace function public.complete_drs(
  p_id          uuid,
  p_row_version integer
)
returns public.drs
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_d      public.drs;
  v_cnt    integer;
  v_pending integer;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not app.user_has_permission(v_tenant, 'txn.drs-scan', 'modify') then
    raise exception 'Permission denied: txn.drs-scan modify' using errcode = '42501';
  end if;

  select * into v_d from public.drs
   where id = p_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'DRS not found' using errcode = 'P0002';
  end if;

  perform app.assert_status_transition('DRS', v_d.status, 'COMPLETED');

  select count(*) into v_cnt from public.drs_lines
   where tenant_id = v_tenant and drs_id = p_id and deleted_at is null;
  if v_cnt < 1 then
    raise exception 'Cannot complete a DRS with no shipments' using errcode = 'CMS04';
  end if;

  -- Every line must have terminal outcome (delivered or undelivered)
  select count(*) into v_pending
    from public.drs_lines dl
    join public.shipments s
      on s.tenant_id = dl.tenant_id and s.id = dl.shipment_id
   where dl.tenant_id = v_tenant
     and dl.drs_id = p_id
     and dl.deleted_at is null
     and coalesce(dl.outcome, '') not in ('DELIVERED','UNDELIVERED')
     and s.current_status not in ('DELIVERED_PENDING_POD','UNDELIVERED','DELIVERED');

  if v_pending > 0 then
    raise exception
      'Cannot complete DRS: % shipment(s) still without delivered/undelivered outcome',
      v_pending
      using errcode = 'CMS04';
  end if;

  update public.drs set
    status = 'COMPLETED',
    status_at = now(),
    completed_at = now(),
    completed_by = auth.uid(),
    is_locked = true,
    updated_by = auth.uid()
  where id = p_id and tenant_id = v_tenant and deleted_at is null
    and row_version = p_row_version
  returning * into v_d;

  if not found then
    raise exception 'This record was changed by someone else. Reload and try again.'
      using errcode = '40001';
  end if;

  perform app.append_drs_event(
    v_tenant, v_d.id, 'COMPLETED', 'DRS Completed',
    jsonb_build_object('drs_no', v_d.drs_no, 'lines', v_cnt));

  perform app.write_audit_log(
    p_tenant_id => v_tenant, p_entity_type => 'drs', p_action => 'MODIFY',
    p_entity_id => v_d.id, p_module_slug => 'txn.drs-scan',
    p_new => jsonb_build_object('drs_no', v_d.drs_no, 'status', 'COMPLETED'));

  return v_d;
end
$$;

comment on function public.complete_drs(uuid, integer) is
  'DISPATCHED→COMPLETED when every line has DELIVERED or UNDELIVERED outcome (blueprint CLOSED).';

revoke all on function public.complete_drs(uuid, integer) from public;
grant execute on function public.complete_drs(uuid, integer)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- reopen_drs — COMPLETED → DISPATCHED
-- ---------------------------------------------------------------------------
create or replace function public.reopen_drs(
  p_id          uuid,
  p_row_version integer,
  p_reason      text default null
)
returns public.drs
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_d      public.drs;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not app.user_has_permission(v_tenant, 'txn.drs-scan', 'modify') then
    raise exception 'Permission denied: txn.drs-scan modify' using errcode = '42501';
  end if;

  select * into v_d from public.drs
   where id = p_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'DRS not found' using errcode = 'P0002';
  end if;

  if v_d.status <> 'COMPLETED' then
    raise exception 'Only COMPLETED DRS can be reopened (is %)', v_d.status
      using errcode = 'CMS04';
  end if;

  perform app.assert_status_transition('DRS', v_d.status, 'DISPATCHED');

  update public.drs set
    status = 'DISPATCHED',
    status_at = now(),
    completed_at = null,
    completed_by = null,
    is_locked = true,
    updated_by = auth.uid()
  where id = p_id and tenant_id = v_tenant and deleted_at is null
    and row_version = p_row_version
  returning * into v_d;

  if not found then
    raise exception 'This record was changed by someone else. Reload and try again.'
      using errcode = '40001';
  end if;

  perform app.append_drs_event(
    v_tenant, v_d.id, 'REOPENED', 'DRS Reopened',
    jsonb_build_object(
      'drs_no', v_d.drs_no,
      'reason', nullif(btrim(coalesce(p_reason,'')),'')));

  perform app.write_audit_log(
    p_tenant_id => v_tenant, p_entity_type => 'drs', p_action => 'MODIFY',
    p_entity_id => v_d.id, p_module_slug => 'txn.drs-scan',
    p_new => jsonb_build_object('drs_no', v_d.drs_no, 'status', 'DISPATCHED', 'reopened', true));

  return v_d;
end
$$;

comment on function public.reopen_drs(uuid, integer, text) is
  'COMPLETED→DISPATCHED so further delivery outcomes can be recorded.';

revoke all on function public.reopen_drs(uuid, integer, text) from public;
grant execute on function public.reopen_drs(uuid, integer, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- get_drs_completion_board — counters for UI
-- ---------------------------------------------------------------------------
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
$$;

revoke all on function public.get_drs_completion_board(uuid) from public;
grant execute on function public.get_drs_completion_board(uuid)
  to authenticated, service_role;
