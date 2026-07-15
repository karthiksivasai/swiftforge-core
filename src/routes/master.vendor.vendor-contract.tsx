import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  Upload,
  Plus,
  Search,
  Pencil,
  Trash2,
  Calendar as CalendarIcon,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import type { LookupKey, LookupOption } from "@/lib/master-lookups";

import { useAuth } from "@/lib/auth";
import { useMasterResource } from "@/lib/masters/core/useMasterResource";
import { masterKeys } from "@/lib/masters/core/queryKeys";
import { parseCsv, mapCsvToImportRows, type ImportRow } from "@/lib/masters/core";
import {
  fetchVendorContractList,
  fetchVendorContractSlabs,
  saveVendorContract,
  vendorContractsResource,
} from "@/lib/masters/resources/vendorContracts";
import { vendorContractCreateSchema } from "@/lib/masters/schemas/vendorContracts";
import { toErrorMessage, importSummary } from "@/lib/masters/screen";
import {
  dbVendorContractToUi,
  slabsToDraftRates,
  type UiRateLine,
  type UiVendorContractForm,
  type UiVendorContractRow,
  uiSlabsFromDraft,
  uiVendorContractToSavePayload,
} from "@/lib/masters/vendorContractUiMap";

type LookupPair = { id?: string; code: string; name: string };

const emptyPair = (): LookupPair => ({ code: "", name: "" });

type SearchFilters = {
  vendor: LookupPair;
  zone: LookupPair;
  contractNo: string;
  fromDate: string;
  country: LookupPair;
  origin: LookupPair;
  destination: LookupPair;
  product: LookupPair;
  service: string;
};

type IncreaseRateForm = {
  fromDate: string;
  increaseBy: string;
  rateRoundOff: boolean;
};

const UNIT_TYPES = ["KG", "LB", "CBM", "Piece"] as const;
const RATE_TYPES = ["Flat", "Per KG", "Per Slab", "Minimum"] as const;
const INCREASE_TYPES = ["Amount", "Percentage"] as const;

const emptyIncreaseForm = (): IncreaseRateForm => ({
  fromDate: format(new Date(), "yyyy-MM-dd"),
  increaseBy: "",
  rateRoundOff: false,
});

const emptyFilters = (): SearchFilters => ({
  vendor: emptyPair(),
  zone: emptyPair(),
  contractNo: "",
  fromDate: "",
  country: emptyPair(),
  origin: emptyPair(),
  destination: emptyPair(),
  product: emptyPair(),
  service: "",
});

const emptyForm = (): UiVendorContractForm => ({
  fromDate: format(new Date(), "yyyy-MM-dd"),
  vendorId: "",
  vendorCode: "",
  vendorName: "",
  originId: "",
  originCode: "",
  originName: "",
  zoneId: "",
  zoneCode: "",
  zoneName: "",
  countryId: "",
  countryCode: "",
  countryName: "",
  destinationId: "",
  destinationCode: "",
  destinationName: "",
  productId: "",
  productCode: "",
  productName: "",
  service: "",
  contractNo: "",
  unit: "",
  days: "",
  rateType: "",
  weight: "",
  rate: "",
});

export const Route = createFileRoute("/master/vendor/vendor-contract")({
  head: () => ({
    meta: [
      { title: "Vendor Contract — Master — Courier ERP" },
      { name: "description", content: "Search and manage vendor rate contracts by zone, product, and service." },
    ],
  }),
  component: VendorContractPage,
});

