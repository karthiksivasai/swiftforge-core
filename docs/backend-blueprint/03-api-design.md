# Backend Blueprint — Part 3: Complete REST API Design

## 1. Conventions (apply to every endpoint)

- Base: `https://{tenant}.app.com/api/v1` — JSON; Bearer access token; version in path.
- **List endpoints** uniformly support the frontend's table UX:
  `GET /resource?search=&filter[column]=&sort=col:asc&page=1&pageSize=25&status=ACTIVE`
  - `search`: case-insensitive across the columns the UI's global search covers
  - `filter[col]`: per-column substring/eq filters (whitelisted per resource)
  - Response envelope: `{ data: [...], page, pageSize, total, totalPages }`
- **Mutations:** `POST` create, `PUT /:id` full update (carries `rowVersion`), `DELETE /:id`
  soft delete. 409 on version conflict; 422 with `{ errors: [{field, code, message}] }`.
- **Bulk:** `POST /resource/bulk-delete { ids }`, `POST /resource/import` (multipart or fileId),
  `GET /resource/export?format=csv&{same filters}` → file or async job when > threshold.
- **Errors:** RFC-7807-style `{ type, title, status, detail, requestId }`; 401/403 (with missing
  permission slug), 404 (tenant-scoped), 409, 422, 429.
- **Auth/authz per route:** every route annotated with `permission_module` slug + action;
  list→`can_list`, search/export→`can_search`, create→`can_add`, update→`can_modify`,
  delete→`can_delete`.
- **Idempotency:** `Idempotency-Key` header honored on scan and financial POSTs.

## 2. Auth & identity

- `POST /auth/login` `{ username, password }` → `{ accessToken, refreshToken, user, tenant }`
- `POST /auth/otp/request` `{ username }` / `POST /auth/otp/verify` `{ username, otp }`
- `POST /auth/refresh`, `POST /auth/logout`
- `GET /me` (profile + flags), `PATCH /me/preferences`, `POST /me/change-password`
- `GET /me/permissions` (effective matrix), `GET /me/navigation` (filtered nav tree)
- Sessions (admin): `GET /sessions?active=true`, `DELETE /sessions/:id` (force logoff)

## 3. Users & RBAC

- `GET|POST /users`, `GET|PUT|DELETE /users/:id`, `POST /users/:id/reset-password`
- `GET|POST /groups`, `PUT|DELETE /groups/:id`
- `GET /permission-modules` (catalog, grouped by section)
- `GET /groups/:id/permissions` / `PUT /groups/:id/permissions` `{ grants: [{moduleId, allAccess, add, modify, delete, list, search}] }` (bulk upsert per section supported via `?section=`)

## 4. Lookups (shared)

- `GET /lookups/:key?q=&limit=50` → `[{ code, name, hint? }]`
  keys: `state, service-centre, product, sales-executive, industry, country, destination, zone,
  pin-code, vendor, contract-head, ledger-head, area, field-executive, contact-type, customer,
  shipper, exception, payment-type, obc, service-type` — server-side search mandatory
  (branches/destinations/pincodes are large).
- `GET /serviceability?pincode=` | `?name=` → serviceable/pickup/ODA/vendor/branch details.

## 5. Master APIs (uniform CRUD per §1, distinct schemas)

- Sales: `/masters/zones`, `/masters/states`, `/masters/countries`, `/masters/destinations`
  (+`bulk-delete`), `/masters/service-centres` (nested: terms, bank, voucher counters),
  `/masters/sales-executives`, `/masters/industries`, `/masters/flights`, `/masters/product-types`,
  `/masters/products`, `/masters/contents`, `/masters/instructions`, `/masters/charge-definitions`,
  `/masters/banks`, `/masters/local-branch` (singleton: `GET`, `PUT`; `/financial-years` child CRUD)
- Customer: `/masters/customers` (aggregate create/update with nested sections; children as
  sub-resources: `/customers/:id/fuel-surcharges`, `/other-charges`, `/volumetrics`,
  `/kyc-documents`, `/addresses`), `/masters/customer-rates`, `/masters/consignees`,
  `/masters/shippers`, `/masters/expense-heads`
- Vendor: `/masters/vendors` (+`POST /vendors/copy-zones { fromVendorId, toVendorId }`,
  `POST /vendors/:id/rate-file`), `/masters/vendor-contracts`
  (`GET` requires filters — search-gated; `POST /vendor-contracts/increase-rate
  { filters, mode: AMOUNT|PERCENT, value, roundOff }`)
- Operation: `/masters/pincodes`, `/masters/areas`, `/masters/exceptions`, `/masters/airlines`,
  `/masters/field-executives`, `/masters/service-mappings`, `/masters/country-pincodes`

