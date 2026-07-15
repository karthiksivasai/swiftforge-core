import { z } from "zod";

const notificationType = z.enum([
  "PICKUP",
  "BOOKING",
  "MANIFEST",
  "DRS",
  "POD",
  "INVOICE",
  "OTP",
  "CUSTOMER_PAYMENT",
  "CREDIT_ALERT",
  "WEIGHT_ALERT",
]);

export const emailConfigurationSchema = z.object({
  smtp_host: z.string().min(1, "SMTP host is required"),
  smtp_port: z.coerce.number().int().min(1).max(65535).default(587),
  username: z.string().optional().nullable(),
  password: z.string().optional().nullable(),
  sender_name: z.string().optional().nullable(),
  sender_email: z.string().min(1, "Sender email is required").email("Invalid sender email"),
  use_ssl: z.boolean().default(true),
  is_default: z.boolean().default(true),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  module_code: z.string().optional().nullable(),
  subject_template: z.string().optional().nullable(),
  body_template: z.string().optional().nullable(),
});

export const notificationTemplateSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  notification_type: notificationType,
  channel: z.enum(["EMAIL", "SMS", "WHATSAPP"]).default("EMAIL"),
  subject: z.string().optional().nullable(),
  body: z.string().default(""),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

export const notificationPreferenceSchema = z.object({
  notification_type: notificationType,
  email_enabled: z.boolean().default(true),
  sms_enabled: z.boolean().default(false),
  whatsapp_enabled: z.boolean().default(false),
});

export const userNotificationSchema = z.object({
  user_id: z.string().uuid().optional(),
  username: z.string().optional(),
  title: z.string().min(1, "Title is required"),
  message: z.string().default(""),
  notification_type: z
    .enum([
      "PICKUP",
      "BOOKING",
      "MANIFEST",
      "DRS",
      "POD",
      "INVOICE",
      "OTP",
      "CUSTOMER_PAYMENT",
      "CREDIT_ALERT",
      "WEIGHT_ALERT",
      "GENERAL",
    ])
    .optional()
    .nullable(),
  link: z.string().optional().nullable(),
});

export type EmailConfigurationInput = z.infer<typeof emailConfigurationSchema>;
export type NotificationTemplateInput = z.infer<typeof notificationTemplateSchema>;
export type NotificationPreferenceInput = z.infer<typeof notificationPreferenceSchema>;
export type UserNotificationInput = z.infer<typeof userNotificationSchema>;
