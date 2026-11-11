import { expect, test, type Locator, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dbAdmin } from "./awb-entry-helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOOK = "2026-11-11";
const REF = "TEST_AWB_ZONE_TD";
const ZONE = "TEST_Z1";
const DEST = "TEST_ZD";
const SERVICE = "WORLDWIDE EXPRESS SAVER";

type Fixture = {
  vendorId: string;
  originId: string;
  destId: string;
  zoneId: string;
  countryCode: string;
};

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

async function ensureCode(
  table: "zones" | "destinations",
  tenantId: string,
  code: string,
  fields: Record<string, string>,
): Promise<string> {
  const { data: found, error: readError } = await dbAdmin
    .from(table)
    .select("id, deleted_at")
    .eq("tenant_id", tenantId)
    .eq("code", code)
    .limit(1)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (found?.id) {
    const { error } = await dbAdmin.from(table).update({ ...fields, deleted_at: null }).eq("id", found.id);
    if (error) throw new Error(error.message);
    return found.id as string;
  }
  const { data: created, error } = await dbAdmin
    .from(table)
    .insert({ tenant_id: tenantId, code, ...fields })
    .select("id")
    .single();
  if (error || !created) throw new Error(error?.message ?? `Could not create ${code}`);
  return created.id as string;
}

async function ensureFixture(): Promise<Fixture> {
  const { data: vendor, error: vendorError } = await dbAdmin
    .from("vendors")
    .select("id, tenant_id")
    .eq("code", "UPS")
    .is("deleted_at", null)
    .limit(1)
    .single();
  if (vendorError || !vendor) throw new Error(vendorError?.message ?? "UPS was not found");
  const { data: country, error: countryError } = await dbAdmin
    .from("countries")
    .select("id, code")
    .eq("tenant_id", vendor.tenant_id)
    .eq("code", "ZW")
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (countryError || !country) throw new Error(countryError?.message ?? "Country ZW was not found");
  const { data: origin, error: originError } = await dbAdmin
    .from("destinations")
    .select("id")
    .eq("tenant_id", vendor.tenant_id)
    .eq("code", "HYD")
    .is("deleted_at", null)
    .limit(1)
    .single();
  if (originError || !origin) throw new Error(originError?.message ?? "Origin HYD was not found");
  const zoneId = await ensureCode("zones", vendor.tenant_id, ZONE, { name: "TEST Zone" });
  const destId = await ensureCode("destinations", vendor.tenant_id, DEST, {
    name: "TEST Zone Dest",
    country_id: country.id,
    dest_type: "INTERNATIONAL",
  });
  return {
    vendorId: vendor.id,
    originId: origin.id,
    destId,
    zoneId,
    countryCode: country.code,
  };
}

async function clearTestMappings(destId: string) {
  const { error } = await dbAdmin
    .from("zone_mappings")
    .update({ deleted_at: new Date().toISOString() })
    .eq("destination_id", destId)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
}

async function seedPageRows(fixture: Fixture, count: number) {
  const { data: product, error: productError } = await dbAdmin
    .from("products")
    .select("id")
    .eq("code", "DOX")
    .is("deleted_at", null)
    .limit(1)
    .single();
  if (productError || !product) throw new Error(productError?.message ?? "Product DOX was not found");
  const { data: vendor } = await dbAdmin.from("vendors").select("tenant_id").eq("id", fixture.vendorId).single();
  const { data: dest } = await dbAdmin.from("destinations").select("country_id").eq("id", fixture.destId).single();
  const rows = Array.from({ length: count }, (_, index) => ({
    tenant_id: vendor!.tenant_id,
    origin_destination_id: fixture.originId,
    vendor_id: fixture.vendorId,
    product_id: product.id,
    service: `TEST_ZONE_PAGE_${String(index + 1).padStart(2, "0")}`,
    country_id: dest!.country_id,
    destination_id: fixture.destId,
    zone_id: fixture.zoneId,
    effective_date: BOOK,
  }));
  const { error } = await dbAdmin.from("zone_mappings").insert(rows);
  if (error) throw new Error(error.message);
}

