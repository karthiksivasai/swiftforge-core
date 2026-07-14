-- ===========================================================================
-- vendor_wizard_verification.sql — Phase 3 Party Masters (0026).
-- ---------------------------------------------------------------------------
-- Proves Milestone 11D–11F: wizard child tables synced by save_vendor.
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-2222-4222-8222-000000000022','authenticated','authenticated','vendwiz@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid;
begin
  v_t := app.bootstrap_tenant('vendwiz-a', 'Vendor Wizard Tenant', 'VendWizA');
  perform app.link_tenant_admin(v_t, '99999999-2222-4222-8222-000000000022',
          'vendwizadm', 'Vendor Wizard Admin', 'vendwiz@a.test');
  perform set_config('vendwiz.tenant', v_t::text, false);
end $$;

do $$
declare v_tbl text; v_tbls text[] := array[
  'vendor_documents',
  'vendor_services',
  'vendor_api_credentials'
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
set local request.jwt.claim.sub = '99999999-2222-4222-8222-000000000022';

-- save_vendor syncs wizard child collections
do $$
declare
  v_t uuid := current_setting('vendwiz.tenant')::uuid;
  v_bill public.vendors;
  v_v public.vendors;
  v_docs jsonb;
  v_svc jsonb;
  v_api jsonb;
  v_extras jsonb;
begin
  v_bill := public.save_vendor(null, null,
    jsonb_build_object('code','BILLV','name','Billing Vendor','mobile','6666666666','status','ACTIVE'),
    '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb);

  v_docs := $j$[{"docType":"GST","fileName":"gst.pdf","remark":"FY26"}]$j$::jsonb;
  v_svc := $j$[{"service":"EXPRESS","billingVendorId":"PLACEHOLDER","minWeight":"0.5","maxWeight":"30","isSinglePiece":true}]$j$::jsonb;
  v_svc := jsonb_set(v_svc, '{0,billingVendorId}', to_jsonb(v_bill.id::text));
  v_api := $j$[{"carrierCode":"DHL","apiKey":"key1","endpointUrl":"https://api.example/dhl","isActive":true}]$j$::jsonb;
  v_extras := jsonb_build_object('rates', jsonb_build_object('fileName', 'rates.csv'));

  v_v := public.save_vendor(null, null,
    jsonb_build_object('code','WIZ1','name','Wizard Vendor','mobile','7777777777','status','ACTIVE'),
    v_extras, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, v_docs, v_svc, v_api);

  if (select count(*) from public.vendor_documents where vendor_id = v_v.id) <> 1 then
    raise exception 'FAIL [doc-count]';
  end if;
  if (select count(*) from public.vendor_services where vendor_id = v_v.id) <> 1 then
    raise exception 'FAIL [svc-count]';
  end if;
  if (select billing_vendor_id from public.vendor_services where vendor_id = v_v.id limit 1) <> v_bill.id then
    raise exception 'FAIL [svc-billing-fk]';
  end if;
  if (select count(*) from public.vendor_api_credentials where vendor_id = v_v.id) <> 1 then
    raise exception 'FAIL [api-count]';
  end if;
  if (v_v.wizard_extras->'rates'->>'fileName') <> 'rates.csv' then
    raise exception 'FAIL [wizard-extras-rates-only]';
  end if;
  if v_v.wizard_extras ? 'documents' then
    raise exception 'FAIL [wizard-extras-no-documents]';
  end if;

  -- replace semantics: empty arrays clear wizard children
  v_v := public.save_vendor(v_v.id, v_v.row_version,
    jsonb_build_object('code','WIZ1','name','Wizard Updated','mobile','7777777777','status','ACTIVE'),
    v_extras, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb);

  if (select count(*) from public.vendor_documents where vendor_id = v_v.id) <> 0 then
    raise exception 'FAIL [doc-replace]';
  end if;
  if (select count(*) from public.vendor_services where vendor_id = v_v.id) <> 0 then
    raise exception 'FAIL [svc-replace]';
  end if;
  if (select count(*) from public.vendor_api_credentials where vendor_id = v_v.id) <> 0 then
    raise exception 'FAIL [api-replace]';
  end if;

  raise notice 'PASS [save_vendor-wizard-children]';
end $$;

reset role;
do $$ begin raise notice 'VENDOR WIZARD VERIFICATION PASSED'; end $$;
rollback;
