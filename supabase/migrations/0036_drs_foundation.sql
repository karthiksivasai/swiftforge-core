-- ===========================================================================
-- 0036  drs foundation — Phase 4 Milestone 4C
-- ---------------------------------------------------------------------------
-- Delivery Run Sheet aggregate only. No POD / tracking / finance / rating /
-- driver mobile / carrier APIs.
--
-- Tables: drs, drs_lines, drs_events
-- RPCs:   save_drs, dispatch_drs, cancel_drs
-- Status: DRAFT → DISPATCHED → COMPLETED; DRAFT → CANCELLED
-- Number: app.allocate_document_no(..., 'DRS', ...)
-- Slug:   txn.drs-scan
--
-- On dispatch: each MANIFEST_INSCANNED line shipment → OUT_FOR_DELIVERY
-- ===========================================================================

insert into app.status_transitions (entity_kind, from_status, to_status) values
  ('DRS','DRAFT','DISPATCHED'),
  ('DRS','DISPATCHED','COMPLETED'),
  ('DRS','DRAFT','CANCELLED'),
  ('SHIPMENT','MANIFEST_INSCANNED','OUT_FOR_DELIVERY')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- drs (aggregate root)
-- ---------------------------------------------------------------------------
create table if not exists public.drs (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants(id) on delete cascade,
  drs_no                  text not null,
  drs_date                date not null default (current_date),
  drs_time                time,
  branch_id               uuid,
  destination_id          uuid,
  delivery_executive_id   uuid,
  vehicle_no              text,
  remarks                 text,
  area_code               text,
  area_name               text,
  area_seq                text,
  status                  text not null default 'DRAFT'
                            check (status in ('DRAFT','DISPATCHED','COMPLETED','CANCELLED',
                                              'OPEN','CLOSED')),
  status_at               timestamptz not null default now(),
  is_locked               boolean not null default false,
  wizard_extras           jsonb not null default '{}'::jsonb,
  dispatched_at           timestamptz,
  dispatched_by           uuid,
  completed_at            timestamptz,
  completed_by            uuid,
  cancelled_at            timestamptz,
  cancelled_by            uuid,
  created_at              timestamptz not null default now(),
  created_by              uuid,
  updated_at              timestamptz not null default now(),
  updated_by              uuid,
  deleted_at              timestamptz,
  row_version             integer not null default 1,
  constraint drs_tenant_id_uq unique (tenant_id, id),
  constraint drs_branch_fk foreign key (tenant_id, branch_id)
    references public.branches (tenant_id, id) on delete set null,
  constraint drs_destination_fk foreign key (tenant_id, destination_id)
    references public.destinations (tenant_id, id) on delete set null,
  constraint drs_delivery_executive_fk foreign key (tenant_id, delivery_executive_id)
    references public.field_executives (tenant_id, id) on delete set null
);

create unique index if not exists drs_tenant_no_uq
  on public.drs (tenant_id, drs_no) where deleted_at is null;
create index if not exists drs_tenant_idx on public.drs (tenant_id);
create index if not exists drs_tenant_date_idx
  on public.drs (tenant_id, drs_date) where deleted_at is null;
create index if not exists drs_tenant_status_idx
  on public.drs (tenant_id, status) where deleted_at is null;
create index if not exists drs_no_trgm
  on public.drs using gin (drs_no gin_trgm_ops);

select app.attach_transaction_triggers('drs', 'txn.drs-scan');
select app.attach_transaction_policies('drs', 'txn.drs-scan');

-- ---------------------------------------------------------------------------
-- drs_lines
-- ---------------------------------------------------------------------------
create table if not exists public.drs_lines (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  drs_id            uuid not null,
  sequence_no       integer not null default 1,
  shipment_id       uuid not null,
  awb_no            text not null,
  remarks           text,
  pieces            integer not null default 1 check (pieces >= 0),
  charge_weight     numeric(14,3) not null default 0 check (charge_weight >= 0),
  book_date         date,
  origin_code       text,
  origin_name       text,
  destination_code  text,
  destination_name  text,
  customer_code     text,
  customer_name     text,
  consignee_name    text,
  eway_bill_no      text,
  shipment_value    numeric(14,2),
  created_at        timestamptz not null default now(),
  created_by        uuid,
  updated_at        timestamptz not null default now(),
  updated_by        uuid,
  deleted_at        timestamptz,
  row_version       integer not null default 1,
  constraint drs_lines_drs_fk foreign key (tenant_id, drs_id)
    references public.drs (tenant_id, id) on delete cascade,
  constraint drs_lines_shipment_fk foreign key (tenant_id, shipment_id)
    references public.shipments (tenant_id, id) on delete restrict,
  constraint drs_lines_uq unique (tenant_id, drs_id, sequence_no),
  constraint drs_lines_shipment_per_drs_uq unique (tenant_id, drs_id, shipment_id)
);

