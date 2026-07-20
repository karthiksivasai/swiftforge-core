import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Copy, RefreshCw, Plus, Search, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
} from "@/components/master-table-kit";
import { DataIoToolbar } from "@/components/data-io-toolbar";
import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import type { LookupKey, LookupOption } from "@/lib/master-lookups";
import { LookupCombobox } from "@/components/masters/lookup-combobox";

import { useAuth } from "@/lib/auth";
import { useMasterResource } from "@/lib/masters/core/useMasterResource";
import { masterKeys } from "@/lib/masters/core/queryKeys";
import { mapCsvToImportRows, type ImportRow } from "@/lib/masters/core";
import type { CsvRecord } from "@/lib/masters/core/csv";
import {
  vendorsResource,
  fetchVendorChildren,
  saveVendor,
  type VendorRow as VendorDbRow,
} from "@/lib/masters/resources/vendors";
import { vendorCreateSchema } from "@/lib/masters/schemas/vendors";
import {
  dbVendorToUi,
  uiVendorToSavePayload,
  type UiVendorRow,
  type UiVendorAddressRow,
  type UiVendorContactRow,
  type UiVendorBankRow,
  type UiVendorDocumentRow,
  type UiVendorServiceRow,
  type UiVendorApiCredentialRow,
} from "@/lib/masters/vendorUiMap";
import { useMasterList, toErrorMessage, formatImportToast } from "@/lib/masters/screen";

type VendorPick = { code: string; name: string };

const emptyVendorPick = (): VendorPick => ({ code: "", name: "" });

type Status = "Active" | "In-Active";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED"] as const;
const MODES = ["Air", "Surface", "Train", "Courier", "Express"] as const;

const SAVE_TABS = new Set([
  "details",
  "addresses",
  "contacts",
  "bank",
  "documents",
  "services",
  "api-credentials",
]);

function seedVendor(id: string, code: string, name: string): UiVendorRow {
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
    stateId: "",
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
    originDestinationId: "",
    mode: "",
    vendorClass: "VENDOR",
    vendorZip: "",
    status: "Active",
    global: false,
    gst: false,
    volumetricWeightRoundOff: false,
    ratesFileName: "",
    addresses: [],
    contacts: [],
    bankAccounts: [],
    documents: [],
    services: [],
    apiCredentials: [],
  };
}

