-- Area Master proof for migration 0136. Rolls back.
--   supabase db query --linked -f supabase/tests/0136_area_master.sql
begin;

create temp table area_probe (
  tenant_id uuid,
  staff_auth uuid,
  admin_auth uuid,
  group_id uuid,
  branch1_id uuid,
  dest_id uuid,
  other_dest_id uuid,
  sc1_id uuid,
  area_id uuid
) on commit drop;
grant all on area_probe to authenticated;

do $fixture$
declare
  v_tenant uuid;
  v_staff_auth uuid := gen_random_uuid();
  v_admin_auth uuid := gen_random_uuid();
  v_staff_user uuid;
  v_group uuid;
  v_branch1 uuid;
  v_branch2 uuid;
  v_dest uuid;
  v_other uuid;
  v_sc1 uuid;
  v_sc2 uuid;
  v_sc_none uuid;
  v_sc_bad uuid;
  v_area uuid;
  v_other_area uuid;
  v_drs uuid;
  v_pickup uuid;
  v_auth uuid;
  v_email text;
  v_sql text;
  v_col text;
  v_def text;
  v_stored_branch uuid;
  v_stored_dest uuid;
begin
  insert into public.tenants (slug, name, status)
  values ('ar-gate-' || substr(gen_random_uuid()::text, 1, 8), 'Area gate', 'ACTIVE')
  returning id into v_tenant;

  for v_auth, v_email in
    select *
    from (values
      (v_staff_auth, 'ar-gate-staff-' || substr(v_staff_auth::text, 1, 8) || '@example.test'),
      (v_admin_auth, 'ar-gate-admin-' || substr(v_admin_auth::text, 1, 8) || '@example.test')
    ) as ids(auth_id, email)
  loop
    v_sql := 'insert into auth.users (id';
    if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'instance_id') then
      v_sql := v_sql || ', instance_id';
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'aud') then
      v_sql := v_sql || ', aud';
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'role') then
      v_sql := v_sql || ', role';
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'email') then
      v_sql := v_sql || ', email';
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'encrypted_password') then
      v_sql := v_sql || ', encrypted_password';
    end if;
    v_sql := v_sql || ') values (' || quote_literal(v_auth) || '::uuid';
    if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'instance_id') then
      v_sql := v_sql || ', ''00000000-0000-0000-0000-000000000000''::uuid';
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'aud') then
      v_sql := v_sql || ', ''authenticated''';
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'role') then
      v_sql := v_sql || ', ''authenticated''';
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'email') then
      v_sql := v_sql || ', ' || quote_literal(v_email);
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'encrypted_password') then
      v_sql := v_sql || ', ''''';
    end if;
    v_sql := v_sql || ')';
    execute v_sql;

    for v_col in
      select column_name
      from information_schema.columns
      where table_schema = 'auth'
        and table_name = 'users'
        and is_nullable = 'NO'
        and column_default is null
        and data_type in ('text', 'character varying', 'boolean', 'jsonb', 'json', 'timestamp with time zone', 'timestamp without time zone')
        and column_name not in ('id', 'instance_id', 'aud', 'role', 'email', 'encrypted_password')
    loop
      execute format(
        'update auth.users set %I = %s where id = %L::uuid and %I is null',
        v_col,
        case
          when v_col in ('is_sso_user', 'is_anonymous', 'is_super_admin') then 'false'
          when right(v_col, 3) = '_at' then 'now()'
          when v_col in ('raw_app_meta_data', 'raw_user_meta_data') then '''{}''::jsonb'
          else quote_literal('')
        end,
        v_auth,
        v_col
      );
    end loop;
  end loop;

  insert into public.tenant_users (tenant_id, user_id, role, status)
  values
    (v_tenant, v_staff_auth, 'MEMBER', 'ACTIVE'),
    (v_tenant, v_admin_auth, 'OWNER', 'ACTIVE');

  insert into public.users (tenant_id, auth_user_id, username, user_type, status, email)
  values (
    v_tenant, v_staff_auth,
    'ar-gate-staff-' || substr(v_staff_auth::text, 1, 8),
    'STAFF', 'ACTIVE',
    'ar-gate-staff-' || substr(v_staff_auth::text, 1, 8) || '@example.test'
  )
  returning id into v_staff_user;
  insert into public.users (tenant_id, auth_user_id, username, user_type, status, email)
  values (
    v_tenant, v_admin_auth,
    'ar-gate-admin-' || substr(v_admin_auth::text, 1, 8),
    'ADMIN', 'ACTIVE',
    'ar-gate-admin-' || substr(v_admin_auth::text, 1, 8) || '@example.test'
  );

  insert into public.user_groups (tenant_id, name)
  values (v_tenant, 'Area gate staff')
  returning id into v_group;
  insert into public.user_group_members (tenant_id, user_id, group_id)
  values (v_tenant, v_staff_user, v_group);

  insert into public.branches (tenant_id, code, name) values (v_tenant, 'BR1', 'Branch One') returning id into v_branch1;
  insert into public.branches (tenant_id, code, name) values (v_tenant, 'BR2', 'Branch Two') returning id into v_branch2;
  insert into public.destinations (tenant_id, code, name) values (v_tenant, 'HYD', 'HYDERABAD') returning id into v_dest;
  insert into public.destinations (tenant_id, code, name) values (v_tenant, 'OTHER', 'OTHER CITY') returning id into v_other;

  insert into public.service_centers (tenant_id, code, name, branch, destination)
  values (v_tenant, 'SC1', 'Hyderabad Center', 'BR1', 'HYDERABAD')
  returning id into v_sc1;
  insert into public.service_centers (tenant_id, code, name, branch, destination)
  values (v_tenant, 'SC2', 'Second Center', 'BR2', 'HYDERABAD')
  returning id into v_sc2;
  insert into public.service_centers (tenant_id, code, name, branch, destination)
  values (v_tenant, 'SCNONE', 'No Destination', 'BR1', null)
  returning id into v_sc_none;
  insert into public.service_centers (tenant_id, code, name, branch, destination)
  values (v_tenant, 'SCBAD', 'Bad Destination', 'BR1', 'NOWHERE')
  returning id into v_sc_bad;

  insert into public.areas (tenant_id, name, service_center_id, branch_id, destination_id)
  values (v_tenant, 'south zone', v_sc1, v_branch2, v_other)
  returning id into v_area;

  select a.name, a.branch_id, a.destination_id
  into v_def, v_stored_branch, v_stored_dest
  from public.areas a
  where a.id = v_area;
  if v_def <> 'SOUTH ZONE' then
    raise exception 'area name was not stored in upper case: %', v_def;
  end if;
  if v_stored_branch is distinct from v_branch1 then
    raise exception 'branch was not derived from the service center';
  end if;
  if v_stored_dest is distinct from v_dest then
    raise exception 'destination was not derived from the service center';
  end if;

  insert into public.areas (tenant_id, name, service_center_id)
  values (v_tenant, 'Open Area', v_sc_none)
  returning id into v_other_area;
  if (select destination_id from public.areas where id = v_other_area) is not null then
    raise exception 'a blank service-center destination was stored';
  end if;

  insert into public.areas (tenant_id, name, service_center_id)
  values (v_tenant, 'South Zone', v_sc2);
  if (select count(*) from public.areas where tenant_id = v_tenant and lower(name) = 'south zone' and deleted_at is null) <> 2 then
    raise exception 'the same area name was rejected on a different branch';
  end if;

  begin
    insert into public.areas (tenant_id, name, service_center_id)
    values (v_tenant, 'SOUTH zone', v_sc1);
    raise exception 'case-variant area name was inserted';
  exception
    when unique_violation then
      if SQLERRM not like '%already exists%' then
        raise exception 'duplicate area message was not clear: %', SQLERRM;
      end if;
  end;

  begin
    insert into public.areas (tenant_id, name, service_center_id)
    values (v_tenant, 'Bad Dest', v_sc_bad);
    raise exception 'unknown service-center destination was accepted';
  exception
    when foreign_key_violation then
      if SQLERRM not like '%not found%' then
        raise exception 'unknown destination message was not clear: %', SQLERRM;
      end if;
  end;

  begin
    insert into public.areas (tenant_id, name, service_center_id)
    values (v_tenant, 'No Center', null);
    raise exception 'area without a service center was inserted';
  exception
    when not_null_violation then
      if SQLERRM not like '%Service Center is required%' then
        raise exception 'missing service center message was not clear: %', SQLERRM;
      end if;
  end;

  insert into public.drs (tenant_id, drs_no, area_name)
  values (v_tenant, 'AR-DRS-' || substr(gen_random_uuid()::text, 1, 8), 'south zone')
  returning id into v_drs;

  begin
    update public.areas set deleted_at = now() where id = v_area;
    raise exception 'area delete was allowed while a DRS references it';
  exception
    when foreign_key_violation then
      if SQLERRM not like '%delivery run sheet%' then
        raise exception 'DRS delete block did not name the delivery run: %', SQLERRM;
      end if;
  end;

  update public.drs set deleted_at = now() where id = v_drs;

  insert into public.pickups (tenant_id, pickup_no, mobile_no, area_id)
  values (v_tenant, floor(random() * 1000000000)::bigint, '9999999999', v_area)
  returning id into v_pickup;

  begin
    update public.areas set deleted_at = now() where id = v_area;
    raise exception 'area delete was allowed while a pickup references it';
  exception
    when foreign_key_violation then
      if SQLERRM not like '%pickup%' then
        raise exception 'pickup delete block did not name the pickup: %', SQLERRM;
      end if;
  end;

  update public.pickups set area_id = null where id = v_pickup;
  update public.areas set deleted_at = now() where id = v_area;
  if (select deleted_at from public.areas where id = v_area) is null then
    raise exception 'area delete did not succeed after references were cleared';
  end if;
  update public.areas set deleted_at = null where id = v_area;

  select pg_get_expr(pol.polqual, pol.polrelid) into v_def
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'areas' and pol.polcmd = 'r'
  limit 1;
  if v_def is null
     or v_def not like '%user_has_permission%'
     or v_def not like '%''list''%'
     or v_def like '%''search''%' then
    raise exception 'areas select policy does not require list: %', coalesce(v_def, '<missing>');
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'lookup'
    and pg_get_function_identity_arguments(p.oid) = 'p_key text, p_q text, p_limit integer';
  if v_def like '%a.code%' then
    raise exception 'area lookup still reads a.code';
  end if;
  if v_def not like '%area-service-center%' then
    raise exception 'area service center lookup is missing';
  end if;
  if v_def not like '%elsif p_key = ''branch'' or p_key = ''service-center''%' then
    raise exception 'shared service-center lookup was moved off branches';
  end if;
  if v_def not like '%lookup_permission_slug%' or v_def not like '%''search''%' then
    raise exception 'area lookup no longer requires Search';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'areas_tenant_branch_name_ci_uq'
  ) then
    raise exception 'case-insensitive area name index is missing';
  end if;

  insert into area_probe (tenant_id, staff_auth, admin_auth, group_id, branch1_id, dest_id, other_dest_id, sc1_id, area_id)
  values (v_tenant, v_staff_auth, v_admin_auth, v_group, v_branch1, v_dest, v_other, v_sc1, v_area);
