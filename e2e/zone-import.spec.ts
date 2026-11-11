import { expect, test, type Locator, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dbAdmin } from "./awb-entry-helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOOK = "2026-11-11";
const REF = "TEST_AWB_ZONE_AF";

function userClient(): SupabaseClient {
  const raw = JSON.parse(fs.readFileSync(path.resolve(__dirname, ".auth/user.json"), "utf8")) as {
    origins?: Array<{ localStorage?: Array<{ name: string; value: string }> }>;
  };
  const item = (raw.origins ?? [])
    .flatMap((origin) => origin.localStorage ?? [])
    .find((entry) => entry.name.includes("auth-token"));
  if (!item?.value) throw new Error("Signed-in session was not saved");
  const session = JSON.parse(item.value) as { access_token?: string };
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !session.access_token) throw new Error("Supabase session is incomplete");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  });
}

const mixed = [
  "Origin,Vendor,Product,Country,Destination,Zone,Service",
  "HYD,UPS,DOX,AF,Afghanistan,8,WORLDWIDE EXPRESS SAVER",
  "HYD,UPS,DOX,US,USA,US,WORLDWIDE EXPRESS SAVER",
  "HYD,UPS,DOX,ZW,Zimbabwe,ZW,WORLDWIDE EXPRESS SAVER",
  "HYD,UPS,DOX,AF,Afghanistan,8,WORLDWIDE EXPRESS SAVER",
].join("\n");

async function pickLive(page: Page, scope: Locator, label: string, typed: string, _option: RegExp) {
  void _option;
  const field = scope.getByTestId(`zone-field-${label}`);
  const key = label === "origin" || label === "destination" ? "destination" : label;
  const lookup = page.waitForResponse((res) => {
    if (!res.url().includes("/rest/v1/rpc/lookup") || res.request().method() !== "POST" || !res.ok()) return false;
    const body = res.request().postData() ?? "";
    return body.includes(`"p_key":"${key}"`) && body.includes(typed);
  }, { timeout: 8000 }).catch(() => null);
  await field.getByRole("button", { name: "Search" }).click();
  const popup = page.getByRole("dialog").filter({ has: page.getByPlaceholder("Search by code or name…") });
  await popup.getByPlaceholder("Search by code or name…").fill(typed);
  const choice = popup.getByRole("button", { name: new RegExp(` ${typed}$`) });
  await expect(choice).toBeVisible({ timeout: 15000 });
  const response = await lookup;
  if (response) expect(JSON.stringify(await response.json())).toContain(typed);
  await choice.click();
  await expect(page.getByPlaceholder("Search by code or name…")).toBeHidden();
}

const clean = [
  "Origin,Vendor,Product,Country,Destination,Zone,ServiceType",
  "HYD,UPS,DOX,AF,Afghanistan,8,WORLDWIDE EXPRESS SAVER",
  "HYD,UPS,DOX,AR,Argentina,1,WORLDWIDE EXPRESS SAVER",
  "HYD,UPS,DOX,US,USA,US,WORLDWIDE EXPRESS SAVER",
].join("\n");

