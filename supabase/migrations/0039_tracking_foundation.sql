-- ===========================================================================
-- 0039  tracking foundation — Phase 4 Milestone 4F
-- ---------------------------------------------------------------------------
-- Internal shipment timeline + tracking operations only.
-- No carrier APIs, public tracking enhancements, finance, rating, reports,
-- notifications, entry-lock, or file upload storage.
--
-- Reuses: tracking_events, shipment_events, shipment_comments (0032/0038)
-- Creates: shipment_holds
-- RPCs: get_shipment_tracking, add_tracking_progress, add_tracking_comment,
--       hold_shipment, release_shipment_hold
-- Slugs: txn.awb-query, txn.progress-comments-update, txn.awb-hold-unhold
-- ===========================================================================

-- Extend append_tracking_event for exception / dated progress (replace prior overload)
drop function if exists app.append_tracking_event(uuid, uuid, text, text, text, jsonb, uuid);
drop function if exists app.append_tracking_event(uuid, uuid, text, text, text, jsonb, uuid, uuid, date, time);

create or replace function app.append_tracking_event(
  p_tenant        uuid,
  p_shipment      uuid,
  p_status_text   text,
  p_remark        text default null,
  p_source        text default 'SYSTEM',
  p_payload       jsonb default '{}'::jsonb,
  p_branch_id     uuid default null,
  p_exception_id  uuid default null,
  p_event_date    date default null,
  p_event_time    time default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_id uuid;
  v_src text := upper(coalesce(nullif(btrim(p_source),''), 'SYSTEM'));
begin
  if v_src not in ('SYSTEM','MANUAL','CARRIER_API','IMPORT') then
    v_src := 'SYSTEM';
  end if;
  insert into public.tracking_events (
    tenant_id, shipment_id, event_date, event_time, branch_id, exception_id,
    status_text, remark, user_id, source, payload, created_by, updated_by)
  values (
    p_tenant, p_shipment,
    coalesce(p_event_date, current_date),
    coalesce(p_event_time, (now()::time)),
    p_branch_id, p_exception_id,
    p_status_text, nullif(btrim(coalesce(p_remark,'')),''),
    auth.uid(), v_src, coalesce(p_payload, '{}'::jsonb),
    auth.uid(), auth.uid())
  returning id into v_id;
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------
-- shipment_holds (blueprint §2.8) — append-only operational hold history
-- ---------------------------------------------------------------------------
create table if not exists public.shipment_holds (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  shipment_id     uuid not null,
  action          text not null check (action in ('HOLD','RELEASE')),
  remark          text,
  shipper_email   text,
  mail_sent       boolean not null default false,
  user_id         uuid,
  at              timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  deleted_at      timestamptz,
  row_version     integer not null default 1,
  constraint shipment_holds_shipment_fk foreign key (tenant_id, shipment_id)
    references public.shipments (tenant_id, id) on delete cascade
);

create index if not exists shipment_holds_shipment_idx
  on public.shipment_holds (tenant_id, shipment_id, at desc);
create index if not exists shipment_holds_tenant_idx
  on public.shipment_holds (tenant_id);

select app.attach_append_only_guard('shipment_holds');
select app.attach_event_policies('shipment_holds', 'txn.awb-hold-unhold');

-- Ensure shipment_comments insert allowed for tracking progress module too
-- (RPCs are SECURITY DEFINER; policies kept for direct access consistency)
drop policy if exists shipment_comments_insert on public.shipment_comments;
create policy shipment_comments_insert on public.shipment_comments
  for insert with check (
    tenant_id in (select app.user_tenant_ids())
    and (
      app.user_has_permission(tenant_id, 'txn.awb-entry', 'add')
      or app.user_has_permission(tenant_id, 'txn.progress-comments-update', 'add')
      or app.user_has_permission(tenant_id, 'txn.awb-query-comment-update', 'add')
    ));

-- ---------------------------------------------------------------------------
-- get_shipment_tracking — shipment 360 timeline
-- ---------------------------------------------------------------------------
create or replace function public.get_shipment_tracking(p_awb_no text)
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
  v_summary jsonb;
  v_tracking jsonb;
  v_events jsonb;
  v_comments jsonb;
  v_holds jsonb;
  v_pod_json jsonb;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not (app.user_has_permission(v_tenant, 'txn.awb-query', 'list')
       or app.user_has_permission(v_tenant, 'txn.awb-query', 'search')
       or app.user_has_permission(v_tenant, 'txn.awb-query', 'add')
       or app.user_has_permission(v_tenant, 'txn.progress-comments-update', 'list')
       or app.user_has_permission(v_tenant, 'txn.progress-comments-update', 'add')) then
    raise exception 'Permission denied: txn.awb-query' using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_awb_no,'')),'') is null then
    return jsonb_build_object('found', false);
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

  select jsonb_build_object(
    'id', v_ship.id,
    'awb_no', v_ship.awb_no,
    'row_version', v_ship.row_version,
    'current_status', v_ship.current_status,
    'status_at', v_ship.status_at,
    'is_hold', v_ship.is_hold,
    'is_locked', v_ship.is_locked,
    'book_date', v_ship.book_date,
    'pieces', v_ship.pieces,
    'actual_weight', v_ship.actual_weight,
    'vol_weight', v_ship.vol_weight,
    'charge_weight', v_ship.charge_weight,
    'shipment_value', v_ship.shipment_value,
    'customer_code', c.code,
    'customer_name', c.name,
    'origin_code', o.code,
    'origin_name', o.name,
    'destination_code', d.code,
    'destination_name', d.name,
    'product_code', p.code,
    'product_name', p.name,
    'shipper', v_ship.shipper,
    'consignee', v_ship.consignee,
    'shipper_name', coalesce(v_ship.shipper->>'name',''),
    'consignee_name', coalesce(v_ship.consignee->>'name',''),
    'forwarding_awb', v_ship.forwarding_awb,
    'delivery_awb', v_ship.delivery_awb,
    'return_awb', v_ship.return_awb,
    'flight_no', v_ship.flight_no,
    'airline', v_ship.airline,
    'service', v_ship.service,
    'payment_type', v_ship.payment_type,
    'reference_no', v_ship.reference_no,
    'content', v_ship.content,
    'instruction', v_ship.instruction,
    'pod_status', v_ship.pod_status,
    'pod_date', v_ship.pod_date,
    'pod_receiver', v_ship.pod_receiver,
    'pod_remark', v_ship.pod_remark,
    'delivered_at', v_ship.delivered_at,
    'receiver', v_ship.receiver
  )
  into v_summary
  from (select 1) _
  left join public.customers c
    on c.id = v_ship.customer_id and c.tenant_id = v_tenant
  left join public.destinations o
    on o.id = v_ship.origin_destination_id and o.tenant_id = v_tenant
  left join public.destinations d
    on d.id = v_ship.destination_id and d.tenant_id = v_tenant
  left join public.products p
    on p.id = v_ship.product_id and p.tenant_id = v_tenant;

  select coalesce(jsonb_agg(x.obj order by x.ord), '[]'::jsonb)
    into v_tracking
  from (
    select te.created_at as ord, jsonb_build_object(
      'id', te.id,
      'event_date', te.event_date,
      'event_time', te.event_time,
      'status_text', te.status_text,
      'remark', te.remark,
      'source', te.source,
      'branch_id', te.branch_id,
      'exception_id', te.exception_id,
      'user_id', te.user_id,
      'created_at', te.created_at,
      'payload', te.payload
    ) as obj
    from public.tracking_events te
    where te.tenant_id = v_tenant and te.shipment_id = v_ship.id and te.deleted_at is null
  ) x;

  select coalesce(jsonb_agg(x.obj order by x.ord), '[]'::jsonb)
    into v_events
  from (
    select se.created_at as ord, jsonb_build_object(
      'id', se.id,
      'event_type', se.event_type,
      'event_text', se.event_text,
      'payload', se.payload,
      'created_at', se.created_at,
      'created_by', se.created_by
    ) as obj
    from public.shipment_events se
    where se.tenant_id = v_tenant and se.shipment_id = v_ship.id and se.deleted_at is null
  ) x;

  select coalesce(jsonb_agg(x.obj order by x.ord), '[]'::jsonb)
    into v_comments
  from (
    select sc.commented_at as ord, jsonb_build_object(
      'id', sc.id,
      'seq', sc.seq,
      'comment', sc.comment,
      'file_id', sc.file_id,
      'commented_at', sc.commented_at,
      'created_by', sc.created_by,
      'row_version', sc.row_version
    ) as obj
    from public.shipment_comments sc
    where sc.tenant_id = v_tenant and sc.shipment_id = v_ship.id and sc.deleted_at is null
  ) x;

  select coalesce(jsonb_agg(x.obj order by x.ord), '[]'::jsonb)
    into v_holds
  from (
    select sh.at as ord, jsonb_build_object(
      'id', sh.id,
      'action', sh.action,
      'remark', sh.remark,
      'shipper_email', sh.shipper_email,
      'mail_sent', sh.mail_sent,
      'user_id', sh.user_id,
      'at', sh.at
    ) as obj
    from public.shipment_holds sh
    where sh.tenant_id = v_tenant and sh.shipment_id = v_ship.id and sh.deleted_at is null
  ) x;

  if v_pod.id is null then
    v_pod_json := null;
  else
    v_pod_json := jsonb_build_object(
      'id', v_pod.id,
      'pod_date', v_pod.pod_date,
      'receiver_name', v_pod.receiver_name,
      'remark', v_pod.remark,
      'status', v_pod.status,
      'signature_file_id', v_pod.signature_file_id,
      'photo_file_id', v_pod.photo_file_id,
      'source', v_pod.source,
      'row_version', v_pod.row_version
    );
  end if;

  return jsonb_build_object(
    'found', true,
    'awb_no', v_ship.awb_no,
    'shipment', v_summary,
    'current_status', v_ship.current_status,
    'is_hold', v_ship.is_hold,
    'tracking_events', v_tracking,
    'shipment_events', v_events,
    'comments', v_comments,
    'holds', v_holds,
    'pod', v_pod_json
  );
