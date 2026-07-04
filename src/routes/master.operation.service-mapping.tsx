import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  Download,
  Upload,
  RefreshCw,
  Plus,
  Search,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
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
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  FieldWrapper,
  IconButton,
  MasterBreadcrumb,
  PAGE_SIZE,
  StatusPill,
  TablePager,
  downloadCsv,
} from "@/components/master-table-kit";
import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import type { LookupKey, LookupOption } from "@/lib/master-lookups";

type Status = "Active" | "In-Active";
type LookupPair = { code: string; name: string };

type ServiceMappingRow = {
  id: string;
  vendorCode: string;
  vendorName: string;
  service: string;
  serviceType: string;
  billingVendorCode: string;
  billingVendorName: string;
  minWeight: string;
  maxWeight: string;
  status: Status;
  vendorLink: string;
  isSinglePiece: boolean;
};

type ServiceForm = {
  vendor: LookupPair;
  service: string;
  billingVendor: LookupPair;
  minWeight: string;
  maxWeight: string;
  status: Status;
  vendorLink: string;
  isSinglePiece: boolean;
};

const VENDOR_LINK_OPTIONS = [
  "AFTERSHIP",
  "AIRWINGS",
  "ANJANI COURIER",
  "ARAMEX",
  "ARAMEX NZ",
  "ASYAD EXPRESS",
  "ATLANTIC",
  "BLUEDART",
  "BOMBINO",
  "CANADA POST",
  "CITY LINK",
  "CITYLINK THAILAND",
  "COURIERPLEASE AU",
  "COURIERWALA",
  "DELHIVERY",
  "DHL",
  "DPD GERMANY",
  "DPD UK",
  "DPEX",
  "DTDC",
  "ECO FREIGHT AE",
  "ELITE AIRBORNE",
  "FEDEX",
  "GST BILL",
  "MOVIN",
  "OCS KUWAIT",
  "PROFESSIONAL COURIER",
  "PUROLATOR",
  "SKYNET",
  "TNT",
  "UPS",
  "USPS",
] as const;

const SEED_ROWS: Omit<ServiceMappingRow, "id">[] = [
  { vendorCode: "COUR", vendorName: "COURIERWALA", service: "ECONOMY", serviceType: "COURIERWALA - ECONOMY", billingVendorCode: "COUR", billingVendorName: "COURIERWALA", minWeight: "0.00", maxWeight: "99999.00", status: "Active", vendorLink: "COURIERWALA", isSinglePiece: false },
  { vendorCode: "FEDE", vendorName: "FEDEX", service: "FEDEX PROMO", serviceType: "FEDEX - FEDEX PROMO", billingVendorCode: "FEDE", billingVendorName: "FEDEX", minWeight: "0.00", maxWeight: "99999.00", status: "Active", vendorLink: "FEDEX", isSinglePiece: false },
  { vendorCode: "GST", vendorName: "GST BILL", service: "ECONOMY", serviceType: "GST BILL - ECONOMY", billingVendorCode: "GST", billingVendorName: "GST BILL", minWeight: "0.00", maxWeight: "99999.00", status: "Active", vendorLink: "GST BILL", isSinglePiece: false },
  { vendorCode: "SWWE", vendorName: "SKYNET", service: "EXPRESS", serviceType: "SKYNET - EXPRESS", billingVendorCode: "SWWE", billingVendorName: "SKYNET", minWeight: "0.00", maxWeight: "99999.00", status: "Active", vendorLink: "SKYNET", isSinglePiece: false },
  { vendorCode: "DPD", vendorName: "DPD", service: "DPD HYD", serviceType: "DPD - DPD HYD", billingVendorCode: "DPD", billingVendorName: "DPD", minWeight: "0.50", maxWeight: "60.00", status: "Active", vendorLink: "DPD UK", isSinglePiece: false },
  { vendorCode: "MANCO", vendorName: "MANCO", service: "MANCO", serviceType: "MANCO - MANCO", billingVendorCode: "MANCO", billingVendorName: "MANCO", minWeight: "0.00", maxWeight: "999.00", status: "Active", vendorLink: "", isSinglePiece: false },
  { vendorCode: "BLUE", vendorName: "BLUEDART", service: "ECONOMY", serviceType: "BLUE - ECONOMY", billingVendorCode: "COUR", billingVendorName: "COURIERWALA", minWeight: "0.00", maxWeight: "99999.00", status: "Active", vendorLink: "BLUEDART", isSinglePiece: false },
  { vendorCode: "ARX", vendorName: "ARAMEX", service: "EXPRESS", serviceType: "ARAMEX - EXPRESS", billingVendorCode: "ARX", billingVendorName: "ARAMEX", minWeight: "0.00", maxWeight: "99999.00", status: "Active", vendorLink: "ARAMEX", isSinglePiece: false },
  { vendorCode: "DHL", vendorName: "DHL", service: "EXPRESS", serviceType: "DHL - EXPRESS", billingVendorCode: "DHL", billingVendorName: "DHL", minWeight: "0.00", maxWeight: "99999.00", status: "Active", vendorLink: "DHL", isSinglePiece: false },
  { vendorCode: "UPS", vendorName: "UPS", service: "EXPRESS", serviceType: "UPS - EXPRESS", billingVendorCode: "UPS", billingVendorName: "UPS", minWeight: "0.00", maxWeight: "99999.00", status: "Active", vendorLink: "UPS", isSinglePiece: false },
  { vendorCode: "TNT", vendorName: "TNT", service: "ECONOMY", serviceType: "TNT - ECONOMY", billingVendorCode: "", billingVendorName: "", minWeight: "0.00", maxWeight: "99999.00", status: "Active", vendorLink: "TNT", isSinglePiece: false },
  { vendorCode: "WWEC", vendorName: "WWEC", service: "ECONOMY", serviceType: "WWEC - ECONOMY", billingVendorCode: "GST", billingVendorName: "GST BILL", minWeight: "0.00", maxWeight: "99999.00", status: "Active", vendorLink: "GST BILL", isSinglePiece: true },
];

