/**
 * Accounts (AR) Reports client API — conceptual REST over Phase 5 AR RPCs.
 */
import {
  AR_HUB_KEY_MAP,
  createReportJob,
  executeReport,
  validateReportFilters,
  type ReportExecuteResult,
  type ReportExportFormat,
  type ReportFilterValues,
} from "@/lib/reports";
import {
  AR_REPORT_DEFINITIONS,
  arHasDateRange,
  type ArReportDefinition,
} from "@/lib/ar-report-config";
import type { AccountsReportForm } from "@/components/reports/accounts/types";
import { daysBetween } from "@/components/reports/accounts/types";

export type AccountsReportListItem = {
  id: string;
  label: string;
  engineKey: string | null;
};

export type AccountsReportDetail = ArReportDefinition & {
  engineKey: string | null;
};

function resolveEngineKey(arId: string): string | null {
  if (arId in AR_HUB_KEY_MAP) {
    return AR_HUB_KEY_MAP[arId] ?? null;
  }
  return null;
}

/** GET /reports/accounts — list CourierWala Accounts report types. */
export function listAccountsReports(): AccountsReportListItem[] {
  return AR_REPORT_DEFINITIONS.map((d) => ({
    id: d.id,
    label: d.label,
    engineKey: resolveEngineKey(d.id),
  }));
}

/** GET /reports/accounts/{reportId} */
export function getAccountsReport(reportId: string): AccountsReportDetail | null {
  const def = AR_REPORT_DEFINITIONS.find((d) => d.id === reportId);
  if (!def) return null;
  return { ...def, engineKey: resolveEngineKey(reportId) };
}

export type ArValidationResult = { ok: true } | { ok: false; message: string };

export function validateAccountsForm(
  def: ArReportDefinition,
  form: AccountsReportForm,
): ArValidationResult {
  if (!arHasDateRange(def)) return { ok: true };

  if (!form.fromDate.trim() || !form.toDate.trim()) {
    return { ok: false, message: "From Date and To Date are required" };
  }
  if (form.fromDate > form.toDate) {
    return { ok: false, message: "From Date cannot be after To Date" };
  }
  if (daysBetween(form.fromDate, form.toDate) > 31) {
    return { ok: false, message: "Report period cannot exceed 31 days" };
  }
  return { ok: true };
}

export function formToEngineFilters(form: AccountsReportForm): ReportFilterValues {
  const pair = (p: { code: string; name: string }) => p.code || p.name || null;
  return {
    from_date: form.fromDate || null,
    to_date: form.toDate || null,
    customer_id: pair(form.customer),
    customer_code: form.customer.code || null,
    service_center: pair(form.serviceCenter),
    service_center_code: form.serviceCenter.code || null,
    sales_executive_id: pair(form.salesExecutive),
    sales_executive_code: form.salesExecutive.code || null,
    field_executive_id: pair(form.fieldExecutive),
    field_executive_code: form.fieldExecutive.code || null,
    type: form.type || null,
    transaction_type: form.transactionType || null,
    as_on_date: form.asOnDate ? form.toDate || form.fromDate || null : null,
    with_zero: form.withZero,
  };
}

export type ExecuteAccountsResult =
  | { status: "ok"; data: ReportExecuteResult; engineKey: string }
  | { status: "pending_engine"; message: string }
  | { status: "error"; message: string };

/** POST /reports/accounts/{reportId}/execute */
export async function executeAccountsReport(
  reportId: string,
  form: AccountsReportForm,
): Promise<ExecuteAccountsResult> {
  const detail = getAccountsReport(reportId);
  if (!detail) return { status: "error", message: "Unknown report" };

  const v = validateAccountsForm(detail, form);
  if (!v.ok) return { status: "error", message: v.message };

  if (!detail.engineKey) {
    return {
      status: "pending_engine",
      message: `${detail.label} UI is ready; engine SQL is not mapped for this report yet.`,
    };
  }

  try {
    const filters = formToEngineFilters(form);
    const validation = await validateReportFilters(detail.engineKey, filters);
    if (!validation.ok) {
      const msg =
        validation.errors
          .map((e) => e.message)
          .filter(Boolean)
          .join("; ") || "Invalid filters";
      return { status: "error", message: msg };
    }
    const data = await executeReport({
      reportKey: detail.engineKey,
      filters,
      page: 1,
      pageSize: 50,
    });
    return { status: "ok", data, engineKey: detail.engineKey };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Failed to execute report",
    };
  }
}

/** POST /reports/accounts/{reportId}/queue */
export async function queueAccountsReport(
  reportId: string,
  form: AccountsReportForm,
  format: ReportExportFormat = "CSV",
): Promise<{ status: "ok" | "pending_engine" | "error"; message: string; jobId?: string }> {
  const detail = getAccountsReport(reportId);
  if (!detail) return { status: "error", message: "Unknown report" };
  const v = validateAccountsForm(detail, form);
  if (!v.ok) return { status: "error", message: v.message };
  if (!detail.engineKey) {
    return {
      status: "pending_engine",
      message: `${detail.label} queued locally; engine job mapping is not available yet.`,
    };
  }
  try {
    const job = await createReportJob({
      reportKey: detail.engineKey,
      filters: formToEngineFilters(form),
      outputFormat: format,
    });
    return { status: "ok", message: "Added to job queue", jobId: job.id };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Queue failed",
    };
  }
}
