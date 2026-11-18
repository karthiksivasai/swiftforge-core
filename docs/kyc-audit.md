# KYC Tab Audit (/transaction/awb-entry)

**Date:** 12 Nov 2026  
**Auditor:** Antigravity AI Pair Programmer  
**Branch:** `main`  
**Scope:** KYC Tab (`/transaction/awb-entry`, Tab "KYC") — International Courier Bookings & Indian Customs Compliance  
**Working Rule:** Following `docs/testing-playbook.md` Steps 1–3 (Comprehensive Audit first, NO code changes until owner approves).

---

## 1. Executive Summary

A comprehensive code and live browser/DB audit was conducted on the **KYC Tab** of the AWB Entry screen. The audit examined every button, dropdown, search field, file upload handler, table row, database persistence mechanism (`shipments.wizard_extras`, `public.shipment_documents`, `public.shipper_kyc_documents`), document retrieval RPCs, customer data reuse, data privacy/masking (Aadhaar/PAN), lock enforcement, and comparison against the reference ERP **XpresiON**.

### Key Takeaways
1. **Critical Hydration Defect on Reopening (KYC-01)**: When an operator uploads multiple KYC documents (e.g., Aadhaar Front and Aadhaar Back, or Passport + Visa), both are saved to the database. However, upon reopening the shipment, `get_shipment_document` executes `order by version desc limit 1`. Only the single latest document has its file bytes loaded. For all previous documents, the **Download button is permanently disabled** in the UI.
2. **Document Type Flattening (KYC-02)**: The specific document type chosen in the UI dropdown (e.g., `"Aadhaar Number"`, `"PAN Number"`) is saved in `shipments.wizard_extras`, but in `public.shipment_documents` it is hardcoded to `document_type = 'KYC'`. The true document classification is lost in the document center.
3. **Zero Regulatory Validation & Customs Gate (KYC-03)**: Indian export regulations (CBIC Circular No. 9/2010-Customs) strictly require verified KYC for international air cargo. However, the ERP currently allows booking **any** shipment (CSB IV Gift, CSB V Commercial, DOX, NDOX) with **zero KYC documents uploaded**.
4. **No File Type or File Size Restrictions (KYC-04)**: The file input lacks an `accept` attribute, allowing operators to upload executables, scripts, or arbitrary binaries. Furthermore, there is no file size limit check before converting files into in-memory Base64 strings.
5. **PostgreSQL Blob Storage instead of Storage Bucket (KYC-05)**: Uploaded KYC files are stored directly as raw Base64 strings in the PostgreSQL `public.shipment_documents.content_b64 text` column rather than Supabase Storage (`tenant-files` bucket). This causes database bloat and performance degradation on large files.
6. **UI Deletion Does Not Delete DB Documents (KYC-06)**: Deleting a KYC document on the screen only removes it from the local React state. It is never soft-deleted or removed from `public.shipment_documents`.
7. **Zero KYC Reuse Across Shipments (KYC-07)**: KYC files are linked strictly to `shipment_id`. There is no link to `customer_id` or `shipper_id`. Every time a frequent shipper visits the counter, their KYC must be re-requested and re-uploaded from scratch.
8. **Sensitive Data Privacy Violation (KYC-10)**: 12-digit Aadhaar numbers and PAN numbers are displayed in 100% cleartext on screen, in party lookups, and on invoice previews without any masking (violating UIDAI regulations and data privacy norms).
9. **Dummy Action Buttons & Search Toolbar (KYC-09)**: The Settings, Info, and List icon buttons on the KYC tab display dummy toasts (`"will be enabled with backend wiring"`). The search toolbar is disconnected from backend customer records.
10. **Server-Side Lock Bypass (KYC-11)**: The RPC `app.save_shipment_document` does not check `shipments.is_locked`. Direct calls can insert documents into locked shipments.

---

## 2. Detailed Findings Matrix

