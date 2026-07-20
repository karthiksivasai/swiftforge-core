-- ===========================================================================
-- 0077  Vendor Shipping API (provider-agnostic + OTP)
-- ---------------------------------------------------------------------------
-- Per-tenant vendor_integrations, shipment vendor status/sync metadata,
-- classified documents, activity timeline, and RPCs for AWB Book pipeline.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Provider registry: allow VENDOR_GATEWAY + seed providers
-- ---------------------------------------------------------------------------
alter table public.integration_providers
  drop constraint if exists integration_providers_provider_type_check;

alter table public.integration_providers
  add constraint integration_providers_provider_type_check
  check (provider_type in ('CARRIER', 'EINVOICE', 'CUSTOMS', 'VENDOR_GATEWAY'));

insert into public.integration_providers (
  provider_code, provider_name, provider_type, status,
  supports_booking, supports_tracking, supports_labels, supports_serviceability, sort_order
) values
  ('XPRESION', 'Vendor Gateway (Xpresion-compatible)', 'VENDOR_GATEWAY', 'ACTIVE', true, true, true, false, 5),
  ('DHL',      'DHL',        'CARRIER', 'ACTIVE', true, true, true, true, 20),
  ('FEDEX',    'FedEx',      'CARRIER', 'ACTIVE', true, true, true, true, 10),
  ('UPS',      'UPS',        'CARRIER', 'ACTIVE', true, true, true, true, 70),
  ('DTDC',     'DTDC',       'CARRIER', 'ACTIVE', true, true, true, true, 40),
  ('ARAMEX',   'Aramex',     'CARRIER', 'ACTIVE', true, true, true, true, 60)
on conflict (provider_code) do update
  set provider_name = excluded.provider_name,
      provider_type = excluded.provider_type,
      status = excluded.status,
      supports_booking = excluded.supports_booking,
      supports_tracking = excluded.supports_tracking,
      supports_labels = excluded.supports_labels,
      supports_serviceability = excluded.supports_serviceability,
      sort_order = excluded.sort_order,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- Vendor Master: shipping API flags
-- ---------------------------------------------------------------------------
alter table public.vendors
  add column if not exists shipping_api_enabled boolean not null default false;

alter table public.vendors
  add column if not exists vendor_integration_id uuid;

-- ---------------------------------------------------------------------------
-- vendor_integrations — per-tenant provider config
-- ---------------------------------------------------------------------------
create table if not exists public.vendor_integrations (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  provider_code        text not null,
  credential_id        uuid references public.integration_credentials(id) on delete set null,
  endpoint_url         text,
  is_enabled           boolean not null default true,
  requires_otp         boolean not null default true,
  account_number       text,
  customer_code        text,
  enabled_services     text[] not null default '{}',
  supported_products   text[] not null default '{}',
  mapped_vendor_ids    uuid[] not null default '{}',
  remark               text,
  created_at           timestamptz not null default now(),
  created_by           uuid,
  updated_at           timestamptz not null default now(),
  updated_by           uuid,
  deleted_at           timestamptz,
  row_version          integer not null default 1,
  constraint vendor_integrations_tenant_id_uq unique (tenant_id, id)
);

create unique index if not exists vendor_integrations_tenant_provider_uq
  on public.vendor_integrations (tenant_id, provider_code)
  where deleted_at is null;

create index if not exists vendor_integrations_tenant_idx
  on public.vendor_integrations (tenant_id)
  where deleted_at is null;

drop trigger if exists trg_touch_vendor_integrations on public.vendor_integrations;
create trigger trg_touch_vendor_integrations
  before insert or update on public.vendor_integrations
  for each row execute function app.tg_touch_row();

alter table public.vendor_integrations enable row level security;
drop policy if exists vendor_integrations_select on public.vendor_integrations;
create policy vendor_integrations_select on public.vendor_integrations
  for select using (
    tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin()
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'vendors_vendor_integration_fk'
  ) then
    alter table public.vendors
      add constraint vendors_vendor_integration_fk
      foreign key (tenant_id, vendor_integration_id)
      references public.vendor_integrations (tenant_id, id)
      on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Shipment vendor API columns
-- ---------------------------------------------------------------------------
alter table public.shipments
  add column if not exists vendor_api_status text not null default 'NONE';

