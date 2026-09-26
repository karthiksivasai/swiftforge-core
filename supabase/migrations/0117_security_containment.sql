-- ===========================================================================
-- 0117  Production containment
-- ---------------------------------------------------------------------------
-- * Carrier secrets stay on the service role and require a tenant id.
-- * Authenticated roles cannot read station keys, service tokens, or
--   credential ciphertext.
-- * Revoked or inactive users stop matching tenant RLS immediately.
-- * Force-logoff records the GoTrue session id so the matching JWT dies.
-- * Sandbox OTP responses no longer include the code or the full mobile.
-- * Anonymous execute is removed from app.* functions.
-- ===========================================================================

alter table public.users
  add column if not exists access_invalid_before timestamptz;

alter table public.sessions
  add column if not exists auth_session_id text;

create index if not exists sessions_auth_session_idx
  on public.sessions (auth_user_id, auth_session_id);

-- ---------------------------------------------------------------------------
-- Session revocation is part of the RLS anchor.
-- ---------------------------------------------------------------------------
create or replace function app.auth_session_revoked()
returns boolean
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_uid uuid := auth.uid();
  v_sid text;
  v_iat bigint;
begin
  if v_uid is null then
    return false;
  end if;

  if exists (
    select 1 from public.users u
    where u.auth_user_id = v_uid
      and (u.status is distinct from 'ACTIVE' or u.deleted_at is not null)
  ) then
    return true;
  end if;

  begin
    v_iat := nullif(auth.jwt()->>'iat', '')::bigint;
  exception when others then
    v_iat := null;
  end;

  if exists (
    select 1 from public.users u
    where u.auth_user_id = v_uid
      and u.access_invalid_before is not null
      and (v_iat is null or v_iat <= extract(epoch from u.access_invalid_before)::bigint)
  ) then
    return true;
  end if;

  v_sid := nullif(auth.jwt()->>'session_id', '');
  if v_sid is not null and exists (
    select 1
    from public.sessions s
    where s.auth_user_id = v_uid
      and s.auth_session_id = v_sid
      and s.revoked_at is not null
      and not exists (
        select 1
        from public.sessions s2
        where s2.auth_user_id = v_uid
          and s2.auth_session_id = v_sid
          and s2.revoked_at is null
          and (s2.expires_at is null or s2.expires_at > now())
      )
  ) then
    return true;
  end if;

  return false;
end;
$$;

revoke all on function app.auth_session_revoked() from public, anon;
grant execute on function app.auth_session_revoked() to authenticated, service_role;

create or replace function app.user_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, app
as $$
  select tu.tenant_id
  from public.tenant_users tu
  where tu.user_id = auth.uid()
    and tu.status = 'ACTIVE'
    and not app.auth_session_revoked()
$$;

create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select exists (
    select 1 from public.tenant_users tu
    where tu.user_id = auth.uid()
      and tu.is_platform_admin
      and tu.status = 'ACTIVE'
      and not app.auth_session_revoked()
  )
$$;

create or replace function public.me()
returns setof public.users
language sql
stable
security definer
set search_path = public, app
as $$
  select *
  from public.users
  where auth_user_id = auth.uid()
    and deleted_at is null
    and status = 'ACTIVE'
    and not app.auth_session_revoked()
  limit 1
$$;

