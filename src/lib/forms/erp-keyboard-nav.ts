/** Configured tab order for ERP-style Enter/Tab navigation. */
export const ERP_NAV_ORDER = "data-erp-nav-order";
export const ERP_NAV_SKIP = "data-erp-nav-skip";
export const ERP_NAV_GROUP = "data-erp-nav-group";
/** Lookup fields that search on F2 / search button; Enter advances via onCommit (AWB Entry). */
export const ERP_MANUAL_SEARCH = "data-erp-manual-search";

export function erpNavOrder(order: number) {
  return { [ERP_NAV_ORDER]: String(order) } as const;
}

export function erpNavSkip() {
  return { [ERP_NAV_SKIP]: "" } as const;
}

function isVisible(el: HTMLElement): boolean {
  if (el.closest("[hidden]")) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  return el.getClientRects().length > 0;
}

/** Whether an element participates in ERP keyboard navigation. */
export function isErpNavFocusable(el: HTMLElement): boolean {
  if (!isVisible(el)) return false;
  if (el.hasAttribute(ERP_NAV_SKIP)) return false;
  if (el.closest("[disabled]")) return false;
  if (el.getAttribute("aria-disabled") === "true") return false;

  if (el instanceof HTMLInputElement) {
    if (el.type === "hidden") return false;
    if (el.disabled) return false;
    if (el.readOnly) return false;
    return true;
  }

  if (el instanceof HTMLTextAreaElement) {
    return !el.disabled && !el.readOnly;
  }

  if (el instanceof HTMLSelectElement) {
    return !el.disabled;
  }

  // Radix Select trigger, checkbox, etc.
  if (el.getAttribute("role") === "combobox") {
    return el.getAttribute("aria-disabled") !== "true";
  }

  if (el.getAttribute("role") === "checkbox") {
    return el.getAttribute("aria-disabled") !== "true";
  }

  return false;
}

/** Resolve the nav anchor when focus is on a skipped child (code box, search btn). */
export function resolveErpNavAnchor(el: HTMLElement, container: HTMLElement): HTMLElement | null {
  if (el.hasAttribute(ERP_NAV_ORDER) && isErpNavFocusable(el)) return el;

  const group = el.closest(`[${ERP_NAV_GROUP}]`);
  if (group && container.contains(group)) {
    const primary = group.querySelector<HTMLElement>(`[${ERP_NAV_ORDER}]`);
    if (primary && isErpNavFocusable(primary)) return primary;
  }

  if (isErpNavFocusable(el) && el.hasAttribute(ERP_NAV_ORDER)) return el;
  return null;
}

export function getErpNavFields(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(`[${ERP_NAV_ORDER}]`))
    .filter(isErpNavFocusable)
    .sort((a, b) => {
      const ao = Number(a.getAttribute(ERP_NAV_ORDER) ?? 0);
      const bo = Number(b.getAttribute(ERP_NAV_ORDER) ?? 0);
      return ao - bo;
    });
}

export function getErpNavOrderFromElement(el: HTMLElement, container: HTMLElement): number | null {
  const anchor = resolveErpNavAnchor(el, container) ?? el;
  const raw = anchor.getAttribute(ERP_NAV_ORDER);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function focusNextErpField(
  container: HTMLElement,
  from?: HTMLElement | null,
): HTMLElement | null {
  const fields = getErpNavFields(container);
  if (fields.length === 0) return null;

  const active = from ?? (document.activeElement as HTMLElement | null);
  let startIdx = 0;

  if (active) {
    const anchor = resolveErpNavAnchor(active, container) ?? active;
    const idx = fields.findIndex((f) => f === anchor);
    if (idx >= 0) startIdx = idx + 1;
  }

  for (let i = startIdx; i < fields.length; i++) {
    const next = fields[i];
    if (!isErpNavFocusable(next)) continue;
    next.focus();
    if (next instanceof HTMLInputElement && next.type !== "date") {
      try {
        next.select();
      } catch {
        /* ignore */
      }
    }
    return next;
  }

  return null;
}

export function focusPrevErpField(
  container: HTMLElement,
  from?: HTMLElement | null,
): HTMLElement | null {
  const fields = getErpNavFields(container);
  if (fields.length === 0) return null;

  const active = from ?? (document.activeElement as HTMLElement | null);
  let startIdx = fields.length - 1;

  if (active) {
    const anchor = resolveErpNavAnchor(active, container) ?? active;
    const idx = fields.findIndex((f) => f === anchor);
    if (idx >= 0) startIdx = idx - 1;
  }

  for (let i = startIdx; i >= 0; i--) {
    const prev = fields[i];
    if (!isErpNavFocusable(prev)) continue;
    prev.focus();
    if (prev instanceof HTMLInputElement && prev.type !== "date") {
      try {
        prev.select();
      } catch {
        /* ignore */
      }
    }
    return prev;
  }

  return null;
}

export function focusErpFieldByOrder(container: HTMLElement, order: number): HTMLElement | null {
  const el = container.querySelector<HTMLElement>(`[${ERP_NAV_ORDER}="${order}"]`);
  if (!el || !isErpNavFocusable(el)) return null;
  el.focus();
  if (el instanceof HTMLInputElement && el.type !== "date") {
    try {
      el.select();
    } catch {
      /* ignore */
    }
  }
  return el;
}

function isRadixSelectOpen(target: HTMLElement): boolean {
  return target.getAttribute("role") === "combobox" && target.getAttribute("data-state") === "open";
}

function isInlineComboboxOpen(target: HTMLElement): boolean {
  if (target.getAttribute("role") !== "combobox") return false;
  if (target.getAttribute("aria-expanded") !== "true") return false;
  const controls = target.getAttribute("aria-controls");
  if (!controls) return false;
  return Boolean(document.getElementById(controls));
}

function isInsideOpenDialog(target: HTMLElement): boolean {
  const dialog = target.closest('[role="dialog"]');
  if (!dialog) return false;
  return dialog.getAttribute("data-state") === "open" || dialog.hasAttribute("open");
}

/** Enter/Tab should advance focus (same as Tab), not submit or override widget behaviour. */
export function shouldEnterAdvanceFocus(target: HTMLElement): boolean {
  if (target.tagName === "BUTTON") return false;
  if (target.tagName === "TEXTAREA") return false;
  if (isInsideOpenDialog(target)) return false;
  if (isRadixSelectOpen(target)) return false;
  if (isInlineComboboxOpen(target)) return false;
  return true;
}

export function scheduleErpFocusAdvance(fn: () => void) {
  requestAnimationFrame(() => {
    requestAnimationFrame(fn);
  });
}
