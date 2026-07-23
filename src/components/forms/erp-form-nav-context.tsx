import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
  type RefObject,
} from "react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  erpNavOrder,
  ERP_MANUAL_SEARCH,
  ERP_NAV_ACTION,
  ERP_NAV_ACTION_NEXT_TAB,
  ERP_NAV_ACTION_PREV_TAB,
  ERP_NAV_ORDER,
  focusErpFieldByOrder,
  focusFirstErpField,
  focusNextAfterOrder,
  focusNextErpField,
  focusPrevErpField,
  resolveErpNavAction,
  resolveErpNavAnchor,
  scheduleErpFocusAdvance,
  shouldEnterAdvanceFocus,
  shouldShiftEnterAdvanceFocus,
} from "@/lib/forms/erp-keyboard-nav";

type ErpFormNavContextValue = {
  advanceFocus: (from?: HTMLElement | null) => void;
  focusFieldByOrder: (order: number) => void;
  focusFieldByOrderImmediate: (order: number) => void;
  focusNextAfterOrder: (fromOrder: number) => void;
  bindSelectChange: <T extends string>(handler: (value: T) => void) => (value: T) => void;
  bindDateChange: (handler: (value: string) => void) => (value: string) => void;
};

const ErpFormNavContext = createContext<ErpFormNavContextValue | null>(null);