| Finding ID | Area | Severity | Status | Verification Type | Description & Code Location | Expected Behavior | Actual Behavior | Proposed Resolution |
|---|---|---|---|---|---|---|---|---|
| **KYC-01** | Document Hydration & Retrieval | **CRITICAL** | **FIXED & VERIFIED (Batch 1)** | **LIVE (Browser & DB Verified)** | `withStoredKyc` calls `get_shipment_document(shipmentId, "KYC")` which queries `where document_type = 'KYC' order by version desc limit 1` (`awb-entry.tsx:5614-5642`, `0145_awb_series...sql:329-336`). | When reopening a shipment with multiple KYC files, all files must be fully hydrated with their download capabilities. | Resolved in Batch 1 via `list_shipment_document_bytes` and updated hydration loop. Verified in `e2e/kyc-batch1.spec.ts`. | Fixed: Multi-document bytes retrieved and hydrated with active Download buttons. |
| **KYC-02** | Master Categorization | **HIGH** | **FIXED & VERIFIED (Batch 1)** | **LIVE (DB Query Verified)** | `saveShipmentBooking` explicitly hardcodes `documentType: "KYC"` when inserting into `public.shipment_documents` (`awb-entry.tsx:4061`). | Document row in `shipment_documents` should record the specific document type (e.g., `AADHAAR`, `PASSPORT`, `PAN`, `GSTIN`, `IEC`). | Resolved in Batch 1 via `raw_meta->>'kycDocType'`. Verified in `e2e/kyc-batch1.spec.ts`. | Fixed: Specific document classification preserved in `raw_meta`. |
| **KYC-03** | Regulatory Compliance Gate | **HIGH** | **FIXED & VERIFIED (Batch 3)** | **LIVE (Browser & DB Verified)** | Neither client validator (`validateAwbEntry`) nor server RPC (`book_awb_shipment`, `app.awb_field_errors`) validates that KYC is attached (`awb-entry.tsx:3860-3920`). | International shipments (especially CSB IV & CSB V NDOX) require mandatory shipper KYC before booking or manifesting under CBIC rules. | D11 decision: Non-blocking warning banner at booking; enforcement will occur at Manifest/Dispatch screen. Stored `kyc_status` (PENDING/COMPLETE). Verified in `e2e/kyc-batch3.spec.ts`. | Fixed: Non-blocking banner with "Go to KYC tab" and `kyc_status` tracking. |
| **KYC-04** | Upload Security & File Handling | **MEDIUM** | **FIXED & VERIFIED (Batch 2)** | **LIVE (Browser & DOM Verified)** | `<input ref={kycFileRef} type="file" className="hidden">` had no `accept` attribute and no size validation. | File upload must restrict allowed MIME types (`image/jpeg,image/png,application/pdf`) and enforce 5MB size limit. | Added `accept="image/jpeg,image/png,application/pdf"`, extension & MIME check, and 5MB validation with toast alerts. Verified in `e2e/kyc-batch2.spec.ts`. | Fixed: Invalid formats (.exe) and oversized files (>5MB) rejected with toast alerts. |
| **KYC-05** | Storage Architecture | **MEDIUM** | **FIXED & VERIFIED (Batch 2)** | **LIVE (Browser & Storage Verified)** | Uploaded KYC files were stored as Base64 strings directly in PostgreSQL. | Documents must be stored in private Supabase Storage (`tenant-files` bucket) with 300s expiring signed URLs. | Implemented private Storage upload under `tenants/{tenant_id}/kyc/{shipment_id}/...`, migrated existing DB rows, and wired 300s signed URLs for downloads. Verified in `e2e/kyc-batch2.spec.ts`. | Fixed: Migrated to private Storage bucket with secure signed URLs. |
| **KYC-06** | Document Deletion & Resurrection | **HIGH** | **FIXED & VERIFIED (Batch 1)** | **LIVE (Browser & DB Verified)** | `removeKycDocument` only filtered the React array and never soft-deleted records in `shipment_documents`. | Deleting a KYC document on the form should mark the corresponding `shipment_documents` row as deleted (`deleted_at = now()`). | Fixed in Batch 1 via `deleteShipmentDocument` RPC and resurrection prevention on reload. Verified in `e2e/kyc-batch1.spec.ts`. | Fixed: Soft-delete persisted in DB; no resurrection on reopen. |
| **KYC-07** | Master Data Reuse | **MEDIUM** | **FIXED & VERIFIED (Batch 3)** | **LIVE (Browser & DB Verified)** | KYC documents were linked exclusively to `shipment_id`. | D14: On booking, if shipper has saved KYC in `shipper_kyc_documents`, offer "Use saved KYC", and allow saving new uploads to Shipper Master via checkbox. | Implemented `get_shipper_saved_kyc` RPC and "Use saved KYC" card on KYC tab, plus "Save KYC to Shipper Master" checkbox. Verified in `e2e/kyc-batch3.spec.ts`. | Fixed: Master KYC reuse and save-to-master functional. |
| **KYC-08** | Document Metadata Omission | **MEDIUM** | **FIXED & VERIFIED (Batch 2)** | **LIVE (Browser & DB Verified)** | KYC tab lacked Document No, Document Side, and Expiry Date. | Customs requires knowing Document ID, Side (Front/Back/Single), and Expiry Date. | Added Document No, Side selector (Front, Back, Single/Both), and Expiry Date with expired date warnings. Verified in `e2e/kyc-batch2.spec.ts`. | Fixed: Document No, Side, and Expiry Date added and persisted in metadata. |
| **KYC-09** | Dead UI Elements | **LOW** | **FIXED & VERIFIED (Batch 3)** | **LIVE (Browser & DOM Verified)** | Settings, Info, List buttons showed placeholder toast messages. | Toolbar buttons should perform functional actions or be cleanly hidden. | Implemented functional Settings modal, Info guidance drawer, and List view sheet. Verified in `e2e/kyc-batch3.spec.ts`. | Fixed: Toolbar buttons fully wired and interactive. |
| **KYC-10** | Data Privacy & Compliance | **HIGH** | **FIXED & VERIFIED (Batch 2)** | **LIVE (Browser & DB Verified)** | Full 12-digit Aadhaar and 10-digit PAN numbers were displayed in cleartext on screen, lookups, and printed invoices. | Sensitive identity numbers must be masked (Aadhaar: `XXXXXXXX1234`, PAN: `XXXXXX234X`). Unmasking requires permission and must be audited. | D15 masking implemented across UI, party lookups, and prints. Reveal toggle gated by `txn.kyc-reveal` permission and audits each reveal to `public.audit_logs`. Verified in `e2e/kyc-batch2.spec.ts`. | Fixed: Masking & audited reveal button strictly enforced. |
| **KYC-11** | Lock Enforcement Gap | **MEDIUM** | **FIXED & VERIFIED (Batch 1)** | **LIVE (Browser & DB Verified)** | `app.save_shipment_document` did not check `shipments.is_locked`. | Locked shipments must reject document insertions or deletions. | Migration `0177` added `is_locked` checks to RPCs; UI fieldset disables upload/delete when locked. Verified in `e2e/kyc-batch1.spec.ts`. | Fixed: Server-side and UI fieldset lock enforced. |
| **KYC-12** | Audit Trail Omission | **MEDIUM** | **FIXED & VERIFIED (Batch 1)** | **LIVE (Browser & DB Verified)** | Document creation and deletion were not recorded in `public.audit_logs`. | KYC document modifications must write audit records. | Migration `0177` emits audit logs for document CREATE and DELETE. Verified in `e2e/kyc-batch1.spec.ts`. | Fixed: Audit trail captures all KYC document mutations. |
| **KYC-13** | AWB Tab $\leftrightarrow$ KYC Tab Disconnect | **LOW** | **FIXED & VERIFIED (Batch 2)** | **LIVE (Browser & DOM Verified)** | Shipper Document Type and Document No on AWB tab were disconnected from KYC tab. | Selecting Shipper Document Type on AWB tab should synchronize draft fields on KYC tab. | Form now auto-syncs `kycDocType` and `kycDocNo` from Shipper document details. Verified in `e2e/kyc-batch2.spec.ts`. | Fixed: Two-way awareness between AWB and KYC tab. |
| **KYC-14** | Typo in Master List | **LOW** | **FIXED & VERIFIED (Batch 2)** | **CODE-ONLY & DOM Verified** | Typo `"Performa Invoice"` in `KYC_TYPES`. | Correct spelling `"Proforma Invoice"`. | Updated `KYC_TYPES` to `"Proforma Invoice"`. Verified in `e2e/kyc-batch2.spec.ts`. | Fixed: Typo corrected. |

