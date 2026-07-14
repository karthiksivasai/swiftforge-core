-- ===========================================================================
-- bootstrap_verification.sql — proves app.bootstrap_tenant() is production-safe.
-- ---------------------------------------------------------------------------
-- Runs in a transaction that ROLLS BACK. Execute as a privileged role:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/bootstrap_verification.sql
-- Proves: idempotent (created once, no duplicates), the required
-- branch/FY/counters/settings/RBAC groups exist, and the tenant cannot be read
-- across tenants.
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

-- ---------- 1) idempotency + required children ---------------------------
do $$
declare
  v1 uuid; v2 uuid; v_admin uuid; n int;
begin
  v1 := app.bootstrap_tenant('boot-a', 'Boot A Courier', 'BootA', 'support@boota.test');
  v2 := app.bootstrap_tenant('boot-a', 'Boot A Courier', 'BootA', 'support@boota.test');

  if v1 is null or v1 <> v2 then
    raise exception 'FAIL [idempotent]: bootstrap returned different/void tenant ids (% vs %)', v1, v2;
  end if;
  if (select count(*) from public.tenants where slug = 'boot-a' and deleted_at is null) <> 1 then
    raise exception 'FAIL [once]: duplicate tenant rows for slug boot-a';
  end if;
  raise notice 'PASS [idempotent]: same tenant returned, created exactly once';

  -- head-office branch
  if (select count(*) from public.branches
        where tenant_id = v1 and is_head_office and deleted_at is null) <> 1 then
    raise exception 'FAIL [branch]: head-office branch missing';
  end if;
  -- financial year
  if (select count(*) from public.financial_years
        where tenant_id = v1 and is_active and deleted_at is null) < 1 then
    raise exception 'FAIL [fy]: financial year missing';
  end if;
  -- sequence counters (one per doc type = 12)
  select count(*) into n from public.sequence_counters where tenant_id = v1;
  if n <> 12 then
    raise exception 'FAIL [counters]: expected 12 sequence counters, got %', n;
  end if;
  -- required tenant settings
  if (select count(*) from public.tenant_settings
        where tenant_id = v1 and scope = 'TENANT'
          and key in ('password_policy','miscellaneous','active_financial_year')) <> 3 then
    raise exception 'FAIL [settings]: required tenant settings missing';
  end if;
  -- RBAC default groups
  if (select count(*) from public.user_groups
        where tenant_id = v1 and name in ('TENANT_ADMIN','OPERATIONS','ACCOUNTS')
          and deleted_at is null) <> 3 then
    raise exception 'FAIL [groups]: default RBAC groups missing';
  end if;
  -- TENANT_ADMIN has full grants across EVERY seeded module (count-agnostic so
  -- adding modules like mst.pincode-master does not break this assertion).
  select id into v_admin from public.user_groups
    where tenant_id = v1 and name = 'TENANT_ADMIN' and deleted_at is null;
  if (select count(*) from public.group_permissions where group_id = v_admin)
     <> (select count(*) from public.permission_modules) then
    raise exception 'FAIL [grants]: TENANT_ADMIN grants != permission_modules count';
  end if;
  raise notice 'PASS [children]: branch, FY, 12 counters, settings, 3 groups, all-module admin grants';
end $$;

-- ---------- 2) second tenant + a member confined to it -------------------
insert into auth.users (id, aud, role, email)
values ('33333333-cccc-4ccc-8ccc-00000000b0bb','authenticated','authenticated','memberb@bootb.test')
on conflict (id) do nothing;

do $$
declare v_b uuid;
begin
  v_b := app.bootstrap_tenant('boot-b', 'Boot B Couriers', 'BootB');
  insert into public.tenant_users (tenant_id, user_id, role, status)
  values (v_b, '33333333-cccc-4ccc-8ccc-00000000b0bb', 'MEMBER', 'ACTIVE')
  on conflict do nothing;
end $$;

-- ---------- 3) cross-tenant isolation (member of B) ----------------------
set local role authenticated;
set local request.jwt.claim.sub = '33333333-cccc-4ccc-8ccc-00000000b0bb';
do $$
begin
  -- cannot read tenant A's scaffolding
  if (select count(*) from public.branches
        where tenant_id = (select id from public.tenants where slug = 'boot-a')) <> 0 then
    raise exception 'FAIL [xtenant-branch]: member B read tenant A branches';
  end if;
  if (select count(*) from public.tenant_settings
        where tenant_id = (select id from public.tenants where slug = 'boot-a')) <> 0 then
    raise exception 'FAIL [xtenant-settings]: member B read tenant A settings';
  end if;
  -- can read its own tenant's scaffolding
  if (select count(*) from public.branches
        where tenant_id = (select id from public.tenants where slug = 'boot-b')) < 1 then
    raise exception 'FAIL [own]: member B cannot read own branch';
  end if;
  raise notice 'PASS [xtenant]: bootstrapped tenant isolated across tenants';
end $$;
reset role;

do $$
begin
  raise notice '==========================================================';
  raise notice 'BOOTSTRAP VERIFICATION PASSED: idempotent + scaffold + RLS.';
  raise notice '==========================================================';
end $$;

rollback;
