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
import { FieldWrapper, MasterBreadcrumb, downloadCsv } from "@/components/master-table-kit";
import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import { type LookupKey, type LookupOption } from "@/lib/master-lookups";
import {
  AWB_PRINT_TYPES,
  ACTION_LOG_AWB_ENTRY_REPORT,
  BRANCH_TYPES,
  CSB_TYPES,
  CUSTOMER_TYPES,
  DEMO_USERS,
  FIELD_LABELS,
  FORMAT_TYPES,
  LOG_TYPES,
  LOOKUP_FIELDS,
  PRODUCT_TYPES,
  REPORT_DEFINITIONS,
  SECONDARY_REPORT_TYPES,
  STATUS_OPTIONS,
  USER_TYPES,
  type ReportFieldKey,
} from "@/lib/operations-report-config";

type LookupPair = { code: string; name: string };

type ReportForm = {
  reportType: string;
  type: string;
  fromDate: string;
  toDate: string;
  customer: LookupPair;
  origin: LookupPair;
  serviceCenter: LookupPair;
  product: LookupPair;
  vendor: LookupPair;
  destination: LookupPair;
  zone: LookupPair;
  fieldExecutive: LookupPair;
  exception: LookupPair;
  paymentType: string;
  serviceType: string;
  fromAwb: string;
  toAwb: string;
  manifestNo: string;
  formatType: string;
  copies: string;
  csbType: string;
  printingForwardNo: boolean;
  comment: string;
  userType: string;
  user: string;
  logType: string;
  customerType: string;
  productType: string;
  branchType: string;
  status: string;
  secondaryReportType: string;
  forwardingLabelNotGenerated: boolean;
  awbNo: string;
  addToJobQueue: boolean;
};

