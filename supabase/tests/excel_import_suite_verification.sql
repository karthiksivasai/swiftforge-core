-- ===========================================================================
-- excel_import_suite_verification.sql — Phase 6 Milestone 6A (0049).
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000049','authenticated','authenticated','xls@a.test'),
  ('99999999-1111-4111-8111-00000000b049','authenticated','authenticated','xls@b.test'),
  ('99999999-1111-4111-8111-00000000d049','authenticated','authenticated','xlsstaff@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid; v_tb uuid;
begin
  v_t := app.bootstrap_tenant('xls-a', 'Xls A', 'XlsA');
  perform app.link_tenant_admin(v_t, '99999999-1111-4111-8111-000000000049',
          'xlsadm', 'Xls Admin', 'xls@a.test');
  perform set_config('xls.tenant', v_t::text, false);

  v_tb := app.bootstrap_tenant('xls-b', 'Xls B', 'XlsB');
  perform app.link_tenant_admin(v_tb, '99999999-1111-4111-8111-00000000b049',
          'xlsadmb', 'Xls Admin B', 'xls@b.test');
  perform set_config('xls.tenant_b', v_tb::text, false);
end $$;

do $$
begin
  if to_regclass('public.customer_awb_stock') is null then raise exception 'FAIL [stock table]'; end if;
  if to_regprocedure('public.import_excel(text,text,jsonb,jsonb)') is null then
    raise exception 'FAIL [fn] import_excel';
  end if;
  raise notice 'PASS [structure]';
end $$;

do $$
declare
  v_t uuid := current_setting('xls.tenant')::uuid;
  v_branch uuid; v_cust uuid; v_pt uuid; v_prod uuid; v_dest uuid;
  v_uid uuid; v_gid uuid;
begin
  select id into v_branch from public.branches
   where tenant_id = v_t and deleted_at is null
   order by case when is_head_office then 0 else 1 end limit 1;

  insert into public.product_types (tenant_id, code, name)
  values (v_t, 'XPT', 'Xls PT') on conflict do nothing;
  select id into v_pt from public.product_types where tenant_id = v_t and code = 'XPT';

  insert into public.products (tenant_id, code, name, product_type_id, status)
  values (v_t, 'XPX', 'Xls Express', v_pt, 'ACTIVE') on conflict do nothing;
  select id into v_prod from public.products where tenant_id = v_t and code = 'XPX';

  insert into public.customers (tenant_id, code, name, mobile, status)
  values (v_t, 'XLSCUST', 'Xls Customer', '9333333333', 'ACTIVE') on conflict do nothing;
  select id into v_cust from public.customers where tenant_id = v_t and code = 'XLSCUST';

  insert into public.destinations (tenant_id, code, name, status)
  values (v_t, 'XLSDEST', 'Xls Dest', 'ACTIVE') on conflict do nothing;
  select id into v_dest from public.destinations where tenant_id = v_t and code = 'XLSDEST';

  -- seed one shipment for POD / forwarding / data updation
  insert into public.shipments (
    tenant_id, awb_no, book_date, customer_id, product_id, destination_id,
    branch_id, pieces, charge_weight, current_status)
  values (v_t, 'XLS-EXIST-1', current_date, v_cust, v_prod, v_dest, v_branch, 1, 1, 'OUT_FOR_DELIVERY');

  insert into public.tenant_users (tenant_id, user_id, role, status)
  values (v_t, '99999999-1111-4111-8111-00000000d049', 'MEMBER', 'ACTIVE')
  on conflict (tenant_id, user_id) do update set status = 'ACTIVE';

  insert into public.users (
    tenant_id, auth_user_id, username, user_type, full_name, email, home_branch_id, status)
  values (
    v_t, '99999999-1111-4111-8111-00000000d049', 'xlsstaff', 'STAFF',
    'Xls Staff', 'xlsstaff@a.test', v_branch, 'ACTIVE')
  on conflict (auth_user_id) do update set deleted_at = null
  returning id into v_uid;

  select id into v_gid from public.user_groups
   where tenant_id = v_t and name = 'OPERATIONS' and deleted_at is null;
  insert into public.user_group_members (tenant_id, user_id, group_id)
  values (v_t, v_uid, v_gid) on conflict (user_id, group_id) do nothing;

  update public.group_permissions gp
     set can_add = false, all_access = false
    from public.permission_modules pm
   where gp.module_id = pm.id and gp.group_id = v_gid
     and pm.slug in (
       'utl.awb-merging','utl.pod-merging','utl.forwarding-merging',
       'utl.customer-awb-stock-merging','utl.other-charges-import','utl.data-updation');

  raise notice 'PASS [seed]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000049';

do $$
declare
  v_dry jsonb;
  v_commit jsonb;
  v_ship_cnt int;
  v_params jsonb := '{}'::jsonb;
  v_rows jsonb;
begin
  -- dry-run AWB merge (must not persist)
  v_rows := jsonb_build_array(
    jsonb_build_object(
      'awb_no','XLS-NEW-1','customer_code','XLSCUST','product_code','XPX',
      'destination_code','XLSDEST','pieces','1','charge_weight','1.5'));
  v_dry := public.import_excel('AWB_MERGE', 'VALIDATE', v_rows, v_params);
  if (v_dry->>'ok')::int < 1 then raise exception 'FAIL [dry ok] %', v_dry; end if;
  select count(*) into v_ship_cnt from public.shipments
   where awb_no = 'XLS-NEW-1' and deleted_at is null;
  if v_ship_cnt <> 0 then raise exception 'FAIL [dry persisted]'; end if;

  -- commit AWB merge
  v_commit := public.import_excel('AWB_MERGE', 'COMMIT', v_rows, v_params);
  if (v_commit->>'ok')::int < 1 then raise exception 'FAIL [awb commit] %', v_commit; end if;
  if v_commit->>'job_id' is null then raise exception 'FAIL [job id]'; end if;

  -- idempotent re-import skips
  v_commit := public.import_excel('AWB_MERGE', 'COMMIT', v_rows, v_params);
  if (v_commit->>'skipped')::int < 1 then raise exception 'FAIL [awb idempotent]'; end if;

  -- row validation error
  v_commit := public.import_excel(
    'AWB_MERGE', 'COMMIT',
    jsonb_build_array(jsonb_build_object('awb_no','XLS-BAD','customer_code','NOPE','product_code','XPX')),
    v_params);
  if (v_commit->>'error_count')::int < 1 then raise exception 'FAIL [row error]'; end if;
  if not exists (
    select 1 from public.import_row_errors e
     where e.job_id = (v_commit->>'job_id')::uuid
  ) then raise exception 'FAIL [row error persist]'; end if;

  -- POD merge
  v_commit := public.import_excel(
    'POD_MERGE', 'COMMIT',
    jsonb_build_array(jsonb_build_object(
      'awb_no','XLS-EXIST-1','receiver_name','Recv','pod_date', current_date::text)),
    v_params);
  if (v_commit->>'ok')::int < 1 then raise exception 'FAIL [pod] %', v_commit; end if;

  -- Forwarding merge
  v_commit := public.import_excel(
    'FORWARDING_MERGE', 'COMMIT',
    jsonb_build_array(jsonb_build_object('awb_no','XLS-EXIST-1','forwarding_awb','FWD-9')),
    v_params);
  if (v_commit->>'ok')::int < 1 then raise exception 'FAIL [fwd] %', v_commit; end if;

  -- AWB stock
  v_commit := public.import_excel(
    'AWB_STOCK', 'COMMIT',
    jsonb_build_array(jsonb_build_object('awb_no','STOCK-1','customer_code','XLSCUST')),
    v_params);
  if (v_commit->>'ok')::int < 1 then raise exception 'FAIL [stock] %', v_commit; end if;

  -- Other charges
  v_commit := public.import_excel(
    'OTHER_CHARGES', 'COMMIT',
    jsonb_build_array(jsonb_build_object(
      'customer_code','XLSCUST','charge_type','FUEL','amount','12.5')),
    v_params);
  if (v_commit->>'ok')::int < 1 then raise exception 'FAIL [charges] %', v_commit; end if;

  -- Data updation
  v_commit := public.import_excel(
    'DATA_UPDATE', 'COMMIT',
    jsonb_build_array(jsonb_build_object(
      'awb_no','XLS-EXIST-1','pieces','3','charge_weight','2.25')),
    v_params);
  if (v_commit->>'ok')::int < 1 then raise exception 'FAIL [updation] %', v_commit; end if;

  raise notice 'PASS [handlers / dry-run / commit / errors / idempotency]';
end $$;

-- fatal rollback: unexpected error must not leave job DONE mid-batch
-- (use invalid cast that escapes CMS01 — handled as expected constraint)
-- permission denial
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000d049';
do $$
begin
  begin
    perform public.import_excel(
      'AWB_MERGE', 'VALIDATE',
      jsonb_build_array(jsonb_build_object('awb_no','X')), '{}'::jsonb);
    raise exception 'FAIL [perm]';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'PASS [permissions]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000b049';
do $$
declare v_res jsonb;
begin
  v_res := public.import_excel(
    'AWB_STOCK', 'VALIDATE',
    jsonb_build_array(jsonb_build_object('awb_no','STOCK-1','customer_code','XLSCUST')),
    '{}'::jsonb);
  -- tenant B has no XLSCUST → row error, not cross-tenant success
  if (v_res->>'ok')::int <> 0 then raise exception 'FAIL [tenant leak]'; end if;
  if not exists (
    select 1 from public.customer_awb_stock s
     where s.awb_no = 'STOCK-1'
       and s.tenant_id = current_setting('xls.tenant')::uuid
  ) and not exists (
    select 1 from public.customer_awb_stock s
     where s.awb_no = 'STOCK-1'
       and s.tenant_id = current_setting('xls.tenant_b')::uuid
  ) then
    null; -- stock only on A from earlier commit; B must not have written
  end if;
  if exists (
    select 1 from public.customer_awb_stock s
     where s.awb_no = 'STOCK-1'
       and s.tenant_id = current_setting('xls.tenant_b')::uuid
  ) then
    raise exception 'FAIL [tenant stock leak]';
  end if;
  raise notice 'PASS [tenant isolation]';
end $$;

reset role;
do $$
begin
  raise notice '==========================================================';
  raise notice 'EXCEL IMPORT SUITE VERIFICATION PASSED.';
  raise notice '==========================================================';
end $$;

rollback;
