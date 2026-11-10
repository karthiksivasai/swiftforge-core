import { test, expect } from '@playwright/test';

test.describe('AWB Entry Initial Screen Test', () => {
  test('First test: click Next on the AWB tab and report the result', async ({ page }) => {
    // 1. Open AWB Entry form
    await page.goto('/transaction/awb-entry?view=form');
    await page.waitForLoadState('networkidle');

    // Hard-refresh
    await page.reload({ waitUntil: 'networkidle' });

    // Verify user chip is Karthik Test Admin
    await expect(page.locator('text=Karthik Test Admin')).toBeVisible();

    // Verify initial active tab is AWB
    const awbTab = page.locator('button[role="tab"]:has-text("AWB")');
    const proformaTab = page.locator('button[role="tab"]:has-text("Proforma")');
    await expect(awbTab).toHaveAttribute('data-state', 'active');

    // Fill Reference field
    const referenceInput = page.locator('input[data-erp-nav-order="40"]');
    await referenceInput.fill('TEST_NEXT_CHECK');

    // Note AWB number before clicking Next (should be "AUTO" or empty)
    const awbNoInput = page.locator('input[data-erp-nav-order="10"]');
    const awbNoBefore = await awbNoInput.inputValue();

    // Click Next button
    const nextBtn = page.locator('button:has-text("Next")');
    await nextBtn.click();
    await page.waitForTimeout(500);

    // Verify active tab switched to Proforma
    await expect(proformaTab).toHaveAttribute('data-state', 'active');

    // Click back to AWB tab to inspect the fields
    await awbTab.click();
    await page.waitForTimeout(300);

    // Verify no AWB number was assigned (stays same as before)
    const awbNoAfter = await awbNoInput.inputValue();
    expect(awbNoAfter).toBe(awbNoBefore);

    // Verify form was NOT cleared: Reference input still has TEST_NEXT_CHECK
    await expect(referenceInput).toHaveValue('TEST_NEXT_CHECK');
  });
});
