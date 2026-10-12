-- Setup module verification. Runs inside a transaction and rolls back.
-- Covers entry lock on shipments, manifests, and expense_entries, the email
-- body print toggles, empty-field rejection, and credit-limit batching.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000128', 'authenticated', 'authenticated', 'setup128@a.test')
on conflict (id) do nothing;

do $$
declare
  v_tenant uuid;
begin
  v_tenant := app.bootstrap_tenant('setup-128', 'Setup 128', 'S128');
  perform app.link_tenant_admin(
    v_tenant,
    '99999999-1111-4111-8111-000000000128',
    'setup128',
    'Setup Admin',
    'setup128@a.test');
  perform set_config('setup.tenant', v_tenant::text, false);
end $$;

set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000128';
set local role authenticated;

-- ---------------------------------------------------------------------------
-- Empty common email fields are rejected by the database, not only the client.
-- ---------------------------------------------------------------------------
do $$
declare
  v_base jsonb := jsonb_build_object(
    'module_name', 'EMAIL ON BOOKING',
    'smtpServer', 'smtp.example.com',
    'smtpPort', '587',
    'fromEmail', 'ops@example.com',
    'mailUserId', 'ops@example.com',
    'mailPassword', 'secret-value',
    'messageDear', 'Dear Sir,',
    'messageSubject', 'Subject',
    'messageBody', 'Body',
    'ssl', true
  );
  v_case record;
  v_ok boolean;
begin
  for v_case in
    select * from (values
      ('smtpServer', 'SMTP Server'),
      ('smtpPort', 'SMTP Port'),
      ('fromEmail', 'From Email'),
      ('mailUserId', 'Mail User ID'),
      ('mailPassword', 'Mail Password'),
      ('messageDear', 'Message Dear'),
      ('messageSubject', 'Message Subject'),
      ('messageBody', 'Message Body'),
      ('ssl', 'SSL')
    ) as t(key, label)
  loop
    v_ok := false;
    begin
      perform public.save_setup_email_module(v_base - v_case.key, null, null);
    exception when others then
      if position(v_case.label in sqlerrm) = 0 then
        raise exception 'FAIL empty % raised %', v_case.label, sqlerrm;
      end if;
      v_ok := true;
    end;
    if not v_ok then
      raise exception 'FAIL empty % was accepted', v_case.label;
    end if;
  end loop;
  raise notice 'PASS [email required fields]';
end $$;

-- Port 587 with SSL on is valid. Password comes back only as has_password.
do $$
declare
  v_row jsonb;
begin
  v_row := public.save_setup_email_module(jsonb_build_object(
    'module_name', 'EMAIL ON BOOKING',
    'smtpServer', 'smtp.example.com',
    'smtpPort', '587',
    'fromEmail', 'ops@example.com',
    'mailUserId', 'ops@example.com',
    'mailPassword', 'secret-value',
    'messageDear', 'Dear Sir,',
    'messageSubject', 'Booked',
    'messageBody', 'Your shipment is booked.',
    'ssl', true,
    'print_flags', jsonb_build_object(
      'printShipper', true,
      'printSender', false,
      'printWeight', true,
      'weightHeading', 'Chargeable Wt',
      'printOrigin', true,
      'printContent', false,
      'password', 'must-not-stick'
    )
  ), null, null);
  if v_row->>'smtp_port' <> '587' or (v_row->>'use_ssl')::boolean is not true then
    raise exception 'FAIL ssl/port %', v_row;
  end if;
  if v_row ? 'password' or v_row ? 'mailPassword' or v_row->>'has_password' <> 'true' then
    raise exception 'FAIL password leaked %', v_row;
  end if;
  if v_row->'print_flags' ? 'password' then
    raise exception 'FAIL password stored in flags';
  end if;
  if exists (
    select 1 from public.email_configurations
     where id = (v_row->>'id')::uuid
       and password_enc = convert_to('secret-value', 'UTF8')
  ) then
    raise exception 'FAIL password stored in plaintext';
  end if;
  raise notice 'PASS [ssl 587 + encrypted password]';
end $$;

reset role;

-- Print toggles change the generated body.
do $$
declare
  v_tenant uuid := current_setting('setup.tenant')::uuid;
  v_body text;
