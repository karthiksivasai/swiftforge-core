import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dbAdmin } from "./awb-entry-helpers";

const BOOK = "2026-11-11";
const CUSTOMER_CODE = "TEST_RATECUST";
const INVOICE_NO = "TEST_INV_RATE_1";
const BOOKED_RATE = 100;
const NEW_RATE = 250;
const REFS = {
  ok: "TEST_AWB_RATE_OK",
  lock: "TEST_AWB_RATE_LOCK",
  inv: "TEST_AWB_RATE_INV",
  cxl: "TEST_AWB_RATE_CXL",
} as const;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function userClient(): SupabaseClient {
  const raw = JSON.parse(fs.readFileSync(path.resolve(__dirname, ".auth/user.json"), "utf8")) as {
    origins?: Array<{ localStorage?: Array<{ name: string; value: string }> }>;
  };
  const item = (raw.origins ?? [])
    .flatMap((origin) => origin.localStorage ?? [])
    .find((entry) => entry.name.includes("auth-token"));
  if (!item) throw new Error("Signed-in session was not saved");
  const session = JSON.parse(item.value) as { access_token?: string };
  if (!session.access_token) throw new Error("Signed-in session has no access token");
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase URL or anon key is missing");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  });
}

async function wipeFixtures() {
  const { data: rows } = await dbAdmin
    .from("shipments")
    .select("id")
    .in("reference_no", Object.values(REFS));
  for (const row of rows ?? []) {
    const { error } = await dbAdmin
      .from("shipments")
      .update({
        invoice_id: null,
        deleted_at: new Date().toISOString(),
        reference_no: `OLD_${String(row.id).slice(0, 12)}`,
        awb_no: `OLD_${String(row.id).slice(0, 12)}`,
      })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
  }
  await dbAdmin.from("invoices").delete().eq("invoice_no", INVOICE_NO);
}

