/**
 * React Query + permission binding for a master resource.
 *
 * This is the single seam between the UI-agnostic core (baseCrud / lookup /
 * import) and React. Given a `MasterResource` definition it returns:
 *   - `perms`  : resolved CRUD action flags for the current user (UI gating)
 *   - `list/get options` : ready for `useQuery`
 *   - `create/update/remove` : `useMutation`s that invalidate the resource cache
 *   - `validateImport/commitImport` : the two-phase import mutations
 *
 * Server-side RLS + SECURITY DEFINER remain the real boundary; the permission
 * checks here are convenience guards to fail fast with a friendly message.
 */
import { useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ZodType, ZodTypeDef } from "zod";

import { useAuth } from "@/lib/auth";
import { resolveActions, type ResolvedActions } from "@/lib/permissions";
import {
  makeCrud,
  type BaseRow,
  type CrudConfig,
  type ListParams,
  type ListResult,
} from "@/lib/masters/core/baseCrud";
import {
  importMasterChunked,
  type ImportMaster,
  type ImportResult,
  type ImportRow,
} from "@/lib/masters/core/import";
import type { LookupKey } from "@/lib/masters/core/lookup";
import { masterKeys } from "@/lib/masters/core/queryKeys";

/**
 * Full description of one master. Combines the CRUD wiring (table/columns/…),
 * the RBAC slug, import metadata, and Zod schemas. Resource files in
 * `../resources` export one of these; screens (M6) consume them via this hook.
 */
export type MasterResource<
  TRow extends BaseRow,
  TCreate extends Record<string, unknown>,
  TUpdate extends Record<string, unknown> = Partial<TCreate>,
> = CrudConfig & {
  /** Stable key for query cache + registry (usually the table name). */
  key: string;
  /** Import RPC master name (equals the table name for geo masters). */
  master: ImportMaster;
  /** `permission_modules.slug` gating this resource. */
  permission: string;
  /** Human labels for toasts / headings. */
  label: { singular: string; plural: string };
  /** Expected import CSV columns (order = template order). */
  importColumns: readonly string[];
  /** Corresponding `public.lookup` key, if this master is pickable. */
  lookupKey?: LookupKey;
  /** Zod schema validating a create payload (DB column shape). */
  createSchema: ZodType<TCreate, ZodTypeDef, unknown>;
  /** Zod schema validating an update patch. */
  updateSchema: ZodType<TUpdate, ZodTypeDef, unknown>;
  /** Optional map from validated values to the DB insert/update record. */
  toRecord?: (values: TCreate | TUpdate) => Record<string, unknown>;
};

export type UpdateArgs<TUpdate> = { id: string; rowVersion: number; patch: TUpdate };
export type RemoveArgs = { id: string; rowVersion: number };

export function useMasterResource<
  TRow extends BaseRow,
  TCreate extends Record<string, unknown>,
  TUpdate extends Record<string, unknown> = Partial<TCreate>,
>(resource: MasterResource<TRow, TCreate, TUpdate>) {
  const { profile, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const tenantId = profile?.tenant_id ?? null;

  const crud = useMemo(() => makeCrud<TRow>(resource), [resource]);

  const perms: ResolvedActions = useMemo(
    () => ({
      canAdd: hasPermission(resource.permission, "add"),
      canModify: hasPermission(resource.permission, "modify"),
      canDelete: hasPermission(resource.permission, "delete"),
      canList: hasPermission(resource.permission, "list"),
      canSearch: hasPermission(resource.permission, "search"),
    }),
    [hasPermission, resource.permission],
  );

  // A write can change both the resource's own rows AND the lookup dropdowns
  // that pick from this master, so invalidate both key subtrees. Lookups live
  // under a separate namespace (["lookup", lookupKey]) and would otherwise stay
  // stale until their staleTime elapsed.
  const invalidate = useCallback(() => {
    const tasks = [queryClient.invalidateQueries({ queryKey: masterKeys.all(resource.key) })];
    if (resource.lookupKey) {
      tasks.push(
        queryClient.invalidateQueries({ queryKey: masterKeys.lookupRoot(resource.lookupKey) }),
      );
    }
    return Promise.all(tasks);
  }, [queryClient, resource.key, resource.lookupKey]);

  const toRecord = useCallback(
    (values: TCreate | TUpdate): Record<string, unknown> =>
      resource.toRecord ? resource.toRecord(values) : (values as Record<string, unknown>),
    [resource],
  );

  const listOptions = useCallback(
    (params?: ListParams) => ({
      queryKey: masterKeys.list(resource.key, params),
      queryFn: (): Promise<ListResult<TRow>> => crud.list(params),
      enabled: perms.canList,
    }),
    [crud, resource.key, perms.canList],
  );

  const getOptions = useCallback(
    (id: string | null | undefined) => ({
      queryKey: masterKeys.detail(resource.key, id),
      queryFn: () => crud.getById(id as string),
      enabled: perms.canList && Boolean(id),
    }),
    [crud, resource.key, perms.canList],
  );

  const create = useMutation({
    mutationFn: (values: TCreate) => {
      if (!tenantId) throw new Error("No tenant context. Please sign in again.");
      if (!perms.canAdd) throw new Error("You don't have permission to add records.");
      return crud.create(tenantId, toRecord(values));
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, rowVersion, patch }: UpdateArgs<TUpdate>) => {
      if (!perms.canModify) throw new Error("You don't have permission to modify records.");
      return crud.update(id, rowVersion, toRecord(patch));
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: ({ id, rowVersion }: RemoveArgs) => {
      if (!perms.canDelete) throw new Error("You don't have permission to delete records.");
      return crud.remove(id, rowVersion);
    },
    onSuccess: invalidate,
  });

  // Dry-run: never mutates data, so no cache invalidation.
  const validateImport = useMutation({
    mutationFn: (rows: ReadonlyArray<ImportRow>): Promise<ImportResult> =>
      importMasterChunked(resource.master as ImportMaster, "VALIDATE", rows),
  });

  const commitImport = useMutation({
    mutationFn: (rows: ReadonlyArray<ImportRow>): Promise<ImportResult> => {
      if (!perms.canAdd) throw new Error("You don't have permission to import records.");
      return importMasterChunked(resource.master as ImportMaster, "COMMIT", rows);
    },
    onSuccess: invalidate,
  });

  return {
    resource,
    perms,
    tenantId,
    crud,
    listOptions,
    getOptions,
    create,
    update,
    remove,
    validateImport,
    commitImport,
  };
}
