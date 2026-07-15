# BACKEND_IMPLEMENTATION_STATUS.md

**Single source of truth for continuing development (e.g. in Lovable).**

| Field | Value |
|-------|--------|
| Project | `swiftforge-core` (Courier Management System / CourierWala-faithful ERP) |
| Document purpose | Hand-off blueprint for backend continuation without redesigning UI |
| Generated from | Live repository inspection (not speculation) |
| Code changes in this task | **None** — documentation only |
| Primary path | `/Users/karthikkukkala/Desktop/Courier Management System/swiftforge-core/` |

---

## Table of contents

1. [Project Overview](#1-project-overview)
2. [Current Architecture](#2-current-architecture)
3. [Current Backend Status](#3-current-backend-status)
4. [Operations Reports](#4-operations-reports)
5. [Operations Report Matrix](#5-operations-report-matrix)
6. [Verify Existing Implementation](#6-verify-existing-implementation)
7. [Missing Backend](#7-missing-backend)
8. [Future Implementation Order](#8-future-implementation-order)
9. [Rules](#9-rules)
10. [Coding Standards](#10-coding-standards)
11. [Development Workflow](#11-development-workflow)
12. [Final Project Status](#12-final-project-status)

---

# 1. Project Overview

## 1.1 Product goal

This is a **multi-tenant Courier Management System** inspired by **CourierWala Express / Xpresion On Cloud**.

**Objective is not redesign.** Objective is:

- Keep the **CourierWala operator workflow and UI** (labels, field order, Report Type dropdowns, Search / Reset / Job Queue).
- Underneath, use a **modern, multi-tenant, RLS-protected Postgres backend** on Supabase, driven by **SECURITY DEFINER RPCs** (not a parallel REST microservice).

## 1.2 Overall architecture

```
Browser (React SPA / TanStack Start SSR)
    │
    ├─ Supabase Auth (email/password; username mapped to synthetic email)
    │
    └─ supabase-js ──► PostgREST ──► public.* SECURITY DEFINER RPCs
                                          │
                                          ├─ app.* helpers / SQL engines
                                          ├─ RLS on base tables
                                          └─ tenant_id isolation via app.user_tenant_ids()
```

There is **no Express/Fastify REST API server** for domain logic. Domain APIs are **Postgres functions** exposed through PostgREST as RPCs.

## 1.3 Frontend stack

From `package.json`:

| Concern | Technology |
|---------|------------|
| UI | React 19, Radix UI, Tailwind CSS 4, Lucide |
| Routing | TanStack Router + TanStack Start (`src/routes/*`, `src/routeTree.gen.ts`) |
| Data fetching | TanStack React Query |
| Forms / validation | react-hook-form, Zod (masters); report hubs use local state + Zod elsewhere |
| Build | Vite 8, Nitro (via Lovable/TanStack config) |
| Tests | Vitest |
| Lint | ESLint 9 + Prettier |

Key entry / shell files:

- `src/routes/__root.tsx` — app shell
- `src/components/app-sidebar.tsx` — sidebar from `src/lib/navigation.ts`
- `src/components/app-header.tsx` — branch / theme / search
- `src/lib/auth.tsx` — auth provider (not a folder)

## 1.4 Backend stack

| Concern | Technology |
|---------|------------|
| Database | PostgreSQL (Supabase-hosted + local via Supabase CLI) |
| Migrations | `supabase/migrations/0001_*.sql` … `0060_*.sql` (60 files) |
| API style | `public.*` SECURITY DEFINER RPCs + PostgREST |
| Auth | Supabase Auth (`auth.users`) linked via `tenant_users` |
| Storage | Tenant files (`0004`, `0006`) |
| Tests | `supabase/tests/*_verification.sql` + `bash supabase/tests/run_local_rls_check.sh` |

## 1.5 Supabase usage

Clients:

| File | Role |
|------|------|
| `src/integrations/supabase/client.ts` | Browser anon key; RLS applies |
| `src/integrations/supabase/client.server.ts` | Service role; **bypasses RLS**; server-only |

Env vars (typical):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server)

## 1.6 Authentication

Implemented in `src/lib/auth.tsx`:

1. Login via `supabase.auth.signInWithPassword`.
2. Username → email mapping: `<username>@<tenant-slug>.cms.local`.
3. After session: RPCs `me`, `me_permissions`.
4. Session tracking: `record_login` / `record_logout`; `localStorage` key `cms.session_id`.
5. UI permission checks are **advisory**; real enforcement is **RLS + RPC**.

Auth RPCs (migration `0011_sessions_and_auth_rpcs.sql`):  
`me`, `me_permissions`, `me_navigation`, `has_permission`, `record_login`, `record_logout`, `revoke_session`.

## 1.7 Multi-tenant implementation

| Layer | Mechanism |
|-------|-----------|
| Tables | Nearly all business tables have `tenant_id` |
| Membership | `tenant_users` links `auth.users` → tenant |
| Context helpers | `app.user_tenant_ids()`, `app.is_platform_admin()`, `app.current_user_id()` |
| RLS | Policies restrict rows to `tenant_id in (select app.user_tenant_ids())` |
| RPCs | SECURITY DEFINER functions resolve tenant from auth UID, never trust client-supplied tenant blindly |

Foundation migrations: `0001`–`0007`. RBAC: `0008`–`0013`.

Note: `src/lib/tenant.tsx` is a **hostname branding mock** (`default` / `companya` / `companyb`). Real tenancy is DB-backed.

## 1.8 Report engine (Phase 5)

Migrations `0042`–`0048`:

| Migration | Purpose |
|-----------|---------|
| `0042_reporting_foundation.sql` | Registry tables + core public RPCs |
| `0043_operational_reports.sql` | OPERATIONS hub SQL sources |
| `0044_financial_reports.sql` | FINANCIAL hub |
| `0045_accounts_receivable_reports.sql` | AR hub |
| `0046_audit_security_reports.sql` | AUDIT hub |
| `0047_dashboard_rollups.sql` | Dashboard rollups + RPCs |
| `0048_report_jobs.sql` | Async export jobs |

**Public report RPCs:**

- `list_report_definitions(p_hub text)`
- `get_report_definition(p_report_key text)`
- `validate_report_filters(p_report_key text, p_filters jsonb)`
- `execute_report(p_report_key, p_filters, p_page, p_page_size, p_sort_by, p_sort_dir)`
- `create_report_job` / `list_report_jobs` / `get_report_job` / `cancel_report_job` / `execute_report_job`
- Dashboard: `refresh_dashboard_rollups`, `get_dashboard_summary`, `get_dashboard_operations_series`

Internal dispatch: `app.execute_report_source(...)` (extended by 0043–0046).

Frontend wrappers: `src/lib/reports/resources.ts`, `src/lib/reports/jobs.ts`, `src/components/reports/report-runner.tsx`.

## 1.9 RPC usage pattern

```ts
const { data, error } = await supabase.rpc("execute_report", {
  p_report_key: "...",
  p_filters: { ... },
  p_page: 1,
  p_page_size: 50,
  p_sort_by: null,
  p_sort_dir: "desc",
});
```

Named parameters must match Postgres argument names (`p_*`). Errors are translated via `translateDbError` in masters helpers.

## 1.10 RLS usage

- Enabled on tenant-scoped tables.
- Policies typically: `tenant_id in (select app.user_tenant_ids())`.
- Append-only tables (audit, some logs) block update/delete.
- Harness: `supabase/tests/run_local_rls_check.sh` applies migrations + verification SQL packs.

## 1.11 Current folder structure (high level)

```
swiftforge-core/
├── package.json
├── vite.config.ts
├── docs/                          # phase-*-setup, backend-blueprint, PROJECT_*
├── supabase/
│   ├── migrations/                # 0001 … 0060
│   ├── tests/                     # *_verification.sql + harness
│   ├── config.toml
│   └── seed.sql
└── src/
    ├── components/                # UI including reports/
    ├── integrations/supabase/     # clients
    ├── lib/                       # auth, navigation, reports, masters, …
    ├── routes/                    # TanStack file routes
    ├── router.tsx
    ├── routeTree.gen.ts
    ├── server.ts / start.ts
    └── styles.css
```

Reports-related paths of special interest:

```
src/lib/operations-report-config.ts          # CourierWala Operations filter metadata
src/lib/reports/                             # Phase 5 TS clients + key packs
src/lib/reports/operations/api.ts            # Operations client API → Phase 5 RPCs
src/components/reports/operations/           # Operations UI (Phase 1 CourierWala restore)
src/components/reports/report-runner.tsx     # Generic engine runner
src/components/reports/report-hub-shell.tsx  # Dropdown hub for Statements/AR
src/routes/reports.operations.tsx
src/routes/reports.statements.tsx
src/routes/reports.awb.tsx
src/routes/reports.scan.tsx
src/routes/reports.ar-report.tsx
src/routes/reports.jobs.tsx                  # Internal jobs UI (not in primary nav)
src/routes/reports.run.*.tsx                 # Internal runner / redirect
```

---

# 2. Current Architecture

## 2.1 End-to-end request flow (reports)

```text
┌──────────────────────────────────────┐
│ Frontend page                        │
│ e.g. OperationsReportPage            │
│ /reports/operations                  │
└──────────────────┬───────────────────┘
                   │ calls
                   ▼
┌──────────────────────────────────────┐
│ Client API layer                     │
│ src/lib/reports/operations/api.ts    │
│ list / get / execute / export / queue│
│ (conceptual REST names in comments)  │
└──────────────────┬───────────────────┘
                   │ supabase.rpc(...)
                   ▼
┌──────────────────────────────────────┐
│ PostgREST schema cache               │
│ public.execute_report / …            │
└──────────────────┬───────────────────┘
                   │ SECURITY DEFINER
                   ▼
┌──────────────────────────────────────┐
│ Postgres                             │
│ validate filters → app.execute_…     │
│ tenant + permission checks           │
│ SQL against tenant-scoped tables     │
└──────────────────┬───────────────────┘
                   │ jsonb / table result
                   ▼
┌──────────────────────────────────────┐
│ UI: toast + optional results table   │
│ or navigate to /reports/jobs         │
└──────────────────────────────────────┘
```

## 2.2 Layer descriptions

### Layer A — Route / page

TanStack file routes under `src/routes/`. Example:

- `src/routes/reports.operations.tsx` → mounts `OperationsReportPage`.

Navigation for Reports (primary) is **only**:

Operations · Statements · AWB · Scan · AR Report  

(`src/lib/navigation.ts` — Report Runner / Report Jobs intentionally **not** in primary nav).

### Layer B — UI components

- CourierWala Operations forms: `src/components/reports/operations/**`
- Shared engine runner: `ReportRunner` + filter builder / table / toolbar
- Hub dropdown for FINANCIAL/AR catalogs: `ReportHubShell`

### Layer C — Client domain libraries

| Module | Path |
|--------|------|
| Phase 5 RPC wrappers | `src/lib/reports/resources.ts`, `jobs.ts` |
| Engine key packs | `operationalKeys.ts`, `financialKeys.ts`, `arKeys.ts`, `auditKeys.ts` |
| Operations bridge | `src/lib/reports/operations/api.ts` |
| CourierWala field map | `src/lib/operations-report-config.ts` |
| AWB / Scan legacy configs | `awb-report-config.ts`, `scan-report-config.ts` |

### Layer D — Supabase JS

`supabase.rpc("name", { p_... })` with anon key + user JWT.

### Layer E — Database

- Registry: `report_definitions`, `report_filters`, categories, etc. (`0042`)
- Jobs: `report_jobs` (`0048`)
- Source SQL in `app` schema functions

## 2.3 Auth + tenancy on every call

```text
JWT (auth.uid)
  → app.current_user_id()
  → app.user_tenant_ids()
  → RPC resolves tenant + has_permission(slug)
  → query filtered by tenant_id
```

Anonymous calls without tenant context return errors such as `42501 No tenant context for the current user` (function **exists**; caller is unauthorized).

## 2.4 What is NOT in the architecture

- No Express `/api/reports/operations` HTTP server
- No second reporting microservice
- No duplicate `report_definitions` table family for CourierWala-only metadata

CourierWala **layout** metadata for Operations lives in **TypeScript** (`operations-report-config.ts`). Engine **execution** metadata lives in **Postgres** Phase 5 registry.

---

# 3. Current Backend Status

Status legend:

| Status | Meaning |
|--------|---------|
| **Implemented** | Migrations + RPCs + UI wired for core flows |
| **Partial** | UI and/or some RPCs exist; gaps remain |
| **Not implemented** | Missing or demo/toast only |

## 3.1 Platform

| Module | Status | Evidence |
|--------|--------|----------|
| Foundation / helpers | Implemented | `0001`–`0007` |
| Tenancy | Implemented | `0002`, RLS harness |
| Auth / sessions / RBAC | Implemented | `0008`–`0013`, `src/lib/auth.tsx` |
| Files / storage | Implemented | `0004`, `0006` |
| Audit log foundation | Implemented | `0005` |

## 3.2 Masters (Phase 3)

| Area | Status | Notes |
|------|--------|-------|
| Master core / geo / catalog / parties / vendors | Implemented (backend) | `0014`–`0029` |
| Many sales masters UI | Partial | Routes exist; see `docs/PROJECT_STATUS.md` pending list |
| Customer / Vendor / Operation masters UI | Largely implemented | PROJECT_STATUS completed list |

## 3.3 Transactions (Phase 4)

| Area | Status | Migrations |
|------|--------|------------|
| Pickup / AWB / Manifest / DRS / POD | Implemented | `0030`–`0038` |
| Tracking | Implemented | `0039` |
| Finance vouchers | Implemented | `0040` |
| Rating engine | Implemented | `0041` |
| Transaction UIs | Partial → mostly present | See PROJECT_STATUS |

## 3.4 Reports (Phase 5)

| Area | Status | Notes |
|------|--------|-------|
| Reporting foundation RPCs | Implemented | `0042` |
| Operational engine keys (12) | Implemented | `0043` + `OPERATIONAL_REPORT_KEYS` |
| Financial engine keys (8) | Implemented | `0044` |
| AR engine keys (8) | Implemented | `0045` |
| Audit engine keys (10) | Implemented | `0046` |
| Dashboard rollups | Implemented | `0047` |
| Report jobs / export | Implemented | `0048` |
| **Operations CourierWala UI** | Implemented (frontend) | Custom page + 17 filters |
| **Operations → engine mapping** | **Partial** | Only subset mapped (see §5) |
| Statements UI | Partial | `ReportHubShell` + FINANCIAL list (not CourierWala legacy layout) |
| AWB / Scan report UIs | Partial | Legacy dropdown UIs; demo/toast generate |
| AR UI | Partial | `ReportHubShell` + AR keys |
| Internal `/reports/run`, `/reports/jobs` | Implemented | Admin/deep-link; not primary nav |

## 3.5 Utility (Phase 6)

| Area | Status | Migrations |
|------|--------|------------|
| Excel import suite | Implemented | `0049` |
| Rate / zone update jobs | Implemented | `0050`–`0051` |
| Tax / fuel setup | Implemented | `0052` |
| Notifications / email config | Implemented | `0053` |
| Serviceable pincode | Implemented | `0054` |
| Utility UIs | Mostly present | PROJECT_STATUS |

## 3.6 Integrations (Phase 7)

| Milestone | Migration | Status |
|-----------|-----------|--------|
| 7A Integration framework | `0055` | Implemented (code + local harness) |
| 7B Carrier booking/tracking | `0056` | Implemented |
| 7C Public tracking / webhooks | `0057` | Implemented locally; remote deploy previously blocked by `hmac` search_path (file includes fix) |
| 7D Notification delivery | `0058` | Implemented |
| 7E IRN | `0059` | Implemented |
| 7F Customs EDI | `0060` | Implemented |

Remote migration drift may still exist for `0057`–`0060` depending on environment; verify with `npx supabase migration list --linked` before assuming production parity.

## 3.7 Settings / dashboard / other

| Module | Status |
|--------|--------|
| Dashboard shell | Partial — UI exists; rollup RPCs available |
| Utility Users (setup, access rights, logged-in) | Implemented UI + Phase 2 RPCs |
| Phase 8+ (blueprint gaps) | Not started |

---

# 4. Operations Reports

This section is the **primary hand-off focus**.

## 4.1 Product intent

CourierWala **Operations** hub:

1. Page opens with **Report Type** dropdown only (plus “Report” chrome).
2. Selecting a type dynamically renders **that report’s filters**.
3. Footer: 31-day note, Open Job Queue, Add to Job Queue, Search/Download, Reset.
4. Backend should eventually run real SQL via Phase 5 engine **without changing the UI**.

## 4.2 Current frontend implementation

| Piece | Path |
|-------|------|
| Route | `src/routes/reports.operations.tsx` |
| Page | `src/components/reports/operations/operations-report-page.tsx` |
| Types / empty form | `src/components/reports/operations/types.ts` |
| Field primitives | `src/components/reports/operations/fields/ops-fields.tsx` |
| Chrome | `.../fields/report-form-chrome.tsx` |
| Layout helper | `.../filters/filter-layout.tsx` |
| Registry | `.../filters/registry.tsx` |
| 17 filter components | `.../filters/*-filters.tsx` |

**Initial UI:** Report Type only.  
**After selection:** matching component from `REPORT_FILTER_COMPONENTS`.

Report Type options come from `listOperationsReports()` → `REPORT_DEFINITIONS` in `src/lib/operations-report-config.ts` (**17** entries, CourierWala names).

## 4.3 Current metadata implementation

Two metadata layers:

### A) UI layout metadata (TypeScript — source of field order)

`src/lib/operations-report-config.ts`:

- `REPORT_DEFINITIONS[]` — `id`, `label`, `fields`, `secondRowFields`, `extraRows`, `colSpans`, option lists, `action` (`search` \| `download`), `typeMode`
- `FIELD_LABELS`, `LOOKUP_FIELDS`
- Constants: `ACTION_LOG_REPORT_TYPES`, `REPORT_USERS`, `AWB_PRINT_TYPES`, etc.

This is what makes each Operations form match CourierWala screenshots.

### B) Engine execution metadata (Postgres — Phase 5)

Tables/functions from `0042`+:

- `public.report_definitions` keyed by **engine** `report_key` (e.g. `drs-register`), **not** CourierWala ids (`drs-report`)
- Filters / columns / permissions stored with engine keys
- SQL implemented in `app.execute_report_source` branches (`0043`–`0046`)

## 4.4 Current report configuration (CourierWala ids)

| id | label | action |
|----|-------|--------|
| `action-log` | Action Log | search |
| `awb-printing` | AWB Printing | download |
| `comment-view` | Comment View Report | search |
| `drs-report` | DRS Report | search |
| `forwarding-no-missing` | Forwarding No Missing Report | search |
| `login-log` | Login Log | search |
| `manifest-pod` | Manifest POD Report | search |
| `manifest-report` | Manifest Report | search |
| `mis-report` | MIS Report | search |
| `ok-delivery` | OK Delivery | search |
| `scan-report` | Scan Report | search |
| `unassigned-drs` | Unassigned DRS Report | search |
| `unassigned-manifest` | Unassigned Manifest Report | search |
| `unassigned-obc` | Unassigned OBC Report | search |
| `undelivery` | Undelivery Report | search |
| `user-analysis` | User Analysis Report | search |
| `user-entry-log` | User Entry Log Report | search |

## 4.5 Current component structure

```text
OperationsReportPage
  ReportFormChrome ("Report" pill)
    Select Report Type
    └─ REPORT_FILTER_COMPONENTS[id]
         OpsFilterLayout(def from REPORT_DEFINITIONS)
           OpsGrid rows
             OpsReportField / lookups / Details-Summary / selects
  Footer actions (31-day, queue, Search/Download, Reset)
  Optional results table (when execute returns rows)
```

Each of the 17 `*-filters.tsx` files is a thin wrapper that binds one `REPORT_DEFINITIONS` entry to `OpsFilterLayout`.

## 4.6 Current API flow (client)

File: `src/lib/reports/operations/api.ts`

Conceptual REST comments (not HTTP routes):

| Method | Role |
|--------|------|
| `listOperationsReports()` | List 17 CourierWala reports + `engineKey` |
| `getOperationsReport(id)` | Definition + `engineKey` |
| `validateOperationsForm(def, form)` | Client 31-day / date-order rules |
| `formToEngineFilters(form)` | UI form → snake_case jsonb bag |
| `executeOperationsReport(id, form)` | Validate → RPC execute or `pending_engine` |
| `exportOperationsReport(id, form, format)` | Jobs path when mapped |
| `queueOperationsReport(id, form)` | `create_report_job` when mapped |

`engineKey` resolution (`resolveEngineKey`):

1. `OPERATIONS_HUB_KEY_MAP[id]` if non-null  
2. else `AUDIT_HUB_KEY_MAP[id]` if non-null  
3. else `null` → pending engine

## 4.7 Current RPC flow (when mapped)

```text
executeOperationsReport
  → validateOperationsForm (client)
  → formToEngineFilters
  → supabase.rpc validate_report_filters(p_report_key=engineKey, p_filters)
  → supabase.rpc execute_report(...)
  → rows/columns/total back to page
```

Export / queue:

```text
create_report_job(p_report_key, p_filters, p_output_format)
execute_report_job(p_job_id)   # export path also runs job immediately
```

Wrappers: `src/lib/reports/jobs.ts`, `src/lib/reports/resources.ts`.

## 4.8 Current execution flow (page)

`operations-report-page.tsx` `runSearch()`:

1. Require selected report.
2. Client validate dates.
3. If **Add to Job Queue** → `queueOperationsReport`.
4. Else if `action === "download"` (AWB Printing) → `exportOperationsReport(..., "PDF")`.
5. Else → `executeOperationsReport`.
6. On `pending_engine` → toast message; no fake SQL.
7. On `ok` → toast + optional result table.

## 4.9 Current validation

**Client (`validateOperationsForm`):**

- If report has From/To fields: both required, From ≤ To, span ≤ **31 days**.
- AWB Printing has no date fields in config → date rule skipped.

**Server (mapped only):**

- `validate_report_filters` against Phase 5 filter definitions for the **engine** key.
- Permission slug checks inside RPCs.
- Tenant isolation via SECURITY DEFINER + RLS.

**Gap:** UI filter keys (CourierWala) are mapped through `formToEngineFilters` heuristically. Engine filter keys may not be a perfect 1:1 for every field; mapped reports may need filter-key alignment work when testing live data.

## 4.10 Current export

- Mapped reports: `create_report_job` + `execute_report_job` (CSV/XLSX in jobs module; AWB Printing UI triggers export with `"PDF"` format string — confirm engine supports that format for the target key).
- Unmapped: `pending_engine` toast.
- Job list UI: `/reports/jobs` (internal).

## 4.11 Current queue implementation

- Checkbox **Add to Job Queue** on Operations page.
- Calls `queueOperationsReport` → `create_report_job` when `engineKey` present.
- Link **Click Here Open Job Queue** → `/reports/jobs` when authenticated.
- Unmapped: toast that mapping is unavailable (no silent fake success that invents SQL).

## 4.12 Current report mappings

### `OPERATIONS_HUB_KEY_MAP` (`src/lib/reports/operationalKeys.ts`)

| CourierWala id | Engine key |
|----------------|------------|
| `drs-report` | `drs-register` |
| `manifest-report` | `manifest-register` |
| `manifest-pod` | `pod-report` |
| `mis-report` | `mis-operational-summary` |
| `ok-delivery` | `delivery-report` |
| `scan-report` | `scan-reconciliation-report` |
| `undelivery` | `undelivered-report` |
| `login-log` | `null` (resolved via audit map) |
| `action-log` | `null` (resolved via audit map) |
| `awb-printing` | `null` |
| `comment-view` | `null` |
| `forwarding-no-missing` | `null` |
| `unassigned-drs` | `null` |
| `unassigned-manifest` | `null` |
| `unassigned-obc` | `null` |
| `user-analysis` | `null` (resolved via audit map) |
| `user-entry-log` | `null` |

### `AUDIT_HUB_KEY_MAP` (`src/lib/reports/auditKeys.ts`)

| CourierWala id | Engine key |
|----------------|------------|
| `action-log` | `action-log` |
| `login-log` | `login-log` |
| `user-analysis` | `user-activity-report` |
| `user-entry-log` | `null` |

### Phase 5 OPERATIONS engine keys that exist but are **not** CourierWala Operations dropdown items

From `OPERATIONAL_REPORT_KEYS`:

`pickup-register`, `awb-register`, `manifest-inscan-report`, `tracking-history`, `shipment-status-report`  

These are available via engine / ReportRunner, not via the CourierWala Operations Type list.

## 4.13 Current pending reports (UI ready, engine not mapped)

- AWB Printing  
- Comment View Report  
- Forwarding No Missing Report  
- Unassigned DRS Report  
- Unassigned Manifest Report  
- Unassigned OBC Report  
- User Entry Log Report  

Plus: mapped reports still need **live filter-key / permission / data** verification against real tenants.

---

# 5. Operations Report Matrix

Columns:

- **Frontend** — CourierWala form exists  
- **Filters** — fields from config rendered  
- **Validation** — client 31-day (where dates exist)  
- **Mapped Engine** — non-null `engineKey`  
- **RPC Connected** — execute path can call Phase 5  
- **Export / Queue** — jobs path when mapped  
- **Backend Complete** — UI + correct SQL + filters + permissions proven  
- **Pending Work** — remaining gaps  

| Report Name | Frontend | Filters | Validation | Mapped Engine | RPC Connected | Export | Queue | Backend Complete | Pending Work |
|-------------|----------|---------|------------|---------------|---------------|--------|-------|------------------|--------------|
| Action Log | Yes | Yes | Yes | `action-log` | Yes | Yes* | Yes* | **No** | Prove filters/SQL/permissions live; Action Log secondary report types |
| AWB Printing | Yes | Yes | N/A dates | — | No | No | No | **No** | Full engine pack (print/download semantics) |
| Comment View Report | Yes | Yes | Yes | — | No | No | No | **No** | Engine key + SQL + filters |
| DRS Report | Yes | Yes | Yes | `drs-register` | Yes | Yes* | Yes* | **Partial** | Align `formToEngineFilters` ↔ engine filters; live QA |
| Forwarding No Missing | Yes | Yes | Yes | — | No | No | No | **No** | Full engine pack |
| Login Log | Yes | Yes | Yes | `login-log` | Yes | Yes* | Yes* | **Partial** | Live QA vs CourierWala columns |
| Manifest POD Report | Yes | Yes | Yes | `pod-report` | Yes | Yes* | Yes* | **Partial** | Filter alignment + live QA |
| Manifest Report | Yes | Yes | Yes | `manifest-register` | Yes | Yes* | Yes* | **Partial** | Filter alignment + live QA |
| MIS Report | Yes | Yes | Yes | `mis-operational-summary` | Yes | Yes* | Yes* | **Partial** | Secondary report type / product type mapping |
| OK Delivery | Yes | Yes | Yes | `delivery-report` | Yes | Yes* | Yes* | **Partial** | Rich filter bag alignment |
| Scan Report | Yes | Yes | Yes | `scan-reconciliation-report` | Yes | Yes* | Yes* | **Partial** | Secondary report type mapping |
| Unassigned DRS | Yes | Yes | Yes | — | No | No | No | **No** | Full engine pack |
| Unassigned Manifest | Yes | Yes | Yes | — | No | No | No | **No** | Full engine pack |
| Unassigned OBC | Yes | Yes | Yes | — | No | No | No | **No** | Full engine pack |
| Undelivery Report | Yes | Yes | Yes | `undelivered-report` | Yes | Yes* | Yes* | **Partial** | Live QA |
| User Analysis Report | Yes | Yes | Yes | `user-activity-report` | Yes | Yes* | Yes* | **Partial** | Confirm column/UX parity |
| User Entry Log Report | Yes | Yes | Yes | — | No | No | No | **No** | Decide vs Action Log overlap; engine pack |

\*Export/Queue “Yes” means client **calls** Phase 5 job RPCs when mapped — not that every format (e.g. PDF for AWB Printing) is fully certified.

---

# 6. Verify Existing Implementation

Perform these checks before adding any new backend for Operations.

## 6.1 No duplicate report engine

- **Single engine:** Phase 5 migrations `0042`–`0048`.
- Operations client **only** imports `executeReport`, `validateReportFilters`, `createReportJob`, `executeReportJob` from `src/lib/reports`.
- No second SQL reporting framework under `src/server` for Operations.

## 6.2 No REST Operations API

Verified by codebase search:

- No `createAPIFileRoute` for reports.
- No Express `/api/reports` routes.
- Comments in `api.ts` saying `GET /reports/operations` are **documentation aliases** for client functions, not HTTP endpoints.
- Page route `/reports/operations` is **UI only** (TanStack Router).

## 6.3 No unnecessary parallel tables

- CourierWala layout is TS config, not a second `report_definitions` schema.
- Plan explicitly avoided new parallel registry tables in Operations Phase 1.

## 6.4 Primary nav correctness

`src/lib/navigation.ts` Reports items:

- Operations, Statements, AWB, Scan, AR Report only.

`/reports/run` redirects to Operations; `/reports/jobs` remains internal.

## 6.5 Phase 5 RPC surface still canonical

Public functions to reuse / extend:

```
list_report_definitions
get_report_definition
validate_report_filters
execute_report
create_report_job
list_report_jobs
get_report_job
cancel_report_job
execute_report_job
```

Do **not** invent `public.execute_operations_drs_report` style one-offs unless blueprint requires it; prefer extending `app.execute_report_source` + registry rows.

## 6.6 Unit coverage already present

- `src/lib/reports/operations/api.test.ts` — 17 reports listed; mappings for DRS/Action Log/Login/User Analysis; 31-day validation.
- `operationalKeys.test.ts`, `auditKeys.test.ts`, etc.

## 6.7 Verification commands

```bash
cd swiftforge-core
bash supabase/tests/run_local_rls_check.sh   # includes Phase 5 report suites
npm test
npx eslint src/components/reports/operations src/lib/reports/operations
npm run build
```

---

# 7. Missing Backend

**Most important section for Lovable / next agent.**

For each incomplete or partial Operations report, implement backend by **extending Phase 5**, then mapping the CourierWala id.

## 7.1 Shared missing work (all mapped reports)

Even when `engineKey` is set:

1. **Filter key alignment** — verify every UI field in `formToEngineFilters` matches `report_filters` for that engine key (or teach mapper per report).
2. **Permission slugs** — operator role must have the report’s `permission_slug`.
3. **Live data QA** — run Search signed-in; compare columns to CourierWala.
4. **Export formats** — certify CSV/XLSX (and PDF if required) via `report_jobs`.
5. **Details vs Summary** — ensure `type` / Details-Summary toggle is honored in SQL when present.

## 7.2 Unmapped reports — detailed needs

### AWB Printing (`awb-printing`)

Needs:

- [ ] Engine `report_key` (new or existing) registered in `report_definitions`
- [ ] Filter metadata matching UI (type, customer, origin, SC, product, destination, AWB range, manifest, format, copies, CSB, printing forward no.)
- [ ] Validation rules in `validate_report_filters`
- [ ] SQL / print artifact generation (download semantics — not only tabular execute)
- [ ] `OPERATIONS_HUB_KEY_MAP["awb-printing"] = "<engine-key>"`
- [ ] Export/queue path certified
- [ ] Permissions

### Comment View Report (`comment-view`)

Needs:

- [ ] Engine key + definition  
- [ ] Filters: from/to, origin, service center, comment  
- [ ] SQL over shipment comments / tracking comments tables (`0039` tracking foundation)  
- [ ] Map in `OPERATIONS_HUB_KEY_MAP`  
- [ ] Export/queue  

### Forwarding No Missing Report (`forwarding-no-missing`)

Needs:

- [ ] Engine key + definition  
- [ ] Filters: dates, customer, origin, SC, product, vendor, destination, customer type, status, “Forwarding Label not Generated”  
- [ ] SQL against shipments / forwarding label flags  
- [ ] Mapping + export/queue  

### Unassigned DRS Report (`unassigned-drs`)

Needs:

- [ ] Engine key + definition  
- [ ] Filters per config (`unassigned-drs` entry)  
- [ ] SQL: DRS lines / shipments not assigned (use DRS tables from `0036`–`0037`)  
- [ ] Mapping + export/queue  

### Unassigned Manifest Report (`unassigned-manifest`)

Needs:

- [ ] Engine key + definition  
- [ ] Filters including service type, payment type, branch type, Details/Summary  
- [ ] SQL: unassigned manifest candidates (`0034`–`0035`)  
- [ ] Mapping + export/queue  

### Unassigned OBC Report (`unassigned-obc`)

Needs:

- [ ] Engine key + definition  
- [ ] Filters per `unassigned-obc` config  
- [ ] SQL against OBC tables from transaction migrations  
- [ ] Mapping + export/queue  

### User Entry Log Report (`user-entry-log`)

Needs:

- [ ] Product decision: overlap with `action-log` vs dedicated semantics  
- [ ] Engine key (currently `AUDIT_HUB_KEY_MAP` is `null`)  
- [ ] Filters: dates, user type, log type  
- [ ] SQL (login/entry audit sources from Phase 2 sessions / audit)  
- [ ] Mapping + export/queue  

## 7.3 Mapped but incomplete (must still finish)

For each: **do not rebuild UI**. Extend backend + mapper only.

| Report | Engine key | Missing / risk |
|--------|------------|----------------|
| DRS Report | `drs-register` | Filter parity (customer, FE, Details/Summary) |
| Manifest Report | `manifest-register` | Vendor/destination/type parity |
| Manifest POD | `pod-report` | Manifest no. / status / type parity |
| MIS Report | `mis-operational-summary` | Zone / secondary report type / product type |
| OK Delivery | `delivery-report` | Large filter set parity |
| Scan Report | `scan-reconciliation-report` | Secondary report type options |
| Undelivery | `undelivered-report` | Product/payment/customer type parity |
| Action Log | `action-log` | Secondary report type list + optional AWB No. |
| Login Log | `login-log` | User type / user dropdown vs engine filters |
| User Analysis | `user-activity-report` | Origin/SC/user parity |

## 7.4 Engine keys that exist but are unused by CourierWala Operations UI

Optional future work (do **not** add to dropdown unless product asks):

- `pickup-register`
- `awb-register`
- `manifest-inscan-report`
- `tracking-history`
- `shipment-status-report`

## 7.5 Other report hubs (out of Operations scope — for awareness)

| Hub | UI state | Backend |
|-----|----------|---------|
| Statements | `ReportHubShell` + FINANCIAL keys | Phase 5C engine present; CourierWala Statements layout **not** restored |
| AR | `ReportHubShell` + AR keys | Phase 5D present; legacy AR config unused |
| AWB / Scan pages | Legacy dropdown UIs | Mostly demo/toast; not Operations |

**Do not start Statements backend redesign until Operations backend matrix is complete**, unless product prioritizes otherwise.

---

# 8. Future Implementation Order

**Mandatory sequence for every Operations report:**

### Step 1 — Verify frontend

- Open `/reports/operations`
- Select the report
- Confirm field labels, order, lookups, Details/Summary, footer match CourierWala
- Confirm no UI redesign is required

### Step 2 — Verify existing backend

- Check whether an engine key already exists in Phase 5
- Read `get_report_definition(engine_key)` filters/columns
- Compare to `formToEngineFilters` output
- Run RLS/report verification SQL if available

### Step 3 — Implement backend

Only then:

- Add/extend `report_definitions` / filters via **new migration** (do not rewrite `0042`–`0048` history casually; prefer additive migrations)
- Extend `app.execute_report_source` for new keys
- Set `OPERATIONS_HUB_KEY_MAP` / `AUDIT_HUB_KEY_MAP`
- Adjust `formToEngineFilters` **only if needed** (prefer engine accepting mapped keys)

### Step 4 — Test

- Signed-in Search returns rows or empty set without schema-cache / pending_engine errors
- Validation rejects >31 days
- Export/queue creates job when required
- `npm test`, report verification SQL, build

### Step 5 — Move to next report

**Never** implement multiple unmapped reports in parallel in one change set if it risks mixed incomplete mappings.  
**Never** skip Steps 1–2.

### Suggested order for remaining unmapped work

1. User Entry Log (audit adjacency)  
2. Comment View (tracking comments)  
3. Unassigned DRS  
4. Unassigned Manifest  
5. Unassigned OBC  
6. Forwarding No Missing  
7. AWB Printing (download/print complexity — last among these)

Then harden **mapped** reports filter parity in the same 1–5 loop.

---

# 9. Rules

These rules are **mandatory** for any continuation agent (including Lovable):

1. **Never redesign UI.**  
2. **Never rename reports** or change CourierWala display labels.  
3. **Never change field order** or filter layout vs `operations-report-config.ts` / screenshots.  
4. **Never change footer workflow** (31-day note, Job Queue, Search/Reset).  
5. **Never introduce a new REST backend** for Operations.  
6. **Never duplicate the report engine.** Extend Phase 5.  
7. **Always reuse** `validate_report_filters` / `execute_report` / job RPCs when possible.  
8. **Extend** architecture; do not replace migrations `0042`–`0048` with a parallel system.  
9. **Preserve multi-tenant** isolation and RLS patterns.  
10. **Preserve** current project structure (`src/lib/reports`, `supabase/migrations`).  
11. **Do not** put Report Catalog / Report Runner / Report Jobs into primary Reports nav.  
12. **Do not** start Statements / AWB / Scan / AR CourierWala restores until Operations backend matrix is agreed complete (unless product explicitly reprioritizes).  
13. **Do not** edit this status file’s meaning by changing code without updating the matrix.

---

# 10. Coding Standards

## 10.1 Folder organization

| Area | Convention |
|------|------------|
| Routes | `src/routes/<area>.<page>.tsx` TanStack file routes |
| Domain UI | `src/components/<domain>/` |
| Domain logic | `src/lib/<domain>/` |
| SQL | `supabase/migrations/NNNN_description.sql` (monotonic) |
| SQL tests | `supabase/tests/<name>_verification.sql` |

## 10.2 Naming conventions

| Kind | Pattern | Example |
|------|---------|---------|
| CourierWala ops id | kebab-case | `drs-report` |
| Engine report_key | kebab-case | `drs-register` |
| Public RPC | snake_case | `execute_report` |
| RPC args | `p_*` | `p_report_key` |
| React components | PascalCase | `DrsFilters` |
| TS files | kebab-case | `drs-filters.tsx` |

## 10.3 RPC conventions

- Prefer `public` SECURITY DEFINER wrappers; keep heavy SQL in `app` schema.
- Always resolve tenant from auth context inside RPC.
- Check permissions via established helpers (`has_permission` / slug on definition).
- Return jsonb objects with stable keys for the TS clients.

## 10.4 Report conventions

- Registry row per executable report.
- Filters declared in metadata, validated before execute.
- 31-day span is a product rule for Operations UI (also enforced in many engine defs via `max_date_span_days`).
- Jobs for heavy/export work (`0048`).

## 10.5 Component conventions

- Operations: one filter component file per report + shared primitives.
- Do not create 17 separate **routes**.
- Prefer composing `OpsReportField` over copy-paste markup.

## 10.6 TypeScript conventions

- Strict typing for form state (`OperationsReportForm`).
- Vitest colocated `*.test.ts` for maps/API.
- Avoid `any`; use `Record<string, unknown>` for jsonb bridges when needed.

---

# 11. Development Workflow

Every future Operations backend feature must follow:

1. **Analyze** existing implementation (this doc + files cited).  
2. **Verify frontend** for the single report under change.  
3. **Verify backend** (existing engine key? filters? permissions?).  
4. **Implement backend** (additive migration + map + mapper fixes).  
5. **Test** (unit + SQL harness + manual signed-in Search).  
6. **Build** (`npm run build`).  
7. **Ensure no regressions** (other Operations types still render; nav unchanged).  
8. **Commit** (only when the human asks — follow repo git rules).  

Only then continue to the next report.

Useful commands:

```bash
npm run dev
npm test
npm run lint
npm run build
bash supabase/tests/run_local_rls_check.sh
npx supabase migration list --linked   # if using remote
```

Related docs already in repo:

- `docs/phase-5-setup.md`
- `docs/backend-blueprint/04-workflows-reports-jobs.md`
- `docs/backend-blueprint/05-roadmap-and-gaps.md`
- `docs/PROJECT_RULES.md`
- `docs/DEVELOPMENT_GUIDE.md`

---

# 12. Final Project Status

## 12.1 Completed (relevant to this hand-off)

| Item | Status |
|------|--------|
| Multi-tenant foundation + RLS | Done |
| Auth / RBAC RPCs | Done |
| Phase 3–4 masters/transactions backend | Largely done |
| Phase 5 report engine + jobs | Done |
| Phase 6 utilities backend | Done |
| Phase 7 integrations code | Done (verify remote apply) |
| Operations CourierWala **UI** (17 reports) | Done |
| Operations client API wrapping Phase 5 | Done |
| Primary Reports nav restored | Done |

## 12.2 In progress

| Item | Status |
|------|--------|
| Operations **backend completeness** per matrix | In progress (mapped partial; unmapped pending) |
| Filter-key alignment for mapped reports | In progress / unproven at scale |

## 12.3 Pending

| Item | Status |
|------|--------|
| 7 unmapped Operations engine packs | Pending |
| Statements / AWB / Scan CourierWala-faithful restores | Pending (explicitly out of Operations Phase 1) |
| Phase 8+ blueprint items | Pending |

## 12.4 Blocked / watch items

| Item | Notes |
|------|-------|
| Remote migration parity | Confirm `0057`–`0060` applied on linked project |
| PDF export for AWB Printing | Engine/job MIME support may be incomplete |
| `tsc --noEmit` | Historically has unrelated errors in other modules; check report paths specifically |

## 12.5 Approximate completion percentages

Estimates for planning only (backend+UI product readiness):

| Module | Approx. complete | Notes |
|--------|------------------|-------|
| Platform (tenant/auth/RLS) | ~95% | Production-hardening ongoing |
| Masters backend | ~90% | Some sales UIs pending |
| Transactions backend | ~85–90% | Complex edge cases remain |
| Reports engine (Phase 5 core) | ~90% | Engine exists |
| **Operations CourierWala UI** | ~95% | Frontend restored |
| **Operations backend (all 17)** | **~45–55%** | ~10 mapped/partial, ~7 unmapped |
| Statements (CourierWala fidelity) | ~40% | Engine yes; UI not legacy |
| AWB/Scan report pages | ~35% | UI demo-ish |
| AR reports | ~60% | Engine + hub shell |
| Utility | ~85% | |
| Integrations (Phase 7) | ~80–90% | Env deploy caveats |
| **Overall product** | **~70–75%** | Rough |

## 12.6 One-line summary for Lovable

> **Frontend Operations is CourierWala-complete; backend must extend the existing Phase 5 Supabase RPC report engine report-by-report—never a new REST stack—starting with verification of mapped reports, then implementing the seven unmapped engine packs.**

---

## Appendix A — Key file index

| Path | Why it matters |
|------|----------------|
| `src/lib/operations-report-config.ts` | CourierWala Operations field metadata |
| `src/lib/reports/operations/api.ts` | Bridge to Phase 5 RPCs |
| `src/lib/reports/operationalKeys.ts` | Ops id → engine key |
| `src/lib/reports/auditKeys.ts` | Audit id → engine key |
| `src/lib/reports/resources.ts` | `execute_report` client |
| `src/lib/reports/jobs.ts` | Job RPCs client |
| `src/components/reports/operations/operations-report-page.tsx` | Main UI |
| `src/components/reports/operations/filters/registry.tsx` | Filter component map |
| `supabase/migrations/0042_reporting_foundation.sql` | Engine foundation |
| `supabase/migrations/0043_operational_reports.sql` | Ops SQL sources |
| `supabase/migrations/0046_audit_security_reports.sql` | Audit SQL sources |
| `supabase/migrations/0048_report_jobs.sql` | Export/queue |
| `src/lib/navigation.ts` | Reports nav |
| `docs/phase-5-setup.md` | Phase 5 setup notes |

## Appendix B — Engine operational keys (Phase 5B)

```
pickup-register
awb-register
manifest-register
manifest-inscan-report
drs-register
pod-report
tracking-history
shipment-status-report
undelivered-report
delivery-report
scan-reconciliation-report
mis-operational-summary
```

## Appendix C — Document maintenance

When a report moves from Pending → Complete:

1. Update §5 matrix row (`Backend Complete = Yes`).  
2. Update §7 checklist.  
3. Update §12 percentages.  
4. Note migration filename that added the engine pack.

---

*End of BACKEND_IMPLEMENTATION_STATUS.md*
