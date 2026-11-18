-- Migration 0172: Permission Gate for delete_shipment_document (AWB Entry modify/delete)

create or replace function public.delete_shipment_document(
  p_shipment_id uuid,
  p_document_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_doc public.shipment_documents;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context' using errcode = '42501';
  end if;

  if not app.user_has_permission(v_tenant, 'txn.awb-entry', 'delete')
     and not app.user_has_permission(v_tenant, 'txn.awb-entry', 'modify') then
    raise exception 'AWB Entry permission is required' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.shipments
    where id = p_shipment_id and tenant_id = v_tenant and deleted_at is null and is_locked = true
  ) then
    raise exception 'Shipment is locked' using errcode = 'LOCKED';
  end if;

  select * into v_doc
  from public.shipment_documents
  where id = p_document_id and shipment_id = p_shipment_id and tenant_id = v_tenant and deleted_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'document_not_found');
  end if;

  update public.shipment_documents
  set deleted_at = now(), updated_by = app.current_user_id()
  where id = p_document_id;

  perform app.write_audit_log(
    p_tenant_id => v_tenant,
    p_entity_type => 'shipment_documents',
    p_action => 'DELETE',
    p_entity_id => p_document_id,
    p_module_slug => 'txn.awb-entry',
    p_old => jsonb_build_object(
      'shipment_id', p_shipment_id,
      'document_type', v_doc.document_type,
      'file_name', v_doc.file_name,
      'version', v_doc.version
    )
  );

  return jsonb_build_object('ok', true, 'id', p_document_id);
end;
$$;

revoke all on function public.delete_shipment_document(uuid, uuid) from public;
grant execute on function public.delete_shipment_document(uuid, uuid) to authenticated, service_role;

