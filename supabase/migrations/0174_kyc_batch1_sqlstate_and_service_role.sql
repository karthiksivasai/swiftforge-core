-- Migration 0174: KYC Batch 1 - Fix SQLSTATE format and service_role tenant fallback
-- Fixes:
-- 1. In app.save_shipment_document and public.delete_shipment_document:
--    PostgreSQL requires 5-character SQLSTATE error codes. Replace 'LOCKED' with 'LCK01'.
-- 2. In public.save_shipment_document and public.delete_shipment_document:
--    Provide tenant resolution and permission bypass for service_role and platform_admin.

-- 1. Update app.save_shipment_document with valid SQLSTATE LCK01
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
  -- KYC-11: Reject document changes if shipment is locked
  if exists (
    select 1 from public.shipments
    where id = p_shipment and tenant_id = p_tenant and deleted_at is null and is_locked = true
  ) then
    raise exception 'Shipment is locked' using errcode = 'LCK01';
  end if;

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

  -- KYC-12: Write audit log for document creation
  perform app.write_audit_log(
    p_tenant_id => p_tenant,
    p_entity_type => 'shipment_documents',
    p_action => 'CREATE',
    p_entity_id => v_id,
    p_module_slug => 'txn.awb-entry',
    p_new => jsonb_build_object(
      'shipment_id', p_shipment,
      'document_type', v_type,
      'file_name', coalesce(p_fields->>'file_name', p_fields->>'fileName'),
      'version', v_version,
      'source', v_source,
      'raw_meta', coalesce(p_fields->'raw_meta', '{}'::jsonb)
    )
  );

  return v_id;
end;
$$;

-- 2. Update public.save_shipment_document with service_role fallback
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
    if auth.role() = 'service_role' or app.is_platform_admin() then
      select tenant_id into v_tenant from public.shipments where id = p_shipment_id;
      if v_tenant is null then
        select id into v_tenant from public.tenants order by created_at asc limit 1;
      end if;
    else
      raise exception 'No tenant context' using errcode = '42501';
    end if;
  end if;

  if auth.role() <> 'service_role' and not app.is_platform_admin() then
    perform app.assert_carrier_shipment_permission(v_tenant, 'modify');
  end if;

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

-- 3. Update public.delete_shipment_document with valid SQLSTATE LCK01 and service_role fallback
create or replace function public.delete_shipment_document(
  p_shipment_id uuid,
  p_document_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_doc public.shipment_documents;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    if auth.role() = 'service_role' or app.is_platform_admin() then
      select tenant_id into v_tenant from public.shipments where id = p_shipment_id;
      if v_tenant is null then
        select id into v_tenant from public.tenants order by created_at asc limit 1;
      end if;
    else
      raise exception 'No tenant context' using errcode = '42501';
    end if;
  end if;

  if auth.role() <> 'service_role' and not app.is_platform_admin() then
    if not app.user_has_permission(v_tenant, 'txn.awb-entry', 'delete')
       and not app.user_has_permission(v_tenant, 'txn.awb-entry', 'modify') then
      raise exception 'AWB Entry permission is required' using errcode = '42501';
    end if;
  end if;

  if exists (
    select 1 from public.shipments
    where id = p_shipment_id and tenant_id = v_tenant and deleted_at is null and is_locked = true
  ) then
    raise exception 'Shipment is locked' using errcode = 'LCK01';
  end if;

  select * into v_doc
  from public.shipment_documents
  where id = p_document_id and shipment_id = p_shipment_id and tenant_id = v_tenant and deleted_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'document_not_found');
  end if;

  update public.shipment_documents
  set deleted_at = now(), updated_by = app.current_user_id()
  where id = p_document_id;

  perform app.write_audit_log(
    p_tenant_id => v_tenant,
    p_entity_type => 'shipment_documents',
    p_action => 'DELETE',
    p_entity_id => p_document_id,
    p_module_slug => 'txn.awb-entry',
    p_old => jsonb_build_object(
      'shipment_id', p_shipment_id,
      'document_type', v_doc.document_type,
      'file_name', v_doc.file_name,
      'version', v_doc.version
    )
  );

  return jsonb_build_object('ok', true, 'id', p_document_id);
end;
$$;

revoke all on function public.delete_shipment_document(uuid, uuid) from public;
grant execute on function public.delete_shipment_document(uuid, uuid)
  to authenticated, service_role;

