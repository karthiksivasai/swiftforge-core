# Phase 4 — Transaction Modules — Setup & Reference

Phase 4 delivers the operational core: pickup → inscan → AWB entry → manifest
chain → DRS → POD/undelivered/RTO, tracking, and finance vouchers. It is
implemented in fixed milestones; this document grows one section per milestone.

Architecture is unchanged from Phase 1–3: Supabase Postgres, RLS on every
tenant-owned table, `SECURITY DEFINER` helper functions in the `app` schema,
DB-side permission resolution (`app.user_has_permission`), append-only event
tables for scans/tracking, and the append-only `audit_logs` trail for mutable
documents.

---

## Milestone 1 — Shared Transaction Framework (`0030_transaction_core.sql`)

Adds no business tables. Installs the primitives all transaction modules reuse.

### What it provides

| Object | Purpose |
| --- | --- |
| `app.status_transitions` | Seeded registry of allowed workflow edges for `SHIPMENT`, `PICKUP`, `MANIFEST`, and `DRS` (blueprint Part 4 §1.1–1.4). |
| `app.status_transition_allowed(kind, from, to)` | Returns `true` when the edge exists. |
| `app.assert_status_transition(kind, from, to)` | Guard for RPCs: no-op when `from = to`; raises SQLSTATE `CMS02` on illegal moves. |
| `app.format_document_no(prefix, seq, suffix, pad)` | Renders `prefix` + zero-padded sequence + `suffix`. |
| `app.allocate_document_no(tenant, doc_type, branch?, fin_year?, pad?)` | Gapless allocation from `sequence_counters` (`SELECT … FOR UPDATE`, bump `next_no`). Raises `CMS03` when no counter row exists. |
| `app.attach_append_only_guard(table)` | Hard `BEFORE UPDATE OR DELETE` guard on event tables (uses `app.tg_block_mutations`). |
| `app.attach_transaction_triggers(table, slug)` | Touch + audit on mutable transaction documents (delegates to `app.attach_master_triggers`). |
| `app.attach_transaction_policies(table, slug)` | Standard tenant SELECT + permission-gated INSERT/UPDATE/DELETE RLS. |
| `app.attach_event_policies(table, slug)` | SELECT + INSERT only RLS for append-only event tables. |

### Document numbering

`sequence_counters` (Phase 1, `0003`) is the source of truth. Bootstrap
(`0013`) seeds one row per doc type per tenant. Allocation:

```sql
select * from app.allocate_document_no(
  p_tenant_id   => v_tenant,
  p_doc_type    => 'AWB',
  p_branch_id   => v_branch_id,   -- optional; NULL matches tenant-wide row
  p_fin_year_id => v_fy_id        -- optional
);
-- returns counter_id, sequence_no, formatted_no
```

Call inside the same transaction as the document insert so the number is never
orphaned on rollback.

### State machines

Shipment, pickup, manifest, and DRS transitions are seeded in
`app.status_transitions`. Later RPCs (pickup save, manifest dispatch, DRS
close, scan handlers) call `app.assert_status_transition` before updating
`current_status` / document `status`.

Terminal shipment states (`DELIVERED`, `RTO_DELIVERED`, `VOID`) have no
outgoing edges in the registry. Re-open / override paths are permission-gated
and added via migration when implemented.

### How later transaction modules use it

**Mutable document** (pickup, shipment, manifest, DRS, receipt, …):

```sql
-- 1. create table public.<name> ( id uuid ..., tenant_id uuid not null ..., row_version int ... );
-- 2. select app.attach_transaction_triggers('<name>', '<permission-slug>');
-- 3. select app.attach_transaction_policies('<name>', '<permission-slug>');
-- 4. In save RPC: app.assert_status_transition(...); app.allocate_document_no(...) when creating.
```

**Append-only event** (scan_events, tracking_events, ledger_entries, …):

