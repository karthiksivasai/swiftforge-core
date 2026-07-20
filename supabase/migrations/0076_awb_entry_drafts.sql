-- ===========================================================================
-- 0076  AWB Entry UI drafts (cross-device recovery)
-- ---------------------------------------------------------------------------
-- One unfinished AWB Entry form draft per user. Payload is opaque JSON owned
-- by the client; cleared after successful save/book.
-- ===========================================================================

create table if not exists public.awb_entry_drafts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null,
  payload     jsonb not null default '{}'::jsonb,
  saved_at    timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint awb_entry_drafts_user_uq unique (tenant_id, user_id)
);

create index if not exists awb_entry_drafts_tenant_idx
  on public.awb_entry_drafts (tenant_id);

alter table public.awb_entry_drafts enable row level security;

drop policy if exists awb_entry_drafts_select on public.awb_entry_drafts;
create policy awb_entry_drafts_select on public.awb_entry_drafts
  for select using (
    tenant_id in (select app.user_tenant_ids())
    and user_id = (select u.id from public.users u
                   where u.auth_user_id = auth.uid() and u.deleted_at is null
                   limit 1)
  );

drop policy if exists awb_entry_drafts_upsert on public.awb_entry_drafts;
-- Writes go through security definer RPCs only.

create or replace function public.get_awb_entry_draft()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_user   uuid;
  v_payload jsonb;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    return null;
  end if;

  select u.id into v_user
  from public.users u
  where u.auth_user_id = auth.uid() and u.deleted_at is null
  limit 1;
  if v_user is null then
    return null;
  end if;

  select d.payload into v_payload
  from public.awb_entry_drafts d
  where d.tenant_id = v_tenant and d.user_id = v_user;

  return v_payload;
end;
$$;

create or replace function public.upsert_awb_entry_draft(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_user   uuid;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  select u.id into v_user
  from public.users u
  where u.auth_user_id = auth.uid() and u.deleted_at is null
  limit 1;
  if v_user is null then
    raise exception 'User profile not found' using errcode = '42501';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'p_payload must be a JSON object' using errcode = '22023';
  end if;

  insert into public.awb_entry_drafts (tenant_id, user_id, payload, saved_at)
  values (v_tenant, v_user, p_payload, now())
  on conflict (tenant_id, user_id) do update
    set payload = excluded.payload,
        saved_at = now(),
        updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.clear_awb_entry_draft()
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_user   uuid;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    return jsonb_build_object('ok', true);
  end if;

  select u.id into v_user
  from public.users u
  where u.auth_user_id = auth.uid() and u.deleted_at is null
  limit 1;
  if v_user is null then
    return jsonb_build_object('ok', true);
  end if;

  delete from public.awb_entry_drafts
  where tenant_id = v_tenant and user_id = v_user;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.get_awb_entry_draft() from public;
revoke all on function public.upsert_awb_entry_draft(jsonb) from public;
revoke all on function public.clear_awb_entry_draft() from public;
grant execute on function public.get_awb_entry_draft() to authenticated, service_role;
grant execute on function public.upsert_awb_entry_draft(jsonb) to authenticated, service_role;
grant execute on function public.clear_awb_entry_draft() to authenticated, service_role;

comment on table public.awb_entry_drafts is
  'One unfinished AWB Entry UI draft per user for cross-device recovery.';
