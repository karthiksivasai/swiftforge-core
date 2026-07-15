/**
 * Notifications & email configuration RPCs — Milestone 6E.
 */
import { supabase } from "@/integrations/supabase/client";
import { translateDbError } from "@/lib/masters/core/baseCrud";
import type {
  EmailConfiguration,
  EmailConfigurationFields,
  NotificationPreference,
  NotificationTemplate,
  NotificationTemplateFields,
  UserNotification,
} from "@/lib/notifications/types";

function asObject(data: unknown): Record<string, unknown> {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return {};
}

function asArray<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

function mapEmail(row: Record<string, unknown>): EmailConfiguration {
  return {
    id: String(row.id ?? ""),
    smtp_host: String(row.smtp_host ?? ""),
    smtp_port: Number(row.smtp_port ?? 587),
    username: (row.username as string | null) ?? null,
    has_password: row.has_password === true || row.has_password === "true",
    sender_name: (row.sender_name as string | null) ?? null,
    sender_email: String(row.sender_email ?? ""),
    use_ssl: row.use_ssl !== false && row.use_ssl !== "false",
    is_default: row.is_default !== false && row.is_default !== "false",
    status: (String(row.status ?? "ACTIVE") as "ACTIVE" | "INACTIVE") || "ACTIVE",
    module_code: (row.module_code as string | null) ?? null,
    subject_template: (row.subject_template as string | null) ?? null,
    body_template: (row.body_template as string | null) ?? null,
    print_flags: (row.print_flags as Record<string, unknown>) ?? {},
    row_version: Number(row.row_version ?? 1),
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

function mapTemplate(row: Record<string, unknown>): NotificationTemplate {
  return {
    id: String(row.id ?? ""),
    code: String(row.code ?? ""),
    name: String(row.name ?? ""),
    notification_type: String(
      row.notification_type ?? "BOOKING",
    ) as NotificationTemplate["notification_type"],
    channel: String(row.channel ?? "EMAIL") as NotificationTemplate["channel"],
    subject: (row.subject as string | null) ?? null,
    body: String(row.body ?? ""),
    status: (String(row.status ?? "ACTIVE") as "ACTIVE" | "INACTIVE") || "ACTIVE",
    row_version: Number(row.row_version ?? 1),
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

function mapPreference(row: Record<string, unknown>): NotificationPreference {
  return {
    id: String(row.id ?? ""),
    notification_type: String(
      row.notification_type ?? "BOOKING",
    ) as NotificationPreference["notification_type"],
    email_enabled: row.email_enabled !== false && row.email_enabled !== "false",
    sms_enabled: row.sms_enabled === true || row.sms_enabled === "true",
    whatsapp_enabled: row.whatsapp_enabled === true || row.whatsapp_enabled === "true",
    row_version: Number(row.row_version ?? 1),
  };
}

function mapUserNotification(row: Record<string, unknown>): UserNotification {
  return {
    id: String(row.id ?? ""),
    user_id: String(row.user_id ?? ""),
    username: (row.username as string | null) ?? null,
    full_name: (row.full_name as string | null) ?? null,
    notification_type: (row.notification_type as string | null) ?? null,
    title: String(row.title ?? ""),
    message: String(row.message ?? ""),
    link: (row.link as string | null) ?? null,
    status: (String(row.status ?? "UNREAD") as "UNREAD" | "READ") || "UNREAD",
    read_at: row.read_at ? String(row.read_at) : null,
    created_at: String(row.created_at ?? ""),
    row_version: Number(row.row_version ?? 1),
  };
}

export async function listEmailConfigurations(): Promise<EmailConfiguration[]> {
  const { data, error } = await supabase.rpc("list_email_configurations");
  if (error) throw translateDbError(error);
  return asArray<Record<string, unknown>>(asObject(data).rows).map(mapEmail);
}

export async function getEmailConfiguration(
  id?: string | null,
): Promise<EmailConfiguration | null> {
  const { data, error } = await supabase.rpc("get_email_configuration", {
    p_id: id ?? null,
  });
  if (error) throw translateDbError(error);
  if (data == null) return null;
  return mapEmail(asObject(data));
}

export async function saveEmailConfiguration(params: {
  fields: EmailConfigurationFields;
  id?: string | null;
  rowVersion?: number | null;
}): Promise<EmailConfiguration> {
  const payload: Record<string, unknown> = { ...params.fields };
  if (payload.password == null || String(payload.password).trim() === "") {
    delete payload.password;
  }
  const { data, error } = await supabase.rpc("save_email_configuration", {
    p_fields: payload,
    p_id: params.id ?? null,
    p_row_version: params.rowVersion ?? null,
  });
  if (error) throw translateDbError(error);
  return mapEmail(asObject(data));
}

export async function listNotificationTemplates(params?: {
  channel?: string | null;
  status?: string | null;
}): Promise<NotificationTemplate[]> {
  const { data, error } = await supabase.rpc("list_notification_templates", {
    p_channel: params?.channel ?? null,
    p_status: params?.status ?? null,
  });
  if (error) throw translateDbError(error);
  return asArray<Record<string, unknown>>(asObject(data).rows).map(mapTemplate);
}

export async function saveNotificationTemplate(params: {
  fields: NotificationTemplateFields;
  id?: string | null;
  rowVersion?: number | null;
}): Promise<NotificationTemplate> {
  const { data, error } = await supabase.rpc("save_notification_template", {
    p_fields: params.fields,
    p_id: params.id ?? null,
    p_row_version: params.rowVersion ?? null,
  });
  if (error) throw translateDbError(error);
  return mapTemplate(asObject(data));
}

export async function deleteNotificationTemplate(
  id: string,
  rowVersion?: number | null,
): Promise<void> {
  const { error } = await supabase.rpc("delete_notification_template", {
    p_id: id,
    p_row_version: rowVersion ?? null,
  });
  if (error) throw translateDbError(error);
}

export async function listNotificationPreferences(): Promise<NotificationPreference[]> {
  const { data, error } = await supabase.rpc("list_notification_preferences");
  if (error) throw translateDbError(error);
  return asArray<Record<string, unknown>>(asObject(data).rows).map(mapPreference);
}

export async function saveNotificationPreferences(
  preferences: Array<{
    notification_type: string;
    email_enabled: boolean;
    sms_enabled: boolean;
    whatsapp_enabled: boolean;
  }>,
): Promise<NotificationPreference[]> {
  const { data, error } = await supabase.rpc("save_notification_preferences", {
    p_preferences: preferences,
  });
  if (error) throw translateDbError(error);
  return asArray<Record<string, unknown>>(asObject(data).rows).map(mapPreference);
}

export async function listNotifications(params?: {
  status?: string | null;
  userId?: string | null;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: UserNotification[]; total: number; page: number; page_size: number }> {
  const { data, error } = await supabase.rpc("list_notifications", {
    p_status: params?.status ?? null,
    p_user_id: params?.userId ?? null,
    p_page: params?.page ?? 1,
    p_page_size: params?.pageSize ?? 50,
  });
  if (error) throw translateDbError(error);
  const row = asObject(data);
  return {
    rows: asArray<Record<string, unknown>>(row.rows).map(mapUserNotification),
    total: Number(row.total ?? 0),
    page: Number(row.page ?? 1),
    page_size: Number(row.page_size ?? 50),
  };
}

export async function createUserNotification(fields: {
  user_id?: string;
  username?: string;
  title: string;
  message?: string;
  notification_type?: string | null;
  link?: string | null;
}): Promise<UserNotification> {
  const { data, error } = await supabase.rpc("create_user_notification", {
    p_fields: fields,
  });
  if (error) throw translateDbError(error);
  return mapUserNotification(asObject(data));
}

export async function markNotificationRead(id: string): Promise<UserNotification> {
  const { data, error } = await supabase.rpc("mark_notification_read", { p_id: id });
  if (error) throw translateDbError(error);
  return mapUserNotification(asObject(data));
}

export async function deleteUserNotification(
  id: string,
  rowVersion?: number | null,
): Promise<void> {
  const { error } = await supabase.rpc("delete_user_notification", {
    p_id: id,
    p_row_version: rowVersion ?? null,
  });
  if (error) throw translateDbError(error);
}
