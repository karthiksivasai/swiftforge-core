-- ===========================================================================
-- 0032  shipment foundation — Phase 4 Milestone 3A (AWB Aggregate)
-- ---------------------------------------------------------------------------
-- Shipment aggregate root + child collections ONLY. No manifest/DRS/tracking/
-- rating/finance. Reuses 0030 transaction helpers and 0031 resolve helper.
--
-- Tables: shipments, shipment_pieces, shipment_charge_snapshots,
--         shipment_comments, shipment_attachments, shipment_events
-- RPCs:   save_shipment, confirm_booking, cancel_shipment
-- Status: DRAFT → BOOKED → CANCELLED (via app.assert_status_transition)
-- AWB:    app.allocate_document_no(..., 'AWB', ...)
-- Slug:   txn.awb-entry / cancel via txn.awb-entry-void-cancel
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Extend shipment status machine with foundation edges
-- ---------------------------------------------------------------------------
insert into app.status_transitions (entity_kind, from_status, to_status) values
  ('SHIPMENT','DRAFT','BOOKED'),
  ('SHIPMENT','DRAFT','CANCELLED'),
  ('SHIPMENT','BOOKED','CANCELLED')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- shipments (aggregate root)
-- ---------------------------------------------------------------------------
create table if not exists public.shipments (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants(id) on delete cascade,
  awb_no                  text not null,
  book_date               date not null default (current_date),
  book_time               time,
  reference_no            text,
  customer_id             uuid,
  branch_id               uuid,
  origin_destination_id   uuid,
  destination_id          uuid,
  shipper                 jsonb not null default '{}'::jsonb,
  consignee               jsonb not null default '{}'::jsonb,
  product_id              uuid,
  vendor_id               uuid,
  airline                 text,
  service                 text,
  payment_type            text,
  content                 text,
  instruction             text,
  field_executive_id      uuid,
  pickup_id               uuid,
  pieces                  integer not null default 1 check (pieces >= 0),
  pieces_unit             text not null default 'DOX'
                            check (pieces_unit in ('DOX','NDOX','ENV')),
  actual_weight           numeric(14,3) not null default 0 check (actual_weight >= 0),
  weight_unit             text not null default 'KG',
  vol_weight              numeric(14,3) not null default 0 check (vol_weight >= 0),
  charge_weight           numeric(14,3) not null default 0 check (charge_weight >= 0),
  shipment_value          numeric(14,2),
  currency                text not null default 'INR',
  is_commercial           boolean not null default false,
  is_oda                  boolean not null default false,
  medical_charges         boolean not null default false,
  customer_charges_total  numeric(14,2) not null default 0,
  vendor_charges_total    numeric(14,2) not null default 0,
  cash_receipt_no         text,
  amount_received         numeric(14,2),
  balance_amount          numeric(14,2),
  cash_receipt_date       date,
  forwarding_awb          text,
  delivery_awb            text,
  return_awb              text,
  delivery_vendor_id      uuid,
  delivery_service        text,
  flight_no               text,
  current_status          text not null default 'DRAFT'
                            check (current_status in (
                              'DRAFT','BOOKED','PICKUP_INSCANNED','BAGGED','MANIFESTED',
                              'IN_TRANSIT','RECEIVED_AT_HUB','ON_DRS','MISROUTED',
                              'OUT_FOR_DELIVERY','DELIVERED','UNDELIVERED',
                              'UNDELIVERED_RECEIVED','RTO_INITIATED','RTO_DELIVERED',
                              'CANCELLED','VOID')),
  status_at               timestamptz not null default now(),
  is_locked               boolean not null default false,
  is_hold                 boolean not null default false,
  wizard_extras           jsonb not null default '{}'::jsonb,
  booked_at               timestamptz,
  booked_by               uuid,
  cancelled_at            timestamptz,
  cancelled_by            uuid,
  created_at              timestamptz not null default now(),
  created_by              uuid,
  updated_at              timestamptz not null default now(),
  updated_by              uuid,
  deleted_at              timestamptz,
  row_version             integer not null default 1,
  constraint shipments_tenant_id_uq unique (tenant_id, id),
  constraint shipments_customer_fk foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete set null,
  constraint shipments_branch_fk foreign key (tenant_id, branch_id)
    references public.branches (tenant_id, id) on delete set null,
  constraint shipments_origin_fk foreign key (tenant_id, origin_destination_id)
    references public.destinations (tenant_id, id) on delete set null,
  constraint shipments_destination_fk foreign key (tenant_id, destination_id)
    references public.destinations (tenant_id, id) on delete set null,
  constraint shipments_product_fk foreign key (tenant_id, product_id)
    references public.products (tenant_id, id) on delete set null,
  constraint shipments_vendor_fk foreign key (tenant_id, vendor_id)
    references public.vendors (tenant_id, id) on delete set null,
  constraint shipments_delivery_vendor_fk foreign key (tenant_id, delivery_vendor_id)
    references public.vendors (tenant_id, id) on delete set null,
  constraint shipments_field_executive_fk foreign key (tenant_id, field_executive_id)
    references public.field_executives (tenant_id, id) on delete set null,
  constraint shipments_pickup_fk foreign key (tenant_id, pickup_id)
    references public.pickups (tenant_id, id) on delete set null
);