```sql
-- 1. create table public.<name> ( id uuid ..., tenant_id uuid not null ..., created_at ... );
-- 2. select app.attach_append_only_guard('<name>');
-- 3. select app.attach_event_policies('<name>', '<permission-slug>');
-- 4. INSERT only from SECURITY DEFINER RPCs; never UPDATE/DELETE.
```

### Verification

`supabase/tests/transaction_core_verification.sql` (wired into
`supabase/tests/run_local_rls_check.sh`) proves, in a rolled-back transaction:

- All helpers exist; shipment transition registry behaves correctly.
- `assert_status_transition` raises `CMS02` on illegal moves.
- `allocate_document_no` returns gapless sequential numbers.
- `attach_transaction_triggers` / `attach_transaction_policies` install on a probe table.
- `attach_append_only_guard` blocks UPDATE/DELETE on an event probe.

Run locally:

```bash
bash supabase/tests/run_local_rls_check.sh
```

### Deploy

Apply `0030_transaction_core.sql` with your normal migration flow (Supabase CLI
`supabase db push`, or paste into the SQL editor). It is idempotent.

---

## Milestone 2 — Pickup Document (`0031_pickup.sql`)

First transactional document on the Phase 4 framework.

### Database

| Object | Purpose |
| --- | --- |
| `public.pickups` | Pickup bookings: gapless `pickup_no`, party/geo FKs, `status` machine (`OPEN`→`ASSIGNED`→`PICKED`→`CONFIRMED` / `CANCELLED`) |
| `public.save_pickup(id, row_version, fields)` | Create/update; allocates `PICKUP` sequence; OPEN→ASSIGNED when FE set |
| `public.cancel_pickup(id, row_version, reason?)` | Status → `CANCELLED` (`txn.pickup-cancel` or `txn.pickup` modify) |
| `public.confirm_pickup(id, row_version)` | `PICKED` → `CONFIRMED` only |
| `public.transfer_pickups(date, from_fe, to_fe, …)` | Bulk FE reassignment for a date |
| `app.resolve_tenant_row_id` | Resolve master FK by id or code |
| `lookup('sales-executive')` | New autocomplete key for the Pickup screen |

Triggers/RLS via `app.attach_transaction_triggers/policies('pickups', 'txn.pickup')`.

### Frontend

- `src/lib/transactions/schemas/pickups.ts` — Zod payload for `save_pickup`
- `src/lib/transactions/resources/pickups.ts` — list / save / cancel / transfer / soft-delete
- `src/lib/transactions/pickupUiMap.ts` — UI ↔ DB mapping
- `transaction.pickup.tsx` — live/demo dual mode (list, save, cancel/delete, FE transfer)

Generate Pickup Sheet remains client-side toast (PDF job deferred).

### Verification

`supabase/tests/pickup_verification.sql` — numbering, status transitions, transfer, cancel, confirm guard, sales-executive lookup.

```bash
bash supabase/tests/run_local_rls_check.sh
```

### Deploy

Apply `0031_pickup.sql` after `0030_transaction_core.sql`.

---

## Milestone 3A — Shipment (AWB) Aggregate Foundation (`0032_shipment_foundation.sql`)

Shipment aggregate root only. No manifest, DRS, tracking, rating, or finance.

### Tables

| Table | Role |
| --- | --- |
| `shipments` | Aggregate root; AWB from `allocate_document_no`; status `DRAFT`/`BOOKED`/`CANCELLED` (+ future statuses in CHECK) |
| `shipment_pieces` | Child collection (replace sync) |
| `shipment_charge_snapshots` | UI-supplied charge lines only (no rating engine) |
| `shipment_comments` | Comment collection |
| `shipment_attachments` | Links to `public.files` (tenant storage) |
| `shipment_events` | Append-only mutation log |

### Status lifecycle (foundation)

```
DRAFT → BOOKED → CANCELLED
DRAFT → CANCELLED
```

All transitions go through `app.assert_status_transition('SHIPMENT', ...)`. Edges seeded in 0032; later operational edges from 0030 remain for future milestones.

### RPCs

