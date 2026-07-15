/** Notification / email configuration types — Milestone 6E. */

export type NotificationChannel = "EMAIL" | "SMS" | "WHATSAPP";

export type NotificationType =
  | "PICKUP"
  | "BOOKING"
  | "MANIFEST"
  | "DRS"
  | "POD"
  | "INVOICE"
  | "OTP"
  | "CUSTOMER_PAYMENT"
  | "CREDIT_ALERT"
  | "WEIGHT_ALERT"
  | "GENERAL";

export type EmailConfiguration = {
  id: string;
  smtp_host: string;
  smtp_port: number;
  username: string | null;
  has_password: boolean;
  sender_name: string | null;
  sender_email: string;
  use_ssl: boolean;
  is_default: boolean;
  status: "ACTIVE" | "INACTIVE";
  module_code: string | null;
  subject_template: string | null;
  body_template: string | null;
  print_flags: Record<string, unknown>;
  row_version: number;
  created_at?: string;
  updated_at?: string;
};

export type EmailConfigurationFields = {
  smtp_host: string;
  smtp_port?: number | string;
  username?: string | null;
  password?: string | null;
  sender_name?: string | null;
  sender_email: string;
  use_ssl?: boolean | string;
  is_default?: boolean | string;
  status?: "ACTIVE" | "INACTIVE";
  module_code?: string | null;
  subject_template?: string | null;
  body_template?: string | null;
  print_flags?: Record<string, unknown>;
};

export type NotificationTemplate = {
  id: string;
  code: string;
  name: string;
  notification_type: Exclude<NotificationType, "GENERAL">;
  channel: NotificationChannel;
  subject: string | null;
  body: string;
  status: "ACTIVE" | "INACTIVE";
  row_version: number;
  created_at?: string;
  updated_at?: string;
};

export type NotificationTemplateFields = {
  code: string;
  name: string;
  notification_type: string;
  channel?: string;
  subject?: string | null;
  body?: string;
  status?: "ACTIVE" | "INACTIVE";
};

export type NotificationPreference = {
  id: string;
  notification_type: Exclude<NotificationType, "GENERAL">;
  email_enabled: boolean;
  sms_enabled: boolean;
  whatsapp_enabled: boolean;
  row_version: number;
};

export type UserNotification = {
  id: string;
  user_id: string;
  username?: string | null;
  full_name?: string | null;
  notification_type: string | null;
  title: string;
  message: string;
  link: string | null;
  status: "UNREAD" | "READ";
  read_at: string | null;
  created_at: string;
  row_version: number;
};

export const NOTIFICATION_TYPES: Exclude<NotificationType, "GENERAL">[] = [
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
];

export const EMAIL_MODULE_CODES: Record<string, string> = {
  "EMAIL ON FORWARDING": "FORWARDING",
  "EMAIL ON PROGRESS": "PROGRESS",
  ESTATEMENT: "ESTATEMENT",
  "ESTATEMENT WEIGHT ALERT": "WEIGHT_ALERT",
};
