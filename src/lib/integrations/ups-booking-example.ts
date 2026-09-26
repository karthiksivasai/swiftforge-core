/**
 * UPS AWB Booking — Example Usage
 *
 * Demonstrates how to build a UPS payload and call the booking API
 * using the Xpresion/World-First integration.
 *
 * Run from the browser or a server component:
 *   import { bookUpsShipmentExample } from "@/lib/integrations/ups-booking-example";
 *   const result = await bookUpsShipmentExample();
 */

import {
  buildUpsBookingPayload,
  callWorldFirstBookingApi,
  getUpsClientConfig,
  type WfBookingResult,
} from "./world-first-api";

/**
 * Books a sample UPS "WORLDWIDE EXPRESS SAVER" SPX shipment.
 *
 * All fields here mirror the request sample provided in the Xpresion API docs.
 * Replace values with real data from your form / database before calling in
 * production.
 */
export async function bookUpsShipmentExample(): Promise<WfBookingResult> {
  // ---------------------------------------------------------------------------
  // 1. Build form data — matches real shipment fields used by the app's AWB form
  // ---------------------------------------------------------------------------
  const formData: Record<string, unknown> = {
    // Reference
    bookingRef: "3288898",

    // Shipper
    shipper: {
      companyName: "JENI POLYCHEM INDUSTRIES",
      contactName: "RACHIT SHAH",
      address1: "OFFICE NO. 7, AVON APARTMENT",
      address2: "SHIVAJI ROAD,",
      city: "MUMBAI",
      state: "MAHARASHTRA",
      pincode: "400067",
      telephone: "9818771229",
      mobileNo: "9818771229",
      email: "jitesh_s@xpresion.in",
      documentType: "Aadhaar Number",
      documentNo: "123456789012",
      originCity: "AMD",
    },

    // Consignee
    consignee: {
      companyName: "VIKAS SHETH",
      contactName: "VIKAS SHETH",
      address1: "39 WEST 39 WEST 39 WEST 39 WES",
      address2: "39 STREET",
      city: "NEW YORK",
      state: "NY",
      pincode: "10018",
      telephone: "1646627652",
      mobileNo: "1646627652",
      email: "test@test.com",
      documentType: "Pan Number",
      documentNo: "1234567890",
      destinationCode: "US",
    },

    // Shipment
    doxSpx: "SPX",
    totalPieces: "1",
    chargeWeight: "1.000",
    content: "HONDA SCOTTY 125 CC",
    currency: "INR",
    shipmentValue: "533",
    codAmount: "0.00",
    csbType: "COMMERCIAL",
    termOfInvoice: "CIF",
    invoiceNo: "test1903",
    invoiceDate: "01/02/2026",
    companyCode: "BS",

    // Flags
    isCommercial: 0,
    otp: "123456",
    lspType: "I",
    requiredPerforma: "y",
    requiredLabel: "y",

    // KYC
    kycDocumentType: "Aadhaar Number",
    kycImage: "",
    imageType: "PDF",
    kycImage1: "",
    imageType1: "PDF",
    exportReason: "FREE SAMPLE OF NO COMMERCIAL VALUE",

    // Dimensions (one box)
    piecesLines: [
      {
        actualWeight: "1.000",
        length: "10.000",
        breadth: "10.000",
        height: "10.000",
      },
    ],

    // Proforma lines
    proformaLines: [
      {
        boxNo: "Box-1",
        description: "HONDA SCOTTY 125 CC",
        hsnCode: "123456",
        quantity: "1",
        unit: "PCS",
        rate: "1.00",
        amount: "1.00",
        weight: "1.000",
        igstPercent: "0",
        igstAmount: "0",
      },
    ],
  };

  // ---------------------------------------------------------------------------
  // 2. Build the full UPS payload
  //    - VendorName is forced to "UPS"
  //    - ServiceName defaults to "WORLDWIDE EXPRESS SAVER"
  //    - fedexSpecial is left empty
  //    - upsSpecial uses defaults (shipper-account billing, no declared insurance)
  // ---------------------------------------------------------------------------
  const payload = buildUpsBookingPayload(formData, {
    serviceName: "WORLDWIDE EXPRESS SAVER",

    // Optional: enable declared-value insurance
    // upsOptions: { chkInsuCvrg: "1", Insurance_value: "500" },

    // Optional: bill to a third-party UPS account
    // upsOptions: {
    //   UPSBillShipmentTo: "THIRD_PARTY",
    //   UPSShipmentChargesAccountNo: "1A2B3C",
    //   UPSPostalCode: "10018",
    //   UPSCountryCode: "US",
    // },

    overrides: {
      Instruction: "Testing",
      // Buyer details for international customs
      Buyerdetails: {
        DestinationCode: "US",
        Name: "VIKAS SHETH",
        Person: "Business",
        Address1: "39 WEST",
        Address2: "39 STREET",
        PinCode: "10018",
        City: "NEW YORK",
        State: "NY",
        Telephone: "1646627652",
        Mobile: "1646627652",
        Email: "test@test.com",
        countryCode: "US",
        IECNo: "",
      },
      ManifestGstDetails: {
        GST_Invoice: "0",
        LUTIGST: "N",
        TotalIGST: "0.00",
        Format: "C2C",
      },
      additionalInfo: {
        discount: "0.00",
        Freight_Charges: "0.00",
        Insurance: "0.00",
        Other_charges: "0.00",
        SpecifyCharges: "0",
      },
    },
  });

  // ---------------------------------------------------------------------------
  // 3. Call the server endpoint (credentials are injected server-side)
  // ---------------------------------------------------------------------------
  const config = getUpsClientConfig(); // → { serverEndpoint: "/api/shipping/ups/book" }
  const result = await callWorldFirstBookingApi(payload, config);

  // ---------------------------------------------------------------------------
  // 4. Handle result
  // ---------------------------------------------------------------------------
  if (result.success) {
    console.log("✅ UPS AWB booked successfully!");
    console.log("   AWB No   :", result.awbNo);
    console.log("   Ref No   :", result.refNo);
    console.log("   Documents:", result.documents.length);
    result.documents.forEach((doc) => {
      console.log(`   - ${doc.label} (${doc.mimeType})`);
      // doc.dataUrl  → data URI for <img> / <iframe>
      // doc.contentB64 → raw base64 for saving as file
    });
  } else {
    console.error("❌ UPS AWB booking failed!");
    console.error("   Status  :", result.apiStatus);
    console.error("   Message :", result.message);
    console.error("   APIError:", result.apiError);
  }

  return result;
}