test("zone import dry run, confirm, replace, and booking zone", async ({ page }) => {
  test.setTimeout(240000);
  const user = userClient();
  const created: string[] = [];

  const { data: ups } = await dbAdmin
    .from("vendors")
    .select("id")
    .eq("code", "UPS")
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  try {
    await page.goto("/utility/rate-zone-update/zone-update");
    await page.getByRole("button", { name: "Import" }).click();
    await page.getByTestId("zone-import-file").setInputFiles({
      name: "zones-mixed.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(mixed),
    });
    await expect(page.getByTestId("zone-import-run")).toBeEnabled();
    await page.getByTestId("zone-import-run").click();
    await expect(page.getByTestId("zone-import-summary")).toContainText("4 rows", { timeout: 30000 });
    const summary = await page.getByTestId("zone-import-summary").innerText();
    expect(summary).toContain("1 OK");
    expect(summary).toContain("3 failed");
    expect(summary).toContain("Nothing is saved yet");
    const preview = await page.getByTestId("zone-import-preview").innerText();
    expect(preview).toContain("unknown zone");
    expect(preview).toContain("duplicate row in file");
    await expect(page.getByTestId("zone-import-confirm")).toBeDisabled();

    await page.getByRole("button", { name: "Reset" }).click();
    await page.getByTestId("zone-import-file").setInputFiles({
      name: "zones-clean.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(clean),
    });
    await expect(page.getByTestId("zone-import-run")).toBeEnabled();
    await page.getByTestId("zone-import-date").fill(BOOK);
    await page.getByTestId("zone-import-run").click();
    await expect(page.getByTestId("zone-import-summary")).toContainText("3 new", { timeout: 30000 });
    await page.getByTestId("zone-import-confirm").click();
    await page.getByTestId("zone-import-apply").click();
    await expect(page.getByTestId("zone-import-result")).toContainText("Imported 3", { timeout: 30000 });
    await expect(page.getByTestId("zone-import-result")).toContainText("New 3");

    const { data: search } = await user.rpc("search_zone_mappings", {
      p_filters: { export_type: "INTERNATIONAL", vendor_id: ups!.id, as_of: BOOK },
    });
    const rows = ((search as { rows: Array<{ id: string; Destination: string; Zone: string }> }).rows ?? [])
      .filter((row) => ["AF", "AR", "US"].includes(row.Destination));
    expect(rows).toHaveLength(3);
    created.push(...rows.map((row) => row.id));

    const { data: customer } = await dbAdmin.from("customers").select("id").eq("code", "TEST_RATECUST").is("deleted_at", null).single();
    const { data: product } = await dbAdmin.from("products").select("id").eq("code", "DOX").is("deleted_at", null).limit(1).maybeSingle();
    const { data: origin } = await dbAdmin.from("destinations").select("id").eq("code", "HYD").is("deleted_at", null).limit(1).maybeSingle();
    const { data: dest } = await dbAdmin.from("destinations").select("id").eq("code", "AF").is("deleted_at", null).limit(1).maybeSingle();
    const { data: branch } = await dbAdmin.from("branches").select("id, code").is("deleted_at", null).not("state_code", "is", null).limit(1).maybeSingle();
    const { data: retired } = await dbAdmin.from("shipments").select("id").eq("reference_no", REF);
    for (const row of retired ?? []) {
      await dbAdmin.from("shipments").update({
        deleted_at: new Date().toISOString(),
        reference_no: `OLD_${String(row.id).slice(0, 12)}`,
      }).eq("id", row.id);
    }

    const { data: booked, error: bookErr } = await user.rpc("book_awb_shipment", {
      p_id: null,
      p_row_version: 0,
      p_fields: {
        reference_no: REF,
        customer_id: customer!.id,
        customer_code: "TEST_RATECUST",
        product_id: product!.id,
        product_code: "DOX",
        origin_destination_id: origin!.id,
        origin_code: "HYD",
        destination_id: dest!.id,
        destination_code: "AF",
        vendor_id: ups!.id,
        vendor_code: "UPS",
        service: "WORLDWIDE EXPRESS SAVER",
        branch_id: branch!.id,
        branch_code: branch!.code,
        book_date: BOOK,
        pieces: "1",
        pieces_unit: "DOX",
        actual_weight: "1",
        charge_weight: "1",
        is_commercial: false,
        is_locked: false,
        payment_type: "Credit",
        shipper: { company_name: "TEST Zone Shipper", contact_name: "Tester", address1: "1 Test Road", city: "Hyderabad", pincode: "500001", country: "India", mobile: "9000000097" },
        consignee: { company_name: "TEST Zone Consignee", contact_name: "Tester", address1: "1 Test Road", city: "Kabul", pincode: "1001", country: "Afghanistan", mobile: "9000000096" },
        wizard_extras: { proforma: { csbType: "CSB 4", exportReason: "DOCUMENTS", currency: "INR", lines: [] } },
      },
      p_pieces: [{ pieces: 1, actual_weight_per_pc: 1, measurement_unit: "Centimeter" }],
      p_charges: [],
      p_comments: [],
      p_attachments: [],
    });
    expect(bookErr, bookErr?.message).toBeNull();
    const shipment = booked as { id: string; awb_no: string };
    const { data: zoneRow } = await dbAdmin.from("shipments").select("zone_id, zones(code)").eq("id", shipment.id).single();
    const zoneCode = (zoneRow as { zones?: { code?: string } | null })?.zones?.code;
    console.log(`[ZONE BOOK] AWB ${shipment.awb_no} HYD -> Afghanistan UPS DOX WORLDWIDE EXPRESS SAVER zone ${zoneCode}`);
    expect(zoneCode).toBe("8");

    await page.getByTestId("zone-import-file").setInputFiles({
      name: "zones-clean.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(clean),
    });
    await expect(page.getByTestId("zone-import-run")).toBeEnabled();
    await page.getByTestId("zone-import-run").click();
    await expect(page.getByTestId("zone-import-summary")).toContainText("0 new", { timeout: 30000 });
    await expect(page.getByTestId("zone-import-summary")).toContainText("0 replace");
    await expect(page.getByTestId("zone-import-summary")).toContainText("3 unchanged");
    await page.getByTestId("zone-import-confirm").click();
    await page.getByTestId("zone-import-apply").click();
    await expect(page.getByTestId("zone-import-result")).toContainText("Unchanged 3", { timeout: 30000 });
    await expect(page.getByTestId("zone-import-result")).toContainText("Replaced 0");

    const { data: afterReplace } = await user.rpc("search_zone_mappings", {
      p_filters: { export_type: "ALL", vendor_id: ups!.id, as_of: BOOK },
    });
    const kept = ((afterReplace as { rows?: Array<{ Destination: string | null }> } | null)?.rows ?? [])
      .filter((row) => row.Destination && ["AF", "AR", "US"].includes(row.Destination));
    expect(kept).toHaveLength(3);

    await page.getByRole("button", { name: "Export", exact: true }).click();
    await pickLive(page, page.locator("body"), "vendor", "UPS", /UPS/);
    await page.getByTestId("zone-export-search").click();
    await expect(page.getByTestId("zone-export-grid")).toContainText("Afghanistan", { timeout: 30000 });
    await expect(page.getByTestId("zone-export-grid")).toContainText("ServiceType");

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("zone-export-download").click();
    const download = await downloadPromise;
    const exported = fs.readFileSync(await download.path());
    await page.getByRole("button", { name: "Import" }).click();
    await page.getByTestId("zone-import-file").setInputFiles({
      name: download.suggestedFilename(),
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: exported,
    });
    await expect(page.getByTestId("zone-import-run")).toBeEnabled();
    await page.getByTestId("zone-import-date").fill(BOOK);
    await page.getByTestId("zone-import-run").click();
    await expect(page.getByTestId("zone-import-summary")).toContainText("0 new", { timeout: 30000 });
    const roundTrip = await page.getByTestId("zone-import-summary").innerText();
    console.log(`[ZONE ROUND TRIP] ${roundTrip}`);
    expect(roundTrip).toContain("0 new");
    expect(roundTrip).toContain("0 replace");
    expect(roundTrip).toContain("3 unchanged");
    await expect(page.getByTestId("zone-import-confirm")).toBeEnabled();
    await page.getByRole("button", { name: "Reset" }).click();
    await expect(page.getByTestId("zone-import-preview")).toHaveCount(0);

    await page.getByRole("button", { name: "Export", exact: true }).click();
    await page.getByTestId("zone-export-search").click();
    await expect(page.getByTestId("zone-export-grid")).toContainText("Afghanistan", { timeout: 30000 });

    const afghan = page.getByTestId("zone-mapping-row").filter({ hasText: "Afghanistan" }).first();
    await afghan.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("dialog").locator('input[type="date"]').fill("2026-11-01");
    await page.getByTestId("zone-mapping-save").click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 15000 });

    await page.getByTestId("zone-export-search").click();
    await expect(page.getByTestId("zone-export-grid")).toContainText("Afghanistan");
    const beforeDelete = await page.getByTestId("zone-mapping-row").count();
    await page.getByTestId("zone-mapping-row").filter({ hasText: "Afghanistan" }).getByTestId("zone-mapping-delete").click();
    await expect(page.getByTestId("zone-mapping-row")).toHaveCount(beforeDelete - 1, { timeout: 15000 });
  } finally {
    const { data: search } = await user.rpc("search_zone_mappings", {
      p_filters: { export_type: "ALL", vendor_id: ups?.id ?? null },
    });
    const rows = ((search as { rows?: Array<{ id: string; Destination: string | null }> } | null)?.rows ?? [])
      .filter((row) => row.Destination && ["AF", "AR", "US", "AD"].includes(row.Destination));
    for (const row of rows) {
      await user.rpc("delete_zone_mapping", { p_id: row.id });
    }
    for (const id of created) {
      await user.rpc("delete_zone_mapping", { p_id: id });
    }
    const { data: shipments } = await dbAdmin.from("shipments").select("id").eq("reference_no", REF);
    for (const row of shipments ?? []) {
      await dbAdmin.from("shipments").update({
        deleted_at: new Date().toISOString(),
        reference_no: `OLD_${String(row.id).slice(0, 12)}`,
      }).eq("id", row.id);
    }
  }
});

