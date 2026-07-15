/**
 * Notification delivery RPCs — Milestone 7D (sandbox providers).
 */
import { supabase } from "@/integrations/supabase/client";
import { translateDbError } from "@/lib/masters/core/baseCrud";

export type NotificationDeliveryRow = {
  id: string;
  channel: string;
  recipient: string;
  notification_type: string | null;
  template_code: string | null;
  provider: string;
  status: string;
  latency_ms: number | null;
  error_message: string | null;
  created_at: string;
  payload?: Record<string, unknown>;
};

export type DeliveryResult = {
  ok: boolean;
  status: string;
  delivery_id?: string;
  channel?: string;
  provider?: string;
  latency_ms?: number;
  message?: string;
  [key: string]: unknown;
};

function asObject(data: unknown): Record<string, unknown> {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return {};
}

function asArray<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

export async function sendEmail(fields: Record<string, unknown>): Promise<DeliveryResult> {
  const { data, error } = await supabase.rpc("send_email", { p_fields: fields });
  if (error) throw translateDbError(error);
  return asObject(data) as DeliveryResult;
}

export async function testEmailConfiguration(params: {
  to: string;
  emailConfigurationId?: string | null;
}): Promise<DeliveryResult> {
  const { data, error } = await supabase.rpc("test_email_configuration", {
    p_to: params.to,
    p_email_configuration_id: params.emailConfigurationId ?? null,
  });
  if (error) throw translateDbError(error);
  return asObject(data) as DeliveryResult;
}

export async function sendSms(fields: Record<string, unknown>): Promise<DeliveryResult> {
  const { data, error } = await supabase.rpc("send_sms", { p_fields: fields });
  if (error) throw translateDbError(error);
  return asObject(data) as DeliveryResult;
}

export async function sendWhatsapp(fields: Record<string, unknown>): Promise<DeliveryResult> {
  const { data, error } = await supabase.rpc("send_whatsapp", { p_fields: fields });
  if (error) throw translateDbError(error);
  return asObject(data) as DeliveryResult;
}

export async function dispatchNotification(
  fields: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc("dispatch_notification", { p_fields: fields });
  if (error) throw translateDbError(error);
  return asObject(data);
}

export async function listNotificationDeliveries(params?: {
  channel?: string | null;
  limit?: number;
}): Promise<NotificationDeliveryRow[]> {
  const { data, error } = await supabase.rpc("list_notification_deliveries", {
    p_channel: params?.channel ?? null,
    p_limit: params?.limit ?? 50,
  });
  if (error) throw translateDbError(error);
  return asArray<Record<string, unknown>>(asObject(data).rows).map((row) => ({
    id: String(row.id ?? ""),
    channel: String(row.channel ?? ""),
    recipient: String(row.recipient ?? ""),
    notification_type: (row.notification_type as string | null) ?? null,
    template_code: (row.template_code as string | null) ?? null,
    provider: String(row.provider ?? "SANDBOX"),
    status: String(row.status ?? ""),
    latency_ms: row.latency_ms != null ? Number(row.latency_ms) : null,
    error_message: (row.error_message as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    payload: asObject(row.payload),
  }));
}

export async function getNotificationProviderStatus(): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc("get_notification_provider_status");
  if (error) throw translateDbError(error);
  return asObject(data);
}

export async function previewNotificationTemplate(params: {
  templateId?: string | null;
  templateCode?: string | null;
  variables?: Record<string, unknown>;
}): Promise<{
  id: string;
  code: string;
  channel: string;
  notification_type: string;
  subject: string | null;
  body: string;
}> {
  const { data, error } = await supabase.rpc("preview_notification_template", {
    p_template_id: params.templateId ?? null,
    p_template_code: params.templateCode ?? null,
    p_variables: params.variables ?? {},
  });
  if (error) throw translateDbError(error);
  const row = asObject(data);
  return {
    id: String(row.id ?? ""),
    code: String(row.code ?? ""),
    channel: String(row.channel ?? ""),
    notification_type: String(row.notification_type ?? ""),
    subject: (row.subject as string | null) ?? null,
    body: String(row.body ?? ""),
  };
}

/** Client-side provider abstraction (mirrors SQL sandbox adapters). */
export type MessagingProvider = {
  readonly name: string;
  send(payload: { to: string; body: string }): Promise<{ ok: boolean; provider: string }>;
};

export class SandboxSmsProvider implements MessagingProvider {
  readonly name = "SANDBOX";
  async send(payload: { to: string; body: string }) {
    return { ok: true, provider: this.name, chars: payload.body.length, to: payload.to };
  }
}

export class SandboxWhatsappProvider implements MessagingProvider {
  readonly name = "SANDBOX";
  async send(payload: { to: string; body: string }) {
    return { ok: true, provider: this.name, chars: payload.body.length, to: payload.to };
  }
}

export function getSmsProvider(): MessagingProvider {
  return new SandboxSmsProvider();
}

export function getWhatsappProvider(): MessagingProvider {
  return new SandboxWhatsappProvider();
}
