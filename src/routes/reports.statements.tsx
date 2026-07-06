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
  AWB_STOCK_STATUS,
  BUSINESS_CHANNELS,
  OBC_BRANCH_TYPES,
  OBC_FILTER_TYPES,
  OBC_FLIGHT_TYPES,
  OBC_VENDOR_TYPES,
  SALES_EXECUTIVE_REPORT_TYPES,
  STATEMENT_CUSTOMER_TYPES,
  STATEMENT_DEFINITIONS,
  STATEMENT_FIELD_LABELS,
  STATEMENT_LOOKUP_FIELDS,
  STATEMENT_PRODUCT_TYPES,
  SUMMARY_OPTIONS,
  statementHasDateRange,
  type StatementFieldKey,
} from "@/lib/statements-report-config";

type LookupPair = { code: string; name: string };

type StatementForm = {
  reportType: string;
  type: string;
  fromDate: string;
  toDate: string;
  customer: LookupPair;
  origin: LookupPair;
  serviceCenter: LookupPair;
  product: LookupPair;
  serviceType: LookupPair;
  vendor: LookupPair;
  destination: LookupPair;
  state: LookupPair;
  salesExecutive: LookupPair;
  obc: LookupPair;
  paymentType: LookupPair;
  customerType: string;
  productType: string;
  businessChannel: string;
  status: string;
  summary: string;
  filterType: string;
  branchType: string;
  vendorType: string;
  flightType: string;
  secondaryReportType: string;
  obcReport: boolean;
  addToJobQueue: boolean;
};

