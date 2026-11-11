import { supabase } from "@/integrations/supabase/client";

import type { ZoneRateCell } from "./file";

export type ZoneRateScope = {
  customerId?: string | null;
  originId?: string | null;
  productCodes?: string[];
  rateKind: "zone" | "country";
  roundOff: boolean;
};

export type ZoneRatePreviewRow = {
  row_no: number;
  service: string;
  zone: string;
  product: string;
  weight_from: number;
  weight_to: number;
  amount: number;
  status: "OK" | "FAILED";
  outcome: "NEW" | "REPLACE" | "UNCHANGED" | null;
  reason: string | null;
};

export type ZoneRatePreview = {
  total: number;
  ok_count: number;
  failed_count: number;
  new_count: number;
  replace_count: number;
  unchanged_count: number;
  rows: ZoneRatePreviewRow[];
};

export type ZoneRateApplyResult = {
  imported: number;
  new_count: number;
  replace_count: number;
  unchanged_count: number;
  skipped: number;
};

function payload(rows: ZoneRateCell[]) {
  return rows.map((row) => ({
    row_no: row.row_no,
    service: row.service,
    zone: row.zone,
    weight_from: row.weight_from,
    weight_to: row.weight_to,
    amount: row.amount,
  }));
}

function scopeArgs(scope: ZoneRateScope) {
  return {
    p_customer_id: scope.customerId || null,
    p_origin_id: scope.originId || null,
    p_product_codes: scope.productCodes?.length ? scope.productCodes : null,
    p_rate_kind: scope.rateKind,
    p_round_off: scope.roundOff,
  };
}

export async function previewZoneRateImport(
  vendorId: string,
  effectiveDate: string,
  rows: ZoneRateCell[],
  scope: ZoneRateScope,
): Promise<ZoneRatePreview> {
  const { data, error } = await supabase.rpc("preview_zone_rate_import", {
    p_vendor_id: vendorId,
    p_effective_date: effectiveDate,
    p_rows: payload(rows),
    ...scopeArgs(scope),
  });
  if (error) throw new Error(error.message);
  return data as ZoneRatePreview;
}

export async function applyZoneRateImport(
  vendorId: string,
  effectiveDate: string,
  rows: ZoneRateCell[],
  skipFailed: boolean,
  scope: ZoneRateScope,
): Promise<ZoneRateApplyResult> {
  const { data, error } = await supabase.rpc("apply_zone_rate_import", {
    p_vendor_id: vendorId,
    p_effective_date: effectiveDate,
    p_rows: payload(rows),
    p_skip_failed: skipFailed,
    ...scopeArgs(scope),
  });
  if (error) throw new Error(error.message);
  return data as ZoneRateApplyResult;
}
