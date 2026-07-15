# Phase 5 — Reports & Dashboard — Setup & Reference

Phase 5 delivers the reporting layer on top of Phase 1–4 foundations. It is
implemented in fixed milestones; this document grows one section per milestone.

Architecture is unchanged: Supabase Postgres, RLS, `SECURITY DEFINER` RPCs,
`app.user_has_permission`, existing `rpt.*` permission slugs, and metadata-driven
report definitions. No new security model.

---

## Milestone 5A — Reporting Framework Foundation (`0042_reporting_foundation.sql`)

Builds **only** the generic reporting infrastructure. Individual operational /
financial / AR / audit report packs, dashboard KPIs, PDF/Excel exports, email
schedulers, `report_jobs`, and materialized rollups are **out of scope**.

### Architecture

```
UI (ReportRunner)
  → get_report_definition(report_key)     # filters, columns, permission, formats
  → validate_report_filters(key, filters) # metadata rules + 31-day date cap
  → execute_report(key, filters, page…)   # sync JSON rows only
       ↓
  report_definitions.source_entity
       ↓
  app.execute_report_source (SHIPMENTS | MANIFESTS | PICKUPS | LEDGER_ENTRIES | LOGIN_LOGS)
```

- Definitions are **metadata**, not SQL strings in tables.
- Execution is **source-entity driven**; new reports plug in by seeding metadata
  (and extending the source executor only when a new entity family is needed).
- Permissions reuse existing `rpt.*` modules (`list` / `search`).

### Metadata model

| Table | Role |
| --- | --- |
| `report_categories` | Hubs (OPERATIONS, STATEMENTS, …) |
| `report_definitions` | Registry: key, hub, permission_slug, source_entity, date_column, filter_schema, columns, allowed_formats |
| `report_filters` | Normalized filter rows mirroring `filter_schema` |
| `saved_report_filters` | Optional per-user saved filter bags |

Filter types: `DATE`, `DATE_RANGE`, `LOOKUP`, `ENUM`, `BOOLEAN`, `TEXT`.

### Seeded subset (representative only)

| report_key | Source | Permission |
| --- | --- | --- |
| `awb-register` | SHIPMENTS | `rpt.awb-report` |
| `manifest-register` | MANIFESTS | `rpt.manifest-report` |
| `pickup-register` | PICKUPS | `rpt.operation-report` |
| `customer-ledger` | LEDGER_ENTRIES | `rpt.statement-report` |
| `login-log` | LOGIN_LOGS | `rpt.login-log` |

The remaining ~74 hub reports are added in later milestones without changing the
engine contract.

### RPCs

| RPC | Behaviour |
| --- | --- |
| `list_report_definitions(hub?)` | Permission-filtered catalog |
| `get_report_definition(report_key)` | Filters, columns, permission, export options metadata |
| `validate_report_filters(report_key, filters)` | Required fields, enums, booleans, date order, ≤31-day span |
| `execute_report(key, filters, page, page_size, sort_by, sort_dir)` | Synchronous execution + pagination; **no** exports/jobs |

### Frontend

Reusable components (no report-specific screens):

| Component | Role |
| --- | --- |
| `ReportFilterBuilder` | Renders filters from metadata |
| `ReportTable` | Column-driven result grid |
| `ReportToolbar` | Title + Run / Reset |
| `ReportPagination` | Server page chrome |
| `ReportRunner` | Loads definition → validate → execute |

Routes:

- `/reports/run` — catalog (`list_report_definitions`)
- `/reports/run/$reportKey` — generic runner

Lib: `src/lib/reports/` (`getReportDefinition`, `validateReportFilters`, `executeReport`, …).

Existing hub demos (`/reports/awb`, `/reports/statements`, …) remain placeholders
for non-operational packs. `/reports/operations` lists 5B operational reports and
opens each in `ReportRunner`.

### Execution flow

1. Client loads definition (permission-checked).
2. User sets filters; client calls `validate_report_filters`.
3. On success, `execute_report` builds a tenant-scoped query from `source_entity`,
   applies date window + common filter keys, returns `{ rows, total, page, columns }`.
4. Client pages/sorts via the same RPC (sync only).

### Future report expansion

To add a report without redesign:

1. `app.seed_report_definition(...)` with filter_schema + columns + existing `rpt.*` slug.
2. Ensure `source_entity` is already supported (or extend `app.execute_report_source`
   for a new entity family once — still no per-report SQL in tables).
