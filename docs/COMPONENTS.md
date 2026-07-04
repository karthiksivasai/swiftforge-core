# COMPONENTS.md

Catalog of every reusable component in the project. **Reuse these — do not recreate.**

Legend:
- **Path** — file where the component lives.
- **Reuse in** — where new modules should use it.
- **Never recreate** — banned duplication.

---

## App-level shared components (`src/components/`)

### `AppSidebar` — `src/components/app-sidebar.tsx`
- **Purpose:** Left navigation. Rendered once by `__root.tsx`.
- **Driven by:** `src/lib/navigation.ts`.
- **Reuse in:** never re-instantiate. Extend by editing `NAVIGATION` in `navigation.ts`.
- **Never recreate:** any second sidebar, mini-nav, or per-module nav strip.

### `AppHeader` — `src/components/app-header.tsx`
- **Purpose:** Top bar with breadcrumbs region, branch selector, theme toggle, user chip.
- **Reuse in:** rendered globally; do not embed inside a page.
- **Never recreate:** page-specific headers/toolbars that duplicate this.

### `BranchSelect` — `src/components/branch-select.tsx`
- **Purpose:** Branch/tenant selector used in the header.
- **Reuse in:** anywhere a branch context switch is needed inside a form.
- **Props:** value, onChange (see file).

### `PlaceholderPage` — `src/components/placeholder-page.tsx`
- **Purpose:** "Module scaffolded / Coming soon" placeholder used by splat routes (`master.$.tsx`, `transaction.$.tsx`, `reports.$.tsx`).
- **Reuse in:** every un-built page — do not invent a new placeholder.

### `MasterLookupDialog` — `src/components/master-lookup-dialog.tsx`
- **Purpose:** Magnifier-icon lookup dialog. Searchable table over any dataset registered in `src/lib/master-lookups.ts`.
- **Props:**
  - `open: boolean`
  - `onOpenChange: (o: boolean) => void`
  - `lookup: LookupKey` — key into `MASTER_LOOKUPS`
  - `onSelect: (value, option) => void`
  - `returnField?: "code" | "name" | "code-name"`
- **Reuse in:** every field that needs to pick from a master (Pin Code, Service Centre, Vendor, Product, Zone, State, …).
- **Never recreate:** no custom `<Command>` picker for master lookups.

### `master-table-kit.tsx` exports
| Export | Purpose |
| --- | --- |
| `PAGE_SIZE` | Constant `10`. Use for all master tables. |
| `FieldWrapper` | Label + required asterisk + child input. Standard form field wrapper. |
| `IconButton` | Icon-only button with Tooltip + aria-label. `h-9 w-9 bg-background variant="outline"`. |
| `TablePager` | Complete table pager (first/prev/pages/next/last + "Showing X to Y of Z"). |
| `MasterBreadcrumb` | Breadcrumb trail with Home root. |
| `StatusPill` | Active / In-Active pill. |
| `downloadCsv(name, header, rows)` | CSV export helper. |

**Reuse in:** every master module (`master.customer.*`, `master.sales.*`, `master.operation.*`).
**Never recreate:** custom pagers, custom label wrappers, custom CSV exporters, custom status badges.

---

## shadcn primitives (`src/components/ui/`)

All primitives are vendored — signatures are stable. Import from `@/components/ui/<name>`.

| Component | File | Use for |
| --- | --- | --- |
| `Button` | `button.tsx` | All buttons — do not use bare `<button>`. |
| `Input` | `input.tsx` | Text/number inputs. |
| `Textarea` | `textarea.tsx` | Multi-line text. |
| `Label` | `label.tsx` | Field labels (usually via `FieldWrapper`). |
| `Select` | `select.tsx` | Dropdown selects. |
| `Checkbox` | `checkbox.tsx` | Boolean toggles in tables/forms. |
| `RadioGroup` | `radio-group.tsx` | Small enumerations. |
| `Switch` | `switch.tsx` | Settings toggles. |
| `Slider` | `slider.tsx` | Numeric ranges. |
| `Calendar` + `Popover` | `calendar.tsx`, `popover.tsx` | Date pickers. |
| `Dialog` | `dialog.tsx` | Add/Edit modals. |
| `AlertDialog` | `alert-dialog.tsx` | Destructive confirmations. |
| `Sheet` | `sheet.tsx` | Right-side detail panels. |
| `Drawer` | `drawer.tsx` | Mobile bottom sheets. |
| `Tabs` | `tabs.tsx` | Sectioned content. |
| `Card` | `card.tsx` | Grouped content surfaces. |
| `Table` | `table.tsx` | Semantic table primitives (thead/tbody/tr/td). |
| `Breadcrumb` | `breadcrumb.tsx` | Wrapped by `MasterBreadcrumb`. |
| `Badge` | `badge.tsx` | Non-status badges. Use `StatusPill` for Active/In-Active. |
| `Tooltip` | `tooltip.tsx` | Wrap icon buttons via `IconButton`. |
| `DropdownMenu` | `dropdown-menu.tsx` | Overflow menus. |
| `ContextMenu` | `context-menu.tsx` | Right-click actions. |
| `Command` | `command.tsx` | Combobox — but use `MasterLookupDialog` for master data. |
| `Sidebar` | `sidebar.tsx` | Primitive powering `AppSidebar`. |
| `Skeleton` | `skeleton.tsx` | Loading placeholders. |
| `Sonner` | `sonner.tsx` | Toast notifications. |
| `Form` | `form.tsx` | `react-hook-form` integration. |
| `Pagination` | `pagination.tsx` | Do NOT use for tables — use `TablePager` instead. |

**Never recreate any of the above.** If a variant is missing, add it inside the existing file via CVA.

---

## Route-level page templates (`src/routes/`)

Use these as templates when adding a new module:

- **Master CRUD reference:** `src/routes/master.customer.customer.tsx`
- **Master CRUD with lookups:** `src/routes/master.customer.consignee.tsx`, `master.customer.shipper.tsx`
- **Master CRUD with numeric/date fields:** `src/routes/master.customer.customer-rate.tsx`
- **Master CRUD with category enum:** `src/routes/master.customer.expense.tsx`
- **Splat placeholder:** `src/routes/master.$.tsx`

Copy the structure. Do not invent a new layout.

---

## Libraries (`src/lib/`)

| File | Purpose | Reuse rule |
| --- | --- | --- |
| `utils.ts` | `cn()` class-merger | Import from `@/lib/utils`. Never re-implement. |
| `navigation.ts` | Sidebar + breadcrumb tree | Single source of truth. Add entries here, not elsewhere. |
| `master-lookups.ts` | Master lookup datasets consumed by `MasterLookupDialog` | Add new lookups here — never inline options in a page. |
| `branches-data.ts` | Branch list | Reuse for anything branch-related. |
| `destinations-international-data.ts` | Destination seed | Reuse — do not re-seed elsewhere. |
| `tenant.tsx` | Tenant context | Consume via provided hook. |
| `theme.tsx` | Theme context (light/dark) | Consume via provided hook. |

---

## Duplicate / consolidation notes

At the time of this audit **no duplicate components exist**. Watch for these easy-to-duplicate items and reuse instead:

- Pagination → **always** `TablePager` from `master-table-kit.tsx` (not `pagination.tsx`).
- Status Active/In-Active → **always** `StatusPill`.
- CSV export → **always** `downloadCsv`.
- Form labels → **always** `FieldWrapper`.
- Icon-only buttons → **always** `IconButton`.
- Lookup pickers → **always** `MasterLookupDialog`.
- Breadcrumbs → **always** `MasterBreadcrumb`.
