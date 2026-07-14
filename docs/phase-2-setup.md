# Phase 2 — Authentication & RBAC

This phase adds staff/customer authentication, session tracking + force-logoff,
the ~169-module permission matrix, and permission-filtered navigation on top of
the Phase 1 foundation. It does **not** modify or weaken any Phase 1 object
(tenant isolation, RLS, storage, audit logs, `tenant_users`).

> Source of truth: `docs/backend-blueprint/02-tenancy-auth-security.md`,
> `03-api-design.md`, `05-roadmap-and-gaps.md`.

---

## 1. Platform note (Supabase) — two documented deviations

The blueprint specifies **argon2id** password hashing and **per-tenant username**
login. Supabase Auth is the selected platform. Neither could be mapped 1:1, so —
per the project rule to never *silently* substitute — both are adapted openly:

| Blueprint | Adaptation on Supabase | Why it is safe |
|---|---|---|
| Argon2id, app-managed | **Supabase Auth manages passwords** (bcrypt); the app stores **no** password hashes | Managed, salted hashing; avoids hand-rolled crypto (which the rule forbids) |
| Per-tenant `username` login | Username maps to a deterministic synthetic auth email `‹username›@‹tenant-slug›.cms.local`; login stays **username + password** | Preserves username UX + per-tenant uniqueness; no email-only login; email built client-side from the subdomain slug, so there is no user-enumeration endpoint |

The real (contact) email is stored separately on `users.email`. OTP / MFA use
Supabase Auth's native OTP; `otp_challenges` / `password_reset_tokens` tables
exist for app-side auditing/rate-limiting bookkeeping.

**Authorization is never client-trusted.** Permissions are resolved
**database-side per request** via `SECURITY DEFINER` functions + RLS; nothing in
the JWT carries the permission matrix (blueprint Part 2 §2).

---

## 2. Migrations added

| File | Contents |
|---|---|
| `0008_rbac_core.sql` | `users, user_groups, user_group_members, user_branch_access, permission_modules, group_permissions` (+ indexes, touch triggers) |
| `0009_rbac_functions_and_rls.sql` | `app.current_app_user_id / is_tenant_admin / user_has_permission / user_branch_ids / user_can_access_branch` + RLS policies for all 0008 tables + grants |
| `0010_permission_modules_seed.sql` | **Generated** seed of **168 unique** modules (see §6) |
| `0011_sessions_and_auth_rpcs.sql` | `sessions, login_logs (append-only), otp_challenges, password_reset_tokens` + RLS + `public.me / me_permissions / me_navigation / has_permission / record_login / record_logout / revoke_session` + permission-change audit trigger |
| `0012_provisioning.sql` | `app.provision_tenant_rbac(tenant)`, `app.link_tenant_admin(...)` (privileged, service-role only) |
| `0013_bootstrap_tenant.sql` | `app.bootstrap_tenant(...)` — production-safe, idempotent first-tenant scaffold (plan/tenant/subscription/branch/FY/counters/settings/RBAC), service-role only |

All are idempotent (verified by double-apply of `0001`–`0013`).

---

## 3. RLS / tenant / branch / permission design

- **Tenant scope**: every new tenant-owned table has `tenant_id`, a
  `tenant_id`-leading index, and RLS. Read policies use the Phase 1 anchor
  `tenant_id IN (select app.user_tenant_ids())`.
- **Write gating** (RBAC admin surfaces) is permission-gated, not just tenant-
  scoped:
  - `users`, `user_groups`, memberships, branch access → require
    `utl.user-setup` (`add`/`modify`/`delete`) **or** tenant admin.
  - `group_permissions` → require `utl.access-rights` (`add`/`modify`/`delete`)
    **or** tenant admin.
- **Branch scope**: `app.user_branch_ids(tenant)` = tenant admin / `is_global`
  ⇒ all branches; otherwise `home_branch_id` ∪ `user_branch_access`.
  `app.user_can_access_branch(tenant, branch)` is the service-layer guard.
