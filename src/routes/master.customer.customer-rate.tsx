import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Calendar as CalendarIcon,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  StatusPill,
  TablePager,
} from "@/components/master-table-kit";
import { DataIoToolbar } from "@/components/data-io-toolbar";
import { LookupCombobox } from "@/components/masters/lookup-combobox";
import {
  SearchableLookupPair,
  type LookupPairValue,
} from "@/components/masters/searchable-lookup-pair";
import { cn } from "@/lib/utils";
import type { LookupKey } from "@/lib/master-lookups";

import { useAuth } from "@/lib/auth";
import { useMasterResource } from "@/lib/masters/core/useMasterResource";
import { masterKeys } from "@/lib/masters/core/queryKeys";
import { mapCsvToImportRows, type ImportRow } from "@/lib/masters/core";
import type { CsvRecord } from "@/lib/masters/core/csv";
import {
  copyCustomerRates,
  customerRatesResource,
  fetchCustomerRateList,
  type CustomerRateFilter,
  type CustomerRateRow,
} from "@/lib/masters/resources/customerRates";
import { customerRateCreateSchema } from "@/lib/masters/schemas/customerRates";
import { toErrorMessage } from "@/lib/masters/screen";
import { supabase } from "@/integrations/supabase/client";

type Status = "Active" | "In-Active";
type Mode = "client" | "copy";

type LookupPair = LookupPairValue;

const emptyPair = (): LookupPair => ({ code: "", name: "" });

const CR_INPUT =
  "h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus-visible:ring-0";
const CR_SELECT =
  "h-8 rounded-none border-0 bg-transparent px-1.5 text-[13px] shadow-none focus:ring-0";
const CR_GRID =
  "grid grid-cols-1 gap-x-3 gap-y-2.5 md:grid-cols-2 xl:grid-cols-4 [&_label]:whitespace-nowrap [&_label]:text-[11px]";
const CR_STACK = "grid grid-cols-1 gap-2.5 [&_label]:whitespace-nowrap [&_label]:text-[11px]";

function CustomerRateLookupField({
  label,
  lookup,
  value,
  onChange,
  required,
}: {
  label: string;
  lookup: LookupKey;
  value: LookupPair;
  onChange: (v: LookupPair) => void;
  required?: boolean;
}) {
  return (
    <FieldWrapper borderLabel lookupSplit label={label} required={required}>
      <SearchableLookupPair
        lookup={lookup}
        value={value}
        onChange={onChange}
        compact
        splitCode
      />
    </FieldWrapper>
  );
}

type ClientFilters = {
  customer: LookupPair;
  product: LookupPair;
  service: string;
  fromDate: string;
  zone: LookupPair;
  contractNo: string;
  origin: LookupPair;
  country: LookupPair;
  vendor: LookupPair;
  destination: LookupPair;
};

type CopySideFilters = {
  customer: LookupPair;
  fromDate: string;
  origin: LookupPair;
  vendor: LookupPair;
  product: LookupPair;
  zone: LookupPair;
  country: LookupPair;
  destination: LookupPair;
  service: string;
};

type RateRow = {
  id: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  productId: string;
  productCode: string;
  productName: string;
  service: string;
  originId: string;
  originCode: string;
  originName: string;
  destinationId: string;
  destinationCode: string;
  destinationName: string;
  zoneId: string;
  zoneCode: string;
  zoneName: string;
  countryId: string;
  countryCode: string;
  countryName: string;
  vendorId: string;
  vendorCode: string;
  vendorName: string;
  contractNo: string;
  fromDate: string;
  toDate: string;
  unit: string;
  days: string;
  rateType: string;
  minWeight: string;
  ratePerKg: string;
  fuelPct: string;
  otherCharges: string;
  status: Status;
  row_version?: number;
};

type RateForm = {
  customerId: string;
  customerCode: string;
  customerName: string;
  productId: string;
  productCode: string;
  productName: string;
  service: string;
  originId: string;
  originCode: string;
  originName: string;
  destinationId: string;
  destinationCode: string;
  destinationName: string;
  zoneId: string;
  zoneCode: string;
  zoneName: string;
  countryId: string;
  countryCode: string;
  countryName: string;
  vendorId: string;
  vendorCode: string;
  vendorName: string;
  fromDate: string;
  unit: string;
  days: string;
  rateType: string;
  weight: string;
  rate: string;
};

type RateLine = { rateType: string; weight: string; rate: string };

type IncreaseRateForm = {
  fromDate: string;
  increaseBy: string;
  rateRoundOff: boolean;
};

const INCREASE_TYPES = ["Amount", "Percentage"] as const;
const UNIT_TYPES = ["KG", "LB", "CBM", "Piece"] as const;
const RATE_TYPES = ["Flat", "Per KG", "Per Slab", "Minimum"] as const;

const RATE_TYPE_TO_DB: Record<string, "FLAT" | "PER_KG" | "PER_SLAB" | "MINIMUM"> = {
  Flat: "FLAT",
  "Per KG": "PER_KG",
  "Per Slab": "PER_SLAB",
  Minimum: "MINIMUM",
};

const RATE_TYPE_FROM_DB: Record<string, string> = {
  FLAT: "Flat",
  PER_KG: "Per KG",
  PER_SLAB: "Per Slab",
  MINIMUM: "Minimum",
};

const UNIT_TO_DB: Record<string, "KG" | "LB" | "CBM" | "PIECE"> = {
  KG: "KG",
  LB: "LB",
  CBM: "CBM",
  Piece: "PIECE",
  PIECE: "PIECE",
};

const UNIT_FROM_DB: Record<string, string> = {
  KG: "KG",
  LB: "LB",
  CBM: "CBM",
  PIECE: "Piece",
};

const emptyClientFilters = (): ClientFilters => ({
  customer: emptyPair(),
  product: emptyPair(),
  service: "",
  fromDate: "",
  zone: emptyPair(),
  contractNo: "",
  origin: emptyPair(),
  country: emptyPair(),
  vendor: emptyPair(),
  destination: emptyPair(),
});

const emptyCopySide = (): CopySideFilters => ({
  customer: emptyPair(),
  fromDate: "",
  origin: emptyPair(),
  vendor: emptyPair(),
  product: emptyPair(),
  zone: emptyPair(),
  country: emptyPair(),
  destination: emptyPair(),
  service: "",
});

