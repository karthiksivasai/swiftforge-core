-- Migration 0171: KYC Batch 1 - Hydration, Locking, Audit Trail, and Party Contact 409 Conflict Fix
-- Findings addressed:
--   KYC-01: Multi-document hydration via list_shipment_document_bytes
--   KYC-02: Document classification metadata preservation
--   KYC-06: Document soft-delete RPC (delete_shipment_document)
--   KYC-11: Server lock check on save_shipment_document
--   KYC-12: Audit logging on document create and delete
--   Forwarding Q2: Fix 409 conflict on remember_party_contact

-- 1. Fix KYC-11 and KYC-12: Update app.save_shipment_document with lock check & audit log
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
    raise exception 'Shipment is locked' using errcode = 'LOCKED';
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

-- 2. Fix KYC-01: list_shipment_document_bytes returns all active documents with content_b64 for a shipment
create or replace function public.list_shipment_document_bytes(
  p_shipment_id uuid,
  p_document_type text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_rows jsonb;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context' using errcode = '42501';
  end if;

  if not app.user_has_permission(v_tenant, 'txn.awb-entry', 'list')
     and not app.user_has_permission(v_tenant, 'txn.awb-entry', 'search') then
    raise exception 'AWB Entry permission is required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', d.id,
      'shipmentId', d.shipment_id,
      'type', d.document_type,
      'source', d.source,
      'vendor', d.vendor,
      'fileName', d.file_name,
      'fileUrl', d.file_url,
      'contentB64', d.content_b64,
      'mimeType', d.mime_type,
      'fileSize', d.file_size,
      'version', d.version,
      'status', d.status,
      'rawMeta', d.raw_meta,
      'createdAt', d.created_at,
      'available', (d.file_url is not null or d.content_b64 is not null)
    ) order by d.created_at asc, d.version asc
  ), '[]'::jsonb)
  into v_rows
  from public.shipment_documents d
  where d.tenant_id = v_tenant
    and d.shipment_id = p_shipment_id
    and d.deleted_at is null
    and (
      p_document_type is null
      or d.document_type = upper(btrim(p_document_type))
    );

  return v_rows;
end;
$$;

revoke all on function public.list_shipment_document_bytes(uuid, text) from public;
grant execute on function public.list_shipment_document_bytes(uuid, text) to authenticated, service_role;

-- 3. Fix KYC-06 and KYC-12: delete_shipment_document soft-deletes a document and writes an audit log
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
    raise exception 'No tenant context' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.shipments
    where id = p_shipment_id and tenant_id = v_tenant and deleted_at is null and is_locked = true
  ) then
    raise exception 'Shipment is locked' using errcode = 'LOCKED';
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
grant execute on function public.delete_shipment_document(uuid, uuid) to authenticated, service_role;

