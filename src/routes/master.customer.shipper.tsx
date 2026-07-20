import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { RefreshCw, Plus, Search, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
import type { LookupKey } from "@/lib/master-lookups";
import { LookupCombobox } from "@/components/masters/lookup-combobox";

import { useAuth } from "@/lib/auth";
import { useMasterResource } from "@/lib/masters/core/useMasterResource";
import { masterKeys } from "@/lib/masters/core/queryKeys";
import { mapCsvToImportRows, type ImportRow } from "@/lib/masters/core";
import type { CsvRecord } from "@/lib/masters/core/csv";
import {
  shippersResource,
  SHIPPER_IMPORT_HEADER_ALIASES,
  fetchShipperKyc,
  importShippersChunked,
  normalizeShipperImportRow,
  replaceShipperKyc,
  type ShipperRow as ShipperDbRow,
} from "@/lib/masters/resources/shippers";
import { shipperCreateSchema, shipperUpdateSchema } from "@/lib/masters/schemas/shippers";
import { useMasterList, toErrorMessage, formatImportToast } from "@/lib/masters/screen";

type Status = "Active" | "In-Active";

const KYC_TYPES = [
  "Aadhaar Number",
  "Driving License",
  "GSTIN (Normal)",
  "IEC CERTIFICATE",
  "PAN Number",
  "Passport Number",
  "TAN Number",
  "Voter Id",
] as const;

const FIRMS = ["Govt", "Non Govt"] as const;

type KycRow = {
  id: string;
  shipperCode: string;
  fileName: string;
  imageType: string;
  entryDate: string;
};

type ShipperRow = {
  id: string;
  originCode: string;
  originId: string;
  originName: string;
  code: string;
  name: string;
  contactPerson: string;
  address1: string;
  address2: string;
  pinCode: string;
  city: string;
  stateId: string;
  stateName: string;
  industryId: string;
  industryName: string;
  telephone1: string;
  telephone2: string;
  fax: string;
  email: string;
  mobile: string;
  iecNo: string;
  gstNo: string;
  aadharNo: string;
  panNo: string;
  serviceCenterId: string;
  serviceCenterCode: string;
  serviceCenterName: string;
  bankAdCode: string;
  bankAccount: string;
  bankIfsc: string;
  firm: string;
  nfei: boolean;
  lutNumber: string;
  lutIssueDate: string;
  lutTillDate: string;
  status: Status;
  row_version?: number;
};

type ShipperForm = Omit<ShipperRow, "id" | "row_version">;

const emptyForm = (): ShipperForm => ({
  originCode: "",
  originId: "",
  originName: "",
  code: "",
  name: "",
  contactPerson: "",
  address1: "",
  address2: "",
  pinCode: "",
  city: "",
  stateId: "",
  stateName: "",
  industryId: "",
  industryName: "",
  telephone1: "",
  telephone2: "",
  fax: "",
  email: "",
  mobile: "",
  iecNo: "",
  gstNo: "",
  aadharNo: "",
  panNo: "",
  serviceCenterId: "",
  serviceCenterCode: "",
  serviceCenterName: "",
  bankAdCode: "",
  bankAccount: "",
  bankIfsc: "",
  firm: "",
  nfei: false,
  lutNumber: "",
  lutIssueDate: "",
  lutTillDate: "",
  status: "Active",
});

function rowToView(r: ShipperDbRow & Record<string, unknown>): ShipperRow {
  return {
    id: r.id,
    originCode: (r.origin_code as string) || (r.origin_lookup_code as string) || "",
    originId: r.origin_id ?? "",
    originName: (r.origin_lookup_name as string) || "",
    code: r.code,
    name: r.name,
    contactPerson: r.contact_person ?? "",
    address1: r.address1 ?? r.address ?? "",
    address2: r.address2 ?? "",
    pinCode: r.pin_code ?? "",
    city: r.city ?? "",
    stateId: r.state_id ?? "",
    stateName: (r.state_name as string) || (r.state_label_name as string) || "",
    industryId: r.industry_id ?? "",
    industryName: (r.industry_name as string) || "",
    telephone1: r.telephone1 ?? "",
    telephone2: r.telephone2 ?? "",
    fax: r.fax ?? "",
    email: r.email ?? "",
    mobile: r.mobile ?? "",
    iecNo: r.iec_no ?? "",
    gstNo: r.gst_no ?? "",
    aadharNo: r.aadhar_no ?? "",
    panNo: r.pan_no ?? "",
    serviceCenterId: r.service_center_id ?? "",
    serviceCenterCode: (r.service_center_code as string) || (r.sc_code as string) || "",
    serviceCenterName: (r.sc_name as string) || "",
    bankAdCode: r.bank_ad_code ?? "",
    bankAccount: r.bank_account ?? "",
    bankIfsc: r.bank_ifsc ?? "",
    firm: r.firm ?? "",
    nfei: Boolean(r.nfei),
    lutNumber: r.lut_number ?? "",
    lutIssueDate: r.lut_issue_date ?? "",
    lutTillDate: r.lut_till_date ?? "",
    status: r.status === "INACTIVE" ? "In-Active" : "Active",
    row_version: r.row_version,
  };
}

function toRaw(form: ShipperForm) {
  const address1 = form.address1.trim();
  const address2 = form.address2.trim();
  const mobile = form.mobile.trim() || form.telephone1.trim() || "0000000000";
  return {
    code: form.code,
    name: form.name,
    origin_id: form.originId || null,
    origin_code: form.originCode.trim().toUpperCase() || null,
    contact_person: form.contactPerson.trim() || null,
    address1: address1 || null,
    address2: address2 || null,
    telephone1: form.telephone1.trim() || null,
    telephone2: form.telephone2.trim() || null,
    fax: form.fax.trim() || null,
    industry_id: form.industryId || null,
    iec_no: form.iecNo.trim() || null,
    gst_no: form.gstNo.trim() || null,
    aadhar_no: form.aadharNo.trim() || null,
    pan_no: form.panNo.trim() || null,
    service_center_id: form.serviceCenterId || null,
    service_center_code: form.serviceCenterCode.trim().toUpperCase() || null,
    bank_ad_code: form.bankAdCode.trim() || null,
    bank_account: form.bankAccount.trim() || null,
    bank_ifsc: form.bankIfsc.trim().toUpperCase() || null,
    firm: form.firm.trim() || null,
    nfei: form.nfei,
    lut_number: form.lutNumber.trim() || null,
    lut_issue_date: form.lutIssueDate.trim() || null,
    lut_till_date: form.lutTillDate.trim() || null,
    mobile,
    email: form.email.trim() || null,
    address: [address1, address2].filter(Boolean).join(", ") || null,
    pin_code: form.pinCode.trim() || null,
    city: form.city.trim() || null,
    state_id: form.stateId || null,
    state_name: form.stateName.trim() || null,
    status: form.status === "In-Active" ? "INACTIVE" : "ACTIVE",
  };
}

export const Route = createFileRoute("/master/customer/shipper")({
  head: () => ({
    meta: [
      { title: "Shipper — Master — Courier ERP" },
      {
        name: "description",
        content: "Manage shipper (sender) directory with contact and delivery address details.",
      },
    ],
  }),
  component: ShipperPage,
});

function ShipperPage() {
  const { isAuthenticated: authed } = useAuth();
  const rc = useMasterResource(shippersResource);
  const live = useMasterList(shippersResource, {
    enabled: authed,
    labelRefs: [
      { idField: "origin_id", table: "destinations", as: "origin_lookup" },
      { idField: "state_id", table: "states", as: "state_label" },
      { idField: "industry_id", table: "industries", as: "industry" },
      { idField: "service_center_id", table: "service_centers", as: "sc" },
    ],
  });
  const queryClient = useQueryClient();

  const [demoRows, setDemoRows] = useState<ShipperRow[]>([]);
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState({
    originCode: "",
    code: "",
    name: "",
    address1: "",
    mobile: "",
    gstNo: "",
    aadharNo: "",
  });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [kycOpen, setKycOpen] = useState(false);
  const [kycRows, setKycRows] = useState<KycRow[]>([]);
  const [kycDocType, setKycDocType] = useState<string>(KYC_TYPES[0]);
  const [kycFileName, setKycFileName] = useState("");
  const kycFileRef = useRef<HTMLInputElement | null>(null);
  const [editing, setEditing] = useState<ShipperRow | null>(null);
  const [form, setForm] = useState<ShipperForm>(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<ShipperRow | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const industriesQuery = useQuery({
    queryKey: ["shipper-industry-options"],
    enabled: authed && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("industries")
        .select("id, code, name")
        .is("deleted_at", null)
        .order("name")
        .limit(300);
      if (error) throw error;
      return (data ?? []) as { id: string; code: string; name: string }[];
    },
  });
  const industries = industriesQuery.data ?? [];

  const rows: ShipperRow[] = authed ? (live.rows as ShipperDbRow[]).map(rowToView) : demoRows;

  const canAdd = !authed || rc.perms.canAdd;
  const canModify = !authed || rc.perms.canModify;
  const canDelete = !authed || rc.perms.canDelete;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (
        q &&
        ![r.originCode, r.code, r.name, r.address1, r.mobile, r.gstNo, r.aadharNo].some((v) =>
          String(v).toLowerCase().includes(q),
        )
      )
        return false;
      if (
        colFilters.originCode &&
        !r.originCode.toLowerCase().includes(colFilters.originCode.toLowerCase())
      )
        return false;
      if (colFilters.code && !r.code.toLowerCase().includes(colFilters.code.toLowerCase()))
        return false;
      if (colFilters.name && !r.name.toLowerCase().includes(colFilters.name.toLowerCase()))
        return false;
      if (
        colFilters.address1 &&
        !r.address1.toLowerCase().includes(colFilters.address1.toLowerCase())
      )
        return false;
      if (colFilters.mobile && !r.mobile.toLowerCase().includes(colFilters.mobile.toLowerCase()))
        return false;
      if (colFilters.gstNo && !r.gstNo.toLowerCase().includes(colFilters.gstNo.toLowerCase()))
        return false;
      if (
        colFilters.aadharNo &&
        !r.aadharNo.toLowerCase().includes(colFilters.aadharNo.toLowerCase())
      )
        return false;
      return true;
    });
  }, [rows, search, colFilters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const startIdx = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const resetKycUi = () => {
    setKycOpen(false);
    setKycRows([]);
    setKycDocType(KYC_TYPES[0]);
    setKycFileName("");
    if (kycFileRef.current) kycFileRef.current.value = "";
  };

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    resetKycUi();
    setOpen(true);
  };

  const openEdit = async (row: ShipperRow) => {
    setEditing(row);
    const { id: _id, row_version: _rv, ...rest } = row;
    setForm(rest);
    resetKycUi();
    setOpen(true);
    if (authed) {
      try {
        const docs = await fetchShipperKyc(row.id);
        setKycRows(
          docs.map((d) => ({
            id: crypto.randomUUID(),
            shipperCode: row.code,
            fileName: d.file_name,
            imageType: d.kyc_type,
            entryDate: d.entry_date,
          })),
        );
      } catch {
        /* empty on load failure */
      }
    }
  };

  const kycPayload = () =>
    kycRows.map((r) => ({
      kyc_type: r.imageType,
      file_name: r.fileName,
      entry_date: r.entryDate,
    }));

  const handleUploadKyc = () => {
    if (!kycFileName) return toast.error("Choose a file first");
    setKycRows((prev) => [
      {
        id: crypto.randomUUID(),
        shipperCode: form.code.trim() || "—",
        fileName: kycFileName,
        imageType: kycDocType,
        entryDate: new Date().toISOString(),
      },
      ...prev,
    ]);
    setKycFileName("");
    if (kycFileRef.current) kycFileRef.current.value = "";
    toast.success("KYC uploaded");
  };

  const handleSave = async () => {
    const raw = toRaw(form);
    if (authed) {
      setSaving(true);
      try {
        let shipperId = editing?.id;
        if (editing) {
          await rc.update.mutateAsync({
            id: editing.id,
            rowVersion: editing.row_version ?? 0,
            patch: shipperUpdateSchema.parse(raw),
          });
          toast.success("Shipper updated");
        } else {
          const created = await rc.create.mutateAsync(shipperCreateSchema.parse(raw));
          shipperId = created.id;
          toast.success("Shipper added");
        }
        if (shipperId) await replaceShipperKyc(shipperId, kycPayload());
        setOpen(false);
        resetKycUi();
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not save shipper"));
      } finally {
        setSaving(false);
      }
      return;
    }
    if (!form.code.trim()) return toast.error("Shipper Code is required");
    if (!form.name.trim()) return toast.error("Shipper Name is required");
    if (editing) {
      setDemoRows((prev) => prev.map((r) => (r.id === editing.id ? { ...editing, ...form } : r)));
      toast.success("Shipper updated");
    } else {
      setDemoRows((prev) => [{ id: crypto.randomUUID(), ...form }, ...prev]);
      toast.success("Shipper added");
    }
    setOpen(false);
    resetKycUi();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const row = deleteTarget;
    if (authed) {
      try {
        await rc.remove.mutateAsync({ id: row.id, rowVersion: row.row_version ?? 0 });
        toast.success(`Deleted ${row.code}`);
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not delete shipper"));
      }
    } else {
      setDemoRows((prev) => prev.filter((r) => r.id !== row.id));
      toast.success(`Deleted ${row.code}`);
    }
    setSelected((prev) => {
      const n = new Set(prev);
      n.delete(row.id);
      return n;
    });
    setDeleteTarget(null);
  };

  const confirmBulkDelete = async () => {
    const ids = selected;
    if (ids.size === 0) return;
    if (authed) {
      const targets = rows.filter((r) => ids.has(r.id));
      let ok = 0;
      for (const r of targets) {
        try {
          await rc.remove.mutateAsync({ id: r.id, rowVersion: r.row_version ?? 0 });
          ok++;
        } catch {
          /* keep going */
        }
      }
      if (ok === targets.length) toast.success(`Deleted ${ok} shipper${ok === 1 ? "" : "s"}`);
      else toast.error(`Deleted ${ok} of ${targets.length}; some could not be removed`);
    } else {
      setDemoRows((prev) => prev.filter((r) => !ids.has(r.id)));
      toast.success(`Deleted ${ids.size} shipper${ids.size === 1 ? "" : "s"}`);
    }
    setSelected(new Set());
    setBulkDeleteOpen(false);
  };

  const pageIds = pageRows.map((r) => r.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const somePageSelected = pageIds.some((id) => selected.has(id));
  const togglePageAll = (checked: boolean) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (checked) pageIds.forEach((id) => n.add(id));
      else pageIds.forEach((id) => n.delete(id));
      return n;
    });
  };
  const toggleOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (checked) n.add(id);
      else n.delete(id);
      return n;
    });
  };

  const handleImportRows = async (parsedRows: CsvRecord[]) => {
    try {
      if (authed) {
        const importRows = mapCsvToImportRows(parsedRows, shippersResource.importColumns, {
          aliases: SHIPPER_IMPORT_HEADER_ALIASES,
        }).map((rec, i) => normalizeShipperImportRow(rec, parsedRows[i])) as ImportRow[];
        const res = await importShippersChunked("COMMIT", importRows);
        const toastRes = formatImportToast(res);
        if (toastRes.ok) toast.success(toastRes.message);
        else toast.error(toastRes.message);
        void queryClient.invalidateQueries({ queryKey: masterKeys.all(shippersResource.key) });
        return;
      }
      const imported: ShipperRow[] = [];
      for (const [i, mapped] of mapCsvToImportRows(parsedRows, shippersResource.importColumns, {
        aliases: SHIPPER_IMPORT_HEADER_ALIASES,
      }).entries()) {
        const rec = normalizeShipperImportRow(mapped, parsedRows[i]);
        if (!rec.code?.trim()) continue;
        const status =
          (rec.status || "").trim().toLowerCase() === "inactive" ? "In-Active" : "Active";
        imported.push({
          ...emptyForm(),
          id: crypto.randomUUID(),
          originCode: (rec.origin_code || "").trim().toUpperCase(),
          code: rec.code.trim(),
          name: (rec.name || "").trim(),
          contactPerson: (rec.contact_person || "").trim(),
          address1: (rec.address1 || rec.address || "").trim(),
          address2: (rec.address2 || "").trim(),
          mobile: (rec.mobile || "").trim(),
          gstNo: (rec.gst_no || "").trim(),
          aadharNo: (rec.aadhar_no || "").trim(),
          status: status as Status,
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
    setColFilters({
      originCode: "",
      code: "",
      name: "",
      address1: "",
      mobile: "",
      gstNo: "",
      aadharNo: "",
    });
    setPage(1);
    if (authed) {
      void queryClient.invalidateQueries({ queryKey: masterKeys.all(shippersResource.key) });
    }
    toast.success("Refreshed");
  };

  const filterKeys = [
    "originCode",
    "code",
    "name",
    "address1",
    "mobile",
    "gstNo",
    "aadharNo",
  ] as const;
  const filterPlaceholders: Record<(typeof filterKeys)[number], string> = {
    originCode: "Origin Code",
    code: "Shipper Code",
    name: "Shipper Name",
    address1: "Address1",
    mobile: "Mobile No",
    gstNo: "GST No",
    aadharNo: "Aadhar No",
  };

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <MasterBreadcrumb trail={["Master", "Customer", "Shipper"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Shipper</h1>
        <p className="text-sm text-muted-foreground">
          Manage shipper (sender) directory with contact details and delivery address.
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center gap-1">
              <DataIoToolbar
                export={{
                  filename: "shippers",
                  title: "Shippers",
                  columns: [
                    { key: "originCode", header: "Origin Code" },
                    { key: "code", header: "Shipper Code" },
                    { key: "name", header: "Shipper Name" },
                    { key: "address1", header: "Address1" },
                    { key: "mobile", header: "Mobile No" },
                    { key: "gstNo", header: "GST No" },
                    { key: "aadharNo", header: "Aadhar No" },
                    { key: "status", header: "Status" },
                  ],
                  getRows: () =>
                    rows.map((r) => ({
                      originCode: r.originCode,
                      code: r.code,
                      name: r.name,
                      address1: r.address1,
                      mobile: r.mobile,
                      gstNo: r.gstNo,
                      aadharNo: r.aadharNo,
                      status: r.status,
                    })),
                }}
                import={{ onRows: handleImportRows }}
              />
              <IconButton label="Refresh" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4" />
              </IconButton>
            </div>
          </TooltipProvider>
          <div className="flex items-center gap-2">
            {selected.size > 0 && canDelete && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setBulkDeleteOpen(true)}
                className="h-9 gap-1.5"
              >
                <Trash2 className="h-4 w-4" />
                Delete Selected ({selected.size})
              </Button>
            )}
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
                <TableHead className="w-10 text-sidebar-foreground">
                  <Checkbox
                    checked={allPageSelected ? true : somePageSelected ? "indeterminate" : false}
                    onCheckedChange={(v) => togglePageAll(v === true)}
                    aria-label="Select all on page"
                    className="border-sidebar-foreground/60 data-[state=checked]:bg-primary data-[state=indeterminate]:bg-primary"
                  />
                </TableHead>
                <TableHead className="text-sidebar-foreground">Origin Code</TableHead>
                <TableHead className="text-sidebar-foreground">Shipper Code</TableHead>
                <TableHead className="text-sidebar-foreground">Shipper Name</TableHead>
                <TableHead className="text-sidebar-foreground">Address1</TableHead>
                <TableHead className="text-sidebar-foreground">Mobile No</TableHead>
                <TableHead className="text-sidebar-foreground">GST No</TableHead>
                <TableHead className="text-sidebar-foreground">Aadhar No</TableHead>
                <TableHead className="w-28 text-center text-sidebar-foreground">Action</TableHead>
              </TableRow>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                <TableHead />
                {filterKeys.map((k) => (
                  <TableHead key={k} className="py-2">
                    <Input
                      value={colFilters[k]}
                      onChange={(e) => {
                        setColFilters((f) => ({ ...f, [k]: e.target.value }));
                        setPage(1);
                      }}
                      placeholder={filterPlaceholders[k]}
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
                  <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined}>
                    <TableCell className="w-10">
                      <Checkbox
                        checked={selected.has(r.id)}
                        onCheckedChange={(v) => toggleOne(r.id, v === true)}
                        aria-label={`Select ${r.code}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{r.originCode}</TableCell>
                    <TableCell>{r.code}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="max-w-[220px] truncate" title={r.address1}>
                      {r.address1}
                    </TableCell>
                    <TableCell>{r.mobile}</TableCell>
                    <TableCell>{r.gstNo}</TableCell>
                    <TableCell>{r.aadharNo}</TableCell>
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
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Shipper" : "Shipper Details"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 py-2 sm:grid-cols-2 lg:grid-cols-4">
            <FieldWrapper label="Origin">
              <div className="flex gap-1">
                <Input
                  value={form.originCode}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      originCode: e.target.value.toUpperCase(),
                      originId: "",
                    }))
                  }
                  placeholder="Code"
                  className="w-[4.5rem] shrink-0"
                />
                {authed ? (
                  <LookupCombobox
                    lookupKey="destination"
                    value={form.originId ?? ""}
                    valueLabel={form.originName || form.originCode}
                    onChange={(id, item) =>
                      setForm((f) => ({
                        ...f,
                        originId: id,
                        originCode: item?.code ?? f.originCode,
                        originName: item?.name ?? "",
                      }))
                    }
                    placeholder="Search origin..."
                    className="min-w-0 flex-1"
                  />
                ) : (
                  <LookupInput
                    lookup="destination"
                    returnField="code-name"
                    value={form.originName || form.originCode}
                    onChange={(v) => {
                      const [code, ...rest] = v.split(" - ");
                      setForm((f) => ({
                        ...f,
                        originCode: (code || v).trim().toUpperCase(),
                        originName: rest.join(" - ").trim(),
                      }));
                    }}
                  />
                )}
              </div>
            </FieldWrapper>
            <FieldWrapper label="Shipper Code" required>
              <Input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper label="Shipper Name" required>
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

            <FieldWrapper label="Address 1" className="sm:col-span-2">
              <Input
                value={form.address1}
                onChange={(e) => setForm((f) => ({ ...f, address1: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper label="Address 2" className="sm:col-span-2">
              <Input
                value={form.address2}
                onChange={(e) => setForm((f) => ({ ...f, address2: e.target.value }))}
              />
            </FieldWrapper>

            <FieldWrapper label="Pin Code">
              {authed ? (
                <LookupCombobox
                  lookupKey="pin-code"
                  value={form.pinCode}
                  valueLabel={form.pinCode}
                  onChange={(_id, item) =>
                    setForm((f) => ({
                      ...f,
                      pinCode: item?.code ?? "",
                      city: item?.name ?? f.city,
                    }))
                  }
                  placeholder="Search pin code..."
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
                  valueLabel={form.stateName}
                  onChange={(id, item) =>
                    setForm((f) => ({
                      ...f,
                      stateId: id,
                      stateName: item?.name ?? "",
                    }))
                  }
                  placeholder="Search state..."
                />
              ) : (
                <LookupInput
                  lookup="state"
                  value={form.stateName}
                  onChange={(v) => setForm((f) => ({ ...f, stateName: v }))}
                />
              )}
            </FieldWrapper>
            <FieldWrapper label="Industry">
              {authed ? (
                <Select
                  value={form.industryId || "__none__"}
                  onValueChange={(v) => {
                    if (v === "__none__") {
                      setForm((f) => ({ ...f, industryId: "", industryName: "" }));
                      return;
                    }
                    const hit = industries.find((i) => i.id === v);
                    setForm((f) => ({
                      ...f,
                      industryId: v,
                      industryName: hit?.name ?? "",
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Industry" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select Industry</SelectItem>
                    {industries.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <LookupInput
                  lookup="industry"
                  value={form.industryName}
                  onChange={(v) => setForm((f) => ({ ...f, industryName: v }))}
                />
              )}
            </FieldWrapper>

            <FieldWrapper label="Telephone 1">
              <Input
                value={form.telephone1}
                onChange={(e) => setForm((f) => ({ ...f, telephone1: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper label="Telephone 2">
              <Input
                value={form.telephone2}
                onChange={(e) => setForm((f) => ({ ...f, telephone2: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper label="Fax">
              <Input
                value={form.fax}
                onChange={(e) => setForm((f) => ({ ...f, fax: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </FieldWrapper>

            <FieldWrapper label="Mobile">
              <Input
                value={form.mobile}
                onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper label="IEC No.">
              <Input
                value={form.iecNo}
                onChange={(e) => setForm((f) => ({ ...f, iecNo: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper label="GST No.">
              <Input
                value={form.gstNo}
                onChange={(e) => setForm((f) => ({ ...f, gstNo: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper label="Aadhar No.">
              <Input
                value={form.aadharNo}
                onChange={(e) => setForm((f) => ({ ...f, aadharNo: e.target.value }))}
              />
            </FieldWrapper>

            <FieldWrapper label="PAN No.">
              <Input
                value={form.panNo}
                onChange={(e) => setForm((f) => ({ ...f, panNo: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper label="Service Center">
              {authed ? (
                <LookupCombobox
                  lookupKey="service-center"
                  value={form.serviceCenterId ?? ""}
                  valueLabel={
                    form.serviceCenterCode || form.serviceCenterName
                      ? [form.serviceCenterCode, form.serviceCenterName].filter(Boolean).join(" - ")
                      : ""
                  }
                  onChange={(id, item) =>
                    setForm((f) => ({
                      ...f,
                      serviceCenterId: id,
                      serviceCenterCode: item?.code ?? "",
                      serviceCenterName: item?.name ?? "",
                    }))
                  }
                  placeholder="Search service center..."
                />
              ) : (
                <LookupInput
                  lookup="serviceCentre"
                  returnField="code"
                  value={form.serviceCenterCode}
                  onChange={(v) => setForm((f) => ({ ...f, serviceCenterCode: v }))}
                />
              )}
            </FieldWrapper>
            <FieldWrapper label="Bank AD Code">
              <Input
                value={form.bankAdCode}
                onChange={(e) => setForm((f) => ({ ...f, bankAdCode: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper label="Bank Account">
              <Input
                value={form.bankAccount}
                onChange={(e) => setForm((f) => ({ ...f, bankAccount: e.target.value }))}
              />
            </FieldWrapper>

            <FieldWrapper label="Bank IFSC">
              <Input
                value={form.bankIfsc}
                onChange={(e) => setForm((f) => ({ ...f, bankIfsc: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper label="Firm">
              <Select
                value={form.firm || "__none__"}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, firm: v === "__none__" ? "" : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Firm" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select Firm</SelectItem>
                  {FIRMS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>
            <FieldWrapper label="NFEI">
              <div className="flex h-10 items-center gap-2">
                <Checkbox
                  checked={form.nfei}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, nfei: v === true }))}
                  id="shipper-nfei"
                />
                <Label htmlFor="shipper-nfei" className="text-sm font-normal">
                  NFEI
                </Label>
              </div>
            </FieldWrapper>
            <FieldWrapper label="LUT Number">
              <Input
                value={form.lutNumber}
                onChange={(e) => setForm((f) => ({ ...f, lutNumber: e.target.value }))}
              />
            </FieldWrapper>

            <FieldWrapper label="LUT Issue Date">
              <Input
                type="date"
                value={form.lutIssueDate}
                onChange={(e) => setForm((f) => ({ ...f, lutIssueDate: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper label="LUT Till Date">
              <Input
                type="date"
                value={form.lutTillDate}
                onChange={(e) => setForm((f) => ({ ...f, lutTillDate: e.target.value }))}
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
            <div className="flex items-end sm:col-span-2 lg:col-span-1">
              <button
                type="button"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                onClick={() => setKycOpen((v) => !v)}
              >
                Click here for Kyc Details
              </button>
            </div>
          </div>

          {kycOpen && (
            <div className="mt-2 space-y-3 border-t pt-4">
              <div>
                <span className="inline-flex rounded-full bg-sidebar px-3 py-1 text-xs font-semibold text-sidebar-foreground">
                  Kyc Details
                </span>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-56">
                  <Label className="text-xs font-medium text-muted-foreground">Document Type</Label>
                  <Select value={kycDocType} onValueChange={setKycDocType}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {KYC_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={kycFileRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => setKycFileName(e.target.files?.[0]?.name ?? "")}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => kycFileRef.current?.click()}
                  >
                    Choose
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {kycFileName || "No file selected."}
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="bg-orange-500 text-white hover:bg-orange-500/90"
                  onClick={handleUploadKyc}
                >
                  Upload
                </Button>
              </div>

              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-sidebar hover:bg-sidebar">
                      <TableHead className="text-sidebar-foreground">Shipper Code</TableHead>
                      <TableHead className="text-sidebar-foreground">File Name</TableHead>
                      <TableHead className="text-sidebar-foreground">Image Type</TableHead>
                      <TableHead className="text-sidebar-foreground">Entry Date</TableHead>
                      <TableHead className="w-24 text-center text-sidebar-foreground">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {kycRows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="h-16 text-center text-sm text-muted-foreground"
                        >
                          No KYC documents
                        </TableCell>
                      </TableRow>
                    ) : (
                      kycRows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>{r.shipperCode}</TableCell>
                          <TableCell>{r.fileName}</TableCell>
                          <TableCell>{r.imageType}</TableCell>
                          <TableCell>
                            {r.entryDate ? new Date(r.entryDate).toLocaleDateString() : "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() =>
                                setKycRows((prev) => prev.filter((x) => x.id !== r.id))
                              }
                              aria-label={`Remove ${r.fileName}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-emerald-600 text-white hover:bg-emerald-600/90"
            >
              Save
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setOpen(false);
                resetKycUi();
              }}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete shipper?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              <span className="font-medium text-foreground">{deleteTarget?.code}</span>
              {deleteTarget?.name ? ` (${deleteTarget.name})` : ""} from the shipper master.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selected.size} shipper{selected.size === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the selected shippers from the shipper master. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkDelete}
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
  const [open, setOpen] = useState(false);
  return (
    <div className="flex gap-1">
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
      <Button
        size="icon"
        variant="outline"
        className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
        aria-label="Search"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4" />
      </Button>
      <MasterLookupDialog
        open={open}
        onOpenChange={setOpen}
        lookup={lookup}
        returnField={returnField}
        onSelect={(v) => onChange(v)}
      />
    </div>
  );
}