export function ErpFormNavProvider({
  containerRef,
  enabled = true,
  validateBeforeAdvance,
  onAdvanceBlocked,
  onNavAction,
  children,
}: {
  containerRef: RefObject<HTMLElement | null>;
  enabled?: boolean;
  validateBeforeAdvance?: (anchor: HTMLElement) => boolean;
  onAdvanceBlocked?: (anchor: HTMLElement) => void;
  onNavAction?: (action: typeof ERP_NAV_ACTION_NEXT_TAB | typeof ERP_NAV_ACTION_PREV_TAB) => void;
  children: React.ReactNode;
}) {
  const lastNavAnchorRef = useRef<HTMLElement | null>(null);

  const resolveAdvanceFrom = useCallback(
    (from: HTMLElement | null | undefined): HTMLElement | null => {
      const container = containerRef.current;
      if (!container) return null;
      if (from instanceof HTMLElement && container.contains(from)) return from;
      if (lastNavAnchorRef.current && container.contains(lastNavAnchorRef.current)) {
        return lastNavAnchorRef.current;
      }
      return from ?? (document.activeElement as HTMLElement | null);
    },
    [containerRef],
  );

  const tryAdvance = useCallback(
    (from: HTMLElement | null | undefined, direction: "next" | "prev") => {
      const container = containerRef.current;
      if (!container || !enabled) return;

      const active = resolveAdvanceFrom(from);
      if (!active) return;

      const anchor = resolveErpNavAnchor(active, container) ?? active;
      if (validateBeforeAdvance && !validateBeforeAdvance(anchor)) {
        onAdvanceBlocked?.(anchor);
        anchor.focus();
        return;
      }

      scheduleErpFocusAdvance(() => {
        const resolved = resolveAdvanceFrom(from);
        if (direction === "next") focusNextErpField(container, resolved);
        else focusPrevErpField(container, resolved);
      });
    },
    [containerRef, enabled, validateBeforeAdvance, onAdvanceBlocked, resolveAdvanceFrom],
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

  const focusFieldByOrderImmediate = useCallback(
    (order: number) => {
      const container = containerRef.current;
      if (!container || !enabled) return;
      focusErpFieldByOrder(container, order);
    },
    [containerRef, enabled],
  );

  const focusNextAfterOrderFn = useCallback(
    (fromOrder: number) => {
      const container = containerRef.current;
      if (!container || !enabled) return;
      scheduleErpFocusAdvance(() => {
        focusNextAfterOrder(container, fromOrder);
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

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!container.contains(target)) return;
      const anchor = resolveErpNavAnchor(target, container);
      if (anchor?.hasAttribute(ERP_NAV_ORDER)) lastNavAnchorRef.current = anchor;
    };

    container.addEventListener("focusin", onFocusIn, true);
    return () => container.removeEventListener("focusin", onFocusIn, true);
  }, [containerRef, enabled]);

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
        (e.key === "Enter" || e.key === "F2" || e.key === "Tab")
      ) {
        return;
      }

      if (e.key === "Enter") {
        const navAction = resolveErpNavAction(target);
        if (navAction === ERP_NAV_ACTION_NEXT_TAB && !e.shiftKey) {
          e.preventDefault();
          onNavAction?.(ERP_NAV_ACTION_NEXT_TAB);
          scheduleErpFocusAdvance(() => {
            window.setTimeout(() => {
              const root = containerRef.current;
              if (root) focusFirstErpField(root);
            }, 0);
          });
          return;
        }
        if (navAction === ERP_NAV_ACTION_PREV_TAB && e.shiftKey) {
          e.preventDefault();
          onNavAction?.(ERP_NAV_ACTION_PREV_TAB);
          scheduleErpFocusAdvance(() => {
            window.setTimeout(() => {
              const root = containerRef.current;
              if (root) focusFirstErpField(root);
            }, 0);
          });
          return;
        }
        if (e.shiftKey) {
          if (!shouldShiftEnterAdvanceFocus(target)) return;
          e.preventDefault();
          tryAdvance(target, "prev");
          return;
        }
        if (!shouldEnterAdvanceFocus(target)) return;
        e.preventDefault();
        tryAdvance(target, "next");
        return;
      }
    };

    container.addEventListener("keydown", onKeyDown, true);
    return () => container.removeEventListener("keydown", onKeyDown, true);
  }, [containerRef, enabled, onNavAction, tryAdvance]);

  const value = useMemo(
    () => ({
      advanceFocus,
      focusFieldByOrder,
      focusFieldByOrderImmediate,
      focusNextAfterOrder: focusNextAfterOrderFn,
      bindSelectChange,
      bindDateChange,
    }),
    [
      advanceFocus,
      focusFieldByOrder,
      focusFieldByOrderImmediate,
      focusNextAfterOrderFn,
      bindSelectChange,
      bindDateChange,
    ],
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

type ErpNavSelectItem = { value: string; label: string };

/** Radix Select registered in ERP navigation order. */
export function ErpNavSelect({
  order,
  value,
  onValueChange,
  nextOrder,
  disabled,
  placeholder,
  triggerClassName,
  contentClassName,
  items,
}: {
  order: number;
  value: string | undefined;
  onValueChange: (value: string) => void;
  nextOrder?: number;
  disabled?: boolean;
  placeholder?: string;
  triggerClassName?: string;
  contentClassName?: string;
  items: readonly ErpNavSelectItem[] | readonly string[];
}) {
  const { onValueChange: onNavChange, contentProps, itemProps } = useErpSelectNav(
    onValueChange,
    { nextOrder, fromOrder: order },
  );
  const normalizedItems: ErpNavSelectItem[] =
    items.length > 0 && typeof items[0] === "string"
      ? (items as readonly string[]).map((v) => ({ value: v, label: v }))
      : [...(items as readonly ErpNavSelectItem[])];

  return (
    <Select value={value} onValueChange={onNavChange} disabled={disabled}>
      <SelectTrigger className={triggerClassName} {...erpNavOrder(order)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={contentClassName} {...contentProps}>
        {normalizedItems.map((item) => (
          <SelectItem key={item.value} value={item.value} {...itemProps}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
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
        nav?.focusNextAfterOrder(order);
      }}
    />
  );
}

/** Wrap Radix Select value change + content/item props for ERP keyboard navigation. */
export function useErpSelectNav<T extends string>(
  handler: (value: T) => void,
  opts?: { nextOrder?: number; fromOrder?: number },
) {
  const nav = useErpFormNavOptional();
  const shouldFocusNextRef = useRef(false);
  const fromOrderRef = useRef(opts?.fromOrder);

  fromOrderRef.current = opts?.fromOrder;

  const markSelectionCommitted = useCallback(() => {
    shouldFocusNextRef.current = true;
  }, []);

  const focusAfterSelectClose = useCallback(() => {
    window.setTimeout(() => {
      if (opts?.nextOrder != null) {
        nav?.focusFieldByOrderImmediate(opts.nextOrder);
        return;
      }
      if (fromOrderRef.current != null) {
        nav?.focusNextAfterOrder(fromOrderRef.current);
        return;
      }
      nav?.advanceFocus();
    }, 0);
  }, [nav, opts?.nextOrder]);

  const onValueChange = useCallback(
    (value: T) => {
      handler(value);
      markSelectionCommitted();
    },
    [handler, markSelectionCommitted],
  );

  const onCloseAutoFocus = useCallback(
    (event: Event) => {
      if (!shouldFocusNextRef.current) return;
      event.preventDefault();
      shouldFocusNextRef.current = false;
      focusAfterSelectClose();
    },
    [focusAfterSelectClose],
  );

  const onEscapeKeyDown = useCallback(() => {
    shouldFocusNextRef.current = false;
  }, []);

  const onKeyDownCapture = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Enter") markSelectionCommitted();
    },
    [markSelectionCommitted],
  );

  const itemProps = useMemo(
    () => ({
      onSelect: () => markSelectionCommitted(),
    }),
    [markSelectionCommitted],
  );

  return {
    onValueChange,
    contentProps: { onCloseAutoFocus, onEscapeKeyDown, onKeyDownCapture },
    itemProps,
  };
}

/** @deprecated Prefer useErpSelectNav and spread `contentProps` onto SelectContent. */
export function useErpSelectHandler<T extends string>(
  handler: (value: T) => void,
  opts?: { nextOrder?: number },
) {
  return useErpSelectNav(handler, opts).onValueChange;
}

/** Callback for lookup components after a value is committed. */
export function useErpNavCommit() {
  const nav = useErpFormNavOptional();
  return useCallback(() => {
    nav?.advanceFocus();
  }, [nav]);
}
