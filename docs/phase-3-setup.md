# Phase 3 — Master Data (Geo slice) — Setup & Reference

Phase 3 delivers the geo master group (Countries, Zones, States, Destinations,
Pincodes, Country Pincodes, Areas) on a reusable master-data framework that every
later master group inherits unchanged. It is implemented in fixed milestones;
this document grows one section per milestone.

Architecture is unchanged from Phase 1/2: Supabase Postgres, RLS on every
tenant-owned table, `SECURITY DEFINER` helper functions in the `app` schema,
DB-side permission resolution (`app.user_has_permission`), and the append-only
`audit_logs` trail. No service-role key is used in normal user requests.

---

## Milestone 1 — Shared Master Framework (`0014_master_core.sql`)

Adds no business tables. Installs the primitives all master tables reuse.

### What it provides

| Object | Purpose |
| --- | --- |
| `pg_trgm` extension | Trigram indexes/search for name lookups on large masters (pincodes, destinations). |
| `app.audit_suppressed()` | Reads the session flag `app.suppress_row_audit`; lets bulk paths (import) skip per-row audit and write a single summary instead. |
| `app.tg_audit_row()` | Generic `AFTER INSERT/UPDATE/DELETE` trigger. Appends `ADD`/`MODIFY`/`DELETE` to `audit_logs` through the sanctioned `app.write_audit_log()` path. Module slug is bound per table via the trigger argument. Requires the table to expose `id uuid` and `tenant_id uuid`. |
| `app.attach_master_triggers(p_table text, p_module_slug text)` | One idempotent call that installs the standard trigger pair (`trg_touch_<table>` + `trg_audit_<table>`) on a public master table. Keeps every master migration DRY. |

### Optimistic locking

No new object is needed. `app.tg_touch_row()` (from `0001`) already bumps
`row_version` on every `UPDATE`. Callers enforce the check with:

```sql
update public.<table> set ... where id = $1 and row_version = $2;
-- 0 rows affected => the row changed under us => surface a conflict (409-style)
```

### Audit behavior

- Every master mutation writes one `audit_logs` row: `entity_type` = table name,
  `action` = `ADD`/`MODIFY`/`DELETE`, `module_slug` = the slug bound at
  `attach_master_triggers` time, plus `old_values`/`new_values` (full row JSON).
- `audit_logs` remains append-only (Phase 1 guard trigger unchanged).
- Bulk import (Milestone 3) sets `app.suppress_row_audit = 'on'` for the batch and
  writes one summary entry, avoiding thousands of per-row audit rows.

### How later masters use it (per table)

```sql
-- 1. create table public.<name> ( id uuid ..., tenant_id uuid not null ..., row_version int ... );
-- 2. select app.attach_master_triggers('<name>', '<permission-slug>');
-- 3. enable RLS + tenant/permission policies.
```

### Verification

`supabase/tests/master_core_verification.sql` (wired into
`supabase/tests/run_local_rls_check.sh`) proves, in a rolled-back transaction:

- `pg_trgm` and all shared helpers exist.
- `attach_master_triggers` installs both triggers.
- `INSERT` → `row_version = 1` + `ADD` audit; `UPDATE` → `row_version = 2` +
  `MODIFY` audit; `DELETE` → `DELETE` audit.
- A stale `row_version` update affects 0 rows (optimistic locking).
- With `app.suppress_row_audit = 'on'`, no per-row audit is written.

Run locally (throwaway Postgres cluster, never touches the remote project):

```bash
bash supabase/tests/run_local_rls_check.sh
```

### Deploy

Apply `0014_master_core.sql` with your normal migration flow (Supabase CLI
`supabase db push`, or paste into the SQL editor). It is idempotent.

---

## Milestone 2 — Geo Database Tables (`0015_geo_masters.sql`)

Seven tenant-owned masters, each on the master-core framework (0014) and the
global contract (id, tenant_id, audit columns, `deleted_at`, `row_version`).

| Table | Natural key (partial unique, live rows) | Permission slug |
| --- | --- | --- |
| `countries` | `(tenant_id, code)` | `mst.country-master` |
| `zones` | `(tenant_id, code)` | `mst.zone-master` |
| `states` | `(tenant_id, code)` | `mst.state-master` |
| `destinations` | `(tenant_id, code)` | `mst.destination-master` |
| `pincodes` | `(tenant_id, pin_code)` | `mst.pincode-master` (new) |
| `country_pincodes` | `(tenant_id, country_id, pin_code, city_name)` | `mst.country-pincodes` |
| `areas` | `(tenant_id, branch_id, name)` | `mst.area-master` |

### Cross-tenant integrity (composite FKs)

Every table declares `UNIQUE (tenant_id, id)`, and all interlinked references are
**composite** foreign keys on `(tenant_id, <fk>)` targeting the parent's
`(tenant_id, id)`. This makes a cross-tenant reference structurally impossible,
not merely policy-enforced (blueprint §4):

- `states.zone_id` → `zones`
- `destinations.country_id/state_id/zone_id` → geo; `main_branch_id/manifest_branch_id` → `branches`
- `pincodes.destination_id/zone_id/state_id` → geo; `branch_id` → `branches`
- `country_pincodes.country_id` → `countries`
- `areas.branch_id` → `branches`; `areas.destination_id` → `destinations`

To reference `branches` by `(tenant_id, id)` this migration adds an additive
`branches_tenant_id_uq` unique constraint (it does not modify `0003`).
`pincodes.vendor_id` stays a plain nullable uuid — its FK is deferred to the
parties slice. Nullable composite FKs use MATCH SIMPLE, so a null child column
skips the check.

### Indexes

Tenant-leading composites for list filters (`destinations (tenant_id, dest_type,
status)`, `pincodes (tenant_id, is_serviceable, pin_code)`, …) plus GIN trigram
indexes for name/pin search (`countries.name`, `states.name`, `destinations.name`,
`pincodes.pin_code`, `pincodes.pin_name`, `country_pincodes.pin_code`, `areas.name`).

### New permission module + backfill

`pincodes` had no row in the seeded 168 modules, so `0015` seeds
`mst.pincode-master` (idempotent, same pattern as `0010`) and backfills it to
existing tenants' system groups — **TENANT_ADMIN** (all access) and
**OPERATIONS** (list/search) — with `ON CONFLICT DO NOTHING` so customized grants
are never overwritten. Future tenants receive it automatically via
`app.provision_tenant_rbac` (which grants every module).

### RLS

Each table: `SELECT` for tenant members or platform admin; `INSERT/UPDATE/DELETE`
gated by `app.user_has_permission(tenant_id, '<slug>', 'add|modify|delete')`.
Generated by a single `DO` loop over the (table, slug) pairs.

### Enum canonicalization

Stored canonical (UPPER): `weight_unit` `KGS|LBS`, `dest_type`
`DOMESTIC|INTERNATIONAL|LOCAL`, `service_type` `REGULAR|METRO|REMOTE`, `status`
`ACTIVE|INACTIVE`. The UI's `Kgs`/`Active`/`In-Active` labels map to these at the
data layer (Milestone 5).

## Milestone 3 — Import Pipeline (`0016_import_pipeline.sql`)

Reusable, transactional CSV import engine for every master.

### Tables

- `import_jobs` — one row per COMMIT run: `import_type` (`MASTER_CSV`), `master`,
  `mode`, `status` (`QUEUED|RUNNING|DONE|FAILED`), `total/ok/skipped/error_rows`,
  `error`, `requested_by`. Tenant-scoped SELECT RLS; touch trigger.
- `import_row_errors` — per-row failures for a job: `job_id` (cascade), `row_no`,
  `column_name`, `message`, `raw`. Tenant-scoped SELECT RLS.

Both are written only through the SECURITY DEFINER RPC (owner bypasses RLS); no
write policies are exposed to normal users.

### RPC: `public.import_master(p_master, p_mode, p_rows jsonb)`

Returns a JSON summary: `{ master, mode, job_id, total, ok, skipped, error_count, errors[] }`.

- **Guards**: validates the master (→ permission slug), the mode, and that
  `p_rows` is a JSON array (≤ 5000 rows — client chunks larger files). Resolves
  the tenant from `auth.uid()` only (never trusts the client) and requires the
  master's `add` permission.
