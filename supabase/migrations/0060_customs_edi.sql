-- ===========================================================================
-- 0060  customs edi — Phase 7 Milestone 7F
-- ---------------------------------------------------------------------------
-- CSB-III / CSB-IV / CSB-V export from existing shipment + manifest data.
-- Sandbox/stub only. NO live Customs API, queues, workers, cron, submission.
-- Reuses: 7A credentials, files table, rpt.edi-csb-files / txn.bagging, audit.
-- Lifecycle: DRAFT → GENERATED → DOWNLOADED
-- ===========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Widen integration_providers for CUSTOMS
-- ---------------------------------------------------------------------------
alter table public.integration_providers
  drop constraint if exists integration_providers_provider_type_check;

alter table public.integration_providers
  add constraint integration_providers_provider_type_check
  check (provider_type in ('CARRIER', 'EINVOICE', 'CUSTOMS'));

insert into public.integration_providers (
  provider_code, provider_name, provider_type, status,
  supports_booking, supports_tracking, supports_labels, supports_serviceability, sort_order
) values
  ('CUSTOMS_EDI',     'Customs EDI',      'CUSTOMS', 'ACTIVE', false, false, false, false, 300),
  ('ICEGATE_SANDBOX', 'ICEGATE Sandbox',  'CUSTOMS', 'ACTIVE', false, false, false, false, 310)
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
-- Permission helper — reuse seeded rpt.edi-csb-files / txn.bagging
-- ---------------------------------------------------------------------------
create or replace function app.assert_customs_edi_permission(
  p_tenant uuid,
  p_action text
)
returns void
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_act text := lower(coalesce(p_action, 'modify'));
begin
  if app.is_platform_admin() or app.is_tenant_admin(p_tenant) then
    return;
  end if;

  if v_act in ('list', 'search', 'view', 'download') then
    if app.user_has_permission(p_tenant, 'rpt.edi-csb-files', 'list')
       or app.user_has_permission(p_tenant, 'rpt.edi-csb-files', 'search')
       or app.user_has_permission(p_tenant, 'rpt.edi-csb-files', 'add')
       or app.user_has_permission(p_tenant, 'txn.bagging', 'list')
       or app.user_has_permission(p_tenant, 'txn.bagging', 'search')
       or app.user_has_permission(p_tenant, 'txn.bagging', 'add') then
      return;
    end if;
  elsif v_act = 'test' then
    if app.user_has_permission(p_tenant, 'rpt.edi-csb-files', 'add')
       or app.user_has_permission(p_tenant, 'rpt.edi-csb-files', 'modify')
       or app.user_has_permission(p_tenant, 'mst.vendor-master', 'modify')
       or app.user_has_permission(p_tenant, 'txn.bagging', 'add') then
      return;
    end if;
  else
    if app.user_has_permission(p_tenant, 'rpt.edi-csb-files', 'add')
       or app.user_has_permission(p_tenant, 'rpt.edi-csb-files', 'modify')
       or app.user_has_permission(p_tenant, 'txn.bagging', 'add')
       or app.user_has_permission(p_tenant, 'txn.bagging', 'modify') then
      return;
    end if;
  end if;

  raise exception 'Permission denied: rpt.edi-csb-files' using errcode = '42501';
end
$$;

create or replace function app.resolve_customs_credential_id(p_tenant uuid)
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
     and p.provider_type = 'CUSTOMS'
     and p.status = 'ACTIVE'
   order by c.sandbox_mode desc, c.updated_at desc
   limit 1;
$$;

