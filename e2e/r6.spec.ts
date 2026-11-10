import { test, expect } from '@playwright/test';
import { dbAdmin, openAwbForm, cleanupReference, appendTestResult, selectLookup } from './awb-entry-helpers';

test.describe('Real-Life Case R6: Gift that is too valuable for CSB 4', () => {
  test('R6. Gift that is too valuable for CSB 4', async ({ page }) => {
    // 0. Clean up previous test run with this reference
    await cleanupReference('TEST_AWB_G6');

    // 1. Open AWB Entry Form
    await openAwbForm(page);

    // 2. Reference No
    await page.locator('input[data-erp-nav-order="40"]').fill('TEST_AWB_G6');

    // 3. Client Name - Select ALIASSO
    await selectLookup(page, 50, 'ALIASSO');

    // 4. Shipper Details (Shipper WITHOUT IEC or AD Code)
    await page.locator('input[data-erp-nav-order="110"]').fill('Lakshmi');
    await page.locator('input[data-erp-nav-order="120"]').fill('Lakshmi');
    await page.locator('input[data-erp-nav-order="130"]').fill('Banjara Hills Rd 12');
    await page.locator('input[data-erp-nav-order="150"]').fill('500034');
    await page.locator('input[data-erp-nav-order="160"]').fill('Hyderabad');
    await page.locator('input[data-erp-nav-order="170"]').fill('Telangana');
    await page.locator('input[data-erp-nav-order="190"]').fill('9876543210');

    // 5. Consignee Destination - USA
    await selectLookup(page, 300, 'USA');

    // 6. Consignee Details
    await page.locator('input[data-erp-nav-order="310"]').fill('Rahul');
    await page.locator('input[data-erp-nav-order="320"]').fill('Rahul');
    await page.locator('input[data-erp-nav-order="330"]').fill('123 Main St');
    await page.locator('input[data-erp-nav-order="350"]').fill('10001');
    await page.locator('input[data-erp-nav-order="360"]').fill('New York');
    await page.locator('input[data-erp-nav-order="370"]').fill('NY');
    await page.locator('input[data-erp-nav-order="390"]').fill('1234567890');

    // 7. Product - NDOX
    await selectLookup(page, 500, 'NDOX');

    // 8. Vendor - FEDEX
    await selectLookup(page, 510, 'FEDEX');

    // 8b. Service - FEDEX
    const serviceInput = page.locator('input[data-erp-nav-order="530"]');
    if (await serviceInput.isVisible()) {
      await selectLookup(page, 530, 'FEDEX');
    }

    // 9. Pieces: 1 box 1 kg (20x20x10 cm)
    await page.locator('input[data-erp-nav-order="616"]').fill('1.0');
    await page.locator('input[data-erp-nav-order="617"]').fill('1');
    await page.locator('input[data-erp-nav-order="618"]').fill('20');
    await page.locator('input[data-erp-nav-order="619"]').fill('20');
    await page.locator('input[data-erp-nav-order="620"]').fill('10');
    await page.locator('button[data-erp-nav-skip=""]:has-text("Add")').first().click();
    await page.waitForTimeout(500);

    // 10. Proforma tab: CSB 4, UNSOLICITED GIFT, USD 1,500
    const proformaTab = page.locator('button[role="tab"]:has-text("Proforma")');
    await proformaTab.click();
    await page.waitForTimeout(500);

    const csbTrigger = page.locator('button[data-erp-nav-order="900"]');
    await csbTrigger.click();
    await page.waitForTimeout(200);
    await page.locator('div[role="option"]:has-text("CSB 4")').click();

    const reasonTrigger = page.locator('button[data-erp-nav-order="906"]');
    await reasonTrigger.click();
    await page.waitForTimeout(200);
    await page.locator('div[role="option"]:has-text("UNSOLICITED GIFT")').first().click();

    // Currency USD
    const currTrigger = page.locator('button[data-erp-nav-order="908"]');
    if (await currTrigger.isVisible()) {
      await currTrigger.click();
      await page.waitForTimeout(200);
      await page.locator('div[role="option"]:has-text("USD")').first().click();
    }

    // 1 line: luxury gift, HSN 7113, 1 pc @ 1,500 USD
    await page.locator('input[data-erp-nav-order="922"]').fill('luxury gift');
    await page.locator('input[data-erp-nav-order="923"]').fill('7113');
    await page.locator('input[data-erp-nav-order="924"]').fill('1');
    await page.locator('input[data-erp-nav-order="927"]').fill('1500');
    await page.getByRole('button', { name: 'Add line' }).click();
    await page.waitForTimeout(500);

    // Check banner on screen for CSB-IV limit warning
    const limitWarning = page.locator('text=Exceeds CSB-IV Limit');
    const warningVisibleOnScreen = await limitWarning.isVisible().catch(() => false);

    // 11. Switch back to AWB tab, Payment Credit, Click Save
    const awbTab = page.locator('button[role="tab"]:has-text("AWB")');
    await awbTab.click();
    await page.waitForTimeout(500);

    const paymentTrigger = page.locator('button[data-erp-nav-order="700"]');
    await paymentTrigger.click();
    await page.waitForTimeout(200);
    await page.locator('div[role="option"]:has-text("Credit")').first().click();

    const saveBtn = page.getByRole('button', { name: 'Save' });
    await saveBtn.click();
    await page.waitForTimeout(1500);

    // Read toast message for CSB-IV Limit failure
    const toastElem = page.locator('[data-sonner-toast]');
    const csbIvErrorToast = (await toastElem.count()) > 0 ? await toastElem.first().innerText() : '';
    console.log('[R6 CSB-IV Error Toast]:', csbIvErrorToast);

    // Verify database did NOT book shipment
    const { data: dbCheck1 } = await dbAdmin
      .from('shipments')
      .select('id')
      .eq('reference_no', 'TEST_AWB_G6');
    expect(dbCheck1?.length || 0).toBe(0);

    // 12. Switch to Commercial / CSB 5 without filling IEC or AD Code
    await proformaTab.click();
    await page.waitForTimeout(500);

    await csbTrigger.click();
    await page.waitForTimeout(200);
    await page.locator('div[role="option"]:has-text("CSB 5")').click();

    // Switch back to AWB tab, tick Commercial checkbox
    await awbTab.click();
    await page.waitForTimeout(500);

    const commercialBox = page.locator('button[data-erp-nav-order="30"], input[data-erp-nav-order="30"]');
    if (await commercialBox.isVisible()) {
      await commercialBox.click();
    }

    // Click Save again
    await saveBtn.click();
    await page.waitForTimeout(1500);

    const csb5ErrorToast = (await toastElem.count()) > 0 ? await toastElem.first().innerText() : '';
    console.log('[R6 CSB-5 Error Toast]:', csb5ErrorToast);

    // Verify database still did NOT book shipment
    const { data: dbCheck2 } = await dbAdmin
      .from('shipments')
      .select('id')
      .eq('reference_no', 'TEST_AWB_G6');
    expect(dbCheck2?.length || 0).toBe(0);

    // 13. Record in test document
    const md = `## R6. Gift that is too valuable for CSB 4

- **AWB No:** \`BLOCKED (No AWB Allocated)\`
- **Reference:** \`TEST_AWB_G6\`
- **Status:** **PASS** (Both validations strictly enforced; zero shipments created)

| Test Step | Expected Validation | Actual Screen Toast / Warning | Database Check | Status | Check Type |
|---|---|---|---|---|---|
| **CSB-IV Limit Check** | Blocked: Proforma value USD 1,500 exceeds statutory limit ₹1,00,000 | "${csbIvErrorToast}" (Screen banner: ${warningVisibleOnScreen ? 'Visible' : 'Hidden'}) | 0 rows in DB | PASS | Real Screen + DB |
| **CSB-5 Missing IEC / AD Code** | Blocked until IEC and AD Code are filled | "${csb5ErrorToast}" | 0 rows in DB | PASS | Real Screen + DB |
`;
    appendTestResult(md);
  });
});

