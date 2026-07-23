/** Configured tab order for ERP-style Enter navigation. */
export const ERP_NAV_ORDER = "data-erp-nav-order";
export const ERP_NAV_SKIP = "data-erp-nav-skip";
export const ERP_NAV_GROUP = "data-erp-nav-group";
/** Lookup fields that search on F2 / search button; Enter advances via onCommit (AWB Entry). */
export const ERP_MANUAL_SEARCH = "data-erp-manual-search";
/** Optional Enter action for nav buttons (e.g. switch tab instead of moving to the next sibling). */
export const ERP_NAV_ACTION = "data-erp-nav-action";
export const ERP_NAV_ACTION_NEXT_TAB = "next-tab";
export const ERP_NAV_ACTION_PREV_TAB = "prev-tab";

export function erpNavOrder(order: number) {
  return { [ERP_NAV_ORDER]: String(order) } as const;
}

export function erpNavSkip() {
  return { [ERP_NAV_SKIP]: "" } as const;
}

export function erpNavAction(action: typeof ERP_NAV_ACTION_NEXT_TAB | typeof ERP_NAV_ACTION_PREV_TAB) {
  return { [ERP_NAV_ACTION]: action } as const;
}

function isVisible(el: HTMLElement): boolean {
  if (el.closest("[hidden]")) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  return el.getClientRects().length > 0;
}

