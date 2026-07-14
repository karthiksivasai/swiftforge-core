-- ===========================================================================
-- 0034  manifest foundation — Phase 4 Milestone 4A
-- ---------------------------------------------------------------------------
-- Manifest aggregate only. No inscan / DRS / tracking / finance / rating.
--
-- Tables: manifests, manifest_lines, manifest_comments, manifest_attachments,
--         manifest_events
-- RPCs:   save_manifest, close_manifest, cancel_manifest
-- Status: DRAFT → CLOSED → CANCELLED (via app.assert_status_transition)
-- Number: app.allocate_document_no(..., 'MANIFEST', ...)
-- Slug:   txn.manifest-scan
--
-- On close: each BOOKED line shipment → MANIFESTED (+ shipment event).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Status machine extensions (foundation lifecycle + BOOKED→MANIFESTED)
-- ---------------------------------------------------------------------------
insert into app.status_transitions (entity_kind, from_status, to_status) values
  ('MANIFEST','DRAFT','CLOSED'),
  ('MANIFEST','DRAFT','CANCELLED'),
  ('MANIFEST','CLOSED','CANCELLED'),
  ('SHIPMENT','BOOKED','MANIFESTED'),
  -- allow unmanifest when a CLOSED manifest is cancelled
  ('SHIPMENT','MANIFESTED','BOOKED')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- manifests (aggregate root)
-- ---------------------------------------------------------------------------
create table if not exists public.manifests (
  id                         uuid primary key default gen_random_uuid(),
  tenant_id                  uuid not null references public.tenants(id) on delete cascade,
  manifest_no                text not null,
  manifest_kind              text not null default 'OUTBOUND'
                               check (manifest_kind in ('OUTBOUND','BAGGING','OBC')),
  manifest_date              date not null default (current_date),
  manifest_time              time,
  to_type                    text not null default 'SERVICE_CENTER'
                               check (to_type in ('SERVICE_CENTER','THIRD_PARTY')),
  to_service_center_id       uuid,
  vendor_id                  uuid,
  origin_branch_id           uuid,
  location_code              text,
  connect_station            text,
  master_awb_no              text,
  cd_no                      text,
  obc_name                   text,
  total_bags                 integer not null default 0 check (total_bags >= 0),
  vendor_weight              numeric(14,3) not null default 0 check (vendor_weight >= 0),
  reference_no               text,
  flight1                    text,
  flight2                    text,
  departure                  text,
  arrival                    text,
  remark                     text,
  flight                     text,
  status                     text not null default 'DRAFT'
                               check (status in ('DRAFT','CLOSED','CANCELLED',
                                                 'OPEN','DISPATCHED','ARRIVED')),
  status_at                  timestamptz not null default now(),
  is_locked                  boolean not null default false,
  wizard_extras              jsonb not null default '{}'::jsonb,
  closed_at                  timestamptz,
  closed_by                  uuid,
  cancelled_at               timestamptz,
  cancelled_by               uuid,
  created_at                 timestamptz not null default now(),
  created_by                 uuid,
  updated_at                 timestamptz not null default now(),
  updated_by                 uuid,
  deleted_at                 timestamptz,
  row_version                integer not null default 1,
  constraint manifests_tenant_id_uq unique (tenant_id, id),
  constraint manifests_to_sc_fk foreign key (tenant_id, to_service_center_id)
    references public.service_centers (tenant_id, id) on delete set null,
  constraint manifests_vendor_fk foreign key (tenant_id, vendor_id)
    references public.vendors (tenant_id, id) on delete set null,
  constraint manifests_origin_branch_fk foreign key (tenant_id, origin_branch_id)
    references public.branches (tenant_id, id) on delete set null
);

create unique index if not exists manifests_tenant_no_uq
  on public.manifests (tenant_id, manifest_no) where deleted_at is null;
create index if not exists manifests_tenant_idx on public.manifests (tenant_id);
create index if not exists manifests_tenant_date_idx
  on public.manifests (tenant_id, manifest_date) where deleted_at is null;
