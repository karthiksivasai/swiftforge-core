-- ===========================================================================
-- notification_delivery_verification.sql — Phase 7 Milestone 7D
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000058','authenticated','authenticated','nd@a.test'),
  ('99999999-1111-4111-8111-00000000b058','authenticated','authenticated','nd@b.test'),
  ('99999999-1111-4111-8111-00000000d058','authenticated','authenticated','ndstaff@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid; v_tb uuid;
begin
  v_t := app.bootstrap_tenant('nd-a', 'Nd A', 'NdA');
  perform app.link_tenant_admin(v_t, '99999999-1111-4111-8111-000000000058',
          'ndadm', 'Nd Admin', 'nd@a.test');
  perform set_config('nd.tenant', v_t::text, false);

  v_tb := app.bootstrap_tenant('nd-b', 'Nd B', 'NdB');
  perform app.link_tenant_admin(v_tb, '99999999-1111-4111-8111-00000000b058',
          'ndadmb', 'Nd Admin B', 'nd@b.test');
  perform set_config('nd.tenant_b', v_tb::text, false);
end $$;

do $$
begin
  if to_regclass('public.notification_deliveries') is null then
    raise exception 'FAIL [table] notification_deliveries';
  end if;
  if to_regprocedure('public.send_email(jsonb)') is null then
    raise exception 'FAIL [fn] send_email';
  end if;
  if to_regprocedure('public.send_sms(jsonb)') is null then
    raise exception 'FAIL [fn] send_sms';
  end if;
  if to_regprocedure('public.send_whatsapp(jsonb)') is null then
    raise exception 'FAIL [fn] send_whatsapp';
  end if;
  if to_regprocedure('public.dispatch_notification(jsonb)') is null then
    raise exception 'FAIL [fn] dispatch';
  end if;
  if to_regprocedure('public.test_email_configuration(text,uuid)') is null then
    raise exception 'FAIL [fn] test_email';
  end if;
  raise notice 'PASS [structure]';
end $$;

do $$
declare
  v_t uuid := current_setting('nd.tenant')::uuid;
  v_branch uuid; v_uid uuid; v_gid uuid;
begin
  select id into v_branch from public.branches
   where tenant_id = v_t and deleted_at is null
   order by case when is_head_office then 0 else 1 end limit 1;

  insert into public.tenant_users (tenant_id, user_id, role, status)
  values (v_t, '99999999-1111-4111-8111-00000000d058', 'MEMBER', 'ACTIVE')
  on conflict (tenant_id, user_id) do update set status = 'ACTIVE';

  insert into public.users (
    tenant_id, auth_user_id, username, user_type, full_name, email, home_branch_id, status)
  values (
    v_t, '99999999-1111-4111-8111-00000000d058', 'ndstaff', 'STAFF',
    'Nd Staff', 'ndstaff@a.test', v_branch, 'ACTIVE')
  on conflict (auth_user_id) do update set deleted_at = null
  returning id into v_uid;

  select id into v_gid from public.user_groups
   where tenant_id = v_t and name = 'OPERATIONS' and deleted_at is null;
  insert into public.user_group_members (tenant_id, user_id, group_id)
  values (v_t, v_uid, v_gid) on conflict (user_id, group_id) do nothing;

  update public.group_permissions gp
     set can_add = false, can_modify = false, can_list = false, can_search = false,
         can_delete = false, all_access = false
    from public.permission_modules pm
   where gp.module_id = pm.id and gp.group_id = v_gid
     and pm.slug in ('utl.notification', 'utl.xpresion-setup');

  raise notice 'PASS [seed]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000058';

do $$
declare
  v_email jsonb;
  v_sms jsonb;
  v_wa jsonb;
  v_disp jsonb;
  v_prev jsonb;
  v_list jsonb;
  v_tmpl jsonb;
  v_test jsonb;
  v_cnt int;
  v_id uuid;
begin
  -- SMTP config + templates + preferences
  v_email := public.save_email_configuration(jsonb_build_object(
    'smtp_host', 'smtp.example.test',
    'smtp_port', 587,
    'username', 'mailer',
    'password', 'smtp-secret-never-returned',
    'sender_name', 'SwiftForge',
    'sender_email', 'noreply@example.test',
    'use_ssl', true,
    'is_default', true,
    'status', 'ACTIVE'
  ));
  if v_email ? 'password' or v_email ? 'password_enc' then
    raise exception 'FAIL [smtp secret leak]';
  end if;
  if v_email->>'has_password' <> 'true' then
    raise exception 'FAIL [smtp has_password]';
  end if;

  v_tmpl := public.save_notification_template(jsonb_build_object(
    'code', 'BOOKING_EMAIL',
    'name', 'Booking email',
    'notification_type', 'BOOKING',
    'channel', 'EMAIL',
    'subject', 'Booked {{awb}}',
    'body', 'Hello {{name}}, AWB {{awb}} is booked.',
    'status', 'ACTIVE'
  ));
  perform public.save_notification_template(jsonb_build_object(
    'code', 'BOOKING_SMS',
    'name', 'Booking sms',
    'notification_type', 'BOOKING',
    'channel', 'SMS',
    'body', 'AWB {{awb}} booked',
    'status', 'ACTIVE'
  ));
  perform public.save_notification_template(jsonb_build_object(
    'code', 'POD_WA',
    'name', 'POD whatsapp',
    'notification_type', 'POD',
    'channel', 'WHATSAPP',
    'body', 'POD for {{awb}}',
    'status', 'ACTIVE'
  ));

  perform public.save_notification_preferences(jsonb_build_array(
    jsonb_build_object(
      'notification_type', 'BOOKING',
      'email_enabled', true,
      'sms_enabled', true,
      'whatsapp_enabled', false),
    jsonb_build_object(
      'notification_type', 'POD',
      'email_enabled', false,
      'sms_enabled', false,
      'whatsapp_enabled', true),
    jsonb_build_object(
      'notification_type', 'OTP',
      'email_enabled', false,
      'sms_enabled', true,
      'whatsapp_enabled', true)
  ));

  -- Template preview / rendering
  v_prev := public.preview_notification_template(
    (v_tmpl->>'id')::uuid, null,
    jsonb_build_object('name', 'Ada', 'awb', 'AWB1'));
  if v_prev->>'subject' is distinct from 'Booked AWB1' then
    raise exception 'FAIL [render subject] %', v_prev->>'subject';
  end if;
  if position('Hello Ada' in v_prev->>'body') = 0 then
    raise exception 'FAIL [render body]';
  end if;

  -- Email send
  v_email := public.send_email(jsonb_build_object(
    'to', 'customer@example.test',
    'notification_type', 'BOOKING',
    'template_code', 'BOOKING_EMAIL',
    'variables', jsonb_build_object('name', 'Ada', 'awb', 'AWB1'),
    'attachments', jsonb_build_array(jsonb_build_object('file_id', gen_random_uuid(), 'name', 'label.json'))
  ));
  if v_email->>'status' <> 'SUCCESS' then raise exception 'FAIL [email send]'; end if;

  v_test := public.test_email_configuration('tester@example.test', null);
  if v_test->>'status' <> 'SUCCESS' then raise exception 'FAIL [test email]'; end if;

  -- SMS send
  v_sms := public.send_sms(jsonb_build_object(
    'to', '9000000001',
    'purpose', 'SHIPMENT_BOOKED',
    'template_code', 'BOOKING_SMS',
    'variables', jsonb_build_object('awb', 'AWB1')
  ));
  if v_sms->>'status' <> 'SUCCESS' then raise exception 'FAIL [sms send]'; end if;

  -- Preference filtering: WhatsApp disabled for BOOKING
  v_wa := public.send_whatsapp(jsonb_build_object(
    'to', '9000000001',
    'purpose', 'SHIPMENT_UPDATES',
    'variables', jsonb_build_object('awb', 'AWB1')
  ));
  if v_wa->>'status' <> 'SKIPPED' then raise exception 'FAIL [wa pref skip]'; end if;

  -- WhatsApp enabled for POD
  v_wa := public.send_whatsapp(jsonb_build_object(
    'to', '9000000001',
    'purpose', 'POD_NOTIFICATION',
    'template_code', 'POD_WA',
    'variables', jsonb_build_object('awb', 'AWB1')
  ));
  if v_wa->>'status' <> 'SUCCESS' then raise exception 'FAIL [wa send]'; end if;

  -- Dispatch multi-channel for BOOKING (email+sms)
  v_disp := public.dispatch_notification(jsonb_build_object(
    'notification_type', 'BOOKING',
    'email_to', 'ops@example.test',
    'sms_to', '9000000002',
    'variables', jsonb_build_object('name', 'Ops', 'awb', 'AWB2')
  ));
  if jsonb_array_length(v_disp->'results') < 2 then
    raise exception 'FAIL [dispatch channels]';
  end if;

  -- Delivery logging
  v_list := public.list_notification_deliveries(null, 100);
  if jsonb_array_length(v_list->'rows') < 4 then
    raise exception 'FAIL [delivery log count]';
  end if;

  -- Append-only
  select id into v_id from public.notification_deliveries
   where tenant_id = current_setting('nd.tenant')::uuid limit 1;
  begin
    update public.notification_deliveries set status = 'FAILURE' where id = v_id;
  exception when others then null;
  end;
  if exists (
    select 1 from public.notification_deliveries where id = v_id and status = 'FAILURE'
  ) then raise exception 'FAIL [append only]'; end if;

  -- Audit
  select count(*) into v_cnt from public.audit_logs
   where entity_type = 'notification_deliveries'
     and tenant_id = current_setting('nd.tenant')::uuid;
  if v_cnt < 1 then raise exception 'FAIL [audit]'; end if;

  -- Provider status (no secrets)
  v_list := public.get_notification_provider_status();
  if v_list ? 'smtp_password' then raise exception 'FAIL [provider secret]'; end if;

  raise notice 'PASS [email / sms / whatsapp / prefs / render / logs / audit]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000d058';
do $$
begin
  begin
    perform public.send_sms(jsonb_build_object('to','1','purpose','OTP','skip_preference_check',true));
    raise exception 'FAIL [perm]';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'PASS [permissions]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000b058';
do $$
declare v_list jsonb;
begin
  v_list := public.list_notification_deliveries(null, 10);
  if jsonb_array_length(coalesce(v_list->'rows','[]'::jsonb)) <> 0 then
    raise exception 'FAIL [tenant isolation]';
  end if;
  raise notice 'PASS [tenant isolation]';
end $$;

reset role;
do $$
begin
  raise notice '==========================================================';
  raise notice 'NOTIFICATION DELIVERY VERIFICATION PASSED.';
  raise notice '==========================================================';
end $$;

rollback;
