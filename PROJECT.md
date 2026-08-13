# Courier ERP — Project Bible

> **Audience:** new developers and coding AI assistants.  
> **Goal:** build accurate project context in one read — product, features, tech, architecture, flows, and components.  
> **App root:** `swiftforge-core/` (this folder).  
> **Last reviewed:** 2026-08-09  

Deeper / living docs also live under [`docs/`](./docs/README.md). Prefer **this file** for orientation; use `docs/*` for design tokens, module templates, and status tracking.

---

## 1. What this project is

**Courier ERP** (product branding in the app: *Courier ERP — Modern Courier Management SaaS*) is a **multi-tenant courier / logistics operations system**.

It helps courier companies run day-to-day work:

- Maintain **master data** (customers, shippers, consignees, vendors, rates, countries, pincodes, services, …)
- Run **transactions** (pickup, AWB booking, bagging, manifest, DRS, tracking, receipts, payments)
- Generate and view **shipment documents** (AWB, label, invoice, vendor docs, KYC, …)
- Produce **reports** (operations, AWB, scan, statements, accounts)
- Configure **utilities** (users, access, Excel imports, tax/fuel, rate/zone updates, integrations)

Primary users: **operations staff, booking clerks, finance, and admins** inside a courier branch/tenant — not end consumers (except the public track page).

---

## 2. Product goals

| Goal | Meaning in this codebase |
| --- | --- |
| Operational ERP UI | Dense, keyboard-friendly forms and tables (not a marketing site) |
| Consistent modules | Every master/transaction page follows the same table + dialog patterns |
| Multi-tenant ready | Tenant / branch context providers; Supabase-backed auth when wired |
| Vendor shipping | Book with external carriers; pull labels / AWB / authority letters |
| Document lifecycle | Generate, preview (side sheet), print, download shipment docs |
| Extensible reports & jobs | Report runners, import/merge jobs, rate/zone update jobs |

---

## 3. Tech stack (A → Z)

| Layer | Technology | Notes |
| --- | --- | --- |
| Language | **TypeScript** | Strict TS throughout |
| UI library | **React 19** | Function components + hooks |
| App framework | **TanStack Start** (`@tanstack/react-start`) | SSR-capable React app |
| Routing | **TanStack Router** (file-based) | Routes under `src/routes/` |
| Server/async state | **TanStack React Query** | Queries/mutations; no Redux/Zustand |
| Backend / DB | **Supabase** (`@supabase/supabase-js`) | Auth, Postgres, migrations in `supabase/` |
| Build tool | **Vite 8** | Via `@lovable.dev/vite-tanstack-config` |
| Deploy target | **Cloudflare** (Nitro / Workers) | Configured through Lovable Vite preset |
| UI components | **shadcn/ui** (New York) | Generated into `src/components/ui/` |
| Primitives under shadcn | **Radix UI** | Dialog, Select, Tabs, Tooltip, … |
| Side drawer (alt) | **vaul** | Powers `Drawer` (rarely used vs Sheet) |
| Styling | **Tailwind CSS v4** | Tokens in `src/styles.css` |
| Class merge | `clsx` + `tailwind-merge` → `cn()` | `src/lib/utils.ts` |
| Variants | `class-variance-authority` (CVA) | Button/badge variants |
| Icons | **lucide-react** | Only icon set — do not add others |
| Forms | **react-hook-form** + **zod** | Complex forms; masters often use local state |
| Toasts | **sonner** | Never `alert()` |
| Dates | `date-fns` + `react-day-picker` | |
| Charts | `recharts` | Dashboard / reports |
| PDF / print helpers | `jspdf`, `jspdf-autotable`, `html2canvas` | Labels / invoices |
| Excel | `exceljs`, `xlsx` | Import/export |
| Command palette UI | `cmdk` | `Command` / `CommandDialog` |
| Package name | `tanstack_start_ts` | See `package.json` |
| Dev server | `npm run dev` → **http://localhost:8082** | Port set in `vite.config.ts` |

