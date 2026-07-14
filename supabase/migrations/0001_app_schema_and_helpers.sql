-- ===========================================================================
-- 0001  app schema + shared helper/trigger functions
-- ---------------------------------------------------------------------------
-- Foundation utilities used by every later migration. No business tables here.
-- Idempotent: safe to re-run (create ... if not exists / create or replace).
-- ===========================================================================

-- Dedicated schema for application helper functions so we never pollute public.
create schema if not exists app;

-- ---------------------------------------------------------------------------
-- current_user_id(): thin wrapper over Supabase auth.uid().
-- Wrapping it (a) documents intent and (b) gives a single seam the local RLS
-- test shim can rely on. On Supabase, auth.uid() reads the JWT `sub` claim.
-- ---------------------------------------------------------------------------
create or replace function app.current_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- tg_touch_row(): maintain updated_at + optimistic-lock row_version on write.
-- Attach as BEFORE INSERT OR UPDATE on every mutable business table.
-- ---------------------------------------------------------------------------
create or replace function app.tg_touch_row()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if (tg_op = 'INSERT') then
    if new.row_version is null then
      new.row_version := 1;
    end if;
    new.created_at := coalesce(new.created_at, now());
  elsif (tg_op = 'UPDATE') then
    -- Never let row_version go backwards; always bump from the stored value.
    new.row_version := old.row_version + 1;
    new.created_at := old.created_at;
  end if;
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- tg_block_mutations(): hard append-only guard. Attach BEFORE UPDATE OR DELETE
-- on immutable tables (e.g. audit_logs). Defense-in-depth beyond RLS.
-- ---------------------------------------------------------------------------
create or replace function app.tg_block_mutations()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Table %.% is append-only; % is not permitted',
    tg_table_schema, tg_table_name, tg_op
    using errcode = '0A000'; -- feature_not_supported
end
$$;

comment on schema app is 'Application helper functions (tenant context, triggers) — Phase 1 foundation.';
