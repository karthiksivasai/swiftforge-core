-- ===========================================================================
-- 0058  notification delivery — Phase 7 Milestone 7D
-- ---------------------------------------------------------------------------
-- Synchronous Email / SMS / WhatsApp delivery on top of Phase 6E config.
-- Sandbox/stub providers only. NO queues, workers, cron, retries, push.
-- Reuses: email_configurations, notification_templates, notification_preferences,
--         SMTP crypto, utl.notification permissions, audit.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- notification_deliveries — append-only delivery log
-- ---------------------------------------------------------------------------
create table if not exists public.notification_deliveries (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  channel             text not null check (channel in ('EMAIL','SMS','WHATSAPP')),
  recipient           text not null,
  notification_type   text,
  template_id         uuid,
  template_code       text,
  provider            text not null default 'SANDBOX',
  status              text not null default 'SUCCESS'
                        check (status in ('SUCCESS','FAILURE','SKIPPED')),
  payload             jsonb not null default '{}'::jsonb,
  response_body       text,
  latency_ms          integer,
  error_message       text,
  created_at          timestamptz not null default now(),
  created_by          uuid,
  constraint notification_deliveries_template_fk
    foreign key (tenant_id, template_id)
    references public.notification_templates (tenant_id, id) on delete set null
);

create index if not exists notification_deliveries_tenant_idx
  on public.notification_deliveries (tenant_id, created_at desc);
create index if not exists notification_deliveries_channel_idx
  on public.notification_deliveries (tenant_id, channel, created_at desc);

create or replace function app.tg_notification_deliveries_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'notification_deliveries is append-only' using errcode = '42501';
end
$$;

drop trigger if exists trg_notification_deliveries_no_upd on public.notification_deliveries;
create trigger trg_notification_deliveries_no_upd
  before update or delete on public.notification_deliveries
  for each row execute function app.tg_notification_deliveries_append_only();

alter table public.notification_deliveries enable row level security;
drop policy if exists notification_deliveries_select on public.notification_deliveries;
create policy notification_deliveries_select on public.notification_deliveries
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());
drop policy if exists notification_deliveries_insert on public.notification_deliveries;
create policy notification_deliveries_insert on public.notification_deliveries
  for insert with check (tenant_id in (select app.user_tenant_ids()));

-- ---------------------------------------------------------------------------
-- Template rendering — {{var}} substitution
-- ---------------------------------------------------------------------------
create or replace function app.render_notification_template(
  p_text text,
  p_vars jsonb
)
returns text
language plpgsql
immutable
as $$
declare
  v_out text := coalesce(p_text, '');
  v_key text;
  v_val text;
begin
  if p_vars is null or jsonb_typeof(p_vars) <> 'object' then
    return v_out;
  end if;
  for v_key, v_val in
    select key, coalesce(value #>> '{}', '')
      from jsonb_each(p_vars)
  loop
    v_out := replace(v_out, '{{' || v_key || '}}', v_val);
  end loop;
  return v_out;
end
$$;

create or replace function app.notification_channel_enabled(
  p_tenant uuid,
  p_type text,
  p_channel text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_pref public.notification_preferences;
begin
  select * into v_pref
    from public.notification_preferences
   where tenant_id = p_tenant
     and notification_type = p_type
     and deleted_at is null;
  if not found then
    -- Default: email on, sms/whatsapp off (matches 6E seed behaviour)
    return upper(p_channel) = 'EMAIL';
  end if;
  return case upper(p_channel)
    when 'EMAIL' then v_pref.email_enabled
    when 'SMS' then v_pref.sms_enabled
    when 'WHATSAPP' then v_pref.whatsapp_enabled
    else false
  end;
end
$$;

create or replace function app.log_notification_delivery(
  p_tenant uuid,
  p_channel text,
  p_recipient text,
  p_type text,
  p_template_id uuid,
  p_template_code text,
  p_provider text,
  p_status text,
  p_payload jsonb,
  p_response text,
  p_latency int,
  p_error text
)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_id uuid;
begin
  insert into public.notification_deliveries (
    tenant_id, channel, recipient, notification_type, template_id, template_code,
    provider, status, payload, response_body, latency_ms, error_message, created_by)
  values (
    p_tenant, upper(p_channel), p_recipient, p_type, p_template_id, p_template_code,
    coalesce(nullif(p_provider,''), 'SANDBOX'), upper(p_status),
    coalesce(p_payload, '{}'::jsonb), left(coalesce(p_response,''), 4000),
    p_latency, nullif(p_error,''), auth.uid())
  returning id into v_id;
  return v_id;
end
$$;

-- Sandbox email transport (no live SMTP sockets in 7D)
create or replace function app.sandbox_send_email(
  p_host text,
  p_from text,
  p_to text,
  p_subject text
)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'ok', true,
    'provider', 'SANDBOX',
    'transport', 'smtp-stub',
    'host', p_host,
    'from', p_from,
    'to', p_to,
    'subject', p_subject,
    'message', 'Email accepted by sandbox transport');
$$;

create or replace function app.sandbox_send_sms(p_to text, p_body text)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'ok', true,
    'provider', 'SANDBOX',
    'to', p_to,
    'chars', length(coalesce(p_body,'')),
    'message', 'SMS accepted by sandbox provider');
