import { test as setup, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authFile = path.resolve(__dirname, '.auth/user.json');

setup('authenticate as Karthik Test Admin', async ({ page }) => {
  const username = process.env.TEST_ADMIN_USERNAME || 'kkarthik';
  const password = process.env.TEST_ADMIN_PASSWORD;

  if (!password) {
    throw new Error('TEST_ADMIN_PASSWORD is required in .env.test.local');
  }

  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  page.on('console', (msg) => console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`));
  page.on('response', (res) => {
    if (res.url().includes('/api/auth/login')) {
      console.log(`[AUTH RESPONSE] status: ${res.status()}`);
    }
  });

  await page.goto('/login', { waitUntil: 'networkidle' });

  // Ensure client-side React is active
  await page.waitForTimeout(1000);

  await page.fill('#username', username);
  await page.fill('#password', password);

  // Click submit and wait for login response
  const [loginResponse] = await Promise.all([
    page.waitForResponse((res) => res.url().includes('/api/auth/login'), { timeout: 15000 }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);

  if (loginResponse) {
    console.log(`[LOGIN API] Status: ${loginResponse.status()}, Body: ${await loginResponse.text()}`);
  } else {
    console.log('[LOGIN API] No response received from /api/auth/login!');
  }

  // Wait for redirect away from /login
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

  // Navigate to AWB entry and ensure authenticated user chip is visible
  await page.goto('/transaction/awb-entry', { waitUntil: 'networkidle' });
  const userChip = page.locator('text=Karthik Test Admin');
  await expect(userChip).toBeVisible({ timeout: 15000 });

  // Save storage state
  await page.context().storageState({ path: authFile });
  console.log('[AUTH SETUP] Session saved successfully to', authFile);
});