| RPC | Behaviour |
| --- | --- |
| `save_shipment(id, row_version, fields, pieces, charges, comments, attachments)` | Create DRAFT with allocated AWB; update DRAFT only; child replace sync; append event; audit |
| `confirm_booking(id, row_version)` | DRAFT → BOOKED (enhanced in 0033) |
| `cancel_shipment(id, row_version, reason?)` | DRAFT\|BOOKED → CANCELLED (`txn.awb-entry-void-cancel`) |

AWB numbers come only from `app.allocate_document_no(..., 'AWB', ...)`.

Optional `pickup_id` is tenant-validated; pickup row is not mutated.

### Frontend

- `src/lib/transactions/schemas/shipments.ts`
- `src/lib/transactions/resources/shipments.ts`
- `src/lib/transactions/shipmentUiMap.ts`
- `transaction.awb-entry.tsx` — live/demo dual mode (list/save/cancel); UI preserved

### Verification

`supabase/tests/shipment_foundation_verification.sql` — structure, AWB gapless numbering, child sync, optlock, confirm, cancel, append-only events.

```bash
bash supabase/tests/run_local_rls_check.sh
```

### Deploy

Apply `0032_shipment_foundation.sql` after `0031_pickup.sql`.

---

## Milestone 3B — Shipment Booking Completion (`0033_shipment_booking.sql`)

Completes the **booking workflow only** on top of 0032. No manifest, bagging, inscan, DRS, POD, tracking, finance, rating, or carrier APIs.

### Booking lifecycle

```
DRAFT → BOOKED → CANCELLED
DRAFT → CANCELLED
```

Rules:

- Only `DRAFT` can be edited (`save_shipment` asserts status machine).
- `BOOKED` / `CANCELLED` are immutable for field edits.
- Every transition uses `app.assert_status_transition('SHIPMENT', ...)`.

### Booking validation

`app.validate_shipment_for_booking(shipment)` returns a jsonb array of `{field, message}`. Empty array = valid.

Checks:

- Customer / origin / destination / product exist in-tenant
- Book date present; pieces ≥ 1
- At least one `shipment_pieces` row
- If `pickup_id` set: same tenant; pickup status in `ASSIGNED` | `PICKED` | `CONFIRMED`

UI pre-check RPC: `public.validate_shipment_booking(id)` → `{ ok, errors, status, awb_no }`.

`confirm_booking` raises `CMS04` with the errors JSON when validation fails.

### `confirm_booking(id, row_version)`

Single transaction:

1. Permission: `txn.awb-entry` modify
2. Assert `DRAFT → BOOKED`
3. Validate shipment + children
4. Allocate AWB via `allocate_document_no` if `awb_no` empty
5. Optimistic lock (`40001` on stale `row_version`)
6. Set `BOOKED`, `booked_at` / `booked_by`
7. **Pickup linkage** (if `pickup_id`): `ASSIGNED → PICKED` via pickup status machine; set `pickups.awb_id` / `awb_no`
8. Append one `BOOKED` event; audit `MODIFY`

### Frontend (AWB Entry)

Preserved layout. Added:

- **Book** / **Cancel Shipment** / **Close** footer actions
- Status badge (form + list)
- Read-only mode for non-`DRAFT`
- Validation messages for booking failures
- Live authenticated + demo fallback

### Verification

`supabase/tests/shipment_booking_verification.sql` — invalid rejection, booking transition, pickup linkage, optlock, append-only events, audit, permission enforcement, immutable BOOKED.

```bash
bash supabase/tests/run_local_rls_check.sh
```

### Deploy

Apply `0033_shipment_booking.sql` after `0032_shipment_foundation.sql`.

---

## Milestone 4A — Manifest Aggregate Foundation (`0034_manifest_foundation.sql`)

Manifest aggregate root only. No inscan, DRS, POD, tracking, finance, rating, or carrier APIs. No bagging child table in this milestone (bag_no is a line snapshot field).

### Tables

