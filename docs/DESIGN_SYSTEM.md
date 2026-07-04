# DESIGN_SYSTEM.md

Single source of truth for the UI of the Courier Management System. All values are already defined in `src/styles.css` and the shadcn components under `src/components/ui/`. **Never hardcode a value — always reference a token.**

---

## 1. Color Palette (semantic tokens, oklch)

Defined in `src/styles.css` under `:root` and `.dark`.

### Light mode

| Token | Purpose |
| --- | --- |
| `--background` `oklch(0.985 0.006 85)` | App canvas — warm off-white paper |
| `--foreground` `oklch(0.24 0.012 60)` | Body text |
| `--card` `oklch(1 0 0)` | Card / dialog surface |
| `--primary` `oklch(0.28 0.014 60)` | Warm charcoal — primary buttons, active states |
| `--secondary` `oklch(0.955 0.01 80)` | Subtle surface |
| `--muted` `oklch(0.955 0.01 80)` | Muted surface |
| `--muted-foreground` `oklch(0.52 0.014 65)` | Secondary text, labels |
| `--accent` `oklch(0.94 0.018 145)` | Sage — hover, subtle highlights |
| `--destructive` `oklch(0.55 0.19 27)` | Delete, error |
| `--border` / `--input` `oklch(0.9 0.01 80)` | Borders, input outlines |
| `--ring` `oklch(0.55 0.05 150)` | Focus ring |
| `--sidebar` `oklch(0.24 0.04 260)` | Deep navy sidebar |
| `--sidebar-foreground` `oklch(0.96 0.008 250)` | Sidebar text |
| `--sidebar-accent` `oklch(1 0 0)` | White card items in sidebar |

Dark mode mirrors the same tokens with adjusted lightness. Component code must use Tailwind classes (`bg-primary`, `text-muted-foreground`, `border-border`, …) — never hex.

### Chart colors
`--chart-1 … --chart-5` — sage, amber, terracotta, blue, plum. Use in order for charts.

### Status colors (via `StatusPill`)
- **Active** → `bg-emerald-500/10 text-emerald-600 dark:text-emerald-400`
- **In-Active** → `bg-muted text-muted-foreground`

---

## 2. Typography

| Style | Class |
| --- | --- |
| Font family | `Inter`, ui-sans-serif (via `--font-sans`) |
| Page title | `text-2xl font-semibold tracking-tight` |
| Section title | `text-lg font-semibold` |
| Card title | `text-base font-semibold` |
| Body | `text-sm` (default in tables/forms) |
| Field label | `text-xs font-medium text-muted-foreground` |
| Table header | `text-xs font-medium` (uppercase optional) |
| Helper / error | `text-xs text-muted-foreground` / `text-xs text-destructive` |
| Mono (codes) | `font-mono text-xs` |

---

## 3. Heading Sizes

- `h1` — `text-2xl font-semibold tracking-tight` (page title)
- `h2` — `text-xl font-semibold`
- `h3` — `text-lg font-semibold`
- `h4` — `text-base font-semibold`

---

## 4. Card Styles

`components/ui/card.tsx`:
- Wrapper: `rounded-lg border bg-card text-card-foreground shadow-elevated`
- Header: `flex flex-col space-y-1.5 p-6`
- Content: `p-6 pt-0`
- Table cards omit `Card` and use `rounded-lg border bg-card` directly.

---

## 5. Input Styles

`components/ui/input.tsx`:
- Height: `h-9`, radius `rounded-md`, border `border-input`, background `bg-background`.
- Focus: `ring-2 ring-ring ring-offset-background`.
- File inputs, textareas (`textarea.tsx`), and select triggers (`select.tsx`) share the same visual language.

---

## 6. Button Variants

`components/ui/button.tsx` (CVA):

| Variant | Use |
| --- | --- |
| `default` | Primary action (Save, Submit) |
| `secondary` | Secondary action |
| `outline` | Toolbar / icon buttons (IconButton wraps this) |
| `ghost` | Sidebar items, subtle actions |
| `destructive` | Delete confirmation |
| `link` | Inline links |

Sizes: `sm` (`h-8`), `default` (`h-9`), `lg` (`h-10`), `icon` (`h-9 w-9`).

---

## 7. Table Styles

Reference: `master.customer.customer.tsx`, `master.customer.consignee.tsx`.

