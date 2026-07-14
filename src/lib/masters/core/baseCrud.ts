/**
 * Generic, RLS-scoped CRUD for tenant-owned master tables (Phase 3).
 *
 * All calls go through the browser anon client, so Row Level Security and the
 * permission-gated policies (migration 0015) are the real boundary — these
 * helpers only shape the queries. Every master shares the same contract:
 *   - `deleted_at IS NULL` soft-delete filter on reads
 *   - optimistic locking via `row_version` (the DB trigger bumps it; updates and
 *     deletes are guarded with `.eq("row_version", expected)` so a stale write
 *     affects 0 rows and surfaces as a ConflictError)
 *   - `tenant_id` stamped on insert (RLS also checks membership)
 *
 * This module is UI-agnostic (no React). `useMasterResource` wraps it with
 * React Query + permission gating.
 */
import type { PostgrestError } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

/** Columns every master row carries (global contract, blueprint §1). */
export type BaseRow = {
  id: string;
  tenant_id: string;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
  deleted_at: string | null;
  row_version: number;
};

export type ListParams = {
  /** 1-based page number. */
  page?: number;
  pageSize?: number;
  /** Free-text search applied (ILIKE) across the resource's search columns. */
  search?: string;
  /** Override the resource default ordering. */
  orderBy?: string;
  ascending?: boolean;
  /** Exact-match equality filters (e.g. `{ zone_id }`), all AND-ed. */
  filters?: Record<string, string | number | boolean | null>;
};

export type ListResult<TRow> = {
  rows: TRow[];
  count: number;
  page: number;
  pageSize: number;
};

/** Config a resource supplies so the generic CRUD knows how to talk to its table. */
export type CrudConfig = {
  /** Supabase/Postgres table name (public schema). */
  table: string;
  /** Projection passed to `.select()`. */
  columns: string;
  /** Columns eligible for ILIKE free-text search. */
  searchColumns: readonly string[];
  /** Default ordering. */
  orderBy: string;
  ascending?: boolean;
};

export const DEFAULT_PAGE_SIZE = 50;

/** Raised when an optimistic-lock guarded update/delete matches 0 rows. */
export class ConflictError extends Error {
  constructor(message = "This record was changed by someone else. Reload and try again.") {
    super(message);
    this.name = "ConflictError";
  }
}

/** Raised when a unique constraint (natural key) is violated. */
export class DuplicateError extends Error {
  constructor(message = "A record with this value already exists.") {
    super(message);
    this.name = "DuplicateError";
  }
}

/** Translate a raw PostgREST error into a domain error where it helps the UI. */
export function translateDbError(error: PostgrestError): Error {
  // 23505 = unique_violation; 42501 = insufficient_privilege (permission/RLS).
  if (error.code === "23505") return new DuplicateError();
  if (error.code === "42501") {
    return new Error("You don't have permission to perform this action.");
  }
  return new Error(error.message);
}

/** Remove keys whose value is `undefined` so PostgREST doesn't touch them. */
function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** Escape ILIKE wildcards / the PostgREST `or` separator in user search input. */
function sanitizeSearch(term: string): string {
  return term.trim().replace(/[%,()]/g, " ");
}

export type Crud<TRow extends BaseRow> = {
  list: (params?: ListParams) => Promise<ListResult<TRow>>;
  getById: (id: string) => Promise<TRow | null>;
  create: (tenantId: string, values: Record<string, unknown>) => Promise<TRow>;
  update: (id: string, rowVersion: number, patch: Record<string, unknown>) => Promise<TRow>;
  remove: (id: string, rowVersion: number) => Promise<void>;
};

/** Build the CRUD function set for one master table. */
export function makeCrud<TRow extends BaseRow>(config: CrudConfig): Crud<TRow> {
  const { table, columns, searchColumns, orderBy, ascending = true } = config;

  async function list(params: ListParams = {}): Promise<ListResult<TRow>> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE), 500);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase.from(table).select(columns, { count: "exact" }).is("deleted_at", null);

    for (const [col, val] of Object.entries(params.filters ?? {})) {
      query = val === null ? query.is(col, null) : query.eq(col, val);
    }

    const search = params.search ? sanitizeSearch(params.search) : "";
    if (search && searchColumns.length > 0) {
      const ors = searchColumns.map((c) => `${c}.ilike.%${search}%`).join(",");
      query = query.or(ors);
    }

    query = query
      .order(params.orderBy ?? orderBy, { ascending: params.ascending ?? ascending })
      .range(from, to);

    const { data, error, count } = await query;
    if (error) throw translateDbError(error);
    return { rows: (data ?? []) as unknown as TRow[], count: count ?? 0, page, pageSize };
  }

  async function getById(id: string): Promise<TRow | null> {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw translateDbError(error);
    return (data as unknown as TRow) ?? null;
  }

  async function create(tenantId: string, values: Record<string, unknown>): Promise<TRow> {
    const payload = { ...stripUndefined(values), tenant_id: tenantId };
    const { data, error } = await supabase.from(table).insert(payload).select(columns).single();
    if (error) throw translateDbError(error);
    return data as unknown as TRow;
  }

  async function update(
    id: string,
    rowVersion: number,
    patch: Record<string, unknown>,
  ): Promise<TRow> {
    // Never let callers set audit/lock columns directly; the trigger owns them.
    const clean = stripUndefined(patch);
    delete (clean as Record<string, unknown>).row_version;
    delete (clean as Record<string, unknown>).tenant_id;
    delete (clean as Record<string, unknown>).id;

    const { data, error } = await supabase
      .from(table)
      .update(clean)
      .eq("id", id)
      .eq("row_version", rowVersion)
      .is("deleted_at", null)
      .select(columns)
      .maybeSingle();
    if (error) throw translateDbError(error);
    if (!data) throw new ConflictError();
    return data as unknown as TRow;
  }

  async function remove(id: string, rowVersion: number): Promise<void> {
    // Soft delete: stamp deleted_at, still guarded by the optimistic lock.
    const { data, error } = await supabase
      .from(table)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("row_version", rowVersion)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw translateDbError(error);
    if (!data) throw new ConflictError();
  }

  return { list, getById, create, update, remove };
}