- **Effective permission**: OR across the user's active groups;
  `all_access` implies all five CRUDLS actions; tenant/platform admins
  implicitly hold everything.
- **Sessions**: users see their own; tenant admins / `utl.loggedin-users` list
  permission see all tenant sessions. Force-logoff (`revoke_session`) is
  permission-gated and sets `revoked_at`, after which `app.is_session_active()`
  returns false.
- **Append-only** `login_logs` (and Phase 1 `audit_logs`) enforced by the
  `app.tg_block_mutations()` trigger.
- **Secrets** (`otp_challenges`, `password_reset_tokens`) have RLS enabled with
  **no policies** — reachable only through `SECURITY DEFINER` functions.

---

## 4. API surface (Supabase mapping of the blueprint REST spec)

Implemented as RLS-protected tables + Postgres RPCs, called by the browser with
the RLS-scoped anon client (never the service role).

| Blueprint | Implementation |
|---|---|
| `POST /auth/login`, `/logout`, `/refresh` | Supabase Auth `signInWithPassword` / `signOut` / auto refresh (`src/lib/auth.tsx`) + `record_login` / `record_logout` |
| `GET /me`, `/me/permissions`, `/me/navigation` | `public.me()`, `public.me_permissions()`, `public.me_navigation()` |
| `GET /sessions`, `DELETE /sessions/:id` | `select from sessions` (RLS) + `public.revoke_session()` |
| `GET/POST /users`, `/groups` | `from('users')` / `from('user_groups')` (RLS + permission-gated) |
| `GET /permission-modules` | `from('permission_modules')` |
| `GET/PUT /groups/:id/permissions` | `from('group_permissions')` select + upsert |
| provisioning `/admin/tenants/:id/provision` | `app.provision_tenant_rbac` / `app.link_tenant_admin` |

Frontend wired: **login** (`/login`, new), **header user menu** (real user +
sign-out), **Logged-in Users** (live sessions + force-logoff), **User Setup**
(live users/groups read), **Access Rights** (live groups + matrix load/save via
the deterministic slug map that matches the seed). Each screen falls back to its
prior demo data when no session exists.

---

## 5. Supabase Dashboard / manual actions required

1. **Apply migrations** to the linked project:
   ```bash
   npx supabase link --project-ref <YOUR_PROJECT_REF>
   npx supabase db push
   ```
   (or paste `0008`–`0012` into the SQL editor in order).
2. **Auth → Providers → Email**: keep **Email** enabled (synthetic
   `*.cms.local` addresses are email identities). **Turn OFF "Confirm email"**
   so provisioned users can sign in without an inbox (these addresses are
   internal). Leave "Enable email signups" as you prefer — users are created by
   admins, not self sign-up.
3. Optional: **Auth → Rate limits** — tighten sign-in attempts (brute-force).
4. No public buckets, no client service-role key (unchanged from Phase 1).

---

## 6. Creating the FIRST real tenant + administrator (safe procedure)

A fresh live project has **no tenant**, and `supabase/seed.sql` is
development-only and must **not** be run remotely. The first tenant is created
with the production-safe, idempotent `app.bootstrap_tenant(...)`
(migration `0013`), which runs as the **service role** in the SQL editor — no
service-role key ever touches the browser. Do the four steps in order.

**Step 1 — bootstrap the tenant scaffold** (Dashboard → SQL editor):
```sql
select app.bootstrap_tenant(
  'yourco',                 -- p_slug: subdomain label ^[a-z0-9][a-z0-9-]{1,62}$
  'Your Courier Pvt Ltd',   -- p_name
  'YourCo',                 -- p_short_name (optional)
  'support@yourco.com',     -- p_support_email (optional)
  '+91 90000 00000'         -- p_support_phone (optional)
);
```
This creates (idempotently, once per slug): the plan (if missing), the tenant,
an active subscription, the **head-office branch**, the current **financial
year**, all **sequence counters**, the required **tenant settings**
(`password_policy`, `miscellaneous`, `active_financial_year`), and the RBAC
default groups `TENANT_ADMIN` / `OPERATIONS` / `ACCOUNTS`. It returns the new
`tenant_id` — copy it. Re-running with the same slug is safe (returns the same
tenant, no duplicates).

