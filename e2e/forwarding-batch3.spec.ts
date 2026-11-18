import { test, expect } from '@playwright/test';
import { dbAdmin, openAwbForm, cleanupReference, selectLookup, openAndReadInvoice } from './awb-entry-helpers';

test.describe('Forwarding Tab Batch 3 E2E Tests (FW-07, FW-09, FW-10, D6, F2, F3, F5, F7, F8)', () => {
  test('F2. Blank Forwarding at booking (D1), FW-10 collapsible tab order, and FW-09 master charges', async ({ page }) => {
    test.setTimeout(120000);

    const ref = 'TEST_AWB_FWD_F2_BLANK';
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
    await page.waitForTimeout(400);

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
    await page.waitForTimeout(400);

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

    // FW-10: Verify the collapsible accordion trigger is tab-accessible
    const trigger = page.locator('[data-testid="fwd-collapsible-trigger"]');
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute('tabindex', '0');

    // FW-09: Ensure collapsible is open, then verify charge master descriptions (side in VENDOR, BOTH)
    const descSelect = page.locator('button[data-erp-nav-order="1010"]');
    if (!(await descSelect.isVisible())) {
      await trigger.click();
      await page.waitForTimeout(300);
    }
    await descSelect.click();
    await page.waitForTimeout(300);

    // Verify vendor charge master items are rendered as options
    const vendorChargeOptions = page.locator('div[role="option"]');
    const optionTexts: string[] = [];
    const count = await vendorChargeOptions.count();
    for (let i = 0; i < count; i++) {
      optionTexts.push((await vendorChargeOptions.nth(i).innerText()).trim());
    }
    expect(optionTexts.some((t) => t.includes('COVID CHARGE VENDOR') || t.includes('COVID') || t.includes('DEMAND') || t.includes('GOGREEN'))).toBeTruthy();

    // Close dropdown without selecting
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // D1 / D5: Verify Forwarding AWB and Delivery AWB are left blank; Vendor Weight defaulted from chargeWeight (2.0)
    const fwdInput = page.locator('input[data-erp-nav-order="1001"]');
    const delInput = page.locator('input[data-erp-nav-order="1000"]');
    const weightInput = page.locator('input[data-erp-nav-order="1005"]');

    await expect(fwdInput).toHaveValue('');
    await expect(delInput).toHaveValue('');
    const weightVal = await weightInput.inputValue();
    expect(Number(weightVal)).toBeGreaterThanOrEqual(2.0);

    // 14. Save shipment with blank Forwarding fields (D1: Optional at booking)
    const saveBtn = page.getByRole('button', { name: /Save|Update/i });
    await saveBtn.click();

    const toast = page.locator('li[data-sonner-toast]').filter({ hasText: /AWB.*(created|booked|saved)/i });
    await expect(toast).toBeVisible({ timeout: 30000 });
    const toastText = await toast.innerText();
    const awbMatch = toastText.match(/AWB\s+(\d+)/i);
    expect(awbMatch).not.toBeNull();
    const awbNo = awbMatch![1];

    // 15. Verify Database row: forwarding_awb and delivery_awb are null
    const { data: dbShipment, error: dbErr } = await dbAdmin
      .from('shipments')
      .select('id, awb_no, reference_no, forwarding_awb, delivery_awb')
      .eq('reference_no', ref)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    expect(dbErr).toBeNull();
    expect(dbShipment).not.toBeNull();
    expect(dbShipment.awb_no).toBe(awbNo);
    expect(dbShipment.forwarding_awb).toBeNull();
    expect(dbShipment.delivery_awb).toBeNull();

    // 16. Verify Clean Proforma Invoice Printout (no "undefined" or broken layout)
    await page.getByRole('tab', { name: 'AWB' }).click();
    await page.waitForTimeout(400);
    const { text: invoiceText } = await openAndReadInvoice(page);
    expect(invoiceText).not.toContain('undefined');
    expect(invoiceText).not.toContain('null');
    expect(invoiceText).toContain('Cotton Shirts');
  });

  test('F3. Post-booking assignment: add Forwarding AWB, verify FW-07 reactive sync and FW-14 audit log', async ({ page }) => {
    test.setTimeout(120000);

    // 1. Locate the booked shipment from F2
    const { data: prevShipment } = await dbAdmin
      .from('shipments')
      .select('id, awb_no, reference_no')
      .eq('reference_no', 'TEST_AWB_FWD_F2_BLANK')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    expect(prevShipment).not.toBeNull();

    // 2. Open AWB Entry Form
    await openAwbForm(page, false);

    // 3. Search and load the shipment via form header toolbar
    const searchInput = page.locator('input[aria-label="AWB No"]').first();
    await searchInput.fill(prevShipment.awb_no);
    await page.locator('button[aria-label="Search AWB"]').first().click();
    await page.waitForTimeout(2000);

    // 4. Switch to Forwarding tab
    const forwardingTab = page.locator('button[role="tab"]').filter({ hasText: 'Forwarding' });
    await expect(forwardingTab).toBeVisible();
    await forwardingTab.click();
    await page.waitForTimeout(500);

    // 5. Enter Forwarding AWB and Delivery AWB
    const newFwdAwb = `7946${Date.now().toString().slice(-8)}`;
    const fwdInput = page.locator('input[data-erp-nav-order="1001"]');
    await fwdInput.fill(newFwdAwb);

    // FW-07: Verify that typing in Forwarding AWB updates form state reactively (no wait for Save)
    // The value remains stable when switching tabs without saving
    await page.getByRole('tab', { name: 'AWB' }).click();
    await page.waitForTimeout(300);
    await page.getByRole('tab', { name: 'Forwarding' }).click();
    await page.waitForTimeout(300);
    await expect(page.locator('input[data-erp-nav-order="1001"]')).toHaveValue(newFwdAwb);

    // 6. Save/Update shipment
    const updateBtn = page.getByRole('button', { name: /Save|Update/i });
    await updateBtn.click();

    const toast = page.locator('li[data-sonner-toast]').filter({ hasText: /AWB.*(created|booked|saved|updated)/i });
    await expect(toast).toBeVisible({ timeout: 30000 });

    // 7. Verify Database reflects updated forwarding_awb
    const { data: updatedShipment } = await dbAdmin
      .from('shipments')
      .select('id, awb_no, forwarding_awb')
      .eq('id', prevShipment.id)
      .single();

    expect(updatedShipment.forwarding_awb).toBe(newFwdAwb);

    // 8. FW-14: Verify Audit Trail records old vs new forwarding_awb
    const { data: auditLogs, error: auditErr } = await dbAdmin
      .from('audit_logs')
      .select('action, old_values, new_values, created_at')
      .eq('entity_id', prevShipment.id)
      .order('created_at', { ascending: false })
      .limit(5);

    expect(auditErr).toBeNull();
    expect(auditLogs).toBeDefined();
    expect(auditLogs!.length).toBeGreaterThan(0);

    const fwdAudit = auditLogs!.find((l: any) => l.new_values && l.new_values.forwarding_awb === newFwdAwb);
    expect(fwdAudit).toBeDefined();
  });

  test('D6. Carrier format warning: FedEx (12 digits), DHL (10 digits), and real UPS number (1Z + 16 chars)', async ({ page }) => {
    test.setTimeout(90000);

    // 1. Open AWB Entry Form
    await openAwbForm(page, true);

    // 2. Select Vendor FEDEX
    await selectLookup(page, 510, 'FEDEX');

    // 3. Switch to Forwarding Tab
    await page.getByRole('tab', { name: 'Forwarding' }).click();
    await page.waitForTimeout(400);

    const fwdInput = page.locator('input[data-erp-nav-order="1001"]');
    const warning = page.locator('[data-testid="fwd-format-warning"]');

    // FedEx: invalid 5 digits triggers warning
    await fwdInput.fill('12345');
    await expect(warning).toBeVisible();
    await expect(warning).toContainText('Standard FedEx tracking numbers are 12 digits');

    // FedEx: valid 12 digits hides warning
    await fwdInput.fill('794612345678');
    await expect(warning).not.toBeVisible();

    // Switch Delivery Vendor to DHL
    await selectLookup(page, 1003, 'DHL');
    await page.waitForTimeout(300);

    // DHL: invalid 6 digits triggers warning
    await fwdInput.fill('123456');
    await expect(warning).toBeVisible();
    await expect(warning).toContainText('Standard DHL Express tracking numbers are 10 digits');

    // DHL: valid 10 digits hides warning
    await fwdInput.fill('1234567890');
    await expect(warning).not.toBeVisible();

    // Switch Delivery Vendor to UPS
    await selectLookup(page, 1003, 'UPS');
    await page.waitForTimeout(300);

    // UPS: invalid number triggers warning
    await fwdInput.fill('123456789');
    await expect(warning).toBeVisible();
    await expect(warning).toContainText('Standard UPS tracking numbers start with "1Z"');

    // UPS: real-looking UPS tracking number (1Z + 16 characters = 18 total)
    await fwdInput.fill('1Z12345E0291980793');
    await expect(warning).not.toBeVisible();

    // Verify non-blocking nature: Save button is not disabled by format warning
    await fwdInput.fill('12345');
    await expect(warning).toBeVisible();
    const saveBtn = page.getByRole('button', { name: /Save|Update/i });
    await expect(saveBtn).toBeEnabled();
  });

  test('F5. Delivery Vendor different from AWB Vendor preserves customer price (D8)', async ({ page }) => {
    test.setTimeout(120000);

    const ref = 'TEST_AWB_FWD_F5_VEND';
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

    // 8. Vendor - DHL (Primary Vendor)
    await selectLookup(page, 510, 'DHL');

    // Service - select DHL
    const serviceInput = page.locator('input[data-erp-nav-order="530"]');
    if (await serviceInput.isVisible()) {
      await selectLookup(page, 530, 'DHL');
    }

    // 9. Pieces: 1 box 30x20x15 cm, 2.0 kg
    await page.locator('input[data-erp-nav-order="616"]').fill('2.0');
    await page.locator('input[data-erp-nav-order="617"]').fill('1');
    await page.locator('input[data-erp-nav-order="618"]').fill('30');
    await page.locator('input[data-erp-nav-order="619"]').fill('20');
    await page.locator('input[data-erp-nav-order="620"]').fill('15');
    await page.locator('button[data-erp-nav-skip=""]:has-text("Add")').first().click();
    await page.waitForTimeout(400);

    // 10. Switch to Proforma Tab and fill CSB & Export Reason
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

    await page.locator('input[data-erp-nav-order="922"]').fill('Sample');
    await page.locator('input[data-erp-nav-order="923"]').fill('6205');
    await page.locator('input[data-erp-nav-order="924"]').fill('1');
    await page.locator('input[data-erp-nav-order="927"]').fill('100');
    await page.getByRole('button', { name: 'Add line' }).click();
    await page.waitForTimeout(400);

    // 11. Switch to AWB Tab: select Payment
    await page.getByRole('tab', { name: 'AWB' }).click();
    await page.waitForTimeout(400);

    const paymentTrigger = page.locator('button[data-erp-nav-order="700"]');
    await paymentTrigger.click();
    await page.waitForTimeout(200);
    await page.locator('div[role="option"]:has-text("Credit")').first().click();

    // 12. Switch to Forwarding Tab: override Delivery Vendor to FEDEX
    await page.getByRole('tab', { name: 'Forwarding' }).click();
    await page.waitForTimeout(400);

    await selectLookup(page, 1003, 'FEDEX');
    await page.waitForTimeout(400);

    const uniqueFwd = `7946${Date.now().toString().slice(-8)}`;
    await page.locator('input[data-erp-nav-order="1001"]').fill(uniqueFwd);

    // 13. Save shipment
    const saveBtn = page.getByRole('button', { name: /Save|Update/i });
    await saveBtn.click();

    const toast = page.locator('li[data-sonner-toast]').filter({ hasText: /AWB.*(created|booked|saved)/i });
    await expect(toast).toBeVisible({ timeout: 30000 });
    const toastText = await toast.innerText();
    const awbMatch = toastText.match(/AWB\s+(\d+)/i);
    expect(awbMatch).not.toBeNull();
    const awbNo = awbMatch![1];

    // 14. Verify Database row: vendor is DHL, delivery_vendor is FEDEX, grand_total rated
    const { data: dbShipment, error: dbErr } = await dbAdmin
      .from('shipments')
      .select('id, awb_no, reference_no, forwarding_awb, grand_total, vendor_charges_total, vendors!shipments_vendor_fk(code), delivery_vendor:vendors!shipments_delivery_vendor_fk(code)')
      .eq('awb_no', awbNo)
      .single();

    expect(dbErr).toBeNull();
    expect(dbShipment.vendors.code).toBe('DHL');
    expect(dbShipment.delivery_vendor.code).toMatch(/FEDE|FEDEX/i);
    expect(dbShipment.forwarding_awb).toBe(uniqueFwd);
    expect(Number(dbShipment.grand_total)).toBeGreaterThan(0);
    expect(Number(dbShipment.vendor_charges_total)).toBeGreaterThan(0);
  });

  test('F7. Mistakes tests: empty vendor charge validation and duplicate forwarding number rejection', async ({ page }) => {
    test.setTimeout(90000);

    // 1. Open AWB Entry Form
    await openAwbForm(page, true);

    // 2. Switch to Forwarding Tab
    await page.getByRole('tab', { name: 'Forwarding' }).click();
    await page.waitForTimeout(400);

    // Verify collapsible
    const trigger = page.locator('[data-testid="fwd-collapsible-trigger"]');
    const descSelect = page.locator('button[data-erp-nav-order="1010"]');
    if (!(await descSelect.isVisible())) {
      await trigger.click();
      await page.waitForTimeout(300);
    }

    // Attempt to click Add charge without selecting description or entering amount
    const addChargeBtn = page.getByRole('button', { name: 'Add' }).filter({ has: page.locator('svg') }).last();
    if (await addChargeBtn.isVisible()) {
      await addChargeBtn.click();
      await page.waitForTimeout(300);
      // Verify table displays "No vendor charges added" empty state
      const tbody = page.locator('table').filter({ hasText: 'Description' }).locator('tbody');
      await expect(tbody).toContainText('No vendor charges added');
    }

    // 3. Duplicate Forwarding Number check
    // Query the booked shipment TEST_AWB_FWD_F2_BLANK which was updated with a forwarding AWB for vendor FEDEX
    const { data: existing } = await dbAdmin
      .from('shipments')
      .select('awb_no, vendor_id, forwarding_awb')
      .eq('reference_no', 'TEST_AWB_FWD_F2_BLANK')
      .is('deleted_at', null)
      .not('forwarding_awb', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existing && existing.forwarding_awb) {
      const dupRef = 'TEST_AWB_FWD_F7_DUP';
      await cleanupReference(dupRef);

      await openAwbForm(page, true);
      await page.locator('input[data-erp-nav-order="40"]').fill(dupRef);
      await selectLookup(page, 50, 'ALIASSO');

      await page.locator('input[data-erp-nav-order="110"]').fill('Lakshmi');
      await page.locator('input[data-erp-nav-order="120"]').fill('Lakshmi');
      await page.locator('input[data-erp-nav-order="130"]').fill('Road 1');
      await page.locator('input[data-erp-nav-order="150"]').fill('500034');
      await page.locator('input[data-erp-nav-order="160"]').fill('Hyderabad');
      await page.locator('input[data-erp-nav-order="170"]').fill('Telangana');
      await page.locator('input[data-erp-nav-order="190"]').fill('9876543210');

      await selectLookup(page, 300, 'USA');
      await page.locator('input[data-erp-nav-order="310"]').fill('Consignee');
      await page.locator('input[data-erp-nav-order="320"]').fill('Consignee');
      await page.locator('input[data-erp-nav-order="330"]').fill('Street 1');
      await page.locator('input[data-erp-nav-order="350"]').fill('10001');
      await page.locator('input[data-erp-nav-order="360"]').fill('NY');
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

      // Proforma Tab
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

      await page.locator('input[data-erp-nav-order="922"]').fill('Gift');
      await page.locator('input[data-erp-nav-order="923"]').fill('6205');
      await page.locator('input[data-erp-nav-order="924"]').fill('1');
      await page.locator('input[data-erp-nav-order="927"]').fill('100');
      await page.getByRole('button', { name: 'Add line' }).click();
      await page.waitForTimeout(300);

      // AWB Tab: Payment
      await page.getByRole('tab', { name: 'AWB' }).click();
      await page.waitForTimeout(300);

      const paymentTrigger = page.locator('button[data-erp-nav-order="700"]');
      await paymentTrigger.click();
      await page.waitForTimeout(200);
      await page.locator('div[role="option"]:has-text("Credit")').first().click();

      // Forwarding Tab: enter duplicate forwarding number
      await page.getByRole('tab', { name: 'Forwarding' }).click();
      await page.waitForTimeout(300);
      await page.locator('input[data-erp-nav-order="1001"]').fill(existing.forwarding_awb);

      const saveBtn = page.getByRole('button', { name: /Save|Update/i });
      await saveBtn.click();

      const errToast = page.locator('li[data-sonner-toast], [role="alert"]').filter({ hasText: /already in use for this vendor/i });
      await expect(errToast.first()).toBeVisible({ timeout: 10000 });
    }
  });

  test('F8. Search toolbar by Forwarding number opens matching shipment', async ({ page }) => {
    test.setTimeout(90000);

    // 1. Pick a booked shipment with a forwarding number
    const { data: existing } = await dbAdmin
      .from('shipments')
      .select('id, awb_no, reference_no, forwarding_awb')
      .is('deleted_at', null)
      .not('forwarding_awb', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    expect(existing).not.toBeNull();
    expect(existing?.forwarding_awb).toBeTruthy();

    // 2. Open AWB Entry Form
    await openAwbForm(page, false);

    // 3. Switch search dropdown to "Forwarding No"
    const searchSelect = page.locator('button[aria-label="Search by"]').first();
    await searchSelect.click();
    await page.waitForTimeout(200);

    const fwdOption = page.locator('div[role="option"]:has-text("Forwarding No")').first();
    await fwdOption.click();
    await page.waitForTimeout(200);

    // 4. Fill forwarding number and search
    const searchInput = page.locator('input[aria-label="Forwarding No"]').first();
    await searchInput.fill(existing.forwarding_awb);

    const searchBtn = page.locator('button[aria-label="Search AWB"]').first();
    await searchBtn.click();

    // 5. Verify toast confirms opening
    const toast = page.locator('li[data-sonner-toast]').filter({ hasText: new RegExp(`Opened AWB ${existing.awb_no}`, 'i') });
    await expect(toast).toBeVisible({ timeout: 15000 });

    // 6. Verify Forwarding tab has the matching forwarding number
    await page.getByRole('tab', { name: 'Forwarding' }).click();
    await page.waitForTimeout(400);

    const fwdInput = page.locator('input[data-erp-nav-order="1001"]');
    await expect(fwdInput).toHaveValue(existing.forwarding_awb);
  });
});
