# Phase 7 — Integrations Setup

Phases 1–6 are frozen. Phase 7 adds external integration capabilities on top of
existing tenancy, RBAC, audit, files, jobs, vendors, and service mappings.

---

## Milestone 7A — Integration Framework (`0055_integration_framework.sql`)

**Frozen.** Provider registry, encrypted credentials, adapter stubs, integration logs.

See earlier sections in git history / prior docs for full 7A detail.

---

## Milestone 7B — Carrier Booking & Tracking (`0056_carrier_booking_tracking.sql`)

**Frozen.** FedEx / DHL Express / Blue Dart via `RpcCarrierAdapter`; booking, cancel,
manual track, label metadata, serviceability.

---

## Milestone 7C — Public Tracking API & Webhooks (`0057_public_tracking_webhooks.sql`)

**Frozen.** Public tracking + outbound webhook framework. **No** retries,
queues, workers, cron, polling, email/SMS, IRN, or EDI.

### Public Tracking API

| RPC | Access |
| --- | --- |
| `public_track_shipment(awb, carrier_tracking_no)` | `anon` + `authenticated` |

Lookup by **AWB** or **carrier tracking number**. Returns customer-safe JSON only:

- `shipment_number`, `current_status`, `origin`, `destination`
- `carrier_name`, `pod_status`, `estimated_delivery` (null if unavailable)
- `tracking_timeline` (from `tracking_events`)
- `shipment_timeline` (from `shipment_events`)

**Never** returns: tenant/internal IDs, comments, audit, financials, credentials.

Rate limit: bumps `usage_counters` metric `api_calls` per tenant/month
(`app.public_track_monthly_limit()` = 10 000). Ambiguous cross-tenant matches
return `found: false` (no tenant leakage).

UI: `/public/track` (bare layout, no sidebar).

### Webhook architecture

```
webhooks (tenant) ──► dispatch_webhook() ──► sign (HMAC-SHA256)
        │                      │
        │                      ▼
        │              sync POST once (stub/test transport)
        │                      │
        └────────► webhook_deliveries (append-only, attempt=1)
```

Tables:

- `webhooks` — name, endpoint_url, `signing_secret_enc`, subscribed_events[],
  is_active, row_version, audit fields
- `webhook_deliveries` — webhook_id, event_type, payload (incl. signature),
  response_status, latency_ms, attempt_number (=1), created_at

### Subscribed events (only these)

| Code | Label |
| --- | --- |
| `SHIPMENT_BOOKED` | Shipment Booked |
| `SHIPMENT_CANCELLED` | Shipment Cancelled |
| `SHIPMENT_DELIVERED` | Shipment Delivered |
| `SHIPMENT_UNDELIVERED` | Shipment Undelivered |
| `POD_UPDATED` | POD Updated |
| `TRACKING_UPDATED` | Tracking Updated |

### Payload format

```json
{
  "id": "<uuid>",
  "event": "SHIPMENT_BOOKED",
  "timestamp": "2026-07-15T06:00:00Z",
  "data": { }
}
```

Delivery log stores body + headers:

- `X-SwiftForge-Timestamp`: ISO UTC timestamp
- `X-SwiftForge-Signature`: `sha256=<hex>`

### Signing process

1. Build body JSON string `B` and timestamp `T`
2. `signature = HMAC-SHA256(secret, T || '.' || B)` hex-encoded
3. Receiver verifies: recompute HMAC with shared secret; compare to header

Secrets: encrypted with 7A `app.encrypt_integration_secret`; **write-only**;
`has_signing_secret` only in API responses. Regenerate via
`save_webhook(..., regenerate_secret: true)`.

### Dispatch

`dispatch_webhook(webhook_id, event_type, data)`:

1. Validate subscription + active
2. Sign payload
3. POST once via `app.webhook_http_post_once` (sync; `test://` → 200;
   default transport is in-DB stub — no workers)
4. Insert **one** `webhook_deliveries` row (`attempt_number = 1`)
5. Audit

**No retry.**

### RPCs

