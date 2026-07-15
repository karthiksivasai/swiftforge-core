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
import {
  STATEMENT_FIELD_LABELS,
  STATEMENT_LOOKUP_FIELDS,
  type StatementFieldKey,
  type StatementReportDefinition,
} from "@/lib/statements-report-config";

import type { StatementsReportForm, StmtLookupPair } from "@/components/reports/statements/types";

export function StmtGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 ${className ?? ""}`}>
      {children}
    </div>
  );
}

function StmtDateField({
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

function StmtTextField({
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
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </FieldWrapper>
  );
}

function StmtSelectField({
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

function StmtLookupPairField({
  label,
  value,
  onChange,
  lookup,
}: {
  label: string;
  value: StmtLookupPair;
  onChange: (v: StmtLookupPair) => void;
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

function DetailsSummaryToggle({
  value,
  onChange,
  modes,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  modes: readonly string[];
  label: string;
}) {
  return (
    <FieldWrapper label={label}>
      <div className="flex h-9 overflow-hidden rounded-md border">
        {modes.map((opt) => (
          <button
            key={opt}
            type="button"
            className={`flex-1 px-2 text-sm font-medium transition-colors ${
              value === opt
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

type FieldRenderOpts = {
  form: StatementsReportForm;
  patch: (p: Partial<StatementsReportForm>) => void;
  def: StatementReportDefinition;
};

export function StmtReportField({
  field,
  opts,
}: {
  field: StatementFieldKey;
  opts: FieldRenderOpts;
}) {
  const { form, patch, def } = opts;
  const label = STATEMENT_FIELD_LABELS[field];
  const wrap = (node: ReactNode) =>
    def.colSpans?.[field] === 3 ? <div className="xl:col-span-3">{node}</div> : node;

  if (field === "fromDate") {
    return wrap(
      <StmtDateField
        label={label}
        value={form.fromDate}
        onChange={(fromDate) => patch({ fromDate })}
      />,
    );
  }
  if (field === "toDate") {
    return wrap(
      <StmtDateField label={label} value={form.toDate} onChange={(toDate) => patch({ toDate })} />,
    );
  }

  if (field === "type") {
    if (def.typeMode === "reportDetailsSummary") {
      const modes = ["Report", "Details", "Summary"] as const;
      const current = modes.includes(form.type as (typeof modes)[number]) ? form.type : "Details";
      return wrap(
        <DetailsSummaryToggle
          label={label}
          value={current}
          onChange={(type) => patch({ type })}
          modes={modes}
        />,
      );
    }
    return wrap(
      <DetailsSummaryToggle
        label={label}
        value={form.type === "Summary" ? "Summary" : "Details"}
        onChange={(type) => patch({ type })}
        modes={["Details", "Summary"]}
      />,
    );
  }

  const lookup = STATEMENT_LOOKUP_FIELDS[field] as LookupKey | undefined;
  if (lookup) {
    const key = field as keyof StatementsReportForm;
    const pair = form[key] as StmtLookupPair;
    return wrap(
      <StmtLookupPairField
        label={label}
        value={pair}
        onChange={(v) => patch({ [key]: v } as Partial<StatementsReportForm>)}
        lookup={lookup}
      />,
    );
  }

  if (field === "customerType") {
    return wrap(
      <StmtSelectField
        label={label}
        value={form.customerType}
        onChange={(customerType) => patch({ customerType })}
        options={def.customerTypeOptions ?? []}
        placeholder="Select Customer Type"
      />,
    );
  }
  if (field === "businessChannel") {
    return wrap(
      <StmtSelectField
        label={label}
        value={form.businessChannel}
        onChange={(businessChannel) => patch({ businessChannel })}
        options={def.businessChannelOptions ?? []}
        placeholder="Select Business Type"
      />,
    );
  }
  if (field === "productType") {
    return wrap(
      <StmtSelectField
        label={label}
        value={form.productType}
        onChange={(productType) => patch({ productType })}
        options={def.productTypeOptions ?? []}
        placeholder="Select Product Type"
      />,
    );
  }
  if (field === "status") {
    return wrap(
      <StmtSelectField
        label={label}
        value={form.status}
        onChange={(status) => patch({ status })}
        options={def.statusOptions ?? ["All"]}
        placeholder="Select Status"
      />,
    );
  }
  if (field === "summary") {
    return wrap(
      <StmtSelectField
        label={label}
        value={form.summary}
        onChange={(summary) => patch({ summary })}
        options={def.summaryOptions ?? []}
        placeholder="Select Summary on"
      />,
    );
  }
  if (field === "filterType") {
    return wrap(
      <StmtSelectField
        label={label}
        value={form.filterType}
        onChange={(filterType) => patch({ filterType })}
        options={def.filterTypeOptions ?? ["All"]}
        placeholder="Select Type"
      />,
    );
  }
  if (field === "branchType") {
    return wrap(
      <StmtSelectField
        label={label}
        value={form.branchType}
        onChange={(branchType) => patch({ branchType })}
        options={def.branchTypeOptions ?? ["All"]}
        placeholder="Select Branch Type"
      />,
    );
  }
  if (field === "vendorType") {
    return wrap(
      <StmtSelectField
        label={label}
        value={form.vendorType}
        onChange={(vendorType) => patch({ vendorType })}
        options={def.vendorTypeOptions ?? []}
        placeholder="Select Vendor Type"
      />,
    );
  }
  if (field === "flightType") {
    return wrap(
      <StmtSelectField
        label={label}
        value={form.flightType}
        onChange={(flightType) => patch({ flightType })}
        options={def.flightTypeOptions ?? []}
        placeholder="Select Flight Type"
      />,
    );
  }
  if (field === "secondaryReportType") {
    return wrap(
      <StmtSelectField
        label={label}
        value={form.secondaryReportType}
        onChange={(secondaryReportType) => patch({ secondaryReportType })}
        options={def.secondaryReportTypeOptions ?? []}
        placeholder="Select Report Type"
      />,
    );
  }
  if (field === "obcReport") {
    return wrap(
      <FieldWrapper label={label}>
        <div className="flex h-9 items-center gap-2">
          <Checkbox
            id="obcReport"
            checked={form.obcReport}
            onCheckedChange={(v) => patch({ obcReport: v === true })}
          />
          <Label htmlFor="obcReport" className="cursor-pointer text-sm font-normal">
            {label}
          </Label>
        </div>
      </FieldWrapper>,
    );
  }

  return wrap(<StmtTextField label={label} value="" onChange={() => undefined} />);
}
