-- ===========================================================================
-- 0068  Shipper form fields + KYC (CourierWala parity)
-- ---------------------------------------------------------------------------
-- Full Add/Edit form: contact, phones, IEC/PAN, bank, firm, NFEI, LUT, KYC.
-- ===========================================================================

alter table public.shippers
  add column if not exists contact_person text,
  add column if not exists telephone1 text,
  add column if not exists telephone2 text,
  add column if not exists fax text,
  add column if not exists industry_id uuid,
  add column if not exists iec_no text,
  add column if not exists pan_no text,
  add column if not exists service_center_id uuid,
  add column if not exists service_center_code text,
  add column if not exists bank_ad_code text,
  add column if not exists bank_account text,
  add column if not exists bank_ifsc text,
  add column if not exists firm text,
  add column if not exists nfei boolean not null default false,
  add column if not exists lut_number text,
  add column if not exists lut_issue_date date,
  add column if not exists lut_till_date date,
  add column if not exists state_name text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shippers_industry_fk'
  ) then
    alter table public.shippers
      add constraint shippers_industry_fk
      foreign key (tenant_id, industry_id)
      references public.industries (tenant_id, id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'shippers_service_center_fk'
  ) then
    alter table public.shippers
      add constraint shippers_service_center_fk
      foreign key (tenant_id, service_center_id)
      references public.service_centers (tenant_id, id)
      on delete set null;
  end if;
end $$;

create index if not exists shippers_tenant_industry_idx
  on public.shippers (tenant_id, industry_id);
create index if not exists shippers_tenant_service_center_idx
  on public.shippers (tenant_id, service_center_id);

-- ---------------------------------------------------------------------------
-- shipper_kyc_documents
-- ---------------------------------------------------------------------------
create table if not exists public.shipper_kyc_documents (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  shipper_id    uuid not null,
  seq           integer not null,
  kyc_type      text not null,
  file_name     text,
  entry_date    timestamptz not null default now(),
  constraint shipper_kyc_documents_shipper_fk foreign key (tenant_id, shipper_id)
    references public.shippers (tenant_id, id) on delete cascade,
  constraint shipper_kyc_documents_uq unique (tenant_id, shipper_id, seq)
);

create index if not exists shipper_kyc_documents_shipper_idx
  on public.shipper_kyc_documents (tenant_id, shipper_id);

alter table public.shipper_kyc_documents enable row level security;

drop policy if exists shipper_kyc_documents_select on public.shipper_kyc_documents;
create policy shipper_kyc_documents_select on public.shipper_kyc_documents
  for select using (
    tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin()
  );

drop policy if exists shipper_kyc_documents_insert on public.shipper_kyc_documents;
create policy shipper_kyc_documents_insert on public.shipper_kyc_documents
  for insert with check (
    tenant_id in (select app.user_tenant_ids())
    and (
      app.user_has_permission(tenant_id, 'mst.shipper-master', 'add')
      or app.user_has_permission(tenant_id, 'mst.shipper-master', 'modify')
    )
  );

drop policy if exists shipper_kyc_documents_delete on public.shipper_kyc_documents;
create policy shipper_kyc_documents_delete on public.shipper_kyc_documents
  for delete using (
    tenant_id in (select app.user_tenant_ids())
    and (
      app.user_has_permission(tenant_id, 'mst.shipper-master', 'modify')
      or app.user_has_permission(tenant_id, 'mst.shipper-master', 'delete')
    )
  );

create or replace function public.replace_shipper_kyc(
  p_shipper_id uuid,
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
    select 1 from public.shippers s
    where s.tenant_id = v_tenant and s.id = p_shipper_id and s.deleted_at is null
  ) then
    raise exception 'Shipper not found' using errcode = 'P0002';
  end if;

  if not (
    app.user_has_permission(v_tenant, 'mst.shipper-master', 'add')
    or app.user_has_permission(v_tenant, 'mst.shipper-master', 'modify')
  ) then
    raise exception 'Missing permission to update shipper KYC' using errcode = '42501';
  end if;

  if p_docs is null or jsonb_typeof(p_docs) <> 'array' then
    raise exception 'p_docs must be a JSON array' using errcode = '22023';
  end if;

  delete from public.shipper_kyc_documents
  where tenant_id = v_tenant and shipper_id = p_shipper_id;

  for v_elem in select value from jsonb_array_elements(p_docs)
  loop
    v_seq := v_seq + 1;
    insert into public.shipper_kyc_documents (
      tenant_id, shipper_id, seq, kyc_type, file_name, entry_date
    ) values (
      v_tenant,
      p_shipper_id,
      v_seq,
      coalesce(nullif(btrim(v_elem->>'kyc_type'), ''), 'OTHER'),
      nullif(btrim(coalesce(v_elem->>'file_name', '')), ''),
      coalesce((v_elem->>'entry_date')::timestamptz, now())
    );
  end loop;
end;
$$;

revoke all on function public.replace_shipper_kyc(uuid, jsonb) from public;
grant execute on function public.replace_shipper_kyc(uuid, jsonb) to authenticated, service_role;

comment on function public.replace_shipper_kyc(uuid, jsonb) is
  'Replace all KYC document rows for a shipper (metadata only; file upload deferred).';
