import { supabase } from "@/integrations/supabase/client";
import type { BaseRow } from "@/lib/masters/core/baseCrud";
import {
  IMPORT_MAX_ROWS,
  type ImportMaster,
  type ImportMode,
  type ImportResult,
  type ImportRow,
} from "@/lib/masters/core/import";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";
import { EXPENSE_MASTER_PERMISSIONS } from "@/lib/permissions";
import {
  expenseHeadCreateSchema,
  expenseHeadUpdateSchema,
  type ExpenseHeadCreate,
  type ExpenseHeadUpdate,
} from "@/lib/masters/schemas/expenseHeads";

export type ExpenseHeadRow = BaseRow & {
  code: string;
  name: string;
  kind: "EXPENSE" | "INCOME";
  expense_type: "DIRECT" | "INDIRECT" | "OPERATIONAL" | "ADMINISTRATIVE";
  authorization_required: boolean;
  authorized_ho_amount: number;
  authorized_branch_amount: number;
  document_required: boolean;
  document_required_amount: number;
  status: "ACTIVE" | "INACTIVE";
};

export const expenseHeadsResource: MasterResource<
  ExpenseHeadRow,
  ExpenseHeadCreate,
  ExpenseHeadUpdate
> = {
  key: "expense_heads",
  table: "expense_heads",
  master: "expense_heads",
  permission: EXPENSE_MASTER_PERMISSIONS.expense_heads,
  label: { singular: "Expense", plural: "Expenses" },
  columns:
    "id, tenant_id, code, name, kind, expense_type, authorization_required, authorized_ho_amount, authorized_branch_amount, document_required, document_required_amount, status, created_at, created_by, updated_at, updated_by, deleted_at, row_version",
  searchColumns: ["code", "name", "kind"],
  orderBy: "name",
  ascending: true,
  importColumns: [
    "code",
    "name",
    "kind",
    "authorization_required",
    "authorized_ho_amount",
    "authorized_branch_amount",
    "document_required",
    "document_required_amount",
    "status",
  ],
  createSchema: expenseHeadCreateSchema,
  updateSchema: expenseHeadUpdateSchema,
};

export const EXPENSE_IMPORT_HEADER_ALIASES: Readonly<Record<string, readonly string[]>> = {
  code: ["Expense Code", "Code"],
  name: ["Expense Head", "Name", "Expense Name"],
  kind: ["Expense Type", "Type", "Kind"],
  authorization_required: ["Is Authorized", "Authorisation Required", "Authorization Required"],
  authorized_ho_amount: ["Authorised By HO Amount", "Authorized By HO Amount", "HO Amount"],
  authorized_branch_amount: [
    "Authorised By Branch Amount",
    "Authorized By Branch Amount",
    "Branch Amount",
  ],
  document_required: ["Document Required"],
  document_required_amount: ["Document Required For Amount", "Document Amount"],
  status: ["Status", "Active"],
};

/** Derive a stable code from Expense Head name when the CSV omits Code. */
export function expenseCodeFromName(name: string): string {
  const slug = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
  return slug || "EXP";
}

/** Normalize mapped CSV rows for import_expense_heads (code + kind defaults). */
export function normalizeExpenseImportRow(rec: Record<string, string>): ImportRow {
  const name = (rec.name || "").trim();
  const kindRaw = (rec.kind || "EXPENSE").trim().toUpperCase();
  const kind = kindRaw.startsWith("INC") ? "INCOME" : "EXPENSE";
  return {
    ...rec,
    name,
    code: (rec.code || "").trim() || (name ? expenseCodeFromName(name) : ""),
    kind,
    authorization_required: (rec.authorization_required || "1").trim(),
  };
}

async function importExpenseHeadsOnce(
  mode: ImportMode,
  rows: ReadonlyArray<ImportRow>,
): Promise<ImportResult> {
  if (rows.length > IMPORT_MAX_ROWS) {
    throw new Error(
      `Import batch of ${rows.length} exceeds the ${IMPORT_MAX_ROWS}-row limit.`,
    );
  }
  const { data, error } = await supabase.rpc("import_expense_heads", {
    p_mode: mode,
    p_rows: rows,
  });
  if (error) throw new Error(error.message);
  return data as ImportResult;
}

/** CourierWala-style expense head import (Name / Is Authorized; code optional). */
export async function importExpenseHeadsChunked(
  mode: ImportMode,
  rows: ReadonlyArray<ImportRow>,
  opts?: { chunkSize?: number },
): Promise<ImportResult & { job_ids: string[] }> {
  const chunkSize = Math.min(Math.max(1, opts?.chunkSize ?? 2000), IMPORT_MAX_ROWS);
  const aggregate: ImportResult & { job_ids: string[] } = {
    master: "expense_heads" satisfies ImportMaster,
    mode,
    job_id: null,
    total: 0,
    ok: 0,
    skipped: 0,
    error_count: 0,
    errors: [],
    job_ids: [],
  };

  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const res = await importExpenseHeadsOnce(mode, chunk);
    aggregate.total += res.total;
    aggregate.ok += res.ok;
    aggregate.skipped += res.skipped;
    aggregate.error_count += res.error_count;
    if (res.job_id) aggregate.job_ids.push(res.job_id);
    for (const e of res.errors) {
      aggregate.errors.push({ ...e, row_no: e.row_no + offset });
    }
  }
  aggregate.job_id = aggregate.job_ids[0] ?? null;
  return aggregate;
}
