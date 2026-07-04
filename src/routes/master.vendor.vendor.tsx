import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  Copy,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import type { LookupKey, LookupOption } from "@/lib/master-lookups";

type VendorPick = { code: string; name: string };

const emptyVendorPick = (): VendorPick => ({ code: "", name: "" });

type Status = "Active" | "In-Active";

type VendorRow = {
  id: string;
  code: string;
  name: string;
  contactPerson: string;
  address1: string;
  address2: string;
  pinCode: string;
  city: string;
  state: string;
  phone1: string;
  phone2: string;
  fax: string;
  mobile: string;
  email: string;
  website: string;
  gstNo: string;
  fuelHead: string;
  currency: string;
  origin: string;
  mode: string;
  vendorZip: string;
  status: Status;
  global: boolean;
  gst: boolean;
  volumetricWeightRoundOff: boolean;
};

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED"] as const;
const MODES = ["Air", "Surface", "Train", "Courier", "Express"] as const;

function seedVendor(id: string, code: string, name: string): VendorRow {
  return {
    id,
    code,
    name,
    contactPerson: "",
    address1: "",
    address2: "",
    pinCode: "",
    city: "",
    state: "",
    phone1: "",
    phone2: "",
    fax: "",
    mobile: "",
    email: "",
    website: "",
    gstNo: "",
    fuelHead: "",
    currency: "",
    origin: "",
    mode: "",
    vendorZip: "",
    status: "Active",
    global: false,
    gst: false,
    volumetricWeightRoundOff: false,
  };
}

/** Seed data aligned with the legacy Vendor master (28 entries). */
const SEED: VendorRow[] = [
  seedVendor("1", "AIC", "ATLANTIC INTERNATIONAL COURIER"),
  seedVendor("2", "ARX", "ARAMEX"),
  seedVendor("3", "BLUE", "BLUEDART"),
  seedVendor("4", "CAPI", "CAPTAIN INDIA"),
  seedVendor("5", "COUR", "COURIERWALA"),
  seedVendor("6", "DHE", "FEDEX DL"),
  seedVendor("7", "DHL", "DHL EXPRESS (I) PVT LTD"),
  seedVendor("8", "DHL1", "DHL LSPS"),
  seedVendor("9", "DHLS", "DHL SPECIAL"),
  seedVendor("10", "DPD", "DPD2"),
  seedVendor("11", "DTAU", "DTDC AUSTRALIA"),
  seedVendor("12", "DTDC", "DPD UK"),
  seedVendor("13", "DTMA", "DTDC MALAYSIA"),
  seedVendor("14", "DTNZ", "DTDC NEWZEALAND"),
  seedVendor("15", "ECAR", "E CARGO"),
  seedVendor("16", "FDEX", "FEDEX 1"),
  seedVendor("17", "FDX", "FEDERAL EXPRESS CORPORATION"),
  seedVendor("18", "FEDE", "FEDEX"),
  seedVendor("19", "GST", "GST BILL"),
  seedVendor("20", "ICL", "ICL"),
  seedVendor("21", "SWWE", "SKYNET"),
  seedVendor("22", "UPS", "UNITED PARCEL SERVICE"),
  seedVendor("23", "UPS2", "UNITED PARCEL SERVICES"),
  seedVendor("24", "UPS3", "UNITED PARCEL SERVICESS"),
  seedVendor("25", "USAF", "USA FedEx"),
  seedVendor("26", "WFEM", "WORLDWIDE EFFECTIVE FREIGHT MANAGEMENT"),
  seedVendor("27", "WFT", "WORLD FRIEGT TRANSPORTATION"),
  seedVendor("28", "WWEC", "WORLDWIDE EXPRESS COURIER"),
];

const emptyRow = (): Omit<VendorRow, "id"> => ({
  code: "",
  name: "",
  contactPerson: "",
  address1: "",
  address2: "",
  pinCode: "",
  city: "",
  state: "",
  phone1: "",
  phone2: "",
  fax: "",
  mobile: "",
  email: "",
  website: "",
  gstNo: "",
  fuelHead: "",
  currency: "",
  origin: "",
  mode: "",
  vendorZip: "",
  status: "Active",
  global: false,
  gst: false,
  volumetricWeightRoundOff: false,
});

export const Route = createFileRoute("/master/vendor/vendor")({
  head: () => ({
    meta: [
      { title: "Vendor — Master — Courier ERP" },
      { name: "description", content: "Manage vendor master records with contact, billing, and rate configuration." },
    ],
  }),
  component: VendorPage,
});

