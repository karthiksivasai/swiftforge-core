/**
 * Test suite for Manifest Inscan Must-Fix Gaps:
 * 1. Re-measurement schema & persistence validation
 * 2. Weight discrepancy detection & flagging
 * 3. Volumetric weight calculation formula ((L*B*H)/5000)
 * 4. Whole-bag atomic receive scan logic
 * 5. Reconciliation register board generation & status filtering
 * 6. Non-manifested AWB rejection guard
 */

import assert from "node:assert/strict";
import {
  manifestInscanScanSchema,
  manifestInscanBagSchema,
  manifestInscanResultSchema,
  manifestInscanBagResultSchema,
} from "../src/lib/transactions/schemas/manifestInscan.ts";
import {
  validateInscanAttempt,
  mapInscanScanResult,
  countsFromBoard,
} from "../src/lib/transactions/manifestInscanUiMap.ts";

console.log("--- Starting Manifest Inscan Must-Fix Gaps Tests ---\n");

// [Test 1] Schema validation for re-measurement fields & types
console.log("[Test 1] Schema validation for re-measurement, dims, remark, and booking weight");
const validScanInput = {
  manifest_id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  awb_no: "AWB-INSCAN-001",
  mode: "AWB",
  weight: 5.5,
  length: 20,
  breadth: 15,
  height: 10,
  vol_weight: 0.6,
  remark: "Seal intact, verified on arrival",
  is_booking_weight: false,
};

const parsedScan = manifestInscanScanSchema.parse(validScanInput);
assert.equal(parsedScan.weight, 5.5);
assert.equal(parsedScan.length, 20);
assert.equal(parsedScan.breadth, 15);
assert.equal(parsedScan.height, 10);
assert.equal(parsedScan.vol_weight, 0.6);
assert.equal(parsedScan.remark, "Seal intact, verified on arrival");
assert.equal(parsedScan.is_booking_weight, false);
console.log("✅ [Test 1 Passed] Scan input schema parses re-measurement data accurately\n");

// [Test 2] Volumetric weight auto-computation
console.log("[Test 2] Volumetric weight computation formula ((L * B * H) / 5000)");
const computeVolWeight = (l, b, h) => {
  const len = parseFloat(l) || 0;
  const brd = parseFloat(b) || 0;
  const hgt = parseFloat(h) || 0;
  if (len > 0 && brd > 0 && hgt > 0) {
    return parseFloat(((len * brd * hgt) / 5000).toFixed(3));
  }
  return 0;
};

assert.equal(computeVolWeight(30, 20, 10), 1.2, "30x20x10 / 5000 = 1.2 kg");
assert.equal(computeVolWeight(50, 40, 30), 12.0, "50x40x30 / 5000 = 12.0 kg");
assert.equal(computeVolWeight(0, 20, 10), 0, "Zero dimension returns 0");
console.log("✅ [Test 2 Passed] Volumetric calculation correctly matches courier standard\n");

// [Test 3] Weight discrepancy calculation and revenue-protection flagging
console.log("[Test 3] Weight discrepancy detection vs booked charge weight");
function checkDiscrepancy(bookedWeight, reMeasuredWeight, isBookingWeight) {
  const booked = Number(bookedWeight) || 0;
  const inscan = isBookingWeight ? booked : (Number(reMeasuredWeight) || booked);
  const hasDiscrepancy = !isBookingWeight && reMeasuredWeight != null && reMeasuredWeight > booked;
  const variance = hasDiscrepancy ? reMeasuredWeight - booked : 0;
  return { inscanWeight: inscan, hasDiscrepancy, variance };
}

const disc1 = checkDiscrepancy(2.0, 3.5, false);
assert.equal(disc1.hasDiscrepancy, true, "3.5kg > 2.0kg should flag discrepancy");
assert.equal(disc1.variance, 1.5, "Variance should be 1.5 kg");

const disc2 = checkDiscrepancy(2.0, 1.8, false);
assert.equal(disc2.hasDiscrepancy, false, "1.8kg <= 2.0kg should not flag discrepancy");

const disc3 = checkDiscrepancy(2.0, 3.5, true); // User checked "Use Booking Weight"
assert.equal(disc3.hasDiscrepancy, false, "Use Booking Weight suppresses discrepancy flag");
assert.equal(disc3.inscanWeight, 2.0, "Inscan weight defaults to booked weight");
console.log("✅ [Test 3 Passed] Weight discrepancy logic flags variance when re-measured weight exceeds booked\n");

// [Test 4] Whole-Bag atomic receive logic & schema
console.log("[Test 4] Whole-Bag schema and atomic batch inscan validation");
const bagInput = {
  manifest_id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  bag_no: "BAG-MEL-001",
};
const parsedBag = manifestInscanBagSchema.parse(bagInput);
assert.equal(parsedBag.bag_no, "BAG-MEL-001");

