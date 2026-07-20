/**
 * Reusable party contact memory lookup for AWB Entry (shipper / consignee).
 * Reference-style rich pipe rows + full hydrate on select via get_party_contact.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Loader2, Search } from "lucide-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

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
import {
  formatLastUsed,
  getPartyContact,
  searchPartyContacts,
  type PartyContactHit,
  type PartyContactRole,
} from "@/lib/transactions/resources/partyContacts";
import { MASTER_LOOKUPS, type LookupKey } from "@/lib/master-lookups";

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

function filterDemoHits(role: PartyContactRole, q: string): PartyContactHit[] {
  const key: LookupKey = role === "shipper" ? "shipper" : "customer";
  const opts = MASTER_LOOKUPS[key]?.options ?? [];
  const needle = q.trim().toLowerCase();
  const filtered = !needle
    ? opts.slice(0, 10)
    : opts
        .filter(
          (o) =>
            o.name.toLowerCase().includes(needle) ||
            o.code.toLowerCase().includes(needle) ||
            (o.hint ?? "").toLowerCase().includes(needle),
        )
        .slice(0, 15);
  return filtered.map((o, i) => ({
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
  debounceMs = 300,
  disabled,
}: {
  role: PartyContactRole;
  value: CompanyValue;
  onCompanyChange: (v: CompanyValue) => void;
  onSelectContact: (contact: PartyContactSelection) => void;
  minChars?: number;
  debounceMs?: number;
  disabled?: boolean;
}) {
  const { isAuthenticated: live } = useAuth();
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupQuery, setPopupQuery] = useState("");
  const [inlineOpen, setInlineOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [inlineQuery, setInlineQuery] = useState("");
  const [popupPage, setPopupPage] = useState(1);
  const [hydrating, setHydrating] = useState(false);
  const pageSize = 10;

  const debouncedInline = useDebouncedValue(inlineQuery, debounceMs);
  const debouncedPopup = useDebouncedValue(popupQuery, debounceMs);
  const canInline =
    inlineOpen && (inlineQuery.trim().length === 0 || debouncedInline.trim().length >= minChars);

  const inlineKeyQ =
    inlineQuery.trim().length === 0 ? null : debouncedInline.trim() || null;

  const { data: liveInline, isFetching: inlineFetching } = useQuery({
    queryKey: ["party-contacts", role, "inline", inlineKeyQ],
    queryFn: () => searchPartyContacts(role, inlineKeyQ, 15),
    enabled: Boolean(live && canInline),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const { data: livePopup, isFetching: popupFetching } = useQuery({
    queryKey: ["party-contacts", role, "popup", debouncedPopup.trim() || null],
    queryFn: () => searchPartyContacts(role, debouncedPopup.trim() || null, 100),
    enabled: Boolean(live && popupOpen),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const inlineHits: PartyContactHit[] = useMemo(() => {
    if (!canInline) return [];
    if (live) return liveInline ?? [];
    return filterDemoHits(role, inlineQuery.trim().length === 0 ? "" : debouncedInline);
  }, [canInline, live, liveInline, role, inlineQuery, debouncedInline]);

  const popupHits: PartyContactHit[] = useMemo(() => {
    if (live) return livePopup ?? [];
    return filterDemoHits(role, popupQuery);
  }, [live, livePopup, role, popupQuery]);

  const popupTotalPages = Math.max(1, Math.ceil(popupHits.length / pageSize));
  const popupPageSafe = Math.min(popupPage, popupTotalPages);
  const popupSlice = popupHits.slice((popupPageSafe - 1) * pageSize, popupPageSafe * pageSize);

  useEffect(() => setHighlight(0), [debouncedInline, inlineOpen]);
  useEffect(() => setPopupPage(1), [debouncedPopup, popupOpen]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setInlineOpen(false);
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
      setInlineOpen(false);
      setPopupOpen(false);
      setInlineQuery("");
    } finally {
      setHydrating(false);
    }
  };

  const startInline = (text: string) => {
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
      void pick(inlineHits[highlight]);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setInlineOpen(false);
      return;
    }
    if (e.key === "Tab" && inlineHits[highlight]) {
      void pick(inlineHits[highlight]);
    }
  };

  const title = role === "shipper" ? "Shipper" : "Consignee";
  const showDropdown = inlineOpen;
  const searching =
    showDropdown &&
    live &&
    inlineFetching &&
    inlineQuery.trim().length > 0 &&
    inlineQuery !== debouncedInline;

  return (
    <>
      <div ref={wrapRef} className="relative">
        <div className="flex gap-1">
          <Input
            value={value.code}
            disabled={disabled || hydrating}
            onChange={(e) => {
              const code = e.target.value;
              onCompanyChange({ ...value, id: undefined, code });
              startInline(code || value.name);
            }}
            onFocus={() => startInline(value.code || value.name || "")}
            onKeyDown={onKeyDown}
            className="w-20"
            placeholder="Code"
            autoComplete="off"
            role="combobox"
            aria-expanded={showDropdown}
            aria-controls={listId}
          />
          <Input
            value={value.name}
            disabled={disabled || hydrating}
            onChange={(e) => {
              const name = e.target.value;
              onCompanyChange({ ...value, id: undefined, name });
              startInline(name);
            }}
            onFocus={() => startInline(value.name || "")}
            onKeyDown={onKeyDown}
            className="min-w-0 flex-1"
            placeholder="Company Name"
            autoComplete="off"
            role="combobox"
            aria-expanded={showDropdown}
            aria-controls={listId}
          />
          <Button
            size="icon"
            variant="outline"
            type="button"
            disabled={disabled || hydrating}
            className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
            aria-label={`Search ${title}`}
            onClick={() => {
              setInlineOpen(false);
              setPopupQuery(value.name || value.code || "");
              setPopupOpen(true);
            }}
          >
            {hydrating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>

        {showDropdown ? (
          <div
            id={listId}
            role="listbox"
            className="absolute left-0 top-full z-50 mt-1 max-h-80 w-[min(52rem,calc(100vw-2rem))] overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md"
          >
            {searching ? (
              <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching…
              </div>
            ) : inlineHits.length === 0 ? (
              <div className="px-3 py-3 text-sm text-muted-foreground">
                {inlineQuery.trim()
                  ? "No results found"
                  : "No recent contacts — type to search"}
              </div>
            ) : (
              inlineHits.map((hit, idx) => (
                <button
                  key={hit.id}
                  type="button"
                  role="option"
                  aria-selected={idx === highlight}
                  className={cn(
                    "flex w-full flex-col gap-0.5 border-b px-3 py-2 text-left last:border-b-0",
                    idx === highlight ? "bg-muted" : "hover:bg-muted/50",
                  )}
                  onMouseEnter={() => setHighlight(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    void pick(hit);
                  }}
                >
                  <div className="truncate font-mono text-[11px] leading-snug tracking-tight uppercase sm:text-xs">
                    {formatContactPipeRow(hit)}
                  </div>
                  <div className="flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
                    <span>Last Used {formatLastUsed(hit.last_used_at)}</span>
                    {hit.shipment_count > 0 ? (
                      <span>{hit.shipment_count} shipment{hit.shipment_count === 1 ? "" : "s"}</span>
                    ) : null}
                    {hit.email ? <span>{hit.email}</span> : null}
                  </div>
                </button>
              ))
            )}
            <div className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
              ↑↓ navigate · Enter select · Esc close · Tab accept
            </div>
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
