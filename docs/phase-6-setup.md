# Phase 6 — Utility & Bulk Tooling — Setup & Reference

Phase 6 delivers utility and bulk tooling on Phases 1–5. It is implemented in
fixed milestones; this document grows one section per milestone.

Architecture is unchanged: Supabase Postgres, RLS, `SECURITY DEFINER` RPCs,
existing `utl.*` permission slugs, and the **existing** import framework
(`import_jobs` / `import_row_errors` / VALIDATE–COMMIT) from Phase 3.

---

## Milestone 6A — Excel Import Suite (`0049_excel_import_suite.sql`)

Implements transactional Excel/CSV imports for operations data. Reuses the
master-import contract; does **not** redesign the dispatcher pattern.

### Supported imports

| Type | Permission | Target |
| --- | --- | --- |
| `AWB_MERGE` | `utl.awb-merging` | `shipments` (create / update / soft-delete) |
| `POD_MERGE` | `utl.pod-merging` | `pod_records` + shipment → `DELIVERED` |
| `FORWARDING_MERGE` | `utl.forwarding-merging` | `shipments.forwarding_awb` (+ optional opt-lock) |
| `AWB_STOCK` | `utl.customer-awb-stock-merging` | `customer_awb_stock` (new table) |
| `OTHER_CHARGES` | `utl.other-charges-import` | `customer_other_charges` |
| `DATA_UPDATE` | `utl.data-updation` | shipment field updates (+ optional opt-lock) |

### Handler architecture

```
UI (existing Excel Import screens)
  → import_excel(type, mode, rows, params)
       ↓
  permission (utl.* add) + import_jobs (COMMIT)
       ↓
  CASE dispatch → app.excel_import_* handlers
       ↓
  CMS01 row errors → import_row_errors
  unexpected error → full transaction rollback
```

Handlers:

- `app.excel_import_awb_merge`
- `app.excel_import_pod_merge`
- `app.excel_import_forwarding_merge`
- `app.excel_import_awb_stock`
- `app.excel_import_other_charges`
- `app.excel_import_data_updation`

### Dry-run vs commit

| Mode | Behaviour |
| --- | --- |
| `VALIDATE` | Per-row subtransaction + `CMS00` rollback (same as `import_master`); no job row |
| `COMMIT` | Persist valid rows; expected row failures → `import_row_errors`; summary audit |

### Validation strategy

- Required columns enforced per handler (`CMS01`).
- FK codes resolved against tenant masters (`customers`, `products`, `destinations`).
- Idempotency: duplicate AWB / stock / existing POD → `skipped`.
- Optimistic locking: optional `row_version` on forwarding + data updation.
- Batch cap: 5,000 rows (chunk on client).

### Frontend

Existing screens under `/utility/excel-import/*` wired to:

- `src/lib/imports/excelImport.ts` — RPC + chunking
- `src/lib/imports/excelUi.ts` — CSV parse via existing `parseCsv` / templates
- Validate + Import buttons; toast summaries (same pattern as master import)

### Deferred (later Phase 6 milestones)

| Item | Milestone |
| --- | --- |
| Rate Update Jobs | 6B |
| Zone Update Jobs | 6C |
| Tax / Fuel Setup | 6D |
| Notifications / Email configs | later |
| Serviceable Pincode | later |
| True XLSX binary parse (client) | later — CSV templates work today |
| Background job-queue worker for imports | later |

### Verification

`supabase/tests/excel_import_suite_verification.sql` — structure, dry-run,
commit, row errors, idempotency, permissions, tenant isolation.

### Deploy

Apply `0049_excel_import_suite.sql` after `0048_report_jobs.sql`.

---

## Stop condition (6A)

Milestone 6A is complete when the six Excel import handlers above are verified.
**Do not** start Milestone 6B (Rate Update Jobs) until approved.

---

## Milestone 6B — Rate Update Jobs (`0050_rate_update_jobs.sql`)

Bulk recalculation of shipment charge snapshots after rate / contract / fuel /
tax master changes. Reuses **Phase 4H rating engine** exactly
(`app.run_shipment_rating`). No duplicate pricing logic.

### Job lifecycle

`QUEUED` → `RUNNING` → `COMPLETED` | `FAILED` | `CANCELLED`

| RPC | Behaviour |
| --- | --- |
| `create_rate_update_job(type, filters)` | Normalize filters, count candidates, queue |
| `execute_rate_update_job(id)` | Manual run; per-shipment engine call + progress |
| `list_rate_update_jobs` / `get_rate_update_job` | Tenant-scoped status |
| `cancel_rate_update_job(id)` | Only while `QUEUED` / `RUNNING` |

`update_type`: `AWB_RATE` | `VENDOR_RATE` | `TAX_FUEL` | `OBC_RATE` (all invoke the
same full rating pipeline).

