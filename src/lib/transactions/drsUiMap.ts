/**
 * DRS UI ↔ DB mapping — Phase 4 Milestone 4C.
 */
import type { DrsLineRow, DrsRow } from "@/lib/transactions/resources/drs";
import type { DrsFields, DrsLineInput } from "@/lib/transactions/schemas/drs";

export type LookupPair = { id?: string; code: string; name: string };

export type UiDrsAwbLine = {
  id: string;
  shipmentId?: string;
  awbNo: string;
  bookDate: string;
  origin: string;
  destination: string;
  customer: string;
  consignee: string;
  pcs: string;
  weight: string;
  ewayBillNo: string;
  shipmentValue: string;
  remarks?: string;
  outcome?: string | null;
  shipmentStatus?: string | null;
  attemptCount?: number;
};

export type UiDrsForm = {
  drsNo: string;
  drsDate: string;
  drsTime: string;
  area: LookupPair;
  areaSeq: string;
  fieldExecutive: LookupPair;
  vehicleNo: string;
  remark: string;
  awbLines: UiDrsAwbLine[];
  status?: string;
};

function emptyPair(): LookupPair {
  return { code: "", name: "" };
}

function hhmmFromTime(t: string | null | undefined): string {
  if (!t) return "";
  const m = String(t).match(/^(\d{2}):(\d{2})/);
  return m ? `${m[1]}${m[2]}` : String(t).replace(/\D/g, "").slice(0, 4);
}

function timeFromHhmm(hhmm: string): string | null {
  const d = hhmm.replace(/\D/g, "").slice(0, 4);
  if (d.length < 3) return null;
  const h = d.slice(0, d.length - 2).padStart(2, "0");
  const m = d.slice(-2);
  return `${h}:${m}`;
}

function formatBookDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function dbLineToUi(line: DrsLineRow): UiDrsAwbLine {
  return {
    id: crypto.randomUUID(),
    shipmentId: line.shipment_id,
    awbNo: line.awb_no,
    bookDate: formatBookDate(line.book_date),
    origin: line.origin_name || line.origin_code || "",
    destination: line.destination_name || line.destination_code || "",
    customer: line.customer_name || line.customer_code || "",
    consignee: line.consignee_name ?? "",
    pcs: String(line.pieces ?? ""),
    weight: String(line.charge_weight ?? ""),
    ewayBillNo: line.eway_bill_no ?? "",
    shipmentValue: line.shipment_value != null ? String(line.shipment_value) : "",
    remarks: line.remarks ?? "",
    outcome: line.outcome ?? null,
    shipmentStatus: line.shipment_status ?? null,
    attemptCount: line.attempt_count ?? 0,
  };
}

export function dbDrsToForm(row: DrsRow, lines?: DrsLineRow[]): UiDrsForm {
  const fe = row.field_executives;
  return {
    drsNo: row.drs_no,
    drsDate: row.drs_date,
    drsTime: hhmmFromTime(row.drs_time),
    area: {
      id: row.destination_id ?? undefined,
      code: row.area_code || row.destinations?.code || "",
      name: row.area_name || row.destinations?.name || "",
    },
    areaSeq: row.area_seq ?? "",
    fieldExecutive: fe
      ? { id: row.delivery_executive_id ?? undefined, code: fe.code, name: fe.name }
      : emptyPair(),
    vehicleNo: row.vehicle_no ?? "",
    remark: row.remarks ?? "",
    awbLines: (lines ?? []).map(dbLineToUi),
    status: row.status,
  };
}

export function dbDrsToListRow(row: DrsRow): UiDrsForm & {
  id: string;
  rowVersion: number;
  status: string;
  serviceCenter: string;
} {
  const form = dbDrsToForm(row);
  return {
    ...form,
    id: row.id,
    rowVersion: row.row_version,
    status: row.status,
    serviceCenter: row.branches?.code ?? "",
  };
}

