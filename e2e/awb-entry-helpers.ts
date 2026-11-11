import { Page, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testDocPath = path.resolve(__dirname, '../docs/production-readiness-test.md');

function getSupabaseAdmin() {
  const envPath = path.resolve(__dirname, '../.env');
  const envContent = fs.readFileSync(envPath, 'utf8');
  const env: Record<string, string> = {};
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials in .env');
  return createClient(url, key);
}

export const dbAdmin = getSupabaseAdmin();

export function appendTestResult(markdown: string) {
  if (!fs.existsSync(testDocPath)) {
    fs.writeFileSync(
      testDocPath,
      '# AWB and Proforma Production-Readiness Test Report\n\nDate: 10 Nov 2026. Automated real-browser E2E suite executed via Playwright driving Chromium on http://localhost:8082.\nTester authenticated as Karthik Test Admin. Dev Database ijosczggsrvscponules.\n\n',
      'utf8',
    );
  }
  fs.appendFileSync(testDocPath, '\n' + markdown.trim() + '\n\n', 'utf8');
}

export async function cleanupReference(referenceNo: string) {
  const { data: rows } = await dbAdmin
    .from('shipments')
    .select('id')
    .eq('reference_no', referenceNo);

  if (rows && rows.length > 0) {
    for (const r of rows) {
      await dbAdmin.from('proforma_items').delete().eq('shipment_id', r.id);
      await dbAdmin.from('shipment_pieces').delete().eq('shipment_id', r.id);
      await dbAdmin.from('shipment_charges').delete().eq('shipment_id', r.id);
      await dbAdmin.from('shipment_documents').delete().eq('shipment_id', r.id);
      await dbAdmin.from('shipment_events').delete().eq('shipment_id', r.id);
      await dbAdmin.from('shipment_rating_audit').delete().eq('shipment_id', r.id);
      await dbAdmin.from('shipments').delete().eq('id', r.id);
    }
  }
}

export async function openAwbForm(page: Page, fresh = false) {
  await page.goto(fresh ? '/transaction/awb-entry?view=form&fresh=1' : '/transaction/awb-entry?view=form');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('text=Karthik Test Admin')).toBeVisible({ timeout: 15000 });
}

export async function selectLookup(page: Page, navOrder: number, text: string) {
  const input = page.locator(`input[data-erp-nav-order="${navOrder}"]`);
  await input.click();
  await input.fill(text);

  // Wait for dropdown option matching text or code
  const option = page.locator(`button[role="option"], div[role="option"]`).filter({ hasText: text }).first();
  const optionFound = await option.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false);
  if (optionFound) {
    await option.click();
    await page.waitForTimeout(400);
    return;
  }

  // If not visible, click the search icon next to the input
  const container = input.locator('xpath=ancestor::div[contains(@class,"lookup-code") or contains(@class,"relative")][1]');
  const searchBtn = container.locator('button[data-lookup-search-btn], button[aria-label="Search"]').first();
  if (await searchBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await searchBtn.click();
    await page.waitForTimeout(500);
    const dialogOption = page.locator(`div[role="dialog"] button`).filter({ hasText: text }).first();
    const dialogFound = await dialogOption.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false);
    if (dialogFound) {
      await dialogOption.click();
      await page.waitForTimeout(400);
      return;
    }
    const dialogSearchInput = page.locator('div[role="dialog"] input').first();
    if (await dialogSearchInput.isVisible().catch(() => false)) {
      await dialogSearchInput.fill(text);
      await page.waitForTimeout(500);
      const row = page.locator(`div[role="dialog"] button`).filter({ hasText: text }).first();
      if (await row.waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false)) {
        await row.click();
        await page.waitForTimeout(400);
        return;
      }
    }
  }

  // Fallback: press Enter
  await input.press('Enter');
  await page.waitForTimeout(400);
}

export async function openAndReadInvoice(page: Page) {
  const invoiceBtn = page.locator('button:has-text("Invoice")').first();
  await expect(invoiceBtn).toBeVisible({ timeout: 10000 });
  await invoiceBtn.click();
  await page.waitForTimeout(1500);

  const iframe = page.locator('iframe').first();
  await expect(iframe).toBeVisible({ timeout: 10000 });
  const srcDoc = await iframe.getAttribute('srcDoc');
  let text = srcDoc || '';

  if (!text) {
    const frame = page.frameLocator('iframe').first();
    text = await frame.locator('body').innerText().catch(() => '');
  }

  // Close preview drawer
  const closeBtn = page.locator('button[aria-label="Close"]').first();
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click();
  } else {
    await page.keyboard.press('Escape');
  }
  await page.waitForTimeout(500);

  return { text };
}
