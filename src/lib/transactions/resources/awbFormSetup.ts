import { supabase } from "@/integrations/supabase/client";
import {
  defaultAwbFormSetup,
  parseAwbFormSetup,
  type AwbFormSetupSettings,
} from "@/lib/forms/awb-form-setup";
import { translateDbError } from "@/lib/masters/core/baseCrud";

export type AwbFormSetupRecord = {
  stored: boolean;
  canEdit: boolean;
  branchId: string | null;
  settings: AwbFormSetupSettings;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function mapAwbFormSetupRecord(data: unknown): AwbFormSetupRecord {
  const row = asRecord(data);
  const settings = asRecord(row.settings);
  return {
    stored: row.stored === true,
    canEdit: row.can_edit === true,
    branchId: typeof row.branch_id === "string" ? row.branch_id : null,
    settings: parseAwbFormSetup(settings),
  };
}

export async function getAwbFormSetup(): Promise<AwbFormSetupRecord> {
  const { data, error } = await supabase.rpc("get_awb_form_setup");
  if (error) throw translateDbError(error);
  if (!data) {
    return { stored: false, canEdit: false, branchId: null, settings: defaultAwbFormSetup() };
  }
  return mapAwbFormSetupRecord(data);
}

export async function saveAwbFormSetup(params: {
  settings: AwbFormSetupSettings;
  branchId?: string | null;
}): Promise<AwbFormSetupRecord> {
  const { data, error } = await supabase.rpc("save_awb_form_setup", {
    p_settings: params.settings,
    p_branch_id: params.branchId ?? null,
  });
  if (error) throw translateDbError(error);
  return mapAwbFormSetupRecord(data);
}
