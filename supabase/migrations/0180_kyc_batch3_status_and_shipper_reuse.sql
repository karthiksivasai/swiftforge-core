-- Migration 0180: KYC Batch 3 — kyc_status, shipper KYC reuse and guidelines wiring
-- D11: Track kyc_status ('PENDING' / 'COMPLETE') on public.shipments
-- D14: Wire shipper_kyc_documents master reuse and save-to-shipper RPCs

-- 1. Add kyc_status column to public.shipments
alter table public.shipments
  add column if not exists kyc_status text not null default 'PENDING';

do $$
begin
  alter table public.shipments
    add constraint shipments_kyc_status_chk check (kyc_status in ('PENDING', 'COMPLETE'));
exception when duplicate_object then
  null;
end $$;

create index if not exists shipments_tenant_kyc_status_idx
  on public.shipments (tenant_id, kyc_status);

-- Backfill kyc_status for existing active shipments
update public.shipments s
set kyc_status = 'COMPLETE'
where exists (
  select 1 from public.shipment_documents sd
  where sd.shipment_id = s.id and sd.deleted_at is null
);

-- 2. Expand public.shipper_kyc_documents schema for full customs metadata and storage references
alter table public.shipper_kyc_documents
  add column if not exists document_no text,
  add column if not exists side text default 'Single/Both',
  add column if not exists expiry_date date,
  add column if not exists storage_path text,
  add column if not exists mime_type text,
  add column if not exists file_size integer;

create index if not exists shipper_kyc_documents_storage_idx
  on public.shipper_kyc_documents (tenant_id, storage_path);

-- 3. RPC: Retrieve saved KYC documents for a shipper
create or replace function public.get_shipper_saved_kyc(
  p_shipper_id uuid default null,
  p_shipper_code text default null,
  p_mobile text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_shipper_id uuid := p_shipper_id;
  v_result jsonb := '[]'::jsonb;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    if auth.role() = 'service_role' or app.is_platform_admin() then
      select id into v_tenant from public.tenants order by created_at asc limit 1;
    else
      raise exception 'No tenant context for the current user' using errcode = '42501';
    end if;
  end if;

  -- Resolve shipper if ID not provided directly
  if v_shipper_id is null and p_shipper_code is not null and btrim(p_shipper_code) <> '' then
    select s.id into v_shipper_id
    from public.shippers s
    where s.tenant_id = v_tenant and s.deleted_at is null
      and upper(s.code) = upper(btrim(p_shipper_code))
    limit 1;
  end if;

  if v_shipper_id is null and p_mobile is not null and btrim(p_mobile) <> '' then
    select s.id into v_shipper_id
    from public.shippers s
    where s.tenant_id = v_tenant and s.deleted_at is null
      and s.mobile = regexp_replace(p_mobile, '\D', '', 'g')
    order by s.last_used_at desc nulls last, s.updated_at desc
    limit 1;
  end if;

  if v_shipper_id is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', d.id,
      'shipper_id', d.shipper_id,
      'seq', d.seq,
      'kyc_type', d.kyc_type,
      'file_name', d.file_name,
      'document_no', d.document_no,
      'side', coalesce(d.side, 'Single/Both'),
      'expiry_date', d.expiry_date,
      'storage_path', d.storage_path,
      'mime_type', d.mime_type,
      'file_size', d.file_size,
      'entry_date', d.entry_date
    ) order by d.seq asc
  ), '[]'::jsonb) into v_result
  from public.shipper_kyc_documents d
  where d.tenant_id = v_tenant and d.shipper_id = v_shipper_id;

  return v_result;
end;
$$;

revoke all on function public.get_shipper_saved_kyc(uuid, text, text) from public;
grant execute on function public.get_shipper_saved_kyc(uuid, text, text) to authenticated, service_role;

