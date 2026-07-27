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

import { ChevronDown } from "lucide-react";

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
  ERP_NAV_ACTIVE,
  ERP_NAV_ORDER,
  focusErpFieldByOrder,
  focusFirstErpField,
  focusNextAfterOrder,
  focusNextErpField,
  focusPrevBeforeOrder,
  focusPrevErpField,
  isDateInputNavField,
  peekNextErpField,
  peekPrevErpField,
  resolveErpNavAction,
  resolveErpNavAnchor,
  scheduleErpFocusAdvance,
  shouldEnterAdvanceFocus,
  shouldShiftEnterAdvanceFocus,
} from "@/lib/forms/erp-keyboard-nav";
import { cn } from "@/lib/utils";

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
  const activeNavAnchorRef = useRef<HTMLElement | null>(null);

  const clearActiveNavAnchor = useCallback(() => {
    activeNavAnchorRef.current?.removeAttribute(ERP_NAV_ACTIVE);
    activeNavAnchorRef.current = null;
  }, []);

  const setActiveNavAnchor = useCallback((anchor: HTMLElement | null) => {
    if (activeNavAnchorRef.current === anchor) return;
    clearActiveNavAnchor();
    if (!anchor) return;
    anchor.setAttribute(ERP_NAV_ACTIVE, "");
    activeNavAnchorRef.current = anchor;
  }, [clearActiveNavAnchor]);

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

      const resolved = resolveAdvanceFrom(from);
      if (!resolved) return;

      const anchor = resolveErpNavAnchor(resolved, container) ?? resolved;
      if (validateBeforeAdvance && !validateBeforeAdvance(anchor)) {
        onAdvanceBlocked?.(anchor);
        anchor.focus();
        return;
      }

      const target =
        direction === "next"
          ? peekNextErpField(container, resolved)
          : peekPrevErpField(container, resolved);
      if (target && isDateInputNavField(target)) {
        if (direction === "next") focusNextErpField(container, resolved);
        else focusPrevErpField(container, resolved);
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
      if (anchor?.hasAttribute(ERP_NAV_ORDER)) {
        setActiveNavAnchor(anchor);
        lastNavAnchorRef.current = anchor;
        return;
      }
      clearActiveNavAnchor();
    };

    const onFocusOut = (event: FocusEvent) => {
      const related = event.relatedTarget;
      if (related instanceof HTMLElement && container.contains(related)) return;
      clearActiveNavAnchor();
    };

    container.addEventListener("focusin", onFocusIn, true);
    container.addEventListener("focusout", onFocusOut, true);
    return () => {
      container.removeEventListener("focusin", onFocusIn, true);
      container.removeEventListener("focusout", onFocusOut, true);
      clearActiveNavAnchor();
    };
  }, [clearActiveNavAnchor, containerRef, enabled, setActiveNavAnchor]);

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

function findErpNavContainer(from: HTMLElement): HTMLElement {
  let node: HTMLElement | null = from;
  while (node) {
    if (node.querySelectorAll(`[${ERP_NAV_ORDER}]`).length > 1) return node;
    node = node.parentElement;
  }
  return from.ownerDocument.body;
}

/** Cycle options with arrow keys; Enter advances without opening a dropdown. */
export function ErpNavCycleSelect({
  order,
  value,
  onValueChange,
  items,
  nextOrder,
  placeholder = "Select",
  className,
  disabled,
}: {
  order: number;
  value: string | undefined;
  onValueChange: (value: string) => void;
  items: readonly string[];
  nextOrder?: number;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const nav = useErpFormNavOptional();

  const cycle = useCallback(
    (delta: number) => {
      const list = [...items];
      if (list.length === 0) return;
      const idx = value ? list.indexOf(value) : -1;
      let next =
        idx === -1
          ? delta > 0
            ? 0
            : list.length - 1
          : idx + delta;
      if (next < 0) next = list.length - 1;
      if (next >= list.length) next = 0;
      onValueChange(list[next]!);
    },
    [items, onValueChange, value],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        cycle(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        cycle(-1);
        return;
      }
      if (event.key === "Enter" && event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        focusPrevBeforeOrder(findErpNavContainer(event.currentTarget), order);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        if (nextOrder != null) nav?.focusFieldByOrderImmediate(nextOrder);
        else nav?.focusNextAfterOrder(order);
      }
    },
    [cycle, nav, nextOrder, order],
  );

  return (
    <div className="w-full min-w-0" {...{ [ERP_MANUAL_SEARCH]: "" }}>
      <button
        type="button"
        disabled={disabled}
        className={cn(
          "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          !value && "text-muted-foreground",
          className,
        )}
        {...erpNavOrder(order)}
        onKeyDown={onKeyDown}
      >
        <span className="truncate">{value || placeholder}</span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
      </button>
    </div>
  );
}

/** Date input that advances focus after a value is picked. */
export function ErpNavDateInput({
  order,
  onValueChange,
  onFocus,
  openPickerOnFocus = true,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "onChange" | "type" | "onFocus"> & {
  order: number;
  onValueChange: (value: string) => void;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  openPickerOnFocus?: boolean;
}) {
  const nav = useErpFormNavOptional();

  const handleFocus = useCallback(
    (event: React.FocusEvent<HTMLInputElement>) => {
      onFocus?.(event);
      if (!openPickerOnFocus) return;
      try {
        if (typeof event.currentTarget.showPicker === "function") {
          event.currentTarget.showPicker();
        }
      } catch {
        /* Some browsers block showPicker without a user gesture. */
      }
    },
    [onFocus, openPickerOnFocus],
  );

  return (
    <Input
      type="date"
      {...props}
      {...erpNavOrder(order)}
      onFocus={handleFocus}
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

/** Callback for lookup/pincode components after a value is committed. */
export function useErpNavCommit(fromOrder?: number) {
  const nav = useErpFormNavOptional();
  return useCallback(() => {
    if (fromOrder != null) nav?.focusNextAfterOrder(fromOrder);
    else nav?.advanceFocus();
  }, [nav, fromOrder]);
}
