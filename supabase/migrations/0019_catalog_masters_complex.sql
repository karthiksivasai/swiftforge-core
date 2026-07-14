-- ===========================================================================
-- 0019  complex catalog masters (Phase 3 — Catalog Masters, Milestone 9A)
-- ---------------------------------------------------------------------------
-- Two new masters that build on the SAME frozen framework (0014 master-core +
-- 0015 conventions) plus the FIRST many-to-many relationship in the catalog:
--
--   * charges              — billing/freight/tax charge master (flat contract)
--   * charge_dependencies  — self-referential M:N junction (a charge "includes"
--                            other charges). NOT a generic-CRUD table: it is
--                            synchronized by a dedicated transactional RPC
--                            (public.save_charge_dependencies) so the generic
--                            CRUD framework stays generic.
--   * airlines             — airline master with a COMPOSITE FK to products
--                            (tenant_id, product_id) -> products(tenant_id, id).
--
-- Every master keeps the global contract: id + tenant_id + audit cols +
-- deleted_at + row_version, UNIQUE (tenant_id, id) (composite-FK target),
-- partial UNIQUE natural key, tenant-leading + trigram indexes,
-- app.attach_master_triggers (touch + audit), and RLS (tenant SELECT; writes
-- gated by app.user_has_permission on the per-master slug).
--
-- Permission slugs already ship in the seeded set (0010): mst.charge-master,
-- mst.airlines. So — like Milestone 8 — there is NOTHING to insert/backfill.
--
-- Import + lookup are EXTENDED (not redesigned): public.import_master and
-- public.lookup are re-created with ALL prior branches kept verbatim and the new
-- charge/airline branches appended. Each per-master arm stays self-contained so
-- the engines can later be split into dispatcher + per-master helpers
-- (app.import_charges(), app.import_airlines(), …) WITHOUT any public-API change
-- — see the TODO markers below.
--
-- Idempotent: create-if-not-exists / guarded constraints / drop-then-create
-- policies / create-or-replace functions.
-- ===========================================================================

-- ===========================================================================
-- charges  (billing / freight / tax charge master)
-- ===========================================================================
create table if not exists public.charges (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  code              text not null,
  name              text not null,
  base_on           text not null default 'Actual Weight',
  charge_type       text not null default 'AIRWAYBILL'
                      check (charge_type in ('AIRWAYBILL','EXPENSE','INCOME','OBC','PURCHASE')),
  charge_rate       numeric(14,4) not null default 0 check (charge_rate >= 0),
  apply_fuel        boolean not null default false,
  apply_tax_on_fuel boolean not null default false,
  apply_tax         boolean not null default false,
  hsn_code          text,
  sequence          integer not null default 0,
  created_at        timestamptz not null default now(),
  created_by        uuid,
  updated_at        timestamptz not null default now(),
  updated_by        uuid,
  deleted_at        timestamptz,
  row_version       integer not null default 1,
  constraint charges_tenant_id_uq unique (tenant_id, id)
);
create unique index if not exists charges_tenant_code_uq
  on public.charges (tenant_id, code) where deleted_at is null;
create index if not exists charges_tenant_idx on public.charges (tenant_id);
create index if not exists charges_name_trgm
  on public.charges using gin (name gin_trgm_ops);
create index if not exists charges_code_trgm
  on public.charges using gin (code gin_trgm_ops);

-- ===========================================================================
-- charge_dependencies  (self-referential M:N: charge -> included charges)
-- ---------------------------------------------------------------------------
-- Deliberately NOT a full master: no row_version / audit triggers. It is
-- synchronized transactionally by public.save_charge_dependencies (below) and
-- audited at the CHARGE level. Composite FKs pin both sides to the same tenant.
-- ===========================================================================
create table if not exists public.charge_dependencies (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  charge_id            uuid not null,
  depends_on_charge_id uuid not null,
  created_at           timestamptz not null default now(),
  created_by           uuid default auth.uid(),
  constraint charge_dependencies_charge_fk foreign key (tenant_id, charge_id)
    references public.charges (tenant_id, id) on delete cascade,
  constraint charge_dependencies_dep_fk foreign key (tenant_id, depends_on_charge_id)
    references public.charges (tenant_id, id) on delete cascade,
  constraint charge_dependencies_no_self check (charge_id <> depends_on_charge_id),
  constraint charge_dependencies_uq unique (tenant_id, charge_id, depends_on_charge_id)
);
create index if not exists charge_dependencies_charge_idx
  on public.charge_dependencies (tenant_id, charge_id);