function VendorPage() {
  const [rows, setRows] = useState<VendorRow[]>(SEED);
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState({ code: "", name: "", address: "", phone1: "", phone2: "" });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [dialogTab, setDialogTab] = useState("details");
  const [editing, setEditing] = useState<VendorRow | null>(null);
  const [form, setForm] = useState<Omit<VendorRow, "id">>(emptyRow());
  const [deleteTarget, setDeleteTarget] = useState<VendorRow | null>(null);
  const [copyZoneOpen, setCopyZoneOpen] = useState(false);
  const [fromVendor, setFromVendor] = useState<VendorPick>(emptyVendorPick());
  const [toVendor, setToVendor] = useState<VendorPick>(emptyVendorPick());
  const [vendorZones, setVendorZones] = useState<Record<string, string[]>>({});
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const address = [r.address1, r.address2].filter(Boolean).join(", ");
      if (q && ![r.code, r.name, address, r.phone1, r.phone2, r.city, r.email].some((v) => String(v).toLowerCase().includes(q))) return false;
      if (colFilters.code && !r.code.toLowerCase().includes(colFilters.code.toLowerCase())) return false;
      if (colFilters.name && !r.name.toLowerCase().includes(colFilters.name.toLowerCase())) return false;
      if (colFilters.address && !address.toLowerCase().includes(colFilters.address.toLowerCase())) return false;
      if (colFilters.phone1 && !r.phone1.toLowerCase().includes(colFilters.phone1.toLowerCase())) return false;
      if (colFilters.phone2 && !r.phone2.toLowerCase().includes(colFilters.phone2.toLowerCase())) return false;
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
    setForm(emptyRow());
    setDialogTab("details");
    setOpen(true);
  };

  const openEdit = (row: VendorRow) => {
    setEditing(row);
    const { id: _id, ...rest } = row;
    setForm(rest);
    setDialogTab("details");
    setOpen(true);
  };

  const handleSave = () => {
    if (!form.code.trim()) return toast.error("Vendor Code is required");
    if (!form.name.trim()) return toast.error("Vendor Name is required");
    const duplicate = rows.some((r) => r.code.toLowerCase() === form.code.trim().toLowerCase() && r.id !== editing?.id);
    if (duplicate) return toast.error("Vendor Code must be unique");

    if (editing) {
      setRows((prev) => prev.map((r) => (r.id === editing.id ? { ...editing, ...form, code: form.code.trim(), name: form.name.trim() } : r)));
      toast.success("Vendor updated");
    } else {
      setRows((prev) => [{ id: crypto.randomUUID(), ...form, code: form.code.trim(), name: form.name.trim() }, ...prev]);
      toast.success("Vendor added");
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
      "vendors.csv",
      ["Vendor Code", "Vendor Name", "Address 1", "Address 2", "Phone 1", "Phone 2", "Mobile", "Email", "City", "State", "Status"],
      rows.map((r) => [
        r.code,
        r.name,
        r.address1,
        r.address2,
        r.phone1,
        r.phone2,
        r.mobile,
        r.email,
        r.city,
        r.state,
        r.status,
      ]),
    );
    toast.success("Exported vendors.csv");
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
      const imported: VendorRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const c = parseRow(lines[i]);
        if (!c[0]?.trim()) continue;
        const status = (c[10] || "").trim().toLowerCase() === "in-active" ? "In-Active" : "Active";
        imported.push({
          id: crypto.randomUUID(),
          code: c[0].trim(),
          name: (c[1] || "").trim(),
          address1: (c[2] || "").trim(),
          address2: (c[3] || "").trim(),
          phone1: (c[4] || "").trim(),
          phone2: (c[5] || "").trim(),
          mobile: (c[6] || "").trim(),
          email: (c[7] || "").trim(),
          city: (c[8] || "").trim(),
          state: (c[9] || "").trim(),
          contactPerson: "",
          pinCode: "",
          fax: "",
          website: "",
          gstNo: "",
          fuelHead: "",
          currency: "INR",
          origin: "",
          mode: "",
          vendorZip: "",
          status: status as Status,
          global: false,
          gst: false,
          volumetricWeightRoundOff: false,
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
    setColFilters({ code: "", name: "", address: "", phone1: "", phone2: "" });
    setPage(1);
    toast.success("Refreshed");
  };

  const openCopyZone = () => {
    setFromVendor(emptyVendorPick());
    setToVendor(emptyVendorPick());
    setCopyZoneOpen(true);
  };

  const handleCopyZone = () => {
    const fromCode = fromVendor.code.trim().toUpperCase();
    const toCode = toVendor.code.trim().toUpperCase();
    if (!fromCode) return toast.error("From Vendor is required");
    if (!toCode) return toast.error("To Vendor is required");
    if (fromCode === toCode) return toast.error("From and To vendor must be different");
    if (!rows.some((r) => r.code.toUpperCase() === fromCode)) return toast.error("From Vendor not found");
    if (!rows.some((r) => r.code.toUpperCase() === toCode)) return toast.error("To Vendor not found");

    const sourceZones = vendorZones[fromCode] ?? [];
    setVendorZones((prev) => ({ ...prev, [toCode]: [...sourceZones] }));
    toast.success(`Zone configuration copied from ${fromCode} to ${toCode}`);
    setCopyZoneOpen(false);
  };

  const displayAddress = (r: VendorRow) => [r.address1, r.address2].filter(Boolean).join(", ");

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <MasterBreadcrumb trail={["Master", "Vendor", "Vendor"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Vendor</h1>
        <p className="text-sm text-muted-foreground">
          Manage vendor directory with contact details, billing configuration, and rate settings.
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        <input ref={importInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportFile} />
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center gap-1.5">
              <IconButton label="Export" onClick={handleExport}><Download className="h-4 w-4" /></IconButton>
              <IconButton label="Import" onClick={() => importInputRef.current?.click()}><Upload className="h-4 w-4" /></IconButton>
              <IconButton label="Copy Zone" onClick={openCopyZone}><Copy className="h-4 w-4" /></IconButton>
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
                <TableHead className="text-sidebar-foreground">Vendor Code</TableHead>
                <TableHead className="text-sidebar-foreground">Vendor Name</TableHead>
                <TableHead className="text-sidebar-foreground">Address</TableHead>
                <TableHead className="text-sidebar-foreground">Phone 1</TableHead>
                <TableHead className="text-sidebar-foreground">Phone 2</TableHead>
                <TableHead className="w-28 text-center text-sidebar-foreground">Action</TableHead>
              </TableRow>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                {(["code", "name", "address", "phone1", "phone2"] as const).map((k) => (
                  <TableHead key={k} className="py-2">
                    <Input
                      value={colFilters[k]}
                      onChange={(e) => { setColFilters((f) => ({ ...f, [k]: e.target.value })); setPage(1); }}
                      placeholder={k === "code" ? "Vendor Code" : k === "name" ? "Vendor Name" : k === "address" ? "Address" : k === "phone1" ? "Phone 1" : "Phone 2"}
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
                  <TableCell colSpan={6} className="h-32 text-center text-sm text-muted-foreground">
                    No data available in table
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.code}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{displayAddress(r)}</TableCell>
                    <TableCell>{r.phone1}</TableCell>
                    <TableCell>{r.phone2}</TableCell>
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
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Vendor" : "Vendor"}</DialogTitle>
          </DialogHeader>

          <Tabs value={dialogTab} onValueChange={setDialogTab}>
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="rates">Rates Details</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <FieldWrapper label="Vendor Code" required>
                  <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
                </FieldWrapper>
                <FieldWrapper label="Vendor Name" required>
                  <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </FieldWrapper>
                <FieldWrapper label="Contact Person">
                  <Input value={form.contactPerson} onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))} />
                </FieldWrapper>
                <FieldWrapper label="Address 1">
                  <Input value={form.address1} onChange={(e) => setForm((f) => ({ ...f, address1: e.target.value }))} />
                </FieldWrapper>

                <FieldWrapper label="Address 2">
                  <Input value={form.address2} onChange={(e) => setForm((f) => ({ ...f, address2: e.target.value }))} />
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

                <FieldWrapper label="Telephone 1">
                  <Input value={form.phone1} onChange={(e) => setForm((f) => ({ ...f, phone1: e.target.value }))} />
                </FieldWrapper>
                <FieldWrapper label="Telephone 2">
                  <Input value={form.phone2} onChange={(e) => setForm((f) => ({ ...f, phone2: e.target.value }))} />
                </FieldWrapper>
                <FieldWrapper label="Fax">
                  <Input value={form.fax} onChange={(e) => setForm((f) => ({ ...f, fax: e.target.value }))} />
                </FieldWrapper>
                <FieldWrapper label="Email Id">
                  <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                </FieldWrapper>

                <FieldWrapper label="Mobile">
                  <Input value={form.mobile} onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))} />
                </FieldWrapper>
                <FieldWrapper label="Web Site">
                  <Input value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
                </FieldWrapper>
                <FieldWrapper label="GST No">
                  <Input value={form.gstNo} onChange={(e) => setForm((f) => ({ ...f, gstNo: e.target.value }))} />
                </FieldWrapper>
                <FieldWrapper label="Mode">
                  <Select value={form.mode || undefined} onValueChange={(v) => setForm((f) => ({ ...f, mode: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select Type" /></SelectTrigger>
                    <SelectContent>
                      {MODES.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldWrapper>

                <FieldWrapper label="Fuel Head">
                  <LookupInput lookup="ledgerHead" value={form.fuelHead} onChange={(v) => setForm((f) => ({ ...f, fuelHead: v }))} />
                </FieldWrapper>
                <FieldWrapper label="Currency">
                  <Select value={form.currency || undefined} onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldWrapper>
                <FieldWrapper label="Origin">
                  <LookupInput lookup="destination" value={form.origin} onChange={(v) => setForm((f) => ({ ...f, origin: v }))} />
                </FieldWrapper>
                <FieldWrapper label="Vendor Zip">
                  <Input value={form.vendorZip} onChange={(e) => setForm((f) => ({ ...f, vendorZip: e.target.value }))} />
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
                <FieldWrapper label="Global">
                  <div className="flex h-9 items-center gap-2">
                    <Checkbox id="vendor-global" checked={form.global} onCheckedChange={(c) => setForm((f) => ({ ...f, global: c === true }))} />
                    <label htmlFor="vendor-global" className="text-sm text-muted-foreground">Global</label>
                  </div>
                </FieldWrapper>
                <FieldWrapper label="GST">
                  <div className="flex h-9 items-center gap-2">
                    <Checkbox id="vendor-gst" checked={form.gst} onCheckedChange={(c) => setForm((f) => ({ ...f, gst: c === true }))} />
                    <label htmlFor="vendor-gst" className="text-sm text-muted-foreground">GST</label>
                  </div>
                </FieldWrapper>
                <FieldWrapper label="Volumetric Weight Round off">
                  <div className="flex h-9 items-center gap-2">
                    <Checkbox id="vendor-volumetric" checked={form.volumetricWeightRoundOff} onCheckedChange={(c) => setForm((f) => ({ ...f, volumetricWeightRoundOff: c === true }))} />
                    <label htmlFor="vendor-volumetric" className="text-sm text-muted-foreground">Volumetric Weight Round off</label>
                  </div>
                </FieldWrapper>
              </div>
            </TabsContent>

            <TabsContent value="rates" className="mt-4">
              <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 p-8 text-center">
                <p className="text-sm font-medium text-foreground">Rates Details</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  Vendor rate configuration will be implemented in a future phase. Save vendor details from the Details tab.
                </p>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button onClick={handleSave} className="bg-emerald-600 text-white hover:bg-emerald-600/90">Save</Button>
            <Button variant="destructive" onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={copyZoneOpen} onOpenChange={setCopyZoneOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Report</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <FieldWrapper label="From Vendor">
              <VendorPairPicker value={fromVendor} onChange={setFromVendor} />
            </FieldWrapper>
            <FieldWrapper label="To Vendor">
              <VendorPairPicker value={toVendor} onChange={setToVendor} />
            </FieldWrapper>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button onClick={handleCopyZone}>OK</Button>
            <Button variant="destructive" onClick={() => setCopyZoneOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete vendor?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <span className="font-medium text-foreground">{deleteTarget?.code}</span>
              {deleteTarget?.name ? ` (${deleteTarget.name})` : ""} from the vendor master.
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

function VendorPairPicker({
  value,
  onChange,
}: {
  value: VendorPick;
  onChange: (v: VendorPick) => void;
}) {
  const [lookupOpen, setLookupOpen] = useState(false);

  const handleSelect = (_value: string, option: LookupOption) => {
    onChange({ code: option.code, name: option.name });
  };

  return (
    <div className="flex gap-1">
      <Input
        value={value.code}
        onChange={(e) => onChange({ ...value, code: e.target.value })}
        className="w-28"
        placeholder="Code"
      />
      <Input
        value={value.name}
        onChange={(e) => onChange({ ...value, name: e.target.value })}
        className="flex-1"
        placeholder="Name"
      />
      <Button
        size="icon"
        variant="outline"
        className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
        aria-label="Search vendor"
        onClick={() => setLookupOpen(true)}
      >
        <Search className="h-4 w-4" />
      </Button>
      <MasterLookupDialog
        open={lookupOpen}
        onOpenChange={setLookupOpen}
        lookup="vendor"
        returnField="code"
        onSelect={handleSelect}
      />
    </div>
  );
}

function LookupInput({
  value,
  onChange,
  lookup,
  returnField = "name",
}: {
  value: string;
  onChange: (v: string) => void;
  lookup: LookupKey;
  returnField?: "code" | "name" | "code-name";
}) {
  const [lookupOpen, setLookupOpen] = useState(false);
  return (
    <div className="flex gap-1">
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
      <Button size="icon" variant="outline" className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90" aria-label="Search" onClick={() => setLookupOpen(true)}>
        <Search className="h-4 w-4" />
      </Button>
      <MasterLookupDialog open={lookupOpen} onOpenChange={setLookupOpen} lookup={lookup} returnField={returnField} onSelect={(v) => onChange(v)} />
    </div>
  );
}
