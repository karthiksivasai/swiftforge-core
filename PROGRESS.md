# SwiftForge Core — Project Progress Tracker

> **Session Maintenance Protocol:**
> 1. **Session Start:** Read this file (`PROGRESS.md`) first before doing anything else to reload context.
> 2. **Session End / Task Completion:** Update this file:
>    - Move finished items to **Completed** with today's date (`YYYY-MM-DD`).
>    - Update **Current Status** and **In Progress** (include exact file paths, function names, line numbers).
>    - Add a dated entry at the top of the **Changelog**.
>    - Keep it concise, actionable, and free of stale notes.

---

## 1. Project Overview
SwiftForge (`swiftforge-core`) is a multi-tenant enterprise Courier Management System (Courier ERP) faithful to the CourierWala/Xpresion operational workflow. It is built with React 19, TanStack Start/Router, and Supabase Postgres using Row Level Security (RLS) and `SECURITY DEFINER` RPCs.

---

## 2. Current Status
- **DTDC Live Booking (Production-Ready for MEL & NZ):** 100% spec-compliant and cleaned up for dry-run pre-live review. Configurable weight measurement constant (`POSTSHIPPING_WEIGHT_MEASUREMENT = "Kgs"`), real shipment KYC extraction (no invented values), and real `ReasonExport`/`Incoterms` mapped from proforma data.
- **Immediate Next Focus:**
  1. Share the regenerated masked cURL with DTDC for review before setting `is_live_mode = true`.
  2. Apply migrations `0105` & `0106` on remote/staging Supabase instance.
  3. Validate and complete the **Manifest** module (`transaction.manifest-scan.tsx`, `transaction.manifest-in-scan.tsx`, `transaction.manifest-view.tsx`) against live Xpresion workflows.

---

## 3. Completed

### Core Transactions & Operations
- [x] **DTDC / PostShipping Payload Cleanups & Spec Compliance:**
  - [x] Configurable single constant `POSTSHIPPING_WEIGHT_MEASUREMENT = "Kgs"` across mapper and edge function — *2026-08-11*
  - [x] Real KYC extraction (`SenderKycType`, `SenderKycNumber`) from shipment docs, zero invented values — *2026-08-11*
  - [x] Real `ReasonExport` & `Incoterms` / `ShipmentTerm` mapped from shipment / proforma tab — *2026-08-11*
  - [x] Exact spec field names verified key-by-key — *2026-08-11*
  - [x] Unit test suite in `scripts/test-postshipping-mapper.mjs` verifying all 3 cleanups and field names — *2026-08-11*
- [x] **DTDC / PostShipping Live Booking (Production-Ready MEL & NZ):**
  - [x] Migration `0106_dtdc_mel_nz_station_service_tokens.sql` with real station service tokens (`APDMEL`, `PATN*`, `PDS*`, `PNPU25KG` for MEL; `NZATL`, `NZSIG` for NZ) — *2026-08-11*
  - [x] Secure server-side RPC `app.get_vendor_carrier_secrets` (service-role only) — *2026-08-11*
  - [x] Client RPC `public.get_vendor_carrier_config` hardened (returns safe booleans, no leaked secret keys) — *2026-08-11*
  - [x] Idempotency guard `app.check_carrier_booking_idempotency` preventing duplicate wallet charges — *2026-08-11*
  - [x] Server-side Edge Function `supabase/functions/vendor-shipping/index.ts` with PostShipping live/dry-run routing, safe 20s timeout, transient error retry, and zero OTP gating — *2026-08-11*
  - [x] PostShipping client adapter `src/lib/integrations/vendor-shipping/adapters/postshipping/adapter.ts` wired to Edge function — *2026-08-11*
- [x] **Pickup Module** (`src/routes/transaction.pickup.tsx`, `src/lib/transactions/resources/pickups.ts`, `0031_pickup.sql`, `0099_pickup_cancel_type.sql`) — *2026-08-10*
- [x] **Pickup Inscan Module** (`src/routes/transaction.pickup-inscan.tsx`, `src/lib/transactions/resources/pickupInscan.ts`, `0100_pickup_inscan.sql`, `0101_inscan_downstream_gating.sql`, audio feedback `src/lib/audioFeedback.ts`) — *2026-08-10*
- [x] **AWB Entry P1 Compliance & Gates:**
  - [x] Auto/Manual AWB toggle + stock quota guard (`0102_awb_stock_allotment_and_gating.sql`, `src/lib/transactions/resources/awbStock.ts`) — *2026-08-10*
  - [x] IEC compliance booking gate (`0103_awb_compliance_gates.sql`) — *2026-08-10*
  - [x] ID format validators for PAN, GSTIN, Aadhaar, IEC (`src/lib/transactions/idValidators.ts`) — *2026-08-10*
  - [x] International KYC manifest gate (`0104_international_kyc_manifest_gate.sql`) — *2026-08-10*