create index if not exists charge_dependencies_dep_idx
  on public.charge_dependencies (tenant_id, depends_on_charge_id);

-- ===========================================================================
-- airlines  (airline master; product_id -> products, same tenant)
-- ===========================================================================
create table if not exists public.airlines (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  name         text not null,
  product_id   uuid not null,
  created_at   timestamptz not null default now(),
  created_by   uuid,
  updated_at   timestamptz not null default now(),
  updated_by   uuid,
  deleted_at   timestamptz,
  row_version  integer not null default 1,
  constraint airlines_tenant_id_uq unique (tenant_id, id),
  constraint airlines_product_fk foreign key (tenant_id, product_id)
    references public.products (tenant_id, id) on delete restrict
);
create unique index if not exists airlines_tenant_name_uq
  on public.airlines (tenant_id, name) where deleted_at is null;
create index if not exists airlines_tenant_idx on public.airlines (tenant_id);
create index if not exists airlines_tenant_product_idx on public.airlines (tenant_id, product_id);
create index if not exists airlines_name_trgm
  on public.airlines using gin (name gin_trgm_ops);

-- ===========================================================================
-- touch + audit triggers (one call per master, from the 0014 framework)
-- ===========================================================================
select app.attach_master_triggers('charges',  'mst.charge-master');
select app.attach_master_triggers('airlines', 'mst.airlines');

-- ===========================================================================
-- Row Level Security — tenant read; permission-gated writes (per-master slug).
-- Identical policy shape to the geo/catalog slices. charge_dependencies gets its
-- own policy set (gated by the charge-master slug) so direct reads are tenant
-- scoped and any direct write still requires charge-master permission.
-- ===========================================================================
do $$
declare r record;
begin
  for r in (
    select * from (values
      ('charges',  'mst.charge-master'),
      ('airlines', 'mst.airlines')
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

-- charge_dependencies RLS (charge-master gated; add covers dependency writes).
alter table public.charge_dependencies enable row level security;

drop policy if exists charge_dependencies_select on public.charge_dependencies;
create policy charge_dependencies_select on public.charge_dependencies
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());

drop policy if exists charge_dependencies_insert on public.charge_dependencies;
create policy charge_dependencies_insert on public.charge_dependencies
  for insert with check (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'mst.charge-master', 'modify'));

drop policy if exists charge_dependencies_delete on public.charge_dependencies;
create policy charge_dependencies_delete on public.charge_dependencies
  for delete using (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'mst.charge-master', 'modify'));

