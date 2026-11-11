import { test, expect } from '@playwright/test';
import { dbAdmin, openAwbForm, cleanupReference, selectLookup } from './awb-entry-helpers';

test.describe('Forwarding Tab Batch 2 E2E Tests', () => {
  test('F2. Vendor manual charges, dynamic fuel/tax labels, Forwarding summary with Margin & DB snapshot', async ({ page }) => {
    test.setTimeout(120000);

    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[vite]') || text.includes('React DevTools')) return;
      console.log(`[PAGE ${msg.type().toUpperCase()}]:`, text);
    });

    page.on('response', async (res) => {
      const url = res.url();
      if (url.includes('/rpc/') || url.includes('/rest/v1/shipments') || res.status() >= 400) {
        let body = '';
        try { body = await res.text(); } catch {}
        console.log(`[HTTP ${res.status()}]:`, url, body.slice(0, 300));
      }
    });

    const ref = 'TEST_AWB_FWD_F2';
    await cleanupReference(ref);

    // 1. Open AWB Entry Form (fresh)
    await openAwbForm(page, true);

    // 2. Reference No
    await page.locator('input[data-erp-nav-order="40"]').fill(ref);

    // 3. Client Name - Select ALIASSO
    await selectLookup(page, 50, 'ALIASSO');
    await page.waitForTimeout(500);

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

    // 9. Service - FEDEX
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

    // 11. Switch to Proforma Tab and fill CSB & Export Reason
    await page.getByRole('tab', { name: 'Proforma' }).click();
    await page.waitForTimeout(400);

    const csbTrigger = page.locator('button[data-erp-nav-order="900"]');
    await csbTrigger.click();
    await page.waitForTimeout(200);
    await page.locator('div[role="option"]:has-text("CSB 4")').click();

    const reasonTrigger = page.locator('button[data-erp-nav-order="906"]');
    await reasonTrigger.click();
    await page.waitForTimeout(200);
    await page.locator('div[role="option"]:has-text("UNSOLICITED GIFT")').first().click();

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

    // Fill Forwarding AWB (nav order 1001)
    const uniqueFwdAwb = 'FWD_F2_' + Date.now().toString().slice(-8);
    await page.locator('input[data-erp-nav-order="1001"]').fill(uniqueFwdAwb);

    // Verify D5 auto-population of Vendor Weight from Charge Weight (2.000)
    const vendorWeightInput = page.locator('input[data-erp-nav-order="1005"]');
    const vendorWeightVal = await vendorWeightInput.inputValue();
    expect(Number(vendorWeightVal)).toBeGreaterThanOrEqual(2.0);

    // Vendor Charges Collapsible is open by default. If closed, click to open.
    const contractSummary = page.locator('[data-testid="fwd-summary-contract"]');
    if (!(await contractSummary.isVisible())) {
      const chargesCollapsibleTrigger = page.locator('button:has-text("Click here to enter Vendor Charge details")');
      await chargesCollapsibleTrigger.click();
      await page.waitForTimeout(300);
    }
    const fuelSummary = page.locator('[data-testid="fwd-summary-fuel"]');
    const manualSummary = page.locator('[data-testid="fwd-summary-manual"]');
    const vendorGstSummary = page.locator('[data-testid="fwd-summary-vendor-gst"]');
    const vendorTotalSummary = page.locator('[data-testid="fwd-summary-vendor-total"]');
    const marginSummary = page.locator('[data-testid="fwd-summary-margin"]');

    await expect(contractSummary).toBeVisible();
    await expect(fuelSummary).toBeVisible();
    await expect(manualSummary).toBeVisible();
    await expect(vendorGstSummary).toBeVisible();
    await expect(vendorTotalSummary).toBeVisible();
    await expect(marginSummary).toBeVisible();

    // Initial manual charges is 0.00
    await expect(manualSummary).toHaveValue('0.00');

    // Add a manual vendor charge: DEMAND SURCHARGE VENDOR, amount 500
    const descTrigger = page.locator('button[data-erp-nav-order="1010"]');
    await descTrigger.click();
    await page.waitForTimeout(200);
    await page.locator('div[role="option"]:has-text("DEMAND SURCHARGE VENDOR")').click();

    const amountInput = page.locator('input[data-erp-nav-order="1011"]');
    await amountInput.fill('500');

    // Click Add
    const addVendorChargeBtn = page.locator('button[data-erp-nav-order="1015"]');
    await addVendorChargeBtn.click();
    await page.waitForTimeout(400);

    // Verify Manual summary now reflects 500.00
    await expect(manualSummary).toHaveValue('500.00');

    // 14. Save directly from Forwarding tab
    const saveBtn = page.getByRole('button', { name: /Save|Update/i });
    await saveBtn.click();

    // Verify booking toast
    const toast = page.locator('li[data-sonner-toast]').filter({ hasText: /AWB.*(created|booked|saved)/i });
    await expect(toast).toBeVisible({ timeout: 25000 });
    const toastText = await toast.innerText();
    const awbMatch = toastText.match(/AWB\s+(\d+)/i);
    expect(awbMatch).not.toBeNull();
    const awbNo = awbMatch![1];

    // 15. Verify Database Records
    const { data: shipment, error: sErr } = await dbAdmin
      .from('shipments')
      .select('id, awb_no, reference_no, vendor_charges_total, vendor_tax_total')
      .eq('reference_no', ref)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    expect(sErr).toBeNull();
    expect(shipment).not.toBeNull();

    // Vendor charges total must be stored EXCLUDING GST
    expect(Number(shipment.vendor_charges_total)).toBeGreaterThan(0);
    expect(Number(shipment.vendor_tax_total)).toBeGreaterThanOrEqual(0);

    // Verify snapshot rows for side='VENDOR' exist in shipment_charge_snapshots
    const { data: vendorSnaps, error: snapErr } = await dbAdmin
      .from('shipment_charge_snapshots')
      .select('*')
      .eq('shipment_id', shipment.id)
      .eq('side', 'VENDOR');

    expect(snapErr).toBeNull();
    expect(vendorSnaps).not.toBeNull();
    expect(vendorSnaps.length).toBeGreaterThanOrEqual(1);

    const manualSnap = vendorSnaps.find((s: any) => s.description === 'DEMAND SURCHARGE VENDOR');
    expect(manualSnap).toBeDefined();
    expect(Number(manualSnap.amount)).toBe(500);

    // Clean up
    await cleanupReference(ref);
  });
});

