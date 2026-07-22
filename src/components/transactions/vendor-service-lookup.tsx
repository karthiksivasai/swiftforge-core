/**
 * AWB Service picker scoped to the selected Vendor via Service Mapping.
 * Inline autocomplete + search popup; empty vendor disables the field.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Loader2, Search } from "lucide-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { ERP_NAV_GROUP, ERP_NAV_ORDER, ERP_NAV_SKIP } from "@/lib/forms/erp-keyboard-nav";
import {
  filterDemoVendorServices,
  listVendorServices,
  type VendorServiceHit,
} from "@/lib/transactions/resources/vendorServices";

export type LookupPairValue = { id?: string; code: string; name: string };

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function VendorServiceLookup({
  vendor,
  value,
  onChange,
  productId,
  destinationId,
  debounceMs = 250,
  disabled,
  compact = false,
  splitCode = false,
  navOrder,
  onCommit,
}: {
  vendor: LookupPairValue;
  value: LookupPairValue;
  onChange: (v: LookupPairValue) => void;
  /** Reserved for future cascade filters. */
  productId?: string | null;
  destinationId?: string | null;
  debounceMs?: number;
  disabled?: boolean;
  compact?: boolean;
  splitCode?: boolean;
  navOrder?: number;
  onCommit?: () => void;
}) {
  const { isAuthenticated: live } = useAuth();
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const hasVendor = Boolean(vendor.id || vendor.code.trim() || vendor.name.trim());
  const locked = disabled || !hasVendor;

  const [popupOpen, setPopupOpen] = useState(false);
  const [popupQuery, setPopupQuery] = useState("");
  const [inlineOpen, setInlineOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [inlineQuery, setInlineQuery] = useState("");

  const debouncedInline = useDebouncedValue(inlineQuery, debounceMs);
  const debouncedPopup = useDebouncedValue(popupQuery, debounceMs);

  const vendorArgs = {
    vendorId: vendor.id || null,
    vendorCode: vendor.code.trim() || vendor.name.trim() || null,
    productId: productId ?? null,
    destinationId: destinationId ?? null,
  };

  const { data: liveInline, isFetching: inlineFetching } = useQuery({
    queryKey: [
      "vendor-services",
      "inline",
      vendorArgs.vendorId,
      vendorArgs.vendorCode,
      debouncedInline.trim(),
      productId ?? null,
      destinationId ?? null,
    ],
    queryFn: () =>
      listVendorServices({
        ...vendorArgs,
        q: debouncedInline.trim() || null,
        limit: 50,
      }),
    enabled: Boolean(live && hasVendor && inlineOpen),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const { data: livePopup, isFetching: popupFetching } = useQuery({
    queryKey: [
      "vendor-services",
      "popup",
      vendorArgs.vendorId,
      vendorArgs.vendorCode,
      debouncedPopup.trim(),
      productId ?? null,
      destinationId ?? null,
    ],
    queryFn: () =>
      listVendorServices({
        ...vendorArgs,
        q: debouncedPopup.trim() || null,
        limit: 100,
      }),
    enabled: Boolean(live && hasVendor && popupOpen),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const inlineHits: VendorServiceHit[] = useMemo(() => {
    if (!hasVendor || !inlineOpen) return [];
    if (live) return liveInline ?? [];
    return filterDemoVendorServices(vendor.code, vendor.name, debouncedInline);
  }, [hasVendor, inlineOpen, live, liveInline, vendor.code, vendor.name, debouncedInline]);

  const popupHits: VendorServiceHit[] = useMemo(() => {
    if (!hasVendor) return [];
    if (live) return livePopup ?? [];
    return filterDemoVendorServices(vendor.code, vendor.name, popupQuery);
  }, [hasVendor, live, livePopup, vendor.code, vendor.name, popupQuery]);

  useEffect(() => setHighlight(0), [debouncedInline, inlineOpen]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setInlineOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (hit: VendorServiceHit) => {
    onChange({ id: hit.id, code: hit.code, name: hit.name });
    setInlineOpen(false);
    setPopupOpen(false);
    setInlineQuery("");
    onCommit?.();
  };

  const openInline = (text: string) => {
    if (!hasVendor) return;
    setInlineQuery(text);
    setInlineOpen(true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!inlineOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(inlineHits.length - 1, 0)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === "Enter" && inlineHits[highlight]) {
      e.preventDefault();
      pick(inlineHits[highlight]);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setInlineOpen(false);
      return;
    }
    if (e.key === "Tab" && inlineHits[highlight]) {
      pick(inlineHits[highlight]);
    }
  };

  const emptyMsg = !hasVendor
    ? "Select a Vendor first"
    : "No services are configured for this vendor.";

  const showInlineDropdown = inlineOpen && hasVendor && inlineHits.length > 0;

  const navGroupProps =
    navOrder != null ? ({ [ERP_NAV_GROUP]: "" } as const) : undefined;
  const navOrderProps =
    navOrder != null ? ({ [ERP_NAV_ORDER]: String(navOrder) } as const) : undefined;
  const navSkipProps = { [ERP_NAV_SKIP]: "" } as const;

  return (
    <>
      <div ref={wrapRef} className="relative w-full" {...navGroupProps}>
        {splitCode ? (
          <div className="flex w-full min-w-0 items-stretch gap-1">
            <div className="lookup-name relative min-h-8 min-w-0 flex-1 overflow-hidden rounded border border-input bg-background">
              <Input
                value={value.name}
                disabled={locked}
                onChange={(e) => {
                  const name = e.target.value;
                  onChange({ ...value, id: undefined, name });
                  openInline(name);
                }}
                onFocus={() => openInline(value.name || "")}
                onKeyDown={onKeyDown}
                className={cn(
                  "min-w-0 flex-1",
                  compact ? "h-8 border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-0" : "h-9 border-0 bg-transparent shadow-none focus-visible:ring-0",
                )}
                placeholder={hasVendor ? "Service" : "Select vendor first"}
                autoComplete="off"
                role="combobox"
                aria-expanded={inlineOpen}
                aria-controls={listId}
                {...navOrderProps}
              />
            </div>
            <div className="lookup-code flex w-[5.75rem] shrink-0 items-stretch gap-1">
              <div
                className={cn(
                  "overflow-hidden rounded border border-input bg-background",
                  compact ? "h-8 w-14" : "h-9 w-20",
                )}
              >
                <Input
                  value={value.code}
                  disabled={locked}
                  onChange={(e) => {
                    const code = e.target.value;
                    onChange({ ...value, id: undefined, code });
                    openInline(code);
                  }}
                  onFocus={() => openInline(value.code || "")}
                  onKeyDown={onKeyDown}
                  className={cn(
                    "w-full",
                    compact ? "h-8 border-0 bg-transparent px-1 text-[13px] shadow-none focus-visible:ring-0" : "h-9 border-0 bg-transparent shadow-none focus-visible:ring-0",
                  )}
                  placeholder="Code"
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={inlineOpen}
                  aria-controls={listId}
                  {...(navOrder != null ? navSkipProps : {})}
                />
              </div>
              <Button
                size="icon"
                variant="outline"
                type="button"
                disabled={locked}
                className={cn(
                  "shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90 hover:text-sidebar-foreground",
                  compact ? "h-8 w-8" : "h-9 w-9",
                )}
                aria-label="Search services"
                onClick={() => {
                  setInlineOpen(false);
                  setPopupQuery("");
                  setPopupOpen(true);
                }}
                {...(navOrder != null ? navSkipProps : {})}
              >
                <Search className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-1">
            <Input
              value={value.name}
              disabled={locked}
              onChange={(e) => {
                const name = e.target.value;
                onChange({ ...value, id: undefined, name });
                openInline(name);
              }}
              onFocus={() => openInline(value.name || "")}
              onKeyDown={onKeyDown}
              className={cn("min-w-0 flex-1", compact ? "h-8 px-1.5 text-[13px]" : "h-9")}
              placeholder={hasVendor ? "Service" : "Select vendor first"}
              autoComplete="off"
              role="combobox"
              aria-expanded={inlineOpen}
              aria-controls={listId}
              {...navOrderProps}
            />
            <Input
              value={value.code}
              disabled={locked}
              onChange={(e) => {
                const code = e.target.value;
                onChange({ ...value, id: undefined, code });
                openInline(code);
              }}
              onFocus={() => openInline(value.code || "")}
              onKeyDown={onKeyDown}
              className={cn(compact ? "h-8 w-14 px-1 text-[13px]" : "h-9 w-20")}
              placeholder="Code"
              autoComplete="off"
              role="combobox"
              aria-expanded={inlineOpen}
              aria-controls={listId}
            />
            <Button
              size="icon"
              variant="outline"
              type="button"
              disabled={locked}
              className={cn(
                "shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90 hover:text-sidebar-foreground",
                compact ? "h-8 w-8" : "h-9 w-9",
              )}
              aria-label="Search services"
              onClick={() => {
                setInlineOpen(false);
                setPopupQuery("");
                setPopupOpen(true);
              }}
            >
              <Search className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
            </Button>
          </div>
        )}

        {showInlineDropdown ? (
          <div
            id={listId}
            role="listbox"
            className="absolute left-0 right-9 top-full z-50 mt-1 max-h-64 overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md"
          >
            {inlineHits.map((hit, idx) => (
              <button
                key={hit.id}
                type="button"
                role="option"
                aria-selected={idx === highlight}
                className={cn(
                  "flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm last:border-b-0",
                  idx === highlight ? "bg-accent text-accent-foreground" : "hover:bg-muted/50",
                )}
                onMouseEnter={() => setHighlight(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(hit);
                }}
              >
                <span className="min-w-0 truncate font-medium">
                  {hit.name}
                  {hit.hint ? (
                    <span className="ml-1 font-normal text-muted-foreground">({hit.hint})</span>
                  ) : null}
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {hit.code}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <Dialog
        open={popupOpen}
        onOpenChange={(o) => {
          setPopupOpen(o);
          if (!o) setPopupQuery("");
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogTitle className="text-base font-semibold">Select Service</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Vendor: {vendor.name || vendor.code || "—"}
          </p>
          <Input
            value={popupQuery}
            onChange={(e) => setPopupQuery(e.target.value)}
            placeholder="Search mapped services…"
            className="mb-2"
            autoFocus
          />
          <div className="max-h-72 overflow-auto rounded border">
            {popupFetching && popupHits.length === 0 ? (
              <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : popupHits.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyMsg}</div>
            ) : (
              popupHits.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/50"
                  onClick={() => pick(row)}
                >
                  <span className="font-medium">{row.name}</span>
                  <span className="text-muted-foreground">{row.code}</span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
