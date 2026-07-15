import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Download, Ban, Play, RefreshCw } from "lucide-react";

import { MasterBreadcrumb } from "@/components/master-table-kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { toErrorMessage } from "@/lib/masters/screen";
import {
  canCancelReportJob,
  canDownloadReportJob,
  canRetryReportJob,
  reportJobStatusLabel,
} from "@/lib/reports/jobStatus";
import {
  cancelReportJob,
  downloadReportJobArtifact,
  executeReportJob,
  getReportJob,
  listReportJobs,
} from "@/lib/reports/jobs";

export const Route = createFileRoute("/reports/jobs")({
  head: () => ({
    meta: [
      { title: "Report Jobs — Courier ERP" },
      { name: "description", content: "Async report export jobs (CSV / XLSX)." },
    ],
  }),
  component: ReportJobsPage,
});

const STATUS_FILTERS = [
  { value: "ALL", label: "All statuses" },
  { value: "QUEUED", label: "Queued" },
  { value: "RUNNING", label: "Running" },
  { value: "COMPLETED", label: "Completed" },
  { value: "FAILED", label: "Failed" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

function ReportJobsPage() {
  const { isAuthenticated: authed } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string>("ALL");
  const [page, setPage] = useState(1);

  const listQuery = useQuery({
    queryKey: ["report-jobs", status, page],
    queryFn: () =>
      listReportJobs({
        status: status === "ALL" ? null : status,
        page,
        pageSize: 20,
      }),
    enabled: authed,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["report-jobs"] });
  };

  const executeMut = useMutation({
    mutationFn: (id: string) => executeReportJob(id),
    onSuccess: () => {
      toast.success("Job executed");
      invalidate();
    },
    onError: (err) => toast.error(toErrorMessage(err)),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelReportJob(id),
    onSuccess: () => {
      toast.success("Job cancelled");
      invalidate();
    },
    onError: (err) => toast.error(toErrorMessage(err)),
  });

  const downloadMut = useMutation({
    mutationFn: async (id: string) => {
      const detail = await getReportJob(id);
      if (!detail.download) throw new Error("Download not available");
      downloadReportJobArtifact(detail.download);
    },
    onSuccess: () => toast.success("Download started"),
    onError: (err) => toast.error(toErrorMessage(err)),
  });

  const rows = listQuery.data?.rows ?? [];
  const total = listQuery.data?.total ?? 0;
  const pageSize = listQuery.data?.page_size ?? 20;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 md:px-6 md:py-8">
      <MasterBreadcrumb trail={["Reports", "Report Jobs"]} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Report Jobs</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Queue, run, cancel, and download CSV / XLSX exports. Manual execution only.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => invalidate()}
            disabled={listQuery.isFetching}
          >
            <RefreshCw className="mr-1.5 h-4 w-4" />
            Refresh
          </Button>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/reports/operations">Operations</Link>
          </Button>
        </div>
      </div>

      {!authed ? (
        <p className="text-sm text-muted-foreground">Sign in to view report jobs.</p>
      ) : listQuery.isError ? (
        <Card className="shadow-none border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">
            {toErrorMessage(listQuery.error)}
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Job status</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Report</th>
                  <th className="py-2 pr-3 font-medium">Format</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Progress</th>
                  <th className="py-2 pr-3 font-medium">Rows</th>
                  <th className="py-2 pr-3 font-medium">Created</th>
                  <th className="py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {listQuery.isLoading ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-muted-foreground">
                      No jobs yet. Export from a report runner to create one.
                    </td>
                  </tr>
                ) : (
                  rows.map((job) => (
                    <tr key={job.id} className="border-b last:border-0">
                      <td className="py-2.5 pr-3">
                        <div className="font-medium">{job.report_title || job.report_key}</div>
                        <div className="text-xs text-muted-foreground">{job.report_key}</div>
                        {job.error_message ? (
                          <div className="mt-0.5 text-xs text-destructive">{job.error_message}</div>
                        ) : null}
                      </td>
                      <td className="py-2.5 pr-3">{job.output_format}</td>
                      <td className="py-2.5 pr-3">
                        <Badge variant="secondary" className="font-normal">
                          {reportJobStatusLabel(job.status)}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-3">{job.progress}%</td>
                      <td className="py-2.5 pr-3">{job.row_count}</td>
                      <td className="py-2.5 pr-3 text-muted-foreground">
                        {job.created_at ? new Date(job.created_at).toLocaleString() : "—"}
                      </td>
                      <td className="py-2.5">
                        <div className="flex flex-wrap gap-1.5">
                          {canRetryReportJob(job.status) ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={executeMut.isPending}
                              onClick={() => executeMut.mutate(job.id)}
                            >
                              <Play className="mr-1 h-3.5 w-3.5" />
                              {job.status === "FAILED" ? "Retry" : "Run"}
                            </Button>
                          ) : null}
                          {canCancelReportJob(job.status) ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={cancelMut.isPending}
                              onClick={() => cancelMut.mutate(job.id)}
                            >
                              <Ban className="mr-1 h-3.5 w-3.5" />
                              Cancel
                            </Button>
                          ) : null}
                          {canDownloadReportJob(job.status) ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={downloadMut.isPending}
                              onClick={() => downloadMut.mutate(job.id)}
                            >
                              <Download className="mr-1 h-3.5 w-3.5" />
                              Download
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {total > pageSize ? (
              <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Page {page} of {pageCount} ({total} jobs)
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={page >= pageCount}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
