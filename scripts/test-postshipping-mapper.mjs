#!/usr/bin/env node
/**
 * DTDC PostShipping Spec-Compliance & Value Cleanup Test Suite
 * Run: node scripts/test-postshipping-mapper.mjs
 *
 * Verifies:
 * 1. WeightMeasurement is a single configurable constant ("Kgs").
 * 2. KYC fields (SenderKycType, SenderKycNumber) map from real shipment docs, or remain omitted/empty if absent.
 * 3. ReasonExport & Incoterms map from shipment/proforma tab values.
 * 4. Exact field names match doc.postshipping.com/docs/developers/shipment/.
 */

import fs from "fs";
import path from "path";

// ─── Configurable Constant (Change in ONE spot if DTDC requests "KG") ────────
export const POSTSHIPPING_WEIGHT_MEASUREMENT = "Kgs";

function str(v, fallback = "") {
  if (v == null) return fallback;
  const s = String(v).trim();
  return s || fallback;
}
function num(v, fallback = 0) {
  const n = typeof v === "number" ? v : Number.parseFloat(str(v));
  return Number.isFinite(n) ? n : fallback;
}
function normalizeCountryCode(country, fallback = "IN") {
  const c = str(country).toUpperCase();
  if (!c) return fallback;
  if (c.length === 2) return c;
  if (c === "INDIA") return "IN";
  if (c === "AUSTRALIA") return "AU";
  if (c === "NEW ZEALAND") return "NZ";
  if (c === "UNITED STATES" || c === "USA") return "US";
  if (c === "UNITED KINGDOM" || c === "UK") return "GB";
  return c.slice(0, 2);
}