begin
  v_body := app.render_setup_event_email(
    v_tenant,
    'EMAIL ON BOOKING',
    jsonb_build_object(
      'Shipper_Name', 'Acme Shipper',
      'sender', 'Sender Desk',
      'weight', '2.50',
      'origin', 'BLR',
      'content', 'Documents'
    ),
    null);
  if v_body is null
     or position('Shipper: Acme Shipper' in v_body) = 0
     or position('Chargeable Wt: 2.50' in v_body) = 0
     or position('Origin: BLR' in v_body) = 0
     or position('Sender:' in v_body) > 0
     or position('Content:' in v_body) > 0
     or position('Documents' in v_body) > 0 then
    raise exception 'FAIL booking body %', v_body;
  end if;

  perform public.save_setup_email_module(jsonb_build_object(
    'module_name', 'EMAIL ON DELIVERY',
    'smtpServer', 'smtp.example.com',
    'smtpPort', '465',
    'fromEmail', 'ops@example.com',
    'mailUserId', 'ops@example.com',
    'mailPassword', 'secret-value',
    'messageDear', 'Dear Customer,',
    'messageSubject', 'Delivered',
    'messageBody', 'Delivered.',
    'ssl', false,
    'print_flags', jsonb_build_object(
      'printRefNo', true, 'printWeight', false, 'printSender', true, 'printPcs', true
    )
  ), null, null);
  v_body := app.render_setup_event_email(
    v_tenant, 'DELIVERY',
    jsonb_build_object('Ref_No', 'REF-9', 'weight', '2.50', 'sender', 'Sender Desk', 'pcs', '2'),
    null);
  if position('Ref No.: REF-9' in v_body) = 0
     or position('Sender: Sender Desk' in v_body) = 0
     or position('Pcs: 2' in v_body) = 0
     or position('Weight:' in v_body) > 0 then
    raise exception 'FAIL delivery body %', v_body;
  end if;

  perform public.save_setup_email_module(jsonb_build_object(
    'module_name', 'EMAIL ON FORWARDING',
    'smtpServer', 'smtp.example.com',
    'smtpPort', '587',
    'fromEmail', 'ops@example.com',
    'mailUserId', 'ops@example.com',
    'mailPassword', 'secret-value',
    'messageDear', 'Dear Vendor,',
    'messageSubject', 'Forwarded',
    'messageBody', 'Forwarded.',
    'ssl', false,
    'print_flags', jsonb_build_object('printDoxSpx', true, 'printVendorName', false, 'printWeight', true)
  ), null, null);
  v_body := app.render_setup_event_email(
    v_tenant, 'FORWARDING',
    jsonb_build_object('pieces_unit', 'DOX', 'weight', '2.50', 'Vendor_Name', 'Blue Dart'),
    null);
  if position('DOX/SPX: DOX' in v_body) = 0
     or position('Weight: 2.50' in v_body) = 0
     or position('Vendor Name' in v_body) > 0
     or position('Blue Dart' in v_body) > 0 then
    raise exception 'FAIL forwarding body off %', v_body;
  end if;

  perform public.save_setup_email_module(jsonb_build_object(
    'module_name', 'EMAIL ON FORWARDING',
    'smtpServer', 'smtp.example.com',
    'smtpPort', '587',
    'fromEmail', 'ops@example.com',
    'mailUserId', 'ops@example.com',
    'mailPassword', 'secret-value',
    'messageDear', 'Dear Vendor,',
    'messageSubject', 'Forwarded',
    'messageBody', 'Forwarded.',
    'ssl', false,
    'print_flags', jsonb_build_object('printVendorName', true)
  ), null, null);
  v_body := app.render_setup_event_email(
    v_tenant, 'FORWARDING',
    jsonb_build_object('Vendor_Name', 'Blue Dart', 'pieces_unit', 'DOX'),
    null);
  if position('Vendor Name: Blue Dart' in v_body) = 0
     or position('DOX/SPX' in v_body) > 0 then
    raise exception 'FAIL forwarding body on %', v_body;
  end if;
  raise notice 'PASS [print toggles]';
end $$;

-- The second save above ran as the session role after reset role.
-- Re-assert we are the migration role for the lock fixtures.
reset role;

-- Isolate the lock trigger from audit/touch triggers for this rolled-back probe.
alter table public.shipments disable trigger user;
alter table public.shipments enable trigger trg_entry_lock;
alter table public.manifests disable trigger user;
alter table public.manifests enable trigger trg_entry_lock;
alter table public.expense_entries disable trigger user;
alter table public.expense_entries enable trigger trg_entry_lock;

