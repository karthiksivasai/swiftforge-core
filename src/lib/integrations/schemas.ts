import { z } from "zod";

export const integrationCredentialSchema = z.object({
  provider_code: z.string().min(1, "Provider is required"),
  username: z.string().optional().nullable(),
  password: z.string().optional().nullable(),
  api_key: z.string().optional().nullable(),
  api_secret: z.string().optional().nullable(),
  account_number: z.string().optional().nullable(),
  endpoint: z.string().optional().nullable(),
  sandbox_mode: z.boolean().default(true),
  is_active: z.boolean().default(true),
  remark: z.string().optional().nullable(),
});

export type IntegrationCredentialInput = z.infer<typeof integrationCredentialSchema>;

export const WEBHOOK_EVENT_CODES = [
  "SHIPMENT_BOOKED",
  "SHIPMENT_CANCELLED",
  "SHIPMENT_DELIVERED",
  "SHIPMENT_UNDELIVERED",
  "POD_UPDATED",
  "TRACKING_UPDATED",
] as const;

export const webhookSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  endpoint_url: z
    .string()
    .trim()
    .min(1, "Endpoint URL is required")
    .refine((v) => /^(https?:\/\/|test:\/\/)/i.test(v), {
      message: "URL must start with http(s):// or test://",
    }),
  subscribed_events: z.array(z.enum(WEBHOOK_EVENT_CODES)).min(1, "Select at least one event"),
  is_active: z.boolean().default(true),
  remark: z.string().optional().nullable(),
  signing_secret: z.string().optional().nullable(),
  regenerate_secret: z.boolean().optional().default(false),
});

export type WebhookInput = z.infer<typeof webhookSchema>;