- [x] **AWB Entry Keyboard UX & Lookups:**
  - [x] Enter-key navigation flow, portaled autocomplete, and ranked lookups (`src/lib/forms/erp-keyboard-nav.ts`, `src/components/forms/erp-form-nav-context.tsx`) — *2026-08-09*
  - [x] Postal pincodes autocomplete and international destination lookup (`0094`, `0096`) — *2026-07-23*
  - [x] Proforma items calculation, box numbers, and department field behavior — *2026-08-09*

- [x] **Bagging Module — Full Parity & Live Backend Wiring (Session 11):**
  - [x] Migration `0110_bagging_module.sql`: created `bagging_manifests`, `bagging_awb_lines`, and append-only `bagging_events` audit table; created `record_bagging` RPC with `app.allocate_document_no` sequence allocation, `list_baggings`, `get_bagging_details`, `delete_bagging`, `lookup_shipment_for_bagging`, and `record_bagging_progress` RPCs with strict 3-option `manifest_type` enum (`High Value`, `Low Value`, `Transhipment`) — *2026-08-12*
  - [x] Resource `src/lib/transactions/resources/bagging.ts`: provided TypeScript DTOs, `recordBagging`, `listBaggings`, `getBaggingDetails`, `deleteBagging`, `fetchShipmentForBagging`, and `recordBaggingProgress` — *2026-08-12*
  - [x] `src/routes/transaction.bagging.tsx`: replaced all in-memory mock state (`SEED_ROWS`, `SEED_AWB_META`) with live TanStack query and mutations; auto-populates live shipment details on AWB scan; added Destination panel fields (`arrivalTime`, `destVendor`); added Bag panel `manifestType` and `transferToUk`; added `Duplicate` and `Add (+)` actions; created Printable HTML Manifest and Printable Bag Labels; CSV batch import; wired Add Progress to DB — *2026-08-12*
  - [x] Master Lookups: added `airline` to `MASTER_LOOKUPS` & `SearchableLookupPair`; constrained Origin Country and Dest Country to `lookup="country"`; Flight to `lookup="flight"` — *2026-08-12*
  - [x] Test Suite: created `scripts/test-bagging-module.mjs` verifying lookups, strict enum gating, live totals computation, save/reload/persistence, printable generators, and SQL schema (6/6 tests passing); 44 Vitest suites (234 tests) passing; zero TypeScript errors in changed files — *2026-08-12*
- [x] **Un-Delivery Scan — Engine Reuse & Backend (Session 10):**
  - [x] Migration `0109_undelivery_scan.sql`: added `event_type` column to `pickup_inscan_events`, recreated per-type partial unique indexes (`PICKUP_INSCAN`, `UNDELIVERY_SCAN`), created `record_undelivery_scan()` RPC with `OUT_FOR_DELIVERY` eligibility gate, dual state transition `OUT_FOR_DELIVERY→UNDELIVERED→UNDELIVERED_RECEIVED`, duplicate guard, and append-only `shipment_scan_events` audit — *2026-08-11*
  - [x] Resource `pickupInscan.ts`: added `RecordUndeliveryScanInput` type, `recordUndeliveryScan()` calling new RPC, and `listUndeliveryInscans()` filtering `event_type = UNDELIVERY_SCAN` — *2026-08-11*
  - [x] `transaction.pickup-inscan.tsx`: exported `PickupInscanPage` + `InscanMode` type, added optional `mode` prop; when `mode="undelivery"` routes saveMutation to `recordUndeliveryScan`, live query to `listUndeliveryInscans`, shows "Un-Delivery Scan" breadcrumb/section label, and renders fixed "Shipment Undelivered Received" event badge — all other engine features (Vendor lookup, PickUp No, Service Center from auth, Inscan Report, Setup, Form Setup, Inscan Remark master, all lookups) reused unchanged — *2026-08-11*
  - [x] `transaction.un-delivery-scan.tsx`: replaced 166-line standalone stub with 20-line thin wrapper rendering `<PickupInscanPage mode="undelivery" />` — *2026-08-11*
  - [x] Zero TypeScript errors in all changed files; all pre-existing errors unrelated to this change — *2026-08-11*
