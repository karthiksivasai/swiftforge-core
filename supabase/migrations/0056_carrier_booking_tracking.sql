-- ===========================================================================
-- 0056  carrier booking & tracking — Phase 7 Milestone 7B
-- ---------------------------------------------------------------------------
-- First carrier adapters: FEDEX, DHL (Express), BLUEDART.
-- Operations: book / cancel / track / label / serviceability via 7A framework.
-- Manual tracking refresh only. NO webhooks, polling, workers, IRN, EDI.
-- Permission: txn.awb-entry (reuse shipment permissions).
-- Provider HTTP is sandboxed in-DB (deterministic refs) until live keys/endpoints
-- are wired; credentials from 7A are required and never returned.
-- ===========================================================================

-- Ensure DHL displays as DHL Express in registry
update public.integration_providers
   set provider_name = 'DHL Express', updated_at = now()
 where provider_code = 'DHL';

-- ---------------------------------------------------------------------------
-- Shipment carrier reference columns (reuse shipments — no parallel state machine)
-- ---------------------------------------------------------------------------
alter table public.shipments
  add column if not exists carrier_provider_code text,
  add column if not exists carrier_booking_ref   text,
  add column if not exists carrier_tracking_no   text,
  add column if not exists carrier_label_file_id uuid,
  add column if not exists carrier_booked_at     timestamptz,
  add column if not exists carrier_cancelled_at  timestamptz,
  add column if not exists carrier_last_sync_at  timestamptz,
  add column if not exists carrier_booking_status text
    check (carrier_booking_status is null
           or carrier_booking_status in ('NONE','BOOKED','CANCELLED'));

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shipments_carrier_label_file_fk'
  ) then
    alter table public.shipments
      add constraint shipments_carrier_label_file_fk
      foreign key (carrier_label_file_id) references public.files(id) on delete set null;
  end if;
end $$;

create index if not exists shipments_carrier_tracking_idx
  on public.shipments (tenant_id, carrier_tracking_no)
  where deleted_at is null and carrier_tracking_no is not null;

-- ---------------------------------------------------------------------------
-- Permission helper
-- ---------------------------------------------------------------------------
create or replace function app.assert_carrier_shipment_permission(
  p_tenant uuid, p_action text
)
returns void
language plpgsql
stable
security definer
set search_path = public, app
as $$
begin
  if app.is_platform_admin() or app.is_tenant_admin(p_tenant) then
    return;
  end if;
  if app.user_has_permission(p_tenant, 'txn.awb-entry', p_action) then
    return;
  end if;
  if p_action in ('list','search','modify')
     and (
       app.user_has_permission(p_tenant, 'txn.awb-entry', 'add')
       or app.user_has_permission(p_tenant, 'txn.awb-entry', 'modify')
       or app.user_has_permission(p_tenant, 'txn.awb-entry', 'list')
       or app.user_has_permission(p_tenant, 'txn.awb-query', 'list')
       or app.user_has_permission(p_tenant, 'txn.awb-query', 'search')
       or app.user_has_permission(p_tenant, 'txn.awb-query', 'modify')
     ) then
    return;
  end if;
  raise exception 'Permission denied: txn.awb-entry' using errcode = '42501';
end
$$;

-- ---------------------------------------------------------------------------
-- Normalize / resolve supported provider codes
-- ---------------------------------------------------------------------------
create or replace function app.normalize_carrier_provider_code(p_code text)
returns text
language sql
immutable
as $$
  select case upper(replace(btrim(coalesce(p_code,'')), ' ', ''))
    when 'FEDEX' then 'FEDEX'
    when 'DHL' then 'DHL'
    when 'DHLEXPRESS' then 'DHL'
    when 'DHL_EXPRESS' then 'DHL'
    when 'BLUEDART' then 'BLUEDART'
    when 'BLUE_DART' then 'BLUEDART'
    else null
  end;
$$;

create or replace function app.is_supported_carrier(p_code text)
returns boolean
language sql
immutable
as $$
  select app.normalize_carrier_provider_code(p_code) in ('FEDEX','DHL','BLUEDART');
