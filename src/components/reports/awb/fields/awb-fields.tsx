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
  AWB_FIELD_LABELS,
  AWB_LOOKUP_FIELDS,
  type AwbFieldKey,
  type AwbReportDefinition,
} from "@/lib/awb-report-config";

import type { AwbLookupPair, AwbReportForm } from "@/components/reports/awb/types";

export function AwbGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 ${className ?? ""}`}>
      {children}
    </div>
  );
}

function AwbDateField({
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

function AwbTextField({
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

function AwbSelectField({
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

function AwbLookupPairField({
  label,
  value,
  onChange,
  lookup,
}: {
  label: string;
  value: AwbLookupPair;
  onChange: (v: AwbLookupPair) => void;
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

function AwbCheckboxField({
  label,
  id,
  checked,
  onChange,
}: {
  label: string;
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <FieldWrapper label={label} className="justify-end">
      <div className="flex h-9 items-center gap-2">
        <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
        <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
          {label}
        </Label>
      </div>
    </FieldWrapper>
  );
}

type FieldRenderOpts = {
  form: AwbReportForm;
  patch: (p: Partial<AwbReportForm>) => void;
  def: AwbReportDefinition;
};

export function AwbReportField({ field, opts }: { field: AwbFieldKey; opts: FieldRenderOpts }) {
  const { form, patch, def } = opts;
  const label = def.fieldLabels?.[field] ?? AWB_FIELD_LABELS[field];

  if (field === "fromDate") {
    return (
      <AwbDateField
        label={label}
        value={form.fromDate}
        onChange={(fromDate) => patch({ fromDate })}
      />
    );
  }
  if (field === "toDate") {
    return (
      <AwbDateField label={label} value={form.toDate} onChange={(toDate) => patch({ toDate })} />
    );
  }

  const lookup = AWB_LOOKUP_FIELDS[field] as LookupKey | undefined;
  if (lookup) {
    const key = field as keyof AwbReportForm;
    const pair = form[key] as AwbLookupPair;
    return (
      <AwbLookupPairField
        label={label}
        value={pair}
        onChange={(v) => patch({ [key]: v } as Partial<AwbReportForm>)}
        lookup={lookup}
      />
    );
  }

  if (field === "reportFor") {
    return (
      <AwbSelectField
        label={label}
        value={form.reportFor}
        onChange={(reportFor) => patch({ reportFor })}
        options={def.reportForOptions ?? []}
        placeholder="Select Report For"
      />
    );
  }
  if (field === "customerType") {
    return (
      <AwbSelectField
        label={label}
        value={form.customerType}
        onChange={(customerType) => patch({ customerType })}
        options={def.customerTypeOptions ?? []}
        placeholder="Select Customer Type"
      />
    );
  }
  if (field === "formatType") {
    return (
      <AwbSelectField
        label={label}
        value={form.formatType}
        onChange={(formatType) => patch({ formatType })}
        options={def.formatTypeOptions ?? []}
        placeholder="Select Format Type"
      />
    );
  }
  if (field === "businessChannel") {
    return (
      <AwbSelectField
        label={label}
        value={form.businessChannel}
        onChange={(businessChannel) => patch({ businessChannel })}
        options={def.businessChannelOptions ?? []}
        placeholder="Select Business Type"
      />
    );
  }
  if (field === "chargeType") {
    return (
      <AwbSelectField
        label={label}
        value={form.chargeType}
        onChange={(chargeType) => patch({ chargeType })}
        options={def.chargeTypeOptions ?? []}
        placeholder="Select Charge Type"
      />
    );
  }
  if (field === "productType") {
    return (
      <AwbSelectField
        label={label}
        value={form.productType}
        onChange={(productType) => patch({ productType })}
        options={def.productTypeOptions ?? []}
        placeholder="Select Product Type"
      />
    );
  }
  if (field === "tax") {
    return (
      <AwbSelectField
        label={label}
        value={form.tax}
        onChange={(tax) => patch({ tax })}
        options={def.taxOptions ?? []}
        placeholder="Select Tax"
      />
    );
  }
  if (field === "lockType") {
    return (
      <AwbSelectField
        label={label}
        value={form.lockType}
        onChange={(lockType) => patch({ lockType })}
        options={def.lockTypeOptions ?? []}
        placeholder="Select Lock Type"
      />
    );
  }
  if (field === "registerType") {
    return (
      <AwbSelectField
        label={label}
        value={form.registerType}
        onChange={(registerType) => patch({ registerType })}
        options={def.registerTypeOptions ?? []}
        placeholder="Select Type"
      />
    );
  }
  if (field === "type") {
    return (
      <AwbSelectField
        label={label}
        value={form.type}
        onChange={(type) => patch({ type })}
        options={def.typeOptions ?? []}
        placeholder="Select Type"
      />
    );
  }

  if (field === "billed") {
    return (
      <AwbCheckboxField
        label={label}
        id="awb-billed"
        checked={form.billed}
        onChange={(billed) => patch({ billed })}
      />
    );
  }
  if (field === "unBilled") {
    return (
      <AwbCheckboxField
        label={label}
        id="awb-unBilled"
        checked={form.unBilled}
        onChange={(unBilled) => patch({ unBilled })}
      />
    );
  }
  if (field === "summary") {
    return (
      <AwbCheckboxField
        label={label}
        id="awb-summary"
        checked={form.summary}
        onChange={(summary) => patch({ summary })}
      />
    );
  }
  if (field === "otherCharges") {
    return (
      <AwbCheckboxField
        label={label}
        id="awb-otherCharges"
        checked={form.otherCharges}
        onChange={(otherCharges) => patch({ otherCharges })}
      />
    );
  }

  const textKeys: AwbFieldKey[] = [
    "awbNo",
    "instruction",
    "manifestNo",
    "fromManifestNo",
    "toManifestNo",
    "invoiceNo",
  ];
  if (textKeys.includes(field)) {
    const key = field as
      "awbNo" | "instruction" | "manifestNo" | "fromManifestNo" | "toManifestNo" | "invoiceNo";
    return (
      <AwbTextField
        label={label}
        value={form[key]}
        onChange={(v) => patch({ [key]: v } as Partial<AwbReportForm>)}
      />
    );
  }

  return null;
}
