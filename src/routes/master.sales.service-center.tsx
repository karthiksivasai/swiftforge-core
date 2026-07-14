import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  Download,
  Upload,
  RefreshCw,
  Plus,
  Search,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Check,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import { toast } from "sonner";
import { BRANCHES } from "@/lib/branches-data";
import { cn } from "@/lib/utils";

import { useAuth } from "@/lib/auth";
import { useMasterResource } from "@/lib/masters/core/useMasterResource";
import { masterKeys } from "@/lib/masters/core/queryKeys";
import { parseCsv, mapCsvToImportRows, type ImportRow } from "@/lib/masters/core";
import {
  serviceCentersResource,
  fetchServiceCenterTerms,
  saveServiceCenter,
  type ServiceCenterRow as ServiceCenterDbRow,
} from "@/lib/masters/resources/serviceCenters";
import {
  serviceCenterCreateSchema,
  serviceCenterUpdateSchema,
} from "@/lib/masters/schemas/serviceCenters";
import { useMasterList, toErrorMessage, importSummary } from "@/lib/masters/screen";

type ServiceCentre = {
  id: string;
  code: string;
  name: string;
  subName?: string;
  branch: string;
  address1?: string;
  address2?: string;
  address3?: string;
  address4?: string;
  destination?: string;
  state?: string;
  stateCode?: string;
  telephone?: string;
  email?: string;
  gstNo?: string;
  gstTelephone?: string;
  panNo?: string;
  icnNo?: string;
  stNo?: string;
  pinCode?: string;
  // Terms
  terms1?: string;
  terms2?: string;
  terms3?: string;
  terms4?: string;
  terms5?: string;
  terms6?: string;
  terms7?: string;
  terms8?: string;
  terms9?: string;
  terms10?: string;
  // Bank
  bankName?: string;
  accountNo?: string;
  accountName?: string;
  bankAddress?: string;
  rtgsIfsc?: string;
  micr?: string;
  // Last Invoice / Voucher
  lastInvoicePrefix?: string;
  lastInvoiceNo?: string;
  lastInvoiceSuffix?: string;
  freeFormPrefix?: string;
  lastFreeFormInvoiceNo?: string;
  freeFormSuffix?: string;
  debitNotePrefix?: string;
  debitNoteLastInvoiceNo?: string;
  debitNoteSuffix?: string;
  creditNotePrefix?: string;
  creditNoteLastInvoiceNo?: string;
  creditNoteSuffix?: string;
  rcpLastNo?: string;
  row_version?: number;
};

const TERM_KEYS = [
  "terms1",
  "terms2",
  "terms3",
  "terms4",
  "terms5",
  "terms6",
  "terms7",
  "terms8",
  "terms9",
  "terms10",
] as const;

const SEED: ServiceCentre[] = [
  { id: "sc-1", code: "AKL", name: "AUCKLAND", branch: "AKL" },
  { id: "sc-2", code: "AM", name: "AUSTRALIA METRO", branch: "AUM" },
  { id: "sc-3", code: "BAN", name: "Bangalore", branch: "BLR" },
  { id: "sc-4", code: "CAN", name: "CANADA", branch: "CA" },
  { id: "sc-5", code: "GUN", name: "GUNTUR", branch: "GUN" },
  { id: "sc-6", code: "HYD", name: "HYD", branch: "HYD" },
  { id: "sc-7", code: "KUL", name: "KUALA LUMPUR", branch: "MY" },
  { id: "sc-8", code: "MAH", name: "MAHARASHTRA", branch: "MAH" },
  { id: "sc-9", code: "MNL", name: "MANILA (PHILIPPINES)", branch: "PH" },
  { id: "sc-10", code: "MEL", name: "MELBOURNE", branch: "MEL" },
  { id: "sc-11", code: "MUM", name: "MUMBAI COURIERWALA", branch: "BOM" },
  { id: "sc-12", code: "PER", name: "PERTH", branch: "PER" },
  { id: "sc-13", code: "SYD", name: "SYDNEY", branch: "AER" },
  { id: "sc-14", code: "UK", name: "UNITED KINGDOM", branch: "GB" },
  { id: "sc-15", code: "USA", name: "UNITED STATES OF AMERICA", branch: "US" },
];

const PAGE_SIZE = 10;

export const Route = createFileRoute("/master/sales/service-center")({
  head: () => ({
    meta: [
      { title: "Service Centre — Master — Courier ERP" },
      {
        name: "description",
        content:
          "Manage service centre master records including bank, terms, and voucher settings.",
      },
    ],
  }),
  component: ServiceCentrePage,
});

