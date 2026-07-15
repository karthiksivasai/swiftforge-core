import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { supabase } from "@/integrations/supabase/client";
import { useMasterResource } from "@/lib/masters/core/useMasterResource";
import { masterKeys } from "@/lib/masters/core/queryKeys";
import { mapCsvToImportRows, type ImportRow } from "@/lib/masters/core";
import type { CsvRecord } from "@/lib/masters/core/csv";
import {
  productsResource,
  PRODUCT_IMPORT_HEADER_ALIASES,
  CANONICAL_PRODUCT_TYPES,
  toProductTypeCode,
  type ProductRow as ProductDbRow,
  type CanonicalProductTypeName,
} from "@/lib/masters/resources/products";
import { productTypesResource } from "@/lib/masters/resources/productTypes";
import { productCreateSchema, productUpdateSchema } from "@/lib/masters/schemas/products";
import { useMasterList, toErrorMessage, importSummary } from "@/lib/masters/screen";
import { DataIoToolbar } from "@/components/data-io-toolbar";

type ProductType = CanonicalProductTypeName;
type GroupType = "Air" | "Surface" | "Train" | "All";
type Status = "Active" | "In-Active";
type ShipmentType = "DOX" | "NDOX";

type Product = {
  id: string;
  code: string;
  name: string;
  type: string;
  productTypeId?: string;
  service: string;
  fuelCharge: boolean;
  gstReverse: boolean;
  shipmentType: ShipmentType;
  status: Status;
  groupType: GroupType | "";
  row_version?: number;
};

const SEED: Product[] = [
  {
    id: "1",
    code: "ADOX",
    name: "ADOX",
    type: "International",
    service: "",
    fuelCharge: false,
    gstReverse: true,
    shipmentType: "DOX",
    status: "Active",
    groupType: "Air",
  },
  {
    id: "2",
    code: "ASPX",
    name: "ASPX",
    type: "International",
    service: "",
    fuelCharge: false,
    gstReverse: true,
    shipmentType: "DOX",
    status: "Active",
    groupType: "Air",
  },
  {
    id: "3",
    code: "COM",
    name: "COMMERCIAL",
    type: "International",
    service: "",
    fuelCharge: false,
    gstReverse: true,
    shipmentType: "NDOX",
    status: "Active",
    groupType: "Air",
  },
  {
    id: "4",
    code: "DOCS",
    name: "DOCUMENTS",
    type: "International",
    service: "",
    fuelCharge: false,
    gstReverse: true,
    shipmentType: "DOX",
    status: "Active",
    groupType: "Air",
  },
  {
    id: "5",
    code: "DOX",
    name: "INTL DOX",
    type: "International",
    service: "",
    fuelCharge: false,
    gstReverse: true,
    shipmentType: "DOX",
    status: "Active",
    groupType: "Air",
  },
  {
    id: "6",
    code: "ENV",
    name: "ENVELOPE",
    type: "International",
    service: "",
    fuelCharge: false,
    gstReverse: true,
    shipmentType: "DOX",
    status: "Active",
    groupType: "Air",
  },
  {
    id: "7",
    code: "FOOD",
    name: "FOOD",
    type: "International",
    service: "",
    fuelCharge: false,
    gstReverse: true,
    shipmentType: "NDOX",
    status: "Active",
    groupType: "Surface",
  },
  {
    id: "8",
    code: "LAP",
    name: "LAPTOP",
    type: "International",
    service: "",
    fuelCharge: false,
    gstReverse: true,
    shipmentType: "NDOX",
    status: "Active",
    groupType: "Air",
  },
  {
    id: "9",
    code: "MED",
    name: "MEDICINE",
    type: "International",
    service: "",
    fuelCharge: false,
    gstReverse: true,
    shipmentType: "NDOX",
    status: "Active",
    groupType: "Air",
  },
  {
    id: "10",
    code: "MOB",
    name: "MOBILE",
    type: "International",
    service: "",
    fuelCharge: false,
    gstReverse: true,
    shipmentType: "NDOX",
    status: "Active",
    groupType: "Air",
  },
  {
    id: "11",
    code: "GRMT",
    name: "GARMENTS",
    type: "Domestic",
    service: "",
    fuelCharge: true,
    gstReverse: false,
    shipmentType: "NDOX",
    status: "Active",
    groupType: "Surface",
  },
  {
    id: "12",
    code: "SPAR",
    name: "SPARE PARTS",
    type: "Domestic",
    service: "",
    fuelCharge: true,
    gstReverse: false,
    shipmentType: "NDOX",
    status: "Active",
    groupType: "Surface",
  },
  {
    id: "13",
    code: "BOOK",
    name: "BOOKS",
    type: "Local",
    service: "",
    fuelCharge: false,
    gstReverse: false,
    shipmentType: "NDOX",
    status: "In-Active",
    groupType: "Surface",
  },
  {
    id: "14",
    code: "GIFT",
    name: "GIFT ITEMS",
    type: "Import",
    service: "",
    fuelCharge: false,
    gstReverse: true,
    shipmentType: "NDOX",
    status: "Active",
    groupType: "Air",
  },
];

