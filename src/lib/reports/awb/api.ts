/**
 * AWB Reports client API — conceptual REST surface over Phase 5 RPCs.
 */
import {
  createReportJob,
  executeReport,
  executeReportJob,
  validateReportFilters,
  type ReportExecuteResult,
  type ReportExportFormat,
  type ReportFilterValues,
} from "@/lib/reports";
import { AWB_HUB_KEY_MAP } from "@/lib/reports/awbKeys";
import {
  AWB_REPORT_DEFINITIONS,
  awbHasDateRange,
  type AwbReportDefinition,
} from "@/lib/awb-report-config";
import type { AwbReportForm } from "@/components/reports/awb/types";
import { daysBetween } from "@/components/reports/awb/types";

export type AwbReportListItem = {
  id: string;
  label: string;
  engineKey: string | null;
};

export type AwbReportDetail = AwbReportDefinition & {
  engineKey: string | null;
};

function resolveEngineKey(awbId: string): string | null {
  if (awbId in AWB_HUB_KEY_MAP) {
    return AWB_HUB_KEY_MAP[awbId] ?? null;
  }
  return null;
}

/** GET /reports/awb — list CourierWala AWB report types. */
export function listAwbReports(): AwbReportListItem[] {
  return AWB_REPORT_DEFINITIONS.map((d) => ({
    id: d.id,
    label: d.label,
    engineKey: resolveEngineKey(d.id),
  }));
}

/** GET /reports/awb/{reportId} — filter metadata + engine mapping. */
export function getAwbReport(reportId: string): AwbReportDetail | null {
  const def = AWB_REPORT_DEFINITIONS.find((d) => d.id === reportId);
  if (!def) return null;
  return { ...def, engineKey: resolveEngineKey(reportId) };
}

export type AwbValidationResult = { ok: true } | { ok: false; message: string };

/** CourierWala 31-day / date-order validation for reports with date fields. */
export function validateAwbForm(
  def: AwbReportDefinition,
  form: AwbReportForm,
): AwbValidationResult {
  if (!awbHasDateRange(def)) return { ok: true };

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
export function formToEngineFilters(form: AwbReportForm): ReportFilterValues {
  const pair = (p: { code: string; name: string }) => p.code || p.name || null;
  return {
    from_date: form.fromDate || null,
    to_date: form.toDate || null,
    report_for: form.reportFor || null,
    customer_id: pair(form.customer),
    customer_code: form.customer.code || null,
    origin: pair(form.origin),
    service_center: pair(form.serviceCenter),
    service_center_code: form.serviceCenter.code || null,
    product_id: pair(form.product),
    vendor_id: pair(form.vendor),
    service_type: pair(form.serviceType),
    destination: pair(form.destination),
    destination_code: form.destination.code || null,
    payment_type: pair(form.paymentType),
    contract_head: pair(form.contractHead),
    awb_no: form.awbNo || null,
    instruction: form.instruction || null,
    manifest_no: form.manifestNo || null,
    from_manifest_no: form.fromManifestNo || null,
    to_manifest_no: form.toManifestNo || null,
    invoice_no: form.invoiceNo || null,
    customer_type: form.customerType || null,
    format_type: form.formatType || null,
    business_channel: form.businessChannel || null,
    charge_type: form.chargeType || null,
    product_type: form.productType || null,
    tax: form.tax || null,
    lock_type: form.lockType || null,
    register_type: form.registerType || null,
    type: form.type || null,
    billed: form.billed,
    un_billed: form.unBilled,
    summary: form.summary,
    other_charges: form.otherCharges,
  };
}

export type ExecuteAwbResult =
  | { status: "ok"; data: ReportExecuteResult; engineKey: string }
  | { status: "pending_engine"; message: string }
  | { status: "error"; message: string };

/** POST /reports/awb/{reportId}/execute */
export async function executeAwbReport(
  reportId: string,
  form: AwbReportForm,
): Promise<ExecuteAwbResult> {
  const detail = getAwbReport(reportId);
  if (!detail) return { status: "error", message: "Unknown report" };

  const v = validateAwbForm(detail, form);
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

/** POST /reports/awb/{reportId}/queue */
export async function queueAwbReport(
  reportId: string,
  form: AwbReportForm,
  format: ReportExportFormat = "CSV",
): Promise<{ status: "ok" | "pending_engine" | "error"; message: string; jobId?: string }> {
  const detail = getAwbReport(reportId);
  if (!detail) return { status: "error", message: "Unknown report" };
  const v = validateAwbForm(detail, form);
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

/** POST /reports/awb/{reportId}/export */
export async function exportAwbReport(
  reportId: string,
  form: AwbReportForm,
  format: ReportExportFormat,
): Promise<ExecuteAwbResult & { jobId?: string }> {
  const detail = getAwbReport(reportId);
  if (!detail) return { status: "error", message: "Unknown report" };
  const v = validateAwbForm(detail, form);
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
