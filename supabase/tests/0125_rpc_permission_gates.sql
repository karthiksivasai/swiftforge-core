-- Executable permission-gate checks for migration 0125.
-- Run against a database that already has 0125 applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0125_rpc_permission_gates.sql
-- The script opens a transaction and rolls it back. It does not keep the
-- fixture tenant, users, or scan rows.
--
-- DENY  — staff group with no grants. Each call must raise 42501
--         "... permission is required".
-- ALLOW — same calls after that group is granted the slug action.
--         Each call must finish without an authorization error.
-- ADMIN — tenant admin, with no group grants, must also finish every call.

begin;

do $gate$
declare
  v_tenant uuid;
  v_denied_auth uuid := gen_random_uuid();
  v_staff_auth uuid := gen_random_uuid();
  v_admin_auth uuid := gen_random_uuid();
  v_denied_user uuid;
  v_staff_user uuid;
  v_admin_user uuid;
  v_group uuid;
  v_drs uuid;
  v_manifest uuid;
  v_ship_staff uuid;
  v_ship_admin uuid;
  v_sql text;
  v_col text;
  v_auth uuid;
  v_email text;
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'record_pickup_inscan'
      and pg_get_functiondef(p.oid) like '%txn.pickup-insacn%'
  ) then
    raise exception '0125_rpc_permission_gates.sql is not applied';
  end if;

  insert into public.tenants (slug, name, status)
  values ('rpc-gate-' || substr(gen_random_uuid()::text, 1, 8), 'RPC gate', 'ACTIVE')
  returning id into v_tenant;

  -- auth.users column sets differ by Supabase version. Fill the identity
  -- columns that exist, and leave the rest to their defaults.
  for v_auth, v_email in
    select *
    from (values
      (v_denied_auth, 'rpc-gate-denied@example.test'),
      (v_staff_auth, 'rpc-gate-staff@example.test'),
      (v_admin_auth, 'rpc-gate-admin@example.test')
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
      v_sql := v_sql || ', ' || quote_literal('00000000-0000-0000-0000-000000000000') || '::uuid';
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'aud') then
      v_sql := v_sql || ', ' || quote_literal('authenticated');
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'role') then
      v_sql := v_sql || ', ' || quote_literal('authenticated');
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'email') then
      v_sql := v_sql || ', ' || quote_literal(v_email);
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'encrypted_password') then
      v_sql := v_sql || ', ' || quote_literal('');
    end if;
    v_sql := v_sql || ')';
    execute v_sql;

    -- Fill remaining NOT NULL text/bool/json/time columns that have no default.
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
    (v_tenant, v_denied_auth, 'MEMBER', 'ACTIVE'),
    (v_tenant, v_staff_auth, 'MEMBER', 'ACTIVE'),
    (v_tenant, v_admin_auth, 'OWNER', 'ACTIVE');

  insert into public.users (tenant_id, auth_user_id, username, user_type, status, email)
  values (v_tenant, v_denied_auth, 'rpc-gate-denied', 'STAFF', 'ACTIVE', 'rpc-gate-denied@example.test')
  returning id into v_denied_user;
  insert into public.users (tenant_id, auth_user_id, username, user_type, status, email)
  values (v_tenant, v_staff_auth, 'rpc-gate-staff', 'STAFF', 'ACTIVE', 'rpc-gate-staff@example.test')
  returning id into v_staff_user;
  insert into public.users (tenant_id, auth_user_id, username, user_type, status, email)
  values (v_tenant, v_admin_auth, 'rpc-gate-admin', 'ADMIN', 'ACTIVE', 'rpc-gate-admin@example.test')
  returning id into v_admin_user;

  insert into public.user_groups (tenant_id, name)
  values (v_tenant, 'RPC gate staff')
  returning id into v_group;

  insert into public.user_group_members (tenant_id, user_id, group_id)
  values (v_tenant, v_denied_user, v_group), (v_tenant, v_staff_user, v_group);

  insert into public.drs (tenant_id, drs_no) values (v_tenant, 'DRS-GATE-1') returning id into v_drs;
  insert into public.manifests (tenant_id, manifest_no) values (v_tenant, 'MF-GATE-1') returning id into v_manifest;
  insert into public.shipments (tenant_id, awb_no, current_status)
  values (v_tenant, 'GATESTAFF1', 'OUT_FOR_DELIVERY')
  returning id into v_ship_staff;
  insert into public.shipments (tenant_id, awb_no, current_status)
  values (v_tenant, 'GATEADMIN1', 'OUT_FOR_DELIVERY')
  returning id into v_ship_admin;

  perform set_config('request.jwt.claim.sub', v_denied_auth::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_denied_auth, 'role', 'authenticated')::text, true);

  -- DENY
  begin
    perform public.get_drs_completion_board(v_drs);
    raise exception 'get_drs_completion_board: expected authorization error';
  exception when sqlstate '42501' then
    if sqlerrm not ilike '%permission is required%' then
      raise exception 'get_drs_completion_board: unexpected 42501: %', sqlerrm;
    end if;
  end;
  begin
    perform public.get_inscan_reconciliation();
    raise exception 'get_inscan_reconciliation: expected authorization error';
  exception when sqlstate '42501' then
    if sqlerrm not ilike '%permission is required%' then
      raise exception 'get_inscan_reconciliation: unexpected 42501: %', sqlerrm;
    end if;
  end;
  begin
    perform public.record_pickup_inscan(current_date, '10:00', 'HYD', 'GATEDENY1');
    raise exception 'record_pickup_inscan: expected authorization error';
  exception when sqlstate '42501' then
    if sqlerrm not ilike '%permission is required%' then
      raise exception 'record_pickup_inscan: unexpected 42501: %', sqlerrm;
    end if;
  end;
  begin
    perform public.get_manifest_inscan_board(v_manifest);
    raise exception 'get_manifest_inscan_board: expected authorization error';
  exception when sqlstate '42501' then
    if sqlerrm not ilike '%permission is required%' then
      raise exception 'get_manifest_inscan_board: unexpected 42501: %', sqlerrm;
    end if;
  end;
  begin
    perform public.record_undelivery_scan(current_date, '10:00', 'HYD', 'GATESTAFF1');
    raise exception 'record_undelivery_scan: expected authorization error';
  exception when sqlstate '42501' then
    if sqlerrm not ilike '%permission is required%' then
      raise exception 'record_undelivery_scan: unexpected 42501: %', sqlerrm;
    end if;
  end;
  begin
    perform public.get_pod_by_awb('GATESTAFF1');
    raise exception 'get_pod_by_awb: expected authorization error';
  exception when sqlstate '42501' then
    if sqlerrm not ilike '%permission is required%' then
      raise exception 'get_pod_by_awb: unexpected 42501: %', sqlerrm;
    end if;
  end;
  begin
    perform public.validate_shipment_booking(v_ship_staff);
    raise exception 'validate_shipment_booking: expected authorization error';
  exception when sqlstate '42501' then
    if sqlerrm not ilike '%permission is required%' then
      raise exception 'validate_shipment_booking: unexpected 42501: %', sqlerrm;
    end if;
  end;
  begin
    perform public.get_awb_entry_draft();
    raise exception 'get_awb_entry_draft: expected authorization error';
  exception when sqlstate '42501' then
    if sqlerrm not ilike '%permission is required%' then
      raise exception 'get_awb_entry_draft: unexpected 42501: %', sqlerrm;
    end if;
  end;
  begin
    perform public.upsert_awb_entry_draft('{"gate":true}'::jsonb);
    raise exception 'upsert_awb_entry_draft: expected authorization error';
  exception when sqlstate '42501' then
    if sqlerrm not ilike '%permission is required%' then
      raise exception 'upsert_awb_entry_draft: unexpected 42501: %', sqlerrm;
    end if;
  end;
  begin
    perform public.clear_awb_entry_draft();
    raise exception 'clear_awb_entry_draft: expected authorization error';
  exception when sqlstate '42501' then
    if sqlerrm not ilike '%permission is required%' then
      raise exception 'clear_awb_entry_draft: unexpected 42501: %', sqlerrm;
    end if;
  end;
  begin
    perform public.get_branch_awb_stock_summary(null);
    raise exception 'get_branch_awb_stock_summary: expected authorization error';
  exception when sqlstate '42501' then
    if sqlerrm not ilike '%permission is required%' then
      raise exception 'get_branch_awb_stock_summary: unexpected 42501: %', sqlerrm;
    end if;
  end;
  begin
    perform public.validate_manual_awb(null, '');
    raise exception 'validate_manual_awb: expected authorization error';
  exception when sqlstate '42501' then
    if sqlerrm not ilike '%permission is required%' then
      raise exception 'validate_manual_awb: unexpected 42501: %', sqlerrm;
    end if;
  end;
  begin
    perform count(*) from public.lookup_international_destinations(null, 5);
    raise exception 'lookup_international_destinations: expected authorization error';
  exception when sqlstate '42501' then
    if sqlerrm not ilike '%permission is required%' then
      raise exception 'lookup_international_destinations: unexpected 42501: %', sqlerrm;
    end if;
  end;
  begin
    perform public.list_shipment_documents(v_ship_staff);
    raise exception 'list_shipment_documents: expected authorization error';
  exception when sqlstate '42501' then
    if sqlerrm not ilike '%permission is required%' then
      raise exception 'list_shipment_documents: unexpected 42501: %', sqlerrm;
    end if;
  end;
  begin
    perform public.get_shipment_document(v_ship_staff, 'INVOICE');
    raise exception 'get_shipment_document: expected authorization error';
  exception when sqlstate '42501' then
    if sqlerrm not ilike '%permission is required%' then
      raise exception 'get_shipment_document: unexpected 42501: %', sqlerrm;
    end if;
  end;

  -- ALLOW
  insert into public.group_permissions (
    tenant_id, group_id, module_id,
    can_add, can_modify, can_delete, can_list, can_search
  )
  select v_tenant, v_group, pm.id,
    pm.slug in ('txn.pickup-insacn', 'txn.un-delivery-scan', 'txn.awb-entry'),
    pm.slug = 'txn.awb-entry',
    pm.slug = 'txn.awb-entry',
    pm.slug in (
      'txn.drs-scan', 'txn.pickup-insacn', 'txn.manifest-in-scan',
      'txn.pod-entry-ok-update', 'txn.awb-entry', 'mst.destination-master'
    ),
    pm.slug in (
      'txn.drs-scan', 'txn.pickup-insacn', 'txn.manifest-in-scan',
      'txn.pod-entry-ok-update', 'txn.awb-entry', 'mst.destination-master'
    )
  from public.permission_modules pm
  where pm.slug in (
    'txn.drs-scan', 'txn.pickup-insacn', 'txn.manifest-in-scan',
    'txn.un-delivery-scan', 'txn.pod-entry-ok-update', 'txn.awb-entry',
    'mst.destination-master'
  );

  perform set_config('request.jwt.claim.sub', v_staff_auth::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff_auth, 'role', 'authenticated')::text, true);

  perform public.get_drs_completion_board(v_drs);
  perform public.get_inscan_reconciliation();
  perform public.record_pickup_inscan(current_date, '10:00', 'HYD', 'GATESTAFF2');
  perform public.get_manifest_inscan_board(v_manifest);
  perform public.record_undelivery_scan(current_date, '10:00', 'HYD', 'GATESTAFF1');
  perform public.get_pod_by_awb('GATESTAFF1');
  perform public.validate_shipment_booking(v_ship_staff);
  perform public.get_awb_entry_draft();
  perform public.upsert_awb_entry_draft('{"gate":true}'::jsonb);
  perform public.clear_awb_entry_draft();
  perform public.get_branch_awb_stock_summary(null);
  perform public.validate_manual_awb(null, '');
  perform count(*) from public.lookup_international_destinations(null, 5);
  perform public.list_shipment_documents(v_ship_staff);
  perform public.get_shipment_document(v_ship_staff, 'INVOICE');

  -- ADMIN
  perform set_config('request.jwt.claim.sub', v_admin_auth::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_auth, 'role', 'authenticated')::text, true);

  perform public.get_drs_completion_board(v_drs);
  perform public.get_inscan_reconciliation();
  perform public.record_pickup_inscan(current_date, '11:00', 'HYD', 'GATEADMIN2');
  perform public.get_manifest_inscan_board(v_manifest);
  perform public.record_undelivery_scan(current_date, '11:00', 'HYD', 'GATEADMIN1');
  perform public.get_pod_by_awb('GATEADMIN1');
  perform public.validate_shipment_booking(v_ship_admin);
  perform public.get_awb_entry_draft();
  perform public.upsert_awb_entry_draft('{"gate":"admin"}'::jsonb);
  perform public.clear_awb_entry_draft();
  perform public.get_branch_awb_stock_summary(null);
  perform public.validate_manual_awb(null, '1');
  perform count(*) from public.lookup_international_destinations('a', 5);
  perform public.list_shipment_documents(v_ship_admin);
  perform public.get_shipment_document(v_ship_admin, 'INVOICE');
end
$gate$;

rollback;
