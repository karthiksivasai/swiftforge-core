# Forwarding Tab Audit (/transaction/awb-entry)

**Date:** 11 Nov 2026  
**Auditor:** Antigravity AI Pair Programmer  
**Branch:** `main` (commit `34df21a`)  
**Scope:** Forwarding Tab (`/transaction/awb-entry`, Tab "Forwarding") — International Courier Bookings  
**Working Rule:** Following `docs/testing-playbook.md` Steps 1–3. Detailed code + live verification.

---

## 1. Executive Summary

A comprehensive code and live browser/DB audit was conducted on the **Forwarding Tab** of the AWB Entry screen. The audit covered all 8 header fields, the collapsible Vendor Charges grid and summary strip, client-side validation logic, database persistence (`shipments`, `shipment_charge_snapshots`, `wizard_extras`), audit logging, lock enforcement, and printed document generation (Proforma/Commercial Invoices and Thermal AWB Labels).

### Key Takeaways
1. **Critical UI Wiring Bug (FW-01)**: The `Delivery Service` field is incorrectly wired to `lookup="product"` instead of `lookup="service"`. Selecting Delivery Service opens the Product lookup modal (displaying "NON DOCUMENTS", "DOCUMENTS") rather than vendor services ("EXPRESS", "ECONOMY"). Furthermore, the database mapper explicitly hardcodes `delivery_service: null`.
2. **Broken Vendor Charge Draft Calculations (FW-02)**: The draft line entry logic in `patchVendorChargeDraft` hardcodes `total = amount || "0.00"`. It completely ignores Fuel, Tax on Fuel, and Tax selections. The input fields for `Fuel Amt`, `Tax on Fuel`, and `Tax` are `readOnly`, meaning fuel and tax amounts are permanently locked at zero/blank.
3. **Database Ledger Disconnect (FW-03)**: Vendor charge lines are saved **only** inside the unstructured `wizard_extras.forwarding.vendorChargeLines` JSONB column. They are **never** inserted into `public.shipment_charge_snapshots` (`side = 'VENDOR'`). Financial reports and accounting ledgers querying `shipment_charge_snapshots` cannot see these vendor expenses.
4. **Hardcoded Summary Strip (FW-04)**: `Contract Charges` in the summary strip is hardcoded to `"0.00"`, completely disconnected from the vendor contract freight calculated by the database rating engine (`shipments.vendor_charges_total`).
5. **No Auto-Population of Vendor Weight (FW-05)**: `Vendor Weight` starts blank, forcing operators to manually re-type the weight from the AWB tab rather than defaulting to the shipment's charge weight.
6. **Delivery Vendor PostgREST Ambiguity (FW-11)**: Two foreign keys exist between `shipments` and `vendors` (`shipments_vendor_fk` and `shipments_delivery_vendor_fk`). Queries that do not qualify the embedding with `vendors!shipments_delivery_vendor_fk` crash with `PGRST201`.
7. **Duplicate Forwarding Numbers Permitted (FW-12)**: Verified live: multiple shipments can be saved with the identical `forwarding_awb` for the same vendor. The system lacks a uniqueness constraint.
8. **Lock Enforcement is Robust (FW-13)**: Verified live: locked AWBs disable all Forwarding inputs on the UI (`pointer-events-none`) and the PostgreSQL server RPC strictly blocks saving updates. Unlocking requires `txn.awb-unlock`.
9. **Audit Log Omission (FW-14)**: When Forwarding fields are changed after booking, `app.write_audit_log` records `who` and `when`, but omits `old` and `new` values for `forwarding_awb`, `delivery_awb`, `delivery_vendor_id`, and `delivery_service`.

---

## 2. Detailed Findings Matrix

