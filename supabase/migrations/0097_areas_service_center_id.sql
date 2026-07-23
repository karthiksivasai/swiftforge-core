-- Areas: store the selected service center (UI label) separately from org branch_id.

alter table public.areas
  add column if not exists service_center_id uuid;

alter table public.areas
  drop constraint if exists areas_service_center_fk;

alter table public.areas
  add constraint areas_service_center_fk
  foreign key (tenant_id, service_center_id)
  references public.service_centers (tenant_id, id)
  on delete restrict;

create index if not exists areas_tenant_service_center_idx
  on public.areas (tenant_id, service_center_id);

comment on column public.areas.service_center_id is
  'Operational service center for this area (shown in the Area master UI). branch_id remains the org branch scope.';