create unique index if not exists shipments_tenant_awb_uq
  on public.shipments (tenant_id, awb_no) where deleted_at is null;
create index if not exists shipments_tenant_idx on public.shipments (tenant_id);
create index if not exists shipments_tenant_date_idx
  on public.shipments (tenant_id, book_date) where deleted_at is null;
create index if not exists shipments_tenant_status_idx
  on public.shipments (tenant_id, current_status) where deleted_at is null;
create index if not exists shipments_tenant_customer_idx
  on public.shipments (tenant_id, customer_id) where deleted_at is null;
create index if not exists shipments_tenant_pickup_idx
  on public.shipments (tenant_id, pickup_id) where deleted_at is null;
create index if not exists shipments_awb_trgm
  on public.shipments using gin (awb_no gin_trgm_ops);
create index if not exists shipments_reference_trgm
  on public.shipments using gin (reference_no gin_trgm_ops);

select app.attach_transaction_triggers('shipments', 'txn.awb-entry');
select app.attach_transaction_policies('shipments', 'txn.awb-entry');

-- ---------------------------------------------------------------------------
-- shipment_pieces (1:N child — replace sync via save_shipment)
-- ---------------------------------------------------------------------------
create table if not exists public.shipment_pieces (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  shipment_id           uuid not null,
  seq                   integer not null default 1,
  child_awb             text,
  actual_weight_per_pc  numeric(14,3) not null default 0 check (actual_weight_per_pc >= 0),
  pieces                integer not null default 1 check (pieces >= 0),
  length                numeric(14,3),
  breadth               numeric(14,3),
  height                numeric(14,3),
  divisor               numeric(14,3),
  vol_weight            numeric(14,3) not null default 0 check (vol_weight >= 0),
  charge_weight         numeric(14,3) not null default 0 check (charge_weight >= 0),
  created_at            timestamptz not null default now(),
  created_by            uuid,
  updated_at            timestamptz not null default now(),
  updated_by            uuid,
  deleted_at            timestamptz,
  row_version           integer not null default 1,
  constraint shipment_pieces_shipment_fk foreign key (tenant_id, shipment_id)
    references public.shipments (tenant_id, id) on delete cascade,
  constraint shipment_pieces_uq unique (tenant_id, shipment_id, seq)
);
create index if not exists shipment_pieces_shipment_idx
  on public.shipment_pieces (tenant_id, shipment_id);

alter table public.shipment_pieces enable row level security;
drop policy if exists shipment_pieces_select on public.shipment_pieces;
create policy shipment_pieces_select on public.shipment_pieces
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());
drop policy if exists shipment_pieces_insert on public.shipment_pieces;
create policy shipment_pieces_insert on public.shipment_pieces
  for insert with check (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'txn.awb-entry', 'add'));
drop policy if exists shipment_pieces_delete on public.shipment_pieces;
create policy shipment_pieces_delete on public.shipment_pieces
  for delete using (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'txn.awb-entry', 'modify'));

-- ---------------------------------------------------------------------------
-- shipment_charge_snapshots (UI-supplied snapshots only — no rating engine)
-- ---------------------------------------------------------------------------
create table if not exists public.shipment_charge_snapshots (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  shipment_id           uuid not null,
  seq                   integer not null default 1,
  side                  text not null default 'CUSTOMER'
                          check (side in ('CUSTOMER','VENDOR')),
  description           text not null,
  rate                  numeric(14,4) not null default 0,
  amount                numeric(14,2) not null default 0,
  fuel_applies          boolean not null default false,
  fuel_amount           numeric(14,2) not null default 0,
  tax_applies           boolean not null default false,
  tax_on_fuel           boolean not null default false,
  igst                  numeric(14,2) not null default 0,
  sgst                  numeric(14,2) not null default 0,
  cgst                  numeric(14,2) not null default 0,
  total                 numeric(14,2) not null default 0,
  charges_type          text not null default 'MANUAL'
                          check (charges_type in ('MANUAL','SYSTEM')),
  created_at            timestamptz not null default now(),
  created_by            uuid,
  updated_at            timestamptz not null default now(),
  updated_by            uuid,
  deleted_at            timestamptz,
  row_version           integer not null default 1,
  constraint shipment_charge_snapshots_shipment_fk foreign key (tenant_id, shipment_id)
    references public.shipments (tenant_id, id) on delete cascade,
  constraint shipment_charge_snapshots_uq unique (tenant_id, shipment_id, seq, side)
);
create index if not exists shipment_charge_snapshots_shipment_idx
  on public.shipment_charge_snapshots (tenant_id, shipment_id);

