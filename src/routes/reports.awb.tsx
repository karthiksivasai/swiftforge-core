import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FieldWrapper, MasterBreadcrumb } from "@/components/master-table-kit";
import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import { type LookupKey, type LookupOption } from "@/lib/master-lookups";
import {
  AWB_BUSINESS_CHANNELS,
  AWB_CHARGE_TYPES,
  AWB_CUSTOMER_TYPES,
  AWB_FIELD_LABELS,
  AWB_FORMAT_TYPES,
  AWB_LOCK_TYPES,
  AWB_LOOKUP_FIELDS,
  AWB_PRODUCT_TYPES,
  AWB_REPORT_FOR_TYPES,
  AWB_REGISTER_TYPES,
  AWB_REPORT_DEFINITIONS,
  AWB_TAX_TYPES,
  AWB_ZERO_TYPES,
  awbHasDateRange,
  type AwbFieldKey,
} from "@/lib/awb-report-config";

type LookupPair = { code: string; name: string };

type AwbForm = {
  reportType: string;
  type: string;
  reportFor: string;
  fromDate: string;
  toDate: string;
  customer: LookupPair;
  origin: LookupPair;
  serviceCenter: LookupPair;
  product: LookupPair;
  vendor: LookupPair;
  serviceType: LookupPair;
  destination: LookupPair;
  paymentType: LookupPair;
  contractHead: LookupPair;
  awbNo: string;
  instruction: string;
  manifestNo: string;
  fromManifestNo: string;
  toManifestNo: string;
  invoiceNo: string;
  customerType: string;
  formatType: string;
  businessChannel: string;
  chargeType: string;
  productType: string;
  tax: string;
  lockType: string;
  registerType: string;
  billed: boolean;
  unBilled: boolean;
  summary: boolean;
  otherCharges: boolean;
  addToJobQueue: boolean;
};

