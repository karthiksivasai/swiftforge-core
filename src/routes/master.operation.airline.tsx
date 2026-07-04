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
  downloadCsv,
} from "@/components/master-table-kit";
import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import type { LookupOption } from "@/lib/master-lookups";

type LookupPair = { code: string; name: string };

type AirlineRow = {
  id: string;
  airlineName: string;
  productCode: string;
  productName: string;
};

type AirlineForm = {
  airlineName: string;
  product: LookupPair;
};

const SEED_ROWS: Omit<AirlineRow, "id">[] = [
  { airlineName: "AIR ASIA", productCode: "SPX", productName: "OTHER PACKAGE" },
  { airlineName: "CUBE PECIFIC", productCode: "SPX", productName: "OTHER PACKAGE" },
  { airlineName: "SRILANKAN AIRLINES", productCode: "SPX", productName: "OTHER PACKAGE" },
  { airlineName: "THAI AIRLINES", productCode: "SPX", productName: "OTHER PACKAGE" },
];

const emptyForm = (): AirlineForm => ({
  airlineName: "",
  product: { code: "", name: "" },
});

const rowToForm = (row: AirlineRow): AirlineForm => ({
  airlineName: row.airlineName,
  product: { code: row.productCode, name: row.productName },
});

export const Route = createFileRoute("/master/operation/airline")({
  head: () => ({
    meta: [
      { title: "Airline — Master — Courier ERP" },
      { name: "description", content: "Manage airlines and linked product types." },
    ],
  }),
  component: AirlinePage,
});

function AirlinePage() {
  const [rows, setRows] = useState<AirlineRow[]>(() =>
    SEED_ROWS.map((r) => ({ id: crypto.randomUUID(), ...r })),
  );
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState({ airlineName: "", product: "" });
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AirlineRow | null>(null);
  const [form, setForm] = useState<AirlineForm>(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<AirlineRow | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const productLabel = r.productCode || r.productName;
      if (q && ![r.airlineName, productLabel, r.productName].some((v) => String(v).toLowerCase().includes(q))) return false;
      if (colFilters.airlineName && !r.airlineName.toLowerCase().includes(colFilters.airlineName.toLowerCase())) return false;
      if (colFilters.product && ![r.productCode, r.productName].some((v) => v.toLowerCase().includes(colFilters.product.toLowerCase()))) return false;
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

  const openEdit = (row: AirlineRow) => {
    setEditing(row);
    setForm(rowToForm(row));
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm());
  };

  const handleSave = () => {
    if (!form.airlineName.trim()) return toast.error("Airline Name is required");
    if (!form.product.code.trim() && !form.product.name.trim()) return toast.error("Product is required");

    const payload = {
      airlineName: form.airlineName.trim().toUpperCase(),
      productCode: form.product.code.trim(),
      productName: form.product.name.trim(),
    };

    if (editing) {
      setRows((prev) => prev.map((r) => (r.id === editing.id ? { ...editing, ...payload } : r)));
      toast.success("Airline updated");
    } else {
      setRows((prev) => [{ id: crypto.randomUUID(), ...payload }, ...prev]);
      toast.success("Airline added");
    }
    closeForm();
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    toast.success(`Deleted ${deleteTarget.airlineName}`);
    setDeleteTarget(null);
  };

  const handleExport = () => {
    downloadCsv(
      "airlines.csv",
      ["Airlines Name", "Product Code", "Product Name"],
      rows.map((r) => [r.airlineName, r.productCode, r.productName]),
    );
    toast.success("Exported airlines.csv");
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
      const imported: AirlineRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const c = parseRow(lines[i]);
        if (!c[0]?.trim()) continue;
        imported.push({
          id: crypto.randomUUID(),
          airlineName: c[0].trim().toUpperCase(),
          productCode: (c[1] || "").trim(),
          productName: (c[2] || "").trim(),
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
    setColFilters({ airlineName: "", product: "" });
    setPage(1);
    closeForm();
    toast.success("Refreshed");
  };

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <MasterBreadcrumb trail={["Master", "Operation", "Airline"]} />

      {showForm ? (
        <Card className="overflow-hidden border p-0">
          <div className="p-4 md:p-6">
            <Badge className="mb-4 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90">Airline</Badge>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <FieldWrapper label="Airline Name" required>
                <Input value={form.airlineName} onChange={(e) => setForm((f) => ({ ...f, airlineName: e.target.value }))} />
              </FieldWrapper>
              <FieldWrapper label="Product" required>
                <ProductLookupInput
                  value={form.product}
                  onChange={(v) => setForm((f) => ({ ...f, product: v }))}
                />
              </FieldWrapper>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button onClick={handleSave} className="bg-emerald-600 text-white hover:bg-emerald-600/90">Save</Button>
              <Button variant="destructive" onClick={closeForm}>Cancel</Button>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Airline</h1>
            <p className="text-sm text-muted-foreground">
              Manage airlines and their linked product types.
            </p>
          </div>

          <Card className="overflow-hidden p-0">
            <input ref={importInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportFile} />
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
              <TooltipProvider delayDuration={200}>
                <div className="flex items-center gap-1.5">
                  <IconButton label="Export" onClick={handleExport}><Download className="h-4 w-4" /></IconButton>
                  <IconButton label="Import" onClick={() => importInputRef.current?.click()}><Upload className="h-4 w-4" /></IconButton>
                </div>
              </TooltipProvider>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Search:</span>
                <Input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="h-9 w-56"
                />
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
                    <TableHead className="text-sidebar-foreground">Airlines Name</TableHead>
                    <TableHead className="text-sidebar-foreground">Product</TableHead>
                    <TableHead className="w-28 text-center text-sidebar-foreground">Action</TableHead>
                  </TableRow>
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableHead className="py-2">
                      <Input
                        value={colFilters.airlineName}
                        onChange={(e) => { setColFilters((f) => ({ ...f, airlineName: e.target.value })); setPage(1); }}
                        placeholder="Airlines Name"
                        className="h-8"
                      />
                    </TableHead>
                    <TableHead className="py-2">
                      <Input
                        value={colFilters.product}
                        onChange={(e) => { setColFilters((f) => ({ ...f, product: e.target.value })); setPage(1); }}
                        placeholder="Product"
                        className="h-8"
                      />
                    </TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="h-32 text-center text-sm text-muted-foreground">
                        No data available in table
                      </TableCell>
                    </TableRow>
                  ) : (
                    pageRows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.airlineName}</TableCell>
                        <TableCell>{r.productCode || r.productName}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(r)} aria-label={`Edit ${r.airlineName}`}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(r)} aria-label={`Delete ${r.airlineName}`}>
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
        </>
      )}

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete airline?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <span className="font-medium text-foreground">{deleteTarget?.airlineName}</span>.
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

function ProductLookupInput({
  value,
  onChange,
}: {
  value: LookupPair;
  onChange: (v: LookupPair) => void;
}) {
  const [lookupOpen, setLookupOpen] = useState(false);

  return (
    <>
      <div className="flex gap-1">
        <Input value={value.code} onChange={(e) => onChange({ ...value, code: e.target.value })} className="w-28" placeholder="Code" />
        <Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} className="flex-1" placeholder="Name" />
        <Button
          size="icon"
          variant="outline"
          className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
          aria-label="Search"
          onClick={() => setLookupOpen(true)}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>
      <MasterLookupDialog
        open={lookupOpen}
        onOpenChange={setLookupOpen}
        lookup="product"
        returnField="code"
        onSelect={(_v, option: LookupOption) => onChange({ code: option.code, name: option.name })}
      />
    </>
  );
}
