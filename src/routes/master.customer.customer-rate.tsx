import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  RefreshCw,
  Plus,
  Search,
  Pencil,
  Trash2,
  Calendar as CalendarIcon,
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
} from "@/components/master-table-kit";
import { DataIoToolbar } from "@/components/data-io-toolbar";
import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import type { LookupKey } from "@/lib/master-lookups";

type Status = "Active" | "In-Active";

type RateRow = {
  id: string;
  customer: string;
  product: string;
  service: string;
  origin: string;
  destination: string;
  zone: string;
  fromDate: string;
  toDate: string;
  minWeight: string;
  ratePerKg: string;
  fuelPct: string;
  otherCharges: string;
  status: Status;
};

const emptyRow = (): Omit<RateRow, "id"> => ({
  customer: "", product: "", service: "Express", origin: "", destination: "",
  zone: "", fromDate: "", toDate: "", minWeight: "0.5", ratePerKg: "0",
  fuelPct: "0", otherCharges: "0", status: "Active",
});

const SERVICES = ["Express", "Standard", "Economy", "Same Day", "Next Day"];

export const Route = createFileRoute("/master/customer/customer-rate")({
  head: () => ({
    meta: [
      { title: "Customer Rate — Master — Courier ERP" },
      { name: "description", content: "Manage customer-specific rate contracts by product, service and zone." },
    ],
  }),
  component: CustomerRatePage,
});