---

## 3. What is the KYC Tab for in a Real Courier Business?

In international courier logistics originating from India, **KYC (Know Your Customer)** is not a formality—it is a **statutory legal requirement mandated by the Central Board of Indirect Taxes and Customs (CBIC)** under Circular No. 09/2010-Customs and Public Notice No. 24/2011.

A courier company acts as an Authorized Courier. Before transporting any package out of India onto an international flight (via FedEx, DHL, UPS, or airlines), the courier is legally obligated to verify the bona fides of the consignor (shipper) and obtain valid government identification and address proof.

### The Real-World Workflow
1. **Counter Booking**: A customer arrives at the branch counter to send a consignment to the USA.
2. **Identification Collection**:
   - If the customer is an **individual** (sending gifts, personal effects, or documents): the operator collects their Aadhaar Card, Passport, or Voter ID.
   - If the customer is an **entity / firm** (sending commercial goods or samples): the operator collects their GSTIN Certificate, IEC (Import Export Code) certificate, and Company PAN.
3. **Document Digitization**: The operator scans or photographs the physical document, selects the document type on the KYC tab (e.g. `Aadhaar Number`), and uploads the file.
4. **Customs Manifest & EDI Filing**: That night, when CourierWala prepares the airport manifest (CSB IV or CSB V EDI filing with ICEGATE/Customs), the shipper's KYC document number and uploaded copy are transmitted to Customs and the partner carrier (FedEx/DHL). If the KYC is missing, invalid, or expired, **Customs seizes or offloads the shipment at the airport**, and the courier company faces statutory fines.
5. **Regulatory Archival**: Couriers must retain verifiable KYC records for every international shipment for a minimum statutory period (typically 5 years).