const emptyPair = (): LookupPair => ({ code: "", name: "" });

const emptyForm = (): ServiceForm => ({
  vendor: emptyPair(),
  service: "",
  billingVendor: emptyPair(),
  minWeight: "",
  maxWeight: "",
  status: "Active",
  vendorLink: "",
  isSinglePiece: false,
});

const formatWeight = (value: string) => {
  const n = parseFloat(value);
  if (Number.isNaN(n)) return value;
  return n.toFixed(2);
};

const buildServiceType = (vendorName: string, service: string) => {
  const vendor = vendorName.trim();
  const svc = service.trim();
  if (!vendor) return svc;
  if (!svc) return vendor;
  return `${vendor} - ${svc}`;
};

const rowToForm = (row: ServiceMappingRow): ServiceForm => ({
  vendor: { code: row.vendorCode, name: row.vendorName },
  service: row.service,
  billingVendor: { code: row.billingVendorCode, name: row.billingVendorName },
  minWeight: row.minWeight,
  maxWeight: row.maxWeight,
  status: row.status,
  vendorLink: row.vendorLink,
  isSinglePiece: row.isSinglePiece,
});

export const Route = createFileRoute("/master/operation/service-mapping")({
  head: () => ({
    meta: [
      { title: "Service Mapping — Master — Courier ERP" },
      { name: "description", content: "Map vendor services to billing vendors with weight limits and status." },
    ],
  }),
  component: ServiceMappingPage,
});