-- ---------------------------------------------------------------------------
-- Entry lock. NULL is a no-op. Strictly-before blocks edit, delete, and
-- soft-delete. On the lock date and after it are allowed. A back-dated
-- INSERT is allowed. authenticated cannot bypass the trigger.
-- ---------------------------------------------------------------------------
do $$
declare
  v_tenant uuid := current_setting('setup.tenant')::uuid;
  v_before uuid;
  v_on uuid;
  v_after uuid;
  v_inserted uuid;
begin
  insert into public.shipments (tenant_id, awb_no, book_date)
  values (v_tenant, 'LOCK-BEFORE', date '2020-01-01')
  returning id into v_before;
  insert into public.shipments (tenant_id, awb_no, book_date)
  values (v_tenant, 'LOCK-ON', date '2020-06-15')
  returning id into v_on;
  insert into public.shipments (tenant_id, awb_no, book_date)
  values (v_tenant, 'LOCK-AFTER', date '2020-12-31')
  returning id into v_after;
  perform set_config('setup.ship_before', v_before::text, false);
  perform set_config('setup.ship_on', v_on::text, false);
  perform set_config('setup.ship_after', v_after::text, false);

  insert into public.manifests (tenant_id, manifest_no, manifest_date)
  values (v_tenant, 'LOCK-M-BEFORE', date '2020-01-01')
  returning id into v_before;
  insert into public.manifests (tenant_id, manifest_no, manifest_date)
  values (v_tenant, 'LOCK-M-ON', date '2020-06-15')
  returning id into v_on;
  insert into public.manifests (tenant_id, manifest_no, manifest_date)
  values (v_tenant, 'LOCK-M-AFTER', date '2020-12-31')
  returning id into v_after;
  perform set_config('setup.man_before', v_before::text, false);
  perform set_config('setup.man_on', v_on::text, false);
  perform set_config('setup.man_after', v_after::text, false);

  insert into public.expense_entries (tenant_id, entry_no, entry_date, amount)
  values (v_tenant, 'LOCK-E-BEFORE', date '2020-01-01', 10)
  returning id into v_before;
  insert into public.expense_entries (tenant_id, entry_no, entry_date, amount)
  values (v_tenant, 'LOCK-E-ON', date '2020-06-15', 10)
  returning id into v_on;
  insert into public.expense_entries (tenant_id, entry_no, entry_date, amount)
  values (v_tenant, 'LOCK-E-AFTER', date '2020-12-31', 10)
  returning id into v_after;
  perform set_config('setup.exp_before', v_before::text, false);
  perform set_config('setup.exp_on', v_on::text, false);
  perform set_config('setup.exp_after', v_after::text, false);

  -- No lock date: edit and delete are allowed.
  update public.shipments set content = 'open' where id = current_setting('setup.ship_before')::uuid;
  delete from public.manifests where id = current_setting('setup.man_before')::uuid;
  update public.expense_entries set description = 'open' where id = current_setting('setup.exp_before')::uuid;
  raise notice 'PASS [null lock allows edit and delete]';

  insert into public.tenant_settings (tenant_id, scope, key, value)
  values (v_tenant, 'TENANT', 'entry_lock_date', jsonb_build_object('date', '2020-06-15'));

  -- Back-dated insert stays allowed.
  insert into public.shipments (tenant_id, awb_no, book_date)
  values (v_tenant, 'LOCK-BACKDATED', date '2019-01-01')
  returning id into v_inserted;
  if v_inserted is null then
    raise exception 'FAIL back-dated insert';
  end if;
  raise notice 'PASS [back-dated insert allowed]';
end $$;

do $$
declare
  v_blocked boolean;
