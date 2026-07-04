# PROMPT_GUIDE.md

Recommended prompts to use with the AI agent working on this repository. These prompts encode the project rules so the agent stays consistent.

---

## Core phrases to include in every prompt

- "Implement only this module."
- "Reuse existing components from `components/ui/` and `master-table-kit.tsx`."
- "Do not redesign any existing page."
- "Maintain consistency with `master.customer.customer.tsx` as the reference."
- "Follow `docs/PROJECT_RULES.md`, `docs/DESIGN_SYSTEM.md`, `docs/COMPONENTS.md`, and `docs/MODULE_TEMPLATE.md`."
- "Stop after implementation and wait for approval."

Paste the block above into every module request.

---

## Prompt: implement a new master module

```
Implement only the <MODULE NAME> module at /master/<group>/<slug>.

Reference module (copy structure): src/routes/master.customer.customer.tsx.

Use the shared toolkit from src/components/master-table-kit.tsx:
- FieldWrapper, IconButton, TablePager, MasterBreadcrumb, StatusPill, downloadCsv, PAGE_SIZE.

For lookups use <MasterLookupDialog lookup="..."> from src/components/master-lookup-dialog.tsx.
Add any missing lookup datasets to src/lib/master-lookups.ts — do NOT inline options in the page.

Fields:
- <field 1> — type, required?, lookup?
- <field 2> — ...

Rules:
- Do not redesign. Match the existing spacing, colors, radii, typography.
- No hardcoded hex/oklch colors — semantic tokens only.
- No new packages. No new icon libraries. No new fonts.
- Empty state string is "No data available in table".
- Delete uses AlertDialog. Add/Edit uses Dialog.
- Include CSV import and export.

Update docs/PROJECT_STATUS.md when done. Stop and wait for approval before the next module.
```

---

## Prompt: fix an issue without changing UI

```
Fix <bug description> in <file/route>.

Constraints:
- Do not change any UI, spacing, colors, or component structure.
- Reuse existing helpers; do not introduce new components.
- Verify the fix with a build (bun run build:dev) or preview screenshot.
- Report what changed in one sentence.
```

---

## Prompt: wire the backend for a completed module

```
Wire the <MODULE NAME> module to Lovable Cloud.

- Create src/lib/<module>.functions.ts with createServerFn handlers for list/create/update/delete.
- Use requireSupabaseAuth middleware on every handler.
- Loader uses queryClient.ensureQueryData; component uses useSuspenseQuery.
- Add a Supabase migration under supabase/migrations/ with:
  - CREATE TABLE public.<module> ...
  - GRANT statements to authenticated and service_role
  - ALTER TABLE ... ENABLE ROW LEVEL SECURITY
  - RLS policies scoped by tenant / role using public.has_role()
- Do not import client.server at module scope — dynamic import inside handler only.
- Do not modify UI other than swapping in-memory state for the query hooks.
```

---

## Prompt: audit a page for design-system compliance

```
Audit src/routes/<file>.tsx against docs/DESIGN_SYSTEM.md and docs/PROJECT_RULES.md.

Report:
- Any hardcoded colors, fonts, or spacing values.
- Any duplicated components that should use master-table-kit or shadcn primitives.
- Any missing empty state / pager / breadcrumb / lookup usage.

Do NOT change any code. Output a checklist only.
```

---

## Prompt: add a lookup dataset

```
Add a new lookup "<key>" to src/lib/master-lookups.ts with:
- title: "..."
- hintLabel: "..." (optional)
- options: [{ code, name, hint? }, ...]

Do not modify MasterLookupDialog. Report the key so I can use it in the field.
```

---

## What NOT to ask the agent to do

- ❌ "Redesign the sidebar / header."
- ❌ "Make it look more modern."
- ❌ "Use Material UI / Ant Design / Chakra."
- ❌ "Add a new color."
- ❌ "Implement all remaining modules in one go."
- ❌ "Replace shadcn with your own components."
- ❌ "Edit src/routeTree.gen.ts."

Any of these violate `PROJECT_RULES.md`. If a change genuinely requires deviating, discuss it explicitly before implementation.
