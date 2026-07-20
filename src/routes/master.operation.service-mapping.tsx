import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  RefreshCw,
  Plus,
  Search,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

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
} from "@/components/master-table-kit";
import { DataIoToolbar } from "@/components/data-io-toolbar";
import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import type { LookupKey, LookupOption } from "@/lib/master-lookups";
import { LookupCombobox } from "@/components/masters/lookup-combobox";

import { useAuth } from "@/lib/auth";
import { useMasterResource } from "@/lib/masters/core/useMasterResource";
import { masterKeys } from "@/lib/masters/core/queryKeys";
import { mapCsvToImportRows, type ImportRow } from "@/lib/masters/core";
import type { CsvRecord } from "@/lib/masters/core/csv";
import {
  importServiceMappingsChunked,
  normalizeServiceMappingImportRow,
  SERVICE_MAPPING_IMPORT_HEADER_ALIASES,
  serviceMappingsResource,
  type ServiceMappingRow as ServiceMappingDbRow,
} from "@/lib/masters/resources/serviceMappings";
import {
  serviceMappingCreateSchema,
  serviceMappingUpdateSchema,
} from "@/lib/masters/schemas/serviceMappings";
import { useMasterList, toErrorMessage, formatImportToast } from "@/lib/masters/screen";

type Status = "Active" | "In-Active";
type LookupPair = { code: string; name: string };

type ServiceMappingRow = {
  id: string;
  vendorId: string;
  vendorCode: string;
  vendorName: string;
  service: string;
  serviceType: string;
  billingVendorId: string;
  billingVendorCode: string;
  billingVendorName: string;
  minWeight: string;
  maxWeight: string;
  status: Status;
  vendorLink: string;
  isSinglePiece: boolean;
  row_version?: number;
};

type ServiceForm = Omit<ServiceMappingRow, "id" | "serviceType" | "row_version">;

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

const SEED_ROWS: Omit<ServiceMappingRow, "id" | "vendorId" | "billingVendorId">[] = [
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

const emptyForm = (): ServiceForm => ({
  vendorId: "",
  vendorCode: "",
  vendorName: "",
  service: "",
  billingVendorId: "",
  billingVendorCode: "",
  billingVendorName: "",
  minWeight: "",
  maxWeight: "",
  status: "Active",
  vendorLink: "",
  isSinglePiece: false,
});

const formatWeight = (value: string | number) => {
  const n = typeof value === "number" ? value : parseFloat(value);
  if (Number.isNaN(n)) return String(value);
  return n.toFixed(2);
};

const buildServiceType = (vendorName: string, service: string) => {
  const vendor = vendorName.trim();
  const svc = service.trim();
  if (!vendor) return svc;
  if (!svc) return vendor;
  return `${vendor} - ${svc}`;
};

function rowToView(r: ServiceMappingDbRow & Record<string, unknown>): ServiceMappingRow {
  const vendorName = (r.vendor_name as string) ?? "";
  const vendorCode = (r.vendor_code as string) ?? "";
  const billingVendorName = (r.billing_vendor_name as string) ?? "";
  const billingVendorCode = (r.billing_vendor_code as string) ?? "";
  const service = r.service;
  return {
    id: r.id,
    vendorId: r.vendor_id,
    vendorCode,
    vendorName,
    service,
    serviceType:
      r.service_type ?? buildServiceType(vendorName || vendorCode, service),
    billingVendorId: r.billing_vendor_id ?? "",
    billingVendorCode,
    billingVendorName,
    minWeight: formatWeight(r.min_weight),
    maxWeight: formatWeight(r.max_weight),
    status: r.status === "INACTIVE" ? "In-Active" : "Active",
    vendorLink: r.vendor_link ?? "",
    isSinglePiece: r.is_single_piece,
    row_version: r.row_version,
  };
}

function toRaw(form: ServiceForm) {
  const vendorName = form.vendorName.trim() || form.vendorCode.trim();
  return {
    vendor_id: form.vendorId,
    service: form.service.trim(),
    service_type: buildServiceType(vendorName, form.service.trim()) || null,
    billing_vendor_id: form.billingVendorId || null,
    min_weight: parseFloat(form.minWeight || "0"),
    max_weight: parseFloat(form.maxWeight || "99999"),
    vendor_link: form.vendorLink || null,
    is_single_piece: form.isSinglePiece,
    status: form.status === "In-Active" ? "INACTIVE" : "ACTIVE",
  };
}

const rowToForm = (row: ServiceMappingRow): ServiceForm => ({
  vendorId: row.vendorId,
  vendorCode: row.vendorCode,
  vendorName: row.vendorName,
  service: row.service,
  billingVendorId: row.billingVendorId,
  billingVendorCode: row.billingVendorCode,
  billingVendorName: row.billingVendorName,
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
      {
        name: "description",
        content: "Map vendor services to billing vendors with weight limits and status.",
      },
    ],
  }),
  component: ServiceMappingPage,
});

