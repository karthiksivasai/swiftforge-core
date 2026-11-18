import { test, expect } from '@playwright/test';
import { dbAdmin, openAwbForm, cleanupReference, selectLookup } from './awb-entry-helpers';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('KYC Tab Batch 2 E2E Tests (Storage, Metadata, Masking & Front/Back)', () => {
  const fixturesDir = path.resolve(__dirname, 'fixtures');
  const dummyFrontJpg = path.resolve(fixturesDir, 'TEST_AADHAAR_FRONT.jpg');
  const dummyBackJpg = path.resolve(fixturesDir, 'TEST_AADHAAR_BACK.jpg');
  const dummyPassportPdf = path.resolve(fixturesDir, 'TEST_PASSPORT.pdf');
  const dummyInvalidExe = path.resolve(fixturesDir, 'TEST_MALICIOUS.exe');
  const dummyOversizedJpg = path.resolve(fixturesDir, 'TEST_OVERSIZED.jpg');

  test.beforeAll(() => {
    fs.mkdirSync(fixturesDir, { recursive: true });
    // Minimal valid JPEG header + bytes
    const fakeJpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xff, 0xd9]);
    fs.writeFileSync(dummyFrontJpg, fakeJpg);
    fs.writeFileSync(dummyBackJpg, fakeJpg);
    // Minimal PDF header + bytes
    fs.writeFileSync(dummyPassportPdf, '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
    // Invalid file
    fs.writeFileSync(dummyInvalidExe, 'MZ_FAKE_EXECUTABLE_HEADER');
    // Oversized file (> 5MB)
    const largeBuf = Buffer.alloc(5.5 * 1024 * 1024, 0xaa);
    fs.writeFileSync(dummyOversizedJpg, largeBuf);
  });

  test.afterAll(() => {
    // Clean up large file
    try {
      if (fs.existsSync(dummyOversizedJpg)) fs.unlinkSync(dummyOversizedJpg);
    } catch {
      /* ignore */
    }
  });

  test('K-B2-01: File input restrictions and size limit validation (KYC-04)', async ({ page }) => {
    await openAwbForm(page, true);

    // Switch to KYC tab
    await page.locator('button[role="tab"]').filter({ hasText: 'KYC' }).click();
    await page.waitForTimeout(400);

    const fileInput = page.locator('div[role="tabpanel"][data-state="active"] input[type="file"]');
    
    // 1. Verify accept attribute is present and restricts to allowed types
    const acceptAttr = await fileInput.getAttribute('accept');
    expect(acceptAttr).toContain('image/jpeg');
    expect(acceptAttr).toContain('image/png');
    expect(acceptAttr).toContain('application/pdf');

    // 2. Attempt uploading an invalid file format (.exe)
    await fileInput.setInputFiles(dummyInvalidExe);
    await expect(page.locator('li[data-sonner-toast]').filter({ hasText: /Invalid file format/i }).first()).toBeVisible({ timeout: 5000 });

    // 3. Attempt uploading an oversized file (> 5MB)
    await fileInput.setInputFiles(dummyOversizedJpg);
    await expect(page.locator('li[data-sonner-toast]').filter({ hasText: /exceeds 5MB limit/i }).first()).toBeVisible({ timeout: 5000 });

    // 4. Verify no rows were added to table
    const rows = page.locator('div[role="tabpanel"][data-state="active"] table tbody tr');
    await expect(rows).toHaveCount(1); // "No KYC documents added" row
  });

  test('K-B2-02: Front & Back image pairing, Document No, and Expiry Date with warning (D12 & Front/Back)', async ({ page }) => {
    test.setTimeout(90000);
    await openAwbForm(page, true);

    await page.locator('button[role="tab"]').filter({ hasText: 'KYC' }).click();
    await page.waitForTimeout(400);

    const kycPanel = page.locator('div[role="tabpanel"][data-state="active"]');
    const fileInput = kycPanel.locator('input[type="file"]');

    // 1. Upload Document 1: Aadhaar FRONT with Doc No
    await kycPanel.locator('input[placeholder*="1234 5678 9012"]').fill('1234 5678 9012');
    await kycPanel.locator('button:has-text("Front")').click();
    await fileInput.setInputFiles(dummyFrontJpg);
    await page.waitForTimeout(400);

    // 2. Upload Document 2: Aadhaar BACK
    await kycPanel.locator('button:has-text("Back")').click();
    await fileInput.setInputFiles(dummyBackJpg);
    await page.waitForTimeout(400);

    // 3. Upload Document 3: Passport with Expired date to test expired warning
    await kycPanel.locator('button[data-erp-nav-order="1100"]').click();
    await page.waitForTimeout(300);
    await page.locator('div[role="option"]').filter({ hasText: 'Passport Number' }).first().click({ force: true });

    await kycPanel.locator('input[placeholder*="1234 5678 9012"]').fill('Z9876543');
    await kycPanel.locator('button:has-text("Single/Both")').click();
    
    // Set expired date: 2020-01-01
    await kycPanel.locator('input[type="date"]').fill('2020-01-01');
    await fileInput.setInputFiles(dummyPassportPdf);
    await page.waitForTimeout(400);

    // 4. Verify 3 rows in the table
    const rows = kycPanel.locator('table tbody tr');
    await expect(rows).toHaveCount(3);

    // Row 1: Front
    await expect(rows.nth(0)).toContainText('Front');
    // Row 2: Back
    await expect(rows.nth(1)).toContainText('Back');
    // Row 3: Passport, Single/Both, Expired badge
    await expect(rows.nth(2)).toContainText('Single / Both');
    await expect(rows.nth(2)).toContainText('Expired');

    console.log('✅ Front & Back images and Expired date badge verified on UI!');
  });

  test('K-B2-03: Aadhaar and PAN masking with audited reveal permission (D15 / KYC-10)', async ({ page }) => {
    test.setTimeout(90000);
    await openAwbForm(page, true);

    await page.locator('button[role="tab"]').filter({ hasText: 'KYC' }).click();
    await page.waitForTimeout(400);

    const kycPanel = page.locator('div[role="tabpanel"][data-state="active"]');
    const fileInput = kycPanel.locator('input[type="file"]');

    // 1. Upload Aadhaar with Doc No 1234 5678 9012
    await kycPanel.locator('button[data-erp-nav-order="1100"]').click();
    await page.waitForTimeout(300);
    await page.locator('div[role="option"]').filter({ hasText: 'Aadhaar Number' }).first().click({ force: true });
    await kycPanel.locator('input[placeholder*="1234 5678 9012"]').fill('1234 5678 9012');
    await fileInput.setInputFiles(dummyFrontJpg);
    await page.waitForTimeout(400);

    // 2. Upload PAN with Doc No ABCDE1234F
    await kycPanel.locator('button[data-erp-nav-order="1100"]').click();
    await page.waitForTimeout(300);
    await page.locator('div[role="option"]').filter({ hasText: 'PAN Number' }).first().click({ force: true });
    await kycPanel.locator('input[placeholder*="1234 5678 9012"]').fill('ABCDE1234F');
    await fileInput.setInputFiles(dummyBackJpg);
    await page.waitForTimeout(400);

    const rows = kycPanel.locator('table tbody tr');
    await expect(rows).toHaveCount(2);

    // 3. Verify Aadhaar is masked as XXXXXXXX9012
    const aadhaarCell = rows.nth(0).locator('td').nth(3);
    await expect(aadhaarCell).toContainText('XXXXXXXX9012');

    // 4. Verify PAN is masked as XXXXXX234X (D15 rule)
    const panCell = rows.nth(1).locator('td').nth(3);
    await expect(panCell).toContainText('XXXXXX234X');

    // 5. Test Reveal button on Aadhaar
    const revealAadhaarBtn = aadhaarCell.locator('button[aria-label="Reveal document number"]');
    await expect(revealAadhaarBtn).toBeVisible();
    await revealAadhaarBtn.click();

    // After reveal, clear text is shown
    await expect(aadhaarCell).toContainText('1234 5678 9012');
    await expect(page.locator('li[data-sonner-toast]').filter({ hasText: /unmasked \(access audited\)/i }).first()).toBeVisible({ timeout: 5000 });

    // 6. Test Mask button to re-mask
    const maskAadhaarBtn = aadhaarCell.locator('button[aria-label="Mask document number"]');
    await maskAadhaarBtn.click();
    await expect(aadhaarCell).toContainText('XXXXXXXX9012');

    // 7. Verify an ACCESS audit log was created in DB
    const { data: auditLogs } = await dbAdmin
      .from('audit_logs')
      .select('*')
      .eq('action', 'ACCESS')
      .eq('module_slug', 'txn.kyc-reveal')
      .order('created_at', { ascending: false })
      .limit(1);

    expect(auditLogs).toHaveLength(1);
    expect(auditLogs![0].action).toBe('ACCESS');
    expect(auditLogs![0].new_values?.doc_type).toBe('Aadhaar Number');

    console.log('✅ Aadhaar & PAN masking and audited reveal verified live in UI and DB!');
  });

  test('K-B2-04: End-to-end booking persists files to private Supabase Storage bucket with signed URLs (D13)', async ({ page }) => {
    test.setTimeout(120000);

    const ref = 'TEST_AWB_KYC_STORAGE_B2';
    await cleanupReference(ref);

    await openAwbForm(page, true);

    // 1. Fill basic AWB fields
    await page.locator('input[data-erp-nav-order="40"]').fill(ref);
    await selectLookup(page, 50, 'ALIASSO');

    // Shipper
    await page.locator('input[data-erp-nav-order="110"]').fill('Priya');
    await page.locator('input[data-erp-nav-order="120"]').fill('Priya');
    await page.locator('input[data-erp-nav-order="130"]').fill('Road 10 Jubilee Hills');
    await page.locator('input[data-erp-nav-order="150"]').fill('500033');
    await page.locator('input[data-erp-nav-order="160"]').fill('Hyderabad');
    await page.locator('input[data-erp-nav-order="170"]').fill('Telangana');
    await page.locator('input[data-erp-nav-order="190"]').fill('9876543210');

    // Consignee
    await selectLookup(page, 300, 'USA');
    await page.locator('input[data-erp-nav-order="310"]').fill('Smith');
    await page.locator('input[data-erp-nav-order="320"]').fill('Smith');
    await page.locator('input[data-erp-nav-order="330"]').fill('500 5th Ave');
    await page.locator('input[data-erp-nav-order="350"]').fill('10110');
    await page.locator('input[data-erp-nav-order="360"]').fill('New York');
    await page.locator('input[data-erp-nav-order="370"]').fill('NY');
    await page.locator('input[data-erp-nav-order="390"]').fill('1234567890');

    // Product & Carrier
    await selectLookup(page, 500, 'NDOX');
    await selectLookup(page, 510, 'FEDEX');
    await page.waitForTimeout(800);

    const serviceInput = page.locator('input[data-erp-nav-order="530"]');
    if (await serviceInput.isVisible()) {
      await selectLookup(page, 530, 'FEDEX');
    }

    // Pieces: 1 box 30x20x15 cm, 2.0 kg
    await page.locator('input[data-erp-nav-order="616"]').fill('2.0');
    await page.locator('input[data-erp-nav-order="617"]').fill('1');
    await page.locator('input[data-erp-nav-order="618"]').fill('30');
    await page.locator('input[data-erp-nav-order="619"]').fill('20');
    await page.locator('input[data-erp-nav-order="620"]').fill('15');
    await page.locator('button[data-erp-nav-skip=""]:has-text("Add")').first().click();
    await page.waitForTimeout(500);

    // Credit Payment
    const paymentTrigger = page.locator('button[data-erp-nav-order="700"]');
    await paymentTrigger.click();
    await page.waitForTimeout(200);
    await page.locator('div[role="option"]:has-text("Credit")').first().click();

    // Proforma item (mandatory for NDOX)
    await page.locator('button[role="tab"]').filter({ hasText: 'Proforma' }).click();
    await page.waitForTimeout(400);

    const csbTrigger = page.locator('button[data-erp-nav-order="900"]');
    await csbTrigger.click();
    await page.waitForTimeout(200);
    await page.locator('div[role="option"]:has-text("CSB 4")').click();

    const reasonTrigger = page.locator('button[data-erp-nav-order="906"]');
    await reasonTrigger.click();
    await page.waitForTimeout(200);
    await page.locator('div[role="option"]:has-text("UNSOLICITED GIFT")').first().click();

    await page.locator('input[data-erp-nav-order="922"]').fill('Documents & Samples');
    await page.locator('input[data-erp-nav-order="923"]').fill('84713010');
    await page.locator('input[data-erp-nav-order="924"]').fill('1');
    await page.locator('input[data-erp-nav-order="927"]').fill('100');
    await page.getByRole('button', { name: 'Add line' }).click();

    // 2. KYC Tab: Upload Document to Supabase Storage
    await page.locator('button[role="tab"]').filter({ hasText: 'KYC' }).click();
    await page.waitForTimeout(300);

    const kycPanel = page.locator('div[role="tabpanel"][data-state="active"]');
    await kycPanel.locator('input[placeholder*="1234 5678 9012"]').fill('999988887777');
    await kycPanel.locator('button:has-text("Front")').click();
    await kycPanel.locator('input[type="file"]').setInputFiles(dummyFrontJpg);
    await page.waitForTimeout(400);

    // 3. Save / Book
    await page.getByRole('button', { name: /Save|Update/i }).first().click();
    await expect(page.locator('li[data-sonner-toast]').filter({ hasText: /AWB.*(booked|created|saved|updated)/i }).first()).toBeVisible({ timeout: 30000 });

    // 4. Verify in database: file_url has storage path in tenant-files
    const { data: shipment } = await dbAdmin
      .from('shipments')
      .select('id, awb_no, tenant_id')
      .eq('reference_no', ref)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    expect(shipment).toBeTruthy();

    const { data: dbDocs } = await dbAdmin
      .from('shipment_documents')
      .select('id, file_name, file_url, raw_meta')
      .eq('shipment_id', shipment.id)
      .is('deleted_at', null);

    expect(dbDocs).toHaveLength(1);
    expect(dbDocs![0].file_url).toContain(`tenants/${shipment.tenant_id}/kyc/${shipment.id}/`);
    expect(dbDocs![0].raw_meta?.documentNo).toBe('999988887777');
    expect(dbDocs![0].raw_meta?.side).toBe('FRONT');

    // 5. Verify the file actually exists in Supabase Storage tenant-files bucket
    const storagePath = dbDocs![0].file_url!;
    const { data: storageList, error: storageErr } = await dbAdmin.storage
      .from('tenant-files')
      .list(`tenants/${shipment.tenant_id}/kyc/${shipment.id}`);

    expect(storageErr).toBeNull();
    expect(storageList && storageList.length).toBeGreaterThanOrEqual(1);

    // 6. Verify signed URL generation works for private access
    const { data: signedData, error: signErr } = await dbAdmin.storage
      .from('tenant-files')
      .createSignedUrl(storagePath, 300);

    expect(signErr).toBeNull();
    expect(signedData?.signedUrl).toBeTruthy();

    // 7. Reopen shipment in UI and verify Download button is active
    await openAwbForm(page, false);
    await page.locator('input[aria-label="AWB No"]').first().fill(shipment.awb_no);
    await page.locator('button[aria-label="Search AWB"]').first().click();
    await page.waitForTimeout(2000);

    await page.locator('button[role="tab"]').filter({ hasText: 'KYC' }).click();
    await page.waitForTimeout(500);

    const downloadBtn = page.locator('div[role="tabpanel"][data-state="active"] button[aria-label="Download KYC document"]').first();
    expect(await downloadBtn.isDisabled()).toBe(false);

    console.log('✅ Supabase Storage private bucket upload and signed URL verified end-to-end!');
  });
});

