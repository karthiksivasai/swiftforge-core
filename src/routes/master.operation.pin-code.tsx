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
import { Checkbox } from "@/components/ui/checkbox";
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
import { cn } from "@/lib/utils";
import type { LookupKey, LookupOption } from "@/lib/master-lookups";

type LookupPair = { code: string; name: string };

type PinCodeRow = {
  id: string;
  pinCode: string;
  pinName: string;
  vendor: string;
  serviceCentre: string;
  destination: string;
  zoneCode: string;
  zoneName: string;
  stateCode: string;
  stateName: string;
  serviceable: boolean;
  pickupAvailability: boolean;
  km: string;
  oda: boolean;
};

type PinCodeForm = {
  pinCode: string;
  pinName: string;
  serviceCentre: string;
  destination: string;
  vendor: string;
  zone: LookupPair;
  state: LookupPair;
  oda: boolean;
  serviceable: boolean;
  pickupAvailability: boolean;
  km: string;
};

const emptyPair = (): LookupPair => ({ code: "", name: "" });

const emptyForm = (): PinCodeForm => ({
  pinCode: "",
  pinName: "",
  serviceCentre: "",
  destination: "",
  vendor: "",
  zone: emptyPair(),
  state: emptyPair(),
  oda: false,
  serviceable: true,
  pickupAvailability: true,
  km: "",
});

const yesNoLabel = (value: boolean) => (value ? "Yes" : "No");

const rowToForm = (row: PinCodeRow): PinCodeForm => ({
  pinCode: row.pinCode,
  pinName: row.pinName,
  serviceCentre: row.serviceCentre,
  destination: row.destination,
  vendor: row.vendor,
  zone: { code: row.zoneCode, name: row.zoneName },
  state: { code: row.stateCode, name: row.stateName },
  oda: row.oda,
  serviceable: row.serviceable,
  pickupAvailability: row.pickupAvailability,
  km: row.km,
});

export const Route = createFileRoute("/master/operation/pin-code")({
  head: () => ({
    meta: [
      { title: "Pin Code — Master — Courier ERP" },
      { name: "description", content: "Manage pin codes with service centre routes, serviceability, and ODA settings." },
    ],
  }),
  component: PinCodePage,
});

