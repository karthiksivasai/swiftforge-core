-- ===========================================================================
-- import_pipeline_verification.sql — proves public.import_master (0016).
-- ---------------------------------------------------------------------------
-- Runs in a transaction that ROLLS BACK. Execute as a privileged role.
-- Proves: VALIDATE is a pure dry-run (nothing persisted); COMMIT inserts valid
-- rows, records expected row errors, resolves FK-by-code, is idempotent, writes
-- exactly one summary audit row (and no per-row master audit); missing tenant
-- context is rejected.
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

-- ---------- fixtures: auth users + bootstrapped tenant + admin -----------
insert into auth.users (id, aud, role, email) values
  ('44444444-dddd-4ddd-8ddd-0000000000a1','authenticated','authenticated','impadm@a.test'),
  ('44444444-dddd-4ddd-8ddd-0000000000b1','authenticated','authenticated','impnop@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid;
begin
  v_t := app.bootstrap_tenant('imp-a', 'Import Tenant A', 'ImpA');
  perform app.link_tenant_admin(v_t, '44444444-dddd-4ddd-8ddd-0000000000a1',
          'impadm', 'Import Admin', 'impadm@a.test');
  perform set_config('imp.tenant', v_t::text, false);
end $$;

-- Act as the tenant admin for all RPC calls + assertions.
set local role authenticated;
set local request.jwt.claim.sub = '44444444-dddd-4ddd-8ddd-0000000000a1';

-- =======================================================================
-- 1) VALIDATE is a pure dry-run: correct counts, ZERO persistence
-- =======================================================================
do $$
declare v_res jsonb;
begin
  v_res := public.import_master('zones', 'VALIDATE', $j$[
    {"code":"N","name":"North"},
    {"code":"S","name":"South"},
    {"name":"NoCode"}
  ]$j$::jsonb);

  if (v_res->>'ok')::int <> 2 or (v_res->>'error_count')::int <> 1 then
    raise exception 'FAIL [validate-counts]: %', v_res;
  end if;
  if v_res->>'job_id' is not null then
    raise exception 'FAIL [validate-job]: VALIDATE created a job';
  end if;
  if (select count(*) from public.zones where tenant_id = current_setting('imp.tenant')::uuid) <> 0 then
    raise exception 'FAIL [validate-write]: VALIDATE inserted zones';
  end if;
  if (select count(*) from public.import_jobs where tenant_id = current_setting('imp.tenant')::uuid) <> 0 then
    raise exception 'FAIL [validate-jobrow]: VALIDATE persisted an import_jobs row';
  end if;
  if (select count(*) from public.import_row_errors) <> 0 then
    raise exception 'FAIL [validate-errrow]: VALIDATE persisted import_row_errors';
  end if;
  raise notice 'PASS [validate]: dry-run counts correct and nothing persisted';
end $$;

-- =======================================================================
-- 2) COMMIT inserts valid rows, logs errors, writes ONE summary audit
-- =======================================================================
do $$
declare v_res jsonb; v_job uuid;
begin
  v_res := public.import_master('zones', 'COMMIT', $j$[
    {"code":"N","name":"North"},
    {"code":"S","name":"South"},
    {"name":"NoCode"}
  ]$j$::jsonb);
  v_job := (v_res->>'job_id')::uuid;

  if (v_res->>'ok')::int <> 2 or (v_res->>'skipped')::int <> 0 or (v_res->>'error_count')::int <> 1 then
    raise exception 'FAIL [commit-counts]: %', v_res;
  end if;
  if (select count(*) from public.zones where tenant_id = current_setting('imp.tenant')::uuid) <> 2 then
    raise exception 'FAIL [commit-rows]: expected 2 zones';
  end if;
  if (select count(*) from public.import_row_errors where job_id = v_job) <> 1 then
    raise exception 'FAIL [commit-errrows]: expected 1 row error';
  end if;
  if (select status from public.import_jobs where id = v_job) <> 'DONE' then
    raise exception 'FAIL [commit-status]: job not DONE';
  end if;
  -- exactly one summary audit row; NO per-row zone audit (suppressed)
  if (select count(*) from public.audit_logs
        where tenant_id = current_setting('imp.tenant')::uuid
          and entity_type = 'import_jobs' and entity_id = v_job) <> 1 then
    raise exception 'FAIL [commit-audit-summary]: expected one import_jobs audit';
  end if;
  if (select count(*) from public.audit_logs
        where tenant_id = current_setting('imp.tenant')::uuid and entity_type = 'zones') <> 0 then
    raise exception 'FAIL [commit-audit-suppress]: per-row zone audit was written';
  end if;
  raise notice 'PASS [commit]: valid rows inserted, errors logged, one summary audit';
