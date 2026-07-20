-- Reveal sandbox OTP in RPC response so AWB Book can complete without live SMS.
-- Real phone delivery still requires a live SMS provider (not wired in 7D).

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
  v_body text;
  v_sms jsonb;
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
    raise exception 'Shipper mobile number is required to send OTP'
      using errcode = 'CMS04';
  end if;

  v_otp := lpad((floor(random() * 1000000))::int::text, 6, '0');
  v_hash := encode(digest(v_otp || p_shipment_id::text, 'sha256'), 'hex');
  v_body := format(
    'Your vendor booking OTP for AWB %s is %s. Valid for 10 minutes. Do not share.',
    coalesce(nullif(v_s.awb_no, ''), 'N/A'),
    v_otp
  );

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

  v_sms := app.sandbox_send_sms(v_mobile, v_body);

  perform app.log_notification_delivery(
    v_tenant, 'SMS', v_mobile, 'OTP', null, null, 'SANDBOX', 'SUCCESS',
    jsonb_build_object(
      'purpose', 'VENDOR_BOOKING_OTP',
      'shipment_id', p_shipment_id,
      'awb_no', v_s.awb_no,
      'body', left(v_body, 2000),
      'sandbox_otp', v_otp
    ),
    v_sms::text, 1, null
  );

  perform app.append_vendor_activity(
    v_tenant, p_shipment_id, 'OTP_SENT',
    format('OTP sent to shipper mobile %s (sandbox)', app.mask_mobile(v_mobile)),
    jsonb_build_object('mobile_masked', app.mask_mobile(v_mobile), 'sandbox', true),
    null
  );

  return jsonb_build_object(
    'ok', true,
    'mobile', v_mobile,
    'mobile_masked', app.mask_mobile(v_mobile),
    'provider', 'SANDBOX',
    'sandbox', true,
    -- Sandbox only: no live SMS transport yet — return OTP for UI entry.
    'sandbox_otp', v_otp,
    'message', format(
      'Sandbox OTP for shipper %s: %s (live SMS not configured)',
      app.mask_mobile(v_mobile),
      v_otp
    )
  );
end;
$$;

revoke all on function public.send_vendor_booking_otp(uuid) from public;
grant execute on function public.send_vendor_booking_otp(uuid) to authenticated, service_role;
