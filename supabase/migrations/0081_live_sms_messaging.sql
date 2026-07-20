-- Live SMS messaging (MSG91 / Twilio) for vendor booking OTP.
-- Edge function `send-sms` decrypts secrets (service_role) and calls the provider.

-- Widen provider_type for messaging gateways
alter table public.integration_providers
  drop constraint if exists integration_providers_provider_type_check;

alter table public.integration_providers
  add constraint integration_providers_provider_type_check
  check (provider_type in ('CARRIER', 'EINVOICE', 'CUSTOMS', 'VENDOR_GATEWAY', 'MESSAGING'));

insert into public.integration_providers (provider_code, provider_name, provider_type, status)
values
  ('MSG91', 'MSG91 SMS', 'MESSAGING', 'ACTIVE'),
  ('TWILIO', 'Twilio SMS', 'MESSAGING', 'ACTIVE')
on conflict (provider_code) do update set
  provider_name = excluded.provider_name,
  provider_type = excluded.provider_type,
  status = excluded.status;

-- Resolve active messaging credential for a tenant (service_role only)
create or replace function public.get_messaging_secrets(p_tenant_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := coalesce(p_tenant_id, (select t from (select app.user_tenant_ids() as t) s limit 1));
  v_cred public.integration_credentials;
  v_prov public.integration_providers;
begin
  if v_tenant is null then
    return null;
  end if;

  select c.* into v_cred
  from public.integration_credentials c
  join public.integration_providers p on p.id = c.provider_id
  where c.tenant_id = v_tenant
    and c.deleted_at is null
    and c.is_active = true
    and p.provider_type = 'MESSAGING'
    and upper(p.provider_code) in ('MSG91', 'TWILIO', 'GUPSHUP')
  order by
    case when c.sandbox_mode = false then 0 else 1 end,
    c.updated_at desc
  limit 1;

  if not found then
    return null;
  end if;

  select * into v_prov from public.integration_providers where id = v_cred.provider_id;

  return jsonb_build_object(
    'credential_id', v_cred.id,
    'provider_code', v_prov.provider_code,
    'username', v_cred.username,
    'password', app.decrypt_integration_secret(v_cred.password_enc),
    'api_key', app.decrypt_integration_secret(v_cred.api_key_enc),
    'api_secret', app.decrypt_integration_secret(v_cred.api_secret_enc),
    'account_number', v_cred.account_number,
    'endpoint', v_cred.endpoint,
    'sandbox_mode', coalesce(v_cred.sandbox_mode, false)
  );
end;
$$;

revoke all on function public.get_messaging_secrets(uuid) from public;
grant execute on function public.get_messaging_secrets(uuid) to service_role;

-- Issue OTP challenge; returns plaintext OTP only to service_role (edge function).
create or replace function public.issue_vendor_booking_otp(p_shipment_id uuid)
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
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    -- service_role path: resolve tenant from shipment
    select tenant_id into v_tenant from public.shipments where id = p_shipment_id and deleted_at is null;
  end if;
  if v_tenant is null then
    raise exception 'No tenant context' using errcode = '42501';
  end if;

  select * into v_s
  from public.shipments
  where id = p_shipment_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;

  v_mobile := app.shipper_mobile_from_json(v_s.shipper);
  if v_mobile is null then
    raise exception 'Shipper mobile number is required to send OTP'
      using errcode = 'CMS04';
  end if;

  v_otp := lpad(((floor(random() * 900000) + 100000))::int::text, 6, '0');
  v_hash := encode(digest(v_otp || p_shipment_id::text, 'sha256'), 'hex');

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

  return jsonb_build_object(
    'ok', true,
    'tenant_id', v_tenant,
    'shipment_id', p_shipment_id,
    'awb_no', v_s.awb_no,
    'mobile', v_mobile,
    'mobile_masked', app.mask_mobile(v_mobile),
    'otp', v_otp
  );
end;
$$;

revoke all on function public.issue_vendor_booking_otp(uuid) from public;
grant execute on function public.issue_vendor_booking_otp(uuid) to service_role;

-- Log SMS delivery from edge (service_role)
create or replace function public.log_vendor_booking_otp_sms(p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_f jsonb := coalesce(p_fields, '{}'::jsonb);
  v_tenant uuid := nullif(v_f->>'tenant_id', '')::uuid;
  v_shipment uuid := nullif(v_f->>'shipment_id', '')::uuid;
  v_mobile text := nullif(btrim(coalesce(v_f->>'mobile', '')), '');
  v_provider text := upper(coalesce(nullif(btrim(v_f->>'provider'), ''), 'SANDBOX'));
  v_status text := upper(coalesce(nullif(btrim(v_f->>'status'), ''), 'SUCCESS'));
  v_body text := coalesce(v_f->>'body', '');
  v_error text := nullif(btrim(coalesce(v_f->>'error', '')), '');
  v_live boolean := coalesce((v_f->>'live')::boolean, false);
  v_delivery uuid;
begin
  if v_tenant is null or v_shipment is null or v_mobile is null then
    raise exception 'tenant_id, shipment_id and mobile are required' using errcode = 'CMS04';
  end if;

  v_delivery := app.log_notification_delivery(
    v_tenant, 'SMS', v_mobile, 'OTP', null, null, v_provider, v_status,
    jsonb_build_object(
      'purpose', 'VENDOR_BOOKING_OTP',
      'shipment_id', v_shipment,
      'live', v_live,
      'body', left(v_body, 2000),
      'provider_response', left(coalesce(v_f->>'provider_response', ''), 2000)
    ),
    left(coalesce(v_f->>'provider_response', ''), 2000),
    greatest(1, coalesce((v_f->>'latency_ms')::int, 1)),
    v_error
  );

  perform app.append_vendor_activity(
    v_tenant, v_shipment,
    case when v_status = 'SUCCESS' then 'OTP_SENT' else 'OTP_SEND_FAILED' end,
    case when v_live and v_status = 'SUCCESS'
      then format('Live OTP SMS sent to shipper mobile %s via %s', app.mask_mobile(v_mobile), v_provider)
      when v_status = 'SUCCESS'
      then format('Sandbox OTP prepared for shipper mobile %s', app.mask_mobile(v_mobile))
      else format('OTP SMS failed for %s: %s', app.mask_mobile(v_mobile), coalesce(v_error, 'unknown'))
    end,
    jsonb_build_object('mobile_masked', app.mask_mobile(v_mobile), 'provider', v_provider, 'live', v_live),
    null
  );

  return jsonb_build_object('ok', true, 'delivery_id', v_delivery);
end;
$$;

revoke all on function public.log_vendor_booking_otp_sms(jsonb) from public;
grant execute on function public.log_vendor_booking_otp_sms(jsonb) to service_role;

-- Authenticated helper: does messaging credential exist? (no secrets)
create or replace function public.get_messaging_provider_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_code text;
  v_sandbox boolean;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context' using errcode = '42501';
  end if;

  select p.provider_code, c.sandbox_mode
    into v_code, v_sandbox
  from public.integration_credentials c
  join public.integration_providers p on p.id = c.provider_id
  where c.tenant_id = v_tenant
    and c.deleted_at is null
    and c.is_active = true
    and p.provider_type = 'MESSAGING'
  order by case when c.sandbox_mode = false then 0 else 1 end, c.updated_at desc
  limit 1;

  if v_code is null then
    return jsonb_build_object(
      'configured', false,
      'live', false,
      'provider', null,
      'message', 'No MSG91/Twilio credentials. Add them under Utility → Integration Configuration.'
    );
  end if;

  return jsonb_build_object(
    'configured', true,
    'live', coalesce(v_sandbox, true) = false,
    'provider', v_code,
    'sandbox_mode', coalesce(v_sandbox, true),
    'message', case when coalesce(v_sandbox, true) = false
      then format('Live SMS via %s', v_code)
      else format('%s credentials present but sandbox_mode=true — turn off sandbox for live SMS', v_code)
    end
  );
end;
$$;

revoke all on function public.get_messaging_provider_status() from public;
grant execute on function public.get_messaging_provider_status() to authenticated, service_role;
