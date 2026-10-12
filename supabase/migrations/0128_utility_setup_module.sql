-- ===========================================================================
-- 0128  Utility Setup — miscellaneous blocks, module email config, form setup
-- ---------------------------------------------------------------------------
-- Screen: Utility → Tax/Charges Setup → Setup
-- Invoice last number is branch-scoped and seeds that branch's INVOICE counter.
-- Entry lock date blocks edit/delete of earlier transactions for every role.
-- Credit-limit percentage fires the credit-alert email when utilization crosses it.
-- Setup email passwords stay encrypted and are never returned.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Branch used by the Last No. block. Explicit branch must belong to the tenant.
-- ---------------------------------------------------------------------------
create or replace function app.resolve_setup_branch(
  p_tenant uuid,
  p_branch uuid,
  p_required boolean
)
returns uuid
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_branch uuid := p_branch;
begin
  if v_branch is null then
    select u.home_branch_id into v_branch
      from public.users u
     where u.tenant_id = p_tenant
       and u.auth_user_id = auth.uid()
       and u.deleted_at is null
     limit 1;
  end if;

  if v_branch is not null and not exists (
    select 1 from public.branches b
     where b.id = v_branch and b.tenant_id = p_tenant and b.deleted_at is null
  ) then
    raise exception 'Branch not found' using errcode = 'CMS04';
  end if;

  if p_required and v_branch is null then
    raise exception 'Invoice No. is saved for the current branch. Select a branch first.'
      using errcode = 'CMS04';
  end if;
  return v_branch;
end
$$;

revoke all on function app.resolve_setup_branch(uuid, uuid, boolean) from public;

create or replace function app.upsert_tenant_setting(
  p_tenant uuid,
  p_scope text,
  p_branch uuid,
  p_key text,
  p_value jsonb,
  p_row_version integer
)
returns public.tenant_settings
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_row public.tenant_settings;
begin
  if p_scope not in ('TENANT', 'BRANCH') then
    raise exception 'Invalid setup scope' using errcode = 'CMS04';
  end if;
  if p_scope = 'BRANCH' and p_branch is null then
    raise exception 'Branch is required' using errcode = 'CMS04';
  end if;
  if p_scope = 'TENANT' and p_branch is not null then
    raise exception 'Tenant settings cannot be branch-scoped' using errcode = 'CMS04';
  end if;

  select * into v_row
    from public.tenant_settings
   where tenant_id = p_tenant
     and scope = p_scope
     and key = p_key
     and branch_id is not distinct from p_branch
   for update;

  if found then
    if p_row_version is not null and v_row.row_version <> p_row_version then
      raise exception 'Optimistic lock conflict' using errcode = 'CMS04';
    end if;
    update public.tenant_settings
       set value = p_value,
           updated_by = auth.uid()
     where id = v_row.id
     returning * into v_row;
    return v_row;
  end if;

  insert into public.tenant_settings (
    tenant_id, scope, branch_id, key, value, created_by, updated_by)
  values (
    p_tenant, p_scope, p_branch, p_key, p_value, auth.uid(), auth.uid())
  returning * into v_row;
  return v_row;
end
$$;

revoke all on function app.upsert_tenant_setting(uuid, text, uuid, text, jsonb, integer) from public;

-- ---------------------------------------------------------------------------
-- Entry lock. No permission check and no role bypass.
-- ---------------------------------------------------------------------------
create or replace function app.entry_lock_date(p_tenant uuid)
returns date
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_raw text;
  v_date date;
begin
  select nullif(btrim(value->>'date'), '') into v_raw
    from public.tenant_settings
   where tenant_id = p_tenant
     and scope = 'TENANT'
     and branch_id is null
     and key = 'entry_lock_date'
   limit 1;
  if v_raw is null or v_raw !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;
  begin
    v_date := v_raw::date;
  exception when others then
    return null;
  end;
  if v_date::text <> v_raw then
    return null;
  end if;
  return v_date;
end
$$;

revoke all on function app.entry_lock_date(uuid) from public;

create or replace function app.enforce_entry_lock()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_lock date;
  v_old_date date;
  v_new_date date;
  v_col text;
begin
  -- INSERT is allowed, including a back-dated insert. Edit and delete are not.
  if tg_op = 'INSERT' then
    return new;
  end if;

  v_lock := app.entry_lock_date(old.tenant_id);
  if v_lock is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  -- Dynamic so a shipment update never touches a manifest column. A CASE on
  -- OLD.column evaluates every branch against the trigger row and fails.
  v_col := case tg_table_name
    when 'shipments' then 'book_date'
    when 'manifests' then 'manifest_date'
    when 'drs' then 'drs_date'
    when 'receipts' then 'receipt_date'
    when 'pickups' then 'pickup_date'
    when 'invoices' then 'invoice_date'
    when 'expense_entries' then 'entry_date'
    when 'debit_notes' then 'note_date'
    when 'credit_notes' then 'note_date'
    when 'customer_payments' then 'declared_date'
    else null
  end;

  if v_col is not null then
    execute format('select ($1).%I::date', v_col) into v_old_date using old;
    if tg_op = 'UPDATE' then
      execute format('select ($1).%I::date', v_col) into v_new_date using new;
    end if;
  end if;

  if (v_old_date is not null and v_old_date < v_lock)
     or (v_new_date is not null and v_new_date < v_lock) then
    raise exception
      'Entry dated before % cannot be edited or deleted', to_char(v_lock, 'DD/MM/YYYY')
      using errcode = 'CMS04';
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end
$$;

