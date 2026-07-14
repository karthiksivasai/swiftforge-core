/**
 * Reusable Zod field builders for master schemas.
 *
 * Schemas describe the DB *column* shape (snake_case): their OUTPUT (`z.infer`)
 * is exactly what `baseCrud.create/update` sends to Supabase. Optional text/uuid
 * fields normalize "" and undefined to `null` so cleared inputs unset columns
 * cleanly. Screens (M6) validate form input through these before mutating.
 */
import { z } from "zod";

/** Required, trimmed, non-empty text. */
export const reqText = (label: string, max = 200) =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`);

/** Optional text -> string | null (empty becomes null). */
export const optText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .nullable()
    .optional()
    .transform((v) => (v && v.length ? v : null));

/** Optional email -> string | null (empty allowed, otherwise must be valid). */
export const optEmail = () =>
  z
    .union([z.string().trim().email("Enter a valid email"), z.literal(""), z.null(), z.undefined()])
    .transform((v) => (v && v !== "" ? v : null));

/** Required uuid foreign-key reference. */
export const reqUuid = (label: string) =>
  z.string({ required_error: `${label} is required` }).uuid(`${label} is required`);

/** Optional uuid foreign-key reference -> string | null. */
export const uuidRef = () =>
  z
    .union([z.string().uuid("Invalid selection"), z.literal(""), z.null(), z.undefined()])
    .transform((v) => (v && v.length ? v : null));

/** Boolean with a default (for checkboxes/switches). */
export const boolWithDefault = (def: boolean) => z.boolean().default(def);

/** Optional non-negative number -> number | null. */
export const optNonNegNumber = () =>
  z
    .union([z.number(), z.literal(""), z.null(), z.undefined()])
    .transform((v) => (v === "" || v == null ? null : Number(v)))
    .refine((v) => v === null || (!Number.isNaN(v) && v >= 0), "Must be a non-negative number");

/** Optional enum -> T | null. */
export const optEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .enum(values)
    .nullable()
    .optional()
    .transform((v) => v ?? null);