end
$fixture$;

select set_config('request.jwt.claim.sub', (select staff_auth::text from area_probe), true);
select set_config(
  'request.jwt.claims',
  (select json_build_object('sub', staff_auth, 'role', 'authenticated')::text from area_probe),
  true
);
set local role authenticated;

do $no_grant$
declare
  v_count integer;
begin
  select count(*) into v_count from public.areas where id = (select area_id from area_probe);
  if v_count <> 0 then raise exception 'area read was not denied without List'; end if;
  begin
    perform public.lookup('area', 'SOUTH', 5);
    raise exception 'area search was not denied without Search';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.lookup('area-service-center', 'SC1', 5);
    raise exception 'area service-center search was not denied without Search';
  exception when insufficient_privilege then null;
  end;
end
$no_grant$;

reset role;

insert into public.group_permissions (tenant_id, group_id, module_id, can_list)
select p.tenant_id, p.group_id, m.id, true
from area_probe p
join public.permission_modules m on m.slug = 'mst.area-master';

select set_config('request.jwt.claim.sub', (select staff_auth::text from area_probe), true);
select set_config(
  'request.jwt.claims',
  (select json_build_object('sub', staff_auth, 'role', 'authenticated')::text from area_probe),
  true
);
set local role authenticated;

do $list_only$
declare
  v_count integer;
