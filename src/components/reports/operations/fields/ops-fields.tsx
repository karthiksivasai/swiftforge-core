import type { ReactNode } from "react";
import { useState } from "react";
import { Search } from "lucide-react";

import { MasterLookupDialog } from "@/components/master-lookup-dialog";
import { FieldWrapper } from "@/components/master-table-kit";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type LookupKey, type LookupOption } from "@/lib/master-lookups";
import { FIELD_LABELS, LOOKUP_FIELDS, type ReportFieldKey } from "@/lib/operations-report-config";

import type { OperationsReportForm, OpsLookupPair } from "@/components/reports/operations/types";

export function OpsDateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <FieldWrapper label={label}>
      <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </FieldWrapper>
  );
}

export function OpsTextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <FieldWrapper label={label}>
      <Input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </FieldWrapper>
  );
}

export function OpsSelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder: string;
}) {
  return (
    <FieldWrapper label={label}>
      <Select value={value || undefined} onValueChange={onChange}>
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
}

export function OpsLookupPairField({
  label,
  value,
  onChange,
  lookup,
}: {
  label: string;
  value: OpsLookupPair;
  onChange: (v: OpsLookupPair) => void;
  lookup: LookupKey;
}) {
  const [open, setOpen] = useState(false);
  return (
    <FieldWrapper label={label}>
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
          type="button"
          size="icon"
          variant="outline"
          className="h-9 w-9 shrink-0 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
          aria-label={`Search ${label}`}
          onClick={() => setOpen(true)}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>
      <MasterLookupDialog
        open={open}
        onOpenChange={setOpen}
        lookup={lookup}
        returnField="code"
        onSelect={(_v, option: LookupOption) => onChange({ code: option.code, name: option.name })}
      />
    </FieldWrapper>
  );
}

export function OpsDetailsSummaryToggle({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const details = value === "Summary" ? "Summary" : "Details";
  return (
    <FieldWrapper label="Type">
      <div className="flex h-9 overflow-hidden rounded-md border">
        {(["Details", "Summary"] as const).map((opt) => (
          <button
            key={opt}
            type="button"
            className={`flex-1 px-3 text-sm font-medium transition-colors ${
              details === opt
                ? "bg-emerald-700 text-white"
                : "bg-background text-muted-foreground hover:bg-muted"
            }`}
            onClick={() => onChange(opt)}
          >
            {opt}
          </button>
        ))}
      </div>
    </FieldWrapper>
  );
}

export function OpsCheckboxField({
  label,
  checked,
  onChange,
  id,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  id: string;
}) {
  return (
    <FieldWrapper label={label}>
      <div className="flex h-9 items-center gap-2">
        <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
        <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
          {label}
        </Label>
      </div>
    </FieldWrapper>
  );
}

export function OpsGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 ${className ?? ""}`}>
      {children}
    </div>
  );
}

type FieldRenderOpts = {
  form: OperationsReportForm;
  patch: (p: Partial<OperationsReportForm>) => void;
  secondaryReportTypeOptions?: readonly string[];
  logTypeOptions?: readonly string[];
  customerTypeOptions?: readonly string[];
  statusOptions?: readonly string[];
  userTypeOptions?: readonly string[];
  userOptions?: readonly string[];
  productTypeOptions?: readonly string[];
  branchTypeOptions?: readonly string[];
  typeMode?: "detailsSummary" | "awbPrint";
  awbPrintTypes?: readonly string[];
  formatTypes?: readonly string[];
  csbTypes?: readonly string[];
  colSpan?: number;
};

export function OpsReportField({ field, opts }: { field: ReportFieldKey; opts: FieldRenderOpts }) {
  const { form, patch } = opts;
  const label = FIELD_LABELS[field];
  const spanClass = opts.colSpan && opts.colSpan > 1 ? `xl:col-span-${opts.colSpan}` : undefined;
  // Tailwind needs full class names — use explicit map for common spans
  const wrap = (node: ReactNode) =>
    opts.colSpan === 3 ? <div className="xl:col-span-3">{node}</div> : node;

  if (field === "fromDate") {
    return wrap(
      <OpsDateField
        label={label}
        value={form.fromDate}
        onChange={(fromDate) => patch({ fromDate })}
      />,
    );
  }
  if (field === "toDate") {
    return wrap(
      <OpsDateField label={label} value={form.toDate} onChange={(toDate) => patch({ toDate })} />,
    );
  }
  if (field === "type") {
    if (opts.typeMode === "detailsSummary") {
      return wrap(
        <OpsDetailsSummaryToggle value={form.type} onChange={(type) => patch({ type })} />,
      );
    }
    if (opts.typeMode === "awbPrint") {
      return wrap(
        <OpsSelectField
          label={label}
          value={form.type}
          onChange={(type) => patch({ type })}
          options={opts.awbPrintTypes ?? ["AWB No. wise", "Date wise", "Invoice wise"]}
          placeholder="Select Type"
        />,
      );
    }
    return wrap(<OpsDetailsSummaryToggle value={form.type} onChange={(type) => patch({ type })} />);
  }

  const lookup = LOOKUP_FIELDS[field];
  if (lookup) {
    const key = field as keyof OperationsReportForm;
    const pair = form[key] as OpsLookupPair;
    return wrap(
      <OpsLookupPairField
        label={label}
        value={pair}
        onChange={(v) => patch({ [key]: v } as Partial<OperationsReportForm>)}
        lookup={lookup}
      />,
    );
  }

  if (field === "paymentType") {
    return wrap(
      <OpsLookupPairField
        label={label}
        value={form.paymentType}
        onChange={(paymentType) => patch({ paymentType })}
        lookup="paymentType"
      />,
    );
  }
  if (field === "serviceType") {
    return wrap(
      <OpsLookupPairField
        label={label}
        value={form.serviceType}
        onChange={(serviceType) => patch({ serviceType })}
        lookup="serviceType"
      />,
    );
  }

  if (field === "secondaryReportType") {
    return wrap(
      <OpsSelectField
        label={label}
        value={form.secondaryReportType}
        onChange={(secondaryReportType) => patch({ secondaryReportType })}
        options={opts.secondaryReportTypeOptions ?? []}
        placeholder="Select Report Type"
      />,
    );
  }
  if (field === "logType") {
    return wrap(
      <OpsSelectField
        label={label}
        value={form.logType}
        onChange={(logType) => patch({ logType })}
        options={opts.logTypeOptions ?? ["All"]}
        placeholder="Select Log Type"
      />,
    );
  }
  if (field === "customerType") {
    return wrap(
      <OpsSelectField
        label={label}
        value={form.customerType}
        onChange={(customerType) => patch({ customerType })}
        options={opts.customerTypeOptions ?? []}
        placeholder="Select Customer Type"
      />,
    );
  }
  if (field === "status") {
    return wrap(
      <OpsSelectField
        label={label}
        value={form.status}
        onChange={(status) => patch({ status })}
        options={opts.statusOptions ?? ["All"]}
        placeholder="Select Status"
      />,
    );
  }
  if (field === "userType") {
    return wrap(
      <OpsSelectField
        label={label}
        value={form.userType}
        onChange={(userType) => patch({ userType })}
        options={opts.userTypeOptions ?? []}
        placeholder="Select User Type"
      />,
    );
  }
  if (field === "user") {
    return wrap(
      <OpsSelectField
        label={label}
        value={form.user}
        onChange={(user) => patch({ user })}
        options={opts.userOptions ?? []}
        placeholder="Select User"
      />,
    );
  }
  if (field === "productType") {
    return wrap(
      <OpsSelectField
        label={label}
        value={form.productType}
        onChange={(productType) => patch({ productType })}
        options={opts.productTypeOptions ?? []}
        placeholder="Select Product Type"
      />,
    );
  }
  if (field === "branchType") {
    return wrap(
      <OpsSelectField
        label={label}
        value={form.branchType}
        onChange={(branchType) => patch({ branchType })}
        options={opts.branchTypeOptions ?? ["All"]}
        placeholder="Select Branch Type"
      />,
    );
  }
  if (field === "formatType") {
    return wrap(
      <OpsSelectField
        label={label}
        value={form.formatType}
        onChange={(formatType) => patch({ formatType })}
        options={opts.formatTypes ?? ["Label", "PDF", "Excel"]}
        placeholder="Select Format Type"
      />,
    );
  }
  if (field === "csbType") {
    return wrap(
      <OpsSelectField
        label={label}
        value={form.csbType}
        onChange={(csbType) => patch({ csbType })}
        options={opts.csbTypes ?? []}
        placeholder="Select CSB Type"
      />,
    );
  }
  if (field === "forwardingLabelNotGenerated") {
    return wrap(
      <OpsCheckboxField
        id="forwardingLabelNotGenerated"
        label={label}
        checked={form.forwardingLabelNotGenerated}
        onChange={(forwardingLabelNotGenerated) => patch({ forwardingLabelNotGenerated })}
      />,
    );
  }

  const textKeys: ReportFieldKey[] = [
    "fromAwb",
    "toAwb",
    "manifestNo",
    "copies",
    "printingForwardNo",
    "comment",
    "awbNo",
  ];
  if (textKeys.includes(field)) {
    const key = field as keyof OperationsReportForm;
    return wrap(
      <OpsTextField
        label={label}
        value={String(form[key] ?? "")}
        onChange={(v) => patch({ [key]: v } as Partial<OperationsReportForm>)}
      />,
    );
  }

  void spanClass;
  return null;
}
