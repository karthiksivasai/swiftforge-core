/**
 * Shared lookup and removal for the international AWB audit seed.
 * Talks to the database named in .env. Does not change application code.
 * Every inserted business key starts with TEST_AWB_.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const STATE_PATH = path.join(here, ".seed-state.json");
export const MARKER = "TEST_AWB_";
export const FROM_DATE = "2026-11-01";
export const NOTE = "AWB audit test data";
export const CM_DIVISOR = 5000;
/**
 * Inch equivalent of the 5000 cm³/kg divisor, for weights billed in kg.
 * 5000 / (2.54³) = 305.12, stored as 305. 166 is the US pounds figure and is not used.
 */
export const INCH_DIVISOR = 305;
/** Removed on reseed so an older 166 test row cannot remain beside 305. */
const RETIRED_INCH_DIVISORS = [166];

export const LANES = [
  {
    key: "Z1",
    destinationCode: "US",
    zoneCode: "1",
    customerRate: 500,
    fedexRate: 350,
    compareRate: 400,
  },
  {
    key: "Z2",
    destinationCode: "AE",
    zoneCode: "2",
    customerRate: 700,
    fedexRate: 500,
    compareRate: 600,
  },
];

export const PRODUCTS = [
  { code: "DOX" },
  { code: "NDOX" },
  { code: "COM" },
];

function loadEnv(root) {
  const envPath = path.join(root, ".env");
  const text = fs.readFileSync(envPath, "utf8");
  const env = {};
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*([\w_]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(.*))\s*$/);
    if (match) env[match[1]] = (match[2] ?? match[3] ?? match[4] ?? "").trim();
  }
  return env;
}