alter table public.shipments
  drop constraint if exists shipments_vendor_api_status_check;

alter table public.shipments
  add constraint shipments_vendor_api_status_check
  check (vendor_api_status in (
    'NONE','PENDING_CONFIRMATION','BOOKING_IN_PROGRESS','OTP_REQUIRED',
    'VENDOR_PENDING','VENDOR_BOOKED','FAILED'
  ));

alter table public.shipments add column if not exists vendor_api_awb text;
alter table public.shipments add column if not exists vendor_api_ref text;
alter table public.shipments add column if not exists vendor_api_raw_response jsonb not null default '{}'::jsonb;
alter table public.shipments add column if not exists vendor_booking_id text;
alter table public.shipments add column if not exists vendor_tracking_number text;
alter table public.shipments add column if not exists vendor_label_generated_at timestamptz;
alter table public.shipments add column if not exists vendor_last_sync_at timestamptz;
alter table public.shipments add column if not exists vendor_sync_status text not null default 'IDLE';
alter table public.shipments add column if not exists vendor_provider text;
alter table public.shipments add column if not exists vendor_service_code text;
alter table public.shipments add column if not exists vendor_otp_verified boolean not null default false;
alter table public.shipments add column if not exists vendor_api_booked_at timestamptz;
alter table public.shipments add column if not exists vendor_api_last_error text;

alter table public.shipments
  drop constraint if exists shipments_vendor_sync_status_check;

alter table public.shipments
  add constraint shipments_vendor_sync_status_check
  check (vendor_sync_status in ('IDLE','SYNCING','OK','PARTIAL','ERROR'));

-- ---------------------------------------------------------------------------
-- Classified vendor documents
-- ---------------------------------------------------------------------------
create table if not exists public.shipment_vendor_documents (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  shipment_id   uuid not null,
  doc_type      text not null
                  check (doc_type in (
                    'VENDOR_AWB','SHIPPING_LABEL','VENDOR_INVOICE','COMMERCIAL_INVOICE',
                    'AUTHORITY_LETTER','KYC','BOX_LABEL','CUSTOMS','OTHER'
                  )),
  label         text,
  file_id       uuid references public.files(id) on delete set null,
  source_url    text,
  content_b64   text,
  mime_type     text default 'application/pdf',
  raw_meta      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  deleted_at    timestamptz,
  row_version   integer not null default 1,
  constraint shipment_vendor_documents_shipment_fk
    foreign key (tenant_id, shipment_id)
    references public.shipments (tenant_id, id) on delete cascade
);

create index if not exists shipment_vendor_documents_shipment_idx
  on public.shipment_vendor_documents (tenant_id, shipment_id)
  where deleted_at is null;

drop trigger if exists trg_touch_shipment_vendor_documents on public.shipment_vendor_documents;
create trigger trg_touch_shipment_vendor_documents
  before insert or update on public.shipment_vendor_documents
  for each row execute function app.tg_touch_row();

alter table public.shipment_vendor_documents enable row level security;
drop policy if exists shipment_vendor_documents_select on public.shipment_vendor_documents;
create policy shipment_vendor_documents_select on public.shipment_vendor_documents
  for select using (
    tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin()
  );

