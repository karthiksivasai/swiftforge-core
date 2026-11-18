-- Migration 0173: Allow service_role context in remember_party_contact

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
  if v_tenant is null and (auth.role() = 'service_role' or app.is_platform_admin()) then
    select id into v_tenant from public.tenants where deleted_at is null order by created_at asc limit 1;
  end if;
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

