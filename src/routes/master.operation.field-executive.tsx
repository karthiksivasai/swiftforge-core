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
import { MASTER_LOOKUPS, type LookupKey, type LookupOption } from "@/lib/master-lookups";

type LookupPair = { code: string; name: string };

type FieldExecutiveRow = {
  id: string;
  code: string;
  name: string;
  mobile: string;
  pickupCharge: string;
  deliveryCharge: string;
  serviceCenter: string;
  destinationCode: string;
  destinationName: string;
  tldBatchNo: string;
  inActive: boolean;
};

type FieldExecutiveForm = {
  code: string;
  name: string;
  mobile: string;
  pickupCharge: string;
  deliveryCharge: string;
  serviceCenter: string;
  destination: LookupPair;
  tldBatchNo: string;
  inActive: boolean;
};

const SERVICE_CENTRES = MASTER_LOOKUPS.serviceCentre.options;

const SEED_ROWS: Omit<FieldExecutiveRow, "id">[] = [
  { code: "AKHIL", name: "AKHIL CW", mobile: "", pickupCharge: "0", deliveryCharge: "0", serviceCenter: "HYD", destinationCode: "HYD", destinationName: "HYDERABAD", tldBatchNo: "", inActive: false },
  { code: "AKSHITH", name: "AKSHITH", mobile: "7997639711", pickupCharge: "0", deliveryCharge: "0", serviceCenter: "HYD", destinationCode: "HYD", destinationName: "HYDERABAD", tldBatchNo: "", inActive: false },
  { code: "ANIL", name: "ANIL CW", mobile: "9876543210", pickupCharge: "0", deliveryCharge: "0", serviceCenter: "HYD", destinationCode: "HYD", destinationName: "HYDERABAD", tldBatchNo: "", inActive: false },
  { code: "KRISHNA", name: "KRISHNA", mobile: "9123456789", pickupCharge: "0", deliveryCharge: "0", serviceCenter: "BAN", destinationCode: "BLR", destinationName: "Bangalore", tldBatchNo: "", inActive: false },
  { code: "PAVAN", name: "PAVAN CW", mobile: "", pickupCharge: "0", deliveryCharge: "0", serviceCenter: "MUM", destinationCode: "BOM", destinationName: "Mumbai", tldBatchNo: "", inActive: false },
  { code: "RAJU", name: "RAJU", mobile: "9988776655", pickupCharge: "0", deliveryCharge: "0", serviceCenter: "HYD", destinationCode: "HYD", destinationName: "HYDERABAD", tldBatchNo: "", inActive: false },
  { code: "SURESH", name: "SURESH CW", mobile: "9012345678", pickupCharge: "0", deliveryCharge: "0", serviceCenter: "GUN", destinationCode: "HYD", destinationName: "HYDERABAD", tldBatchNo: "", inActive: false },
  { code: "VIJAY", name: "VIJAY", mobile: "8899001122", pickupCharge: "0", deliveryCharge: "0", serviceCenter: "HYD", destinationCode: "HYD", destinationName: "HYDERABAD", tldBatchNo: "", inActive: false },
];

const emptyForm = (): FieldExecutiveForm => ({
  code: "",
  name: "",
  mobile: "",
  pickupCharge: "0",
  deliveryCharge: "0",
  serviceCenter: "HYD",
  destination: { code: "HYD", name: "HYDERABAD" },
  tldBatchNo: "",
  inActive: false,
});

const rowToForm = (row: FieldExecutiveRow): FieldExecutiveForm => ({
  code: row.code,
  name: row.name,
  mobile: row.mobile,
  pickupCharge: row.pickupCharge,
  deliveryCharge: row.deliveryCharge,
  serviceCenter: row.serviceCenter,
  destination: { code: row.destinationCode, name: row.destinationName },
  tldBatchNo: row.tldBatchNo,
  inActive: row.inActive,
});

const inActiveLabel = (inActive: boolean) => (inActive ? "YES" : "NO");

export const Route = createFileRoute("/master/operation/field-executive")({
  head: () => ({
    meta: [
      { title: "Field Executive — Master — Courier ERP" },
      { name: "description", content: "Manage field executives with service centre, destination, and charge settings." },
    ],
  }),
  component: FieldExecutivePage,
});

