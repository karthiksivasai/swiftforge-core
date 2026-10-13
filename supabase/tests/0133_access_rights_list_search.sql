-- Access Rights enforcement proof for migration 0133.
-- Rolls back. Run:
--   supabase db query --linked -f supabase/tests/0133_access_rights_list_search.sql
begin;

create temp table access_rights_probe (
  tenant_id uuid,
  staff_auth uuid,
  admin_auth uuid,
  group_id uuid,
  customer_id uuid,
  shipment_id uuid,
  invoice_id uuid,
  added_customer_id uuid,
  added_shipment_id uuid,
  added_invoice_id uuid
) on commit drop;
grant all on access_rights_probe to authenticated;

do $fixture$
declare
  v_tenant uuid;
  v_staff_auth uuid := gen_random_uuid();
  v_admin_auth uuid := gen_random_uuid();
  v_staff_user uuid;
  v_admin_user uuid;
  v_group uuid;
  v_customer uuid;
  v_shipment uuid;
  v_invoice uuid;
  v_auth uuid;
  v_email text;
  v_sql text;
  v_col text;
  v_expr text;
  v_def text;
begin
  insert into public.tenants (slug, name, status)
  values ('ar-gate-' || substr(gen_random_uuid()::text, 1, 8), 'Access rights gate', 'ACTIVE')
  returning id into v_tenant;

  for v_auth, v_email in
    select *
    from (values
      (v_staff_auth, 'ar-gate-staff@example.test'),
      (v_admin_auth, 'ar-gate-admin@example.test')
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
  values (v_tenant, v_staff_auth, 'ar-gate-staff', 'STAFF', 'ACTIVE', 'ar-gate-staff@example.test')
  returning id into v_staff_user;
  insert into public.users (tenant_id, auth_user_id, username, user_type, status, email)
  values (v_tenant, v_admin_auth, 'ar-gate-admin', 'ADMIN', 'ACTIVE', 'ar-gate-admin@example.test')
  returning id into v_admin_user;

  insert into public.user_groups (tenant_id, name)
  values (v_tenant, 'AR gate staff')
  returning id into v_group;
  insert into public.user_group_members (tenant_id, user_id, group_id)
  values (v_tenant, v_staff_user, v_group);

  insert into public.customers (tenant_id, code, name, mobile)
  values (v_tenant, 'AR-GATE', 'Access Rights Customer', '9999999999')
  returning id into v_customer;
  insert into public.shipments (tenant_id, awb_no)
  values (v_tenant, 'AR-GATE-' || substr(gen_random_uuid()::text, 1, 8))
  returning id into v_shipment;
  insert into public.invoices (tenant_id, invoice_no)
  values (v_tenant, 'AR-INV-' || substr(gen_random_uuid()::text, 1, 8))
  returning id into v_invoice;

  insert into access_rights_probe (
    tenant_id, staff_auth, admin_auth, group_id, customer_id, shipment_id, invoice_id
  )
  values (v_tenant, v_staff_auth, v_admin_auth, v_group, v_customer, v_shipment, v_invoice);

  perform set_config('request.jwt.claim.sub', v_staff_auth::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff_auth, 'role', 'authenticated')::text, true);

  if app.user_has_permission(v_tenant, 'no.such.module', 'list') then
    raise exception 'unknown slug was granted';
  end if;
  if app.user_has_permission(v_tenant, 'mst.customer-master', 'list')
     or app.user_has_permission(v_tenant, 'txn.awb-entry', 'search')
     or app.user_has_permission(v_tenant, 'doc.generate-invoice', 'add') then
    raise exception 'staff without a grant was allowed';
  end if;

  foreach v_expr in array array['customers', 'shipments', 'invoices']
  loop
    select pg_get_expr(pol.polqual, pol.polrelid) into v_def
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = v_expr and pol.polcmd = 'r'
    limit 1;
    if v_def is null
       or v_def not like '%user_has_permission%'
       or v_def not like '%''list''%' then
      raise exception '% select policy does not require list: %', v_expr, coalesce(v_def, '<missing>');
    end if;
  end loop;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_drs_completion_board';
  if v_def like '%''txn.drs-scan'', ''search''%' then
    raise exception 'DRS read still accepts Search in place of List';
  end if;
  if v_def not like '%''txn.drs-scan'', ''list''%' then
    raise exception 'DRS read no longer requires List';
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'lookup_international_destinations';
  if v_def like '%''mst.destination-master'', ''list''%' then
    raise exception 'destination search still accepts List';
  end if;
  if v_def not like '%''mst.destination-master'', ''search''%' then
    raise exception 'destination search no longer requires Search';
  end if;
end
$fixture$;

-- Staff, no grants: direct reads and writes are denied.
select set_config('request.jwt.claim.sub', (select staff_auth::text from access_rights_probe), true);
select set_config(
  'request.jwt.claims',
  (select json_build_object('sub', staff_auth, 'role', 'authenticated')::text from access_rights_probe),
  true
);
set local role authenticated;

