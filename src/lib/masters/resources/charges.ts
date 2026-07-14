import { supabase } from "@/integrations/supabase/client";
import type { BaseRow } from "@/lib/masters/core/baseCrud";
import type { MasterResource } from "@/lib/masters/core/useMasterResource";
import { COMPLEX_CATALOG_MASTER_PERMISSIONS } from "@/lib/permissions";
import {
  chargeCreateSchema,
  chargeUpdateSchema,
  type ChargeCreate,
  type ChargeUpdate,
} from "@/lib/masters/schemas/charges";

export type ChargeRow = BaseRow & {
  code: string;
  name: string;
  base_on: string;
  charge_type: "AIRWAYBILL" | "EXPENSE" | "INCOME" | "OBC" | "PURCHASE";
  charge_rate: number;
  apply_fuel: boolean;
  apply_tax_on_fuel: boolean;
  apply_tax: boolean;
  hsn_code: string | null;
  sequence: number;
};

export const chargesResource: MasterResource<ChargeRow, ChargeCreate, ChargeUpdate> = {
  key: "charges",
  table: "charges",
  master: "charges",
  permission: COMPLEX_CATALOG_MASTER_PERMISSIONS.charges,
  label: { singular: "Charge", plural: "Charges" },
  columns:
    "id, tenant_id, code, name, base_on, charge_type, charge_rate, apply_fuel, apply_tax_on_fuel, apply_tax, hsn_code, sequence, created_at, created_by, updated_at, updated_by, deleted_at, row_version",
  searchColumns: ["code", "name", "base_on"],
  orderBy: "code",
  ascending: true,
  importColumns: [
    "code",
    "name",
    "base_on",
    "charge_type",
    "charge_rate",
    "apply_fuel",
    "apply_tax_on_fuel",
    "apply_tax",
    "hsn_code",
    "sequence",
  ],
  lookupKey: "charge",
  createSchema: chargeCreateSchema,
  updateSchema: chargeUpdateSchema,
};

/**
 * Charge dependency (M:N) client helpers.
 *
 * The charge row is created/updated through the generic CRUD; its "included
 * charges" set is synchronized separately by the dedicated transactional RPC
 * `public.save_charge_dependencies` (migration 0019). These helpers keep that
 * junction concern OUT of the generic resource layer.
 */
export type ChargeDependencyEdge = { charge_id: string; depends_on_charge_id: string };

/** Load every dependency edge for the tenant (RLS-scoped). */
export async function fetchChargeDependencies(): Promise<ChargeDependencyEdge[]> {
  const { data, error } = await supabase
    .from("charge_dependencies")
    .select("charge_id, depends_on_charge_id");
  if (error) throw new Error(error.message);
  return (data ?? []) as ChargeDependencyEdge[];
}

/** Replace a charge's dependency set in one transaction. Returns rows inserted. */
export async function saveChargeDependencies(
  chargeId: string,
  dependsOnIds: string[],
): Promise<number> {
  const { data, error } = await supabase.rpc("save_charge_dependencies", {
    p_charge_id: chargeId,
    p_depends_on_ids: dependsOnIds,
  });
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}
