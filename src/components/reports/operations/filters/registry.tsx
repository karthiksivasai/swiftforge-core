/**
 * Map CourierWala Operations report ids → dedicated filter components.
 */
import type { ComponentType, ReactNode } from "react";

import { ActionLogFilters } from "@/components/reports/operations/filters/action-log-filters";
import { AwbPrintingFilters } from "@/components/reports/operations/filters/awb-printing-filters";
import { CommentViewFilters } from "@/components/reports/operations/filters/comment-view-filters";
import { DrsFilters } from "@/components/reports/operations/filters/drs-filters";
import { ForwardingNoMissingFilters } from "@/components/reports/operations/filters/forwarding-no-missing-filters";
import { LoginLogFilters } from "@/components/reports/operations/filters/login-log-filters";
import { ManifestPodFilters } from "@/components/reports/operations/filters/manifest-pod-filters";
import { ManifestReportFilters } from "@/components/reports/operations/filters/manifest-report-filters";
import { MisReportFilters } from "@/components/reports/operations/filters/mis-report-filters";
import { OkDeliveryFilters } from "@/components/reports/operations/filters/ok-delivery-filters";
import { ScanReportFilters } from "@/components/reports/operations/filters/scan-report-filters";
import { UnassignedDrsFilters } from "@/components/reports/operations/filters/unassigned-drs-filters";
import { UnassignedManifestFilters } from "@/components/reports/operations/filters/unassigned-manifest-filters";
import { UnassignedObcFilters } from "@/components/reports/operations/filters/unassigned-obc-filters";
import { UndeliveryFilters } from "@/components/reports/operations/filters/undelivery-filters";
import { UserAnalysisFilters } from "@/components/reports/operations/filters/user-analysis-filters";
import { UserEntryLogFilters } from "@/components/reports/operations/filters/user-entry-log-filters";
import type { OpsFilterProps } from "@/components/reports/operations/types";

export type OpsFilterComponent = ComponentType<OpsFilterProps & { reportTypeControl: ReactNode }>;

export const REPORT_FILTER_COMPONENTS: Record<string, OpsFilterComponent> = {
  "action-log": ActionLogFilters,
  "awb-printing": AwbPrintingFilters,
  "comment-view": CommentViewFilters,
  "drs-report": DrsFilters,
  "forwarding-no-missing": ForwardingNoMissingFilters,
  "login-log": LoginLogFilters,
  "manifest-pod": ManifestPodFilters,
  "manifest-report": ManifestReportFilters,
  "mis-report": MisReportFilters,
  "ok-delivery": OkDeliveryFilters,
  "scan-report": ScanReportFilters,
  "unassigned-drs": UnassignedDrsFilters,
  "unassigned-manifest": UnassignedManifestFilters,
  "unassigned-obc": UnassignedObcFilters,
  undelivery: UndeliveryFilters,
  "user-analysis": UserAnalysisFilters,
  "user-entry-log": UserEntryLogFilters,
};
