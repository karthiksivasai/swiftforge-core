-- ===========================================================================
-- 0038  pod foundation — Phase 4 Milestone 4E
-- ---------------------------------------------------------------------------
-- Proof of Delivery only. No file upload storage, GPS, mobile capture,
-- tracking UI suite, bagging, finance, or rating.
--
-- Blueprint §2.8 pod_records + shipment POD denormalized fields.
-- tracking_events created minimally so POD can append customer-visible events
-- (full Tracking milestone deferred).
--
-- Status: DELIVERED_PENDING_POD → DELIVERED (save_pod)
--         DELIVERED → DELIVERED_PENDING_POD (cancel_pod)
-- Slug:   txn.pod-entry-ok-update
-- ===========================================================================

insert into app.status_transitions (entity_kind, from_status, to_status) values
  ('SHIPMENT','DELIVERED_PENDING_POD','DELIVERED'),
  ('SHIPMENT','DELIVERED','DELIVERED_PENDING_POD')
on conflict do nothing;

-- Blueprint shipment POD denormalized fields (01-database-design §2.8)
alter table public.shipments
  add column if not exists receiver text,
  add column if not exists pod_status text,
  add column if not exists pod_date date,
  add column if not exists pod_receiver text,
  add column if not exists pod_remark text,
  add column if not exists delivered_at timestamptz,
  add column if not exists pod_user_id uuid;

-- ---------------------------------------------------------------------------
-- tracking_events (append-only; blueprint §2.8 — minimal for POD writes)
-- ---------------------------------------------------------------------------
create table if not exists public.tracking_events (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  shipment_id   uuid not null,
  event_date    date not null default (current_date),
  event_time    time,
  branch_id     uuid,
  exception_id  uuid,
  status_text   text not null,
  remark        text,
  user_id       uuid,
  source        text not null default 'SYSTEM'
                  check (source in ('SYSTEM','MANUAL','CARRIER_API','IMPORT')),
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  deleted_at    timestamptz,
  row_version   integer not null default 1,
  constraint tracking_events_shipment_fk foreign key (tenant_id, shipment_id)
    references public.shipments (tenant_id, id) on delete cascade,
  constraint tracking_events_branch_fk foreign key (tenant_id, branch_id)
    references public.branches (tenant_id, id) on delete set null
);

create index if not exists tracking_events_shipment_idx
  on public.tracking_events (tenant_id, shipment_id, created_at);
create index if not exists tracking_events_tenant_date_idx
  on public.tracking_events (tenant_id, event_date);

select app.attach_append_only_guard('tracking_events');
select app.attach_event_policies('tracking_events', 'txn.pod-entry-ok-update');

create or replace function app.append_tracking_event(
  p_tenant      uuid,
  p_shipment    uuid,
  p_status_text text,
  p_remark      text default null,
  p_source      text default 'SYSTEM',
  p_payload     jsonb default '{}'::jsonb,
  p_branch_id   uuid default null
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
    tenant_id, shipment_id, event_date, event_time, branch_id,
    status_text, remark, user_id, source, payload, created_by, updated_by)
  values (
    p_tenant, p_shipment, current_date, (now()::time), p_branch_id,
    p_status_text, nullif(btrim(coalesce(p_remark,'')),''),
    auth.uid(), v_src, coalesce(p_payload, '{}'::jsonb),
    auth.uid(), auth.uid())
  returning id into v_id;
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------
-- pod_records (blueprint §2.8)
-- ---------------------------------------------------------------------------
create table if not exists public.pod_records (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  shipment_id         uuid not null,
  awb_no              text not null,
  pod_date            date not null default (current_date),
  receiver_name       text not null,
  remark              text,
  status              text not null default 'DELIVERED'
                        check (status in ('DELIVERED','IN_TRANSIT','PENDING')),
  signature_file_id   uuid references public.files(id) on delete set null,
  photo_file_id       uuid references public.files(id) on delete set null,
  source              text not null default 'MANUAL'
                        check (source in ('DRS','IMPORT','MOBILE','MANUAL')),
  created_at          timestamptz not null default now(),
  created_by          uuid,
  updated_at          timestamptz not null default now(),
  updated_by          uuid,
  deleted_at          timestamptz,
  row_version         integer not null default 1,
  constraint pod_records_tenant_id_uq unique (tenant_id, id),
  constraint pod_records_shipment_fk foreign key (tenant_id, shipment_id)
    references public.shipments (tenant_id, id) on delete restrict
);

create unique index if not exists pod_records_active_shipment_uq
  on public.pod_records (tenant_id, shipment_id)
  where deleted_at is null and status = 'DELIVERED';

