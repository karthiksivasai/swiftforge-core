-- 0154  Zone import, one row per lane, and the zone used at booking.
-- Re-importing the same vendor + origin + product + destination + service
-- replaces that row. A zone import never changes a booked AWB. A new booking
-- stores the zone from the mapping (destination and country, service-specific).

create or replace function app.assert_zone_update_permission(p_tenant uuid, p_action text)
returns void
language plpgsql
stable
security definer
set search_path = public, app
as $$
begin
  if app.is_platform_admin() or app.is_tenant_admin(p_tenant) then
    return;
  end if;
  if app.user_has_permission(p_tenant, 'utl.zone-update', p_action) then
    return;
  end if;
  if p_action = 'search'
     and app.user_has_permission(p_tenant, 'utl.zone-update', 'list') then
    return;
  end if;
  raise exception 'Permission denied: utl.zone-update %', p_action using errcode = '42501';
end
$$;

-- One live row per lane. Nulls count as the same value, so two blank origins
-- cannot both exist. Service is compared without case or surrounding spaces.
create unique index if not exists zone_mappings_lane_uq
  on public.zone_mappings (
    tenant_id,
    vendor_id,
    origin_destination_id,
    product_id,
    destination_id,
    upper(btrim(coalesce(service, '')))
  )
  nulls not distinct
  where deleted_at is null;

