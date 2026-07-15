/**
 * CourierWala AWB Report page — Report Type dropdown → per-report filters.
 */
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ReportFormChrome } from "@/components/reports/operations/fields/report-form-chrome";
import { AWB_FILTER_COMPONENTS } from "@/components/reports/awb/filters/registry";
import { emptyAwbForm, type AwbReportForm } from "@/components/reports/awb/types";
import { FieldWrapper, MasterBreadcrumb } from "@/components/master-table-kit";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import {
  executeAwbReport,
  getAwbReport,
  listAwbReports,
  queueAwbReport,
  validateAwbForm,
} from "@/lib/reports/awb/api";
import type { ReportExecuteResult } from "@/lib/reports";

const NONE = "__none__";

export function AwbReportPage() {
  const { isAuthenticated: authed } = useAuth();
  const reports = useMemo(() => listAwbReports(), []);
  const [form, setForm] = useState<AwbReportForm>(() => emptyAwbForm(""));
  const [result, setResult] = useState<ReportExecuteResult | null>(null);
  const [busy, setBusy] = useState(false);

  const detail = form.reportType ? getAwbReport(form.reportType) : null;
  const FilterComponent = form.reportType ? AWB_FILTER_COMPONENTS[form.reportType] : null;

  const patch = (updates: Partial<AwbReportForm>) => setForm((f) => ({ ...f, ...updates }));

  const handleReportTypeChange = (reportType: string) => {
    const next = reportType === NONE ? "" : reportType;
    const def = next ? getAwbReport(next) : null;
    setForm({
      ...emptyAwbForm(next),
      chargeType: def?.chargeTypeOptions?.[0] ?? "All",
      formatType: def?.formatTypeOptions?.[0] ?? "",
      lockType: def?.lockTypeOptions?.[0] ?? "All",
      reportFor: def?.reportForOptions?.[0] ?? "Customer",
    });
    setResult(null);
  };

  const reportTypeControl = (
    <FieldWrapper label="Report Type">
      <Select value={form.reportType || NONE} onValueChange={handleReportTypeChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select Report Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Select Report Type</SelectItem>
          {reports.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldWrapper>
  );

  const runSearch = async () => {
    if (!detail) {
      toast.error("Select Report Type");
      return;
    }
    const v = validateAwbForm(detail, form);
    if (!v.ok) {
      toast.error(v.message);
      return;
    }

    setBusy(true);
    try {
      if (form.addToJobQueue) {
        const q = await queueAwbReport(detail.id, form);
        if (q.status === "error") {
          toast.error(q.message);
          return;
        }
        toast.success(q.message || `${detail.label} added to job queue`);
        return;
      }

      const res = await executeAwbReport(detail.id, form);
      if (res.status === "error") {
        toast.error(res.message);
        return;
      }
      if (res.status === "pending_engine") {
        toast.message(res.message);
        setResult(null);
        return;
      }
      setResult(res.data);
      toast.success(`${detail.label} generated`);
    } finally {
      setBusy(false);
    }
  };

  const handleReset = () => {
    setForm(emptyAwbForm(""));
    setResult(null);
    toast.success("Form reset");
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <MasterBreadcrumb trail={["Reports", "AWB"]} />

      <ReportFormChrome>
        {!form.reportType || !FilterComponent || !detail ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {reportTypeControl}
          </div>
        ) : (
          <FilterComponent value={form} onChange={patch} reportTypeControl={reportTypeControl} />
        )}

        {form.reportType ? (
          <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-sm font-medium text-destructive">
              Note : Report Period Limit - 31 Days
            </p>
            <div className="flex flex-wrap items-center justify-end gap-4">
              {authed ? (
                <Link
                  to="/reports/jobs"
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  Click Here Open Job Queue
                </Link>
              ) : (
                <button
                  type="button"
                  className="text-sm text-primary underline-offset-4 hover:underline"
                  onClick={() => toast.info("Sign in to open the job queue")}
                >
                  Click Here Open Job Queue
                </button>
              )}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="awbAddToJobQueue"
                  checked={form.addToJobQueue}
                  onCheckedChange={(v) => patch({ addToJobQueue: v === true })}
                />
                <Label htmlFor="awbAddToJobQueue" className="cursor-pointer text-sm font-normal">
                  Add to Job Queue
                </Label>
              </div>
              <Button
                type="button"
                disabled={busy}
                onClick={() => void runSearch()}
                className="min-w-24 bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
              >
                Search
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={handleReset}
                className="min-w-24"
              >
                Reset
              </Button>
            </div>
          </div>
        ) : null}
      </ReportFormChrome>

      {result && result.rows.length > 0 ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[640px] text-sm">
            <TableHeader>
              <TableRow>
                {result.columns.map((c) => (
                  <TableHead key={c.key}>{c.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((row, i) => (
                <TableRow key={i}>
                  {result.columns.map((c) => (
                    <TableCell key={c.key}>{String(row[c.key] ?? "")}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </table>
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">
            Showing {result.rows.length} of {result.total} row(s)
          </p>
        </div>
      ) : null}
    </div>
  );
}