create index if not exists pod_records_tenant_idx on public.pod_records (tenant_id);
create index if not exists pod_records_shipment_idx
  on public.pod_records (tenant_id, shipment_id);
create index if not exists pod_records_awb_trgm
  on public.pod_records using gin (awb_no gin_trgm_ops);

select app.attach_transaction_triggers('pod_records', 'txn.pod-entry-ok-update');
select app.attach_transaction_policies('pod_records', 'txn.pod-entry-ok-update');

create or replace function public.save_pod(
  p_shipment_id uuid default null,
  p_awb_no      text default null,
  p_fields      jsonb default '{}'::jsonb
)
returns public.pod_records
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_ship   public.shipments;
  v_pod    public.pod_records;
  v_date   date;
  v_recv   text;
  v_remark text;
  v_status text;
  v_source text;
  v_sig    uuid;
  v_photo  uuid;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not (app.user_has_permission(v_tenant, 'txn.pod-entry-ok-update', 'add')
       or app.user_has_permission(v_tenant, 'txn.pod-entry-ok-update', 'modify')) then
    raise exception 'Permission denied: txn.pod-entry-ok-update' using errcode = '42501';
  end if;

  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'p_fields must be a JSON object' using errcode = '22023';
  end if;

  if p_shipment_id is not null then
    select * into v_ship from public.shipments
     where id = p_shipment_id and tenant_id = v_tenant and deleted_at is null
     for update;
  elsif nullif(btrim(coalesce(p_awb_no,'')),'') is not null then
    select * into v_ship from public.shipments
     where tenant_id = v_tenant and awb_no = btrim(p_awb_no) and deleted_at is null
     for update;
  else
    raise exception 'shipment_id or awb_no is required' using errcode = '22023';
  end if;

  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;

  if v_ship.current_status in ('CANCELLED','VOID') then
    raise exception 'Cancelled shipments cannot receive POD (AWB %)', v_ship.awb_no
      using errcode = 'CMS04';
  end if;

  if v_ship.current_status <> 'DELIVERED_PENDING_POD' then
    raise exception 'Shipment must be DELIVERED_PENDING_POD to save POD (AWB % is %)',
      v_ship.awb_no, v_ship.current_status
      using errcode = 'CMS04';
  end if;

  if exists (
    select 1 from public.pod_records p
     where p.tenant_id = v_tenant
       and p.shipment_id = v_ship.id
       and p.deleted_at is null
       and p.status = 'DELIVERED'
  ) then
    raise exception 'POD already exists for AWB %', v_ship.awb_no
      using errcode = 'CMS04';
  end if;

  begin
    v_date := coalesce((p_fields->>'pod_date')::date, current_date);
  exception when others then
    raise exception 'Invalid pod_date' using errcode = '22023';
  end;

  v_recv := nullif(btrim(coalesce(p_fields->>'receiver_name','')),'');
  if v_recv is null then
    raise exception 'Receiver name is required' using errcode = 'CMS04';
  end if;
  v_remark := nullif(btrim(coalesce(p_fields->>'remark','')),'');
  v_status := 'DELIVERED';

  v_source := upper(coalesce(nullif(btrim(p_fields->>'source'),''), 'MANUAL'));
  if v_source not in ('DRS','IMPORT','MOBILE','MANUAL') then
    v_source := 'MANUAL';
  end if;

  v_sig := nullif(btrim(coalesce(p_fields->>'signature_file_id','')),'')::uuid;
  v_photo := nullif(btrim(coalesce(p_fields->>'photo_file_id','')),'')::uuid;

  if v_sig is not null and not exists (
    select 1 from public.files f
     where f.id = v_sig and f.tenant_id = v_tenant and f.deleted_at is null
  ) then
    raise exception 'signature_file_id not found' using errcode = '22023';
  end if;
  if v_photo is not null and not exists (
    select 1 from public.files f
     where f.id = v_photo and f.tenant_id = v_tenant and f.deleted_at is null
  ) then
    raise exception 'photo_file_id not found' using errcode = '22023';
  end if;

  perform app.assert_status_transition('SHIPMENT', v_ship.current_status, 'DELIVERED');

  insert into public.pod_records (
    tenant_id, shipment_id, awb_no, pod_date, receiver_name, remark, status,
    signature_file_id, photo_file_id, source, created_by, updated_by)
  values (
    v_tenant, v_ship.id, v_ship.awb_no, v_date, v_recv, v_remark, v_status,
    v_sig, v_photo, v_source, auth.uid(), auth.uid())
  returning * into v_pod;

  update public.shipments set
    current_status = 'DELIVERED',
    status_at = now(),
    receiver = v_recv,
    pod_receiver = v_recv,
    pod_date = v_date,
    pod_remark = v_remark,
    pod_status = 'DELIVERED',
    delivered_at = now(),
    pod_user_id = auth.uid(),
    updated_by = auth.uid()
  where id = v_ship.id and tenant_id = v_tenant;

  perform app.append_shipment_event(
    v_tenant, v_ship.id, 'DELIVERED', 'POD Recorded — Delivered',
    jsonb_build_object(
      'pod_id', v_pod.id, 'receiver_name', v_recv, 'pod_date', v_date));

  perform app.append_tracking_event(
    v_tenant, v_ship.id, 'Delivered',
    coalesce(v_remark, format('Received by %s', v_recv)),
    'SYSTEM',
    jsonb_build_object('pod_id', v_pod.id, 'source', v_source),
    v_ship.branch_id);

  perform app.write_audit_log(
    p_tenant_id => v_tenant, p_entity_type => 'pod_records', p_action => 'ADD',
    p_entity_id => v_pod.id, p_module_slug => 'txn.pod-entry-ok-update',
    p_new => jsonb_build_object(
      'awb_no', v_ship.awb_no, 'status', 'DELIVERED', 'receiver_name', v_recv));

  return v_pod;
