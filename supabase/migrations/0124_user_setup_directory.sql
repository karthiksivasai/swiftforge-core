-- User Setup opens on the directory.
-- list_users gains the columns shown on that grid.
-- Passwords are never selected.

drop function if exists public.list_users(text, integer, integer);
drop function if exists public.count_users(text);

create or replace function public.list_users(
  p_search text default null,
  p_limit integer default 10,
  p_offset integer default 0,
  p_filters jsonb default '{}'::jsonb
)
returns table (
  id uuid,
  username text,
  user_type text,
  origin text,
  service_center text,
  email text,
  mobile text,
  status text,
  group_name text,
  company_code text,
  application_type text
)
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 500);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_term text := nullif(replace(replace(btrim(coalesce(p_search, '')), '%', ''), '_', ''), '');
  v_channel text := nullif(upper(btrim(coalesce(p_filters->>'channel', ''))), '');
  v_type text := nullif(replace(replace(btrim(coalesce(p_filters->>'type', '')), '%', ''), '_', ''), '');
  v_name text := nullif(replace(replace(btrim(coalesce(p_filters->>'name', '')), '%', ''), '_', ''), '');
  v_group text := nullif(replace(replace(btrim(coalesce(p_filters->>'group', '')), '%', ''), '_', ''), '');
  v_company text := nullif(replace(replace(btrim(coalesce(p_filters->>'company', '')), '%', ''), '_', ''), '');
  v_application text := nullif(replace(replace(btrim(coalesce(p_filters->>'application', '')), '%', ''), '_', ''), '');
  v_center text := nullif(replace(replace(btrim(coalesce(p_filters->>'serviceCenter', '')), '%', ''), '_', ''), '');
  v_status text := nullif(replace(replace(btrim(coalesce(p_filters->>'status', '')), '%', ''), '_', ''), '');
  v_sort text := coalesce(nullif(btrim(coalesce(p_filters->>'sort', '')), ''), 'name');
  v_dir text := case when lower(coalesce(p_filters->>'dir', '')) = 'desc' then 'desc' else 'asc' end;
begin
  perform app.user_setup_require_view(v_tenant);
  if v_channel is not null and v_channel not in ('PORTAL', 'MOBILE', 'ALL') then
    v_channel := null;
  end if;

  return query
  select
    u.id,
    u.username,
    u.user_type,
    d.name,
    coalesce(nullif(b.code, ''), b.name),
    u.email,
    u.mobile,
    u.status,
    g.name,
    c.code,
    u.application_type
  from public.users u
  left join public.destinations d on d.id = u.origin_id and d.tenant_id = u.tenant_id
  left join public.branches b on b.id = u.home_branch_id and b.tenant_id = u.tenant_id
  left join public.companies c on c.id = u.company_id and c.tenant_id = u.tenant_id and c.deleted_at is null
  left join lateral (
    select ug.name
    from public.user_group_members m
    join public.user_groups ug on ug.id = m.group_id and ug.tenant_id = m.tenant_id
    where m.user_id = u.id
      and m.tenant_id = u.tenant_id
      and ug.deleted_at is null
    order by lower(ug.name)
    limit 1
  ) g on true
  where u.tenant_id = v_tenant
    and u.deleted_at is null
    and (v_channel is null or u.application_type = v_channel)
    and (v_type is null or 'user' ilike '%' || v_type || '%')
    and (v_name is null or u.username ilike '%' || v_name || '%')
    and (v_group is null or coalesce(g.name, '') ilike '%' || v_group || '%')
    and (v_company is null or coalesce(c.code, '') ilike '%' || v_company || '%' or coalesce(c.name, '') ilike '%' || v_company || '%')
    and (
      v_application is null
      or coalesce(u.application_type, '') ilike '%' || v_application || '%'
      or case u.application_type
           when 'PORTAL' then 'Portal'
           when 'MOBILE' then 'Mobile'
           when 'ALL' then 'Mob & Web'
           else ''
         end ilike '%' || v_application || '%'
    )
    and (
      v_center is null
      or coalesce(b.code, '') ilike '%' || v_center || '%'
      or coalesce(b.name, '') ilike '%' || v_center || '%'
    )
    and (
      v_status is null
      or (case when u.status = 'ACTIVE' then 'Active' else 'In-Active' end) ilike '%' || v_status || '%'
    )
    and (
      v_term is null
      or u.username ilike '%' || v_term || '%'
      or coalesce(u.email, '') ilike '%' || v_term || '%'
      or coalesce(u.mobile, '') ilike '%' || v_term || '%'
      or coalesce(d.name, '') ilike '%' || v_term || '%'
      or coalesce(b.name, '') ilike '%' || v_term || '%'
      or coalesce(b.code, '') ilike '%' || v_term || '%'
      or coalesce(g.name, '') ilike '%' || v_term || '%'
      or coalesce(c.code, '') ilike '%' || v_term || '%'
    )
  order by
    case when v_sort = 'name' and v_dir = 'asc' then lower(u.username) end asc,
    case when v_sort = 'name' and v_dir = 'desc' then lower(u.username) end desc,
    case when v_sort = 'group' and v_dir = 'asc' then lower(coalesce(g.name, '')) end asc,
    case when v_sort = 'group' and v_dir = 'desc' then lower(coalesce(g.name, '')) end desc,
    case when v_sort = 'company' and v_dir = 'asc' then lower(coalesce(c.code, '')) end asc,
    case when v_sort = 'company' and v_dir = 'desc' then lower(coalesce(c.code, '')) end desc,
    case when v_sort = 'application' and v_dir = 'asc' then lower(coalesce(u.application_type, '')) end asc,
    case when v_sort = 'application' and v_dir = 'desc' then lower(coalesce(u.application_type, '')) end desc,
    case when v_sort = 'serviceCenter' and v_dir = 'asc' then lower(coalesce(b.code, b.name, '')) end asc,
    case when v_sort = 'serviceCenter' and v_dir = 'desc' then lower(coalesce(b.code, b.name, '')) end desc,
    case when v_sort = 'status' and v_dir = 'asc' then u.status end asc,
    case when v_sort = 'status' and v_dir = 'desc' then u.status end desc,
    lower(u.username),
    u.id
  limit v_limit
  offset v_offset;