### Explicitly **not** used
- Next.js / Vue / Angular / Remix
- Redux, Zustand, Jotai, MobX
- MUI, Ant Design, Chakra, Bootstrap
- CSS Modules / styled-components as the main styling approach

---

## 4. Repository layout

```
Courier Management System/          ← workspace folder
└── swiftforge-core/                ← THE APP (open this in IDE / AI context)
    ├── PROJECT.md                  ← this file
    ├── package.json
    ├── vite.config.ts
    ├── components.json             ← shadcn config
    ├── src/
    │   ├── routes/                 ← pages (file-based routes)
    │   ├── components/             ← UI shell + domain components
    │   │   └── ui/                 ← shadcn primitives
    │   ├── lib/                    ← domain logic, contexts, configs
    │   ├── hooks/
    │   ├── integrations/supabase/  ← Supabase client wiring
    │   ├── styles.css              ← design tokens + Tailwind entry
    │   ├── router.tsx
    │   ├── routeTree.gen.ts        ← AUTO-GENERATED — never hand-edit
    │   ├── server.ts
    │   └── start.ts
    ├── supabase/                   ← migrations, seed, edge functions
    ├── docs/                       ← permanent project documentation
    ├── public/
    ├── scripts/
    └── vite-plugins/
```

**Rule:** there is **no** `src/pages/` folder. Pages are **routes**.

---

## 5. Features & functionality (by domain)

Navigation source of truth: **`src/lib/navigation.ts`**.  
Module completion tracker (may lag slightly): **`docs/PROJECT_STATUS.md`**.

### 5.1 Shell / global

| Feature | What it does | Key files |
| --- | --- | --- |
| Login | Sign in to ERP | `src/routes/login.tsx` |
| App shell | Sidebar + header + outlet | `src/routes/__root.tsx` |
| Sidebar | Domain navigation | `src/components/app-sidebar.tsx` + `navigation.ts` |
| Header | Breadcrumbs, branch, theme | `src/components/app-header.tsx` |
| Dashboard | Home / KPIs shell | `src/routes/dashboard.tsx` |
| Theme | Light/dark | `src/lib/theme.tsx` |
| Tenant / branch | Multi-tenant context | `src/lib/tenant.tsx`, `branch-select.tsx` |
| Auth | Session / user context | `src/lib/auth.tsx` |
| Public track | Customer-facing tracking | `src/routes/public.track.tsx` |

### 5.2 Master data

CRUD screens with search, column filters, pager, add/edit dialogs, CSV import/export, lookups.

**Customer**
- Customer, Customer Rate, Consignee, Shipper, Expense

**Vendor**
- Vendor, Vendor Contract

**Operation**
- Service Mapping, Field Executive, Pin Code, Area, Exception, Airline, Country Pincodes

**Sales** (routes under `/master/sales/*`)
- Product, Product Master, Zone, Country, Destination, Service Center, State, Sales Executive, Industry, Flight, Product Type, Content, Instruction, Local Branch, Charges Master, Bank Master

### 5.3 Transactions (core ops)

| Module | Purpose |
| --- | --- |
| Pickup | Create/manage pickups |
| Pickup Inscan | Scan inbound pickup pieces |
| **AWB Entry** | Book / edit air waybills; charges; vendor book; documents |
| Manifest Scan / In Scan / View | Build and view manifests |
| DRS Scan | Delivery run sheet scanning |
| Un-Delivery Scan | Mark undelivered |
| Bagging | Bag / consolidate shipments |
| Transfer Run | Transfer between hubs |
| Miss Route Scan | Misroute handling |
| OBC Entry (Out Scan) | Outbound cargo entry |
| Tracking: AWB Query, Forwarding Updation, Progress/Comment, KYC Tracking, Update Entry | Status & KYC lifecycle |
| Receipt / Expenses | Expense authorize/entry, receipt entry, debit/credit notes, customer payment |
| Bulk Import: POD to Excel | POD export tooling |
| Rate Compare | Vendor vs customer rate compare |