end
$$;

comment on function public.save_pod(uuid, text, jsonb) is
  'Create POD for DELIVERED_PENDING_POD shipment; transitions to DELIVERED.';

revoke all on function public.save_pod(uuid, text, jsonb) from public;
grant execute on function public.save_pod(uuid, text, jsonb)
  to authenticated, service_role;

create or replace function public.update_pod(
  p_id          uuid,
  p_row_version integer,
  p_fields      jsonb
)
returns public.pod_records
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_pod    public.pod_records;
  v_ship   public.shipments;
  v_date   date;
  v_recv   text;
  v_remark text;
  v_sig    uuid;
  v_photo  uuid;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not app.user_has_permission(v_tenant, 'txn.pod-entry-ok-update', 'modify') then
    raise exception 'Permission denied: txn.pod-entry-ok-update modify' using errcode = '42501';
  end if;

  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'p_fields must be a JSON object' using errcode = '22023';
  end if;

  select * into v_pod from public.pod_records
   where id = p_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'POD not found' using errcode = 'P0002';
  end if;
  if v_pod.status <> 'DELIVERED' then
    raise exception 'Only DELIVERED POD records can be updated (is %)', v_pod.status
      using errcode = 'CMS04';
  end if;

  select * into v_ship from public.shipments
   where id = v_pod.shipment_id and tenant_id = v_tenant and deleted_at is null
   for update;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;
  if v_ship.current_status <> 'DELIVERED' then
    raise exception 'Shipment must remain DELIVERED to update POD (is %)',
      v_ship.current_status
      using errcode = 'CMS04';
  end if;

  begin
    v_date := coalesce((p_fields->>'pod_date')::date, v_pod.pod_date);
  exception when others then
    raise exception 'Invalid pod_date' using errcode = '22023';
  end;
  v_recv := coalesce(
    nullif(btrim(coalesce(p_fields->>'receiver_name','')),''),
    v_pod.receiver_name);
  v_remark := case
    when p_fields ? 'remark' then nullif(btrim(coalesce(p_fields->>'remark','')),'')
    else v_pod.remark
  end;
  v_sig := case
    when p_fields ? 'signature_file_id'
      then nullif(btrim(coalesce(p_fields->>'signature_file_id','')),'')::uuid
    else v_pod.signature_file_id
  end;
  v_photo := case
    when p_fields ? 'photo_file_id'
      then nullif(btrim(coalesce(p_fields->>'photo_file_id','')),'')::uuid
    else v_pod.photo_file_id
  end;

  update public.pod_records set
    pod_date = v_date,
    receiver_name = v_recv,
    remark = v_remark,
    signature_file_id = v_sig,
    photo_file_id = v_photo,
    updated_by = auth.uid()
  where id = p_id and tenant_id = v_tenant and deleted_at is null
    and row_version = p_row_version
  returning * into v_pod;

  if not found then
    raise exception 'This record was changed by someone else. Reload and try again.'
      using errcode = '40001';
  end if;

  update public.shipments set
    receiver = v_recv,
    pod_receiver = v_recv,
    pod_date = v_date,
    pod_remark = v_remark,
    updated_by = auth.uid()
  where id = v_ship.id and tenant_id = v_tenant;

  perform app.append_shipment_event(
    v_tenant, v_ship.id, 'POD_UPDATED', 'POD Updated',
    jsonb_build_object('pod_id', v_pod.id, 'receiver_name', v_recv));

  perform app.append_tracking_event(
    v_tenant, v_ship.id, 'POD Updated',
    coalesce(v_remark, format('Receiver: %s', v_recv)),
    'SYSTEM',
    jsonb_build_object('pod_id', v_pod.id),
    v_ship.branch_id);

  perform app.write_audit_log(
    p_tenant_id => v_tenant, p_entity_type => 'pod_records', p_action => 'MODIFY',
    p_entity_id => v_pod.id, p_module_slug => 'txn.pod-entry-ok-update',
    p_new => jsonb_build_object(
      'awb_no', v_pod.awb_no, 'receiver_name', v_recv, 'pod_date', v_date));

  return v_pod;