function ServiceMappingPage() {
  const [rows, setRows] = useState<ServiceMappingRow[]>(() =>
    SEED_ROWS.map((r) => ({ id: crypto.randomUUID(), ...r })),
  );
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ServiceMappingRow | null>(null);
  const [form, setForm] = useState<ServiceForm>(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<ServiceMappingRow | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [
        r.vendorName,
        r.vendorCode,
        r.service,
        r.serviceType,
        r.billingVendorName,
        r.billingVendorCode,
        r.vendorLink,
        r.minWeight,
        r.maxWeight,
        r.status,
      ].some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const startIdx = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (row: ServiceMappingRow) => {
    setEditing(row);
    setForm(rowToForm(row));
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm());
  };

  const handleSave = () => {
    if (!form.vendor.code.trim() && !form.vendor.name.trim()) return toast.error("Vendor is required");
    if (!form.service.trim()) return toast.error("Service is required");
    const min = parseFloat(form.minWeight || "0");
    const max = parseFloat(form.maxWeight || "0");
    if (Number.isNaN(min) || min < 0) return toast.error("Min Weight must be a valid number");
    if (Number.isNaN(max) || max < 0) return toast.error("Max Weight must be a valid number");
    if (min > max) return toast.error("Min Weight cannot exceed Max Weight");

    const vendorName = form.vendor.name.trim() || form.vendor.code.trim();
    const payload: Omit<ServiceMappingRow, "id"> = {
      vendorCode: form.vendor.code.trim(),
      vendorName,
      service: form.service.trim(),
      serviceType: buildServiceType(vendorName, form.service.trim()),
      billingVendorCode: form.billingVendor.code.trim(),
      billingVendorName: form.billingVendor.name.trim(),
      minWeight: formatWeight(form.minWeight || "0"),
      maxWeight: formatWeight(form.maxWeight || "0"),
      status: form.status,
      vendorLink: form.vendorLink,
      isSinglePiece: form.isSinglePiece,
    };

    if (editing) {
      setRows((prev) => prev.map((r) => (r.id === editing.id ? { ...editing, ...payload } : r)));
      toast.success("Service mapping updated");
    } else {
      setRows((prev) => [{ id: crypto.randomUUID(), ...payload }, ...prev]);
      toast.success("Service mapping added");
    }
    closeForm();
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    toast.success(`Deleted ${deleteTarget.serviceType}`);
    setDeleteTarget(null);
  };

  const handleExport = () => {
    downloadCsv(
      "service-mapping.csv",
      ["Vendor Code", "Vendor", "Service", "Service Type", "Billing Vendor Code", "Billing Vendor", "Min Weight", "Max Weight", "Status", "Vendor Link", "Is Single Piece"],
      rows.map((r) => [
        r.vendorCode,
        r.vendorName,
        r.service,
        r.serviceType,
        r.billingVendorCode,
        r.billingVendorName,
        r.minWeight,
        r.maxWeight,
        r.status,
        r.vendorLink,
        r.isSinglePiece ? "Yes" : "No",
      ]),
    );
    toast.success("Exported service-mapping.csv");
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) return toast.error("File is empty");
      const parseRow = (line: string) => {
        const out: string[] = [];
        let cur = "", inQ = false;
        for (let i = 0; i < line.length; i++) {
          const c = line[i];
          if (inQ) {
            if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
            else if (c === '"') inQ = false;
            else cur += c;
          } else {
            if (c === '"') inQ = true;
            else if (c === ",") { out.push(cur); cur = ""; }
            else cur += c;
          }
        }
        out.push(cur);
        return out;
      };
      const imported: ServiceMappingRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const c = parseRow(lines[i]);
        if (!c[0]?.trim() && !c[1]?.trim() && !c[2]?.trim()) continue;
        const status = (c[8] || "").trim().toLowerCase() === "in-active" ? "In-Active" : "Active";
        const vendorName = (c[1] || c[0] || "").trim();
        const service = (c[2] || "").trim();
        imported.push({
          id: crypto.randomUUID(),
          vendorCode: (c[0] || "").trim(),
          vendorName,
          service,
          serviceType: (c[3] || buildServiceType(vendorName, service)).trim(),
          billingVendorCode: (c[4] || "").trim(),
          billingVendorName: (c[5] || "").trim(),
          minWeight: formatWeight((c[6] || "0").trim()),
          maxWeight: formatWeight((c[7] || "99999").trim()),
          status: status as Status,
          vendorLink: (c[9] || "").trim(),
          isSinglePiece: (c[10] || "").trim().toLowerCase() === "yes",
        });
      }
      if (imported.length === 0) return toast.error("No valid rows found");
      setRows((prev) => [...imported, ...prev]);
      toast.success(`Imported ${imported.length} row${imported.length === 1 ? "" : "s"}`);
    } catch {
      toast.error("Failed to import file");
    }
  };

  const handleRefresh = () => {
    setSearch("");
    setPage(1);
    closeForm();
    toast.success("Refreshed");
  };

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <MasterBreadcrumb trail={["Master", "Operation", "Service Mapping"]} />

      {showForm ? (
        <Card className="overflow-hidden border p-0">
          <div className="p-4 md:p-6">
            <Badge className="mb-4 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90">Service</Badge>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <FieldWrapper label="Vendor" required>
                <LookupPairInput
                  lookup="vendor"
                  value={form.vendor}
                  onChange={(v) => setForm((f) => ({ ...f, vendor: v }))}
                />
              </FieldWrapper>
              <FieldWrapper label="Service" required>
                <Input
                  value={form.service}
                  onChange={(e) => setForm((f) => ({ ...f, service: e.target.value }))}
                  placeholder="e.g. ECONOMY"
                />
              </FieldWrapper>
              <FieldWrapper label="Billing Vendor">
                <LookupPairInput
                  lookup="vendor"
                  value={form.billingVendor}
                  onChange={(v) => setForm((f) => ({ ...f, billingVendor: v }))}
                />
              </FieldWrapper>
              <FieldWrapper label="Min Weight">
                <Input
                  value={form.minWeight}
                  onChange={(e) => setForm((f) => ({ ...f, minWeight: e.target.value }))}
                  inputMode="decimal"
                />
              </FieldWrapper>

              <FieldWrapper label="Max Weight">
                <Input
                  value={form.maxWeight}
                  onChange={(e) => setForm((f) => ({ ...f, maxWeight: e.target.value }))}
                  inputMode="decimal"
                />
              </FieldWrapper>
              <FieldWrapper label="Status">
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as Status }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="In-Active">In-Active</SelectItem>
                  </SelectContent>
                </Select>
              </FieldWrapper>
              <FieldWrapper label="Vendor Link">
                <Select value={form.vendorLink || undefined} onValueChange={(v) => setForm((f) => ({ ...f, vendorLink: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select Vendor" /></SelectTrigger>
                  <SelectContent>
                    {VENDOR_LINK_OPTIONS.map((v) => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldWrapper>
              <div className="flex flex-col justify-end gap-1.5">
                <div className="flex h-9 items-center gap-2">
                  <Checkbox
                    id="is-single-piece"
                    checked={form.isSinglePiece}
                    onCheckedChange={(c) => setForm((f) => ({ ...f, isSinglePiece: c === true }))}
                  />
                  <label htmlFor="is-single-piece" className="text-sm text-muted-foreground">Is Single Piece</label>
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button onClick={handleSave} className="bg-emerald-600 text-white hover:bg-emerald-600/90">Save</Button>
              <Button variant="destructive" onClick={closeForm}>Cancel</Button>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Service Mapping</h1>
            <p className="text-sm text-muted-foreground">
              Map vendor service types to billing vendors with minimum and maximum weight limits.
            </p>
          </div>

          <Card className="overflow-hidden p-0">
            <input ref={importInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportFile} />
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
              <TooltipProvider delayDuration={200}>
                <div className="flex items-center gap-1.5">
                  <IconButton label="Refresh" onClick={handleRefresh}><RefreshCw className="h-4 w-4" /></IconButton>
                  <IconButton label="Export" onClick={handleExport}><Download className="h-4 w-4" /></IconButton>
                  <IconButton label="Import" onClick={() => importInputRef.current?.click()}><Upload className="h-4 w-4" /></IconButton>
                </div>
              </TooltipProvider>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Search:</span>
                <Input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="h-9 w-56"
                />
                <Button size="sm" onClick={openAdd} className="h-9 gap-1.5">
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-sidebar hover:bg-sidebar">
                    <TableHead className="text-sidebar-foreground">Vendor</TableHead>
                    <TableHead className="text-sidebar-foreground">Service Type</TableHead>
                    <TableHead className="text-sidebar-foreground">Billing Vendor</TableHead>
                    <TableHead className="text-sidebar-foreground text-right">Min Weight</TableHead>
                    <TableHead className="text-sidebar-foreground text-right">Max Weight</TableHead>
                    <TableHead className="text-sidebar-foreground">Status</TableHead>
                    <TableHead className="w-28 text-center text-sidebar-foreground">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center text-sm text-muted-foreground">
                        No data available in table
                      </TableCell>
                    </TableRow>
                  ) : (
                    pageRows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.vendorName || r.vendorCode}</TableCell>
                        <TableCell>{r.serviceType}</TableCell>
                        <TableCell>{r.billingVendorName || r.billingVendorCode || "—"}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatWeight(r.minWeight)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatWeight(r.maxWeight)}</TableCell>
                        <TableCell><StatusPill status={r.status} /></TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(r)} aria-label={`Edit ${r.serviceType}`}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(r)} aria-label={`Delete ${r.serviceType}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <TablePager totalPages={totalPages} currentPage={currentPage} setPage={setPage} startIdx={startIdx} endIdx={endIdx} total={filtered.length} />
          </Card>
        </>
      )}

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete service mapping?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the mapping for{" "}
              <span className="font-medium text-foreground">{deleteTarget?.serviceType}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LookupPairInput({
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
    <div className="flex gap-1">
      <Input value={value.code} onChange={(e) => onChange({ ...value, code: e.target.value })} className="w-28" placeholder="Code" />
      <Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} className="flex-1" placeholder="Name" />
      <Button
        size="icon"
        variant="outline"
        className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
        aria-label="Search"
        onClick={() => setLookupOpen(true)}
      >
        <Search className="h-4 w-4" />
      </Button>
      <MasterLookupDialog
        open={lookupOpen}
        onOpenChange={setLookupOpen}
        lookup={lookup}
        returnField="code"
        onSelect={(_v, option: LookupOption) => onChange({ code: option.code, name: option.name })}
      />
    </div>
  );
}