-- ---------------------------------------------------------------------------
-- Vendor activity timeline (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.shipment_vendor_activity (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  shipment_id   uuid not null,
  event_type    text not null,
  message       text not null default '',
  request_json  jsonb,
  response_json jsonb,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  constraint shipment_vendor_activity_shipment_fk
    foreign key (tenant_id, shipment_id)
    references public.shipments (tenant_id, id) on delete cascade
);

create index if not exists shipment_vendor_activity_shipment_idx
  on public.shipment_vendor_activity (tenant_id, shipment_id, created_at desc);

alter table public.shipment_vendor_activity enable row level security;
drop policy if exists shipment_vendor_activity_select on public.shipment_vendor_activity;
create policy shipment_vendor_activity_select on public.shipment_vendor_activity
  for select using (
    tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin()
  );

drop trigger if exists trg_block_shipment_vendor_activity_mut on public.shipment_vendor_activity;
create trigger trg_block_shipment_vendor_activity_mut
  before update or delete on public.shipment_vendor_activity
  for each row execute function app.tg_block_mutations();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function app.append_vendor_activity(
  p_tenant uuid,
  p_shipment uuid,
  p_event text,
  p_message text,
  p_request jsonb default null,
  p_response jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
begin
  insert into public.shipment_vendor_activity (
    tenant_id, shipment_id, event_type, message, request_json, response_json, created_by
  ) values (
    p_tenant, p_shipment, p_event, coalesce(p_message, ''),
    p_request, p_response, app.current_user_id()
  );
end;
$$;

create or replace function app.resolve_vendor_integration_for_shipment(
  p_tenant uuid,
  p_vendor_id uuid
)
returns public.vendor_integrations
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_row public.vendor_integrations;
  v_vendor public.vendors;
begin
  if p_vendor_id is null then
    return null;
  end if;

  select * into v_vendor
  from public.vendors
  where tenant_id = p_tenant and id = p_vendor_id and deleted_at is null;

  if not found then
    return null;
  end if;

  if v_vendor.vendor_integration_id is not null then
    select * into v_row
    from public.vendor_integrations
    where tenant_id = p_tenant
      and id = v_vendor.vendor_integration_id
      and deleted_at is null
      and is_enabled = true;
    if found then
      return v_row;
    end if;
  end if;

  -- Explicit mapping always wins; empty mapped_vendor_ids = tenant default gateway
  -- (also honored when vendor.shipping_api_enabled is true).
  select * into v_row
  from public.vendor_integrations vi
  where vi.tenant_id = p_tenant
    and vi.deleted_at is null
    and vi.is_enabled = true
    and (
      v_vendor.id = any (vi.mapped_vendor_ids)
      or (
        cardinality(vi.mapped_vendor_ids) = 0
        and coalesce(v_vendor.shipping_api_enabled, false)
      )
      or (
        cardinality(vi.mapped_vendor_ids) = 0
        and upper(coalesce(v_vendor.code, '')) in (
          'DHL','DHL1','DHE','DHL LSP','DHL EXPRESS','MEDICINE','MEDICINE SERVICE','BS'
        )
      )
    )
  order by
    case when v_vendor.id = any (vi.mapped_vendor_ids) then 0 else 1 end,
    vi.updated_at desc
  limit 1;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_vendor_shipping_context — safe payload for FE/edge (no secrets)
-- ---------------------------------------------------------------------------
create or replace function public.get_vendor_shipping_context(p_shipment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_s public.shipments;
  v_vi public.vendor_integrations;
  v_cred public.integration_credentials;
  v_pieces jsonb;
  v_charges jsonb;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context' using errcode = '42501';
  end if;

  select * into v_s
  from public.shipments
  where id = p_shipment_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;

  v_vi := app.resolve_vendor_integration_for_shipment(v_tenant, v_s.vendor_id);

  if v_vi.credential_id is not null then
    select * into v_cred
    from public.integration_credentials
    where id = v_vi.credential_id and tenant_id = v_tenant and deleted_at is null;
  end if;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.seq), '[]'::jsonb)
    into v_pieces
  from public.shipment_pieces p
  where p.shipment_id = v_s.id and p.tenant_id = v_tenant;

  select coalesce(jsonb_agg(to_jsonb(c) order by c.seq), '[]'::jsonb)
    into v_charges
  from public.shipment_charge_snapshots c
  where c.shipment_id = v_s.id and c.tenant_id = v_tenant and c.deleted_at is null;

  return jsonb_build_object(
    'shipment', jsonb_build_object(
      'id', v_s.id,
      'row_version', v_s.row_version,
      'awb_no', v_s.awb_no,
      'book_date', v_s.book_date,
      'book_time', v_s.book_time,
      'reference_no', v_s.reference_no,
      'current_status', v_s.current_status,
      'shipper', v_s.shipper,
      'consignee', v_s.consignee,
      'product_id', v_s.product_id,
      'vendor_id', v_s.vendor_id,
      'airline', v_s.airline,
      'service', v_s.service,
      'payment_type', v_s.payment_type,
      'content', v_s.content,
      'instruction', v_s.instruction,
      'pieces', v_s.pieces,
      'pieces_unit', v_s.pieces_unit,
      'actual_weight', v_s.actual_weight,
      'charge_weight', v_s.charge_weight,
      'vol_weight', v_s.vol_weight,
      'shipment_value', v_s.shipment_value,
      'currency', v_s.currency,
      'is_commercial', v_s.is_commercial,
      'forwarding_awb', v_s.forwarding_awb,
      'delivery_awb', v_s.delivery_awb,
      'wizard_extras', v_s.wizard_extras,
      'vendor_api_status', v_s.vendor_api_status,
      'vendor_api_awb', v_s.vendor_api_awb,
      'vendor_provider', v_s.vendor_provider,
      'customer_code', (select code from public.customers where id = v_s.customer_id),
      'customer_name', (select name from public.customers where id = v_s.customer_id),
      'product_code', (select code from public.products where id = v_s.product_id),
      'vendor_code', (select code from public.vendors where id = v_s.vendor_id),
      'vendor_name', (select name from public.vendors where id = v_s.vendor_id),
      'origin_code', (select code from public.destinations where id = v_s.origin_destination_id),
      'destination_code', (select code from public.destinations where id = v_s.destination_id)
    ),
    'pieces', v_pieces,
    'charges', v_charges,
    'integration', case when v_vi.id is null then null else jsonb_build_object(
      'id', v_vi.id,
      'provider_code', v_vi.provider_code,
      'endpoint_url', coalesce(v_vi.endpoint_url, v_cred.endpoint),
      'requires_otp', v_vi.requires_otp,
      'account_number', coalesce(v_vi.account_number, v_cred.account_number),
      'customer_code', v_vi.customer_code,
      'enabled_services', to_jsonb(v_vi.enabled_services),
      'supported_products', to_jsonb(v_vi.supported_products),
      'credential_id', v_vi.credential_id,
      'has_username', v_cred.username is not null,
      'username', v_cred.username,
      'sandbox_mode', coalesce(v_cred.sandbox_mode, true)
    ) end,
    'shipping_api_enabled', v_vi.id is not null
  );
end;
$$;

revoke all on function public.get_vendor_shipping_context(uuid) from public;
grant execute on function public.get_vendor_shipping_context(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- apply_vendor_shipping_result
-- ---------------------------------------------------------------------------
create or replace function public.apply_vendor_shipping_result(
  p_shipment_id uuid,
  p_row_version integer,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_s public.shipments;
  v_status text;
  v_docs jsonb;
  v_doc jsonb;
  v_event text;
  v_msg text;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context' using errcode = '42501';
  end if;

  select * into v_s
  from public.shipments
  where id = p_shipment_id and tenant_id = v_tenant and deleted_at is null
  for update;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;
  if p_row_version is not null and v_s.row_version <> p_row_version then
    raise exception 'Shipment was modified by another user' using errcode = '40001';
  end if;

  v_status := coalesce(nullif(btrim(p_result->>'status'), ''), 'FAILED');
  v_event := coalesce(nullif(btrim(p_result->>'event_type'), ''), 'VENDOR_BOOKING_UPDATE');
  v_msg := coalesce(p_result->>'message', '');

  update public.shipments set
    vendor_api_status = v_status,
    vendor_api_awb = coalesce(nullif(p_result->>'vendor_awb', ''), vendor_api_awb),
    vendor_api_ref = coalesce(nullif(p_result->>'vendor_ref', ''), vendor_api_ref),
    vendor_booking_id = coalesce(nullif(p_result->>'vendor_booking_id', ''), vendor_booking_id),
    vendor_tracking_number = coalesce(nullif(p_result->>'vendor_tracking_number', ''), vendor_tracking_number),
    vendor_provider = coalesce(nullif(p_result->>'vendor_provider', ''), vendor_provider),
    vendor_service_code = coalesce(nullif(p_result->>'vendor_service_code', ''), vendor_service_code),
    vendor_otp_verified = coalesce((p_result->>'otp_verified')::boolean, vendor_otp_verified),
    vendor_api_booked_at = case
      when v_status = 'VENDOR_BOOKED' then coalesce(vendor_api_booked_at, now())
      else vendor_api_booked_at
    end,
    vendor_label_generated_at = case
      when coalesce((p_result->>'label_generated')::boolean, false) then now()
      else vendor_label_generated_at
    end,
    vendor_last_sync_at = now(),
    vendor_sync_status = coalesce(nullif(p_result->>'sync_status', ''), vendor_sync_status),
    vendor_api_last_error = case
      when v_status in ('FAILED','VENDOR_PENDING','OTP_REQUIRED') then nullif(p_result->>'error', '')
      else null
    end,
    vendor_api_raw_response = coalesce(p_result->'raw_response', vendor_api_raw_response),
    forwarding_awb = coalesce(nullif(p_result->>'vendor_awb', ''), forwarding_awb),
    updated_by = app.current_user_id()
  where id = v_s.id and tenant_id = v_tenant;

  perform app.append_vendor_activity(
    v_tenant, v_s.id, v_event, v_msg,
    p_result->'request', p_result->'raw_response'
  );

  v_docs := coalesce(p_result->'documents', '[]'::jsonb);
  if jsonb_typeof(v_docs) = 'array' then
    for v_doc in select * from jsonb_array_elements(v_docs)
    loop
      insert into public.shipment_vendor_documents (
        tenant_id, shipment_id, doc_type, label, source_url, content_b64, mime_type, raw_meta, created_by
      ) values (
        v_tenant,
        v_s.id,
        coalesce(nullif(v_doc->>'doc_type', ''), 'OTHER'),
        v_doc->>'label',
        v_doc->>'source_url',
        v_doc->>'content_b64',
        coalesce(v_doc->>'mime_type', 'application/pdf'),
        coalesce(v_doc->'raw_meta', '{}'::jsonb),
        app.current_user_id()
      );
      perform app.append_vendor_activity(
        v_tenant, v_s.id, 'DOCUMENT_RECEIVED',
        coalesce(v_doc->>'label', v_doc->>'doc_type', 'Document received')
      );
    end loop;
  end if;

  select * into v_s from public.shipments where id = p_shipment_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_s.id,
    'row_version', v_s.row_version,
    'vendor_api_status', v_s.vendor_api_status,
    'vendor_api_awb', v_s.vendor_api_awb,
    'vendor_tracking_number', v_s.vendor_tracking_number,
    'vendor_otp_verified', v_s.vendor_otp_verified,
    'vendor_provider', v_s.vendor_provider,
    'vendor_sync_status', v_s.vendor_sync_status
  );
end;
$$;

revoke all on function public.apply_vendor_shipping_result(uuid, integer, jsonb) from public;
grant execute on function public.apply_vendor_shipping_result(uuid, integer, jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- set_vendor_api_status (lightweight transitions + timeline)
-- ---------------------------------------------------------------------------
create or replace function public.set_vendor_api_status(
  p_shipment_id uuid,
  p_row_version integer,
  p_status text,
  p_event_type text default null,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_s public.shipments;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context' using errcode = '42501';
  end if;

  select * into v_s
  from public.shipments
  where id = p_shipment_id and tenant_id = v_tenant and deleted_at is null
  for update;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;
  if p_row_version is not null and v_s.row_version <> p_row_version then
    raise exception 'Shipment was modified by another user' using errcode = '40001';
  end if;

  update public.shipments set
    vendor_api_status = p_status,
    vendor_last_sync_at = now(),
    updated_by = app.current_user_id()
  where id = v_s.id;

  if p_event_type is not null then
    perform app.append_vendor_activity(
      v_tenant, v_s.id, p_event_type, coalesce(p_message, p_status)
    );
  end if;

  select * into v_s from public.shipments where id = p_shipment_id;
  return jsonb_build_object(
    'ok', true,
    'id', v_s.id,
    'row_version', v_s.row_version,
    'vendor_api_status', v_s.vendor_api_status
  );
end;
$$;

revoke all on function public.set_vendor_api_status(uuid, integer, text, text, text) from public;
grant execute on function public.set_vendor_api_status(uuid, integer, text, text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- List docs / activity
-- ---------------------------------------------------------------------------
create or replace function public.list_shipment_vendor_documents(p_shipment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', d.id,
      'doc_type', d.doc_type,
      'label', d.label,
      'file_id', d.file_id,
      'source_url', d.source_url,
      'content_b64', d.content_b64,
      'mime_type', d.mime_type,
      'raw_meta', d.raw_meta,
      'created_at', d.created_at
    ) order by d.created_at desc)
    from public.shipment_vendor_documents d
    where d.tenant_id = v_tenant
      and d.shipment_id = p_shipment_id
      and d.deleted_at is null
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_shipment_vendor_documents(uuid) from public;
grant execute on function public.list_shipment_vendor_documents(uuid) to authenticated, service_role;

create or replace function public.list_shipment_vendor_activity(p_shipment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id,
      'event_type', a.event_type,
      'message', a.message,
      'created_at', a.created_at,
      'created_by', a.created_by
    ) order by a.created_at desc)
    from public.shipment_vendor_activity a
    where a.tenant_id = v_tenant and a.shipment_id = p_shipment_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_shipment_vendor_activity(uuid) from public;
grant execute on function public.list_shipment_vendor_activity(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Vendor integration CRUD
-- ---------------------------------------------------------------------------
create or replace function public.list_vendor_integrations()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context' using errcode = '42501';
  end if;
  perform app.assert_integration_permission(v_tenant, 'list');

  return jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', vi.id,
        'provider_code', vi.provider_code,
        'credential_id', vi.credential_id,
        'endpoint_url', vi.endpoint_url,
        'is_enabled', vi.is_enabled,
        'requires_otp', vi.requires_otp,
        'account_number', vi.account_number,
        'customer_code', vi.customer_code,
        'enabled_services', to_jsonb(vi.enabled_services),
        'supported_products', to_jsonb(vi.supported_products),
        'mapped_vendor_ids', to_jsonb(vi.mapped_vendor_ids),
        'remark', vi.remark,
        'row_version', vi.row_version,
        'updated_at', vi.updated_at
      ) order by vi.provider_code)
      from public.vendor_integrations vi
      where vi.tenant_id = v_tenant and vi.deleted_at is null
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.list_vendor_integrations() from public;
grant execute on function public.list_vendor_integrations() to authenticated, service_role;

create or replace function public.save_vendor_integration(
  p_id uuid,
  p_row_version integer,
  p_fields jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_row public.vendor_integrations;
  v_uid uuid := app.current_user_id();
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context' using errcode = '42501';
  end if;
  perform app.assert_integration_permission(v_tenant, 'modify');

  if p_id is null then
    insert into public.vendor_integrations (
      tenant_id, provider_code, credential_id, endpoint_url, is_enabled, requires_otp,
      account_number, customer_code, enabled_services, supported_products,
      mapped_vendor_ids, remark, created_by, updated_by
    ) values (
      v_tenant,
      upper(btrim(p_fields->>'provider_code')),
      nullif(p_fields->>'credential_id', '')::uuid,
      nullif(btrim(p_fields->>'endpoint_url'), ''),
      coalesce((p_fields->>'is_enabled')::boolean, true),
      coalesce((p_fields->>'requires_otp')::boolean, true),
      nullif(btrim(p_fields->>'account_number'), ''),
      nullif(btrim(p_fields->>'customer_code'), ''),
      coalesce(
        (select array_agg(x) from jsonb_array_elements_text(coalesce(p_fields->'enabled_services','[]'::jsonb)) t(x)),
        '{}'),
      coalesce(
        (select array_agg(x) from jsonb_array_elements_text(coalesce(p_fields->'supported_products','[]'::jsonb)) t(x)),
        '{}'),
      coalesce(
        (select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p_fields->'mapped_vendor_ids','[]'::jsonb)) t(x)),
        '{}'),
      nullif(btrim(p_fields->>'remark'), ''),
      v_uid, v_uid
    )
    returning * into v_row;
  else
    select * into v_row
    from public.vendor_integrations
    where id = p_id and tenant_id = v_tenant and deleted_at is null
    for update;
    if not found then
      raise exception 'Vendor integration not found' using errcode = 'P0002';
    end if;
    if p_row_version is not null and v_row.row_version <> p_row_version then
      raise exception 'Vendor integration was modified by another user' using errcode = '40001';
    end if;

    update public.vendor_integrations set
      provider_code = coalesce(upper(nullif(btrim(p_fields->>'provider_code'), '')), provider_code),
      credential_id = case
        when p_fields ? 'credential_id' then nullif(p_fields->>'credential_id', '')::uuid
        else credential_id
      end,
      endpoint_url = case
        when p_fields ? 'endpoint_url' then nullif(btrim(p_fields->>'endpoint_url'), '')
        else endpoint_url
      end,
      is_enabled = coalesce((p_fields->>'is_enabled')::boolean, is_enabled),
      requires_otp = coalesce((p_fields->>'requires_otp')::boolean, requires_otp),
      account_number = case
        when p_fields ? 'account_number' then nullif(btrim(p_fields->>'account_number'), '')
        else account_number
      end,
      customer_code = case
        when p_fields ? 'customer_code' then nullif(btrim(p_fields->>'customer_code'), '')
        else customer_code
      end,
      enabled_services = case
        when p_fields ? 'enabled_services' then coalesce(
          (select array_agg(x) from jsonb_array_elements_text(coalesce(p_fields->'enabled_services','[]'::jsonb)) t(x)),
          '{}')
        else enabled_services
      end,
      supported_products = case
        when p_fields ? 'supported_products' then coalesce(
          (select array_agg(x) from jsonb_array_elements_text(coalesce(p_fields->'supported_products','[]'::jsonb)) t(x)),
          '{}')
        else supported_products
      end,
      mapped_vendor_ids = case
        when p_fields ? 'mapped_vendor_ids' then coalesce(
          (select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p_fields->'mapped_vendor_ids','[]'::jsonb)) t(x)),
          '{}')
        else mapped_vendor_ids
      end,
      remark = case
        when p_fields ? 'remark' then nullif(btrim(p_fields->>'remark'), '')
        else remark
      end,
      updated_by = v_uid
    where id = p_id
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'provider_code', v_row.provider_code,
    'credential_id', v_row.credential_id,
    'endpoint_url', v_row.endpoint_url,
    'is_enabled', v_row.is_enabled,
    'requires_otp', v_row.requires_otp,
    'account_number', v_row.account_number,
    'customer_code', v_row.customer_code,
    'enabled_services', to_jsonb(v_row.enabled_services),
    'supported_products', to_jsonb(v_row.supported_products),
    'mapped_vendor_ids', to_jsonb(v_row.mapped_vendor_ids),
    'remark', v_row.remark,
    'row_version', v_row.row_version
  );
