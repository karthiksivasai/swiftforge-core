-- ===========================================================================
-- 0110  bagging module — Phase 1 Persistence, Schema, RPCs & Audit
-- ---------------------------------------------------------------------------
-- International consolidation & customs manifest data model:
--   * public.bagging_manifests        — bagging headers with full origin/destination metadata
--   * public.bagging_awb_lines        — normalized AWB-in-bag lines
--   * public.bagging_events           — append-only audit trail for bagging lifecycle & progress
--   * public.record_bagging()         — atomic RPC to create/update bagging manifests & lines
--   * public.list_baggings()          — list/search query with vendor/product/text filtering
--   * public.get_bagging_details()    — retrieve single bagging with all bag/AWB child lines
--   * public.delete_bagging()         — soft-delete bagging manifest with audit logging
--   * public.lookup_shipment_for_bagging() — real shipment details lookup for AWB scan
--   * public.record_bagging_progress()— record/delete progress milestones
--
-- Permission slug: txn.bagging (seeded in 0010)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Ensure Permission Module
-- ---------------------------------------------------------------------------
insert into public.permission_modules (slug, section, name, under_menu, sort_order) values
  ('txn.bagging', 'TRANSACTION', 'Bagging', 'Entry', 59)
on conflict (slug) do update set
  name = excluded.name,
  section = excluded.section,
  under_menu = excluded.under_menu;

-- ---------------------------------------------------------------------------
-- 2. Sequence Counter Seed for BAGGING
-- ---------------------------------------------------------------------------
alter table public.sequence_counters
  drop constraint if exists sequence_counters_doc_type_check;

alter table public.sequence_counters
  add constraint sequence_counters_doc_type_check
  check (doc_type in (
    'INVOICE','FREEFORM_INVOICE','DEBIT_NOTE','CREDIT_NOTE','RECEIPT',
    'EXPENSE','MANIFEST','DRS','PICKUP','BAG_MANIFEST','OBC','AWB','BAGGING'
  ));

insert into public.sequence_counters (tenant_id, branch_id, fin_year_id, doc_type, next_no, prefix, suffix)
select t.id, null, null, 'BAGGING', 1, '', ''
from public.tenants t
where t.deleted_at is null
on conflict (tenant_id,
             coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
             coalesce(fin_year_id, '00000000-0000-0000-0000-000000000000'::uuid),
             doc_type)
do nothing;

-- ---------------------------------------------------------------------------
-- 3. Bagging Manifests Header Table
-- ---------------------------------------------------------------------------
create table if not exists public.bagging_manifests (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants(id) on delete cascade,
  manifest_no             text not null,
  manifest_date           date not null default (current_date),
  
  -- Origin Panel
  origin_city_code        text,
  origin_city_name        text,
  origin_country_code     text,
  origin_country_name     text,
  airlines_code           text,
  airlines_name           text,
  arrival_airport         text,
  master_airlines_prefix  text,
  master_awb_no_part      text,
  master_no_part3         text,
  mawb_master_no          text,
  vendor_id               uuid references public.vendors(id) on delete set null,
  vendor_code             text,
  vendor_name             text,
  cd_no                   text,
  edi_master_no           text,
  bagging_remark          text,

  -- Destination Panel
  service_center_id       uuid references public.branches(id) on delete set null,
  service_center_code     text,
  service_center_name     text,
  dest_country_code       text,
  dest_country_name       text,
  dest_city_code          text,
  dest_city_name          text,
  flight_no1_code         text,
  flight_no1_name         text,
  flight_no2_code         text,
  flight_no2_name         text,
  arrival_date            date,
  arrival_time            text,
  dest_vendor_id          uuid references public.vendors(id) on delete set null,
  dest_vendor_code        text,
  dest_vendor_name        text,
  is_forwarding           boolean not null default false,

  -- Bag / Manifest options
  manifest_type           text check (manifest_type is null or manifest_type in ('High Value', 'Low Value', 'Transhipment')),
  transfer_to_uk          boolean not null default false,

  -- Calculated Totals
  total_bags              integer not null default 0,
  total_pieces            integer not null default 0,
  total_weight            numeric(12,3) not null default 0,
  total_awbs              integer not null default 0,
  
  status                  text not null default 'OPEN'
                          check (status in ('OPEN', 'DISPATCHED', 'ARRIVED', 'CLOSED', 'CANCELLED')),
  
  created_at              timestamptz not null default now(),
  created_by              uuid,
  updated_at              timestamptz not null default now(),
  updated_by              uuid,
  deleted_at              timestamptz,
  row_version             integer not null default 1,
  
  constraint bagging_manifests_tenant_id_uq unique (tenant_id, id),
  constraint bagging_manifests_tenant_no_uq unique (tenant_id, manifest_no)
);

