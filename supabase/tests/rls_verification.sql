-- ===========================================================================
-- rls_verification.sql — proves tenant isolation holds under RLS.
-- ---------------------------------------------------------------------------
-- Runs inside a transaction that ROLLS BACK, so it leaves no residue.
-- Execute as a privileged role (postgres / service role / local superuser):
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_verification.sql
-- Any failed assertion raises an exception and aborts with a non-zero exit.
--
-- Impersonation model: switch to the `authenticated` role and set the JWT
-- `sub` claim GUC that auth.uid() reads. RLS then applies exactly as it would
-- for a real logged-in user.
-- ===========================================================================
\set ON_ERROR_STOP on

begin;

-- --- Fixtures (created as the privileged setup role) --------------------
insert into auth.users (id, aud, role, email) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'authenticated', 'authenticated', 'rls_a@example.test'),
  ('bbbbbbbb-1111-0000-0000-000000000002', 'authenticated', 'authenticated', 'rls_b@example.test')
on conflict (id) do nothing;

insert into public.tenants (id, slug, name, status) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'rls-tenant-a', 'RLS Tenant A', 'ACTIVE'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'rls-tenant-b', 'RLS Tenant B', 'ACTIVE')
on conflict (id) do nothing;

insert into public.tenant_users (tenant_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'OWNER'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-1111-0000-0000-000000000002', 'OWNER')
on conflict (tenant_id, user_id) do nothing;

insert into public.branches (id, tenant_id, code, name) values
  ('aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'A-HO', 'A Head Office'),
  ('bbbbbbbb-2222-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'B-HO', 'B Head Office')
on conflict do nothing;

-- =======================================================================
-- Act as USER A (tenant A)
-- =======================================================================
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-1111-0000-0000-000000000001';

do $$
begin
  -- READ isolation: sees own tenant's branch, not tenant B's.
  if (select count(*) from public.branches where id = 'aaaaaaaa-2222-0000-0000-000000000001') <> 1 then
    raise exception 'FAIL [A-read-own]: user A cannot read its own branch';
  end if;
  if (select count(*) from public.branches where tenant_id = 'bbbbbbbb-0000-0000-0000-000000000002') <> 0 then
    raise exception 'FAIL [A-read-cross]: user A can read tenant B branches';
  end if;
  raise notice 'PASS [A-read]: read isolation holds for user A';

  -- WRITE isolation: cannot insert into tenant B.
  begin
    insert into public.branches (tenant_id, code, name)
    values ('bbbbbbbb-0000-0000-0000-000000000002', 'HACK', 'cross-tenant insert');
    raise exception 'FAIL [A-insert-cross]: cross-tenant INSERT succeeded';
  exception when insufficient_privilege then
    raise notice 'PASS [A-insert-cross]: cross-tenant INSERT blocked by RLS';
  end;

  -- UPDATE isolation: cannot flip tenant B rows (0 rows affected under RLS).
  update public.branches set name = 'pwned'
    where id = 'bbbbbbbb-2222-0000-0000-000000000002';
  if found then
    raise exception 'FAIL [A-update-cross]: cross-tenant UPDATE affected rows';
  end if;
  raise notice 'PASS [A-update-cross]: cross-tenant UPDATE affected no rows';

  -- AUDIT append works for own tenant.
  perform app.write_audit_log(
    'aaaaaaaa-0000-0000-0000-000000000001', 'branch', 'ADD',
    'aaaaaaaa-2222-0000-0000-000000000001', 'master.branch');
  if (select count(*) from public.audit_logs
        where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001') < 1 then
    raise exception 'FAIL [A-audit-insert]: audit append did not persist';
  end if;
  raise notice 'PASS [A-audit-insert]: audit append works for own tenant';

  -- AUDIT append-only (RLS layer): with no UPDATE/DELETE policy, an ordinary
  -- authenticated user can never target audit rows -> 0 rows affected, silently.
  update public.audit_logs set action = 'MODIFY'
    where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if found then
    raise exception 'FAIL [A-audit-update]: authenticated UPDATE affected audit rows';
  end if;
  delete from public.audit_logs
    where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if found then
    raise exception 'FAIL [A-audit-delete]: authenticated DELETE affected audit rows';
  end if;
  raise notice 'PASS [A-audit-mutate]: authenticated cannot UPDATE/DELETE audit rows';
end
$$;

reset role;

-- AUDIT append-only (hard layer): even a privileged, RLS-bypassing writer
-- (service_role) is blocked by the trg_audit_logs_block_mutations trigger.
set local role service_role;

do $$
begin
  begin
    update public.audit_logs set action = 'MODIFY'
      where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'FAIL [audit-trigger-update]: service_role UPDATE was not blocked';
  exception when feature_not_supported then
    raise notice 'PASS [audit-trigger-update]: append-only trigger blocked UPDATE';
  end;

  begin
    delete from public.audit_logs
      where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'FAIL [audit-trigger-delete]: service_role DELETE was not blocked';
  exception when feature_not_supported then
    raise notice 'PASS [audit-trigger-delete]: append-only trigger blocked DELETE';
  end;
end
$$;

reset role;

-- =======================================================================
-- Act as USER B (tenant B) — mirror read check
-- =======================================================================
set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-1111-0000-0000-000000000002';

do $$
begin
  if (select count(*) from public.branches where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001') <> 0 then
    raise exception 'FAIL [B-read-cross]: user B can read tenant A branches';
  end if;
  if (select count(*) from public.branches where id = 'bbbbbbbb-2222-0000-0000-000000000002') <> 1 then
    raise exception 'FAIL [B-read-own]: user B cannot read its own branch';
  end if;
  -- User B must not see tenant A's audit rows.
  if (select count(*) from public.audit_logs
        where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001') <> 0 then
    raise exception 'FAIL [B-audit-cross]: user B can read tenant A audit logs';
  end if;
  raise notice 'PASS [B-read]: read isolation holds for user B';
end
$$;

reset role;

do $$
begin
  raise notice '======================================================';
  raise notice 'RLS VERIFICATION PASSED: tenant isolation is enforced.';
  raise notice '======================================================';
end
$$;

rollback;
