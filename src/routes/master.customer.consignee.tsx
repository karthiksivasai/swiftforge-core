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
  consigneesResource,
  CONSIGNEE_IMPORT_HEADER_ALIASES,
  fetchConsigneeKyc,
  importConsigneesChunked,
  normalizeConsigneeImportRow,
  replaceConsigneeKyc,
  type ConsigneeRow as ConsigneeDbRow,
} from "@/lib/masters/resources/consignees";
import { consigneeCreateSchema, consigneeUpdateSchema } from "@/lib/masters/schemas/consignees";
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

type KycRow = {
  id: string;
  consigneeName: string;
  fileName: string;
  imageType: string;
  entryDate: string;
};

type ConsigneeRow = {
  id: string;
  destinationCode: string;
  destinationId: string;
  destinationName: string;
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
  serviceCenterId: string;
  serviceCenterCode: string;
  serviceCenterName: string;
  eori: string;
  vat: string;
  kycType: string;
  kycDocNo: string;
  kycFileName: string;
  status: Status;
  row_version?: number;
};

type ConsigneeForm = Omit<ConsigneeRow, "id" | "row_version">;

const emptyForm = (): ConsigneeForm => ({
  destinationCode: "",
  destinationId: "",
  destinationName: "",
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
  serviceCenterId: "",
  serviceCenterCode: "",
  serviceCenterName: "",
  eori: "",
  vat: "",
  kycType: "",
  kycDocNo: "",
  kycFileName: "",
  status: "Active",
});

function rowToView(r: ConsigneeDbRow & Record<string, unknown>): ConsigneeRow {
  return {
    id: r.id,
    destinationCode: (r.destination_code as string) || (r.dest_code as string) || "",
    destinationId: r.destination_id ?? "",
    destinationName: (r.dest_name as string) || "",
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
    serviceCenterId: r.service_center_id ?? "",
    serviceCenterCode: (r.service_center_code as string) || (r.sc_code as string) || "",
    serviceCenterName: (r.sc_name as string) || "",
    eori: r.eori ?? "",
    vat: r.vat ?? "",
    kycType: r.kyc_type ?? "",
    kycDocNo: r.kyc_doc_no ?? "",
    kycFileName: r.kyc_file_name ?? "",
    status: r.status === "INACTIVE" ? "In-Active" : "Active",
    row_version: r.row_version,
  };
}

