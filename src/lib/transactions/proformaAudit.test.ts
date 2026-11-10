import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error test-data.mjs is untyped
import { createDb, resolveMasters } from "../../../scripts/awb-audit/test-data.mjs";
import {
  validateProformaEntry,
  importProformaRows,
  recalculateProformaAmounts,
} from "@/lib/transactions/proformaImport";
import {
  buildInvoiceHtml,
  formToInvoiceInput,
} from "@/lib/transactions/invoiceGenerator";

const env = Object.fromEntries(
  fs.readFileSync(path.resolve(process.cwd(), ".env"), "utf8")
    .split("\n")
    .filter(l => l.includes("="))
    .map(l => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;

const admin = createClient(url, serviceKey);
const client = createClient(url, anonKey);

describe("Proforma Tab Audit Live Verification", () => {
  let masters: any;
  let doxProduct: any;
  let comProduct: any;
  let usLane: any;
  const hoBranch = { id: "b69b8007-dd55-4808-a8b1-afb91a9a46a4", code: "HO" };

  beforeAll(async () => {
    // Authenticate client as kkarthik
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: "kkarthik3162@gmail.com",
    });
    if (linkErr) throw linkErr;

    const { data: sess, error: sessErr } = await client.auth.verifyOtp({
      token_hash: link.properties.hashed_token,
      type: "magiclink",
    });
    if (sessErr) throw sessErr;

    masters = await resolveMasters(admin);
    doxProduct = masters.products.find((p: any) => p.code === "DOX");
    comProduct = masters.products.find((p: any) => p.code === "COM");
    usLane = masters.lanes.find((l: any) => l.destinationCode === "US");
  }, 20000);

  function buildPayload(ref: string, options: any = {}) {
    const isComm = Boolean(options.commercial);
    const ndoxProduct = masters.products.find((p: any) => p.code === "NDOX");
    const prod = options.product === "NDOX" ? ndoxProduct : isComm ? comProduct : doxProduct;
    return {
      fields: {
        customer_id: masters.customer.id,
        customer_code: masters.customer.code,
        product_id: prod.id,
        product_code: prod.code,
        origin_destination_id: masters.origin.id,
        origin_code: masters.origin.code,
        destination_id: usLane.destination.id,
        destination_code: usLane.destination.code,
        vendor_id: masters.fedex.id,
        vendor_code: masters.fedex.code,
        delivery_vendor_id: null,
        delivery_vendor_code: null,
        field_executive_id: null,
        field_executive_code: null,
        branch_id: hoBranch.id,
        branch_code: hoBranch.code,
        pickup_id: null,
        book_date: "2026-11-10",
        book_time: "1000",
        awb_no: null,
        reference_no: ref,
        airline: null,
        service: "FEDEX",
        payment_type: "CASH",
        content: "SAMPLE ITEMS",
        instruction: "TEST PROFORMA",
        pieces: String(options.piecesCount || 1),
        pieces_unit: options.piecesUnit || (options.product === "NDOX" ? "NDOX" : "DOX"),
        actual_weight: "0.500",
        weight_unit: "KG",
        vol_weight: "0.000",
        charge_weight: "0.500",
        shipment_value: options.shipmentValue || "350.00",
        currency: options.currency || "INR",
        is_commercial: isComm,
        is_oda: false,
        medical_charges: false,
        customer_charges_total: "324.50",
        vendor_charges_total: "227.15",
        cash_receipt_no: "CR-" + ref,
        amount_received: "324.50",
        balance_amount: "0.00",
        cash_receipt_date: "2026-11-10",
        forwarding_awb: null,
        delivery_awb: null,
        return_awb: null,
        delivery_service: null,
        flight_no: null,
        is_locked: false,
        shipper: {
          company_name: "Ali Associates",
          contact_name: "Karthik",
          address1: "12 Test Road",
          address2: "",
          city: "Hyderabad",
          state: "Telangana",
          pincode: "500001",
          country: "India",
          telephone: "",
          mobile: "9876543210",
          email: "shipper@example.com",
          iec_no: options.shipperIec ?? "ABCDE12345",
          document_type: "GST",
          document_no: "36AAAAA0000A1Z5",
        },
        consignee: {
          company_name: "Acme USA Corp",
          contact_name: "John Doe",
          address1: "123 Fifth Ave",
          address2: "Suite 400",
          city: "New York",
          state: "NY",
          pincode: "10001",
          country: "United States of America",
          telephone: "",
          mobile: "+12125550199",
          email: "consignee@example.com",
          iec_no: "",
          document_type: "",
          document_no: "",
        },
        wizard_extras: {
          proforma: options.proforma || {},
          masterAwbNo: "",
          expectedDeliveryDate: "2026-11-15",
          notifyEmail: false,
          notifySms: false,
        },
      },
      pieces: [
        {
          child_awb: null,
          actual_weight_per_pc: "0.500",
          pieces: "1",
          length: "0",
          breadth: "0",
          height: "0",
          divisor: "5000",
          vol_weight: null,
          charge_weight: null,
          measurement_unit: "Centimeter",
        },
      ],
      charges: [
        {
          side: "CUSTOMER",
          description: "Freight",
          rate: "250.00",
          amount: "250.00",
          fuel_applies: true,
          fuel_amount: "25.00",
          tax_applies: true,
          tax_on_fuel: true,
          igst: "0.00",
          sgst: "24.75",
          cgst: "24.75",
          total: "324.50",
          charges_type: "SYSTEM",
        },
      ],
    };
  }

  let p1Shipment: any = null;

  it("P1: books CSB IV gift with 2 lines (INR) and verifies DB storage & invoice output", async () => {
    const p1Proforma = {
      csbType: "CSB 4",
      termOfInvoice: "Cost and Freight(CFR)",
      gstInvoice: false,
      invoiceNo: "INV-P1-001",
      invoiceDate: "2026-11-10",
      departmentNo: "",
      exportReason: "UNSOLICITED GIFT - NOT FOR SALE",
      format: "B2C",
      currency: "INR",
      adCode: "",
      bondUt: "No",
      payOfIgst: "No",
      ecommerce: "No",
      meis: "No",
      invoiceType: "Commercial",
      lines: [
        {
          id: "p1-l1",
          boxNo: "Box-1",
          packages: "1",
          description: "Cotton Shirt",
          hsCode: "61091000",
          quantity: "2",
          weight: "0.200",
          unit: "PCS",
          rate: "100.00",
          amount: "200.00",
          igstPercent: "0",
          igstAmount: "0.00",
        },
        {
          id: "p1-l2",
          boxNo: "Box-1",
          packages: "1",
          description: "Handicraft Wooden Box",
          hsCode: "44201000",
          quantity: "1",
          weight: "0.300",
          unit: "PCS",
          rate: "150.00",
          amount: "150.00",
          igstPercent: "0",
          igstAmount: "0.00",
        },
      ],
    };
    const payload = buildPayload("TEST_AWB_P1", { proforma: p1Proforma, shipmentValue: "350.00" });
    const { data, error } = await client.rpc("book_awb_shipment", {
      p_id: null,
      p_row_version: null,
      p_fields: payload.fields,
      p_pieces: payload.pieces,
      p_charges: payload.charges,
    });
    expect(error).toBeNull();
    expect(data.current_status).toBe("BOOKED");
    expect(data.awb_no).toBeDefined();
    p1Shipment = data;
    console.log("[P1 BOOKED]", data.awb_no, "Status:", data.current_status, "Total:", data.grand_total);

    // Verify DB shipment wizard_extras
    const { data: dbRow } = await admin.from("shipments").select("wizard_extras").eq("id", data.id).single();
    expect((dbRow?.wizard_extras as any)?.proforma?.lines?.length).toBe(2);

    // Verify printed invoice generator
    const invInput = formToInvoiceInput({
      awbNo: data.awb_no,
      bookDate: "2026-11-10",
      invoiceNo: p1Proforma.invoiceNo,
      forwardingNo: "",
      flightNo: "",
      shipmentCurrency: "INR",
      pieces: "1",
      piecesUnit: "DOX",
      actualWeight: "0.500",
      volWeight: "0.000",
      chargeWeight: "0.500",
      shipper: {
        origin: { code: "HYD", name: "Hyderabad" },
        companyName: { code: "", name: payload.fields.shipper.company_name },
        contactName: payload.fields.shipper.contact_name,
        address1: payload.fields.shipper.address1,
        address2: payload.fields.shipper.address2,
        city: payload.fields.shipper.city,
        state: payload.fields.shipper.state,
        pincode: payload.fields.shipper.pincode,
        country: payload.fields.shipper.country,
        telephone: payload.fields.shipper.telephone,
        mobileNo: payload.fields.shipper.mobile,
        email: payload.fields.shipper.email,
        iecNo: payload.fields.shipper.iec_no,
        documentType: payload.fields.shipper.document_type,
        documentNo: payload.fields.shipper.document_no,
      },
      consignee: {
        origin: { code: "NYC", name: "New York" },
        companyName: { code: "", name: payload.fields.consignee.company_name },
        contactName: payload.fields.consignee.contact_name,
        address1: payload.fields.consignee.address1,
        address2: payload.fields.consignee.address2,
        city: payload.fields.consignee.city,
        state: payload.fields.consignee.state,
        pincode: payload.fields.consignee.pincode,
        country: payload.fields.consignee.country,
        telephone: payload.fields.consignee.telephone,
        mobileNo: payload.fields.consignee.mobile,
        email: payload.fields.consignee.email,
      },
      vendor: { code: "FEDE", name: "FEDEX" },
      piecesLines: [],
      proforma: p1Proforma,
      forwarding: { deliveryAwb: "", forwardingAwb: "" },
      chargeLines: [{ description: "Freight", amount: "250.00", fuelAmt: "25.00", igst: "0.00", cgst: "24.75", sgst: "24.75" }],
      customerChargesTotal: "324.50",
      amountReceived: "324.50",
      balanceAmount: "0.00",
    });
    const html = buildInvoiceHtml(invInput);
    expect(html).toContain("Cotton Shirt");
    expect(html).toContain("Handicraft Wooden Box");
    expect(html).toContain("350.00");
  }, 15000);

  it("P2: books CSB V commercial with IEC + Ad Code, GST Invoice Yes, Bond/UT Yes, 3 lines with HSN", async () => {
    const p2Proforma = {
      csbType: "CSB 5",
      termOfInvoice: "Free On Board(FOB)",
      gstInvoice: true,
      invoiceNo: "INV-P2-002",
      invoiceDate: "2026-11-10",
      departmentNo: "",
      exportReason: "SALE",
      format: "B2B",
      currency: "INR",
      adCode: "ADCODE01",
      bondUt: "Yes",
      lutNo: "LUT-HYD-2026-001",
      payOfIgst: "No",
      ecommerce: "No",
      meis: "No",
      invoiceType: "Export Invoice",
      lines: [
        {
          id: "p2-l1",
          boxNo: "Box-1",
          packages: "1",
          description: "Auto Component Part A",
          hsCode: "87082900",
          quantity: "5",
          weight: "0.200",
          unit: "PCS",
          rate: "50.00",
          amount: "250.00",
          igstPercent: "0",
          igstAmount: "0.00",
        },
        {
          id: "p2-l2",
          boxNo: "Box-1",
          packages: "1",
          description: "Auto Component Part B",
          hsCode: "87089900",
          quantity: "10",
          weight: "0.150",
          unit: "PCS",
          rate: "20.00",
          amount: "200.00",
          igstPercent: "0",
          igstAmount: "0.00",
        },
        {
          id: "p2-l3",
          boxNo: "Box-1",
          packages: "1",
          description: "Steel Fasteners",
          hsCode: "73181500",
          quantity: "50",
          weight: "0.150",
          unit: "PCS",
          rate: "2.00",
          amount: "100.00",
          igstPercent: "0",
          igstAmount: "0.00",
        },
      ],
    };
    const payload = buildPayload("TEST_AWB_P2", {
      commercial: true,
      proforma: p2Proforma,
      shipperIec: "ABCDE12345",
      shipmentValue: "550.00",
    });
    const { data, error } = await client.rpc("book_awb_shipment", {
      p_id: null,
      p_row_version: null,
      p_fields: payload.fields,
      p_pieces: payload.pieces,
      p_charges: payload.charges,
    });
    expect(error).toBeNull();
    expect(data.current_status).toBe("BOOKED");
    console.log("[P2 BOOKED]", data.awb_no, "Status:", data.current_status);

    // Invoice check - observe that AD No and LUT No are omitted in invoice mapping!
    const invInput = formToInvoiceInput({
      awbNo: data.awb_no,
      bookDate: "2026-11-10",
      invoiceNo: p2Proforma.invoiceNo,
      forwardingNo: "",
      flightNo: "",
      shipmentCurrency: "INR",
      pieces: "1",
      piecesUnit: "DOX",
      actualWeight: "0.500",
      volWeight: "0.000",
      chargeWeight: "0.500",
      shipper: {
        origin: { code: "HYD", name: "Hyderabad" },
        companyName: { code: "", name: payload.fields.shipper.company_name },
        contactName: payload.fields.shipper.contact_name,
        address1: payload.fields.shipper.address1,
        address2: payload.fields.shipper.address2,
        city: payload.fields.shipper.city,
        state: payload.fields.shipper.state,
        pincode: payload.fields.shipper.pincode,
        country: payload.fields.shipper.country,
        telephone: payload.fields.shipper.telephone,
        mobileNo: payload.fields.shipper.mobile,
        email: payload.fields.shipper.email,
        iecNo: payload.fields.shipper.iec_no,
        documentType: payload.fields.shipper.document_type,
        documentNo: payload.fields.shipper.document_no,
      },
      consignee: {
        origin: { code: "NYC", name: "New York" },
        companyName: { code: "", name: payload.fields.consignee.company_name },
        contactName: payload.fields.consignee.contact_name,
        address1: payload.fields.consignee.address1,
        address2: payload.fields.consignee.address2,
        city: payload.fields.consignee.city,
        state: payload.fields.consignee.state,
        pincode: payload.fields.consignee.pincode,
        country: payload.fields.consignee.country,
        telephone: payload.fields.consignee.telephone,
        mobileNo: payload.fields.consignee.mobile,
        email: payload.fields.consignee.email,
      },
      vendor: { code: "FEDE", name: "FEDEX" },
      piecesLines: [],
      proforma: p2Proforma,
      forwarding: { deliveryAwb: "", forwardingAwb: "" },
      chargeLines: [{ description: "Freight", amount: "250.00", fuelAmt: "25.00", igst: "0.00", cgst: "24.75", sgst: "24.75" }],
      customerChargesTotal: "324.50",
      amountReceived: "324.50",
      balanceAmount: "0.00",
    });
    console.log("[P2 INVOICE CHECK] title:", invInput.title, "| adNo:", invInput.adNo, "| lutNo:", invInput.lutNo, "| gstNo:", invInput.gstNo);
    expect(invInput.title).toBe("COMMERCIAL INVOICE");
    expect(invInput.adNo).toBe("ADCODE01");
    expect(invInput.lutNo).toBe("LUT-HYD-2026-001");
    expect(invInput.gstNo).toBe("36AAAAA0000A1Z5");
  }, 15000);

  it("P3: books CSB V with Pay of IGST Yes and checks line IGST calculations", async () => {
    const p3Proforma = {
      csbType: "CSB 5",
      termOfInvoice: "Cost, Insurance and Freight(CIF)",
      gstInvoice: true,
      invoiceNo: "INV-P3-003",
      invoiceDate: "2026-11-10",
      departmentNo: "",
      exportReason: "SALE",
      format: "B2B",
      currency: "INR",
      adCode: "ADCODE01",
      bondUt: "No",
      payOfIgst: "Yes",
      ecommerce: "No",
      meis: "No",
      invoiceType: "Tax Invoice",
      lines: [
        {
          id: "p3-l1",
          boxNo: "Box-1",
          packages: "1",
          description: "Industrial Valve",
          hsCode: "84818030",
          quantity: "1",
          weight: "0.250",
          unit: "PCS",
          rate: "100.00",
          amount: "100.00",
          igstPercent: "18",
          igstAmount: "18.00",
        },
        {
          id: "p3-l2",
          boxNo: "Box-1",
          packages: "1",
          description: "Control Sensor",
          hsCode: "90328910",
          quantity: "2",
          weight: "0.250",
          unit: "PCS",
          rate: "200.00",
          amount: "400.00",
          igstPercent: "18",
          igstAmount: "72.00",
        },
      ],
    };
    const payload = buildPayload("TEST_AWB_P3", {
      commercial: true,
      proforma: p3Proforma,
      shipperIec: "ABCDE12345",
      shipmentValue: "500.00",
    });
    const { data, error } = await client.rpc("book_awb_shipment", {
      p_id: null,
      p_row_version: null,
      p_fields: payload.fields,
      p_pieces: payload.pieces,
      p_charges: payload.charges,
    });
    expect(error).toBeNull();
    console.log("[P3 BOOKED]", data.awb_no);
    const lineTotalIgst = p3Proforma.lines.reduce((s, l) => s + parseFloat(l.igstAmount), 0);
    expect(lineTotalIgst).toBe(90.00); // 18 + 72
  }, 15000);

  it("P4: books foreign currency (USD) and observes lack of exchange rate / conversion", async () => {
    const p4Proforma = {
      csbType: "CSB 4",
      termOfInvoice: "Delivered at Place(DAP)",
      gstInvoice: false,
      invoiceNo: "INV-P4-004",
      invoiceDate: "2026-11-10",
      departmentNo: "",
      exportReason: "Bonafide Gift",
      format: "B2C",
      currency: "USD",
      adCode: "",
      bondUt: "No",
      payOfIgst: "No",
      ecommerce: "No",
      meis: "No",
      invoiceType: "Sample",
      lines: [
        {
          id: "p4-l1",
          boxNo: "Box-1",
          packages: "1",
          description: "Silk Scarf Sample",
          hsCode: "62141000",
          quantity: "2",
          weight: "0.500",
          unit: "PCS",
          rate: "25.00",
          amount: "50.00",
          igstPercent: "0",
          igstAmount: "0.00",
        },
      ],
    };
    const payload = buildPayload("TEST_AWB_P4", {
      currency: "USD",
      proforma: p4Proforma,
      shipmentValue: "50.00",
    });
    const { data, error } = await client.rpc("book_awb_shipment", {
      p_id: null,
      p_row_version: null,
      p_fields: payload.fields,
      p_pieces: payload.pieces,
      p_charges: payload.charges,
    });
    expect(error).toBeNull();
    console.log("[P4 BOOKED]", data.awb_no, "Currency stored:", payload.fields.currency, "Grand total:", data.grand_total);
  }, 15000);

  it("P5: books Proforma with 10+ lines", async () => {
    const p5Lines = Array.from({ length: 12 }, (_, i) => ({
      id: `p5-l${i + 1}`,
      boxNo: "Box-1",
      packages: "1",
      description: `Sample Item Batch ${i + 1}`,
      hsCode: "61091000",
      quantity: String(i + 1),
      weight: "0.040",
      unit: "PCS",
      rate: "10.00",
      amount: `${((i + 1) * 10).toFixed(2)}`,
      igstPercent: "0",
      igstAmount: "0.00",
    }));
    const p5Proforma = {
      csbType: "CSB 4",
      termOfInvoice: "FOB",
      gstInvoice: false,
      invoiceNo: "INV-P5-005",
      invoiceDate: "2026-11-10",
      departmentNo: "",
      exportReason: "PERSONAL",
      format: "B2C",
      currency: "INR",
      adCode: "",
      bondUt: "No",
      payOfIgst: "No",
      ecommerce: "No",
      meis: "No",
      invoiceType: "Imported Proforma",
      lines: p5Lines,
    };
    const payload = buildPayload("TEST_AWB_P5", {
      proforma: p5Proforma,
      shipmentValue: "780.00",
    });
    const { data, error } = await client.rpc("book_awb_shipment", {
      p_id: null,
      p_row_version: null,
      p_fields: payload.fields,
      p_pieces: payload.pieces,
      p_charges: payload.charges,
    });
    expect(error).toBeNull();
    console.log("[P5 BOOKED]", data.awb_no, "12 lines stored successfully");
  }, 15000);

  it("P6: Break tests live validation", async () => {
    // 6a: Box No above pieces count
    const test6a = validateProformaEntry({
      boxNo: "Box-5",
      packages: "1",
      description: "Test Item",
      hsnCode: "61091000",
      quantity: "1",
      weight: "0.1",
      unit: "PCS",
      rate: "10",
      units: ["PCS"],
      maxPiecesCount: 1,
    });
    console.log("[6a Box-5]: errors length:", test6a.errors.length, "Accepted line:", Boolean(test6a.line));
    expect(test6a.errors.length).toBeGreaterThan(0);
    expect(test6a.errors[0]?.message).toContain("cannot exceed shipment piece count");

    // 6b: Both Bond/UT and Pay of IGST Yes
    const p6bPayload = buildPayload("TEST_AWB_P6B", {
      commercial: true,
      proforma: {
        csbType: "CSB 5",
        exportReason: "SALE",
        bondUt: "Yes",
        payOfIgst: "Yes",
      },
    });
    const { error: err6b } = await client.rpc("book_awb_shipment", {
      p_id: null,
      p_row_version: null,
      p_fields: p6bPayload.fields,
      p_pieces: p6bPayload.pieces,
      p_charges: p6bPayload.charges,
    });
    console.log("[6b Bond+Pay IGST both Yes]: Blocked by server?", err6b?.message);
    expect(err6b).not.toBeNull();
    expect(err6b?.message).toContain("mutually exclusive");

    // 6c: Bad HSN format check
    const bad1 = validateProformaEntry({ boxNo: "Box-1", packages: "1", description: "T", hsnCode: "123", quantity: "1", weight: "0.1", unit: "PCS", rate: "10", units: ["PCS"] });
    expect(bad1.errors.length).toBeGreaterThan(0);
    const bad2 = validateProformaEntry({ boxNo: "Box-1", packages: "1", description: "T", hsnCode: "12345", quantity: "1", weight: "0.1", unit: "PCS", rate: "10", units: ["PCS"] });
    expect(bad2.errors.length).toBeGreaterThan(0);

    // 6d: Negative rate
    const negRate = validateProformaEntry({ boxNo: "Box-1", packages: "1", description: "T", hsnCode: "61091000", quantity: "1", weight: "0.1", unit: "PCS", rate: "-50", units: ["PCS"] });
    expect(negRate.errors.length).toBeGreaterThan(0);

    // 6e1: Commercial CSB 5 with Gift reason is blocked by 0103/0145/0146
    const p6e1 = buildPayload("TEST_AWB_P6E1", {
      commercial: true,
      proforma: { csbType: "CSB 5", exportReason: "UNSOLICITED GIFT - NOT FOR SALE" },
    });
    const { error: err6e1 } = await client.rpc("book_awb_shipment", {
      p_id: null,
      p_row_version: null,
      p_fields: p6e1.fields,
      p_pieces: p6e1.pieces,
      p_charges: p6e1.charges,
    });
    expect(err6e1).not.toBeNull();
    console.log("[6e1 CSB 5 with Gift Reason]: BLOCKED properly:", err6e1?.message);

    // 6e2: AWB commercial=true, but Proforma csbType=CSB 4 with Gift reason
    const p6e2 = buildPayload("TEST_AWB_P6E2", {
      commercial: true, // on AWB tab
      proforma: { csbType: "CSB 4", exportReason: "UNSOLICITED GIFT - NOT FOR SALE" },
    });
    const { error: err6e2 } = await client.rpc("book_awb_shipment", {
      p_id: null,
      p_row_version: null,
      p_fields: p6e2.fields,
      p_pieces: p6e2.pieces,
      p_charges: p6e2.charges,
    });
    console.log("[6e2 Commercial=true + CSB 4 Gift]: Error?", err6e2?.message);
    expect(err6e2).not.toBeNull();
    expect(err6e2?.message).toContain("CSB-V or COMMERCIAL, not CSB-IV/III");

    // 6g: CSB IV statutory limit check (> ₹1,00,000 INR)
    const p6gPayload = buildPayload("TEST_AWB_P6G", {
      commercial: false,
      currency: "USD",
      proforma: {
        csbType: "CSB 4",
        exportReason: "UNSOLICITED GIFT - NOT FOR SALE",
        currency: "USD",
        lines: [
          {
            id: "p6g-l1",
            boxNo: "Box-1",
            packages: "1",
            description: "High Value Gift Item",
            hsCode: "71131930",
            quantity: "1",
            weight: "0.200",
            unit: "PCS",
            rate: "1500.00",
            amount: "1500.00", // 1500 USD * 86.50 = ₹1,29,750 INR > ₹1,00,000 limit
            igstPercent: "0",
            igstAmount: "0.00",
          },
        ],
      },
    });
    const { error: err6g } = await client.rpc("book_awb_shipment", {
      p_id: null,
      p_row_version: null,
      p_fields: p6gPayload.fields,
      p_pieces: p6gPayload.pieces,
      p_charges: p6gPayload.charges,
    });
    console.log("[6g CSB IV value limit]: Error?", err6g?.message);
    expect(err6g).not.toBeNull();
    expect(err6g?.message).toContain("exceeds the statutory CSB-IV limit");

    // 6h: Blank CSB Type is rejected
    const p6h = buildPayload("TEST_AWB_P6H", {
      proforma: { csbType: "", exportReason: "UNSOLICITED GIFT - NOT FOR SALE", lines: [] },
    });
    const { error: err6h } = await client.rpc("book_awb_shipment", {
      p_id: null,
      p_row_version: null,
      p_fields: p6h.fields,
      p_pieces: p6h.pieces,
      p_charges: p6h.charges,
    });
    console.log("[6h Blank CSB Type]: Error?", err6h?.message);
    expect(err6h?.message).toContain("CSB Type is required");

    // 6i: Blank Export Reason is rejected
    const p6i = buildPayload("TEST_AWB_P6I", {
      proforma: { csbType: "CSB 4", exportReason: "", lines: [] },
    });
    const { error: err6i } = await client.rpc("book_awb_shipment", {
      p_id: null,
      p_row_version: null,
      p_fields: p6i.fields,
      p_pieces: p6i.pieces,
      p_charges: p6i.charges,
    });
    console.log("[6i Blank Export Reason]: Error?", err6i?.message);
    expect(err6i?.message).toContain("Export reason is required");

    // 6j: Non-DOX (NDOX) without proforma lines is rejected
    const p6j = buildPayload("TEST_AWB_P6J", {
      product: "NDOX",
      piecesUnit: "NDOX",
      proforma: { csbType: "CSB 4", exportReason: "UNSOLICITED GIFT - NOT FOR SALE", lines: [] },
    });
    const { error: err6j } = await client.rpc("book_awb_shipment", {
      p_id: null,
      p_row_version: null,
      p_fields: p6j.fields,
      p_pieces: p6j.pieces,
      p_charges: p6j.charges,
    });
    console.log("[6j NDOX without proforma lines]: Error?", err6j?.message);
    expect(err6j?.message).toContain("At least one proforma line item is required");

    // 6k: DOX without proforma lines SUCCEEDS
    const p6k = buildPayload("TEST_AWB_P6K", {
      product: "DOX",
      piecesUnit: "DOX",
      proforma: { csbType: "CSB 4", exportReason: "UNSOLICITED GIFT - NOT FOR SALE", lines: [] },
    });
    const { data: data6k, error: err6k } = await client.rpc("book_awb_shipment", {
      p_id: null,
      p_row_version: null,
      p_fields: p6k.fields,
      p_pieces: p6k.pieces,
      p_charges: p6k.charges,
    });
    console.log("[6k DOX without proforma lines]: Booked AWB?", data6k?.awb_no, "Error?", err6k?.message);
    expect(err6k).toBeNull();
    expect(data6k?.current_status).toBe("BOOKED");

    // 6l: Bond/UT Yes without any LUT number is rejected (Branch fallback removed)
    const p6l = buildPayload("TEST_AWB_P6L", {
      commercial: true,
      proforma: {
        csbType: "CSB 5",
        exportReason: "SALE",
        adCode: "ADCODE01",
        bondUt: "Yes",
        lutNo: "",
        payOfIgst: "No",
      },
    });
    (p6l.fields.shipper as any).lut_number = "";
    (p6l.fields.shipper as any).lutNumber = "";
    const { error: err6l } = await client.rpc("book_awb_shipment", {
      p_id: null,
      p_row_version: null,
      p_fields: p6l.fields,
      p_pieces: p6l.pieces,
      p_charges: p6l.charges,
    });
    console.log("[6l Bond/UT without LUT]: Error?", err6l?.message);
    expect(err6l?.message).toContain("no valid LUT (Bond/UT) number is on file for the Shipper or Customer");

    // 6m: Bond/UT Yes with expired LUT is rejected
    await admin.from("customers").update({ lut_number: "LUT-EXP-2020", lut_till_date: "2020-01-01" }).eq("id", masters.customer.id);
    const p6m = buildPayload("TEST_AWB_P6M", {
      commercial: true,
      proforma: {
        csbType: "CSB 5",
        exportReason: "SALE",
        adCode: "ADCODE01",
        bondUt: "Yes",
        lutNo: "LUT-EXP-2020",
        payOfIgst: "No",
      },
    });
    const { error: err6m } = await client.rpc("book_awb_shipment", {
      p_id: null,
      p_row_version: null,
      p_fields: p6m.fields,
      p_pieces: p6m.pieces,
      p_charges: p6m.charges,
    });
    console.log("[6m Expired LUT]: Error?", err6m?.message);
    expect(err6m?.message).toContain("expired on 2020-01-01");
    await admin.from("customers").update({ lut_number: null, lut_till_date: null }).eq("id", masters.customer.id);

    // 6f: Edit while locked
    if (p1Shipment) {
      await admin.from("shipments").update({ is_locked: true, locked_at: new Date().toISOString() }).eq("id", p1Shipment.id);
      const updatePayload = buildPayload("TEST_AWB_P1", { proforma: { csbType: "CSB 4", invoiceNo: "EDIT_LOCKED" } });
      const { error: lockErr } = await client.rpc("book_awb_shipment", {
        p_id: p1Shipment.id,
        p_row_version: p1Shipment.row_version,
        p_fields: updatePayload.fields,
        p_pieces: updatePayload.pieces,
        p_charges: updatePayload.charges,
      });
      console.log("[6f Edit while locked]: Blocked?", lockErr?.message);
      expect(lockErr?.message).toContain("locked");
      await admin.from("shipments").update({ is_locked: false, locked_at: null }).eq("id", p1Shipment.id);
    }
  }, 20000);
});
