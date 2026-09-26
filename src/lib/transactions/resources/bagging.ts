import { supabase } from "@/integrations/supabase/client";
import { type LookupPairValue } from "@/components/masters/searchable-lookup-pair";

type LookupPair = LookupPairValue;

export type BaggingListRow = {
  id: string;
  manifest_no: string;
  master_awb_no: string;
  manifest_date: string;
  origin: string;
  from_city: string;
  to_city: string;
  destination: string;
  vendor_name: string;
  vendor_code: string;
  total_awbs: number;
  total_weight: string;
  total_bags: number;
  status: string;
  created_at: string;
  service_center: string;
};

export type BaggingAwbLineDto = {
  id: string;
  bagNo: string;
  crnMhbsNo: string;
  forwardingNo: string;
  awbNo: string;
  weight: string;
  pcs: string;
  shipper: string;
  consignee: string;
  vendor: string;
  airline: string;
  service: string;
  destination: string;
};

export type BaggingHeaderDto = {
  id?: string;
  manifestNo: string;
  date: string;
  originCity: LookupPair;
  originCountry: LookupPair;
  airlinesCode: LookupPair;
  arrivalAirport: string;
  masterAirlinesPrefix: string;
  masterAwbNoPart: string;
  masterNoPart3: string;
  mawbMasterNo: string;
  vendor: LookupPair;
  cdNo: string;
  ediMasterNo: string;
  baggingRemark: string;
  serviceCenter: LookupPair;
  destCountry: LookupPair;
  destCity: LookupPair;
  flightNo1: LookupPair;
  flightNo2: LookupPair;
  arrivalDate: string;
  arrivalTime: string;
  destVendor: LookupPair;
  isForwarding: boolean;
  manifestType: "High Value" | "Low Value" | "Transhipment" | "";
  transferToUk: boolean;
  rowVersion?: number;
  searchAwbBagNo?: string;
  awbLines?: BaggingAwbLineDto[];
};

export type ShipmentBaggingLookup = {
  shipment_id: string;
  awb_no: string;
  forwarding_no: string;
  weight: string;
  pcs: string;
  shipper: string;
  consignee: string;
  vendor: string;
  airline: string;
  service: string;
  destination: string;
  current_status: string;
};

export type RecordBaggingProgressInput = {
  baggingId: string;
  bagNo: string;
  progressDate: string;
  progressTime: string;
  serviceCenterCode: string;
  exceptionCode: string;
  mode?: "add" | "delete";
};

/**
 * Fetch live list of bagging manifests.
 */
export async function listBaggings(params?: {
  productCode?: string;
  vendorCode?: string;
  search?: string;
  fromDate?: string;
  toDate?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<BaggingListRow[]> {
  const { data, error } = await supabase.rpc("list_baggings", {
    p_product_code: params?.productCode || null,
    p_vendor_code: params?.vendorCode || null,
    p_search: params?.search || null,
    p_from_date: params?.fromDate || null,
    p_to_date: params?.toDate || null,
    p_status: params?.status || null,
    p_limit: params?.limit || 500,
    p_offset: params?.offset || 0,
  });

  if (error) throw error;
  return (data || []) as BaggingListRow[];
}

export async function countBaggings(params?: {
  productCode?: string;
  vendorCode?: string;
  search?: string;
  fromDate?: string;
  toDate?: string;
  status?: string;
}): Promise<number> {
  const { data, error } = await supabase.rpc("count_baggings", {
    p_product_code: params?.productCode || null,
    p_vendor_code: params?.vendorCode || null,
    p_search: params?.search || null,
    p_from_date: params?.fromDate || null,
    p_to_date: params?.toDate || null,
    p_status: params?.status || null,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export type BaggingEventRow = {
  id: string;
  event_type: string;
  event_text: string;
  created_at: string;
};

export async function listBaggingEvents(baggingId: string): Promise<BaggingEventRow[]> {
  const { data, error } = await supabase.rpc("list_bagging_events", {
    p_bagging_id: baggingId,
  });
  if (error) throw error;
  return (data || []) as BaggingEventRow[];
}

/**
 * Fetch full details of a bagging manifest with its child bag & AWB lines.
 */
export async function getBaggingDetails(baggingId: string): Promise<BaggingHeaderDto | null> {
  const { data, error } = await supabase.rpc("get_bagging_details", {
    p_bagging_id: baggingId,
  });

  if (error) throw error;
  return data as BaggingHeaderDto | null;
}

/**
 * Atomic save / update of a bagging manifest with lines.
 */
export async function recordBagging(
  id: string | null,
  header: BaggingHeaderDto,
  lines: BaggingAwbLineDto[],
): Promise<{
  id: string;
  manifest_no: string;
  manifest_date: string;
  total_bags: number;
  total_pieces: number;
  total_weight: number;
  total_awbs: number;
  status: string;
  created_at: string;
}> {
  const { data, error } = await supabase.rpc("record_bagging", {
    p_id: id || null,
    p_header: header,
    p_lines: lines,
  });

  if (error) throw error;
  return data;
}

/**
 * Soft delete a bagging manifest.
 */
export async function deleteBagging(baggingId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("delete_bagging", {
    p_bagging_id: baggingId,
  });

  if (error) throw error;
  return Boolean(data);
}

/**
 * Lookup live shipment details by AWB / Forwarding No for bagging auto-fill.
 */
export async function fetchShipmentForBagging(
  awbNo: string,
): Promise<ShipmentBaggingLookup | null> {
  const clean = awbNo.trim();
  if (!clean) return null;

  const { data, error } = await supabase.rpc("lookup_shipment_for_bagging", {
    p_awb_no: clean,
  });

  if (error) throw new Error(error.message);
  return (data as ShipmentBaggingLookup | null) ?? null;
}

/**
 * Record a progress event for a bagging manifest or bag.
 */
export async function recordBaggingProgress(
  input: RecordBaggingProgressInput,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("record_bagging_progress", {
    p_bagging_id: input.baggingId,
    p_bag_no: input.bagNo || null,
    p_progress_date: input.progressDate,
    p_progress_time: input.progressTime,
    p_service_center_code: input.serviceCenterCode,
    p_exception_code: input.exceptionCode || null,
    p_mode: input.mode || "add",
  });

  if (error) throw error;
  return Boolean(data);
}
