-- ===========================================================================
-- local_grants.sql — TEST-ONLY. Emulates Supabase's default public-schema
-- grants to anon/authenticated. NEVER apply to a real Supabase project
-- (Supabase already does this via default privileges). Run AFTER migrations.
-- ===========================================================================
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public
  to authenticated, service_role;
grant select on all tables in schema public to anon;