function CustomerRatePage() {
  const [rows, setRows] = useState<RateRow[]>([]);
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState({ customer: "", product: "", service: "", destination: "", status: "" });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RateRow | null>(null);
  const [form, setForm] = useState<Omit<RateRow, "id">>(emptyRow());
  const [deleteTarget, setDeleteTarget] = useState<RateRow | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && ![r.customer, r.product, r.service, r.origin, r.destination, r.zone, r.status].some((v) => String(v).toLowerCase().includes(q))) return false;
      if (colFilters.customer && !r.customer.toLowerCase().includes(colFilters.customer.toLowerCase())) return false;
      if (colFilters.product && !r.product.toLowerCase().includes(colFilters.product.toLowerCase())) return false;
      if (colFilters.service && !r.service.toLowerCase().includes(colFilters.service.toLowerCase())) return false;
      if (colFilters.destination && !r.destination.toLowerCase().includes(colFilters.destination.toLowerCase())) return false;
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
  const openEdit = (row: RateRow) => {
    setEditing(row);
    const { id: _id, ...rest } = row;
    setForm(rest);
    setOpen(true);
  };

  const handleSave = () => {
    if (!form.customer.trim()) return toast.error("Customer is required");
    if (!form.product.trim()) return toast.error("Product is required");
    if (!form.fromDate) return toast.error("From Date is required");
    if (!form.toDate) return toast.error("To Date is required");
    const rate = parseFloat(form.ratePerKg);
    if (Number.isNaN(rate) || rate < 0) return toast.error("Rate per Kg must be a positive number");
    if (editing) {
      setRows((prev) => prev.map((r) => (r.id === editing.id ? { ...editing, ...form } : r)));
      toast.success("Rate updated");
    } else {
      setRows((prev) => [{ id: crypto.randomUUID(), ...form }, ...prev]);
      toast.success("Rate added");
    }
    setOpen(false);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    toast.success("Rate entry deleted");
    setDeleteTarget(null);
  };

  const handleRefresh = () => {
    setSearch("");
    setColFilters({ customer: "", product: "", service: "", destination: "", status: "" });
    setPage(1);
    toast.success("Refreshed");
  };

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <MasterBreadcrumb trail={["Master", "Customer", "Customer Rate"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Customer Rate</h1>
        <p className="text-sm text-muted-foreground">
          Configure customer-specific rate contracts by product, service, and origin-destination.
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center gap-1.5">
              <DataIoToolbar
                export={{
                  filename: "customer-rates",
                  title: "Customer Rates",
                  columns: [
                    { key: "customer", header: "Customer" },
                    { key: "product", header: "Product" },
                    { key: "service", header: "Service" },
                    { key: "origin", header: "Origin" },
                    { key: "destination", header: "Destination" },
                    { key: "zone", header: "Zone" },
                    { key: "fromDate", header: "From Date" },
                    { key: "toDate", header: "To Date" },
                    { key: "minWeight", header: "Min Weight" },
                    { key: "ratePerKg", header: "Rate/Kg" },
                    { key: "fuelPct", header: "Fuel %" },
                    { key: "otherCharges", header: "Other Charges" },
                    { key: "status", header: "Status" },
                  ],
                  getRows: () =>
                    rows.map((r) => ({
                      customer: r.customer,
                      product: r.product,
                      service: r.service,
                      origin: r.origin,
                      destination: r.destination,
                      zone: r.zone,
                      fromDate: r.fromDate,
                      toDate: r.toDate,
                      minWeight: r.minWeight,
                      ratePerKg: r.ratePerKg,
                      fuelPct: r.fuelPct,
                      otherCharges: r.otherCharges,
                      status: r.status,
                    })),
                }}
              />
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
                <TableHead className="text-sidebar-foreground">Customer</TableHead>
                <TableHead className="text-sidebar-foreground">Product</TableHead>
                <TableHead className="text-sidebar-foreground">Service</TableHead>
                <TableHead className="text-sidebar-foreground">Destination</TableHead>
                <TableHead className="text-sidebar-foreground">From</TableHead>
                <TableHead className="text-sidebar-foreground">To</TableHead>
                <TableHead className="text-sidebar-foreground text-right">Rate/Kg</TableHead>
                <TableHead className="text-sidebar-foreground text-right">Fuel %</TableHead>
                <TableHead className="text-sidebar-foreground">Status</TableHead>
                <TableHead className="w-28 text-center text-sidebar-foreground">Action</TableHead>
              </TableRow>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                {(["customer", "product", "service", "destination"] as const).map((k) => (
                  <TableHead key={k} className="py-2">
                    <Input
                      value={colFilters[k]}
                      onChange={(e) => { setColFilters((f) => ({ ...f, [k]: e.target.value })); setPage(1); }}
                      placeholder={k[0].toUpperCase() + k.slice(1)}
                      className="h-8"
                    />
                  </TableHead>
                ))}
                <TableHead /><TableHead /><TableHead /><TableHead />
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
                  <TableCell colSpan={10} className="h-32 text-center text-sm text-muted-foreground">
                    No data available in table
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.customer}</TableCell>
                    <TableCell>{r.product}</TableCell>
                    <TableCell>{r.service}</TableCell>
                    <TableCell>{r.destination}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.fromDate}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.toDate}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{r.ratePerKg}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{r.fuelPct}</TableCell>
                    <TableCell><StatusPill status={r.status} /></TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(r)} aria-label="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(r)} aria-label="Delete">
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
            <DialogTitle>{editing ? "Edit Customer Rate" : "Customer Rate Details"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 py-2 md:grid-cols-3">
            <FieldWrapper label="Customer" required>
              <LookupInput lookup="serviceCentre" value={form.customer} onChange={(v) => setForm((f) => ({ ...f, customer: v }))} />
            </FieldWrapper>
            <FieldWrapper label="Product" required>
              <LookupInput lookup="product" value={form.product} onChange={(v) => setForm((f) => ({ ...f, product: v }))} />
            </FieldWrapper>
            <FieldWrapper label="Service">
              <Select value={form.service} onValueChange={(v) => setForm((f) => ({ ...f, service: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVICES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldWrapper>
            <FieldWrapper label="Origin">
              <LookupInput lookup="destination" value={form.origin} onChange={(v) => setForm((f) => ({ ...f, origin: v }))} />
            </FieldWrapper>
            <FieldWrapper label="Destination">
              <LookupInput lookup="destination" value={form.destination} onChange={(v) => setForm((f) => ({ ...f, destination: v }))} />
            </FieldWrapper>
            <FieldWrapper label="Zone">
              <LookupInput lookup="zone" value={form.zone} onChange={(v) => setForm((f) => ({ ...f, zone: v }))} />
            </FieldWrapper>
            <FieldWrapper label="From Date" required>
              <DateField value={form.fromDate} onChange={(v) => setForm((f) => ({ ...f, fromDate: v }))} />
            </FieldWrapper>
            <FieldWrapper label="To Date" required>
              <DateField value={form.toDate} onChange={(v) => setForm((f) => ({ ...f, toDate: v }))} />
            </FieldWrapper>
            <FieldWrapper label="Min Weight (Kg)">
              <Input type="number" step="0.01" value={form.minWeight} onChange={(e) => setForm((f) => ({ ...f, minWeight: e.target.value }))} />
            </FieldWrapper>
            <FieldWrapper label="Rate per Kg" required>
              <Input type="number" step="0.01" value={form.ratePerKg} onChange={(e) => setForm((f) => ({ ...f, ratePerKg: e.target.value }))} />
            </FieldWrapper>
            <FieldWrapper label="Fuel %">
              <Input type="number" step="0.01" value={form.fuelPct} onChange={(e) => setForm((f) => ({ ...f, fuelPct: e.target.value }))} />
            </FieldWrapper>
            <FieldWrapper label="Other Charges">
              <Input type="number" step="0.01" value={form.otherCharges} onChange={(e) => setForm((f) => ({ ...f, otherCharges: e.target.value }))} />
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
            <AlertDialogTitle>Delete rate entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this rate entry for <span className="font-medium text-foreground">{deleteTarget?.customer}</span>.
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

function DateField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="pr-9" />
      <CalendarIcon className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
