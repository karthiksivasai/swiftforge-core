/**
 * Code + Name lookup pair with:
 *  - inline autocomplete while typing (same data source as the popup)
 *  - magnifying-glass popup (live RPC dialog or demo MasterLookupDialog)
 *
 * Used by AWB Entry and other transaction screens that need fast keyboard entry
 * without removing the advanced search dialog.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import { MASTER_LOOKUPS, type LookupKey, type LookupOption } from "@/lib/master-lookups";
import {
  useLookup,
  type LookupItem,
  type LookupKey as LiveLookupKey,
} from "@/lib/masters/core/lookup";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { ERP_NAV_GROUP, ERP_NAV_ORDER, ERP_NAV_SKIP } from "@/lib/forms/erp-keyboard-nav";

export type LookupPairValue = { id?: string; code: string; name: string };

/** Demo master-lookups keys → live `public.lookup` RPC keys when signed in. */
export const DEMO_TO_LIVE_LOOKUP: Partial<Record<LookupKey, LiveLookupKey>> = {
  customer: "customer",
  destination: "destination",
  shipper: "shipper",
  product: "product",
  vendor: "vendor",
  fieldExecutive: "field-executive",
  salesExecutive: "sales-executive",
  area: "area",
  country: "country",
  state: "state",
  zone: "zone",
  pinCode: "pin-code",
  serviceCentre: "service-center",
};

type SearchHit = { id?: string; code: string; name: string; hint?: string | null };

/** Session-scoped cache for repeat inline queries (cleared on full page reload). */
const SESSION_CACHE = new Map<string, SearchHit[]>();
const SESSION_CACHE_MAX = 80;

function cacheGet(key: string): SearchHit[] | undefined {
  return SESSION_CACHE.get(key);
}

function cacheSet(key: string, rows: SearchHit[]) {
  if (SESSION_CACHE.size >= SESSION_CACHE_MAX) {
    const first = SESSION_CACHE.keys().next().value;
    if (first != null) SESSION_CACHE.delete(first);
  }
  SESSION_CACHE.set(key, rows);
}

