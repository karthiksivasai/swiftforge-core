import type { ReactNode } from "react";

import { AwbGrid, AwbReportField } from "@/components/reports/awb/fields/awb-fields";
import type { AwbFilterProps } from "@/components/reports/awb/types";
import { type AwbFieldKey, type AwbReportDefinition } from "@/lib/awb-report-config";

function FieldRow({
  keys,
  def,
  props,
  leading,
}: {
  keys: AwbFieldKey[];
  def: AwbReportDefinition;
  props: AwbFilterProps;
  leading?: ReactNode;
}) {
  const opts = { form: props.value, patch: props.onChange, def };
  return (
    <AwbGrid>
      {leading}
      {keys.map((key) => (
        <AwbReportField key={key} field={key} opts={opts} />
      ))}
    </AwbGrid>
  );
}

/** CourierWala layout: Report Type + definition.fields, then secondRowFields, then extraRows. */
export function AwbFilterLayout({
  def,
  props,
  reportTypeControl,
}: {
  def: AwbReportDefinition;
  props: AwbFilterProps;
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
