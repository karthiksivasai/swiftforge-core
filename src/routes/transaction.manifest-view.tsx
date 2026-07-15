import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Eye, Plus, Printer, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FieldWrapper,
  IconButton,
  MasterBreadcrumb,
  PAGE_SIZE,
  TablePager,
} from "@/components/master-table-kit";
import { DataIoToolbar } from "@/components/data-io-toolbar";
import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import { type LookupKey, type LookupOption } from "@/lib/master-lookups";

type LookupPair = { code: string; name: string };

type ManifestType = "outgoing" | "incoming";

type SearchByKey = "cdNo" | "masterAwbNo" | "awbNo";

type ManifestViewFilter = {
  manifestType: ManifestType;
  fromDate: string;
  toDate: string;
  origin: LookupPair;
  destination: LookupPair;
  vendor: LookupPair;
  searchBy: SearchByKey;
  searchValue: string;
};

type ManifestViewRow = {
  id: string;
  manifestType: ManifestType;
  manifestNo: string;
  masterAwbNo: string;
  cdNo: string;
  awbNo: string;
  manifestDate: string;
  flightNo: string;
  origin: string;
  destination: string;
  vendorCode: string;
  location: string;
  shipment: string;
  weight: number;
  manifestTo: string;
};

type ManifestAwbLine = {
  id: string;
  awbNo: string;
  date: string;
  origin: string;
  destination: string;
  customer: string;
  consignee: string;
  pcs: number;
  weight: number;
  value: number;
  status: string;
  statusDate: string;
  content: string;
};

type ProgressForm = {
  bagNo: string;
  progressDate: string;
  progressTime: string;
  serviceCentre: LookupPair;
  exception: LookupPair;
};

type ProgressMode = "add" | "delete";

const MANIFEST_TYPE_OPTIONS = [
  { value: "outgoing", label: "Out Going" },
  { value: "incoming", label: "In Coming" },
] as const;

const SEARCH_BY_OPTIONS = [
  { value: "cdNo", label: "CD No." },
  { value: "masterAwbNo", label: "Master AWB No." },
  { value: "awbNo", label: "AWB No." },
] as const;

const emptyPair = (): LookupPair => ({ code: "", name: "" });

const todayIso = () => new Date().toISOString().slice(0, 10);

const nowProgressTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
};

const emptyProgressForm = (): ProgressForm => ({
  bagNo: "",
  progressDate: todayIso(),
  progressTime: nowProgressTime(),
  serviceCentre: emptyPair(),
  exception: emptyPair(),
});

const defaultFilter = (): ManifestViewFilter => ({
  manifestType: "outgoing",
  fromDate: todayIso(),
  toDate: todayIso(),
  origin: { code: "HYD", name: "HYDERABAD" },
  destination: emptyPair(),
  vendor: emptyPair(),
  searchBy: "cdNo",
  searchValue: "",
});

const SEED_ROWS: Omit<ManifestViewRow, "id">[] = [
  {
    manifestType: "outgoing",
    manifestNo: "HYD/HYD/2026/1002",
    masterAwbNo: "MAWB-784512",
    cdNo: "CD-24002",
    awbNo: "CW100002",
    manifestDate: "2026-07-04",
    flightNo: "AI-840",
    origin: "HYD",
    destination: "HYD",
    vendorCode: "DHL1",
    location: "HYD",
    shipment: "1",
    weight: 233,
    manifestTo: "Third Party",
  },
  {
    manifestType: "outgoing",
    manifestNo: "HYD/HYD/2026/1008",
    masterAwbNo: "MAWB-784518",
    cdNo: "CD-24008",
    awbNo: "CW100008",
    manifestDate: "2026-07-04",
    flightNo: "6E-451",
    origin: "HYD",
    destination: "BOM",
    vendorCode: "WFT",
    location: "HYD",
    shipment: "2",
    weight: 321.1,
    manifestTo: "Third Party",
  },
  {
    manifestType: "outgoing",
    manifestNo: "HYD/HYD/2026/1011",
    masterAwbNo: "MAWB-784521",
    cdNo: "CD-24011",
    awbNo: "CW100011",
    manifestDate: "2026-07-04",
    flightNo: "UK-876",
    origin: "HYD",
    destination: "DEL",
    vendorCode: "AIC",
    location: "HYD",
    shipment: "1",
    weight: 400,
    manifestTo: "Third Party",
  },
  {
    manifestType: "incoming",
    manifestNo: "HYD/USA/2026/1003",
    masterAwbNo: "MAWB-1003",
    cdNo: "CD-24003",
    awbNo: "CW100003",
    manifestDate: "2026-07-04",
    flightNo: "AA-102",
    origin: "HYD",
    destination: "USA",
    vendorCode: "DHL1",
    location: "HYD",
    shipment: "1",
    weight: 156.5,
    manifestTo: "Service Centre",
  },
  {
    manifestType: "outgoing",
    manifestNo: "HYD/UK/2026/1004",
    masterAwbNo: "MAWB-1004",
    cdNo: "CD-24004",
    awbNo: "CW100004",
    manifestDate: "2026-07-03",
    flightNo: "BA-139",
    origin: "HYD",
    destination: "UK",
    vendorCode: "DHE",
    location: "HYD",
    shipment: "3",
    weight: 512.25,
    manifestTo: "Third Party",
  },
];