create index if not exists bagging_manifests_tenant_date_idx
  on public.bagging_manifests (tenant_id, manifest_date desc) where deleted_at is null;
create index if not exists bagging_manifests_tenant_no_idx
  on public.bagging_manifests (tenant_id, manifest_no) where deleted_at is null;
create index if not exists bagging_manifests_vendor_idx
  on public.bagging_manifests (tenant_id, vendor_id) where deleted_at is null;

select app.attach_transaction_triggers('bagging_manifests', 'txn.bagging');
select app.attach_transaction_policies('bagging_manifests', 'txn.bagging');

-- ---------------------------------------------------------------------------
-- 4. Bagging AWB Lines Table
-- ---------------------------------------------------------------------------
create table if not exists public.bagging_awb_lines (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants(id) on delete cascade,
  bagging_id              uuid not null references public.bagging_manifests(id) on delete cascade,
  bag_no                  text not null,
  awb_no                  text not null,
  crn_mhbs_no             text,
  forwarding_no           text,
  weight                  numeric(12,3) not null default 0,
  pcs                     integer not null default 1,
  shipper                 text,
  consignee               text,
  vendor                  text,
  airline                 text,
  service                 text,
  destination             text,
  shipment_id             uuid references public.shipments(id) on delete set null,
  
  created_at              timestamptz not null default now(),
  created_by              uuid,
  updated_at              timestamptz not null default now(),
  updated_by              uuid,
  deleted_at              timestamptz,
  row_version             integer not null default 1,
  
  constraint bagging_awb_lines_tenant_id_uq unique (tenant_id, id)
);

create index if not exists bagging_awb_lines_bagging_idx
  on public.bagging_awb_lines (tenant_id, bagging_id) where deleted_at is null;
create index if not exists bagging_awb_lines_awb_idx
  on public.bagging_awb_lines (tenant_id, awb_no) where deleted_at is null;
create index if not exists bagging_awb_lines_bag_idx
  on public.bagging_awb_lines (tenant_id, bagging_id, bag_no) where deleted_at is null;

select app.attach_transaction_triggers('bagging_awb_lines', 'txn.bagging');
select app.attach_transaction_policies('bagging_awb_lines', 'txn.bagging');

-- ---------------------------------------------------------------------------
-- 5. Bagging Events Audit Table (Append-Only)
-- ---------------------------------------------------------------------------
create table if not exists public.bagging_events (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants(id) on delete cascade,
  bagging_id              uuid references public.bagging_manifests(id) on delete set null,
  manifest_no             text not null,
  event_type              text not null,
  event_text              text not null,
  payload                 jsonb not null default '{}'::jsonb,
  created_at              timestamptz not null default now(),
  created_by              uuid
);

create index if not exists bagging_events_tenant_manifest_idx
  on public.bagging_events (tenant_id, manifest_no, created_at desc);
create index if not exists bagging_events_bagging_idx
  on public.bagging_events (tenant_id, bagging_id);

