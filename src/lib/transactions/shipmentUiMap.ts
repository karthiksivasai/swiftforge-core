/**
 * Maps AWB Entry UI form ↔ save_shipment payloads / DB rows.
 */
import type {
  ShipmentChargeInput,
  ShipmentFields,
  ShipmentPieceInput,
} from "@/lib/transactions/schemas/shipments";
import type {
  ShipmentChildren,
  ShipmentRow as ShipmentDbRow,
} from "@/lib/transactions/resources/shipments";

type LookupPair = { id?: string; code: string; name: string };

type PartyDetails = {
  origin: LookupPair;
  companyName: LookupPair;
  contactName: string;
  address1: string;
  address2: string;
  pincode: string;
  city: string;
  state: string;
  telephone: string;
  mobileNo: string;
  email: string;
  country: string;
  iecNo: string;
  documentType: string;
  documentNo: string;
};

type PiecesLine = {
  id: string;
  childAwb: string;
  actualWeightPerPc: string;
  pieces: string;
  length: string;
  breadth: string;
  height: string;
  volWeight: string;
  chargeWeight: string;
};

type ChargeLine = {
  id: string;
  description: string;
  rate: string;
  amount: string;
  fuelApply: string;
  fuelAmt: string;
  taxApply: string;
  taxOnFuel: string;
  igst: string;
  sgst: string;
  cgst: string;
  total: string;
  chargesType: string;
};

/** Minimal form slice needed for live save — matches AwbFullForm shape. */
export type AwbLiveForm = {
  awbNo: string;
  bookDate: string;
  bookTime: string;
  referenceNo: string;
  clientName: LookupPair;
  product: LookupPair;
  vendor: LookupPair;
  airline: string;
  service: LookupPair;
  shipmentValue: string;
  shipmentCurrency: string;
  pieces: string;
  piecesUnit: string;
  actualWeight: string;
  weightUnit: string;
  volWeight: string;
  chargeWeight: string;
  commercial: boolean;
  oda: boolean;
  medicalCharges: boolean;
  customerChargesTotal: string;
  vendorChargesTotal: string;
  piecesLines: PiecesLine[];
  chargeLines: ChargeLine[];
  paymentType: string;
  content: string;
  instruction: string;
  fieldExecutive: LookupPair;
  cashReceiptNo: string;
  amountReceived: string;
  balanceAmount: string;
  cashReceiptDate: string;
  lock: boolean;
  forwardingNo: string;
  deliveryNo: string;
  flightNo: string;
  shipper: PartyDetails;
  consignee: PartyDetails;
  pickupId?: string;
  proforma?: unknown;
  forwarding?: unknown;
  kyc?: unknown;
};

export type UiShipmentListRow = {
  id: string;
  rowVersion: number;
  status: string;
  awbNo: string;
  bookDate: string;
  bookTime: string;
  shipperName: string;
  customerCode: string;
  customerName: string;
  consigneeName: string;
  destination: string;
  product: string;
  vendor: string;
  weight: string;
  forwardingNo: string;
  deliveryNo: string;
  referenceNo: string;
};

function partyToJson(p: PartyDetails): Record<string, unknown> {
  return {
    origin_code: p.origin.code,
    origin_name: p.origin.name,
    origin_id: p.origin.id ?? null,
    company_code: p.companyName.code,
    company_name: p.companyName.name,
    company_id: p.companyName.id ?? null,
    contact_name: p.contactName,
    address1: p.address1,
    address2: p.address2,
    pincode: p.pincode,
    city: p.city,
    state: p.state,
    telephone: p.telephone,
    mobile: p.mobileNo,
    email: p.email,
    country: p.country,
    iec_no: p.iecNo,
    document_type: p.documentType,
    document_no: p.documentNo,
  };
}

function partyFromJson(
  raw: Record<string, unknown> | null | undefined,
  fallbackOrigin?: LookupPair,
): PartyDetails {
  const j = raw ?? {};
  return {
    origin: {
      id: typeof j.origin_id === "string" ? j.origin_id : fallbackOrigin?.id,
      code: String(j.origin_code ?? fallbackOrigin?.code ?? ""),
      name: String(j.origin_name ?? fallbackOrigin?.name ?? ""),
    },
    companyName: {
      id: typeof j.company_id === "string" ? j.company_id : undefined,
      code: String(j.company_code ?? ""),
      name: String(j.company_name ?? j.name ?? ""),
    },
    contactName: String(j.contact_name ?? ""),
    address1: String(j.address1 ?? ""),
    address2: String(j.address2 ?? ""),
    pincode: String(j.pincode ?? ""),
    city: String(j.city ?? ""),
    state: String(j.state ?? ""),
    telephone: String(j.telephone ?? ""),
    mobileNo: String(j.mobile ?? ""),
    email: String(j.email ?? ""),
    country: String(j.country ?? ""),
    iecNo: String(j.iec_no ?? ""),
    documentType: String(j.document_type ?? ""),
    documentNo: String(j.document_no ?? ""),
  };
}

