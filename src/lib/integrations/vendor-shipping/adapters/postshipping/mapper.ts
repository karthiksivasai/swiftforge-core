/**
 * PostShipping (DTDC) Payload Mapper
 * Maps internal shipment context -> PostShipping API request payload matching
 * exact specification from doc.postshipping.com/docs/developers/shipment/
 */

import type { VendorShippingContext } from "../../types";
import type {
  PostShippingRequestBody,
  PostShippingShipmentRequest,
  PostShippingPiece,
  PostShippingItem,
  PostShippingWeightMeasurement,
} from "./types";

/**
 * Configurable single constant for PostShipping weight measurement unit.
 * DTDC sample uses "Kgs". If DTDC asks for "KG" or other unit, change it here.
 */
export const POSTSHIPPING_WEIGHT_MEASUREMENT: PostShippingWeightMeasurement = "Kgs";

function str(v: unknown, fallback = ""): string {
  if (v == null) return fallback;
  const s = String(v).trim();
  return s || fallback;
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number.parseFloat(str(v));
  return Number.isFinite(n) ? n : fallback;
}

function normalizeCountryCode(country: unknown, fallback = "IN"): string {
  const c = str(country).toUpperCase();
  if (!c) return fallback;
  if (c.length === 2) return c;
  if (c === "INDIA") return "IN";
  if (c === "AUSTRALIA") return "AU";
  if (c === "NEW ZEALAND") return "NZ";
  if (c === "UNITED STATES" || c === "USA") return "US";
  if (c === "UNITED KINGDOM" || c === "UK") return "GB";
  if (c === "CANADA") return "CA";
  if (c === "SINGAPORE") return "SG";
  if (c === "UNITED ARAB EMIRATES" || c === "UAE") return "AE";
  return c.slice(0, 2);
}

