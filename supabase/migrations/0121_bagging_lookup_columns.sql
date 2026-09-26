-- Bagging AWB lookup uses the live shipment columns.
-- shipments stores the carrier number in forwarding_awb. Shipper and
-- consignee are JSON objects, not separate id columns.

create or replace function public.lookup_shipment_for_bagging(p_awb_no text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant    uuid := app.current_tenant_id();
  v_clean     text := upper(btrim(coalesce(p_awb_no, '')));
  v_ship      public.shipments%rowtype;
  v_shipper   text;
  v_consignee text;
  v_vendor    text;
  v_dest      text;
begin
  if v_tenant is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if not app.user_has_permission(v_tenant, 'txn.bagging', 'list')
     and not app.user_has_permission(v_tenant, 'txn.bagging', 'search') then
    raise exception 'Bagging permission is required' using errcode = '42501';
  end if;
  if v_clean = '' then
    return null;
  end if;

  select s.* into v_ship
  from public.shipments s
  where s.tenant_id = v_tenant
    and s.deleted_at is null
    and (
      upper(s.awb_no) = v_clean
      or upper(coalesce(s.forwarding_awb, '')) = v_clean
    )
  limit 1;

  if v_ship.id is null then
    return null;
  end if;

  v_shipper := coalesce(
    nullif(btrim(v_ship.shipper->>'name'), ''),
    nullif(btrim(v_ship.shipper->>'company_name'), ''),
    '—'
  );
  v_consignee := coalesce(
    nullif(btrim(v_ship.consignee->>'name'), ''),
    nullif(btrim(v_ship.consignee->>'company_name'), ''),
    nullif(btrim(v_ship.consignee->>'contact_name'), ''),
    '—'
  );

  if v_ship.vendor_id is not null then
    select name into v_vendor
    from public.vendors
    where id = v_ship.vendor_id
      and tenant_id = v_tenant;
  end if;
  if v_vendor is null then
    v_vendor := '';
  end if;

  if v_ship.destination_id is not null then
    select coalesce(nullif(btrim(name), ''), code) into v_dest
    from public.destinations
    where id = v_ship.destination_id
      and tenant_id = v_tenant;
  end if;
  if v_dest is null then
    v_dest := '';
  end if;

  return jsonb_build_object(
    'shipment_id',    v_ship.id,
    'awb_no',         v_ship.awb_no,
    'forwarding_no',  coalesce(v_ship.forwarding_awb, ''),
    'weight',         to_char(coalesce(nullif(v_ship.charge_weight, 0), v_ship.actual_weight, 0)::numeric, 'FM999990.000'),
    'pcs',            coalesce(v_ship.pieces, 1)::text,
    'shipper',        v_shipper,
    'consignee',      v_consignee,
    'vendor',         v_vendor,
    'airline',        coalesce(v_ship.airline, ''),
    'service',        coalesce(nullif(btrim(v_ship.service), ''), 'SPX'),
    'destination',    v_dest,
    'current_status', v_ship.current_status
  );
end;
$$;

revoke all on function public.lookup_shipment_for_bagging(text) from public;
grant execute on function public.lookup_shipment_for_bagging(text) to authenticated, service_role;