Example — create customer rate:

```json
POST /api/v1/masters/customer-rates
{
  "customerId": "…", "productId": "…", "service": "EXPRESS",
  "originDestinationId": null, "destinationId": "…", "zoneId": null,
  "fromDate": "2026-07-01", "toDate": "2026-12-31",
  "minWeight": 0.5, "ratePerKg": 45.0, "fuelPct": 12.5, "otherCharges": 0, "status": "ACTIVE"
}
→ 201 { "data": { "id": "…", "rowVersion": 1, … } }
Business rules: fromDate ≤ toDate; no overlapping ACTIVE rate for same
(customer, product, service, lane) — 422 RATE_OVERLAP.
```

## 6. Transaction APIs

### Booking & first mile

- `GET|POST /pickups`, `PUT|DELETE /pickups/:id`
  - `GET /pickups/register?from=&to=&type=ALL|ASSIGNED_NOT_PICKED|NOT_ASSIGNED|PENDING&...`
  - `POST /pickups/sheet { date, areaId?, fieldExecutiveId? }` → PDF job
  - `POST /pickups/transfer { date, fromFeId, toFeId }`
  - `POST /pickups/:id/cancel`, `POST /pickups/:id/confirm`
- `POST /scans/pickup-inscan` `{ awbNo, scanDate, scanTime, branchId, fieldExecutiveId?, pickupNo?, hold?, holdRemarks? }`
  — validates AWB exists or creates stub per tenant setting; idempotent per (awbNo, scanType, date)
- `GET|POST /shipments` (AWB Entry; nested pieces, charges, proforma, forwarding, kyc)
  - `GET /shipments/:id` (full aggregate), `PUT /shipments/:id` (permission-guarded fields)
  - `GET /shipments?awbNo=|forwardingNo=|deliveryNo=|referenceNo=` (search-by variants)
  - `POST /shipments/validate-awb { awbNo }` → availability/duplicate check
  - Business rules: duplicate AWB 422; consignee/airline requiredness per form-setup flags;
    charge/vol-weight computation server-side authoritative; booking on locked date rejected
    (entry_lock_date) unless user has backdating right for AWB Entry.

### Linehaul

- `GET|POST /manifests` (kind=OUTBOUND|BAGGING|OBC), `PUT /manifests/:id`, `POST /manifests/:id/close`
  - `POST /manifests/:id/lines { awbNo, bagNo?, crnMhbsNo?, forwardingNo? }` → 422 DUPLICATE_SCAN if AWB already on an open manifest
  - `DELETE /manifests/:id/lines/:lineId`
  - `POST /manifests/generate { filters, awbIds }` (build from search)
  - `GET /manifests/:id/print?format=SINGLE|MULTI`, `POST /manifests/:id/crn-label {…}`,
    `POST /manifests/:id/email`, `GET /manifests/:id/edi?type=CSB3|CSB4|CSB5`
  - `POST /manifests/:id/progress { bagNo?, date, time, branchId, exceptionId }` (+ delete)
- `POST /manifest-inscans` `{ mode: BAG|AWB, manifestNo, bagNo?, awbNo, weight?, dims?, remark?, useBookingWeight? }`
  - `GET /manifest-inscans?from=&to=&manifestNo=&variance=ALL|SHORT|EXCESS`
- `POST /transfer-runs` `{ mode: TRANSFER|OFFLOAD, sourceManifestNo, destManifestNo?, keepOriginalBagNo? }`
- `GET|POST /obc-entries`, `PUT /obc-entries/:id`, `POST /obc-entries/:id/lock|unlock`,
  charges + manifest-link sub-resources, `GET /obc-entries/:id/eway-print`

### Delivery

- `GET|POST /drs`, `PUT /drs/:id`, `POST /drs/:id/lines { awbNo }` (422 DUPLICATE_SCAN;
  response includes auto-populated shipment snapshot), `DELETE /drs/:id/lines/:lineId`,
  `POST /drs/:id/dispatch`, `GET /drs/:id/print`
- `POST /scans/undelivered` / `POST /scans/missroute` `{ awbNo, scanDate, scanTime, branchId }`
  → appends fixed tracking event
- `POST /pods/import` (Excel: AWB, POD date, receiver, remark, status) → import job
- `POST /pods/query { awbNos: [...] }` → status list (bulk view tab)

### Tracking

- `GET /tracking/awb/:awbNo` → shipment 360 (all 9 sub-grids)
- `POST /tracking/query { ...30 filter fields }` → paged results (16 columns)
- `PUT /tracking/forwarding/:awbNo` `{ vendorId, service, forwardingAwb, deliveryVendorId?, deliveryService?, deliveryAwb? }` (+ bulk import)
- `POST /tracking/progress { awbNo, date, time, exceptionId, branchId, remark?, allowIfDelivered? }`
  — rejecting events on delivered shipments unless permission slug allows
