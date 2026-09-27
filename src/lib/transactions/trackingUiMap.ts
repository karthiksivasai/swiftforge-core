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
    const name = [p.company_name, p.contact_name, p.name]
      .map((x) => (x == null ? "" : String(x).trim()))
      .filter(Boolean)
      .join("\n");
    const pin = p.pincode ?? p.pin_code;
    const phone = p.telephone ?? p.phone ?? p.mobile;
    const lines = [
      name,
      p.address1 ?? p.address,
      p.address2,
      [p.city, p.state, p.country].filter(Boolean).join(", "),
      pin ? `PIN: ${pin}` : null,
      phone,
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
    branchId: string;
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
  const status = String(result.current_status ?? s.current_status ?? "");

  const progress = (result.tracking_events ?? []).map((ev) => ({
    userId: ev.user_id ? String(ev.user_id) : "",
    branchId: ev.branch_id ? String(ev.branch_id) : "",
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
      userId: c.created_by ? String(c.created_by) : "",
      date: formatDisplayDate(at),
      time: at.includes("T") ? formatTime(at.split("T")[1]) : "",
      comment: String(c.comment ?? ""),
      file: c.file_id ? String(c.file_id) : "",
    };
  });

  const shipmentLog = (result.shipment_events ?? []).map((e) => {
    const at = String(e.created_at ?? "");
    return {
      userId: e.created_by ? String(e.created_by) : "",
      date: formatDisplayDate(at),
      time: at.includes("T") ? formatTime(at.split("T")[1]) : "",
      message: String(e.event_text ?? e.event_type ?? ""),
    };
  });

  const holds = (result.holds ?? []).map((h) => {
    const at = String(h.at ?? "");
    return {
      user: h.user_id ? String(h.user_id) : "",
      date: formatDisplayDate(at),
      time: at.includes("T") ? formatTime(at.split("T")[1]) : "",
      status: String(h.action ?? ""),
      remarks: String(h.remark ?? ""),
    };
  });

  return {
    awbNo,
    lastAwbNo: awbNo,
    podUser: "",
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
      dispatchDate: formatDisplayDate(String(s.dispatch_date ?? "")),
      origin: String(s.origin_code ?? ""),
      destination: String(s.destination_code ?? ""),
      productType: String(s.product_type ?? ""),
      product: String(s.product_name ?? s.product_code ?? ""),
      vendor: String(s.vendor_code ?? s.vendor_name ?? ""),
      service: String(s.service ?? ""),
      shipValue: s.shipment_value != null ? String(s.shipment_value) : "",
      pcs: s.pieces != null ? String(s.pieces) : "",
      weight: s.actual_weight != null ? String(s.actual_weight) : "",
      vWgt: s.vol_weight != null ? String(s.vol_weight) : "",
      content: String(s.content ?? ""),
      instruction: String(s.instruction ?? ""),
      cod: s.cod_amount != null ? String(s.cod_amount) : "",
      manifestNo: String(s.manifest_no ?? ""),
      invoiceNo: String(s.invoice_no ?? ""),
      payment: String(s.payment_type ?? ""),
      airline: String(s.airline ?? s.airline_code ?? ""),
      inscanWeight: s.inscan_weight != null ? String(s.inscan_weight) : "",
      club: typeof s.is_clubbed === "boolean" ? (s.is_clubbed ? "Yes" : "No") : "",
      hold: result.is_hold ? "Yes" : "No",
      inscanRemark: String(s.inscan_remark ?? ""),
      refNo: String(s.reference_no ?? ""),
      masterAwbNo: String(s.master_awb_no ?? ""),
      eAwbNo: String(s.eawb_no ?? s.master_eawb ?? ""),
      drsVehicle: String(s.drs_vehicle ?? ""),
      drsDriver: String(s.drs_driver ?? ""),
      manifestVehicle: String(s.manifest_vehicle ?? ""),
      manifestDriver: String(s.manifest_driver ?? ""),
      assignTo: String(s.assign_to ?? ""),
      commercial: s.is_commercial != null ? (s.is_commercial ? "Yes" : "No") : "",
      oda: s.is_oda != null ? (s.is_oda ? "Yes" : "No") : "",
      codType: String(s.cod_type ?? ""),
      shipmentType: "",
      pincodeType: String(s.pincode_type ?? ""),
      customerInvoice: String(s.customer_invoice ?? ""),
      fieldExecutive: String(s.field_executive ?? ""),
      csbType: String(s.csb_type ?? ""),
      drsNo: String(s.drs_no ?? ""),
      vehicleNo: String(s.vehicle_no ?? ""),
      prsNo: String(s.prs_no ?? ""),
      pickupFieldExecutive: String(s.pickup_field_executive ?? ""),
      pickupNo: String(s.pickup_no ?? ""),
      remark: result.is_hold ? "ON HOLD" : String(s.remark ?? ""),
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
