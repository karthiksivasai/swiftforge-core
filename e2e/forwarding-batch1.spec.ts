import { test, expect } from '@playwright/test';
import { dbAdmin, openAwbForm, cleanupReference, selectLookup, openAndReadInvoice } from './awb-entry-helpers';

test.describe('Forwarding Tab Batch 1 E2E Tests', () => {
  test('F1. Counter booking with Forwarding AWB, Delivery Service & Save from Forwarding tab', async ({ page }) => {
    const ref = 'TEST_AWB_FWD_F1';
    await cleanupReference(ref);

    // 1. Open AWB Entry Form (fresh)
    await openAwbForm(page, true);

    // 2. Reference No
    await page.locator('input[data-erp-nav-order="40"]').fill(ref);

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

    // 9. Service - select FEDEX
    const serviceInput = page.locator('input[data-erp-nav-order="530"]');
    if (await serviceInput.isVisible()) {
      await selectLookup(page, 530, 'FEDEX');
    }

    // 10. Pieces: 1 box 30x20x15 cm, 2.0 kg
    await page.locator('input[data-erp-nav-order="616"]').fill('2.0');
    await page.locator('input[data-erp-nav-order="617"]').fill('1');
    await page.locator('input[data-erp-nav-order="618"]').fill('30');
    await page.locator('input[data-erp-nav-order="619"]').fill('20');
    await page.locator('input[data-erp-nav-order="620"]').fill('15');
    await page.locator('button[data-erp-nav-skip=""]:has-text("Add")').first().click();
    await page.waitForTimeout(500);

    // 11. Switch to Proforma Tab and fill CSB, Export Reason and add line
    await page.getByRole('tab', { name: 'Proforma' }).click();
    await page.waitForTimeout(400);

    // CSB 4
    const csbTrigger = page.locator('button[data-erp-nav-order="900"]');
    await csbTrigger.click();
    await page.waitForTimeout(200);
    await page.locator('div[role="option"]:has-text("CSB 4")').click();

    // UNSOLICITED GIFT
    const reasonTrigger = page.locator('button[data-erp-nav-order="906"]');
    await reasonTrigger.click();
    await page.waitForTimeout(200);
    await page.locator('div[role="option"]:has-text("UNSOLICITED GIFT")').first().click();

    // Add Proforma Line
    await page.locator('input[data-erp-nav-order="922"]').fill('Cotton Shirts');
    await page.locator('input[data-erp-nav-order="923"]').fill('6205');
    await page.locator('input[data-erp-nav-order="924"]').fill('1');
    await page.locator('input[data-erp-nav-order="927"]').fill('500');
    await page.getByRole('button', { name: 'Add line' }).click();
    await page.waitForTimeout(500);

    // 12. Switch to AWB Tab to fill Payment
    await page.getByRole('tab', { name: 'AWB' }).click();
    await page.waitForTimeout(400);

    const paymentTrigger = page.locator('button[data-erp-nav-order="700"]');
    await paymentTrigger.click();
    await page.waitForTimeout(200);
    await page.locator('div[role="option"]:has-text("Credit")').first().click();

    // 13. Switch to Forwarding Tab
    await page.getByRole('tab', { name: 'Forwarding' }).click();
    await page.waitForTimeout(400);

    // FW-01: Verify Delivery Vendor defaults/mirrors Vendor
    const deliveryVendorInput = page.locator('input[data-erp-nav-order="1003"]').first();
    await expect(deliveryVendorInput).toHaveValue(/FEDE|FEDEX/i);

    // Fill Forwarding fields
    const uniqueFwdAwb = `7946${Date.now().toString().slice(-8)}`;
    await page.locator('input[data-erp-nav-order="1000"]').fill('TEST_DEL_101');
    await page.locator('input[data-erp-nav-order="1001"]').fill(uniqueFwdAwb);
    await page.locator('input[data-erp-nav-order="1005"]').fill('2.0');

    // 14. Save directly from Forwarding tab
    const saveBtn = page.getByRole('button', { name: /Save|Update/i });
    await saveBtn.click();

    // Verify booking toast
    const toast = page.locator('li[data-sonner-toast]').filter({ hasText: /AWB.*(created|booked|saved)/i });
    await expect(toast).toBeVisible({ timeout: 15000 });
    const toastText = await toast.innerText();
    const awbMatch = toastText.match(/AWB\s+(\d+)/i);
    expect(awbMatch).not.toBeNull();
    const awbNo = awbMatch![1];

    // 15. Database parity check (using reference_no and explicit foreign key to satisfy FW-11)
    const { data: dbShipment, error: dbErr } = await dbAdmin
      .from('shipments')
      .select('id, awb_no, reference_no, forwarding_awb, delivery_awb, delivery_service, vendors!shipments_vendor_fk(code)')
      .eq('reference_no', ref)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    expect(dbErr).toBeNull();
    expect(dbShipment).not.toBeNull();
    expect(dbShipment.forwarding_awb).toBe(uniqueFwdAwb);
    expect(dbShipment.delivery_awb).toBe('TEST_DEL_101');
    expect(dbShipment.awb_no).toBe(awbNo);

    // 16. Printed document parity check (switch to AWB tab where document center is located)
    await page.getByRole('tab', { name: 'AWB' }).click();
    await page.waitForTimeout(500);
    const { text: invoiceText } = await openAndReadInvoice(page);
    expect(invoiceText).toContain(uniqueFwdAwb);
    expect(invoiceText).toContain('TEST_DEL_101');
  });

  test('FW-12 / F7. Blocks duplicate Forwarding AWB for the same vendor', async ({ page }) => {
    // 1. Pick an existing shipment with FEDEX vendor that has a forwarding number
    const { data: existing } = await dbAdmin
      .from('shipments')
      .select('awb_no, vendor_id, forwarding_awb, vendors!shipments_vendor_fk(code)')
      .eq('reference_no', 'TEST_AWB_FWD_F1')
      .not('forwarding_awb', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    expect(existing).not.toBeNull();
    expect(existing?.forwarding_awb).toBeTruthy();

    const dupRef = 'TEST_AWB_FWD_DUP';
    await cleanupReference(dupRef);

    // 2. Open fresh AWB Entry Form
    await openAwbForm(page, true);

    // Fill minimum required fields
    await page.locator('input[data-erp-nav-order="40"]').fill(dupRef);
    await selectLookup(page, 50, 'ALIASSO');

    await page.locator('input[data-erp-nav-order="110"]').fill('Lakshmi');
    await page.locator('input[data-erp-nav-order="120"]').fill('Lakshmi');
    await page.locator('input[data-erp-nav-order="130"]').fill('Banjara Hills Rd 12');
    await page.locator('input[data-erp-nav-order="150"]').fill('500034');
    await page.locator('input[data-erp-nav-order="160"]').fill('Hyderabad');
    await page.locator('input[data-erp-nav-order="170"]').fill('Telangana');
    await page.locator('input[data-erp-nav-order="190"]').fill('9876543210');

    await selectLookup(page, 300, 'USA');
    await page.locator('input[data-erp-nav-order="310"]').fill('Rahul');
    await page.locator('input[data-erp-nav-order="320"]').fill('Rahul');
    await page.locator('input[data-erp-nav-order="330"]').fill('123 Main St');
    await page.locator('input[data-erp-nav-order="350"]').fill('10001');
    await page.locator('input[data-erp-nav-order="360"]').fill('New York');
    await page.locator('input[data-erp-nav-order="370"]').fill('NY');
    await page.locator('input[data-erp-nav-order="390"]').fill('1234567890');

    await selectLookup(page, 500, 'NDOX');
    await selectLookup(page, 510, 'FEDEX');

    const serviceInput = page.locator('input[data-erp-nav-order="530"]');
    if (await serviceInput.isVisible()) {
      await selectLookup(page, 530, 'FEDEX');
    }

    await page.locator('input[data-erp-nav-order="616"]').fill('1.0');
    await page.locator('input[data-erp-nav-order="617"]').fill('1');
    await page.locator('input[data-erp-nav-order="618"]').fill('10');
    await page.locator('input[data-erp-nav-order="619"]').fill('10');
    await page.locator('input[data-erp-nav-order="620"]').fill('10');
    await page.locator('button[data-erp-nav-skip=""]:has-text("Add")').first().click();
    await page.waitForTimeout(300);

    // Switch to Proforma tab and fill CSB, Export Reason and add line
    await page.getByRole('tab', { name: 'Proforma' }).click();
    await page.waitForTimeout(300);

    const csbTrigger = page.locator('button[data-erp-nav-order="900"]');
    await csbTrigger.click();
    await page.waitForTimeout(200);
    await page.locator('div[role="option"]:has-text("CSB 4")').click();

    const reasonTrigger = page.locator('button[data-erp-nav-order="906"]');
    await reasonTrigger.click();
    await page.waitForTimeout(200);
    await page.locator('div[role="option"]:has-text("UNSOLICITED GIFT")').first().click();

    await page.locator('input[data-erp-nav-order="922"]').fill('Sample');
    await page.locator('input[data-erp-nav-order="923"]').fill('6205');
    await page.locator('input[data-erp-nav-order="924"]').fill('1');
    await page.locator('input[data-erp-nav-order="927"]').fill('100');
    await page.getByRole('button', { name: 'Add line' }).click();
    await page.waitForTimeout(300);

    // Switch to AWB Tab to fill Payment
    await page.getByRole('tab', { name: 'AWB' }).click();
    await page.waitForTimeout(300);

    const paymentTrigger = page.locator('button[data-erp-nav-order="700"]');
    await paymentTrigger.click();
    await page.waitForTimeout(200);
    await page.locator('div[role="option"]:has-text("Credit")').first().click();

    // Switch to Forwarding tab and enter the DUPLICATE Forwarding AWB
    await page.getByRole('tab', { name: 'Forwarding' }).click();
    await page.waitForTimeout(300);
    await page.locator('input[data-erp-nav-order="1001"]').fill(existing!.forwarding_awb);

    // Click Save
    const saveBtn = page.getByRole('button', { name: /Save|Update/i });
    await saveBtn.click();

    // Verify error toast or banner blocking duplicate forwarding number
    const errIndicator = page.locator('li[data-sonner-toast], [role="alert"]').filter({ hasText: /already in use for this vendor/i });
    await expect(errIndicator.first()).toBeVisible({ timeout: 10000 });
  });

  test('FW-13 / F6. Locked shipment Forwarding tab is read-only', async ({ page }) => {
    // 1. Find a locked shipment
    const { data: locked } = await dbAdmin
      .from('shipments')
      .select('awb_no')
      .eq('is_locked', true)
      .limit(1)
      .single();

    if (!locked) return;

    // 2. Open AWB Entry Form
    await openAwbForm(page, false);

    // 3. Search and open the locked shipment via Top Toolbar
    const searchInput = page.locator('input[aria-label="AWB No"]').first();
    await searchInput.fill(locked.awb_no);
    await page.locator('button[aria-label="Search AWB"]').first().click();
    await page.waitForTimeout(2000);

    // 4. Switch to Forwarding tab
    await page.getByRole('tab', { name: 'Forwarding' }).click();
    await page.waitForTimeout(500);

    // 5. Verify the Forwarding inputs are disabled inside the disabled fieldset
    const deliveryAwbInput = page.locator('input[data-erp-nav-order="1000"]').first();
    await expect(deliveryAwbInput).toBeDisabled();

    // 6. Verify Save/Update button in footer is disabled
    const saveOrUpdateBtn = page.getByRole('button', { name: /Save|Update/i }).first();
    await expect(saveOrUpdateBtn).toBeDisabled();
  });
});
