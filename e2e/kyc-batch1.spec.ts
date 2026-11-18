import { test, expect } from '@playwright/test';
import { dbAdmin, openAwbForm, cleanupReference, selectLookup } from './awb-entry-helpers';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('KYC Tab Batch 1 E2E Tests (KYC-01, KYC-02, KYC-06, KYC-11, KYC-12, Lock, Party Contact 409)', () => {
  const dummyFile1 = path.resolve(__dirname, 'fixtures/TEST_KYC_AADHAAR.pdf');
  const dummyFile2 = path.resolve(__dirname, 'fixtures/TEST_KYC_PAN.jpg');

  test.beforeAll(() => {
    fs.mkdirSync(path.dirname(dummyFile1), { recursive: true });
    fs.writeFileSync(dummyFile1, '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
    const fakeJpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xff, 0xd9]);
    fs.writeFileSync(dummyFile2, fakeJpg);
  });

  test('F-Q2. remember_party_contact code collision handles gracefully and never throws 409 Conflict', async () => {
    const testCode = 'TEST_PARTY_' + Math.floor(Math.random() * 100000);
    
    // 1. First call with new code
    const res1 = await dbAdmin.rpc('remember_party_contact', {
      p_role: 'shipper',
      p_fields: {
        code: testCode,
        name: 'Test Shipper Original',
        contact_name: 'Contact A',
        address1: '123 First St',
        mobile: '9876543210',
        city: 'Hyderabad',
        state: 'Telangana',
        country: 'India',
      },
    });

    expect(res1.error).toBeNull();
    expect(res1.data).toMatchObject({ ok: true });
    const originalId = res1.data.id;

    // 2. Second call with SAME code but ALTERED name, address, and mobile (which previously caused 409 Conflict)
    const res2 = await dbAdmin.rpc('remember_party_contact', {
      p_role: 'shipper',
      p_fields: {
        code: testCode,
        name: 'Test Shipper Updated Name',
        contact_name: 'Contact B',
        address1: '456 Second Ave',
        mobile: '9123456789',
        city: 'Hyderabad',
        state: 'Telangana',
        country: 'India',
      },
    });

    expect(res2.error).toBeNull();
    expect(res2.data).toMatchObject({ ok: true });
    expect(res2.data.id).toBe(originalId);

    // Clean up
    await dbAdmin.from('shippers').delete().eq('code', testCode);
  });

  test('K1 & K2. Multi-document upload, classification preservation, and complete hydration on reopen (KYC-01, KYC-02)', async ({ page }) => {
    test.setTimeout(120000);

    const ref = 'TEST_AWB_KYC_BATCH1_K1';
    await cleanupReference(ref);

    await openAwbForm(page, true);
    page.on('console', msg => console.log('[BROWSER CONSOLE]', msg.type(), msg.text()));

    // 1. Fill basic AWB fields
    await page.locator('input[data-erp-nav-order="40"]').fill(ref);
    await selectLookup(page, 50, 'ALIASSO');

    // Shipper
    await page.locator('input[data-erp-nav-order="110"]').fill('Lakshmi');
    await page.locator('input[data-erp-nav-order="120"]').fill('Lakshmi');
    await page.locator('input[data-erp-nav-order="130"]').fill('Road 12 Banjara');
    await page.locator('input[data-erp-nav-order="150"]').fill('500034');
    await page.locator('input[data-erp-nav-order="160"]').fill('Hyderabad');
    await page.locator('input[data-erp-nav-order="170"]').fill('Telangana');
    await page.locator('input[data-erp-nav-order="190"]').fill('9876543210');

    // Consignee
    await selectLookup(page, 300, 'USA');
    await page.locator('input[data-erp-nav-order="310"]').fill('Rahul');
    await page.locator('input[data-erp-nav-order="320"]').fill('Rahul');
    await page.locator('input[data-erp-nav-order="330"]').fill('123 Main St');
    await page.locator('input[data-erp-nav-order="350"]').fill('10001');
    await page.locator('input[data-erp-nav-order="360"]').fill('New York');
    await page.locator('input[data-erp-nav-order="370"]').fill('NY');
    await page.locator('input[data-erp-nav-order="390"]').fill('1234567890');

    // Product & Carrier
    await selectLookup(page, 500, 'NDOX');
    await selectLookup(page, 510, 'FEDEX');
    await page.waitForTimeout(800);

    // Service - select FEDEX
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

    // Select CSB 4
    const csbTrigger = page.locator('button[data-erp-nav-order="900"]');
    await csbTrigger.click();
    await page.waitForTimeout(200);
    await page.locator('div[role="option"]:has-text("CSB 4")').click();

    // Select UNSOLICITED GIFT
    const reasonTrigger = page.locator('button[data-erp-nav-order="906"]');
    await reasonTrigger.click();
    await page.waitForTimeout(200);
    await page.locator('div[role="option"]:has-text("UNSOLICITED GIFT")').first().click();

    await page.locator('input[data-erp-nav-order="922"]').fill('Sample Goods');
    await page.locator('input[data-erp-nav-order="923"]').fill('84713010');
    await page.locator('input[data-erp-nav-order="924"]').fill('1');
    await page.locator('input[data-erp-nav-order="927"]').fill('100');
    await page.getByRole('button', { name: 'Add line' }).click();

    // 2. KYC Tab: Upload Document 1 (Aadhaar Number)
    await page.locator('button[role="tab"]').filter({ hasText: 'KYC' }).click();
    await page.waitForTimeout(300);
    await page.locator('button[data-erp-nav-order="1100"]').click();
    await page.waitForTimeout(300);
    await page.locator('div[role="option"]').filter({ hasText: 'Aadhaar Number' }).first().click({ force: true });

    const fileInput = page.locator('div[role="tabpanel"][data-state="active"] input[type="file"]');
    await fileInput.setInputFiles(dummyFile1);
    await page.waitForTimeout(400);

    // Upload Document 2 (PAN Number)
    await page.locator('button[data-erp-nav-order="1100"]').click();
    await page.waitForTimeout(300);
    await page.locator('div[role="option"]').filter({ hasText: 'PAN Number' }).first().click({ force: true });
    await fileInput.setInputFiles(dummyFile2);
    await page.waitForTimeout(400);

    // Verify 2 rows in KYC table
    const kycPreviewRows = page.locator('div[role="tabpanel"][data-state="active"] table tbody tr');
    await expect(kycPreviewRows).toHaveCount(2);

    // 3. Save / Book
    await page.getByRole('button', { name: /Save|Update/i }).first().click();
    await expect(page.locator('li[data-sonner-toast]').filter({ hasText: /AWB.*(booked|created|saved|updated)/i }).first()).toBeVisible({ timeout: 30000 });

    // 4. Verify DB storage and classification (KYC-02)
    const { data: shipment } = await dbAdmin
      .from('shipments')
      .select('id, awb_no, wizard_extras')
      .eq('reference_no', ref)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    expect(shipment).toBeTruthy();
    const storedKycDocs = (shipment.wizard_extras as any)?.kyc?.documents;
    expect(storedKycDocs).toHaveLength(2);
    expect(storedKycDocs[0].entryType).toBe('Aadhaar Number');
    expect(storedKycDocs[1].entryType).toBe('PAN Number');

    const { data: dbDocs } = await dbAdmin
      .from('shipment_documents')
      .select('id, document_type, file_name, raw_meta, version, deleted_at')
      .eq('shipment_id', shipment.id)
      .is('deleted_at', null)
      .order('version', { ascending: true });

    expect(dbDocs).toHaveLength(2);
    expect(dbDocs[0].raw_meta?.kycDocType).toBe('Aadhaar Number');
    expect(dbDocs[1].raw_meta?.kycDocType).toBe('PAN Number');

    // 5. Reopen shipment in edit mode & verify hydration (KYC-01)
    await openAwbForm(page, false);
    const searchInput = page.locator('input[aria-label="AWB No"]').first();
    await searchInput.fill(shipment.awb_no);
    await page.locator('button[aria-label="Search AWB"]').first().click();
    await page.waitForTimeout(2000);

    // Switch to KYC tab
    await page.locator('button[role="tab"]').filter({ hasText: 'KYC' }).click();
    await page.waitForTimeout(500);

    const kycTabContent = page.locator('div[role="tabpanel"][data-state="active"]');
    const rows = kycTabContent.locator('table tbody tr');
    expect(await rows.count()).toBe(2);

    // Verify BOTH Download buttons are enabled (KYC-01 fix verified!)
    const row1Download = rows.nth(0).locator('button[aria-label="Download KYC document"]');
    const row2Download = rows.nth(1).locator('button[aria-label="Download KYC document"]');

    expect(await row1Download.isDisabled()).toBe(false);
    expect(await row2Download.isDisabled()).toBe(false);

    console.log('✅ KYC-01 & KYC-02 Verified: Multi-documents hydrated with active Download buttons!');
  });

  test('K3. Document soft-delete on UI updates DB with deleted_at and prevents resurrection (KYC-06)', async ({ page }) => {
    test.setTimeout(120000);

    const { data: shipment } = await dbAdmin
      .from('shipments')
      .select('id, awb_no')
      .eq('reference_no', 'TEST_AWB_KYC_BATCH1_K1')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    expect(shipment).toBeTruthy();

    await openAwbForm(page, false);
    const searchInput = page.locator('input[aria-label="AWB No"]').first();
    await searchInput.fill(shipment.awb_no);
    await page.locator('button[aria-label="Search AWB"]').first().click();
    await page.waitForTimeout(2000);

    await page.locator('button[role="tab"]').filter({ hasText: 'KYC' }).click();
    await page.waitForTimeout(500);

    const kycTabContent = page.locator('div[role="tabpanel"][data-state="active"]');
    const rows = kycTabContent.locator('table tbody tr');
    expect(await rows.count()).toBe(2);

    // Delete Row 1 (Aadhaar)
    await rows.nth(0).locator('button[aria-label="Delete KYC document"]').click();

    // Only 1 row remains on screen
    await expect(rows).toHaveCount(1, { timeout: 10000 });

    // Save/Update shipment
    await page.getByRole('button', { name: /Save|Update/i }).first().click();
    await expect(page.locator('li[data-sonner-toast]').filter({ hasText: /AWB.*(booked|created|saved|updated)/i }).first()).toBeVisible({ timeout: 30000 });

    // Verify in database that 1 document was soft-deleted
    const { data: activeDocs } = await dbAdmin
      .from('shipment_documents')
      .select('id, file_name, deleted_at')
      .eq('shipment_id', shipment.id)
      .is('deleted_at', null);

    expect(activeDocs).toHaveLength(1);
    expect(activeDocs[0].file_name).toBe('TEST_KYC_PAN.jpg');

    const { data: deletedDocs } = await dbAdmin
      .from('shipment_documents')
      .select('id, file_name, deleted_at')
      .eq('shipment_id', shipment.id)
      .not('deleted_at', 'is', null);

    expect(deletedDocs).toHaveLength(1);
    expect(deletedDocs[0].file_name).toBe('TEST_KYC_AADHAAR.pdf');

    // Reopen shipment again: old document must NOT resurrect
    await openAwbForm(page, false);
    await page.locator('input[aria-label="AWB No"]').first().fill(shipment.awb_no);
    await page.locator('button[aria-label="Search AWB"]').first().click();
    await page.waitForTimeout(2000);

    await page.locator('button[role="tab"]').filter({ hasText: 'KYC' }).click();
    const rowsAfterReopen = page.locator('div[role="tabpanel"][data-state="active"] table tbody tr');
    await expect(rowsAfterReopen).toHaveCount(1, { timeout: 10000 });

    console.log('✅ KYC-06 Verified: Soft-delete persisted in DB and document did not resurrect on reload!');
  });

  test('K8. Lock enforcement on KYC tab and server-side RPC rejection (KYC-11 & Fieldset Lock)', async ({ page }) => {
    test.setTimeout(120000);

    const { data: shipment } = await dbAdmin
      .from('shipments')
      .select('id, awb_no')
      .eq('reference_no', 'TEST_AWB_KYC_BATCH1_K1')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Lock the shipment in database
    await dbAdmin
      .from('shipments')
      .update({ is_locked: true })
      .eq('id', shipment.id);

    // Reopen locked shipment in UI
    await openAwbForm(page, false);
    await page.locator('input[aria-label="AWB No"]').first().fill(shipment.awb_no);
    await page.locator('button[aria-label="Search AWB"]').first().click();
    await page.waitForTimeout(2000);

    await page.locator('button[role="tab"]').filter({ hasText: 'KYC' }).click();
    await page.waitForTimeout(500);

    const kycTabContent = page.locator('div[role="tabpanel"][data-state="active"]');

    // 1. Verify fieldset is disabled
    const fieldset = kycTabContent.locator('fieldset').first();
    expect(await fieldset.getAttribute('disabled')).not.toBeNull();

    // 2. Verify Delete button in table is disabled
    const deleteBtn = kycTabContent.locator('button[aria-label="Delete KYC document"]').first();
    expect(await deleteBtn.isDisabled()).toBe(true);

    // 3. Verify Download button is STILL clickable for read-only viewing
    const downloadBtn = kycTabContent.locator('button[aria-label="Download KYC document"]').first();
    expect(await downloadBtn.isDisabled()).toBe(false);

    // 4. Verify server-side rejection for save_shipment_document (KYC-11)
    const saveRpcResult = await dbAdmin.rpc('save_shipment_document', {
      p_shipment_id: shipment.id,
      p_fields: {
        document_type: 'KYC',
        file_name: 'ILLEGAL_LOCK_BYPASS.txt',
        content_b64: 'SUxMRUdBTF9CWVBBU1M=',
        source: 'USER_UPLOAD',
      },
    });

    expect(saveRpcResult.error).toBeTruthy();
    expect(saveRpcResult.error.message).toMatch(/Shipment is locked/i);

    // 5. Verify server-side rejection for delete_shipment_document
    const deleteRpcResult = await dbAdmin.rpc('delete_shipment_document', {
      p_shipment_id: shipment.id,
      p_document_id: shipment.id, // Any UUID
    });

    expect(deleteRpcResult.error).toBeTruthy();
    expect(deleteRpcResult.error.message).toMatch(/Shipment is locked/i);

    console.log('✅ KYC-11 Verified: Fieldset locked in UI and server RPCs strictly reject mutations on locked AWB!');
  });

  test('K9. Audit trail records CREATE and DELETE events for KYC documents (KYC-12)', async () => {
    const { data: shipment } = await dbAdmin
      .from('shipments')
      .select('id')
      .eq('reference_no', 'TEST_AWB_KYC_BATCH1_K1')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    expect(shipment).toBeTruthy();

    const { data: auditLogs } = await dbAdmin
      .from('audit_logs')
      .select('*')
      .eq('entity_type', 'shipment_documents')
      .order('created_at', { ascending: true });

    expect(auditLogs).toBeTruthy();
    expect(auditLogs.length).toBeGreaterThanOrEqual(2);

    const createLogs = auditLogs.filter(
      (l: any) =>
        (l.action === 'ADD' || l.action === 'CREATE') &&
        ((l.new_values?.shipment_id === shipment.id) || (l.new?.shipment_id === shipment.id))
    );
    const deleteLogs = auditLogs.filter(
      (l: any) =>
        l.action === 'DELETE' &&
        ((l.old_values?.shipment_id === shipment.id) || (l.old?.shipment_id === shipment.id))
    );

    expect(createLogs.length).toBeGreaterThanOrEqual(1);
    expect(deleteLogs.length).toBeGreaterThanOrEqual(1);

    console.log(`✅ KYC-12 Verified: ${createLogs.length} ADD and ${deleteLogs.length} DELETE audit logs recorded!`);
  });
});