- `POST /tracking/comments { awbNo, date, time, comment, fileId? }`
- `POST /tracking/hold { awbNo, action: HOLD|RELEASE, remark, shipperEmail?, sendMail }`
- `POST /tracking/entry-lock { from, to, action: LOCK|UNLOCK, customerId?, paymentType?, branchId?, productScope? }`
- KYC: `GET /kyc/:ownerType/:ownerId/documents`, `POST … /documents`, `DELETE /kyc/documents/:id`
- Public (unauthenticated, rate-limited): `GET /public/track/:awbNo` → sanitized timeline

### Finance

- `GET|POST /receipts`, `PUT|DELETE /receipts/:id`, `POST /receipts/:id/allocations`
- `GET|POST /expenses`, `PUT /expenses/:id` (blocked once authorized),
  `POST /expenses/:id/authorize` / `reject` (maker ≠ checker)
- `GET|POST /debit-notes`, `/credit-notes` (+lines), `POST /…/:id/irn` (generate),
  `POST /…/:id/cancel-irn` (permission-gated), `GET /…?registerType=&irnStatus=`
- `GET|POST /customer-payments`, `POST /customer-payments/:id/approve|reject`
- Invoicing (implied module): `POST /invoices/generate { customerId|filters, period }`,
  `POST /invoices/:id/finalise`, `POST /invoices/:id/lock|unlock`, `POST /invoices/:id/irn`,
  `POST /invoices/:id/cancel`, `GET /invoices/:id/print`
- `GET /ledger/:customerId?from=&to=&type=DEBIT|CREDIT&unbilled=` (statements/AR source)

### Rate tools

- `POST /rates/compare { side: CUSTOMER|VENDOR, mode: DOMESTIC|INTERNATIONAL, customerId?, originId?, destinationId?, pincodes?, productId?, service?, weight, volWeight?, pieces? }`
  → `[{ tariff|vendor, product, service, baseRate, fuel, other, total }]`
- `POST /rate-jobs/update { updateType: AWB_RATE|VENDOR_RATE|TAX_FUEL|OBC_RATE, filters, queue: true }`
- `POST /rate-jobs/import` (customer/vendor formats), `POST /zone-mappings/import|export`, CRUD `/zone-mappings`

## 7. Reports

- `GET /reports` → catalog (per hub, filtered by permissions)
- `POST /reports/:hub/:reportKey/run { filters, output: JSON|CSV|XLSX|PDF|LABEL|EDI, queue?: bool }`
  - sync (small) → `{ data, columns }`; queued → `{ jobId }`
  - server validates the 31-day date-range rule and required filters per report definition
- `GET /report-jobs`, `GET /report-jobs/:id`, `GET /report-jobs/:id/download`
- Dashboard: `GET /dashboard/summary?branchId=&date=`, `GET /dashboard/operations-series?from=&to=&granularity=day`

## 8. Utility

- Notifications: CRUD `/notifications` (broadcast); `GET /me/notifications`, `POST /me/notifications/:id/read`
- Imports: `POST /imports/{type}` (awb-merge, pod-merge, forwarding-merge, awb-stock,
  other-charges, data-updation) — multipart + params; `GET /imports/:id` (+row errors);
  `GET /imports/templates/{type}` (server-defined Excel templates — gap: column specs TBD)
- Tax/charges: CRUD `/fuel-surcharge-rates`, `/tax-rates`;
  Settings: `GET|PUT /settings/miscellaneous`, `GET|PUT /settings/email/:module`
  (password write-only), `GET|PUT /settings/form-setup/:module`, `POST /settings/email/:module/test`
- Files: `POST /files` (multipart → `{ fileId }`), `GET /files/:id/url` (signed, permission-checked)

## 9. Platform / Super Admin (separate `/admin/v1`, platform staff only)

- CRUD `/admin/tenants` (+provision: seed groups, permission grants, sequences, default masters)
- `/admin/plans`, `/admin/tenants/:id/subscription`, `/admin/tenants/:id/features`
- `/admin/tenants/:id/usage`, `/admin/impersonate` (audited, time-boxed)

## 10. Webhooks (outbound)

- Tenant-configurable endpoints: events `shipment.status_changed`, `shipment.delivered`,
  `pickup.created`, `invoice.finalised`, `import.completed`, `report.completed`
- Signed payloads (HMAC), retries w/ exponential backoff (Part 4 §3), delivery log per event.