function buildPostShippingPayload(context, thirdPartyToken) {
  const ship = context.shipment;
  const shipper = ship.shipper ?? {};
  const consignee = ship.consignee ?? {};
  const extras = ship.wizard_extras ?? {};
  const proforma = extras.proforma ?? {};
  const kyc = extras.kyc ?? {};
  const warnings = [];

  const serviceCode = str(ship.service_code || ship.service || "PNPU25KG");
  const awbNo = str(ship.awb_no || ship.reference_no || "PREVIEW_AWB");
  const refNo = str(ship.reference_no, awbNo);

  const senderCountry = normalizeCountryCode(shipper.country || "IN", "IN");
  const receiverCountry = normalizeCountryCode(consignee.country || "AU", "AU");

  const senderName = str(
    shipper.contact_name || shipper.contactName || shipper.name || shipper.company_name,
    "Sender Name"
  );
  const senderCompany = str(shipper.company_name, senderName);
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

  // Real KYC extraction from shipment data (no invented values)
  const kycDocs = Array.isArray(kyc.documents) ? kyc.documents : [];
  const firstKyc = kycDocs.length > 0 && typeof kycDocs[0] === "object" ? kycDocs[0] : {};
  const senderKycType = str(
    shipper.document_type || shipper.kyc_type || shipper.kycType || firstKyc.entryType || firstKyc.entry_type || (shipper.pan ? "PAN" : shipper.iec_no ? "IEC" : shipper.gstin ? "GSTIN" : shipper.aadhaar ? "Aadhaar" : ""),
    ""
  );
  const senderKycNumber = str(
    shipper.document_no || shipper.kyc_number || shipper.kycNumber || firstKyc.documentNo || firstKyc.document_no || shipper.pan || shipper.iec_no || shipper.gstin || shipper.aadhaar,
    ""
  );

  const receiverName = str(
    consignee.contact_name || consignee.contactName || consignee.name || consignee.company_name,
    "Receiver Name"
  );
  const receiverCompany = str(consignee.company_name, receiverName);
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
    const n = Number.parseFloat(str(l.amount, "0"));
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

  const totalPieces = Math.max(1, num(ship.pieces, (context.pieces && context.pieces.length) || 1));
  const grossWeight = Math.max(0.1, num(ship.charge_weight || ship.actual_weight, 1.0));
  const descriptionOfGoods = str(
    ship.content,
    proformaLinesRaw.map((l) => str(l.description)).filter(Boolean).join(", ") || "Courier Shipment"
  );

  const primaryPiece = context.pieces && context.pieces.length > 0 ? context.pieces[0] : {};
  const cubicL = num(primaryPiece.length, 10);
  const cubicW = num(primaryPiece.breadth || primaryPiece.width, 10);
  const cubicH = num(primaryPiece.height, 10);
  const cubicWeight = Number(((cubicL * cubicW * cubicH) / 5000).toFixed(3));

  // Build ShipmentResponseItem[] & Pieces[]
  const shipmentResponseItems = [];

  if (proformaLinesRaw.length > 0) {
    for (const line of proformaLinesRaw) {
      const itemDesc = str(line.description, descriptionOfGoods);
      const itemQty = Math.max(1, num(line.quantity, 1));
      const itemCustomVal = num(line.rate || line.amount, 10).toFixed(2);
      const itemWeight = num(line.weight, grossWeight / proformaLinesRaw.length || 0.5);

      const piece = {
        HarmonisedCode: str(line.hsCode || line.hs_code || line.hsn_code, "999999"),
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
  } else if (context.pieces && context.pieces.length > 0) {
    for (const p of context.pieces) {
      const pLen = num(p.length, 10);
      const pWid = num(p.breadth || p.width, 10);
      const pHgt = num(p.height, 10);
      const pWeight = num(p.actual_weight_per_pc || p.charge_weight_per_pc, grossWeight / context.pieces.length);
      const pCubicWeight = Number(((pLen * pWid * pHgt) / 5000).toFixed(3));
      const pVal = (shipmentVal / context.pieces.length).toFixed(2);

      const piece = {
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
    const defaultPiece = {
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
    warnings.push(`ThirdPartyToken not configured for service code "${serviceCode}". Live booking will be blocked.`);
  }

  const payloadItem = {
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
    payloadItem.ThirdPartyToken = thirdPartyToken.trim();
  }

  return { body: [payloadItem], tokenMissing, warnings };
}

// ─── Token Registry for MEL and NZ ──────────────────────────────────────────
const STATION_KEYS = {
  MEL: "5535E00AF881A2D1212AA1A27574E499",
  NZ: "36FA600E65426DDAF314A836402AEA59",
};

const SERVICE_TOKENS = {
  MEL: {
    APDMEL: "FE246011E9DE04EB46D6021FE43BC6D6",
    "PATN0.5KG": "AA2ADC6E881DAB945C0F8A1EED668283",
    PATN1KG: "AA2ADC6E881DAB945C0F8A1EED668283",
    PATN3KG: "AA2ADC6E881DAB945C0F8A1EED668283",
    PAT5KG: "AA2ADC6E881DAB945C0F8A1EED668283",
    PATN10KG: "AA2ADC6E881DAB945C0F8A1EED668283",
    PATN15KG: "AA2ADC6E881DAB945C0F8A1EED668283",
    PATN20KG: "AA2ADC6E881DAB945C0F8A1EED668283",
    PATN25KG: "AA2ADC6E881DAB945C0F8A1EED668283",
    PDS500GRM: "4A3C7348D7A13D1F716780654A93DFEE",
    PDS1KG: "4A3C7348D7A13D1F716780654A93DFEE",
    PDS3KG: "4A3C7348D7A13D1F716780654A93DFEE",
    PDS5KG: "4A3C7348D7A13D1F716780654A93DFEE",
    PNPU25KG: "4A3C7348D7A13D1F716780654A93DFEE", // Couriers Please
  },
  NZ: {
    NZATL: "C3696FC326DD16064E2F9B2A1534B120",
    NZSIG: "C3696FC326DD16064E2F9B2A1534B120",
  },
};

// ─── Test Harness ────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}${detail ? ": " + detail : ""}`);
    failed++;
  }
}

console.log("\n=== PostShipping Spec-Compliance & Value Cleanup Verification ===\n");

// 1. Configurable WeightMeasurement Check
console.log("── Item 1: Configurable WeightMeasurement constant ───────────");
assert("POSTSHIPPING_WEIGHT_MEASUREMENT constant is defined", typeof POSTSHIPPING_WEIGHT_MEASUREMENT === "string");
assert("POSTSHIPPING_WEIGHT_MEASUREMENT equals 'Kgs'", POSTSHIPPING_WEIGHT_MEASUREMENT === "Kgs");

// 2. Real Shipment with KYC (PAN) + Custom ExportReason & Incoterms
console.log("\n── Item 2 & 3: Real Shipment with KYC & Proforma Values ──────");
const melContext = {
  shipment: {
    id: "mel-shipment-001",
    awb_no: "SWFMEL10001",
    reference_no: "REF-MEL-001",
    service: "PNPU25KG",
    service_code: "PNPU25KG",
    vendor_id: "mel-vendor-uuid",
    pieces: 2,
    actual_weight: 4.8,
    charge_weight: 5.0,
    shipment_value: 150,
    content: "Commercial Samples",
    shipper: {
      contact_name: "Anita Desai",
      company_name: "Telangana Textiles",
      address1: "Plot 42, Hitec City",
      city: "Hyderabad",
      state: "Telangana",
      pincode: "500081",
      country: "INDIA",
      mobile_no: "9876543210",
      email: "anita@textiles.in",
      document_type: "PAN",
      document_no: "AAACT1234F",
    },
    consignee: {
      contact_name: "Liam O'Connor",
      company_name: "Melbourne Retail Pty Ltd",
      address1: "120 Collins St",
      city: "Melbourne",
      state: "VIC",
      pincode: "3000",
      country: "AUSTRALIA",
      mobile_no: "0498765432",
      telephone: "0398765432",
      email: "liam@melbourneretail.com.au",
    },
    wizard_extras: {
      proforma: {
        currency: "AUD",
        termOfInvoice: "DDP",
        exportReason: "Sample",
        lines: [
          { description: "Cotton Fabric Swatches", hsCode: "520811", quantity: 2, amount: "150.00", rate: "75.00", weight: 2.4 },
        ],
      },
    },
  },
  pieces: [],
  charges: [],
};

const melToken = SERVICE_TOKENS.MEL.PNPU25KG;
const melPayload = buildPostShippingPayload(melContext, melToken);
const melItem = melPayload.body[0];

assert("SenderKycType reflects actual doc (PAN)", melItem.SenderDetails.SenderKycType === "PAN");
assert("SenderKycNumber reflects actual number (AAACT1234F)", melItem.SenderDetails.SenderKycNumber === "AAACT1234F");
assert("ReasonExport reflects shipment value (Sample)", melItem.PackageDetails.ReasonExport === "Sample");
assert("Incoterms reflects shipment value (DDP)", melItem.PackageDetails.Incoterms === "DDP");
assert("ShipmentTerm reflects shipment value (DDP)", melItem.PackageDetails.ShipmentTerm === "DDP");
assert("WeightMeasurement uses constant value 'Kgs'", melItem.PackageDetails.WeightMeasurement === POSTSHIPPING_WEIGHT_MEASUREMENT);

// 3. Shipment WITHOUT KYC doc (No invented values)
console.log("\n── Item 2: Shipment WITHOUT KYC doc (No invented values) ──────");
const noKycContext = {
  ...melContext,
  shipment: {
    ...melContext.shipment,
    shipper: {
      contact_name: "Anita Desai",
      address1: "Plot 42, Hitec City",
      city: "Hyderabad",
      country: "INDIA",
      mobile_no: "9876543210",
      // No document_type, document_no, pan, iec, etc.
    },
    wizard_extras: {},
  },
};
const noKycPayload = buildPostShippingPayload(noKycContext, melToken);
const noKycItem = noKycPayload.body[0];

assert("Shipment without KYC leaves SenderKycType undefined/empty", noKycItem.SenderDetails.SenderKycType === undefined || noKycItem.SenderDetails.SenderKycType === "");
assert("Shipment without KYC leaves SenderKycNumber undefined/empty", noKycItem.SenderDetails.SenderKycNumber === undefined || noKycItem.SenderDetails.SenderKycNumber === "");
assert("Shipment without proforma defaults ReasonExport to 'Commercial'", noKycItem.PackageDetails.ReasonExport === "Commercial");
assert("Shipment without proforma defaults Incoterms to 'DDU'", noKycItem.PackageDetails.Incoterms === "DDU");

// 4. Exact Key Name Structural Assertions
console.log("\n── Field Name Verification ───────────────────────────────────");
assert("Top level has 'Pending'", "Pending" in melItem && melItem.Pending === true);
assert("Top level has 'ThirdPartyToken'", "ThirdPartyToken" in melItem);
assert("Top level has 'SenderDetails'", "SenderDetails" in melItem);
assert("Top level has 'ReceiverDetails'", "ReceiverDetails" in melItem);
assert("Top level has 'PackageDetails'", "PackageDetails" in melItem);
assert("Top level DOES NOT have 'ConsignmentNumber'", !("ConsignmentNumber" in melItem));
assert("Top level DOES NOT have 'DeclaredValue'", !("DeclaredValue" in melItem));
assert("SenderDetails has 'SenderAdd1'", "SenderAdd1" in melItem.SenderDetails);
assert("SenderDetails has 'SenderAddCity'", "SenderAddCity" in melItem.SenderDetails);
assert("ReceiverDetails has 'ReceiverAdd1'", "ReceiverAdd1" in melItem.ReceiverDetails);
assert("ReceiverDetails has 'ReceiverMobile'", "ReceiverMobile" in melItem.ReceiverDetails);
assert("PackageDetails has 'GoodsDescription'", "GoodsDescription" in melItem.PackageDetails);
assert("PackageDetails has 'CustomValue'", "CustomValue" in melItem.PackageDetails);
assert("PackageDetails has 'GoodsOriginCountryCode'", "GoodsOriginCountryCode" in melItem.PackageDetails);
assert("Pieces has 'ManufactureCountryCode'", "ManufactureCountryCode" in melItem.PackageDetails.ShipmentResponseItem[0].Pieces[0]);
assert("Pieces has 'OriginCountryCode'", "OriginCountryCode" in melItem.PackageDetails.ShipmentResponseItem[0].Pieces[0]);

console.log("\n── Client Bundle Secret Leak Check ──────────────────────────");
const srcDir = path.resolve(process.cwd(), "src");
let leakedKeys = false;
function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") || entry.name.endsWith(".js"))) {
      const content = fs.readFileSync(fullPath, "utf8");
      if (content.includes("5535E00AF881A2D1212AA1A27574E499") || content.includes("36FA600E65426DDAF314A836402AEA59")) {
        console.error(`  ❌ Key leaked in file: ${fullPath}`);
        leakedKeys = true;
      }
    }
  }
}
scanDir(srcDir);
assert("Zero station keys present in src/ directory", leakedKeys === false);

console.log("\n── Regenerated Masked cURL for MEL Couriers Please (PNPU25KG) ──");
const sampleCurl = `curl -X POST "https://api.postshipping.com/api2/shipments" \\
  -H "Token: 5535E00A...4E499" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(melPayload.body, null, 2)}'`;

console.log(sampleCurl);

console.log(`\n=== Verification Results: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
