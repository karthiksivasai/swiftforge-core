-- ===========================================================================
-- 0011  sessions, login_logs, otp_challenges, password_reset_tokens + RPCs
-- ---------------------------------------------------------------------------
-- App-side session tracking (Logged-in Users + force-logoff), append-only
-- login logs, and the /me/* + /sessions RPC surface. Supabase Auth still owns
-- tokens/refresh/OTP delivery; these tables track/audit them app-side and power
-- the blueprint screens.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  user_id            uuid not null references public.users(id) on delete cascade,
  auth_user_id       uuid not null,
  app                text not null default 'WEB' check (app in ('WEB','MOBILE')),
  refresh_token_hash text,
  jti                text,
  ip_address         inet,
  user_agent         text,
  created_at         timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  expires_at         timestamptz,
  revoked_at         timestamptz,
  revoked_by         uuid,
  revoke_reason      text
);
create index if not exists sessions_tenant_user_idx on public.sessions (tenant_id, user_id);
create index if not exists sessions_tenant_active_idx
  on public.sessions (tenant_id) where revoked_at is null;

-- ---------------------------------------------------------------------------
-- login_logs (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.login_logs (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid references public.users(id) on delete set null,
  username    text,
  event       text not null
                check (event in ('LOGIN_SUCCESS','LOGIN_FAILED','LOGOUT','FORCED_LOGOUT','PERMISSION_CHANGE')),
  user_type   text,
  ip_address  inet,
  user_agent  text,
  session_id  uuid,
  detail      text,
  created_at  timestamptz not null default now()
);
create index if not exists login_logs_tenant_created_idx on public.login_logs (tenant_id, created_at desc);
create index if not exists login_logs_tenant_event_idx on public.login_logs (tenant_id, event, created_at desc);

drop trigger if exists trg_login_logs_block_mutations on public.login_logs;
create trigger trg_login_logs_block_mutations
  before update or delete on public.login_logs
  for each row execute function app.tg_block_mutations();

-- ---------------------------------------------------------------------------
-- otp_challenges + password_reset_tokens (secrets — no direct RLS access)
-- ---------------------------------------------------------------------------
create table if not exists public.otp_challenges (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  user_id      uuid references public.users(id) on delete cascade,
  purpose      text not null default 'LOGIN' check (purpose in ('LOGIN','RESET')),
  code_hash    text not null,
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  attempts     integer not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists otp_challenges_tenant_user_idx on public.otp_challenges (tenant_id, user_id);

create table if not exists public.password_reset_tokens (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  token_hash  text not null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists password_reset_tokens_tenant_user_idx on public.password_reset_tokens (tenant_id, user_id);

-- ===========================================================================
-- RLS
-- ===========================================================================
alter table public.sessions               enable row level security;
alter table public.login_logs             enable row level security;
alter table public.otp_challenges         enable row level security;
alter table public.password_reset_tokens  enable row level security;

-- sessions: own sessions always; admins / Logged-in Users permission see all.
drop policy if exists sessions_select on public.sessions;
create policy sessions_select on public.sessions
  for select using (
    auth_user_id = auth.uid()
    or app.is_platform_admin()
    or (tenant_id in (select app.user_tenant_ids())
        and (app.is_tenant_admin(tenant_id)
             or app.user_has_permission(tenant_id, 'utl.loggedin-users', 'list')))
  );

-- login_logs: admins / Login-Log or Action-Log list permission.
drop policy if exists login_logs_select on public.login_logs;
create policy login_logs_select on public.login_logs
  for select using (
    app.is_platform_admin()
    or (tenant_id in (select app.user_tenant_ids())
        and (app.is_tenant_admin(tenant_id)
             or app.user_has_permission(tenant_id, 'rpt.login-log', 'list')
             or app.user_has_permission(tenant_id, 'rpt.action-log', 'list')))
  );

-- otp_challenges + password_reset_tokens: NO policies => no direct access.
-- Reached only through SECURITY DEFINER functions below.

-- ===========================================================================
-- Permission-change audit trigger (logs to login_logs as PERMISSION_CHANGE)
-- ===========================================================================
create or replace function app.tg_log_permission_change()
returns trigger
language plpgsql security definer set search_path = public, app
as $$
declare
  v_tenant uuid := coalesce(new.tenant_id, old.tenant_id);
  v_user   public.users;
begin
  select * into v_user from public.users
    where auth_user_id = auth.uid() and tenant_id = v_tenant limit 1;
  insert into public.login_logs (tenant_id, user_id, username, event, user_type, detail)
  values (
    v_tenant, v_user.id, coalesce(v_user.username, 'system'),
    'PERMISSION_CHANGE', coalesce(v_user.user_type, 'SYSTEM'),
    tg_op || ' group_permissions ' || coalesce(new.id, old.id)::text
  );
  return coalesce(new, old);
end
$$;

drop trigger if exists trg_group_permissions_audit on public.group_permissions;
create trigger trg_group_permissions_audit
  after insert or update or delete on public.group_permissions
  for each row execute function app.tg_log_permission_change();

-- ===========================================================================
-- Session helpers + /me + /sessions RPCs (public = exposed to PostgREST)
-- ===========================================================================
create or replace function app.is_session_active(p_session_id uuid)
returns boolean
language sql stable security definer set search_path = public, app
as $$
  select exists (
    select 1 from public.sessions s
    where s.id = p_session_id
      and s.revoked_at is null
      and (s.expires_at is null or s.expires_at > now())
  )
$$;

create or replace function public.me()
returns setof public.users
language sql stable security definer set search_path = public, app
as $$
  select * from public.users
  where auth_user_id = auth.uid() and deleted_at is null
  limit 1
$$;

create or replace function public.me_permissions()
returns table (
  slug text, section text, name text, under_menu text,
  all_access boolean, can_add boolean, can_modify boolean,
  can_delete boolean, can_list boolean, can_search boolean
)
language plpgsql stable security definer set search_path = public, app
as $$
declare v_tenant uuid;
begin
  select u.tenant_id into v_tenant from public.users u
    where u.auth_user_id = auth.uid() and u.deleted_at is null limit 1;
  if v_tenant is null then return; end if;

  if app.is_tenant_admin(v_tenant) then
    return query
      select pm.slug, pm.section, pm.name, pm.under_menu,
             true, true, true, true, true, true
      from public.permission_modules pm
      where pm.is_active
      order by pm.sort_order;
  else
    return query
      select pm.slug, pm.section, pm.name, pm.under_menu,
             bool_or(gp.all_access),
             bool_or(gp.all_access or gp.can_add),
             bool_or(gp.all_access or gp.can_modify),
             bool_or(gp.all_access or gp.can_delete),
             bool_or(gp.all_access or gp.can_list),
             bool_or(gp.all_access or gp.can_search)
      from public.users u
      join public.user_group_members m on m.user_id = u.id
      join public.user_groups g on g.id = m.group_id
                                and g.status = 'ACTIVE' and g.deleted_at is null
      join public.group_permissions gp on gp.group_id = m.group_id
      join public.permission_modules pm on pm.id = gp.module_id
      where u.auth_user_id = auth.uid() and u.tenant_id = v_tenant
        and u.status = 'ACTIVE' and u.deleted_at is null
      group by pm.slug, pm.section, pm.name, pm.under_menu, pm.sort_order
      order by pm.sort_order;
  end if;
end
$$;

create or replace function public.me_navigation()
returns table (slug text, section text, name text, under_menu text)
language sql stable security definer set search_path = public, app
as $$
  select p.slug, p.section, p.name, p.under_menu
  from public.me_permissions() p
  where p.can_list
$$;

create or replace function public.has_permission(p_slug text, p_action text)
returns boolean
language plpgsql stable security definer set search_path = public, app
as $$
declare v_tenant uuid;
begin
  select u.tenant_id into v_tenant from public.users u
    where u.auth_user_id = auth.uid() and u.deleted_at is null limit 1;
  if v_tenant is null then return false; end if;
  return app.user_has_permission(v_tenant, p_slug, p_action);
end
$$;

create or replace function public.record_login(
  p_app text default 'WEB', p_ip inet default null, p_user_agent text default null
)
returns uuid
language plpgsql security definer set search_path = public, app
as $$
declare v_user public.users; v_session uuid;
begin
  select * into v_user from public.users
    where auth_user_id = auth.uid() and deleted_at is null limit 1;
  if v_user.id is null then
    raise exception 'No application user for current auth user' using errcode = '42501';
  end if;
  insert into public.sessions (tenant_id, user_id, auth_user_id, app, ip_address, user_agent, last_seen_at, expires_at)
  values (v_user.tenant_id, v_user.id, auth.uid(),
          case when upper(coalesce(p_app,'WEB')) = 'MOBILE' then 'MOBILE' else 'WEB' end,
          p_ip, p_user_agent, now(), now() + interval '30 days')
  returning id into v_session;

  insert into public.login_logs (tenant_id, user_id, username, event, user_type, ip_address, user_agent, session_id)
  values (v_user.tenant_id, v_user.id, v_user.username, 'LOGIN_SUCCESS', v_user.user_type, p_ip, p_user_agent, v_session);

  return v_session;
end
$$;

create or replace function public.record_logout(p_session_id uuid)
returns void
language plpgsql security definer set search_path = public, app
as $$
declare v_user public.users;
begin
  select * into v_user from public.users where auth_user_id = auth.uid() limit 1;
  update public.sessions
     set revoked_at = now(), revoke_reason = 'LOGOUT'
   where id = p_session_id and auth_user_id = auth.uid() and revoked_at is null;
  if found then
    insert into public.login_logs (tenant_id, user_id, username, event, user_type, session_id)
    values (v_user.tenant_id, v_user.id, v_user.username, 'LOGOUT', v_user.user_type, p_session_id);
  end if;
end
$$;

-- Admin force-logoff. Permission-gated; sets revoked_at so app.is_session_active
-- returns false. (Hard Supabase token revocation is an out-of-band admin action.)
create or replace function public.revoke_session(p_session_id uuid)
returns void
language plpgsql security definer set search_path = public, app
as $$
declare v_session public.sessions; v_actor uuid;
begin
  select * into v_session from public.sessions where id = p_session_id;
  if not found then
    raise exception 'Session not found' using errcode = 'P0002';
  end if;
  if not (app.is_tenant_admin(v_session.tenant_id)
          or app.user_has_permission(v_session.tenant_id, 'utl.loggedin-users', 'modify')) then
    raise exception 'Not permitted to force logoff' using errcode = '42501';
  end if;
  select id into v_actor from public.users
    where auth_user_id = auth.uid() and tenant_id = v_session.tenant_id limit 1;

  update public.sessions
     set revoked_at = now(), revoked_by = v_actor, revoke_reason = 'FORCED_LOGOUT'
   where id = p_session_id and revoked_at is null;

  insert into public.login_logs (tenant_id, user_id, username, event, user_type, session_id, detail)
  values (v_session.tenant_id, v_session.user_id,
          (select username from public.users where id = v_session.user_id),
          'FORCED_LOGOUT',
          (select user_type from public.users where id = v_session.user_id),
          p_session_id, 'forced by ' || coalesce(v_actor::text, 'admin'));
end
$$;

-- ---- grants -------------------------------------------------------------
grant execute on function app.is_session_active(uuid) to authenticated, service_role;
grant execute on function
  public.me(),
  public.me_permissions(),
  public.me_navigation(),
  public.has_permission(text, text),
  public.record_login(text, inet, text),
  public.record_logout(uuid),
  public.revoke_session(uuid)
to authenticated;
