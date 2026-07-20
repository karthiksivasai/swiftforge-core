-- Fix get_vendor_shipping_context: use shipment_charge_snapshots (real table).
-- 0077 incorrectly referenced non-existent public.shipment_charges.

create or replace function public.get_vendor_shipping_context(p_shipment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_s public.shipments;
  v_vi public.vendor_integrations;
  v_cred public.integration_credentials;
  v_pieces jsonb;
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
      'vendor_code', (select code from public.vendors where id = v_s.vendor_id),
      'vendor_name', (select name from public.vendors where id = v_s.vendor_id),
      'origin_code', (select code from public.destinations where id = v_s.origin_destination_id),
      'destination_code', (select code from public.destinations where id = v_s.destination_id)
    ),
    'pieces', v_pieces,
    'charges', v_charges,
    'integration', case when v_vi.id is null then null else jsonb_build_object(
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
    ) end,
    'shipping_api_enabled', v_vi.id is not null
  );
end;
$$;

revoke all on function public.get_vendor_shipping_context(uuid) from public;
grant execute on function public.get_vendor_shipping_context(uuid) to authenticated, service_role;