export function uiFormToDrsPayload(form: UiDrsForm): {
  fields: DrsFields;
  lines: DrsLineInput[];
} {
  const fields: DrsFields = {
    drs_date: form.drsDate,
    drs_time: timeFromHhmm(form.drsTime),
    branch_id: null,
    branch_code: null,
    destination_id: form.area.id || null,
    destination_code: form.area.code.trim() || null,
    delivery_executive_id: form.fieldExecutive.id || null,
    delivery_executive_code: form.fieldExecutive.code.trim() || null,
    vehicle_no: form.vehicleNo.trim() || null,
    remarks: form.remark.trim() || null,
    area_code: form.area.code.trim() || null,
    area_name: form.area.name.trim() || null,
    area_seq: form.areaSeq.trim() || null,
    wizard_extras: {},
  };

  const lines: DrsLineInput[] = form.awbLines.map((l) => ({
    shipment_id: l.shipmentId || null,
    awb_no: l.awbNo.trim() || null,
    remarks: l.remarks?.trim() || null,
    pieces: l.pcs.trim() || null,
    charge_weight: l.weight.trim() || null,
    book_date: null,
    origin_code: null,
    origin_name: l.origin.trim() || null,
    destination_code: null,
    destination_name: l.destination.trim() || null,
    customer_code: null,
    customer_name: l.customer.trim() || null,
    consignee_name: l.consignee.trim() || null,
    eway_bill_no: l.ewayBillNo.trim() || null,
    shipment_value: l.shipmentValue.trim() || null,
  }));

  return { fields, lines };
}

export function drsStatusBadgeVariant(
  status: string | null | undefined,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "DISPATCHED":
      return "default";
    case "COMPLETED":
      return "secondary";
    case "CANCELLED":
      return "destructive";
    default:
      return "outline";
  }
}

export type DrsDeliveryCounters = {
  total: number;
  pending: number;
  delivered: number;
  undelivered: number;
  attempted: number;
  outForDelivery: number;
};

export function emptyDeliveryCounters(): DrsDeliveryCounters {
  return {
    total: 0,
    pending: 0,
    delivered: 0,
    undelivered: 0,
    attempted: 0,
    outForDelivery: 0,
  };
}

export function countersFromBoard(board: {
  total: number;
  pending: number;
  delivered: number;
  undelivered: number;
  attempted: number;
  out_for_delivery: number;
}): DrsDeliveryCounters {
  return {
    total: board.total,
    pending: board.pending,
    delivered: board.delivered,
    undelivered: board.undelivered,
    attempted: board.attempted,
    outForDelivery: board.out_for_delivery,
  };
}

/** Demo / offline counter derivation from line outcomes + shipment status. */
export function deriveDeliveryCounters(
  lines: Array<{
    outcome?: string | null;
    shipmentStatus?: string | null;
  }>,
): DrsDeliveryCounters {
  const counters = emptyDeliveryCounters();
  counters.total = lines.length;
  for (const line of lines) {
    const status = line.shipmentStatus ?? "";
    const outcome = line.outcome ?? null;
    if (outcome === "DELIVERED" || status === "DELIVERED_PENDING_POD" || status === "DELIVERED") {
      counters.delivered += 1;
    } else if (outcome === "UNDELIVERED" || status === "UNDELIVERED") {
      counters.undelivered += 1;
    } else if (status === "DELIVERY_ATTEMPTED") {
      counters.attempted += 1;
      counters.pending += 1;
    } else {
      counters.outForDelivery += 1;
      counters.pending += 1;
    }
  }
  return counters;
}

export function shipmentStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "OUT_FOR_DELIVERY":
      return "Out for delivery";
    case "DELIVERY_ATTEMPTED":
      return "Attempted";
    case "DELIVERED_PENDING_POD":
      return "Delivered (pending POD)";
    case "UNDELIVERED":
      return "Undelivered";
    case "DELIVERED":
      return "Delivered";
    default:
      return status || "—";
  }
}

export function validateCompletionReady(pendingCount: number): {
  ok: boolean;
  message: string;
} {
  if (pendingCount > 0) {
    return {
      ok: false,
      message: `Cannot complete: ${pendingCount} shipment(s) still pending outcome`,
    };
  }
  return { ok: true, message: "Ready to complete" };
}
