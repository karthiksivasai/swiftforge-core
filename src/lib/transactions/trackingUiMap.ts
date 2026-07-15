/**
 * Tracking UI ↔ RPC mapping helpers (Milestone 4F).
 */
import type { ShipmentTrackingResult } from "@/lib/transactions/resources/tracking";

const formatDisplayDate = (iso: string | null | undefined) => {
  if (!iso) return "";
  const raw = String(iso).slice(0, 10);
  const [y, m, d] = raw.split("-");
  if (!y || !m || !d) return String(iso);
  return `${d}/${m}/${y}`;
};

const formatTime = (t: string | null | undefined) => {
  if (!t) return "";
  const s = String(t);
  if (/^\d{2}:\d{2}/.test(s)) return s.replace(":", "").slice(0, 4);
  return s;
};

const partyBlock = (party: unknown, fallbackName?: string) => {
  if (party && typeof party === "object") {
    const p = party as Record<string, unknown>;
    const lines = [
      p.name,
      p.address1 ?? p.address,
      [p.city, p.state, p.country].filter(Boolean).join(", "),
      p.pin_code ? `PIN: ${p.pin_code}` : null,
      p.phone ?? p.mobile,
    ]
      .map((x) => (x == null ? "" : String(x).trim()))
      .filter(Boolean);
    if (lines.length) return lines.join("\n");
  }
  return fallbackName || "";
};

export type AwbQueryMapped = {
  awbNo: string;
  lastAwbNo: string;
  podUser: string;
  userId: string;
  customerDetails: string;
  shipperDetails: string;
  consigneeDetails: string;
  podStatus: string;
  podStatusDate: string;
  podStatusTime: string;
  podReceiverName: string;
  podRemark: string;
  podReceiveDate: string;
  vendorName: string;
  deliveryVendor: string;
  forwardingAwb: string;
  deliveryAwb: string;
  returnAwbNo: string;
  flightNo: string;
  airlines: string;
  mastAwbNo: string;
  cdNo: string;
  obcName: string;
  shipmentDetails: Record<string, string>;
  progress: Array<{
    userId: string;
    date: string;
    time: string;
    serviceCenter: string;
    statusDetails: string;
  }>;
  comments: Array<{
    userId: string;
    date: string;
    time: string;
    comment: string;
    file: string;
  }>;
  shipmentLog: Array<{
    userId: string;
    date: string;
    time: string;
    message: string;
  }>;
  statusDetails: Array<{
    user: string;
    date: string;
    time: string;
    status: string;
    remarks: string;
  }>;
  volumetric: Array<Record<string, string>>;
  proforma: Array<Record<string, string>>;
  inscan: Array<Record<string, string>>;
  manifest: Array<Record<string, string>>;
  manifestInscan: Array<Record<string, string>>;
  rowVersion: number;
  isHold: boolean;
  currentStatus: string;
  shipmentId: string;
  carrierProviderCode?: string;
  carrierBookingRef?: string;
  carrierTrackingNo?: string;
  carrierBookingStatus?: string;
  carrierLabelFileId?: string;
};

