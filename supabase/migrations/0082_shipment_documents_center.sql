-- Shipment Documents Center — versioned SSoT for vendor/system/user files.
-- UI lists a fixed catalog; new versions are append-only (never overwrite).

create table if not exists public.shipment_documents (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  shipment_id     uuid not null,
  document_type   text not null
                    check (document_type in (
                      'AUTHORITY_LETTER','AWB_LABEL','INVOICE',
                      'VENDOR_AWB','VENDOR_INVOICE','KYC','OTHER'
                    )),
  source          text not null default 'VENDOR'
                    check (source in ('SYSTEM','VENDOR','USER_UPLOAD')),
  vendor          text,
  file_name       text,
  file_url        text,
  content_b64     text,
  mime_type       text not null default 'application/pdf',
  file_size       bigint,
  version         integer not null default 1,
  status          text not null default 'AVAILABLE'
                    check (status in (
                      'AVAILABLE','GENERATING','WAITING','FAILED','NOT_REQUIRED'
                    )),
  raw_meta        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  deleted_at      timestamptz,
  row_version     integer not null default 1,
  constraint shipment_documents_shipment_fk
    foreign key (tenant_id, shipment_id)
    references public.shipments (tenant_id, id) on delete cascade
);

create index if not exists shipment_documents_shipment_idx
  on public.shipment_documents (tenant_id, shipment_id, document_type, version desc)
  where deleted_at is null;

drop trigger if exists trg_touch_shipment_documents on public.shipment_documents;
create trigger trg_touch_shipment_documents
  before insert or update on public.shipment_documents
  for each row execute function app.tg_touch_row();

alter table public.shipment_documents enable row level security;
drop policy if exists shipment_documents_select on public.shipment_documents;
create policy shipment_documents_select on public.shipment_documents
  for select using (
    tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin()
  );

-- Map legacy vendor doc_type → center document_type
create or replace function app.map_vendor_doc_type(p_doc_type text)
returns text
language sql
immutable
as $$
  select case upper(coalesce(p_doc_type, ''))
    when 'AUTHORITY_LETTER' then 'AUTHORITY_LETTER'
    when 'VENDOR_AWB' then 'VENDOR_AWB'
    when 'VENDOR_INVOICE' then 'VENDOR_INVOICE'
    when 'COMMERCIAL_INVOICE' then 'VENDOR_INVOICE'
    when 'SHIPPING_LABEL' then 'AWB_LABEL'
    when 'BOX_LABEL' then 'AWB_LABEL'
    when 'KYC' then 'KYC'
    when 'INVOICE' then 'INVOICE'
    else 'OTHER'
  end;
$$;

