import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { IconButton, MasterBreadcrumb, PAGE_SIZE, TablePager } from "@/components/master-table-kit";
import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import { type LookupKey, type LookupOption } from "@/lib/master-lookups";

type LookupPair = { code: string; name: string };
type LookupField = "customer" | "vendor" | "product" | "destination" | "service";

type FuelRow = {
  id: string;
  entryCode: string;
  customer: LookupPair;
  vendor: LookupPair;
  product: LookupPair;
  destination: LookupPair;
  service: LookupPair;
  fromDate: string;
  toDate: string;
  percentage: string;
};

type FuelForm = Omit<FuelRow, "id" | "entryCode">;

const emptyPair = (): LookupPair => ({ code: "", name: "" });
const todayIso = () => new Date().toISOString().slice(0, 10);
const ddmmyyyyToIso = (value: string) => {
  const [day, month, year] = value.split("/");
  return year && month && day ? `${year}-${month}-${day}` : value;
};
const isoToDdmmyyyy = (value: string) => {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
};

const seedRows: FuelRow[] = [
  ["180619", "BAND 2", "UPS", "CARD", "CARD", "CARD", "06/07/2026", "12/07/2026", "39.00"],
  ["180618", "BAND 2", "FDX", "CARD", "CARD", "CARD", "06/07/2026", "12/07/2026", "38.25"],
  ["180617", "BAND 2", "DHL1", "CARD", "CARD", "CARD", "06/07/2026", "12/07/2026", "40.75"],
  ["180616", "BAND 2", "DHL1", "CARD", "CARD", "CARD", "29/06/2026", "05/07/2026", "42.75"],
  ["180615", "BAND 2", "FEDE", "CARD", "CARD", "CARD", "29/06/2026", "05/07/2026", "38.50"],
  ["180614", "BAND 2", "UPS", "CARD", "CARD", "CARD", "29/06/2026", "05/07/2026", "39.25"],
  ["180613", "BAND 2", "DHL1", "CARD", "CARD", "CARD", "22/06/2026", "28/06/2026", "45.25"],
  ["180612", "BAND 2", "FEDE", "CARD", "CARD", "CARD", "22/06/2026", "28/06/2026", "41.50"],
  ["180611", "BAND 2", "UPS", "CARD", "CARD", "CARD", "22/06/2026", "28/06/2026", "42.25"],
  ["180610", "BAND 2", "DHL1", "CARD", "CARD", "CARD", "15/06/2026", "21/06/2026", "47.00"],
].map(([entryCode, customer, vendor, product, destination, service, fromDate, toDate, percentage], index) => ({
  id: String(index + 1),
  entryCode,
  customer: { code: customer, name: customer },
  vendor: { code: vendor, name: vendor },
  product: { code: product, name: product },
  destination: { code: destination, name: destination },
  service: { code: service, name: service },
  fromDate,
  toDate,
  percentage,
}));

const emptyForm = (): FuelForm => ({
  customer: emptyPair(),
  vendor: emptyPair(),
  product: emptyPair(),
  destination: emptyPair(),
  service: emptyPair(),
  fromDate: todayIso(),
  toDate: todayIso(),
  percentage: "",
});

export const Route = createFileRoute("/utility/tax-charges-setup/fuel-setup")({
  head: () => ({
    meta: [
      { title: "Fuel Setup — Utility — Courier ERP" },
      { name: "description", content: "Configure fuel percentage by customer, vendor, product, destination, and service." },
    ],
  }),
  component: FuelSetupPage,
});

