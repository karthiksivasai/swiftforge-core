/**
 * ReportRunner — loads definition metadata, builds filters, executes synchronously.
 * Hub pages embed this after the user picks a Report Type (CourierWala workflow).
 */
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { MasterBreadcrumb } from "@/components/master-table-kit";
import { ReportFilterBuilder } from "@/components/reports/report-filter-builder";
import { ReportPagination } from "@/components/reports/report-pagination";
import { ReportTable } from "@/components/reports/report-table";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { toErrorMessage } from "@/lib/masters/screen";
import {
  defaultFiltersFromDefinition,
  executeReport,
  getReportDefinition,
  validateReportFilters,
} from "@/lib/reports";
import { createReportJob, executeReportJob } from "@/lib/reports/jobs";
import type { ReportExportFormat } from "@/lib/reports/jobTypes";
import type {
  ReportDefinition,
  ReportExecuteResult,
  ReportFilterValues,
} from "@/lib/reports/types";

const PAGE_SIZE = 50;

type Props = {
  reportKey: string;
  breadcrumbTrail?: string[];
  /** When true, omit page chrome (breadcrumb / outer padding) for hub embedding. */
  embedded?: boolean;
};

export function ReportRunner({ reportKey, breadcrumbTrail, embedded = false }: Props) {
  const { isAuthenticated: authed } = useAuth();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<ReportFilterValues>({});
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<ReportExecuteResult | null>(null);
  const [hasRun, setHasRun] = useState(false);

  const defQuery = useQuery({
    queryKey: ["report-definition", reportKey],
    queryFn: () => getReportDefinition(reportKey),
    enabled: authed && Boolean(reportKey),
  });

  const definition: ReportDefinition | null = defQuery.data ?? null;

  useEffect(() => {
    if (!definition) return;
    setFilters(defaultFiltersFromDefinition(definition));
    const ds = definition.default_sort;
    if (ds?.column) setSortBy(ds.column);
    if (ds?.dir === "asc" || ds?.dir === "desc") setSortDir(ds.dir);
    setResult(null);
    setHasRun(false);
    setPage(1);
  }, [definition]);

  const run = useCallback(
    async (nextPage = 1) => {
      if (!authed) {
        toast.error("Sign in to run live reports");
        return;
      }
      if (!definition) return;

      setRunning(true);
      try {
        const validation = await validateReportFilters(reportKey, filters);
        if (!validation.ok) {
          const msg =
            validation.errors
              .map((e) => e.message)
              .filter(Boolean)
              .join("; ") || "Invalid filters";
          toast.error(msg);
          return;
        }

        const data = await executeReport({
          reportKey,
          filters,
          page: nextPage,
          pageSize: PAGE_SIZE,
          sortBy,
          sortDir,
        });
        setResult(data);
        setPage(data.page);
        setHasRun(true);
      } catch (err) {
        toast.error(toErrorMessage(err));
      } finally {
        setRunning(false);
      }
    },
    [authed, definition, filters, reportKey, sortBy, sortDir],
  );

  const onReset = () => {
    if (!definition) return;
    setFilters(defaultFiltersFromDefinition(definition));
    setResult(null);
    setHasRun(false);
    setPage(1);
  };

  const exportJob = useCallback(
    async (format: ReportExportFormat) => {
      if (!authed) {
        toast.error("Sign in to export reports");
        return;
      }
      if (!definition) return;

      setExporting(true);
      try {
        const validation = await validateReportFilters(reportKey, filters);
        if (!validation.ok) {
          const msg =
            validation.errors
              .map((e) => e.message)
              .filter(Boolean)
              .join("; ") || "Invalid filters";
          toast.error(msg);
          return;
        }

        const job = await createReportJob({
          reportKey,
          filters,
          outputFormat: format,
        });
        await executeReportJob(job.id);
        toast.success(`${format} export completed`);
        void navigate({ to: "/reports/jobs" });
      } catch (err) {
        toast.error(toErrorMessage(err));
      } finally {
        setExporting(false);
      }
    },
    [authed, definition, filters, navigate, reportKey],
  );

  const onSort = (columnKey: string) => {
    const nextDir: "asc" | "desc" =
      sortBy === columnKey ? (sortDir === "asc" ? "desc" : "asc") : "asc";
    const nextSortBy = columnKey;
    setSortBy(nextSortBy);
    setSortDir(nextDir);
    if (hasRun) {
      void (async () => {
        if (!definition || !authed) return;
        setRunning(true);
        try {
          const data = await executeReport({
            reportKey,
            filters,
            page: 1,
            pageSize: PAGE_SIZE,
            sortBy: nextSortBy,
            sortDir: nextDir,
          });
          setResult(data);
          setPage(1);
        } catch (err) {
          toast.error(toErrorMessage(err));
        } finally {
          setRunning(false);
        }
      })();
    }
  };

  const trail = breadcrumbTrail ?? ["Reports", definition?.title ?? reportKey];
  const columns = result?.columns?.length ? result.columns : (definition?.columns ?? []);
  const rows = result?.rows ?? [];
  const total = result?.total ?? 0;
  const shellClass = embedded ? "space-y-4" : "space-y-4 p-4 md:p-6";

  if (!authed) {
    return (
      <div className={shellClass}>
        {embedded ? null : <MasterBreadcrumb trail={trail} />}
        <Card className="p-6 text-sm text-muted-foreground">Sign in to run this report.</Card>
      </div>
    );
  }

  if (defQuery.isLoading) {
    return (
      <div className={shellClass}>
        {embedded ? null : <MasterBreadcrumb trail={trail} />}
        <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>
      </div>
    );
  }

  if (defQuery.isError || !definition) {
    return (
      <div className={shellClass}>
        {embedded ? null : <MasterBreadcrumb trail={trail} />}
        <Card className="p-6 text-sm text-destructive">
          {toErrorMessage(defQuery.error) || "Report not found or not permitted."}
        </Card>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      {embedded ? null : <MasterBreadcrumb trail={trail} />}
      <Card className="space-y-4 p-4">
        <ReportToolbar
          title={definition.title}
          description={embedded ? null : definition.description}
          running={running}
          exporting={exporting}
          onRun={() => void run(1)}
          onReset={onReset}
          onExportCsv={() => void exportJob("CSV")}
          onExportXlsx={() => void exportJob("XLSX")}
        />
        <ReportFilterBuilder filters={definition.filters} values={filters} onChange={setFilters} />
      </Card>
      <Card className="overflow-hidden">
        <ReportTable
          columns={columns}
          rows={rows}
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={onSort}
        />
        <ReportPagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={(p) => {
            void run(p);
          }}
        />
      </Card>
    </div>
  );
}
