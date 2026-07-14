-- ===========================================================================
-- 0014  master core — reusable framework for ALL master-data tables (Phase 3+).
-- ---------------------------------------------------------------------------
-- This migration adds NO business tables. It installs the shared primitives the
-- geo masters (0015) and every later master group reuse verbatim:
--
--   1. pg_trgm            — trigram index/search support for name lookups.
--   2. app.audit_suppressed()      — reads a session flag so bulk paths (imports)
--                                    can skip per-row audit and write a summary.
--   3. app.tg_audit_row()          — generic AFTER INSERT/UPDATE/DELETE trigger
--                                    that appends to audit_logs via the sanctioned
--                                    app.write_audit_log() path (Phase 1, 0005).
--   4. app.attach_master_triggers()— installs the standard touch + audit triggers
--                                    on a master table in one idempotent call.
--
-- Optimistic locking needs no new object here: app.tg_touch_row() (0001) already
-- bumps row_version on every UPDATE. Callers enforce the check with
-- `... where id = $1 and row_version = $2` (0 rows affected => stale => conflict).
--
-- Idempotent: create extension if not exists / create or replace.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Trigram support (name search on large masters: pincodes, destinations…).
-- ---------------------------------------------------------------------------
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- 2. audit_suppressed(): true when the session set `app.suppress_row_audit`.
--    Bulk import (0016) sets it so thousands of rows don't flood audit_logs;
--    it instead writes ONE summary entry. Missing/empty => not suppressed.
-- ---------------------------------------------------------------------------
create or replace function app.audit_suppressed()
returns boolean
language sql
stable
as $$
  select coalesce(nullif(current_setting('app.suppress_row_audit', true), ''), 'off') = 'on'
$$;

comment on function app.audit_suppressed() is
  'True when the current session suppresses per-row audit (bulk import summary path).';

-- ---------------------------------------------------------------------------
-- 3. tg_audit_row(): generic row-audit trigger. Attach as
--       AFTER INSERT OR UPDATE OR DELETE ... FOR EACH ROW
--       EXECUTE FUNCTION app.tg_audit_row('<module-slug>')
--    Requires the table to expose `id uuid` and `tenant_id uuid`.
--    SECURITY DEFINER: writes through app.write_audit_log() which is the only
--    sanctioned (append-only) path into audit_logs.
-- ---------------------------------------------------------------------------
create or replace function app.tg_audit_row()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_slug   text := nullif(tg_argv[0], '');
  v_action text;
  v_tenant uuid;
  v_entity uuid;
  v_old    jsonb;
  v_new    jsonb;
begin
  -- Bulk paths opt out of per-row audit and write their own summary.
  if app.audit_suppressed() then
    return coalesce(new, old);
  end if;

  if (tg_op = 'INSERT') then
    v_action := 'ADD';
    v_new := to_jsonb(new); v_tenant := new.tenant_id; v_entity := new.id;
  elsif (tg_op = 'UPDATE') then
    v_action := 'MODIFY';
    v_old := to_jsonb(old); v_new := to_jsonb(new);
    v_tenant := new.tenant_id; v_entity := new.id;
  else -- DELETE
    v_action := 'DELETE';
    v_old := to_jsonb(old); v_tenant := old.tenant_id; v_entity := old.id;
  end if;

  perform app.write_audit_log(
    p_tenant_id   => v_tenant,
    p_entity_type => tg_table_name,
    p_action      => v_action,
    p_entity_id   => v_entity,
    p_module_slug => v_slug,
    p_old         => v_old,
    p_new         => v_new
  );

  return coalesce(new, old);
end
$$;

comment on function app.tg_audit_row() is
  'Generic AFTER row trigger: appends ADD/MODIFY/DELETE to audit_logs. Arg0 = module slug. Honors app.audit_suppressed().';

-- ---------------------------------------------------------------------------
-- 4. attach_master_triggers(): one-call install of the standard trigger pair
--    (touch + audit) on a public master table. Idempotent (drops first).
--    Keeps 0015 and every later master migration DRY and consistent.
-- ---------------------------------------------------------------------------
create or replace function app.attach_master_triggers(p_table text, p_module_slug text)
returns void
language plpgsql
as $$
begin
  -- BEFORE: maintain updated_at + optimistic-lock row_version.
  execute format('drop trigger if exists %I on public.%I;',
                 'trg_touch_' || p_table, p_table);
  execute format(
    'create trigger %I before insert or update on public.%I
       for each row execute function app.tg_touch_row();',
    'trg_touch_' || p_table, p_table);

  -- AFTER: append change history to audit_logs (module slug bound here).
  execute format('drop trigger if exists %I on public.%I;',
                 'trg_audit_' || p_table, p_table);
  execute format(
    'create trigger %I after insert or update or delete on public.%I
       for each row execute function app.tg_audit_row(%L);',
    'trg_audit_' || p_table, p_table, p_module_slug);
end
$$;

comment on function app.attach_master_triggers(text, text) is
  'Install the standard touch + audit trigger pair on a public master table (idempotent).';
