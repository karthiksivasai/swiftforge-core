> **MAINTENANCE RULE:** After completing ANY task, update this file before finishing. Update the relevant Module Status row, add/adjust migrations, move items out of "Open Decisions" when resolved, refresh "Next Steps", and bump the "Last updated" date at the top. This file is the single source of truth for context handoff between AI assistants — keep it accurate.

---

# SwiftForge CMS — Project Context

**Last updated:** 2026-08-10  
**Project:** swiftforge-core (Courier Management System)  
**Reference system:** Xpresion — https://xpresion.courierwalaexpress.in  
**Repo root:** `/Users/karthikkukkala/Desktop/Courier Management System/swiftforge-core`

---

## 1. Project Overview

SwiftForge is a **multi-tenant enterprise Courier Management System** being built to match (and eventually exceed) the reference system "Xpresion". All UI flows are validated against live Xpresion screens before build starts.

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 19 + TypeScript |
| Routing | TanStack Router v1 (`@tanstack/react-router`) |
| Data fetching | TanStack Query v5 |
| UI components | Radix UI primitives + Tailwind CSS v4 |
| Forms | React Hook Form + Zod |
| Backend / DB | Supabase (Postgres + Row Level Security + Edge Functions) |
| API layer | Supabase RPC functions (PL/pgSQL, `security definer`) |
| Build tool | Vite + TanStack Start |
| Notifications | Sonner (toasts) |
| Supabase client | `@supabase/supabase-js` v2 |

### Supabase import path (critical)
Always import Supabase client from:
```ts
import { supabase } from "@/integrations/supabase/client";
```
There is **no** `@/lib/supabase`. Using the wrong path causes a silent runtime crash.

---

## 2. Transaction (Courier) Lifecycle

```
Pickup → Pickup Inscan → AWB Entry → Manifest → DRS → Delivery
```

| Step | System term | Shipment status after |
|---|---|---|
| Pickup request created | `create_pickup` | `OPEN` |
| FE collects parcel | `pass_pickup` / pickup complete | `PICKED` / `ASSIGNED` |
| Hub receives parcel | `record_pickup_inscan` | `PICKUP_INSCANNED` |
| Booking + pricing | `confirm_booking` | `BOOKED` |
| Added to manifest | `sync_manifest_lines` | `MANIFESTED` |
| Dispatched on DRS | DRS creation | `DISPATCHED` / `IN_TRANSIT` |
| Delivered | POD entry | `DELIVERED` |

The state machine is enforced by `app.assert_status_transition()` (defined in `0030_transaction_core.sql`). **Never remove or alter existing edges**; only add new transitions via new migrations.

---

## 3. Module Status

| Module | Status | UI Route | Key Source Files | Key Migrations |
|---|---|---|---|---|
| **Pickup** | ✅ DONE & verified | `transaction.pickup.tsx` (2,339 lines) | `src/lib/transactions/resources/pickups.ts`, `pickupUiMap.ts` | `0031_pickup.sql`, `0099_pickup_cancel_type.sql` |
| **Pickup Inscan** | ✅ DONE & verified | `transaction.pickup-inscan.tsx` (1,178 lines) | `src/lib/transactions/resources/pickupInscan.ts` | `0100_pickup_inscan.sql`, `0101_inscan_downstream_gating.sql` |
| **AWB Entry** | ⚠️ IN PROGRESS — P1 gaps done, P2 pending | `transaction.awb-entry.tsx` (6,814 lines) | `src/lib/transactions/resources/shipments.ts`, `shipmentUiMap.ts`, `ratingUiMap.ts`, `idValidators.ts` | `0032–0033`, `0076–0088`, `0102–0104` |
| **Manifest** | 🟡 PARTIAL — routes exist, not fully validated | `transaction.manifest-scan.tsx` (1,852), `transaction.manifest-in-scan.tsx` (936), `transaction.manifest-view.tsx` | `src/lib/transactions/resources/manifests.ts`, `manifestUiMap.ts` | `0034_manifest_foundation.sql`, `0035_manifest_inscan.sql` |
| **Bagging** | 🟡 PARTIAL — route exists, scope unclear | `transaction.bagging.tsx` (2,143 lines) | — | — |
| **DRS** | 🟡 PARTIAL — route exists, not validated | `transaction.drs-scan.tsx` (1,677 lines) | `src/lib/transactions/resources/drs.ts`, `drsUiMap.ts` | `0036_drs_foundation.sql`, `0037_drs_completion.sql` |
| **POD / Delivery** | 🔴 NOT STARTED (UI) | — | `src/lib/transactions/resources/pod.ts` | `0038_pod_foundation.sql` |
| **Tracking / AWB Query** | 🟡 PARTIAL | `transaction.tracking.*.tsx` (multiple) | `src/lib/transactions/resources/tracking.ts`, `trackingUiMap.ts` | `0039_tracking_foundation.sql` |
| **Finance / Receipts** | 🟡 PARTIAL | `transaction.receipt.*.tsx` | `src/lib/transactions/resources/finance.ts` | `0040_finance_foundation.sql` |
| **Rating Engine** | ✅ DONE (backend) | used in AWB Entry | `ratingUiMap.ts` | `0041_rating_engine.sql` |
| **Reports** | 🟡 PARTIAL | `reports.*.tsx` | — | `0042–0048` |
| **Masters** | ✅ DONE (most) | `master.*.tsx` | various | `0014–0029` |
| **DTDC Carrier API** | ⚠️ IN PROGRESS — dry-run verified, live blocked on tokens | AWB Entry → vendor-shipping-panel | See §5 below | `0056`, `0077`, `0105` |

