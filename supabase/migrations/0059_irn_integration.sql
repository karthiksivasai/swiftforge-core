-- ===========================================================================
-- 0059  irn integration — Phase 7 Milestone 7E
-- ---------------------------------------------------------------------------
-- E-Invoice / IRN for Invoice, Debit Note, Credit Note.
-- Sandbox/stub IRP only. NO live IRP HTTP, queues, workers, cron, GST reports.
-- Reuses: Phase 7A credentials, Phase 4G finance (ledger untouched),
--         doc.*/txn.* permissions, audit, files (QR payload text only).
-- ===========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Widen integration_providers for EINVOICE / GSP
-- ---------------------------------------------------------------------------
alter table public.integration_providers
  drop constraint if exists integration_providers_provider_type_check;

alter table public.integration_providers
  add constraint integration_providers_provider_type_check
  check (provider_type in ('CARRIER', 'EINVOICE'));

insert into public.integration_providers (
  provider_code, provider_name, provider_type, status,
  supports_booking, supports_tracking, supports_labels, supports_serviceability, sort_order
) values
  ('CLEARTAX',   'ClearTax GSP',  'EINVOICE', 'ACTIVE', false, false, false, false, 200),
  ('IRP_SANDBOX', 'IRP Sandbox',  'EINVOICE', 'ACTIVE', false, false, false, false, 210)
on conflict (provider_code) do update
  set provider_name = excluded.provider_name,
      provider_type = excluded.provider_type,
      status = excluded.status,
      supports_booking = excluded.supports_booking,
      supports_tracking = excluded.supports_tracking,
      supports_labels = excluded.supports_labels,
      supports_serviceability = excluded.supports_serviceability,
      sort_order = excluded.sort_order,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- Permission helper — reuse seeded doc.* / txn.* (no new RBAC concepts)
-- ---------------------------------------------------------------------------
create or replace function app.assert_irn_permission(
  p_tenant uuid,
  p_document_type text,
  p_action text
)
returns void
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_doc text := upper(coalesce(p_document_type, 'INVOICE'));
  v_act text := lower(coalesce(p_action, 'modify'));
  v_slug text;
begin
  if app.is_platform_admin() or app.is_tenant_admin(p_tenant) then
    return;
  end if;

  if v_act = 'test' then
    if app.user_has_permission(p_tenant, 'doc.invoice-irn-generation', 'add')
       or app.user_has_permission(p_tenant, 'doc.invoice-irn-generation', 'modify')
       or app.user_has_permission(p_tenant, 'mst.vendor-master', 'modify')
       or app.user_has_permission(p_tenant, 'mst.vendor-master', 'add') then
      return;
    end if;
    raise exception 'Permission denied: IRN test connection' using errcode = '42501';
  end if;

  if v_doc = 'INVOICE' then
    if v_act in ('cancel') then
      v_slug := 'doc.invoice-cancel-after-irn-generated';
    elsif v_act in ('generate', 'add', 'modify') then
      v_slug := 'doc.invoice-irn-generation';
    else
      v_slug := 'doc.invoice-irn-generation';
    end if;
  elsif v_doc = 'DEBIT_NOTE' then
    v_slug := 'txn.debit-note';
  elsif v_doc = 'CREDIT_NOTE' then
    v_slug := 'txn.credit-note';
  else
    raise exception 'Unsupported IRN document type: %', v_doc using errcode = 'CMS04';
  end if;

  if v_act in ('list', 'search', 'status', 'view') then
    if app.user_has_permission(p_tenant, v_slug, 'list')
       or app.user_has_permission(p_tenant, v_slug, 'search')
       or app.user_has_permission(p_tenant, v_slug, 'add')
       or app.user_has_permission(p_tenant, v_slug, 'modify') then
      return;
    end if;
  elsif v_act = 'cancel' and v_doc = 'INVOICE' then
    if app.user_has_permission(p_tenant, v_slug, 'add')
       or app.user_has_permission(p_tenant, v_slug, 'modify')
       or app.user_has_permission(p_tenant, v_slug, 'delete') then
      return;
    end if;
  else
    if app.user_has_permission(p_tenant, v_slug, 'add')
       or app.user_has_permission(p_tenant, v_slug, 'modify') then
      return;
    end if;
  end if;

  raise exception 'Permission denied: %', v_slug using errcode = '42501';
end
$$;

-- ---------------------------------------------------------------------------
-- Minimal finance document shells (IRN attachment only — no ledger/posting)
-- ---------------------------------------------------------------------------
create table if not exists public.invoices (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  invoice_no        text not null,
  invoice_date      date not null default current_date,
  customer_id       uuid,
  branch_id         uuid,
  register_type     text not null default 'B2B'
                      check (register_type in ('B2B','B2C','SEZWP','SEZWOP')),
  grand_total       numeric(14,2) not null default 0,
  status            text not null default 'FINALISED'
                      check (status in ('DRAFT','GENERATED','FINALISED','CANCELLED')),
  is_locked         boolean not null default true,
  irn               text,
  irn_status        text not null default 'PENDING'
                      check (irn_status in ('PENDING','GENERATED','CANCELLED')),
  irn_ack_no        text,
  irn_ack_date      timestamptz,
  irn_qr_payload    text,
  irn_payload       jsonb not null default '{}'::jsonb,
  irn_provider      text,
  irn_cancel_reason text,
  created_at        timestamptz not null default now(),
  created_by        uuid,
  updated_at        timestamptz not null default now(),
  updated_by        uuid,
  deleted_at        timestamptz,
  row_version       integer not null default 1,
  constraint invoices_tenant_id_uq unique (tenant_id, id),
  constraint invoices_customer_fk
    foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete set null
);
create unique index if not exists invoices_tenant_no_uq
  on public.invoices (tenant_id, invoice_no) where deleted_at is null;
create index if not exists invoices_tenant_irn_idx
  on public.invoices (tenant_id, irn_status, invoice_date desc)
  where deleted_at is null;

drop trigger if exists trg_touch_invoices on public.invoices;
create trigger trg_touch_invoices before insert or update on public.invoices
  for each row execute function app.tg_touch_row();

alter table public.invoices enable row level security;
drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());

