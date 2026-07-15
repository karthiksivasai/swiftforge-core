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
  ChevronDown,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { cn } from "@/lib/utils";

import { useAuth } from "@/lib/auth";
import { useMasterResource } from "@/lib/masters/core/useMasterResource";
import { masterKeys } from "@/lib/masters/core/queryKeys";
import { mapCsvToImportRows, type ImportRow } from "@/lib/masters/core";
import type { CsvRecord } from "@/lib/masters/core/csv";
import {
  chargesResource,
  fetchChargeDependencies,
  saveChargeDependencies,
  type ChargeRow as ChargeDbRow,
} from "@/lib/masters/resources/charges";
import {
  chargeCreateSchema,
  chargeUpdateSchema,
  chargeDependencyIdsSchema,
  CHARGE_TYPES,
  CALC_BASES,
} from "@/lib/masters/schemas/charges";
import { useMasterList, toErrorMessage, importSummary } from "@/lib/masters/screen";
import { DataIoToolbar } from "@/components/data-io-toolbar";

type ChargeType = (typeof CHARGE_TYPES)[number];

type ChargeRow = {
  id: string;
  code: string;
  name: string;
  baseOn: string;
  applyFuel: boolean;
  applyTaxOnFuel: boolean;
  applyTax: boolean;
  chargeType: ChargeType;
  chargeRate: number;
  fuel: boolean;
  taxOnFuel: boolean;
  tax: boolean;
  hsnCode: string;
  sequence: number;
  /** Demo: dependency charge *names*. Live: dependency charge *ids*. */
  multipleCharges: string[];
  row_version?: number;
};

type Option = { value: string; label: string };

const SEED_DATA: Pick<
  ChargeRow,
  "code" | "name" | "baseOn" | "applyFuel" | "applyTaxOnFuel" | "applyTax"