---

## 4. Key Architecture & Conventions

All new code **must** follow these patterns. Deviating breaks audit trails and security.

### 4.1 Document Number Allocation
```sql
-- Always use this RPC — never generate numbers client-side
SELECT app.allocate_document_no(tenant_id, 'AWB', branch_id, fiscal_year);
```
Defined in: `0030_transaction_core.sql` line 150.

### 4.2 Strict Master Lookup Resolution
- All master references (vendor, destination, product, customer, etc.) are a `LookupPair { id, code, name }`.
- **Rule:** Save is blocked if `id` is null / unresolved. Free-typed codes are never persisted.
- UI helper: `resolveMasterLookup` + `LookupPairInput` component.
- Enforced on: all dropdowns in Pickup, Pickup Inscan, AWB Entry.

### 4.3 Branch Default
```ts
const { profile } = useAuth();
// profile.branchCode / profile.home_branch_id — use for default origin/branch
```

### 4.4 Append-Only Audit
Every state change writes two records:
1. `app.write_audit_log(tenant, table, action, row_id, module, old_data, new_data)` — for data changes.
2. `app.append_tracking_event(tenant, shipment_id, message, detail, event_type, meta, branch_id)` — for operational events.

Never `UPDATE` event/audit tables. All logs are append-only.

### 4.5 Shipment State Machine
- Source: `0030_transaction_core.sql` — `app.status_transitions` table.
- Guard: `app.assert_status_transition(entity_kind, from_status, to_status)` — raises exception on illegal moves.
- Entity kinds: `'SHIPMENT'`, `'PICKUP'`, `'MANIFEST'`, `'DRS'`.
- **Rule:** Never delete or alter existing transitions. Only INSERT new edges in new migrations.

### 4.6 Migration Naming Convention
```
<number>_<descriptive_name_covering_all_features_in_the_file>.sql
```
- One logical change per migration file.
- Name must accurately describe ALL features in the file (not just the first).
- Current highest: `0105_dtdc_postshipping_carrier_integration.sql`.
- Next available: `0106_...`.

### 4.7 RLS & Security Pattern
- All RPCs: `SECURITY DEFINER`, `SET search_path = public, app`.
- Tenant isolation: `app.user_tenant_ids()` — never trust client-passed tenant IDs.
- Permission check: `app.user_has_permission(tenant, 'module.slug', 'action')`.
- Platform admin bypass: `app.is_platform_admin()`.

### 4.8 Row Versioning / Optimistic Lock
All mutable tables have `row_version integer NOT NULL DEFAULT 1`. Save RPCs accept `p_row_version` and raise `'CMS04'` on mismatch. Always pass current `row_version` from UI state.

### 4.9 Deleted-At Soft Delete
All tables use `deleted_at timestamptz` for soft deletes. All queries filter `WHERE deleted_at IS NULL`.

---

## 5. DTDC / PostShipping Carrier API Integration

### Overview
DTDC Australia/NZ uses the PostShipping API. This integration allows AWB Entry to submit shipments to DTDC for carrier booking, tracking number allocation, and label generation.

### Endpoint
```
POST https://api.postshipping.com/api2/shipments
Docs: https://doc.postshipping.com
```

### Authentication (Two layers — BOTH required)

| Layer | Where | Value |
|---|---|---|
| `Token` HTTP header | Per-station | The station's API key (server-side only, never in browser) |
| `ThirdPartyToken` JSON body field | Per-service-code | Looked up from `vendor_service_tokens` table |

### Station Keys (stored in `vendors.station_api_key`)

