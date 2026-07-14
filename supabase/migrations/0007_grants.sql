-- ===========================================================================
-- 0007  grants for the custom `app` schema.
-- ---------------------------------------------------------------------------
-- Supabase auto-grants privileges on the `public` schema to anon/authenticated,
-- but NOT on custom schemas. RLS policies call app.user_tenant_ids() /
-- app.is_platform_admin(), so the authenticated role MUST be able to execute
-- them (policy expressions run with the caller's privileges). Idempotent.
-- ===========================================================================

grant usage on schema app to anon, authenticated, service_role;

grant execute on all functions in schema app to anon, authenticated, service_role;

-- Cover functions added to `app` by later phases automatically.
alter default privileges in schema app
  grant execute on functions to anon, authenticated, service_role;
