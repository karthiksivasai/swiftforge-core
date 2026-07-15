import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataIoToolbar } from "@/components/data-io-toolbar";
import { IconButton, MasterBreadcrumb, PAGE_SIZE, TablePager } from "@/components/master-table-kit";
import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import { useAuth } from "@/lib/auth";
import { mapCsvToImportRows } from "@/lib/masters/core";
import type { CsvRecord } from "@/lib/masters/core/csv";
import { importSummary, toErrorMessage } from "@/lib/masters/screen";
import type { LookupKey, LookupOption } from "@/lib/master-lookups";
import { canDo, UTILITY_TAX_FUEL_PERMISSIONS } from "@/lib/permissions";
import {
  deleteTaxRate,
  importTaxRates,
  listTaxRates,
  saveTaxRate,
  TAX_IMPORT_COLUMNS,
} from "@/lib/tax-fuel/resources";
import { taxRateSchema } from "@/lib/tax-fuel/schemas";
import type { TaxRate } from "@/lib/tax-fuel/types";

type LookupPair = { code: string; name: string };

type TaxRow = {
  id: string;
  customer: LookupPair;
  product: LookupPair;
  fromDate: string;
  toDate: string;
  igst: string;
  cgst: string;
  sgst: string;
  taxType: string;
  taxOnFuel: boolean;
  status: string;
  row_version?: number;
};

type TaxForm = Omit<TaxRow, "id" | "row_version">;

const emptyPair = (): LookupPair => ({ code: "", name: "" });
const todayIso = () => new Date().toISOString().slice(0, 10);
const ddmmyyyyToIso = (value: string) => {
  if (!value) return "";
  if (value.includes("-") && value.length >= 10) return value.slice(0, 10);
  const [day, month, year] = value.split("/");
  return year && month && day ? `${year}-${month}-${day}` : value;
};
const isoToDdmmyyyy = (value: string) => {
  if (!value) return "";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
};

const seedRows: TaxRow[] = [
  ["CARD", "ADOX", "01/08/2023", "31/12/2030", "0.00", "0.00", "0.00"],
  ["CARD", "CARD", "29/07/2023", "29/07/2029", "18.00", "9.00", "9.00"],
].map(([customer, product, fromDate, toDate, igst, cgst, sgst], index) => ({
  id: String(index + 1),
  customer: { code: customer, name: customer },
  product: { code: product, name: product },
  fromDate,
  toDate,
  igst,
  cgst,
  sgst,
  taxType: "GST",
  taxOnFuel: true,
  status: "ACTIVE",
}));

const emptyForm = (): TaxForm => ({
  customer: emptyPair(),
  product: emptyPair(),
  fromDate: todayIso(),
  toDate: todayIso(),
  igst: "",
  cgst: "",
  sgst: "",
  taxType: "GST",
  taxOnFuel: true,
  status: "ACTIVE",
});

function dbToUi(r: TaxRate): TaxRow {
  return {
    id: r.id,
    customer: { code: r.customer_code ?? "", name: r.customer_name ?? r.customer_code ?? "" },
    product: { code: r.product_code ?? "", name: r.product_name ?? r.product_code ?? "" },
    fromDate: isoToDdmmyyyy(r.from_date),
    toDate: r.to_date ? isoToDdmmyyyy(r.to_date) : "",
    igst: String(r.igst_pct),
    cgst: String(r.cgst_pct),
    sgst: String(r.sgst_pct),
    taxType: r.tax_type,
    taxOnFuel: r.tax_on_fuel,
    status: r.status,
    row_version: r.row_version,
  };
}

export const Route = createFileRoute("/utility/tax-charges-setup/tax-setup")({
  head: () => ({
    meta: [
      { title: "Tax Setup — Utility — Courier ERP" },
      { name: "description", content: "Configure IGST, CGST, and SGST by customer and product." },
    ],
  }),
  component: TaxSetupPage,
});