type ResultRow = {
  id: string;
  awbNo: string;
  invoiceNo: string;
  date: string;
  customer: string;
  origin: string;
  amount: string;
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const emptyPair = (): LookupPair => ({ code: "", name: "" });

const emptyForm = (): AwbForm => ({
  reportType: "billing",
  type: "",
  reportFor: "Customer",
  fromDate: todayIso(),
  toDate: todayIso(),
  customer: emptyPair(),
  origin: emptyPair(),
  serviceCenter: emptyPair(),
  product: emptyPair(),
  vendor: emptyPair(),
  serviceType: emptyPair(),
  destination: emptyPair(),
  paymentType: emptyPair(),
  contractHead: emptyPair(),
  awbNo: "",
  instruction: "",
  manifestNo: "",
  fromManifestNo: "",
  toManifestNo: "",
  invoiceNo: "",
  customerType: "",
  formatType: "",
  businessChannel: "",
  chargeType: "All",
  productType: "",
  tax: "",
  lockType: "All",
  registerType: "",
  billed: false,
  unBilled: false,
  summary: false,
  otherCharges: false,
  addToJobQueue: false,
});

const DEMO_RESULTS: Omit<ResultRow, "id">[] = [
  { awbNo: "30403918", invoiceNo: "INV-1024", date: "10/07/2026", customer: "GREEN COURIER", origin: "HYD", amount: "1,250.00" },
  { awbNo: "30403919", invoiceNo: "INV-1025", date: "10/07/2026", customer: "VASANTH INTERNATIONAL", origin: "HYD", amount: "890.00" },
  { awbNo: "30403920", invoiceNo: "INV-1026", date: "09/07/2026", customer: "AADYAM LOGI SOLUTIONS", origin: "BLR", amount: "2,100.00" },
];

const daysBetween = (from: string, to: string) => {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
};

export const Route = createFileRoute("/reports/awb")({
  head: () => ({
    meta: [
      { title: "AWB — Reports — Courier ERP" },
      { name: "description", content: "Generate AWB reports with billing, invoice, COD, void, and zero report filters." },
    ],
  }),
  component: AwbReportPage,
});

function AwbReportPage() {
  const [form, setForm] = useState<AwbForm>(emptyForm);
  const [results, setResults] = useState<ResultRow[]>([]);

  const definition = useMemo(
    () => AWB_REPORT_DEFINITIONS.find((r) => r.id === form.reportType) ?? AWB_REPORT_DEFINITIONS[0],
    [form.reportType],
  );

  const patch = (updates: Partial<AwbForm>) => setForm((f) => ({ ...f, ...updates }));

  const handleReportTypeChange = (reportType: string) => {
    const next = AWB_REPORT_DEFINITIONS.find((r) => r.id === reportType);
    setForm({
      ...emptyForm(),
      reportType,
      chargeType: next?.chargeTypeOptions?.[0] ?? "All",
      formatType: next?.formatTypeOptions?.[0] ?? "",
      lockType: next?.lockTypeOptions?.[0] ?? "All",
      reportFor: next?.reportForOptions?.[0] ?? "Customer",
    });
    setResults([]);
  };

  const validateDates = (): boolean => {
    if (!awbHasDateRange(definition)) return true;
    if (!form.fromDate.trim() || !form.toDate.trim()) {
      toast.error("From Date and To Date are required");
      return false;
    }
    if (form.fromDate > form.toDate) {
      toast.error("From Date cannot be after To Date");
      return false;
    }
    if (daysBetween(form.fromDate, form.toDate) > 31) {
      toast.error("Report period cannot exceed 31 days");
      return false;
    }
    return true;
  };

  const handleSearch = () => {
    if (!validateDates()) return;
    setResults(DEMO_RESULTS.map((row) => ({ id: crypto.randomUUID(), ...row })));
    if (form.addToJobQueue) {
      toast.success(`${definition.label} added to job queue`);
    } else {
      toast.success(`${definition.label} generated`);
    }
  };

  const handleReset = () => {
    setForm(emptyForm());
    setResults([]);
    toast.success("Form reset");
  };

  const renderSelect = (
    key: "type" | "reportFor" | "customerType" | "formatType" | "businessChannel" | "chargeType" | "productType" | "tax" | "lockType" | "registerType",
    options: readonly string[],
    placeholder: string,
  ) => (
    <FieldWrapper key={key} label={definition.fieldLabels?.[key] ?? AWB_FIELD_LABELS[key]}>
      <Select value={form[key] || undefined} onValueChange={(value) => patch({ [key]: value } as Partial<AwbForm>)}>
        <SelectTrigger>
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

  const renderField = (key: AwbFieldKey) => {
    if (key === "fromDate" || key === "toDate") {
      return (
        <FieldWrapper key={key} label={AWB_FIELD_LABELS[key]}>
          <Input type="date" value={form[key]} onChange={(event) => patch({ [key]: event.target.value })} />
        </FieldWrapper>
      );
    }

    if (key === "reportFor") {
      return renderSelect(key, definition.reportForOptions ?? AWB_REPORT_FOR_TYPES, "Select Report For");
    }

    const lookup = AWB_LOOKUP_FIELDS[key];
    if (lookup) {
      return (
        <FieldWrapper key={key} label={AWB_FIELD_LABELS[key]}>
          <LookupPairInput
            lookup={lookup}
            value={form[key] as LookupPair}
            onChange={(value) => patch({ [key]: value } as Partial<AwbForm>)}
          />
        </FieldWrapper>
      );
    }

    if (key === "customerType") {
      return renderSelect(key, definition.customerTypeOptions ?? AWB_CUSTOMER_TYPES, "Select Customer Type");
    }

    if (key === "formatType") {
      return renderSelect(key, definition.formatTypeOptions ?? AWB_FORMAT_TYPES, "Select Format Type");
    }

    if (key === "businessChannel") {
      return renderSelect(key, definition.businessChannelOptions ?? AWB_BUSINESS_CHANNELS, "Select Business Type");
    }

    if (key === "chargeType") {
      return renderSelect(key, definition.chargeTypeOptions ?? AWB_CHARGE_TYPES, "Select Charge Type");
    }

    if (key === "productType") {
      return renderSelect(key, definition.productTypeOptions ?? AWB_PRODUCT_TYPES, "Select Product Type");
    }

    if (key === "tax") {
      return renderSelect(key, definition.taxOptions ?? AWB_TAX_TYPES, "Select Tax");
    }

    if (key === "lockType") {
      return renderSelect(key, definition.lockTypeOptions ?? AWB_LOCK_TYPES, "Select Lock Type");
    }

    if (key === "registerType") {
      return renderSelect(key, definition.registerTypeOptions ?? AWB_REGISTER_TYPES, "Select Type");
    }

    if (key === "type") {
      return renderSelect(key, definition.typeOptions ?? AWB_ZERO_TYPES, "Select Type");
    }

    const checkboxKeys: AwbFieldKey[] = ["billed", "unBilled", "summary", "otherCharges"];
    if (checkboxKeys.includes(key)) {
      return (
        <FieldWrapper key={key} label={AWB_FIELD_LABELS[key]} className="justify-end">
          <div className="flex h-9 items-center gap-2">
            <Checkbox
              id={key}
              checked={form[key] as boolean}
              onCheckedChange={(value) => patch({ [key]: value === true } as Partial<AwbForm>)}
            />
            <Label htmlFor={key} className="cursor-pointer text-sm font-normal">
              {AWB_FIELD_LABELS[key]}
            </Label>
          </div>
        </FieldWrapper>
      );
    }

    const textKeys: AwbFieldKey[] = ["awbNo", "instruction", "manifestNo", "fromManifestNo", "toManifestNo", "invoiceNo"];
    if (textKeys.includes(key)) {
      return (
        <FieldWrapper key={key} label={AWB_FIELD_LABELS[key]}>
          <Input value={form[key] as string} onChange={(event) => patch({ [key]: event.target.value } as Partial<AwbForm>)} />
        </FieldWrapper>
      );
    }

    return null;
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Reports", "AWB"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">AWB</h1>
        <p className="text-sm text-muted-foreground">
          Generate AWB billing, COD, invoice, void, and zero reports with lookup filters.
        </p>
      </div>

      <Card className="min-w-0 overflow-hidden border p-4 md:p-6">
        <div className="mb-4">
          <span className="inline-flex rounded-full bg-sidebar px-3 py-0.5 text-sm font-medium text-sidebar-foreground">
            Report
          </span>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <FieldWrapper label="Report Type">
              <Select value={form.reportType} onValueChange={handleReportTypeChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Report Type" />
                </SelectTrigger>
                <SelectContent>
                  {AWB_REPORT_DEFINITIONS.map((report) => (
                    <SelectItem key={report.id} value={report.id}>
                      {report.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>
            {definition.fields.map((field) => renderField(field))}
          </div>

          {definition.secondRowFields?.length ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {definition.secondRowFields.map((field) => renderField(field))}
            </div>
          ) : null}

          {definition.extraRows?.map((row, index) => (
            <div key={`extra-row-${index}`} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {row.map((field) => renderField(field))}
            </div>
          ))}
        </div>

        {results.length > 0 ? (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[720px] caption-bottom text-sm">
              <TableHeader>
                <TableRow className="bg-sidebar hover:bg-sidebar">
                  {["AWB No.", "Invoice No.", "Date", "Customer", "Origin", "Amount"].map((heading) => (
                    <TableHead key={heading} className="text-sidebar-foreground">
                      {heading}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.awbNo}</TableCell>
                    <TableCell>{row.invoiceNo}</TableCell>
                    <TableCell>{row.date}</TableCell>
                    <TableCell>{row.customer}</TableCell>
                    <TableCell>{row.origin}</TableCell>
                    <TableCell>{row.amount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </table>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-sm text-destructive">Note : Report Period Limit - 31 Days</p>
          <div className="flex flex-wrap items-center justify-end gap-4">
            <button
              type="button"
              className="text-sm text-primary underline-offset-4 hover:underline"
              onClick={() => toast.info("Job queue will open when backend is wired")}
            >
              Click Here Open Job Queue
            </button>
            <div className="flex items-center gap-2">
              <Checkbox
                id="addToJobQueue"
                checked={form.addToJobQueue}
                onCheckedChange={(value) => patch({ addToJobQueue: value === true })}
              />
              <Label htmlFor="addToJobQueue" className="cursor-pointer text-sm font-normal">
                Add to Job Queue
              </Label>
            </div>
            <Button onClick={handleSearch} className="min-w-24 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90">
              Search
            </Button>
            <Button variant="destructive" onClick={handleReset} className="min-w-24">
              Reset
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function LookupPairInput({
  value,
  onChange,
  lookup,
}: {
  value: LookupPair;
  onChange: (value: LookupPair) => void;
  lookup: LookupKey;
}) {
  const [lookupOpen, setLookupOpen] = useState(false);

  return (
    <>
      <div className="flex gap-1">
        <Input
          value={value.name}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
          className="min-w-0 flex-1"
          placeholder="Name"
        />
        <Input
          value={value.code}
          onChange={(event) => onChange({ ...value, code: event.target.value })}
          className="w-20"
          placeholder="Code"
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
        lookup={lookup}
        returnField="code"
        onSelect={(_value, option: LookupOption) => onChange({ code: option.code, name: option.name })}
      />
    </>
  );
}
