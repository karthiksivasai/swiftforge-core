# Documentation index

Permanent project documentation for the **Courier Management System**. Every future feature must reference these files before implementation.

| File | Purpose |
| --- | --- |
| [PROJECT_RULES.md](./PROJECT_RULES.md) | Non-negotiable rules: stack, structure, conventions, do/don't. |
| [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) | Single source of truth for colors, typography, spacing, components' visual specs. |
| [COMPONENTS.md](./COMPONENTS.md) | Catalog of every reusable component and where to find it. |
| [PROJECT_STATUS.md](./PROJECT_STATUS.md) | Live tracker: completed / in progress / pending / future modules. |
| [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md) | Step-by-step workflow for adding or modifying a module. |
| [MODULE_TEMPLATE.md](./MODULE_TEMPLATE.md) | Reusable template every new module must follow. |
| [PROMPT_GUIDE.md](./PROMPT_GUIDE.md) | Recommended prompts to keep AI-driven development consistent. |

---

## Where to find reusable building blocks

- **Layouts / shell:** `src/routes/__root.tsx`, `src/components/app-sidebar.tsx`, `src/components/app-header.tsx`
- **Sidebar / breadcrumbs source of truth:** `src/lib/navigation.ts`
- **Page templates:** `src/routes/master.customer.customer.tsx`, `master.customer.consignee.tsx`, `master.customer.customer-rate.tsx`, `master.customer.expense.tsx`
- **Tables + pager + status pill + CSV export:** `src/components/master-table-kit.tsx`
- **Lookups (magnifier pickers):** `src/components/master-lookup-dialog.tsx` + datasets in `src/lib/master-lookups.ts`
- **Forms:** `FieldWrapper` (master-table-kit) + `src/components/ui/form.tsx` + shadcn inputs
- **Dialogs:** `src/components/ui/dialog.tsx`, `alert-dialog.tsx`
- **Drawers / side panels:** `src/components/ui/sheet.tsx`, `drawer.tsx`
- **Search bar pattern:** see `src/components/master-lookup-dialog.tsx`
- **Filters:** column `<Input class="h-8">` under each `<th>` (see `master.customer.consignee.tsx`)
- **Buttons:** `src/components/ui/button.tsx` — always via `IconButton` for icon-only actions
- **Cards:** `src/components/ui/card.tsx`
- **Design tokens:** `src/styles.css`
- **`cn()` utility:** `src/lib/utils.ts`

Always import from these files. Never recreate.
