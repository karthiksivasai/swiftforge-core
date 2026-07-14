-- ===========================================================================
-- 0015  geo & serviceability masters (Phase 3, blueprint 01 §2.4)
-- ---------------------------------------------------------------------------
-- Seven tenant-owned masters: countries, zones, states, destinations,
-- pincodes, country_pincodes, areas. Each follows the global contract and the
-- Phase 3 master-core framework (0014):
--   * id + tenant_id + audit columns + deleted_at + row_version
--   * UNIQUE (tenant_id, id)  -> target for composite (no cross-tenant) FKs
--   * partial UNIQUE natural keys (WHERE deleted_at IS NULL)
--   * tenant-leading + trigram indexes
--   * app.attach_master_triggers(table, slug) -> touch + audit triggers
--   * RLS: SELECT for tenant members; write gated by app.user_has_permission
--
-- Cross-tenant integrity: interlinked geo FKs are COMPOSITE on (tenant_id, id)
-- so a row can only ever reference a parent in its OWN tenant (blueprint §4).
--
-- Also: seeds the new `mst.pincode-master` permission module (pincodes has no
-- row in the seeded 168) and backfills the grant to existing TENANT_ADMIN
-- (all access) and OPERATIONS (list/search) groups. Future tenants get it
-- automatically via app.provision_tenant_rbac (which grants every module).
--
-- Idempotent: create-if-not-exists / guarded constraints / drop-then-create
-- policies / on-conflict seeds.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Enable composite (tenant_id, id) FKs INTO branches (created in 0003 without
-- that unique key). Additive; does not modify the 0003 migration.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'branches_tenant_id_uq') then
    alter table public.branches add constraint branches_tenant_id_uq unique (tenant_id, id);
  end if;
end $$;

-- ===========================================================================
-- countries
-- ===========================================================================
create table if not exists public.countries (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  code         text not null,
  name         text not null,
  weight_unit  text check (weight_unit is null or weight_unit in ('KGS','LBS')),
  currency     text,
  isd_code     text,
  created_at   timestamptz not null default now(),
  created_by   uuid,
  updated_at   timestamptz not null default now(),
  updated_by   uuid,
  deleted_at   timestamptz,
  row_version  integer not null default 1,
  constraint countries_tenant_id_uq unique (tenant_id, id)
);
create unique index if not exists countries_tenant_code_uq
  on public.countries (tenant_id, code) where deleted_at is null;
create index if not exists countries_tenant_idx on public.countries (tenant_id);
create index if not exists countries_name_trgm
  on public.countries using gin (name gin_trgm_ops);

-- ===========================================================================
-- zones
-- ===========================================================================
create table if not exists public.zones (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  code         text not null,
  name         text not null,
  created_at   timestamptz not null default now(),
  created_by   uuid,
  updated_at   timestamptz not null default now(),
  updated_by   uuid,
  deleted_at   timestamptz,
  row_version  integer not null default 1,
  constraint zones_tenant_id_uq unique (tenant_id, id)
);
create unique index if not exists zones_tenant_code_uq
  on public.zones (tenant_id, code) where deleted_at is null;
create index if not exists zones_tenant_idx on public.zones (tenant_id);

-- ===========================================================================
-- states  (zone_id -> zones, same tenant)
-- ===========================================================================
create table if not exists public.states (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  code               text not null,
  name               text not null,
  zone_id            uuid,
  gst_alias          text,
  is_union_territory boolean not null default false,
  created_at         timestamptz not null default now(),
  created_by         uuid,
  updated_at         timestamptz not null default now(),
  updated_by         uuid,
  deleted_at         timestamptz,
  row_version        integer not null default 1,
  constraint states_tenant_id_uq unique (tenant_id, id),
  constraint states_zone_fk foreign key (tenant_id, zone_id)
    references public.zones (tenant_id, id) on delete restrict
);
create unique index if not exists states_tenant_code_uq
  on public.states (tenant_id, code) where deleted_at is null;
create index if not exists states_tenant_idx on public.states (tenant_id);
create index if not exists states_tenant_zone_idx on public.states (tenant_id, zone_id);
create index if not exists states_name_trgm
  on public.states using gin (name gin_trgm_ops);

