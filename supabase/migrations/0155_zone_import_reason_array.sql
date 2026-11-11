-- 0155  Zone import reasons are stored as text array items.
-- A quoted sentence was parsed as an array literal and the dry run stopped.

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
      v_reasons := v_reasons || array['unknown origin'];
    else
      select d.id into v_origin_id
        from public.destinations d
       where d.tenant_id = p_tenant and d.deleted_at is null
         and (upper(d.code) = upper(v_origin) or upper(d.name) = upper(v_origin))
       order by case when upper(d.code) = upper(v_origin) then 0 else 1 end, d.code
       limit 1;
      if v_origin_id is null then
        v_reasons := v_reasons || array['unknown origin'];
      end if;
    end if;

    if v_vendor = '' then
      v_reasons := v_reasons || array['unknown vendor'];
    else
      select v.id into v_vendor_id
        from public.vendors v
       where v.tenant_id = p_tenant and v.deleted_at is null
         and (upper(v.code) = upper(v_vendor) or upper(v.name) = upper(v_vendor))
       order by case when upper(v.code) = upper(v_vendor) then 0 else 1 end, v.code
       limit 1;
      if v_vendor_id is null then
        v_reasons := v_reasons || array['unknown vendor'];
      end if;
    end if;

    if v_product = '' then
      v_reasons := v_reasons || array['unknown product'];
    else
      select p.id into v_product_id
        from public.products p
       where p.tenant_id = p_tenant and p.deleted_at is null
         and (upper(p.code) = upper(v_product) or upper(p.name) = upper(v_product))
       order by case when upper(p.code) = upper(v_product) then 0 else 1 end, p.code
       limit 1;
      if v_product_id is null then
        v_reasons := v_reasons || array['unknown product'];
      end if;
    end if;

    if v_country = '' then
      v_reasons := v_reasons || array['unknown country'];
    else
      select c.id into v_country_id
        from public.countries c
       where c.tenant_id = p_tenant and c.deleted_at is null
         and (upper(c.code) = upper(v_country) or upper(c.name) = upper(v_country))
       order by case when upper(c.code) = upper(v_country) then 0 else 1 end, c.code
       limit 1;
      if v_country_id is null then
        v_reasons := v_reasons || array['unknown country'];
      end if;
    end if;

    if v_dest = '' then
      v_reasons := v_reasons || array['unknown destination'];
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
        v_reasons := v_reasons || array['unknown destination'];
      elsif v_country_id is not null and v_dest_country is not null and v_dest_country <> v_country_id then
        v_reasons := v_reasons || array['unknown destination'];
      end if;
    end if;

    if v_zone = '' then
      v_reasons := v_reasons || array['unknown zone'];
    else
      select z.id into v_zone_id
        from public.zones z
       where z.tenant_id = p_tenant and z.deleted_at is null
         and upper(z.code) = upper(v_zone)
       limit 1;
      if v_zone_id is null then
        v_reasons := v_reasons || array['unknown zone'];
      end if;
    end if;

    if v_service = '' then
      v_reasons := v_reasons || array['unknown service'];
    elsif v_vendor_id is null then
      v_reasons := v_reasons || array['unknown service'];
    else
      select sm.service into v_service_canon
        from public.service_mappings sm
       where sm.tenant_id = p_tenant and sm.deleted_at is null and sm.status = 'ACTIVE'
         and sm.vendor_id = v_vendor_id
         and upper(sm.service) = upper(v_service)
       limit 1;
      if v_service_canon is null then
        v_reasons := v_reasons || array['unknown service'];
      end if;
    end if;

    v_key := upper(v_origin) || '|' || upper(v_vendor) || '|' || upper(v_product)
      || '|' || upper(v_dest) || '|' || upper(v_service);
    if v_key = any (v_dups) then
      v_reasons := v_reasons || array['duplicate row in file'];
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

