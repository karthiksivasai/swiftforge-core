-- ===========================================================================
-- 0067  Consignee KYC documents (CourierWala "Kyc Details")
-- ---------------------------------------------------------------------------
-- Multiple KYC files per consignee: document type, file name, entry date.
-- File bytes stay client-side for now (name metadata only), matching customer KYC.
-- ===========================================================================

create table if not exists public.consignee_kyc_documents (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  consignee_id  uuid not null,
  seq           integer not null,
  kyc_type      text not null,
  file_name     text,
  entry_date    timestamptz not null default now(),
  constraint consignee_kyc_documents_consignee_fk foreign key (tenant_id, consignee_id)
    references public.consignees (tenant_id, id) on delete cascade,
  constraint consignee_kyc_documents_uq unique (tenant_id, consignee_id, seq)
);

create index if not exists consignee_kyc_documents_consignee_idx
  on public.consignee_kyc_documents (tenant_id, consignee_id);

alter table public.consignee_kyc_documents enable row level security;

drop policy if exists consignee_kyc_documents_select on public.consignee_kyc_documents;
create policy consignee_kyc_documents_select on public.consignee_kyc_documents
  for select using (
    tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin()
  );

drop policy if exists consignee_kyc_documents_insert on public.consignee_kyc_documents;
create policy consignee_kyc_documents_insert on public.consignee_kyc_documents
  for insert with check (
    tenant_id in (select app.user_tenant_ids())
    and (
      app.user_has_permission(tenant_id, 'mst.consignee-master', 'add')
      or app.user_has_permission(tenant_id, 'mst.consignee-master', 'modify')
    )
  );

drop policy if exists consignee_kyc_documents_delete on public.consignee_kyc_documents;
create policy consignee_kyc_documents_delete on public.consignee_kyc_documents
  for delete using (
    tenant_id in (select app.user_tenant_ids())
    and (
      app.user_has_permission(tenant_id, 'mst.consignee-master', 'modify')
      or app.user_has_permission(tenant_id, 'mst.consignee-master', 'delete')
    )
  );

create or replace function public.replace_consignee_kyc(
  p_consignee_id uuid,
  p_docs jsonb
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_elem jsonb;
  v_seq int := 0;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.consignees c
    where c.tenant_id = v_tenant and c.id = p_consignee_id and c.deleted_at is null
  ) then
    raise exception 'Consignee not found' using errcode = 'P0002';
  end if;

  if not (
    app.user_has_permission(v_tenant, 'mst.consignee-master', 'add')
    or app.user_has_permission(v_tenant, 'mst.consignee-master', 'modify')
  ) then
    raise exception 'Missing permission to update consignee KYC' using errcode = '42501';
  end if;

  if p_docs is null or jsonb_typeof(p_docs) <> 'array' then
    raise exception 'p_docs must be a JSON array' using errcode = '22023';
  end if;

  delete from public.consignee_kyc_documents
  where tenant_id = v_tenant and consignee_id = p_consignee_id;

  for v_elem in select value from jsonb_array_elements(p_docs)
  loop
    v_seq := v_seq + 1;
    insert into public.consignee_kyc_documents (
      tenant_id, consignee_id, seq, kyc_type, file_name, entry_date
    ) values (
      v_tenant,
      p_consignee_id,
      v_seq,
      coalesce(nullif(btrim(v_elem->>'kyc_type'), ''), 'OTHER'),
      nullif(btrim(coalesce(v_elem->>'file_name', '')), ''),
      coalesce((v_elem->>'entry_date')::timestamptz, now())
    );
  end loop;
end;
$$;

revoke all on function public.replace_consignee_kyc(uuid, jsonb) from public;
grant execute on function public.replace_consignee_kyc(uuid, jsonb) to authenticated, service_role;

comment on function public.replace_consignee_kyc(uuid, jsonb) is
  'Replace all KYC document rows for a consignee (metadata only; file upload deferred).';
