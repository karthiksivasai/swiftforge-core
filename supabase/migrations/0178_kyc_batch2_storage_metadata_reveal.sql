-- ===========================================================================
-- 0178  KYC Batch 2: Storage Architecture, Sensitive Data Masking & Reveal Audit
-- ---------------------------------------------------------------------------
-- Requirements addressed:
--   D15 / KYC-10: Seed 'txn.kyc-reveal' permission module and create audited
--                 log_kyc_reveal RPC recording ACCESS events in public.audit_logs.
--   D13 / KYC-05: Ensure shipment_documents supports private bucket file_url storage.
--   D12 / KYC-08: Support metadata fields (document_no, expiry_date, side) in raw_meta.
-- ===========================================================================

-- 1. Seed txn.kyc-reveal permission module
insert into public.permission_modules (slug, section, name, under_menu, sort_order)
select 'txn.kyc-reveal', 'TRANSACTION', 'KYC Unmask & Reveal', 'Entry',
       coalesce((select max(sort_order) + 1 from public.permission_modules), 1)
 where not exists (
   select 1 from public.permission_modules where slug = 'txn.kyc-reveal'
 );

-- 2. Auto-grant txn.kyc-reveal to Admin and system user groups
insert into public.group_permissions (
  tenant_id, group_id, module_id,
  all_access, can_add, can_modify, can_delete, can_list, can_search
)
select g.tenant_id, g.id, m.id, true, true, true, true, true, true
  from public.user_groups g
  join public.permission_modules m
    on m.slug = 'txn.kyc-reveal'
 where (g.is_system or g.name ilike '%admin%')
   and not exists (
     select 1 from public.group_permissions gp
      where gp.group_id = g.id and gp.module_id = m.id
   );

-- 3. Create app.log_kyc_reveal RPC to audit sensitive number reveal events
create or replace function app.log_kyc_reveal(
  p_shipment_id uuid,
  p_document_id uuid default null,
  p_field text default 'document_no',
  p_doc_type text default 'KYC'
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_user uuid;
  v_has_perm boolean := false;
begin
  if auth.role() = 'service_role' then
    if v_tenant is null and p_shipment_id is not null then
      select tenant_id into v_tenant from public.shipments where id = p_shipment_id;
    end if;
    if v_tenant is null then
      select id into v_tenant from public.tenants order by created_at asc limit 1;
    end if;
    v_has_perm := true;
  else
    v_user := app.current_app_user_id(v_tenant);
    v_has_perm := app.user_has_permission(v_tenant, 'txn.kyc-reveal', 'search')
               or app.user_has_permission(v_tenant, 'txn.kyc-reveal', 'list')
               or app.user_has_permission(v_tenant, 'txn.awb-entry', 'modify');
  end if;

  if not v_has_perm then
    raise exception 'Permission denied: txn.kyc-reveal required' using errcode = '42501';
  end if;

  -- Log reveal event in audit_logs with action = 'ACCESS'
  perform app.write_audit_log(
    p_tenant_id   => v_tenant,
    p_entity_type => 'shipment_documents',
    p_action      => 'ACCESS',
    p_entity_id   => coalesce(p_document_id, p_shipment_id),
    p_module_slug => 'txn.kyc-reveal',
    p_old         => jsonb_build_object('masked', true),
    p_new         => jsonb_build_object(
      'revealed_field', coalesce(p_field, 'document_no'),
      'doc_type', coalesce(p_doc_type, 'KYC'),
      'shipment_id', p_shipment_id,
      'revealed_by', v_user,
      'revealed_at', now()
    )
  );

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function app.log_kyc_reveal to authenticated, service_role;

-- Public wrapper for PostgREST RPC
create or replace function public.log_kyc_reveal(
  p_shipment_id uuid,
  p_document_id uuid default null,
  p_field text default 'document_no',
  p_doc_type text default 'KYC'
)
returns jsonb
language sql
security definer
as $$
  select app.log_kyc_reveal(p_shipment_id, p_document_id, p_field, p_doc_type);
$$;

grant execute on function public.log_kyc_reveal to authenticated, service_role;