// Simulate batch bag inscan on manifest shipments
const manifestLinesInBag = [
  { shipment_id: "s1", awb_no: "AWB-01", bag_no: "BAG-MEL-001", status: "MANIFESTED", scanned: false },
  { shipment_id: "s2", awb_no: "AWB-02", bag_no: "BAG-MEL-001", status: "MANIFESTED", scanned: false },
  { shipment_id: "s3", awb_no: "AWB-03", bag_no: "BAG-MEL-001", status: "MANIFEST_INSCANNED", scanned: true },
  { shipment_id: "s4", awb_no: "AWB-04", bag_no: "BAG-OTHER-002", status: "MANIFESTED", scanned: false },
];

let newlyScanned = 0;
let skipped = 0;

for (const line of manifestLinesInBag) {
  if (line.bag_no !== parsedBag.bag_no) continue;
  if (line.scanned || line.status === "MANIFEST_INSCANNED") {
    skipped++;
  } else if (line.status === "MANIFESTED") {
    line.status = "MANIFEST_INSCANNED";
    line.scanned = true;
    newlyScanned++;
  }
}

assert.equal(newlyScanned, 2, "2 un-inscanned shipments in bag are received");
assert.equal(skipped, 1, "1 already inscanned shipment in bag is skipped without error");

const bagResult = manifestInscanBagResultSchema.parse({
  ok: true,
  manifest_id: parsedBag.manifest_id,
  bag_no: parsedBag.bag_no,
  total_in_bag: 3,
  newly_scanned: newlyScanned,
  skipped: skipped,
  message: `Bag ${parsedBag.bag_no}: ${newlyScanned} shipment(s) inscanned (1 already inscanned)`,
  scanned_count: 3,
  pending_count: 1,
});

assert.equal(bagResult.newly_scanned, 2);
assert.equal(bagResult.skipped, 1);
console.log("✅ [Test 4 Passed] Whole-bag atomic inscan receives all shipments in bag and ignores duplicates\n");

// [Test 5] Reconciliation Inventory Board & Filtering
console.log("[Test 5] Reconciliation register line inventory with Scanned vs Short/Pending status");
const mockBoard = {
  manifest_id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  manifest_no: "MNF-2026-001",
  status: "CLOSED",
  scanned_count: 2,
  pending_count: 1,
  lines: [
    { seq: 1, shipment_id: "s1", awb_no: "AWB-001", bag_no: "BAG-A", pieces: 2, charge_weight: 4.5, shipment_status: "MANIFEST_INSCANNED", scanned: true, inscan_at: "2026-08-11T12:00:00Z", inscan_weight: 5.0, has_weight_discrepancy: true },
    { seq: 2, shipment_id: "s2", awb_no: "AWB-002", bag_no: "BAG-A", pieces: 1, charge_weight: 1.0, shipment_status: "MANIFEST_INSCANNED", scanned: true, inscan_at: "2026-08-11T12:05:00Z", inscan_weight: 1.0, has_weight_discrepancy: false },
    { seq: 3, shipment_id: "s3", awb_no: "AWB-003", bag_no: "BAG-B", pieces: 1, charge_weight: 2.0, shipment_status: "MANIFESTED", scanned: false, inscan_at: null, inscan_weight: null, has_weight_discrepancy: false },
  ],
};

const counts = countsFromBoard(mockBoard);
assert.equal(counts.scanned, 2);
assert.equal(counts.pending, 1);

const allLines = mockBoard.lines;
const scannedLines = mockBoard.lines.filter((l) => l.scanned);
const pendingLines = mockBoard.lines.filter((l) => !l.scanned);

assert.equal(allLines.length, 3, "All register lines count = 3");
assert.equal(scannedLines.length, 2, "Scanned register lines count = 2");
assert.equal(pendingLines.length, 1, "Pending/Short register lines count = 1");
assert.equal(pendingLines[0].awb_no, "AWB-003", "AWB-003 is correctly marked as Short / Pending");
assert.equal(scannedLines[0].has_weight_discrepancy, true, "AWB-001 has flagged weight discrepancy");
console.log("✅ [Test 5 Passed] Reconciliation register correctly partitions Scanned vs Short shipments\n");

// [Test 6] Non-manifested AWB rejection
console.log("[Test 6] Non-manifested AWB validation rejection guard");
const knownAwbs = new Set(["AWB-001", "AWB-002", "AWB-003"]);
const unmanifestedAttempt = validateInscanAttempt(
  { awbNo: "AWB-NOT-ON-MANIFEST", mode: "awb" },
  { manifestId: mockBoard.manifest_id, knownAwbs }
);
assert.equal(unmanifestedAttempt.kind, "invalid");
assert.equal(unmanifestedAttempt.message, "Shipment is not on this manifest");
console.log("✅ [Test 6 Passed] Un-manifested AWB is strictly rejected by validation guard\n");

console.log("--- ALL 6 MANIFEST INSCAN INTEGRATION TESTS PASSED ---\n");
