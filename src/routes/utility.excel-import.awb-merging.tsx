import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Download, Search } from "lucide-react";
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
import { FieldWrapper, MasterBreadcrumb } from "@/components/master-table-kit";
import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import {
  downloadExcelTemplate,
  excelImportErrorMessage,
  runExcelImportFromFile,
} from "@/lib/imports/excelUi";
import { MASTER_LOOKUPS, type LookupKey, type LookupOption } from "@/lib/master-lookups";

type LookupPair = { code: string; name: string };
type LookupField = "customer" | "product" | "vendor";

type AwbImportForm = {
  customer: LookupPair;
  product: LookupPair;
  vendor: LookupPair;
  weight: string;
  pieces: string;
  bookingDate: string;
  manifestNo: string;
  type: string;
  format: string;
  scanDate: string;
  scanTime: string;
  serviceCenter: string;
  exception: string;
  addInscan: boolean;
  addToPickup: boolean;
  singleLineConsigneeAddress: boolean;
  updateEntry: boolean;
  deleteEntry: boolean;
  addToJobQueue: boolean;
  fileName: string;
};

const emptyPair = (): LookupPair => ({ code: "", name: "" });
const todayIso = () => new Date().toISOString().slice(0, 10);
const currentTime = () => new Date().toTimeString().slice(0, 5);

const emptyForm = (): AwbImportForm => ({
  customer: emptyPair(),
  product: emptyPair(),
  vendor: emptyPair(),
  weight: "",
  pieces: "",
  bookingDate: todayIso(),
  manifestNo: "",
  type: "",
  format: "Standard Format",
  scanDate: todayIso(),
  scanTime: currentTime(),
  serviceCenter: "",
  exception: "",
  addInscan: true,
  addToPickup: false,
  singleLineConsigneeAddress: false,
  updateEntry: false,
  deleteEntry: false,
  addToJobQueue: false,
  fileName: "",
});

const serviceCenters = MASTER_LOOKUPS.serviceCentre.options.map((option) => option.name);
const exceptions = MASTER_LOOKUPS.exception.options.map((option) => option.name);

export const Route = createFileRoute("/utility/excel-import/awb-merging")({
  head: () => ({
    meta: [
      { title: "AWB Import — Utility — Courier ERP" },
      { name: "description", content: "Import AWB entries from Excel files." },
    ],
  }),
  component: AwbImportPage,
});

