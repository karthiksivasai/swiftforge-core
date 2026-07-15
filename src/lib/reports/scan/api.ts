/**
 * Scan Reports client API — conceptual REST surface over Phase 5 RPCs.
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
import { SCAN_HUB_KEY_MAP } from "@/lib/reports/scanKeys";
import {
  SCAN_REPORT_DEFINITIONS,
  scanHasDateRange,
  scanRequiresManifestNo,
  type ScanReportDefinition,
} from "@/lib/scan-report-config";
import type { ScanReportForm } from "@/components/reports/scan/types";
import { daysBetween } from "@/components/reports/scan/types";

export type ScanReportListItem = {
  id: string;
  label: string;
  action: ScanReportDefinition["action"];
  engineKey: string | null;
};

export type ScanReportDetail = ScanReportDefinition & {
  engineKey: string | null;
};

function resolveEngineKey(scanId: string): string | null {
  if (scanId in SCAN_HUB_KEY_MAP) {
    return SCAN_HUB_KEY_MAP[scanId] ?? null;
  }
  return null;
}

function datePair(form: ScanReportForm, def: ScanReportDefinition): { from: string; to: string } {
  const all = [...def.fields, ...(def.secondRowFields ?? []), ...(def.extraRows?.flat() ?? [])];
  if (all.includes("fromManifestDate")) {
    return { from: form.fromManifestDate, to: form.toManifestDate };
  }
  if (all.includes("fromBookingDate")) {
    return { from: form.fromBookingDate, to: form.toBookingDate };
  }
  return { from: form.fromDate, to: form.toDate };
}

/** GET /reports/scan — list CourierWala Scan report types. */
export function listScanReports(): ScanReportListItem[] {
  return SCAN_REPORT_DEFINITIONS.map((d) => ({
    id: d.id,
    label: d.label,
    action: d.action,
    engineKey: resolveEngineKey(d.id),
  }));
}

/** GET /reports/scan/{reportId} */
export function getScanReport(reportId: string): ScanReportDetail | null {
  const def = SCAN_REPORT_DEFINITIONS.find((d) => d.id === reportId);
  if (!def) return null;
  return { ...def, engineKey: resolveEngineKey(reportId) };
}

export type ScanValidationResult = { ok: true } | { ok: false; message: string };

export function validateScanForm(
  def: ScanReportDefinition,
  form: ScanReportForm,
): ScanValidationResult {
  if (scanRequiresManifestNo(def) && !form.manifestNo.trim()) {
    return { ok: false, message: "Manifest No. is required" };
  }

  if (!scanHasDateRange(def)) return { ok: true };

  const { from, to } = datePair(form, def);
  if (!from.trim() || !to.trim()) {
    return { ok: false, message: "From Date and To Date are required" };
  }
  if (from > to) {
    return { ok: false, message: "From Date cannot be after To Date" };
  }
  if (daysBetween(from, to) > 31) {
    return { ok: false, message: "Report period cannot exceed 31 days" };
  }
  return { ok: true };
}

export function formToEngineFilters(form: ScanReportForm): ReportFilterValues {
  const pair = (p: { code: string; name: string }) => p.code || p.name || null;
  return {
    from_manifest_date: form.fromManifestDate || null,
    to_manifest_date: form.toManifestDate || null,
    from_date: form.fromDate || form.fromManifestDate || form.fromBookingDate || null,
    to_date: form.toDate || form.toManifestDate || form.toBookingDate || null,
    from_booking_date: form.fromBookingDate || null,
    to_booking_date: form.toBookingDate || null,
    manifest_no: form.manifestNo || null,
    bag_no: form.bagNo || null,
    service_center: pair(form.serviceCenter),
    service_center_code: form.serviceCenter.code || null,
    service_type: pair(form.serviceType),
    origin: pair(form.origin),
    destination: pair(form.destination),
    destination_code: form.destination.code || null,
    customer_id: pair(form.customer),
    customer_code: form.customer.code || null,
    vendor_id: pair(form.vendor),
    forwarding_vendor_id: pair(form.forwardingVendor),
    product_id: pair(form.product),
    exception_id: pair(form.exception),
    status: form.status || null,
    format_type: form.formatType || null,
    csb_type: form.csbType || null,
    awb_no: form.awbNo || null,
    forwarding_no: form.forwardingNo || null,
    invoice_no: form.invoiceNo || null,
    original_shipper: form.originalShipper,
    with_club_awb_no: form.withClubAwbNo,
    type: form.type || null,
    summary: form.type === "Summary",
  };
}

export type ExecuteScanResult =
  | { status: "ok"; data: ReportExecuteResult; engineKey: string }
  | { status: "pending_engine"; message: string }
  | { status: "error"; message: string };

/** POST /reports/scan/{reportId}/execute */
export async function executeScanReport(
  reportId: string,
  form: ScanReportForm,
): Promise<ExecuteScanResult> {
  const detail = getScanReport(reportId);
  if (!detail) return { status: "error", message: "Unknown report" };

  const v = validateScanForm(detail, form);
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

/** POST /reports/scan/{reportId}/queue */
export async function queueScanReport(
  reportId: string,
  form: ScanReportForm,
  format: ReportExportFormat = "CSV",
): Promise<{ status: "ok" | "pending_engine" | "error"; message: string; jobId?: string }> {
  const detail = getScanReport(reportId);
  if (!detail) return { status: "error", message: "Unknown report" };
  const v = validateScanForm(detail, form);
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

/** POST /reports/scan/{reportId}/export (print/download path) */
export async function exportScanReport(
  reportId: string,
  form: ScanReportForm,
  format: ReportExportFormat = "CSV",
): Promise<ExecuteScanResult & { jobId?: string }> {
  const detail = getScanReport(reportId);
  if (!detail) return { status: "error", message: "Unknown report" };
  const v = validateScanForm(detail, form);
  if (!v.ok) return { status: "error", message: v.message };
  if (!detail.engineKey) {
    return {
      status: "pending_engine",
      message: `${detail.label} print/export is not mapped to the reporting engine yet.`,
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
