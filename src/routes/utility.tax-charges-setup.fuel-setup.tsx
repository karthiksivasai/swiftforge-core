import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { canDo } from "@/lib/permissions";
import { UTILITY_TAX_FUEL_PERMISSIONS } from "@/lib/permissions";
import {
  deleteFuelRate,
  FUEL_IMPORT_COLUMNS,
  importFuelRates,
  listFuelRates,
  saveFuelRate,
} from "@/lib/tax-fuel/resources";
import { fuelRateSchema } from "@/lib/tax-fuel/schemas";
import type { FuelRate } from "@/lib/tax-fuel/types";

type LookupPair = { code: string; name: string };
type LookupField = "customer" | "vendor" | "product" | "destination" | "zone";

type FuelRow = {
  id: string;
  entryCode: string;
  customer: LookupPair;
  vendor: LookupPair;
  product: LookupPair;
  destination: LookupPair;
  zone: LookupPair;
  fromDate: string;
  toDate: string;
  percentage: string;
  status: string;
  row_version?: number;
};

type FuelForm = Omit<FuelRow, "id" | "entryCode" | "row_version" | "status"> & {
  status: string;
};

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

const seedRows: FuelRow[] = [
  ["180619", "BAND 2", "UPS", "CARD", "CARD", "Z1", "06/07/2026", "12/07/2026", "39.00"],
  ["180618", "BAND 2", "FDX", "CARD", "CARD", "Z1", "06/07/2026", "12/07/2026", "38.25"],
].map(
  (
    [entryCode, customer, vendor, product, destination, zone, fromDate, toDate, percentage],
    index,
  ) => ({
    id: String(index + 1),
    entryCode,
    customer: { code: customer, name: customer },
    vendor: { code: vendor, name: vendor },
    product: { code: product, name: product },
    destination: { code: destination, name: destination },
    zone: { code: zone, name: zone },
    fromDate,
    toDate,
    percentage,
    status: "ACTIVE",
  }),
);

const emptyForm = (): FuelForm => ({
  customer: emptyPair(),
  vendor: emptyPair(),
  product: emptyPair(),
  destination: emptyPair(),
  zone: emptyPair(),
  fromDate: todayIso(),
  toDate: todayIso(),
  percentage: "",
  status: "ACTIVE",
});

function dbToUi(r: FuelRate): FuelRow {
  return {
    id: r.id,
    entryCode: r.entry_code ?? "",
    customer: { code: r.customer_code ?? "", name: r.customer_name ?? r.customer_code ?? "" },
    vendor: { code: r.vendor_code ?? "", name: r.vendor_name ?? r.vendor_code ?? "" },
    product: { code: r.product_code ?? "", name: r.product_name ?? r.product_code ?? "" },
    destination: {
      code: r.destination_code ?? "",
      name: r.destination_name ?? r.destination_code ?? "",
    },
    zone: { code: r.zone_code ?? "", name: r.zone_name ?? r.zone_code ?? "" },
    fromDate: isoToDdmmyyyy(r.from_date),
    toDate: r.to_date ? isoToDdmmyyyy(r.to_date) : "",
    percentage: String(r.percentage),
    status: r.status,
    row_version: r.row_version,
  };
}

export const Route = createFileRoute("/utility/tax-charges-setup/fuel-setup")({
  head: () => ({
    meta: [
      { title: "Fuel Setup — Utility — Courier ERP" },
      {
        name: "description",
        content: "Configure fuel percentage by customer, product, and zone.",
      },
    ],
  }),
  component: FuelSetupPage,
});

