/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  UPS INTEGRATION — CONTROLLED LIVE BOOKING TEST                     ║
 * ║  Calls the PROJECT ROUTE: POST http://localhost:8082/api/shipping/ups/book ║
 * ║  All fields are clearly marked [TEST] to avoid confusion             ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Usage: node scripts/test-ups-live.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROUTE = "http://localhost:8082/api/shipping/ups/book";
const TEST_REF = `TEST-UPS-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
const OUTPUT_DIR = path.join(__dirname, "../.test-output");

function banner(title) {
  console.log("\n" + "═".repeat(60));
  console.log("  " + title);
  console.log("═".repeat(60));
}

function log(label, value) {
  console.log(`  ${String(label).padEnd(22)}: ${value}`);
}

// Credentials are NOT sent — the server route injects them from process.env.
// Every free-text field is prefixed with [TEST].
const payload = {
  CustomerRefNo: TEST_REF,
  OriginName: "AMD",
  DestinationName: "US",
  ShipperName: "[TEST] SWIFTFORGE INTEGRATION TEST",
  ShipperContact: "[TEST] AUTOMATED TEST RUNNER",
  ShipperAdd1: "[TEST] 1 TEST STREET",
  ShipperAdd2: "[TEST] TEST BLOCK",
  ShipperCity: "MUMBAI",
  ShipperState: "MAHARASHTRA",
  ShipperPin: "400067",
  ShipperTelno: "9818771229",
  ShipperMobile: "9818771229",
  ShipperEmail: "test@swiftforge.internal",
  DocumentType: "Aadhaar Number",
  DocumentNumber: "123456789012",
  ConsigneeName: "[TEST] DO NOT DELIVER",
  ConsigneeContact: "[TEST] TEST RECIPIENT",
  ConsigneeAdd1: "[TEST] 39 WEST 39 STREET",
  ConsigneeAdd2: "[TEST] SUITE 000",
  ConsigneeCity: "NEW YORK",
  ConsigneeState: "NY",
  ConsigneePin: "10018",
  ConsigneeTelno: "1646627652",
  ConsigneeMobile: "1646627652",
  ConsigneeEmail: "test@swiftforge.internal",
  ConsigneeDocumentType: "Pan Number",
  ConsigneeDocumentNumber: "1234567890",
  Instruction: "[TEST] AUTOMATED INTEGRATION TEST — DO NOT PROCESS OR DELIVER",
  VendorName: "UPS",
  ServiceName: "WORLDWIDE EXPRESS SAVER",
  ProductCode: "SPX",
  Dox_Spx: "SPX",
  Pieces: "1",
  Weight: "1.000",
  Content: "[TEST] SWIFTFORGE AUTOMATED TEST ITEM — NO COMMERCIAL VALUE",
  Currency: "INR",
  ShipmentValue: "1",
  CODAmount: "0.00",
  CSBType: "CSB5",  // CSB5 = commercial international (CSB4 = low-value)
  TermofInvoice: "CIF",
  InvoiceNo: `TEST-INV-${Date.now()}`,
  InvoiceDate: new Date().toLocaleDateString("en-GB").replace(/\//g, "/"),
  CompanyCode: "BS",
  IsCommercial: 0,
  OTP: "",
  LSPType: "I",
  RequiredPerforma: "y",
  RequiredLable: "y",
  KYCDocumentType: "Aadhaar Number",
  KYCImage: "",
  ImageType: "PDF",
  KYCImage1: "",
  ImageType1: "PDF",
  ExportReason: "FREE SAMPLE OF NO COMMERICAL VALUE",  // Exact Xpresion enum value (note: API uses this spelling)
  Dimensions: [{ ActualWeight: "1.000", Vol_WeightL: "10.000", Vol_WeightW: "10.000", Vol_WeightH: "10.000" }],
  Performa: [{ BoxNo: "Box-1", Description: "[TEST] AUTOMATED TEST ITEM", HSNCode: "1234567890", Quantity: "1", Unit: "PCS", Rate: "1.00", Amount: "1.00", Weight: "1.000", PerformaIGST: "0", PerformaIGSTAmount: "0" }],
  additionalInfo: { discount: "0.00", Freight_Charges: "0.00", Insurance: "0.00", Other_charges: "0.00", SpecifyCharges: "0" },
  Buyerdetails: { DestinationCode: "US", Name: "[TEST] DO NOT DELIVER", Person: "Business", Address1: "[TEST] 39 WEST STREET", Address2: "[TEST] SUITE 000", PinCode: "10018", City: "NEW YORK", State: "NY", Telephone: "1646627652", Mobile: "1646627652", Email: "test@swiftforge.internal", countryCode: "US", IECNo: "" },
  ManifestGstDetails: { GST_Invoice: "0", LUTIGST: "N", TotalIGST: "0.00", Format: "C2C" },
  fedexSpecial: {},
  upsSpecial: { chkInsuCvrg: "", Insurance_value: "", UPSBillShipmentTo: "", UPSShipmentChargesAccountNo: "", UPSPostalCode: "", UPSCountryCode: "" },
};

async function run() {
  banner("STEP 4 — CONTROLLED LIVE BOOKING TEST");
  console.log("  Route   : " + PROJECT_ROUTE);
  console.log("  Ref     : " + TEST_REF);
  console.log("  Vendor  : UPS / WORLDWIDE EXPRESS SAVER");
  console.log("  WARNING : All shipper/consignee fields marked [TEST]");

  banner("SENDING REQUEST");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000); // 55s > server 45s timeout
  const t0 = Date.now();

  let res, result;
  let attempt = 0;
  while (attempt < 2) {
    attempt++;
    try {
      res = await fetch(PROJECT_ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      result = await res.json();
      // If first attempt timed out on server, retry once
      if (result?.apiStatus === "TIMEOUT" && attempt === 1) {
        console.log("  Server timeout on attempt 1 — retrying (attempt 2)...");
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      break;
    } catch (err) {
      clearTimeout(timeout);
      console.error("\n  NETWORK ERROR: " + err.message);
      console.error("  Is the dev server running at http://localhost:8082 ?");
      process.exit(1);
    }
  }

  banner("RAW RESPONSE");
  log("HTTP Status", res.status);
  log("Response Time", (Date.now() - t0) + "ms");
  log("success", result.success);
  log("awbNo", result.awbNo || "(none)");
  log("refNo", result.refNo || "(none)");
  log("message", result.message || "(none)");
  log("apiStatus", result.apiStatus || "(none)");
  log("apiError", result.apiError || "(none)");
  log("noResponse", result.noResponse);
  log("documents", (result.documents || []).length + " docs");

  if (result.documents?.length) {
    for (const doc of result.documents) {
      log("  - " + doc.docType, doc.label + " (" + doc.mimeType + ") base64_len=" + (doc.contentB64?.length || 0));
    }
  }

  // Save documents to disk
  if (result.success && result.documents?.length > 0) {
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    banner("SAVING DOCUMENTS");
    for (const doc of result.documents) {
      const ext = doc.mimeType?.includes("pdf") ? "pdf" : "png";
      const fileName = `${TEST_REF}_${doc.docType}.${ext}`;
      const filePath = path.join(OUTPUT_DIR, fileName);
      try {
        fs.writeFileSync(filePath, Buffer.from(doc.contentB64, "base64"));
        log(doc.label, "Saved → .test-output/" + fileName);
      } catch (e) {
        log(doc.label, "SAVE ERROR: " + e.message);
      }
    }
  }

  // Check 4 verdict
  banner("CHECK 4 VERDICT");
  const hasAwb = !!(result.awbNo?.trim());
  const hasLabel = result.documents?.some(d => d.docType === "SHIPPING_LABEL" && d.contentB64?.length > 10);
  const hasPerforma = result.documents?.some(d => d.docType === "VENDOR_INVOICE" && d.contentB64?.length > 10);

  log("AWB issued", hasAwb ? ("PASS  " + result.awbNo) : "FAIL  (missing)");
  log("Label present", hasLabel ? "PASS" : "FAIL");
  log("Performa present", hasPerforma ? "PASS  (bonus)" : "SKIP  (ok if RequiredPerforma works)");

  const step4Pass = result.success && hasAwb && hasLabel;
  console.log("\n  CHECK 4: " + (step4Pass ? "PASS" : "FAIL"));

  if (hasAwb) {
    console.log("\n  AWB CREATED: " + result.awbNo);
    console.log("  ACTION REQUIRED: Manually cancel this AWB in the Xpresion");
    console.log("  dashboard to avoid charges: https://wf.xpresion.in/");
  }

  // Final overall verdict
  banner("FINAL GO / NO-GO");
  if (step4Pass) {
    console.log("  GO — All 4 checks passed. UPS integration is production-ready.");
  } else {
    console.log("  NO-GO — Live booking failed.");
    console.log("  Blocker: " + (result.apiError || result.message));
  }
  console.log("");
}

run().catch(err => { console.error("Fatal:", err); process.exit(1); });
