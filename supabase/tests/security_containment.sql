-- Staging checks for migration 0117. Run with psql after the migration.
-- Fails the script when a containment control is missing.
-- This does not replace a two-tenant login test; it checks the deployed catalog.

do $$
declare
  v_count int;
begin
  if has_column_privilege('authenticated', 'public.vendors', 'station_api_key', 'SELECT') then
    raise exception 'FAIL: authenticated can still select vendors.station_api_key';
  end if;
  raise notice 'PASS: station_api_key is not selectable by authenticated';

  if has_table_privilege('authenticated', 'public.vendor_service_tokens', 'SELECT')
     or has_table_privilege('anon', 'public.vendor_service_tokens', 'SELECT') then
    raise exception 'FAIL: vendor_service_tokens is still readable by anon or authenticated';
  end if;
  raise notice 'PASS: vendor_service_tokens is not readable by anon or authenticated';

  if has_function_privilege('anon', 'public.get_vendor_carrier_secrets(uuid, text, uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.get_vendor_carrier_secrets(uuid, text, uuid)', 'EXECUTE') then
    raise exception 'FAIL: get_vendor_carrier_secrets is executable outside service_role';
  end if;
  if not has_function_privilege('service_role', 'public.get_vendor_carrier_secrets(uuid, text, uuid)', 'EXECUTE') then
    raise exception 'FAIL: service_role cannot execute get_vendor_carrier_secrets';
  end if;
  raise notice 'PASS: carrier secrets RPC is service_role only';

  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app'
    and has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_count > 0 then
    raise exception 'FAIL: % app functions are still executable by anon', v_count;
  end if;
  raise notice 'PASS: anon cannot execute app functions';

  if not has_function_privilege('anon', 'public.public_track_shipment(text, text)', 'EXECUTE') then
    raise exception 'FAIL: public tracking RPC is not executable by anon';
  end if;
  raise notice 'PASS: public tracking remains available to anon';
end
$$;

-- Manual staging session (separate accounts). Do this after the catalog checks:
-- 1. Unauthenticated GET /api/awb-entry/status, POST /api/shipments/rate,
--    POST /api/shipping/ups/book -> 401.
-- 2. Tenant A staff token cannot read Tenant B shipments (RLS + tenant_id filter).
-- 3. Operations/accounts/customer JWT selecting vendors.station_api_key or
--    vendor_service_tokens fails.
-- 4. Carrier book routes return 503 CARRIER_BOOKING_DISABLED for an authorized user.
-- 5. Force logoff sets sessions.revoked_at and the next me() / table read for that
--    JWT returns nothing.
-- 6. public.public_track_shipment returns found/status/origin/destination only.
