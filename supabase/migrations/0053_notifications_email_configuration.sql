-- ===========================================================================
-- 0053  notifications & email configuration — Phase 6 Milestone 6E
-- ---------------------------------------------------------------------------
-- Configuration layer only: SMTP, templates, preferences, user inbox.
-- NO send email/SMS/WhatsApp. NO workers/cron/queues/push.
-- Permission: utl.notification (also utl.xpresion-setup for Setup email UI)
-- Password: encrypted at rest, never returned to clients (write-only updates).
-- ===========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Crypto helpers (dev default key; override via SET app.smtp_crypto_key)
-- ---------------------------------------------------------------------------
create or replace function app.smtp_crypto_key()
returns text
language sql
stable
security definer
set search_path = public, app
as $$
  select coalesce(
    nullif(current_setting('app.smtp_crypto_key', true), ''),
    'swiftforge-dev-smtp-key-change-in-prod');
$$;

create or replace function app.encrypt_smtp_password(p_plain text)
returns bytea
language plpgsql
stable
security definer
set search_path = public, extensions, app
as $$
begin
  if p_plain is null or btrim(p_plain) = '' then
    return null;
  end if;
  return pgp_sym_encrypt(p_plain, app.smtp_crypto_key());
end
$$;

-- Decrypt exists for future delivery workers only — never exposed via public RPCs.
create or replace function app.decrypt_smtp_password(p_cipher bytea)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions, app
as $$
begin
  if p_cipher is null then
    return null;
  end if;
  return pgp_sym_decrypt(p_cipher, app.smtp_crypto_key());
end
$$;

