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

type StateRow = {
  id: string;
  code: string;
  name: string;
  zone: string;
  gstAlise: string;
  unionTerritory: boolean;
};

const ZONES: string[] = [
  "DOMESTIC",
  "INTERNATIONAL",
  "INTERNATIONAL ZONE 1",
  "INTERNATIONAL ZONE 2",
  "INTERNATIONAL ZONE 3",
  "INTERNATIONAL ZONE 4",
  "INTERNATIONAL ZONE 5",
  "INTERNATIONAL ZONE 6",
  "INTERNATIONAL ZONE 6A",
  "INTERNATIONAL ZONE 7",
  "INTERNATIONAL ZONE 7A",
  "INTERNATIONAL ZONE 8",
  "INTERNATIONAL ZONE 9",
  "INTERNATIONAL ZONE 10",
  "INTERNATIONAL ZONE 11",
  "INTERNATIONAL ZONE 12",
  "INTERNATIONAL ZONE 13",
  "INTERNATIONAL ZONE 14",
  "INTERNATIONAL ZONE 15",
  "INTERNATIONAL ZONE 16",
  "INTERNATIONAL ZONE 17",
  "INTERNATIONAL ZONE 18",
  "INTERNATIONAL ZONE AU",
  "INTERNATIONAL ZONE CA",
  "INTERNATIONAL ZONE CZ",
  "INTERNATIONAL ZONE DE",
  "INTERNATIONAL ZONE HU",
  "INTERNATIONAL ZONE NZ",
  "INTERNATIONAL ZONE PL",
  "INTERNATIONAL ZONE RO",
  "INTERNATIONAL ZONE SG",
  "INTERNATIONAL ZONE US",
];

type SeedRow = { code: string; name: string; gstAlise: string; unionTerritory?: boolean };

const SEED_DATA: SeedRow[] = [
  { code: "AN", name: "Andaman & Nicobar Isands", gstAlise: "35", unionTerritory: true },
  { code: "AP", name: "Andhra Pradesh", gstAlise: "28" },
  { code: "AD", name: "Andhra Pradesh (New)", gstAlise: "37" },
  { code: "AR", name: "Arunachal Pradesh", gstAlise: "12" },
  { code: "AS", name: "Assam", gstAlise: "18" },
  { code: "BR", name: "Bihar", gstAlise: "10" },
  { code: "CH", name: "Chandigarh", gstAlise: "04", unionTerritory: true },
  { code: "CT", name: "Chhattisgarh", gstAlise: "22" },
  { code: "DN", name: "Dadra & Nagar Heveli", gstAlise: "26", unionTerritory: true },
  { code: "DD", name: "Daman & Diu", gstAlise: "25", unionTerritory: true },
  { code: "DL", name: "Delhi", gstAlise: "07", unionTerritory: true },
  { code: "GA", name: "Goa", gstAlise: "30" },
  { code: "GJ", name: "GUJARAT", gstAlise: "24" },
  { code: "HR", name: "Haryana", gstAlise: "06" },
  { code: "HP", name: "Himachal Pradesh", gstAlise: "02" },
  { code: "IS", name: "INTERNATIONAL", gstAlise: "40" },
  { code: "JK", name: "Jammu & Kashmir", gstAlise: "01", unionTerritory: true },
  { code: "JH", name: "Jharkhand", gstAlise: "20" },
  { code: "KA", name: "Karnataka", gstAlise: "29" },
  { code: "KL", name: "Kerala", gstAlise: "32" },
  { code: "LD", name: "Lakshadweep", gstAlise: "31", unionTerritory: true },
  { code: "MP", name: "Madhya Pradesh", gstAlise: "23" },
  { code: "MH", name: "MAHARASHTRA", gstAlise: "27" },
  { code: "MN", name: "Manipur", gstAlise: "14" },
  { code: "ML", name: "Meghalaya", gstAlise: "17" },
  { code: "MZ", name: "Mizoram", gstAlise: "15" },
  { code: "NL", name: "Nagaland", gstAlise: "13" },
  { code: "OR", name: "Orissa", gstAlise: "21" },
  { code: "PY", name: "Pondicherry", gstAlise: "34", unionTerritory: true },
  { code: "PB", name: "Punjab", gstAlise: "03" },
  { code: "RJ", name: "Rajasthan", gstAlise: "08" },
  { code: "SK", name: "Sikkim", gstAlise: "11" },
  { code: "TN", name: "Tamil Nadu", gstAlise: "33" },
  { code: "TS", name: "Telangana", gstAlise: "36" },
  { code: "TR", name: "Tripura", gstAlise: "16" },
  { code: "UP", name: "Uttar Pradesh", gstAlise: "09" },
  { code: "UT", name: "Uttarnchal", gstAlise: "05" },
  { code: "WB", name: "West Bengal", gstAlise: "19" },
];

const SEED: StateRow[] = SEED_DATA.map((s, i) => ({
  id: String(i + 1),
  code: s.code,
  name: s.name,
  zone: "",
  gstAlise: s.gstAlise,
  unionTerritory: !!s.unionTerritory,
}));

const PAGE_SIZE = 10;

