import type { ReactNode } from "react";

import { ScanGrid, ScanReportField } from "@/components/reports/scan/fields/scan-fields";
import type { ScanFilterProps } from "@/components/reports/scan/types";
import { type ScanFieldKey, type ScanReportDefinition } from "@/lib/scan-report-config";

function FieldRow({
  keys,
  def,
  props,
  leading,
}: {
  keys: ScanFieldKey[];
  def: ScanReportDefinition;
  props: ScanFilterProps;
  leading?: ReactNode;
}) {
  const opts = { form: props.value, patch: props.onChange, def };
  return (
    <ScanGrid>
      {leading}
      {keys.map((key) => (
        <ScanReportField key={key} field={key} opts={opts} />
      ))}
    </ScanGrid>
  );
}

export function ScanFilterLayout({
  def,
  props,
  reportTypeControl,
}: {
  def: ScanReportDefinition;
  props: ScanFilterProps;
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