| Table | Role |
| --- | --- |
| `manifests` | Aggregate root; number from `allocate_document_no(..., 'MANIFEST', ...)`; status `DRAFT`/`CLOSED`/`CANCELLED` |
| `manifest_lines` | Child collection (replace sync); one BOOKED shipment per line + list snapshots |
| `manifest_comments` | Comment collection |
| `manifest_attachments` | Links to `public.files` |
| `manifest_events` | Append-only mutation log |

### Status lifecycle

```
DRAFT → CLOSED → CANCELLED
DRAFT → CANCELLED
```

All transitions use `app.assert_status_transition('MANIFEST', ...)`.

Also seeded: `SHIPMENT BOOKED → MANIFESTED` (on close) and `MANIFESTED → BOOKED` (unmanifest on cancel of a CLOSED manifest).

### Shipment assignment rules

Only **BOOKED** shipments may be added to a DRAFT manifest.

Rejected:

- DRAFT / CANCELLED / VOID / other statuses
- Shipments already on another non-cancelled manifest

### RPCs

| RPC | Behaviour |
| --- | --- |
| `save_manifest(id, row_version, fields, lines, comments, attachments)` | Create DRAFT with allocated number; update DRAFT only; sync children; event + audit |
| `close_manifest(id, row_version)` | DRAFT → CLOSED; each line shipment BOOKED → MANIFESTED (+ shipment event) |
| `cancel_manifest(id, row_version, reason?)` | DRAFT\|CLOSED → CANCELLED; unmanifest lines if previously CLOSED |

Permission slug: `txn.manifest-scan`.

### Frontend

- `src/lib/transactions/schemas/manifests.ts`
- `src/lib/transactions/resources/manifests.ts`
- `src/lib/transactions/manifestUiMap.ts`
- `transaction.manifest-scan.tsx` — live/demo dual mode; UI preserved; Save / Close Manifest / Cancel

### Verification

`supabase/tests/manifest_foundation_verification.sql` — structure, numbering, eligibility, sync, optlock, close→MANIFESTED, cancel, append-only events, audit, permissions.

```bash
bash supabase/tests/run_local_rls_check.sh
```

### Deploy

Apply `0034_manifest_foundation.sql` after `0033_shipment_booking.sql`.

---

## Milestone 4B — Manifest Inscan (`0035_manifest_inscan.sql`)

Append-only **scan event framework** + Manifest Inscan RPC only. No bagging, DRS, POD, tracking timeline, finance, rating, or carrier APIs.

### Event tables (INSERT only)

| Table | Role |
| --- | --- |
| `manifest_scan_events` | Append-only inscan events per manifest line (unique per manifest+shipment) |
| `shipment_scan_events` | Append-only shipment scan trail (`MANIFEST_INSCAN`); reusable by later milestones |

Guards: `app.attach_append_only_guard` + `app.attach_event_policies(..., 'txn.manifest-in-scan')`.

### Status flow

```
SHIPMENT: MANIFESTED → MANIFEST_INSCANNED
```

Enforced via `app.assert_status_transition`. Shipment CHECK updated to allow `MANIFEST_INSCANNED`.

### RPCs

| RPC | Behaviour |
| --- | --- |
| `scan_manifest(manifest_id, awb_no?, shipment_id?, bag_no?, mode?)` | CLOSED manifest only; shipment on lines; MANIFESTED → MANIFEST_INSCANNED; duplicate-safe friendly JSON; writes both scan event tables + shipment/manifest events + audit |
| `get_manifest_inscan_board(manifest_id)` | Lines with scanned/pending counters |

### Lookup

`public.lookup` extended with key **`manifest`**: CLOSED, current tenant, non-deleted only. Prior keys unchanged.

### Duplicate protection

Repeated scans return `{ ok: true, duplicate: true, ... }` without inserting extra events or changing status.

### Frontend

- `src/lib/transactions/schemas/manifestInscan.ts`
- `src/lib/transactions/resources/manifestInscan.ts`
- `src/lib/transactions/manifestInscanUiMap.ts`
- `transaction.manifest-in-scan.tsx` — live/demo dual mode; AWB/barcode Enter-to-save; manual pending selection; scanned/pending counters; duplicate/invalid toasts

