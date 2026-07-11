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
import { FieldWrapper, MasterBreadcrumb } from "@/components/master-table-kit";
import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import { type LookupKey, type LookupOption } from "@/lib/master-lookups";
import {
  SCAN_CSB_TYPES,
  SCAN_FIELD_LABELS,
  SCAN_FORMAT_TYPES,
  SCAN_REPORT_DEFINITIONS,
  SCAN_TYPE_OPTIONS,
  type ScanFieldKey,
} from "@/lib/scan-report-config";

type LookupPair = { code: string; name: string };

type ScanForm = {
  reportType: string;
  fromManifestDate: string;
  toManifestDate: string;
  fromDate: string;
  toDate: string;
  fromBookingDate: string;
  toBookingDate: string;
  manifestNo: string;
  bagNo: string;
  serviceCenter: LookupPair;
  serviceType: LookupPair;
  origin: LookupPair;
  destination: LookupPair;
  customer: LookupPair;
  vendor: LookupPair;
  forwardingVendor: LookupPair;
  product: LookupPair;
  exception: LookupPair;
  status: string;
  formatType: string;
  csbType: string;
  awbNo: string;
  forwardingNo: string;
  invoiceNo: string;
  originalShipper: boolean;
  withClubAwbNo: boolean;
  type: string;
};

const emptyPair = (): LookupPair => ({ code: "", name: "" });
const todayIso = () => new Date().toISOString().slice(0, 10);

const emptyForm = (): ScanForm => ({
  reportType: "bag-wise-detail-print",
  fromManifestDate: todayIso(),
  toManifestDate: todayIso(),
  fromDate: todayIso(),
  toDate: todayIso(),
  fromBookingDate: todayIso(),
  toBookingDate: todayIso(),
  manifestNo: "",
  bagNo: "",
  serviceCenter: emptyPair(),
  serviceType: emptyPair(),
  origin: emptyPair(),
  destination: emptyPair(),
  customer: emptyPair(),
  vendor: emptyPair(),
  forwardingVendor: emptyPair(),
  product: emptyPair(),
  exception: emptyPair(),
  status: "All",
  formatType: "",
  csbType: "",
  awbNo: "",
  forwardingNo: "",
  invoiceNo: "",
  originalShipper: false,
  withClubAwbNo: false,
  type: SCAN_TYPE_OPTIONS[0],
});

export const Route = createFileRoute("/reports/scan")({
  head: () => ({
    meta: [
      { title: "Scan — Reports — Courier ERP" },
      { name: "description", content: "Print scan reports by manifest, product, and format." },
    ],
  }),
  component: ScanReportPage,
});

