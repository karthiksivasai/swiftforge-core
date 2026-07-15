import type { ReactNode } from "react";

import { ArGrid, ArReportField } from "@/components/reports/accounts/fields/ar-fields";
import type { ArFilterProps } from "@/components/reports/accounts/types";
import { type ArFieldKey, type ArReportDefinition } from "@/lib/ar-report-config";

function FieldRow({
  keys,
  def,
  props,
  leading,
}: {
  keys: ArFieldKey[];
  def: ArReportDefinition;
  props: ArFilterProps;
  leading?: ReactNode;
}) {
  const opts = { form: props.value, patch: props.onChange, def };
  return (
    <ArGrid>
      {leading}
      {keys.map((key) => (
        <ArReportField key={key} field={key} opts={opts} />
      ))}
    </ArGrid>
  );
}

export function ArFilterLayout({
  def,
  props,
  reportTypeControl,
}: {
  def: ArReportDefinition;
  props: ArFilterProps;
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