- **FK-by-code resolution (set-based, no N+1)**: before the row loop, the RPC
  extracts the DISTINCT referenced codes from `p_rows` per referenced table
  (`app.import_distinct_codes`) and loads each referenced master **once** into an
  in-memory `code -> id` map (`app.import_build_code_map`, one tenant-isolated,
  live-rows-only query per table — countries, zones, states, destinations,
  branches). The loop then does O(1) map lookups (`app.import_lookup`): blank →
  NULL; provided-but-unknown → row error. No dynamic query runs inside the loop.
- **Enum/number/boolean normalization** (`app.norm_enum/norm_bool/norm_numeric`):
  case-insensitive, canonical UPPER output; invalid input → row error.
- **Idempotency**: inserts use `ON CONFLICT (natural key) DO NOTHING`; duplicates
  are counted as `skipped`.

### Transactional contract

The RPC runs inside the caller's single transaction.

- **VALIDATE** — a true dry-run. Each row is attempted inside a per-row
  subtransaction that is **always rolled back** (intentional `CMS00` signal), so
  it exercises the same validation, FK resolution, and DB constraints as COMMIT
  but persists nothing (no job, no rows, no row errors). Errors are returned in
  the result only.
- **COMMIT** — valid rows are inserted. **Expected** per-row problems (missing
  field `CMS01`, unresolved FK code, or a data constraint violation —
  unique/check/FK/not-null/cast) are captured in `import_row_errors` and the row
  is skipped. An **unexpected** (system) error is not caught, so it propagates
  and aborts the whole transaction: no partial import. Because a single
  transaction cannot both roll back and persist a `FAILED` marker, the client
  (Milestone 5) records the failed job on error.
- **Audit**: per-row master audit is suppressed for the batch
  (`app.suppress_row_audit`) and one summary `audit_logs` entry is written for
  the job.

### Import order (FK dependencies)

`countries → zones → states → destinations → pincodes / areas / country_pincodes`.
Rows referencing a not-yet-imported parent become row errors (import parents first).

### Verification

`supabase/tests/import_pipeline_verification.sql` (wired into the runner) proves:
VALIDATE persists nothing with correct counts; COMMIT inserts valid rows, logs
errors, and writes exactly one summary audit (no per-row zone audit); re-import is
idempotent (skipped); FK-by-code resolves and unknown codes become row errors;
and a user without tenant context is rejected.

## Milestone 4 — Lookup RPC

**Migration:** `supabase/migrations/0017_lookups.sql`

One reusable, tenant-safe autocomplete surface for every geo master. The
frontend never SELECTs the master tables directly to populate pickers; it calls
a single RPC.

### RPC: `public.lookup(p_key, p_q, p_limit)`

Returns `table(id uuid, code text, name text, hint text)` — the shape the
blueprint's shared `GET /lookups/:key` surface expects (with `id` added so the
UI can bind selections to the row).

- **Keys (geo scope only):** `country`, `zone`, `state`, `destination`,
  `pin-code`, `country-pincode`, `area`. An unknown key raises
  `invalid_parameter_value` (`22023`).
- **Tenant isolation:** every branch filters `tenant_id in (select
  app.user_tenant_ids())` and `deleted_at is null`, so results are always scoped
  to the caller's tenant(s) — the same predicate as the 0015 RLS SELECT policy.
- **SECURITY DEFINER, RLS-safe:** runs as owner (so it does not depend on
  per-table RLS for reads) but **re-imposes** the tenant predicate itself, so it
  can never leak across tenants. No permission slug is required — pickers must
  work for any active member filling a form (matches the "shared lookups"
  surface).
- **Trigram search:** `p_q` is matched with `ILIKE '%q%'` against the columns
  backed by the `gin_trgm_ops` indexes from 0015 (`name` / `pin_code` /
  `pin_name`); user-supplied `%`/`_` are escaped. Empty/absent `q` returns the
  top-N of the master.
- **Stable ordering:** deterministic `ORDER BY` (`name`/`code`, then `id`) so
  repeated and paginated calls return rows in the same order.
- **Result limiting:** `p_limit` is clamped to `[1, 200]` (default 50),
  bounding payload size regardless of the client value.

Per-key mapping of `code` / `name` / `hint`:

| key | code | name | hint |
| --- | --- | --- | --- |
| `country` | `code` | `name` | `currency` |
| `zone` | `code` | `name` | — |
| `state` | `code` | `name` | `gst_alias` |
| `destination` | `code` | `name` | `dest_type` (ACTIVE only) |
| `pin-code` | `pin_code` | `pin_name` (→ `pin_code`) | `ODA` / `Non-serviceable` |
| `country-pincode` | `pin_code` | `city_name` (→ `pin_code`) | `state_name` |
| `area` | `name` | `name` | — |

`STABLE` and read-only (no writes, no audit) — safe to call heavily.

### Verification

`supabase/tests/lookups_verification.sql` (wired into the runner) proves: tenant
isolation (both directions); trigram partial/case-insensitive search; stable
name ordering; limit clamping to `[1,200]`; destination ACTIVE-only filter;
per-key `code/name/hint` shape (including the ODA hint and `pin_code` fallbacks);
unknown key rejected; and a tenant-less or unauthenticated caller gets an empty
set (never an error, never cross-tenant rows).

## Milestone 5 — Frontend Resource Layer

Reusable, **UI-agnostic** frontend infrastructure that consumes the Phase 3
backend. No screens here — Milestone 6 wires these into pages. Everything runs
through the browser anon client, so RLS + SECURITY DEFINER remain the real
boundary; permission checks on the client are convenience gates only.

### Layout

```
src/lib/permissions.ts                 # centralized slugs + pure permission helpers
src/lib/masters/
  core/
    csv.ts               # parse/serialize CSV, map headers -> import keys, template
    baseCrud.ts          # generic list/get/create/update/remove (soft delete + optlock)
    lookup.ts            # public.lookup wrapper + React Query helpers/useLookup
    import.ts            # public.import_master wrapper + chunking (>5000 rows)
    queryKeys.ts         # single source of truth for all React Query keys
    useMasterResource.ts # MasterResource type + the React Query/permission hook
    index.ts             # barrel: public API for the core layer
  schemas/               # Zod schema per master (DB column shape) + defaults
    countries.ts zones.ts states.ts destinations.ts
    pincodes.ts countryPincodes.ts areas.ts  (+ _shared.ts field builders)
    index.ts             # barrel (excludes _shared internals)
  resources/             # one MasterResource per master + registry (index.ts)
    countries.ts zones.ts states.ts destinations.ts
    pincodes.ts countryPincodes.ts areas.ts  index.ts
```

### `src/lib/permissions.ts`

Single source of truth for module slugs and permission logic. Exports the
`PermissionAction`/`PermissionActions` types, pure `can()` / `canDo()` /
`resolveActions()` helpers (no React), and `GEO_MASTER_PERMISSIONS` mapping each
geo master to its slug. `auth.tsx` now re-uses `can()` (and re-exports the types
for backward compatibility) so gating logic lives in exactly one place.

### `core/baseCrud.ts`

`makeCrud<TRow>(config)` returns `list / getById / create / update / remove`
bound to a table. Contract enforced for every master:

- **Soft delete** — reads filter `deleted_at IS NULL`; `remove` stamps
  `deleted_at` instead of hard-deleting.
- **Optimistic locking** — `update`/`remove` guard with
  `.eq("row_version", expected)`; 0 rows affected → `ConflictError`. The DB
  trigger owns `row_version`, so it's stripped from update payloads.
- **Tenant stamping** — `create` adds `tenant_id`; RLS also verifies membership.
- **Search/paging** — ILIKE across the resource's `searchColumns` (wildcards
  sanitized), exact-match `filters`, ordered + ranged with an exact `count`.
- **Error translation** — unique violation → `DuplicateError`, `42501` →
  friendly permission message.

### `core/lookup.ts` / `core/import.ts` / `core/csv.ts`

- **lookup** — typed `lookup(key, q, limit)` over `public.lookup` plus
  `lookupQueryOptions` and a `useLookup` hook (keeps previous data for smooth
  autocomplete). `LookupKey` matches the RPC's geo keys.
- **import** — `importMaster(master, mode, rows)` over `public.import_master`,
  plus `importMasterChunked` that splits files above the 5000-row server cap and
  aggregates counts/errors (row numbers rebased to the original file; COMMIT job
  ids collected).
- **csv** — dependency-free parser (quotes, embedded commas/newlines, CRLF,
  BOM), `toCsv`, `csvTemplate`, and `mapCsvToImportRows` (fuzzy header matching:
  "Zone Code" / "zone_code" / "ZONECODE" → `zone_code`).

