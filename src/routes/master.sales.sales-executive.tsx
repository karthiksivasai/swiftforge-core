import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  Download,
  Upload,
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
import { parseCsv, mapCsvToImportRows, type ImportRow } from "@/lib/masters/core";
import {
  salesExecutivesResource,
  type SalesExecutiveRow as SalesExecDbRow,
} from "@/lib/masters/resources/salesExecutives";
import {
  salesExecutiveCreateSchema,
  salesExecutiveUpdateSchema,
} from "@/lib/masters/schemas/salesExecutives";
import { useMasterList, toErrorMessage, importSummary } from "@/lib/masters/screen";

type SalesExecRow = {
  id: string;
  code: string;
  name: string;
  commission: string;
  row_version?: number;
};

const SEED_DATA: Omit<SalesExecRow, "id">[] = [
  { code: "A20", name: "AIHAN ENTERPRISES", commission: "1" },
  { code: "SAI", name: "AMUDALA SIVA SAI", commission: "1" },
  { code: "JVN", name: "JEEVAN", commission: "1" },
  { code: "MNC", name: "MAROJU NAVEEN CHARY", commission: "1" },
  { code: "NTH", name: "NITHIN", commission: "1" },
  { code: "SRA", name: "SRAVANI DONTHU", commission: "1" },
  { code: "Bmk", name: "Vemula sai kiran", commission: "1" },
];

const SEED: SalesExecRow[] = SEED_DATA.map((s, i) => ({ id: String(i + 1), ...s }));

const PAGE_SIZE = 10;

export const Route = createFileRoute("/master/sales/sales-executive")({
  head: () => ({
    meta: [
      { title: "Sales Executive — Master — Courier ERP" },
      {
        name: "description",
        content: "Manage the sales executive master with commission rates.",
      },
    ],
  }),
  component: SalesExecutivePage,
});

function emptyRow(): Omit<SalesExecRow, "id"> {
  return { code: "", name: "", commission: "0" };
}

function rowToView(r: SalesExecDbRow): SalesExecRow {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    commission: r.commission == null ? "0" : String(r.commission),
    row_version: r.row_version,
  };
}

function toRaw(form: Omit<SalesExecRow, "id">) {
  const c = form.commission.trim();
  return {
    code: form.code,
    name: form.name,
    commission: c === "" ? null : Number(c),
  };
}