begin
  select count(*) into v_count from public.areas where id = (select area_id from area_probe);
  if v_count <> 1 then raise exception 'List did not allow the area read'; end if;
  select count(*) into v_count
  from public.list_areas()
  where id = (select area_id from area_probe)
    and service_center_code = 'SC1'
    and destination_name = 'HYDERABAD';
  if v_count <> 1 then raise exception 'Area List did not return the service center and destination'; end if;
  begin
    perform public.lookup('area', 'SOUTH', 5);
    raise exception 'List was accepted in place of Search';
  exception when insufficient_privilege then null;
  end;
end
$list_only$;

reset role;

update public.group_permissions
set can_list = false, can_search = true
where group_id = (select group_id from area_probe)
  and module_id = (select id from public.permission_modules where slug = 'mst.area-master');

select set_config('request.jwt.claim.sub', (select staff_auth::text from area_probe), true);
select set_config(
  'request.jwt.claims',
  (select json_build_object('sub', staff_auth, 'role', 'authenticated')::text from area_probe),
  true
);
set local role authenticated;

do $search_only$
declare
  v_count integer;
  v_code text;
  v_name text;
  v_hint text;
begin
  select count(*) into v_count from public.areas where id = (select area_id from area_probe);
  if v_count <> 0 then raise exception 'Search was accepted in place of List'; end if;
  select count(*) into v_count from public.list_areas();
  if v_count <> 0 then raise exception 'list_areas accepted Search in place of List'; end if;
  select l.code, l.name into v_code, v_name
  from public.lookup('area', 'SOUTH ZONE', 5) l
  where l.id = (select area_id from area_probe);
  if v_code is distinct from 'SOUTH ZONE' or v_name is distinct from 'SOUTH ZONE' then
    raise exception 'area lookup did not return the name as the code: % / %', v_code, v_name;
  end if;
  select l.hint into v_hint
  from public.lookup('area-service-center', 'SC1', 5) l
  where l.id = (select sc1_id from area_probe);
  if v_hint is distinct from 'HYDERABAD' then
    raise exception 'area service-center lookup did not return the destination hint: %', coalesce(v_hint, '<null>');
  end if;
