# PROJECT_STATUS.md

Living tracker of module implementation. Update this file whenever a module is completed.

Last updated: **2026-07-06**

---

## Completed modules ✅

Each of these has a real page, table, add/edit dialog with validation, CSV import/export, lookups where applicable, and follows the shared table kit.

### Master → Customer group
- **Customer** — `src/routes/master.customer.customer.tsx`
- **Consignee** — `src/routes/master.customer.consignee.tsx`
- **Shipper** — `src/routes/master.customer.shipper.tsx`
- **Customer Rate** — `src/routes/master.customer.customer-rate.tsx`
- **Expense** — `src/routes/master.customer.expense.tsx`

### Master → Vendor group
- **Vendor** — `src/routes/master.vendor.vendor.tsx` (2026-07-04)
- **Vendor Contract** — `src/routes/master.vendor.vendor-contract.tsx` (2026-07-04)

### Master → Operation group
- **Service Mapping** — `src/routes/master.operation.service-mapping.tsx` (2026-07-04)
- **Field Executive** — `src/routes/master.operation.field-executive.tsx` (2026-07-04)
- **Pin Code** — `src/routes/master.operation.pin-code.tsx` (2026-07-04)
- **Area** — `src/routes/master.operation.area.tsx` (2026-07-04)
- **Exception** — `src/routes/master.operation.exception.tsx` (2026-07-04)
- **Airline** — `src/routes/master.operation.airline.tsx` (2026-07-04)
- **Country Pincodes** — `src/routes/master.operation.country-pincodes.tsx` (2026-07-04)

### Transaction
- **Pick Up** — `src/routes/transaction.pickup.tsx` (2026-07-04)
- **Pickup Inscan** — `src/routes/transaction.pickup-inscan.tsx` (2026-07-04)
- **AWB Entry List** — `src/routes/transaction.awb-entry.tsx` (2026-07-04)
- **Manifest Scan** — `src/routes/transaction.manifest-scan.tsx` (2026-07-04)
- **Manifest In Scan** — `src/routes/transaction.manifest-in-scan.tsx` (2026-07-04)
- **Manifest View** — `src/routes/transaction.manifest-view.tsx` (2026-07-04)
- **DRS Scan** — `src/routes/transaction.drs-scan.tsx` (2026-07-05)
- **Expense Authorize** — `src/routes/transaction.receipt.expense-authorize.tsx` (2026-07-05)
- **Receipt Entry** — `src/routes/transaction.receipt.receipt-entry.tsx` (2026-07-05)
- **Expense Entry** — `src/routes/transaction.receipt.expense-entry.tsx` (2026-07-06)
- **Debit Note** — `src/routes/transaction.receipt.debit-note.tsx` (2026-07-06)
- **Credit Note** — `src/routes/transaction.receipt.credit-note.tsx` (2026-07-06)
- **Customer Payment** — `src/routes/transaction.receipt.customer-payment.tsx` (2026-07-06)
- **POD Excel View** — `src/routes/transaction.bulk-import.pod-to-excel.tsx` (2026-07-06)
- **Vendor Rate Compare** — `src/routes/transaction.rate-compare.vendor-rate-compare.tsx` (2026-07-06)
- **Customer Rate Compare** — `src/routes/transaction.rate-compare.customer-rate-compare.tsx` (2026-07-06)

### Reports
- **Operations** — `src/routes/reports.operations.tsx` (2026-07-06)
- **Statements** — `src/routes/reports.statements.tsx` (2026-07-06)

### Shell / global
- Sidebar navigation (`app-sidebar.tsx` + `lib/navigation.ts`)
- App header (`app-header.tsx`) — branch selector, theme toggle
- Dashboard shell — `src/routes/dashboard.tsx`
- Splat placeholders for un-built pages (`master.$.tsx`, `transaction.$.tsx`, `reports.$.tsx`)
- Design system (`src/styles.css`) + shadcn primitive set
- Shared toolkit (`master-table-kit.tsx`, `master-lookup-dialog.tsx`, `master-lookups.ts`)

---

## In progress 🚧

_None._

---

## Pending — Master modules

Route files exist as splat placeholders. Each needs a real implementation following the Customer/Consignee template.

### Sales group (`/master/sales/*`)
- Product
- Product Master
- Zone
- Country
- Destination
- Service Center
- State
- Sales Executive
- Industry
- Flight
- Product Type
- Content
- Instruction
- Local Branch
- Charges Master
- Bank Master

> Note: route files already exist for these under `src/routes/master.sales.*.tsx`. Verify each before starting; some may still be scaffolds.

### Vendor group (`/master/vendor/*`)
_None — vendor group complete._

### Operation group (`/master/operation/*`)
_None — operation group complete._

---

## Pending — Transaction modules (`/transaction/*`)

- Un-Delivery Scan
- Bagging
- Transfer Run
- Miss Route Scan
- **Out Scan:** OBC Entry
- **Tracking / Delivery:** AWB Query, Forwarding Updation, Progress / Comment, KYC Tracking, Update Entry
- **Receipt / Expenses:** _complete_
- **Bulk Import:** _complete_
_None — rate compare group complete._

---

## Pending — Reports (`/reports/*`)

- AWB
- Scan
- AR Report

---

## Future modules (not yet scoped)

- Lovable Cloud backend wiring (Supabase) — auth, RLS, database schema per module.
- Role-based permissions (see PROJECT_RULES §22 once added).
- Notifications / email / SMS integration.
- Audit log viewer.
- Public tracking page (customer-facing AWB tracker).
- Bulk import validators (Excel/CSV) with error reporting UI.
- Print templates (AWB label, DRS sheet, manifest).

---

## Definition of Done for a module

A module moves from **Pending** → **Completed** only when:

1. Route file exists and matches sidebar slug.
2. Table renders with global search + column filters + `TablePager` + empty state.
3. Add/Edit dialog with `FieldWrapper` + validation + lookups via `MasterLookupDialog`.
4. Delete via `AlertDialog`.
5. CSV Import + Export using `downloadCsv`.
6. All colors/typography/spacing come from tokens — no hardcoded values.
7. Follows `MODULE_TEMPLATE.md`.
8. This file updated: move the module from Pending to Completed with a timestamp.