Permission: `utl.rate-update`.

### Filters

Date range (`from_date`/`to_date`, ≤ 92 days), Customer, Product, Zone,
Destination, Branch (codes or ids).

### Skip rules

Shipments that are **locked**, **invoiced** (`invoice_id`), or **cancelled/void**
are counted as `skipped_shipments` and not modified. Engine `CMS04` races also
count as skips. Unexpected errors increment `failed_shipments` without aborting
the batch.

### Rating engine reuse

Eligible rows call `app.run_shipment_rating(shipment_id, true)` which:

- asserts editable
- recalculates freight / fuel / tax / vendor
- persists `shipment_charge_snapshots` + shipment totals
- writes `rating_audit` + `audit_logs` (module `txn.awb-entry`)

Job completion also audits `rate_update_jobs` under `utl.rate-update`.

### Frontend

- `/utility/rate-zone-update/rate-update` — create (+ optional queue-only) then run
- `/utility/rate-zone-update/rate-update-jobs` — list, progress, Run/Retry, Cancel, summary
- `src/lib/rate-update/*`

### Deferred

Tax/Fuel setup screens, Notifications, Email configs, Serviceable Pincode,
background workers / cron.

### Verification

`supabase/tests/rate_update_jobs_verification.sql` — structure, filters, skip
locked/invoiced/cancelled, snapshot + rating audit, progress, cancel,
permissions, tenant isolation.

Harness + Vitest: `jobStatus.test.ts`.

### Deploy

Apply `0050_rate_update_jobs.sql` after `0049_excel_import_suite.sql`.

---

## Milestone 6C — Zone Update Jobs (`0051_zone_update_jobs.sql`)

Bulk shipment zone reassignment after zone mapping / destination / pincode
master changes. Reuses **`app.resolve_rating_zone`** (Phase 4H) and optionally
**`app.run_shipment_rating`** (Phase 6B pipeline). No duplicate zone or rating
logic.

Also adds `shipments.zone_id` so current-zone filters and updates persist.

### Job lifecycle

`QUEUED` → `RUNNING` → `COMPLETED` | `FAILED` | `CANCELLED`

| RPC | Behaviour |
| --- | --- |
| `create_zone_update_job(filters, rerate)` | Normalize filters, count candidates, queue |
| `execute_zone_update_job(id)` | Manual run; resolve zone + optional rerate + progress |
| `list_zone_update_jobs` / `get_zone_update_job` | Tenant-scoped status |
| `cancel_zone_update_job(id)` | Only while `QUEUED` / `RUNNING` |

Permission: `utl.zone-update`.

### Zone resolution

For each eligible shipment:

1. Call `app.resolve_rating_zone` (zone_mappings → destination.zone_id fallback).
2. If resolved zone equals `shipments.zone_id` → **skip** (unchanged).
3. Else update `shipments.zone_id`, write `audit_logs` (`utl.zone-update`).
4. If `rerate_after_update` → call `app.run_shipment_rating(shipment_id, true)`.

### Filters

Date range (`from_date`/`to_date`, ≤ 92 days), Customer, Product, Current Zone,
Destination, Branch (codes or ids).

### Skip rules

- Locked (`is_locked`)
- Invoiced (`invoice_id`)
- Cancelled / void
- Resolved zone unchanged

### Optional rerating

UI checkbox **Recalculate Rating After Zone Update** sets
`rerate_after_update`. Rating uses the existing engine only — no local charge
math in this milestone.

### Frontend

- `/utility/rate-zone-update/zone-update` — Update Shipments tab (filters + rerate + queue)
- `/utility/rate-zone-update/zone-update-jobs` — list, progress, Run/Retry, Cancel, summary
- `src/lib/zone-update/*`

### Deferred

Notifications, Email configs, Serviceable Pincode,
background workers / cron, Phase 7.

### Verification

`supabase/tests/zone_update_jobs_verification.sql` — structure, zone recalc,
skip locked/invoiced/cancelled/unchanged, optional rerate + rating audit,
progress, cancel, permissions, tenant isolation.

Harness + Vitest: `src/lib/zone-update/jobStatus.test.ts`.

### Deploy

Apply `0051_zone_update_jobs.sql` after `0050_rate_update_jobs.sql`.

---

## Milestone 6D — Tax & Fuel Setup (`0052_tax_fuel_setup.sql`)

Configuration masters consumed by the Phase 4H rating engine
(`app.resolve_fuel_pct`, `app.resolve_tax_pcts`). **No rating calculations** and
**no automatic rerating** — after config changes, administrators run Rate Update
Jobs (6B) or Zone Update Jobs with rerate (6C).

### Fuel configuration hierarchy

Effective ACTIVE rows on `fuel_surcharge_rates`, date-effective:

1. **Customer + Product + Zone** (most specific)
2. **Product + Zone**
3. **Global** (null customer / product / zone)

Customer wizard child rows (`customer_fuel_surcharges`) remain a soft override
ahead of the setup table. Vendor/destination columns are retained for UI/import
compatibility and act as secondary specificity only.

### Tax configuration hierarchy

Effective ACTIVE rows on `tax_rates`:

1. **Customer + Product**
2. **Customer** or **Product**
3. **Global**

Interstate vs intrastate selection stays entirely inside
`app.resolve_tax_pcts` (customer billing state vs branch state → IGST vs
CGST+SGST). Config stores `igst_pct` / `cgst_pct` / `sgst_pct`, `tax_type`,
`tax_on_fuel`, and `status`.

### Effective date rules

- `from_date` required; `to_date` optional (open-ended).
- Overlapping ranges for the **identical scope** are rejected (`CMS04`).
- Percentages must be 0–100.
- Soft delete + optimistic locking (`row_version`) on save/delete.

### RPCs

| RPC | Permission |
| --- | --- |
| `save_fuel_rate` / `delete_fuel_rate` / `list_fuel_rates` | `utl.fuel-setup` |
| `save_tax_rate` / `delete_tax_rate` / `list_tax_rates` | `utl.tax-surcharge-setup` |

CSV import reuses `import_master` for masters `fuel_surcharge_rates` and
`tax_rates` (VALIDATE → COMMIT).

### Frontend

- `/utility/tax-charges-setup/fuel-setup` — live/demo, lookups, CSV import
- `/utility/tax-charges-setup/tax-setup` — live/demo, lookups, CSV import
- `src/lib/tax-fuel/*`

### Interaction with Rate / Zone Update Jobs

Saving tax/fuel config **does not** recalculate shipments. To refresh charge
snapshots after master changes:

1. **Rate Update Jobs** (Milestone 6B), or
2. **Zone Update Jobs** with “Recalculate Rating After Zone Update” (6C)

### Deferred

Serviceable Pincode, Notifications/Email (completed in 6E), background workers /
cron, Phase 7.

### Verification

`supabase/tests/tax_fuel_setup_verification.sql` — CRUD, overlap, lookup
priority, soft delete, audit, optimistic lock, CSV import, permissions, tenant
isolation.

Vitest: `src/lib/tax-fuel/schemas.test.ts`.

### Deploy

Apply `0052_tax_fuel_setup.sql` after `0051_zone_update_jobs.sql`.

---

## Milestone 6E — Notifications & Email Configuration (`0053_notifications_email_configuration.sql`)

**Configuration layer only.** No SMTP send, SMS, WhatsApp, push, queues,
workers, or cron. Delivery adapters belong to later phases.

### Notification architecture

| Table | Purpose |
| --- | --- |
| `email_configurations` | Per-tenant SMTP + optional module-scoped templates (Setup UI) |
| `notification_templates` | Message templates by type × channel |
| `notification_preferences` | Tenant toggles: Email / SMS / WhatsApp per notification type |
| `user_notifications` | Per-user inbox (header bell); CRUD + read/unread |

Permissions: `utl.notification` (and `utl.xpresion-setup` for Setup email UI).

### Email configuration model

- Fields: SMTP host/port, username, encrypted password, sender name/email,
  SSL/TLS, status, default flag, optional `module_code`.
- **One ACTIVE default** per tenant (`is_default = true`); module configs use
  `is_default = false` so multiple ACTIVE module rows are allowed.
- Soft delete + optimistic locking on updates.

### Password security

- Stored as `password_enc` via `pgp_sym_encrypt` (pgcrypto).
- Public RPCs return `has_password` only — **never** plaintext or ciphertext.
- Updates are **write-only**: omit / blank password → existing value kept.
- Decrypt helper exists for future delivery workers only; not exposed to clients.
- Override key with `SET app.smtp_crypto_key` in production.

### Notification preferences

Tenant-level enable/disable for Email, SMS, WhatsApp across:

`PICKUP`, `BOOKING`, `MANIFEST`, `DRS`, `POD`, `INVOICE`, `OTP`,
`CUSTOMER_PAYMENT`, `CREDIT_ALERT`, `WEIGHT_ALERT`.

Preferences do not send messages; they only gate future delivery jobs.

### User notifications lifecycle

`create_user_notification` → status `UNREAD` → `mark_notification_read` →
`READ` + `read_at`. Soft delete via `delete_user_notification`. Admins may list
any user; non-admins see their own inbox.

### RPCs

| RPC | Notes |
| --- | --- |
| `save_email_configuration` / `get_email_configuration` / `list_email_configurations` | Password write-only |
| `save_notification_template` / `list_notification_templates` / `delete_notification_template` | Soft delete |
| `save_notification_preferences` / `list_notification_preferences` | Bulk upsert by type |
| `create_user_notification` / `mark_notification_read` / `list_notifications` / `delete_user_notification` | Inbox CRUD |