-- ---------------------------------------------------------------------------
-- csb_exports — export jobs (status transitions; file via public.files)
-- ---------------------------------------------------------------------------
create table if not exists public.csb_exports (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  export_type          text not null
                         check (export_type in ('CSB_III','CSB_IV','CSB_V')),
  file_name            text not null,
  status               text not null default 'DRAFT'
                         check (status in ('DRAFT','GENERATED','DOWNLOADED')),
  manifest_id          uuid,
  provider             text not null default 'SANDBOX',
  sandbox_mode         boolean not null default true,
  cha_code             text,
  iec                  text,
  branch_code          text,
  port_code            text,
  validation_summary   jsonb not null default '{}'::jsonb,
  line_count           integer not null default 0,
  content_text         text,
  file_id              uuid,
  download_count       integer not null default 0 check (download_count >= 0),
  generated_at         timestamptz,
  generated_by         uuid,
  downloaded_at        timestamptz,
  created_at           timestamptz not null default now(),
  created_by           uuid,
  updated_at           timestamptz not null default now(),
  updated_by           uuid,
  row_version          integer not null default 1,
  constraint csb_exports_tenant_id_uq unique (tenant_id, id),
  constraint csb_exports_manifest_fk
    foreign key (tenant_id, manifest_id)
    references public.manifests (tenant_id, id) on delete set null,
  constraint csb_exports_file_fk
    foreign key (file_id) references public.files (id) on delete set null
);
create index if not exists csb_exports_tenant_idx
  on public.csb_exports (tenant_id, created_at desc);
create index if not exists csb_exports_type_idx
  on public.csb_exports (tenant_id, export_type, created_at desc);

drop trigger if exists trg_touch_csb_exports on public.csb_exports;
create trigger trg_touch_csb_exports before insert or update on public.csb_exports
  for each row execute function app.tg_touch_row();

alter table public.csb_exports enable row level security;
drop policy if exists csb_exports_select on public.csb_exports;
create policy csb_exports_select on public.csb_exports
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());

-- ---------------------------------------------------------------------------
-- csb_export_logs — append-only history
-- ---------------------------------------------------------------------------
create table if not exists public.csb_export_logs (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  export_id            uuid,
  export_type          text not null
                         check (export_type in ('CSB_III','CSB_IV','CSB_V','TEST')),
  operation            text not null
                         check (operation in ('VALIDATE','GENERATE','DOWNLOAD','TEST')),
  file_name            text,
  status               text not null,
  validation_summary   jsonb not null default '{}'::jsonb,
  download_count       integer,
  provider             text not null default 'SANDBOX',
  request_body         jsonb not null default '{}'::jsonb,
  response_body        jsonb not null default '{}'::jsonb,
  error_message        text,
  created_at           timestamptz not null default now(),
  created_by           uuid,
  constraint csb_export_logs_export_fk
    foreign key (tenant_id, export_id)
    references public.csb_exports (tenant_id, id) on delete set null
);
create index if not exists csb_export_logs_tenant_idx
  on public.csb_export_logs (tenant_id, created_at desc);
create index if not exists csb_export_logs_export_idx
  on public.csb_export_logs (tenant_id, export_id, created_at desc);

create or replace function app.tg_csb_export_logs_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'csb_export_logs is append-only' using errcode = '42501';
end
$$;

drop trigger if exists trg_csb_export_logs_no_upd on public.csb_export_logs;
create trigger trg_csb_export_logs_no_upd
  before update or delete on public.csb_export_logs
  for each row execute function app.tg_csb_export_logs_append_only();

alter table public.csb_export_logs enable row level security;
drop policy if exists csb_export_logs_select on public.csb_export_logs;
create policy csb_export_logs_select on public.csb_export_logs
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());
drop policy if exists csb_export_logs_insert on public.csb_export_logs;
create policy csb_export_logs_insert on public.csb_export_logs
  for insert with check (tenant_id in (select app.user_tenant_ids()));