### 5.4 AWB Entry — flagship transaction (detail)

**Route:** `/transaction/awb-entry`  
**File:** `src/routes/transaction.awb-entry.tsx`  
**Page component:** `AwbEntryPage`

**What users can do**
1. Browse **AWB Entry List** (search, open existing, new entry).
2. Fill a multi-tab ERP form (shipper, consignee, shipment, charges, proforma, forwarding, KYC, vendor, …).
3. Use keyboard-friendly field navigation (`ErpFormNavProvider`).
4. **Save** shipment (keeps form open; enables document row when saved).
5. **Clone / Duplicate** from another AWB (Entry search).
6. Book with **vendor shipping** (OTP / live booking when configured).
7. Open document quick links: LOI, Authority Letter, AWB, Label, Invoice, Vendor AWB, Vendor Invoice, Forwarding docs, First Mile Label, KYC, Excel (placeholder).
8. Preview documents in a **right-side Sheet** (Print / Download / Close).
9. Use Documents Center tiles for the same docs.

**Document UI wiring**

```
AwbEntryPage
├── ShipmentDocumentQuickLinks  → DocumentPreviewDrawer (Sheet)
└── ShipmentDocumentsCard       → DocumentPreviewDrawer (Sheet)
         ↑ both in:
         src/components/transactions/shipment-documents-card.tsx
```

Supporting libs:
- `src/lib/transactions/shipmentDocuments.ts` — fetch / MIME / object URLs
- `src/lib/transactions/shipmentUiMap.ts` — form ↔ DB mapping
- `src/lib/transactions/awbLabelGenerator.ts` — label HTML/PDF
- `src/lib/transactions/invoiceGenerator.ts` — invoice HTML/PDF
- `src/components/transactions/vendor-shipping-panel.tsx` — vendor book + OTP dialog
- `src/components/transactions/party-contact-lookup.tsx` — shipper/consignee picker
- `src/components/transactions/vendor-service-lookup.tsx` — vendor service picker

### 5.5 Reports

| Report | Route file |
| --- | --- |
| Operations | `src/routes/reports.operations.tsx` |
| Statements | `src/routes/reports.statements.tsx` |
| AWB | `src/routes/reports.awb.tsx` |
| Scan | `src/routes/reports.scan.tsx` |
| Accounts (AR) | `src/routes/reports.ar-report.tsx` |
| Jobs | `src/routes/reports.jobs.tsx` |
| Dynamic runner | `src/routes/reports.run.$reportKey.tsx` |

Report UI building blocks: `src/components/reports/*`  
Configs: `src/lib/*-report-config.ts`, `src/lib/reports/`

### 5.6 Utility

- Serviceable Pincode, Notification, Integration Configuration
- Users: User Setup, Access Rights, Logged-in Users
- Excel Import: AWB / POD / Forwarding merging, Data Import, Data Updation
- Tax / Charges: Fuel Setup, Tax Setup, Setup
- Rate / Zone Update: Rate Update (+ jobs), Zone Update (+ jobs), Rate Import

---

## 6. Architecture & patterns

### 6.1 Routing

- File-based: **dots in filename = slashes in URL**  
  `master.sales.country.tsx` → `/master/sales/country`
- Define with `createFileRoute("...")` matching the generated ID.
- Auto tree: `src/routeTree.gen.ts` (**never edit by hand**).
- Splat placeholders for unbuilt URLs: `master.$.tsx`, `transaction.$.tsx`, `reports.$.tsx`, `utility.$.tsx`.
- Navigate with TanStack `<Link to="...">` — not raw `<a href>` for internal pages.

### 6.2 State

| Kind | Approach |
| --- | --- |
| Server / DB data | TanStack Query (`useQuery`, mutations, loaders) |
| Auth / tenant / theme | React Context (`src/lib/auth.tsx`, `tenant.tsx`, `theme.tsx`) |
| Form keyboard nav | `ErpFormNavProvider` (`src/components/forms/erp-form-nav-context.tsx`) |
| Page UI | Local `useState` / `useReducer` |
| Global client stores | **Do not add** Redux/Zustand |

