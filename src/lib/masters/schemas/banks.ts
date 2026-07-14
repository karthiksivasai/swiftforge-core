import { z } from "zod";

import { reqText } from "./_shared";

export const BANK_STATUSES = ["ACTIVE", "INACTIVE"] as const;

export const bankCreateSchema = z.object({
  code: reqText("Bank Code", 20),
  name: reqText("Bank Name", 150),
  status: z.enum(BANK_STATUSES).default("ACTIVE"),
});

export const bankUpdateSchema = bankCreateSchema.partial();

export type BankCreate = z.infer<typeof bankCreateSchema>;
export type BankUpdate = z.infer<typeof bankUpdateSchema>;

export const bankDefaults: Partial<z.input<typeof bankCreateSchema>> = {
  code: "",
  name: "",
  status: "ACTIVE",
};
