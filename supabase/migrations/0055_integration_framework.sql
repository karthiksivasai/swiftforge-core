-- ===========================================================================
-- 0055  integration framework — Phase 7 Milestone 7A
-- ---------------------------------------------------------------------------
-- Reusable carrier integration framework only:
--   provider registry, encrypted credentials, append-only logs.
-- NO real carrier calls. NO booking/track/label/webhooks/workers.
-- Permission: mst.vendor-master (reuse — carrier credentials live with vendor ops)
-- Secrets: encrypted at rest; never returned by RPCs (write-only updates).
-- ===========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Crypto helpers (dev default; override via SET app.integration_crypto_key)
-- ---------------------------------------------------------------------------
create or replace function app.integration_crypto_key()
returns text
language sql
stable
security definer
set search_path = public, app
as $$
  select coalesce(
    nullif(current_setting('app.integration_crypto_key', true), ''),
    nullif(current_setting('app.smtp_crypto_key', true), ''),
    'swiftforge-dev-integration-key-change-in-prod');
$$;

create or replace function app.encrypt_integration_secret(p_plain text)
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
  return pgp_sym_encrypt(p_plain, app.integration_crypto_key());
end
$$;

-- Decrypt for future carrier workers only — never exposed via public RPCs.
create or replace function app.decrypt_integration_secret(p_cipher bytea)
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
  return pgp_sym_decrypt(p_cipher, app.integration_crypto_key());
end
$$;

