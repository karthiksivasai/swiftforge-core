-- ===========================================================================
-- 0035  manifest inscan — Phase 4 Milestone 4B
-- ---------------------------------------------------------------------------
-- Append-only scan event framework + scan_manifest RPC.
-- No bagging / DRS / POD / tracking / finance / rating.
--
-- Status: SHIPMENT MANIFESTED → MANIFEST_INSCANNED (assert_status_transition)
-- Slug:   txn.manifest-in-scan
-- ===========================================================================

insert into app.status_transitions (entity_kind, from_status, to_status) values
  ('SHIPMENT','MANIFESTED','MANIFEST_INSCANNED')
on conflict do nothing;

alter table public.shipments drop constraint if exists shipments_current_status_check;
alter table public.shipments add constraint shipments_current_status_check
  check (current_status in (
    'DRAFT','BOOKED','PICKUP_INSCANNED','BAGGED','MANIFESTED','MANIFEST_INSCANNED',
    'IN_TRANSIT','RECEIVED_AT_HUB','ON_DRS','MISROUTED',
    'OUT_FOR_DELIVERY','DELIVERED','UNDELIVERED',
    'UNDELIVERED_RECEIVED','RTO_INITIATED','RTO_DELIVERED',
    'CANCELLED','VOID'));

create table if not exists public.manifest_scan_events (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  manifest_id   uuid not null,
  shipment_id   uuid not null,
  awb_no        text not null,
  bag_no        text,
  scan_mode     text not null default 'AWB'
                  check (scan_mode in ('AWB','BAG')),
  event_type    text not null default 'INSCAN',
  event_text    text not null,
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  deleted_at    timestamptz,
  row_version   integer not null default 1,
  constraint manifest_scan_events_manifest_fk foreign key (tenant_id, manifest_id)
    references public.manifests (tenant_id, id) on delete cascade,
  constraint manifest_scan_events_shipment_fk foreign key (tenant_id, shipment_id)
    references public.shipments (tenant_id, id) on delete restrict
);

create unique index if not exists manifest_scan_events_dup_uq
  on public.manifest_scan_events (tenant_id, manifest_id, shipment_id)
  where deleted_at is null and event_type = 'INSCAN';
create index if not exists manifest_scan_events_manifest_idx
  on public.manifest_scan_events (tenant_id, manifest_id, created_at);
create index if not exists manifest_scan_events_shipment_idx
  on public.manifest_scan_events (tenant_id, shipment_id);

select app.attach_append_only_guard('manifest_scan_events');
select app.attach_event_policies('manifest_scan_events', 'txn.manifest-in-scan');

create table if not exists public.shipment_scan_events (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  shipment_id   uuid not null,
  manifest_id   uuid,
  awb_no        text not null,
  event_type    text not null,
  event_text    text not null,
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  deleted_at    timestamptz,
  row_version   integer not null default 1,
  constraint shipment_scan_events_shipment_fk foreign key (tenant_id, shipment_id)
    references public.shipments (tenant_id, id) on delete cascade
);

create unique index if not exists shipment_scan_events_manifest_inscan_uq
  on public.shipment_scan_events (tenant_id, shipment_id, manifest_id)
  where deleted_at is null and event_type = 'MANIFEST_INSCAN' and manifest_id is not null;
create index if not exists shipment_scan_events_shipment_idx
  on public.shipment_scan_events (tenant_id, shipment_id, created_at);

select app.attach_append_only_guard('shipment_scan_events');
select app.attach_event_policies('shipment_scan_events', 'txn.manifest-in-scan');

