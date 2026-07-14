/**
 * Live list loader for geo master screens (Milestone 6).
 *
 * Screens keep their existing client-side search + pagination UX, so this hook
 * simply loads the tenant's rows (RLS-scoped, up to `pageSize`) through the
 * generic `baseCrud.list` and — because the normalized tables store FK *ids*,
 * not the denormalized names the demo UIs display — resolves the referenced
 * code/name for each FK column in a single batched `in (...)` query per table.
 *
 * The returned rows are the raw DB rows augmented with `<as>_code` / `<as>_name`
 * label fields; each screen maps them to its own view shape. Keyed under the
 * resource's list namespace so the CRUD/import mutations in `useMasterResource`
 * (which invalidate `[resource.key]`) refresh it automatically.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { makeCrud, type BaseRow } from "@/lib/masters/core/baseCrud";
import { masterKeys } from "@/lib/masters/core/queryKeys";
import type { AnyMasterResource } from "@/lib/masters/resources";

/** One FK column to resolve: `idField` -> `table.(code,name)`, exposed as `<as>_code/_name`. */
export type LabelRef = { idField: string; table: string; as: string };

export type LiveRow = BaseRow & Record<string, unknown>;

type RefRow = { id: string; code: string | null; name: string | null };

async function attachLabels(rows: LiveRow[], refs: LabelRef[]): Promise<LiveRow[]> {
  if (rows.length === 0 || refs.length === 0) return rows;

  const maps = new Map<string, Map<string, RefRow>>();
  for (const ref of refs) {
    const ids = Array.from(
      new Set(
        rows
          .map((r) => r[ref.idField])
          .filter((v): v is string => typeof v === "string" && v.length > 0),
      ),
    );
    const map = new Map<string, RefRow>();
    if (ids.length > 0) {
      const { data } = await supabase.from(ref.table).select("id, code, name").in("id", ids);
      for (const d of (data ?? []) as RefRow[]) map.set(d.id, d);
    }
    maps.set(ref.as, map);
  }

  return rows.map((r) => {
    const out: LiveRow = { ...r };
    for (const ref of refs) {
      const id = r[ref.idField];
      const hit = typeof id === "string" ? maps.get(ref.as)?.get(id) : undefined;
      out[`${ref.as}_code`] = hit?.code ?? "";
      out[`${ref.as}_name`] = hit?.name ?? "";
    }
    return out;
  });
}

export function useMasterList(
  resource: AnyMasterResource,
  opts: {
    enabled: boolean;
    labelRefs?: LabelRef[];
    pageSize?: number;
    filters?: Record<string, string | number | boolean | null>;
  },
) {
  const crud = useMemo(() => makeCrud<LiveRow>(resource), [resource]);
  const pageSize = opts.pageSize ?? 500;
  const filters = opts.filters;
  const refs = useMemo(() => opts.labelRefs ?? [], [opts.labelRefs]);

  const query = useQuery({
    queryKey: masterKeys.list(resource.key, { live: true, pageSize, filters: filters ?? {} }),
    enabled: opts.enabled,
    queryFn: async () => {
      const { rows, count } = await crud.list({ page: 1, pageSize, filters });
      const withLabels = await attachLabels(rows, refs);
      return { rows: withLabels, count };
    },
  });

  return {
    rows: query.data?.rows ?? [],
    count: query.data?.count ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}