>[] = [
  {
    code: "BP",
    name: "BILL AND PRESCRIPTION",
    baseOn: "FLAT",
    applyFuel: false,
    applyTaxOnFuel: false,
    applyTax: false,
  },
  {
    code: "CDV",
    name: "COVID CHARGE VENDOR",
    baseOn: "FLAT",
    applyFuel: false,
    applyTaxOnFuel: false,
    applyTax: false,
  },
  {
    code: "COM",
    name: "COMMERCIAL",
    baseOn: "FLAT",
    applyFuel: false,
    applyTaxOnFuel: false,
    applyTax: false,
  },
  {
    code: "CVD",
    name: "COVID CHARGE",
    baseOn: "FLAT",
    applyFuel: false,
    applyTaxOnFuel: false,
    applyTax: false,
  },
  {
    code: "DS",
    name: "DEMAND SURCHARGE VENDOR",
    baseOn: "Charge Weight",
    applyFuel: true,
    applyTaxOnFuel: true,
    applyTax: true,
  },
  {
    code: "DSC",
    name: "DEMAND SURCHARGE",
    baseOn: "Charge Weight",
    applyFuel: true,
    applyTaxOnFuel: true,
    applyTax: true,
  },
  {
    code: "EC",
    name: "ELECTRONIC CHARGES",
    baseOn: "FLAT",
    applyFuel: false,
    applyTaxOnFuel: false,
    applyTax: false,
  },
  {
    code: "ER",
    name: "ELEVATED RISK",
    baseOn: "Actual Weight",
    applyFuel: false,
    applyTaxOnFuel: false,
    applyTax: true,
  },
  {
    code: "FB",
    name: "FUMIGATION BILL",
    baseOn: "FLAT",
    applyFuel: false,
    applyTaxOnFuel: false,
    applyTax: false,
  },
  {
    code: "FDA",
    name: "FDA PRIOR NOTICE",
    baseOn: "FLAT",
    applyFuel: false,
    applyTaxOnFuel: false,
    applyTax: false,
  },
  {
    code: "FNG",
    name: "FRIEGHT NON GST",
    baseOn: "FLAT",
    applyFuel: false,
    applyTaxOnFuel: false,
    applyTax: false,
  },
  {
    code: "FRT",
    name: "FREIGHT",
    baseOn: "Freight",
    applyFuel: true,
    applyTaxOnFuel: true,
    applyTax: true,
  },
  {
    code: "GG",
    name: "GOGREEN VENDOR",
    baseOn: "Charge Weight",
    applyFuel: false,
    applyTaxOnFuel: false,
    applyTax: true,
  },
  {
    code: "GGC",
    name: "GOGREEN",
    baseOn: "Actual Weight",
    applyFuel: false,
    applyTaxOnFuel: false,
    applyTax: true,
  },
  {
    code: "HAN",
    name: "HANDLING CHARGES",
    baseOn: "FLAT",
    applyFuel: false,
    applyTaxOnFuel: false,
    applyTax: false,
  },
  {
    code: "INS",
    name: "INSURANCE CHARGES",
    baseOn: "FLAT",
    applyFuel: false,
    applyTaxOnFuel: false,
    applyTax: false,
  },
  {
    code: "MED",
    name: "MEDICAL CHARGES",
    baseOn: "Medical Charges",
    applyFuel: false,
    applyTaxOnFuel: false,
    applyTax: false,
  },
  {
    code: "MEV",
    name: "MEDICAL CHARGES VENDOR",
    baseOn: "Medical Charges",
    applyFuel: false,
    applyTaxOnFuel: false,
    applyTax: false,
  },
  {
    code: "MSM",
    name: "MSME REGISTRATION",
    baseOn: "FLAT",
    applyFuel: false,
    applyTaxOnFuel: false,
    applyTax: false,
  },
  {
    code: "NOA",
    name: "NON ANTIQUE CERTIFICATE CHARGES",
    baseOn: "FLAT",
    applyFuel: false,
    applyTaxOnFuel: false,
    applyTax: false,
  },
  {
    code: "ODA",
    name: "ODA CHARGES",
    baseOn: "ODA",
    applyFuel: false,
    applyTaxOnFuel: false,
    applyTax: false,
  },
  {
    code: "OTH",
    name: "OTHERS NZ",
    baseOn: "Actual Weight",
    applyFuel: false,
    applyTaxOnFuel: false,
    applyTax: false,
  },
  {
    code: "PB",
    name: "PURCHASE BILL",
    baseOn: "FLAT",
    applyFuel: false,
    applyTaxOnFuel: false,
    applyTax: false,
  },
  {
    code: "PC",
    name: "PACKING CHARGES",
    baseOn: "FLAT",
    applyFuel: false,
    applyTaxOnFuel: false,
    applyTax: false,
  },
  {
    code: "PEN",
    name: "PENALTY CHARGES",
    baseOn: "FLAT",
    applyFuel: false,
    applyTaxOnFuel: false,
    applyTax: false,
  },
  {
    code: "PIC",
    name: "Pickup charges",
    baseOn: "FLAT",
    applyFuel: false,
    applyTaxOnFuel: false,
    applyTax: false,
  },
  {
    code: "PRO",
    name: "UPS PROCESSING FEE",
    baseOn: "FLAT",
    applyFuel: false,
    applyTaxOnFuel: false,
    applyTax: false,
  },
  {
    code: "RD",
    name: "RESTRICTED DESTINATION SURCHARGES",
    baseOn: "Actual Weight",
    applyFuel: false,
    applyTaxOnFuel: false,
    applyTax: true,
  },
  {
    code: "REM",
    name: "REMOTE AU",
    baseOn: "Actual Weight",
    applyFuel: false,
    applyTaxOnFuel: false,
    applyTax: false,
  },
  {
    code: "RES",
    name: "REST NZ",
    baseOn: "Actual Weight",
    applyFuel: false,
    applyTaxOnFuel: false,
    applyTax: false,
  },
  {
    code: "SPH",
    name: "SPECIAL HANDLING",
    baseOn: "FLAT",
    applyFuel: false,
    applyTaxOnFuel: false,
    applyTax: false,
  },
  {
    code: "TDI",
    name: "TDI",
    baseOn: "FLAT",
    applyFuel: false,
    applyTaxOnFuel: false,
    applyTax: false,
  },
  {
    code: "WS",
    name: "WARSURGE",
    baseOn: "Actual Weight",
    applyFuel: true,
    applyTaxOnFuel: true,
    applyTax: true,
  },
];

const SEED: ChargeRow[] = SEED_DATA.map((s, i) => ({
  id: String(i + 1),
  chargeType: "AIRWAYBILL",
  chargeRate: 0,
  fuel: s.applyFuel,
  taxOnFuel: s.applyTaxOnFuel,
  tax: s.applyTax,
  hsnCode: "",
  sequence: 0,
  multipleCharges: [],
  ...s,
}));