-- 4. RPC: Save a KYC document to the shipper master for future reuse
create or replace function public.save_kyc_to_shipper_master(
  p_doc jsonb,
  p_shipper_id uuid default null,
  p_shipper_code text default null,
  p_mobile text default null,
  p_shipper_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_shipper_id uuid := p_shipper_id;
  v_seq integer;
  v_id uuid;
  v_kyc_type text;
  v_file_name text;
  v_doc_no text;
  v_side text;
  v_expiry date;
  v_storage text;
  v_mime text;
  v_size integer;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    if auth.role() = 'service_role' or app.is_platform_admin() then
      select id into v_tenant from public.tenants order by created_at asc limit 1;
    else
      raise exception 'No tenant context for the current user' using errcode = '42501';
    end if;
  end if;

  if auth.role() <> 'service_role' and not app.is_platform_admin() then
    if not app.user_has_permission(v_tenant, 'txn.awb-entry', 'add')
       and not app.user_has_permission(v_tenant, 'txn.awb-entry', 'modify')
       and not app.user_has_permission(v_tenant, 'mst.shipper-master', 'add')
       and not app.user_has_permission(v_tenant, 'mst.shipper-master', 'modify') then
      raise exception 'Permission denied to save shipper KYC' using errcode = '42501';
    end if;
  end if;

  -- Resolve shipper ID
  if v_shipper_id is null and p_shipper_code is not null and btrim(p_shipper_code) <> '' then
    select s.id into v_shipper_id
    from public.shippers s
    where s.tenant_id = v_tenant and s.deleted_at is null
      and upper(s.code) = upper(btrim(p_shipper_code))
    limit 1;
  end if;

  if v_shipper_id is null and p_mobile is not null and btrim(p_mobile) <> '' then
    select s.id into v_shipper_id
    from public.shippers s
    where s.tenant_id = v_tenant and s.deleted_at is null
      and s.mobile = regexp_replace(p_mobile, '\D', '', 'g')
    order by s.last_used_at desc nulls last, s.updated_at desc
    limit 1;
  end if;

  if v_shipper_id is null and p_shipper_name is not null and btrim(p_shipper_name) <> '' then
    select s.id into v_shipper_id
    from public.shippers s
    where s.tenant_id = v_tenant and s.deleted_at is null
      and lower(btrim(s.name)) = lower(btrim(p_shipper_name))
    order by s.last_used_at desc nulls last, s.updated_at desc
    limit 1;
  end if;

  if v_shipper_id is null then
    return jsonb_build_object('ok', false, 'reason', 'shipper_not_found');
  end if;

  v_kyc_type := coalesce(nullif(btrim(p_doc->>'entryType'), ''), nullif(btrim(p_doc->>'kyc_type'), ''), 'Aadhaar Number');
  v_file_name := nullif(btrim(coalesce(p_doc->>'fileName', p_doc->>'file_name', '')), '');
  v_doc_no := nullif(btrim(coalesce(p_doc->>'documentNo', p_doc->>'document_no', '')), '');
  v_side := coalesce(nullif(btrim(coalesce(p_doc->>'side', '')), ''), 'Single/Both');
  begin
    v_expiry := nullif(btrim(coalesce(p_doc->>'expiryDate', p_doc->>'expiry_date', '')), '')::date;
  exception when others then
    v_expiry := null;
  end;
  v_storage := nullif(btrim(coalesce(p_doc->>'storagePath', p_doc->>'fileUrl', p_doc->>'storage_path', '')), '');
  v_mime := coalesce(nullif(btrim(coalesce(p_doc->>'mimeType', p_doc->>'mime_type', '')), ''), 'application/pdf');
  v_size := nullif(btrim(coalesce(p_doc->>'fileSize', p_doc->>'file_size', '')), '')::integer;

  select coalesce(max(seq), 0) + 1 into v_seq
  from public.shipper_kyc_documents
  where tenant_id = v_tenant and shipper_id = v_shipper_id;

  insert into public.shipper_kyc_documents (
    tenant_id, shipper_id, seq, kyc_type, file_name, document_no,
    side, expiry_date, storage_path, mime_type, file_size, entry_date
  ) values (
    v_tenant, v_shipper_id, v_seq, v_kyc_type, v_file_name, v_doc_no,
    v_side, v_expiry, v_storage, v_mime, v_size, now()
  )
  returning id into v_id;

  perform app.write_audit_log(
    p_tenant_id => v_tenant,
    p_entity_type => 'shipper_kyc_documents',
    p_action => 'ADD',
    p_entity_id => v_id,
    p_module_slug => 'txn.awb-entry',
    p_new => jsonb_build_object(
      'shipper_id', v_shipper_id,
      'kyc_type', v_kyc_type,
      'document_no', v_doc_no,
      'file_name', v_file_name,
      'storage_path', v_storage
    )
  );

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'shipper_id', v_shipper_id,
    'seq', v_seq
  );