const PRODUCT_TYPES: ProductType[] = CANONICAL_PRODUCT_TYPES.map((t) => t.name);
const GROUP_TYPES: GroupType[] = ["Air", "Surface", "Train", "All"];
const STATUSES: Status[] = ["Active", "In-Active"];

const PAGE_SIZE = 10;

export const Route = createFileRoute("/master/sales/product")({
  head: () => ({
    meta: [
      { title: "Product — Master — Courier ERP" },
      {
        name: "description",
        content: "Manage product master records for the courier ERP platform.",
      },
    ],
  }),
  component: ProductPage,
});

function emptyProduct(): Omit<Product, "id"> {
  return {
    code: "",
    name: "",
    type: "",
    productTypeId: "",
    service: "",
    fuelCharge: false,
    gstReverse: false,
    shipmentType: "DOX",
    status: "Active",
    groupType: "",
  };
}

function groupFromDb(g: ProductDbRow["group_type"]): GroupType | "" {
  switch (g) {
    case "AIR":
      return "Air";
    case "SURFACE":
      return "Surface";
    case "TRAIN":
      return "Train";
    case "ALL":
      return "All";
    default:
      return "";
  }
}

function rowToView(r: ProductDbRow & Record<string, unknown>): Product {
  return {
    id: r.id,
    code: r.code,
    name: r.name ?? "",
    type: (r.product_type_name as string) ?? "",
    productTypeId: r.product_type_id ?? "",
    service: r.service ?? "",
    fuelCharge: r.fuel_charge,
    gstReverse: r.gst_reverse,
    shipmentType: r.shipment_type,
    status: r.status === "INACTIVE" ? "In-Active" : "Active",
    groupType: groupFromDb(r.group_type),
    row_version: r.row_version,
  };
}

function toRaw(form: Omit<Product, "id">) {
  return {
    code: form.code,
    name: form.name,
    product_type_id: form.productTypeId || null,
    service: form.service,
    fuel_charge: form.fuelCharge,
    gst_reverse: form.gstReverse,
    shipment_type: form.shipmentType,
    status: form.status === "In-Active" ? "INACTIVE" : "ACTIVE",
    group_type: form.groupType ? form.groupType.toUpperCase() : null,
  };
}

