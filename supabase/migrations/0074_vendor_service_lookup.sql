-- ===========================================================================
-- 0074  Vendor-scoped services for AWB Entry (from service_mappings)
-- ---------------------------------------------------------------------------
-- * list_vendor_services — MRU-style picker filtered by vendor
--   Optional product/destination args reserved for future cascade filters.
-- * BEFORE trigger on shipments — when vendor_id is set, service must match
--   an ACTIVE service_mappings row for that vendor.
-- ===========================================================================

create or replace function public.list_vendor_services(
  p_vendor_id      uuid default null,
  p_vendor_code    text default null,
  p_q              text default null,
  p_limit          integer default 50,
  p_product_id     uuid default null,
  p_destination_id uuid default null
)
returns table (
  id           uuid,
  code         text,
  name         text,
  hint         text,
  vendor_id    uuid,
  service      text,
  service_type text,
  vendor_link  text,
  min_weight   numeric,
  max_weight   numeric
)
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_vendor uuid;
  v_q      text := nullif(btrim(coalesce(p_q, '')), '');
  v_limit  int := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  v_vendor := coalesce(
    p_vendor_id,
    app.resolve_tenant_row_id(v_tenant, 'vendors', null, p_vendor_code)
  );
  -- Also accept vendor *name* (CourierWala / typed labels).
  if v_vendor is null and nullif(btrim(coalesce(p_vendor_code, '')), '') is not null then
    select v.id into v_vendor
    from public.vendors v
    where v.tenant_id = v_tenant
      and v.deleted_at is null
      and upper(v.name) = upper(btrim(p_vendor_code))
    limit 1;
  end if;

  if v_vendor is null then
    return;
  end if;

  -- Reserved for future Vendor → Product → Destination → Service cascade.
  -- Currently unused; kept so clients can pass them without a breaking change.
  perform p_product_id, p_destination_id;

  return query
  select
    sm.id,
    sm.service::text as code,
    coalesce(nullif(btrim(sm.service_type), ''), sm.service)::text as name,
    nullif(btrim(concat_ws(
      ' · ',
      nullif(btrim(coalesce(sm.vendor_link, '')), ''),
      case
        when sm.min_weight is not null or sm.max_weight is not null
          then format('%s–%s kg', sm.min_weight, sm.max_weight)
        else null
      end
    )), '')::text as hint,
    sm.vendor_id,
    sm.service::text,
    sm.service_type::text,
    sm.vendor_link::text,
    sm.min_weight,
    sm.max_weight
  from public.service_mappings sm
  where sm.tenant_id = v_tenant
    and sm.deleted_at is null
    and sm.status = 'ACTIVE'
    and sm.vendor_id = v_vendor
    and (
      v_q is null
      or sm.service ilike '%' || v_q || '%'
      or coalesce(sm.service_type, '') ilike '%' || v_q || '%'
      or coalesce(sm.vendor_link, '') ilike '%' || v_q || '%'
    )
  order by sm.service
  limit v_limit;
end;
$$;

revoke all on function public.list_vendor_services(uuid, text, text, integer, uuid, uuid) from public;
grant execute on function public.list_vendor_services(uuid, text, text, integer, uuid, uuid)
  to authenticated, service_role;

comment on function public.list_vendor_services(uuid, text, text, integer, uuid, uuid) is
  'ACTIVE service_mappings for a vendor (AWB Service picker). Optional product/destination reserved.';

-- ---------------------------------------------------------------------------
-- Validate vendor ↔ service pairing on shipment write
-- ---------------------------------------------------------------------------
create or replace function app.assert_shipment_vendor_service(
  p_tenant uuid,
  p_vendor_id uuid,
  p_service text
)
returns void
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_service text := nullif(btrim(coalesce(p_service, '')), '');
begin
  if p_vendor_id is null then
    return;
  end if;

  if v_service is null then
    raise exception 'Service is required when Vendor is selected' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.service_mappings sm
    where sm.tenant_id = p_tenant
      and sm.deleted_at is null
      and sm.status = 'ACTIVE'
      and sm.vendor_id = p_vendor_id
      and (
        upper(sm.service) = upper(v_service)
        or upper(coalesce(sm.service_type, '')) = upper(v_service)
      )
  ) then
    raise exception 'Service "%" is not mapped to the selected Vendor', v_service
      using errcode = '22023';
  end if;
end;
$$;

revoke all on function app.assert_shipment_vendor_service(uuid, uuid, text) from public;
grant execute on function app.assert_shipment_vendor_service(uuid, uuid, text)
  to authenticated, service_role;

create or replace function app.trg_shipments_vendor_service()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
begin
  perform app.assert_shipment_vendor_service(NEW.tenant_id, NEW.vendor_id, NEW.service);
  return NEW;
end;
$$;

drop trigger if exists trg_shipments_vendor_service on public.shipments;
create trigger trg_shipments_vendor_service
  before insert or update of vendor_id, service
  on public.shipments
  for each row
  execute function app.trg_shipments_vendor_service();
