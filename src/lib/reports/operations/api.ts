/**
 * Operations Reports client API — conceptual REST surface over Phase 5 RPCs.
 */
import {
  AUDIT_HUB_KEY_MAP,
  OPERATIONS_HUB_KEY_MAP,
  createReportJob,
  executeReport,
  executeReportJob,
  validateReportFilters,
  type ReportExecuteResult,
  type ReportExportFormat,
} from "@/lib/reports";
import {
  REPORT_DEFINITIONS,
  type ReportAction,
  type ReportDefinition,
} from "@/lib/operations-report-config";
import type { OperationsReportForm } from "@/components/reports/operations/types";
import { daysBetween } from "@/components/reports/operations/types";

export type OperationsReportListItem = {
  id: string;
  label: string;
  action: ReportAction;
  engineKey: string | null;
};

export type OperationsReportDetail = ReportDefinition & {
  engineKey: string | null;
};

function resolveEngineKey(opsId: string): string | null {
  if (opsId in OPERATIONS_HUB_KEY_MAP) {
    const k = OPERATIONS_HUB_KEY_MAP[opsId];
    if (k) return k;
  }
  if (opsId in AUDIT_HUB_KEY_MAP) {
    const k = AUDIT_HUB_KEY_MAP[opsId];
    if (k) return k;
  }
  return null;
}

/** GET /reports/operations — list CourierWala Operations report types. */
export function listOperationsReports(): OperationsReportListItem[] {
  return REPORT_DEFINITIONS.map((d) => ({
    id: d.id,
    label: d.label,
    action: d.action,
    engineKey: resolveEngineKey(d.id),
  }));
}

/** GET /reports/operations/{reportId} — filter metadata + engine mapping. */
export function getOperationsReport(reportId: string): OperationsReportDetail | null {
  const def = REPORT_DEFINITIONS.find((d) => d.id === reportId);
  if (!def) return null;
  return { ...def, engineKey: resolveEngineKey(reportId) };
}

export type OpsValidationResult = { ok: true } | { ok: false; message: string };

/** CourierWala 31-day / date-order validation for reports with date fields. */
export function validateOperationsForm(
  def: ReportDefinition,
  form: OperationsReportForm,
): OpsValidationResult {
  const hasDates =
    def.fields.includes("fromDate") ||
    def.secondRowFields?.includes("fromDate") ||
    def.fields.includes("toDate");
  if (!hasDates && def.id === "awb-printing") {
    return { ok: true };
  }
  if (!hasDates) return { ok: true };

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
export function formToEngineFilters(form: OperationsReportForm): Record<string, unknown> {
  const pair = (p: { code: string; name: string }) => p.code || p.name || null;
  return {
    from_date: form.fromDate || null,
    to_date: form.toDate || null,
    customer_id: pair(form.customer),
    customer_code: form.customer.code || null,
    origin: pair(form.origin),
    service_center: pair(form.serviceCenter),
    product_id: pair(form.product),
    vendor_id: pair(form.vendor),
    destination: pair(form.destination),
    zone_id: pair(form.zone),
    field_executive_id: pair(form.fieldExecutive),
    exception_id: pair(form.exception),
    payment_type: pair(form.paymentType),
    service_type: pair(form.serviceType),
    from_awb: form.fromAwb || null,
    to_awb: form.toAwb || null,
    manifest_no: form.manifestNo || null,
    format_type: form.formatType || null,
    copies: form.copies || null,
    csb_type: form.csbType || null,
    printing_forward_no: form.printingForwardNo || null,
    comment: form.comment || null,
    user_type: form.userType || null,
    user_name: form.user || null,
    log_type: form.logType || null,
    customer_type: form.customerType || null,
    product_type: form.productType || null,
    branch_type: form.branchType || null,
    status: form.status || null,
    report_type: form.secondaryReportType || null,
    type: form.type || null,
    awb_no: form.awbNo || null,
    forwarding_label_not_generated: form.forwardingLabelNotGenerated,
  };
}

export type ExecuteOperationsResult =
  | { status: "ok"; data: ReportExecuteResult; engineKey: string }
  | { status: "pending_engine"; message: string }
  | { status: "error"; message: string };

/** POST /reports/operations/{reportId}/execute */
export async function executeOperationsReport(
  reportId: string,
  form: OperationsReportForm,
): Promise<ExecuteOperationsResult> {
  const detail = getOperationsReport(reportId);
  if (!detail) return { status: "error", message: "Unknown report" };

  const v = validateOperationsForm(detail, form);
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

/** POST /reports/operations/{reportId}/export */
export async function exportOperationsReport(
  reportId: string,
  form: OperationsReportForm,
  format: ReportExportFormat,
): Promise<ExecuteOperationsResult & { jobId?: string }> {
  const detail = getOperationsReport(reportId);
  if (!detail) return { status: "error", message: "Unknown report" };
  const v = validateOperationsForm(detail, form);
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

/** POST /reports/operations/{reportId}/queue */
export async function queueOperationsReport(
  reportId: string,
  form: OperationsReportForm,
  format: ReportExportFormat = "CSV",
): Promise<{ status: "ok" | "pending_engine" | "error"; message: string; jobId?: string }> {
  const detail = getOperationsReport(reportId);
  if (!detail) return { status: "error", message: "Unknown report" };
  const v = validateOperationsForm(detail, form);
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