export function buildPostShippingPayload(
  context: VendorShippingContext,
  thirdPartyToken?: string | null,
  carrierServiceCode?: string | null
): {
  body: PostShippingRequestBody;
  tokenMissing: boolean;
  warnings: string[];
} {
  const ship = context.shipment;
  const shipper = (ship.shipper && typeof ship.shipper === "object" ? ship.shipper : {}) as Record<string, unknown>;
  const consignee = (ship.consignee && typeof ship.consignee === "object" ? ship.consignee : {}) as Record<string, unknown>;
  const extras = (ship.wizard_extras && typeof ship.wizard_extras === "object" ? ship.wizard_extras : {}) as Record<string, unknown>;
  const proforma = (extras.proforma && typeof extras.proforma === "object" ? extras.proforma : {}) as Record<string, unknown>;
  const kyc = (extras.kyc && typeof extras.kyc === "object" ? extras.kyc : {}) as Record<string, unknown>;
  const warnings: string[] = [];

  const rawService = str(ship.service_code || ship.service || "COURIER PLEASE");
  const serviceCode = str(carrierServiceCode || rawService);
  const awbNo = str(ship.awb_no || ship.reference_no || "PREVIEW_AWB");
  const refNo = str(ship.reference_no, awbNo);

  const senderCountry = normalizeCountryCode(shipper.country || "IN", "IN");
  const receiverCountry = normalizeCountryCode(consignee.country || "AU", "AU");

  const senderName = str(
    shipper.contact_name || shipper.contactName || shipper.name || shipper.company_name || shipper.companyName,
    "Sender Name"
  );
  const senderCompany = str(shipper.company_name || shipper.companyName, senderName);
  const senderAdd1 = str(shipper.address1, "Address Line 1");
  const senderAdd2 = str(shipper.address2, "");
  const senderAdd3 = str(shipper.address3, "");
  const senderCity = str(shipper.city, "Hyderabad");
  const senderState = str(shipper.state, "Telangana");
  const senderPostcode = str(shipper.pincode ?? shipper.pin_code, "500001");
  const senderPhone = str(
    shipper.mobile_no || shipper.mobileNo || shipper.telephone || shipper.phone,
    "0000000000"
  );
  const senderEmail = str(shipper.email, "");
  const senderFax = str(shipper.fax, "");

  // KYC data from real shipment documents (PAN / IEC / GSTIN / Aadhaar)
  const kycDocs = Array.isArray(kyc.documents) ? kyc.documents : [];
  const firstKyc = kycDocs.length > 0 && typeof kycDocs[0] === "object" ? (kycDocs[0] as Record<string, unknown>) : {};
  const senderKycType = str(
    shipper.document_type || shipper.kyc_type || shipper.kycType || firstKyc.entryType || firstKyc.entry_type || (shipper.pan ? "PAN" : shipper.iec_no ? "IEC" : shipper.gstin ? "GSTIN" : shipper.aadhaar ? "Aadhaar" : ""),
    ""
  );
  const senderKycNumber = str(
    shipper.document_no || shipper.kyc_number || shipper.kycNumber || firstKyc.documentNo || firstKyc.document_no || shipper.pan || shipper.iec_no || shipper.gstin || shipper.aadhaar,
    ""
  );

  const receiverName = str(
    consignee.contact_name || consignee.contactName || consignee.name || consignee.company_name || consignee.companyName,
    "Receiver Name"
  );
  const receiverCompany = str(consignee.company_name || consignee.companyName, receiverName);
  const receiverAdd1 = str(consignee.address1, "Receiver Address 1");
  const receiverAdd2 = str(consignee.address2, "");
  const receiverAdd3 = str(consignee.address3, "");
  const receiverCity = str(consignee.city, "Melbourne");
  const receiverState = str(consignee.state, "VIC");
  const receiverPostcode = str(consignee.pincode ?? consignee.pin_code, "3000");
  const receiverMobile = str(
    consignee.mobile_no || consignee.mobileNo || consignee.telephone || consignee.phone,
    "0000000000"
  );
  const receiverPhone = str(consignee.telephone || consignee.phone || receiverMobile, "0000000000");
  const receiverEmail = str(consignee.email, "");

  const proformaLinesRaw = Array.isArray(proforma.lines) ? proforma.lines : [];
  const proformaCurrency = str(proforma.currency, "AUD");
  const proformaValueSum = proformaLinesRaw.reduce((acc, l) => {
    const n = Number.parseFloat(str((l as Record<string, unknown>).amount, "0"));
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);

  const shipmentVal = num(ship.shipment_value, proformaValueSum || 100);
  const currencyCode = proformaCurrency || "AUD";

  // Export reason and terms from shipment / proforma tab
  const exportReason = str(
    proforma.exportReason || proforma.export_reason || extras.export_reason || ship.export_reason,
    "Commercial"
  );
  const termOfInvoice = str(
    proforma.incoterms || proforma.termOfInvoice || proforma.term_of_invoice || extras.term_of_invoice || ship.shipment_term,
    "DDU"
  );

  const totalPieces = Math.max(1, num(ship.pieces, context.pieces.length || 1));
  const grossWeight = Math.max(0.1, num(ship.charge_weight || ship.actual_weight, 1.0));
  const descriptionOfGoods = str(
    ship.content,
    proformaLinesRaw.map((l) => str((l as Record<string, unknown>).description)).filter(Boolean).join(", ") || "Courier Shipment"
  );

  const primaryPiece = context.pieces.length > 0 ? (context.pieces[0] as Record<string, unknown>) : {};
  const cubicL = num(primaryPiece.length, 10);
  const cubicW = num(primaryPiece.breadth || primaryPiece.width, 10);
  const cubicH = num(primaryPiece.height, 10);
  const cubicWeight = Number(((cubicL * cubicW * cubicH) / 5000).toFixed(3));

  // Build ShipmentResponseItem[] & Pieces[]
  const shipmentResponseItems: PostShippingItem[] = [];

  if (proformaLinesRaw.length > 0) {
    for (const rawLine of proformaLinesRaw) {
      const line = rawLine as Record<string, unknown>;
      const itemDesc = str(line.description, descriptionOfGoods);
      const itemQty = Math.max(1, num(line.quantity, 1));
      const itemCustomVal = num(line.rate || line.amount, 10).toFixed(2);
      const itemWeight = num(line.weight, grossWeight / proformaLinesRaw.length || 0.5);

      const piece: PostShippingPiece = {
        HarmonisedCode: str(line.hsCode || line.hsn_code || line.hs_code, "999999"),
        GoodsDescription: itemDesc,
        Quantity: itemQty,
        Weight: itemWeight,
        ManufactureCountryCode: senderCountry,
        OriginCountryCode: senderCountry,
        CurrencyCode: currencyCode,
        CustomsValue: itemCustomVal,
      };

      shipmentResponseItems.push({
        ItemNoOfPcs: itemQty,
        ItemCubicL: 10,
        ItemCubicW: 10,
        ItemCubicH: 10,
        ItemWeight: itemWeight,
        ItemCubicWeight: 0.2,
        ItemDescription: itemDesc,
        ItemCustomValue: itemCustomVal,
        ItemCustomCurrencyCode: currencyCode,
        Notes: "",
        Pieces: [piece],
      });
    }
  } else if (context.pieces.length > 0) {
    for (const p of context.pieces) {
      const pRow = p as Record<string, unknown>;
      const pLen = num(pRow.length, 10);
      const pWid = num(pRow.breadth || pRow.width, 10);
      const pHgt = num(pRow.height, 10);
      const pWeight = num(pRow.actual_weight_per_pc || pRow.charge_weight_per_pc, grossWeight / context.pieces.length);
      const pCubicWeight = Number(((pLen * pWid * pHgt) / 5000).toFixed(3));
      const pVal = (shipmentVal / context.pieces.length).toFixed(2);

      const piece: PostShippingPiece = {
        HarmonisedCode: "999999",
        GoodsDescription: descriptionOfGoods,
        Quantity: 1,
        Weight: pWeight,
        ManufactureCountryCode: senderCountry,
        OriginCountryCode: senderCountry,
        CurrencyCode: currencyCode,
        CustomsValue: pVal,
      };

      shipmentResponseItems.push({
        ItemNoOfPcs: 1,
        ItemCubicL: pLen,
        ItemCubicW: pWid,
        ItemCubicH: pHgt,
        ItemWeight: pWeight,
        ItemCubicWeight: pCubicWeight,
        ItemDescription: descriptionOfGoods,
        ItemCustomValue: pVal,
        ItemCustomCurrencyCode: currencyCode,
        Notes: "",
        Pieces: [piece],
      });
    }
  } else {
    const defaultPiece: PostShippingPiece = {
      HarmonisedCode: "999999",
      GoodsDescription: descriptionOfGoods,
      Quantity: totalPieces,
      Weight: grossWeight,
      ManufactureCountryCode: senderCountry,
      OriginCountryCode: senderCountry,
      CurrencyCode: currencyCode,
      CustomsValue: shipmentVal.toFixed(2),
    };

    shipmentResponseItems.push({
      ItemNoOfPcs: totalPieces,
      ItemCubicL: cubicL,
      ItemCubicW: cubicW,
      ItemCubicH: cubicH,
      ItemWeight: grossWeight,
      ItemCubicWeight: cubicWeight,
      ItemDescription: descriptionOfGoods,
      ItemCustomValue: shipmentVal.toFixed(2),
      ItemCustomCurrencyCode: currencyCode,
      Notes: "",
      Pieces: [defaultPiece],
    });
  }

  const tokenMissing = !thirdPartyToken || !thirdPartyToken.trim();
  if (tokenMissing) {
    warnings.push(`ThirdPartyToken is not configured for service code "${serviceCode}". Live booking will be blocked.`);
  }

  const shipmentItem: PostShippingShipmentRequest = {
    Pending: true,
    SenderDetails: {
      SenderName: senderName,
      SenderCompanyName: senderCompany,
      SenderCountryCode: senderCountry,
      SenderAdd1: senderAdd1,
      SenderAdd2: senderAdd2 || undefined,
      SenderAdd3: senderAdd3 || undefined,
      SenderAddCity: senderCity,
      SenderAddState: senderState,
      SenderAddPostcode: senderPostcode,
      SenderPhone: senderPhone,
      SenderEmail: senderEmail || undefined,
      SenderFax: senderFax || undefined,
      SenderKycType: senderKycType || undefined,
      SenderKycNumber: senderKycNumber || undefined,
    },
    ReceiverDetails: {
      ReceiverName: receiverName,
      ReceiverCompanyName: receiverCompany,
      ReceiverCountryCode: receiverCountry,
      ReceiverAdd1: receiverAdd1,
      ReceiverAdd2: receiverAdd2 || undefined,
      ReceiverAdd3: receiverAdd3 || undefined,
      ReceiverAddCity: receiverCity,
      ReceiverAddState: receiverState,
      ReceiverAddPostcode: receiverPostcode,
      ReceiverMobile: receiverMobile,
      ReceiverPhone: receiverPhone,
      ReceiverEmail: receiverEmail || undefined,
    },
    PackageDetails: {
      GoodsDescription: descriptionOfGoods,
      CustomValue: shipmentVal.toFixed(2),
      CustomCurrencyCode: currencyCode,
      InsuranceValue: "0.00",
      ShipmentTerm: termOfInvoice,
      GoodsOriginCountryCode: senderCountry,
      Weight: Number(grossWeight.toFixed(3)),
      WeightMeasurement: POSTSHIPPING_WEIGHT_MEASUREMENT,
      NoOfItems: totalPieces,
      CubicL: cubicL,
      CubicW: cubicW,
      CubicH: cubicH,
      CubicWeight: cubicWeight,
      ServiceTypeName: serviceCode,
      BookPickUP: false,
      SenderRef1: awbNo,
      SenderRef2: refNo !== awbNo ? refNo : undefined,
      SenderRef3: str(proforma.invoiceNo || proforma.invoice_no) || undefined,
      ReasonExport: exportReason,
      Incoterms: termOfInvoice,
      ShipmentResponseItem: shipmentResponseItems,
    },
  };

  if (thirdPartyToken && thirdPartyToken.trim()) {
    shipmentItem.ThirdPartyToken = thirdPartyToken.trim();
  }

  return {
    body: [shipmentItem],
    tokenMissing,
    warnings,
  };
}