function filterDemoOptions(lookup: LookupKey, q: string): SearchHit[] {
  const opts = MASTER_LOOKUPS[lookup]?.options ?? [];
  const needle = q.trim().toLowerCase();
  if (!needle) return opts.slice(0, 50).map((o) => ({ code: o.code, name: o.name, hint: o.hint }));
  return opts
    .filter(
      (o) =>
        o.code.toLowerCase().includes(needle) ||
        o.name.toLowerCase().includes(needle) ||
        (o.hint ?? "").toLowerCase().includes(needle),
    )
    .slice(0, 50)
    .map((o) => ({ code: o.code, name: o.name, hint: o.hint }));
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function SearchableLookupPair({
  value,
  onChange,
  lookup,
  minChars = 2,
  debounceMs = 280,
  disabled,
  className,
  compact = false,
  splitCode = false,
  navOrder,
  onCommit,
}: {
  value: LookupPairValue;
  onChange: (v: LookupPairValue) => void;
  lookup: LookupKey;
  /** Minimum characters before inline search runs (default 2). */
  minChars?: number;
  debounceMs?: number;
  disabled?: boolean;
  className?: string;
  /** Smaller inputs/buttons for dense data-entry screens. */
  compact?: boolean;
  /** Name and code in separate bordered boxes (CourierWala AWB style). */
  splitCode?: boolean;
  /** ERP keyboard nav order (name field only; code/search skipped). */
  navOrder?: number;
  /** Called after a value is committed via pick/popup selection. */
  onCommit?: () => void;
}) {
  const { isAuthenticated: live } = useAuth();
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupQuery, setPopupQuery] = useState("");
  const [inlineOpen, setInlineOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [inlineQuery, setInlineQuery] = useState("");

  const liveKey = DEMO_TO_LIVE_LOOKUP[lookup];
  const debouncedInline = useDebouncedValue(inlineQuery, debounceMs);
  const canInlineSearch = debouncedInline.trim().length >= minChars;

  const cacheKey = `${live && liveKey ? `live:${liveKey}` : `demo:${lookup}`}::${debouncedInline.trim().toLowerCase()}`;
  const cached = canInlineSearch ? cacheGet(cacheKey) : undefined;

  const { data: liveInlineRows, isFetching: inlineFetching } = useLookup(
    liveKey ?? "branch",
    debouncedInline,
    {
      enabled: Boolean(live && liveKey && inlineOpen && canInlineSearch && !cached),
      limit: 50,
    },
  );

  const { data: livePopupRows, isFetching: popupFetching } = useLookup(
    liveKey ?? "branch",
    popupQuery,
    {
      enabled: Boolean(live && liveKey && popupOpen),
      limit: 50,
    },
  );

  const demoInlineRows = useMemo(() => {
    if (live && liveKey) return null;
    if (!canInlineSearch) return [];
    return filterDemoOptions(lookup, debouncedInline);
  }, [live, liveKey, canInlineSearch, lookup, debouncedInline]);

  const inlineResults: SearchHit[] = useMemo(() => {
    if (!canInlineSearch) return [];
    if (cached) return cached;
    if (live && liveKey) {
      return (liveInlineRows ?? []).map((r: LookupItem) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        hint: r.hint,
      }));
    }
    return demoInlineRows ?? [];
  }, [canInlineSearch, cached, live, liveKey, liveInlineRows, demoInlineRows]);

  useEffect(() => {
    if (!canInlineSearch || cached) return;
    if (live && liveKey) {
      if (liveInlineRows) cacheSet(cacheKey, inlineResults);
    } else if (demoInlineRows) {
      cacheSet(cacheKey, demoInlineRows);
    }
  }, [
    canInlineSearch,
    cached,
    live,
    liveKey,
    liveInlineRows,
    demoInlineRows,
    cacheKey,
    inlineResults,
  ]);

  useEffect(() => {
    setHighlight(0);
  }, [debouncedInline, inlineOpen]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setInlineOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (hit: SearchHit) => {
    onChange({ id: hit.id, code: hit.code, name: hit.name });
    setInlineOpen(false);
    setInlineQuery("");
    setHighlight(0);
    onCommit?.();
  };

  const startInlineFrom = (_field: "code" | "name", text: string) => {
    setInlineQuery(text);
    setInlineOpen(text.trim().length >= minChars);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!inlineOpen || !canInlineSearch) {
      if (e.key === "Escape") setInlineOpen(false);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(inlineResults.length - 1, 0)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      if (inlineResults[highlight]) {
        e.preventDefault();
        pick(inlineResults[highlight]);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setInlineOpen(false);
      return;
    }
    if (e.key === "Tab" && inlineResults[highlight]) {
      // Accept highlighted result, then allow default Tab focus move.
      pick(inlineResults[highlight]);
    }
  };

  const showDropdown = inlineOpen && canInlineSearch && inlineResults.length > 0;
  const inputH = compact ? "h-8" : "h-9";
  const codeW = compact ? "w-14" : "w-20";
  const btnSize = compact ? "h-8 w-8" : "h-9 w-9";
  const iconSize = compact ? "h-3.5 w-3.5" : "h-4 w-4";
  const flatInput = compact
    ? "border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-0"
    : "border-0 bg-transparent shadow-none focus-visible:ring-0";

  const navGroupProps =
    navOrder != null ? ({ [ERP_NAV_GROUP]: "" } as const) : undefined;
  const navOrderProps =
    navOrder != null ? ({ [ERP_NAV_ORDER]: String(navOrder) } as const) : undefined;
  const navSkipProps = { [ERP_NAV_SKIP]: "" } as const;

  const nameInput = (
    <Input
      value={value.name}
      disabled={disabled}
      onChange={(e) => {
        const name = e.target.value;
        onChange({ ...value, id: undefined, name });
        startInlineFrom("name", name);
      }}
      onFocus={() => {
        if (value.name.trim().length >= minChars) {
          startInlineFrom("name", value.name);
        }
      }}
      onKeyDown={onKeyDown}
      className={cn("min-w-0 flex-1", inputH, flatInput)}
      placeholder="Name"
      role="combobox"
      aria-expanded={showDropdown}
      aria-controls={listId}
      aria-autocomplete="list"
      autoComplete="off"
      {...navOrderProps}
    />
  );

  const codeInput = (
    <Input
      value={value.code}
      disabled={disabled}
      onChange={(e) => {
        const code = e.target.value;
        onChange({ ...value, id: undefined, code });
        startInlineFrom("code", code);
      }}
      onFocus={() => {
        if (value.code.trim().length >= minChars) {
          startInlineFrom("code", value.code);
        }
      }}
      onKeyDown={onKeyDown}
      className={cn(splitCode ? "w-full" : codeW, inputH, flatInput)}
      placeholder="Code"
      role="combobox"
      aria-expanded={showDropdown}
      aria-controls={listId}
      aria-autocomplete="list"
      autoComplete="off"
      {...(navOrder != null ? navSkipProps : {})}
    />
  );

  const searchButton = (
    <Button
      size="icon"
      variant="outline"
      type="button"
      disabled={disabled}
      className={cn(
        "shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90 hover:text-sidebar-foreground",
        btnSize,
      )}
      aria-label="Search"
      onClick={() => {
        setInlineOpen(false);
        setPopupOpen(true);
      }}
      {...(navOrder != null ? navSkipProps : {})}
    >
      <Search className={iconSize} />
    </Button>
  );

  return (
    <>
      <div ref={wrapRef} className={cn("relative w-full", className)} {...navGroupProps}>
        {splitCode ? (
          <div className="flex w-full min-w-0 items-stretch gap-1">
            <div className="lookup-name relative min-h-8 min-w-0 flex-1 overflow-hidden rounded border border-input bg-background">
              {nameInput}
            </div>
            <div className="lookup-code flex w-[5.75rem] shrink-0 items-stretch gap-1">
              <div
                className={cn(
                  "overflow-hidden rounded border border-input bg-background",
                  inputH,
                  codeW,
                )}
              >
                {codeInput}
              </div>
              {searchButton}
            </div>
          </div>
        ) : (
          <div className="flex gap-1">
            {nameInput}
            {codeInput}
            {searchButton}
          </div>
        )}

        {showDropdown ? (
          <div
            id={listId}
            role="listbox"
            className="absolute left-0 right-9 top-full z-50 mt-1 max-h-64 overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md"
          >
            {inlineResults.map((hit, idx) => (
                <button
                  key={`${hit.id ?? hit.code}-${hit.name}-${idx}`}
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
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{hit.code}</span>
                </button>
              ))}
          </div>
        ) : null}
      </div>

      {live && liveKey ? (
        <Dialog
          open={popupOpen}
          onOpenChange={(o) => {
            setPopupOpen(o);
            if (!o) setPopupQuery("");
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogTitle className="text-base font-semibold">
              Select {MASTER_LOOKUPS[lookup]?.title?.replace(/^Select\s+/i, "") ?? lookup}
            </DialogTitle>
            <Input
              value={popupQuery}
              onChange={(e) => setPopupQuery(e.target.value)}
              placeholder="Search by code or name…"
              className="mb-2"
            />
            <div className="max-h-72 overflow-auto rounded border">
              {popupFetching && (livePopupRows ?? []).length === 0 ? (
                <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching…
                </div>
              ) : null}
              {(livePopupRows ?? []).map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/50"
                  onClick={() => {
                    onChange({ id: row.id, code: row.code, name: row.name });
                    setPopupOpen(false);
                    setPopupQuery("");
                    onCommit?.();
                  }}
                >
                  <span className="font-medium">{row.name}</span>
                  <span className="text-muted-foreground">{row.code}</span>
                </button>
              ))}
              {!popupFetching && (livePopupRows ?? []).length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">No matches</div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      ) : (
        <MasterLookupDialog
          open={popupOpen}
          onOpenChange={setPopupOpen}
          lookup={lookup}
          returnField="code"
          onSelect={(_v, option: LookupOption) => {
            onChange({ code: option.code, name: option.name });
            onCommit?.();
          }}
        />
      )}
    </>
  );
}
