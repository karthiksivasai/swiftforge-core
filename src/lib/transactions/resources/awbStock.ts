import { supabase } from "@/integrations/supabase/client";

export type BranchAwbStockSummary = {
  branch_id: string;
  branch_code: string;
  limit: number;
  used: number;
  balance: number;
  location_balance: number;
  auto_start: number;
  auto_end: number;
  manual_start: number;
  manual_end: number;
  is_exhausted: boolean;
};

export type ValidateManualAwbResult = {
  valid: boolean;
  awb_no?: string;
  message?: string;
};

export async function getBranchAwbStockSummary(branchId?: string): Promise<BranchAwbStockSummary> {
  const { data, error } = await supabase.rpc("get_branch_awb_stock_summary", {
    p_branch_id: branchId || null,
  });
  if (error) throw error;
  return data as BranchAwbStockSummary;
}

export async function validateManualAwb(args: {
  branchId?: string;
  awbNo: string;
}): Promise<ValidateManualAwbResult> {
  const { data, error } = await supabase.rpc("validate_manual_awb", {
    p_branch_id: args.branchId || null,
    p_awb_no: args.awbNo.trim(),
  });
  if (error) throw error;
  return data as ValidateManualAwbResult;
}
