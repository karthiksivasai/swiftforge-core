-- ===========================================================================
-- 0112: Consolidate DTDC vendors to match reference site exactly (strict parity)
-- ---------------------------------------------------------------------------
-- 1. Re-point PostShipping carrier config to DTAU (DTDC AUSTRALIA) and DTNZ (DTDC NEWZEALAND)
-- 2. Soft-delete extra artificial (PostShipping) vendors: DTDCMEL, DTDCPER, DTDCNZ, DTMA
-- 3. Rename DPD UK vendor code to DPDUK (if previously DTDC)
-- 4. Map DTAU's 4 services in service_mappings: ARAMEX, AUS POST, COURIER PLEASE, SELF
-- 5. Extend vendor_service_tokens with carrier_service_code and map tokens directly to DTAU / DTNZ
-- 6. Update app.get_vendor_carrier_secrets and public.get_vendor_carrier_config RPCs
-- ===========================================================================

-- 1. Extend vendor_service_tokens with optional carrier_service_code column
alter table public.vendor_service_tokens
  add column if not exists carrier_service_code text;

-- 2. Update Vendors & Seed Service Tokens across all tenants
do $$
declare
  v_tenant record;
  v_vendor_dtau uuid;
  v_vendor_dtnz uuid;
  v_svc record;
