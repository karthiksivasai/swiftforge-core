import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RefreshCw, Plus, Pencil, Trash2, FileSpreadsheet, FileUp, FileText, FileType, Printer } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
import { exportTable, parseTabularFile, type ExportFormat } from "@/lib/io/tableIo";

import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useMasterResource } from "@/lib/masters/core/useMasterResource";
import { masterKeys } from "@/lib/masters/core/queryKeys";
import { mapCsvToImportRows, type ImportRow } from "@/lib/masters/core";
import type { CsvRecord } from "@/lib/masters/core/csv";
import {
  AREA_EXPORT_COLUMNS,
  AREA_EXPORT_FORMATS,
  AREA_IMPORT_HEADER_ALIASES,
  areasResource,
  type AreaRow as AreaDbRow,
} from "@/lib/masters/resources/areas";
import { areaCreateSchema, areaUpdateSchema } from "@/lib/masters/schemas/areas";
import { toErrorMessage, formatImportToast } from "@/lib/masters/screen";
import { LookupCombobox } from "@/components/masters/lookup-combobox";

type AreaRow = {
  id: string;
  areaName: string;
  serviceCenter: string;
  serviceCenterId?: string;
  destination: string;
  row_version?: number;
};

type AreaForm = {
  areaName: string;
  serviceCenter: string;
  serviceCenterId: string;
  destination: string;
};

const DEMO_ROWS: AreaRow[] = [
  { id: "demo-hyd", areaName: "HYD", serviceCenter: "HYD", destination: "HYDERABAD" },
];

const EXPORT_ICONS: Record<ExportFormat, { label: string; icon: typeof FileSpreadsheet }> = {
  excel: { label: "Excel", icon: FileSpreadsheet },
  pdf: { label: "PDF", icon: FileType },
  csv: { label: "CSV", icon: FileText },
  print: { label: "Print", icon: Printer },
};

const emptyForm = (): AreaForm => ({
  areaName: "",
  serviceCenter: "",
  serviceCenterId: "",
  destination: "",
});

function serviceCenterLabel(code: string, name: string): string {
  return [code, name].filter(Boolean).join(" — ");
}

function rowToView(r: AreaDbRow & Record<string, unknown>): AreaRow {
  const code = (r.service_center_code as string) ?? "";
  const name = (r.service_center_name as string) ?? "";
  return {
    id: r.id,
    areaName: r.name,
    serviceCenter: serviceCenterLabel(code, name),
    serviceCenterId: (r.service_center_id as string | null) ?? "",
    destination: (r.destination_name as string) ?? "",
    row_version: r.row_version,
  };
}

export const Route = createFileRoute("/master/operation/area")({
  head: () => ({
    meta: [
      { title: "Area — Master — Courier ERP" },
      { name: "description", content: "Manage areas used when building a DRS." },
    ],
  }),
  component: AreaPage,
});