alter table public.shipment_charge_snapshots enable row level security;
drop policy if exists shipment_charge_snapshots_select on public.shipment_charge_snapshots;
create policy shipment_charge_snapshots_select on public.shipment_charge_snapshots
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());
drop policy if exists shipment_charge_snapshots_insert on public.shipment_charge_snapshots;
create policy shipment_charge_snapshots_insert on public.shipment_charge_snapshots
  for insert with check (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'txn.awb-entry', 'add'));
drop policy if exists shipment_charge_snapshots_delete on public.shipment_charge_snapshots;
create policy shipment_charge_snapshots_delete on public.shipment_charge_snapshots
  for delete using (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'txn.awb-entry', 'modify'));

-- ---------------------------------------------------------------------------
-- shipment_comments
-- ---------------------------------------------------------------------------
create table if not exists public.shipment_comments (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  shipment_id           uuid not null,
  seq                   integer not null default 1,
  comment               text not null,
  file_id               uuid references public.files(id) on delete set null,
  commented_at          timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  created_by            uuid,
  updated_at            timestamptz not null default now(),
  updated_by            uuid,
  deleted_at            timestamptz,
  row_version           integer not null default 1,
  constraint shipment_comments_shipment_fk foreign key (tenant_id, shipment_id)
    references public.shipments (tenant_id, id) on delete cascade,
  constraint shipment_comments_uq unique (tenant_id, shipment_id, seq)
);
create index if not exists shipment_comments_shipment_idx
  on public.shipment_comments (tenant_id, shipment_id);

alter table public.shipment_comments enable row level security;
drop policy if exists shipment_comments_select on public.shipment_comments;
create policy shipment_comments_select on public.shipment_comments
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());
drop policy if exists shipment_comments_insert on public.shipment_comments;
create policy shipment_comments_insert on public.shipment_comments
  for insert with check (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'txn.awb-entry', 'add'));
drop policy if exists shipment_comments_delete on public.shipment_comments;
create policy shipment_comments_delete on public.shipment_comments
  for delete using (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'txn.awb-entry', 'modify'));

-- ---------------------------------------------------------------------------
-- shipment_attachments (metadata link to public.files)
-- ---------------------------------------------------------------------------
create table if not exists public.shipment_attachments (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  shipment_id           uuid not null,
  seq                   integer not null default 1,
  file_id               uuid not null references public.files(id) on delete restrict,
  label                 text,
  created_at            timestamptz not null default now(),
  created_by            uuid,
  updated_at            timestamptz not null default now(),
  updated_by            uuid,
  deleted_at            timestamptz,
  row_version           integer not null default 1,
  constraint shipment_attachments_shipment_fk foreign key (tenant_id, shipment_id)
    references public.shipments (tenant_id, id) on delete cascade,
  constraint shipment_attachments_uq unique (tenant_id, shipment_id, seq)
);
create index if not exists shipment_attachments_shipment_idx
  on public.shipment_attachments (tenant_id, shipment_id);

alter table public.shipment_attachments enable row level security;
drop policy if exists shipment_attachments_select on public.shipment_attachments;
create policy shipment_attachments_select on public.shipment_attachments
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());
drop policy if exists shipment_attachments_insert on public.shipment_attachments;
create policy shipment_attachments_insert on public.shipment_attachments
  for insert with check (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'txn.awb-entry', 'add'));
drop policy if exists shipment_attachments_delete on public.shipment_attachments;
create policy shipment_attachments_delete on public.shipment_attachments
  for delete using (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'txn.awb-entry', 'modify'));