Permission slug: `txn.manifest-in-scan`.

### Verification

`supabase/tests/manifest_inscan_verification.sql` — structure, happy path, duplicates, append-only, draft/wrong AWB rejects, board counts, lookup, tenant isolation.

```bash
bash supabase/tests/run_local_rls_check.sh
```

### Deploy

Apply `0035_manifest_inscan.sql` after `0034_manifest_foundation.sql`.

---

## Milestone 4C — DRS Foundation (`0036_drs_foundation.sql`)

Delivery Run Sheet aggregate + assignment workflow only. No POD, driver mobile, tracking, finance, rating, or carrier APIs.

### Tables

| Table | Role |
| --- | --- |
| `drs` | Aggregate root; number from `allocate_document_no(..., 'DRS', ...)`; status `DRAFT`/`DISPATCHED`/`COMPLETED`/`CANCELLED` |
| `drs_lines` | Child collection (replace sync); one `MANIFEST_INSCANNED` shipment per line |
| `drs_events` | Append-only mutation log |

### Status lifecycle

```
DRS: DRAFT → DISPATCHED → COMPLETED
     DRAFT → CANCELLED
```

All transitions use `app.assert_status_transition('DRS', ...)`.

On dispatch, each line shipment: `MANIFEST_INSCANNED → OUT_FOR_DELIVERY` (+ shipment event).

### Assignment rules

Only **MANIFEST_INSCANNED** shipments may be added to a DRAFT DRS.

Rejected:

- Cancelled / VOID / wrong status
- Duplicate on same DRS
- Already on another active DRS (`DRAFT` or `DISPATCHED`)

### RPCs

| RPC | Behaviour |
| --- | --- |
| `save_drs(id, row_version, fields, lines)` | Create DRAFT with allocated number; update DRAFT only; sync lines; event + audit |
| `dispatch_drs(id, row_version)` | DRAFT → DISPATCHED; requires FE + ≥1 line; ship → OUT_FOR_DELIVERY |
| `cancel_drs(id, row_version, reason?)` | DRAFT only → CANCELLED; clears lines (unassign) |

Permission slug: `txn.drs-scan`.

### Lookup

`public.lookup` extended with key **`drs`** (DRAFT/DISPATCHED, tenant-scoped). `field-executive` already existed and remains.

### Frontend

- `src/lib/transactions/schemas/drs.ts`
- `src/lib/transactions/resources/drs.ts`
- `src/lib/transactions/drsUiMap.ts`
- `transaction.drs-scan.tsx` — live/demo dual mode; Save / Dispatch / Cancel; status badge (route is DRS Scan; no separate delivery-run-sheet file)

### Verification

`supabase/tests/drs_foundation_verification.sql` — structure, numbering, eligibility, optlock, dispatch, cancel, append-only, lookup, tenant isolation.

```bash
bash supabase/tests/run_local_rls_check.sh
```

### Deploy

Apply `0036_drs_foundation.sql` after `0035_manifest_inscan.sql`.

---

## Milestone 4D — DRS Completion (`0037_drs_completion.sql`)

Driver delivery workflow only. No POD capture, signature, photo, GPS, customer tracking, finance, or rating.

### Blueprint alignment

| Blueprint | This milestone |
| --- | --- |
| DRS `OPEN → DISPATCHED → CLOSED` | `DRAFT → DISPATCHED → COMPLETED` (4C naming; COMPLETED = CLOSED) |
| `drs_lines.outcome (DELIVERED\|UNDELIVERED)` | Added on lines + `outcome_at` / `attempt_count` |
| `OUT_FOR_DELIVERY → DELIVERED` (via POD) | Pre-POD: `→ DELIVERED_PENDING_POD` (POD finalizes in 4E) |
| `OUT_FOR_DELIVERY → UNDELIVERED` | Supported (also via `DELIVERY_ATTEMPTED → UNDELIVERED`) |

