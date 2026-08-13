-- 0113: Expose get_vendor_carrier_secrets in public schema for service_role edge runtime
create or replace function public.get_vendor_carrier_secrets(
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

revoke all on function public.get_vendor_carrier_secrets(uuid, text) from public;
grant execute on function public.get_vendor_carrier_secrets(uuid, text) to service_role;
