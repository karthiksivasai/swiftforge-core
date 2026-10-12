-- Queues more than 200 credit customers and lets the drain worker finish.
-- Asserts every eligible customer is evaluated, ineligible customers are
-- skipped, and a second pass sends no further alert emails.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000129', 'authenticated', 'authenticated', 'setup129@a.test')
on conflict (id) do nothing;

do $$
declare
  v_tenant uuid;
begin
  v_tenant := app.bootstrap_tenant('setup-129', 'Setup 129', 'S129');
  perform app.link_tenant_admin(
    v_tenant,
    '99999999-1111-4111-8111-000000000129',
    'setup129',
    'Setup Admin',
    'setup129@a.test');
  perform set_config('drain.tenant', v_tenant::text, false);
end $$;

do $$
declare
  v_tenant uuid := current_setting('drain.tenant')::uuid;
  v_n integer;
  v_mails integer;
  v_state integer;
begin
  insert into public.tenant_settings (tenant_id, scope, key, value)
  values (v_tenant, 'TENANT', 'credit_limit_email_pct', jsonb_build_object('percentage', 80));

  insert into public.email_configurations (
    tenant_id, smtp_host, smtp_port, username, password_enc, sender_email,
    use_ssl, is_default, status)
  values (
    v_tenant, 'smtp.example.com', 587, 'ops@example.com', '\x01'::bytea,
    'ops@example.com', false, true, 'ACTIVE');

  -- 450 eligible customers. The first 4 are over the 80% line and have an
  -- email address. Five more customers have no credit limit and must be skipped.
  insert into public.customers (
    tenant_id, code, name, mobile, credit_limit, closing_balance, email)
  select v_tenant,
         'CL' || g,
         'Credit ' || g,
         '9000000000',
         case when g <= 450 then 100 else null end,
         case when g <= 4 then 90 else 0 end,
         case when g <= 4 then 'c' || g || '@example.com' else null end
    from generate_series(1, 455) g;

  insert into public.credit_limit_reeval_queue (tenant_id, percentage, pending)
  values (v_tenant, 80, true);

  v_n := app.drain_credit_limit_reeval_queues(200, 20);
  if v_n <> 450 then
    raise exception 'FAIL drain evaluated % customers, expected 450', v_n;
  end if;
  if exists (
    select 1 from public.credit_limit_reeval_queue
     where tenant_id = v_tenant and pending
  ) then
    raise exception 'FAIL queue still pending after drain';
  end if;

  select count(*) into v_mails
    from public.notification_deliveries
   where tenant_id = v_tenant
     and notification_type = 'CREDIT_ALERT'
     and status = 'SUCCESS';
  if v_mails <> 4 then
    raise exception 'FAIL alert emails %, expected 4', v_mails;
  end if;

  select count(*) into v_state
    from public.credit_limit_alert_state
   where tenant_id = v_tenant and above_threshold;
  if v_state <> 4 then
    raise exception 'FAIL above-threshold state %, expected 4', v_state;
  end if;

  v_n := app.drain_credit_limit_reeval_queues(200, 20);
  if v_n <> 0 then
    raise exception 'FAIL second drain walked % customers', v_n;
  end if;
  select count(*) into v_mails
    from public.notification_deliveries
   where tenant_id = v_tenant
     and notification_type = 'CREDIT_ALERT'
     and status = 'SUCCESS';
  if v_mails <> 4 then
    raise exception 'FAIL second drain duplicated emails, count %', v_mails;
  end if;

  -- A fresh percentage save resets the cursor. Customers already alerted
  -- must not receive a second email.
  update public.credit_limit_reeval_queue
     set cursor_id = null, pending = true, updated_at = now()
   where tenant_id = v_tenant;
  v_n := app.drain_credit_limit_reeval_queues(200, 20);
  if v_n <> 450 then
    raise exception 'FAIL reset drain evaluated %', v_n;
  end if;
  select count(*) into v_mails
    from public.notification_deliveries
   where tenant_id = v_tenant
     and notification_type = 'CREDIT_ALERT'
     and status = 'SUCCESS';
  if v_mails <> 4 then
    raise exception 'FAIL reset drain duplicated emails, count %', v_mails;
  end if;

  raise notice 'PASS [drain 450 customers, 4 emails, no duplicates]';
end $$;

select 'PASS' as drain_verification;

rollback;