| Finding ID | Area | Severity | Status | Verification Type | Description & Code Location | Expected Behavior | Actual Behavior | Resolution / Decision |
|---|---|---|---|---|---|---|---|---|
| **FW-01** | Field Lookup & DB Mapping | **CRITICAL** | **FIXED** | **LIVE (Browser DOM & DB)** | `Delivery Service` was wired with `lookup="product"`. In `shipmentUiMap.ts`, `delivery_service` column was set to `null` (`awb-entry.tsx:7460-7466`, `shipmentUiMap.ts:271`). | Selecting Delivery Service should open the Service lookup filtered by vendor. Server should save `delivery_service` code/id. | Wired `VendorServiceLookup` filtered to selected vendor, mapped in `shipmentUiMap.ts`, persisted in DB, and verified live via Playwright E2E (`F1`). | Fixed in Batch 1. (D2) |
| **FW-02** | Vendor Charge Math | **HIGH** | **FIXED** | **LIVE (Browser DOM & Vitest)** | Draft calculation sets `total = amount`. Inputs for `fuelAmt`, `taxOnFuelAmt`, `taxAmt` were `readOnly` and never computed (`awb-entry.tsx`). | Selecting Fuel = Yes or Tax = Yes should calculate fuel and GST surcharges and add them to draft total. | Live draft calculation implemented in `priceVendorChargeDraft` and `patchVendorChargeDraft`. Dynamic fuel/tax labels, state-aware GST calculation. Verified in Vitest (`forwardingBatch2.test.ts`) & Playwright E2E (`forwarding-batch2.spec.ts`). | Fixed in Batch 2. (D4) |
| **FW-03** | Database Persistence | **HIGH** | **FIXED** | **LIVE (DB Query & Test)** | `uiFormToShipmentPayload` mapped only `CUSTOMER` charges. `vendorChargeLines` were completely omitted from `charges` payload (`shipmentUiMap.ts`). | Vendor charges should be inserted into `public.shipment_charge_snapshots` with `side = 'VENDOR'`. | Vendor charge lines mapped into `charges` payload with `side: 'VENDOR'`. Stored in `shipment_charge_snapshots` and priced server-side via `app.price_manual_charges`. | Fixed in Batch 2. (D3) |
| **FW-04** | Summary Strip Display | **MEDIUM** | **FIXED** | **LIVE (Browser DOM)** | `Contract Charges` in `vendorChargeSummary` was hardcoded to string `"0.00"` (`awb-entry.tsx`). | Should reflect contracted vendor freight from the rating engine or rate card. | Forwarding summary grid displays 6 live metric cards: Contract (`fwd-summary-contract`), Fuel (`fwd-summary-fuel`), Manual (`fwd-summary-manual`), Vendor GST (`fwd-summary-vendor-gst`), Vendor Total incl. GST (`fwd-summary-vendor-total`), and Margin (`fwd-summary-margin`). Verified live in browser E2E. | Fixed in Batch 2. (D9) |
| **FW-05** | Form Usability | **MEDIUM** | **OPEN** | **LIVE (Browser DOM)** | `Vendor Weight` defaults to empty string `""` (`awb-entry.tsx:7468-7474`). | Should automatically pre-populate from shipment `chargeWeight` or `actualWeight` from AWB tab. | Operator must re-type weight manually for every shipment. | Auto-populate `vendorWeight` from `form.chargeWeight` when blank, while allowing manual override. (D5) |
| **FW-06** | Vendor Rating Parity | **MEDIUM** | **FIXED** | **LIVE (DB Query & Vitest)** | Server SQL `apply_rating_to_shipment` calculated `vendor_charges_total` strictly from vendor rate card. Manual lines did not affect this total. | Total vendor liability in `shipments.vendor_charges_total` should equal Contract Charges + Manual Vendor Surcharges (ex-GST). | Server ratings now add manual vendor charges to contract freight in `vendor_charges_total` (ex-GST), stores vendor GST in `vendor_tax_total`, and inserts `side = 'VENDOR'` snapshots. Verified in Vitest & Playwright E2E. | Fixed in Batch 2. (D3, D8) |
| **FW-07** | In-Memory Sync | **LOW** | **OPEN** | **CODE-ONLY** | `form.forwarding.forwardingAwb` syncs to `form.forwardingNo` only upon Save (`awb-entry.tsx:3766, 4198`). | Typing in `Forwarding AWB` should update `form.forwardingNo` reactively so other tabs/headers see it immediately. | Out of sync in memory until Save is clicked. | Add reactive sync in `patchForwarding` for `forwardingAwb` $\leftrightarrow$ `forwardingNo` and `deliveryAwb` $\leftrightarrow$ `deliveryNo`. |
| **FW-08** | Document Parity | **LOW** | **OPEN** | **CODE-ONLY** | Thermal AWB shipping label does not render `forwardingAwb` / partner carrier tracking number or barcode (`awbLabelGenerator.ts:601-660`). | Label should optionally print partner tracking number for airport handoff. | Only internal AWB number is rendered on label. | Deferred per decision D7 (leave open, low). |
| **FW-09** | Master Data Flexibility | **LOW** | **OPEN** | **CODE-ONLY** | `VENDOR_CHARGE_DESCRIPTIONS` is a hardcoded array of 5 strings in the component (`awb-entry.tsx:776-782`). | Should be loaded from charge heads master table with `side = 'VENDOR'`. | New vendor surcharges require code edits. | Load descriptions dynamically from charge master where `side in ('VENDOR', 'BOTH')`. (D9) |
| **FW-10** | Keyboard Navigation | **LOW** | **OPEN** | **LIVE (Browser DOM)** | Tabbing past `Vendor Invoice` (1007) jumps straight to draft description (1010) even when collapsible section is closed (`awb-entry.tsx:7500-7535`). | Tabbing should land on the collapsible trigger ("Click here to enter Vendor Charge details Or Press Alt+w") when closed. | Focus disappears into closed accordion element until expanded. | Ensure collapsible trigger is reachable in tab sequence and auto-expands when tabbing into charge inputs. |
| **FW-11** | PostgREST Multi-Relationship | **HIGH** | **FIXED** | **LIVE (Browser & Test)** | PostgREST query on `shipments` embedding `vendors` without alias fails with `PGRST201` ("Could not embed because more than one relationship was found"). Location: `resources/shipments.ts:190-191`, `e2e/forwarding-audit.spec.ts:137`. | Queries joining delivery vendor must specify exact relationship name. | Test script crashed on DB assertion due to missing `!shipments_delivery_vendor_fk`. | Disambiguated using explicit `vendors!shipments_vendor_fk` and `vendors!shipments_delivery_vendor_fk`. Fixed in Batch 1. |
| **FW-12** | Duplicate Forwarding AWB | **HIGH** | **FIXED** | **LIVE (Browser & DB)** | Two shipments could be saved with the same `forwarding_awb` for the same vendor without error. | Partner carrier AWB must be unique per vendor per tenant to prevent duplicate manifesting. | Added partial unique index `shipments_forwarding_awb_vendor_uidx` and RPC check in `book_awb_shipment` in migration 0156. Verified live in E2E (`FW-12 / F7`). | Fixed in Batch 1. (D6) |
| **FW-13** | Lock Enforcement | **MEDIUM** | **PASS** | **LIVE (Browser & DB)** | On a locked AWB (`is_locked: true`), Forwarding tab inputs are wrapped in `<fieldset disabled>` with `pointer-events-none` and server RPC raises `'Shipment is locked'`. Unlocking requires `txn.awb-unlock`. | Locked shipment must be strictly immutable on UI and server; unlock requires permission. | Both UI and server successfully block editing when locked. Unlock is gated by `txn.awb-unlock`. Verified live in E2E (`FW-13 / F6`). | Verified functional. (D10) |
| **FW-14** | Audit Trail Omission | **MEDIUM** | **FIXED** | **LIVE (DB Query & Unit Test)** | `book_awb_shipment` called `app.write_audit_log`, but `p_old` and `p_new` JSON payloads omitted `forwarding_awb`, `delivery_awb`, `delivery_vendor_id`, and `delivery_service`. | When forwarding details are updated after booking, audit log must record who, when, and old vs new values. | Extended `app.write_audit_log` call in `book_awb_shipment` in migration 0156 to include forwarding fields in `old_values` and `new_values`. Verified in Vitest database test. | Fixed in Batch 1. (D10) |