function FuelSetupPage() {
  const { isAuthenticated: authed, permissions } = useAuth();
  const queryClient = useQueryClient();

  const [demoRows, setDemoRows] = useState<FuelRow[]>(seedRows);
  const [screen, setScreen] = useState<"list" | "form">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRv, setEditingRv] = useState<number | null>(null);
  const [form, setForm] = useState<FuelForm>(emptyForm());
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [lookupOpen, setLookupOpen] = useState<LookupKey | null>(null);
  const [lookupField, setLookupField] = useState<LookupField | null>(null);
  const [filters, setFilters] = useState({
    entryCode: "",
    customer: "",
    vendor: "",
    product: "",
    destination: "",
    zone: "",
    fromDate: "",
    toDate: "",
    percentage: "",
  });

  const liveQuery = useQuery({
    queryKey: ["fuel-rates", search],
    queryFn: () => listFuelRates({ search: search || null, page: 1, pageSize: 200 }),
    enabled: authed,
  });

  const liveRows = (liveQuery.data?.rows ?? []).map(dbToUi);
  const rows: FuelRow[] = authed ? liveRows : demoRows;

  const canAdd = !authed || canDo(permissions, UTILITY_TAX_FUEL_PERMISSIONS.fuelSetup, "add");
  const canModify = !authed || canDo(permissions, UTILITY_TAX_FUEL_PERMISSIONS.fuelSetup, "modify");
  const canDelete =
    !authed || canDo(permissions, UTILITY_TAX_FUEL_PERMISSIONS.fuelSetup, "delete") || canModify;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const values = rowValues(row);
      if (q && !values.some((value) => value.toLowerCase().includes(q))) return false;
      if (
        filters.entryCode &&
        !row.entryCode.toLowerCase().includes(filters.entryCode.toLowerCase())
      )
        return false;
      if (
        filters.customer &&
        !row.customer.name.toLowerCase().includes(filters.customer.toLowerCase())
      )
        return false;
      if (filters.vendor && !row.vendor.name.toLowerCase().includes(filters.vendor.toLowerCase()))
        return false;
      if (
        filters.product &&
        !row.product.name.toLowerCase().includes(filters.product.toLowerCase())
      )
        return false;
      if (
        filters.destination &&
        !row.destination.name.toLowerCase().includes(filters.destination.toLowerCase())
      )
        return false;
      if (filters.zone && !row.zone.name.toLowerCase().includes(filters.zone.toLowerCase()))
        return false;
      if (filters.fromDate && !row.fromDate.toLowerCase().includes(filters.fromDate.toLowerCase()))
        return false;
      if (filters.toDate && !row.toDate.toLowerCase().includes(filters.toDate.toLowerCase()))
        return false;
      if (
        filters.percentage &&
        !row.percentage.toLowerCase().includes(filters.percentage.toLowerCase())
      )
        return false;
      return true;
    });
  }, [filters, rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const startIdx = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const patch = (updates: Partial<FuelForm>) => setForm((current) => ({ ...current, ...updates }));

  const openAdd = () => {
    setEditingId(null);
    setEditingRv(null);
    setForm(emptyForm());
    setScreen("form");
  };

  const openEdit = (row: FuelRow) => {
    setEditingId(row.id);
    setEditingRv(row.row_version ?? null);
    setForm({
      customer: row.customer,
      vendor: row.vendor,
      product: row.product,
      destination: row.destination,
      zone: row.zone,
      fromDate: ddmmyyyyToIso(row.fromDate),
      toDate: ddmmyyyyToIso(row.toDate),
      percentage: row.percentage,
      status: row.status || "ACTIVE",
    });
    setScreen("form");
  };

  const openLookup = (field: LookupField, lookup: LookupKey) => {
    setLookupField(field);
    setLookupOpen(lookup);
  };

  const handleLookupSelect = (_value: string, option: LookupOption) => {
    if (!lookupField) return;
    patch({ [lookupField]: { code: option.code, name: option.name } });
    setLookupOpen(null);
  };

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["fuel-rates"] });
  };

  const save = async () => {
    const raw = {
      customer_code: form.customer.code.trim() || null,
      vendor_code: form.vendor.code.trim() || null,
      product_code: form.product.code.trim() || null,
      zone_code: form.zone.code.trim() || null,
      destination_code: form.destination.code.trim() || null,
      from_date: form.fromDate,
      to_date: form.toDate || null,
      percentage: form.percentage,
      status: (form.status === "INACTIVE" ? "INACTIVE" : "ACTIVE") as "ACTIVE" | "INACTIVE",
    };
    try {
      fuelRateSchema.parse(raw);
    } catch (err) {
      return toast.error(toErrorMessage(err, "Please fix the form"));
    }

    if (authed) {
      setBusy(true);
      try {
        await saveFuelRate({
          fields: raw,
          id: editingId,
          rowVersion: editingRv,
        });
        toast.success(editingId ? "Fuel setup updated" : "Fuel setup saved");
        invalidate();
        setScreen("list");
      } catch (err) {
        toast.error(toErrorMessage(err));
      } finally {
        setBusy(false);
      }
      return;
    }

    const nextRow: FuelRow = {
      id: editingId ?? crypto.randomUUID(),
      entryCode: editingId
        ? (demoRows.find((row) => row.id === editingId)?.entryCode ?? nextEntryCode(demoRows))
        : nextEntryCode(demoRows),
      customer: form.customer,
      vendor: form.vendor,
      product: form.product,
      destination: form.destination,
      zone: form.zone,
      fromDate: isoToDdmmyyyy(form.fromDate),
      toDate: isoToDdmmyyyy(form.toDate),
      percentage: form.percentage,
      status: form.status,
    };
    setDemoRows((current) =>
      editingId
        ? current.map((row) => (row.id === editingId ? nextRow : row))
        : [nextRow, ...current],
    );
    setScreen("list");
    toast.success(editingId ? "Fuel setup updated" : "Fuel setup saved");
  };

  const handleDelete = async (row: FuelRow) => {
    if (authed) {
      try {
        await deleteFuelRate(row.id, row.row_version);
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
      const rows = mapCsvToImportRows(parsedRows, [...FUEL_IMPORT_COLUMNS]);
      if (!rows.length) return toast.error("No rows to import");
      if (!authed) {
        toast.success(`Demo import preview: ${rows.length} rows`);
        return;
      }
      const validated = await importFuelRates("VALIDATE", rows);
      toast.message(importSummary(validated));
      if (validated.error_count > 0) return;
      const committed = await importFuelRates("COMMIT", rows);
      toast.success(importSummary(committed));
      invalidate();
    } catch (err) {
      toast.error(toErrorMessage(err, "Import failed"));
    }
  };

  if (screen === "form") {
    return (
      <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
        <MasterBreadcrumb trail={["Utility", "Tax / Charges Setup", "Fuel Setup"]} />

        <Card className="min-w-0 border p-4">
          <p className="mb-3 text-xs text-muted-foreground">
            Lookup priority: Customer + Product + Zone → Product + Zone → Global. After changes, run
            Rate Update Jobs to refresh shipment charges.
          </p>
          <div className="grid gap-x-3 gap-y-2 lg:grid-cols-4">
            <LookupFieldInput
              label="Customer"
              value={form.customer}
              onChange={(customer) => patch({ customer })}
              onLookupOpen={() => openLookup("customer", "customer")}
            />
            <LookupFieldInput
              label="Vendor"
              value={form.vendor}
              onChange={(vendor) => patch({ vendor })}
              onLookupOpen={() => openLookup("vendor", "vendor")}
            />
            <LookupFieldInput
              label="Product"
              value={form.product}
              onChange={(product) => patch({ product })}
              onLookupOpen={() => openLookup("product", "product")}
            />
            <LookupFieldInput
              label="Zone"
              value={form.zone}
              onChange={(zone) => patch({ zone })}
              onLookupOpen={() => openLookup("zone", "zone")}
            />
            <LookupFieldInput
              label="Destination"
              value={form.destination}
              onChange={(destination) => patch({ destination })}
              onLookupOpen={() => openLookup("destination", "destination")}
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
              label="Percentage"
              value={form.percentage}
              onChange={(percentage) => patch({ percentage })}
            />
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
      <MasterBreadcrumb trail={["Utility", "Tax / Charges Setup", "Fuel Setup"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Fuel Setup</h1>
        <p className="text-sm text-muted-foreground">
          Configure fuel percentages by customer, product, and zone.
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-1.5">
            <DataIoToolbar
              export={{
                filename: "fuel-setup",
                title: "Fuel Setup",
                columns: [
                  { key: "entryCode", header: "Entry Code" },
                  { key: "customer", header: "Customer" },
                  { key: "vendor", header: "Vendor" },
                  { key: "product", header: "Product" },
                  { key: "zone", header: "Zone" },
                  { key: "destination", header: "Destination" },
                  { key: "fromDate", header: "From Date" },
                  { key: "toDate", header: "To Date" },
                  { key: "percentage", header: "Percentage" },
                ],
                getRows: () =>
                  filtered.map((row) => ({
                    entryCode: row.entryCode,
                    customer: row.customer.name,
                    vendor: row.vendor.name,
                    product: row.product.name,
                    zone: row.zone.name,
                    destination: row.destination.name,
                    fromDate: row.fromDate,
                    toDate: row.toDate,
                    percentage: row.percentage,
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
                  "Entry Code",
                  "Customer",
                  "Vendor",
                  "Product",
                  "Zone",
                  "Destination",
                  "From Date",
                  "To Date",
                  "Percentage",
                  "Action",
                ].map((heading) => (
                  <TableHead key={heading} className="whitespace-nowrap text-sidebar-foreground">
                    <span className="flex items-center justify-between gap-2">
                      {heading}
                      {heading !== "Action" ? <span className="text-xs">⇅</span> : null}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                {(
                  [
                    "entryCode",
                    "customer",
                    "vendor",
                    "product",
                    "zone",
                    "destination",
                    "fromDate",
                    "toDate",
                    "percentage",
                  ] as const
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
                  <TableCell colSpan={10} className="py-6 text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((row) => (
                  <TableRow key={row.id} className="odd:bg-muted/50">
                    <TableCell>{row.entryCode}</TableCell>
                    <TableCell>{row.customer.name}</TableCell>
                    <TableCell>{row.vendor.name}</TableCell>
                    <TableCell>{row.product.name}</TableCell>
                    <TableCell>{row.zone.name}</TableCell>
                    <TableCell>{row.destination.name}</TableCell>
                    <TableCell>{row.fromDate}</TableCell>
                    <TableCell>{row.toDate}</TableCell>
                    <TableCell>{row.percentage}</TableCell>
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

function rowValues(row: FuelRow) {
  return [
    row.entryCode,
    row.customer.name,
    row.vendor.name,
    row.product.name,
    row.zone.name,
    row.destination.name,
    row.fromDate,
    row.toDate,
    row.percentage,
  ];
}

function nextEntryCode(rows: FuelRow[]) {
  const max = rows.reduce((acc, row) => Math.max(acc, Number(row.entryCode) || 0), 180600);
  return String(max + 1);
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
