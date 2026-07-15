/**
 * Statements Reports client API — conceptual REST surface over Phase 5 RPCs.
 */
import {
  STATEMENTS_HUB_KEY_MAP,
  createReportJob,
  executeReport,
  executeReportJob,
  validateReportFilters,
  type ReportExecuteResult,
  type ReportExportFormat,
  type ReportFilterValues,
} from "@/lib/reports";
import {
  STATEMENT_DEFINITIONS,
  statementHasDateRange,
  type StatementReportDefinition,
} from "@/lib/statements-report-config";
import type { StatementsReportForm } from "@/components/reports/statements/types";
import { daysBetween } from "@/components/reports/statements/types";

export type StatementsReportListItem = {
  id: string;
  label: string;
  engineKey: string | null;
};

export type StatementsReportDetail = StatementReportDefinition & {
  engineKey: string | null;
};

function resolveEngineKey(stmtId: string): string | null {
  if (stmtId in STATEMENTS_HUB_KEY_MAP) {
    return STATEMENTS_HUB_KEY_MAP[stmtId] ?? null;
  }
  return null;
}

/** GET /reports/statements — list CourierWala Statements report types. */
export function listStatementsReports(): StatementsReportListItem[] {
  return STATEMENT_DEFINITIONS.map((d) => ({
    id: d.id,
    label: d.label,
    engineKey: resolveEngineKey(d.id),
  }));
}

/** GET /reports/statements/{reportId} — filter metadata + engine mapping. */
export function getStatementsReport(reportId: string): StatementsReportDetail | null {
  const def = STATEMENT_DEFINITIONS.find((d) => d.id === reportId);
  if (!def) return null;
  return { ...def, engineKey: resolveEngineKey(reportId) };
}

export type StmtValidationResult = { ok: true } | { ok: false; message: string };

/** CourierWala 31-day / date-order validation for reports with date fields. */
export function validateStatementsForm(
  def: StatementReportDefinition,
  form: StatementsReportForm,
): StmtValidationResult {
  if (!statementHasDateRange(def)) return { ok: true };

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

/** Map UI form → Phase 5 filter bag (snake_case keys used by engine). */
export function formToEngineFilters(form: StatementsReportForm): ReportFilterValues {
  const pair = (p: { code: string; name: string }) => p.code || p.name || null;
  return {
    from_date: form.fromDate || null,
    to_date: form.toDate || null,
    customer_id: pair(form.customer),
    customer_code: form.customer.code || null,
    origin: pair(form.origin),
    service_center: pair(form.serviceCenter),
    service_center_code: form.serviceCenter.code || null,
    product_id: pair(form.product),
    service_type: pair(form.serviceType),
    vendor_id: pair(form.vendor),
    destination: pair(form.destination),
    destination_code: form.destination.code || null,
    state_id: pair(form.state),
    sales_executive_id: pair(form.salesExecutive),
    payment_type: pair(form.paymentType),
    customer_type: form.customerType || null,
    product_type: form.productType || null,
    business_channel: form.businessChannel || null,
    status: form.status || null,
    summary: form.summary || null,
    obc_id: pair(form.obc),
    filter_type: form.filterType || null,
    obc_report: form.obcReport,
    branch_type: form.branchType || null,
    vendor_type: form.vendorType || null,
    flight_type: form.flightType || null,
    report_type: form.secondaryReportType || null,
    type: form.type || null,
  };
}

export type ExecuteStatementsResult =
  | { status: "ok"; data: ReportExecuteResult; engineKey: string }
  | { status: "pending_engine"; message: string }
  | { status: "error"; message: string };

/** POST /reports/statements/{reportId}/execute */
export async function executeStatementsReport(
  reportId: string,
  form: StatementsReportForm,
): Promise<ExecuteStatementsResult> {
  const detail = getStatementsReport(reportId);
  if (!detail) return { status: "error", message: "Unknown report" };

  const v = validateStatementsForm(detail, form);
  if (!v.ok) return { status: "error", message: v.message };

  const engineKey = detail.engineKey;
  if (!engineKey) {
    return {
      status: "pending_engine",
      message: `${detail.label} UI is ready; engine SQL is not mapped for this report yet.`,
    };
  }

  try {
    const filters = formToEngineFilters(form);
    const validation = await validateReportFilters(engineKey, filters);
    if (!validation.ok) {
      const msg =
        validation.errors
          .map((e) => e.message)
          .filter(Boolean)
          .join("; ") || "Invalid filters";
      return { status: "error", message: msg };
    }
    const data = await executeReport({
      reportKey: engineKey,
      filters,
      page: 1,
      pageSize: 50,
    });
    return { status: "ok", data, engineKey };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Failed to execute report",
    };
  }
}

/** POST /reports/statements/{reportId}/export */
export async function exportStatementsReport(
  reportId: string,
  form: StatementsReportForm,
  format: ReportExportFormat,
): Promise<ExecuteStatementsResult & { jobId?: string }> {
  const detail = getStatementsReport(reportId);
  if (!detail) return { status: "error", message: "Unknown report" };
  const v = validateStatementsForm(detail, form);
  if (!v.ok) return { status: "error", message: v.message };
  if (!detail.engineKey) {
    return {
      status: "pending_engine",
      message: `${detail.label} export is not mapped to the reporting engine yet.`,
    };
  }
  try {
    const filters = formToEngineFilters(form);
    const job = await createReportJob({
      reportKey: detail.engineKey,
      filters,
      outputFormat: format,
    });
    await executeReportJob(job.id);
    return {
      status: "ok",
      data: {
        report_key: detail.engineKey,
        title: detail.label,
        columns: [],
        rows: [],
        total: 0,
        page: 1,
        page_size: 0,
        sort_by: null,
        sort_dir: null,
        filters,
      },
      engineKey: detail.engineKey,
      jobId: job.id,
    };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Export failed",
    };
  }
}

/** POST /reports/statements/{reportId}/queue */
export async function queueStatementsReport(
  reportId: string,
  form: StatementsReportForm,
  format: ReportExportFormat = "CSV",
): Promise<{ status: "ok" | "pending_engine" | "error"; message: string; jobId?: string }> {
  const detail = getStatementsReport(reportId);
  if (!detail) return { status: "error", message: "Unknown report" };
  const v = validateStatementsForm(detail, form);
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