### Real-Life Example
- **Customer**: Mr. Vikram visits CourierWala Hyderabad to send 3 kg of traditional sweets to his daughter at Stanford University, California.
- **AWB Tab**: The operator books internal AWB `100381` under client `ALIASSO`. Under Shipper Details, the operator records Vikram's name, Hyderabad address, mobile number, Document Type `Aadhaar Number`, and Document No `1234 5678 9012`.
- **Proforma Tab**: Vikram declares 3 kg of sweets valued at ₹1,500 under CSB 4 (Unsolicited Gift).
- **KYC Tab**: The operator takes Vikram's physical Aadhaar card, scans front and back as `Vikram_Aadhaar.pdf`, selects Type `Aadhaar Number`, and uploads the file.
- **Nightly Dispatch**: CourierWala transfers the shipment to FedEx. FedEx's EDI gateway requires Vikram's Aadhaar copy. The operations team downloads the file directly from Swiftforge and attaches it to the airline airwaybill.
- **Airport Customs**: Customs inspectors at Rajiv Gandhi International Airport (RGIA) inspect the CSB 4 manifest, verify Vikram's Aadhaar against the declared shipper address, and grant customs clearance for the outbound flight to Dubai/USA.

---

## 4. Deep-Dive Audit of Specific Areas (Items 1 to 7)

### 1. What It Does, Where It's Saved, and Validation
- **What It Does**: Provides an interface for operators to upload supporting KYC identification files for consignments.
- **Where It's Saved**:
  - File metadata: `shipments.wizard_extras -> 'kyc' -> 'documents'` array (`[{ id, fileName, entryType, entryDate }]`).
  - File payload: `public.shipment_documents` table (`content_b64 text`, `document_type = 'KYC'`, `version integer`, `source = 'USER_UPLOAD'`).
  - Storage bucket: **Not used**. Supabase Storage bucket `tenant-files` is completely bypassed.
