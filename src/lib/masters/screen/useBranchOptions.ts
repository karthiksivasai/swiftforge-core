/**
 * Branch options for FK pickers on geo master screens (Milestone 6).
 *
 * Branches are not exposed through the `public.lookup` RPC (that surface is geo
 * masters only), so destination / pincode / area screens load the tenant's
 * branches directly (RLS-scoped) for their branch pickers. Cached broadly since
 * the branch list changes rarely.
 */
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { EntityOption } from "@/components/masters/lookup-combobox";

export function useBranchOptions(enabled: boolean) {
  const query = useQuery({
    queryKey: ["branches", "options"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<EntityOption[]> => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, code, name")
        .is("deleted_at", null)
        .order("name", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as EntityOption[];
    },
  });
  return { options: query.data ?? [], isLoading: query.isLoading };
}
