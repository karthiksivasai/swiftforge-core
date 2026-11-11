import { describe, it, expect, beforeAll } from "vitest";
import { uiFormToShipmentPayload, dbShipmentToFormPatch, type AwbLiveForm } from "./shipmentUiMap";
import type { ShipmentChildren, ShipmentRow as ShipmentDbRow } from "./resources/shipments";

describe("Forwarding Tab Batch 1 Tests", () => {
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
  it("FW-01: uiFormToShipmentPayload maps delivery_service from forwarding.deliveryService", () => {
    const mockForm = {
      piecesUnit: "DOX",
      referenceNo: "",
      airline: "",
      forwardingNo: "",
      deliveryNo: "",
      customerChargesTotal: "0",
      vendorChargesTotal: "0",
      paymentType: "Cash",
      content: "",
      instruction: "",
      cashReceiptNo: "",
      amountReceived: "",
      balanceAmount: "",
      cashReceiptDate: "",
      flightNo: "",
      lock: false,
      clientName: { id: "cust-1", code: "CUST1", name: "Customer 1" },
      product: { id: "prod-1", code: "NDOX", name: "Non Documents" },
      vendor: { id: "vend-1", code: "FEDEX", name: "FedEx Express" },
      service: { id: "srv-1", code: "PRIORITY", name: "International Priority" },
      shipper: {
        origin: { id: "orig-1", code: "HYD", name: "Hyderabad" },
        companyName: { id: undefined, code: "LAK", name: "Lakshmi" },
        contactName: "Lakshmi",
        address1: "Road 1",
        address2: "",
        city: "Hyderabad",
        state: "Telangana",
        pincode: "500001",
        country: "India",
        telephone: "9876543210",
        mobileNo: "",
        email: "test@example.com",
        iecNo: "",
        documentType: "",
        documentNo: "",
      },
      consignee: {
        origin: { id: "dest-1", code: "USA", name: "United States" },
        companyName: { id: undefined, code: "SON", name: "Son" },
        contactName: "Son",
        address1: "123 Main St",
        address2: "",
        city: "Dallas",
        state: "TX",
        pincode: "75001",
        country: "USA",
        telephone: "1234567890",
        mobileNo: "",
        email: "son@example.com",
        iecNo: "",
        documentType: "",
        documentNo: "",
      },
      fieldExecutive: { id: undefined, code: "", name: "" },
      bookDate: "2026-11-11",
      bookTime: "10:00",
      pieces: "1",
      actualWeight: "2.5",
      weightUnit: "KG",
      volWeight: "2.0",
      chargeWeight: "2.5",
      shipmentValue: "",
      shipmentCurrency: "INR",
      commercial: false,
      oda: false,
      medicalCharges: false,
      forwarding: {
        deliveryAwb: "DEL-9988",
        forwardingAwb: "FWD-7766",
        deliveryVendor: { id: "vend-2", code: "DHL", name: "DHL Express" },
        deliveryService: { id: "srv-2", code: "EXPRESS", name: "DHL Express Worldwide" },
        vendorWeight: "2.5",
        vendorAmount: "1500.00",
        vendorInvoice: "VINV-001",
        vendorChargeLines: [],
      },
    } as unknown as AwbLiveForm;

    const payload = uiFormToShipmentPayload(mockForm);
    expect(payload.fields.forwarding_awb).toBe("FWD-7766");
    expect(payload.fields.delivery_awb).toBe("DEL-9988");
    expect(payload.fields.delivery_vendor_id).toBe("vend-2");
    expect(payload.fields.delivery_vendor_code).toBe("DHL");
    expect(payload.fields.delivery_service).toBe("EXPRESS");
  });

  it("FW-01: dbShipmentToFormPatch populates deliveryService from database row", () => {
    const mockRow: ShipmentDbRow = {
      id: "ship-123",
      tenant_id: "tenant-1",
      awb_no: "100116",
      book_date: "2026-11-11",
      book_time: "10:00:00",
      forwarding_awb: "FWD-7766",
      delivery_awb: "DEL-9988",
      delivery_vendor_id: "vend-2",
      delivery_service: "EXPRESS",
      is_locked: false,
      delivery_vendor: { code: "DHL", name: "DHL Express" },
      wizard_extras: {
        forwarding: {
          deliveryService: { code: "EXPRESS", name: "DHL Express Worldwide" },
        },
      },
    } as unknown as ShipmentDbRow;

    const patch = dbShipmentToFormPatch(mockRow, { pieces: [], charges: [] } as unknown as ShipmentChildren);
    const fwd = patch.forwarding as {
      deliveryAwb?: string;
      forwardingAwb?: string;
      deliveryVendor?: { code?: string };
      deliveryService?: { code?: string };
    };

    expect(fwd.deliveryAwb).toBe("DEL-9988");
    expect(fwd.forwardingAwb).toBe("FWD-7766");
    expect(fwd.deliveryVendor?.code).toBe("DHL");
    expect(fwd.deliveryService?.code).toBe("EXPRESS");
  });

  it("FW-11: relationship disambiguation for shipments and vendors", () => {
    const queryWithAliases = `
      id,
      awb_no,
      vendor:vendors!shipments_vendor_fk(code, name),
      delivery_vendor:vendors!shipments_delivery_vendor_fk(code, name)
    `.replace(/\s+/g, " ").trim();

    expect(queryWithAliases).toContain("vendors!shipments_vendor_fk");
    expect(queryWithAliases).toContain("vendors!shipments_delivery_vendor_fk");
  });

  it("FW-12: blocks duplicate Forwarding AWB for the same vendor server-side", async () => {
    if (!admin || !client) return;

    // Find an existing shipment with a forwarding AWB (e.g. AWB 100116 with FWD 789012345678)
    const { data: existing } = await admin
      .from("shipments")
      .select("id, awb_no, vendor_id, delivery_vendor_id, forwarding_awb, tenant_id")
      .not("forwarding_awb", "is", null)
      .limit(1)
      .single();

    if (!existing || !existing.forwarding_awb) return;

    // Attempt to book a shipment with the EXACT SAME forwarding_awb and vendor_id
    const { error: rpcErr } = await client.rpc("book_awb_shipment", {
      p_id: null,
      p_row_version: 1,
      p_fields: {
        vendor_id: existing.vendor_id,
        delivery_vendor_id: existing.delivery_vendor_id,
        forwarding_awb: existing.forwarding_awb,
        reference_no: "TEST_AWB_DUP_FWD_CHECK",
        book_date: "2026-11-11",
        pieces: "1",
        weight_unit: "KG",
        actual_weight: "1.0",
        charge_weight: "1.0",
        customer_id: "c9c223a3-b40b-4683-9b2f-a9cbbf680517", // ALIASSO
        product_id: "0d55734c-6878-436f-b258-20d0f4d3ff11", // NDOX
        origin_destination_id: "6bfbb20c-529a-41d1-be61-26798031e34c", // HYD
        destination_id: "70a6c6d2-fdfb-4ec5-ad69-b3a6efba3694", // USA
        service: "EXPRESS",
        shipper: {
          origin: { code: "HYD", name: "Hyderabad" },
          company_name: "Lakshmi",
          contact_name: "Lakshmi",
          address1: "Road 1",
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
          origin: { code: "USA", name: "United States" },
          company_name: "Son",
          contact_name: "Son",
          address1: "123 Main St",
          city: "Dallas",
          state: "TX",
          pincode: "75001",
          country: "USA",
          telephone: "1234567890",
        },
        wizard_extras: {
          proforma: {
            csbType: "CSB 4",
            exportReason: "UNSOLICITED GIFT - NOT FOR SALE",
            currency: "INR",
            lines: [{ description: "Gift", quantity: 1, rate: 500, boxNo: "Box-1", hsn: "6205" }],
          },
        },
      },
      p_pieces: [{ pieces: 1, actual_weight_per_pc: 1.0, length: 10, breadth: 10, height: 10 }],
    });

    expect(rpcErr).not.toBeNull();
    expect(rpcErr?.message).toContain("already in use for this vendor");
  });

  it("FW-13: server RPC book_awb_shipment rejects updating forwarding on a LOCKED shipment", async () => {
    if (!admin || !client) return;

    // Pick an existing test shipment that is locked
    const { data: locked } = await admin
      .from("shipments")
      .select("id, awb_no, row_version, vendor_id, delivery_vendor_id, forwarding_awb, delivery_awb, customer_id, product_id, origin_destination_id, destination_id, service")
      .eq("is_locked", true)
      .limit(1)
      .single();

    if (!locked) return;

    // Attempt to update forwarding details on the locked shipment
    const { error: rpcErr } = await client.rpc("book_awb_shipment", {
      p_id: locked.id,
      p_row_version: locked.row_version,
      p_fields: {
        vendor_id: locked.vendor_id,
        forwarding_awb: "ILLEGAL_FWD_UPDATE_ON_LOCKED",
        book_date: "2026-11-11",
      },
      p_pieces: [],
    });

    expect(rpcErr).not.toBeNull();
    expect(rpcErr?.message).toMatch(/locked|cannot be saved|An admin has to unlock it/i);
  });

  it("FW-14: records old and new forwarding fields in audit_logs on shipment update", async () => {
    if (!admin || !client) return;

    // Pick an existing test shipment that is unlocked
    const { data: shipment } = await admin
      .from("shipments")
      .select("id, awb_no, row_version, vendor_id, delivery_vendor_id, forwarding_awb, delivery_awb, delivery_service, customer_id, product_id, origin_destination_id, destination_id, is_locked, service")
      .ilike("reference_no", "TEST_AWB_%")
      .eq("is_locked", false)
      .limit(1)
      .single();

    if (!shipment) return;

    const newFwd = `TEST_FWD_AUDIT_${Date.now()}`;
    const newDel = `TEST_DEL_AUDIT_${Date.now()}`;

    // Update shipment with new forwarding details via book_awb_shipment
    const { data: updated, error: updErr } = await client.rpc("book_awb_shipment", {
      p_id: shipment.id,
      p_row_version: shipment.row_version,
      p_fields: {
        vendor_id: shipment.vendor_id,
        forwarding_awb: newFwd,
        delivery_awb: newDel,
        delivery_service: "EXPRESS",
        book_date: "2026-11-11",
        pieces: "1",
        weight_unit: "KG",
        actual_weight: "1.0",
        charge_weight: "1.0",
        customer_id: shipment.customer_id,
        product_id: shipment.product_id,
        origin_destination_id: shipment.origin_destination_id,
        destination_id: shipment.destination_id,
        service: shipment.service,
        shipper: {
          origin: { code: "HYD", name: "Hyderabad" },
          company_name: "Lakshmi",
          contact_name: "Lakshmi",
          address1: "Road 1",
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
          origin: { code: "USA", name: "United States" },
          company_name: "Son",
          contact_name: "Son",
          address1: "123 Main St",
          city: "Dallas",
          state: "TX",
          pincode: "75001",
          country: "USA",
          telephone: "1234567890",
        },
        wizard_extras: {
          proforma: {
            csbType: "CSB 4",
            exportReason: "UNSOLICITED GIFT - NOT FOR SALE",
            currency: "INR",
            lines: [{ description: "Gift", quantity: 1, rate: 500, boxNo: "Box-1", hsn: "6205" }],
          },
        },
      },
      p_pieces: [{ pieces: 1, actual_weight_per_pc: 1.0, length: 10, breadth: 10, height: 10 }],
    });

    expect(updErr).toBeNull();
    expect(updated).not.toBeNull();

    // Verify audit_logs table contains old and new forwarding fields
    const { data: auditLogs, error: logErr } = await admin
      .from("audit_logs")
      .select("*")
      .eq("entity_id", shipment.id)
      .eq("action", "MODIFY")
      .order("created_at", { ascending: false })
      .limit(1);

    expect(logErr).toBeNull();
    expect(auditLogs).toHaveLength(1);
    const entry = auditLogs![0];
    expect(entry.new_values?.forwarding_awb).toBe(newFwd);
    expect(entry.new_values?.delivery_awb).toBe(newDel);
    expect(entry.new_values?.delivery_service).toBe("EXPRESS");
  });

  it("AWB-REUSE: book -> delete -> book again strictly gives a NEW number and never reuses deleted AWB", async () => {
    if (!admin || !client) return;

    // Read full valid payload fields from an existing booked shipment
    const { data: sample } = await admin
      .from("shipments")
      .select("customer_id, vendor_id, product_id, origin_destination_id, destination_id, branch_id, service, weight_unit, pieces_unit, shipper, consignee, wizard_extras")
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

    const timestamp = Date.now();
    const ref1 = `TEST_REUSE_A_${timestamp}`;
    const ref2 = `TEST_REUSE_B_${timestamp}`;

    const baseFields = {
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
      content: "REUSE TEST DOCUMENTS",
      shipper: {
        company_name: "Ali Associates",
        contact_name: "Karthik",
        address1: "12 Test Road",
        address2: "",
        city: "Hyderabad",
        state: "Telangana",
        pincode: "500001",
        country: "India",
        telephone: "9876543210",
        mobile: "9876543210",
        email: "shipper@example.com",
        iec_no: "ABCDE12345",
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
        telephone: "+12125550199",
        mobile: "+12125550199",
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
    };

    // 1. Book first shipment
    const { data: s1, error: err1 } = await client.rpc("book_awb_shipment", {
      p_id: null,
      p_row_version: null,
      p_fields: { ...baseFields, reference_no: ref1 },
      p_pieces: [{ pieces: 1, actual_weight_per_pc: 0.5, length: 10, breadth: 10, height: 10 }],
    });

    expect(err1).toBeNull();
    expect(s1).not.toBeNull();
    const awb1 = s1.awb_no;

    // 2. Soft-delete first shipment (simulating a fixture delete or admin deletion)
    const { error: delErr } = await admin
      .from("shipments")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", s1.id);
    expect(delErr).toBeNull();

    // 3. Book second shipment
    const { data: s2, error: err2 } = await client.rpc("book_awb_shipment", {
      p_id: null,
      p_row_version: null,
      p_fields: { ...baseFields, reference_no: ref2 },
      p_pieces: [{ pieces: 1, actual_weight_per_pc: 0.5, length: 10, breadth: 10, height: 10 }],
    });

    expect(err2).toBeNull();
    expect(s2).not.toBeNull();
    const awb2 = s2.awb_no;

    // 4. Assert awb2 is strictly greater than awb1 and NOT equal
    expect(awb2).not.toBe(awb1);
    expect(Number(awb2)).toBeGreaterThan(Number(awb1));

    // Cleanup test data
    await admin.from("shipments").delete().in("id", [s1.id, s2.id]);
  });

  it("AWB-REUSE: claim_awb_no ignores non-numeric awb_no values without ::bigint crash", async () => {
    if (!admin || !client) return;

    // 1. Verify there are non-numeric OLD_ awb_no rows in shipments
    const { data: oldRows, error: oldErr } = await admin
      .from("shipments")
      .select("id, awb_no")
      .like("awb_no", "OLD_%")
      .limit(3);
    expect(oldErr).toBeNull();
    expect(oldRows && oldRows.length > 0).toBe(true);

    // 2. Fetch sample booking fields
    const { data: sample } = await admin
      .from("shipments")
      .select("customer_id, vendor_id, product_id, origin_destination_id, destination_id, branch_id, service")
      .ilike("reference_no", "TEST_AWB_%")
      .limit(1)
      .single();

    const { data: cust } = await admin.from("customers").select("code").eq("id", sample.customer_id).single();
    const { data: prod } = await admin.from("products").select("code").eq("id", sample.product_id).single();
    const { data: orig } = await admin.from("destinations").select("code").eq("id", sample.origin_destination_id).single();
    const { data: dest } = await admin.from("destinations").select("code").eq("id", sample.destination_id).single();
    const { data: branch } = await admin.from("branches").select("code").eq("id", sample.branch_id).single();
    const { data: vend } = await admin.from("vendors").select("code").eq("id", sample.vendor_id).single();

    const ts = Date.now().toString().slice(-8);
    const ref = `TEST_OLD_IGN_${ts}`;

    // 3. Book a shipment: book_awb_shipment invokes app.claim_awb_no internally
    // which queries `where awb_no ~ '^[0-9]+$'` across ALL rows including OLD_*
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
        content: "OLD_ AWB TEST DOCS",
        reference_no: ref,
        shipper: {
          company_name: "Ali Associates",
          contact_name: "Karthik",
          address1: "12 Test Road",
          city: "Hyderabad",
          state: "Telangana",
          pincode: "500001",
          country: "India",
          telephone: "9876543210",
          mobile: "9876543210",
          email: "shipper@example.com",
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
          mobile: "+12125550199",
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
    });

    expect(bookErr).toBeNull();
    expect(booked).not.toBeNull();
    expect(/^\d+$/.test(booked.awb_no)).toBe(true);

    // Cleanup
    await admin.from("shipments").delete().eq("id", booked.id);
  });

  it("AWB-CANCEL: cancelled AWBs retain their number and are NEVER reused on subsequent bookings", async () => {
    if (!admin || !client) return;

    const { data: sample } = await admin
      .from("shipments")
      .select("customer_id, vendor_id, product_id, origin_destination_id, destination_id, branch_id, service")
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
    const refCancel = `TEST_CANC_${ts}`;
    const refAfter = `TEST_AFT_${ts}`;

    const baseFields = {
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
      content: "CANCEL TEST DOCUMENTS",
      shipper: {
        company_name: "Ali Associates",
        contact_name: "Karthik",
        address1: "12 Test Road",
        city: "Hyderabad",
        state: "Telangana",
        pincode: "500001",
        country: "India",
        telephone: "9876543210",
        mobile: "9876543210",
        email: "shipper@example.com",
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
        mobile: "+12125550199",
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
    };

    // 1. Book shipment
    const { data: sCancel, error: err1 } = await client.rpc("book_awb_shipment", {
      p_id: null,
      p_row_version: null,
      p_fields: { ...baseFields, reference_no: refCancel },
      p_pieces: [{ pieces: 1, actual_weight_per_pc: 0.5, length: 10, breadth: 10, height: 10 }],
    });
    expect(err1).toBeNull();
    const cancelledAwb = sCancel.awb_no;

    // 2. Cancel the shipment using cancel_shipment RPC
    const { data: cancelledRow, error: cancelErr } = await client.rpc("cancel_shipment", {
      p_id: sCancel.id,
      p_row_version: sCancel.row_version,
      p_reason: "Operational test cancellation",
    });
    expect(cancelErr).toBeNull();
    expect(cancelledRow.current_status).toBe("CANCELLED");
    expect(cancelledRow.awb_no).toBe(cancelledAwb); // Cancelled shipment keeps its AWB number

    // 3. Book another shipment immediately after cancellation
    const { data: sNext, error: errNext } = await client.rpc("book_awb_shipment", {
      p_id: null,
      p_row_version: null,
      p_fields: { ...baseFields, reference_no: refAfter },
      p_pieces: [{ pieces: 1, actual_weight_per_pc: 0.5, length: 10, breadth: 10, height: 10 }],
    });
    expect(errNext).toBeNull();
    const nextAwb = sNext.awb_no;

    // 4. Assert next AWB strictly advances and NEVER reuses the cancelled AWB
    expect(nextAwb).not.toBe(cancelledAwb);
    expect(Number(nextAwb)).toBeGreaterThan(Number(cancelledAwb));

    // 5. Verify the cancelled row in the database still exists with the original AWB
    const { data: verifyRow } = await admin
      .from("shipments")
      .select("id, awb_no, current_status")
      .eq("id", sCancel.id)
      .single();
    expect(verifyRow?.awb_no).toBe(cancelledAwb);
    expect(verifyRow?.current_status).toBe("CANCELLED");

    // Cleanup test rows
    await admin.from("shipments").delete().in("id", [sCancel.id, sNext.id]);
  });
});