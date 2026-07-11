import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { IconButton, MasterBreadcrumb, PAGE_SIZE, TablePager } from "@/components/master-table-kit";
import { MASTER_LOOKUPS } from "@/lib/master-lookups";

type TaxRow = {
  id: string;
  customer: string;
  product: string;
  fromDate: string;
  toDate: string;
  igst: string;
  cgst: string;
  sgst: string;
};

type TaxForm = Omit<TaxRow, "id">;

const todayIso = () => new Date().toISOString().slice(0, 10);
const ddmmyyyyToIso = (value: string) => {
  const [day, month, year] = value.split("/");
  return year && month && day ? `${year}-${month}-${day}` : value;
};
const isoToDdmmyyyy = (value: string) => {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
};

const unique = (values: string[]) => Array.from(new Set(values));

const customerOptions = unique([
  "CARD",
  "DRS",
  "CARD 2",
  ...MASTER_LOOKUPS.customer.options.map((option) => `${option.name}-${option.code}`),
]);
const productOptions = unique([
  "ADOX",
  "ASPX",
  "DOCS",
  "NDOX",
  "CARD",
  "DOX",
  "ENV",
  "SPX",
  ...MASTER_LOOKUPS.product.options.map((option) => option.name),
]);

const seedRows: TaxRow[] = [
  ["CARD", "ADOX", "01/08/2023", "31/12/2030", "0.00", "0.00", "0.00"],
  ["CARD", "ASPX", "01/09/2023", "31/12/2030", "0.00", "0.00", "0.00"],
  ["CARD", "DOCS", "01/12/2025", "18/12/2030", "0.00", "0.00", "0.00"],
  ["CARD", "NDOX", "01/12/2025", "18/12/2030", "0.00", "0.00", "0.00"],
  ["CARD", "CARD", "29/07/2023", "29/07/2029", "18.00", "9.00", "9.00"],
  ["DRS", "DOX", "25/10/2025", "29/10/2026", "0.00", "0.00", "0.00"],
  ["DRS", "ENV", "25/10/2025", "29/10/2026", "0.00", "0.00", "0.00"],
  ["DRS", "SPX", "25/10/2025", "25/10/2026", "0.00", "0.00", "0.00"],
  ["CARD 2", "CARD", "23/09/2023", "31/12/2024", "0.00", "0.00", "0.00"],
].map(([customer, product, fromDate, toDate, igst, cgst, sgst], index) => ({
  id: String(index + 1),
  customer,
  product,
  fromDate,
  toDate,
  igst,
  cgst,
  sgst,
}));

const emptyForm = (): TaxForm => ({
  customer: "",
  product: "",
  fromDate: todayIso(),
  toDate: todayIso(),
  igst: "",
  cgst: "",
  sgst: "",
});

export const Route = createFileRoute("/utility/tax-charges-setup/tax-setup")({
  head: () => ({
    meta: [
      { title: "Tax Setup — Utility — Courier ERP" },
      { name: "description", content: "Configure IGST, CGST, and SGST by customer and product." },
    ],
  }),
  component: TaxSetupPage,
});

