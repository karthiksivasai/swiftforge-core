import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Download, Upload, RefreshCw, Plus, Search, Pencil, Trash2 } from "lucide-react";
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
  TablePager,
  downloadCsv,
} from "@/components/master-table-kit";
import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import { MASTER_LOOKUPS, type LookupKey, type LookupOption } from "@/lib/master-lookups";

import { useAuth } from "@/lib/auth";
import { useMasterResource } from "@/lib/masters/core/useMasterResource";
import { masterKeys } from "@/lib/masters/core/queryKeys";
import { parseCsv, mapCsvToImportRows, type ImportRow } from "@/lib/masters/core";
import {
  fieldExecutivesResource,
  type FieldExecutiveRow as FieldExecutiveDbRow,
} from "@/lib/masters/resources/fieldExecutives";
import {
  fieldExecutiveCreateSchema,
  fieldExecutiveUpdateSchema,
} from "@/lib/masters/schemas/fieldExecutives";
import { useMasterList, toErrorMessage, importSummary } from "@/lib/masters/screen";
import { LookupCombobox } from "@/components/masters/lookup-combobox";

type LookupPair = { code: string; name: string };

type FieldExecutiveRow = {
  id: string;
  code: string;
  name: string;
  mobile: string;
  pickupCharge: string;
  deliveryCharge: string;
  serviceCenterId: string;
  serviceCenter: string;
  serviceCenterName: string;
  destinationId: string;
  destinationCode: string;
  destinationName: string;
  tldBatchNo: string;
  inActive: boolean;
  row_version?: number;
};

type FieldExecutiveForm = {
  code: string;
  name: string;
  mobile: string;
  pickupCharge: string;
  deliveryCharge: string;
  serviceCenterId: string;
  serviceCenter: string;
  serviceCenterName: string;
  destinationId: string;
  destination: LookupPair;
  tldBatchNo: string;
  inActive: boolean;
};

const SERVICE_CENTRES = MASTER_LOOKUPS.serviceCentre.options;

const SEED_ROWS: Omit<FieldExecutiveRow, "id">[] = [
  {
    code: "AKHIL",
    name: "AKHIL CW",
    mobile: "",
    pickupCharge: "0",
    deliveryCharge: "0",
    serviceCenterId: "",
    serviceCenter: "HYD",
    serviceCenterName: "HYD",
    destinationId: "",
    destinationCode: "HYD",
    destinationName: "HYDERABAD",
    tldBatchNo: "",
    inActive: false,
  },
  {
    code: "AKSHITH",
    name: "AKSHITH",
    mobile: "7997639711",
    pickupCharge: "0",
    deliveryCharge: "0",
    serviceCenterId: "",
    serviceCenter: "HYD",
    serviceCenterName: "HYD",
    destinationId: "",
    destinationCode: "HYD",
    destinationName: "HYDERABAD",
    tldBatchNo: "",
    inActive: false,
  },
  {
    code: "ANIL",
    name: "ANIL CW",
    mobile: "9876543210",
    pickupCharge: "0",
    deliveryCharge: "0",
    serviceCenterId: "",
    serviceCenter: "HYD",
    serviceCenterName: "HYD",
    destinationId: "",
    destinationCode: "HYD",
    destinationName: "HYDERABAD",
    tldBatchNo: "",
    inActive: false,
  },
  {
    code: "KRISHNA",
    name: "KRISHNA",
    mobile: "9123456789",
    pickupCharge: "0",
    deliveryCharge: "0",
    serviceCenterId: "",
    serviceCenter: "BAN",
    serviceCenterName: "Bangalore",
    destinationId: "",
    destinationCode: "BLR",
    destinationName: "Bangalore",
    tldBatchNo: "",
    inActive: false,
  },
  {
    code: "PAVAN",
    name: "PAVAN CW",
    mobile: "",
    pickupCharge: "0",
    deliveryCharge: "0",
    serviceCenterId: "",
    serviceCenter: "MUM",
    serviceCenterName: "MUMBAI COURIERWALA",
    destinationId: "",
    destinationCode: "BOM",
    destinationName: "Mumbai",
    tldBatchNo: "",
    inActive: false,
  },
  {
    code: "RAJU",
    name: "RAJU",
    mobile: "9988776655",
    pickupCharge: "0",
    deliveryCharge: "0",
    serviceCenterId: "",
    serviceCenter: "HYD",
    serviceCenterName: "HYD",
    destinationId: "",
    destinationCode: "HYD",
    destinationName: "HYDERABAD",
    tldBatchNo: "",
    inActive: false,
  },
  {
    code: "SURESH",
    name: "SURESH CW",
    mobile: "9012345678",
    pickupCharge: "0",
    deliveryCharge: "0",
    serviceCenterId: "",
    serviceCenter: "GUN",
    serviceCenterName: "GUNTUR",
    destinationId: "",
    destinationCode: "HYD",
    destinationName: "HYDERABAD",
    tldBatchNo: "",
    inActive: false,
  },
  {
    code: "VIJAY",
    name: "VIJAY",
    mobile: "8899001122",
    pickupCharge: "0",
    deliveryCharge: "0",
    serviceCenterId: "",
    serviceCenter: "HYD",
    serviceCenterName: "HYD",
    destinationId: "",
    destinationCode: "HYD",
    destinationName: "HYDERABAD",
    tldBatchNo: "",
    inActive: false,
  },
];