function emptyForm(): Omit<ServiceCentre, "id"> {
  return {
    code: "",
    name: "",
    branch: "",
  };
}

/** Map a persisted DB row (snake_case) to the form/view shape (camelCase). */
function rowToView(r: ServiceCenterDbRow): ServiceCentre {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    subName: r.sub_name ?? "",
    branch: r.branch ?? "",
    address1: r.address1 ?? "",
    address2: r.address2 ?? "",
    address3: r.address3 ?? "",
    address4: r.address4 ?? "",
    destination: r.destination ?? "",
    state: r.state ?? "",
    stateCode: r.state_code ?? "",
    telephone: r.telephone ?? "",
    email: r.email ?? "",
    gstNo: r.gst_no ?? "",
    gstTelephone: r.gst_telephone ?? "",
    panNo: r.pan_no ?? "",
    icnNo: r.icn_no ?? "",
    stNo: r.st_no ?? "",
    pinCode: r.pin_code ?? "",
    bankName: r.bank_name ?? "",
    accountNo: r.account_no ?? "",
    accountName: r.account_name ?? "",
    bankAddress: r.bank_address ?? "",
    rtgsIfsc: r.rtgs_ifsc ?? "",
    micr: r.micr ?? "",
    lastInvoicePrefix: r.last_invoice_prefix ?? "",
    lastInvoiceNo: r.last_invoice_no ?? "",
    lastInvoiceSuffix: r.last_invoice_suffix ?? "",
    freeFormPrefix: r.free_form_prefix ?? "",
    lastFreeFormInvoiceNo: r.last_free_form_invoice_no ?? "",
    freeFormSuffix: r.free_form_suffix ?? "",
    debitNotePrefix: r.debit_note_prefix ?? "",
    debitNoteLastInvoiceNo: r.debit_note_last_invoice_no ?? "",
    debitNoteSuffix: r.debit_note_suffix ?? "",
    creditNotePrefix: r.credit_note_prefix ?? "",
    creditNoteLastInvoiceNo: r.credit_note_last_invoice_no ?? "",
    creditNoteSuffix: r.credit_note_suffix ?? "",
    rcpLastNo: r.rcp_last_no ?? "",
    row_version: r.row_version,
  };
}

/** Map the form (camelCase) to the aggregate RPC root fields (snake_case). */
function formToFields(f: Omit<ServiceCentre, "id">): Record<string, unknown> {
  return {
    code: f.code,
    name: f.name,
    sub_name: f.subName,
    address1: f.address1,
    address2: f.address2,
    address3: f.address3,
    address4: f.address4,
    destination: f.destination,
    branch: f.branch,
    state: f.state,
    state_code: f.stateCode,
    pin_code: f.pinCode,
    telephone: f.telephone,
    email: f.email,
    gst_no: f.gstNo,
    gst_telephone: f.gstTelephone,
    pan_no: f.panNo,
    icn_no: f.icnNo,
    st_no: f.stNo,
    bank_name: f.bankName,
    account_no: f.accountNo,
    account_name: f.accountName,
    bank_address: f.bankAddress,
    rtgs_ifsc: f.rtgsIfsc,
    micr: f.micr,
    last_invoice_prefix: f.lastInvoicePrefix,
    last_invoice_no: f.lastInvoiceNo,
    last_invoice_suffix: f.lastInvoiceSuffix,
    free_form_prefix: f.freeFormPrefix,
    last_free_form_invoice_no: f.lastFreeFormInvoiceNo,
    free_form_suffix: f.freeFormSuffix,
    debit_note_prefix: f.debitNotePrefix,
    debit_note_last_invoice_no: f.debitNoteLastInvoiceNo,
    debit_note_suffix: f.debitNoteSuffix,
    credit_note_prefix: f.creditNotePrefix,
    credit_note_last_invoice_no: f.creditNoteLastInvoiceNo,
    credit_note_suffix: f.creditNoteSuffix,
    rcp_last_no: f.rcpLastNo,
  };
}

/** The Terms child collection, in display order, blanks dropped. */
function termsFromForm(f: Omit<ServiceCentre, "id">): string[] {
  return TERM_KEYS.map((k) => (f[k] ?? "").trim()).filter((t) => t.length > 0);
}

function getPageItems(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const items: (number | "…")[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) items.push("…");
  for (let i = left; i <= right; i++) items.push(i);
  if (right < total - 1) items.push("…");
  items.push(total);
  return items;
}