function TaxSetupPage() {
  const { isAuthenticated: authed, permissions } = useAuth();
  const queryClient = useQueryClient();

  const [demoRows, setDemoRows] = useState<TaxRow[]>(seedRows);
  const [screen, setScreen] = useState<"list" | "form">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRv, setEditingRv] = useState<number | null>(null);
  const [form, setForm] = useState<TaxForm>(emptyForm());
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [lookupOpen, setLookupOpen] = useState<LookupKey | null>(null);
  const [lookupField, setLookupField] = useState<"customer" | "product" | null>(null);
  const [filters, setFilters] = useState({
    customer: "",
    product: "",
    fromDate: "",
    toDate: "",
    igst: "",
    cgst: "",
    sgst: "",
  });

  const liveQuery = useQuery({
    queryKey: ["tax-rates", search],
    queryFn: () => listTaxRates({ search: search || null, page: 1, pageSize: 200 }),
    enabled: authed,
  });

  const rows: TaxRow[] = authed ? (liveQuery.data?.rows ?? []).map(dbToUi) : demoRows;

  const canAdd = !authed || canDo(permissions, UTILITY_TAX_FUEL_PERMISSIONS.taxSetup, "add");
  const canModify = !authed || canDo(permissions, UTILITY_TAX_FUEL_PERMISSIONS.taxSetup, "modify");
  const canDelete =
    !authed || canDo(permissions, UTILITY_TAX_FUEL_PERMISSIONS.taxSetup, "delete") || canModify;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const values = [
        row.customer.name,
        row.product.name,
        row.fromDate,
        row.toDate,
        row.igst,
        row.cgst,
        row.sgst,
      ];
      if (q && !values.some((value) => value.toLowerCase().includes(q))) return false;
      if (
        filters.customer &&
        !row.customer.name.toLowerCase().includes(filters.customer.toLowerCase())
      )
        return false;
      if (
        filters.product &&
        !row.product.name.toLowerCase().includes(filters.product.toLowerCase())
      )
        return false;
      if (filters.fromDate && !row.fromDate.toLowerCase().includes(filters.fromDate.toLowerCase()))
        return false;
      if (filters.toDate && !row.toDate.toLowerCase().includes(filters.toDate.toLowerCase()))
        return false;
      if (filters.igst && !row.igst.toLowerCase().includes(filters.igst.toLowerCase()))
        return false;
      if (filters.cgst && !row.cgst.toLowerCase().includes(filters.cgst.toLowerCase()))
        return false;
      if (filters.sgst && !row.sgst.toLowerCase().includes(filters.sgst.toLowerCase()))
        return false;
      return true;
    });
  }, [filters, rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const startIdx = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const patch = (updates: Partial<TaxForm>) => setForm((current) => ({ ...current, ...updates }));

  const openAdd = () => {
    setEditingId(null);
    setEditingRv(null);
    setForm(emptyForm());
    setScreen("form");
  };

  const openEdit = (row: TaxRow) => {
    setEditingId(row.id);
    setEditingRv(row.row_version ?? null);
    setForm({
      customer: row.customer,
      product: row.product,
      fromDate: ddmmyyyyToIso(row.fromDate),
      toDate: ddmmyyyyToIso(row.toDate),
      igst: row.igst,
      cgst: row.cgst,
      sgst: row.sgst,
      taxType: row.taxType,
      taxOnFuel: row.taxOnFuel,
      status: row.status,
    });
    setScreen("form");
  };

  const handleLookupSelect = (_value: string, option: LookupOption) => {
    if (!lookupField) return;
    patch({ [lookupField]: { code: option.code, name: option.name } });
    setLookupOpen(null);
  };

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["tax-rates"] });
  };

  const save = async () => {
    const raw = {
      customer_code: form.customer.code.trim() || null,
      product_code: form.product.code.trim() || null,
      from_date: form.fromDate,
      to_date: form.toDate || null,
      igst_pct: form.igst || "0",
      cgst_pct: form.cgst || "0",
      sgst_pct: form.sgst || "0",
      tax_type: form.taxType || "GST",
      tax_on_fuel: form.taxOnFuel,
      status: (form.status === "INACTIVE" ? "INACTIVE" : "ACTIVE") as "ACTIVE" | "INACTIVE",
    };
    try {
      taxRateSchema.parse(raw);
    } catch (err) {
      return toast.error(toErrorMessage(err, "Please fix the form"));
    }

    if (authed) {
      setBusy(true);
      try {
        await saveTaxRate({ fields: raw, id: editingId, rowVersion: editingRv });
        toast.success(editingId ? "Tax setup updated" : "Tax setup saved");
        invalidate();
        setScreen("list");
      } catch (err) {
        toast.error(toErrorMessage(err));
      } finally {
        setBusy(false);
      }
      return;
    }

    const nextRow: TaxRow = {
      id: editingId ?? crypto.randomUUID(),
      customer: form.customer,
      product: form.product,
      fromDate: isoToDdmmyyyy(form.fromDate),
      toDate: isoToDdmmyyyy(form.toDate),
      igst: form.igst || "0.00",
      cgst: form.cgst || "0.00",
      sgst: form.sgst || "0.00",
      taxType: form.taxType,
      taxOnFuel: form.taxOnFuel,
      status: form.status,
    };
    setDemoRows((current) =>
      editingId
        ? current.map((row) => (row.id === editingId ? nextRow : row))
        : [nextRow, ...current],
    );
    setScreen("list");
    toast.success(editingId ? "Tax setup updated" : "Tax setup saved");
  };

  const handleDelete = async (row: TaxRow) => {
    if (authed) {
      try {
        await deleteTaxRate(row.id, row.row_version);
        toast.success("Deleted");
        invalidate();
      } catch (err) {
        toast.error(toErrorMessage(err));
      }
      return;
    }
    setDemoRows((current) => current.filter((item) => item.id !== row.id));
    toast.success("Deleted");
  };

  const handleImportRows = async (parsedRows: CsvRecord[]) => {
    try {
      const importRows = mapCsvToImportRows(parsedRows, [...TAX_IMPORT_COLUMNS]);
      if (!importRows.length) return toast.error("No rows to import");
      if (!authed) {
        toast.success(`Demo import preview: ${importRows.length} rows`);
        return;
      }
      const validated = await importTaxRates("VALIDATE", importRows);
      toast.message(importSummary(validated));
      if (validated.error_count > 0) return;
      const committed = await importTaxRates("COMMIT", importRows);
      toast.success(importSummary(committed));
      invalidate();
    } catch (err) {
      toast.error(toErrorMessage(err, "Import failed"));
    }
  };

  if (screen === "form") {
    return (
      <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
        <MasterBreadcrumb trail={["Utility", "Tax / Charges Setup", "Tax Setup"]} />

        <Card className="min-w-0 border p-4">
          <p className="mb-3 text-xs text-muted-foreground">
            Interstate vs intrastate (IGST vs CGST+SGST) is resolved by the rating engine from
            customer/branch state. After changes, run Rate Update Jobs to refresh shipments.
          </p>
          <div className="grid gap-x-3 gap-y-2 lg:grid-cols-4">
            <LookupFieldInput
              label="Customer"
              value={form.customer}
              onChange={(customer) => patch({ customer })}
              onLookupOpen={() => {
                setLookupField("customer");
                setLookupOpen("customer");
              }}
            />
            <LookupFieldInput
              label="Product"
              value={form.product}
              onChange={(product) => patch({ product })}
              onLookupOpen={() => {
                setLookupField("product");
                setLookupOpen("product");
              }}
            />
            <TextField
              label="From Date"
              type="date"
              value={form.fromDate}
              onChange={(fromDate) => patch({ fromDate })}
            />
            <TextField
              label="To Date"
              type="date"
              value={form.toDate}
              onChange={(toDate) => patch({ toDate })}
            />
            <TextField
              label="Tax Type"
              value={form.taxType}
              onChange={(taxType) => patch({ taxType })}
            />
            <TextField label="IGST" value={form.igst} onChange={(igst) => patch({ igst })} />
            <TextField label="CGST" value={form.cgst} onChange={(cgst) => patch({ cgst })} />
            <TextField label="SGST" value={form.sgst} onChange={(sgst) => patch({ sgst })} />
            <label className="flex items-end gap-2 pb-2 text-xs font-medium text-foreground">
              <Checkbox
                checked={form.taxOnFuel}
                onCheckedChange={(value) => patch({ taxOnFuel: Boolean(value) })}
              />
              Tax On Fuel
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
              Status
              <Select value={form.status} onValueChange={(status) => patch({ status })}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                  <SelectItem value="INACTIVE">INACTIVE</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Button
            disabled={busy || (editingId ? !canModify : !canAdd)}
            onClick={() => void save()}
            className="h-8 rounded-full bg-green-500 px-8 text-white hover:bg-green-600"
          >
            Save
          </Button>
          <Button
            onClick={() => setScreen("list")}
            className="h-8 rounded-full bg-red-500 px-8 text-white hover:bg-red-600"
          >
            Cancel
          </Button>
        </div>

        <MasterLookupDialog
          open={lookupOpen !== null}
          lookup={lookupOpen ?? "customer"}
          onOpenChange={(open) => {
            if (!open) setLookupOpen(null);
          }}
          onSelect={handleLookupSelect}
        />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Utility", "Tax / Charges Setup", "Tax Setup"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Tax Setup</h1>
        <p className="text-sm text-muted-foreground">
          Configure tax percentages by customer and product.
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-1.5">
            <DataIoToolbar
              export={{
                filename: "tax-setup",
                title: "Tax Setup",
                columns: [
                  { key: "customer", header: "Customer" },
                  { key: "product", header: "Product" },
                  { key: "fromDate", header: "From Date" },
                  { key: "toDate", header: "To Date" },
                  { key: "igst", header: "IGST" },
                  { key: "cgst", header: "CGST" },
                  { key: "sgst", header: "SGST" },
                ],
                getRows: () =>
                  filtered.map((row) => ({
                    customer: row.customer.name,
                    product: row.product.name,
                    fromDate: row.fromDate,
                    toDate: row.toDate,
                    igst: row.igst,
                    cgst: row.cgst,
                    sgst: row.sgst,
                  })),
              }}
              import={
                canAdd
                  ? {
                      onRows: (rows) => {
                        if (authed && !canAdd) {
                          toast.error("Permission denied");
                          return;
                        }
                        return handleImportRows(rows);
                      },
                    }
                  : null
              }
            />
            <IconButton
              label="Refresh"
              onClick={() => {
                setSearch("");
                setFilters({
                  customer: "",
                  product: "",
                  fromDate: "",
                  toDate: "",
                  igst: "",
                  cgst: "",
                  sgst: "",
                });
                setPage(1);
                invalidate();
                toast.success("Refreshed");
              }}
            >
              <RefreshCw className="h-4 w-4" />
            </IconButton>
          </div>
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-foreground">
              Search:
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                className="h-9 w-56"
              />
            </label>
            <Button size="sm" className="h-9 gap-1.5" onClick={openAdd} disabled={!canAdd}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-sidebar hover:bg-sidebar">
                {[
                  "Customer",
                  "Product",
                  "From Date",
                  "To Date",
                  "IGST",
                  "CGST",
                  "SGST",
                  "Action",
                ].map((heading) => (
                  <TableHead key={heading} className="whitespace-nowrap text-sidebar-foreground">
                    {heading}
                  </TableHead>
                ))}
              </TableRow>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                {(
                  ["customer", "product", "fromDate", "toDate", "igst", "cgst", "sgst"] as const
                ).map((key) => (
                  <TableHead key={key} className="py-2">
                    <Input
                      value={filters[key]}
                      onChange={(event) => {
                        setFilters((current) => ({ ...current, [key]: event.target.value }));
                        setPage(1);
                      }}
                      className="h-8"
                    />
                  </TableHead>
                ))}
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {authed && liveQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-6 text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((row) => (
                  <TableRow key={row.id} className="odd:bg-muted/50">
                    <TableCell>{row.customer.name}</TableCell>
                    <TableCell>{row.product.name}</TableCell>
                    <TableCell>{row.fromDate}</TableCell>
                    <TableCell>{row.toDate}</TableCell>
                    <TableCell>{row.igst}</TableCell>
                    <TableCell>{row.cgst}</TableCell>
                    <TableCell>{row.sgst}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <IconButton
                          label="Edit"
                          size="row"
                          variant="ghost"
                          onClick={() => {
                            if (!canModify) {
                              toast.error("Permission denied");
                              return;
                            }
                            openEdit(row);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </IconButton>
                        <IconButton
                          label="Delete"
                          size="row"
                          variant="ghost"
                          onClick={() => {
                            if (!canDelete) {
                              toast.error("Permission denied");
                              return;
                            }
                            void handleDelete(row);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </IconButton>
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
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
      {label}
      <Input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9"
      />
    </label>
  );
}

function LookupFieldInput({
  label,
  value,
  onChange,
  onLookupOpen,
}: {
  label: string;
  value: LookupPair;
  onChange: (value: LookupPair) => void;
  onLookupOpen: () => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
      {label}
      <div className="flex gap-1">
        <Input
          value={value.name}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
          className="min-w-0 flex-1"
        />
        <Input
          value={value.code}
          onChange={(event) => onChange({ ...value, code: event.target.value })}
          className="w-20"
        />
        <Button
          size="icon"
          variant="outline"
          className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
          onClick={onLookupOpen}
          aria-label={`Search ${label}`}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>
    </label>
  );
}
