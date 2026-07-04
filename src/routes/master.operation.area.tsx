import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  Download,
  Upload,
  RefreshCw,
  Plus,
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
import { MASTER_LOOKUPS } from "@/lib/master-lookups";

type AreaRow = {
  id: string;
  areaName: string;
  serviceCenter: string;
  destination: string;
};

type AreaForm = {
  areaName: string;
  serviceCenter: string;
  destination: string;
};

const SERVICE_CENTRES = MASTER_LOOKUPS.serviceCentre.options;

const SERVICE_CENTER_DESTINATIONS: Record<string, string> = {
  HYD: "HYDERABAD",
  BAN: "Bangalore",
  MUM: "Mumbai",
  GUN: "GUNTUR",
  CAN: "CANADA",
  SYD: "SYDNEY",
  MEL: "MELBOURNE",
  USA: "UNITED STATES OF AMERICA",
  UK: "UNITED KINGDOM",
};

const SEED_ROWS: Omit<AreaRow, "id">[] = [
  { areaName: "HYD", serviceCenter: "HYD", destination: "HYDERABAD" },
];

const emptyForm = (): AreaForm => ({
  areaName: "",
  serviceCenter: "HYD",
  destination: SERVICE_CENTER_DESTINATIONS.HYD,
});

export const Route = createFileRoute("/master/operation/area")({
  head: () => ({
    meta: [
      { title: "Area — Master — Courier ERP" },
      { name: "description", content: "Manage areas mapped to service centres and destinations." },
    ],
  }),
  component: AreaPage,
});

function AreaPage() {
  const [rows, setRows] = useState<AreaRow[]>(() =>
    SEED_ROWS.map((r) => ({ id: crypto.randomUUID(), ...r })),
  );
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState({ areaName: "", serviceCenter: "", destination: "" });
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AreaRow | null>(null);
  const [form, setForm] = useState<AreaForm>(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<AreaRow | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && ![r.areaName, r.serviceCenter, r.destination].some((v) => v.toLowerCase().includes(q))) return false;
      if (colFilters.areaName && !r.areaName.toLowerCase().includes(colFilters.areaName.toLowerCase())) return false;
      if (colFilters.serviceCenter && !r.serviceCenter.toLowerCase().includes(colFilters.serviceCenter.toLowerCase())) return false;
      if (colFilters.destination && !r.destination.toLowerCase().includes(colFilters.destination.toLowerCase())) return false;
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

  const openEdit = (row: AreaRow) => {
    setEditing(row);
    setForm({ areaName: row.areaName, serviceCenter: row.serviceCenter, destination: row.destination });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm());
  };

  const handleServiceCenterChange = (serviceCenter: string) => {
    const destination = SERVICE_CENTER_DESTINATIONS[serviceCenter] ?? form.destination;
    setForm((f) => ({ ...f, serviceCenter, destination }));
  };

  const handleSave = () => {
    if (!form.areaName.trim()) return toast.error("Area Name is required");
    if (!form.serviceCenter.trim()) return toast.error("Service Center is required");

    const payload = {
      areaName: form.areaName.trim().toUpperCase(),
      serviceCenter: form.serviceCenter.trim(),
      destination: form.destination.trim(),
    };

    if (editing) {
      setRows((prev) => prev.map((r) => (r.id === editing.id ? { ...editing, ...payload } : r)));
      toast.success("Area updated");
    } else {
      if (rows.some((r) => r.areaName.toUpperCase() === payload.areaName)) return toast.error("Area Name already exists");
      setRows((prev) => [{ id: crypto.randomUUID(), ...payload }, ...prev]);
      toast.success("Area added");
    }
    closeForm();
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    toast.success(`Deleted ${deleteTarget.areaName}`);
    setDeleteTarget(null);
  };

  const handleExport = () => {
    downloadCsv(
      "areas.csv",
      ["Area Name", "Service Center", "Destination"],
      rows.map((r) => [r.areaName, r.serviceCenter, r.destination]),
    );
    toast.success("Exported areas.csv");
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
      const imported: AreaRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const c = parseRow(lines[i]);
        if (!c[0]?.trim()) continue;
        imported.push({
          id: crypto.randomUUID(),
          areaName: c[0].trim().toUpperCase(),
          serviceCenter: (c[1] || "").trim(),
          destination: (c[2] || "").trim(),
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
    setColFilters({ areaName: "", serviceCenter: "", destination: "" });
    setPage(1);
    closeForm();
    toast.success("Refreshed");
  };

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <MasterBreadcrumb trail={["Master", "Operation", "Area"]} />

      {showForm ? (
        <Card className="overflow-hidden border p-0">
          <div className="p-4 md:p-6">
            <Badge className="mb-4 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90">Area</Badge>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <FieldWrapper label="Area Name" required>
                <Input value={form.areaName} onChange={(e) => setForm((f) => ({ ...f, areaName: e.target.value.toUpperCase() }))} />
              </FieldWrapper>
              <FieldWrapper label="Service Center" required>
                <Select value={form.serviceCenter} onValueChange={handleServiceCenterChange}>
                  <SelectTrigger><SelectValue placeholder="Select Service Center" /></SelectTrigger>
                  <SelectContent>
                    {SERVICE_CENTRES.map((sc) => (
                      <SelectItem key={sc.code} value={sc.code}>{sc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldWrapper>
              <FieldWrapper label="Destination">
                <Input value={form.destination} onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))} />
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
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Area</h1>
            <p className="text-sm text-muted-foreground">
              Manage areas mapped to service centres and destinations.
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
                    <TableHead className="text-sidebar-foreground">Area Name</TableHead>
                    <TableHead className="text-sidebar-foreground">Service Center</TableHead>
                    <TableHead className="text-sidebar-foreground">Destination</TableHead>
                    <TableHead className="w-28 text-center text-sidebar-foreground">Action</TableHead>
                  </TableRow>
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    {([
                      ["areaName", "Area Name"],
                      ["serviceCenter", "Service Center"],
                      ["destination", "Destination"],
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
                      <TableCell colSpan={4} className="h-32 text-center text-sm text-muted-foreground">
                        No data available in table
                      </TableCell>
                    </TableRow>
                  ) : (
                    pageRows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.areaName}</TableCell>
                        <TableCell>{r.serviceCenter}</TableCell>
                        <TableCell>{r.destination}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(r)} aria-label={`Edit ${r.areaName}`}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(r)} aria-label={`Delete ${r.areaName}`}>
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
            <AlertDialogTitle>Delete area?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove area <span className="font-medium text-foreground">{deleteTarget?.areaName}</span>.
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
