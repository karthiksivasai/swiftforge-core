import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type RefObject,
} from "react";

import { Input } from "@/components/ui/input";
import {
  erpNavOrder,
  ERP_MANUAL_SEARCH,
  focusErpFieldByOrder,
  focusNextErpField,
  focusPrevErpField,
  resolveErpNavAnchor,
  scheduleErpFocusAdvance,
  shouldEnterAdvanceFocus,
} from "@/lib/forms/erp-keyboard-nav";

type ErpFormNavContextValue = {
  advanceFocus: (from?: HTMLElement | null) => void;
  focusFieldByOrder: (order: number) => void;
  bindSelectChange: <T extends string>(handler: (value: T) => void) => (value: T) => void;
  bindDateChange: (handler: (value: string) => void) => (value: string) => void;
};

const ErpFormNavContext = createContext<ErpFormNavContextValue | null>(null);

export function ErpFormNavProvider({
  containerRef,
  enabled = true,
  validateBeforeAdvance,
  onAdvanceBlocked,
  children,
}: {
  containerRef: RefObject<HTMLElement | null>;
  enabled?: boolean;
  validateBeforeAdvance?: (anchor: HTMLElement) => boolean;
  onAdvanceBlocked?: (anchor: HTMLElement) => void;
  children: React.ReactNode;
}) {
  const tryAdvance = useCallback(
    (from: HTMLElement | null | undefined, direction: "next" | "prev") => {
      const container = containerRef.current;
      if (!container || !enabled) return;

      const active = from ?? (document.activeElement as HTMLElement | null);
      if (!active) return;

      const anchor = resolveErpNavAnchor(active, container) ?? active;
      if (validateBeforeAdvance && !validateBeforeAdvance(anchor)) {
        onAdvanceBlocked?.(anchor);
        anchor.focus();
        return;
      }

      scheduleErpFocusAdvance(() => {
        if (direction === "next") focusNextErpField(container, active);
        else focusPrevErpField(container, active);
      });
    },
    [containerRef, enabled, validateBeforeAdvance, onAdvanceBlocked],
  );

  const advanceFocus = useCallback(
    (from?: HTMLElement | null) => {
      tryAdvance(from, "next");
    },
    [tryAdvance],
  );

  const focusFieldByOrder = useCallback(
    (order: number) => {
      const container = containerRef.current;
      if (!container || !enabled) return;
      scheduleErpFocusAdvance(() => {
        focusErpFieldByOrder(container, order);
      });
    },
    [containerRef, enabled],
  );

  const bindSelectChange = useCallback(
    <T extends string>(handler: (value: T) => void) =>
      (value: T) => {
        handler(value);
        advanceFocus();
      },
    [advanceFocus],
  );

  const bindDateChange = useCallback(
    (handler: (value: string) => void) =>
      (value: string) => {
        handler(value);
        advanceFocus();
      },
    [advanceFocus],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (!container.contains(target)) return;
      if (
        target.closest(`[${ERP_MANUAL_SEARCH}]`) &&
        (e.key === "Enter" || e.key === "F2")
      ) {
        return;
      }
      if (!shouldEnterAdvanceFocus(target)) return;

      if (e.key === "Enter") {
        if (e.shiftKey) return;
        e.preventDefault();
        tryAdvance(target, "next");
        return;
      }

      if (e.key === "Tab") {
        e.preventDefault();
        tryAdvance(target, e.shiftKey ? "prev" : "next");
      }
    };

    container.addEventListener("keydown", onKeyDown, true);
    return () => container.removeEventListener("keydown", onKeyDown, true);
  }, [containerRef, enabled, tryAdvance]);

  const value = useMemo(
    () => ({ advanceFocus, focusFieldByOrder, bindSelectChange, bindDateChange }),
    [advanceFocus, focusFieldByOrder, bindSelectChange, bindDateChange],
  );

  return <ErpFormNavContext.Provider value={value}>{children}</ErpFormNavContext.Provider>;
}

export function useErpFormNav() {
  const ctx = useContext(ErpFormNavContext);
  if (!ctx) {
    throw new Error("useErpFormNav must be used within ErpFormNavProvider");
  }
  return ctx;
}

export function useErpFormNavOptional() {
  return useContext(ErpFormNavContext);
}

/** Plain input registered in ERP navigation order. */
export function ErpNavInput({
  order,
  onValueChange,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "onChange"> & {
  order: number;
  onValueChange?: (value: string) => void;
}) {
  return (
    <Input
      {...props}
      {...erpNavOrder(order)}
      onChange={(e) => onValueChange?.(e.target.value)}
    />
  );
}

/** Date input that advances focus after a value is picked. */
export function ErpNavDateInput({
  order,
  onValueChange,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "onChange" | "type"> & {
  order: number;
  onValueChange: (value: string) => void;
}) {
  const nav = useErpFormNavOptional();
  return (
    <Input
      type="date"
      {...props}
      {...erpNavOrder(order)}
      onChange={(e) => {
        onValueChange(e.target.value);
        nav?.advanceFocus();
      }}
    />
  );
}

/** Wrap a Radix Select onValueChange to advance focus after selection. */
export function useErpSelectHandler<T extends string>(handler: (value: T) => void) {
  const nav = useErpFormNavOptional();
  return useCallback(
    (value: T) => {
      handler(value);
      nav?.advanceFocus();
    },
    [handler, nav],
  );
}

/** Callback for lookup components after a value is committed. */
export function useErpNavCommit() {
  const nav = useErpFormNavOptional();
  return useCallback(() => {
    nav?.advanceFocus();
  }, [nav]);
}