create or replace function app.log_csb_export_event(
  p_tenant uuid,
  p_export_id uuid,
  p_export_type text,
  p_operation text,
  p_file_name text,
  p_status text,
  p_validation jsonb,
  p_download_count integer,
  p_provider text,
  p_request jsonb,
  p_response jsonb,
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
  insert into public.csb_export_logs (
    tenant_id, export_id, export_type, operation, file_name, status,
    validation_summary, download_count, provider, request_body, response_body,
    error_message, created_by)
  values (
    p_tenant, p_export_id, upper(p_export_type), upper(p_operation), p_file_name, upper(p_status),
    coalesce(p_validation, '{}'::jsonb), p_download_count,
    coalesce(nullif(p_provider, ''), 'SANDBOX'),
    coalesce(p_request, '{}'::jsonb), coalesce(p_response, '{}'::jsonb),
    p_error, auth.uid())
  returning id into v_id;
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------
-- Normalize export type
-- ---------------------------------------------------------------------------
create or replace function app.normalize_csb_export_type(p_type text)
returns text
language plpgsql
immutable
as $$
declare
  v text := upper(replace(replace(coalesce(p_type, ''), '-', '_'), ' ', '_'));
begin
  if v in ('CSB3','CSBIII','CSB_3') then v := 'CSB_III'; end if;
  if v in ('CSB4','CSBIV','CSB_4') then v := 'CSB_IV'; end if;
  if v in ('CSB5','CSBV','CSB_5') then v := 'CSB_V'; end if;
  if v not in ('CSB_III','CSB_IV','CSB_V') then
    return null;
  end if;
  return v;
end
$$;

-- ---------------------------------------------------------------------------
-- Build CSB stub content from manifest + lines + shipments (no new fields)
-- ---------------------------------------------------------------------------
create or replace function app.build_csb_export_content(
  p_tenant uuid,
  p_export_type text,
  p_manifest public.manifests,
  p_cha text,
  p_iec text,
  p_branch text,
  p_port text
)
returns table (
  content text,
  line_count integer,
  errors jsonb,
  warnings jsonb
)
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_lines text := '';
  v_cnt int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_rec record;
  v_header text;
  v_hs text;
  v_val text;
  v_curr text;
begin
  if p_manifest.id is null then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'MANIFEST_REQUIRED', 'message', 'Manifest is required for CSB export'));
    return query select ''::text, 0, v_errors, v_warnings;
    return;
  end if;

  if coalesce(p_manifest.master_awb_no, '') = '' then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'code', 'MAWB_MISSING', 'message', 'Master AWB is empty on manifest'));
  end if;

  if coalesce(p_cha, '') = '' then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'CHA_REQUIRED', 'message', 'CHA Code is required (Customs credentials)'));
  end if;
  if coalesce(p_iec, '') = '' then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'IEC_REQUIRED', 'message', 'IEC is required (Customs credentials)'));
  end if;

  v_header := format(
    'H|%s|%s|%s|%s|%s|%s|%s|%s|%s',
    p_export_type,
    coalesce(p_manifest.manifest_no, ''),
    coalesce(p_manifest.master_awb_no, ''),
    coalesce(p_cha, ''),
    coalesce(p_iec, ''),
    coalesce(p_branch, ''),
    coalesce(p_port, ''),
    coalesce(p_manifest.flight, p_manifest.flight1, ''),
    to_char(coalesce(p_manifest.manifest_date, current_date), 'YYYYMMDD')
  );
  v_lines := v_header || E'\n';

  for v_rec in
    select
      ml.awb_no,
      ml.bag_no,
      ml.pieces,
      ml.charge_weight,
      coalesce(ml.destination_code, d.code) as destination_code,
      coalesce(ml.destination_name, d.name) as destination_name,
      coalesce(ml.consignee_name, s.consignee->>'name') as consignee_name,
      ml.customer_code,
      s.shipment_value,
      s.currency,
      s.wizard_extras,
      s.shipper,
      s.consignee
    from public.manifest_lines ml
    left join public.shipments s
      on s.id = ml.shipment_id and s.tenant_id = ml.tenant_id and s.deleted_at is null
    left join public.destinations d
      on d.id = s.destination_id and d.tenant_id = s.tenant_id and d.deleted_at is null
   where ml.tenant_id = p_tenant
     and ml.manifest_id = p_manifest.id
     and ml.deleted_at is null
   order by ml.bag_no nulls last, ml.awb_no
  loop
    if coalesce(v_rec.awb_no, '') = '' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'AWB_REQUIRED', 'message', 'Manifest line missing AWB'));
      continue;
    end if;
    if coalesce(v_rec.destination_code, v_rec.destination_name, '') = '' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'code', 'DEST_REQUIRED', 'message', format('Destination missing for AWB %s', v_rec.awb_no)));
    end if;
    if coalesce(v_rec.charge_weight, 0) <= 0 then
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
        'code', 'WEIGHT_MISSING', 'message', format('Charge weight missing for AWB %s', v_rec.awb_no)));
    end if;

    v_hs := coalesce(
      v_rec.wizard_extras #>> '{proforma,lines,0,hsCode}',
      v_rec.wizard_extras #>> '{proforma,lines,0,hsn}',
      '');
    v_val := coalesce(v_rec.shipment_value::text, '0');
    v_curr := coalesce(v_rec.currency, 'INR');

    if p_export_type = 'CSB_V' and v_hs = '' then
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
        'code', 'HSN_MISSING', 'message', format('HSN missing in proforma for AWB %s', v_rec.awb_no)));
    end if;

    v_cnt := v_cnt + 1;
    v_lines := v_lines || format(
      'L|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s',
      v_cnt,
      coalesce(v_rec.awb_no, ''),
      coalesce(v_rec.bag_no, ''),
      coalesce(v_rec.pieces::text, '0'),
      coalesce(v_rec.charge_weight::text, '0'),
      coalesce(v_rec.destination_code, ''),
      coalesce(v_rec.consignee_name, ''),
      v_hs,
      v_val,
      v_curr,
      coalesce(v_rec.shipper->>'iec_no', '')
    ) || E'\n';
  end loop;

  if v_cnt = 0 then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'code', 'NO_LINES', 'message', 'Manifest has no exportable AWB lines'));
  end if;

  v_lines := v_lines || format('T|%s|%s|SANDBOX', v_cnt, p_export_type) || E'\n';

  return query select v_lines, v_cnt, v_errors, v_warnings;