3. Point UI at `ReportRunner` with the new `report_key`.

Deferred (later phases): PDF/Label exports, email scheduler. Report jobs +
CSV/XLSX delivered in 5G. Dashboard KPI shell delivered in 5F; trend charts
remain deferred until scheduled rollup refresh.
`report_jobs` queue, materialized `daily_*_stats` rollups, finance/AR/audit packs.

### Verification

`supabase/tests/reporting_foundation_verification.sql` — structure, seed,
metadata load, filter validation (incl. 31-day), execution + pagination,
permission deny, tenant isolation.

Registered in `supabase/tests/run_local_rls_check.sh`.

### Deploy

Apply `0042_reporting_foundation.sql` after `0041_rating_engine.sql`.

---

## Milestone 5B — Operational Reports (`0043_operational_reports.sql`)

Extends the 5A engine with operational report **metadata** and additional
`source_entity` families. Public `execute_report` / `validate_report_filters` /
`get_report_definition` signatures are unchanged.

### Implemented operational reports

| report_key | Source entity | Permission |
| --- | --- | --- |
| `pickup-register` | PICKUPS | `rpt.operation-report` |
| `awb-register` | SHIPMENTS | `rpt.awb-report` |
| `manifest-register` | MANIFESTS | `rpt.manifest-report` |
| `manifest-inscan-report` | MANIFEST_SCAN_EVENTS | `rpt.scan-report` |
| `drs-register` | DRS | `rpt.drs-report` |
| `pod-report` | POD_RECORDS | `rpt.manifest-pod-report` |
| `tracking-history` | TRACKING_EVENTS | `rpt.delivery-status-report` |
| `shipment-status-report` | SHIPMENTS | `rpt.delivery-status-report` |
| `undelivered-report` | SHIPMENTS (status preset) | `rpt.undelivery-report` |
| `delivery-report` | SHIPMENTS (status preset) | `rpt.ok-delivery` |
| `scan-reconciliation-report` | SHIPMENT_SCAN_EVENTS | `rpt.scan-report` |
| `mis-operational-summary` | OPS_MIS_SUMMARY | `rpt.mis-report` |

Status presets for undelivered / delivery reuse `shipments.current_status` snapshots
(no duplicate status machine). MIS is a live `GROUP BY` over shipments — materialized
`daily_*_stats` remain deferred.

### Supported filters (blueprint set)

Date range (≤31d), Branch, Service Center, Customer, Destination, Shipment Status,
DRS, Manifest, Pickup, Product, Sales Executive, Field Executive, AWB Number —
applied per report via metadata (only where the source entity has the join).

### Frontend

- `/reports/operations` → permission-filtered list of the 12 keys → `ReportRunner`
- `src/lib/reports/operationalKeys.ts` — key registry + hub id map

No new report components.

### Deferred operational / hub items

| Item | Reason |
| --- | --- |
| Unassigned DRS / Manifest / OBC reports | Assignment heuristics / OBC bagging flows not fully specified for reporting |
| Bagging / OBC checklist reports | Bagging module depth beyond 5B scope |
| Forwarding No Missing / Comment View | Forwarding + comment analytics not wired as report sources |
| AWB Printing / EDI CSB / format exports | Export / print services are 5G+ |
| Action Log / User Analysis / Login Log (ops hub demos) | Audit / session packs → 5E |
| Materialized MIS rollups | `daily_branch_stats` / `daily_customer_stats` → later performance milestone |

### Verification

`supabase/tests/operational_reports_verification.sql` — metadata registration,
permissions, filter validation, pagination, sorting, tenant isolation, seeded
transaction correctness.

Harness: `run_local_rls_check.sh`. Vitest: `operationalKeys.test.ts`.

### Deploy

Apply `0043_operational_reports.sql` after `0042_reporting_foundation.sql`.

---

## Milestone 5C — Financial Reports (`0044_financial_reports.sql`)

Extends the 5A engine with financial report **metadata** and
`RECEIPTS` / `EXPENSE_ENTRIES` / `CUSTOMER_PAYMENTS` source entities.
`LEDGER_ENTRIES` remains shared with the 5A customer ledger (customer optional
for `ledger-register`). Public RPC signatures are unchanged.

No invoice, GST, or IRN tables/RPCs exist yet — those reports are deferred.

### Implemented financial reports