function ServiceMappingPage() {
  const { isAuthenticated: authed } = useAuth();
  const rc = useMasterResource(serviceMappingsResource);
  const live = useMasterList(serviceMappingsResource, {
    enabled: authed,
    labelRefs: [
      { idField: "vendor_id", table: "vendors", as: "vendor" },
      { idField: "billing_vendor_id", table: "vendors", as: "billing_vendor" },
    ],
  });
  const queryClient = useQueryClient();

  const [demoRows, setDemoRows] = useState<ServiceMappingRow[]>(() =>
    SEED_ROWS.map((r) => ({ id: crypto.randomUUID(), vendorId: "", billingVendorId: "", ...r })),
  );
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ServiceMappingRow | null>(null);
  const [form, setForm] = useState<ServiceForm>(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<ServiceMappingRow | null>(null);
  const [saving, setSaving] = useState(false);

  const rows: ServiceMappingRow[] = authed
    ? (live.rows as ServiceMappingDbRow[]).map(rowToView)
    : demoRows;

  const canAdd = !authed || rc.perms.canAdd;
  const canModify = !authed || rc.perms.canModify;
  const canDelete = !authed || rc.perms.canDelete;

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

  const handleSave = async () => {
    if (!form.vendorId && !form.vendorCode.trim() && !form.vendorName.trim()) {
      return toast.error("Vendor is required");
    }
    if (!form.service.trim()) return toast.error("Service is required");
    const min = parseFloat(form.minWeight || "0");
    const max = parseFloat(form.maxWeight || "0");
    if (Number.isNaN(min) || min < 0) return toast.error("Min Weight must be a valid number");
    if (Number.isNaN(max) || max < 0) return toast.error("Max Weight must be a valid number");
    if (min > max) return toast.error("Min Weight cannot exceed Max Weight");

    if (authed) {
      setSaving(true);
      try {
        const raw = toRaw(form);
        if (editing) {
          await rc.update.mutateAsync({
            id: editing.id,
            rowVersion: editing.row_version ?? 0,
            patch: serviceMappingUpdateSchema.parse(raw),
          });
          toast.success("Service mapping updated");
        } else {
          await rc.create.mutateAsync(serviceMappingCreateSchema.parse(raw));
          toast.success("Service mapping added");
        }
        closeForm();
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not save service mapping"));
      } finally {
        setSaving(false);
      }
      return;
    }

    const vendorName = form.vendorName.trim() || form.vendorCode.trim();
    const payload: Omit<ServiceMappingRow, "id"> = {
      vendorId: "",
      vendorCode: form.vendorCode.trim(),
      vendorName,
      service: form.service.trim(),
      serviceType: buildServiceType(vendorName, form.service.trim()),
      billingVendorId: "",
      billingVendorCode: form.billingVendorCode.trim(),
      billingVendorName: form.billingVendorName.trim(),
      minWeight: formatWeight(form.minWeight || "0"),
      maxWeight: formatWeight(form.maxWeight || "0"),
      status: form.status,
      vendorLink: form.vendorLink,
      isSinglePiece: form.isSinglePiece,
    };

    if (editing) {
      setDemoRows((prev) => prev.map((r) => (r.id === editing.id ? { ...editing, ...payload } : r)));
      toast.success("Service mapping updated");
    } else {
      setDemoRows((prev) => [{ id: crypto.randomUUID(), ...payload }, ...prev]);
      toast.success("Service mapping added");
    }
    closeForm();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const row = deleteTarget;
    if (authed) {
      try {
        await rc.remove.mutateAsync({ id: row.id, rowVersion: row.row_version ?? 0 });
        toast.success(`Deleted ${row.serviceType}`);
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not delete service mapping"));
      }
    } else {
      setDemoRows((prev) => prev.filter((r) => r.id !== row.id));
      toast.success(`Deleted ${row.serviceType}`);
    }
    setDeleteTarget(null);
  };

  const handleImportRows = async (parsedRows: CsvRecord[]) => {
    try {
      const mapped = mapCsvToImportRows(
        parsedRows,
        serviceMappingsResource.importColumns,
        { aliases: SERVICE_MAPPING_IMPORT_HEADER_ALIASES },
      ).map((rec) => normalizeServiceMappingImportRow(rec));

      if (authed) {
        const importRows = mapped as ImportRow[];
        const res = await importServiceMappingsChunked("COMMIT", importRows);
        const toastRes = formatImportToast(res);
        if (toastRes.ok) toast.success(toastRes.message);
        else toast.error(toastRes.message);
        void queryClient.invalidateQueries({ queryKey: masterKeys.all(serviceMappingsResource.key) });
        return;
      }
      const imported: ServiceMappingRow[] = [];
      for (const rec of mapped) {
        if (!String(rec.vendor_code ?? "").trim() && !String(rec.service ?? "").trim()) continue;
        const status =
          String(rec.status || "").trim().toUpperCase() === "INACTIVE" ? "In-Active" : "Active";
        const vendorName = String(rec.vendor_code || "").trim();
        const service = String(rec.service || "").trim();
        imported.push({
          id: crypto.randomUUID(),
          vendorId: "",
          vendorCode: vendorName,
          vendorName,
          service,
          serviceType: String(rec.service_type || buildServiceType(vendorName, service)).trim(),
          billingVendorId: "",
          billingVendorCode: String(rec.billing_vendor_code || "").trim(),
          billingVendorName: String(rec.billing_vendor_code || "").trim(),
          minWeight: formatWeight(String(rec.min_weight || "0")),
          maxWeight: formatWeight(String(rec.max_weight || "99999")),
          status: status as Status,
          vendorLink: String(rec.vendor_link || "").trim(),
          isSinglePiece: String(rec.is_single_piece || "").trim().toLowerCase() === "yes",
        });
      }
      if (imported.length === 0) {
        toast.error("No valid rows found");
        return;
      }
      setDemoRows((prev) => [...imported, ...prev]);
      toast.success(`Imported ${imported.length} row${imported.length === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(toErrorMessage(err, "Failed to import file"));
    }
  };

  const handleRefresh = () => {
    setSearch("");
    setPage(1);
    closeForm();
    if (authed) {
      void queryClient.invalidateQueries({ queryKey: masterKeys.all(serviceMappingsResource.key) });
    }
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
                {authed ? (
                  <LookupCombobox
                    lookupKey="vendor"
                    value={form.vendorId}
                    valueLabel={form.vendorName || form.vendorCode}
                    onChange={(id, item) =>
                      setForm((f) => ({
                        ...f,
                        vendorId: id,
                        vendorCode: item?.code ?? "",
                        vendorName: item?.name ?? "",
                      }))
                    }
                    placeholder="Search vendor..."
                  />
                ) : (
                  <LookupPairInput
                    lookup="vendor"
                    value={{ code: form.vendorCode, name: form.vendorName }}
                    onChange={(v) =>
                      setForm((f) => ({ ...f, vendorCode: v.code, vendorName: v.name }))
                    }
                  />
                )}
              </FieldWrapper>
              <FieldWrapper label="Service" required>
                <Input
                  value={form.service}
                  onChange={(e) => setForm((f) => ({ ...f, service: e.target.value }))}
                  placeholder="e.g. ECONOMY"
                />
              </FieldWrapper>
              <FieldWrapper label="Billing Vendor">
                {authed ? (
                  <LookupCombobox
                    lookupKey="vendor"
                    value={form.billingVendorId}
                    valueLabel={form.billingVendorName || form.billingVendorCode}
                    onChange={(id, item) =>
                      setForm((f) => ({
                        ...f,
                        billingVendorId: id,
                        billingVendorCode: item?.code ?? "",
                        billingVendorName: item?.name ?? "",
                      }))
                    }
                    placeholder="Search billing vendor..."
                  />
                ) : (
                  <LookupPairInput
                    lookup="vendor"
                    value={{ code: form.billingVendorCode, name: form.billingVendorName }}
                    onChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        billingVendorCode: v.code,
                        billingVendorName: v.name,
                      }))
                    }
                  />
                )}
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
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v as Status }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="In-Active">In-Active</SelectItem>
                  </SelectContent>
                </Select>
              </FieldWrapper>
              <FieldWrapper label="Vendor Link">
                <Select
                  value={form.vendorLink || undefined}
                  onValueChange={(v) => setForm((f) => ({ ...f, vendorLink: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    {VENDOR_LINK_OPTIONS.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldWrapper>
              <div className="flex flex-col justify-end gap-1.5">
                <div className="flex h-9 items-center gap-2">
                  <Checkbox
                    id="is-single-piece"
                    checked={form.isSinglePiece}
                    onCheckedChange={(c) =>
                      setForm((f) => ({ ...f, isSinglePiece: c === true }))
                    }
                  />
                  <label htmlFor="is-single-piece" className="text-sm text-muted-foreground">
                    Is Single Piece
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-emerald-600 text-white hover:bg-emerald-600/90"
              >
                Save
              </Button>
              <Button variant="destructive" onClick={closeForm}>
                Cancel
              </Button>
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
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
              <TooltipProvider delayDuration={200}>
                <div className="flex items-center gap-1.5">
                  <DataIoToolbar
                    export={{
                      filename: "service-mapping",
                      title: "Service Mapping",
                      columns: [
                        { key: "vendorCode", header: "Vendor Code" },
                        { key: "vendorName", header: "Vendor" },
                        { key: "service", header: "Service" },
                        { key: "serviceType", header: "Service Type" },
                        { key: "billingVendorCode", header: "Billing Vendor Code" },
                        { key: "billingVendorName", header: "Billing Vendor" },
                        { key: "minWeight", header: "Min Weight" },
                        { key: "maxWeight", header: "Max Weight" },
                        { key: "status", header: "Status" },
                        { key: "vendorLink", header: "Vendor Link" },
                        { key: "isSinglePiece", header: "Is Single Piece" },
                      ],
                      getRows: () =>
                        rows.map((r) => ({
                          vendorCode: r.vendorCode,
                          vendorName: r.vendorName,
                          service: r.service,
                          serviceType: r.serviceType,
                          billingVendorCode: r.billingVendorCode,
                          billingVendorName: r.billingVendorName,
                          minWeight: r.minWeight,
                          maxWeight: r.maxWeight,
                          status: r.status,
                          vendorLink: r.vendorLink,
                          isSinglePiece: r.isSinglePiece ? "Yes" : "No",
                        })),
                    }}
                    import={{ onRows: handleImportRows }}
                  />
                  <IconButton label="Refresh" onClick={handleRefresh}>
                    <RefreshCw className="h-4 w-4" />
                  </IconButton>
                </div>
              </TooltipProvider>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Search:</span>
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="h-9 w-56"
                />
                {canAdd && (
                  <Button size="sm" onClick={openAdd} className="h-9 gap-1.5">
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                )}
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
                        <TableCell className="text-right font-mono text-xs">
                          {formatWeight(r.minWeight)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {formatWeight(r.maxWeight)}
                        </TableCell>
                        <TableCell>
                          <StatusPill status={r.status} />
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-1">
                            {canModify && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => openEdit(r)}
                                aria-label={`Edit ${r.serviceType}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => setDeleteTarget(r)}
                                aria-label={`Delete ${r.serviceType}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <TablePager
              totalPages={totalPages}
              currentPage={currentPage}
              setPage={setPage}
              startIdx={startIdx}
              endIdx={endIdx}
              total={filtered.length}
            />
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
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
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
      <Input
        value={value.code}
        onChange={(e) => onChange({ ...value, code: e.target.value })}
        className="w-28"
        placeholder="Code"
      />
      <Input
        value={value.name}
        onChange={(e) => onChange({ ...value, name: e.target.value })}
        className="flex-1"
        placeholder="Name"
      />
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
