/**
 * International-only AWB audit seed.
 *
 * Inserts rows marked TEST_AWB_ / "AWB audit test data" into the database in .env.
 * Does not change application code. Safe to run again: it removes the previous
 * TEST_AWB_ rows first. It sets ALIASSO billing state to Telangana and OSMO
 * billing state to Karnataka for the IGST case. Cleanup restores both.
 *
 * Run from swiftforge-core:
 *   node scripts/awb-audit/seed-international-test-data.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CM_DIVISOR,
  FROM_DATE,
  INCH_DIVISOR,
  MARKER,
  NOTE,
  createDb,
  readState,
  removeTestRows,
  resolveMasters,
  writeState,
} from "./test-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const db = createDb(root);
const masters = await resolveMasters(db);

const prior = readState();
let previousBillingStateId = prior?.previousBillingStateId ?? null;
if (!prior) {
  const { data, error } = await db
    .from("customers")
    .select("billing_state_id")
    .eq("id", masters.customer.id)
    .single();
  if (error) throw new Error(`read ALIASSO billing state: ${error.message}`);
  previousBillingStateId = data.billing_state_id;
}

await removeTestRows(db, masters);

const zoneRows = masters.lanes.map((lane) => ({
  tenant_id: masters.customer.tenant_id,
  origin_destination_id: masters.origin.id,
  destination_id: lane.destination.id,
  zone_id: lane.zone.id,
  effective_date: FROM_DATE,
  service: null,
  vendor_id: null,
  product_id: null,
}));
const { error: zoneError } = await db.from("zone_mappings").insert(zoneRows);
if (zoneError) throw new Error(`zone mappings: ${zoneError.message}`);

const customerRates = [];
for (const product of masters.products) {
  for (const lane of masters.lanes) {
    customerRates.push({
      tenant_id: masters.customer.tenant_id,
      customer_id: masters.customer.id,
      product_id: product.id,
      origin_destination_id: masters.origin.id,
      destination_id: lane.destination.id,
      zone_id: lane.zone.id,
      country_id: lane.destination.country_id ?? null,
      contract_no: `${MARKER}${product.code}_${lane.key}`,
      from_date: FROM_DATE,
      to_date: null,
      min_weight: 0,
      rate_per_kg: lane.customerRate,
      rate_type: "PER_KG",
      unit: "KG",
      fuel_pct: 0,
      other_charges: 0,
      status: "ACTIVE",
    });
  }
}
const usaDox = customerRates.find((row) => row.contract_no === `${MARKER}DOX_Z1`);
if (usaDox) {
  customerRates.push({
    ...usaDox,
    customer_id: masters.osmo.id,
    contract_no: `${MARKER}OSMO_DOX_Z1`,
    fuel_pct: 10,
  });
}
const { error: rateError } = await db.from("customer_rates").insert(customerRates);
if (rateError) throw new Error(`customer rates: ${rateError.message}`);

const vendorPlans = [
  { vendor: masters.fedex, service: "FEDEX", rateOf: (lane) => lane.fedexRate, tag: "FEDEX" },
  { vendor: masters.dhl, service: "EXPRESS", rateOf: (lane) => lane.compareRate, tag: "DHL" },
];
const contracts = [];
for (const plan of vendorPlans) {
  for (const product of masters.products) {
    for (const lane of masters.lanes) {
      contracts.push({
        header: {
          tenant_id: masters.customer.tenant_id,
          contract_no: `${MARKER}${plan.tag}_${product.code}_${lane.key}`,
          from_date: FROM_DATE,
          vendor_id: plan.vendor.id,
          origin_destination_id: masters.origin.id,
          zone_id: lane.zone.id,
          country_id: lane.destination.country_id ?? null,
          destination_id: lane.destination.id,
          product_id: product.id,
          service: plan.service,
          unit: "KG",
          status: "ACTIVE",
          cm_divisor: CM_DIVISOR,
          inch_divisor: INCH_DIVISOR,
        },
        rate: plan.rateOf(lane),
      });
    }
  }
}
const { data: savedContracts, error: contractError } = await db
  .from("vendor_contracts")
  .insert(contracts.map((row) => row.header))
  .select("id, contract_no");
if (contractError) throw new Error(`vendor contracts: ${contractError.message}`);
const rateByContract = new Map(contracts.map((row) => [row.header.contract_no, row.rate]));
const slabs = (savedContracts ?? []).map((row) => ({
  tenant_id: masters.customer.tenant_id,
  contract_id: row.id,
  seq: 1,
  rate_type: "PER_KG",
  weight: 9999,
  rate: rateByContract.get(row.contract_no),
}));
const { error: slabError } = await db.from("vendor_contract_slabs").insert(slabs);
if (slabError) throw new Error(`vendor slabs: ${slabError.message}`);

const fuelChild = [
  { seq: 9001, entry_code: `${MARKER}CUSTOMER_FUEL`, vendor: null, customer_id: masters.customer.id },
  { seq: 9002, entry_code: `${MARKER}FEDEX_FUEL`, vendor: "FEDEX", customer_id: masters.customer.id },
  { seq: 9003, entry_code: `${MARKER}DHL_FUEL`, vendor: "DHL", customer_id: masters.customer.id },
  { seq: 9004, entry_code: `${MARKER}OSMO_FUEL`, vendor: null, customer_id: masters.osmo.id },
  { seq: 9005, entry_code: `${MARKER}OSMO_FEDEX_FUEL`, vendor: "FEDEX", customer_id: masters.osmo.id },
].map((row) => ({
  tenant_id: masters.customer.tenant_id,
  customer_id: row.customer_id,
  seq: row.seq,
  entry_code: row.entry_code,
  from_date: FROM_DATE,
  to_date: null,
  vendor: row.vendor,
  product: null,
  destination: null,
  percentage: 10,
}));
const { error: fuelChildError } = await db.from("customer_fuel_surcharges").insert(fuelChild);
if (fuelChildError) throw new Error(`customer fuel: ${fuelChildError.message}`);

const fuelMaster = [
  { entry_code: `${MARKER}CUSTOMER_FUEL`, vendor_id: null, customer_id: masters.customer.id },
  { entry_code: `${MARKER}FEDEX_FUEL`, vendor_id: masters.fedex.id, customer_id: masters.customer.id },
  { entry_code: `${MARKER}DHL_FUEL`, vendor_id: masters.dhl.id, customer_id: masters.customer.id },
  { entry_code: `${MARKER}OSMO_FUEL`, vendor_id: null, customer_id: masters.osmo.id },
  { entry_code: `${MARKER}OSMO_FEDEX_FUEL`, vendor_id: masters.fedex.id, customer_id: masters.osmo.id },
].map((row) => ({
  tenant_id: masters.customer.tenant_id,
  entry_code: row.entry_code,
  customer_id: row.customer_id,
  vendor_id: row.vendor_id,
  from_date: FROM_DATE,
  to_date: null,
  percentage: 10,
  status: "ACTIVE",
}));
const { error: fuelMasterError } = await db.from("fuel_surcharge_rates").insert(fuelMaster);
if (fuelMasterError) throw new Error(`fuel master: ${fuelMasterError.message}`);

let seq = 9101;
const volumetrics = [];
for (const product of masters.products) {
  for (const plan of [
    { vendor: "FEDEX", service: "FEDEX" },
    { vendor: "DHL", service: "EXPRESS" },
  ]) {
    volumetrics.push({
      tenant_id: masters.customer.tenant_id,
      customer_id: masters.customer.id,
      seq: seq++,
      product: product.code,
      vendor: plan.vendor,
      service: plan.service,
      cm_divisor: CM_DIVISOR,
      inch_divisor: INCH_DIVISOR,
      cft: null,
    });
  }
}
const { error: volumetricError } = await db.from("customer_volumetrics").insert(volumetrics);
if (volumetricError) throw new Error(`volumetrics: ${volumetricError.message}`);

const { error: billingError } = await db
  .from("customers")
  .update({ billing_state_id: masters.billingState.id })
  .eq("id", masters.customer.id);
if (billingError) throw new Error(`ALIASSO billing state: ${billingError.message}`);

const { data: karnataka, error: karnatakaError } = await db
  .from("states")
  .select("id, code, name")
  .eq("code", "KA")
  .maybeSingle();
if (karnatakaError || !karnataka) throw new Error(`Karnataka state: ${karnatakaError?.message ?? "not found"}`);

const { data: osmoBefore, error: osmoReadError } = await db
  .from("customers")
  .select("billing_state_id")
  .eq("id", masters.osmo.id)
  .single();
if (osmoReadError) throw new Error(`OSMO check: ${osmoReadError.message}`);
const previousOsmoBillingStateId =
  prior && Object.prototype.hasOwnProperty.call(prior, "previousOsmoBillingStateId")
    ? prior.previousOsmoBillingStateId
    : osmoBefore.billing_state_id;

const { error: osmoBillingError } = await db
  .from("customers")
  .update({ billing_state_id: karnataka.id })
  .eq("id", masters.osmo.id);
if (osmoBillingError) throw new Error(`OSMO billing state: ${osmoBillingError.message}`);

writeState({
  note: NOTE,
  previousBillingStateId,
  previousOsmoBillingStateId,
  customerId: masters.customer.id,
  seededAt: new Date().toISOString(),
});

const summary = {
  note: NOTE,
  client: `${masters.customer.code} ${masters.customer.name}`,
  billingState: `${masters.billingState.code} ${masters.billingState.name}`,
  previousBillingStateId,
  osmoBillingState: `${karnataka.code} ${karnataka.name}`,
  previousOsmoBillingStateId,
  origin: `${masters.origin.code} ${masters.origin.name}`,
  lanes: masters.lanes.map((lane) => ({
    destination: `${lane.destination.code} ${lane.destination.name}`,
    zone: `${lane.zone.code} ${lane.zone.name}`,
    customerPerKg: lane.customerRate,
    fedexPerKg: lane.fedexRate,
    dhlPerKg: lane.compareRate,
  })),
  products: masters.products.map((product) => `${product.code} ${product.name}`),
  fedex: {
    code: masters.fedex.code,
    name: masters.fedex.name,
    service: masters.fedexService.service,
    minKg: masters.fedexService.min_weight,
    maxKg: masters.fedexService.max_weight,
  },
  compareVendor: {
    code: masters.dhl.code,
    name: masters.dhl.name,
    service: masters.dhlService.service,
    minKg: masters.dhlService.min_weight,
    maxKg: masters.dhlService.max_weight,
  },
  divisors: { cm: CM_DIVISOR, inch: INCH_DIVISOR, storedOn: "ALIASSO customer volumetrics" },
  fuelPercent: 10,
  fromDate: FROM_DATE,
  customerRates: customerRates.length,
  vendorContracts: contracts.length,
  marker: MARKER,
};
console.log(JSON.stringify(summary, null, 2));