end;
$$;

revoke all on function public.save_kyc_to_shipper_master(jsonb, uuid, text, text, text) from public;
grant execute on function public.save_kyc_to_shipper_master(jsonb, uuid, text, text, text) to authenticated, service_role;

-- 5. Update app.save_shipment_document to dynamically set shipments.kyc_status = 'COMPLETE'
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

  -- D11: Update parent shipment kyc_status to COMPLETE
  update public.shipments
  set kyc_status = 'COMPLETE'
  where id = p_shipment and tenant_id = p_tenant;

  return v_id;
end;
$$;

-- 6. Update public.delete_shipment_document to recompute kyc_status on soft-delete
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

  -- D11: Update parent shipment kyc_status
  update public.shipments
  set kyc_status = case
    when (
      select count(*)
      from public.shipment_documents
      where shipment_id = p_shipment_id and tenant_id = v_tenant and deleted_at is null
    ) > 0
    then 'COMPLETE'
    else 'PENDING'
  end
  where id = p_shipment_id and tenant_id = v_tenant;

  return jsonb_build_object('ok', true, 'id', p_document_id);
end;
$$;

revoke all on function public.delete_shipment_document(uuid, uuid) from public;
grant execute on function public.delete_shipment_document(uuid, uuid) to authenticated, service_role;

-- 7. Automated Triggers to keep shipments.kyc_status 100% in sync
create or replace function app.maintain_shipment_kyc_status()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_doc_count integer := 0;
  v_extras_count integer := 0;
begin
  if new.wizard_extras is not null and new.wizard_extras ? 'kyc' and (new.wizard_extras->'kyc') ? 'documents' then
    v_extras_count := coalesce(jsonb_array_length(new.wizard_extras->'kyc'->'documents'), 0);
  end if;

  if new.id is not null then
    select count(*) into v_doc_count
    from public.shipment_documents
    where shipment_id = new.id and tenant_id = new.tenant_id and deleted_at is null;
  end if;

  if v_extras_count > 0 or v_doc_count > 0 then
    new.kyc_status := 'COMPLETE';
  else
    new.kyc_status := 'PENDING';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_maintain_shipment_kyc_status on public.shipments;
create trigger trg_maintain_shipment_kyc_status
  before insert or update of wizard_extras on public.shipments
  for each row
  execute function app.maintain_shipment_kyc_status();

create or replace function app.maintain_shipment_doc_kyc_status()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_shipment_id uuid;
  v_tenant_id uuid;
  v_doc_count integer;
  v_extras_count integer := 0;
  v_extras jsonb;
begin
  v_shipment_id := coalesce(new.shipment_id, old.shipment_id);
  v_tenant_id := coalesce(new.tenant_id, old.tenant_id);

  if v_shipment_id is null then
    return null;
  end if;

  select count(*) into v_doc_count
  from public.shipment_documents
  where shipment_id = v_shipment_id and tenant_id = v_tenant_id and deleted_at is null;

  select wizard_extras into v_extras
  from public.shipments
  where id = v_shipment_id and tenant_id = v_tenant_id;

  if v_extras is not null and v_extras ? 'kyc' and (v_extras->'kyc') ? 'documents' then
    v_extras_count := coalesce(jsonb_array_length(v_extras->'kyc'->'documents'), 0);
  end if;

  update public.shipments
  set kyc_status = case when v_doc_count > 0 or v_extras_count > 0 then 'COMPLETE' else 'PENDING' end
  where id = v_shipment_id and tenant_id = v_tenant_id;

  return null;
end;
$$;

drop trigger if exists trg_maintain_shipment_doc_kyc_status on public.shipment_documents;
create trigger trg_maintain_shipment_doc_kyc_status
  after insert or update of deleted_at or delete on public.shipment_documents
  for each row
  execute function app.maintain_shipment_doc_kyc_status();
