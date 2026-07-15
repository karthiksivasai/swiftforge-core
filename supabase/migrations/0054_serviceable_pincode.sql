-- ===========================================================================
-- 0054  serviceable pincode — Phase 6 Milestone 6F
-- ---------------------------------------------------------------------------
-- Query-only utility over existing geo / zone / product / service mapping data.
-- NO new geo tables. NO carrier APIs. NO external lookups. NO workers/cron.
-- Permission: utl.serviceable-pincode
-- Reuses: app.resolve_rating_zone (0041), pincodes, destinations, zones,
--         products, service_mappings, branches / service_centers.
-- ===========================================================================

create or replace function app.assert_serviceable_pincode_permission(
  p_tenant uuid, p_action text
)
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
  if app.user_has_permission(p_tenant, 'utl.serviceable-pincode', p_action) then
    return;
  end if;
  if p_action in ('list','search')
     and (
       app.user_has_permission(p_tenant, 'utl.serviceable-pincode', 'add')
       or app.user_has_permission(p_tenant, 'utl.serviceable-pincode', 'modify')
       or app.user_has_permission(p_tenant, 'utl.serviceable-pincode', 'list')
       or app.user_has_permission(p_tenant, 'utl.serviceable-pincode', 'search')
     ) then
    return;
  end if;
  raise exception 'Permission denied: utl.serviceable-pincode' using errcode = '42501';
end
$$;

-- ---------------------------------------------------------------------------
-- Helper: load pincode row + joined masters (read-only)
-- ---------------------------------------------------------------------------
create or replace function app.lookup_pincode_detail(
  p_tenant uuid,
  p_pin text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_pin text := nullif(btrim(coalesce(p_pin,'')),'');
  v_row record;
begin
  if v_pin is null then
    return null;
  end if;

  select
    p.id,
    p.pin_code,
    p.pin_name,
    p.is_serviceable,
    p.is_oda,
    p.pickup_available,
    p.destination_id,
    p.zone_id,
    p.branch_id,
    p.vendor_id,
    p.state_id,
    d.code as destination_code,
    d.name as destination_name,
    d.status as destination_status,
    z.code as zone_code,
    z.name as zone_name,
    b.code as branch_code,
    b.name as branch_name,
    sc.id as service_center_id,
    sc.code as service_center_code,
    sc.name as service_center_name,
    v.code as vendor_code,
    v.name as vendor_name,
    st.code as state_code,
    st.name as state_name
  into v_row
  from public.pincodes p
  left join public.destinations d
    on d.id = p.destination_id and d.tenant_id = p.tenant_id and d.deleted_at is null
  left join public.zones z
    on z.id = p.zone_id and z.tenant_id = p.tenant_id and z.deleted_at is null
  left join public.branches b
    on b.id = p.branch_id and b.tenant_id = p.tenant_id and b.deleted_at is null
  left join public.service_centers sc
    on sc.tenant_id = p.tenant_id and sc.deleted_at is null
   and (
     (p.branch_id is not null and sc.id = p.branch_id)
     or (b.code is not null and sc.code = b.code)
   )
  left join public.vendors v
    on v.id = p.vendor_id and v.tenant_id = p.tenant_id and v.deleted_at is null
  left join public.states st
    on st.id = p.state_id and st.tenant_id = p.tenant_id and st.deleted_at is null
  where p.tenant_id = p_tenant
    and p.deleted_at is null
    and p.pin_code = v_pin
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'pin_code', v_row.pin_code,
    'pin_name', v_row.pin_name,
    'is_serviceable', v_row.is_serviceable,
    'is_oda', v_row.is_oda,
    'pickup_available', v_row.pickup_available,
    'destination_id', v_row.destination_id,
    'destination_code', v_row.destination_code,
    'destination_name', v_row.destination_name,
    'destination_status', v_row.destination_status,
    'zone_id', v_row.zone_id,
    'zone_code', v_row.zone_code,
    'zone_name', v_row.zone_name,
    'branch_id', v_row.branch_id,
    'branch_code', v_row.branch_code,
    'branch_name', v_row.branch_name,
    'service_center_id', coalesce(v_row.service_center_id, v_row.branch_id),
    'service_center_code', coalesce(v_row.service_center_code, v_row.branch_code),
    'service_center_name', coalesce(v_row.service_center_name, v_row.branch_name),
    'vendor_id', v_row.vendor_id,
    'vendor_code', v_row.vendor_code,
    'vendor_name', v_row.vendor_name,
    'state_id', v_row.state_id,
    'state_code', v_row.state_code,
    'state_name', v_row.state_name
  );
