-- Airline Master proof for migration 0135. Rolls back.
--   supabase db query --linked -f supabase/tests/0135_airline_master.sql
begin;

create temp table airline_probe (
  tenant_id uuid,
  staff_auth uuid,
  admin_auth uuid,
  group_id uuid,
  product_id uuid,
  airline_id uuid,
  shipment_id uuid,
  bagging_id uuid
) on commit drop;
grant all on airline_probe to authenticated;

do $fixture$
declare
  v_tenant uuid;
  v_staff_auth uuid := gen_random_uuid();
  v_admin_auth uuid := gen_random_uuid();
  v_staff_user uuid;
  v_group uuid;
  v_product uuid;
  v_airline uuid;
  v_shipment uuid;
  v_bagging uuid;
  v_auth uuid;
  v_email text;
  v_sql text;
  v_col text;
  v_def text;
  v_msg text;
begin
  insert into public.tenants (slug, name, status)
  values ('al-gate-' || substr(gen_random_uuid()::text, 1, 8), 'Airline gate', 'ACTIVE')
  returning id into v_tenant;

  for v_auth, v_email in
    select *
    from (values
      (v_staff_auth, 'al-gate-staff-' || substr(v_staff_auth::text, 1, 8) || '@example.test'),
      (v_admin_auth, 'al-gate-admin-' || substr(v_admin_auth::text, 1, 8) || '@example.test')
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
    'al-gate-staff-' || substr(v_staff_auth::text, 1, 8),
    'STAFF', 'ACTIVE',
    'al-gate-staff-' || substr(v_staff_auth::text, 1, 8) || '@example.test'
  )
  returning id into v_staff_user;
  insert into public.users (tenant_id, auth_user_id, username, user_type, status, email)
  values (
    v_tenant, v_admin_auth,
    'al-gate-admin-' || substr(v_admin_auth::text, 1, 8),
    'ADMIN', 'ACTIVE',
    'al-gate-admin-' || substr(v_admin_auth::text, 1, 8) || '@example.test'
  );

  insert into public.user_groups (tenant_id, name)
  values (v_tenant, 'Airline gate staff')
  returning id into v_group;
  insert into public.user_group_members (tenant_id, user_id, group_id)
  values (v_tenant, v_staff_user, v_group);

  insert into public.products (tenant_id, code, name)
  values (v_tenant, 'DOCS', 'DOCUMENTS')
  returning id into v_product;

  insert into public.airlines (tenant_id, name, product_id)
  values (v_tenant, 'Emirates', v_product)
  returning id into v_airline;

  if (select name from public.airlines where id = v_airline) <> 'EMIRATES' then
    raise exception 'airline name was not stored in upper case';
  end if;

  begin
    insert into public.airlines (tenant_id, name, product_id)
    values (v_tenant, 'emirates', v_product);
    raise exception 'case-variant airline name was inserted';
  exception
    when unique_violation then
      if SQLERRM not like '%already exists%' then
        raise exception 'duplicate airline message was not clear: %', SQLERRM;
      end if;
  end;

  insert into public.shipments (tenant_id, awb_no, airline)
  values (v_tenant, 'AL-GATE-' || substr(gen_random_uuid()::text, 1, 8), 'EMIRATES')
  returning id into v_shipment;

  begin
    update public.airlines set deleted_at = now() where id = v_airline;
    raise exception 'airline delete was allowed while an AWB references it';
  exception
    when foreign_key_violation then
      if SQLERRM not like '%airway bill%' then
        raise exception 'AWB delete block did not name the airway bill: %', SQLERRM;
      end if;
  end;

  update public.shipments set airline = null where id = v_shipment;

  insert into public.bagging_manifests (tenant_id, manifest_no, airlines_name)
  values (v_tenant, 'AL-BAG-' || substr(gen_random_uuid()::text, 1, 8), 'emirates')
  returning id into v_bagging;

  begin
    update public.airlines set deleted_at = now() where id = v_airline;
    raise exception 'airline delete was allowed while bagging references it';
  exception
    when foreign_key_violation then
      if SQLERRM not like '%bagging record%' then
        raise exception 'bagging delete block did not name bagging: %', SQLERRM;
      end if;
  end;

  select pg_get_expr(pol.polqual, pol.polrelid) into v_def
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'airlines' and pol.polcmd = 'r'
  limit 1;
  if v_def is null
     or v_def not like '%user_has_permission%'
     or v_def not like '%''list''%'
     or v_def like '%''search''%' then
    raise exception 'airlines select policy does not require list: %', coalesce(v_def, '<missing>');
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'lookup'
    and pg_get_function_identity_arguments(p.oid) = 'p_key text, p_q text, p_limit integer';
  if v_def like '%al.code%' then
    raise exception 'airline lookup still reads al.code';
  end if;
  if v_def not like '%lookup_permission_slug%' or v_def not like '%''search''%' then
    raise exception 'airline lookup no longer requires Search';
  end if;

  insert into airline_probe (tenant_id, staff_auth, admin_auth, group_id, product_id, airline_id, shipment_id, bagging_id)
  values (v_tenant, v_staff_auth, v_admin_auth, v_group, v_product, v_airline, v_shipment, v_bagging);
