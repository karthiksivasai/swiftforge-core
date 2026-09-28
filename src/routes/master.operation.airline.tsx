import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RefreshCw, Plus, Search, Pencil, Trash2, Download, Upload, FileSpreadsheet, FileUp } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  FieldWrapper,
  IconButton,
  MasterBreadcrumb,
  PAGE_SIZE,
  TablePager,
} from "@/components/master-table-kit";
import { exportTable, parseTabularFile } from "@/lib/io/tableIo";

import type { LookupOption } from "@/lib/master-lookups";

import { useAuth } from "@/lib/auth";
import { useMasterResource } from "@/lib/masters/core/useMasterResource";
import { masterKeys } from "@/lib/masters/core/queryKeys";
import { mapCsvToImportRows, type ImportRow } from "@/lib/masters/core";
import type { CsvRecord } from "@/lib/masters/core/csv";
import {
  airlinesResource,
  type AirlineRow as AirlineDbRow,
} from "@/lib/masters/resources/airlines";
import { airlineCreateSchema, airlineUpdateSchema } from "@/lib/masters/schemas/airlines";
import { useMasterList, toErrorMessage, formatImportToast } from "@/lib/masters/screen";
import { SearchableLookupPair } from "@/components/masters/searchable-lookup-pair";

type LookupPair = { code: string; name: string };

type AirlineRow = {
  id: string;
  airlineName: string;
  productId: string;
  productCode: string;
  productName: string;
  row_version?: number;
};

type AirlineForm = {
  airlineName: string;
  productId: string;
  product: LookupPair;
};

const SEED_ROWS: Omit<AirlineRow, "id" | "productId">[] = [
  { airlineName: "AIR ASIA", productCode: "SPX", productName: "OTHER PACKAGE" },
  { airlineName: "CUBE PECIFIC", productCode: "SPX", productName: "OTHER PACKAGE" },
  { airlineName: "SRILANKAN AIRLINES", productCode: "SPX", productName: "OTHER PACKAGE" },
  { airlineName: "THAI AIRLINES", productCode: "SPX", productName: "OTHER PACKAGE" },
];

const emptyForm = (): AirlineForm => ({
  airlineName: "",
  productId: "",
  product: { code: "", name: "" },
});

const rowToForm = (row: AirlineRow): AirlineForm => ({
  airlineName: row.airlineName,
  productId: row.productId,
  product: { code: row.productCode, name: row.productName },
});

function rowToView(r: AirlineDbRow & Record<string, unknown>): AirlineRow {
  return {
    id: r.id,
    airlineName: r.name,
    productId: r.product_id,
    productCode: (r.product_code as string) ?? "",
    productName: (r.product_name as string) ?? "",
    row_version: r.row_version,
  };
}

export const Route = createFileRoute("/master/operation/airline")({
  head: () => ({
    meta: [
      { title: "Airline — Master — Courier ERP" },
      { name: "description", content: "Manage airlines and linked product types." },
    ],
  }),
  component: AirlinePage,
});