- [x] **DRS Scan Site Parity & Dialog Enhancements:**

  - [x] Completed header form with Service Center lookup, Vehicle No & Type selector, From/To KM, Vehicle Owner & Driver lookups with contact numbers, and Run No — *2026-08-11*
  - [x] Added Scan By toggle (`AWB No` vs `Reference No`) switching lookup key in `lookupShipmentForDrs` — *2026-08-11*
  - [x] Built Cost Entry dialog (HR, Vehicle, Other costs, Voucher No/Amount) with automatic total summation and persistence — *2026-08-11*
  - [x] Built Bulk Excel/CSV upload dialog with template download, tabular parsing, and rejected rows summary modal — *2026-08-11*
  - [x] Built Pre-DRS list selector querying `MANIFEST_INSCANNED` shipments to batch-add to the run sheet — *2026-08-11*
  - [x] Built AWB details modal and printable HTML Delivery Run Sheet with company branding, totals, and signature blocks — *2026-08-11*
  - [x] Upload signed DRS copy dropzone with attached file inventory — *2026-08-11*
- [x] **Manifest View Live Data Connection & Wiring:**
  - [x] Replaced `SEED_ROWS` with live `public.manifests` query with date range, manifest type, origin, destination, vendor, and dynamic search-by filters — *2026-08-11*
  - [x] Replaced `buildAwbLines` mock with live `public.manifest_lines` + `public.shipments` query for selected manifest — *2026-08-11*
  - [x] Wired `handleProgressSave` to backend `recordManifestProgress` RPC (`0107`) for append-only milestone events — *2026-08-11*
  - [x] Fixed Origin lookup from `destination` to `serviceCentre` master — *2026-08-11*
  - [x] Production build and 44 test suites (234 tests) verified — *2026-08-11*
- [x] **Manifest Inscan Must-Fix Enhancements:**
  - [x] Migration `0108_manifest_inscan_enhancements.sql` adding re-measurement & discrepancy columns (`inscan_weight`, `inscan_length`, `inscan_breadth`, `inscan_height`, `inscan_vol_weight`, `inscan_remark`, `inscan_has_weight_discrepancy`) — *2026-08-11*
  - [x] Extended `scan_manifest` RPC to accept re-measured dimensions, weight, remark, and booking-weight flag with revenue-protection discrepancy comparison (`re_measured_weight > booked_weight`) — *2026-08-11*
  - [x] Whole-bag atomic receive RPC `scan_manifest_bag` to receive all shipments in a bag in one action and record append-only audit events — *2026-08-11*
  - [x] Volumetric weight auto-computation `((L * B * H) / 5000)` on input in Tab 2 (AWB No.) — *2026-08-11*
  - [x] Service Center default auto-population from `useAuth().profile.home_branch_id` — *2026-08-11*
  - [x] Rich Manifest Reconciliation Register table with filter tabs (`All`, `Scanned`, `Short / Missing`), live status badges, search filtering, and 1-click inscan action — *2026-08-11*
  - [x] Integration test suite `scripts/test-manifest-inscan-gaps.mjs` (6/6 tests passing) and production build verified — *2026-08-11*
- [x] **Manifest Scan Core Flow & P0 Validation Fixes:**
  - [x] Real scan validation against `public.shipments` (`fetchShipmentForManifestScan` in `src/lib/transactions/resources/manifests.ts`) enforcing status gate (`BOOKED`/`PICKUP_INSCANNED`), hold gate (`0101`), international KYC gate (`0104`), and cross-manifest duplicate guard (`0034`/`0101`) — *2026-08-11*
  - [x] Real data auto-population (pieces, charge weight, customer, consignee, origin, destination, instruction) into manifest lines — *2026-08-11*
  - [x] Dynamic branch code defaulting from `useAuth().profile.home_branch_id` / `userBranchQuery` — *2026-08-11*
  - [x] Flight lookups bug fix (`lookup="flight"` and `FLIGHTS` master options in `src/lib/master-lookups.ts`) — *2026-08-11*
  - [x] Inline line deletion action in draft manifest grid updating total weight and bag count — *2026-08-11*
  - [x] Unit test suite `scripts/test-manifest-scan.mjs` verifying all 7 P0 validation rules — *2026-08-11*