### RPCs

| RPC | Behaviour |
| --- | --- |
| `mark_shipment_delivery_attempt(drs_id, shipment_id?, awb_no?, outcome, remark?)` | DISPATCHED only; OFD → ATTEMPTED / UNDELIVERED / DELIVERED_PENDING_POD; duplicate-safe CMS04; shipment + DRS events + line outcome |
| `complete_drs(id, row_version)` | DISPATCHED → COMPLETED when every line has DELIVERED or UNDELIVERED outcome |
| `reopen_drs(id, row_version, reason?)` | COMPLETED → DISPATCHED |
| `get_drs_completion_board(drs_id)` | Counters: total / pending / delivered / undelivered / attempted |

### Frontend

Extended `transaction.drs-scan.tsx`: Mark Delivered / Undelivered / Attempt, Complete, Reopen, status badges, counters. Live/demo dual mode preserved.

### Verification

`supabase/tests/drs_completion_verification.sql`

```bash
bash supabase/tests/run_local_rls_check.sh
```

### Deploy

Apply `0037_drs_completion.sql` after `0036_drs_foundation.sql`.

---

## Milestone 4E — POD Foundation (`0038_pod_foundation.sql`)

Proof of Delivery capture that completes the DRS workflow. No file upload/storage
integration, GPS, mobile capture, Tracking UI (4F), bagging, finance, or rating.

### Blueprint alignment

| Blueprint | This milestone |
| --- | --- |
| `pod_records` (§2.8) | `shipment_id`, `pod_date`, `receiver_name`, `remark`, `status`, `signature_file_id`, `photo_file_id`, `source` (IDs only) |
| Shipment POD denorm | `receiver`, `delivered_at`, `pod_date`, `pod_status`, `pod_receiver`, `pod_remark`, `pod_user_id` |
| `tracking_events` | Minimal append-only table + `app.append_tracking_event` (Tracking UI deferred) |
| `DELIVERED_PENDING_POD → DELIVERED` | Via `save_pod` + `assert_status_transition` |
| `DELIVERED → DELIVERED_PENDING_POD` | Via `cancel_pod` (history retained) |

### RPCs

| RPC | Behaviour |
| --- | --- |
| `save_pod(shipment_id?, awb_no?, fields)` | Requires `DELIVERED_PENDING_POD`; creates POD; → `DELIVERED`; shipment + tracking events + audit |
| `update_pod(id, row_version, fields)` | Edit while shipment remains `DELIVERED`; optimistic lock |
| `cancel_pod(id, row_version, reason?)` | `DELIVERED` → `DELIVERED_PENDING_POD`; POD status → `PENDING`; never deletes history |
| `get_pod_by_awb(awb_no)` | Lookup for the existing POD Excel View screen |

### Frontend

Wired `transaction.bulk-import.pod-to-excel.tsx` (existing POD screen): live/demo dual
mode; receiver / POD date / remarks; Delivered status badge; Save / Update / Cancel POD.
Signature, photo, GPS, and Excel bulk import remain placeholders.

Permission slug: `txn.pod-entry-ok-update`.

### Verification

`supabase/tests/pod_foundation_verification.sql` — valid delivery, duplicate rejection,
invalid status, cancel, optimistic locking, append-only events, state transitions, audit.

```bash
bash supabase/tests/run_local_rls_check.sh
```

### Deploy

Apply `0038_pod_foundation.sql` after `0037_drs_completion.sql`.

---

## Milestone 4F — Tracking Foundation (`0039_tracking_foundation.sql`)

Internal shipment timeline and tracking operations only. No carrier APIs, public
tracking enhancements, finance, rating, reports, notifications, or entry-lock.

### Blueprint alignment