end
$$;

-- ===========================================================================
-- check_serviceable_pincode — origin/dest/product/shipment-type check
-- ===========================================================================
create or replace function public.check_serviceable_pincode(
  p_origin_pincode text,
  p_destination_pincode text,
  p_product_code text default null,
  p_shipment_type text default null,
  p_service text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_origin jsonb;
  v_dest jsonb;
  v_product record;
  v_product_id uuid := null;
  v_ship_type text := nullif(upper(btrim(coalesce(p_shipment_type,''))),'');
  v_service text := nullif(btrim(coalesce(p_service,'')),'');
  v_prod_code text := nullif(btrim(coalesce(p_product_code,'')),'');
  v_origin_zone uuid;
  v_dest_zone uuid;
  v_ozone_code text; v_ozone_name text;
  v_dzone_code text; v_dzone_name text;
  v_mappings jsonb := '[]'::jsonb;
  v_reason text := null;
  v_serviceable boolean := true;
begin
  perform app.assert_serviceable_pincode_permission(v_tenant, 'search');

  if nullif(btrim(coalesce(p_origin_pincode,'')),'') is null then
    return jsonb_build_object(
      'serviceable', false,
      'failure_reason', 'Origin pincode is required');
  end if;
  if nullif(btrim(coalesce(p_destination_pincode,'')),'') is null then
    return jsonb_build_object(
      'serviceable', false,
      'failure_reason', 'Destination pincode is required');
  end if;

  v_origin := app.lookup_pincode_detail(v_tenant, p_origin_pincode);
  v_dest := app.lookup_pincode_detail(v_tenant, p_destination_pincode);

  if v_origin is null then
    return jsonb_build_object(
      'serviceable', false,
      'failure_reason', 'Unknown origin pincode',
      'origin_pincode', btrim(p_origin_pincode),
      'destination_pincode', btrim(p_destination_pincode));
  end if;
  if v_dest is null then
    return jsonb_build_object(
      'serviceable', false,
      'failure_reason', 'Unknown destination pincode',
      'origin', v_origin,
      'origin_pincode', btrim(p_origin_pincode),
      'destination_pincode', btrim(p_destination_pincode));
  end if;

  if not coalesce((v_dest->>'is_serviceable')::boolean, false) then
    v_serviceable := false;
    v_reason := 'Destination pincode is not serviceable';
  elsif v_dest->>'destination_id' is null then
    v_serviceable := false;
    v_reason := 'Destination pincode has no linked destination';
  elsif coalesce(v_dest->>'destination_status','') <> 'ACTIVE' then
    v_serviceable := false;
    v_reason := 'Linked destination is inactive';
  end if;

  -- Optional product / shipment type filter
  if v_prod_code is not null then
    select pr.id, pr.code, pr.name, pr.shipment_type, pr.status
      into v_product
      from public.products pr
     where pr.tenant_id = v_tenant
       and pr.deleted_at is null
       and upper(pr.code) = upper(v_prod_code)
     limit 1;
    if not found then
      v_serviceable := false;
      v_reason := coalesce(v_reason, 'Unknown product');
    elsif v_product.status <> 'ACTIVE' then
      v_serviceable := false;
      v_reason := coalesce(v_reason, 'Product is inactive');
    elsif v_ship_type is not null and upper(v_product.shipment_type) <> v_ship_type then
      v_serviceable := false;
      v_reason := coalesce(v_reason,
        format('Product shipment type %s does not match requested %s',
               v_product.shipment_type, v_ship_type));
    else
      v_product_id := v_product.id;
    end if;
  elsif v_ship_type is not null then
    if v_ship_type not in ('DOX','NDOX') then
      return jsonb_build_object(
        'serviceable', false,
        'failure_reason', 'Invalid shipment type (use DOX or NDOX)');
    end if;
  end if;

  -- Zone resolution via existing rating helper (origin/dest destinations)
  if v_origin->>'destination_id' is not null and v_dest->>'destination_id' is not null then
    v_dest_zone := app.resolve_rating_zone(
      v_tenant,
      (v_origin->>'destination_id')::uuid,
      (v_dest->>'destination_id')::uuid,
      nullif(v_dest->>'vendor_id','')::uuid,
      v_product_id,
      v_service,
      current_date);
    -- Origin zone: reverse lane or pincode.zone_id fallback
    v_origin_zone := app.resolve_rating_zone(
      v_tenant,
      (v_dest->>'destination_id')::uuid,
      (v_origin->>'destination_id')::uuid,
      nullif(v_origin->>'vendor_id','')::uuid,
      v_product_id,
      v_service,
      current_date);
  end if;

  if v_origin_zone is null and v_origin->>'zone_id' is not null then
    v_origin_zone := (v_origin->>'zone_id')::uuid;
  end if;
  if v_dest_zone is null and v_dest->>'zone_id' is not null then
    v_dest_zone := (v_dest->>'zone_id')::uuid;
  end if;

  if v_origin_zone is not null then
    select z.code, z.name into v_ozone_code, v_ozone_name
      from public.zones z
     where z.id = v_origin_zone and z.tenant_id = v_tenant and z.deleted_at is null;
  end if;
  if v_dest_zone is not null then
    select z.code, z.name into v_dzone_code, v_dzone_name
      from public.zones z
     where z.id = v_dest_zone and z.tenant_id = v_tenant and z.deleted_at is null;
  end if;

  -- Estimated routing from existing service_mappings (+ destination vendor)
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'service_mapping_id', x.id,
      'vendor_id', x.vendor_id,
      'vendor_code', x.vendor_code,
      'vendor_name', x.vendor_name,
      'billing_vendor_id', x.billing_vendor_id,
      'billing_vendor_code', x.billing_vendor_code,
      'service', x.service,
      'service_type', x.service_type,
      'min_weight', x.min_weight,
      'max_weight', x.max_weight,
      'vendor_link', x.vendor_link,
      'is_single_piece', x.is_single_piece
    ) order by x.service
  ), '[]'::jsonb)
    into v_mappings
    from (
      select
        sm.id,
        sm.vendor_id,
        vv.code as vendor_code,
        vv.name as vendor_name,
        sm.billing_vendor_id,
        bv.code as billing_vendor_code,
        sm.service,
        sm.service_type,
        sm.min_weight,
        sm.max_weight,
        sm.vendor_link,
        sm.is_single_piece
      from public.service_mappings sm
      join public.vendors vv
        on vv.id = sm.vendor_id and vv.tenant_id = sm.tenant_id and vv.deleted_at is null
      left join public.vendors bv
        on bv.id = sm.billing_vendor_id and bv.tenant_id = sm.tenant_id and bv.deleted_at is null
      where sm.tenant_id = v_tenant
        and sm.deleted_at is null
        and sm.status = 'ACTIVE'
        and (
          (v_dest->>'vendor_id' is not null and sm.vendor_id = (v_dest->>'vendor_id')::uuid)
          or (v_service is not null and upper(sm.service) = upper(v_service))
          or (v_dest->>'vendor_id' is null and v_service is null)
        )
      order by sm.service
      limit 20
    ) x;

  return jsonb_build_object(
    'serviceable', v_serviceable,
    'failure_reason', case when v_serviceable then null else v_reason end,
    'origin_pincode', v_origin->>'pin_code',
    'destination_pincode', v_dest->>'pin_code',
    'origin', v_origin,
    'destination', v_dest,
    'origin_zone', case when v_origin_zone is null then null else jsonb_build_object(
      'id', v_origin_zone, 'code', v_ozone_code, 'name', v_ozone_name) end,
    'destination_zone', case when v_dest_zone is null then null else jsonb_build_object(
      'id', v_dest_zone, 'code', v_dzone_code, 'name', v_dzone_name) end,
    'destination_master', case when v_dest->>'destination_id' is null then null else jsonb_build_object(
      'id', v_dest->>'destination_id',
      'code', v_dest->>'destination_code',
      'name', v_dest->>'destination_name',
      'status', v_dest->>'destination_status') end,
    'service_center', case when coalesce(v_dest->>'service_center_id', v_dest->>'branch_id') is null
      then null else jsonb_build_object(
        'id', coalesce(v_dest->>'service_center_id', v_dest->>'branch_id'),
        'code', coalesce(v_dest->>'service_center_code', v_dest->>'branch_code'),
        'name', coalesce(v_dest->>'service_center_name', v_dest->>'branch_name')) end,
    'product', case when v_product_id is null then null else jsonb_build_object(
      'id', v_product.id,
      'code', v_product.code,
      'name', v_product.name,
      'shipment_type', v_product.shipment_type,
      'status', v_product.status) end,
    'shipment_type', case when v_product_id is not null then v_product.shipment_type else v_ship_type end,
    'service', v_service,
    'routing', v_mappings,
    'is_oda', coalesce((v_dest->>'is_oda')::boolean, false),
    'pickup_available', coalesce((v_origin->>'pickup_available')::boolean, false)
  );