- Wrapper: `overflow-hidden rounded-lg border bg-card`.
- `<table class="w-full text-sm">`.
- `<thead>`: `bg-sidebar text-sidebar-foreground`.
- `<th>`: `px-3 py-2 text-left font-medium`.
- Column filter row: `<tr>` under thead, each cell contains an `<Input class="h-8">`.
- `<tbody>`: rows have `border-t hover:bg-muted/60`.
- `<td>`: `px-3 py-2`.
- Actions cell: right-aligned, `IconButton`s for edit/delete.

### Empty state
```
No data available in table
```
Rendered as a full-span `<tr>` with `px-3 py-6 text-center text-muted-foreground`.

### Loading state
Use `components/ui/skeleton.tsx` rows (`<Skeleton class="h-4 w-full" />`) inside `<tbody>` while data resolves.

---

## 8. Badge Styles

`components/ui/badge.tsx` variants: `default`, `secondary`, `outline`, `destructive`. Use `StatusPill` for Active/In-Active — do not reinvent.

---

## 9. Search Bar Style

Standard search input (see `master-lookup-dialog.tsx`):

```
<div class="relative">
  <Search class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
  <Input class="pl-8" placeholder="Search..." />
</div>
```

Global table search sits top-left of the toolbar. Column filters sit under the table headers.

---

## 10. Filter Style

- Column filters: `<Input class="h-8">` per column, placeholder = column name.
- Multi-select filters: `components/ui/select.tsx`.
- Date filters: `<Calendar>` inside `<Popover>` (react-day-picker).

---

## 11. Drawer / Sheet Style

- `components/ui/sheet.tsx` — right-side panels, width `sm:max-w-md` / `sm:max-w-lg`.
- `components/ui/drawer.tsx` (vaul) — mobile bottom sheets only.
- Header: `SheetHeader` with `SheetTitle` (mandatory) + `SheetDescription`.

---

## 12. Modal / Dialog Style

`components/ui/dialog.tsx`:
- Overlay: `bg-black/50 backdrop-blur-sm` (from primitive).
- Content: centered, `max-w-lg` default, `rounded-lg`, `shadow-elevated`, `p-6`.
- Header: `DialogHeader` → `DialogTitle` (required for a11y).
- Footer: `DialogFooter` → cancel (`variant="ghost"` or `outline`) then primary action.

`components/ui/alert-dialog.tsx` — destructive confirmations. Primary action uses `variant="destructive"`.

---

## 13. Tabs Style

`components/ui/tabs.tsx`:
- `TabsList`: `inline-flex h-9 items-center rounded-md bg-muted p-1`.
- `TabsTrigger`: active state uses `bg-background text-foreground shadow-sm`.

---

## 14. Breadcrumb Style

Use `<MasterBreadcrumb trail={[...]}>` from `master-table-kit.tsx` — it wraps `components/ui/breadcrumb.tsx` and always starts with a Home link. Never render a custom breadcrumb.

---

## 15. Page Header Layout

Every module page follows this vertical rhythm:

```
<div class="flex flex-col gap-4 p-4 md:p-6">
  <MasterBreadcrumb trail={["Master", "Customer", "Customer"]} />
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-semibold tracking-tight">Customer</h1>
    <div class="flex items-center gap-2">
      <IconButton …/>  {/* Add, Import, Export, Refresh */}
    </div>
  </div>
  {/* Table or form card */}
</div>
```

---

## 16. Spacing Scale (Tailwind)

Use only: `1, 1.5, 2, 3, 4, 6, 8, 12`. Larger gaps (`gap-16`, `p-24`) are not part of the system.

---

## 17. Border Radius

`--radius = 0.625rem`. Derived: `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`. Pills use `rounded-full`.

---

## 18. Shadow

- `shadow-elevated` — the only project shadow. Applied to cards, dialogs, popovers.
- Do not use `shadow-md`, `shadow-lg`, `shadow-2xl` directly.

---

## 19. Icon Sizes

- Buttons: `h-4 w-4`
- Page header actions: `h-4 w-4`
- Empty state / hero: `h-8 w-8` or `h-10 w-10`, `text-muted-foreground`
- Chip icons: `h-3.5 w-3.5`

---

## 20. Motion

- Radix primitives ship transitions — keep them.
- `tw-animate-css` provides `animate-in`, `animate-out`, `fade-in`, etc.
- No custom keyframes without approval.
