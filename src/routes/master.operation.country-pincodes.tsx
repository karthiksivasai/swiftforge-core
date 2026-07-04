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
  Filter,
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

type CountryPincodeRow = {
  id: string;
  pinCode: string;
  cityName: string;
  stateName: string;
  countryName: string;
};

type CountryPincodeForm = {
  countryName: string;
  pinCode: string;
  cityName: string;
  stateName: string;
};

const US_COUNTRY = "United States of America";
const CA_COUNTRY = "Canada";

const US_SEED: Omit<CountryPincodeRow, "id">[] = [
  { pinCode: "00601", cityName: "Adjuntas", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00602", cityName: "Aguada", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00603", cityName: "Aguadilla", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00604", cityName: "Aguirre", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00605", cityName: "Aibonito", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00606", cityName: "Anasco", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00610", cityName: "Angeles", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00612", cityName: "Arecibo", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00616", cityName: "Bajadero", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00617", cityName: "Barceloneta", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00622", cityName: "Boqueron", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00623", cityName: "Cabo Rojo", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00624", cityName: "Ponce", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00627", cityName: "Camuy", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00631", cityName: "Castaner", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00637", cityName: "Sabana Grande", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00641", cityName: "Utuado", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00646", cityName: "Dorado", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00650", cityName: "Florida", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00656", cityName: "Guayanilla", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00659", cityName: "Hatillo", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00660", cityName: "Hormigueros", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00662", cityName: "Isabela", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00664", cityName: "Jayuya", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00667", cityName: "Lajas", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00669", cityName: "Lares", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00730", cityName: "Ponce", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00740", cityName: "Puerto Real", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00751", cityName: "Salinas", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00765", cityName: "Vieques", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00801", cityName: "St Thomas", stateName: "VI", countryName: US_COUNTRY },
  { pinCode: "00802", cityName: "St Thomas", stateName: "VI", countryName: US_COUNTRY },
  { pinCode: "00820", cityName: "Christiansted", stateName: "VI", countryName: US_COUNTRY },
  { pinCode: "00949", cityName: "Toa Baja", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00961", cityName: "Bayamon", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00979", cityName: "Carolina", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00983", cityName: "Carolina", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00985", cityName: "Carolina", stateName: "PR", countryName: US_COUNTRY },
  { pinCode: "00987", cityName: "Carolina", stateName: "PR", countryName: US_COUNTRY },
];

const CANADA_SUFFIXES = [
  "A4X9", "A4Y8", "A4Z3", "A5B3", "A5B4", "A5E5", "A5E6", "A5H7", "A5J3", "A5L3",
  "A5L4", "A5N5", "A5N9", "A5S9", "A5T1", "A5T2", "A5V3", "A5V4", "A5W5", "A5W6",
  "A5X7", "A5X8", "A5Y9", "A5Z1", "A5Z2", "A6A1", "A6A2", "A6B3", "A6B4", "A6C5",
  "A6C6", "A6D7", "A6D8", "A6E9", "A6F1", "A6F2", "A6G3", "A6G4", "A6H5", "A6H6",
  "A6J7", "A6J8", "A6K9", "A6L1", "A6L2", "A6M3", "A6M4", "A6N5", "A6N6", "A6P7",
  "A6P8", "A6R9", "A6S1", "A6S2", "A6T3", "A6T4", "A6V5", "A6V6", "A6W7", "A6W8",
  "A6X9", "A6Y1", "A6Y2", "A6Z3", "A6Z4", "A7A5", "A7A6", "A7B7", "A7B8", "A7C9",
];

const buildSeedRows = (): Omit<CountryPincodeRow, "id">[] => {
  const canadaRows = CANADA_SUFFIXES.map((suffix) => ({
    pinCode: `J6${suffix}`,
    cityName: "Repentigny",
    stateName: "QC",
    countryName: CA_COUNTRY,
  }));
  return [...US_SEED, ...canadaRows];
};

const SEED_ROWS = buildSeedRows();

