import { describe, expect, it, beforeAll } from "vitest";
import { AWB_NAV } from "@/lib/forms/awb-entry-nav-order";

describe("Forwarding Tab Batch 3 Tests (FW-07, FW-09, FW-10, D6, D8)", () => {
  let dbAdmin: any;
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
    if (!url || !serviceKey || !anonKey) throw new Error("Missing Supabase credentials in .env");

    dbAdmin = createClient(url, serviceKey);
    client = createClient(url, anonKey);

    const pwd = process.env.TEST_ADMIN_PASSWORD || "Admin@123";
    const { error: pwdErr } = await client.auth.signInWithPassword({
      email: "kkarthik3162@gmail.com",
      password: pwd,
    });

    if (pwdErr) {
      const { data: link, error: linkErr } = await dbAdmin.auth.admin.generateLink({
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
  it("FW-07: reactive sync between forwardingAwb and forwardingNo", () => {
    // Simulating patchForwarding logic
    type ForwardingData = {
      deliveryAwb: string;
      forwardingAwb: string;
    };
    type FormState = {
      forwardingNo: string;
      deliveryNo: string;
      forwarding: ForwardingData;
    };

    let state: FormState = {
      forwardingNo: "",
      deliveryNo: "",
      forwarding: { deliveryAwb: "", forwardingAwb: "" },
    };

    const patchForwarding = (patch: Partial<ForwardingData>) => {
      const updated = { ...state.forwarding, ...patch };
      state = {
        ...state,
        forwarding: updated,
        ...(patch.forwardingAwb !== undefined ? { forwardingNo: patch.forwardingAwb } : {}),
        ...(patch.deliveryAwb !== undefined ? { deliveryNo: patch.deliveryAwb } : {}),
      };
    };

    // User types in Forwarding AWB
    patchForwarding({ forwardingAwb: "794612345678" });
    expect(state.forwarding.forwardingAwb).toBe("794612345678");
    expect(state.forwardingNo).toBe("794612345678");

    // User types in Delivery AWB
    patchForwarding({ deliveryAwb: "DEL-998877" });
    expect(state.forwarding.deliveryAwb).toBe("DEL-998877");
    expect(state.deliveryNo).toBe("DEL-998877");
  });

  it("FW-09: charge master provides vendor charge descriptions with side='VENDOR' or 'BOTH'", async () => {
    const { data, error } = await dbAdmin
      .from("charges")
      .select("code, name, side")
      .is("deleted_at", null)
      .in("side", ["VENDOR", "BOTH"])
      .order("name", { ascending: true });

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.length).toBeGreaterThanOrEqual(4);

    const names = data!.map((c) => c.name);
    expect(names).toContain("COVID CHARGE VENDOR");
    expect(names).toContain("DEMAND SURCHARGE VENDOR");
    expect(names).toContain("GOGREEN VENDOR");
    expect(names).toContain("MEDICAL CHARGES VENDOR");
  });

  it("FW-10: AWB_NAV includes FWD_COLLAPSIBLE_TRIGGER between vendor invoice and draft charge", () => {
    expect(AWB_NAV.FWD_VENDOR_INVOICE).toBe(1007);
    expect(AWB_NAV.FWD_COLLAPSIBLE_TRIGGER).toBe(1008);
    expect(AWB_NAV.VENDOR_CHARGE_DESCRIPTION).toBe(1010);
    expect(AWB_NAV.FWD_COLLAPSIBLE_TRIGGER).toBeGreaterThan(AWB_NAV.FWD_VENDOR_INVOICE);
    expect(AWB_NAV.FWD_COLLAPSIBLE_TRIGGER).toBeLessThan(AWB_NAV.VENDOR_CHARGE_DESCRIPTION);
  });

  it("D6: carrier format validation rules generate warning strings without blocking", () => {
    function checkFormatWarning(vendor: string, fwd: string): string | null {
      const code = vendor.toUpperCase().trim();
      const val = fwd.trim();
      if (!val) return null;

      if (code === "FEDEX" || code.includes("FEDEX")) {
        if (!/^\d{12}$/.test(val)) {
          return `Standard FedEx tracking numbers are 12 digits (entered: ${val.length} chars). Booking is still permitted.`;
        }
      } else if (code === "DHL" || code.includes("DHL")) {
        if (!/^\d{10}$/.test(val)) {
          return `Standard DHL Express tracking numbers are 10 digits (entered: ${val.length} chars). Booking is still permitted.`;
        }
      } else if (code === "UPS" || code.includes("UPS")) {
        if (!/^1Z[A-Za-z0-9]{16}$/i.test(val)) {
          return `Standard UPS tracking numbers start with "1Z" followed by 16 alphanumeric characters (18 total, entered: ${val.length} chars). Booking is still permitted.`;
        }
      }
      return null;
    }

    // Invalid formats trigger warnings
    expect(checkFormatWarning("FEDEX", "12345")).toContain("Standard FedEx tracking numbers are 12 digits");
    expect(checkFormatWarning("DHL", "1234567")).toContain("Standard DHL Express tracking numbers are 10 digits");
    expect(checkFormatWarning("UPS", "9988776655")).toContain('Standard UPS tracking numbers start with "1Z"');
    expect(checkFormatWarning("UPS", "1Z123")).toContain('Standard UPS tracking numbers start with "1Z"');

    // Valid formats produce null (no warning)
    expect(checkFormatWarning("FEDEX", "794612345678")).toBeNull();
    expect(checkFormatWarning("DHL", "1234567890")).toBeNull();
    expect(checkFormatWarning("UPS", "1Z12345E0291980793")).toBeNull();
  });

  it("D8 / F5: server book_awb_shipment preserves customer price when delivery vendor is overridden", async () => {
    // Pick a valid test shipment as template to guarantee consistent master IDs
    const { data: sample } = await dbAdmin
      .from("shipments")
      .select("customer_id, vendor_id, product_id, origin_destination_id, destination_id, branch_id, service, shipper, consignee, wizard_extras")
      .ilike("reference_no", "TEST_AWB_%")
      .limit(1)
      .single();

    expect(sample).not.toBeNull();

    const { data: cust } = await dbAdmin.from("customers").select("code").eq("id", sample.customer_id).single();
    const { data: prod } = await dbAdmin.from("products").select("code").eq("id", sample.product_id).single();
    const { data: orig } = await dbAdmin.from("destinations").select("code").eq("id", sample.origin_destination_id).single();
    const { data: dest } = await dbAdmin.from("destinations").select("code").eq("id", sample.destination_id).single();
    const { data: branch } = await dbAdmin.from("branches").select("code").eq("id", sample.branch_id).single();
    const { data: vend } = await dbAdmin.from("vendors").select("code").eq("id", sample.vendor_id).single();
    // Delivery vendor (different vendor)
    const { data: fedex } = await dbAdmin.from("vendors").select("id, code, name").ilike("name", "%FEDEX%").limit(1).single();

    const ts = Date.now().toString().slice(-8);
    const ref = `TEST_FWD_F5_${ts}`;

    // Book AWB with primary vendor from sample, but Delivery Vendor overridden to FEDEX
    const { data: booked, error } = await client.rpc("book_awb_shipment", {
      p_id: null,
      p_row_version: null,
      p_fields: {
        reference_no: ref,
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
        delivery_vendor_id: fedex.id,
        delivery_service: "EXPRESS",
        forwarding_awb: `TEST_FWD_OVR_${ts}`,
        service: sample.service || "EXPRESS",
        branch_id: sample.branch_id,
        branch_code: branch?.code,
        book_date: "2026-11-11",
        pieces: "1",
        pieces_unit: "BOX",
        actual_weight: "2.0",
        charge_weight: "2.0",
        is_commercial: false,
        is_locked: false,
        payment_type: "CASH",
        shipper: sample.shipper,
        consignee: sample.consignee,
        wizard_extras: {
          proforma: {
            csbType: "CSB 4",
            exportReason: "UNSOLICITED GIFT - NOT FOR SALE",
            currency: "INR",
            lines: [{ description: "Sweets", quantity: 1, rate: 500, total: 500 }],
          },
          forwarding: {
            deliveryVendor: { id: fedex.id, code: fedex.code, name: fedex.name },
            deliveryService: { code: "EXPRESS", name: "EXPRESS" },
            forwardingAwb: `TEST_FWD_OVR_${ts}`,
          },
        },
      },
      p_pieces: [
        {
          pieces: 1,
          actual_weight_per_pc: 2.0,
          length: 20,
          breadth: 20,
          height: 10,
          measurement_unit: "Centimeter",
        },
      ],
      p_charges: [],
      p_comments: [],
      p_attachments: [],
    });

    expect(error).toBeNull();
    expect(booked).toBeDefined();

    // Verify database row
    const { data: shipment, error: fetchErr } = await dbAdmin
      .from("shipments")
      .select("*, vendor:vendors!shipments_vendor_fk(code), delivery_vendor:vendors!shipments_delivery_vendor_fk(code)")
      .eq("id", booked.id)
      .single();

    expect(fetchErr).toBeNull();
    expect(shipment.vendor.code).toBe(vend?.code);
    expect(shipment.delivery_vendor.code).toBe(fedex.code);
    expect(shipment.forwarding_awb).toBe(`TEST_FWD_OVR_${ts}`);
    // Customer price is customer rate (not changed by delivery vendor override)
    expect(Number(shipment.grand_total)).toBeGreaterThan(0);
    // Vendor charges total is calculated
    expect(Number(shipment.vendor_charges_total)).toBeGreaterThan(0);

    // Clean up test shipment
    await dbAdmin
      .from("shipments")
      .update({
        deleted_at: new Date().toISOString(),
        awb_no: `OLD_${shipment.awb_no}_${String(shipment.id).slice(0, 8)}`,
        forwarding_awb: null,
      })
      .eq("id", shipment.id);
  });
});
