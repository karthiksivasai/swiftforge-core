-- ===========================================================================
-- 0106  DTDC MEL and NZ Station Service Tokens & Production-Ready Live Booking
-- ---------------------------------------------------------------------------
-- 1. Updates public.vendor_service_tokens to support station_code and adds
--    accurate per-station tokens for Melbourne (MEL) and New Zealand (NZ/AUK).
-- 2. Secure server-side RPC app.get_vendor_carrier_secrets for Edge Function
--    dispatch (service_role only — station keys never exposed to browser).
-- 3. Hardens client-facing public.get_vendor_carrier_config to return safe
--    metadata (has_station_key, has_service_token) without raw secret leakage.
-- 4. Idempotency helper app.check_carrier_booking_idempotency to prevent
--    duplicate live wallet charges.
-- ===========================================================================

-- 1. Add station_code to vendor_service_tokens if not exists
alter table public.vendor_service_tokens
  add column if not exists station_code text;

create index if not exists vendor_service_tokens_station_idx
  on public.vendor_service_tokens (tenant_id, station_code, service_code)
  where deleted_at is null and is_active is true;

-- 2. Seed real production tokens for MEL and NZ gateways across all tenants
do $$
declare
  v_tenant record;
  v_vendor_mel uuid;
  v_vendor_nz  uuid;