test("add mapping save, edit, and delete on screen", async ({ page }) => {
  test.setTimeout(120000);
  const user = userClient();
  const { data: ups } = await dbAdmin.from("vendors").select("id").eq("code", "UPS").is("deleted_at", null).limit(1).maybeSingle();
  try {
    await page.goto("/utility/rate-zone-update/zone-update");
    const dialog = page.getByRole("dialog", { name: "Add/Update" });
    await page.getByTestId("zone-add").click();
    await expect(dialog).toBeVisible();
    await dialog.locator('input[type="date"]').fill(BOOK);
    await pickLive(page, dialog, "origin", "HYD", /HYD/);
    await pickLive(page, dialog, "vendor", "UPS", /UPS/);
    await dialog.getByPlaceholder("Service").fill("WORLDWIDE");
    await page.getByRole("option", { name: "WORLDWIDE EXPRESS SAVER" }).click();
    await pickLive(page, dialog, "product", "DOX", /DOX/);
    await pickLive(page, dialog, "country", "AD", /Andorra/);
    await pickLive(page, dialog, "destination", "AD", /Andorra/);
    await pickLive(page, dialog, "zone", "US", /US/);
    await page.getByTestId("zone-mapping-save").click();
    await expect(dialog).toBeHidden({ timeout: 15000 });

    await page.getByTestId("zone-export-search").click();
    const added = page.getByTestId("zone-mapping-row").filter({ hasText: "Andorra" });
    await expect(added).toBeVisible({ timeout: 30000 });
    await added.getByRole("button", { name: "Edit" }).click();
    const editDialog = page.getByRole("dialog", { name: "Edit mapping" });
    await expect(editDialog).toBeVisible();
    await editDialog.locator('input[type="date"]').fill("2026-11-01");
    await page.getByTestId("zone-mapping-save").click();
    await expect(editDialog).toBeHidden({ timeout: 15000 });
    await page.getByTestId("zone-export-search").click();
    await expect(page.getByTestId("zone-mapping-row").filter({ hasText: "Andorra" })).toBeVisible();
    await page.getByTestId("zone-mapping-row").filter({ hasText: "Andorra" }).getByTestId("zone-mapping-delete").click();
    await expect(page.getByTestId("zone-mapping-row").filter({ hasText: "Andorra" })).toHaveCount(0, { timeout: 15000 });
  } finally {
    const { data: search } = await user.rpc("search_zone_mappings", {
      p_filters: { export_type: "ALL", vendor_id: ups?.id ?? null },
    });
    const rows = ((search as { rows?: Array<{ id: string; Destination: string | null }> } | null)?.rows ?? [])
      .filter((row) => row.Destination === "AD");
    for (const row of rows) await user.rpc("delete_zone_mapping", { p_id: row.id });
  }
});
