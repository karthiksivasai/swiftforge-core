-- Bagging integrity.
-- Requires txn.bagging on every bagging RPC, rejects unknown AWBs and an
-- invented weight of 10, compares row_version, allocates manifest numbers
-- only through app.allocate_document_no, and keeps replaced lines as
-- soft-deleted history. CSB, TIFF, CSV-M, email, Print AWB, and Generate
-- Forwarding stay unimplemented until a specification exists.
-- List and detail keep the branch-scope checks from 0119.

-- ---------------------------------------------------------------------------
-- Live AWB can sit on only one manifest
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from public.bagging_awb_lines
    where deleted_at is null
      and btrim(coalesce(awb_no, '')) <> ''
    group by tenant_id, upper(awb_no)
    having count(*) > 1
  ) then
    raise exception '0120 stopped: duplicate live bagging AWBs exist. Remove the extra lines before this unique rule can be added.';
  end if;
end $$;

create unique index if not exists bagging_awb_lines_live_awb_uq
  on public.bagging_awb_lines (tenant_id, upper(awb_no))
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- lookup_shipment_for_bagging
-- ---------------------------------------------------------------------------
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
    and (upper(s.awb_no) = v_clean or upper(s.forwarding_no) = v_clean)
  limit 1;

  if v_ship.id is null then
    return null;
  end if;

  if v_ship.shipper_id is not null then
    select name into v_shipper from public.shippers where id = v_ship.shipper_id;
  end if;
  if v_shipper is null or v_shipper = '' then
    v_shipper := coalesce(v_ship.shipper, '—');
  end if;

  if v_ship.consignee_id is not null then
    select name into v_consignee from public.consignees where id = v_ship.consignee_id;
  end if;
  if v_consignee is null or v_consignee = '' then
    v_consignee := coalesce(v_ship.consignee, '—');
  end if;

  if v_ship.vendor_id is not null then
    select name into v_vendor from public.vendors where id = v_ship.vendor_id;
  end if;
  if v_vendor is null then
    v_vendor := '';
  end if;

  if v_ship.destination_id is not null then
    select name into v_dest from public.destinations where id = v_ship.destination_id;
  end if;
  if v_dest is null then
    v_dest := coalesce(v_ship.dest_code, '');
  end if;

  return jsonb_build_object(
    'shipment_id',  v_ship.id,
    'awb_no',       v_ship.awb_no,
    'forwarding_no',coalesce(v_ship.forwarding_no, ''),
    'weight',       to_char(coalesce(nullif(v_ship.charge_weight, 0), v_ship.actual_weight, 0)::numeric, 'FM999990.000'),
    'pcs',          coalesce(v_ship.pieces, 1)::text,
    'shipper',      v_shipper,
    'consignee',    v_consignee,
    'vendor',       v_vendor,
    'airline',      coalesce(v_ship.airline, ''),
    'service',      coalesce(v_ship.service, 'SPX'),
    'destination',  v_dest,
    'current_status', v_ship.current_status
  );
end;
$$;

