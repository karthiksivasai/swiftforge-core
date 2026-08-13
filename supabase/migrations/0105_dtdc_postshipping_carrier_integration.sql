-- ===========================================================================
-- 0105  DTDC (PostShipping) Carrier API Integration & Vendor Configuration
-- ---------------------------------------------------------------------------
-- Adds PostShipping carrier provider support to vendor master:
--   1. Columns on public.vendors: carrier_provider, api_base_url, station_api_key,
--      station_code, is_live_mode.
--   2. Child table public.vendor_service_tokens for service_code -> third_party_token.
--   3. Seeds station keys (SYD, MEL, PER, NZ) and test token for NPU25KG.
--   4. Secure RPC app.get_vendor_carrier_config to fetch config & tokens.
--   5. Updates public.get_vendor_shipping_context to support direct carrier_provider vendors.
-- ===========================================================================

-- 1. Extend vendors table
alter table public.vendors
  add column if not exists carrier_provider text,
  add column if not exists api_base_url text default 'https://api.postshipping.com/api2',
  add column if not exists station_api_key text,
  add column if not exists station_code text,
  add column if not exists is_live_mode boolean not null default false;

-- 2. Create vendor_service_tokens child table
create table if not exists public.vendor_service_tokens (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  vendor_id         uuid not null references public.vendors(id) on delete cascade,
  service_code      text not null,
  third_party_token text not null,
  description       text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  created_by        uuid,
  updated_at        timestamptz not null default now(),
  updated_by        uuid,
  deleted_at        timestamptz,
  row_version       integer not null default 1,
  constraint vendor_service_tokens_tenant_id_uq unique (tenant_id, id),
  constraint vendor_service_tokens_service_uq unique (tenant_id, vendor_id, service_code)
);

create index if not exists vendor_service_tokens_vendor_idx
  on public.vendor_service_tokens (tenant_id, vendor_id)
  where deleted_at is null and is_active is true;

alter table public.vendor_service_tokens enable row level security;

drop policy if exists vendor_service_tokens_select on public.vendor_service_tokens;
create policy vendor_service_tokens_select on public.vendor_service_tokens
  for select using (
    tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin()
  );

drop policy if exists vendor_service_tokens_all on public.vendor_service_tokens;
create policy vendor_service_tokens_all on public.vendor_service_tokens
  for all using (
    tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin()
  ) with check (
    tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin()
  );

-- 3. Seed DTDC station vendors and known service token across existing tenants
do $$
declare
  v_tenant uuid;
  v_vendor_syd uuid;
  v_vendor_mel uuid;
  v_vendor_per uuid;
  v_vendor_nz  uuid;
