-- ===========================================================================
-- 0101  inscan downstream gating — Phase 2 Hold Gate & Status Filter in Builders
-- ---------------------------------------------------------------------------
-- Enforces that:
--   1. Shipments with is_held = true are EXCLUDED and BLOCKED from Manifest & DRS
--   2. Manifest accepts both BOOKED and PICKUP_INSCANNED shipments
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
  v_elem   jsonb;
  v_seq    integer := 0;
  v_seen   uuid[] := '{}';
  v_ship   public.shipments;
  v_line   public.manifest_lines;
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

    -- Hold Gate Enforcement
    if v_ship.is_held is true then
      raise exception 'Shipment is on HOLD (reason: %) and cannot be manifested (AWB %)',
        coalesce(v_ship.hold_reason, 'HOLD'), v_ship.awb_no
        using errcode = 'CMS04';
    end if;

    if v_ship.current_status in ('CANCELLED', 'VOID') then
      raise exception 'Cancelled shipments cannot be manifested (AWB %)', v_ship.awb_no
        using errcode = 'CMS04';
    end if;
    if v_ship.current_status not in ('BOOKED', 'PICKUP_INSCANNED') then
      raise exception 'Only BOOKED or PICKUP_INSCANNED shipments may be manifested (AWB % is %)',
        v_ship.awb_no, v_ship.current_status
        using errcode = 'CMS04';
    end if;

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
      shipment_id,
      awb_no,
      bag_no,
      seq,
      created_by,
      updated_by
    ) values (
      p_tenant,
      p_manifest,
      v_ship.id,
      v_ship.awb_no,
      nullif(btrim(coalesce(v_elem->>'bag_no', '')), ''),
      v_seq,
      auth.uid(),
      auth.uid()
    );
  end loop;
end;
$$;

create or replace function app.sync_drs_lines(
  p_tenant  uuid,
  p_drs     uuid,
  p_lines   jsonb
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_elem   jsonb;
  v_seq    integer := 0;
  v_seen   uuid[] := '{}';
  v_ship   public.shipments;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    delete from public.drs_lines
     where tenant_id = p_tenant
       and drs_id = p_drs;
    return;
  end if;

  delete from public.drs_lines
   where tenant_id = p_tenant
     and drs_id = p_drs;

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
      raise exception 'Shipment not found for DRS line (AWB %)', coalesce(v_elem->>'awb_no', 'unknown')
        using errcode = 'P0002';
    end if;

    -- Hold Gate Enforcement
    if v_ship.is_held is true then
      raise exception 'Shipment is on HOLD (reason: %) and cannot be assigned to DRS (AWB %)',
        coalesce(v_ship.hold_reason, 'HOLD'), v_ship.awb_no
        using errcode = 'CMS04';
    end if;

    if v_ship.current_status in ('CANCELLED', 'VOID') then
      raise exception 'Cancelled shipments cannot be assigned to DRS (AWB %)', v_ship.awb_no
        using errcode = 'CMS04';
    end if;
    if v_ship.current_status <> 'MANIFEST_INSCANNED' then
      raise exception 'Only MANIFEST_INSCANNED shipments may be added to DRS (AWB % is %)',
        v_ship.awb_no, v_ship.current_status
        using errcode = 'CMS04';
    end if;

    if v_ship.id = any (v_seen) then
      raise exception 'Duplicate shipment on DRS (AWB %)', v_ship.awb_no
        using errcode = 'CMS04';
    end if;
    v_seen := array_append(v_seen, v_ship.id);

    if exists (
      select 1
        from public.drs_lines dl
        join public.drs d
          on d.tenant_id = dl.tenant_id and d.id = dl.drs_id
       where dl.tenant_id = p_tenant
         and dl.shipment_id = v_ship.id
         and dl.deleted_at is null
         and d.deleted_at is null
         and d.status in ('DRAFT', 'DISPATCHED')
         and d.id <> p_drs
    ) then
      raise exception 'Shipment already assigned on another active DRS (AWB %)', v_ship.awb_no
        using errcode = 'CMS04';
    end if;

    v_seq := v_seq + 1;

    insert into public.drs_lines (
      tenant_id,
      drs_id,
      shipment_id,
      awb_no,
      seq,
      created_by,
      updated_by
    ) values (
      p_tenant,
      p_drs,
      v_ship.id,
      v_ship.awb_no,
      v_seq,
      auth.uid(),
      auth.uid()
    );
  end loop;
end;
$$;
