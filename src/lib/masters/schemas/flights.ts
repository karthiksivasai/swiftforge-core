import { z } from "zod";

import { reqText } from "./_shared";

export const FLIGHT_TYPES = ["PRIME", "GCR"] as const;

export const flightCreateSchema = z.object({
  code: reqText("Flight Code", 50),
  name: reqText("Flight Name", 150),
  flight_type: z.enum(FLIGHT_TYPES).default("PRIME"),
});

export const flightUpdateSchema = flightCreateSchema.partial();

export type FlightCreate = z.infer<typeof flightCreateSchema>;
export type FlightUpdate = z.infer<typeof flightUpdateSchema>;

export const flightDefaults: Partial<z.input<typeof flightCreateSchema>> = {
  code: "",
  name: "",
  flight_type: "PRIME",
};
