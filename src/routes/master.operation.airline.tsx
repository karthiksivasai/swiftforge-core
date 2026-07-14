import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Download, Upload, RefreshCw, Plus, Search, Pencil, Trash2 } from "lucide-react";
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
  FieldWrapper,
  IconButton,
  MasterBreadcrumb,
  PAGE_SIZE,
  TablePager,
  downloadCsv,
} from "@/components/master-table-kit";
import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import type { LookupOption } from "@/lib/master-lookups";

import { useAuth } from "@/lib/auth";
import { useMasterResource } from "@/lib/masters/core/useMasterResource";
import { masterKeys } from "@/lib/masters/core/queryKeys";
import { parseCsv, mapCsvToImportRows, type ImportRow } from "@/lib/masters/core";
import {
  airlinesResource,
  type AirlineRow as AirlineDbRow,
} from "@/lib/masters/resources/airlines";
import { airlineCreateSchema, airlineUpdateSchema } from "@/lib/masters/schemas/airlines";
import { useMasterList, toErrorMessage, importSummary } from "@/lib/masters/screen";
import { LookupCombobox } from "@/components/masters/lookup-combobox";

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
  const importInputRef = useRef<HTMLInputElement | null>(null);

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
          toast.success("Airline updated");
        } else {
          const values = airlineCreateSchema.parse(raw);
          await rc.create.mutateAsync(values);
          toast.success("Airline added");
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
    if (!form.airlineName.trim()) return toast.error("Airline Name is required");
    if (!form.product.code.trim() && !form.product.name.trim())
      return toast.error("Product is required");

    const payload = {
      airlineName: form.airlineName.trim().toUpperCase(),
      productCode: form.product.code.trim(),
      productName: form.product.name.trim(),
    };
    if (editing) {
      setDemoRows((prev) =>
        prev.map((r) => (r.id === editing.id ? { ...editing, ...payload } : r)),
      );
      toast.success("Airline updated");
    } else {
      setDemoRows((prev) => [{ id: crypto.randomUUID(), productId: "", ...payload }, ...prev]);
      toast.success("Airline added");
    }
    closeForm();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const row = deleteTarget;
    if (authed) {
      try {
        await rc.remove.mutateAsync({ id: row.id, rowVersion: row.row_version ?? 0 });
        toast.success(`Deleted ${row.airlineName}`);
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not delete airline"));
      }
    } else {
      setDemoRows((prev) => prev.filter((r) => r.id !== row.id));
      toast.success(`Deleted ${row.airlineName}`);
    }
    setDeleteTarget(null);
  };

  const handleExport = () => {
    downloadCsv(
      "airlines.csv",
      ["Airlines Name", "Product Code", "Product Name"],
      rows.map((r) => [r.airlineName, r.productCode, r.productName]),
    );
    toast.success("Exported airlines.csv");
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.rows.length === 0) return toast.error("File is empty");

      if (authed) {
        const importRows = mapCsvToImportRows(
          parsed.rows,
          airlinesResource.importColumns,
        ) as ImportRow[];
        const res = await rc.commitImport.mutateAsync(importRows);
        toast.success(importSummary(res));
        return;
      }

      const imported: AirlineRow[] = [];
      for (const rec of mapCsvToImportRows(parsed.rows, ["name", "product_code", "product_name"])) {
        if (!rec.name?.trim()) continue;
        imported.push({
          id: crypto.randomUUID(),
          airlineName: rec.name.trim().toUpperCase(),
          productId: "",
          productCode: (rec.product_code || "").trim(),
          productName: (rec.product_name || "").trim(),
        });
      }
      if (imported.length === 0) return toast.error("No valid rows found");
      setDemoRows((prev) => [...imported, ...prev]);
      toast.success(`Imported ${imported.length} row${imported.length === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(toErrorMessage(err, "Failed to import file"));
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
                {authed ? (
                  <LookupCombobox
                    lookupKey="product"
                    value={form.productId}
                    valueLabel={form.product.code || form.product.name}
                    onChange={(id, item) =>
                      setForm((f) => ({
                        ...f,
                        productId: id,
                        product: { code: item?.code ?? "", name: item?.name ?? "" },
                      }))
                    }
                    placeholder="Select Product"
                  />
                ) : (
                  <ProductLookupInput
                    value={form.product}
                    onChange={(v) => setForm((f) => ({ ...f, product: v }))}
                  />
                )}
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
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Airline</h1>
            <p className="text-sm text-muted-foreground">
              Manage airlines and their linked product types.
            </p>
          </div>

          <Card className="overflow-hidden p-0">
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleImportFile}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
              <TooltipProvider delayDuration={200}>
                <div className="flex items-center gap-1.5">
                  <IconButton label="Export" onClick={handleExport}>
                    <Download className="h-4 w-4" />
                  </IconButton>
                  {canAdd ? (
                    <IconButton label="Import" onClick={() => importInputRef.current?.click()}>
                      <Upload className="h-4 w-4" />
                    </IconButton>
                  ) : null}
                  <IconButton label="Refresh" onClick={handleRefresh}>
                    <RefreshCw className="h-4 w-4" />
                  </IconButton>
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
            <AlertDialogTitle>Delete airline?</AlertDialogTitle>
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

function ProductLookupInput({
  value,
  onChange,
}: {
  value: LookupPair;
  onChange: (v: LookupPair) => void;
}) {
  const [lookupOpen, setLookupOpen] = useState(false);

  return (
    <>
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
          aria-label="Search"
          onClick={() => setLookupOpen(true)}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>
      <MasterLookupDialog
        open={lookupOpen}
        onOpenChange={setLookupOpen}
        lookup="product"
        returnField="code"
        onSelect={(_v, option: LookupOption) => onChange({ code: option.code, name: option.name })}
      />
    </>
  );
}