| Station | Vendor code | API Key |
|---|---|---|
| Sydney | `DTDCSYD` | `9BB3A5A25465316D92A653C87DEFBB84` |
| Melbourne | `DTDCMEL` / `DTAU` | `5535E00AF881A2D1212AA1A27574E499` |
| Perth | `DTDCPER` | `7FC6394D58FC5C7AA12196D95BDF9606` |
| New Zealand | `DTDCNZ` / `DTNZ` | `36FA600E65426DDAF314A836402AEA59` |

> 📌 **Note on DTDC New Zealand (`DTNZ`) Services:**
> The reference site's exact 4 DTNZ services are `AKL`, `ARAMEX`, `OTHERS`, and `REST`. Each is mapped to PostShipping token `C3696FC326DD16064E2F9B2A1534B120` with `carrier_service_code: NZATL`. Note that the regional descriptions (e.g. Auckland/Rest/Rural) are our internal inference, not a DTDC-confirmed technical specification.

### Vendor-Keyed Behavior
- API fires **ONLY** when selected vendor is a DTDC station (DTDCSYD / DTDCMEL / DTDCPER / DTDCNZ).
- Station key and endpoint are determined by which DTDC vendor is selected.
- All other vendors → internal-only, no external API call.

### Request Body Structure
```json
[
  {
    "Pending": true,
    "ConsignmentNumber": "<awb_no>",
    "ServiceTypeName": "<service_code>",
    "ThirdPartyToken": "<per_service_token>",
    "SenderDetails": { ... },
    "ReceiverDetails": { ... },
    "PackageDetails": {
      "ShipmentResponseItem": [{ "Pieces": [ ... ] }]
    }
  }
]
```
Body is always an array. `"Pending": true` is required per DTDC spec.

### Dry-Run / Live Mode
| Mode | Behavior | Controlled by |
|---|---|---|
| **DRY-RUN** (default) | Builds exact payload + stores it — **no HTTP POST** | `vendors.is_live_mode = false` |
| **LIVE** | Real POST to PostShipping — deducts from prepaid wallet | `vendors.is_live_mode = true` |

> ⚠️ **Never set `is_live_mode = true` without verifying the full service-token mapping is loaded and wallet balance is sufficient.**

### Key Files

| File | Purpose |
|---|---|
| `supabase/migrations/0105_dtdc_postshipping_carrier_integration.sql` | Vendor master columns, `vendor_service_tokens` table, station seed data, `get_vendor_carrier_config` RPC, updated `get_vendor_shipping_context` |
| `src/lib/integrations/vendor-shipping/adapters/postshipping/types.ts` | TypeScript types for PostShipping API |
| `src/lib/integrations/vendor-shipping/adapters/postshipping/mapper.ts` | `buildPostShippingPayload()` — maps shipment context to PostShipping body |
| `src/lib/integrations/vendor-shipping/adapters/postshipping/adapter.ts` | `PostShippingAdapter` — dry-run / live routing |
| `src/lib/integrations/vendor-shipping/registry.ts` | Routes DTDC* provider codes → `PostShippingAdapter` |
| `src/lib/integrations/vendor-shipping/client.ts` | `startVendorBooking`, `verifyVendorOtp`, `retryVendorBooking` |
| `src/components/transactions/vendor-shipping-panel.tsx` | `VendorBookingStatusStrip`, `DtdcDryRunPreviewCard`, `VendorOtpDialog` |

### Scaffold (pre-existing, extended — do not replace)

| File | Role |
|---|---|
| `0056_carrier_booking_tracking.sql` | `carrier_booking_status`, `carrier_tracking_no` columns on `shipments` |
| `0077_vendor_shipping_api.sql` | `vendor_integrations` table, `get_vendor_shipping_context` RPC (updated in 0105) |

