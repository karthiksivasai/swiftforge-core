import { test as setup, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authFile = path.resolve(__dirname, '.auth/user.json');

setup('authenticate as Karthik Test Admin', async ({ page, baseURL }) => {
  const username = process.env.TEST_ADMIN_USERNAME || 'kkarthik';
  const password = process.env.TEST_ADMIN_PASSWORD;

  if (!password) {
    throw new Error('TEST_ADMIN_PASSWORD is required in .env.test.local');
  }

  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  if (fs.existsSync(authFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(authFile, 'utf8'));
      const tokenEntry = data.origins?.[0]?.localStorage?.find(
        (i: any) => i.name && i.name.includes('-auth-token')
      );
      if (tokenEntry) {
        const tokenData = JSON.parse(tokenEntry.value);
        if (tokenData.expires_at && (tokenData.expires_at * 1000 - Date.now() > 5 * 60 * 1000)) {
          console.log('[AUTH SETUP] Active session exists with >5m validity remaining. Skipping re-login.');
          return;
        }
      }
    } catch {
      // Parse error, proceed to login
    }
  }

  const hostUrl = baseURL || 'http://localhost:8082';

  // 1. Authenticate via /api/auth/login
  const res = await fetch(`${hostUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, channel: 'WEB' }),
  });

  if (!res.ok) {
    throw new Error(`Login API failed with status ${res.status()}: ${await res.text()}`);
  }

  const tokenBody = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    session_id?: string;
  };

  if (!tokenBody.access_token || !tokenBody.refresh_token) {
    throw new Error(`Login API response missing tokens: ${JSON.stringify(tokenBody)}`);
  }

  // 2. Resolve full authenticated user object from Supabase Auth
  const envContent = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8');
  const env: Record<string, string> = {};
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    }
  }

  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const supabase = createClient(supabaseUrl, anonKey);
  const { data: userData, error: userError } = await supabase.auth.getUser(tokenBody.access_token);

  if (userError || !userData?.user) {
    throw new Error(`Could not fetch user details for session: ${userError?.message}`);
  }

  const sessionPayload = {
    access_token: tokenBody.access_token,
    refresh_token: tokenBody.refresh_token,
    user: userData.user,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  };

  // 3. Write storage state file directly
  const storageState = {
    cookies: [],
    origins: [
      {
        origin: hostUrl,
        localStorage: [
          { name: 'courier-erp-theme', value: 'light' },
          { name: 'sb-ijosczggsrvscponules-auth-token', value: JSON.stringify(sessionPayload) },
          { name: 'cms.session_id', value: tokenBody.session_id || '' },
        ],
      },
    ],
  };

  fs.writeFileSync(authFile, JSON.stringify(storageState, null, 2), 'utf8');
  console.log('[AUTH SETUP] Session tokens generated and saved to', authFile);

  // 4. Navigate to AWB Entry to verify session loads
  await page.goto('/login');
  await page.evaluate(({ sessionJson, sessionId }) => {
    localStorage.setItem('courier-erp-theme', 'light');
    localStorage.setItem('sb-ijosczggsrvscponules-auth-token', sessionJson);
    if (sessionId) localStorage.setItem('cms.session_id', sessionId);
  }, { sessionJson: JSON.stringify(sessionPayload), sessionId: tokenBody.session_id || '' });

  await page.goto('/transaction/awb-entry');
  const userChip = page.locator('text=Karthik Test Admin');
  await expect(userChip).toBeVisible({ timeout: 15000 });
  console.log('[AUTH SETUP] Authenticated user verified on screen!');
});
