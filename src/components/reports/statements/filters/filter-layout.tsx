import type { ReactNode } from "react";

import { StmtGrid, StmtReportField } from "@/components/reports/statements/fields/stmt-fields";
import type { StmtFilterProps } from "@/components/reports/statements/types";
import {
  type StatementFieldKey,
  type StatementReportDefinition,
} from "@/lib/statements-report-config";

function FieldRow({
  keys,
  def,
  props,
  leading,
}: {
  keys: StatementFieldKey[];
  def: StatementReportDefinition;
  props: StmtFilterProps;
  leading?: ReactNode;
}) {
  const opts = { form: props.value, patch: props.onChange, def };
  return (
    <StmtGrid>
      {leading}
      {keys.map((key) => (
        <StmtReportField key={key} field={key} opts={opts} />
      ))}
    </StmtGrid>
  );
}

/** CourierWala layout: Report Type + definition.fields, then secondRowFields, then extraRows. */
export function StmtFilterLayout({
  def,
  props,
  reportTypeControl,
}: {
  def: StatementReportDefinition;
  props: StmtFilterProps;
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