create or replace function app.classify_zone_import_rows(p_tenant uuid, p_rows jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_elem jsonb;
  v_n integer := 0;
  v_origin text;
  v_vendor text;
  v_product text;
  v_country text;
  v_dest text;
  v_zone text;
  v_service text;
  v_key text;
  v_seen text[] := '{}';
  v_dups text[] := '{}';
  v_origin_id uuid;
  v_vendor_id uuid;
  v_product_id uuid;
  v_country_id uuid;
  v_dest_id uuid;
  v_dest_country uuid;
  v_zone_id uuid;
  v_service_canon text;
  v_existing uuid;
  v_reasons text[];
  v_out jsonb := '[]'::jsonb;
  v_ok integer := 0;
  v_failed integer := 0;
  v_new integer := 0;
  v_replace integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Zone import rows must be a list' using errcode = '22023';
  end if;

  for v_elem in select value from jsonb_array_elements(p_rows)
  loop
    v_key := upper(btrim(coalesce(v_elem->>'origin', ''))) || '|'
      || upper(btrim(coalesce(v_elem->>'vendor', ''))) || '|'
      || upper(btrim(coalesce(v_elem->>'product', ''))) || '|'
      || upper(btrim(coalesce(v_elem->>'destination', ''))) || '|'
      || upper(btrim(coalesce(v_elem->>'service', '')));
    if v_key = any (v_seen) then
      if not v_key = any (v_dups) then
        v_dups := v_dups || v_key;
      end if;
    else
      v_seen := v_seen || v_key;
    end if;
  end loop;

  for v_elem in select value from jsonb_array_elements(p_rows)
  loop
    v_n := v_n + 1;
    v_origin := btrim(coalesce(v_elem->>'origin', ''));
    v_vendor := btrim(coalesce(v_elem->>'vendor', ''));
    v_product := btrim(coalesce(v_elem->>'product', ''));
    v_country := btrim(coalesce(v_elem->>'country', ''));
    v_dest := btrim(coalesce(v_elem->>'destination', ''));
    v_zone := btrim(coalesce(v_elem->>'zone', ''));
    v_service := btrim(coalesce(v_elem->>'service', ''));
    v_reasons := '{}';
    v_origin_id := null;
    v_vendor_id := null;
    v_product_id := null;
    v_country_id := null;
    v_dest_id := null;
    v_zone_id := null;
    v_service_canon := null;
    v_existing := null;

    if v_origin = '' then
      v_reasons := v_reasons || 'unknown origin';
    else
      select d.id into v_origin_id
        from public.destinations d
       where d.tenant_id = p_tenant and d.deleted_at is null
         and (upper(d.code) = upper(v_origin) or upper(d.name) = upper(v_origin))
       order by case when upper(d.code) = upper(v_origin) then 0 else 1 end, d.code
       limit 1;
      if v_origin_id is null then
        v_reasons := v_reasons || 'unknown origin';
      end if;
    end if;

    if v_vendor = '' then
      v_reasons := v_reasons || 'unknown vendor';
    else
      select v.id into v_vendor_id
        from public.vendors v
       where v.tenant_id = p_tenant and v.deleted_at is null
         and (upper(v.code) = upper(v_vendor) or upper(v.name) = upper(v_vendor))
       order by case when upper(v.code) = upper(v_vendor) then 0 else 1 end, v.code
       limit 1;
      if v_vendor_id is null then
        v_reasons := v_reasons || 'unknown vendor';
      end if;
    end if;

    if v_product = '' then
      v_reasons := v_reasons || 'unknown product';
    else
      select p.id into v_product_id
        from public.products p
       where p.tenant_id = p_tenant and p.deleted_at is null
         and (upper(p.code) = upper(v_product) or upper(p.name) = upper(v_product))
       order by case when upper(p.code) = upper(v_product) then 0 else 1 end, p.code
       limit 1;
      if v_product_id is null then
        v_reasons := v_reasons || 'unknown product';
      end if;
    end if;

    if v_country = '' then
      v_reasons := v_reasons || 'unknown country';
    else
      select c.id into v_country_id
        from public.countries c
       where c.tenant_id = p_tenant and c.deleted_at is null
         and (upper(c.code) = upper(v_country) or upper(c.name) = upper(v_country))
       order by case when upper(c.code) = upper(v_country) then 0 else 1 end, c.code
       limit 1;
      if v_country_id is null then
        v_reasons := v_reasons || 'unknown country';
      end if;
    end if;

    if v_dest = '' then
      v_reasons := v_reasons || 'unknown destination';
    else
      select d.id, d.country_id into v_dest_id, v_dest_country
        from public.destinations d
       where d.tenant_id = p_tenant and d.deleted_at is null
         and (upper(d.code) = upper(v_dest) or upper(d.name) = upper(v_dest))
         and (v_country_id is null or d.country_id is null or d.country_id = v_country_id)
       order by
         case when v_country_id is not null and d.country_id = v_country_id then 0 else 1 end,
         case when upper(d.code) = upper(v_dest) then 0 else 1 end,
         d.code
       limit 1;
      if v_dest_id is null then
        v_reasons := v_reasons || 'unknown destination';
      elsif v_country_id is not null and v_dest_country is not null and v_dest_country <> v_country_id then
        v_reasons := v_reasons || 'unknown destination';
      end if;
    end if;

    if v_zone = '' then
      v_reasons := v_reasons || 'unknown zone';
    else
      select z.id into v_zone_id
        from public.zones z
       where z.tenant_id = p_tenant and z.deleted_at is null
         and upper(z.code) = upper(v_zone)
       limit 1;
      if v_zone_id is null then
        v_reasons := v_reasons || 'unknown zone';
      end if;
    end if;

    if v_service = '' then
      v_reasons := v_reasons || 'unknown service';
    elsif v_vendor_id is null then
      v_reasons := v_reasons || 'unknown service';
    else
      select sm.service into v_service_canon
        from public.service_mappings sm
       where sm.tenant_id = p_tenant and sm.deleted_at is null and sm.status = 'ACTIVE'
         and sm.vendor_id = v_vendor_id
         and upper(sm.service) = upper(v_service)
       limit 1;
      if v_service_canon is null then
        v_reasons := v_reasons || 'unknown service';
      end if;
    end if;

    v_key := upper(v_origin) || '|' || upper(v_vendor) || '|' || upper(v_product)
      || '|' || upper(v_dest) || '|' || upper(v_service);
    if v_key = any (v_dups) then
      v_reasons := v_reasons || 'duplicate row in file';
    end if;

    if coalesce(array_length(v_reasons, 1), 0) = 0 then
      select zm.id into v_existing
        from public.zone_mappings zm
       where zm.tenant_id = p_tenant and zm.deleted_at is null
         and zm.vendor_id is not distinct from v_vendor_id
         and zm.origin_destination_id is not distinct from v_origin_id
         and zm.product_id is not distinct from v_product_id
         and zm.destination_id is not distinct from v_dest_id
         and upper(btrim(coalesce(zm.service, ''))) = upper(btrim(coalesce(v_service_canon, '')))
       limit 1;
      v_ok := v_ok + 1;
      if v_existing is null then v_new := v_new + 1; else v_replace := v_replace + 1; end if;
    else
      v_failed := v_failed + 1;
    end if;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'row_no', coalesce((v_elem->>'row_no')::integer, v_n + 1),
      'origin', v_origin,
      'vendor', v_vendor,
      'product', v_product,
      'country', v_country,
      'destination', v_dest,
      'zone', v_zone,
      'service', coalesce(v_service_canon, v_service),
      'status', case when coalesce(array_length(v_reasons, 1), 0) = 0 then 'OK' else 'FAILED' end,
      'outcome', case
        when coalesce(array_length(v_reasons, 1), 0) > 0 then null
        when v_existing is null then 'NEW'
        else 'REPLACE'
      end,
      'reason', nullif(array_to_string(v_reasons, '; '), ''),
      'origin_id', v_origin_id,
      'vendor_id', v_vendor_id,
      'product_id', v_product_id,
      'country_id', v_country_id,
      'destination_id', v_dest_id,
      'zone_id', v_zone_id
    ));
  end loop;

  return jsonb_build_object(
    'total', v_n,
    'ok_count', v_ok,
    'failed_count', v_failed,
    'new_count', v_new,
    'replace_count', v_replace,
    'rows', v_out
  );
