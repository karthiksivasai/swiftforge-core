import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Plus, Printer, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

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
import { useAuth } from "@/lib/auth";
import { recordManifestProgress } from "@/lib/transactions/resources/manifests";
import { toErrorMessage } from "@/lib/masters/screen";

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

function formatDisplayDate(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function formatWeight(value: number) {
  return (value || 0).toFixed(3);
}

async function fetchManifestsView(filter: ManifestViewFilter): Promise<ManifestViewRow[]> {
  let query = supabase
    .from("manifests")
    .select(`
      id,
      manifest_no,
      manifest_kind,
      manifest_date,
      to_type,
      to_service_center_id,
      vendor_id,
      origin_branch_id,
      location_code,
      connect_station,
      master_awb_no,
      cd_no,
      total_bags,
      vendor_weight,
      flight,
      flight1,
      created_at,
      origin_branch:origin_branch_id ( id, code, name ),
      to_service_center:to_service_center_id ( id, code, name ),
      vendor:vendor_id ( id, code, name ),
      manifest_lines ( id, awb_no )
    `)
    .is("deleted_at", null)
    .order("manifest_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (filter.fromDate) {
    query = query.gte("manifest_date", filter.fromDate);
  }
  if (filter.toDate) {
    query = query.lte("manifest_date", filter.toDate);
  }

  const { data, error } = await query;
  if (error) throw error;
  if (!data) return [];

  return data
    .map((m: any) => {
      const originCode = m.origin_branch?.code || m.location_code || "HYD";
      const destCode = m.to_service_center?.code || m.connect_station || "";
      const vendorCode = m.vendor?.code || "";
      const isOutgoing = m.manifest_kind === "OUTBOUND" || m.to_type === "THIRD_PARTY";
      const manifestType: ManifestType = isOutgoing ? "outgoing" : "incoming";
      const flightNo = m.flight || m.flight1 || "";
      const lineCount = m.manifest_lines?.length || m.total_bags || 0;
      const manifestTo = m.to_type === "THIRD_PARTY" ? "Third Party" : "Service Centre";

      return {
        id: m.id,
        manifestType,
        manifestNo: m.manifest_no,
        masterAwbNo: m.master_awb_no || "",
        cdNo: m.cd_no || "",
        awbNo: m.manifest_lines?.[0]?.awb_no || "",
        manifestLinesAwbs: (m.manifest_lines || []).map((l: any) => l.awb_no),
        manifestDate: m.manifest_date,
        flightNo,
        origin: originCode,
        destination: destCode,
        vendorCode,
        location: m.location_code || originCode,
        shipment: String(lineCount),
        weight: Number(m.vendor_weight || 0),
        manifestTo,
      };
    })
    .filter((row: any) => {
      if (filter.manifestType && row.manifestType !== filter.manifestType) return false;

      if (filter.origin.code.trim() || filter.origin.name.trim()) {
        const originCode = filter.origin.code.trim().toLowerCase();
        const originName = filter.origin.name.trim().toLowerCase();
        const hay = `${row.origin} ${row.location}`.toLowerCase();
        if (originCode && !hay.includes(originCode)) return false;
        if (originName && !hay.includes(originName)) return false;
      }

      if (filter.destination.code.trim() || filter.destination.name.trim()) {
        const destCode = filter.destination.code.trim().toLowerCase();
        const destName = filter.destination.name.trim().toLowerCase();
        const hay = `${row.destination}`.toLowerCase();
        if (destCode && !hay.includes(destCode)) return false;
        if (destName && !hay.includes(destName)) return false;
      }

      if (filter.vendor.code.trim() || filter.vendor.name.trim()) {
        const vCode = filter.vendor.code.trim().toLowerCase();
        const vName = filter.vendor.name.trim().toLowerCase();
        const hay = `${row.vendorCode}`.toLowerCase();
        if (vCode && !hay.includes(vCode)) return false;
        if (vName && !hay.includes(vName)) return false;
      }

      if (filter.searchValue.trim()) {
        const needle = filter.searchValue.trim().toLowerCase();
        if (filter.searchBy === "cdNo") {
          return row.cdNo.toLowerCase().includes(needle);
        } else if (filter.searchBy === "masterAwbNo") {
          return row.masterAwbNo.toLowerCase().includes(needle);
        } else if (filter.searchBy === "awbNo") {
          return (row.manifestLinesAwbs || []).some((a: string) => a.toLowerCase().includes(needle));
        }
      }

      return true;
    });
}

async function fetchManifestShipments(manifestId: string): Promise<ManifestAwbLine[]> {
  const { data, error } = await supabase
    .from("manifest_lines")
    .select(`
      id,
      seq,
      awb_no,
      created_at,
      origin_name,
      destination_name,
      customer_name,
      consignee_name,
      pieces,
      charge_weight,
      shipment_id,
      shipments:shipment_id (
        id,
        declared_value,
        current_status,
        status_at,
        goods_description
      )
    `)
    .eq("manifest_id", manifestId)
    .is("deleted_at", null)
    .order("seq", { ascending: true });

  if (error) throw error;
  if (!data) return [];

  return data.map((l: any) => {
    const s = Array.isArray(l.shipments) ? l.shipments[0] : l.shipments;
    const dateStr = l.created_at ? formatDisplayDate(l.created_at.slice(0, 10)) : "";
    const statusDateStr = s?.status_at
      ? `${formatDisplayDate(s.status_at.slice(0, 10))} ${s.status_at.slice(11, 16)}`
      : dateStr;

    return {
      id: l.id,
      awbNo: l.awb_no,
      date: dateStr,
      origin: l.origin_name || "—",
      destination: l.destination_name || "—",
      customer: l.customer_name || "—",
      consignee: l.consignee_name || "—",
      pcs: Number(l.pieces || 1),
      weight: Number(l.charge_weight || 0),
      value: Number(s?.declared_value || 0),
      status: s?.current_status || "MANIFESTED",
      statusDate: statusDateStr,
      content: s?.goods_description || "GENERAL",
    };
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
  const { isAuthenticated: authed } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<ManifestViewFilter>(defaultFilter);
  const [appliedFilter, setAppliedFilter] = useState<ManifestViewFilter | null>(null);
  const [tableSearch, setTableSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedManifestId, setSelectedManifestId] = useState<string | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressManifest, setProgressManifest] = useState<ManifestViewRow | null>(null);
  const [progressMode, setProgressMode] = useState<ProgressMode>("add");
  const [progressForm, setProgressForm] = useState<ProgressForm>(emptyProgressForm);
  const [savingProgress, setSavingProgress] = useState(false);

  const manifestsQuery = useQuery({
    queryKey: ["manifests-view", appliedFilter],
    queryFn: () => (appliedFilter ? fetchManifestsView(appliedFilter) : Promise.resolve([])),
    enabled: authed && Boolean(appliedFilter),
  });

  const shipmentsQuery = useQuery({
    queryKey: ["manifest-shipments", selectedManifestId],
    queryFn: () => (selectedManifestId ? fetchManifestShipments(selectedManifestId) : Promise.resolve([])),
    enabled: authed && Boolean(selectedManifestId),
  });

  const searchByLabel =
    SEARCH_BY_OPTIONS.find((opt) => opt.value === filter.searchBy)?.label ?? "CD No.";

  const allRows = manifestsQuery.data ?? [];

  const filtered = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter((row) =>
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
  }, [allRows, tableSearch]);

  const selectedManifest = useMemo(
    () => allRows.find((row) => row.id === selectedManifestId) ?? null,
    [allRows, selectedManifestId],
  );

  const detailLines = shipmentsQuery.data ?? [];

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

  const handleProgressSave = async () => {
    if (!progressManifest) return;
    if (!progressForm.serviceCentre.code.trim() && !progressForm.serviceCentre.name.trim()) {
      return toast.error("Service Centre is required");
    }

    setSavingProgress(true);
    try {
      if (authed) {
        await recordManifestProgress({
          manifestId: progressManifest.id,
          bagNo: progressForm.bagNo || undefined,
          progressDate: progressForm.progressDate,
          progressTime: progressForm.progressTime,
          serviceCenterCode: progressForm.serviceCentre.code || undefined,
          exceptionCode: progressForm.exception.code || undefined,
          mode: progressMode,
        });
        toast.success(`Progress ${progressMode === "add" ? "recorded" : "deleted"} for manifest ${progressManifest.manifestNo}`);
        await queryClient.invalidateQueries({ queryKey: ["manifests-view"] });
      } else {
        toast.success(`Progress ${progressMode === "add" ? "recorded" : "deleted"} (demo mode)`);
      }
      closeAddProgress();
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setSavingProgress(false);
    }
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
                lookup="serviceCentre"
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
                {manifestsQuery.isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={12}
                      className="h-32 text-center text-sm text-muted-foreground"
                    >
                      Loading manifests...
                    </TableCell>
                  </TableRow>
                ) : pageRows.length === 0 ? (
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
                      <TableCell className="max-w-[8rem] truncate">{row.masterAwbNo || "—"}</TableCell>
                      <TableCell>{row.flightNo || "—"}</TableCell>
                      <TableCell>{row.origin || "—"}</TableCell>
                      <TableCell>{row.destination || "—"}</TableCell>
                      <TableCell>{row.vendorCode || "—"}</TableCell>
                      <TableCell>{row.location || "—"}</TableCell>
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
                              toast.info(`Print manifest ${row.manifestNo}`)
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
                  {shipmentsQuery.isLoading ? (
                    <TableRow>
                      <TableCell
                        colSpan={12}
                        className="h-24 text-center text-sm text-muted-foreground"
                      >
                        Loading shipments for manifest {selectedManifest.manifestNo}...
                      </TableCell>
                    </TableRow>
                  ) : detailLines.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={12}
                        className="h-24 text-center text-sm text-muted-foreground"
                      >
                        No shipments found for manifest {selectedManifest.manifestNo}
                      </TableCell>
                    </TableRow>
                  ) : (
                    detailLines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell className="whitespace-nowrap font-mono font-medium">{line.awbNo}</TableCell>
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
                    ))
                  )}
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
              disabled={savingProgress}
              className="bg-emerald-600 text-white hover:bg-emerald-600/90"
            >
              {savingProgress ? "Saving..." : "Save"}
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