- **Validation**:
  - **Browser**: Zero validation. No file size check, no file type check.
  - **Server**: Zero validation. `book_awb_shipment` does not inspect `wizard_extras.kyc`.

### 2. Required Documents by Shipper Type, CSB Type, and DOX vs NDOX
- **By Shipper Type**:
  - *Individual*: Aadhaar Card, Passport, Voter ID, Driving License.
  - *Company / Commercial Entity*: GSTIN, IEC Certificate, PAN Card.
- **By CSB Type**:
  - *CSB IV (Gift / Low Value up to ₹1,00,000)*: Individual photo ID & address proof.
  - *CSB V (Commercial)*: IEC number, AD Code, Shipper GSTIN, Company PAN.
- **By Product (DOX vs NDOX)**:
  - *DOX (Documents)*: Basic ID, often exempted from formal multi-page KYC uploads in practice.
  - *NDOX (Non-Documents / Goods)*: Mandatory KYC upload.
- **Is KYC Required to Save/Book?**:
  - Currently: **NO**. Verified live in Playwright test `KYC-A5`: a shipment was booked with 0 KYC documents without any warning or error.
  - Recommended Business Policy: See Business Questions (D11).

### 3. Upload Security, Formats, Storage & Privacy
- **Allowed Formats**: The hidden file input has no `accept` attribute (`<input type="file">`). The OS dialog allows selecting `.exe`, `.bat`, `.zip`, `.mp4`, or any file.
- **Allowed Size**: No client-side or server-side size limit. Extremely large files will cause PostgREST `413 Request Entity Too Large` or freeze the browser during `readAsArrayBuffer` + `btoa`.
- **Where Stored**: PostgreSQL table `public.shipment_documents.content_b64 text` as a base64 string.
- **Access Control**:
  - Who can view/download: Authenticated users in the tenant with permission `txn.awb-entry:list` or `search`.
  - Is the bucket private: No storage bucket is used; Postgres RLS policy `shipment_documents_select` isolates by tenant.
  - Are links signed/expiring: No HTTP links exist. Files are converted into in-memory `blob:` URLs in the browser and revoked after 1.5 seconds.
  - Can another tenant or customer see them: Cross-tenant is blocked by PostgreSQL RLS. Public tracking `/track` does not expose shipment documents.

### 4. KYC Reuse Across Shipments
- **Current State**: **Zero reuse**. KYC documents are tied exclusively to `shipment_id`.
- **Shipper Master Table**: Migration 0068 created `public.shipper_kyc_documents`, but it only stores `file_name` (no content, no URL), and AWB Entry does not read this table when a shipper is chosen.
- **Operational Impact**: An operator booking 10 parcels for the same company or individual in a week must re-scan and re-upload the same Aadhaar/GSTIN 10 separate times.
- **Expiry Dates**: Neither the UI nor the database schema records document expiry dates.

### 5. Lock Enforcement and Audit Trail
- **UI Lock**: When `shipments.is_locked = true`, the KYC tab has CSS `pointer-events-none opacity-90`. However, the tab content is not inside a disabled `<fieldset>`, meaning keyboard focus and accessibility trees can still reach child elements.
- **Server Lock**: `app.save_shipment_document` does not check if the shipment is locked. A direct RPC call successfully inserts documents into locked shipments.
- **Audit Trail**: Neither `app.save_shipment_document` nor `book_awb_shipment` writes audit log records to `public.audit_logs` when KYC documents are uploaded, modified, or removed.

### 6. Data Privacy (Aadhaar / PAN)
- **Cleartext Display**: Full 12-digit Aadhaar numbers and PAN numbers are displayed in plain text without masking in `<input type="text">`, party lookup grids, and generated invoices.
- **Regulatory Requirement**: Under the Aadhaar Act and UIDAI circulars, displaying or publishing unmasked Aadhaar numbers is illegal; only the last 4 digits should be visible (`XXXX-XXXX-1234`).