create or replace function app.assert_integration_permission(
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
  if app.user_has_permission(p_tenant, 'mst.vendor-master', p_action)
     or app.user_has_permission(p_tenant, 'mst.service-mapping', p_action) then
    return;
  end if;
  if p_action in ('list','search')
     and (
       app.user_has_permission(p_tenant, 'mst.vendor-master', 'add')
       or app.user_has_permission(p_tenant, 'mst.vendor-master', 'modify')
       or app.user_has_permission(p_tenant, 'mst.vendor-master', 'list')
       or app.user_has_permission(p_tenant, 'mst.vendor-master', 'search')
       or app.user_has_permission(p_tenant, 'mst.service-mapping', 'list')
       or app.user_has_permission(p_tenant, 'mst.service-mapping', 'search')
     ) then
    return;
  end if;
  raise exception 'Permission denied: mst.vendor-master' using errcode = '42501';
end
$$;

-- ---------------------------------------------------------------------------
-- integration_providers — global registry (metadata only)
-- ---------------------------------------------------------------------------
create table if not exists public.integration_providers (
  id                    uuid primary key default gen_random_uuid(),
  provider_code         text not null,
  provider_name         text not null,
  provider_type         text not null default 'CARRIER'
                          check (provider_type in ('CARRIER')),
  status                text not null default 'ACTIVE'
                          check (status in ('ACTIVE','INACTIVE')),
  supports_booking      boolean not null default true,
  supports_tracking     boolean not null default true,
  supports_labels       boolean not null default true,
  supports_serviceability boolean not null default true,
  sort_order            integer not null default 100,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint integration_providers_code_uq unique (provider_code)
);

insert into public.integration_providers (
  provider_code, provider_name, provider_type, status,
  supports_booking, supports_tracking, supports_labels, supports_serviceability, sort_order
) values
  ('FEDEX',     'FedEx',      'CARRIER', 'ACTIVE', true, true, true, true, 10),
  ('DHL',       'DHL',        'CARRIER', 'ACTIVE', true, true, true, true, 20),
  ('BLUEDART',  'Blue Dart',  'CARRIER', 'ACTIVE', true, true, true, true, 30),
  ('DTDC',      'DTDC',       'CARRIER', 'ACTIVE', true, true, true, true, 40),
  ('DELHIVERY', 'Delhivery',  'CARRIER', 'ACTIVE', true, true, true, true, 50),
  ('ARAMEX',    'Aramex',     'CARRIER', 'ACTIVE', true, true, true, true, 60),
  ('UPS',       'UPS',        'CARRIER', 'ACTIVE', true, true, true, true, 70)
on conflict (provider_code) do update
  set provider_name = excluded.provider_name,
      status = excluded.status,
      supports_booking = excluded.supports_booking,
      supports_tracking = excluded.supports_tracking,
      supports_labels = excluded.supports_labels,
      supports_serviceability = excluded.supports_serviceability,
      sort_order = excluded.sort_order,
      updated_at = now();

alter table public.integration_providers enable row level security;
drop policy if exists integration_providers_select on public.integration_providers;
create policy integration_providers_select on public.integration_providers
  for select using (true);  -- catalog metadata; writes via migration/admin only

-- ---------------------------------------------------------------------------
-- integration_credentials — per tenant × provider
-- ---------------------------------------------------------------------------
create table if not exists public.integration_credentials (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  provider_id       uuid not null references public.integration_providers(id) on delete restrict,
  username          text,
  password_enc      bytea,
  api_key_enc       bytea,
  api_secret_enc    bytea,
  account_number    text,
  endpoint          text,
  sandbox_mode      boolean not null default true,
  is_active         boolean not null default true,
  remark            text,
  created_at        timestamptz not null default now(),
  created_by        uuid,
  updated_at        timestamptz not null default now(),
  updated_by        uuid,
  deleted_at        timestamptz,
  row_version       integer not null default 1,
  constraint integration_credentials_tenant_id_uq unique (tenant_id, id)
);
create unique index if not exists integration_credentials_tenant_provider_uq
  on public.integration_credentials (tenant_id, provider_id)
  where deleted_at is null;
create index if not exists integration_credentials_tenant_idx
  on public.integration_credentials (tenant_id, created_at desc)
  where deleted_at is null;

drop trigger if exists trg_touch_integration_credentials on public.integration_credentials;
create trigger trg_touch_integration_credentials before insert or update on public.integration_credentials
  for each row execute function app.tg_touch_row();

alter table public.integration_credentials enable row level security;
drop policy if exists integration_credentials_select on public.integration_credentials;
create policy integration_credentials_select on public.integration_credentials
  for select using (
    tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin()
  );
-- Mutations via SECURITY DEFINER RPCs only (no direct insert/update/delete policies).

-- ---------------------------------------------------------------------------
-- integration_logs — append-only (no API execution in 7A)
-- ---------------------------------------------------------------------------
create table if not exists public.integration_logs (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  provider_id     uuid references public.integration_providers(id) on delete set null,
  provider_code   text,
  operation       text not null
                    check (operation in (
                      'BOOK','CANCEL','TRACK','LABEL','SERVICEABILITY','TEST','OTHER')),
  request_id      text,
  shipment_id     uuid,
  status          text not null default 'PENDING'
                    check (status in ('PENDING','SUCCESS','FAILURE','NOT_IMPLEMENTED')),
  latency_ms      integer,
  response_code   text,
  error_message   text,
  created_at      timestamptz not null default now()
);
create index if not exists integration_logs_tenant_created_idx
  on public.integration_logs (tenant_id, created_at desc);
create index if not exists integration_logs_tenant_provider_idx
  on public.integration_logs (tenant_id, provider_code, created_at desc);
create index if not exists integration_logs_shipment_idx
  on public.integration_logs (tenant_id, shipment_id)
  where shipment_id is not null;

-- Append-only hard guard
create or replace function app.tg_block_integration_log_mutations()
returns trigger
language plpgsql
as $$
begin
  raise exception 'integration_logs is append-only' using errcode = '42501';
end
$$;

drop trigger if exists trg_integration_logs_block_mutations on public.integration_logs;
create trigger trg_integration_logs_block_mutations
  before update or delete on public.integration_logs
  for each row execute function app.tg_block_integration_log_mutations();

alter table public.integration_logs enable row level security;
drop policy if exists integration_logs_select on public.integration_logs;
create policy integration_logs_select on public.integration_logs
  for select using (
    tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin()
  );

create or replace function app.write_integration_log(
  p_tenant uuid,
  p_provider_id uuid,
  p_provider_code text,
  p_operation text,
  p_request_id text,
  p_shipment_id uuid,
  p_status text,
  p_latency_ms integer,
  p_response_code text,
  p_error_message text
)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_id uuid;
begin
  insert into public.integration_logs (
    tenant_id, provider_id, provider_code, operation, request_id, shipment_id,
    status, latency_ms, response_code, error_message)
  values (
    p_tenant, p_provider_id, p_provider_code, upper(p_operation), p_request_id, p_shipment_id,
    upper(coalesce(p_status, 'PENDING')), p_latency_ms, p_response_code, p_error_message)
  returning id into v_id;
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------
-- Safe credential JSON (never includes secrets)
-- ---------------------------------------------------------------------------
create or replace function app.integration_credential_public_json(
  p_row public.integration_credentials,
  p_provider public.integration_providers
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', p_row.id,
    'provider_id', p_row.provider_id,
    'provider_code', p_provider.provider_code,
    'provider_name', p_provider.provider_name,
    'provider_type', p_provider.provider_type,
    'username', p_row.username,
    'has_password', p_row.password_enc is not null,
    'has_api_key', p_row.api_key_enc is not null,
    'has_api_secret', p_row.api_secret_enc is not null,
    'account_number', p_row.account_number,
    'endpoint', p_row.endpoint,
    'sandbox_mode', p_row.sandbox_mode,
    'is_active', p_row.is_active,
    'remark', p_row.remark,
    'supports_booking', p_provider.supports_booking,
    'supports_tracking', p_provider.supports_tracking,
    'supports_labels', p_provider.supports_labels,
    'supports_serviceability', p_provider.supports_serviceability,
    'row_version', p_row.row_version,
    'created_at', p_row.created_at,
    'updated_at', p_row.updated_at
  );
$$;

-- ===========================================================================
-- list_integration_providers
-- ===========================================================================
create or replace function public.list_integration_providers(
  p_status text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_st text := nullif(upper(btrim(coalesce(p_status,''))),'');
  v_rows jsonb;
begin
  perform app.assert_integration_permission(v_tenant, 'list');

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'provider_code', p.provider_code,
      'provider_name', p.provider_name,
      'provider_type', p.provider_type,
      'status', p.status,
      'supports_booking', p.supports_booking,
      'supports_tracking', p.supports_tracking,
      'supports_labels', p.supports_labels,
      'supports_serviceability', p.supports_serviceability,
      'sort_order', p.sort_order
    ) order by p.sort_order, p.provider_name
  ), '[]'::jsonb)
    into v_rows
    from public.integration_providers p
   where (v_st is null or p.status = v_st);

  return jsonb_build_object('rows', v_rows);