comment on function app.enforce_entry_lock() is
  'Blocks UPDATE and DELETE, including soft-delete, when the document date is strictly before tenant entry_lock_date. A NULL lock date is a no-op. INSERT of a back-dated row is allowed. No role is exempt.';

revoke all on function app.enforce_entry_lock() from public;

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('shipments', 'book_date'),
      ('manifests', 'manifest_date'),
      ('drs', 'drs_date'),
      ('receipts', 'receipt_date'),
      ('pickups', 'pickup_date'),
      ('invoices', 'invoice_date'),
      ('expense_entries', 'entry_date'),
      ('debit_notes', 'note_date'),
      ('credit_notes', 'note_date'),
      ('customer_payments', 'declared_date')
    ) as t(tbl, col)
  loop
    if to_regclass('public.' || r.tbl) is not null and exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = r.tbl and column_name = r.col
    ) then
      execute format('drop trigger if exists trg_entry_lock on public.%I', r.tbl);
      execute format(
        'create trigger trg_entry_lock before update or delete on public.%I
         for each row execute function app.enforce_entry_lock()',
        r.tbl);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Print toggles decide which merge fields survive into the outgoing email.
-- ---------------------------------------------------------------------------
create or replace function app.apply_email_print_flags(
  p_tenant uuid,
  p_hint text,
  p_vars jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_module text;
  v_flags jsonb;
  v_out jsonb := coalesce(p_vars, '{}'::jsonb);
  v_spec jsonb;
  v_flag text;
  v_keys jsonb;
  v_key text;
  v_on boolean;
  v_map jsonb := '{
    "BOOKING": {
      "printShipper": ["Shipper_Name","shipper","shipper_name"],
      "printBookingTime": ["BookTime","booking_time","book_time"],
      "printDoxSpx": ["pieces_unit","dox_spx","shipment_type"],
      "printWeight": ["Act_Weight","Chrg_Weight","weight","actual_weight","charge_weight"],
      "printProductName": ["Prod_Name","Prod_Code","product","product_name"],
      "printVolWeight": ["Vol_Weight","Vol_WeightM","vol_weight"],
      "printTotalAmount": ["Grand_Total","Total","total","total_amount"],
      "printVendorAwbNo": ["Agent_AWBno","Agent_AWBNo1","vendor_awb","forwarding_awb"],
      "printSender": ["sender","Sender"],
      "printOrigin": ["OrgCode","Origin_Name","origin"],
      "printCustomer": ["Customer_Code","Customer_Name","customer"],
      "printContent": ["Content","content"]
    },
    "DELIVERY": {
      "printRefNo": ["Ref_No","reference_no","ref_no"],
      "printDoxSpx": ["pieces_unit","dox_spx","shipment_type"],
      "printPcs": ["Pcs","pieces","pcs"],
      "printWeight": ["Act_Weight","weight","actual_weight"],
      "printSender": ["sender","Sender","Shipper_Name"]
    },
    "FORWARDING": {
      "printDoxSpx": ["pieces_unit","dox_spx","shipment_type"],
      "printPcs": ["Pcs","pieces","pcs"],
      "printWeight": ["Act_Weight","weight","actual_weight"],
      "printVendorName": ["Vendor_Name","Vendor_Code","vendor","vendor_name"]
    }
  }'::jsonb;
begin
  v_module := case upper(btrim(coalesce(p_hint, '')))
    when 'BOOKING' then 'BOOKING'
    when 'EMAIL ON BOOKING' then 'BOOKING'
    when 'DELIVERY' then 'DELIVERY'
    when 'POD' then 'DELIVERY'
    when 'EMAIL ON DELIVERY' then 'DELIVERY'
    when 'FORWARDING' then 'FORWARDING'
    when 'EMAIL ON FORWARDING' then 'FORWARDING'
    else null
  end;
  if v_module is null or jsonb_typeof(v_out) <> 'object' then
    return v_out;
  end if;

  select e.print_flags into v_flags
    from public.email_configurations e
   where e.tenant_id = p_tenant
     and e.deleted_at is null
     and e.module_code = v_module
     and e.status = 'ACTIVE'
   order by e.updated_at desc
   limit 1;
  if v_flags is null then
    return v_out;
  end if;

  v_spec := v_map -> v_module;
  for v_flag, v_keys in select key, value from jsonb_each(v_spec)
  loop
    v_on := lower(coalesce(v_flags->>v_flag, 'false')) in ('true', 't', '1', 'yes');
    if not v_on then
      for v_key in select jsonb_array_elements_text(v_keys)
      loop
        if v_out ? v_key then
          v_out := jsonb_set(v_out, array[v_key], '""'::jsonb, true);
        end if;
      end loop;
    end if;
  end loop;

  if v_module = 'BOOKING'
     and lower(coalesce(v_flags->>'printWeight', 'false')) in ('true', 't', '1', 'yes')
     and nullif(btrim(coalesce(v_flags->>'weightHeading', '')), '') is not null then
    v_out := jsonb_set(
      v_out, '{weight_heading}', to_jsonb(btrim(v_flags->>'weightHeading')), true);
  end if;

  return v_out;
