-- ===========================================================================
-- 0040  finance foundation — Phase 4 Milestone 4G
-- ---------------------------------------------------------------------------
-- Core financial vouchers only. No invoices, GST, IRN, rating, reports,
-- payment gateway, carrier APIs, debit/credit notes, or background jobs.
--
-- Tables: expense_heads (minimal FK master), receipts, expense_entries,
--         customer_payments, ledger_entries
-- RPCs:   save_receipt, post_receipt, save_expense, authorize_expense,
--         reject_expense, save_customer_payment, approve_customer_payment,
--         reject_customer_payment
-- Slugs:  txn.receipt-entry, txn.expense-entry, txn.expense-authorize,
--         txn.customer-pay
-- ===========================================================================

-- Extend status machine for finance documents
alter table app.status_transitions drop constraint if exists status_transitions_entity_kind_check;
alter table app.status_transitions
  add constraint status_transitions_entity_kind_check
  check (entity_kind in (
    'SHIPMENT','PICKUP','MANIFEST','DRS',
    'RECEIPT','EXPENSE','CUSTOMER_PAYMENT'));

insert into app.status_transitions (entity_kind, from_status, to_status) values
  ('RECEIPT','DRAFT','POSTED'),
  ('EXPENSE','UNAUTHORIZED','AUTHORIZED'),
  ('EXPENSE','UNAUTHORIZED','REJECTED'),
  ('CUSTOMER_PAYMENT','PENDING','APPROVED'),
  ('CUSTOMER_PAYMENT','PENDING','REJECTED')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- expense_heads — minimal master required by expense_entries FK (blueprint §2.5)
-- ---------------------------------------------------------------------------
create table if not exists public.expense_heads (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  code          text not null,
  name          text not null,
  kind          text not null default 'EXPENSE'
                  check (kind in ('EXPENSE','INCOME')),
  expense_type  text not null default 'OPERATIONAL'
                  check (expense_type in ('DIRECT','INDIRECT','OPERATIONAL','ADMINISTRATIVE')),
  ledger        text,
  gl_account    text,
  tax_pct       numeric(7,4) not null default 0,
  status        text not null default 'ACTIVE'
                  check (status in ('ACTIVE','INACTIVE')),
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  deleted_at    timestamptz,
  row_version   integer not null default 1,
  constraint expense_heads_tenant_id_uq unique (tenant_id, id)
);
create unique index if not exists expense_heads_tenant_code_uq
  on public.expense_heads (tenant_id, code) where deleted_at is null;
create index if not exists expense_heads_tenant_idx on public.expense_heads (tenant_id);

select app.attach_master_triggers('expense_heads', 'mst.expense-master');
alter table public.expense_heads enable row level security;
drop policy if exists expense_heads_select on public.expense_heads;
create policy expense_heads_select on public.expense_heads
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());
drop policy if exists expense_heads_insert on public.expense_heads;
create policy expense_heads_insert on public.expense_heads
  for insert with check (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'mst.expense-master', 'add'));
drop policy if exists expense_heads_update on public.expense_heads;
create policy expense_heads_update on public.expense_heads
  for update using (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'mst.expense-master', 'modify'));

-- ---------------------------------------------------------------------------
-- receipts
-- ---------------------------------------------------------------------------
create table if not exists public.receipts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  receipt_no    text not null,
  receipt_date  date not null default (current_date),
  customer_id   uuid not null,
  branch_id     uuid,
  bank_id       uuid,
  mode          text not null default 'CASH'
                  check (mode in ('CASH','BANK')),
  amount        numeric(14,2) not null check (amount > 0),
  narration     text,
  status        text not null default 'DRAFT'
                  check (status in ('DRAFT','POSTED','ADJUSTED','CANCELLED')),
  status_at     timestamptz not null default now(),
  posted_at     timestamptz,
  posted_by     uuid,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  deleted_at    timestamptz,
  row_version   integer not null default 1,
  constraint receipts_tenant_id_uq unique (tenant_id, id),
  constraint receipts_customer_fk foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete restrict,
  constraint receipts_branch_fk foreign key (tenant_id, branch_id)
    references public.branches (tenant_id, id) on delete set null,
  constraint receipts_bank_fk foreign key (tenant_id, bank_id)
    references public.banks (tenant_id, id) on delete set null
);
create unique index if not exists receipts_tenant_no_uq
  on public.receipts (tenant_id, receipt_no) where deleted_at is null;
create index if not exists receipts_tenant_idx on public.receipts (tenant_id);
create index if not exists receipts_customer_idx
  on public.receipts (tenant_id, customer_id, receipt_date);

select app.attach_transaction_triggers('receipts', 'txn.receipt-entry');
select app.attach_transaction_policies('receipts', 'txn.receipt-entry');

