# Phase 1 — Foundation Setup

This document covers the Supabase foundation shipped in Phase 1: environment,
migrations, tenant-isolation (RLS) design, storage, audit logging, and how to
verify everything locally and against your Supabase project.

> Scope: **foundation only**. No auth UI, no business modules, no API handlers.
> Those arrive in Phase 2+. The frontend is untouched.

---

## 1. What was added

```
.env.example                                  # placeholders (committed)
.env                                           # real creds (gitignored)
.gitignore                                     # now ignores .env / .env.*
src/integrations/supabase/client.ts            # browser client (anon key, RLS-bound)
src/integrations/supabase/client.server.ts     # server-only admin client (service role)
supabase/config.toml                           # CLI project config
supabase/migrations/0001_app_schema_and_helpers.sql
supabase/migrations/0002_tenancy_core.sql
supabase/migrations/0003_org_structure.sql
supabase/migrations/0004_files.sql
supabase/migrations/0005_audit_logs.sql
supabase/migrations/0006_storage_tenant_files.sql
supabase/migrations/0007_grants.sql
supabase/seed.sql                              # dev-only seed (1 plan/tenant/branch/FY)
supabase/tests/rls_verification.sql            # cross-tenant isolation proof
supabase/tests/local_shim.sql                  # test-only Supabase emulation
supabase/tests/local_grants.sql                # test-only public grants
supabase/tests/run_local_rls_check.sh          # ephemeral-Postgres test runner
```

---

## 2. Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | browser + server | Project base URL (no `/rest/v1`). |
| `VITE_SUPABASE_ANON_KEY` | browser | Publishable/anon key. RLS always applies. |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Secret key. Bypasses RLS. Never bundled. |
| `SUPABASE_DB_URL` | tooling | Direct Postgres URL for `psql` / migrations (optional). |

Setup:

```bash
cp .env.example .env   # then fill in real values
```

`.env` is gitignored (`git check-ignore .env` confirms). Only `.env.example`
(placeholders) is committed. The service-role key has **no** `VITE_` prefix, so
Vite never exposes it to the client bundle.

---

## 3. Core tables

All tenant-owned tables carry `tenant_id uuid NOT NULL REFERENCES tenants(id)`,
a `tenant_id`-leading index, `created_at/updated_at/created_by/updated_by`,
`row_version` (optimistic locking, auto-bumped), soft delete (`deleted_at`)
where relevant, and RLS enabled.

| Table | Owner | Notes |
| --- | --- | --- |
| `plans` | global | Subscription catalog. Read-all, admin-write. |
| `tenants` | root | One courier company per row. No `tenant_id`. |
| `tenant_users` | link | **Minimal** membership anchor (`auth.users` ↔ `tenants`). RLS resolves tenant context from here. Phase 2 extends it. |
| `tenant_subscriptions` | tenant | Per-tenant subscription history. |
| `branches` | tenant | Service centres. Unique `(tenant_id, code)` where not deleted. |
| `financial_years` | tenant | Accounting periods. `to_date > from_date`. |
| `sequence_counters` | tenant | Gapless document numbering source. |
| `tenant_settings` | tenant | Scoped key/value config (TENANT or BRANCH). |
| `files` | tenant | Storage object metadata + scan status. |
| `audit_logs` | tenant | **Append-only** change trail. |
| `usage_counters` | tenant | Plan-limit metering (`metric`,`period`). |

Helper objects in the `app` schema:

- `app.current_user_id()` → `auth.uid()` wrapper.
- `app.user_tenant_ids()` → set of tenant ids the caller actively belongs to (SECURITY DEFINER).
- `app.is_platform_admin()` → cross-tenant staff flag (SECURITY DEFINER).
- `app.tg_touch_row()` → maintains `updated_at` + `row_version`.
- `app.tg_block_mutations()` → append-only guard trigger.
- `app.write_audit_log(...)` → safe audit append path.
- `app.storage_object_tenant_id(text)` → parses tenant id from a storage path.

---

## 4. Tenant-isolation (RLS) design

**Principle:** isolation is enforced in the database from the authenticated
Supabase user — never from the frontend subdomain (which is UX only and
trivially spoofable).

**Context resolution.** A logged-in request carries a Supabase JWT. `auth.uid()`
yields the user id. `app.user_tenant_ids()` maps that user to the tenant(s) they
belong to via `tenant_users`. It is `SECURITY DEFINER` so the policy check reads
membership without recursing into `tenant_users`' own RLS.

**Standard policy** on every tenant-owned table:

```sql
using      (tenant_id in (select app.user_tenant_ids()))   -- select/update/delete
with check (tenant_id in (select app.user_tenant_ids()))   -- insert/update
```

Platform admins additionally pass via `app.is_platform_admin()` on reads.

