-- ===========================================================================
-- 0104  international kyc manifest gate
-- ---------------------------------------------------------------------------
-- Enforces that:
--   International shipments must have at least one valid KYC document attached
--   (either in shipment_attachments or recorded document/IEC) before they can
--   be added to a manifest.
-- ===========================================================================

create or replace function app.sync_manifest_lines(
  p_tenant    uuid,
  p_manifest  uuid,
  p_lines     jsonb
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_elem       jsonb;
  v_seq        integer := 0;
  v_seen       uuid[] := '{}';
  v_ship       public.shipments;
  v_line       public.manifest_lines;
  v_dest_type  text;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    delete from public.manifest_lines
     where tenant_id = p_tenant
       and manifest_id = p_manifest;
    return;
  end if;

  delete from public.manifest_lines
   where tenant_id = p_tenant
     and manifest_id = p_manifest;

  for v_elem in select * from jsonb_array_elements(p_lines) loop
    if v_elem->>'shipment_id' is null and v_elem->>'awb_no' is null then
      continue;
    end if;

    if v_elem->>'shipment_id' is not null then
      select * into v_ship
        from public.shipments
       where tenant_id = p_tenant
         and id = (v_elem->>'shipment_id')::uuid
         and deleted_at is null;
    else
      select * into v_ship
        from public.shipments
       where tenant_id = p_tenant
         and awb_no = btrim(v_elem->>'awb_no')
         and deleted_at is null;
    end if;

    if v_ship.id is null then
      raise exception 'Shipment not found for manifest line (AWB %)', coalesce(v_elem->>'awb_no', 'unknown')
        using errcode = 'P0002';
    end if;

    -- 1. Hold Gate Enforcement
    if v_ship.is_held is true then
      raise exception 'Shipment is on HOLD (reason: %) and cannot be manifested (AWB %)',
        coalesce(v_ship.hold_reason, 'HOLD'), v_ship.awb_no
        using errcode = 'CMS04';
    end if;

    -- 2. Status Machine Gate
    if v_ship.current_status in ('CANCELLED', 'VOID') then
      raise exception 'Cancelled shipments cannot be manifested (AWB %)', v_ship.awb_no
        using errcode = 'CMS04';
    end if;
    if v_ship.current_status not in ('BOOKED', 'PICKUP_INSCANNED') then
      raise exception 'Only BOOKED or PICKUP_INSCANNED shipments may be manifested (AWB % is %)',
        v_ship.awb_no, v_ship.current_status
        using errcode = 'CMS04';
    end if;

    -- 3. International KYC Gate (#47)
    select d.dest_type into v_dest_type
      from public.destinations d
     where d.id = v_ship.destination_id
       and d.tenant_id = p_tenant
       and d.deleted_at is null;

    if coalesce(v_dest_type, 'DOMESTIC') = 'INTERNATIONAL' then
      if not exists (
        select 1
          from public.shipment_attachments sa
         where sa.tenant_id = p_tenant
           and sa.shipment_id = v_ship.id
           and sa.deleted_at is null
      ) and coalesce(v_ship.shipper->>'documentNo', '') = '' and coalesce(v_ship.shipper->>'iecNo', '') = '' then
        raise exception 'International shipment must have at least one valid KYC document attached before it can be manifested (AWB %)',
          v_ship.awb_no
          using errcode = 'CMS04';
      end if;
    end if;

    -- 4. Duplication & Existing Active Manifest Checks
    if v_ship.id = any (v_seen) then
      raise exception 'Duplicate shipment on manifest (AWB %)', v_ship.awb_no
        using errcode = 'CMS04';
    end if;
    v_seen := array_append(v_seen, v_ship.id);

    if exists (
      select 1
        from public.manifest_lines ml
        join public.manifests m
          on m.tenant_id = ml.tenant_id and m.id = ml.manifest_id
       where ml.tenant_id = p_tenant
         and ml.shipment_id = v_ship.id
         and ml.deleted_at is null
         and m.deleted_at is null
         and m.status <> 'CANCELLED'
         and m.id <> p_manifest
    ) then
      raise exception 'Shipment already manifested on another active manifest (AWB %)', v_ship.awb_no
        using errcode = 'CMS04';
    end if;

    v_seq := v_seq + 1;

    insert into public.manifest_lines (
      tenant_id,
      manifest_id,
      seq,
      shipment_id,
      awb_no,
      reference_no,
      forwarding_no,
      crn_mhbs_no,
      bag_no,
      pieces,
      actual_weight,
      charge_weight,
      book_date,
      origin_code,
      origin_name,
      destination_code,
      destination_name,
      customer_code,
      customer_name,
      consignee_name,
      instruction
    ) values (
      p_tenant,
      p_manifest,
      v_seq,
      v_ship.id,
      v_ship.awb_no,
      v_ship.reference_no,
      coalesce(v_elem->>'forwarding_no', v_ship.forwarding_awb),
      v_elem->>'crn_mhbs_no',
      v_elem->>'bag_no',
      coalesce((v_elem->>'pieces')::integer, v_ship.pieces, 1),
      coalesce((v_elem->>'actual_weight')::numeric, v_ship.actual_weight, 0),
      coalesce((v_elem->>'charge_weight')::numeric, v_ship.charge_weight, 0),
      v_ship.book_date,
      (select d.code from public.destinations d where d.id = v_ship.origin_destination_id and d.tenant_id = p_tenant),
      (select d.name from public.destinations d where d.id = v_ship.origin_destination_id and d.tenant_id = p_tenant),
      (select d.code from public.destinations d where d.id = v_ship.destination_id and d.tenant_id = p_tenant),
      (select d.name from public.destinations d where d.id = v_ship.destination_id and d.tenant_id = p_tenant),
      (select c.code from public.customers c where c.id = v_ship.customer_id and c.tenant_id = p_tenant),
      (select c.name from public.customers c where c.id = v_ship.customer_id and c.tenant_id = p_tenant),
      coalesce(v_ship.consignee->>'name', v_ship.consignee->>'company_name', v_ship.consignee->>'contact_name'),
      v_elem->>'instruction'
    );
  end loop;
end;
$$;

comment on function app.sync_manifest_lines(uuid, uuid, jsonb) is
  'Manifest line synchronizer enforcing hold gates, status machines, and international KYC document presence.';
