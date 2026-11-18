import { test, expect } from '@playwright/test';
import { dbAdmin, openAwbForm, cleanupReference, selectLookup } from './awb-entry-helpers';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('KYC Tab Batch 3 E2E Tests (Status Strip, Master Reuse & Guidelines)', () => {
  const fixturesDir = path.resolve(__dirname, 'fixtures');
  const dummyPanJpg = path.resolve(fixturesDir, 'TEST_KYC_PAN.jpg');
  const dummyAadhaarPdf = path.resolve(fixturesDir, 'TEST_KYC_AADHAAR.pdf');
  const testShipperCode = 'TEST_SHP_B3_REUSE';
  const testRef = 'TEST_AWB_KB3';
  let tenantId: string;
  let testShipperId: string;

  test.beforeAll(async () => {
    fs.mkdirSync(fixturesDir, { recursive: true });
    const fakeJpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xff, 0xd9]);
    fs.writeFileSync(dummyPanJpg, fakeJpg);
    fs.writeFileSync(dummyAadhaarPdf, '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');

    // Get tenant id
    const { data: tenant } = await dbAdmin
      .from('tenants')
      .select('id')
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    if (!tenant) throw new Error('No tenant found in dev DB');
    tenantId = tenant.id;

    // Clean up any previous test shipper
    await dbAdmin.from('shipper_kyc_documents').delete().eq('tenant_id', tenantId);
    await dbAdmin.from('shippers').delete().eq('code', testShipperCode).eq('tenant_id', tenantId);

    // Create a TEST shipper with saved KYC document in shipper_kyc_documents
    const { data: newShipper, error: shpErr } = await dbAdmin
      .from('shippers')
      .insert({
        tenant_id: tenantId,
        code: testShipperCode,
        name: 'TEST REUSE EXPORTS PVT LTD',
        mobile: '9888877777',
        status: 'ACTIVE',
        address: 'Plot 42, Export SEZ',
        city: 'Hyderabad',
        document_type: 'Aadhaar Number',
        document_no: '987654321098',
      })
      .select('id')
      .single();
    if (shpErr || !newShipper) throw new Error(`Could not seed shipper: ${shpErr?.message}`);
    testShipperId = newShipper.id;

    // Seed saved KYC document in shipper_kyc_documents
    const { error: kycErr } = await dbAdmin.from('shipper_kyc_documents').insert({
      tenant_id: tenantId,
      shipper_id: testShipperId,
      seq: 1,
      kyc_type: 'Aadhaar Number',
      file_name: 'TEST_SAVED_AADHAAR.pdf',
      document_no: '987654321098',
      side: 'Both',
      storage_path: `tenants/${tenantId}/kyc/seed/test_saved_aadhaar.pdf`,
      mime_type: 'application/pdf',
      file_size: 1024,
    });
    if (kycErr) throw new Error(`Could not seed shipper KYC: ${kycErr.message}`);
  });

  test.afterAll(async () => {
    await cleanupReference(testRef);
    if (testShipperId) {
      await dbAdmin.from('shipper_kyc_documents').delete().eq('shipper_id', testShipperId);
      await dbAdmin.from('shippers').delete().eq('id', testShipperId);
    }
  });

  test('K-B3-01: D11 KYC Status & Warning Banner with Tab Navigation', async ({ page }) => {
    await openAwbForm(page, true);

    // 1. Verify status strip shows KYC: PENDING
    const kycStatusStrip = page.locator('section[aria-label="AWB booking status"]').locator('span:has-text("KYC:")');
    await expect(kycStatusStrip).toBeVisible({ timeout: 10000 });
    await expect(kycStatusStrip.locator('span:has-text("PENDING")')).toBeVisible();

    // 2. Verify KYC Pending banner is prominent on the AWB form
    const pendingBanner = page.locator('div[role="status"]:has-text("KYC Pending:")');
    await expect(pendingBanner).toBeVisible();
    await expect(pendingBanner).toContainText('Shipper KYC identification has not been uploaded');

    // 3. Verify KYC tab trigger shows amber pending indicator
    const kycTabTrigger = page.locator('button[role="tab"]').filter({ hasText: 'KYC' });
    await expect(kycTabTrigger.locator('span[title="KYC Pending"]')).toBeVisible();

    // 4. Click "Upload KYC" in the warning banner -> switches directly to KYC tab
    await pendingBanner.getByRole('button', { name: /Upload KYC/i }).click();
    await page.waitForTimeout(400);

    // Verify KYC tab is now active
    await expect(page.locator('div[role="tabpanel"][data-state="active"]').locator('label:has-text("Type")')).toBeVisible();
  });

  test('K-B3-02: D14 Master Shipper KYC Reuse ("Use saved KYC")', async ({ page }) => {
    await openAwbForm(page, true);

    // 1. Type the test shipper company name in Shipper Details
    const shipperInput = page.locator('input[data-erp-nav-order="110"]');
    await shipperInput.fill('TEST REUSE EXPORTS PVT LTD');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(500);

    // 2. Switch to KYC tab
    await page.locator('button[role="tab"]').filter({ hasText: 'KYC' }).click();
    await page.waitForTimeout(600);

    // 3. Verify the "Saved Shipper KYC Available" card appears
    const savedCard = page.locator('div:has-text("Saved Shipper KYC Available")').first();
    await expect(savedCard).toBeVisible({ timeout: 10000 });

    // Verify metadata displayed: Doc Type and Masked Number (987654321098 -> XXXXXXXX1098)
    await expect(savedCard).toContainText('Aadhaar Number');
    await expect(savedCard).toContainText('XXXXXXXX1098');

    // 4. Click "Use saved KYC" button
    const useSavedBtn = savedCard.getByRole('button', { name: 'Use saved KYC' });
    await expect(useSavedBtn).toBeVisible();
    await useSavedBtn.click();

    // Verify toast confirms attachment
    await expect(page.locator('li[data-sonner-toast]').filter({ hasText: /Attached saved Aadhaar Number/i }).first()).toBeVisible({ timeout: 5000 });

    // Verify document is now in the table with masked Doc No
    const kycTable = page.locator('div[role="tabpanel"][data-state="active"] table');
    await expect(kycTable.locator('td:has-text("Aadhaar Number")')).toBeVisible();
    await expect(kycTable.locator('td:has-text("XXXXXXXX1098")')).toBeVisible();

    // Verify button in saved card changed to "Attached" and is disabled
    await expect(savedCard.getByRole('button', { name: 'Attached' })).toBeDisabled();

    // 5. Switch back to AWB tab: verify banner is gone and status strip shows COMPLETE
    await page.locator('button[role="tab"]').filter({ hasText: 'AWB' }).click();
    await page.waitForTimeout(400);

    await expect(page.locator('div[role="status"]:has-text("KYC Pending:")')).not.toBeVisible();
    const kycStatusStrip = page.locator('section[aria-label="AWB booking status"]').locator('span:has-text("KYC:")');
    await expect(kycStatusStrip.locator('span:has-text("COMPLETE")')).toBeVisible();
    console.log('✅ D14 Master Shipper KYC Reuse verified end-to-end!');
  });

  test('K-B3-03: D14 "Save KYC to Shipper Master" checkbox on upload', async ({ page }) => {
    await openAwbForm(page, true);

    // Set shipper name to match our test shipper
    const shipperInput = page.locator('input[data-erp-nav-order="110"]');
    await shipperInput.fill('TEST REUSE EXPORTS PVT LTD');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(500);

    // Switch to KYC tab
    await page.locator('button[role="tab"]').filter({ hasText: 'KYC' }).click();
    await page.waitForTimeout(400);

    const activeTab = page.locator('div[role="tabpanel"][data-state="active"]');

    // 1. Verify "Save KYC to Shipper Master" checkbox exists and is checked by default
    const saveCheckbox = activeTab.locator('#saveToShipper');
    await expect(saveCheckbox).toBeVisible();
    await expect(saveCheckbox).toBeChecked();

    // 2. Select Doc Type: PAN Number
    const typeTrigger = activeTab.locator('button[data-erp-nav-order="1100"]');
    await typeTrigger.click();
    await page.waitForTimeout(300);
    await page.locator('div[role="option"]').filter({ hasText: 'PAN Number' }).first().click({ force: true });

    // 3. Enter Document No: ABCDE1234F
    const docNoInput = activeTab.locator('input[placeholder="e.g. 1234 5678 9012"]');
    await docNoInput.fill('ABCDE1234F');

    // 4. Upload file TEST_KYC_PAN.jpg
    const fileInput = activeTab.locator('input[type="file"]');
    await fileInput.setInputFiles(dummyPanJpg);

    // Verify toast confirms document added
    await expect(page.locator('li[data-sonner-toast]').filter({ hasText: /KYC document added/i }).first()).toBeVisible({ timeout: 10000 });
    // And saved to shipper master toast
    await expect(page.locator('li[data-sonner-toast]').filter({ hasText: /Saved to Shipper Master/i }).first()).toBeVisible({ timeout: 10000 });

    // Verify in database that shipper_kyc_documents now contains the PAN row
    await page.waitForTimeout(1000);
    const { data: savedDocs } = await dbAdmin
      .from('shipper_kyc_documents')
      .select('*')
      .eq('shipper_id', testShipperId);

    expect(savedDocs).toBeDefined();
    const panDoc = savedDocs?.find((d) => d.kyc_type === 'PAN Number');
    expect(panDoc).toBeDefined();
    expect(panDoc?.document_no).toBe('ABCDE1234F');
    console.log('✅ D14 Save KYC to Shipper Master verified in DB!');
  });

  test('K-B3-04: KYC-09 Functional Toolbar Buttons (Settings, Info, List)', async ({ page }) => {
    await openAwbForm(page, true);

    // Switch to KYC tab
    await page.locator('button[role="tab"]').filter({ hasText: 'KYC' }).click();
    await page.waitForTimeout(400);

    const activeTab = page.locator('div[role="tabpanel"][data-state="active"]');

    // 1. Click "Info" button -> Opens CBIC KYC Guidelines Dialog
    const infoBtn = activeTab.locator('button[aria-label="Info"]');
    await expect(infoBtn).toBeVisible();
    await infoBtn.click();

    const infoDialog = page.locator('div[role="dialog"]');
    await expect(infoDialog).toBeVisible();
    await expect(infoDialog).toContainText('Indian Customs Shipper KYC Guidelines (CBIC)');
    await expect(infoDialog).toContainText('CBIC Circular No. 09/2010-Customs');
    await expect(infoDialog).toContainText('CSB IV');
    await expect(infoDialog).toContainText('CSB V');
    await expect(infoDialog).toContainText('5 MB');

    // Close dialog
    await infoDialog.getByRole('button', { name: 'Close' }).first().click();
    await expect(infoDialog).not.toBeVisible();

    // 2. Click "Settings" button -> Opens Form Setup Dialog
    const settingsBtn = activeTab.locator('button[aria-label="Settings"]');
    await expect(settingsBtn).toBeVisible();
    await settingsBtn.click();

    const setupDialog = page.locator('div[role="dialog"]:has-text("Form Setup")');
    await expect(setupDialog).toBeVisible();
    await setupDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(setupDialog).not.toBeVisible();

    // 3. Click "List" button -> Exits form to AWB Entry List
    const listBtn = activeTab.locator('button[aria-label="List"]');
    await expect(listBtn).toBeVisible();
    await listBtn.click();

    // Verify AWB Entry List header and table are visible
    await expect(page.locator('h1:has-text("AWB Entry List")')).toBeVisible({ timeout: 5000 });
    const tableHeader = page.locator('table');
    await expect(tableHeader).toBeVisible();
    console.log('✅ KYC-09 Functional Toolbar Buttons verified end-to-end!');
  });
});