create or replace function app.assert_notification_permission(
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
  if app.user_has_permission(p_tenant, 'utl.notification', p_action)
     or app.user_has_permission(p_tenant, 'utl.xpresion-setup', p_action) then
    return;
  end if;
  if p_action in ('list','search')
     and (
       app.user_has_permission(p_tenant, 'utl.notification', 'add')
       or app.user_has_permission(p_tenant, 'utl.notification', 'modify')
       or app.user_has_permission(p_tenant, 'utl.notification', 'list')
       or app.user_has_permission(p_tenant, 'utl.notification', 'search')
       or app.user_has_permission(p_tenant, 'utl.xpresion-setup', 'add')
       or app.user_has_permission(p_tenant, 'utl.xpresion-setup', 'modify')
       or app.user_has_permission(p_tenant, 'utl.xpresion-setup', 'list')
       or app.user_has_permission(p_tenant, 'utl.xpresion-setup', 'search')
     ) then
    return;
  end if;
  raise exception 'Permission denied: utl.notification' using errcode = '42501';
end
$$;

-- Reuse app.current_tenant_id from 0052 if present; define if missing.
create or replace function app.current_tenant_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  return v_tenant;
end
$$;

-- ---------------------------------------------------------------------------
-- email_configurations — one ACTIVE row per tenant
-- ---------------------------------------------------------------------------
create table if not exists public.email_configurations (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  smtp_host         text not null,
  smtp_port         integer not null default 587
                      check (smtp_port > 0 and smtp_port <= 65535),
  username          text,
  password_enc      bytea,                 -- encrypted; never selected by public RPCs
  sender_name       text,
  sender_email      text not null,
  use_ssl           boolean not null default true,
  is_default        boolean not null default true,
  status            text not null default 'ACTIVE'
                      check (status in ('ACTIVE','INACTIVE')),
  module_code       text,                  -- optional: FORWARDING|PROGRESS|… (Setup UI)
  subject_template  text,
  body_template     text,
  print_flags       jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  created_by        uuid,
  updated_at        timestamptz not null default now(),
  updated_by        uuid,
  deleted_at        timestamptz,
  row_version       integer not null default 1,
  constraint email_configurations_tenant_id_uq unique (tenant_id, id)
);
create unique index if not exists email_configurations_one_active_uq
  on public.email_configurations (tenant_id)
  where deleted_at is null and status = 'ACTIVE' and is_default = true;
create index if not exists email_configurations_tenant_idx
  on public.email_configurations (tenant_id, created_at desc)
  where deleted_at is null;

drop trigger if exists trg_touch_email_configurations on public.email_configurations;
create trigger trg_touch_email_configurations before insert or update on public.email_configurations
  for each row execute function app.tg_touch_row();

alter table public.email_configurations enable row level security;
drop policy if exists email_configurations_select on public.email_configurations;
create policy email_configurations_select on public.email_configurations
  for select using (
    tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin()
  );

-- ---------------------------------------------------------------------------
-- notification_templates
-- ---------------------------------------------------------------------------
create table if not exists public.notification_templates (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  code                text not null,
  name                text not null,
  notification_type   text not null
                        check (notification_type in (
                          'PICKUP','BOOKING','MANIFEST','DRS','POD','INVOICE',
                          'OTP','CUSTOMER_PAYMENT','CREDIT_ALERT','WEIGHT_ALERT')),
  channel             text not null default 'EMAIL'
                        check (channel in ('EMAIL','SMS','WHATSAPP')),
  subject             text,
  body                text not null default '',
  status              text not null default 'ACTIVE'
                        check (status in ('ACTIVE','INACTIVE')),
  created_at          timestamptz not null default now(),
  created_by          uuid,
  updated_at          timestamptz not null default now(),
  updated_by          uuid,
  deleted_at          timestamptz,
  row_version         integer not null default 1,
  constraint notification_templates_tenant_id_uq unique (tenant_id, id)
);
create unique index if not exists notification_templates_tenant_code_uq
  on public.notification_templates (tenant_id, code)
  where deleted_at is null;
create index if not exists notification_templates_tenant_type_idx
  on public.notification_templates (tenant_id, notification_type)
  where deleted_at is null;

drop trigger if exists trg_touch_notification_templates on public.notification_templates;
create trigger trg_touch_notification_templates before insert or update on public.notification_templates
  for each row execute function app.tg_touch_row();

alter table public.notification_templates enable row level security;
drop policy if exists notification_templates_select on public.notification_templates;
create policy notification_templates_select on public.notification_templates
  for select using (
    tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin()
  );

-- ---------------------------------------------------------------------------
-- notification_preferences — per tenant × notification_type
-- ---------------------------------------------------------------------------
create table if not exists public.notification_preferences (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  notification_type   text not null
                        check (notification_type in (
                          'PICKUP','BOOKING','MANIFEST','DRS','POD','INVOICE',
                          'OTP','CUSTOMER_PAYMENT','CREDIT_ALERT','WEIGHT_ALERT')),
  email_enabled       boolean not null default true,
  sms_enabled         boolean not null default false,
  whatsapp_enabled    boolean not null default false,
  created_at          timestamptz not null default now(),
  created_by          uuid,
  updated_at          timestamptz not null default now(),
  updated_by          uuid,
  deleted_at          timestamptz,
  row_version         integer not null default 1,
  constraint notification_preferences_tenant_id_uq unique (tenant_id, id)
);
create unique index if not exists notification_preferences_tenant_type_uq
  on public.notification_preferences (tenant_id, notification_type)
  where deleted_at is null;

drop trigger if exists trg_touch_notification_preferences on public.notification_preferences;
create trigger trg_touch_notification_preferences before insert or update on public.notification_preferences
  for each row execute function app.tg_touch_row();

alter table public.notification_preferences enable row level security;
drop policy if exists notification_preferences_select on public.notification_preferences;
create policy notification_preferences_select on public.notification_preferences
  for select using (
    tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin()
  );

-- ---------------------------------------------------------------------------
-- user_notifications — per-user inbox (header bell); CRUD only
-- ---------------------------------------------------------------------------
create table if not exists public.user_notifications (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  user_id             uuid not null,  -- public.users.id
  notification_type   text
                        check (notification_type is null or notification_type in (
                          'PICKUP','BOOKING','MANIFEST','DRS','POD','INVOICE',
                          'OTP','CUSTOMER_PAYMENT','CREDIT_ALERT','WEIGHT_ALERT',
                          'GENERAL')),
  title               text not null,
  message             text not null default '',
  link                text,
  status              text not null default 'UNREAD'
                        check (status in ('UNREAD','READ')),
  read_at             timestamptz,
  created_at          timestamptz not null default now(),
  created_by          uuid,
  updated_at          timestamptz not null default now(),
  updated_by          uuid,
  deleted_at          timestamptz,
  row_version         integer not null default 1,
  constraint user_notifications_tenant_id_uq unique (tenant_id, id),
  constraint user_notifications_user_fk foreign key (user_id)
    references public.users (id) on delete cascade
);
create index if not exists user_notifications_user_status_idx
  on public.user_notifications (tenant_id, user_id, status, created_at desc)
  where deleted_at is null;

drop trigger if exists trg_touch_user_notifications on public.user_notifications;
create trigger trg_touch_user_notifications before insert or update on public.user_notifications
  for each row execute function app.tg_touch_row();

alter table public.user_notifications enable row level security;
drop policy if exists user_notifications_select on public.user_notifications;
create policy user_notifications_select on public.user_notifications
  for select using (
    tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin()
  );

-- ---------------------------------------------------------------------------
-- Email configuration RPCs (password never returned)
-- ---------------------------------------------------------------------------
create or replace function public.save_email_configuration(
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
  v_row public.email_configurations;
  v_host text; v_port int; v_user text; v_pass text;
  v_sender_name text; v_sender_email text;
  v_ssl boolean; v_status text; v_default boolean;
  v_module text; v_subject text; v_body text;
  v_flags jsonb;
  v_old public.email_configurations;
begin
  if p_id is null then
    perform app.assert_notification_permission(v_tenant, 'add');
  else
    perform app.assert_notification_permission(v_tenant, 'modify');
  end if;

  v_host := nullif(btrim(coalesce(v_f->>'smtp_host', v_f->>'smtp_server','')),'');
  begin
    v_port := coalesce(nullif(btrim(coalesce(v_f->>'smtp_port','')),'')::int, 587);
  exception when others then
    raise exception 'Invalid SMTP port' using errcode = 'CMS04';
  end;
  v_user := nullif(btrim(coalesce(v_f->>'username', v_f->>'mail_user_id','')),'');
  v_pass := v_f->>'password';
  if v_pass is null then
    v_pass := v_f->>'mail_password';
  end if;
  v_sender_name := nullif(btrim(coalesce(v_f->>'sender_name','')),'');
  v_sender_email := nullif(btrim(coalesce(v_f->>'sender_email', v_f->>'from_email','')),'');
  v_ssl := case lower(btrim(coalesce(v_f->>'use_ssl', v_f->>'ssl', 'true')))
    when 'false' then false when 'no' then false when '0' then false else true end;
  v_status := upper(coalesce(nullif(btrim(v_f->>'status'),''), 'ACTIVE'));
  if v_status not in ('ACTIVE','INACTIVE') then
    raise exception 'Invalid status' using errcode = 'CMS04';
  end if;
  v_default := case lower(btrim(coalesce(v_f->>'is_default','true')))
    when 'false' then false when 'no' then false when '0' then false else true end;
  v_module := nullif(btrim(coalesce(v_f->>'module_code','')),'');
  v_subject := nullif(btrim(coalesce(v_f->>'subject_template', v_f->>'message_subject','')),'');
  v_body := nullif(btrim(coalesce(v_f->>'body_template', v_f->>'message_body','')),'');
  v_flags := coalesce(v_f->'print_flags', '{}'::jsonb);

  if v_host is null then
    raise exception 'smtp_host is required' using errcode = 'CMS04';
  end if;
  if v_sender_email is null then
    raise exception 'sender_email is required' using errcode = 'CMS04';
  end if;

  -- Only one ACTIVE default per tenant
  if v_status = 'ACTIVE' and v_default then
    update public.email_configurations
       set status = 'INACTIVE',
           is_default = false,
           updated_at = now(),
           updated_by = auth.uid(),
           row_version = row_version + 1
     where tenant_id = v_tenant
       and deleted_at is null
       and status = 'ACTIVE'
       and is_default = true
       and (p_id is null or id <> p_id);
  end if;

  if p_id is null then
    insert into public.email_configurations (
      tenant_id, smtp_host, smtp_port, username, password_enc,
      sender_name, sender_email, use_ssl, is_default, status,
      module_code, subject_template, body_template, print_flags,
      created_by, updated_by)
    values (
      v_tenant, v_host, v_port, v_user,
      app.encrypt_smtp_password(v_pass),
      v_sender_name, v_sender_email, v_ssl, v_default, v_status,
      v_module, v_subject, v_body, v_flags,
      auth.uid(), auth.uid())
    returning * into v_row;

    perform app.write_audit_log(
      v_tenant, 'email_configurations', 'ADD', v_row.id, 'utl.notification',
      null, jsonb_build_object(
        'smtp_host', v_row.smtp_host, 'sender_email', v_row.sender_email,
        'status', v_row.status, 'password_set', v_row.password_enc is not null));
  else
    select * into v_old from public.email_configurations
     where id = p_id and tenant_id = v_tenant and deleted_at is null
     for update;
    if not found then
      raise exception 'Email configuration not found' using errcode = 'P0002';
    end if;
    if p_row_version is not null and v_old.row_version <> p_row_version then
      raise exception 'Optimistic lock conflict' using errcode = 'CMS04';
    end if;

    update public.email_configurations
       set smtp_host = v_host,
           smtp_port = v_port,
           username = v_user,
           password_enc = case
             when nullif(btrim(coalesce(v_pass,'')),'') is null then password_enc
             else app.encrypt_smtp_password(v_pass)
           end,
           sender_name = v_sender_name,
           sender_email = v_sender_email,
           use_ssl = v_ssl,
           is_default = v_default,
           status = v_status,
           module_code = coalesce(v_module, module_code),
           subject_template = coalesce(v_subject, subject_template),
           body_template = coalesce(v_body, body_template),
           print_flags = case when v_f ? 'print_flags' then v_flags else print_flags end,
           updated_by = auth.uid(),
           updated_at = now(),
           row_version = row_version + 1
     where id = p_id
     returning * into v_row;

    perform app.write_audit_log(
      v_tenant, 'email_configurations', 'MODIFY', v_row.id, 'utl.notification',
      null, jsonb_build_object(
        'smtp_host', v_row.smtp_host, 'sender_email', v_row.sender_email,
        'status', v_row.status, 'password_updated',
        nullif(btrim(coalesce(v_pass,'')),'') is not null));
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'smtp_host', v_row.smtp_host,
    'smtp_port', v_row.smtp_port,
    'username', v_row.username,
    'has_password', v_row.password_enc is not null,
    'sender_name', v_row.sender_name,
    'sender_email', v_row.sender_email,
    'use_ssl', v_row.use_ssl,
    'is_default', v_row.is_default,
    'status', v_row.status,
    'module_code', v_row.module_code,
    'subject_template', v_row.subject_template,
    'body_template', v_row.body_template,
    'print_flags', v_row.print_flags,
    'row_version', v_row.row_version,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at);
end
$$;

revoke all on function public.save_email_configuration(jsonb, uuid, integer) from public;
grant execute on function public.save_email_configuration(jsonb, uuid, integer)
  to authenticated, service_role;

create or replace function public.get_email_configuration(
  p_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_row public.email_configurations;
begin
  perform app.assert_notification_permission(v_tenant, 'list');

  if p_id is not null then
    select * into v_row from public.email_configurations
     where id = p_id and tenant_id = v_tenant and deleted_at is null;
  else
    select * into v_row from public.email_configurations
     where tenant_id = v_tenant and deleted_at is null
       and status = 'ACTIVE' and is_default = true
     order by updated_at desc
     limit 1;
    if not found then
      select * into v_row from public.email_configurations
       where tenant_id = v_tenant and deleted_at is null
       order by case when status = 'ACTIVE' then 0 else 1 end, updated_at desc
       limit 1;
    end if;
  end if;

  if not found then
    return null;
  end if;

  -- Password never returned
  return jsonb_build_object(
    'id', v_row.id,
    'smtp_host', v_row.smtp_host,
    'smtp_port', v_row.smtp_port,
    'username', v_row.username,
    'has_password', v_row.password_enc is not null,
    'sender_name', v_row.sender_name,
    'sender_email', v_row.sender_email,
    'use_ssl', v_row.use_ssl,
    'is_default', v_row.is_default,
    'status', v_row.status,
    'module_code', v_row.module_code,
    'subject_template', v_row.subject_template,
    'body_template', v_row.body_template,
    'print_flags', v_row.print_flags,
    'row_version', v_row.row_version,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at);
end
$$;

revoke all on function public.get_email_configuration(uuid) from public;
grant execute on function public.get_email_configuration(uuid)
  to authenticated, service_role;

create or replace function public.list_email_configurations()
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_rows jsonb;
begin
  perform app.assert_notification_permission(v_tenant, 'list');

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'smtp_host', e.smtp_host,
      'smtp_port', e.smtp_port,
      'username', e.username,
      'has_password', e.password_enc is not null,
      'sender_name', e.sender_name,
      'sender_email', e.sender_email,
      'use_ssl', e.use_ssl,
      'is_default', e.is_default,
      'status', e.status,
      'module_code', e.module_code,
      'row_version', e.row_version,
      'updated_at', e.updated_at
    ) order by e.is_default desc, e.updated_at desc
  ), '[]'::jsonb)
    into v_rows
    from public.email_configurations e
   where e.tenant_id = v_tenant and e.deleted_at is null;

  return jsonb_build_object('rows', v_rows);
