-- Area Master production rules.
-- Uniqueness stays per organisation branch (tenant_id, branch_id). This migration
-- only makes that key case-insensitive. It does not move the key to the service
-- center or to the whole tenant, and it does not add a Field Executive sub-list.
-- Destination and branch are derived from the selected service center. The shared
-- lookup key "service-center" is left on branches; Area uses "area-service-center".

-- ---------------------------------------------------------------------------
-- Resolve the org branch and the destination from a service center.
-- ---------------------------------------------------------------------------
create or replace function app.resolve_area_placement(
  p_tenant uuid,
  p_service_center_id uuid
)
returns table (
  branch_id uuid,
  destination_id uuid,
  destination_label text
)
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_branch_text text;
  v_dest_text text;
  v_branch uuid;
  v_dest uuid;
  v_label text;
  v_branch_count integer;
  v_code_hits integer;
  v_name_hits integer;
begin
  if p_service_center_id is null then
    raise exception 'Service Center is required' using errcode = '23502';
  end if;

  select nullif(btrim(sc.branch), ''), nullif(btrim(sc.destination), '')
  into v_branch_text, v_dest_text
  from public.service_centers sc
  where sc.tenant_id = p_tenant
    and sc.id = p_service_center_id
    and sc.deleted_at is null;
  if not found then
    raise exception 'Service Center is not an existing record' using errcode = '23503';
  end if;

  if v_branch_text is not null then
    select count(*) filter (where lower(b.code) = lower(v_branch_text)),
           count(*) filter (
             where lower(b.name) = lower(v_branch_text)
               and lower(b.code) is distinct from lower(v_branch_text)
           )
    into v_code_hits, v_name_hits
    from public.branches b
    where b.tenant_id = p_tenant
      and b.deleted_at is null
      and (
        lower(b.code) = lower(v_branch_text)
        or lower(b.name) = lower(v_branch_text)
      );
    if v_code_hits > 1 or (v_code_hits = 0 and v_name_hits > 1) then
      raise exception 'Branch "%" on this service center matches more than one branch', v_branch_text
        using errcode = '23503';
    end if;
    select b.id
    into v_branch
    from public.branches b
    where b.tenant_id = p_tenant
      and b.deleted_at is null
      and (
        lower(b.code) = lower(v_branch_text)
        or lower(b.name) = lower(v_branch_text)
      )
    order by case when lower(b.code) = lower(v_branch_text) then 0 else 1 end, b.created_at
    limit 1;
    if v_branch is null then
      raise exception 'Branch "%" on this service center was not found', v_branch_text
        using errcode = '23503';
    end if;
  else
    select count(*)
    into v_branch_count
    from public.branches b
    where b.tenant_id = p_tenant
      and b.deleted_at is null;
    if v_branch_count = 1 then
      select b.id
      into v_branch
      from public.branches b
      where b.tenant_id = p_tenant
        and b.deleted_at is null
      limit 1;
    else
      raise exception 'This service center has no branch, and the organisation does not have exactly one branch'
        using errcode = '23502';
    end if;
  end if;

  if v_dest_text is not null then
    select count(*) filter (where lower(d.code) = lower(v_dest_text)),
           count(*) filter (
             where lower(d.name) = lower(v_dest_text)
               and lower(d.code) is distinct from lower(v_dest_text)
           )
    into v_code_hits, v_name_hits
    from public.destinations d
    where d.tenant_id = p_tenant
      and d.deleted_at is null
      and (
        lower(d.code) = lower(v_dest_text)
        or lower(d.name) = lower(v_dest_text)
      );
    if v_code_hits = 0 and v_name_hits = 0 then
      raise exception 'Destination "%" for this service center was not found', v_dest_text
        using errcode = '23503';
    end if;
    if v_code_hits > 1 or (v_code_hits = 0 and v_name_hits > 1) then
      raise exception 'Destination "%" for this service center matches more than one destination', v_dest_text
        using errcode = '23503';
    end if;
    select d.id, coalesce(nullif(btrim(d.name), ''), d.code)
    into v_dest, v_label
    from public.destinations d
    where d.tenant_id = p_tenant
      and d.deleted_at is null
      and (
        lower(d.code) = lower(v_dest_text)
        or lower(d.name) = lower(v_dest_text)
      )
    order by case when lower(d.code) = lower(v_dest_text) then 0 else 1 end, d.created_at
    limit 1;
  end if;

  return query select v_branch, v_dest, v_label;