-- ---------------------------------------------------------------------------
-- expense_entries
-- ---------------------------------------------------------------------------
create table if not exists public.expense_entries (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  entry_no              text not null,
  kind                  text not null default 'EXPENSE'
                          check (kind in ('EXPENSE','INCOME')),
  entry_date            date not null default (current_date),
  expense_head_id       uuid,
  expense_head_code     text,
  expense_head_name     text,
  mode                  text not null default 'CASH'
                          check (mode in ('CASH','BANK')),
  bank_id               uuid,
  branch_id             uuid,
  shipment_id           uuid,
  awb_no                text,
  description           text,
  amount                numeric(14,2) not null check (amount > 0),
  document_file_id      uuid references public.files(id) on delete set null,
  authorization_status  text not null default 'UNAUTHORIZED'
                          check (authorization_status in ('UNAUTHORIZED','AUTHORIZED','REJECTED')),
  authorized_by         uuid,
  authorized_at         timestamptz,
  rejection_reason      text,
  created_at            timestamptz not null default now(),
  created_by            uuid,
  updated_at            timestamptz not null default now(),
  updated_by            uuid,
  deleted_at            timestamptz,
  row_version           integer not null default 1,
  constraint expense_entries_tenant_id_uq unique (tenant_id, id),
  constraint expense_entries_head_fk foreign key (tenant_id, expense_head_id)
    references public.expense_heads (tenant_id, id) on delete set null,
  constraint expense_entries_bank_fk foreign key (tenant_id, bank_id)
    references public.banks (tenant_id, id) on delete set null,
  constraint expense_entries_branch_fk foreign key (tenant_id, branch_id)
    references public.branches (tenant_id, id) on delete set null,
  constraint expense_entries_shipment_fk foreign key (tenant_id, shipment_id)
    references public.shipments (tenant_id, id) on delete set null
);
create unique index if not exists expense_entries_tenant_no_uq
  on public.expense_entries (tenant_id, entry_no) where deleted_at is null;
create index if not exists expense_entries_tenant_idx on public.expense_entries (tenant_id);
create index if not exists expense_entries_status_idx
  on public.expense_entries (tenant_id, authorization_status);

select app.attach_transaction_triggers('expense_entries', 'txn.expense-entry');
select app.attach_transaction_policies('expense_entries', 'txn.expense-entry');

-- ---------------------------------------------------------------------------
-- customer_payments
-- ---------------------------------------------------------------------------
create table if not exists public.customer_payments (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  customer_id     uuid not null,
  declared_date   date not null default (current_date),
  paid_date       date,
  amount          numeric(14,2) not null check (amount > 0),
  remark          text,
  file_id         uuid references public.files(id) on delete set null,
  status          text not null default 'PENDING'
                    check (status in ('PENDING','APPROVED','REJECTED')),
  reviewed_by     uuid,
  reviewed_at     timestamptz,
  rejection_reason text,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  deleted_at      timestamptz,
  row_version     integer not null default 1,
  constraint customer_payments_tenant_id_uq unique (tenant_id, id),
  constraint customer_payments_customer_fk foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete restrict
);
create index if not exists customer_payments_tenant_idx on public.customer_payments (tenant_id);
create index if not exists customer_payments_customer_idx
  on public.customer_payments (tenant_id, customer_id, declared_date);
create index if not exists customer_payments_status_idx
  on public.customer_payments (tenant_id, status);

select app.attach_transaction_triggers('customer_payments', 'txn.customer-pay');
select app.attach_transaction_policies('customer_payments', 'txn.customer-pay');

-- ---------------------------------------------------------------------------
-- ledger_entries (append-only AR subledger foundation)
-- ---------------------------------------------------------------------------
create table if not exists public.ledger_entries (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  customer_id   uuid,
  entry_date    date not null default (current_date),
  doc_type      text not null
                  check (doc_type in (
                    'INVOICE','RECEIPT','DEBIT_NOTE','CREDIT_NOTE',
                    'ADJUSTMENT','OPENING','EXPENSE','CUSTOMER_PAYMENT')),
  doc_id        uuid not null,
  debit         numeric(14,2) not null default 0 check (debit >= 0),
  credit        numeric(14,2) not null default 0 check (credit >= 0),
  balance_after numeric(14,2),
  branch_id     uuid,
  narration     text,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  deleted_at    timestamptz,
  row_version   integer not null default 1,
  constraint ledger_entries_customer_fk foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete restrict,
  constraint ledger_entries_branch_fk foreign key (tenant_id, branch_id)
    references public.branches (tenant_id, id) on delete set null,
  constraint ledger_entries_amount_ck check (debit > 0 or credit > 0)
);
create index if not exists ledger_entries_customer_date_idx
  on public.ledger_entries (tenant_id, customer_id, entry_date, created_at);
