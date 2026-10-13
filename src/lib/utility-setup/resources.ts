/**
 * Setup screen RPCs. Client schemas run first; the database RPCs are authoritative.
 */
import { supabase } from "@/integrations/supabase/client";
import { translateDbError } from "@/lib/masters/core/baseCrud";
import {
  EMAIL_MODULE_CODES,
  isSmtpModule,
  type EmailModuleName,
} from "@/lib/utility-setup/email-modules";
import {
  creditLimitPercentageSchema,
  entryLockDateSchema,
  invoiceLastNoSchema,
  setupEmailConfigSchema,
} from "@/lib/utility-setup/schemas";
import {
  isEstatementColumn,
  type EstatementColumnRow,
} from "@/lib/utility-setup/estatement";
import type {
  EmailFooterRow,
  FormFieldConfig,
  FormSetupRecord,
  MiscellaneousSetup,
  SetupEmailConfig,
} from "@/lib/utility-setup/types";

function asObject(data: unknown): Record<string, unknown> {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return {};
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function version(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function mapMiscellaneous(data: unknown): MiscellaneousSetup {
  const row = asObject(data);
  return {
    branch_id: row.branch_id ? String(row.branch_id) : null,
    invoice_no: text(row.invoice_no),
    invoice_row_version: version(row.invoice_row_version),
    entry_lock_date: text(row.entry_lock_date).slice(0, 10),
    entry_lock_row_version: version(row.entry_lock_row_version),
    credit_limit_percentage: text(row.credit_limit_percentage),
    credit_limit_row_version: version(row.credit_limit_row_version),
  };
}

export async function getUtilityMiscellaneous(
  branchId?: string | null,
): Promise<MiscellaneousSetup> {
  const { data, error } = await supabase.rpc("get_utility_miscellaneous", {
    p_branch_id: branchId ?? null,
  });
  if (error) throw translateDbError(error);
  return mapMiscellaneous(data);
}

export async function saveInvoiceLastNo(params: {
  invoiceNo: string;
  branchId?: string | null;
  rowVersion?: number | null;
}): Promise<MiscellaneousSetup> {
  const parsed = invoiceLastNoSchema.parse({ invoice_no: params.invoiceNo });
  const { data, error } = await supabase.rpc("save_utility_miscellaneous", {
    p_block: "LAST_NO",
    p_fields: { invoice_no: parsed.invoice_no },
    p_branch_id: params.branchId ?? null,
    p_row_version: params.rowVersion ?? null,
  });
  if (error) throw translateDbError(error);
  return mapMiscellaneous(data);
}

export async function saveEntryLockDate(params: {
  entryLockDate: string;
  rowVersion?: number | null;
}): Promise<MiscellaneousSetup> {
  const parsed = entryLockDateSchema.parse({ entry_lock_date: params.entryLockDate });
  const { data, error } = await supabase.rpc("save_utility_miscellaneous", {
    p_block: "ENTRY_LOCK",
    p_fields: { entry_lock_date: parsed.entry_lock_date },
    p_branch_id: null,
    p_row_version: params.rowVersion ?? null,
  });
  if (error) throw translateDbError(error);
  return mapMiscellaneous(data);
}

export async function saveCreditLimitPercentage(params: {
  percentage: string;
  rowVersion?: number | null;
}): Promise<MiscellaneousSetup> {
  const parsed = creditLimitPercentageSchema.parse({ percentage: params.percentage });
  const { data, error } = await supabase.rpc("save_utility_miscellaneous", {
    p_block: "CREDIT_PCT",
    p_fields: { percentage: parsed.percentage },
    p_branch_id: null,
    p_row_version: params.rowVersion ?? null,
  });
  if (error) throw translateDbError(error);
  return mapMiscellaneous(data);
}

function flagBag(raw: unknown): Record<string, boolean | string> {
  const row = asObject(raw);
  const out: Record<string, boolean | string> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === "messageDear") continue;
    if (typeof value === "boolean") out[key] = value;
    else if (typeof value === "string") out[key] = value;
    else if (value === "true" || value === "false") out[key] = value === "true";
  }
  return out;
}

export function mapSetupEmail(data: unknown): SetupEmailConfig {
  const row = asObject(data);
  const flags = asObject(row.print_flags);
  return {
    id: row.id ? String(row.id) : null,
    row_version: version(row.row_version),
    has_password: row.has_password === true || row.has_password === "true",
    smtpServer: text(row.smtp_host),
    smtpPort: row.smtp_port == null || row.smtp_port === "" ? "" : String(row.smtp_port),
    fromEmail: text(row.sender_email),
    mailUserId: text(row.username),
    mailPassword: "",
    messageDear: text(row.message_dear || flags.messageDear),
    messageSubject: text(row.subject_template),
    messageBody: text(row.body_template),
    ssl: row.use_ssl === true || row.use_ssl === "true",
    printFlags: flagBag(flags),
  };
}

export async function getSetupEmailModule(moduleName: string): Promise<SetupEmailConfig | null> {
  const { data, error } = await supabase.rpc("get_setup_email_module", {
    p_module_name: moduleName,
  });
  if (error) throw translateDbError(error);
  if (data == null) return null;
  const row = asObject(data);
  if (row.found === false) return null;
  return mapSetupEmail(data);
}

