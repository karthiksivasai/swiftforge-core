# PROJECT_RULES.md

Permanent development rules for the **Courier Management System**. Every new module MUST follow these rules. This is not a redesign project — the design system already exists.

---

## 1. Tech Stack

| Layer | Choice |
| --- | --- |
| Framework | **TanStack Start v1** (React 19 + Vite 7) |
| Router | `@tanstack/react-router` (file-based routing) |
| Data | `@tanstack/react-query` |
| Styling | **Tailwind CSS v4** via `src/styles.css` (`@theme inline`, oklch tokens) |
| UI Primitives | **shadcn/ui** on Radix (`src/components/ui/*`) |
| Icons | **lucide-react** — no other icon libraries |
| Forms | **react-hook-form** + **zod** (`@hookform/resolvers`) |
| Utility | `clsx` + `tailwind-merge` via `cn()` in `src/lib/utils.ts` |
| Variants | `class-variance-authority` |
| Dates | `date-fns` + `react-day-picker` |
| Notifications | `sonner` |
| Server runtime | Cloudflare Worker (`nodejs_compat`) |

Do **not** introduce new UI kits, CSS frameworks, icon sets, or state libraries.

---

## 2. Folder Structure

```
src/
  components/
    ui/                      # shadcn primitives — DO NOT modify signatures
    app-header.tsx           # global header (branch/tenant/theme)
    app-sidebar.tsx          # global sidebar (driven by lib/navigation.ts)
    branch-select.tsx
    master-lookup-dialog.tsx # shared "magnifier" lookup picker
    master-table-kit.tsx     # FieldWrapper, TablePager, IconButton, StatusPill, downloadCsv, MasterBreadcrumb
    placeholder-page.tsx
  hooks/
    use-mobile.tsx
  lib/
    utils.ts                 # cn()
    navigation.ts            # single source of truth for sidebar + breadcrumbs
    master-lookups.ts        # centralized lookup datasets
    branches-data.ts
    destinations-international-data.ts
    tenant.tsx
    theme.tsx
    error-*.ts
  routes/
    __root.tsx               # root layout (shell, head metadata)
    index.tsx                # /
    dashboard.tsx            # /dashboard
    master.$.tsx             # splat placeholder for un-implemented master pages
    master.<group>.<slug>.tsx
    transaction.$.tsx
    reports.$.tsx
  routeTree.gen.ts           # AUTO-GENERATED — never edit
  router.tsx
  server.ts
  start.ts
  styles.css                 # design tokens live here
```

Rules:
- **Never** create `src/pages/`.
- **Never** edit `src/routeTree.gen.ts` — the Vite plugin owns it.
- **Never** duplicate a component that already exists in `components/` or `components/ui/`.

---

## 3. Routing Conventions

File-based, dot-separated (TanStack Start).

- Filename dots = URL slashes: `master.customer.consignee.tsx` → `/master/customer/consignee`.
- `createFileRoute("...")` MUST match the generated route ID exactly.
- Splat routes (`*.$.tsx`) exist for `/master/*`, `/transaction/*`, `/reports/*` and render a "coming soon" placeholder for un-built pages.
- All navigation must go through `<Link to="...">` from `@tanstack/react-router` — never `<a href>`.
- The sidebar and breadcrumbs are derived from **`src/lib/navigation.ts`**. When you add a real page, add its slug to the correct `NavGroup` there (if not already present) and create the matching route file.

---

## 4. State Management

- **Server state:** TanStack Query. Default read shape: loader `ensureQueryData` + component `useSuspenseQuery` (when backend is wired).
- **Local UI state:** `useState` / `useReducer`. No Redux, Zustand, Jotai, etc.
- **Global app state:** context providers in `src/lib/` (`tenant.tsx`, `theme.tsx`). Extend these — do not create parallel providers.

---

## 5. API Structure (when backend is enabled)

