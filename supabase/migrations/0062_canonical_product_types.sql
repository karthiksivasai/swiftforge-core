-- ===========================================================================
-- 0062  Canonical product types (Domestic / International / Local / Import)
-- ---------------------------------------------------------------------------
-- CourierWala Product master uses a fixed Product Type dropdown. We keep the
-- product_types table as the FK target, but guarantee the four canonical rows
-- exist per tenant and resolve import values by code, name, or alias.
-- ===========================================================================

create or replace function app.ensure_canonical_product_types(p_tenant uuid)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
begin
  if p_tenant is null then
    raise exception using errcode = 'CMS01', message = 'Tenant is required';
  end if;

  insert into public.product_types (tenant_id, code, name)
  select p_tenant, v.code, v.name
  from (values
    ('D', 'Domestic'),
    ('I', 'International'),
    ('L', 'Local'),
    ('P', 'Import')
  ) as v(code, name)
  where not exists (
    select 1
    from public.product_types pt
    where pt.tenant_id = p_tenant
      and pt.deleted_at is null
      and pt.code = v.code
  );
end $$;

revoke all on function app.ensure_canonical_product_types(uuid) from public;
grant execute on function app.ensure_canonical_product_types(uuid) to authenticated, service_role;

-- Resolve a product-type reference (code, display name, or alias) to an id.
create or replace function app.resolve_product_type_id(p_tenant uuid, p_value text)
returns uuid
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_raw  text := nullif(btrim(coalesce(p_value, '')), '');
  v_id   uuid;
  v_code text;
begin
  if v_raw is null then
    return null;
  end if;

  perform app.ensure_canonical_product_types(p_tenant);

  select pt.id into v_id
  from public.product_types pt
  where pt.tenant_id = p_tenant
    and pt.deleted_at is null
    and pt.code = v_raw
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  select pt.id into v_id
  from public.product_types pt
  where pt.tenant_id = p_tenant
    and pt.deleted_at is null
    and lower(pt.name) = lower(v_raw)
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  v_code := case upper(v_raw)
    when 'DOMESTIC' then 'D'
    when 'INTERNATIONAL' then 'I'
    when 'LOCAL' then 'L'
    when 'IMPORT' then 'P'
    else null
  end;

  if v_code is null then
    return null;
  end if;

  select pt.id into v_id
  from public.product_types pt
  where pt.tenant_id = p_tenant
    and pt.deleted_at is null
    and pt.code = v_code
  limit 1;

  return v_id;
end $$;

revoke all on function app.resolve_product_type_id(uuid, text) from public;
grant execute on function app.resolve_product_type_id(uuid, text) to authenticated, service_role;

-- Build a code/name/alias -> id map for product_types so product imports accept
-- both "D" and "Domestic" (and similar) without client-only remapping.
create or replace function app.import_build_product_type_map(p_tenant uuid, p_values text[])
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_map jsonb := '{}'::jsonb;
  v_val text;
  v_id  uuid;
begin
  perform app.ensure_canonical_product_types(p_tenant);

  if p_values is null or coalesce(array_length(p_values, 1), 0) = 0 then
    return v_map;
  end if;

  foreach v_val in array p_values loop
    v_id := app.resolve_product_type_id(p_tenant, v_val);
    if v_id is not null and nullif(btrim(coalesce(v_val, '')), '') is not null then
      v_map := v_map || jsonb_build_object(btrim(v_val), v_id);
    end if;
  end loop;

  return v_map;
end $$;

revoke all on function app.import_build_product_type_map(uuid, text[]) from public;
grant execute on function app.import_build_product_type_map(uuid, text[]) to authenticated, service_role;

-- Route product_types map builds through the alias-aware helper (used by
-- public.import_master products branch without rewriting that large function).
create or replace function app.import_build_code_map(p_tenant uuid, p_table text, p_codes text[])
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_map jsonb;
begin
  if p_table = 'product_types' then
    return app.import_build_product_type_map(p_tenant, p_codes);
  end if;

  if p_codes is null or array_length(p_codes, 1) is null then
    return '{}'::jsonb;
  end if;

  execute format(
    'select coalesce(jsonb_object_agg(code, id), ''{}''::jsonb)
       from public.%I
      where tenant_id = $1 and deleted_at is null and code = any($2)',
    p_table)
  into v_map using p_tenant, p_codes;
  return v_map;
end $$;

revoke all on function app.import_build_code_map(uuid, text, text[]) from public;
grant execute on function app.import_build_code_map(uuid, text, text[]) to authenticated, service_role;

-- Public RPC so the Product screen can ensure types on open.
create or replace function public.ensure_canonical_product_types()
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
begin
  if v_tenant is null then
    raise exception using errcode = 'CMS01', message = 'Not authenticated for a tenant';
  end if;
  if not app.user_has_permission(v_tenant, 'mst.product-master', 'search')
     and not app.user_has_permission(v_tenant, 'mst.product-type', 'search')
     and not app.user_has_permission(v_tenant, 'mst.product-master', 'list')
     and not app.user_has_permission(v_tenant, 'mst.product-type', 'list') then
    raise exception using errcode = 'CMS03', message = 'Permission denied';
  end if;

  perform app.ensure_canonical_product_types(v_tenant);

  return jsonb_build_object(
    'ok', true,
    'types', coalesce((
      select jsonb_agg(jsonb_build_object('id', pt.id, 'code', pt.code, 'name', pt.name) order by pt.code)
      from public.product_types pt
      where pt.tenant_id = v_tenant and pt.deleted_at is null
        and pt.code in ('D', 'I', 'L', 'P')
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.ensure_canonical_product_types() from public;
grant execute on function public.ensure_canonical_product_types() to authenticated, service_role;

-- Backfill existing tenants.
do $$
declare
  r record;
begin
  for r in select id from public.tenants loop
    perform app.ensure_canonical_product_types(r.id);
  end loop;
end $$;