create table if not exists public.debit_notes (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  note_no               text not null,
  note_date             date not null default current_date,
  customer_id           uuid,
  invoice_id            uuid,
  narration             text,
  gst_applies           boolean not null default true,
  register_type         text not null default 'B2B'
                          check (register_type in ('B2B','B2C','SEZWP','SEZWOP')),
  grand_total           numeric(14,2) not null default 0,
  approval_on_einvoice  boolean not null default false,
  status                text not null default 'POSTED'
                          check (status in ('DRAFT','POSTED','CANCELLED')),
  irn                   text,
  irn_status            text not null default 'PENDING'
                          check (irn_status in ('PENDING','GENERATED','CANCELLED')),
  irn_ack_no            text,
  irn_ack_date          timestamptz,
  irn_qr_payload        text,
  irn_payload           jsonb not null default '{}'::jsonb,
  irn_provider          text,
  irn_cancel_reason     text,
  created_at            timestamptz not null default now(),
  created_by            uuid,
  updated_at            timestamptz not null default now(),
  updated_by            uuid,
  deleted_at            timestamptz,
  row_version           integer not null default 1,
  constraint debit_notes_tenant_id_uq unique (tenant_id, id),
  constraint debit_notes_customer_fk
    foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete set null,
  constraint debit_notes_invoice_fk
    foreign key (tenant_id, invoice_id)
    references public.invoices (tenant_id, id) on delete set null
);
create unique index if not exists debit_notes_tenant_no_uq
  on public.debit_notes (tenant_id, note_no) where deleted_at is null;
create index if not exists debit_notes_tenant_irn_idx
  on public.debit_notes (tenant_id, irn_status, note_date desc)
  where deleted_at is null;

drop trigger if exists trg_touch_debit_notes on public.debit_notes;
create trigger trg_touch_debit_notes before insert or update on public.debit_notes
  for each row execute function app.tg_touch_row();

alter table public.debit_notes enable row level security;
drop policy if exists debit_notes_select on public.debit_notes;
create policy debit_notes_select on public.debit_notes
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());

create table if not exists public.credit_notes (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  note_no               text not null,
  note_date             date not null default current_date,
  customer_id           uuid,
  invoice_id            uuid,
  narration             text,
  gst_applies           boolean not null default true,
  register_type         text not null default 'B2B'
                          check (register_type in ('B2B','B2C','SEZWP','SEZWOP')),
  grand_total           numeric(14,2) not null default 0,
  approval_on_einvoice  boolean not null default false,
  status                text not null default 'POSTED'
                          check (status in ('DRAFT','POSTED','CANCELLED')),
  irn                   text,
  irn_status            text not null default 'PENDING'
                          check (irn_status in ('PENDING','GENERATED','CANCELLED')),
  irn_ack_no            text,
  irn_ack_date          timestamptz,
  irn_qr_payload        text,
  irn_payload           jsonb not null default '{}'::jsonb,
  irn_provider          text,
  irn_cancel_reason     text,
  created_at            timestamptz not null default now(),
  created_by            uuid,
  updated_at            timestamptz not null default now(),
  updated_by            uuid,
  deleted_at            timestamptz,
  row_version           integer not null default 1,
  constraint credit_notes_tenant_id_uq unique (tenant_id, id),
  constraint credit_notes_customer_fk
    foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete set null,
  constraint credit_notes_invoice_fk
    foreign key (tenant_id, invoice_id)
    references public.invoices (tenant_id, id) on delete set null
);
create unique index if not exists credit_notes_tenant_no_uq
  on public.credit_notes (tenant_id, note_no) where deleted_at is null;
create index if not exists credit_notes_tenant_irn_idx
  on public.credit_notes (tenant_id, irn_status, note_date desc)
  where deleted_at is null;

drop trigger if exists trg_touch_credit_notes on public.credit_notes;
create trigger trg_touch_credit_notes before insert or update on public.credit_notes
  for each row execute function app.tg_touch_row();

alter table public.credit_notes enable row level security;
drop policy if exists credit_notes_select on public.credit_notes;
create policy credit_notes_select on public.credit_notes
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());

-- ---------------------------------------------------------------------------
-- irn_logs — append-only IRN history (never overwrite)
-- ---------------------------------------------------------------------------
create table if not exists public.irn_logs (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  document_type     text not null
                      check (document_type in ('INVOICE','DEBIT_NOTE','CREDIT_NOTE')),
  document_id       uuid not null,
  document_no       text,
  operation         text not null
                      check (operation in ('GENERATE','CANCEL','STATUS','TEST')),
  irn_number        text,
  ack_number        text,
  ack_date          timestamptz,
  qr_payload        text,
  status            text not null
                      check (status in ('PENDING','GENERATED','CANCELLED','SUCCESS','FAILURE')),
  cancel_reason     text,
  provider          text not null default 'SANDBOX',
  request_body      jsonb not null default '{}'::jsonb,
  response_body     jsonb not null default '{}'::jsonb,
  latency_ms        integer,
  error_message     text,
  created_at        timestamptz not null default now(),
  created_by        uuid
);
create index if not exists irn_logs_tenant_idx
  on public.irn_logs (tenant_id, created_at desc);
create index if not exists irn_logs_document_idx
  on public.irn_logs (tenant_id, document_type, document_id, created_at desc);

create or replace function app.tg_irn_logs_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'irn_logs is append-only' using errcode = '42501';
end
$$;

drop trigger if exists trg_irn_logs_no_upd on public.irn_logs;
create trigger trg_irn_logs_no_upd
  before update or delete on public.irn_logs
  for each row execute function app.tg_irn_logs_append_only();

alter table public.irn_logs enable row level security;
drop policy if exists irn_logs_select on public.irn_logs;
create policy irn_logs_select on public.irn_logs
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());
drop policy if exists irn_logs_insert on public.irn_logs;
create policy irn_logs_insert on public.irn_logs
  for insert with check (tenant_id in (select app.user_tenant_ids()));