### `core/useMasterResource.ts`

The only React seam. `MasterResource<TRow, TCreate, TUpdate>` fully describes a
master (table, columns, search, order, permission slug, import metadata, lookup
key, Zod schemas). `useMasterResource(resource)` returns:

- `perms` — resolved `canAdd/canModify/canDelete/canList/canSearch`.
- `listOptions(params)` / `getOptions(id)` — feed straight into `useQuery`
  (gated by `canList`).
- `create / update / remove` — `useMutation`s that fail fast on missing
  permission/tenant and invalidate the resource cache (and the master's lookup
  cache) on success.
- `validateImport / commitImport` — the two-phase import mutations (commit also
  invalidates list + lookup).

### `schemas/` and `resources/`

Zod schemas describe the **DB column shape** (snake_case); their inferred output
is exactly what CRUD sends to Supabase (optional text/uuid normalize to `null`;
areas uppercase `name` to match the import path). Each resource binds a table to
its slug, `searchColumns`, default order, `importColumns` (the CSV keys the
import RPC expects, including `*_code` FK-by-code columns), `lookupKey`, and its
schemas. `resources/index.ts` re-exports all seven and provides
`masterResources` / `masterResourceByKey` for generic consumers (M6).

### Verification

`npx tsc --noEmit` and `eslint` are clean for the entire new layer
(`src/lib/masters/**`, `src/lib/permissions.ts`, `src/lib/auth.tsx`). No screens
were added; screen wiring is Milestone 6.

## Milestone 5.1 — Resource Layer Hardening

A pre-M6 refinement pass to make the reusable framework production-ready before
every future master group (Customers, Vendors, Products, Charges, Taxes, Fuel,
Rates, …) reuses it. Architecture only — no new features, no UI, no backend
changes.

### Query key factory (`core/queryKeys.ts`)

All React Query keys now come from one `masterKeys` factory — no module authors
key arrays by hand:

- `masterKeys.all(resourceKey)` → `[resourceKey]` (root; invalidates list +
  detail together)
- `masterKeys.list(resourceKey, params)` → `[resourceKey, "list", params]`
- `masterKeys.detail(resourceKey, id)` → `[resourceKey, "detail", id]`
- `masterKeys.lookupRoot(lookupKey)` → `["lookup", lookupKey]`
- `masterKeys.lookup(lookupKey, query, limit)` → `["lookup", lookupKey, query, limit]`
- `masterKeys.import(jobId)` → `["import", jobId]`

`useMasterResource.ts` and `lookup.ts` consume the factory; the hierarchical
shape lets React Query prefix-match for broad or narrow invalidation.

### Lookup cache invalidation

A write to a master can change both its own rows **and** the lookup dropdowns
that pick from it. On `create` / `update` / `delete` (soft delete) — and on
`commitImport` — the hook now invalidates **both** `masterKeys.all(resource.key)`
**and** `masterKeys.lookupRoot(resource.lookupKey)` (when a `lookupKey` is
declared). Lookups previously lived under a separate namespace and would stay
stale until their `staleTime` elapsed; pickers now refresh immediately. All
seven geo masters declare a `lookupKey`, so this covers every one of them.
`validateImport` is a pure dry-run and intentionally invalidates nothing.

### Registry rename

`geoMasterResources` → `masterResources` and `geoMasterResourceByKey` →
`masterResourceByKey`. The framework is master-group-agnostic; the geo-specific
names were misleading for the non-geo masters that will register next. Pure
rename — no behavior change.

### Barrel exports

- `core/index.ts` — the public API of the core layer (re-exports baseCrud,
  lookup, import, csv, queryKeys, useMasterResource). Consumers import from
  `@/lib/masters/core`.
- `schemas/index.ts` — re-exports the seven master schemas (excludes the
  internal `_shared.ts` field builders).
- `resources/index.ts` — already the resource barrel + registry.

### Reusability review — cost of a future master

Adding a new master requires only:

1. `schemas/<master>.ts` — Zod create/update schemas + defaults.
2. `resources/<master>.ts` — one `MasterResource` config + its `Row` type.
3. A `permission_modules` slug (backend seed) + an entry in `permissions.ts`.
4. *(Optional)* register it in `resources/index.ts`, and — only if pickable —
   add its key to `LookupKey` (client) + a branch in `0017_lookups.sql` (backend).

It requires **no changes** to `baseCrud.ts`, `import.ts`, `csv.ts`,
`queryKeys.ts`, or `useMasterResource.ts` — those are fully generic. Verified by
inspection: none of the core modules reference any concrete master.

### Verification

`npx tsc --noEmit` and `eslint` remain clean across `src/lib/masters/**`,
`src/lib/permissions.ts`, and `src/lib/auth.tsx`. The only outstanding type
errors in the repo are pre-existing and confined to unrelated `utility.*` route
files untouched by this work.

## Milestone 6 — Geo Screen Integration

Wires the seven existing geo master screens to the live backend while preserving
their current UI/UX. Every screen now runs in one of two modes:

- **Authenticated (live):** reads/writes go through the reusable resource layer
  (`useMasterResource`, `useMasterList`, `public.lookup`, `import_master`).
- **Unauthenticated (demo):** the original in-memory demo behavior is untouched,
  so the screens still work as a standalone preview.

The switch is a single `authed` boolean (`useAuth().isAuthenticated`); the JSX
branches on it per field/action. No screen layout, column, or dialog was
redesigned.

### Screen-integration layer (`src/lib/masters/screen/`)

Thin, screen-facing helpers that sit on top of the frozen core. Nothing here is
master-specific enough to belong in `core/`, but all of it is shared by the
screens:

- **`useMasterList.ts`** — live list loader. Wraps `baseCrud.list` (RLS-scoped,
  up to `pageSize` rows) and, because the normalized tables store FK *ids* while
  the demo UIs display *names*, resolves each referenced `code`/`name` in a
  single batched `in (...)` query per table. Returns rows augmented with
  `<as>_code` / `<as>_name` label fields. Keyed under the resource's list
  namespace so CRUD/import mutations invalidate it automatically.
- **`useBranchOptions.ts`** — loads the tenant's branches (`id, code, name`,
  `deleted_at is null`) for branch pickers. Branches are **not** exposed through
  `public.lookup` (that surface is geo masters only), so destination / pincode /
  area screens load them directly. Cached with a 5-minute `staleTime`.
- **`helpers.ts`** — `toErrorMessage` (turns a `ZodError` / `Error` / unknown
  into a toast string) and `importSummary` (human "Imported N, skipped M, K
  errors" line).
- **`index.ts`** — barrel export for the above.

### Reusable FK pickers (`src/components/masters/lookup-combobox.tsx`)

- **`LookupCombobox`** — FK picker backed by the `public.lookup` RPC. Trigram
  search server-side (`shouldFilter={false}`), returns the real row `id` while
  showing a human label. Used for country / zone / state / destination pickers.
- **`EntityCombobox`** — same trigger/UX but driven by an in-memory list, for FK
  targets without a lookup key (branches). Client-side filtering.
- **`EntityOption`** — `{ id, code, name, hint? }`, the shared option shape.

Both mirror the existing `BranchCombobox` (Popover + cmdk) so the look/feel is
unchanged.

### Per-screen wiring

| Screen | Table | Live FK pickers |
|---|---|---|
| Country (`master.sales.country`) | `countries` | — |
| Zone (`master.sales.zone`) | `zones` | — |
| State (`master.sales.state`) | `states` | zone (`LookupCombobox`) |
| Destination (`master.sales.destination`) | `destinations` | state, zone (`LookupCombobox`); main/manifest branch (`EntityCombobox`) |
| Pin Code (`master.operation.pin-code`) | `pincodes` | destination, zone, state (`LookupCombobox`); service centre (`EntityCombobox`) |
| Country Pincode (`master.operation.country-pincodes`) | `country_pincodes` | country (`LookupCombobox`) |
| Area (`master.operation.area`) | `areas` | destination (`LookupCombobox`); service centre (`EntityCombobox`) |

Each screen follows the same pattern:

- **`rowToView` / `toRaw`** — map between the screen's `camelCase` view/form
  shape and the DB's `snake_case` column shape (including enum casing such as
  `Active`↔`ACTIVE`, `Domestic`↔`DOMESTIC`). FK label fields resolved by
  `useMasterList` populate the view; ids drive the form.
- **Validation** — the resource's Zod `createSchema` / `updateSchema` validate
  before every mutation (both live and demo paths), surfaced via
  `toErrorMessage`.