const emptyIncreaseForm = (): IncreaseRateForm => ({
  fromDate: format(new Date(), "yyyy-MM-dd"),
  increaseBy: "",
  rateRoundOff: false,
});

const emptyForm = (): RateForm => ({
  customerId: "",
  customerCode: "",
  customerName: "",
  productId: "",
  productCode: "",
  productName: "",
  service: "",
  originId: "",
  originCode: "",
  originName: "",
  destinationId: "",
  destinationCode: "",
  destinationName: "",
  zoneId: "",
  zoneCode: "",
  zoneName: "",
  countryId: "",
  countryCode: "",
  countryName: "",
  vendorId: "",
  vendorCode: "",
  vendorName: "",
  fromDate: format(new Date(), "yyyy-MM-dd"),
  unit: "",
  days: "",
  rateType: "",
  weight: "",
  rate: "",
});

function filtersToApi(f: ClientFilters): CustomerRateFilter {
  return {
    customer_id: f.customer.id || null,
    product_id: f.product.id || null,
    service: f.service.trim() || null,
    from_date: f.fromDate || null,
    zone_id: f.zone.id || null,
    contract_no: f.contractNo.trim() || null,
    origin_destination_id: f.origin.id || null,
    destination_id: f.destination.id || null,
    country_id: f.country.id || null,
    vendor_id: f.vendor.id || null,
  };
}

function copySideToApi(f: CopySideFilters): CustomerRateFilter {
  return {
    customer_id: f.customer.id || null,
    product_id: f.product.id || null,
    service: f.service.trim() || null,
    from_date: f.fromDate || null,
    zone_id: f.zone.id || null,
    origin_destination_id: f.origin.id || null,
    destination_id: f.destination.id || null,
    country_id: f.country.id || null,
    vendor_id: f.vendor.id || null,
  };
}

function dbToView(r: CustomerRateRow & Record<string, unknown>): RateRow {
  return {
    id: r.id,
    customerId: r.customer_id,
    customerCode: String(r.customer_code ?? ""),
    customerName: String(r.customer_name ?? ""),
    productId: r.product_id ?? "",
    productCode: String(r.product_code ?? ""),
    productName: String(r.product_name ?? ""),
    service: r.service ?? "",
    originId: r.origin_destination_id ?? "",
    originCode: String(r.origin_code ?? ""),
    originName: String(r.origin_name ?? ""),
    destinationId: r.destination_id ?? "",
    destinationCode: String(r.destination_code ?? ""),
    destinationName: String(r.destination_name ?? ""),
    zoneId: r.zone_id ?? "",
    zoneCode: String(r.zone_code ?? ""),
    zoneName: String(r.zone_name ?? ""),
    countryId: r.country_id ?? "",
    countryCode: String(r.country_code ?? ""),
    countryName: String(r.country_name ?? ""),
    vendorId: r.vendor_id ?? "",
    vendorCode: String(r.vendor_code ?? ""),
    vendorName: String(r.vendor_name ?? ""),
    contractNo: r.contract_no ?? "",
    fromDate: r.from_date,
    toDate: r.to_date ?? "",
    unit: r.unit ? UNIT_FROM_DB[r.unit] ?? r.unit : "",
    days: r.transit_days == null ? "" : String(r.transit_days),
    rateType: r.rate_type ? RATE_TYPE_FROM_DB[r.rate_type] ?? r.rate_type : "",
    minWeight: String(r.min_weight ?? 0),
    ratePerKg: String(r.rate_per_kg ?? 0),
    fuelPct: String(r.fuel_pct ?? 0),
    otherCharges: String(r.other_charges ?? 0),
    status: r.status === "INACTIVE" ? "In-Active" : "Active",
    row_version: r.row_version,
  };
}

function headerPayload(form: RateForm) {
  const daysRaw = form.days.trim();
  const daysNum = daysRaw === "" ? null : Number(daysRaw);
  return {
    customer_id: form.customerId,
    product_id: form.productId || null,
    service: form.service.trim() || null,
    origin_destination_id: form.originId || null,
    destination_id: form.destinationId || null,
    zone_id: form.zoneId || null,
    country_id: form.countryId || null,
    vendor_id: form.vendorId || null,
    contract_no: null as string | null,
    from_date: form.fromDate,
    to_date: null as string | null,
    unit: form.unit ? UNIT_TO_DB[form.unit] ?? null : null,
    transit_days: daysNum != null && !Number.isNaN(daysNum) ? daysNum : null,
    fuel_pct: 0,
    other_charges: 0,
    status: "ACTIVE" as const,
  };
}

function linePayload(form: RateForm, line: RateLine) {
  return {
    ...headerPayload(form),
    rate_type: RATE_TYPE_TO_DB[line.rateType] ?? null,
    min_weight: Number(line.weight) || 0,
    rate_per_kg: Number(line.rate) || 0,
  };
}

function matchesClientFilters(r: RateRow, f: ClientFilters): boolean {
  if (f.customer.code && !r.customerCode.toLowerCase().includes(f.customer.code.toLowerCase())) return false;
  if (f.customer.name && !r.customerName.toLowerCase().includes(f.customer.name.toLowerCase())) return false;
  if (f.product.code && !r.productCode.toLowerCase().includes(f.product.code.toLowerCase())) return false;
  if (f.product.name && !r.productName.toLowerCase().includes(f.product.name.toLowerCase())) return false;
  if (f.service && !r.service.toLowerCase().includes(f.service.toLowerCase())) return false;
  if (f.fromDate && r.fromDate !== f.fromDate) return false;
  if (f.zone.code && !r.zoneCode.toLowerCase().includes(f.zone.code.toLowerCase())) return false;
  if (f.zone.name && !r.zoneName.toLowerCase().includes(f.zone.name.toLowerCase())) return false;
  if (f.contractNo && !r.contractNo.toLowerCase().includes(f.contractNo.toLowerCase())) return false;
  if (f.origin.code && !r.originCode.toLowerCase().includes(f.origin.code.toLowerCase())) return false;
  if (f.origin.name && !r.originName.toLowerCase().includes(f.origin.name.toLowerCase())) return false;
  if (f.country.code && !r.countryCode.toLowerCase().includes(f.country.code.toLowerCase())) return false;
  if (f.country.name && !r.countryName.toLowerCase().includes(f.country.name.toLowerCase())) return false;
  if (f.vendor.code && !r.vendorCode.toLowerCase().includes(f.vendor.code.toLowerCase())) return false;
  if (f.vendor.name && !r.vendorName.toLowerCase().includes(f.vendor.name.toLowerCase())) return false;
  if (f.destination.code && !r.destinationCode.toLowerCase().includes(f.destination.code.toLowerCase())) return false;
  if (f.destination.name && !r.destinationName.toLowerCase().includes(f.destination.name.toLowerCase())) return false;
  return true;
}