### 6.3 Data & backend

- Supabase client under `src/integrations/supabase/`
- SQL migrations / seeds under `supabase/`
- Server helpers: prefer `createServerFn` in `*.functions.ts` when adding server logic
- API routes: e.g. `src/routes/api/pincodes.ts`
- Many screens still mix **live Supabase** data with **demo / in-memory** patterns — check the route before assuming persistence

### 6.4 Styling

- Tailwind utility classes on JSX
- Design tokens (colors, radius, fonts) in `src/styles.css`
- Visual rules documented in `docs/DESIGN_SYSTEM.md`
- Merge classes with `cn(...)` from `@/lib/utils`

### 6.5 Naming conventions

| Kind | Convention | Example |
| --- | --- | --- |
| Route files | `dot.separated.lowercase.tsx` | `transaction.awb-entry.tsx` |
| Components | kebab-case file, PascalCase export | `shipment-documents-card.tsx` → `ShipmentDocumentQuickLinks` |
| Hooks | `use-*.ts(x)` | `use-mobile.tsx` |
| Lib modules | kebab-case | `shipmentUiMap.ts` |
| Server-only | `*.server.ts` | |
| Server functions | `*.functions.ts` | |
| Path alias | `@/` → `src/` | `@/components/ui/button` |

---

## 7. End-to-end flows (how the app behaves)

### 7.1 App boot & auth

```
Browser → Vite/TanStack Start
  → __root.tsx
       providers: QueryClient, Auth, Tenant, Theme, Sidebar, Tooltip, Toaster
       → AppSidebar + AppHeader + <Outlet />
  → /login (if unauthenticated) or /dashboard
```

### 7.2 Open any master module

```
Sidebar click (from navigation.ts)
  → route file e.g. master.customer.customer.tsx
  → Table (search + column filters + TablePager)
  → Add/Edit → Dialog + FieldWrapper fields + MasterLookupDialog
  → Delete → AlertDialog
  → Import/Export → CSV via downloadCsv / import helpers
```

### 7.3 AWB booking → documents (happy path)

```
/transaction/awb-entry
  → List: New / Edit / Entry (clone)
  → Form tabs: fill shipper/consignee/shipment/charges…
  → Save  → shipment id set (editing)
  → Document quick links appear
  → Click Label / AWB / Invoice…
       → openDoc() may call ensureInternalDocument()
       → setPreview(doc)
       → DocumentPreviewDrawer (Sheet, right, ~1100px)
            Print | Download | Close + iframe/srcDoc preview
  → Optional: Vendor shipping panel → book → vendor docs become available
```

### 7.4 Report run

```
/reports/<domain>
  → filter fields (often MasterLookupDialog)
  → Search / Download
  → results table or file download
  → optional /reports/run/$reportKey for parameterized runs
```

---

## 8. Components we use (catalog)

### 8.1 App shell

| Component | Path | Role |
| --- | --- | --- |
| `AppSidebar` | `src/components/app-sidebar.tsx` | Left nav |
| `AppHeader` | `src/components/app-header.tsx` | Top bar |
| `BranchSelect` | `src/components/branch-select.tsx` | Branch switcher |
| `PlaceholderPage` | `src/components/placeholder-page.tsx` | Coming-soon splat pages |
| `GlobalRouteLoader` | `src/components/global-route-loader.tsx` | Route loading UX |

### 8.2 Shared master toolkit (reuse everywhere)

