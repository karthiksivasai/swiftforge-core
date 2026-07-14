-- ===========================================================================
-- customer_children_verification.sql — Phase 3 Party Masters (0024).
-- ---------------------------------------------------------------------------
-- Proves Milestone 10C: wizard child tables synced by save_customer.
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-ffff-4fff-8fff-0000000000f1','authenticated','authenticated','custchild@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid; v_sc uuid;
begin
  v_t := app.bootstrap_tenant('custchild-a', 'Customer Child Tenant', 'CustChildA');
  perform app.link_tenant_admin(v_t, '99999999-ffff-4fff-8fff-0000000000f1',
          'custchildadm', 'Customer Child Admin', 'custchild@a.test');
  insert into public.service_centers (tenant_id, code, name, branch)
    values (v_t, 'HYD', 'HYD', 'HYD');
  select id into v_sc from public.service_centers where tenant_id = v_t and code = 'HYD';
  perform set_config('custchild.tenant', v_t::text, false);
  perform set_config('custchild.sc', v_sc::text, false);
end $$;

do $$
declare v_tbl text; v_tbls text[] := array[
  'customer_fuel_surcharges',
  'customer_other_charges',
  'customer_volumetrics',
  'customer_kyc_documents'
];
begin
  foreach v_tbl in array v_tbls loop
    if to_regclass('public.' || v_tbl) is null then raise exception 'FAIL [table]: %', v_tbl; end if;
    if not (select relrowsecurity from pg_class where oid = ('public.' || v_tbl)::regclass) then
      raise exception 'FAIL [rls]: %', v_tbl;
    end if;
  end loop;
  raise notice 'PASS [structure]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-ffff-4fff-8fff-0000000000f1';

-- save_customer syncs all wizard child collections
do $$
declare
  v_t uuid := current_setting('custchild.tenant')::uuid;
  v_c public.customers;
  v_fuel jsonb;
  v_other jsonb;
  v_vol jsonb;
  v_kyc jsonb;
  v_extras jsonb;
begin
  v_fuel := $j$[{"entryCode":"F1","fromDate":"2026-01-01","percentage":"5.5"}]$j$::jsonb;
  v_other := $j$[{"chargeType":"HANDLING","amount":"100"}]$j$::jsonb;
  v_vol := $j$[{"product":"DOC","cmDivide":"5000","cft":"10"}]$j$::jsonb;
  v_kyc := $j$[{"type":"PAN","fileName":"pan.pdf"}]$j$::jsonb;
  v_extras := jsonb_build_object(
    'contract', jsonb_build_object('fileName', 'contract.pdf'),
    'other', jsonb_build_object('industry', 'Retail'),
    'notification', jsonb_build_object('email', true)
  );

  v_c := public.save_customer(null, null,
    jsonb_build_object('code','CHILD1','name','Child Test','mobile','7777777777','status','ACTIVE'),
    '[]'::jsonb, v_extras, v_fuel, v_other, v_vol, v_kyc);

  if (select count(*) from public.customer_fuel_surcharges where customer_id = v_c.id) <> 1 then
    raise exception 'FAIL [fuel-count]';
  end if;
  if (select count(*) from public.customer_other_charges where customer_id = v_c.id) <> 1 then
    raise exception 'FAIL [other-count]';
  end if;
  if (select count(*) from public.customer_volumetrics where customer_id = v_c.id) <> 1 then
    raise exception 'FAIL [vol-count]';
  end if;
  if (select count(*) from public.customer_kyc_documents where customer_id = v_c.id) <> 1 then
    raise exception 'FAIL [kyc-count]';
  end if;
  if (v_c.wizard_extras->'other'->>'industry') <> 'Retail' then
    raise exception 'FAIL [wizard-extras-only-prefs]';
  end if;
  if v_c.wizard_extras ? 'fuelSurcharges' then
    raise exception 'FAIL [wizard-extras-no-fuel]';
  end if;

  -- replace semantics: empty arrays clear children
  v_c := public.save_customer(v_c.id, v_c.row_version,
    jsonb_build_object('code','CHILD1','name','Child Updated','mobile','7777777777','status','ACTIVE'),
    '[]'::jsonb, v_extras, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb);

  if (select count(*) from public.customer_fuel_surcharges where customer_id = v_c.id) <> 0 then
    raise exception 'FAIL [fuel-replace]';
  end if;
  if (select count(*) from public.customer_other_charges where customer_id = v_c.id) <> 0 then
    raise exception 'FAIL [other-replace]';
  end if;
  if (select count(*) from public.customer_volumetrics where customer_id = v_c.id) <> 0 then
    raise exception 'FAIL [vol-replace]';
  end if;
  if (select count(*) from public.customer_kyc_documents where customer_id = v_c.id) <> 0 then
    raise exception 'FAIL [kyc-replace]';
  end if;

  raise notice 'PASS [save_customer-children]';
end $$;

reset role;
do $$ begin raise notice 'CUSTOMER CHILDREN VERIFICATION PASSED'; end $$;
rollback;
