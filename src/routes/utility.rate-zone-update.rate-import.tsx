import { createFileRoute } from "@tanstack/react-router";
import { Download, Search } from "lucide-react";
import { useRef, useState } from "react";
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
import { type LookupKey, type LookupOption } from "@/lib/master-lookups";

type ImportMode = "customer" | "vendor";
type LookupPair = { code: string; name: string };
type LookupField = "customer" | "origin" | "vendor";

type RateImportForm = {
  customer: LookupPair;
  origin: LookupPair;
  vendor: LookupPair;
  format: string;
  doxProduct: string;
  spxProduct: string;
  fromDate: string;
  rateRoundOff: boolean;
  fileName: string;
  addRateUpdateJob: boolean;
};

const emptyPair = (): LookupPair => ({ code: "", name: "" });
const todayIso = () => new Date().toISOString().slice(0, 10);

const emptyForm = (): RateImportForm => ({
  customer: emptyPair(),
  origin: emptyPair(),
  vendor: emptyPair(),
  format: "",
  doxProduct: "",
  spxProduct: "",
  fromDate: todayIso(),
  rateRoundOff: false,
  fileName: "",
  addRateUpdateJob: false,
});

const formatOptions = ["Zone Rate", "Country Rate", "Country Rate New", "Country Rate New1", "Country Rate New2"];
const doxProductOptions = ["ADOX", "COMMERCIAL", "DOCUMENTS", "INTL DOX", "ENVELOPE", "MEDICINE", "MOBILE", "SPXD"];
const spxProductOptions = ["ASPX", "FOOD", "LAPTOP", "NON DOCUMENTS", "PACK", "OTHER PACKAGE"];

export const Route = createFileRoute("/utility/rate-zone-update/rate-import")({
  head: () => ({
    meta: [
      { title: "Rate Import — Utility — Courier ERP" },
      { name: "description", content: "Import customer and vendor rate sheets." },
    ],
  }),
  component: RateImportPage,
});

