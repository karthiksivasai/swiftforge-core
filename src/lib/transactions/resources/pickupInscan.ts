import { supabase } from "@/integrations/supabase/client";

export type PickupInscanEventRow = {
  id: string;
  tenant_id: string;
  service_center_id?: string | null;
  service_center_code: string;
  scan_date: string;
  scan_time: string;
  pickup_id?: string | null;
  pickup_no?: string | null;
  awb_no: string;
  shipment_id?: string | null;
  field_executive_id?: string | null;
  field_executive_code?: string | null;
  vendor_id?: string | null;
  vendor_code?: string | null;
  product_id?: string | null;
  product_code?: string | null;
  payment_type?: string | null;
  consignee_name?: string | null;
  is_held: boolean;
  hold_reason_code?: string | null;
  remark_code?: string | null;
  hub_scan: boolean;
  created_at: string;
  created_by?: string | null;
  updated_at: string;
  updated_by?: string | null;
  row_version: number;
};

export type RecordPickupInscanInput = {
  scanDate: string;
  scanTime: string;
  serviceCenterCode: string;
  awbNo: string;
  pickupNo?: string | null;
  fieldExecutiveId?: string | null;
  fieldExecutiveCode?: string | null;
  vendorId?: string | null;
  vendorCode?: string | null;
  productId?: string | null;
  productCode?: string | null;
  paymentType?: string | null;
  consigneeName?: string | null;
  isHeld?: boolean;
  holdReasonCode?: string | null;
  remarkCode?: string | null;
  hubScan?: boolean;
};

export type InscanReconciliationResult = {
  summary: {
    total_pickups_promised: number;
    total_pickups_confirmed: number;
    total_pickups_pending: number;
    total_inscans_recorded: number;
    total_inscans_held: number;
  };
  pending_pickups: Array<{
    id: string;
    pickup_no: number;
    pickup_date: string;
    status: string;
    customer_name?: string | null;
    shipper_name?: string | null;
    field_executive?: string | null;
    mobile_no: string;
    area?: string | null;
  }>;
};

/**
 * Atomic inscan creation RPC with duplicate guard, pickup hand-off, and state machine transition.
 */
export async function recordPickupInscan(
  input: RecordPickupInscanInput,
): Promise<{
  id: string;
  awb_no: string;
  pickup_no?: string;
  service_center_code: string;
  scan_date: string;
  scan_time: string;
  is_held: boolean;
  remark_code?: string;
  pickup_confirmed: boolean;
  created_at: string;
}> {
  const { data, error } = await supabase.rpc("record_pickup_inscan", {
    p_scan_date: input.scanDate,
    p_scan_time: input.scanTime,
    p_service_center_code: input.serviceCenterCode,
    p_awb_no: input.awbNo,
    p_pickup_no: input.pickupNo || null,
    p_field_executive_id: input.fieldExecutiveId || null,
    p_field_executive_code: input.fieldExecutiveCode || null,
    p_vendor_id: input.vendorId || null,
    p_vendor_code: input.vendorCode || null,
    p_product_id: input.productId || null,
    p_product_code: input.productCode || null,
    p_payment_type: input.paymentType || null,
    p_consignee_name: input.consigneeName || null,
    p_is_held: Boolean(input.isHeld),
    p_hold_reason_code: input.holdReasonCode || null,
    p_remark_code: input.remarkCode || null,
    p_hub_scan: input.hubScan ?? true,
  });

  if (error) throw error;
  return data;
}

/**
 * Query recent pickup inscan events for current service center / date.
 */
export async function listPickupInscans(params?: {
  scanDate?: string;
  serviceCenterCode?: string;
  limit?: number;
}): Promise<PickupInscanEventRow[]> {
  let query = supabase
    .from("pickup_inscan_events")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (params?.scanDate) {
    query = query.eq("scan_date", params.scanDate);
  }
  if (params?.serviceCenterCode) {
    query = query.ilike("service_center_code", params.serviceCenterCode);
  }
  if (params?.limit) {
    query = query.limit(params.limit);
  } else {
    query = query.limit(100);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as PickupInscanEventRow[];
}

/**
 * Fetch promised vs received reconciliation between Pickups and Inscan events.
 */
export async function getInscanReconciliation(params: {
  fromDate: string;
  toDate: string;
  branchId?: string;
}): Promise<InscanReconciliationResult> {
  const { data, error } = await supabase.rpc("get_inscan_reconciliation", {
    p_from_date: params.fromDate,
    p_to_date: params.toDate,
    p_branch_id: params.branchId || null,
  });

  if (error) throw error;
  return data as InscanReconciliationResult;
}

export type RecordUndeliveryScanInput = {
  scanDate: string;
  scanTime: string;
  serviceCenterCode: string;
  awbNo: string;
  pickupNo?: string | null;
  vendorId?: string | null;
  vendorCode?: string | null;
  remarkCode?: string | null;
  hubScan?: boolean;
};

/**
 * Atomic un-delivery scan RPC:
 * - Eligibility: OUT_FOR_DELIVERY only.
 * - Dual state transition: OUT_FOR_DELIVERY → UNDELIVERED → UNDELIVERED_RECEIVED.
 * - Duplicate guard: same AWB + hub + date (event_type = UNDELIVERY_SCAN).
 * - Append-only shipment_scan_events audit.
 */
export async function recordUndeliveryScan(
  input: RecordUndeliveryScanInput,
): Promise<{
  id: string;
  awb_no: string;
  service_center_code: string;
  scan_date: string;
  scan_time: string;
  remark_code?: string;
  created_at: string;
}> {
  const { data, error } = await supabase.rpc("record_undelivery_scan", {
    p_scan_date: input.scanDate,
    p_scan_time: input.scanTime,
    p_service_center_code: input.serviceCenterCode,
    p_awb_no: input.awbNo,
    p_pickup_no: input.pickupNo || null,
    p_vendor_id: input.vendorId || null,
    p_vendor_code: input.vendorCode || null,
    p_remark_code: input.remarkCode || null,
    p_hub_scan: input.hubScan ?? true,
  });

  if (error) throw error;
  return data;
}

/**
 * Query recent un-delivery scan events (UNDELIVERY_SCAN rows) for the current
 * service center / date. Shares the pickup_inscan_events table.
 */
export async function listUndeliveryInscans(params?: {
  scanDate?: string;
  serviceCenterCode?: string;
  limit?: number;
}): Promise<PickupInscanEventRow[]> {
  let query = supabase
    .from("pickup_inscan_events")
    .select("*")
    .eq("event_type", "UNDELIVERY_SCAN")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (params?.scanDate) {
    query = query.eq("scan_date", params.scanDate);
  }
  if (params?.serviceCenterCode) {
    query = query.ilike("service_center_code", params.serviceCenterCode);
  }
  if (params?.limit) {
    query = query.limit(params.limit);
  } else {
    query = query.limit(100);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as PickupInscanEventRow[];
}

/**
 * Fetch active inscan remarks from master.
 */
export async function listInscanRemarks(): Promise<
  Array<{ id: string; code: string; name: string; category: string }>
> {
  const { data, error } = await supabase
    .from("inscan_remarks")
    .select("id, code, name, category")
    .eq("status", "ACTIVE")
    .is("deleted_at", null)
    .order("code", { ascending: true });

  if (error) throw error;
  return data || [];
}
