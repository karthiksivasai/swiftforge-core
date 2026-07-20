-- ===========================================================================
-- 0075  Complete party contact memory (full field round-trip)
-- ---------------------------------------------------------------------------
-- * document_type / document_no / country_name on shippers
-- * search_party_contacts — pin search + stored doc type labels
-- * get_party_contact — full hydrate on select
-- * remember_party_contact — never blank existing values; store all party fields
-- ===========================================================================

alter table public.shippers
  add column if not exists document_type text,
  add column if not exists document_no text,
  add column if not exists country_name text;

alter table public.consignees
  add column if not exists country_name text;

create index if not exists shippers_pin_trgm
  on public.shippers using gin (pin_code gin_trgm_ops);
create index if not exists consignees_pin_trgm
  on public.consignees using gin (pin_code gin_trgm_ops);
create index if not exists shippers_document_no_trgm
  on public.shippers using gin (document_no gin_trgm_ops);
create index if not exists consignees_kyc_doc_trgm
  on public.consignees using gin (kyc_doc_no gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Shared projection helper shape used by search + get
-- ---------------------------------------------------------------------------
create or replace function public.search_party_contacts(
  p_role  text,
  p_q     text default null,
  p_limit integer default 15
)
returns table (
  id              uuid,
  code            text,
  name            text,
  contact_name    text,
  address1        text,
  address2        text,
  pin_code        text,
  city            text,
  state_name      text,
  country_name    text,
  telephone       text,
  mobile          text,
  email           text,
  document_type   text,
  document_no     text,
  iec_no          text,
  geo_code        text,
  geo_name        text,
  geo_id          uuid,
  last_used_at    timestamptz,
  shipment_count  integer
)
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_role   text := lower(btrim(coalesce(p_role, '')));
  v_q      text := nullif(btrim(coalesce(p_q, '')), '');
  v_limit  int := least(greatest(coalesce(p_limit, 15), 1), 50);
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  if v_role not in ('shipper', 'consignee') then
    raise exception 'p_role must be shipper or consignee' using errcode = '22023';
  end if;

  if v_role = 'shipper' then
    return query
    select
      s.id,
      s.code,
      s.name,
      coalesce(s.contact_person, '')::text,
      coalesce(s.address1, s.address, '')::text,
      coalesce(s.address2, '')::text,
      coalesce(s.pin_code, '')::text,
      coalesce(s.city, '')::text,
      coalesce(s.state_name, st.name, '')::text,
      coalesce(nullif(btrim(s.country_name), ''), c.name, '')::text,
      coalesce(s.telephone1, '')::text,
      coalesce(s.mobile, '')::text,
      coalesce(s.email, '')::text,
      coalesce(
        nullif(btrim(s.document_type), ''),
        case
          when nullif(btrim(coalesce(s.gst_no, '')), '') is not null then 'GSTIN (Normal)'
          when nullif(btrim(coalesce(s.aadhar_no, '')), '') is not null then 'Aadhaar Number'
          when nullif(btrim(coalesce(s.pan_no, '')), '') is not null then 'PAN Number'
          else ''
        end
      )::text,
      coalesce(
        nullif(btrim(s.document_no), ''),
        nullif(btrim(s.gst_no), ''),
        nullif(btrim(s.aadhar_no), ''),
        nullif(btrim(s.pan_no), ''),
        ''
      )::text,
      coalesce(s.iec_no, '')::text,
      coalesce(s.origin_code, d.code, '')::text,
      coalesce(d.name, s.origin_code, '')::text,
      s.origin_id,
      s.last_used_at,
      s.shipment_count
    from public.shippers s
    left join public.states st on st.id = s.state_id and st.tenant_id = s.tenant_id
    left join public.countries c on c.id = s.country_id and c.tenant_id = s.tenant_id
    left join public.destinations d on d.id = s.origin_id and d.tenant_id = s.tenant_id
    where s.tenant_id = v_tenant
      and s.deleted_at is null
      and (
        v_q is null
        or s.name ilike '%' || v_q || '%'
        or s.code ilike '%' || v_q || '%'
        or coalesce(s.contact_person, '') ilike '%' || v_q || '%'
        or coalesce(s.mobile, '') ilike '%' || v_q || '%'
        or coalesce(s.telephone1, '') ilike '%' || v_q || '%'
        or coalesce(s.telephone2, '') ilike '%' || v_q || '%'
        or coalesce(s.email, '') ilike '%' || v_q || '%'
        or coalesce(s.pin_code, '') ilike '%' || v_q || '%'
        or coalesce(s.document_no, '') ilike '%' || v_q || '%'
        or coalesce(s.gst_no, '') ilike '%' || v_q || '%'
        or coalesce(s.aadhar_no, '') ilike '%' || v_q || '%'
        or coalesce(s.pan_no, '') ilike '%' || v_q || '%'
        or coalesce(s.city, '') ilike '%' || v_q || '%'
      )
    order by s.last_used_at desc nulls last, s.shipment_count desc, s.name
    limit v_limit;
  else
    return query
    select
      g.id,
      g.code,
      g.name,
      coalesce(g.contact_person, '')::text,
      coalesce(g.address1, g.address, '')::text,
      coalesce(g.address2, '')::text,
      coalesce(g.pin_code, '')::text,
      coalesce(g.city, '')::text,
      coalesce(g.state_name, st.name, '')::text,
      coalesce(nullif(btrim(g.country_name), ''), c.name, '')::text,
      coalesce(g.telephone1, '')::text,
      coalesce(g.mobile, '')::text,
      coalesce(g.email, '')::text,
      coalesce(g.kyc_type, '')::text,
      coalesce(g.kyc_doc_no, '')::text,
      coalesce(g.eori, g.vat, '')::text,
      coalesce(g.destination_code, d.code, '')::text,
      coalesce(d.name, g.destination_code, '')::text,
      g.destination_id,
      g.last_used_at,
      g.shipment_count
    from public.consignees g
    left join public.states st on st.id = g.state_id and st.tenant_id = g.tenant_id
    left join public.countries c on c.id = g.country_id and c.tenant_id = g.tenant_id
    left join public.destinations d on d.id = g.destination_id and d.tenant_id = g.tenant_id
    where g.tenant_id = v_tenant
      and g.deleted_at is null
      and (
        v_q is null
        or g.name ilike '%' || v_q || '%'
        or g.code ilike '%' || v_q || '%'
        or coalesce(g.contact_person, '') ilike '%' || v_q || '%'
        or coalesce(g.mobile, '') ilike '%' || v_q || '%'
        or coalesce(g.telephone1, '') ilike '%' || v_q || '%'
        or coalesce(g.telephone2, '') ilike '%' || v_q || '%'
        or coalesce(g.email, '') ilike '%' || v_q || '%'
        or coalesce(g.pin_code, '') ilike '%' || v_q || '%'
        or coalesce(g.kyc_doc_no, '') ilike '%' || v_q || '%'
        or coalesce(g.city, '') ilike '%' || v_q || '%'
      )
    order by g.last_used_at desc nulls last, g.shipment_count desc, g.name
    limit v_limit;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_party_contact — full row by id for select hydrate
-- ---------------------------------------------------------------------------
create or replace function public.get_party_contact(p_role text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_role   text := lower(btrim(coalesce(p_role, '')));
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if v_role not in ('shipper', 'consignee') or p_id is null then
    return null;
  end if;

  if v_role = 'shipper' then
    return (
      select jsonb_build_object(
        'id', s.id, 'code', s.code, 'name', s.name,
        'contact_name', coalesce(s.contact_person, ''),
        'address1', coalesce(s.address1, s.address, ''),
        'address2', coalesce(s.address2, ''),
        'pin_code', coalesce(s.pin_code, ''),
        'city', coalesce(s.city, ''),
        'state_name', coalesce(s.state_name, st.name, ''),
        'country_name', coalesce(nullif(btrim(s.country_name), ''), c.name, ''),
        'telephone', coalesce(s.telephone1, ''),
        'mobile', coalesce(s.mobile, ''),
        'email', coalesce(s.email, ''),
        'document_type', coalesce(
          nullif(btrim(s.document_type), ''),
          case
            when nullif(btrim(coalesce(s.gst_no, '')), '') is not null then 'GSTIN (Normal)'
            when nullif(btrim(coalesce(s.aadhar_no, '')), '') is not null then 'Aadhaar Number'
            when nullif(btrim(coalesce(s.pan_no, '')), '') is not null then 'PAN Number'
            else ''
          end
        ),
        'document_no', coalesce(
          nullif(btrim(s.document_no), ''),
          nullif(btrim(s.gst_no), ''),
          nullif(btrim(s.aadhar_no), ''),
          nullif(btrim(s.pan_no), ''),
          ''
        ),
        'iec_no', coalesce(s.iec_no, ''),
        'geo_code', coalesce(s.origin_code, d.code, ''),
        'geo_name', coalesce(d.name, s.origin_code, ''),
        'geo_id', s.origin_id,
        'last_used_at', s.last_used_at,
        'shipment_count', s.shipment_count
      )
      from public.shippers s
      left join public.states st on st.id = s.state_id and st.tenant_id = s.tenant_id
      left join public.countries c on c.id = s.country_id and c.tenant_id = s.tenant_id
      left join public.destinations d on d.id = s.origin_id and d.tenant_id = s.tenant_id
      where s.tenant_id = v_tenant and s.deleted_at is null and s.id = p_id
    );
  end if;

  return (
    select jsonb_build_object(
      'id', g.id, 'code', g.code, 'name', g.name,
      'contact_name', coalesce(g.contact_person, ''),
      'address1', coalesce(g.address1, g.address, ''),
      'address2', coalesce(g.address2, ''),
      'pin_code', coalesce(g.pin_code, ''),
      'city', coalesce(g.city, ''),
      'state_name', coalesce(g.state_name, st.name, ''),
      'country_name', coalesce(nullif(btrim(g.country_name), ''), c.name, ''),
      'telephone', coalesce(g.telephone1, ''),
      'mobile', coalesce(g.mobile, ''),
      'email', coalesce(g.email, ''),
      'document_type', coalesce(g.kyc_type, ''),
      'document_no', coalesce(g.kyc_doc_no, ''),
      'iec_no', coalesce(g.eori, g.vat, ''),
      'geo_code', coalesce(g.destination_code, d.code, ''),
      'geo_name', coalesce(d.name, g.destination_code, ''),
      'geo_id', g.destination_id,
      'last_used_at', g.last_used_at,
      'shipment_count', g.shipment_count
    )
    from public.consignees g
    left join public.states st on st.id = g.state_id and st.tenant_id = g.tenant_id
    left join public.countries c on c.id = g.country_id and c.tenant_id = g.tenant_id
    left join public.destinations d on d.id = g.destination_id and d.tenant_id = g.tenant_id
    where g.tenant_id = v_tenant and g.deleted_at is null and g.id = p_id
  );
end;
$$;

revoke all on function public.get_party_contact(text, uuid) from public;
grant execute on function public.get_party_contact(text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- remember_party_contact — complete field write, no blank-overwrites
-- ---------------------------------------------------------------------------
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

    if v_id is null then
      if v_code is null then
        v_slug := upper(regexp_replace(regexp_replace(v_name, '[^A-Za-z0-9]+', '', 'g'), '^$', 'SHP'));
        v_code := left(v_slug, 8) || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);
      end if;
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

    if v_id is null then
      if v_code is null then
        v_slug := upper(regexp_replace(regexp_replace(v_name, '[^A-Za-z0-9]+', '', 'g'), '^$', 'CNE'));
        v_code := left(v_slug, 8) || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);
      end if;
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