| Blueprint | This milestone |
| --- | --- |
| `tracking_events` (§2.8) | Reused (extended `append_tracking_event` for exception/date/time) |
| `shipment_events` | Reused append-only operational log |
| `shipment_comments` | Reused; append via `add_tracking_comment` (file_id only) |
| `shipment_holds` | Created: `action (HOLD\|RELEASE)`, remark, shipper_email, mail_sent |
| `GET /tracking/awb/:awbNo` | `get_shipment_tracking(awb_no)` — shipment 360 |
| `POST /tracking/progress` | `add_tracking_progress` + optional `assert_status_transition` |
| `POST /tracking/comments` | `add_tracking_comment` |
| `POST /tracking/hold` | `hold_shipment` / `release_shipment_hold` |

### RPCs

| RPC | Behaviour |
| --- | --- |
| `get_shipment_tracking(awb_no)` | Summary, status, tracking/shipment events, POD, comments, holds |
| `add_tracking_progress(awb_no, fields)` | Append progress; reject illegal transitions; `allow_if_delivered` gate |
| `add_tracking_comment(awb_no, fields)` | Append-only comment (+ optional file_id) |
| `hold_shipment(awb_no, row_version, fields)` | `is_hold=true`; append HOLD history; optimistic lock |
| `release_shipment_hold(awb_no, row_version, fields)` | Restore operational flag; append RELEASE; never delete history |

### Frontend

- `transaction.tracking.awb-query.tsx` — live timeline / summary / history
- `transaction.tracking.progress-comment.tsx` — progress + comments
- `transaction.tracking.update-entry.tsx` — hold / release (entry-lock placeholder)

Demo seed behaviour preserved when signed out.

Permissions: `txn.awb-query`, `txn.progress-comments-update`, `txn.awb-hold-unhold`.

### Verification

`supabase/tests/tracking_foundation_verification.sql` — timeline, progress, comment,
hold/release, append-only, optimistic locking, permissions, audit.

```bash
bash supabase/tests/run_local_rls_check.sh
```

### Deploy

Apply `0039_tracking_foundation.sql` after `0038_pod_foundation.sql`.

---

## Milestone 4G — Finance Foundation (`0040_finance_foundation.sql`)

Financial transaction framework only. No rating engine, invoice generation, GST,
IRN, reports, payment gateway, carrier APIs, debit/credit notes, or background jobs.

### Blueprint alignment

| Blueprint | This milestone |
| --- | --- |
| `receipts` (§2.9) | Created: DRAFT→POSTED (+ ADJUSTED/CANCELLED reserved) |
| `expense_entries` | Created: UNAUTHORIZED→AUTHORIZED\|REJECTED; maker ≠ checker |
| `customer_payments` | Created: PENDING→APPROVED\|REJECTED |
| `ledger_entries` | Append-only AR foundation (RECEIPT / EXPENSE / CUSTOMER_PAYMENT) |
| `expense_heads` | Minimal FK master for expense entries |
| Receipt save/post | `save_receipt` / `post_receipt` (+ ledger credit) |
| Expense save/auth | `save_expense` / `authorize_expense` / `reject_expense` |
| Customer payment | `save_customer_payment` / `approve_customer_payment` / `reject_customer_payment` |

### RPCs

| RPC | Behaviour |
| --- | --- |
| `save_receipt(id?, row_version?, fields)` | Create or update DRAFT only; document numbering |
| `post_receipt(id, row_version)` | DRAFT→POSTED; append ledger CREDIT; audit |
| `save_expense(id?, row_version?, fields)` | Create or update while UNAUTHORIZED |
| `authorize_expense(id, row_version)` | Maker ≠ checker; AUTHORIZED + ledger + audit |
| `reject_expense(id, row_version, reason?)` | UNAUTHORIZED→REJECTED; audit |
| `save_customer_payment(...)` | Create/update while PENDING |
| `approve_customer_payment(...)` | PENDING→APPROVED; ledger CREDIT; audit |
| `reject_customer_payment(...)` | PENDING→REJECTED; audit |

### Frontend

- `transaction.receipt.receipt-entry.tsx` — create / save / post
- `transaction.receipt.expense-entry.tsx` — save
- `transaction.receipt.expense-authorize.tsx` — authorize / reject
- `transaction.receipt.customer-payment.tsx` — save / approve / reject