create index if not exists drs_lines_drs_idx on public.drs_lines (tenant_id, drs_id);
create index if not exists drs_lines_shipment_idx on public.drs_lines (tenant_id, shipment_id);
create index if not exists drs_lines_awb_trgm on public.drs_lines using gin (awb_no gin_trgm_ops);

-- Active assignment uniqueness enforced in app.sync_drs_lines (CMS04).

alter table public.drs_lines enable row level security;
drop policy if exists drs_lines_select on public.drs_lines;
create policy drs_lines_select on public.drs_lines
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());
drop policy if exists drs_lines_insert on public.drs_lines;
create policy drs_lines_insert on public.drs_lines
  for insert with check (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'txn.drs-scan', 'add'));
drop policy if exists drs_lines_delete on public.drs_lines;
create policy drs_lines_delete on public.drs_lines
  for delete using (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'txn.drs-scan', 'modify'));

-- ---------------------------------------------------------------------------
-- drs_events (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.drs_events (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  drs_id        uuid not null,
  event_type    text not null,
  event_text    text not null,
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  deleted_at    timestamptz,
  row_version   integer not null default 1,
  constraint drs_events_drs_fk foreign key (tenant_id, drs_id)
    references public.drs (tenant_id, id) on delete cascade
);
create index if not exists drs_events_drs_idx
  on public.drs_events (tenant_id, drs_id, created_at);

select app.attach_append_only_guard('drs_events');
select app.attach_event_policies('drs_events', 'txn.drs-scan');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function app.append_drs_event(
  p_tenant     uuid,
  p_drs        uuid,
  p_event_type text,
  p_event_text text,
  p_payload    jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
begin
  insert into public.drs_events (
    tenant_id, drs_id, event_type, event_text, payload, created_by, updated_by)
  values (
    p_tenant, p_drs, p_event_type, p_event_text,
    coalesce(p_payload, '{}'::jsonb), auth.uid(), auth.uid());
end
$$;

create or replace function app.sync_drs_lines(
  p_tenant uuid,
  p_drs    uuid,
  p_lines  jsonb
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_elem jsonb;
  v_seq  integer := 0;
  v_ship public.shipments;
  v_ship_id uuid;
  v_awb text;
  v_seen uuid[] := '{}';
begin
  delete from public.drs_lines
   where tenant_id = p_tenant and drs_id = p_drs;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    return;
  end if;

  for v_elem in select * from jsonb_array_elements(p_lines)
  loop
    v_ship_id := nullif(btrim(coalesce(v_elem->>'shipment_id','')),'')::uuid;
    v_awb := nullif(btrim(coalesce(v_elem->>'awb_no','')),'');

    if v_ship_id is not null then
      select * into v_ship from public.shipments
       where id = v_ship_id and tenant_id = p_tenant and deleted_at is null;
    elsif v_awb is not null then
      select * into v_ship from public.shipments
       where tenant_id = p_tenant and awb_no = v_awb and deleted_at is null;
    else
      raise exception 'DRS line requires shipment_id or awb_no'
        using errcode = '22023';
    end if;

    if not found then
      raise exception 'Shipment not found for DRS line'
        using errcode = 'P0002';
    end if;

    if v_ship.current_status in ('CANCELLED','VOID') then
      raise exception 'Cancelled shipments cannot be assigned to DRS (AWB %)', v_ship.awb_no
        using errcode = 'CMS04';
    end if;
    if v_ship.current_status <> 'MANIFEST_INSCANNED' then
      raise exception 'Only MANIFEST_INSCANNED shipments may be added (AWB % is %)',
        v_ship.awb_no, v_ship.current_status
        using errcode = 'CMS04';
    end if;

    if v_ship.id = any (v_seen) then
      raise exception 'Duplicate shipment on DRS (AWB %)', v_ship.awb_no
        using errcode = 'CMS04';
    end if;
    v_seen := array_append(v_seen, v_ship.id);

    if exists (
      select 1
        from public.drs_lines dl
        join public.drs d
          on d.tenant_id = dl.tenant_id and d.id = dl.drs_id
       where dl.tenant_id = p_tenant
         and dl.shipment_id = v_ship.id
         and dl.deleted_at is null
         and d.deleted_at is null
         and d.status in ('DRAFT','DISPATCHED')
         and d.id <> p_drs
    ) then
      raise exception 'Shipment already assigned to another active DRS (AWB %)', v_ship.awb_no
        using errcode = 'CMS04';
    end if;

    v_seq := v_seq + 1;
    insert into public.drs_lines (
      tenant_id, drs_id, sequence_no, shipment_id, awb_no, remarks,
      pieces, charge_weight, book_date,
      origin_code, origin_name, destination_code, destination_name,
      customer_code, customer_name, consignee_name,
      eway_bill_no, shipment_value,
      created_by, updated_by)
    values (
      p_tenant, p_drs, v_seq, v_ship.id, v_ship.awb_no,
      nullif(btrim(coalesce(v_elem->>'remarks','')),''),
      coalesce(nullif(btrim(coalesce(v_elem->>'pieces','')),'')::integer, v_ship.pieces),
      coalesce(nullif(btrim(coalesce(v_elem->>'charge_weight','')),'')::numeric, v_ship.charge_weight),
      coalesce(nullif(btrim(coalesce(v_elem->>'book_date','')),'')::date, v_ship.book_date),
      nullif(btrim(coalesce(v_elem->>'origin_code','')),''),
      nullif(btrim(coalesce(v_elem->>'origin_name','')),''),
      nullif(btrim(coalesce(v_elem->>'destination_code','')),''),
      nullif(btrim(coalesce(v_elem->>'destination_name','')),''),
      nullif(btrim(coalesce(v_elem->>'customer_code','')),''),
      nullif(btrim(coalesce(v_elem->>'customer_name','')),''),
      nullif(btrim(coalesce(v_elem->>'consignee_name','')),''),
      nullif(btrim(coalesce(v_elem->>'eway_bill_no','')),''),
      nullif(btrim(coalesce(v_elem->>'shipment_value','')),'')::numeric,
      auth.uid(), auth.uid());
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- save_drs
-- ---------------------------------------------------------------------------
create or replace function public.save_drs(
  p_id          uuid,
  p_row_version integer,
  p_fields      jsonb,
  p_lines       jsonb default '[]'::jsonb
)
returns public.drs
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_d      public.drs;
  v_alloc  record;
  v_branch uuid;
  v_fy     uuid;
  v_dest   uuid;
  v_fe     uuid;
  v_date   date;
  v_time   time;
  v_extras jsonb;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'p_fields must be a JSON object' using errcode = '22023';
  end if;

  v_branch := app.resolve_tenant_row_id(
    v_tenant, 'branches',
    nullif(btrim(coalesce(p_fields->>'branch_id','')),'')::uuid,
    p_fields->>'branch_code');
  if v_branch is null then
    select id into v_branch from public.branches
     where tenant_id = v_tenant and deleted_at is null
     order by is_head_office desc, code limit 1;
  end if;

  v_dest := app.resolve_tenant_row_id(
    v_tenant, 'destinations',
    nullif(btrim(coalesce(p_fields->>'destination_id','')),'')::uuid,
    coalesce(p_fields->>'destination_code', p_fields->>'area_code'));

  v_fe := app.resolve_tenant_row_id(
    v_tenant, 'field_executives',
    nullif(btrim(coalesce(p_fields->>'delivery_executive_id','')),'')::uuid,
    p_fields->>'delivery_executive_code');

  begin
    v_date := coalesce((p_fields->>'drs_date')::date, current_date);
  exception when others then
    raise exception 'Invalid drs_date' using errcode = '22023';
  end;
  begin
    v_time := nullif(btrim(coalesce(p_fields->>'drs_time','')),'')::time;
  exception when others then
    raise exception 'Invalid drs_time' using errcode = '22023';
  end;

  v_extras := coalesce(p_fields->'wizard_extras', '{}'::jsonb);
  if jsonb_typeof(v_extras) <> 'object' then v_extras := '{}'::jsonb; end if;

  select fy.id into v_fy
    from public.financial_years fy
   where fy.tenant_id = v_tenant and fy.deleted_at is null and fy.is_active
     and (fy.branch_id is not distinct from v_branch or fy.branch_id is null)
   order by case when fy.branch_id = v_branch then 0 else 1 end, fy.from_date desc
   limit 1;

  if p_id is null then
    if not app.user_has_permission(v_tenant, 'txn.drs-scan', 'add') then
      raise exception 'Permission denied: txn.drs-scan add' using errcode = '42501';
    end if;

    select * into v_alloc from app.allocate_document_no(v_tenant, 'DRS', v_branch, v_fy);

    insert into public.drs (
      tenant_id, drs_no, drs_date, drs_time,
      branch_id, destination_id, delivery_executive_id,
      vehicle_no, remarks, area_code, area_name, area_seq,
      status, status_at, is_locked, wizard_extras, created_by, updated_by)
    values (
      v_tenant, v_alloc.formatted_no, v_date, v_time,
      v_branch, v_dest, v_fe,
      nullif(btrim(coalesce(p_fields->>'vehicle_no','')),''),
      nullif(btrim(coalesce(p_fields->>'remarks','')),''),
      nullif(btrim(coalesce(p_fields->>'area_code','')),''),
      nullif(btrim(coalesce(p_fields->>'area_name','')),''),
      nullif(btrim(coalesce(p_fields->>'area_seq','')),''),
      'DRAFT', now(), false, v_extras, auth.uid(), auth.uid())
    returning * into v_d;

    perform app.sync_drs_lines(v_tenant, v_d.id, p_lines);

    perform app.append_drs_event(
      v_tenant, v_d.id, 'CREATED', 'DRS Created',
      jsonb_build_object('drs_no', v_d.drs_no, 'status', v_d.status));

    perform app.write_audit_log(
      p_tenant_id => v_tenant, p_entity_type => 'drs', p_action => 'ADD',
      p_entity_id => v_d.id, p_module_slug => 'txn.drs-scan',
      p_new => jsonb_build_object('drs_no', v_d.drs_no, 'status', 'DRAFT'));
  else
    if not app.user_has_permission(v_tenant, 'txn.drs-scan', 'modify') then
      raise exception 'Permission denied: txn.drs-scan modify' using errcode = '42501';
    end if;

    select * into v_d from public.drs
     where id = p_id and tenant_id = v_tenant and deleted_at is null;
    if not found then
      raise exception 'DRS not found' using errcode = 'P0002';
    end if;
    if v_d.status <> 'DRAFT' then
      raise exception 'Only DRAFT DRS can be edited' using errcode = 'CMS02';
    end if;
    if v_d.is_locked then
      raise exception 'DRS is locked' using errcode = 'CMS02';
    end if;

    update public.drs set
      drs_date = v_date,
      drs_time = v_time,
      branch_id = v_branch,
      destination_id = v_dest,
      delivery_executive_id = v_fe,
      vehicle_no = nullif(btrim(coalesce(p_fields->>'vehicle_no','')),''),
      remarks = nullif(btrim(coalesce(p_fields->>'remarks','')),''),
      area_code = nullif(btrim(coalesce(p_fields->>'area_code','')),''),
      area_name = nullif(btrim(coalesce(p_fields->>'area_name','')),''),
      area_seq = nullif(btrim(coalesce(p_fields->>'area_seq','')),''),
      wizard_extras = v_extras,
      updated_by = auth.uid()
    where id = p_id and tenant_id = v_tenant and deleted_at is null
      and row_version = p_row_version
    returning * into v_d;

    if not found then
      raise exception 'This record was changed by someone else. Reload and try again.'
        using errcode = '40001';
    end if;

    perform app.sync_drs_lines(v_tenant, v_d.id, p_lines);

    perform app.append_drs_event(
      v_tenant, v_d.id, 'UPDATED', 'DRS Updated',
      jsonb_build_object('drs_no', v_d.drs_no, 'row_version', v_d.row_version));

    perform app.write_audit_log(
      p_tenant_id => v_tenant, p_entity_type => 'drs', p_action => 'MODIFY',
      p_entity_id => v_d.id, p_module_slug => 'txn.drs-scan',
      p_new => jsonb_build_object('drs_no', v_d.drs_no, 'status', v_d.status));
  end if;

  return v_d;
end
$$;

comment on function public.save_drs(uuid, integer, jsonb, jsonb) is
  'Create/update DRAFT DRS aggregate. Allocates DRS no on insert; syncs lines.';

revoke all on function public.save_drs(uuid, integer, jsonb, jsonb) from public;
grant execute on function public.save_drs(uuid, integer, jsonb, jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- dispatch_drs — DRAFT → DISPATCHED; MANIFEST_INSCANNED → OUT_FOR_DELIVERY
-- ---------------------------------------------------------------------------
create or replace function public.dispatch_drs(
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
  v_line   public.drs_lines;
  v_ship   public.shipments;
  v_cnt    integer;
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

  perform app.assert_status_transition('DRS', v_d.status, 'DISPATCHED');

  if v_d.delivery_executive_id is null then
    raise exception 'Delivery executive is required to dispatch' using errcode = 'CMS04';
  end if;

  select count(*) into v_cnt from public.drs_lines
   where tenant_id = v_tenant and drs_id = p_id and deleted_at is null;
  if v_cnt < 1 then
    raise exception 'Cannot dispatch a DRS with no shipments' using errcode = 'CMS04';
  end if;

  update public.drs set
    status = 'DISPATCHED',
    status_at = now(),
    dispatched_at = now(),
    dispatched_by = auth.uid(),
    is_locked = true,
    updated_by = auth.uid()
  where id = p_id and tenant_id = v_tenant and deleted_at is null
    and row_version = p_row_version
  returning * into v_d;

  if not found then
    raise exception 'This record was changed by someone else. Reload and try again.'
      using errcode = '40001';
  end if;

  for v_line in
    select * from public.drs_lines
     where tenant_id = v_tenant and drs_id = p_id and deleted_at is null
     order by sequence_no
  loop
    select * into v_ship from public.shipments
     where id = v_line.shipment_id and tenant_id = v_tenant and deleted_at is null
     for update;
    if not found then
      raise exception 'Shipment missing on DRS line' using errcode = 'P0002';
    end if;
    if v_ship.current_status <> 'MANIFEST_INSCANNED' then
      raise exception 'Shipment % must be MANIFEST_INSCANNED to dispatch (is %)',
        v_ship.awb_no, v_ship.current_status
        using errcode = 'CMS04';
    end if;

    perform app.assert_status_transition('SHIPMENT', v_ship.current_status, 'OUT_FOR_DELIVERY');

    update public.shipments set
      current_status = 'OUT_FOR_DELIVERY',
      status_at = now(),
      updated_by = auth.uid()
    where id = v_ship.id and tenant_id = v_tenant;

    perform app.append_shipment_event(
      v_tenant, v_ship.id, 'OUT_FOR_DELIVERY', 'Out for Delivery (DRS Dispatched)',
      jsonb_build_object('drs_id', v_d.id, 'drs_no', v_d.drs_no));
  end loop;

  perform app.append_drs_event(
    v_tenant, v_d.id, 'DISPATCHED', 'DRS Dispatched',
    jsonb_build_object('drs_no', v_d.drs_no, 'lines', v_cnt));

  perform app.write_audit_log(
    p_tenant_id => v_tenant, p_entity_type => 'drs', p_action => 'MODIFY',
    p_entity_id => v_d.id, p_module_slug => 'txn.drs-scan',
    p_new => jsonb_build_object('drs_no', v_d.drs_no, 'status', 'DISPATCHED'));

  return v_d;
end
$$;

comment on function public.dispatch_drs(uuid, integer) is
  'DRAFT→DISPATCHED; each MANIFEST_INSCANNED line → OUT_FOR_DELIVERY.';

revoke all on function public.dispatch_drs(uuid, integer) from public;
grant execute on function public.dispatch_drs(uuid, integer)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- cancel_drs — DRAFT only; unassign lines
-- ---------------------------------------------------------------------------
create or replace function public.cancel_drs(
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
  if not (app.user_has_permission(v_tenant, 'txn.drs-scan', 'modify')
       or app.user_has_permission(v_tenant, 'txn.drs-scan', 'delete')) then
    raise exception 'Permission denied: txn.drs-scan' using errcode = '42501';
  end if;

  select * into v_d from public.drs
   where id = p_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'DRS not found' using errcode = 'P0002';
  end if;

  if v_d.status <> 'DRAFT' then
    raise exception 'Only DRAFT DRS can be cancelled (is %)', v_d.status
      using errcode = 'CMS04';
  end if;

  perform app.assert_status_transition('DRS', v_d.status, 'CANCELLED');

  -- unassign shipments (replace-sync clear)
  delete from public.drs_lines
   where tenant_id = v_tenant and drs_id = p_id;

  update public.drs set
    status = 'CANCELLED',
    status_at = now(),
    cancelled_at = now(),
    cancelled_by = auth.uid(),
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
    v_tenant, v_d.id, 'CANCELLED', 'DRS Cancelled',
    jsonb_build_object(
      'drs_no', v_d.drs_no,
      'reason', nullif(btrim(coalesce(p_reason,'')),'')));

  perform app.write_audit_log(
    p_tenant_id => v_tenant, p_entity_type => 'drs', p_action => 'MODIFY',
    p_entity_id => v_d.id, p_module_slug => 'txn.drs-scan',
    p_new => jsonb_build_object('drs_no', v_d.drs_no, 'status', 'CANCELLED'));

  return v_d;
end
$$;

comment on function public.cancel_drs(uuid, integer, text) is
  'Cancel DRAFT DRS only; clears lines (unassign).';

revoke all on function public.cancel_drs(uuid, integer, text) from public;
grant execute on function public.cancel_drs(uuid, integer, text)
  to authenticated, service_role;

-- Extend lookup with active DRS (preserve all prior keys incl. field-executive)
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

  elsif p_key = 'area' then
    return query
      select a.id, a.name, a.name, null::text
      from public.areas a
      where a.tenant_id in (select app.user_tenant_ids())
        and a.deleted_at is null
        and a.name ilike v_pat
      order by a.name, a.id
      limit v_limit;

  -- --------------------------- CATALOG (0018) ------------------------
  elsif p_key = 'product-type' then
    return query
      select pt.id, pt.code, pt.name, null::text
      from public.product_types pt
      where pt.tenant_id in (select app.user_tenant_ids())
        and pt.deleted_at is null
        and (pt.name ilike v_pat or pt.code ilike v_pat)
      order by pt.name, pt.code, pt.id
      limit v_limit;

  elsif p_key = 'product' then
    return query
      select pr.id, pr.code, coalesce(nullif(pr.name, ''), pr.code), pr.shipment_type
      from public.products pr
      where pr.tenant_id in (select app.user_tenant_ids())
        and pr.deleted_at is null
        and pr.status = 'ACTIVE'
        and (pr.name ilike v_pat or pr.code ilike v_pat)
      order by pr.name, pr.code, pr.id
      limit v_limit;

  -- --------------------------- CATALOG (0019) ------------------------
  elsif p_key = 'charge' then
    return query
      select ch.id, ch.code, ch.name, ch.charge_type
      from public.charges ch
      where ch.tenant_id in (select app.user_tenant_ids())
        and ch.deleted_at is null
        and (ch.name ilike v_pat or ch.code ilike v_pat)
      order by ch.name, ch.code, ch.id
      limit v_limit;

  elsif p_key = 'airline' then
    return query
      select al.id, al.name, al.name, null::text
      from public.airlines al
      where al.tenant_id in (select app.user_tenant_ids())
        and al.deleted_at is null
        and al.name ilike v_pat
      order by al.name, al.id
      limit v_limit;

  -- --------------------------- CATALOG (0020) ------------------------
  elsif p_key = 'service-center' then
    return query
      select sc.id, sc.code, sc.name, sc.branch
      from public.service_centers sc
      where sc.tenant_id in (select app.user_tenant_ids())
        and sc.deleted_at is null
        and (sc.name ilike v_pat or sc.code ilike v_pat)
      order by sc.name, sc.code, sc.id
      limit v_limit;

  elsif p_key = 'field-executive' then
    return query
      select fe.id, fe.code, fe.name, fe.mobile
      from public.field_executives fe
      where fe.tenant_id in (select app.user_tenant_ids())
        and fe.deleted_at is null
        and fe.in_active = false
        and (fe.name ilike v_pat or fe.code ilike v_pat)
      order by fe.name, fe.code, fe.id
      limit v_limit;

  -- --------------------------- PARTY (0022) ------------------------
  elsif p_key = 'consignee' then
    return query
      select c.id, c.code, c.name, c.city
      from public.consignees c
      where c.tenant_id in (select app.user_tenant_ids())
        and c.deleted_at is null
        and c.status = 'ACTIVE'
        and (c.name ilike v_pat or c.code ilike v_pat)
      order by c.name, c.code, c.id
      limit v_limit;

  elsif p_key = 'shipper' then
    return query
      select s.id, s.code, s.name, s.city
      from public.shippers s
      where s.tenant_id in (select app.user_tenant_ids())
        and s.deleted_at is null
        and s.status = 'ACTIVE'
        and (s.name ilike v_pat or s.code ilike v_pat)
      order by s.name, s.code, s.id
      limit v_limit;

  -- ---------------------- CUSTOMER AGGREGATE (0023) --------------------
  elsif p_key = 'customer' then
    return query
      select c.id, c.code, c.name, c.branch
      from public.customers c
      where c.tenant_id in (select app.user_tenant_ids())
        and c.deleted_at is null
        and c.status = 'ACTIVE'
        and (c.name ilike v_pat or c.code ilike v_pat)
      order by c.name, c.code, c.id
      limit v_limit;

  -- ---------------------- VENDOR AGGREGATE (0025) --------------------
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

  elsif p_key = 'bank' then
    return query
      select b.id, b.code, b.name, null::text
      from public.banks b
      where b.tenant_id in (select app.user_tenant_ids())
        and b.deleted_at is null
        and b.status = 'ACTIVE'
        and (b.name ilike v_pat or b.code ilike v_pat)
      order by b.name, b.code, b.id
      limit v_limit;

  elsif p_key = 'branch' then
    return query
      select br.id, br.code, br.name, br.sub_name
      from public.branches br
      where br.tenant_id in (select app.user_tenant_ids())
        and br.deleted_at is null
        and br.status = 'ACTIVE'
        and (br.name ilike v_pat or br.code ilike v_pat)
      order by br.name, br.code, br.id
      limit v_limit;

  elsif p_key = 'local-branch' then
    return query
      select lb.id, lb.code, lb.name, lb.city
      from public.local_branches lb
      where lb.tenant_id in (select app.user_tenant_ids())
        and lb.deleted_at is null
        and lb.status = 'ACTIVE'
        and (lb.name ilike v_pat or lb.code ilike v_pat)
      order by lb.name, lb.code, lb.id
      limit v_limit;

  elsif p_key = 'sales-executive' then
    return query
      select se.id, se.code, se.name, null::text
      from public.sales_executives se
      where se.tenant_id in (select app.user_tenant_ids())
        and se.deleted_at is null
        and (se.name ilike v_pat or se.code ilike v_pat)
      order by se.name, se.code, se.id
      limit v_limit;

  elsif p_key = 'manifest' then
    return query
      select m.id, m.manifest_no, coalesce(m.connect_station, m.location_code, m.manifest_no),
             m.status
      from public.manifests m
      where m.tenant_id in (select app.user_tenant_ids())
        and m.deleted_at is null
        and m.status = 'CLOSED'
        and (m.manifest_no ilike v_pat
             or coalesce(m.master_awb_no,'') ilike v_pat
             or coalesce(m.cd_no,'') ilike v_pat
             or coalesce(m.connect_station,'') ilike v_pat)
      order by m.manifest_date desc, m.manifest_no, m.id
      limit v_limit;


  elsif p_key = 'drs' then
    return query
      select d.id, d.drs_no, coalesce(fe.name, d.drs_no),
             d.status
      from public.drs d
      left join public.field_executives fe
        on fe.tenant_id = d.tenant_id and fe.id = d.delivery_executive_id and fe.deleted_at is null
      where d.tenant_id in (select app.user_tenant_ids())
        and d.deleted_at is null
        and d.status in ('DRAFT','DISPATCHED')
        and (d.drs_no ilike v_pat
             or coalesce(d.vehicle_no,'') ilike v_pat
             or coalesce(d.remarks,'') ilike v_pat
             or coalesce(fe.code,'') ilike v_pat
             or coalesce(fe.name,'') ilike v_pat)
      order by d.drs_date desc, d.drs_no, d.id
      limit v_limit;

  else
    raise exception 'Unknown lookup key: %', p_key using errcode = '22023';
  end if;
end
$$;




comment on function public.lookup(text, text, integer) is
  'Shared tenant-safe autocomplete. Includes field-executive and drs (0036). Trigram ILIKE search, stable order, limit clamped to [1,200].';