- [x] **Manifest Scan List B Gaps (Site Parity):**
  - [x] Excel Bulk Import parser (`.xlsx`, `.xls`, `.csv`) with batch `fetchShipmentForManifestScan` validation and rejected reasons summary modal — *2026-08-11*
  - [x] Migration `0107_manifest_progress_and_attachments.sql` with `app.record_manifest_progress` writing append-only tracking events to `manifest_events` and all associated `shipment_events` — *2026-08-11*
  - [x] Repeat toggle, Bag Type (`Bags`/`Cartoon`) selector, and CRN MHBS No input in the primary scan row — *2026-08-11*
  - [x] Signed manifest copy upload dropzone wired to `app.upload_manifest_attachment` and `manifest_attachments` — *2026-08-11*
  - [x] High-density printable 4×6 inch CRN Bag dispatch label with route, Master AWB barcode, CD No, and contact blocks — *2026-08-11*
  - [x] Integration test suite `scripts/test-manifest-list-b.mjs` (4/4 tests passing) — *2026-08-11*

### System & Infrastructure
- [x] **Customer Group:** Customer, Consignee, Shipper, Customer Rate, Expense (`src/routes/master.customer.*`) — *2026-07-04*
- [x] **Vendor Group:** Vendor, Vendor Contract (`src/routes/master.vendor.*`) — *2026-07-04*
- [x] **Operation Group:** Service Mapping, Field Executive, Pin Code, Area, Exception, Airline, Country Pincodes (`src/routes/master.operation.*`) — *2026-07-04*
- [x] **Sales Group:** Product, Product Master, Zone, Country, Destination, Service Center, State, Sales Executive, Industry, Flight, Product Type, Content, Instruction, Local Branch, Charges Master, Bank Master (`src/routes/master.sales.*`) — *2026-07-06*
- [x] **Customer Rate Workflow Updates:** Rate copy, unit days, rate types (`0091`, `0092`, `0093`) — *2026-07-22*

### System & Infrastructure
- [x] **App Shell & Layout:** Sidebar navigation, breadcrumbs, theme switcher, branch selector (`src/components/app-sidebar.tsx`, `app-header.tsx`, `src/routes/__root.tsx`) — *2026-07-04*
- [x] **Authentication & Multi-Tenancy:** Supabase Auth, username mapping, `me`/`me_permissions` RPCs, tenant isolation via `app.user_tenant_ids()` (`src/lib/auth.tsx`, `0001`–`0013`) — *2026-07-04*
- [x] **Rating Engine Foundation:** Multi-tier rating engine backend (`0041_rating_engine.sql`) — *2026-07-10*
- [x] **Reporting Foundation:** Registry tables, public report RPCs, and report hubs (`0042`–`0048`) — *2026-07-10*
- [x] **Utility Modules:** User Setup, Access Rights, Logged-in Users, Excel Merging/Import tools, Tax & Fuel Setup, Rate/Zone updates (`src/routes/utility.*`) — *2026-07-11*

---

## 4. In Progress

### 1. DTDC / PostShipping Live Staging Review
- **Files:**
  - `supabase/migrations/0105_dtdc_postshipping_carrier_integration.sql`
  - `supabase/migrations/0106_dtdc_mel_nz_station_service_tokens.sql`
  - `supabase/functions/vendor-shipping/index.ts`
  - `src/lib/integrations/vendor-shipping/adapters/postshipping/mapper.ts`
- **Current Stopping Point:**
  - Spec-compliant mapper and server-side edge function logic verified in dry-run mode with real shipment values.
  - Stopped before: Sharing regenerated masked cURL with DTDC for review and applying migrations to staging DB before flipping `is_live_mode = true`.

### 2. AWB Entry — Phase 2 (P2) Polish Items
- **Files:**
  - `src/routes/transaction.awb-entry.tsx`
  - `src/lib/transactions/shipmentUiMap.ts`
- **Current Stopping Point:**
  - **MTS Piece Import:** Stub button exists at `src/routes/transaction.awb-entry.tsx` line ~4035; needs handler to parse and populate piece lines.
  - **Buyer Details Accordion:** Proforma tab structure present; needs dedicated buyer address fields.
  - **Vendor Weight Alert:** Warning modal when entered gross weight exceeds vendor slab limits.
  - **Rate Mode Switcher:** Radio toggle for manual rate mode override in the charges section.