test("confirm and apply changes only the open test shipment", async ({ page }) => {
  test.setTimeout(180000);
  const user = userClient();
  let rateId = "";
  let rateBefore = BOOKED_RATE;

  try {
    await wipeFixtures();

    const { data: tenantRow, error: tenantErr } = await dbAdmin
      .from("customers")
      .select("tenant_id")
      .limit(1)
      .single();
    expect(tenantErr).toBeNull();
    const tenantId = tenantRow!.tenant_id as string;

    const { data: product } = await dbAdmin
      .from("products")
      .select("id, code")
      .eq("tenant_id", tenantId)
      .eq("code", "DOX")
      .is("deleted_at", null)
      .maybeSingle();
    const { data: origin } = await dbAdmin
      .from("destinations")
      .select("id, code")
      .eq("tenant_id", tenantId)
      .eq("code", "HYD")
      .is("deleted_at", null)
      .maybeSingle();
    const { data: destination } = await dbAdmin
      .from("destinations")
      .select("id, code, name")
      .eq("tenant_id", tenantId)
      .eq("code", "US")
      .is("deleted_at", null)
      .maybeSingle();
    const { data: branch } = await dbAdmin
      .from("branches")
      .select("id, code, state_code")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .not("state_code", "is", null)
      .limit(1)
      .maybeSingle();
    const { data: otherState } = await dbAdmin
      .from("states")
      .select("id, code")
      .eq("tenant_id", tenantId)
      .neq("code", branch?.state_code ?? "")
      .limit(1)
      .maybeSingle();
    expect(product?.id, "DOX product").toBeTruthy();
    expect(origin?.id, "HYD origin").toBeTruthy();
    expect(destination?.id, "US destination").toBeTruthy();
    expect(branch?.id, "branch with a state").toBeTruthy();
    expect(otherState?.id, "billing state").toBeTruthy();

    const { data: existingCustomer } = await dbAdmin
      .from("customers")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("code", CUSTOMER_CODE)
      .is("deleted_at", null)
      .maybeSingle();
    let customerId = existingCustomer?.id as string | undefined;
    if (!customerId) {
      const { data: created, error: customerErr } = await dbAdmin
        .from("customers")
        .insert({
          tenant_id: tenantId,
          code: CUSTOMER_CODE,
          name: "TEST Rate Customer",
          mobile: "9000000099",
          billing_state_id: otherState!.id,
          state_id: otherState!.id,
          status: "ACTIVE",
        })
        .select("id")
        .single();
      expect(customerErr, customerErr?.message).toBeNull();
      customerId = created!.id;
    } else {
      await dbAdmin
        .from("customers")
        .update({ billing_state_id: otherState!.id, state_id: otherState!.id })
        .eq("id", customerId);
    }

    const { data: existingRate } = await dbAdmin
      .from("customer_rates")
      .select("id, rate_per_kg")
      .eq("tenant_id", tenantId)
      .eq("customer_id", customerId)
      .is("deleted_at", null)
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (existingRate?.id) {
      rateId = existingRate.id;
      rateBefore = Number(existingRate.rate_per_kg);
      const { error: resetErr } = await dbAdmin
        .from("customer_rates")
        .update({
          rate_per_kg: BOOKED_RATE,
          min_weight: 0,
          product_id: product!.id,
          from_date: "2026-01-01",
          to_date: null,
        })
        .eq("id", rateId);
      expect(resetErr, resetErr?.message).toBeNull();
    } else {
      const { data: createdRate, error: rateErr } = await dbAdmin
        .from("customer_rates")
        .insert({
          tenant_id: tenantId,
          customer_id: customerId,
          product_id: product!.id,
          from_date: "2026-01-01",
          min_weight: 0,
          rate_per_kg: BOOKED_RATE,
          status: "ACTIVE",
        })
        .select("id")
        .single();
      expect(rateErr, rateErr?.message).toBeNull();
      rateId = createdRate!.id;
      rateBefore = BOOKED_RATE;
    }

    const party = (company: string, city: string, pin: string, country: string) => ({
      company_name: company,
      contact_name: company,
      address1: "1 Test Road",
      city,
      state: "Test",
      pincode: pin,
      country,
      mobile: "9000000098",
    });

    async function book(reference: string, locked: boolean, withManual: boolean) {
      const { data, error } = await user.rpc("book_awb_shipment", {
        p_id: null,
        p_row_version: 0,
        p_fields: {
          reference_no: reference,
          customer_id: customerId,
          customer_code: CUSTOMER_CODE,
          product_id: product!.id,
          product_code: "DOX",
          origin_destination_id: origin!.id,
          origin_code: "HYD",
          destination_id: destination!.id,
          destination_code: destination!.code,
          branch_id: branch!.id,
          branch_code: branch!.code,
          book_date: BOOK,
          pieces: "1",
          pieces_unit: "DOX",
          actual_weight: "1",
          charge_weight: "1",
          weight_unit: "KG",
          is_commercial: false,
          is_locked: locked,
          payment_type: "Credit",
          shipper: party("TEST Rate Shipper", "Hyderabad", "500001", "India"),
          consignee: party("TEST Rate Consignee", "New York", "10001", "USA"),
          wizard_extras: {
            proforma: {
              csbType: "CSB 4",
              exportReason: "DOCUMENTS",
              currency: "INR",
              lines: [],
            },
          },
        },
        p_pieces: [{ pieces: 1, actual_weight_per_pc: 1, measurement_unit: "Centimeter" }],
        p_charges: withManual
          ? [
              {
                side: "CUSTOMER",
                description: "Handling",
                amount: 100,
                rate: 100,
                fuel_applies: false,
                tax_applies: false,
                charges_type: "MANUAL",
              },
            ]
          : [],
        p_comments: [],
        p_attachments: [],
      });
      if (error) throw new Error(`${reference}: ${error.message}`);
      return data as { id: string; awb_no: string; row_version: number; grand_total: number };
    }

    const normal = await book(REFS.ok, false, true);
    const locked = await book(REFS.lock, true, false);
    const invoiced = await book(REFS.inv, false, false);
    const cancelled = await book(REFS.cxl, false, false);

    const { error: cancelErr } = await user.rpc("cancel_shipment", {
      p_id: cancelled.id,
      p_row_version: cancelled.row_version,
      p_reason: "TEST rate update skip",
    });
    expect(cancelErr, cancelErr?.message).toBeNull();

    const { data: invoice, error: invoiceErr } = await dbAdmin
      .from("invoices")
      .insert({
        tenant_id: tenantId,
        invoice_no: INVOICE_NO,
        invoice_date: BOOK,
        customer_id: customerId,
        grand_total: invoiced.grand_total,
        status: "FINALISED",
      })
      .select("id")
      .single();
    expect(invoiceErr, invoiceErr?.message).toBeNull();
    const { error: linkErr } = await dbAdmin
      .from("shipments")
      .update({ invoice_id: invoice!.id })
      .eq("id", invoiced.id);
    expect(linkErr, linkErr?.message).toBeNull();

    const before = new Map<string, number>();
    for (const booked of [normal, locked, invoiced, cancelled]) {
      const { data: row } = await dbAdmin
        .from("shipments")
        .select("grand_total, charge_weight")
        .eq("id", booked.id)
        .single();
      before.set(booked.id, Number(row!.grand_total));
    }
    const { data: weightRow } = await dbAdmin
      .from("shipments")
      .select("charge_weight")
      .eq("id", normal.id)
      .single();
    const weight = Number(weightRow!.charge_weight);
    const { data: oldLines } = await dbAdmin
      .from("shipment_charge_snapshots")
      .select("description, charges_type, amount, fuel_amount, igst, cgst, sgst, total")
      .eq("shipment_id", normal.id)
      .eq("side", "CUSTOMER");
    const oldFreight = (oldLines ?? []).find(
      (line) => line.charges_type === "SYSTEM" && line.description === "Freight",
    );
    const oldManual = (oldLines ?? []).find((line) => line.charges_type === "MANUAL");
    expect(oldManual, "manual line booked").toBeTruthy();
    expect(Number(oldManual!.amount)).toBe(100);
    expect(oldFreight, "freight line booked").toBeTruthy();

    const oldFreightAmt = Number(oldFreight!.amount);
    const oldFuelAmt = Number(oldFreight!.fuel_amount ?? 0);
    const oldTaxAmt =
      Number(oldFreight!.igst ?? 0) + Number(oldFreight!.cgst ?? 0) + Number(oldFreight!.sgst ?? 0);
    const fuelPct = oldFreightAmt > 0 ? round2((oldFuelAmt / oldFreightAmt) * 100) : 0;
    const taxBase = oldFreightAmt + oldFuelAmt;
    const taxPct = taxBase > 0 ? round2((oldTaxAmt / taxBase) * 100) : 0;

    const { error: raiseErr } = await dbAdmin
      .from("customer_rates")
      .update({ rate_per_kg: NEW_RATE })
      .eq("id", rateId);
    expect(raiseErr, raiseErr?.message).toBeNull();

    const expectedFreight = round2(Math.max(weight, 0) * NEW_RATE);
    const expectedFuel = round2((expectedFreight * fuelPct) / 100);
    const expectedTax = round2(((expectedFreight + expectedFuel) * taxPct) / 100);
    const expectedTotal = round2(expectedFreight + expectedFuel + expectedTax + 100);
    console.log(
      `[RATE APPLY MATH] weight ${weight} kg, rate ${BOOKED_RATE} -> ${NEW_RATE}, fuel ${fuelPct}%, tax ${taxPct}%. ` +
        `freight ${oldFreightAmt} -> ${expectedFreight}, fuel ${oldFuelAmt} -> ${expectedFuel}, ` +
        `tax ${oldTaxAmt} -> ${expectedTax}, manual 100 kept, total ${expectedTotal}. AWB ${normal.awb_no}`,
    );

    await page.goto("/utility/rate-zone-update/rate-update");
    const codeBox = page.getByTestId("rate-update-customer").getByRole("combobox", { name: "Code" });
    await codeBox.click();
    await codeBox.fill(CUSTOMER_CODE);
    await expect(codeBox).toHaveValue(CUSTOMER_CODE);
    const dates = page.locator('input[type="date"]');
    await dates.nth(0).fill(BOOK);
    await dates.nth(1).fill(BOOK);
    await page.getByTestId("rate-update-ok").click();
    await expect(page.getByTestId("rate-update-preview")).toBeVisible({ timeout: 45000 });

    const previewText = await page.getByTestId("rate-update-preview").innerText();
    expect(previewText).toContain(normal.awb_no);
    expect(previewText).toContain("Will change");
    expect(previewText).toContain("Locked");
    expect(previewText).toContain("Invoiced");
    expect(previewText).toContain("Cancelled");
    expect(previewText).toContain(expectedFreight.toFixed(2));
    expect(previewText).toContain(expectedTax.toFixed(2));

    await page.getByTestId("rate-update-confirm").click();
    await expect(page.getByRole("heading", { name: "Apply this rate update?" })).toBeVisible();
    await page.getByTestId("rate-update-apply").click();
    await expect(page.getByTestId("rate-update-applied")).toContainText("Updated 1 AWBs. Skipped 3", {
      timeout: 45000,
    });

    const { data: afterLines } = await dbAdmin
      .from("shipment_charge_snapshots")
      .select("description, charges_type, amount, fuel_amount, igst, cgst, sgst, total")
      .eq("shipment_id", normal.id)
      .eq("side", "CUSTOMER");
    const newFreight = (afterLines ?? []).find(
      (line) => line.charges_type === "SYSTEM" && line.description === "Freight",
    );
    const newManual = (afterLines ?? []).find((line) => line.charges_type === "MANUAL");
    expect(Number(newManual!.amount)).toBe(100);
    expect(Number(newManual!.total)).toBe(100);
    expect(Number(newFreight!.amount)).toBe(expectedFreight);
    expect(Number(newFreight!.fuel_amount ?? 0)).toBe(expectedFuel);
    const newTax =
      Number(newFreight!.igst ?? 0) + Number(newFreight!.cgst ?? 0) + Number(newFreight!.sgst ?? 0);
    expect(newTax).toBe(expectedTax);

    const { data: afterNormal } = await dbAdmin
      .from("shipments")
      .select("grand_total")
      .eq("id", normal.id)
      .single();
    expect(Number(afterNormal!.grand_total)).toBe(expectedTotal);

    for (const booked of [locked, invoiced, cancelled]) {
      const { data: row } = await dbAdmin
        .from("shipments")
        .select("grand_total, is_locked, invoice_id, current_status")
        .eq("id", booked.id)
        .single();
      expect(Number(row!.grand_total)).toBe(before.get(booked.id));
    }

    const { data: audit, error: auditErr } = await dbAdmin
      .from("audit_logs")
      .select("actor_id, created_at, old_values, new_values, action, module_slug")
      .eq("entity_id", normal.id)
      .eq("action", "RATE_UPDATE")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    expect(auditErr, auditErr?.message).toBeNull();
    expect(audit?.actor_id).toBeTruthy();
    expect(audit?.created_at).toBeTruthy();
    expect(audit?.module_slug).toBe("utl.rate-update");
    expect(Number(audit?.old_values?.freight)).toBe(oldFreightAmt);
    expect(Number(audit?.new_values?.freight)).toBe(expectedFreight);
    expect(Number(audit?.old_values?.total)).not.toBe(Number(audit?.new_values?.total));

    const { count: skippedAudits } = await dbAdmin
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .in("entity_id", [locked.id, invoiced.id, cancelled.id])
      .eq("action", "RATE_UPDATE");
    expect(skippedAudits ?? 0).toBe(0);
  } finally {
    if (rateId) {
      await dbAdmin.from("customer_rates").update({ rate_per_kg: rateBefore }).eq("id", rateId);
    }
  }
});
