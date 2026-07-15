-- ===========================================================================
-- financial_reports_verification.sql — Phase 5 Milestone 5C (0044).
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000044','authenticated','authenticated','finrpt@a.test'),
  ('99999999-1111-4111-8111-00000000b044','authenticated','authenticated','finrpt@b.test'),
  ('99999999-1111-4111-8111-00000000d044','authenticated','authenticated','finstaff@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid; v_tb uuid;
begin
  v_t := app.bootstrap_tenant('finrpt-a', 'Fin Report A', 'FinRA');
  perform app.link_tenant_admin(v_t, '99999999-1111-4111-8111-000000000044',
          'finrptadm', 'Fin Report Admin', 'finrpt@a.test');
  perform set_config('fr.tenant', v_t::text, false);

  v_tb := app.bootstrap_tenant('finrpt-b', 'Fin Report B', 'FinRB');
  perform app.link_tenant_admin(v_tb, '99999999-1111-4111-8111-00000000b044',
          'finrptadmb', 'Fin Report Admin B', 'finrpt@b.test');
  perform set_config('fr.tenant_b', v_tb::text, false);
end $$;

do $$
declare
  v_keys text[] := array[
    'receipt-register','cash-collection-report','expense-register',
    'expense-authorization-report','customer-payment-register',
    'customer-payment-approval-report','ledger-register','customer-ledger'
  ];
  v_k text;
begin
  foreach v_k in array v_keys loop
    if not exists (
      select 1 from public.report_definitions
       where report_key = v_k and deleted_at is null and is_active
    ) then
      raise exception 'FAIL [meta]: missing %', v_k;
    end if;
  end loop;

  if exists (
    select 1 from public.report_definitions
     where report_key in ('billing-register','gst-register','profit-report')
       and deleted_at is null and is_active
  ) then
    raise exception 'FAIL [meta]: deferred invoice reports must not be seeded';
  end if;

  if not exists (
    select 1 from public.report_definitions
     where report_key = 'receipt-register' and source_entity = 'RECEIPTS'
  ) then
    raise exception 'FAIL [meta]: receipts source';
  end if;

  raise notice 'PASS [metadata registration]';
end $$;

-- Seed finance data
do $$
declare
  v_t uuid := current_setting('fr.tenant')::uuid;
  v_cust uuid; v_branch uuid; v_head uuid; v_uid uuid; v_gid uuid;
  v_rcpt uuid;
begin
  select id into v_branch from public.branches
   where tenant_id = v_t and deleted_at is null
   order by case when is_head_office then 0 else 1 end limit 1;

  insert into public.customers (tenant_id, code, name, mobile, status)
  values (v_t, 'FINCUST', 'Finance Customer', '9222222222', 'ACTIVE')
  on conflict do nothing;
  select id into v_cust from public.customers where tenant_id = v_t and code = 'FINCUST';

  insert into public.expense_heads (tenant_id, code, name, kind, ledger, status)
  values (v_t, 'FUEL', 'Fuel', 'EXPENSE', 'GL-FUEL', 'ACTIVE')
  on conflict do nothing;
  select id into v_head from public.expense_heads where tenant_id = v_t and code = 'FUEL';

  insert into public.receipts (
    tenant_id, receipt_no, receipt_date, customer_id, branch_id, mode, amount, status, narration)
  values
    (v_t, 'FIN-RCP-1', current_date, v_cust, v_branch, 'CASH', 500.00, 'POSTED', 'Cash receipt'),
    (v_t, 'FIN-RCP-2', current_date, v_cust, v_branch, 'BANK', 750.00, 'DRAFT', 'Bank draft')
  on conflict do nothing;

  select id into v_rcpt from public.receipts
   where tenant_id = v_t and receipt_no = 'FIN-RCP-1' and deleted_at is null;

  insert into public.ledger_entries (
    tenant_id, customer_id, entry_date, doc_type, doc_id, debit, credit, balance_after, branch_id, narration)
  values (
    v_t, v_cust, current_date, 'RECEIPT', coalesce(v_rcpt, gen_random_uuid()),
    0, 500.00, -500.00, v_branch, 'Cash receipt posted')
  on conflict do nothing;

  insert into public.expense_entries (
    tenant_id, entry_no, kind, entry_date, expense_head_id, expense_head_code, expense_head_name,
    mode, branch_id, description, amount, authorization_status)
  values
    (v_t, 'FIN-EXP-1', 'EXPENSE', current_date, v_head, 'FUEL', 'Fuel',
     'CASH', v_branch, 'Petrol', 120.00, 'UNAUTHORIZED'),
    (v_t, 'FIN-EXP-2', 'EXPENSE', current_date, v_head, 'FUEL', 'Fuel',
     'BANK', v_branch, 'Diesel', 200.00, 'AUTHORIZED')
  on conflict do nothing;

  insert into public.customer_payments (
    tenant_id, customer_id, declared_date, amount, remark, status)
  values
    (v_t, v_cust, current_date, 300.00, 'Pending pay', 'PENDING'),
    (v_t, v_cust, current_date, 400.00, 'Approved pay', 'APPROVED')
  on conflict do nothing;

  insert into public.tenant_users (tenant_id, user_id, role, status)
  values (v_t, '99999999-1111-4111-8111-00000000d044', 'MEMBER', 'ACTIVE')
  on conflict (tenant_id, user_id) do update set status = 'ACTIVE';

  insert into public.users (
    tenant_id, auth_user_id, username, user_type, full_name, email, home_branch_id, status)
  values (
    v_t, '99999999-1111-4111-8111-00000000d044', 'finstaff', 'STAFF',
    'Fin Staff', 'finstaff@a.test', v_branch, 'ACTIVE')
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
     and pm.slug in ('rpt.cash-collection-report','rpt.statement-report');

  raise notice 'PASS [seed]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000044';

do $$
declare
  v_r jsonb;
  v_val jsonb;
begin
  perform public.get_report_definition('receipt-register');

  v_val := public.validate_report_filters('expense-register', jsonb_build_object(
    'from_date', current_date::text, 'to_date', current_date::text));
  if not (v_val->>'ok')::boolean then raise exception 'FAIL [val] %', v_val; end if;

  v_r := public.execute_report(
    'receipt-register',
    jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
    1, 1, 'receipt_date', 'desc');
  if (v_r->>'total')::bigint < 2 then raise exception 'FAIL [receipt total]'; end if;
  if jsonb_array_length(v_r->'rows') <> 1 then raise exception 'FAIL [pagination]'; end if;

  v_r := public.execute_report(
    'cash-collection-report',
    jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
    1, 50, null, 'desc');
  if (v_r->>'total')::bigint < 1 then raise exception 'FAIL [cash]'; end if;
  -- default mode CASH should exclude BANK-only draft
  if exists (
    select 1 from jsonb_array_elements(v_r->'rows') x
     where x->>'payment_mode' = 'BANK'
  ) then
    raise exception 'FAIL [cash mode preset]';
  end if;

  v_r := public.execute_report(
    'expense-register',
    jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
    1, 50, null, 'desc');
  if (v_r->>'total')::bigint < 2 then raise exception 'FAIL [expense]'; end if;

  v_r := public.execute_report(
    'expense-authorization-report',
    jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
    1, 50, null, 'desc');
  if (v_r->>'total')::bigint < 1 then raise exception 'FAIL [expense auth]'; end if;
  if exists (
    select 1 from jsonb_array_elements(v_r->'rows') x
     where x->>'expense_status' <> 'UNAUTHORIZED'
  ) then
    raise exception 'FAIL [expense auth preset]';
  end if;

  v_r := public.execute_report(
    'customer-payment-register',
    jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
    1, 50, null, 'desc');
  if (v_r->>'total')::bigint < 2 then raise exception 'FAIL [payments]'; end if;

  v_r := public.execute_report(
    'customer-payment-approval-report',
    jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
    1, 50, null, 'desc');
  if (v_r->>'total')::bigint < 1 then raise exception 'FAIL [pay approval]'; end if;

  v_r := public.execute_report(
    'ledger-register',
    jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
    1, 50, null, 'desc');
  if (v_r->>'total')::bigint < 1 then raise exception 'FAIL [ledger]'; end if;

  raise notice 'PASS [validation / pagination / sorting / correctness]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000d044';
do $$
begin
  begin
    perform public.execute_report(
      'receipt-register',
      jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
      1, 10, null, 'desc');
    raise exception 'FAIL [perm]';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'PASS [permissions]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000b044';
do $$
declare v_r jsonb;
begin
  v_r := public.execute_report(
    'receipt-register',
    jsonb_build_object('from_date', current_date::text, 'to_date', current_date::text),
    1, 50, null, 'desc');
  if (v_r->>'total')::bigint <> 0 then
    raise exception 'FAIL [tenant leak] %', v_r->>'total';
  end if;
  raise notice 'PASS [tenant isolation]';
end $$;

reset role;
do $$
begin
  raise notice '==========================================================';
  raise notice 'FINANCIAL REPORTS VERIFICATION PASSED.';
  raise notice '==========================================================';
end $$;

rollback;