create or replace function public.get_manifest_inscan_board(p_manifest_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_m public.manifests;
  v_lines jsonb;
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
      'bag_no', ml.bag_no,
      'shipment_status', s.current_status,
      'scanned', exists (
        select 1 from public.manifest_scan_events e
         where e.tenant_id = v_tenant
           and e.manifest_id = p_manifest_id
           and e.shipment_id = ml.shipment_id
           and e.deleted_at is null
           and e.event_type = 'INSCAN'
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
end
$$;

revoke all on function public.get_manifest_inscan_board(uuid) from public;
grant execute on function public.get_manifest_inscan_board(uuid)
  to authenticated, service_role;

create or replace function public.scan_manifest(
  p_manifest_id uuid,
  p_awb_no      text default null,
  p_shipment_id uuid default null,
  p_bag_no      text default null,
  p_mode        text default 'AWB'
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_m      public.manifests;
  v_line   public.manifest_lines;
  v_ship   public.shipments;
  v_mode   text;
  v_board  jsonb;
  v_exists boolean;
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
       and awb_no = btrim(p_awb_no) and deleted_at is null;
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

  update public.shipments set
    current_status = 'MANIFEST_INSCANNED',
    status_at = now(),
    updated_by = auth.uid()
  where id = v_ship.id and tenant_id = v_tenant
  returning * into v_ship;

  insert into public.manifest_scan_events (
    tenant_id, manifest_id, shipment_id, awb_no, bag_no, scan_mode,
    event_type, event_text, payload, created_by, updated_by)
  values (
    v_tenant, v_m.id, v_ship.id, v_ship.awb_no,
    coalesce(nullif(btrim(coalesce(p_bag_no,'')),''), v_line.bag_no),
    v_mode, 'INSCAN', 'Manifest Inscan',
    jsonb_build_object('manifest_no', v_m.manifest_no, 'mode', v_mode),
    auth.uid(), auth.uid());

  insert into public.shipment_scan_events (
    tenant_id, shipment_id, manifest_id, awb_no,
    event_type, event_text, payload, created_by, updated_by)
  values (
    v_tenant, v_ship.id, v_m.id, v_ship.awb_no,
    'MANIFEST_INSCAN', 'Shipment Manifest Inscanned',
    jsonb_build_object('manifest_id', v_m.id, 'manifest_no', v_m.manifest_no, 'mode', v_mode),
    auth.uid(), auth.uid());

  perform app.append_shipment_event(
    v_tenant, v_ship.id, 'MANIFEST_INSCANNED', 'Shipment Manifest Inscanned',
    jsonb_build_object('manifest_id', v_m.id, 'manifest_no', v_m.manifest_no));

  perform app.append_manifest_event(
    v_tenant, v_m.id, 'INSCAN', 'Shipment Inscanned',
    jsonb_build_object('shipment_id', v_ship.id, 'awb_no', v_ship.awb_no));

  perform app.write_audit_log(
    p_tenant_id => v_tenant, p_entity_type => 'shipments', p_action => 'MODIFY',
    p_entity_id => v_ship.id, p_module_slug => 'txn.manifest-in-scan',
    p_new => jsonb_build_object(
      'status', 'MANIFEST_INSCANNED',
      'awb_no', v_ship.awb_no,
      'manifest_id', v_m.id));

  v_board := public.get_manifest_inscan_board(p_manifest_id);

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'message', format('AWB %s inscanned', v_ship.awb_no),
    'manifest_id', v_m.id,
    'manifest_no', v_m.manifest_no,
    'shipment_id', v_ship.id,
    'awb_no', v_ship.awb_no,
    'from_status', 'MANIFESTED',
    'to_status', 'MANIFEST_INSCANNED',
    'scanned_count', (v_board->>'scanned_count')::int,
    'pending_count', (v_board->>'pending_count')::int
  );
end
$$;

comment on function public.scan_manifest(uuid, text, uuid, text, text) is
  'Inscan a MANIFESTED shipment on a CLOSED manifest. Duplicate-safe; append-only scan events.';

revoke all on function public.scan_manifest(uuid, text, uuid, text, text) from public;
grant execute on function public.scan_manifest(uuid, text, uuid, text, text)
  to authenticated, service_role;

-- Extend lookup with CLOSED manifests (preserve all prior keys)
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

  else
    raise exception 'Unknown lookup key: %', p_key using errcode = '22023';
  end if;
end
$$;



comment on function public.lookup(text, text, integer) is
  'Shared tenant-safe autocomplete. Keys include sales-executive (0031) and manifest (0035). Trigram ILIKE search, stable order, limit clamped to [1,200].';
