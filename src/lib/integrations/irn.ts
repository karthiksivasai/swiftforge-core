/**
 * E-Invoice / IRN RPCs — Milestone 7E (sandbox IRP only).
 */
import { supabase } from "@/integrations/supabase/client";
import { translateDbError } from "@/lib/masters/core/baseCrud";

export type EinvoiceDocumentType = "INVOICE" | "DEBIT_NOTE" | "CREDIT_NOTE";
export type IrnStatus = "PENDING" | "GENERATED" | "CANCELLED";

export type EinvoiceDocument = {
  id: string;
  document_type: EinvoiceDocumentType;
  document_no: string;
  document_date: string | null;
  customer_id: string | null;
  grand_total: number;
  register_type: string;
  status: string;
  irn: string | null;
  irn_status: IrnStatus;
  irn_ack_no: string | null;
  irn_ack_date: string | null;
  irn_qr_payload: string | null;
  irn_payload: Record<string, unknown>;
  irn_provider: string | null;
  irn_cancel_reason: string | null;
  row_version: number;
  approval_on_einvoice?: boolean;
};

export type IrnLogRow = {
  id: string;
  document_type?: string;
  document_id?: string;
  document_no?: string | null;
  operation: string;
  irn_number: string | null;
  ack_number: string | null;
  ack_date: string | null;
  qr_payload: string | null;
  status: string;
  cancel_reason: string | null;
  provider: string;
  request_body: Record<string, unknown>;
  response_body: Record<string, unknown>;
  latency_ms: number | null;
  error_message?: string | null;
  created_at: string;
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

function mapDocument(row: Record<string, unknown>): EinvoiceDocument {
  return {
    id: String(row.id ?? ""),
    document_type: String(row.document_type ?? "INVOICE") as EinvoiceDocumentType,
    document_no: String(row.document_no ?? ""),
    document_date: row.document_date != null ? String(row.document_date) : null,
    customer_id: (row.customer_id as string | null) ?? null,
    grand_total: Number(row.grand_total ?? 0),
    register_type: String(row.register_type ?? "B2B"),
    status: String(row.status ?? ""),
    irn: (row.irn as string | null) ?? null,
    irn_status: (String(row.irn_status ?? "PENDING") as IrnStatus) || "PENDING",
    irn_ack_no: (row.irn_ack_no as string | null) ?? null,
    irn_ack_date: row.irn_ack_date != null ? String(row.irn_ack_date) : null,
    irn_qr_payload: (row.irn_qr_payload as string | null) ?? null,
    irn_payload: asObject(row.irn_payload),
    irn_provider: (row.irn_provider as string | null) ?? null,
    irn_cancel_reason: (row.irn_cancel_reason as string | null) ?? null,
    row_version: Number(row.row_version ?? 1),
    approval_on_einvoice: row.approval_on_einvoice === true || row.approval_on_einvoice === "true",
  };
}

function mapLog(row: Record<string, unknown>): IrnLogRow {
  return {
    id: String(row.id ?? ""),
    document_type: row.document_type != null ? String(row.document_type) : undefined,
    document_id: row.document_id != null ? String(row.document_id) : undefined,
    document_no: (row.document_no as string | null) ?? null,
    operation: String(row.operation ?? ""),
    irn_number: (row.irn_number as string | null) ?? null,
    ack_number: (row.ack_number as string | null) ?? null,
    ack_date: row.ack_date != null ? String(row.ack_date) : null,
    qr_payload: (row.qr_payload as string | null) ?? null,
    status: String(row.status ?? ""),
    cancel_reason: (row.cancel_reason as string | null) ?? null,
    provider: String(row.provider ?? "SANDBOX"),
    request_body: asObject(row.request_body),
    response_body: asObject(row.response_body),
    latency_ms: row.latency_ms != null ? Number(row.latency_ms) : null,
    error_message: (row.error_message as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
  };
}

export async function saveEinvoiceDocument(
  fields: Record<string, unknown>,
): Promise<EinvoiceDocument> {
  const { data, error } = await supabase.rpc("save_einvoice_document", {
    p_fields: fields,
  });
  if (error) throw translateDbError(error);
  return mapDocument(asObject(data));
}

export async function listEinvoiceDocuments(params?: {
  documentType?: EinvoiceDocumentType | null;
  limit?: number;
}): Promise<EinvoiceDocument[]> {
  const { data, error } = await supabase.rpc("list_einvoice_documents", {
    p_document_type: params?.documentType ?? null,
    p_limit: params?.limit ?? 50,
  });
  if (error) throw translateDbError(error);
  return asArray<Record<string, unknown>>(asObject(data).rows).map(mapDocument);
}

export async function generateIrn(params: {
  documentType: EinvoiceDocumentType;
  documentId: string;
  rowVersion?: number | null;
}): Promise<{
  ok: boolean;
  document: EinvoiceDocument;
  result: Record<string, unknown>;
  provider: string;
}> {
  const { data, error } = await supabase.rpc("generate_irn", {
    p_document_type: params.documentType,
    p_document_id: params.documentId,
    p_row_version: params.rowVersion ?? null,
  });
  if (error) throw translateDbError(error);
  const row = asObject(data);
  return {
    ok: row.ok !== false,
    document: mapDocument(asObject(row.document)),
    result: asObject(row.result),
    provider: String(row.provider ?? "SANDBOX"),
  };
}

export async function cancelIrn(params: {
  documentType: EinvoiceDocumentType;
  documentId: string;
  reason: string;
  rowVersion?: number | null;
}): Promise<{
  ok: boolean;
  document: EinvoiceDocument;
  result: Record<string, unknown>;
}> {
  const { data, error } = await supabase.rpc("cancel_irn", {
    p_document_type: params.documentType,
    p_document_id: params.documentId,
    p_reason: params.reason,
    p_row_version: params.rowVersion ?? null,
  });
  if (error) throw translateDbError(error);
  const row = asObject(data);
  return {
    ok: row.ok !== false,
    document: mapDocument(asObject(row.document)),
    result: asObject(row.result),
  };
}

export async function getIrnStatus(params: {
  documentType: EinvoiceDocumentType;
  documentId: string;
}): Promise<{
  document: EinvoiceDocument;
  logs: IrnLogRow[];
}> {
  const { data, error } = await supabase.rpc("get_irn_status", {
    p_document_type: params.documentType,
    p_document_id: params.documentId,
  });
  if (error) throw translateDbError(error);
  const row = asObject(data);
  return {
    document: mapDocument(asObject(row.document)),
    logs: asArray<Record<string, unknown>>(row.logs).map(mapLog),
  };
}

export async function testIrnConnection(credentialId?: string | null) {
  const { data, error } = await supabase.rpc("test_irn_connection", {
    p_credential_id: credentialId ?? null,
  });
  if (error) throw translateDbError(error);
  return asObject(data);
}

export async function listIrnLogs(params?: {
  documentType?: EinvoiceDocumentType | null;
  limit?: number;
}): Promise<IrnLogRow[]> {
  const { data, error } = await supabase.rpc("list_irn_logs", {
    p_document_type: params?.documentType ?? null,
    p_limit: params?.limit ?? 50,
  });
  if (error) throw translateDbError(error);
  return asArray<Record<string, unknown>>(asObject(data).rows).map(mapLog);
}

export async function getIrnProviderStatus(): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc("get_irn_provider_status");
  if (error) throw translateDbError(error);
  return asObject(data);
}

/** Client-side provider abstraction (mirrors SQL sandbox adapter). */
export type IrnProvider = {
  readonly name: string;
  generate(input: {
    documentType: string;
    documentNo: string;
  }): Promise<{ ok: boolean; irn: string; provider: string }>;
  cancel(input: {
    irn: string;
    reason: string;
  }): Promise<{ ok: boolean; status: string; provider: string }>;
};

export class SandboxIrnProvider implements IrnProvider {
  readonly name = "SANDBOX";
  async generate(input: { documentType: string; documentNo: string }) {
    return {
      ok: true,
      irn: `SANDBOX-IRN-${input.documentType}-${input.documentNo}`.slice(0, 48),
      provider: this.name,
    };
  }
  async cancel(input: { irn: string; reason: string }) {
    return {
      ok: true,
      status: "CANCELLED",
      provider: this.name,
      irn: input.irn,
      reason: input.reason,
    };
  }
}

export function getIrnProvider(): IrnProvider {
  return new SandboxIrnProvider();
}