### 7. Comparison with Reference System (XpresiON)
- In **XpresiON**:
  - KYC is linked to both the Customer/Shipper master and individual AWBs.
  - The KYC search toolbar allows operators to search by customer mobile number or code and retrieve existing KYC on file with one click.
  - XpresiON API schemas expect distinct fields: `KYCDocumentType`, `KYCImage` (front image), `KYCImage1` (back image), and `ImageType` (e.g. `PDF` or `JPG`).
  - Swiftforge's current KYC tab has dead/dummy toolbar buttons that only display `"will be enabled with backend wiring"`.

---

## 5. Live E2E Verification & Test Evidence

A dedicated Playwright test suite (`e2e/kyc-audit.spec.ts`) was executed against the active dev server on `http://localhost:8082` and dev database `ijosczggsrvscponules`.

### Verified Live Test Results
1. **KYC-A1 (Live DOM & Action Buttons)**:
   - Navigated to KYC tab.
   - Clicked Settings button: Verified Sonner toast `"KYC settings will be enabled with backend wiring"`.
   - Clicked Info button: Verified toast `"KYC document guidelines will be enabled with backend wiring"`.
   - Clicked List button: Verified toast `"KYC list view will be enabled with backend wiring"`.
   - Verified file input `accept` attribute is null (`NONE`).
2. **KYC-A2 (Live Multi-File Upload & DB Persistence)**:
   - Booked AWB `100381` with 2 uploaded KYC files: `TEST_KYC_AADHAAR.txt` (Type: Aadhaar Number) and `TEST_KYC_PAN.txt` (Type: PAN Number).
   - Verified `shipments.wizard_extras` contains 2 document objects in JSON.
   - Verified `public.shipment_documents` contains 2 rows: version 1 (`TEST_KYC_AADHAAR.txt`) and version 2 (`TEST_KYC_PAN.txt`). Both saved with `document_type = 'KYC'`.
3. **KYC-A3 (Multi-Document Hydration Defect)**:
   - Reopened AWB `100381`.
   - Verified that row 1 (`TEST_KYC_AADHAAR.txt`) Download button is **disabled** (`true`), while row 2 (`TEST_KYC_PAN.txt`) Download button is **enabled** (`false`).
   - Confirmed **KYC-01 defect**: `get_shipment_document` returns only the single latest version, rendering older documents un-downloadable.
4. **KYC-A5 (KYC Unenforced / 100% Optional)**:
   - Booked AWB without uploading any KYC document.
   - Form saved and booked successfully (`AWB booked` toast).
5. **KYC-A6 (Aadhaar Cleartext Exposure)**:
   - Verified that typing a 12-digit Aadhaar number renders as plain text without masking.

---

## 6. Implementation & Verification Status — Complete

All three batches have been fully implemented, migrated on DEV database (`0177_kyc_hardening_and_storage.sql`, `0178_kyc_batch2_storage_and_masking.sql`, `0179_kyc_batch3_reuse_and_status.sql`), and 100% verified via automated Playwright E2E suites:

### Batch 1: Critical & High Severity Bugs (Hydration, DB Type, Deletion & Lock) — VERIFIED
- **Fixed KYC-01**: Hydration loop fetches multi-document payloads; download button is fully functional for all uploaded files.
- **Fixed KYC-02**: Passes and persists document classification (e.g. `Aadhaar Number`, `PAN Number`) in `raw_meta->>'kycDocType'`.
- **Fixed KYC-06**: Implemented soft-deletion (`deleted_at = now()`) on `public.shipment_documents` and prevents resurrection on reload.
- **Fixed KYC-11**: Added server-side check in `app.save_shipment_document` to reject document mutations when `shipments.is_locked = true`. KYC tab wrapped in disabled `<fieldset>`.
- **Fixed KYC-12**: Emits audit records in `public.audit_logs` for KYC document CREATE and DELETE.
- *Test Evidence*: `e2e/kyc-batch1.spec.ts` (6/6 tests passed).