end
$$;

revoke all on function app.apply_email_print_flags(uuid, text, jsonb) from public;

-- The outgoing body itself lists only the fields whose print toggle is on.
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

-- Re-bind send_email so booking/delivery/forwarding bodies honour print toggles.
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
  v_rendered text;
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
  perform length(coalesce(app.decrypt_smtp_password(v_cfg.password_enc), ''));

  v_vars := app.apply_email_print_flags(
    v_tenant,
    coalesce(v_f->>'module_code', v_type, v_template_code),
    v_vars);

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

  v_rendered := app.render_setup_event_email(
    v_tenant,
    coalesce(v_f->>'module_code', v_type, v_template_code),
    v_vars,
    v_text);
  if v_rendered is not null then
    v_text := v_rendered;
    v_html := replace(replace(replace(v_rendered, '&', '&amp;'), '<', '&lt;'), E'\n', '<br>');
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

-- ---------------------------------------------------------------------------
-- Credit-limit alert. Utilization = closing balance + unbilled amount.
-- ---------------------------------------------------------------------------
create table if not exists public.credit_limit_alert_state (
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  customer_id      uuid not null,
  above_threshold  boolean not null default false,
  last_sent_at     timestamptz,
  primary key (tenant_id, customer_id)
);

alter table public.credit_limit_alert_state enable row level security;
drop policy if exists credit_limit_alert_state_select on public.credit_limit_alert_state;
create policy credit_limit_alert_state_select on public.credit_limit_alert_state
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());

create or replace function app.evaluate_credit_limit_alert(
  p_tenant uuid,
  p_customer uuid
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_pct numeric;
  v_limit numeric;
  v_utilized numeric;
  v_email text;
  v_code text;
  v_name text;
  v_hit boolean := false;
  v_above boolean := false;
  v_cfg public.email_configurations;
  v_subject text;
  v_body text;
  v_result jsonb;
begin
  select nullif(btrim(value->>'percentage'), '')::numeric into v_pct
    from public.tenant_settings
   where tenant_id = p_tenant
     and scope = 'TENANT'
     and branch_id is null
     and key = 'credit_limit_email_pct'
   limit 1;
  if v_pct is null then
    return;
  end if;

  select c.credit_limit,
         coalesce(c.closing_balance, 0) + coalesce(c.unbilled_amount, 0),
         nullif(btrim(c.email), ''),
         c.code,
         c.name
    into v_limit, v_utilized, v_email, v_code, v_name
    from public.customers c
   where c.id = p_customer and c.tenant_id = p_tenant and c.deleted_at is null;
  if not found then
    return;
  end if;

  if v_pct = 0 then
    v_hit := coalesce(v_utilized, 0) > 0;
  elsif v_limit is not null and v_limit > 0 then
    v_hit := (coalesce(v_utilized, 0) * 100) >= (v_limit * v_pct);
  end if;

  select above_threshold into v_above
    from public.credit_limit_alert_state
   where tenant_id = p_tenant and customer_id = p_customer;

  if not v_hit then
    if v_above then
      update public.credit_limit_alert_state
         set above_threshold = false
       where tenant_id = p_tenant and customer_id = p_customer;
    end if;
    return;
  end if;

  if coalesce(v_above, false) then
    return;
  end if;

  v_subject := 'Credit limit alert';
  v_body := format(
    'Customer %s %s has reached %s%% of the credit limit. Utilized %s, limit %s.',
    coalesce(v_code, ''), coalesce(v_name, ''), trim(to_char(v_pct, 'FM999990.00')),
    trim(to_char(coalesce(v_utilized, 0), 'FM999999990.00')),
    trim(to_char(coalesce(v_limit, 0), 'FM999999990.00')));

  if v_email is null then
    insert into public.credit_limit_alert_state (tenant_id, customer_id, above_threshold, last_sent_at)
    values (p_tenant, p_customer, true, now())
    on conflict (tenant_id, customer_id) do update
      set above_threshold = true, last_sent_at = now();
    return;
  end if;

  if not app.notification_channel_enabled(p_tenant, 'CREDIT_ALERT', 'EMAIL') then
    perform app.log_notification_delivery(
      p_tenant, 'EMAIL', v_email, 'CREDIT_ALERT', null, null, 'SANDBOX',
      'SKIPPED', jsonb_build_object('reason', 'preference_disabled', 'customer_id', p_customer),
      null, 1, 'Credit alert email disabled by preferences');
  else
    select * into v_cfg from public.email_configurations
     where tenant_id = p_tenant and deleted_at is null and status = 'ACTIVE'
     order by case when is_default then 0 else 1 end, updated_at desc
     limit 1;
    if not found then
      perform app.log_notification_delivery(
        p_tenant, 'EMAIL', v_email, 'CREDIT_ALERT', null, null, 'SANDBOX',
        'FAILURE', jsonb_build_object('subject', v_subject, 'text_body', v_body),
        null, 1, 'No active email configuration');
      return;
    end if;
    v_result := app.sandbox_send_email(
      v_cfg.smtp_host, coalesce(v_cfg.sender_email, ''), v_email, v_subject);
    perform app.log_notification_delivery(
      p_tenant, 'EMAIL', v_email, 'CREDIT_ALERT', null, null, 'SANDBOX',
      'SUCCESS',
      jsonb_build_object(
        'subject', v_subject,
        'text_body', v_body,
        'customer_id', p_customer,
        'percentage', v_pct,
        'has_smtp_password', v_cfg.password_enc is not null),
      v_result::text, 1, null);
  end if;

  insert into public.credit_limit_alert_state (tenant_id, customer_id, above_threshold, last_sent_at)
  values (p_tenant, p_customer, true, now())
  on conflict (tenant_id, customer_id) do update
    set above_threshold = true, last_sent_at = now();
end
$$;

revoke all on function app.evaluate_credit_limit_alert(uuid, uuid) from public;

create or replace function app.tg_customer_credit_limit_alert()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
begin
  begin
    perform app.evaluate_credit_limit_alert(new.tenant_id, new.id);
  exception when others then
    raise warning 'credit limit alert failed for customer %: %', new.id, sqlerrm;
  end;
  return new;
end
$$;

revoke all on function app.tg_customer_credit_limit_alert() from public;

drop trigger if exists trg_customer_credit_limit_alert on public.customers;
create trigger trg_customer_credit_limit_alert
  after update of closing_balance, unbilled_amount, credit_limit
  on public.customers
  for each row execute function app.tg_customer_credit_limit_alert();

-- A percentage save re-evaluates one page of customers with a credit limit.
-- The cursor stays pending so a later call drains the rest. Customers with
-- no credit limit are skipped. Later balance changes still fire the row trigger.
create table if not exists public.credit_limit_reeval_queue (
  tenant_id   uuid primary key references public.tenants(id) on delete cascade,
  percentage  numeric not null,
  cursor_id   uuid,
  pending     boolean not null default true,
  updated_at  timestamptz not null default now()
);

alter table public.credit_limit_reeval_queue enable row level security;
drop policy if exists credit_limit_reeval_queue_select on public.credit_limit_reeval_queue;
create policy credit_limit_reeval_queue_select on public.credit_limit_reeval_queue
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());

