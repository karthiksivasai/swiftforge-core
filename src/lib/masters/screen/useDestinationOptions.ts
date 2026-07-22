/**
 * Destination options for Main Branch / Branch Manifest pickers.
 * Lists ACTIVE destinations (CourierWala-style) for the current tenant.
 */
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { EntityOption } from "@/components/masters/lookup-combobox";

export function useDestinationOptions(enabled: boolean) {
  const query = useQuery({
    queryKey: ["destinations", "options"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<EntityOption[]> => {
      const pageSize = 1000;
      const all: EntityOption[] = [];
      let from = 0;
      for (;;) {
        const to = from + pageSize - 1;
        const { data, error } = await supabase
          .from("destinations")
          .select("id, code, name")
          .is("deleted_at", null)
          .eq("status", "ACTIVE")
          .order("name", { ascending: true })
          .range(from, to);
        if (error) throw new Error(error.message);
        const batch = (data ?? []) as EntityOption[];
        all.push(...batch);
        if (batch.length < pageSize) break;
        from += pageSize;
        if (from > 50_000) break;
      }
      return all;
    },
  });
  return { options: query.data ?? [], isLoading: query.isLoading };
}