### 3. Manifest Transaction Flow (Scan, In-Scan, View)
- **Files:**
  - `src/routes/transaction.manifest-scan.tsx`
  - `src/routes/transaction.manifest-in-scan.tsx`
  - `src/routes/transaction.manifest-view.tsx`
  - `src/lib/transactions/resources/manifests.ts`
- **Current Stopping Point:**
  - Basic routes and foundation RPCs (`0034`, `0035`, `0104`) exist.
  - Stopped before: Full audit and reconciliation against live Xpresion Manifest screens (bulk scan grid, driver/vendor assignment, seal number validation, manifest lock state, printable run-sheets).

---

## 5. To Do / Backlog

### Phase A: Immediate Priority
- [ ] **Apply & Smoke-Test Migrations 0105 & 0106:** Run on remote/staging Supabase instance.
- [ ] **Manifest Module Audit & Fixes:**
  - [ ] Audit `transaction.manifest-scan.tsx` against Xpresion Manifest Outscan workflow.
  - [ ] Audit `transaction.manifest-in-scan.tsx` for hub destination receiving.
  - [ ] Verify manifest printing and PDF/label generation sheets.
- [ ] **DRS (Delivery Run Sheet) Module Audit:**
  - [ ] Audit `src/routes/transaction.drs-scan.tsx` and `src/lib/transactions/resources/drs.ts` against Xpresion DRS screen.
  - [ ] Verify FE assignment, run sheet generation, and status transitions (`BOOKED`/`MANIFESTED` → `OUT_FOR_DELIVERY`).

### Phase B: Secondary Priority
- [ ] **AWB Entry P2 Features:**
  - [ ] Wire MTS piece import parser (`transaction.awb-entry.tsx#L4035`).
  - [ ] Add Buyer Details section in Proforma invoice tab.
  - [ ] Add rate calculation mode radio toggles.
  - [ ] Add vendor weight discrepancy warning alert.
- [ ] **POD / Delivery Module (UI Implementation):**
  - [ ] Build POD entry route (`transaction.pod-entry.tsx`) on top of `src/lib/transactions/resources/pod.ts` and `0038_pod_foundation.sql`.
  - [ ] Support photo upload, signature capture, and delivery exception logging.

### Phase C: System & Polish
- [ ] **Bagging Module:** Reconcile `src/routes/transaction.bagging.tsx` with business operations requirements.
- [ ] **Tracking / Public Tracking:** Refine `src/routes/public.track.tsx` and internal tracking queries for multi-leg journey visualization.
- [ ] **Finance & Receipt Validation:** End-to-end audit of Expense Authorize, Receipt Entry, Debit/Credit Notes (`src/routes/transaction.receipt.*.tsx`).
- [ ] **Async Export Jobs:** Test worker processing for heavy report exports (`0048_report_jobs.sql`).

---

## 6. Notes & Decisions

### Core Conventions (Never Violate)
1. **Supabase Client Import:** ALWAYS import from `import { supabase } from "@/integrations/supabase/client";`.
2. **Security & RLS:** All backend logic lives in Postgres as `SECURITY DEFINER` RPCs. Tenant isolated via `app.user_tenant_ids()`.
3. **State Machine Integrity:** Never delete/modify existing transitions in `app.status_transitions`; only append in new migrations.
4. **Optimistic Locking & Soft Deletes:** Mutable tables use `row_version integer NOT NULL DEFAULT 1` with `CMS04` conflict error; soft deletes use `deleted_at timestamptz`.
5. **DTDC PostShipping Credentials & Dual Authentication:**
   - **Station Key:** Station API key in `Token` header (Melbourne: `5535E00AF881A2D1212AA1A27574E499`, New Zealand: `36FA600E65426DDAF314A836402AEA59`). Stored strictly server-side.
   - **ThirdPartyToken:** Looked up per `(station_code, service_code)` from `vendor_service_tokens`.
   - **WeightMeasurement Constant:** Configurable in `mapper.ts` via `POSTSHIPPING_WEIGHT_MEASUREMENT` (default `"Kgs"`).
   - **Field Name Standard:** Strict adherence to `doc.postshipping.com/docs/developers/shipment/`.
   - **Idempotency:** Checked before live POST via `app.check_carrier_booking_idempotency` to prevent duplicate charges.
   - **No OTP:** DTDC path bypasses all OTP / SMS mobile prompts.
   - **Safe Fallback:** In dry-run mode, generates full preview without live HTTP call or wallet charge.

