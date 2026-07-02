import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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

type Zone = {
  id: string;
  code: string;
  name: string;
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

function ZonePage() {
  const [rows, setRows] = useState<Zone[]>(SEED);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Zone | null>(null);
  const [form, setForm] = useState<Omit<Zone, "id">>(emptyZone());
  const [deleteTarget, setDeleteTarget] = useState<Zone | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.code, r.name].some((v) => String(v).toLowerCase().includes(q)),
    );
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
    const { id: _id, ...rest } = row;
    setForm(rest);
    setOpen(true);
  };

  const handleSave = () => {
    if (!form.code.trim()) {
      toast.error("Zone Code is required");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Zone Name is required");
      return;
    }
    if (editing) {
      setRows((prev) => prev.map((r) => (r.id === editing.id ? { ...editing, ...form } : r)));
      toast.success("Zone updated");
    } else {
      const id = crypto.randomUUID();
      setRows((prev) => [{ id, ...form }, ...prev]);
      toast.success("Zone added");
    }
    setOpen(false);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const row = deleteTarget;
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    toast.success(`Deleted ${row.code}`);
    setDeleteTarget(null);
  };

  const handleExport = () => {
    const header = ["Zone Code", "Zone Name"];
    const csv = [
      header.join(","),
      ...rows.map((r) =>
        [r.code, r.name].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "zones.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported zones.csv");
  };

  const handleImport = () => toast.info("Import: connect to backend in a future phase");
  const handleRefresh = () => {
    setSearch("");
    setPage(1);
    toast.success("Refreshed");
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 md:px-6 md:py-8">
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
              <IconButton label="Export" onClick={handleExport}>
                <Download className="h-4 w-4" />
              </IconButton>
              <IconButton label="Import" onClick={handleImport}>
                <Upload className="h-4 w-4" />
              </IconButton>
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
                <TableHead className="text-sidebar-foreground">Zone Code</TableHead>
                <TableHead className="text-sidebar-foreground">Zone Name</TableHead>
                <TableHead className="w-28 text-right text-sidebar-foreground">Action</TableHead>
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
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => openEdit(r)}
                          aria-label={`Edit ${r.code}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(r)}
                          aria-label={`Delete ${r.code}`}
                        >
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
            <PagerButton
              disabled={currentPage === totalPages}
              onClick={() => setPage(totalPages)}
            >
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
            <Button onClick={handleSave} className="bg-emerald-600 text-white hover:bg-emerald-600/90">
              Save
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
              {deleteTarget?.name ? ` (${deleteTarget.name})` : ""} from the zone master. This action cannot be undone.
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