| Export / Component | Path | Role |
| --- | --- | --- |
| `FieldWrapper` | `master-table-kit.tsx` | Label + required asterisk |
| `IconButton` | `master-table-kit.tsx` | Icon-only actions with tooltip |
| `TablePager` | `master-table-kit.tsx` | Table pagination |
| `StatusPill` | `master-table-kit.tsx` | Active / In-Active |
| `MasterBreadcrumb` | `master-table-kit.tsx` | Breadcrumbs |
| `downloadCsv` | `master-table-kit.tsx` | CSV export |
| `MasterLookupDialog` | `master-lookup-dialog.tsx` | Magnifier master picker |
| Lookup datasets | `src/lib/master-lookups.ts` | Data for lookup dialog |
| `SearchableLookupPair` | `src/components/masters/searchable-lookup-pair.tsx` | Code+name lookup + F2 list |
| `PincodeAutocomplete` | `src/components/pincode-autocomplete.tsx` | Pincode typeahead |
| `PcsDetailsDialog` | `src/components/pcs-details-dialog.tsx` | Pieces/dimensions dialog |
| `DataIoToolbar` | `src/components/data-io-toolbar.tsx` | Import/export toolbar pattern |
| `FormSection` | `src/components/form-section.tsx` | Form section chrome |

### 8.3 Transaction / AWB components

| Component | Path | Role |
| --- | --- | --- |
| `ShipmentDocumentQuickLinks` | `transactions/shipment-documents-card.tsx` | Doc action row |
| `ShipmentDocumentsCard` | same | Documents Center grid |
| `DocumentPreviewDrawer` | same (**private**) | Right Sheet PDF/HTML viewer |
| `ShipmentBookedBanner` | same | Post-booking success banner |
| `VendorShippingPanel` / `VendorOtpDialog` | `transactions/vendor-shipping-panel.tsx` | Vendor booking |
| `PartyContactLookup` | `transactions/party-contact-lookup.tsx` | Party picker dialog |
| `VendorServiceLookup` | `transactions/vendor-service-lookup.tsx` | Vendor service picker |
| `ErpFormNavProvider` | `forms/erp-form-nav-context.tsx` | Enter-to-next-field nav |

### 8.4 Overlay primitives (prefer these — do not reinvent)

| Primitive | Path | Use when |
| --- | --- | --- |
| **Dialog** | `src/components/ui/dialog.tsx` | Centered modal (add/edit) |
| **AlertDialog** | `src/components/ui/alert-dialog.tsx` | Confirm delete / destructive |
| **Sheet** | `src/components/ui/sheet.tsx` | Right/left slide-over (document viewer) |
| **Drawer** | `src/components/ui/drawer.tsx` | Bottom sheet (vaul; rare) |
| **CommandDialog** | `src/components/ui/command.tsx` | Command palette style |

Also common: `Popover`, `DropdownMenu`, `Tooltip`, `Tabs`, `Card`, `Table`, `Select`, `Checkbox`, `Button`, `Input`, `Sonner`.

Full primitive list: every file in `src/components/ui/` (accordion, alert, avatar, badge, breadcrumb, button, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input, input-otp, label, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, switch, table, tabs, textarea, toggle, toggle-group, tooltip, loader-3, …).

### 8.5 Reports / dashboard / finance / integrations

| Area | Folder |
| --- | --- |
| Reports UI | `src/components/reports/` |
| Dashboard cards | `src/components/dashboard/` |
| Finance panels | `src/components/finance/` |
| Vendor / customs integrations UI | `src/components/integrations/` |

---

## 9. Key libraries by concern (`src/lib/`)

| Path | Responsibility |
| --- | --- |
| `navigation.ts` | Sidebar + breadcrumbs SoT |
| `utils.ts` | `cn()` |
| `auth.tsx` / `tenant.tsx` / `theme.tsx` | Global contexts |
| `master-lookups.ts` | Lookup option datasets |
| `transactions/*` | AWB/shipment/manifest/pickup/DRS/POD mapping + generators |
| `masters/` | Master-domain helpers |
| `reports/`, `*-report-config.ts` | Report definitions |
| `integrations/` | Vendor shipping clients/types |
| `imports/`, `io/` | Import/export pipelines |
| `permissions.ts`, `rbac-data.ts` | Access-control data |
| `pincodes/`, `serviceable-pincode/` | Pincode services |
| `rate-update/`, `zone-update/`, `tax-fuel/` | Utility domain logic |
| `forms/` | Shared form helpers (AWB nav order, required fields, …) |

