/**
 * Customs EDI / CSB export RPCs — Milestone 7F (sandbox stub only).
 */
import { supabase } from "@/integrations/supabase/client";
import { translateDbError } from "@/lib/masters/core/baseCrud";

export type CsbExportType = "CSB_III" | "CSB_IV" | "CSB_V";
export type CsbExportStatus = "DRAFT" | "GENERATED" | "DOWNLOADED";

export type CsbExportRow = {
  id: string;
  export_type: CsbExportType;
  file_name: string;
  status: CsbExportStatus;
  manifest_id: string | null;
  provider: string;
  sandbox_mode: boolean;
  cha_code: string | null;
  iec: string | null;
  branch_code: string | null;
  port_code: string | null;
  validation_summary: Record<string, unknown>;
  line_count: number;
  file_id: string | null;
  download_count: number;
  generated_at: string | null;
  downloaded_at: string | null;
  created_at: string;
  row_version: number;
  has_content: boolean;
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

function mapExport(row: Record<string, unknown>): CsbExportRow {
  return {
    id: String(row.id ?? ""),
    export_type: String(row.export_type ?? "CSB_III") as CsbExportType,
    file_name: String(row.file_name ?? ""),
    status: String(row.status ?? "DRAFT") as CsbExportStatus,
    manifest_id: (row.manifest_id as string | null) ?? null,
    provider: String(row.provider ?? "SANDBOX"),
    sandbox_mode: row.sandbox_mode !== false && row.sandbox_mode !== "false",
    cha_code: (row.cha_code as string | null) ?? null,
    iec: (row.iec as string | null) ?? null,
    branch_code: (row.branch_code as string | null) ?? null,
    port_code: (row.port_code as string | null) ?? null,
    validation_summary: asObject(row.validation_summary),
    line_count: Number(row.line_count ?? 0),
    file_id: (row.file_id as string | null) ?? null,
    download_count: Number(row.download_count ?? 0),
    generated_at: row.generated_at != null ? String(row.generated_at) : null,
    downloaded_at: row.downloaded_at != null ? String(row.downloaded_at) : null,
    created_at: String(row.created_at ?? ""),
    row_version: Number(row.row_version ?? 1),
    has_content: row.has_content === true || row.has_content === "true",
  };
}

export async function testCustomsConnection(credentialId?: string | null) {
  const { data, error } = await supabase.rpc("test_customs_connection", {
    p_credential_id: credentialId ?? null,
  });
  if (error) throw translateDbError(error);
  return asObject(data);
}

export async function validateCsbExport(
  fields: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc("validate_csb_export", { p_fields: fields });
  if (error) throw translateDbError(error);
  return asObject(data);
}

export async function generateCsbExport(fields: Record<string, unknown>): Promise<{
  ok: boolean;
  export: CsbExportRow | null;
  errors: unknown[];
  warnings: unknown[];
  message?: string;
}> {
  const { data, error } = await supabase.rpc("generate_csb_export", { p_fields: fields });
  if (error) throw translateDbError(error);
  const row = asObject(data);
  return {
    ok: row.ok !== false,
    export: row.export ? mapExport(asObject(row.export)) : null,
    errors: asArray(row.errors),
    warnings: asArray(row.warnings),
    message: row.message != null ? String(row.message) : undefined,
  };
}

export async function downloadCsbExport(id: string): Promise<{
  ok: boolean;
  export: CsbExportRow;
  file_name: string;
  content: string;
  mime: string;
}> {
  const { data, error } = await supabase.rpc("download_csb_export", { p_id: id });
  if (error) throw translateDbError(error);
  const row = asObject(data);
  return {
    ok: row.ok !== false,
    export: mapExport(asObject(row.export)),
    file_name: String(row.file_name ?? "export.txt"),
    content: String(row.content ?? ""),
    mime: String(row.mime ?? "text/plain"),
  };
}

export async function listCsbExports(params?: {
  exportType?: CsbExportType | null;
  limit?: number;
}): Promise<CsbExportRow[]> {
  const { data, error } = await supabase.rpc("list_csb_exports", {
    p_export_type: params?.exportType ?? null,
    p_limit: params?.limit ?? 50,
  });
  if (error) throw translateDbError(error);
  return asArray<Record<string, unknown>>(asObject(data).rows).map(mapExport);
}

export async function getCustomsProviderStatus(): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc("get_customs_provider_status");
  if (error) throw translateDbError(error);
  return asObject(data);
}

export function downloadTextFile(fileName: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** Client-side provider abstraction (mirrors SQL sandbox). */
export type CustomsEdiProvider = {
  readonly name: string;
  generate(input: {
    exportType: CsbExportType;
    manifestNo: string;
  }): Promise<{ ok: boolean; fileName: string; provider: string }>;
};

export class SandboxCustomsEdiProvider implements CustomsEdiProvider {
  readonly name = "SANDBOX";
  async generate(input: { exportType: CsbExportType; manifestNo: string }) {
    return {
      ok: true,
      fileName: `${input.exportType}-${input.manifestNo}.txt`,
      provider: this.name,
    };
  }
}

export function getCustomsEdiProvider(): CustomsEdiProvider {
  return new SandboxCustomsEdiProvider();
}
