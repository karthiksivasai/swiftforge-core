/**
 * Removes the international AWB audit seed and restores ALIASSO billing state.
 * Do not run until go-live. It deletes:
 *   - shipments 000028–000043 and any shipment whose reference starts with TEST_AWB_
 *   - their pieces, charge snapshots, comments, attachments, events, rating_audit,
 *     shipment_documents (the AWB invoice, label, and KYC files), and proforma items
 *   - audit_logs rows for those shipment ids
 *   - TEST_AWB_ vendor contracts and slabs, customer rates, fuel master rows,
 *     customer fuel rows, the ALIASSO test volumetric rows, and the seeded zone mappings
 *   - then restores the ALIASSO and OSMO billing states saved in .seed-state.json
 *   - then resets AUTO AWB stock to 100001–499999 and parks the old AWB counter at 100001
 * Zone master rows and the finance invoices register are not deleted. AWB invoices
 * live in shipment_documents, which this script does delete.
 *
 * Run from swiftforge-core:
 *   node scripts/awb-audit/cleanup-international-test-data.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  STATE_PATH,
  createDb,
  readState,
  removeTestAwbs,
  removeTestRows,
  resolveMasters,
} from "./test-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const db = createDb(root);
const masters = await resolveMasters(db);
const state = readState();

const removedAwbs = await removeTestAwbs(db);
await removeTestRows(db, masters);

const restoreId = state ? state.previousBillingStateId : null;
const { error } = await db
  .from("customers")
  .update({ billing_state_id: restoreId })
  .eq("id", masters.customer.id)
  .eq("code", "ALIASSO");
if (error) throw new Error(`restore ALIASSO billing state: ${error.message}`);

let restoreOsmoId = null;
if (state && Object.prototype.hasOwnProperty.call(state, "previousOsmoBillingStateId")) {
  restoreOsmoId = state.previousOsmoBillingStateId;
  const { error: osmoRestoreError } = await db
    .from("customers")
    .update({ billing_state_id: restoreOsmoId })
    .eq("id", masters.osmo.id)
    .eq("code", "OSMO");
  if (osmoRestoreError) throw new Error(`restore OSMO billing state: ${osmoRestoreError.message}`);
}

if (fs.existsSync(STATE_PATH)) fs.unlinkSync(STATE_PATH);

const { data: series, error: seriesError } = await db.rpc("reset_awb_series_after_test_cleanup");
if (seriesError) throw new Error(`reset AWB numbering: ${seriesError.message}`);

console.log(
  JSON.stringify(
    {
      removed: "TEST_AWB_ rows",
      removedAwbs,
      aliassoBillingStateRestoredTo: restoreId,
      osmoBillingStateRestoredTo: restoreOsmoId,
      numbering: series,
    },
    null,
    2,
  ),
);