const seedRows = (): ManifestViewRow[] =>
  SEED_ROWS.map((row) => ({ id: crypto.randomUUID(), ...row }));

const AWB_TEMPLATES: Record<
  string,
  { count: number; samples: Omit<ManifestAwbLine, "id">[] }
> = {
  "HYD/HYD/2026/1002": {
    count: 37,
    samples: [
      {
        awbNo: "30404019",
        date: "04/07/2026",
        origin: "HYD",
        destination: "US",
        customer: "RASHMIKA ENT",
        consignee: "MIDHUN NARNE",
        pcs: 1,
        weight: 20,
        value: 7185,
        status: "SHIPMENT SENT TO DESTINATION",
        statusDate: "04/07/2026 17:32",
        content: "DOCUMENTS",
      },
      {
        awbNo: "30404020",
        date: "04/07/2026",
        origin: "HYD",
        destination: "US",
        customer: "TECH SOLUTIONS",
        consignee: "JOHN SMITH",
        pcs: 2,
        weight: 15.5,
        value: 5420,
        status: "SHIPMENT SENT TO DESTINATION",
        statusDate: "04/07/2026 17:28",
        content: "ELECTRONICS",
      },
      {
        awbNo: "30404021",
        date: "04/07/2026",
        origin: "HYD",
        destination: "UK",
        customer: "GLOBAL EXPORTS",
        consignee: "SARAH WILSON",
        pcs: 1,
        weight: 8.25,
        value: 3200,
        status: "IN TRANSIT",
        statusDate: "04/07/2026 16:45",
        content: "SAMPLES",
      },
    ],
  },
  "HYD/HYD/2026/1008": {
    count: 12,
    samples: [
      {
        awbNo: "30404101",
        date: "04/07/2026",
        origin: "HYD",
        destination: "BOM",
        customer: "COURIERWALA",
        consignee: "MUMBAI TRADERS",
        pcs: 3,
        weight: 45,
        value: 12500,
        status: "MANIFESTED",
        statusDate: "04/07/2026 15:10",
        content: "GENERAL",
      },
    ],
  },
  "HYD/HYD/2026/1011": {
    count: 8,
    samples: [
      {
        awbNo: "30404201",
        date: "04/07/2026",
        origin: "HYD",
        destination: "DEL",
        customer: "AIC CARGO",
        consignee: "DELHI LOGISTICS",
        pcs: 1,
        weight: 32,
        value: 8900,
        status: "MANIFESTED",
        statusDate: "04/07/2026 14:55",
        content: "MEDICAL",
      },
    ],
  },
};

const CUSTOMERS = ["RASHMIKA ENT", "TECH SOLUTIONS", "GLOBAL EXPORTS", "COURIERWALA", "AIC CARGO"];
const CONSIGNEES = ["MIDHUN NARNE", "JOHN SMITH", "SARAH WILSON", "MUMBAI TRADERS", "DELHI LOGISTICS"];
const STATUSES = ["SHIPMENT SENT TO DESTINATION", "IN TRANSIT", "MANIFESTED", "DELIVERED"];
const CONTENTS = ["DOCUMENTS", "ELECTRONICS", "SAMPLES", "GENERAL", "MEDICAL"];

