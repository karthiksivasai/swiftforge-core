/**
 * AWB hub report ids → Phase 5 engine report_key.
 */
export const AWB_HUB_KEY_MAP: Record<string, string | null> = {
  billing: "billing-report",
  cod: "cod-report",
  invoice: "invoice-report",
  void: "void-report",
  zero: "zero-report",
};
