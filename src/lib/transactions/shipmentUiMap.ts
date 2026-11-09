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
import { formatMoney2 } from "@/lib/transactions/awbEntryRules";
import { recalculateProformaAmounts } from "@/lib/transactions/proformaImport";

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
  division?: string;
  measurementUnit?: string;
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
  masterAwbNo?: string;
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
  expectedDeliveryDate?: string;
  notifyEmail?: boolean;
  notifySms?: boolean;
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
  actualWeight: string;
  chargeWeight: string;
  pieces: string;
  /** Delivery AWB / tracking id (CourierWala "Delivery Vendor" column), else vendor code. */
  deliveryVendor: string;
  forwardingNo: string;
  deliveryNo: string;
  referenceNo: string;
  carrierProviderCode?: string;
  carrierBookingRef?: string;
  carrierTrackingNo?: string;
  carrierBookingStatus?: string;
  carrierLabelFileId?: string;
};

function formatListWeight(value: number | string | null | undefined): string {
  if (value == null || value === "") return "";
  const n = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) ? n.toFixed(3) : String(value);
}

function partyToJson(p: PartyDetails): Record<string, unknown> {
  const text = (value: string) => value.trim();
  return {
    origin_code: text(p.origin.code),
    origin_name: text(p.origin.name),
    origin_id: p.origin.id ?? null,
    company_code: text(p.companyName.code),
    company_name: text(p.companyName.name),
    company_id: p.companyName.id ?? null,
    contact_name: text(p.contactName),
    address1: text(p.address1),
    address2: text(p.address2),
    pincode: text(p.pincode),
    city: text(p.city),
    state: text(p.state),
    telephone: text(p.telephone),
    mobile: text(p.mobileNo),
    email: text(p.email),
    country: text(p.country),
    iec_no: text(p.iecNo),
    document_type: text(p.documentType),
    document_no: text(p.documentNo),
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

export function uiFormToShipmentPayload(
  form: AwbLiveForm,
  opts?: { manualAwbNo?: string | null; branchId?: string | null; branchCode?: string | null },
): {
  fields: ShipmentFields;
  pieces: ShipmentPieceInput[];
  charges: ShipmentChargeInput[];
} {
  const piecesUnit = form.piecesUnit.trim().toUpperCase();
  const forwarding = (form.forwarding ?? {}) as {
    deliveryVendor?: LookupPair;
    deliveryAwb?: string;
    forwardingAwb?: string;
  };
  const deliveryVendor = forwarding.deliveryVendor ?? { code: "", name: "" };
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
    delivery_vendor_id: deliveryVendor.id || null,
    delivery_vendor_code: deliveryVendor.code.trim() || null,
    field_executive_id: form.fieldExecutive.id || null,
    field_executive_code: form.fieldExecutive.code.trim() || null,
    branch_id: opts?.branchId || null,
    branch_code: opts?.branchCode || null,
    pickup_id: form.pickupId || null,
    book_date: form.bookDate,
    book_time: form.bookTime.trim() || null,
    awb_no: opts?.manualAwbNo?.trim() || null,
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
    forwarding_awb:
      form.forwardingNo.trim() || forwarding.forwardingAwb?.trim() || null,
    delivery_awb: form.deliveryNo.trim() || forwarding.deliveryAwb?.trim() || null,
    return_awb: null,
    delivery_service: null,
    flight_no: form.flightNo.trim() || null,
    is_locked: form.lock,
    shipper: partyToJson(form.shipper),
    consignee: partyToJson(form.consignee),
    wizard_extras: {
      proforma: recalculateProformaAmounts((form.proforma ?? { lines: [] }) as { lines?: unknown[] }),
      forwarding: form.forwarding ?? {},
      kyc: {
        documents: (Array.isArray((form.kyc as { documents?: unknown[] } | undefined)?.documents)
          ? ((form.kyc as { documents: Array<Record<string, unknown>> }).documents)
          : []
        ).map((doc) => ({
          id: doc.id,
          fileName: doc.fileName,
          entryType: doc.entryType,
          entryDate: doc.entryDate,
        })),
      },
      masterAwbNo: form.masterAwbNo?.trim() || "",
      expectedDeliveryDate: form.expectedDeliveryDate?.trim() || "",
      notifyEmail: form.notifyEmail === true,
      notifySms: form.notifySms === true,
    },
  };

  const pieces: ShipmentPieceInput[] = (form.piecesLines ?? []).map((l) => ({
    child_awb: l.childAwb || null,
    actual_weight_per_pc: l.actualWeightPerPc || null,
    pieces: l.pieces || null,
    length: l.length || null,
    breadth: l.breadth || null,
    height: l.height || null,
    divisor: l.division?.trim() || null,
    vol_weight: null,
    charge_weight: null,
    measurement_unit: l.measurementUnit?.trim() || "Centimeter",
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
  const deliveryVendorCode = row.delivery_vendor?.code?.trim() || "";
  const deliveryAwb = row.delivery_awb?.trim() || "";
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
    actualWeight: formatListWeight(row.actual_weight),
    chargeWeight: formatListWeight(row.charge_weight),
    pieces: String(row.pieces ?? ""),
    deliveryVendor: deliveryAwb || deliveryVendorCode,
    forwardingNo: row.forwarding_awb ?? "",
    deliveryNo: deliveryAwb,
    referenceNo: row.reference_no ?? "",
    carrierProviderCode: row.carrier_provider_code ?? undefined,
    carrierBookingRef: row.carrier_booking_ref ?? undefined,
    carrierTrackingNo: row.carrier_tracking_no ?? undefined,
    carrierBookingStatus: row.carrier_booking_status ?? undefined,
    carrierLabelFileId: row.carrier_label_file_id ?? undefined,
  };
}

export function dbShipmentToFormPatch(
  row: ShipmentDbRow,
  children: ShipmentChildren,
): Partial<AwbLiveForm> & {
  id: string;
  rowVersion: number;
  status: string;
  carrierProviderCode?: string;
  carrierBookingRef?: string;
  carrierTrackingNo?: string;
  carrierBookingStatus?: string;
  carrierLabelFileId?: string;
} {
  const extras = (row.wizard_extras ?? {}) as Record<string, unknown>;
  const forwardingExtra =
    extras.forwarding && typeof extras.forwarding === "object"
      ? (extras.forwarding as Record<string, unknown>)
      : {};
  return {
    id: row.id,
    rowVersion: row.row_version,
    status: row.current_status,
    carrierProviderCode: row.carrier_provider_code ?? undefined,
    carrierBookingRef: row.carrier_booking_ref ?? undefined,
    carrierTrackingNo: row.carrier_tracking_no ?? undefined,
    carrierBookingStatus: row.carrier_booking_status ?? undefined,
    carrierLabelFileId: row.carrier_label_file_id ?? undefined,
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
    shipmentValue: formatMoney2(row.shipment_value),
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
    customerChargesTotal: formatMoney2(row.customer_charges_total ?? 0),
    vendorChargesTotal: formatMoney2(row.vendor_charges_total ?? 0),
    paymentType: row.payment_type ?? "",
    content: row.content ?? "",
    instruction: row.instruction ?? "",
    fieldExecutive: {
      id: row.field_executive_id ?? undefined,
      code: row.field_executives?.code ?? "",
      name: row.field_executives?.name ?? "",
    },
    cashReceiptNo: row.cash_receipt_no ?? "",
    amountReceived: formatMoney2(row.amount_received),
    balanceAmount: formatMoney2(row.balance_amount),
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
      division: p.divisor != null ? String(p.divisor) : "",
      measurementUnit: p.measurement_unit ?? "Centimeter",
    })),
    chargeLines: children.charges
      .filter((c) => String(c.side ?? "CUSTOMER").toUpperCase() !== "VENDOR")
      .map((c, i) => ({
        id: `ch-${i}`,
        description: c.description,
        rate: formatMoney2(c.rate),
        amount: formatMoney2(c.amount),
        fuelApply: c.fuel_applies ? "Yes" : "No",
        fuelAmt: formatMoney2(c.fuel_amount),
        taxApply: c.tax_applies ? "Yes" : "No",
        taxOnFuel: c.tax_on_fuel ? "Yes" : "No",
        igst: formatMoney2(c.igst),
        sgst: formatMoney2(c.sgst),
        cgst: formatMoney2(c.cgst),
        total: formatMoney2(c.total),
        chargesType: c.charges_type,
      })),
    masterAwbNo: String(extras.masterAwbNo ?? ""),
    expectedDeliveryDate: String(extras.expectedDeliveryDate ?? ""),
    notifyEmail: extras.notifyEmail === true,
    notifySms: extras.notifySms === true,
    proforma: extras.proforma,
    forwarding: {
      ...forwardingExtra,
      deliveryAwb: row.delivery_awb ?? String(forwardingExtra.deliveryAwb ?? ""),
      forwardingAwb: row.forwarding_awb ?? String(forwardingExtra.forwardingAwb ?? ""),
      deliveryVendor: {
        id: row.delivery_vendor_id ?? undefined,
        code: row.delivery_vendor?.code ?? "",
        name: row.delivery_vendor?.name ?? "",
      },
      vendorChargeLines: (() => {
        const fromExtras = Array.isArray(forwardingExtra.vendorChargeLines)
          ? forwardingExtra.vendorChargeLines
          : null;
        if (fromExtras && fromExtras.length > 0) {
          return fromExtras.map((line) => ({
            ...line,
            rate: formatMoney2(line.rate),
            amount: formatMoney2(line.amount),
            fuelAmt: formatMoney2(line.fuelAmt),
            igst: formatMoney2(line.igst),
            sgst: formatMoney2(line.sgst),
            cgst: formatMoney2(line.cgst),
            total: formatMoney2(line.total),
          }));
        }
        return children.charges
          .filter((c) => String(c.side ?? "").toUpperCase() === "VENDOR")
          .map((c, i) => ({
            id: `vch-${i}`,
            description: c.description,
            rate: formatMoney2(c.rate),
            amount: formatMoney2(c.amount),
            fuelApply: c.fuel_applies ? "Yes" : "No",
            fuelAmt: formatMoney2(c.fuel_amount),
            taxApply: c.tax_applies ? "Yes" : "No",
            taxOnFuel: c.tax_on_fuel ? "Yes" : "No",
            igst: formatMoney2(c.igst),
            sgst: formatMoney2(c.sgst),
            cgst: formatMoney2(c.cgst),
            total: formatMoney2(c.total),
            chargesType: c.charges_type === "SYSTEM" ? "SYSTEM" : "Vendor",
          }));
      })(),
    },
    kyc: extras.kyc,
  };
}
