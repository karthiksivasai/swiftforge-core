-- ===========================================================================
-- dashboard_rollups_verification.sql — Phase 5 Milestone 5F (0047).
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000047','authenticated','authenticated','dash@a.test'),
  ('99999999-1111-4111-8111-00000000b047','authenticated','authenticated','dash@b.test'),
  ('99999999-1111-4111-8111-00000000d047','authenticated','authenticated','dashstaff@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid; v_tb uuid;
begin
  v_t := app.bootstrap_tenant('dash-a', 'Dash A', 'DashA');
  perform app.link_tenant_admin(v_t, '99999999-1111-4111-8111-000000000047',
          'dashadm', 'Dash Admin', 'dash@a.test');
  perform set_config('dash.tenant', v_t::text, false);

  v_tb := app.bootstrap_tenant('dash-b', 'Dash B', 'DashB');
  perform app.link_tenant_admin(v_tb, '99999999-1111-4111-8111-00000000b047',
          'dashadmb', 'Dash Admin B', 'dash@b.test');
  perform set_config('dash.tenant_b', v_tb::text, false);
end $$;

do $$
begin
  if to_regclass('public.daily_branch_stats') is null then raise exception 'FAIL [table] branch'; end if;
  if to_regclass('public.daily_customer_stats') is null then raise exception 'FAIL [table] customer'; end if;
  if to_regprocedure('public.refresh_dashboard_rollups(date,date)') is null then
    raise exception 'FAIL [fn] refresh';
  end if;
  if to_regprocedure('public.get_dashboard_summary(date,uuid)') is null then
    raise exception 'FAIL [fn] summary';
  end if;
  if to_regprocedure('public.get_dashboard_operations_series(date,date,uuid)') is null then
    raise exception 'FAIL [fn] series';
  end if;
  raise notice 'PASS [structure]';
end $$;

do $$
declare
  v_t uuid := current_setting('dash.tenant')::uuid;
  v_branch uuid; v_cust uuid; v_pt uuid; v_prod uuid; v_dest uuid;
  v_uid uuid; v_gid uuid;
begin
  select id into v_branch from public.branches
   where tenant_id = v_t and deleted_at is null
   order by case when is_head_office then 0 else 1 end limit 1;

  insert into public.product_types (tenant_id, code, name)
  values (v_t, 'DPT', 'Dash PT') on conflict do nothing;
  select id into v_pt from public.product_types where tenant_id = v_t and code = 'DPT';

  insert into public.products (tenant_id, code, name, product_type_id, status)
  values (v_t, 'DPX', 'Dash Express', v_pt, 'ACTIVE') on conflict do nothing;
  select id into v_prod from public.products where tenant_id = v_t and code = 'DPX';

  insert into public.customers (tenant_id, code, name, mobile, status)
  values (v_t, 'DASHCUST', 'Dash Customer', '9555555555', 'ACTIVE') on conflict do nothing;
  select id into v_cust from public.customers where tenant_id = v_t and code = 'DASHCUST';

  insert into public.destinations (tenant_id, code, name, status)
  values (v_t, 'DASHDEST', 'Dash Dest', 'ACTIVE') on conflict do nothing;
  select id into v_dest from public.destinations where tenant_id = v_t and code = 'DASHDEST';

  insert into public.shipments (
    tenant_id, awb_no, book_date, customer_id, product_id, destination_id,
    branch_id, pieces, charge_weight, current_status, grand_total)
  values
    (v_t, 'DASH-AWB-1', current_date, v_cust, v_prod, v_dest, v_branch, 1, 1, 'BOOKED', 100),
    (v_t, 'DASH-AWB-D', current_date, v_cust, v_prod, v_dest, v_branch, 1, 1, 'DELIVERED', 80);

  update public.shipments
     set delivered_at = now(), status_at = now()
   where tenant_id = v_t and awb_no = 'DASH-AWB-D';

  insert into public.pickups (
    tenant_id, pickup_no, pickup_date, customer_id, mobile_no, branch_id, status)
  values
    (v_t, 900047, current_date, v_cust, '9555555555', v_branch, 'OPEN'),
    (v_t, 900048, current_date, v_cust, '9555555555', v_branch, 'CONFIRMED');

  insert into public.manifests (
    tenant_id, manifest_no, manifest_date, origin_branch_id, status)
  values (v_t, 'DASH-MAN-1', current_date, v_branch, 'DRAFT');

  insert into public.drs (
    tenant_id, drs_no, drs_date, branch_id, status)
  values (v_t, 'DASH-DRS-1', current_date, v_branch, 'DRAFT');

  insert into public.pod_records (
    tenant_id, shipment_id, awb_no, pod_date, receiver_name, status, source)
  select v_t, s.id, s.awb_no, current_date, 'Recv', 'DELIVERED', 'MANUAL'
    from public.shipments s where s.tenant_id = v_t and s.awb_no = 'DASH-AWB-D';

  insert into public.receipts (
    tenant_id, receipt_no, receipt_date, customer_id, branch_id, mode, amount, status)
  values (v_t, 'DASH-RCP-1', current_date, v_cust, v_branch, 'CASH', 250, 'POSTED');

  insert into public.expense_entries (
    tenant_id, entry_no, kind, entry_date, mode, branch_id, amount, authorization_status, description)
  values (v_t, 'DASH-EXP-1', 'EXPENSE', current_date, 'CASH', v_branch, 40, 'UNAUTHORIZED', 'misc');

  insert into public.customer_payments (
    tenant_id, customer_id, declared_date, amount, status)
  values (v_t, v_cust, current_date, 90, 'PENDING');

  insert into public.tenant_users (tenant_id, user_id, role, status)
  values (v_t, '99999999-1111-4111-8111-00000000d047', 'MEMBER', 'ACTIVE')
  on conflict (tenant_id, user_id) do update set status = 'ACTIVE';

  insert into public.users (
    tenant_id, auth_user_id, username, user_type, full_name, email, home_branch_id, status)
  values (
    v_t, '99999999-1111-4111-8111-00000000d047', 'dashstaff', 'STAFF',
    'Dash Staff', 'dashstaff@a.test', v_branch, 'ACTIVE')
  on conflict (auth_user_id) do update set deleted_at = null
  returning id into v_uid;

  select id into v_gid from public.user_groups
   where tenant_id = v_t and name = 'OPERATIONS' and deleted_at is null;
  insert into public.user_group_members (tenant_id, user_id, group_id)
  values (v_t, v_uid, v_gid) on conflict (user_id, group_id) do nothing;

  update public.group_permissions gp
     set can_list = false, can_search = false, all_access = false
    from public.permission_modules pm
   where gp.module_id = pm.id and gp.group_id = v_gid
     and pm.slug in ('txn.opertation-dashboard','txn.sales-dashboard');

  raise notice 'PASS [seed]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000047';

do $$
declare
  v_sum jsonb;
  v_ref jsonb;
  v_series jsonb;
  v_ops jsonb;
begin
  v_sum := public.get_dashboard_summary(current_date, null);
  v_ops := v_sum->'operations';
  if (v_ops->>'shipments_today')::int < 2 then raise exception 'FAIL [shipments]'; end if;
  if (v_ops->>'pickups_today')::int < 2 then raise exception 'FAIL [pickups]'; end if;
  if (v_ops->>'deliveries_today')::int < 1 then raise exception 'FAIL [deliveries]'; end if;
  if (v_ops->>'pods_today')::int < 1 then raise exception 'FAIL [pods]'; end if;
  if (v_ops->>'pending_drs')::int < 1 then raise exception 'FAIL [pending drs]'; end if;
  if (v_ops->>'pending_manifest')::int < 1 then raise exception 'FAIL [pending man]'; end if;
  if (v_ops->>'pending_pickup')::int < 1 then raise exception 'FAIL [pending pickup]'; end if;
  if (v_sum->'finance'->>'receipts_today')::int < 1 then raise exception 'FAIL [receipts]'; end if;
  if (v_sum->'finance'->>'pending_customer_payments')::int < 1 then raise exception 'FAIL [payments]'; end if;
  if (v_sum->'customers'->>'active_customers')::int < 1 then raise exception 'FAIL [customers]'; end if;

  v_ref := public.refresh_dashboard_rollups(current_date, current_date);
  if (v_ref->>'branch_rows_touched')::int < 1 then raise exception 'FAIL [refresh branch]'; end if;
  if (v_ref->>'customer_rows_touched')::int < 1 then raise exception 'FAIL [refresh cust]'; end if;

  if not exists (
    select 1 from public.daily_branch_stats
     where tenant_id = current_setting('dash.tenant')::uuid
       and stat_date = current_date and bookings >= 2
  ) then
    raise exception 'FAIL [rollup correctness]';
  end if;

  if not exists (
    select 1 from public.daily_customer_stats
     where tenant_id = current_setting('dash.tenant')::uuid
       and stat_date = current_date and bookings >= 2
  ) then
    raise exception 'FAIL [customer rollup]';
  end if;

  v_series := public.get_dashboard_operations_series(current_date, current_date, null);
  if jsonb_array_length(v_series->'series') < 1 then raise exception 'FAIL [series]'; end if;

  raise notice 'PASS [KPI / refresh / rollups / series]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000d047';
do $$
begin
  begin
    perform public.get_dashboard_summary(current_date, null);
    raise exception 'FAIL [perm]';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'PASS [permissions]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000b047';
do $$
declare v_sum jsonb;
begin
  v_sum := public.get_dashboard_summary(current_date, null);
  if (v_sum->'operations'->>'shipments_today')::int <> 0 then
    raise exception 'FAIL [tenant leak]';
  end if;
  raise notice 'PASS [tenant isolation]';
end $$;

reset role;
do $$
begin
  raise notice '==========================================================';
  raise notice 'DASHBOARD ROLLUPS VERIFICATION PASSED.';
  raise notice '==========================================================';
end $$;

rollback;
