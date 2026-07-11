import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { MasterLookupDialog } from "@/components/master-lookup-dialog";
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
import { FieldWrapper, MasterBreadcrumb } from "@/components/master-table-kit";
import { MASTER_LOOKUPS, type LookupKey, type LookupOption } from "@/lib/master-lookups";

type LookupPair = { code: string; name: string };
type LookupField = "serviceCenter" | "origin" | "customer" | "product" | "vendor" | "destination";
type ContractMode = "all" | "zero-contract";

type RateUpdateForm = {
  updateType: string;
  fromDate: string;
  toDate: string;
  serviceCenter: LookupPair;
  origin: LookupPair;
  customer: LookupPair;
  product: LookupPair;
  vendor: LookupPair;
  destination: LookupPair;
  paymentType: string;
  contractMode: ContractMode;
  addToJobQueue: boolean;
};

const emptyPair = (): LookupPair => ({ code: "", name: "" });
const todayIso = () => new Date().toISOString().slice(0, 10);

const emptyForm = (): RateUpdateForm => ({
  updateType: "AWB Entry Rate",
  fromDate: todayIso(),
  toDate: todayIso(),
  serviceCenter: emptyPair(),
  origin: emptyPair(),
  customer: emptyPair(),
  product: emptyPair(),
  vendor: emptyPair(),
  destination: emptyPair(),
  paymentType: "",
  contractMode: "all",
  addToJobQueue: false,
});

const updateTypes = ["AWB Entry Rate", "Vendor Rate", "Tax & Fuel", "Vendor OBC Rate"];
const paymentTypes = MASTER_LOOKUPS.paymentType.options.map((option) => option.name);

export const Route = createFileRoute("/utility/rate-zone-update/rate-update")({
  head: () => ({
    meta: [
      { title: "Rate Update — Utility — Courier ERP" },
      { name: "description", content: "Update AWB, vendor, tax, fuel, and OBC rates." },
    ],
  }),
  component: RateUpdatePage,
});

function RateUpdatePage() {
  const [form, setForm] = useState<RateUpdateForm>(emptyForm);
  const [lookupOpen, setLookupOpen] = useState<LookupKey | null>(null);
  const [lookupField, setLookupField] = useState<LookupField | null>(null);

  const patch = (updates: Partial<RateUpdateForm>) => setForm((current) => ({ ...current, ...updates }));

  const openLookup = (field: LookupField, lookup: LookupKey) => {
    setLookupField(field);
    setLookupOpen(lookup);
  };

  const handleLookupSelect = (option: LookupOption) => {
    if (!lookupField) return;
    patch({ [lookupField]: { code: option.code, name: option.name } });
    setLookupOpen(null);
  };

  const handleOk = () => {
    if (!form.updateType) return toast.error("Update Type is required");
    if (!form.fromDate || !form.toDate) return toast.error("Date range is required");
    toast.success(form.addToJobQueue ? "Rate update added to job queue" : "Rate update started");
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Utility", "Rate / Zone Update", "Rate Update"]} />

      <Card className="min-w-0 border p-4">
        <p className="mb-3 text-xs font-semibold text-blue-700">
          Locked Invoices / AWB Entries does not change because the master records are changed. For eg.(Rate master, Taxes ,Fuel & etc), Please unlock Invoices / AWB to make any changes.
        </p>

        <div className="grid gap-x-3 gap-y-2 lg:grid-cols-4">
          <SelectField
            label="Update Type"
            value={form.updateType}
            options={updateTypes}
            onChange={(updateType) => patch({ updateType })}
          />
          <FieldWrapper label="From Date" required>
            <Input type="date" value={form.fromDate} onChange={(event) => patch({ fromDate: event.target.value })} className="h-9" />
          </FieldWrapper>
          <FieldWrapper label="To Date" required>
            <Input type="date" value={form.toDate} onChange={(event) => patch({ toDate: event.target.value })} className="h-9" />
          </FieldWrapper>
          <FieldWrapper label="Service Center">
            <LookupPairInput value={form.serviceCenter} onChange={(serviceCenter) => patch({ serviceCenter })} onLookupOpen={() => openLookup("serviceCenter", "serviceCentre")} />
          </FieldWrapper>

          <FieldWrapper label="Origin">
            <LookupPairInput value={form.origin} onChange={(origin) => patch({ origin })} onLookupOpen={() => openLookup("origin", "serviceCentre")} />
          </FieldWrapper>
          <FieldWrapper label="Customer">
            <LookupPairInput value={form.customer} onChange={(customer) => patch({ customer })} onLookupOpen={() => openLookup("customer", "customer")} />
          </FieldWrapper>
          <FieldWrapper label="Product">
            <LookupPairInput value={form.product} onChange={(product) => patch({ product })} onLookupOpen={() => openLookup("product", "product")} />
          </FieldWrapper>
          <FieldWrapper label="Vendor">
            <LookupPairInput value={form.vendor} onChange={(vendor) => patch({ vendor })} onLookupOpen={() => openLookup("vendor", "vendor")} />
          </FieldWrapper>

          <FieldWrapper label="Destination">
            <LookupPairInput value={form.destination} onChange={(destination) => patch({ destination })} onLookupOpen={() => openLookup("destination", "destination")} />
          </FieldWrapper>
          <SelectField
            label="Payment Type"
            value={form.paymentType}
            options={paymentTypes}
            placeholder="Select Payment Type"
            onChange={(paymentType) => patch({ paymentType })}
          />
          <div className="flex items-end gap-2">
            <ToggleButton active={form.contractMode === "all"} onClick={() => patch({ contractMode: "all" })}>
              All
            </ToggleButton>
            <ToggleButton active={form.contractMode === "zero-contract"} onClick={() => patch({ contractMode: "zero-contract" })}>
              Zero Contract(0)
            </ToggleButton>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 px-2">
        <p className="text-base font-semibold text-red-500">Note : Data Update Limit - 31 Days</p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={() => toast.info("Job queue opened")} className="text-sm font-semibold text-blue-700 underline">
            Click Here Open Job Queue
          </button>
          <label className="flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-xs text-muted-foreground">
            <Checkbox checked={form.addToJobQueue} onCheckedChange={(value) => patch({ addToJobQueue: Boolean(value) })} />
            Add to Job Queue
          </label>
          <Button onClick={handleOk} className="h-9 rounded-full bg-green-500 px-8 text-white hover:bg-green-600">
            Ok
          </Button>
          <Button onClick={() => setForm(emptyForm())} className="h-9 rounded-full bg-red-500 px-8 text-white hover:bg-red-600">
            Reset
          </Button>
        </div>
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

function LookupPairInput({
  value,
  onChange,
  onLookupOpen,
}: {
  value: LookupPair;
  onChange: (value: LookupPair) => void;
  onLookupOpen: () => void;
}) {
  return (
    <div className="flex gap-1">
      <Input value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} className="min-w-0 flex-1" />
      <Input value={value.code} onChange={(event) => onChange({ ...value, code: event.target.value })} className="w-20" />
      <Button size="icon" variant="outline" className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90" onClick={onLookupOpen} aria-label="Search">
        <Search className="h-4 w-4" />
      </Button>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <FieldWrapper label={label}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder={placeholder ?? label} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldWrapper>
  );
}

function ToggleButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" size="sm" variant={active ? "default" : "outline"} className={`h-8 ${active ? "bg-green-600 text-white hover:bg-green-700" : ""}`} onClick={onClick}>
      {children}
    </Button>
  );
}