-- ---------------------------------------------------------------------------
-- shipment_events (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.shipment_events (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  shipment_id           uuid not null,
  event_type            text not null,
  event_text            text not null,
  payload               jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  created_by            uuid,
  updated_at            timestamptz not null default now(),
  updated_by            uuid,
  deleted_at            timestamptz,
  row_version           integer not null default 1,
  constraint shipment_events_shipment_fk foreign key (tenant_id, shipment_id)
    references public.shipments (tenant_id, id) on delete cascade
);
create index if not exists shipment_events_shipment_idx
  on public.shipment_events (tenant_id, shipment_id, created_at);

select app.attach_append_only_guard('shipment_events');
select app.attach_event_policies('shipment_events', 'txn.awb-entry');

-- ---------------------------------------------------------------------------
-- app.append_shipment_event
-- ---------------------------------------------------------------------------
create or replace function app.append_shipment_event(
  p_tenant_id   uuid,
  p_shipment_id uuid,
  p_event_type  text,
  p_event_text  text,
  p_payload     jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_id uuid;
begin
  insert into public.shipment_events (
    tenant_id, shipment_id, event_type, event_text, payload, created_by, updated_by)
  values (
    p_tenant_id, p_shipment_id, p_event_type, p_event_text,
    coalesce(p_payload, '{}'::jsonb), auth.uid(), auth.uid())
  returning id into v_id;
  return v_id;
end
$$;

comment on function app.append_shipment_event(uuid, uuid, text, text, jsonb) is
  'Append-only shipment event writer used by save/confirm/cancel RPCs.';

-- ---------------------------------------------------------------------------
-- Child sync helpers (replace semantics)
-- ---------------------------------------------------------------------------
create or replace function app.sync_shipment_pieces(
  p_tenant uuid,
  p_shipment uuid,
  p_pieces jsonb
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
  delete from public.shipment_pieces
   where tenant_id = p_tenant and shipment_id = p_shipment;

  if p_pieces is null or jsonb_typeof(p_pieces) <> 'array' then
    return;
  end if;

  for v_elem in select * from jsonb_array_elements(p_pieces)
  loop
    v_seq := v_seq + 1;
    insert into public.shipment_pieces (
      tenant_id, shipment_id, seq, child_awb,
      actual_weight_per_pc, pieces, length, breadth, height, divisor,
      vol_weight, charge_weight, created_by, updated_by)
    values (
      p_tenant, p_shipment, v_seq,
      nullif(btrim(coalesce(v_elem->>'child_awb','')),''),
      coalesce(nullif(btrim(coalesce(v_elem->>'actual_weight_per_pc','')),'')::numeric, 0),
      coalesce(nullif(btrim(coalesce(v_elem->>'pieces','')),'')::integer, 1),
      nullif(btrim(coalesce(v_elem->>'length','')),'')::numeric,
      nullif(btrim(coalesce(v_elem->>'breadth','')),'')::numeric,
      nullif(btrim(coalesce(v_elem->>'height','')),'')::numeric,
      nullif(btrim(coalesce(v_elem->>'divisor','')),'')::numeric,
      coalesce(nullif(btrim(coalesce(v_elem->>'vol_weight','')),'')::numeric, 0),
      coalesce(nullif(btrim(coalesce(v_elem->>'charge_weight','')),'')::numeric, 0),
      auth.uid(), auth.uid());
  end loop;
end
$$;

create or replace function app.sync_shipment_charge_snapshots(
  p_tenant uuid,
  p_shipment uuid,
  p_charges jsonb
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_elem jsonb;
  v_seq  integer := 0;
  v_side text;
begin
  delete from public.shipment_charge_snapshots
   where tenant_id = p_tenant and shipment_id = p_shipment;

  if p_charges is null or jsonb_typeof(p_charges) <> 'array' then
    return;
  end if;

  for v_elem in select * from jsonb_array_elements(p_charges)
  loop
    if coalesce(btrim(v_elem->>'description'), '') = '' then
      continue;
    end if;
    v_seq := v_seq + 1;
    v_side := upper(coalesce(nullif(btrim(v_elem->>'side'),''), 'CUSTOMER'));
    if v_side not in ('CUSTOMER','VENDOR') then v_side := 'CUSTOMER'; end if;

    insert into public.shipment_charge_snapshots (
      tenant_id, shipment_id, seq, side, description,
      rate, amount, fuel_applies, fuel_amount, tax_applies, tax_on_fuel,
      igst, sgst, cgst, total, charges_type, created_by, updated_by)
    values (
      p_tenant, p_shipment, v_seq, v_side, btrim(v_elem->>'description'),
      coalesce(nullif(btrim(coalesce(v_elem->>'rate','')),'')::numeric, 0),
      coalesce(nullif(btrim(coalesce(v_elem->>'amount','')),'')::numeric, 0),
      coalesce((v_elem->>'fuel_applies')::boolean, false),
      coalesce(nullif(btrim(coalesce(v_elem->>'fuel_amount','')),'')::numeric, 0),
      coalesce((v_elem->>'tax_applies')::boolean, false),
      coalesce((v_elem->>'tax_on_fuel')::boolean, false),
      coalesce(nullif(btrim(coalesce(v_elem->>'igst','')),'')::numeric, 0),
      coalesce(nullif(btrim(coalesce(v_elem->>'sgst','')),'')::numeric, 0),
      coalesce(nullif(btrim(coalesce(v_elem->>'cgst','')),'')::numeric, 0),
      coalesce(nullif(btrim(coalesce(v_elem->>'total','')),'')::numeric, 0),
      case when upper(coalesce(v_elem->>'charges_type','')) = 'SYSTEM' then 'SYSTEM' else 'MANUAL' end,
      auth.uid(), auth.uid());
  end loop;
end
$$;

create or replace function app.sync_shipment_comments(
  p_tenant uuid,
  p_shipment uuid,
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
  delete from public.shipment_comments
   where tenant_id = p_tenant and shipment_id = p_shipment;

  if p_comments is null or jsonb_typeof(p_comments) <> 'array' then
    return;
  end if;

  for v_elem in select * from jsonb_array_elements(p_comments)
  loop
    if coalesce(btrim(v_elem->>'comment'), '') = '' then
      continue;
    end if;
    v_seq := v_seq + 1;
    insert into public.shipment_comments (
      tenant_id, shipment_id, seq, comment, file_id, commented_at, created_by, updated_by)
    values (
      p_tenant, p_shipment, v_seq, btrim(v_elem->>'comment'),
      nullif(btrim(coalesce(v_elem->>'file_id','')),'')::uuid,
      coalesce(nullif(btrim(coalesce(v_elem->>'commented_at','')),'')::timestamptz, now()),
      auth.uid(), auth.uid());
  end loop;
end
$$;

create or replace function app.sync_shipment_attachments(
  p_tenant uuid,
  p_shipment uuid,
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
  delete from public.shipment_attachments
   where tenant_id = p_tenant and shipment_id = p_shipment;

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
      raise exception 'Attachment file % not found in tenant' , v_file
        using errcode = '22023';
    end if;
    v_seq := v_seq + 1;
    insert into public.shipment_attachments (
      tenant_id, shipment_id, seq, file_id, label, created_by, updated_by)
    values (
      p_tenant, p_shipment, v_seq, v_file,
      nullif(btrim(coalesce(v_elem->>'label','')),''),
      auth.uid(), auth.uid());

    update public.files
       set owner_type = 'SHIPMENT', owner_id = p_shipment, updated_by = auth.uid()
     where id = v_file and tenant_id = p_tenant;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- save_shipment — aggregate create/update (DRAFT only on update)
-- ---------------------------------------------------------------------------
create or replace function public.save_shipment(
  p_id           uuid,
  p_row_version  integer,
  p_fields       jsonb,
  p_pieces       jsonb default '[]'::jsonb,
  p_charges      jsonb default '[]'::jsonb,
  p_comments     jsonb default '[]'::jsonb,
  p_attachments  jsonb default '[]'::jsonb
)
returns public.shipments
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant   uuid;
  v_s        public.shipments;
  v_alloc    record;
  v_branch   uuid;
  v_fy       uuid;
  v_customer uuid;
  v_origin   uuid;
  v_dest     uuid;
  v_product  uuid;
  v_vendor   uuid;
  v_dvendor  uuid;
  v_fe       uuid;
  v_pickup   uuid;
  v_pieces_u text;
  v_date     date;
  v_time     time;
  v_shipper  jsonb;
  v_consignee jsonb;
  v_extras   jsonb;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'p_fields must be a JSON object' using errcode = '22023';
  end if;

  v_customer := app.resolve_tenant_row_id(
    v_tenant, 'customers',
    nullif(btrim(coalesce(p_fields->>'customer_id','')),'')::uuid,
    p_fields->>'customer_code');
  if v_customer is null then
    raise exception 'Customer is required' using errcode = '22023';
  end if;

  v_product := app.resolve_tenant_row_id(
    v_tenant, 'products',
    nullif(btrim(coalesce(p_fields->>'product_id','')),'')::uuid,
    p_fields->>'product_code');
  if v_product is null then
    raise exception 'Product is required' using errcode = '22023';
  end if;

  v_origin := app.resolve_tenant_row_id(
    v_tenant, 'destinations',
    nullif(btrim(coalesce(p_fields->>'origin_destination_id','')),'')::uuid,
    p_fields->>'origin_code');
  v_dest := app.resolve_tenant_row_id(
    v_tenant, 'destinations',
    nullif(btrim(coalesce(p_fields->>'destination_id','')),'')::uuid,
    p_fields->>'destination_code');
  v_vendor := app.resolve_tenant_row_id(
    v_tenant, 'vendors',
    nullif(btrim(coalesce(p_fields->>'vendor_id','')),'')::uuid,
    p_fields->>'vendor_code');
  v_dvendor := app.resolve_tenant_row_id(
    v_tenant, 'vendors',
    nullif(btrim(coalesce(p_fields->>'delivery_vendor_id','')),'')::uuid,
    p_fields->>'delivery_vendor_code');
  v_fe := app.resolve_tenant_row_id(
    v_tenant, 'field_executives',
    nullif(btrim(coalesce(p_fields->>'field_executive_id','')),'')::uuid,
    p_fields->>'field_executive_code');
  v_branch := app.resolve_tenant_row_id(
    v_tenant, 'branches',
    nullif(btrim(coalesce(p_fields->>'branch_id','')),'')::uuid,
    p_fields->>'branch_code');
  if v_branch is null then
    select id into v_branch from public.branches
      where tenant_id = v_tenant and deleted_at is null
      order by is_head_office desc, code limit 1;
  end if;

  v_pickup := nullif(btrim(coalesce(p_fields->>'pickup_id','')),'')::uuid;
  if v_pickup is not null then
    if not exists (
      select 1 from public.pickups p
       where p.id = v_pickup and p.tenant_id = v_tenant and p.deleted_at is null
    ) then
      raise exception 'Pickup not found in tenant' using errcode = '22023';
    end if;
  end if;

  begin
    v_date := coalesce((p_fields->>'book_date')::date, current_date);
  exception when others then
    raise exception 'Invalid book_date' using errcode = '22023';
  end;
  begin
    v_time := nullif(btrim(coalesce(p_fields->>'book_time','')),'')::time;
  exception when others then
    raise exception 'Invalid book_time' using errcode = '22023';
  end;

  v_pieces_u := upper(coalesce(nullif(btrim(p_fields->>'pieces_unit'),''), 'DOX'));
  if v_pieces_u not in ('DOX','NDOX','ENV') then v_pieces_u := 'DOX'; end if;

  v_shipper := coalesce(p_fields->'shipper', '{}'::jsonb);
  if jsonb_typeof(v_shipper) <> 'object' then v_shipper := '{}'::jsonb; end if;
  v_consignee := coalesce(p_fields->'consignee', '{}'::jsonb);
  if jsonb_typeof(v_consignee) <> 'object' then v_consignee := '{}'::jsonb; end if;
  v_extras := coalesce(p_fields->'wizard_extras', '{}'::jsonb);
  if jsonb_typeof(v_extras) <> 'object' then v_extras := '{}'::jsonb; end if;

  select fy.id into v_fy
    from public.financial_years fy
   where fy.tenant_id = v_tenant and fy.deleted_at is null and fy.is_active
     and (fy.branch_id is not distinct from v_branch or fy.branch_id is null)
   order by case when fy.branch_id = v_branch then 0 else 1 end, fy.from_date desc
   limit 1;

  if p_id is null then
    if not app.user_has_permission(v_tenant, 'txn.awb-entry', 'add') then
      raise exception 'Permission denied: txn.awb-entry add' using errcode = '42501';
    end if;

    select * into v_alloc from app.allocate_document_no(v_tenant, 'AWB', v_branch, v_fy);

    insert into public.shipments (
      tenant_id, awb_no, book_date, book_time, reference_no,
      customer_id, branch_id, origin_destination_id, destination_id,
      shipper, consignee, product_id, vendor_id, airline, service, payment_type,
      content, instruction, field_executive_id, pickup_id,
      pieces, pieces_unit, actual_weight, weight_unit, vol_weight, charge_weight,
      shipment_value, currency, is_commercial, is_oda, medical_charges,
      customer_charges_total, vendor_charges_total,
      cash_receipt_no, amount_received, balance_amount, cash_receipt_date,
      forwarding_awb, delivery_awb, return_awb, delivery_vendor_id, delivery_service,
      flight_no, current_status, status_at, is_locked, wizard_extras,
      created_by, updated_by)
    values (
      v_tenant, v_alloc.formatted_no, v_date, v_time,
      nullif(btrim(coalesce(p_fields->>'reference_no','')),''),
      v_customer, v_branch, v_origin, v_dest,
      v_shipper, v_consignee, v_product, v_vendor,
      nullif(btrim(coalesce(p_fields->>'airline','')),''),
      nullif(btrim(coalesce(p_fields->>'service','')),''),
      nullif(btrim(coalesce(p_fields->>'payment_type','')),''),
      nullif(btrim(coalesce(p_fields->>'content','')),''),
      nullif(btrim(coalesce(p_fields->>'instruction','')),''),
      v_fe, v_pickup,
      coalesce(nullif(btrim(coalesce(p_fields->>'pieces','')),'')::integer, 1),
      v_pieces_u,
      coalesce(nullif(btrim(coalesce(p_fields->>'actual_weight','')),'')::numeric, 0),
      coalesce(nullif(btrim(p_fields->>'weight_unit'),''), 'KG'),
      coalesce(nullif(btrim(coalesce(p_fields->>'vol_weight','')),'')::numeric, 0),
      coalesce(nullif(btrim(coalesce(p_fields->>'charge_weight','')),'')::numeric, 0),
      nullif(btrim(coalesce(p_fields->>'shipment_value','')),'')::numeric,
      coalesce(nullif(btrim(p_fields->>'currency'),''), 'INR'),
      coalesce((p_fields->>'is_commercial')::boolean, false),
      coalesce((p_fields->>'is_oda')::boolean, false),
      coalesce((p_fields->>'medical_charges')::boolean, false),
      coalesce(nullif(btrim(coalesce(p_fields->>'customer_charges_total','')),'')::numeric, 0),
      coalesce(nullif(btrim(coalesce(p_fields->>'vendor_charges_total','')),'')::numeric, 0),
      nullif(btrim(coalesce(p_fields->>'cash_receipt_no','')),''),
      nullif(btrim(coalesce(p_fields->>'amount_received','')),'')::numeric,
      nullif(btrim(coalesce(p_fields->>'balance_amount','')),'')::numeric,
      nullif(btrim(coalesce(p_fields->>'cash_receipt_date','')),'')::date,
      nullif(btrim(coalesce(p_fields->>'forwarding_awb','')),''),
      nullif(btrim(coalesce(p_fields->>'delivery_awb','')),''),
      nullif(btrim(coalesce(p_fields->>'return_awb','')),''),
      v_dvendor,
      nullif(btrim(coalesce(p_fields->>'delivery_service','')),''),
      nullif(btrim(coalesce(p_fields->>'flight_no','')),''),
      'DRAFT', now(), coalesce((p_fields->>'is_locked')::boolean, false), v_extras,
      auth.uid(), auth.uid())
    returning * into v_s;

    perform app.sync_shipment_pieces(v_tenant, v_s.id, p_pieces);
    perform app.sync_shipment_charge_snapshots(v_tenant, v_s.id, p_charges);
    perform app.sync_shipment_comments(v_tenant, v_s.id, p_comments);
    perform app.sync_shipment_attachments(v_tenant, v_s.id, p_attachments);

    perform app.append_shipment_event(
      v_tenant, v_s.id, 'CREATED', 'Shipment Created',
      jsonb_build_object('awb_no', v_s.awb_no, 'status', v_s.current_status));

    perform app.write_audit_log(
      p_tenant_id => v_tenant, p_entity_type => 'shipments', p_action => 'ADD',
      p_entity_id => v_s.id, p_module_slug => 'txn.awb-entry',
      p_new => jsonb_build_object('awb_no', v_s.awb_no, 'status', 'DRAFT'));
  else
    if not app.user_has_permission(v_tenant, 'txn.awb-entry', 'modify') then
      raise exception 'Permission denied: txn.awb-entry modify' using errcode = '42501';
    end if;

    select * into v_s from public.shipments
      where id = p_id and tenant_id = v_tenant and deleted_at is null;
    if not found then
      raise exception 'Shipment not found' using errcode = 'P0002';
    end if;
    if v_s.current_status <> 'DRAFT' then
      raise exception 'Only DRAFT shipments can be edited' using errcode = 'CMS02';
    end if;
    if v_s.is_locked then
      raise exception 'Shipment is locked' using errcode = 'CMS02';
    end if;

    update public.shipments set
      book_date = v_date,
      book_time = v_time,
      reference_no = nullif(btrim(coalesce(p_fields->>'reference_no','')),''),
      customer_id = v_customer,
      branch_id = v_branch,
      origin_destination_id = v_origin,
      destination_id = v_dest,
      shipper = v_shipper,
      consignee = v_consignee,
      product_id = v_product,
      vendor_id = v_vendor,
      airline = nullif(btrim(coalesce(p_fields->>'airline','')),''),
      service = nullif(btrim(coalesce(p_fields->>'service','')),''),
      payment_type = nullif(btrim(coalesce(p_fields->>'payment_type','')),''),
      content = nullif(btrim(coalesce(p_fields->>'content','')),''),
      instruction = nullif(btrim(coalesce(p_fields->>'instruction','')),''),
      field_executive_id = v_fe,
      pickup_id = v_pickup,
      pieces = coalesce(nullif(btrim(coalesce(p_fields->>'pieces','')),'')::integer, pieces),
      pieces_unit = v_pieces_u,
      actual_weight = coalesce(nullif(btrim(coalesce(p_fields->>'actual_weight','')),'')::numeric, actual_weight),
      weight_unit = coalesce(nullif(btrim(p_fields->>'weight_unit'),''), weight_unit),
      vol_weight = coalesce(nullif(btrim(coalesce(p_fields->>'vol_weight','')),'')::numeric, vol_weight),
      charge_weight = coalesce(nullif(btrim(coalesce(p_fields->>'charge_weight','')),'')::numeric, charge_weight),
      shipment_value = nullif(btrim(coalesce(p_fields->>'shipment_value','')),'')::numeric,
      currency = coalesce(nullif(btrim(p_fields->>'currency'),''), currency),
      is_commercial = coalesce((p_fields->>'is_commercial')::boolean, is_commercial),
      is_oda = coalesce((p_fields->>'is_oda')::boolean, is_oda),
      medical_charges = coalesce((p_fields->>'medical_charges')::boolean, medical_charges),
      customer_charges_total = coalesce(nullif(btrim(coalesce(p_fields->>'customer_charges_total','')),'')::numeric, customer_charges_total),
      vendor_charges_total = coalesce(nullif(btrim(coalesce(p_fields->>'vendor_charges_total','')),'')::numeric, vendor_charges_total),
      cash_receipt_no = nullif(btrim(coalesce(p_fields->>'cash_receipt_no','')),''),
      amount_received = nullif(btrim(coalesce(p_fields->>'amount_received','')),'')::numeric,
      balance_amount = nullif(btrim(coalesce(p_fields->>'balance_amount','')),'')::numeric,
      cash_receipt_date = nullif(btrim(coalesce(p_fields->>'cash_receipt_date','')),'')::date,
      forwarding_awb = nullif(btrim(coalesce(p_fields->>'forwarding_awb','')),''),
      delivery_awb = nullif(btrim(coalesce(p_fields->>'delivery_awb','')),''),
      return_awb = nullif(btrim(coalesce(p_fields->>'return_awb','')),''),
      delivery_vendor_id = v_dvendor,
      delivery_service = nullif(btrim(coalesce(p_fields->>'delivery_service','')),''),
      flight_no = nullif(btrim(coalesce(p_fields->>'flight_no','')),''),
      is_locked = coalesce((p_fields->>'is_locked')::boolean, is_locked),
      wizard_extras = v_extras,
      updated_by = auth.uid()
    where id = p_id and tenant_id = v_tenant and deleted_at is null
      and row_version = p_row_version
    returning * into v_s;

    if not found then
      raise exception 'This record was changed by someone else. Reload and try again.'
        using errcode = '40001';
    end if;

    perform app.sync_shipment_pieces(v_tenant, v_s.id, p_pieces);
    perform app.sync_shipment_charge_snapshots(v_tenant, v_s.id, p_charges);
    perform app.sync_shipment_comments(v_tenant, v_s.id, p_comments);
    perform app.sync_shipment_attachments(v_tenant, v_s.id, p_attachments);

    perform app.append_shipment_event(
      v_tenant, v_s.id, 'UPDATED', 'Shipment Updated',
      jsonb_build_object('awb_no', v_s.awb_no, 'row_version', v_s.row_version));
  end if;

  return v_s;
end
$$;

comment on function public.save_shipment(uuid, integer, jsonb, jsonb, jsonb, jsonb, jsonb) is
  'Create/update DRAFT shipment aggregate. Allocates AWB on insert; syncs pieces/charges/comments/attachments.';

revoke all on function public.save_shipment(uuid, integer, jsonb, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function public.save_shipment(uuid, integer, jsonb, jsonb, jsonb, jsonb, jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- confirm_booking — DRAFT → BOOKED
-- ---------------------------------------------------------------------------
create or replace function public.confirm_booking(
  p_id          uuid,
  p_row_version integer
)
returns public.shipments
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_s      public.shipments;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not app.user_has_permission(v_tenant, 'txn.awb-entry', 'modify') then
    raise exception 'Permission denied: txn.awb-entry modify' using errcode = '42501';
  end if;

  select * into v_s from public.shipments
    where id = p_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;

  perform app.assert_status_transition('SHIPMENT', v_s.current_status, 'BOOKED');

  update public.shipments set
    current_status = 'BOOKED',
    status_at = now(),
    booked_at = now(),
    booked_by = auth.uid(),
    updated_by = auth.uid()
  where id = p_id and tenant_id = v_tenant and deleted_at is null
    and row_version = p_row_version
  returning * into v_s;

  if not found then
    raise exception 'This record was changed by someone else. Reload and try again.'
      using errcode = '40001';
  end if;

  perform app.append_shipment_event(
    v_tenant, v_s.id, 'BOOKED', 'Shipment Booked',
    jsonb_build_object('awb_no', v_s.awb_no));

  perform app.write_audit_log(
    p_tenant_id => v_tenant, p_entity_type => 'shipments', p_action => 'MODIFY',
    p_entity_id => v_s.id, p_module_slug => 'txn.awb-entry',
    p_new => jsonb_build_object('status', 'BOOKED', 'awb_no', v_s.awb_no));

  return v_s;
end
$$;

revoke all on function public.confirm_booking(uuid, integer) from public;
grant execute on function public.confirm_booking(uuid, integer)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- cancel_shipment — DRAFT|BOOKED → CANCELLED
-- ---------------------------------------------------------------------------
create or replace function public.cancel_shipment(
  p_id          uuid,
  p_row_version integer,
  p_reason      text default null
)
returns public.shipments
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_s      public.shipments;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not (app.user_has_permission(v_tenant, 'txn.awb-entry-void-cancel', 'add')
       or app.user_has_permission(v_tenant, 'txn.awb-entry-void-cancel', 'modify')
       or app.user_has_permission(v_tenant, 'txn.awb-entry', 'modify')) then
    raise exception 'Permission denied: txn.awb-entry-void-cancel' using errcode = '42501';
  end if;

  select * into v_s from public.shipments
    where id = p_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;

  perform app.assert_status_transition('SHIPMENT', v_s.current_status, 'CANCELLED');

  update public.shipments set
    current_status = 'CANCELLED',
    status_at = now(),
    cancelled_at = now(),
    cancelled_by = auth.uid(),
    wizard_extras = wizard_extras || jsonb_build_object(
      'cancel_reason', nullif(btrim(coalesce(p_reason,'')),'')),
    updated_by = auth.uid()
  where id = p_id and tenant_id = v_tenant and deleted_at is null
    and row_version = p_row_version
  returning * into v_s;

  if not found then
    raise exception 'This record was changed by someone else. Reload and try again.'
      using errcode = '40001';
  end if;

  perform app.append_shipment_event(
    v_tenant, v_s.id, 'CANCELLED', 'Shipment Cancelled',
    jsonb_build_object('awb_no', v_s.awb_no, 'reason', p_reason));

  perform app.write_audit_log(
    p_tenant_id => v_tenant, p_entity_type => 'shipments', p_action => 'MODIFY',
    p_entity_id => v_s.id, p_module_slug => 'txn.awb-entry-void-cancel',
    p_new => jsonb_build_object('status', 'CANCELLED', 'awb_no', v_s.awb_no));

  return v_s;
end
$$;

revoke all on function public.cancel_shipment(uuid, integer, text) from public;
grant execute on function public.cancel_shipment(uuid, integer, text)
  to authenticated, service_role;
