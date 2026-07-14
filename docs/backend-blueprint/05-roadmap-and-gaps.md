# Backend Blueprint — Part 5: Implementation Roadmap & Open Gaps

## 1. Phased Implementation Roadmap

Each phase lists objectives, dependencies, deliverables (DB / API / infra), testing, migration,
and risks. Phases are sequential but 3–6 have internal parallelism (masters vs transactions can
overlap once auth is stable).

---

### Phase 1 — Foundation (platform skeleton)

- **Objectives:** repo/service scaffold, PostgreSQL + migration tooling, Redis, object storage,
  CI/CD, environments; tenancy primitives; global conventions (soft delete, row_version, audit
  columns, RLS harness); error/request-id middleware; seed framework.
- **Dependencies:** stack decision (see Gaps §2.1).
- **DB:** `tenants, plans, tenant_subscriptions, branches, financial_years, sequence_counters,
  tenant_settings, files, audit_logs (+partitioning), usage_counters`.
- **API:** health, `/admin/tenants` provisioning (seed groups/permissions/sequences), file
  upload/signed URL, tenant resolution middleware.
- **Testing:** RLS isolation test suite (cross-tenant read/write must fail); migration
  up/down CI gate.
- **Migration:** none (greenfield).
- **Risks:** RLS + pooling misconfiguration → mitigated by the `SET LOCAL` transaction pattern
  and an automated isolation test on every table.

### Phase 2 — Authentication & RBAC

- **Objectives:** staff + customer login, OTP, refresh rotation, sessions/force-logoff,
  permission matrix, menu API.
- **DB:** `users, user_groups, user_group_members, user_branch_access, permission_modules
  (seed 169), group_permissions, sessions, login_logs, otp_challenges, password_reset_tokens`.
- **API:** `/auth/*`, `/me/*`, `/users`, `/groups`, `/groups/:id/permissions`,
  `/permission-modules`, `/sessions`.
- **Frontend hook-up:** login screen (new), header user menu, Logged-in Users, User Setup,
  Access Rights.
- **Testing:** 403 matrix tests per role; token replay/cross-tenant tests; lockout/OTP flows.
- **Risks:** permission slug ↔ route mapping drift → single source of truth: route annotations
  generated from `permission_modules` seed.

### Phase 3 — Master modules

- **Objectives:** all 30 master screens live end-to-end; lookup API; CSV import/export.
- **DB:** all §2.4–2.7 master tables (geo, catalog, parties, rating, tax).
- **API:** `/masters/*`, `/lookups/*`, `/serviceability`; master CSV import via `import_jobs`.
- **Order:** geo (zone/state/country/destination/pincode/area) → catalog (product/charges/
  exceptions/...) → parties (customer aggregate, vendor, consignee/shipper) → rating
  (customer-rates, vendor-contracts, fuel/tax, zone-mappings).
- **Testing:** contract tests per resource (CRUD+search+filters+soft-delete+audit);
  import golden files.
- **Migration:** optional legacy-data import path (the seeds mirror a legacy ERP — build the
  master CSV importers to double as migration tooling).
- **Risks:** customer aggregate complexity (wizard + 6 child collections) → model children as
  sub-resources, save-per-tab like the UI.

### Phase 4 — Transaction modules (operational core)

- **Objectives:** the scan chain end-to-end: pickup → pickup-inscan → AWB entry → bagging/
  manifest → inscan → DRS → POD/undelivered/missroute; tracking suite; finance vouchers.
- **DB:** `pickups, shipments (+pieces/charges/proformas), manifests (+bags/lines/inscans),
  drs (+lines), obc_entries, transfer_runs, scan_events, tracking_events, shipment_comments,
  shipment_holds, pod_records, receipts, expense_entries, debit/credit notes,
  customer_payments, ledger_entries`.
- **API:** all Part 3 §6 endpoints; rating pipeline v1 (booking-time charge computation);
  state-machine guards; document numbering.
- **Testing:** state-machine property tests (illegal transitions rejected), duplicate-scan
  idempotency tests, rating engine fixture suite (lane × weight × fuel × GST), concurrency
  tests on sequence allocation.
- **Migration:** cut-over playbook per tenant (masters first, open shipments imported with
  synthetic BOOKED events).
- **Risks:** rating correctness (highest business risk) → fixture-driven test pack signed off
  with real tariffs before go-live; charge snapshots make later fixes non-destructive.

### Phase 5 — Reports & dashboard

- **Objectives:** report registry (~74 definitions), filter-driven engine, details/summary,
  exports, async job queue, dashboard KPIs.
- **DB:** `report_definitions, report_jobs, daily_branch_stats, daily_customer_stats` (+refresh).
- **API:** Part 3 §7; printing/PDF service.
- **Testing:** per-report SQL snapshot tests against seeded fixtures; 31-day cap; permission gating.
- **Risks:** output columns are placeholders in the UI (Gap §2.2) → confirm column specs per
  report with business before building each; build the engine so columns are config, not code.

### Phase 6 — Utility & bulk tooling