function buildAwbLines(manifest: ManifestViewRow): ManifestAwbLine[] {
  const template = AWB_TEMPLATES[manifest.manifestNo];
  const count = template?.count ?? 5;
  const samples = template?.samples ?? [];

  return Array.from({ length: count }, (_, i) => {
    const sample = samples[i % samples.length];
    if (sample && i < samples.length) {
      return { id: crypto.randomUUID(), ...sample };
    }
    const base = samples[0];
    const awbBase = base ? Number.parseInt(base.awbNo, 10) : 30404000;
    return {
      id: crypto.randomUUID(),
      awbNo: String(awbBase + i),
      date: formatDisplayDate(manifest.manifestDate),
      origin: manifest.origin,
      destination: manifest.destination,
      customer: CUSTOMERS[i % CUSTOMERS.length],
      consignee: CONSIGNEES[i % CONSIGNEES.length],
      pcs: (i % 3) + 1,
      weight: Number((5 + (i % 7) * 2.5).toFixed(3)),
      value: 1000 + i * 250,
      status: STATUSES[i % STATUSES.length],
      statusDate: `${formatDisplayDate(manifest.manifestDate)} ${String(10 + (i % 8)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}`,
      content: CONTENTS[i % CONTENTS.length],
    };
  });
}

const manifestAwbCache = new Map<string, ManifestAwbLine[]>();

function getManifestAwbLines(manifest: ManifestViewRow): ManifestAwbLine[] {
  const cached = manifestAwbCache.get(manifest.id);
  if (cached) return cached;
  const lines = buildAwbLines(manifest);
  manifestAwbCache.set(manifest.id, lines);
  return lines;
}