end
$$;

create or replace function app.csb_export_public_json(p_row public.csb_exports)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', p_row.id,
    'export_type', p_row.export_type,
    'file_name', p_row.file_name,
    'status', p_row.status,
    'manifest_id', p_row.manifest_id,
    'provider', p_row.provider,
    'sandbox_mode', p_row.sandbox_mode,
    'cha_code', p_row.cha_code,
    'iec', p_row.iec,
    'branch_code', p_row.branch_code,
    'port_code', p_row.port_code,
    'validation_summary', p_row.validation_summary,
    'line_count', p_row.line_count,
    'file_id', p_row.file_id,
    'download_count', p_row.download_count,
    'generated_at', p_row.generated_at,
    'generated_by', p_row.generated_by,
    'downloaded_at', p_row.downloaded_at,
    'created_at', p_row.created_at,
    'row_version', p_row.row_version,
    'has_content', coalesce(p_row.content_text, '') <> ''
  );
$$;

-- ---------------------------------------------------------------------------
-- test_customs_connection
-- ---------------------------------------------------------------------------
create or replace function public.test_customs_connection(
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
  v_code text := 'SANDBOX';
  v_log uuid;
  v_cha text := '';
  v_iec text := '';
  v_branch text := '';
  v_port text := '';
  v_dir text := '';
  v_sandbox boolean := true;
begin
  perform app.assert_customs_edi_permission(v_tenant, 'test');

  if p_credential_id is not null then
    select c.* into v_cred from public.integration_credentials c
     where c.id = p_credential_id and c.tenant_id = v_tenant and c.deleted_at is null;
    if not found then
      raise exception 'Customs credentials not found' using errcode = 'P0002';
    end if;
  else
    select c.* into v_cred from public.integration_credentials c
     where c.id = app.resolve_customs_credential_id(v_tenant);
  end if;

  if v_cred.id is not null then
    select p.* into v_prov from public.integration_providers p where p.id = v_cred.provider_id;
    if v_prov.provider_type <> 'CUSTOMS' then
      raise exception 'Credential is not a CUSTOMS provider' using errcode = 'CMS04';
    end if;
    v_code := coalesce(v_prov.provider_code, 'SANDBOX');
    v_cha := coalesce(v_cred.username, '');
    v_iec := coalesce(v_cred.account_number, '');
    v_dir := coalesce(v_cred.endpoint, '');
    v_sandbox := coalesce(v_cred.sandbox_mode, true);
    v_branch := coalesce(v_cred.remark, '');
    -- branch/port may be encoded in remark as branch=X;port=Y
    if v_cred.remark ~* 'branch=' then
      v_branch := substring(v_cred.remark from 'branch=([^;]+)');
    end if;
    if v_cred.remark ~* 'port=' then
      v_port := substring(v_cred.remark from 'port=([^;]+)');
    end if;
  else
    select p.* into v_prov from public.integration_providers p
     where p.provider_code = 'ICEGATE_SANDBOX' limit 1;
    v_code := coalesce(v_prov.provider_code, 'ICEGATE_SANDBOX');
  end if;

  v_log := app.log_csb_export_event(
    v_tenant, null, 'TEST', 'TEST', null, 'SUCCESS',
    jsonb_build_object(
      'cha_configured', v_cha <> '',
      'iec_configured', v_iec <> '',
      'export_directory_configured', v_dir <> '',
      'sandbox_mode', v_sandbox
    ),
    null, v_code,
    jsonb_build_object('credential_id', v_cred.id),
    jsonb_build_object(
      'ok', true,
      'status', 'CONNECTED',
      'message', 'Sandbox Customs EDI connection OK (no live HTTP)'
    ),
    null);

  perform app.write_audit_log(
    v_tenant, 'csb_export_logs', 'ACCESS', v_log, 'rpt.edi-csb-files',
    null, jsonb_build_object('operation', 'TEST', 'provider', v_code));

  return jsonb_build_object(
    'ok', true,
    'status', 'CONNECTED',
    'provider', v_code,
    'sandbox_mode', v_sandbox,
    'cha_configured', v_cha <> '',
    'iec_configured', v_iec <> '',
    'branch_configured', coalesce(v_branch, '') <> '',
    'port_configured', coalesce(v_port, '') <> '',
    'export_directory_configured', v_dir <> '',
    'has_password', v_cred.password_enc is not null,
    'live_http', false,
    'log_id', v_log,
    'message', 'Sandbox Customs EDI connection OK (no live HTTP)'
  );
end
$$;

revoke all on function public.test_customs_connection(uuid) from public;
grant execute on function public.test_customs_connection(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- validate_csb_export
-- ---------------------------------------------------------------------------
create or replace function public.validate_csb_export(p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_type text := app.normalize_csb_export_type(p_fields->>'export_type');
  v_manifest_id uuid := nullif(p_fields->>'manifest_id', '')::uuid;
  v_m public.manifests;
  v_cred public.integration_credentials;
  v_cha text := coalesce(nullif(p_fields->>'cha_code', ''), '');
  v_iec text := coalesce(nullif(p_fields->>'iec', ''), '');
  v_branch text := coalesce(nullif(p_fields->>'branch_code', ''), '');
  v_port text := coalesce(nullif(p_fields->>'port_code', ''), '');
  v_built record;
  v_ok boolean;
  v_log uuid;
begin
  perform app.assert_customs_edi_permission(v_tenant, 'view');

  if v_type is null then
    return jsonb_build_object(
      'ok', false,
      'export_type', p_fields->>'export_type',
      'errors', jsonb_build_array(jsonb_build_object(
        'code', 'TYPE_INVALID',
        'message', 'export_type must be CSB_III, CSB_IV, or CSB_V')),
      'warnings', '[]'::jsonb,
      'line_count', 0
    );
  end if;

  select c.* into v_cred from public.integration_credentials c
   where c.id = app.resolve_customs_credential_id(v_tenant);
  if v_cred.id is not null then
    if v_cha = '' then v_cha := coalesce(v_cred.username, ''); end if;
    if v_iec = '' then v_iec := coalesce(v_cred.account_number, ''); end if;
    if v_branch = '' and v_cred.remark ~* 'branch=' then
      v_branch := substring(v_cred.remark from 'branch=([^;]+)');
    end if;
    if v_port = '' and v_cred.remark ~* 'port=' then
      v_port := substring(v_cred.remark from 'port=([^;]+)');
    end if;
  end if;

  if v_manifest_id is null then
    return jsonb_build_object(
      'ok', false,
      'export_type', v_type,
      'errors', jsonb_build_array(jsonb_build_object(
        'code', 'MANIFEST_REQUIRED', 'message', 'manifest_id is required')),
      'warnings', '[]'::jsonb,
      'line_count', 0
    );
  end if;

  select * into v_m from public.manifests
   where id = v_manifest_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'Manifest not found' using errcode = 'P0002';
  end if;

  select * into v_built
    from app.build_csb_export_content(v_tenant, v_type, v_m, v_cha, v_iec, v_branch, v_port);

  v_ok := jsonb_array_length(v_built.errors) = 0;

  v_log := app.log_csb_export_event(
    v_tenant, null, v_type, 'VALIDATE', null,
    case when v_ok then 'SUCCESS' else 'FAILURE' end,
    jsonb_build_object('errors', v_built.errors, 'warnings', v_built.warnings, 'line_count', v_built.line_count),
    null, 'SANDBOX',
    jsonb_build_object('manifest_id', v_manifest_id, 'export_type', v_type),
    jsonb_build_object('ok', v_ok),
    case when v_ok then null else 'Validation failed' end);

  return jsonb_build_object(
    'ok', v_ok,
    'export_type', v_type,
    'manifest_id', v_manifest_id,
    'manifest_no', v_m.manifest_no,
    'line_count', v_built.line_count,
    'errors', v_built.errors,
    'warnings', v_built.warnings,
    'log_id', v_log
  );
end
$$;

revoke all on function public.validate_csb_export(jsonb) from public;
grant execute on function public.validate_csb_export(jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- generate_csb_export
-- ---------------------------------------------------------------------------
create or replace function public.generate_csb_export(p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_type text := app.normalize_csb_export_type(p_fields->>'export_type');
  v_manifest_id uuid := nullif(p_fields->>'manifest_id', '')::uuid;
  v_m public.manifests;
  v_cred public.integration_credentials;
  v_prov public.integration_providers;
  v_provider text := 'SANDBOX';
  v_cha text := coalesce(nullif(p_fields->>'cha_code', ''), '');
  v_iec text := coalesce(nullif(p_fields->>'iec', ''), '');
  v_branch text := coalesce(nullif(p_fields->>'branch_code', ''), '');
  v_port text := coalesce(nullif(p_fields->>'port_code', ''), '');
  v_sandbox boolean := true;
  v_built record;
  v_file_name text;
  v_file_id uuid;
  v_export public.csb_exports;
  v_log uuid;
  v_summary jsonb;
begin
  perform app.assert_customs_edi_permission(v_tenant, 'generate');

  if v_type is null then
    raise exception 'export_type must be CSB_III, CSB_IV, or CSB_V' using errcode = 'CMS04';
  end if;
  if v_manifest_id is null then
    raise exception 'manifest_id is required' using errcode = 'CMS04';
  end if;

  select * into v_m from public.manifests
   where id = v_manifest_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'Manifest not found' using errcode = 'P0002';
  end if;

  select c.* into v_cred from public.integration_credentials c
   where c.id = app.resolve_customs_credential_id(v_tenant);
  if v_cred.id is not null then
    select p.* into v_prov from public.integration_providers p where p.id = v_cred.provider_id;
    v_provider := coalesce(v_prov.provider_code, 'SANDBOX');
    v_sandbox := coalesce(v_cred.sandbox_mode, true);
    if v_cha = '' then v_cha := coalesce(v_cred.username, ''); end if;
    if v_iec = '' then v_iec := coalesce(v_cred.account_number, ''); end if;
    if v_branch = '' and coalesce(v_cred.remark, '') ~* 'branch=' then
      v_branch := substring(v_cred.remark from 'branch=([^;]+)');
    end if;
    if v_port = '' and coalesce(v_cred.remark, '') ~* 'port=' then
      v_port := substring(v_cred.remark from 'port=([^;]+)');
    end if;
  end if;

  -- Draft row first (lifecycle starts at DRAFT)
  v_file_name := format('%s-%s-%s.txt',
    replace(v_type, '_', '-'),
    replace(coalesce(v_m.manifest_no, 'MANIFEST'), '/', '-'),
    to_char(timezone('utc', now()), 'YYYYMMDD-HH24MISS'));

  insert into public.csb_exports (
    tenant_id, export_type, file_name, status, manifest_id, provider, sandbox_mode,
    cha_code, iec, branch_code, port_code, validation_summary, created_by, updated_by)
  values (
    v_tenant, v_type, v_file_name, 'DRAFT', v_manifest_id, v_provider, v_sandbox,
    nullif(v_cha, ''), nullif(v_iec, ''), nullif(v_branch, ''), nullif(v_port, ''),
    '{}'::jsonb, auth.uid(), auth.uid())
  returning * into v_export;

  select * into v_built
    from app.build_csb_export_content(v_tenant, v_type, v_m, v_cha, v_iec, v_branch, v_port);

  v_summary := jsonb_build_object(
    'errors', v_built.errors,
    'warnings', v_built.warnings,
    'line_count', v_built.line_count,
    'manifest_no', v_m.manifest_no
  );

  if jsonb_array_length(v_built.errors) > 0 then
    update public.csb_exports
       set validation_summary = v_summary,
           updated_by = auth.uid()
     where id = v_export.id and tenant_id = v_tenant
     returning * into v_export;

    v_log := app.log_csb_export_event(
      v_tenant, v_export.id, v_type, 'GENERATE', v_file_name, 'FAILURE',
      v_summary, 0, v_provider,
      jsonb_build_object('manifest_id', v_manifest_id),
      jsonb_build_object('ok', false),
      'Validation failed');

    perform app.write_audit_log(
      v_tenant, 'csb_exports', 'ADD', v_export.id, 'rpt.edi-csb-files',
      null, jsonb_build_object('csb_generate', false, 'export_type', v_type, 'status', 'DRAFT'));

    return jsonb_build_object(
      'ok', false,
      'export', app.csb_export_public_json(v_export),
      'errors', v_built.errors,
      'warnings', v_built.warnings,
      'log_id', v_log,
      'message', 'Validation failed — export left in DRAFT'
    );
  end if;

  insert into public.files (
    tenant_id, storage_bucket, storage_key, original_name, mime, size_bytes,
    scan_status, owner_type, owner_id, uploaded_by, created_by, updated_by)
  values (
    v_tenant,
    'tenant-files',
    format('tenants/%s/customs-edi/%s/%s', v_tenant, v_type, gen_random_uuid()::text || '-' || v_file_name),
    v_file_name,
    'text/plain',
    octet_length(convert_to(v_built.content, 'UTF8')),
    'CLEAN',
    'CSB_EXPORT',
    v_export.id,
    auth.uid(), auth.uid(), auth.uid())
  returning id into v_file_id;

  update public.csb_exports
     set status = 'GENERATED',
         content_text = v_built.content,
         line_count = v_built.line_count,
         validation_summary = v_summary,
         file_id = v_file_id,
         generated_at = now(),
         generated_by = auth.uid(),
         updated_by = auth.uid(),
         row_version = row_version + 1
   where id = v_export.id and tenant_id = v_tenant
   returning * into v_export;

  v_log := app.log_csb_export_event(
    v_tenant, v_export.id, v_type, 'GENERATE', v_file_name, 'GENERATED',
    v_summary, 0, v_provider,
    jsonb_build_object('manifest_id', v_manifest_id, 'sandbox', true),
    jsonb_build_object('ok', true, 'file_id', v_file_id, 'line_count', v_built.line_count),
    null);

  perform app.write_audit_log(
    v_tenant, 'csb_exports', 'ADD', v_export.id, 'rpt.edi-csb-files',
    null, jsonb_build_object(
      'csb_generate', true,
      'export_type', v_type,
      'file_name', v_file_name,
      'status', 'GENERATED'));

  return jsonb_build_object(
    'ok', true,
    'export', app.csb_export_public_json(v_export),
    'errors', v_built.errors,
    'warnings', v_built.warnings,
    'log_id', v_log,
    'message', 'CSB export generated (sandbox stub)'
  );
end
$$;

revoke all on function public.generate_csb_export(jsonb) from public;
grant execute on function public.generate_csb_export(jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- download_csb_export
-- ---------------------------------------------------------------------------
create or replace function public.download_csb_export(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_export public.csb_exports;
  v_log uuid;
begin
  perform app.assert_customs_edi_permission(v_tenant, 'download');

  select * into v_export from public.csb_exports
   where id = p_id and tenant_id = v_tenant
   for update;
  if not found then
    raise exception 'CSB export not found' using errcode = 'P0002';
  end if;
  if v_export.status not in ('GENERATED', 'DOWNLOADED') then
    raise exception 'Export is not ready for download (status %)', v_export.status
      using errcode = 'CMS04';
  end if;
  if coalesce(v_export.content_text, '') = '' then
    raise exception 'Export has no content' using errcode = 'CMS04';
  end if;

  update public.csb_exports
     set status = 'DOWNLOADED',
         download_count = download_count + 1,
         downloaded_at = now(),
         updated_by = auth.uid(),
         row_version = row_version + 1
   where id = p_id and tenant_id = v_tenant
   returning * into v_export;

  v_log := app.log_csb_export_event(
    v_tenant, v_export.id, v_export.export_type, 'DOWNLOAD', v_export.file_name,
    'DOWNLOADED', v_export.validation_summary, v_export.download_count, v_export.provider,
    jsonb_build_object('export_id', p_id),
    jsonb_build_object('ok', true, 'download_count', v_export.download_count),
    null);

  perform app.write_audit_log(
    v_tenant, 'csb_exports', 'ACCESS', v_export.id, 'rpt.edi-csb-files',
    null, jsonb_build_object(
      'csb_download', true,
      'export_type', v_export.export_type,
      'download_count', v_export.download_count));

  return jsonb_build_object(
    'ok', true,
    'export', app.csb_export_public_json(v_export),
    'file_name', v_export.file_name,
    'mime', 'text/plain',
    'content', v_export.content_text,
    'log_id', v_log
  );
end
$$;

revoke all on function public.download_csb_export(uuid) from public;
grant execute on function public.download_csb_export(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- list_csb_exports
-- ---------------------------------------------------------------------------
create or replace function public.list_csb_exports(
  p_export_type text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_type text := app.normalize_csb_export_type(p_export_type);
  v_lim int := greatest(1, least(coalesce(p_limit, 50), 200));
  v_rows jsonb;
begin
  perform app.assert_customs_edi_permission(v_tenant, 'list');

  -- If caller passed a non-null invalid type, normalize returns null — treat as filter miss
  if p_export_type is not null and btrim(p_export_type) <> '' and v_type is null then
    return jsonb_build_object('rows', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(app.csb_export_public_json(e) order by e.created_at desc), '[]'::jsonb)
    into v_rows
    from (
      select * from public.csb_exports
       where tenant_id = v_tenant
         and (v_type is null or export_type = v_type)
       order by created_at desc
       limit v_lim
    ) e;

  return jsonb_build_object('rows', v_rows);
end
$$;

revoke all on function public.list_csb_exports(text, integer) from public;
grant execute on function public.list_csb_exports(text, integer)
  to authenticated, service_role;

create or replace function public.get_customs_provider_status()
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
  perform app.assert_customs_edi_permission(v_tenant, 'list');

  select c.* into v_cred from public.integration_credentials c
   where c.id = app.resolve_customs_credential_id(v_tenant);
  if found then
    select p.* into v_prov from public.integration_providers p where p.id = v_cred.provider_id;
  end if;

  return jsonb_build_object(
    'provider', coalesce(v_prov.provider_code, 'SANDBOX'),
    'provider_name', coalesce(v_prov.provider_name, 'Sandbox Customs EDI'),
    'configured', v_cred.id is not null,
    'sandbox_mode', coalesce(v_cred.sandbox_mode, true),
    'cha_configured', coalesce(v_cred.username, '') <> '',
    'iec_configured', coalesce(v_cred.account_number, '') <> '',
    'export_directory_configured', coalesce(v_cred.endpoint, '') <> '',
    'has_password', v_cred.password_enc is not null,
    'live_http', false,
    'supported_formats', jsonb_build_array('CSB_III','CSB_IV','CSB_V'),
    'lifecycle', jsonb_build_array('DRAFT','GENERATED','DOWNLOADED')
  );
end
$$;

revoke all on function public.get_customs_provider_status() from public;
grant execute on function public.get_customs_provider_status()
  to authenticated, service_role;

comment on table public.csb_export_logs is
  'Append-only Customs EDI export history (7F). Never update/delete.';
comment on function public.generate_csb_export(jsonb) is
  'Generate CSB-III/IV/V sandbox file from manifest + shipment data. No live Customs API.';