end
$$;

revoke all on function public.list_email_configurations() from public;
grant execute on function public.list_email_configurations()
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Notification templates
-- ---------------------------------------------------------------------------
create or replace function public.save_notification_template(
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
  v_row public.notification_templates;
  v_code text; v_name text; v_type text; v_channel text;
  v_subject text; v_body text; v_status text;
begin
  if p_id is null then
    perform app.assert_notification_permission(v_tenant, 'add');
  else
    perform app.assert_notification_permission(v_tenant, 'modify');
  end if;

  v_code := upper(nullif(btrim(coalesce(v_f->>'code','')),''));
  v_name := nullif(btrim(coalesce(v_f->>'name','')),'');
  v_type := upper(nullif(btrim(coalesce(v_f->>'notification_type','')),''));
  v_channel := upper(coalesce(nullif(btrim(v_f->>'channel'),''), 'EMAIL'));
  v_subject := nullif(btrim(coalesce(v_f->>'subject','')),'');
  v_body := coalesce(v_f->>'body', '');
  v_status := upper(coalesce(nullif(btrim(v_f->>'status'),''), 'ACTIVE'));

  if v_code is null then raise exception 'code is required' using errcode = 'CMS04'; end if;
  if v_name is null then raise exception 'name is required' using errcode = 'CMS04'; end if;
  if v_type is null or v_type not in (
    'PICKUP','BOOKING','MANIFEST','DRS','POD','INVOICE',
    'OTP','CUSTOMER_PAYMENT','CREDIT_ALERT','WEIGHT_ALERT'
  ) then
    raise exception 'Invalid notification_type' using errcode = 'CMS04';
  end if;
  if v_channel not in ('EMAIL','SMS','WHATSAPP') then
    raise exception 'Invalid channel' using errcode = 'CMS04';
  end if;
  if v_status not in ('ACTIVE','INACTIVE') then
    raise exception 'Invalid status' using errcode = 'CMS04';
  end if;

  if p_id is null then
    insert into public.notification_templates (
      tenant_id, code, name, notification_type, channel, subject, body, status,
      created_by, updated_by)
    values (
      v_tenant, v_code, v_name, v_type, v_channel, v_subject, v_body, v_status,
      auth.uid(), auth.uid())
    returning * into v_row;

    perform app.write_audit_log(
      v_tenant, 'notification_templates', 'ADD', v_row.id, 'utl.notification',
      null, to_jsonb(v_row) - 'body' || jsonb_build_object('body_len', length(v_row.body)));
  else
    select * into v_row from public.notification_templates
     where id = p_id and tenant_id = v_tenant and deleted_at is null
     for update;
    if not found then
      raise exception 'Notification template not found' using errcode = 'P0002';
    end if;
    if p_row_version is not null and v_row.row_version <> p_row_version then
      raise exception 'Optimistic lock conflict' using errcode = 'CMS04';
    end if;

    update public.notification_templates
       set code = v_code,
           name = v_name,
           notification_type = v_type,
           channel = v_channel,
           subject = v_subject,
           body = v_body,
           status = v_status,
           updated_by = auth.uid(),
           updated_at = now(),
           row_version = row_version + 1
     where id = p_id
     returning * into v_row;

    perform app.write_audit_log(
      v_tenant, 'notification_templates', 'MODIFY', v_row.id, 'utl.notification',
      null, jsonb_build_object('code', v_row.code, 'status', v_row.status));
  end if;

  return to_jsonb(v_row);
end
$$;

revoke all on function public.save_notification_template(jsonb, uuid, integer) from public;
grant execute on function public.save_notification_template(jsonb, uuid, integer)
  to authenticated, service_role;

create or replace function public.list_notification_templates(
  p_channel text default null,
  p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_ch text := nullif(upper(btrim(coalesce(p_channel,''))),'');
  v_st text := nullif(upper(btrim(coalesce(p_status,''))),'');
  v_rows jsonb;
begin
  perform app.assert_notification_permission(v_tenant, 'list');

  select coalesce(jsonb_agg(to_jsonb(t) order by t.code), '[]'::jsonb)
    into v_rows
    from public.notification_templates t
   where t.tenant_id = v_tenant
     and t.deleted_at is null
     and (v_ch is null or t.channel = v_ch)
     and (v_st is null or t.status = v_st);

  return jsonb_build_object('rows', v_rows);
end
$$;

revoke all on function public.list_notification_templates(text, text) from public;
grant execute on function public.list_notification_templates(text, text)
  to authenticated, service_role;

create or replace function public.delete_notification_template(
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
  v_row public.notification_templates;
begin
  if not (
    app.is_platform_admin() or app.is_tenant_admin(v_tenant)
    or app.user_has_permission(v_tenant, 'utl.notification', 'delete')
    or app.user_has_permission(v_tenant, 'utl.notification', 'modify')
  ) then
    raise exception 'Permission denied: utl.notification' using errcode = '42501';
  end if;

  select * into v_row from public.notification_templates
   where id = p_id and tenant_id = v_tenant and deleted_at is null
   for update;
  if not found then
    raise exception 'Notification template not found' using errcode = 'P0002';
  end if;
  if p_row_version is not null and v_row.row_version <> p_row_version then
    raise exception 'Optimistic lock conflict' using errcode = 'CMS04';
  end if;

  update public.notification_templates
     set deleted_at = now(), updated_at = now(), updated_by = auth.uid(),
         row_version = row_version + 1
   where id = p_id
   returning * into v_row;

  perform app.write_audit_log(
    v_tenant, 'notification_templates', 'DELETE', v_row.id, 'utl.notification',
    jsonb_build_object('code', v_row.code), null);

  return jsonb_build_object('id', v_row.id, 'deleted', true);
end
$$;

revoke all on function public.delete_notification_template(uuid, integer) from public;
grant execute on function public.delete_notification_template(uuid, integer)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Notification preferences
-- ---------------------------------------------------------------------------
create or replace function public.save_notification_preferences(
  p_preferences jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_elem jsonb;
  v_type text;
  v_row public.notification_preferences;
  v_out jsonb := '[]'::jsonb;
  v_email boolean; v_sms boolean; v_wa boolean;
begin
  perform app.assert_notification_permission(v_tenant, 'modify');

  if p_preferences is null or jsonb_typeof(p_preferences) <> 'array' then
    raise exception 'p_preferences must be a JSON array' using errcode = 'CMS04';
  end if;

  for v_elem in select value from jsonb_array_elements(p_preferences)
  loop
    v_type := upper(nullif(btrim(coalesce(v_elem->>'notification_type','')),''));
    if v_type is null or v_type not in (
      'PICKUP','BOOKING','MANIFEST','DRS','POD','INVOICE',
      'OTP','CUSTOMER_PAYMENT','CREDIT_ALERT','WEIGHT_ALERT'
    ) then
      raise exception 'Invalid notification_type' using errcode = 'CMS04';
    end if;

    v_email := coalesce((v_elem->>'email_enabled')::boolean, true);
    v_sms := coalesce((v_elem->>'sms_enabled')::boolean, false);
    v_wa := coalesce((v_elem->>'whatsapp_enabled')::boolean, false);

    select * into v_row from public.notification_preferences
     where tenant_id = v_tenant and notification_type = v_type and deleted_at is null
     for update;

    if found then
      update public.notification_preferences
         set email_enabled = v_email,
             sms_enabled = v_sms,
             whatsapp_enabled = v_wa,
             updated_by = auth.uid(),
             updated_at = now(),
             row_version = row_version + 1
       where id = v_row.id
       returning * into v_row;
    else
      insert into public.notification_preferences (
        tenant_id, notification_type, email_enabled, sms_enabled, whatsapp_enabled,
        created_by, updated_by)
      values (v_tenant, v_type, v_email, v_sms, v_wa, auth.uid(), auth.uid())
      returning * into v_row;
    end if;

    v_out := v_out || jsonb_build_array(to_jsonb(v_row));
  end loop;

  perform app.write_audit_log(
    v_tenant, 'notification_preferences', 'MODIFY', null, 'utl.notification',
    null, jsonb_build_object('count', jsonb_array_length(v_out)));

  return jsonb_build_object('rows', v_out);
end
$$;

revoke all on function public.save_notification_preferences(jsonb) from public;
grant execute on function public.save_notification_preferences(jsonb)
  to authenticated, service_role;

create or replace function public.list_notification_preferences()
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_rows jsonb;
begin
  perform app.assert_notification_permission(v_tenant, 'list');

  select coalesce(jsonb_agg(to_jsonb(p) order by p.notification_type), '[]'::jsonb)
    into v_rows
    from public.notification_preferences p
   where p.tenant_id = v_tenant and p.deleted_at is null;

  return jsonb_build_object('rows', v_rows);
end
$$;

revoke all on function public.list_notification_preferences() from public;
grant execute on function public.list_notification_preferences()
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- User notifications (inbox)
-- ---------------------------------------------------------------------------
create or replace function public.create_user_notification(
  p_fields jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_f jsonb := coalesce(p_fields, '{}'::jsonb);
  v_row public.user_notifications;
  v_user uuid;
  v_title text;
  v_message text;
  v_type text;
  v_link text;
begin
  perform app.assert_notification_permission(v_tenant, 'add');

  begin
    v_user := nullif(btrim(coalesce(v_f->>'user_id','')),'')::uuid;
  exception when others then
    v_user := null;
  end;
  v_title := nullif(btrim(coalesce(v_f->>'title','')),'');
  v_message := coalesce(v_f->>'message', '');
  v_type := upper(nullif(btrim(coalesce(v_f->>'notification_type','')),''));
  v_link := nullif(btrim(coalesce(v_f->>'link','')),'');

  if v_user is null and nullif(btrim(coalesce(v_f->>'username','')),'') is not null then
    select u.id into v_user from public.users u
     where u.tenant_id = v_tenant and u.deleted_at is null
       and lower(u.username) = lower(btrim(v_f->>'username'))
     limit 1;
  end if;

  if v_user is null then
    raise exception 'user_id or username is required' using errcode = 'CMS04';
  end if;
  if v_title is null then
    raise exception 'title is required' using errcode = 'CMS04';
  end if;
  if not exists (
    select 1 from public.users u
     where u.id = v_user and u.tenant_id = v_tenant and u.deleted_at is null
  ) then
    raise exception 'User not found' using errcode = 'CMS04';
  end if;
  if v_type is not null and v_type not in (
    'PICKUP','BOOKING','MANIFEST','DRS','POD','INVOICE',
    'OTP','CUSTOMER_PAYMENT','CREDIT_ALERT','WEIGHT_ALERT','GENERAL'
  ) then
    raise exception 'Invalid notification_type' using errcode = 'CMS04';
  end if;

  insert into public.user_notifications (
    tenant_id, user_id, notification_type, title, message, link, status,
    created_by, updated_by)
  values (
    v_tenant, v_user, coalesce(v_type, 'GENERAL'), v_title, v_message, v_link, 'UNREAD',
    auth.uid(), auth.uid())
  returning * into v_row;

  perform app.write_audit_log(
    v_tenant, 'user_notifications', 'ADD', v_row.id, 'utl.notification',
    null, jsonb_build_object('user_id', v_row.user_id, 'title', v_row.title));

  return to_jsonb(v_row);
end
$$;

revoke all on function public.create_user_notification(jsonb) from public;
grant execute on function public.create_user_notification(jsonb)
  to authenticated, service_role;

create or replace function public.mark_notification_read(
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_row public.user_notifications;
  v_me uuid;
begin
  perform app.assert_notification_permission(v_tenant, 'modify');

  select id into v_me from public.users
   where auth_user_id = auth.uid() and tenant_id = v_tenant and deleted_at is null
   limit 1;

  select * into v_row from public.user_notifications
   where id = p_id and tenant_id = v_tenant and deleted_at is null
   for update;
  if not found then
    raise exception 'Notification not found' using errcode = 'P0002';
  end if;

  -- Users may mark their own; admins may mark any
  if not (
    app.is_platform_admin() or app.is_tenant_admin(v_tenant)
    or (v_me is not null and v_row.user_id = v_me)
  ) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;

  update public.user_notifications
     set status = 'READ',
         read_at = coalesce(read_at, now()),
         updated_at = now(),
         updated_by = auth.uid(),
         row_version = row_version + 1
   where id = p_id
   returning * into v_row;

  return to_jsonb(v_row);
end
$$;

revoke all on function public.mark_notification_read(uuid) from public;
grant execute on function public.mark_notification_read(uuid)
  to authenticated, service_role;

create or replace function public.list_notifications(
  p_status text default null,
  p_user_id uuid default null,
  p_page integer default 1,
  p_page_size integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_page integer := greatest(coalesce(p_page,1), 1);
  v_size integer := least(greatest(coalesce(p_page_size,50), 1), 200);
  v_offset integer;
  v_status text := nullif(upper(btrim(coalesce(p_status,''))),'');
  v_me uuid;
  v_filter_user uuid := p_user_id;
  v_total bigint;
  v_rows jsonb;
  v_is_admin boolean;
begin
  perform app.assert_notification_permission(v_tenant, 'list');

  select id into v_me from public.users
   where auth_user_id = auth.uid() and tenant_id = v_tenant and deleted_at is null
   limit 1;

  v_is_admin := app.is_platform_admin() or app.is_tenant_admin(v_tenant);

  -- Non-admins only see their own inbox
  if not v_is_admin then
    v_filter_user := v_me;
  end if;

  v_offset := (v_page - 1) * v_size;

  select count(*) into v_total
    from public.user_notifications n
   where n.tenant_id = v_tenant
     and n.deleted_at is null
     and (v_status is null or n.status = v_status)
     and (v_filter_user is null or n.user_id = v_filter_user);

  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
    into v_rows
    from (
      select n.*, u.username, u.full_name
        from public.user_notifications n
        left join public.users u on u.id = n.user_id and u.tenant_id = n.tenant_id
       where n.tenant_id = v_tenant
         and n.deleted_at is null
         and (v_status is null or n.status = v_status)
         and (v_filter_user is null or n.user_id = v_filter_user)
       order by n.created_at desc
       limit v_size offset v_offset
    ) t;

  return jsonb_build_object(
    'rows', v_rows, 'total', v_total, 'page', v_page, 'page_size', v_size);
end
$$;

revoke all on function public.list_notifications(text, uuid, integer, integer) from public;
grant execute on function public.list_notifications(text, uuid, integer, integer)
  to authenticated, service_role;

create or replace function public.delete_user_notification(
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
  v_row public.user_notifications;
begin
  if not (
    app.is_platform_admin() or app.is_tenant_admin(v_tenant)
    or app.user_has_permission(v_tenant, 'utl.notification', 'delete')
    or app.user_has_permission(v_tenant, 'utl.notification', 'modify')
  ) then
    raise exception 'Permission denied: utl.notification' using errcode = '42501';
  end if;

  select * into v_row from public.user_notifications
   where id = p_id and tenant_id = v_tenant and deleted_at is null
   for update;
  if not found then
    raise exception 'Notification not found' using errcode = 'P0002';
  end if;
  if p_row_version is not null and v_row.row_version <> p_row_version then
    raise exception 'Optimistic lock conflict' using errcode = 'CMS04';
  end if;

  update public.user_notifications
     set deleted_at = now(), updated_at = now(), updated_by = auth.uid(),
         row_version = row_version + 1
   where id = p_id
   returning * into v_row;

  perform app.write_audit_log(
    v_tenant, 'user_notifications', 'DELETE', v_row.id, 'utl.notification',
    jsonb_build_object('title', v_row.title), null);

  return jsonb_build_object('id', v_row.id, 'deleted', true);
end
$$;

revoke all on function public.delete_user_notification(uuid, integer) from public;
grant execute on function public.delete_user_notification(uuid, integer)
  to authenticated, service_role;

comment on table public.email_configurations is
  'Tenant SMTP configuration. Passwords encrypted; never returned by RPCs. Config only — no sending.';
comment on table public.notification_templates is
  'Notification message templates (EMAIL/SMS/WHATSAPP). Delivery deferred.';
comment on table public.notification_preferences is
  'Per-tenant channel enable flags by notification type. Config only.';
comment on table public.user_notifications is
  'Per-user inbox notifications. CRUD only — no push.';