type ResultRow = {
  id: string;
  awbNo: string;
  date: string;
  customer: string;
  origin: string;
  destination: string;
  amount: string;
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const emptyPair = (): LookupPair => ({ code: "", name: "" });

const emptyForm = (): StatementForm => ({
  reportType: "cash-collection",
  type: "details",
  fromDate: todayIso(),
  toDate: todayIso(),
  customer: emptyPair(),
  origin: emptyPair(),
  serviceCenter: emptyPair(),
  product: emptyPair(),
  serviceType: emptyPair(),
  vendor: emptyPair(),
  destination: emptyPair(),
  state: emptyPair(),
  salesExecutive: emptyPair(),
  obc: emptyPair(),
  paymentType: emptyPair(),
  customerType: "",
  productType: "",
  businessChannel: "",
  status: "All",
  summary: "",
  filterType: "All",
  branchType: "All",
  vendorType: "",
  flightType: "",
  secondaryReportType: "",
  obcReport: false,
  addToJobQueue: false,
});

const DEMO_RESULTS: Omit<ResultRow, "id">[] = [
  { awbNo: "30403918", date: "06/07/2026", customer: "GREEN COURIER", origin: "HYD", destination: "BOM", amount: "1,250.00" },
  { awbNo: "30403919", date: "06/07/2026", customer: "VASANTH INTERNATIONAL", origin: "HYD", destination: "DEL", amount: "890.00" },
  { awbNo: "30403920", date: "05/07/2026", customer: "AADYAM LOGI SOLUTIONS", origin: "BLR", destination: "MAA", amount: "2,100.00" },
  { awbNo: "30403921", date: "05/07/2026", customer: "VAMSHI INTERNATIONAL", origin: "HYD", destination: "CCU", amount: "675.00" },
  { awbNo: "30403922", date: "04/07/2026", customer: "GREEN COURIER", origin: "DEL", destination: "HYD", amount: "1,480.00" },
];

const daysBetween = (from: string, to: string) => {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
};

export const Route = createFileRoute("/reports/statements")({
  head: () => ({
    meta: [
      { title: "Statements — Reports — Courier ERP" },
      { name: "description", content: "Generate statement reports with filters and job queue support." },
    ],
  }),
  component: StatementsReportPage,
});

function StatementsReportPage() {
  const [form, setForm] = useState<StatementForm>(emptyForm);
  const [results, setResults] = useState<ResultRow[]>([]);

  const definition = useMemo(
    () => STATEMENT_DEFINITIONS.find((r) => r.id === form.reportType) ?? STATEMENT_DEFINITIONS[0],
    [form.reportType],
  );

  const showPeriodNote = statementHasDateRange(definition);

  const patch = (updates: Partial<StatementForm>) => setForm((f) => ({ ...f, ...updates }));

  const handleReportTypeChange = (reportType: string) => {
    const next = STATEMENT_DEFINITIONS.find((r) => r.id === reportType);
    setForm({
      ...emptyForm(),
      reportType,
      type: "details",
      status: next?.statusOptions?.[0] ?? "All",
      filterType: next?.filterTypeOptions?.[0] ?? "All",
      branchType: next?.branchTypeOptions?.[0] ?? "All",
      secondaryReportType: next?.secondaryReportTypeOptions?.[0] ?? "",
    });
    setResults([]);
  };

  const validateDates = (): boolean => {
    if (!statementHasDateRange(definition)) return true;
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

  const renderField = (key: StatementFieldKey) => {
    if (key === "type") {
      return (
        <FieldWrapper key={key} label={STATEMENT_FIELD_LABELS.type}>
          <div className="flex gap-1">
            {(["details", "summary"] as const).map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={form.type === value ? "default" : "outline"}
                className={
                  form.type === value
                    ? "flex-1 bg-emerald-600 text-white hover:bg-emerald-600/90 capitalize"
                    : "flex-1 capitalize"
                }
                onClick={() => patch({ type: value })}
              >
                {value}
              </Button>
            ))}
          </div>
        </FieldWrapper>
      );
    }

    if (key === "fromDate" || key === "toDate") {
      return (
        <FieldWrapper key={key} label={STATEMENT_FIELD_LABELS[key]}>
          <Input type="date" value={form[key]} onChange={(e) => patch({ [key]: e.target.value })} />
        </FieldWrapper>
      );
    }

    const lookup = STATEMENT_LOOKUP_FIELDS[key];
    if (lookup) {
      return (
        <FieldWrapper key={key} label={STATEMENT_FIELD_LABELS[key]}>
          <LookupPairInput
            lookup={lookup}
            value={form[key] as LookupPair}
            onChange={(value) => patch({ [key]: value } as Partial<StatementForm>)}
          />
        </FieldWrapper>
      );
    }

    if (key === "customerType") {
      const options = definition.customerTypeOptions ?? STATEMENT_CUSTOMER_TYPES;
      return (
        <FieldWrapper key={key} label={STATEMENT_FIELD_LABELS.customerType}>
          <Select value={form.customerType || undefined} onValueChange={(v) => patch({ customerType: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Select Customer Type" />
            </SelectTrigger>
            <SelectContent>
              {options.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldWrapper>
      );
    }

    if (key === "businessChannel") {
      const options = definition.businessChannelOptions ?? BUSINESS_CHANNELS;
      return (
        <FieldWrapper key={key} label={STATEMENT_FIELD_LABELS.businessChannel}>
          <Select value={form.businessChannel || undefined} onValueChange={(v) => patch({ businessChannel: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Select Business Type" />
            </SelectTrigger>
            <SelectContent>
              {options.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldWrapper>
      );
    }

    if (key === "productType") {
      const options = definition.productTypeOptions ?? STATEMENT_PRODUCT_TYPES;
      const placeholder =
        definition.id === "obc-report-checklist" ? "Select Product Type" : "Select Type";
      return (
        <FieldWrapper key={key} label={STATEMENT_FIELD_LABELS.productType}>
          <Select value={form.productType || undefined} onValueChange={(v) => patch({ productType: v })}>
            <SelectTrigger>
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {options.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldWrapper>
      );
    }

    if (key === "status") {
      const options = definition.statusOptions ?? AWB_STOCK_STATUS;
      return (
        <FieldWrapper key={key} label={STATEMENT_FIELD_LABELS.status}>
          <Select value={form.status} onValueChange={(v) => patch({ status: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldWrapper>
      );
    }

    if (key === "summary") {
      const options = definition.summaryOptions ?? SUMMARY_OPTIONS;
      return (
        <FieldWrapper key={key} label={STATEMENT_FIELD_LABELS.summary}>
          <Select value={form.summary || undefined} onValueChange={(v) => patch({ summary: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Select Summary on" />
            </SelectTrigger>
            <SelectContent>
              {options.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldWrapper>
      );
    }

    if (key === "filterType") {
      const options = definition.filterTypeOptions ?? OBC_FILTER_TYPES;
      return (
        <FieldWrapper key={key} label={STATEMENT_FIELD_LABELS.filterType}>
          <Select value={form.filterType} onValueChange={(v) => patch({ filterType: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {options.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldWrapper>
      );
    }

    if (key === "branchType") {
      const options = definition.branchTypeOptions ?? OBC_BRANCH_TYPES;
      return (
        <FieldWrapper key={key} label={STATEMENT_FIELD_LABELS.branchType}>
          <Select value={form.branchType} onValueChange={(v) => patch({ branchType: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldWrapper>
      );
    }

    if (key === "vendorType") {
      const options = definition.vendorTypeOptions ?? OBC_VENDOR_TYPES;
      return (
        <FieldWrapper key={key} label={STATEMENT_FIELD_LABELS.vendorType}>
          <Select value={form.vendorType || undefined} onValueChange={(v) => patch({ vendorType: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Select Vendor Type" />
            </SelectTrigger>
            <SelectContent>
              {options.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldWrapper>
      );
    }

    if (key === "flightType") {
      const options = definition.flightTypeOptions ?? OBC_FLIGHT_TYPES;
      return (
        <FieldWrapper key={key} label={STATEMENT_FIELD_LABELS.flightType}>
          <Select value={form.flightType || undefined} onValueChange={(v) => patch({ flightType: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Select Flight Type" />
            </SelectTrigger>
            <SelectContent>
              {options.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldWrapper>
      );
    }

    if (key === "obcReport") {
      return (
        <FieldWrapper key={key} label={STATEMENT_FIELD_LABELS.obcReport} className="justify-end">
          <div className="flex h-9 items-center gap-2">
            <Checkbox
              id="obcReport"
              checked={form.obcReport}
              onCheckedChange={(value) => patch({ obcReport: value === true })}
            />
            <Label htmlFor="obcReport" className="cursor-pointer text-sm font-normal">
              {STATEMENT_FIELD_LABELS.obcReport}
            </Label>
          </div>
        </FieldWrapper>
      );
    }

    if (key === "secondaryReportType") {
      const options = definition.secondaryReportTypeOptions ?? SALES_EXECUTIVE_REPORT_TYPES;
      return (
        <FieldWrapper key={key} label={STATEMENT_FIELD_LABELS.secondaryReportType}>
          <Select
            value={form.secondaryReportType || undefined}
            onValueChange={(v) => patch({ secondaryReportType: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select Report Type" />
            </SelectTrigger>
            <SelectContent>
              {options.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldWrapper>
      );
    }

    return null;
  };

  const fieldColClass = (key: StatementFieldKey) => {
    const span = definition.colSpans?.[key];
    if (span === 3) return "md:col-span-2 xl:col-span-3";
    if (span === 2) return "md:col-span-2";
    return undefined;
  };

  const renderFieldCell = (key: StatementFieldKey) => {
    const className = fieldColClass(key);
    const field = renderField(key);
    if (!className) return field;
    return (
      <div key={key} className={className}>
        {field}
      </div>
    );
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Reports", "Statements"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Statements</h1>
        <p className="text-sm text-muted-foreground">
          Generate statement reports with date range, lookup filters, and job queue support.
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
                  {STATEMENT_DEFINITIONS.map((report) => (
                    <SelectItem key={report.id} value={report.id}>
                      {report.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>
            {definition.fields.map((field) => renderFieldCell(field))}
          </div>

          {definition.secondRowFields?.length ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {definition.secondRowFields.map((field) => renderFieldCell(field))}
            </div>
          ) : null}

          {definition.extraRows?.map((row, index) => (
            <div key={`extra-row-${index}`} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {row.map((field) => renderFieldCell(field))}
            </div>
          ))}
        </div>

        {results.length > 0 ? (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[720px] caption-bottom text-sm">
              <TableHeader>
                <TableRow className="bg-sidebar hover:bg-sidebar">
                  {["AWB No.", "Date", "Customer", "Origin", "Destination", "Amount"].map((h) => (
                    <TableHead key={h} className="text-sidebar-foreground">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.awbNo}</TableCell>
                    <TableCell>{row.date}</TableCell>
                    <TableCell>{row.customer}</TableCell>
                    <TableCell>{row.origin}</TableCell>
                    <TableCell>{row.destination}</TableCell>
                    <TableCell>{row.amount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </table>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {showPeriodNote ? (
            <p className="text-sm text-destructive">Note : Report Period Limit - 31 Days</p>
          ) : (
            <span />
          )}
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
            <Button
              onClick={handleSearch}
              className="min-w-24 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
            >
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
  onChange: (v: LookupPair) => void;
  lookup: LookupKey;
}) {
  const [lookupOpen, setLookupOpen] = useState(false);

  return (
    <>
      <div className="flex gap-1">
        <Input
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          className="min-w-0 flex-1"
          placeholder="Name"
        />
        <Input
          value={value.code}
          onChange={(e) => onChange({ ...value, code: e.target.value })}
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
        onSelect={(_v, option: LookupOption) => onChange({ code: option.code, name: option.name })}
      />
    </>
  );
}