create index if not exists ledger_entries_doc_idx
  on public.ledger_entries (tenant_id, doc_type, doc_id);
create unique index if not exists ledger_entries_doc_uq
  on public.ledger_entries (tenant_id, doc_type, doc_id)
  where deleted_at is null;

select app.attach_append_only_guard('ledger_entries');
select app.attach_event_policies('ledger_entries', 'txn.receipt-entry');

create or replace function app.append_ledger_entry(
  p_tenant      uuid,
  p_customer    uuid,
  p_entry_date  date,
  p_doc_type    text,
  p_doc_id      uuid,
  p_debit       numeric,
  p_credit      numeric,
  p_branch_id   uuid default null,
  p_narration   text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_id uuid;
  v_bal numeric(14,2);
  v_debit numeric(14,2) := coalesce(p_debit, 0);
  v_credit numeric(14,2) := coalesce(p_credit, 0);
begin
  if v_debit < 0 or v_credit < 0 then
    raise exception 'Ledger debit/credit must be non-negative' using errcode = '22023';
  end if;
  if v_debit = 0 and v_credit = 0 then
    raise exception 'Ledger entry requires debit or credit' using errcode = '22023';
  end if;

  select coalesce(
    (select le.balance_after from public.ledger_entries le
      where le.tenant_id = p_tenant
        and le.customer_id is not distinct from p_customer
        and le.deleted_at is null
      order by le.entry_date desc, le.created_at desc
      limit 1),
    0) + v_debit - v_credit
  into v_bal;

  insert into public.ledger_entries (
    tenant_id, customer_id, entry_date, doc_type, doc_id,
    debit, credit, balance_after, branch_id, narration, created_by, updated_by)
  values (
    p_tenant, p_customer, coalesce(p_entry_date, current_date), p_doc_type, p_doc_id,
    v_debit, v_credit, v_bal, p_branch_id, nullif(btrim(coalesce(p_narration,'')),''),
    auth.uid(), auth.uid())
  returning id into v_id;
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------
-- save_receipt
-- ---------------------------------------------------------------------------
create or replace function public.save_receipt(
  p_id          uuid default null,
  p_row_version integer default null,
  p_fields      jsonb default '{}'::jsonb
)
returns public.receipts
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_r public.receipts;
  v_customer uuid;
  v_branch uuid;
  v_bank uuid;
  v_mode text;
  v_amount numeric(14,2);
  v_date date;
  v_narration text;
  v_no text;
  v_fy uuid;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'p_fields must be a JSON object' using errcode = '22023';
  end if;

  if p_id is null then
    if not app.user_has_permission(v_tenant, 'txn.receipt-entry', 'add') then
      raise exception 'Permission denied: txn.receipt-entry add' using errcode = '42501';
    end if;
  else
    if not app.user_has_permission(v_tenant, 'txn.receipt-entry', 'modify') then
      raise exception 'Permission denied: txn.receipt-entry modify' using errcode = '42501';
    end if;
    select * into v_r from public.receipts
     where id = p_id and tenant_id = v_tenant and deleted_at is null;
    if not found then raise exception 'Receipt not found' using errcode = 'P0002'; end if;
    if v_r.status <> 'DRAFT' then
      raise exception 'Only DRAFT receipts can be updated (is %)', v_r.status
        using errcode = 'CMS04';
    end if;
  end if;

  begin
    v_date := coalesce((p_fields->>'receipt_date')::date, current_date);
  exception when others then
    raise exception 'Invalid receipt_date' using errcode = '22023';
  end;

  begin
    v_amount := (p_fields->>'amount')::numeric;
  exception when others then
    raise exception 'Invalid amount' using errcode = '22023';
  end;
  if v_amount is null or v_amount <= 0 then
    raise exception 'Amount must be greater than zero' using errcode = 'CMS04';
  end if;

  v_mode := upper(coalesce(nullif(btrim(p_fields->>'mode'),''), 'CASH'));
  if v_mode not in ('CASH','BANK') then v_mode := 'CASH'; end if;

  if nullif(btrim(coalesce(p_fields->>'customer_id','')),'') is not null then
    v_customer := (p_fields->>'customer_id')::uuid;
  elsif nullif(btrim(coalesce(p_fields->>'customer_code','')),'') is not null then
    select c.id into v_customer from public.customers c
     where c.tenant_id = v_tenant and c.code = btrim(p_fields->>'customer_code')
       and c.deleted_at is null;
  end if;
  if v_customer is null then
    raise exception 'Customer is required' using errcode = 'CMS04';
  end if;

  if nullif(btrim(coalesce(p_fields->>'branch_id','')),'') is not null then
    v_branch := (p_fields->>'branch_id')::uuid;
  elsif nullif(btrim(coalesce(p_fields->>'branch_code','')),'') is not null then
    select b.id into v_branch from public.branches b
     where b.tenant_id = v_tenant and b.code = btrim(p_fields->>'branch_code')
       and b.deleted_at is null;
  end if;

  if v_mode = 'BANK' then
    if nullif(btrim(coalesce(p_fields->>'bank_id','')),'') is not null then
      v_bank := (p_fields->>'bank_id')::uuid;
    elsif nullif(btrim(coalesce(p_fields->>'bank_code','')),'') is not null then
      select b.id into v_bank from public.banks b
       where b.tenant_id = v_tenant and b.code = btrim(p_fields->>'bank_code')
         and b.deleted_at is null;
    elsif nullif(btrim(coalesce(p_fields->>'bank_name','')),'') is not null then
      select b.id into v_bank from public.banks b
       where b.tenant_id = v_tenant
         and upper(b.name) = upper(btrim(p_fields->>'bank_name'))
         and b.deleted_at is null
       limit 1;
    end if;
  else
    v_bank := null;
  end if;

  v_narration := nullif(btrim(coalesce(p_fields->>'narration','')),'');

  select fy.id into v_fy from public.financial_years fy
   where fy.tenant_id = v_tenant and fy.deleted_at is null and fy.is_active
   order by case when fy.branch_id is not distinct from v_branch then 0 else 1 end,
            fy.from_date desc
   limit 1;

  if v_branch is null then
    select b.id into v_branch from public.branches b
     where b.tenant_id = v_tenant and b.deleted_at is null
     order by b.created_at limit 1;
  end if;

  if p_id is null then
    select formatted_no into v_no from app.allocate_document_no(
      v_tenant, 'RECEIPT', v_branch, v_fy, 6);
    insert into public.receipts (
      tenant_id, receipt_no, receipt_date, customer_id, branch_id, bank_id,
      mode, amount, narration, status, created_by, updated_by)
    values (
      v_tenant, v_no, v_date, v_customer, v_branch, v_bank,
      v_mode, v_amount, v_narration, 'DRAFT', auth.uid(), auth.uid())
    returning * into v_r;
  else
    update public.receipts set
      receipt_date = v_date,
      customer_id = v_customer,
      branch_id = v_branch,
      bank_id = v_bank,
      mode = v_mode,
      amount = v_amount,
      narration = v_narration,
      updated_by = auth.uid()
    where id = p_id and tenant_id = v_tenant and deleted_at is null
      and row_version = p_row_version
    returning * into v_r;
    if not found then
      raise exception 'This record was changed by someone else. Reload and try again.'
        using errcode = '40001';
    end if;
  end if;

  perform app.write_audit_log(
    p_tenant_id => v_tenant, p_entity_type => 'receipts',
    p_action => case when p_id is null then 'ADD' else 'MODIFY' end,
    p_entity_id => v_r.id, p_module_slug => 'txn.receipt-entry',
    p_new => jsonb_build_object(
      'receipt_no', v_r.receipt_no, 'amount', v_r.amount, 'status', v_r.status));

  return v_r;
end
$$;

revoke all on function public.save_receipt(uuid, integer, jsonb) from public;
grant execute on function public.save_receipt(uuid, integer, jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- post_receipt
-- ---------------------------------------------------------------------------
create or replace function public.post_receipt(
  p_id          uuid,
  p_row_version integer
)
returns public.receipts
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_r public.receipts;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not app.user_has_permission(v_tenant, 'txn.receipt-entry', 'modify') then
    raise exception 'Permission denied: txn.receipt-entry modify' using errcode = '42501';
  end if;

  select * into v_r from public.receipts
   where id = p_id and tenant_id = v_tenant and deleted_at is null;
  if not found then raise exception 'Receipt not found' using errcode = 'P0002'; end if;

  perform app.assert_status_transition('RECEIPT', v_r.status, 'POSTED');

  update public.receipts set
    status = 'POSTED',
    status_at = now(),
    posted_at = now(),
    posted_by = auth.uid(),
    updated_by = auth.uid()
  where id = p_id and tenant_id = v_tenant and deleted_at is null
    and row_version = p_row_version
  returning * into v_r;

  if not found then
    raise exception 'This record was changed by someone else. Reload and try again.'
      using errcode = '40001';
  end if;

  perform app.append_ledger_entry(
    v_tenant, v_r.customer_id, v_r.receipt_date, 'RECEIPT', v_r.id,
    0, v_r.amount, v_r.branch_id,
    coalesce(v_r.narration, format('Receipt %s', v_r.receipt_no)));

  perform app.write_audit_log(
    p_tenant_id => v_tenant, p_entity_type => 'receipts', p_action => 'MODIFY',
    p_entity_id => v_r.id, p_module_slug => 'txn.receipt-entry',
    p_new => jsonb_build_object('receipt_no', v_r.receipt_no, 'status', 'POSTED'));

  return v_r;
end
$$;

revoke all on function public.post_receipt(uuid, integer) from public;
grant execute on function public.post_receipt(uuid, integer)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- save_expense
-- ---------------------------------------------------------------------------
create or replace function public.save_expense(
  p_id          uuid default null,
  p_row_version integer default null,
  p_fields      jsonb default '{}'::jsonb
)
returns public.expense_entries
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_e public.expense_entries;
  v_kind text;
  v_date date;
  v_head uuid;
  v_head_code text;
  v_head_name text;
  v_mode text;
  v_bank uuid;
  v_branch uuid;
  v_ship uuid;
  v_awb text;
  v_desc text;
  v_amount numeric(14,2);
  v_file uuid;
  v_no text;
  v_fy uuid;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'p_fields must be a JSON object' using errcode = '22023';
  end if;

  if p_id is null then
    if not app.user_has_permission(v_tenant, 'txn.expense-entry', 'add') then
      raise exception 'Permission denied: txn.expense-entry add' using errcode = '42501';
    end if;
  else
    if not app.user_has_permission(v_tenant, 'txn.expense-entry', 'modify') then
      raise exception 'Permission denied: txn.expense-entry modify' using errcode = '42501';
    end if;
    select * into v_e from public.expense_entries
     where id = p_id and tenant_id = v_tenant and deleted_at is null;
    if not found then raise exception 'Expense not found' using errcode = 'P0002'; end if;
    if v_e.authorization_status <> 'UNAUTHORIZED' then
      raise exception 'Only UNAUTHORIZED expenses can be updated (is %)',
        v_e.authorization_status using errcode = 'CMS04';
    end if;
  end if;

  v_kind := upper(coalesce(nullif(btrim(p_fields->>'kind'),''), 'EXPENSE'));
  if v_kind not in ('EXPENSE','INCOME') then v_kind := 'EXPENSE'; end if;

  begin
    v_date := coalesce((p_fields->>'entry_date')::date, current_date);
  exception when others then
    raise exception 'Invalid entry_date' using errcode = '22023';
  end;

  begin
    v_amount := (p_fields->>'amount')::numeric;
  exception when others then
    raise exception 'Invalid amount' using errcode = '22023';
  end;
  if v_amount is null or v_amount <= 0 then
    raise exception 'Amount must be greater than zero' using errcode = 'CMS04';
  end if;

  v_mode := upper(coalesce(nullif(btrim(p_fields->>'mode'),''), 'CASH'));
  if v_mode not in ('CASH','BANK') then v_mode := 'CASH'; end if;

  v_head_code := nullif(btrim(coalesce(p_fields->>'expense_head_code','')),'');
  v_head_name := nullif(btrim(coalesce(p_fields->>'expense_head_name','')),'');
  if nullif(btrim(coalesce(p_fields->>'expense_head_id','')),'') is not null then
    v_head := (p_fields->>'expense_head_id')::uuid;
  elsif v_head_code is not null then
    select h.id, h.code, h.name into v_head, v_head_code, v_head_name
      from public.expense_heads h
     where h.tenant_id = v_tenant and h.code = v_head_code and h.deleted_at is null;
  end if;
  if v_head is null and v_head_name is null and v_head_code is null then
    raise exception 'Expense head is required' using errcode = 'CMS04';
  end if;
  if v_head is not null then
    select h.code, h.name into v_head_code, v_head_name
      from public.expense_heads h
     where h.id = v_head and h.tenant_id = v_tenant and h.deleted_at is null;
  end if;

  if v_mode = 'BANK' and nullif(btrim(coalesce(p_fields->>'bank_id','')),'') is not null then
    v_bank := (p_fields->>'bank_id')::uuid;
  elsif v_mode = 'BANK' and nullif(btrim(coalesce(p_fields->>'bank_code','')),'') is not null then
    select b.id into v_bank from public.banks b
     where b.tenant_id = v_tenant and b.code = btrim(p_fields->>'bank_code')
       and b.deleted_at is null;
  else
    v_bank := null;
  end if;

  if nullif(btrim(coalesce(p_fields->>'branch_id','')),'') is not null then
    v_branch := (p_fields->>'branch_id')::uuid;
  end if;

  v_awb := nullif(btrim(coalesce(p_fields->>'awb_no','')),'');
  if nullif(btrim(coalesce(p_fields->>'shipment_id','')),'') is not null then
    v_ship := (p_fields->>'shipment_id')::uuid;
  elsif v_awb is not null then
    select s.id into v_ship from public.shipments s
     where s.tenant_id = v_tenant and s.awb_no = v_awb and s.deleted_at is null;
  end if;

  v_desc := nullif(btrim(coalesce(p_fields->>'description','')),'');
  v_file := nullif(btrim(coalesce(p_fields->>'document_file_id','')),'')::uuid;

  select fy.id into v_fy from public.financial_years fy
   where fy.tenant_id = v_tenant and fy.deleted_at is null and fy.is_active
   order by case when fy.branch_id is not distinct from v_branch then 0 else 1 end,
            fy.from_date desc
   limit 1;

  if v_branch is null then
    select b.id into v_branch from public.branches b
     where b.tenant_id = v_tenant and b.deleted_at is null
     order by b.created_at limit 1;
  end if;

  if p_id is null then
    select formatted_no into v_no from app.allocate_document_no(
      v_tenant, 'EXPENSE', v_branch, v_fy, 6);
    insert into public.expense_entries (
      tenant_id, entry_no, kind, entry_date, expense_head_id, expense_head_code,
      expense_head_name, mode, bank_id, branch_id, shipment_id, awb_no,
      description, amount, document_file_id, authorization_status,
      created_by, updated_by)
    values (
      v_tenant, v_no, v_kind, v_date, v_head, v_head_code, v_head_name,
      v_mode, v_bank, v_branch, v_ship, v_awb, v_desc, v_amount, v_file,
      'UNAUTHORIZED', auth.uid(), auth.uid())
    returning * into v_e;
  else
    update public.expense_entries set
      kind = v_kind,
      entry_date = v_date,
      expense_head_id = v_head,
      expense_head_code = v_head_code,
      expense_head_name = v_head_name,
      mode = v_mode,
      bank_id = v_bank,
      branch_id = v_branch,
      shipment_id = v_ship,
      awb_no = v_awb,
      description = v_desc,
      amount = v_amount,
      document_file_id = v_file,
      updated_by = auth.uid()
    where id = p_id and tenant_id = v_tenant and deleted_at is null
      and row_version = p_row_version
    returning * into v_e;
    if not found then
      raise exception 'This record was changed by someone else. Reload and try again.'
        using errcode = '40001';
    end if;
  end if;

  perform app.write_audit_log(
    p_tenant_id => v_tenant, p_entity_type => 'expense_entries',
    p_action => case when p_id is null then 'ADD' else 'MODIFY' end,
    p_entity_id => v_e.id, p_module_slug => 'txn.expense-entry',
    p_new => jsonb_build_object(
      'entry_no', v_e.entry_no, 'amount', v_e.amount,
      'authorization_status', v_e.authorization_status));

  return v_e;
end
$$;

revoke all on function public.save_expense(uuid, integer, jsonb) from public;
grant execute on function public.save_expense(uuid, integer, jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- authorize_expense / reject_expense
-- ---------------------------------------------------------------------------
create or replace function public.authorize_expense(
  p_id          uuid,
  p_row_version integer
)
returns public.expense_entries
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_e public.expense_entries;
  v_customer uuid;
  v_debit numeric(14,2) := 0;
  v_credit numeric(14,2) := 0;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not app.user_has_permission(v_tenant, 'txn.expense-authorize', 'modify') then
    raise exception 'Permission denied: txn.expense-authorize' using errcode = '42501';
  end if;

  select * into v_e from public.expense_entries
   where id = p_id and tenant_id = v_tenant and deleted_at is null;
  if not found then raise exception 'Expense not found' using errcode = 'P0002'; end if;

  perform app.assert_status_transition('EXPENSE', v_e.authorization_status, 'AUTHORIZED');

  if v_e.created_by is not null and v_e.created_by = auth.uid() then
    raise exception 'Maker cannot authorize their own expense (maker ≠ checker)'
      using errcode = 'CMS04';
  end if;

  update public.expense_entries set
    authorization_status = 'AUTHORIZED',
    authorized_by = auth.uid(),
    authorized_at = now(),
    updated_by = auth.uid()
  where id = p_id and tenant_id = v_tenant and deleted_at is null
    and row_version = p_row_version
  returning * into v_e;

  if not found then
    raise exception 'This record was changed by someone else. Reload and try again.'
      using errcode = '40001';
  end if;

  if v_e.shipment_id is not null then
    select s.customer_id into v_customer from public.shipments s
     where s.id = v_e.shipment_id and s.tenant_id = v_tenant;
  end if;

  if v_e.kind = 'EXPENSE' then
    v_debit := v_e.amount;
  else
    v_credit := v_e.amount;
  end if;

  perform app.append_ledger_entry(
    v_tenant, v_customer, v_e.entry_date, 'EXPENSE', v_e.id,
    v_debit, v_credit, v_e.branch_id,
    coalesce(v_e.description, format('Expense %s', v_e.entry_no)));

  perform app.write_audit_log(
    p_tenant_id => v_tenant, p_entity_type => 'expense_entries', p_action => 'MODIFY',
    p_entity_id => v_e.id, p_module_slug => 'txn.expense-authorize',
    p_new => jsonb_build_object(
      'entry_no', v_e.entry_no, 'authorization_status', 'AUTHORIZED'));

  return v_e;
end
$$;

revoke all on function public.authorize_expense(uuid, integer) from public;
grant execute on function public.authorize_expense(uuid, integer)
  to authenticated, service_role;

create or replace function public.reject_expense(
  p_id          uuid,
  p_row_version integer,
  p_reason      text default null
)
returns public.expense_entries
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_e public.expense_entries;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not app.user_has_permission(v_tenant, 'txn.expense-authorize', 'modify') then
    raise exception 'Permission denied: txn.expense-authorize' using errcode = '42501';
  end if;

  select * into v_e from public.expense_entries
   where id = p_id and tenant_id = v_tenant and deleted_at is null;
  if not found then raise exception 'Expense not found' using errcode = 'P0002'; end if;

  perform app.assert_status_transition('EXPENSE', v_e.authorization_status, 'REJECTED');

  if v_e.created_by is not null and v_e.created_by = auth.uid() then
    raise exception 'Maker cannot reject their own expense (maker ≠ checker)'
      using errcode = 'CMS04';
  end if;

  update public.expense_entries set
    authorization_status = 'REJECTED',
    authorized_by = auth.uid(),
    authorized_at = now(),
    rejection_reason = nullif(btrim(coalesce(p_reason,'')),''),
    updated_by = auth.uid()
  where id = p_id and tenant_id = v_tenant and deleted_at is null
    and row_version = p_row_version
  returning * into v_e;

  if not found then
    raise exception 'This record was changed by someone else. Reload and try again.'
      using errcode = '40001';
  end if;

  perform app.write_audit_log(
    p_tenant_id => v_tenant, p_entity_type => 'expense_entries', p_action => 'MODIFY',
    p_entity_id => v_e.id, p_module_slug => 'txn.expense-authorize',
    p_new => jsonb_build_object(
      'entry_no', v_e.entry_no, 'authorization_status', 'REJECTED',
      'reason', v_e.rejection_reason));

  return v_e;
end
$$;

revoke all on function public.reject_expense(uuid, integer, text) from public;
grant execute on function public.reject_expense(uuid, integer, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- save_customer_payment
-- ---------------------------------------------------------------------------
create or replace function public.save_customer_payment(
  p_id          uuid default null,
  p_row_version integer default null,
  p_fields      jsonb default '{}'::jsonb
)
returns public.customer_payments
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_p public.customer_payments;
  v_customer uuid;
  v_declared date;
  v_paid date;
  v_amount numeric(14,2);
  v_remark text;
  v_file uuid;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'p_fields must be a JSON object' using errcode = '22023';
  end if;

  if p_id is null then
    if not app.user_has_permission(v_tenant, 'txn.customer-pay', 'add') then
      raise exception 'Permission denied: txn.customer-pay add' using errcode = '42501';
    end if;
  else
    if not app.user_has_permission(v_tenant, 'txn.customer-pay', 'modify') then
      raise exception 'Permission denied: txn.customer-pay modify' using errcode = '42501';
    end if;
    select * into v_p from public.customer_payments
     where id = p_id and tenant_id = v_tenant and deleted_at is null;
    if not found then raise exception 'Customer payment not found' using errcode = 'P0002'; end if;
    if v_p.status <> 'PENDING' then
      raise exception 'Only PENDING payments can be updated (is %)', v_p.status
        using errcode = 'CMS04';
    end if;
  end if;

  begin
    v_declared := coalesce((p_fields->>'declared_date')::date, current_date);
  exception when others then
    raise exception 'Invalid declared_date' using errcode = '22023';
  end;
  begin
    v_paid := nullif(btrim(coalesce(p_fields->>'paid_date','')),'')::date;
  exception when others then
    raise exception 'Invalid paid_date' using errcode = '22023';
  end;

  begin
    v_amount := (p_fields->>'amount')::numeric;
  exception when others then
    raise exception 'Invalid amount' using errcode = '22023';
  end;
  if v_amount is null or v_amount <= 0 then
    raise exception 'Amount must be greater than zero' using errcode = 'CMS04';
  end if;

  if nullif(btrim(coalesce(p_fields->>'customer_id','')),'') is not null then
    v_customer := (p_fields->>'customer_id')::uuid;
  elsif nullif(btrim(coalesce(p_fields->>'customer_code','')),'') is not null then
    select c.id into v_customer from public.customers c
     where c.tenant_id = v_tenant and c.code = btrim(p_fields->>'customer_code')
       and c.deleted_at is null;
  end if;
  if v_customer is null then
    raise exception 'Customer is required' using errcode = 'CMS04';
  end if;

  v_remark := nullif(btrim(coalesce(p_fields->>'remark','')),'');
  v_file := nullif(btrim(coalesce(p_fields->>'file_id','')),'')::uuid;

  if p_id is null then
    insert into public.customer_payments (
      tenant_id, customer_id, declared_date, paid_date, amount, remark, file_id,
      status, created_by, updated_by)
    values (
      v_tenant, v_customer, v_declared, v_paid, v_amount, v_remark, v_file,
      'PENDING', auth.uid(), auth.uid())
    returning * into v_p;
  else
    update public.customer_payments set
      customer_id = v_customer,
      declared_date = v_declared,
      paid_date = v_paid,
      amount = v_amount,
      remark = v_remark,
      file_id = v_file,
      updated_by = auth.uid()
    where id = p_id and tenant_id = v_tenant and deleted_at is null
      and row_version = p_row_version
    returning * into v_p;
    if not found then
      raise exception 'This record was changed by someone else. Reload and try again.'
        using errcode = '40001';
    end if;
  end if;

  perform app.write_audit_log(
    p_tenant_id => v_tenant, p_entity_type => 'customer_payments',
    p_action => case when p_id is null then 'ADD' else 'MODIFY' end,
    p_entity_id => v_p.id, p_module_slug => 'txn.customer-pay',
    p_new => jsonb_build_object('amount', v_p.amount, 'status', v_p.status));

  return v_p;
end
$$;

revoke all on function public.save_customer_payment(uuid, integer, jsonb) from public;
grant execute on function public.save_customer_payment(uuid, integer, jsonb)
  to authenticated, service_role;

create or replace function public.approve_customer_payment(
  p_id          uuid,
  p_row_version integer
)
returns public.customer_payments
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_p public.customer_payments;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not app.user_has_permission(v_tenant, 'txn.customer-pay', 'modify') then
    raise exception 'Permission denied: txn.customer-pay modify' using errcode = '42501';
  end if;

  select * into v_p from public.customer_payments
   where id = p_id and tenant_id = v_tenant and deleted_at is null;
  if not found then raise exception 'Customer payment not found' using errcode = 'P0002'; end if;

  perform app.assert_status_transition('CUSTOMER_PAYMENT', v_p.status, 'APPROVED');

  update public.customer_payments set
    status = 'APPROVED',
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_by = auth.uid()
  where id = p_id and tenant_id = v_tenant and deleted_at is null
    and row_version = p_row_version
  returning * into v_p;

  if not found then
    raise exception 'This record was changed by someone else. Reload and try again.'
      using errcode = '40001';
  end if;

  perform app.append_ledger_entry(
    v_tenant, v_p.customer_id, coalesce(v_p.paid_date, v_p.declared_date),
    'CUSTOMER_PAYMENT', v_p.id, 0, v_p.amount, null,
    coalesce(v_p.remark, 'Customer payment approved'));

  perform app.write_audit_log(
    p_tenant_id => v_tenant, p_entity_type => 'customer_payments', p_action => 'MODIFY',
    p_entity_id => v_p.id, p_module_slug => 'txn.customer-pay',
    p_new => jsonb_build_object('status', 'APPROVED', 'amount', v_p.amount));

  return v_p;
end
$$;

revoke all on function public.approve_customer_payment(uuid, integer) from public;
grant execute on function public.approve_customer_payment(uuid, integer)
  to authenticated, service_role;

create or replace function public.reject_customer_payment(
  p_id          uuid,
  p_row_version integer,
  p_reason      text default null
)
returns public.customer_payments
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_p public.customer_payments;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not app.user_has_permission(v_tenant, 'txn.customer-pay', 'modify') then
    raise exception 'Permission denied: txn.customer-pay modify' using errcode = '42501';
  end if;

  select * into v_p from public.customer_payments
   where id = p_id and tenant_id = v_tenant and deleted_at is null;
  if not found then raise exception 'Customer payment not found' using errcode = 'P0002'; end if;

  perform app.assert_status_transition('CUSTOMER_PAYMENT', v_p.status, 'REJECTED');

  update public.customer_payments set
    status = 'REJECTED',
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    rejection_reason = nullif(btrim(coalesce(p_reason,'')),''),
    updated_by = auth.uid()
  where id = p_id and tenant_id = v_tenant and deleted_at is null
    and row_version = p_row_version
  returning * into v_p;

  if not found then
    raise exception 'This record was changed by someone else. Reload and try again.'
      using errcode = '40001';
  end if;

  perform app.write_audit_log(
    p_tenant_id => v_tenant, p_entity_type => 'customer_payments', p_action => 'MODIFY',
    p_entity_id => v_p.id, p_module_slug => 'txn.customer-pay',
    p_new => jsonb_build_object('status', 'REJECTED', 'reason', v_p.rejection_reason));

  return v_p;
end
$$;

revoke all on function public.reject_customer_payment(uuid, integer, text) from public;
grant execute on function public.reject_customer_payment(uuid, integer, text)
  to authenticated, service_role;
