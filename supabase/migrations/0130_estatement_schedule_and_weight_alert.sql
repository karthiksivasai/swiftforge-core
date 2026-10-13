-- ===========================================================================
-- 0130  eStatement schedule + column mapping, weight-alert print toggles
-- ---------------------------------------------------------------------------
-- ESTATEMENT stores Date and Sending Time on the email row. Once that office
-- clock (Asia/Kolkata) is reached, one statement email goes to From Email.
-- The column grid is saved on its own and decides the statement labels and
-- order. WEIGHT_ALERT print toggles are applied to the outgoing body.
-- ===========================================================================

create or replace function app.render_setup_event_email(
  p_tenant uuid,
  p_hint text,
  p_vars jsonb,
  p_fallback_body text
)
returns text
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_module text;
  v_flags jsonb;
  v_vars jsonb := coalesce(p_vars, '{}'::jsonb);
  v_body text;
  v_lines text[] := array[]::text[];
  v_spec jsonb := '{
    "BOOKING": [
      {"flag":"printShipper","label":"Shipper","keys":["Shipper_Name","shipper","shipper_name"]},
      {"flag":"printBookingTime","label":"Booking Time","keys":["BookTime","booking_time","book_time"]},
      {"flag":"printDoxSpx","label":"DOX/SPX","keys":["pieces_unit","dox_spx","shipment_type"]},
      {"flag":"printWeight","label":"Weight","keys":["Act_Weight","Chrg_Weight","weight","actual_weight","charge_weight"]},
      {"flag":"printProductName","label":"Product Name","keys":["Prod_Name","Prod_Code","product","product_name"]},
      {"flag":"printVolWeight","label":"Vol Weight","keys":["Vol_Weight","Vol_WeightM","vol_weight"]},
      {"flag":"printTotalAmount","label":"Total Amount","keys":["Grand_Total","Total","total","total_amount"]},
      {"flag":"printVendorAwbNo","label":"Vendor AWB No.","keys":["Agent_AWBno","Agent_AWBNo1","vendor_awb","forwarding_awb"]},
      {"flag":"printSender","label":"Sender","keys":["sender","Sender"]},
      {"flag":"printOrigin","label":"Origin","keys":["OrgCode","Origin_Name","origin"]},
      {"flag":"printCustomer","label":"Customer","keys":["Customer_Code","Customer_Name","customer"]},
      {"flag":"printContent","label":"Content","keys":["Content","content"]}
    ],
    "DELIVERY": [
      {"flag":"printRefNo","label":"Ref No.","keys":["Ref_No","reference_no","ref_no"]},
      {"flag":"printDoxSpx","label":"DOX/SPX","keys":["pieces_unit","dox_spx","shipment_type"]},
      {"flag":"printPcs","label":"Pcs","keys":["Pcs","pieces","pcs"]},
      {"flag":"printWeight","label":"Weight","keys":["Act_Weight","weight","actual_weight"]},
      {"flag":"printSender","label":"Sender","keys":["sender","Sender","Shipper_Name"]}
    ],
    "FORWARDING": [
      {"flag":"printDoxSpx","label":"DOX/SPX","keys":["pieces_unit","dox_spx","shipment_type"]},
      {"flag":"printPcs","label":"Pcs","keys":["Pcs","pieces","pcs"]},
      {"flag":"printWeight","label":"Weight","keys":["Act_Weight","weight","actual_weight"]},
      {"flag":"printVendorName","label":"Vendor Name","keys":["Vendor_Name","Vendor_Code","vendor","vendor_name"]}
    ],
    "WEIGHT_ALERT": [
      {"flag":"printSender","label":"Sender","keys":["sender","Sender","Shipper_Name"]},
      {"flag":"printOrigin","label":"Origin","keys":["OrgCode","Origin_Name","origin"]},
      {"flag":"printConsignee","label":"Consignee","keys":["Consignee_Name","consignee"]},
      {"flag":"printVendorAwbNo","label":"Vendor AWB No","keys":["Agent_AWBno","Agent_AWBNo1","vendor_awb"]},
      {"flag":"printVendorName","label":"Vendor Name","keys":["Vendor_Name","Vendor_Code","vendor"]},
      {"flag":"printPcs","label":"PCS","keys":["Pcs","pieces","pcs"]}
    ]
  }'::jsonb;
  v_item jsonb;
  v_key text;
  v_value text;
  v_label text;
  v_on boolean;
