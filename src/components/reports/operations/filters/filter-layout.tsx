import type { ReactNode } from "react";

import { OpsGrid, OpsReportField } from "@/components/reports/operations/fields/ops-fields";
import type { OpsFilterProps } from "@/components/reports/operations/types";
import {
  ACTION_LOG_AWB_ENTRY_REPORT,
  AWB_PRINT_TYPES,
  CSB_TYPES,
  FORMAT_TYPES,
  type ReportDefinition,
  type ReportFieldKey,
} from "@/lib/operations-report-config";

function fieldOpts(
  def: ReportDefinition,
  form: OpsFilterProps["value"],
  patch: OpsFilterProps["onChange"],
) {
  return {
    form,
    patch,
    secondaryReportTypeOptions: def.secondaryReportTypeOptions,
    logTypeOptions: def.logTypeOptions,
    customerTypeOptions: def.customerTypeOptions,
    statusOptions: def.statusOptions,
    userTypeOptions: def.userTypeOptions,
    userOptions: def.userOptions,
    productTypeOptions: def.productTypeOptions,
    branchTypeOptions: def.branchTypeOptions,
    typeMode: def.typeMode,
    awbPrintTypes: AWB_PRINT_TYPES,
    formatTypes: FORMAT_TYPES,
    csbTypes: CSB_TYPES,
  };
}

function FieldRow({
  keys,
  def,
  props,
  leading,
}: {
  keys: ReportFieldKey[];
  def: ReportDefinition;
  props: OpsFilterProps;
  leading?: ReactNode;
}) {
  const opts = fieldOpts(def, props.value, props.onChange);
  // AWB No. only on the primary row (with Report Type), for Action Log → AWB Entry.
  const showAwb =
    Boolean(leading) &&
    def.id === "action-log" &&
    props.value.secondaryReportType === ACTION_LOG_AWB_ENTRY_REPORT;
  const keysWithAwb: ReportFieldKey[] =
    showAwb && !keys.includes("awbNo") ? [...keys, "awbNo"] : keys;

  return (
    <OpsGrid>
      {leading}
      {keysWithAwb.map((key) => (
        <OpsReportField
          key={key}
          field={key}
          opts={{
            ...opts,
            colSpan: def.colSpans?.[key],
          }}
        />
      ))}
    </OpsGrid>
  );
}

/**
 * CourierWala layout: Report Type (leading) + definition.fields on row 1,
 * then secondRowFields, then extraRows.
 */
export function OpsFilterLayout({
  def,
  props,
  reportTypeControl,
}: {
  def: ReportDefinition;
  props: OpsFilterProps;
  reportTypeControl: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <FieldRow keys={def.fields} def={def} props={props} leading={reportTypeControl} />
      {def.secondRowFields?.length ? (
        <FieldRow keys={def.secondRowFields} def={def} props={props} />
      ) : null}
      {(def.extraRows ?? []).map((keys, i) => (
        <FieldRow key={i} keys={keys} def={def} props={props} />
      ))}
    </div>
  );
}