---

## 10. How to run locally

```bash
cd swiftforge-core
npm install          # or bun install
npm run dev          # http://localhost:8082
```

Other scripts (`package.json`):
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run test` — Vitest
- `npm run format` — Prettier

Environment: Supabase keys / Lovable env via `.env` / Vite `VITE_*` (do not commit secrets).

---

## 11. Rules for contributors & AI assistants

1. **Read this file + `docs/PROJECT_RULES.md` before building a module.**
2. **Reuse** `master-table-kit`, `MasterLookupDialog`, and `components/ui/*` — never fork a second design system.
3. **Add routes** as `src/routes/<section>.<...>.tsx` and register paths in `navigation.ts` when needed.
4. **Never edit** `routeTree.gen.ts`.
5. **Document previews** → extend `DocumentPreviewDrawer` / `Sheet`, do not open full-screen tabs for preview.
6. **Toasts** via `sonner`; validation errors under fields.
7. **Update** `docs/PROJECT_STATUS.md` when finishing a module.
8. Follow `docs/MODULE_TEMPLATE.md` and `docs/DEVELOPMENT_GUIDE.md` for new CRUD screens.
9. Prefer exact paths and existing component names in prompts — see `docs/PROMPT_GUIDE.md`.

---

## 12. Documentation map

| File | Purpose |
| --- | --- |
| **`PROJECT.md`** (this file) | Full orientation — start here |
| `docs/README.md` | Docs index |
| `docs/PROJECT_RULES.md` | Non-negotiable engineering rules |
| `docs/DESIGN_SYSTEM.md` | Colors, type, spacing |
| `docs/COMPONENTS.md` | Reusable component catalog |
| `docs/PROJECT_STATUS.md` | Completed / pending modules |
| `docs/DEVELOPMENT_GUIDE.md` | How to add/modify a module |
| `docs/MODULE_TEMPLATE.md` | Copy-paste module skeleton |
| `docs/PROMPT_GUIDE.md` | AI prompt patterns |
| `docs/backend-blueprint/*` | DB / API / tenancy / roadmap |
| `docs/phase-*-setup.md` | Phase setup notes |

---

## 13. Quick “where is X?” cheat sheet

| I need… | Go to… |
| --- | --- |
| AWB Entry page | `src/routes/transaction.awb-entry.tsx` |
| Document side sheet | `DocumentPreviewDrawer` in `src/components/transactions/shipment-documents-card.tsx` |
| Sheet primitive | `src/components/ui/sheet.tsx` |
| Dialog / confirm | `src/components/ui/dialog.tsx`, `alert-dialog.tsx` |
| Sidebar labels/paths | `src/lib/navigation.ts` |
| Master table pattern | `src/routes/master.customer.customer.tsx` + `master-table-kit.tsx` |
| Lookup magnifier | `master-lookup-dialog.tsx` + `master-lookups.ts` |
| Design tokens | `src/styles.css` |
| Auth / tenant / theme | `src/lib/auth.tsx`, `tenant.tsx`, `theme.tsx` |
| Vendor booking | `src/components/transactions/vendor-shipping-panel.tsx` |
| Shipment mapping | `src/lib/transactions/shipmentUiMap.ts` |

---

## 14. Mental model (one paragraph)

This is a **TanStack Start + React + Tailwind + shadcn** Courier ERP. Screens are **file routes**. Masters are **table + dialog CRUD**. Transactions (especially **AWB Entry**) are large forms with **vendor booking** and a shared **Sheet-based document viewer**. Global chrome is **sidebar/header driven by `navigation.ts`**. Server data goes through **React Query + Supabase**. When in doubt: copy an existing master route or AWB patterns, reuse kit components, and do not invent new UI frameworks.

---

*End of PROJECT.md — keep this file updated when major domains, stacks, or AWB document flows change.*