| report_key | Source entity | Permission |
| --- | --- | --- |
| `receipt-register` | RECEIPTS | `rpt.cash-collection-report` |
| `cash-collection-report` | RECEIPTS (mode preset CASH) | `rpt.cash-collection-report` |
| `expense-register` | EXPENSE_ENTRIES | `rpt.statement-report` |
| `expense-authorization-report` | EXPENSE_ENTRIES (status preset UNAUTHORIZED) | `rpt.statement-report` |
| `customer-payment-register` | CUSTOMER_PAYMENTS | `rpt.statement-report` |
| `customer-payment-approval-report` | CUSTOMER_PAYMENTS (status preset PENDING) | `rpt.statement-report` |
| `ledger-register` | LEDGER_ENTRIES | `rpt.statement-report` |
| `customer-ledger` | LEDGER_ENTRIES (customer required) | `rpt.statement-report` |

### Supported filters

Date range (≤31d), Branch, Customer, Payment Status, Expense Status, Receipt
Number, Ledger Account, Payment Mode, Amount Min/Max — applied per report via
metadata where the source entity supports the join. Vendor filter is unused
(finance vouchers have no vendor FK).

### Frontend

- `/reports/statements` → permission-filtered FINANCIAL hub list → `ReportRunner`
- `src/lib/reports/financialKeys.ts` — key registry + hub id map

No new report components.

### Deferred financial reports

| Item | Reason |
| --- | --- |
| Billing Register / Invoice Report | No `invoices` table or invoice RPCs yet |
| GST Register / Tax Report | No GST register / IRN document model yet |
| Profit / Customer Register Profit / Vendor Profit | Insufficient margin/cost model for a truthful profit report |
| Debit/Credit note registers | Notes modules not implemented in Phase 4 finance foundation |

### Verification

`supabase/tests/financial_reports_verification.sql` — metadata, permissions,
tenant isolation, filter validation, pagination, sorting, seeded finance
correctness (incl. cash/auth/approval presets).

Harness: `run_local_rls_check.sh`. Vitest: `financialKeys.test.ts`.

### Deploy

Apply `0044_financial_reports.sql` after `0043_operational_reports.sql`.

---

## Milestone 5D — Accounts Receivable Reports (`0045_accounts_receivable_reports.sql`)

Extends the 5A engine with AR hub metadata and source entities
`AR_BALANCE_SUMMARY`, `AR_OUTSTANDING_DETAIL`, `AR_AGEING_SUMMARY`,
`AR_AGEING_DETAIL`. Customer statement reuses `LEDGER_ENTRIES`.

Public RPC signatures are unchanged. Filter validation accepts `as_on_date` as
the date window when from/to are omitted.

### Implemented AR reports

| report_key | Source | Permission |
| --- | --- | --- |
| `customer-outstanding-report` | AR_BALANCE_SUMMARY (balance &gt; 0) | `rpt.ar-report` |
| `outstanding-summary` | AR_BALANCE_SUMMARY | `rpt.ar-report` |
| `outstanding-detail` | AR_OUTSTANDING_DETAIL | `rpt.ar-report` |
| `customer-statement` | LEDGER_ENTRIES | `rpt.ar-report` |
| `ageing-summary` | AR_AGEING_SUMMARY | `rpt.ar-report` |
| `ageing-detail` | AR_AGEING_DETAIL | `rpt.ar-report` |
| `as-on-date-outstanding` | AR_BALANCE_SUMMARY | `rpt.ar-report` |
| `customer-balance-report` | AR_BALANCE_SUMMARY | `rpt.ar-report` |

Ageing uses **ledger FIFO open-item** (credits applied to oldest debits). This is
not invoice-line allocation.

### Supported filters

As-On Date, Date Range (statement), Customer, Branch, Outstanding Status
(`ALL` / `OUTSTANDING` / `CLEARED` / `CREDIT`), Ageing Bucket (`0-30` … `90+`),
Balance Min/Max.

### Frontend

- `/reports/ar-report` → AR hub catalog → `ReportRunner`
- `src/lib/reports/arKeys.ts`

### Deferred AR functionality

| Item | Reason |
| --- | --- |
| Invoice / receipt allocation reports | No `invoices` / `receipt_allocations` tables yet |
| Unbilled outstanding | No invoice generation / unbilled shipment billing link |
| Sales-executive / field-executive AR splits | No SE/FE on ledger_entries |

