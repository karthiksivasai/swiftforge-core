-- ===========================================================================
-- finance_foundation_verification.sql — Phase 4 Milestone 4G (0040).
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000040','authenticated','authenticated','fin@a.test'),
  ('99999999-1111-4111-8111-00000000b040','authenticated','authenticated','fin@b.test'),
  ('99999999-1111-4111-8111-00000000c040','authenticated','authenticated','finchk@a.test'),
  ('99999999-1111-4111-8111-00000000d040','authenticated','authenticated','finstaff@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid; v_tb uuid;
begin
  v_t := app.bootstrap_tenant('fin-a', 'Finance A', 'FinA');
  perform app.link_tenant_admin(v_t, '99999999-1111-4111-8111-000000000040',
          'finadm', 'Finance Admin', 'fin@a.test');
  perform set_config('fin.tenant', v_t::text, false);

  v_tb := app.bootstrap_tenant('fin-b', 'Finance B', 'FinB');
  perform app.link_tenant_admin(v_tb, '99999999-1111-4111-8111-00000000b040',
          'finadmb', 'Finance Admin B', 'fin@b.test');
  perform set_config('fin.tenant_b', v_tb::text, false);
end $$;

do $$
begin
  if to_regclass('public.receipts') is null then raise exception 'FAIL [table]: receipts'; end if;
  if to_regclass('public.expense_entries') is null then raise exception 'FAIL [table]: expense_entries'; end if;
  if to_regclass('public.customer_payments') is null then raise exception 'FAIL [table]: customer_payments'; end if;
  if to_regclass('public.ledger_entries') is null then raise exception 'FAIL [table]: ledger_entries'; end if;
  if to_regprocedure('public.save_receipt(uuid,integer,jsonb)') is null then raise exception 'FAIL [fn]: save_receipt'; end if;
  if to_regprocedure('public.post_receipt(uuid,integer)') is null then raise exception 'FAIL [fn]: post_receipt'; end if;
  if to_regprocedure('public.save_expense(uuid,integer,jsonb)') is null then raise exception 'FAIL [fn]: save_expense'; end if;
  if to_regprocedure('public.authorize_expense(uuid,integer)') is null then raise exception 'FAIL [fn]: authorize_expense'; end if;
  if to_regprocedure('public.reject_expense(uuid,integer,text)') is null then raise exception 'FAIL [fn]: reject_expense'; end if;
  if to_regprocedure('public.save_customer_payment(uuid,integer,jsonb)') is null then raise exception 'FAIL [fn]: save_customer_payment'; end if;
  if to_regprocedure('public.approve_customer_payment(uuid,integer)') is null then raise exception 'FAIL [fn]: approve_customer_payment'; end if;
  if to_regprocedure('public.reject_customer_payment(uuid,integer,text)') is null then raise exception 'FAIL [fn]: reject_customer_payment'; end if;
  if not app.status_transition_allowed('RECEIPT','DRAFT','POSTED') then raise exception 'FAIL [status]: DRAFT->POSTED'; end if;
  if not app.status_transition_allowed('EXPENSE','UNAUTHORIZED','AUTHORIZED') then raise exception 'FAIL [status]: expense auth'; end if;
  raise notice 'PASS [structure]';
end $$;

-- seed masters + checker/staff users (service role — avoid tenant_users RLS recursion)
do $$
declare
  v_t uuid := current_setting('fin.tenant')::uuid;
  v_branch uuid;
  v_uid uuid;
  v_gid uuid;
begin
  insert into public.customers (tenant_id, code, name, mobile, status)
  values (v_t, 'CUST1', 'Client One', '9000000001', 'ACTIVE') on conflict do nothing;
  insert into public.banks (tenant_id, code, name, status)
  values (v_t, 'SBI', 'State Bank', 'ACTIVE') on conflict do nothing;
  insert into public.expense_heads (tenant_id, code, name, kind, status)
  values (v_t, 'OFFICE', 'Office Expenses', 'EXPENSE', 'ACTIVE'),
         (v_t, 'FOOD', 'Food', 'EXPENSE', 'ACTIVE')
  on conflict do nothing;

  select id into v_branch from public.branches where tenant_id = v_t and deleted_at is null limit 1;

  insert into public.tenant_users (tenant_id, user_id, role, status)
  values
    (v_t, '99999999-1111-4111-8111-00000000c040', 'MEMBER', 'ACTIVE'),
    (v_t, '99999999-1111-4111-8111-00000000d040', 'MEMBER', 'ACTIVE')
  on conflict (tenant_id, user_id) do update set status = 'ACTIVE';

  insert into public.users (
    tenant_id, auth_user_id, username, user_type, full_name, email, home_branch_id, status)
  values (
    v_t, '99999999-1111-4111-8111-00000000c040', 'finchk', 'STAFF',
    'Finance Checker', 'finchk@a.test', v_branch, 'ACTIVE')
  on conflict (auth_user_id) do update set deleted_at = null
  returning id into v_uid;

  select id into v_gid from public.user_groups
   where tenant_id = v_t and lower(name) = 'tenant_admin' and deleted_at is null;
  insert into public.user_group_members (tenant_id, user_id, group_id)
  values (v_t, v_uid, v_gid) on conflict (user_id, group_id) do nothing;

  insert into public.users (
    tenant_id, auth_user_id, username, user_type, full_name, email, home_branch_id, status)
  values (
    v_t, '99999999-1111-4111-8111-00000000d040', 'finstaff', 'STAFF',
    'Fin Staff', 'finstaff@a.test', v_branch, 'ACTIVE')
  on conflict (auth_user_id) do update set deleted_at = null
  returning id into v_uid;

  select id into v_gid from public.user_groups
   where tenant_id = v_t and name = 'OPERATIONS' and deleted_at is null;
  insert into public.user_group_members (tenant_id, user_id, group_id)
  values (v_t, v_uid, v_gid) on conflict (user_id, group_id) do nothing;

  update public.group_permissions gp
     set can_modify = false, can_add = false, all_access = false
    from public.permission_modules pm
   where gp.module_id = pm.id and gp.group_id = v_gid
     and pm.slug in ('txn.receipt-entry','txn.expense-entry','txn.expense-authorize','txn.customer-pay');

  raise notice 'PASS [seed]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000040';

-- receipt save + post + ledger
do $$
declare
  v_r public.receipts;
  v_led int;
  v_aud int;
begin
  v_r := public.save_receipt(null, null, jsonb_build_object(
    'customer_code','CUST1',
    'receipt_date', current_date::text,
    'mode','CASH',
    'amount','1500.00',
    'narration','Advance'));
  if v_r.status <> 'DRAFT' then raise exception 'FAIL [receipt-draft]: %', v_r.status; end if;
  perform set_config('fin.rcp', v_r.id::text, false);
  perform set_config('fin.rcp_rv', v_r.row_version::text, false);

  begin
    perform public.save_receipt(
      v_r.id, 999999,
      jsonb_build_object('customer_code','CUST1','amount','1600','mode','CASH'));
    raise exception 'FAIL [receipt-optlock]';
  exception when sqlstate '40001' then null;
  end;

  v_r := public.save_receipt(
    current_setting('fin.rcp')::uuid,
    current_setting('fin.rcp_rv')::integer,
    jsonb_build_object(
      'customer_code','CUST1','receipt_date', current_date::text,
      'mode','CASH','amount','1600.00','narration','Advance updated'));
  perform set_config('fin.rcp_rv', v_r.row_version::text, false);

  v_r := public.post_receipt(
    current_setting('fin.rcp')::uuid,
    current_setting('fin.rcp_rv')::integer);
  if v_r.status <> 'POSTED' then raise exception 'FAIL [receipt-posted]: %', v_r.status; end if;

  select count(*) into v_led from public.ledger_entries
   where doc_type = 'RECEIPT' and doc_id = v_r.id and credit = 1600;
  if v_led <> 1 then raise exception 'FAIL [receipt-ledger]: %', v_led; end if;

  select count(*) into v_aud from public.audit_logs
   where entity_type = 'receipts' and entity_id = v_r.id;
  if v_aud < 1 then raise exception 'FAIL [receipt-audit]'; end if;

  begin
    perform public.save_receipt(
      v_r.id, v_r.row_version,
      jsonb_build_object('customer_code','CUST1','amount','1700','mode','CASH'));
    raise exception 'FAIL [post-immutable]';
  exception when sqlstate 'CMS04' then null;
  end;

  raise notice 'PASS [receipt posting + ledger]';
end $$;

-- expense maker/checker
do $$
declare
  v_e public.expense_entries;
begin
  v_e := public.save_expense(null, null, jsonb_build_object(
    'kind','EXPENSE',
    'entry_date', current_date::text,
    'expense_head_code','OFFICE',
    'mode','CASH',
    'amount','400.00',
    'description','Stationery'));
  if v_e.authorization_status <> 'UNAUTHORIZED' then
    raise exception 'FAIL [exp-unauth]: %', v_e.authorization_status;
  end if;
  perform set_config('fin.exp', v_e.id::text, false);
  perform set_config('fin.exp_rv', v_e.row_version::text, false);

  -- maker cannot authorize
  begin
    perform public.authorize_expense(
      current_setting('fin.exp')::uuid,
      current_setting('fin.exp_rv')::integer);
    raise exception 'FAIL [maker-checker]';
  exception when sqlstate 'CMS04' then null;
  end;

  raise notice 'PASS [expense save + maker-checker self-reject]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000c040';

do $$
declare
  v_e public.expense_entries;
  v_led int;
begin
  v_e := public.authorize_expense(
    current_setting('fin.exp')::uuid,
    current_setting('fin.exp_rv')::integer);
  if v_e.authorization_status <> 'AUTHORIZED' then
    raise exception 'FAIL [authorize]: %', v_e.authorization_status;
  end if;

  select count(*) into v_led from public.ledger_entries
   where doc_type = 'EXPENSE' and doc_id = v_e.id and debit = 400;
  if v_led <> 1 then raise exception 'FAIL [expense-ledger]: %', v_led; end if;

  raise notice 'PASS [authorization + expense ledger]';
end $$;

-- reject path with second expense created by maker
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000040';

do $$
declare v_e public.expense_entries;
begin
  v_e := public.save_expense(null, null, jsonb_build_object(
    'kind','EXPENSE','expense_head_code','FOOD','mode','CASH',
    'amount','120.00','description','Tea'));
  perform set_config('fin.exp2', v_e.id::text, false);
  perform set_config('fin.exp2_rv', v_e.row_version::text, false);
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000c040';

do $$
declare v_e public.expense_entries;
begin
  v_e := public.reject_expense(
    current_setting('fin.exp2')::uuid,
    current_setting('fin.exp2_rv')::integer,
    'Not allowed');
  if v_e.authorization_status <> 'REJECTED' then
    raise exception 'FAIL [reject]: %', v_e.authorization_status;
  end if;
  raise notice 'PASS [expense reject]';
end $$;

-- customer payment approve/reject
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000040';

do $$
declare
  v_p public.customer_payments;
  v_led int;
begin
  v_p := public.save_customer_payment(null, null, jsonb_build_object(
    'customer_code','CUST1',
    'declared_date', current_date::text,
    'paid_date', current_date::text,
    'amount','2500.00',
    'remark','NEFT'));
  if v_p.status <> 'PENDING' then raise exception 'FAIL [pay-pending]'; end if;

  begin
    perform public.approve_customer_payment(v_p.id, 999999);
    raise exception 'FAIL [pay-optlock]';
  exception when sqlstate '40001' then null;
  end;

  v_p := public.approve_customer_payment(v_p.id, v_p.row_version);
  if v_p.status <> 'APPROVED' then raise exception 'FAIL [pay-approved]: %', v_p.status; end if;

  select count(*) into v_led from public.ledger_entries
   where doc_type = 'CUSTOMER_PAYMENT' and doc_id = v_p.id and credit = 2500;
  if v_led <> 1 then raise exception 'FAIL [pay-ledger]: %', v_led; end if;

  v_p := public.save_customer_payment(null, null, jsonb_build_object(
    'customer_code','CUST1','amount','100.00','remark','dup claim'));
  v_p := public.reject_customer_payment(v_p.id, v_p.row_version, 'Duplicate');
  if v_p.status <> 'REJECTED' then raise exception 'FAIL [pay-reject]'; end if;

  raise notice 'PASS [payment approval + reject + ledger]';
end $$;

-- append-only ledger
do $$
declare v_eid uuid; v_cnt int;
begin
  select id into v_eid from public.ledger_entries limit 1;
  begin
    update public.ledger_entries set credit = 1 where id = v_eid;
    if (select credit from public.ledger_entries where id = v_eid) = 1 then
      raise exception 'FAIL [ao-update]';
    end if;
  exception when sqlstate '0A000' then null;
  end;
  begin
    delete from public.ledger_entries where id = v_eid;
    select count(*) into v_cnt from public.ledger_entries where id = v_eid;
    if v_cnt = 0 then raise exception 'FAIL [ao-delete]'; end if;
  exception when sqlstate '0A000' then null;
  end;
  raise notice 'PASS [append-only ledger]';
end $$;

-- permission enforcement
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000d040';
do $$
declare v_t uuid := current_setting('fin.tenant')::uuid;
begin
  if app.user_has_permission(v_t, 'txn.receipt-entry', 'add') then
    raise exception 'FAIL [perm-setup]';
  end if;
  begin
    perform public.save_receipt(null, null, jsonb_build_object(
      'customer_code','CUST1','amount','10','mode','CASH'));
    raise exception 'FAIL [perm-receipt]';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'PASS [permission-enforcement]';
end $$;

-- tenant isolation
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000b040';
do $$
begin
  begin
    perform public.post_receipt(
      current_setting('fin.rcp')::uuid,
      (select row_version from public.receipts where id = current_setting('fin.rcp')::uuid));
    raise exception 'FAIL [tenant]';
  exception
    when sqlstate 'P0002' then null;
    when sqlstate '42501' then null;
    when sqlstate 'CMS02' then null;
    when sqlstate 'CMS04' then null;
  end;
  raise notice 'PASS [tenant-isolation / RLS]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000040';

do $$
begin
  raise notice '==========================================================';
  raise notice 'FINANCE FOUNDATION VERIFICATION PASSED.';
  raise notice '==========================================================';
end $$;

rollback;
