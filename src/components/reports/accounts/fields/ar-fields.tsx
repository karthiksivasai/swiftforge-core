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
  AR_FIELD_LABELS,
  AR_LOOKUP_FIELDS,
  type ArFieldKey,
  type ArReportDefinition,
} from "@/lib/ar-report-config";

import type { AccountsReportForm, ArLookupPair } from "@/components/reports/accounts/types";

export function ArGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 ${className ?? ""}`}>
      {children}
    </div>
  );
}

function ArDateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <FieldWrapper label={label} required>
      <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </FieldWrapper>
  );
}

function ArSelectField({
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

function ArLookupPairField({
  label,
  value,
  onChange,
  lookup,
}: {
  label: string;
  value: ArLookupPair;
  onChange: (v: ArLookupPair) => void;
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
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const modes = ["Details", "Summary"] as const;
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
  form: AccountsReportForm;
  patch: (p: Partial<AccountsReportForm>) => void;
  def: ArReportDefinition;
};

export function ArReportField({ field, opts }: { field: ArFieldKey; opts: FieldRenderOpts }) {
  const { form, patch, def } = opts;
  const label = AR_FIELD_LABELS[field];

  if (field === "fromDate") {
    return (
      <ArDateField
        label={label}
        value={form.fromDate}
        onChange={(fromDate) => patch({ fromDate })}
      />
    );
  }
  if (field === "toDate") {
    return (
      <ArDateField label={label} value={form.toDate} onChange={(toDate) => patch({ toDate })} />
    );
  }

  if (field === "type") {
    return (
      <DetailsSummaryToggle
        label={label}
        value={form.type === "Summary" ? "Summary" : "Details"}
        onChange={(type) => patch({ type })}
      />
    );
  }

  const lookup = AR_LOOKUP_FIELDS[field] as LookupKey | undefined;
  if (lookup) {
    const key = field as keyof AccountsReportForm;
    const pair = form[key] as ArLookupPair;
    return (
      <ArLookupPairField
        label={label}
        value={pair}
        onChange={(v) => patch({ [key]: v } as Partial<AccountsReportForm>)}
        lookup={lookup}
      />
    );
  }

  if (field === "transactionType") {
    const options = (def.transactionTypeOptions ?? ["Debit", "Credit"]).filter(
      (o) => o !== "Select",
    );
    return (
      <ArSelectField
        label={label}
        value={form.transactionType}
        onChange={(transactionType) => patch({ transactionType })}
        options={options}
        placeholder="Select"
      />
    );
  }

  if (field === "asOnDate") {
    return (
      <FieldWrapper label={label} className="justify-end">
        <div className="flex h-9 items-center gap-2">
          <Checkbox
            id="asOnDate"
            checked={form.asOnDate}
            onCheckedChange={(v) => patch({ asOnDate: v === true })}
          />
          <Label htmlFor="asOnDate" className="cursor-pointer text-sm font-normal">
            {label}
          </Label>
        </div>
      </FieldWrapper>
    );
  }
  if (field === "withZero") {
    return (
      <FieldWrapper label={label} className="justify-end">
        <div className="flex h-9 items-center gap-2">
          <Checkbox
            id="withZero"
            checked={form.withZero}
            onCheckedChange={(v) => patch({ withZero: v === true })}
          />
          <Label htmlFor="withZero" className="cursor-pointer text-sm font-normal">
            {label}
          </Label>
        </div>
      </FieldWrapper>
    );
  }

  return null;
}