function RateImportPage() {
  const [mode, setMode] = useState<ImportMode>("customer");
  const [form, setForm] = useState<RateImportForm>(emptyForm);
  const [lookupOpen, setLookupOpen] = useState<LookupKey | null>(null);
  const [lookupField, setLookupField] = useState<LookupField | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const patch = (updates: Partial<RateImportForm>) => setForm((current) => ({ ...current, ...updates }));

  const openLookup = (field: LookupField, lookup: LookupKey) => {
    setLookupField(field);
    setLookupOpen(lookup);
  };

  const handleLookupSelect = (option: LookupOption) => {
    if (!lookupField) return;
    patch({ [lookupField]: { code: option.code, name: option.name } });
    setLookupOpen(null);
  };

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    patch({ fileName: event.target.files?.[0]?.name ?? "" });
  };

  const handleSave = () => {
    if (mode === "customer" && !form.customer.name.trim()) return toast.error("Customer is required");
    if (mode === "vendor" && !form.vendor.name.trim()) return toast.error("Vendor is required");
    if (!form.origin.name.trim()) return toast.error("Origin is required");
    if (!form.format) return toast.error("Format is required");
    if (!form.fileName) return toast.error("Please select upload file");
    toast.success(form.addRateUpdateJob ? "Rate import saved and rate update queued" : "Rate import saved");
  };

  const reset = () => {
    setForm(emptyForm());
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Utility", "Rate / Zone Update", "Rate Import"]} />

      <Card className="relative min-w-0 border p-4 pt-7">
        <span className="absolute -top-3 left-4 rounded-full bg-sidebar px-4 py-1 text-xs font-semibold text-sidebar-foreground shadow">
          Rate Import
        </span>

        <button
          type="button"
          onClick={() => toast.success("Rate import Excel format download started")}
          className="absolute right-4 top-4 inline-flex items-center gap-1 text-xs text-red-500 hover:underline"
        >
          <Download className="h-3.5 w-3.5" />
          Click Here to Download Excel File Format
        </button>

        <div className="mb-3 flex items-center gap-1">
          <TabButton active={mode === "customer"} onClick={() => setMode("customer")}>Customer</TabButton>
          <TabButton active={mode === "vendor"} onClick={() => setMode("vendor")}>Vendor</TabButton>
        </div>

        <div className="grid gap-x-3 gap-y-2 lg:grid-cols-4">
          {mode === "customer" ? (
            <FieldWrapper label="Customer">
              <LookupPairInput value={form.customer} onChange={(customer) => patch({ customer })} onLookupOpen={() => openLookup("customer", "customer")} />
            </FieldWrapper>
          ) : (
            <FieldWrapper label="Origin">
              <LookupPairInput value={form.origin} onChange={(origin) => patch({ origin })} onLookupOpen={() => openLookup("origin", "serviceCentre")} />
            </FieldWrapper>
          )}

          {mode === "customer" ? (
            <FieldWrapper label="Origin">
              <LookupPairInput value={form.origin} onChange={(origin) => patch({ origin })} onLookupOpen={() => openLookup("origin", "serviceCentre")} />
            </FieldWrapper>
          ) : (
            <FieldWrapper label="Vendor">
              <LookupPairInput value={form.vendor} onChange={(vendor) => patch({ vendor })} onLookupOpen={() => openLookup("vendor", "vendor")} />
            </FieldWrapper>
          )}

          <SelectField label="Format" value={form.format} placeholder="Select Format" options={formatOptions} onChange={(format) => patch({ format })} />
          <SelectField label="DOX Product" value={form.doxProduct} placeholder="Select DOX Product" options={doxProductOptions} onChange={(doxProduct) => patch({ doxProduct })} />
          <SelectField label="SPX Product" value={form.spxProduct} placeholder="Select SPX Product" options={spxProductOptions} onChange={(spxProduct) => patch({ spxProduct })} />
          <FieldWrapper label="From Date">
            <Input type="date" value={form.fromDate} onChange={(event) => patch({ fromDate: event.target.value })} className="h-9" />
          </FieldWrapper>
          <label className="flex h-14 items-end gap-2 pb-2 text-xs text-foreground">
            <Checkbox checked={form.rateRoundOff} onCheckedChange={(value) => patch({ rateRoundOff: Boolean(value) })} />
            <span>Rate Round Off</span>
          </label>
          <FieldWrapper label="Upload File">
            <div className="flex items-center gap-2">
              <input ref={fileInputRef} type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFile} />
              <Button type="button" variant="outline" className="h-9 px-6" onClick={() => fileInputRef.current?.click()}>
                Choose
              </Button>
              <span className="truncate text-xs text-muted-foreground">{form.fileName || "No file selected"}</span>
            </div>
          </FieldWrapper>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={() => toast.info("Job queue opened")} className="mr-2 text-sm font-semibold text-blue-700 underline">
          Click Here Open Job Queue
        </button>
        <label className="flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-xs text-muted-foreground">
          <Checkbox checked={form.addRateUpdateJob} onCheckedChange={(value) => patch({ addRateUpdateJob: Boolean(value) })} />
          Add Rate Update in Job Queue after Rate Import
        </label>
        <Button onClick={handleSave} className="h-9 rounded-full bg-green-500 px-8 text-white hover:bg-green-600">
          Save
        </Button>
        <Button onClick={reset} className="h-9 rounded-full bg-red-500 px-8 text-white hover:bg-red-600">
          Reset
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
  placeholder: string;
}) {
  return (
    <FieldWrapper label={label}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder={placeholder} />
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

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" size="sm" variant={active ? "default" : "outline"} className={`h-8 px-4 ${active ? "bg-green-600 text-white hover:bg-green-700" : ""}`} onClick={onClick}>
      {children}
    </Button>
  );
}