function toRaw(form: ConsigneeForm) {
  const address1 = form.address1.trim();
  const address2 = form.address2.trim();
  const mobile = form.mobile.trim() || form.telephone1.trim() || "0000000000";
  return {
    code: form.code,
    name: form.name,
    destination_id: form.destinationId || null,
    destination_code: form.destinationCode.trim().toUpperCase() || null,
    contact_person: form.contactPerson.trim() || null,
    address1: address1 || null,
    address2: address2 || null,
    telephone1: form.telephone1.trim() || null,
    telephone2: form.telephone2.trim() || null,
    fax: form.fax.trim() || null,
    industry_id: form.industryId || null,
    service_center_id: form.serviceCenterId || null,
    service_center_code: form.serviceCenterCode.trim().toUpperCase() || null,
    eori: form.eori.trim() || null,
    vat: form.vat.trim() || null,
    kyc_type: form.kycType.trim() || null,
    kyc_doc_no: form.kycDocNo.trim() || null,
    kyc_file_name: form.kycFileName.trim() || null,
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

export const Route = createFileRoute("/master/customer/consignee")({
  head: () => ({
    meta: [
      { title: "Consignee — Master — Courier ERP" },
      {
        name: "description",
        content: "Manage consignee (receiver) directory with contact and delivery address details.",
      },
    ],
  }),
  component: ConsigneePage,
});

function ConsigneePage() {
  const { isAuthenticated: authed } = useAuth();
  const rc = useMasterResource(consigneesResource);
  const live = useMasterList(consigneesResource, {
    enabled: authed,
    // Aliases avoid overwriting soft destination_code / state_name columns.
    labelRefs: [
      { idField: "destination_id", table: "destinations", as: "dest" },
      { idField: "state_id", table: "states", as: "state_label" },
      { idField: "industry_id", table: "industries", as: "industry" },
      { idField: "service_center_id", table: "service_centers", as: "sc" },
    ],
  });
  const queryClient = useQueryClient();

  const [demoRows, setDemoRows] = useState<ConsigneeRow[]>([]);
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState({
    destinationCode: "",
    code: "",
    name: "",
    address1: "",
    telephone1: "",
    telephone2: "",
  });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [kycOpen, setKycOpen] = useState(false);
  const [kycRows, setKycRows] = useState<KycRow[]>([]);
  const [kycDocType, setKycDocType] = useState<string>(KYC_TYPES[0]);
  const [kycFileName, setKycFileName] = useState("");
  const kycFileRef = useRef<HTMLInputElement | null>(null);
  const [editing, setEditing] = useState<ConsigneeRow | null>(null);
  const [form, setForm] = useState<ConsigneeForm>(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<ConsigneeRow | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const industriesQuery = useQuery({
    queryKey: ["consignee-industry-options"],
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

  const rows: ConsigneeRow[] = authed ? (live.rows as ConsigneeDbRow[]).map(rowToView) : demoRows;

  const canAdd = !authed || rc.perms.canAdd;
  const canModify = !authed || rc.perms.canModify;
  const canDelete = !authed || rc.perms.canDelete;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (
        q &&
        ![
          r.destinationCode,
          r.code,
          r.name,
          r.address1,
          r.telephone1,
          r.telephone2,
        ].some((v) => String(v).toLowerCase().includes(q))
      )
        return false;
      if (
        colFilters.destinationCode &&
        !r.destinationCode.toLowerCase().includes(colFilters.destinationCode.toLowerCase())
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
      if (
        colFilters.telephone1 &&
        !r.telephone1.toLowerCase().includes(colFilters.telephone1.toLowerCase())
      )
        return false;
      if (
        colFilters.telephone2 &&
        !r.telephone2.toLowerCase().includes(colFilters.telephone2.toLowerCase())
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

  const openEdit = async (row: ConsigneeRow) => {
    setEditing(row);
    const { id: _id, row_version: _rv, ...rest } = row;
    setForm(rest);
    resetKycUi();
    setOpen(true);
    if (authed) {
      try {
        const docs = await fetchConsigneeKyc(row.id);
        setKycRows(
          docs.map((d) => ({
            id: crypto.randomUUID(),
            consigneeName: row.name,
            fileName: d.file_name,
            imageType: d.kyc_type,
            entryDate: d.entry_date,
          })),
        );
      } catch {
        /* empty KYC on load failure */
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
        consigneeName: form.name.trim() || "—",
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
        let consigneeId = editing?.id;
        if (editing) {
          await rc.update.mutateAsync({
            id: editing.id,
            rowVersion: editing.row_version ?? 0,
            patch: consigneeUpdateSchema.parse(raw),
          });
          toast.success("Consignee updated");
        } else {
          const created = await rc.create.mutateAsync(consigneeCreateSchema.parse(raw));
          consigneeId = created.id;
          toast.success("Consignee added");
        }
        if (consigneeId) await replaceConsigneeKyc(consigneeId, kycPayload());
        setOpen(false);
        resetKycUi();
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not save consignee"));
      } finally {
        setSaving(false);
      }
      return;
    }
    if (!form.code.trim()) return toast.error("Consignee Code is required");
    if (!form.name.trim()) return toast.error("Consignee Name is required");
    if (editing) {
      setDemoRows((prev) => prev.map((r) => (r.id === editing.id ? { ...editing, ...form } : r)));
      toast.success("Consignee updated");
    } else {
      setDemoRows((prev) => [{ id: crypto.randomUUID(), ...form }, ...prev]);
      toast.success("Consignee added");
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
        toast.error(toErrorMessage(err, "Could not delete consignee"));
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
          /* keep going; report aggregate below */
        }
      }
      if (ok === targets.length) toast.success(`Deleted ${ok} consignee${ok === 1 ? "" : "s"}`);
      else toast.error(`Deleted ${ok} of ${targets.length}; some could not be removed`);
    } else {
      setDemoRows((prev) => prev.filter((r) => !ids.has(r.id)));
      toast.success(`Deleted ${ids.size} consignee${ids.size === 1 ? "" : "s"}`);
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
        const importRows = mapCsvToImportRows(parsedRows, consigneesResource.importColumns, {
          aliases: CONSIGNEE_IMPORT_HEADER_ALIASES,
        }).map((rec, i) => normalizeConsigneeImportRow(rec, parsedRows[i])) as ImportRow[];
        const res = await importConsigneesChunked("COMMIT", importRows);
        const toastRes = formatImportToast(res);
        if (toastRes.ok) toast.success(toastRes.message);
        else toast.error(toastRes.message);
        void queryClient.invalidateQueries({ queryKey: masterKeys.all(consigneesResource.key) });
        return;
      }
      const imported: ConsigneeRow[] = [];
      for (const [i, mapped] of mapCsvToImportRows(parsedRows, consigneesResource.importColumns, {
        aliases: CONSIGNEE_IMPORT_HEADER_ALIASES,
      }).entries()) {
        const rec = normalizeConsigneeImportRow(mapped, parsedRows[i]);
        if (!rec.code?.trim()) continue;
        const status =
          (rec.status || "").trim().toLowerCase() === "inactive" ? "In-Active" : "Active";
        imported.push({
          ...emptyForm(),
          id: crypto.randomUUID(),
          destinationCode: (rec.destination_code || "").trim().toUpperCase(),
          code: rec.code.trim(),
          name: (rec.name || "").trim(),
          contactPerson: (rec.contact_person || rec.customer || "").trim(),
          address1: (rec.address1 || rec.address || "").trim(),
          address2: (rec.address2 || "").trim(),
          pinCode: (rec.pin_code || "").trim(),
          city: (rec.city || "").trim(),
          stateName: (rec.state_code || "").trim(),
          telephone1: (rec.telephone1 || "").trim(),
          telephone2: (rec.telephone2 || "").trim(),
          fax: (rec.fax || "").trim(),
          email: (rec.email || "").trim(),
          mobile: (rec.mobile || rec.telephone1 || "").trim(),
          serviceCenterCode: (rec.service_center_code || "").trim().toUpperCase(),
          eori: (rec.eori || "").trim(),
          vat: (rec.vat || "").trim(),
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
      destinationCode: "",
      code: "",
      name: "",
      address1: "",
      telephone1: "",
      telephone2: "",
    });
    setPage(1);
    if (authed) {
      void queryClient.invalidateQueries({ queryKey: masterKeys.all(consigneesResource.key) });
    }
    toast.success("Refreshed");
  };

  const filterKeys = [
    "destinationCode",
    "code",
    "name",
    "address1",
    "telephone1",
    "telephone2",
  ] as const;
  const filterPlaceholders: Record<(typeof filterKeys)[number], string> = {
    destinationCode: "Destination Code",
    code: "Consignee Code",
    name: "Consignee Name",
    address1: "Address1",
    telephone1: "Telephone1",
    telephone2: "Telephone2",
  };

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <MasterBreadcrumb trail={["Master", "Customer", "Consignee"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Consignee</h1>
        <p className="text-sm text-muted-foreground">
          Manage consignee (receiver) directory with contact details and delivery address.
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center gap-1">
              <DataIoToolbar
                export={{
                  filename: "consignees",
                  title: "Consignees",
                  columns: [
                    { key: "destinationCode", header: "Destination Code" },
                    { key: "code", header: "Consignee Code" },
                    { key: "name", header: "Consignee Name" },
                    { key: "address1", header: "Address1" },
                    { key: "telephone1", header: "Telephone1" },
                    { key: "telephone2", header: "Telephone2" },
                    { key: "status", header: "Status" },
                  ],
                  getRows: () =>
                    rows.map((r) => ({
                      destinationCode: r.destinationCode,
                      code: r.code,
                      name: r.name,
                      address1: r.address1,
                      telephone1: r.telephone1,
                      telephone2: r.telephone2,
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
                <TableHead className="text-sidebar-foreground">Destination Code</TableHead>
                <TableHead className="text-sidebar-foreground">Consignee Code</TableHead>
                <TableHead className="text-sidebar-foreground">Consignee Name</TableHead>
                <TableHead className="text-sidebar-foreground">Address1</TableHead>
                <TableHead className="text-sidebar-foreground">Telephone1</TableHead>
                <TableHead className="text-sidebar-foreground">Telephone2</TableHead>
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
                  <TableCell colSpan={8} className="h-32 text-center text-sm text-muted-foreground">
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
                    <TableCell className="font-medium">{r.destinationCode}</TableCell>
                    <TableCell>{r.code}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="max-w-[220px] truncate" title={r.address1}>
                      {r.address1}
                    </TableCell>
                    <TableCell>{r.telephone1}</TableCell>
                    <TableCell>{r.telephone2}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center gap-1">
                        {canModify && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => openEdit(r)}
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
            <DialogTitle>{editing ? "Edit Consignee" : "Consignee Details"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 py-2 sm:grid-cols-2 lg:grid-cols-4">
            <FieldWrapper label="Destination">
              <div className="flex gap-1">
                <Input
                  value={form.destinationCode}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      destinationCode: e.target.value.toUpperCase(),
                      destinationId: "",
                    }))
                  }
                  placeholder="Code"
                  className="w-[4.5rem] shrink-0"
                />
                {authed ? (
                  <LookupCombobox
                    lookupKey="destination"
                    value={form.destinationId ?? ""}
                    valueLabel={form.destinationName || form.destinationCode}
                    onChange={(id, item) =>
                      setForm((f) => ({
                        ...f,
                        destinationId: id,
                        destinationCode: item?.code ?? f.destinationCode,
                        destinationName: item?.name ?? "",
                      }))
                    }
                    placeholder="Search destination..."
                    className="min-w-0 flex-1"
                  />
                ) : (
                  <LookupInput
                    lookup="destination"
                    returnField="code-name"
                    value={form.destinationName || form.destinationCode}
                    onChange={(v) => {
                      const [code, ...rest] = v.split(" - ");
                      setForm((f) => ({
                        ...f,
                        destinationCode: (code || v).trim().toUpperCase(),
                        destinationName: rest.join(" - ").trim(),
                      }));
                    }}
                  />
                )}
              </div>
            </FieldWrapper>
            <FieldWrapper label="Code" required>
              <Input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper label="Name" required>
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

            <FieldWrapper label="Tel. 1">
              <Input
                value={form.telephone1}
                onChange={(e) => setForm((f) => ({ ...f, telephone1: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper label="Tel. 2">
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
            <FieldWrapper label="EORI">
              <Input
                value={form.eori}
                onChange={(e) => setForm((f) => ({ ...f, eori: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper label="VAT">
              <Input
                value={form.vat}
                onChange={(e) => setForm((f) => ({ ...f, vat: e.target.value }))}
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
            <div className="flex items-end sm:col-span-2 lg:col-span-3">
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
                      <TableHead className="text-sidebar-foreground">Consignee Name</TableHead>
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
                          <TableCell>{r.consigneeName}</TableCell>
                          <TableCell>{r.fileName}</TableCell>
                          <TableCell>{r.imageType}</TableCell>
                          <TableCell>
                            {r.entryDate
                              ? new Date(r.entryDate).toLocaleDateString()
                              : "—"}
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
            <AlertDialogTitle>Delete consignee?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              <span className="font-medium text-foreground">{deleteTarget?.code}</span>
              {deleteTarget?.name ? ` (${deleteTarget.name})` : ""} from the consignee master.
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
              Delete {selected.size} consignee{selected.size === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the selected consignees from the consignee master. This
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