create or replace function app.process_credit_limit_reeval_batch(
  p_tenant uuid,
  p_batch integer default 200
)
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_pending boolean;
  v_cursor uuid;
  v_customer uuid;
  v_last uuid;
  v_count integer := 0;
  v_batch integer := greatest(1, least(coalesce(p_batch, 200), 500));
begin
  select pending, cursor_id into v_pending, v_cursor
    from public.credit_limit_reeval_queue
   where tenant_id = p_tenant
   for update;
  if not found or not v_pending then
    return 0;
  end if;

  for v_customer in
    select c.id
      from public.customers c
     where c.tenant_id = p_tenant
       and c.deleted_at is null
       and c.credit_limit is not null
       and c.credit_limit > 0
       and (v_cursor is null or c.id > v_cursor)
     order by c.id
     limit v_batch
  loop
    begin
      perform app.evaluate_credit_limit_alert(p_tenant, v_customer);
    exception when others then
      raise warning 'credit limit alert failed for customer %: %', v_customer, sqlerrm;
    end;
    v_last := v_customer;
    v_count := v_count + 1;
  end loop;

  update public.credit_limit_reeval_queue
     set cursor_id = coalesce(v_last, cursor_id),
         pending = (v_count = v_batch),
         updated_at = now()
   where tenant_id = p_tenant;
  return v_count;
end
$$;

revoke all on function app.process_credit_limit_reeval_batch(uuid, integer) from public;
grant execute on function app.process_credit_limit_reeval_batch(uuid, integer)
  to service_role;

comment on function app.process_credit_limit_reeval_batch(uuid, integer) is
  'Evaluates at most p_batch customers with credit_limit > 0. Call again until it returns 0.';

-- ---------------------------------------------------------------------------
-- Setup email rows: hard validation, encrypted password, no plaintext out.
-- ---------------------------------------------------------------------------
with ranked as (
  select id, row_number() over (
    partition by tenant_id, module_code
    order by updated_at desc, id desc
  ) as rn
  from public.email_configurations
  where module_code is not null and deleted_at is null
)
update public.email_configurations e
   set deleted_at = now()
  from ranked r
 where e.id = r.id and r.rn > 1;

create unique index if not exists email_configurations_module_uq
  on public.email_configurations (tenant_id, module_code)
  where deleted_at is null and module_code is not null;