function SalesExecutivePage() {
  const { isAuthenticated: authed } = useAuth();
  const rc = useMasterResource(salesExecutivesResource);
  const live = useMasterList(salesExecutivesResource, { enabled: authed });
  const queryClient = useQueryClient();

  const [demoRows, setDemoRows] = useState<SalesExecRow[]>(SEED);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SalesExecRow | null>(null);
  const [form, setForm] = useState<Omit<SalesExecRow, "id">>(emptyRow());
  const [deleteTarget, setDeleteTarget] = useState<SalesExecRow | null>(null);
  const [saving, setSaving] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const rows: SalesExecRow[] = authed ? (live.rows as SalesExecDbRow[]).map(rowToView) : demoRows;

  const canAdd = !authed || rc.perms.canAdd;
  const canModify = !authed || rc.perms.canModify;
  const canDelete = !authed || rc.perms.canDelete;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.code, r.name, r.commission].some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const startIdx = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyRow());
    setOpen(true);
  };

  const openEdit = (row: SalesExecRow) => {
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
          const patch = salesExecutiveUpdateSchema.parse(raw);
          await rc.update.mutateAsync({
            id: editing.id,
            rowVersion: editing.row_version ?? 0,
            patch,
          });
          toast.success("Sales executive updated");
        } else {
          const values = salesExecutiveCreateSchema.parse(raw);
          await rc.create.mutateAsync(values);
          toast.success("Sales executive added");
        }
        setOpen(false);
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not save sales executive"));
      } finally {
        setSaving(false);
      }
      return;
    }
    try {
      if (editing) salesExecutiveUpdateSchema.parse(raw);
      else salesExecutiveCreateSchema.parse(raw);
    } catch (err) {
      toast.error(toErrorMessage(err, "Please fix the form"));
      return;
    }
    if (editing) {
      setDemoRows((prev) => prev.map((r) => (r.id === editing.id ? { ...editing, ...form } : r)));
      toast.success("Sales executive updated");
    } else {
      setDemoRows((prev) => [{ id: crypto.randomUUID(), ...form }, ...prev]);
      toast.success("Sales executive added");
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
        toast.error(toErrorMessage(err, "Could not delete sales executive"));
      }
    } else {
      setDemoRows((prev) => prev.filter((r) => r.id !== row.id));
      toast.success(`Deleted ${row.code}`);
    }
    setDeleteTarget(null);
  };

  const handleExport = () => {
    const header = ["Sales Ex. Code", "Sales Ex. Name", "Commission"];
    const csv = [
      header.join(","),
      ...rows.map((r) =>
        [r.code, r.name, r.commission].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sales-executives.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
    toast.success("Exported sales-executives.csv");
  };

  const handleImport = () => importInputRef.current?.click();

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.rows.length === 0) {
        toast.error("File is empty");
        return;
      }
      if (authed) {
        const importRows = mapCsvToImportRows(
          parsed.rows,
          salesExecutivesResource.importColumns,
        ) as ImportRow[];
        const res = await rc.commitImport.mutateAsync(importRows);
        toast.success(importSummary(res));
        return;
      }
      const imported: SalesExecRow[] = [];
      for (const rec of mapCsvToImportRows(parsed.rows, salesExecutivesResource.importColumns)) {
        if (!rec.code?.trim()) continue;
        imported.push({
          id: crypto.randomUUID(),
          code: rec.code.trim(),
          name: (rec.name || "").trim(),
          commission: (rec.commission || "0").trim(),
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
    if (authed)
      queryClient.invalidateQueries({ queryKey: masterKeys.all(salesExecutivesResource.key) });
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
            <BreadcrumbPage>Sales Executive</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Sales Executive</h1>
        <p className="text-sm text-muted-foreground">
          Manage sales executives and their commission rates.
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
                <IconButton label="Import" onClick={handleImport}>
                  <Upload className="h-4 w-4" />
                </IconButton>
              ) : null}
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
                <TableHead className="text-sidebar-foreground">Sales Ex. Code</TableHead>
                <TableHead className="text-sidebar-foreground">Sales Ex. Name</TableHead>
                <TableHead className="text-sidebar-foreground">Commission</TableHead>
                <TableHead className="w-28 text-center text-sidebar-foreground">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-32 text-center text-sm text-muted-foreground">
                    No sales executives found.
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.code}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{r.commission}</TableCell>
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
            <CompactPager total={totalPages} current={currentPage} onSelect={setPage} />
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
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Sales Executive" : "Add Sales Executive"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-5 py-2 md:grid-cols-3">
            <FieldWrapper label="Code" required>
              <Input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="e.g. SAI"
              />
            </FieldWrapper>

            <FieldWrapper label="Name" required>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. AMUDALA SIVA SAI"
              />
            </FieldWrapper>

            <FieldWrapper label="Commission %">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.commission}
                onChange={(e) => setForm((f) => ({ ...f, commission: e.target.value }))}
                placeholder="0"
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
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete sales executive?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              <span className="font-medium text-foreground">{deleteTarget?.code}</span>
              {deleteTarget?.name ? ` (${deleteTarget.name})` : ""} from the sales executive master.
              This action cannot be undone.
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

function CompactPager({
  total,
  current,
  onSelect,
}: {
  total: number;
  current: number;
  onSelect: (n: number) => void;
}) {
  const pages: (number | "…")[] = [];
  const push = (v: number | "…") => pages.push(v);
  if (total <= 7) {
    for (let i = 1; i <= total; i++) push(i);
  } else {
    push(1);
    if (current > 3) push("…");
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) push(i);
    if (current < total - 2) push("…");
    push(total);
  }
  return (
    <>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} className="px-1 text-muted-foreground">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onSelect(p)}
            className={`h-8 min-w-8 rounded-md px-2 text-sm font-medium transition-colors ${
              p === current
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-accent"
            }`}
          >
            {p}
          </button>
        ),
      )}
    </>
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
