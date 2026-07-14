-- ===========================================================================
-- rating_engine_verification.sql — Phase 4 Milestone 4H (0041).
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000041','authenticated','authenticated','rate@a.test'),
  ('99999999-1111-4111-8111-00000000b041','authenticated','authenticated','rate@b.test'),
  ('99999999-1111-4111-8111-00000000d041','authenticated','authenticated','ratestaff@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid; v_tb uuid;
begin
  v_t := app.bootstrap_tenant('rate-a', 'Rating A', 'RateA');
  perform app.link_tenant_admin(v_t, '99999999-1111-4111-8111-000000000041',
          'rateadm', 'Rating Admin', 'rate@a.test');
  perform set_config('rt.tenant', v_t::text, false);

  v_tb := app.bootstrap_tenant('rate-b', 'Rating B', 'RateB');
  perform app.link_tenant_admin(v_tb, '99999999-1111-4111-8111-00000000b041',
          'rateadmb', 'Rating Admin B', 'rate@b.test');
  perform set_config('rt.tenant_b', v_tb::text, false);
end $$;

do $$
begin
  if to_regclass('public.customer_rates') is null then raise exception 'FAIL [table]: customer_rates'; end if;
  if to_regclass('public.zone_mappings') is null then raise exception 'FAIL [table]: zone_mappings'; end if;
  if to_regclass('public.fuel_surcharge_rates') is null then raise exception 'FAIL [table]: fuel_surcharge_rates'; end if;
  if to_regclass('public.tax_rates') is null then raise exception 'FAIL [table]: tax_rates'; end if;
  if to_regclass('public.rating_audit') is null then raise exception 'FAIL [table]: rating_audit'; end if;
  if to_regclass('public.shipment_charge_snapshots') is null then raise exception 'FAIL [table]: snapshots'; end if;
  if to_regprocedure('public.calculate_shipment_rating(uuid)') is null then raise exception 'FAIL [fn]: calculate'; end if;
  if to_regprocedure('public.recalculate_shipment_rating(uuid,integer)') is null then raise exception 'FAIL [fn]: recalculate'; end if;
  if to_regprocedure('public.get_rating_breakdown(uuid)') is null then raise exception 'FAIL [fn]: breakdown'; end if;
  raise notice 'PASS [structure]';
end $$;

-- seed masters under service role
do $$
declare
  v_t uuid := current_setting('rt.tenant')::uuid;
  v_pt uuid; v_prod uuid; v_cust uuid; v_orig uuid; v_dest uuid; v_zone uuid;
  v_vendor uuid; v_branch uuid; v_state_a uuid; v_state_b uuid;
  v_vc uuid; v_uid uuid; v_gid uuid;
begin
  select id into v_branch from public.branches
   where tenant_id = v_t and deleted_at is null
   order by case when is_head_office then 0 else 1 end limit 1;

  insert into public.states (tenant_id, code, name)
  values (v_t, 'TS', 'Telangana'), (v_t, 'KA', 'Karnataka')
  on conflict do nothing;
  select id into v_state_a from public.states where tenant_id = v_t and code = 'TS';
  select id into v_state_b from public.states where tenant_id = v_t and code = 'KA';

  update public.branches set state_code = 'TS' where id = v_branch;

  insert into public.product_types (tenant_id, code, name)
  values (v_t, 'PT1', 'Express Type') on conflict do nothing;
  select id into v_pt from public.product_types where tenant_id = v_t and code = 'PT1';

  insert into public.products (tenant_id, code, name, product_type_id, status)
  values (v_t, 'SPX', 'Express', v_pt, 'ACTIVE') on conflict do nothing;
  select id into v_prod from public.products where tenant_id = v_t and code = 'SPX';

  insert into public.customers (
    tenant_id, code, name, mobile, status, billing_state_id, fuel_surcharge, tax)
  values (v_t, 'CUST1', 'Client One', '9000000001', 'ACTIVE', v_state_a, true, true)
  on conflict do nothing;
  select id into v_cust from public.customers where tenant_id = v_t and code = 'CUST1';
  update public.customers set billing_state_id = v_state_a, fuel_surcharge = true, tax = true
   where id = v_cust;

  insert into public.destinations (tenant_id, code, name, status)
  values (v_t, 'HYD', 'Hyderabad', 'ACTIVE'),
         (v_t, 'BLR', 'Bangalore', 'ACTIVE')
  on conflict do nothing;
  select id into v_orig from public.destinations where tenant_id = v_t and code = 'HYD';
  select id into v_dest from public.destinations where tenant_id = v_t and code = 'BLR';

  insert into public.zones (tenant_id, code, name)
  values (v_t, 'Z1', 'Zone 1') on conflict do nothing;
  select id into v_zone from public.zones where tenant_id = v_t and code = 'Z1';

  update public.destinations set zone_id = v_zone where id = v_dest;

  insert into public.vendors (tenant_id, code, name, mobile, status)
  values (v_t, 'VND1', 'Vendor One', '9000000002', 'ACTIVE') on conflict do nothing;
  select id into v_vendor from public.vendors where tenant_id = v_t and code = 'VND1';

  insert into public.zone_mappings (
    tenant_id, origin_destination_id, destination_id, product_id, zone_id, effective_date)
  values (v_t, v_orig, v_dest, v_prod, v_zone, current_date - 30);

  insert into public.customer_rates (
    tenant_id, customer_id, product_id, service, origin_destination_id, destination_id,
    zone_id, from_date, min_weight, rate_per_kg, fuel_pct, other_charges, status)
  values (
    v_t, v_cust, v_prod, 'EXPRESS', v_orig, v_dest, v_zone,
    current_date - 30, 0.5, 100.00, 10.00, 0, 'ACTIVE');

  insert into public.charges (
    tenant_id, code, name, base_on, charge_type, charge_rate, apply_fuel, apply_tax, sequence)
  values (v_t, 'ODA', 'ODA Charges', 'Flat', 'AIRWAYBILL', 50, false, true, 10)
  on conflict do nothing;

  insert into public.fuel_surcharge_rates (
    tenant_id, entry_code, customer_id, product_id, from_date, percentage)
  values (v_t, 'FUEL1', v_cust, v_prod, current_date - 30, 12.00);

  insert into public.tax_rates (
    tenant_id, customer_id, product_id, from_date, igst_pct, cgst_pct, sgst_pct)
  values (v_t, v_cust, v_prod, current_date - 30, 18, 9, 9);

  insert into public.vendor_contracts (
    tenant_id, contract_no, from_date, vendor_id, product_id,
    origin_destination_id, destination_id, zone_id, service, unit, status)
  values (
    v_t, 'VC-1', current_date - 30, v_vendor, v_prod,
    v_orig, v_dest, v_zone, 'EXPRESS', 'KG', 'ACTIVE')
  returning id into v_vc;

  insert into public.vendor_contract_slabs (tenant_id, contract_id, seq, rate_type, weight, rate)
  values (v_t, v_vc, 1, 'PER_KG', 0, 40.00),
         (v_t, v_vc, 2, 'MINIMUM', 0, 25.00);

  -- staff without awb modify for permission test
  insert into public.tenant_users (tenant_id, user_id, role, status)
  values (v_t, '99999999-1111-4111-8111-00000000d041', 'MEMBER', 'ACTIVE')
  on conflict (tenant_id, user_id) do update set status = 'ACTIVE';

  insert into public.users (
    tenant_id, auth_user_id, username, user_type, full_name, email, home_branch_id, status)
  values (
    v_t, '99999999-1111-4111-8111-00000000d041', 'ratestaff', 'STAFF',
    'Rate Staff', 'ratestaff@a.test', v_branch, 'ACTIVE')
  on conflict (auth_user_id) do update set deleted_at = null
  returning id into v_uid;

  select id into v_gid from public.user_groups
   where tenant_id = v_t and name = 'OPERATIONS' and deleted_at is null;
  insert into public.user_group_members (tenant_id, user_id, group_id)
  values (v_t, v_uid, v_gid) on conflict (user_id, group_id) do nothing;

  update public.group_permissions gp
     set can_modify = false, can_add = false, all_access = false
    from public.permission_modules pm
   where gp.module_id = pm.id and gp.group_id = v_gid and pm.slug = 'txn.awb-entry';

  perform set_config('rt.prod', v_prod::text, false);
  perform set_config('rt.cust', v_cust::text, false);
  perform set_config('rt.orig', v_orig::text, false);
  perform set_config('rt.dest', v_dest::text, false);
  perform set_config('rt.vendor', v_vendor::text, false);
  perform set_config('rt.branch', coalesce(v_branch::text,''), false);
  raise notice 'PASS [seed]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000041';

-- create shipment + calculate rating
do $$
declare
  v_s public.shipments;
  v_r jsonb;
  v_freight numeric; v_fuel numeric; v_tax numeric; v_other numeric; v_vendor numeric; v_total numeric;
  v_cnt int;
begin
  v_s := public.save_shipment(
    null, null,
    jsonb_build_object(
      'customer_code', 'CUST1',
      'product_code', 'SPX',
      'vendor_code', 'VND1',
      'origin_code', 'HYD',
      'destination_code', 'BLR',
      'service', 'EXPRESS',
      'book_date', current_date::text,
      'pieces', '1',
      'actual_weight', '2',
      'charge_weight', '2',
      'branch_code', 'HO'
    ),
    jsonb_build_array(jsonb_build_object('pieces','1','actual_weight_per_pc','2','charge_weight','2')),
    '[]'::jsonb);

  perform set_config('rt.ship', v_s.id::text, false);
  perform set_config('rt.rv', v_s.row_version::text, false);

  v_r := public.calculate_shipment_rating(v_s.id);

  -- weight 2, rate 100 → freight 200; ODA 50 → other 50; fuel 12% of 250 = 30
  -- same state TS → CGST+SGST 9+9 on 280 = 50.4; vendor 2*40=80
  v_freight := (v_r->>'freight')::numeric;
  v_other := (v_r->>'other_charges')::numeric;
  v_fuel := (v_r->>'fuel')::numeric;
  v_tax := (v_r->>'tax')::numeric;
  v_vendor := (v_r->>'vendor_cost')::numeric;
  v_total := (v_r->>'total')::numeric;

  if v_freight <> 200 then raise exception 'FAIL [freight] got %', v_freight; end if;
  if v_other < 50 then raise exception 'FAIL [other] got %', v_other; end if;
  if v_fuel <> 30 then raise exception 'FAIL [fuel] got %', v_fuel; end if;
  if v_tax <> 50.40 then raise exception 'FAIL [tax] got %', v_tax; end if;
  if v_vendor <> 80 then raise exception 'FAIL [vendor] got %', v_vendor; end if;
  if v_total <> (v_freight + v_other + v_fuel + v_tax) then
    raise exception 'FAIL [total]';
  end if;

  select count(*) into v_cnt from public.shipment_charge_snapshots
   where shipment_id = v_s.id and charges_type = 'SYSTEM';
  if v_cnt < 2 then raise exception 'FAIL [snapshot] count %', v_cnt; end if;

  select count(*) into v_cnt from public.rating_audit where shipment_id = v_s.id;
  if v_cnt < 1 then raise exception 'FAIL [audit]'; end if;

  raise notice 'PASS [calculate + snapshot + audit]';
end $$;

-- lane / customer rate specificity (destination+service beats destination-only)
do $$
declare
  v_t uuid := current_setting('rt.tenant')::uuid;
  v_cust uuid := current_setting('rt.cust')::uuid;
  v_prod uuid := current_setting('rt.prod')::uuid;
  v_orig uuid := current_setting('rt.orig')::uuid;
  v_dest uuid := current_setting('rt.dest')::uuid;
  v_zone uuid;
  v_r public.customer_rates;
begin
  select zone_id into v_zone from public.destinations where id = v_dest;

  -- weaker match (product only)
  insert into public.customer_rates (
    tenant_id, customer_id, product_id, from_date, min_weight, rate_per_kg, status)
  values (v_t, v_cust, v_prod, current_date - 5, 0, 50, 'ACTIVE');

  v_r := app.resolve_customer_rate(
    v_t, v_cust, v_prod, 'EXPRESS', v_orig, v_dest, v_zone, current_date);
  -- seeded lane-specific rate (100) must beat product-only (50)
  if v_r.rate_per_kg < 100 then
    raise exception 'FAIL [lane-specificity] got %', v_r.rate_per_kg;
  end if;
  raise notice 'PASS [customer rate / lane specificity]';
end $$;

-- recalculate + optimistic lock
do $$
declare
  v_id uuid := current_setting('rt.ship')::uuid;
  v_rv integer;
  v_r jsonb;
begin
  select row_version into v_rv from public.shipments where id = v_id;
  begin
    perform public.recalculate_shipment_rating(v_id, v_rv - 1);
    raise exception 'FAIL [optlock]';
  exception when sqlstate '40001' then null;
  end;

  v_r := public.recalculate_shipment_rating(v_id, v_rv);
  if (v_r->>'rating_version')::int < 2 then
    raise exception 'FAIL [recalc version]';
  end if;
  raise notice 'PASS [recalculate + optimistic locking]';
end $$;

-- locked / invoiced reject
do $$
declare
  v_id uuid := current_setting('rt.ship')::uuid;
  v_rv integer;
begin
  update public.shipments set is_locked = true where id = v_id
    returning row_version into v_rv;
  begin
    perform public.recalculate_shipment_rating(v_id, v_rv);
    raise exception 'FAIL [locked]';
  exception when sqlstate 'CMS04' then null;
  end;

  update public.shipments set is_locked = false, invoice_id = gen_random_uuid()
   where id = v_id returning row_version into v_rv;
  begin
    perform public.recalculate_shipment_rating(v_id, v_rv);
    raise exception 'FAIL [invoiced]';
  exception when sqlstate 'CMS04' then null;
  end;

  update public.shipments set invoice_id = null where id = v_id;
  raise notice 'PASS [recalc guards locked/invoiced]';
end $$;

-- booking invokes rating
do $$
declare
  v_s public.shipments;
  v_booked public.shipments;
begin
  v_s := public.save_shipment(
    null, null,
    jsonb_build_object(
      'customer_code', 'CUST1',
      'product_code', 'SPX',
      'vendor_code', 'VND1',
      'origin_code', 'HYD',
      'destination_code', 'BLR',
      'service', 'EXPRESS',
      'book_date', current_date::text,
      'pieces', '1',
      'actual_weight', '1',
      'charge_weight', '1',
      'branch_code', 'HO'
    ),
    jsonb_build_array(jsonb_build_object('pieces','1','actual_weight_per_pc','1','charge_weight','1')),
    '[]'::jsonb);

  v_booked := public.confirm_booking(v_s.id, v_s.row_version);
  if v_booked.current_status <> 'BOOKED' then raise exception 'FAIL [book status]'; end if;
  if coalesce(v_booked.grand_total,0) <= 0 then raise exception 'FAIL [book rating]'; end if;
  if coalesce(v_booked.rating_version,0) < 1 then raise exception 'FAIL [book version]'; end if;
  raise notice 'PASS [booking invokes rating]';
end $$;

-- get_rating_breakdown
do $$
declare
  v_id uuid := current_setting('rt.ship')::uuid;
  v_b jsonb;
begin
  v_b := public.get_rating_breakdown(v_id);
  if v_b->>'freight' is null then raise exception 'FAIL [breakdown]'; end if;
  if jsonb_typeof(v_b->'snapshot') <> 'array' then raise exception 'FAIL [breakdown snapshot]'; end if;
  raise notice 'PASS [get_rating_breakdown]';
end $$;

-- future rate change does not mutate existing snapshot without recalc
do $$
declare
  v_t uuid := current_setting('rt.tenant')::uuid;
  v_id uuid := current_setting('rt.ship')::uuid;
  v_before numeric;
  v_after numeric;
begin
  select grand_total into v_before from public.shipments where id = v_id;
  update public.customer_rates set rate_per_kg = 999
   where tenant_id = v_t and deleted_at is null;
  select grand_total into v_after from public.shipments where id = v_id;
  if v_before is distinct from v_after then
    raise exception 'FAIL [immutability]';
  end if;
  raise notice 'PASS [snapshot immutability]';
end $$;

-- permission enforcement
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000d041';
do $$
begin
  begin
    perform public.calculate_shipment_rating(current_setting('rt.ship')::uuid);
    raise exception 'FAIL [perm]';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'PASS [permission-enforcement]';
end $$;

-- tenant isolation
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000b041';
do $$
begin
  begin
    perform public.calculate_shipment_rating(current_setting('rt.ship')::uuid);
    raise exception 'FAIL [tenant]';
  exception
    when sqlstate 'P0002' then null;
    when sqlstate '42501' then null;
  end;
  raise notice 'PASS [tenant-isolation / RLS]';
end $$;

reset role;
do $$
begin
  raise notice '==========================================================';
  raise notice 'RATING ENGINE VERIFICATION PASSED.';
  raise notice '==========================================================';
end $$;

rollback;
