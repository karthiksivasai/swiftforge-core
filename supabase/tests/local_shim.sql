-- ===========================================================================
-- local_shim.sql — TEST-ONLY emulation of the Supabase-provided environment.
-- ---------------------------------------------------------------------------
-- NEVER apply this to a real Supabase project. Supabase already provides the
-- auth schema, auth.uid(), the authenticated/anon/service_role roles, and the
-- default grants. This shim recreates just enough of that so the migrations +
-- rls_verification.sql can run against a throwaway local Postgres cluster.
-- ===========================================================================

-- Roles Supabase provides out of the box.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

-- auth schema + a minimal users table (real one has many more columns).
create schema if not exists auth;
create table if not exists auth.users (
  id          uuid primary key default gen_random_uuid(),
  instance_id uuid,
  aud         text,
  role        text,
  email       text,
  created_at  timestamptz not null default now()
);

-- auth.uid(): read the JWT `sub` claim GUC, mirroring Supabase behaviour.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema auth to authenticated, anon, service_role;

-- Ensure future public/app objects are reachable by the authenticated role,
-- exactly like Supabase's default privilege grants. Run AFTER migrations too
-- (see runner) so it covers objects created by the migrations.