- **Optimistic locking** — updates/deletes pass the row's `row_version`; a stale
  version raises the DB conflict, shown as a toast.
- **Permissions** — Add / Import / Edit / Delete / bulk-delete controls are
  gated by `rc.perms.canAdd|canModify|canDelete`. In demo mode all controls stay
  enabled.
- **CSV import/export** — export uses the screen's visible rows; import parses
  with `parseCsv`, and in live mode maps headers to the resource's
  `importColumns` via `mapCsvToImportRows` then `commitImport` (chunked, atomic).
  Demo mode keeps the original client-side import.
- **Refresh** — invalidates `masterKeys.all(resource.key)` when authenticated.

### Notes / intentional preservations

- **Pincode `vendor`** — the demo form has a Vendor field but the `pincodes`
  table has no vendor column; it is preserved in the UI and simply not persisted
  in live mode (no backend change, per scope).
- **Destination `country`** — the demo form never exposed a Country input, so
  live create leaves `country_id` null on new rows to preserve UX; existing
  `country_id` is retained on edit.

### Verification

- `npx tsc --noEmit` — **0 errors in Milestone 6 files** (`src/lib/masters/**`,
  `src/components/masters/**`, the seven `master.*` routes). The 12 remaining
  repo errors are pre-existing and confined to untouched `utility.*` routes.
- `eslint` — clean across all Milestone 6 files.
- `vite build` — succeeds.

## Milestone 7 — Testing & Documentation

Closes Phase 3 by adding an automated **frontend** test layer to complement the
existing backend SQL verification, and finalizing the docs.

### Test strategy

- **Backend** already has thorough, isolated SQL verification run by
  `supabase/tests/run_local_rls_check.sh` (RLS, RBAC, bootstrap, master core,
  import pipeline, lookups). Milestone 6 added no backend, so no new SQL tests
  were required.
- **Frontend** gets fast, deterministic **unit tests** covering the pure logic
  introduced in M5/M6. React components/screens are intentionally *not* rendered
  here — the valuable, regression-prone logic is the framework-agnostic core
  (CSV engine, schema transforms, query-key factory, import chunking, helpers),
  which is testable without a DOM.

### Runner: Vitest

Vitest is the standard runner for a Vite/TanStack project and reuses the same
transform pipeline, so no Babel/ts-jest setup is needed.

- `vitest.config.ts` — a **standalone** config (node environment, `@` → `src`
  alias). It deliberately does not reuse `@lovable.dev/vite-tanstack-config`,
  whose SSR/nitro plugin chain is irrelevant (and heavy) for unit tests.
- Scripts: `npm test` (`vitest run`, CI one-shot) and `npm run test:watch`.
- Tests are co-located as `*.test.ts` next to the code they cover.

### Coverage (41 tests, 5 files)

| File | What it locks down |
|---|---|
| `core/csv.test.ts` | RFC-4180 essentials: quoting, embedded commas/quotes/newlines, CRLF, BOM, blank-line skipping, custom delimiter; `toCsv` quoting + round-trip; `mapCsvToImportRows` fuzzy header matching |
| `core/queryKeys.test.ts` | Key hierarchy — `all()` is a prefix of `list()`/`detail()`, lookup namespace separation, param defaulting (invalidation correctness) |
| `core/import.test.ts` | RPC arg forwarding, DB-error surfacing, row-cap guard, **chunk splitting + error `row_no` rebasing** to the original file, progress reporting, chunk-size clamping (supabase client mocked) |
| `schemas/schemas.test.ts` | Shared field-builder behavior via real schemas: required-text trim, empty-optional → `null`, enum defaults/rejection, uuid required vs optional, area name upper-casing, email + non-negative-number validation |
| `screen/helpers.test.ts` | `toErrorMessage` (Zod / Error / unknown / empty) and `importSummary` pluralization |

### Verification

- `npm test` — **41 passed** (5 files).
- `eslint` — clean across all test files and `vitest.config.ts`.
- `npx tsc --noEmit` — **0 errors** in `src/lib/masters/**` (incl. tests). The 12
  remaining repo errors are pre-existing and confined to untouched `utility.*`
  routes.
- `vite build` — succeeds.

### Running everything

```bash
npm test                          # frontend unit tests
bash supabase/tests/run_local_rls_check.sh   # backend SQL verification (local pg)
```

**Phase 3 (Geo Masters) is complete**: shared master framework, geo tables +
RLS, transactional import pipeline, lookup RPC, reusable frontend resource
layer, wired screens, and an automated test layer across both tiers.

## Milestone 8 — Simple Catalog Masters

Extends Phase 3 to the **catalog** slice by reusing the frozen master framework
end-to-end. No new architecture: nine flat catalog masters plug into the same
table contract, RLS shape, `import_master` engine, `lookup` RPC, resource layer,
and screen wiring pattern as the geo slice. The Geo framework is untouched.

### Migration `0018_catalog_masters_simple.sql`

Nine tenant-owned tables, each with the global contract (`id` + `tenant_id` +
audit cols + `deleted_at` + `row_version`, `UNIQUE (tenant_id, id)`, partial
`UNIQUE (tenant_id, code)`, tenant-leading + `gin_trgm` indexes,
`app.attach_master_triggers` for touch + audit, and the four RLS policies —
tenant SELECT; permission-gated INSERT/UPDATE/DELETE via
`app.user_has_permission`):

| Table | Slug | Notes |
|---|---|---|
| `product_types` | `mst.product-type` | source of truth for product classification |
| `products` | `mst.product-master` | `product_type_id` **composite FK** `(tenant_id, product_type_id)` → `product_types (tenant_id, id)` `ON DELETE RESTRICT`; enums `shipment_type`/`status`/`group_type`; bools `fuel_charge`/`gst_reverse` |
| `banks` | `mst.bank-master` | `status` enum |
| `industries` | `mst.industry-master` | code/name |
| `contents` | `mst.content-master` | code/name |
| `instructions` | `mst.instruction-master` | code/name |
| `sales_executives` | `mst.sales-executive-master` | `commission numeric(6,2)` ≥ 0 |
| `flights` | `mst.flight-no-master` | `flight_type` enum |
| `delivery_exceptions` | `mst.delivery-exception-master` | `exc_type` enum, `inscan`/`show_on_mobile` bools |

**Architecture decision — Product Type is the single source of truth.** It is a
master table, not an enum. `products` reference it by a composite FK (so a
product can never point at another tenant's type, and an in-use type cannot be
hard-deleted). The frontend keeps its familiar "Type" picker but binds to the
`product-type` lookup in live mode.

All nine permission slugs already ship in the seeded module set (0010), so —
unlike the geo `pincode-master` — there is **nothing to insert/backfill**: new
tenants receive grants via `app.provision_tenant_rbac`, existing tenants already
have them.

**Import + lookup are extended, not redesigned.** `public.import_master` and
`public.lookup` are re-created with the geo branches kept **verbatim** and the
catalog branches appended. Each per-master arm is self-contained (own validate →
FK-resolve → insert) so the engine can later be split into a dispatcher +
per-master helpers **without any public-API change**. New import masters:
`product_types, products, banks, industries, contents, instructions,
sales_executives, flights, delivery_exceptions` (products preload a
`product_type_code → id` map for set-based FK resolution). New lookup keys:
`product-type` and `product` (product = **ACTIVE only**; hint = shipment type).
`delivery_exceptions.exc_type` accepts the UI labels `Delivered` / `Un-Delivered`
case- and hyphen-insensitively.

### Frontend

- **Schemas** (`src/lib/masters/schemas/`): `productTypes`, `products`, `banks`,
  `industries`, `contents`, `instructions`, `salesExecutives`, `flights`,
  `deliveryExceptions` — built from the shared `_shared` field builders (same
  create/update/defaults trio as geo).
- **Resources** (`src/lib/masters/resources/`): nine configs registered in
  `masterResources`; `products` and `product_types` declare `lookupKey` so
  writes invalidate the relevant lookup caches.
- **Permission map**: `CATALOG_MASTER_PERMISSIONS` in `src/lib/permissions.ts`.
- **Screens wired** (live/demo, Zod validation, optimistic locking, permission
  gating, CSV import/export) — UI/UX preserved:

| Screen | Table | Live FK picker |
|---|---|---|
| Product Type (`master.sales.product-type`) | `product_types` | — |
| Product (`master.sales.product`) | `products` | product type (`LookupCombobox`) |
| Bank (`master.sales.bank-master`) | `banks` | — (keeps column filters + status badge) |
| Industry (`master.sales.industry`) | `industries` | — |
| Content (`master.sales.content`) | `contents` | — |
| Instruction (`master.sales.instruction`) | `instructions` | — |
| Sales Executive (`master.sales.sales-executive`) | `sales_executives` | — |
| Flight (`master.sales.flight`) | `flights` | — |
| Exception (`master.operation.exception`) | `delivery_exceptions` | — (keeps inline form + type toggle) |

The Product screen shows the Type as a `LookupCombobox` (backed by the
`product-type` key) in live mode and keeps the enum-style `Select` in demo mode;
`rowToView`/`toRaw` translate between the UI's `type` label and the persisted
`product_type_id`.

### Verification

- **SQL harness** — `supabase/tests/catalog_masters_verification.sql` (wired
  into `run_local_rls_check.sh`). Proves: all nine tables exist with RLS + touch
  + audit triggers + ≥4 policies; flat-catalog VALIDATE/COMMIT/idempotency
  (banks); Product-Type-as-source-of-truth (composite FK resolved by
  `product_type_code`, null allowed, unknown → row error, referenced type cannot
  be hard-deleted); `exc_type` hyphen/case normalization + default;
  `product-type` + `product` lookup keys (product = ACTIVE only); optimistic
  locking on a catalog table. **All SQL verifications pass.**
- **Vitest** — `schemas/catalogSchemas.test.ts` adds catalog schema coverage
  (enum/bool defaults, product-type uuid ref → null, commission ≥ 0 coercion,
  exc_type/flight/bank enums). **56 passed (6 files).**
- **`eslint`** — clean across all catalog schemas, resources, permission map, and
  the nine wired routes.
- **`npx tsc --noEmit`** — **0 errors** in catalog files. The 12 remaining repo
  errors are pre-existing and confined to untouched `utility.*` routes.
- **`vite build`** — succeeds.

### Remaining work (Phase 3 catalog)

- **Milestone 9 — Complex Catalog Masters**: Charges, Airlines, Field
  Executives, Service Centers (FKs, lookup pickers, imports; charge dependencies
  handled with explicit save logic / a dedicated junction RPC — not generic
  CRUD).
- **Deferred to later slices**: Service Mapping, Vendor dependencies, Local
  Branch.

## Milestone 9A — Complex Catalog Masters (Charges + Airlines)

Extends the catalog slice with the **first many-to-many relationship** (charge
dependencies) and the **first Product lookup consumer** (airlines), reusing the
frozen framework end-to-end. Milestone 8 (simple catalog) and the Geo slice are
untouched.

### Migration `0019_catalog_masters_complex.sql`

Two masters + one junction table, all idempotent:

| Object | Slug | Notes |
|---|---|---|
| `charges` | `mst.charge-master` | flat master contract; `charge_type` enum (`AIRWAYBILL/EXPENSE/INCOME/OBC/PURCHASE`), `base_on` text (default `Actual Weight`), `charge_rate numeric(14,4)` ≥ 0, `apply_fuel`/`apply_tax_on_fuel`/`apply_tax` bools, `hsn_code`, `sequence` |
| `airlines` | `mst.airlines` | `name` natural key (partial unique per tenant, upper-cased); `product_id` **composite FK** `(tenant_id, product_id)` → `products (tenant_id, id)` `ON DELETE RESTRICT` |
| `charge_dependencies` | (charge-master gated) | self-referential M:N junction (`charge_id`, `depends_on_charge_id`), both **composite FKs** `ON DELETE CASCADE`, `CHECK (charge_id <> depends_on_charge_id)`, unique triple. Deliberately **not** a full master (no `row_version`/touch/audit trigger) — synced by a dedicated RPC and audited at the charge level. |

`charges` and `airlines` get the full contract (audit cols, `deleted_at`,
`row_version`, `UNIQUE (tenant_id, id)`, tenant-leading + `gin_trgm` indexes,
`app.attach_master_triggers`, and the four RLS policies). Both slugs already ship
in the seeded module set (0010) — **nothing to insert/backfill**.

**Charge dependencies use explicit save logic, not generic CRUD.**
`public.save_charge_dependencies(p_charge_id uuid, p_depends_on_ids uuid[])` is a
`SECURITY DEFINER` RPC that, in one transaction: verifies tenant +
`mst.charge-master` `modify`, **replaces** the charge's dependency set
(delete-then-insert), filters out self-references / cross-tenant / unknown ids,
and writes one charge-level `MODIFY` audit entry. The generic CRUD framework
stays generic; the charge row itself is still created/updated via `baseCrud`.

**Import + lookup extended, not redesigned.** `public.import_master` and
`public.lookup` are re-created with all prior branches kept **verbatim** and the
new `charges` / `airlines` branches appended. Each arm is self-contained with
`TODO(catalog-split)` markers documenting a future split into
`app.import_charges()` / `app.import_airlines()` and a per-key lookup dispatcher —
**no public-API change**. New import masters: `charges` (no FK), `airlines`
(preloads a `product_code → id` map). New lookup keys: `charge` and `airline`.

### Frontend

- **Schemas** (`src/lib/masters/schemas/`): `charges` (+ `chargeDependencyIdsSchema`),
  `airlines` — built from the shared `_shared` field builders.
- **Resources** (`src/lib/masters/resources/`): `chargesResource`,
  `airlinesResource` registered in `masterResources`; both declare `lookupKey`.
  Charge dependency helpers `fetchChargeDependencies()` /
  `saveChargeDependencies()` live alongside `chargesResource` (kept out of the
  generic resource layer).
- **Permission map**: `COMPLEX_CATALOG_MASTER_PERMISSIONS` in
  `src/lib/permissions.ts`.
- **Screens wired** (live/demo, Zod validation, optimistic locking, permission
  gating, CSV import/export) — UI/UX preserved:

| Screen | Table | Live FK picker |
|---|---|---|
| Charges Master (`master.sales.charges-master`) | `charges` + `charge_dependencies` | "Multiple Charges" M:N picker (live: charge ids; demo: names) |
| Airline (`master.operation.airline`) | `airlines` | product (`LookupCombobox`, `product` key) |

The Charges screen saves in two steps when authenticated: the charge via generic
CRUD, then `save_charge_dependencies` for the M:N set, then invalidates the
`charges` cache (the dependency query is nested under the resource key so it
refreshes automatically). The Airline screen uses `LookupCombobox` for Product in
live mode and keeps the original code/name lookup dialog in demo mode.

### Verification

- **SQL harness** — `supabase/tests/complex_catalog_masters_verification.sql`
  (wired into `run_local_rls_check.sh`). Proves: charges + airlines structure
  (RLS + touch/audit + ≥4 policies) and `charge_dependencies` RLS; charges
  VALIDATE/COMMIT + enum/bool/`base_on` default/numeric + idempotency;
  `save_charge_dependencies` replace/self-filter/clear/cascade semantics;
  airlines composite FK by `product_code` (unknown/missing → row error) and FK
  restrict on referenced product; `charge` + `airline` lookup keys; optimistic
  locking on charges. **All SQL verifications pass.**
- **Vitest** — `schemas/complexCatalogSchemas.test.ts` adds charge/airline schema
  coverage (defaults, enum/negative-rate rejection, dependency-id array,
  required product uuid). **65 passed (7 files).**
- **`eslint`** — clean across the new schemas, resources, permission map, and the
  two wired routes.
- **`npx tsc --noEmit`** — **0 errors** in Milestone 9A files. The 12 remaining
  repo errors are pre-existing and confined to untouched `utility.*` routes.
- **`vite build`** — succeeds.

### Remaining work for Milestone 9B

- **Field Executives** and **Service Centers** (larger aggregates: many fields,
  business rules, and lookups) — to be implemented after approval.
- Still deferred to later slices: Service Mapping, Vendor dependencies, Local
  Branch.

## Milestone 9B — Aggregate Catalog Masters (Service Centers + Field Executives)

Extends the catalog slice with the two largest aggregates and introduces the
**Aggregate Save Pattern** — the first ROOT + CHILD-collection master persisted
atomically by a dedicated RPC. Milestones 8/9A and the Geo slice are untouched.

### Migration `0020_catalog_masters_aggregate.sql`

Two masters + one aggregate-child table, all idempotent:

