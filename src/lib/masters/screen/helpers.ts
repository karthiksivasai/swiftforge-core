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

type ImportResultLike = {
  ok: number;
  skipped: number;
  error_count: number;
  errors?: ReadonlyArray<{ row_no: number; message: string }>;
};

/** Success toast, or error toast with up to 3 sample row messages. */
export function formatImportToast(res: ImportResultLike): {
  ok: boolean;
  message: string;
} {
  const summary = importSummary(res);
  if (res.error_count <= 0) return { ok: true, message: summary };
  const sample = (res.errors ?? [])
    .slice(0, 3)
    .map((err) => `Row ${err.row_no}: ${err.message}`)
    .join("; ");
  return { ok: false, message: sample ? `${summary} — ${sample}` : summary };
}
