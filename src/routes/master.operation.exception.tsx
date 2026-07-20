import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RefreshCw, Plus, Pencil, Trash2 } from "lucide-react";
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
} from "@/components/master-table-kit";
import { DataIoToolbar } from "@/components/data-io-toolbar";
import { cn } from "@/lib/utils";

import { useAuth } from "@/lib/auth";
import { useMasterResource } from "@/lib/masters/core/useMasterResource";
import { masterKeys } from "@/lib/masters/core/queryKeys";
import { mapCsvToImportRows, type ImportRow } from "@/lib/masters/core";
import type { CsvRecord } from "@/lib/masters/core/csv";
import {
  deliveryExceptionsResource,
  type DeliveryExceptionRow as DeliveryExceptionDbRow,
} from "@/lib/masters/resources/deliveryExceptions";
import {
  deliveryExceptionCreateSchema,
  deliveryExceptionUpdateSchema,
} from "@/lib/masters/schemas/deliveryExceptions";
import { useMasterList, toErrorMessage, formatImportToast } from "@/lib/masters/screen";

type ExceptionType = "Delivered" | "Un-Delivered";

type ExceptionRow = {
  id: string;
  code: string;
  name: string;
  type: ExceptionType;
  inscan: boolean;
  showOnMobile: boolean;
  row_version?: number;
};

type ExceptionForm = {
  code: string;
  name: string;
  delivered: boolean;
  inscan: boolean;
  showOnMobile: boolean;
};

