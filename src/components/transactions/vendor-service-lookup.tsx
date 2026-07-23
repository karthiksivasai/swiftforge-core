/**
 * AWB Service picker scoped to the selected Vendor via Service Mapping.
 * Inline autocomplete + search popup; empty vendor disables the field.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Loader2, Search } from "lucide-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { ERP_MANUAL_SEARCH, ERP_NAV_GROUP, ERP_NAV_ORDER, ERP_NAV_SKIP } from "@/lib/forms/erp-keyboard-nav";
import {
  isLookupDropdownOutside,
  LOOKUP_SEARCH_BTN_ATTR,
  LookupDropdownPortal,
} from "@/components/masters/lookup-dropdown-portal";
import {
  filterDemoVendorServices,
  listVendorServices,
  type VendorServiceHit,
} from "@/lib/transactions/resources/vendorServices";
import {
  lookupHitSearchFields,
  rankLookupResults,
} from "@/lib/search/ranked-lookup-search";
import {
  AWB_LOOKUP_DEBOUNCE_MS,
  AWB_LOOKUP_NO_RESULTS,
  AWB_LOOKUP_RESULT_LIMIT,
  LookupAutocompleteServiceRow,
  handleLookupCommitKeyDown,
} from "@/components/masters/lookup-autocomplete-ui";

export type LookupPairValue = { id?: string; code: string; name: string };

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function rankVendorServiceHits(hits: VendorServiceHit[], q: string, limit = 100): VendorServiceHit[] {
  return rankLookupResults(hits, q, lookupHitSearchFields, { limit });
}

export function VendorServiceLookup({
  vendor,
  value,
  onChange,
  productId,
  destinationId,
  debounceMs = AWB_LOOKUP_DEBOUNCE_MS,
  disabled,
  compact = false,
  splitCode = false,
  navOrder,
  onCommit,
  manualSearch = false,
  emptySearchMessage,
  noResultsMessage = AWB_LOOKUP_NO_RESULTS,
}: {
  vendor: LookupPairValue;
  value: LookupPairValue;
  onChange: (v: LookupPairValue) => void;
  productId?: string | null;
  destinationId?: string | null;
  debounceMs?: number;
  disabled?: boolean;
  compact?: boolean;
  splitCode?: boolean;
  navOrder?: number;
  onCommit?: () => void;
  manualSearch?: boolean;
  emptySearchMessage?: string;
  noResultsMessage?: string;
}) {
  const { isAuthenticated: live } = useAuth();
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const explicitSearchSeqRef = useRef(0);
  const manualQueryEditedRef = useRef(false);
  const hasVendor = Boolean(vendor.id || vendor.code.trim() || vendor.name.trim());
  const locked = disabled || !hasVendor;

  const [popupOpen, setPopupOpen] = useState(false);
  const [popupQuery, setPopupQuery] = useState("");
  const [inlineOpen, setInlineOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [inlineQuery, setInlineQuery] = useState("");
  const [manualPopupHits, setManualPopupHits] = useState<VendorServiceHit[] | null>(null);
  const [manualDropdownHits, setManualDropdownHits] = useState<VendorServiceHit[]>([]);
  const [manualDropdownOpen, setManualDropdownOpen] = useState(false);
  const [manualSearching, setManualSearching] = useState(false);

  const manualQueryRaw = (value.name || value.code || "").trim();
  const debouncedManualQuery = useDebouncedValue(manualQueryRaw, debounceMs);
  const canDebouncedManualSearch =
    manualSearch && hasVendor && manualQueryEditedRef.current && debouncedManualQuery.length >= 1;

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
    enabled: Boolean(live && hasVendor && inlineOpen && !manualSearch),
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
    enabled: Boolean(live && hasVendor && popupOpen && manualPopupHits === null),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const inlineHits: VendorServiceHit[] = useMemo(() => {
    if (!hasVendor || !inlineOpen) return [];
    if (live) return rankVendorServiceHits(liveInline ?? [], debouncedInline);
    return filterDemoVendorServices(vendor.code, vendor.name, debouncedInline);
  }, [hasVendor, inlineOpen, live, liveInline, vendor.code, vendor.name, debouncedInline]);

  const popupHits: VendorServiceHit[] = useMemo(() => {
    if (!hasVendor) return [];
    if (manualPopupHits) return manualPopupHits;
    if (live) return rankVendorServiceHits(livePopup ?? [], popupQuery);
    return filterDemoVendorServices(vendor.code, vendor.name, popupQuery);
  }, [hasVendor, manualPopupHits, live, livePopup, vendor.code, vendor.name, popupQuery]);

  useEffect(() => setHighlight(0), [debouncedInline, inlineOpen, debouncedManualQuery]);

  useEffect(() => {
    if (!canDebouncedManualSearch) {
      if (!manualSearch || debouncedManualQuery.length < 1) {
        setManualDropdownOpen(false);
        setManualDropdownHits([]);
      }
      return;
    }

    let cancelled = false;
    const seqAtStart = explicitSearchSeqRef.current;
    setManualSearching(true);
    setManualDropdownHits([]);
    setManualDropdownOpen(false);
    void (live
      ? listVendorServices({
          vendorId: vendor.id || null,
          vendorCode: vendor.code.trim() || vendor.name.trim() || null,
          productId: productId ?? null,
          destinationId: destinationId ?? null,
          q: debouncedManualQuery,
          limit: 100,
        })
      : Promise.resolve(filterDemoVendorServices(vendor.code, vendor.name, debouncedManualQuery))
    )
      .then((hits) => {
        if (cancelled || seqAtStart !== explicitSearchSeqRef.current) return;
        const ranked = rankVendorServiceHits(hits, debouncedManualQuery, AWB_LOOKUP_RESULT_LIMIT);
        setManualDropdownHits(ranked);
        setManualDropdownOpen(ranked.length > 0);
        setHighlight(0);
      })
      .catch(() => {
        if (cancelled) return;
        setManualDropdownHits([]);
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
    manualSearch,
    vendor.id,
    vendor.code,
    vendor.name,
    productId,
    destinationId,
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

  const pick = (hit: VendorServiceHit) => {
    onChange({ id: hit.id, code: hit.code, name: hit.name });
    manualQueryEditedRef.current = false;
    setInlineOpen(false);
    setPopupOpen(false);
    setInlineQuery("");
    setManualPopupHits(null);
    setManualDropdownOpen(false);
    setManualDropdownHits([]);
    onCommit?.();
  };

  const searchQuery = useCallback(
    () => (value.name || value.code || "").trim(),
    [value.code, value.name],
  );

  const clearManualDropdown = useCallback(() => {
    manualQueryEditedRef.current = false;
    setManualDropdownOpen(false);
    setManualDropdownHits([]);
    setHighlight(0);
  }, []);

  const commitTypedAndAdvance = useCallback(() => {
    clearManualDropdown();
    onCommit?.();
  }, [clearManualDropdown, onCommit]);

  const applyManualHits = useCallback(
    (hits: VendorServiceHit[], opts?: { autoSelectSingle?: boolean }) => {
      const autoSelectSingle = opts?.autoSelectSingle ?? false;
      if (hits.length === 0) {
        clearManualDropdown();
        return false;
      }
      if (autoSelectSingle && hits.length === 1) {
        pick(hits[0]);
        return true;
      }
      setManualDropdownHits(hits);
      setManualDropdownOpen(true);
      setHighlight(0);
      return true;
    },
    [clearManualDropdown, pick],
  );

  const openBrowsePopup = useCallback(() => {
    setInlineOpen(false);
    setManualDropdownOpen(false);
    setManualDropdownHits([]);
    setPopupQuery("");
    setManualPopupHits(null);
    setPopupOpen(true);
  }, []);

  const runManualSearch = useCallback(
    async (opts?: { autoSelectSingle?: boolean; showEmptyToast?: boolean }) => {
      if (!hasVendor) return;
      const autoSelectSingle = opts?.autoSelectSingle ?? true;
      const q = searchQuery();
      if (!q) {
        openBrowsePopup();
        return;
      }
      const seq = ++explicitSearchSeqRef.current;
      setManualSearching(true);
      try {
        const hits = live
          ? rankVendorServiceHits(
              await listVendorServices({ ...vendorArgs, q, limit: 100 }),
              q,
            )
          : filterDemoVendorServices(vendor.code, vendor.name, q);
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
      hasVendor,
      live,
      noResultsMessage,
      openBrowsePopup,
      searchQuery,
      vendor.code,
      vendor.name,
      vendorArgs,
    ],
  );

  const triggerExplicitSearch = useCallback(() => {
    void runManualSearch({ autoSelectSingle: false, showEmptyToast: true });
  }, [runManualSearch]);

  const openInline = (text: string) => {
    if (manualSearch || !hasVendor) return;
    setInlineQuery(text);
    setInlineOpen(text.trim().length >= 1);
  };

  const openManualTypeahead = (text: string) => {
    manualQueryEditedRef.current = true;
    if (text.trim().length < 1) {
      setManualDropdownOpen(false);
      setManualDropdownHits([]);
    }
  };

  const onNameChange = (name: string) => {
    onChange({ ...value, id: undefined, name });
    if (manualSearch) openManualTypeahead(name);
    else openInline(name);
  };

  const onFocusManual = () => {
    if (
      manualQueryEditedRef.current &&
      manualQueryRaw.length >= 1 &&
      manualDropdownHits.length > 0
    ) {
      setManualDropdownOpen(true);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (manualSearch) {
      if (manualDropdownVisible) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setHighlight((h) => Math.min(h + 1, manualDropdownHits.length - 1));
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
          resultsAvailable: manualDropdownHits.length > 0,
          highlightedIndex: highlight,
          onPickHighlighted: () => {
            const hit = manualDropdownHits[highlight];
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

    if (
      handleLookupCommitKeyDown(e, {
        dropdownOpen: inlineOpen,
        resultsAvailable: inlineHits.length > 0,
        highlightedIndex: highlight,
        onPickHighlighted: () => {
          const hit = inlineHits[highlight];
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

  const emptyMsg = !hasVendor
    ? "Select a Vendor first"
    : "No services are configured for this vendor.";

  const manualQueryActive =
    manualSearch && manualQueryEditedRef.current && manualQueryRaw.length >= 1;
  const activeHighlightQuery = manualSearch ? debouncedManualQuery : debouncedInline;
  const manualDropdownVisible =
    manualSearch && manualDropdownOpen && manualQueryActive && manualDropdownHits.length > 0;

  const showInlineDropdown = manualSearch
    ? manualDropdownVisible
    : inlineOpen && hasVendor && inlineHits.length > 0;
  const dropdownHits = manualSearch && manualDropdownOpen ? manualDropdownHits : inlineHits;

  const navGroupProps =
    navOrder != null ? ({ [ERP_NAV_GROUP]: "" } as const) : undefined;
  const navOrderProps =
    navOrder != null ? ({ [ERP_NAV_ORDER]: String(navOrder) } as const) : undefined;
  const navSkipProps = { [ERP_NAV_SKIP]: "" } as const;
  const manualSearchProps = manualSearch ? ({ [ERP_MANUAL_SEARCH]: "" } as const) : undefined;

  const inputDisabled = locked;

  const searchBtnProps = { [LOOKUP_SEARCH_BTN_ATTR]: "" } as const;

  const triggerSearch = () => {
    if (manualSearch) {
      triggerExplicitSearch();
      return;
    }
    setInlineOpen(false);
    setPopupQuery(value.name || value.code || "");
    setPopupOpen(true);
  };

  return (
    <>
      <div ref={wrapRef} className="relative w-full" {...navGroupProps} {...manualSearchProps}>
        {splitCode ? (
          <div className="flex w-full min-w-0 items-stretch gap-1">
            <div className="lookup-name relative min-h-8 min-w-0 flex-1 overflow-hidden rounded border border-input bg-background">
              <Input
                value={value.name}
                disabled={inputDisabled}
                onChange={(e) => onNameChange(e.target.value)}
                onFocus={() => {
                  if (manualSearch) onFocusManual();
                  else openInline(value.name || "");
                }}
                onKeyDown={onKeyDown}
                className={cn(
                  "min-w-0 flex-1",
                  compact ? "h-8 border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-0" : "h-9 border-0 bg-transparent shadow-none focus-visible:ring-0",
                )}
                placeholder={hasVendor ? "Service" : "Select vendor first"}
                autoComplete="off"
                role="combobox"
                aria-expanded={showInlineDropdown}
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
                  disabled={inputDisabled}
                  readOnly
                  className={cn(
                    "w-full cursor-default bg-muted/30 text-foreground",
                    compact ? "h-8 border-0 px-1 text-[13px] shadow-none focus-visible:ring-0" : "h-9 border-0 shadow-none focus-visible:ring-0",
                  )}
                  placeholder="Code"
                  autoComplete="off"
                  tabIndex={-1}
                  {...(navOrder != null ? navSkipProps : {})}
                />
              </div>
              <Button
                size="icon"
                variant="outline"
                type="button"
                disabled={inputDisabled}
                className={cn(
                  "shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90 hover:text-sidebar-foreground",
                  compact ? "h-8 w-8" : "h-9 w-9",
                )}
                aria-label="Search services"
                {...searchBtnProps}
                onMouseDown={(e) => {
                  if (inputDisabled) return;
                  e.preventDefault();
                  e.stopPropagation();
                  triggerSearch();
                }}
                {...(navOrder != null ? navSkipProps : {})}
              >
                {manualSearching ? (
                  <Loader2 className={compact ? "h-3.5 w-3.5 animate-spin" : "h-4 w-4 animate-spin"} />
                ) : (
                  <Search className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-1">
            <Input
              value={value.name}
              disabled={locked}
              onChange={(e) => onNameChange(e.target.value)}
              onFocus={() => {
                if (manualSearch) onFocusManual();
                else openInline(value.name || "");
              }}
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
                if (manualSearch) openManualTypeahead(code);
                else openInline(code);
              }}
              onFocus={() => {
                if (manualSearch) onFocusManual();
                else openInline(value.code || "");
              }}
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
              {...searchBtnProps}
              onMouseDown={(e) => {
                if (locked) return;
                e.preventDefault();
                e.stopPropagation();
                triggerSearch();
              }}
            >
              <Search className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
            </Button>
          </div>
        )}

        {showInlineDropdown ? (
          <LookupDropdownPortal
            open
            anchorRef={wrapRef}
            id={listId}
            insetRight={splitCode ? 36 : 0}
          >
            {dropdownHits.map((hit, idx) => (
              <button
                key={hit.id}
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
                <LookupAutocompleteServiceRow
                  name={hit.name}
                  code={hit.code}
                  hint={hit.hint}
                  query={activeHighlightQuery}
                  highlighted={idx === highlight}
                />
              </button>
            ))}
          </LookupDropdownPortal>
        ) : null}
      </div>

      <Dialog
        open={popupOpen}
        onOpenChange={(o) => {
          setPopupOpen(o);
          if (!o) {
            setPopupQuery("");
            setManualPopupHits(null);
          }
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