begin
  for v_tenant in select id from public.tenants loop

    -- 2a. Update DTDC AUSTRALIA (DTAU)
    select id into v_vendor_dtau
      from public.vendors
     where tenant_id = v_tenant.id
       and upper(code) = 'DTAU'
     limit 1;

    if v_vendor_dtau is null then
      insert into public.vendors (
        tenant_id, code, name, mode, vendor_class, currency, status,
        carrier_provider, api_base_url, station_code, station_api_key, is_live_mode
      ) values (
        v_tenant.id, 'DTAU', 'DTDC AUSTRALIA', 'COURIER', 'VENDOR', 'INR', 'ACTIVE',
        'POSTSHIPPING', 'https://api.postshipping.com/api2', 'MEL', '5535E00AF881A2D1212AA1A27574E499', false
      )
      returning id into v_vendor_dtau;
    else
      update public.vendors
         set carrier_provider = 'POSTSHIPPING',
             api_base_url     = 'https://api.postshipping.com/api2',
             station_code     = 'MEL',
             station_api_key  = '5535E00AF881A2D1212AA1A27574E499',
             is_live_mode     = false,
             status           = 'ACTIVE',
             deleted_at       = null
       where id = v_vendor_dtau;
    end if;

    -- 2b. Update DTDC NEWZEALAND (DTNZ)
    select id into v_vendor_dtnz
      from public.vendors
     where tenant_id = v_tenant.id
       and upper(code) = 'DTNZ'
     limit 1;

    if v_vendor_dtnz is null then
      insert into public.vendors (
        tenant_id, code, name, mode, vendor_class, currency, status,
        carrier_provider, api_base_url, station_code, station_api_key, is_live_mode
      ) values (
        v_tenant.id, 'DTNZ', 'DTDC NEWZEALAND', 'COURIER', 'VENDOR', 'INR', 'ACTIVE',
        'POSTSHIPPING', 'https://api.postshipping.com/api2', 'NZ', '36FA600E65426DDAF314A836402AEA59', false
      )
      returning id into v_vendor_dtnz;
    else
      update public.vendors
         set carrier_provider = 'POSTSHIPPING',
             api_base_url     = 'https://api.postshipping.com/api2',
             station_code     = 'NZ',
             station_api_key  = '36FA600E65426DDAF314A836402AEA59',
             is_live_mode     = false,
             status           = 'ACTIVE',
             deleted_at       = null
       where id = v_vendor_dtnz;
    end if;

    -- 2c. Soft-delete extra artificial PostShipping vendors & unrelated DTDC-coded vendors
    update public.vendors
       set status = 'INACTIVE',
           deleted_at = now()
     where tenant_id = v_tenant.id
       and upper(code) in ('DTDCMEL', 'DTDCPER', 'DTDCNZ', 'DTMA');

    -- Rename DPD UK vendor code to DPDUK so it doesn't match DTDC search
    update public.vendors
       set code = 'DPDUK'
     where tenant_id = v_tenant.id
       and upper(code) = 'DTDC'
       and upper(name) like '%DPD%';

    -- 2d. Ensure DTAU's 4 services in service_mappings: ARAMEX, AUS POST, COURIER PLEASE, SELF
    for v_svc in select * from (values
      ('ARAMEX', 'DTDC AUSTRALIA - ARAMEX'),
      ('AUS POST', 'DTDC AUSTRALIA - AUS POST'),
      ('COURIER PLEASE', 'DTDC AUSTRALIA - COURIER PLEASE'),
      ('SELF', 'DTDC AUSTRALIA - SELF')
    ) as t(service, service_type) loop
      update public.service_mappings
         set service_type = v_svc.service_type,
             vendor_link  = 'DTDC AUSTRALIA',
             status       = 'ACTIVE',
             deleted_at   = null
       where tenant_id = v_tenant.id
         and vendor_id = v_vendor_dtau
         and service   = v_svc.service;

      if not found then
        insert into public.service_mappings (tenant_id, vendor_id, service, service_type, vendor_link, status)
        values (v_tenant.id, v_vendor_dtau, v_svc.service, v_svc.service_type, 'DTDC AUSTRALIA', 'ACTIVE');
      end if;
    end loop;

    -- 2e. Re-map service tokens onto DTAU vendor ID
    delete from public.vendor_service_tokens
     where tenant_id = v_tenant.id
       and (vendor_id = v_vendor_dtau or vendor_id in (
         select id from public.vendors where tenant_id = v_tenant.id and upper(code) in ('DTDCMEL', 'DTDCPER')
       ));

    -- Seed tokens for DTAU
    insert into public.vendor_service_tokens (
      tenant_id, vendor_id, station_code, service_code, carrier_service_code, third_party_token, description, is_active
    ) values
      -- COURIER PLEASE UI service -> PNPU25KG carrier code & token
      (v_tenant.id, v_vendor_dtau, 'MEL', 'COURIER PLEASE', 'PNPU25KG', '4A3C7348D7A13D1F716780654A93DFEE', 'DTDC AU - Couriers Please (MEL)', true),
      (v_tenant.id, v_vendor_dtau, 'MEL', 'PNPU25KG', 'PNPU25KG', '4A3C7348D7A13D1F716780654A93DFEE', 'DTDC AU - Couriers Please PNPU25KG', true),
      (v_tenant.id, v_vendor_dtau, 'MEL', 'PDS500GRM', 'PDS500GRM', '4A3C7348D7A13D1F716780654A93DFEE', 'DTDC AU - Couriers Please PDS 500G', true),
      (v_tenant.id, v_vendor_dtau, 'MEL', 'PDS1KG', 'PDS1KG', '4A3C7348D7A13D1F716780654A93DFEE', 'DTDC AU - Couriers Please PDS 1KG', true),
      (v_tenant.id, v_vendor_dtau, 'MEL', 'PDS3KG', 'PDS3KG', '4A3C7348D7A13D1F716780654A93DFEE', 'DTDC AU - Couriers Please PDS 3KG', true),
      (v_tenant.id, v_vendor_dtau, 'MEL', 'PDS5KG', 'PDS5KG', '4A3C7348D7A13D1F716780654A93DFEE', 'DTDC AU - Couriers Please PDS 5KG', true),
      -- ARAMEX UI service -> PATN5KG carrier code & token
      (v_tenant.id, v_vendor_dtau, 'MEL', 'ARAMEX', 'PATN5KG', 'AA2ADC6E881DAB945C0F8A1EED668283', 'DTDC AU - Aramex (MEL)', true),
      (v_tenant.id, v_vendor_dtau, 'MEL', 'PATN0.5KG', 'PATN0.5KG', 'AA2ADC6E881DAB945C0F8A1EED668283', 'DTDC AU - Aramex PATN 0.5KG', true),
      (v_tenant.id, v_vendor_dtau, 'MEL', 'PATN1KG', 'PATN1KG', 'AA2ADC6E881DAB945C0F8A1EED668283', 'DTDC AU - Aramex PATN 1KG', true),
      (v_tenant.id, v_vendor_dtau, 'MEL', 'PATN3KG', 'PATN3KG', 'AA2ADC6E881DAB945C0F8A1EED668283', 'DTDC AU - Aramex PATN 3KG', true),
      (v_tenant.id, v_vendor_dtau, 'MEL', 'PAT5KG', 'PAT5KG', 'AA2ADC6E881DAB945C0F8A1EED668283', 'DTDC AU - Aramex PAT 5KG', true),
      (v_tenant.id, v_vendor_dtau, 'MEL', 'PATN10KG', 'PATN10KG', 'AA2ADC6E881DAB945C0F8A1EED668283', 'DTDC AU - Aramex PATN 10KG', true),
      (v_tenant.id, v_vendor_dtau, 'MEL', 'PATN15KG', 'PATN15KG', 'AA2ADC6E881DAB945C0F8A1EED668283', 'DTDC AU - Aramex PATN 15KG', true),
      (v_tenant.id, v_vendor_dtau, 'MEL', 'PATN20KG', 'PATN20KG', 'AA2ADC6E881DAB945C0F8A1EED668283', 'DTDC AU - Aramex PATN 20KG', true),
      (v_tenant.id, v_vendor_dtau, 'MEL', 'PATN25KG', 'PATN25KG', 'AA2ADC6E881DAB945C0F8A1EED668283', 'DTDC AU - Aramex PATN 25KG', true),
      -- APDMEL
      (v_tenant.id, v_vendor_dtau, 'MEL', 'APDMEL', 'APDMEL', 'FE246011E9DE04EB46D6021FE43BC6D6', 'DTDC AU - APDMEL', true);

    -- 2f. Re-map service tokens onto DTNZ vendor ID
    delete from public.vendor_service_tokens
     where tenant_id = v_tenant.id
       and (vendor_id = v_vendor_dtnz or vendor_id in (
         select id from public.vendors where tenant_id = v_tenant.id and upper(code) = 'DTDCNZ'
       ));

    insert into public.vendor_service_tokens (
      tenant_id, vendor_id, station_code, service_code, carrier_service_code, third_party_token, description, is_active
    ) values
      (v_tenant.id, v_vendor_dtnz, 'NZ', 'NZATL', 'NZATL', 'C3696FC326DD16064E2F9B2A1534B120', 'DTDC NZ - NZATL', true),
      (v_tenant.id, v_vendor_dtnz, 'NZ', 'NZSIG', 'NZSIG', 'C3696FC326DD16064E2F9B2A1534B120', 'DTDC NZ - NZSIG', true);

  end loop;
