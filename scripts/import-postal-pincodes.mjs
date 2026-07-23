#!/usr/bin/env node
/**
 * Import India Post CSV into public.postal_pincodes.
 *
 * Usage:
 *   node scripts/import-postal-pincodes.mjs /path/to/pincodes.csv
 *
 * Requires SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in env.
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createClient } from "@supabase/supabase-js";

const BATCH_SIZE = 500;

function titleCaseWords(value) {
  return String(value ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}

function parseCoordinate(raw) {
  const value = String(raw ?? "").trim();
  if (!value || value.toUpperCase() === "NA") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function createAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function flushBatch(supabase, batch) {
  if (batch.length === 0) return;
  const { error } = await supabase.from("postal_pincodes").upsert(batch, {
    onConflict: "country_code,pincode",
  });
  if (error) throw new Error(error.message);
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: node scripts/import-postal-pincodes.mjs /path/to/pincodes.csv");
    process.exit(1);
  }

  const supabase = createAdminClient();
  const deduped = new Map();
  const stream = createReadStream(csvPath, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  let lineNo = 0;
  for await (const line of rl) {
    lineNo += 1;
    if (lineNo === 1) continue;
    if (!line.trim()) continue;

    const [
      ,
      ,
      ,
      ,
      pincodeRaw,
      ,
      ,
      districtRaw,
      stateRaw,
      latitudeRaw,
      longitudeRaw,
    ] = parseCsvLine(line);

    const pincode = String(pincodeRaw ?? "").trim();
    if (!/^\d{6}$/.test(pincode)) continue;

    const district = titleCaseWords(districtRaw);
    const state = titleCaseWords(stateRaw);
    const row = {
      country_code: "IN",
      pincode,
      city: district,
      district,
      state,
      country: "India",
      latitude: parseCoordinate(latitudeRaw),
      longitude: parseCoordinate(longitudeRaw),
      is_active: true,
    };

    if (!deduped.has(pincode)) deduped.set(pincode, row);
  }

  const rows = [...deduped.values()];
  console.log(`Parsed ${rows.length} unique pincodes from ${lineNo - 1} CSV rows.`);

  let batch = [];
  let imported = 0;
  for (const row of rows) {
    batch.push(row);
    if (batch.length >= BATCH_SIZE) {
      await flushBatch(supabase, batch);
      imported += batch.length;
      console.log(`Imported ${imported}/${rows.length}`);
      batch = [];
    }
  }
  await flushBatch(supabase, batch);
  imported += batch.length;
  console.log(`Done. Imported ${imported} pincodes.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
