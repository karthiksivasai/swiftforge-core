import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  RefreshCw,
  Plus,
  Search,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/lib/auth";
import { useMasterResource } from "@/lib/masters/core/useMasterResource";
import { masterKeys } from "@/lib/masters/core/queryKeys";
import { mapCsvToImportRows, type ImportRow } from "@/lib/masters/core";
import type { CsvRecord } from "@/lib/masters/core/csv";
import {
  contentsResource,
  CONTENT_IMPORT_HEADER_ALIASES,
  importContentsChunked,
  type ContentRow as ContentDbRow,
} from "@/lib/masters/resources/contents";
import { contentCreateSchema, contentUpdateSchema } from "@/lib/masters/schemas/contents";
import { useMasterList, toErrorMessage, formatImportToast } from "@/lib/masters/screen";
import { LookupCombobox } from "@/components/masters/lookup-combobox";
import { DataIoToolbar } from "@/components/data-io-toolbar";

type ContentRow = {
  id: string;
  code: string;
  name: string;
  hsnCode: string;
  vendorId: string;
  vendorName: string;
  countryId: string;
  countryName: string;
  clearanceCertNo: string;
  notificationSubType: string;
  notificationSubType1: string;
  notificationNo: string;
  srNo: string;
  igstNotification: string;
  igstSrNo: string;
  igstcNotification: string;
  igstcSrNo: string;
  row_version?: number;
};

const emptyRow = (): Omit<ContentRow, "id"> => ({
  code: "",
  name: "",
  hsnCode: "",
  vendorId: "",
  vendorName: "",
  countryId: "",
  countryName: "",
  clearanceCertNo: "",
  notificationSubType: "",
  notificationSubType1: "",
  notificationNo: "",
  srNo: "",
  igstNotification: "",
  igstSrNo: "",
  igstcNotification: "",
  igstcSrNo: "",
});

const SEED: ContentRow[] = [
  { id: "1", ...emptyRow(), code: "DOC", name: "Documents" },
  { id: "2", ...emptyRow(), code: "PAR", name: "Parcel" },
  { id: "3", ...emptyRow(), code: "GRM", name: "Garments" },
  { id: "4", ...emptyRow(), code: "ELC", name: "Electronics" },
  { id: "5", ...emptyRow(), code: "MED", name: "Medicines" },
];

const PAGE_SIZE = 10;

export const Route = createFileRoute("/master/sales/content")({
  head: () => ({
    meta: [
      { title: "Content — Master — Courier ERP" },
      { name: "description", content: "Manage the content master for shipment classification." },
    ],
  }),
  component: ContentPage,
});

function rowToView(r: ContentDbRow & Record<string, unknown>): ContentRow {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    hsnCode: r.hsn_code ?? "",
    vendorId: r.vendor_id ?? "",
    vendorName: String(r.vendor_name ?? ""),
    countryId: r.country_id ?? "",
    countryName: String(r.country_name ?? ""),
    clearanceCertNo: r.clearance_cert_no ?? "",
    notificationSubType: r.notification_sub_type ?? "",
    notificationSubType1: r.notification_sub_type1 ?? "",
    notificationNo: r.notification_no ?? "",
    srNo: r.sr_no ?? "",
    igstNotification: r.igst_notification ?? "",
    igstSrNo: r.igst_sr_no ?? "",
    igstcNotification: r.igstc_notification ?? "",
    igstcSrNo: r.igstc_sr_no ?? "",
    row_version: r.row_version,
  };
}

function toRaw(form: Omit<ContentRow, "id">) {
  return {
    code: form.code,
    name: form.name,
    hsn_code: form.hsnCode || null,
    vendor_id: form.vendorId || null,
    country_id: form.countryId || null,
    clearance_cert_no: form.clearanceCertNo || null,
    notification_sub_type: form.notificationSubType || null,
    notification_sub_type1: form.notificationSubType1 || null,
    notification_no: form.notificationNo || null,
    sr_no: form.srNo || null,
    igst_notification: form.igstNotification || null,
    igst_sr_no: form.igstSrNo || null,
    igstc_notification: form.igstcNotification || null,
    igstc_sr_no: form.igstcSrNo || null,
  };
}