function PinCodePage() {
  const [rows, setRows] = useState<PinCodeRow[]>([]);
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState({
    pinCode: "",
    pinName: "",
    vendor: "",
    serviceCentre: "",
    destination: "",
    serviceable: "",
    km: "",
    oda: "",
  });
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PinCodeRow | null>(null);
  const [form, setForm] = useState<PinCodeForm>(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<PinCodeRow | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && ![
        r.pinCode, r.pinName, r.vendor, r.serviceCentre, r.destination,
        yesNoLabel(r.serviceable), r.km, yesNoLabel(r.oda),
      ].some((v) => String(v).toLowerCase().includes(q))) return false;
      if (colFilters.pinCode && !r.pinCode.toLowerCase().includes(colFilters.pinCode.toLowerCase())) return false;
      if (colFilters.pinName && !r.pinName.toLowerCase().includes(colFilters.pinName.toLowerCase())) return false;
      if (colFilters.vendor && !r.vendor.toLowerCase().includes(colFilters.vendor.toLowerCase())) return false;
      if (colFilters.serviceCentre && !r.serviceCentre.toLowerCase().includes(colFilters.serviceCentre.toLowerCase())) return false;
      if (colFilters.destination && !r.destination.toLowerCase().includes(colFilters.destination.toLowerCase())) return false;
      if (colFilters.serviceable && !yesNoLabel(r.serviceable).toLowerCase().includes(colFilters.serviceable.toLowerCase())) return false;
      if (colFilters.km && !r.km.toLowerCase().includes(colFilters.km.toLowerCase())) return false;
      if (colFilters.oda && !yesNoLabel(r.oda).toLowerCase().includes(colFilters.oda.toLowerCase())) return false;
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

  const openEdit = (row: PinCodeRow) => {
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
    if (!form.pinCode.trim()) return toast.error("Pin Code is required");
    if (!form.pinName.trim()) return toast.error("Pin Name is required");

    const payload: Omit<PinCodeRow, "id"> = {
      pinCode: form.pinCode.trim(),
      pinName: form.pinName.trim(),
      vendor: form.vendor.trim(),
      serviceCentre: form.serviceCentre.trim(),
      destination: form.destination.trim(),
      zoneCode: form.zone.code.trim(),
      zoneName: form.zone.name.trim(),
      stateCode: form.state.code.trim(),
      stateName: form.state.name.trim(),
      serviceable: form.serviceable,
      pickupAvailability: form.pickupAvailability,
      km: form.km.trim(),
      oda: form.oda,
    };

    if (editing) {
      setRows((prev) => prev.map((r) => (r.id === editing.id ? { ...editing, ...payload } : r)));
      toast.success("Pin code updated");
    } else {
      if (rows.some((r) => r.pinCode === payload.pinCode)) return toast.error("Pin Code already exists");
      setRows((prev) => [{ id: crypto.randomUUID(), ...payload }, ...prev]);
      toast.success("Pin code added");
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
      "pin-codes.csv",
      ["Pin Code", "Pin Name", "Vendor", "Service Centre", "Destination", "Zone Code", "Zone Name", "State Code", "State Name", "Serviceable", "Pickup Availability", "KM", "ODA"],
      rows.map((r) => [
        r.pinCode, r.pinName, r.vendor, r.serviceCentre, r.destination,
        r.zoneCode, r.zoneName, r.stateCode, r.stateName,
        yesNoLabel(r.serviceable), yesNoLabel(r.pickupAvailability), r.km, yesNoLabel(r.oda),
      ]),
    );
    toast.success("Exported pin-codes.csv");
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
      const imported: PinCodeRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const c = parseRow(lines[i]);
        if (!c[0]?.trim()) continue;
        imported.push({
          id: crypto.randomUUID(),
          pinCode: c[0].trim(),
          pinName: (c[1] || "").trim(),
          vendor: (c[2] || "").trim(),
          serviceCentre: (c[3] || "").trim(),
          destination: (c[4] || "").trim(),
          zoneCode: (c[5] || "").trim(),
          zoneName: (c[6] || "").trim(),
          stateCode: (c[7] || "").trim(),
          stateName: (c[8] || "").trim(),
          serviceable: (c[9] || "Yes").trim().toLowerCase() !== "no",
          pickupAvailability: (c[10] || "Yes").trim().toLowerCase() !== "no",
          km: (c[11] || "").trim(),
          oda: (c[12] || "").trim().toLowerCase() === "yes",
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
    setColFilters({ pinCode: "", pinName: "", vendor: "", serviceCentre: "", destination: "", serviceable: "", km: "", oda: "" });
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
      <MasterBreadcrumb trail={["Master", "Operation", "Pin Code"]} />

      {showForm ? (
        <Card className="overflow-hidden border p-0">
          <div className="p-4 md:p-6">
            <Badge className="mb-4 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90">Route</Badge>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <FieldWrapper label="Pin Code">
                <Input value={form.pinCode} onChange={(e) => setForm((f) => ({ ...f, pinCode: e.target.value }))} />
              </FieldWrapper>
              <FieldWrapper label="Pin Name">
                <Input value={form.pinName} onChange={(e) => setForm((f) => ({ ...f, pinName: e.target.value }))} />
              </FieldWrapper>
              <FieldWrapper label="Service Center">
                <LookupInput lookup="serviceCentre" value={form.serviceCentre} onChange={(v) => setForm((f) => ({ ...f, serviceCentre: v }))} />
              </FieldWrapper>
              <FieldWrapper label="Destination">
                <LookupInput lookup="destination" value={form.destination} onChange={(v) => setForm((f) => ({ ...f, destination: v }))} />
              </FieldWrapper>

              <FieldWrapper label="Vendor">
                <LookupInput lookup="vendor" value={form.vendor} onChange={(v) => setForm((f) => ({ ...f, vendor: v }))} />
              </FieldWrapper>
              <FieldWrapper label="Zone">
                <LookupPairInput lookup="zone" value={form.zone} onChange={(v) => setForm((f) => ({ ...f, zone: v }))} />
              </FieldWrapper>
              <FieldWrapper label="State">
                <LookupPairInput lookup="state" value={form.state} onChange={(v) => setForm((f) => ({ ...f, state: v }))} />
              </FieldWrapper>
              <div className="flex flex-col justify-end gap-1.5">
                <div className="flex h-9 items-center gap-2">
                  <Checkbox
                    id="oda"
                    checked={form.oda}
                    onCheckedChange={(c) => setForm((f) => ({ ...f, oda: c === true }))}
                  />
                  <label htmlFor="oda" className="text-sm text-muted-foreground">ODA</label>
                </div>
              </div>

              <YesNoField label="Servicable" value={form.serviceable} onChange={(v) => setForm((f) => ({ ...f, serviceable: v }))} />
              <YesNoField label="Pickup Availability" value={form.pickupAvailability} onChange={(v) => setForm((f) => ({ ...f, pickupAvailability: v }))} />
              <FieldWrapper label="KM From Service Center">
                <Input value={form.km} onChange={(e) => setForm((f) => ({ ...f, km: e.target.value }))} inputMode="decimal" />
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
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Pin Code</h1>
            <p className="text-sm text-muted-foreground">
              Manage pin codes with service centre routes, serviceability, and ODA settings.
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
                    <TableHead className="text-sidebar-foreground">Pin Code</TableHead>
                    <TableHead className="text-sidebar-foreground">Pin Name</TableHead>
                    <TableHead className="text-sidebar-foreground">Vendor</TableHead>
                    <TableHead className="text-sidebar-foreground">Service Centre</TableHead>
                    <TableHead className="text-sidebar-foreground">Destination</TableHead>
                    <TableHead className="text-sidebar-foreground">Serviceable</TableHead>
                    <TableHead className="text-sidebar-foreground text-right">KM</TableHead>
                    <TableHead className="text-sidebar-foreground">ODA</TableHead>
                    <TableHead className="w-28 text-center text-sidebar-foreground">Action</TableHead>
                  </TableRow>
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    {([
                      ["pinCode", "Pin Code"],
                      ["pinName", "Pin Name"],
                      ["vendor", "Vendor"],
                      ["serviceCentre", "Service Centre"],
                      ["destination", "Destination"],
                      ["serviceable", "Serviceable"],
                      ["km", "KM"],
                      ["oda", "ODA"],
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
                      <TableCell colSpan={9} className="h-32 text-center text-sm text-muted-foreground">
                        No data available in table
                      </TableCell>
                    </TableRow>
                  ) : (
                    pageRows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.pinCode}</TableCell>
                        <TableCell>{r.pinName}</TableCell>
                        <TableCell>{r.vendor || "—"}</TableCell>
                        <TableCell>{r.serviceCentre || "—"}</TableCell>
                        <TableCell>{r.destination || "—"}</TableCell>
                        <TableCell>{yesNoLabel(r.serviceable)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{r.km || "—"}</TableCell>
                        <TableCell>{yesNoLabel(r.oda)}</TableCell>
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
            <AlertDialogTitle>Delete pin code?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <span className="font-medium text-foreground">{deleteTarget?.pinCode}</span>
              {deleteTarget?.pinName ? ` (${deleteTarget.pinName})` : ""} from the pin code master.
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

function YesNoField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <FieldWrapper label={label}>
      <div className="flex h-9 overflow-hidden rounded-md border">
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "h-9 flex-1 rounded-none",
            value
              ? "bg-emerald-600 text-white hover:bg-emerald-600/90 hover:text-white"
              : "text-muted-foreground hover:bg-muted/60",
          )}
          onClick={() => onChange(true)}
        >
          Yes
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "h-9 flex-1 rounded-none border-l",
            !value
              ? "bg-emerald-600 text-white hover:bg-emerald-600/90 hover:text-white"
              : "text-muted-foreground hover:bg-muted/60",
          )}
          onClick={() => onChange(false)}
        >
          No
        </Button>
      </div>
    </FieldWrapper>
  );
}

function LookupInput({
  value,
  onChange,
  lookup,
}: {
  value: string;
  onChange: (v: string) => void;
  lookup: LookupKey;
}) {
  const [lookupOpen, setLookupOpen] = useState(false);
  return (
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
      <MasterLookupDialog
        open={lookupOpen}
        onOpenChange={setLookupOpen}
        lookup={lookup}
        returnField="name"
        onSelect={(v) => onChange(v)}
      />
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
      <MasterLookupDialog
        open={lookupOpen}
        onOpenChange={setLookupOpen}
        lookup={lookup}
        returnField="code"
        onSelect={(_v, option: LookupOption) => onChange({ code: option.code, name: option.name })}
      />
    </div>
  );
}