select app.attach_append_only_guard('bagging_events');
select app.attach_event_policies('bagging_events', 'txn.bagging');

-- ---------------------------------------------------------------------------
-- 6. RPC: lookup_shipment_for_bagging
-- ---------------------------------------------------------------------------
create or replace function public.lookup_shipment_for_bagging(p_awb_no text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant  uuid := app.current_tenant_id();
  v_clean   text := upper(btrim(coalesce(p_awb_no, '')));
  v_ship    public.shipments%rowtype;
  v_shipper text;
  v_consignee text;
  v_vendor  text;
  v_dest    text;
begin
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

  -- Resolve shipper name
  if v_ship.shipper_id is not null then
    select name into v_shipper from public.shippers where id = v_ship.shipper_id;
  end if;
  if v_shipper is null or v_shipper = '' then
    v_shipper := coalesce(v_ship.shipper, '—');
  end if;

  -- Resolve consignee name
  if v_ship.consignee_id is not null then
    select name into v_consignee from public.consignees where id = v_ship.consignee_id;
  end if;
  if v_consignee is null or v_consignee = '' then
    v_consignee := coalesce(v_ship.consignee, '—');
  end if;

  -- Resolve vendor name
  if v_ship.vendor_id is not null then
    select name into v_vendor from public.vendors where id = v_ship.vendor_id;
  end if;
  if v_vendor is null then
    v_vendor := '';
  end if;

  -- Resolve destination
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
    'weight',       to_char(coalesce(v_ship.charge_weight, v_ship.actual_weight, 0)::numeric, 'FM999990.000'),
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

revoke all on function public.lookup_shipment_for_bagging from public;
grant execute on function public.lookup_shipment_for_bagging to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. RPC: record_bagging (Atomic Save / Upsert)
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
  v_tot_weight      numeric(12,3) := 0;
  v_tot_pcs         integer := 0;
  v_tot_awbs        integer := 0;
  v_bag_set         text[];
  v_tot_bags        integer := 0;
  v_inserted        public.bagging_manifests%rowtype;
  v_alloc           record;
  v_shipment_id     uuid;
begin
  if v_tenant is null then
    raise exception 'Tenant context required' using errcode = '42501';
  end if;

  v_date := coalesce((p_header->>'date')::date, current_date);

  -- Resolve origin branch from service_center_code or user profile
  select b.id into v_branch_id
  from public.branches b
  where b.tenant_id = v_tenant
    and b.deleted_at is null
    and upper(b.code) = upper(coalesce(p_header->'serviceCenter'->>'code', p_header->'originCity'->>'code', ''))
  limit 1;

  -- Resolve origin vendor
  if p_header->'vendor'->>'code' is not null and btrim(p_header->'vendor'->>'code') <> '' then
    select v.id into v_vendor_id
    from public.vendors v
    where v.tenant_id = v_tenant
      and v.deleted_at is null
      and upper(v.code) = upper(btrim(p_header->'vendor'->>'code'))
    limit 1;
  end if;

  -- Resolve destination vendor
  if p_header->'destVendor'->>'code' is not null and btrim(p_header->'destVendor'->>'code') <> '' then
    select v.id into v_dest_vendor_id
    from public.vendors v
    where v.tenant_id = v_tenant
      and v.deleted_at is null
      and upper(v.code) = upper(btrim(p_header->'destVendor'->>'code'))
    limit 1;
  end if;

  -- Calculate summary totals from child lines array
  if p_lines is not null and jsonb_array_length(p_lines) > 0 then
    for v_elem in select * from jsonb_array_elements(p_lines) loop
      v_line_weight := coalesce(nullif(replace(v_elem->>'weight', ',', ''), '')::numeric, 0);
      v_line_pcs    := coalesce(nullif(v_elem->>'pcs', '')::integer, 1);
      
      v_tot_weight  := v_tot_weight + v_line_weight;
      v_tot_pcs     := v_tot_pcs + v_line_pcs;
      v_tot_awbs    := v_tot_awbs + 1;
      
      if v_elem->>'bagNo' is not null and btrim(v_elem->>'bagNo') <> '' then
        if not (v_bag_set @> array[btrim(v_elem->>'bagNo')]) then
          v_bag_set := array_append(v_bag_set, btrim(v_elem->>'bagNo'));
        end if;
      end if;
    end loop;
    v_tot_bags := coalesce(array_length(v_bag_set, 1), 0);
  end if;

  -- 1. Create or Update Header
  if v_bagging_id is null then
    -- Check if client provided a non-zero manifestNo, otherwise allocate
    v_manifest_no := nullif(btrim(coalesce(p_header->>'manifestNo', '')), '');
    if v_manifest_no is null or v_manifest_no = '0' then
      begin
        select * into v_alloc from app.allocate_document_no(v_tenant, 'BAGGING', v_branch_id, null);
        v_manifest_no := v_alloc.formatted_no;
      exception when others then
        -- Fallback to BAGGING prefix + random sequence if counter missing
        v_manifest_no := 'BG' || to_char(current_date, 'YYMM') || lpad(floor(random()*9000 + 1000)::text, 4, '0');
      end;
    end if;

    insert into public.bagging_manifests (
      tenant_id,
      manifest_no,
      manifest_date,
      origin_city_code,
      origin_city_name,
      origin_country_code,
      origin_country_name,
      airlines_code,
      airlines_name,
      arrival_airport,
      master_airlines_prefix,
      master_awb_no_part,
      master_no_part3,
      mawb_master_no,
      vendor_id,
      vendor_code,
      vendor_name,
      cd_no,
      edi_master_no,
      bagging_remark,
      service_center_id,
      service_center_code,
      service_center_name,
      dest_country_code,
      dest_country_name,
      dest_city_code,
      dest_city_name,
      flight_no1_code,
      flight_no1_name,
      flight_no2_code,
      flight_no2_name,
      arrival_date,
      arrival_time,
      dest_vendor_id,
      dest_vendor_code,
      dest_vendor_name,
      is_forwarding,
      manifest_type,
      transfer_to_uk,
      total_bags,
      total_pieces,
      total_weight,
      total_awbs,
      status,
      created_by,
      updated_by
    ) values (
      v_tenant,
      v_manifest_no,
      v_date,
      p_header->'originCity'->>'code',
      p_header->'originCity'->>'name',
      p_header->'originCountry'->>'code',
      p_header->'originCountry'->>'name',
      p_header->'airlinesCode'->>'code',
      p_header->'airlinesCode'->>'name',
      p_header->>'arrivalAirport',
      p_header->>'masterAirlinesPrefix',
      p_header->>'masterAwbNoPart',
      p_header->>'masterNoPart3',
      p_header->>'mawbMasterNo',
      v_vendor_id,
      p_header->'vendor'->>'code',
      p_header->'vendor'->>'name',
      p_header->>'cdNo',
      p_header->>'ediMasterNo',
      p_header->>'baggingRemark',
      v_branch_id,
      p_header->'serviceCenter'->>'code',
      p_header->'serviceCenter'->>'name',
      p_header->'destCountry'->>'code',
      p_header->'destCountry'->>'name',
      p_header->'destCity'->>'code',
      p_header->'destCity'->>'name',
      p_header->'flightNo1'->>'code',
      p_header->'flightNo1'->>'name',
      p_header->'flightNo2'->>'code',
      p_header->'flightNo2'->>'name',
      nullif(p_header->>'arrivalDate', '')::date,
      p_header->>'arrivalTime',
      v_dest_vendor_id,
      p_header->'destVendor'->>'code',
      p_header->'destVendor'->>'name',
      coalesce((p_header->>'isForwarding')::boolean, false),
      nullif(p_header->>'manifestType', ''),
      coalesce((p_header->>'transferToUk')::boolean, false),
      v_tot_bags,
      v_tot_pcs,
      v_tot_weight,
      v_tot_awbs,
      'OPEN',
      v_user,
      v_user
    )
    returning * into v_inserted;

    v_bagging_id := v_inserted.id;

    -- Append-only audit
    insert into public.bagging_events (
      tenant_id, bagging_id, manifest_no, event_type, event_text, payload, created_by
    ) values (
      v_tenant,
      v_bagging_id,
      v_manifest_no,
      'BAGGING_CREATED',
      format('Bagging manifest %s created with %s bags and %s AWBs', v_manifest_no, v_tot_bags, v_tot_awbs),
      jsonb_build_object('total_bags', v_tot_bags, 'total_weight', v_tot_weight, 'total_awbs', v_tot_awbs),
      v_user
    );

  else
    -- Update existing header
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
    returning * into v_inserted;

    v_manifest_no := v_inserted.manifest_no;

    -- Append-only audit
    insert into public.bagging_events (
      tenant_id, bagging_id, manifest_no, event_type, event_text, payload, created_by
    ) values (
      v_tenant,
      v_bagging_id,
      v_manifest_no,
      'BAGGING_UPDATED',
      format('Bagging manifest %s updated with %s bags and %s AWBs', v_manifest_no, v_tot_bags, v_tot_awbs),
      jsonb_build_object('total_bags', v_tot_bags, 'total_weight', v_tot_weight, 'total_awbs', v_tot_awbs),
      v_user
    );
  end if;

  -- 2. Sync AWB Lines (replace existing set)
  delete from public.bagging_awb_lines
  where bagging_id = v_bagging_id
    and tenant_id = v_tenant;

  if p_lines is not null and jsonb_array_length(p_lines) > 0 then
    for v_elem in select * from jsonb_array_elements(p_lines) loop
      -- Lookup matching shipment ID if present
      v_shipment_id := null;
      if v_elem->>'awbNo' is not null and btrim(v_elem->>'awbNo') <> '' then
        select s.id into v_shipment_id
        from public.shipments s
        where s.tenant_id = v_tenant
          and s.deleted_at is null
          and upper(s.awb_no) = upper(btrim(v_elem->>'awbNo'))
        limit 1;
      end if;

      insert into public.bagging_awb_lines (
        tenant_id,
        bagging_id,
        bag_no,
        awb_no,
        crn_mhbs_no,
        forwarding_no,
        weight,
        pcs,
        shipper,
        consignee,
        vendor,
        airline,
        service,
        destination,
        shipment_id,
        created_by,
        updated_by
      ) values (
        v_tenant,
        v_bagging_id,
        coalesce(nullif(btrim(v_elem->>'bagNo'), ''), '1'),
        upper(btrim(v_elem->>'awbNo')),
        nullif(btrim(v_elem->>'crnMhbsNo'), ''),
        nullif(btrim(v_elem->>'forwardingNo'), ''),
        coalesce(nullif(replace(v_elem->>'weight', ',', ''), '')::numeric, 0),
        coalesce(nullif(v_elem->>'pcs', '')::integer, 1),
        nullif(btrim(v_elem->>'shipper'), ''),
        nullif(btrim(v_elem->>'consignee'), ''),
        nullif(btrim(v_elem->>'vendor'), ''),
        nullif(btrim(v_elem->>'airline'), ''),
        nullif(btrim(v_elem->>'service'), ''),
        nullif(btrim(v_elem->>'destination'), ''),
        v_shipment_id,
        v_user,
        v_user
      );

      -- Write append-only scan event to shipment_scan_events if shipment exists
      if v_shipment_id is not null then
        insert into public.shipment_scan_events (
          tenant_id,
          shipment_id,
          awb_no,
          event_type,
          event_text,
          payload,
          created_by,
          updated_by
        ) values (
          v_tenant,
          v_shipment_id,
          upper(btrim(v_elem->>'awbNo')),
          'BAGGING_SCAN',
          format('Shipment added to Bag %s in Manifest %s', coalesce(v_elem->>'bagNo', '1'), v_manifest_no),
          jsonb_build_object(
            'bag_no', v_elem->>'bagNo',
            'manifest_no', v_manifest_no,
            'flight', p_header->'flightNo1'->>'code',
            'destination', p_header->'destCity'->>'code'
          ),
          v_user,
          v_user
        );
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'id',           v_inserted.id,
    'manifest_no',  v_inserted.manifest_no,
    'manifest_date',v_inserted.manifest_date,
    'total_bags',   v_inserted.total_bags,
    'total_pieces', v_inserted.total_pieces,
    'total_weight', v_inserted.total_weight,
    'total_awbs',   v_inserted.total_awbs,
    'status',       v_inserted.status,
    'created_at',   v_inserted.created_at
  );