end
$$;

comment on function public.update_pod(uuid, integer, jsonb) is
  'Update DELIVERED POD fields (txn.pod-entry-ok-update). Optimistic lock.';

revoke all on function public.update_pod(uuid, integer, jsonb) from public;
grant execute on function public.update_pod(uuid, integer, jsonb)
  to authenticated, service_role;

create or replace function public.cancel_pod(
  p_id          uuid,
  p_row_version integer,
  p_reason      text default null
)
returns public.pod_records
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_pod    public.pod_records;
  v_ship   public.shipments;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not (app.user_has_permission(v_tenant, 'txn.pod-entry-ok-update', 'modify')
       or app.user_has_permission(v_tenant, 'txn.pod-entry-ok-update', 'delete')) then
    raise exception 'Permission denied: txn.pod-entry-ok-update' using errcode = '42501';
  end if;

  select * into v_pod from public.pod_records
   where id = p_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'POD not found' using errcode = 'P0002';
  end if;
  if v_pod.status <> 'DELIVERED' then
    raise exception 'Only DELIVERED POD can be cancelled (is %)', v_pod.status
      using errcode = 'CMS04';
  end if;

  select * into v_ship from public.shipments
   where id = v_pod.shipment_id and tenant_id = v_tenant and deleted_at is null
   for update;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;
  if v_ship.current_status <> 'DELIVERED' then
    raise exception 'Shipment must be DELIVERED to cancel POD (is %)',
      v_ship.current_status
      using errcode = 'CMS04';
  end if;

  perform app.assert_status_transition('SHIPMENT', v_ship.current_status, 'DELIVERED_PENDING_POD');

  update public.pod_records set
    status = 'PENDING',
    remark = case
      when nullif(btrim(coalesce(p_reason,'')),'') is null then remark
      else coalesce(remark || ' | ', '') || 'Cancelled: ' || btrim(p_reason)
    end,
    updated_by = auth.uid()
  where id = p_id and tenant_id = v_tenant and deleted_at is null
    and row_version = p_row_version
  returning * into v_pod;

  if not found then
    raise exception 'This record was changed by someone else. Reload and try again.'
      using errcode = '40001';
  end if;

  update public.shipments set
    current_status = 'DELIVERED_PENDING_POD',
    status_at = now(),
    delivered_at = null,
    pod_status = 'PENDING',
    updated_by = auth.uid()
  where id = v_ship.id and tenant_id = v_tenant;

  perform app.append_shipment_event(
    v_tenant, v_ship.id, 'POD_CANCELLED', 'POD Cancelled — reverted to pending POD',
    jsonb_build_object(
      'pod_id', v_pod.id,
      'reason', nullif(btrim(coalesce(p_reason,'')),'')));

  perform app.append_tracking_event(
    v_tenant, v_ship.id, 'POD Cancelled',
    coalesce(nullif(btrim(coalesce(p_reason,'')),''), 'POD cancelled'),
    'SYSTEM',
    jsonb_build_object('pod_id', v_pod.id),
    v_ship.branch_id);

  perform app.write_audit_log(
    p_tenant_id => v_tenant, p_entity_type => 'pod_records', p_action => 'MODIFY',
    p_entity_id => v_pod.id, p_module_slug => 'txn.pod-entry-ok-update',
    p_new => jsonb_build_object(
      'awb_no', v_pod.awb_no, 'status', 'PENDING', 'cancelled', true));

  return v_pod;
end
$$;

comment on function public.cancel_pod(uuid, integer, text) is
  'Cancel DELIVERED POD → PENDING; shipment DELIVERED → DELIVERED_PENDING_POD. History retained.';

revoke all on function public.cancel_pod(uuid, integer, text) from public;
grant execute on function public.cancel_pod(uuid, integer, text)
  to authenticated, service_role;

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
$$;

revoke all on function public.get_pod_by_awb(text) from public;
grant execute on function public.get_pod_by_awb(text)
  to authenticated, service_role;