| RPC | Purpose |
| --- | --- |
| `save_webhook` | Create/update (+ secret regen) |
| `list_webhooks` / `get_webhook` | Safe read |
| `delete_webhook` | Soft delete |
| `dispatch_webhook` | Sign + POST once + log |
| `list_webhook_deliveries` | Delivery history |
| `public_track_shipment` | Public track |

Permissions: reuse `mst.vendor-master` (same as 7A).

### Frontend

- `/utility/webhooks` — CRUD, event subscription, secret regeneration,
  test dispatch, delivery history (live + demo)
- `/utility/integration-configuration` — link to webhooks
- `/public/track` — public tracking page

### Security considerations

- Public track is read-only; no auth; rate-limited; no tenant IDs in response
- Signing secrets never returned; encrypted at rest
- Deliveries append-only (no update/delete policies + trigger)
- HMAC timestamp binds replay window for consumers (verification docs above)

### Verification (7C)

`supabase/tests/public_tracking_webhooks_verification.sql` — public tracking,
hidden fields, webhook CRUD, secret encryption, single dispatch, delivery log,
HMAC verify, audit, optimistic locking, anon access, tenant isolation.
Registered in `run_local_rls_check.sh`.

Vitest: webhook Zod schemas in `schemas.test.ts`.

### Deploy (7C)

Apply `0057_public_tracking_webhooks.sql` after `0056_carrier_booking_tracking.sql`.

---

## Milestone 7D — Email / SMS / WhatsApp Delivery (`0058_notification_delivery.sql`)

**Frozen.** Synchronous notification delivery on Phase 6E config + 7A credentials.
**No** queues, workers, cron, retries, scheduled notifications, or push.

### Notification architecture

| Layer | Role |
| --- | --- |
| Phase 6E | `email_configurations`, `notification_templates`, `notification_preferences` |
| Phase 7A | Encrypted SMS/WhatsApp/SMTP secrets (`integration_credentials`) |
| 7D | Sync send + `dispatch_notification` + append-only `notification_deliveries` |

Channels: **EMAIL**, **SMS**, **WHATSAPP**. Dispatcher selects channel(s) from
user preferences, tenant config, and template channel. Single or multi-channel;
all sends are synchronous.

### Provider abstraction

| Channel | Interface / RPC | Default provider |
| --- | --- | --- |
| Email | `send_email`, `test_email_configuration` | SMTP config (sandbox send path) |
| SMS | `send_sms` + TS `SandboxSmsProvider` | **SANDBOX** stub |
| WhatsApp | `send_whatsapp` + TS `SandboxWhatsappProvider` | **SANDBOX** stub |

No live Twilio / Meta WhatsApp integration in 7D.

**SMS purposes:** OTP, SHIPMENT_BOOKED, SHIPMENT_DELIVERED, SHIPMENT_UNDELIVERED,
PICKUP_ASSIGNED.

**WhatsApp purposes:** SHIPMENT_UPDATES, POD_NOTIFICATION, OTP.

### Template rendering

Templates use `{{var}}` placeholders. RPCs render subject/body (HTML + plain text
for email) before send. `preview_notification_template` returns rendered content
without sending.

Email supports attachment **metadata only** (existing file references).

### Delivery logging

Append-only table `notification_deliveries`:

- channel, recipient, template, payload, provider, status, response, latency, created_at
- Rows are never updated or deleted (trigger + RLS)

### Security model

- Reuses encrypted credentials from 7A / SMTP password crypto from 6E
- Secrets remain write-only (never returned in API/UI)
- Every send is audited
- Permission: existing `utl.notification` (Utility Notification) — no new RBAC

### RPCs

| RPC | Purpose |
| --- | --- |
| `send_email` | Sync email send |
| `test_email_configuration` | SMTP test message |
| `send_sms` | Sandbox SMS |
| `send_whatsapp` | Sandbox WhatsApp |
| `dispatch_notification` | Multi-channel dispatch with preference filtering |
| `list_notification_deliveries` | Delivery history |
| `get_notification_provider_status` | Provider status |
| `preview_notification_template` | Template preview |

### Frontend

