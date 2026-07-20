-- Prefer live vendor calls: sandbox only when explicitly enabled.
-- Flip existing credential rows that still defaulted to sandbox=true
-- when they already have a username (i.e. intended for live use).

update public.integration_credentials
set sandbox_mode = false,
    updated_at = now()
where deleted_at is null
  and sandbox_mode is distinct from false
  and nullif(btrim(coalesce(username, '')), '') is not null;