---

## 3. Explanation of Playwright Audit Run (Why it Exited with Code 1)

In the exploratory audit test (`e2e/forwarding-audit.spec.ts`):
1. **Authentication**: Succeeded cleanly as `Karthik Test Admin` via `auth.setup.ts`.
2. **Browser UI Actions**:
   - Navigated to `http://localhost:8082/transaction/awb-entry?view=form`.
   - Filled all mandatory AWB fields (Client ALIASSO, Origin Hyderabad, Destination USA, Product NDOX, Vendor FEDEX, Service EXPRESS, Pieces 1).
   - Clicked the "Forwarding" tab trigger.
   - Verified Delivery Product mirrored "NON DOCUMENTS" and Delivery Vendor mirrored "FEDEX".
   - Typed Forwarding fields: `Delivery AWB = DEL-100116`, `Forwarding AWB = FWD-100116`, `Vendor Weight = 2.5`.
   - Expanded Vendor Charges accordion, selected Description, entered Amount 850.00, added line, and verified summary strip subtotal "850.00".
   - Clicked Save. The UI displayed the success toast: `"AWB 100116 booked"`.
3. **Reason for Failure**:
   - In step 8 of the test script, Playwright executed a direct Supabase query to assert database columns:
     ```typescript
     const { data: shipment, error: dbErr } = await supabase
       .from('shipments')
       .select('*, vendors(code), delivery_vendor:delivery_vendor_id(code)')
       .eq('awb_no', '100116')
       .single();
     ```
   - PostgREST returned error `PGRST201`:
     `"Could not embed because more than one relationship was found for 'shipments' and 'vendors'"`
   - The test assertion `expect(dbErr).toBeNull()` failed on line 141 because PostgREST requires the explicit foreign key alias `vendors!shipments_vendor_fk`.
   - **Conclusion**: The application UI and booking RPC had succeeded; the failure was an assertion crash caused by finding **FW-11**.