end $$;

-- 3. Update app.get_vendor_carrier_secrets RPC to resolve tokens from DTAU/DTNZ + service aliases
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
  v_vendor               public.vendors;
  v_token                text;
  v_carrier_service_code text;
  v_station_code         text;
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

  v_station_code := coalesce(v_vendor.station_code, 'MEL');

  if p_service_code is not null and btrim(p_service_code) <> '' then
    select third_party_token,
           coalesce(carrier_service_code, service_code),
           coalesce(station_code, v_station_code)
      into v_token, v_carrier_service_code, v_station_code
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
    'station_code', v_station_code,
    'station_api_key', v_vendor.station_api_key,
    'is_live_mode', coalesce(v_vendor.is_live_mode, false),
    'service_code', p_service_code,
    'carrier_service_code', coalesce(v_carrier_service_code, p_service_code),
    'third_party_token', v_token,
    'has_station_key', (v_vendor.station_api_key is not null and btrim(v_vendor.station_api_key) <> ''),
    'has_service_token', (v_token is not null and btrim(v_token) <> '')
  );
end;
$$;

revoke all on function app.get_vendor_carrier_secrets(uuid, text) from public;
grant execute on function app.get_vendor_carrier_secrets(uuid, text) to service_role;

-- 4. Update public.get_vendor_carrier_config client RPC
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
  v_tenant               uuid;
  v_vendor               public.vendors;
  v_token                text;
  v_carrier_service_code text;
  v_station_code         text;
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
      'reason', 'No carrier provider configured'
    );
  end if;

  v_station_code := coalesce(v_vendor.station_code, 'MEL');

  if p_service_code is not null and btrim(p_service_code) <> '' then
    select third_party_token,
           coalesce(carrier_service_code, service_code),
           coalesce(station_code, v_station_code)
      into v_token, v_carrier_service_code, v_station_code
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
    'station_code', v_station_code,
    'is_live_mode', coalesce(v_vendor.is_live_mode, false),
    'service_code', p_service_code,
    'carrier_service_code', coalesce(v_carrier_service_code, p_service_code),
    'has_station_key', (v_vendor.station_api_key is not null and btrim(v_vendor.station_api_key) <> ''),
    'has_service_token', (v_token is not null and btrim(v_token) <> '')
  );
end;
$$;

revoke all on function public.get_vendor_carrier_config(uuid, text) from public;
grant execute on function public.get_vendor_carrier_config(uuid, text) to authenticated, service_role;