$$;

create or replace function app.resolve_shipment_carrier_provider(
  p_tenant uuid,
  p_shipment public.shipments,
  p_provider_code text default null
)
returns text
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_code text := app.normalize_carrier_provider_code(p_provider_code);
  v_link text;
begin
  if v_code is not null then
    if not app.is_supported_carrier(v_code) then
      raise exception 'Unsupported carrier provider: %', p_provider_code using errcode = 'CMS04';
    end if;
    return v_code;
  end if;

  if p_shipment.carrier_provider_code is not null then
    v_code := app.normalize_carrier_provider_code(p_shipment.carrier_provider_code);
    if v_code is not null then
      return v_code;
    end if;
  end if;

  -- From service mapping vendor_link for shipment vendor + service
  if p_shipment.vendor_id is not null then
    select sm.vendor_link into v_link
      from public.service_mappings sm
     where sm.tenant_id = p_tenant
       and sm.deleted_at is null
       and sm.status = 'ACTIVE'
       and sm.vendor_id = p_shipment.vendor_id
       and (
         nullif(btrim(coalesce(p_shipment.service,'')),'') is null
         or upper(sm.service) = upper(p_shipment.service)
         or app.normalize_carrier_provider_code(sm.vendor_link) is not null
       )
       and app.normalize_carrier_provider_code(sm.vendor_link) is not null
     order by case when upper(sm.service) = upper(coalesce(p_shipment.service,'')) then 0 else 1 end
     limit 1;
    v_code := app.normalize_carrier_provider_code(v_link);
    if v_code is not null then
      return v_code;
    end if;
  end if;

  raise exception 'No supported carrier provider for shipment' using errcode = 'CMS04';
end
$$;

create or replace function app.require_active_carrier_credentials(
  p_tenant uuid,
  p_provider_code text
)
returns public.integration_credentials
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_row public.integration_credentials;
  v_code text := app.normalize_carrier_provider_code(p_provider_code);
begin
  select c.* into v_row
    from public.integration_credentials c
    join public.integration_providers p on p.id = c.provider_id
   where c.tenant_id = p_tenant
     and c.deleted_at is null
     and c.is_active
     and p.provider_code = v_code
     and p.status = 'ACTIVE'
   limit 1;
  if not found then
    raise exception 'Active integration credentials required for %', v_code
      using errcode = 'CMS04';
  end if;
  return v_row;
end
$$;