begin
  for v_tenant in select id from public.tenants loop
    -- DTDC Sydney
    select id into v_vendor_syd from public.vendors
     where tenant_id = v_tenant and upper(code) in ('DTAU', 'DTDCSYD', 'DTDC_SYD') and deleted_at is null
     limit 1;
    if v_vendor_syd is null then
      insert into public.vendors (
        tenant_id, code, name, mobile, carrier_provider, api_base_url, station_api_key, station_code, is_live_mode, status
      ) values (
        v_tenant, 'DTDCSYD', 'DTDC Australia - Sydney (PostShipping)', '0000000000',
        'POSTSHIPPING', 'https://api.postshipping.com/api2', '9BB3A5A25465316D92A653C87DEFBB84', 'SYD', false, 'ACTIVE'
      ) returning id into v_vendor_syd;
    else
      update public.vendors
         set carrier_provider = 'POSTSHIPPING',
             api_base_url     = 'https://api.postshipping.com/api2',
             station_api_key  = '9BB3A5A25465316D92A653C87DEFBB84',
             station_code     = 'SYD'
       where id = v_vendor_syd;
    end if;

    -- DTDC Melbourne
    select id into v_vendor_mel from public.vendors
     where tenant_id = v_tenant and upper(code) in ('DTDCMEL', 'DTDC_MEL') and deleted_at is null
     limit 1;
    if v_vendor_mel is null then
      insert into public.vendors (
        tenant_id, code, name, mobile, carrier_provider, api_base_url, station_api_key, station_code, is_live_mode, status
      ) values (
        v_tenant, 'DTDCMEL', 'DTDC Australia - Melbourne (PostShipping)', '0000000000',
        'POSTSHIPPING', 'https://api.postshipping.com/api2', '5535E00AF881A2D1212AA1A27574E499', 'MEL', false, 'ACTIVE'
      ) returning id into v_vendor_mel;
    else
      update public.vendors
         set carrier_provider = 'POSTSHIPPING',
             api_base_url     = 'https://api.postshipping.com/api2',
             station_api_key  = '5535E00AF881A2D1212AA1A27574E499',
             station_code     = 'MEL'
       where id = v_vendor_mel;
    end if;

    -- DTDC Perth
    select id into v_vendor_per from public.vendors
     where tenant_id = v_tenant and upper(code) in ('DTDCPER', 'DTDC_PER') and deleted_at is null
     limit 1;
    if v_vendor_per is null then
      insert into public.vendors (
        tenant_id, code, name, mobile, carrier_provider, api_base_url, station_api_key, station_code, is_live_mode, status
      ) values (
        v_tenant, 'DTDCPER', 'DTDC Australia - Perth (PostShipping)', '0000000000',
        'POSTSHIPPING', 'https://api.postshipping.com/api2', '7FC6394D58FC5C7AA12196D95BDF9606', 'PER', false, 'ACTIVE'
      ) returning id into v_vendor_per;
    else
      update public.vendors
         set carrier_provider = 'POSTSHIPPING',
             api_base_url     = 'https://api.postshipping.com/api2',
             station_api_key  = '7FC6394D58FC5C7AA12196D95BDF9606',
             station_code     = 'PER'
       where id = v_vendor_per;
    end if;

    -- DTDC New Zealand
    select id into v_vendor_nz from public.vendors
     where tenant_id = v_tenant and upper(code) in ('DTDCNZ', 'DTDC_NZ') and deleted_at is null
     limit 1;
    if v_vendor_nz is null then
      insert into public.vendors (
        tenant_id, code, name, mobile, carrier_provider, api_base_url, station_api_key, station_code, is_live_mode, status
      ) values (
        v_tenant, 'DTDCNZ', 'DTDC New Zealand (PostShipping)', '0000000000',
        'POSTSHIPPING', 'https://api.postshipping.com/api2', '36FA600E65426DDAF314A836402AEA59', 'NZ', false, 'ACTIVE'
      ) returning id into v_vendor_nz;
    else
      update public.vendors
         set carrier_provider = 'POSTSHIPPING',
             api_base_url     = 'https://api.postshipping.com/api2',
             station_api_key  = '36FA600E65426DDAF314A836402AEA59',
             station_code     = 'NZ'
       where id = v_vendor_nz;
    end if;

    -- Seed known service token NPU25KG for all DTDC vendors
    if v_vendor_syd is not null then
      insert into public.vendor_service_tokens (tenant_id, vendor_id, service_code, third_party_token, description)
      values (v_tenant, v_vendor_syd, 'NPU25KG', '240035141E2A4F64443309F5B72983F7', 'DTDC NPU 25KG Standard')
      on conflict (tenant_id, vendor_id, service_code) do update
        set third_party_token = excluded.third_party_token, updated_at = now();
    end if;
    if v_vendor_mel is not null then
      insert into public.vendor_service_tokens (tenant_id, vendor_id, service_code, third_party_token, description)
      values (v_tenant, v_vendor_mel, 'NPU25KG', '240035141E2A4F64443309F5B72983F7', 'DTDC NPU 25KG Standard')
      on conflict (tenant_id, vendor_id, service_code) do update
        set third_party_token = excluded.third_party_token, updated_at = now();
    end if;
    if v_vendor_per is not null then
      insert into public.vendor_service_tokens (tenant_id, vendor_id, service_code, third_party_token, description)
      values (v_tenant, v_vendor_per, 'NPU25KG', '240035141E2A4F64443309F5B72983F7', 'DTDC NPU 25KG Standard')
      on conflict (tenant_id, vendor_id, service_code) do update
        set third_party_token = excluded.third_party_token, updated_at = now();
    end if;
    if v_vendor_nz is not null then
      insert into public.vendor_service_tokens (tenant_id, vendor_id, service_code, third_party_token, description)
      values (v_tenant, v_vendor_nz, 'NPU25KG', '240035141E2A4F64443309F5B72983F7', 'DTDC NPU 25KG Standard')
      on conflict (tenant_id, vendor_id, service_code) do update
        set third_party_token = excluded.third_party_token, updated_at = now();
    end if;
  end loop;
end $$;

-- 4. Secure RPC to fetch carrier config and tokens
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
       and vendor_id = v_vendor.id
       and upper(service_code) = upper(btrim(p_service_code))
       and is_active is true
       and deleted_at is null
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
    'station_api_key', v_vendor.station_api_key,
    'is_live_mode', coalesce(v_vendor.is_live_mode, false),
    'service_code', p_service_code,
    'third_party_token', v_token
  );
end;
$$;

comment on function public.get_vendor_carrier_config(uuid, text) is
  'Fetches vendor carrier integration config, station keys, and third-party service tokens for carrier booking.';

revoke all on function public.get_vendor_carrier_config(uuid, text) from public;
grant execute on function public.get_vendor_carrier_config(uuid, text) to authenticated, service_role;