Demo seed behaviour preserved when signed out.

Permissions: `txn.receipt-entry`, `txn.expense-entry`, `txn.expense-authorize`,
`txn.customer-pay`.

### Verification

`supabase/tests/finance_foundation_verification.sql` — receipt posting, ledger,
maker/checker, authorization, payment approval, optimistic locking, audit, RLS,
permissions.

```bash
bash supabase/tests/run_local_rls_check.sh
```

### Deploy

Apply `0040_finance_foundation.sql` after `0039_tracking_foundation.sql`.

---

## Milestone 4H — Rating Engine Foundation (`0041_rating_engine.sql`)

**Final Phase 4 milestone.** Booking-time charge computation only. No invoices, GST
filing, IRN, reports, carrier APIs, background jobs, or subscription billing.

### Blueprint alignment

| Blueprint | This milestone |
| --- | --- |
| Pipeline §1.6 (frozen order) | lane → customer rate → charges → fuel → tax → vendor → snapshot |
| `customer_rates` / `zone_mappings` / `fuel_surcharge_rates` / `tax_rates` | Created (Phase 3 gaps) — not duplicated |
| `charge_definitions` | View over existing `charges` |
| `vendor_contracts` / slabs | Reused |
| `customer_other_charges` / `customer_fuel_surcharges` | Reused |
| `shipment_charge_snapshots` | Reused; SYSTEM lines from rating |
| `rating_audit` | Append-only calculation trees |
| Booking | `confirm_booking` invokes server rating (client totals ignored) |

### RPCs

| RPC | Behaviour |
| --- | --- |
| `calculate_shipment_rating(shipment_id)` | Full pipeline + persist snapshot + audit |
| `recalculate_shipment_rating(id, row_version)` | Rejects locked / invoiced; optimistic lock |
| `get_rating_breakdown(shipment_id)` | Calculation tree + snapshots for UI |

### Frontend

- `transaction.awb-entry.tsx` — displays freight / fuel / tax / other / total from
  server snapshot; Calculate / Recalculate buttons; no client-side rating math for
  live mode totals when a rating summary is present.

Permission: `txn.awb-entry` (reuse).

### Verification

`supabase/tests/rating_engine_verification.sql` — lane, customer rate, charges,
fuel, tax, vendor cost, snapshot, immutability, recalc guards, booking hook,
optimistic locking, RLS, permissions.

### Deploy

Apply `0041_rating_engine.sql` after `0040_finance_foundation.sql`.

---

## Phase 4 — COMPLETE

| Milestone | Scope |
| --- | --- |
| **1 — Transaction foundation** | ✅ status machine, document nos, attach helpers |
| **2 — Pickup** | ✅ |
| **3A — Shipment foundation** | ✅ |
| **3B — Booking completion** | ✅ |
| **4A — Manifest foundation** | ✅ |
| **4B — Inscan** | ✅ |
| **4C — DRS foundation** | ✅ |
| **4D — DRS completion** | ✅ |
| **4E — POD foundation** | ✅ |
| **4F — Tracking foundation** | ✅ |
| **4G — Finance foundation** | ✅ |
| **4H — Rating engine** | ✅ booking-time charge computation |

### Phase 4 completion summary

Phase 4 delivered the operational transaction core end-to-end:

- Pickup → AWB booking → Manifest → Inscan → DRS → POD → Tracking
- Finance vouchers (receipts, expenses, customer payments, ledger foundation)
- Server-authoritative rating at booking with immutable charge snapshots

Frozen contracts: RLS, permissions, audit, optimistic locking, document numbering,
append-only events, aggregate save pattern.

**Out of scope (later phases):** reports/dashboards (Phase 5), carrier APIs,
background jobs, invoices/IRN/GST filing, debit/credit notes, bagging, payment
gateway, subscription billing.

**Stop condition:** Phase 4 is complete. Do not begin Phase 5 (Reports), report
registry, report jobs, or dashboards without approval.