end
$$;

revoke all on function public.list_integration_providers(text) from public;
grant execute on function public.list_integration_providers(text)
  to authenticated, service_role;

-- ===========================================================================
-- save_integration_credentials
-- ===========================================================================
create or replace function public.save_integration_credentials(
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
  v_row public.integration_credentials;
  v_provider public.integration_providers;
  v_provider_id uuid;
  v_provider_code text;
  v_username text;
  v_password text;
  v_api_key text;
  v_api_secret text;
  v_account text;
  v_endpoint text;
  v_sandbox boolean;
  v_active boolean;
  v_remark text;
  v_old public.integration_credentials;
begin
  if p_id is null then
    perform app.assert_integration_permission(v_tenant, 'add');
  else
    perform app.assert_integration_permission(v_tenant, 'modify');
  end if;

  begin
    v_provider_id := nullif(btrim(coalesce(v_f->>'provider_id','')),'')::uuid;
  exception when others then
    v_provider_id := null;
  end;
  v_provider_code := upper(nullif(btrim(coalesce(v_f->>'provider_code','')),''));

  if v_provider_id is not null then
    select * into v_provider from public.integration_providers where id = v_provider_id;
  elsif v_provider_code is not null then
    select * into v_provider from public.integration_providers
     where provider_code = v_provider_code;
  end if;

  if not found or v_provider is null then
    raise exception 'Unknown integration provider' using errcode = 'CMS04';
  end if;
  v_provider_id := v_provider.id;
  if v_provider.status <> 'ACTIVE' and p_id is null then
    raise exception 'Provider is inactive' using errcode = 'CMS04';
  end if;

  v_username := nullif(btrim(coalesce(v_f->>'username','')),'');
  v_password := v_f->>'password';
  v_api_key := v_f->>'api_key';
  v_api_secret := v_f->>'api_secret';
  v_account := nullif(btrim(coalesce(v_f->>'account_number','')),'');
  v_endpoint := nullif(btrim(coalesce(v_f->>'endpoint','')),'');
  v_sandbox := case lower(btrim(coalesce(v_f->>'sandbox_mode','true')))
    when 'false' then false when 'no' then false when '0' then false else true end;
  v_active := case lower(btrim(coalesce(v_f->>'is_active','true')))
    when 'false' then false when 'no' then false when '0' then false else true end;
  v_remark := nullif(btrim(coalesce(v_f->>'remark','')),'');

  if p_id is null then
    insert into public.integration_credentials (
      tenant_id, provider_id, username, password_enc, api_key_enc, api_secret_enc,
      account_number, endpoint, sandbox_mode, is_active, remark,
      created_by, updated_by)
    values (
      v_tenant, v_provider.id, v_username,
      app.encrypt_integration_secret(v_password),
      app.encrypt_integration_secret(v_api_key),
      app.encrypt_integration_secret(v_api_secret),
      v_account, v_endpoint, v_sandbox, v_active, v_remark,
      auth.uid(), auth.uid())
    returning * into v_row;

    perform app.write_audit_log(
      v_tenant, 'integration_credentials', 'ADD', v_row.id, 'mst.vendor-master',
      null, jsonb_build_object(
        'provider_code', v_provider.provider_code,
        'sandbox_mode', v_row.sandbox_mode,
        'is_active', v_row.is_active,
        'password_set', v_row.password_enc is not null,
        'api_key_set', v_row.api_key_enc is not null,
        'api_secret_set', v_row.api_secret_enc is not null));
  else
    select * into v_old from public.integration_credentials
     where id = p_id and tenant_id = v_tenant and deleted_at is null
     for update;
    if not found then
      raise exception 'Integration credentials not found' using errcode = 'P0002';
    end if;
    if p_row_version is not null and v_old.row_version <> p_row_version then
      raise exception 'Optimistic lock conflict' using errcode = 'CMS04';
    end if;

    -- Provider cannot change on update (unique per tenant)
    if v_provider.id <> v_old.provider_id then
      raise exception 'Cannot change provider on existing credentials' using errcode = 'CMS04';
    end if;

    update public.integration_credentials
       set username = coalesce(v_username, username),
           password_enc = case
             when nullif(btrim(coalesce(v_password,'')),'') is null then password_enc
             else app.encrypt_integration_secret(v_password)
           end,
           api_key_enc = case
             when nullif(btrim(coalesce(v_api_key,'')),'') is null then api_key_enc
             else app.encrypt_integration_secret(v_api_key)
           end,
           api_secret_enc = case
             when nullif(btrim(coalesce(v_api_secret,'')),'') is null then api_secret_enc
             else app.encrypt_integration_secret(v_api_secret)
           end,
           account_number = coalesce(v_account, account_number),
           endpoint = coalesce(v_endpoint, endpoint),
           sandbox_mode = case when v_f ? 'sandbox_mode' then v_sandbox else sandbox_mode end,
           is_active = case when v_f ? 'is_active' then v_active else is_active end,
           remark = case when v_f ? 'remark' then v_remark else remark end,
           updated_by = auth.uid(),
           updated_at = now(),
           row_version = row_version + 1
     where id = p_id
     returning * into v_row;

    perform app.write_audit_log(
      v_tenant, 'integration_credentials', 'MODIFY', v_row.id, 'mst.vendor-master',
      null, jsonb_build_object(
        'provider_code', v_provider.provider_code,
        'sandbox_mode', v_row.sandbox_mode,
        'is_active', v_row.is_active,
        'password_updated', nullif(btrim(coalesce(v_password,'')),'') is not null,
        'api_key_updated', nullif(btrim(coalesce(v_api_key,'')),'') is not null,
        'api_secret_updated', nullif(btrim(coalesce(v_api_secret,'')),'') is not null));
  end if;

  return app.integration_credential_public_json(v_row, v_provider);
exception
  when unique_violation then
    raise exception 'Credentials already exist for this provider' using errcode = 'CMS04';
end
$$;

revoke all on function public.save_integration_credentials(jsonb, uuid, integer) from public;
grant execute on function public.save_integration_credentials(jsonb, uuid, integer)
  to authenticated, service_role;

-- ===========================================================================
-- get / list / delete
-- ===========================================================================
create or replace function public.get_integration_credentials(
  p_id uuid default null,
  p_provider_code text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_row public.integration_credentials;
  v_provider public.integration_providers;
  v_code text := upper(nullif(btrim(coalesce(p_provider_code,'')),''));
begin
  perform app.assert_integration_permission(v_tenant, 'list');

  if p_id is not null then
    select c.* into v_row
      from public.integration_credentials c
     where c.id = p_id and c.tenant_id = v_tenant and c.deleted_at is null;
  elsif v_code is not null then
    select c.* into v_row
      from public.integration_credentials c
      join public.integration_providers p on p.id = c.provider_id
     where c.tenant_id = v_tenant and c.deleted_at is null
       and p.provider_code = v_code;
  else
    return null;
  end if;

  if not found then
    return null;
  end if;

  select * into v_provider from public.integration_providers where id = v_row.provider_id;
  return app.integration_credential_public_json(v_row, v_provider);
end
$$;

revoke all on function public.get_integration_credentials(uuid, text) from public;
grant execute on function public.get_integration_credentials(uuid, text)
  to authenticated, service_role;

create or replace function public.list_integration_credentials()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_rows jsonb;
begin
  perform app.assert_integration_permission(v_tenant, 'list');

  select coalesce(jsonb_agg(
    app.integration_credential_public_json(c, p)
    order by p.sort_order, p.provider_name
  ), '[]'::jsonb)
    into v_rows
    from public.integration_credentials c
    join public.integration_providers p on p.id = c.provider_id
   where c.tenant_id = v_tenant and c.deleted_at is null;

  return jsonb_build_object('rows', v_rows);
end
$$;

revoke all on function public.list_integration_credentials() from public;
grant execute on function public.list_integration_credentials()
  to authenticated, service_role;

create or replace function public.delete_integration_credentials(
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
  v_row public.integration_credentials;
  v_code text;
begin
  if not (
    app.is_platform_admin() or app.is_tenant_admin(v_tenant)
    or app.user_has_permission(v_tenant, 'mst.vendor-master', 'delete')
    or app.user_has_permission(v_tenant, 'mst.vendor-master', 'modify')
  ) then
    raise exception 'Permission denied: mst.vendor-master' using errcode = '42501';
  end if;

  select * into v_row from public.integration_credentials
   where id = p_id and tenant_id = v_tenant and deleted_at is null
   for update;
  if not found then
    raise exception 'Integration credentials not found' using errcode = 'P0002';
  end if;
  if p_row_version is not null and v_row.row_version <> p_row_version then
    raise exception 'Optimistic lock conflict' using errcode = 'CMS04';
  end if;

  select provider_code into v_code from public.integration_providers where id = v_row.provider_id;

  update public.integration_credentials
     set deleted_at = now(), updated_at = now(), updated_by = auth.uid(),
         row_version = row_version + 1
   where id = p_id
   returning * into v_row;

  perform app.write_audit_log(
    v_tenant, 'integration_credentials', 'DELETE', v_row.id, 'mst.vendor-master',
    jsonb_build_object('provider_code', v_code), null);

  return jsonb_build_object('id', v_row.id, 'deleted', true);
end
$$;

revoke all on function public.delete_integration_credentials(uuid, integer) from public;
grant execute on function public.delete_integration_credentials(uuid, integer)
  to authenticated, service_role;

-- ===========================================================================
-- test_integration_connection — placeholder (no network call)
-- ===========================================================================
create or replace function public.test_integration_connection(
  p_id uuid default null,
  p_provider_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_cred jsonb;
  v_provider_id uuid;
  v_code text;
begin
  perform app.assert_integration_permission(v_tenant, 'modify');

  v_cred := public.get_integration_credentials(p_id, p_provider_code);
  if v_cred is null then
    return jsonb_build_object(
      'ok', false,
      'status', 'NOT_IMPLEMENTED',
      'message', 'Not Implemented — configure credentials first');
  end if;

  v_provider_id := (v_cred->>'provider_id')::uuid;
  v_code := v_cred->>'provider_code';

  perform app.write_integration_log(
    v_tenant, v_provider_id, v_code, 'TEST', null, null,
    'NOT_IMPLEMENTED', null, null, 'Not Implemented');

  return jsonb_build_object(
    'ok', false,
    'status', 'NOT_IMPLEMENTED',
    'message', 'Not Implemented',
    'provider_code', v_code,
    'sandbox_mode', (v_cred->>'sandbox_mode')::boolean);
end
$$;

revoke all on function public.test_integration_connection(uuid, text) from public;
grant execute on function public.test_integration_connection(uuid, text)
  to authenticated, service_role;

comment on table public.integration_providers is
  'Global carrier provider registry (metadata). No live API adapters in 7A.';
comment on table public.integration_credentials is
  'Per-tenant encrypted carrier credentials. Secrets never returned by RPCs.';
comment on table public.integration_logs is
  'Append-only integration call log. No execution in Milestone 7A.';