create index if not exists manifests_tenant_status_idx
  on public.manifests (tenant_id, status) where deleted_at is null;
create index if not exists manifests_no_trgm
  on public.manifests using gin (manifest_no gin_trgm_ops);

select app.attach_transaction_triggers('manifests', 'txn.manifest-scan');
select app.attach_transaction_policies('manifests', 'txn.manifest-scan');

-- ---------------------------------------------------------------------------
-- manifest_lines (1:N — replace sync; one shipment per line)
-- ---------------------------------------------------------------------------
create table if not exists public.manifest_lines (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  manifest_id       uuid not null,
  seq               integer not null default 1,
  shipment_id       uuid not null,
  awb_no            text not null,
  forwarding_no     text,
  bag_no            text,
  crn_mhbs_no       text,
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
  instruction       text,
  reference_no      text,
  added_at          timestamptz not null default now(),
  added_by          uuid,
  created_at        timestamptz not null default now(),
  created_by        uuid,
  updated_at        timestamptz not null default now(),
  updated_by        uuid,
  deleted_at        timestamptz,
  row_version       integer not null default 1,
  constraint manifest_lines_manifest_fk foreign key (tenant_id, manifest_id)
    references public.manifests (tenant_id, id) on delete cascade,
  constraint manifest_lines_shipment_fk foreign key (tenant_id, shipment_id)
    references public.shipments (tenant_id, id) on delete restrict,
  constraint manifest_lines_uq unique (tenant_id, manifest_id, seq),
  constraint manifest_lines_shipment_per_manifest_uq unique (tenant_id, manifest_id, shipment_id)
);

create index if not exists manifest_lines_manifest_idx
  on public.manifest_lines (tenant_id, manifest_id);
create index if not exists manifest_lines_shipment_idx
  on public.manifest_lines (tenant_id, shipment_id);
create index if not exists manifest_lines_awb_trgm
  on public.manifest_lines using gin (awb_no gin_trgm_ops);

alter table public.manifest_lines enable row level security;
drop policy if exists manifest_lines_select on public.manifest_lines;
create policy manifest_lines_select on public.manifest_lines
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());
drop policy if exists manifest_lines_insert on public.manifest_lines;
create policy manifest_lines_insert on public.manifest_lines
  for insert with check (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'txn.manifest-scan', 'add'));
drop policy if exists manifest_lines_delete on public.manifest_lines;
create policy manifest_lines_delete on public.manifest_lines
  for delete using (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'txn.manifest-scan', 'modify'));

-- ---------------------------------------------------------------------------
-- manifest_comments
-- ---------------------------------------------------------------------------
create table if not exists public.manifest_comments (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  manifest_id   uuid not null,
  seq           integer not null default 1,
  comment       text not null,
  file_id       uuid,
  commented_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  deleted_at    timestamptz,
  row_version   integer not null default 1,
  constraint manifest_comments_manifest_fk foreign key (tenant_id, manifest_id)
    references public.manifests (tenant_id, id) on delete cascade,
  constraint manifest_comments_uq unique (tenant_id, manifest_id, seq)
);
create index if not exists manifest_comments_manifest_idx
  on public.manifest_comments (tenant_id, manifest_id);

alter table public.manifest_comments enable row level security;
drop policy if exists manifest_comments_select on public.manifest_comments;
create policy manifest_comments_select on public.manifest_comments
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());
drop policy if exists manifest_comments_insert on public.manifest_comments;
create policy manifest_comments_insert on public.manifest_comments
  for insert with check (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'txn.manifest-scan', 'add'));
drop policy if exists manifest_comments_delete on public.manifest_comments;
create policy manifest_comments_delete on public.manifest_comments
  for delete using (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'txn.manifest-scan', 'modify'));