export async function saveSetupEmailModule(params: {
  moduleName: EmailModuleName;
  config: SetupEmailConfig;
}): Promise<SetupEmailConfig> {
  if (!isSmtpModule(params.moduleName)) {
    throw new Error("This module does not use SMTP settings");
  }
  const passwordRequired = !params.config.has_password;
  const parsed = setupEmailConfigSchema(passwordRequired).parse(params.config);
  const printFlags: Record<string, boolean | string> = { ...params.config.printFlags };
  printFlags.messageDear = parsed.messageDear;
  const payload: Record<string, unknown> = {
    module_name: params.moduleName,
    module_code: EMAIL_MODULE_CODES[params.moduleName],
    smtp_host: parsed.smtpServer,
    smtp_port: Number(parsed.smtpPort),
    sender_email: parsed.fromEmail,
    username: parsed.mailUserId,
    use_ssl: parsed.ssl,
    subject_template: parsed.messageSubject,
    body_template: parsed.messageBody,
    message_dear: parsed.messageDear,
    print_flags: printFlags,
  };
  if (parsed.mailPassword.trim() !== "") payload.password = parsed.mailPassword;
  const { data, error } = await supabase.rpc("save_setup_email_module", {
    p_fields: payload,
    p_id: params.config.id,
    p_row_version: params.config.row_version,
  });
  if (error) throw translateDbError(error);
  return mapSetupEmail(data);
}

function mapEstatementColumns(raw: unknown): EstatementColumnRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const row = asObject(item);
    const column = text(row.column);
    if (!isEstatementColumn(column)) return [];
    return [{ column, code: text(row.code), orderNo: text(row.orderNo) }];
  });
}

export async function getEstatementColumns(): Promise<{
  rows: EstatementColumnRow[];
  row_version: number | null;
}> {
  const { data, error } = await supabase.rpc("get_estatement_columns");
  if (error) throw translateDbError(error);
  const row = asObject(data);
  return { rows: mapEstatementColumns(row.rows), row_version: version(row.row_version) };
}

export async function saveEstatementColumns(params: {
  rows: EstatementColumnRow[];
  rowVersion?: number | null;
}): Promise<{ rows: EstatementColumnRow[]; row_version: number | null }> {
  const { data, error } = await supabase.rpc("save_estatement_columns", {
    p_rows: params.rows,
    p_row_version: params.rowVersion ?? null,
  });
  if (error) throw translateDbError(error);
  const row = asObject(data);
  return { rows: mapEstatementColumns(row.rows), row_version: version(row.row_version) };
}

export async function getEmailFooter(): Promise<{
  rows: EmailFooterRow[];
  row_version: number | null;
}> {
  const { data, error } = await supabase.rpc("get_setup_email_footer");
  if (error) throw translateDbError(error);
  const row = asObject(data);
  const rows = Array.isArray(row.rows)
    ? row.rows.map((item) => {
        const cell = asObject(item);
        return { controlName: text(cell.controlName), code: text(cell.code) };
      })
    : [];
  return { rows, row_version: version(row.row_version) };
}

export async function saveEmailFooter(params: {
  rows: EmailFooterRow[];
  rowVersion?: number | null;
}): Promise<{ rows: EmailFooterRow[]; row_version: number | null }> {
  const { data, error } = await supabase.rpc("save_setup_email_footer", {
    p_rows: params.rows,
    p_row_version: params.rowVersion ?? null,
  });
  if (error) throw translateDbError(error);
  const row = asObject(data);
  const rows = Array.isArray(row.rows)
    ? row.rows.map((item) => {
        const cell = asObject(item);
        return { controlName: text(cell.controlName), code: text(cell.code) };
      })
    : params.rows;
  return { rows, row_version: version(row.row_version) };
}

function mapFormFields(raw: unknown): FormFieldConfig[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const row = asObject(item);
    return {
      name: text(row.name),
      type: row.type === "text" ? "text" : "checkbox",
      enabled: row.enabled === true || row.enabled === "true",
      value: text(row.value),
    };
  });
}

export async function saveSetupKyc(rowVersion?: number | null): Promise<void> {
  const { error } = await supabase.rpc("save_setup_kyc", {
    p_row_version: rowVersion ?? null,
  });
  if (error) throw translateDbError(error);
}

export async function getFormSetup(moduleName: string): Promise<FormSetupRecord> {
  const { data, error } = await supabase.rpc("get_form_setup", { p_module: moduleName });
  if (error) throw translateDbError(error);
  const row = asObject(data);
  return {
    module: text(row.module || moduleName),
    fields: mapFormFields(row.fields),
    row_version: version(row.row_version),
  };
}

export async function saveFormSetup(params: {
  moduleName: string;
  fields: FormFieldConfig[];
  rowVersion?: number | null;
}): Promise<FormSetupRecord> {
  const { data, error } = await supabase.rpc("save_form_setup", {
    p_module: params.moduleName,
    p_fields: params.fields,
    p_row_version: params.rowVersion ?? null,
  });
  if (error) throw translateDbError(error);
  const row = asObject(data);
  return {
    module: text(row.module || params.moduleName),
    fields: mapFormFields(row.fields),
    row_version: version(row.row_version),
  };
}
