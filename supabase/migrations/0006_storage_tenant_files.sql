-- ===========================================================================
-- 0006  storage: private `tenant-files` bucket + tenant-isolation policies.
-- ---------------------------------------------------------------------------
-- Path convention (enforced by policy):  tenants/{tenant_id}/{module}/{file}
-- The bucket is PRIVATE (public = false); access is only ever via signed URLs
-- or RLS-checked API calls. Guarded so this migration is a no-op if the
-- `storage` schema is absent (e.g. the local RLS test shim).
-- ===========================================================================

-- Extract the tenant_id segment from a storage object name, or NULL if the
-- path does not follow the tenants/{uuid}/... convention. STABLE + safe cast.
create or replace function app.storage_object_tenant_id(object_name text)
returns uuid
language sql
immutable
as $$
  select case
    when split_part(object_name, '/', 1) = 'tenants'
     and split_part(object_name, '/', 2) ~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then split_part(object_name, '/', 2)::uuid
    else null
  end
$$;

do $$
begin
  if not exists (
    select 1 from information_schema.schemata where schema_name = 'storage'
  ) then
    raise notice 'storage schema not present; skipping bucket + policies (local shim).';
    return;
  end if;

  -- Private bucket (idempotent).
  insert into storage.buckets (id, name, public)
  values ('tenant-files', 'tenant-files', false)
  on conflict (id) do update set public = false;

  -- Recreate policies idempotently. Each requires the object path's tenant
  -- segment to be one the caller belongs to -> no cross-tenant access.
  execute 'drop policy if exists tenant_files_select on storage.objects';
  execute $p$
    create policy tenant_files_select on storage.objects
      for select to authenticated
      using (
        bucket_id = 'tenant-files'
        and app.storage_object_tenant_id(name) in (select app.user_tenant_ids())
      )$p$;

  execute 'drop policy if exists tenant_files_insert on storage.objects';
  execute $p$
    create policy tenant_files_insert on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'tenant-files'
        and app.storage_object_tenant_id(name) in (select app.user_tenant_ids())
      )$p$;

  execute 'drop policy if exists tenant_files_update on storage.objects';
  execute $p$
    create policy tenant_files_update on storage.objects
      for update to authenticated
      using (
        bucket_id = 'tenant-files'
        and app.storage_object_tenant_id(name) in (select app.user_tenant_ids())
      )
      with check (
        bucket_id = 'tenant-files'
        and app.storage_object_tenant_id(name) in (select app.user_tenant_ids())
      )$p$;

  execute 'drop policy if exists tenant_files_delete on storage.objects';
  execute $p$
    create policy tenant_files_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'tenant-files'
        and app.storage_object_tenant_id(name) in (select app.user_tenant_ids())
      )$p$;
end
$$;