export function createDb(root) {
  const env = loadEnv(root);
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("SUPABASE_URL is missing from .env");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing from .env. Refusing to write with the anon key.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function mustOne(db, table, column, value, label) {
  const extra = table === "destinations" ? ", country_id, dest_type" : "";
  const { data, error } = await db
    .from(table)
    .select(`id, code, name, tenant_id${extra}`)
    .eq(column, value)
    .is("deleted_at", null)
    .limit(5);
  if (error) throw new Error(`${label}: ${error.message}`);
  const rows = data ?? [];
  if (rows.length !== 1) {
    throw new Error(`${label}: expected 1 ${table} where ${column}=${value}, found ${rows.length}`);
  }
  return rows[0];
}

export async function resolveMasters(db) {
  const customer = await mustOne(db, "customers", "code", "ALIASSO", "ALIASSO");
  const osmo = await mustOne(db, "customers", "code", "OSMO", "OSMO");
  const billingState = await mustOne(db, "states", "code", "TS", "Telangana");
  const origin = await mustOne(db, "destinations", "code", "HYD", "HYD");
  const fedex = await mustOne(db, "vendors", "code", "FEDE", "FEDEX vendor code FEDE");
  const dhl = await mustOne(db, "vendors", "code", "DHL", "DHL");

  const products = [];
  for (const product of PRODUCTS) {
    products.push(await mustOne(db, "products", "code", product.code, `product ${product.code}`));
  }

  const lanes = [];
  for (const lane of LANES) {
    const destination = await mustOne(db, "destinations", "code", lane.destinationCode, lane.destinationCode);
    const zone = await mustOne(db, "zones", "code", lane.zoneCode, `zone ${lane.zoneCode}`);
    lanes.push({ ...lane, destination, zone });
  }

  const { data: services, error: serviceError } = await db
    .from("service_mappings")
    .select("id, vendor_id, service, status, min_weight, max_weight")
    .in("vendor_id", [fedex.id, dhl.id])
    .in("service", ["FEDEX", "EXPRESS"])
    .eq("status", "ACTIVE")
    .is("deleted_at", null);
  if (serviceError) throw new Error(`service mappings: ${serviceError.message}`);
  const fedexService = (services ?? []).find((row) => row.vendor_id === fedex.id && row.service === "FEDEX");
  const dhlService = (services ?? []).find((row) => row.vendor_id === dhl.id && row.service === "EXPRESS");
  if (!fedexService) throw new Error("FEDEX service is not mapped on vendor FEDE");
  if (!dhlService) throw new Error("EXPRESS service is not mapped on vendor DHL");

  return { customer, osmo, billingState, origin, fedex, dhl, products, lanes, fedexService, dhlService };
}

const AUDIT_AWB_NOS = [
  "000028",
  "000029",
  "000030",
  "000031",
  "000032",
  "000033",
  "000034",
  "000035",
  "000036",
  "000037",
  "000038",
  "000039",
  "000040",
  "000041",
  "000042",
  "000043",
];

/** Test AWBs from the audit, plus any later AWB whose reference starts with TEST_AWB_. */
export async function removeTestAwbs(db) {
  const { data: byRef, error: refError } = await db
    .from("shipments")
    .select("id, awb_no, reference_no")
    .like("reference_no", `${MARKER}%`);
  if (refError) throw new Error(`list test AWBs: ${refError.message}`);

  const { data: byNo, error: noError } = await db
    .from("shipments")
    .select("id, awb_no, reference_no")
    .in("awb_no", AUDIT_AWB_NOS);
  if (noError) throw new Error(`list audit AWB numbers: ${noError.message}`);

  const rows = [...(byRef ?? []), ...(byNo ?? [])];
  const ids = [...new Set(rows.map((row) => row.id))];
  if (ids.length === 0) return { deleted: 0, awbs: [] };

  const { error: auditError } = await db.rpc("purge_test_shipment_audit", { p_ids: ids });
  if (auditError) throw new Error(`delete audit logs: ${auditError.message}`);

  const childTables = [
    "shipment_pieces",
    "shipment_charge_snapshots",
    "shipment_comments",
    "shipment_attachments",
    "shipment_events",
    "rating_audit",
    "shipment_documents",
    "proforma_items",
  ];
  for (const table of childTables) {
    const { error } = await db.from(table).delete().in("shipment_id", ids);
    if (error && !/does not exist|schema cache|could not find/i.test(error.message)) {
      throw new Error(`delete ${table}: ${error.message}`);
    }
  }

  const { error: deleteError } = await db.from("shipments").delete().in("id", ids);
  if (deleteError) throw new Error(`delete test AWBs: ${deleteError.message}`);
  return {
    deleted: ids.length,
    awbs: [...new Set(rows.map((row) => row.awb_no).filter(Boolean))],
  };
}

export async function removeTestRows(db, masters) {
  const { data: contracts, error: contractError } = await db
    .from("vendor_contracts")
    .select("id")
    .like("contract_no", `${MARKER}%`);
  if (contractError) throw new Error(`list vendor contracts: ${contractError.message}`);
  const contractIds = (contracts ?? []).map((row) => row.id);
  if (contractIds.length > 0) {
    const { error } = await db.from("vendor_contract_slabs").delete().in("contract_id", contractIds);
    if (error) throw new Error(`delete vendor slabs: ${error.message}`);
  }
  const { error: deleteContracts } = await db.from("vendor_contracts").delete().like("contract_no", `${MARKER}%`);
  if (deleteContracts) throw new Error(`delete vendor contracts: ${deleteContracts.message}`);

  const { error: deleteRates } = await db.from("customer_rates").delete().like("contract_no", `${MARKER}%`);
  if (deleteRates) throw new Error(`delete customer rates: ${deleteRates.message}`);

  const { error: deleteFuelMaster } = await db
    .from("fuel_surcharge_rates")
    .delete()
    .like("entry_code", `${MARKER}%`);
  if (deleteFuelMaster) throw new Error(`delete fuel master: ${deleteFuelMaster.message}`);

  const { error: deleteFuelChild } = await db
    .from("customer_fuel_surcharges")
    .delete()
    .like("entry_code", `${MARKER}%`);
  if (deleteFuelChild) throw new Error(`delete customer fuel: ${deleteFuelChild.message}`);

  const { error: deleteVol } = await db
    .from("customer_volumetrics")
    .delete()
    .eq("customer_id", masters.customer.id)
    .eq("cm_divisor", CM_DIVISOR)
    .in("inch_divisor", [INCH_DIVISOR, ...RETIRED_INCH_DIVISORS])
    .in("vendor", ["FEDEX", "DHL"])
    .in("product", PRODUCTS.map((product) => product.code));
  if (deleteVol) throw new Error(`delete volumetrics: ${deleteVol.message}`);

  const destinationIds = masters.lanes.map((lane) => lane.destination.id);
  const zoneIds = masters.lanes.map((lane) => lane.zone.id);
  const { error: deleteZones } = await db
    .from("zone_mappings")
    .delete()
    .eq("origin_destination_id", masters.origin.id)
    .in("destination_id", destinationIds)
    .in("zone_id", zoneIds)
    .eq("effective_date", FROM_DATE)
    .is("vendor_id", null)
    .is("product_id", null)
    .is("service", null);
  if (deleteZones) throw new Error(`delete zone mappings: ${deleteZones.message}`);
}

export function readState() {
  if (!fs.existsSync(STATE_PATH)) return null;
  return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
}

export function writeState(state) {
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}
