-- 0157  An identical zone row is unchanged.
-- Same zone and same effective date is not rewritten and is not audited.

create or replace function app.classify_zone_import_rows(p_tenant uuid, p_rows jsonb, p_effective_date date)
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
  v_unchanged integer := 0;
  v_existing_zone uuid;
  v_existing_date date;
  v_outcome text;
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
    v_existing_zone := null;
    v_existing_date := null;
    v_outcome := null;

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
      select zm.id, zm.zone_id, zm.effective_date
        into v_existing, v_existing_zone, v_existing_date
        from public.zone_mappings zm
       where zm.tenant_id = p_tenant and zm.deleted_at is null
         and zm.vendor_id is not distinct from v_vendor_id
         and zm.origin_destination_id is not distinct from v_origin_id
         and zm.product_id is not distinct from v_product_id
         and zm.destination_id is not distinct from v_dest_id
         and upper(btrim(coalesce(zm.service, ''))) = upper(btrim(coalesce(v_service_canon, '')))
       limit 1;
      v_ok := v_ok + 1;
      if v_existing is null then
        v_new := v_new + 1;
        v_outcome := 'NEW';
      elsif v_existing_zone is not distinct from v_zone_id
        and v_existing_date is not distinct from p_effective_date then
        v_unchanged := v_unchanged + 1;
        v_outcome := 'UNCHANGED';
      else
        v_replace := v_replace + 1;
        v_outcome := 'REPLACE';
      end if;
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
      'outcome', v_outcome,
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
    'unchanged_count', v_unchanged,
    'rows', v_out
  );
end
$$;



drop function if exists app.classify_zone_import_rows(uuid, jsonb);

create or replace function public.preview_zone_import(p_rows jsonb, p_effective_date date)
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
  if p_effective_date is null then
    raise exception 'Effective date is required' using errcode = '22023';
  end if;
  v_result := app.classify_zone_import_rows(v_tenant, p_rows, p_effective_date);
  return jsonb_build_object(
    'total', v_result->'total',
    'ok_count', v_result->'ok_count',
    'failed_count', v_result->'failed_count',
    'new_count', v_result->'new_count',
    'replace_count', v_result->'replace_count',
    'unchanged_count', v_result->'unchanged_count',
    'rows', (
      select coalesce(jsonb_agg(r - 'origin_id' - 'vendor_id' - 'product_id'
        - 'country_id' - 'destination_id' - 'zone_id'), '[]'::jsonb)
      from jsonb_array_elements(v_result->'rows') r
    )
  );
end
$$;

drop function if exists public.preview_zone_import(jsonb);

revoke all on function public.preview_zone_import(jsonb, date) from public;
grant execute on function public.preview_zone_import(jsonb, date) to authenticated, service_role;

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
  v_unchanged integer := 0;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  perform app.assert_zone_update_permission(v_tenant, 'modify');
  if p_effective_date is null then
    raise exception 'Effective date is required' using errcode = '22023';
  end if;

  v_class := app.classify_zone_import_rows(v_tenant, p_rows, p_effective_date);
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
    if v_row->>'outcome' = 'UNCHANGED' then
      v_unchanged := v_unchanged + 1;
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
    'unchanged_count', v_unchanged,
    'skipped', coalesce((v_class->>'failed_count')::integer, 0)
  );
end
$$;