function FieldExecutivePage() {
  const [rows, setRows] = useState<FieldExecutiveRow[]>(() =>
    SEED_ROWS.map((r) => ({ id: crypto.randomUUID(), ...r })),
  );
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState({ code: "", name: "", mobile: "", inActive: "" });
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FieldExecutiveRow | null>(null);
  const [form, setForm] = useState<FieldExecutiveForm>(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<FieldExecutiveRow | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && ![r.code, r.name, r.mobile, inActiveLabel(r.inActive)].some((v) => String(v).toLowerCase().includes(q))) return false;
      if (colFilters.code && !r.code.toLowerCase().includes(colFilters.code.toLowerCase())) return false;
      if (colFilters.name && !r.name.toLowerCase().includes(colFilters.name.toLowerCase())) return false;
      if (colFilters.mobile && !r.mobile.toLowerCase().includes(colFilters.mobile.toLowerCase())) return false;
      if (colFilters.inActive && !inActiveLabel(r.inActive).toLowerCase().includes(colFilters.inActive.toLowerCase())) return false;
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

  const openEdit = (row: FieldExecutiveRow) => {
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
    if (!form.code.trim()) return toast.error("Code is required");
    if (!form.name.trim()) return toast.error("Name is required");
    if (!form.serviceCenter.trim()) return toast.error("Service Center is required");
    if (!form.destination.code.trim() && !form.destination.name.trim()) return toast.error("Destination is required");

    const payload: Omit<FieldExecutiveRow, "id"> = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      mobile: form.mobile.trim(),
      pickupCharge: form.pickupCharge.trim() || "0",
      deliveryCharge: form.deliveryCharge.trim() || "0",
      serviceCenter: form.serviceCenter,
      destinationCode: form.destination.code.trim(),
      destinationName: form.destination.name.trim(),
      tldBatchNo: form.tldBatchNo.trim(),
      inActive: form.inActive,
    };

    if (editing) {
      setRows((prev) => prev.map((r) => (r.id === editing.id ? { ...editing, ...payload } : r)));
      toast.success("Field executive updated");
    } else {
      if (rows.some((r) => r.code.toUpperCase() === payload.code)) return toast.error("Code already exists");
      setRows((prev) => [{ id: crypto.randomUUID(), ...payload }, ...prev]);
      toast.success("Field executive added");
    }
    closeForm();
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    toast.success(`Deleted ${deleteTarget.code}`);
    setDeleteTarget(null);
  };

  const handleExport = () => {
    downloadCsv(
      "field-executives.csv",
      ["Code", "Name", "Mobile", "Pickup Charge", "Delivery Charge", "Service Center", "Destination Code", "Destination Name", "TLD Batch No", "In-Active"],
      rows.map((r) => [
        r.code,
        r.name,
        r.mobile,
        r.pickupCharge,
        r.deliveryCharge,
        r.serviceCenter,
        r.destinationCode,
        r.destinationName,
        r.tldBatchNo,
        inActiveLabel(r.inActive),
      ]),
    );
    toast.success("Exported field-executives.csv");
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
      const imported: FieldExecutiveRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const c = parseRow(lines[i]);
        if (!c[0]?.trim()) continue;
        imported.push({
          id: crypto.randomUUID(),
          code: c[0].trim().toUpperCase(),
          name: (c[1] || "").trim(),
          mobile: (c[2] || "").trim(),
          pickupCharge: (c[3] || "0").trim(),
          deliveryCharge: (c[4] || "0").trim(),
          serviceCenter: (c[5] || "HYD").trim(),
          destinationCode: (c[6] || "").trim(),
          destinationName: (c[7] || "").trim(),
          tldBatchNo: (c[8] || "").trim(),
          inActive: (c[9] || "").trim().toUpperCase() === "YES",
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
    setColFilters({ code: "", name: "", mobile: "", inActive: "" });
    setPage(1);
    closeForm();
    toast.success("Refreshed");
  };

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <MasterBreadcrumb trail={["Master", "Operation", "Field Executive"]} />

      {showForm ? (
        <Card className="overflow-hidden border p-0">
          <div className="p-4 md:p-6">
            <Badge className="mb-4 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90">Field Executive</Badge>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <FieldWrapper label="Code" required>
                <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
              </FieldWrapper>
              <FieldWrapper label="Name" required>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </FieldWrapper>
              <FieldWrapper label="Mobile No.">
                <Input value={form.mobile} onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))} inputMode="tel" />
              </FieldWrapper>
              <FieldWrapper label="Pickup Charge">
                <Input value={form.pickupCharge} onChange={(e) => setForm((f) => ({ ...f, pickupCharge: e.target.value }))} inputMode="decimal" />
              </FieldWrapper>

              <FieldWrapper label="Delivery Charge">
                <Input value={form.deliveryCharge} onChange={(e) => setForm((f) => ({ ...f, deliveryCharge: e.target.value }))} inputMode="decimal" />
              </FieldWrapper>
              <FieldWrapper label="Service Center" required>
                <Select value={form.serviceCenter} onValueChange={(v) => setForm((f) => ({ ...f, serviceCenter: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select Service Center" /></SelectTrigger>
                  <SelectContent>
                    {SERVICE_CENTRES.map((sc) => (
                      <SelectItem key={sc.code} value={sc.code}>{sc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldWrapper>
              <FieldWrapper label="Destination" required>
                <LookupPairInput
                  lookup="destination"
                  value={form.destination}
                  onChange={(v) => setForm((f) => ({ ...f, destination: v }))}
                />
              </FieldWrapper>
              <FieldWrapper label="TLD Batch No">
                <Input value={form.tldBatchNo} onChange={(e) => setForm((f) => ({ ...f, tldBatchNo: e.target.value }))} />
              </FieldWrapper>

              <div className="flex flex-col justify-end gap-1.5">
                <div className="flex h-9 items-center gap-2">
                  <Checkbox
                    id="in-active"
                    checked={form.inActive}
                    onCheckedChange={(c) => setForm((f) => ({ ...f, inActive: c === true }))}
                  />
                  <label htmlFor="in-active" className="text-sm text-muted-foreground">In-Active</label>
                </div>
              </div>
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
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Field Executive</h1>
            <p className="text-sm text-muted-foreground">
              Manage field executives assigned to service centres and destinations.
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
                    <TableHead className="text-sidebar-foreground">Field Executive Code</TableHead>
                    <TableHead className="text-sidebar-foreground">Field Executive Name</TableHead>
                    <TableHead className="text-sidebar-foreground">Mobile</TableHead>
                    <TableHead className="text-sidebar-foreground">In-Active</TableHead>
                    <TableHead className="w-28 text-center text-sidebar-foreground">Action</TableHead>
                  </TableRow>
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    {(["code", "name", "mobile", "inActive"] as const).map((k) => (
                      <TableHead key={k} className="py-2">
                        <Input
                          value={colFilters[k]}
                          onChange={(e) => { setColFilters((f) => ({ ...f, [k]: e.target.value })); setPage(1); }}
                          placeholder={k === "code" ? "Field Executive Code" : k === "name" ? "Field Executive Name" : k === "mobile" ? "Mobile" : "In-Active"}
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
                        <TableCell className="font-medium">{r.code}</TableCell>
                        <TableCell>{r.name}</TableCell>
                        <TableCell>{r.mobile || "—"}</TableCell>
                        <TableCell>{inActiveLabel(r.inActive)}</TableCell>
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
        </>
      )}

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete field executive?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <span className="font-medium text-foreground">{deleteTarget?.code}</span>
              {deleteTarget?.name ? ` (${deleteTarget.name})` : ""} from the field executive master.
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

function LookupPairInput({
  value,
  onChange,
  lookup,
}: {
  value: LookupPair;
  onChange: (v: LookupPair) => void;
  lookup: LookupKey;
}) {
  const [lookupOpen, setLookupOpen] = useState(false);

  return (
    <div className="flex gap-1">
      <Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} className="flex-1" placeholder="Name" />
      <Input value={value.code} onChange={(e) => onChange({ ...value, code: e.target.value })} className="w-28" placeholder="Code" />
      <Button
        size="icon"
        variant="outline"
        className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
        aria-label="Search"
        onClick={() => setLookupOpen(true)}
      >
        <Search className="h-4 w-4" />
      </Button>
      <MasterLookupDialog
        open={lookupOpen}
        onOpenChange={setLookupOpen}
        lookup={lookup}
        returnField="code"
        onSelect={(_v, option: LookupOption) => onChange({ code: option.code, name: option.name.toUpperCase() })}
      />
    </div>
  );
}