---

## 7. Changelog

### 2026-08-11 (Session 9)
- **DRS Scan Site Parity & Dialogs Completed:**
  - Added all reference header inputs: Service Center lookup, Vehicle No & Type selector (`Bike`, `Auto`, `Van`, `Truck`), From/To KM, Vehicle Owner & Driver lookups with contact numbers, and Run No.
  - Added Scan By toggle (`AWB No` vs `Reference No`) switching the lookup key in `lookupShipmentForDrs`.
  - Built Cost Entry dialog (HR, Vehicle, Other costs, Voucher No/Amount) with auto-summed Total Cost and persistence to `wizard_extras`.
  - Built File Upload bulk import dialog with template download, tabular parsing, and rejected rows summary.
  - Built Pre-DRS list selector querying `MANIFEST_INSCANNED` shipments with multi-select to batch add to DRS.
  - Built AWB Details preview modal and full printable HTML Delivery Run Sheet with route, shipments, and signature blocks.
  - Added signed DRS copy upload dropzone with attached files inventory.
  - Confirmed 0 build errors and all 44 test suites passing.

### 2026-08-11 (Session 8)
- **Manifest View Live Data Connection & Wiring Completed:**
  - Replaced `SEED_ROWS` with live Supabase query against `public.manifests` with date range, manifest type, origin, destination, vendor, and dynamic search-by (CD No / Master AWB No / AWB No) filters.
  - Replaced `buildAwbLines` mock with live `public.manifest_lines` joined to `public.shipments` for the selected manifest, mapping real shipment fields to all 12 table columns.
  - Wired `handleProgressSave` to call backend `recordManifestProgress` RPC (`app.record_manifest_progress`) with append-only event logging.
  - Fixed Origin lookup to point to `lookup="serviceCentre"` instead of `lookup="destination"`.
  - Confirmed 0 build errors and all 44 test suites passing.