const PAGE_SIZE = 10;

export const Route = createFileRoute("/master/sales/charges-master")({
  head: () => ({
    meta: [
      { title: "Charges Master — Master — Courier ERP" },
      {
        name: "description",
        content: "Manage the charges master used across billing and shipment pricing.",
      },
    ],
  }),
  component: ChargesMasterPage,
});

function emptyRow(): Omit<ChargeRow, "id"> {
  return {
    code: "",
    name: "",
    baseOn: "Actual Weight",
    applyFuel: false,
    applyTaxOnFuel: false,
    applyTax: false,
    chargeType: "AIRWAYBILL",
    chargeRate: 0,
    fuel: false,
    taxOnFuel: false,
    tax: false,
    hsnCode: "",
    sequence: 0,
    multipleCharges: [],
  };
}

function rowToView(r: ChargeDbRow): ChargeRow {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    baseOn: r.base_on,
    applyFuel: r.apply_fuel,
    applyTaxOnFuel: r.apply_tax_on_fuel,
    applyTax: r.apply_tax,
    chargeType: r.charge_type,
    chargeRate: Number(r.charge_rate) || 0,
    fuel: r.apply_fuel,
    taxOnFuel: r.apply_tax_on_fuel,
    tax: r.apply_tax,
    hsnCode: r.hsn_code ?? "",
    sequence: r.sequence,
    multipleCharges: [],
    row_version: r.row_version,
  };
}

function toRaw(form: Omit<ChargeRow, "id">) {
  return {
    code: form.code,
    name: form.name,
    base_on: form.baseOn,
    charge_type: form.chargeType,
    charge_rate: form.chargeRate,
    apply_fuel: form.fuel,
    apply_tax_on_fuel: form.taxOnFuel,
    apply_tax: form.tax,
    hsn_code: form.hsnCode,
    sequence: form.sequence,
  };
}

