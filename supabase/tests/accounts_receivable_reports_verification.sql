-- ===========================================================================
-- accounts_receivable_reports_verification.sql — Phase 5 Milestone 5D (0045).
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000045','authenticated','authenticated','ar@a.test'),
  ('99999999-1111-4111-8111-00000000b045','authenticated','authenticated','ar@b.test'),
  ('99999999-1111-4111-8111-00000000d045','authenticated','authenticated','arstaff@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid; v_tb uuid;
begin
  v_t := app.bootstrap_tenant('ar-a', 'AR A', 'ARA');
  perform app.link_tenant_admin(v_t, '99999999-1111-4111-8111-000000000045',
          'aradm', 'AR Admin', 'ar@a.test');
  perform set_config('ar.tenant', v_t::text, false);

  v_tb := app.bootstrap_tenant('ar-b', 'AR B', 'ARB');
  perform app.link_tenant_admin(v_tb, '99999999-1111-4111-8111-00000000b045',
          'aradmb', 'AR Admin B', 'ar@b.test');
  perform set_config('ar.tenant_b', v_tb::text, false);
end $$;

do $$
declare
  v_keys text[] := array[
    'customer-outstanding-report','outstanding-summary','outstanding-detail',
    'customer-statement','ageing-summary','ageing-detail',
    'as-on-date-outstanding','customer-balance-report'
  ];
  v_k text;
begin
  foreach v_k in array v_keys loop
    if not exists (
      select 1 from public.report_definitions
       where report_key = v_k and deleted_at is null and is_active and hub = 'AR'
    ) then
      raise exception 'FAIL [meta]: missing %', v_k;
    end if;
  end loop;
  raise notice 'PASS [metadata registration]';
end $$;

-- Seed ledger history for ageing (old debit + recent credit)
do $$
declare
  v_t uuid := current_setting('ar.tenant')::uuid;
  v_cust uuid; v_branch uuid; v_uid uuid; v_gid uuid;
  v_old date := current_date - 45;
begin
  select id into v_branch from public.branches
   where tenant_id = v_t and deleted_at is null
   order by case when is_head_office then 0 else 1 end limit 1;

  insert into public.customers (tenant_id, code, name, mobile, status)
  values (v_t, 'ARCUST', 'AR Customer', '9333333333', 'ACTIVE')
  on conflict do nothing;
  select id into v_cust from public.customers where tenant_id = v_t and code = 'ARCUST';

  -- Opening/invoice-like debit 45 days ago (1000)
  insert into public.ledger_entries (
    tenant_id, customer_id, entry_date, doc_type, doc_id, debit, credit, balance_after, branch_id, narration)
  values (
    v_t, v_cust, v_old, 'OPENING', gen_random_uuid(), 1000, 0, 1000, v_branch, 'Opening debit');

  -- Partial receipt today (400) → open 600 aged in 31-60
  insert into public.ledger_entries (
    tenant_id, customer_id, entry_date, doc_type, doc_id, debit, credit, balance_after, branch_id, narration)
  values (
    v_t, v_cust, current_date, 'RECEIPT', gen_random_uuid(), 0, 400, 600, v_branch, 'Partial receipt');

  -- Second customer fully cleared
  insert into public.customers (tenant_id, code, name, mobile, status)
  values (v_t, 'ARZERO', 'Cleared Customer', '9444444444', 'ACTIVE')
  on conflict do nothing;

  insert into public.ledger_entries (
    tenant_id, customer_id, entry_date, doc_type, doc_id, debit, credit, balance_after, branch_id, narration)
  select v_t, c.id, current_date, 'OPENING', gen_random_uuid(), 100, 0, 100, v_branch, 'Debit'
    from public.customers c where c.tenant_id = v_t and c.code = 'ARZERO';
  insert into public.ledger_entries (
    tenant_id, customer_id, entry_date, doc_type, doc_id, debit, credit, balance_after, branch_id, narration)
  select v_t, c.id, current_date, 'RECEIPT', gen_random_uuid(), 0, 100, 0, v_branch, 'Cleared'
    from public.customers c where c.tenant_id = v_t and c.code = 'ARZERO';

  insert into public.tenant_users (tenant_id, user_id, role, status)
  values (v_t, '99999999-1111-4111-8111-00000000d045', 'MEMBER', 'ACTIVE')
  on conflict (tenant_id, user_id) do update set status = 'ACTIVE';

  insert into public.users (
    tenant_id, auth_user_id, username, user_type, full_name, email, home_branch_id, status)
  values (
    v_t, '99999999-1111-4111-8111-00000000d045', 'arstaff', 'STAFF',
    'AR Staff', 'arstaff@a.test', v_branch, 'ACTIVE')
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
     and pm.slug = 'rpt.ar-report';

  raise notice 'PASS [seed]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000045';

do $$
declare
  v_r jsonb;
  v_val jsonb;
  v_bal numeric;
  v_bucket text;
begin
  perform public.get_report_definition('ageing-summary');

  v_val := public.validate_report_filters('as-on-date-outstanding', jsonb_build_object(
    'as_on_date', current_date::text));
  if not (v_val->>'ok')::boolean then raise exception 'FAIL [as_on val] %', v_val; end if;

  v_r := public.execute_report(
    'customer-outstanding-report',
    jsonb_build_object('as_on_date', current_date::text),
    1, 50, null, 'asc');
  if (v_r->>'total')::bigint < 1 then raise exception 'FAIL [outstanding]'; end if;

  v_r := public.execute_report(
    'customer-balance-report',
    jsonb_build_object('as_on_date', current_date::text),
    1, 50, null, 'asc');
  if (v_r->>'total')::bigint < 2 then raise exception 'FAIL [balance all]'; end if;

  v_r := public.execute_report(
    'outstanding-summary',
    jsonb_build_object('as_on_date', current_date::text, 'customer_code', 'ARCUST'),
    1, 10, null, 'asc');
  v_bal := (v_r->'rows'->0->>'balance')::numeric;
  if v_bal <> 600 then raise exception 'FAIL [balance amt] got %', v_bal; end if;

  v_r := public.execute_report(
    'outstanding-detail',
    jsonb_build_object('as_on_date', current_date::text, 'customer_code', 'ARCUST'),
    1, 50, 'entry_date', 'asc');
  if jsonb_array_length(v_r->'rows') < 2 then raise exception 'FAIL [detail rows]'; end if;

  v_r := public.execute_report(
    'customer-statement',
    jsonb_build_object(
      'from_date', (current_date - 30)::text,
      'to_date', current_date::text,
      'customer_code', 'ARCUST'),
    1, 50, null, 'desc');
  -- only entries in last 31 days (receipt), opening is 45 days ago
  if (v_r->>'total')::bigint < 1 then raise exception 'FAIL [statement]'; end if;

  v_r := public.execute_report(
    'ageing-detail',
    jsonb_build_object('as_on_date', current_date::text, 'customer_code', 'ARCUST'),
    1, 50, null, 'desc');
  if (v_r->>'total')::bigint < 1 then raise exception 'FAIL [ageing detail]'; end if;
  v_bucket := v_r->'rows'->0->>'ageing_bucket';
  if v_bucket is distinct from '31-60' then
    raise exception 'FAIL [ageing bucket] got %', v_bucket;
  end if;
  if (v_r->'rows'->0->>'open_amount')::numeric <> 600 then
    raise exception 'FAIL [open amount]';
  end if;

  v_r := public.execute_report(
    'ageing-summary',
    jsonb_build_object('as_on_date', current_date::text, 'customer_code', 'ARCUST'),
    1, 50, null, 'asc');
  if (v_r->'rows'->0->>'bucket_31_60')::numeric <> 600 then
    raise exception 'FAIL [ageing summary]';
  end if;

  v_r := public.execute_report(
    'as-on-date-outstanding',
    jsonb_build_object('as_on_date', current_date::text),
    1, 1, 'customer_code', 'asc');
  if jsonb_array_length(v_r->'rows') <> 1 then raise exception 'FAIL [pagination]'; end if;

  raise notice 'PASS [validation / pagination / ageing / correctness]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000d045';
do $$
begin
  begin
    perform public.execute_report(
      'ageing-summary',
      jsonb_build_object('as_on_date', current_date::text),
      1, 10, null, 'asc');
    raise exception 'FAIL [perm]';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'PASS [permissions]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000b045';
do $$
declare v_r jsonb;
begin
  v_r := public.execute_report(
    'customer-outstanding-report',
    jsonb_build_object('as_on_date', current_date::text),
    1, 50, null, 'asc');
  if (v_r->>'total')::bigint <> 0 then
    raise exception 'FAIL [tenant leak]';
  end if;
  raise notice 'PASS [tenant isolation]';
end $$;

reset role;
do $$
begin
  raise notice '==========================================================';
  raise notice 'ACCOUNTS RECEIVABLE REPORTS VERIFICATION PASSED.';
  raise notice '==========================================================';
end $$;

rollback;