function AirlinePage() {
  const { isAuthenticated: authed } = useAuth();
  const rc = useMasterResource(airlinesResource);
  const live = useMasterList(airlinesResource, {
    enabled: authed,
    labelRefs: [{ idField: "product_id", table: "products", as: "product" }],
  });
  const queryClient = useQueryClient();

  const [demoRows, setDemoRows] = useState<AirlineRow[]>(() =>
    SEED_ROWS.map((r) => ({ id: crypto.randomUUID(), productId: "", ...r })),
  );
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState({ airlineName: "", product: "" });
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AirlineRow | null>(null);
  const [form, setForm] = useState<AirlineForm>(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<AirlineRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);

  const rows: AirlineRow[] = authed
    ? (live.rows as (AirlineDbRow & Record<string, unknown>)[]).map(rowToView)
    : demoRows;

  const canAdd = !authed || rc.perms.canAdd;
  const canModify = !authed || rc.perms.canModify;
  const canDelete = !authed || rc.perms.canDelete;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const productLabel = r.productCode || r.productName;
      if (
        q &&
        ![r.airlineName, productLabel, r.productName].some((v) =>
          String(v).toLowerCase().includes(q),
        )
      )
        return false;
      if (
        colFilters.airlineName &&
        !r.airlineName.toLowerCase().includes(colFilters.airlineName.toLowerCase())
      )
        return false;
      if (
        colFilters.product &&
        ![r.productCode, r.productName].some((v) =>
          v.toLowerCase().includes(colFilters.product.toLowerCase()),
        )
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

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (row: AirlineRow) => {
    setEditing(row);
    setForm(rowToForm(row));
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm());
  };

  const handleSave = async () => {
    if (!form.airlineName.trim()) return toast.error("Airline Name is required");
    if (!form.product.code?.trim() && !form.product.name?.trim() && !form.productId)
      return toast.error("Product is required");

    const isDuplicate = rows.some(
      (r) =>
        r.airlineName.toLowerCase() === form.airlineName.trim().toLowerCase() &&
        r.id !== editing?.id,
    );
    if (isDuplicate) return toast.error("Airline Name already exists");

    if (authed) {
      const raw = {
        name: form.airlineName.trim().toUpperCase(),
        product_id: form.productId || "",
      };
      setSaving(true);
      try {
        if (editing) {
          const patch = airlineUpdateSchema.parse(raw);
          await rc.update.mutateAsync({
            id: editing.id,
            rowVersion: editing.row_version ?? 0,
            patch,
          });
          toast.success("Airline saved successfully");
        } else {
          const values = airlineCreateSchema.parse(raw);
          await rc.create.mutateAsync(values);
          toast.success("Airline saved successfully");
        }
        closeForm();
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not save airline"));
      } finally {
        setSaving(false);
      }
      return;
    }

    // Demo mode: preserve the original lightweight validation + UX.
    const payload = {
      airlineName: form.airlineName.trim().toUpperCase(),
      productCode: form.product.code.trim(),
      productName: form.product.name.trim(),
    };
    if (editing) {
      setDemoRows((prev) =>
        prev.map((r) => (r.id === editing.id ? { ...editing, ...payload } : r)),
      );
      toast.success("Airline saved successfully");
    } else {
      setDemoRows((prev) => [{ id: crypto.randomUUID(), productId: "", ...payload }, ...prev]);
      toast.success("Airline saved successfully");
    }
    closeForm();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const row = deleteTarget;
    if (authed) {
      try {
        await rc.remove.mutateAsync({ id: row.id, rowVersion: row.row_version ?? 0 });
        toast.success("Airline deleted successfully");
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not delete airline"));
      }
    } else {
      setDemoRows((prev) => prev.filter((r) => r.id !== row.id));
      toast.success("Airline deleted successfully");
    }
    setDeleteTarget(null);
  };

  const handleImportRows = async (parsedRows: CsvRecord[]) => {
    try {
    if (authed) {
      const importRows = mapCsvToImportRows(
        parsedRows,
        airlinesResource.importColumns,
      ) as ImportRow[];
      const res = await rc.commitImport.mutateAsync(importRows);
      const toastRes = formatImportToast(res);
      if (toastRes.ok) toast.success(toastRes.message);
      else toast.error(toastRes.message);
      void queryClient.invalidateQueries({ queryKey: masterKeys.all(airlinesResource.key) });
      return;
    }

    const imported: AirlineRow[] = [];
    for (const rec of mapCsvToImportRows(parsedRows, ["name", "product_code", "product_name"])) {
      if (!rec.name?.trim()) continue;
      imported.push({
        id: crypto.randomUUID(),
        airlineName: rec.name.trim().toUpperCase(),
        productId: "",
        productCode: (rec.product_code || "").trim(),
        productName: (rec.product_name || "").trim(),
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

  const doImport = async () => {
    if (!importFile) return;
    try {
      const parsed = await parseTabularFile(importFile);
      if (parsed.rows.length === 0) {
        toast.error("File is empty");
        return;
      }
      await handleImportRows(parsed.rows);
      setImportOpen(false);
      setImportFile(null);
    } catch (err) {
      toast.error(toErrorMessage(err, "Failed to import file"));
    }
  };

  const handleExport = async () => {
    try {
      await exportTable({
        format: "excel",
        filename: "airlines",
        title: "Airlines",
        columns: [
          { key: "airlineName", header: "Airlines Name" },
          { key: "productCode", header: "Product Code" },
          { key: "productName", header: "Product Name" },
        ],
        rows: rows.map((r) => ({
          airlineName: r.airlineName,
          productCode: r.productCode,
          productName: r.productName,
        })),
      });
    } catch (err) {
      toast.error(toErrorMessage(err, "Export failed"));
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      await exportTable({
        format: "excel",
        filename: "airlines_template",
        title: "Import Airlines from Excel",
        columns: [
          { key: "airlineName", header: "Airlines Name" },
          { key: "productCode", header: "Product Code" },
          { key: "productName", header: "Product Name" },
        ],
        rows: [],
      });
    } catch (err) {
      toast.error(toErrorMessage(err, "Failed to download template"));
    }
  };

  const handleRefresh = () => {
    setSearch("");
    setColFilters({ airlineName: "", product: "" });
    setPage(1);
    closeForm();
    if (authed) queryClient.invalidateQueries({ queryKey: masterKeys.all(airlinesResource.key) });
    toast.success("Refreshed");
  };

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <MasterBreadcrumb trail={["Master", "Operation", "Airline"]} />

      {showForm ? (
        <Card className="overflow-hidden border p-0">
          <div className="p-4 md:p-6">
            <Badge className="mb-4 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90">
              Airline
            </Badge>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <FieldWrapper label="Airline Name" required>
                <Input
                  value={form.airlineName}
                  onChange={(e) => setForm((f) => ({ ...f, airlineName: e.target.value }))}
                />
              </FieldWrapper>
              <FieldWrapper label="Product" required>
                <SearchableLookupPair
                  lookup="product"
                  splitCode
                  namePlaceholder=""
                  codePlaceholder=""
                  value={{ id: form.productId, code: form.product.code, name: form.product.name }}
                  onChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      productId: v.id || "",
                      product: { code: v.code, name: v.name },
                    }))
                  }
                />
              </FieldWrapper>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-emerald-600 text-white hover:bg-emerald-600/90"
              >
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button variant="destructive" onClick={closeForm}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      ) : importOpen ? (
        <Card className="overflow-hidden border p-0">
          <div className="p-4 md:p-6">
            <Badge className="mb-4 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90">
              Import Airlines from Excel
            </Badge>

            <div className="flex flex-col gap-4 py-4">
              <p className="text-sm text-muted-foreground">
                Data should be in same format as per Excel.
              </p>
              <div>
                <Button variant="link" className="p-0 h-auto" onClick={handleDownloadTemplate}>
                  Download Excel File Format
                </Button>
              </div>
              <div className="grid w-full max-w-sm items-center gap-1.5">
                <Input 
                  id="excel-file" 
                  type="file" 
                  accept=".xlsx, .xls"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                />
              </div>
            </div>

            <div className="mt-4 flex justify-between">
              <Button className="bg-emerald-600 text-white hover:bg-emerald-600/90" onClick={doImport}>
                Import
              </Button>
              <Button variant="destructive" onClick={() => { setImportOpen(false); setImportFile(null); }}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Airline</h1>
            <p className="text-sm text-muted-foreground">
              Manage airlines and their linked product types.
            </p>
          </div>

          <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
              <TooltipProvider delayDuration={200}>
                <div className="flex items-center gap-1.5">
                  <IconButton label="Export" onClick={handleExport} className="h-8 w-8 text-emerald-600 hover:text-emerald-700">
                    <FileSpreadsheet className="h-4 w-4" />
                  </IconButton>
                  {canAdd ? (
                    <IconButton label="Import" onClick={() => setImportOpen(true)} className="h-8 w-8 text-blue-600 hover:text-blue-700">
                      <FileUp className="h-4 w-4" />
                    </IconButton>
                  ) : null}
                </div>
              </TooltipProvider>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Search:</span>
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="h-9 w-56"
                />
                {canAdd ? (
                  <Button size="icon" onClick={openAdd} className="h-8 w-8">
                    <Plus className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-sidebar hover:bg-sidebar">
                    <TableHead className="text-sidebar-foreground">Airlines Name</TableHead>
                    <TableHead className="text-sidebar-foreground">Product</TableHead>
                    <TableHead className="w-28 text-center text-sidebar-foreground">
                      Action
                    </TableHead>
                  </TableRow>
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableHead className="py-2">
                      <Input
                        value={colFilters.airlineName}
                        onChange={(e) => {
                          setColFilters((f) => ({ ...f, airlineName: e.target.value }));
                          setPage(1);
                        }}
                        placeholder="Airlines Name"
                        className="h-8"
                      />
                    </TableHead>
                    <TableHead className="py-2">
                      <Input
                        value={colFilters.product}
                        onChange={(e) => {
                          setColFilters((f) => ({ ...f, product: e.target.value }));
                          setPage(1);
                        }}
                        placeholder="Product"
                        className="h-8"
                      />
                    </TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="h-32 text-center text-sm text-muted-foreground"
                      >
                        No data available in table
                      </TableCell>
                    </TableRow>
                  ) : (
                    pageRows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.airlineName}</TableCell>
                        <TableCell>{r.productCode || r.productName}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-1">
                            {canModify ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => openEdit(r)}
                                aria-label={`Edit ${r.airlineName}`}
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
                                aria-label={`Delete ${r.airlineName}`}
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

            <TablePager
              totalPages={totalPages}
              currentPage={currentPage}
              setPage={setPage}
              startIdx={startIdx}
              endIdx={endIdx}
              total={filtered.length}
            />
          </Card>
        </>
      )}

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this Airline?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove{" "}
              <span className="font-medium text-foreground">{deleteTarget?.airlineName}</span>.
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