export function parseErpNavOrder(el: HTMLElement): number | null {
  const raw = el.getAttribute(ERP_NAV_ORDER);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Whether an element participates in ERP keyboard navigation. */
export function isErpNavFocusable(el: HTMLElement): boolean {
  if (!isVisible(el)) return false;
  if (el.hasAttribute(ERP_NAV_SKIP)) return false;
  if (el.closest("[disabled]")) return false;
  if (el.getAttribute("aria-disabled") === "true") return false;
  if (!el.hasAttribute(ERP_NAV_ORDER)) return false;

  if (el instanceof HTMLInputElement) {
    if (el.type === "hidden") return false;
    if (el.disabled) return false;
    if (el.readOnly && el.type !== "file") return true;
    return true;
  }

  if (el instanceof HTMLTextAreaElement) {
    return !el.disabled && !el.readOnly;
  }

  if (el instanceof HTMLSelectElement) {
    return !el.disabled;
  }

  if (el instanceof HTMLButtonElement) {
    return !el.disabled;
  }

  if (el.getAttribute("role") === "combobox") {
    return el.getAttribute("aria-disabled") !== "true";
  }

  if (el.getAttribute("role") === "checkbox" || el.getAttribute("role") === "radio") {
    return el.getAttribute("aria-disabled") !== "true";
  }

  return true;
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

function collectNavAnchors(container: HTMLElement): HTMLElement[] {
  const fields: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();

  for (const el of container.querySelectorAll<HTMLElement>(`[${ERP_NAV_ORDER}]`)) {
    const anchor = resolveErpNavAnchor(el, container) ?? el;
    if (isErpNavFocusable(anchor) && !seen.has(anchor)) {
      seen.add(anchor);
      fields.push(anchor);
    }
  }

  return fields.sort(
    (a, b) => (parseErpNavOrder(a) ?? 0) - (parseErpNavOrder(b) ?? 0),
  );
}

export function getErpNavFields(container: HTMLElement): HTMLElement[] {
  return collectNavAnchors(container);
}

export function getErpNavOrderFromElement(el: HTMLElement, container: HTMLElement): number | null {
  const anchor = resolveErpNavAnchor(el, container) ?? el;
  return parseErpNavOrder(anchor);
}

function focusNavField(el: HTMLElement): HTMLElement {
  el.focus();
  if (el instanceof HTMLInputElement && el.type !== "date" && el.type !== "file") {
    try {
      el.select();
    } catch {
      /* ignore */
    }
  }
  return el;
}

export function focusNextAfterOrder(container: HTMLElement, fromOrder: number): HTMLElement | null {
  const fields = getErpNavFields(container);
  for (const field of fields) {
    const order = parseErpNavOrder(field);
    if (order != null && order > fromOrder) return focusNavField(field);
  }
  return null;
}

export function focusPrevBeforeOrder(container: HTMLElement, fromOrder: number): HTMLElement | null {
  const fields = getErpNavFields(container);
  let candidate: HTMLElement | null = null;
  for (const field of fields) {
    const order = parseErpNavOrder(field);
    if (order != null && order < fromOrder) candidate = field;
    if (order != null && order >= fromOrder) break;
  }
  return candidate ? focusNavField(candidate) : null;
}

function resolveFromOrder(
  container: HTMLElement,
  from?: HTMLElement | null,
): number | null {
  if (!(from instanceof HTMLElement)) return null;
  if (!container.contains(from) && from !== document.body) {
    return null;
  }
  return getErpNavOrderFromElement(from, container);
}

export function focusNextErpField(
  container: HTMLElement,
  from?: HTMLElement | null,
): HTMLElement | null {
  const fromOrder = resolveFromOrder(container, from ?? (document.activeElement as HTMLElement | null));
  if (fromOrder != null) return focusNextAfterOrder(container, fromOrder);
  return null;
}

export function focusFirstErpField(container: HTMLElement): HTMLElement | null {
  const fields = getErpNavFields(container);
  for (const field of fields) {
    if (!isErpNavFocusable(field)) continue;
    return focusNavField(field);
  }
  return null;
}

export function focusPrevErpField(
  container: HTMLElement,
  from?: HTMLElement | null,
): HTMLElement | null {
  const fromOrder = resolveFromOrder(container, from ?? (document.activeElement as HTMLElement | null));
  if (fromOrder != null) return focusPrevBeforeOrder(container, fromOrder);
  return null;
}

export function focusErpFieldByOrder(container: HTMLElement, order: number): HTMLElement | null {
  const el = container.querySelector<HTMLElement>(`[${ERP_NAV_ORDER}="${order}"]`);
  if (!el || !isErpNavFocusable(el)) return null;
  return focusNavField(el);
}

function isRadixSelectTrigger(target: HTMLElement): boolean {
  return target.getAttribute("role") === "combobox";
}

function isRadixSelectOpen(target: HTMLElement): boolean {
  return isRadixSelectTrigger(target) && target.getAttribute("data-state") === "open";
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

function resolveNavAction(target: HTMLElement): string | null {
  const el = target.closest<HTMLElement>(`[${ERP_NAV_ACTION}]`);
  return el?.getAttribute(ERP_NAV_ACTION) ?? null;
}

export function resolveErpNavAction(target: HTMLElement): string | null {
  return resolveNavAction(target);
}

function isNavButton(target: HTMLElement): boolean {
  return target.tagName === "BUTTON" || target.getAttribute("role") === "button";
}

function participatesInDataEntryNav(target: HTMLElement): boolean {
  const anchor = target.hasAttribute(ERP_NAV_ORDER)
    ? target
    : target.closest<HTMLElement>(`[${ERP_NAV_ORDER}]`);
  return Boolean(anchor && !anchor.hasAttribute(ERP_NAV_SKIP));
}

/** Enter should advance focus, not submit or override widget behaviour. */
export function shouldEnterAdvanceFocus(target: HTMLElement): boolean {
  if (target.tagName === "TEXTAREA") return false;
  if (isInsideOpenDialog(target)) return false;
  if (isRadixSelectOpen(target)) return false;
  if (isInlineComboboxOpen(target)) return false;
  if (isRadixSelectTrigger(target)) return false;
  if (isNavButton(target)) return participatesInDataEntryNav(target);
  return participatesInDataEntryNav(target);
}

/** Shift+Enter uses the same gating as Enter. Tab keeps native browser behaviour. */
export function shouldShiftEnterAdvanceFocus(target: HTMLElement): boolean {
  return shouldEnterAdvanceFocus(target);
}

export function scheduleErpFocusAdvance(fn: () => void) {
  requestAnimationFrame(() => {
    requestAnimationFrame(fn);
  });
}
