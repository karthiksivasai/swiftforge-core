/**
 * Reusable party contact memory lookup for AWB Entry (shipper / consignee).
 * Reference-style rich pipe rows + full hydrate on select via get_party_contact.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Loader2, Search } from "lucide-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { ERP_MANUAL_SEARCH, ERP_NAV_GROUP, ERP_NAV_ORDER, ERP_NAV_SKIP } from "@/lib/forms/erp-keyboard-nav";
import {
  isLookupDropdownOutside,
  LOOKUP_SEARCH_BTN_ATTR,
  LookupDropdownPortal,
} from "@/components/masters/lookup-dropdown-portal";
import {
  formatLastUsed,
  getPartyContact,
  searchPartyContacts,
  type PartyContactHit,
  type PartyContactRole,
} from "@/lib/transactions/resources/partyContacts";
import { MASTER_LOOKUPS, type LookupKey } from "@/lib/master-lookups";
import {
  lookupHitSearchFields,
  rankLookupResults,
  type RankedSearchField,
} from "@/lib/search/ranked-lookup-search";
import {
  AWB_LOOKUP_DEBOUNCE_MS,
  AWB_LOOKUP_NO_RESULTS,
  AWB_LOOKUP_RESULT_LIMIT,
  LookupAutocompleteCompanyRow,
  handleLookupCommitKeyDown,
} from "@/components/masters/lookup-autocomplete-ui";

export type PartyContactSelection = {
  id?: string;
  code: string;
  name: string;
  contactName: string;
  address1: string;
  address2: string;
  pincode: string;
  city: string;
  state: string;
  country: string;
  telephone: string;
  mobileNo: string;
  email: string;
  documentType: string;
  documentNo: string;
  iecNo: string;
  origin: { id?: string; code: string; name: string };
};

/** Map stored / ERP labels onto AWB Document Type select values. */
export function normalizeDocumentType(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const lower = t.toLowerCase();
  if (lower.includes("aadhaar") || lower.includes("aadhar")) return "Aadhaar Number";
  if (lower.includes("gstin") && lower.includes("normal")) return "GSTIN (Normal)";
  if (lower.includes("gst")) return "GSTIN (Normal)";
  if (lower.includes("pan")) return "PAN Number";
  if (lower.includes("passport")) return "Passport Number";
  if (lower.includes("driving") || lower.includes("dl")) return "Driving License";
  if (lower.includes("iec")) return "IEC Certificate";
  if (lower.includes("voter")) return "Voter ID";
  if (lower.includes("tan")) return "TAN Number";
  const known = [
    "Aadhaar Number",
    "GSTIN (Normal)",
    "GSTIN",
    "PAN Number",
    "Passport Number",
    "Driving License",
    "IEC Certificate",
    "Voter ID",
    "TAN Number",
    "Other",
  ];
  const exact = known.find((k) => k.toLowerCase() === lower);
  return exact ?? t;
}

export function hitToSelection(hit: PartyContactHit): PartyContactSelection {
  return {
    id: hit.id,
    code: hit.code ?? "",
    name: hit.name ?? "",
    contactName: hit.contact_name || hit.name || "",
    address1: hit.address1 ?? "",
    address2: hit.address2 ?? "",
    pincode: hit.pin_code ?? "",
    city: hit.city ?? "",
    state: hit.state_name ?? "",
    country: hit.country_name || "India",
    telephone: hit.telephone ?? "",
    mobileNo: hit.mobile ?? "",
    email: hit.email ?? "",
    documentType: normalizeDocumentType(hit.document_type ?? ""),
    documentNo: hit.document_no ?? "",
    iecNo: hit.iec_no ?? "",
    origin: {
      id: hit.geo_id ?? undefined,
      code: hit.geo_code ?? "",
      name: hit.geo_name || hit.geo_code || "",
    },
  };
}

