-- ===========================================================================
-- tax_fuel_setup_verification.sql — Phase 6 Milestone 6D (0052).
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000052','authenticated','authenticated','tf@a.test'),
  ('99999999-1111-4111-8111-00000000b052','authenticated','authenticated','tf@b.test'),
  ('99999999-1111-4111-8111-00000000d052','authenticated','authenticated','tfstaff@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid; v_tb uuid;
begin
  v_t := app.bootstrap_tenant('tf-a', 'TaxFuel A', 'TaxFuelA');
  perform app.link_tenant_admin(v_t, '99999999-1111-4111-8111-000000000052',
          'tfadm', 'TF Admin', 'tf@a.test');
  perform set_config('tf.tenant', v_t::text, false);

  v_tb := app.bootstrap_tenant('tf-b', 'TaxFuel B', 'TaxFuelB');
  perform app.link_tenant_admin(v_tb, '99999999-1111-4111-8111-00000000b052',
          'tfadmb', 'TF Admin B', 'tf@b.test');
  perform set_config('tf.tenant_b', v_tb::text, false);
end $$;

do $$
begin
  if to_regclass('public.fuel_surcharge_rates') is null then raise exception 'FAIL [fuel table]'; end if;
  if to_regclass('public.tax_rates') is null then raise exception 'FAIL [tax table]'; end if;
  if not exists (
    select 1 from information_schema.columns
     where table_name='fuel_surcharge_rates' and column_name='zone_id'
  ) then raise exception 'FAIL [zone_id]'; end if;
  if not exists (
    select 1 from information_schema.columns
     where table_name='tax_rates' and column_name='tax_on_fuel'
  ) then raise exception 'FAIL [tax_on_fuel]'; end if;
  if to_regprocedure('public.save_fuel_rate(jsonb,uuid,integer)') is null then
    raise exception 'FAIL [fn] save_fuel';
  end if;
  if to_regprocedure('public.save_tax_rate(jsonb,uuid,integer)') is null then
    raise exception 'FAIL [fn] save_tax';
  end if;
  if to_regprocedure('public.list_fuel_rates(text,text,integer,integer)') is null then
    raise exception 'FAIL [fn] list_fuel';
  end if;
  if to_regprocedure('public.list_tax_rates(text,text,integer,integer)') is null then
    raise exception 'FAIL [fn] list_tax';
  end if;
  if to_regprocedure('public.delete_fuel_rate(uuid,integer)') is null then
    raise exception 'FAIL [fn] delete_fuel';
  end if;
  if to_regprocedure('public.delete_tax_rate(uuid,integer)') is null then
    raise exception 'FAIL [fn] delete_tax';
  end if;
  raise notice 'PASS [structure]';
end $$;

do $$
declare
  v_t uuid := current_setting('tf.tenant')::uuid;
  v_branch uuid; v_cust uuid; v_pt uuid; v_prod uuid; v_zone uuid; v_dest uuid;
  v_uid uuid; v_gid uuid;
begin
  select id into v_branch from public.branches
   where tenant_id = v_t and deleted_at is null
   order by case when is_head_office then 0 else 1 end limit 1;

  insert into public.zones (tenant_id, code, name)
  values (v_t, 'TFZ1', 'TF Zone') on conflict do nothing;
  select id into v_zone from public.zones where tenant_id = v_t and code = 'TFZ1';

  insert into public.product_types (tenant_id, code, name)
  values (v_t, 'TFPT', 'TF PT') on conflict do nothing;
  select id into v_pt from public.product_types where tenant_id = v_t and code = 'TFPT';

  insert into public.products (tenant_id, code, name, product_type_id, status)
  values (v_t, 'TFPX', 'TF Express', v_pt, 'ACTIVE') on conflict do nothing;
  select id into v_prod from public.products where tenant_id = v_t and code = 'TFPX';

  insert into public.customers (tenant_id, code, name, mobile, status)
  values (v_t, 'TFCUST', 'TF Customer', '9444444444', 'ACTIVE') on conflict do nothing;
  select id into v_cust from public.customers where tenant_id = v_t and code = 'TFCUST';

  insert into public.destinations (tenant_id, code, name, status, zone_id)
  values (v_t, 'TFDEST', 'TF Dest', 'ACTIVE', v_zone) on conflict do nothing;
  select id into v_dest from public.destinations where tenant_id = v_t and code = 'TFDEST';

  perform set_config('tf.cust', v_cust::text, false);
  perform set_config('tf.prod', v_prod::text, false);
  perform set_config('tf.zone', v_zone::text, false);
  perform set_config('tf.dest', v_dest::text, false);

  insert into public.tenant_users (tenant_id, user_id, role, status)
  values (v_t, '99999999-1111-4111-8111-00000000d052', 'MEMBER', 'ACTIVE')
  on conflict (tenant_id, user_id) do update set status = 'ACTIVE';

  insert into public.users (
    tenant_id, auth_user_id, username, user_type, full_name, email, home_branch_id, status)
  values (
    v_t, '99999999-1111-4111-8111-00000000d052', 'tfstaff', 'STAFF',
    'TF Staff', 'tfstaff@a.test', v_branch, 'ACTIVE')
  on conflict (auth_user_id) do update set deleted_at = null
  returning id into v_uid;

  select id into v_gid from public.user_groups
   where tenant_id = v_t and name = 'OPERATIONS' and deleted_at is null;
  insert into public.user_group_members (tenant_id, user_id, group_id)
  values (v_t, v_uid, v_gid) on conflict (user_id, group_id) do nothing;

  update public.group_permissions gp
     set can_add = false, can_modify = false, can_list = false, can_search = false,
         can_delete = false, all_access = false
    from public.permission_modules pm
   where gp.module_id = pm.id and gp.group_id = v_gid
     and pm.slug in ('utl.fuel-setup', 'utl.tax-surcharge-setup');

  raise notice 'PASS [seed]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000052';

do $$
declare
  v_fuel jsonb; v_tax jsonb; v_id uuid; v_rv int;
  v_list jsonb; v_pct numeric; v_imp jsonb;
  v_cust uuid := current_setting('tf.cust')::uuid;
  v_prod uuid := current_setting('tf.prod')::uuid;
  v_zone uuid := current_setting('tf.zone')::uuid;
  v_dest uuid := current_setting('tf.dest')::uuid;
begin
  -- Global fuel rate
  v_fuel := public.save_fuel_rate(jsonb_build_object(
    'from_date', current_date::text,
    'to_date', (current_date + 30)::text,
    'percentage', '12.5',
    'status', 'ACTIVE'));
  if (v_fuel->>'percentage')::numeric <> 12.5 then raise exception 'FAIL [fuel save]'; end if;

  -- Product+Zone more specific
  v_fuel := public.save_fuel_rate(jsonb_build_object(
    'product_id', v_prod,
    'zone_id', v_zone,
    'from_date', current_date::text,
    'to_date', (current_date + 10)::text,
    'percentage', '18',
    'status', 'ACTIVE'));

  -- Customer+Product+Zone most specific
  v_fuel := public.save_fuel_rate(jsonb_build_object(
    'customer_id', v_cust,
    'product_id', v_prod,
    'zone_id', v_zone,
    'from_date', current_date::text,
    'to_date', (current_date + 10)::text,
    'percentage', '22',
    'status', 'ACTIVE'));
  v_id := (v_fuel->>'id')::uuid;
  v_rv := (v_fuel->>'row_version')::int;

  -- Overlap rejection
  begin
    perform public.save_fuel_rate(jsonb_build_object(
      'customer_id', v_cust,
      'product_id', v_prod,
      'zone_id', v_zone,
      'from_date', (current_date + 5)::text,
      'percentage', '25'));
    raise exception 'FAIL [fuel overlap]';
  exception when sqlstate 'CMS04' then null;
  end;

  -- Invalid percentage
  begin
    perform public.save_fuel_rate(jsonb_build_object(
      'from_date', current_date::text, 'percentage', '150'));
    raise exception 'FAIL [fuel pct]';
  exception when sqlstate 'CMS04' then null;
  end;

  -- Lookup priority: customer+product+zone wins
  v_pct := app.resolve_fuel_pct(
    current_setting('tf.tenant')::uuid, v_cust, null, v_prod, v_dest, current_date, 0);
  if v_pct <> 22 then raise exception 'FAIL [fuel priority] got %', v_pct; end if;

  -- Tax CRUD
  v_tax := public.save_tax_rate(jsonb_build_object(
    'customer_id', v_cust,
    'product_id', v_prod,
    'from_date', current_date::text,
    'igst_pct', '18',
    'cgst_pct', '9',
    'sgst_pct', '9',
    'tax_type', 'GST',
    'tax_on_fuel', 'true',
    'status', 'ACTIVE'));
  if (v_tax->>'igst_pct')::numeric <> 18 then raise exception 'FAIL [tax save]'; end if;

  begin
    perform public.save_tax_rate(jsonb_build_object(
      'customer_id', v_cust,
      'product_id', v_prod,
      'from_date', (current_date + 1)::text,
      'igst_pct', '12',
      'tax_type', 'GST'));
    raise exception 'FAIL [tax overlap]';
  exception when sqlstate 'CMS04' then null;
  end;

  -- Optimistic lock
  begin
    perform public.save_fuel_rate(
      jsonb_build_object(
        'customer_id', v_cust, 'product_id', v_prod, 'zone_id', v_zone,
        'from_date', current_date::text, 'percentage', '23'),
      v_id, v_rv - 1);
    raise exception 'FAIL [opt lock]';
  exception when sqlstate 'CMS04' then null;
  end;

  v_list := public.list_fuel_rates(null, 'ACTIVE', 1, 50);
  if (v_list->>'total')::int < 3 then raise exception 'FAIL [list fuel]'; end if;

  v_list := public.list_tax_rates(null, null, 1, 50);
  if (v_list->>'total')::int < 1 then raise exception 'FAIL [list tax]'; end if;

  -- Soft delete
  perform public.delete_fuel_rate(v_id, v_rv);
  if exists (
    select 1 from public.fuel_surcharge_rates
     where id = v_id and deleted_at is null
  ) then raise exception 'FAIL [soft delete]'; end if;

  if not exists (
    select 1 from public.audit_logs
     where entity_type = 'fuel_surcharge_rates' and module_slug = 'utl.fuel-setup'
  ) then raise exception 'FAIL [fuel audit]'; end if;

  if not exists (
    select 1 from public.audit_logs
     where entity_type = 'tax_rates' and module_slug = 'utl.tax-surcharge-setup'
  ) then raise exception 'FAIL [tax audit]'; end if;

  -- CSV import VALIDATE + COMMIT
  v_imp := public.import_master(
    'fuel_surcharge_rates', 'VALIDATE',
    jsonb_build_array(jsonb_build_object(
      'from_date', (current_date + 60)::text,
      'percentage', '7.5',
      'status', 'ACTIVE',
      'product_code', 'TFPX',
      'zone_code', 'TFZ1')));
  if (v_imp->>'error_count')::int <> 0 then raise exception 'FAIL [import validate] %', v_imp; end if;

  v_imp := public.import_master(
    'fuel_surcharge_rates', 'COMMIT',
    jsonb_build_array(jsonb_build_object(
      'from_date', (current_date + 60)::text,
      'percentage', '7.5',
      'status', 'ACTIVE',
      'product_code', 'TFPX',
      'zone_code', 'TFZ1')));
  if (v_imp->>'ok')::int < 1 then raise exception 'FAIL [import commit] %', v_imp; end if;

  v_imp := public.import_master(
    'tax_rates', 'COMMIT',
    jsonb_build_array(jsonb_build_object(
      'from_date', (current_date + 60)::text,
      'igst_pct', '5',
      'cgst_pct', '2.5',
      'sgst_pct', '2.5',
      'tax_type', 'GST',
      'status', 'ACTIVE')));
  if (v_imp->>'ok')::int < 1 then raise exception 'FAIL [tax import] %', v_imp; end if;

  raise notice 'PASS [crud / overlap / priority / audit / import / opt-lock]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000d052';
do $$
begin
  begin
    perform public.save_fuel_rate(jsonb_build_object(
      'from_date', current_date::text, 'percentage', '1'));
    raise exception 'FAIL [perm fuel]';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.save_tax_rate(jsonb_build_object(
      'from_date', current_date::text, 'igst_pct', '1'));
    raise exception 'FAIL [perm tax]';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'PASS [permissions]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000b052';
do $$
declare v_list jsonb;
begin
  v_list := public.list_fuel_rates(null, null, 1, 50);
  if (v_list->>'total')::int <> 0 then raise exception 'FAIL [tenant fuel]'; end if;
  v_list := public.list_tax_rates(null, null, 1, 50);
  if (v_list->>'total')::int <> 0 then raise exception 'FAIL [tenant tax]'; end if;
  raise notice 'PASS [tenant isolation]';
end $$;

reset role;
do $$
begin
  raise notice '==========================================================';
  raise notice 'TAX / FUEL SETUP VERIFICATION PASSED.';
  raise notice '==========================================================';
end $$;

rollback;
