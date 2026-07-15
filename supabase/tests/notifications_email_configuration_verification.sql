-- ===========================================================================
-- notifications_email_configuration_verification.sql — Phase 6 Milestone 6E
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000053','authenticated','authenticated','notif@a.test'),
  ('99999999-1111-4111-8111-00000000b053','authenticated','authenticated','notif@b.test'),
  ('99999999-1111-4111-8111-00000000d053','authenticated','authenticated','notifstaff@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid; v_tb uuid;
begin
  v_t := app.bootstrap_tenant('notif-a', 'Notif A', 'NotifA');
  perform app.link_tenant_admin(v_t, '99999999-1111-4111-8111-000000000053',
          'notifadm', 'Notif Admin', 'notif@a.test');
  perform set_config('nf.tenant', v_t::text, false);

  v_tb := app.bootstrap_tenant('notif-b', 'Notif B', 'NotifB');
  perform app.link_tenant_admin(v_tb, '99999999-1111-4111-8111-00000000b053',
          'notifadmb', 'Notif Admin B', 'notif@b.test');
  perform set_config('nf.tenant_b', v_tb::text, false);
end $$;

do $$
begin
  if to_regclass('public.email_configurations') is null then raise exception 'FAIL [email table]'; end if;
  if to_regclass('public.notification_templates') is null then raise exception 'FAIL [templates]'; end if;
  if to_regclass('public.notification_preferences') is null then raise exception 'FAIL [prefs]'; end if;
  if to_regclass('public.user_notifications') is null then raise exception 'FAIL [user notif]'; end if;
  if to_regprocedure('public.save_email_configuration(jsonb,uuid,integer)') is null then
    raise exception 'FAIL [fn] save_email';
  end if;
  if to_regprocedure('public.get_email_configuration(uuid)') is null then
    raise exception 'FAIL [fn] get_email';
  end if;
  if to_regprocedure('public.save_notification_template(jsonb,uuid,integer)') is null then
    raise exception 'FAIL [fn] save_template';
  end if;
  if to_regprocedure('public.save_notification_preferences(jsonb)') is null then
    raise exception 'FAIL [fn] save_prefs';
  end if;
  if to_regprocedure('public.create_user_notification(jsonb)') is null then
    raise exception 'FAIL [fn] create_notif';
  end if;
  if to_regprocedure('public.mark_notification_read(uuid)') is null then
    raise exception 'FAIL [fn] mark_read';
  end if;
  if to_regprocedure('public.list_notifications(text,uuid,integer,integer)') is null then
    raise exception 'FAIL [fn] list_notif';
  end if;
  raise notice 'PASS [structure]';
end $$;

do $$
declare
  v_t uuid := current_setting('nf.tenant')::uuid;
  v_branch uuid; v_uid uuid; v_gid uuid; v_admin_uid uuid;
begin
  select id into v_branch from public.branches
   where tenant_id = v_t and deleted_at is null
   order by case when is_head_office then 0 else 1 end limit 1;

  select id into v_admin_uid from public.users
   where auth_user_id = '99999999-1111-4111-8111-000000000053'
     and tenant_id = v_t and deleted_at is null
   limit 1;
  perform set_config('nf.admin_uid', v_admin_uid::text, false);

  insert into public.tenant_users (tenant_id, user_id, role, status)
  values (v_t, '99999999-1111-4111-8111-00000000d053', 'MEMBER', 'ACTIVE')
  on conflict (tenant_id, user_id) do update set status = 'ACTIVE';

  insert into public.users (
    tenant_id, auth_user_id, username, user_type, full_name, email, home_branch_id, status)
  values (
    v_t, '99999999-1111-4111-8111-00000000d053', 'notifstaff', 'STAFF',
    'Notif Staff', 'notifstaff@a.test', v_branch, 'ACTIVE')
  on conflict (auth_user_id) do update set deleted_at = null
  returning id into v_uid;
  perform set_config('nf.staff_uid', v_uid::text, false);

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
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000053';

do $$
declare
  v_email jsonb; v_get jsonb; v_id uuid; v_rv int;
  v_tpl jsonb; v_prefs jsonb; v_notif jsonb; v_list jsonb;
  v_admin uuid := current_setting('nf.admin_uid')::uuid;
  v_raw text;
begin
  -- Create SMTP config with password
  v_email := public.save_email_configuration(jsonb_build_object(
    'smtp_host', 'smtp.example.com',
    'smtp_port', '587',
    'username', 'mailer',
    'password', 'secret-pass-1',
    'sender_name', 'Courier ERP',
    'sender_email', 'noreply@example.com',
    'use_ssl', 'true',
    'is_default', 'true',
    'status', 'ACTIVE'));
  if v_email->>'smtp_host' <> 'smtp.example.com' then raise exception 'FAIL [email save]'; end if;
  if (v_email->>'has_password')::boolean is not true then raise exception 'FAIL [password set]'; end if;
  if v_email ? 'password' or v_email ? 'password_enc' then
    raise exception 'FAIL [password leaked]';
  end if;
  v_id := (v_email->>'id')::uuid;
  v_rv := (v_email->>'row_version')::int;

  -- One active uniqueness: second ACTIVE default should deactivate first
  v_email := public.save_email_configuration(jsonb_build_object(
    'smtp_host', 'smtp2.example.com',
    'smtp_port', '465',
    'sender_email', 'alt@example.com',
    'password', 'other',
    'is_default', 'true',
    'status', 'ACTIVE'));
  if (select count(*) from public.email_configurations
       where tenant_id = current_setting('nf.tenant')::uuid
         and deleted_at is null and status = 'ACTIVE' and is_default) <> 1 then
    raise exception 'FAIL [one active]';
  end if;

  -- Get never returns password; write-only update keeps password when omitted
  v_get := public.get_email_configuration((v_email->>'id')::uuid);
  if v_get ? 'password' or v_get ? 'password_enc' then
    raise exception 'FAIL [get password]';
  end if;
  if (v_get->>'has_password')::boolean is not true then raise exception 'FAIL [has_password]'; end if;

  -- Update without password — ciphertext unchanged
  select encode(password_enc, 'hex') into v_raw
    from public.email_configurations where id = (v_email->>'id')::uuid;
  v_email := public.save_email_configuration(
    jsonb_build_object(
      'smtp_host', 'smtp2.example.com',
      'smtp_port', '465',
      'sender_email', 'alt@example.com',
      'status', 'ACTIVE',
      'is_default', 'true'),
    (v_email->>'id')::uuid,
    (v_email->>'row_version')::int);
  if encode((select password_enc from public.email_configurations
              where id = (v_email->>'id')::uuid), 'hex') <> v_raw then
    raise exception 'FAIL [write-only password]';
  end if;

  -- Optimistic lock
  begin
    perform public.save_email_configuration(
      jsonb_build_object('smtp_host','x','sender_email','x@y.com','status','ACTIVE'),
      (v_email->>'id')::uuid, 1);
    raise exception 'FAIL [opt lock]';
  exception when sqlstate 'CMS04' then null;
  end;

  -- Templates
  v_tpl := public.save_notification_template(jsonb_build_object(
    'code', 'BOOKING_EMAIL',
    'name', 'Booking Email',
    'notification_type', 'BOOKING',
    'channel', 'EMAIL',
    'subject', 'Your booking',
    'body', 'Hello {{name}}',
    'status', 'ACTIVE'));
  if v_tpl->>'code' <> 'BOOKING_EMAIL' then raise exception 'FAIL [template]'; end if;

  -- Preferences
  v_prefs := public.save_notification_preferences(jsonb_build_array(
    jsonb_build_object(
      'notification_type', 'BOOKING',
      'email_enabled', true,
      'sms_enabled', false,
      'whatsapp_enabled', true),
    jsonb_build_object(
      'notification_type', 'OTP',
      'email_enabled', false,
      'sms_enabled', true,
      'whatsapp_enabled', false)));
  if jsonb_array_length(v_prefs->'rows') <> 2 then raise exception 'FAIL [prefs]'; end if;

  -- User notification lifecycle
  v_notif := public.create_user_notification(jsonb_build_object(
    'user_id', v_admin,
    'title', 'Test alert',
    'message', 'Hello inbox',
    'notification_type', 'WEIGHT_ALERT'));
  if v_notif->>'status' <> 'UNREAD' then raise exception 'FAIL [unread]'; end if;

  v_notif := public.mark_notification_read((v_notif->>'id')::uuid);
  if v_notif->>'status' <> 'READ' then raise exception 'FAIL [read]'; end if;
  if v_notif->>'read_at' is null then raise exception 'FAIL [read_at]'; end if;

  v_list := public.list_notifications('READ', null, 1, 20);
  if (v_list->>'total')::int < 1 then raise exception 'FAIL [list]'; end if;

  if not exists (
    select 1 from public.audit_logs
     where entity_type = 'email_configurations' and module_slug = 'utl.notification'
  ) then raise exception 'FAIL [audit email]'; end if;

  if not exists (
    select 1 from public.audit_logs
     where entity_type = 'user_notifications' and module_slug = 'utl.notification'
  ) then raise exception 'FAIL [audit notif]'; end if;

  raise notice 'PASS [crud / smtp uniqueness / password / prefs / inbox / audit]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000d053';
do $$
begin
  begin
    perform public.save_email_configuration(jsonb_build_object(
      'smtp_host', 'x', 'sender_email', 'a@b.com'));
    raise exception 'FAIL [perm]';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'PASS [permissions]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000b053';
do $$
declare v_list jsonb;
begin
  v_list := public.list_email_configurations();
  if jsonb_array_length(v_list->'rows') <> 0 then raise exception 'FAIL [tenant email]'; end if;
  v_list := public.list_notifications(null, null, 1, 50);
  if (v_list->>'total')::int <> 0 then raise exception 'FAIL [tenant notif]'; end if;
  raise notice 'PASS [tenant isolation]';
end $$;

reset role;
do $$
begin
  raise notice '==========================================================';
  raise notice 'NOTIFICATIONS / EMAIL CONFIGURATION VERIFICATION PASSED.';
  raise notice '==========================================================';
end $$;

rollback;
