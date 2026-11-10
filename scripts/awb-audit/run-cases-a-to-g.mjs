import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb, resolveMasters } from "./test-data.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../.env");
const text = fs.readFileSync(envPath, "utf8");
const env = {};
for (const line of text.split("\n")) {
  const match = line.match(/^\s*([\w_]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(.*))\s*$/);
  if (match) env[match[1]] = (match[2] ?? match[3] ?? match[4] ?? "").trim();
}

const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;

const admin = createClient(url, serviceKey);
const client = createClient(url, anonKey);

async function run() {
  console.log("Authenticating test runner as kkarthik3162@gmail.com...");
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: "kkarthik3162@gmail.com",
  });
  if (linkErr) throw linkErr;

  const { error: sessErr } = await client.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });
  if (sessErr) throw sessErr;

  const masters = await resolveMasters(admin);
  const doxProduct = masters.products.find((p) => p.code === "DOX");
  const ndoxProduct = masters.products.find((p) => p.code === "NDOX");
  const comProduct = masters.products.find((p) => p.code === "COM");
  const usLane = masters.lanes.find((l) => l.destinationCode === "US");
  const aeLane = masters.lanes.find((l) => l.destinationCode === "AE");
  const hoBranch = { id: "b69b8007-dd55-4808-a8b1-afb91a9a46a4", code: "HO" };

  const cases = [
    {
      caseId: "A3",
      ref: "TEST_AWB_A3",
      product: doxProduct,
      destination: usLane.destination,
      lane: usLane,
      customer: masters.customer,
      isCommercial: false,
      piecesUnit: "DOX",
      actualWeight: "0.500",
      paymentType: "Cash",
      received: "324.50",
      pieces: [
        { actual_weight_per_pc: "0.500", pieces: 1, length: "0", breadth: "0", height: "0", measurement_unit: "CM" },
      ],
      proforma: { csbType: "CSB 4", exportReason: "UNSOLICITED GIFT - NOT FOR SALE", lines: [] },
    },
    {
      caseId: "B3",
      ref: "TEST_AWB_B3",
      product: ndoxProduct,
      destination: aeLane.destination,
      lane: aeLane,
      customer: masters.customer,
      isCommercial: false,
      piecesUnit: "NDOX",
      actualWeight: "6.500",
      paymentType: "Cash",
      received: "5905.90",
      pieces: [
        { actual_weight_per_pc: "6.500", pieces: 1, length: "0", breadth: "0", height: "0", measurement_unit: "CM" },
      ],
      proforma: {
        csbType: "CSB 4",
        exportReason: "UNSOLICITED GIFT - NOT FOR SALE",
        lines: [
          { boxNo: "Box-1", packages: "1", description: "Personal Sample Items", hsCode: "61091000", quantity: "1", weight: "6.500", unit: "PCS", rate: "1500.00", amount: "1500.00", igstPercent: "0", igstAmount: "0.00" },
        ],
      },
    },
    {
      caseId: "C3",
      ref: "TEST_AWB_C3",
      product: ndoxProduct,
      destination: usLane.destination,
      lane: usLane,
      customer: masters.customer,
      isCommercial: false,
      piecesUnit: "NDOX",
      actualWeight: "2.000",
      paymentType: "Cash",
      received: "3894.00",
      pieces: [
        { actual_weight_per_pc: "2.000", pieces: 1, length: "12", breadth: "12", height: "12", measurement_unit: "INCH" },
      ],
      proforma: {
        csbType: "CSB 4",
        exportReason: "UNSOLICITED GIFT - NOT FOR SALE",
        lines: [
          { boxNo: "Box-1", packages: "1", description: "Personal Sample Box", hsCode: "61091000", quantity: "1", weight: "2.000", unit: "PCS", rate: "1200.00", amount: "1200.00", igstPercent: "0", igstAmount: "0.00" },
        ],
      },
    },
    {
      caseId: "D3",
      ref: "TEST_AWB_D3",
      product: comProduct,
      destination: usLane.destination,
      lane: usLane,
      customer: masters.customer,
      isCommercial: true,
      piecesUnit: "NDOX",
      actualWeight: "1.000",
      paymentType: "Cash",
      received: "649.00",
      shipperIec: "ABCDE12345",
      proforma: {
        csbType: "CSB 5",
        exportReason: "SALE",
        adCode: "ADCODE01",
        bondUt: "Yes",
        lutNo: "LUT-HYD-2026-001",
        lines: [
          { boxNo: "Box-1", packages: "1", description: "Cotton Knitted Shirts", hsCode: "61091000", quantity: "2", weight: "1.000", unit: "PCS", rate: "400.00", amount: "800.00", igstPercent: "0", igstAmount: "0.00" },
        ],
      },
      pieces: [
        { actual_weight_per_pc: "1.000", pieces: 1, length: "0", breadth: "0", height: "0", measurement_unit: "CM" },
      ],
    },
    {
      caseId: "E3",
      ref: "TEST_AWB_E3",
      product: doxProduct,
      destination: usLane.destination,
      lane: usLane,
      customer: masters.customer,
      isCommercial: false,
      piecesUnit: "DOX",
      actualWeight: "0.500",
      paymentType: "Credit",
      received: "100.00",
      pieces: [
        { actual_weight_per_pc: "0.500", pieces: 1, length: "0", breadth: "0", height: "0", measurement_unit: "CM" },
      ],
      proforma: { csbType: "CSB 4", exportReason: "UNSOLICITED GIFT - NOT FOR SALE", lines: [] },
    },
    {
      caseId: "F3",
      ref: "TEST_AWB_F3",
      product: doxProduct,
      destination: usLane.destination,
      lane: usLane,
      customer: masters.customer,
      isCommercial: false,
      piecesUnit: "DOX",
      actualWeight: "0.500",
      paymentType: "Cash",
      received: "324.50",
      pieces: [
        { actual_weight_per_pc: "0.500", pieces: 1, length: "0", breadth: "0", height: "0", measurement_unit: "CM" },
      ],
      proforma: { csbType: "CSB 4", exportReason: "UNSOLICITED GIFT - NOT FOR SALE", lines: [] },
    },
    {
      caseId: "G3",
      ref: "TEST_AWB_G3",
      product: doxProduct,
      destination: usLane.destination,
      lane: usLane,
      customer: masters.osmo,
      isCommercial: false,
      piecesUnit: "DOX",
      actualWeight: "0.500",
      paymentType: "Cash",
      received: "324.50",
      pieces: [
        { actual_weight_per_pc: "0.500", pieces: 1, length: "0", breadth: "0", height: "0", measurement_unit: "CM" },
      ],
      proforma: { csbType: "CSB 4", exportReason: "UNSOLICITED GIFT - NOT FOR SALE", lines: [] },
    },
  ];

  console.log("\nBooking Cases A3 through G3...");
  const results = [];

  for (const c of cases) {
    const fields = {
      customer_id: c.customer.id,
      customer_code: c.customer.code,
      product_id: c.product.id,
      product_code: c.product.code,
      origin_destination_id: masters.origin.id,
      origin_code: masters.origin.code,
      destination_id: c.destination.id,
      destination_code: c.destination.code,
      vendor_id: masters.fedex.id,
      vendor_code: masters.fedex.code,
      branch_id: hoBranch.id,
      branch_code: hoBranch.code,
      book_date: "2026-11-10",
      book_time: "1200",
      reference_no: c.ref,
      service: "FEDEX",
      payment_type: c.paymentType,
      pieces: String(c.pieces.length),
      pieces_unit: c.piecesUnit,
      actual_weight: c.actualWeight,
      weight_unit: "KG",
      is_commercial: c.isCommercial,
      cash_receipt_no: c.paymentType === "Cash" ? "CR-" + c.ref : null,
      amount_received: c.received,
      cash_receipt_date: "2026-11-10",
      shipper: {
        company_name: c.customer.name,
        contact_name: "Karthik",
        address1: "12 Test Road",
        address2: "",
        city: "Hyderabad",
        state: "Telangana",
        pincode: "500001",
        country: "India",
        telephone: "7306647761",
        mobile: "7306647761",
        email: "kkarthik3162@gmail.com",
        iec_no: c.shipperIec || "",
      },
      consignee: {
        company_name: "Acme " + c.destination.code,
        contact_name: "John Doe",
        address1: "100 Global Ave",
        address2: "",
        city: c.destination.code === "US" ? "New York" : "Dubai",
        state: "",
        pincode: c.destination.code === "US" ? "10001" : "00000",
        country: c.destination.code === "US" ? "United States of America" : "United Arab Emirates",
        telephone: "2125550100",
        mobile: "2125550100",
        email: "consignee@example.com",
      },
      wizard_extras: {
        proforma: c.proforma,
      },
    };

    const { data, error } = await client.rpc("book_awb_shipment", {
      p_id: null,
      p_row_version: null,
      p_fields: fields,
      p_pieces: c.pieces,
      p_charges: [],
    });

    if (error) {
      console.error(`FAILED Case ${c.caseId} (${c.ref}):`, error.message);
      throw error;
    }

    const { data: charges } = await admin
      .from("shipment_charge_snapshots")
      .select("*")
      .eq("shipment_id", data.id)
      .eq("side", "CUSTOMER");

    const { data: dbShipment } = await admin
      .from("shipments")
      .select("awb_no, reference_no, actual_weight, charge_weight, grand_total, amount_received, balance_amount, wizard_extras")
      .eq("id", data.id)
      .single();

    const freight = charges?.find((ch) => /freight/i.test(ch.description))?.amount || 0;
    const fuel = charges?.reduce((s, ch) => s + Number(ch.fuel_amount || 0), 0) || 0;
    const igst = charges?.reduce((s, ch) => s + Number(ch.igst || 0), 0) || 0;
    const cgst = charges?.reduce((s, ch) => s + Number(ch.cgst || 0), 0) || 0;
    const sgst = charges?.reduce((s, ch) => s + Number(ch.sgst || 0), 0) || 0;

    results.push({
      awb: data.awb_no,
      ref: c.ref,
      what: `${c.product.code}, ${c.destination.code}, ${c.paymentType}${c.isCommercial ? ", Comm" : ""}`,
      weight: Number(dbShipment.charge_weight).toFixed(3),
      freight: Number(freight).toFixed(2),
      fuel: Number(fuel).toFixed(2),
      igst: Number(igst).toFixed(2),
      cgst: Number(cgst).toFixed(2),
      sgst: Number(sgst).toFixed(2),
      total: Number(dbShipment.grand_total).toFixed(2),
      received: Number(dbShipment.amount_received || 0).toFixed(2),
      balance: Number(dbShipment.balance_amount || 0).toFixed(2),
      exchangeRateStored: dbShipment.wizard_extras?.proforma?.exchangeRate,
      exchangeRateDateStored: dbShipment.wizard_extras?.proforma?.exchangeRateDate,
    });
  }

  console.log("\n=================== CASES A3 - G3 BOOKING RESULTS ===================");
  console.table(results);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