### Verification

`supabase/tests/accounts_receivable_reports_verification.sql` — metadata,
permissions, tenant isolation, as-on validation, pagination, FIFO ageing
correctness (31–60 bucket / open amount).

Harness + Vitest: `arKeys.test.ts`.

### Deploy

Apply `0045_accounts_receivable_reports.sql` after `0044_financial_reports.sql`.

---

## Milestone 5E — Audit & Security Reports (`0046_audit_security_reports.sql`)

Extends the 5A engine with `AUDIT_LOGS` and `SESSIONS` source entities.
`LOGIN_LOGS` (from 5A) is enriched with IP / branch / event presets. Public RPC
signatures are unchanged.

### Implemented audit reports

| report_key | Source | Permission |
| --- | --- | --- |
| `action-log` | AUDIT_LOGS | `rpt.action-log` |
| `module-action-log` | AUDIT_LOGS | `rpt.action-log` |
| `record-history-report` | AUDIT_LOGS | `rpt.action-log` |
| `user-activity-report` | AUDIT_LOGS | `rpt.user-analysis-report` |
| `permission-change-report` | LOGIN_LOGS (PERMISSION_CHANGE) | `rpt.action-log` |

### Implemented security reports

| report_key | Source | Permission |
| --- | --- | --- |
| `login-log` | LOGIN_LOGS | `rpt.login-log` |
| `failed-login-attempts` | LOGIN_LOGS (LOGIN_FAILED) | `rpt.login-log` |
| `session-activity` | SESSIONS | `rpt.login-log` |
| `forced-logout-history` | LOGIN_LOGS (FORCED_LOGOUT) | `rpt.login-log` |
| `authentication-activity` | LOGIN_LOGS (auth events) | `rpt.login-log` |

### Supported filters

Date range, User, Module, Action Type, Entity / Entity Id, Login Status, IP
Address, Session State, Branch (via user’s home branch).

### Frontend

- `/reports/operations` lists operational + AUDIT hub keys → `ReportRunner`
- `src/lib/reports/auditKeys.ts`

### Deferred

| Item | Reason |
| --- | --- |
| User Entry Log (distinct from action/login) | No separate entry-log table; overlaps audit_logs |
| 31 per-module Action Log variants as separate keys | Same AUDIT_LOGS source + `module_slug` filter covers them |
| API request logs | `api_logs` pipeline not implemented as a reportable table |

### Verification

`supabase/tests/audit_security_reports_verification.sql` — metadata, permissions,
tenant isolation, filter validation, pagination, audit + login + session
correctness (incl. failed/forced/permission presets).

Harness + Vitest: `auditKeys.test.ts`.

### Deploy

Apply `0046_audit_security_reports.sql` after `0045_accounts_receivable_reports.sql`.

---

## Milestone 5F — Dashboard & Materialized Rollups (`0047_dashboard_rollups.sql`)

Adds dashboard data layer on Phase 4 transaction tables. Does **not** change the
5A reporting engine. No cron, export jobs, PDF/Excel, or email.

### Rollup tables

| Table | Grain | Metrics (from existing data) |
| --- | --- | --- |
| `daily_branch_stats` | tenant + branch + date | bookings, pickups, pickups_pending, in_transit, delivered, pods, manifests, drs_count, revenue (posted receipts), expenses, receipts_count, pending_payments |
| `daily_customer_stats` | tenant + customer + date | bookings, delivered, revenue, receipts_count, payments_count, payments_amount |

Source tables only: `shipments`, `pickups`, `manifests`, `drs`, `pod_records`,
`receipts`, `expense_entries`, `customer_payments` (+ active counts from
`customers` / `vendors` for live KPIs).

### Refresh strategy

- **Manual only:** `refresh_dashboard_rollups(p_from, p_to)` (≤ 62 days).
- Internals: `app.refresh_daily_branch_stats_for_date`,
  `app.refresh_daily_customer_stats_for_date` (replace-day semantics).
- No background scheduler in 5F.

### KPI RPCs

| RPC | Purpose |
| --- | --- |
| `get_dashboard_summary(p_date, p_branch_id)` | Live operations / finance / customers KPIs |
| `get_dashboard_operations_series(p_from, p_to, p_branch_id)` | Day series from `daily_branch_stats` |
| `refresh_dashboard_rollups(p_from, p_to)` | Manual rollup rebuild |