create or replace function app.validate_setup_email_row()
returns trigger
language plpgsql
as $$
declare
  v_dear text;
begin
  if new.module_code is null or new.module_code not in (
    'BOOKING','DELIVERY','FORWARDING','PROGRESS','ESTATEMENT','WEIGHT_ALERT'
  ) then
    return new;
  end if;

  if new.smtp_host is null
     or new.smtp_host !~* '^(localhost|([0-9]{1,3}\.){3}[0-9]{1,3}|([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+)$' then
    raise exception 'SMTP Server must be a valid hostname' using errcode = 'CMS04';
  end if;
  if new.smtp_port is null or new.smtp_port < 1 or new.smtp_port > 65535 then
    raise exception 'SMTP Port must be a whole number' using errcode = 'CMS04';
  end if;
  if new.use_ssl is null then
    raise exception 'SSL is required' using errcode = 'CMS04';
  end if;
  if new.sender_email is null
     or new.sender_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'From Email must be a valid email' using errcode = 'CMS04';
  end if;
  if nullif(btrim(coalesce(new.username, '')), '') is null then
    raise exception 'Mail User ID is required' using errcode = 'CMS04';
  end if;
  if new.password_enc is null then
    raise exception 'Mail Password is required' using errcode = 'CMS04';
  end if;
  v_dear := nullif(btrim(coalesce(new.print_flags->>'messageDear', '')), '');
  if v_dear is null then
    raise exception 'Message Dear is required' using errcode = 'CMS04';
  end if;
  if nullif(btrim(coalesce(new.subject_template, '')), '') is null then
    raise exception 'Message Subject is required' using errcode = 'CMS04';
  end if;
  if nullif(btrim(coalesce(new.body_template, '')), '') is null then
    raise exception 'Message Body is required' using errcode = 'CMS04';
  end if;
  return new;
end
$$;

drop trigger if exists trg_validate_setup_email on public.email_configurations;
create trigger trg_validate_setup_email
  before insert or update on public.email_configurations
  for each row execute function app.validate_setup_email_row();