-- ===========================================================================
-- destinations  (country/state/zone -> geo; main/manifest branch -> branches)
-- ===========================================================================
create table if not exists public.destinations (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  dest_type          text not null default 'DOMESTIC'
                       check (dest_type in ('DOMESTIC','INTERNATIONAL','LOCAL')),
  code               text not null,
  name               text not null,
  country_id         uuid,
  state_id           uuid,
  service_type       text check (service_type is null or service_type in ('REGULAR','METRO','REMOTE')),
  zone_id            uuid,
  main_branch_id     uuid,
  manifest_branch_id uuid,
  email              text,
  mobile             text,
  status             text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  created_at         timestamptz not null default now(),
  created_by         uuid,
  updated_at         timestamptz not null default now(),
  updated_by         uuid,
  deleted_at         timestamptz,
  row_version        integer not null default 1,
  constraint destinations_tenant_id_uq unique (tenant_id, id),
  constraint destinations_country_fk foreign key (tenant_id, country_id)
    references public.countries (tenant_id, id) on delete restrict,
  constraint destinations_state_fk foreign key (tenant_id, state_id)
    references public.states (tenant_id, id) on delete restrict,
  constraint destinations_zone_fk foreign key (tenant_id, zone_id)
    references public.zones (tenant_id, id) on delete restrict,
  constraint destinations_main_branch_fk foreign key (tenant_id, main_branch_id)
    references public.branches (tenant_id, id) on delete restrict,
  constraint destinations_manifest_branch_fk foreign key (tenant_id, manifest_branch_id)
    references public.branches (tenant_id, id) on delete restrict
);
create unique index if not exists destinations_tenant_code_uq
  on public.destinations (tenant_id, code) where deleted_at is null;
create index if not exists destinations_tenant_type_status_idx
  on public.destinations (tenant_id, dest_type, status);
create index if not exists destinations_tenant_country_idx
  on public.destinations (tenant_id, country_id);
create index if not exists destinations_name_trgm
  on public.destinations using gin (name gin_trgm_ops);

-- ===========================================================================
-- pincodes  (destination/zone/state -> geo; branch -> branches; vendor deferred)
-- ===========================================================================
create table if not exists public.pincodes (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  pin_code         text not null,
  pin_name         text,
  branch_id        uuid,
  destination_id   uuid,
  vendor_id        uuid,                       -- FK deferred to parties slice
  zone_id          uuid,
  state_id         uuid,
  is_oda           boolean not null default false,
  is_serviceable   boolean not null default true,
  pickup_available boolean not null default false,
  distance_km      numeric(12,3),
  created_at       timestamptz not null default now(),
  created_by       uuid,
  updated_at       timestamptz not null default now(),
  updated_by       uuid,
  deleted_at       timestamptz,
  row_version      integer not null default 1,
  constraint pincodes_tenant_id_uq unique (tenant_id, id),
  constraint pincodes_destination_fk foreign key (tenant_id, destination_id)
    references public.destinations (tenant_id, id) on delete restrict,
  constraint pincodes_zone_fk foreign key (tenant_id, zone_id)
    references public.zones (tenant_id, id) on delete restrict,
  constraint pincodes_state_fk foreign key (tenant_id, state_id)
    references public.states (tenant_id, id) on delete restrict,
  constraint pincodes_branch_fk foreign key (tenant_id, branch_id)
    references public.branches (tenant_id, id) on delete restrict
);
create unique index if not exists pincodes_tenant_pin_uq
  on public.pincodes (tenant_id, pin_code) where deleted_at is null;
create index if not exists pincodes_tenant_serviceable_idx
  on public.pincodes (tenant_id, is_serviceable, pin_code);
create index if not exists pincodes_tenant_destination_idx
  on public.pincodes (tenant_id, destination_id);
create index if not exists pincodes_pin_trgm
  on public.pincodes using gin (pin_code gin_trgm_ops);
create index if not exists pincodes_pinname_trgm
  on public.pincodes using gin (pin_name gin_trgm_ops);

-- ===========================================================================
-- country_pincodes  (country_id -> countries, same tenant)
-- ===========================================================================
create table if not exists public.country_pincodes (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  country_id   uuid not null,
  pin_code     text not null,
  city_name    text not null default '',
  state_name   text,
  created_at   timestamptz not null default now(),
  created_by   uuid,
  updated_at   timestamptz not null default now(),
  updated_by   uuid,
  deleted_at   timestamptz,
  row_version  integer not null default 1,
  constraint country_pincodes_tenant_id_uq unique (tenant_id, id),
  constraint country_pincodes_country_fk foreign key (tenant_id, country_id)
    references public.countries (tenant_id, id) on delete restrict
);
create unique index if not exists country_pincodes_uq
  on public.country_pincodes (tenant_id, country_id, pin_code, city_name)
  where deleted_at is null;
create index if not exists country_pincodes_tenant_country_idx
  on public.country_pincodes (tenant_id, country_id);
create index if not exists country_pincodes_pin_trgm
  on public.country_pincodes using gin (pin_code gin_trgm_ops);

-- ===========================================================================
-- areas  (branch-scoped; branch -> branches, destination -> destinations)
-- ===========================================================================
create table if not exists public.areas (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  branch_id      uuid not null,
  name           text not null,
  destination_id uuid,
  created_at     timestamptz not null default now(),
  created_by     uuid,
  updated_at     timestamptz not null default now(),
  updated_by     uuid,
  deleted_at     timestamptz,
  row_version    integer not null default 1,
  constraint areas_tenant_id_uq unique (tenant_id, id),
  constraint areas_branch_fk foreign key (tenant_id, branch_id)
    references public.branches (tenant_id, id) on delete restrict,
  constraint areas_destination_fk foreign key (tenant_id, destination_id)
    references public.destinations (tenant_id, id) on delete restrict
);
create unique index if not exists areas_tenant_branch_name_uq
  on public.areas (tenant_id, branch_id, name) where deleted_at is null;