- App-internal server logic → `createServerFn` from `@tanstack/react-start`, in `*.functions.ts`.
- External callers (webhooks, cron, public APIs) → server routes under `src/routes/api/public/*`.
- Never import `src/integrations/supabase/client.server` at module scope of a route or `*.functions.ts` file. Load inside the handler via dynamic import.
- All authenticated server functions must use `requireSupabaseAuth` middleware.
- No app-internal Supabase Edge Functions — use `createServerFn`.

Backend is **not yet enabled** for this project. Do not fabricate API calls; keep new modules in-memory until the user turns Lovable Cloud on.

---

## 6. File Naming Conventions

- Routes: `dot.separated.lowercase.tsx` matching the URL.
- Components: `kebab-case.tsx`, PascalCase export.
- Hooks: `use-*.tsx`.
- Libraries: `kebab-case.ts`.
- Server-only helpers: `*.server.ts`.
- Server functions: `*.functions.ts`.
- No `index.tsx` re-exports in `src/components/*` — import from the file directly.

---

## 7. Component Organization

- **`components/ui/*`** — shadcn primitives. Treat as vendored: only extend via `className` or new variants inside the same file.
- **`components/*`** (root) — app-level shared components (`app-header`, `app-sidebar`, `master-lookup-dialog`, `master-table-kit`, `branch-select`, `placeholder-page`).
- **Per-route helpers** — colocate inside the route file when only used there. Promote to `components/` **only after** a second consumer needs it.

---

## 8. Form Handling

- Simple master forms use plain React state + local validation (see `master.customer.customer.tsx`).
- Complex forms use **react-hook-form + zod** (`@hookform/resolvers/zod`) with `components/ui/form.tsx`.
- Every field is wrapped in `<FieldWrapper label required>` from `master-table-kit.tsx` for label + required-asterisk consistency.
- Lookup fields use `MasterLookupDialog` triggered by the magnifier `IconButton`.

---

## 9. Validation Approach

- Client-side: zod schemas colocated with the form, or inline `if (!value.trim()) …` for the small master forms.
- Show validation errors under the field using `text-destructive text-xs`.
- Never `alert()` — use `sonner` toasts for feedback.

---

## 10. Table Implementation

All master tables share the same anatomy — do not reinvent:

1. Toolbar row: global `<Input>` search on the left, action `IconButton`s on the right (Add, Import, Export, Refresh).
2. `<table>` inside a `rounded-md border` wrapper. Header uses `bg-sidebar text-sidebar-foreground`.
3. Column filter row directly under the header (`<Input>` in each `<th>`).
4. Row actions column with `IconButton`s (Edit = `Pencil`, Delete = `Trash2`).
5. Empty state row: `No data available in table` centered, `text-muted-foreground`.
6. Footer: `<TablePager>` from `master-table-kit.tsx`. `PAGE_SIZE = 10`.

Reference implementations: `src/routes/master.customer.customer.tsx`, `master.customer.consignee.tsx`.

---

## 11. Modal / Dialog / Drawer Implementation

- **Dialog** (`components/ui/dialog.tsx`) — for Add/Edit forms.
- **AlertDialog** (`components/ui/alert-dialog.tsx`) — for destructive confirmations (Delete).
- **Sheet / Drawer** (`components/ui/sheet.tsx`, `drawer.tsx`) — for side panels; use `sheet` for right-side detail panels, `drawer` only for mobile bottom sheets.
- **MasterLookupDialog** — for every `magnifier` lookup input. Never build a bespoke picker.

Dialog widths: `max-w-lg` for lookups, `max-w-2xl`/`max-w-3xl` for CRUD forms. Never full-screen.

---

## 12. Icons

- Source: `lucide-react` only.
- Standard sizes: `h-4 w-4` inside buttons, `h-5 w-5` for headers, `h-3.5 w-3.5` for inline chips.
- Standard set: `Plus`, `Pencil`, `Trash2`, `Search`, `Upload`, `Download`, `RefreshCw`, `ChevronLeft/Right/sLeft/sRight`, `Filter`, `X`.

