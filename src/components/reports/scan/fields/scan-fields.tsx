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
  SCAN_CSB_TYPES,
  SCAN_FIELD_LABELS,
  SCAN_FORMAT_TYPES,
  SCAN_LOOKUP_FIELDS,
  SCAN_TYPE_OPTIONS,
  type ScanFieldKey,
  type ScanReportDefinition,
} from "@/lib/scan-report-config";

import type { ScanLookupPair, ScanReportForm } from "@/components/reports/scan/types";

export function ScanGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 ${className ?? ""}`}>
      {children}
    </div>
  );
}

function ScanDateField({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <FieldWrapper label={label} required={required}>
      <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </FieldWrapper>
  );
}

function ScanTextField({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <FieldWrapper label={label} required={required}>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </FieldWrapper>
  );
}

function ScanSelectField({
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
  placeholder?: string;
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

function ScanLookupPairField({
  label,
  value,
  onChange,
  lookup,
}: {
  label: string;
  value: ScanLookupPair;
  onChange: (v: ScanLookupPair) => void;
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

function TypeToggle({
  label,
  value,
  onChange,
  options,
  display,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  display: (opt: string) => string;
}) {
  return (
    <FieldWrapper label={label}>
      <div className="flex h-9 overflow-hidden rounded-md border">
        {options.map((opt) => (
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
            {display(opt)}
          </button>
        ))}
      </div>
    </FieldWrapper>
  );
}

type FieldRenderOpts = {
  form: ScanReportForm;
  patch: (p: Partial<ScanReportForm>) => void;
  def: ScanReportDefinition;
};

const DATE_KEYS = new Set<ScanFieldKey>([
  "fromManifestDate",
  "toManifestDate",
  "fromDate",
  "toDate",
  "fromBookingDate",
  "toBookingDate",
]);

const REQUIRED_DATE_KEYS = new Set<ScanFieldKey>([
  "fromDate",
  "toDate",
  "fromBookingDate",
  "toBookingDate",
]);

export function ScanReportField({ field, opts }: { field: ScanFieldKey; opts: FieldRenderOpts }) {
  const { form, patch, def } = opts;
  const label = SCAN_FIELD_LABELS[field];

  if (DATE_KEYS.has(field)) {
    const key = field as
      | "fromManifestDate"
      | "toManifestDate"
      | "fromDate"
      | "toDate"
      | "fromBookingDate"
      | "toBookingDate";
    return (
      <ScanDateField
        label={label}
        value={form[key]}
        onChange={(v) => patch({ [key]: v } as Partial<ScanReportForm>)}
        required={REQUIRED_DATE_KEYS.has(field)}
      />
    );
  }

  if (field === "manifestNo") {
    const required = def.id === "bag-wise-detail-print" || def.id === "edi-csb-files";
    return (
      <ScanTextField
        label={label}
        value={form.manifestNo}
        onChange={(manifestNo) => patch({ manifestNo })}
        required={required}
      />
    );
  }

  const lookup = SCAN_LOOKUP_FIELDS[field] as LookupKey | undefined;
  if (lookup) {
    const key = field as keyof ScanReportForm;
    const pair = form[key] as ScanLookupPair;
    return (
      <ScanLookupPairField
        label={label}
        value={pair}
        onChange={(v) => patch({ [key]: v } as Partial<ScanReportForm>)}
        lookup={lookup}
      />
    );
  }

  if (field === "status") {
    return (
      <ScanSelectField
        label={label}
        value={form.status}
        onChange={(status) => patch({ status })}
        options={def.statusOptions ?? ["All"]}
      />
    );
  }
  if (field === "formatType") {
    return (
      <ScanSelectField
        label={label}
        value={form.formatType}
        onChange={(formatType) => patch({ formatType })}
        options={SCAN_FORMAT_TYPES}
        placeholder="Select Format"
      />
    );
  }
  if (field === "csbType") {
    return (
      <ScanSelectField
        label={label}
        value={form.csbType}
        onChange={(csbType) => patch({ csbType })}
        options={SCAN_CSB_TYPES}
        placeholder="Select Type"
      />
    );
  }

  if (field === "type") {
    if (def.typeMode === "detailsSummary") {
      const modes = ["Details", "Summary"] as const;
      const current = modes.includes(form.type as (typeof modes)[number]) ? form.type : "Summary";
      return (
        <TypeToggle
          label={label}
          value={current}
          onChange={(type) => patch({ type })}
          options={modes}
          display={(o) => o}
        />
      );
    }
    const current = SCAN_TYPE_OPTIONS.includes(form.type as (typeof SCAN_TYPE_OPTIONS)[number])
      ? form.type
      : SCAN_TYPE_OPTIONS[0];
    return (
      <TypeToggle
        label={label}
        value={current}
        onChange={(type) => patch({ type })}
        options={SCAN_TYPE_OPTIONS}
        display={(o) => o}
      />
    );
  }

  if (field === "originalShipper") {
    return (
      <FieldWrapper label={label} className="justify-end">
        <div className="flex h-9 items-center gap-2">
          <Checkbox
            id="originalShipper"
            checked={form.originalShipper}
            onCheckedChange={(v) => patch({ originalShipper: v === true })}
          />
          <Label htmlFor="originalShipper" className="cursor-pointer text-sm font-normal">
            {label}
          </Label>
        </div>
      </FieldWrapper>
    );
  }
  if (field === "withClubAwbNo") {
    return (
      <FieldWrapper label={label} className="justify-end">
        <div className="flex h-9 items-center gap-2">
          <Checkbox
            id="withClubAwbNo"
            checked={form.withClubAwbNo}
            onCheckedChange={(v) => patch({ withClubAwbNo: v === true })}
          />
          <Label htmlFor="withClubAwbNo" className="cursor-pointer text-sm font-normal">
            {label}
          </Label>
        </div>
      </FieldWrapper>
    );
  }

  const textKeys: ScanFieldKey[] = ["bagNo", "awbNo", "forwardingNo", "invoiceNo"];
  if (textKeys.includes(field)) {
    const key = field as "bagNo" | "awbNo" | "forwardingNo" | "invoiceNo";
    return (
      <ScanTextField
        label={label}
        value={form[key]}
        onChange={(v) => patch({ [key]: v } as Partial<ScanReportForm>)}
      />
    );
  }

  return null;
}