function ScanReportPage() {
  const [form, setForm] = useState<ScanForm>(emptyForm);
  const [lookupOpen, setLookupOpen] = useState<LookupKey | null>(null);
  const [lookupField, setLookupField] = useState<LookupPairField | null>(null);

  const definition = useMemo(
    () => SCAN_REPORT_DEFINITIONS.find((report) => report.id === form.reportType) ?? SCAN_REPORT_DEFINITIONS[0],
    [form.reportType],
  );

  const patch = (updates: Partial<ScanForm>) => setForm((current) => ({ ...current, ...updates }));

  const handleReportTypeChange = (reportType: string) => {
    const next = SCAN_REPORT_DEFINITIONS.find((report) => report.id === reportType);
    setForm({
      ...emptyForm(),
      reportType,
      type: next?.typeMode === "detailsSummary" ? "summary" : SCAN_TYPE_OPTIONS[0],
      status: next?.statusOptions?.[0] ?? "All",
    });
  };

  const handlePrint = () => {
    if (!form.manifestNo.trim()) {
      toast.error("Manifest No. is required");
      return;
    }
    toast.success(`${definition.label} print started`);
  };

  const handleSearch = () => {
    toast.success(`${definition.label} generated`);
  };

  const handleReset = () => {
    setForm(emptyForm());
    toast.success("Form reset");
  };

  const renderField = (key: ScanFieldKey) => {
    if (
      key === "fromManifestDate" ||
      key === "toManifestDate" ||
      key === "fromDate" ||
      key === "toDate" ||
      key === "fromBookingDate" ||
      key === "toBookingDate"
    ) {
      return (
        <FieldWrapper key={key} label={SCAN_FIELD_LABELS[key]}>
          <Input type="date" value={form[key]} onChange={(event) => patch({ [key]: event.target.value })} />
        </FieldWrapper>
      );
    }

    if (key === "manifestNo") {
      return (
        <FieldWrapper key={key} label={SCAN_FIELD_LABELS.manifestNo}>
          <Input value={form.manifestNo} onChange={(event) => patch({ manifestNo: event.target.value })} />
        </FieldWrapper>
      );
    }

    if (key === "bagNo") {
      return (
        <FieldWrapper key={key} label={SCAN_FIELD_LABELS.bagNo}>
          <Input value={form.bagNo} onChange={(event) => patch({ bagNo: event.target.value })} />
        </FieldWrapper>
      );
    }

    if (key === "awbNo" || key === "forwardingNo" || key === "invoiceNo") {
      return (
        <FieldWrapper key={key} label={SCAN_FIELD_LABELS[key]}>
          <Input value={form[key]} onChange={(event) => patch({ [key]: event.target.value })} />
        </FieldWrapper>
      );
    }

    const lookupMap: Partial<Record<ScanFieldKey, LookupKey>> = {
      serviceCenter: "serviceCentre",
      serviceType: "serviceType",
      origin: "destination",
      destination: "destination",
      customer: "customer",
      vendor: "vendor",
      forwardingVendor: "vendor",
      product: "product",
      exception: "exception",
    };

    const lookup = lookupMap[key];
    if (lookup) {
      const pairKey = key as LookupPairField;
      return (
        <FieldWrapper key={key} label={SCAN_FIELD_LABELS[key]}>
          <LookupPairInput
            lookup={lookup}
            value={form[pairKey]}
            onChange={(value) => patch({ [pairKey]: value } as Partial<ScanForm>)}
            onLookupOpen={() => {
              setLookupField(pairKey);
              setLookupOpen(lookup);
            }}
          />
        </FieldWrapper>
      );
    }

    if (key === "status") {
      const options = definition.statusOptions ?? ["All"];
      return (
        <FieldWrapper key={key} label={SCAN_FIELD_LABELS.status}>
          <Select value={form.status} onValueChange={(value) => patch({ status: value })}>
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

    if (key === "formatType") {
      return (
        <FieldWrapper key={key} label={SCAN_FIELD_LABELS.formatType}>
          <Select value={form.formatType || undefined} onValueChange={(value) => patch({ formatType: value })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCAN_FORMAT_TYPES.map((format) => (
                <SelectItem key={format} value={format}>
                  {format}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldWrapper>
      );
    }

    if (key === "csbType") {
      return (
        <FieldWrapper key={key} label={SCAN_FIELD_LABELS.csbType}>
          <Select value={form.csbType || undefined} onValueChange={(value) => patch({ csbType: value })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCAN_CSB_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldWrapper>
      );
    }

    if (key === "type") {
      const options = definition.typeMode === "detailsSummary" ? ["details", "summary"] : SCAN_TYPE_OPTIONS;
      return (
        <FieldWrapper key={key} label={SCAN_FIELD_LABELS.type}>
          <div className="flex gap-1">
            {options.map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={form.type === option ? "default" : "outline"}
                className={
                  form.type === option
                    ? "flex-1 bg-emerald-600 text-white hover:bg-emerald-600/90"
                    : "flex-1"
                }
                onClick={() => patch({ type: option })}
              >
                {definition.typeMode === "detailsSummary" ? option[0].toUpperCase() + option.slice(1) : option}
              </Button>
            ))}
          </div>
        </FieldWrapper>
      );
    }

    if (key === "originalShipper" || key === "withClubAwbNo") {
      return (
        <FieldWrapper key={key} label={SCAN_FIELD_LABELS[key]} className="justify-end">
          <div className="flex h-9 items-center gap-2">
            <Checkbox
              id={key}
              checked={form[key]}
              onCheckedChange={(value) => patch({ [key]: value === true } as Partial<ScanForm>)}
            />
            <Label htmlFor={key} className="cursor-pointer text-sm font-normal">
              {SCAN_FIELD_LABELS[key]}
            </Label>
          </div>
        </FieldWrapper>
      );
    }

    return null;
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Reports", "Scan"]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Scan</h1>
        <p className="text-sm text-muted-foreground">
          Print scan reports by manifest number, product, and format.
        </p>
      </div>

      <Card className="min-w-0 overflow-hidden border p-4 md:p-6">
        <div className="mb-4">
          <span className="inline-flex rounded-full bg-sidebar px-3 py-0.5 text-sm font-medium text-sidebar-foreground">
            Scan Report
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
                  {SCAN_REPORT_DEFINITIONS.map((report) => (
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

        {definition.action === "print" ? (
          <div className="mt-6 flex justify-end gap-3">
            <Button onClick={handlePrint} className="min-w-24 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90">
              Print
            </Button>
            <Button variant="destructive" onClick={handleReset} className="min-w-24">
              Reset
            </Button>
          </div>
        ) : (
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
                <Checkbox id="addToJobQueue" />
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
        )}
      </Card>

      <MasterLookupDialog
        open={Boolean(lookupOpen)}
        onOpenChange={(open) => {
          if (!open) {
            setLookupOpen(null);
            setLookupField(null);
          }
        }}
        lookup={lookupOpen ?? "product"}
        returnField="code"
        onSelect={(_value, option: LookupOption) => {
          if (!lookupField) return;
          patch({ [lookupField]: { code: option.code, name: option.name } } as Partial<ScanForm>);
        }}
      />
    </div>
  );
}

type LookupPairField =
  | "serviceCenter"
  | "serviceType"
  | "origin"
  | "destination"
  | "customer"
  | "vendor"
  | "forwardingVendor"
  | "product"
  | "exception";

function LookupPairInput({
  value,
  onChange,
  onLookupOpen,
}: {
  lookup: LookupKey;
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
