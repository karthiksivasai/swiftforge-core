import { z } from "zod";

import { optEmail, optEnum, optText, reqText, uuidRef } from "./_shared";

export const DESTINATION_TYPES = ["DOMESTIC", "INTERNATIONAL", "LOCAL"] as const;
export const SERVICE_TYPES = ["REGULAR", "METRO", "REMOTE"] as const;
export const DESTINATION_STATUSES = ["ACTIVE", "INACTIVE"] as const;

/**
 * CourierWala field sets by dest_type:
 * - DOMESTIC: state + service_type (+ zone/branches); country typically IN
 * - INTERNATIONAL: country + zone; no state / service_type
 * - LOCAL: state + zone; no country / service_type
 *
 * DB columns stay nullable; create transform clears fields that do not apply.
 */
const destinationFieldsSchema = z.object({
  dest_type: z.enum(DESTINATION_TYPES).default("DOMESTIC"),
  code: reqText("Code", 20),
  name: reqText("Name", 150),
  country_id: uuidRef(),
  state_id: uuidRef(),
  zone_id: uuidRef(),
  country_code: optText(20),
  state_code: optText(20),
  service_type: optEnum(SERVICE_TYPES),
  main_branch_id: uuidRef(),
  manifest_branch_id: uuidRef(),
  email: optEmail(),
  mobile: optText(20),
  status: z.enum(DESTINATION_STATUSES).default("ACTIVE"),
});

export function clearDestinationFieldsByType<
  T extends {
    dest_type?: (typeof DESTINATION_TYPES)[number];
    country_id?: string | null;
    state_id?: string | null;
    country_code?: string | null;
    state_code?: string | null;
    service_type?: (typeof SERVICE_TYPES)[number] | null;
  },
>(row: T): T {
  if (row.dest_type === "INTERNATIONAL") {
    return { ...row, state_id: null, state_code: null, service_type: null };
  }
  if (row.dest_type === "LOCAL") {
    return { ...row, country_id: null, country_code: null, service_type: null };
  }
  return row;
}

export const destinationCreateSchema = destinationFieldsSchema.transform(
  clearDestinationFieldsByType,
);

export const destinationUpdateSchema = destinationFieldsSchema.partial().transform((row) =>
  clearDestinationFieldsByType(row),
);

export type DestinationCreate = z.infer<typeof destinationCreateSchema>;
export type DestinationUpdate = z.infer<typeof destinationUpdateSchema>;

export const destinationDefaults: Partial<z.input<typeof destinationFieldsSchema>> = {
  dest_type: "DOMESTIC",
  code: "",
  name: "",
  country_id: null,
  state_id: null,
  zone_id: null,
  country_code: "",
  state_code: "",
  service_type: null,
  main_branch_id: null,
  manifest_branch_id: null,
  email: "",
  mobile: "",
  status: "ACTIVE",
};