export const Route = createFileRoute("/master/customer/customer-rate")({
  head: () => ({
    meta: [
      { title: "Customer Rate — Master — Courier ERP" },
      { name: "description", content: "Manage customer-specific rate contracts by product, service and zone." },
    ],
  }),
  component: CustomerRatePage,
});

function CustomerRatePage() {
  const { isAuthenticated: authed } = useAuth();
  const rc = useMasterResource(customerRatesResource);
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<Mode>("client");
  const [demoRows, setDemoRows] = useState<RateRow[]>([]);
  const [filters, setFilters] = useState<ClientFilters>(emptyClientFilters());
  const [appliedFilters, setAppliedFilters] = useState<ClientFilters>(emptyClientFilters());
  const [hasSearched, setHasSearched] = useState(false);
  const [page, setPage] = useState(1);

  const [copyFrom, setCopyFrom] = useState<CopySideFilters>(emptyCopySide());
  const [copyTo, setCopyTo] = useState<CopySideFilters>(emptyCopySide());
  const [pctIncrease, setPctIncrease] = useState("");
  const [roundRates, setRoundRates] = useState(false);
  const [copying, setCopying] = useState(false);
  const [roundValidationOpen, setRoundValidationOpen] = useState(false);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RateRow | null>(null);
  const [form, setForm] = useState<RateForm>(emptyForm());
  const [draftRates, setDraftRates] = useState<RateLine[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<RateRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [increaseRateOpen, setIncreaseRateOpen] = useState(false);
  const [increaseForm, setIncreaseForm] = useState<IncreaseRateForm>(emptyIncreaseForm());
  const [increasing, setIncreasing] = useState(false);

  const isValidPercentageIncrease = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return false;
    const n = Number(trimmed);
    return !Number.isNaN(n) && n >= 0 && n <= 100;
  };

  const handleRoundChange = (checked: boolean) => {
    if (checked && !isValidPercentageIncrease(pctIncrease)) {
      setRoundRates(false);
      setRoundValidationOpen(true);
      return;
    }
    setRoundRates(checked);
  };

  const liveQuery = useQuery({
    queryKey: masterKeys.list(customerRatesResource.key, {
      live: true,
      searched: hasSearched,
      filters: appliedFilters,
    }),
    enabled: authed && hasSearched && mode === "client",
    queryFn: async () => {
      const rows = await fetchCustomerRateList(filtersToApi(appliedFilters));
      return rows.map(dbToView);
    },
  });

  const rows: RateRow[] = authed ? (liveQuery.data ?? []) : demoRows;

  const canAdd = !authed || rc.perms.canAdd;
  const canModify = !authed || rc.perms.canModify;
  const canDelete = !authed || rc.perms.canDelete;

  const filtered = useMemo(() => {
    if (authed || !hasSearched) return rows;
    return rows.filter((r) => matchesClientFilters(r, appliedFilters));
  }, [rows, appliedFilters, hasSearched, authed]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const startIdx = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const patchFilter = <K extends keyof ClientFilters>(key: K, value: ClientFilters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
  };

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setDraftRates([]);
    setOpen(true);
  };

  const openIncreaseRate = () => {
    setIncreaseForm(emptyIncreaseForm());
    setIncreaseRateOpen(true);
  };

  const closeIncreaseRate = () => {
    setIncreaseRateOpen(false);
    setIncreaseForm(emptyIncreaseForm());
  };

  const handleAddRateLine = () => {
    if (!form.rateType) return toast.error("Rate Type is required");
    if (!form.weight.trim()) return toast.error("Weight is required");
    if (!form.rate.trim()) return toast.error("Rate is required");
    const rate = parseFloat(form.rate);
    if (Number.isNaN(rate) || rate < 0) return toast.error("Rate must be a positive number");
    setDraftRates((prev) => [
      ...prev,
      { rateType: form.rateType, weight: form.weight, rate: form.rate },
    ]);
    setForm((f) => ({ ...f, rateType: "", weight: "", rate: "" }));
    toast.success("Rate line added");
  };

  const applyIncreaseToRate = (current: number) => {
    let next = current;
    if (increaseForm.increaseBy === "Amount") next = current + 1;
    if (increaseForm.increaseBy === "Percentage") next = current * 1.01;
    if (increaseForm.rateRoundOff) next = Math.round(next * 100) / 100;
    return next;
  };

  const handleIncreaseRateSave = async () => {
    if (!filters.customer.id && !filters.customer.code.trim() && !filters.customer.name.trim()) {
      return toast.error("Customer is required");
    }
    if (!increaseForm.fromDate) return toast.error("From Date is required");
    if (!increaseForm.increaseBy) return toast.error("Select Increase Type");

    if (authed) {
      setIncreasing(true);
      try {
        const matched = await fetchCustomerRateList(filtersToApi(filters));
        const views = matched.map(dbToView);
        if (views.length === 0) return toast.error("No matching customer rates to update");

        let updated = 0;
        for (const row of views) {
          const current = parseFloat(row.ratePerKg);
          if (Number.isNaN(current)) continue;
          const next = applyIncreaseToRate(current);
          await rc.update.mutateAsync({
            id: row.id,
            rowVersion: row.row_version ?? 0,
            patch: {
              rate_per_kg: next,
              from_date: increaseForm.fromDate,
            },
          });
          updated += 1;
        }

        await queryClient.invalidateQueries({ queryKey: masterKeys.all(customerRatesResource.key) });
        setAppliedFilters({ ...filters });
        setHasSearched(true);
        setPage(1);
        toast.success(`Increased ${updated} rate${updated === 1 ? "" : "s"}`);
        closeIncreaseRate();
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not increase rates"));
      } finally {
        setIncreasing(false);
      }
      return;
    }

    const matched = demoRows.filter((r) => matchesClientFilters(r, filters));
    if (matched.length === 0) return toast.error("No matching customer rates to update");
    const ids = new Set(matched.map((r) => r.id));
    setDemoRows((prev) =>
      prev.map((r) => {
        if (!ids.has(r.id)) return r;
        const current = parseFloat(r.ratePerKg);
        if (Number.isNaN(current)) return r;
        return {
          ...r,
          fromDate: increaseForm.fromDate,
          ratePerKg: String(applyIncreaseToRate(current)),
        };
      }),
    );
    setAppliedFilters({ ...filters });
    setHasSearched(true);
    setPage(1);
    toast.success(`Increased ${matched.length} rate${matched.length === 1 ? "" : "s"}`);
    closeIncreaseRate();
  };

  const openEdit = (row: RateRow) => {
    setEditing(row);
    setForm({
      customerId: row.customerId,
      customerCode: row.customerCode,
      customerName: row.customerName,
      productId: row.productId,
      productCode: row.productCode,
      productName: row.productName,
      service: row.service,
      originId: row.originId,
      originCode: row.originCode,
      originName: row.originName,
      destinationId: row.destinationId,
      destinationCode: row.destinationCode,
      destinationName: row.destinationName,
      zoneId: row.zoneId,
      zoneCode: row.zoneCode,
      zoneName: row.zoneName,
      countryId: row.countryId,
      countryCode: row.countryCode,
      countryName: row.countryName,
      vendorId: row.vendorId,
      vendorCode: row.vendorCode,
      vendorName: row.vendorName,
      fromDate: row.fromDate,
      unit: row.unit,
      days: row.days,
      rateType: "",
      weight: "",
      rate: "",
    });
    setDraftRates(
      row.rateType || row.minWeight || row.ratePerKg
        ? [{ rateType: row.rateType || "Flat", weight: row.minWeight, rate: row.ratePerKg }]
        : [],
    );
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.customerId && !form.customerCode.trim() && !form.customerName.trim()) {
      return toast.error("Customer is required");
    }
    if (!form.fromDate) return toast.error("From Date is required");

    const lines: RateLine[] =
      draftRates.length > 0
        ? draftRates
        : form.rateType && form.weight.trim() && form.rate.trim()
          ? [{ rateType: form.rateType, weight: form.weight, rate: form.rate }]
          : [];
    if (lines.length === 0) return toast.error("Add at least one rate line");

    if (authed) {
      if (!form.customerId) return toast.error("Select customer from lookup when signed in");
      setSaving(true);
      try {
        if (editing) {
          const payload = customerRateCreateSchema.parse(linePayload(form, lines[0]));
          await rc.update.mutateAsync({
            id: editing.id,
            rowVersion: editing.row_version ?? 0,
            patch: payload,
          });
          for (const line of lines.slice(1)) {
            const extra = customerRateCreateSchema.parse(linePayload(form, line));
            await rc.create.mutateAsync(extra);
          }
          toast.success("Rate updated");
        } else {
          for (const line of lines) {
            const payload = customerRateCreateSchema.parse(linePayload(form, line));
            await rc.create.mutateAsync(payload);
          }
          toast.success(`Added ${lines.length} rate${lines.length === 1 ? "" : "s"}`);
        }
        await queryClient.invalidateQueries({ queryKey: masterKeys.all(customerRatesResource.key) });
        setOpen(false);
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not save customer rate"));
      } finally {
        setSaving(false);
      }
      return;
    }

    if (editing) {
      const line = lines[0];
      setDemoRows((prev) =>
        prev.map((r) =>
          r.id === editing.id
            ? {
                ...editing,
                ...form,
                unit: form.unit,
                days: form.days,
                rateType: line.rateType,
                minWeight: line.weight,
                ratePerKg: line.rate,
                toDate: editing.toDate,
                contractNo: editing.contractNo,
                fuelPct: editing.fuelPct,
                otherCharges: editing.otherCharges,
                status: editing.status,
              }
            : r,
        ),
      );
      toast.success("Rate updated");
    } else {
      const newRows: RateRow[] = lines.map((line) => ({
        id: crypto.randomUUID(),
        customerId: form.customerId,
        customerCode: form.customerCode,
        customerName: form.customerName,
        productId: form.productId,
        productCode: form.productCode,
        productName: form.productName,
        service: form.service,
        originId: form.originId,
        originCode: form.originCode,
        originName: form.originName,
        destinationId: form.destinationId,
        destinationCode: form.destinationCode,
        destinationName: form.destinationName,
        zoneId: form.zoneId,
        zoneCode: form.zoneCode,
        zoneName: form.zoneName,
        countryId: form.countryId,
        countryCode: form.countryCode,
        countryName: form.countryName,
        vendorId: form.vendorId,
        vendorCode: form.vendorCode,
        vendorName: form.vendorName,
        contractNo: "",
        fromDate: form.fromDate,
        toDate: "",
        unit: form.unit,
        days: form.days,
        rateType: line.rateType,
        minWeight: line.weight,
        ratePerKg: line.rate,
        fuelPct: "0",
        otherCharges: "0",
        status: "Active",
      }));
      setDemoRows((prev) => [...newRows, ...prev]);
      toast.success(`Added ${newRows.length} rate${newRows.length === 1 ? "" : "s"}`);
    }
    setOpen(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (authed) {
      try {
        await rc.remove.mutateAsync({ id: deleteTarget.id, rowVersion: deleteTarget.row_version ?? 0 });
        await queryClient.invalidateQueries({ queryKey: masterKeys.all(customerRatesResource.key) });
        toast.success("Rate entry deleted");
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not delete customer rate"));
      }
    } else {
      setDemoRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      toast.success("Rate entry deleted");
    }
    setDeleteTarget(null);
  };

  const handleClientSearch = () => {
    if (!filters.customer.id && !filters.customer.code.trim() && !filters.customer.name.trim()) {
      return toast.error("Customer is required");
    }
    setAppliedFilters({ ...filters });
    setHasSearched(true);
    setPage(1);
    toast.success("Search applied");
  };

  const handleClientReset = () => {
    setFilters(emptyClientFilters());
    setAppliedFilters(emptyClientFilters());
    setHasSearched(false);
    setPage(1);
    toast.success("Filters reset");
  };

  const handleCopySearch = async () => {
    if (!copyFrom.customer.id && !copyFrom.customer.code.trim() && !authed) {
      return toast.error("Copy From Customer is required");
    }
    if (!copyTo.customer.id && !copyTo.customer.code.trim()) {
      return toast.error("Copy To Customer is required");
    }

    const pct = Number(pctIncrease || 0);
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      return toast.error("Percentage Increase must be between 0.00 and 100.00");
    }

    if (authed) {
      if (!copyTo.customer.id) return toast.error("Select Copy To customer from lookup");
      setCopying(true);
      try {
        const res = await copyCustomerRates({
          percentageIncrease: pct,
          roundRates,
          copyFrom: copySideToApi(copyFrom),
          copyTo: {
            ...copySideToApi(copyTo),
            customer_id: copyTo.customer.id,
            from_date: copyTo.fromDate || null,
          },
        });
        toast.success(res.copied > 0 ? `Copied ${res.copied} rate${res.copied === 1 ? "" : "s"}` : "No matching rates to copy");
        await queryClient.invalidateQueries({ queryKey: masterKeys.all(customerRatesResource.key) });
      } catch (err) {
        toast.error(toErrorMessage(err, "Could not copy client rates"));
      } finally {
        setCopying(false);
      }
      return;
    }

    const fromRows = demoRows.filter((r) => {
      if (copyFrom.customer.code && !r.customerCode.toLowerCase().includes(copyFrom.customer.code.toLowerCase())) return false;
      if (copyFrom.customer.name && !r.customerName.toLowerCase().includes(copyFrom.customer.name.toLowerCase())) return false;
      if (copyFrom.fromDate && r.fromDate !== copyFrom.fromDate) return false;
      if (copyFrom.service && !r.service.toLowerCase().includes(copyFrom.service.toLowerCase())) return false;
      return true;
    });
    if (fromRows.length === 0) return toast.error("No matching rates to copy");

    const copied = fromRows.map((r) => {
      let nextRate = parseFloat(r.ratePerKg) * (1 + pct / 100);
      if (roundRates) nextRate = Math.round(nextRate);
      else nextRate = Math.round(nextRate * 10000) / 10000;
      return {
        ...r,
        id: crypto.randomUUID(),
        customerId: copyTo.customer.id ?? "",
        customerCode: copyTo.customer.code || r.customerCode,
        customerName: copyTo.customer.name || r.customerName,
        fromDate: copyTo.fromDate || format(new Date(), "yyyy-MM-dd"),
        productId: copyTo.product.id || r.productId,
        productCode: copyTo.product.code || r.productCode,
        productName: copyTo.product.name || r.productName,
        service: copyTo.service.trim() || r.service,
        originId: copyTo.origin.id || r.originId,
        originCode: copyTo.origin.code || r.originCode,
        originName: copyTo.origin.name || r.originName,
        vendorId: copyTo.vendor.id || r.vendorId,
        vendorCode: copyTo.vendor.code || r.vendorCode,
        vendorName: copyTo.vendor.name || r.vendorName,
        zoneId: copyTo.zone.id || r.zoneId,
        zoneCode: copyTo.zone.code || r.zoneCode,
        zoneName: copyTo.zone.name || r.zoneName,
        countryId: copyTo.country.id || r.countryId,
        countryCode: copyTo.country.code || r.countryCode,
        countryName: copyTo.country.name || r.countryName,
        destinationId: copyTo.destination.id || r.destinationId,
        destinationCode: copyTo.destination.code || r.destinationCode,
        destinationName: copyTo.destination.name || r.destinationName,
        ratePerKg: String(nextRate),
      };
    });
    setDemoRows((prev) => [...copied, ...prev]);
    toast.success(`Copied ${copied.length} rate${copied.length === 1 ? "" : "s"}`);
  };

  const handleCopyReset = () => {
    setCopyFrom(emptyCopySide());
    setCopyTo(emptyCopySide());
    setPctIncrease("");
    setRoundRates(false);
    toast.success("Copy filters reset");
  };

  const resolveCodeId = async (table: string, code: string | null | undefined) => {
    const c = String(code ?? "").trim();
    if (!c) return null;
    const { data, error } = await supabase
      .from(table)
      .select("id")
      .eq("code", c)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as { id: string } | null)?.id ?? null;
  };

  const handleImportRows = async (parsedRows: CsvRecord[]) => {
    try {
      const mapped = mapCsvToImportRows(
        parsedRows,
        customerRatesResource.importColumns,
      ) as ImportRow[];
      if (mapped.length === 0) {
        toast.error("No import rows found");
        return;
      }

      if (!authed) {
        toast.info("Sign in to import customer rates");
        return;
      }

      let ok = 0;
      let failed = 0;
      for (const row of mapped) {
        try {
          const customerId = await resolveCodeId("customers", String(row.customer_code ?? ""));
          if (!customerId) throw new Error(`Customer not found: ${row.customer_code ?? ""}`);
          const productId = await resolveCodeId("products", String(row.product_code ?? ""));
          const originId = await resolveCodeId("destinations", String(row.origin_code ?? ""));
          const destinationId = await resolveCodeId("destinations", String(row.destination_code ?? ""));
          const zoneId = await resolveCodeId("zones", String(row.zone_code ?? ""));
          const countryId = await resolveCodeId("countries", String(row.country_code ?? ""));
          const vendorId = await resolveCodeId("vendors", String(row.vendor_code ?? ""));
          const statusRaw = String(row.status ?? "ACTIVE").toUpperCase();
          const payload = customerRateCreateSchema.parse({
            customer_id: customerId,
            product_id: productId,
            service: row.service ? String(row.service) : null,
            origin_destination_id: originId,
            destination_id: destinationId,
            zone_id: zoneId,
            country_id: countryId,
            vendor_id: vendorId,
            contract_no: row.contract_no ? String(row.contract_no) : null,
            from_date: String(row.from_date ?? ""),
            to_date: row.to_date ? String(row.to_date) : null,
            min_weight: row.min_weight == null || row.min_weight === "" ? 0 : Number(row.min_weight),
            rate_per_kg: row.rate_per_kg == null || row.rate_per_kg === "" ? 0 : Number(row.rate_per_kg),
            fuel_pct: row.fuel_pct == null || row.fuel_pct === "" ? 0 : Number(row.fuel_pct),
            other_charges:
              row.other_charges == null || row.other_charges === "" ? 0 : Number(row.other_charges),
            status: statusRaw === "INACTIVE" || statusRaw === "IN-ACTIVE" ? "INACTIVE" : "ACTIVE",
          });
          await rc.create.mutateAsync(payload);
          ok += 1;
        } catch {
          failed += 1;
        }
      }

      await queryClient.invalidateQueries({ queryKey: masterKeys.all(customerRatesResource.key) });
      if (ok > 0 && failed === 0) toast.success(`Imported ${ok} rate${ok === 1 ? "" : "s"}`);
      else if (ok > 0) toast.success(`Imported ${ok}, failed ${failed}`);
      else toast.error(`Import failed for ${failed} row${failed === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(toErrorMessage(err, "Import failed"));
    }
  };

  return (
    <div className="flex w-full flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <MasterBreadcrumb trail={["Master", "Customer", "Customer Rate"]} />

      <Card className="overflow-hidden border p-0">
        <div className="p-4 md:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <TooltipProvider delayDuration={200}>
              <div className="flex items-center gap-1.5">
                {mode === "client" ? (
                  <>
                    <DataIoToolbar
                      import={canAdd ? { onRows: handleImportRows } : null}
                    />
                    {canModify ? (
                      <IconButton label="IncreaseRate" onClick={openIncreaseRate}>
                        <Plus className="h-4 w-4" />
                      </IconButton>
                    ) : null}
                  </>
                ) : null}
              </div>
            </TooltipProvider>
            {canAdd ? (
              <Button size="sm" onClick={openAdd} className="h-9 gap-1.5">
                <Plus className="h-4 w-4" />
                Add
              </Button>
            ) : null}
          </div>

          <div className="mb-5 flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => {
                setMode("client");
              }}
              className={cn(
                "min-w-[140px]",
                mode === "client"
                  ? "bg-emerald-600 text-white hover:bg-emerald-600/90"
                  : "bg-background text-foreground border hover:bg-muted",
              )}
              variant={mode === "client" ? "default" : "outline"}
            >
              Client Rate
            </Button>
            <Button
              type="button"
              onClick={() => {
                setMode("copy");
                closeIncreaseRate();
              }}
              className={cn(
                "min-w-[160px]",
                mode === "copy"
                  ? "bg-emerald-600 text-white hover:bg-emerald-600/90"
                  : "bg-background text-foreground border hover:bg-muted",
              )}
              variant={mode === "copy" ? "default" : "outline"}
            >
              Copy Client Rate
            </Button>
          </div>

          {mode === "client" ? (
            <>
              <div className={CR_GRID}>
                <CustomerRateLookupField
                  label="Customer"
                  lookup="customer"
                  value={filters.customer}
                  onChange={(v) => patchFilter("customer", v)}
                  required
                />
                <FieldWrapper borderLabel label="From Date">
                  <Select
                    value={filters.fromDate || undefined}
                    onValueChange={(v) => patchFilter("fromDate", v)}
                  >
                    <SelectTrigger className={CR_SELECT}>
                      <SelectValue placeholder="Select From Date" />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 1, 2, 3, 4, 5, 6].map((offset) => {
                        const d = new Date();
                        d.setMonth(d.getMonth() - offset);
                        const val = format(d, "yyyy-MM-dd");
                        return (
                          <SelectItem key={val} value={val}>
                            {format(d, "dd/MM/yyyy")}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </FieldWrapper>
                <CustomerRateLookupField
                  label="Origin"
                  lookup="destination"
                  value={filters.origin}
                  onChange={(v) => patchFilter("origin", v)}
                />
                <CustomerRateLookupField
                  label="Vendor"
                  lookup="vendor"
                  value={filters.vendor}
                  onChange={(v) => patchFilter("vendor", v)}
                />
                <CustomerRateLookupField
                  label="Product"
                  lookup="product"
                  value={filters.product}
                  onChange={(v) => patchFilter("product", v)}
                />
                <CustomerRateLookupField
                  label="Zone"
                  lookup="zone"
                  value={filters.zone}
                  onChange={(v) => patchFilter("zone", v)}
                />
                <CustomerRateLookupField
                  label="Country"
                  lookup="country"
                  value={filters.country}
                  onChange={(v) => patchFilter("country", v)}
                />
                <CustomerRateLookupField
                  label="Destination"
                  lookup="destination"
                  value={filters.destination}
                  onChange={(v) => patchFilter("destination", v)}
                />
                <FieldWrapper borderLabel label="Service">
                  <Input
                    className={CR_INPUT}
                    value={filters.service}
                    onChange={(e) => patchFilter("service", e.target.value)}
                  />
                </FieldWrapper>
                {!increaseRateOpen ? (
                  <FieldWrapper borderLabel label="Contract No">
                    <Input
                      className={CR_INPUT}
                      value={filters.contractNo}
                      onChange={(e) => patchFilter("contractNo", e.target.value)}
                    />
                  </FieldWrapper>
                ) : null}
              </div>

              {increaseRateOpen ? (
                <div className="mt-6 border-t pt-6">
                  <div className={CR_GRID}>
                    <FieldWrapper borderLabel label="From Date" required>
                      <div className="relative flex w-full min-w-0 items-stretch">
                        <CalendarIcon className="pointer-events-none absolute left-2 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          type="date"
                          className={`${CR_INPUT} pl-8`}
                          value={increaseForm.fromDate}
                          onChange={(e) =>
                            setIncreaseForm((f) => ({ ...f, fromDate: e.target.value }))
                          }
                        />
                      </div>
                    </FieldWrapper>
                    <FieldWrapper borderLabel label="Increase By" required>
                      <Select
                        value={increaseForm.increaseBy || undefined}
                        onValueChange={(v) => setIncreaseForm((f) => ({ ...f, increaseBy: v }))}
                      >
                        <SelectTrigger className={CR_SELECT}>
                          <SelectValue placeholder="Select Increase Type" />
                        </SelectTrigger>
                        <SelectContent>
                          {INCREASE_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FieldWrapper>
                    <div className="flex flex-col justify-end gap-1.5">
                      <div className="flex h-9 items-center gap-2">
                        <Checkbox
                          id="rate-round-off"
                          checked={increaseForm.rateRoundOff}
                          onCheckedChange={(c) =>
                            setIncreaseForm((f) => ({ ...f, rateRoundOff: c === true }))
                          }
                        />
                        <label htmlFor="rate-round-off" className="text-sm text-muted-foreground">
                          Rate Round Off
                        </label>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <Button
                      onClick={() => void handleIncreaseRateSave()}
                      disabled={increasing}
                      className="min-w-[100px] bg-emerald-600 text-white hover:bg-emerald-600/90"
                    >
                      {increasing ? "Saving…" : "Save"}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={closeIncreaseRate}
                      className="min-w-[100px]"
                    >
                      Close
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex justify-end gap-2">
                  <Button
                    onClick={handleClientSearch}
                    className="min-w-[100px] bg-emerald-600 text-white hover:bg-emerald-600/90"
                  >
                    Search
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleClientReset}
                    className="min-w-[100px]"
                  >
                    Reset
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-end justify-end gap-4">
                <FieldWrapper borderLabel label="Percentage Increase" className="w-full max-w-xs">
                  <Input
                    className={CR_INPUT}
                    value={pctIncrease}
                    onChange={(e) => setPctIncrease(e.target.value)}
                    placeholder="0.00 to 100.00"
                    inputMode="decimal"
                  />
                </FieldWrapper>
                <div className="flex h-9 items-center gap-2 pb-0.5">
                  <Checkbox
                    id="copy-round"
                    checked={roundRates}
                    onCheckedChange={(c) => handleRoundChange(c === true)}
                  />
                  <label htmlFor="copy-round" className="text-sm text-muted-foreground">
                    Round
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <CopySideCard
                  title="Copy From"
                  value={copyFrom}
                  onChange={setCopyFrom}
                  fromDateMode="select"
                />
                <CopySideCard
                  title="Copy To"
                  value={copyTo}
                  onChange={setCopyTo}
                  fromDateMode="input"
                />
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <Button
                  onClick={() => void handleCopySearch()}
                  disabled={copying}
                  className="min-w-[100px] bg-emerald-600 text-white hover:bg-emerald-600/90"
                >
                  {copying ? "Copying…" : "Search"}
                </Button>
                <Button variant="destructive" onClick={handleCopyReset} className="min-w-[100px]">
                  Reset
                </Button>
              </div>
            </>
          )}
        </div>

        {mode === "client" && hasSearched && !increaseRateOpen ? (
          <>
            <div className="overflow-x-auto border-t">
              <Table>
                <TableHeader>
                  <TableRow className="bg-sidebar hover:bg-sidebar">
                    <TableHead className="text-sidebar-foreground">Customer</TableHead>
                    <TableHead className="text-sidebar-foreground">Product</TableHead>
                    <TableHead className="text-sidebar-foreground">Service</TableHead>
                    <TableHead className="text-sidebar-foreground">Destination</TableHead>
                    <TableHead className="text-sidebar-foreground">From</TableHead>
                    <TableHead className="text-sidebar-foreground">To</TableHead>
                    <TableHead className="text-sidebar-foreground text-right">Rate/Kg</TableHead>
                    <TableHead className="text-sidebar-foreground text-right">Fuel %</TableHead>
                    <TableHead className="text-sidebar-foreground">Status</TableHead>
                    <TableHead className="w-28 text-center text-sidebar-foreground">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {authed && liveQuery.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={10} className="h-32 text-center text-sm text-muted-foreground">
                        Loading customer rates…
                      </TableCell>
                    </TableRow>
                  ) : pageRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="h-32 text-center text-sm text-muted-foreground">
                        No data available in table
                      </TableCell>
                    </TableRow>
                  ) : (
                    pageRows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          {r.customerCode ? `${r.customerCode} — ${r.customerName}` : r.customerName}
                        </TableCell>
                        <TableCell>{r.productName || r.productCode}</TableCell>
                        <TableCell>{r.service}</TableCell>
                        <TableCell>{r.destinationName || r.destinationCode}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.fromDate}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.toDate}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{r.ratePerKg}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{r.fuelPct}</TableCell>
                        <TableCell>
                          <StatusPill status={r.status} />
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-1">
                            {canModify ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => openEdit(r)}
                                aria-label="Edit"
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
                                aria-label="Delete"
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
          </>
        ) : null}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Customer Rate" : "Customer Rate Details"}</DialogTitle>
          </DialogHeader>

          <div className={`${CR_GRID} py-2`}>
            <FieldWrapper borderLabel label="Customer" required>
              {authed ? (
                <LookupCombobox
                  lookupKey="customer"
                  value={form.customerId}
                  valueLabel={
                    form.customerName || form.customerCode
                      ? `${form.customerCode ? `${form.customerCode} — ` : ""}${form.customerName}`.trim()
                      : ""
                  }
                  onChange={(id, item) =>
                    setForm((f) => ({
                      ...f,
                      customerId: id,
                      customerCode: item?.code ?? "",
                      customerName: item?.name ?? item?.code ?? "",
                    }))
                  }
                  placeholder="Select Customer"
                  className="h-8 justify-between px-1.5 text-[13px] font-normal shadow-none"
                />
              ) : (
                <Input
                  className={CR_INPUT}
                  value={form.customerName}
                  onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                  placeholder="Customer"
                />
              )}
            </FieldWrapper>
            <FieldWrapper borderLabel label="From Date" required>
              <div className="relative flex w-full min-w-0 items-stretch">
                <CalendarIcon className="pointer-events-none absolute left-2 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="date"
                  className={`${CR_INPUT} pl-8`}
                  value={form.fromDate}
                  onChange={(e) => setForm((f) => ({ ...f, fromDate: e.target.value }))}
                />
              </div>
            </FieldWrapper>
            <CustomerRateLookupField
              label="Origin"
              lookup="destination"
              value={{ id: form.originId, code: form.originCode, name: form.originName }}
              onChange={(v) =>
                setForm((f) => ({
                  ...f,
                  originId: v.id ?? "",
                  originCode: v.code,
                  originName: v.name,
                }))
              }
            />
            <CustomerRateLookupField
              label="Vendor"
              lookup="vendor"
              value={{ id: form.vendorId, code: form.vendorCode, name: form.vendorName }}
              onChange={(v) =>
                setForm((f) => ({
                  ...f,
                  vendorId: v.id ?? "",
                  vendorCode: v.code,
                  vendorName: v.name,
                }))
              }
            />
            <CustomerRateLookupField
              label="Product"
              lookup="product"
              value={{ id: form.productId, code: form.productCode, name: form.productName }}
              onChange={(v) =>
                setForm((f) => ({
                  ...f,
                  productId: v.id ?? "",
                  productCode: v.code,
                  productName: v.name,
                }))
              }
            />
            <CustomerRateLookupField
              label="Zone"
              lookup="zone"
              value={{ id: form.zoneId, code: form.zoneCode, name: form.zoneName }}
              onChange={(v) =>
                setForm((f) => ({
                  ...f,
                  zoneId: v.id ?? "",
                  zoneCode: v.code,
                  zoneName: v.name,
                }))
              }
            />
            <CustomerRateLookupField
              label="Country"
              lookup="country"
              value={{ id: form.countryId, code: form.countryCode, name: form.countryName }}
              onChange={(v) =>
                setForm((f) => ({
                  ...f,
                  countryId: v.id ?? "",
                  countryCode: v.code,
                  countryName: v.name,
                }))
              }
            />
            <CustomerRateLookupField
              label="Destination"
              lookup="destination"
              value={{
                id: form.destinationId,
                code: form.destinationCode,
                name: form.destinationName,
              }}
              onChange={(v) =>
                setForm((f) => ({
                  ...f,
                  destinationId: v.id ?? "",
                  destinationCode: v.code,
                  destinationName: v.name,
                }))
              }
            />
            <FieldWrapper borderLabel label="Service">
              <Input
                className={CR_INPUT}
                value={form.service}
                onChange={(e) => setForm((f) => ({ ...f, service: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper borderLabel label="Unit">
              <Select
                value={form.unit || undefined}
                onValueChange={(v) => setForm((f) => ({ ...f, unit: v }))}
              >
                <SelectTrigger className={CR_SELECT}>
                  <SelectValue placeholder="Select Unit Type" />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_TYPES.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>
            <FieldWrapper borderLabel label="Days">
              <Input
                className={CR_INPUT}
                value={form.days}
                onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))}
              />
            </FieldWrapper>
            <FieldWrapper borderLabel label="Rate Type" required>
              <Select
                value={form.rateType || undefined}
                onValueChange={(v) => setForm((f) => ({ ...f, rateType: v }))}
              >
                <SelectTrigger className={CR_SELECT}>
                  <SelectValue placeholder="Select Rate Type" />
                </SelectTrigger>
                <SelectContent>
                  {RATE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>
            <FieldWrapper borderLabel label="Weight" required>
              <Input
                className={CR_INPUT}
                value={form.weight}
                onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
              />
            </FieldWrapper>
            <div className="flex flex-col justify-end lg:col-span-2">
              <FieldWrapper borderLabel label="Rate" required>
                <div className="flex w-full min-w-0 items-stretch">
                  <Input
                    className={`min-w-0 flex-1 ${CR_INPUT}`}
                    value={form.rate}
                    onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 shrink-0 rounded-none border-0 border-l border-input bg-sidebar px-3 text-sidebar-foreground hover:bg-sidebar/90 hover:text-sidebar-foreground"
                    onClick={handleAddRateLine}
                  >
                    <Plus className="mr-1 h-4 w-4" /> Add
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
                    <TableRow key={`${line.rateType}-${line.weight}-${idx}`}>
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
            <Button
              onClick={() => void handleSave()}
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
            <AlertDialogTitle>Delete rate entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this rate entry for{" "}
              <span className="font-medium text-foreground">
                {deleteTarget?.customerName || deleteTarget?.customerCode}
              </span>
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmDelete()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={roundValidationOpen} onOpenChange={setRoundValidationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Validation</AlertDialogTitle>
            <AlertDialogDescription>
              Please enter a valid percentage before selecting Round.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setRoundValidationOpen(false)}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CopySideCard({
  title,
  value,
  onChange,
  fromDateMode,
}: {
  title: string;
  value: CopySideFilters;
  onChange: (next: CopySideFilters) => void;
  fromDateMode: "select" | "input";
}) {
  const patch = <K extends keyof CopySideFilters>(key: K, v: CopySideFilters[K]) => {
    onChange({ ...value, [key]: v });
  };

  return (
    <fieldset className="rounded-md border bg-card p-4 shadow-sm">
      <legend className="rounded bg-sidebar px-2 py-0.5 text-xs font-medium text-sidebar-foreground">
        {title}
      </legend>
      <div className={CR_STACK}>
        <CustomerRateLookupField
          label="Customer"
          lookup="customer"
          value={value.customer}
          onChange={(v) => patch("customer", v)}
        />
        <FieldWrapper borderLabel label="From Date">
          {fromDateMode === "select" ? (
            <Select
              value={value.fromDate || undefined}
              onValueChange={(v) => patch("fromDate", v)}
            >
              <SelectTrigger className={CR_SELECT}>
                <SelectValue placeholder="Select From Date" />
              </SelectTrigger>
              <SelectContent>
                {[0, 1, 2, 3, 4, 5, 6].map((offset) => {
                  const d = new Date();
                  d.setMonth(d.getMonth() - offset);
                  const val = format(d, "yyyy-MM-dd");
                  return (
                    <SelectItem key={val} value={val}>
                      {format(d, "dd/MM/yyyy")}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          ) : (
            <div className="relative flex w-full min-w-0 items-stretch">
              <Input
                type="date"
                value={value.fromDate}
                onChange={(e) => patch("fromDate", e.target.value)}
                className={`${CR_INPUT} pr-8`}
              />
              <CalendarIcon className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
          )}
        </FieldWrapper>
        <CustomerRateLookupField
          label="Origin"
          lookup="destination"
          value={value.origin}
          onChange={(v) => patch("origin", v)}
        />
        <CustomerRateLookupField
          label="Vendor"
          lookup="vendor"
          value={value.vendor}
          onChange={(v) => patch("vendor", v)}
        />
        <CustomerRateLookupField
          label="Product"
          lookup="product"
          value={value.product}
          onChange={(v) => patch("product", v)}
        />
        <CustomerRateLookupField
          label="Zone"
          lookup="zone"
          value={value.zone}
          onChange={(v) => patch("zone", v)}
        />
        <CustomerRateLookupField
          label="Country"
          lookup="country"
          value={value.country}
          onChange={(v) => patch("country", v)}
        />
        <CustomerRateLookupField
          label="Destination"
          lookup="destination"
          value={value.destination}
          onChange={(v) => patch("destination", v)}
        />
        <FieldWrapper borderLabel label="Service">
          <Input
            className={CR_INPUT}
            value={value.service}
            onChange={(e) => patch("service", e.target.value)}
          />
        </FieldWrapper>
      </div>
    </fieldset>
  );
}