end
$$;

comment on function public.get_shipment_tracking(text) is
  'Shipment 360 timeline: summary, tracking/shipment events, POD, comments, holds.';

revoke all on function public.get_shipment_tracking(text) from public;
grant execute on function public.get_shipment_tracking(text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- add_tracking_progress
-- ---------------------------------------------------------------------------
create or replace function public.add_tracking_progress(
  p_awb_no text,
  p_fields jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_ship public.shipments;
  v_exc public.delivery_exceptions;
  v_branch uuid;
  v_date date;
  v_time time;
  v_remark text;
  v_status_text text;
  v_to_status text;
  v_allow_delivered boolean;
  v_tev uuid;
  v_sev uuid;
  v_from text;
  v_raw text;
  v_digits text;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not (app.user_has_permission(v_tenant, 'txn.progress-comments-update', 'add')
       or app.user_has_permission(v_tenant, 'txn.progress-comments-update', 'modify')
       or app.user_has_permission(v_tenant, 'txn.awb-query-progress-update', 'add')
       or app.user_has_permission(v_tenant, 'txn.awb-query-progress-update', 'modify')) then
    raise exception 'Permission denied: txn.progress-comments-update' using errcode = '42501';
  end if;

  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'p_fields must be a JSON object' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_awb_no,'')),'') is null then
    raise exception 'AWB No is required' using errcode = '22023';
  end if;

  select * into v_ship from public.shipments
   where tenant_id = v_tenant and awb_no = btrim(p_awb_no) and deleted_at is null
   for update;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;

  if v_ship.current_status in ('CANCELLED','VOID') then
    raise exception 'Cancelled/void shipments cannot receive progress (AWB %)', v_ship.awb_no
      using errcode = 'CMS04';
  end if;

  v_allow_delivered := coalesce((p_fields->>'allow_if_delivered')::boolean, false);
  if v_ship.current_status = 'DELIVERED' and not v_allow_delivered then
    raise exception 'Progress on delivered shipments requires allow_if_delivered (AWB %)',
      v_ship.awb_no using errcode = 'CMS04';
  end if;

  begin
    v_date := coalesce((p_fields->>'event_date')::date, (p_fields->>'date')::date, current_date);
  exception when others then
    raise exception 'Invalid event date' using errcode = '22023';
  end;

  begin
    v_raw := coalesce(
      nullif(btrim(coalesce(p_fields->>'event_time','')),''),
      nullif(btrim(coalesce(p_fields->>'time','')),''));
    if v_raw is null then
      v_time := (now()::time);
    else
      v_digits := regexp_replace(v_raw, '[^0-9]', '', 'g');
      if length(v_digits) = 4 then
        v_time := (substr(v_digits, 1, 2) || ':' || substr(v_digits, 3, 2) || ':00')::time;
      else
        v_time := v_raw::time;
      end if;
    end if;
  exception when others then
    raise exception 'Invalid event time' using errcode = '22023';
  end;

  v_remark := nullif(btrim(coalesce(p_fields->>'remark','')),'');

  if nullif(btrim(coalesce(p_fields->>'exception_id','')),'') is not null then
    select * into v_exc from public.delivery_exceptions
     where id = (p_fields->>'exception_id')::uuid
       and tenant_id = v_tenant and deleted_at is null;
  elsif nullif(btrim(coalesce(p_fields->>'exception_code','')),'') is not null then
    select * into v_exc from public.delivery_exceptions
     where tenant_id = v_tenant
       and code = upper(btrim(p_fields->>'exception_code'))
       and deleted_at is null;
  end if;

  if nullif(btrim(coalesce(p_fields->>'branch_id','')),'') is not null then
    v_branch := (p_fields->>'branch_id')::uuid;
  elsif nullif(btrim(coalesce(p_fields->>'branch_code','')),'') is not null then
    select b.id into v_branch from public.branches b
     where b.tenant_id = v_tenant and b.code = btrim(p_fields->>'branch_code')
       and b.deleted_at is null;
  elsif nullif(btrim(coalesce(p_fields->>'service_center_code','')),'') is not null then
    select b.id into v_branch from public.branches b
     where b.tenant_id = v_tenant
       and b.code = btrim(p_fields->>'service_center_code')
       and b.deleted_at is null;
  end if;

  v_status_text := coalesce(
    nullif(btrim(coalesce(p_fields->>'status_text','')),''),
    nullif(btrim(coalesce(v_exc.name,'')),''),
    nullif(btrim(coalesce(v_exc.code,'')),''),
    'Progress Update');

  v_to_status := upper(nullif(btrim(coalesce(p_fields->>'to_status','')),''));
  if v_to_status is null and v_exc.code is not null
     and exists (
       select 1 from app.status_transitions st
        where st.entity_kind = 'SHIPMENT'
          and st.from_status = v_ship.current_status
          and st.to_status = upper(v_exc.code)
     ) then
    v_to_status := upper(v_exc.code);
  end if;

  v_from := v_ship.current_status;

  if v_to_status is not null and v_to_status is distinct from v_ship.current_status then
    if v_ship.is_hold then
      raise exception 'Held shipments cannot change status until released (AWB %)',
        v_ship.awb_no using errcode = 'CMS04';
    end if;
    if v_ship.current_status = 'DELIVERED' and not v_allow_delivered then
      raise exception 'Status change on delivered shipment requires allow_if_delivered'
        using errcode = 'CMS04';
    end if;
    perform app.assert_status_transition('SHIPMENT', v_ship.current_status, v_to_status);
    update public.shipments set
      current_status = v_to_status,
      status_at = now(),
      updated_by = auth.uid()
    where id = v_ship.id and tenant_id = v_tenant;
    v_ship.current_status := v_to_status;
  end if;

  v_tev := app.append_tracking_event(
    v_tenant, v_ship.id, v_status_text, v_remark, 'MANUAL',
    jsonb_build_object(
      'awb_no', v_ship.awb_no,
      'from_status', v_from,
      'to_status', v_to_status,
      'exception_code', v_exc.code,
      'service_center_code', nullif(btrim(coalesce(p_fields->>'service_center_code','')),'')),
    v_branch, v_exc.id, v_date, v_time);

  v_sev := app.append_shipment_event(
    v_tenant, v_ship.id, 'PROGRESS',
    coalesce(v_status_text, 'Progress Update'),
    jsonb_build_object(
      'tracking_event_id', v_tev,
      'from_status', v_from,
      'to_status', coalesce(v_to_status, v_from),
      'remark', v_remark));

  perform app.write_audit_log(
    p_tenant_id => v_tenant, p_entity_type => 'shipments', p_action => 'MODIFY',
    p_entity_id => v_ship.id, p_module_slug => 'txn.progress-comments-update',
    p_new => jsonb_build_object(
      'awb_no', v_ship.awb_no, 'progress', v_status_text,
      'from_status', v_from, 'to_status', coalesce(v_to_status, v_from)));

  return jsonb_build_object(
    'ok', true,
    'awb_no', v_ship.awb_no,
    'shipment_id', v_ship.id,
    'from_status', v_from,
    'to_status', v_ship.current_status,
    'status_text', v_status_text,
    'tracking_event_id', v_tev,
    'shipment_event_id', v_sev,
    'row_version', (select row_version from public.shipments where id = v_ship.id)
  );