| Object | Slug | Notes |
|---|---|---|
| `service_centers` | `mst.service-center-master` | wide aggregate ROOT: details + statutory ids, bank details, and last invoice/voucher sequences all as 1:1 columns (not over-normalized). `branch`/`destination`/`state` stored as text, faithful to the demo's branch-picker UX. `code` natural key. |
| `service_center_terms` | (service-center-master gated) | 1:N ordered CHILD of `service_centers` (`seq`, `text`), composite FK `ON DELETE CASCADE`, unique `(tenant_id, service_center_id, seq)`. Deliberately **not** a full master (no `row_version`/touch/audit trigger) — synced with its root by the aggregate RPC and audited at the service-center level. |
| `field_executives` | `mst.field-executive-master` | pickup/delivery field-staff master with TWO composite FKs: `service_center_id` → `service_centers` `ON DELETE RESTRICT` (required) and `destination_id` → `destinations` `ON DELETE SET NULL` (optional). `pickup_charge`/`delivery_charge numeric(12,2)` ≥ 0, `in_active` bool. `code` natural key (upper-cased on import). |

`service_centers` and `field_executives` get the full contract (audit cols,
`deleted_at`, `row_version`, `UNIQUE (tenant_id, id)`, tenant-leading +
`gin_trgm` indexes, `app.attach_master_triggers`, four RLS policies).

**Permission slugs are DEDICATED modules.** Service Centers map to
`mst.service-center-master` and Field Executives to `mst.field-executive-master`.
These are seeded by `0010` (the Access Rights taxonomy was renamed from the
generic *Location Master* / *Pickup/delivery Boy Master* entries) and, for
already-provisioned tenants, migrated in place by `0021` (see below). The rename
preserves each module's id, so existing `TENANT_ADMIN` / `OPERATIONS` grants
carry over unchanged.

**Import + lookup extended, not redesigned.** `public.import_master` and
`public.lookup` are re-created with all prior branches kept **verbatim** and the
new `service_centers` (root only) / `field_executives` (preloads
`service_center_code → id` and `destination_code → id` maps) branches and the
`service-center` / `field-executive` lookup keys appended, each with
`TODO(catalog-split)` markers — **no public-API change**.

### The Aggregate Save Pattern

`public.save_service_center(p_id, p_row_version, p_fields jsonb, p_terms jsonb)`
is the reference implementation. In ONE `SECURITY DEFINER` transaction it:

1. resolves tenant context and checks `mst.service-center-master` (`add` on
   insert, `modify` on update);
2. **upserts the aggregate root** — insert when `p_id` is null; otherwise update
   guarded by an explicit optimistic-lock check (`row_version = p_row_version`,
   raising `40001` on mismatch). The root's touch+audit triggers bump
   `row_version` and write the root audit entry;
3. **synchronizes the child collection** (`service_center_terms`) with replace
   semantics (delete-then-insert, ordered by array position, blank lines
   dropped);
4. writes one service-center-level audit entry for the terms sync and returns
   the persisted root row.

This generalizes the 9A charge-dependency junction sync into a full root+child
aggregate and is the guideline for future aggregates (Customer, Vendor, Service
Mapping). See the standalone guideline section at the end of this document.

### Frontend

- **Schemas** (`src/lib/masters/schemas/`): `serviceCenters` (+
  `serviceCenterTermsSchema`), `fieldExecutives` — built from the shared
  `_shared` field builders.
- **Resources** (`src/lib/masters/resources/`): `serviceCentersResource`,
  `fieldExecutivesResource` registered in `masterResources`; both declare
  `lookupKey`. Aggregate helpers `fetchServiceCenterTerms()` /
  `saveServiceCenter()` live alongside `serviceCentersResource` (kept out of the
  generic resource layer, mirroring the 9A charge-dependency helpers).
- **Permission map**: `AGGREGATE_CATALOG_MASTER_PERMISSIONS` in
  `src/lib/permissions.ts`.
- **Screens wired** (live/demo, Zod validation, optimistic locking, permission
  gating, CSV import/export) — UI/UX preserved:

| Screen | Table | Live FK picker |
|---|---|---|
| Service Centre (`master.sales.service-center`) | `service_centers` + `service_center_terms` | branch dialog (text, preserved); saved via `save_service_center` aggregate RPC |
| Field Executive (`master.operation.field-executive`) | `field_executives` | Service Center + Destination (`LookupCombobox`, `service-center` / `destination` keys) |

The Service Centre screen loads the Terms collection on edit
(`fetchServiceCenterTerms`) into the fixed Terms 1–10 slots (top-filled) and, on
save, sends the root fields + the non-blank Terms array to `save_service_center`
(one transaction), then invalidates the resource cache. Delete uses the generic
soft-delete. The Field Executive screen uses `LookupCombobox` for Service Center
and Destination in live mode and keeps the original `Select` + code/name lookup
dialog in demo mode.

### Verification

- **SQL harness** — `supabase/tests/aggregate_catalog_masters_verification.sql`
  (wired into `run_local_rls_check.sh`). Proves: service_centers +
  field_executives structure (RLS + touch/audit + ≥4 policies) and
  `service_center_terms` RLS; service_centers import VALIDATE/COMMIT/idempotency;
  `save_service_center` insert/update + Terms replace + blank-drop + optimistic
  lock (`40001`) + cascade on root delete; field_executives composite FKs
  (unknown/missing service center → row error, destination optional, charge
  numeric + code upper-case) and FK **restrict** on referenced service center;
  `service-center` + `field-executive` lookup keys; optimistic locking on
  field_executives. **The full local harness applies all migrations cleanly and
  every verification (Phase 1 → 9B) passes.**
- **Vitest** — `schemas/aggregateCatalogSchemas.test.ts` adds service-center /
  field-executive schema coverage (required code/name, optional→null, Terms
  array, service-center uuid ref, charge defaults + negative rejection).
  **75 passed (8 files).**
- **`eslint`** — clean across the new schemas, resources, permission map, and the
  two wired routes.
- **`npx tsc --noEmit`** — **0 errors** in Milestone 9B files. The 12 remaining
  repo errors are pre-existing and confined to untouched `utility.*` routes.
- **`vite build`** — succeeds.

## Catalog freeze — Milestone 10 (cleanup)

A final cleanup pass before the Catalog slice is frozen. **No new features, no
architecture redesign, no refactors** — only small, production-safety cleanups.

### 1. Dedicated permission modules (`0021_catalog_permission_modules.sql`)

Service Centers and Field Executives previously borrowed the generic
`mst.location-master` / `mst.pickup-delivery-boy-master` modules. They now have
dedicated modules that match the actual screens:

| Screen | Was | Now |
|---|---|---|
| Service Centre | `mst.location-master` | `mst.service-center-master` |
| Field Executive | `mst.pickup-delivery-boy-master` | `mst.field-executive-master` |

This is a **rename, not a new concept**, so behavior is unchanged:

- **`0010` + generator + Access Rights screen** — the taxonomy source of truth
  (`gen_permission_modules.mjs` → `0010` and `utility.users.access-rights.tsx`)
  was renamed from *Location Master* / *Pickup/delivery Boy Master* to *Service
  Center Master* / *Field Executive Master*. The Access Rights screen derives its
  slug as `mst.` + kebab(name), so the row keeps working against the seeded module.
- **`0021`** renames the modules **in place** for already-provisioned databases
  (`update permission_modules set slug/name where slug = <old>`). The
  `permission_modules.id` is preserved, so every existing `group_permissions`
  grant (including admin customizations) carries over — nothing to re-grant.
- **Backfill** — `0021` also INSERT-onlys (`on conflict do nothing`) the
  `TENANT_ADMIN` (full) and `OPERATIONS` (list/search, matching
  `app.provision_tenant_rbac`) grants for any tenant that is somehow missing them.
  New tenants get them automatically via provisioning.
- **`0020`** (RLS, `save_service_center`, `import_master` slug map) and
  **`src/lib/permissions.ts`** (`AGGREGATE_CATALOG_MASTER_PERMISSIONS`) reference
  the dedicated slugs.

### 2. Migration review (`0018` / `0019` / `0020`)

Reviewed for duplicated code, obsolete TODOs, and inconsistent naming. Findings:
the three migrations share one consistent shape (global contract, RLS loop,
`attach_master_triggers`, the `create or replace` supersede of
`import_master`/`lookup`). The repeated function bodies are the intended
forward-migration supersede pattern (the `0020` definitions are authoritative),
**not** duplication to remove. The `TODO(catalog-split)` markers are **live**
anchors for the planned dispatcher split (below), not obsolete. Only genuine
issue found and fixed: the borrowed permission slugs (task 1). No refactors made.

