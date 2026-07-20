-- List catalog without bulky content_b64 (avoids PostgREST payload limits).
-- Fetch file bytes separately via get_shipment_document.

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
      ('AWB_LABEL', 'AWB Label', 'WAITING'),
      ('INVOICE', 'Invoice', 'WAITING'),
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
      'fileName', coalesce(l.file_name, c.title),
      'mimeType', coalesce(l.mime_type, 'application/pdf'),
      'fileSize', l.file_size,
      'version', l.version,
      'source', l.source,
      'vendor', l.vendor,
      'createdAt', l.created_at,
      'updatedAt', l.updated_at,
      'available', (l.file_url is not null or l.content_b64 is not null),
      'hasContent', (l.content_b64 is not null)
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

create or replace function public.get_shipment_document(
  p_shipment_id uuid,
  p_document_type text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_row public.shipment_documents;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.shipments
    where id = p_shipment_id and tenant_id = v_tenant and deleted_at is null
  ) then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;

  select * into v_row
  from public.shipment_documents d
  where d.tenant_id = v_tenant
    and d.shipment_id = p_shipment_id
    and d.document_type = upper(btrim(p_document_type))
    and d.deleted_at is null
  order by d.version desc, d.created_at desc
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'type', v_row.document_type,
    'source', v_row.source,
    'vendor', v_row.vendor,
    'fileName', v_row.file_name,
    'url', v_row.file_url,
    'content_b64', v_row.content_b64,
    'mimeType', coalesce(v_row.mime_type, 'application/pdf'),
    'fileSize', v_row.file_size,
    'version', v_row.version,
    'status', v_row.status,
    'createdAt', v_row.created_at,
    'available', (v_row.file_url is not null or v_row.content_b64 is not null)
  );
end;
$$;

revoke all on function public.get_shipment_document(uuid, text) from public;
grant execute on function public.get_shipment_document(uuid, text) to authenticated, service_role;