end
$$;

revoke all on function public.check_serviceable_pincode(text, text, text, text, text) from public;
grant execute on function public.check_serviceable_pincode(text, text, text, text, text)
  to authenticated, service_role;

-- ===========================================================================
-- search_serviceable_pincode — UI lookup by pin or name
-- ===========================================================================
create or replace function public.search_serviceable_pincode(
  p_query text,
  p_mode text default 'pincode',
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_q text := nullif(btrim(coalesce(p_query,'')),'');
  v_mode text := lower(coalesce(nullif(btrim(p_mode),''), 'pincode'));
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_pat text;
  v_rows jsonb;
begin
  perform app.assert_serviceable_pincode_permission(v_tenant, 'search');

  if v_q is null then
    return jsonb_build_object('rows', '[]'::jsonb, 'total', 0);
  end if;

  if v_mode not in ('pincode','name') then
    raise exception 'Invalid mode (pincode|name)' using errcode = 'CMS04';
  end if;

  v_pat := '%' || v_q || '%';

  select coalesce(jsonb_agg(to_jsonb(t) order by t.pin_code), '[]'::jsonb)
    into v_rows
    from (
      select
        p.id,
        p.pin_code,
        p.pin_name,
        p.is_serviceable,
        p.is_oda,
        p.pickup_available,
        p.destination_id,
        d.code as destination_code,
        d.name as destination_name,
        d.status as destination_status,
        p.zone_id,
        z.code as zone_code,
        z.name as zone_name,
        p.branch_id,
        coalesce(sc.code, b.code) as service_center_code,
        coalesce(sc.name, b.name) as service_center_name,
        p.vendor_id,
        v.code as vendor_code,
        v.name as vendor_name,
        p.state_id,
        st.code as state_code,
        st.name as state_name
      from public.pincodes p
      left join public.destinations d
        on d.id = p.destination_id and d.tenant_id = p.tenant_id and d.deleted_at is null
      left join public.zones z
        on z.id = p.zone_id and z.tenant_id = p.tenant_id and z.deleted_at is null
      left join public.branches b
        on b.id = p.branch_id and b.tenant_id = p.tenant_id and b.deleted_at is null
      left join public.service_centers sc
        on sc.tenant_id = p.tenant_id and sc.deleted_at is null
       and (
         (p.branch_id is not null and sc.id = p.branch_id)
         or (b.code is not null and sc.code = b.code)
       )
      left join public.vendors v
        on v.id = p.vendor_id and v.tenant_id = p.tenant_id and v.deleted_at is null
      left join public.states st
        on st.id = p.state_id and st.tenant_id = p.tenant_id and st.deleted_at is null
      where p.tenant_id = v_tenant
        and p.deleted_at is null
        and (
          (v_mode = 'pincode' and p.pin_code ilike v_pat)
          or (v_mode = 'name' and (
            p.pin_name ilike v_pat
            or d.name ilike v_pat
            or d.code ilike v_pat
          ))
        )
      order by p.pin_code
      limit v_limit
    ) t;

  return jsonb_build_object(
    'rows', v_rows,
    'total', jsonb_array_length(v_rows),
    'mode', v_mode,
    'query', v_q
  );
end
$$;

revoke all on function public.search_serviceable_pincode(text, text, integer) from public;
grant execute on function public.search_serviceable_pincode(text, text, integer)
  to authenticated, service_role;

-- ===========================================================================
-- list_serviceable_routes — browse existing mappings (+ optional pin filter)
-- ===========================================================================
create or replace function public.list_serviceable_routes(
  p_destination_pincode text default null,
  p_product_code text default null,
  p_page integer default 1,
  p_page_size integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_size integer := least(greatest(coalesce(p_page_size, 50), 1), 200);
  v_offset integer := (v_page - 1) * v_size;
  v_pin text := nullif(btrim(coalesce(p_destination_pincode,'')),'');
  v_prod text := nullif(btrim(coalesce(p_product_code,'')),'');
  v_dest_id uuid;
  v_vendor_id uuid;
  v_total bigint;
  v_rows jsonb;
begin
  perform app.assert_serviceable_pincode_permission(v_tenant, 'list');

  if v_pin is not null then
    select p.destination_id, p.vendor_id into v_dest_id, v_vendor_id
      from public.pincodes p
     where p.tenant_id = v_tenant and p.deleted_at is null and p.pin_code = v_pin
     limit 1;
  end if;

  select count(*) into v_total
    from public.service_mappings sm
   where sm.tenant_id = v_tenant
     and sm.deleted_at is null
     and sm.status = 'ACTIVE'
     and (v_vendor_id is null or sm.vendor_id = v_vendor_id);

  select coalesce(jsonb_agg(to_jsonb(t) order by t.service), '[]'::jsonb)
    into v_rows
    from (
      select
        sm.id,
        sm.service,
        sm.service_type,
        sm.min_weight,
        sm.max_weight,
        sm.vendor_link,
        sm.is_single_piece,
        sm.vendor_id,
        vv.code as vendor_code,
        vv.name as vendor_name,
        sm.billing_vendor_id,
        bv.code as billing_vendor_code,
        bv.name as billing_vendor_name,
        v_pin as destination_pincode,
        v_dest_id as destination_id,
        v_prod as product_code
      from public.service_mappings sm
      join public.vendors vv
        on vv.id = sm.vendor_id and vv.tenant_id = sm.tenant_id and vv.deleted_at is null
      left join public.vendors bv
        on bv.id = sm.billing_vendor_id and bv.tenant_id = sm.tenant_id and bv.deleted_at is null
      where sm.tenant_id = v_tenant
        and sm.deleted_at is null
        and sm.status = 'ACTIVE'
        and (v_vendor_id is null or sm.vendor_id = v_vendor_id)
      order by sm.service, vv.code
      limit v_size offset v_offset
    ) t;

  return jsonb_build_object(
    'rows', v_rows,
    'total', v_total,
    'page', v_page,
    'page_size', v_size
  );
end
$$;

revoke all on function public.list_serviceable_routes(text, text, integer, integer) from public;
grant execute on function public.list_serviceable_routes(text, text, integer, integer)
  to authenticated, service_role;

comment on function public.check_serviceable_pincode(text, text, text, text, text) is
  'Milestone 6F: serviceability check over existing pincodes/destinations/zones/products/mappings.';
comment on function public.search_serviceable_pincode(text, text, integer) is
  'Milestone 6F: search serviceable pincodes by pin or name for Utility UI.';
comment on function public.list_serviceable_routes(text, text, integer, integer) is
  'Milestone 6F: browse active service_mappings as estimated routing.';