begin
  v_module := case upper(btrim(coalesce(p_hint, '')))
    when 'BOOKING' then 'BOOKING'
    when 'EMAIL ON BOOKING' then 'BOOKING'
    when 'DELIVERY' then 'DELIVERY'
    when 'POD' then 'DELIVERY'
    when 'EMAIL ON DELIVERY' then 'DELIVERY'
    when 'FORWARDING' then 'FORWARDING'
    when 'EMAIL ON FORWARDING' then 'FORWARDING'
    when 'WEIGHT_ALERT' then 'WEIGHT_ALERT'
    when 'ESTATEMENT WEIGHT ALERT' then 'WEIGHT_ALERT'
    else null
  end;
  if v_module is null then
    return null;
  end if;

  select e.print_flags, nullif(btrim(coalesce(e.body_template, '')), '')
    into v_flags, v_body
    from public.email_configurations e
   where e.tenant_id = p_tenant
     and e.deleted_at is null
     and e.module_code = v_module
     and e.status = 'ACTIVE'
   order by e.updated_at desc
   limit 1;
  if v_flags is null then
    return null;
  end if;

  if nullif(btrim(coalesce(v_flags->>'messageDear', '')), '') is not null then
    v_lines := v_lines || array[btrim(v_flags->>'messageDear'), '']::text[];
  end if;
  v_body := coalesce(v_body, nullif(btrim(coalesce(p_fallback_body, '')), ''));
  if v_body is not null then
    v_lines := v_lines || array[v_body, '']::text[];
  end if;

  for v_item in select value from jsonb_array_elements(v_spec -> v_module)
  loop
    v_on := lower(coalesce(v_flags->>(v_item->>'flag'), 'false')) in ('true', 't', '1', 'yes');
    if not v_on then
      continue;
    end if;
    v_value := null;
    for v_key in select jsonb_array_elements_text(v_item->'keys')
    loop
      if nullif(btrim(coalesce(v_vars->>v_key, '')), '') is not null then
        v_value := btrim(v_vars->>v_key);
        exit;
      end if;
    end loop;
    if v_value is null then
      continue;
    end if;
    v_label := v_item->>'label';
    if v_module = 'BOOKING'
       and v_item->>'flag' = 'printWeight'
       and nullif(btrim(coalesce(v_flags->>'weightHeading', '')), '') is not null then
      v_label := btrim(v_flags->>'weightHeading');
    end if;
    v_lines := v_lines || (v_label || ': ' || v_value);
  end loop;

  return nullif(btrim(array_to_string(v_lines, E'\n')), '');
end
$$;

revoke all on function app.render_setup_event_email(uuid, text, jsonb, text) from public;

create or replace function app.compose_estatement_output(
  p_columns jsonb,
  p_vars jsonb,
  p_dear text,
  p_body text
)
returns text
language sql
stable
as $$
  with ranked as (
    select
      c.ordinality::int as pos,
      case
        when btrim(coalesce(c.value->>'orderNo', '')) ~ '^\d+$'
          then btrim(c.value->>'orderNo')::int
        else 2147483647
      end as ord,
      btrim(coalesce(c.value->>'code', '')) as code,
      btrim(coalesce(p_vars->>(c.value->>'column'), '')) as val
    from jsonb_array_elements(coalesce(p_columns, '[]'::jsonb)) with ordinality as c(value, ordinality)
  ),
  lines as (
    select format('%s: %s', code, val) as line, ord, pos
      from ranked
     where code <> '' and val <> ''
  )
  select nullif(btrim(concat_ws(
    E'\n',
    nullif(btrim(coalesce(p_dear, '')), ''),
    case when nullif(btrim(coalesce(p_dear, '')), '') is null then null else '' end,
    nullif(btrim(coalesce(p_body, '')), ''),
    case when nullif(btrim(coalesce(p_body, '')), '') is null then null else '' end,
    (select string_agg(line, E'\n' order by ord, pos) from lines)
  )), '');
$$;

revoke all on function app.compose_estatement_output(jsonb, jsonb, text, text) from public;

create table if not exists public.estatement_dispatch_log (
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  schedule_key text not null,
  sent_at      timestamptz not null default now(),
  primary key (tenant_id, schedule_key)
);

alter table public.estatement_dispatch_log enable row level security;
drop policy if exists estatement_dispatch_log_select on public.estatement_dispatch_log;
create policy estatement_dispatch_log_select on public.estatement_dispatch_log
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());

