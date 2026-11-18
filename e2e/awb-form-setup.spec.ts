import { expect, test } from "@playwright/test";

import { openAwbForm } from "./awb-entry-helpers";

test.describe("AWB Form Setup", () => {
  test("saves, survives refresh, and shows the same settings in a second browser", async ({ page, browser }) => {
    await openAwbForm(page, true);
    await page.getByRole("button", { name: "Form Setup" }).click();
    const content = page.locator("label", { hasText: "Content Repeat" });
    const checkbox = page.locator("#awbSetup-contentRepeat");
    await expect(content).toBeVisible();
    const wasChecked = await checkbox.isChecked();
    await checkbox.click();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Form setup saved")).toBeVisible();

    await page.reload();
    await expect(page.getByText("Karthik Test Admin")).toBeVisible();
    await page.getByRole("button", { name: "Form Setup" }).click();
    await expect(checkbox).toBeChecked({ checked: !wasChecked });

    const second = await browser.newContext({ storageState: "e2e/.auth/user.json" });
    const other = await second.newPage();
    await openAwbForm(other, true);
    await other.getByRole("button", { name: "Form Setup" }).click();
    await expect(other.locator("#awbSetup-contentRepeat")).toBeChecked({ checked: !wasChecked });
    await second.close();

    await checkbox.click();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Form setup saved")).toBeVisible();
  });

  test("Cancel discards an unsaved checkbox", async ({ page }) => {
    await openAwbForm(page, true);
    await page.getByRole("button", { name: "Form Setup" }).click();
    const checkbox = page.locator("#awbSetup-instructionRepeat");
    const before = await checkbox.isChecked();
    await checkbox.click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Form Setup" }).click();
    await expect(checkbox).toBeChecked({ checked: before });
  });
});