function FuelSetupPage() {
  const [rows, setRows] = useState<FuelRow[]>(seedRows);
  const [screen, setScreen] = useState<"list" | "form">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FuelForm>(emptyForm());
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [lookupOpen, setLookupOpen] = useState<LookupKey | null>(null);
  const [lookupField, setLookupField] = useState<LookupField | null>(null);
  const [filters, setFilters] = useState({
    entryCode: "",
    customer: "",
    vendor: "",
    product: "",
    destination: "",
    service: "",
    fromDate: "",
    toDate: "",
    percentage: "",
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const values = rowValues(row);
      if (q && !values.some((value) => value.toLowerCase().includes(q))) return false;
      if (filters.entryCode && !row.entryCode.toLowerCase().includes(filters.entryCode.toLowerCase())) return false;
      if (filters.customer && !row.customer.name.toLowerCase().includes(filters.customer.toLowerCase())) return false;
      if (filters.vendor && !row.vendor.name.toLowerCase().includes(filters.vendor.toLowerCase())) return false;
      if (filters.product && !row.product.name.toLowerCase().includes(filters.product.toLowerCase())) return false;
      if (filters.destination && !row.destination.name.toLowerCase().includes(filters.destination.toLowerCase())) return false;
      if (filters.service && !row.service.name.toLowerCase().includes(filters.service.toLowerCase())) return false;
      if (filters.fromDate && !row.fromDate.toLowerCase().includes(filters.fromDate.toLowerCase())) return false;
      if (filters.toDate && !row.toDate.toLowerCase().includes(filters.toDate.toLowerCase())) return false;
      if (filters.percentage && !row.percentage.toLowerCase().includes(filters.percentage.toLowerCase())) return false;
      return true;
    });
  }, [filters, rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const startIdx = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const patch = (updates: Partial<FuelForm>) => setForm((current) => ({ ...current, ...updates }));

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setScreen("form");
  };

  const openEdit = (row: FuelRow) => {
    setEditingId(row.id);
    setForm({
      customer: row.customer,
      vendor: row.vendor,
      product: row.product,
      destination: row.destination,
      service: row.service,
      fromDate: ddmmyyyyToIso(row.fromDate),
      toDate: ddmmyyyyToIso(row.toDate),
      percentage: row.percentage,
    });
    setScreen("form");
  };

  const openLookup = (field: LookupField, lookup: LookupKey) => {
    setLookupField(field);
    setLookupOpen(lookup);
  };

  const handleLookupSelect = (option: LookupOption) => {
    if (!lookupField) return;
    patch({ [lookupField]: { code: option.code, name: option.name } });
    setLookupOpen(null);
  };

  const save = () => {
    if (!form.customer.name.trim()) return toast.error("Customer is required");
    if (!form.vendor.name.trim()) return toast.error("Vendor is required");
    if (!form.product.name.trim()) return toast.error("Product is required");
    if (!form.destination.name.trim()) return toast.error("Destination is required");
    if (!form.service.name.trim()) return toast.error("Service is required");
    if (!form.percentage.trim()) return toast.error("Percentage is required");

    const nextRow: FuelRow = {
      id: editingId ?? crypto.randomUUID(),
      entryCode: editingId ? rows.find((row) => row.id === editingId)?.entryCode ?? nextEntryCode(rows) : nextEntryCode(rows),
      ...form,
      fromDate: isoToDdmmyyyy(form.fromDate),
      toDate: isoToDdmmyyyy(form.toDate),
    };

    setRows((current) => (editingId ? current.map((row) => (row.id === editingId ? nextRow : row)) : [nextRow, ...current]));
    setScreen("list");
    toast.success(editingId ? "Fuel setup updated" : "Fuel setup saved");
  };

  if (screen === "form") {
    return (
      <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
        <MasterBreadcrumb trail={["Utility", "Tax / Charges Setup", "Fuel Setup"]} />

        <Card className="min-w-0 border p-4">
          <div className="grid gap-x-3 gap-y-2 lg:grid-cols-4">
            <LookupFieldInput label="Customer" value={form.customer} onChange={(customer) => patch({ customer })} onLookupOpen={() => openLookup("customer", "customer")} />
            <LookupFieldInput label="Vendor" value={form.vendor} onChange={(vendor) => patch({ vendor })} onLookupOpen={() => openLookup("vendor", "vendor")} />
            <LookupFieldInput label="Product" value={form.product} onChange={(product) => patch({ product })} onLookupOpen={() => openLookup("product", "product")} />
            <LookupFieldInput label="Destination" value={form.destination} onChange={(destination) => patch({ destination })} onLookupOpen={() => openLookup("destination", "destination")} />
            <LookupFieldInput label="Service" value={form.service} onChange={(service) => patch({ service })} onLookupOpen={() => openLookup("service", "serviceType")} />
            <TextField label="From Date" type="date" value={form.fromDate} onChange={(fromDate) => patch({ fromDate })} />
            <TextField label="To Date" type="date" value={form.toDate} onChange={(toDate) => patch({ toDate })} />
            <TextField label="Percentage" value={form.percentage} onChange={(percentage) => patch({ percentage })} />
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Button onClick={save} className="h-8 rounded-full bg-green-500 px-8 text-white hover:bg-green-600">
            Save
          </Button>
          <Button onClick={() => setScreen("list")} className="h-8 rounded-full bg-red-500 px-8 text-white hover:bg-red-600">
            Cancel
          </Button>
        </div>

        <MasterLookupDialog
          open={lookupOpen !== null}
          lookup={lookupOpen ?? "customer"}
          onOpenChange={(open) => {
            if (!open) setLookupOpen(null);
          }}
          onSelect={handleLookupSelect}
        />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Utility", "Tax / Charges Setup", "Fuel Setup"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Fuel Setup</h1>
        <p className="text-sm text-muted-foreground">Configure fuel percentages by customer, vendor, and product.</p>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-1.5">
            <IconButton label="Export" onClick={() => toast.success("Export queued")}><Download className="h-4 w-4" /></IconButton>
          </div>
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-foreground">
              Search:
              <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="h-9 w-56" />
            </label>
            <Button size="sm" className="h-9 gap-1.5" onClick={openAdd}><Plus className="h-4 w-4" />Add</Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-sidebar hover:bg-sidebar">
                {["Entry Code", "Customer", "Vendor", "Product", "Destination", "Service", "From Date", "To Date", "Percentage", "Action"].map((heading) => (
                  <TableHead key={heading} className="whitespace-nowrap text-sidebar-foreground">
                    <span className="flex items-center justify-between gap-2">{heading}{heading !== "Action" ? <span className="text-xs">⇅</span> : null}</span>
                  </TableHead>
                ))}
              </TableRow>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                {(["entryCode", "customer", "vendor", "product", "destination", "service", "fromDate", "toDate", "percentage"] as const).map((key) => (
                  <TableHead key={key} className="py-2">
                    <Input
                      value={filters[key]}
                      onChange={(event) => {
                        setFilters((current) => ({ ...current, [key]: event.target.value }));
                        setPage(1);
                      }}
                      placeholder={key === "entryCode" ? "Entry Code" : key === "fromDate" ? "From Date" : key === "toDate" ? "To Date" : key[0].toUpperCase() + key.slice(1)}
                      className="h-8"
                    />
                  </TableHead>
                ))}
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((row) => (
                <TableRow key={row.id} className="odd:bg-muted/50">
                  <TableCell>{row.entryCode}</TableCell>
                  <TableCell>{row.customer.name}</TableCell>
                  <TableCell>{row.vendor.name}</TableCell>
                  <TableCell>{row.product.name}</TableCell>
                  <TableCell>{row.destination.name}</TableCell>
                  <TableCell>{row.service.name}</TableCell>
                  <TableCell>{row.fromDate}</TableCell>
                  <TableCell>{row.toDate}</TableCell>
                  <TableCell>{row.percentage}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <IconButton label="Edit" size="row" variant="ghost" onClick={() => openEdit(row)}><Pencil className="h-4 w-4" /></IconButton>
                      <IconButton label="Delete" size="row" variant="ghost" onClick={() => { setRows((current) => current.filter((item) => item.id !== row.id)); toast.success("Deleted"); }}><Trash2 className="h-4 w-4 text-destructive" /></IconButton>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <TablePager totalPages={totalPages} currentPage={currentPage} setPage={setPage} startIdx={startIdx} endIdx={endIdx} total={filtered.length} />
      </Card>
    </div>
  );
}

function rowValues(row: FuelRow) {
  return [row.entryCode, row.customer.name, row.vendor.name, row.product.name, row.destination.name, row.service.name, row.fromDate, row.toDate, row.percentage];
}

function nextEntryCode(rows: FuelRow[]) {
  const max = rows.reduce((acc, row) => Math.max(acc, Number(row.entryCode) || 0), 180600);
  return String(max + 1);
}

function TextField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
      {label}
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="h-9" />
    </label>
  );
}

function LookupFieldInput({ label, value, onChange, onLookupOpen }: { label: string; value: LookupPair; onChange: (value: LookupPair) => void; onLookupOpen: () => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
      {label}
      <div className="flex gap-1">
        <Input value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} className="min-w-0 flex-1" />
        <Input value={value.code} onChange={(event) => onChange({ ...value, code: event.target.value })} className="w-20" />
        <Button size="icon" variant="outline" className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90" onClick={onLookupOpen} aria-label={`Search ${label}`}>
          <Search className="h-4 w-4" />
        </Button>
      </div>
    </label>
  );
}
