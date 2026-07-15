-- ===========================================================================
-- serviceable_pincode_verification.sql — Phase 6 Milestone 6F
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000054','authenticated','authenticated','svc@a.test'),
  ('99999999-1111-4111-8111-00000000b054','authenticated','authenticated','svc@b.test'),
  ('99999999-1111-4111-8111-00000000d054','authenticated','authenticated','svcstaff@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid; v_tb uuid;
begin
  v_t := app.bootstrap_tenant('svc-a', 'Svc A', 'SvcA');
  perform app.link_tenant_admin(v_t, '99999999-1111-4111-8111-000000000054',
          'svcadm', 'Svc Admin', 'svc@a.test');
  perform set_config('sp.tenant', v_t::text, false);

  v_tb := app.bootstrap_tenant('svc-b', 'Svc B', 'SvcB');
  perform app.link_tenant_admin(v_tb, '99999999-1111-4111-8111-00000000b054',
          'svcadmb', 'Svc Admin B', 'svc@b.test');
  perform set_config('sp.tenant_b', v_tb::text, false);
end $$;

do $$
begin
  if to_regprocedure('public.check_serviceable_pincode(text,text,text,text,text)') is null then
    raise exception 'FAIL [fn] check_serviceable_pincode';
  end if;
  if to_regprocedure('public.search_serviceable_pincode(text,text,integer)') is null then
    raise exception 'FAIL [fn] search_serviceable_pincode';
  end if;
  if to_regprocedure('public.list_serviceable_routes(text,text,integer,integer)') is null then
    raise exception 'FAIL [fn] list_serviceable_routes';
  end if;
  raise notice 'PASS [structure]';
end $$;

do $$
declare
  v_t uuid := current_setting('sp.tenant')::uuid;
  v_branch uuid; v_uid uuid; v_gid uuid;
  v_pt uuid; v_prod uuid; v_prod_dox uuid;
  v_orig uuid; v_dest uuid; v_zone uuid; v_zone2 uuid;
  v_vendor uuid; v_state uuid;
begin
  select id into v_branch from public.branches
   where tenant_id = v_t and deleted_at is null
   order by case when is_head_office then 0 else 1 end limit 1;

  insert into public.states (tenant_id, code, name)
  values (v_t, 'TS', 'Telangana') on conflict do nothing;
  select id into v_state from public.states where tenant_id = v_t and code = 'TS';

  insert into public.product_types (tenant_id, code, name)
  values (v_t, 'PT1', 'Express Type') on conflict do nothing;
  select id into v_pt from public.product_types where tenant_id = v_t and code = 'PT1';

  insert into public.products (tenant_id, code, name, product_type_id, shipment_type, status)
  values (v_t, 'SPX', 'Express', v_pt, 'NDOX', 'ACTIVE'),
         (v_t, 'DOX1', 'Document', v_pt, 'DOX', 'ACTIVE')
  on conflict do nothing;
  select id into v_prod from public.products where tenant_id = v_t and code = 'SPX';
  select id into v_prod_dox from public.products where tenant_id = v_t and code = 'DOX1';

  insert into public.destinations (tenant_id, code, name, status)
  values (v_t, 'HYD', 'Hyderabad', 'ACTIVE'),
         (v_t, 'BLR', 'Bangalore', 'ACTIVE'),
         (v_t, 'DEAD', 'Dead City', 'INACTIVE')
  on conflict do nothing;
  select id into v_orig from public.destinations where tenant_id = v_t and code = 'HYD';
  select id into v_dest from public.destinations where tenant_id = v_t and code = 'BLR';

  insert into public.zones (tenant_id, code, name)
  values (v_t, 'Z1', 'Zone 1'), (v_t, 'Z2', 'Zone 2')
  on conflict do nothing;
  select id into v_zone from public.zones where tenant_id = v_t and code = 'Z1';
  select id into v_zone2 from public.zones where tenant_id = v_t and code = 'Z2';
  update public.destinations set zone_id = v_zone where id = v_dest;

  insert into public.vendors (tenant_id, code, name, mobile, status)
  values (v_t, 'VND1', 'Vendor One', '9000000054', 'ACTIVE')
  on conflict do nothing;
  select id into v_vendor from public.vendors where tenant_id = v_t and code = 'VND1';

  insert into public.zone_mappings (
    tenant_id, origin_destination_id, destination_id, product_id, zone_id, effective_date)
  values (v_t, v_orig, v_dest, v_prod, v_zone, current_date - 30);

  insert into public.service_mappings (
    tenant_id, vendor_id, service, service_type, billing_vendor_id, status)
  values (v_t, v_vendor, 'EXPRESS', 'AIR', v_vendor, 'ACTIVE')
  on conflict do nothing;

  -- Active serviceable origin / destination pins
  insert into public.pincodes (
    tenant_id, pin_code, pin_name, branch_id, destination_id, zone_id, state_id,
    vendor_id, is_serviceable, is_oda, pickup_available)
  values
    (v_t, '500001', 'Hyderabad HO', v_branch, v_orig, v_zone2, v_state,
     null, true, false, true),
    (v_t, '560001', 'Bangalore MG', v_branch, v_dest, v_zone, v_state,
     v_vendor, true, true, false),
    (v_t, '560099', 'Non Service Area', v_branch, v_dest, v_zone, v_state,
     v_vendor, false, false, false),
    (v_t, '599999', 'No Dest Pin', v_branch, null, null, v_state,
     null, true, false, false)
  on conflict do nothing;

  -- Inactive destination pin
  insert into public.pincodes (
    tenant_id, pin_code, pin_name, branch_id, destination_id, zone_id, state_id,
    is_serviceable)
  select v_t, '111222', 'Dead Pin', v_branch, d.id, v_zone, v_state, true
    from public.destinations d
   where d.tenant_id = v_t and d.code = 'DEAD'
  on conflict do nothing;

  insert into public.tenant_users (tenant_id, user_id, role, status)
  values (v_t, '99999999-1111-4111-8111-00000000d054', 'MEMBER', 'ACTIVE')
  on conflict (tenant_id, user_id) do update set status = 'ACTIVE';

  insert into public.users (
    tenant_id, auth_user_id, username, user_type, full_name, email, home_branch_id, status)
  values (
    v_t, '99999999-1111-4111-8111-00000000d054', 'svcstaff', 'STAFF',
    'Svc Staff', 'svcstaff@a.test', v_branch, 'ACTIVE')
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
     and pm.slug = 'utl.serviceable-pincode';

  perform set_config('sp.prod', v_prod::text, false);
  raise notice 'PASS [seed]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000054';

do $$
declare
  v_r jsonb;
  v_search jsonb;
  v_routes jsonb;
begin
  -- Happy path
  v_r := public.check_serviceable_pincode('500001', '560001', 'SPX', 'NDOX', 'EXPRESS');
  if (v_r->>'serviceable')::boolean is not true then
    raise exception 'FAIL [serviceable] %', v_r;
  end if;
  if v_r->'destination_zone'->>'code' is distinct from 'Z1' then
    raise exception 'FAIL [dest zone] %', v_r->'destination_zone';
  end if;
  if v_r->'destination_master'->>'code' is distinct from 'BLR' then
    raise exception 'FAIL [dest master]';
  end if;
  if v_r->'service_center' is null then
    raise exception 'FAIL [service center]';
  end if;
  if coalesce((v_r->>'is_oda')::boolean, false) is not true then
    raise exception 'FAIL [oda]';
  end if;
  if jsonb_array_length(v_r->'routing') < 1 then
    raise exception 'FAIL [routing]';
  end if;

  -- Unknown pincode
  v_r := public.check_serviceable_pincode('500001', '000000', null, null, null);
  if (v_r->>'serviceable')::boolean is not false
     or v_r->>'failure_reason' not ilike '%Unknown destination%' then
    raise exception 'FAIL [unknown pin] %', v_r;
  end if;

  -- Non-serviceable flag
  v_r := public.check_serviceable_pincode('500001', '560099', null, null, null);
  if (v_r->>'serviceable')::boolean is not false
     or v_r->>'failure_reason' not ilike '%not serviceable%' then
    raise exception 'FAIL [non-serviceable] %', v_r;
  end if;

  -- No linked destination
  v_r := public.check_serviceable_pincode('500001', '599999', null, null, null);
  if (v_r->>'serviceable')::boolean is not false
     or v_r->>'failure_reason' not ilike '%no linked destination%' then
    raise exception 'FAIL [no dest] %', v_r;
  end if;

  -- Inactive destination
  v_r := public.check_serviceable_pincode('500001', '111222', null, null, null);
  if (v_r->>'serviceable')::boolean is not false
     or v_r->>'failure_reason' not ilike '%inactive%' then
    raise exception 'FAIL [inactive dest] %', v_r;
  end if;

  -- Product shipment type mismatch
  v_r := public.check_serviceable_pincode('500001', '560001', 'SPX', 'DOX', null);
  if (v_r->>'serviceable')::boolean is not false
     or v_r->>'failure_reason' not ilike '%shipment type%' then
    raise exception 'FAIL [product filter] %', v_r;
  end if;

  -- Unknown product
  v_r := public.check_serviceable_pincode('500001', '560001', 'NOPE', null, null);
  if (v_r->>'serviceable')::boolean is not false
     or v_r->>'failure_reason' not ilike '%Unknown product%' then
    raise exception 'FAIL [unknown product] %', v_r;
  end if;

  -- Search by pincode
  v_search := public.search_serviceable_pincode('560', 'pincode', 50);
  if (v_search->>'total')::int < 1 then raise exception 'FAIL [search pin]'; end if;

  -- Search by name
  v_search := public.search_serviceable_pincode('Bangalore', 'name', 50);
  if (v_search->>'total')::int < 1 then raise exception 'FAIL [search name]'; end if;

  -- Routes browse
  v_routes := public.list_serviceable_routes('560001', 'SPX', 1, 20);
  if (v_routes->>'total')::int < 1 then raise exception 'FAIL [routes]'; end if;

  raise notice 'PASS [lookup / zone / product / active / accuracy]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000d054';
do $$
begin
  begin
    perform public.search_serviceable_pincode('560', 'pincode', 10);
    raise exception 'FAIL [perm]';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'PASS [permissions]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000b054';
do $$
declare v_r jsonb;
begin
  v_r := public.search_serviceable_pincode('560', 'pincode', 50);
  if (v_r->>'total')::int <> 0 then raise exception 'FAIL [tenant search]'; end if;
  v_r := public.check_serviceable_pincode('500001', '560001', null, null, null);
  if (v_r->>'serviceable')::boolean is not false
     or v_r->>'failure_reason' not ilike '%Unknown%' then
    raise exception 'FAIL [tenant check] %', v_r;
  end if;
  raise notice 'PASS [tenant isolation]';
end $$;

reset role;
do $$
begin
  raise notice '==========================================================';
  raise notice 'SERVICEABLE PINCODE VERIFICATION PASSED.';
  raise notice '==========================================================';
end $$;

rollback;