function mixedFile(country: string) {
  return [
    "Origin,Vendor,Product,Country,Destination,Zone,Service",
    `HYD,UPS,DOX,${country},${DEST},${ZONE},${SERVICE}`,
    `HYD,UPS,SPX,${country},${DEST},TEST_NOZONE,${SERVICE}`,
    `HYD,UPS,PACK,${country},TEST_NODEST,${ZONE},${SERVICE}`,
    `HYD,UPS,SPX,${country},${DEST},${ZONE},${SERVICE}`,
  ].join("\n");
}

function cleanFile(country: string) {
  return [
    "Origin,Vendor,Product,Country,Destination,Zone,ServiceType",
    `HYD,UPS,DOX,${country},${DEST},${ZONE},${SERVICE}`,
    `HYD,UPS,SPX,${country},${DEST},${ZONE},${SERVICE}`,
    `HYD,UPS,PACK,${country},${DEST},${ZONE},${SERVICE}`,
  ].join("\n");
}

async function pickLive(page: Page, scope: Locator, label: string, code: string, query = code) {
  const field = scope.getByTestId(`zone-field-${label}`);
  const key = label === "origin" || label === "destination" ? "destination" : label;
  const lookup = page.waitForResponse((res) => {
    if (!res.url().includes("/rest/v1/rpc/lookup") || res.request().method() !== "POST" || !res.ok()) return false;
    const body = res.request().postData() ?? "";
    return body.includes(`"p_key":"${key}"`) && body.includes(query);
  }, { timeout: 8000 }).catch(() => null);
  await field.getByRole("button", { name: "Search" }).click();
  const popup = page.getByRole("dialog").filter({ has: page.getByPlaceholder("Search by code or name…") });
  await popup.getByPlaceholder("Search by code or name…").pressSequentially(query, { delay: 20 });
  const choice = popup.getByRole("button", { name: new RegExp(`^${code} `) });
  await expect(choice).toBeVisible({ timeout: 15000 });
  const response = await lookup;
  if (response) expect(JSON.stringify(await response.json())).toContain(code);
  await choice.click();
  await expect(page.getByPlaceholder("Search by code or name…")).toBeHidden();
}

async function retireBooking() {
  const { data: shipments } = await dbAdmin.from("shipments").select("id").eq("reference_no", REF);
  for (const row of shipments ?? []) {
    await dbAdmin.from("shipments").update({
      deleted_at: new Date().toISOString(),
      reference_no: `OLD_${String(row.id).slice(0, 12)}`,
      awb_no: `OLD_${String(row.id).slice(0, 12)}`,
    }).eq("id", row.id);
  }
}

test("zone export pages the test zone and still requires a vendor", async ({ page }) => {
  test.setTimeout(90000);
  const fixture = await ensureFixture();
  await clearTestMappings(fixture.destId);
  await seedPageRows(fixture, 12);
  try {
    await page.goto("/utility/rate-zone-update/zone-update");
    await expect(page.getByTestId("zone-export-search")).toBeDisabled();
    await pickLive(page, page.locator("body"), "vendor", "UPS");
    await expect(page.getByTestId("zone-export-search")).toBeEnabled();
    await page.getByTestId("zone-export-search").click();
    await expect(page.getByText(/Showing 1 to 10 of \d+ entries/)).toBeVisible({ timeout: 30000 });
    await page.getByTestId("zone-export-filter").fill(DEST);
    await expect(page.getByText("Showing 1 to 10 of 12 entries")).toBeVisible();
    await expect(page.getByTestId("zone-mapping-row")).toHaveCount(10);
    await page.getByRole("button", { name: "2", exact: true }).click();
    await expect(page.getByText("Showing 11 to 12 of 12 entries")).toBeVisible();
    await expect(page.getByTestId("zone-mapping-row")).toHaveCount(2);
  } finally {
    await clearTestMappings(fixture.destId);
  }
});

test("zone import shows that the file is being checked", async ({ page }) => {
  const fixture = await ensureFixture();
  await page.route("**/rest/v1/rpc/preview_zone_import", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });
  await page.goto("/utility/rate-zone-update/zone-update");
  await page.getByRole("button", { name: "Import" }).click();
  await page.getByTestId("zone-import-file").setInputFiles({
    name: "zones-mixed.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(mixedFile(fixture.countryCode)),
  });
  await page.getByTestId("zone-import-run").click();
  await expect(page.getByTestId("zone-import-status")).toContainText("Checking 4 rows. Nothing is saved yet.");
  await expect(page.getByTestId("zone-import-preview")).toContainText("Check finished. Nothing is saved yet.");
  await expect(page.getByTestId("zone-import-blocked")).toContainText(/Confirm Import is off because \d+ rows failed/);
  await expect(page.getByTestId("zone-import-confirm")).toBeDisabled();
});