-- 4. Fix Forwarding Question 2: remember_party_contact code resolution and 409 conflict handling
create or replace function public.remember_party_contact(p_role text, p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_role   text := lower(btrim(coalesce(p_role, '')));
  v_name   text;
  v_mobile text;
  v_doc    text;
  v_doctype text;
  v_addr1  text;
  v_code   text;
  v_id     uuid;
  v_geo_id uuid;
  v_geo_code text;
  v_digits text;
  v_slug   text;
  v_country text;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  if v_role not in ('shipper', 'consignee') then
    raise exception 'p_role must be shipper or consignee' using errcode = '22023';
  end if;

  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'p_fields must be a JSON object' using errcode = '22023';
  end if;

  v_name := nullif(btrim(coalesce(p_fields->>'name', p_fields->>'company_name', '')), '');
  if v_name is null then
    return jsonb_build_object('ok', false, 'reason', 'name_required');
  end if;

  v_digits := regexp_replace(coalesce(p_fields->>'mobile', ''), '\D', '', 'g');
  v_mobile := nullif(v_digits, '');
  if v_mobile is null then
    v_mobile := nullif(regexp_replace(coalesce(p_fields->>'telephone', ''), '\D', '', 'g'), '');
  end if;
  if v_mobile is null then
    v_mobile := '0000000000';
  end if;

  v_doc := nullif(btrim(coalesce(p_fields->>'document_no', '')), '');
  v_doctype := nullif(btrim(coalesce(p_fields->>'document_type', '')), '');
  v_addr1 := nullif(btrim(coalesce(p_fields->>'address1', '')), '');
  v_code := nullif(btrim(coalesce(p_fields->>'code', p_fields->>'company_code', '')), '');
  v_country := nullif(btrim(coalesce(p_fields->>'country', p_fields->>'country_name', '')), '');
  v_geo_code := nullif(upper(btrim(coalesce(
    p_fields->>'geo_code', p_fields->>'origin_code', p_fields->>'destination_code', ''))), '');
  begin
    v_geo_id := nullif(btrim(coalesce(p_fields->>'geo_id', '')), '')::uuid;
  exception when others then
    v_geo_id := null;
  end;

  if v_geo_id is null and v_geo_code is not null then
    select d.id into v_geo_id
    from public.destinations d
    where d.tenant_id = v_tenant and d.deleted_at is null
      and upper(d.code) = v_geo_code
    limit 1;
  end if;

  if v_role = 'shipper' then
    select s.id into v_id
    from public.shippers s
    where s.tenant_id = v_tenant and s.deleted_at is null
      and lower(btrim(s.name)) = lower(v_name)
      and regexp_replace(coalesce(s.mobile, ''), '\D', '', 'g') = v_mobile
    limit 1;

    if v_id is null and v_doc is not null then
      select s.id into v_id
      from public.shippers s
      where s.tenant_id = v_tenant and s.deleted_at is null
        and lower(btrim(s.name)) = lower(v_name)
        and (
          lower(btrim(coalesce(s.document_no, ''))) = lower(v_doc)
          or lower(btrim(coalesce(s.gst_no, ''))) = lower(v_doc)
          or lower(btrim(coalesce(s.aadhar_no, ''))) = lower(v_doc)
          or lower(btrim(coalesce(s.pan_no, ''))) = lower(v_doc)
        )
      limit 1;
    end if;

    if v_id is null and v_addr1 is not null then
      select s.id into v_id
      from public.shippers s
      where s.tenant_id = v_tenant and s.deleted_at is null
        and lower(btrim(s.name)) = lower(v_name)
        and lower(btrim(coalesce(s.address1, s.address, ''))) = lower(v_addr1)
      limit 1;
    end if;

    if v_id is null and nullif(btrim(coalesce(p_fields->>'id', '')), '') is not null then
      begin
        select s.id into v_id
        from public.shippers s
        where s.tenant_id = v_tenant and s.deleted_at is null
          and s.id = (p_fields->>'id')::uuid
        limit 1;
      exception when others then
        v_id := null;
      end;
    end if;

    -- Look up by code if passed to prevent duplicate code collisions
    if v_id is null and v_code is not null then
      select s.id into v_id
      from public.shippers s
      where s.tenant_id = v_tenant and s.deleted_at is null
        and upper(s.code) = upper(v_code)
      limit 1;
    end if;

    if v_id is null then
      if v_code is null then
        v_slug := upper(regexp_replace(regexp_replace(v_name, '[^A-Za-z0-9]+', '', 'g'), '^$', 'SHP'));
        v_code := left(v_slug, 8) || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);
      end if;

      begin
        insert into public.shippers (
          tenant_id, code, name, contact_person, address, address1, address2,
          pin_code, city, state_name, country_name, mobile, telephone1, email, iec_no,
          document_type, document_no,
          gst_no, aadhar_no, pan_no, origin_id, origin_code, status,
          last_used_at, shipment_count
        ) values (
          v_tenant, v_code, v_name,
          nullif(btrim(coalesce(p_fields->>'contact_name', '')), ''),
          nullif(btrim(concat_ws(', ', v_addr1, nullif(btrim(coalesce(p_fields->>'address2', '')), ''))), ''),
          v_addr1,
          nullif(btrim(coalesce(p_fields->>'address2', '')), ''),
          nullif(btrim(coalesce(p_fields->>'pin_code', p_fields->>'pincode', '')), ''),
          nullif(btrim(coalesce(p_fields->>'city', '')), ''),
          nullif(btrim(coalesce(p_fields->>'state', p_fields->>'state_name', '')), ''),
          v_country,
          v_mobile,
          nullif(btrim(coalesce(p_fields->>'telephone', '')), ''),
          nullif(btrim(coalesce(p_fields->>'email', '')), ''),
          nullif(btrim(coalesce(p_fields->>'iec_no', '')), ''),
          v_doctype,
          v_doc,
          case when lower(coalesce(v_doctype, '')) like '%gst%' then v_doc else null end,
          case when lower(coalesce(v_doctype, '')) like '%aadhaar%'
              or lower(coalesce(v_doctype, '')) like '%aadhar%' then v_doc else null end,
          case when lower(coalesce(v_doctype, '')) like '%pan%' then v_doc else null end,
          v_geo_id, v_geo_code, 'ACTIVE', now(), 1
        )
        returning id into v_id;
      exception when unique_violation then
        -- Handle code/name conflict gracefully: find existing or generate unique code
        select s.id into v_id
        from public.shippers s
        where s.tenant_id = v_tenant and s.deleted_at is null
          and (upper(s.code) = upper(v_code) or lower(btrim(s.name)) = lower(v_name))
        order by s.updated_at desc
        limit 1;

        if v_id is not null then
          update public.shippers s set
            contact_person = coalesce(nullif(btrim(coalesce(p_fields->>'contact_name', '')), ''), s.contact_person),
            address1 = coalesce(v_addr1, s.address1),
            address2 = coalesce(nullif(btrim(coalesce(p_fields->>'address2', '')), ''), s.address2),
            address = coalesce(
              nullif(btrim(concat_ws(', ', coalesce(v_addr1, s.address1), coalesce(nullif(btrim(coalesce(p_fields->>'address2', '')), ''), s.address2))), ''),
              s.address
            ),
            pin_code = coalesce(nullif(btrim(coalesce(p_fields->>'pin_code', p_fields->>'pincode', '')), ''), s.pin_code),
            city = coalesce(nullif(btrim(coalesce(p_fields->>'city', '')), ''), s.city),
            state_name = coalesce(nullif(btrim(coalesce(p_fields->>'state', p_fields->>'state_name', '')), ''), s.state_name),
            country_name = coalesce(v_country, s.country_name),
            mobile = case when v_mobile = '0000000000' then s.mobile else v_mobile end,
            last_used_at = now(),
            shipment_count = s.shipment_count + 1
          where s.id = v_id;
        else
          v_slug := upper(regexp_replace(regexp_replace(v_name, '[^A-Za-z0-9]+', '', 'g'), '^$', 'SHP'));
          v_code := left(v_slug, 8) || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
          insert into public.shippers (
            tenant_id, code, name, contact_person, address, address1, address2,
            pin_code, city, state_name, country_name, mobile, telephone1, email, iec_no,
            document_type, document_no,
            gst_no, aadhar_no, pan_no, origin_id, origin_code, status,
            last_used_at, shipment_count
          ) values (
            v_tenant, v_code, v_name,
            nullif(btrim(coalesce(p_fields->>'contact_name', '')), ''),
            nullif(btrim(concat_ws(', ', v_addr1, nullif(btrim(coalesce(p_fields->>'address2', '')), ''))), ''),
            v_addr1,
            nullif(btrim(coalesce(p_fields->>'address2', '')), ''),
            nullif(btrim(coalesce(p_fields->>'pin_code', p_fields->>'pincode', '')), ''),
            nullif(btrim(coalesce(p_fields->>'city', '')), ''),
            nullif(btrim(coalesce(p_fields->>'state', p_fields->>'state_name', '')), ''),
            v_country,
            v_mobile,
            nullif(btrim(coalesce(p_fields->>'telephone', '')), ''),
            nullif(btrim(coalesce(p_fields->>'email', '')), ''),
            nullif(btrim(coalesce(p_fields->>'iec_no', '')), ''),
            v_doctype,
            v_doc,
            case when lower(coalesce(v_doctype, '')) like '%gst%' then v_doc else null end,
            case when lower(coalesce(v_doctype, '')) like '%aadhaar%'
                or lower(coalesce(v_doctype, '')) like '%aadhar%' then v_doc else null end,
            case when lower(coalesce(v_doctype, '')) like '%pan%' then v_doc else null end,
            v_geo_id, v_geo_code, 'ACTIVE', now(), 1
          )
          returning id into v_id;
        end if;
      end;
    else
      update public.shippers s set
        contact_person = coalesce(nullif(btrim(coalesce(p_fields->>'contact_name', '')), ''), s.contact_person),
        address1 = coalesce(v_addr1, s.address1),
        address2 = coalesce(nullif(btrim(coalesce(p_fields->>'address2', '')), ''), s.address2),
        address = coalesce(
          nullif(btrim(concat_ws(', ', coalesce(v_addr1, s.address1), coalesce(nullif(btrim(coalesce(p_fields->>'address2', '')), ''), s.address2))), ''),
          s.address
        ),
        pin_code = coalesce(nullif(btrim(coalesce(p_fields->>'pin_code', p_fields->>'pincode', '')), ''), s.pin_code),
        city = coalesce(nullif(btrim(coalesce(p_fields->>'city', '')), ''), s.city),
        state_name = coalesce(nullif(btrim(coalesce(p_fields->>'state', p_fields->>'state_name', '')), ''), s.state_name),
        country_name = coalesce(v_country, s.country_name),
        mobile = case when v_mobile = '0000000000' then s.mobile else v_mobile end,
        telephone1 = coalesce(nullif(btrim(coalesce(p_fields->>'telephone', '')), ''), s.telephone1),
        email = coalesce(nullif(btrim(coalesce(p_fields->>'email', '')), ''), s.email),
        iec_no = coalesce(nullif(btrim(coalesce(p_fields->>'iec_no', '')), ''), s.iec_no),
        document_type = coalesce(v_doctype, s.document_type),
        document_no = coalesce(v_doc, s.document_no),
        gst_no = case when lower(coalesce(v_doctype, '')) like '%gst%'
          then coalesce(v_doc, s.gst_no) else s.gst_no end,
        aadhar_no = case when lower(coalesce(v_doctype, '')) like '%aadhaar%'
            or lower(coalesce(v_doctype, '')) like '%aadhar%'
          then coalesce(v_doc, s.aadhar_no) else s.aadhar_no end,
        pan_no = case when lower(coalesce(v_doctype, '')) like '%pan%'
          then coalesce(v_doc, s.pan_no) else s.pan_no end,
        origin_id = coalesce(v_geo_id, s.origin_id),
        origin_code = coalesce(v_geo_code, s.origin_code),
        last_used_at = now(),
        shipment_count = s.shipment_count + 1
      where s.id = v_id;
    end if;

  else
    select g.id into v_id
    from public.consignees g
    where g.tenant_id = v_tenant and g.deleted_at is null
      and lower(btrim(g.name)) = lower(v_name)
      and regexp_replace(coalesce(g.mobile, ''), '\D', '', 'g') = v_mobile
    limit 1;

    if v_id is null and v_doc is not null then
      select g.id into v_id
      from public.consignees g
      where g.tenant_id = v_tenant and g.deleted_at is null
        and lower(btrim(g.name)) = lower(v_name)
        and lower(btrim(coalesce(g.kyc_doc_no, ''))) = lower(v_doc)
      limit 1;
    end if;

    if v_id is null and v_addr1 is not null then
      select g.id into v_id
      from public.consignees g
      where g.tenant_id = v_tenant and g.deleted_at is null
        and lower(btrim(g.name)) = lower(v_name)
        and lower(btrim(coalesce(g.address1, g.address, ''))) = lower(v_addr1)
      limit 1;
    end if;

    if v_id is null and nullif(btrim(coalesce(p_fields->>'id', '')), '') is not null then
      begin
        select g.id into v_id
        from public.consignees g
        where g.tenant_id = v_tenant and g.deleted_at is null
          and g.id = (p_fields->>'id')::uuid
        limit 1;
      exception when others then
        v_id := null;
      end;
    end if;

    -- Look up by code if passed to prevent duplicate code collisions
    if v_id is null and v_code is not null then
      select g.id into v_id
      from public.consignees g
      where g.tenant_id = v_tenant and g.deleted_at is null
        and upper(g.code) = upper(v_code)
      limit 1;
    end if;

    if v_id is null then
      if v_code is null then
        v_slug := upper(regexp_replace(regexp_replace(v_name, '[^A-Za-z0-9]+', '', 'g'), '^$', 'CNE'));
        v_code := left(v_slug, 8) || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);
      end if;

      begin
        insert into public.consignees (
          tenant_id, code, name, contact_person, address, address1, address2,
          pin_code, city, state_name, country_name, mobile, telephone1, email,
          kyc_type, kyc_doc_no, eori, destination_id, destination_code, status,
          last_used_at, shipment_count
        ) values (
          v_tenant, v_code, v_name,
          nullif(btrim(coalesce(p_fields->>'contact_name', '')), ''),
          nullif(btrim(concat_ws(', ', v_addr1, nullif(btrim(coalesce(p_fields->>'address2', '')), ''))), ''),
          v_addr1,
          nullif(btrim(coalesce(p_fields->>'address2', '')), ''),
          nullif(btrim(coalesce(p_fields->>'pin_code', p_fields->>'pincode', '')), ''),
          nullif(btrim(coalesce(p_fields->>'city', '')), ''),
          nullif(btrim(coalesce(p_fields->>'state', p_fields->>'state_name', '')), ''),
          v_country,
          v_mobile,
          nullif(btrim(coalesce(p_fields->>'telephone', '')), ''),
          nullif(btrim(coalesce(p_fields->>'email', '')), ''),
          v_doctype,
          v_doc,
          nullif(btrim(coalesce(p_fields->>'iec_no', '')), ''),
          v_geo_id, v_geo_code, 'ACTIVE', now(), 1
        )
        returning id into v_id;
      exception when unique_violation then
        -- Handle code/name conflict gracefully: find existing or generate unique code
        select g.id into v_id
        from public.consignees g
        where g.tenant_id = v_tenant and g.deleted_at is null
          and (upper(g.code) = upper(v_code) or lower(btrim(g.name)) = lower(v_name))
        order by g.updated_at desc
        limit 1;

        if v_id is not null then
          update public.consignees g set
            contact_person = coalesce(nullif(btrim(coalesce(p_fields->>'contact_name', '')), ''), g.contact_person),
            address1 = coalesce(v_addr1, g.address1),
            address2 = coalesce(nullif(btrim(coalesce(p_fields->>'address2', '')), ''), g.address2),
            address = coalesce(
              nullif(btrim(concat_ws(', ', coalesce(v_addr1, g.address1), coalesce(nullif(btrim(coalesce(p_fields->>'address2', '')), ''), g.address2))), ''),
              g.address
            ),
            pin_code = coalesce(nullif(btrim(coalesce(p_fields->>'pin_code', p_fields->>'pincode', '')), ''), g.pin_code),
            city = coalesce(nullif(btrim(coalesce(p_fields->>'city', '')), ''), g.city),
            state_name = coalesce(nullif(btrim(coalesce(p_fields->>'state', p_fields->>'state_name', '')), ''), g.state_name),
            country_name = coalesce(v_country, g.country_name),
            mobile = case when v_mobile = '0000000000' then g.mobile else v_mobile end,
            last_used_at = now(),
            shipment_count = g.shipment_count + 1
          where g.id = v_id;
        else
          v_slug := upper(regexp_replace(regexp_replace(v_name, '[^A-Za-z0-9]+', '', 'g'), '^$', 'CNE'));
          v_code := left(v_slug, 8) || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
          insert into public.consignees (
            tenant_id, code, name, contact_person, address, address1, address2,
            pin_code, city, state_name, country_name, mobile, telephone1, email,
            kyc_type, kyc_doc_no, eori, destination_id, destination_code, status,
            last_used_at, shipment_count
          ) values (
            v_tenant, v_code, v_name,
            nullif(btrim(coalesce(p_fields->>'contact_name', '')), ''),
            nullif(btrim(concat_ws(', ', v_addr1, nullif(btrim(coalesce(p_fields->>'address2', '')), ''))), ''),
            v_addr1,
            nullif(btrim(coalesce(p_fields->>'address2', '')), ''),
            nullif(btrim(coalesce(p_fields->>'pin_code', p_fields->>'pincode', '')), ''),
            nullif(btrim(coalesce(p_fields->>'city', '')), ''),
            nullif(btrim(coalesce(p_fields->>'state', p_fields->>'state_name', '')), ''),
            v_country,
            v_mobile,
            nullif(btrim(coalesce(p_fields->>'telephone', '')), ''),
            nullif(btrim(coalesce(p_fields->>'email', '')), ''),
            v_doctype,
            v_doc,
            nullif(btrim(coalesce(p_fields->>'iec_no', '')), ''),
            v_geo_id, v_geo_code, 'ACTIVE', now(), 1
          )
          returning id into v_id;
        end if;
      end;
    else
      update public.consignees g set
        contact_person = coalesce(nullif(btrim(coalesce(p_fields->>'contact_name', '')), ''), g.contact_person),
        address1 = coalesce(v_addr1, g.address1),
        address2 = coalesce(nullif(btrim(coalesce(p_fields->>'address2', '')), ''), g.address2),
        address = coalesce(
          nullif(btrim(concat_ws(', ', coalesce(v_addr1, g.address1), coalesce(nullif(btrim(coalesce(p_fields->>'address2', '')), ''), g.address2))), ''),
          g.address
        ),
        pin_code = coalesce(nullif(btrim(coalesce(p_fields->>'pin_code', p_fields->>'pincode', '')), ''), g.pin_code),
        city = coalesce(nullif(btrim(coalesce(p_fields->>'city', '')), ''), g.city),
        state_name = coalesce(nullif(btrim(coalesce(p_fields->>'state', p_fields->>'state_name', '')), ''), g.state_name),
        country_name = coalesce(v_country, g.country_name),
        mobile = case when v_mobile = '0000000000' then g.mobile else v_mobile end,
        telephone1 = coalesce(nullif(btrim(coalesce(p_fields->>'telephone', '')), ''), g.telephone1),
        email = coalesce(nullif(btrim(coalesce(p_fields->>'email', '')), ''), g.email),
        kyc_type = coalesce(v_doctype, g.kyc_type),
        kyc_doc_no = coalesce(v_doc, g.kyc_doc_no),
        eori = coalesce(nullif(btrim(coalesce(p_fields->>'iec_no', '')), ''), g.eori),
        destination_id = coalesce(v_geo_id, g.destination_id),
        destination_code = coalesce(v_geo_code, g.destination_code),
        last_used_at = now(),
        shipment_count = g.shipment_count + 1
      where g.id = v_id;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'role', v_role);
end;
$$;
