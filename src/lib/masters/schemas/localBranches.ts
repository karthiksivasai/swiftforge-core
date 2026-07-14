import { z } from "zod";

import { optEmail, optText, reqText, uuidRef } from "./_shared";

export const LOCAL_BRANCH_STATUSES = ["ACTIVE", "INACTIVE"] as const;

export const localBranchCreateSchema = z.object({
  code: reqText("Branch Code", 50),
  name: reqText("Name", 200),
  branch_id: uuidRef(),
  address1: optText(500),
  address2: optText(500),
  city: optText(100),
  pin_code: optText(20),
  state_id: uuidRef(),
  billing_state_id: uuidRef(),
  gst_no: optText(30),
  phone: optText(30),
  email: optEmail(),
  serviceable_pincodes: z.array(z.string()).default([]),
  wizard_extras: z.record(z.unknown()).default({}),
  status: z.enum(LOCAL_BRANCH_STATUSES).default("ACTIVE"),
});

export const localBranchUpdateSchema = localBranchCreateSchema.partial();

export type LocalBranchCreate = z.infer<typeof localBranchCreateSchema>;
export type LocalBranchUpdate = z.infer<typeof localBranchUpdateSchema>;

export const localBranchDefaults: Partial<z.input<typeof localBranchCreateSchema>> = {
  code: "",
  name: "",
  branch_id: "",
  address1: "",
  address2: "",
  city: "",
  pin_code: "",
  state_id: "",
  billing_state_id: "",
  gst_no: "",
  phone: "",
  email: "",
  serviceable_pincodes: [],
  wizard_extras: {},
  status: "ACTIVE",
};