| Screen | Path |
| --- | --- |
| Notification Setup | `/utility/notification-setup` — test Email/SMS/WhatsApp, provider status, delivery history |
| Notification Templates | `/utility/notification-templates` — preview + sandbox test dispatch |
| Setup SMTP | tax/charges setup email tab — **Send Test Email** |

Live/demo mode preserved. No UI redesign.

### Verification (7D)

`supabase/tests/notification_delivery_verification.sql` — email/SMS/WhatsApp send,
preference filtering, template rendering, delivery logging, audit, secret protection,
tenant isolation. Registered in `run_local_rls_check.sh`.

### Deploy (7D)

Apply `0058_notification_delivery.sql` after `0057_public_tracking_webhooks.sql`.

---

## Deferred (not 7D)

| Item | Milestone |
| --- | --- |
| Live Twilio / WhatsApp Cloud providers | later |
| Background queues / workers / retries / cron | later |
| Scheduled notifications | later |
| Push notifications | later |
| E-Invoice (IRN) | **7E** (see below) |
| Customs EDI | later |
| Phase 8 | later |

---

## Stop condition (7D)

Milestone 7D is complete when Email / SMS / WhatsApp delivery and the dispatcher
above are verified. **Do not** start Milestone 7E (E-Invoice / IRN) until approved.

---

## Milestone 7E — E-Invoice / IRN Integration (`0059_irn_integration.sql`)

**Frozen.** Synchronous IRN generate/cancel/status for Invoice, Debit Note, and Credit Note.
**No** live IRP HTTP, queues, workers, cron, GST reporting, or finance redesign.

### IRN architecture

| Layer | Role |
| --- | --- |
| Phase 7A | `integration_providers` (`EINVOICE`) + encrypted credentials |
| Document shells | Minimal `invoices`, `debit_notes`, `credit_notes` (IRN attachment only) |
| 7E | Sandbox IRP + `generate_irn` / `cancel_irn` / `get_irn_status` / `test_irn_connection` |
| History | Append-only `irn_logs` (never update/delete) |

Lifecycle: **PENDING → GENERATED → CANCELLED**. Duplicate generate blocked.

Credential mapping (write-only secrets):

| Field | Stored as |
| --- | --- |
| Client ID | `api_key_enc` |
| Client Secret | `api_secret_enc` |
| Username / Password | `username` / `password_enc` |
| GSTIN | `account_number` |
| Environment | `sandbox_mode` (true=Sandbox, false=Production) |

### Provider abstraction

Default provider: **SANDBOX** stub (`app.sandbox_generate_irn` / `app.sandbox_cancel_irn`).
Seeded catalog: `CLEARTAX`, `IRP_SANDBOX` (`provider_type = EINVOICE`).
No live ClearTax / NIC IRP HTTP in 7E.

### Supported documents

Invoice · Debit Note · Credit Note only.

### Security

- Secrets never returned (flags only: `has_password`, `has_client_id`, …)
- Audit on Test / Generate / Cancel
- Permissions reused: `doc.invoice-irn-generation`, `doc.invoice-cancel-after-irn-generated`,
  `txn.debit-note`, `txn.credit-note` (plus vendor-master for connection test fallback)

### Frontend

| Screen | IRN actions |
| --- | --- |
| `/utility/integration-configuration` | EINVOICE credentials, Test IRN Connection |
| `/transaction/receipt/debit-note` | Generate / Cancel / Status / QR / Response |
| `/transaction/receipt/credit-note` | Same |

Live/demo dual mode preserved. No ledger/posting changes.

### Verification (7E)

`supabase/tests/irn_integration_verification.sql` — connection test, generate,
duplicate prevention, cancel, status, audit, secrets, tenant isolation.
Registered in `run_local_rls_check.sh`.

### Deploy (7E)

Apply `0059_irn_integration.sql` after `0058_notification_delivery.sql`.

---

## Deferred (not 7E)

| Item | Milestone |
| --- | --- |
| Live IRP / GSP HTTP | later |
| IRN queues / retries / cron | later |
| GST reporting | later |
| Full invoice generate/finalise UX | later |
| Customs EDI | **7F** (see below) |
| Phase 8 | later |

