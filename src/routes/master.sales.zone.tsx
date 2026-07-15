import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  RefreshCw,
  Plus,
  Search,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/lib/auth";
import { useMasterResource } from "@/lib/masters/core/useMasterResource";
import { masterKeys } from "@/lib/masters/core/queryKeys";
import { mapCsvToImportRows, type ImportRow } from "@/lib/masters/core";
import type { CsvRecord } from "@/lib/masters/core/csv";
import { zonesResource, type ZoneRow } from "@/lib/masters/resources/zones";
import { zoneCreateSchema, zoneUpdateSchema } from "@/lib/masters/schemas/zones";
import { useMasterList, toErrorMessage, importSummary } from "@/lib/masters/screen";
import { DataIoToolbar } from "@/components/data-io-toolbar";

type Zone = {
  id: string;
  code: string;
  name: string;
  row_version?: number;
};

const SEED: Zone[] = [
  { code: "1", name: "INTERNATIONAL ZONE 1" },
  { code: "2", name: "INTERNATIONAL ZONE 2" },
  { code: "3", name: "INTERNATIONAL ZONE 3" },
  { code: "4", name: "INTERNATIONAL ZONE 4" },
  { code: "5", name: "INTERNATIONAL ZONE 5" },
  { code: "6", name: "INTERNATIONAL ZONE 6" },
  { code: "6A", name: "INTERNATIONAL ZONE 6A" },
  { code: "7", name: "INTERNATIONAL ZONE 7" },
  { code: "7A", name: "INTERNATIONAL ZONE 7A" },
  { code: "8", name: "INTERNATIONAL ZONE 8" },
  { code: "9", name: "INTERNATIONAL ZONE 9" },
  { code: "10", name: "INTERNATIONAL ZONE 10" },
  { code: "11", name: "INTERNATIONAL ZONE 11" },
  { code: "12", name: "INTERNATIONAL ZONE 12" },
  { code: "13", name: "INTERNATIONAL ZONE 13" },
  { code: "14", name: "INTERNATIONAL ZONE 14" },
  { code: "15", name: "INTERNATIONAL ZONE 15" },
  { code: "16", name: "INTERNATIONAL ZONE 16" },
  { code: "17", name: "INTERNATIONAL ZONE 17" },
  { code: "18", name: "INTERNATIONAL ZONE 18" },
  { code: "AU", name: "INTERNATIONAL ZONE AU" },
  { code: "CA", name: "INTERNATIONAL ZONE CA" },
  { code: "CZ", name: "INTERNATIONAL ZONE CZ" },
  { code: "DE", name: "INTERNATIONAL ZONE DE" },
  { code: "DO", name: "DOMESTIC" },
  { code: "HU", name: "INTERNATIONAL ZONE HU" },
  { code: "I", name: "INTERNATIONAL" },
  { code: "NZ", name: "INTERNATIONAL ZONE NZ" },
  { code: "PL", name: "INTERNATIONAL ZONE PL" },
  { code: "RO", name: "INTERNATIONAL ZONE RO" },
  { code: "SG", name: "INTERNATIONAL ZONE SG" },
  { code: "US", name: "INTERNATIONAL ZONE US" },
].map((z, i) => ({ id: String(i + 1), ...z }));

const PAGE_SIZE = 10;

export const Route = createFileRoute("/master/sales/zone")({
  head: () => ({
    meta: [
      { title: "Zone — Master — Courier ERP" },
      { name: "description", content: "Manage zone master records for the courier ERP platform." },
    ],
  }),
  component: ZonePage,
});

function emptyZone(): Omit<Zone, "id"> {
  return { code: "", name: "" };
}

function rowToView(r: ZoneRow): Zone {
  return { id: r.id, code: r.code, name: r.name, row_version: r.row_version };
}

function toRaw(form: Omit<Zone, "id">) {
  return { code: form.code, name: form.name };
}

