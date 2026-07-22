import { useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

export const LOOKUP_DROPDOWN_ATTR = "data-lookup-dropdown";

/** Fixed-position listbox portal so AWB lookup results are not clipped by later sections. */
export function LookupDropdownPortal({
  open,
  anchorRef,
  id,
  children,
  className,
  insetRight = 0,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  id: string;
  children: ReactNode;
  className?: string;
  /** Subtract from anchor width (e.g. search button column in split lookups). */
  insetRight?: number;
}) {
  const [style, setStyle] = useState<{ top: number; left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setStyle({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width - insetRight, 120),
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, anchorRef, insetRight]);

  if (!open || !style || typeof document === "undefined") return null;

  return createPortal(
    <div
      id={id}
      role="listbox"
      {...{ [LOOKUP_DROPDOWN_ATTR]: "" }}
      className={cn(
        "fixed z-[9999] max-h-64 overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md",
        className,
      )}
      style={{ top: style.top, left: style.left, width: style.width }}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Ignore mousedown outside lookup anchor + portaled dropdown. */
export function isLookupDropdownOutside(target: EventTarget | null, anchor: HTMLElement | null): boolean {
  if (!(target instanceof Node)) return true;
  if (anchor?.contains(target)) return false;
  if (target instanceof Element && target.closest(`[${LOOKUP_DROPDOWN_ATTR}]`)) return false;
  return true;
}
