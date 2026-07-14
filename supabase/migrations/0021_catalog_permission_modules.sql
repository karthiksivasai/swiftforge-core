-- ===========================================================================
-- 0021  dedicated catalog permission modules (Phase 3 — Catalog freeze)
-- ---------------------------------------------------------------------------
-- Milestone 9B shipped Service Centers + Field Executives gated by two BORROWED
-- generic modules (`mst.location-master`, `mst.pickup-delivery-boy-master`).
-- This freeze migration gives each aggregate its OWN dedicated module so the
-- permission taxonomy matches the actual screens:
--
--   mst.location-master            -> mst.service-center-master  (Service Center Master)
--   mst.pickup-delivery-boy-master -> mst.field-executive-master (Field Executive Master)
--
-- This is a RENAME, not a new concept: the module_id is preserved so every
-- existing group_permissions grant (TENANT_ADMIN / OPERATIONS / ACCOUNTS,
-- including any admin customizations) carries over untouched — NO behavior
-- change. On a fresh install 0010 already seeds the dedicated slugs, so the
-- renames below are no-ops and the backfill only fills genuine gaps.
--
-- The Access Rights screen + its generator (gen_permission_modules.mjs) were
-- updated to the new names, and 0020's RLS / save_service_center / import_master
-- now reference the dedicated slugs. Idempotent + re-runnable.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) Rename the borrowed modules in place (existing deployments). Keeps
--    permission_modules.id stable => existing grants and audit history hold.
--    Guarded by the OLD slug so it is a no-op once applied / on fresh installs.
-- ---------------------------------------------------------------------------
update public.permission_modules
   set slug = 'mst.service-center-master', name = 'Service Center Master', updated_at = now()
 where slug = 'mst.location-master';

update public.permission_modules
   set slug = 'mst.field-executive-master', name = 'Field Executive Master', updated_at = now()
 where slug = 'mst.pickup-delivery-boy-master';

-- ---------------------------------------------------------------------------
-- 2) Backfill grants for existing tenants (idempotent, INSERT-only).
--    Mirrors app.provision_tenant_rbac (0012): TENANT_ADMIN => full access,
--    OPERATIONS => masters read-only (list + search). `do nothing` never
--    overwrites an existing (possibly admin-customized) grant, so this only
--    heals tenants that are somehow missing the row.
-- ---------------------------------------------------------------------------
insert into public.group_permissions
  (tenant_id, group_id, module_id, all_access, can_add, can_modify, can_delete, can_list, can_search)
select g.tenant_id, g.id, pm.id, true, true, true, true, true, true
from public.user_groups g
join public.permission_modules pm
  on pm.slug in ('mst.service-center-master', 'mst.field-executive-master')
where lower(g.name) = 'tenant_admin' and g.deleted_at is null
on conflict (group_id, module_id) do nothing;

insert into public.group_permissions
  (tenant_id, group_id, module_id, all_access, can_add, can_modify, can_delete, can_list, can_search)
select g.tenant_id, g.id, pm.id, false, false, false, false, true, true
from public.user_groups g
join public.permission_modules pm
  on pm.slug in ('mst.service-center-master', 'mst.field-executive-master')
where lower(g.name) = 'operations' and g.deleted_at is null
on conflict (group_id, module_id) do nothing;
