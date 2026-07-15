-- ===========================================================================
-- 0057  public tracking & webhooks — Phase 7 Milestone 7C
-- ---------------------------------------------------------------------------
-- Public (unauthenticated) shipment tracking + outbound webhook framework.
-- Synchronous dispatch only (sign → POST once → record). NO retries, queues,
-- workers, cron, polling, email/SMS, IRN, EDI.
-- Permissions: reuse mst.vendor-master / mst.service-mapping (7A pattern).
-- Secrets: encrypted at rest via integration crypto helpers; never returned.
-- ===========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Event catalog (registration only — these six)
-- ---------------------------------------------------------------------------
create or replace function app.webhook_event_codes()
returns text[]
language sql
immutable
as $$
  select array[
    'SHIPMENT_BOOKED',
    'SHIPMENT_CANCELLED',
    'SHIPMENT_DELIVERED',
    'SHIPMENT_UNDELIVERED',
    'POD_UPDATED',
    'TRACKING_UPDATED'
  ]::text[];
$$;

create or replace function app.normalize_webhook_events(p_events jsonb)
returns text[]
language plpgsql
immutable
as $$
declare
  v_allowed text[] := app.webhook_event_codes();
  v_out text[] := '{}';
  v_el text;
  v_item jsonb;
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'subscribed_events must be a JSON array' using errcode = 'CMS04';
  end if;
  for v_item in select * from jsonb_array_elements(p_events)
  loop
    v_el := upper(btrim(coalesce(v_item #>> '{}', '')));
    if v_el = '' then continue; end if;
    if not (v_el = any (v_allowed)) then
      raise exception 'Unsupported webhook event: %', v_el using errcode = 'CMS04';
    end if;
    if not (v_el = any (v_out)) then
      v_out := array_append(v_out, v_el);
    end if;
  end loop;
  if cardinality(v_out) < 1 then
    raise exception 'At least one subscribed event is required' using errcode = 'CMS04';
  end if;
  return v_out;
end
$$;

-- ---------------------------------------------------------------------------
-- Rate limit helper (reuse usage_counters.api_calls)
-- ---------------------------------------------------------------------------
create or replace function app.public_track_monthly_limit()
returns bigint
language sql
immutable
as $$
  select 10000::bigint;
$$;

create or replace function app.bump_public_track_rate(p_tenant uuid)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_period text := to_char(now() at time zone 'utc', 'YYYY-MM');
  v_val bigint;
  v_limit bigint := app.public_track_monthly_limit();
begin
  insert into public.usage_counters (tenant_id, metric, period, value)
  values (p_tenant, 'api_calls', v_period, 1)
  on conflict (tenant_id, metric, period) do update
    set value = public.usage_counters.value + 1,
        updated_at = now(),
        row_version = public.usage_counters.row_version + 1
  returning value into v_val;

  if v_val > v_limit then
    raise exception 'Public tracking rate limit exceeded' using errcode = 'CMS04';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- webhooks
-- ---------------------------------------------------------------------------
create table if not exists public.webhooks (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  name                text not null,
  endpoint_url        text not null,
  signing_secret_enc  bytea not null,
  subscribed_events   text[] not null
                        check (cardinality(subscribed_events) >= 1),
  is_active           boolean not null default true,
  remark              text,
  created_at          timestamptz not null default now(),
  created_by          uuid,
  updated_at          timestamptz not null default now(),
  updated_by          uuid,
  deleted_at          timestamptz,
  row_version         integer not null default 1,
  constraint webhooks_tenant_id_uq unique (tenant_id, id),
  constraint webhooks_name_len check (char_length(btrim(name)) between 1 and 120),
  constraint webhooks_url_http check (
    endpoint_url ~* '^(https?://|test://)'
  )
);

create unique index if not exists webhooks_tenant_name_uq
  on public.webhooks (tenant_id, lower(name))
  where deleted_at is null;
create index if not exists webhooks_tenant_idx
  on public.webhooks (tenant_id) where deleted_at is null;

drop trigger if exists trg_touch_webhooks on public.webhooks;
create trigger trg_touch_webhooks before insert or update on public.webhooks
  for each row execute function app.tg_touch_row();

alter table public.webhooks enable row level security;

drop policy if exists webhooks_select on public.webhooks;
create policy webhooks_select on public.webhooks
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());
drop policy if exists webhooks_insert on public.webhooks;
create policy webhooks_insert on public.webhooks
  for insert with check (tenant_id in (select app.user_tenant_ids()));
drop policy if exists webhooks_update on public.webhooks;
create policy webhooks_update on public.webhooks
  for update using (tenant_id in (select app.user_tenant_ids()))
  with check (tenant_id in (select app.user_tenant_ids()));
drop policy if exists webhooks_delete on public.webhooks;
create policy webhooks_delete on public.webhooks
  for delete using (tenant_id in (select app.user_tenant_ids()));

-- ---------------------------------------------------------------------------
-- webhook_deliveries (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.webhook_deliveries (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  webhook_id       uuid not null,
  event_type       text not null,
  payload          jsonb not null,
  response_status  integer,
  response_body    text,
  latency_ms       integer,
  attempt_number   integer not null default 1 check (attempt_number = 1),
  error_message    text,
  created_at       timestamptz not null default now(),
  constraint webhook_deliveries_webhook_fk
    foreign key (tenant_id, webhook_id)
    references public.webhooks (tenant_id, id) on delete cascade,
  constraint webhook_deliveries_event_chk
    check (event_type = any (app.webhook_event_codes()))
);

create index if not exists webhook_deliveries_webhook_idx
  on public.webhook_deliveries (tenant_id, webhook_id, created_at desc);
create index if not exists webhook_deliveries_event_idx
  on public.webhook_deliveries (tenant_id, event_type, created_at desc);

-- Append-only: block update/delete
create or replace function app.tg_webhook_deliveries_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'webhook_deliveries is append-only' using errcode = '42501';
end
$$;

drop trigger if exists trg_webhook_deliveries_no_upd on public.webhook_deliveries;
create trigger trg_webhook_deliveries_no_upd
  before update or delete on public.webhook_deliveries
  for each row execute function app.tg_webhook_deliveries_append_only();

alter table public.webhook_deliveries enable row level security;

drop policy if exists webhook_deliveries_select on public.webhook_deliveries;
create policy webhook_deliveries_select on public.webhook_deliveries
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());
drop policy if exists webhook_deliveries_insert on public.webhook_deliveries;
create policy webhook_deliveries_insert on public.webhook_deliveries
  for insert with check (tenant_id in (select app.user_tenant_ids()));
-- no update/delete policies

-- ---------------------------------------------------------------------------
-- HMAC signing + sync HTTP transport (one attempt, no retry)
-- ---------------------------------------------------------------------------
create or replace function app.webhook_sign_payload(p_secret text, p_body text)
returns text
language sql
immutable
-- pgcrypto may live in public (local) or extensions (hosted); resolve via search_path.
set search_path = public, extensions
as $$
  select encode(
    hmac(convert_to(p_body, 'UTF8'), convert_to(p_secret, 'UTF8'), 'sha256'::text),
    'hex');
$$;

create or replace function app.generate_webhook_signing_secret()
returns text
language sql
volatile
set search_path = public, extensions
as $$
  select 'whsec_' || encode(gen_random_bytes(24), 'hex');
$$;

-- Synchronous transport: test:// always 200; http(s) stubbed in-DB (no workers).
-- Live HTTP from Edge/server may wrap the same signing contract.
create or replace function app.webhook_http_post_once(
  p_url text,
  p_body text,
  p_signature text,
  p_timestamp text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_mode text := coalesce(nullif(current_setting('app.webhook_dispatch_transport', true), ''), 'stub');
begin
  if p_url ~* '^test://' then
    return jsonb_build_object(
      'status', 200,
      'body', jsonb_build_object('ok', true, 'transport', 'test')::text,
      'error', null);
  end if;

  if v_mode = 'fail' then
    return jsonb_build_object(
      'status', 503,
      'body', 'transport forced failure',
      'error', 'forced failure');
  end if;

  -- Default stub: sign+dispatch recorded without outbound sockets (local/CI).
  return jsonb_build_object(
    'status', 200,
    'body', jsonb_build_object(
      'ok', true,
      'transport', 'sync-stub',
      'url', p_url,
      'signature_prefix', left(p_signature, 12),
      'timestamp', p_timestamp
    )::text,
    'error', null);
end
$$;

create or replace function app.webhook_public_json(p_row public.webhooks)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', p_row.id,
    'name', p_row.name,
    'endpoint_url', p_row.endpoint_url,
    'subscribed_events', to_jsonb(p_row.subscribed_events),
    'is_active', p_row.is_active,
    'remark', p_row.remark,
    'has_signing_secret', p_row.signing_secret_enc is not null,
    'row_version', p_row.row_version,
    'created_at', p_row.created_at,
    'updated_at', p_row.updated_at);
$$;

-- ===========================================================================
-- Public tracking (anon-safe)
-- ===========================================================================
create or replace function app.build_public_tracking_json(p_ship public.shipments)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_origin text;
  v_dest text;
  v_carrier text;
  v_timeline jsonb;
  v_events jsonb;
begin
  select coalesce(o.name, o.code, '') into v_origin
    from public.destinations o
   where o.id = p_ship.origin_destination_id and o.tenant_id = p_ship.tenant_id;

  select coalesce(d.name, d.code, '') into v_dest
    from public.destinations d
   where d.id = p_ship.destination_id and d.tenant_id = p_ship.tenant_id;

  select coalesce(
      nullif(p_ship.carrier_provider_code, ''),
      v.name,
      v.code,
      '')
    into v_carrier
    from (select 1) _
    left join public.vendors v
      on v.id = p_ship.vendor_id and v.tenant_id = p_ship.tenant_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'status_text', te.status_text,
      'remark', te.remark,
      'event_date', te.event_date,
      'event_time', te.event_time,
      'source', te.source,
      'created_at', te.created_at
    ) order by te.created_at
  ), '[]'::jsonb)
    into v_timeline
  from public.tracking_events te
  where te.tenant_id = p_ship.tenant_id and te.shipment_id = p_ship.id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'event_type', se.event_type,
      'event_text', se.event_text,
      'created_at', se.created_at
    ) order by se.created_at
  ), '[]'::jsonb)
    into v_events
  from public.shipment_events se
  where se.tenant_id = p_ship.tenant_id and se.shipment_id = p_ship.id;

  return jsonb_build_object(
    'found', true,
    'shipment_number', p_ship.awb_no,
    'carrier_tracking_number', p_ship.carrier_tracking_no,
    'current_status', p_ship.current_status,
    'origin', coalesce(v_origin, ''),
    'destination', coalesce(v_dest, ''),
    'carrier_name', coalesce(v_carrier, ''),
    'pod_status', p_ship.pod_status,
    'estimated_delivery', null,
    'tracking_timeline', v_timeline,
    'shipment_timeline', v_events);