end
$$;

create or replace function public.preview_zone_import(p_rows jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_result jsonb;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  perform app.assert_zone_update_permission(v_tenant, 'search');
  v_result := app.classify_zone_import_rows(v_tenant, p_rows);
  return jsonb_build_object(
    'total', v_result->'total',
    'ok_count', v_result->'ok_count',
    'failed_count', v_result->'failed_count',
    'new_count', v_result->'new_count',
    'replace_count', v_result->'replace_count',
    'rows', (
      select coalesce(jsonb_agg(r - 'origin_id' - 'vendor_id' - 'product_id'
        - 'country_id' - 'destination_id' - 'zone_id'), '[]'::jsonb)
      from jsonb_array_elements(v_result->'rows') r
    )
  );
end
$$;

create or replace function public.apply_zone_import(
  p_rows jsonb,
  p_effective_date date,
  p_skip_failed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_class jsonb;
  v_row jsonb;
  v_existing uuid;
  v_old jsonb;
  v_imported integer := 0;
  v_new integer := 0;
  v_replace integer := 0;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  perform app.assert_zone_update_permission(v_tenant, 'modify');
  if p_effective_date is null then
    raise exception 'Effective date is required' using errcode = '22023';
  end if;

  v_class := app.classify_zone_import_rows(v_tenant, p_rows);
  if coalesce((v_class->>'failed_count')::integer, 0) > 0 and coalesce(p_skip_failed, false) is not true then
    raise exception 'Zone import saved nothing. % row(s) failed. Tick skip failed rows to import the rest.',
      v_class->>'failed_count'
      using errcode = 'CMS04';
  end if;

  for v_row in select value from jsonb_array_elements(v_class->'rows')
  loop
    if v_row->>'status' <> 'OK' then
      continue;
    end if;
    select zm.id into v_existing
      from public.zone_mappings zm
     where zm.tenant_id = v_tenant and zm.deleted_at is null
       and zm.vendor_id is not distinct from (v_row->>'vendor_id')::uuid
       and zm.origin_destination_id is not distinct from (v_row->>'origin_id')::uuid
       and zm.product_id is not distinct from (v_row->>'product_id')::uuid
       and zm.destination_id is not distinct from (v_row->>'destination_id')::uuid
       and upper(btrim(coalesce(zm.service, ''))) = upper(btrim(coalesce(v_row->>'service', '')))
     limit 1;

    if v_existing is not null then
      select jsonb_build_object(
        'zone_id', zm.zone_id, 'country_id', zm.country_id,
        'effective_date', zm.effective_date, 'service', zm.service,
        'origin', v_row->>'origin', 'vendor', v_row->>'vendor',
        'product', v_row->>'product', 'destination', v_row->>'destination',
        'zone', (select z.code from public.zones z where z.id = zm.zone_id)
      ) into v_old
      from public.zone_mappings zm where zm.id = v_existing;

      update public.zone_mappings set
        zone_id = (v_row->>'zone_id')::uuid,
        country_id = (v_row->>'country_id')::uuid,
        effective_date = p_effective_date,
        service = v_row->>'service',
        updated_by = auth.uid()
      where id = v_existing and tenant_id = v_tenant;
      v_replace := v_replace + 1;
    else
      v_old := null;
      insert into public.zone_mappings (
        tenant_id, origin_destination_id, vendor_id, service, product_id,
        country_id, destination_id, zone_id, effective_date, created_by, updated_by)
      values (
        v_tenant, (v_row->>'origin_id')::uuid, (v_row->>'vendor_id')::uuid,
        v_row->>'service', (v_row->>'product_id')::uuid, (v_row->>'country_id')::uuid,
        (v_row->>'destination_id')::uuid, (v_row->>'zone_id')::uuid,
        p_effective_date, auth.uid(), auth.uid())
      returning id into v_existing;
      v_new := v_new + 1;
    end if;

    perform app.write_audit_log(
      p_tenant_id => v_tenant,
      p_entity_type => 'zone_mappings',
      p_action => 'ZONE_IMPORT',
      p_entity_id => v_existing,
      p_module_slug => 'utl.zone-update',
      p_old => v_old,
      p_new => jsonb_build_object(
        'origin', v_row->>'origin', 'vendor', v_row->>'vendor',
        'product', v_row->>'product', 'country', v_row->>'country',
        'destination', v_row->>'destination', 'zone', v_row->>'zone',
        'service', v_row->>'service', 'effective_date', p_effective_date,
        'outcome', v_row->>'outcome'));
    v_imported := v_imported + 1;
  end loop;

  return jsonb_build_object(
    'imported', v_imported,
    'new_count', v_new,
    'replace_count', v_replace,
    'skipped', coalesce((v_class->>'failed_count')::integer, 0)
  );
end
$$;

create or replace function public.save_zone_mapping(p_id uuid, p_fields jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_old public.zone_mappings;
  v_id uuid;
  v_service text;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  perform app.assert_zone_update_permission(v_tenant, case when p_id is null then 'add' else 'modify' end);
  if nullif(btrim(coalesce(p_fields->>'effective_date', '')), '') is null
     or nullif(p_fields->>'origin_id', '') is null
     or nullif(p_fields->>'vendor_id', '') is null
     or nullif(p_fields->>'product_id', '') is null
     or nullif(p_fields->>'country_id', '') is null
     or nullif(p_fields->>'destination_id', '') is null
     or nullif(p_fields->>'zone_id', '') is null
     or nullif(btrim(coalesce(p_fields->>'service', '')), '') is null then
    raise exception 'Date, origin, vendor, product, country, destination, zone, and service are required'
      using errcode = '22023';
  end if;

  select sm.service into v_service
    from public.service_mappings sm
   where sm.tenant_id = v_tenant and sm.deleted_at is null and sm.status = 'ACTIVE'
     and sm.vendor_id = (p_fields->>'vendor_id')::uuid
     and upper(sm.service) = upper(btrim(p_fields->>'service'))
   limit 1;
  if v_service is null then
    raise exception 'Unknown service for this vendor' using errcode = '22023';
  end if;

  if p_id is not null then
    select * into v_old from public.zone_mappings
     where id = p_id and tenant_id = v_tenant and deleted_at is null;
    if not found then
      raise exception 'Zone mapping not found' using errcode = 'P0002';
    end if;
    update public.zone_mappings set
      origin_destination_id = (p_fields->>'origin_id')::uuid,
      vendor_id = (p_fields->>'vendor_id')::uuid,
      product_id = (p_fields->>'product_id')::uuid,
      country_id = (p_fields->>'country_id')::uuid,
      destination_id = (p_fields->>'destination_id')::uuid,
      zone_id = (p_fields->>'zone_id')::uuid,
      service = v_service,
      effective_date = (p_fields->>'effective_date')::date,
      updated_by = auth.uid()
    where id = p_id and tenant_id = v_tenant
    returning id into v_id;
  else
    select * into v_old
      from public.zone_mappings zm
     where zm.tenant_id = v_tenant and zm.deleted_at is null
       and zm.vendor_id = (p_fields->>'vendor_id')::uuid
       and zm.origin_destination_id is not distinct from (p_fields->>'origin_id')::uuid
       and zm.product_id is not distinct from (p_fields->>'product_id')::uuid
       and zm.destination_id is not distinct from (p_fields->>'destination_id')::uuid
       and upper(btrim(coalesce(zm.service, ''))) = upper(v_service)
     limit 1;
    if v_old.id is not null then
      update public.zone_mappings set
        country_id = (p_fields->>'country_id')::uuid,
        zone_id = (p_fields->>'zone_id')::uuid,
        service = v_service,
        effective_date = (p_fields->>'effective_date')::date,
        updated_by = auth.uid()
      where id = v_old.id
      returning id into v_id;
    else
      insert into public.zone_mappings (
        tenant_id, origin_destination_id, vendor_id, service, product_id,
        country_id, destination_id, zone_id, effective_date, created_by, updated_by)
      values (
        v_tenant, (p_fields->>'origin_id')::uuid, (p_fields->>'vendor_id')::uuid,
        v_service, (p_fields->>'product_id')::uuid, (p_fields->>'country_id')::uuid,
        (p_fields->>'destination_id')::uuid, (p_fields->>'zone_id')::uuid,
        (p_fields->>'effective_date')::date, auth.uid(), auth.uid())
      returning id into v_id;
    end if;
  end if;

  perform app.write_audit_log(
    p_tenant_id => v_tenant,
    p_entity_type => 'zone_mappings',
    p_action => 'ZONE_IMPORT',
    p_entity_id => v_id,
    p_module_slug => 'utl.zone-update',
    p_old => case when v_old.id is null then null else jsonb_build_object(
      'zone_id', v_old.zone_id, 'service', v_old.service, 'effective_date', v_old.effective_date,
      'destination_id', v_old.destination_id, 'country_id', v_old.country_id) end,
    p_new => p_fields || jsonb_build_object('service', v_service));
  return v_id;
end
$$;

create or replace function public.delete_zone_mapping(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_old public.zone_mappings;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  perform app.assert_zone_update_permission(v_tenant, 'delete');
  select * into v_old from public.zone_mappings
   where id = p_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'Zone mapping not found' using errcode = 'P0002';
  end if;
  update public.zone_mappings
     set deleted_at = now(), updated_by = auth.uid()
   where id = p_id and tenant_id = v_tenant;
  perform app.write_audit_log(
    p_tenant_id => v_tenant,
    p_entity_type => 'zone_mappings',
    p_action => 'ZONE_MAPPING_DELETE',
    p_entity_id => p_id,
    p_module_slug => 'utl.zone-update',
    p_old => jsonb_build_object(
      'origin_destination_id', v_old.origin_destination_id,
      'vendor_id', v_old.vendor_id,
      'product_id', v_old.product_id,
      'country_id', v_old.country_id,
      'destination_id', v_old.destination_id,
      'zone_id', v_old.zone_id,
      'service', v_old.service,
      'effective_date', v_old.effective_date),
    p_new => jsonb_build_object('deleted', true));
end
$$;

create or replace function public.search_zone_mappings(p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_as_of date;
  v_type text;
  v_total integer;
  v_rows jsonb;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  perform app.assert_zone_update_permission(v_tenant, 'search');
  begin
    v_as_of := nullif(btrim(coalesce(p_filters->>'as_of', '')), '')::date;
  exception when others then
    v_as_of := null;
  end;
  v_type := upper(btrim(coalesce(p_filters->>'export_type', 'INTERNATIONAL')));

  with filtered as (
    select
      zm.id,
      o.code as origin,
      v.code as vendor,
      p.code as product,
      c.code as country,
      d.code as destination,
      d.name as destination_name,
      z.code as zone,
      zm.service as service_type,
      zm.effective_date,
      o.id as origin_id,
      v.id as vendor_id,
      p.id as product_id,
      c.id as country_id,
      d.id as destination_id,
      z.id as zone_id
    from public.zone_mappings zm
    left join public.destinations o on o.id = zm.origin_destination_id
    left join public.vendors v on v.id = zm.vendor_id
    left join public.products p on p.id = zm.product_id
    left join public.countries c on c.id = zm.country_id
    left join public.destinations d on d.id = zm.destination_id
    left join public.zones z on z.id = zm.zone_id
    where zm.tenant_id = v_tenant and zm.deleted_at is null
      and (v_as_of is null or zm.effective_date <= v_as_of)
      and (nullif(p_filters->>'vendor_id', '') is null or zm.vendor_id = (p_filters->>'vendor_id')::uuid)
      and (nullif(p_filters->>'product_id', '') is null or zm.product_id = (p_filters->>'product_id')::uuid)
      and (nullif(p_filters->>'origin_id', '') is null or zm.origin_destination_id = (p_filters->>'origin_id')::uuid)
      and (nullif(p_filters->>'zone_id', '') is null or zm.zone_id = (p_filters->>'zone_id')::uuid)
      and (nullif(p_filters->>'country_id', '') is null or zm.country_id = (p_filters->>'country_id')::uuid)
      and (nullif(p_filters->>'destination_id', '') is null or zm.destination_id = (p_filters->>'destination_id')::uuid)
      and (nullif(btrim(coalesce(p_filters->>'service', '')), '') is null
           or upper(zm.service) = upper(btrim(p_filters->>'service')))
      and (
        v_type = 'ALL'
        or (v_type = 'DOMESTIC' and (d.dest_type = 'DOMESTIC' or upper(coalesce(c.code, '')) = 'IN'))
        or (v_type <> 'DOMESTIC' and d.dest_type is distinct from 'DOMESTIC'
            and upper(coalesce(c.code, '')) is distinct from 'IN')
      )
  )
  select count(*)::integer,
         coalesce(jsonb_agg(jsonb_build_object(
           'id', f.id, 'Origin', f.origin, 'Vendor', f.vendor, 'Product', f.product,
           'Country', f.country, 'Destination', f.destination, 'destination_name', f.destination_name,
           'Zone', f.zone, 'ServiceType', f.service_type, 'effective_date', f.effective_date,
           'origin_id', f.origin_id, 'vendor_id', f.vendor_id, 'product_id', f.product_id,
           'country_id', f.country_id, 'destination_id', f.destination_id, 'zone_id', f.zone_id
         ) order by f.vendor, f.destination, f.product), '[]'::jsonb)
    into v_total, v_rows
  from filtered f;

  return jsonb_build_object('total', coalesce(v_total, 0), 'rows', coalesce(v_rows, '[]'::jsonb));
end
$$;

-- Destination and country both count. A service on the row matches only that
-- service, so another UPS service keeps the destination's own zone.
create or replace function app.resolve_rating_zone(
  p_tenant uuid,
  p_origin uuid,
  p_dest uuid,
  p_vendor uuid,
  p_product uuid,
  p_service text,
  p_as_of date
)
returns uuid
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_zone uuid;
begin
  select zm.zone_id into v_zone
    from public.zone_mappings zm
   where zm.tenant_id = p_tenant
     and zm.deleted_at is null
     and zm.effective_date <= p_as_of
     and (zm.origin_destination_id is null or zm.origin_destination_id = p_origin)
     and (zm.vendor_id is null or zm.vendor_id = p_vendor)
     and (zm.product_id is null or zm.product_id = p_product)
     and (zm.service is null or nullif(btrim(zm.service), '') is null
          or upper(zm.service) = upper(coalesce(p_service, '')))
     and (zm.destination_id is null or zm.destination_id = p_dest)
     and (
       zm.country_id is null
       or exists (
         select 1 from public.destinations d
          where d.id = p_dest and d.tenant_id = p_tenant and d.country_id = zm.country_id
       )
     )
   order by
     (case when zm.destination_id is not null then 16 else 0 end)
   + (case when zm.country_id is not null then 8 else 0 end)
   + (case when zm.origin_destination_id is not null then 4 else 0 end)
   + (case when zm.vendor_id is not null then 2 else 0 end)
   + (case when zm.product_id is not null then 2 else 0 end)
   + (case when nullif(btrim(coalesce(zm.service, '')), '') is not null then 1 else 0 end) desc,
     zm.effective_date desc
   limit 1;

  if v_zone is null and p_dest is not null then
    select d.zone_id into v_zone from public.destinations d
     where d.id = p_dest and d.tenant_id = p_tenant and d.deleted_at is null;
  end if;
  return v_zone;
end
$$;

create or replace function app.tg_shipment_stamp_zone()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
begin
  if new.zone_id is null
     and new.tenant_id is not null
     and new.origin_destination_id is not null
     and new.destination_id is not null then
    new.zone_id := app.resolve_rating_zone(
      new.tenant_id,
      new.origin_destination_id,
      new.destination_id,
      new.vendor_id,
      new.product_id,
      new.service,
      coalesce(new.book_date, current_date));
  end if;
  return new;
end
$$;

drop trigger if exists trg_shipments_stamp_zone on public.shipments;
create trigger trg_shipments_stamp_zone
  before insert on public.shipments
  for each row execute function app.tg_shipment_stamp_zone();

revoke all on function public.preview_zone_import(jsonb) from public;
grant execute on function public.preview_zone_import(jsonb) to authenticated, service_role;

revoke all on function public.apply_zone_import(jsonb, date, boolean) from public;
grant execute on function public.apply_zone_import(jsonb, date, boolean) to authenticated, service_role;

revoke all on function public.save_zone_mapping(uuid, jsonb) from public;
grant execute on function public.save_zone_mapping(uuid, jsonb) to authenticated, service_role;

revoke all on function public.delete_zone_mapping(uuid) from public;
grant execute on function public.delete_zone_mapping(uuid) to authenticated, service_role;

revoke all on function public.search_zone_mappings(jsonb) from public;
grant execute on function public.search_zone_mappings(jsonb) to authenticated, service_role;
