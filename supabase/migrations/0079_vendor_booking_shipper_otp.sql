-- Vendor booking OTP delivered to shipper mobile (shipments.shipper.mobile).
-- Uses shipment permissions (not utl.notification) so AWB bookers can send OTP.

create table if not exists public.vendor_booking_otp_challenges (
  shipment_id   uuid primary key
    references public.shipments (id) on delete cascade,
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  mobile        text not null,
  otp_hash      text not null,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now(),
  created_by    uuid
);

create index if not exists vendor_booking_otp_challenges_tenant_idx
  on public.vendor_booking_otp_challenges (tenant_id);

alter table public.vendor_booking_otp_challenges enable row level security;
drop policy if exists vendor_booking_otp_challenges_deny on public.vendor_booking_otp_challenges;
-- No direct client access; RPCs only.
create policy vendor_booking_otp_challenges_deny on public.vendor_booking_otp_challenges
  for all using (false);

create or replace function app.shipper_mobile_from_json(p_shipper jsonb)
returns text
language sql
immutable
as $$
  select nullif(btrim(coalesce(
    p_shipper->>'mobile',
    p_shipper->>'mobile_no',
    p_shipper->>'mobileNo',
    p_shipper->>'telephone',
    p_shipper->>'tel',
    ''
  )), '');
$$;

create or replace function app.mask_mobile(p_mobile text)
returns text
language plpgsql
immutable
as $$
declare
  v_digits text;
begin
  v_digits := regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g');
  if length(v_digits) < 4 then
    return coalesce(nullif(btrim(p_mobile), ''), '—');
  end if;
  return '••••••' || right(v_digits, 4);
end;
$$;

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
      'body', left(v_body, 2000)
    ),
    v_sms::text, 1, null
  );

  perform app.append_vendor_activity(
    v_tenant, p_shipment_id, 'OTP_SENT',
    format('OTP sent to shipper mobile %s', app.mask_mobile(v_mobile)),
    jsonb_build_object('mobile_masked', app.mask_mobile(v_mobile)),
    null
  );

  return jsonb_build_object(
    'ok', true,
    'mobile', v_mobile,
    'mobile_masked', app.mask_mobile(v_mobile),
    'provider', 'SANDBOX',
    'message', format('OTP sent to shipper mobile %s', app.mask_mobile(v_mobile))
  );
end;
$$;

revoke all on function public.send_vendor_booking_otp(uuid) from public;
grant execute on function public.send_vendor_booking_otp(uuid) to authenticated, service_role;

create or replace function public.verify_vendor_booking_otp(
  p_shipment_id uuid,
  p_otp text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, extensions
as $$
declare
  v_tenant uuid;
  v_row public.vendor_booking_otp_challenges;
  v_hash text;
  v_otp text := btrim(coalesce(p_otp, ''));
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context' using errcode = '42501';
  end if;
  perform app.assert_carrier_shipment_permission(v_tenant, 'modify');

  if v_otp = '' then
    return jsonb_build_object('ok', false, 'message', 'OTP is required');
  end if;

  select * into v_row
  from public.vendor_booking_otp_challenges
  where shipment_id = p_shipment_id and tenant_id = v_tenant;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'No OTP challenge found. Resend OTP.');
  end if;
  if v_row.expires_at < now() then
    delete from public.vendor_booking_otp_challenges where shipment_id = p_shipment_id;
    return jsonb_build_object('ok', false, 'message', 'OTP expired. Resend OTP.');
  end if;

  v_hash := encode(digest(v_otp || p_shipment_id::text, 'sha256'), 'hex');
  if v_hash <> v_row.otp_hash then
    return jsonb_build_object('ok', false, 'message', 'Invalid OTP. Please try again.');
  end if;

  delete from public.vendor_booking_otp_challenges where shipment_id = p_shipment_id;

  return jsonb_build_object(
    'ok', true,
    'mobile_masked', app.mask_mobile(v_row.mobile),
    'message', 'OTP verified'
  );
end;
$$;

revoke all on function public.verify_vendor_booking_otp(uuid, text) from public;
grant execute on function public.verify_vendor_booking_otp(uuid, text) to authenticated, service_role;