---

## 4. What is the Forwarding Tab for in a Real Courier Business?

In an international courier business (such as CourierWala / Swiftforge in Hyderabad), a retail courier company does not operate its own international airline fleet or delivery vans in 220 countries. Instead, the courier operates as an **international co-loader, freight forwarder, and consolidator**.

### The Real-World Workflow
1. **Internal House Booking**: When a retail shipper or corporate client books a parcel at the branch counter, CourierWala issues its own internal House Air Waybill (e.g., CourierWala AWB `100116`). The customer receives this receipt and tracks their package on CourierWala’s portal.
2. **Co-Loading with Global Partner**: That evening, CourierWala’s operations team consolidates parcels at the Hyderabad hub and hands them over to an international line-haul partner (such as FedEx, DHL, or UPS).
3. **Carrier Tracking Number (Forwarding AWB)**: The partner carrier assigns its own international tracking barcode (e.g., FedEx Tracking No `794612345678`). This is recorded in the **Forwarding AWB** field. When the customer calls for an update, the operator uses this number to track the flight status directly on FedEx.
4. **Delivery Partner / Agent (Delivery AWB)**: In some regions, FedEx or DHL hands the parcel to a local postal agent or last-mile courier for remote delivery. That local reference is recorded in the **Delivery AWB** field.
5. **Vendor Cost & Margin Tracking**: Partner carriers charge CourierWala commercial B2B rates for air freight, plus fuel surcharges, peak demand surcharges, and remote area fees. Recording these on the Forwarding tab allows the ERP to calculate the company’s **exact gross profit margin** on every single shipment:
   $$\text{Gross Profit} = \text{Customer Billed Total (AWB Tab)} - \text{Vendor Cost Total (Forwarding Tab)}$$

### Real-Life Example
- **Customer**: Mrs. Lakshmi visits the Hyderabad branch to send a 2 kg box of homemade sweets and clothes to her son in Dallas, Texas, USA.
- **AWB Tab**: The operator books internal AWB `100116` under customer `ALIASSO`. The system charges Mrs. Lakshmi **₹2,800.00** (cash).
- **Proforma Tab**: Lakshmi declares 2 shirts (₹1,000) and sweets (₹400) under CSB 4 unsolicited gift.
- **Forwarding Tab**: The package is manifested onto FedEx International Priority:
  - **Forwarding AWB**: `794689012345` (12-digit FedEx tracking barcode).
  - **Delivery Vendor**: `FEDEX`.
  - **Delivery Service**: `EXPRESS`.
  - **Vendor Weight**: `2.000 kg`.
  - **Vendor Charges**: Contract base freight ₹1,650.00 + Demand Surcharge ₹150.00 + Fuel Surcharge ₹180.00 = **₹1,980.00**.
- **Financial Result**:
  - Revenue: ₹2,800.00
  - Direct Vendor Cost: ₹1,980.00
  - Net Profit Margin: **₹820.00 (29.3%)**
- **Customer Experience**: The printed Proforma Invoice clearly states `Tracking No: 794689012345` alongside internal `AWB No: 100116`, giving Mrs. Lakshmi full transparency.

