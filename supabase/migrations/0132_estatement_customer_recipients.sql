-- 0132  eStatement mail goes to each opted-in customer.
-- From Email remains the sender. A blank customer eStatement flag stays opted in,
-- matching the customer screen default. An explicit false skips that customer.

create or replace function app.dispatch_due_estatement_emails(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_cfg public.email_configurations;
  v_customer record;
  v_local timestamp;
  v_date text;
  v_time text;
  v_key text;
  v_columns jsonb;
  v_ship jsonb;
  v_vars jsonb;
  v_body text;
  v_sent integer := 0;
  v_result jsonb;
begin
  v_local := p_now at time zone 'Asia/Kolkata';
  for v_cfg in
    select * from public.email_configurations e
     where e.deleted_at is null
       and e.status = 'ACTIVE'
       and e.module_code = 'ESTATEMENT'
  loop
    v_date := btrim(coalesce(v_cfg.print_flags->>'statementDate', ''));
    v_time := btrim(coalesce(v_cfg.print_flags->>'sendingTime', ''));
    if v_date !~ '^\d{4}-\d{2}-\d{2}$' or v_time !~ '^\d{2}:\d{2}$' then
      continue;
    end if;
    if to_char(v_local, 'YYYY-MM-DD') <> v_date or to_char(v_local, 'HH24:MI') < v_time then
      continue;
    end if;
    v_key := v_date || ' ' || v_time;
    if nullif(btrim(coalesce(v_cfg.sender_email, '')), '') is null then
      continue;
    end if;

    insert into public.estatement_dispatch_log (tenant_id, schedule_key)
    values (v_cfg.tenant_id, v_key)
    on conflict (tenant_id, schedule_key) do nothing;
    if not found then
      continue;
    end if;

    select coalesce(s.value->'rows', '[]'::jsonb) into v_columns
      from public.tenant_settings s
     where s.tenant_id = v_cfg.tenant_id
       and s.scope = 'TENANT'
       and s.branch_id is null
       and s.key = 'estatement_columns';
    v_columns := coalesce(v_columns, '[]'::jsonb);

    for v_customer in
      select distinct on (lower(btrim(c.email)))
             c.id,
             btrim(c.email) as email,
             c.code,
             c.name
        from public.customers c
       where c.tenant_id = v_cfg.tenant_id
         and c.deleted_at is null
         and c.status = 'ACTIVE'
         and btrim(coalesce(c.email, '')) ~ '^[^[:space:]@]+@[^[:space:]@]+$'
         and lower(coalesce(c.wizard_extras #>> '{notification,eStatement}', 'true'))
             not in ('false', 'f', '0', 'no')
       order by lower(btrim(c.email)), c.code
    loop
      select jsonb_build_object(
        'AWBNo', s.awb_no,
        'Actl_Weight', s.actual_weight,
        'Chrg_Weight', s.charge_weight,
        'Vol_Weight', s.vol_weight,
        'Pcs', s.pieces,
        'Content', s.content,
        'BookTime', to_char(s.book_time, 'HH24:MI'),
        'Shipper_Name', s.shipper->>'name',
        'Consignee_Name', s.consignee->>'name',
        'Ref_No', s.reference_no,
        'Customer_Code', v_customer.code,
        'Customer_Name', v_customer.name
      ) into v_ship
        from public.shipments s
       where s.tenant_id = v_cfg.tenant_id
         and s.customer_id = v_customer.id
         and s.deleted_at is null
       order by s.book_date desc nulls last, s.created_at desc
       limit 1;

      v_vars := coalesce(v_ship, '{}'::jsonb) || jsonb_build_object(
        'Customer_Code', v_customer.code,
        'Customer_Name', v_customer.name
      );

      v_body := app.compose_estatement_output(
        v_columns, v_vars, v_cfg.print_flags->>'messageDear', v_cfg.body_template);
      if v_body is null then
        v_body := coalesce(nullif(btrim(coalesce(v_cfg.body_template, '')), ''), 'eStatement');
      end if;

      v_result := app.sandbox_send_email(
        v_cfg.smtp_host, v_cfg.sender_email, v_customer.email,
        coalesce(nullif(btrim(coalesce(v_cfg.subject_template, '')), ''), 'eStatement'));
      perform app.log_notification_delivery(
        v_cfg.tenant_id, 'EMAIL', v_customer.email, 'ESTATEMENT', null, 'ESTATEMENT',
        'SANDBOX', 'SUCCESS',
        jsonb_build_object(
          'subject', coalesce(v_cfg.subject_template, 'eStatement'),
          'text_body', left(v_body, 8000),
          'schedule_key', v_key,
          'from', v_cfg.sender_email),
        v_result::text, 1, null);
      v_sent := v_sent + 1;
    end loop;
  end loop;
  return v_sent;
end
$$;

comment on function app.dispatch_due_estatement_emails(timestamptz) is
  'Sends each due eStatement once to every opted-in customer email. From Email is the sender only.';

notify pgrst, 'reload schema';