- **Objectives:** Excel import suite (AWB/POD/forwarding merge, stock, other charges, data
  updation), rate/zone update jobs, tax/fuel/setup screens, notifications, serviceable pincode.
- **DB:** `import_jobs, import_row_errors, rate_update_jobs, email_configs, notifications,
  user_notifications, fuel_surcharge_rates, tax_rates` (if not earlier).
- **Testing:** import golden files incl. malformed rows; lock-skip behavior of rate updates.
- **Risks:** Excel template schemas undefined (Gap §2.2) — define with business, version the
  templates, serve from `/imports/templates/{type}`.

### Phase 7 — Integrations

- **Objectives:** carrier adapter framework + first 2–3 carriers, e-invoice (IRN), EDI CSB
  files, SMS/WhatsApp/email providers, outbound webhooks, public tracking API.
- **DB:** `integration_credentials, webhooks, webhook_deliveries, api_logs`.
- **Testing:** provider sandboxes, contract mocks, retry/DLQ chaos tests.
- **Risks:** IRP/e-invoice compliance changes → isolate behind adapter + manual-review queue.

### Phase 8 — Mobile & AI features

- **Objectives:** mobile API surface (13 permission modules: DRS, POD with photo/signature,
  scan & print, pickup return, PreDRS), push notifications; AI candidates (address/pincode
  cleanup, OCR on KYC/POD, ETA prediction, anomaly flags on billing) — scoped after core.
- **Risks:** offline-first scanning needs idempotent sync endpoints (already designed via
  Idempotency-Key).

### Phase 9 — Billing & subscription (platform monetization)

- **Objectives:** plan enforcement (limits/features live), payment gateway, invoicing the
  tenants, trial/dunning lifecycle, super-admin console.
- **DB:** finalize `plans, tenant_subscriptions, usage_counters` flows.
- **Risks:** metering accuracy → usage counters written transactionally with shipment creation.

### Phase 10 — Production hardening

- **Objectives:** load testing (scan endpoints, report engine), read replicas, partition
  automation, backup/restore drills, DR runbook, security pen-test, rate-limit tuning,
  observability SLOs, data-retention jobs, white-label domains.
- **Exit criteria:** p95 < 300ms on scan APIs at target load; restore drill < RTO; pen-test
  criticals closed; per-tenant isolation re-verified.

---

## 2. Open Gaps (explicit — do not assume)

### 2.1 Decisions required from you

1. **Backend stack/runtime — DECIDED (2026-07-14): Supabase (user-managed project).**
   The user will create their own Supabase project and supply the URL + keys via `.env`
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, server-only `SUPABASE_SERVICE_ROLE_KEY`).
   Implications for the blueprint:
   - Schema ships as Supabase SQL migrations; RLS design (Part 2) applies as written, keyed off
     Supabase Auth JWT claims (`tenant_id`, `user_id` in `app_metadata`) instead of `SET LOCAL`.
   - App-internal APIs implemented as TanStack Start `createServerFn` handlers (per
     `docs/PROJECT_RULES.md`), using the Supabase server client; public webhooks under
     `src/routes/api/public/*`.
   - Auth: Supabase Auth for credentials/OTP/sessions; the custom `sessions`/force-logoff and
     RBAC matrix remain application tables as designed.
   - Background jobs (reports, imports, rate recalc): pg-based queue (e.g. pgmq/pg_cron) or
     Supabase Edge Functions + scheduled triggers; revisit if job volume outgrows this.
   - File storage: Supabase Storage with tenant-prefixed buckets + signed URLs (Part 4 §5).
2. **Legacy data migration?** Seeds strongly mirror an existing ERP ("Courierwala"). If a legacy
   system must be migrated, Phase 3 importers double as migration tools — confirm scope.
3. **Invoicing module UX.** Permissions/reports imply full invoice generate/finalise/IRN
   lifecycle but there is no screen yet — backend is designed (Part 1 §2.9); frontend screen
   needs to be built.
4. **Payment gateway + SMS/WhatsApp/e-invoice providers** — vendor choices.

### 2.2 Information missing from the frontend (confirm with business)

- Report **output columns** are demo placeholders in all 5 hubs — need per-report column specs.
- **Excel import template schemas** — only download links exist; column definitions undefined.
- RTO flow beyond the `rto` flag/filter — no dedicated RTO screens; state machine includes it
  provisionally.
- COD handling — COD amount/report exist, but no COD reconciliation screen.
- "Job Queue" viewer page — linked but unbuilt.
- User Entry Log report reuses Add/Modify/Delete types instead of Login/Logout — confirm intent.
- Office/Department org level — requested in the brief, absent from UI; deferred behind
  `org_units` extension point.
- Super-admin/tenant-management/subscription UI — no frontend exists; designed backend-first.

### 2.3 Deliberate design positions (flagging, not assuming silently)

- Soft delete everywhere despite hard-delete UI; UI unchanged, semantics server-side.
- Single shared-schema Postgres with RLS (vs schema-per-tenant) — rationale in Part 2 §1.1.
- Charges/rates snapshotted onto documents; recalculation only via explicit rate-update jobs.
- Permissions resolved server-side per request (cached), not embedded in JWT.
