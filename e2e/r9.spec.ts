import { test, expect } from '@playwright/test';
import { dbAdmin, openAwbForm, cleanupReference, appendTestResult, selectLookup } from './awb-entry-helpers';

test.describe('Real-Life Case R9: Common operator mistakes', () => {

  test('R9a. Shipper mobile "12", email "abc"', async ({ page }) => {
    await cleanupReference('TEST_AWB_G9A');
    await openAwbForm(page);
    await page.locator('input[data-erp-nav-order="40"]').fill('TEST_AWB_G9A');
    await selectLookup(page, 50, 'ALIASSO');

    // Shipper details with invalid mobile "12" and email "abc"
    await page.locator('input[data-erp-nav-order="110"]').fill('Lakshmi');
    await page.locator('input[data-erp-nav-order="120"]').fill('Lakshmi');
    await page.locator('input[data-erp-nav-order="130"]').fill('Banjara Hills Rd 12');
    await page.locator('input[data-erp-nav-order="150"]').fill('500034');
    await page.locator('input[data-erp-nav-order="160"]').fill('Hyderabad');
    await page.locator('input[data-erp-nav-order="170"]').fill('Telangana');
    await page.locator('input[data-erp-nav-order="190"]').fill('12'); // Invalid mobile
    await page.locator('input[data-erp-nav-order="200"]').fill('abc'); // Invalid email

    await selectLookup(page, 300, 'USA');
    await page.locator('input[data-erp-nav-order="310"]').fill('Rahul');
    await page.locator('input[data-erp-nav-order="320"]').fill('Rahul');
    await page.locator('input[data-erp-nav-order="330"]').fill('123 Main St');
    await page.locator('input[data-erp-nav-order="350"]').fill('10001');
    await page.locator('input[data-erp-nav-order="360"]').fill('New York');
    await page.locator('input[data-erp-nav-order="370"]').fill('NY');
    await page.locator('input[data-erp-nav-order="390"]').fill('1234567890');

    await selectLookup(page, 500, 'DOX');
    await selectLookup(page, 510, 'FEDEX');

    // Attempt Save
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(1500);

    const toastElem = page.locator('[data-sonner-toast]');
    const toast = (await toastElem.count()) > 0 ? await toastElem.first().innerText() : '';
    console.log('[R9a Toast]:', toast);

    const { data: dbRows } = await dbAdmin.from('shipments').select('id').eq('reference_no', 'TEST_AWB_G9A');
    expect(dbRows?.length || 0).toBe(0);

    appendTestResult(`### R9a. Shipper mobile "12", email "abc"\n- **Status:** **PASS** (Blocked, 0 DB records)\n- **Message:** "${toast}"`);
  });

  test('R9b. Consignee postcode or phone missing', async ({ page }) => {
    await cleanupReference('TEST_AWB_G9B');
    await openAwbForm(page);
    await page.locator('input[data-erp-nav-order="40"]').fill('TEST_AWB_G9B');
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
    // Intentionally omit Postcode (350) and Phone (390)
    await page.locator('input[data-erp-nav-order="350"]').fill('');
    await page.locator('input[data-erp-nav-order="360"]').fill('New York');
    await page.locator('input[data-erp-nav-order="370"]').fill('NY');
    await page.locator('input[data-erp-nav-order="390"]').fill('');

    await selectLookup(page, 500, 'DOX');
    await selectLookup(page, 510, 'FEDEX');

    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(1500);

    const toastElem = page.locator('[data-sonner-toast]');
    const toast = (await toastElem.count()) > 0 ? await toastElem.first().innerText() : '';
    console.log('[R9b Toast]:', toast);

    const { data: dbRows } = await dbAdmin.from('shipments').select('id').eq('reference_no', 'TEST_AWB_G9B');
    expect(dbRows?.length || 0).toBe(0);

    appendTestResult(`### R9b. Consignee postcode or phone missing\n- **Status:** **PASS** (Blocked, 0 DB records)\n- **Message:** "${toast}"`);
  });

  test('R9c. CSB type or export reason blank', async ({ page }) => {
    await cleanupReference('TEST_AWB_G9C');
    await openAwbForm(page);
    await page.locator('input[data-erp-nav-order="40"]').fill('TEST_AWB_G9C');
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

    // Attempt Save without selecting CSB type or export reason
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(1500);

    const toastElem = page.locator('[data-sonner-toast]');
    const toast = (await toastElem.count()) > 0 ? await toastElem.first().innerText() : '';
    console.log('[R9c Toast]:', toast);

    const { data: dbRows } = await dbAdmin.from('shipments').select('id').eq('reference_no', 'TEST_AWB_G9C');
    expect(dbRows?.length || 0).toBe(0);

    appendTestResult(`### R9c. CSB type or export reason blank\n- **Status:** **PASS** (Blocked, 0 DB records)\n- **Message:** "${toast}"`);
  });

  test('R9d. Non-DOX with no proforma lines', async ({ page }) => {
    await cleanupReference('TEST_AWB_G9D');
    await openAwbForm(page);
    await page.locator('input[data-erp-nav-order="40"]').fill('TEST_AWB_G9D');
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

    await selectLookup(page, 500, 'NDOX'); // Non-DOX!
    await selectLookup(page, 510, 'FEDEX');

    // Go to Proforma tab, set CSB 4 and GIFT, but add NO lines
    const proformaTab = page.locator('button[role="tab"]:has-text("Proforma")');
    await proformaTab.click();
    await page.waitForTimeout(400);

    const csbTrigger = page.locator('button[data-erp-nav-order="900"]');
    await csbTrigger.click();
    await page.locator('div[role="option"]:has-text("CSB 4")').click();

    const reasonTrigger = page.locator('button[data-erp-nav-order="906"]');
    await reasonTrigger.click();
    await page.locator('div[role="option"]:has-text("UNSOLICITED GIFT")').first().click();

    // Switch back to AWB and Save
    await page.locator('button[role="tab"]:has-text("AWB")').click();
    await page.waitForTimeout(400);

    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(1500);

    const toastElem = page.locator('[data-sonner-toast]');
    const toast = (await toastElem.count()) > 0 ? await toastElem.first().innerText() : '';
    console.log('[R9d Toast]:', toast);

    const { data: dbRows } = await dbAdmin.from('shipments').select('id').eq('reference_no', 'TEST_AWB_G9D');
    expect(dbRows?.length || 0).toBe(0);

    appendTestResult(`### R9d. Non-DOX with no proforma lines\n- **Status:** **PASS** (Blocked, 0 DB records)\n- **Message:** "${toast}"`);
  });

  test('R9e. Bond/UT and Pay of IGST mutual exclusivity', async ({ page }) => {
    await openAwbForm(page);
    const proformaTab = page.locator('button[role="tab"]:has-text("Proforma")');
    await proformaTab.click();
    await page.waitForTimeout(400);

    // Set Bond/UT = Yes
    const bondTrigger = page.locator('button[data-erp-nav-order="910"]');
    await bondTrigger.click();
    await page.locator('div[role="option"]:has-text("Yes")').first().click();
    await page.waitForTimeout(300);

    // Set Pay of IGST = Yes
    const payIgstTrigger = page.locator('button[data-erp-nav-order="911"]');
    await payIgstTrigger.click();
    await page.locator('div[role="option"]:has-text("Yes")').first().click();
    await page.waitForTimeout(300);

    // Verify Bond/UT auto-switched to No
    const bondVal = await page.locator('button[data-erp-nav-order="910"]').innerText();
    console.log('[R9e Bond/UT value after Pay of IGST = Yes]:', bondVal);

    expect(bondVal).toContain('No');

    appendTestResult(`### R9e. Bond/UT and Pay of IGST mutual exclusivity\n- **Status:** **PASS** (Auto-switched to No on screen)\n- **Value:** "${bondVal}"`);
  });

  test('R9g. Commercial ticked with gift reason', async ({ page }) => {
    await cleanupReference('TEST_AWB_G9G');
    await openAwbForm(page);
    await page.locator('input[data-erp-nav-order="40"]').fill('TEST_AWB_G9G');
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

    await selectLookup(page, 500, 'COM');
    await selectLookup(page, 510, 'FEDEX');

    // 1. Tick Commercial button on AWB tab
    const commercialBtn = page.getByRole('button', { name: 'Commercial', exact: true });
    await commercialBtn.click();
    await page.waitForTimeout(300);

    // 2. Go to Proforma tab
    const proformaTab = page.locator('button[role="tab"]:has-text("Proforma")');
    await proformaTab.click();
    await page.waitForTimeout(400);

    // 3. Inspect Export Reason dropdown options when Commercial is active
    const reasonTrigger = page.locator('button[data-erp-nav-order="906"]');
    await reasonTrigger.click();
    await page.waitForTimeout(300);

    const reasonOptions = await page.locator('div[role="option"]').allInnerTexts();
    console.log('[R9g Available Export Reasons for Commercial]:', reasonOptions);

    // Assert that GIFT reasons are NOT available for commercial exports
    expect(reasonOptions.some((opt) => opt.toUpperCase().includes('GIFT'))).toBe(false);
    expect(reasonOptions).toContain('SALE');
    expect(reasonOptions).toContain('COMMERCIAL SAMPLES');

    await page.keyboard.press('Escape');

    // 4. Switch back to AWB tab and attempt Save without mandatory commercial IEC / AD Code
    await page.locator('button[role="tab"]:has-text("AWB")').click();
    await page.waitForTimeout(300);

    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(1000);

    const { data: dbRows } = await dbAdmin.from('shipments').select('id').eq('reference_no', 'TEST_AWB_G9G');
    expect(dbRows?.length || 0).toBe(0);

    appendTestResult(
      `### R9g. Commercial ticked with gift reason\n- **Status:** **PASS** (Gift reasons strictly excluded from commercial export options; save blocked without commercial compliance)\n- **Available Reasons:** ${JSON.stringify(reasonOptions)}`,
    );
  });

  test('R9h. Box number > piece count', async ({ page }) => {
    await openAwbForm(page);

    // Pieces: 1 box
    await page.locator('input[data-erp-nav-order="616"]').fill('1.0');
    await page.locator('input[data-erp-nav-order="617"]').fill('1');
    await page.locator('input[data-erp-nav-order="618"]').fill('20');
    await page.locator('input[data-erp-nav-order="619"]').fill('20');
    await page.locator('input[data-erp-nav-order="620"]').fill('10');
    await page.locator('button[data-erp-nav-skip=""]:has-text("Add")').first().click();
    await page.waitForTimeout(500);

    // Proforma tab: Check Box No dropdown options
    const proformaTab = page.locator('button[role="tab"]:has-text("Proforma")');
    await proformaTab.click();
    await page.waitForTimeout(400);

    const boxTrigger = page.locator('button[data-erp-nav-order="920"]');
    await boxTrigger.click();
    await page.waitForTimeout(300);

    const boxOptions = await page.locator('div[role="option"]').allInnerTexts();
    console.log('[R9h Available Box Options with 1 piece]:', boxOptions);

    expect(boxOptions).toContain('Box-1');
    expect(boxOptions.some(opt => opt.includes('Box-2') || opt.includes('Box-5'))).toBe(false);

    await page.keyboard.press('Escape');

    appendTestResult(`### R9h. Box number > piece count\n- **Status:** **PASS** (Strictly bounded by piece count: only Box-1 selectable, Box > 1 prevented)\n- **Available Options:** ${JSON.stringify(boxOptions)}`);
  });

  test('R9i. Double-click save idempotency', async ({ page }) => {
    // Verifies clicking Save twice rapidly does not create duplicate shipments
    const refNo = `TEST_AWB_G9I_${Date.now()}`;
    await openAwbForm(page);
    await page.locator('input[data-erp-nav-order="40"]').fill(refNo);
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

    await selectLookup(page, 500, 'DOX');
    await selectLookup(page, 510, 'FEDEX');

    const serviceInput = page.locator('input[data-erp-nav-order="530"]');
    if (await serviceInput.isVisible()) await selectLookup(page, 530, 'FEDEX');

    await page.locator('input[data-erp-nav-order="616"]').fill('0.5');
    await page.locator('input[data-erp-nav-order="617"]').fill('1');
    await page.locator('input[data-erp-nav-order="618"]').fill('20');
    await page.locator('input[data-erp-nav-order="619"]').fill('15');
    await page.locator('input[data-erp-nav-order="620"]').fill('2');
    await page.locator('button[data-erp-nav-skip=""]:has-text("Add")').first().click();
    await page.waitForTimeout(500);

    const proformaTab = page.locator('button[role="tab"]:has-text("Proforma")');
    await proformaTab.click();
    await page.waitForTimeout(300);
    const csbTrigger = page.locator('button[data-erp-nav-order="900"]');
    await csbTrigger.click();
    await page.locator('div[role="option"]:has-text("ECM DOX"), div[role="option"]:has-text("CSB 4")').first().click();
    const reasonTrigger = page.locator('button[data-erp-nav-order="906"]');
    await reasonTrigger.click();
    await page.locator('div[role="option"]:has-text("PERSONAL"), div[role="option"]:has-text("SALE")').first().click();

    await page.locator('button[role="tab"]:has-text("AWB")').click();
    await page.waitForTimeout(300);

    const paymentTrigger = page.locator('button[data-erp-nav-order="700"]');
    await paymentTrigger.click();
    await page.locator('div[role="option"]:has-text("Credit")').first().click();

    // Rapid double click Save
    const saveBtn = page.getByRole('button', { name: 'Save' });
    await saveBtn.dblclick();
    await page.waitForTimeout(3500);

    const { data: dbRows } = await dbAdmin.from('shipments').select('id, awb_no').eq('reference_no', refNo);
    expect(dbRows?.length).toBe(1);

    appendTestResult(`### R9i. Double-click save idempotency\n- **Status:** **PASS** (Exactly 1 shipment created: AWB \`${dbRows?.[0]?.awb_no}\`)\n- **DB Count:** 1`);
  });

  test('R9j. Cross-tab error focus', async ({ page }) => {
    // When on AWB tab and all AWB fields are valid but CSB Type is missing, clicking Save should focus the error on the Proforma tab
    await openAwbForm(page);
    await page.locator('input[data-erp-nav-order="40"]').fill('TEST_AWB_G9J');
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
    if (await serviceInput.isVisible()) await selectLookup(page, 530, 'FEDEX');

    await page.locator('input[data-erp-nav-order="616"]').fill('1.0');
    await page.locator('input[data-erp-nav-order="617"]').fill('1');
    await page.locator('input[data-erp-nav-order="618"]').fill('20');
    await page.locator('input[data-erp-nav-order="619"]').fill('20');
    await page.locator('input[data-erp-nav-order="620"]').fill('10');
    await page.locator('button[data-erp-nav-skip=""]:has-text("Add")').first().click();
    await page.waitForTimeout(400);

    // Set Payment Type to Credit so there are NO cash receipt errors on AWB tab
    const paymentTrigger = page.locator('button[data-erp-nav-order="700"]');
    await paymentTrigger.click();
    await page.waitForTimeout(200);
    await page.locator('div[role="option"]:has-text("Credit")').first().click();
    await page.waitForTimeout(300);

    // We are on AWB tab. Proforma CSB Type is missing.
    // Click Save from AWB tab
    const saveBtn = page.locator('button[data-erp-nav-order="780"]').first();
    await saveBtn.click();
    await page.waitForTimeout(1000);

    // Check if active tab switched to Proforma tab
    const activeTabElem = page.locator('button[role="tab"][data-state="active"]');
    const proformaTabSelected = await activeTabElem.innerText();
    console.log('[R9j Active Tab After Validation Error]:', proformaTabSelected);

    expect(proformaTabSelected).toContain('Proforma');

    appendTestResult(`### R9j. Cross-tab error focus\n- **Status:** **PASS** (Tab auto-focused to Proforma)\n- **Active Tab:** "${proformaTabSelected}"`);
  });

});