-- ---------------------------------------------------------------------------
-- Sandbox carrier adapter implementations (deterministic; no outbound HTTP)
-- ---------------------------------------------------------------------------
create or replace function app.carrier_sandbox_book(
  p_provider text, p_awb text, p_sandbox boolean
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_track text;
  v_ref text;
begin
  v_track := case p_provider
    when 'FEDEX' then 'FDX' || regexp_replace(coalesce(p_awb,''), '[^A-Za-z0-9]', '', 'g')
    when 'DHL' then 'DHL' || regexp_replace(coalesce(p_awb,''), '[^A-Za-z0-9]', '', 'g')
    when 'BLUEDART' then 'BD' || regexp_replace(coalesce(p_awb,''), '[^A-Za-z0-9]', '', 'g')
    else 'CRR' || coalesce(p_awb,'')
  end;
  v_ref := case p_provider
    when 'FEDEX' then 'FXB-'
    when 'DHL' then 'DHB-'
    when 'BLUEDART' then 'BDB-'
    else 'CRB-'
  end || left(replace(gen_random_uuid()::text, '-', ''), 12);
  return jsonb_build_object(
    'booking_ref', v_ref,
    'tracking_no', v_track,
    'sandbox', coalesce(p_sandbox, true),
    'provider', p_provider,
    'message', format('%s booking accepted', p_provider));
end
$$;

create or replace function app.carrier_sandbox_track(
  p_provider text, p_tracking_no text
)
returns jsonb
language plpgsql
stable
as $$
begin
  return jsonb_build_object(
    'tracking_no', p_tracking_no,
    'provider', p_provider,
    'status_text', case p_provider
      when 'FEDEX' then 'In Transit — FedEx scan'
      when 'DHL' then 'In Transit — DHL Express scan'
      when 'BLUEDART' then 'In Transit — Blue Dart scan'
      else 'In Transit'
    end,
    'events', jsonb_build_array(jsonb_build_object(
      'code', 'IT',
      'description', 'Shipment in transit with carrier',
      'at', now()
    )));
end
$$;

create or replace function app.carrier_sandbox_serviceability(
  p_tenant uuid,
  p_provider text,
  p_origin_pin text,
  p_dest_pin text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_o boolean;
  v_d boolean;
  v_ok boolean;
  v_reason text := null;
begin
  select coalesce(bool_or(p.is_serviceable), false) into v_o
    from public.pincodes p
   where p.tenant_id = p_tenant and p.deleted_at is null
     and p.pin_code = btrim(p_origin_pin);
  select coalesce(bool_or(p.is_serviceable), false) into v_d
    from public.pincodes p
   where p.tenant_id = p_tenant and p.deleted_at is null
     and p.pin_code = btrim(p_dest_pin);

  if not exists (
    select 1 from public.pincodes p
     where p.tenant_id = p_tenant and p.deleted_at is null
       and p.pin_code = btrim(p_origin_pin)
  ) then
    v_ok := false; v_reason := 'Unknown origin pincode';
  elsif not exists (
    select 1 from public.pincodes p
     where p.tenant_id = p_tenant and p.deleted_at is null
       and p.pin_code = btrim(p_dest_pin)
  ) then
    v_ok := false; v_reason := 'Unknown destination pincode';
  elsif not v_d then
    v_ok := false; v_reason := 'Destination not serviceable';
  else
    v_ok := true;
  end if;

  return jsonb_build_object(
    'serviceable', v_ok,
    'failure_reason', v_reason,
    'provider', p_provider,
    'origin_pincode', btrim(p_origin_pin),
    'destination_pincode', btrim(p_dest_pin),
    'origin_serviceable', v_o,
    'destination_serviceable', v_d);
end
$$;

-- ===========================================================================
-- book_shipment_carrier
-- ===========================================================================
create or replace function public.book_shipment_carrier(
  p_id uuid,
  p_row_version integer,
  p_provider_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_s public.shipments;
  v_code text;
  v_cred public.integration_credentials;
  v_prov public.integration_providers;
  v_req text := 'req-' || left(replace(gen_random_uuid()::text, '-', ''), 16);
  v_t0 timestamptz := clock_timestamp();
  v_result jsonb;
  v_latency int;
begin
  perform app.assert_carrier_shipment_permission(v_tenant, 'modify');

  select * into v_s from public.shipments
   where id = p_id and tenant_id = v_tenant and deleted_at is null
   for update;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;
  if p_row_version is not null and v_s.row_version <> p_row_version then
    raise exception 'Optimistic lock conflict' using errcode = 'CMS04';
  end if;
  if v_s.current_status not in ('BOOKED','PICKUP_INSCANNED','BAGGED','MANIFESTED','IN_TRANSIT') then
    raise exception 'Shipment must be BOOKED (or later operational) before carrier booking'
      using errcode = 'CMS04';
  end if;
  if coalesce(v_s.carrier_booking_status,'NONE') = 'BOOKED' then
    raise exception 'Carrier booking already exists' using errcode = 'CMS04';
  end if;

  v_code := app.resolve_shipment_carrier_provider(v_tenant, v_s, p_provider_code);
  v_cred := app.require_active_carrier_credentials(v_tenant, v_code);
  select * into v_prov from public.integration_providers where id = v_cred.provider_id;

  begin
    v_result := app.carrier_sandbox_book(v_code, v_s.awb_no, v_cred.sandbox_mode);
    v_latency := greatest(1, (extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int);

    update public.shipments
       set carrier_provider_code = v_code,
           carrier_booking_ref = v_result->>'booking_ref',
           carrier_tracking_no = v_result->>'tracking_no',
           forwarding_awb = coalesce(nullif(btrim(coalesce(forwarding_awb,'')),''), v_result->>'tracking_no'),
           carrier_booking_status = 'BOOKED',
           carrier_booked_at = now(),
           carrier_cancelled_at = null,
           carrier_last_sync_at = now(),
           updated_at = now(),
           updated_by = auth.uid(),
           row_version = row_version + 1
     where id = p_id
     returning * into v_s;

    perform app.append_tracking_event(
      v_tenant, v_s.id,
      format('Carrier booked (%s)', v_code),
      format('Booking ref %s / tracking %s', v_result->>'booking_ref', v_result->>'tracking_no'),
      'CARRIER_API',
      jsonb_build_object('provider', v_code, 'result', v_result),
      v_s.branch_id);

    perform app.write_integration_log(
      v_tenant, v_prov.id, v_code, 'BOOK', v_req, v_s.id,
      'SUCCESS', v_latency, '200', null);

    perform app.write_audit_log(
      v_tenant, 'shipments', 'MODIFY', v_s.id, 'txn.awb-entry',
      null, jsonb_build_object(
        'carrier_book', true,
        'provider', v_code,
        'booking_ref', v_s.carrier_booking_ref,
        'tracking_no', v_s.carrier_tracking_no));

    return jsonb_build_object(
      'shipment_id', v_s.id,
      'row_version', v_s.row_version,
      'provider_code', v_code,
      'booking_ref', v_s.carrier_booking_ref,
      'tracking_no', v_s.carrier_tracking_no,
      'carrier_booking_status', v_s.carrier_booking_status,
      'sandbox_mode', v_cred.sandbox_mode,
      'request_id', v_req,
      'result', v_result);
  exception when others then
    v_latency := greatest(1, (extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int);
    perform app.write_integration_log(
      v_tenant, v_prov.id, v_code, 'BOOK', v_req, p_id,
      'FAILURE', v_latency, '500', SQLERRM);
    raise;
  end;
end
$$;

revoke all on function public.book_shipment_carrier(uuid, integer, text) from public;
grant execute on function public.book_shipment_carrier(uuid, integer, text)
  to authenticated, service_role;

-- ===========================================================================
-- cancel_shipment_carrier
-- ===========================================================================
create or replace function public.cancel_shipment_carrier(
  p_id uuid,
  p_row_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_s public.shipments;
  v_code text;
  v_cred public.integration_credentials;
  v_prov public.integration_providers;
  v_req text := 'req-' || left(replace(gen_random_uuid()::text, '-', ''), 16);
  v_t0 timestamptz := clock_timestamp();
  v_latency int;
begin
  perform app.assert_carrier_shipment_permission(v_tenant, 'modify');

  select * into v_s from public.shipments
   where id = p_id and tenant_id = v_tenant and deleted_at is null
   for update;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;
  if p_row_version is not null and v_s.row_version <> p_row_version then
    raise exception 'Optimistic lock conflict' using errcode = 'CMS04';
  end if;
  if coalesce(v_s.carrier_booking_status,'NONE') <> 'BOOKED' then
    raise exception 'No active carrier booking to cancel' using errcode = 'CMS04';
  end if;

  v_code := app.normalize_carrier_provider_code(v_s.carrier_provider_code);
  if v_code is null then
    raise exception 'Unknown carrier on shipment' using errcode = 'CMS04';
  end if;
  v_cred := app.require_active_carrier_credentials(v_tenant, v_code);
  select * into v_prov from public.integration_providers where id = v_cred.provider_id;

  begin
    v_latency := greatest(1, (extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int);

    update public.shipments
       set carrier_booking_status = 'CANCELLED',
           carrier_cancelled_at = now(),
           carrier_last_sync_at = now(),
           updated_at = now(),
           updated_by = auth.uid(),
           row_version = row_version + 1
     where id = p_id
     returning * into v_s;

    perform app.append_tracking_event(
      v_tenant, v_s.id,
      format('Carrier booking cancelled (%s)', v_code),
      format('Cancelled booking ref %s', v_s.carrier_booking_ref),
      'CARRIER_API',
      jsonb_build_object('provider', v_code, 'booking_ref', v_s.carrier_booking_ref),
      v_s.branch_id);

    perform app.write_integration_log(
      v_tenant, v_prov.id, v_code, 'CANCEL', v_req, v_s.id,
      'SUCCESS', v_latency, '200', null);

    perform app.write_audit_log(
      v_tenant, 'shipments', 'MODIFY', v_s.id, 'txn.awb-entry',
      null, jsonb_build_object('carrier_cancel', true, 'provider', v_code));

    return jsonb_build_object(
      'shipment_id', v_s.id,
      'row_version', v_s.row_version,
      'provider_code', v_code,
      'carrier_booking_status', v_s.carrier_booking_status,
      'request_id', v_req);
  exception when others then
    v_latency := greatest(1, (extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int);
    perform app.write_integration_log(
      v_tenant, v_prov.id, v_code, 'CANCEL', v_req, p_id,
      'FAILURE', v_latency, '500', SQLERRM);
    raise;
  end;
end
$$;

revoke all on function public.cancel_shipment_carrier(uuid, integer) from public;
grant execute on function public.cancel_shipment_carrier(uuid, integer)
  to authenticated, service_role;

-- ===========================================================================
-- refresh_shipment_carrier_tracking (manual only)
-- ===========================================================================
create or replace function public.refresh_shipment_carrier_tracking(
  p_id uuid,
  p_row_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_s public.shipments;
  v_code text;
  v_cred public.integration_credentials;
  v_prov public.integration_providers;
  v_req text := 'req-' || left(replace(gen_random_uuid()::text, '-', ''), 16);
  v_t0 timestamptz := clock_timestamp();
  v_result jsonb;
  v_latency int;
  v_tev uuid;
begin
  perform app.assert_carrier_shipment_permission(v_tenant, 'modify');

  select * into v_s from public.shipments
   where id = p_id and tenant_id = v_tenant and deleted_at is null
   for update;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;
  if p_row_version is not null and v_s.row_version <> p_row_version then
    raise exception 'Optimistic lock conflict' using errcode = 'CMS04';
  end if;
  if coalesce(v_s.carrier_booking_status,'NONE') <> 'BOOKED' then
    raise exception 'Carrier booking required before tracking refresh' using errcode = 'CMS04';
  end if;
  if nullif(btrim(coalesce(v_s.carrier_tracking_no,'')),'') is null then
    raise exception 'Missing carrier tracking number' using errcode = 'CMS04';
  end if;

  v_code := app.normalize_carrier_provider_code(v_s.carrier_provider_code);
  v_cred := app.require_active_carrier_credentials(v_tenant, v_code);
  select * into v_prov from public.integration_providers where id = v_cred.provider_id;

  begin
    v_result := app.carrier_sandbox_track(v_code, v_s.carrier_tracking_no);
    v_latency := greatest(1, (extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int);

    v_tev := app.append_tracking_event(
      v_tenant, v_s.id,
      v_result->>'status_text',
      'Manual carrier tracking refresh',
      'CARRIER_API',
      v_result,
      v_s.branch_id);

    -- Provider-driven status nudge: only when still early operational
    if v_s.current_status in ('BOOKED','PICKUP_INSCANNED','BAGGED','MANIFESTED') then
      begin
        perform app.assert_status_transition('SHIPMENT', v_s.current_status, 'IN_TRANSIT');
        update public.shipments
           set current_status = 'IN_TRANSIT',
               status_at = now(),
               carrier_last_sync_at = now(),
               updated_at = now(),
               updated_by = auth.uid(),
               row_version = row_version + 1
         where id = p_id
         returning * into v_s;
      exception when others then
        update public.shipments
           set carrier_last_sync_at = now(),
               updated_at = now(),
               updated_by = auth.uid(),
               row_version = row_version + 1
         where id = p_id
         returning * into v_s;
      end;
    else
      update public.shipments
         set carrier_last_sync_at = now(),
             updated_at = now(),
             updated_by = auth.uid(),
             row_version = row_version + 1
       where id = p_id
       returning * into v_s;
    end if;

    perform app.write_integration_log(
      v_tenant, v_prov.id, v_code, 'TRACK', v_req, v_s.id,
      'SUCCESS', v_latency, '200', null);

    perform app.write_audit_log(
      v_tenant, 'shipments', 'MODIFY', v_s.id, 'txn.awb-entry',
      null, jsonb_build_object('carrier_track', true, 'provider', v_code));

    return jsonb_build_object(
      'shipment_id', v_s.id,
      'row_version', v_s.row_version,
      'provider_code', v_code,
      'tracking_no', v_s.carrier_tracking_no,
      'current_status', v_s.current_status,
      'tracking_event_id', v_tev,
      'result', v_result,
      'request_id', v_req);
  exception when others then
    v_latency := greatest(1, (extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int);
    perform app.write_integration_log(
      v_tenant, v_prov.id, v_code, 'TRACK', v_req, p_id,
      'FAILURE', v_latency, '500', SQLERRM);
    raise;
  end;
end
$$;

revoke all on function public.refresh_shipment_carrier_tracking(uuid, integer) from public;
grant execute on function public.refresh_shipment_carrier_tracking(uuid, integer)
  to authenticated, service_role;

-- ===========================================================================
-- get_shipment_carrier_label
-- ===========================================================================
create or replace function public.get_shipment_carrier_label(
  p_id uuid,
  p_row_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_s public.shipments;
  v_code text;
  v_cred public.integration_credentials;
  v_prov public.integration_providers;
  v_req text := 'req-' || left(replace(gen_random_uuid()::text, '-', ''), 16);
  v_t0 timestamptz := clock_timestamp();
  v_latency int;
  v_file public.files;
  v_key text;
begin
  perform app.assert_carrier_shipment_permission(v_tenant, 'list');

  select * into v_s from public.shipments
   where id = p_id and tenant_id = v_tenant and deleted_at is null
   for update;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;
  if p_row_version is not null and v_s.row_version <> p_row_version then
    raise exception 'Optimistic lock conflict' using errcode = 'CMS04';
  end if;
  if coalesce(v_s.carrier_booking_status,'NONE') <> 'BOOKED' then
    raise exception 'Carrier booking required before label retrieval' using errcode = 'CMS04';
  end if;

  v_code := app.normalize_carrier_provider_code(v_s.carrier_provider_code);
  v_cred := app.require_active_carrier_credentials(v_tenant, v_code);
  select * into v_prov from public.integration_providers where id = v_cred.provider_id;

  begin
    if v_s.carrier_label_file_id is not null then
      select * into v_file from public.files
       where id = v_s.carrier_label_file_id and tenant_id = v_tenant and deleted_at is null;
    end if;

    if v_file.id is null then
      v_key := format('tenants/%s/carrier-labels/%s-%s.label.json',
                      v_tenant, v_code, coalesce(v_s.carrier_tracking_no, v_s.awb_no));
      insert into public.files (
        tenant_id, branch_id, storage_bucket, storage_key, original_name, mime,
        size_bytes, scan_status, owner_type, owner_id, uploaded_by, created_by, updated_by)
      values (
        v_tenant, v_s.branch_id, 'tenant-files', v_key,
        format('%s-%s-label.json', v_code, v_s.awb_no),
        'application/json', 0, 'CLEAN', 'SHIPMENT', v_s.id,
        auth.uid(), auth.uid(), auth.uid())
      returning * into v_file;

      update public.shipments
         set carrier_label_file_id = v_file.id,
             carrier_last_sync_at = now(),
             updated_at = now(),
             updated_by = auth.uid(),
             row_version = row_version + 1
       where id = p_id
       returning * into v_s;
    else
      update public.shipments
         set carrier_last_sync_at = now(),
             updated_at = now(),
             updated_by = auth.uid(),
             row_version = row_version + 1
       where id = p_id
       returning * into v_s;
    end if;

    v_latency := greatest(1, (extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int);

    perform app.write_integration_log(
      v_tenant, v_prov.id, v_code, 'LABEL', v_req, v_s.id,
      'SUCCESS', v_latency, '200', null);

    return jsonb_build_object(
      'shipment_id', v_s.id,
      'row_version', v_s.row_version,
      'provider_code', v_code,
      'tracking_no', v_s.carrier_tracking_no,
      'file_id', v_file.id,
      'storage_key', v_file.storage_key,
      'original_name', v_file.original_name,
      'mime', v_file.mime,
      'request_id', v_req);
  exception when others then
    v_latency := greatest(1, (extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int);
    perform app.write_integration_log(
      v_tenant, v_prov.id, v_code, 'LABEL', v_req, p_id,
      'FAILURE', v_latency, '500', SQLERRM);
    raise;
  end;
end
$$;

revoke all on function public.get_shipment_carrier_label(uuid, integer) from public;
grant execute on function public.get_shipment_carrier_label(uuid, integer)
  to authenticated, service_role;

-- ===========================================================================
-- check_carrier_serviceability
-- ===========================================================================
create or replace function public.check_carrier_serviceability(
  p_provider_code text,
  p_origin_pincode text,
  p_destination_pincode text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_code text := app.normalize_carrier_provider_code(p_provider_code);
  v_cred public.integration_credentials;
  v_prov public.integration_providers;
  v_req text := 'req-' || left(replace(gen_random_uuid()::text, '-', ''), 16);
  v_t0 timestamptz := clock_timestamp();
  v_result jsonb;
  v_latency int;
begin
  perform app.assert_carrier_shipment_permission(v_tenant, 'search');

  if v_code is null or not app.is_supported_carrier(v_code) then
    raise exception 'Unsupported carrier provider' using errcode = 'CMS04';
  end if;
  if nullif(btrim(coalesce(p_origin_pincode,'')),'') is null
     or nullif(btrim(coalesce(p_destination_pincode,'')),'') is null then
    raise exception 'Origin and destination pincode are required' using errcode = 'CMS04';
  end if;

  v_cred := app.require_active_carrier_credentials(v_tenant, v_code);
  select * into v_prov from public.integration_providers where id = v_cred.provider_id;

  begin
    v_result := app.carrier_sandbox_serviceability(
      v_tenant, v_code, p_origin_pincode, p_destination_pincode);
    v_latency := greatest(1, (extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int);

    perform app.write_integration_log(
      v_tenant, v_prov.id, v_code, 'SERVICEABILITY', v_req, null,
      'SUCCESS', v_latency, '200', null);

    return v_result || jsonb_build_object(
      'request_id', v_req,
      'sandbox_mode', v_cred.sandbox_mode);
  exception when others then
    v_latency := greatest(1, (extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int);
    perform app.write_integration_log(
      v_tenant, v_prov.id, v_code, 'SERVICEABILITY', v_req, null,
      'FAILURE', v_latency, '500', SQLERRM);
    raise;
  end;
end
$$;

revoke all on function public.check_carrier_serviceability(text, text, text) from public;
grant execute on function public.check_carrier_serviceability(text, text, text)
  to authenticated, service_role;

comment on column public.shipments.carrier_booking_ref is
  'Carrier booking reference from adapter.book() (Milestone 7B).';
comment on column public.shipments.carrier_tracking_no is
  'Carrier tracking number from adapter.book() / track().';
comment on function public.book_shipment_carrier(uuid, integer, text) is
  'Book shipment with FEDEX/DHL/BLUEDART via sandbox adapter; logs + tracking event.';
comment on function public.refresh_shipment_carrier_tracking(uuid, integer) is
  'Manual carrier tracking refresh only — no background polling.';
