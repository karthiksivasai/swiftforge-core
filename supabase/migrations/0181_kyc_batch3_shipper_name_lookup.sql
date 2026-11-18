-- Migration 0181: Support lookup by shipper name in get_shipper_saved_kyc

create or replace function public.get_shipper_saved_kyc(
  p_shipper_id uuid default null,
  p_shipper_code text default null,
  p_mobile text default null,
  p_shipper_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_shipper_id uuid := p_shipper_id;
  v_result jsonb := '[]'::jsonb;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    if auth.role() = 'service_role' or app.is_platform_admin() then
      select id into v_tenant from public.tenants order by created_at asc limit 1;
    else
      raise exception 'No tenant context for the current user' using errcode = '42501';
    end if;
  end if;

  -- 1. Resolve by shipper code
  if v_shipper_id is null and p_shipper_code is not null and btrim(p_shipper_code) <> '' then
    select s.id into v_shipper_id
    from public.shippers s
    where s.tenant_id = v_tenant and s.deleted_at is null
      and upper(s.code) = upper(btrim(p_shipper_code))
    limit 1;
  end if;

  -- 2. Resolve by shipper mobile
  if v_shipper_id is null and p_mobile is not null and btrim(p_mobile) <> '' then
    select s.id into v_shipper_id
    from public.shippers s
    where s.tenant_id = v_tenant and s.deleted_at is null
      and s.mobile = regexp_replace(p_mobile, '\D', '', 'g')
    order by s.last_used_at desc nulls last, s.updated_at desc
    limit 1;
  end if;

  -- 3. Resolve by shipper company / contact name
  if v_shipper_id is null and p_shipper_name is not null and btrim(p_shipper_name) <> '' then
    select s.id into v_shipper_id
    from public.shippers s
    where s.tenant_id = v_tenant and s.deleted_at is null
      and lower(btrim(s.name)) = lower(btrim(p_shipper_name))
    order by s.last_used_at desc nulls last, s.updated_at desc
    limit 1;
  end if;

  if v_shipper_id is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', d.id,
      'shipper_id', d.shipper_id,
      'seq', d.seq,
      'kyc_type', d.kyc_type,
      'file_name', d.file_name,
      'document_no', d.document_no,
      'side', coalesce(d.side, 'Single/Both'),
      'expiry_date', d.expiry_date,
      'storage_path', d.storage_path,
      'mime_type', d.mime_type,
      'file_size', d.file_size,
      'entry_date', d.entry_date
    ) order by d.seq asc
  ), '[]'::jsonb) into v_result
  from public.shipper_kyc_documents d
  where d.tenant_id = v_tenant and d.shipper_id = v_shipper_id;

  return v_result;
end;
$$;

revoke all on function public.get_shipper_saved_kyc(uuid, text, text, text) from public;
grant execute on function public.get_shipper_saved_kyc(uuid, text, text, text) to authenticated, service_role;