function formatDisplayDate(iso: string) {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function formatWeight(value: number) {
  return value.toFixed(3);
}

function filterRows(rows: ManifestViewRow[], filter: ManifestViewFilter) {
  return rows.filter((row) => {
    if (row.manifestType !== filter.manifestType) return false;
    if (row.manifestDate < filter.fromDate || row.manifestDate > filter.toDate) return false;

    if (filter.origin.code.trim() || filter.origin.name.trim()) {
      const originHay = `${row.origin} ${row.location}`.toLowerCase();
      const code = filter.origin.code.trim().toLowerCase();
      const name = filter.origin.name.trim().toLowerCase();
      if (code && !originHay.includes(code) && row.origin.toLowerCase() !== code) return false;
      if (name && !originHay.includes(name)) return false;
    }

    if (filter.destination.code.trim() || filter.destination.name.trim()) {
      const destHay = `${row.destination}`.toLowerCase();
      const code = filter.destination.code.trim().toLowerCase();
      const name = filter.destination.name.trim().toLowerCase();
      if (code && !destHay.includes(code)) return false;
      if (name && !destHay.includes(name)) return false;
    }

    if (filter.vendor.code.trim() || filter.vendor.name.trim()) {
      const vendorHay = row.vendorCode.toLowerCase();
      const code = filter.vendor.code.trim().toLowerCase();
      const name = filter.vendor.name.trim().toLowerCase();
      if (code && !vendorHay.includes(code)) return false;
      if (name && !vendorHay.includes(name)) return false;
    }

    if (filter.searchValue.trim()) {
      const needle = filter.searchValue.trim().toLowerCase();
      const field =
        filter.searchBy === "cdNo"
          ? row.cdNo
          : filter.searchBy === "masterAwbNo"
            ? row.masterAwbNo
            : row.awbNo;
      if (!field.toLowerCase().includes(needle)) return false;
    }

    return true;
  });
}

export const Route = createFileRoute("/transaction/manifest-view")({
  component: ManifestViewPage,
  head: () => ({
    meta: [
      { title: "Manifest View — Transaction — Courier ERP" },
      {
        name: "description",
        content: "Search and view outgoing and incoming manifests.",
      },
    ],
  }),
});

function ManifestViewPage() {
  const [allRows] = useState(seedRows);
  const [filter, setFilter] = useState<ManifestViewFilter>(defaultFilter);
  const [appliedFilter, setAppliedFilter] = useState<ManifestViewFilter | null>(null);
  const [tableSearch, setTableSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedManifestId, setSelectedManifestId] = useState<string | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressManifest, setProgressManifest] = useState<ManifestViewRow | null>(null);
  const [progressMode, setProgressMode] = useState<ProgressMode>("add");
  const [progressForm, setProgressForm] = useState<ProgressForm>(emptyProgressForm);

  const searchByLabel =
    SEARCH_BY_OPTIONS.find((opt) => opt.value === filter.searchBy)?.label ?? "CD No.";

  const results = useMemo(() => {
    if (!appliedFilter) return [];
    return filterRows(allRows, appliedFilter);
  }, [allRows, appliedFilter]);

  const filtered = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    if (!q) return results;
    return results.filter((row) =>
      [
        row.manifestNo,
        row.masterAwbNo,
        row.flightNo,
        row.origin,
        row.destination,
        row.vendorCode,
        row.location,
        row.manifestTo,
        row.cdNo,
        row.awbNo,
      ].some((v) => v.toLowerCase().includes(q)),
    );
  }, [results, tableSearch]);

  const selectedManifest = useMemo(
    () => allRows.find((row) => row.id === selectedManifestId) ?? null,
    [allRows, selectedManifestId],
  );

  const detailLines = useMemo(
    () => (selectedManifest ? getManifestAwbLines(selectedManifest) : []),
    [selectedManifest],
  );

  const totalWeight = useMemo(
    () => filtered.reduce((sum, row) => sum + row.weight, 0),
    [filtered],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIdx = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [currentPage, filtered]);

  const openManifestDetail = (row: ManifestViewRow) => {
    setSelectedManifestId((current) => (current === row.id ? null : row.id));
  };

  const openAddProgress = (row: ManifestViewRow) => {
    setProgressManifest(row);
    setProgressMode("add");
    setProgressForm({
      ...emptyProgressForm(),
      serviceCentre: { code: row.location || "HYD", name: row.origin || "HYD" },
    });
    setProgressOpen(true);
  };

  const closeAddProgress = () => {
    setProgressOpen(false);
    setProgressManifest(null);
    setProgressMode("add");
    setProgressForm(emptyProgressForm());
  };

  const patchProgress = (patch: Partial<ProgressForm>) =>
    setProgressForm((f) => ({ ...f, ...patch }));

  const handleProgressSave = () => {
    if (!progressForm.serviceCentre.code.trim() && !progressForm.serviceCentre.name.trim()) {
      return toast.error("Service Centre is required");
    }
    const action = progressMode === "add" ? "added" : "deleted";
    toast.success(`Progress ${action} for ${progressManifest?.manifestNo ?? "manifest"}`);
    closeAddProgress();
  };

  const handleView = () => {
    if (!filter.fromDate) return toast.error("From Date is required");
    if (!filter.toDate) return toast.error("To Date is required");
    setAppliedFilter({ ...filter });
    setTableSearch("");
    setSelectedManifestId(null);
    setPage(1);
  };

  const handleReset = () => {
    const next = defaultFilter();
    setFilter(next);
    setAppliedFilter(null);
    setTableSearch("");
    setSelectedManifestId(null);
    setPage(1);
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Transaction", "Manifest View"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Manifest View</h1>
        <p className="text-sm text-muted-foreground">
          Search outgoing and incoming manifests by date, route, vendor, and reference numbers.
        </p>
      </div>

      <Card className="min-w-0 overflow-hidden border p-0">
        <div className="space-y-4 p-4 md:p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <FieldWrapper label="Manifest Type" required>
              <Select
                value={filter.manifestType}
                onValueChange={(v) =>
                  setFilter((f) => ({ ...f, manifestType: v as ManifestType }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MANIFEST_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>

            <FieldWrapper label="From Date" required>
              <Input
                type="date"
                value={filter.fromDate}
                onChange={(e) => setFilter((f) => ({ ...f, fromDate: e.target.value }))}
              />
            </FieldWrapper>

            <FieldWrapper label="To Date" required>
              <Input
                type="date"
                value={filter.toDate}
                onChange={(e) => setFilter((f) => ({ ...f, toDate: e.target.value }))}
              />
            </FieldWrapper>

            <FieldWrapper label="Origin">
              <DualLookupInput
                lookup="destination"
                value={filter.origin}
                onChange={(origin) => setFilter((f) => ({ ...f, origin }))}
              />
            </FieldWrapper>

            <FieldWrapper label="Destination">
              <DualLookupInput
                lookup="destination"
                value={filter.destination}
                onChange={(destination) => setFilter((f) => ({ ...f, destination }))}
              />
            </FieldWrapper>

            <FieldWrapper label="Vendor">
              <DualLookupInput
                lookup="vendor"
                value={filter.vendor}
                onChange={(vendor) => setFilter((f) => ({ ...f, vendor }))}
              />
            </FieldWrapper>

            <FieldWrapper label="Search By">
              <Select
                value={filter.searchBy}
                onValueChange={(v) =>
                  setFilter((f) => ({ ...f, searchBy: v as SearchByKey }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEARCH_BY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>

            <FieldWrapper label={searchByLabel}>
              <Input
                value={filter.searchValue}
                onChange={(e) => setFilter((f) => ({ ...f, searchValue: e.target.value }))}
              />
            </FieldWrapper>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              onClick={handleView}
              className="min-w-24 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
            >
              View
            </Button>
            <Button variant="destructive" onClick={handleReset} className="min-w-24">
              Reset
            </Button>
          </div>
        </div>
      </Card>

      {appliedFilter ? (
        <Card className="min-w-0 overflow-hidden border p-0">
          <div className="flex flex-col gap-3 border-b bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <DataIoToolbar
                disabled={filtered.length === 0}
                export={{
                  filename: "manifest-view",
                  title: "Manifest View",
                  columns: [
                    { key: "manifestNo", header: "Manifest No" },
                    { key: "manifestDate", header: "Date" },
                    { key: "masterAwbNo", header: "MAWB No" },
                    { key: "flightNo", header: "Flight No" },
                    { key: "origin", header: "Origin" },
                    { key: "destination", header: "Destination" },
                    { key: "vendorCode", header: "Vendor" },
                    { key: "location", header: "Location" },
                    { key: "shipment", header: "Shipment" },
                    { key: "weight", header: "Weight" },
                    { key: "manifestTo", header: "Manifest To" },
                  ],
                  getRows: () =>
                    filtered.map((row) => ({
                      manifestNo: row.manifestNo,
                      manifestDate: formatDisplayDate(row.manifestDate),
                      masterAwbNo: row.masterAwbNo,
                      flightNo: row.flightNo,
                      origin: row.origin,
                      destination: row.destination,
                      vendorCode: row.vendorCode,
                      location: row.location,
                      shipment: row.shipment,
                      weight: formatWeight(row.weight),
                      manifestTo: row.manifestTo,
                    })),
                }}
              />
              <span className="shrink-0 text-sm text-muted-foreground">Search:</span>
              <Input
                value={tableSearch}
                onChange={(e) => {
                  setTableSearch(e.target.value);
                  setPage(1);
                  setSelectedManifestId(null);
                }}
                className="h-9 w-full min-w-[10rem] sm:w-48"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] caption-bottom text-sm">
              <TableHeader>
                <TableRow className="bg-sidebar hover:bg-sidebar">
                  <TableHead className="whitespace-nowrap text-sidebar-foreground">Manifest No</TableHead>
                  <TableHead className="whitespace-nowrap text-sidebar-foreground">Date</TableHead>
                  <TableHead className="whitespace-nowrap text-sidebar-foreground">MAWB No</TableHead>
                  <TableHead className="whitespace-nowrap text-sidebar-foreground">Flight No</TableHead>
                  <TableHead className="whitespace-nowrap text-sidebar-foreground">Origin</TableHead>
                  <TableHead className="whitespace-nowrap text-sidebar-foreground">Destination</TableHead>
                  <TableHead className="whitespace-nowrap text-sidebar-foreground">Vendor</TableHead>
                  <TableHead className="whitespace-nowrap text-sidebar-foreground">Location</TableHead>
                  <TableHead className="whitespace-nowrap text-sidebar-foreground">Shipment</TableHead>
                  <TableHead className="whitespace-nowrap text-sidebar-foreground">Weight</TableHead>
                  <TableHead className="whitespace-nowrap text-sidebar-foreground">Manifest To</TableHead>
                  <TableHead className="whitespace-nowrap text-center text-sidebar-foreground">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={12}
                      className="h-32 text-center text-sm text-muted-foreground"
                    >
                      No data available in table
                    </TableCell>
                  </TableRow>
                ) : (
                  pageRows.map((row) => (
                    <TableRow
                      key={row.id}
                      className={cn(selectedManifestId === row.id && "bg-muted/40")}
                    >
                      <TableCell className="max-w-[10rem] truncate">
                        <button
                          type="button"
                          onClick={() => openManifestDetail(row)}
                          className="block w-full truncate text-left font-medium text-sky-600 hover:text-sky-700 hover:underline dark:text-sky-400"
                        >
                          {row.manifestNo}
                        </button>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDisplayDate(row.manifestDate)}
                      </TableCell>
                      <TableCell className="max-w-[8rem] truncate">{row.masterAwbNo}</TableCell>
                      <TableCell>{row.flightNo}</TableCell>
                      <TableCell>{row.origin}</TableCell>
                      <TableCell>{row.destination}</TableCell>
                      <TableCell>{row.vendorCode}</TableCell>
                      <TableCell>{row.location}</TableCell>
                      <TableCell>{row.shipment}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatWeight(row.weight)}</TableCell>
                      <TableCell className="max-w-[8rem] truncate">{row.manifestTo}</TableCell>
                      <TableCell className="whitespace-nowrap px-1 text-center">
                        <div className="flex justify-center gap-0">
                          <IconButton
                            label="View"
                            variant="ghost"
                            size="row"
                            className="text-emerald-600"
                            onClick={() => openManifestDetail(row)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </IconButton>
                          <IconButton
                            label="Print"
                            variant="ghost"
                            size="row"
                            onClick={() =>
                              toast.info(`Print manifest ${row.manifestNo} will be enabled with backend wiring`)
                            }
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </IconButton>
                          <IconButton
                            label="Add Progress"
                            variant="ghost"
                            size="row"
                            className="text-amber-500"
                            onClick={() => openAddProgress(row)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </IconButton>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
            <div className="flex flex-wrap items-center gap-4">
              <span>
                Showing {startIdx} to {endIdx} of {filtered.length} entries
              </span>
              {selectedManifest ? (
                <span className="font-medium text-destructive">
                  No Of Record - {detailLines.length}
                </span>
              ) : null}
            </div>
            <span className="font-medium text-foreground">
              Total weight: {formatWeight(totalWeight)}
            </span>
          </div>

          {selectedManifest ? (
            <div className="overflow-x-auto border-t">
              <table className="w-full min-w-[1400px] caption-bottom text-sm">
                <TableHeader>
                  <TableRow className="bg-sidebar hover:bg-sidebar">
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">AWB No.</TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">Date</TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">Origin</TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">Destination</TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">Customer</TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">Consignee</TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">PCS</TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">Weight</TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">Value</TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">Status</TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">Status Date</TableHead>
                    <TableHead className="whitespace-nowrap text-sidebar-foreground">Cont...</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailLines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell className="whitespace-nowrap">{line.awbNo}</TableCell>
                      <TableCell className="whitespace-nowrap">{line.date}</TableCell>
                      <TableCell>{line.origin}</TableCell>
                      <TableCell>{line.destination}</TableCell>
                      <TableCell className="max-w-[10rem] truncate" title={line.customer}>
                        {line.customer}
                      </TableCell>
                      <TableCell className="max-w-[10rem] truncate" title={line.consignee}>
                        {line.consignee}
                      </TableCell>
                      <TableCell>{line.pcs}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatWeight(line.weight)}</TableCell>
                      <TableCell className="whitespace-nowrap">{line.value.toFixed(2)}</TableCell>
                      <TableCell className="max-w-[12rem] truncate" title={line.status}>
                        {line.status}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{line.statusDate}</TableCell>
                      <TableCell className="max-w-[8rem] truncate" title={line.content}>
                        {line.content}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </table>
            </div>
          ) : null}

          {totalPages > 1 ? (
            <TablePager
              totalPages={totalPages}
              currentPage={currentPage}
              setPage={setPage}
              startIdx={startIdx}
              endIdx={endIdx}
              total={filtered.length}
            />
          ) : null}
        </Card>
      ) : null}

      <Dialog open={progressOpen} onOpenChange={(o) => !o && closeAddProgress()}>
        <DialogContent className="max-w-lg gap-0 overflow-hidden p-0 sm:max-w-lg">
          <div className="bg-sidebar px-4 py-3">
            <DialogTitle className="text-base font-semibold text-sidebar-foreground">
              Add Progress
            </DialogTitle>
          </div>
          <div className="border-b px-4 py-3">
            <div className="flex h-9 overflow-hidden rounded-md border">
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  "h-9 flex-1 rounded-none text-sm",
                  progressMode === "add"
                    ? "bg-emerald-600 text-white hover:bg-emerald-600/90 hover:text-white"
                    : "text-muted-foreground",
                )}
                onClick={() => setProgressMode("add")}
              >
                Add Progress
              </Button>
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  "h-9 flex-1 rounded-none border-l text-sm",
                  progressMode === "delete"
                    ? "bg-emerald-600 text-white hover:bg-emerald-600/90 hover:text-white"
                    : "text-muted-foreground",
                )}
                onClick={() => setProgressMode("delete")}
              >
                Delete Progress
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
            <FieldWrapper label="Bag No">
              <Input
                value={progressForm.bagNo}
                onChange={(e) => patchProgress({ bagNo: e.target.value })}
              />
            </FieldWrapper>
            <FieldWrapper label="Progress Date">
              <Input
                type="date"
                value={progressForm.progressDate}
                onChange={(e) => patchProgress({ progressDate: e.target.value })}
              />
            </FieldWrapper>
            <FieldWrapper label="Progress Time">
              <Input
                value={progressForm.progressTime}
                onChange={(e) =>
                  patchProgress({ progressTime: e.target.value.replace(/\D/g, "").slice(0, 4) })
                }
                placeholder="HHmm"
              />
            </FieldWrapper>
            <FieldWrapper label="Service Centre" required>
              <DualLookupInput
                lookup="serviceCentre"
                value={progressForm.serviceCentre}
                onChange={(serviceCentre) => patchProgress({ serviceCentre })}
              />
            </FieldWrapper>
            <FieldWrapper label="Exception" className="md:col-span-2">
              <DualLookupInput
                lookup="exception"
                value={progressForm.exception}
                onChange={(exception) => patchProgress({ exception })}
              />
            </FieldWrapper>
          </div>
          <div className="flex justify-end gap-2 px-6 pb-6">
            <Button
              onClick={handleProgressSave}
              className="bg-emerald-600 text-white hover:bg-emerald-600/90"
            >
              Save
            </Button>
            <Button variant="destructive" onClick={closeAddProgress}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DualLookupInput({
  value,
  onChange,
  lookup,
}: {
  value: LookupPair;
  onChange: (v: LookupPair) => void;
  lookup: LookupKey;
}) {
  const [lookupOpen, setLookupOpen] = useState(false);

  return (
    <>
      <div className="flex gap-1">
        <Input
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          className="min-w-0 flex-1"
          placeholder="Name"
        />
        <Input
          value={value.code}
          onChange={(e) => onChange({ ...value, code: e.target.value })}
          className="w-20"
          placeholder="Code"
        />
        <Button
          size="icon"
          variant="outline"
          className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
          aria-label={`Search ${lookup}`}
          onClick={() => setLookupOpen(true)}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>
      <MasterLookupDialog
        open={lookupOpen}
        onOpenChange={setLookupOpen}
        lookup={lookup}
        returnField="code"
        onSelect={(_v, option: LookupOption) =>
          onChange({ code: option.code, name: option.name })
        }
      />
    </>
  );
}
