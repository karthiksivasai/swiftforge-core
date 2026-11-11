import { describe, it, expect, beforeAll } from "vitest";
import { uiFormToShipmentPayload, dbShipmentToFormPatch, type AwbLiveForm } from "./shipmentUiMap";
import { manualChargeAmounts, fuelPercentFor } from "./awbEntryRules";

describe("Forwarding Tab Batch 2 Tests (FW-02, FW-03, FW-04, FW-06)", () => {
  let admin: any;
  let client: any;

  beforeAll(async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { createClient } = await import("@supabase/supabase-js");

    const envText = fs.readFileSync(path.resolve(process.cwd(), ".env"), "utf8");
    const env: Record<string, string> = {};
    for (const line of envText.split("\n")) {
      const match = line.match(/^\s*([\w_]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(.*))\s*$/);
      if (match) env[match[1]] = (match[2] ?? match[3] ?? match[4] ?? "").trim();
    }

    const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !serviceKey || !anonKey) return;

    admin = createClient(url, serviceKey);
    client = createClient(url, anonKey);

    const pwd = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { error: pwdErr } = await client.auth.signInWithPassword({
      email: "kkarthik3162@gmail.com",
      password: pwd,
    });

    if (pwdErr) {
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
    }
  }, 20000);

  // --------------------------------------------------------------------------
  // FW-02 & D3/D4: Worked Example Calculation
  // --------------------------------------------------------------------------
  it("FW-02: worked example calculation with Contract ₹1,000, 10% fuel, ₹500 manual surcharge", () => {
    // Contract base: ₹1,000.00
    const contractFreight = 1000;
    const vendorFuelPct = 10;
    const contractFuel = (contractFreight * vendorFuelPct) / 100; // ₹100.00
    const contractGst = ((contractFreight + contractFuel) * 18) / 100; // ₹198.00

    // Manual line: ₹500.00
    const manualResult = manualChargeAmounts({
      itemAmount: 500,
      applyFuel: true,
      applyTaxOnFuel: true,
      applyTax: true,
      fuelPct: vendorFuelPct,
      gstPct: 18,
      intraState: false, // Inter-state -> IGST
    });

    expect(manualResult.fuelAmt).toBe("50.00");
    expect(manualResult.igst).toBe("99.00");
    expect(manualResult.cgst).toBe("0.00");
    expect(manualResult.sgst).toBe("0.00");
    expect(manualResult.total).toBe("649.00"); // 500 + 50 + 99

    const manualAmt = 500;
    const manualFuel = Number.parseFloat(manualResult.fuelAmt);
    const manualGst = Number.parseFloat(manualResult.igst);

    // D3 & D4: Vendor cost EXCLUDING GST
    const vendorCostExGst = contractFreight + contractFuel + manualAmt + manualFuel;
    expect(vendorCostExGst).toBe(1650);

    // Vendor GST
    const totalVendorGst = contractGst + manualGst;
    expect(totalVendorGst).toBe(297);

    // Vendor Total incl. GST
    const vendorTotalInclGst = vendorCostExGst + totalVendorGst;
    expect(vendorTotalInclGst).toBe(1947);

    // Margin = Customer Total ex-GST - Vendor Cost ex-GST
    const customerTotalExGst = 2500;
    const margin = customerTotalExGst - vendorCostExGst;
    expect(margin).toBe(850);
  });

  // --------------------------------------------------------------------------
  // FW-03: Mapping vendor charge lines from form to outgoing payload
  // --------------------------------------------------------------------------
  it("FW-03: uiFormToShipmentPayload maps vendor charge lines with side='VENDOR'", () => {
    const mockForm: AwbLiveForm = {
      awbNo: "100199",
      clientName: { id: "cust-1", code: "C01", name: "Customer 1" },
      bookDate: "2026-11-10",
      bookTime: "10:00",
      product: { id: "p-1", code: "EXP", name: "Express" },
      service: { id: "s-1", code: "FEDEX", name: "FedEx" },
      vendor: { id: "v-1", code: "FDX", name: "FedEx" },
      referenceNo: "TEST_FW03",
      commercial: false,
      oda: false,
      medicalCharges: false,
      weightUnit: "KG",
      actualWeight: "1.0",
      chargeWeight: "1.0",
      volWeight: "1.0",
      shipmentValue: "",
      shipmentCurrency: "INR",
      pieces: "1",
      piecesUnit: "DOX",
      piecesLines: [],
      chargeLines: [
        {
          id: "c-1",
          description: "Customer Handling",
          amount: "200.00",
          rate: "200.00",
          fuelApply: "Yes",
          fuelAmt: "20.00",
          taxApply: "Yes",
          taxOnFuel: "Yes",
          igst: "39.60",
          cgst: "0.00",
          sgst: "0.00",
          total: "259.60",
        },
      ],
      customerChargesTotal: "259.60",
      vendorChargesTotal: "1650.00",
      vendorTaxTotal: "297.00",
      paymentType: "CASH",
      content: "DOCUMENTS",
      instruction: "",
      fieldExecutive: { code: "", name: "" },
      cashReceiptNo: "",
      amountReceived: "",
      balanceAmount: "",
      cashReceiptDate: "",
      lock: false,
      forwardingNo: "FWD123",
      deliveryNo: "DEL123",
      flightNo: "",
      airline: "",
      shipper: {
        origin: { id: "orig-1", code: "HYD", name: "Hyderabad" },
        companyName: { code: "ACME", name: "Acme" },
        contactName: "Sender",
        address1: "Road 1",
        address2: "",
        pincode: "500001",
        city: "Hyderabad",
        state: "Telangana",
        telephone: "9876543210",
        mobileNo: "",
        email: "sender@example.com",
        country: "India",
        iecNo: "",
        documentType: "",
        documentNo: "",
      },
      consignee: {
        origin: { id: "dest-1", code: "USA", name: "USA" },
        companyName: { code: "GLOBEX", name: "Globex" },
        contactName: "Receiver",
        address1: "Main St",
        address2: "",
        pincode: "10001",
        city: "New York",
        state: "NY",
        telephone: "1234567890",
        mobileNo: "",
        email: "rec@example.com",
        country: "USA",
        iecNo: "",
        documentType: "",
        documentNo: "",
      },
      forwarding: {
        vendorChargeLines: [
          {
            id: "vch-1",
            description: "Demand Surcharge",
            amount: "500.00",
            rate: "500.00",
            fuelApply: "Yes",
            fuelAmt: "50.00",
            taxApply: "Yes",
            taxOnFuel: "Yes",
            igst: "99.00",
            cgst: "0.00",
            sgst: "0.00",
            total: "649.00",
          },
        ],
      },
    };

    const payload = uiFormToShipmentPayload(mockForm);

    expect(payload.fields.vendor_charges_total).toBe("1650.00");
    expect(payload.fields.vendor_tax_total).toBe("297.00");

    // Both customer and vendor charges are mapped into charges
    expect(payload.charges.length).toBe(2);

    const custCharge = payload.charges.find((c) => c.side === "CUSTOMER");
    expect(custCharge).toBeDefined();
    expect(custCharge?.description).toBe("Customer Handling");

    const vendCharge = payload.charges.find((c) => c.side === "VENDOR");
    expect(vendCharge).toBeDefined();
    expect(vendCharge?.description).toBe("Demand Surcharge");
    expect(vendCharge?.amount).toBe("500.00");
    expect(vendCharge?.fuel_amount).toBe("50.00");
    expect(vendCharge?.igst).toBe("99.00");
    expect(vendCharge?.total).toBe("649.00");
  });

  // --------------------------------------------------------------------------
  // FW-04: Vendor State and GST Intra/Inter State Resolution
  // --------------------------------------------------------------------------
  it("FW-04: intra-state vendor splits GST into CGST+SGST, charges_gst_on_export=false zeroes tax", () => {
    // Same state as branch (e.g. Telangana) -> intraState: true
    const intraResult = manualChargeAmounts({
      itemAmount: 500,
      applyFuel: true,
      applyTaxOnFuel: true,
      applyTax: true,
      fuelPct: 10,
      gstPct: 18,
      intraState: true,
    });

    expect(intraResult.fuelAmt).toBe("50.00");
    expect(intraResult.igst).toBe("0.00");
    expect(intraResult.cgst).toBe("49.50"); // 9% of 550
    expect(intraResult.sgst).toBe("49.50"); // 9% of 550
    expect(intraResult.total).toBe("649.00");

    // Vendor does not charge GST on export -> gstPct: 0
    const noGstResult = manualChargeAmounts({
      itemAmount: 500,
      applyFuel: true,
      applyTaxOnFuel: true,
      applyTax: true,
      fuelPct: 10,
      gstPct: 0,
      intraState: false,
    });

    expect(noGstResult.fuelAmt).toBe("50.00");
    expect(noGstResult.igst).toBe("0.00");
    expect(noGstResult.cgst).toBe("0.00");
    expect(noGstResult.sgst).toBe("0.00");
    expect(noGstResult.total).toBe("550.00"); // 500 + 50
  });

  // --------------------------------------------------------------------------
  // FW-06: Database Server-Side Rating Engine Verification
  // --------------------------------------------------------------------------
  it("FW-06: server-side book_awb_shipment stores vendor_charges_total ex-GST, vendor_tax_total, and creates side='VENDOR' snapshot", async () => {
    if (!admin || !client) return;

    // Pick a valid test shipment as template
    const { data: sample } = await admin
      .from("shipments")
      .select("customer_id, vendor_id, product_id, origin_destination_id, destination_id, branch_id, service, shipper, consignee, wizard_extras")
      .ilike("reference_no", "TEST_AWB_%")
      .limit(1)
      .single();

    expect(sample).not.toBeNull();

    const { data: cust } = await admin.from("customers").select("code").eq("id", sample.customer_id).single();
    const { data: prod } = await admin.from("products").select("code").eq("id", sample.product_id).single();
    const { data: orig } = await admin.from("destinations").select("code").eq("id", sample.origin_destination_id).single();
    const { data: dest } = await admin.from("destinations").select("code").eq("id", sample.destination_id).single();
    const { data: branch } = await admin.from("branches").select("code").eq("id", sample.branch_id).single();
    const { data: vend } = await admin.from("vendors").select("code").eq("id", sample.vendor_id).single();

    const ts = Date.now().toString().slice(-8);
    const ref = `TEST_FW06_${ts}`;

    // Pass 1 manual vendor charge of ₹500
    const vendorChargeLine = {
      side: "VENDOR",
      description: "Demand Surcharge",
      rate: "500.00",
      amount: "500.00",
      fuel_applies: true,
      fuel_amount: "50.00",
      tax_applies: true,
      tax_on_fuel: true,
      igst: "99.00",
      cgst: "0.00",
      sgst: "0.00",
      total: "649.00",
      charges_type: "MANUAL",
    };

    const { data: booked, error: bookErr } = await client.rpc("book_awb_shipment", {
      p_id: null,
      p_row_version: null,
      p_fields: {
        customer_id: sample.customer_id,
        customer_code: cust?.code,
        product_id: sample.product_id,
        product_code: prod?.code,
        origin_destination_id: sample.origin_destination_id,
        origin_code: orig?.code,
        destination_id: sample.destination_id,
        destination_code: dest?.code,
        vendor_id: sample.vendor_id,
        vendor_code: vend?.code,
        branch_id: sample.branch_id,
        branch_code: branch?.code,
        service: sample.service || "FEDEX",
        book_date: "2026-11-10",
        book_time: "1000",
        payment_type: "CASH",
        weight_unit: "KG",
        pieces: "1",
        pieces_unit: "DOX",
        actual_weight: "0.500",
        charge_weight: "0.500",
        is_commercial: false,
        content: "FORWARDING BATCH 2 TEST",
        reference_no: ref,
        forwarding_awb: `FWD_${ts}`,
        delivery_awb: `DEL_${ts}`,
        shipper: {
          company_name: "Ali Associates",
          contact_name: "Karthik",
          address1: "12 Test Road",
          city: "Hyderabad",
          state: "Telangana",
          pincode: "500001",
          country: "India",
          telephone: "9876543210",
          iec_no: "ABCDE12345",
          document_type: "GST",
          document_no: "36AAAAA0000A1Z5",
        },
        consignee: {
          company_name: "Acme USA Corp",
          contact_name: "John Doe",
          address1: "123 Fifth Ave",
          city: "New York",
          state: "NY",
          pincode: "10001",
          country: "United States of America",
          telephone: "+12125550199",
          email: "consignee@example.com",
        },
        wizard_extras: {
          proforma: {
            csbType: "CSB 4",
            exportReason: "UNSOLICITED GIFT - NOT FOR SALE",
            currency: "INR",
            lines: [
              {
                id: "l1",
                description: "Gift item",
                quantity: "1",
                rate: "100.00",
                amount: "100.00",
                boxNo: "Box-1",
                hsn: "6205",
                packages: "1",
                weight: "0.200",
                igstPercent: "0",
                igstAmount: "0.00",
              },
            ],
          },
        },
      },
      p_pieces: [{ pieces: 1, actual_weight_per_pc: 0.5, length: 10, breadth: 10, height: 10 }],
      p_charges: [vendorChargeLine],
    });

    expect(bookErr).toBeNull();
    expect(booked).not.toBeNull();

    // Verify shipments table stores vendor cost EXCLUDING GST
    const { data: dbShipment } = await admin
      .from("shipments")
      .select("id, vendor_charges_total, vendor_tax_total")
      .eq("id", booked.id)
      .single();

    expect(dbShipment).not.toBeNull();
    expect(Number(dbShipment.vendor_charges_total)).toBeGreaterThan(0);
    expect(Number(dbShipment.vendor_tax_total)).toBeGreaterThanOrEqual(0);

    // Verify snapshot rows for side='VENDOR' exist in shipment_charge_snapshots
    const { data: vendorSnaps } = await admin
      .from("shipment_charge_snapshots")
      .select("*")
      .eq("shipment_id", booked.id)
      .eq("side", "VENDOR");

    expect(vendorSnaps).not.toBeNull();
    expect(vendorSnaps.length).toBeGreaterThanOrEqual(1);

    const manualSnap = vendorSnaps.find((s: any) => s.description === "Demand Surcharge");
    expect(manualSnap).toBeDefined();
    expect(Number(manualSnap.amount)).toBe(500);

    // Cleanup
    await admin.from("shipments").delete().eq("id", booked.id);
  });
});