export const Route = createFileRoute("/master/sales/state")({
  head: () => ({
    meta: [
      { title: "State — Master — Courier ERP" },
      { name: "description", content: "Manage the state master with zones and GST codes." },
    ],
  }),
  component: StatePage,
});

function emptyState(): Omit<StateRow, "id"> {
  return { code: "", name: "", zone: "", gstAlise: "", unionTerritory: false };
}

function StatePage() {
  const [rows, setRows] = useState<StateRow[]>(SEED);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StateRow | null>(null);
  const [form, setForm] = useState<Omit<StateRow, "id">>(emptyState());
  const [deleteTarget, setDeleteTarget] = useState<StateRow | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.code, r.name, r.zone, r.gstAlise].some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const startIdx = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyState());
    setOpen(true);
  };

  const openEdit = (row: StateRow) => {
    setEditing(row);
    const { id: _id, ...rest } = row;
    setForm(rest);
    setOpen(true);
  };

  const handleSave = () => {
    if (!form.code.trim()) {
      toast.error("State Code is required");
      return;
    }
    if (!form.name.trim()) {
      toast.error("State Name is required");
      return;
    }
    if (editing) {
      setRows((prev) => prev.map((r) => (r.id === editing.id ? { ...editing, ...form } : r)));
      toast.success("State updated");
    } else {
      const id = crypto.randomUUID();
      setRows((prev) => [{ id, ...form }, ...prev]);
      toast.success("State added");
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
    const header = ["State Code", "State Name", "Zone", "GST Alise", "Union Territory"];
    const csv = [
      header.join(","),
      ...rows.map((r) =>
        [r.code, r.name, r.zone, r.gstAlise, r.unionTerritory ? "Yes" : "No"]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "states.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
    toast.success("Exported states.csv");
  };

  const handleImport = () => importInputRef.current?.click();

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        toast.error("File is empty");
        return;
      }
      const parseRow = (line: string) => {
        const out: string[] = [];
        let cur = "";
        let inQ = false;
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
      const imported: StateRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const [code, name, zone, gstAlise, ut] = parseRow(lines[i]);
        if (!code?.trim()) continue;
        imported.push({
          id: crypto.randomUUID(),
          code: code.trim(),
          name: (name || "").trim(),
          zone: (zone || "").trim(),
          gstAlise: (gstAlise || "").trim(),
          unionTerritory: /^(yes|true|1)$/i.test((ut || "").trim()),
        });
      }
      if (imported.length === 0) {
        toast.error("No valid rows found");
        return;
      }
      setRows((prev) => [...imported, ...prev]);
      toast.success(`Imported ${imported.length} state${imported.length === 1 ? "" : "s"}`);
    } catch {
      toast.error("Failed to import file");
    }
  };

  const handleRefresh = () => {
    setSearch("");
    setPage(1);
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
            <BreadcrumbPage>State</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">State</h1>
        <p className="text-sm text-muted-foreground">
          Manage the state master with zone mapping and GST codes.
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
                <TableHead className="text-sidebar-foreground">State Code</TableHead>
                <TableHead className="text-sidebar-foreground">State Name</TableHead>
                <TableHead className="text-sidebar-foreground">Zone</TableHead>
                <TableHead className="text-sidebar-foreground">GST Alise</TableHead>
                <TableHead className="w-28 text-center text-sidebar-foreground">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-sm text-muted-foreground">
                    No states found.
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.code}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>
                      {r.zone || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {r.gstAlise || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center gap-1">
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
            <CompactPager total={totalPages} current={currentPage} onSelect={setPage} />
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
            <DialogTitle>{editing ? "Edit State" : "Add State"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-5 py-2 md:grid-cols-2 lg:grid-cols-4">
            <FieldWrapper label="State Code" required>
              <Input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="e.g. KA"
              />
            </FieldWrapper>

            <FieldWrapper label="State Name" required>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Karnataka"
              />
            </FieldWrapper>

            <FieldWrapper label="Zone">
              <Select
                value={form.zone || undefined}
                onValueChange={(v) => setForm((f) => ({ ...f, zone: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Zone" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {ZONES.map((z) => (
                    <SelectItem key={z} value={z}>
                      {z}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>

            <FieldWrapper label="GST Alise">
              <Input
                value={form.gstAlise}
                onChange={(e) => setForm((f) => ({ ...f, gstAlise: e.target.value }))}
                placeholder="e.g. 29"
              />
            </FieldWrapper>

            <div className="md:col-span-2 lg:col-span-4">
              <label
                htmlFor="ut"
                className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 cursor-pointer hover:bg-accent/40 transition-colors w-fit"
              >
                <Checkbox
                  id="ut"
                  checked={form.unionTerritory}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, unionTerritory: v === true }))}
                />
                <span className="text-sm font-medium">Union Territory</span>
              </label>
            </div>

          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button onClick={handleSave} className="bg-emerald-600 text-white hover:bg-emerald-600/90">
              Save
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
            <AlertDialogTitle>Delete state?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              <span className="font-medium text-foreground">{deleteTarget?.code}</span>
              {deleteTarget?.name ? ` (${deleteTarget.name})` : ""} from the state master. This action cannot be undone.
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