/** Seed data aligned with the legacy Vendor master (28 entries). */
const SEED: UiVendorRow[] = [
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

const emptyVendor = (): UiVendorRow => seedVendor("", "", "");

const emptyAddressRow = (): UiVendorAddressRow => ({
  id: crypto.randomUUID(),
  addressType: "",
  name: "",
  address1: "",
  address2: "",
  address3: "",
  pinCode: "",
  city: "",
  state: "",
  stateId: "",
  country: "",
  countryId: "",
  phone: "",
  mobile: "",
  email: "",
  isDefault: false,
  remark: "",
});

const emptyContactRow = (): UiVendorContactRow => ({
  id: crypto.randomUUID(),
  contactType: "",
  name: "",
  designation: "",
  email: "",
  mobile: "",
  landline: "",
  extension: "",
  isPrimary: false,
  remark: "",
});

const emptyBankRow = (): UiVendorBankRow => ({
  id: crypto.randomUUID(),
  bank: "",
  bankId: "",
  accountName: "",
  accountNo: "",
  ifsc: "",
  branch: "",
  isDefault: false,
  remark: "",
});

const emptyDocumentRow = (): UiVendorDocumentRow => ({
  id: crypto.randomUUID(),
  docType: "",
  fileName: "",
  fileId: "",
  remark: "",
});

const emptyServiceRow = (): UiVendorServiceRow => ({
  id: crypto.randomUUID(),
  service: "",
  billingVendor: "",
  billingVendorId: "",
  minWeight: "",
  maxWeight: "",
  vendorLink: "",
  isSinglePiece: false,
  status: "Active",
});

const emptyApiCredentialRow = (): UiVendorApiCredentialRow => ({
  id: crypto.randomUUID(),
  carrierCode: "",
  apiKey: "",
  apiSecret: "",
  endpointUrl: "",
  username: "",
  isActive: true,
  remark: "",
});

export const Route = createFileRoute("/master/vendor/vendor")({
  head: () => ({
    meta: [
      { title: "Vendor — Master — Courier ERP" },
      {
        name: "description",
        content: "Manage vendor master records with contact, billing, and rate configuration.",
      },
    ],
  }),
  component: VendorPage,
});

function VendorPage() {
  const { isAuthenticated: authed } = useAuth();
  const rc = useMasterResource(vendorsResource);
  const live = useMasterList(vendorsResource, {
    enabled: authed,
    labelRefs: [
      { idField: "state_id", table: "states", as: "state" },
      { idField: "origin_destination_id", table: "destinations", as: "origin" },
    ],
  });
  const queryClient = useQueryClient();

  const [demoRows, setDemoRows] = useState<UiVendorRow[]>(SEED);
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState({
    code: "",
    name: "",
    address: "",
    phone1: "",
    phone2: "",
  });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [dialogTab, setDialogTab] = useState("details");
  const [editing, setEditing] = useState<UiVendorRow | null>(null);
  const [form, setForm] = useState<UiVendorRow>(emptyVendor());
  const [deleteTarget, setDeleteTarget] = useState<UiVendorRow | null>(null);
  const [copyZoneOpen, setCopyZoneOpen] = useState(false);
  const [fromVendor, setFromVendor] = useState<VendorPick>(emptyVendorPick());
  const [toVendor, setToVendor] = useState<VendorPick>(emptyVendorPick());
  const [vendorZones, setVendorZones] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const ratesFileRef = useRef<HTMLInputElement | null>(null);

  const rows: UiVendorRow[] = authed
    ? (live.rows as (VendorDbRow & Record<string, unknown>)[]).map((r) => dbVendorToUi(r))
    : demoRows;

  const canAdd = !authed || rc.perms.canAdd;
  const canModify = !authed || rc.perms.canModify;
  const canDelete = !authed || rc.perms.canDelete;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const address = [r.address1, r.address2].filter(Boolean).join(", ");
      if (
        q &&
        ![r.code, r.name, address, r.phone1, r.phone2, r.city, r.email].some((v) =>
          String(v).toLowerCase().includes(q),
        )
      )
        return false;
      if (colFilters.code && !r.code.toLowerCase().includes(colFilters.code.toLowerCase()))
        return false;
      if (colFilters.name && !r.name.toLowerCase().includes(colFilters.name.toLowerCase()))
        return false;
      if (colFilters.address && !address.toLowerCase().includes(colFilters.address.toLowerCase()))
        return false;
      if (colFilters.phone1 && !r.phone1.toLowerCase().includes(colFilters.phone1.toLowerCase()))
        return false;
      if (colFilters.phone2 && !r.phone2.toLowerCase().includes(colFilters.phone2.toLowerCase()))
        return false;
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
    setForm(emptyVendor());
    setDialogTab("details");
    setOpen(true);
  };

  const openEdit = async (row: UiVendorRow) => {
    if (authed) {
      try {
        const children = await fetchVendorChildren(row.id);
        const dbRow = (live.rows as (VendorDbRow & Record<string, unknown>)[]).find(
          (r) => r.id === row.id,
        );
        if (!dbRow) {
          toast.error("Vendor not found");
          return;
        }
        const ui = dbVendorToUi(dbRow, children);
        setEditing({ ...ui, row_version: dbRow.row_version });
        setForm(structuredClone({ ...ui, row_version: dbRow.row_version }));
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not load vendor"));
        return;
      }
    } else {
      setEditing(row);
      setForm(structuredClone(row));
    }
    setDialogTab("details");
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.code.trim()) return toast.error("Vendor Code is required");
    if (!form.name.trim()) return toast.error("Vendor Name is required");
    if (!form.mobile.trim()) return toast.error("Mobile is required");

    if (authed) {
      setSaving(true);
      try {
        const payload = uiVendorToSavePayload(form);
        const fields = vendorCreateSchema.parse(payload.fields);
        await saveVendor({
          id: editing?.id ?? null,
          rowVersion: editing?.row_version ?? null,
          fields,
          wizardExtras: payload.wizardExtras,
          addresses: payload.addresses,
          contacts: payload.contacts,
          bankAccounts: payload.bankAccounts,
          documents: payload.documents,
          services: payload.services,
          apiCredentials: payload.apiCredentials,
        });
        void queryClient.invalidateQueries({ queryKey: masterKeys.all(vendorsResource.key) });
        toast.success(editing ? "Vendor updated" : "Vendor added");
        setOpen(false);
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not save vendor"));
      } finally {
        setSaving(false);
      }
      return;
    }

    const duplicate = demoRows.some(
      (r) => r.code.toLowerCase() === form.code.trim().toLowerCase() && r.id !== editing?.id,
    );
    if (duplicate) return toast.error("Vendor Code must be unique");

    if (editing) {
      setDemoRows((prev) =>
        prev.map((r) =>
          r.id === editing.id
            ? { ...editing, ...form, code: form.code.trim(), name: form.name.trim() }
            : r,
        ),
      );
      toast.success("Vendor updated");
    } else {
      setDemoRows((prev) => [
        { ...form, id: crypto.randomUUID(), code: form.code.trim(), name: form.name.trim() },
        ...prev,
      ]);
      toast.success("Vendor added");
    }
    setOpen(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const row = deleteTarget;
    if (authed) {
      try {
        await rc.remove.mutateAsync({ id: row.id, rowVersion: row.row_version ?? 0 });
        toast.success(`Deleted ${row.code}`);
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not delete vendor"));
      }
    } else {
      setDemoRows((prev) => prev.filter((r) => r.id !== row.id));
      toast.success(`Deleted ${row.code}`);
    }
    setDeleteTarget(null);
  };

  const handleImportRows = async (parsedRows: CsvRecord[]) => {
    try {
      if (authed) {
        const importRows = mapCsvToImportRows(
          parsedRows,
          vendorsResource.importColumns,
        ) as ImportRow[];
        const res = await rc.commitImport.mutateAsync(importRows);
        const toastRes = formatImportToast(res);
        if (toastRes.ok) toast.success(toastRes.message);
        else toast.error(toastRes.message);
        void queryClient.invalidateQueries({ queryKey: masterKeys.all(vendorsResource.key) });
        return;
      }
      const imported: UiVendorRow[] = [];
      for (const rec of mapCsvToImportRows(parsedRows, vendorsResource.importColumns)) {
        if (!rec.code?.trim()) continue;
        const status =
          (rec.status || "").trim().toLowerCase() === "in-active" ? "In-Active" : "Active";
        imported.push({
          ...emptyVendor(),
          id: crypto.randomUUID(),
          code: rec.code.trim(),
          name: (rec.name || "").trim(),
          contactPerson: (rec.contact_person || "").trim(),
          address1: (rec.address1 || "").trim(),
          address2: (rec.address2 || "").trim(),
          pinCode: (rec.pin_code || "").trim(),
          city: (rec.city || "").trim(),
          state: (rec.state_code || rec.state || "").trim(),
          phone1: (rec.phone1 || "").trim(),
          phone2: (rec.phone2 || "").trim(),
          fax: (rec.fax || "").trim(),
          mobile: (rec.mobile || "").trim(),
          email: (rec.email || "").trim(),
          website: (rec.website || "").trim(),
          gstNo: (rec.gst_no || "").trim(),
          fuelHead: (rec.fuel_head || "").trim(),
          currency: (rec.currency || "INR").trim(),
          origin: (rec.origin_destination_code || "").trim(),
          mode: (rec.mode || "").trim(),
          vendorClass: (rec.vendor_class || "VENDOR").trim(),
          vendorZip: (rec.vendor_zip || "").trim(),
          status: status as Status,
          global: String(rec.is_global).toLowerCase() === "true",
          gst: String(rec.gst_applies).toLowerCase() !== "false",
          volumetricWeightRoundOff: String(rec.vol_weight_round_off).toLowerCase() === "true",
        });
      }
      if (imported.length === 0) {
        toast.error("No valid rows found");
        return;
      }
      setDemoRows((prev) => [...imported, ...prev]);
      toast.success(`Imported ${imported.length} row${imported.length === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(toErrorMessage(err, "Failed to import file"));
    }
  };

  const handleRefresh = () => {
    setSearch("");
    setColFilters({ code: "", name: "", address: "", phone1: "", phone2: "" });
    setPage(1);
    if (authed) {
      void live.refetch();
    }
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
    if (!demoRows.some((r) => r.code.toUpperCase() === fromCode))
      return toast.error("From Vendor not found");
    if (!demoRows.some((r) => r.code.toUpperCase() === toCode))
      return toast.error("To Vendor not found");

    const sourceZones = vendorZones[fromCode] ?? [];
    setVendorZones((prev) => ({ ...prev, [toCode]: [...sourceZones] }));
    toast.success(`Zone configuration copied from ${fromCode} to ${toCode}`);
    setCopyZoneOpen(false);
  };

  const handleRatesUpload = async () => {
    if (!form.ratesFileName) return toast.error("Choose a file first");
    const vendorCode = (editing?.code ?? form.code).trim().toUpperCase();
    if (!vendorCode) return toast.error("Save vendor details with a code before uploading rates");

    const file = ratesFileRef.current?.files?.[0];
    if (file && !authed) {
      try {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        const zones = lines
          .slice(1)
          .map((l) => l.split(",")[0]?.trim())
          .filter(Boolean);
        if (zones.length > 0) {
          setVendorZones((prev) => ({ ...prev, [vendorCode]: zones }));
        }
      } catch {
        /* keep upload success even if parse fails */
      }
    }

    if (editing && !authed) {
      setDemoRows((prev) =>
        prev.map((r) => (r.id === editing.id ? { ...r, ratesFileName: form.ratesFileName } : r)),
      );
    }
    toast.success(`Rate file uploaded: ${form.ratesFileName}`);
  };

  const displayAddress = (r: UiVendorRow) => [r.address1, r.address2].filter(Boolean).join(", ");

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
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center gap-1.5">
              <DataIoToolbar
                export={{
                  filename: "vendors",
                  title: "Vendors",
                  columns: [
                    { key: "code", header: "Vendor Code" },
                    { key: "name", header: "Vendor Name" },
                    { key: "address1", header: "Address 1" },
                    { key: "address2", header: "Address 2" },
                    { key: "phone1", header: "Phone 1" },
                    { key: "phone2", header: "Phone 2" },
                    { key: "mobile", header: "Mobile" },
                    { key: "email", header: "Email" },
                    { key: "city", header: "City" },
                    { key: "state", header: "State" },
                    { key: "status", header: "Status" },
                  ],
                  getRows: () =>
                    rows.map((r) => ({
                      code: r.code,
                      name: r.name,
                      address1: r.address1,
                      address2: r.address2,
                      phone1: r.phone1,
                      phone2: r.phone2,
                      mobile: r.mobile,
                      email: r.email,
                      city: r.city,
                      state: r.state,
                      status: r.status,
                    })),
                }}
                import={{ onRows: handleImportRows }}
              />
              {!authed && (
                <IconButton label="Copy Zone" onClick={openCopyZone}>
                  <Copy className="h-4 w-4" />
                </IconButton>
              )}
              <IconButton label="Refresh" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4" />
              </IconButton>
            </div>
          </TooltipProvider>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search..."
                className="h-9 w-56 pl-8"
              />
            </div>
            {canAdd && (
              <Button size="sm" onClick={openAdd} className="h-9 gap-1.5">
                <Plus className="h-4 w-4" />
                Add
              </Button>
            )}
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
                      onChange={(e) => {
                        setColFilters((f) => ({ ...f, [k]: e.target.value }));
                        setPage(1);
                      }}
                      placeholder={
                        k === "code"
                          ? "Vendor Code"
                          : k === "name"
                            ? "Vendor Name"
                            : k === "address"
                              ? "Address"
                              : k === "phone1"
                                ? "Phone 1"
                                : "Phone 2"
                      }
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
                        {canModify && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => void openEdit(r)}
                            aria-label={`Edit ${r.code}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(r)}
                            aria-label={`Delete ${r.code}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <TablePager
          totalPages={totalPages}
          currentPage={currentPage}
          setPage={setPage}
          startIdx={startIdx}
          endIdx={endIdx}
          total={filtered.length}
        />
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Vendor" : "Vendor"}</DialogTitle>
          </DialogHeader>

          <Tabs value={dialogTab} onValueChange={setDialogTab}>
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="addresses">Addresses</TabsTrigger>
              <TabsTrigger value="contacts">Contacts</TabsTrigger>
              <TabsTrigger value="bank">Bank Accounts</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="services">Services</TabsTrigger>
              <TabsTrigger value="api-credentials">API Credentials</TabsTrigger>
              <TabsTrigger value="rates">Rates Details</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <FieldWrapper label="Vendor Code" required>
                  <Input
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  />
                </FieldWrapper>
                <FieldWrapper label="Vendor Name" required>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </FieldWrapper>
                <FieldWrapper label="Contact Person">
                  <Input
                    value={form.contactPerson}
                    onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))}
                  />
                </FieldWrapper>
                <FieldWrapper label="Address 1">
                  <Input
                    value={form.address1}
                    onChange={(e) => setForm((f) => ({ ...f, address1: e.target.value }))}
                  />
                </FieldWrapper>

                <FieldWrapper label="Address 2">
                  <Input
                    value={form.address2}
                    onChange={(e) => setForm((f) => ({ ...f, address2: e.target.value }))}
                  />
                </FieldWrapper>
                <FieldWrapper label="Pin Code">
                  {authed ? (
                    <Input
                      value={form.pinCode}
                      onChange={(e) => setForm((f) => ({ ...f, pinCode: e.target.value }))}
                    />
                  ) : (
                    <LookupInput
                      lookup="pinCode"
                      returnField="code"
                      value={form.pinCode}
                      onChange={(v) => setForm((f) => ({ ...f, pinCode: v }))}
                    />
                  )}
                </FieldWrapper>
                <FieldWrapper label="City">
                  <Input
                    value={form.city}
                    onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  />
                </FieldWrapper>
                <FieldWrapper label="State">
                  {authed ? (
                    <LookupCombobox
                      lookupKey="state"
                      value={form.stateId ?? ""}
                      valueLabel={form.state}
                      onChange={(id, item) =>
                        setForm((f) => ({
                          ...f,
                          stateId: id,
                          state: item?.name ?? "",
                        }))
                      }
                      placeholder="Search state..."
                    />
                  ) : (
                    <LookupInput
                      lookup="state"
                      value={form.state}
                      onChange={(v) => setForm((f) => ({ ...f, state: v }))}
                    />
                  )}
                </FieldWrapper>

                <FieldWrapper label="Telephone 1">
                  <Input
                    value={form.phone1}
                    onChange={(e) => setForm((f) => ({ ...f, phone1: e.target.value }))}
                  />
                </FieldWrapper>
                <FieldWrapper label="Telephone 2">
                  <Input
                    value={form.phone2}
                    onChange={(e) => setForm((f) => ({ ...f, phone2: e.target.value }))}
                  />
                </FieldWrapper>
                <FieldWrapper label="Fax">
                  <Input
                    value={form.fax}
                    onChange={(e) => setForm((f) => ({ ...f, fax: e.target.value }))}
                  />
                </FieldWrapper>
                <FieldWrapper label="Email Id">
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </FieldWrapper>

                <FieldWrapper label="Mobile" required>
                  <Input
                    value={form.mobile}
                    onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))}
                  />
                </FieldWrapper>
                <FieldWrapper label="Web Site">
                  <Input
                    value={form.website}
                    onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                  />
                </FieldWrapper>
                <FieldWrapper label="GST No">
                  <Input
                    value={form.gstNo}
                    onChange={(e) => setForm((f) => ({ ...f, gstNo: e.target.value }))}
                  />
                </FieldWrapper>
                <FieldWrapper label="Mode">
                  <Select
                    value={form.mode || undefined}
                    onValueChange={(v) => setForm((f) => ({ ...f, mode: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Type" />
                    </SelectTrigger>
                    <SelectContent>
                      {MODES.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldWrapper>

                <FieldWrapper label="Fuel Head">
                  <LookupInput
                    lookup="ledgerHead"
                    value={form.fuelHead}
                    onChange={(v) => setForm((f) => ({ ...f, fuelHead: v }))}
                  />
                </FieldWrapper>
                <FieldWrapper label="Currency">
                  <Select
                    value={form.currency || undefined}
                    onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldWrapper>
                <FieldWrapper label="Origin">
                  {authed ? (
                    <LookupCombobox
                      lookupKey="destination"
                      value={form.originDestinationId ?? ""}
                      valueLabel={form.origin}
                      onChange={(id, item) =>
                        setForm((f) => ({
                          ...f,
                          originDestinationId: id,
                          origin: item?.name ?? "",
                        }))
                      }
                      placeholder="Search destination..."
                    />
                  ) : (
                    <LookupInput
                      lookup="destination"
                      value={form.origin}
                      onChange={(v) => setForm((f) => ({ ...f, origin: v }))}
                    />
                  )}
                </FieldWrapper>
                <FieldWrapper label="Vendor Zip">
                  <Input
                    value={form.vendorZip}
                    onChange={(e) => setForm((f) => ({ ...f, vendorZip: e.target.value }))}
                  />
                </FieldWrapper>

                <FieldWrapper label="Status">
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm((f) => ({ ...f, status: v as Status }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="In-Active">In-Active</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldWrapper>
                <div className="flex flex-col justify-end gap-1.5 md:col-span-2 lg:col-span-3">
                  <div className="flex h-9 flex-wrap items-center gap-x-6 gap-y-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="vendor-global"
                        checked={form.global}
                        onCheckedChange={(c) => setForm((f) => ({ ...f, global: c === true }))}
                      />
                      <label htmlFor="vendor-global" className="text-sm text-muted-foreground">
                        Global
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="vendor-gst"
                        checked={form.gst}
                        onCheckedChange={(c) => setForm((f) => ({ ...f, gst: c === true }))}
                      />
                      <label htmlFor="vendor-gst" className="text-sm text-muted-foreground">
                        GST
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="vendor-volumetric"
                        checked={form.volumetricWeightRoundOff}
                        onCheckedChange={(c) =>
                          setForm((f) => ({ ...f, volumetricWeightRoundOff: c === true }))
                        }
                      />
                      <label
                        htmlFor="vendor-volumetric"
                        className="whitespace-nowrap text-sm text-muted-foreground"
                      >
                        Volumetric Weight Round off
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="addresses" className="mt-4">
              <AddressesTab
                authed={authed}
                rows={form.addresses}
                setRows={(updater) => setForm((f) => ({ ...f, addresses: updater(f.addresses) }))}
              />
            </TabsContent>

            <TabsContent value="contacts" className="mt-4">
              <ContactsTab
                rows={form.contacts}
                setRows={(updater) => setForm((f) => ({ ...f, contacts: updater(f.contacts) }))}
              />
            </TabsContent>

            <TabsContent value="bank" className="mt-4">
              <BankAccountsTab
                authed={authed}
                rows={form.bankAccounts}
                setRows={(updater) =>
                  setForm((f) => ({ ...f, bankAccounts: updater(f.bankAccounts) }))
                }
              />
            </TabsContent>

            <TabsContent value="documents" className="mt-4">
              <DocumentsTab
                rows={form.documents}
                setRows={(updater) => setForm((f) => ({ ...f, documents: updater(f.documents) }))}
              />
            </TabsContent>

            <TabsContent value="services" className="mt-4">
              <ServicesTab
                authed={authed}
                rows={form.services}
                setRows={(updater) => setForm((f) => ({ ...f, services: updater(f.services) }))}
              />
            </TabsContent>

            <TabsContent value="api-credentials" className="mt-4">
              <ApiCredentialsTab
                rows={form.apiCredentials}
                setRows={(updater) =>
                  setForm((f) => ({ ...f, apiCredentials: updater(f.apiCredentials) }))
                }
              />
            </TabsContent>

            <TabsContent value="rates" className="mt-4">
              <div className="flex min-h-[320px] flex-col gap-4 rounded-lg border bg-card">
                <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
                  <Label className="text-sm font-medium text-muted-foreground">File Upload</Label>
                  <input
                    ref={ratesFileRef}
                    type="file"
                    accept=".csv,.xls,.xlsx,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      setForm((f) => ({ ...f, ratesFileName: file?.name ?? "" }));
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => ratesFileRef.current?.click()}
                  >
                    Choose
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {form.ratesFileName || "No file selected"}
                  </span>
                  <Button
                    size="sm"
                    type="button"
                    className="ml-auto bg-chart-2 text-primary-foreground hover:bg-chart-2/90"
                    onClick={handleRatesUpload}
                  >
                    Upload
                  </Button>
                </div>
                <div className="flex flex-1 items-center justify-center px-4 pb-4">
                  {form.ratesFileName ? (
                    <p className="text-sm text-muted-foreground">
                      Rate file{" "}
                      <span className="font-medium text-foreground">{form.ratesFileName}</span>{" "}
                      ready to upload.
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Upload a vendor rate file to populate rate details.
                    </p>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="gap-2 sm:gap-2">
            {SAVE_TABS.has(dialogTab) ? (
              <Button
                onClick={() => void handleSave()}
                disabled={saving}
                className="bg-emerald-600 text-white hover:bg-emerald-600/90"
              >
                Save
              </Button>
            ) : null}
            <Button variant="destructive" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!authed && (
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
              <Button variant="destructive" onClick={() => setCopyZoneOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete vendor?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              <span className="font-medium text-foreground">{deleteTarget?.code}</span>
              {deleteTarget?.name ? ` (${deleteTarget.name})` : ""} from the vendor master.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmDelete()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AddressesTab({
  rows,
  setRows,
  authed,
}: {
  rows: UiVendorAddressRow[];
  setRows: (updater: (prev: UiVendorAddressRow[]) => UiVendorAddressRow[]) => void;
  authed: boolean;
}) {
  const updateRow = (id: string, patch: Partial<UiVendorAddressRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button
          size="sm"
          type="button"
          onClick={() => setRows((prev) => [...prev, emptyAddressRow()])}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          No addresses added yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <div key={row.id} className="rounded-md border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Address</span>
                <Button
                  size="icon"
                  variant="ghost"
                  type="button"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                  aria-label="Remove address"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                <FieldWrapper label="Name">
                  <Input
                    value={row.name}
                    onChange={(e) => updateRow(row.id, { name: e.target.value })}
                  />
                </FieldWrapper>
                <FieldWrapper label="Address 1">
                  <Input
                    value={row.address1}
                    onChange={(e) => updateRow(row.id, { address1: e.target.value })}
                  />
                </FieldWrapper>
                <FieldWrapper label="City">
                  <Input
                    value={row.city}
                    onChange={(e) => updateRow(row.id, { city: e.target.value })}
                  />
                </FieldWrapper>
                <FieldWrapper label="State">
                  {authed ? (
                    <LookupCombobox
                      lookupKey="state"
                      value={row.stateId ?? ""}
                      valueLabel={row.state}
                      onChange={(id, item) =>
                        updateRow(row.id, { stateId: id, state: item?.name ?? "" })
                      }
                      placeholder="Search state..."
                    />
                  ) : (
                    <Input
                      value={row.state}
                      onChange={(e) => updateRow(row.id, { state: e.target.value })}
                    />
                  )}
                </FieldWrapper>
                <FieldWrapper label="Country">
                  {authed ? (
                    <LookupCombobox
                      lookupKey="country"
                      value={row.countryId ?? ""}
                      valueLabel={row.country}
                      onChange={(id, item) =>
                        updateRow(row.id, { countryId: id, country: item?.name ?? "" })
                      }
                      placeholder="Search country..."
                    />
                  ) : (
                    <Input
                      value={row.country}
                      onChange={(e) => updateRow(row.id, { country: e.target.value })}
                    />
                  )}
                </FieldWrapper>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ContactsTab({
  rows,
  setRows,
}: {
  rows: UiVendorContactRow[];
  setRows: (updater: (prev: UiVendorContactRow[]) => UiVendorContactRow[]) => void;
}) {
  const updateRow = (id: string, patch: Partial<UiVendorContactRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button
          size="sm"
          type="button"
          onClick={() => setRows((prev) => [...prev, emptyContactRow()])}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          No contacts added yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <div key={row.id} className="rounded-md border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Contact</span>
                <Button
                  size="icon"
                  variant="ghost"
                  type="button"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                  aria-label="Remove contact"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FieldWrapper label="Name">
                  <Input
                    value={row.name}
                    onChange={(e) => updateRow(row.id, { name: e.target.value })}
                  />
                </FieldWrapper>
                <FieldWrapper label="Mobile">
                  <Input
                    value={row.mobile}
                    onChange={(e) => updateRow(row.id, { mobile: e.target.value })}
                  />
                </FieldWrapper>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BankAccountsTab({
  rows,
  setRows,
  authed,
}: {
  rows: UiVendorBankRow[];
  setRows: (updater: (prev: UiVendorBankRow[]) => UiVendorBankRow[]) => void;
  authed: boolean;
}) {
  const updateRow = (id: string, patch: Partial<UiVendorBankRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button
          size="sm"
          type="button"
          onClick={() => setRows((prev) => [...prev, emptyBankRow()])}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          No bank accounts added yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <div key={row.id} className="rounded-md border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Bank Account</span>
                <Button
                  size="icon"
                  variant="ghost"
                  type="button"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                  aria-label="Remove bank account"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                <FieldWrapper label="Bank">
                  {authed ? (
                    <LookupCombobox
                      lookupKey="bank"
                      value={row.bankId ?? ""}
                      valueLabel={row.bank}
                      onChange={(id, item) =>
                        updateRow(row.id, { bankId: id, bank: item?.name ?? "" })
                      }
                      placeholder="Search bank..."
                    />
                  ) : (
                    <Input
                      value={row.bank}
                      onChange={(e) => updateRow(row.id, { bank: e.target.value })}
                    />
                  )}
                </FieldWrapper>
                <FieldWrapper label="Account No">
                  <Input
                    value={row.accountNo}
                    onChange={(e) => updateRow(row.id, { accountNo: e.target.value })}
                  />
                </FieldWrapper>
                <FieldWrapper label="IFSC">
                  <Input
                    value={row.ifsc}
                    onChange={(e) => updateRow(row.id, { ifsc: e.target.value })}
                  />
                </FieldWrapper>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DocumentsTab({
  rows,
  setRows,
}: {
  rows: UiVendorDocumentRow[];
  setRows: (updater: (prev: UiVendorDocumentRow[]) => UiVendorDocumentRow[]) => void;
}) {
  const updateRow = (id: string, patch: Partial<UiVendorDocumentRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button
          size="sm"
          type="button"
          onClick={() => setRows((prev) => [...prev, emptyDocumentRow()])}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          No documents added yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <div key={row.id} className="rounded-md border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Document</span>
                <Button
                  size="icon"
                  variant="ghost"
                  type="button"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                  aria-label="Remove document"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                <FieldWrapper label="Document Type" required>
                  <Input
                    value={row.docType}
                    onChange={(e) => updateRow(row.id, { docType: e.target.value })}
                    placeholder="e.g. GST, PAN, Contract"
                  />
                </FieldWrapper>
                <FieldWrapper label="File Name">
                  <Input
                    value={row.fileName}
                    onChange={(e) => updateRow(row.id, { fileName: e.target.value })}
                    placeholder="document.pdf"
                  />
                </FieldWrapper>
                <FieldWrapper label="Remark">
                  <Input
                    value={row.remark}
                    onChange={(e) => updateRow(row.id, { remark: e.target.value })}
                  />
                </FieldWrapper>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ServicesTab({
  rows,
  setRows,
  authed,
}: {
  rows: UiVendorServiceRow[];
  setRows: (updater: (prev: UiVendorServiceRow[]) => UiVendorServiceRow[]) => void;
  authed: boolean;
}) {
  const updateRow = (id: string, patch: Partial<UiVendorServiceRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button
          size="sm"
          type="button"
          onClick={() => setRows((prev) => [...prev, emptyServiceRow()])}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          No services added yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <div key={row.id} className="rounded-md border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Service</span>
                <Button
                  size="icon"
                  variant="ghost"
                  type="button"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                  aria-label="Remove service"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                <FieldWrapper label="Service" required>
                  <Input
                    value={row.service}
                    onChange={(e) => updateRow(row.id, { service: e.target.value })}
                  />
                </FieldWrapper>
                <FieldWrapper label="Billing Vendor">
                  {authed ? (
                    <LookupCombobox
                      lookupKey="vendor"
                      value={row.billingVendorId ?? ""}
                      valueLabel={row.billingVendor}
                      onChange={(id, item) =>
                        updateRow(row.id, {
                          billingVendorId: id,
                          billingVendor: item?.name ?? "",
                        })
                      }
                      placeholder="Search vendor..."
                    />
                  ) : (
                    <Input
                      value={row.billingVendor}
                      onChange={(e) => updateRow(row.id, { billingVendor: e.target.value })}
                    />
                  )}
                </FieldWrapper>
                <FieldWrapper label="Min Weight">
                  <Input
                    value={row.minWeight}
                    onChange={(e) => updateRow(row.id, { minWeight: e.target.value })}
                  />
                </FieldWrapper>
                <FieldWrapper label="Max Weight">
                  <Input
                    value={row.maxWeight}
                    onChange={(e) => updateRow(row.id, { maxWeight: e.target.value })}
                  />
                </FieldWrapper>
                <FieldWrapper label="Vendor Link">
                  <Input
                    value={row.vendorLink}
                    onChange={(e) => updateRow(row.id, { vendorLink: e.target.value })}
                    placeholder="Carrier integration"
                  />
                </FieldWrapper>
                <FieldWrapper label="Status">
                  <Select
                    value={row.status}
                    onValueChange={(v) => updateRow(row.id, { status: v as Status })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="In-Active">In-Active</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldWrapper>
                <div className="flex items-end pb-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`svc-single-${row.id}`}
                      checked={row.isSinglePiece}
                      onCheckedChange={(c) => updateRow(row.id, { isSinglePiece: c === true })}
                    />
                    <label
                      htmlFor={`svc-single-${row.id}`}
                      className="text-sm text-muted-foreground"
                    >
                      Single Piece
                    </label>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ApiCredentialsTab({
  rows,
  setRows,
}: {
  rows: UiVendorApiCredentialRow[];
  setRows: (updater: (prev: UiVendorApiCredentialRow[]) => UiVendorApiCredentialRow[]) => void;
}) {
  const updateRow = (id: string, patch: Partial<UiVendorApiCredentialRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button
          size="sm"
          type="button"
          onClick={() => setRows((prev) => [...prev, emptyApiCredentialRow()])}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          No API credentials added yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <div key={row.id} className="rounded-md border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">API Credential</span>
                <Button
                  size="icon"
                  variant="ghost"
                  type="button"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                  aria-label="Remove API credential"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                <FieldWrapper label="Carrier Code" required>
                  <Input
                    value={row.carrierCode}
                    onChange={(e) => updateRow(row.id, { carrierCode: e.target.value })}
                    placeholder="e.g. DHL, FEDEX"
                  />
                </FieldWrapper>
                <FieldWrapper label="API Key">
                  <Input
                    value={row.apiKey}
                    onChange={(e) => updateRow(row.id, { apiKey: e.target.value })}
                  />
                </FieldWrapper>
                <FieldWrapper label="API Secret">
                  <Input
                    type="password"
                    value={row.apiSecret}
                    onChange={(e) => updateRow(row.id, { apiSecret: e.target.value })}
                  />
                </FieldWrapper>
                <FieldWrapper label="Endpoint URL">
                  <Input
                    value={row.endpointUrl}
                    onChange={(e) => updateRow(row.id, { endpointUrl: e.target.value })}
                    placeholder="https://api.example.com"
                  />
                </FieldWrapper>
                <FieldWrapper label="Username">
                  <Input
                    value={row.username}
                    onChange={(e) => updateRow(row.id, { username: e.target.value })}
                  />
                </FieldWrapper>
                <FieldWrapper label="Remark">
                  <Input
                    value={row.remark}
                    onChange={(e) => updateRow(row.id, { remark: e.target.value })}
                  />
                </FieldWrapper>
                <div className="flex items-end pb-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`api-active-${row.id}`}
                      checked={row.isActive}
                      onCheckedChange={(c) => updateRow(row.id, { isActive: c === true })}
                    />
                    <label
                      htmlFor={`api-active-${row.id}`}
                      className="text-sm text-muted-foreground"
                    >
                      Active
                    </label>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
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
        returnField={returnField}
        onSelect={(v) => onChange(v)}
      />
    </div>
  );
}