test("zone import dry run, confirm, replace, and booking zone", async ({ page }) => {
  test.setTimeout(240000);
  const fixture = await ensureFixture();
  const user = userClient();
  await clearTestMappings(fixture.destId);
  await retireBooking();
  const country = fixture.countryCode;

  try {
    await page.goto("/utility/rate-zone-update/zone-update");
    await page.getByRole("button", { name: "Import" }).click();
    await page.getByTestId("zone-import-file").setInputFiles({
      name: "zones-mixed.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(mixedFile(country)),
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
    expect(preview).toContain("unknown destination");
    expect(preview).toContain("duplicate row in file");
    await expect(page.getByTestId("zone-import-confirm")).toBeDisabled();

    await page.getByRole("button", { name: "Reset" }).click();
    await page.getByTestId("zone-import-file").setInputFiles({
      name: "zones-clean.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(cleanFile(country)),
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
      p_filters: { export_type: "INTERNATIONAL", vendor_id: fixture.vendorId, as_of: BOOK },
    });
    const rows = ((search as { rows: Array<{ Destination: string; Zone: string }> }).rows ?? [])
      .filter((row) => row.Destination === DEST);
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.Zone === ZONE)).toBe(true);

    const { data: customer } = await dbAdmin.from("customers").select("id").eq("code", "TEST_RATECUST").is("deleted_at", null).single();
    const { data: product } = await dbAdmin.from("products").select("id").eq("code", "DOX").is("deleted_at", null).limit(1).maybeSingle();
    const { data: branch } = await dbAdmin.from("branches").select("id, code").is("deleted_at", null).not("state_code", "is", null).limit(1).maybeSingle();
    const { data: booked, error: bookErr } = await user.rpc("book_awb_shipment", {
      p_id: null,
      p_row_version: 0,
      p_fields: {
        reference_no: REF,
        customer_id: customer!.id,
        customer_code: "TEST_RATECUST",
        product_id: product!.id,
        product_code: "DOX",
        origin_destination_id: fixture.originId,
        origin_code: "HYD",
        destination_id: fixture.destId,
        destination_code: DEST,
        vendor_id: fixture.vendorId,
        vendor_code: "UPS",
        service: SERVICE,
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
        consignee: { company_name: "TEST Zone Consignee", contact_name: "Tester", address1: "1 Test Road", city: "Test City", pincode: "1001", country: "India", mobile: "9000000096" },
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
    expect(zoneCode).toBe(ZONE);

    await page.getByTestId("zone-import-file").setInputFiles({
      name: "zones-clean.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(cleanFile(country)),
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

    await page.getByRole("button", { name: "Export", exact: true }).click();
    await pickLive(page, page.locator("body"), "vendor", "UPS");
    await page.getByTestId("zone-export-search").click();
    await expect(page.getByTestId("zone-export-grid")).toBeVisible({ timeout: 30000 });
    await page.getByTestId("zone-export-filter").fill(DEST);
    await expect(page.getByTestId("zone-export-grid")).toContainText("TEST Zone Dest", { timeout: 30000 });
    await expect(page.getByTestId("zone-mapping-row")).toHaveCount(3);
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
    await expect(page.getByTestId("zone-import-summary")).toContainText("3 unchanged", { timeout: 30000 });
    const roundTrip = await page.getByTestId("zone-import-summary").innerText();
    expect(roundTrip).toContain("0 new");
    expect(roundTrip).toContain("0 replace");
    expect(roundTrip).toContain("3 unchanged");
    await expect(page.getByTestId("zone-import-confirm")).toBeEnabled();
    await page.getByRole("button", { name: "Reset" }).click();
    await expect(page.getByTestId("zone-import-preview")).toHaveCount(0);

    await page.getByRole("button", { name: "Export", exact: true }).click();
    await page.getByTestId("zone-export-search").click();
    await expect(page.getByTestId("zone-export-grid")).toBeVisible({ timeout: 30000 });
    await page.getByTestId("zone-export-filter").fill(DEST);
    await expect(page.getByTestId("zone-mapping-row")).toHaveCount(3, { timeout: 30000 });
    const first = page.getByTestId("zone-mapping-row").first();
    await first.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("dialog").locator('input[type="date"]').fill("2026-11-01");
    await page.getByTestId("zone-mapping-save").click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 15000 });
    await page.getByTestId("zone-export-search").click();
    await expect(page.getByTestId("zone-export-grid")).toBeVisible({ timeout: 30000 });
    await page.getByTestId("zone-export-filter").fill(DEST);
    await expect(page.getByTestId("zone-mapping-row")).toHaveCount(3, { timeout: 15000 });
    await page.getByTestId("zone-mapping-row").first().getByTestId("zone-mapping-delete").click();
    await expect(page.getByTestId("zone-mapping-row")).toHaveCount(10, { timeout: 15000 });
    const filter = page.getByTestId("zone-export-filter");
    await filter.click();
    await filter.press("Meta+A");
    await filter.press("Backspace");
    await filter.pressSequentially(DEST, { delay: 20 });
    await expect(page.getByTestId("zone-mapping-row")).toHaveCount(2, { timeout: 15000 });
  } finally {
    await clearTestMappings(fixture.destId);
    await retireBooking();
  }
});

test("add mapping save, edit, and delete on screen", async ({ page }) => {
  test.setTimeout(120000);
  const fixture = await ensureFixture();
  await clearTestMappings(fixture.destId);
  try {
    await page.goto("/utility/rate-zone-update/zone-update");
    const dialog = page.getByRole("dialog", { name: "Add/Update" });
    await page.getByRole("button", { name: "Add Mapping" }).click({ timeout: 15000 });
    await expect(dialog).toBeVisible();
    await dialog.locator('input[type="date"]').fill(BOOK);
    await pickLive(page, dialog, "origin", "HYD");
    await pickLive(page, dialog, "vendor", "UPS");
    const service = dialog.getByPlaceholder("Service");
    await service.click();
    await service.pressSequentially("WORLDWIDE", { delay: 20 });
    const option = page.getByRole("option", { name: SERVICE });
    await expect(option).toBeVisible({ timeout: 15000 });
    await option.click();
    await pickLive(page, dialog, "product", "DOX");
    await pickLive(page, dialog, "country", fixture.countryCode);
    await pickLive(page, dialog, "destination", DEST, "ZD");
    await pickLive(page, dialog, "zone", ZONE, "Z1");
    await page.getByTestId("zone-mapping-save").click();
    await expect(dialog).toBeHidden({ timeout: 15000 });

    await pickLive(page, page.locator("body"), "vendor", "UPS");
    await page.getByTestId("zone-export-search").click();
    await expect(page.getByTestId("zone-export-grid")).toBeVisible({ timeout: 30000 });
    await page.getByTestId("zone-export-filter").fill(DEST);
    const added = page.getByTestId("zone-mapping-row").filter({ hasText: "TEST Zone Dest" });
    await expect(added).toHaveCount(1, { timeout: 30000 });
    await added.getByRole("button", { name: "Edit" }).click();
    const editDialog = page.getByRole("dialog", { name: "Edit mapping" });
    await expect(editDialog).toBeVisible();
    await editDialog.locator('input[type="date"]').fill("2026-11-01");
    await page.getByTestId("zone-mapping-save").click();
    await expect(editDialog).toBeHidden({ timeout: 15000 });
    await page.getByTestId("zone-export-search").click();
    await expect(page.getByTestId("zone-export-grid")).toBeVisible({ timeout: 30000 });
    await page.getByTestId("zone-export-filter").fill(DEST);
    await expect(page.getByTestId("zone-mapping-row").filter({ hasText: "TEST Zone Dest" })).toHaveCount(1);
    await page.getByTestId("zone-mapping-row").filter({ hasText: "TEST Zone Dest" }).getByTestId("zone-mapping-delete").click();
    await expect(page.getByTestId("zone-mapping-row").filter({ hasText: "TEST Zone Dest" })).toHaveCount(0, { timeout: 15000 });
  } finally {
    await clearTestMappings(fixture.destId);
  }
});