do $deny$
declare
  v_tenant uuid := (select tenant_id from access_rights_probe);
  v_customer uuid := (select customer_id from access_rights_probe);
  v_shipment uuid := (select shipment_id from access_rights_probe);
  v_invoice uuid := (select invoice_id from access_rights_probe);
  v_count integer;
begin
  select count(*) into v_count from public.customers where id = v_customer;
  if v_count <> 0 then raise exception 'customer read was not denied'; end if;
  select count(*) into v_count from public.shipments where id = v_shipment;
  if v_count <> 0 then raise exception 'shipment read was not denied'; end if;
  select count(*) into v_count from public.invoices where id = v_invoice;
  if v_count <> 0 then raise exception 'invoice read was not denied'; end if;

  begin
    insert into public.customers (tenant_id, code, name, mobile)
    values (v_tenant, 'AR-ADD', 'Denied', '9999999998');
    raise exception 'customer insert was not denied';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.shipments (tenant_id, awb_no) values (v_tenant, 'AR-ADD-SHIP');
    raise exception 'shipment insert was not denied';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.invoices (tenant_id, invoice_no) values (v_tenant, 'AR-ADD-INV');
    raise exception 'invoice insert was not denied';
  exception when insufficient_privilege then null;
  end;

  update public.customers set name = 'Changed' where id = v_customer;
  if found then raise exception 'customer update was not denied'; end if;
  update public.shipments set reference_no = 'Changed' where id = v_shipment;
  if found then raise exception 'shipment update was not denied'; end if;
  update public.invoices set irn = 'Changed' where id = v_invoice;
  if found then raise exception 'invoice update was not denied'; end if;

  delete from public.customers where id = v_customer;
  if found then raise exception 'customer delete was not denied'; end if;
  delete from public.shipments where id = v_shipment;
  if found then raise exception 'shipment delete was not denied'; end if;
  delete from public.invoices where id = v_invoice;
  if found then raise exception 'invoice delete was not denied'; end if;

  begin
    perform public.lookup('customer', 'zzz-no-such', 5);
    raise exception 'customer search was not denied';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.lookup_international_destinations('zzz-no-such', 5);
    raise exception 'destination search was not denied';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.search_serviceable_pincode(null);
    raise exception 'serviceable-pincode search was not denied';
  exception when insufficient_privilege then null;
  end;
end
$deny$;

reset role;

-- List without Search: reads succeed, search calls stay denied, writes stay denied.
insert into public.group_permissions (
  tenant_id, group_id, module_id, can_list
)
select p.tenant_id, p.group_id, m.id, true
from access_rights_probe p
join public.permission_modules m
  on m.slug in (
    'mst.customer-master',
    'txn.awb-entry',
    'doc.generate-invoice',
    'mst.destination-master',
    'utl.serviceable-pincode'
  );

do $audit$
declare
  v_detail text;
begin
  select detail into v_detail
  from public.login_logs
  where event = 'PERMISSION_CHANGE'
    and tenant_id = (select tenant_id from access_rights_probe)
    and detail like '%module=mst.customer-master%'
  order by created_at desc
  limit 1;
  if v_detail is null
     or v_detail not like '%list -->true%'
     or v_detail not like '%search -->false%' then
    raise exception 'permission audit did not record the module and flags: %', coalesce(v_detail, '<missing>');
  end if;
end
$audit$;

set local role authenticated;

do $list_only$
declare
  v_customer uuid := (select customer_id from access_rights_probe);
  v_shipment uuid := (select shipment_id from access_rights_probe);
  v_invoice uuid := (select invoice_id from access_rights_probe);
  v_tenant uuid := (select tenant_id from access_rights_probe);
  v_count integer;
begin
  select count(*) into v_count from public.customers where id = v_customer;
  if v_count <> 1 then raise exception 'List did not allow the customer read'; end if;
  select count(*) into v_count from public.shipments where id = v_shipment;
  if v_count <> 1 then raise exception 'List did not allow the shipment read'; end if;
  select count(*) into v_count from public.invoices where id = v_invoice;
  if v_count <> 1 then raise exception 'List did not allow the invoice read'; end if;

  begin
    perform public.lookup('customer', 'zzz-no-such', 5);
    raise exception 'List was accepted as customer Search';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.lookup_international_destinations('zzz-no-such', 5);
    raise exception 'List was accepted as destination Search';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.search_serviceable_pincode(null);
    raise exception 'List was accepted as serviceable-pincode Search';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.customers (tenant_id, code, name, mobile)
    values (v_tenant, 'AR-LIST', 'Still denied', '9999999997');
    raise exception 'List was accepted as customer Add';
  exception when insufficient_privilege then null;
  end;
  update public.shipments set reference_no = 'Still denied' where id = v_shipment;
  if found then raise exception 'List was accepted as shipment Modify'; end if;
  delete from public.invoices where id = v_invoice;
  if found then raise exception 'List was accepted as invoice Delete'; end if;
end
$list_only$;

reset role;

-- Search without List cannot read the three forms, and Search calls succeed.
update public.group_permissions gp
set can_list = false, can_search = true
from access_rights_probe p
where gp.group_id = p.group_id
  and gp.tenant_id = p.tenant_id;

