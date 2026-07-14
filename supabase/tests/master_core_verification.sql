-- ===========================================================================
-- master_core_verification.sql — proves the Phase 3 master-core framework (0014).
-- ---------------------------------------------------------------------------
-- Runs in a transaction that ROLLS BACK. Execute as a privileged role:
--   psql "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/master_core_verification.sql
-- Proves: pg_trgm present; shared helpers exist; attach_master_triggers wires
-- both touch + audit triggers; row_version bumps on update (optimistic locking);
-- audit rows are written for ADD/MODIFY/DELETE with the bound module slug; and
-- app.suppress_row_audit skips per-row audit (bulk-import summary path).
-- Uses a throwaway probe table so no business tables are needed for this milestone.
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

-- ---------- 0) extension + helper existence -----------------------------
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_trgm') then
    raise exception 'FAIL [ext]: pg_trgm extension not installed';
  end if;
  if to_regprocedure('app.audit_suppressed()') is null then
    raise exception 'FAIL [fn]: app.audit_suppressed() missing';
  end if;
  if to_regprocedure('app.tg_audit_row()') is null then
    raise exception 'FAIL [fn]: app.tg_audit_row() missing';
  end if;
  if to_regprocedure('app.attach_master_triggers(text,text)') is null then
    raise exception 'FAIL [fn]: app.attach_master_triggers(text,text) missing';
  end if;
  raise notice 'PASS [core]: pg_trgm + shared helpers present';
end $$;

-- ---------- fixture tenant (audit_logs.tenant_id has an FK) --------------
insert into public.tenants (id, slug, name, status) values
  ('33333333-cccc-4ccc-8ccc-000000000003','mc-core','Master Core Tenant','ACTIVE')
on conflict (id) do nothing;

-- ---------- probe table following the master contract -------------------
create table public.__mc_probe (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  deleted_at  timestamptz,
  row_version integer not null default 1
);
select app.attach_master_triggers('__mc_probe', 'mst.__probe');

-- both triggers must now exist
do $$
begin
  if (select count(*) from pg_trigger
        where tgrelid = 'public.__mc_probe'::regclass
          and tgname in ('trg_touch___mc_probe','trg_audit___mc_probe')) <> 2 then
    raise exception 'FAIL [attach]: expected touch + audit triggers on probe';
  end if;
  raise notice 'PASS [attach]: touch + audit triggers installed';
end $$;

-- ---------- INSERT -> row_version 1 + audit ADD -------------------------
do $$
declare v_id uuid; v_rv integer;
begin
  insert into public.__mc_probe (tenant_id, name)
    values ('33333333-cccc-4ccc-8ccc-000000000003','alpha')
    returning id, row_version into v_id, v_rv;
  perform set_config('mc.pid', v_id::text, true);

  if v_rv <> 1 then
    raise exception 'FAIL [insert-rv]: expected row_version 1, got %', v_rv;
  end if;
  if (select count(*) from public.audit_logs
        where entity_type = '__mc_probe' and entity_id = v_id and action = 'ADD'
          and module_slug = 'mst.__probe') <> 1 then
    raise exception 'FAIL [insert-audit]: no ADD audit row for insert';
  end if;
  raise notice 'PASS [insert]: row_version=1 and ADD audit written';
end $$;

-- ---------- UPDATE -> row_version 2 + audit MODIFY ----------------------
do $$
declare v_id uuid := current_setting('mc.pid')::uuid; v_rv integer;
begin
  update public.__mc_probe set name = 'beta' where id = v_id
    returning row_version into v_rv;
  if v_rv <> 2 then
    raise exception 'FAIL [update-rv]: expected row_version 2, got %', v_rv;
  end if;
  if (select count(*) from public.audit_logs
        where entity_type = '__mc_probe' and entity_id = v_id and action = 'MODIFY') <> 1 then
    raise exception 'FAIL [update-audit]: no MODIFY audit row for update';
  end if;
  raise notice 'PASS [update]: row_version=2 and MODIFY audit written';
end $$;

-- ---------- optimistic locking: stale row_version affects 0 rows --------
do $$
declare v_id uuid := current_setting('mc.pid')::uuid;
begin
  update public.__mc_probe set name = 'stale' where id = v_id and row_version = 1;
  if found then
    raise exception 'FAIL [optlock]: stale row_version update unexpectedly matched';
  end if;
  raise notice 'PASS [optlock]: stale row_version update affected 0 rows';
end $$;

-- ---------- suppression: bulk path writes NO per-row audit --------------
do $$
declare v_before bigint; v_after bigint;
begin
  select count(*) into v_before from public.audit_logs where entity_type = '__mc_probe';
  perform set_config('app.suppress_row_audit', 'on', true);
  insert into public.__mc_probe (tenant_id, name)
    values ('33333333-cccc-4ccc-8ccc-000000000003','suppressed');
  perform set_config('app.suppress_row_audit', 'off', true);
  select count(*) into v_after from public.audit_logs where entity_type = '__mc_probe';
  if v_after <> v_before then
    raise exception 'FAIL [suppress]: audit written while suppression on (% -> %)', v_before, v_after;
  end if;
  raise notice 'PASS [suppress]: per-row audit skipped under app.suppress_row_audit';
end $$;

-- ---------- DELETE -> audit DELETE -------------------------------------
do $$
declare v_id uuid := current_setting('mc.pid')::uuid;
begin
  delete from public.__mc_probe where id = v_id;
  if (select count(*) from public.audit_logs
        where entity_type = '__mc_probe' and entity_id = v_id and action = 'DELETE') <> 1 then
    raise exception 'FAIL [delete-audit]: no DELETE audit row for delete';
  end if;
  raise notice 'PASS [delete]: DELETE audit written';
end $$;

drop table public.__mc_probe;

do $$
begin
  raise notice '==========================================================';
  raise notice 'MASTER CORE VERIFICATION PASSED: helpers + audit + optlock.';
  raise notice '==========================================================';
end $$;

rollback;