create index if not exists areas_tenant_branch_idx on public.areas (tenant_id, branch_id);
create index if not exists areas_name_trgm
  on public.areas using gin (name gin_trgm_ops);

-- ===========================================================================
-- touch + audit triggers (one call per table, from the 0014 framework)
-- ===========================================================================
select app.attach_master_triggers('countries',        'mst.country-master');
select app.attach_master_triggers('zones',            'mst.zone-master');
select app.attach_master_triggers('states',           'mst.state-master');
select app.attach_master_triggers('destinations',     'mst.destination-master');
select app.attach_master_triggers('pincodes',         'mst.pincode-master');
select app.attach_master_triggers('country_pincodes', 'mst.country-pincodes');
select app.attach_master_triggers('areas',            'mst.area-master');

-- ===========================================================================
-- new permission module: pincodes has no row in the seeded 168.
-- ===========================================================================
insert into public.permission_modules (slug, section, name, under_menu, sort_order) values
  ('mst.pincode-master', 'MASTERS', 'Pincode Master', 'Masters', 200)
on conflict (slug) do update set
  section    = excluded.section,
  name       = excluded.name,
  under_menu = excluded.under_menu,
  sort_order = excluded.sort_order,
  is_active  = true,
  updated_at = now();

-- Backfill the new module to existing tenants' system groups (future tenants
-- get it automatically through app.provision_tenant_rbac). Surgical: only the
-- new module, ON CONFLICT DO NOTHING so any customized grants are untouched.
insert into public.group_permissions
  (tenant_id, group_id, module_id, all_access, can_add, can_modify, can_delete, can_list, can_search)
select g.tenant_id, g.id, pm.id, true, true, true, true, true, true
from public.user_groups g
cross join public.permission_modules pm
where pm.slug = 'mst.pincode-master'
  and lower(g.name) = 'tenant_admin' and g.deleted_at is null
on conflict (group_id, module_id) do nothing;

insert into public.group_permissions
  (tenant_id, group_id, module_id, all_access, can_add, can_modify, can_delete, can_list, can_search)
select g.tenant_id, g.id, pm.id, false, false, false, false, true, true
from public.user_groups g
cross join public.permission_modules pm
where pm.slug = 'mst.pincode-master'
  and lower(g.name) = 'operations' and g.deleted_at is null
on conflict (group_id, module_id) do nothing;

-- ===========================================================================
-- Row Level Security — tenant read; permission-gated writes (per-master slug).
-- ===========================================================================
do $$
declare r record;
begin
  for r in (
    select * from (values
      ('countries',        'mst.country-master'),
      ('zones',            'mst.zone-master'),
      ('states',           'mst.state-master'),
      ('destinations',     'mst.destination-master'),
      ('pincodes',         'mst.pincode-master'),
      ('country_pincodes', 'mst.country-pincodes'),
      ('areas',            'mst.area-master')
    ) as t(tbl, slug)
  )
  loop
    execute format('alter table public.%I enable row level security;', r.tbl);

    execute format('drop policy if exists %I on public.%I;', r.tbl || '_select', r.tbl);
    execute format($p$create policy %I on public.%I
      for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());$p$,
      r.tbl || '_select', r.tbl);

    execute format('drop policy if exists %I on public.%I;', r.tbl || '_insert', r.tbl);
    execute format($p$create policy %I on public.%I
      for insert with check (
        tenant_id in (select app.user_tenant_ids())
        and app.user_has_permission(tenant_id, %L, 'add'));$p$,
      r.tbl || '_insert', r.tbl, r.slug);

    execute format('drop policy if exists %I on public.%I;', r.tbl || '_update', r.tbl);
    execute format($p$create policy %I on public.%I
      for update using (
        tenant_id in (select app.user_tenant_ids())
        and app.user_has_permission(tenant_id, %L, 'modify'))
      with check (
        tenant_id in (select app.user_tenant_ids())
        and app.user_has_permission(tenant_id, %L, 'modify'));$p$,
      r.tbl || '_update', r.tbl, r.slug, r.slug);

    execute format('drop policy if exists %I on public.%I;', r.tbl || '_delete', r.tbl);
    execute format($p$create policy %I on public.%I
      for delete using (
        tenant_id in (select app.user_tenant_ids())
        and app.user_has_permission(tenant_id, %L, 'delete'));$p$,
      r.tbl || '_delete', r.tbl, r.slug);
  end loop;
end $$;