### 3. Future refactors (documentation only — NOT implemented)

Once the Catalog slice is complete, `public.import_master()` and
`public.lookup()` should each be split into a **thin dispatcher + per-master
helper functions** so a single 900-line function no longer grows per master. The
public signatures (`import_master(text,text,jsonb)`, `lookup(text,text,integer)`)
**must not change** — only the internals move. The current per-master `CASE`/`if`
arms are already self-contained and carry `TODO(catalog-split)` markers to make
the extraction mechanical.

- **`public.import_master` → dispatcher + `app.import_<master>()` helpers.**
  Keep the shared preamble (slug resolution, mode/row validation, tenant +
  permission check, `import_jobs` open/close, audit suppression, per-row
  error/`VALIDATE` handling) in `import_master`. Move each `when '<master>'` arm
  into `app.import_<master>(v_tenant uuid, v_row jsonb, <preloaded maps>)`
  returning the row-count (e.g. `app.import_countries`, `app.import_products`,
  `app.import_charges`, `app.import_airlines`, `app.import_service_centers`,
  `app.import_field_executives`). The FK-map preload step can move behind a
  per-master `app.import_preload_<master>(v_tenant, p_rows)` helper. Row-level
  error semantics (`CMS00`/`CMS01`, constraint catches) stay in the dispatcher
  loop so the transactional guarantees are preserved.
- **`public.lookup` → dispatcher + `app.lookup_<key>()` helpers.** Keep the
  auth/limit/pattern preamble and the unknown-key error in `lookup`; move each
  branch into a `stable security definer` `app.lookup_<key>(v_pat text, v_limit
  integer)` returning `table(id uuid, code text, name text, hint text)`
  (e.g. `app.lookup_country`, `app.lookup_product`, `app.lookup_charge`,
  `app.lookup_service_center`, `app.lookup_field_executive`). The dispatcher
  becomes a `case p_key` that `return query select * from app.lookup_<key>(...)`.
- **Sequencing.** Do this as its own migration after the last catalog master
  ships, with the SQL harness proving identical behavior before/after (the
  existing `*_verification.sql` suites already cover every branch). This is a
  pure internal refactor — no schema, RLS, grant, or API change.

### Remaining work (Phase 3 catalog)

- **Deferred to later slices**: Service Mapping, Vendor dependencies, Local
  Branch, and the remaining Customer/Vendor aggregates (which will follow the
  Aggregate Save Pattern below).

## Milestone 10A — Simple Party Masters (Consignees + Shippers)

First slice of **Phase 3 — Party Masters**. Mirrors Catalog Milestone 9A: two
self-contained flat address-book masters on the frozen global contract. **No
`customer_id` FK yet** — `customer_name text` is optional until Milestone 10B
(Customer aggregate).

### Migration `0022_party_masters_simple.sql`

| Object | Slug | Notes |
|---|---|---|
| `consignees` | `mst.consignee-master` | receiver directory; `mobile` required; optional composite FKs `(tenant_id, state_id)` → `states`, `(tenant_id, country_id)` → `countries`; `customer_name text` (no Customer FK yet). |
| `shippers` | `mst.shipper-master` | sender directory; same column contract as consignees. |

Both tables get the full contract (audit cols, `deleted_at`, `row_version`,
`UNIQUE (tenant_id, id)`, tenant-leading + `gin_trgm` indexes,
`app.attach_master_triggers`, four RLS policies).

**Import + lookup extended, not redesigned.** `public.import_master` and
`public.lookup` are re-created with all prior branches kept **verbatim** and
party branches appended (`consignees` / `shippers` preload `state_code` /
`country_code` maps; `customer` alias → `customer_name`; `mobile` required;
`consignee` / `shipper` lookup keys return ACTIVE rows only), each with
`TODO(catalog-split)` markers — **no public-API change**.

Generator: `supabase/tests/gen_party_migration.mjs` (extends `0020`).

### Frontend

- **Schemas** (`consignees.ts`, `shippers.ts`): shared `PARTY_STATUSES`, Zod
  create/update with `mobile` required and optional `state_id` / `country_id`.
- **Resources** registered in `masterResources`; `lookupKey` =
  `consignee` / `shipper`.
- **Permission map**: `SIMPLE_PARTY_MASTER_PERMISSIONS` in
  `src/lib/permissions.ts` (slugs already seeded in `0010`).
- **Screens wired** (live/demo, Zod validation, optimistic locking, permission
  gating, CSV import/export) — UI/UX preserved:

| Screen | Table | Live FK picker |
|---|---|---|
| Consignee | `consignees` | `state`, `country` via `LookupCombobox`; `customer` via `LookupCombobox` (10B); pin code as text. |
| Shipper | `shippers` | same as Consignee |

Demo mode keeps the existing `MasterLookupDialog` pickers for customer / geo.

### Verification

- `supabase/tests/party_masters_verification.sql` — structure, import
  (VALIDATE/COMMIT/FK resolve/mobile required/idempotency), lookup
  (ACTIVE-only), optimistic lock.
- `src/lib/masters/schemas/partySchemas.test.ts` — Zod coverage for party
  schemas.

## Milestone 10B — Customer Aggregate

Customer aggregate ROOT + Addresses child; links consignees/shippers/users via
`customer_id`. Follows the Aggregate Save Pattern (9B).

### Migration `0023_customer_aggregate.sql`

| Object | Slug | Notes |
|---|---|---|
| `customers` | `mst.customer-master` | wide ROOT (personal + billing); `wizard_extras jsonb` for contract/other/notification prefs |
| `customer_addresses` | (customer-master gated) | 1:N child synced by `save_customer` |
| `consignees.customer_id` / `shippers.customer_id` | — | optional composite FK; import resolves `customer_code` |
| `users.customer_id` | — | composite FK for portal users |

**RPC:** `public.save_customer(p_id, p_row_version, p_fields, p_addresses, p_wizard_extras, …)` — extended in 10C with optional child arrays.

**Import + lookup:** `customers` root import; `customer` lookup key (ACTIVE only).

Generator: `supabase/tests/gen_customer_migration.mjs`.

### Frontend

- `schemas/customers.ts`, `resources/customers.ts`, `customerUiMap.ts`
- `CUSTOMER_AGGREGATE_PERMISSIONS` in `permissions.ts`
- Customer screen: live list + aggregate save; Consignee/Shipper: customer `LookupCombobox`

### Verification

- `supabase/tests/customer_aggregate_verification.sql`
- `partySchemas.test.ts` extended for customer + `customer_id` on party schemas

## Milestone 10C — Customer Wizard Children

Normalizes fuel surcharges, other charges, volumetrics, and KYC wizard tabs into
dedicated child tables. `wizard_extras` retains contract / other / notification
prefs only.

### Migration `0024_customer_wizard_children.sql`

| Object | Slug | Notes |
|---|---|---|
| `customer_fuel_surcharges` | (customer-master gated) | 1:N; replace sync |
| `customer_other_charges` | (customer-master gated) | 1:N; replace sync |
| `customer_volumetrics` | (customer-master gated) | 1:N; replace sync |
| `customer_kyc_documents` | (customer-master gated) | 1:N; replace sync (file upload deferred) |

**RPC:** `public.save_customer(..., p_wizard_extras, p_fuel_surcharges, p_other_charges, p_volumetrics, p_kyc_documents)` — accepts snake_case or camelCase JSON keys from the UI.

### Frontend

- Child Zod schemas in `schemas/customers.ts`
- `fetchCustomerChildren()` + extended `saveCustomer()` in `resources/customers.ts`
- `customerUiMap.ts` maps DB rows ↔ wizard tabs; save payload splits children from `wizardExtras`
- Customer screen loads all children on edit and passes them to aggregate save

### Verification

- `supabase/tests/customer_children_verification.sql` — structure, child sync, replace semantics, wizard_extras scope
- `partySchemas.test.ts` extended for customer child schemas

### Remaining work (Phase 3 party)

- Still deferred: party-level Service Mapping links.

## Milestone 11B — Vendor Aggregate

Vendor aggregate ROOT + Addresses / Contacts / Bank Accounts children; follows the
Aggregate Save Pattern (10B/10C).

### Migration `0025_vendor_aggregate.sql`