function AreaPage() {
  const { isAuthenticated: authed } = useAuth();
  const rc = useMasterResource(areasResource);
  const canList = authed && rc.perms.canList;
  const canSearch = authed && rc.perms.canSearch;
  const live = useQuery({
    queryKey: masterKeys.list(areasResource.key, { live: true }),
    enabled: canList,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_areas");
      if (error) throw new Error(error.message);
      return (data ?? []) as (AreaDbRow & Record<string, unknown>)[];
    },
  });
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState({
    areaName: "",
    serviceCenter: "",
    destination: "",
  });
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AreaRow | null>(null);
  const [form, setForm] = useState<AreaForm>(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<AreaRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);

  const rows: AreaRow[] = authed ? (canList ? (live.data ?? []).map(rowToView) : []) : DEMO_ROWS;

  const canAdd = authed && rc.perms.canAdd;
  const canModify = authed && rc.perms.canModify;
  const canDelete = authed && rc.perms.canDelete;

  const filtered = useMemo(() => {
    const q = canSearch || !authed ? search.trim().toLowerCase() : "";
    const columnFilters = canSearch || !authed;
    return rows.filter((r) => {
      if (
        q &&
        ![r.areaName, r.serviceCenter, r.destination].some((v) => v.toLowerCase().includes(q))
      )
        return false;
      if (
        columnFilters &&
        colFilters.areaName &&
        !r.areaName.toLowerCase().includes(colFilters.areaName.toLowerCase())
      )
        return false;
      if (
        columnFilters &&
        colFilters.serviceCenter &&
        !r.serviceCenter.toLowerCase().includes(colFilters.serviceCenter.toLowerCase())
      )
        return false;
      if (
        columnFilters &&
        colFilters.destination &&
        !r.destination.toLowerCase().includes(colFilters.destination.toLowerCase())
      )
        return false;
      return true;
    });
  }, [rows, search, colFilters, canSearch, authed]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const startIdx = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, filtered.length);
  const loading = canList && live.isFetching && !live.data;

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setShowForm(true);
    setImportOpen(false);
  };

  const openEdit = (row: AreaRow) => {
    setEditing(row);
    setForm({
      areaName: row.areaName,
      serviceCenter: row.serviceCenter,
      serviceCenterId: row.serviceCenterId ?? "",
      destination: row.destination,
    });
    setShowForm(true);
    setImportOpen(false);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm());
  };

  const handleSave = async () => {
    if (!authed) {
      toast.error("Sign in to change areas. This preview is read-only.");
      return;
    }
    if (!form.areaName.trim()) return toast.error("Area Name is required");
    if (!form.serviceCenterId.trim()) return toast.error("Service Center is required");

    const raw = {
      name: form.areaName.trim(),
      service_center_id: form.serviceCenterId,
    };
    setSaving(true);
    try {
      if (editing) {
        const patch = areaUpdateSchema.parse(raw);
        await rc.update.mutateAsync({
          id: editing.id,
          rowVersion: editing.row_version ?? 0,
          patch,
        });
        toast.success("Area updated");
      } else {
        const values = areaCreateSchema.parse(raw);
        await rc.create.mutateAsync(values);
        toast.success("Area added");
      }
      closeForm();
    } catch (err) {
      toast.error(toErrorMessage(err, "Could not save area"));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const row = deleteTarget;
    if (authed) {
      try {
        await rc.remove.mutateAsync({ id: row.id, rowVersion: row.row_version ?? 0 });
        toast.success(`Deleted ${row.areaName}`);
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not delete area"));
      }
    } else {
      toast.error("Sign in to change areas. This preview is read-only.");
    }
    setDeleteTarget(null);
  };

  const handleImportRows = async (parsedRows: CsvRecord[]) => {
    if (!authed) {
      toast.error("Sign in to import areas. This preview is read-only.");
      return;
    }
    const importRows = mapCsvToImportRows(parsedRows, areasResource.importColumns, {
      aliases: AREA_IMPORT_HEADER_ALIASES,
    }) as ImportRow[];
    const res = await rc.commitImport.mutateAsync(importRows);
    const toastRes = formatImportToast(res);
    if (toastRes.ok) toast.success(toastRes.message);
    else toast.error(toastRes.message);
    void queryClient.invalidateQueries({ queryKey: masterKeys.all(areasResource.key) });
  };

  const doImport = async () => {
    if (!importFile) return toast.error("Choose an Excel file");
    try {
      const parsed = await parseTabularFile(importFile);
      if (parsed.rows.length === 0) {
        toast.error("File is empty");
        return;
      }
      await handleImportRows(parsed.rows);
      setImportOpen(false);
      setImportFile(null);
    } catch (err) {
      toast.error(toErrorMessage(err, "Failed to import file"));
    }
  };

  const handleExport = async (format: ExportFormat) => {
    try {
      await exportTable({
        format,
        filename: "areas",
        title: "Areas",
        columns: [...AREA_EXPORT_COLUMNS],
        rows: filtered.map((r) => ({
          areaName: r.areaName,
          serviceCenter: r.serviceCenter,
          destination: r.destination,
        })),
      });
      if (format === "print") toast.success("Print dialog opened");
    } catch (err) {
      toast.error(toErrorMessage(err, "Export failed"));
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      await exportTable({
        format: "excel",
        filename: "areas_template",
        title: "Import Areas from Excel",
        columns: [
          { key: "areaName", header: "Area Name" },
          { key: "serviceCenter", header: "Service Center" },
          { key: "destination", header: "Destination" },
        ],
        rows: [],
      });
    } catch (err) {
      toast.error(toErrorMessage(err, "Failed to download template"));
    }
  };

  const handleRefresh = () => {
    setSearch("");
    setColFilters({ areaName: "", serviceCenter: "", destination: "" });
    setPage(1);
    closeForm();
    setImportOpen(false);
    if (authed) queryClient.invalidateQueries({ queryKey: masterKeys.all(areasResource.key) });
    toast.success("Refreshed");
  };

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <MasterBreadcrumb trail={["Master", "Operation", "Area"]} />

      {showForm ? (
        <Card className="overflow-hidden border p-0">
          <div className="p-4 md:p-6">
            <Badge className="mb-4 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90">
              Area
            </Badge>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <FieldWrapper label="Area Name" required>
                <Input
                  value={form.areaName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, areaName: e.target.value.toUpperCase() }))
                  }
                />
              </FieldWrapper>
              <FieldWrapper label="Service Center" required>
                <LookupCombobox
                  lookupKey="area-service-center"
                  value={form.serviceCenterId}
                  valueLabel={form.serviceCenter}
                  onChange={(id, item) =>
                    setForm((f) => ({
                      ...f,
                      serviceCenterId: id,
                      serviceCenter: item ? serviceCenterLabel(item.code, item.name) : "",
                      destination: (item?.hint ?? "").trim(),
                    }))
                  }
                  placeholder="Select Service Center"
                />
              </FieldWrapper>
              <FieldWrapper label="Destination">
                <Input
                  value={form.destination}
                  readOnly
                  placeholder="Set from the service center"
                  className="bg-muted"
                />
              </FieldWrapper>
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
      ) : importOpen ? (
        <Card className="overflow-hidden border p-0">
          <div className="p-4 md:p-6">
            <Badge className="mb-4 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90">
              Import Areas from Excel
            </Badge>

            <div className="flex flex-col gap-4 py-4">
              <p className="text-sm text-muted-foreground">
                Data should be in same format as per Excel. Destination is filled from the service center.
              </p>
              <div>
                <Button variant="link" className="h-auto p-0" onClick={handleDownloadTemplate}>
                  Download Excel File Format
                </Button>
              </div>
              <div className="grid w-full max-w-sm items-center gap-1.5">
                <Input
                  id="area-excel-file"
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                />
              </div>
            </div>

            <div className="mt-4 flex justify-between">
              <Button className="bg-emerald-600 text-white hover:bg-emerald-600/90" onClick={doImport}>
                Import
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setImportOpen(false);
                  setImportFile(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Area</h1>
            <p className="text-sm text-muted-foreground">
              Areas saved here are available when building a DRS.
            </p>
          </div>

          {!authed ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Signed-out preview is read-only and shows sample areas. Sign in to view and change your company areas.
            </p>
          ) : null}
          {authed && !canList ? (
            <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
              You don&apos;t have permission to list areas.
            </p>
          ) : null}

          <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
              <TooltipProvider delayDuration={200}>
                <div className="flex items-center gap-1.5">
                  {AREA_EXPORT_FORMATS.map((format) => {
                    const button = EXPORT_ICONS[format];
                    const Icon = button.icon;
                    return (
                      <IconButton
                        key={format}
                        label={button.label}
                        onClick={() => void handleExport(format)}
                        className="h-8 w-8 text-emerald-600 hover:text-emerald-700"
                      >
                        <Icon className="h-4 w-4" />
                      </IconButton>
                    );
                  })}
                  {canAdd ? (
                    <IconButton
                      label="Import"
                      onClick={() => {
                        setImportOpen(true);
                        setShowForm(false);
                      }}
                      className="h-8 w-8 text-blue-600 hover:text-blue-700"
                    >
                      <FileUp className="h-4 w-4" />
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
                  disabled={authed && !canSearch}
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
                    <TableHead className="text-sidebar-foreground">Area Name</TableHead>
                    <TableHead className="text-sidebar-foreground">Service Center</TableHead>
                    <TableHead className="text-sidebar-foreground">Destination</TableHead>
                    <TableHead className="w-28 text-center text-sidebar-foreground">Action</TableHead>
                  </TableRow>
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    {(
                      [
                        ["areaName", "Area Name"],
                        ["serviceCenter", "Service Center"],
                        ["destination", "Destination"],
                      ] as const
                    ).map(([k, placeholder]) => (
                      <TableHead key={k} className="py-2">
                        <Input
                          value={colFilters[k]}
                          disabled={authed && !canSearch}
                          onChange={(e) => {
                            setColFilters((f) => ({ ...f, [k]: e.target.value }));
                            setPage(1);
                          }}
                          placeholder={placeholder}
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
                      <TableCell colSpan={4} className="h-32 text-center text-sm text-muted-foreground">
                        {loading ? "Loading…" : "No data available in table"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    pageRows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.areaName}</TableCell>
                        <TableCell>{r.serviceCenter}</TableCell>
                        <TableCell>{r.destination}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-1">
                            {canModify ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => openEdit(r)}
                                aria-label={`Edit ${r.areaName}`}
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
                                aria-label={`Delete ${r.areaName}`}
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
            <AlertDialogTitle>Delete area?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove area{" "}
              <span className="font-medium text-foreground">{deleteTarget?.areaName}</span>.
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