function ProductPage() {
  const { isAuthenticated: authed } = useAuth();
  const rc = useMasterResource(productsResource);
  const rcTypes = useMasterResource(productTypesResource);
  const live = useMasterList(productsResource, {
    enabled: authed,
    labelRefs: [{ idField: "product_type_id", table: "product_types", as: "product_type" }],
  });
  const productTypesLive = useMasterList(productTypesResource, { enabled: authed });
  const queryClient = useQueryClient();

  const [demoRows, setDemoRows] = useState<Product[]>(SEED);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<Omit<Product, "id">>(emptyProduct());
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const seededTypesRef = useRef(false);

  useEffect(() => {
    if (!authed || productTypesLive.isLoading || seededTypesRef.current) return;
    let cancelled = false;
    void (async () => {
      const { error } = await supabase.rpc("ensure_canonical_product_types");
      if (cancelled) return;
      if (!error) {
        seededTypesRef.current = true;
        void queryClient.invalidateQueries({ queryKey: masterKeys.all(productTypesResource.key) });
        void queryClient.invalidateQueries({ queryKey: masterKeys.all(productsResource.key) });
        return;
      }

      const existing = productTypesLive.rows as unknown as { code: string }[];
      const have = new Set(existing.map((r) => r.code.toUpperCase()));
      const missing = CANONICAL_PRODUCT_TYPES.filter((t) => !have.has(t.code));
      if (missing.length === 0) {
        seededTypesRef.current = true;
        return;
      }
      for (const t of missing) {
        try {
          await rcTypes.create.mutateAsync({ code: t.code, name: t.name });
        } catch {
          // Race / already exists — ignore; list refresh reconciles.
        }
      }
      if (!cancelled) {
        seededTypesRef.current = true;
        void queryClient.invalidateQueries({ queryKey: masterKeys.all(productTypesResource.key) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    authed,
    productTypesLive.isLoading,
    productTypesLive.rows,
    queryClient,
    rcTypes.create,
  ]);

  const typeIdByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of CANONICAL_PRODUCT_TYPES) {
      const row = (productTypesLive.rows as unknown as { id: string; code: string; name: string }[]).find(
        (r) => r.code === t.code || r.name.toLowerCase() === t.name.toLowerCase(),
      );
      if (row) map.set(t.name, row.id);
    }
    return map;
  }, [productTypesLive.rows]);

  const rows: Product[] = authed
    ? (live.rows as (ProductDbRow & Record<string, unknown>)[]).map(rowToView)
    : demoRows;

  const canAdd = !authed || rc.perms.canAdd;
  const canModify = !authed || rc.perms.canModify;
  const canDelete = !authed || rc.perms.canDelete;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.code, r.name, r.type, r.service].some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const startIdx = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyProduct());
    setOpen(true);
  };

  const openEdit = (row: Product) => {
    setEditing(row);
    const { id: _id, row_version: _rv, ...rest } = row;
    setForm(rest);
    setOpen(true);
  };

  const handleSave = async () => {
    const typeName = form.type.trim();
    const resolvedTypeId =
      form.productTypeId ||
      (typeName ? typeIdByName.get(typeName) : undefined) ||
      "";
    const raw = toRaw({ ...form, productTypeId: resolvedTypeId, type: typeName });
    if (authed) {
      if (typeName && !resolvedTypeId) {
        toast.error("Product type is not available yet. Refresh and try again.");
        return;
      }
      setSaving(true);
      try {
        if (editing) {
          const patch = productUpdateSchema.parse(raw);
          await rc.update.mutateAsync({
            id: editing.id,
            rowVersion: editing.row_version ?? 0,
            patch,
          });
          toast.success("Product updated");
        } else {
          const values = productCreateSchema.parse(raw);
          await rc.create.mutateAsync(values);
          toast.success("Product added");
        }
        setOpen(false);
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not save product"));
      } finally {
        setSaving(false);
      }
      return;
    }
    try {
      if (editing) productUpdateSchema.parse(raw);
      else productCreateSchema.parse(raw);
    } catch (err) {
      toast.error(toErrorMessage(err, "Please fix the form"));
      return;
    }
    if (editing) {
      setDemoRows((prev) => prev.map((r) => (r.id === editing.id ? { ...editing, ...form } : r)));
      toast.success("Product updated");
    } else {
      setDemoRows((prev) => [{ id: crypto.randomUUID(), ...form }, ...prev]);
      toast.success("Product added");
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
        toast.error(toErrorMessage(err, "Could not delete product"));
      }
    } else {
      setDemoRows((prev) => prev.filter((r) => r.id !== row.id));
      toast.success(`Deleted ${row.code}`);
    }
    setDeleteTarget(null);
  };

  const handleImportRows = async (parsedRows: CsvRecord[]) => {
    if (authed) {
      await supabase.rpc("ensure_canonical_product_types");
      const importRows = mapCsvToImportRows(parsedRows, productsResource.importColumns, {
        aliases: PRODUCT_IMPORT_HEADER_ALIASES,
      }).map((rec) => {
        const groupRaw = (rec.group_type || "").trim();
        const statusRaw = (rec.status || "").trim();
        return {
          ...rec,
          product_type_code: toProductTypeCode(rec.product_type_code),
          status: statusRaw
            ? statusRaw.toUpperCase().replace(/IN-ACTIVE/gi, "INACTIVE").replace(/-/g, "")
            : "ACTIVE",
          group_type: groupRaw ? groupRaw.toUpperCase() : "",
          shipment_type: (rec.shipment_type || "").trim().toUpperCase() || "DOX",
        };
      }) as ImportRow[];
      const res = await rc.commitImport.mutateAsync(importRows);
      const summary = importSummary(res);
      if (res.error_count > 0) {
        const sample = res.errors
          .slice(0, 3)
          .map((err) => `Row ${err.row_no}: ${err.message}`)
          .join("; ");
        toast.error(sample ? `${summary} — ${sample}` : summary);
      } else {
        toast.success(summary);
      }
      void queryClient.invalidateQueries({ queryKey: masterKeys.all(productsResource.key) });
      return;
    }
    const imported: Product[] = [];
    for (const rec of mapCsvToImportRows(parsedRows, productsResource.importColumns, {
      aliases: PRODUCT_IMPORT_HEADER_ALIASES,
    })) {
      if (!rec.code?.trim()) continue;
      const typeCode = toProductTypeCode(rec.product_type_code);
      const typeName =
        CANONICAL_PRODUCT_TYPES.find((t) => t.code === typeCode)?.name ??
        (PRODUCT_TYPES.includes(rec.product_type_code as ProductType)
          ? rec.product_type_code
          : "");
      const groupVal = (rec.group_type || "").trim();
      const groupNormalized =
        groupVal.charAt(0).toUpperCase() + groupVal.slice(1).toLowerCase();
      imported.push({
        id: crypto.randomUUID(),
        code: rec.code.trim(),
        name: (rec.name || "").trim(),
        type: typeName,
        productTypeId: "",
        service: (rec.service || "").trim(),
        fuelCharge: /^(yes|true|1)$/i.test((rec.fuel_charge || "").trim()),
        gstReverse: /^(yes|true|1)$/i.test((rec.gst_reverse || "").trim()),
        shipmentType: (rec.shipment_type || "").trim().toUpperCase() === "NDOX" ? "NDOX" : "DOX",
        status:
          (rec.status || "").trim().toUpperCase().replace(/-/g, "") === "INACTIVE"
            ? "In-Active"
            : "Active",
        groupType: GROUP_TYPES.includes(groupNormalized as GroupType)
          ? (groupNormalized as GroupType)
          : GROUP_TYPES.includes(groupVal as GroupType)
            ? (groupVal as GroupType)
            : "",
      });
    }
    if (imported.length === 0) {
      toast.error("No valid rows found");
      return;
    }
    setDemoRows((prev) => [...imported, ...prev]);
    toast.success(`Imported ${imported.length} product${imported.length === 1 ? "" : "s"}`);
  };

  const handleRefresh = () => {
    setSearch("");
    setPage(1);
    if (authed) queryClient.invalidateQueries({ queryKey: masterKeys.all(productsResource.key) });
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
            <BreadcrumbPage>Product</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Product</h1>
        <p className="text-sm text-muted-foreground">
          Manage the product master used across sales, rate cards, and shipments.
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center gap-1.5">
              <DataIoToolbar
                export={{
                  filename: "products",
                  title: "Products",
                  columns: [
                    { key: "code", header: "Product Code" },
                    { key: "name", header: "Product Name" },
                    { key: "type", header: "Product Type" },
                    { key: "service", header: "Product Service" },
                    { key: "fuelCharge", header: "Fuel Charge" },
                    { key: "gstReverse", header: "GST Reverse" },
                    { key: "shipmentType", header: "Shipment Type" },
                    { key: "status", header: "Status" },
                    { key: "groupType", header: "Group Type" },
                  ],
                  getRows: () =>
                    rows.map((r) => ({
                      code: r.code,
                      name: r.name,
                      type: r.type,
                      service: r.service,
                      fuelCharge: r.fuelCharge ? "Yes" : "No",
                      gstReverse: r.gstReverse ? "Yes" : "No",
                      shipmentType: r.shipmentType,
                      status: r.status,
                      groupType: r.groupType,
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
                <TableHead className="text-sidebar-foreground">Product Code</TableHead>
                <TableHead className="text-sidebar-foreground">Product Name</TableHead>
                <TableHead className="text-sidebar-foreground">Product Type</TableHead>
                <TableHead className="text-sidebar-foreground">Product Service</TableHead>
                <TableHead className="text-sidebar-foreground">Status</TableHead>
                <TableHead className="w-28 text-center text-sidebar-foreground">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-sm text-muted-foreground">
                    No products found.
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.code}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{r.type}</TableCell>
                    <TableCell>
                      {r.service || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.status === "Active"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {r.status}
                      </span>
                    </TableCell>
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
            {Array.from({ length: totalPages }).map((_, i) => {
              const n = i + 1;
              const active = n === currentPage;
              return (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={`h-8 min-w-8 rounded-md px-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-accent"
                  }`}
                >
                  {n}
                </button>
              );
            })}
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
            <DialogTitle>{editing ? "Edit Product" : "Add Product"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-5 py-2 md:grid-cols-2 lg:grid-cols-4">
            <FieldWrapper label="Product Code" required>
              <Input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="e.g. DOX"
              />
            </FieldWrapper>

            <FieldWrapper label="Product Name">
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Documents"
              />
            </FieldWrapper>

            <FieldWrapper label="Product Type">
              <Select
                value={form.type || undefined}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    type: v,
                    productTypeId: typeIdByName.get(v) ?? "",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Product Type" />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>

            <FieldWrapper label="Product Service">
              <Input
                value={form.service}
                onChange={(e) => setForm((f) => ({ ...f, service: e.target.value }))}
                placeholder="Service"
              />
            </FieldWrapper>

            <FieldWrapper label="Fuel Charge">
              <label className="flex h-10 items-center gap-2 rounded-md border bg-background px-3 text-sm">
                <Checkbox
                  checked={form.fuelCharge}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, fuelCharge: v === true }))}
                />
                Fuel Charge
              </label>
            </FieldWrapper>

            <FieldWrapper label="GST Reverse">
              <label className="flex h-10 items-center gap-2 rounded-md border bg-background px-3 text-sm">
                <Checkbox
                  checked={form.gstReverse}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, gstReverse: v === true }))}
                />
                GST Reverse
              </label>
            </FieldWrapper>

            <FieldWrapper label="Type">
              <div className="flex h-10 w-full overflow-hidden rounded-md border">
                {(["DOX", "NDOX"] as ShipmentType[]).map((t) => {
                  const active = form.shipmentType === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, shipmentType: t }))}
                      className={`flex-1 px-4 text-sm font-medium transition-colors ${
                        active
                          ? "bg-emerald-600 text-white"
                          : "bg-background text-foreground hover:bg-accent"
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
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
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>

            <FieldWrapper label="Group Type">
              <Select
                value={form.groupType || undefined}
                onValueChange={(v) => setForm((f) => ({ ...f, groupType: v as GroupType }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Group Type" />
                </SelectTrigger>
                <SelectContent>
                  {GROUP_TYPES.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>
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
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              <span className="font-medium text-foreground">{deleteTarget?.code}</span>
              {deleteTarget?.name ? ` (${deleteTarget.name})` : ""} from the product master. This
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