function ServiceCentrePage() {
  const { isAuthenticated: authed } = useAuth();
  const rc = useMasterResource(serviceCentersResource);
  const live = useMasterList(serviceCentersResource, { enabled: authed });
  const queryClient = useQueryClient();

  const [demoRows, setDemoRows] = useState<ServiceCentre[]>(SEED);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"list" | "form">("list");
  const [editing, setEditing] = useState<ServiceCentre | null>(null);
  const [form, setForm] = useState<Omit<ServiceCentre, "id">>(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<ServiceCentre | null>(null);
  const [branchDialogOpen, setBranchDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const rows: ServiceCentre[] = authed
    ? (live.rows as ServiceCenterDbRow[]).map(rowToView)
    : demoRows;

  const canAdd = !authed || rc.perms.canAdd;
  const canModify = !authed || rc.perms.canModify;
  const canDelete = !authed || rc.perms.canDelete;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.branch.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function openAdd() {
    setEditing(null);
    setForm(emptyForm());
    setView("form");
  }

  async function openEdit(row: ServiceCentre) {
    setEditing(row);
    const { id: _id, row_version: _rv, ...rest } = row;
    setForm(rest);
    setView("form");
    // Live: load the Terms child collection into the fixed slots (top-filled).
    if (authed) {
      try {
        const terms = await fetchServiceCenterTerms(row.id);
        setForm((f) => {
          const next = { ...f };
          TERM_KEYS.forEach((k, i) => {
            next[k] = terms[i] ?? "";
          });
          return next;
        });
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not load terms"));
      }
    }
  }

  async function save() {
    if (authed) {
      const raw = formToFields(form);
      setSaving(true);
      try {
        const fields = editing
          ? serviceCenterUpdateSchema.parse(raw)
          : serviceCenterCreateSchema.parse(raw);
        await saveServiceCenter({
          id: editing?.id ?? null,
          rowVersion: editing?.row_version ?? null,
          fields,
          terms: termsFromForm(form),
        });
        await queryClient.invalidateQueries({
          queryKey: masterKeys.all(serviceCentersResource.key),
        });
        toast.success(editing ? "Service centre updated" : "Service centre added");
        setView("list");
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not save service centre"));
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Code and Name are required");
      return;
    }
    if (editing) {
      setDemoRows((prev) => prev.map((r) => (r.id === editing.id ? { ...editing, ...form } : r)));
      toast.success("Service centre updated");
    } else {
      const id = `sc-${Date.now()}`;
      setDemoRows((prev) => [{ id, ...form }, ...prev]);
      toast.success("Service centre added");
    }
    setView("list");
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const row = deleteTarget;
    if (authed) {
      try {
        await rc.remove.mutateAsync({ id: row.id, rowVersion: row.row_version ?? 0 });
        toast.success("Deleted");
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not delete service centre"));
      }
    } else {
      setDemoRows((prev) => prev.filter((r) => r.id !== row.id));
      toast.success("Deleted");
    }
    setDeleteTarget(null);
  }

  function exportCsv() {
    const headers = ["Code", "Name", "Branch"];
    const lines = [headers.join(",")];
    for (const r of rows) {
      lines.push(
        [r.code, r.name, r.branch].map((v) => `"${(v ?? "").replace(/"/g, '""')}"`).join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "service-centre.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  }

  async function importFile(file: File) {
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.rows.length === 0) return toast.error("File is empty");

      if (authed) {
        const importRows = mapCsvToImportRows(
          parsed.rows,
          serviceCentersResource.importColumns,
        ) as ImportRow[];
        const res = await rc.commitImport.mutateAsync(importRows);
        toast.success(importSummary(res));
        return;
      }

      const parsedRows: ServiceCentre[] = [];
      let i = 0;
      for (const rec of mapCsvToImportRows(parsed.rows, ["code", "name", "branch"])) {
        if (!rec.code?.trim()) continue;
        parsedRows.push({
          id: `sc-imp-${Date.now()}-${i++}`,
          code: rec.code.trim(),
          name: (rec.name || "").trim(),
          branch: (rec.branch || "").trim(),
        });
      }
      if (parsedRows.length === 0) return toast.error("No valid rows found");
      setDemoRows((prev) => [...parsedRows, ...prev]);
      toast.success(`Imported ${parsedRows.length} rows`);
    } catch (err) {
      toast.error(toErrorMessage(err, "Failed to import file"));
    }
  }

  const startIdx = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, filtered.length);

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/dashboard">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <span className="text-muted-foreground">Master</span>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <span className="text-muted-foreground">Sales</span>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Service Centre</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Service Centre</h1>
        <p className="text-sm text-muted-foreground">
          Manage service centres, their branch mapping, and billing details.
        </p>
      </div>

      {view === "list" ? (
        <Card className="overflow-hidden p-0">
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importFile(f);
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
            <TooltipProvider delayDuration={200}>
              <div className="flex items-center gap-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 bg-background"
                      onClick={exportCsv}
                      aria-label="Export"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Export</TooltipContent>
                </Tooltip>
                {canAdd ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 bg-background"
                        onClick={() => importInputRef.current?.click()}
                        aria-label="Import"
                      >
                        <Upload className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Import</TooltipContent>
                  </Tooltip>
                ) : null}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 bg-background"
                      onClick={() => {
                        setSearch("");
                        setPage(1);
                        if (authed)
                          queryClient.invalidateQueries({
                            queryKey: masterKeys.all(serviceCentersResource.key),
                          });
                        else setDemoRows(SEED);
                        toast.success("Refreshed");
                      }}
                      aria-label="Refresh"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Refresh</TooltipContent>
                </Tooltip>
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
              {canAdd ? (
                <Button size="sm" onClick={openAdd} className="h-9 gap-1.5">
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              ) : null}
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-sidebar hover:bg-sidebar">
                  <TableHead className="text-sidebar-foreground">Service Centre Code</TableHead>
                  <TableHead className="text-sidebar-foreground">Service Centre Name</TableHead>
                  <TableHead className="text-sidebar-foreground">Branch</TableHead>
                  <TableHead className="w-28 text-center text-sidebar-foreground">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="h-32 text-center text-sm text-muted-foreground"
                    >
                      No data available in table.
                    </TableCell>
                  </TableRow>
                ) : (
                  pageRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.code}</TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell>{r.branch}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-1">
                          {canModify ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => openEdit(r)}
                              aria-label={`Edit ${r.code}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          ) : null}
                          {canDelete ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(r)}
                              aria-label={`Delete ${r.code}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
            <span>
              Showing {startIdx} to {endIdx} of {filtered.length} entries
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={currentPage === 1}
                onClick={() => setPage(1)}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={currentPage === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {getPageItems(currentPage, totalPages).map((it, i) =>
                it === "…" ? (
                  <span
                    key={`e-${i}`}
                    className="grid h-8 min-w-8 place-items-center px-2 text-sm text-muted-foreground"
                  >
                    …
                  </span>
                ) : (
                  <button
                    key={it}
                    onClick={() => setPage(it)}
                    className={`h-8 min-w-8 rounded-md px-2 text-sm font-medium transition-colors ${
                      it === currentPage
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground hover:bg-accent"
                    }`}
                  >
                    {it}
                  </button>
                ),
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={currentPage === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={currentPage === totalPages}
                onClick={() => setPage(totalPages)}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <ServiceCentreForm
          form={form}
          setForm={setForm}
          editing={editing}
          saving={saving}
          onCancel={() => setView("list")}
          onSave={save}
          openBranchDialog={() => setBranchDialogOpen(true)}
        />
      )}

      <BranchPickerDialog
        open={branchDialogOpen}
        onOpenChange={setBranchDialogOpen}
        onSelect={(b) => {
          setForm((f) => ({ ...f, destination: b.name, branch: b.code || f.branch }));
          setBranchDialogOpen(false);
        }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete service centre?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. {deleteTarget?.name} will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5 space-y-4">
      <div className="inline-flex items-center px-3 py-1 rounded-full bg-sidebar text-sidebar-foreground text-xs font-medium">
        {title}
      </div>
      {children}
    </Card>
  );
}

function ServiceCentreForm({
  form,
  setForm,
  editing,
  saving,
  onCancel,
  onSave,
  openBranchDialog,
}: {
  form: Omit<ServiceCentre, "id">;
  setForm: React.Dispatch<React.SetStateAction<Omit<ServiceCentre, "id">>>;
  editing: ServiceCentre | null;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
  openBranchDialog: () => void;
}) {
  const set = <K extends keyof Omit<ServiceCentre, "id">>(k: K, v: Omit<ServiceCentre, "id">[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      <Section title="Service Center Details">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Field label="Code">
            <Input value={form.code} onChange={(e) => set("code", e.target.value)} />
          </Field>
          <Field label="Name">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="SubName">
            <Input value={form.subName ?? ""} onChange={(e) => set("subName", e.target.value)} />
          </Field>
          <Field label="Address1">
            <Input value={form.address1 ?? ""} onChange={(e) => set("address1", e.target.value)} />
          </Field>
          <Field label="Address2">
            <Input value={form.address2 ?? ""} onChange={(e) => set("address2", e.target.value)} />
          </Field>
          <Field label="Address3">
            <Input value={form.address3 ?? ""} onChange={(e) => set("address3", e.target.value)} />
          </Field>
          <Field label="Address4">
            <Input value={form.address4 ?? ""} onChange={(e) => set("address4", e.target.value)} />
          </Field>
          <Field label="Destination">
            <div className="flex gap-2">
              <Input
                value={form.destination ?? ""}
                onChange={(e) => set("destination", e.target.value)}
                readOnly
              />
              <Button type="button" variant="outline" size="icon" onClick={openBranchDialog}>
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </Field>
          <Field label="State">
            <div className="flex gap-2">
              <Input value={form.state ?? ""} onChange={(e) => set("state", e.target.value)} />
              <Input
                className="w-20"
                value={form.stateCode ?? ""}
                onChange={(e) => set("stateCode", e.target.value)}
              />
            </div>
          </Field>
          <Field label="Telephone">
            <Input
              value={form.telephone ?? ""}
              onChange={(e) => set("telephone", e.target.value)}
            />
          </Field>
          <Field label="Email Address">
            <Input value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="GST No.">
            <Input value={form.gstNo ?? ""} onChange={(e) => set("gstNo", e.target.value)} />
          </Field>
          <Field label="GST Telephone">
            <Input
              value={form.gstTelephone ?? ""}
              onChange={(e) => set("gstTelephone", e.target.value)}
            />
          </Field>
          <Field label="PAN No.">
            <Input value={form.panNo ?? ""} onChange={(e) => set("panNo", e.target.value)} />
          </Field>
          <Field label="ICN No.">
            <Input value={form.icnNo ?? ""} onChange={(e) => set("icnNo", e.target.value)} />
          </Field>
          <Field label="ST No.">
            <Input value={form.stNo ?? ""} onChange={(e) => set("stNo", e.target.value)} />
          </Field>
          <Field label="Pin Code">
            <Input value={form.pinCode ?? ""} onChange={(e) => set("pinCode", e.target.value)} />
          </Field>
          <Field label="Company Logo">
            <Input type="file" />
          </Field>
          <Field label="Signatory Logo">
            <Input type="file" />
          </Field>
        </div>
      </Section>

      <Section title="Terms">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {TERM_KEYS.map((k, i) => (
            <Field key={k} label={`Terms ${i + 1}`}>
              <Input value={form[k] ?? ""} onChange={(e) => set(k, e.target.value)} />
            </Field>
          ))}
        </div>
      </Section>

      <Section title="Bank Details">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Field label="Bank Name">
            <Input value={form.bankName ?? ""} onChange={(e) => set("bankName", e.target.value)} />
          </Field>
          <Field label="Account No">
            <Input
              value={form.accountNo ?? ""}
              onChange={(e) => set("accountNo", e.target.value)}
            />
          </Field>
          <Field label="Account Name">
            <Input
              value={form.accountName ?? ""}
              onChange={(e) => set("accountName", e.target.value)}
            />
          </Field>
          <Field label="Bank Address">
            <Input
              value={form.bankAddress ?? ""}
              onChange={(e) => set("bankAddress", e.target.value)}
            />
          </Field>
          <Field label="RTGS / NEFT IFSC">
            <Input value={form.rtgsIfsc ?? ""} onChange={(e) => set("rtgsIfsc", e.target.value)} />
          </Field>
          <Field label="MICR">
            <Input value={form.micr ?? ""} onChange={(e) => set("micr", e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section title="Last Invoice / Voucher No.">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Field label="Last Invoice Prefix">
            <Input
              value={form.lastInvoicePrefix ?? ""}
              onChange={(e) => set("lastInvoicePrefix", e.target.value)}
            />
          </Field>
          <Field label="Last Invoice No.">
            <Input
              value={form.lastInvoiceNo ?? ""}
              onChange={(e) => set("lastInvoiceNo", e.target.value)}
            />
          </Field>
          <Field label="Last Invoice Suffix">
            <Input
              value={form.lastInvoiceSuffix ?? ""}
              onChange={(e) => set("lastInvoiceSuffix", e.target.value)}
            />
          </Field>
          <Field label="Free Form Prefix">
            <Input
              value={form.freeFormPrefix ?? ""}
              onChange={(e) => set("freeFormPrefix", e.target.value)}
            />
          </Field>
          <Field label="Last Free Form Invoice No.">
            <Input
              value={form.lastFreeFormInvoiceNo ?? ""}
              onChange={(e) => set("lastFreeFormInvoiceNo", e.target.value)}
            />
          </Field>
          <Field label="Free Form Suffix">
            <Input
              value={form.freeFormSuffix ?? ""}
              onChange={(e) => set("freeFormSuffix", e.target.value)}
            />
          </Field>
          <Field label="Debit Note Prefix">
            <Input
              value={form.debitNotePrefix ?? ""}
              onChange={(e) => set("debitNotePrefix", e.target.value)}
            />
          </Field>
          <Field label="Debit Note Last Invoice No.">
            <Input
              value={form.debitNoteLastInvoiceNo ?? ""}
              onChange={(e) => set("debitNoteLastInvoiceNo", e.target.value)}
            />
          </Field>
          <Field label="Debit Note Suffix">
            <Input
              value={form.debitNoteSuffix ?? ""}
              onChange={(e) => set("debitNoteSuffix", e.target.value)}
            />
          </Field>
          <Field label="Credit Note Prefix">
            <Input
              value={form.creditNotePrefix ?? ""}
              onChange={(e) => set("creditNotePrefix", e.target.value)}
            />
          </Field>
          <Field label="Credit Note Last Invoice No.">
            <Input
              value={form.creditNoteLastInvoiceNo ?? ""}
              onChange={(e) => set("creditNoteLastInvoiceNo", e.target.value)}
            />
          </Field>
          <Field label="Credit Note Suffix">
            <Input
              value={form.creditNoteSuffix ?? ""}
              onChange={(e) => set("creditNoteSuffix", e.target.value)}
            />
          </Field>
          <Field label="RCP Last No.">
            <Input
              value={form.rcpLastNo ?? ""}
              onChange={(e) => set("rcpLastNo", e.target.value)}
            />
          </Field>
        </div>
      </Section>

      <div className="flex justify-end gap-2 pb-6">
        <Button
          onClick={onSave}
          disabled={saving}
          className="bg-emerald-600 text-white hover:bg-emerald-600/90"
        >
          {saving ? "Saving…" : editing ? "Update" : "Save"}
        </Button>
        <Button variant="destructive" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

const BRANCH_PAGE_SIZE = 10;

function BranchPickerDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSelect: (b: { code: string; name: string }) => void;
}) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return BRANCHES;
    return BRANCHES.filter(
      (b) => b.name.toLowerCase().includes(s) || (b.code ?? "").toLowerCase().includes(s),
    );
  }, [q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / BRANCH_PAGE_SIZE));
  const cp = Math.min(page, totalPages);
  const rows = filtered.slice((cp - 1) * BRANCH_PAGE_SIZE, cp * BRANCH_PAGE_SIZE);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Branch</DialogTitle>
        </DialogHeader>
        <div className="flex justify-end">
          <div className="flex items-center gap-2">
            <Label className="text-sm">Search</Label>
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              className="h-9 w-64"
            />
          </div>
        </div>
        <div className="rounded-md border overflow-hidden max-h-[60vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead className="w-32">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((b, i) => (
                <TableRow key={`${b.code}-${i}`}>
                  <TableCell>{b.name}</TableCell>
                  <TableCell>{b.code}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-emerald-600 hover:text-emerald-700"
                      onClick={() => onSelect({ code: b.code ?? "", name: b.name })}
                    >
                      <Check className="h-4 w-4 mr-1" /> Select
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div>
            Showing {(cp - 1) * BRANCH_PAGE_SIZE + 1} to{" "}
            {Math.min(cp * BRANCH_PAGE_SIZE, filtered.length)} of {filtered.length} entries
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" disabled={cp === 1} onClick={() => setPage(1)}>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={cp === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {getPageItems(cp, totalPages).map((it, i) =>
              it === "…" ? (
                <span key={`e-${i}`} className="px-2">
                  …
                </span>
              ) : (
                <Button
                  key={it}
                  variant={it === cp ? "default" : "ghost"}
                  size="icon"
                  onClick={() => setPage(it)}
                >
                  {it}
                </Button>
              ),
            )}
            <Button
              variant="ghost"
              size="icon"
              disabled={cp === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={cp === totalPages}
              onClick={() => setPage(totalPages)}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