function ContentPage() {
  const { isAuthenticated: authed } = useAuth();
  const rc = useMasterResource(contentsResource);
  const live = useMasterList(contentsResource, {
    enabled: authed,
    labelRefs: [
      { idField: "vendor_id", table: "vendors", as: "vendor" },
      { idField: "country_id", table: "countries", as: "country" },
    ],
  });
  const queryClient = useQueryClient();

  const [demoRows, setDemoRows] = useState<ContentRow[]>(SEED);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ContentRow | null>(null);
  const [form, setForm] = useState<Omit<ContentRow, "id">>(emptyRow());
  const [deleteTarget, setDeleteTarget] = useState<ContentRow | null>(null);
  const [saving, setSaving] = useState(false);
  const rows: ContentRow[] = authed
    ? (live.rows as (ContentDbRow & Record<string, unknown>)[]).map(rowToView)
    : demoRows;

  const canAdd = !authed || rc.perms.canAdd;
  const canModify = !authed || rc.perms.canModify;
  const canDelete = !authed || rc.perms.canDelete;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.code, r.name, r.hsnCode, r.vendorName, r.countryName].some((v) =>
        String(v).toLowerCase().includes(q),
      ),
    );
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const startIdx = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyRow());
    setOpen(true);
  };

  const openEdit = (row: ContentRow) => {
    setEditing(row);
    const { id: _id, row_version: _rv, ...rest } = row;
    setForm(rest);
    setOpen(true);
  };

  const handleSave = async () => {
    const raw = toRaw(form);
    if (authed) {
      setSaving(true);
      try {
        if (editing) {
          const patch = contentUpdateSchema.parse(raw);
          await rc.update.mutateAsync({
            id: editing.id,
            rowVersion: editing.row_version ?? 0,
            patch,
          });
          toast.success("Content updated");
        } else {
          const values = contentCreateSchema.parse(raw);
          await rc.create.mutateAsync(values);
          toast.success("Content added");
        }
        setOpen(false);
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not save content"));
      } finally {
        setSaving(false);
      }
      return;
    }
    try {
      if (editing) contentUpdateSchema.parse(raw);
      else contentCreateSchema.parse(raw);
    } catch (err) {
      toast.error(toErrorMessage(err, "Please fix the form"));
      return;
    }
    if (editing) {
      setDemoRows((prev) => prev.map((r) => (r.id === editing.id ? { ...editing, ...form } : r)));
      toast.success("Content updated");
    } else {
      setDemoRows((prev) => [{ id: crypto.randomUUID(), ...form }, ...prev]);
      toast.success("Content added");
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
        toast.error(toErrorMessage(err, "Could not delete content"));
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
        const importRows = mapCsvToImportRows(parsedRows, contentsResource.importColumns, {
          aliases: CONTENT_IMPORT_HEADER_ALIASES,
        }) as ImportRow[];
        const res = await importContentsChunked("COMMIT", importRows);
        const toastRes = formatImportToast(res);
        if (toastRes.ok) toast.success(toastRes.message);
        else toast.error(toastRes.message);
        void queryClient.invalidateQueries({ queryKey: masterKeys.all(contentsResource.key) });
        return;
      }
      const imported: ContentRow[] = [];
      for (const rec of mapCsvToImportRows(parsedRows, contentsResource.importColumns, {
        aliases: CONTENT_IMPORT_HEADER_ALIASES,
      })) {
        if (!rec.code?.trim()) continue;
        imported.push({
          id: crypto.randomUUID(),
          ...emptyRow(),
          code: rec.code.trim(),
          name: (rec.name || "").trim(),
          hsnCode: String(rec.hsn_code ?? "").trim(),
          clearanceCertNo: String(rec.clearance_cert_no ?? "").trim(),
          notificationSubType: String(rec.notification_sub_type ?? "").trim(),
          notificationSubType1: String(rec.notification_sub_type1 ?? "").trim(),
          notificationNo: String(rec.notification_no ?? "").trim(),
          srNo: String(rec.sr_no ?? "").trim(),
          igstNotification: String(rec.igst_notification ?? "").trim(),
          igstSrNo: String(rec.igst_sr_no ?? "").trim(),
          igstcNotification: String(rec.igstc_notification ?? "").trim(),
          igstcSrNo: String(rec.igstc_sr_no ?? "").trim(),
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
    setPage(1);
    if (authed) queryClient.invalidateQueries({ queryKey: masterKeys.all(contentsResource.key) });
    toast.success("Refreshed");
  };

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
            <BreadcrumbPage>Content</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Content</h1>
        <p className="text-sm text-muted-foreground">
          Manage content codes, HSN, vendor/country links, and customs notification fields.
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center gap-1.5">
              <DataIoToolbar
                export={{
                  filename: "contents",
                  title: "Contents",
                  columns: [
                    { key: "code", header: "Content Code" },
                    { key: "name", header: "Content Name" },
                    { key: "hsn_code", header: "HSN Code" },
                    { key: "vendor", header: "Vendor" },
                    { key: "country", header: "Country" },
                    { key: "clearance_cert_no", header: "Clearance Ceth No" },
                    { key: "notification_sub_type", header: "Notification Sub Type" },
                    { key: "notification_sub_type1", header: "Notification Sub Type1" },
                    { key: "notification_no", header: "Notification No" },
                    { key: "sr_no", header: "SrNo" },
                    { key: "igst_notification", header: "IGST Notification" },
                    { key: "igst_sr_no", header: "IGST SrNo" },
                    { key: "igstc_notification", header: "IGSTC Notification" },
                    { key: "igstc_sr_no", header: "IGSTC SrNo" },
                  ],
                  getRows: () =>
                    rows.map((r) => ({
                      code: r.code,
                      name: r.name,
                      hsn_code: r.hsnCode,
                      vendor: r.vendorName,
                      country: r.countryName,
                      clearance_cert_no: r.clearanceCertNo,
                      notification_sub_type: r.notificationSubType,
                      notification_sub_type1: r.notificationSubType1,
                      notification_no: r.notificationNo,
                      sr_no: r.srNo,
                      igst_notification: r.igstNotification,
                      igst_sr_no: r.igstSrNo,
                      igstc_notification: r.igstcNotification,
                      igstc_sr_no: r.igstcSrNo,
                    })),
                }}
                import={canAdd ? { onRows: handleImportRows } : null}
              />
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
                <TableHead className="text-sidebar-foreground">Content Code</TableHead>
                <TableHead className="text-sidebar-foreground">Content Name</TableHead>
                <TableHead className="text-sidebar-foreground">HSN Code</TableHead>
                <TableHead className="text-sidebar-foreground">Vendor</TableHead>
                <TableHead className="text-sidebar-foreground">Country</TableHead>
                <TableHead className="w-28 text-center text-sidebar-foreground">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-sm text-muted-foreground">
                    No contents found.
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.code}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{r.hsnCode || "—"}</TableCell>
                    <TableCell>{r.vendorName || "—"}</TableCell>
                    <TableCell>{r.countryName || "—"}</TableCell>
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
            <PagerButton disabled={currentPage === 1} onClick={() => setPage(1)}>
              <ChevronsLeft className="h-4 w-4" />
            </PagerButton>
            <PagerButton disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </PagerButton>
            <CompactPager total={totalPages} current={currentPage} onSelect={setPage} />
            <PagerButton
              disabled={currentPage === totalPages}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </PagerButton>
            <PagerButton disabled={currentPage === totalPages} onClick={() => setPage(totalPages)}>
              <ChevronsRight className="h-4 w-4" />
            </PagerButton>
          </div>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Content" : "Add Content"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <fieldset className="rounded-md border p-4">
              <legend className="rounded bg-sidebar px-2 py-0.5 text-xs font-medium text-sidebar-foreground">
                Content
              </legend>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <FieldWrapper label="Content Code" required>
                  <Input
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                    placeholder="e.g. DOC"
                  />
                </FieldWrapper>
                <FieldWrapper label="Content Name" required className="lg:col-span-1">
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Documents"
                  />
                </FieldWrapper>
                <FieldWrapper label="HSN Code">
                  <Input
                    value={form.hsnCode}
                    onChange={(e) => setForm((f) => ({ ...f, hsnCode: e.target.value }))}
                  />
                </FieldWrapper>
                <FieldWrapper label="Vendor">
                  {authed ? (
                    <LookupCombobox
                      lookupKey="vendor"
                      value={form.vendorId}
                      valueLabel={form.vendorName}
                      onChange={(id, item) =>
                        setForm((f) => ({
                          ...f,
                          vendorId: id,
                          vendorName: item?.name ?? item?.code ?? "",
                        }))
                      }
                      placeholder="Select Vendor"
                    />
                  ) : (
                    <Input
                      value={form.vendorName}
                      onChange={(e) => setForm((f) => ({ ...f, vendorName: e.target.value }))}
                      placeholder="Vendor"
                    />
                  )}
                </FieldWrapper>
                <FieldWrapper label="Country" className="md:col-span-2">
                  {authed ? (
                    <LookupCombobox
                      lookupKey="country"
                      value={form.countryId}
                      valueLabel={form.countryName}
                      onChange={(id, item) =>
                        setForm((f) => ({
                          ...f,
                          countryId: id,
                          countryName: item?.name ?? item?.code ?? "",
                        }))
                      }
                      placeholder="Select Country"
                    />
                  ) : (
                    <Input
                      value={form.countryName}
                      onChange={(e) => setForm((f) => ({ ...f, countryName: e.target.value }))}
                      placeholder="Country"
                    />
                  )}
                </FieldWrapper>
              </div>
            </fieldset>

            <fieldset className="rounded-md border p-4">
              <legend className="rounded bg-sidebar px-2 py-0.5 text-xs font-medium text-sidebar-foreground">
                Additional Field
              </legend>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <FieldWrapper label="Clearance Ceth No">
                  <Input
                    value={form.clearanceCertNo}
                    onChange={(e) => setForm((f) => ({ ...f, clearanceCertNo: e.target.value }))}
                  />
                </FieldWrapper>
                <FieldWrapper label="Notification Sub Type" className="lg:col-span-1">
                  <Input
                    value={form.notificationSubType}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, notificationSubType: e.target.value }))
                    }
                  />
                </FieldWrapper>
                <FieldWrapper label="Notification Sub Type1">
                  <Input
                    value={form.notificationSubType1}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, notificationSubType1: e.target.value }))
                    }
                  />
                </FieldWrapper>
                <FieldWrapper label="Notification No">
                  <Input
                    value={form.notificationNo}
                    onChange={(e) => setForm((f) => ({ ...f, notificationNo: e.target.value }))}
                  />
                </FieldWrapper>
                <FieldWrapper label="SrNo">
                  <Input
                    value={form.srNo}
                    onChange={(e) => setForm((f) => ({ ...f, srNo: e.target.value }))}
                  />
                </FieldWrapper>
                <FieldWrapper label="IGST Notification">
                  <Input
                    value={form.igstNotification}
                    onChange={(e) => setForm((f) => ({ ...f, igstNotification: e.target.value }))}
                  />
                </FieldWrapper>
                <FieldWrapper label="IGST SrNo">
                  <Input
                    value={form.igstSrNo}
                    onChange={(e) => setForm((f) => ({ ...f, igstSrNo: e.target.value }))}
                  />
                </FieldWrapper>
                <FieldWrapper label="IGSTC Notification">
                  <Input
                    value={form.igstcNotification}
                    onChange={(e) => setForm((f) => ({ ...f, igstcNotification: e.target.value }))}
                  />
                </FieldWrapper>
                <FieldWrapper label="IGSTC SrNo">
                  <Input
                    value={form.igstcSrNo}
                    onChange={(e) => setForm((f) => ({ ...f, igstcSrNo: e.target.value }))}
                  />
                </FieldWrapper>
              </div>
            </fieldset>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-emerald-600 text-white hover:bg-emerald-600/90"
            >
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button variant="destructive" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete content?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              <span className="font-medium text-foreground">{deleteTarget?.code}</span>
              {deleteTarget?.name ? ` (${deleteTarget.name})` : ""} from the content master. This
              action cannot be undone.
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
    </div>
  );
}

function CompactPager({
  total,
  current,
  onSelect,
}: {
  total: number;
  current: number;
  onSelect: (n: number) => void;
}) {
  const pages: (number | "…")[] = [];
  const push = (v: number | "…") => pages.push(v);
  if (total <= 7) {
    for (let i = 1; i <= total; i++) push(i);
  } else {
    push(1);
    if (current > 3) push("…");
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) push(i);
    if (current < total - 2) push("…");
    push(total);
  }
  return (
    <>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} className="px-1 text-muted-foreground">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onSelect(p)}
            className={`h-8 min-w-8 rounded-md px-2 text-sm font-medium transition-colors ${
              p === current
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-accent"
            }`}
          >
            {p}
          </button>
        ),
      )}
    </>
  );
}

function FieldWrapper({
  label,
  required,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="outline"
          className="h-9 w-9 bg-background"
          onClick={onClick}
          aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function PagerButton({
  disabled,
  onClick,
  children,
}: {
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
