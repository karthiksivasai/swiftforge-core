/**
 * Migration Script: Migrate existing dev database KYC base64 rows to Supabase Storage private bucket `tenant-files`.
 * 
 * Safety Rules:
 *   - Follows tenant path isolation: tenants/{tenant_id}/kyc/{shipment_id}/{id}_{file_name}
 *   - Only updates `file_url` to the storage path
 *   - Does NOT delete or nullify `content_b64` (kept as backup until fully verified)
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getClient() {
  const envPath = path.resolve(__dirname, "../.env");
  const envContent = fs.readFileSync(envPath, "utf8");
  const env: Record<string, string> = {};
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase credentials in .env");
  return createClient(url, key);
}

async function migrateKycStorage() {
  const client = getClient();
  console.log("🔍 Scanning shipment_documents for KYC rows needing storage migration...");

  const { data: rows, error } = await client
    .from("shipment_documents")
    .select("id, tenant_id, shipment_id, file_name, mime_type, content_b64, file_url, raw_meta")
    .eq("document_type", "KYC")
    .not("content_b64", "is", null)
    .is("file_url", null);

  if (error) {
    console.error("❌ Error fetching rows:", error.message);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.log("✅ No unmigrated KYC rows found. All KYC documents already have storage paths!");
    return;
  }

  console.log(`📦 Found ${rows.length} KYC rows to migrate to 'tenant-files' bucket.`);

  let successCount = 0;
  let failCount = 0;

  for (const row of rows) {
    try {
      const cleanB64 = row.content_b64.includes(",") ? row.content_b64.split(",")[1] : row.content_b64;
      const buffer = Buffer.from(cleanB64, "base64");
      const safeName = (row.file_name || "kyc_document").replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `tenants/${row.tenant_id}/kyc/${row.shipment_id}/${row.id}_${safeName}`;

      // 1. Upload to storage bucket
      const { data: uploadData, error: uploadErr } = await client.storage
        .from("tenant-files")
        .upload(storagePath, buffer, {
          contentType: row.mime_type || "application/octet-stream",
          upsert: true,
        });

      if (uploadErr) {
        console.error(`❌ Failed to upload ${row.id} (${row.file_name}):`, uploadErr.message);
        failCount++;
        continue;
      }

      // 2. Update file_url in DB row (leaving content_b64 intact as backup)
      const updatedMeta = {
        ...(row.raw_meta || {}),
        migratedToStorageAt: new Date().toISOString(),
        storageBucket: "tenant-files",
        storagePath: uploadData?.path || storagePath,
      };

      const { error: updateErr } = await client
        .from("shipment_documents")
        .update({
          file_url: uploadData?.path || storagePath,
          raw_meta: updatedMeta,
        })
        .eq("id", row.id);

      if (updateErr) {
        console.error(`❌ Failed to update DB row ${row.id}:`, updateErr.message);
        failCount++;
        continue;
      }

      console.log(`✅ Migrated row ${row.id}: ${storagePath}`);
      successCount++;
    } catch (err) {
      console.error(`❌ Unexpected error migrating row ${row.id}:`, err);
      failCount++;
    }
  }

  console.log("\n=========================================");
  console.log(`Migration Complete: ${successCount} succeeded, ${failCount} failed.`);
  console.log("Original content_b64 bytes were retained in all rows as safety backup.");
  console.log("=========================================\n");
}

migrateKycStorage().catch((err) => {
  console.error("Fatal migration error:", err);
  process.exit(1);
});