create or replace function public.record_login(
  p_app text default 'WEB',
  p_ip inet default null,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_user public.users;
  v_session uuid;
begin
  select * into v_user
  from public.users
  where auth_user_id = auth.uid()
    and deleted_at is null
    and status = 'ACTIVE'
  limit 1;
  if v_user.id is null then
    raise exception 'No application user for current auth user' using errcode = '42501';
  end if;
  if app.auth_session_revoked() then
    raise exception 'Access revoked' using errcode = '42501';
  end if;

  insert into public.sessions (
    tenant_id, user_id, auth_user_id, auth_session_id, app, ip_address, user_agent, last_seen_at, expires_at
  ) values (
    v_user.tenant_id,
    v_user.id,
    auth.uid(),
    nullif(auth.jwt()->>'session_id', ''),
    case when upper(coalesce(p_app, 'WEB')) = 'MOBILE' then 'MOBILE' else 'WEB' end,
    p_ip,
    p_user_agent,
    now(),
    now() + interval '30 days'
  )
  returning id into v_session;

  insert into public.login_logs (tenant_id, user_id, username, event, user_type, ip_address, user_agent, session_id)
  values (v_user.tenant_id, v_user.id, v_user.username, 'LOGIN_SUCCESS', v_user.user_type, p_ip, p_user_agent, v_session);

  return v_session;
end;
$$;

create or replace function public.revoke_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_session public.sessions;
  v_actor uuid;
begin
  select * into v_session from public.sessions where id = p_session_id;
  if not found then
    raise exception 'Session not found' using errcode = 'P0002';
  end if;
  if not (
    app.is_tenant_admin(v_session.tenant_id)
    or app.user_has_permission(v_session.tenant_id, 'utl.loggedin-users', 'modify')
  ) then
    raise exception 'Not permitted to force logoff' using errcode = '42501';
  end if;

  select id into v_actor
  from public.users
  where auth_user_id = auth.uid()
    and tenant_id = v_session.tenant_id
  limit 1;

  update public.sessions
     set revoked_at = now(),
         revoked_by = v_actor,
         revoke_reason = 'FORCED_LOGOUT'
   where id = p_session_id
     and revoked_at is null;

  -- Sessions created before auth_session_id was stored cannot be matched to a
  -- single JWT. Invalidate every token issued before this moment for that user.
  if v_session.auth_session_id is null then
    update public.users
       set access_invalid_before = now()
     where id = v_session.user_id;
  end if;

  insert into public.login_logs (tenant_id, user_id, username, event, user_type, session_id, detail)
  values (
    v_session.tenant_id,
    v_session.user_id,
    (select username from public.users where id = v_session.user_id),
    'FORCED_LOGOUT',
    (select user_type from public.users where id = v_session.user_id),
    p_session_id,
    'forced by ' || coalesce(v_actor::text, 'admin')
  );
end;
$$;

create or replace function public.my_session_is_active(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select exists (
    select 1
    from public.sessions s
    where s.id = p_session_id
      and s.auth_user_id = auth.uid()
      and s.revoked_at is null
      and (s.expires_at is null or s.expires_at > now())
  )
  and not app.auth_session_revoked()
$$;

revoke all on function public.my_session_is_active(uuid) from public, anon;
grant execute on function public.my_session_is_active(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Secrets: no client SELECT, and the RPC refuses anyone but service_role
-- for the tenant it was given.
-- ---------------------------------------------------------------------------
revoke select (station_api_key) on table public.vendors from public, anon, authenticated;

revoke all privileges on table public.vendor_service_tokens from public, anon, authenticated;

drop policy if exists vendor_service_tokens_select on public.vendor_service_tokens;
drop policy if exists vendor_service_tokens_all on public.vendor_service_tokens;

revoke select (password_enc, api_key_enc, api_secret_enc)
  on table public.integration_credentials
  from public, anon, authenticated;

drop function if exists public.get_vendor_carrier_secrets(uuid, text);
drop function if exists app.get_vendor_carrier_secrets(uuid, text);

create or replace function public.get_vendor_carrier_secrets(
  p_vendor_id uuid,
  p_service_code text,
  p_tenant_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_vendor public.vendors;
  v_token text;
  v_carrier_service_code text;
  v_station_code text;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'Carrier secrets are server-only' using errcode = '42501';
  end if;
  if p_tenant_id is null then
    raise exception 'Tenant is required' using errcode = '42501';
  end if;

  select * into v_vendor
  from public.vendors
  where id = p_vendor_id
    and tenant_id = p_tenant_id
    and deleted_at is null;

  if v_vendor.id is null then
    return jsonb_build_object('configured', false, 'reason', 'Vendor not found');
  end if;

  if v_vendor.carrier_provider is null or btrim(v_vendor.carrier_provider) = '' then
    return jsonb_build_object(
      'configured', false,
      'vendor_code', v_vendor.code,
      'reason', 'No carrier provider configured'
    );
  end if;

  v_station_code := coalesce(v_vendor.station_code, 'MEL');

  if p_service_code is not null and btrim(p_service_code) <> '' then
    select third_party_token,
           coalesce(carrier_service_code, service_code),
           coalesce(station_code, v_station_code)
      into v_token, v_carrier_service_code, v_station_code
    from public.vendor_service_tokens
    where tenant_id = p_tenant_id
      and (vendor_id = v_vendor.id or station_code = v_vendor.station_code)
      and upper(service_code) = upper(btrim(p_service_code))
      and is_active is true
      and deleted_at is null
    order by case when vendor_id = v_vendor.id then 0 else 1 end
    limit 1;
  end if;

  return jsonb_build_object(
    'configured', true,
    'tenant_id', v_vendor.tenant_id,
    'vendor_id', v_vendor.id,
    'vendor_code', v_vendor.code,
    'carrier_provider', v_vendor.carrier_provider,
    'api_base_url', coalesce(v_vendor.api_base_url, 'https://api.postshipping.com/api2'),
    'station_code', v_station_code,
    'station_api_key', v_vendor.station_api_key,
    'is_live_mode', coalesce(v_vendor.is_live_mode, false),
    'service_code', p_service_code,
    'carrier_service_code', coalesce(v_carrier_service_code, p_service_code),
    'third_party_token', v_token,
    'has_station_key', (v_vendor.station_api_key is not null and btrim(v_vendor.station_api_key) <> ''),
    'has_service_token', (v_token is not null and btrim(v_token) <> '')
  );
end;
$$;

revoke all on function public.get_vendor_carrier_secrets(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.get_vendor_carrier_secrets(uuid, text, uuid) to service_role;

comment on function public.get_vendor_carrier_secrets(uuid, text, uuid) is
  'Service-role only. Caller must pass the authenticated tenant; vendor rows from other tenants are not returned.';

-- Client-facing config never includes the key or token.
create or replace function public.get_vendor_carrier_config(
  p_vendor_id uuid,
  p_service_code text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_vendor public.vendors;
  v_has_token boolean := false;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null or app.auth_session_revoked() then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_vendor
  from public.vendors
  where id = p_vendor_id
    and tenant_id = v_tenant
    and deleted_at is null;

  if v_vendor.id is null then
    return jsonb_build_object('configured', false, 'reason', 'Vendor not found');
  end if;

  if p_service_code is not null and btrim(p_service_code) <> '' then
    select true into v_has_token
    from public.vendor_service_tokens
    where tenant_id = v_tenant
      and vendor_id = v_vendor.id
      and upper(service_code) = upper(btrim(p_service_code))
      and is_active is true
      and deleted_at is null
    limit 1;
  end if;

  return jsonb_build_object(
    'configured', v_vendor.carrier_provider is not null and btrim(v_vendor.carrier_provider) <> '',
    'vendor_id', v_vendor.id,
    'vendor_code', v_vendor.code,
    'vendor_name', v_vendor.name,
    'carrier_provider', v_vendor.carrier_provider,
    'api_base_url', coalesce(v_vendor.api_base_url, 'https://api.postshipping.com/api2'),
    'station_code', v_vendor.station_code,
    'is_live_mode', coalesce(v_vendor.is_live_mode, false),
    'service_code', p_service_code,
    'has_station_key', (v_vendor.station_api_key is not null and btrim(v_vendor.station_api_key) <> ''),
    'has_service_token', coalesce(v_has_token, false)
  );
end;
$$;

revoke all on function public.get_vendor_carrier_config(uuid, text) from public, anon;
grant execute on function public.get_vendor_carrier_config(uuid, text) to authenticated, service_role;

-- Drop credential username from the booking context returned to the browser.
create or replace function public.get_vendor_shipping_context(p_shipment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant  uuid;
  v_s       public.shipments;
  v_vendor  public.vendors;
  v_vi      public.vendor_integrations;
  v_cred    public.integration_credentials;
  v_pieces  jsonb;
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

  if v_s.vendor_id is not null then
    select * into v_vendor
    from public.vendors
    where id = v_s.vendor_id and tenant_id = v_tenant and deleted_at is null;
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
      'tenant_id', v_s.tenant_id,
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
      'service_code', v_s.service,
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
      'customer_code', (select code from public.customers where id = v_s.customer_id and tenant_id = v_tenant),
      'customer_name', (select name from public.customers where id = v_s.customer_id and tenant_id = v_tenant),
      'product_code', (select code from public.products where id = v_s.product_id and tenant_id = v_tenant),
      'vendor_code', v_vendor.code,
      'vendor_name', v_vendor.name,
      'origin_code', (select code from public.destinations where id = v_s.origin_destination_id and tenant_id = v_tenant),
      'destination_code', (select code from public.destinations where id = v_s.destination_id and tenant_id = v_tenant)
    ),
    'pieces', v_pieces,
    'charges', v_charges,
    'integration', case
      when v_vi.id is not null then jsonb_build_object(
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
        'sandbox_mode', coalesce(v_cred.sandbox_mode, true)
      )
      when v_vendor.carrier_provider is not null then jsonb_build_object(
        'id', v_vendor.id,
        'provider_code', v_vendor.carrier_provider,
        'endpoint_url', v_vendor.api_base_url,
        'requires_otp', false,
        'has_username', false,
        'sandbox_mode', not coalesce(v_vendor.is_live_mode, false)
      )
      else null
    end,
    'shipping_api_enabled', (v_vi.id is not null or (v_vendor.carrier_provider is not null and v_vendor.carrier_provider <> ''))
  );
end;
$$;

revoke all on function public.get_vendor_shipping_context(uuid) from public, anon;
grant execute on function public.get_vendor_shipping_context(uuid) to authenticated, service_role;

-- Public tracking: status and places only. No free-text remarks.
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

  select coalesce(nullif(p_ship.carrier_provider_code, ''), v.name, v.code, '')
    into v_carrier
  from (select 1) _
  left join public.vendors v
    on v.id = p_ship.vendor_id and v.tenant_id = p_ship.tenant_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'status_text', te.status_text,
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
    'shipment_timeline', v_events
  );
end;
$$;

-- Authenticated OTP RPC must not reveal the code or the full number.
create or replace function public.send_vendor_booking_otp(p_shipment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app, extensions
as $$
declare
  v_tenant uuid;
  v_s public.shipments;
  v_mobile text;
  v_otp text;
  v_hash text;
  v_masked text;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context' using errcode = '42501';
  end if;
  perform app.assert_carrier_shipment_permission(v_tenant, 'modify');

  select * into v_s
  from public.shipments
  where id = p_shipment_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;

  v_mobile := app.shipper_mobile_from_json(v_s.shipper);
  if v_mobile is null then
    raise exception 'Shipper mobile number is required to send OTP' using errcode = 'CMS04';
  end if;

  v_otp := lpad((floor(random() * 1000000))::int::text, 6, '0');
  v_hash := encode(digest(v_otp || p_shipment_id::text, 'sha256'), 'hex');
  v_masked := app.mask_mobile(v_mobile);

  insert into public.vendor_booking_otp_challenges (
    shipment_id, tenant_id, mobile, otp_hash, expires_at, created_by
  ) values (
    p_shipment_id, v_tenant, v_mobile, v_hash, now() + interval '10 minutes', app.current_user_id()
  )
  on conflict (shipment_id) do update set
    mobile = excluded.mobile,
    otp_hash = excluded.otp_hash,
    expires_at = excluded.expires_at,
    created_at = now(),
    created_by = excluded.created_by;

  perform app.log_notification_delivery(
    v_tenant, 'SMS', v_masked, 'OTP', null, null, 'SANDBOX', 'SUCCESS',
    jsonb_build_object(
      'purpose', 'VENDOR_BOOKING_OTP',
      'shipment_id', p_shipment_id,
      'awb_no', v_s.awb_no
    ),
    'otp-issued', 1, null
  );

  perform app.append_vendor_activity(
    v_tenant, p_shipment_id, 'OTP_SENT',
    format('OTP sent to shipper mobile %s', v_masked),
    jsonb_build_object('mobile_masked', v_masked),
    null
  );

  return jsonb_build_object(
    'ok', true,
    'mobile_masked', v_masked,
    'provider', 'SANDBOX',
    'sandbox', true,
    'live', false,
    'message', format('OTP issued for shipper %s', v_masked)
  );
end;
$$;

revoke all on function public.send_vendor_booking_otp(uuid) from public, anon;
grant execute on function public.send_vendor_booking_otp(uuid) to authenticated, service_role;

-- Anonymous callers cannot execute app helpers. Public tracking stays on its public wrapper.
revoke all on all functions in schema app from public;
revoke all on all functions in schema app from anon;
alter default privileges in schema app revoke execute on functions from public;
alter default privileges in schema app revoke execute on functions from anon;