export function uiFormToShipmentPayload(form: AwbLiveForm): {
  fields: ShipmentFields;
  pieces: ShipmentPieceInput[];
  charges: ShipmentChargeInput[];
} {
  const piecesUnit = form.piecesUnit.trim().toUpperCase();
  const fields: ShipmentFields = {
    customer_id: form.clientName.id || null,
    customer_code: form.clientName.code.trim() || null,
    product_id: form.product.id || null,
    product_code: form.product.code.trim() || null,
    origin_destination_id: form.shipper.origin.id || null,
    origin_code: form.shipper.origin.code.trim() || null,
    destination_id: form.consignee.origin.id || null,
    destination_code: form.consignee.origin.code.trim() || null,
    vendor_id: form.vendor.id || null,
    vendor_code: form.vendor.code.trim() || null,
    delivery_vendor_id: null,
    delivery_vendor_code: null,
    field_executive_id: form.fieldExecutive.id || null,
    field_executive_code: form.fieldExecutive.code.trim() || null,
    branch_id: null,
    branch_code: null,
    pickup_id: form.pickupId || null,
    book_date: form.bookDate,
    book_time: form.bookTime.trim() || null,
    reference_no: form.referenceNo.trim() || null,
    airline: form.airline.trim() || null,
    service: form.service.code.trim() || form.service.name.trim() || null,
    payment_type: form.paymentType.trim() || null,
    content: form.content.trim() || null,
    instruction: form.instruction.trim() || null,
    pieces: form.pieces.trim() || "1",
    pieces_unit: piecesUnit === "NDOX" || piecesUnit === "ENV" ? piecesUnit : "DOX",
    actual_weight: form.actualWeight.trim() || "0",
    weight_unit: form.weightUnit.trim() || "KG",
    vol_weight: form.volWeight.trim() || "0",
    charge_weight: form.chargeWeight.trim() || "0",
    shipment_value: form.shipmentValue.trim() || null,
    currency: form.shipmentCurrency.trim() || "INR",
    is_commercial: form.commercial,
    is_oda: form.oda,
    medical_charges: form.medicalCharges,
    customer_charges_total: form.customerChargesTotal.trim() || "0",
    vendor_charges_total: form.vendorChargesTotal.trim() || "0",
    cash_receipt_no: form.cashReceiptNo.trim() || null,
    amount_received: form.amountReceived.trim() || null,
    balance_amount: form.balanceAmount.trim() || null,
    cash_receipt_date: form.cashReceiptDate.trim() || null,
    forwarding_awb: form.forwardingNo.trim() || null,
    delivery_awb: form.deliveryNo.trim() || null,
    return_awb: null,
    delivery_service: null,
    flight_no: form.flightNo.trim() || null,
    is_locked: form.lock,
    shipper: partyToJson(form.shipper),
    consignee: partyToJson(form.consignee),
    wizard_extras: {
      proforma: form.proforma ?? {},
      forwarding: form.forwarding ?? {},
      kyc: form.kyc ?? {},
    },
  };

  const pieces: ShipmentPieceInput[] = (form.piecesLines ?? []).map((l) => ({
    child_awb: l.childAwb || null,
    actual_weight_per_pc: l.actualWeightPerPc || null,
    pieces: l.pieces || null,
    length: l.length || null,
    breadth: l.breadth || null,
    height: l.height || null,
    divisor: null,
    vol_weight: l.volWeight || null,
    charge_weight: l.chargeWeight || null,
  }));

  const charges: ShipmentChargeInput[] = (form.chargeLines ?? []).map((l) => ({
    side: "CUSTOMER" as const,
    description: l.description || "Charge",
    rate: l.rate || null,
    amount: l.amount || null,
    fuel_applies: l.fuelApply?.toLowerCase() === "yes" || l.fuelApply === "true",
    fuel_amount: l.fuelAmt || null,
    tax_applies: l.taxApply?.toLowerCase() === "yes" || l.taxApply === "true",
    tax_on_fuel: l.taxOnFuel?.toLowerCase() === "yes" || l.taxOnFuel === "true",
    igst: l.igst || null,
    sgst: l.sgst || null,
    cgst: l.cgst || null,
    total: l.total || null,
    charges_type: l.chargesType?.toUpperCase() === "SYSTEM" ? "SYSTEM" : "MANUAL",
  }));

  return { fields, pieces, charges };
}

