import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RefreshCw, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
} from "@/components/master-table-kit";
import { DataIoToolbar } from "@/components/data-io-toolbar";
import { MASTER_LOOKUPS } from "@/lib/master-lookups";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/lib/auth";
import { useMasterResource } from "@/lib/masters/core/useMasterResource";
import { masterKeys } from "@/lib/masters/core/queryKeys";
import { mapCsvToImportRows, type ImportRow } from "@/lib/masters/core";
import type { CsvRecord } from "@/lib/masters/core/csv";
import { areasResource, type AreaRow as AreaDbRow } from "@/lib/masters/resources/areas";
import { areaCreateSchema, areaUpdateSchema } from "@/lib/masters/schemas/areas";
import {
  useMasterList,
  useBranchOptions,
  toErrorMessage,
  formatImportToast,
} from "@/lib/masters/screen";
import { LookupCombobox, EntityCombobox } from "@/components/masters/lookup-combobox";

type AreaRow = {
  id: string;
  areaName: string;
  serviceCenter: string;
  destination: string;
  branchId?: string;
  destinationId?: string;
  row_version?: number;
};

type AreaForm = {
  areaName: string;
  serviceCenter: string;
  destination: string;
  branchId?: string;
  destinationId?: string;
};

const SERVICE_CENTRES = MASTER_LOOKUPS.serviceCentre.options;

const SERVICE_CENTER_DESTINATIONS: Record<string, string> = {
  HYD: "HYDERABAD",
  BAN: "Bangalore",
  MUM: "Mumbai",
  GUN: "GUNTUR",
  CAN: "CANADA",
  SYD: "SYDNEY",
  MEL: "MELBOURNE",
  USA: "UNITED STATES OF AMERICA",
  UK: "UNITED KINGDOM",
};

const SEED_ROWS: Omit<AreaRow, "id">[] = [
  { areaName: "HYD", serviceCenter: "HYD", destination: "HYDERABAD" },
];

const emptyForm = (): AreaForm => ({
  areaName: "",
  serviceCenter: "HYD",
  destination: SERVICE_CENTER_DESTINATIONS.HYD,
});

export const Route = createFileRoute("/master/operation/area")({
  head: () => ({
    meta: [
      { title: "Area — Master — Courier ERP" },
      { name: "description", content: "Manage areas mapped to service centres and destinations." },
    ],
  }),
  component: AreaPage,
});

function rowToView(r: AreaDbRow & Record<string, unknown>): AreaRow {
  return {
    id: r.id,
    areaName: r.name,
    serviceCenter: (r.branch_name as string) ?? "",
    branchId: r.branch_id,
    destination: (r.destination_name as string) ?? "",
    destinationId: r.destination_id ?? "",
    row_version: r.row_version,
  };
}

