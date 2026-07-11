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
  AR_FIELD_LABELS,
  AR_LOOKUP_FIELDS,
  AR_REPORT_DEFINITIONS,
  AR_TRANSACTION_TYPES,
  arHasDateRange,
  type ArFieldKey,
} from "@/lib/ar-report-config";

type LookupPair = { code: string; name: string };

type ArForm = {
  reportType: string;
  fromDate: string;
  toDate: string;
  customer: LookupPair;
  serviceCenter: LookupPair;
  salesExecutive: LookupPair;
  fieldExecutive: LookupPair;
  type: string;
  transactionType: string;
  asOnDate: boolean;
  withZero: boolean;
  unBilled: boolean;
  addToJobQueue: boolean;
};

type ResultRow = {
  id: string;
  customer: string;
  invoiceNo: string;
  date: string;
  amount: string;
  ageing: string;
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const emptyPair = (): LookupPair => ({ code: "", name: "" });

const emptyForm = (): ArForm => ({
  reportType: "ledger-ageing",
  fromDate: todayIso(),
  toDate: todayIso(),
  customer: emptyPair(),
  serviceCenter: emptyPair(),
  salesExecutive: emptyPair(),
  fieldExecutive: emptyPair(),
  type: "details",
  transactionType: "Select",
  asOnDate: false,
  withZero: false,
  unBilled: false,
  addToJobQueue: false,
});

const DEMO_RESULTS: Omit<ResultRow, "id">[] = [
  { customer: "GREEN COURIER", invoiceNo: "INV-1024", date: "10/07/2026", amount: "1,250.00", ageing: "0-30" },
  { customer: "VASANTH INTERNATIONAL", invoiceNo: "INV-1025", date: "08/07/2026", amount: "890.00", ageing: "0-30" },
  { customer: "AADYAM LOGI SOLUTIONS", invoiceNo: "INV-1008", date: "20/06/2026", amount: "2,100.00", ageing: "31-60" },
];

const daysBetween = (from: string, to: string) => {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
};

export const Route = createFileRoute("/reports/ar-report")({
  head: () => ({
    meta: [
      { title: "AR Report — Reports — Courier ERP" },
      { name: "description", content: "Generate accounts receivable ledger reports." },
    ],
  }),
  component: ArReportPage,
});

function ArReportPage() {
  const [form, setForm] = useState<ArForm>(emptyForm);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [lookupOpen, setLookupOpen] = useState<LookupKey | null>(null);
  const [lookupField, setLookupField] = useState<LookupPairField | null>(null);

  const definition = useMemo(
    () => AR_REPORT_DEFINITIONS.find((report) => report.id === form.reportType) ?? AR_REPORT_DEFINITIONS[0],
    [form.reportType],
  );

  const patch = (updates: Partial<ArForm>) => setForm((current) => ({ ...current, ...updates }));

  const handleReportTypeChange = (reportType: string) => {
    setForm({ ...emptyForm(), reportType });
    setResults([]);
  };

  const validateDates = () => {
    if (!arHasDateRange(definition)) return true;
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

  const renderField = (key: ArFieldKey) => {
    if (key === "fromDate" || key === "toDate") {
      return (
        <FieldWrapper key={key} label={AR_FIELD_LABELS[key]}>
          <Input type="date" value={form[key]} onChange={(event) => patch({ [key]: event.target.value })} />
        </FieldWrapper>
      );
    }

    const lookup = AR_LOOKUP_FIELDS[key];
    if (lookup) {
      const pairKey = key as LookupPairField;
      return (
        <FieldWrapper key={key} label={AR_FIELD_LABELS[key]}>
          <LookupPairInput
            value={form[pairKey]}
            onChange={(value) => patch({ [pairKey]: value } as Partial<ArForm>)}
            onLookupOpen={() => {
              setLookupField(pairKey);
              setLookupOpen(lookup);
            }}
          />
        </FieldWrapper>
      );
    }

    if (key === "type") {
      return (
        <FieldWrapper key={key} label={AR_FIELD_LABELS.type}>
          <div className="flex gap-1">
            {(["details", "summary"] as const).map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={form.type === option ? "default" : "outline"}
                className={
                  form.type === option
                    ? "flex-1 bg-emerald-600 text-white hover:bg-emerald-600/90 capitalize"
                    : "flex-1 capitalize"
                }
                onClick={() => patch({ type: option })}
              >
                {option}
              </Button>
            ))}
          </div>
        </FieldWrapper>
      );
    }

    if (key === "transactionType") {
      const options = definition.transactionTypeOptions ?? AR_TRANSACTION_TYPES;
      return (
        <FieldWrapper key={key} label={AR_FIELD_LABELS.transactionType}>
          <Select value={form.transactionType} onValueChange={(value) => patch({ transactionType: value })}>
            <SelectTrigger>
              <SelectValue />
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

    if (key === "asOnDate" || key === "withZero") {
      return (
        <FieldWrapper key={key} label={AR_FIELD_LABELS[key]} className="justify-end">
          <div className="flex h-9 items-center gap-2">
            <Checkbox
              id={key}
              checked={form[key]}
              onCheckedChange={(value) => patch({ [key]: value === true } as Partial<ArForm>)}
            />
            <Label htmlFor={key} className="cursor-pointer text-sm font-normal">
              {AR_FIELD_LABELS[key]}
            </Label>
          </div>
        </FieldWrapper>
      );
    }

    return null;
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Reports", "AR Report"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">AR Report</h1>
        <p className="text-sm text-muted-foreground">
          Generate ledger ageing, ledger details, and outstanding AR reports.
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
                  {AR_REPORT_DEFINITIONS.map((report) => (
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
                  {["Customer", "Invoice No.", "Date", "Amount", "Ageing"].map((heading) => (
                    <TableHead key={heading} className="text-sidebar-foreground">
                      {heading}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.customer}</TableCell>
                    <TableCell>{row.invoiceNo}</TableCell>
                    <TableCell>{row.date}</TableCell>
                    <TableCell>{row.amount}</TableCell>
                    <TableCell>{row.ageing}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </table>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-8">
            <p className="text-sm text-destructive">Note : Report Period Limit - 31 Days</p>
            {definition.id === "ledger-details" ? (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="unBilled"
                  checked={form.unBilled}
                  onCheckedChange={(value) => patch({ unBilled: value === true })}
                />
                <Label htmlFor="unBilled" className="cursor-pointer text-sm font-normal">
                  Unbilled
                </Label>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-4">
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
            <Button onClick={handleSearch} className="min-w-24 bg-emerald-600 text-white hover:bg-emerald-600/90">
              Search
            </Button>
            <Button variant="destructive" onClick={handleReset} className="min-w-24">
              Reset
            </Button>
          </div>
        </div>
      </Card>

      <MasterLookupDialog
        open={Boolean(lookupOpen)}
        onOpenChange={(open) => {
          if (!open) {
            setLookupOpen(null);
            setLookupField(null);
          }
        }}
        lookup={lookupOpen ?? "customer"}
        returnField="code"
        onSelect={(_value, option: LookupOption) => {
          if (!lookupField) return;
          patch({ [lookupField]: { code: option.code, name: option.name } } as Partial<ArForm>);
        }}
      />
    </div>
  );
}

type LookupPairField = "customer" | "serviceCenter" | "salesExecutive" | "fieldExecutive";

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
        onClick={onLookupOpen}
      >
        <Search className="h-4 w-4" />
      </Button>
    </div>
  );
}
