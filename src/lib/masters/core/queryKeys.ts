/**
 * Single source of truth for every React Query key used by the master layer.
 *
 * Keys are structured hierarchically so React Query's prefix matching lets us
 * invalidate broadly (`all(key)`) or narrowly (`detail(key, id)`):
 *
 *   [resourceKey]                         -> everything for a resource
 *   [resourceKey, "list", params]         -> one list page/filter combination
 *   [resourceKey, "detail", id]           -> one record
 *   ["lookup", lookupKey]                 -> every lookup for a master
 *   ["lookup", lookupKey, query, limit]   -> one autocomplete query
 *   ["import", jobId]                     -> one import job (status views, M6)
 *
 * Nothing else in the codebase should author query-key arrays by hand.
 */

/** Anything that can legally appear in a list query key's params slot. */
export type QueryKeyParams = Record<string, unknown>;

export const masterKeys = {
  /** Root key for a resource — use to invalidate list + detail together. */
  all: (resourceKey: string) => [resourceKey] as const,

  /** A single list query, keyed by its params (search/paging/filters). */
  list: (resourceKey: string, params?: QueryKeyParams) =>
    [resourceKey, "list", params ?? {}] as const,

  /** A single record. */
  detail: (resourceKey: string, id: string | null | undefined) =>
    [resourceKey, "detail", id] as const,

  /** Root key for a lookup — use to invalidate all queries of that lookup. */
  lookupRoot: (lookupKey: string) => ["lookup", lookupKey] as const,

  /** One autocomplete query (query text + limit are part of the identity). */
  lookup: (lookupKey: string, query: string, limit: number) =>
    ["lookup", lookupKey, query, limit] as const,

  /** One import job (status/detail views land in M6). */
  import: (jobId: string) => ["import", jobId] as const,
} as const;

export type MasterKeys = typeof masterKeys;