function VendorContractPage() {
  const { isAuthenticated: authed } = useAuth();
  const rc = useMasterResource(vendorContractsResource);
  const queryClient = useQueryClient();

  const [demoRows, setDemoRows] = useState<UiVendorContractRow[]>([]);
  const [filters, setFilters] = useState<SearchFilters>(emptyFilters());
  const [appliedFilters, setAppliedFilters] = useState<SearchFilters>(emptyFilters());
  const [hasSearched, setHasSearched] = useState(false);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UiVendorContractRow | null>(null);
  const [form, setForm] = useState<UiVendorContractForm>(emptyForm());
  const [draftRates, setDraftRates] = useState<UiRateLine[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<UiVendorContractRow | null>(null);
  const [increaseRateOpen, setIncreaseRateOpen] = useState(false);
  const [increaseForm, setIncreaseForm] = useState<IncreaseRateForm>(emptyIncreaseForm());
  const [saving, setSaving] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const liveQuery = useQuery({
    queryKey: masterKeys.list(vendorContractsResource.key, {
      live: true,
      searched: hasSearched,
      filters: appliedFilters,
    }),
    enabled: authed && hasSearched,
    queryFn: async () => {
      const flat = await fetchVendorContractList({
        vendorId: appliedFilters.vendor.id,
        zoneId: appliedFilters.zone.id,
        contractNo: appliedFilters.contractNo,
        fromDate: appliedFilters.fromDate || undefined,
        countryId: appliedFilters.country.id,
        originId: appliedFilters.origin.id,
        destinationId: appliedFilters.destination.id,
        productId: appliedFilters.product.id,
        service: appliedFilters.service || undefined,
      });
      return flat.map((row) =>
        dbVendorContractToUi(row, {
          seq: row.seq,
          rate_type: row.rate_type,
          weight: row.weight,
          rate: row.rate,
        }),
      );
    },
  });

  const rows: UiVendorContractRow[] = authed ? (liveQuery.data ?? []) : demoRows;

  const canAdd = !authed || rc.perms.canAdd;
  const canModify = !authed || rc.perms.canModify;
  const canDelete = !authed || rc.perms.canDelete;

  const filtered = useMemo(() => {
    if (authed || !hasSearched) return rows;
    const f = appliedFilters;
    return rows.filter((r) => {
      if (f.vendor.code && !r.vendorCode.toLowerCase().includes(f.vendor.code.toLowerCase())) return false;
      if (f.vendor.name && !r.vendorName.toLowerCase().includes(f.vendor.name.toLowerCase())) return false;
      if (f.zone.code && !r.zoneCode.toLowerCase().includes(f.zone.code.toLowerCase())) return false;
      if (f.zone.name && !r.zoneName.toLowerCase().includes(f.zone.name.toLowerCase())) return false;
      if (f.contractNo && !r.contractNo.toLowerCase().includes(f.contractNo.toLowerCase())) return false;
      if (f.fromDate && r.fromDate !== f.fromDate) return false;
      if (f.country.code && !r.countryCode.toLowerCase().includes(f.country.code.toLowerCase())) return false;
      if (f.country.name && !r.countryName.toLowerCase().includes(f.country.name.toLowerCase())) return false;
      if (f.origin.code && !r.originCode.toLowerCase().includes(f.origin.code.toLowerCase())) return false;
      if (f.origin.name && !r.originName.toLowerCase().includes(f.origin.name.toLowerCase())) return false;
      if (f.destination.code && !r.destinationCode.toLowerCase().includes(f.destination.code.toLowerCase())) return false;
      if (f.destination.name && !r.destinationName.toLowerCase().includes(f.destination.name.toLowerCase())) return false;
      if (f.product.code && !r.productCode.toLowerCase().includes(f.product.code.toLowerCase())) return false;
      if (f.product.name && !r.productName.toLowerCase().includes(f.product.name.toLowerCase())) return false;
      if (f.service && !r.service.toLowerCase().includes(f.service.toLowerCase())) return false;
      return true;
    });
  }, [rows, appliedFilters, hasSearched, authed]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const startIdx = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const openAddContract = () => {
    setEditing(null);
    setForm(emptyForm());
    setDraftRates([]);
    setOpen(true);
  };

  const openIncreaseRate = () => {
    setIncreaseForm(emptyIncreaseForm());
    setIncreaseRateOpen(true);
  };

  const openEdit = async (row: UiVendorContractRow) => {
    setEditing(row);
    setForm({
      fromDate: row.fromDate,
      vendorId: row.vendorId,
      vendorCode: row.vendorCode,
      vendorName: row.vendorName,
      originId: row.originId,
      originCode: row.originCode,
      originName: row.originName,
      zoneId: row.zoneId,
      zoneCode: row.zoneCode,
      zoneName: row.zoneName,
      countryId: row.countryId,
      countryCode: row.countryCode,
      countryName: row.countryName,
      destinationId: row.destinationId,
      destinationCode: row.destinationCode,
      destinationName: row.destinationName,
      productId: row.productId,
      productCode: row.productCode,
      productName: row.productName,
      service: row.service,
      contractNo: row.contractNo,
      unit: row.unit,
      days: row.days,
      rateType: "",
      weight: "",
      rate: "",
    });

    if (authed) {
      try {
        const slabs = await fetchVendorContractSlabs(row.contractId);
        setDraftRates(slabsToDraftRates(slabs));
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not load rate slabs"));
        setDraftRates([]);
      }
    } else {
      setDraftRates([]);
    }
    setOpen(true);
  };

  const handleAddRateLine = () => {
    if (!form.rateType) return toast.error("Rate Type is required");
    if (!form.weight.trim()) return toast.error("Weight is required");
    if (!form.rate.trim()) return toast.error("Rate is required");
    const rate = parseFloat(form.rate);
    if (Number.isNaN(rate) || rate < 0) return toast.error("Rate must be a positive number");
    setDraftRates((prev) => [...prev, { rateType: form.rateType, weight: form.weight, rate: form.rate }]);
    setForm((f) => ({ ...f, rateType: "", weight: "", rate: "" }));
    toast.success("Rate line added");
  };

  const handleSave = async () => {
    if (!form.fromDate) return toast.error("From Date is required");
    if (!form.vendorId && !form.vendorCode.trim()) return toast.error("Vendor is required");
    if (!form.productId && !form.productCode.trim() && !form.productName.trim()) {
      return toast.error("Product is required");
    }

    const slabs = uiSlabsFromDraft(form, draftRates);
    if (slabs.length === 0) return toast.error("Add at least one rate line");

    if (authed) {
      if (!form.vendorId || !form.productId) {
        return toast.error("Select vendor and product from lookup when signed in");
      }
      setSaving(true);
      try {
        const fields = vendorContractCreateSchema.parse(uiVendorContractToSavePayload(form));
        await saveVendorContract({
          id: editing?.contractId ?? null,
          rowVersion: editing?.row_version ?? null,
          fields,
          slabs,
        });
        await queryClient.invalidateQueries({ queryKey: masterKeys.all(vendorContractsResource.key) });
        toast.success(editing ? "Vendor contract updated" : "Vendor contract saved");
        setOpen(false);
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not save vendor contract"));
      } finally {
        setSaving(false);
      }
      return;
    }

    const lines = draftRates.length > 0
      ? draftRates
      : [{ rateType: form.rateType, weight: form.weight, rate: form.rate }];

    if (editing) {
      const line = lines[0];
      setDemoRows((prev) =>
        prev.map((r) =>
          r.id === editing.id
            ? {
                ...editing,
                ...form,
                rateType: line.rateType,
                weight: line.weight,
                rate: line.rate,
              }
            : r,
        ),
      );
      toast.success("Vendor contract updated");
    } else {
      const contractId = crypto.randomUUID();
      const newRows = lines.map((line, idx) => ({
        id: `${contractId}:${idx + 1}`,
        contractId,
        slabSeq: idx + 1,
        ...form,
        rateType: line.rateType,
        weight: line.weight,
        rate: line.rate,
      }));
      setDemoRows((prev) => [...newRows, ...prev]);
      toast.success(`Added ${newRows.length} vendor rate${newRows.length === 1 ? "" : "s"}`);
    }
    setOpen(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const row = deleteTarget;

    if (authed) {
      try {
        await rc.remove.mutateAsync({ id: row.contractId, rowVersion: row.row_version ?? 0 });
        await queryClient.invalidateQueries({ queryKey: masterKeys.all(vendorContractsResource.key) });
        toast.success("Vendor contract deleted");
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not delete vendor contract"));
      }
    } else {
      setDemoRows((prev) => prev.filter((r) => r.contractId !== row.contractId));
      toast.success("Vendor contract deleted");
    }
    setDeleteTarget(null);
  };

  const handleSearch = () => {
    setAppliedFilters({ ...filters });
    setHasSearched(true);
    setPage(1);
    toast.success("Search applied");
  };

  const handleReset = () => {
    setFilters(emptyFilters());
    setAppliedFilters(emptyFilters());
    setHasSearched(false);
    setPage(1);
    toast.success("Filters reset");
  };

  const handleIncreaseRateSave = () => {
    if (!increaseForm.increaseBy) return toast.error("Select Increase Type");
    if (filtered.length === 0) return toast.error("No matching vendor rates to update");
    if (authed) {
      toast.info("Bulk rate increase will be enabled with a dedicated RPC");
      setIncreaseRateOpen(false);
      return;
    }

    const targetIds = new Set(filtered.map((r) => r.id));
    setDemoRows((prev) =>
      prev.map((r) => {
        if (!targetIds.has(r.id)) return r;
        const current = parseFloat(r.rate);
        if (Number.isNaN(current)) return r;
        let next = current;
        if (increaseForm.increaseBy === "Amount") next = current + 1;
        if (increaseForm.increaseBy === "Percentage") next = current * 1.01;
        if (increaseForm.rateRoundOff) next = Math.round(next * 100) / 100;
        return { ...r, fromDate: increaseForm.fromDate, rate: String(next) };
      }),
    );
    toast.success("Rate increase applied");
    setIncreaseRateOpen(false);
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
          vendorContractsResource.importColumns,
        ) as ImportRow[];
        const res = await rc.commitImport.mutateAsync(importRows);
        toast.success(importSummary(res));
        return;
      }
      toast.info("Import will be enabled with backend wiring");
    } catch (err) {
      toast.error(toErrorMessage(err, "Import failed"));
    }
  };

  const patchFilter = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
  };

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <MasterBreadcrumb trail={["Master", "Vendor", "Vendor Contract"]} />

      <Card className="overflow-hidden border p-0">
        <input ref={importInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportFile} />

        <div className="p-4 md:p-6">
          <div className="mb-3 flex items-start justify-between gap-3">
            <TooltipProvider delayDuration={200}>
              <div className="flex items-center gap-1.5">
                <IconButton label="Import" onClick={() => importInputRef.current?.click()}><Upload className="h-4 w-4" /></IconButton>
                <IconButton label="IncreaseRate" onClick={openIncreaseRate}><Plus className="h-4 w-4" /></IconButton>
              </div>
            </TooltipProvider>
            {canAdd ? (
              <Button size="sm" onClick={openAddContract} className="h-9 gap-1.5">
                <Plus className="h-4 w-4" />
                Add
              </Button>
            ) : null}
          </div>

          <Badge className="mb-4 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90">Vendor Rate</Badge>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <FieldWrapper label="Vendor">
              <LookupPairInput lookup="vendor" value={filters.vendor} onChange={(v) => patchFilter("vendor", v)} />
            </FieldWrapper>
            <FieldWrapper label="From Date">
              <Select value={filters.fromDate || undefined} onValueChange={(v) => patchFilter("fromDate", v)}>
                <SelectTrigger><SelectValue placeholder="Select From Date" /></SelectTrigger>
                <SelectContent>
                  {[0, 1, 2, 3, 4, 5, 6].map((offset) => {
                    const d = new Date();
                    d.setMonth(d.getMonth() - offset);
                    const val = format(d, "yyyy-MM-dd");
                    return (
                      <SelectItem key={val} value={val}>{format(d, "dd/MM/yyyy")}</SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </FieldWrapper>
            <FieldWrapper label="Origin">
              <LookupPairInput lookup="destination" value={filters.origin} onChange={(v) => patchFilter("origin", v)} />
            </FieldWrapper>
            <FieldWrapper label="Product">
              <LookupPairInput lookup="product" value={filters.product} onChange={(v) => patchFilter("product", v)} />
            </FieldWrapper>

            <FieldWrapper label="Zone">
              <LookupPairInput lookup="zone" value={filters.zone} onChange={(v) => patchFilter("zone", v)} />
            </FieldWrapper>
            <FieldWrapper label="Country">
              <LookupPairInput lookup="country" value={filters.country} onChange={(v) => patchFilter("country", v)} />
            </FieldWrapper>
            <FieldWrapper label="Destination">
              <LookupPairInput lookup="destination" value={filters.destination} onChange={(v) => patchFilter("destination", v)} />
            </FieldWrapper>
            <FieldWrapper label="Service">
              <Input value={filters.service} onChange={(e) => patchFilter("service", e.target.value)} />
            </FieldWrapper>

            <FieldWrapper label="Contract No" className="md:col-span-2 lg:col-span-1">
              <Input value={filters.contractNo} onChange={(e) => patchFilter("contractNo", e.target.value)} />
            </FieldWrapper>
          </div>

          {increaseRateOpen ? (
            <div className="mt-6 border-t pt-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                <FieldWrapper label="From Date">
                  <div className="relative">
                    <CalendarIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="date"
                      className="pl-8"
                      value={increaseForm.fromDate}
                      onChange={(e) => setIncreaseForm((f) => ({ ...f, fromDate: e.target.value }))}
                    />
                  </div>
                </FieldWrapper>
                <FieldWrapper label="Increase By">
                  <Select value={increaseForm.increaseBy || undefined} onValueChange={(v) => setIncreaseForm((f) => ({ ...f, increaseBy: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select Increase Type" /></SelectTrigger>
                    <SelectContent>
                      {INCREASE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldWrapper>
                <div className="flex flex-col justify-end gap-1.5">
                  <div className="flex h-9 items-center gap-2">
                    <Checkbox
                      id="rate-round-off"
                      checked={increaseForm.rateRoundOff}
                      onCheckedChange={(c) => setIncreaseForm((f) => ({ ...f, rateRoundOff: c === true }))}
                    />
                    <label htmlFor="rate-round-off" className="text-sm text-muted-foreground">Rate Round Off</label>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button onClick={handleIncreaseRateSave} className="bg-emerald-600 text-white hover:bg-emerald-600/90">Save</Button>
                <Button variant="destructive" onClick={() => setIncreaseRateOpen(false)}>Close</Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex justify-end gap-2">
              <Button onClick={handleSearch} className="bg-emerald-600 text-white hover:bg-emerald-600/90">Search</Button>
              <Button variant="destructive" onClick={handleReset}>Reset</Button>
            </div>
          )}
        </div>

        {hasSearched ? (
          <>
            <div className="overflow-x-auto border-t">
          <Table>
            <TableHeader>
              <TableRow className="bg-sidebar hover:bg-sidebar">
                <TableHead className="text-sidebar-foreground">From Date</TableHead>
                <TableHead className="text-sidebar-foreground">Vendor</TableHead>
                <TableHead className="text-sidebar-foreground">Product</TableHead>
                <TableHead className="text-sidebar-foreground">Service</TableHead>
                <TableHead className="text-sidebar-foreground">Origin</TableHead>
                <TableHead className="text-sidebar-foreground">Destination</TableHead>
                <TableHead className="text-sidebar-foreground">Zone</TableHead>
                <TableHead className="text-sidebar-foreground">Rate Type</TableHead>
                <TableHead className="text-sidebar-foreground text-right">Weight</TableHead>
                <TableHead className="text-sidebar-foreground text-right">Rate</TableHead>
                <TableHead className="w-28 text-center text-sidebar-foreground">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {authed && liveQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={11} className="h-32 text-center text-sm text-muted-foreground">
                    Loading vendor contracts…
                  </TableCell>
                </TableRow>
              ) : pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="h-32 text-center text-sm text-muted-foreground">
                    No data available in table
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.fromDate}</TableCell>
                    <TableCell>{r.vendorCode} — {r.vendorName}</TableCell>
                    <TableCell>{r.productName || r.productCode}</TableCell>
                    <TableCell>{r.service}</TableCell>
                    <TableCell>{r.originName || r.originCode}</TableCell>
                    <TableCell>{r.destinationName || r.destinationCode}</TableCell>
                    <TableCell>{r.zoneName || r.zoneCode}</TableCell>
                    <TableCell>{r.rateType}</TableCell>
                    <TableCell className="text-right">{r.weight}</TableCell>
                    <TableCell className="text-right">{r.rate}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center gap-1">
                        {canModify ? (
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(r)} aria-label="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        ) : null}
                        {canDelete ? (
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(r)} aria-label="Delete">
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

            <TablePager totalPages={totalPages} currentPage={currentPage} setPage={setPage} startIdx={startIdx} endIdx={endIdx} total={filtered.length} />
          </>
        ) : null}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Vendor Contract" : "Vendor Contract"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <FieldWrapper label="From Date" required>
              <div className="relative">
                <CalendarIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input type="date" className="pl-8" value={form.fromDate} onChange={(e) => setForm((f) => ({ ...f, fromDate: e.target.value }))} />
              </div>
            </FieldWrapper>
            <FieldWrapper label="Origin">
              <LookupPairInput
                lookup="destination"
                value={{ id: form.originId, code: form.originCode, name: form.originName }}
                onChange={(v) => setForm((f) => ({ ...f, originId: v.id ?? "", originCode: v.code, originName: v.name }))}
              />
            </FieldWrapper>
            <FieldWrapper label="Vendor">
              <LookupPairInput
                lookup="vendor"
                value={{ id: form.vendorId, code: form.vendorCode, name: form.vendorName }}
                onChange={(v) => setForm((f) => ({ ...f, vendorId: v.id ?? "", vendorCode: v.code, vendorName: v.name }))}
              />
            </FieldWrapper>
            <FieldWrapper label="Product">
              <LookupPairInput
                lookup="product"
                value={{ id: form.productId, code: form.productCode, name: form.productName }}
                onChange={(v) => setForm((f) => ({ ...f, productId: v.id ?? "", productCode: v.code, productName: v.name }))}
              />
            </FieldWrapper>

            <FieldWrapper label="Zone">
              <LookupPairInput
                lookup="zone"
                value={{ id: form.zoneId, code: form.zoneCode, name: form.zoneName }}
                onChange={(v) => setForm((f) => ({ ...f, zoneId: v.id ?? "", zoneCode: v.code, zoneName: v.name }))}
              />
            </FieldWrapper>
            <FieldWrapper label="Country">
              <LookupPairInput
                lookup="country"
                value={{ id: form.countryId, code: form.countryCode, name: form.countryName }}
                onChange={(v) => setForm((f) => ({ ...f, countryId: v.id ?? "", countryCode: v.code, countryName: v.name }))}
              />
            </FieldWrapper>
            <FieldWrapper label="Destination">
              <LookupPairInput
                lookup="destination"
                value={{ id: form.destinationId, code: form.destinationCode, name: form.destinationName }}
                onChange={(v) => setForm((f) => ({ ...f, destinationId: v.id ?? "", destinationCode: v.code, destinationName: v.name }))}
              />
            </FieldWrapper>
            <FieldWrapper label="Service">
              <Input value={form.service} onChange={(e) => setForm((f) => ({ ...f, service: e.target.value }))} />
            </FieldWrapper>

            <FieldWrapper label="Unit">
              <Select value={form.unit || undefined} onValueChange={(v) => setForm((f) => ({ ...f, unit: v }))}>
                <SelectTrigger><SelectValue placeholder="Select Unit Type" /></SelectTrigger>
                <SelectContent>
                  {UNIT_TYPES.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldWrapper>
            <FieldWrapper label="Days">
              <Input value={form.days} onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))} />
            </FieldWrapper>
            <FieldWrapper label="Contract No" className="lg:col-span-2">
              <Input value={form.contractNo} onChange={(e) => setForm((f) => ({ ...f, contractNo: e.target.value }))} />
            </FieldWrapper>

            <FieldWrapper label="Rate Type" required>
              <Select value={form.rateType || undefined} onValueChange={(v) => setForm((f) => ({ ...f, rateType: v }))}>
                <SelectTrigger><SelectValue placeholder="Select Rate Type" /></SelectTrigger>
                <SelectContent>
                  {RATE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldWrapper>
            <FieldWrapper label="Weight" required>
              <Input value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))} />
            </FieldWrapper>
            <div className="flex flex-col justify-end gap-1.5 lg:col-span-2">
              <FieldWrapper label="Rate" required>
                <div className="flex gap-2">
                  <Input value={form.rate} onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))} />
                  <Button type="button" size="sm" className="shrink-0 gap-1 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90" onClick={handleAddRateLine}>
                    <Plus className="h-4 w-4" /> Add
                  </Button>
                </div>
              </FieldWrapper>
            </div>
          </div>

          {draftRates.length > 0 ? (
            <div className="mt-4 overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead>Rate Type</TableHead>
                    <TableHead className="text-right">Weight</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {draftRates.map((line, idx) => (
                    <TableRow key={`${line.rateType}-${idx}`}>
                      <TableCell>{line.rateType}</TableCell>
                      <TableCell className="text-right">{line.weight}</TableCell>
                      <TableCell className="text-right">{line.rate}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 text-white hover:bg-emerald-600/90">Save</Button>
            <Button variant="destructive" onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete vendor contract?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the contract for{" "}
              <span className="font-medium text-foreground">{deleteTarget?.vendorName || deleteTarget?.vendorCode}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LookupPairInput({
  value,
  onChange,
  lookup,
}: {
  value: LookupPair;
  onChange: (v: LookupPair) => void;
  lookup: LookupKey;
}) {
  const [lookupOpen, setLookupOpen] = useState(false);

  return (
    <div className="flex gap-1">
      <Input value={value.code} onChange={(e) => onChange({ ...value, code: e.target.value })} className="w-28" placeholder="Code" />
      <Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} className="flex-1" placeholder="Name" />
      <Button
        size="icon"
        variant="outline"
        className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
        aria-label="Search"
        onClick={() => setLookupOpen(true)}
      >
        <Search className="h-4 w-4" />
      </Button>
      <MasterLookupDialog
        open={lookupOpen}
        onOpenChange={setLookupOpen}
        lookup={lookup}
        returnField="code"
        onSelect={(_v, option: LookupOption) => onChange({ id: option.code, code: option.code, name: option.name })}
      />
    </div>
  );
}
