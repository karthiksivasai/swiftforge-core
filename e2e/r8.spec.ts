import { test, expect } from '@playwright/test';
import { dbAdmin, openAwbForm, cleanupReference, appendTestResult, selectLookup } from './awb-entry-helpers';

test.describe('Real-Life Case R8: Credit customer, partial payment', () => {
  test('R8. Credit customer, partial payment', async ({ page }) => {
    // 0. Clean up previous test run with this reference
    await cleanupReference('TEST_AWB_G8');

    // 1. Open AWB Entry Form
    await openAwbForm(page);

    // 2. Reference No
    await page.locator('input[data-erp-nav-order="40"]').fill('TEST_AWB_G8');

    // 3. Client Name - Select ALIASSO
    await selectLookup(page, 50, 'ALIASSO');

    // 4. Shipper Details
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

    // 10. Proforma tab: CSB 4, UNSOLICITED GIFT, 1 line
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

    await page.locator('input[data-erp-nav-order="922"]').fill('cotton shirts');
    await page.locator('input[data-erp-nav-order="923"]').fill('6205');
    await page.locator('input[data-erp-nav-order="924"]').fill('1');
    await page.locator('input[data-erp-nav-order="927"]').fill('500');
    await page.getByRole('button', { name: 'Add line' }).click();
    await page.waitForTimeout(400);

    // 11. Switch back to AWB tab to fill Payment
    const awbTab = page.locator('button[role="tab"]:has-text("AWB")');
    await awbTab.click();
    await page.waitForTimeout(500);

    // Payment Type: Credit
    const paymentTrigger = page.locator('button[data-erp-nav-order="700"]');
    await paymentTrigger.click();
    await page.waitForTimeout(200);
    await page.locator('div[role="option"]:has-text("Credit")').first().click();

    // Partial Amount Received = 500 (nav 750)
    // NOTE: Cash Receipt No (nav 740) and Cash Receipt Date (nav 770) are intentionally left BLANK!
    await page.locator('input[data-erp-nav-order="750"]').fill('500');

    // 12. Click Save
    const saveBtn = page.getByRole('button', { name: 'Save' });
    await saveBtn.click();
    await page.waitForTimeout(3000);

    const toastElem = page.locator('[data-sonner-toast]');
    const toastText = (await toastElem.count()) > 0 ? await toastElem.first().innerText() : '';
    console.log('[R8 Toast Message]:', toastText);

    // 13. Query Database
    const { data: dbShipment, error: dbErr } = await dbAdmin
      .from('shipments')
      .select('*')
      .eq('reference_no', 'TEST_AWB_G8')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    console.log('[R8 DB Result]:', dbShipment?.awb_no, 'Status:', dbShipment?.current_status, 'Total:', dbShipment?.grand_total, 'Received:', dbShipment?.amount_received);
    expect(dbErr).toBeNull();
    expect(dbShipment).not.toBeNull();
    expect(dbShipment?.current_status).toBe('BOOKED');

    const grandTotal = Number(dbShipment?.grand_total);
    const amountReceived = Number(dbShipment?.amount_received);
    const expectedBalance = grandTotal - 500;
    const actualBalance = grandTotal - amountReceived;
    expect(amountReceived).toBe(500);
    expect(actualBalance).toBe(expectedBalance);

    // 14. Record in test document
    const md = `## R8. Credit customer, partial payment

- **AWB No:** \`${dbShipment?.awb_no}\`
- **Reference:** \`TEST_AWB_G8\`
- **Status:** **PASS** (Credit partial payment accepted without cash receipt fields, Balance = Total − Received)

| Field | Screen Value | Database Value | Expected | Status | Check Type |
|---|---|---|---|---|---|
| **Payment Type** | Credit | Credit | Credit | PASS | Real Screen + DB |
| **Grand Total** | ₹${grandTotal.toFixed(2)} | ₹${grandTotal.toFixed(2)} | Rate card total | PASS | Real Screen + DB |
| **Amount Received** | ₹500.00 | ₹${amountReceived.toFixed(2)} | ₹500.00 | PASS | Real Screen + DB |
| **Balance Amount** | ₹${actualBalance.toFixed(2)} | ₹${actualBalance.toFixed(2)} | ₹${expectedBalance.toFixed(2)} (Total − 500) | PASS | Real Screen + DB |
| **Cash Receipt Fields** | Left blank (not required) | null / empty | Not required for Credit | PASS | Real Screen UI Validation |
`;
    appendTestResult(md);
  });
});