revoke all on function public.lookup_shipment_for_bagging(text) from public;
grant execute on function public.lookup_shipment_for_bagging(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- record_bagging
-- ---------------------------------------------------------------------------
create or replace function public.record_bagging(
  p_id      uuid,
  p_header  jsonb,
  p_lines   jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant          uuid := app.current_tenant_id();
  v_user            uuid := auth.uid();
  v_bagging_id      uuid := p_id;
  v_manifest_no     text;
  v_date            date;
  v_branch_id       uuid;
  v_vendor_id       uuid;
  v_dest_vendor_id  uuid;
  v_elem            jsonb;
  v_line_weight     numeric(12,3);
  v_line_pcs        integer;
  v_ship_weight     numeric(12,3);
  v_charge          numeric;
  v_actual          numeric;
  v_ship_pcs        integer;
  v_tot_weight      numeric(12,3) := 0;
  v_tot_pcs         integer := 0;
  v_tot_awbs        integer := 0;
  v_bag_set         text[] := '{}';
  v_seen            text[] := '{}';
  v_tot_bags        integer := 0;
  v_inserted        public.bagging_manifests%rowtype;
  v_alloc           record;
  v_shipment_id     uuid;
  v_awb             text;
  v_ready           jsonb := '[]'::jsonb;
  v_expected        integer;
begin
  if v_tenant is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if v_bagging_id is null then
    if not app.user_has_permission(v_tenant, 'txn.bagging', 'add') then
      raise exception 'Bagging permission is required' using errcode = '42501';
    end if;
  elsif not app.user_has_permission(v_tenant, 'txn.bagging', 'modify') then
    raise exception 'Bagging permission is required' using errcode = '42501';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    p_lines := '[]'::jsonb;
  end if;
  if jsonb_array_length(p_lines) > 500 then
    raise exception 'A bagging manifest cannot hold more than 500 lines' using errcode = '22023';
  end if;

  v_date := coalesce(nullif(p_header->>'date', '')::date, current_date);

  select b.id into v_branch_id
  from public.branches b
  where b.tenant_id = v_tenant
    and b.deleted_at is null
    and upper(b.code) = upper(coalesce(p_header->'serviceCenter'->>'code', p_header->'originCity'->>'code', ''))
  limit 1;

  if p_header->'vendor'->>'code' is not null and btrim(p_header->'vendor'->>'code') <> '' then
    select v.id into v_vendor_id
    from public.vendors v
    where v.tenant_id = v_tenant
      and v.deleted_at is null
      and upper(v.code) = upper(btrim(p_header->'vendor'->>'code'))
    limit 1;
  end if;

  if p_header->'destVendor'->>'code' is not null and btrim(p_header->'destVendor'->>'code') <> '' then
    select v.id into v_dest_vendor_id
    from public.vendors v
    where v.tenant_id = v_tenant
      and v.deleted_at is null
      and upper(v.code) = upper(btrim(p_header->'destVendor'->>'code'))
    limit 1;
  end if;

  for v_elem in select * from jsonb_array_elements(p_lines) loop
    v_awb := upper(btrim(coalesce(v_elem->>'awbNo', '')));
    if v_awb = '' then
      raise exception 'Each bagging line needs an AWB' using errcode = '22023';
    end if;
    if v_awb = any(v_seen) then
      raise exception 'AWB % is duplicated in this save', v_awb using errcode = '23505';
    end if;
    v_seen := array_append(v_seen, v_awb);

    v_shipment_id := null;
    v_charge := null;
    v_actual := null;
    v_ship_pcs := null;
    select s.id, s.charge_weight, s.actual_weight, s.pieces
      into v_shipment_id, v_charge, v_actual, v_ship_pcs
    from public.shipments s
    where s.tenant_id = v_tenant
      and s.deleted_at is null
      and upper(s.awb_no) = v_awb
    limit 1;

    if v_shipment_id is null then
      raise exception 'AWB % is not in shipments', v_awb using errcode = '23503';
    end if;

    if exists (
      select 1
      from public.bagging_awb_lines bal
      where bal.tenant_id = v_tenant
        and bal.deleted_at is null
        and upper(bal.awb_no) = v_awb
        and bal.bagging_id is distinct from v_bagging_id
    ) then
      raise exception 'AWB % is already on another bagging manifest', v_awb using errcode = '23505';
    end if;

    v_ship_weight := case
      when coalesce(v_charge, 0) > 0 then v_charge
      else coalesce(v_actual, 0)
    end;
    if v_ship_weight <= 0 then
      raise exception 'Shipment % has no weight', v_awb using errcode = '22023';
    end if;

    if nullif(replace(coalesce(v_elem->>'weight', ''), ',', ''), '') is null then
      v_line_weight := v_ship_weight;
    else
      v_line_weight := replace(v_elem->>'weight', ',', '')::numeric;
      if v_line_weight <= 0 then
        raise exception 'Weight must be greater than zero for AWB %', v_awb using errcode = '22023';
      end if;
      if v_line_weight = 10 and v_ship_weight <> 10 then
        raise exception 'Weight 10.000 is not allowed unless the shipment weight is 10 (AWB %)', v_awb using errcode = '22023';
      end if;
    end if;

    v_line_pcs := coalesce(nullif(v_elem->>'pcs', '')::integer, v_ship_pcs, 1);
    if v_line_pcs < 1 then
      raise exception 'Pieces must be at least 1 for AWB %', v_awb using errcode = '22023';
    end if;

    v_tot_weight := v_tot_weight + v_line_weight;
    v_tot_pcs := v_tot_pcs + v_line_pcs;
    v_tot_awbs := v_tot_awbs + 1;
    if not (v_bag_set @> array[coalesce(nullif(btrim(v_elem->>'bagNo'), ''), '1')]) then
      v_bag_set := array_append(v_bag_set, coalesce(nullif(btrim(v_elem->>'bagNo'), ''), '1'));
    end if;

    v_ready := v_ready || jsonb_build_array(jsonb_build_object(
      'bagNo', coalesce(nullif(btrim(v_elem->>'bagNo'), ''), '1'),
      'awbNo', v_awb,
      'crnMhbsNo', nullif(btrim(v_elem->>'crnMhbsNo'), ''),
      'forwardingNo', nullif(btrim(v_elem->>'forwardingNo'), ''),
      'weight', v_line_weight,
      'pcs', v_line_pcs,
      'shipper', nullif(btrim(v_elem->>'shipper'), ''),
      'consignee', nullif(btrim(v_elem->>'consignee'), ''),
      'vendor', nullif(btrim(v_elem->>'vendor'), ''),
      'airline', nullif(btrim(v_elem->>'airline'), ''),
      'service', nullif(btrim(v_elem->>'service'), ''),
      'destination', nullif(btrim(v_elem->>'destination'), ''),
      'shipmentId', v_shipment_id
    ));
  end loop;
  v_tot_bags := coalesce(array_length(v_bag_set, 1), 0);

  if v_bagging_id is null then
    select * into v_alloc from app.allocate_document_no(v_tenant, 'BAGGING', v_branch_id, null);
    v_manifest_no := v_alloc.formatted_no;
    if v_manifest_no is null or btrim(v_manifest_no) = '' then
      raise exception 'Could not allocate a bagging manifest number' using errcode = 'P0001';
    end if;

    insert into public.bagging_manifests (
      tenant_id, manifest_no, manifest_date,
      origin_city_code, origin_city_name, origin_country_code, origin_country_name,
      airlines_code, airlines_name, arrival_airport,
      master_airlines_prefix, master_awb_no_part, master_no_part3, mawb_master_no,
      vendor_id, vendor_code, vendor_name,
      cd_no, edi_master_no, bagging_remark,
      service_center_id, service_center_code, service_center_name,
      dest_country_code, dest_country_name, dest_city_code, dest_city_name,
      flight_no1_code, flight_no1_name, flight_no2_code, flight_no2_name,
      arrival_date, arrival_time,
      dest_vendor_id, dest_vendor_code, dest_vendor_name,
      is_forwarding, manifest_type, transfer_to_uk,
      total_bags, total_pieces, total_weight, total_awbs,
      status, created_by, updated_by
    ) values (
      v_tenant, v_manifest_no, v_date,
      p_header->'originCity'->>'code', p_header->'originCity'->>'name',
      p_header->'originCountry'->>'code', p_header->'originCountry'->>'name',
      p_header->'airlinesCode'->>'code', p_header->'airlinesCode'->>'name',
      p_header->>'arrivalAirport',
      p_header->>'masterAirlinesPrefix', p_header->>'masterAwbNoPart',
      p_header->>'masterNoPart3', p_header->>'mawbMasterNo',
      v_vendor_id, p_header->'vendor'->>'code', p_header->'vendor'->>'name',
      p_header->>'cdNo', p_header->>'ediMasterNo', p_header->>'baggingRemark',
      v_branch_id, p_header->'serviceCenter'->>'code', p_header->'serviceCenter'->>'name',
      p_header->'destCountry'->>'code', p_header->'destCountry'->>'name',
      p_header->'destCity'->>'code', p_header->'destCity'->>'name',
      p_header->'flightNo1'->>'code', p_header->'flightNo1'->>'name',
      p_header->'flightNo2'->>'code', p_header->'flightNo2'->>'name',
      nullif(p_header->>'arrivalDate', '')::date, p_header->>'arrivalTime',
      v_dest_vendor_id, p_header->'destVendor'->>'code', p_header->'destVendor'->>'name',
      coalesce((p_header->>'isForwarding')::boolean, false),
      nullif(p_header->>'manifestType', ''),
      coalesce((p_header->>'transferToUk')::boolean, false),
      v_tot_bags, v_tot_pcs, v_tot_weight, v_tot_awbs,
      'OPEN', v_user, v_user
    )
    returning * into v_inserted;

    v_bagging_id := v_inserted.id;

    insert into public.bagging_events (
      tenant_id, bagging_id, manifest_no, event_type, event_text, payload, created_by
    ) values (
      v_tenant, v_bagging_id, v_manifest_no, 'BAGGING_CREATED',
      format('Bagging manifest %s created with %s bags and %s AWBs', v_manifest_no, v_tot_bags, v_tot_awbs),
      jsonb_build_object('total_bags', v_tot_bags, 'total_weight', v_tot_weight, 'total_awbs', v_tot_awbs),
      v_user
    );
  else
    v_expected := nullif(p_header->>'rowVersion', '')::integer;
    if v_expected is null or v_expected < 1 then
      raise exception 'Reload the manifest before saving' using errcode = '40001';
    end if;

    update public.bagging_manifests
    set manifest_date           = v_date,
        origin_city_code        = p_header->'originCity'->>'code',
        origin_city_name        = p_header->'originCity'->>'name',
        origin_country_code     = p_header->'originCountry'->>'code',
        origin_country_name     = p_header->'originCountry'->>'name',
        airlines_code           = p_header->'airlinesCode'->>'code',
        airlines_name           = p_header->'airlinesCode'->>'name',
        arrival_airport         = p_header->>'arrivalAirport',
        master_airlines_prefix  = p_header->>'masterAirlinesPrefix',
        master_awb_no_part      = p_header->>'masterAwbNoPart',
        master_no_part3         = p_header->>'masterNoPart3',
        mawb_master_no          = p_header->>'mawbMasterNo',
        vendor_id               = v_vendor_id,
        vendor_code             = p_header->'vendor'->>'code',
        vendor_name             = p_header->'vendor'->>'name',
        cd_no                   = p_header->>'cdNo',
        edi_master_no           = p_header->>'ediMasterNo',
        bagging_remark          = p_header->>'baggingRemark',
        service_center_id       = v_branch_id,
        service_center_code     = p_header->'serviceCenter'->>'code',
        service_center_name     = p_header->'serviceCenter'->>'name',
        dest_country_code       = p_header->'destCountry'->>'code',
        dest_country_name       = p_header->'destCountry'->>'name',
        dest_city_code          = p_header->'destCity'->>'code',
        dest_city_name          = p_header->'destCity'->>'name',
        flight_no1_code         = p_header->'flightNo1'->>'code',
        flight_no1_name         = p_header->'flightNo1'->>'name',
        flight_no2_code         = p_header->'flightNo2'->>'code',
        flight_no2_name         = p_header->'flightNo2'->>'name',
        arrival_date            = nullif(p_header->>'arrivalDate', '')::date,
        arrival_time            = p_header->>'arrivalTime',
        dest_vendor_id          = v_dest_vendor_id,
        dest_vendor_code        = p_header->'destVendor'->>'code',
        dest_vendor_name        = p_header->'destVendor'->>'name',
        is_forwarding           = coalesce((p_header->>'isForwarding')::boolean, false),
        manifest_type           = nullif(p_header->>'manifestType', ''),
        transfer_to_uk          = coalesce((p_header->>'transferToUk')::boolean, false),
        total_bags              = v_tot_bags,
        total_pieces            = v_tot_pcs,
        total_weight            = v_tot_weight,
        total_awbs              = v_tot_awbs,
        updated_at              = now(),
        updated_by              = v_user,
        row_version             = row_version + 1
    where id = v_bagging_id
      and tenant_id = v_tenant
      and deleted_at is null
      and row_version = v_expected
    returning * into v_inserted;

    if v_inserted.id is null then
      if not exists (
        select 1 from public.bagging_manifests
        where id = v_bagging_id and tenant_id = v_tenant and deleted_at is null
      ) then
        raise exception 'Bagging manifest not found' using errcode = 'P0002';
      end if;
      raise exception 'This manifest was changed by someone else. Reload and try again.' using errcode = '40001';
    end if;

    v_manifest_no := v_inserted.manifest_no;

    insert into public.bagging_events (
      tenant_id, bagging_id, manifest_no, event_type, event_text, payload, created_by
    ) values (
      v_tenant, v_bagging_id, v_manifest_no, 'BAGGING_UPDATED',
      format('Bagging manifest %s updated with %s bags and %s AWBs', v_manifest_no, v_tot_bags, v_tot_awbs),
      jsonb_build_object('total_bags', v_tot_bags, 'total_weight', v_tot_weight, 'total_awbs', v_tot_awbs),
      v_user
    );
  end if;

  update public.bagging_awb_lines
  set deleted_at = now(),
      updated_at = now(),
      updated_by = v_user
  where bagging_id = v_bagging_id
    and tenant_id = v_tenant
    and deleted_at is null;

  for v_elem in select * from jsonb_array_elements(v_ready) loop
    insert into public.bagging_awb_lines (
      tenant_id, bagging_id, bag_no, awb_no, crn_mhbs_no, forwarding_no,
      weight, pcs, shipper, consignee, vendor, airline, service, destination,
      shipment_id, created_by, updated_by
    ) values (
      v_tenant,
      v_bagging_id,
      v_elem->>'bagNo',
      v_elem->>'awbNo',
      v_elem->>'crnMhbsNo',
      v_elem->>'forwardingNo',
      (v_elem->>'weight')::numeric,
      (v_elem->>'pcs')::integer,
      v_elem->>'shipper',
      v_elem->>'consignee',
      v_elem->>'vendor',
      v_elem->>'airline',
      v_elem->>'service',
      v_elem->>'destination',
      (v_elem->>'shipmentId')::uuid,
      v_user,
      v_user
    );

    insert into public.shipment_scan_events (
      tenant_id, shipment_id, awb_no, event_type, event_text, payload, created_by, updated_by
    ) values (
      v_tenant,
      (v_elem->>'shipmentId')::uuid,
      v_elem->>'awbNo',
      'BAGGING_SCAN',
      format('Shipment added to Bag %s in Manifest %s', v_elem->>'bagNo', v_manifest_no),
      jsonb_build_object(
        'bag_no', v_elem->>'bagNo',
        'manifest_no', v_manifest_no,
        'flight', p_header->'flightNo1'->>'code',
        'destination', p_header->'destCity'->>'code'
      ),
      v_user,
      v_user
    );
  end loop;

  return jsonb_build_object(
    'id',            v_inserted.id,
    'manifest_no',   v_inserted.manifest_no,
    'manifest_date', v_inserted.manifest_date,
    'total_bags',    v_inserted.total_bags,
    'total_pieces',  v_inserted.total_pieces,
    'total_weight',  v_inserted.total_weight,
    'total_awbs',    v_inserted.total_awbs,
    'status',        v_inserted.status,
    'row_version',   v_inserted.row_version,
    'created_at',    v_inserted.created_at
  );
end;
$$;

revoke all on function public.record_bagging(uuid, jsonb, jsonb) from public;
grant execute on function public.record_bagging(uuid, jsonb, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- list_baggings — extra filters, still inside the 0119 branch scope
-- ---------------------------------------------------------------------------
drop function if exists public.list_baggings(text, text, text, integer, integer);

create function public.list_baggings(
  p_product_code  text default null,
  p_vendor_code   text default null,
  p_search        text default null,
  p_limit         integer default 50,
  p_offset        integer default 0,
  p_from_date     date default null,
  p_to_date       date default null,
  p_status        text default null
)
returns table (
  id              uuid,
  manifest_no     text,
  master_awb_no   text,
  manifest_date   date,
  origin          text,
  from_city       text,
  to_city         text,
  destination     text,
  vendor_name     text,
  vendor_code     text,
  total_awbs      integer,
  total_weight    numeric,
  total_bags      integer,
  status          text,
  created_at      timestamptz
)
language plpgsql
volatile
security definer
set search_path = public, app
as $$
declare
  v_tenant  uuid := app.current_tenant_id();
  v_pat     text := '%' || replace(replace(coalesce(btrim(p_search), ''), '%', '\%'), '_', '\_') || '%';
begin
  if v_tenant is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if not app.user_has_permission(v_tenant, 'txn.bagging', 'list')
     and not app.user_has_permission(v_tenant, 'txn.bagging', 'search') then
    raise exception 'Bagging permission is required' using errcode = '42501';
  end if;

  return query
  select
    bm.id,
    bm.manifest_no,
    coalesce(
      nullif(btrim(concat(bm.master_airlines_prefix, bm.master_awb_no_part, bm.master_no_part3)), ''),
      bm.mawb_master_no,
      ''
    ) as master_awb_no,
    bm.manifest_date,
    coalesce(bm.origin_city_code, bm.origin_city_name, '') as origin,
    coalesce(bm.origin_city_code, bm.origin_city_name, '') as from_city,
    coalesce(bm.dest_city_code, bm.dest_city_name, '') as to_city,
    coalesce(bm.dest_city_code, bm.dest_city_name, '') as destination,
    coalesce(bm.vendor_name, bm.vendor_code, '') as vendor_name,
    coalesce(bm.vendor_code, '') as vendor_code,
    bm.total_awbs,
    bm.total_weight,
    bm.total_bags,
    bm.status,
    bm.created_at
  from public.bagging_manifests bm
  where bm.tenant_id = v_tenant
    and bm.deleted_at is null
    and app.manifest_visible_and_audit(
      bm.tenant_id, bm.id, bm.service_center_id, bm.destination_branch_id, bm.is_handover, 'bagging_manifests'
    )
    and (p_vendor_code is null or btrim(p_vendor_code) = '' or upper(bm.vendor_code) = upper(btrim(p_vendor_code)))
    and (p_from_date is null or bm.manifest_date >= p_from_date)
    and (p_to_date is null or bm.manifest_date <= p_to_date)
    and (p_status is null or btrim(p_status) = '' or upper(bm.status) = upper(btrim(p_status)))
    and (
      p_product_code is null or btrim(p_product_code) = ''
      or exists (
        select 1
        from public.bagging_awb_lines bal
        join public.shipments s
          on s.id = bal.shipment_id
         and s.tenant_id = bal.tenant_id
         and s.deleted_at is null
        join public.products pr
          on pr.id = s.product_id
         and pr.tenant_id = s.tenant_id
         and pr.deleted_at is null
        where bal.bagging_id = bm.id
          and bal.tenant_id = bm.tenant_id
          and bal.deleted_at is null
          and upper(pr.code) = upper(btrim(p_product_code))
      )
    )
    and (p_search is null or btrim(p_search) = '' or (
      bm.manifest_no ilike v_pat or
      bm.mawb_master_no ilike v_pat or
      bm.origin_city_code ilike v_pat or
      bm.dest_city_code ilike v_pat or
      bm.vendor_name ilike v_pat or
      exists (
        select 1
        from public.bagging_awb_lines bal
        where bal.bagging_id = bm.id
          and bal.tenant_id = bm.tenant_id
          and bal.deleted_at is null
          and (bal.bag_no ilike v_pat or bal.awb_no ilike v_pat)
      )
    ))
  order by bm.manifest_date desc, bm.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 500)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.list_baggings(text, text, text, integer, integer, date, date, text) from public;
grant execute on function public.list_baggings(text, text, text, integer, integer, date, date, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- get_bagging_details — same scope as 0119, plus rowVersion
-- ---------------------------------------------------------------------------
create or replace function public.get_bagging_details(p_bagging_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app
as $$
declare
  v_tenant  uuid := app.current_tenant_id();
  v_header  public.bagging_manifests%rowtype;
  v_lines   jsonb;
begin
  if v_tenant is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if not app.user_has_permission(v_tenant, 'txn.bagging', 'list')
     and not app.user_has_permission(v_tenant, 'txn.bagging', 'search') then
    raise exception 'Bagging permission is required' using errcode = '42501';
  end if;

  select * into v_header
  from public.bagging_manifests
  where id = p_bagging_id
    and tenant_id = v_tenant
    and deleted_at is null;

  if v_header.id is null then
    return null;
  end if;

  if not app.manifest_visible_and_audit(
    v_header.tenant_id, v_header.id, v_header.service_center_id,
    v_header.destination_branch_id, v_header.is_handover, 'bagging_manifests'
  ) then
    return null;
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id',           bal.id,
      'bagNo',        bal.bag_no,
      'awbNo',        bal.awb_no,
      'crnMhbsNo',    coalesce(bal.crn_mhbs_no, ''),
      'forwardingNo', coalesce(bal.forwarding_no, ''),
      'weight',       to_char(bal.weight, 'FM999990.000'),
      'pcs',          bal.pcs::text,
      'shipper',      coalesce(bal.shipper, ''),
      'consignee',    coalesce(bal.consignee, ''),
      'vendor',       coalesce(bal.vendor, ''),
      'airline',      coalesce(bal.airline, ''),
      'service',      coalesce(bal.service, ''),
      'destination',  coalesce(bal.destination, '')
    ) order by bal.created_at asc
  ) into v_lines
  from public.bagging_awb_lines bal
  where bal.bagging_id = p_bagging_id
    and bal.tenant_id = v_tenant
    and bal.deleted_at is null;

  return jsonb_build_object(
    'id',                     v_header.id,
    'manifestNo',             v_header.manifest_no,
    'date',                   v_header.manifest_date::text,
    'rowVersion',             v_header.row_version,
    'originCity',             jsonb_build_object('code', coalesce(v_header.origin_city_code, ''), 'name', coalesce(v_header.origin_city_name, '')),
    'originCountry',          jsonb_build_object('code', coalesce(v_header.origin_country_code, ''), 'name', coalesce(v_header.origin_country_name, '')),
    'airlinesCode',           jsonb_build_object('code', coalesce(v_header.airlines_code, ''), 'name', coalesce(v_header.airlines_name, '')),
    'arrivalAirport',         coalesce(v_header.arrival_airport, ''),
    'masterAirlinesPrefix',   coalesce(v_header.master_airlines_prefix, ''),
    'masterAwbNoPart',        coalesce(v_header.master_awb_no_part, ''),
    'masterNoPart3',          coalesce(v_header.master_no_part3, ''),
    'mawbMasterNo',           coalesce(v_header.mawb_master_no, ''),
    'vendor',                 jsonb_build_object('code', coalesce(v_header.vendor_code, ''), 'name', coalesce(v_header.vendor_name, '')),
    'cdNo',                   coalesce(v_header.cd_no, ''),
    'ediMasterNo',            coalesce(v_header.edi_master_no, ''),
    'baggingRemark',          coalesce(v_header.bagging_remark, ''),
    'serviceCenter',          jsonb_build_object('code', coalesce(v_header.service_center_code, ''), 'name', coalesce(v_header.service_center_name, '')),
    'destCountry',            jsonb_build_object('code', coalesce(v_header.dest_country_code, ''), 'name', coalesce(v_header.dest_country_name, '')),
    'destCity',               jsonb_build_object('code', coalesce(v_header.dest_city_code, ''), 'name', coalesce(v_header.dest_city_name, '')),
    'flightNo1',              jsonb_build_object('code', coalesce(v_header.flight_no1_code, ''), 'name', coalesce(v_header.flight_no1_name, '')),
    'flightNo2',              jsonb_build_object('code', coalesce(v_header.flight_no2_code, ''), 'name', coalesce(v_header.flight_no2_name, '')),
    'arrivalDate',            coalesce(v_header.arrival_date::text, ''),
    'arrivalTime',            coalesce(v_header.arrival_time, ''),
    'destVendor',             jsonb_build_object('code', coalesce(v_header.dest_vendor_code, ''), 'name', coalesce(v_header.dest_vendor_name, '')),
    'isForwarding',           v_header.is_forwarding,
    'manifestType',           coalesce(v_header.manifest_type, ''),
    'transferToUk',           v_header.transfer_to_uk,
    'totalBags',              v_header.total_bags,
    'totalPieces',            v_header.total_pieces,
    'totalWeight',            to_char(v_header.total_weight, 'FM999990.000'),
    'totalAwbs',              v_header.total_awbs,
    'status',                 v_header.status,
    'awbLines',               coalesce(v_lines, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_bagging_details(uuid) from public;
grant execute on function public.get_bagging_details(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- delete_bagging
-- ---------------------------------------------------------------------------
create or replace function public.delete_bagging(p_bagging_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant  uuid := app.current_tenant_id();
  v_user    uuid := auth.uid();
  v_no      text;
begin
  if v_tenant is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if not app.user_has_permission(v_tenant, 'txn.bagging', 'delete') then
    raise exception 'Bagging permission is required' using errcode = '42501';
  end if;

  select manifest_no into v_no
  from public.bagging_manifests
  where id = p_bagging_id and tenant_id = v_tenant and deleted_at is null;

  if v_no is null then
    return false;
  end if;

  update public.bagging_manifests
  set deleted_at = now(),
      updated_at = now(),
      updated_by = v_user
  where id = p_bagging_id and tenant_id = v_tenant and deleted_at is null;

  update public.bagging_awb_lines
  set deleted_at = now(),
      updated_at = now(),
      updated_by = v_user
  where bagging_id = p_bagging_id and tenant_id = v_tenant and deleted_at is null;

  insert into public.bagging_events (
    tenant_id, bagging_id, manifest_no, event_type, event_text, created_by
  ) values (
    v_tenant, p_bagging_id, v_no, 'BAGGING_DELETED', format('Bagging manifest %s deleted', v_no), v_user
  );

  return true;
end;
$$;

revoke all on function public.delete_bagging(uuid) from public;
grant execute on function public.delete_bagging(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- record_bagging_progress
-- Delete mode writes a reversal event. It does not remove the earlier event
-- or the earlier shipment scan. That behavior stays until a spec says otherwise.
-- ---------------------------------------------------------------------------
create or replace function public.record_bagging_progress(
  p_bagging_id          uuid,
  p_bag_no              text,
  p_progress_date       date,
  p_progress_time       text,
  p_service_center_code text,
  p_exception_code      text,
  p_mode                text default 'add'
)
returns boolean
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant   uuid := app.current_tenant_id();
  v_user     uuid := auth.uid();
  v_manifest public.bagging_manifests%rowtype;
  v_action   text := case when lower(p_mode) = 'delete' then 'Progress Deleted' else 'Progress Added' end;
  v_line     record;
begin
  if v_tenant is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if not app.user_has_permission(v_tenant, 'txn.bagging', 'modify') then
    raise exception 'Bagging permission is required' using errcode = '42501';
  end if;

  select * into v_manifest
  from public.bagging_manifests
  where id = p_bagging_id and tenant_id = v_tenant and deleted_at is null;

  if v_manifest.id is null then
    raise exception 'Bagging manifest not found';
  end if;

  insert into public.bagging_events (
    tenant_id, bagging_id, manifest_no, event_type, event_text, payload, created_by
  ) values (
    v_tenant,
    v_manifest.id,
    v_manifest.manifest_no,
    case when lower(p_mode) = 'delete' then 'PROGRESS_DELETED' else 'PROGRESS_RECORDED' end,
    format('%s: %s at %s (%s)', v_action, coalesce(p_exception_code, 'PROGRESS'), p_service_center_code, coalesce(p_bag_no, 'All Bags')),
    jsonb_build_object(
      'bag_no', p_bag_no,
      'date', p_progress_date,
      'time', p_progress_time,
      'service_center', p_service_center_code,
      'exception', p_exception_code,
      'mode', p_mode
    ),
    v_user
  );

  for v_line in
    select awb_no, shipment_id
    from public.bagging_awb_lines
    where bagging_id = p_bagging_id
      and tenant_id = v_tenant
      and deleted_at is null
      and (p_bag_no is null or btrim(p_bag_no) = '' or bag_no = btrim(p_bag_no))
  loop
    if v_line.shipment_id is not null then
      insert into public.shipment_scan_events (
        tenant_id, shipment_id, awb_no, event_type, event_text, payload, created_by, updated_by
      ) values (
        v_tenant,
        v_line.shipment_id,
        v_line.awb_no,
        'BAGGING_PROGRESS',
        format('Bagging progress: %s at %s', coalesce(p_exception_code, 'IN_TRANSIT'), p_service_center_code),
        jsonb_build_object(
          'manifest_no', v_manifest.manifest_no,
          'bag_no', p_bag_no,
          'date', p_progress_date,
          'time', p_progress_time,
          'exception', p_exception_code,
          'mode', p_mode
        ),
        v_user,
        v_user
      );
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function public.record_bagging_progress(uuid, text, date, text, text, text, text) from public;
grant execute on function public.record_bagging_progress(uuid, text, date, text, text, text, text) to authenticated, service_role;