$$;

create or replace function app.sandbox_send_whatsapp(p_to text, p_body text)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'ok', true,
    'provider', 'SANDBOX',
    'to', p_to,
    'chars', length(coalesce(p_body,'')),
    'message', 'WhatsApp message accepted by sandbox provider');
$$;

-- Optional: confirm SMS/WhatsApp secrets exist in integration_credentials (never returned)
create or replace function app.messaging_provider_status(p_tenant uuid, p_channel text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_has boolean := false;
begin
  -- Prefer dedicated messaging-looking credentials if present; otherwise SANDBOX ready
  select exists (
    select 1
      from public.integration_credentials c
      join public.integration_providers p on p.id = c.provider_id
     where c.tenant_id = p_tenant
       and c.deleted_at is null
       and c.is_active
       and (
         upper(p.provider_code) like '%SMS%'
         or upper(p.provider_code) like '%WHATSAPP%'
         or upper(p.provider_code) in ('TWILIO','MSG91','GUPSHUP')
       )
  ) into v_has;

  return jsonb_build_object(
    'channel', upper(p_channel),
    'provider', case when v_has then 'CONFIGURED' else 'SANDBOX' end,
    'ready', true,
    'live', false,
    'message', case when v_has
      then 'Credentials present; 7D still uses sandbox transport'
      else 'Sandbox / stub provider active'
    end);
end
$$;

-- ===========================================================================
-- send_email
-- ===========================================================================
create or replace function public.send_email(p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_f jsonb := coalesce(p_fields, '{}'::jsonb);
  v_to text := nullif(btrim(coalesce(v_f->>'to','')),'');
  v_subject text := coalesce(v_f->>'subject', '');
  v_html text := coalesce(v_f->>'html_body', v_f->>'body', '');
  v_text text := coalesce(v_f->>'text_body', '');
  v_type text := nullif(btrim(coalesce(v_f->>'notification_type','')),'');
  v_template_code text := nullif(btrim(coalesce(v_f->>'template_code','')),'');
  v_vars jsonb := coalesce(v_f->'variables', '{}'::jsonb);
  v_attachments jsonb := coalesce(v_f->'attachments', '[]'::jsonb);
  v_skip_pref boolean := lower(coalesce(v_f->>'skip_preference_check','false'))
    in ('true','yes','1');
  v_cfg public.email_configurations;
  v_tmpl public.notification_templates;
  v_t0 timestamptz := clock_timestamp();
  v_result jsonb;
  v_latency int;
  v_delivery uuid;
  v_pwd_set boolean;
begin
  perform app.assert_notification_permission(v_tenant, 'modify');

  if v_to is null then
    raise exception 'Email recipient (to) is required' using errcode = 'CMS04';
  end if;

  if v_type is not null and not v_skip_pref
     and not app.notification_channel_enabled(v_tenant, v_type, 'EMAIL') then
    v_delivery := app.log_notification_delivery(
      v_tenant, 'EMAIL', v_to, v_type, null, v_template_code, 'SANDBOX',
      'SKIPPED', jsonb_build_object('reason', 'preference_disabled'),
      null, 1, 'Email disabled by notification preferences');
    return jsonb_build_object(
      'ok', false, 'status', 'SKIPPED', 'delivery_id', v_delivery,
      'channel', 'EMAIL', 'message', 'Email disabled by preferences');
  end if;

  select * into v_cfg from public.email_configurations
   where tenant_id = v_tenant and deleted_at is null and status = 'ACTIVE'
   order by case when is_default then 0 else 1 end, updated_at desc
   limit 1;
  if not found then
    raise exception 'No active email configuration' using errcode = 'CMS04';
  end if;
  v_pwd_set := v_cfg.password_enc is not null;
  -- Touch decrypt path to prove secret usable server-side only (result discarded)
  perform length(coalesce(app.decrypt_smtp_password(v_cfg.password_enc), ''));

  if v_template_code is not null or (v_type is not null and nullif(v_subject,'') is null) then
    select * into v_tmpl from public.notification_templates
     where tenant_id = v_tenant and deleted_at is null and status = 'ACTIVE'
       and channel = 'EMAIL'
       and (v_template_code is null or code = v_template_code)
       and (v_type is null or notification_type = v_type)
     order by case when v_template_code is not null and code = v_template_code then 0 else 1 end
     limit 1;
    if found then
      v_subject := coalesce(nullif(v_subject,''),
        app.render_notification_template(v_tmpl.subject, v_vars), '');
      v_html := case when nullif(v_html,'') is null
        then app.render_notification_template(v_tmpl.body, v_vars)
        else app.render_notification_template(v_html, v_vars) end;
      v_text := case when nullif(v_text,'') is null then v_html
        else app.render_notification_template(v_text, v_vars) end;
    end if;
  else
    v_subject := app.render_notification_template(v_subject, v_vars);
    v_html := app.render_notification_template(v_html, v_vars);
    v_text := app.render_notification_template(v_text, v_vars);
  end if;

  if nullif(v_subject,'') is null then
    v_subject := 'Notification';
  end if;

  v_result := app.sandbox_send_email(
    v_cfg.smtp_host, coalesce(v_cfg.sender_email, ''), v_to, v_subject);
  v_latency := greatest(1, (extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int);

  v_delivery := app.log_notification_delivery(
    v_tenant, 'EMAIL', v_to, v_type, v_tmpl.id, coalesce(v_tmpl.code, v_template_code),
    'SANDBOX', 'SUCCESS',
    jsonb_build_object(
      'subject', v_subject,
      'html_body', left(v_html, 8000),
      'text_body', left(v_text, 8000),
      'attachments', v_attachments,
      'smtp_host', v_cfg.smtp_host,
      'sender_email', v_cfg.sender_email,
      'has_smtp_password', v_pwd_set
    ),
    v_result::text, v_latency, null);

  perform app.write_audit_log(
    v_tenant, 'notification_deliveries', 'ADD', v_delivery, 'utl.notification',
    null, jsonb_build_object(
      'channel', 'EMAIL', 'to', v_to, 'status', 'SUCCESS',
      'template_code', coalesce(v_tmpl.code, v_template_code)));

  return jsonb_build_object(
    'ok', true,
    'status', 'SUCCESS',
    'delivery_id', v_delivery,
    'channel', 'EMAIL',
    'provider', 'SANDBOX',
    'latency_ms', v_latency,
    'subject', v_subject);
end
$$;

revoke all on function public.send_email(jsonb) from public;
grant execute on function public.send_email(jsonb) to authenticated, service_role;

create or replace function public.test_email_configuration(
  p_to text,
  p_email_configuration_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
begin
  return public.send_email(jsonb_build_object(
    'to', p_to,
    'subject', 'SwiftForge test email',
    'html_body', '<p>This is a sandbox test email from SwiftForge.</p>',
    'text_body', 'This is a sandbox test email from SwiftForge.',
    'skip_preference_check', true,
    'notification_type', null,
    'variables', jsonb_build_object('name', 'Tester'),
    'email_configuration_id', p_email_configuration_id
  ));
end
$$;

revoke all on function public.test_email_configuration(text, uuid) from public;
grant execute on function public.test_email_configuration(text, uuid)
  to authenticated, service_role;

-- ===========================================================================
-- send_sms (sandbox provider abstraction)
-- ===========================================================================
create or replace function public.send_sms(p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_f jsonb := coalesce(p_fields, '{}'::jsonb);
  v_to text := nullif(btrim(coalesce(v_f->>'to','')),'');
  v_body text := coalesce(v_f->>'body', '');
  v_purpose text := upper(btrim(coalesce(v_f->>'purpose', v_f->>'notification_type', 'OTP')));
  v_type text;
  v_vars jsonb := coalesce(v_f->'variables', '{}'::jsonb);
  v_template_code text := nullif(btrim(coalesce(v_f->>'template_code','')),'');
  v_skip_pref boolean := lower(coalesce(v_f->>'skip_preference_check','false'))
    in ('true','yes','1');
  v_tmpl public.notification_templates;
  v_t0 timestamptz := clock_timestamp();
  v_result jsonb;
  v_latency int;
  v_delivery uuid;
begin
  perform app.assert_notification_permission(v_tenant, 'modify');

  if v_to is null then
    raise exception 'SMS recipient (to) is required' using errcode = 'CMS04';
  end if;

  -- Map supported SMS purposes → notification_type
  v_type := case v_purpose
    when 'OTP' then 'OTP'
    when 'SHIPMENT_BOOKED' then 'BOOKING'
    when 'BOOKING' then 'BOOKING'
    when 'SHIPMENT_DELIVERED' then 'POD'
    when 'SHIPMENT_UNDELIVERED' then 'POD'
    when 'PICKUP_ASSIGNED' then 'PICKUP'
    when 'PICKUP' then 'PICKUP'
    when 'POD' then 'POD'
    else null
  end;
  if v_type is null then
    raise exception 'Unsupported SMS purpose. Use OTP, SHIPMENT_BOOKED, SHIPMENT_DELIVERED, SHIPMENT_UNDELIVERED, PICKUP_ASSIGNED'
      using errcode = 'CMS04';
  end if;

  if not v_skip_pref and not app.notification_channel_enabled(v_tenant, v_type, 'SMS') then
    v_delivery := app.log_notification_delivery(
      v_tenant, 'SMS', v_to, v_type, null, v_template_code, 'SANDBOX',
      'SKIPPED', jsonb_build_object('reason', 'preference_disabled', 'purpose', v_purpose),
      null, 1, 'SMS disabled by notification preferences');
    return jsonb_build_object(
      'ok', false, 'status', 'SKIPPED', 'delivery_id', v_delivery,
      'channel', 'SMS', 'message', 'SMS disabled by preferences');
  end if;

  select * into v_tmpl from public.notification_templates
   where tenant_id = v_tenant and deleted_at is null and status = 'ACTIVE'
     and channel = 'SMS'
     and (v_template_code is null or code = v_template_code)
     and notification_type = v_type
   order by case when v_template_code is not null and code = v_template_code then 0 else 1 end
   limit 1;
  if found then
    v_body := case when nullif(v_body,'') is null
      then app.render_notification_template(v_tmpl.body, v_vars)
      else app.render_notification_template(v_body, v_vars) end;
  else
    v_body := app.render_notification_template(v_body, v_vars);
  end if;
  if nullif(v_body,'') is null then
    v_body := format('SwiftForge %s notification', v_purpose);
  end if;

  v_result := app.sandbox_send_sms(v_to, v_body);
  v_latency := greatest(1, (extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int);

  v_delivery := app.log_notification_delivery(
    v_tenant, 'SMS', v_to, v_type, v_tmpl.id, coalesce(v_tmpl.code, v_template_code),
    'SANDBOX', 'SUCCESS',
    jsonb_build_object('purpose', v_purpose, 'body', left(v_body, 2000)),
    v_result::text, v_latency, null);

  perform app.write_audit_log(
    v_tenant, 'notification_deliveries', 'ADD', v_delivery, 'utl.notification',
    null, jsonb_build_object('channel', 'SMS', 'to', v_to, 'purpose', v_purpose));

  return jsonb_build_object(
    'ok', true, 'status', 'SUCCESS', 'delivery_id', v_delivery,
    'channel', 'SMS', 'provider', 'SANDBOX', 'latency_ms', v_latency,
    'purpose', v_purpose);
end
$$;

revoke all on function public.send_sms(jsonb) from public;
grant execute on function public.send_sms(jsonb) to authenticated, service_role;

-- ===========================================================================
-- send_whatsapp (sandbox provider abstraction)
-- ===========================================================================
create or replace function public.send_whatsapp(p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_f jsonb := coalesce(p_fields, '{}'::jsonb);
  v_to text := nullif(btrim(coalesce(v_f->>'to','')),'');
  v_body text := coalesce(v_f->>'body', '');
  v_purpose text := upper(btrim(coalesce(v_f->>'purpose', v_f->>'notification_type', 'OTP')));
  v_type text;
  v_vars jsonb := coalesce(v_f->'variables', '{}'::jsonb);
  v_template_code text := nullif(btrim(coalesce(v_f->>'template_code','')),'');
  v_skip_pref boolean := lower(coalesce(v_f->>'skip_preference_check','false'))
    in ('true','yes','1');
  v_tmpl public.notification_templates;
  v_t0 timestamptz := clock_timestamp();
  v_result jsonb;
  v_latency int;
  v_delivery uuid;
begin
  perform app.assert_notification_permission(v_tenant, 'modify');

  if v_to is null then
    raise exception 'WhatsApp recipient (to) is required' using errcode = 'CMS04';
  end if;

  v_type := case v_purpose
    when 'OTP' then 'OTP'
    when 'SHIPMENT_UPDATES' then 'BOOKING'
    when 'BOOKING' then 'BOOKING'
    when 'POD_NOTIFICATION' then 'POD'
    when 'POD' then 'POD'
    else null
  end;
  if v_type is null then
    raise exception 'Unsupported WhatsApp purpose. Use SHIPMENT_UPDATES, POD_NOTIFICATION, OTP'
      using errcode = 'CMS04';
  end if;

  if not v_skip_pref and not app.notification_channel_enabled(v_tenant, v_type, 'WHATSAPP') then
    v_delivery := app.log_notification_delivery(
      v_tenant, 'WHATSAPP', v_to, v_type, null, v_template_code, 'SANDBOX',
      'SKIPPED', jsonb_build_object('reason', 'preference_disabled', 'purpose', v_purpose),
      null, 1, 'WhatsApp disabled by notification preferences');
    return jsonb_build_object(
      'ok', false, 'status', 'SKIPPED', 'delivery_id', v_delivery,
      'channel', 'WHATSAPP', 'message', 'WhatsApp disabled by preferences');
  end if;

  select * into v_tmpl from public.notification_templates
   where tenant_id = v_tenant and deleted_at is null and status = 'ACTIVE'
     and channel = 'WHATSAPP'
     and (v_template_code is null or code = v_template_code)
     and notification_type = v_type
   order by case when v_template_code is not null and code = v_template_code then 0 else 1 end
   limit 1;
  if found then
    v_body := case when nullif(v_body,'') is null
      then app.render_notification_template(v_tmpl.body, v_vars)
      else app.render_notification_template(v_body, v_vars) end;
  else
    v_body := app.render_notification_template(v_body, v_vars);
  end if;
  if nullif(v_body,'') is null then
    v_body := format('SwiftForge %s notification', v_purpose);
  end if;

  v_result := app.sandbox_send_whatsapp(v_to, v_body);
  v_latency := greatest(1, (extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int);

  v_delivery := app.log_notification_delivery(
    v_tenant, 'WHATSAPP', v_to, v_type, v_tmpl.id, coalesce(v_tmpl.code, v_template_code),
    'SANDBOX', 'SUCCESS',
    jsonb_build_object('purpose', v_purpose, 'body', left(v_body, 2000)),
    v_result::text, v_latency, null);

  perform app.write_audit_log(
    v_tenant, 'notification_deliveries', 'ADD', v_delivery, 'utl.notification',
    null, jsonb_build_object('channel', 'WHATSAPP', 'to', v_to, 'purpose', v_purpose));

  return jsonb_build_object(
    'ok', true, 'status', 'SUCCESS', 'delivery_id', v_delivery,
    'channel', 'WHATSAPP', 'provider', 'SANDBOX', 'latency_ms', v_latency,
    'purpose', v_purpose);
end
$$;

revoke all on function public.send_whatsapp(jsonb) from public;
grant execute on function public.send_whatsapp(jsonb) to authenticated, service_role;

-- ===========================================================================
-- dispatch_notification — unified sync dispatcher
-- ===========================================================================
create or replace function public.dispatch_notification(p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_f jsonb := coalesce(p_fields, '{}'::jsonb);
  v_type text := upper(btrim(coalesce(v_f->>'notification_type','')));
  v_email_to text := nullif(btrim(coalesce(v_f->>'email_to', v_f->>'to','')),'');
  v_sms_to text := nullif(btrim(coalesce(v_f->>'sms_to', v_f->>'mobile','')),'');
  v_wa_to text := nullif(btrim(coalesce(v_f->>'whatsapp_to', v_f->>'mobile','')),'');
  v_channels text[];
  v_ch text;
  v_forced jsonb := v_f->'channels';
  v_results jsonb := '[]'::jsonb;
  v_one jsonb;
  v_vars jsonb := coalesce(v_f->'variables', '{}'::jsonb);
  v_skip boolean := lower(coalesce(v_f->>'skip_preference_check','false'))
    in ('true','yes','1');
begin
  perform app.assert_notification_permission(v_tenant, 'modify');

  if v_type is null or v_type = '' then
    raise exception 'notification_type is required' using errcode = 'CMS04';
  end if;

  if v_forced is not null and jsonb_typeof(v_forced) = 'array'
     and jsonb_array_length(v_forced) > 0 then
    select array_agg(upper(x)) into v_channels
      from jsonb_array_elements_text(v_forced) t(x);
  else
    v_channels := array[]::text[];
    if app.notification_channel_enabled(v_tenant, v_type, 'EMAIL') then
      v_channels := array_append(v_channels, 'EMAIL');
    end if;
    if app.notification_channel_enabled(v_tenant, v_type, 'SMS') then
      v_channels := array_append(v_channels, 'SMS');
    end if;
    if app.notification_channel_enabled(v_tenant, v_type, 'WHATSAPP') then
      v_channels := array_append(v_channels, 'WHATSAPP');
    end if;
  end if;

  if cardinality(v_channels) is null or cardinality(v_channels) < 1 then
    return jsonb_build_object(
      'ok', false, 'status', 'SKIPPED', 'results', '[]'::jsonb,
      'message', 'No channels enabled for notification type');
  end if;

  foreach v_ch in array v_channels
  loop
    if v_ch = 'EMAIL' then
      if v_email_to is null then
        v_one := jsonb_build_object('channel','EMAIL','ok',false,'status','FAILURE',
          'message','email_to required');
      else
        v_one := public.send_email(jsonb_build_object(
          'to', v_email_to,
          'notification_type', v_type,
          'template_code', v_f->>'email_template_code',
          'variables', v_vars,
          'attachments', coalesce(v_f->'attachments','[]'::jsonb),
          'skip_preference_check', v_skip or (v_forced is not null)
        ));
      end if;
    elsif v_ch = 'SMS' then
      if v_sms_to is null then
        v_one := jsonb_build_object('channel','SMS','ok',false,'status','FAILURE',
          'message','sms_to required');
      else
        v_one := public.send_sms(jsonb_build_object(
          'to', v_sms_to,
          'purpose', case v_type
            when 'OTP' then 'OTP'
            when 'BOOKING' then 'SHIPMENT_BOOKED'
            when 'POD' then 'SHIPMENT_DELIVERED'
            when 'PICKUP' then 'PICKUP_ASSIGNED'
            else v_type end,
          'template_code', v_f->>'sms_template_code',
          'variables', v_vars,
          'skip_preference_check', v_skip or (v_forced is not null)
        ));
      end if;
    elsif v_ch = 'WHATSAPP' then
      if v_wa_to is null then
        v_one := jsonb_build_object('channel','WHATSAPP','ok',false,'status','FAILURE',
          'message','whatsapp_to required');
      else
        v_one := public.send_whatsapp(jsonb_build_object(
          'to', v_wa_to,
          'purpose', case v_type
            when 'OTP' then 'OTP'
            when 'POD' then 'POD_NOTIFICATION'
            else 'SHIPMENT_UPDATES' end,
          'template_code', v_f->>'whatsapp_template_code',
          'variables', v_vars,
          'skip_preference_check', v_skip or (v_forced is not null)
        ));
      end if;
    else
      v_one := jsonb_build_object('channel', v_ch, 'ok', false, 'status', 'FAILURE',
        'message', 'unsupported channel');
    end if;
    v_results := v_results || jsonb_build_array(v_one);
  end loop;

  return jsonb_build_object(
    'ok', true,
    'notification_type', v_type,
    'channels', to_jsonb(v_channels),
    'results', v_results);
end
$$;

revoke all on function public.dispatch_notification(jsonb) from public;
grant execute on function public.dispatch_notification(jsonb)
  to authenticated, service_role;

create or replace function public.list_notification_deliveries(
  p_channel text default null,
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
  v_ch text := nullif(upper(btrim(coalesce(p_channel,''))),'');
  v_rows jsonb;
begin
  perform app.assert_notification_permission(v_tenant, 'list');

  select coalesce(jsonb_agg(x.obj order by x.created_at desc), '[]'::jsonb)
    into v_rows
  from (
    select d.created_at, jsonb_build_object(
      'id', d.id,
      'channel', d.channel,
      'recipient', d.recipient,
      'notification_type', d.notification_type,
      'template_code', d.template_code,
      'provider', d.provider,
      'status', d.status,
      'latency_ms', d.latency_ms,
      'error_message', d.error_message,
      'created_at', d.created_at,
      'payload', d.payload
    ) as obj
    from public.notification_deliveries d
   where d.tenant_id = v_tenant
     and (v_ch is null or d.channel = v_ch)
   order by d.created_at desc
   limit v_lim
  ) x;

  return jsonb_build_object('rows', v_rows);
end
$$;

revoke all on function public.list_notification_deliveries(text, integer) from public;
grant execute on function public.list_notification_deliveries(text, integer)
  to authenticated, service_role;

create or replace function public.get_notification_provider_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
begin
  perform app.assert_notification_permission(v_tenant, 'list');
  return jsonb_build_object(
    'email', jsonb_build_object(
      'provider', 'SANDBOX',
      'ready', exists (
        select 1 from public.email_configurations e
         where e.tenant_id = v_tenant and e.deleted_at is null and e.status = 'ACTIVE'),
      'live', false),
    'sms', app.messaging_provider_status(v_tenant, 'SMS'),
    'whatsapp', app.messaging_provider_status(v_tenant, 'WHATSAPP'));
end
$$;

revoke all on function public.get_notification_provider_status() from public;
grant execute on function public.get_notification_provider_status()
  to authenticated, service_role;

create or replace function public.preview_notification_template(
  p_template_id uuid default null,
  p_template_code text default null,
  p_variables jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_tmpl public.notification_templates;
begin
  perform app.assert_notification_permission(v_tenant, 'list');
  select * into v_tmpl from public.notification_templates
   where tenant_id = v_tenant and deleted_at is null
     and (p_template_id is null or id = p_template_id)
     and (p_template_code is null or code = btrim(p_template_code))
   order by updated_at desc
   limit 1;
  if not found then
    raise exception 'Template not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'id', v_tmpl.id,
    'code', v_tmpl.code,
    'channel', v_tmpl.channel,
    'notification_type', v_tmpl.notification_type,
    'subject', app.render_notification_template(v_tmpl.subject, coalesce(p_variables,'{}'::jsonb)),
    'body', app.render_notification_template(v_tmpl.body, coalesce(p_variables,'{}'::jsonb)));
end
$$;

revoke all on function public.preview_notification_template(uuid, text, jsonb) from public;
grant execute on function public.preview_notification_template(uuid, text, jsonb)
  to authenticated, service_role;

comment on table public.notification_deliveries is
  'Append-only notification delivery log (Milestone 7D). No retries.';
comment on function public.dispatch_notification(jsonb) is
  'Synchronous multi-channel notification dispatch using preferences + templates.';