-- ===========================================================================
-- public.save_charge_dependencies — dedicated transactional junction sync.
-- ---------------------------------------------------------------------------
-- The charge row itself is created/updated via the generic CRUD (baseCrud). Its
-- M:N "included charges" set is synchronized here in ONE transaction: delete the
-- old set, insert the new (self-references and cross-tenant ids filtered out),
-- and write ONE charge-level audit entry. SECURITY DEFINER + explicit tenant and
-- permission checks keep it tenant-safe. Keeping this OUT of generic CRUD is the
-- Milestone 9 requirement for charge dependencies.
-- ===========================================================================
create or replace function public.save_charge_dependencies(
  p_charge_id       uuid,
  p_depends_on_ids  uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_count  integer := 0;
begin
  -- Resolve the charge's tenant and confirm it belongs to the caller.
  select tenant_id into v_tenant
  from public.charges
  where id = p_charge_id and deleted_at is null;

  if v_tenant is null then
    raise exception 'Charge not found' using errcode = '22023';
  end if;
  if v_tenant not in (select app.user_tenant_ids()) then
    raise exception 'No tenant context for this charge' using errcode = '42501';
  end if;
  if not app.user_has_permission(v_tenant, 'mst.charge-master', 'modify') then
    raise exception 'Permission denied: mst.charge-master modify' using errcode = '42501';
  end if;

  -- Replace the dependency set transactionally.
  delete from public.charge_dependencies
  where tenant_id = v_tenant and charge_id = p_charge_id;

  if p_depends_on_ids is not null then
    insert into public.charge_dependencies (tenant_id, charge_id, depends_on_charge_id)
    select v_tenant, p_charge_id, d.id
    from (select distinct unnest(p_depends_on_ids) as id) d
    where d.id <> p_charge_id
      and exists (
        select 1 from public.charges c
        where c.id = d.id and c.tenant_id = v_tenant and c.deleted_at is null
      )
    on conflict (tenant_id, charge_id, depends_on_charge_id) do nothing;
    get diagnostics v_count = row_count;
  end if;

  -- Audit the dependency sync at the charge level (charge-master slug).
  perform app.write_audit_log(
    v_tenant, 'charges', 'MODIFY', p_charge_id, 'mst.charge-master', null,
    jsonb_build_object('dependencies', coalesce(p_depends_on_ids, array[]::uuid[])));

  return v_count;
end
$$;

comment on function public.save_charge_dependencies(uuid, uuid[]) is
  'Transactionally replace a charge''s M:N dependency set (charge_dependencies). Tenant + charge-master(modify) enforced; writes one charge-level audit entry.';

grant execute on function public.save_charge_dependencies(uuid, uuid[]) to authenticated, service_role;

-- ===========================================================================
-- EXTEND public.import_master (0016/0018) — geo + simple-catalog branches kept
-- verbatim; complex-catalog branches (charges, airlines) appended. Per-master
-- arms are self-contained. Public signature is UNCHANGED.
--
-- TODO(catalog-split): once the catalog slice is complete, split the per-master
-- CASE arms into helper functions — app.import_countries(), app.import_products(),
-- app.import_charges(), app.import_airlines(), … — and reduce this function to a
-- thin dispatcher. The public signature import_master(text,text,jsonb) must not
-- change; only the internals move.
-- ===========================================================================
create or replace function public.import_master(p_master text, p_mode text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant   uuid;
  v_slug     text;
  v_mode     text := upper(coalesce(p_mode, 'VALIDATE'));
  v_job      uuid;
  v_total    int := 0;
  v_ok       int := 0;     -- inserted (COMMIT) / would-insert (VALIDATE)
  v_skipped  int := 0;     -- duplicate natural key (ON CONFLICT DO NOTHING)
  v_errcnt   int := 0;
  v_errors   jsonb := '[]'::jsonb;
  v_row      jsonb;
  v_idx      int := 0;
  v_rc       int;
  v_col      text;
  v_msg      text;
  v_country  uuid; v_state uuid; v_zone uuid; v_dest uuid;
  v_branch   uuid; v_mbranch uuid; v_manbranch uuid;
  v_ptype    uuid;       -- product_type_id (catalog)
  v_prod     uuid;       -- product_id (airlines)
  v_exc      text;       -- normalized delivery_exception type
  -- Preloaded referenced-master maps (code -> id), built once before the loop.
  v_map_countries     jsonb := '{}'::jsonb;
  v_map_zones         jsonb := '{}'::jsonb;
  v_map_states        jsonb := '{}'::jsonb;
  v_map_destinations  jsonb := '{}'::jsonb;
  v_map_branches      jsonb := '{}'::jsonb;
  v_map_product_types jsonb := '{}'::jsonb;
  v_map_products      jsonb := '{}'::jsonb;
begin
  -- ---- master -> permission slug (also validates supported master) --------
  v_slug := case p_master
    -- geo (0015/0016)
    when 'countries'           then 'mst.country-master'
    when 'zones'               then 'mst.zone-master'
    when 'states'              then 'mst.state-master'
    when 'destinations'        then 'mst.destination-master'
    when 'pincodes'            then 'mst.pincode-master'
    when 'country_pincodes'    then 'mst.country-pincodes'
    when 'areas'               then 'mst.area-master'
    -- catalog simple (0018)
    when 'product_types'       then 'mst.product-type'
    when 'products'            then 'mst.product-master'
    when 'banks'               then 'mst.bank-master'
    when 'industries'          then 'mst.industry-master'
    when 'contents'            then 'mst.content-master'
    when 'instructions'        then 'mst.instruction-master'
    when 'sales_executives'    then 'mst.sales-executive-master'
    when 'flights'             then 'mst.flight-no-master'
    when 'delivery_exceptions' then 'mst.delivery-exception-master'
    -- catalog complex (0019)
    when 'charges'             then 'mst.charge-master'
    when 'airlines'            then 'mst.airlines'
    else null end;
  if v_slug is null then
    raise exception 'Unsupported master: %', p_master using errcode = '22023';
  end if;
  if v_mode not in ('VALIDATE','COMMIT') then
    raise exception 'Unsupported mode: % (expected VALIDATE or COMMIT)', p_mode using errcode = '22023';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'Too many rows (max 5000 per call); chunk the import' using errcode = '54000';
  end if;

  -- ---- tenant context (resolved from the authenticated user only) ---------
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  -- ---- permission: import requires ADD on the master ----------------------
  if not app.user_has_permission(v_tenant, v_slug, 'add') then
    raise exception 'Permission denied: % add', v_slug using errcode = '42501';
  end if;

  -- ---- COMMIT: open the job + suppress per-row audit (summary instead) -----
  if v_mode = 'COMMIT' then
    insert into public.import_jobs
      (tenant_id, import_type, master, mode, status, total_rows, requested_by)
    values
      (v_tenant, 'MASTER_CSV', p_master, 'COMMIT', 'RUNNING', jsonb_array_length(p_rows), auth.uid())
    returning id into v_job;
    perform set_config('app.suppress_row_audit', 'on', true);
  end if;

  -- ---- preload referenced masters ONCE (set-based; no per-row queries) ----
  case p_master
    when 'states' then
      v_map_zones := app.import_build_code_map(v_tenant, 'zones',
        app.import_distinct_codes(p_rows, array['zone_code']));
    when 'destinations' then
      v_map_countries := app.import_build_code_map(v_tenant, 'countries',
        app.import_distinct_codes(p_rows, array['country_code']));
      v_map_states := app.import_build_code_map(v_tenant, 'states',
        app.import_distinct_codes(p_rows, array['state_code']));
      v_map_zones := app.import_build_code_map(v_tenant, 'zones',
        app.import_distinct_codes(p_rows, array['zone_code']));
      v_map_branches := app.import_build_code_map(v_tenant, 'branches',
        app.import_distinct_codes(p_rows, array['main_branch_code','manifest_branch_code']));
    when 'pincodes' then
      v_map_branches := app.import_build_code_map(v_tenant, 'branches',
        app.import_distinct_codes(p_rows, array['branch_code']));
      v_map_destinations := app.import_build_code_map(v_tenant, 'destinations',
        app.import_distinct_codes(p_rows, array['destination_code']));
      v_map_zones := app.import_build_code_map(v_tenant, 'zones',
        app.import_distinct_codes(p_rows, array['zone_code']));
      v_map_states := app.import_build_code_map(v_tenant, 'states',
        app.import_distinct_codes(p_rows, array['state_code']));
    when 'country_pincodes' then
      v_map_countries := app.import_build_code_map(v_tenant, 'countries',
        app.import_distinct_codes(p_rows, array['country_code']));
    when 'areas' then
      v_map_branches := app.import_build_code_map(v_tenant, 'branches',
        app.import_distinct_codes(p_rows, array['branch_code']));
      v_map_destinations := app.import_build_code_map(v_tenant, 'destinations',
        app.import_distinct_codes(p_rows, array['destination_code']));
    when 'products' then
      v_map_product_types := app.import_build_code_map(v_tenant, 'product_types',
        app.import_distinct_codes(p_rows, array['product_type_code']));
    when 'airlines' then
      v_map_products := app.import_build_code_map(v_tenant, 'products',
        app.import_distinct_codes(p_rows, array['product_code']));
    else
      null;  -- countries / zones / flat catalogs / charges have no FK references
  end case;

  -- ---- per-row processing --------------------------------------------------
  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_idx := v_idx + 1;
    v_total := v_total + 1;
    v_col := null; v_msg := null;
    v_country := null; v_state := null; v_zone := null; v_dest := null;
    v_branch := null; v_mbranch := null; v_manbranch := null;
    v_ptype := null; v_prod := null; v_exc := null;

    begin
      -- ============ per-master validate + FK resolve + insert =============
      case p_master

      -- ------------------------------- GEO -------------------------------
      when 'countries' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        insert into public.countries (tenant_id, code, name, weight_unit, currency, isd_code)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'),
                app.norm_enum(v_row->>'weight_unit', array['KGS','LBS'], 'Weight unit', null),
                nullif(btrim(coalesce(v_row->>'currency','')),''),
                nullif(btrim(coalesce(v_row->>'isd_code','')),''))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      when 'zones' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        insert into public.zones (tenant_id, code, name)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      when 'states' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        v_col := 'zone_code'; v_zone := app.import_lookup(v_map_zones, v_row->>'zone_code', 'Zone code'); v_col := null;
        insert into public.states (tenant_id, code, name, zone_id, gst_alias, is_union_territory)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'), v_zone,
                nullif(btrim(coalesce(v_row->>'gst_alias','')),''),
                app.norm_bool(v_row->>'is_union_territory', false))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      when 'destinations' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        v_col := 'country_code';         v_country   := app.import_lookup(v_map_countries, v_row->>'country_code', 'Country code');
        v_col := 'state_code';           v_state     := app.import_lookup(v_map_states, v_row->>'state_code', 'State code');
        v_col := 'zone_code';            v_zone      := app.import_lookup(v_map_zones, v_row->>'zone_code', 'Zone code');
        v_col := 'main_branch_code';     v_mbranch   := app.import_lookup(v_map_branches, v_row->>'main_branch_code', 'Main branch code');
        v_col := 'manifest_branch_code'; v_manbranch := app.import_lookup(v_map_branches, v_row->>'manifest_branch_code', 'Manifest branch code');
        v_col := null;
        insert into public.destinations
          (tenant_id, dest_type, code, name, country_id, state_id, service_type, zone_id,
           main_branch_id, manifest_branch_id, email, mobile, status)
        values (v_tenant,
                app.norm_enum(v_row->>'dest_type', array['DOMESTIC','INTERNATIONAL','LOCAL'], 'Destination type', 'DOMESTIC'),
                btrim(v_row->>'code'), btrim(v_row->>'name'), v_country, v_state,
                app.norm_enum(v_row->>'service_type', array['REGULAR','METRO','REMOTE'], 'Service type', null),
                v_zone, v_mbranch, v_manbranch,
                nullif(btrim(coalesce(v_row->>'email','')),''),
                nullif(btrim(coalesce(v_row->>'mobile','')),''),
                app.norm_enum(v_row->>'status', array['ACTIVE','INACTIVE'], 'Status', 'ACTIVE'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      when 'pincodes' then
        if coalesce(btrim(v_row->>'pin_code'),'') = '' then v_col:='pin_code'; raise exception using errcode='CMS01', message='Pin code is required'; end if;
        v_col := 'branch_code';      v_branch := app.import_lookup(v_map_branches, v_row->>'branch_code', 'Branch code');
        v_col := 'destination_code'; v_dest   := app.import_lookup(v_map_destinations, v_row->>'destination_code', 'Destination code');
        v_col := 'zone_code';        v_zone   := app.import_lookup(v_map_zones, v_row->>'zone_code', 'Zone code');
        v_col := 'state_code';       v_state  := app.import_lookup(v_map_states, v_row->>'state_code', 'State code');
        v_col := null;
        insert into public.pincodes
          (tenant_id, pin_code, pin_name, branch_id, destination_id, zone_id, state_id,
           is_oda, is_serviceable, pickup_available, distance_km)
        values (v_tenant, btrim(v_row->>'pin_code'),
                nullif(btrim(coalesce(v_row->>'pin_name','')),''),
                v_branch, v_dest, v_zone, v_state,
                app.norm_bool(v_row->>'is_oda', false),
                app.norm_bool(v_row->>'is_serviceable', true),
                app.norm_bool(v_row->>'pickup_available', false),
                app.norm_numeric(v_row->>'distance_km'))
        on conflict (tenant_id, pin_code) where deleted_at is null do nothing;

      when 'country_pincodes' then
        v_col := 'country_code';
        v_country := app.import_lookup(v_map_countries, v_row->>'country_code', 'Country code');
        if v_country is null then raise exception using errcode='CMS01', message='Country code is required'; end if;
        v_col := 'pin_code';
        if coalesce(btrim(v_row->>'pin_code'),'') = '' then raise exception using errcode='CMS01', message='Pin code is required'; end if;
        v_col := null;
        insert into public.country_pincodes (tenant_id, country_id, pin_code, city_name, state_name)
        values (v_tenant, v_country, btrim(v_row->>'pin_code'),
                btrim(coalesce(v_row->>'city_name','')),
                nullif(btrim(coalesce(v_row->>'state_name','')),''))
        on conflict (tenant_id, country_id, pin_code, city_name) where deleted_at is null do nothing;

      when 'areas' then
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        v_col := 'branch_code';
        v_branch := app.import_lookup(v_map_branches, v_row->>'branch_code', 'Branch code');
        if v_branch is null then raise exception using errcode='CMS01', message='Branch code is required'; end if;
        v_col := 'destination_code'; v_dest := app.import_lookup(v_map_destinations, v_row->>'destination_code', 'Destination code'); v_col := null;
        insert into public.areas (tenant_id, branch_id, name, destination_id)
        values (v_tenant, v_branch, upper(btrim(v_row->>'name')), v_dest)
        on conflict (tenant_id, branch_id, name) where deleted_at is null do nothing;

      -- --------------------------- CATALOG (0018) ------------------------
      when 'product_types' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        insert into public.product_types (tenant_id, code, name)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      when 'products' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        v_col := 'product_type_code';
        v_ptype := app.import_lookup(v_map_product_types, v_row->>'product_type_code', 'Product type code');
        v_col := null;
        insert into public.products
          (tenant_id, code, name, product_type_id, service, fuel_charge, gst_reverse,
           shipment_type, status, group_type)
        values (v_tenant, btrim(v_row->>'code'),
                nullif(btrim(coalesce(v_row->>'name','')),''),
                v_ptype,
                nullif(btrim(coalesce(v_row->>'service','')),''),
                app.norm_bool(v_row->>'fuel_charge', false),
                app.norm_bool(v_row->>'gst_reverse', false),
                app.norm_enum(v_row->>'shipment_type', array['DOX','NDOX'], 'Shipment type', 'DOX'),
                app.norm_enum(v_row->>'status', array['ACTIVE','INACTIVE'], 'Status', 'ACTIVE'),
                app.norm_enum(v_row->>'group_type', array['AIR','SURFACE','TRAIN','ALL'], 'Group type', null))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      when 'banks' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        insert into public.banks (tenant_id, code, name, status)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'),
                app.norm_enum(v_row->>'status', array['ACTIVE','INACTIVE'], 'Status', 'ACTIVE'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      when 'industries' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        insert into public.industries (tenant_id, code, name)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      when 'contents' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        insert into public.contents (tenant_id, code, name)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      when 'instructions' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        insert into public.instructions (tenant_id, code, name)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      when 'sales_executives' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        v_col := 'commission';
        insert into public.sales_executives (tenant_id, code, name, commission)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'),
                coalesce(app.norm_numeric(v_row->>'commission'), 0));
        v_col := null;

      when 'flights' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        insert into public.flights (tenant_id, code, name, flight_type)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'),
                app.norm_enum(v_row->>'flight_type', array['PRIME','GCR'], 'Flight type', 'PRIME'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      when 'delivery_exceptions' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        v_exc := case upper(replace(btrim(coalesce(v_row->>'exc_type','')), '-', ''))
                   when 'DELIVERED' then 'DELIVERED' else 'UNDELIVERED' end;
        insert into public.delivery_exceptions (tenant_id, code, name, exc_type, inscan, show_on_mobile)
        values (v_tenant, upper(btrim(v_row->>'code')), btrim(v_row->>'name'), v_exc,
                app.norm_bool(v_row->>'inscan', false),
                app.norm_bool(v_row->>'show_on_mobile', false))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      -- --------------------------- CATALOG (0019) ------------------------
      -- TODO(catalog-split): move to app.import_charges(v_tenant, v_row).
      when 'charges' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        insert into public.charges
          (tenant_id, code, name, base_on, charge_type, charge_rate,
           apply_fuel, apply_tax_on_fuel, apply_tax, hsn_code, sequence)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'),
                coalesce(nullif(btrim(coalesce(v_row->>'base_on','')),''), 'Actual Weight'),
                app.norm_enum(v_row->>'charge_type',
                  array['AIRWAYBILL','EXPENSE','INCOME','OBC','PURCHASE'], 'Charge type', 'AIRWAYBILL'),
                coalesce(app.norm_numeric(v_row->>'charge_rate'), 0),
                app.norm_bool(v_row->>'apply_fuel', false),
                app.norm_bool(v_row->>'apply_tax_on_fuel', false),
                app.norm_bool(v_row->>'apply_tax', false),
                nullif(btrim(coalesce(v_row->>'hsn_code','')),''),
                coalesce(app.norm_numeric(v_row->>'sequence'), 0)::int)
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      -- TODO(catalog-split): move to app.import_airlines(v_tenant, v_row, v_map_products).
      when 'airlines' then
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        v_col := 'product_code';
        v_prod := app.import_lookup(v_map_products, v_row->>'product_code', 'Product code');
        if v_prod is null then raise exception using errcode='CMS01', message='Product code is required'; end if;
        v_col := null;
        insert into public.airlines (tenant_id, name, product_id)
        values (v_tenant, upper(btrim(v_row->>'name')), v_prod)
        on conflict (tenant_id, name) where deleted_at is null do nothing;

      end case;

      get diagnostics v_rc = row_count;

      -- VALIDATE: discard the write by raising an intentional rollback signal.
      if v_mode = 'VALIDATE' then
        raise exception using errcode = 'CMS00', message = 'dry-run';
      end if;

      -- COMMIT success: inserted (1) or duplicate-skipped (0).
      if v_rc = 1 then v_ok := v_ok + 1; else v_skipped := v_skipped + 1; end if;

    exception
      when sqlstate 'CMS00' then
        if v_rc = 1 then v_ok := v_ok + 1; else v_skipped := v_skipped + 1; end if;

      when sqlstate 'CMS01' then
        v_msg := SQLERRM;
        v_errcnt := v_errcnt + 1;
        v_errors := v_errors || jsonb_build_object('row_no', v_idx, 'column', v_col, 'message', v_msg);
        if v_mode = 'COMMIT' then
          insert into public.import_row_errors (tenant_id, job_id, row_no, column_name, message, raw)
          values (v_tenant, v_job, v_idx, v_col, v_msg, v_row);
        end if;

      when unique_violation or check_violation or foreign_key_violation
         or not_null_violation or invalid_text_representation then
        v_msg := SQLERRM;
        v_errcnt := v_errcnt + 1;
        v_errors := v_errors || jsonb_build_object('row_no', v_idx, 'column', v_col, 'message', v_msg);
        if v_mode = 'COMMIT' then
          insert into public.import_row_errors (tenant_id, job_id, row_no, column_name, message, raw)
          values (v_tenant, v_job, v_idx, v_col, v_msg, v_row);
        end if;
    end;
  end loop;

  -- ---- finalize ------------------------------------------------------------
  if v_mode = 'COMMIT' then
    update public.import_jobs
       set status = 'DONE', ok_rows = v_ok, skipped_rows = v_skipped, error_rows = v_errcnt
     where id = v_job;
    perform set_config('app.suppress_row_audit', 'off', true);
    perform app.write_audit_log(
      v_tenant, 'import_jobs', 'ADD', v_job, v_slug, null,
      jsonb_build_object('master', p_master, 'mode', 'COMMIT',
                         'total', v_total, 'ok', v_ok, 'skipped', v_skipped, 'errors', v_errcnt));
  end if;

  return jsonb_build_object(
    'master', p_master,
    'mode', v_mode,
    'job_id', v_job,
    'total', v_total,
    'ok', v_ok,
    'skipped', v_skipped,
    'error_count', v_errcnt,
    'errors', v_errors
  );
end
$$;

comment on function public.import_master(text, text, jsonb) is
  'Reusable master CSV import (geo + catalog incl. charges/airlines): VALIDATE (dry-run, no writes) or COMMIT (atomic; row errors -> import_row_errors, unexpected error -> full rollback).';

grant execute on function public.import_master(text, text, jsonb) to authenticated, service_role;

-- ===========================================================================
-- EXTEND public.lookup (0017/0018) — geo + simple-catalog keys kept verbatim;
-- complex-catalog keys appended. New keys: charge, airline. Signature UNCHANGED.
--
-- TODO(catalog-split): after the catalog slice is complete, replace this if/elsif
-- ladder with a dispatcher over per-key helper functions
-- (app.lookup_country(), app.lookup_product(), app.lookup_charge(), …). The
-- public signature lookup(text,text,integer) must not change.
-- ===========================================================================
create or replace function public.lookup(
  p_key   text,
  p_q     text default null,
  p_limit integer default 50
)
returns table (id uuid, code text, name text, hint text)
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_pat text := '%' ||
    replace(replace(coalesce(btrim(p_q), ''), '%', '\%'), '_', '\_') || '%';
begin
  if app.current_user_id() is null then
    return;
  end if;

  if p_key = 'country' then
    return query
      select c.id, c.code, c.name, c.currency
      from public.countries c
      where c.tenant_id in (select app.user_tenant_ids())
        and c.deleted_at is null
        and (c.name ilike v_pat or c.code ilike v_pat)
      order by c.name, c.code, c.id
      limit v_limit;

  elsif p_key = 'zone' then
    return query
      select z.id, z.code, z.name, null::text
      from public.zones z
      where z.tenant_id in (select app.user_tenant_ids())
        and z.deleted_at is null
        and (z.name ilike v_pat or z.code ilike v_pat)
      order by z.name, z.code, z.id
      limit v_limit;

  elsif p_key = 'state' then
    return query
      select s.id, s.code, s.name, s.gst_alias
      from public.states s
      where s.tenant_id in (select app.user_tenant_ids())
        and s.deleted_at is null
        and (s.name ilike v_pat or s.code ilike v_pat)
      order by s.name, s.code, s.id
      limit v_limit;

  elsif p_key = 'destination' then
    return query
      select d.id, d.code, d.name, d.dest_type
      from public.destinations d
      where d.tenant_id in (select app.user_tenant_ids())
        and d.deleted_at is null
        and d.status = 'ACTIVE'
        and (d.name ilike v_pat or d.code ilike v_pat)
      order by d.name, d.code, d.id
      limit v_limit;

  elsif p_key = 'pin-code' then
    return query
      select p.id,
             p.pin_code,
             coalesce(p.pin_name, p.pin_code),
             nullif(concat_ws(' · ',
               case when p.is_oda then 'ODA' end,
               case when not p.is_serviceable then 'Non-serviceable' end), '')
      from public.pincodes p
      where p.tenant_id in (select app.user_tenant_ids())
        and p.deleted_at is null
        and (p.pin_code ilike v_pat or p.pin_name ilike v_pat)
      order by p.pin_code, p.id
      limit v_limit;

  elsif p_key = 'country-pincode' then
    return query
      select cp.id,
             cp.pin_code,
             coalesce(nullif(cp.city_name, ''), cp.pin_code),
             cp.state_name
      from public.country_pincodes cp
      where cp.tenant_id in (select app.user_tenant_ids())
        and cp.deleted_at is null
        and (cp.pin_code ilike v_pat or cp.city_name ilike v_pat)
      order by cp.pin_code, cp.id
      limit v_limit;

  elsif p_key = 'area' then
    return query
      select a.id, a.name, a.name, null::text
      from public.areas a
      where a.tenant_id in (select app.user_tenant_ids())
        and a.deleted_at is null
        and a.name ilike v_pat
      order by a.name, a.id
      limit v_limit;

  -- --------------------------- CATALOG (0018) ------------------------
  elsif p_key = 'product-type' then
    return query
      select pt.id, pt.code, pt.name, null::text
      from public.product_types pt
      where pt.tenant_id in (select app.user_tenant_ids())
        and pt.deleted_at is null
        and (pt.name ilike v_pat or pt.code ilike v_pat)
      order by pt.name, pt.code, pt.id
      limit v_limit;

  elsif p_key = 'product' then
    return query
      select pr.id, pr.code, coalesce(nullif(pr.name, ''), pr.code), pr.shipment_type
      from public.products pr
      where pr.tenant_id in (select app.user_tenant_ids())
        and pr.deleted_at is null
        and pr.status = 'ACTIVE'
        and (pr.name ilike v_pat or pr.code ilike v_pat)
      order by pr.name, pr.code, pr.id
      limit v_limit;

  -- --------------------------- CATALOG (0019) ------------------------
  elsif p_key = 'charge' then
    return query
      select ch.id, ch.code, ch.name, ch.charge_type
      from public.charges ch
      where ch.tenant_id in (select app.user_tenant_ids())
        and ch.deleted_at is null
        and (ch.name ilike v_pat or ch.code ilike v_pat)
      order by ch.name, ch.code, ch.id
      limit v_limit;

  elsif p_key = 'airline' then
    return query
      select al.id, al.name, al.name, null::text
      from public.airlines al
      where al.tenant_id in (select app.user_tenant_ids())
        and al.deleted_at is null
        and al.name ilike v_pat
      order by al.name, al.id
      limit v_limit;

  else
    raise exception 'Unknown lookup key: %', p_key using errcode = '22023';
  end if;
end
$$;

comment on function public.lookup(text, text, integer) is
  'Shared tenant-safe autocomplete for master pickers. Keys: country, zone, state, destination, pin-code, country-pincode, area, product-type, product, charge, airline. Trigram ILIKE search, stable order, limit clamped to [1,200].';

grant execute on function public.lookup(text, text, integer) to authenticated, service_role;
