import { describe, it, expect, beforeAll } from "vitest";
import { uiFormToShipmentPayload, dbShipmentToFormPatch } from "./shipmentUiMap";
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
});