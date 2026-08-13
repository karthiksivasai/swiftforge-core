-- ===========================================================================
-- 0107  manifest progress & attachment persistence
-- ---------------------------------------------------------------------------
-- 1. Adds app.record_manifest_progress RPC to persist append-only progress
--    events to manifest_events and all associated shipment_events.
-- 2. Adds app.upload_manifest_attachment RPC to register files into public.files
--    and attach them to manifest_attachments.
-- ===========================================================================

create or replace function app.record_manifest_progress(
  p_manifest_id          uuid,
  p_bag_no               text default null,
  p_progress_date        date default current_date,
  p_progress_time        text default null,
  p_service_center_id    uuid default null,
  p_service_center_code  text default null,
  p_exception_code       text default null,
  p_mode                 text default 'add'
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant         uuid;
  v_manifest       public.manifests;
  v_sc_id          uuid := p_service_center_id;
  v_sc_code        text := p_service_center_code;
  v_sc_name        text;
  v_event_text     text;
  v_shipment_ids   uuid[];
  v_ship_id        uuid;
  v_event_payload  jsonb;
  v_clean_bag      text := nullif(btrim(coalesce(p_bag_no, '')), '');
  v_clean_mode     text := lower(coalesce(p_mode, 'add'));
begin
  -- Resolve manifest and verify tenant isolation
  select m.tenant_id into v_tenant
    from public.manifests m
   where m.id = p_manifest_id
     and m.tenant_id in (select app.user_tenant_ids())
     and m.deleted_at is null;

  if v_tenant is null then
    raise exception 'Manifest not found or access denied' using errcode = 'CMS01';
  end if;

  select * into v_manifest
    from public.manifests
   where id = p_manifest_id and tenant_id = v_tenant;

  -- Resolve service center
  if v_sc_id is not null then
    select code, name into v_sc_code, v_sc_name
      from public.service_centers
     where id = v_sc_id and tenant_id = v_tenant;
  elsif v_sc_code is not null and btrim(v_sc_code) <> '' then
    select id, name into v_sc_id, v_sc_name
      from public.service_centers
     where upper(code) = upper(btrim(v_sc_code)) and tenant_id = v_tenant and deleted_at is null
     limit 1;
  end if;

  v_event_text := format('Progress %s recorded: Service Centre %s, Exception %s%s',
    upper(v_clean_mode),
    coalesce(v_sc_code, 'N/A'),
    coalesce(p_exception_code, 'NONE'),
    case when v_clean_bag is not null then ' (Bag: ' || v_clean_bag || ')' else '' end
  );

  v_event_payload := jsonb_build_object(
    'mode', v_clean_mode,
    'bag_no', v_clean_bag,
    'progress_date', p_progress_date,
    'progress_time', p_progress_time,
    'service_center_id', v_sc_id,
    'service_center_code', v_sc_code,
    'service_center_name', v_sc_name,
    'exception_code', p_exception_code
  );

  -- 1. Append into manifest_events (append-only)
  insert into public.manifest_events (
    tenant_id, manifest_id, event_type, event_text, payload, created_by, updated_by
  ) values (
    v_tenant, p_manifest_id,
    case when v_clean_mode = 'delete' then 'PROGRESS_DELETED' else 'PROGRESS_ADDED' end,
    v_event_text,
    v_event_payload,
    auth.uid(), auth.uid()
  );

  -- 2. Find all manifested shipments matching bag filter
  select array_agg(ml.shipment_id) into v_shipment_ids
    from public.manifest_lines ml
   where ml.manifest_id = p_manifest_id
     and ml.tenant_id = v_tenant
     and ml.deleted_at is null
     and (v_clean_bag is null or ml.bag_no = v_clean_bag);

  -- 3. Append tracking event into shipment_events for each shipment
  if v_shipment_ids is not null and array_length(v_shipment_ids, 1) > 0 then
    foreach v_ship_id in array v_shipment_ids loop
      insert into public.shipment_events (
        tenant_id, shipment_id, event_type, event_text, payload, created_by, updated_by
      ) values (
        v_tenant,
        v_ship_id,
        case when v_clean_mode = 'delete' then 'MANIFEST_PROGRESS_DELETED' else 'MANIFEST_PROGRESS' end,
        v_event_text,
        v_event_payload || jsonb_build_object('manifest_no', v_manifest.manifest_no, 'manifest_id', p_manifest_id),
        auth.uid(), auth.uid()
      );
    end loop;
  end if;

  return jsonb_build_object(
    'success', true,
    'manifest_id', p_manifest_id,
    'manifest_no', v_manifest.manifest_no,
    'mode', v_clean_mode,
    'affected_shipments', coalesce(array_length(v_shipment_ids, 1), 0)
  );
end;
$$;

create or replace function app.upload_manifest_attachment(
  p_manifest_id   uuid,
  p_original_name text,
  p_mime          text,
  p_size_bytes    bigint,
  p_storage_key   text,
  p_label         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_file_id uuid;
  v_next_seq integer;
begin
  select m.tenant_id into v_tenant
    from public.manifests m
   where m.id = p_manifest_id
     and m.tenant_id in (select app.user_tenant_ids())
     and m.deleted_at is null;

  if v_tenant is null then
    raise exception 'Manifest not found or access denied' using errcode = 'CMS01';
  end if;

  -- 1. Insert into public.files
  insert into public.files (
    tenant_id, storage_bucket, storage_key, original_name, mime, size_bytes,
    owner_type, owner_id, uploaded_by, created_by, updated_by
  ) values (
    v_tenant, 'tenant-files', p_storage_key, p_original_name, p_mime, p_size_bytes,
    'MANIFEST', p_manifest_id, auth.uid(), auth.uid(), auth.uid()
  ) returning id into v_file_id;

  -- 2. Insert into public.manifest_attachments
  select coalesce(max(seq), 0) + 1 into v_next_seq
    from public.manifest_attachments
   where tenant_id = v_tenant and manifest_id = p_manifest_id and deleted_at is null;

  insert into public.manifest_attachments (
    tenant_id, manifest_id, seq, file_id, label, created_by, updated_by
  ) values (
    v_tenant, p_manifest_id, v_next_seq, v_file_id, p_label, auth.uid(), auth.uid()
  );

  return jsonb_build_object(
    'success', true,
    'file_id', v_file_id,
    'seq', v_next_seq,
    'original_name', p_original_name,
    'size_bytes', p_size_bytes
  );
end;
$$;