/** CourierWala-style dense single-line suggestion. */
export function formatContactPipeRow(hit: PartyContactHit): string {
  const parts = [
    hit.name,
    hit.code,
    hit.pin_code,
    hit.geo_code,
    hit.mobile,
    "",
    hit.document_type,
    hit.document_no,
    hit.city,
    hit.address1,
  ];
  // Join with " | " but keep a "||" gap before document type like the reference.
  const left = [parts[0], parts[1], parts[2], parts[3], parts[4]]
    .map((p) => (p ?? "").trim())
    .join(" | ");
  const right = [parts[6], parts[7], parts[8], parts[9]]
    .map((p) => (p ?? "").trim())
    .join(" | ");
  return `${left} || ${right}`.replace(/\s+\|\s+\|\s+/g, " || ").trim();
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function partyContactSearchFields(hit: PartyContactHit): RankedSearchField {
  return {
    code: hit.code,
    name: hit.name,
    extra: [
      hit.contact_name,
      hit.city,
      hit.mobile,
      hit.pin_code,
      hit.document_no,
      hit.geo_code,
      hit.address1,
    ],
  };
}

function rankPartyContactHits(
  hits: PartyContactHit[],
  q: string,
  limit = 15,
): PartyContactHit[] {
  return rankLookupResults(hits, q, partyContactSearchFields, { limit });
}

function filterDemoHits(role: PartyContactRole, q: string): PartyContactHit[] {
  const key: LookupKey = role === "shipper" ? "shipper" : "customer";
  const opts = MASTER_LOOKUPS[key]?.options ?? [];
  const rankedOpts = rankLookupResults(
    opts.map((o) => ({ code: o.code, name: o.name, hint: o.hint })),
    q,
    lookupHitSearchFields,
    { limit: 15 },
  );
  return rankedOpts.map((o, i) => ({
    id: `demo-${role}-${o.code}-${i}`,
    code: o.code,
    name: o.name,
    contact_name: o.name,
    address1: o.hint ?? "",
    address2: "",
    pin_code: "500001",
    city: o.hint || "Hyderabad",
    state_name: "Telangana",
    country_name: role === "consignee" ? "" : "India",
    telephone: "",
    mobile: "9000000000",
    email: "",
    document_type: "Aadhaar Number",
    document_no: "9000000000",
    iec_no: "",
    geo_code: role === "shipper" ? "HYD" : "",
    geo_name: role === "shipper" ? "Hyderabad" : "",
    geo_id: null,
    last_used_at: new Date().toISOString(),
    shipment_count: 1,
  }));
}

type CompanyValue = { id?: string; code: string; name: string };

export function PartyContactLookup({
  role,
  value,
  onCompanyChange,
  onSelectContact,
  minChars = 1,
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
  role: PartyContactRole;
  value: CompanyValue;
  onCompanyChange: (v: CompanyValue) => void;
  onSelectContact: (contact: PartyContactSelection) => void;
  minChars?: number;
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
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupQuery, setPopupQuery] = useState("");
  const [inlineOpen, setInlineOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [inlineQuery, setInlineQuery] = useState("");
  const [popupPage, setPopupPage] = useState(1);
  const [hydrating, setHydrating] = useState(false);
  const [manualPopupHits, setManualPopupHits] = useState<PartyContactHit[] | null>(null);
  const [manualDropdownHits, setManualDropdownHits] = useState<PartyContactHit[]>([]);
  const [manualDropdownOpen, setManualDropdownOpen] = useState(false);
  const [manualSearching, setManualSearching] = useState(false);
  const pageSize = 10;

  const manualQueryRaw = (value.name || value.code || "").trim();
  const debouncedManualQuery = useDebouncedValue(manualQueryRaw, debounceMs);
  const canDebouncedManualSearch =
    manualSearch && manualQueryEditedRef.current && debouncedManualQuery.length >= minChars;

  const debouncedInline = useDebouncedValue(inlineQuery, debounceMs);
  const debouncedPopup = useDebouncedValue(popupQuery, debounceMs);
  const trimmedInlineQuery = inlineQuery.trim();
  const trimmedDebouncedInline = debouncedInline.trim();
  const canInline =
    !manualSearch && inlineOpen && trimmedInlineQuery.length >= minChars;

  const inlineKeyQ =
    trimmedDebouncedInline.length >= minChars ? trimmedDebouncedInline : null;

  const { data: liveInline, isFetching: inlineFetching } = useQuery({
    queryKey: ["party-contacts", role, "inline", inlineKeyQ],
    queryFn: () => searchPartyContacts(role, inlineKeyQ, 15),
    enabled: Boolean(live && canInline && !manualSearch),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const { data: livePopup, isFetching: popupFetching } = useQuery({
    queryKey: ["party-contacts", role, "popup", debouncedPopup.trim() || null],
    queryFn: () => searchPartyContacts(role, debouncedPopup.trim() || null, 100),
    enabled: Boolean(live && popupOpen && manualPopupHits === null),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const inlineHits: PartyContactHit[] = useMemo(() => {
    if (!canInline || trimmedDebouncedInline.length < minChars) return [];
    if (live) return rankPartyContactHits(liveInline ?? [], trimmedDebouncedInline);
    return filterDemoHits(role, trimmedDebouncedInline);
  }, [canInline, trimmedDebouncedInline, minChars, live, liveInline, role]);

  const popupHits: PartyContactHit[] = useMemo(() => {
    if (manualPopupHits) return manualPopupHits;
    if (live) return rankPartyContactHits(livePopup ?? [], popupQuery, 100);
    return filterDemoHits(role, popupQuery);
  }, [manualPopupHits, live, livePopup, role, popupQuery]);

  const popupTotalPages = Math.max(1, Math.ceil(popupHits.length / pageSize));
  const popupPageSafe = Math.min(popupPage, popupTotalPages);
  const popupSlice = popupHits.slice((popupPageSafe - 1) * pageSize, popupPageSafe * pageSize);

  useEffect(() => setHighlight(0), [debouncedInline, inlineOpen, debouncedManualQuery]);
  useEffect(() => setPopupPage(1), [debouncedPopup, popupOpen]);

  useEffect(() => {
    if (!canDebouncedManualSearch) {
      if (!manualSearch || debouncedManualQuery.length < minChars) {
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
      ? searchPartyContacts(role, debouncedManualQuery, 100)
      : Promise.resolve(filterDemoHits(role, debouncedManualQuery))
    )
      .then((hits) => {
        if (cancelled || seqAtStart !== explicitSearchSeqRef.current) return;
        const ranked = rankPartyContactHits(hits, debouncedManualQuery, AWB_LOOKUP_RESULT_LIMIT);
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
  }, [canDebouncedManualSearch, debouncedManualQuery, live, manualSearch, minChars, role]);

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

  const pick = async (hit: PartyContactHit) => {
    setHydrating(true);
    try {
      let full = hit;
      if (live && hit.id && !hit.id.startsWith("demo-")) {
        const hydrated = await getPartyContact(role, hit.id);
        if (hydrated) full = hydrated;
      }
      onSelectContact(hitToSelection(full));
      manualQueryEditedRef.current = false;
      setInlineOpen(false);
      setPopupOpen(false);
      setInlineQuery("");
      setManualPopupHits(null);
      setManualDropdownOpen(false);
      setManualDropdownHits([]);
      onCommit?.();
    } finally {
      setHydrating(false);
    }
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
    async (hits: PartyContactHit[], opts?: { autoSelectSingle?: boolean }) => {
      const autoSelectSingle = opts?.autoSelectSingle ?? false;
      if (hits.length === 0) {
        clearManualDropdown();
        return false;
      }
      if (autoSelectSingle && hits.length === 1) {
        await pick(hits[0]);
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
          ? rankPartyContactHits(await searchPartyContacts(role, q, 100), q, 100)
          : filterDemoHits(role, q);
        if (seq !== explicitSearchSeqRef.current) return;
        if (hits.length === 0) {
          clearManualDropdown();
          toast.error(noResultsMessage);
          return;
        }
        await applyManualHits(hits, { autoSelectSingle });
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
      noResultsMessage,
      openBrowsePopup,
      role,
      searchQuery,
    ],
  );

  const triggerExplicitSearch = useCallback(() => {
    void runManualSearch({ autoSelectSingle: false, showEmptyToast: true });
  }, [runManualSearch]);

  const startInline = (text: string) => {
    if (manualSearch) return;
    setInlineQuery(text);
    const trimmed = text.trim();
    setInlineOpen(trimmed.length >= minChars);
  };

  const manualQueryActive =
    manualSearch && manualQueryEditedRef.current && manualQueryRaw.length >= minChars;
  const activeHighlightQuery = manualSearch ? debouncedManualQuery : trimmedDebouncedInline;
  const manualDropdownVisible =
    manualSearch && manualDropdownOpen && manualQueryActive && manualDropdownHits.length > 0;
  const dropdownHits = manualSearch && manualDropdownOpen ? manualDropdownHits : inlineHits;
  const showDropdown = manualSearch
    ? manualDropdownVisible
    : inlineOpen && canInline && inlineHits.length > 0;

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
            if (hit) void pick(hit);
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
          if (hit) void pick(hit);
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

  const title = role === "shipper" ? "Shipper" : "Consignee";
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
      disabled={disabled || hydrating}
      onChange={(e) => {
        const name = e.target.value;
        manualQueryEditedRef.current = true;
        onCompanyChange({ ...value, id: undefined, name });
        if (manualSearch) {
          if (name.trim().length < minChars) {
            setManualDropdownOpen(false);
            setManualDropdownHits([]);
          }
        } else {
          startInline(name);
        }
      }}
      onFocus={() => {
        if (manualSearch) {
          if (
            manualQueryEditedRef.current &&
            manualQueryRaw.length >= minChars &&
            manualDropdownHits.length > 0
          ) {
            setManualDropdownOpen(true);
          }
        }
      }}
      onKeyDown={onKeyDown}
      className={cn("min-w-0 flex-1", inputH, flatInput)}
      placeholder="Company Name"
      autoComplete="off"
      role="combobox"
      aria-expanded={showDropdown}
      aria-controls={listId}
      {...navOrderProps}
    />
  );

  const codeInput = (
    <Input
      value={value.code}
      disabled={disabled || hydrating}
      readOnly={splitCode}
      onChange={
        splitCode
          ? undefined
          : (e) => {
              const code = e.target.value;
              manualQueryEditedRef.current = true;
              onCompanyChange({ ...value, id: undefined, code });
              if (!manualSearch) startInline(code || value.name);
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
                  manualDropdownHits.length > 0
                ) {
                  setManualDropdownOpen(true);
                }
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
      autoComplete="off"
      role={splitCode ? undefined : "combobox"}
      aria-expanded={splitCode ? undefined : showDropdown}
      aria-controls={splitCode ? undefined : listId}
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
      disabled={disabled || hydrating}
      className={cn(
        "shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90 hover:text-sidebar-foreground",
        btnSize,
      )}
      aria-label={`Search ${title}`}
      {...searchBtnProps}
      onMouseDown={(e) => {
        if (disabled || hydrating) return;
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
      {hydrating || manualSearching ? (
        <Loader2 className={cn(iconSize, "animate-spin")} />
      ) : (
        <Search className={iconSize} />
      )}
    </Button>
  );

  return (
    <>
      <div ref={wrapRef} className="relative w-full" {...navGroupProps} {...manualSearchProps}>
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
          <LookupDropdownPortal
            open
            anchorRef={wrapRef}
            id={listId}
            insetRight={splitCode ? 36 : 0}
            className="max-h-80"
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
                  void pick(hit);
                }}
              >
                {manualSearch ? (
                  <LookupAutocompleteCompanyRow
                    name={hit.name}
                    code={hit.code}
                    query={activeHighlightQuery}
                    highlighted={idx === highlight}
                  />
                ) : (
                  <>
                    <div className="truncate font-mono text-[11px] leading-snug tracking-tight uppercase sm:text-xs">
                      {formatContactPipeRow(hit)}
                    </div>
                    <div className="flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
                      <span>Last Used {formatLastUsed(hit.last_used_at)}</span>
                      {hit.shipment_count > 0 ? (
                        <span>
                          {hit.shipment_count} shipment{hit.shipment_count === 1 ? "" : "s"}
                        </span>
                      ) : null}
                      {hit.email ? <span>{hit.email}</span> : null}
                    </div>
                  </>
                )}
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
        <DialogContent className="flex max-h-[85vh] max-w-5xl flex-col gap-3 overflow-hidden">
          <DialogHeader className="flex-row items-center justify-between space-y-0">
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-end gap-2">
            <span className="text-sm text-muted-foreground">Search</span>
            <Input
              value={popupQuery}
              onChange={(e) => setPopupQuery(e.target.value)}
              placeholder="Name, code, mobile, pin, document…"
              className="max-w-xs"
              autoFocus
            />
          </div>
          <div className="min-h-0 flex-1 overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-sidebar text-sidebar-foreground">
                <TableRow className="hover:bg-sidebar">
                  <TableHead className="text-sidebar-foreground">Company Name</TableHead>
                  <TableHead className="text-sidebar-foreground">Contact</TableHead>
                  <TableHead className="text-sidebar-foreground">Code</TableHead>
                  <TableHead className="text-sidebar-foreground">City</TableHead>
                  <TableHead className="text-sidebar-foreground">State</TableHead>
                  <TableHead className="text-sidebar-foreground">Country</TableHead>
                  <TableHead className="text-sidebar-foreground">Mobile</TableHead>
                  <TableHead className="text-sidebar-foreground">Telephone</TableHead>
                  <TableHead className="text-sidebar-foreground">Doc Type</TableHead>
                  <TableHead className="text-sidebar-foreground">Doc No</TableHead>
                  <TableHead className="text-sidebar-foreground">Address</TableHead>
                  <TableHead className="text-sidebar-foreground">Last Used</TableHead>
                  <TableHead className="text-sidebar-foreground">Shipments</TableHead>
                  <TableHead className="text-sidebar-foreground">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {popupFetching && popupSlice.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={14} className="py-8 text-center text-muted-foreground">
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                      Searching…
                    </TableCell>
                  </TableRow>
                ) : popupSlice.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={14} className="py-8 text-center text-muted-foreground">
                      No matches
                    </TableCell>
                  </TableRow>
                ) : (
                  popupSlice.map((hit) => (
                    <TableRow key={hit.id}>
                      <TableCell className="max-w-[10rem] truncate font-medium">{hit.name}</TableCell>
                      <TableCell className="max-w-[8rem] truncate">{hit.contact_name}</TableCell>
                      <TableCell className="font-mono text-xs">{hit.code}</TableCell>
                      <TableCell>{hit.city}</TableCell>
                      <TableCell>{hit.state_name}</TableCell>
                      <TableCell>{hit.country_name}</TableCell>
                      <TableCell>{hit.mobile}</TableCell>
                      <TableCell>{hit.telephone}</TableCell>
                      <TableCell>{hit.document_type}</TableCell>
                      <TableCell>{hit.document_no}</TableCell>
                      <TableCell className="max-w-[12rem] truncate">{hit.address1}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatLastUsed(hit.last_used_at)}
                      </TableCell>
                      <TableCell className="text-center">{hit.shipment_count}</TableCell>
                      <TableCell>
                        <Button size="sm" type="button" onClick={() => void pick(hit)}>
                          Select
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing{" "}
              {popupHits.length === 0 ? 0 : (popupPageSafe - 1) * pageSize + 1} to{" "}
              {Math.min(popupPageSafe * pageSize, popupHits.length)} of {popupHits.length} entries
            </span>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                type="button"
                disabled={popupPageSafe <= 1}
                onClick={() => setPopupPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <span className="px-2">
                {popupPageSafe} / {popupTotalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                type="button"
                disabled={popupPageSafe >= popupTotalPages}
                onClick={() => setPopupPage((p) => Math.min(popupTotalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