### ⚠️ BLOCKER: Service-Token Mapping Incomplete
The `vendor_service_tokens` table maps `service_code → third_party_token`. Only one example is seeded:
- `NPU25KG` → `240035141E2A4F64443309F5B72983F7` (test/sample value from Kegan's email)

The full mapping (Kegan's attachment) has NOT been received. Live calls for any other service code will fail with:
> *"Live booking blocked: ThirdPartyToken is not configured for service code X"*

Dry-run previews still work for all service codes (token is flagged missing in the preview).

---

## 6. AWB Entry — Validation Results & Gap Status

### Phase 1 (P1) Gaps — All Completed ✅

| Item | What | Migration |
|---|---|---|
| Auto/Manual AWB toggle (#1, #2) | `branch_awb_allotments` table, `validate_manual_awb` RPC, Alt+~ shortcut, stock quota guard | `0102` |
| IEC compliance gate (#35) | `app.validate_shipment_for_booking` — 10-char IEC required for CSB-V / commercial export | `0103` |
| ID format validators (#45) | `idValidators.ts` — PAN, GSTIN, Aadhaar, IEC regex; inline `onBlur` errors | — (client only) |
| International KYC manifest gate (#47) | `app.sync_manifest_lines` — international shipments need KYC before manifesting | `0104` |

### Phase 2 (P2) — Deferred / Not Started

| Item | Description | Priority |
|---|---|---|
| Buyer Details accordion | Extra party section in Proforma tab | Medium |
| MTS piece import | "Import MTS" button wired to backend (stub exists at AWB entry line 4035) | Medium |
| Vendor weight alert | Warn when entered weight differs from vendor's weight | Low |
| Rate-mode radio buttons | Switch between rate calculation modes in UI | Low |

---

## 7. Open Decisions / Deferred Items

| Item | Why deferred | Owner |
|---|---|---|
| Past-date guard on Pickup | Inferred from reference site behaviour — business rule not page-confirmed | Product |
| Credit / To-Pay payment rule | Inferred — needs business decision on exact validation logic | Product |
| AWB P2 polish items | Lower priority than carrier integration and Manifest | Dev |
| DTDC live calls | Blocked on full service-token mapping + wallet-safe test window | Kegan / Dev |
| Full Manifest module validation | Not yet run against reference Xpresion Manifest screen | Dev |
| DRS full validation | Not yet run against reference Xpresion DRS screen | Dev |
| POD / Delivery module | Not started | Dev |

> **Convention:** Items marked "inferred from reference" are based on observed Xpresion UI behaviour, not explicit spec. Business confirmation required before treating them as hard requirements.

---

## 8. Working Method

Every module follows this cycle:

1. **Validate** — AI reads the reference Xpresion page and audits the actual codebase. Per item: `✅ Present / ⚠️ Partial / ❌ Missing`. Evidence is `file:line`.
2. **Fix** — Phased build prompt fixes gaps in priority order (P1 = correctness/compliance blockers first).
3. **Re-check** — Validation prompt re-runs to confirm gaps are closed end-to-end (UI → resource → RPC → DB).

**"Expected business logic"** items = conventions inferred from Xpresion UI observation. These are flagged explicitly and may differ from undocumented internal Xpresion rules. Business confirmation always preferred.

### Key Build Prompts Pattern
```
# BUILD PROMPT — <Module>
## Context  (what exists, what patterns to reuse)
## Rules    (what NOT to touch; migration naming; show diff before continuing)
## Items    (numbered P1 gaps with exact spec)
```

### AI Handoff Pattern
When switching AI assistants or models: point them to this file first. The assistant should read §3 (Module Status), §4 (Conventions), and the relevant section for the current workstream before writing any code.

---

## 9. Next Steps

Priority order:

1. **[Blocked] DTDC service-token mapping** — Obtain Kegan's full `service_code → ThirdPartyToken` spreadsheet. Insert rows into `vendor_service_tokens`. Unblocks live DTDC booking.

2. **[Ready] Apply migration `0105`** — Run on staging Supabase instance and smoke-test dry-run booking with a DTDC MEL vendor to verify the payload preview appears in the Vendor Booking strip.

3. **[Next module] Manifest module validation** — Run validation prompt against Xpresion Manifest screen. Expected gaps: bulk scan UI, manifest lock state, print sheet, driver assignment.

4. **[Then] DRS validation** — Same pattern against Xpresion DRS screen.

5. **[Low] AWB P2 polish** — Buyer Details accordion, MTS import, vendor weight alert, rate-mode radios.

6. **[Future] POD / Delivery module** — Not started. Foundation migration `0038` exists.

---

## 10. Changelog

| Date | Change |
|---|---|
| 2026-08-10 | Initial `context.md` created. Pickup ✅, Pickup Inscan ✅, AWB P1 ✅ confirmed. DTDC dry-run integration complete (migration 0105, PostShipping adapter, vendor-shipping-panel dry-run preview). |
| 2026-08-11 | DTDC critical fixes: (1) `WeightMeasurement: "Kgs"` added to types + mapper; (2) missing `GRANT EXECUTE` on `get_vendor_carrier_config` RPC added to 0105; (3) OTP guard hardened — `requires_otp !== false` check added in `startVendorBooking` edge-function path; (4) 33/33 mapper unit tests passing (`scripts/test-postshipping-mapper.mjs`). Live guard confirmed airtight. |