function AreaPage() {
  const { isAuthenticated: authed } = useAuth();
  const rc = useMasterResource(areasResource);
  const live = useMasterList(areasResource, {
    enabled: authed,
    labelRefs: [
      { idField: "branch_id", table: "branches", as: "branch" },
      { idField: "destination_id", table: "destinations", as: "destination" },
    ],
  });
  const branches = useBranchOptions(authed);
  const queryClient = useQueryClient();

  const [demoRows, setDemoRows] = useState<AreaRow[]>(() =>
    SEED_ROWS.map((r) => ({ id: crypto.randomUUID(), ...r })),
  );
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

  const rows: AreaRow[] = authed
    ? (live.rows as (AreaDbRow & Record<string, unknown>)[]).map(rowToView)
    : demoRows;

  const canAdd = !authed || rc.perms.canAdd;
  const canModify = !authed || rc.perms.canModify;
  const canDelete = !authed || rc.perms.canDelete;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (
        q &&
        ![r.areaName, r.serviceCenter, r.destination].some((v) => v.toLowerCase().includes(q))
      )
        return false;
      if (
        colFilters.areaName &&
        !r.areaName.toLowerCase().includes(colFilters.areaName.toLowerCase())
      )
        return false;
      if (
        colFilters.serviceCenter &&
        !r.serviceCenter.toLowerCase().includes(colFilters.serviceCenter.toLowerCase())
      )
        return false;
      if (
        colFilters.destination &&
        !r.destination.toLowerCase().includes(colFilters.destination.toLowerCase())
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

  const openEdit = (row: AreaRow) => {
    setEditing(row);
    setForm({
      areaName: row.areaName,
      serviceCenter: row.serviceCenter,
      destination: row.destination,
      branchId: row.branchId,
      destinationId: row.destinationId,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm());
  };

  const handleServiceCenterChange = (serviceCenter: string) => {
    const destination = SERVICE_CENTER_DESTINATIONS[serviceCenter] ?? form.destination;
    setForm((f) => ({ ...f, serviceCenter, destination }));
  };

  const toRaw = (f: AreaForm) => ({
    branch_id: f.branchId || "",
    name: f.areaName,
    destination_id: f.destinationId || null,
  });

  const handleSave = async () => {
    if (authed) {
      setSaving(true);
      try {
        const raw = toRaw(form);
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
      return;
    }

    if (!form.areaName.trim()) return toast.error("Area Name is required");
    if (!form.serviceCenter.trim()) return toast.error("Service Center is required");

    const payload = {
      areaName: form.areaName.trim().toUpperCase(),
      serviceCenter: form.serviceCenter.trim(),
      destination: form.destination.trim(),
    };

    if (editing) {
      setDemoRows((prev) =>
        prev.map((r) => (r.id === editing.id ? { ...editing, ...payload } : r)),
      );
      toast.success("Area updated");
    } else {
      if (demoRows.some((r) => r.areaName.toUpperCase() === payload.areaName))
        return toast.error("Area Name already exists");
      setDemoRows((prev) => [{ id: crypto.randomUUID(), ...payload }, ...prev]);
      toast.success("Area added");
    }
    closeForm();
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
      setDemoRows((prev) => prev.filter((r) => r.id !== row.id));
      toast.success(`Deleted ${row.areaName}`);
    }
    setDeleteTarget(null);
  };

  const handleImportRows = async (parsedRows: CsvRecord[]) => {
    try {
      if (authed) {
        const importRows = mapCsvToImportRows(
          parsedRows,
          areasResource.importColumns,
        ) as ImportRow[];
        const res = await rc.commitImport.mutateAsync(importRows);
        const toastRes = formatImportToast(res);
        if (toastRes.ok) toast.success(toastRes.message);
        else toast.error(toastRes.message);
        void queryClient.invalidateQueries({ queryKey: masterKeys.all(areasResource.key) });
        return;
      }
      const imported: AreaRow[] = [];
      for (const rec of parsedRows) {
        const areaName = (rec["Area Name"] ?? rec["name"] ?? "").trim();
        if (!areaName) continue;
        imported.push({
          id: crypto.randomUUID(),
          areaName: areaName.toUpperCase(),
          serviceCenter: (rec["Service Center"] ?? rec["branch_code"] ?? "").trim(),
          destination: (rec["Destination"] ?? rec["destination_code"] ?? "").trim(),
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
    setColFilters({ areaName: "", serviceCenter: "", destination: "" });
    setPage(1);
    closeForm();
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
                {authed ? (
                  <EntityCombobox
                    items={branches.options}
                    value={form.branchId ?? ""}
                    valueLabel={form.serviceCenter}
                    loading={branches.isLoading}
                    onChange={(id, item) =>
                      setForm((f) => ({ ...f, branchId: id, serviceCenter: item?.name ?? "" }))
                    }
                    placeholder="Select Service Center"
                  />
                ) : (
                  <Select value={form.serviceCenter} onValueChange={handleServiceCenterChange}>
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
                    value={form.destinationId ?? ""}
                    valueLabel={form.destination}
                    onChange={(id, item) =>
                      setForm((f) => ({ ...f, destinationId: id, destination: item?.name ?? "" }))
                    }
                    placeholder="Select Destination"
                  />
                ) : (
                  <Input
                    value={form.destination}
                    onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
                  />
                )}
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
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Area</h1>
            <p className="text-sm text-muted-foreground">
              Manage areas mapped to service centres and destinations.
            </p>
          </div>

          <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
              <TooltipProvider delayDuration={200}>
                <div className="flex items-center gap-1.5">
                  <DataIoToolbar
                    export={{
                      filename: "areas",
                      title: "Areas",
                      columns: [
                        { key: "areaName", header: "Area Name" },
                        { key: "serviceCenter", header: "Service Center" },
                        { key: "destination", header: "Destination" },
                      ],
                      getRows: () =>
                        rows.map((r) => ({
                          areaName: r.areaName,
                          serviceCenter: r.serviceCenter,
                          destination: r.destination,
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
                    <TableHead className="text-sidebar-foreground">Area Name</TableHead>
                    <TableHead className="text-sidebar-foreground">Service Center</TableHead>
                    <TableHead className="text-sidebar-foreground">Destination</TableHead>
                    <TableHead className="w-28 text-center text-sidebar-foreground">
                      Action
                    </TableHead>
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
                      <TableCell
                        colSpan={4}
                        className="h-32 text-center text-sm text-muted-foreground"
                      >
                        No data available in table
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