### Frontend

- `/utility/tax-charges-setup/setup` — SETUP tab SMTP → `email_configurations`
- `/utility/notification` — user inbox
- `/utility/notification-setup` — channel preferences
- `/utility/notification-templates` — templates
- `src/lib/notifications/*`

Live/demo mode, Zod validation, permission gating. No UI redesign.

### Deferred delivery architecture

Future workers (not in 6E) will:

1. Read preferences + templates + SMTP config
2. Decrypt password server-side only
3. Enqueue / send via provider adapters

This milestone stores configuration only.

### Deferred (do not implement here)

SMTP sending, email queues, SMS/WhatsApp providers, push, background workers,
cron, scheduled email, retry logic, Phase 7.

### Verification

`supabase/tests/notifications_email_configuration_verification.sql` — CRUD,
tenant isolation, RLS, one active SMTP, password write-only, preferences,
inbox read/unread, audit, optimistic locking, permissions.

Vitest: `src/lib/notifications/schemas.test.ts`.

### Deploy

Apply `0053_notifications_email_configuration.sql` after `0052_tax_fuel_setup.sql`.

---

## Milestone 6F — Serviceable Pincode & Utility Completion (`0054_serviceable_pincode.sql`)

**Query-only** serviceability over existing Phase 3 geo masters, service
mappings, and Phase 4 zone resolution. Completes the Utility module for Phase 6.
No new geo tables. No carrier / Google Maps / external APIs.

### Serviceability flow

1. Resolve origin & destination rows from `pincodes` (exact pin).
2. Fail if unknown pin, `is_serviceable = false`, missing destination link, or
   destination `status <> ACTIVE`.
3. Optional product filter: product must exist, be ACTIVE, and match
   `shipment_type` (DOX/NDOX) when provided.
4. Resolve zones via **`app.resolve_rating_zone`** (reuse — no duplicate logic),
   falling back to `pincodes.zone_id`.
5. Attach service centre from pincode `branch_id` / matching `service_centers`.
6. Estimated routing = ACTIVE `service_mappings` for destination vendor and/or
   requested service (config data only — no provider calls).

### Data sources

| Source | Role |
| --- | --- |
| `pincodes` | Serviceable / ODA / pickup flags, dest/zone/branch/vendor links |
| `destinations` | Active destination master |
| `zones` / `zone_mappings` | Zone labels + rating lane resolution |
| `products` | Product + shipment type filter |
| `service_mappings` | Estimated routing catalogue |
| `branches` / `service_centers` | Service centre display |

### RPCs

| RPC | Purpose |
| --- | --- |
| `check_serviceable_pincode` | Origin/dest/product/shipment-type check |
| `search_serviceable_pincode` | UI search by pincode or name |
| `list_serviceable_routes` | Browse ACTIVE service mappings |

Permission: `utl.serviceable-pincode`.

### Frontend

- `/utility/serviceable-pincode` — existing search UI + optional lane check
- `src/lib/serviceable-pincode/*`
- Live/demo mode, Zod, permission gating. No redesign.

### Deferred

Carrier APIs, external serviceability providers, Google Maps, SMS/WhatsApp/email
send, workers/cron, **Phase 7 — Integrations**.

### Verification

`supabase/tests/serviceable_pincode_verification.sql` — tenant isolation,
permissions, lookup correctness, zone resolution, product filtering,
active/inactive masters, unknown pincode, result accuracy.

Vitest: `src/lib/serviceable-pincode/schemas.test.ts`.

### Deploy

Apply `0054_serviceable_pincode.sql` after `0053_notifications_email_configuration.sql`.

---

## Phase 6 completion summary (6A–6F)

| Milestone | Migration | Focus |
| --- | --- | --- |
| **6A** | `0049` | Excel Import Suite (ops CSV/Excel via import framework) |
| **6B** | `0050` | Rate Update Jobs (bulk charge snapshot recalculation) |
| **6C** | `0051` | Zone Update Jobs (`resolve_rating_zone` + optional rerate) |
| **6D** | `0052` | Tax & Fuel Setup (config masters for rating) |
| **6E** | `0053` | Notifications & Email Configuration (config only) |
| **6F** | `0054` | Serviceable Pincode (query over existing masters) |

Phase 6 delivers utility/bulk tooling on top of Phases 1–5. It does **not**
include carrier adapters, outbound messaging delivery, or background cron
workers.

---

## Stop condition (6F) — Phase 6 freeze

Milestone 6F and **Phase 6** are complete when serviceable pincode verification
above passes.
**Do not** start Phase 7 (Carrier APIs & Integrations) until approved.
