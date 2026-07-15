/**
 * CourierWala-style report hub: Report Type dropdown → filters / run / export / results.
 * Uses the Phase 5 metadata engine under the hood; does not expose a catalog of cards.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { MasterBreadcrumb, FieldWrapper } from "@/components/master-table-kit";
import { ReportRunner } from "@/components/reports/report-runner";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { toErrorMessage } from "@/lib/masters/screen";
import { listReportDefinitions } from "@/lib/reports";
import type { ReportCatalogItem } from "@/lib/reports/types";

const NONE = "__none__";

type Props = {
  /** Breadcrumb / page label, e.g. "Operations" */
  hubLabel: string;
  /** Engine hubs to load (e.g. ["OPERATIONS"] or ["OPERATIONS","AUDIT"]) */
  hubs: string[];
  /** Optional allow-list of report_key values */
  allowedKeys?: readonly string[];
};

function sortByTitle(a: ReportCatalogItem, b: ReportCatalogItem) {
  return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
}

export function ReportHubShell({ hubLabel, hubs, allowedKeys }: Props) {
  const { isAuthenticated: authed } = useAuth();
  const [reportKey, setReportKey] = useState<string>("");

  const query = useQuery({
    queryKey: ["report-definitions", "hub-shell", ...hubs],
    queryFn: async () => {
      const packs = await Promise.all(hubs.map((h) => listReportDefinitions(h)));
      return packs.flat();
    },
    enabled: authed,
  });

  const options = useMemo(() => {
    const allow = allowedKeys ? new Set(allowedKeys) : null;
    const rows = (query.data ?? []).filter((r) => (allow ? allow.has(r.report_key) : true));
    const byKey = new Map<string, ReportCatalogItem>();
    for (const row of rows) {
      if (!byKey.has(row.report_key)) byKey.set(row.report_key, row);
    }
    return [...byKey.values()].sort(sortByTitle);
  }, [allowedKeys, query.data]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Reports", hubLabel]} />

      <Card className="space-y-4 p-4">
        <FieldWrapper label="Report Type" className="max-w-xl">
          <Select
            value={reportKey || NONE}
            onValueChange={(v) => setReportKey(v === NONE ? "" : v)}
            disabled={!authed || query.isLoading || Boolean(query.isError)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select Report Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Select Report Type</SelectItem>
              {options.map((r) => (
                <SelectItem key={r.report_key} value={r.report_key}>
                  {r.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldWrapper>

        {!authed ? (
          <p className="text-sm text-muted-foreground">Sign in to load reports.</p>
        ) : query.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading report types…</p>
        ) : query.isError ? (
          <p className="text-sm text-destructive">{toErrorMessage(query.error)}</p>
        ) : options.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No reports available for your permissions.
          </p>
        ) : null}
      </Card>

      {authed && reportKey ? (
        <ReportRunner
          key={reportKey}
          reportKey={reportKey}
          embedded
          breadcrumbTrail={["Reports", hubLabel]}
        />
      ) : null}
    </div>
  );
}
