/** Hard cap shared by the import UI and record_bagging. */
export const BAGGING_LINE_CAP = 500;

export const BAGGING_TEMPLATE_HEADER = [
  "Bag No",
  "AWB No",
  "Weight",
  "Pcs",
  "Forwarding No",
  "CRN",
] as const;

export type BaggingWeightResult = { ok: true; weight: string } | { ok: false; error: string };

/**
 * Weight for a bagging line. Blank uses the shipment weight.
 * The value 10 is rejected when the shipment weight is not 10, so a missing
 * weight cannot be stored as an invented 10.000.
 */
export function resolveBaggingLineWeight(
  entered: string | undefined,
  shipmentWeight: string | null | undefined,
): BaggingWeightResult {
  const shipRaw = (shipmentWeight ?? "").trim();
  if (!shipRaw) return { ok: false, error: "AWB is not in shipments" };
  const ship = Number(shipRaw.replace(/,/g, ""));
  if (!Number.isFinite(ship) || ship <= 0) {
    return { ok: false, error: "Shipment has no weight" };
  }

  const raw = (entered ?? "").trim();
  if (!raw) return { ok: true, weight: ship.toFixed(3) };

  const enteredNum = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(enteredNum) || enteredNum <= 0) {
    return { ok: false, error: "Weight must be greater than zero" };
  }
  if (enteredNum === 10 && ship !== 10) {
    return { ok: false, error: "Weight 10.000 is only allowed when the shipment weight is 10" };
  }
  return { ok: true, weight: enteredNum.toFixed(3) };
}