const emptyForm = (): FieldExecutiveForm => ({
  code: "",
  name: "",
  mobile: "",
  pickupCharge: "0",
  deliveryCharge: "0",
  serviceCenterId: "",
  serviceCenter: "HYD",
  serviceCenterName: "HYD",
  destinationId: "",
  destination: { code: "HYD", name: "HYDERABAD" },
  tldBatchNo: "",
  inActive: false,
});

const rowToForm = (row: FieldExecutiveRow): FieldExecutiveForm => ({
  code: row.code,
  name: row.name,
  mobile: row.mobile,
  pickupCharge: row.pickupCharge,
  deliveryCharge: row.deliveryCharge,
  serviceCenterId: row.serviceCenterId,
  serviceCenter: row.serviceCenter,
  serviceCenterName: row.serviceCenterName,
  destinationId: row.destinationId,
  destination: { code: row.destinationCode, name: row.destinationName },
  tldBatchNo: row.tldBatchNo,
  inActive: row.inActive,
});

function rowToView(r: FieldExecutiveDbRow & Record<string, unknown>): FieldExecutiveRow {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    mobile: r.mobile ?? "",
    pickupCharge: String(r.pickup_charge ?? 0),
    deliveryCharge: String(r.delivery_charge ?? 0),
    serviceCenterId: r.service_center_id,
    serviceCenter: (r.service_center_code as string) ?? "",
    serviceCenterName: (r.service_center_name as string) ?? "",
    destinationId: r.destination_id ?? "",
    destinationCode: (r.destination_code as string) ?? "",
    destinationName: (r.destination_name as string) ?? "",
    tldBatchNo: r.tld_batch_no ?? "",
    inActive: r.in_active,
    row_version: r.row_version,
  };
}

const inActiveLabel = (inActive: boolean) => (inActive ? "YES" : "NO");

export const Route = createFileRoute("/master/operation/field-executive")({
  head: () => ({
    meta: [
      { title: "Field Executive — Master — Courier ERP" },
      {
        name: "description",
        content: "Manage field executives with service centre, destination, and charge settings.",
      },
    ],
  }),
  component: FieldExecutivePage,
});

