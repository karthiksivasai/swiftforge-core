-- ===========================================================================
-- local_branch_verification.sql — Phase 3 Sales Masters (0029).
-- ---------------------------------------------------------------------------
-- Proves local_branches table + RLS + import arm resolving branch/state codes.
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000029','authenticated','authenticated','locbr@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid;
begin
  v_t := app.bootstrap_tenant('locbr-a', 'Local Branch Tenant A', 'LocBrA');
  perform app.link_tenant_admin(v_t, '99999999-1111-4111-8111-000000000029',
          'locbradm', 'Local Branch Admin', 'locbr@a.test');
  perform set_config('locbr.tenant', v_t::text, false);
end $$;

do $$
declare v_tbl text; v_tbls text[] := array['local_branches'];
begin
  foreach v_tbl in array v_tbls loop
    if to_regclass('public.' || v_tbl) is null then raise exception 'FAIL [table]: %', v_tbl; end if;
    if not (select relrowsecurity from pg_class where oid = ('public.' || v_tbl)::regclass) then
      raise exception 'FAIL [rls]: %', v_tbl;
    end if;
    if (select count(*) from pg_trigger where tgrelid = ('public.' || v_tbl)::regclass
          and tgname in ('trg_touch_' || v_tbl, 'trg_audit_' || v_tbl)) <> 2 then
      raise exception 'FAIL [triggers]: %', v_tbl;
    end if;
  end loop;
  raise notice 'PASS [structure]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000029';

-- seed org branch + states for FK resolution
do $$
declare v_t uuid := current_setting('locbr.tenant')::uuid;
begin
  insert into public.branches (tenant_id, code, name, status)
  values (v_t, 'HYD', 'Hyderabad Branch', 'ACTIVE');
  insert into public.zones (tenant_id, code, name) values (v_t, 'Z1', 'Zone 1');
  insert into public.states (tenant_id, code, name, zone_id)
  select v_t, 'TS', 'Telangana', z.id from public.zones z where z.tenant_id = v_t and z.code = 'Z1';
  raise notice 'PASS [seed]';
end $$;

-- local_branches import
do $$
declare v_res jsonb; v_t uuid := current_setting('locbr.tenant')::uuid; v_cnt int;
begin
  v_res := public.import_master('local_branches', 'COMMIT', $j$[
    {"code":"HYD","name":"Courierwala Express","branch_code":"HYD","state_code":"TS","billing_state_code":"TS","pin_code":"500016","city":"Begumpet","gst_no":"36DMIPK0439N1ZO","phone":"8686657209","email":"a@test.com","status":"active"},
    {"code":"BLR","name":"Bangalore Local","branch_code":"HYD","state_code":"TS"},
    {"code":"","name":"X"}
  ]$j$::jsonb);
  if (v_res->>'ok')::int <> 2 or (v_res->>'error_count')::int <> 1 then
    raise exception 'FAIL [import]: %', v_res;
  end if;
  select count(*) into v_cnt from public.local_branches where tenant_id = v_t;
  if v_cnt <> 2 then raise exception 'FAIL [rows]: got %', v_cnt; end if;
  if not exists (
    select 1 from public.local_branches lb
    join public.branches b on b.id = lb.branch_id and b.code = 'HYD'
    where lb.tenant_id = v_t and lb.code = 'HYD'
  ) then
    raise exception 'FAIL [branch-fk]';
  end if;
  raise notice 'PASS [local-branches-import]';
end $$;

-- duplicate natural key skipped
do $$
declare v_res jsonb;
begin
  v_res := public.import_master('local_branches', 'COMMIT', $j$[
    {"code":"HYD","name":"Duplicate","branch_code":"HYD"}
  ]$j$::jsonb);
  if (v_res->>'ok')::int <> 0 or (v_res->>'skipped')::int <> 1 then
    raise exception 'FAIL [duplicate-skip]: %', v_res;
  end if;
  raise notice 'PASS [duplicate-skip]';
end $$;

reset role;
do $$ begin raise notice 'LOCAL BRANCH VERIFICATION PASSED'; end $$;
rollback;