| Object | Slug | Notes |
|---|---|---|
| `vendors` | `mst.vendor-master` | wide ROOT; `wizard_extras jsonb` for rates-file metadata only |
| `vendor_addresses` | (vendor-master gated) | 1:N; replace sync |
| `vendor_contacts` | (vendor-master gated) | 1:N; replace sync |
| `vendor_bank_accounts` | (vendor-master gated) | 1:N; replace sync |
| `pincodes.vendor_id` | — | composite FK activated (deferred since 0015) |

**RPC:** `public.save_vendor(p_id, p_row_version, p_fields, p_wizard_extras, p_addresses, p_contacts, p_bank_accounts)`.

**Import + lookup:** `vendors` root import; `vendor` and `bank` lookup keys (ACTIVE only).

Generator: `supabase/tests/gen_vendor_migration.mjs`.

### Frontend

- `schemas/vendors.ts`, `resources/vendors.ts`, `vendorUiMap.ts`
- `VENDOR_AGGREGATE_PERMISSIONS` in `permissions.ts`
- Vendor screen: live list + aggregate save wizard (Details → Addresses → Contacts → Bank → Rates placeholder)

### Verification

- `supabase/tests/vendor_aggregate_verification.sql`
- `partySchemas.test.ts` extended for vendor + child schemas

### Remaining work (Phase 3 party)

- Completed in Milestones 11D–11F, 12A–12C (see below).

## Milestone 11D–11F — Vendor Wizard Children

Normalizes Documents, Services, and API Credentials wizard tabs into dedicated
child tables. `wizard_extras` retains rates-file metadata only.

### Migration `0026_vendor_wizard_extensions.sql`

| Object | Slug | Notes |
|---|---|---|
| `vendor_documents` | (vendor-master gated) | 1:N; replace sync (file storage FK deferred) |
| `vendor_services` | (vendor-master gated) | 1:N; billing vendor composite FK; replace sync |
| `vendor_api_credentials` | (vendor-master gated) | 1:N; replace sync |

**RPC:** `public.save_vendor(..., p_documents, p_services, p_api_credentials)` — extended in 0026; accepts snake_case or camelCase JSON keys from the UI.

Generator: `supabase/tests/gen_vendor_wizard_migration.mjs`.

### Frontend

- Child Zod schemas in `schemas/vendors.ts` (`vendorDocumentSchema`, `vendorServiceSchema`, `vendorApiCredentialSchema`)
- `fetchVendorChildren()` + extended `saveVendor()` in `resources/vendors.ts`
- `vendorUiMap.ts` maps DB rows ↔ wizard tabs; save payload splits children from `wizardExtras` (rates metadata only)
- Vendor screen: Documents, Services, API Credentials tabs with placeholder UI; load/save wired for all child collections

### Verification

- `supabase/tests/vendor_wizard_verification.sql` — structure, child sync, replace semantics, wizard_extras scope
- `partySchemas.test.ts` extended for vendor wizard child schemas

## Milestone 12A — Service Mapping Master

Flat master linking vendor + service → billing vendor, weight band, carrier link.

### Migration `0027_service_mapping_master.sql`

| Object | Slug | Notes |
|---|---|---|
| `service_mappings` | `mst.service-mapping` | composite FKs to `vendors`; unique `(tenant_id, vendor_id, service)` |

**Import:** `service_mappings` arm resolves `vendor_code`, `billing_vendor_code`.

### Frontend

- `schemas/serviceMappings.ts`, `resources/serviceMappings.ts`, `SERVICE_MAPPING_PERMISSIONS`
- `master.operation.service-mapping.tsx` — live CRUD + vendor `LookupCombobox`

### Verification

- `supabase/tests/service_mapping_verification.sql`

## Milestone 12B — Vendor Contract Aggregate

Contract header + rate slabs; search-gated list (no lookup key).

### Migration `0028_vendor_contract_aggregate.sql`

| Object | Slug | Notes |
|---|---|---|
| `vendor_contracts` | `mst.vendor-contract-master` | ROOT with geo/product FKs |
| `vendor_contract_slabs` | (vendor-contract gated) | 1:N replace sync |

**RPC:** `public.save_vendor_contract(p_id, p_row_version, p_fields, p_slabs)`.

**Import:** root-only `vendor_contracts` arm.

Generator: `supabase/tests/gen_vendor_contract_migration.mjs`.

### Frontend

- `schemas/vendorContracts.ts`, `resources/vendorContracts.ts`, `vendorContractUiMap.ts`
- `master.vendor.vendor-contract.tsx` — live search + aggregate save

### Verification

- `supabase/tests/vendor_contract_verification.sql`

## Milestone 12C — Local Branch Master

Service-centre-scoped branch profile; extended fields in `wizard_extras` until normalized.

### Migration `0029_local_branch_master.sql`

| Object | Slug | Notes |
|---|---|---|
| `local_branches` | `mst.local-branch-master` | FK to `branches`; `serviceable_pincodes jsonb` on root |

**Import + lookup:** `local_branches` import; `branch` and `local-branch` lookup keys.

Generator: `supabase/tests/gen_local_branch_migration.mjs`.

### Frontend

- `schemas/localBranches.ts`, `resources/localBranches.ts`, `localBranchUiMap.ts`
- `master.sales.local-branch.tsx` — live CRUD when authed

### Verification

- `supabase/tests/local_branch_verification.sql`

## Phase 3 — Completion Status

**Shipped (Migrations 0014–0029):** Geo masters, import/lookup framework, catalog
masters (simple + complex + aggregate), party masters (customer/vendor aggregates
+ wizard children), service mapping, vendor contracts, local branch. All wired
master screens use live/demo dual mode with the resource layer.

**Deferred to post–Phase 3 (rating / tax / ops slice per blueprint §2.7):**

- `customer_rates` + Customer Rate screen backend
- Global `fuel_surcharge_rates`, `tax_rates`, `zone_mappings`
- Customer Expense master (if distinct from expense heads)
- Vendor document file upload (`file_id` FK to storage)
- API credential encryption at rest
- Normalized local-branch child tabs (terms, bank, voucher counters)

## Architectural Guideline — Aggregate Save Pattern

Use this pattern for any master that is an **aggregate**: a root row plus one or
more child collections (and/or M:N junctions) that must be saved together
atomically. Established by charge dependencies (9A) and generalized by service
centers (9B).

**When to use it**

- The master has a child collection (1:N) or junction (M:N) that must stay
  consistent with the root — e.g. Service Center → Terms, Charge → included
  charges, and (future) Customer → contacts/rates, Vendor → contracts, Service
  Mapping → route rows.
- Do **not** force these into the generic CRUD framework. Keep generic CRUD
  generic (single-table, optimistic-locked, RLS-scoped).

**Backend contract**

1. One `SECURITY DEFINER` RPC per aggregate (`public.save_<aggregate>(...)`),
   `set search_path = public, app`, granted to `authenticated, service_role`.
2. Resolve tenant from `app.user_tenant_ids()` (never trust a client tenant id)
   and check `app.user_has_permission(tenant, slug, 'add'|'modify')` explicitly.
3. Upsert the root: insert when no id; on update, guard with
   `row_version = p_row_version` and raise SQLSTATE `40001` when 0 rows match
   (optimistic lock). Let the root's touch/audit triggers own `row_version` and
   the root audit entry.
4. Synchronize each child collection with **replace semantics**
   (delete-then-insert), filtering invalid/cross-tenant/blank entries. Child
   tables carry `tenant_id` + a **composite FK** `(tenant_id, root_id)` `ON
   DELETE CASCADE`, RLS gated by the aggregate's slug, and **no**
   `row_version`/touch/audit trigger (they are owned by the root).
5. Write one aggregate-level audit entry (`app.write_audit_log`) summarizing the
   child sync. Return the persisted root row.

**Frontend contract**

- Keep the aggregate save + child-fetch helpers next to the resource definition
  (e.g. `saveServiceCenter` / `fetchServiceCenterTerms`), out of the generic
  resource layer.
- List/read the root through the generic `useMasterList`/`baseCrud`; load child
  collections on edit; create/update through the aggregate RPC; delete through
  the generic soft-delete. Invalidate `masterKeys.all(resource.key)` after a
  save so both root and any nested child queries refresh.
- Validate the root with the resource's Zod create/update schema and the child
  collection with a dedicated schema before calling the RPC.

**Bulk import**

- Import the root only (child collections are not part of CSV import, mirroring
  charge dependencies). Keep the per-master arm self-contained in
  `public.import_master` with a `TODO(catalog-split)` marker.