---

## 5. Owner Decisions (Final)

- **D1 (Optional Booking)**: Forwarding AWB is optional at booking time and can be added later (it will be required before manifest/dispatch on subsequent screens).
- **D2 (Delivery Service Master)**: Delivery Service uses the live Service master, strictly filtered to the selected Delivery Vendor, and saves to `shipments.delivery_service`.
- **D3 (Vendor Charges Storage)**: Vendor charge lines are saved in `shipment_charge_snapshots` with `side = 'VENDOR'`, and are ADDED to the contract vendor freight in `shipments.vendor_charges_total`.
- **D4 (Vendor Fuel & GST Math)**: Vendor fuel uses the vendor's fuel surcharge % from the fuel master. Vendor GST: IGST if vendor billing state differs from branch state, CGST+SGST if same state.
- **D5 (Vendor Weight Default)**: Vendor Weight defaults to the AWB charge weight and remains editable.
- **D6 (Carrier Format & Uniqueness)**: Forwarding AWB format: WARN only (FedEx 12 digits, DHL 10 digits, UPS 1Z + 16 chars). BLOCK duplicate forwarding numbers for the same vendor server-side (unique).
- **D7 (Label Printing)**: Forwarding number printing on thermal shipping label deferred (leave FW-08 open, low).
- **D8 (Vendor Override Cost Recalculation)**: If Delivery Vendor differs from AWB Vendor: customer price must NOT change; vendor cost is recalculated from the Delivery Vendor's contract, and the preview shows it.
- **D9 (Contract Freight & Masters)**: Contract Charges in summary strip displays real rated vendor freight. Vendor charge descriptions come from the charge master (`side = 'VENDOR'`).
- **D10 (Lock Enforcement & Full Audit)**: Forwarding strictly obeys Lock (read-only in UI and server). Every forwarding change is audited (who, when, old, new).

---

## 6. Batch Implementation Plan

### Batch 1: Core Field Wiring, Relationship Ambiguity, Uniqueness, Lock & Audit [STATUS: COMPLETED & VERIFIED]
- **FW-01**: **CLOSED - FIXED & VERIFIED**. `Delivery Service` wired via `VendorServiceLookup` (filtered to selected vendor), mapped in `shipmentUiMap.ts` (`delivery_service`), and persisted to database. Verified via Vitest unit tests and live Playwright E2E (`F1`).
- **FW-11**: **CLOSED - FIXED & VERIFIED**. Disambiguated PostgREST join on `vendors` using explicit foreign key qualifiers `vendors!shipments_vendor_fk` and `vendors!shipments_delivery_vendor_fk`. Verified in unit tests and Playwright E2E.
- **FW-12**: **CLOSED - FIXED & VERIFIED**. Created partial unique index `shipments_forwarding_awb_vendor_uidx` on `(tenant_id, coalesce(delivery_vendor_id, vendor_id), upper(btrim(forwarding_awb)))` in migration `0156_forwarding_batch1_unique_audit_service.sql` and added RPC-level check raising `"Forwarding AWB <no> is already in use for this vendor on AWB <awb_no>"`. Verified in Vitest and live Playwright E2E (`FW-12 / F7`).
- **FW-13**: **CLOSED - FIXED & VERIFIED**. Wrapped Forwarding tab in `<fieldset disabled={entryLocked}>` alongside `pointer-events-none opacity-90`. Locked shipments render all inputs and footer Save/Update action completely disabled. Verified in live Playwright E2E (`FW-13 / F6`).
- **FW-14**: **CLOSED - FIXED & VERIFIED**. Added forwarding fields (`forwarding_awb`, `delivery_awb`, `delivery_vendor_id`, `delivery_service`) to audit log JSON payloads (`old_values` and `new_values`) via `app.write_audit_log` in `book_awb_shipment`. Verified in Vitest database test.

