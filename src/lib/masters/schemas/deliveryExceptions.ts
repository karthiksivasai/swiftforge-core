import { z } from "zod";

import { reqText } from "./_shared";

export const EXCEPTION_TYPES = ["DELIVERED", "UNDELIVERED"] as const;

export const deliveryExceptionCreateSchema = z.object({
  code: reqText("Exception Code", 20),
  name: reqText("Exception Name", 200),
  exc_type: z.enum(EXCEPTION_TYPES).default("UNDELIVERED"),
  inscan: z.boolean().default(false),
  show_on_mobile: z.boolean().default(false),
});

export const deliveryExceptionUpdateSchema = deliveryExceptionCreateSchema.partial();

export type DeliveryExceptionCreate = z.infer<typeof deliveryExceptionCreateSchema>;
export type DeliveryExceptionUpdate = z.infer<typeof deliveryExceptionUpdateSchema>;

export const deliveryExceptionDefaults: Partial<z.input<typeof deliveryExceptionCreateSchema>> = {
  code: "",
  name: "",
  exc_type: "UNDELIVERED",
  inscan: false,
  show_on_mobile: false,
};