begin
  v_blocked := false;
  begin
    update public.shipments set content = 'nope'
     where id = current_setting('setup.ship_before')::uuid;
  exception when others then
    if sqlerrm not like 'Entry dated before%' then raise; end if;
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'FAIL shipment edit before lock'; end if;

  v_blocked := false;
  begin
    delete from public.shipments where id = current_setting('setup.ship_on')::uuid
      and book_date < date '2020-06-15';
  exception when others then
    raise;
  end;
  -- The ON row must still be editable. The statement above matched nothing.
  update public.shipments set content = 'on-date'
   where id = current_setting('setup.ship_on')::uuid;
  update public.shipments set content = 'after'
   where id = current_setting('setup.ship_after')::uuid;

  v_blocked := false;
  begin
    update public.shipments set deleted_at = now()
     where id = current_setting('setup.ship_before')::uuid;
  exception when others then
    if sqlerrm not like 'Entry dated before%' then raise; end if;
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'FAIL shipment soft-delete'; end if;

  v_blocked := false;
  begin
    delete from public.manifests where id = current_setting('setup.man_on')::uuid;
    -- recreate the before row's sibling: man_before was deleted while unlocked.
    update public.manifests set remark = 'on' where id = current_setting('setup.man_on')::uuid;
  exception when others then
    raise exception 'FAIL manifest on-date %', sqlerrm;
  end;
  -- man_on delete above succeeded because ON the lock date is allowed.
  -- Re-insert a strictly-before manifest and prove delete is blocked.
  insert into public.manifests (tenant_id, manifest_no, manifest_date)
  values (current_setting('setup.tenant')::uuid, 'LOCK-M-BEFORE-2', date '2020-01-02');
  v_blocked := false;
  begin
    delete from public.manifests
     where tenant_id = current_setting('setup.tenant')::uuid
       and manifest_no = 'LOCK-M-BEFORE-2';
  exception when others then
    if sqlerrm not like 'Entry dated before%' then raise; end if;
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'FAIL manifest delete before lock'; end if;

  v_blocked := false;
  begin
    update public.expense_entries set description = 'nope'
     where id = current_setting('setup.exp_before')::uuid;
  exception when others then
    if sqlerrm not like 'Entry dated before%' then raise; end if;
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'FAIL expense edit before lock'; end if;
  update public.expense_entries set description = 'after'
   where id = current_setting('setup.exp_after')::uuid;
  v_blocked := false;
  begin
    update public.expense_entries set deleted_at = now()
     where id = current_setting('setup.exp_before')::uuid;
  exception when others then
    if sqlerrm not like 'Entry dated before%' then raise; end if;
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'FAIL expense soft-delete'; end if;

  raise notice 'PASS [lock before/on/after]';
end $$;

grant select, insert, update, delete on public.shipments to authenticated;
drop policy if exists setup_lock_probe on public.shipments;
create policy setup_lock_probe on public.shipments for all using (true) with check (true);

set local role authenticated;
do $$
declare
  v_blocked boolean := false;
begin
  begin
    update public.shipments set content = 'bypass'
     where id = current_setting('setup.ship_before')::uuid;
  exception when others then
    if sqlerrm not like 'Entry dated before%' then raise; end if;
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'FAIL authenticated bypassed the entry lock';
  end if;
  raise notice 'PASS [no role bypass]';
end $$;
reset role;

-- Clearing the lock date makes the trigger a no-op again.
do $$
declare
  v_cleared jsonb;
begin
  perform set_config('request.jwt.claim.sub', '99999999-1111-4111-8111-000000000128', true);
  v_cleared := public.save_utility_miscellaneous(
    'ENTRY_LOCK', jsonb_build_object('entry_lock_date', ''), null, null);
  if coalesce(v_cleared->>'entry_lock_date', '') <> '' then
    raise exception 'FAIL lock date not cleared %', v_cleared;
  end if;
  update public.shipments set content = 'cleared'
   where id = current_setting('setup.ship_before')::uuid;
  delete from public.expense_entries where id = current_setting('setup.exp_before')::uuid;
  raise notice 'PASS [cleared lock is a no-op]';
end $$;

-- Credit reevaluation walks 200 rows per call, not the whole set.
do $$
declare
  v_tenant uuid := current_setting('setup.tenant')::uuid;
  v_n integer;
begin
  insert into public.customers (tenant_id, code, name, mobile, credit_limit)
  select v_tenant, 'CL' || g, 'Credit ' || g, '9000000000', 100
    from generate_series(1, 450) g;

  insert into public.credit_limit_reeval_queue (tenant_id, percentage, pending)
  values (v_tenant, 80, true);

  v_n := app.process_credit_limit_reeval_batch(v_tenant, 200);
  if v_n <> 200 then
    raise exception 'FAIL first credit batch %', v_n;
  end if;
  v_n := app.process_credit_limit_reeval_batch(v_tenant, 200);
  if v_n <> 200 then
    raise exception 'FAIL second credit batch %', v_n;
  end if;
  v_n := app.process_credit_limit_reeval_batch(v_tenant, 200);
  if v_n <> 50 then
    raise exception 'FAIL last credit batch %', v_n;
  end if;
  v_n := app.process_credit_limit_reeval_batch(v_tenant, 200);
  if v_n <> 0 then
    raise exception 'FAIL credit queue did not drain %', v_n;
  end if;
  raise notice 'PASS [credit batch of 200 over 450 customers]';
end $$;

select 'PASS' as setup_verification;

rollback;