create or replace function app.dispatch_due_estatement_emails(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_cfg public.email_configurations;
  v_local timestamp;
  v_date text;
  v_time text;
  v_key text;
  v_columns jsonb;
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
    if exists (
      select 1 from public.estatement_dispatch_log
       where tenant_id = v_cfg.tenant_id and schedule_key = v_key
    ) then
      continue;
    end if;
    if nullif(btrim(coalesce(v_cfg.sender_email, '')), '') is null then
      continue;
    end if;

    select coalesce(s.value->'rows', '[]'::jsonb) into v_columns
      from public.tenant_settings s
     where s.tenant_id = v_cfg.tenant_id
       and s.scope = 'TENANT'
       and s.branch_id is null
       and s.key = 'estatement_columns';
    v_columns := coalesce(v_columns, '[]'::jsonb);

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
      'Ref_No', s.reference_no
    ) into v_vars
      from public.shipments s
     where s.tenant_id = v_cfg.tenant_id and s.deleted_at is null
     order by s.book_date desc nulls last, s.created_at desc
     limit 1;
    v_vars := coalesce(v_vars, '{}'::jsonb);

    v_body := app.compose_estatement_output(
      v_columns, v_vars, v_cfg.print_flags->>'messageDear', v_cfg.body_template);
    if v_body is null then
      v_body := coalesce(nullif(btrim(coalesce(v_cfg.body_template, '')), ''), 'eStatement');
    end if;

    v_result := app.sandbox_send_email(
      v_cfg.smtp_host, v_cfg.sender_email, v_cfg.sender_email,
      coalesce(nullif(btrim(coalesce(v_cfg.subject_template, '')), ''), 'eStatement'));
    perform app.log_notification_delivery(
      v_cfg.tenant_id, 'EMAIL', v_cfg.sender_email, 'ESTATEMENT', null, 'ESTATEMENT',
      'SANDBOX', 'SUCCESS',
      jsonb_build_object(
        'subject', coalesce(v_cfg.subject_template, 'eStatement'),
        'text_body', left(v_body, 8000),
        'schedule_key', v_key),
      v_result::text, 1, null);
    insert into public.estatement_dispatch_log (tenant_id, schedule_key)
    values (v_cfg.tenant_id, v_key)
    on conflict (tenant_id, schedule_key) do nothing;
    v_sent := v_sent + 1;
  end loop;
  return v_sent;
end
$$;

revoke all on function app.dispatch_due_estatement_emails(timestamptz) from public;
grant execute on function app.dispatch_due_estatement_emails(timestamptz) to service_role;

comment on function app.dispatch_due_estatement_emails(timestamptz) is
  'Sends each due eStatement once, to From Email, using the saved column Code and Order No.';

create or replace function public.get_estatement_columns()
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_row public.tenant_settings;
begin
  perform app.assert_notification_permission(v_tenant, 'search');
  select * into v_row from public.tenant_settings
   where tenant_id = v_tenant and scope = 'TENANT' and branch_id is null
     and key = 'estatement_columns';
  return jsonb_build_object(
    'rows', coalesce(v_row.value->'rows', '[]'::jsonb),
    'row_version', v_row.row_version);
end
$$;

revoke all on function public.get_estatement_columns() from public;
grant execute on function public.get_estatement_columns() to authenticated, service_role;

create or replace function public.save_estatement_columns(
  p_rows jsonb,
  p_row_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_allowed text[] := array[
    'Actl_Weight','Agent_AWBno','Agent_AWBNo1','AWBNo','BookTime','Chrg_Weight',
    'Consignee_Add1','Consignee_Add2','Consignee_Add3','Consignee_Add4','Consignee_Name',
    'Consignee_Pin','Content','Cust_invoice_no','Customer_Code','Customer_Name','Delivery',
    'Delv_Date','Delv_Remark','Delv_Time','Destination_Code','Destination_Name','Eawbno',
    'Excp_Code','Excp_Name','ExpDelv_Date','FuelSurcharge','Grand_Total','Instruction',
    'KeyDate2','Manifest_Date','OrgCode','Origin_Name','Pcs','Prod_Code','Prod_Name',
    'Recver_Name','Ref_No','Serv_Name','Shipment_Value','Shipper_Name','TaxAmount','Total',
    'Vendor_Code','Vendor_Name','Vol_Weight','Vol_WeightM'
  ];
  v_row jsonb;
begin
  perform app.assert_notification_permission(v_tenant, 'modify');
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'eStatement columns are required' using errcode = 'CMS04';
  end if;
  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    if not (coalesce(v_row->>'column', '') = any (v_allowed)) then
      raise exception 'Unknown eStatement column' using errcode = 'CMS04';
    end if;
    if btrim(coalesce(v_row->>'orderNo', '')) <> ''
       and btrim(v_row->>'orderNo') !~ '^\d+$' then
      raise exception 'Order No must be a whole number' using errcode = 'CMS04';
    end if;
  end loop;
  perform app.upsert_tenant_setting(
    v_tenant, 'TENANT', null, 'estatement_columns',
    jsonb_build_object('rows', p_rows), p_row_version);
  return public.get_estatement_columns();
end
$$;

revoke all on function public.save_estatement_columns(jsonb, integer) from public;
grant execute on function public.save_estatement_columns(jsonb, integer)
  to authenticated, service_role;

do $$
begin
  begin
    create extension if not exists pg_cron with schema extensions;
  exception when others then
    begin
      create extension if not exists pg_cron;
    exception when others then
      raise warning 'pg_cron is not available: %', sqlerrm;
      return;
    end;
  end;

  if exists (
    select 1 from cron.job where jobname = 'estatement-scheduled-send'
  ) then
    perform cron.unschedule('estatement-scheduled-send');
  end if;

  perform cron.schedule(
    'estatement-scheduled-send',
    '* * * * *',
    'select app.dispatch_due_estatement_emails()');
end
$$;