const emptyForm = (): CountryPincodeForm => ({
  countryName: "",
  pinCode: "",
  cityName: "",
  stateName: "",
});

export const Route = createFileRoute("/master/operation/country-pincodes")({
  head: () => ({
    meta: [
      { title: "Country Pincodes — Master — Courier ERP" },
      { name: "description", content: "Manage international pin codes by country, city, and state." },
    ],
  }),
  component: CountryPincodesPage,
});

function CountryPincodesPage() {
  const [rows, setRows] = useState<CountryPincodeRow[]>(() =>
    SEED_ROWS.map((r) => ({ id: crypto.randomUUID(), ...r })),
  );
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState({ pinCode: "", cityName: "", stateName: "", countryName: "" });
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CountryPincodeRow | null>(null);
  const [form, setForm] = useState<CountryPincodeForm>(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<CountryPincodeRow | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && ![r.pinCode, r.cityName, r.stateName, r.countryName].some((v) => v.toLowerCase().includes(q))) return false;
      if (colFilters.pinCode && !r.pinCode.toLowerCase().includes(colFilters.pinCode.toLowerCase())) return false;
      if (colFilters.cityName && !r.cityName.toLowerCase().includes(colFilters.cityName.toLowerCase())) return false;
      if (colFilters.stateName && !r.stateName.toLowerCase().includes(colFilters.stateName.toLowerCase())) return false;
      if (colFilters.countryName && !r.countryName.toLowerCase().includes(colFilters.countryName.toLowerCase())) return false;
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

  const openEdit = (row: CountryPincodeRow) => {
    setEditing(row);
    setForm({
      countryName: row.countryName,
      pinCode: row.pinCode,
      cityName: row.cityName,
      stateName: row.stateName,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm());
  };

  const handleSave = () => {
    if (!form.countryName.trim()) return toast.error("Country is required");
    if (!form.pinCode.trim()) return toast.error("Pin Code is required");
    if (!form.cityName.trim()) return toast.error("City Name is required");
    if (!form.stateName.trim()) return toast.error("State Name is required");

    const payload = {
      pinCode: form.pinCode.trim(),
      cityName: form.cityName.trim(),
      stateName: form.stateName.trim(),
      countryName: form.countryName.trim(),
    };

    if (editing) {
      setRows((prev) => prev.map((r) => (r.id === editing.id ? { ...editing, ...payload } : r)));
      toast.success("Country pincode updated");
    } else {
      setRows((prev) => [{ id: crypto.randomUUID(), ...payload }, ...prev]);
      toast.success("Country pincode added");
    }
    closeForm();
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    toast.success(`Deleted ${deleteTarget.pinCode}`);
    setDeleteTarget(null);
  };

  const handleExport = () => {
    downloadCsv(
      "country-pincodes.csv",
      ["Pincode", "City Name", "State Name", "Country Name"],
      rows.map((r) => [r.pinCode, r.cityName, r.stateName, r.countryName]),
    );
    toast.success("Exported country-pincodes.csv");
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
      const imported: CountryPincodeRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const c = parseRow(lines[i]);
        if (!c[0]?.trim()) continue;
        imported.push({
          id: crypto.randomUUID(),
          pinCode: c[0].trim(),
          cityName: (c[1] || "").trim(),
          stateName: (c[2] || "").trim(),
          countryName: (c[3] || "").trim(),
        });
      }
      if (imported.length === 0) return toast.error("No valid rows found");
      setRows((prev) => [...imported, ...prev]);
      toast.success(`Imported ${imported.length} row${imported.length === 1 ? "" : "s"}`);
    } catch {
      toast.error("Failed to import file");
    }
  };

  const clearColFilters = (silent = false) => {
    setColFilters({ pinCode: "", cityName: "", stateName: "", countryName: "" });
    setPage(1);
    if (!silent) toast.success("Column filters cleared");
  };

  const handleRefresh = () => {
    setSearch("");
    clearColFilters(true);
    closeForm();
    toast.success("Refreshed");
  };

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <MasterBreadcrumb trail={["Master", "Operation", "Country Pincodes"]} />

      {showForm ? (
        <Card className="overflow-hidden border p-0">
          <div className="p-4 md:p-6">
            <Badge className="mb-4 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90">Country Pincodes</Badge>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <FieldWrapper label="Country">
                <CountryLookupInput
                  value={form.countryName}
                  onChange={(v) => setForm((f) => ({ ...f, countryName: v }))}
                />
              </FieldWrapper>
              <FieldWrapper label="Pin Code">
                <Input value={form.pinCode} onChange={(e) => setForm((f) => ({ ...f, pinCode: e.target.value }))} />
              </FieldWrapper>
              <FieldWrapper label="City Name">
                <Input value={form.cityName} onChange={(e) => setForm((f) => ({ ...f, cityName: e.target.value }))} />
              </FieldWrapper>
              <FieldWrapper label="State Name">
                <Input value={form.stateName} onChange={(e) => setForm((f) => ({ ...f, stateName: e.target.value }))} />
              </FieldWrapper>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button onClick={handleSave} className="bg-emerald-600 text-white hover:bg-emerald-600/90">Save</Button>
              <Button variant="destructive" onClick={closeForm}>Close</Button>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Country Pincodes</h1>
            <p className="text-sm text-muted-foreground">
              Manage international pin codes mapped to country, city, and state.
            </p>
          </div>

          <Card className="overflow-hidden p-0">
            <input ref={importInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportFile} />
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
              <TooltipProvider delayDuration={200}>
                <div className="flex items-center gap-1.5">
                  <IconButton label="Export" onClick={handleExport}><Download className="h-4 w-4" /></IconButton>
                  <IconButton label="Import" onClick={() => importInputRef.current?.click()}><Upload className="h-4 w-4" /></IconButton>
                  <IconButton label="Filter" onClick={() => clearColFilters()}><Filter className="h-4 w-4" /></IconButton>
                  <IconButton label="Refresh" onClick={handleRefresh}><RefreshCw className="h-4 w-4" /></IconButton>
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
                    <TableHead className="text-sidebar-foreground">Pincode</TableHead>
                    <TableHead className="text-sidebar-foreground">City Name</TableHead>
                    <TableHead className="text-sidebar-foreground">State Name</TableHead>
                    <TableHead className="text-sidebar-foreground">Country Name</TableHead>
                    <TableHead className="w-28 text-center text-sidebar-foreground">Action</TableHead>
                  </TableRow>
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    {([
                      ["pinCode", "Pincode"],
                      ["cityName", "City Name"],
                      ["stateName", "State Name"],
                      ["countryName", "Country Name"],
                    ] as const).map(([k, placeholder]) => (
                      <TableHead key={k} className="py-2">
                        <Input
                          value={colFilters[k]}
                          onChange={(e) => { setColFilters((f) => ({ ...f, [k]: e.target.value })); setPage(1); }}
                          placeholder={placeholder}
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
                      <TableCell colSpan={5} className="h-32 text-center text-sm text-muted-foreground">
                        No data available in table
                      </TableCell>
                    </TableRow>
                  ) : (
                    pageRows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.pinCode}</TableCell>
                        <TableCell>{r.cityName}</TableCell>
                        <TableCell>{r.stateName}</TableCell>
                        <TableCell>{r.countryName}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(r)} aria-label={`Edit ${r.pinCode}`}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(r)} aria-label={`Delete ${r.pinCode}`}>
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
            <AlertDialogTitle>Delete country pincode?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove pincode <span className="font-medium text-foreground">{deleteTarget?.pinCode}</span>
              {deleteTarget?.cityName ? ` (${deleteTarget.cityName})` : ""}.
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

function CountryLookupInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [lookupOpen, setLookupOpen] = useState(false);

  return (
    <>
      <div className="flex gap-1">
        <Input value={value} onChange={(e) => onChange(e.target.value)} />
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
        lookup="country"
        returnField="name"
        onSelect={(v) => onChange(v)}
      />
    </>
  );
}
