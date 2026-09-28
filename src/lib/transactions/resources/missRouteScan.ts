import { supabase } from "@/integrations/supabase/client";
import { addTrackingProgress } from "@/lib/transactions/resources/tracking";

export type ShipmentRef = {
  id: string;
  awb_no: string;
  forwarding_no?: string | null;
  current_status?: string | null;
};

export type RecordMissRouteInput = {
  awbNo: string;
  scanDate: string;
  scanTime: string;
  serviceCenter: string;
  event: string;
};

export type RecordMissRouteResult = {
  success: boolean;
  awb_no?: string;
  message?: string;
  error?: string;
};

/**
 * Verify whether an AWB / Forwarding No exists in Supabase shipments table.
 */
const SHIPMENT_LOOKUP_COLUMNS = "id, awb_no, forwarding_no, current_status";

export async function findShipmentByAwb(awbNo: string): Promise<ShipmentRef | null> {
  const clean = awbNo.trim();
  if (!clean) return null;

  const byAwb = await supabase
    .from("shipments")
    .select(SHIPMENT_LOOKUP_COLUMNS)
    .eq("awb_no", clean)
    .is("deleted_at", null)
    .maybeSingle();
  if (!byAwb.error && byAwb.data) return byAwb.data as ShipmentRef;

  const byForwarding = await supabase
    .from("shipments")
    .select(SHIPMENT_LOOKUP_COLUMNS)
    .eq("forwarding_no", clean)
    .is("deleted_at", null)
    .maybeSingle();
  if (!byForwarding.error && byForwarding.data) return byForwarding.data as ShipmentRef;
  return null;
}

/**
 * Duplicate guard: Check if shipment is already marked as misrouted.
 */
export async function isAlreadyMisrouted(awbNo: string, shipmentIdArg?: string): Promise<boolean> {
  const clean = awbNo.trim();
  if (!clean) return false;

  // 1. Check current status on shipment
  const shipment = await findShipmentByAwb(clean);
  if (shipment?.current_status) {
    const status = shipment.current_status.toUpperCase();
    if (status === "MISROUTED" || status === "MIS_ROUTED" || status === "ARRIVED_MIS_ROUTED") {
      return true;
    }
  }

  const shipmentId = shipmentIdArg ?? shipment?.id;
  if (!shipmentId) return false;

  const { data: events, error } = await supabase
    .from("tracking_events")
    .select("id, status_text")
    .eq("shipment_id", shipmentId)
    .ilike("status_text", "%mis routed%")
    .is("deleted_at", null)
    .limit(1);

  if (error || !events) return false;
  return events.length > 0;
}

/**
 * Record "Shipment Mis routed" tracking event and update shipment status.
 */
export async function recordMissRoute(input: RecordMissRouteInput): Promise<RecordMissRouteResult> {
  const awb = input.awbNo.trim();
  const serviceCenter = input.serviceCenter.trim();
  const scanDate = input.scanDate.trim();
  const scanTime = input.scanTime.trim();
  if (!awb) {
    return { success: false, error: "AWB No is required" };
  }
  if (!serviceCenter) {
    return { success: false, error: "Service Center is required" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scanDate)) {
    return { success: false, error: "Scan Date is required" };
  }
  if (!/^\d{4}$/.test(scanTime)) {
    return { success: false, error: "Scan Time is required" };
  }

  const shipment = await findShipmentByAwb(awb);
  if (!shipment) {
    return { success: false, error: "AWB not found" };
  }

  const alreadyMisrouted = await isAlreadyMisrouted(shipment.awb_no, shipment.id);
  if (alreadyMisrouted) {
    return { success: false, error: "AWB already marked misrouted" };
  }

  try {
    await addTrackingProgress({
      awb_no: shipment.awb_no,
      fields: {
        event_date: scanDate,
        event_time: scanTime,
        service_center_code: serviceCenter,
        remark: `Mis-routed scan at ${serviceCenter}`,
        status_text: input.event.trim() || "Shipment Mis routed",
        to_status: "MISROUTED",
      },
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to record mis-route scan",
    };
  }

  return {
    success: true,
    awb_no: shipment.awb_no,
    message: `AWB ${shipment.awb_no} saved`,
  };
}