**Service role.** The service-role/secret key bypasses RLS and is reserved for
provisioning, webhooks and admin jobs on the server. Normal user requests must
use the anon client bound to the user's JWT (Phase 2 wires request-scoped auth),
so RLS stays in force. `client.server.ts` must only be imported via dynamic
`import()` inside a server handler — never at route/module scope.

**Append-only audit.** `audit_logs` has SELECT + INSERT policies only (no
UPDATE/DELETE), and a `BEFORE UPDATE OR DELETE` trigger that raises
`feature_not_supported` — so even an RLS-bypassing writer cannot rewrite history.

**Custom-schema grants.** `0007_grants.sql` grants `USAGE`/`EXECUTE` on the `app`
schema to `anon`/`authenticated`/`service_role`. This is required because RLS
policy expressions execute functions with the *caller's* privileges, and
Supabase's default grants do not cover custom schemas.

---

## 5. Storage

`0006_storage_tenant_files.sql` creates a **private** bucket `tenant-files`
(`public = false`) and four policies on `storage.objects` restricting access to
objects whose path tenant segment is one the caller belongs to.

**Path convention:** `tenants/{tenant_id}/{module}/{uuid}-{filename}`

Only `tenants/{uuid}/...` paths are ever accessible, and only to members of that
tenant. Access to bytes is via signed URLs or RLS-checked API calls; there are
no public objects. Upload flows also insert a metadata row into `public.files`.

---

## 6. Local verification (no remote project touched)

Requires local Postgres binaries (`initdb`, `pg_ctl`, `psql`). The runner spins
up a throwaway cluster, applies a shim emulating Supabase's `auth` schema/roles,
runs all migrations + grants, then the RLS harness — and tears everything down.

```bash
export PATH="/opt/homebrew/opt/postgresql@14/bin:$PATH"   # if needed
bash supabase/tests/run_local_rls_check.sh
```

Expected tail:

```
RLS VERIFICATION PASSED: tenant isolation is enforced.
==> OK: migrations applied cleanly and RLS verification passed.
```

The harness proves, across two tenants/users:
read isolation, cross-tenant INSERT blocked, cross-tenant UPDATE affects 0 rows,
audit append works, authenticated cannot mutate audit rows, and the append-only
trigger blocks even a privileged (`service_role`) UPDATE/DELETE.

Frontend checks:

```bash
npm run build          # production build (passes)
npx eslint src/integrations/supabase   # clean
# npx tsc --noEmit surfaces PRE-EXISTING errors in
# src/routes/utility.tax-charges-setup.setup.tsx — unrelated to Phase 1.
```

---

## 7. Applying to your Supabase project

**Option A — Supabase CLI (recommended):**

```bash
# one-time
npm i -D supabase          # or: brew install supabase/tap/supabase
npx supabase login
npx supabase link --project-ref ijosczggsrvscponules

# push migrations
npx supabase db push

# seed dev data (dev projects only)
psql "$SUPABASE_DB_URL" -f supabase/seed.sql
```

**Option B — Dashboard SQL editor:**

1. Open your project → **SQL Editor**.
2. Run each `supabase/migrations/000{1..7}_*.sql` **in order**.
3. (dev only) run `supabase/seed.sql`.
4. Verify the bucket exists: **Storage** → `tenant-files` (private).

**Verify RLS on the remote DB** (uses the direct connection string from
Dashboard → Project Settings → Database):

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_verification.sql
```

It runs inside a transaction and **rolls back** — no residue. If your Supabase
version rejects the temporary `auth.users` inserts, create two users via the
Auth dashboard/API and adapt the two UUIDs at the top of the file instead.

**Link a dev user to the seeded tenant** (after creating a user in Auth):

```sql
insert into public.tenant_users (tenant_id, user_id, role)
values ('22222222-2222-2222-2222-222222222222', '<AUTH_USER_ID>', 'OWNER')
on conflict (tenant_id, user_id) do nothing;
```

---

## 8. Decisions & notes

- **`gen_random_uuid()`** is used instead of the blueprint's `uuidv7()` — the
  latter is not available in current Supabase Postgres. Swap later if desired.
- **RLS keyed off `auth.uid()` + `tenant_users`**, replacing the blueprint's
  `SET LOCAL app.tenant_id` idea, which does not fit Supabase's JWT model.
- A **minimal `tenant_users`** table is introduced now because RLS cannot resolve
  tenant context without it. It is the anchor Phase 2's full user/RBAC system
  extends — not a replacement for it.

---

## 9. Remaining blockers before Phase 2

1. Run the migrations against the remote project (CLI or Dashboard) — needs your
   DB password / access token, which are not in this environment.
2. Create at least one Auth user and link it via `tenant_users` to exercise RLS
   with a real JWT.
3. Phase 2 will add: Supabase Auth wiring, request-scoped server client bound to
   the user JWT, `requireSupabaseAuth` middleware, and the full user/RBAC tables.
```