---

## Stop condition (7E)

Milestone 7E is complete when IRN configuration and sandbox generate/cancel/status
above are verified. **Do not** start Milestone 7F (Customs EDI) until approved.

---

## Milestone 7F — Customs EDI Integration (`0060_customs_edi.sql`)

CSB-III / CSB-IV / CSB-V export from existing manifest + shipment data.
**No** live Customs API, queues, workers, cron, automatic submission, or clearance workflow.

### Customs EDI architecture

| Layer | Role |
| --- | --- |
| Phase 7A | `integration_providers` (`CUSTOMS`) + encrypted credentials |
| Phase 4 | `manifests` / `manifest_lines` + `shipments` (incl. `wizard_extras.proforma`) |
| Files | Generated artifacts in `public.files` (`owner_type = CSB_EXPORT`) |
| 7F | Sandbox generate/validate/download + append-only `csb_export_logs` |

Lifecycle: **DRAFT → GENERATED → DOWNLOADED** (no upload/ack/polling).

### Credential mapping

| Config | Stored as |
| --- | --- |
| CHA Code | `username` |
| IEC | `account_number` |
| Export Directory | `endpoint` |
| Branch / Port | `remark` (`branch=…;port=…`) |
| Environment | `sandbox_mode` |
| Password | `password_enc` (write-only) |

Seeded providers: `CUSTOMS_EDI`, `ICEGATE_SANDBOX`.

### Supported CSB formats

| Type | Source |
| --- | --- |
| CSB_III | Manifest header + AWB lines |
| CSB_IV | Same stub layout (type tag differs) |
| CSB_V | Same + HSN from `wizard_extras.proforma` when present |

Validation checks CHA/IEC, manifest presence, AWB lines, destination (falls back to shipment destination). Failures leave export in **DRAFT** with clear error codes.

### Security

- Secrets never returned
- Audit on Test / Generate / Download
- Permissions: `rpt.edi-csb-files`, `txn.bagging` (seeded)

### Frontend

`/utility/integration-configuration` — CUSTOMS credentials + **Customs EDI / CSB Export** panel
(Test Connection, Validate, Generate, Download, History). Live/demo dual mode.

### Verification (7F)

`supabase/tests/customs_edi_verification.sql` — connection, CSB-III/IV/V, validation failures,
history, audit, tenant isolation. Registered in `run_local_rls_check.sh`.

### Deploy (7F)

Apply `0060_customs_edi.sql` after `0059_irn_integration.sql`.

---

## Vendor Shipping API (0077) — provider-agnostic

Per-tenant **Vendor Shipping Integrations** (Utility → Integration Configuration):

1. Save carrier/gateway **credentials** (UserID / Password / Account / Endpoint) for provider code `XPRESION` (or future `DHL` / `FEDEX` / …).
2. Create a **Vendor Integration** row: provider, linked credentials, endpoint, OTP required, services/products, optional mapped vendor IDs.
3. On AWB **Book**: Internal `confirm_booking` → Vendor Shipping Service → adapter → Provider API.
4. OTP modal when required; documents + activity timeline attach automatically.
5. Edge Function: `supabase/functions/vendor-shipping` (optional; FE falls back to local sandbox adapter).

AWB Entry never references a specific provider brand — only the Vendor Shipping client facade.

Apply migration `0077_vendor_shipping_api.sql`. Deploy edge function when going live against a real gateway.

---

## Deferred (not 7F)

| Item | Milestone |
| --- | --- |
| Live ICEGATE / Customs API | later |
| Automatic submission / ack / polling | later |
| Customs clearance workflow | later |
| Background workers / retries / cron | later |
| Native DHL/FedEx/UPS HTTP adapters | later (stubs in registry) |
| Phase 8 — Mobile & AI | **Phase 8** |

---

## Stop condition (7F) — Phase 7 freeze

Milestone 7F is complete when Customs EDI sandbox export above is verified.
**Phase 7 is frozen.** **Do not** start Phase 8 (Mobile & AI Features) until approved.
