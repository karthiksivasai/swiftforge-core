-- Soft-delete blank sandbox/placeholder docs that showed "Available" but opened empty.
-- Authority Letter must come from live vendor API (file_url or real vendor PDF bytes).

update public.shipment_documents
set deleted_at = now(),
    updated_at = now()
where deleted_at is null
  and (
    coalesce(raw_meta->>'placeholder', '') = 'true'
    or coalesce(raw_meta->>'sandbox', '') = 'true'
    or coalesce(raw_meta->>'generator', '') like 'internal-authority%'
    or (
      document_type = 'AUTHORITY_LETTER'
      and source = 'SYSTEM'
    )
    or (
      file_url is null
      and content_b64 is not null
      and length(content_b64) < 900
    )
  );

-- List: Available only for real vendor files (not tiny/sandbox placeholders).
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
  ),
  scored as (
    select
      c.*,
      l.*,
      case
        when l.id is null then false
        when coalesce(l.raw_meta->>'placeholder', '') = 'true' then false
        when coalesce(l.raw_meta->>'sandbox', '') = 'true' then false
        when coalesce(l.raw_meta->>'generator', '') like 'internal-authority%' then false
        when c.document_type = 'AUTHORITY_LETTER'
          and nullif(btrim(coalesce(l.file_url, '')), '') is null
          and not (
            l.content_b64 is not null
            and l.source = 'VENDOR'
            and length(l.content_b64) > 900
          )
          then false
        when nullif(btrim(coalesce(l.file_url, '')), '') is not null then true
        when l.content_b64 is not null and length(l.content_b64) > 900 then true
        else false
      end as is_available
    from catalog c
    left join latest l on l.document_type = c.document_type
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'type', s.document_type,
      'title', s.title,
      'status', case
        when s.id is null then s.default_status
        when s.is_available then 'AVAILABLE'
        else 'WAITING'
      end,
      'id', s.id,
      'url', s.file_url,
      'fileName', coalesce(s.file_name, s.title),
      'mimeType', coalesce(s.mime_type, 'application/pdf'),
      'fileSize', s.file_size,
      'version', s.version,
      'source', s.source,
      'vendor', s.vendor,
      'createdAt', s.created_at,
      'updatedAt', s.updated_at,
      'available', s.is_available,
      'hasContent', (s.content_b64 is not null and s.is_available)
    )
    order by array_position(
      array['AUTHORITY_LETTER','AWB_LABEL','INVOICE','VENDOR_AWB','VENDOR_INVOICE','KYC'],
      s.document_type
    )
  ), '[]'::jsonb)
  into v_rows
  from scored s;

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
  v_available boolean;
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

  v_available :=
    coalesce(v_row.raw_meta->>'placeholder', '') <> 'true'
    and coalesce(v_row.raw_meta->>'sandbox', '') <> 'true'
    and coalesce(v_row.raw_meta->>'generator', '') not like 'internal-authority%'
    and (
      nullif(btrim(coalesce(v_row.file_url, '')), '') is not null
      or (
        v_row.content_b64 is not null
        and length(v_row.content_b64) > 900
        and (
          upper(btrim(p_document_type)) <> 'AUTHORITY_LETTER'
          or v_row.source = 'VENDOR'
        )
      )
    );

  if not v_available then
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
    'status', 'AVAILABLE',
    'createdAt', v_row.created_at,
    'available', true
  );
end;
$$;