export function mapTrackingToAwbQuery(result: ShipmentTrackingResult): AwbQueryMapped | null {
  if (!result.found || !result.shipment) return null;
  const s = result.shipment;
  const awbNo = String(result.awb_no ?? s.awb_no ?? "");
  const pod = result.pod;
  const status = String(result.current_status ?? s.current_status ?? "");

  const progress = (result.tracking_events ?? []).map((ev) => ({
    userId: String(ev.user_id ?? "SYSTEM").slice(0, 8),
    date: formatDisplayDate(String(ev.event_date ?? "")),
    time: formatTime(String(ev.event_time ?? "")),
    serviceCenter: String(
      (ev.payload as Record<string, unknown> | undefined)?.service_center_code ?? "",
    ),
    statusDetails: [ev.status_text, ev.remark].filter(Boolean).map(String).join(" — "),
  }));

  const comments = (result.comments ?? []).map((c) => {
    const at = String(c.commented_at ?? "");
    return {
      userId: String(c.created_by ?? "").slice(0, 8),
      date: formatDisplayDate(at),
      time: at.includes("T") ? formatTime(at.split("T")[1]) : "",
      comment: String(c.comment ?? ""),
      file: c.file_id ? String(c.file_id).slice(0, 8) : "",
    };
  });

  const shipmentLog = (result.shipment_events ?? []).map((e) => {
    const at = String(e.created_at ?? "");
    return {
      userId: String(e.created_by ?? "").slice(0, 8),
      date: formatDisplayDate(at),
      time: at.includes("T") ? formatTime(at.split("T")[1]) : "",
      message: String(e.event_text ?? e.event_type ?? ""),
    };
  });

  const holds = (result.holds ?? []).map((h) => {
    const at = String(h.at ?? "");
    return {
      user: String(h.user_id ?? "").slice(0, 8),
      date: formatDisplayDate(at),
      time: at.includes("T") ? formatTime(at.split("T")[1]) : "",
      status: String(h.action ?? ""),
      remarks: String(h.remark ?? ""),
    };
  });

  return {
    awbNo,
    lastAwbNo: awbNo,
    podUser: pod ? "POD" : "",
    userId: "",
    customerDetails: [s.customer_code, s.customer_name].filter(Boolean).map(String).join("\n"),
    shipperDetails: partyBlock(s.shipper, String(s.shipper_name ?? "")),
    consigneeDetails: partyBlock(s.consignee, String(s.consignee_name ?? "")),
    podStatus: String(s.pod_status ?? status),
    podStatusDate: formatDisplayDate(String(s.pod_date ?? "")),
    podStatusTime: "",
    podReceiverName: String(s.pod_receiver ?? s.receiver ?? ""),
    podRemark: String(s.pod_remark ?? ""),
    podReceiveDate: formatDisplayDate(String(s.delivered_at ?? s.pod_date ?? "")),
    vendorName: "",
    deliveryVendor: "",
    forwardingAwb: String(s.forwarding_awb ?? ""),
    deliveryAwb: String(s.delivery_awb ?? ""),
    returnAwbNo: String(s.return_awb ?? ""),
    flightNo: String(s.flight_no ?? ""),
    airlines: String(s.airline ?? ""),
    mastAwbNo: "",
    cdNo: "",
    obcName: "",
    shipmentDetails: {
      date: formatDisplayDate(String(s.book_date ?? "")),
      dispatchDate: "",
      origin: String(s.origin_code ?? ""),
      destination: String(s.destination_code ?? ""),
      productType: "",
      product: String(s.product_name ?? s.product_code ?? ""),
      vendor: "",
      service: String(s.service ?? ""),
      shipValue: s.shipment_value != null ? String(s.shipment_value) : "",
      pcs: s.pieces != null ? String(s.pieces) : "",
      weight: s.actual_weight != null ? String(s.actual_weight) : "",
      vWgt: s.vol_weight != null ? String(s.vol_weight) : "",
      content: String(s.content ?? ""),
      instruction: String(s.instruction ?? ""),
      cod: "",
      manifestNo: "",
      invoiceNo: "",
      payment: String(s.payment_type ?? ""),
      inscanWeight: "",
      inscanRemark: "",
      refNo: String(s.reference_no ?? ""),
      masterAwbNo: "",
      commercial: "",
      oda: "",
      shipmentType: status,
      pincodeType: "",
      customerInvoice: "",
      csbType: "",
      drsNo: "",
      vehicleNo: "",
      remark: result.is_hold ? "ON HOLD" : "",
      fieldExecutive: "",
    },
    progress,
    comments,
    shipmentLog,
    statusDetails: holds,
    volumetric: [],
    proforma: [],
    inscan: [],
    manifest: [],
    manifestInscan: [],
    rowVersion: Number(s.row_version ?? 1),
    isHold: Boolean(result.is_hold ?? s.is_hold),
    currentStatus: status,
    shipmentId: String(s.id ?? ""),
    carrierProviderCode: s.carrier_provider_code ? String(s.carrier_provider_code) : undefined,
    carrierBookingRef: s.carrier_booking_ref ? String(s.carrier_booking_ref) : undefined,
    carrierTrackingNo: s.carrier_tracking_no ? String(s.carrier_tracking_no) : undefined,
    carrierBookingStatus: s.carrier_booking_status ? String(s.carrier_booking_status) : undefined,
    carrierLabelFileId: s.carrier_label_file_id ? String(s.carrier_label_file_id) : undefined,
  };
}