create or replace function app.log_irn_event(
  p_tenant uuid,
  p_document_type text,
  p_document_id uuid,
  p_document_no text,
  p_operation text,
  p_irn_number text,
  p_ack_number text,
  p_ack_date timestamptz,
  p_qr_payload text,
  p_status text,
  p_cancel_reason text,
  p_provider text,
  p_request jsonb,
  p_response jsonb,
  p_latency_ms integer,
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
  insert into public.irn_logs (
    tenant_id, document_type, document_id, document_no, operation,
    irn_number, ack_number, ack_date, qr_payload, status, cancel_reason,
    provider, request_body, response_body, latency_ms, error_message, created_by)
  values (
    p_tenant, upper(p_document_type), p_document_id, p_document_no, upper(p_operation),
    p_irn_number, p_ack_number, p_ack_date, p_qr_payload, upper(p_status), p_cancel_reason,
    coalesce(nullif(p_provider, ''), 'SANDBOX'),
    coalesce(p_request, '{}'::jsonb), coalesce(p_response, '{}'::jsonb),
    p_latency_ms, p_error, auth.uid())
  returning id into v_id;
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------
-- Credential + sandbox helpers
-- ---------------------------------------------------------------------------
create or replace function app.resolve_irn_credential_id(p_tenant uuid)
returns uuid
language sql
stable
security definer
set search_path = public, app
as $$
  select c.id
    from public.integration_credentials c
    join public.integration_providers p on p.id = c.provider_id
   where c.tenant_id = p_tenant
     and c.deleted_at is null
     and c.is_active
     and p.provider_type = 'EINVOICE'
     and p.status = 'ACTIVE'
   order by c.sandbox_mode desc, c.updated_at desc
   limit 1;
$$;

create or replace function app.sandbox_generate_irn(
  p_document_type text,
  p_document_no text,
  p_gstin text,
  p_grand_total numeric
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_seed text := upper(p_document_type) || '|' || coalesce(p_document_no, '') || '|' || coalesce(p_gstin, 'NOGSTIN');
  v_hash text := upper(substr(md5(v_seed), 1, 16));
  v_irn text := 'SANDBOX-IRN-' || v_hash;
  v_ack text := 'ACK-' || upper(substr(md5(v_seed || '|ack'), 1, 12));
  v_qr text;
begin
  v_qr := 'IRN:' || v_irn || '|DOC:' || coalesce(p_document_no, '') || '|GSTIN:'
       || coalesce(p_gstin, '') || '|AMT:' || coalesce(p_grand_total, 0)::text;
  return jsonb_build_object(
    'ok', true,
    'provider', 'SANDBOX',
    'irn', v_irn,
    'ack_no', v_ack,
    'ack_date', to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'qr_payload', v_qr,
    'status', 'GENERATED',
    'document_type', upper(p_document_type),
    'document_no', p_document_no
  );
end
$$;

create or replace function app.sandbox_cancel_irn(
  p_irn text,
  p_reason text
)
returns jsonb
language plpgsql
immutable
as $$
begin
  return jsonb_build_object(
    'ok', true,
    'provider', 'SANDBOX',
    'irn', p_irn,
    'status', 'CANCELLED',
    'cancel_reason', coalesce(nullif(btrim(p_reason), ''), 'Cancelled'),
    'cancelled_at', to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
end
$$;

create or replace function app.einvoice_document_public_json(
  p_document_type text,
  p_id uuid,
  p_no text,
  p_date date,
  p_customer_id uuid,
  p_grand_total numeric,
  p_register_type text,
  p_status text,
  p_irn text,
  p_irn_status text,
  p_irn_ack_no text,
  p_irn_ack_date timestamptz,
  p_irn_qr_payload text,
  p_irn_payload jsonb,
  p_irn_provider text,
  p_irn_cancel_reason text,
  p_row_version integer,
  p_extra jsonb default '{}'::jsonb
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', p_id,
    'document_type', upper(p_document_type),
    'document_no', p_no,
    'document_date', p_date,
    'customer_id', p_customer_id,
    'grand_total', p_grand_total,
    'register_type', p_register_type,
    'status', p_status,
    'irn', p_irn,
    'irn_status', p_irn_status,
    'irn_ack_no', p_irn_ack_no,
    'irn_ack_date', p_irn_ack_date,
    'irn_qr_payload', p_irn_qr_payload,
    'irn_payload', coalesce(p_irn_payload, '{}'::jsonb),
    'irn_provider', p_irn_provider,
    'irn_cancel_reason', p_irn_cancel_reason,
    'row_version', p_row_version
  ) || coalesce(p_extra, '{}'::jsonb);
$$;

-- ---------------------------------------------------------------------------
-- save_einvoice_document — minimal shell for IRN attachment (no posting)
-- ---------------------------------------------------------------------------
create or replace function public.save_einvoice_document(p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_type text := upper(coalesce(p_fields->>'document_type', ''));
  v_no text := nullif(btrim(coalesce(p_fields->>'document_no', '')), '');
  v_date date := coalesce((p_fields->>'document_date')::date, current_date);
  v_customer uuid := nullif(p_fields->>'customer_id', '')::uuid;
  v_total numeric := coalesce((p_fields->>'grand_total')::numeric, 0);
  v_reg text := upper(coalesce(nullif(p_fields->>'register_type', ''), 'B2B'));
  v_id uuid;
  v_row_version int;
  v_json jsonb;
begin
  if v_type not in ('INVOICE','DEBIT_NOTE','CREDIT_NOTE') then
    raise exception 'document_type must be INVOICE, DEBIT_NOTE, or CREDIT_NOTE'
      using errcode = 'CMS04';
  end if;
  if v_no is null then
    raise exception 'document_no is required' using errcode = 'CMS04';
  end if;
  if v_reg not in ('B2B','B2C','SEZWP','SEZWOP') then
    raise exception 'Invalid register_type' using errcode = 'CMS04';
  end if;

  perform app.assert_irn_permission(v_tenant, v_type, 'generate');

  if v_type = 'INVOICE' then
    insert into public.invoices (
      tenant_id, invoice_no, invoice_date, customer_id, register_type, grand_total,
      status, is_locked, irn_status, created_by, updated_by)
    values (
      v_tenant, v_no, v_date, v_customer, v_reg, v_total,
      'FINALISED', true, 'PENDING', auth.uid(), auth.uid())
    on conflict (tenant_id, invoice_no) where deleted_at is null do update
      set invoice_date = excluded.invoice_date,
          customer_id = coalesce(excluded.customer_id, public.invoices.customer_id),
          register_type = excluded.register_type,
          grand_total = excluded.grand_total,
          updated_by = auth.uid(),
          row_version = public.invoices.row_version + 1
    returning id, row_version into v_id, v_row_version;

    select app.einvoice_document_public_json(
      'INVOICE', i.id, i.invoice_no, i.invoice_date, i.customer_id, i.grand_total,
      i.register_type, i.status, i.irn, i.irn_status, i.irn_ack_no, i.irn_ack_date,
      i.irn_qr_payload, i.irn_payload, i.irn_provider, i.irn_cancel_reason, i.row_version,
      '{}'::jsonb)
      into v_json
      from public.invoices i where i.id = v_id;

  elsif v_type = 'DEBIT_NOTE' then
    insert into public.debit_notes (
      tenant_id, note_no, note_date, customer_id, register_type, grand_total,
      narration, gst_applies, approval_on_einvoice, status, irn_status,
      created_by, updated_by)
    values (
      v_tenant, v_no, v_date, v_customer, v_reg, v_total,
      p_fields->>'narration', coalesce((p_fields->>'gst_applies')::boolean, true),
      coalesce((p_fields->>'approval_on_einvoice')::boolean, false),
      'POSTED', 'PENDING', auth.uid(), auth.uid())
    on conflict (tenant_id, note_no) where deleted_at is null do update
      set note_date = excluded.note_date,
          customer_id = coalesce(excluded.customer_id, public.debit_notes.customer_id),
          register_type = excluded.register_type,
          grand_total = excluded.grand_total,
          narration = coalesce(excluded.narration, public.debit_notes.narration),
          updated_by = auth.uid(),
          row_version = public.debit_notes.row_version + 1
    returning id, row_version into v_id, v_row_version;

    select app.einvoice_document_public_json(
      'DEBIT_NOTE', d.id, d.note_no, d.note_date, d.customer_id, d.grand_total,
      d.register_type, d.status, d.irn, d.irn_status, d.irn_ack_no, d.irn_ack_date,
      d.irn_qr_payload, d.irn_payload, d.irn_provider, d.irn_cancel_reason, d.row_version,
      jsonb_build_object('approval_on_einvoice', d.approval_on_einvoice))
      into v_json
      from public.debit_notes d where d.id = v_id;

  else
    insert into public.credit_notes (
      tenant_id, note_no, note_date, customer_id, register_type, grand_total,
      narration, gst_applies, approval_on_einvoice, status, irn_status,
      created_by, updated_by)
    values (
      v_tenant, v_no, v_date, v_customer, v_reg, v_total,
      p_fields->>'narration', coalesce((p_fields->>'gst_applies')::boolean, true),
      coalesce((p_fields->>'approval_on_einvoice')::boolean, false),
      'POSTED', 'PENDING', auth.uid(), auth.uid())
    on conflict (tenant_id, note_no) where deleted_at is null do update
      set note_date = excluded.note_date,
          customer_id = coalesce(excluded.customer_id, public.credit_notes.customer_id),
          register_type = excluded.register_type,
          grand_total = excluded.grand_total,
          narration = coalesce(excluded.narration, public.credit_notes.narration),
          updated_by = auth.uid(),
          row_version = public.credit_notes.row_version + 1
    returning id, row_version into v_id, v_row_version;

    select app.einvoice_document_public_json(
      'CREDIT_NOTE', c.id, c.note_no, c.note_date, c.customer_id, c.grand_total,
      c.register_type, c.status, c.irn, c.irn_status, c.irn_ack_no, c.irn_ack_date,
      c.irn_qr_payload, c.irn_payload, c.irn_provider, c.irn_cancel_reason, c.row_version,
      jsonb_build_object('approval_on_einvoice', c.approval_on_einvoice))
      into v_json
      from public.credit_notes c where c.id = v_id;
  end if;

  perform app.write_audit_log(
    v_tenant, lower(v_type), 'ADD', v_id,
    case v_type
      when 'INVOICE' then 'doc.invoice-irn-generation'
      when 'DEBIT_NOTE' then 'txn.debit-note'
      else 'txn.credit-note'
    end,
    null, jsonb_build_object('document_no', v_no, 'irn_shell', true));

  return v_json;
end
$$;

revoke all on function public.save_einvoice_document(jsonb) from public;
grant execute on function public.save_einvoice_document(jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- list_einvoice_documents
-- ---------------------------------------------------------------------------
create or replace function public.list_einvoice_documents(
  p_document_type text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_type text := nullif(upper(btrim(coalesce(p_document_type, ''))), '');
  v_lim int := greatest(1, least(coalesce(p_limit, 50), 200));
  v_rows jsonb := '[]'::jsonb;
begin
  if v_type is null then
    perform app.assert_irn_permission(v_tenant, 'INVOICE', 'list');
  else
    perform app.assert_irn_permission(v_tenant, v_type, 'list');
  end if;

  if v_type is null or v_type = 'INVOICE' then
    select coalesce(jsonb_agg(app.einvoice_document_public_json(
      'INVOICE', i.id, i.invoice_no, i.invoice_date, i.customer_id, i.grand_total,
      i.register_type, i.status, i.irn, i.irn_status, i.irn_ack_no, i.irn_ack_date,
      i.irn_qr_payload, i.irn_payload, i.irn_provider, i.irn_cancel_reason, i.row_version,
      '{}'::jsonb) order by i.invoice_date desc, i.created_at desc), '[]'::jsonb)
      into v_rows
      from (
        select * from public.invoices
         where tenant_id = v_tenant and deleted_at is null
         order by invoice_date desc, created_at desc
         limit v_lim
      ) i;
    if v_type = 'INVOICE' then
      return jsonb_build_object('rows', v_rows);
    end if;
  end if;

  if v_type = 'DEBIT_NOTE' then
    select coalesce(jsonb_agg(app.einvoice_document_public_json(
      'DEBIT_NOTE', d.id, d.note_no, d.note_date, d.customer_id, d.grand_total,
      d.register_type, d.status, d.irn, d.irn_status, d.irn_ack_no, d.irn_ack_date,
      d.irn_qr_payload, d.irn_payload, d.irn_provider, d.irn_cancel_reason, d.row_version,
      jsonb_build_object('approval_on_einvoice', d.approval_on_einvoice))
      order by d.note_date desc, d.created_at desc), '[]'::jsonb)
      into v_rows
      from (
        select * from public.debit_notes
         where tenant_id = v_tenant and deleted_at is null
         order by note_date desc, created_at desc
         limit v_lim
      ) d;
    return jsonb_build_object('rows', v_rows);
  end if;

  if v_type = 'CREDIT_NOTE' then
    select coalesce(jsonb_agg(app.einvoice_document_public_json(
      'CREDIT_NOTE', c.id, c.note_no, c.note_date, c.customer_id, c.grand_total,
      c.register_type, c.status, c.irn, c.irn_status, c.irn_ack_no, c.irn_ack_date,
      c.irn_qr_payload, c.irn_payload, c.irn_provider, c.irn_cancel_reason, c.row_version,
      jsonb_build_object('approval_on_einvoice', c.approval_on_einvoice))
      order by c.note_date desc, c.created_at desc), '[]'::jsonb)
      into v_rows
      from (
        select * from public.credit_notes
         where tenant_id = v_tenant and deleted_at is null
         order by note_date desc, created_at desc
         limit v_lim
      ) c;
    return jsonb_build_object('rows', v_rows);
  end if;

  -- All types when p_document_type is null — invoices already in v_rows
  return jsonb_build_object('rows', coalesce(v_rows, '[]'::jsonb));
end
$$;

revoke all on function public.list_einvoice_documents(text, integer) from public;
grant execute on function public.list_einvoice_documents(text, integer)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- test_irn_connection
-- ---------------------------------------------------------------------------
create or replace function public.test_irn_connection(
  p_credential_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_cred public.integration_credentials;
  v_prov public.integration_providers;
  v_t0 timestamptz := clock_timestamp();
  v_latency int;
  v_log uuid;
  v_gstin text := '';
  v_sandbox boolean := true;
  v_has_pwd boolean := false;
  v_has_secret boolean := false;
  v_has_key boolean := false;
  v_cred_id uuid;
  v_code text := 'SANDBOX';
begin
  perform app.assert_irn_permission(v_tenant, 'INVOICE', 'test');

  if p_credential_id is not null then
    select c.* into v_cred
      from public.integration_credentials c
     where c.id = p_credential_id
       and c.tenant_id = v_tenant
       and c.deleted_at is null;
    if not found then
      raise exception 'IRN credentials not found' using errcode = 'P0002';
    end if;
    select p.* into v_prov
      from public.integration_providers p
     where p.id = v_cred.provider_id;
    if v_prov.provider_type <> 'EINVOICE' then
      raise exception 'Credential is not an EINVOICE provider' using errcode = 'CMS04';
    end if;
  else
    select c.* into v_cred
      from public.integration_credentials c
     where c.id = app.resolve_irn_credential_id(v_tenant);
    if found then
      select p.* into v_prov
        from public.integration_providers p
       where p.id = v_cred.provider_id;
    end if;
  end if;

  if v_cred.id is not null then
    v_cred_id := v_cred.id;
    v_gstin := coalesce(v_cred.account_number, '');
    v_sandbox := coalesce(v_cred.sandbox_mode, true);
    v_has_pwd := v_cred.password_enc is not null;
    v_has_secret := v_cred.api_secret_enc is not null;
    v_has_key := v_cred.api_key_enc is not null;
    v_code := coalesce(v_prov.provider_code, 'SANDBOX');
  else
    select p.* into v_prov
      from public.integration_providers p
     where p.provider_code = 'IRP_SANDBOX'
     limit 1;
    v_code := coalesce(v_prov.provider_code, 'IRP_SANDBOX');
    v_cred_id := '00000000-0000-4000-8000-000000000000'::uuid;
  end if;

  v_latency := greatest(1, (extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int);

  v_log := app.log_irn_event(
    v_tenant, 'INVOICE', v_cred_id,
    null, 'TEST', null, null, null, null, 'SUCCESS', null,
    v_code,
    jsonb_build_object(
      'credential_id', case when v_cred.id is null then null else v_cred.id end,
      'has_password', v_has_pwd,
      'has_api_secret', v_has_secret,
      'gstin_present', v_gstin <> '',
      'sandbox_mode', v_sandbox
    ),
    jsonb_build_object(
      'ok', true,
      'status', 'CONNECTED',
      'provider', v_code,
      'mode', case when v_sandbox then 'SANDBOX' else 'PRODUCTION' end,
      'message', 'Sandbox IRP connection OK (no live HTTP)'
    ),
    v_latency, null);

  perform app.write_audit_log(
    v_tenant, 'irn_logs', 'ACCESS', v_log, 'doc.invoice-irn-generation',
    null, jsonb_build_object('operation', 'TEST', 'provider', v_code));

  return jsonb_build_object(
    'ok', true,
    'status', 'CONNECTED',
    'provider', v_code,
    'sandbox_mode', v_sandbox,
    'gstin_configured', v_gstin <> '',
    'has_client_id', v_has_key,
    'has_client_secret', v_has_secret,
    'has_password', v_has_pwd,
    'latency_ms', v_latency,
    'log_id', v_log,
    'message', 'Sandbox IRP connection OK (no live HTTP)'
  );
end
$$;

revoke all on function public.test_irn_connection(uuid) from public;
grant execute on function public.test_irn_connection(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- generate_irn
-- ---------------------------------------------------------------------------
create or replace function public.generate_irn(
  p_document_type text,
  p_document_id uuid,
  p_row_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_type text := upper(coalesce(p_document_type, ''));
  v_cred public.integration_credentials;
  v_prov public.integration_providers;
  v_provider text := 'SANDBOX';
  v_gstin text := '';
  v_t0 timestamptz := clock_timestamp();
  v_latency int;
  v_result jsonb;
  v_log uuid;
  v_no text;
  v_date date;
  v_customer uuid;
  v_total numeric;
  v_reg text;
  v_status text;
  v_irn text;
  v_irn_status text;
  v_rv int;
  v_json jsonb;
  v_req jsonb;
begin
  if v_type not in ('INVOICE','DEBIT_NOTE','CREDIT_NOTE') then
    raise exception 'Unsupported document type' using errcode = 'CMS04';
  end if;
  if p_document_id is null then
    raise exception 'document_id is required' using errcode = 'CMS04';
  end if;

  perform app.assert_irn_permission(v_tenant, v_type, 'generate');

  select c.* into v_cred
    from public.integration_credentials c
   where c.id = app.resolve_irn_credential_id(v_tenant);
  if found then
    select p.* into v_prov
      from public.integration_providers p
     where p.id = v_cred.provider_id;
    v_provider := coalesce(v_prov.provider_code, 'SANDBOX');
    v_gstin := coalesce(v_cred.account_number, '');
  end if;

  if v_type = 'INVOICE' then
    select invoice_no, invoice_date, customer_id, grand_total, register_type, status,
           irn, irn_status, row_version
      into v_no, v_date, v_customer, v_total, v_reg, v_status, v_irn, v_irn_status, v_rv
      from public.invoices
     where id = p_document_id and tenant_id = v_tenant and deleted_at is null
     for update;
    if not found then
      raise exception 'Invoice not found' using errcode = 'P0002';
    end if;
  elsif v_type = 'DEBIT_NOTE' then
    select note_no, note_date, customer_id, grand_total, register_type, status,
           irn, irn_status, row_version
      into v_no, v_date, v_customer, v_total, v_reg, v_status, v_irn, v_irn_status, v_rv
      from public.debit_notes
     where id = p_document_id and tenant_id = v_tenant and deleted_at is null
     for update;
    if not found then
      raise exception 'Debit note not found' using errcode = 'P0002';
    end if;
  else
    select note_no, note_date, customer_id, grand_total, register_type, status,
           irn, irn_status, row_version
      into v_no, v_date, v_customer, v_total, v_reg, v_status, v_irn, v_irn_status, v_rv
      from public.credit_notes
     where id = p_document_id and tenant_id = v_tenant and deleted_at is null
     for update;
    if not found then
      raise exception 'Credit note not found' using errcode = 'P0002';
    end if;
  end if;

  if p_row_version is not null and v_rv <> p_row_version then
    raise exception 'Optimistic lock conflict' using errcode = 'CMS04';
  end if;

  if v_irn_status = 'GENERATED' and coalesce(v_irn, '') <> '' then
    raise exception 'IRN already generated for this document' using errcode = 'CMS04';
  end if;

  if v_type = 'INVOICE' and v_status = 'CANCELLED' then
    raise exception 'Cannot generate IRN for cancelled invoice' using errcode = 'CMS04';
  end if;
  if v_type <> 'INVOICE' and v_status = 'CANCELLED' then
    raise exception 'Cannot generate IRN for cancelled note' using errcode = 'CMS04';
  end if;

  v_req := jsonb_build_object(
    'document_type', v_type,
    'document_id', p_document_id,
    'document_no', v_no,
    'register_type', v_reg,
    'grand_total', v_total,
    'gstin', case when v_gstin = '' then null else '***' end,
    'sandbox', true
  );

  v_result := app.sandbox_generate_irn(v_type, v_no, v_gstin, v_total);
  v_latency := greatest(1, (extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int);

  if v_type = 'INVOICE' then
    update public.invoices set
      irn = v_result->>'irn',
      irn_status = 'GENERATED',
      irn_ack_no = v_result->>'ack_no',
      irn_ack_date = (v_result->>'ack_date')::timestamptz,
      irn_qr_payload = v_result->>'qr_payload',
      irn_payload = v_result,
      irn_provider = v_provider,
      irn_cancel_reason = null,
      updated_by = auth.uid(),
      row_version = row_version + 1
    where id = p_document_id and tenant_id = v_tenant
    returning row_version into v_rv;

    select app.einvoice_document_public_json(
      'INVOICE', i.id, i.invoice_no, i.invoice_date, i.customer_id, i.grand_total,
      i.register_type, i.status, i.irn, i.irn_status, i.irn_ack_no, i.irn_ack_date,
      i.irn_qr_payload, i.irn_payload, i.irn_provider, i.irn_cancel_reason, i.row_version,
      '{}'::jsonb)
      into v_json from public.invoices i where i.id = p_document_id;

  elsif v_type = 'DEBIT_NOTE' then
    update public.debit_notes set
      irn = v_result->>'irn',
      irn_status = 'GENERATED',
      irn_ack_no = v_result->>'ack_no',
      irn_ack_date = (v_result->>'ack_date')::timestamptz,
      irn_qr_payload = v_result->>'qr_payload',
      irn_payload = v_result,
      irn_provider = v_provider,
      irn_cancel_reason = null,
      updated_by = auth.uid(),
      row_version = row_version + 1
    where id = p_document_id and tenant_id = v_tenant
    returning row_version into v_rv;

    select app.einvoice_document_public_json(
      'DEBIT_NOTE', d.id, d.note_no, d.note_date, d.customer_id, d.grand_total,
      d.register_type, d.status, d.irn, d.irn_status, d.irn_ack_no, d.irn_ack_date,
      d.irn_qr_payload, d.irn_payload, d.irn_provider, d.irn_cancel_reason, d.row_version,
      jsonb_build_object('approval_on_einvoice', d.approval_on_einvoice))
      into v_json from public.debit_notes d where d.id = p_document_id;

  else
    update public.credit_notes set
      irn = v_result->>'irn',
      irn_status = 'GENERATED',
      irn_ack_no = v_result->>'ack_no',
      irn_ack_date = (v_result->>'ack_date')::timestamptz,
      irn_qr_payload = v_result->>'qr_payload',
      irn_payload = v_result,
      irn_provider = v_provider,
      irn_cancel_reason = null,
      updated_by = auth.uid(),
      row_version = row_version + 1
    where id = p_document_id and tenant_id = v_tenant
    returning row_version into v_rv;

    select app.einvoice_document_public_json(
      'CREDIT_NOTE', c.id, c.note_no, c.note_date, c.customer_id, c.grand_total,
      c.register_type, c.status, c.irn, c.irn_status, c.irn_ack_no, c.irn_ack_date,
      c.irn_qr_payload, c.irn_payload, c.irn_provider, c.irn_cancel_reason, c.row_version,
      jsonb_build_object('approval_on_einvoice', c.approval_on_einvoice))
      into v_json from public.credit_notes c where c.id = p_document_id;
  end if;

  v_log := app.log_irn_event(
    v_tenant, v_type, p_document_id, v_no, 'GENERATE',
    v_result->>'irn', v_result->>'ack_no', (v_result->>'ack_date')::timestamptz,
    v_result->>'qr_payload', 'GENERATED', null, v_provider,
    v_req, v_result, v_latency, null);

  perform app.write_audit_log(
    v_tenant, lower(v_type), 'MODIFY', p_document_id,
    case v_type
      when 'INVOICE' then 'doc.invoice-irn-generation'
      when 'DEBIT_NOTE' then 'txn.debit-note'
      else 'txn.credit-note'
    end,
    null, jsonb_build_object(
      'irn_generate', true,
      'irn', v_result->>'irn',
      'provider', v_provider));

  return jsonb_build_object(
    'ok', true,
    'log_id', v_log,
    'latency_ms', v_latency,
    'provider', v_provider,
    'document', v_json,
    'result', v_result
  );
end
$$;

revoke all on function public.generate_irn(text, uuid, integer) from public;
grant execute on function public.generate_irn(text, uuid, integer)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- cancel_irn
-- ---------------------------------------------------------------------------
create or replace function public.cancel_irn(
  p_document_type text,
  p_document_id uuid,
  p_reason text,
  p_row_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_type text := upper(coalesce(p_document_type, ''));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_provider text := 'SANDBOX';
  v_cred public.integration_credentials;
  v_prov public.integration_providers;
  v_t0 timestamptz := clock_timestamp();
  v_latency int;
  v_result jsonb;
  v_log uuid;
  v_no text;
  v_irn text;
  v_irn_status text;
  v_rv int;
  v_json jsonb;
  v_req jsonb;
begin
  if v_type not in ('INVOICE','DEBIT_NOTE','CREDIT_NOTE') then
    raise exception 'Unsupported document type' using errcode = 'CMS04';
  end if;
  if v_reason is null then
    raise exception 'Cancellation reason is required' using errcode = 'CMS04';
  end if;

  perform app.assert_irn_permission(v_tenant, v_type, 'cancel');

  select c.* into v_cred
    from public.integration_credentials c
   where c.id = app.resolve_irn_credential_id(v_tenant);
  if found then
    select p.* into v_prov
      from public.integration_providers p
     where p.id = v_cred.provider_id;
    v_provider := coalesce(v_prov.provider_code, 'SANDBOX');
  end if;

  if v_type = 'INVOICE' then
    select invoice_no, irn, irn_status, row_version, coalesce(nullif(irn_provider, ''), v_provider)
      into v_no, v_irn, v_irn_status, v_rv, v_provider
      from public.invoices
     where id = p_document_id and tenant_id = v_tenant and deleted_at is null
     for update;
  elsif v_type = 'DEBIT_NOTE' then
    select note_no, irn, irn_status, row_version, coalesce(nullif(irn_provider, ''), v_provider)
      into v_no, v_irn, v_irn_status, v_rv, v_provider
      from public.debit_notes
     where id = p_document_id and tenant_id = v_tenant and deleted_at is null
     for update;
  else
    select note_no, irn, irn_status, row_version, coalesce(nullif(irn_provider, ''), v_provider)
      into v_no, v_irn, v_irn_status, v_rv, v_provider
      from public.credit_notes
     where id = p_document_id and tenant_id = v_tenant and deleted_at is null
     for update;
  end if;

  if not found then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
  if p_row_version is not null and v_rv <> p_row_version then
    raise exception 'Optimistic lock conflict' using errcode = 'CMS04';
  end if;
  if v_irn_status <> 'GENERATED' or coalesce(v_irn, '') = '' then
    raise exception 'No generated IRN to cancel' using errcode = 'CMS04';
  end if;

  v_req := jsonb_build_object(
    'document_type', v_type,
    'document_id', p_document_id,
    'irn', v_irn,
    'reason', v_reason
  );
  v_result := app.sandbox_cancel_irn(v_irn, v_reason);
  v_latency := greatest(1, (extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int);

  if v_type = 'INVOICE' then
    update public.invoices set
      irn_status = 'CANCELLED',
      irn_cancel_reason = v_reason,
      irn_payload = coalesce(irn_payload, '{}'::jsonb) || jsonb_build_object('cancel', v_result),
      updated_by = auth.uid(),
      row_version = row_version + 1
    where id = p_document_id and tenant_id = v_tenant;

    select app.einvoice_document_public_json(
      'INVOICE', i.id, i.invoice_no, i.invoice_date, i.customer_id, i.grand_total,
      i.register_type, i.status, i.irn, i.irn_status, i.irn_ack_no, i.irn_ack_date,
      i.irn_qr_payload, i.irn_payload, i.irn_provider, i.irn_cancel_reason, i.row_version,
      '{}'::jsonb)
      into v_json from public.invoices i where i.id = p_document_id;

  elsif v_type = 'DEBIT_NOTE' then
    update public.debit_notes set
      irn_status = 'CANCELLED',
      irn_cancel_reason = v_reason,
      irn_payload = coalesce(irn_payload, '{}'::jsonb) || jsonb_build_object('cancel', v_result),
      updated_by = auth.uid(),
      row_version = row_version + 1
    where id = p_document_id and tenant_id = v_tenant;

    select app.einvoice_document_public_json(
      'DEBIT_NOTE', d.id, d.note_no, d.note_date, d.customer_id, d.grand_total,
      d.register_type, d.status, d.irn, d.irn_status, d.irn_ack_no, d.irn_ack_date,
      d.irn_qr_payload, d.irn_payload, d.irn_provider, d.irn_cancel_reason, d.row_version,
      jsonb_build_object('approval_on_einvoice', d.approval_on_einvoice))
      into v_json from public.debit_notes d where d.id = p_document_id;

  else
    update public.credit_notes set
      irn_status = 'CANCELLED',
      irn_cancel_reason = v_reason,
      irn_payload = coalesce(irn_payload, '{}'::jsonb) || jsonb_build_object('cancel', v_result),
      updated_by = auth.uid(),
      row_version = row_version + 1
    where id = p_document_id and tenant_id = v_tenant;

    select app.einvoice_document_public_json(
      'CREDIT_NOTE', c.id, c.note_no, c.note_date, c.customer_id, c.grand_total,
      c.register_type, c.status, c.irn, c.irn_status, c.irn_ack_no, c.irn_ack_date,
      c.irn_qr_payload, c.irn_payload, c.irn_provider, c.irn_cancel_reason, c.row_version,
      jsonb_build_object('approval_on_einvoice', c.approval_on_einvoice))
      into v_json from public.credit_notes c where c.id = p_document_id;
  end if;

  v_log := app.log_irn_event(
    v_tenant, v_type, p_document_id, v_no, 'CANCEL',
    v_irn, null, null, null, 'CANCELLED', v_reason, v_provider,
    v_req, v_result, v_latency, null);

  perform app.write_audit_log(
    v_tenant, lower(v_type), 'MODIFY', p_document_id,
    case v_type
      when 'INVOICE' then 'doc.invoice-cancel-after-irn-generated'
      when 'DEBIT_NOTE' then 'txn.debit-note'
      else 'txn.credit-note'
    end,
    null, jsonb_build_object(
      'irn_cancel', true,
      'irn', v_irn,
      'reason', v_reason));

  return jsonb_build_object(
    'ok', true,
    'log_id', v_log,
    'latency_ms', v_latency,
    'provider', v_provider,
    'document', v_json,
    'result', v_result
  );
end
$$;

revoke all on function public.cancel_irn(text, uuid, text, integer) from public;
grant execute on function public.cancel_irn(text, uuid, text, integer)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- get_irn_status
-- ---------------------------------------------------------------------------
create or replace function public.get_irn_status(
  p_document_type text,
  p_document_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_type text := upper(coalesce(p_document_type, ''));
  v_json jsonb;
  v_logs jsonb;
  v_t0 timestamptz := clock_timestamp();
  v_latency int;
  v_log uuid;
  v_no text;
  v_irn text;
  v_status text;
begin
  if v_type not in ('INVOICE','DEBIT_NOTE','CREDIT_NOTE') then
    raise exception 'Unsupported document type' using errcode = 'CMS04';
  end if;

  perform app.assert_irn_permission(v_tenant, v_type, 'status');

  if v_type = 'INVOICE' then
    select app.einvoice_document_public_json(
      'INVOICE', i.id, i.invoice_no, i.invoice_date, i.customer_id, i.grand_total,
      i.register_type, i.status, i.irn, i.irn_status, i.irn_ack_no, i.irn_ack_date,
      i.irn_qr_payload, i.irn_payload, i.irn_provider, i.irn_cancel_reason, i.row_version,
      '{}'::jsonb), i.invoice_no, i.irn, i.irn_status
      into v_json, v_no, v_irn, v_status
      from public.invoices i
     where i.id = p_document_id and i.tenant_id = v_tenant and i.deleted_at is null;
  elsif v_type = 'DEBIT_NOTE' then
    select app.einvoice_document_public_json(
      'DEBIT_NOTE', d.id, d.note_no, d.note_date, d.customer_id, d.grand_total,
      d.register_type, d.status, d.irn, d.irn_status, d.irn_ack_no, d.irn_ack_date,
      d.irn_qr_payload, d.irn_payload, d.irn_provider, d.irn_cancel_reason, d.row_version,
      jsonb_build_object('approval_on_einvoice', d.approval_on_einvoice)),
      d.note_no, d.irn, d.irn_status
      into v_json, v_no, v_irn, v_status
      from public.debit_notes d
     where d.id = p_document_id and d.tenant_id = v_tenant and d.deleted_at is null;
  else
    select app.einvoice_document_public_json(
      'CREDIT_NOTE', c.id, c.note_no, c.note_date, c.customer_id, c.grand_total,
      c.register_type, c.status, c.irn, c.irn_status, c.irn_ack_no, c.irn_ack_date,
      c.irn_qr_payload, c.irn_payload, c.irn_provider, c.irn_cancel_reason, c.row_version,
      jsonb_build_object('approval_on_einvoice', c.approval_on_einvoice)),
      c.note_no, c.irn, c.irn_status
      into v_json, v_no, v_irn, v_status
      from public.credit_notes c
     where c.id = p_document_id and c.tenant_id = v_tenant and c.deleted_at is null;
  end if;

  if v_json is null then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id,
      'operation', l.operation,
      'irn_number', l.irn_number,
      'ack_number', l.ack_number,
      'ack_date', l.ack_date,
      'qr_payload', l.qr_payload,
      'status', l.status,
      'cancel_reason', l.cancel_reason,
      'provider', l.provider,
      'request_body', l.request_body,
      'response_body', l.response_body,
      'latency_ms', l.latency_ms,
      'created_at', l.created_at
    ) order by l.created_at desc), '[]'::jsonb)
    into v_logs
    from public.irn_logs l
   where l.tenant_id = v_tenant
     and l.document_type = v_type
     and l.document_id = p_document_id;

  v_latency := greatest(1, (extract(epoch from (clock_timestamp() - v_t0)) * 1000)::int);
  v_log := app.log_irn_event(
    v_tenant, v_type, p_document_id, v_no, 'STATUS',
    v_irn, null, null, null, coalesce(v_status, 'PENDING'), null,
    coalesce(v_json->>'irn_provider', 'SANDBOX'),
    jsonb_build_object('document_id', p_document_id),
    jsonb_build_object('irn_status', v_status, 'irn', v_irn),
    v_latency, null);

  return jsonb_build_object(
    'ok', true,
    'document', v_json,
    'logs', v_logs,
    'status_log_id', v_log
  );
end
$$;

revoke all on function public.get_irn_status(text, uuid) from public;
grant execute on function public.get_irn_status(text, uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- list_irn_logs / get_irn_provider_status
-- ---------------------------------------------------------------------------
create or replace function public.list_irn_logs(
  p_document_type text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_type text := nullif(upper(btrim(coalesce(p_document_type, ''))), '');
  v_lim int := greatest(1, least(coalesce(p_limit, 50), 200));
  v_rows jsonb;
begin
  perform app.assert_irn_permission(v_tenant, coalesce(v_type, 'INVOICE'), 'list');

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id,
      'document_type', l.document_type,
      'document_id', l.document_id,
      'document_no', l.document_no,
      'operation', l.operation,
      'irn_number', l.irn_number,
      'ack_number', l.ack_number,
      'ack_date', l.ack_date,
      'qr_payload', l.qr_payload,
      'status', l.status,
      'cancel_reason', l.cancel_reason,
      'provider', l.provider,
      'request_body', l.request_body,
      'response_body', l.response_body,
      'latency_ms', l.latency_ms,
      'error_message', l.error_message,
      'created_at', l.created_at
    ) order by l.created_at desc), '[]'::jsonb)
    into v_rows
    from (
      select * from public.irn_logs
       where tenant_id = v_tenant
         and (v_type is null or document_type = v_type)
       order by created_at desc
       limit v_lim
    ) l;

  return jsonb_build_object('rows', v_rows);
end
$$;

revoke all on function public.list_irn_logs(text, integer) from public;
grant execute on function public.list_irn_logs(text, integer)
  to authenticated, service_role;

create or replace function public.get_irn_provider_status()
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_cred public.integration_credentials;
  v_prov public.integration_providers;
begin
  perform app.assert_irn_permission(v_tenant, 'INVOICE', 'list');

  select c.* into v_cred
    from public.integration_credentials c
   where c.id = app.resolve_irn_credential_id(v_tenant);
  if found then
    select p.* into v_prov
      from public.integration_providers p
     where p.id = v_cred.provider_id;
  end if;

  return jsonb_build_object(
    'provider', coalesce(v_prov.provider_code, 'SANDBOX'),
    'provider_name', coalesce(v_prov.provider_name, 'Sandbox IRP'),
    'configured', v_cred.id is not null,
    'sandbox_mode', coalesce(v_cred.sandbox_mode, true),
    'gstin_configured', coalesce(v_cred.account_number, '') <> '',
    'has_username', coalesce(v_cred.username, '') <> '',
    'has_client_id', v_cred.api_key_enc is not null,
    'has_client_secret', v_cred.api_secret_enc is not null,
    'has_password', v_cred.password_enc is not null,
    'live_http', false,
    'supported_documents', jsonb_build_array('INVOICE','DEBIT_NOTE','CREDIT_NOTE'),
    'lifecycle', jsonb_build_array('PENDING','GENERATED','CANCELLED')
  );
end
$$;

revoke all on function public.get_irn_provider_status() from public;
grant execute on function public.get_irn_provider_status()
  to authenticated, service_role;

comment on table public.irn_logs is
  'Append-only IRN history (7E). Never update/delete.';
comment on function public.generate_irn(text, uuid, integer) is
  'Sandbox IRN generate for Invoice/Debit/Credit Note. No live IRP HTTP.';
comment on function public.cancel_irn(text, uuid, text, integer) is
  'Sandbox IRN cancel. Requires reason. No live IRP HTTP.';
