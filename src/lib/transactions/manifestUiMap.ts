/**
 * Manifest UI ↔ DB mapping — Phase 4 Milestone 4A.
 */
import type {
  ManifestChildren,
  ManifestLineRow,
  ManifestRow,
} from "@/lib/transactions/resources/manifests";
import type { ManifestFields, ManifestLineInput } from "@/lib/transactions/schemas/manifests";

export type LookupPair = { id?: string; code: string; name: string };

export type UiManifestLine = {
  id: string;
  shipmentId?: string;
  awbNo: string;
  refNo: string;
  forwardingNo: string;
  crnMhbsNo: string;
  bagNo: string;
  pieces: string;
  chargeWeight: string;
  bookDate: string;
  origin: string;
  destination: string;
  code: string;
  customer: string;
  consignee: string;
  instruction: string;
};

export type UiManifestForm = {
  manifestNo: string;
  manifestDate: string;
  manifestTime: string;
  manifestToServiceCenter: boolean;
  destinationServiceCenter: LookupPair;
  vendor: LookupPair;
  setupMode: string;
  masterAwbNo: string;
  obcName: LookupPair;
  cdNo: string;
  totalNoOfBags: string;
  vendorWeight: string;
  referenceNo: string;
  flight1: LookupPair;
  flight2: LookupPair;
  departure: string;
  arrival: string;
  remark: string;
  flight: LookupPair;
  location: string;
  serviceCentre: string;
  connectStation: string;
  lines: UiManifestLine[];
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

export function dbLineToUi(line: ManifestLineRow): UiManifestLine {
  return {
    id: crypto.randomUUID(),
    shipmentId: line.shipment_id,
    awbNo: line.awb_no,
    refNo: line.reference_no ?? "",
    forwardingNo: line.forwarding_no ?? "",
    crnMhbsNo: line.crn_mhbs_no ?? "",
    bagNo: line.bag_no ?? "",
    pieces: String(line.pieces ?? ""),
    chargeWeight: String(line.charge_weight ?? ""),
    bookDate: line.book_date ?? "",
    origin: line.origin_name || line.origin_code || "",
    destination: line.destination_name || line.destination_code || "",
    code: line.customer_code ?? "",
    customer: line.customer_name ?? "",
    consignee: line.consignee_name ?? "",
    instruction: line.instruction ?? "",
  };
}

export function dbManifestToForm(row: ManifestRow, children?: ManifestChildren): UiManifestForm {
  const sc = row.service_centers;
  const vendor = row.vendors;
  return {
    manifestNo: row.manifest_no,
    manifestDate: row.manifest_date,
    manifestTime: hhmmFromTime(row.manifest_time),
    manifestToServiceCenter: row.to_type !== "THIRD_PARTY",
    destinationServiceCenter: sc
      ? { id: row.to_service_center_id ?? undefined, code: sc.code, name: sc.name }
      : emptyPair(),
    vendor: vendor
      ? { id: row.vendor_id ?? undefined, code: vendor.code, name: vendor.name }
      : emptyPair(),
    setupMode: String(row.wizard_extras?.setup_mode ?? "Select"),
    masterAwbNo: row.master_awb_no ?? "",
    obcName: row.obc_name ? { code: "", name: row.obc_name } : emptyPair(),
    cdNo: row.cd_no ?? "",
    totalNoOfBags: String(row.total_bags ?? 0),
    vendorWeight: String(row.vendor_weight ?? 0),
    referenceNo: row.reference_no ?? "",
    flight1: row.flight1 ? { code: row.flight1, name: row.flight1 } : emptyPair(),
    flight2: row.flight2 ? { code: row.flight2, name: row.flight2 } : emptyPair(),
    departure: row.departure ?? "",
    arrival: row.arrival ?? "",
    remark: row.remark ?? "",
    flight: row.flight ? { code: row.flight, name: row.flight } : emptyPair(),
    location: row.location_code ?? "",
    serviceCentre: sc?.code ?? "",
    connectStation: row.connect_station ?? "",
    lines: (children?.lines ?? []).map(dbLineToUi),
    status: row.status,
  };
}

export function dbManifestToListRow(row: ManifestRow): UiManifestForm & {
  id: string;
  rowVersion: number;
  status: string;
} {
  const form = dbManifestToForm(row);
  return {
    ...form,
    id: row.id,
    rowVersion: row.row_version,
    status: row.status,
  };
}

export function uiFormToManifestPayload(form: UiManifestForm): {
  fields: ManifestFields;
  lines: ManifestLineInput[];
} {
  const toType = form.manifestToServiceCenter ? "SERVICE_CENTER" : "THIRD_PARTY";
  const fields: ManifestFields = {
    manifest_date: form.manifestDate,
    manifest_time: timeFromHhmm(form.manifestTime),
    manifest_kind: "OUTBOUND",
    to_type: toType,
    to_service_center_id: form.destinationServiceCenter.id || null,
    to_service_center_code: form.destinationServiceCenter.code.trim() || null,
    vendor_id: form.vendor.id || null,
    vendor_code: form.vendor.code.trim() || null,
    origin_branch_id: null,
    branch_code: null,
    location_code: form.location.trim() || null,
    connect_station:
      form.connectStation.trim() || form.destinationServiceCenter.name.trim() || null,
    master_awb_no: form.masterAwbNo.trim() || null,
    cd_no: form.cdNo.trim() || null,
    obc_name: form.obcName.name.trim() || null,
    total_bags: form.totalNoOfBags.trim() || "0",
    vendor_weight: form.vendorWeight.trim() || "0",
    reference_no: form.referenceNo.trim() || null,
    flight1: form.flight1.code.trim() || form.flight1.name.trim() || null,
    flight2: form.flight2.code.trim() || form.flight2.name.trim() || null,
    departure: form.departure.trim() || null,
    arrival: form.arrival.trim() || null,
    remark: form.remark.trim() || null,
    flight: form.flight.code.trim() || form.flight.name.trim() || null,
    is_locked: false,
    wizard_extras: { setup_mode: form.setupMode },
  };

  const lines: ManifestLineInput[] = form.lines.map((l) => ({
    shipment_id: l.shipmentId || null,
    awb_no: l.awbNo.trim() || null,
    forwarding_no: l.forwardingNo.trim() || null,
    bag_no: l.bagNo.trim() || null,
    crn_mhbs_no: l.crnMhbsNo.trim() || null,
    pieces: l.pieces.trim() || null,
    charge_weight: l.chargeWeight.trim() || null,
    book_date: l.bookDate.trim() || null,
    origin_code: null,
    origin_name: l.origin.trim() || null,
    destination_code: null,
    destination_name: l.destination.trim() || null,
    customer_code: l.code.trim() || null,
    customer_name: l.customer.trim() || null,
    consignee_name: l.consignee.trim() || null,
    instruction: l.instruction.trim() || null,
    reference_no: l.refNo.trim() || null,
  }));

  return { fields, lines };
}
