import { z } from "zod";

import { optNonNegNumber, optText, reqText } from "./_shared";

export const CHARGE_TYPES = ["AIRWAYBILL", "EXPENSE", "INCOME", "OBC", "PURCHASE"] as const;

/** Calculation bases shown in the UI (free text in the DB; kept for the picker). */
export const CALC_BASES = [
  "Actual Weight",
  "Charge Weight",
  "COD Amount",
  "Commercial",
  "FLAT",
  "Freight",
  "Medical Charges",
  "ODA",
  "ODA1",
  "ODA2",
  "ODA3",
  "Pieces",
  "POINT",
  "Shipment Value",
] as const;

export const chargeCreateSchema = z.object({
  code: reqText("Description Code", 50),
  name: reqText("Description Name", 200),
  base_on: z
    .string()
    .trim()
    .min(1, "Calculation base is required")
    .max(50)
    .default("Actual Weight"),
  charge_type: z.enum(CHARGE_TYPES).default("AIRWAYBILL"),
  charge_rate: optNonNegNumber().transform((v) => v ?? 0),
  apply_fuel: z.boolean().default(false),
  apply_tax_on_fuel: z.boolean().default(false),
  apply_tax: z.boolean().default(false),
  hsn_code: optText(50),
  sequence: optNonNegNumber().transform((v) => v ?? 0),
});

export const chargeUpdateSchema = chargeCreateSchema.partial();

/** Client-side validation for the dependency (M:N) sync RPC input. */
export const chargeDependencyIdsSchema = z.array(z.string().uuid());

export type ChargeCreate = z.infer<typeof chargeCreateSchema>;
export type ChargeUpdate = z.infer<typeof chargeUpdateSchema>;

export const chargeDefaults: Partial<z.input<typeof chargeCreateSchema>> = {
  code: "",
  name: "",
  base_on: "Actual Weight",
  charge_type: "AIRWAYBILL",
  charge_rate: 0,
  apply_fuel: false,
  apply_tax_on_fuel: false,
  apply_tax: false,
  hsn_code: "",
  sequence: 0,
};