end
$$;

comment on function public.add_tracking_progress(text, jsonb) is
  'Append tracking progress; optional status transition via assert_status_transition.';

revoke all on function public.add_tracking_progress(text, jsonb) from public;
grant execute on function public.add_tracking_progress(text, jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- add_tracking_comment
-- ---------------------------------------------------------------------------
create or replace function public.add_tracking_comment(
  p_awb_no text,
  p_fields jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_ship public.shipments;
  v_comment text;
  v_file uuid;
  v_seq integer;
  v_id uuid;
  v_at timestamptz;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not (app.user_has_permission(v_tenant, 'txn.progress-comments-update', 'add')
       or app.user_has_permission(v_tenant, 'txn.progress-comments-update', 'modify')
       or app.user_has_permission(v_tenant, 'txn.awb-query-comment-update', 'add')
       or app.user_has_permission(v_tenant, 'txn.awb-query-comment-update', 'modify')) then
    raise exception 'Permission denied: txn.progress-comments-update' using errcode = '42501';
  end if;

  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'p_fields must be a JSON object' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_awb_no,'')),'') is null then
    raise exception 'AWB No is required' using errcode = '22023';
  end if;

  select * into v_ship from public.shipments
   where tenant_id = v_tenant and awb_no = btrim(p_awb_no) and deleted_at is null
   for update;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;

  v_comment := nullif(btrim(coalesce(p_fields->>'comment','')),'');
  if v_comment is null then
    raise exception 'Comment is required' using errcode = 'CMS04';
  end if;

  v_file := nullif(btrim(coalesce(p_fields->>'file_id','')),'')::uuid;
  if v_file is not null and not exists (
    select 1 from public.files f
     where f.id = v_file and f.tenant_id = v_tenant and f.deleted_at is null
  ) then
    raise exception 'file_id not found' using errcode = '22023';
  end if;

  begin
    v_at := coalesce((p_fields->>'commented_at')::timestamptz, now());
  exception when others then
    v_at := now();
  end;

  select coalesce(max(seq), 0) + 1 into v_seq
    from public.shipment_comments
   where tenant_id = v_tenant and shipment_id = v_ship.id;

  insert into public.shipment_comments (
    tenant_id, shipment_id, seq, comment, file_id, commented_at, created_by, updated_by)
  values (
    v_tenant, v_ship.id, v_seq, v_comment, v_file, v_at, auth.uid(), auth.uid())
  returning id into v_id;

  perform app.append_shipment_event(
    v_tenant, v_ship.id, 'COMMENT', left(v_comment, 200),
    jsonb_build_object('comment_id', v_id, 'file_id', v_file));

  perform app.append_tracking_event(
    v_tenant, v_ship.id, 'Comment', left(v_comment, 200), 'MANUAL',
    jsonb_build_object('comment_id', v_id),
    v_ship.branch_id);

  perform app.write_audit_log(
    p_tenant_id => v_tenant, p_entity_type => 'shipment_comments', p_action => 'ADD',
    p_entity_id => v_id, p_module_slug => 'txn.progress-comments-update',
    p_new => jsonb_build_object('awb_no', v_ship.awb_no, 'comment', v_comment));

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'awb_no', v_ship.awb_no,
    'shipment_id', v_ship.id,
    'seq', v_seq,
    'comment', v_comment,
    'file_id', v_file,
    'commented_at', v_at
  );