begin
  for v_tenant in select id from public.tenants loop
    -- Resolve MEL vendor
    select id into v_vendor_mel from public.vendors
     where tenant_id = v_tenant.id
       and (upper(code) in ('DTDCMEL', 'DTDC_MEL') or station_code = 'MEL')
       and deleted_at is null
     limit 1;

    -- Ensure MEL vendor row exists with correct station key
    if v_vendor_mel is null then
      insert into public.vendors (
        tenant_id, code, name, mobile, carrier_provider, api_base_url,
        station_api_key, station_code, is_live_mode, status
      ) values (
        v_tenant.id, 'DTDCMEL', 'DTDC Australia - Melbourne (PostShipping)', '0000000000',
        'POSTSHIPPING', 'https://api.postshipping.com/api2',
        '5535E00AF881A2D1212AA1A27574E499', 'MEL', false, 'ACTIVE'
      ) returning id into v_vendor_mel;
    else
      update public.vendors
         set carrier_provider = 'POSTSHIPPING',
             api_base_url     = 'https://api.postshipping.com/api2',
             station_api_key  = '5535E00AF881A2D1212AA1A27574E499',
             station_code     = 'MEL'
       where id = v_vendor_mel;
    end if;

    -- Resolve NZ vendor
    select id into v_vendor_nz from public.vendors
     where tenant_id = v_tenant.id
       and (upper(code) in ('DTDCNZ', 'DTDC_NZ') or station_code = 'NZ')
       and deleted_at is null
     limit 1;

    -- Ensure NZ vendor row exists with correct station key
    if v_vendor_nz is null then
      insert into public.vendors (
        tenant_id, code, name, mobile, carrier_provider, api_base_url,
        station_api_key, station_code, is_live_mode, status
      ) values (
        v_tenant.id, 'DTDCNZ', 'DTDC New Zealand (PostShipping)', '0000000000',
        'POSTSHIPPING', 'https://api.postshipping.com/api2',
        '36FA600E65426DDAF314A836402AEA59', 'NZ', false, 'ACTIVE'
      ) returning id into v_vendor_nz;
    else
      update public.vendors
         set carrier_provider = 'POSTSHIPPING',
             api_base_url     = 'https://api.postshipping.com/api2',
             station_api_key  = '36FA600E65426DDAF314A836402AEA59',
             station_code     = 'NZ'
       where id = v_vendor_nz;
    end if;

    -- Purge previous placeholder tokens for MEL & NZ
    delete from public.vendor_service_tokens
     where tenant_id = v_tenant.id
       and vendor_id in (v_vendor_mel, v_vendor_nz);

    -- ─────────────────────────────────────────────────────────────────────────
    -- MEL Gateway Tokens (Station: 5535E00AF881A2D1212AA1A27574E499)
    -- ─────────────────────────────────────────────────────────────────────────
    -- 1. APDMEL
    insert into public.vendor_service_tokens (tenant_id, vendor_id, station_code, service_code, third_party_token, description)
    values (v_tenant.id, v_vendor_mel, 'MEL', 'APDMEL', 'FE246011E9DE04EB46D6021FE43BC6D6', 'DTDC MEL - APDMEL');

    -- 2. PATN series (PATN0.5KG .. PATN25KG) -> AA2ADC6E881DAB945C0F8A1EED668283
    insert into public.vendor_service_tokens (tenant_id, vendor_id, station_code, service_code, third_party_token, description)
    values
      (v_tenant.id, v_vendor_mel, 'MEL', 'PATN0.5KG', 'AA2ADC6E881DAB945C0F8A1EED668283', 'DTDC MEL - PATN 0.5KG'),
      (v_tenant.id, v_vendor_mel, 'MEL', 'PATN1KG',   'AA2ADC6E881DAB945C0F8A1EED668283', 'DTDC MEL - PATN 1KG'),
      (v_tenant.id, v_vendor_mel, 'MEL', 'PATN3KG',   'AA2ADC6E881DAB945C0F8A1EED668283', 'DTDC MEL - PATN 3KG'),
      (v_tenant.id, v_vendor_mel, 'MEL', 'PAT5KG',    'AA2ADC6E881DAB945C0F8A1EED668283', 'DTDC MEL - PAT 5KG'),
      (v_tenant.id, v_vendor_mel, 'MEL', 'PATN10KG',  'AA2ADC6E881DAB945C0F8A1EED668283', 'DTDC MEL - PATN 10KG'),
      (v_tenant.id, v_vendor_mel, 'MEL', 'PATN15KG',  'AA2ADC6E881DAB945C0F8A1EED668283', 'DTDC MEL - PATN 15KG'),
      (v_tenant.id, v_vendor_mel, 'MEL', 'PATN20KG',  'AA2ADC6E881DAB945C0F8A1EED668283', 'DTDC MEL - PATN 20KG'),
      (v_tenant.id, v_vendor_mel, 'MEL', 'PATN25KG',  'AA2ADC6E881DAB945C0F8A1EED668283', 'DTDC MEL - PATN 25KG');

    -- 3. PDS & PNPU series -> 4A3C7348D7A13D1F716780654A93DFEE
    insert into public.vendor_service_tokens (tenant_id, vendor_id, station_code, service_code, third_party_token, description)
    values
      (v_tenant.id, v_vendor_mel, 'MEL', 'PDS500GRM', '4A3C7348D7A13D1F716780654A93DFEE', 'DTDC MEL - PDS 500GRM'),
      (v_tenant.id, v_vendor_mel, 'MEL', 'PDS1KG',    '4A3C7348D7A13D1F716780654A93DFEE', 'DTDC MEL - PDS 1KG'),
      (v_tenant.id, v_vendor_mel, 'MEL', 'PDS3KG',    '4A3C7348D7A13D1F716780654A93DFEE', 'DTDC MEL - PDS 3KG'),
      (v_tenant.id, v_vendor_mel, 'MEL', 'PDS5KG',    '4A3C7348D7A13D1F716780654A93DFEE', 'DTDC MEL - PDS 5KG'),
      (v_tenant.id, v_vendor_mel, 'MEL', 'PNPU25KG',  '4A3C7348D7A13D1F716780654A93DFEE', 'DTDC MEL - Couriers Please PNPU 25KG');

    -- ─────────────────────────────────────────────────────────────────────────
    -- NZ/AUK Gateway Tokens (Station: 36FA600E65426DDAF314A836402AEA59)
    -- ─────────────────────────────────────────────────────────────────────────
    insert into public.vendor_service_tokens (tenant_id, vendor_id, station_code, service_code, third_party_token, description)
    values
      (v_tenant.id, v_vendor_nz, 'NZ', 'NZATL', 'C3696FC326DD16064E2F9B2A1534B120', 'DTDC NZ - NZATL'),
      (v_tenant.id, v_vendor_nz, 'NZ', 'NZSIG', 'C3696FC326DD16064E2F9B2A1534B120', 'DTDC NZ - NZSIG');

  end loop;
end $$;

