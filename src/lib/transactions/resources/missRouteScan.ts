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
export async function findShipmentByAwb(awbNo: string): Promise<ShipmentRef | null> {
  const clean = awbNo.trim();
  if (!clean) return null;

  const { data, error } = await supabase
    .from("shipments")
    .select("id, awb_no, forwarding_no, current_status")
    .or(`awb_no.eq.${clean},forwarding_no.eq.${clean}`)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) return null;
  return data as ShipmentRef;
}

/**
 * Duplicate guard: Check if shipment is already marked as misrouted.
 */
export async function isAlreadyMisrouted(awbNo: string, shipmentId?: string): Promise<boolean> {
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

  // 2. Check tracking events table
  try {
    const { data: events } = await supabase
      .from("tracking_events")
      .select("id, event_name")
      .eq("awb_no", clean)
      .ilike("event_name", "%mis routed%");

    if (events && events.length > 0) {
      return true;
    }
  } catch {
    /* Ignore schema discrepancy fallback */
  }

  return false;
}

/**
 * Record "Shipment Mis routed" tracking event and update shipment status.
 */
export async function recordMissRoute(input: RecordMissRouteInput): Promise<RecordMissRouteResult> {
  const awb = input.awbNo.trim();
  if (!awb) {
    return { success: false, error: "AWB No is required" };
  }

  // 1. Verify AWB existence
  const shipment = await findShipmentByAwb(awb);
  if (!shipment) {
    return { success: false, error: "AWB not found" };
  }

  // 2. Duplicate Check
  const alreadyMisrouted = await isAlreadyMisrouted(awb, shipment.id);
  if (alreadyMisrouted) {
    return { success: false, error: "AWB already marked misrouted" };
  }

  // 3. Persist to DB via RPC or Direct Update
  try {
    // Attempt Supabase RPC record_miss_route_scan if present
    const { data: rpcData, error: rpcErr } = await supabase.rpc("record_miss_route_scan", {
      p_awb_no: awb,
      p_service_center: input.serviceCenter,
      p_scan_date: input.scanDate,
      p_scan_time: input.scanTime,
      p_event: input.event,
    });

    if (!rpcErr && rpcData) {
      const res = rpcData as { success?: boolean; error?: string };
      if (res.error) {
        return { success: false, error: res.error };
      }
      return { success: true, awb_no: awb, message: `AWB ${awb} saved` };
    }
  } catch {
    /* Fallback to direct mutation */
  }

  // Fallback direct mutation: update shipments table + tracking progress
  try {
    const { error: updateErr } = await supabase
      .from("shipments")
      .update({ current_status: "MISROUTED" })
      .eq("id", shipment.id);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    // Write tracking progress event
    await addTrackingProgress({
      awb_no: awb,
      fields: {
        event_name: input.event,
        status: "MISROUTED",
        location: input.serviceCenter,
        occurred_at: `${input.scanDate}T${input.scanTime}:00Z`,
        remarks: `Mis-routed scan at ${input.serviceCenter}`,
      },
    });
  } catch {
    /* If tracking progress RPC fails, shipment status update still succeeded */
  }

  return {
    success: true,
    awb_no: awb,
    message: `AWB ${awb} saved`,
  };
}
