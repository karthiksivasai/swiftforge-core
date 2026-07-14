-- ===========================================================================
-- vendor_aggregate_verification.sql — Phase 3 Party Masters (0025).
-- ---------------------------------------------------------------------------
-- Proves Milestone 11B: vendors aggregate + child sync + lookup/import.
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000011','authenticated','authenticated','vendadm@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid;
begin
  v_t := app.bootstrap_tenant('vend-a', 'Vendor Tenant A', 'VendA');
  perform app.link_tenant_admin(v_t, '99999999-1111-4111-8111-000000000011',
          'vendadm', 'Vendor Admin', 'vendadm@a.test');
  perform set_config('vend.tenant', v_t::text, false);
end $$;

do $$
declare v_tbl text; v_tbls text[] := array['vendors'];
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
  if to_regclass('public.vendor_addresses') is null then raise exception 'FAIL [child-addr]'; end if;
  if to_regclass('public.vendor_contacts') is null then raise exception 'FAIL [child-con]'; end if;
  if to_regclass('public.vendor_bank_accounts') is null then raise exception 'FAIL [child-bank]'; end if;
  raise notice 'PASS [structure]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000011';

-- vendors import
do $$
declare v_res jsonb; v_t uuid := current_setting('vend.tenant')::uuid;
begin
  v_res := public.import_master('vendors', 'COMMIT', $j$[
    {"code":"DHL","name":"DHL Express","mobile":"9999999999","status":"active"},
    {"code":"","name":"X","mobile":"1"}
  ]$j$::jsonb);
  if (v_res->>'ok')::int <> 1 or (v_res->>'error_count')::int <> 1 then
    raise exception 'FAIL [vend-import]: %', v_res;
  end if;
  if (select count(*) from public.vendors where tenant_id = v_t) <> 1 then
    raise exception 'FAIL [vend-rows]';
  end if;
  raise notice 'PASS [vendors-import]';
end $$;

-- save_vendor aggregate + children
do $$
declare
  v_t uuid := current_setting('vend.tenant')::uuid;
  v_v public.vendors;
  v_addrs jsonb;
  v_contacts jsonb;
  v_banks jsonb;
begin
  v_addrs := $j$[{"name":"HQ","address1":"Line 1","city":"Hyderabad","isDefault":true}]$j$::jsonb;
  v_contacts := $j$[{"name":"Ops","mobile":"8888888888","isPrimary":true}]$j$::jsonb;
  v_banks := $j$[{"accountNo":"1234567890","ifsc":"HDFC0001","accountName":"DHL Express"}]$j$::jsonb;

  v_v := public.save_vendor(null, null,
    jsonb_build_object('code','FEDEX','name','FedEx','mobile','7777777777','status','ACTIVE','mode','COURIER'),
    jsonb_build_object('rates', jsonb_build_object('fileName','rates.csv')),
    v_addrs, v_contacts, v_banks);

  if (select count(*) from public.vendor_addresses where vendor_id = v_v.id) <> 1 then
    raise exception 'FAIL [save-addresses]';
  end if;
  if (select count(*) from public.vendor_contacts where vendor_id = v_v.id) <> 1 then
    raise exception 'FAIL [save-contacts]';
  end if;
  if (select count(*) from public.vendor_bank_accounts where vendor_id = v_v.id) <> 1 then
    raise exception 'FAIL [save-banks]';
  end if;
  if (v_v.wizard_extras->'rates'->>'fileName') <> 'rates.csv' then
    raise exception 'FAIL [wizard-extras]';
  end if;

  v_v := public.save_vendor(v_v.id, v_v.row_version,
    jsonb_build_object('code','FEDEX','name','FedEx Updated','mobile','7777777777','status','ACTIVE','mode','AIR'),
    '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb);

  if (select count(*) from public.vendor_addresses where vendor_id = v_v.id) <> 0 then
    raise exception 'FAIL [child-replace]';
  end if;
  raise notice 'PASS [save_vendor]';
end $$;

-- lookup vendor ACTIVE only
do $$
declare n int;
begin
  select count(*) into n from public.lookup('vendor', null);
  if n <> 2 then raise exception 'FAIL [lookup-count]: got %', n; end if;
  raise notice 'PASS [lookup-vendor]';
end $$;

reset role;
do $$ begin raise notice 'VENDOR AGGREGATE VERIFICATION PASSED'; end $$;
rollback;