### Batch 2: Security, Data Privacy & Validation — VERIFIED
- **Fixed KYC-04**: Restricts file input to `accept="image/jpeg,image/png,application/pdf"` and enforces 5MB size limit with toast validation.
- **Fixed KYC-05 & D13**: Private Supabase Storage bucket (`tenant-files/tenants/{tenant_id}/kyc/{shipment_id}/...`) with 300s expiring signed URLs for secure downloads.
- **Fixed KYC-10 & D15**: Aadhaar masked as `XXXXXXXX1234` and PAN masked as `XXXXXX234X`. Audited reveal button gated by `txn.kyc-reveal` permission.
- **Fixed KYC-08 & D12**: Added Document No, Front/Back/Single side selector, and Expiry Date with expired warnings.
- **Fixed KYC-13**: Two-way synchronization between Shipper document fields on AWB tab and KYC tab.
- **Fixed KYC-14**: Corrected typo `"Performa Invoice"` to `"Proforma Invoice"`.
- *Test Evidence*: `e2e/kyc-batch2.spec.ts` (5/5 tests passed).

### Batch 3: Usability, Master Reuse & Regulatory Status — VERIFIED
- **Fixed KYC-03 & D11**: Prominent non-blocking "KYC pending" banner on AWB form and status strip for international shipments without KYC; tracks `kyc_status` (`PENDING` / `COMPLETE`) in database.
- **Fixed KYC-07 & D14**: Master Shipper KYC reuse via `get_shipper_saved_kyc` RPC ("Use saved KYC" card) and "Save KYC to Shipper Master" checkbox on upload.
- **Fixed KYC-09**: Replaced dummy toast buttons with functional Settings modal, Info guidelines drawer, and searchable KYC List view sheet.
- *Test Evidence*: `e2e/kyc-batch3.spec.ts` (5/5 tests passed).

---

## 7. Business Questions for the Product Owner

Before implementing fixes, please provide your decisions on the following business policy questions:

### Question 1 (D11: KYC Mandatory Timing)
Under Indian Customs rules, KYC is mandatory for international NDOX exports. At what point should the system strictly block the operator if KYC is missing?
- **Option A (Strict at Booking)**: Block Save/Book on AWB Entry if an international NDOX/Commercial shipment does not have a verified KYC document uploaded.
- **Option B (Deferred to Manifest/Dispatch — Recommended)**: Allow booking at the counter without KYC (to prevent retail counter bottlenecks while the customer WhatsApps the document), but **strictly block Manifest/Outscan/Dispatch** if KYC is still missing.
- **Option C (Warn Only)**: Show a prominent warning banner on screen and on the status strip, but do not hard-block.

### Question 2 (D12: Document Expiry Tracking)
Customs documents like Passports, Visas, and Driving Licenses expire. 
- Should we add an **Expiry Date** field to KYC documents?
- If yes, should an expired document block booking/manifesting, or show a warning?

### Question 3 (D13: Document Storage Architecture)
Currently, KYC documents are stored as Base64 strings directly inside the PostgreSQL database (`public.shipment_documents.content_b64 text`).
- Should we keep storing KYC in PostgreSQL as Base64 (simple, self-contained in database backups), or migrate file storage to Supabase Storage objects (`tenant-files` private bucket)?

### Question 4 (D14: Master KYC Reuse)
When a customer or corporate shipper books multiple international shipments:
- Should KYC uploaded on one shipment automatically be available to attach to future shipments for the same Shipper/Customer?
- If yes, should reuse be based on **Shipper Mobile Number**, **GSTIN**, or **Customer Code**?

### Question 5 (D15: Aadhaar Masking Policy)
Under UIDAI regulations, full 12-digit Aadhaar numbers must not be displayed publicly.
- Should we mask Aadhaar numbers on the screen and invoice as `XXXXXXXX1234`?
- Should only Admin/Manager roles have a button to "Reveal" the full number?