### Batch 2: Vendor Charges Math, Ledger Persistence & Rating Parity [STATUS: COMPLETED & VERIFIED]
- **FW-02**: **CLOSED - FIXED & VERIFIED**. Live draft calculations in `priceVendorChargeDraft` and `patchVendorChargeDraft`. Automatically calculates fuel amount from vendor fuel surcharge % and tax based on vendor state and branch state (IGST or CGST/SGST). Verified in unit test (`forwardingBatch2.test.ts`) and live Playwright E2E (`F2`).
- **FW-03**: **CLOSED - FIXED & VERIFIED**. `vendorChargeLines` mapped in `uiFormToShipmentPayload` with `side: 'VENDOR'` and persisted to `public.shipment_charge_snapshots` via `app.price_manual_charges`. Verified in unit tests and live Playwright E2E.
- **FW-04**: **CLOSED - FIXED & VERIFIED**. Forwarding summary displays 6 live metric cards: Contract (`fwd-summary-contract`), Fuel (`fwd-summary-fuel`), Manual (`fwd-summary-manual`), Vendor GST (`fwd-summary-vendor-gst`), Vendor Total incl. GST (`fwd-summary-vendor-total`), and Margin (`fwd-summary-margin`). Verified live in browser E2E.
- **FW-06**: **CLOSED - FIXED & VERIFIED**. Server SQL rating stores vendor liability strictly **EXCLUDING GST** in `shipments.vendor_charges_total = contract freight + fuel + manual vendor charges (ex-GST)`, stores vendor GST in `shipments.vendor_tax_total`, and snapshots all lines with `side = 'VENDOR'`. Verified in unit and E2E tests.
- **Vendor Master State & Flag**: Vendor state resolved from `vendors.state_id` / `gst_no`. Warning banner `fwd-vendor-state-warning` shown when vendor has no state/GSTIN. Flag `charges_gst_on_export boolean default true` added to `public.vendors`.

### Batch 3: Usability, Live Sync, Masters & Navigation
- **FW-05**: Auto-populate `Vendor Weight` from AWB `chargeWeight` with override capability.
- **FW-07**: Reactive two-way sync for `forwardingAwb` $\leftrightarrow$ `forwardingNo` and `deliveryAwb` $\leftrightarrow$ `deliveryNo`.
- **FW-09**: Populate vendor charge descriptions dynamically from charge master (`side in ('VENDOR', 'BOTH')`).
- **FW-10**: Fix keyboard navigation so Alt+w accordion trigger is properly tab-accessible.
- **D6**: Add client warning banner for non-standard carrier barcode formats.

---

## 7. Proposed Real-Life Browser Test Cases (F1 to F8 + Duplicate + Lock)

1. **F1 (Happy Path)**: ALIASSO $\rightarrow$ USA via FEDEX. Forwarding AWB `TEST_FWD_7946123456`, Delivery AWB `TEST_DEL_998877`, Vendor Weight `2.000`. Save from Forwarding tab. Verify 3-way parity (Screen, DB, Proforma Invoice printout).
2. **F2 (Deferred Forwarding)**: Counter booking with Forwarding tab left completely blank. Verify clean save, null DB values, clean invoice printout without `undefined`.
3. **F3 (Post-Booking Assignment)**: Reopen booked shipment from F2. Add Forwarding AWB `TEST_FWD_DHL_445566`. Verify DB update, row version increment, and audit log recording old/new values.
4. **F4 (Vendor Charges Math & Persistence)**: Add vendor charge: `DEMAND SURCHARGE VENDOR` ₹350.00 with Fuel and GST. Verify live draft calculation, summary strip totals, persistence in `shipment_charge_snapshots` (`side = 'VENDOR'`), and addition to `vendor_charges_total`.
5. **F5 (Vendor Override)**: AWB tab booked with `DHL`. Forwarding tab overrides `Delivery Vendor` to `FEDEX`. Verify customer price unchanged, vendor cost recalculated using FedEx rate card, and DB stores both vendor codes.
6. **F6 (Lock Gate)**: Open locked AWB. Verify all inputs disabled (`pointer-events-none`). Verify server RPC rejects edit attempts. Test unlock with `txn.awb-unlock`.
7. **F7 (Duplicate Forwarding Block)**: Attempt to save a shipment with an existing `forwarding_awb` for the same vendor. Verify server blocks save with clear duplicate error message.
8. **F8 (Carrier Format Warning)**: Type 5-digit number for FedEx. Verify non-blocking format warning banner appears.
9. **F9 (Operator Mistakes)**: Empty description error, empty amount error, unmet booking prerequisites dialog.
10. **F10 (Search by Forwarding No)**: Search header using Forwarding No. Verify correct shipment retrieval.