function ZonePage() {
  const { isAuthenticated: authed } = useAuth();
  const rc = useMasterResource(zonesResource);
  const live = useMasterList(zonesResource, { enabled: authed });
  const queryClient = useQueryClient();

  const [demoRows, setDemoRows] = useState<Zone[]>(SEED);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Zone | null>(null);
  const [form, setForm] = useState<Omit<Zone, "id">>(emptyZone());
  const [deleteTarget, setDeleteTarget] = useState<Zone | null>(null);
  const [saving, setSaving] = useState(false);
  const rows: Zone[] = authed ? (live.rows as ZoneRow[]).map(rowToView) : demoRows;

  const canAdd = !authed || rc.perms.canAdd;
  const canModify = !authed || rc.perms.canModify;
  const canDelete = !authed || rc.perms.canDelete;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.code, r.name].some((v) => String(v).toLowerCase().includes(q)));
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const startIdx = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyZone());
    setOpen(true);
  };

  const openEdit = (row: Zone) => {
    setEditing(row);
    const { id: _id, row_version: _rv, ...rest } = row;
    setForm(rest);
    setOpen(true);
  };

  const handleSave = async () => {
    const raw = toRaw(form);
    if (authed) {
      setSaving(true);
      try {
        if (editing) {
          const patch = zoneUpdateSchema.parse(raw);
          await rc.update.mutateAsync({
            id: editing.id,
            rowVersion: editing.row_version ?? 0,
            patch,
          });
          toast.success("Zone updated");
        } else {
          const values = zoneCreateSchema.parse(raw);
          await rc.create.mutateAsync(values);
          toast.success("Zone added");
        }
        setOpen(false);
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not save zone"));
      } finally {
        setSaving(false);
      }
      return;
    }
    try {
      if (editing) zoneUpdateSchema.parse(raw);
      else zoneCreateSchema.parse(raw);
    } catch (err) {
      toast.error(toErrorMessage(err, "Please fix the form"));
      return;
    }
    if (editing) {
      setDemoRows((prev) => prev.map((r) => (r.id === editing.id ? { ...editing, ...form } : r)));
      toast.success("Zone updated");
    } else {
      setDemoRows((prev) => [{ id: crypto.randomUUID(), ...form }, ...prev]);
      toast.success("Zone added");
    }
    setOpen(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const row = deleteTarget;
    if (authed) {
      try {
        await rc.remove.mutateAsync({ id: row.id, rowVersion: row.row_version ?? 0 });
        toast.success(`Deleted ${row.code}`);
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not delete zone"));
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
          zonesResource.importColumns,
        ) as ImportRow[];
        const res = await rc.commitImport.mutateAsync(importRows);
        toast.success(importSummary(res));
        return;
      }
      const imported: Zone[] = [];
      for (const rec of mapCsvToImportRows(parsedRows, zonesResource.importColumns)) {
        if (!rec.code?.trim()) continue;
        imported.push({
          id: crypto.randomUUID(),
          code: rec.code.trim(),
          name: (rec.name || "").trim(),
        });
      }
      if (imported.length === 0) {
        toast.error("No valid rows found");
        return;
      }
      setDemoRows((prev) => [...imported, ...prev]);
      toast.success(`Imported ${imported.length} zone${imported.length === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(toErrorMessage(err, "Failed to import file"));
    }
  };

  const handleRefresh = () => {
    setSearch("");
    setPage(1);
    if (authed) queryClient.invalidateQueries({ queryKey: masterKeys.all(zonesResource.key) });
    toast.success("Refreshed");
  };

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/dashboard">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <span className="text-muted-foreground">Master</span>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <span className="text-muted-foreground">Sales</span>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Zone</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Zone</h1>
        <p className="text-sm text-muted-foreground">
          Manage the zone master used across rate cards, destinations, and shipments.
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center gap-1.5">
              <DataIoToolbar
                export={{
                  filename: "zones",
                  title: "Zones",
                  columns: [
                    { key: "code", header: "Zone Code" },
                    { key: "name", header: "Zone Name" },
                  ],
                  getRows: () =>
                    rows.map((r) => ({
                      code: r.code,
                      name: r.name,
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
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search..."
                className="h-9 w-56 pl-8"
              />
            </div>
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
                <TableHead className="text-sidebar-foreground">Zone Code</TableHead>
                <TableHead className="text-sidebar-foreground">Zone Name</TableHead>
                <TableHead className="w-28 text-center text-sidebar-foreground">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-32 text-center text-sm text-muted-foreground">
                    No zones found.
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

        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
          <span>
            Showing {startIdx} to {endIdx} of {filtered.length} entries
          </span>
          <div className="flex items-center gap-1">
            <PagerButton disabled={currentPage === 1} onClick={() => setPage(1)}>
              <ChevronsLeft className="h-4 w-4" />
            </PagerButton>
            <PagerButton disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </PagerButton>
            {Array.from({ length: totalPages }).map((_, i) => {
              const n = i + 1;
              const active = n === currentPage;
              return (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={`h-8 min-w-8 rounded-md px-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-accent"
                  }`}
                >
                  {n}
                </button>
              );
            })}
            <PagerButton
              disabled={currentPage === totalPages}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </PagerButton>
            <PagerButton disabled={currentPage === totalPages} onClick={() => setPage(totalPages)}>
              <ChevronsRight className="h-4 w-4" />
            </PagerButton>
          </div>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Zone" : "Add Zone"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-5 py-2 md:grid-cols-2 lg:grid-cols-4">
            <FieldWrapper label="Zone Code" required>
              <Input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="e.g. 1"
              />
            </FieldWrapper>

            <FieldWrapper label="Zone Name" required>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. INTERNATIONAL ZONE 1"
              />
            </FieldWrapper>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-emerald-600 text-white hover:bg-emerald-600/90"
            >
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button variant="destructive" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete zone?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              <span className="font-medium text-foreground">{deleteTarget?.code}</span>
              {deleteTarget?.name ? ` (${deleteTarget.name})` : ""} from the zone master. This
              action cannot be undone.
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

function FieldWrapper({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="outline"
          className="h-9 w-9 bg-background"
          onClick={onClick}
          aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function PagerButton({
  disabled,
  onClick,
  children,
}: {
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
