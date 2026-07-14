/**
 * Small shared helpers for geo master screen wiring (Milestone 6).
 */
import { ZodError } from "zod";

/** Turn a thrown value (Zod validation, domain error, or unknown) into a toast string. */
export function toErrorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof ZodError) return err.issues[0]?.message ?? fallback;
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

/** Human summary of an import result for a success toast. */
export function importSummary(res: { ok: number; skipped: number; error_count: number }): string {
  const parts = [`Imported ${res.ok}`];
  if (res.skipped) parts.push(`skipped ${res.skipped}`);
  if (res.error_count) parts.push(`${res.error_count} error${res.error_count === 1 ? "" : "s"}`);
  return parts.join(", ");
}