end $$;

-- =======================================================================
-- 3) Idempotency: a second COMMIT of the same data adds nothing
-- =======================================================================
do $$
declare v_res jsonb;
begin
  v_res := public.import_master('zones', 'COMMIT', $j$[
    {"code":"N","name":"North"},
    {"code":"S","name":"South"}
  ]$j$::jsonb);
  if (v_res->>'ok')::int <> 0 or (v_res->>'skipped')::int <> 2 then
    raise exception 'FAIL [idempotent]: re-import not skipped: %', v_res;
  end if;
  if (select count(*) from public.zones where tenant_id = current_setting('imp.tenant')::uuid) <> 2 then
    raise exception 'FAIL [idempotent-rows]: duplicate zones created';
  end if;
  raise notice 'PASS [idempotent]: re-import skips existing natural keys';
end $$;

-- =======================================================================
-- 4) FK-by-code resolution via the PRELOADED map (set-based, no N+1).
--    Multiple rows share the same zone_code ("N") to exercise repeated O(1)
--    lookups; a distinct valid code ("S") and an unknown code ("ZZZ") confirm
--    behavior is identical to per-row resolution.
-- =======================================================================
do $$
declare v_res jsonb; v_zone_n uuid; v_zone_s uuid; n int;
begin
  v_res := public.import_master('states', 'COMMIT', $j$[
    {"code":"KA","name":"Karnataka","zone_code":"N"},
    {"code":"TN","name":"Tamil Nadu","zone_code":"N"},
    {"code":"MH","name":"Maharashtra","zone_code":"N"},
    {"code":"KL","name":"Kerala","zone_code":"S"},
    {"code":"XX","name":"BadZone","zone_code":"ZZZ"}
  ]$j$::jsonb);
  if (v_res->>'ok')::int <> 4 or (v_res->>'error_count')::int <> 1 then
    raise exception 'FAIL [fk-counts]: %', v_res;
  end if;
  select id into v_zone_n from public.zones
    where tenant_id = current_setting('imp.tenant')::uuid and code = 'N';
  select id into v_zone_s from public.zones
    where tenant_id = current_setting('imp.tenant')::uuid and code = 'S';
  -- all three repeated-N rows resolved to the same zone via the preloaded map
  select count(*) into n from public.states
    where tenant_id = current_setting('imp.tenant')::uuid
      and code in ('KA','TN','MH') and zone_id = v_zone_n;
  if n <> 3 then
    raise exception 'FAIL [fk-repeat]: repeated zone_code N did not resolve for all rows (got %)', n;
  end if;
  if (select zone_id from public.states
        where tenant_id = current_setting('imp.tenant')::uuid and code = 'KL') is distinct from v_zone_s then
    raise exception 'FAIL [fk-distinct]: KL.zone_id did not resolve to zone S';
  end if;
  if exists (select 1 from public.states
        where tenant_id = current_setting('imp.tenant')::uuid and code = 'XX') then
    raise exception 'FAIL [fk-bad]: row with unknown zone_code was inserted';
  end if;
  raise notice 'PASS [fk]: set-based map resolves repeated + distinct codes; unknown -> row error';
end $$;

reset role;

-- =======================================================================
-- 5) No tenant context (unlinked user) is rejected
-- =======================================================================
set local role authenticated;
set local request.jwt.claim.sub = '44444444-dddd-4ddd-8ddd-0000000000b1';  -- not linked
do $$
begin
  begin
    perform public.import_master('zones', 'VALIDATE', '[{"code":"Z","name":"Z"}]'::jsonb);
    raise exception 'FAIL [no-tenant]: import allowed without tenant context';
  exception when insufficient_privilege then
    raise notice 'PASS [no-tenant]: import rejected without tenant context';
  end;
end $$;
reset role;

do $$
begin
  raise notice '==========================================================';
  raise notice 'IMPORT PIPELINE VERIFICATION PASSED: validate/commit/fk/idem.';
  raise notice '==========================================================';
end $$;

rollback;