function TaxSetupPage() {
  const [rows, setRows] = useState<TaxRow[]>(seedRows);
  const [screen, setScreen] = useState<"list" | "form">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TaxForm>(emptyForm());
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    customer: "",
    product: "",
    fromDate: "",
    toDate: "",
    igst: "",
    cgst: "",
    sgst: "",
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const values = [row.customer, row.product, row.fromDate, row.toDate, row.igst, row.cgst, row.sgst];
      if (q && !values.some((value) => value.toLowerCase().includes(q))) return false;
      return (Object.keys(filters) as (keyof typeof filters)[]).every((key) => {
        return !filters[key] || row[key].toLowerCase().includes(filters[key].toLowerCase());
      });
    });
  }, [filters, rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const startIdx = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const patch = (updates: Partial<TaxForm>) => setForm((current) => ({ ...current, ...updates }));

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setScreen("form");
  };

  const openEdit = (row: TaxRow) => {
    setEditingId(row.id);
    setForm({
      customer: row.customer,
      product: row.product,
      fromDate: ddmmyyyyToIso(row.fromDate),
      toDate: ddmmyyyyToIso(row.toDate),
      igst: row.igst,
      cgst: row.cgst,
      sgst: row.sgst,
    });
    setScreen("form");
  };

  const save = () => {
    if (!form.customer) return toast.error("Customer is required");
    if (!form.product) return toast.error("Product is required");
    if (!form.fromDate) return toast.error("From Date is required");
    if (!form.toDate) return toast.error("To Date is required");

    const nextRow: TaxRow = {
      id: editingId ?? crypto.randomUUID(),
      ...form,
      fromDate: isoToDdmmyyyy(form.fromDate),
      toDate: isoToDdmmyyyy(form.toDate),
      igst: form.igst || "0.00",
      cgst: form.cgst || "0.00",
      sgst: form.sgst || "0.00",
    };

    setRows((current) => (editingId ? current.map((row) => (row.id === editingId ? nextRow : row)) : [nextRow, ...current]));
    setScreen("list");
    toast.success(editingId ? "Tax setup updated" : "Tax setup saved");
  };

  if (screen === "form") {
    return (
      <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
        <MasterBreadcrumb trail={["Utility", "Tax / Charges Setup", "Tax Setup"]} />

        <Card className="min-w-0 border p-4">
          <div className="grid gap-x-3 gap-y-2 lg:grid-cols-4">
            <SelectField label="Customer" value={form.customer} placeholder="Select Customer" options={customerOptions} onChange={(customer) => patch({ customer })} />
            <SelectField label="Product" value={form.product} placeholder="Select Product" options={productOptions} onChange={(product) => patch({ product })} />
            <TextField label="From Date" type="date" value={form.fromDate} onChange={(fromDate) => patch({ fromDate })} required />
            <TextField label="To Date" type="date" value={form.toDate} onChange={(toDate) => patch({ toDate })} required />
            <TextField label="IGST" value={form.igst} onChange={(igst) => patch({ igst })} />
            <TextField label="CGST" value={form.cgst} onChange={(cgst) => patch({ cgst })} />
            <TextField label="SGST" value={form.sgst} onChange={(sgst) => patch({ sgst })} />
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
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Utility", "Tax / Charges Setup", "Tax Setup"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Tax Setup</h1>
        <p className="text-sm text-muted-foreground">Configure tax percentages by customer and product.</p>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-1.5">
            <IconButton label="Export" onClick={() => toast.success("Export queued")}><Download className="h-4 w-4" /></IconButton>
            <IconButton label="Refresh" onClick={() => { setSearch(""); setFilters({ customer: "", product: "", fromDate: "", toDate: "", igst: "", cgst: "", sgst: "" }); setPage(1); toast.success("Refreshed"); }}><RefreshCw className="h-4 w-4" /></IconButton>
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
                {["Customer", "Product", "From Date", "To Date", "IGST", "CGST", "SGST", "Action"].map((heading) => (
                  <TableHead key={heading} className="whitespace-nowrap text-sidebar-foreground">
                    <span className="flex items-center justify-between gap-2">{heading}{heading !== "Action" ? <span className="text-xs">⇅</span> : null}</span>
                  </TableHead>
                ))}
              </TableRow>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                {(["customer", "product", "fromDate", "toDate", "igst", "cgst", "sgst"] as const).map((key) => (
                  <TableHead key={key} className="py-2">
                    <Input
                      value={filters[key]}
                      onChange={(event) => {
                        setFilters((current) => ({ ...current, [key]: event.target.value }));
                        setPage(1);
                      }}
                      placeholder={key === "fromDate" ? "From Date" : key === "toDate" ? "To Date" : ["igst", "cgst", "sgst"].includes(key) ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1)}
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
                  <TableCell>{row.customer}</TableCell>
                  <TableCell>{row.product}</TableCell>
                  <TableCell>{row.fromDate}</TableCell>
                  <TableCell>{row.toDate}</TableCell>
                  <TableCell>{row.igst}</TableCell>
                  <TableCell>{row.cgst}</TableCell>
                  <TableCell>{row.sgst}</TableCell>
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

function TextField({ label, value, onChange, type = "text", required }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
      {label}{required ? <span className="sr-only">required</span> : null}
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="h-9" />
    </label>
  );
}

function SelectField({ label, value, onChange, options, placeholder }: { label: string; value: string; onChange: (value: string) => void; options: string[]; placeholder: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
      {label}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