-- ---------------------------------------------------------------------------
-- Miscellaneous: three independent blocks.
-- ---------------------------------------------------------------------------
create or replace function public.get_utility_miscellaneous(p_branch_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_branch uuid;
  v_invoice public.tenant_settings;
  v_lock public.tenant_settings;
  v_pct public.tenant_settings;
begin
  perform app.assert_notification_permission(v_tenant, 'list');
  v_branch := app.resolve_setup_branch(v_tenant, p_branch_id, false);

  if v_branch is not null then
    select * into v_invoice from public.tenant_settings
     where tenant_id = v_tenant and scope = 'BRANCH' and branch_id = v_branch
       and key = 'invoice_last_no';
  end if;
  select * into v_lock from public.tenant_settings
   where tenant_id = v_tenant and scope = 'TENANT' and branch_id is null
     and key = 'entry_lock_date';
  select * into v_pct from public.tenant_settings
   where tenant_id = v_tenant and scope = 'TENANT' and branch_id is null
     and key = 'credit_limit_email_pct';

  return jsonb_build_object(
    'branch_id', v_branch,
    'invoice_no', v_invoice.value->>'last_no',
    'invoice_row_version', v_invoice.row_version,
    'entry_lock_date', v_lock.value->>'date',
    'entry_lock_row_version', v_lock.row_version,
    'credit_limit_percentage', v_pct.value->>'percentage',
    'credit_limit_row_version', v_pct.row_version);
end
$$;

revoke all on function public.get_utility_miscellaneous(uuid) from public;
grant execute on function public.get_utility_miscellaneous(uuid) to authenticated, service_role;

create or replace function public.save_utility_miscellaneous(
  p_block text,
  p_fields jsonb,
  p_branch_id uuid default null,
  p_row_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_block text := upper(btrim(coalesce(p_block, '')));
  v_f jsonb := coalesce(p_fields, '{}'::jsonb);
  v_branch uuid;
  v_raw text;
  v_last bigint;
  v_date date;
  v_pct numeric;
  v_fy uuid;
  v_next bigint;
begin
  perform app.assert_notification_permission(v_tenant, 'modify');

  if v_block = 'LAST_NO' then
    v_branch := app.resolve_setup_branch(v_tenant, p_branch_id, true);
    v_raw := btrim(coalesce(v_f->>'invoice_no', v_f->>'last_no', ''));
    if v_raw = '' or v_raw !~ '^\d+$' then
      raise exception 'Invoice No. must be a whole number (0 or greater)' using errcode = 'CMS04';
    end if;
    v_last := v_raw::bigint;
    if v_last < 0 then
      raise exception 'Invoice No. must be a whole number (0 or greater)' using errcode = 'CMS04';
    end if;
    perform app.upsert_tenant_setting(
      v_tenant, 'BRANCH', v_branch, 'invoice_last_no',
      jsonb_build_object('last_no', v_last), p_row_version);

    v_next := v_last + 1;
    select fy.id into v_fy
      from public.financial_years fy
     where fy.tenant_id = v_tenant and fy.deleted_at is null and fy.is_active
       and (fy.branch_id = v_branch or fy.branch_id is null)
     order by case when fy.branch_id = v_branch then 0 else 1 end, fy.from_date desc
     limit 1;

    update public.sequence_counters
       set next_no = v_next,
           updated_by = auth.uid()
     where tenant_id = v_tenant
       and branch_id = v_branch
       and doc_type = 'INVOICE'
       and fin_year_id is not distinct from v_fy;
    if not found then
      insert into public.sequence_counters (
        tenant_id, branch_id, fin_year_id, doc_type, next_no, created_by, updated_by)
      values (v_tenant, v_branch, v_fy, 'INVOICE', v_next, auth.uid(), auth.uid());
    end if;

  elsif v_block = 'ENTRY_LOCK' then
    v_raw := btrim(coalesce(v_f->>'entry_lock_date', v_f->>'date', ''));
    if v_raw = '' then
      if p_row_version is not null and exists (
        select 1 from public.tenant_settings
         where tenant_id = v_tenant and scope = 'TENANT' and branch_id is null
           and key = 'entry_lock_date'
           and row_version is distinct from p_row_version
      ) then
        raise exception 'Optimistic lock conflict' using errcode = 'CMS04';
      end if;
      delete from public.tenant_settings
       where tenant_id = v_tenant and scope = 'TENANT' and branch_id is null
         and key = 'entry_lock_date';
    else
      if v_raw !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception 'Entry Lock Date must be a valid date (dd/MM/yyyy)' using errcode = 'CMS04';
      end if;
      begin
        v_date := v_raw::date;
      exception when others then
        raise exception 'Entry Lock Date must be a valid date (dd/MM/yyyy)' using errcode = 'CMS04';
      end;
      if v_date::text <> v_raw then
        raise exception 'Entry Lock Date must be a valid date (dd/MM/yyyy)' using errcode = 'CMS04';
      end if;
      perform app.upsert_tenant_setting(
        v_tenant, 'TENANT', null, 'entry_lock_date',
        jsonb_build_object('date', v_raw), p_row_version);
    end if;

  elsif v_block = 'CREDIT_PCT' then
    v_raw := btrim(coalesce(v_f->>'percentage', ''));
    if v_raw = '' or v_raw !~ '^\d+(\.\d+)?$' then
      raise exception 'Percentage must be a number between 0 and 100' using errcode = 'CMS04';
    end if;
    v_pct := v_raw::numeric;
    if v_pct < 0 or v_pct > 100 then
      raise exception 'Percentage must be a number between 0 and 100' using errcode = 'CMS04';
    end if;
    perform app.upsert_tenant_setting(
      v_tenant, 'TENANT', null, 'credit_limit_email_pct',
      jsonb_build_object('percentage', v_pct), p_row_version);

    insert into public.credit_limit_reeval_queue (
      tenant_id, percentage, cursor_id, pending, updated_at)
    values (v_tenant, v_pct, null, true, now())
    on conflict (tenant_id) do update
      set percentage = excluded.percentage,
          cursor_id = null,
          pending = true,
          updated_at = now();
    perform app.process_credit_limit_reeval_batch(v_tenant, 200);
  else
    raise exception 'Unknown setup block' using errcode = 'CMS04';
  end if;

  return public.get_utility_miscellaneous(
    case when v_block = 'LAST_NO' then v_branch else p_branch_id end);
end
$$;

revoke all on function public.save_utility_miscellaneous(text, jsonb, uuid, integer) from public;
grant execute on function public.save_utility_miscellaneous(text, jsonb, uuid, integer)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Module email config (search / update). Password is write-only.
-- ---------------------------------------------------------------------------
create or replace function app.setup_email_module_code(p_name text)
returns text
language sql
immutable
as $$
  select case upper(btrim(coalesce(p_name, '')))
    when 'EMAIL ON BOOKING' then 'BOOKING'
    when 'EMAIL ON DELIVERY' then 'DELIVERY'
    when 'EMAIL ON FORWARDING' then 'FORWARDING'
    when 'EMAIL ON PROGRESS' then 'PROGRESS'
    when 'ESTATEMENT' then 'ESTATEMENT'
    when 'ESTATEMENT WEIGHT ALERT' then 'WEIGHT_ALERT'
    when 'BOOKING' then 'BOOKING'
    when 'DELIVERY' then 'DELIVERY'
    when 'FORWARDING' then 'FORWARDING'
    when 'PROGRESS' then 'PROGRESS'
    when 'WEIGHT_ALERT' then 'WEIGHT_ALERT'
    else null
  end
$$;

create or replace function public.get_setup_email_module(p_module_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_code text := app.setup_email_module_code(p_module_name);
  v_row public.email_configurations;
begin
  perform app.assert_notification_permission(v_tenant, 'search');
  if v_code is null then
    raise exception 'Unknown email module' using errcode = 'CMS04';
  end if;
  select * into v_row
    from public.email_configurations
   where tenant_id = v_tenant and deleted_at is null and module_code = v_code
   order by updated_at desc
   limit 1;
  if not found then
    return jsonb_build_object('found', false, 'module_code', v_code);
  end if;
  return jsonb_build_object(
    'found', true,
    'id', v_row.id,
    'module_code', v_row.module_code,
    'smtp_host', v_row.smtp_host,
    'smtp_port', v_row.smtp_port,
    'username', v_row.username,
    'has_password', v_row.password_enc is not null,
    'sender_email', v_row.sender_email,
    'use_ssl', v_row.use_ssl,
    'subject_template', v_row.subject_template,
    'body_template', v_row.body_template,
    'message_dear', v_row.print_flags->>'messageDear',
    'print_flags', v_row.print_flags - 'password' - 'mailPassword' - 'password_enc',
    'row_version', v_row.row_version);
end
$$;

revoke all on function public.get_setup_email_module(text) from public;
grant execute on function public.get_setup_email_module(text) to authenticated, service_role;

create or replace function public.save_setup_email_module(
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
  v_code text := app.setup_email_module_code(coalesce(v_f->>'module_name', v_f->>'module_code'));
  v_host text;
  v_port int;
  v_user text;
  v_pass text;
  v_email text;
  v_ssl boolean;
  v_ssl_raw text;
  v_subject text;
  v_body text;
  v_dear text;
  v_flags jsonb;
  v_row public.email_configurations;
  v_old public.email_configurations;
begin
  perform app.assert_notification_permission(v_tenant, 'modify');
  if v_code is null then
    raise exception 'Unknown email module' using errcode = 'CMS04';
  end if;

  v_host := nullif(btrim(coalesce(v_f->>'smtp_host', v_f->>'smtpServer', '')), '');
  begin
    v_port := nullif(btrim(coalesce(v_f->>'smtp_port', v_f->>'smtpPort', '')), '')::int;
  exception when others then
    raise exception 'SMTP Port must be a whole number' using errcode = 'CMS04';
  end;
  v_user := nullif(btrim(coalesce(v_f->>'username', v_f->>'mailUserId', '')), '');
  v_pass := v_f->>'password';
  if v_pass is null then v_pass := v_f->>'mailPassword'; end if;
  v_email := nullif(btrim(coalesce(v_f->>'sender_email', v_f->>'fromEmail', '')), '');
  v_ssl_raw := btrim(coalesce(v_f->>'use_ssl', v_f->>'ssl', ''));
  if v_ssl_raw = '' then
    raise exception 'SSL is required' using errcode = 'CMS04';
  end if;
  v_ssl := lower(v_ssl_raw) in ('true', 't', '1', 'yes');
  v_subject := nullif(btrim(coalesce(v_f->>'subject_template', v_f->>'messageSubject', '')), '');
  v_body := nullif(btrim(coalesce(v_f->>'body_template', v_f->>'messageBody', '')), '');
  v_dear := nullif(btrim(coalesce(v_f->>'message_dear', v_f->>'messageDear', '')), '');
  v_flags := coalesce(v_f->'print_flags', '{}'::jsonb);
  if jsonb_typeof(v_flags) <> 'object' then
    raise exception 'Invalid print flags' using errcode = 'CMS04';
  end if;
  v_flags := v_flags - 'password' - 'mailPassword' - 'password_enc';
  if v_dear is not null then
    v_flags := v_flags || jsonb_build_object('messageDear', v_dear);
  end if;

  if v_host is null then raise exception 'SMTP Server is required' using errcode = 'CMS04'; end if;
  if v_port is null then raise exception 'SMTP Port is required' using errcode = 'CMS04'; end if;
  if v_email is null then raise exception 'From Email is required' using errcode = 'CMS04'; end if;
  if v_user is null then raise exception 'Mail User ID is required' using errcode = 'CMS04'; end if;
  if v_dear is null then raise exception 'Message Dear is required' using errcode = 'CMS04'; end if;
  if v_subject is null then raise exception 'Message Subject is required' using errcode = 'CMS04'; end if;
  if v_body is null then raise exception 'Message Body is required' using errcode = 'CMS04'; end if;

  select * into v_old
    from public.email_configurations
   where tenant_id = v_tenant and deleted_at is null and module_code = v_code
   order by updated_at desc
   limit 1
   for update;

  if found then
    if p_id is not null and v_old.id <> p_id then
      raise exception 'Email configuration not found' using errcode = 'P0002';
    end if;
    if p_row_version is not null and v_old.row_version <> p_row_version then
      raise exception 'Optimistic lock conflict' using errcode = 'CMS04';
    end if;
    if nullif(btrim(coalesce(v_pass, '')), '') is null and v_old.password_enc is null then
      raise exception 'Mail Password is required' using errcode = 'CMS04';
    end if;
    update public.email_configurations
       set smtp_host = v_host,
           smtp_port = v_port,
           username = v_user,
           password_enc = case
             when nullif(btrim(coalesce(v_pass, '')), '') is null then password_enc
             else app.encrypt_smtp_password(v_pass)
           end,
           sender_email = v_email,
           use_ssl = v_ssl,
           is_default = false,
           status = 'ACTIVE',
           module_code = v_code,
           subject_template = v_subject,
           body_template = v_body,
           print_flags = v_flags,
           updated_by = auth.uid()
     where id = v_old.id
     returning * into v_row;
  else
    if nullif(btrim(coalesce(v_pass, '')), '') is null then
      raise exception 'Mail Password is required' using errcode = 'CMS04';
    end if;
    insert into public.email_configurations (
      tenant_id, smtp_host, smtp_port, username, password_enc, sender_email,
      use_ssl, is_default, status, module_code, subject_template, body_template,
      print_flags, created_by, updated_by)
    values (
      v_tenant, v_host, v_port, v_user, app.encrypt_smtp_password(v_pass), v_email,
      v_ssl, false, 'ACTIVE', v_code, v_subject, v_body, v_flags, auth.uid(), auth.uid())
    returning * into v_row;
  end if;

  perform app.write_audit_log(
    v_tenant, 'email_configurations',
    case when v_old.id is null then 'ADD' else 'MODIFY' end,
    v_row.id, 'utl.xpresion-setup',
    null, jsonb_build_object(
      'module_code', v_row.module_code,
      'smtp_host', v_row.smtp_host,
      'sender_email', v_row.sender_email,
      'password_set', v_row.password_enc is not null));

  return public.get_setup_email_module(v_code);
end
$$;

revoke all on function public.save_setup_email_module(jsonb, uuid, integer) from public;
grant execute on function public.save_setup_email_module(jsonb, uuid, integer)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- E-MAIL FOOTER and KYC XPRESION (no SMTP).
-- ---------------------------------------------------------------------------
create or replace function public.get_setup_email_footer()
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
     and key = 'email_footer';
  return jsonb_build_object(
    'rows', coalesce(v_row.value->'rows', '[]'::jsonb),
    'row_version', v_row.row_version);
end
$$;

revoke all on function public.get_setup_email_footer() from public;
grant execute on function public.get_setup_email_footer() to authenticated, service_role;

create or replace function public.save_setup_email_footer(
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
begin
  perform app.assert_notification_permission(v_tenant, 'modify');
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Footer rows are required' using errcode = 'CMS04';
  end if;
  perform app.upsert_tenant_setting(
    v_tenant, 'TENANT', null, 'email_footer',
    jsonb_build_object('rows', p_rows), p_row_version);
  return public.get_setup_email_footer();
end
$$;

revoke all on function public.save_setup_email_footer(jsonb, integer) from public;
grant execute on function public.save_setup_email_footer(jsonb, integer)
  to authenticated, service_role;

create or replace function public.save_setup_kyc(p_row_version integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_row public.tenant_settings;
begin
  perform app.assert_notification_permission(v_tenant, 'modify');
  v_row := app.upsert_tenant_setting(
    v_tenant, 'TENANT', null, 'kyc_xpresion',
    jsonb_build_object('saved', true), p_row_version);
  return jsonb_build_object('saved', true, 'row_version', v_row.row_version);
end
$$;

revoke all on function public.save_setup_kyc(integer) from public;
grant execute on function public.save_setup_kyc(integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Form setup dropdown modules.
-- ---------------------------------------------------------------------------
create or replace function public.get_form_setup(p_module text)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_module text := btrim(coalesce(p_module, ''));
  v_row public.tenant_settings;
begin
  perform app.assert_notification_permission(v_tenant, 'search');
  if v_module not in (
    'AWB Entry','Manifest','Scan','PickUp','Inscan','AWB Query','DRS Scan','RCP Entry'
  ) then
    raise exception 'Unknown form setup module' using errcode = 'CMS04';
  end if;
  select * into v_row from public.tenant_settings
   where tenant_id = v_tenant and scope = 'TENANT' and branch_id is null
     and key = 'form_setup:' || v_module;
  return jsonb_build_object(
    'module', v_module,
    'fields', coalesce(v_row.value->'fields', '[]'::jsonb),
    'row_version', v_row.row_version);
end
$$;

revoke all on function public.get_form_setup(text) from public;
grant execute on function public.get_form_setup(text) to authenticated, service_role;

create or replace function public.save_form_setup(
  p_module text,
  p_fields jsonb,
  p_row_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_module text := btrim(coalesce(p_module, ''));
begin
  perform app.assert_notification_permission(v_tenant, 'modify');
  if v_module not in (
    'AWB Entry','Manifest','Scan','PickUp','Inscan','AWB Query','DRS Scan','RCP Entry'
  ) then
    raise exception 'Unknown form setup module' using errcode = 'CMS04';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'array' then
    raise exception 'Form setup fields are required' using errcode = 'CMS04';
  end if;
  perform app.upsert_tenant_setting(
    v_tenant, 'TENANT', null, 'form_setup:' || v_module,
    jsonb_build_object('fields', p_fields), p_row_version);
  return public.get_form_setup(v_module);
end
$$;

revoke all on function public.save_form_setup(text, jsonb, integer) from public;
grant execute on function public.save_form_setup(text, jsonb, integer)
  to authenticated, service_role;
