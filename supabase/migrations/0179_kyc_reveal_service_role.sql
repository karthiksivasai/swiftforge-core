-- 0179  Fix app.log_kyc_reveal for service_role fallback by moving v_tenant assignment inside begin block

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
  v_tenant uuid;
  v_user uuid;
  v_has_perm boolean := false;
begin
  if auth.role() = 'service_role' then
    if p_shipment_id is not null then
      select tenant_id into v_tenant from public.shipments where id = p_shipment_id;
    end if;
    if v_tenant is null then
      select id into v_tenant from public.tenants order by created_at asc limit 1;
    end if;
    v_has_perm := true;
  else
    v_tenant := app.current_tenant_id();
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