function AwbImportPage() {
  const [form, setForm] = useState<AwbImportForm>(emptyForm);
  const [lookupOpen, setLookupOpen] = useState<LookupKey | null>(null);
  const [lookupField, setLookupField] = useState<LookupField | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<File | null>(null);

  const patch = (updates: Partial<AwbImportForm>) =>
    setForm((current) => ({ ...current, ...updates }));

  const openLookup = (field: LookupField, lookup: LookupKey) => {
    setLookupField(field);
    setLookupOpen(lookup);
  };

  const handleLookupSelect = (_value: string, option: LookupOption) => {
    if (!lookupField) return;
    patch({ [lookupField]: { code: option.code, name: option.name } });
    setLookupOpen(null);
  };

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    fileRef.current = file;
    patch({ fileName: file?.name ?? "" });
  };

  const runImport = async (mode: "VALIDATE" | "COMMIT") => {
    if (!form.customer.code.trim()) return toast.error("Customer is required");
    if (!form.product.code.trim()) return toast.error("Product is required");
    if (!fileRef.current) return toast.error("Please select import file");
    setBusy(true);
    try {
      await runExcelImportFromFile({
        file: fileRef.current,
        importType: "AWB_MERGE",
        mode,
        params: {
          customer_code: form.customer.code.trim(),
          product_code: form.product.code.trim(),
          vendor_code: form.vendor.code.trim() || null,
          book_date: form.bookingDate || null,
          update_entry: form.updateEntry,
          delete_entry: form.deleteEntry,
          add_inscan: form.addInscan,
          add_to_pickup: form.addToPickup,
        },
      });
    } catch (err) {
      toast.error(excelImportErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleReset = () => {
    setForm(emptyForm());
    fileRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Utility", "Excel Import", "AWB Import"]} />

      <Card className="min-w-0 border p-4">
        <button
          type="button"
          onClick={() => downloadExcelTemplate("AWB_MERGE", "awb-merge-template.csv")}
          className="mb-3 inline-flex items-center gap-1 text-xs text-red-500 hover:underline"
        >
          <Download className="h-3.5 w-3.5" />
          Click Here To Download Excel
        </button>

        <div className="grid gap-x-3 gap-y-2 lg:grid-cols-4">
          <FieldWrapper label="Customer" required>
            <LookupPairInput
              value={form.customer}
              onChange={(customer) => patch({ customer })}
              onLookupOpen={() => openLookup("customer", "customer")}
            />
          </FieldWrapper>
          <FieldWrapper label="Product" required>
            <LookupPairInput
              value={form.product}
              onChange={(product) => patch({ product })}
              onLookupOpen={() => openLookup("product", "product")}
            />
          </FieldWrapper>
          <FieldWrapper label="Vendor" required>
            <LookupPairInput
              value={form.vendor}
              onChange={(vendor) => patch({ vendor })}
              onLookupOpen={() => openLookup("vendor", "vendor")}
            />
          </FieldWrapper>
          <FieldWrapper label="Weight" required>
            <Input
              value={form.weight}
              onChange={(event) => patch({ weight: event.target.value })}
              className="h-9"
            />
          </FieldWrapper>

          <FieldWrapper label="Pieces" required>
            <Input
              value={form.pieces}
              onChange={(event) => patch({ pieces: event.target.value })}
              className="h-9"
            />
          </FieldWrapper>
          <FieldWrapper label="Booking Date" required>
            <Input
              type="date"
              value={form.bookingDate}
              onChange={(event) => patch({ bookingDate: event.target.value })}
              className="h-9"
            />
          </FieldWrapper>
          <FieldWrapper label="Manifest No">
            <Input
              value={form.manifestNo}
              onChange={(event) => patch({ manifestNo: event.target.value })}
              className="h-9"
            />
          </FieldWrapper>
          <SelectField
            label="Type"
            value={form.type}
            placeholder="Select Type"
            options={["Out Going", "In Coming"]}
            onChange={(type) => patch({ type })}
            required
          />

          <SelectField
            label="Format"
            value={form.format}
            options={["Standard Format"]}
            onChange={(format) => patch({ format })}
            required
          />
          <CheckField
            label="Add Inscan"
            checked={form.addInscan}
            onChange={(addInscan) => patch({ addInscan })}
          />
          <CheckField
            label="Add to Pickup"
            checked={form.addToPickup}
            onChange={(addToPickup) => patch({ addToPickup })}
          />
          <CheckField
            label="Single Line Consignee Address"
            checked={form.singleLineConsigneeAddress}
            onChange={(singleLineConsigneeAddress) => patch({ singleLineConsigneeAddress })}
          />

          <FieldWrapper label="Scan Date">
            <Input
              type="date"
              value={form.scanDate}
              onChange={(event) => patch({ scanDate: event.target.value })}
              className="h-9"
            />
          </FieldWrapper>
          <FieldWrapper label="Scan Time">
            <Input
              type="time"
              value={form.scanTime}
              onChange={(event) => patch({ scanTime: event.target.value })}
              className="h-9"
            />
          </FieldWrapper>
          <SelectField
            label="Service Center"
            value={form.serviceCenter}
            placeholder="Select Service Center"
            options={serviceCenters}
            onChange={(serviceCenter) => patch({ serviceCenter })}
            required
          />
          <SelectField
            label="Exception"
            value={form.exception}
            placeholder="Select Exception"
            options={exceptions}
            onChange={(exception) => patch({ exception })}
            required
          />

          <CheckField
            label="Update Entry"
            checked={form.updateEntry}
            onChange={(updateEntry) => patch({ updateEntry })}
          />
          <CheckField
            label="Delete Entry"
            checked={form.deleteEntry}
            onChange={(deleteEntry) => patch({ deleteEntry })}
          />
          <FieldWrapper label="Select File">
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".xlsx,.xls,.csv"
                onChange={handleFile}
              />
              <Button
                type="button"
                variant="outline"
                className="h-9 px-6"
                onClick={() => fileInputRef.current?.click()}
              >
                Choose
              </Button>
              <span className="truncate text-xs text-muted-foreground">
                {form.fileName || "No file selected"}
              </span>
            </div>
          </FieldWrapper>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <label className="flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-xs text-muted-foreground">
          <Checkbox
            checked={form.addToJobQueue}
            onCheckedChange={(value) => patch({ addToJobQueue: Boolean(value) })}
          />
          Add to Job Queue
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void runImport("VALIDATE")}
          className="h-9 rounded-full px-6"
        >
          Validate
        </Button>
        <Button
          disabled={busy}
          onClick={() => void runImport("COMMIT")}
          className="h-9 rounded-full bg-green-500 px-8 text-white hover:bg-green-600"
        >
          Import
        </Button>
        <Button
          onClick={handleReset}
          className="h-9 rounded-full bg-red-500 px-8 text-white hover:bg-red-600"
        >
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
        aria-label="Search"
        onClick={onLookupOpen}
      >
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
  required,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <FieldWrapper label={label} required={required}>
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

function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex h-14 items-end gap-2 pb-2 text-xs text-foreground">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(Boolean(value))} />
      <span>{label}</span>
    </label>
  );
}