-- ---------------------------------------------------------------------------
-- manifest_attachments
-- ---------------------------------------------------------------------------
create table if not exists public.manifest_attachments (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  manifest_id   uuid not null,
  seq           integer not null default 1,
  file_id       uuid not null,
  label         text,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  deleted_at    timestamptz,
  row_version   integer not null default 1,
  constraint manifest_attachments_manifest_fk foreign key (tenant_id, manifest_id)
    references public.manifests (tenant_id, id) on delete cascade,
  constraint manifest_attachments_uq unique (tenant_id, manifest_id, seq)
);
create index if not exists manifest_attachments_manifest_idx
  on public.manifest_attachments (tenant_id, manifest_id);

alter table public.manifest_attachments enable row level security;
drop policy if exists manifest_attachments_select on public.manifest_attachments;
create policy manifest_attachments_select on public.manifest_attachments
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());
drop policy if exists manifest_attachments_insert on public.manifest_attachments;
create policy manifest_attachments_insert on public.manifest_attachments
  for insert with check (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'txn.manifest-scan', 'add'));
drop policy if exists manifest_attachments_delete on public.manifest_attachments;
create policy manifest_attachments_delete on public.manifest_attachments
  for delete using (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'txn.manifest-scan', 'modify'));

-- ---------------------------------------------------------------------------
-- manifest_events (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.manifest_events (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  manifest_id   uuid not null,
  event_type    text not null,
  event_text    text not null,
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  deleted_at    timestamptz,
  row_version   integer not null default 1,
  constraint manifest_events_manifest_fk foreign key (tenant_id, manifest_id)
    references public.manifests (tenant_id, id) on delete cascade
);
create index if not exists manifest_events_manifest_idx
  on public.manifest_events (tenant_id, manifest_id, created_at);

select app.attach_append_only_guard('manifest_events');
select app.attach_event_policies('manifest_events', 'txn.manifest-scan');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function app.append_manifest_event(
  p_tenant     uuid,
  p_manifest   uuid,
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
  insert into public.manifest_events (
    tenant_id, manifest_id, event_type, event_text, payload, created_by, updated_by)
  values (
    p_tenant, p_manifest, p_event_type, p_event_text,
    coalesce(p_payload, '{}'::jsonb), auth.uid(), auth.uid());
end
$$;

create or replace function app.sync_manifest_comments(
  p_tenant uuid,
  p_manifest uuid,
  p_comments jsonb
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_elem jsonb;
  v_seq  integer := 0;
begin
  delete from public.manifest_comments
   where tenant_id = p_tenant and manifest_id = p_manifest;

  if p_comments is null or jsonb_typeof(p_comments) <> 'array' then
    return;
  end if;

  for v_elem in select * from jsonb_array_elements(p_comments)
  loop
    if coalesce(btrim(v_elem->>'comment'), '') = '' then
      continue;
    end if;
    v_seq := v_seq + 1;
    insert into public.manifest_comments (
      tenant_id, manifest_id, seq, comment, file_id, commented_at, created_by, updated_by)
    values (
      p_tenant, p_manifest, v_seq, btrim(v_elem->>'comment'),
      nullif(btrim(coalesce(v_elem->>'file_id','')),'')::uuid,
      coalesce(nullif(btrim(coalesce(v_elem->>'commented_at','')),'')::timestamptz, now()),
      auth.uid(), auth.uid());
  end loop;
end
$$;

create or replace function app.sync_manifest_attachments(
  p_tenant uuid,
  p_manifest uuid,
  p_attachments jsonb
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_elem jsonb;
  v_seq  integer := 0;
  v_file uuid;
begin
  delete from public.manifest_attachments
   where tenant_id = p_tenant and manifest_id = p_manifest;

  if p_attachments is null or jsonb_typeof(p_attachments) <> 'array' then
    return;
  end if;

  for v_elem in select * from jsonb_array_elements(p_attachments)
  loop
    v_file := nullif(btrim(coalesce(v_elem->>'file_id','')),'')::uuid;
    if v_file is null then
      continue;
    end if;
    if not exists (
      select 1 from public.files f
       where f.id = v_file and f.tenant_id = p_tenant and f.deleted_at is null
    ) then
      raise exception 'Attachment file % not found in tenant', v_file
        using errcode = '22023';
    end if;
    v_seq := v_seq + 1;
    insert into public.manifest_attachments (
      tenant_id, manifest_id, seq, file_id, label, created_by, updated_by)
    values (
      p_tenant, p_manifest, v_seq, v_file,
      nullif(btrim(coalesce(v_elem->>'label','')),''),
      auth.uid(), auth.uid());

    update public.files
       set owner_type = 'MANIFEST', owner_id = p_manifest, updated_by = auth.uid()
     where id = v_file and tenant_id = p_tenant;
  end loop;
end
$$;

create or replace function app.sync_manifest_lines(
  p_tenant uuid,
  p_manifest uuid,
  p_lines jsonb
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
  delete from public.manifest_lines
   where tenant_id = p_tenant and manifest_id = p_manifest;

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
      raise exception 'Manifest line requires shipment_id or awb_no'
        using errcode = '22023';
    end if;

    if not found then
      raise exception 'Shipment not found for manifest line'
        using errcode = 'P0002';
    end if;

    if v_ship.current_status = 'DRAFT' then
      raise exception 'DRAFT shipments cannot be manifested (AWB %)', v_ship.awb_no
        using errcode = 'CMS04';
    end if;
    if v_ship.current_status = 'CANCELLED' or v_ship.current_status = 'VOID' then
      raise exception 'Cancelled shipments cannot be manifested (AWB %)', v_ship.awb_no
        using errcode = 'CMS04';
    end if;
    if v_ship.current_status <> 'BOOKED' then
      raise exception 'Only BOOKED shipments may be added (AWB % is %)',
        v_ship.awb_no, v_ship.current_status
        using errcode = 'CMS04';
    end if;

    if v_ship.id = any (v_seen) then
      raise exception 'Duplicate shipment on manifest (AWB %)', v_ship.awb_no
        using errcode = 'CMS04';
    end if;
    v_seen := array_append(v_seen, v_ship.id);

    if exists (
      select 1
        from public.manifest_lines ml
        join public.manifests m
          on m.tenant_id = ml.tenant_id and m.id = ml.manifest_id
       where ml.tenant_id = p_tenant
         and ml.shipment_id = v_ship.id
         and ml.deleted_at is null
         and m.deleted_at is null
         and m.status <> 'CANCELLED'
         and m.id <> p_manifest
    ) then
      raise exception 'Shipment already manifested (AWB %)', v_ship.awb_no
        using errcode = 'CMS04';
    end if;

    v_seq := v_seq + 1;
    insert into public.manifest_lines (
      tenant_id, manifest_id, seq, shipment_id, awb_no,
      forwarding_no, bag_no, crn_mhbs_no, pieces, charge_weight, book_date,
      origin_code, origin_name, destination_code, destination_name,
      customer_code, customer_name, consignee_name, instruction, reference_no,
      added_by, created_by, updated_by)
    values (
      p_tenant, p_manifest, v_seq, v_ship.id, v_ship.awb_no,
      coalesce(nullif(btrim(coalesce(v_elem->>'forwarding_no','')),''), v_ship.forwarding_awb),
      nullif(btrim(coalesce(v_elem->>'bag_no','')),''),
      nullif(btrim(coalesce(v_elem->>'crn_mhbs_no','')),''),
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
      coalesce(nullif(btrim(coalesce(v_elem->>'instruction','')),''), v_ship.instruction),
      coalesce(nullif(btrim(coalesce(v_elem->>'reference_no','')),''), v_ship.reference_no),
      auth.uid(), auth.uid(), auth.uid());
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- save_manifest
-- ---------------------------------------------------------------------------
create or replace function public.save_manifest(
  p_id          uuid,
  p_row_version integer,
  p_fields      jsonb,
  p_lines       jsonb default '[]'::jsonb,
  p_comments    jsonb default '[]'::jsonb,
  p_attachments jsonb default '[]'::jsonb
)
returns public.manifests
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_m      public.manifests;
  v_alloc  record;
  v_branch uuid;
  v_fy     uuid;
  v_sc     uuid;
  v_vendor uuid;
  v_date   date;
  v_time   time;
  v_to_type text;
  v_kind   text;
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
    nullif(btrim(coalesce(p_fields->>'origin_branch_id','')),'')::uuid,
    p_fields->>'branch_code');
  if v_branch is null then
    select id into v_branch from public.branches
     where tenant_id = v_tenant and deleted_at is null
     order by is_head_office desc, code limit 1;
  end if;

  v_sc := app.resolve_tenant_row_id(
    v_tenant, 'service_centers',
    nullif(btrim(coalesce(p_fields->>'to_service_center_id','')),'')::uuid,
    p_fields->>'to_service_center_code');
  v_vendor := app.resolve_tenant_row_id(
    v_tenant, 'vendors',
    nullif(btrim(coalesce(p_fields->>'vendor_id','')),'')::uuid,
    p_fields->>'vendor_code');

  begin
    v_date := coalesce((p_fields->>'manifest_date')::date, current_date);
  exception when others then
    raise exception 'Invalid manifest_date' using errcode = '22023';
  end;
  begin
    v_time := nullif(btrim(coalesce(p_fields->>'manifest_time','')),'')::time;
  exception when others then
    raise exception 'Invalid manifest_time' using errcode = '22023';
  end;

  v_to_type := upper(coalesce(nullif(btrim(p_fields->>'to_type'),''), 'SERVICE_CENTER'));
  if v_to_type not in ('SERVICE_CENTER','THIRD_PARTY') then
    v_to_type := 'SERVICE_CENTER';
  end if;
  if v_to_type = 'SERVICE_CENTER' and v_sc is null and coalesce(btrim(p_fields->>'to_service_center_code'),'') <> '' then
    raise exception 'Destination service centre not found' using errcode = '22023';
  end if;
  if v_to_type = 'THIRD_PARTY' and v_vendor is null and coalesce(btrim(p_fields->>'vendor_code'),'') <> '' then
    raise exception 'Vendor not found' using errcode = '22023';
  end if;

  v_kind := upper(coalesce(nullif(btrim(p_fields->>'manifest_kind'),''), 'OUTBOUND'));
  if v_kind not in ('OUTBOUND','BAGGING','OBC') then v_kind := 'OUTBOUND'; end if;

  v_extras := coalesce(p_fields->'wizard_extras', '{}'::jsonb);
  if jsonb_typeof(v_extras) <> 'object' then v_extras := '{}'::jsonb; end if;

  select fy.id into v_fy
    from public.financial_years fy
   where fy.tenant_id = v_tenant and fy.deleted_at is null and fy.is_active
     and (fy.branch_id is not distinct from v_branch or fy.branch_id is null)
   order by case when fy.branch_id = v_branch then 0 else 1 end, fy.from_date desc
   limit 1;

  if p_id is null then
    if not app.user_has_permission(v_tenant, 'txn.manifest-scan', 'add') then
      raise exception 'Permission denied: txn.manifest-scan add' using errcode = '42501';
    end if;

    select * into v_alloc from app.allocate_document_no(v_tenant, 'MANIFEST', v_branch, v_fy);

    insert into public.manifests (
      tenant_id, manifest_no, manifest_kind, manifest_date, manifest_time,
      to_type, to_service_center_id, vendor_id, origin_branch_id,
      location_code, connect_station, master_awb_no, cd_no, obc_name,
      total_bags, vendor_weight, reference_no,
      flight1, flight2, departure, arrival, remark, flight,
      status, status_at, is_locked, wizard_extras, created_by, updated_by)
    values (
      v_tenant, v_alloc.formatted_no, v_kind, v_date, v_time,
      v_to_type, v_sc, v_vendor, v_branch,
      nullif(btrim(coalesce(p_fields->>'location_code','')),''),
      nullif(btrim(coalesce(p_fields->>'connect_station','')),''),
      nullif(btrim(coalesce(p_fields->>'master_awb_no','')),''),
      nullif(btrim(coalesce(p_fields->>'cd_no','')),''),
      nullif(btrim(coalesce(p_fields->>'obc_name','')),''),
      coalesce(nullif(btrim(coalesce(p_fields->>'total_bags','')),'')::integer, 0),
      coalesce(nullif(btrim(coalesce(p_fields->>'vendor_weight','')),'')::numeric, 0),
      nullif(btrim(coalesce(p_fields->>'reference_no','')),''),
      nullif(btrim(coalesce(p_fields->>'flight1','')),''),
      nullif(btrim(coalesce(p_fields->>'flight2','')),''),
      nullif(btrim(coalesce(p_fields->>'departure','')),''),
      nullif(btrim(coalesce(p_fields->>'arrival','')),''),
      nullif(btrim(coalesce(p_fields->>'remark','')),''),
      nullif(btrim(coalesce(p_fields->>'flight','')),''),
      'DRAFT', now(), coalesce((p_fields->>'is_locked')::boolean, false), v_extras,
      auth.uid(), auth.uid())
    returning * into v_m;

    perform app.sync_manifest_lines(v_tenant, v_m.id, p_lines);
    perform app.sync_manifest_comments(v_tenant, v_m.id, p_comments);
    perform app.sync_manifest_attachments(v_tenant, v_m.id, p_attachments);

    perform app.append_manifest_event(
      v_tenant, v_m.id, 'CREATED', 'Manifest Created',
      jsonb_build_object('manifest_no', v_m.manifest_no, 'status', v_m.status));

    perform app.write_audit_log(
      p_tenant_id => v_tenant, p_entity_type => 'manifests', p_action => 'ADD',
      p_entity_id => v_m.id, p_module_slug => 'txn.manifest-scan',
      p_new => jsonb_build_object('manifest_no', v_m.manifest_no, 'status', 'DRAFT'));
  else
    if not app.user_has_permission(v_tenant, 'txn.manifest-scan', 'modify') then
      raise exception 'Permission denied: txn.manifest-scan modify' using errcode = '42501';
    end if;

    select * into v_m from public.manifests
     where id = p_id and tenant_id = v_tenant and deleted_at is null;
    if not found then
      raise exception 'Manifest not found' using errcode = 'P0002';
    end if;
    if v_m.status <> 'DRAFT' then
      raise exception 'Only DRAFT manifests can be edited' using errcode = 'CMS02';
    end if;
    if v_m.is_locked then
      raise exception 'Manifest is locked' using errcode = 'CMS02';
    end if;

    update public.manifests set
      manifest_kind = v_kind,
      manifest_date = v_date,
      manifest_time = v_time,
      to_type = v_to_type,
      to_service_center_id = v_sc,
      vendor_id = v_vendor,
      origin_branch_id = v_branch,
      location_code = nullif(btrim(coalesce(p_fields->>'location_code','')),''),
      connect_station = nullif(btrim(coalesce(p_fields->>'connect_station','')),''),
      master_awb_no = nullif(btrim(coalesce(p_fields->>'master_awb_no','')),''),
      cd_no = nullif(btrim(coalesce(p_fields->>'cd_no','')),''),
      obc_name = nullif(btrim(coalesce(p_fields->>'obc_name','')),''),
      total_bags = coalesce(nullif(btrim(coalesce(p_fields->>'total_bags','')),'')::integer, total_bags),
      vendor_weight = coalesce(nullif(btrim(coalesce(p_fields->>'vendor_weight','')),'')::numeric, vendor_weight),
      reference_no = nullif(btrim(coalesce(p_fields->>'reference_no','')),''),
      flight1 = nullif(btrim(coalesce(p_fields->>'flight1','')),''),
      flight2 = nullif(btrim(coalesce(p_fields->>'flight2','')),''),
      departure = nullif(btrim(coalesce(p_fields->>'departure','')),''),
      arrival = nullif(btrim(coalesce(p_fields->>'arrival','')),''),
      remark = nullif(btrim(coalesce(p_fields->>'remark','')),''),
      flight = nullif(btrim(coalesce(p_fields->>'flight','')),''),
      is_locked = coalesce((p_fields->>'is_locked')::boolean, is_locked),
      wizard_extras = v_extras,
      updated_by = auth.uid()
    where id = p_id and tenant_id = v_tenant and deleted_at is null
      and row_version = p_row_version
    returning * into v_m;

    if not found then
      raise exception 'This record was changed by someone else. Reload and try again.'
        using errcode = '40001';
    end if;

    perform app.sync_manifest_lines(v_tenant, v_m.id, p_lines);
    perform app.sync_manifest_comments(v_tenant, v_m.id, p_comments);
    perform app.sync_manifest_attachments(v_tenant, v_m.id, p_attachments);

    perform app.append_manifest_event(
      v_tenant, v_m.id, 'UPDATED', 'Manifest Updated',
      jsonb_build_object('manifest_no', v_m.manifest_no, 'row_version', v_m.row_version));

    perform app.write_audit_log(
      p_tenant_id => v_tenant, p_entity_type => 'manifests', p_action => 'MODIFY',
      p_entity_id => v_m.id, p_module_slug => 'txn.manifest-scan',
      p_new => jsonb_build_object('manifest_no', v_m.manifest_no, 'status', v_m.status));
  end if;

  return v_m;
end
$$;

comment on function public.save_manifest(uuid, integer, jsonb, jsonb, jsonb, jsonb) is
  'Create/update DRAFT manifest aggregate. Allocates MANIFEST no on insert; syncs lines/comments/attachments.';

revoke all on function public.save_manifest(uuid, integer, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function public.save_manifest(uuid, integer, jsonb, jsonb, jsonb, jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- close_manifest — DRAFT → CLOSED; BOOKED → MANIFESTED per line
-- ---------------------------------------------------------------------------
create or replace function public.close_manifest(
  p_id          uuid,
  p_row_version integer
)
returns public.manifests
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_m      public.manifests;
  v_line   public.manifest_lines;
  v_ship   public.shipments;
  v_cnt    integer;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not app.user_has_permission(v_tenant, 'txn.manifest-scan', 'modify') then
    raise exception 'Permission denied: txn.manifest-scan modify' using errcode = '42501';
  end if;

  select * into v_m from public.manifests
   where id = p_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'Manifest not found' using errcode = 'P0002';
  end if;

  perform app.assert_status_transition('MANIFEST', v_m.status, 'CLOSED');

  select count(*) into v_cnt from public.manifest_lines
   where tenant_id = v_tenant and manifest_id = p_id and deleted_at is null;
  if v_cnt < 1 then
    raise exception 'Cannot close a manifest with no lines' using errcode = 'CMS04';
  end if;

  update public.manifests set
    status = 'CLOSED',
    status_at = now(),
    closed_at = now(),
    closed_by = auth.uid(),
    is_locked = true,
    updated_by = auth.uid()
  where id = p_id and tenant_id = v_tenant and deleted_at is null
    and row_version = p_row_version
  returning * into v_m;

  if not found then
    raise exception 'This record was changed by someone else. Reload and try again.'
      using errcode = '40001';
  end if;

  for v_line in
    select * from public.manifest_lines
     where tenant_id = v_tenant and manifest_id = p_id and deleted_at is null
     order by seq
  loop
    select * into v_ship from public.shipments
     where id = v_line.shipment_id and tenant_id = v_tenant and deleted_at is null
     for update;
    if not found then
      raise exception 'Shipment missing for line AWB %', v_line.awb_no using errcode = 'P0002';
    end if;
    if v_ship.current_status <> 'BOOKED' then
      raise exception 'Shipment % must be BOOKED to close manifest (is %)',
        v_ship.awb_no, v_ship.current_status
        using errcode = 'CMS04';
    end if;

    perform app.assert_status_transition('SHIPMENT', v_ship.current_status, 'MANIFESTED');

    update public.shipments set
      current_status = 'MANIFESTED',
      status_at = now(),
      updated_by = auth.uid()
    where id = v_ship.id and tenant_id = v_tenant;

    perform app.append_shipment_event(
      v_tenant, v_ship.id, 'MANIFESTED', 'Shipment Manifested',
      jsonb_build_object('manifest_id', v_m.id, 'manifest_no', v_m.manifest_no));
  end loop;

  perform app.append_manifest_event(
    v_tenant, v_m.id, 'CLOSED', 'Manifest Closed',
    jsonb_build_object('manifest_no', v_m.manifest_no, 'lines', v_cnt));

  perform app.write_audit_log(
    p_tenant_id => v_tenant, p_entity_type => 'manifests', p_action => 'MODIFY',
    p_entity_id => v_m.id, p_module_slug => 'txn.manifest-scan',
    p_new => jsonb_build_object('status', 'CLOSED', 'manifest_no', v_m.manifest_no));

  return v_m;
end
$$;

revoke all on function public.close_manifest(uuid, integer) from public;
grant execute on function public.close_manifest(uuid, integer)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- cancel_manifest — DRAFT|CLOSED → CANCELLED
-- ---------------------------------------------------------------------------
create or replace function public.cancel_manifest(
  p_id          uuid,
  p_row_version integer,
  p_reason      text default null
)
returns public.manifests
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_m      public.manifests;
  v_line   public.manifest_lines;
  v_ship   public.shipments;
  v_was_closed boolean;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not (app.user_has_permission(v_tenant, 'txn.manifest-scan', 'modify')
       or app.user_has_permission(v_tenant, 'txn.manifest-scan', 'delete')) then
    raise exception 'Permission denied: txn.manifest-scan cancel' using errcode = '42501';
  end if;

  select * into v_m from public.manifests
   where id = p_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'Manifest not found' using errcode = 'P0002';
  end if;

  perform app.assert_status_transition('MANIFEST', v_m.status, 'CANCELLED');
  v_was_closed := (v_m.status = 'CLOSED');

  update public.manifests set
    status = 'CANCELLED',
    status_at = now(),
    cancelled_at = now(),
    cancelled_by = auth.uid(),
    wizard_extras = wizard_extras || jsonb_build_object('cancel_reason', nullif(btrim(coalesce(p_reason,'')),'')),
    updated_by = auth.uid()
  where id = p_id and tenant_id = v_tenant and deleted_at is null
    and row_version = p_row_version
  returning * into v_m;

  if not found then
    raise exception 'This record was changed by someone else. Reload and try again.'
      using errcode = '40001';
  end if;

  -- Unmanifest shipments if this manifest had already closed them
  if v_was_closed then
    for v_line in
      select * from public.manifest_lines
       where tenant_id = v_tenant and manifest_id = p_id and deleted_at is null
    loop
      select * into v_ship from public.shipments
       where id = v_line.shipment_id and tenant_id = v_tenant and deleted_at is null
       for update;
      if found and v_ship.current_status = 'MANIFESTED' then
        perform app.assert_status_transition('SHIPMENT', v_ship.current_status, 'BOOKED');
        update public.shipments set
          current_status = 'BOOKED',
          status_at = now(),
          updated_by = auth.uid()
        where id = v_ship.id and tenant_id = v_tenant;
        perform app.append_shipment_event(
          v_tenant, v_ship.id, 'UNMANIFESTED', 'Shipment Unmanifested',
          jsonb_build_object('manifest_id', v_m.id, 'manifest_no', v_m.manifest_no));
      end if;
    end loop;
  end if;

  perform app.append_manifest_event(
    v_tenant, v_m.id, 'CANCELLED', 'Manifest Cancelled',
    jsonb_build_object('manifest_no', v_m.manifest_no, 'reason', p_reason));

  perform app.write_audit_log(
    p_tenant_id => v_tenant, p_entity_type => 'manifests', p_action => 'MODIFY',
    p_entity_id => v_m.id, p_module_slug => 'txn.manifest-scan',
    p_new => jsonb_build_object('status', 'CANCELLED', 'manifest_no', v_m.manifest_no));

  return v_m;
end
$$;

revoke all on function public.cancel_manifest(uuid, integer, text) from public;
grant execute on function public.cancel_manifest(uuid, integer, text)
  to authenticated, service_role;