Permissions: `txn.opertation-dashboard` or `txn.sales-dashboard` (`list`|`search`),
or tenant/platform admin.

### KPI calculations (summary)

**Operations:** today's shipments / pickups / deliveries / PODs; pending DRS
(DRAFT), pending manifest (DRAFT), pending pickup (OPEN|ASSIGNED); active
shipments (non-terminal statuses).

**Finance:** today's receipt count + posted amount; today's expense count +
amount; pending customer payments.

**Customers:** active customers; active vendors.

### Frontend

- `src/lib/dashboard/*` — resources, `summaryToKpiCards`, `useDashboardKpis`
- `src/components/dashboard/*` — KPI cards + summary sections
- `/dashboard` wired to live summary (existing shell; no chart redesign)

### Deferred dashboard widgets

| Item | Reason |
| --- | --- |
| Trend / operations charts | Needs scheduled rollup refresh (5G / ops); series RPC exists but UI deferred |
| Revenue MTD chart | No dedicated MTD rollup; use finance reports |
| Export / PDF dashboard packs | Milestone 5G |
| Cron / incremental event refresh | Explicitly out of 5F |

### Verification

`supabase/tests/dashboard_rollups_verification.sql` — structure, KPIs, refresh,
rollup correctness, permissions, tenant isolation.

Harness + Vitest: `mapSummary.test.ts`.

### Deploy

Apply `0047_dashboard_rollups.sql` after `0046_audit_security_reports.sql`.

---

## Milestone 5G — Export & Report Jobs (`0048_report_jobs.sql`)

Completes Phase 5 with asynchronous export jobs. Reuses the 5A reporting
engine (`app.execute_report_source`) and `public.files`. No cron, workers,
PDF, email, or Phase 6 utilities.

### Job model

| Column | Notes |
| --- | --- |
| `report_key`, `filters`, `output_format` | Snapshot of the export request |
| `status` | `QUEUED` → `RUNNING` → `COMPLETED` / `FAILED` / `CANCELLED` |
| `progress` | 0–100 |
| `file_id` | Link to `files` (owner_type `REPORT_JOB`) |
| `result_content` | SQL-side artifact for download (no storage worker in 5G) |
| `error_message`, timestamps | Lifecycle diagnostics |

### RPCs

| RPC | Behaviour |
| --- | --- |
| `create_report_job(key, filters, format)` | Validate + queue (`CSV`\|`XLSX`) |
| `list_report_jobs(status?, key?, page, size)` | Tenant-scoped paging |
| `get_report_job(id)` | Status, progress, download (base64 content when complete) |
| `cancel_report_job(id)` | Only while `QUEUED` or `RUNNING` |
| `execute_report_job(id)` | **Manual** run: engine → CSV/XLSX → `files` → `COMPLETED` |

Permissions: existing report `permission_slug` (`list`/`search`). No new RBAC.

### Export formats

| Format | Implementation |
| --- | --- |
| CSV | RFC-style CSV from report columns/rows |
| XLSX | SpreadsheetML Excel-openable artifact (no OOXML zip worker) |

Row export cap: 5,000 (engine page).

### Frontend

- `/reports/jobs` — status list, progress, Run/Retry, Cancel, Download
- ReportRunner toolbar: CSV / XLSX → create + execute → navigate to jobs
- `src/lib/reports/jobs.ts`, `jobStatus.ts`, `jobTypes.ts`

### Deferred

| Item | Reason |
| --- | --- |
| PDF / Label | Blueprint headless render — out of 5G |
| Email delivery / scheduling | notify-email queue — later |
| Cron / background workers | Manual `execute_report_job` only |
| Object-storage upload worker | Metadata + `result_content` download path |
| True OOXML `.xlsx` zip | SpreadsheetML substitute until worker |

### Verification

`supabase/tests/report_jobs_verification.sql` — structure, lifecycle, file
creation, download, cancel, permissions, tenant isolation.

Harness + Vitest: `jobStatus.test.ts`.

### Deploy

Apply `0048_report_jobs.sql` after `0047_dashboard_rollups.sql`.

---

## Stop condition (5G) — Phase 5 COMPLETE

Milestone 5G is complete when report jobs + CSV/XLSX export infrastructure
above are verified. **Phase 5 is frozen.**

**Do not** start Phase 6 (Utility & Bulk Tooling) until approved.