**Step 2 — create the auth identity** (Dashboard → Authentication → Add user):
- Email: `admin@yourco.cms.local` (the local-part is the username; the domain is
  `‹slug›.cms.local`)
- Password: a strong password; tick **Auto Confirm User**.
- Copy the new user's **UID**.

**Step 3 — link the administrator** (Dashboard → SQL editor, service role):
```sql
select app.link_tenant_admin(
  '<TENANT_UUID>',          -- returned by step 1
  '<AUTH_USER_UID>',        -- UID from step 2
  'admin',                  -- tenant username (must match the email local-part)
  'Administrator',          -- full name
  'admin@yourcompany.com',  -- real contact email (optional)
  null                      -- home branch id (optional)
);
```
This creates the `tenant_users` anchor, the `users` profile (type `ADMIN`), and
the `TENANT_ADMIN` membership — all idempotent.

**Step 4 — sign in** at `/login` with company code `yourco`, username `admin`,
and the password from step 2.

> ⚠️ The username's lowercased form **must** equal the email local-part, because
> login rebuilds the email as `‹username›@‹slug›.cms.local`.

After this, the admin creates further groups/permissions from **Access Rights**,
adds branches/financial years as needed, and manages sessions from
**Logged-in Users** in-app. `app.bootstrap_tenant` is the supported way to
onboard every subsequent tenant too (later replaced by the Phase 9 super-admin
console).

---

## 7. Verification results

Run the full local harness (ephemeral Postgres; applies `0001`–`0012`):
```bash
bash supabase/tests/run_local_rls_check.sh
```

| Requirement | Test | Result |
|---|---|---|
| Unauthenticated blocked | `rbac_verification.sql` `[unauth]` | PASS |
| Cross-tenant read/write fail | `[xtenant]`, `[xtenant-write]` | PASS |
| Unassigned branch blocked | `[branch]` | PASS |
| Missing permission blocks; granted allows | `[perm]`, `[perm-admin]` | PASS |
| Tenant admin can't cross tenants | `[xtenant]`, `[force-xtenant]` | PASS |
| Force-logoff invalidates session | `[force-logoff]` | PASS |
| Tenant bootstrap created once (idempotent) | `bootstrap_verification.sql` `[idempotent]` | PASS |
| Bootstrap scaffolds branch/FY/counters/settings/RBAC | `[children]` | PASS |
| Bootstrapped tenant isolated cross-tenant | `bootstrap_verification.sql` `[xtenant]` | PASS |
| Phase 1 RLS still passing | `rls_verification.sql` | PASS |
| Idempotent migrations | double-apply `0001`–`0013` | PASS (168 modules) |
| Build | `npm run build` | PASS |
| Lint (changed files) | `eslint` | 0 errors (2 provider-file warnings, same pattern as `tenant.tsx`) |

---

## 8. Known boundaries / decisions before Phase 3

- **New end-user creation from the browser** needs a Supabase Auth admin call
  (service role), which must not run in the client. Recommended follow-up: a
  `createServerFn` (service-role, server-only) `POST /users` that creates the
  auth identity then calls a definer `link_user`. Currently User Setup reads live
  data and creates **groups**/edits **permissions** (no auth identity needed);
  full user creation is the documented gap.
- **OTP / password-reset** rely on Supabase Auth delivery; the app tables are
  bookkeeping. Wiring the end-to-end OTP UI is deferred (schema is ready).
- **Hard token kill** on force-logoff (revoking the Supabase refresh token) is an
  out-of-band admin API action; the app-session `revoked_at` is the in-app
  boundary and is what the screens/tests use.
- Runtime end-to-end auth against the live Supabase project was **not** executed
  here (requires the migrations applied + first admin created per §5–6); the DB
  security core is fully proven by the SQL harness, and the frontend passes build.