end;
$$;

revoke all on function public.record_bagging from public;
grant execute on function public.record_bagging to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. RPC: list_baggings
-- ---------------------------------------------------------------------------
create or replace function public.list_baggings(
  p_product_code  text default null,
  p_vendor_code   text default null,
  p_search        text default null,
  p_limit         integer default 50,
  p_offset        integer default 0
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
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant  uuid := app.current_tenant_id();
  v_pat     text := '%' || replace(replace(coalesce(btrim(p_search), ''), '%', '\%'), '_', '\_') || '%';
begin
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
    and (p_vendor_code is null or btrim(p_vendor_code) = '' or upper(bm.vendor_code) = upper(btrim(p_vendor_code)))
    and (p_search is null or btrim(p_search) = '' or (
      bm.manifest_no ilike v_pat or
      bm.mawb_master_no ilike v_pat or
      bm.origin_city_code ilike v_pat or
      bm.dest_city_code ilike v_pat or
      bm.vendor_name ilike v_pat
    ))
  order by bm.manifest_date desc, bm.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.list_baggings from public;
grant execute on function public.list_baggings to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. RPC: get_bagging_details
-- ---------------------------------------------------------------------------
create or replace function public.get_bagging_details(p_bagging_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant  uuid := app.current_tenant_id();
  v_header  public.bagging_manifests%rowtype;
  v_lines   jsonb;
begin
  select * into v_header
  from public.bagging_manifests
  where id = p_bagging_id
    and tenant_id = v_tenant
    and deleted_at is null;

  if v_header.id is null then
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

revoke all on function public.get_bagging_details from public;
grant execute on function public.get_bagging_details to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. RPC: delete_bagging (Soft Delete)
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
  where id = p_bagging_id and tenant_id = v_tenant;

  update public.bagging_awb_lines
  set deleted_at = now(),
      updated_at = now(),
      updated_by = v_user
  where bagging_id = p_bagging_id and tenant_id = v_tenant;

  insert into public.bagging_events (
    tenant_id, bagging_id, manifest_no, event_type, event_text, created_by
  ) values (
    v_tenant, p_bagging_id, v_no, 'BAGGING_DELETED', format('Bagging manifest %s deleted', v_no), v_user
  );

  return true;
end;
$$;

revoke all on function public.delete_bagging from public;
grant execute on function public.delete_bagging to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 11. RPC: record_bagging_progress
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
  v_tenant  uuid := app.current_tenant_id();
  v_user    uuid := auth.uid();
  v_manifest public.bagging_manifests%rowtype;
  v_action  text := case when lower(p_mode) = 'delete' then 'Progress Deleted' else 'Progress Added' end;
  v_line    record;
begin
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

  -- Also cascade scan events for matching AWBs in that bag
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
          'exception', p_exception_code
        ),
        v_user,
        v_user
      );
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function public.record_bagging_progress from public;
grant execute on function public.record_bagging_progress to authenticated, service_role;
