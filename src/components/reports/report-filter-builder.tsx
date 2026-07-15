/**
 * Metadata-driven filter form — renders controls from report_filters / filter_schema.
 * No report-specific fields.
 */
import { useState } from "react";
import { Search } from "lucide-react";

import { FieldWrapper } from "@/components/master-table-kit";
import { MasterLookupDialog } from "@/components/master-lookup-dialog";
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
import type { LookupKey } from "@/lib/master-lookups";
import type { ReportFilterMeta, ReportFilterValues } from "@/lib/reports/types";

const LOOKUP_ALIASES: Record<string, LookupKey> = {
  customer: "customer",
  destination: "destination",
  product: "product",
  vendor: "vendor",
  zone: "zone",
  paymenttype: "paymentType",
  "payment-type": "paymentType",
  payment_type: "paymentType",
  servicetype: "serviceType",
  "service-type": "serviceType",
  service_type: "serviceType",
  servicecentre: "serviceCentre",
  "service-centre": "serviceCentre",
  service_center: "serviceCentre",
  "service-center": "serviceCentre",
  contracthead: "contractHead",
  "contract-head": "contractHead",
  contract_head: "contractHead",
  fieldexecutive: "fieldExecutive",
  "field-executive": "fieldExecutive",
  field_executive: "fieldExecutive",
  salesexecutive: "salesExecutive",
  "sales-executive": "salesExecutive",
  sales_executive: "salesExecutive",
};

function asLookupKey(raw: string | null | undefined): LookupKey | null {
  if (!raw) return null;
  const key = raw.trim();
  if (key in LOOKUP_ALIASES) return LOOKUP_ALIASES[key];
  const normalized = key.toLowerCase().replace(/\s+/g, "");
  return LOOKUP_ALIASES[normalized] ?? null;
}

type Props = {
  filters: ReportFilterMeta[];
  values: ReportFilterValues;
  onChange: (next: ReportFilterValues) => void;
  disabled?: boolean;
};

export function ReportFilterBuilder({ filters, values, onChange, disabled }: Props) {
  const [lookupOpen, setLookupOpen] = useState<LookupKey | null>(null);
  const [lookupTarget, setLookupTarget] = useState<string | null>(null);

  const patch = (key: string, value: string | boolean | null) => {
    onChange({ ...values, [key]: value });
  };

  const sorted = [...filters].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {sorted.map((f) => {
        const type = String(f.type ?? "TEXT").toUpperCase();
        const val = values[f.key];

        if (type === "DATE") {
          return (
            <FieldWrapper key={f.key} label={f.label} required={f.required}>
              <Input
                type="date"
                disabled={disabled}
                value={typeof val === "string" ? val : ""}
                onChange={(e) => patch(f.key, e.target.value)}
              />
            </FieldWrapper>
          );
        }

        if (type === "BOOLEAN") {
          return (
            <div key={f.key} className="flex items-end gap-2 pb-2">
              <Checkbox
                id={`rpt-f-${f.key}`}
                disabled={disabled}
                checked={Boolean(val)}
                onCheckedChange={(c) => patch(f.key, c === true)}
              />
              <Label htmlFor={`rpt-f-${f.key}`} className="text-sm font-normal">
                {f.label}
              </Label>
            </div>
          );
        }

        if (type === "ENUM") {
          const opts = Array.isArray(f.options) ? f.options : [];
          return (
            <FieldWrapper key={f.key} label={f.label} required={f.required}>
              <Select
                disabled={disabled}
                value={typeof val === "string" && val ? val : "__all__"}
                onValueChange={(v) => patch(f.key, v === "__all__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All</SelectItem>
                  {opts.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>
          );
        }

        if (type === "LOOKUP") {
          const lookup = asLookupKey(f.lookup ?? undefined);
          return (
            <FieldWrapper key={f.key} label={f.label} required={f.required}>
              <div className="relative">
                <Input
                  disabled={disabled}
                  readOnly={Boolean(lookup)}
                  value={typeof val === "string" ? val : ""}
                  placeholder={lookup ? "Select…" : ""}
                  onChange={(e) => {
                    if (!lookup) patch(f.key, e.target.value);
                  }}
                  onClick={() => {
                    if (lookup && !disabled) {
                      setLookupTarget(f.key);
                      setLookupOpen(lookup);
                    }
                  }}
                  className={lookup ? "cursor-pointer pr-9" : undefined}
                />
                {lookup ? (
                  <Search className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                ) : null}
              </div>
            </FieldWrapper>
          );
        }

        return (
          <FieldWrapper key={f.key} label={f.label} required={f.required}>
            <Input
              disabled={disabled}
              value={typeof val === "string" ? val : ""}
              onChange={(e) => patch(f.key, e.target.value)}
            />
          </FieldWrapper>
        );
      })}

      {lookupOpen ? (
        <MasterLookupDialog
          open={Boolean(lookupOpen)}
          onOpenChange={(o) => {
            if (!o) {
              setLookupOpen(null);
              setLookupTarget(null);
            }
          }}
          lookup={lookupOpen}
          returnField="code"
          onSelect={(code) => {
            if (lookupTarget) patch(lookupTarget, code);
          }}
        />
      ) : null}
    </div>
  );
}
