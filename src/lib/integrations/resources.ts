/**
 * Integration credentials RPCs — Milestone 7A.
 */
import { supabase } from "@/integrations/supabase/client";
import { translateDbError } from "@/lib/masters/core/baseCrud";
import type {
  IntegrationCredential,
  IntegrationCredentialFields,
  IntegrationProvider,
} from "@/lib/integrations/types";

function asObject(data: unknown): Record<string, unknown> {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return {};
}

function asArray<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

function mapProvider(row: Record<string, unknown>): IntegrationProvider {
  return {
    id: String(row.id ?? ""),
    provider_code: String(row.provider_code ?? ""),
    provider_name: String(row.provider_name ?? ""),
    provider_type:
      (String(row.provider_type ?? "CARRIER") as
        | "CARRIER"
        | "EINVOICE"
        | "CUSTOMS"
        | "VENDOR_GATEWAY") || "CARRIER",
    status: (String(row.status ?? "ACTIVE") as "ACTIVE" | "INACTIVE") || "ACTIVE",
    supports_booking: row.supports_booking !== false,
    supports_tracking: row.supports_tracking !== false,
    supports_labels: row.supports_labels !== false,
    supports_serviceability: row.supports_serviceability !== false,
    sort_order: Number(row.sort_order ?? 100),
  };
}

function mapCredential(row: Record<string, unknown>): IntegrationCredential {
  return {
    id: String(row.id ?? ""),
    provider_id: String(row.provider_id ?? ""),
    provider_code: String(row.provider_code ?? ""),
    provider_name: String(row.provider_name ?? ""),
    provider_type: String(row.provider_type ?? "CARRIER"),
    username: (row.username as string | null) ?? null,
    has_password: row.has_password === true || row.has_password === "true",
    has_api_key: row.has_api_key === true || row.has_api_key === "true",
    has_api_secret: row.has_api_secret === true || row.has_api_secret === "true",
    account_number: (row.account_number as string | null) ?? null,
    endpoint: (row.endpoint as string | null) ?? null,
    sandbox_mode: row.sandbox_mode !== false && row.sandbox_mode !== "false",
    is_active: row.is_active !== false && row.is_active !== "false",
    remark: (row.remark as string | null) ?? null,
    supports_booking: row.supports_booking !== false,
    supports_tracking: row.supports_tracking !== false,
    supports_labels: row.supports_labels !== false,
    supports_serviceability: row.supports_serviceability !== false,
    row_version: Number(row.row_version ?? 1),
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

export async function listIntegrationProviders(
  status?: string | null,
): Promise<IntegrationProvider[]> {
  const { data, error } = await supabase.rpc("list_integration_providers", {
    p_status: status ?? null,
  });
  if (error) throw translateDbError(error);
  return asArray<Record<string, unknown>>(asObject(data).rows).map(mapProvider);
}

export async function listIntegrationCredentials(): Promise<IntegrationCredential[]> {
  const { data, error } = await supabase.rpc("list_integration_credentials");
  if (error) throw translateDbError(error);
  return asArray<Record<string, unknown>>(asObject(data).rows).map(mapCredential);
}

export async function getIntegrationCredentials(params: {
  id?: string | null;
  providerCode?: string | null;
}): Promise<IntegrationCredential | null> {
  const { data, error } = await supabase.rpc("get_integration_credentials", {
    p_id: params.id ?? null,
    p_provider_code: params.providerCode ?? null,
  });
  if (error) throw translateDbError(error);
  if (data == null) return null;
  return mapCredential(asObject(data));
}

export async function saveIntegrationCredentials(params: {
  fields: IntegrationCredentialFields;
  id?: string | null;
  rowVersion?: number | null;
}): Promise<IntegrationCredential> {
  const payload: Record<string, unknown> = { ...params.fields };
  for (const key of ["password", "api_key", "api_secret"] as const) {
    if (payload[key] == null || String(payload[key]).trim() === "") {
      delete payload[key];
    }
  }
  const { data, error } = await supabase.rpc("save_integration_credentials", {
    p_fields: payload,
    p_id: params.id ?? null,
    p_row_version: params.rowVersion ?? null,
  });
  if (error) throw translateDbError(error);
  return mapCredential(asObject(data));
}

export async function deleteIntegrationCredentials(
  id: string,
  rowVersion?: number | null,
): Promise<void> {
  const { error } = await supabase.rpc("delete_integration_credentials", {
    p_id: id,
    p_row_version: rowVersion ?? null,
  });
  if (error) throw translateDbError(error);
}

export async function testIntegrationConnection(params: {
  id?: string | null;
  providerCode?: string | null;
}): Promise<{ ok: boolean; status: string; message: string; provider_code?: string }> {
  const { data, error } = await supabase.rpc("test_integration_connection", {
    p_id: params.id ?? null,
    p_provider_code: params.providerCode ?? null,
  });
  if (error) throw translateDbError(error);
  const row = asObject(data);
  return {
    ok: row.ok === true,
    status: String(row.status ?? "NOT_IMPLEMENTED"),
    message: String(row.message ?? "Not Implemented"),
    provider_code: row.provider_code ? String(row.provider_code) : undefined,
  };
}
