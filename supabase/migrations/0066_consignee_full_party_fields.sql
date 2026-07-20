-- ===========================================================================
-- 0066  Consignee form fields (CourierWala parity)
-- ---------------------------------------------------------------------------
-- Add/Edit form fields beyond the list columns:
--   Contact Person, Fax, Industry, Service Center, EORI, VAT, KYC
-- ===========================================================================

alter table public.consignees
  add column if not exists contact_person text,
  add column if not exists fax text,
  add column if not exists industry_id uuid,
  add column if not exists service_center_id uuid,
  add column if not exists service_center_code text,
  add column if not exists eori text,
  add column if not exists vat text,
  add column if not exists kyc_type text,
  add column if not exists kyc_doc_no text,
  add column if not exists kyc_file_name text,
  add column if not exists state_name text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'consignees_industry_fk'
  ) then
    alter table public.consignees
      add constraint consignees_industry_fk
      foreign key (tenant_id, industry_id)
      references public.industries (tenant_id, id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'consignees_service_center_fk'
  ) then
    alter table public.consignees
      add constraint consignees_service_center_fk
      foreign key (tenant_id, service_center_id)
      references public.service_centers (tenant_id, id)
      on delete set null;
  end if;
end $$;

create index if not exists consignees_tenant_industry_idx
  on public.consignees (tenant_id, industry_id);
create index if not exists consignees_tenant_service_center_idx
  on public.consignees (tenant_id, service_center_id);

comment on column public.consignees.contact_person is 'CourierWala Contact Person.';
comment on column public.consignees.eori is 'EORI number for international customs.';
comment on column public.consignees.vat is 'VAT / tax registration number.';
comment on column public.consignees.service_center_code is
  'Free-text service center code; may exist without service_centers FK.';
