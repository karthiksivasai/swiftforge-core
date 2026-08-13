-- ===========================================================================
-- 0116: Map DTNZ's 4 UI services to PostShipping carrier token and NZATL code
-- ---------------------------------------------------------------------------
-- Strict parity with reference site: AKL, ARAMEX, OTHERS, REST
-- Maps each service code to carrier_service_code 'NZATL' and token 'C3696FC326DD16064E2F9B2A1534B120'
-- ===========================================================================

do $$
declare
  v_tenant record;
  v_vendor_dtnz uuid;
  v_svc record;
begin
  for v_tenant in select id from public.tenants loop

    select id into v_vendor_dtnz
      from public.vendors
     where tenant_id = v_tenant.id
       and upper(code) = 'DTNZ'
     limit 1;

    if v_vendor_dtnz is not null then
      -- Delete any existing service tokens for DTNZ
      delete from public.vendor_service_tokens
       where tenant_id = v_tenant.id
         and vendor_id = v_vendor_dtnz;

      -- Insert tokens for the 4 reference site services + native NZATL/NZSIG codes
      insert into public.vendor_service_tokens (
        tenant_id, vendor_id, station_code, service_code, carrier_service_code, third_party_token, description, is_active
      ) values
        -- 1. AKL (Auckland) -> NZATL
        (v_tenant.id, v_vendor_dtnz, 'NZ', 'AKL', 'NZATL', 'C3696FC326DD16064E2F9B2A1534B120', 'DTDC NZ - AKL (NZATL)', true),
        -- 2. ARAMEX -> NZATL
        (v_tenant.id, v_vendor_dtnz, 'NZ', 'ARAMEX', 'NZATL', 'C3696FC326DD16064E2F9B2A1534B120', 'DTDC NZ - ARAMEX (NZATL)', true),
        -- 3. OTHERS -> NZATL
        (v_tenant.id, v_vendor_dtnz, 'NZ', 'OTHERS', 'NZATL', 'C3696FC326DD16064E2F9B2A1534B120', 'DTDC NZ - OTHERS (NZATL)', true),
        -- 4. REST -> NZATL
        (v_tenant.id, v_vendor_dtnz, 'NZ', 'REST', 'NZATL', 'C3696FC326DD16064E2F9B2A1534B120', 'DTDC NZ - REST (NZATL)', true),
        -- Native DTDC codes
        (v_tenant.id, v_vendor_dtnz, 'NZ', 'NZATL', 'NZATL', 'C3696FC326DD16064E2F9B2A1534B120', 'DTDC NZ - NZATL', true),
        (v_tenant.id, v_vendor_dtnz, 'NZ', 'NZSIG', 'NZSIG', 'C3696FC326DD16064E2F9B2A1534B120', 'DTDC NZ - NZSIG', true);

      -- Ensure only the 4 reference site services are active in service_mappings
      update public.service_mappings
         set status = 'ACTIVE',
             deleted_at = null
       where tenant_id = v_tenant.id
         and vendor_id = v_vendor_dtnz
         and upper(service) in ('AKL', 'ARAMEX', 'OTHERS', 'REST');

    end if;

  end loop;
end $$;