-- 3. Secure server-side RPC for Edge Function (never exposed to browser)
create or replace function app.get_vendor_carrier_secrets(
  p_vendor_id    uuid,
  p_service_code text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_vendor       public.vendors;
  v_token        text;
begin
  select * into v_vendor
    from public.vendors
   where id = p_vendor_id
     and deleted_at is null;

  if v_vendor.id is null then
    return jsonb_build_object('configured', false, 'reason', 'Vendor not found');
  end if;

  if v_vendor.carrier_provider is null or btrim(v_vendor.carrier_provider) = '' then
    return jsonb_build_object(
      'configured', false,
      'vendor_code', v_vendor.code,
      'reason', 'No carrier provider configured'
    );
  end if;

  if p_service_code is not null and btrim(p_service_code) <> '' then
    select third_party_token into v_token
      from public.vendor_service_tokens
     where tenant_id = v_vendor.tenant_id
       and (vendor_id = v_vendor.id or station_code = v_vendor.station_code)
       and upper(service_code) = upper(btrim(p_service_code))
       and is_active is true
       and deleted_at is null
     order by case when vendor_id = v_vendor.id then 0 else 1 end
     limit 1;
  end if;

  return jsonb_build_object(
    'configured', true,
    'tenant_id', v_vendor.tenant_id,
    'vendor_id', v_vendor.id,
    'vendor_code', v_vendor.code,
    'vendor_name', v_vendor.name,
    'carrier_provider', v_vendor.carrier_provider,
    'api_base_url', coalesce(v_vendor.api_base_url, 'https://api.postshipping.com/api2'),
    'station_code', v_vendor.station_code,
    'station_api_key', v_vendor.station_api_key,
    'is_live_mode', coalesce(v_vendor.is_live_mode, false),
    'service_code', p_service_code,
    'third_party_token', v_token,
    'has_station_key', (v_vendor.station_api_key is not null and btrim(v_vendor.station_api_key) <> ''),
    'has_service_token', (v_token is not null and btrim(v_token) <> '')
  );
end;
$$;

revoke all on function app.get_vendor_carrier_secrets(uuid, text) from public;
grant execute on function app.get_vendor_carrier_secrets(uuid, text) to service_role;

-- 4. Safe client-facing RPC (masks raw keys, only exposes configuration booleans & metadata)
create or replace function public.get_vendor_carrier_config(
  p_vendor_id    uuid,
  p_service_code text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant       uuid;
  v_vendor       public.vendors;
  v_token        text;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_vendor
    from public.vendors
   where id = p_vendor_id
     and tenant_id = v_tenant
     and deleted_at is null;

  if v_vendor.id is null then
    return jsonb_build_object('configured', false, 'reason', 'Vendor not found');
  end if;

  if v_vendor.carrier_provider is null or btrim(v_vendor.carrier_provider) = '' then
    return jsonb_build_object(
      'configured', false,
      'vendor_code', v_vendor.code,
      'vendor_name', v_vendor.name,
      'reason', 'No external carrier provider configured'
    );
  end if;

  if p_service_code is not null and btrim(p_service_code) <> '' then
    select third_party_token into v_token
      from public.vendor_service_tokens
     where tenant_id = v_tenant
       and (vendor_id = v_vendor.id or station_code = v_vendor.station_code)
       and upper(service_code) = upper(btrim(p_service_code))
       and is_active is true
       and deleted_at is null
     order by case when vendor_id = v_vendor.id then 0 else 1 end
     limit 1;
  end if;

  return jsonb_build_object(
    'configured', true,
    'vendor_id', v_vendor.id,
    'vendor_code', v_vendor.code,
    'vendor_name', v_vendor.name,
    'carrier_provider', v_vendor.carrier_provider,
    'api_base_url', coalesce(v_vendor.api_base_url, 'https://api.postshipping.com/api2'),
    'station_code', v_vendor.station_code,
    'is_live_mode', coalesce(v_vendor.is_live_mode, false),
    'service_code', p_service_code,
    'has_station_key', (v_vendor.station_api_key is not null and btrim(v_vendor.station_api_key) <> ''),
    'has_service_token', (v_token is not null and btrim(v_token) <> '')
  );
end;
$$;

revoke all on function public.get_vendor_carrier_config(uuid, text) from public;
grant execute on function public.get_vendor_carrier_config(uuid, text) to authenticated, service_role;

-- 5. Idempotency helper to prevent duplicate live booking POSTs
create or replace function app.check_carrier_booking_idempotency(
  p_shipment_id   uuid,
  p_provider_code text default 'POSTSHIPPING'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_s      public.shipments;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_s
    from public.shipments
   where id = p_shipment_id
     and tenant_id = v_tenant
     and deleted_at is null;

  if not found then
    return jsonb_build_object('can_book', false, 'reason', 'Shipment not found');
  end if;

  -- If already successfully booked via a real live booking (not a dry-run preview ref)
  if v_s.vendor_api_status = 'VENDOR_BOOKED'
     and v_s.vendor_api_awb is not null
     and v_s.vendor_api_awb not like 'DTDC-PREVIEW-%'
     and v_s.vendor_api_awb not like 'VX%'
  then
    return jsonb_build_object(
      'can_book', false,
      'already_booked', true,
      'vendor_awb', v_s.vendor_api_awb,
      'tracking_number', v_s.vendor_tracking_number,
      'booking_id', v_s.vendor_booking_id,
      'vendor_provider', coalesce(v_s.vendor_provider, p_provider_code),
      'booked_at', v_s.vendor_api_booked_at,
      'message', format('Shipment is already booked with carrier tracking %s', v_s.vendor_api_awb)
    );
  end if;

  return jsonb_build_object('can_book', true, 'already_booked', false);
end;
$$;

revoke all on function app.check_carrier_booking_idempotency(uuid, text) from public;
grant execute on function app.check_carrier_booking_idempotency(uuid, text) to authenticated, service_role;
