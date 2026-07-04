# DEVELOPMENT_GUIDE.md

Workflow every developer / AI agent must follow when adding or modifying a module.

---

## Golden rule

> **Never redesign existing pages. Reuse first, extend second, create last.**

Before you touch any file, open **`DESIGN_SYSTEM.md`**, **`COMPONENTS.md`** and one existing reference module (`src/routes/master.customer.customer.tsx`). Match that pattern exactly.

---

## Step-by-step workflow

### Step 1 — Confirm scope
- One module at a time.
- Confirm with the user which module and what fields.
- Never batch multiple modules unless explicitly asked.

### Step 2 — Reuse the existing page layout
- Copy the anatomy from the closest reference module.
- Keep the exact order: `MasterBreadcrumb → h1 → toolbar → table`.

### Step 3 — Reuse existing components
- Table → `master-table-kit.tsx` primitives + `<TablePager>`.
- Form → `FieldWrapper` + shadcn `Input`/`Select`/`Textarea`/`Checkbox`.
- Lookups → `MasterLookupDialog` fed by `src/lib/master-lookups.ts` (add new datasets there, not inline).
- Icon buttons → `IconButton`.
- Confirmations → `AlertDialog`.
- Toasts → `sonner`.

### Step 4 — Implement functionality
- Add/Edit dialog with local state (or `react-hook-form` for complex forms).
- Table state: `useState` for rows + `useMemo` for filtered/paginated view.
- Column filters as an object keyed by column id.
- Global search matches across all searchable fields.
- CSV export via `downloadCsv`.
- CSV import via `<input type="file" accept=".csv">` + basic parser; validate before merging.

### Step 5 — Implement validation
- Required fields: mark with `required` on `FieldWrapper`, block submit if empty.
- Numeric ranges: validate before save; show `text-destructive text-xs` under field.
- Uniqueness: validate against existing rows in-memory.
- Zod schema when the form has more than ~6 fields or nested objects.

### Step 6 — Connect API (when backend is enabled)
- Create `src/lib/<module>.functions.ts` with `createServerFn` handlers.
- Loader: `context.queryClient.ensureQueryData(queryOptions)`.
- Component: `useSuspenseQuery(queryOptions)`.
- Mutations: `useMutation` + `queryClient.invalidateQueries`.
- Never call `supabaseAdmin` at module scope of a route or `*.functions.ts` file — dynamic import inside the handler only.

### Step 7 — Test
- Visual check against a completed reference module — spacing, radius, colors must be identical.
- Add ~3 rows, edit one, delete one, export, re-import.
- Resize to mobile — sidebar collapses, tables scroll horizontally.
- Toggle dark theme — no hardcoded colors leaking.
- Run `bun run build:dev` — no TypeScript or route-tree errors.

### Step 8 — Update `PROJECT_STATUS.md`
- Move the module from **Pending** to **Completed** with today's date.

### Step 9 — Stop and wait
- Report what was implemented (files created, components used, TODOs).
- Do not start the next module until the user approves.

---

## What NOT to do

- ❌ Do not edit `src/routeTree.gen.ts` (auto-generated).
- ❌ Do not edit `src/components/ui/*` except to add a new CVA variant.
- ❌ Do not add a new icon library, font, CSS framework, or state manager.
- ❌ Do not hardcode hex/oklch/rgb colors.
- ❌ Do not build a bespoke pagination, breadcrumb, status pill, CSV exporter, or lookup picker.
- ❌ Do not rewrite `app-sidebar.tsx` or `app-header.tsx` to "improve" them.
- ❌ Do not create `src/pages/`.
- ❌ Do not remove focus rings, aria labels, or dialog titles.

---

## Adding a route

1. Create `src/routes/<section>.<group>.<slug>.tsx`.
2. Export `Route = createFileRoute("/<section>/<group>/<slug>")({ component })`.
3. If the slug is not already in `src/lib/navigation.ts` under the correct group, add it there.
4. The Vite plugin regenerates `routeTree.gen.ts` automatically on dev/build.

---

## Adding a lookup dataset

1. Open `src/lib/master-lookups.ts`.
2. Add a new key with `title`, `hintLabel?`, `options: [{ code, name, hint? }]`.
3. Use it from a page via `<MasterLookupDialog lookup="yourKey" onSelect={…} />`.

---

## PR / commit checklist

- [ ] Followed `MODULE_TEMPLATE.md`.
- [ ] Reused existing components (no duplicates).
- [ ] No hardcoded colors, fonts, or icons outside tokens.
- [ ] Table uses `TablePager` + empty state string `No data available in table`.
- [ ] Lookups routed through `MasterLookupDialog`.
- [ ] `PROJECT_STATUS.md` updated.
- [ ] Build passes.
