import { expect, test, type Page } from "@playwright/test";
import { dbAdmin } from "./awb-entry-helpers";

test("rate and zone job screens are gone", async ({ page }) => {
  await page.goto("/utility/rate-zone-update/rate-update-jobs");
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();

  await page.goto("/utility/rate-zone-update/zone-update-jobs");
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "Rate Update Jobs" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Zone Update Jobs" })).toHaveCount(0);
});

test("rate update previews and does not offer the job queue", async ({ page }) => {
  await page.goto("/utility/rate-zone-update/rate-update");
  await expect(page.getByText("Update Type")).toBeVisible();
  await page.getByRole("combobox").first().click();
  await expect(page.getByRole("option", { name: "Vendor OBC Rate" })).toHaveCount(0);
  await expect(page.getByRole("option", { name: "AWB Entry Rate" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Add to Job Queue")).toHaveCount(0);
  await expect(page.getByText("Click Here Open Job Queue")).toHaveCount(0);
  await expect(page.getByText("I confirm all shipments in this date range")).toBeVisible();

  await page.getByTestId("rate-update-ok").click();
  await expect(page.getByTestId("rate-update-scope-error")).toContainText(
    "Choose a customer, vendor, or destination",
  );

  const dates = page.locator('input[type="date"]');
  await dates.nth(0).fill("2026-11-09");
  await dates.nth(1).fill("2026-11-09");
  await page.getByTestId("rate-update-confirm-all").click();
  await page.getByTestId("rate-update-ok").click();
  await expect(page.getByTestId("rate-update-preview")).toBeVisible({ timeout: 45000 });
  await expect(page.getByText("Old freight")).toBeVisible();
  await expect(page.getByText("New freight")).toBeVisible();
  await expect(page.getByTestId("rate-update-grand")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Locked" })).toBeVisible();
});

test("rate update customer search reads the live master", async ({ page }) => {
  await page.goto("/utility/rate-zone-update/rate-update");
  const lookup = page.waitForResponse((res) => {
    if (!res.url().includes("/rest/v1/rpc/lookup") || res.request().method() !== "POST" || !res.ok()) return false;
    const body = res.request().postData() ?? "";
    return body.includes('"p_key":"customer"') && body.includes("ALIASSO");
  });
  await page.getByTestId("rate-update-customer").getByRole("button", { name: "Search" }).click();
  const popup = page.getByRole("dialog");
  await popup.getByPlaceholder("Search by code or name…").fill("ALIASSO");
  const response = await lookup;
  const payload = JSON.stringify(await response.json());
  expect(payload).toContain("ALIASSO");
  expect(payload).toContain("ALI ASSOCIATES");
  await popup.getByRole("button", { name: /ALI ASSOCIATES/ }).click();
  await expect(page.getByTestId("rate-update-customer").getByRole("combobox", { name: "Code" })).toHaveValue("ALIASSO");
});

async function pickLookup(page: Page, testId: string, query: string, choice: RegExp) {
  const field = page.getByTestId(testId);
  await field.getByRole("button", { name: "Search" }).click();
  const popup = page.getByRole("dialog").filter({ has: page.getByPlaceholder("Search by code or name…") });
  await popup.getByPlaceholder("Search by code or name…").fill(query);
  const button = popup.getByRole("button", { name: choice });
  await expect(button).toBeVisible({ timeout: 15000 });
  await button.click();
  await expect(page.getByPlaceholder("Search by code or name…")).toBeHidden();
}

async function pickUps(page: Page) {
  const field = page.getByTestId("rate-import-vendor");
  const lookup = page.waitForResponse((res) => {
    if (!res.url().includes("/rest/v1/rpc/lookup") || res.request().method() !== "POST" || !res.ok()) return false;
    const body = res.request().postData() ?? "";
    return body.includes('"p_key":"vendor"') && body.includes("UPS");
  }, { timeout: 8000 }).catch(() => null);
  await field.getByRole("button", { name: "Search" }).click();
  const popup = page.getByRole("dialog").filter({ has: page.getByPlaceholder("Search by code or name…") });
  await popup.getByPlaceholder("Search by code or name…").fill("UPS");
  const choice = popup.getByRole("button", { name: / UPS$/ });
  await expect(choice).toBeVisible({ timeout: 15000 });
  const response = await lookup;
  if (response) expect(JSON.stringify(await response.json())).toContain("UPS");
  await choice.click();
  await expect(page.getByPlaceholder("Search by code or name…")).toBeHidden();
}

async function removeTestRateGrid() {
  await dbAdmin.from("zone_rate_prices").update({ deleted_at: new Date().toISOString() }).like("service", "TEST_RATE%").is("deleted_at", null);
}

async function chooseFormat(page: Page, name: string) {
  await page.getByTestId("rate-import-format").click();
  await page.getByRole("option", { name, exact: true }).click();
}

test("rate import checks a zone price sheet and does not save it", async ({ page }) => {
  test.setTimeout(90000);
  await page.goto("/utility/rate-zone-update/rate-import");
  await expect(page.getByTestId("rate-import-check")).toBeDisabled();
  await page.getByRole("button", { name: "Vendor", exact: true }).click();
  await pickUps(page);
  await page.getByTestId("rate-import-file").setInputFiles({
    name: "zone-rate.csv",
    mimeType: "text/csv",
    buffer: Buffer.from([
      "Zone wise Rate",
      "Service,Weight,8,NOTAZONE",
      "WORLDWIDE EXPRESS SAVER,0.5,1441.16,10",
      "WORLDWIDE EXPRESS SAVER,1,1540.61,20",
    ].join("\n")),
  });
  await expect(page.getByText("zone-rate.csv: 4 prices")).toBeVisible();
  await chooseFormat(page, "Zone Rate");
  await page.route("**/rest/v1/rpc/preview_zone_rate_import", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });
  await page.getByTestId("rate-import-check").click();
  await expect(page.getByTestId("rate-import-status")).toContainText("Checking 4 prices. Nothing is saved yet.");
  await expect(page.getByTestId("rate-import-summary")).toContainText("Nothing is saved yet.");
  await expect(page.getByTestId("rate-import-blocked")).toContainText("Confirm Import is off");
  await expect(page.getByTestId("rate-import-confirm")).toBeDisabled();
  await expect(page.getByTestId("rate-import-result")).toHaveCount(0);
});

test("rate import saves a price and leaves an identical row unchanged", async ({ page }) => {
  test.setTimeout(90000);
  await removeTestRateGrid();
  try {
    await page.goto("/utility/rate-zone-update/rate-import");
    await page.getByRole("button", { name: "Vendor", exact: true }).click();
    await pickUps(page);
    await page.getByTestId("rate-import-file").setInputFiles({
      name: "test-rate-grid.csv",
      mimeType: "text/csv",
      buffer: Buffer.from([
        "Zone wise Rate",
        "Service,Weight,8",
        "TEST_RATE_GRID,0.5,12.34",
      ].join("\n")),
    });
    await expect(page.getByText("test-rate-grid.csv: 1 price")).toBeVisible();
    await chooseFormat(page, "Zone Rate");
    await page.getByTestId("rate-import-check").click();
    await expect(page.getByTestId("rate-import-summary")).toContainText("1 price. 1 OK. 0 failed. 1 new. 0 replace. 0 unchanged.");
    await page.getByTestId("rate-import-confirm").click();
    await page.getByTestId("rate-import-apply").click();
    await expect(page.getByTestId("rate-import-result")).toContainText("Imported 1. New 1. Replaced 0. Unchanged 0. Skipped 0.");
    await page.getByTestId("rate-import-check").click();
    await expect(page.getByTestId("rate-import-summary")).toContainText("0 new. 0 replace. 1 unchanged.");
  } finally {
    await removeTestRateGrid();
  }
});

test("rate import requires a customer on the customer tab", async ({ page }) => {
  await page.goto("/utility/rate-zone-update/rate-import");
  await pickUps(page);
  await page.getByTestId("rate-import-file").setInputFiles({
    name: "zone-rate.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Zone wise Rate\nService,Weight,8\nWORLDWIDE EXPRESS SAVER,0.5,10\n"),
  });
  await chooseFormat(page, "Zone Rate");
  await page.getByTestId("rate-import-check").click();
  await expect(page.getByTestId("rate-import-notice")).toHaveText("Customer is required");
  await expect(page.getByTestId("rate-import-summary")).toHaveCount(0);
});

test("rate import rounds prices and can skip a failed country", async ({ page }) => {
  test.setTimeout(90000);
  await removeTestRateGrid();
  try {
    await page.goto("/utility/rate-zone-update/rate-import");
    await page.getByRole("button", { name: "Vendor", exact: true }).click();
    await pickUps(page);
    await page.getByTestId("rate-import-file").setInputFiles({
      name: "round-rate.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("Zone wise Rate\nService,Weight,8\nTEST_RATE_ROUND,0.5,10.40\n"),
    });
    await chooseFormat(page, "Zone Rate");
    await page.getByRole("checkbox", { name: "Rate Round Off" }).check();
    await page.getByTestId("rate-import-check").click();
    await expect(page.getByTestId("rate-import-row")).toContainText("10.00");

    await page.getByTestId("rate-import-file").setInputFiles({
      name: "country-rate.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("Country Rate\nService,Weight,US,ZZNO\nTEST_RATE_COUNTRY,0.5,10,20\n"),
    });
    await expect(page.getByText("country-rate.csv: 2 prices")).toBeVisible();
    await chooseFormat(page, "Country Rate");
    await page.getByTestId("rate-import-check").click();
    await expect(page.getByTestId("rate-import-blocked")).toContainText("Confirm Import is off");
    await page.getByTestId("rate-import-skip").check();
    await expect(page.getByTestId("rate-import-confirm")).toBeEnabled();
    await page.getByTestId("rate-import-confirm").click();
    await page.getByTestId("rate-import-apply").click();
    await expect(page.getByTestId("rate-import-result")).toContainText("Skipped 1");
  } finally {
    await removeTestRateGrid();
  }
});

test("rate import stores the customer, origin, and product on the price", async ({ page }) => {
  test.setTimeout(90000);
  await removeTestRateGrid();
  try {
    await page.goto("/utility/rate-zone-update/rate-import");
    await pickLookup(page, "rate-import-customer", "ALIASSO", /ALIASSO$/);
    await pickLookup(page, "rate-import-origin", "HYD", /HYD$/);
    await pickUps(page);
    await page.getByTestId("rate-import-spx").click();
    await page.getByRole("option", { name: "PACK", exact: true }).click();
    await page.getByTestId("rate-import-file").setInputFiles({
      name: "scoped-rate.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("Zone wise Rate\nService,Weight,8\nTEST_RATE_SCOPE,0.5,15\n"),
    });
    await chooseFormat(page, "Zone Rate");
    await page.getByTestId("rate-import-check").click();
    await expect(page.getByTestId("rate-import-row")).toContainText("PACK");
    await page.getByTestId("rate-import-confirm").click();
    await page.getByTestId("rate-import-apply").click();
    await expect(page.getByTestId("rate-import-result")).toContainText("Imported 1");

    const { data, error } = await dbAdmin
      .from("zone_rate_prices")
      .select("amount, customer_id, origin_destination_id, product_id, zone_id, country_id")
      .eq("service", "TEST_RATE_SCOPE")
      .is("deleted_at", null);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(Number(data?.[0]?.amount)).toBe(15);
    expect(data?.[0]?.customer_id).toBeTruthy();
    expect(data?.[0]?.origin_destination_id).toBeTruthy();
    expect(data?.[0]?.product_id).toBeTruthy();
    expect(data?.[0]?.zone_id).toBeTruthy();
    expect(data?.[0]?.country_id).toBeNull();
  } finally {
    await removeTestRateGrid();
  }
});

test("rate import job queue opens rate update with the vendor", async ({ page }) => {
  await page.goto("/utility/rate-zone-update/rate-import");
  await page.getByRole("button", { name: "Vendor", exact: true }).click();
  await pickUps(page);
  await page.getByTestId("rate-import-queue-link").click();
  await expect(page).toHaveURL(/rate-update/);
  await expect(page.getByTestId("rate-update-vendor").getByRole("combobox", { name: "Code" })).toHaveValue("UPS");
});

test("zone update no longer rewrites booked shipments", async ({ page }) => {
  await page.goto("/utility/rate-zone-update/zone-update");
  await expect(page.getByRole("button", { name: "Update Shipments" })).toHaveCount(0);
  await expect(page.getByText("Recalculate Rating After Zone Update")).toHaveCount(0);
  await expect(page.getByText("Add to Job Queue")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Import" })).toBeVisible();
});