end
$fixture$;

select set_config('request.jwt.claim.sub', (select staff_auth::text from airline_probe), true);
select set_config(
  'request.jwt.claims',
  (select json_build_object('sub', staff_auth, 'role', 'authenticated')::text from airline_probe),
  true
);
set local role authenticated;

do $no_grant$
declare
  v_count integer;
begin
  select count(*) into v_count from public.airlines where id = (select airline_id from airline_probe);
  if v_count <> 0 then raise exception 'airline read was not denied without List'; end if;
  begin
    perform public.lookup('airline', 'EMIRATES', 5);
    raise exception 'airline search was not denied without Search';
  exception when insufficient_privilege then null;
  end;
end
$no_grant$;

reset role;

insert into public.group_permissions (tenant_id, group_id, module_id, can_list)
select p.tenant_id, p.group_id, m.id, true
from airline_probe p
join public.permission_modules m on m.slug = 'mst.airlines';

select set_config('request.jwt.claim.sub', (select staff_auth::text from airline_probe), true);
select set_config(
  'request.jwt.claims',
  (select json_build_object('sub', staff_auth, 'role', 'authenticated')::text from airline_probe),
  true
);
set local role authenticated;

do $list_only$
declare
  v_count integer;
begin
  select count(*) into v_count from public.airlines where id = (select airline_id from airline_probe);
  if v_count <> 1 then raise exception 'List did not allow the airline read'; end if;
  select count(*) into v_count
  from public.list_airlines()
  where id = (select airline_id from airline_probe)
    and product_code = 'DOCS';
  if v_count <> 1 then raise exception 'Airline List did not return the product code'; end if;
  begin
    perform public.lookup('airline', 'EMIRATES', 5);
    raise exception 'List was accepted in place of Search';
  exception when insufficient_privilege then null;
  end;
end
$list_only$;

reset role;

update public.group_permissions
set can_list = false, can_search = true
where group_id = (select group_id from airline_probe)
  and module_id = (select id from public.permission_modules where slug = 'mst.airlines');

select set_config('request.jwt.claim.sub', (select staff_auth::text from airline_probe), true);
select set_config(
  'request.jwt.claims',
  (select json_build_object('sub', staff_auth, 'role', 'authenticated')::text from airline_probe),
  true
);
set local role authenticated;

do $search_only$
declare
  v_count integer;
begin
  select count(*) into v_count from public.airlines where id = (select airline_id from airline_probe);
  if v_count <> 0 then raise exception 'Search was accepted in place of List'; end if;
  select count(*) into v_count from public.list_airlines();
  if v_count <> 0 then raise exception 'list_airlines accepted Search in place of List'; end if;
  select count(*) into v_count from public.lookup('airline', 'EMIRATES', 5);
  if v_count <> 1 then raise exception 'Search did not return the airline'; end if;
end
$search_only$;

reset role;

select set_config('request.jwt.claim.sub', (select admin_auth::text from airline_probe), true);
select set_config(
  'request.jwt.claims',
  (select json_build_object('sub', admin_auth, 'role', 'authenticated')::text from airline_probe),
  true
);
set local role authenticated;

do $import$
declare
  v_res jsonb;
  v_count integer;
begin
  select count(*) into v_count
  from public.airlines where id = (select airline_id from airline_probe);
  if v_count <> 1 then
    raise exception 'admin bypass did not read airlines';
  end if;

  v_res := public.import_master(
    'airlines',
    'COMMIT',
    jsonb_build_array(
      jsonb_build_object('name', 'New Airline', 'product_code', 'NO-SUCH'),
      jsonb_build_object('name', 'Emirates', 'product_code', 'DOCS'),
      jsonb_build_object('name', '', 'product_code', 'DOCS')
    )
  );
  if (v_res->>'error_count')::int <> 3 then
    raise exception 'import did not reject all three bad rows: %', v_res;
  end if;
  if v_res->'errors'->0->>'message' not like '%NO-SUCH%'
     or (v_res->'errors'->0->>'row_no')::int <> 1 then
    raise exception 'unknown product was not reported on row 1: %', v_res->'errors';
  end if;
  if v_res->'errors'->1->>'message' not like '%already exists%'
     or (v_res->'errors'->1->>'row_no')::int <> 2 then
    raise exception 'duplicate name was not reported on row 2: %', v_res->'errors';
  end if;
  if v_res->'errors'->2->>'message' not like '%Name is required%'
     or (v_res->'errors'->2->>'row_no')::int <> 3 then
    raise exception 'blank name was not reported on row 3: %', v_res->'errors';
  end if;

  v_res := public.import_master(
    'airlines',
    'COMMIT',
    jsonb_build_array(jsonb_build_object('name', 'Qatar Airways', 'product_code', 'DOCS'))
  );
  if (v_res->>'ok')::int <> 1 or (v_res->>'error_count')::int <> 0 then
    raise exception 'valid airline import failed: %', v_res;
  end if;
end
$import$;

reset role;
rollback;