end
$$;

create or replace function public.public_track_shipment(
  p_awb_no text default null,
  p_carrier_tracking_no text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_awb text := nullif(btrim(coalesce(p_awb_no,'')),'');
  v_trk text := nullif(btrim(coalesce(p_carrier_tracking_no,'')),'');
  v_ship public.shipments;
  v_cnt int;
begin
  if v_awb is null and v_trk is null then
    raise exception 'AWB number or carrier tracking number is required'
      using errcode = 'CMS04';
  end if;

  if v_awb is not null then
    select count(*) into v_cnt
      from public.shipments s
     where s.deleted_at is null and s.awb_no = v_awb
       and s.current_status <> 'DRAFT';
    if v_cnt > 1 then
      -- Ambiguous across tenants — do not leak which tenants matched
      return jsonb_build_object('found', false);
    end if;
    select * into v_ship
      from public.shipments s
     where s.deleted_at is null and s.awb_no = v_awb
       and s.current_status <> 'DRAFT'
     limit 1;
  else
    select count(*) into v_cnt
      from public.shipments s
     where s.deleted_at is null
       and s.carrier_tracking_no = v_trk
       and s.current_status <> 'DRAFT';
    if v_cnt > 1 then
      return jsonb_build_object('found', false);
    end if;
    select * into v_ship
      from public.shipments s
     where s.deleted_at is null
       and s.carrier_tracking_no = v_trk
       and s.current_status <> 'DRAFT'
     limit 1;
  end if;

  if not found or v_ship.id is null then
    return jsonb_build_object('found', false);
  end if;

  perform app.bump_public_track_rate(v_ship.tenant_id);
  return app.build_public_tracking_json(v_ship);
end
$$;

comment on function public.public_track_shipment(text, text) is
  'Unauthenticated public tracking by AWB or carrier tracking number (customer-safe fields only).';

revoke all on function public.public_track_shipment(text, text) from public;
grant execute on function public.public_track_shipment(text, text)
  to anon, authenticated, service_role;

-- ===========================================================================
-- Webhook CRUD RPCs
-- ===========================================================================
create or replace function public.save_webhook(
  p_fields jsonb,
  p_id uuid default null,
  p_row_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_f jsonb := coalesce(p_fields, '{}'::jsonb);
  v_name text;
  v_url text;
  v_events text[];
  v_active boolean;
  v_remark text;
  v_regen boolean;
  v_secret text;
  v_row public.webhooks;
  v_old public.webhooks;
begin
  perform app.assert_integration_permission(v_tenant,
    case when p_id is null then 'add' else 'modify' end);

  v_name := nullif(btrim(coalesce(v_f->>'name','')),'');
  v_url := nullif(btrim(coalesce(v_f->>'endpoint_url','')),'');
  v_events := app.normalize_webhook_events(coalesce(v_f->'subscribed_events', '[]'::jsonb));
  v_active := case lower(btrim(coalesce(v_f->>'is_active','true')))
    when 'false' then false when 'no' then false when '0' then false else true end;
  v_remark := nullif(btrim(coalesce(v_f->>'remark','')),'');
  v_regen := case lower(btrim(coalesce(v_f->>'regenerate_secret','false')))
    when 'true' then true when 'yes' then true when '1' then true else false end;
  v_secret := nullif(btrim(coalesce(v_f->>'signing_secret','')),'');

  if v_name is null then
    raise exception 'Webhook name is required' using errcode = 'CMS04';
  end if;
  if v_url is null or v_url !~* '^(https?://|test://)' then
    raise exception 'endpoint_url must be http(s):// or test://' using errcode = 'CMS04';
  end if;

  if p_id is null then
    if v_secret is null then
      v_secret := app.generate_webhook_signing_secret();
    end if;
    insert into public.webhooks (
      tenant_id, name, endpoint_url, signing_secret_enc, subscribed_events,
      is_active, remark, created_by, updated_by)
    values (
      v_tenant, v_name, v_url,
      app.encrypt_integration_secret(v_secret),
      v_events, v_active, v_remark, auth.uid(), auth.uid())
    returning * into v_row;

    perform app.write_audit_log(
      v_tenant, 'webhooks', 'ADD', v_row.id, 'mst.vendor-master',
      null, jsonb_build_object(
        'name', v_row.name,
        'endpoint_url', v_row.endpoint_url,
        'subscribed_events', to_jsonb(v_row.subscribed_events),
        'is_active', v_row.is_active,
        'secret_set', true));
  else
    select * into v_old from public.webhooks
     where id = p_id and tenant_id = v_tenant and deleted_at is null
     for update;
    if not found then
      raise exception 'Webhook not found' using errcode = 'P0002';
    end if;
    if p_row_version is not null and v_old.row_version <> p_row_version then
      raise exception 'Optimistic lock conflict' using errcode = 'CMS04';
    end if;

    update public.webhooks
       set name = coalesce(v_name, name),
           endpoint_url = coalesce(v_url, endpoint_url),
           subscribed_events = v_events,
           is_active = case when v_f ? 'is_active' then v_active else is_active end,
           remark = case when v_f ? 'remark' then v_remark else remark end,
           signing_secret_enc = case
             when v_regen then app.encrypt_integration_secret(app.generate_webhook_signing_secret())
             when v_secret is not null then app.encrypt_integration_secret(v_secret)
             else signing_secret_enc
           end,
           updated_by = auth.uid(),
           updated_at = now(),
           row_version = row_version + 1
     where id = p_id
     returning * into v_row;

    perform app.write_audit_log(
      v_tenant, 'webhooks', 'MODIFY', v_row.id, 'mst.vendor-master',
      null, jsonb_build_object(
        'name', v_row.name,
        'endpoint_url', v_row.endpoint_url,
        'subscribed_events', to_jsonb(v_row.subscribed_events),
        'is_active', v_row.is_active,
        'secret_regenerated', v_regen or (v_secret is not null)));
  end if;

  return app.webhook_public_json(v_row);
exception
  when unique_violation then
    raise exception 'Webhook name already exists' using errcode = 'CMS04';
end
$$;

revoke all on function public.save_webhook(jsonb, uuid, integer) from public;
grant execute on function public.save_webhook(jsonb, uuid, integer)
  to authenticated, service_role;

create or replace function public.list_webhooks()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_rows jsonb;
begin
  perform app.assert_integration_permission(v_tenant, 'list');
  select coalesce(jsonb_agg(app.webhook_public_json(w) order by w.name), '[]'::jsonb)
    into v_rows
  from public.webhooks w
  where w.tenant_id = v_tenant and w.deleted_at is null;
  return jsonb_build_object('rows', v_rows);
end
$$;

revoke all on function public.list_webhooks() from public;
grant execute on function public.list_webhooks()
  to authenticated, service_role;

create or replace function public.get_webhook(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_row public.webhooks;
begin
  perform app.assert_integration_permission(v_tenant, 'list');
  select * into v_row from public.webhooks
   where id = p_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    return null;
  end if;
  return app.webhook_public_json(v_row);
end
$$;

revoke all on function public.get_webhook(uuid) from public;
grant execute on function public.get_webhook(uuid)
  to authenticated, service_role;

create or replace function public.delete_webhook(
  p_id uuid,
  p_row_version integer default null
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_row public.webhooks;
begin
  if not (
    app.is_platform_admin() or app.is_tenant_admin(v_tenant)
    or app.user_has_permission(v_tenant, 'mst.vendor-master', 'delete')
    or app.user_has_permission(v_tenant, 'mst.vendor-master', 'modify')
  ) then
    raise exception 'Permission denied: mst.vendor-master' using errcode = '42501';
  end if;

  select * into v_row from public.webhooks
   where id = p_id and tenant_id = v_tenant and deleted_at is null
   for update;
  if not found then
    raise exception 'Webhook not found' using errcode = 'P0002';
  end if;
  if p_row_version is not null and v_row.row_version <> p_row_version then
    raise exception 'Optimistic lock conflict' using errcode = 'CMS04';
  end if;

  update public.webhooks
     set deleted_at = now(),
         updated_at = now(),
         updated_by = auth.uid(),
         row_version = row_version + 1
   where id = p_id;

  perform app.write_audit_log(
    v_tenant, 'webhooks', 'DELETE', p_id, 'mst.vendor-master',
    jsonb_build_object('name', v_row.name), null);
end
$$;

revoke all on function public.delete_webhook(uuid, integer) from public;
grant execute on function public.delete_webhook(uuid, integer)
  to authenticated, service_role;

create or replace function public.list_webhook_deliveries(
  p_webhook_id uuid,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_lim int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_rows jsonb;
begin
  perform app.assert_integration_permission(v_tenant, 'list');
  if not exists (
    select 1 from public.webhooks w
     where w.id = p_webhook_id and w.tenant_id = v_tenant and w.deleted_at is null
  ) then
    raise exception 'Webhook not found' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(x.obj order by x.created_at desc), '[]'::jsonb)
    into v_rows
  from (
    select d.created_at, jsonb_build_object(
      'id', d.id,
      'webhook_id', d.webhook_id,
      'event_type', d.event_type,
      'response_status', d.response_status,
      'latency_ms', d.latency_ms,
      'attempt_number', d.attempt_number,
      'error_message', d.error_message,
      'created_at', d.created_at,
      'payload', d.payload
    ) as obj
    from public.webhook_deliveries d
   where d.tenant_id = v_tenant and d.webhook_id = p_webhook_id
   order by d.created_at desc
   limit v_lim
  ) x;

  return jsonb_build_object('rows', v_rows);
end
$$;

revoke all on function public.list_webhook_deliveries(uuid, integer) from public;
grant execute on function public.list_webhook_deliveries(uuid, integer)
  to authenticated, service_role;

-- ===========================================================================
-- dispatch_webhook — sign, POST once, record (no retry)
-- ===========================================================================
create or replace function public.dispatch_webhook(
  p_webhook_id uuid,
  p_event_type text,
  p_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_wh public.webhooks;
  v_event text := upper(btrim(coalesce(p_event_type,'')));
  v_secret text;
  v_ts text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_body jsonb;
  v_body_text text;
  v_sig text;
  v_t0 timestamptz := clock_timestamp();
  v_http jsonb;
  v_latency int;
  v_delivery public.webhook_deliveries;
  v_status int;
begin
  perform app.assert_integration_permission(v_tenant, 'modify');

  if not (v_event = any (app.webhook_event_codes())) then
    raise exception 'Unsupported webhook event' using errcode = 'CMS04';
  end if;

  select * into v_wh from public.webhooks
   where id = p_webhook_id and tenant_id = v_tenant and deleted_at is null
   for update;
  if not found then
    raise exception 'Webhook not found' using errcode = 'P0002';
  end if;
  if not v_wh.is_active then
    raise exception 'Webhook is inactive' using errcode = 'CMS04';
  end if;
  if not (v_event = any (v_wh.subscribed_events)) then
    raise exception 'Webhook is not subscribed to %', v_event using errcode = 'CMS04';
  end if;

  v_secret := app.decrypt_integration_secret(v_wh.signing_secret_enc);
  if v_secret is null or v_secret = '' then
    raise exception 'Webhook signing secret missing' using errcode = 'CMS04';
  end if;

  v_body := jsonb_build_object(
    'id', gen_random_uuid(),
    'event', v_event,
    'timestamp', v_ts,
    'data', coalesce(p_data, '{}'::jsonb));
  v_body_text := v_body::text;
  v_sig := app.webhook_sign_payload(v_secret, v_ts || '.' || v_body_text);

  v_http := app.webhook_http_post_once(
    v_wh.endpoint_url, v_body_text, v_sig, v_ts);
  v_latency := greatest(1, (extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int);
  v_status := coalesce((v_http->>'status')::int, 0);

  insert into public.webhook_deliveries (
    tenant_id, webhook_id, event_type, payload,
    response_status, response_body, latency_ms, attempt_number, error_message)
  values (
    v_tenant, v_wh.id, v_event,
    jsonb_build_object(
      'body', v_body,
      'signature', v_sig,
      'timestamp', v_ts,
      'headers', jsonb_build_object(
        'Content-Type', 'application/json',
        'X-SwiftForge-Signature', 'sha256=' || v_sig,
        'X-SwiftForge-Timestamp', v_ts
      )
    ),
    v_status,
    left(coalesce(v_http->>'body',''), 4000),
    v_latency,
    1,
    nullif(v_http->>'error',''))
  returning * into v_delivery;

  perform app.write_audit_log(
    v_tenant, 'webhooks', 'MODIFY', v_wh.id, 'mst.vendor-master',
    null, jsonb_build_object(
      'webhook_dispatch', true,
      'event', v_event,
      'delivery_id', v_delivery.id,
      'response_status', v_status));

  return jsonb_build_object(
    'delivery_id', v_delivery.id,
    'webhook_id', v_wh.id,
    'event_type', v_event,
    'response_status', v_status,
    'latency_ms', v_latency,
    'attempt_number', 1,
    'signature', v_sig,
    'timestamp', v_ts,
    'ok', v_status between 200 and 299);
end
$$;

revoke all on function public.dispatch_webhook(uuid, text, jsonb) from public;
grant execute on function public.dispatch_webhook(uuid, text, jsonb)
  to authenticated, service_role;

comment on table public.webhooks is
  'Outbound webhook endpoints (Milestone 7C). Signing secrets encrypted; never returned.';
comment on table public.webhook_deliveries is
  'Append-only webhook delivery log. attempt_number always 1 (no retries in 7C).';
comment on function public.dispatch_webhook(uuid, text, jsonb) is
  'Sign payload (HMAC-SHA256), POST once via sync transport, record delivery. No retry.';
