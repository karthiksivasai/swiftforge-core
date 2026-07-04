# MODULE_TEMPLATE.md

Every new module MUST be specified using this template before implementation begins. Copy this file, fill in each section, and keep it alongside the module for reference.

---

## 1. Overview

- **Module name:**
- **Section / group:** (e.g. Master → Customer)
- **Route path:** `/master/<group>/<slug>`
- **Route file:** `src/routes/master.<group>.<slug>.tsx`
- **Purpose (1–2 sentences):**
- **Reference module to copy from:** `src/routes/master.customer.customer.tsx` (or the closest existing one)

---

## 2. Pages

List every screen this module needs. Most masters only need the list page + add/edit dialog.

| Page | Route | Description |
| --- | --- | --- |
| List | `/master/<group>/<slug>` | Table with search, filters, pager |
| Detail (optional) | `/master/<group>/<slug>/$id` | Only if a full-page view is required |

---

## 3. Fields

Complete table for every field. This drives the form, the table columns, validation, and the CSV header.

| Field | Type | Required | Lookup | Default | Notes |
| --- | --- | --- | --- | --- | --- |
| Code | text | ✅ | — | — | Unique |
| Name | text | ✅ | — | — | |
| Pin Code | text | ✅ | `pinCode` (MasterLookupDialog) | — | |
| Status | enum | ✅ | Active / In-Active | Active | Render via `StatusPill` |
| ... | | | | | |

---

## 4. Tables

- **Visible columns:** list in order.
- **Sortable columns:** list.
- **Column filters:** list which columns get a filter input.
- **Global search fields:** list which fields the top-right search box scans.
- **Row actions:** Edit, Delete (add more only if genuinely required).
- **Empty state message:** `No data available in table` (do not change).
- **Page size:** `PAGE_SIZE` (10) from `master-table-kit.tsx`.

---

## 5. Buttons

Toolbar buttons in order (right-aligned in the page header):

- **Add** — opens Add dialog. Icon `Plus`.
- **Import** — CSV import. Icon `Upload`.
- **Export** — CSV export via `downloadCsv`. Icon `Download`.
- **Refresh** — reloads data. Icon `RefreshCw`.

Row actions (right-most cell):

- **Edit** — icon `Pencil`.
- **Delete** — icon `Trash2`, opens `AlertDialog`.

Do not add extra buttons without listing them here.

---

## 6. Dialogs

- **Add/Edit dialog:** `Dialog` with `max-w-2xl` (or `max-w-3xl` if >8 fields). Uses `FieldWrapper` for every field.
- **Delete confirmation:** `AlertDialog`, primary action `variant="destructive"`.
- **Lookup dialogs:** `MasterLookupDialog` fed by keys from `src/lib/master-lookups.ts`.

---

## 7. Search

- Global search input at the top-left of the table toolbar.
- Fields searched: (list them).
- Case-insensitive substring match.

---

## 8. Filters

- Column-level `<Input class="h-8">` filters under table headers for text columns.
- `<Select>` filters for enum columns (e.g. Status).
- Date columns: `Calendar` in a `Popover`.

---

## 9. Validation

| Field | Rule |
| --- | --- |
| Code | required, unique, `≤ 20` chars |
| Name | required, `≤ 100` chars |
| Numeric fields | `≥ 0`, integer or decimal per spec |
| Date fields | `fromDate ≤ toDate` |
| Enum fields | must be one of the allowed values |

Show errors as `<p class="text-xs text-destructive">…</p>` under the field. Block submit on any error.

---

## 10. Business Rules

Document any domain rule that isn't captured by field validation. Examples:

- Customer Rate: `toDate` must be strictly after `fromDate`.
- Expense: `taxPct` between 0 and 100.
- Consignee/Shipper: at least one of `phone` or `email` must be provided.
- Add/replace bullets specific to the module.

---

## 11. Permissions

Document required roles (post backend enablement). Until Lovable Cloud is enabled, mark as `n/a — no auth yet`.

- View: `role.<module>.read`
- Create/Edit: `role.<module>.write`
- Delete: `role.<module>.delete`
- Import/Export: `role.<module>.import` / `.export`

---

## 12. API

Fill in once Lovable Cloud is enabled.

| Operation | Server function | Method | Notes |
| --- | --- | --- | --- |
| List | `list<Module>` | GET | paginated via loader / query |
| Create | `create<Module>` | POST | validates with zod |
| Update | `update<Module>` | POST | id in payload |
| Delete | `delete<Module>` | POST | soft delete if applicable |
| Import | `import<Module>` | POST | expects CSV rows |

All authenticated functions use `requireSupabaseAuth`.

---

## 13. Database

Schema outline (fill during API step).

```sql
create table public.<module> (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  ...
  status text not null default 'Active' check (status in ('Active','In-Active')),
  tenant_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.<module> to authenticated;
grant all on public.<module> to service_role;
alter table public.<module> enable row level security;
-- policies: tenant-scoped read/write via has_role() or tenant match
```

Roles must never be stored on this table. See `PROJECT_RULES.md` — user roles live in a separate table.

---

## 14. Future improvements

- Bulk delete
- Inline row editing
- Column visibility toggle
- Server-side pagination once row counts exceed a few thousand
- Audit log integration
- Field-level history / restore

---

## Completion checklist (paste into PR description)

- [ ] Route file created and matches sidebar slug
- [ ] Reused `master-table-kit` primitives
- [ ] Reused `MasterLookupDialog` for every lookup
- [ ] Add/Edit dialog with `FieldWrapper` + validation
- [ ] Delete via `AlertDialog`
- [ ] CSV import + export
- [ ] Empty state matches design
- [ ] No hardcoded colors/fonts
- [ ] Dark mode verified
- [ ] Mobile verified
- [ ] `PROJECT_STATUS.md` updated