end;
$$;

revoke all on function public.save_vendor_integration(uuid, integer, jsonb) from public;
grant execute on function public.save_vendor_integration(uuid, integer, jsonb)
  to authenticated, service_role;

-- Internal decrypt helper for edge/service role booking (not granted to anon)
create or replace function app.get_vendor_integration_secrets(p_integration_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_vi public.vendor_integrations;
  v_cred public.integration_credentials;
begin
  select * into v_vi from public.vendor_integrations where id = p_integration_id and deleted_at is null;
  if not found then
    return null;
  end if;
  if v_vi.credential_id is null then
    return jsonb_build_object(
      'provider_code', v_vi.provider_code,
      'endpoint_url', v_vi.endpoint_url,
      'customer_code', v_vi.customer_code,
      'account_number', v_vi.account_number,
      'username', null,
      'password', null
    );
  end if;
  select * into v_cred from public.integration_credentials where id = v_vi.credential_id;
  return jsonb_build_object(
    'provider_code', v_vi.provider_code,
    'endpoint_url', coalesce(v_vi.endpoint_url, v_cred.endpoint),
    'customer_code', coalesce(v_vi.customer_code, v_cred.account_number),
    'account_number', coalesce(v_vi.account_number, v_cred.account_number),
    'username', v_cred.username,
    'password', app.decrypt_integration_secret(v_cred.password_enc),
    'api_key', app.decrypt_integration_secret(v_cred.api_key_enc),
    'sandbox_mode', v_cred.sandbox_mode
  );
end;
$$;

revoke all on function app.get_vendor_integration_secrets(uuid) from public;
grant execute on function app.get_vendor_integration_secrets(uuid) to service_role;

-- Public wrapper for Edge Function (service_role only — never grant to authenticated)
create or replace function public.get_vendor_integration_secrets(p_integration_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, app
as $$
  select app.get_vendor_integration_secrets(p_integration_id);
$$;

revoke all on function public.get_vendor_integration_secrets(uuid) from public;
grant execute on function public.get_vendor_integration_secrets(uuid) to service_role;

comment on table public.vendor_integrations is
  'Per-tenant vendor shipping provider config (credentials, endpoint, OTP, mapped vendors).';
comment on table public.shipment_vendor_documents is
  'Classified documents returned by vendor shipping adapters.';
comment on table public.shipment_vendor_activity is
  'Append-only vendor booking timeline for support/debug.';
