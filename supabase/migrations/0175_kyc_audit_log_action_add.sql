-- Migration 0175: Fix KYC document audit log action to match audit_logs_action_check ('ADD' instead of 'CREATE')

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

  -- KYC-12: Write audit log for document creation using valid action 'ADD'
  perform app.write_audit_log(
    p_tenant_id => p_tenant,
    p_entity_type => 'shipment_documents',
    p_action => 'ADD',
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