function ChargesMasterPage() {
  const { isAuthenticated: authed } = useAuth();
  const rc = useMasterResource(chargesResource);
  const live = useMasterList(chargesResource, { enabled: authed });
  const queryClient = useQueryClient();

  const depsQuery = useQuery({
    queryKey: [...masterKeys.all(chargesResource.key), "dependencies"],
    queryFn: fetchChargeDependencies,
    enabled: authed,
  });

  const depMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of depsQuery.data ?? []) {
      const arr = m.get(e.charge_id) ?? [];
      arr.push(e.depends_on_charge_id);
      m.set(e.charge_id, arr);
    }
    return m;
  }, [depsQuery.data]);

  const [demoRows, setDemoRows] = useState<ChargeRow[]>(SEED);
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState({
    code: "",
    name: "",
    baseOn: "",
    applyFuel: "",
    applyTaxOnFuel: "",
    applyTax: "",
  });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ChargeRow | null>(null);
  const [form, setForm] = useState<Omit<ChargeRow, "id">>(emptyRow());
  const [deleteTarget, setDeleteTarget] = useState<ChargeRow | null>(null);
  const [saving, setSaving] = useState(false);

  const rows: ChargeRow[] = authed ? (live.rows as ChargeDbRow[]).map(rowToView) : demoRows;

  const canAdd = !authed || rc.perms.canAdd;
  const canModify = !authed || rc.perms.canModify;
  const canDelete = !authed || rc.perms.canDelete;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const yn = (b: boolean) => (b ? "yes" : "no");
    return rows.filter((r) => {
      if (q && ![r.code, r.name, r.baseOn].some((v) => String(v).toLowerCase().includes(q)))
        return false;
      if (colFilters.code && !r.code.toLowerCase().includes(colFilters.code.toLowerCase()))
        return false;
      if (colFilters.name && !r.name.toLowerCase().includes(colFilters.name.toLowerCase()))
        return false;
      if (colFilters.baseOn && !r.baseOn.toLowerCase().includes(colFilters.baseOn.toLowerCase()))
        return false;
      if (colFilters.applyFuel && !yn(r.applyFuel).includes(colFilters.applyFuel.toLowerCase()))
        return false;
      if (
        colFilters.applyTaxOnFuel &&
        !yn(r.applyTaxOnFuel).includes(colFilters.applyTaxOnFuel.toLowerCase())
      )
        return false;
      if (colFilters.applyTax && !yn(r.applyTax).includes(colFilters.applyTax.toLowerCase()))
        return false;
      return true;
    });
  }, [rows, search, colFilters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const startIdx = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, filtered.length);

  // Options for the "Multiple Charges" M:N picker. Live: value=id; demo: value=name.
  const chargeOptions: Option[] = useMemo(() => {
    const opts = authed
      ? rows.filter((r) => r.id !== editing?.id).map((r) => ({ value: r.id, label: r.name }))
      : rows.map((r) => ({ value: r.name, label: r.name }));
    return opts.sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, authed, editing]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyRow());
    setOpen(true);
  };

  const openEdit = (row: ChargeRow) => {
    setEditing(row);
    const { id: _id, row_version: _rv, ...rest } = row;
    const deps = authed ? (depMap.get(row.id) ?? []) : row.multipleCharges;
    setForm({ ...rest, multipleCharges: deps });
    setOpen(true);
  };

  const handleSave = async () => {
    const raw = toRaw(form);
    if (authed) {
      setSaving(true);
      try {
        let chargeId: string;
        if (editing) {
          const patch = chargeUpdateSchema.parse(raw);
          const updated = await rc.update.mutateAsync({
            id: editing.id,
            rowVersion: editing.row_version ?? 0,
            patch,
          });
          chargeId = updated.id;
        } else {
          const values = chargeCreateSchema.parse(raw);
          const created = await rc.create.mutateAsync(values);
          chargeId = created.id;
        }
        const depIds = chargeDependencyIdsSchema.parse(form.multipleCharges);
        await saveChargeDependencies(chargeId, depIds);
        await queryClient.invalidateQueries({ queryKey: masterKeys.all(chargesResource.key) });
        toast.success(editing ? "Charge updated" : "Charge added");
        setOpen(false);
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not save charge"));
      } finally {
        setSaving(false);
      }
      return;
    }

    try {
      if (editing) chargeUpdateSchema.parse(raw);
      else chargeCreateSchema.parse(raw);
    } catch (err) {
      toast.error(toErrorMessage(err, "Please fix the form"));
      return;
    }
    const merged: Omit<ChargeRow, "id"> = {
      ...form,
      applyFuel: form.fuel,
      applyTaxOnFuel: form.taxOnFuel,
      applyTax: form.tax,
      baseOn: form.baseOn,
    };
    if (editing) {
      setDemoRows((prev) => prev.map((r) => (r.id === editing.id ? { ...editing, ...merged } : r)));
      toast.success("Charge updated");
    } else {
      setDemoRows((prev) => [{ id: crypto.randomUUID(), ...merged }, ...prev]);
      toast.success("Charge added");
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
        toast.error(toErrorMessage(err, "Could not delete charge"));
      }
    } else {
      setDemoRows((prev) => prev.filter((r) => r.id !== row.id));
      toast.success(`Deleted ${row.code}`);
    }
    setDeleteTarget(null);
  };

  const handleImportRows = async (parsedRows: CsvRecord[]) => {
    if (authed) {
      const importRows = mapCsvToImportRows(
        parsedRows,
        chargesResource.importColumns,
      ) as ImportRow[];
      const res = await rc.commitImport.mutateAsync(importRows);
      toast.success(importSummary(res));
      return;
    }
    const yesNo = (v?: string) => /^(yes|true|1)$/i.test((v || "").trim());
    const imported: ChargeRow[] = [];
    for (const rec of mapCsvToImportRows(parsedRows, [
      "code",
      "name",
      "base_on",
      "apply_fuel",
      "apply_tax_on_fuel",
      "apply_tax",
    ])) {
      if (!rec.code?.trim()) continue;
      const af = yesNo(rec.apply_fuel);
      const atof = yesNo(rec.apply_tax_on_fuel);
      const at = yesNo(rec.apply_tax);
      imported.push({
        id: crypto.randomUUID(),
        code: rec.code.trim(),
        name: (rec.name || "").trim(),
        baseOn: (rec.base_on || "FLAT").trim(),
        applyFuel: af,
        applyTaxOnFuel: atof,
        applyTax: at,
        chargeType: "AIRWAYBILL",
        chargeRate: 0,
        fuel: af,
        taxOnFuel: atof,
        tax: at,
        hsnCode: "",
        sequence: 0,
        multipleCharges: [],
      });
    }
    if (imported.length === 0) {
      toast.error("No valid rows found");
      return;
    }
    setDemoRows((prev) => [...imported, ...prev]);
    toast.success(`Imported ${imported.length} row${imported.length === 1 ? "" : "s"}`);
  };

  const handleRefresh = () => {
    setSearch("");
    setColFilters({
      code: "",
      name: "",
      baseOn: "",
      applyFuel: "",
      applyTaxOnFuel: "",
      applyTax: "",
    });
    setPage(1);
    if (authed) queryClient.invalidateQueries({ queryKey: masterKeys.all(chargesResource.key) });
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
            <BreadcrumbPage>Charges Master</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Charges Master</h1>
        <p className="text-sm text-muted-foreground">
          Manage the charges used across billing, freight, taxes and vendor pricing.
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center gap-1.5">
              <DataIoToolbar
                export={{
                  filename: "charges",
                  title: "Charges Master",
                  columns: [
                    { key: "code", header: "Code" },
                    { key: "name", header: "Name" },
                    { key: "baseOn", header: "Base On" },
                    { key: "applyFuel", header: "Apply Fuel" },
                    { key: "applyTaxOnFuel", header: "Apply Tax On Fuel" },
                    { key: "applyTax", header: "Apply Tax" },
                  ],
                  getRows: () =>
                    rows.map((r) => ({
                      code: r.code,
                      name: r.name,
                      baseOn: r.baseOn,
                      applyFuel: r.applyFuel ? "Yes" : "No",
                      applyTaxOnFuel: r.applyTaxOnFuel ? "Yes" : "No",
                      applyTax: r.applyTax ? "Yes" : "No",
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
                <TableHead className="text-sidebar-foreground">Code</TableHead>
                <TableHead className="text-sidebar-foreground">Name</TableHead>
                <TableHead className="text-sidebar-foreground">Base On</TableHead>
                <TableHead className="text-sidebar-foreground">Apply Fuel</TableHead>
                <TableHead className="text-sidebar-foreground">Apply Tax On Fuel</TableHead>
                <TableHead className="text-sidebar-foreground">Apply Tax</TableHead>
                <TableHead className="w-28 text-center text-sidebar-foreground">Action</TableHead>
              </TableRow>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                {(
                  ["code", "name", "baseOn", "applyFuel", "applyTaxOnFuel", "applyTax"] as const
                ).map((k) => (
                  <TableHead key={k} className="py-1.5">
                    <Input
                      value={colFilters[k]}
                      onChange={(e) => {
                        setColFilters((f) => ({ ...f, [k]: e.target.value }));
                        setPage(1);
                      }}
                      placeholder={
                        k === "code"
                          ? "Code"
                          : k === "name"
                            ? "Name"
                            : k === "baseOn"
                              ? "Base On"
                              : k === "applyFuel"
                                ? "Apply Fuel"
                                : k === "applyTaxOnFuel"
                                  ? "Apply Tax On Fuel"
                                  : "Apply Tax"
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
                  <TableCell colSpan={7} className="h-32 text-center text-sm text-muted-foreground">
                    No charges found.
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.code}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{r.baseOn}</TableCell>
                    <TableCell>{r.applyFuel ? "Yes" : "No"}</TableCell>
                    <TableCell>{r.applyTaxOnFuel ? "Yes" : "No"}</TableCell>
                    <TableCell>{r.applyTax ? "Yes" : "No"}</TableCell>
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
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Charge" : "Add Charge"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-5 py-2 md:grid-cols-2 lg:grid-cols-4">
            <FieldWrapper label="Description Code" required>
              <Input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="e.g. FRT"
                className={cn(
                  !form.code.trim() && "border-destructive/60 focus-visible:ring-destructive/30",
                )}
              />
            </FieldWrapper>
            <FieldWrapper label="Description Name" required>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. FREIGHT"
              />
            </FieldWrapper>
            <FieldWrapper label="Charge Type">
              <Select
                value={form.chargeType}
                onValueChange={(v) => setForm((f) => ({ ...f, chargeType: v as ChargeType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHARGE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>
            <FieldWrapper label="Calculation Base">
              <Select
                value={form.baseOn}
                onValueChange={(v) => setForm((f) => ({ ...f, baseOn: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CALC_BASES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>

            <FieldWrapper label="Charge Rate">
              <Input
                type="number"
                value={form.chargeRate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, chargeRate: Number(e.target.value) || 0 }))
                }
              />
            </FieldWrapper>
            <div className="flex h-10 items-center gap-2 self-end rounded-md border px-3 py-2">
              <Checkbox
                id="fuel"
                checked={form.fuel}
                onCheckedChange={(v) => setForm((f) => ({ ...f, fuel: Boolean(v) }))}
              />
              <Label htmlFor="fuel" className="cursor-pointer text-sm">
                Fuel
              </Label>
            </div>
            <div className="flex h-10 items-center gap-2 self-end rounded-md border px-3 py-2">
              <Checkbox
                id="taxOnFuel"
                checked={form.taxOnFuel}
                onCheckedChange={(v) => setForm((f) => ({ ...f, taxOnFuel: Boolean(v) }))}
              />
              <Label htmlFor="taxOnFuel" className="cursor-pointer text-sm">
                Tax On Fuel
              </Label>
            </div>
            <div className="flex h-10 items-center gap-2 self-end rounded-md border px-3 py-2">
              <Checkbox
                id="tax"
                checked={form.tax}
                onCheckedChange={(v) => setForm((f) => ({ ...f, tax: Boolean(v) }))}
              />
              <Label htmlFor="tax" className="cursor-pointer text-sm">
                Tax
              </Label>
            </div>

            <FieldWrapper label="HSN Code">
              <Input
                value={form.hsnCode}
                onChange={(e) => setForm((f) => ({ ...f, hsnCode: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper label="Sequence">
              <Input
                type="number"
                value={form.sequence}
                onChange={(e) => setForm((f) => ({ ...f, sequence: Number(e.target.value) || 0 }))}
              />
            </FieldWrapper>
            <FieldWrapper label="Multiple Charges">
              <MultiChargeSelect
                options={chargeOptions}
                selected={form.multipleCharges}
                onChange={(vals) => setForm((f) => ({ ...f, multipleCharges: vals }))}
              />
            </FieldWrapper>
            <div className="flex h-10 items-center gap-2 self-end rounded-md border px-3 py-2">
              <Checkbox
                id="applyFuel"
                checked={form.applyFuel}
                onCheckedChange={(v) => setForm((f) => ({ ...f, applyFuel: Boolean(v) }))}
              />
              <Label htmlFor="applyFuel" className="cursor-pointer text-sm">
                Apply Fuel
              </Label>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="min-w-[90px] bg-emerald-600 text-white hover:bg-emerald-600/90"
            >
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button variant="destructive" onClick={() => setOpen(false)} className="min-w-[90px]">
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete charge?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              <span className="font-medium text-foreground">{deleteTarget?.code}</span>
              {deleteTarget?.name ? ` (${deleteTarget.name})` : ""} from the charges master. This
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

function MultiChargeSelect({
  options,
  selected,
  onChange,
}: {
  options: Option[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const allSelected = options.length > 0 && selected.length === options.length;
  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((s) => s !== value) : [...selected, value]);
  };
  const toggleAll = () => onChange(allSelected ? [] : options.map((o) => o.value));
  const labelFor = (value: string) => options.find((o) => o.value === value)?.label ?? value;
  const label =
    selected.length === 0
      ? "Multiple Charges"
      : selected.length === 1
        ? labelFor(selected[0])
        : `${selected.length} selected`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm"
        >
          <span className={cn("truncate", selected.length === 0 && "text-muted-foreground")}>
            {label}
          </span>
          <ChevronDown className="h-4 w-4 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-72 w-[var(--radix-popover-trigger-width)] overflow-y-auto overscroll-contain p-0"
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <label className="sticky top-0 z-10 flex cursor-pointer items-center justify-between gap-2 border-b bg-popover px-3 py-2 text-sm hover:bg-muted">
          <span>Select All</span>
          <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
        </label>
        {options.map((opt) => (
          <label
            key={opt.value}
            className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted"
          >
            <span className="truncate">{opt.label}</span>
            <Checkbox
              checked={selected.includes(opt.value)}
              onCheckedChange={() => toggle(opt.value)}
            />
          </label>
        ))}
      </PopoverContent>
    </Popover>
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
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
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
