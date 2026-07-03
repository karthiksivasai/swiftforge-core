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
import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import type { LookupKey } from "@/lib/master-lookups";

type Status = "Active" | "In-Active";

type ShipperRow = {
  id: string;
  code: string;
  name: string;
  customer: string;
  mobile: string;
  email: string;
  address: string;
  pinCode: string;
  city: string;
  state: string;
  country: string;
  status: Status;
};

const emptyRow = (): Omit<ShipperRow, "id"> => ({
  code: "", name: "", customer: "", mobile: "", email: "", address: "",
  pinCode: "", city: "", state: "", country: "India", status: "Active",
});

export const Route = createFileRoute("/master/customer/shipper")({
  head: () => ({
    meta: [
      { title: "Shipper — Master — Courier ERP" },
      { name: "description", content: "Manage shipper (sender) directory with contact and pickup address details." },
    ],
  }),
  component: ShipperPage,
});

function ShipperPage() {
  const [rows, setRows] = useState<ShipperRow[]>([]);
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState({ code: "", name: "", customer: "", mobile: "", city: "", status: "" });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ShipperRow | null>(null);
  const [form, setForm] = useState<Omit<ShipperRow, "id">>(emptyRow());
  const [deleteTarget, setDeleteTarget] = useState<ShipperRow | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && ![r.code, r.name, r.customer, r.mobile, r.email, r.city, r.state, r.status].some((v) => String(v).toLowerCase().includes(q))) return false;
      if (colFilters.code && !r.code.toLowerCase().includes(colFilters.code.toLowerCase())) return false;
      if (colFilters.name && !r.name.toLowerCase().includes(colFilters.name.toLowerCase())) return false;
      if (colFilters.customer && !r.customer.toLowerCase().includes(colFilters.customer.toLowerCase())) return false;
      if (colFilters.mobile && !r.mobile.toLowerCase().includes(colFilters.mobile.toLowerCase())) return false;
      if (colFilters.city && !r.city.toLowerCase().includes(colFilters.city.toLowerCase())) return false;
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
  const openEdit = (row: ShipperRow) => {
    setEditing(row);
    const { id: _id, ...rest } = row;
    setForm(rest);
    setOpen(true);
  };

  const handleSave = () => {
    if (!form.code.trim()) return toast.error("Shipper Code is required");
    if (!form.name.trim()) return toast.error("Shipper Name is required");
    if (!form.mobile.trim()) return toast.error("Mobile is required");
    if (editing) {
      setRows((prev) => prev.map((r) => (r.id === editing.id ? { ...editing, ...form } : r)));
      toast.success("Shipper updated");
    } else {
      setRows((prev) => [{ id: crypto.randomUUID(), ...form }, ...prev]);
      toast.success("Shipper added");
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
      "shippers.csv",
      ["Code", "Name", "Customer", "Mobile", "Email", "Address", "PinCode", "City", "State", "Country", "Status"],
      rows.map((r) => [r.code, r.name, r.customer, r.mobile, r.email, r.address, r.pinCode, r.city, r.state, r.country, r.status]),
    );
    toast.success("Exported shippers.csv");
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
      const imported: ShipperRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const c = parseRow(lines[i]);
        if (!c[0]?.trim()) continue;
        const status = (c[10] || "").trim().toLowerCase() === "in-active" ? "In-Active" : "Active";
        imported.push({
          id: crypto.randomUUID(),
          code: c[0].trim(), name: (c[1] || "").trim(), customer: (c[2] || "").trim(),
          mobile: (c[3] || "").trim(), email: (c[4] || "").trim(), address: (c[5] || "").trim(),
          pinCode: (c[6] || "").trim(), city: (c[7] || "").trim(), state: (c[8] || "").trim(),
          country: (c[9] || "India").trim(), status: status as Status,
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
    setColFilters({ code: "", name: "", customer: "", mobile: "", city: "", status: "" });
    setPage(1);
    toast.success("Refreshed");
  };

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <MasterBreadcrumb trail={["Master", "Customer", "Shipper"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Shipper</h1>
        <p className="text-sm text-muted-foreground">
          Manage shipper (sender) directory with contact details and pickup address.
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
                <TableHead className="text-sidebar-foreground">Shipper Name</TableHead>
                <TableHead className="text-sidebar-foreground">Customer</TableHead>
                <TableHead className="text-sidebar-foreground">Mobile</TableHead>
                <TableHead className="text-sidebar-foreground">City</TableHead>
                <TableHead className="text-sidebar-foreground">Status</TableHead>
                <TableHead className="w-28 text-center text-sidebar-foreground">Action</TableHead>
              </TableRow>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                {(["code", "name", "customer", "mobile", "city", "status"] as const).map((k) => (
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
                    <TableCell>{r.customer}</TableCell>
                    <TableCell>{r.mobile}</TableCell>
                    <TableCell>{r.city}</TableCell>
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
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Shipper" : "Shipper Details"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 py-2 md:grid-cols-3">
            <FieldWrapper label="Code" required>
              <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="e.g. SH001" />
            </FieldWrapper>
            <FieldWrapper label="Shipper Name" required>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </FieldWrapper>
            <FieldWrapper label="Customer">
              <LookupInput lookup="serviceCentre" value={form.customer} onChange={(v) => setForm((f) => ({ ...f, customer: v }))} />
            </FieldWrapper>
            <FieldWrapper label="Mobile" required>
              <Input value={form.mobile} onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))} />
            </FieldWrapper>
            <FieldWrapper label="Email">
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </FieldWrapper>
            <FieldWrapper label="Pin Code">
              <LookupInput lookup="pinCode" returnField="code" value={form.pinCode} onChange={(v) => setForm((f) => ({ ...f, pinCode: v }))} />
            </FieldWrapper>
            <FieldWrapper label="City">
              <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
            </FieldWrapper>
            <FieldWrapper label="State">
              <LookupInput lookup="state" value={form.state} onChange={(v) => setForm((f) => ({ ...f, state: v }))} />
            </FieldWrapper>
            <FieldWrapper label="Country">
              <LookupInput lookup="country" value={form.country} onChange={(v) => setForm((f) => ({ ...f, country: v }))} />
            </FieldWrapper>
            <FieldWrapper label="Address" className="md:col-span-3">
              <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
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
            <AlertDialogTitle>Delete shipper?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <span className="font-medium text-foreground">{deleteTarget?.code}</span>
              {deleteTarget?.name ? ` (${deleteTarget.name})` : ""} from the shipper master.
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

function LookupInput({
  value, onChange, lookup, returnField = "name",
}: {
  value: string;
  onChange: (v: string) => void;
  lookup: LookupKey;
  returnField?: "code" | "name" | "code-name";
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex gap-1">
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
      <Button size="icon" variant="outline" className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90" aria-label="Search" onClick={() => setOpen(true)}>
        <Search className="h-4 w-4" />
      </Button>
      <MasterLookupDialog open={open} onOpenChange={setOpen} lookup={lookup} returnField={returnField} onSelect={(v) => onChange(v)} />
    </div>
  );
}