end
$$;

comment on function public.add_tracking_comment(text, jsonb) is
  'Append-only shipment comment (file_id optional; no upload).';

revoke all on function public.add_tracking_comment(text, jsonb) from public;
grant execute on function public.add_tracking_comment(text, jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- hold_shipment
-- ---------------------------------------------------------------------------
create or replace function public.hold_shipment(
  p_awb_no      text,
  p_row_version integer,
  p_fields      jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_ship public.shipments;
  v_hold public.shipment_holds;
  v_remark text;
  v_email text;
  v_mail boolean;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not (app.user_has_permission(v_tenant, 'txn.awb-hold-unhold', 'add')
       or app.user_has_permission(v_tenant, 'txn.awb-hold-unhold', 'modify')) then
    raise exception 'Permission denied: txn.awb-hold-unhold' using errcode = '42501';
  end if;

  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'p_fields must be a JSON object' using errcode = '22023';
  end if;

  select * into v_ship from public.shipments
   where tenant_id = v_tenant and awb_no = btrim(p_awb_no) and deleted_at is null;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;
  if v_ship.current_status in ('CANCELLED','VOID') then
    raise exception 'Cannot hold cancelled/void shipment' using errcode = 'CMS04';
  end if;
  if v_ship.is_hold then
    raise exception 'Shipment is already on hold (AWB %)', v_ship.awb_no
      using errcode = 'CMS04';
  end if;

  v_remark := nullif(btrim(coalesce(p_fields->>'remark','')),'');
  v_email := nullif(btrim(coalesce(p_fields->>'shipper_email','')),'');
  v_mail := coalesce((p_fields->>'send_mail')::boolean, false);

  update public.shipments set
    is_hold = true,
    updated_by = auth.uid()
  where id = v_ship.id and tenant_id = v_tenant and deleted_at is null
    and row_version = p_row_version
  returning * into v_ship;

  if not found then
    raise exception 'This record was changed by someone else. Reload and try again.'
      using errcode = '40001';
  end if;

  insert into public.shipment_holds (
    tenant_id, shipment_id, action, remark, shipper_email, mail_sent,
    user_id, at, created_by, updated_by)
  values (
    v_tenant, v_ship.id, 'HOLD', v_remark, v_email, v_mail,
    auth.uid(), now(), auth.uid(), auth.uid())
  returning * into v_hold;

  perform app.append_shipment_event(
    v_tenant, v_ship.id, 'HOLD', coalesce(v_remark, 'Shipment held'),
    jsonb_build_object('hold_id', v_hold.id));

  perform app.append_tracking_event(
    v_tenant, v_ship.id, 'On Hold', coalesce(v_remark, 'Shipment held'), 'MANUAL',
    jsonb_build_object('hold_id', v_hold.id, 'action', 'HOLD'),
    v_ship.branch_id);

  perform app.write_audit_log(
    p_tenant_id => v_tenant, p_entity_type => 'shipment_holds', p_action => 'ADD',
    p_entity_id => v_hold.id, p_module_slug => 'txn.awb-hold-unhold',
    p_new => jsonb_build_object('awb_no', v_ship.awb_no, 'action', 'HOLD'));

  return jsonb_build_object(
    'ok', true,
    'action', 'HOLD',
    'awb_no', v_ship.awb_no,
    'shipment_id', v_ship.id,
    'is_hold', true,
    'hold_id', v_hold.id,
    'row_version', v_ship.row_version,
    'current_status', v_ship.current_status
  );
end
$$;

comment on function public.hold_shipment(text, integer, jsonb) is
  'Place shipment on hold; append hold/tracking/shipment events. Optimistic lock.';

revoke all on function public.hold_shipment(text, integer, jsonb) from public;
grant execute on function public.hold_shipment(text, integer, jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- release_shipment_hold
-- ---------------------------------------------------------------------------
create or replace function public.release_shipment_hold(
  p_awb_no      text,
  p_row_version integer,
  p_fields      jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_ship public.shipments;
  v_hold public.shipment_holds;
  v_remark text;
  v_email text;
  v_mail boolean;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not (app.user_has_permission(v_tenant, 'txn.awb-hold-unhold', 'add')
       or app.user_has_permission(v_tenant, 'txn.awb-hold-unhold', 'modify')) then
    raise exception 'Permission denied: txn.awb-hold-unhold' using errcode = '42501';
  end if;

  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'p_fields must be a JSON object' using errcode = '22023';
  end if;

  select * into v_ship from public.shipments
   where tenant_id = v_tenant and awb_no = btrim(p_awb_no) and deleted_at is null;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;
  if not v_ship.is_hold then
    raise exception 'Shipment is not on hold (AWB %)', v_ship.awb_no
      using errcode = 'CMS04';
  end if;

  v_remark := nullif(btrim(coalesce(p_fields->>'remark','')),'');
  v_email := nullif(btrim(coalesce(p_fields->>'shipper_email','')),'');
  v_mail := coalesce((p_fields->>'send_mail')::boolean, false);

  update public.shipments set
    is_hold = false,
    updated_by = auth.uid()
  where id = v_ship.id and tenant_id = v_tenant and deleted_at is null
    and row_version = p_row_version
  returning * into v_ship;

  if not found then
    raise exception 'This record was changed by someone else. Reload and try again.'
      using errcode = '40001';
  end if;

  insert into public.shipment_holds (
    tenant_id, shipment_id, action, remark, shipper_email, mail_sent,
    user_id, at, created_by, updated_by)
  values (
    v_tenant, v_ship.id, 'RELEASE', v_remark, v_email, v_mail,
    auth.uid(), now(), auth.uid(), auth.uid())
  returning * into v_hold;

  perform app.append_shipment_event(
    v_tenant, v_ship.id, 'RELEASE', coalesce(v_remark, 'Shipment hold released'),
    jsonb_build_object('hold_id', v_hold.id));

  perform app.append_tracking_event(
    v_tenant, v_ship.id, 'Hold Released', coalesce(v_remark, 'Shipment hold released'),
    'MANUAL',
    jsonb_build_object('hold_id', v_hold.id, 'action', 'RELEASE'),
    v_ship.branch_id);

  perform app.write_audit_log(
    p_tenant_id => v_tenant, p_entity_type => 'shipment_holds', p_action => 'ADD',
    p_entity_id => v_hold.id, p_module_slug => 'txn.awb-hold-unhold',
    p_new => jsonb_build_object('awb_no', v_ship.awb_no, 'action', 'RELEASE'));

  return jsonb_build_object(
    'ok', true,
    'action', 'RELEASE',
    'awb_no', v_ship.awb_no,
    'shipment_id', v_ship.id,
    'is_hold', false,
    'hold_id', v_hold.id,
    'row_version', v_ship.row_version,
    'current_status', v_ship.current_status
  );
end
$$;

comment on function public.release_shipment_hold(text, integer, jsonb) is
  'Release shipment hold; append RELEASE history. Never deletes prior holds.';

revoke all on function public.release_shipment_hold(text, integer, jsonb) from public;
grant execute on function public.release_shipment_hold(text, integer, jsonb)
  to authenticated, service_role;
