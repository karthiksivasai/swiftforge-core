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

type Status = "Active" | "In-Active";
type ExpenseType = "Direct" | "Indirect" | "Operational" | "Administrative";

type ExpenseRow = {
  id: string;
  code: string;
  name: string;
  expenseType: ExpenseType;
  ledger: string;
  glAccount: string;
  taxPct: string;
  status: Status;
};

const EXPENSE_TYPES: ExpenseType[] = ["Direct", "Indirect", "Operational", "Administrative"];

const emptyRow = (): Omit<ExpenseRow, "id"> => ({
  code: "", name: "", expenseType: "Operational", ledger: "", glAccount: "",
  taxPct: "0", status: "Active",
});

export const Route = createFileRoute("/master/customer/expense")({
  head: () => ({
    meta: [
      { title: "Expense — Master — Courier ERP" },
      { name: "description", content: "Manage expense heads used across billing, invoicing, and accounting." },
    ],
  }),
  component: ExpensePage,
});

function ExpensePage() {
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState({ code: "", name: "", expenseType: "", ledger: "", status: "" });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [form, setForm] = useState<Omit<ExpenseRow, "id">>(emptyRow());
  const [deleteTarget, setDeleteTarget] = useState<ExpenseRow | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && ![r.code, r.name, r.expenseType, r.ledger, r.glAccount, r.status].some((v) => String(v).toLowerCase().includes(q))) return false;
      if (colFilters.code && !r.code.toLowerCase().includes(colFilters.code.toLowerCase())) return false;
      if (colFilters.name && !r.name.toLowerCase().includes(colFilters.name.toLowerCase())) return false;
      if (colFilters.expenseType && !r.expenseType.toLowerCase().includes(colFilters.expenseType.toLowerCase())) return false;
      if (colFilters.ledger && !r.ledger.toLowerCase().includes(colFilters.ledger.toLowerCase())) return false;
      if (colFilters.status && !r.status.toLowerCase().includes(colFilters.status.toLowerCase())) return false;
      return true;
    });
  }, [rows, search, colFilters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const startIdx = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const openAdd = () => { setEditing(null); setForm(emptyRow()); setOpen(true); };
  const openEdit = (row: ExpenseRow) => {
    setEditing(row);
    const { id: _id, ...rest } = row;
    setForm(rest);
    setOpen(true);
  };

  const handleSave = () => {
    if (!form.code.trim()) return toast.error("Expense Code is required");
    if (!form.name.trim()) return toast.error("Expense Name is required");
    const tax = parseFloat(form.taxPct || "0");
    if (Number.isNaN(tax) || tax < 0 || tax > 100) return toast.error("Tax % must be between 0 and 100");
    if (editing) {
      setRows((prev) => prev.map((r) => (r.id === editing.id ? { ...editing, ...form } : r)));
      toast.success("Expense updated");
    } else {
      setRows((prev) => [{ id: crypto.randomUUID(), ...form }, ...prev]);
      toast.success("Expense added");
    }
    setOpen(false);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    toast.success(`Deleted ${deleteTarget.code}`);
    setDeleteTarget(null);
  };

  const handleExport = () => {
    downloadCsv(
      "expenses.csv",
      ["Code", "Name", "Expense Type", "Ledger", "GL Account", "Tax %", "Status"],
      rows.map((r) => [r.code, r.name, r.expenseType, r.ledger, r.glAccount, r.taxPct, r.status]),
    );
    toast.success("Exported expenses.csv");
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
      const imported: ExpenseRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const c = parseRow(lines[i]);
        if (!c[0]?.trim()) continue;
        const et = EXPENSE_TYPES.find((t) => t.toLowerCase() === (c[2] || "").trim().toLowerCase()) ?? "Operational";
        const status = (c[6] || "").trim().toLowerCase() === "in-active" ? "In-Active" : "Active";
        imported.push({
          id: crypto.randomUUID(),
          code: c[0].trim(), name: (c[1] || "").trim(), expenseType: et,
          ledger: (c[3] || "").trim(), glAccount: (c[4] || "").trim(),
          taxPct: (c[5] || "0").trim(), status: status as Status,
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
    setColFilters({ code: "", name: "", expenseType: "", ledger: "", status: "" });
    setPage(1);
    toast.success("Refreshed");
  };

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <MasterBreadcrumb trail={["Master", "Customer", "Expense"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Expense</h1>
        <p className="text-sm text-muted-foreground">
          Manage expense heads used across billing, invoicing, and accounting entries.
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        <input ref={importInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportFile} />
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center gap-1.5">
              <IconButton label="Export" onClick={handleExport}><Download className="h-4 w-4" /></IconButton>
              <IconButton label="Import" onClick={() => importInputRef.current?.click()}><Upload className="h-4 w-4" /></IconButton>
              <IconButton label="Refresh" onClick={handleRefresh}><RefreshCw className="h-4 w-4" /></IconButton>
            </div>
          </TooltipProvider>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search..." className="h-9 w-56 pl-8" />
            </div>
            <Button size="sm" onClick={openAdd} className="h-9 gap-1.5"><Plus className="h-4 w-4" />Add</Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-sidebar hover:bg-sidebar">
                <TableHead className="text-sidebar-foreground">Code</TableHead>
                <TableHead className="text-sidebar-foreground">Expense Name</TableHead>
                <TableHead className="text-sidebar-foreground">Expense Type</TableHead>
                <TableHead className="text-sidebar-foreground">Ledger</TableHead>
                <TableHead className="text-sidebar-foreground text-right">Tax %</TableHead>
                <TableHead className="text-sidebar-foreground">Status</TableHead>
                <TableHead className="w-28 text-center text-sidebar-foreground">Action</TableHead>
              </TableRow>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                {(["code", "name", "expenseType", "ledger"] as const).map((k) => (
                  <TableHead key={k} className="py-2">
                    <Input
                      value={colFilters[k]}
                      onChange={(e) => { setColFilters((f) => ({ ...f, [k]: e.target.value })); setPage(1); }}
                      placeholder={k[0].toUpperCase() + k.slice(1)}
                      className="h-8"
                    />
                  </TableHead>
                ))}
                <TableHead />
                <TableHead className="py-2">
                  <Input
                    value={colFilters.status}
                    onChange={(e) => { setColFilters((f) => ({ ...f, status: e.target.value })); setPage(1); }}
                    placeholder="Status"
                    className="h-8"
                  />
                </TableHead>
                <TableHead />
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
                    <TableCell className="font-medium">{r.code}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{r.expenseType}</TableCell>
                    <TableCell>{r.ledger}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{r.taxPct}</TableCell>
                    <TableCell><StatusPill status={r.status} /></TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(r)} aria-label={`Edit ${r.code}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(r)} aria-label={`Delete ${r.code}`}>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Expense" : "Expense Details"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 py-2 md:grid-cols-2">
            <FieldWrapper label="Expense Code" required>
              <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="e.g. EXP001" />
            </FieldWrapper>
            <FieldWrapper label="Expense Name" required>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Fuel Charges" />
            </FieldWrapper>
            <FieldWrapper label="Expense Type">
              <Select value={form.expenseType} onValueChange={(v) => setForm((f) => ({ ...f, expenseType: v as ExpenseType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldWrapper>
            <FieldWrapper label="Ledger">
              <Input value={form.ledger} onChange={(e) => setForm((f) => ({ ...f, ledger: e.target.value }))} placeholder="e.g. Fuel Expense A/c" />
            </FieldWrapper>
            <FieldWrapper label="GL Account">
              <Input value={form.glAccount} onChange={(e) => setForm((f) => ({ ...f, glAccount: e.target.value }))} placeholder="e.g. 5100-01" />
            </FieldWrapper>
            <FieldWrapper label="Tax %">
              <Input type="number" step="0.01" min="0" max="100" value={form.taxPct} onChange={(e) => setForm((f) => ({ ...f, taxPct: e.target.value }))} />
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
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button onClick={handleSave} className="bg-emerald-600 text-white hover:bg-emerald-600/90">Save</Button>
            <Button variant="destructive" onClick={() => setOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete expense?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <span className="font-medium text-foreground">{deleteTarget?.code}</span>
              {deleteTarget?.name ? ` (${deleteTarget.name})` : ""} from the expense master.
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
