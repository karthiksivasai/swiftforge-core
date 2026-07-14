-- ===========================================================================
-- customer_aggregate_verification.sql — Phase 3 Party Masters (0023).
-- ---------------------------------------------------------------------------
-- Proves Milestone 10B: customers aggregate + customer_id FK links.
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-eeee-4eee-8eee-0000000000e1','authenticated','authenticated','custadm@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid; v_sc uuid;
begin
  v_t := app.bootstrap_tenant('cust-a', 'Customer Tenant A', 'CustA');
  perform app.link_tenant_admin(v_t, '99999999-eeee-4eee-8eee-0000000000e1',
          'custadm', 'Customer Admin', 'custadm@a.test');
  insert into public.service_centers (tenant_id, code, name, branch)
    values (v_t, 'HYD', 'HYD', 'HYD');
  select id into v_sc from public.service_centers where tenant_id = v_t and code = 'HYD';
  perform set_config('cust.tenant', v_t::text, false);
  perform set_config('cust.sc', v_sc::text, false);
end $$;

do $$
declare v_tbl text; v_tbls text[] := array['customers'];
begin
  foreach v_tbl in array v_tbls loop
    if to_regclass('public.' || v_tbl) is null then raise exception 'FAIL [table]: %', v_tbl; end if;
    if not (select relrowsecurity from pg_class where oid = ('public.' || v_tbl)::regclass) then
      raise exception 'FAIL [rls]: %', v_tbl;
    end if;
    if (select count(*) from pg_trigger where tgrelid = ('public.' || v_tbl)::regclass
          and tgname in ('trg_touch_' || v_tbl, 'trg_audit_' || v_tbl)) <> 2 then
      raise exception 'FAIL [triggers]: %', v_tbl;
    end if;
  end loop;
  if to_regclass('public.customer_addresses') is null then raise exception 'FAIL [child]'; end if;
  if not exists (select 1 from information_schema.columns
        where table_name='consignees' and column_name='customer_id') then
    raise exception 'FAIL [consignee-fk-col]';
  end if;
  raise notice 'PASS [structure]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-eeee-4eee-8eee-0000000000e1';

-- customers import
do $$
declare v_res jsonb; v_t uuid := current_setting('cust.tenant')::uuid;
begin
  v_res := public.import_master('customers', 'COMMIT', $j$[
    {"code":"ACME","name":"Acme Corp","mobile":"9999999999","branch":"HYD","service_center_code":"HYD","status":"active"},
    {"code":"","name":"X","mobile":"1"}
  ]$j$::jsonb);
  if (v_res->>'ok')::int <> 1 or (v_res->>'error_count')::int <> 1 then
    raise exception 'FAIL [cust-import]: %', v_res;
  end if;
  if (select count(*) from public.customers where tenant_id = v_t) <> 1 then
    raise exception 'FAIL [cust-rows]';
  end if;
  raise notice 'PASS [customers-import]';
end $$;

-- save_customer aggregate + addresses
do $$
declare
  v_t uuid := current_setting('cust.tenant')::uuid;
  v_c public.customers;
  v_addrs jsonb;
begin
  v_addrs := $j$[
    {"name":"HQ","address1":"Line 1","city":"Hyderabad","is_default_shipper":true}
  ]$j$::jsonb;
  v_c := public.save_customer(null, null,
    jsonb_build_object('code','BETA','name','Beta Ltd','mobile','8888888888','status','ACTIVE'),
    v_addrs, '{}'::jsonb);
  if (select count(*) from public.customer_addresses where customer_id = v_c.id) <> 1 then
    raise exception 'FAIL [save-addresses]';
  end if;

  v_c := public.save_customer(v_c.id, v_c.row_version,
    jsonb_build_object('code','BETA','name','Beta Updated','mobile','8888888888','status','ACTIVE'),
    '[]'::jsonb, jsonb_build_object('other', jsonb_build_object('industry','Retail')));
  if (select count(*) from public.customer_addresses where customer_id = v_c.id) <> 0 then
    raise exception 'FAIL [save-address-replace]';
  end if;
  if (v_c.wizard_extras->'other'->>'industry') <> 'Retail' then
    raise exception 'FAIL [wizard-extras]';
  end if;
  raise notice 'PASS [save_customer]';
end $$;

-- consignee links customer_id via import
do $$
declare v_res jsonb; v_t uuid := current_setting('cust.tenant')::uuid; v_cid uuid;
begin
  select id into v_cid from public.customers where tenant_id = v_t and code = 'ACME';
  v_res := public.import_master('consignees', 'COMMIT', $j$[
    {"code":"CNX","name":"Receiver","mobile":"7777777777","customer_code":"ACME"}
  ]$j$::jsonb);
  if (v_res->>'ok')::int <> 1 then raise exception 'FAIL [cn-link]: %', v_res; end if;
  if (select customer_id from public.consignees where tenant_id = v_t and code = 'CNX') is distinct from v_cid then
    raise exception 'FAIL [cn-customer-fk]';
  end if;
  raise notice 'PASS [consignee-customer-fk]';
end $$;

-- lookup customer ACTIVE only
do $$
declare n int;
begin
  select count(*) into n from public.lookup('customer', null);
  if n <> 2 then raise exception 'FAIL [lookup-count]: got %', n; end if;
  raise notice 'PASS [lookup-customer]';
end $$;

reset role;
do $$ begin raise notice 'CUSTOMER AGGREGATE VERIFICATION PASSED'; end $$;
rollback;