function FieldExecutivePage() {
  const { isAuthenticated: authed } = useAuth();
  const rc = useMasterResource(fieldExecutivesResource);
  const live = useMasterList(fieldExecutivesResource, {
    enabled: authed,
    labelRefs: [
      { idField: "service_center_id", table: "service_centers", as: "service_center" },
      { idField: "destination_id", table: "destinations", as: "destination" },
    ],
  });
  const queryClient = useQueryClient();

  const [demoRows, setDemoRows] = useState<FieldExecutiveRow[]>(() =>
    SEED_ROWS.map((r) => ({ id: crypto.randomUUID(), ...r })),
  );
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState({ code: "", name: "", mobile: "", inActive: "" });
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FieldExecutiveRow | null>(null);
  const [form, setForm] = useState<FieldExecutiveForm>(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<FieldExecutiveRow | null>(null);
  const [saving, setSaving] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const rows: FieldExecutiveRow[] = authed
    ? (live.rows as (FieldExecutiveDbRow & Record<string, unknown>)[]).map(rowToView)
    : demoRows;

  const canAdd = !authed || rc.perms.canAdd;
  const canModify = !authed || rc.perms.canModify;
  const canDelete = !authed || rc.perms.canDelete;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (
        q &&
        ![r.code, r.name, r.mobile, inActiveLabel(r.inActive)].some((v) =>
          String(v).toLowerCase().includes(q),
        )
      )
        return false;
      if (colFilters.code && !r.code.toLowerCase().includes(colFilters.code.toLowerCase()))
        return false;
      if (colFilters.name && !r.name.toLowerCase().includes(colFilters.name.toLowerCase()))
        return false;
      if (colFilters.mobile && !r.mobile.toLowerCase().includes(colFilters.mobile.toLowerCase()))
        return false;
      if (
        colFilters.inActive &&
        !inActiveLabel(r.inActive).toLowerCase().includes(colFilters.inActive.toLowerCase())
      )
        return false;
      return true;
    });
  }, [rows, search, colFilters]);

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

  const openEdit = (row: FieldExecutiveRow) => {
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
    if (authed) {
      const raw = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        mobile: form.mobile.trim(),
        pickup_charge: Number(form.pickupCharge) || 0,
        delivery_charge: Number(form.deliveryCharge) || 0,
        service_center_id: form.serviceCenterId || "",
        destination_id: form.destinationId || "",
        tld_batch_no: form.tldBatchNo.trim(),
        in_active: form.inActive,
      };
      setSaving(true);
      try {
        if (editing) {
          const patch = fieldExecutiveUpdateSchema.parse(raw);
          await rc.update.mutateAsync({
            id: editing.id,
            rowVersion: editing.row_version ?? 0,
            patch,
          });
          toast.success("Field executive updated");
        } else {
          const values = fieldExecutiveCreateSchema.parse(raw);
          await rc.create.mutateAsync(values);
          toast.success("Field executive added");
        }
        closeForm();
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not save field executive"));
      } finally {
        setSaving(false);
      }
      return;
    }

    // Demo mode: preserve the original lightweight validation + UX.
    if (!form.code.trim()) return toast.error("Code is required");
    if (!form.name.trim()) return toast.error("Name is required");
    if (!form.serviceCenter.trim()) return toast.error("Service Center is required");
    if (!form.destination.code.trim() && !form.destination.name.trim())
      return toast.error("Destination is required");

    const payload: Omit<FieldExecutiveRow, "id"> = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      mobile: form.mobile.trim(),
      pickupCharge: form.pickupCharge.trim() || "0",
      deliveryCharge: form.deliveryCharge.trim() || "0",
      serviceCenterId: "",
      serviceCenter: form.serviceCenter,
      serviceCenterName: form.serviceCenterName,
      destinationId: "",
      destinationCode: form.destination.code.trim(),
      destinationName: form.destination.name.trim(),
      tldBatchNo: form.tldBatchNo.trim(),
      inActive: form.inActive,
    };

    if (editing) {
      setDemoRows((prev) =>
        prev.map((r) => (r.id === editing.id ? { ...editing, ...payload } : r)),
      );
      toast.success("Field executive updated");
    } else {
      if (demoRows.some((r) => r.code.toUpperCase() === payload.code))
        return toast.error("Code already exists");
      setDemoRows((prev) => [{ id: crypto.randomUUID(), ...payload }, ...prev]);
      toast.success("Field executive added");
    }
    closeForm();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const row = deleteTarget;
    if (authed) {
      try {
        await rc.remove.mutateAsync({ id: row.id, rowVersion: row.row_version ?? 0 });
        toast.success(`Deleted ${row.code}`);
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not delete field executive"));
      }
    } else {
      setDemoRows((prev) => prev.filter((r) => r.id !== row.id));
      toast.success(`Deleted ${row.code}`);
    }
    setDeleteTarget(null);
  };

  const handleExport = () => {
    downloadCsv(
      "field-executives.csv",
      [
        "Code",
        "Name",
        "Mobile",
        "Pickup Charge",
        "Delivery Charge",
        "Service Center",
        "Destination Code",
        "Destination Name",
        "TLD Batch No",
        "In-Active",
      ],
      rows.map((r) => [
        r.code,
        r.name,
        r.mobile,
        r.pickupCharge,
        r.deliveryCharge,
        r.serviceCenter,
        r.destinationCode,
        r.destinationName,
        r.tldBatchNo,
        inActiveLabel(r.inActive),
      ]),
    );
    toast.success("Exported field-executives.csv");
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.rows.length === 0) return toast.error("File is empty");

      if (authed) {
        const importRows = mapCsvToImportRows(
          parsed.rows,
          fieldExecutivesResource.importColumns,
        ) as ImportRow[];
        const res = await rc.commitImport.mutateAsync(importRows);
        toast.success(importSummary(res));
        return;
      }

      const imported: FieldExecutiveRow[] = [];
      for (const rec of mapCsvToImportRows(parsed.rows, [
        "code",
        "name",
        "mobile",
        "pickup_charge",
        "delivery_charge",
        "service_center_code",
        "destination_code",
        "destination_name",
        "tld_batch_no",
        "in_active",
      ])) {
        if (!rec.code?.trim()) continue;
        imported.push({
          id: crypto.randomUUID(),
          code: rec.code.trim().toUpperCase(),
          name: (rec.name || "").trim(),
          mobile: (rec.mobile || "").trim(),
          pickupCharge: (rec.pickup_charge || "0").trim(),
          deliveryCharge: (rec.delivery_charge || "0").trim(),
          serviceCenterId: "",
          serviceCenter: (rec.service_center_code || "HYD").trim(),
          serviceCenterName: (rec.service_center_code || "HYD").trim(),
          destinationId: "",
          destinationCode: (rec.destination_code || "").trim(),
          destinationName: (rec.destination_name || "").trim(),
          tldBatchNo: (rec.tld_batch_no || "").trim(),
          inActive: /^(yes|true|1)$/i.test((rec.in_active || "").trim()),
        });
      }
      if (imported.length === 0) return toast.error("No valid rows found");
      setDemoRows((prev) => [...imported, ...prev]);
      toast.success(`Imported ${imported.length} row${imported.length === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(toErrorMessage(err, "Failed to import file"));
    }
  };

  const handleRefresh = () => {
    setSearch("");
    setColFilters({ code: "", name: "", mobile: "", inActive: "" });
    setPage(1);
    closeForm();
    if (authed)
      queryClient.invalidateQueries({ queryKey: masterKeys.all(fieldExecutivesResource.key) });
    toast.success("Refreshed");
  };

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <MasterBreadcrumb trail={["Master", "Operation", "Field Executive"]} />

      {showForm ? (
        <Card className="overflow-hidden border p-0">
          <div className="p-4 md:p-6">
            <Badge className="mb-4 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90">
              Field Executive
            </Badge>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <FieldWrapper label="Code" required>
                <Input
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                />
              </FieldWrapper>
              <FieldWrapper label="Name" required>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </FieldWrapper>
              <FieldWrapper label="Mobile No.">
                <Input
                  value={form.mobile}
                  onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))}
                  inputMode="tel"
                />
              </FieldWrapper>
              <FieldWrapper label="Pickup Charge">
                <Input
                  value={form.pickupCharge}
                  onChange={(e) => setForm((f) => ({ ...f, pickupCharge: e.target.value }))}
                  inputMode="decimal"
                />
              </FieldWrapper>

              <FieldWrapper label="Delivery Charge">
                <Input
                  value={form.deliveryCharge}
                  onChange={(e) => setForm((f) => ({ ...f, deliveryCharge: e.target.value }))}
                  inputMode="decimal"
                />
              </FieldWrapper>
              <FieldWrapper label="Service Center" required>
                {authed ? (
                  <LookupCombobox
                    lookupKey="service-center"
                    value={form.serviceCenterId}
                    valueLabel={form.serviceCenterName || form.serviceCenter}
                    onChange={(id, item) =>
                      setForm((f) => ({
                        ...f,
                        serviceCenterId: id,
                        serviceCenter: item?.code ?? "",
                        serviceCenterName: item?.name ?? "",
                      }))
                    }
                    placeholder="Select Service Center"
                  />
                ) : (
                  <Select
                    value={form.serviceCenter}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        serviceCenter: v,
                        serviceCenterName: SERVICE_CENTRES.find((sc) => sc.code === v)?.name ?? v,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Service Center" />
                    </SelectTrigger>
                    <SelectContent>
                      {SERVICE_CENTRES.map((sc) => (
                        <SelectItem key={sc.code} value={sc.code}>
                          {sc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FieldWrapper>
              <FieldWrapper label="Destination">
                {authed ? (
                  <LookupCombobox
                    lookupKey="destination"
                    value={form.destinationId}
                    valueLabel={form.destination.name || form.destination.code}
                    onChange={(id, item) =>
                      setForm((f) => ({
                        ...f,
                        destinationId: id,
                        destination: { code: item?.code ?? "", name: item?.name ?? "" },
                      }))
                    }
                    placeholder="Select Destination"
                  />
                ) : (
                  <LookupPairInput
                    lookup="destination"
                    value={form.destination}
                    onChange={(v) => setForm((f) => ({ ...f, destination: v }))}
                  />
                )}
              </FieldWrapper>
              <FieldWrapper label="TLD Batch No">
                <Input
                  value={form.tldBatchNo}
                  onChange={(e) => setForm((f) => ({ ...f, tldBatchNo: e.target.value }))}
                />
              </FieldWrapper>

              <div className="flex flex-col justify-end gap-1.5">
                <div className="flex h-9 items-center gap-2">
                  <Checkbox
                    id="in-active"
                    checked={form.inActive}
                    onCheckedChange={(c) => setForm((f) => ({ ...f, inActive: c === true }))}
                  />
                  <label htmlFor="in-active" className="text-sm text-muted-foreground">
                    In-Active
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
                {saving ? "Saving…" : "Save"}
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
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Field Executive
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage field executives assigned to service centres and destinations.
            </p>
          </div>

          <Card className="overflow-hidden p-0">
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleImportFile}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
              <TooltipProvider delayDuration={200}>
                <div className="flex items-center gap-1.5">
                  <IconButton label="Export" onClick={handleExport}>
                    <Download className="h-4 w-4" />
                  </IconButton>
                  {canAdd ? (
                    <IconButton label="Import" onClick={() => importInputRef.current?.click()}>
                      <Upload className="h-4 w-4" />
                    </IconButton>
                  ) : null}
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
                {canAdd ? (
                  <Button size="sm" onClick={openAdd} className="h-9 gap-1.5">
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-sidebar hover:bg-sidebar">
                    <TableHead className="text-sidebar-foreground">Field Executive Code</TableHead>
                    <TableHead className="text-sidebar-foreground">Field Executive Name</TableHead>
                    <TableHead className="text-sidebar-foreground">Mobile</TableHead>
                    <TableHead className="text-sidebar-foreground">In-Active</TableHead>
                    <TableHead className="w-28 text-center text-sidebar-foreground">
                      Action
                    </TableHead>
                  </TableRow>
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    {(["code", "name", "mobile", "inActive"] as const).map((k) => (
                      <TableHead key={k} className="py-2">
                        <Input
                          value={colFilters[k]}
                          onChange={(e) => {
                            setColFilters((f) => ({ ...f, [k]: e.target.value }));
                            setPage(1);
                          }}
                          placeholder={
                            k === "code"
                              ? "Field Executive Code"
                              : k === "name"
                                ? "Field Executive Name"
                                : k === "mobile"
                                  ? "Mobile"
                                  : "In-Active"
                          }
                          className="h-8"
                        />
                      </TableHead>
                    ))}
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="h-32 text-center text-sm text-muted-foreground"
                      >
                        No data available in table
                      </TableCell>
                    </TableRow>
                  ) : (
                    pageRows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.code}</TableCell>
                        <TableCell>{r.name}</TableCell>
                        <TableCell>{r.mobile || "—"}</TableCell>
                        <TableCell>{inActiveLabel(r.inActive)}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-1">
                            {canModify ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => openEdit(r)}
                                aria-label={`Edit ${r.code}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            ) : null}
                            {canDelete ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => setDeleteTarget(r)}
                                aria-label={`Delete ${r.code}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : null}
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
            <AlertDialogTitle>Delete field executive?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove{" "}
              <span className="font-medium text-foreground">{deleteTarget?.code}</span>
              {deleteTarget?.name ? ` (${deleteTarget.name})` : ""} from the field executive master.
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
        value={value.name}
        onChange={(e) => onChange({ ...value, name: e.target.value })}
        className="flex-1"
        placeholder="Name"
      />
      <Input
        value={value.code}
        onChange={(e) => onChange({ ...value, code: e.target.value })}
        className="w-28"
        placeholder="Code"
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
        onSelect={(_v, option: LookupOption) =>
          onChange({ code: option.code, name: option.name.toUpperCase() })
        }
      />
    </div>
  );
}