-- 5. Updated get_vendor_shipping_context
create or replace function public.get_vendor_shipping_context(p_shipment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant  uuid;
  v_s       public.shipments;
  v_vendor  public.vendors;
  v_vi      public.vendor_integrations;
  v_cred    public.integration_credentials;
  v_pieces  jsonb;
  v_charges jsonb;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context' using errcode = '42501';
  end if;

  select * into v_s
  from public.shipments
  where id = p_shipment_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;

  if v_s.vendor_id is not null then
    select * into v_vendor
      from public.vendors
     where id = v_s.vendor_id and tenant_id = v_tenant and deleted_at is null;
  end if;

  v_vi := app.resolve_vendor_integration_for_shipment(v_tenant, v_s.vendor_id);

  if v_vi.credential_id is not null then
    select * into v_cred
    from public.integration_credentials
    where id = v_vi.credential_id and tenant_id = v_tenant and deleted_at is null;
  end if;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.seq), '[]'::jsonb)
    into v_pieces
  from public.shipment_pieces p
  where p.shipment_id = v_s.id and p.tenant_id = v_tenant;

  select coalesce(jsonb_agg(to_jsonb(c) order by c.seq), '[]'::jsonb)
    into v_charges
  from public.shipment_charge_snapshots c
  where c.shipment_id = v_s.id and c.tenant_id = v_tenant and c.deleted_at is null;

  return jsonb_build_object(
    'shipment', jsonb_build_object(
      'id', v_s.id,
      'row_version', v_s.row_version,
      'awb_no', v_s.awb_no,
      'book_date', v_s.book_date,
      'book_time', v_s.book_time,
      'reference_no', v_s.reference_no,
      'current_status', v_s.current_status,
      'shipper', v_s.shipper,
      'consignee', v_s.consignee,
      'product_id', v_s.product_id,
      'vendor_id', v_s.vendor_id,
      'airline', v_s.airline,
      'service', v_s.service,
      'service_code', v_s.service,
      'payment_type', v_s.payment_type,
      'content', v_s.content,
      'instruction', v_s.instruction,
      'pieces', v_s.pieces,
      'pieces_unit', v_s.pieces_unit,
      'actual_weight', v_s.actual_weight,
      'charge_weight', v_s.charge_weight,
      'vol_weight', v_s.vol_weight,
      'shipment_value', v_s.shipment_value,
      'currency', v_s.currency,
      'is_commercial', v_s.is_commercial,
      'forwarding_awb', v_s.forwarding_awb,
      'delivery_awb', v_s.delivery_awb,
      'wizard_extras', v_s.wizard_extras,
      'vendor_api_status', v_s.vendor_api_status,
      'vendor_api_awb', v_s.vendor_api_awb,
      'vendor_provider', v_s.vendor_provider,
      'customer_code', (select code from public.customers where id = v_s.customer_id),
      'customer_name', (select name from public.customers where id = v_s.customer_id),
      'product_code', (select code from public.products where id = v_s.product_id),
      'vendor_code', v_vendor.code,
      'vendor_name', v_vendor.name,
      'origin_code', (select code from public.destinations where id = v_s.origin_destination_id),
      'destination_code', (select code from public.destinations where id = v_s.destination_id)
    ),
    'pieces', v_pieces,
    'charges', v_charges,
    'integration', case
      when v_vi.id is not null then jsonb_build_object(
        'id', v_vi.id,
        'provider_code', v_vi.provider_code,
        'endpoint_url', coalesce(v_vi.endpoint_url, v_cred.endpoint),
        'requires_otp', v_vi.requires_otp,
        'account_number', coalesce(v_vi.account_number, v_cred.account_number),
        'customer_code', v_vi.customer_code,
        'enabled_services', to_jsonb(v_vi.enabled_services),
        'supported_products', to_jsonb(v_vi.supported_products),
        'credential_id', v_vi.credential_id,
        'has_username', v_cred.username is not null,
        'username', v_cred.username,
        'sandbox_mode', coalesce(v_cred.sandbox_mode, true)
      )
      when v_vendor.carrier_provider is not null then jsonb_build_object(
        'id', v_vendor.id,
        'provider_code', v_vendor.carrier_provider,
        'endpoint_url', v_vendor.api_base_url,
        'requires_otp', false,
        'has_username', false,
        'username', null,
        'sandbox_mode', not coalesce(v_vendor.is_live_mode, false)
      )
      else null
    end,
    'shipping_api_enabled', (v_vi.id is not null or (v_vendor.carrier_provider is not null and v_vendor.carrier_provider <> ''))
  );
end;
$$;

revoke all on function public.get_vendor_shipping_context(uuid) from public;
grant execute on function public.get_vendor_shipping_context(uuid) to authenticated, service_role;