---

## 13. Typography

- Font family: `Inter` via `--font-sans` in `styles.css`.
- Body: default `text-sm` in tables/forms, `text-base` for prose.
- Field labels: `text-xs font-medium text-muted-foreground` (`FieldWrapper` handles this).
- Page title: `text-2xl font-semibold tracking-tight`.
- Section title: `text-lg font-semibold`.
- Table header: `text-xs font-medium uppercase tracking-wide` — but use the exact classes from existing tables.

Do not introduce new fonts.

---

## 14. Colors

**Only use semantic tokens** defined in `src/styles.css`. Never hardcode hex, oklch, or Tailwind color utilities like `text-white`, `bg-slate-900`, `bg-[#...]`.

Allowed tokens: `background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`, `sidebar*`, `chart-1..5`.

Status colors (from existing modules): use the `StatusPill` component. Do not invent new status colors.

---

## 15. Spacing

- Page container padding: `p-4 md:p-6`.
- Card padding: `p-4` or `p-6` (already set by `Card`).
- Form grid: `grid gap-4 md:grid-cols-2`.
- Toolbar gap: `gap-2`.
- Table cell padding: `px-3 py-2`.

---

## 16. Border Radius

Use theme tokens only:

| Token | Value |
| --- | --- |
| `rounded-sm` | `--radius-sm` |
| `rounded-md` | `--radius-md` |
| `rounded-lg` | `--radius-lg` (`0.625rem`) |
| `rounded-xl` | `--radius-xl` |

Buttons/inputs → `rounded-md`. Cards / table wrappers → `rounded-lg`. Pills → `rounded-full`.

---

## 17. Shadows

- Use `shadow-elevated` token from `styles.css` for raised surfaces (dialogs, popovers already inherit).
- Do not apply arbitrary `shadow-2xl` on tables/cards.

---

## 18. Animations

- Use `tw-animate-css` classes already imported in `styles.css`.
- Radix state animations are pre-wired inside each shadcn primitive — do not override.
- No custom keyframes without a design decision.

---

## 19. Responsive Rules

- Mobile-first Tailwind. Breakpoints: `sm`, `md`, `lg`, `xl`.
- Sidebar collapses to sheet on `<md` (handled by `app-sidebar.tsx`).
- Forms: `grid-cols-1 md:grid-cols-2` (or `md:grid-cols-3` for very short fields).
- Tables: wrap in `overflow-x-auto` for narrow screens — never truncate silently.

---

## 20. Accessibility Rules

- Every icon-only button uses `<IconButton label="…">` (Tooltip + aria-label).
- Every form control has an associated `<Label>` (via `FieldWrapper`).
- Dialogs must have a `<DialogTitle>` (screen-reader use only if visually hidden).
- Do not remove `focus-visible` rings from shadcn components.
- Color must never be the only signal (pair with icon or text).

---

## 21. Strict Development Rules (non-negotiable)

1. **Never redesign existing UI.**
2. **Always reuse existing components** from `components/ui/*`, `components/*`, and `master-table-kit.tsx`.
3. **Never duplicate a component** — extend or add a variant instead.
4. **Follow existing spacing** (see §15).
5. **Follow existing typography** (see §13).
6. **Follow existing colors** — semantic tokens only (see §14).
7. **Follow existing page layouts** — page title → breadcrumb → toolbar → table/form.
8. **Maintain visual consistency** — reference an existing master module before writing a new one.
9. **One module at a time**, then stop and wait for approval.
10. **Do not modify `src/components/ui/*`** except to add a new variant needed project-wide; discuss first.
11. **Do not touch** `src/routeTree.gen.ts`, `src/router.tsx`, `src/start.ts`, `src/server.ts`, `src/routes/__root.tsx` without an explicit request.
12. **No inline hex/oklch colors.** No new fonts. No new icon libraries.
