import { expect, test } from "@playwright/test";

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

test("zone update no longer rewrites booked shipments", async ({ page }) => {
  await page.goto("/utility/rate-zone-update/zone-update");
  await expect(page.getByRole("button", { name: "Update Shipments" })).toHaveCount(0);
  await expect(page.getByText("Recalculate Rating After Zone Update")).toHaveCount(0);
  await expect(page.getByText("Add to Job Queue")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Import" })).toBeVisible();
});