create or replace function app.save_shipment_document(
  p_tenant uuid,
  p_shipment uuid,
  p_fields jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_type text := upper(nullif(btrim(coalesce(p_fields->>'document_type', p_fields->>'doc_type', '')), ''));
  v_source text := upper(coalesce(nullif(btrim(p_fields->>'source'), ''), 'VENDOR'));
  v_status text := upper(coalesce(nullif(btrim(p_fields->>'status'), ''), 'AVAILABLE'));
  v_version integer;
  v_id uuid;
  v_url text := nullif(btrim(coalesce(p_fields->>'file_url', p_fields->>'source_url', '')), '');
  v_b64 text := nullif(btrim(coalesce(p_fields->>'content_b64', '')), '');
begin
  if v_type is null then
    raise exception 'document_type is required' using errcode = 'CMS04';
  end if;
  v_type := app.map_vendor_doc_type(v_type);
  if v_type = 'OTHER' and upper(coalesce(p_fields->>'document_type','')) not in ('OTHER','') then
    v_type := upper(btrim(p_fields->>'document_type'));
  end if;
  if v_source not in ('SYSTEM','VENDOR','USER_UPLOAD') then
    v_source := 'VENDOR';
  end if;
  if v_status not in ('AVAILABLE','GENERATING','WAITING','FAILED','NOT_REQUIRED') then
    v_status := case when v_url is not null or v_b64 is not null then 'AVAILABLE' else 'WAITING' end;
  end if;
  if v_url is not null or v_b64 is not null then
    v_status := 'AVAILABLE';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.shipment_documents
  where tenant_id = p_tenant and shipment_id = p_shipment
    and document_type = v_type and deleted_at is null;

  insert into public.shipment_documents (
    tenant_id, shipment_id, document_type, source, vendor, file_name,
    file_url, content_b64, mime_type, file_size, version, status, raw_meta,
    created_by, updated_by
  ) values (
    p_tenant, p_shipment, v_type, v_source,
    nullif(btrim(coalesce(p_fields->>'vendor', '')), ''),
    nullif(btrim(coalesce(p_fields->>'file_name', p_fields->>'label', '')), ''),
    v_url, v_b64,
    coalesce(nullif(btrim(p_fields->>'mime_type'), ''), 'application/pdf'),
    nullif(p_fields->>'file_size', '')::bigint,
    v_version, v_status,
    coalesce(p_fields->'raw_meta', '{}'::jsonb),
    app.current_user_id(), app.current_user_id()
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Catalog for UI: always returns the 6 center types + latest version metadata
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

  select * into v_s
  from public.shipments
  where id = p_shipment_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;

  with catalog(document_type, title, default_status) as (
    values
      ('AUTHORITY_LETTER', 'Authority Letter', 'WAITING'),
      ('AWB_LABEL', 'AWB Label', 'NOT_REQUIRED'),
      ('INVOICE', 'Invoice', 'NOT_REQUIRED'),
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
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'type', c.document_type,
      'title', c.title,
      'status', case
        when l.id is null then c.default_status
        when (l.file_url is not null or l.content_b64 is not null) then 'AVAILABLE'
        else coalesce(l.status, c.default_status)
      end,
      'id', l.id,
      'url', l.file_url,
      'content_b64', l.content_b64,
      'fileName', coalesce(l.file_name, c.title),
      'mimeType', coalesce(l.mime_type, 'application/pdf'),
      'fileSize', l.file_size,
      'version', l.version,
      'source', l.source,
      'vendor', l.vendor,
      'createdAt', l.created_at,
      'updatedAt', l.updated_at,
      'available', (l.file_url is not null or l.content_b64 is not null)
    )
    order by array_position(
      array['AUTHORITY_LETTER','AWB_LABEL','INVOICE','VENDOR_AWB','VENDOR_INVOICE','KYC'],
      c.document_type
    )
  ), '[]'::jsonb)
  into v_rows
  from catalog c
  left join latest l on l.document_type = c.document_type;

  return v_rows;
end;
$$;

revoke all on function public.list_shipment_documents(uuid) from public;
grant execute on function public.list_shipment_documents(uuid) to authenticated, service_role;

create or replace function public.save_shipment_document(
  p_shipment_id uuid,
  p_fields jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_id uuid;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context' using errcode = '42501';
  end if;
  perform app.assert_carrier_shipment_permission(v_tenant, 'modify');

  if not exists (
    select 1 from public.shipments
    where id = p_shipment_id and tenant_id = v_tenant and deleted_at is null
  ) then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;

  v_id := app.save_shipment_document(v_tenant, p_shipment_id, p_fields);
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.save_shipment_document(uuid, jsonb) from public;
grant execute on function public.save_shipment_document(uuid, jsonb)
  to authenticated, service_role;

-- Dual-write vendor booking docs into shipment_documents (append versions)
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
  v_mapped text;
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

      v_mapped := app.map_vendor_doc_type(coalesce(v_doc->>'doc_type', 'OTHER'));
      if v_mapped <> 'OTHER' or coalesce(v_doc->>'doc_type','') in (
        'AUTHORITY_LETTER','AWB_LABEL','INVOICE','VENDOR_AWB','VENDOR_INVOICE','KYC'
      ) then
        perform app.save_shipment_document(v_tenant, v_s.id, jsonb_build_object(
          'document_type', v_mapped,
          'source', 'VENDOR',
          'vendor', coalesce(p_result->>'vendor_provider', v_s.vendor_provider),
          'file_name', coalesce(v_doc->>'label', v_mapped),
          'file_url', v_doc->>'source_url',
          'content_b64', v_doc->>'content_b64',
          'mime_type', coalesce(v_doc->>'mime_type', 'application/pdf'),
          'status', 'AVAILABLE',
          'raw_meta', coalesce(v_doc->'raw_meta', '{}'::jsonb)
        ));
      end if;

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

comment on table public.shipment_documents is
  'Versioned shipment document center (vendor/system/user). Append-only versions.';