const SEED_ROWS: Omit<ExceptionRow, "id">[] = [
  {
    code: "CD",
    name: "ARRIVED AT DESTINATION",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: true,
  },
  {
    code: "AF",
    name: "ARRIVED AT FACILITY",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: true,
  },
  { code: "AT", name: "ARRIVED HUB", type: "Un-Delivered", inscan: false, showOnMobile: true },
  {
    code: "AC",
    name: "AWAITING CUSTOM CLEARANCE",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: true,
  },
  { code: "CE", name: "CLEARANCE EVENT", type: "Un-Delivered", inscan: false, showOnMobile: false },
  {
    code: "CK",
    name: "CLEARANCE PROCESSING COMPLETED AT ORIGIN",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: false,
  },
  {
    code: "CP",
    name: "CLEARANCE PROCESSING",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: false,
  },
  {
    code: "CA",
    name: "CUSTOMS AUTHORIZED",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: true,
  },
  {
    code: "CB",
    name: "CUSTOMS BROKER NOTIFIED",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: false,
  },
  { code: "CL", name: "CUSTOMS HELD", type: "Un-Delivered", inscan: false, showOnMobile: true },
  { code: "OK", name: "Delivered", type: "Delivered", inscan: true, showOnMobile: true },
  {
    code: "DD",
    name: "DEPARTED FROM FACILITY",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: true,
  },
  {
    code: "DC",
    name: "DESTINATION CUSTOMER CLEARANCE IN PROGRESS",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: true,
  },
  {
    code: "ES",
    name: "ESTIMATED ARRIVAL ON 29-03-2026",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: false,
  },
  {
    code: "AR",
    name: "ESTIMATED CUSTOMER CLEARANCE SCHEDULED ON 3.12.2025",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: false,
  },
  {
    code: "QW",
    name: "EXCEPTION IN TRANSIT",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: false,
  },
  { code: "DE", name: "DELAY IN TRANSIT", type: "Un-Delivered", inscan: false, showOnMobile: true },
  { code: "GH", name: "HELD AT GATEWAY", type: "Un-Delivered", inscan: false, showOnMobile: false },
  { code: "FV", name: "FLIGHT ARRIVED", type: "Un-Delivered", inscan: false, showOnMobile: true },
  {
    code: "HJ",
    name: "HELD AT JUNCTION",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: false,
  },
  {
    code: "KJ",
    name: "ESTIMATED FLIGHT ARRIVAL ON 29-06-2026",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: false,
  },
  {
    code: "HU",
    name: "EXPECTED FLIGHT ARRIVAL",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: false,
  },
  {
    code: "NJ",
    name: "NOT RECEIVED AT HUB",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: false,
  },
  { code: "IT", name: "IN TRANSIT", type: "Un-Delivered", inscan: false, showOnMobile: true },
  { code: "IC", name: "IN CUSTOMS", type: "Un-Delivered", inscan: false, showOnMobile: true },
  { code: "IP", name: "IN PROCESS", type: "Un-Delivered", inscan: false, showOnMobile: false },
  { code: "IR", name: "IN ROUTE", type: "Un-Delivered", inscan: false, showOnMobile: true },
  {
    code: "IS",
    name: "IN SORTING FACILITY",
    type: "Un-Delivered",
    inscan: true,
    showOnMobile: false,
  },
  { code: "IV", name: "INVESTIGATION", type: "Un-Delivered", inscan: false, showOnMobile: false },
  { code: "IW", name: "IN WAREHOUSE", type: "Un-Delivered", inscan: true, showOnMobile: false },
  { code: "FD", name: "FLIGHT DELAYED", type: "Un-Delivered", inscan: false, showOnMobile: true },
  { code: "DF", name: "FLIGHT DEPARTED", type: "Un-Delivered", inscan: false, showOnMobile: true },
  {
    code: "FA",
    name: "FLIGHT ARRIVED AT DESTINATION",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: true,
  },
  { code: "FC", name: "FLIGHT CANCELLED", type: "Un-Delivered", inscan: false, showOnMobile: true },
  {
    code: "FM",
    name: "FLIGHT MISSED CONNECTION",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: false,
  },
  { code: "FP", name: "FLIGHT PREPARED", type: "Un-Delivered", inscan: false, showOnMobile: false },
  { code: "FR", name: "FREIGHT RECEIVED", type: "Un-Delivered", inscan: true, showOnMobile: false },
  { code: "FS", name: "FREIGHT SORTED", type: "Un-Delivered", inscan: true, showOnMobile: false },
  {
    code: "FT",
    name: "FREIGHT TRANSFERRED",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: false,
  },
  { code: "FW", name: "FREIGHT WEIGHED", type: "Un-Delivered", inscan: true, showOnMobile: false },
  { code: "OD", name: "OUT FOR DELIVERY", type: "Un-Delivered", inscan: false, showOnMobile: true },
  {
    code: "PD",
    name: "PARCEL AT DELIVERY CENTER",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: true,
  },
  {
    code: "PW",
    name: "PARCEL ON ITS WAY",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: true,
  },
  {
    code: "PH",
    name: "PENDING FOR CLEARANCE",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: true,
  },
  {
    code: "ED",
    name: "Prepared Export Documents",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: false,
  },
  {
    code: "PF",
    name: "PROCESSED AT FACILITY",
    type: "Un-Delivered",
    inscan: true,
    showOnMobile: true,
  },
  {
    code: "RC",
    name: "RELEASED FROM CUSTOMS",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: true,
  },
  {
    code: "RE",
    name: "RETURN TO SHIPPER",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: true,
  },
  { code: "SB", name: "SHIPMENT BAGGED", type: "Un-Delivered", inscan: true, showOnMobile: false },
  {
    code: "PZ",
    name: "SHIPMENT DEPARTED ON THE WAY TO MEL",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: false,
  },
  {
    code: "SE",
    name: "SHIPMENT EXPECTED DEPARTURE ON 29-03-2024",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: false,
  },
  {
    code: "SO",
    name: "SHIPMENT FORWARDED TO PARTNER/CARRIER",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: true,
  },
  {
    code: "AA",
    name: "SHIPMENT ACCEPTED AT ORIGIN",
    type: "Un-Delivered",
    inscan: true,
    showOnMobile: true,
  },
  {
    code: "SF",
    name: "SHIPMENT FORWARDED",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: true,
  },
  {
    code: "SA",
    name: "SHIPMENT PICKED UP",
    type: "Un-Delivered",
    inscan: true,
    showOnMobile: true,
  },
  {
    code: "SC",
    name: "SHIPMENT CREATED",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: false,
  },
  { code: "SD", name: "SHIPMENT DELAYED", type: "Un-Delivered", inscan: false, showOnMobile: true },
  { code: "SH", name: "SHIPMENT HELD", type: "Un-Delivered", inscan: false, showOnMobile: true },
  {
    code: "SI",
    name: "SHIPMENT INSCANNED",
    type: "Un-Delivered",
    inscan: true,
    showOnMobile: false,
  },
  {
    code: "SP",
    name: "SHIPMENT PROCESSED",
    type: "Un-Delivered",
    inscan: true,
    showOnMobile: false,
  },
  {
    code: "SU",
    name: "SHIPMENT UNDER PROGRESS",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: true,
  },
  {
    code: "SM",
    name: "SHORTLANDED AT MELBOURNE AIRPORT",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: false,
  },
  {
    code: "UN",
    name: "UNABLE TO DELIVER",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: true,
  },
  {
    code: "CC",
    name: "UNDER CUSTOM CLEARANCE",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: true,
  },
  {
    code: "PE",
    name: "UNDER PHYSICAL EXAMINATION",
    type: "Un-Delivered",
    inscan: false,
    showOnMobile: false,
  },
];

