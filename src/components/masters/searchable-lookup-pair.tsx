/**
 * Code + Name lookup pair with:
 *  - inline autocomplete while typing (default, filter screens)
 *  - manual search: F2 / 🔍 to search; Enter advances to next field (AWB ERP)
 *  - magnifying-glass popup (live RPC dialog or demo MasterLookupDialog)
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import { MASTER_LOOKUPS, type LookupKey, type LookupOption } from "@/lib/master-lookups";
import {
  lookup,
  useLookup,
  LOOKUP_MAX_LIMIT,
  type LookupItem,
  type LookupKey as LiveLookupKey,
} from "@/lib/masters/core/lookup";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  lookupHitSearchFields,
  rankLookupResults,
} from "@/lib/search/ranked-lookup-search";
import {
  ERP_MANUAL_SEARCH,
  ERP_NAV_GROUP,
  ERP_NAV_ORDER,
  ERP_NAV_SKIP,
} from "@/lib/forms/erp-keyboard-nav";
import {
  AWB_LOOKUP_DEBOUNCE_MS,
  AWB_LOOKUP_NO_RESULTS,
  AWB_LOOKUP_RESULT_LIMIT,
  LookupAutocompleteClientRow,
  LookupAutocompleteStandardRow,
  type LookupDisplayVariant,
  handleLookupCommitKeyDown,
} from "@/components/masters/lookup-autocomplete-ui";
import {
  isLookupDropdownOutside,
  LOOKUP_SEARCH_BTN_ATTR,
  LookupDropdownPortal,
} from "@/components/masters/lookup-dropdown-portal";

export type LookupPairValue = { id?: string; code: string; name: string };

/** Demo master-lookups keys → live `public.lookup` RPC keys when signed in. */
export const DEMO_TO_LIVE_LOOKUP: Partial<Record<LookupKey, LiveLookupKey>> = {
  customer: "customer",
  destination: "destination",
  internationalDestination: "international-destination",
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

const RANKED_LOOKUP_DISPLAY_LIMIT = 50;

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

function filterDemoOptions(lookupKey: LookupKey, q: string): SearchHit[] {
  const opts = MASTER_LOOKUPS[lookupKey]?.options ?? [];
  const hits = opts.map((o) => ({ code: o.code, name: o.name, hint: o.hint }));
  return rankLookupResults(hits, q, lookupHitSearchFields, {
    limit: RANKED_LOOKUP_DISPLAY_LIMIT,
  }).map((o) => ({ code: o.code, name: o.name, hint: o.hint }));
}

function rankSearchHits(hits: SearchHit[], q: string, limit = RANKED_LOOKUP_DISPLAY_LIMIT): SearchHit[] {
  return rankLookupResults(hits, q, lookupHitSearchFields, { limit });
}

async function fetchLookupHits(
  lookupKey: LookupKey,
  live: boolean,
  liveKey: LiveLookupKey | undefined,
  q: string,
): Promise<SearchHit[]> {
  if (live && liveKey) {
    const rows = await lookup(liveKey, q, LOOKUP_MAX_LIMIT);
    const hits = rows.map((r: LookupItem) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      hint: r.hint,
    }));
    return rankSearchHits(hits, q);
  }
  return filterDemoOptions(lookupKey, q);
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
  onSelect,
  lookup: lookupKey,
  minChars = 2,
  debounceMs = AWB_LOOKUP_DEBOUNCE_MS,
  disabled,
  className,
  compact = false,
  splitCode = false,
  navOrder,
  onCommit,
  manualSearch = false,
  displayVariant = "standard",
  displayLimit,
  emptySearchMessage,
  noResultsMessage = AWB_LOOKUP_NO_RESULTS,
}: {
  value: LookupPairValue;
  onChange: (v: LookupPairValue) => void;
  /** Called when a row is committed from search results (not while typing). */
  onSelect?: (v: LookupPairValue) => void;
  lookup: LookupKey;
  minChars?: number;
  debounceMs?: number;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
  splitCode?: boolean;
  navOrder?: number;
  onCommit?: () => void;
  /** AWB ERP: typeahead autocomplete + F2/🔍 browse; Enter advances when nothing selected. */
  manualSearch?: boolean;
  displayVariant?: LookupDisplayVariant;
  displayLimit?: number;
  emptySearchMessage?: string;
  noResultsMessage?: string;
}) {
  const resultLimit = displayLimit ?? (manualSearch ? AWB_LOOKUP_RESULT_LIMIT : 50);
  const { isAuthenticated: live } = useAuth();
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const explicitSearchSeqRef = useRef(0);
  /** AWB manual mode: skip typeahead until the user edits (presets like default Origin stay closed). */
  const manualQueryEditedRef = useRef(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupQuery, setPopupQuery] = useState("");
  const [inlineOpen, setInlineOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [inlineQuery, setInlineQuery] = useState("");
  const [manualPopupRows, setManualPopupRows] = useState<SearchHit[] | null>(null);
  const [manualDropdownRows, setManualDropdownRows] = useState<SearchHit[]>([]);
  const [manualDropdownOpen, setManualDropdownOpen] = useState(false);
  const [manualSearching, setManualSearching] = useState(false);

  const liveKey = DEMO_TO_LIVE_LOOKUP[lookupKey];
  const manualQueryRaw = (value.name || value.code || "").trim();
  const debouncedManualQuery = useDebouncedValue(manualQueryRaw, debounceMs);
  const debouncedInline = useDebouncedValue(inlineQuery, debounceMs);
  const canInlineSearch = !manualSearch && debouncedInline.trim().length >= minChars;
  const canDebouncedManualSearch =
    manualSearch && manualQueryEditedRef.current && debouncedManualQuery.length >= minChars;

  const cacheKey = `${live && liveKey ? `live:${liveKey}` : `demo:${lookupKey}`}::${debouncedInline.trim().toLowerCase()}`;
  const cached = canInlineSearch ? cacheGet(cacheKey) : undefined;

  const { data: liveInlineRows } = useLookup(liveKey ?? "branch", debouncedInline, {
    enabled: Boolean(live && liveKey && inlineOpen && canInlineSearch && !cached && !manualSearch),
    limit: LOOKUP_MAX_LIMIT,
  });

  const { data: livePopupRows, isFetching: popupFetching } = useLookup(
    liveKey ?? "branch",
    popupQuery,
    {
      enabled: Boolean(live && liveKey && popupOpen && manualPopupRows === null),
      limit: LOOKUP_MAX_LIMIT,
    },
  );

  const demoInlineRows = useMemo(() => {
    if (manualSearch || (live && liveKey)) return null;
    if (!canInlineSearch) return [];
    return filterDemoOptions(lookupKey, debouncedInline);
  }, [manualSearch, live, liveKey, canInlineSearch, lookupKey, debouncedInline]);

  const inlineResults: SearchHit[] = useMemo(() => {
    if (manualSearch) return manualDropdownRows;
    if (!canInlineSearch) return [];
    if (cached) return cached;
    if (live && liveKey) {
      const hits = (liveInlineRows ?? []).map((r: LookupItem) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        hint: r.hint,
      }));
      return rankSearchHits(hits, debouncedInline, resultLimit);
    }
    return demoInlineRows ?? [];
  }, [
    manualSearch,
    manualDropdownRows,
    canInlineSearch,
    cached,
    live,
    liveKey,
    liveInlineRows,
    demoInlineRows,
    debouncedInline,
    resultLimit,
  ]);

  useEffect(() => {
    if (manualSearch || !canInlineSearch || cached) return;
    if (live && liveKey) {
      if (liveInlineRows) cacheSet(cacheKey, inlineResults);
    } else if (demoInlineRows) {
      cacheSet(cacheKey, demoInlineRows);
    }
  }, [
    manualSearch,
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
  }, [debouncedInline, inlineOpen, manualDropdownRows, debouncedManualQuery]);

  useEffect(() => {
    if (!canDebouncedManualSearch) {
      if (!manualSearch || debouncedManualQuery.length < minChars) {
        setManualDropdownOpen(false);
        setManualDropdownRows([]);
      }
      return;
    }

    let cancelled = false;
    const seqAtStart = explicitSearchSeqRef.current;
    setManualSearching(true);
    setManualDropdownRows([]);
    setManualDropdownOpen(false);
    void fetchLookupHits(lookupKey, live, liveKey, debouncedManualQuery)
      .then((hits) => {
        if (cancelled || seqAtStart !== explicitSearchSeqRef.current) return;
        const rows = hits.slice(0, resultLimit);
        setManualDropdownRows(rows);
        setManualDropdownOpen(rows.length > 0);
        setHighlight(0);
      })
      .catch(() => {
        if (cancelled) return;
        setManualDropdownRows([]);
        setManualDropdownOpen(false);
      })
      .finally(() => {
        if (!cancelled) setManualSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    canDebouncedManualSearch,
    debouncedManualQuery,
    live,
    liveKey,
    lookupKey,
    manualSearch,
    minChars,
    resultLimit,
  ]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (isLookupDropdownOutside(e.target, wrapRef.current)) {
        setInlineOpen(false);
        setManualDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = useCallback(
    (hit: SearchHit) => {
      const next = { id: hit.id, code: hit.code, name: hit.name };
      onChange(next);
      onSelect?.(next);
      manualQueryEditedRef.current = false;
      setInlineOpen(false);
      setInlineQuery("");
      setManualDropdownOpen(false);
      setManualDropdownRows([]);
      setManualPopupRows(null);
      setPopupOpen(false);
      setPopupQuery("");
      setHighlight(0);
      onCommit?.();
    },
    [onChange, onCommit, onSelect],
  );

  const searchQuery = useCallback(
    () => (value.name || value.code || "").trim(),
    [value.code, value.name],
  );

  const clearManualDropdown = useCallback(() => {
    manualQueryEditedRef.current = false;
    setManualDropdownOpen(false);
    setManualDropdownRows([]);
    setHighlight(0);
  }, []);

  const commitTypedAndAdvance = useCallback(() => {
    clearManualDropdown();
    onCommit?.();
  }, [clearManualDropdown, onCommit]);

  const applyManualHits = useCallback(
    (hits: SearchHit[], opts?: { autoSelectSingle?: boolean }) => {
      const autoSelectSingle = opts?.autoSelectSingle ?? false;
      if (hits.length === 0) {
        clearManualDropdown();
        return false;
      }
      if (autoSelectSingle && hits.length === 1) {
        pick(hits[0]);
        return true;
      }
      setManualDropdownRows(hits);
      setManualDropdownOpen(true);
      setHighlight(0);
      return true;
    },
    [clearManualDropdown, pick],
  );

  const openBrowsePopup = useCallback(() => {
    setInlineOpen(false);
    setManualDropdownOpen(false);
    setManualDropdownRows([]);
    setPopupQuery("");
    setManualPopupRows(null);
    setPopupOpen(true);
  }, []);

  const runManualSearch = useCallback(
    async (opts?: { autoSelectSingle?: boolean; showEmptyToast?: boolean }) => {
      const autoSelectSingle = opts?.autoSelectSingle ?? true;
      const q = searchQuery();
      if (!q) {
        openBrowsePopup();
        return;
      }
      const seq = ++explicitSearchSeqRef.current;
      setManualSearching(true);
      try {
        const hits = await fetchLookupHits(lookupKey, live, liveKey, q);
        if (seq !== explicitSearchSeqRef.current) return;
        if (hits.length === 0) {
          clearManualDropdown();
          toast.error(noResultsMessage);
          return;
        }
        applyManualHits(hits, { autoSelectSingle });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Search failed");
      } finally {
        if (seq === explicitSearchSeqRef.current) setManualSearching(false);
      }
    },
    [
      applyManualHits,
      clearManualDropdown,
      live,
      liveKey,
      lookupKey,
      noResultsMessage,
      openBrowsePopup,
      searchQuery,
    ],
  );

  const triggerExplicitSearch = useCallback(() => {
    void runManualSearch({ autoSelectSingle: false, showEmptyToast: true });
  }, [runManualSearch]);

  const startInlineFrom = (_field: "code" | "name", text: string) => {
    if (manualSearch) return;
    setInlineQuery(text);
    setInlineOpen(text.trim().length >= minChars);
  };

  const manualQueryActive =
    manualSearch && manualQueryEditedRef.current && manualQueryRaw.length >= minChars;
  const activeHighlightQuery = manualSearch ? debouncedManualQuery : debouncedInline;
  const manualDropdownVisible =
    manualSearch && manualDropdownOpen && manualQueryActive && manualDropdownRows.length > 0;

  const showDropdown = manualSearch
    ? manualDropdownVisible
    : inlineOpen && canInlineSearch && inlineResults.length > 0;

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (manualSearch) {
      if (manualDropdownVisible) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setHighlight((h) => Math.min(h + 1, manualDropdownRows.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setHighlight((h) => Math.max(h - 1, 0));
          return;
        }
      }

      if (
        handleLookupCommitKeyDown(e, {
          dropdownOpen: manualDropdownVisible,
          resultsAvailable: manualDropdownRows.length > 0,
          highlightedIndex: highlight,
          onPickHighlighted: () => {
            const hit = manualDropdownRows[highlight];
            if (hit) pick(hit);
          },
          onCommitTyped: commitTypedAndAdvance,
          onDismissDropdown: clearManualDropdown,
          onBrowseSearch: triggerExplicitSearch,
          manualSearchMode: true,
        })
      ) {
        return;
      }
      return;
    }

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

    if (
      handleLookupCommitKeyDown(e, {
        dropdownOpen: inlineOpen,
        resultsAvailable: inlineResults.length > 0,
        highlightedIndex: highlight,
        onPickHighlighted: () => {
          const hit = inlineResults[highlight];
          if (hit) pick(hit);
        },
        onCommitTyped: () => {
          setInlineOpen(false);
          onCommit?.();
        },
        onDismissDropdown: () => setInlineOpen(false),
      })
    ) {
      return;
    }
  };

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
  const manualSearchProps = manualSearch ? ({ [ERP_MANUAL_SEARCH]: "" } as const) : undefined;

  const nameInput = (
    <Input
      value={value.name}
      disabled={disabled}
      onChange={(e) => {
        const name = e.target.value;
        manualQueryEditedRef.current = true;
        onChange({ ...value, id: undefined, name });
        if (manualSearch) {
          if (name.trim().length < minChars) {
            setManualDropdownOpen(false);
            setManualDropdownRows([]);
          }
        } else {
          startInlineFrom("name", name);
        }
      }}
      onFocus={() => {
        if (manualSearch) {
          if (
            manualQueryEditedRef.current &&
            manualQueryRaw.length >= minChars &&
            manualDropdownRows.length > 0
          ) {
            setManualDropdownOpen(true);
          }
        } else if (value.name.trim().length >= minChars) {
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
      readOnly={splitCode}
      onChange={
        splitCode
          ? undefined
          : (e) => {
              const code = e.target.value;
              manualQueryEditedRef.current = true;
              onChange({ ...value, id: undefined, code });
              if (!manualSearch) startInlineFrom("code", code);
            }
      }
      onFocus={
        splitCode
          ? undefined
          : () => {
              if (manualSearch) {
                if (
                  manualQueryEditedRef.current &&
                  manualQueryRaw.length >= minChars &&
                  manualDropdownRows.length > 0
                ) {
                  setManualDropdownOpen(true);
                }
              } else if (value.code.trim().length >= minChars) {
                startInlineFrom("code", value.code);
              }
            }
      }
      onKeyDown={splitCode ? undefined : onKeyDown}
      className={cn(
        splitCode ? "w-full" : codeW,
        inputH,
        flatInput,
        splitCode && "cursor-default bg-muted/30 text-foreground",
      )}
      placeholder="Code"
      role={splitCode ? undefined : "combobox"}
      aria-expanded={splitCode ? undefined : showDropdown}
      aria-controls={splitCode ? undefined : listId}
      aria-autocomplete={splitCode ? undefined : "list"}
      autoComplete="off"
      tabIndex={splitCode ? -1 : undefined}
      {...(navOrder != null ? navSkipProps : {})}
    />
  );

  const searchBtnProps = { [LOOKUP_SEARCH_BTN_ATTR]: "" } as const;

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
      {...searchBtnProps}
      onMouseDown={(e) => {
        if (disabled) return;
        e.preventDefault();
        e.stopPropagation();
        if (manualSearch) {
          triggerExplicitSearch();
          return;
        }
        setInlineOpen(false);
        setPopupQuery(value.name || value.code || "");
        setPopupOpen(true);
      }}
      {...(navOrder != null ? navSkipProps : {})}
    >
      {manualSearching ? (
        <Loader2 className={cn(iconSize, "animate-spin")} />
      ) : (
        <Search className={iconSize} />
      )}
    </Button>
  );

  const popupDisplayRows: SearchHit[] = useMemo(() => {
    if (manualPopupRows) return manualPopupRows;
    const hits = (livePopupRows ?? []).map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      hint: r.hint,
    }));
    return rankSearchHits(hits, popupQuery);
  }, [livePopupRows, manualPopupRows, popupQuery]);

  return (
    <>
      <div
        ref={wrapRef}
        className={cn("relative w-full", className)}
        {...navGroupProps}
        {...manualSearchProps}
      >
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
          <div className="flex w-full min-w-0 items-stretch gap-1">
            <div
              className={cn(
                "flex min-w-0 flex-1 items-stretch overflow-hidden rounded border border-input bg-background",
                inputH,
              )}
            >
              {nameInput}
              <div className={cn("flex shrink-0 items-stretch border-l border-input", codeW)}>
                {codeInput}
              </div>
            </div>
            {searchButton}
          </div>
        )}

        {showDropdown ? (
          <LookupDropdownPortal
            open
            anchorRef={wrapRef}
            id={listId}
            insetRight={splitCode ? 36 : 0}
          >
            {inlineResults.map((hit, idx) => (
              <button
                key={`${hit.id ?? hit.code}-${hit.name}-${idx}`}
                type="button"
                role="option"
                aria-selected={idx === highlight}
                className={cn(
                  "flex w-full border-b px-3 py-2 text-left last:border-b-0",
                  idx === highlight ? "bg-accent text-accent-foreground" : "hover:bg-muted/50",
                )}
                onMouseEnter={() => setHighlight(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(hit);
                }}
              >
                {displayVariant === "client" ? (
                  <LookupAutocompleteClientRow
                    name={hit.name}
                    code={hit.code}
                    query={activeHighlightQuery}
                    highlighted={idx === highlight}
                  />
                ) : (
                  <LookupAutocompleteStandardRow
                    name={hit.name}
                    code={hit.code}
                    hint={hit.hint}
                    query={activeHighlightQuery}
                    highlighted={idx === highlight}
                  />
                )}
              </button>
            ))}
          </LookupDropdownPortal>
        ) : null}
      </div>

      {live && liveKey ? (
        <Dialog
          open={popupOpen}
          onOpenChange={(o) => {
            setPopupOpen(o);
            if (!o) {
              setPopupQuery("");
              setManualPopupRows(null);
            }
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogTitle className="text-base font-semibold">
              Select {MASTER_LOOKUPS[lookupKey]?.title?.replace(/^Select\s+/i, "") ?? lookupKey}
            </DialogTitle>
            <Input
              value={popupQuery}
              onChange={(e) => {
                setPopupQuery(e.target.value);
                setManualPopupRows(null);
              }}
              placeholder="Search by code or name…"
              className="mb-2"
            />
            <div className="max-h-72 overflow-auto rounded border">
              {popupFetching && popupDisplayRows.length === 0 ? (
                <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching…
                </div>
              ) : null}
              {popupDisplayRows.map((row) => (
                <button
                  key={row.id ?? `${row.code}-${row.name}`}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/50"
                  onClick={() => pick(row)}
                >
                  <span className="font-medium">{row.name}</span>
                  <span className="text-muted-foreground">{row.code}</span>
                </button>
              ))}
              {!popupFetching && popupDisplayRows.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">No matches</div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      ) : (
        <MasterLookupDialog
          open={popupOpen}
          onOpenChange={(o) => {
            setPopupOpen(o);
            if (!o) setManualPopupRows(null);
          }}
          lookup={lookupKey}
          returnField="code"
          onSelect={(_v, option: LookupOption) => {
            pick({ code: option.code, name: option.name });
          }}
        />
      )}
    </>
  );
}