end
$$;

revoke all on function app.resolve_area_placement(uuid, uuid) from public;

-- ---------------------------------------------------------------------------
-- Import: report an unknown service center, a blank name, a mismatched
-- destination, or a duplicate instead of skipping the row.
-- ---------------------------------------------------------------------------
create or replace function app.insert_area_for_import(
  p_tenant uuid,
  p_name text,
  p_service_center text,
  p_destination text
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_name text := upper(btrim(coalesce(p_name, '')));
  v_sc_text text := btrim(coalesce(p_service_center, ''));
  v_file_dest text := btrim(coalesce(p_destination, ''));
  v_sc uuid;
  v_branch uuid;
  v_dest uuid;
  v_label text;
  v_code_hits integer;
  v_name_hits integer;
begin
  if v_name = '' then
    raise exception using errcode = 'CMS01', message = 'Area Name is required';
  end if;
  if v_sc_text = '' then
    raise exception using errcode = 'CMS01', message = 'Service Center is required';
  end if;

  select count(*) filter (where lower(sc.code) = lower(v_sc_text)),
         count(*) filter (
           where lower(sc.name) = lower(v_sc_text)
             and lower(sc.code) is distinct from lower(v_sc_text)
         )
  into v_code_hits, v_name_hits
  from public.service_centers sc
  where sc.tenant_id = p_tenant
    and sc.deleted_at is null
    and (
      lower(sc.code) = lower(v_sc_text)
      or lower(sc.name) = lower(v_sc_text)
    );
  if coalesce(v_code_hits, 0) = 0 and coalesce(v_name_hits, 0) = 0 then
    raise exception using errcode = 'CMS01',
      message = format('Service center "%s" was not found', v_sc_text);
  end if;
  if v_code_hits > 1 or (v_code_hits = 0 and v_name_hits > 1) then
    raise exception using errcode = 'CMS01',
      message = format('Service center "%s" matches more than one record', v_sc_text);
  end if;
  select sc.id
  into v_sc
  from public.service_centers sc
  where sc.tenant_id = p_tenant
    and sc.deleted_at is null
    and (
      lower(sc.code) = lower(v_sc_text)
      or lower(sc.name) = lower(v_sc_text)
    )
  order by case when lower(sc.code) = lower(v_sc_text) then 0 else 1 end, sc.created_at
  limit 1;

  select p.branch_id, p.destination_id, p.destination_label
  into v_branch, v_dest, v_label
  from app.resolve_area_placement(p_tenant, v_sc) p;

  if v_file_dest <> '' then
    if v_dest is null then
      raise exception using errcode = 'CMS01',
        message = 'Destination is set from the service center, and this service center has none';
    end if;
    if not exists (
      select 1
      from public.destinations d
      where d.id = v_dest
        and d.tenant_id = p_tenant
        and (
          lower(d.code) = lower(v_file_dest)
          or lower(d.name) = lower(v_file_dest)
        )
    ) and lower(v_file_dest) <> lower(coalesce(v_label, '')) then
      raise exception using errcode = 'CMS01',
        message = format(
          'Destination "%s" does not match the service center destination "%s"',
          v_file_dest,
          coalesce(v_label, '')
        );
    end if;
  end if;

  if exists (
    select 1
    from public.areas a
    where a.tenant_id = p_tenant
      and a.branch_id = v_branch
      and a.deleted_at is null
      and lower(a.name) = lower(v_name)
  ) then
    raise exception using errcode = 'CMS01',
      message = format('Area name "%s" already exists', v_name);
  end if;

  insert into public.areas (tenant_id, name, service_center_id)
  values (p_tenant, v_name, v_sc);
end
$$;

revoke all on function app.insert_area_for_import(uuid, text, text, text) from public;

do $patch_import$
declare
  v_def text;
  v_old text := $old$when 'areas' then
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        v_col := 'branch_code';
        v_branch := app.import_lookup(v_map_branches, v_row->>'branch_code', 'Branch code');
        if v_branch is null then raise exception using errcode='CMS01', message='Branch code is required'; end if;
        v_col := 'destination_code'; v_dest := app.import_lookup(v_map_destinations, v_row->>'destination_code', 'Destination code'); v_col := null;
        insert into public.areas (tenant_id, branch_id, name, destination_id)
        values (v_tenant, v_branch, upper(btrim(v_row->>'name')), v_dest)
        on conflict (tenant_id, branch_id, name) where deleted_at is null do nothing;$old$;
  v_new_sql text := $new$when 'areas' then
        v_col := 'name';
        perform app.insert_area_for_import(
          v_tenant,
          v_row->>'name',
          coalesce(nullif(btrim(v_row->>'service_center_code'), ''), nullif(btrim(v_row->>'branch_code'), '')),
          v_row->>'destination_code'
        );
        v_col := null;$new$;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'import_master'
    and pg_get_function_identity_arguments(p.oid) = 'p_master text, p_mode text, p_rows jsonb';
  if v_def is null then
    raise exception '0136 could not find public.import_master';
  end if;
  if position('app.insert_area_for_import' in v_def) > 0 then
    return;
  end if;
  if position(v_old in v_def) = 0 then
    raise exception '0136 could not find the area import insert';
  end if;
  v_new := replace(v_def, v_old, v_new_sql);
  execute v_new;
end
$patch_import$;

-- ---------------------------------------------------------------------------
-- Lookup: areas has a name, not a code. Area's service-center picker reads
-- service_centers and returns the destination text as the hint. Keep the
-- Search gate 0133 injected into public.lookup. The shared "service-center"
-- key stays on branches.
-- ---------------------------------------------------------------------------
do $patch_lookup$
declare
  v_def text;
  v_new text;
  v_area_sc text := $sc$
  elsif p_key = 'area-service-center' then
    return query
      select sc.id, sc.code, sc.name, nullif(btrim(sc.destination), '')
      from public.service_centers sc
      where sc.tenant_id in (select app.user_tenant_ids())
        and sc.deleted_at is null
        and (sc.name ilike v_pat or sc.code ilike v_pat or coalesce(sc.destination, '') ilike v_pat)
      order by sc.name, sc.code, sc.id
      limit v_limit;

  elsif p_key = 'inscan-remark' or p_key = 'inscanRemark' then$sc$;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'lookup'
    and pg_get_function_identity_arguments(p.oid) = 'p_key text, p_q text, p_limit integer';
  if v_def is null then
    raise exception '0136 could not find public.lookup';
  end if;
  if position('lookup_permission_slug' in v_def) = 0 then
    raise exception '0136 lookup is missing the Search gate';
  end if;
  v_new := v_def;
  if position('a.code' in v_new) > 0 then
    v_new := replace(
      v_new,
      'select a.id, a.code, a.name, null::text',
      'select a.id, a.name, a.name, (select d.name from public.destinations d where d.id = a.destination_id)'
    );
    v_new := replace(
      v_new,
      'and (a.name ilike v_pat or a.code ilike v_pat)',
      'and a.name ilike v_pat'
    );
    v_new := replace(v_new, 'order by a.name, a.code, a.id', 'order by a.name, a.id');
  end if;
  if position('p_key = ''area-service-center''' in v_new) = 0 then
    if position('elsif p_key = ''inscan-remark'' or p_key = ''inscanRemark'' then' in v_new) = 0 then
      raise exception '0136 could not find the inscan lookup branch';
    end if;
    v_new := replace(
      v_new,
      'elsif p_key = ''inscan-remark'' or p_key = ''inscanRemark'' then',
      v_area_sc
    );
  end if;
  if position('a.code' in v_new) > 0 then
    raise exception '0136 area lookup still references a.code';
  end if;
  if v_new is distinct from v_def then
    execute v_new;
  end if;
end
$patch_lookup$;

do $patch_slug$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app'
    and p.proname = 'lookup_permission_slug'
    and pg_get_function_identity_arguments(p.oid) = 'p_key text';
  if v_def is null then
    raise exception '0136 could not find app.lookup_permission_slug';
  end if;
  if position('area-service-center' in v_def) > 0 then
    return;
  end if;
  if position('when ''area'' then ''mst.area-master''' in v_def) = 0 then
    raise exception '0136 could not find the area lookup permission';
  end if;
  v_new := replace(
    v_def,
    'when ''area'' then ''mst.area-master''',
    'when ''area'' then ''mst.area-master''' || E'\n    when ''area-service-center'' then ''mst.area-master'''
  );
  execute v_new;
end
$patch_slug$;

-- ---------------------------------------------------------------------------
-- Case-insensitive name uniqueness inside the existing branch scope.
-- ---------------------------------------------------------------------------
do $dupes$
declare
  v_dup text;
begin
  select string_agg(format('%s / %s / %s', tenant_id, branch_id, name), ', ')
  into v_dup
  from (
    select tenant_id, branch_id, lower(btrim(name)) as name
    from public.areas
    where deleted_at is null
    group by tenant_id, branch_id, lower(btrim(name))
    having count(*) > 1
  ) d;
  if v_dup is not null then
    raise exception 'Cannot enforce case-insensitive area names; duplicates exist: %', v_dup;
  end if;
end
$dupes$;

drop index if exists public.areas_tenant_branch_name_uq;
create unique index if not exists areas_tenant_branch_name_ci_uq
  on public.areas (tenant_id, branch_id, lower(name))
  where deleted_at is null;

create or replace function app.areas_guard()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_name text;
  v_drs integer := 0;
  v_pickup integer := 0;
  v_used text := '';
  v_soft boolean := false;
begin
  v_soft := tg_op = 'UPDATE' and old.deleted_at is null and new.deleted_at is not null;

  if tg_op in ('INSERT', 'UPDATE') and not v_soft then
    new.name := upper(btrim(coalesce(new.name, '')));
    if new.name = '' then
      raise exception 'Area Name is required' using errcode = '23502';
    end if;
    if new.service_center_id is null then
      raise exception 'Service Center is required' using errcode = '23502';
    end if;

    select p.branch_id, p.destination_id
    into new.branch_id, new.destination_id
    from app.resolve_area_placement(new.tenant_id, new.service_center_id) p;

    if exists (
      select 1
      from public.areas a
      where a.tenant_id = new.tenant_id
        and a.branch_id = new.branch_id
        and a.deleted_at is null
        and lower(a.name) = lower(new.name)
        and a.id is distinct from new.id
    ) then
      raise exception 'Area name "%" already exists', new.name using errcode = '23505';
    end if;
  end if;

  if tg_op = 'DELETE' or v_soft then
    v_name := btrim(old.name);
    select count(*) into v_drs
    from public.drs d
    where d.tenant_id = old.tenant_id
      and d.deleted_at is null
      and (
        lower(btrim(coalesce(d.area_name, ''))) = lower(v_name)
        or lower(btrim(coalesce(d.area_code, ''))) = lower(v_name)
      );
    select count(*) into v_pickup
    from public.pickups pk
    where pk.tenant_id = old.tenant_id
      and pk.deleted_at is null
      and pk.area_id = old.id;
    if v_drs > 0 then
      v_used := format('%s delivery run sheet(s)', v_drs);
    end if;
    if v_pickup > 0 then
      v_used := case
        when v_used = '' then format('%s pickup(s)', v_pickup)
        else v_used || format(' and %s pickup(s)', v_pickup)
      end;
    end if;
    if v_used <> '' then
      raise exception 'Cannot delete area "%". It is still used by %.', v_name, v_used
        using errcode = '23503';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

drop trigger if exists areas_guard on public.areas;
create trigger areas_guard
  before insert or update or delete on public.areas
  for each row execute function app.areas_guard();

-- 0133 already rewrites this when the write policies name the slug. Repeat it
-- so a fresh apply of this migration still requires List on areas.
select app.apply_list_select('areas', 'mst.area-master');

-- The grid shows the service center and the derived destination. Reading those
-- tables directly would also require their List grants.
create or replace function public.list_areas()
returns table (
  id uuid,
  tenant_id uuid,
  branch_id uuid,
  service_center_id uuid,
  name text,
  destination_id uuid,
  service_center_code text,
  service_center_name text,
  destination_name text,
  created_at timestamptz,
  created_by uuid,
  updated_at timestamptz,
  updated_by uuid,
  deleted_at timestamptz,
  row_version integer
)
language sql
stable
security definer
set search_path = public, app
as $$
  select a.id, a.tenant_id, a.branch_id, a.service_center_id, a.name, a.destination_id,
         sc.code, coalesce(sc.name, ''),
         coalesce(d.name, ''),
         a.created_at, a.created_by, a.updated_at, a.updated_by,
         a.deleted_at, a.row_version
  from public.areas a
  left join public.service_centers sc
    on sc.tenant_id = a.tenant_id
   and sc.id = a.service_center_id
  left join public.destinations d
    on d.tenant_id = a.tenant_id
   and d.id = a.destination_id
  where a.deleted_at is null
    and a.tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(a.tenant_id, 'mst.area-master', 'list')
  order by a.name, a.id
$$;

revoke all on function public.list_areas() from public;
grant execute on function public.list_areas() to authenticated, service_role;