export function dbShipmentToListRow(row: ShipmentDbRow): UiShipmentListRow {
  const shipper = (row.shipper ?? {}) as Record<string, unknown>;
  const consignee = (row.consignee ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    rowVersion: row.row_version,
    status: row.current_status,
    awbNo: row.awb_no,
    bookDate: row.book_date,
    bookTime: row.book_time ? String(row.book_time).slice(0, 5) : "",
    shipperName: String(shipper.company_name ?? shipper.contact_name ?? ""),
    customerCode: row.customers?.code ?? "",
    customerName: row.customers?.name ?? "",
    consigneeName: String(consignee.company_name ?? consignee.contact_name ?? ""),
    destination: row.destination?.name ?? row.destination?.code ?? "",
    product: row.products?.code ?? "",
    vendor: row.vendors?.code ?? "",
    weight: String(row.charge_weight ?? row.actual_weight ?? ""),
    forwardingNo: row.forwarding_awb ?? "",
    deliveryNo: row.delivery_awb ?? "",
    referenceNo: row.reference_no ?? "",
  };
}

export function dbShipmentToFormPatch(
  row: ShipmentDbRow,
  children: ShipmentChildren,
): Partial<AwbLiveForm> & { id: string; rowVersion: number; status: string } {
  const extras = (row.wizard_extras ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    rowVersion: row.row_version,
    status: row.current_status,
    awbNo: row.awb_no,
    bookDate: row.book_date,
    bookTime: row.book_time ? String(row.book_time).slice(0, 5) : "",
    referenceNo: row.reference_no ?? "",
    clientName: {
      id: row.customer_id ?? undefined,
      code: row.customers?.code ?? "",
      name: row.customers?.name ?? "",
    },
    product: {
      id: row.product_id ?? undefined,
      code: row.products?.code ?? "",
      name: row.products?.name ?? "",
    },
    vendor: {
      id: row.vendor_id ?? undefined,
      code: row.vendors?.code ?? "",
      name: row.vendors?.name ?? "",
    },
    airline: row.airline ?? "",
    service: { code: row.service ?? "", name: row.service ?? "" },
    shipmentValue: row.shipment_value != null ? String(row.shipment_value) : "",
    shipmentCurrency: row.currency ?? "INR",
    pieces: String(row.pieces ?? 1),
    piecesUnit: row.pieces_unit ?? "DOX",
    actualWeight: String(row.actual_weight ?? 0),
    weightUnit: row.weight_unit ?? "Kgs",
    volWeight: String(row.vol_weight ?? 0),
    chargeWeight: String(row.charge_weight ?? 0),
    commercial: row.is_commercial,
    oda: row.is_oda,
    medicalCharges: row.medical_charges,
    customerChargesTotal: String(row.customer_charges_total ?? 0),
    vendorChargesTotal: String(row.vendor_charges_total ?? 0),
    paymentType: row.payment_type ?? "",
    content: row.content ?? "",
    instruction: row.instruction ?? "",
    fieldExecutive: {
      id: row.field_executive_id ?? undefined,
      code: row.field_executives?.code ?? "",
      name: row.field_executives?.name ?? "",
    },
    cashReceiptNo: row.cash_receipt_no ?? "",
    amountReceived: row.amount_received != null ? String(row.amount_received) : "",
    balanceAmount: row.balance_amount != null ? String(row.balance_amount) : "",
    cashReceiptDate: row.cash_receipt_date ?? "",
    lock: row.is_locked,
    forwardingNo: row.forwarding_awb ?? "",
    deliveryNo: row.delivery_awb ?? "",
    flightNo: row.flight_no ?? "",
    pickupId: row.pickup_id ?? undefined,
    shipper: partyFromJson(row.shipper as Record<string, unknown>, {
      id: row.origin_destination_id ?? undefined,
      code: row.origin?.code ?? "",
      name: row.origin?.name ?? "",
    }),
    consignee: partyFromJson(row.consignee as Record<string, unknown>, {
      id: row.destination_id ?? undefined,
      code: row.destination?.code ?? "",
      name: row.destination?.name ?? "",
    }),
    piecesLines: children.pieces.map((p, i) => ({
      id: `pc-${i}`,
      childAwb: p.child_awb ?? "",
      actualWeightPerPc: String(p.actual_weight_per_pc ?? ""),
      pieces: String(p.pieces ?? ""),
      length: p.length != null ? String(p.length) : "",
      breadth: p.breadth != null ? String(p.breadth) : "",
      height: p.height != null ? String(p.height) : "",
      volWeight: String(p.vol_weight ?? ""),
      chargeWeight: String(p.charge_weight ?? ""),
    })),
    chargeLines: children.charges.map((c, i) => ({
      id: `ch-${i}`,
      description: c.description,
      rate: String(c.rate ?? ""),
      amount: String(c.amount ?? ""),
      fuelApply: c.fuel_applies ? "Yes" : "No",
      fuelAmt: String(c.fuel_amount ?? ""),
      taxApply: c.tax_applies ? "Yes" : "No",
      taxOnFuel: c.tax_on_fuel ? "Yes" : "No",
      igst: String(c.igst ?? ""),
      sgst: String(c.sgst ?? ""),
      cgst: String(c.cgst ?? ""),
      total: String(c.total ?? ""),
      chargesType: c.charges_type,
    })),
    proforma: extras.proforma,
    forwarding: extras.forwarding,
    kyc: extras.kyc,
  };
}