const SEED: ExceptionRow[] = SEED_ROWS.map((r) => ({ id: crypto.randomUUID(), ...r }));

const emptyForm = (): ExceptionForm => ({
  code: "",
  name: "",
  delivered: false,
  inscan: false,
  showOnMobile: false,
});

const rowToForm = (row: ExceptionRow): ExceptionForm => ({
  code: row.code,
  name: row.name,
  delivered: row.type === "Delivered",
  inscan: row.inscan,
  showOnMobile: row.showOnMobile,
});

function rowToView(r: DeliveryExceptionDbRow): ExceptionRow {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    type: r.exc_type === "DELIVERED" ? "Delivered" : "Un-Delivered",
    inscan: r.inscan,
    showOnMobile: r.show_on_mobile,
    row_version: r.row_version,
  };
}

export const Route = createFileRoute("/master/operation/exception")({
  head: () => ({
    meta: [
      { title: "Exception — Master — Courier ERP" },
      {
        name: "description",
        content: "Manage shipment exception codes for tracking and mobile apps.",
      },
    ],
  }),
  component: ExceptionPage,
});

function ExceptionPage() {
  const { isAuthenticated: authed } = useAuth();
  const rc = useMasterResource(deliveryExceptionsResource);
  const live = useMasterList(deliveryExceptionsResource, { enabled: authed });
  const queryClient = useQueryClient();

  const [demoRows, setDemoRows] = useState<ExceptionRow[]>(SEED);
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState({ code: "", name: "" });
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ExceptionRow | null>(null);
  const [form, setForm] = useState<ExceptionForm>(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<ExceptionRow | null>(null);
  const [saving, setSaving] = useState(false);

  const rows: ExceptionRow[] = authed
    ? (live.rows as DeliveryExceptionDbRow[]).map(rowToView)
    : demoRows;

  const canAdd = !authed || rc.perms.canAdd;
  const canModify = !authed || rc.perms.canModify;
  const canDelete = !authed || rc.perms.canDelete;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && ![r.code, r.name, r.type].some((v) => v.toLowerCase().includes(q))) return false;
      if (colFilters.code && !r.code.toLowerCase().includes(colFilters.code.toLowerCase()))
        return false;
      if (colFilters.name && !r.name.toLowerCase().includes(colFilters.name.toLowerCase()))
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

  const openEdit = (row: ExceptionRow) => {
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
    if (!form.code.trim()) return toast.error("Exception Code is required");
    if (!form.name.trim()) return toast.error("Exception Name is required");

    const raw = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      exc_type: form.delivered ? "DELIVERED" : "UNDELIVERED",
      inscan: form.inscan,
      show_on_mobile: form.showOnMobile,
    };

    if (authed) {
      setSaving(true);
      try {
        if (editing) {
          const patch = deliveryExceptionUpdateSchema.parse(raw);
          await rc.update.mutateAsync({
            id: editing.id,
            rowVersion: editing.row_version ?? 0,
            patch,
          });
          toast.success("Exception updated");
        } else {
          const values = deliveryExceptionCreateSchema.parse(raw);
          await rc.create.mutateAsync(values);
          toast.success("Exception added");
        }
        closeForm();
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not save exception"));
      } finally {
        setSaving(false);
      }
      return;
    }

    try {
      if (editing) deliveryExceptionUpdateSchema.parse(raw);
      else deliveryExceptionCreateSchema.parse(raw);
    } catch (err) {
      toast.error(toErrorMessage(err, "Please fix the form"));
      return;
    }

    const payload: Omit<ExceptionRow, "id"> = {
      code: raw.code,
      name: raw.name,
      type: form.delivered ? "Delivered" : "Un-Delivered",
      inscan: form.inscan,
      showOnMobile: form.showOnMobile,
    };

    if (editing) {
      setDemoRows((prev) =>
        prev.map((r) => (r.id === editing.id ? { ...editing, ...payload } : r)),
      );
      toast.success("Exception updated");
    } else {
      if (demoRows.some((r) => r.code.toUpperCase() === payload.code))
        return toast.error("Exception Code already exists");
      setDemoRows((prev) => [{ id: crypto.randomUUID(), ...payload }, ...prev]);
      toast.success("Exception added");
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
        toast.error(toErrorMessage(err, "Could not delete exception"));
      }
    } else {
      setDemoRows((prev) => prev.filter((r) => r.id !== row.id));
      toast.success(`Deleted ${row.code}`);
    }
    setDeleteTarget(null);
  };

  const handleImportRows = async (parsedRows: CsvRecord[]) => {
    try {
    if (authed) {
      const importRows = mapCsvToImportRows(
        parsedRows,
        deliveryExceptionsResource.importColumns,
      ) as ImportRow[];
      const res = await rc.commitImport.mutateAsync(importRows);
      const toastRes = formatImportToast(res);
      if (toastRes.ok) toast.success(toastRes.message);
      else toast.error(toastRes.message);
      void queryClient.invalidateQueries({ queryKey: masterKeys.all(deliveryExceptionsResource.key) });
      return;
    }
    const imported: ExceptionRow[] = [];
    for (const rec of mapCsvToImportRows(parsedRows, deliveryExceptionsResource.importColumns)) {
      if (!rec.code?.trim()) continue;
      const typeRaw = (rec.exc_type || "").trim().toLowerCase().replace(/-/g, "");
      imported.push({
        id: crypto.randomUUID(),
        code: rec.code.trim().toUpperCase(),
        name: (rec.name || "").trim(),
        type: typeRaw === "delivered" ? "Delivered" : "Un-Delivered",
        inscan: /^(yes|true|1)$/i.test((rec.inscan || "").trim()),
        showOnMobile: /^(yes|true|1)$/i.test((rec.show_on_mobile || "").trim()),
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
    setColFilters({ code: "", name: "" });
    setPage(1);
    closeForm();
    if (authed)
      queryClient.invalidateQueries({ queryKey: masterKeys.all(deliveryExceptionsResource.key) });
    toast.success("Refreshed");
  };

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <MasterBreadcrumb trail={["Master", "Operation", "Exception"]} />

      {showForm ? (
        <Card className="overflow-hidden border p-0">
          <div className="p-4 md:p-6">
            <Badge className="mb-4 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90">
              Exception
            </Badge>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <FieldWrapper label="Exception Code" required>
                <Input
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                />
              </FieldWrapper>
              <FieldWrapper label="Exception Name" required>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </FieldWrapper>
              <TypeToggle
                delivered={form.delivered}
                onChange={(delivered) => setForm((f) => ({ ...f, delivered }))}
              />
              <div className="flex flex-col justify-end gap-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="inscan"
                    checked={form.inscan}
                    onCheckedChange={(c) => setForm((f) => ({ ...f, inscan: c === true }))}
                  />
                  <label htmlFor="inscan" className="text-sm text-muted-foreground">
                    Inscan
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="show-on-mobile"
                    checked={form.showOnMobile}
                    onCheckedChange={(c) => setForm((f) => ({ ...f, showOnMobile: c === true }))}
                  />
                  <label htmlFor="show-on-mobile" className="text-sm text-muted-foreground">
                    Show on Mobile Apps
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
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Exception</h1>
            <p className="text-sm text-muted-foreground">
              Manage shipment exception codes used in tracking scans and mobile apps.
            </p>
          </div>

          <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
              <TooltipProvider delayDuration={200}>
                <div className="flex items-center gap-1.5">
                  <DataIoToolbar
                    export={{
                      filename: "exceptions",
                      title: "Exceptions",
                      columns: [
                        { key: "code", header: "Exception Code" },
                        { key: "name", header: "Exception Name" },
                        { key: "type", header: "Type" },
                        { key: "inscan", header: "Inscan" },
                        { key: "showOnMobile", header: "Show on Mobile Apps" },
                      ],
                      getRows: () =>
                        rows.map((r) => ({
                          code: r.code,
                          name: r.name,
                          type: r.type,
                          inscan: r.inscan ? "Yes" : "No",
                          showOnMobile: r.showOnMobile ? "Yes" : "No",
                        })),
                    }}
                    import={canAdd ? { onRows: handleImportRows } : null}
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
                    <TableHead className="text-sidebar-foreground">Exception Code</TableHead>
                    <TableHead className="text-sidebar-foreground">Exception Name</TableHead>
                    <TableHead className="w-28 text-center text-sidebar-foreground">
                      Action
                    </TableHead>
                  </TableRow>
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableHead className="py-2">
                      <Input
                        value={colFilters.code}
                        onChange={(e) => {
                          setColFilters((f) => ({ ...f, code: e.target.value }));
                          setPage(1);
                        }}
                        placeholder="Exception Code"
                        className="h-8"
                      />
                    </TableHead>
                    <TableHead className="py-2">
                      <Input
                        value={colFilters.name}
                        onChange={(e) => {
                          setColFilters((f) => ({ ...f, name: e.target.value }));
                          setPage(1);
                        }}
                        placeholder="Exception Name"
                        className="h-8"
                      />
                    </TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
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
            <AlertDialogTitle>Delete exception?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove exception{" "}
              <span className="font-medium text-foreground">{deleteTarget?.code}</span>
              {deleteTarget?.name ? ` (${deleteTarget.name})` : ""}.
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

function TypeToggle({
  delivered,
  onChange,
}: {
  delivered: boolean;
  onChange: (delivered: boolean) => void;
}) {
  return (
    <FieldWrapper label="Type">
      <div className="flex h-9 overflow-hidden rounded-md border">
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "h-9 flex-1 rounded-none px-2 text-xs sm:text-sm",
            delivered
              ? "bg-emerald-600 text-white hover:bg-emerald-600/90 hover:text-white"
              : "text-muted-foreground hover:bg-muted/60",
          )}
          onClick={() => onChange(true)}
        >
          Delivered
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "h-9 flex-1 rounded-none border-l px-2 text-xs sm:text-sm",
            !delivered
              ? "bg-emerald-600 text-white hover:bg-emerald-600/90 hover:text-white"
              : "text-muted-foreground hover:bg-muted/60",
          )}
          onClick={() => onChange(false)}
        >
          Un-Delivered
        </Button>
      </div>
    </FieldWrapper>
  );
}