type ResultRow = {
  id: string;
  awbNo: string;
  date: string;
  customer: string;
  origin: string;
  destination: string;
  status: string;
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const emptyPair = (): LookupPair => ({ code: "", name: "" });

const emptyForm = (): ReportForm => ({
  reportType: "comment-view",
  type: "details",
  fromDate: todayIso(),
  toDate: todayIso(),
  customer: emptyPair(),
  origin: emptyPair(),
  serviceCenter: emptyPair(),
  product: emptyPair(),
  vendor: emptyPair(),
  destination: emptyPair(),
  zone: emptyPair(),
  fieldExecutive: emptyPair(),
  exception: emptyPair(),
  paymentType: "",
  serviceType: "",
  fromAwb: "",
  toAwb: "",
  manifestNo: "",
  formatType: "",
  copies: "1",
  csbType: "",
  printingForwardNo: false,
  comment: "",
  userType: "",
  user: "",
  logType: "All",
  customerType: "",
  productType: "",
  branchType: "All",
  status: "All",
  secondaryReportType: "",
  forwardingLabelNotGenerated: false,
  awbNo: "",
  addToJobQueue: false,
});

const PAYMENT_TYPES = ["Cash", "Cheque", "Credit", "To Pay"] as const;
const SERVICE_TYPES = ["DOX", "SPX", "NDOX", "ENV"] as const;

const DEMO_RESULTS: Omit<ResultRow, "id">[] = [
  { awbNo: "30403918", date: "06/07/2026", customer: "GREEN COURIER", origin: "HYD", destination: "BOM", status: "Delivered" },
  { awbNo: "30403919", date: "06/07/2026", customer: "VASANTH INTERNATIONAL", origin: "HYD", destination: "DEL", status: "In Transit" },
  { awbNo: "30403920", date: "05/07/2026", customer: "AADYAM LOGI SOLUTIONS", origin: "BLR", destination: "MAA", status: "Pending" },
  { awbNo: "30403921", date: "05/07/2026", customer: "VAMSHI INTERNATIONAL", origin: "HYD", destination: "CCU", status: "Delivered" },
  { awbNo: "30403922", date: "04/07/2026", customer: "GREEN COURIER", origin: "DEL", destination: "HYD", status: "Undelivered" },
];

const daysBetween = (from: string, to: string) => {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
};

export const Route = createFileRoute("/reports/operations")({
  head: () => ({
    meta: [
      { title: "Operations — Reports — Courier ERP" },
      { name: "description", content: "Generate operational reports with filters and job queue support." },
    ],
  }),
  component: OperationsReportPage,
});

function OperationsReportPage() {
  const [form, setForm] = useState<ReportForm>(emptyForm);
  const [results, setResults] = useState<ResultRow[]>([]);

  const definition = useMemo(
    () => REPORT_DEFINITIONS.find((r) => r.id === form.reportType) ?? REPORT_DEFINITIONS[2],
    [form.reportType],
  );

  const actionLogExtraFields = useMemo((): ReportFieldKey[] => {
    if (form.reportType !== "action-log") return [];
    if (form.secondaryReportType === ACTION_LOG_AWB_ENTRY_REPORT) return ["awbNo"];
    return [];
  }, [form.reportType, form.secondaryReportType]);

  const patch = (updates: Partial<ReportForm>) => setForm((f) => ({ ...f, ...updates }));

  const handleReportTypeChange = (reportType: string) => {
    const next = REPORT_DEFINITIONS.find((r) => r.id === reportType);
    setForm({
      ...emptyForm(),
      reportType,
      type: next?.typeMode === "awbPrint" ? AWB_PRINT_TYPES[0] : "details",
      logType: next?.logTypeOptions?.[0] ?? "All",
      userType: next?.userTypeOptions?.[0] ?? "",
    });
    setResults([]);
  };

  const validateDates = (): boolean => {
    if (!definition.fields.includes("fromDate")) return true;
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

  const handleDownload = () => {
    downloadCsv(
      `${definition.id}.csv`,
      ["AWB No.", "Date", "Customer", "Origin", "Destination", "Status"],
      DEMO_RESULTS.map((row) => [row.awbNo, row.date, row.customer, row.origin, row.destination, row.status]),
    );
    if (form.addToJobQueue) {
      toast.success(`${definition.label} added to job queue`);
    } else {
      toast.success(`${definition.label} download started`);
    }
  };

  const handleReset = () => {
    setForm(emptyForm());
    setResults([]);
    toast.success("Form reset");
  };

  const renderField = (key: ReportFieldKey) => {
    if (key === "type") {
      if (definition.typeMode === "awbPrint") {
        return (
          <FieldWrapper key={key} label={FIELD_LABELS.type}>
            <Select value={form.type} onValueChange={(v) => patch({ type: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AWB_PRINT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldWrapper>
        );
      }
      return (
        <FieldWrapper key={key} label={FIELD_LABELS.type}>
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
        <FieldWrapper key={key} label={FIELD_LABELS[key]}>
          <Input type="date" value={form[key]} onChange={(e) => patch({ [key]: e.target.value })} />
        </FieldWrapper>
      );
    }

    const lookup = LOOKUP_FIELDS[key];
    if (lookup) {
      return (
        <FieldWrapper key={key} label={FIELD_LABELS[key]}>
          <LookupPairInput
            lookup={lookup}
            value={form[key] as LookupPair}
            onChange={(value) => patch({ [key]: value } as Partial<ReportForm>)}
          />
        </FieldWrapper>
      );
    }

    if (key === "paymentType") {
      return (
        <FieldWrapper key={key} label={FIELD_LABELS.paymentType}>
          <Select value={form.paymentType || undefined} onValueChange={(v) => patch({ paymentType: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Select Payment Type" />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldWrapper>
      );
    }

    if (key === "serviceType") {
      return (
        <FieldWrapper key={key} label={FIELD_LABELS.serviceType}>
          <Select value={form.serviceType || undefined} onValueChange={(v) => patch({ serviceType: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Select Service Type" />
            </SelectTrigger>
            <SelectContent>
              {SERVICE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldWrapper>
      );
    }

    if (key === "formatType") {
      return (
        <FieldWrapper key={key} label={FIELD_LABELS.formatType}>
          <Select value={form.formatType || undefined} onValueChange={(v) => patch({ formatType: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Select Format Type" />
            </SelectTrigger>
            <SelectContent>
              {FORMAT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldWrapper>
      );
    }

    if (key === "csbType") {
      return (
        <FieldWrapper key={key} label={FIELD_LABELS.csbType}>
          <Select value={form.csbType || undefined} onValueChange={(v) => patch({ csbType: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Select CSB Type" />
            </SelectTrigger>
            <SelectContent>
              {CSB_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldWrapper>
      );
    }

    if (key === "userType") {
      const options = definition.userTypeOptions ?? USER_TYPES;
      return (
        <FieldWrapper key={key} label={FIELD_LABELS.userType}>
          <Select value={form.userType || undefined} onValueChange={(v) => patch({ userType: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Select User Type" />
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

    if (key === "user") {
      const options = definition.userOptions ?? DEMO_USERS;
      return (
        <FieldWrapper key={key} label={FIELD_LABELS.user}>
          <Select value={form.user || undefined} onValueChange={(v) => patch({ user: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Select User" />
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

    if (key === "logType") {
      const options = definition.logTypeOptions ?? LOG_TYPES;
      return (
        <FieldWrapper key={key} label={FIELD_LABELS.logType}>
          <Select value={form.logType} onValueChange={(v) => patch({ logType: v })}>
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

    if (key === "customerType") {
      const options = definition.customerTypeOptions ?? CUSTOMER_TYPES;
      return (
        <FieldWrapper key={key} label={FIELD_LABELS.customerType}>
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

    if (key === "productType") {
      const options = definition.productTypeOptions ?? PRODUCT_TYPES;
      return (
        <FieldWrapper key={key} label={FIELD_LABELS.productType}>
          <Select value={form.productType || undefined} onValueChange={(v) => patch({ productType: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Select Product Type" />
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

    if (key === "branchType") {
      const options = definition.branchTypeOptions ?? BRANCH_TYPES;
      return (
        <FieldWrapper key={key} label={FIELD_LABELS.branchType}>
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

    if (key === "status") {
      const options = definition.statusOptions ?? STATUS_OPTIONS;
      return (
        <FieldWrapper key={key} label={FIELD_LABELS.status}>
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

    if (key === "secondaryReportType") {
      const options = definition.secondaryReportTypeOptions ?? SECONDARY_REPORT_TYPES;
      return (
        <FieldWrapper key={key} label={FIELD_LABELS.secondaryReportType}>
          <Select
            value={form.secondaryReportType || undefined}
            onValueChange={(v) => patch({ secondaryReportType: v, awbNo: "" })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select Report Type" />
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

    if (key === "printingForwardNo" || key === "forwardingLabelNotGenerated") {
      const checked = form[key];
      return (
        <FieldWrapper key={key} label={FIELD_LABELS[key]} className="justify-end">
          <div className="flex h-9 items-center gap-2">
            <Checkbox
              id={key}
              checked={checked}
              onCheckedChange={(value) => patch({ [key]: value === true } as Partial<ReportForm>)}
            />
            <Label htmlFor={key} className="cursor-pointer text-sm font-normal">
              {FIELD_LABELS[key]}
            </Label>
          </div>
        </FieldWrapper>
      );
    }

    const textKeys: ReportFieldKey[] = ["fromAwb", "toAwb", "manifestNo", "copies", "comment", "awbNo"];
    if (textKeys.includes(key)) {
      return (
        <FieldWrapper key={key} label={FIELD_LABELS[key]}>
          <Input
            value={form[key] as string}
            onChange={(e) => patch({ [key]: e.target.value } as Partial<ReportForm>)}
            inputMode={key === "copies" ? "numeric" : undefined}
          />
        </FieldWrapper>
      );
    }

    return null;
  };

  const fieldColClass = (key: ReportFieldKey) => {
    const span = definition.colSpans?.[key];
    if (span === 3) return "md:col-span-2 xl:col-span-3";
    if (span === 2) return "md:col-span-2";
    return undefined;
  };

  const renderFieldCell = (key: ReportFieldKey) => {
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
      <MasterBreadcrumb trail={["Reports", "Operations"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Operations</h1>
        <p className="text-sm text-muted-foreground">
          Generate operational reports with date range, lookup filters, and job queue support.
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
                  {REPORT_DEFINITIONS.map((report) => (
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

          {actionLogExtraFields.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {actionLogExtraFields.map((field) => renderFieldCell(field))}
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
                  {["AWB No.", "Date", "Customer", "Origin", "Destination", "Status"].map((h) => (
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
                    <TableCell>{row.status}</TableCell>
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
            {definition.action === "download" ? (
              <Button
                onClick={handleDownload}
                className="min-w-24 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
              >
                Download
              </Button>
            ) : (
              <Button
                onClick={handleSearch}
                className="min-w-24 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
              >
                Search
              </Button>
            )}
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