set local role authenticated;

do $search_only$
declare
  v_customer uuid := (select customer_id from access_rights_probe);
  v_shipment uuid := (select shipment_id from access_rights_probe);
  v_invoice uuid := (select invoice_id from access_rights_probe);
  v_count integer;
begin
  select count(*) into v_count from public.customers where id = v_customer;
  if v_count <> 0 then raise exception 'Search was accepted as customer List'; end if;
  select count(*) into v_count from public.shipments where id = v_shipment;
  if v_count <> 0 then raise exception 'Search was accepted as shipment List'; end if;
  select count(*) into v_count from public.invoices where id = v_invoice;
  if v_count <> 0 then raise exception 'Search was accepted as invoice List'; end if;

  perform public.lookup('customer', 'zzz-no-such', 5);
  perform public.lookup_international_destinations('zzz-no-such', 5);
  perform public.search_serviceable_pincode(null);
end
$search_only$;

reset role;

-- Add, Modify, and Delete on the three forms.
update public.group_permissions gp
set can_add = true, can_list = true, can_search = false
from access_rights_probe p
where gp.group_id = p.group_id and gp.tenant_id = p.tenant_id;

set local role authenticated;

do $add$
declare
  v_tenant uuid := (select tenant_id from access_rights_probe);
  v_customer uuid;
  v_shipment uuid;
  v_invoice uuid;
begin
  insert into public.customers (tenant_id, code, name, mobile)
  values (v_tenant, 'AR-ADDED', 'Added', '9999999996')
  returning id into v_customer;
  insert into public.shipments (tenant_id, awb_no)
  values (v_tenant, 'AR-ADDED-SHIP')
  returning id into v_shipment;
  insert into public.invoices (tenant_id, invoice_no)
  values (v_tenant, 'AR-ADDED-INV')
  returning id into v_invoice;
  update access_rights_probe
  set added_customer_id = v_customer,
      added_shipment_id = v_shipment,
      added_invoice_id = v_invoice;
end
$add$;

reset role;

update public.group_permissions gp
set can_modify = true
from access_rights_probe p
where gp.group_id = p.group_id and gp.tenant_id = p.tenant_id;

set local role authenticated;

do $modify$
begin
  update public.customers set name = 'Modified' where id = (select added_customer_id from access_rights_probe);
  if not found then raise exception 'customer Modify was denied'; end if;
  update public.shipments set reference_no = 'Modified' where id = (select added_shipment_id from access_rights_probe);
  if not found then raise exception 'shipment Modify was denied'; end if;
  update public.invoices set irn = 'Modified' where id = (select added_invoice_id from access_rights_probe);
  if not found then raise exception 'invoice Modify was denied'; end if;
end
$modify$;

reset role;

update public.group_permissions gp
set can_delete = true
from access_rights_probe p
where gp.group_id = p.group_id and gp.tenant_id = p.tenant_id;

set local role authenticated;

do $delete$
begin
  delete from public.customers where id = (select added_customer_id from access_rights_probe);
  if not found then raise exception 'customer Delete was denied'; end if;
  delete from public.shipments where id = (select added_shipment_id from access_rights_probe);
  if not found then raise exception 'shipment Delete was denied'; end if;
  delete from public.invoices where id = (select added_invoice_id from access_rights_probe);
  if not found then raise exception 'invoice Delete was denied'; end if;
end
$delete$;

reset role;

-- Modify on Access Rights, without Add, can insert a new grant row.
insert into public.group_permissions (tenant_id, group_id, module_id, can_modify)
select p.tenant_id, p.group_id, m.id, true
from access_rights_probe p
join public.permission_modules m on m.slug = 'utl.access-rights';

set local role authenticated;

do $grant_insert$
declare
  v_tenant uuid := (select tenant_id from access_rights_probe);
  v_group uuid := (select group_id from access_rights_probe);
  v_module uuid;
begin
  select id into v_module from public.permission_modules where slug = 'mst.zone-master';
  insert into public.group_permissions (tenant_id, group_id, module_id, can_list)
  values (v_tenant, v_group, v_module, true);
end
$grant_insert$;

reset role;

-- Admin bypass: no group grants are required.
select set_config('request.jwt.claim.sub', (select admin_auth::text from access_rights_probe), true);
select set_config(
  'request.jwt.claims',
  (select json_build_object('sub', admin_auth, 'role', 'authenticated')::text from access_rights_probe),
  true
);
set local role authenticated;

do $admin$
declare
  v_count integer;
begin
  select count(*) into v_count from public.customers where id = (select customer_id from access_rights_probe);
  if v_count <> 1 then raise exception 'admin bypass did not read customers'; end if;
  select count(*) into v_count from public.shipments where id = (select shipment_id from access_rights_probe);
  if v_count <> 1 then raise exception 'admin bypass did not read shipments'; end if;
  select count(*) into v_count from public.invoices where id = (select invoice_id from access_rights_probe);
  if v_count <> 1 then raise exception 'admin bypass did not read invoices'; end if;
end
$admin$;

reset role;

rollback;