### 2026-08-11 (Session 7)
- **Manifest Inscan Must-Fix Gaps Completed:**
  - Created migration [`0108_manifest_inscan_enhancements.sql`](file:///Users/karthikkukkala/Desktop/Courier%20Management%20System/swiftforge-core/supabase/migrations/0108_manifest_inscan_enhancements.sql) adding re-measurement & discrepancy tracking columns to `public.shipments`.
  - Extended `scan_manifest` RPC to accept `p_weight`, `p_length`, `p_breadth`, `p_height`, `p_vol_weight`, `p_remark`, and `p_is_booking_weight`.
  - Added weight discrepancy revenue-protection detection comparing re-measured weight vs `booked_weight` (`shipments.charge_weight`), persisting variance into scan and shipment audit event payloads.
  - Added atomic whole-bag receiving RPC `scan_manifest_bag` in migration `0108` and wired Tab 1 to batch-receive all shipments in a bag when only `bagNo` is entered.
  - Added volumetric weight auto-calculation (`(L × B × H) / 5000`) on dimensional inputs in Tab 2 (AWB No.).
  - Defaulted `header.serviceCentre` to the logged-in user's profile branch via `useAuth().profile.home_branch_id`.
  - Built high-density **Manifest Reconciliation Register** replacing the old select dropdown with a full tabular manifest inventory featuring `All`, `Scanned`, and `Short / Pending` filter tabs, search filter, and 1-click inscan action buttons.
  - Created test suite [`scripts/test-manifest-inscan-gaps.mjs`](file:///Users/karthikkukkala/Desktop/Courier%20Management%20System/swiftforge-core/scripts/test-manifest-inscan-gaps.mjs) (6/6 tests passing) and confirmed zero-error production build.

### 2026-08-11 (Session 6)
- **Manifest Scan List B Gaps (Site Parity):**
  - Built Excel/CSV bulk import parser in [`transaction.manifest-scan.tsx`](file:///Users/karthikkukkala/Desktop/Courier%20Management%20System/swiftforge-core/src/routes/transaction.manifest-scan.tsx) running batch `fetchShipmentForManifestScan` validation with detailed modal summary of accepted vs skipped rows.
  - Created migration `0107_manifest_progress_and_attachments.sql` with `app.record_manifest_progress` to persist progress events in `manifest_events` and append milestones into `shipment_events`.
  - Added Repeat checkbox (retains `bagNo` and `crnMhbsNo`), `Bag Type` (`Bags`/`Cartoon`) selector, and `CRN MHBS No` input into the scan row.
  - Added Signed Manifest Copy attachment section in the form wired to `app.upload_manifest_attachment` and `manifest_attachments`.
  - Built printable 4×6 inch CRN Bag Label in HTML/print format with barcode, route badges, CD number, and shipper/consignee blocks.
  - Verified with test suite in [`scripts/test-manifest-list-b.mjs`](file:///Users/karthikkukkala/Desktop/Courier%20Management%20System/swiftforge-core/scripts/test-manifest-list-b.mjs) (4/4 tests passing) + regression tests in [`scripts/test-manifest-scan.mjs`](file:///Users/karthikkukkala/Desktop/Courier%20Management%20System/swiftforge-core/scripts/test-manifest-scan.mjs) (7/7 passing).

### 2026-08-11 (Session 5)
- **Manifest Scan Core Flow (P0 Fixes):**
  - Implemented `fetchShipmentForManifestScan` in [`manifests.ts`](file:///Users/karthikkukkala/Desktop/Courier%20Management%20System/swiftforge-core/src/lib/transactions/resources/manifests.ts) querying real `shipments` with status gate (`BOOKED`/`PICKUP_INSCANNED`), hold gate (`0101`), international KYC gate (`0104`), and cross-manifest duplicate guard.
  - Auto-fills real pieces, charge weight, customer, consignee, origin, destination, and instruction into scanned lines.
  - Added `flight` to [`master-lookups.ts`](file:///Users/karthikkukkala/Desktop/Courier%20Management%20System/swiftforge-core/src/lib/master-lookups.ts) and switched Flight 1 / Flight 2 / Flight lookups from `destination` to `flight`.
  - Added inline line deletion in draft manifest grid with live recalculation of bag count and total vendor weight.
  - Replaced hardcoded origin branch default with `useAuth().profile.home_branch_id` / `userBranchQuery`.
  - Created and executed test suite in [`scripts/test-manifest-scan.mjs`](file:///Users/karthikkukkala/Desktop/Courier%20Management%20System/swiftforge-core/scripts/test-manifest-scan.mjs) (7/7 tests passing).

### 2026-08-11 (Session 4)
- **DTDC Payload Value Cleanups:**
  - Made `POSTSHIPPING_WEIGHT_MEASUREMENT` a single configurable constant in [`mapper.ts`](file:///Users/karthikkukkala/Desktop/Courier%20Management%20System/swiftforge-core/src/lib/integrations/vendor-shipping/adapters/postshipping/mapper.ts) (value `"Kgs"`).
  - Wired `SenderKycType` and `SenderKycNumber` to extract real shipper documents (PAN/IEC/GSTIN/Aadhaar) without inventing fallback values.
  - Wired `ReasonExport` and `Incoterms` to map real values from shipment proforma data.
  - Verified with test suite in [`scripts/test-postshipping-mapper.mjs`](file:///Users/karthikkukkala/Desktop/Courier%20Management%20System/swiftforge-core/scripts/test-postshipping-mapper.mjs).

### 2026-08-11 (Session 3)
- **PostShipping Payload Mapper Field-Name Fix:**
  - Updated [`mapper.ts`](file:///Users/karthikkukkala/Desktop/Courier%20Management%20System/swiftforge-core/src/lib/integrations/vendor-shipping/adapters/postshipping/mapper.ts) and [`types.ts`](file:///Users/karthikkukkala/Desktop/Courier%20Management%20System/swiftforge-core/src/lib/integrations/vendor-shipping/adapters/postshipping/types.ts) to match the exact PostShipping specification.

### 2026-08-11 (Session 2)
- **DTDC Live Booking Production-Ready for MEL & NZ:**
  - Created migration `0106_dtdc_mel_nz_station_service_tokens.sql` with accurate tokens for MEL and NZ.
  - Implemented server-side PostShipping dispatcher with 20s timeout and safe retry.

### 2026-08-11 (Session 1)
- **Project Progress Tracker Initialized:** Created `PROGRESS.md` as the unified single source of truth across development sessions.