end
$search_only$;

reset role;

select set_config('request.jwt.claim.sub', (select admin_auth::text from area_probe), true);
select set_config(
  'request.jwt.claims',
  (select json_build_object('sub', admin_auth, 'role', 'authenticated')::text from area_probe),
  true
);
set local role authenticated;

do $import$
declare
  v_res jsonb;
  v_count integer;
  v_dest uuid;
begin
  select count(*) into v_count
  from public.areas where id = (select area_id from area_probe);
  if v_count <> 1 then
    raise exception 'admin bypass did not read areas';
  end if;

  v_res := public.import_master(
    'areas',
    'COMMIT',
    jsonb_build_array(
      jsonb_build_object('name', 'New Area', 'service_center_code', 'NO-SUCH'),
      jsonb_build_object('name', 'South Zone', 'service_center_code', 'SC1'),
      jsonb_build_object('name', '', 'service_center_code', 'SC1'),
      jsonb_build_object('name', 'Mismatch', 'service_center_code', 'SC1', 'destination_code', 'WRONG')
    )
  );
  if (v_res->>'error_count')::int <> 4 then
    raise exception 'import did not reject all four bad rows: %', v_res;
  end if;
  if v_res->'errors'->0->>'message' not like '%NO-SUCH%'
     or (v_res->'errors'->0->>'row_no')::int <> 1 then
    raise exception 'unknown service center was not reported on row 1: %', v_res->'errors';
  end if;
  if v_res->'errors'->1->>'message' not like '%already exists%'
     or (v_res->'errors'->1->>'row_no')::int <> 2 then
    raise exception 'duplicate name was not reported on row 2: %', v_res->'errors';
  end if;
  if v_res->'errors'->2->>'message' not like '%Area Name is required%'
     or (v_res->'errors'->2->>'row_no')::int <> 3 then
    raise exception 'blank name was not reported on row 3: %', v_res->'errors';
  end if;
  if v_res->'errors'->3->>'message' not like '%does not match%'
     or (v_res->'errors'->3->>'row_no')::int <> 4 then
    raise exception 'destination mismatch was not reported on row 4: %', v_res->'errors';
  end if;

  v_res := public.import_master(
    'areas',
    'COMMIT',
    jsonb_build_array(
      jsonb_build_object('name', 'Banjara Hills', 'service_center_code', 'SC1', 'destination_code', 'HYDERABAD')
    )
  );
  if (v_res->>'ok')::int <> 1 or (v_res->>'error_count')::int <> 0 then
    raise exception 'valid area import failed: %', v_res;
  end if;
  select a.destination_id into v_dest
  from public.areas a
  where a.tenant_id = (select tenant_id from area_probe)
    and a.name = 'BANJARA HILLS'
    and a.deleted_at is null;
  if v_dest is distinct from (select dest_id from area_probe) then
    raise exception 'imported area did not store the derived destination';
  end if;
end
$import$;

reset role;
rollback;