end
$$;

create or replace function public.count_users(
  p_search text default null,
  p_filters jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_term text := nullif(replace(replace(btrim(coalesce(p_search, '')), '%', ''), '_', ''), '');
  v_channel text := nullif(upper(btrim(coalesce(p_filters->>'channel', ''))), '');
  v_type text := nullif(replace(replace(btrim(coalesce(p_filters->>'type', '')), '%', ''), '_', ''), '');
  v_name text := nullif(replace(replace(btrim(coalesce(p_filters->>'name', '')), '%', ''), '_', ''), '');
  v_group text := nullif(replace(replace(btrim(coalesce(p_filters->>'group', '')), '%', ''), '_', ''), '');
  v_company text := nullif(replace(replace(btrim(coalesce(p_filters->>'company', '')), '%', ''), '_', ''), '');
  v_application text := nullif(replace(replace(btrim(coalesce(p_filters->>'application', '')), '%', ''), '_', ''), '');
  v_center text := nullif(replace(replace(btrim(coalesce(p_filters->>'serviceCenter', '')), '%', ''), '_', ''), '');
  v_status text := nullif(replace(replace(btrim(coalesce(p_filters->>'status', '')), '%', ''), '_', ''), '');
  v_count bigint;
begin
  perform app.user_setup_require_view(v_tenant);
  if v_channel is not null and v_channel not in ('PORTAL', 'MOBILE', 'ALL') then
    v_channel := null;
  end if;

  select count(*) into v_count
  from public.users u
  left join public.destinations d on d.id = u.origin_id and d.tenant_id = u.tenant_id
  left join public.branches b on b.id = u.home_branch_id and b.tenant_id = u.tenant_id
  left join public.companies c on c.id = u.company_id and c.tenant_id = u.tenant_id and c.deleted_at is null
  left join lateral (
    select ug.name
    from public.user_group_members m
    join public.user_groups ug on ug.id = m.group_id and ug.tenant_id = m.tenant_id
    where m.user_id = u.id
      and m.tenant_id = u.tenant_id
      and ug.deleted_at is null
    order by lower(ug.name)
    limit 1
  ) g on true
  where u.tenant_id = v_tenant
    and u.deleted_at is null
    and (v_channel is null or u.application_type = v_channel)
    and (v_type is null or 'user' ilike '%' || v_type || '%')
    and (v_name is null or u.username ilike '%' || v_name || '%')
    and (v_group is null or coalesce(g.name, '') ilike '%' || v_group || '%')
    and (v_company is null or coalesce(c.code, '') ilike '%' || v_company || '%' or coalesce(c.name, '') ilike '%' || v_company || '%')
    and (
      v_application is null
      or coalesce(u.application_type, '') ilike '%' || v_application || '%'
      or case u.application_type
           when 'PORTAL' then 'Portal'
           when 'MOBILE' then 'Mobile'
           when 'ALL' then 'Mob & Web'
           else ''
         end ilike '%' || v_application || '%'
    )
    and (
      v_center is null
      or coalesce(b.code, '') ilike '%' || v_center || '%'
      or coalesce(b.name, '') ilike '%' || v_center || '%'
    )
    and (
      v_status is null
      or (case when u.status = 'ACTIVE' then 'Active' else 'In-Active' end) ilike '%' || v_status || '%'
    )
    and (
      v_term is null
      or u.username ilike '%' || v_term || '%'
      or coalesce(u.email, '') ilike '%' || v_term || '%'
      or coalesce(u.mobile, '') ilike '%' || v_term || '%'
      or coalesce(d.name, '') ilike '%' || v_term || '%'
      or coalesce(b.name, '') ilike '%' || v_term || '%'
      or coalesce(b.code, '') ilike '%' || v_term || '%'
      or coalesce(g.name, '') ilike '%' || v_term || '%'
      or coalesce(c.code, '') ilike '%' || v_term || '%'
    );
  return v_count;
end
$$;

create or replace function public.user_setup_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_summary jsonb;
begin
  perform app.user_setup_require_view(v_tenant);
  select jsonb_build_object(
    'portal', count(*) filter (where u.application_type = 'PORTAL'),
    'mobile', count(*) filter (where u.application_type = 'MOBILE'),
    'both', count(*) filter (where u.application_type = 'ALL'),
    'total', count(*),
    'groups', (
      select count(*)
      from public.user_groups g
      where g.tenant_id = v_tenant and g.deleted_at is null
    )
  )
  into v_summary
  from public.users u
  where u.tenant_id = v_tenant and u.deleted_at is null;
  return v_summary;
end
$$;

revoke all on function public.list_users(text, integer, integer, jsonb) from public;
revoke all on function public.count_users(text, jsonb) from public;
revoke all on function public.user_setup_summary() from public;

grant execute on function public.list_users(text, integer, integer, jsonb) to authenticated, service_role;
grant execute on function public.count_users(text, jsonb) to authenticated, service_role;
grant execute on function public.user_setup_summary() to authenticated, service_role;
