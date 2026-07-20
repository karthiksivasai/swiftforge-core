import { z } from "zod";

import { boolWithDefault, reqText } from "./_shared";

export const EXPENSE_KINDS = ["EXPENSE", "INCOME"] as const;
export const EXPENSE_HEAD_STATUSES = ["ACTIVE", "INACTIVE"] as const;

const nonNegAmount = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v == null || v === "") return 0;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  })
  .refine((v) => v >= 0, "Must be a non-negative amount");

export const expenseHeadCreateSchema = z.object({
  code: reqText("Code", 50),
  name: reqText("Expense Head", 200),
  kind: z.enum(EXPENSE_KINDS).default("EXPENSE"),
  expense_type: z
    .enum(["DIRECT", "INDIRECT", "OPERATIONAL", "ADMINISTRATIVE"])
    .default("OPERATIONAL"),
  authorization_required: boolWithDefault(true),
  authorized_ho_amount: nonNegAmount,
  authorized_branch_amount: nonNegAmount,
  document_required: boolWithDefault(true),
  document_required_amount: nonNegAmount,
  status: z.enum(EXPENSE_HEAD_STATUSES).default("ACTIVE"),
});

export const expenseHeadUpdateSchema = expenseHeadCreateSchema.partial();

export type ExpenseHeadCreate = z.infer<typeof expenseHeadCreateSchema>;
export type ExpenseHeadUpdate = z.infer<typeof expenseHeadUpdateSchema>;
