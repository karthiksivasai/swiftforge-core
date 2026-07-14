-- ===========================================================================
-- 0020  aggregate catalog masters (Phase 3 — Catalog Masters, Milestone 9B)
-- ---------------------------------------------------------------------------
-- The two largest catalog aggregates, built on the SAME frozen framework
-- (0014 master-core + 0015 conventions), plus the first ROOT+CHILD aggregate:
--
--   * service_centers        — operational location aggregate (a wide root:
--                              details, bank, invoice/voucher sequences) with a
--                              child collection of printable Terms lines.
--   * service_center_terms   — 1:N ordered child of service_centers. NOT a
--                              generic-CRUD table: it is synchronized together
--                              with its root in ONE transaction by a dedicated
--                              aggregate RPC (public.save_service_center) — the
--                              "Aggregate Save Pattern" (see docs/phase-3-setup).
--   * field_executives       — pickup/delivery field staff master with TWO FKs:
--                              service_center_id (composite, RESTRICT) and
--                              destination_id (composite, SET NULL).
--
-- Every master keeps the global contract: id + tenant_id + audit cols +
-- deleted_at + row_version, UNIQUE (tenant_id, id) (composite-FK target),
-- partial UNIQUE natural key, tenant-leading + trigram indexes,
-- app.attach_master_triggers (touch + audit), and RLS (tenant SELECT; writes
-- gated by app.user_has_permission on the per-master slug).
--
-- Permission slugs are the DEDICATED catalog modules (0010 + rename in 0021):
-- service_centers maps to `mst.service-center-master` and field_executives maps
-- to `mst.field-executive-master`. Both slugs are seeded by 0010; 0021 renames
-- any pre-existing borrowed modules and backfills TENANT_ADMIN / OPERATIONS.
--
-- Import + lookup are EXTENDED (not redesigned): public.import_master and
-- public.lookup are re-created with ALL prior branches kept verbatim and the new
-- service_centers/field_executives branches (import) and service-center/
-- field-executive keys (lookup) appended. Each per-master arm stays
-- self-contained so the engines can later be split into dispatcher + per-master
-- helpers WITHOUT any public-API change — see the TODO markers below.
--
-- Idempotent: create-if-not-exists / guarded constraints / drop-then-create
-- policies / create-or-replace functions.
-- ===========================================================================

-- ===========================================================================
-- service_centers  (operational location aggregate — root)
-- ---------------------------------------------------------------------------
-- Wide root: identity + address + statutory ids (details), bank details, and
-- last invoice/voucher sequence config all live here (1:1 scalar config, not
-- collections — deliberately NOT over-normalized). `branch`/`destination`/
-- `state` are stored as text, faithful to the demo's branch-picker UX. The only
-- true child collection is service_center_terms (below).
-- ===========================================================================
create table if not exists public.service_centers (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  code          text not null,
  name          text not null,
  sub_name      text,
  -- address + location
  address1      text,
  address2      text,
  address3      text,
  address4      text,
  destination   text,
  branch        text,
  state         text,
  state_code    text,
  pin_code      text,
  -- contact + statutory
  telephone     text,
  email         text,
  gst_no        text,
  gst_telephone text,
  pan_no        text,
  icn_no        text,
  st_no         text,
  -- bank details
  bank_name     text,
  account_no    text,
  account_name  text,
  bank_address  text,
  rtgs_ifsc     text,
  micr          text,
  -- last invoice / voucher sequences
  last_invoice_prefix         text,
  last_invoice_no             text,
  last_invoice_suffix         text,
  free_form_prefix            text,
  last_free_form_invoice_no   text,
  free_form_suffix            text,
  debit_note_prefix           text,
  debit_note_last_invoice_no  text,
  debit_note_suffix           text,
  credit_note_prefix          text,
  credit_note_last_invoice_no text,
  credit_note_suffix          text,
  rcp_last_no                 text,
  -- global contract
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  deleted_at    timestamptz,
  row_version   integer not null default 1,
  constraint service_centers_tenant_id_uq unique (tenant_id, id)
);
create unique index if not exists service_centers_tenant_code_uq
  on public.service_centers (tenant_id, code) where deleted_at is null;
create index if not exists service_centers_tenant_idx on public.service_centers (tenant_id);
create index if not exists service_centers_name_trgm
  on public.service_centers using gin (name gin_trgm_ops);
create index if not exists service_centers_code_trgm
  on public.service_centers using gin (code gin_trgm_ops);

-- ===========================================================================
-- service_center_terms  (1:N ordered child collection of service_centers)
-- ---------------------------------------------------------------------------
-- Deliberately NOT a full master: no row_version / audit triggers. It is
-- synchronized transactionally WITH its root by public.save_service_center
-- (below) and audited at the service-center level. The composite FK pins the
-- child to the same tenant as the root and cascades on hard delete.
-- ===========================================================================
create table if not exists public.service_center_terms (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  service_center_id uuid not null,
  seq               integer not null,
  text              text not null,
  created_at        timestamptz not null default now(),
  created_by        uuid default auth.uid(),
  constraint service_center_terms_sc_fk foreign key (tenant_id, service_center_id)
    references public.service_centers (tenant_id, id) on delete cascade,
  constraint service_center_terms_uq unique (tenant_id, service_center_id, seq)
);
create index if not exists service_center_terms_sc_idx
  on public.service_center_terms (tenant_id, service_center_id);

-- ===========================================================================
-- field_executives  (pickup/delivery field staff; two composite FKs)
-- ===========================================================================
create table if not exists public.field_executives (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  code              text not null,
  name              text not null,
  mobile            text,
  pickup_charge     numeric(12,2) not null default 0 check (pickup_charge >= 0),
  delivery_charge   numeric(12,2) not null default 0 check (delivery_charge >= 0),
  service_center_id uuid not null,
  destination_id    uuid,
  tld_batch_no      text,
  in_active         boolean not null default false,
  created_at        timestamptz not null default now(),
  created_by        uuid,
  updated_at        timestamptz not null default now(),
  updated_by        uuid,
  deleted_at        timestamptz,
  row_version       integer not null default 1,
  constraint field_executives_tenant_id_uq unique (tenant_id, id),
  constraint field_executives_sc_fk foreign key (tenant_id, service_center_id)
    references public.service_centers (tenant_id, id) on delete restrict,
  constraint field_executives_dest_fk foreign key (tenant_id, destination_id)
    references public.destinations (tenant_id, id) on delete set null
);
create unique index if not exists field_executives_tenant_code_uq
  on public.field_executives (tenant_id, code) where deleted_at is null;
create index if not exists field_executives_tenant_idx on public.field_executives (tenant_id);
create index if not exists field_executives_tenant_sc_idx
  on public.field_executives (tenant_id, service_center_id);
create index if not exists field_executives_tenant_dest_idx
  on public.field_executives (tenant_id, destination_id);
create index if not exists field_executives_name_trgm
  on public.field_executives using gin (name gin_trgm_ops);
create index if not exists field_executives_code_trgm
  on public.field_executives using gin (code gin_trgm_ops);

-- ===========================================================================
-- touch + audit triggers (one call per master, from the 0014 framework).
-- Note: service_center_terms is intentionally NOT attached (aggregate child).
-- ===========================================================================
select app.attach_master_triggers('service_centers',  'mst.service-center-master');
select app.attach_master_triggers('field_executives', 'mst.field-executive-master');

-- ===========================================================================
-- Row Level Security — tenant read; permission-gated writes (per-master slug).
-- Identical policy shape to the geo/catalog slices. service_center_terms gets
-- its own policy set (gated by the service-center-master slug) so direct reads are
-- tenant scoped and any direct write still requires service-center-master permission.
-- ===========================================================================
do $$
declare r record;
begin
  for r in (
    select * from (values
      ('service_centers',  'mst.service-center-master'),
      ('field_executives', 'mst.field-executive-master')
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

-- service_center_terms RLS (service-center-master gated; modify covers term writes).
alter table public.service_center_terms enable row level security;

drop policy if exists service_center_terms_select on public.service_center_terms;
create policy service_center_terms_select on public.service_center_terms
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());

drop policy if exists service_center_terms_insert on public.service_center_terms;
create policy service_center_terms_insert on public.service_center_terms
  for insert with check (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'mst.service-center-master', 'modify'));

drop policy if exists service_center_terms_delete on public.service_center_terms;
create policy service_center_terms_delete on public.service_center_terms
  for delete using (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'mst.service-center-master', 'modify'));

-- ===========================================================================
-- public.save_service_center — dedicated transactional AGGREGATE save.
-- ---------------------------------------------------------------------------
-- The Aggregate Save Pattern (the reference implementation for future Customer /
-- Vendor / Service Mapping aggregates): ONE SECURITY DEFINER transaction that
--   1. upserts the aggregate ROOT (service_centers) with an explicit
--      optimistic-lock check on update (row_version), and
--   2. synchronizes the CHILD collection (service_center_terms) with replace
--      semantics (delete-then-insert, ordered by array position, blanks skipped)
-- returning the persisted root row. Tenant + service-center-master permission are
-- checked explicitly (add on insert, modify on update). The root's touch+audit
-- triggers bump row_version and write the root audit entry; a single
-- service-center-level audit entry records the terms sync. Keeping this OUT of
-- generic CRUD keeps the generic framework generic.
--
-- p_fields : jsonb object of root columns (only whitelisted keys are used).
-- p_terms  : jsonb array of strings (printable Terms lines, in display order).
-- ===========================================================================
create or replace function public.save_service_center(
  p_id          uuid,
  p_row_version integer,
  p_fields      jsonb,
  p_terms       jsonb
)
returns public.service_centers
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_sc     public.service_centers;
begin
  -- ---- tenant context (resolved from the authenticated user only) ---------
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'p_fields must be a JSON object' using errcode = '22023';
  end if;
  if coalesce(btrim(p_fields->>'code'), '') = '' then
    raise exception 'Code is required' using errcode = '22023';
  end if;
  if coalesce(btrim(p_fields->>'name'), '') = '' then
    raise exception 'Name is required' using errcode = '22023';
  end if;

  if p_id is null then
    -- ------------------------------ INSERT ---------------------------------
    if not app.user_has_permission(v_tenant, 'mst.service-center-master', 'add') then
      raise exception 'Permission denied: mst.service-center-master add' using errcode = '42501';
    end if;
    insert into public.service_centers (
      tenant_id, code, name, sub_name,
      address1, address2, address3, address4, destination, branch, state, state_code, pin_code,
      telephone, email, gst_no, gst_telephone, pan_no, icn_no, st_no,
      bank_name, account_no, account_name, bank_address, rtgs_ifsc, micr,
      last_invoice_prefix, last_invoice_no, last_invoice_suffix,
      free_form_prefix, last_free_form_invoice_no, free_form_suffix,
      debit_note_prefix, debit_note_last_invoice_no, debit_note_suffix,
      credit_note_prefix, credit_note_last_invoice_no, credit_note_suffix, rcp_last_no)
    values (
      v_tenant, btrim(p_fields->>'code'), btrim(p_fields->>'name'),
      nullif(btrim(coalesce(p_fields->>'sub_name','')),''),
      nullif(btrim(coalesce(p_fields->>'address1','')),''),
      nullif(btrim(coalesce(p_fields->>'address2','')),''),
      nullif(btrim(coalesce(p_fields->>'address3','')),''),
      nullif(btrim(coalesce(p_fields->>'address4','')),''),
      nullif(btrim(coalesce(p_fields->>'destination','')),''),
      nullif(btrim(coalesce(p_fields->>'branch','')),''),
      nullif(btrim(coalesce(p_fields->>'state','')),''),
      nullif(btrim(coalesce(p_fields->>'state_code','')),''),
      nullif(btrim(coalesce(p_fields->>'pin_code','')),''),
      nullif(btrim(coalesce(p_fields->>'telephone','')),''),
      nullif(btrim(coalesce(p_fields->>'email','')),''),
      nullif(btrim(coalesce(p_fields->>'gst_no','')),''),
      nullif(btrim(coalesce(p_fields->>'gst_telephone','')),''),
      nullif(btrim(coalesce(p_fields->>'pan_no','')),''),
      nullif(btrim(coalesce(p_fields->>'icn_no','')),''),
      nullif(btrim(coalesce(p_fields->>'st_no','')),''),
      nullif(btrim(coalesce(p_fields->>'bank_name','')),''),
      nullif(btrim(coalesce(p_fields->>'account_no','')),''),
      nullif(btrim(coalesce(p_fields->>'account_name','')),''),
      nullif(btrim(coalesce(p_fields->>'bank_address','')),''),
      nullif(btrim(coalesce(p_fields->>'rtgs_ifsc','')),''),
      nullif(btrim(coalesce(p_fields->>'micr','')),''),
      nullif(btrim(coalesce(p_fields->>'last_invoice_prefix','')),''),
      nullif(btrim(coalesce(p_fields->>'last_invoice_no','')),''),
      nullif(btrim(coalesce(p_fields->>'last_invoice_suffix','')),''),
      nullif(btrim(coalesce(p_fields->>'free_form_prefix','')),''),
      nullif(btrim(coalesce(p_fields->>'last_free_form_invoice_no','')),''),
      nullif(btrim(coalesce(p_fields->>'free_form_suffix','')),''),
      nullif(btrim(coalesce(p_fields->>'debit_note_prefix','')),''),
      nullif(btrim(coalesce(p_fields->>'debit_note_last_invoice_no','')),''),
      nullif(btrim(coalesce(p_fields->>'debit_note_suffix','')),''),
      nullif(btrim(coalesce(p_fields->>'credit_note_prefix','')),''),
      nullif(btrim(coalesce(p_fields->>'credit_note_last_invoice_no','')),''),
      nullif(btrim(coalesce(p_fields->>'credit_note_suffix','')),''),
      nullif(btrim(coalesce(p_fields->>'rcp_last_no','')),''))
    returning * into v_sc;
  else
    -- ------------------------------ UPDATE ---------------------------------
    if not app.user_has_permission(v_tenant, 'mst.service-center-master', 'modify') then
      raise exception 'Permission denied: mst.service-center-master modify' using errcode = '42501';
    end if;
    update public.service_centers set
      code          = btrim(p_fields->>'code'),
      name          = btrim(p_fields->>'name'),
      sub_name      = nullif(btrim(coalesce(p_fields->>'sub_name','')),''),
      address1      = nullif(btrim(coalesce(p_fields->>'address1','')),''),
      address2      = nullif(btrim(coalesce(p_fields->>'address2','')),''),
      address3      = nullif(btrim(coalesce(p_fields->>'address3','')),''),
      address4      = nullif(btrim(coalesce(p_fields->>'address4','')),''),
      destination   = nullif(btrim(coalesce(p_fields->>'destination','')),''),
      branch        = nullif(btrim(coalesce(p_fields->>'branch','')),''),
      state         = nullif(btrim(coalesce(p_fields->>'state','')),''),
      state_code    = nullif(btrim(coalesce(p_fields->>'state_code','')),''),
      pin_code      = nullif(btrim(coalesce(p_fields->>'pin_code','')),''),
      telephone     = nullif(btrim(coalesce(p_fields->>'telephone','')),''),
      email         = nullif(btrim(coalesce(p_fields->>'email','')),''),
      gst_no        = nullif(btrim(coalesce(p_fields->>'gst_no','')),''),
      gst_telephone = nullif(btrim(coalesce(p_fields->>'gst_telephone','')),''),
      pan_no        = nullif(btrim(coalesce(p_fields->>'pan_no','')),''),
      icn_no        = nullif(btrim(coalesce(p_fields->>'icn_no','')),''),
      st_no         = nullif(btrim(coalesce(p_fields->>'st_no','')),''),
      bank_name     = nullif(btrim(coalesce(p_fields->>'bank_name','')),''),
      account_no    = nullif(btrim(coalesce(p_fields->>'account_no','')),''),
      account_name  = nullif(btrim(coalesce(p_fields->>'account_name','')),''),
      bank_address  = nullif(btrim(coalesce(p_fields->>'bank_address','')),''),
      rtgs_ifsc     = nullif(btrim(coalesce(p_fields->>'rtgs_ifsc','')),''),
      micr          = nullif(btrim(coalesce(p_fields->>'micr','')),''),
      last_invoice_prefix         = nullif(btrim(coalesce(p_fields->>'last_invoice_prefix','')),''),
      last_invoice_no             = nullif(btrim(coalesce(p_fields->>'last_invoice_no','')),''),
      last_invoice_suffix         = nullif(btrim(coalesce(p_fields->>'last_invoice_suffix','')),''),
      free_form_prefix            = nullif(btrim(coalesce(p_fields->>'free_form_prefix','')),''),
      last_free_form_invoice_no   = nullif(btrim(coalesce(p_fields->>'last_free_form_invoice_no','')),''),
      free_form_suffix            = nullif(btrim(coalesce(p_fields->>'free_form_suffix','')),''),
      debit_note_prefix           = nullif(btrim(coalesce(p_fields->>'debit_note_prefix','')),''),
      debit_note_last_invoice_no  = nullif(btrim(coalesce(p_fields->>'debit_note_last_invoice_no','')),''),
      debit_note_suffix           = nullif(btrim(coalesce(p_fields->>'debit_note_suffix','')),''),
      credit_note_prefix          = nullif(btrim(coalesce(p_fields->>'credit_note_prefix','')),''),
      credit_note_last_invoice_no = nullif(btrim(coalesce(p_fields->>'credit_note_last_invoice_no','')),''),
      credit_note_suffix          = nullif(btrim(coalesce(p_fields->>'credit_note_suffix','')),''),
      rcp_last_no                 = nullif(btrim(coalesce(p_fields->>'rcp_last_no','')),'')
    where id = p_id
      and tenant_id = v_tenant
      and deleted_at is null
      and row_version = p_row_version
    returning * into v_sc;

    if not found then
      raise exception 'This record was changed by someone else. Reload and try again.'
        using errcode = '40001';
    end if;
  end if;

  -- ---- synchronize the child collection (replace semantics) ---------------
  delete from public.service_center_terms
  where tenant_id = v_tenant and service_center_id = v_sc.id;

  if p_terms is not null and jsonb_typeof(p_terms) = 'array' then
    insert into public.service_center_terms (tenant_id, service_center_id, seq, text)
    select v_tenant, v_sc.id, t.ord, btrim(t.val)
    from jsonb_array_elements_text(p_terms) with ordinality as t(val, ord)
    where coalesce(btrim(t.val), '') <> '';
  end if;

  -- ---- audit the aggregate (root has its own trigger audit) ---------------
  perform app.write_audit_log(
    v_tenant, 'service_centers',
    case when p_id is null then 'ADD' else 'MODIFY' end,
    v_sc.id, 'mst.service-center-master', null,
    jsonb_build_object('terms', coalesce(p_terms, '[]'::jsonb)));

  return v_sc;
end
$$;

comment on function public.save_service_center(uuid, integer, jsonb, jsonb) is
  'Aggregate Save Pattern: upsert a service_centers root (optimistic-locked on update) and replace its service_center_terms child collection in ONE transaction. Tenant + service-center-master (add/modify) enforced; writes one service-center-level audit entry.';

grant execute on function public.save_service_center(uuid, integer, jsonb, jsonb) to authenticated, service_role;

-- ===========================================================================
-- EXTEND public.import_master (0016/0018/0019) — geo + simple/complex catalog
-- branches kept verbatim; aggregate branches (service_centers,
-- field_executives) appended. Per-master arms are self-contained. Public
-- signature is UNCHANGED.
--
-- TODO(catalog-split): once the catalog slice is complete, split the per-master
-- CASE arms into helper functions — app.import_countries(), app.import_products(),
-- app.import_charges(), app.import_service_centers(), app.import_field_executives(),
-- … — and reduce this function to a thin dispatcher. The public signature
-- import_master(text,text,jsonb) must not change; only the internals move.
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
  v_sc       uuid;       -- service_center_id (field_executives)
  -- Preloaded referenced-master maps (code -> id), built once before the loop.
  v_map_countries       jsonb := '{}'::jsonb;
  v_map_zones           jsonb := '{}'::jsonb;
  v_map_states          jsonb := '{}'::jsonb;
  v_map_destinations    jsonb := '{}'::jsonb;
  v_map_branches        jsonb := '{}'::jsonb;
  v_map_product_types   jsonb := '{}'::jsonb;
  v_map_products        jsonb := '{}'::jsonb;
  v_map_service_centers jsonb := '{}'::jsonb;
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
    -- catalog aggregate (0020)
    when 'service_centers'     then 'mst.service-center-master'
    when 'field_executives'    then 'mst.field-executive-master'
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
    when 'field_executives' then
      v_map_service_centers := app.import_build_code_map(v_tenant, 'service_centers',
        app.import_distinct_codes(p_rows, array['service_center_code']));
      v_map_destinations := app.import_build_code_map(v_tenant, 'destinations',
        app.import_distinct_codes(p_rows, array['destination_code']));
    else
      null;  -- countries / zones / flat catalogs / charges / service_centers have no FK references
  end case;

  -- ---- per-row processing --------------------------------------------------
  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_idx := v_idx + 1;
    v_total := v_total + 1;
    v_col := null; v_msg := null;
    v_country := null; v_state := null; v_zone := null; v_dest := null;
    v_branch := null; v_mbranch := null; v_manbranch := null;
    v_ptype := null; v_prod := null; v_exc := null; v_sc := null;

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

      -- --------------------------- CATALOG (0020) ------------------------
      -- TODO(catalog-split): move to app.import_service_centers(v_tenant, v_row).
      -- Aggregate ROOT only — Terms (the child collection) are managed through
      -- public.save_service_center, not bulk import (like charge dependencies).
      when 'service_centers' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        insert into public.service_centers
          (tenant_id, code, name, sub_name, branch, destination, state, state_code,
           pin_code, telephone, email, gst_no)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'),
                nullif(btrim(coalesce(v_row->>'sub_name','')),''),
                nullif(btrim(coalesce(v_row->>'branch','')),''),
                nullif(btrim(coalesce(v_row->>'destination','')),''),
                nullif(btrim(coalesce(v_row->>'state','')),''),
                nullif(btrim(coalesce(v_row->>'state_code','')),''),
                nullif(btrim(coalesce(v_row->>'pin_code','')),''),
                nullif(btrim(coalesce(v_row->>'telephone','')),''),
                nullif(btrim(coalesce(v_row->>'email','')),''),
                nullif(btrim(coalesce(v_row->>'gst_no','')),''))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      -- TODO(catalog-split): move to app.import_field_executives(v_tenant, v_row, v_map_service_centers, v_map_destinations).
      when 'field_executives' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        v_col := 'service_center_code';
        v_sc := app.import_lookup(v_map_service_centers, v_row->>'service_center_code', 'Service center code');
        if v_sc is null then raise exception using errcode='CMS01', message='Service center code is required'; end if;
        v_col := 'destination_code';
        v_dest := app.import_lookup(v_map_destinations, v_row->>'destination_code', 'Destination code');
        v_col := null;
        insert into public.field_executives
          (tenant_id, code, name, mobile, pickup_charge, delivery_charge,
           service_center_id, destination_id, tld_batch_no, in_active)
        values (v_tenant, upper(btrim(v_row->>'code')), btrim(v_row->>'name'),
                nullif(btrim(coalesce(v_row->>'mobile','')),''),
                coalesce(app.norm_numeric(v_row->>'pickup_charge'), 0),
                coalesce(app.norm_numeric(v_row->>'delivery_charge'), 0),
                v_sc, v_dest,
                nullif(btrim(coalesce(v_row->>'tld_batch_no','')),''),
                app.norm_bool(v_row->>'in_active', false))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

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
  'Reusable master CSV import (geo + catalog incl. charges/airlines/service_centers/field_executives): VALIDATE (dry-run, no writes) or COMMIT (atomic; row errors -> import_row_errors, unexpected error -> full rollback).';

grant execute on function public.import_master(text, text, jsonb) to authenticated, service_role;

-- ===========================================================================
-- EXTEND public.lookup (0017/0018/0019) — geo + catalog keys kept verbatim;
-- aggregate keys appended. New keys: service-center, field-executive. Signature
-- UNCHANGED.
--
-- TODO(catalog-split): after the catalog slice is complete, replace this if/elsif
-- ladder with a dispatcher over per-key helper functions
-- (app.lookup_country(), app.lookup_product(), app.lookup_service_center(), …).
-- The public signature lookup(text,text,integer) must not change.
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

  -- --------------------------- CATALOG (0020) ------------------------
  elsif p_key = 'service-center' then
    return query
      select sc.id, sc.code, sc.name, sc.branch
      from public.service_centers sc
      where sc.tenant_id in (select app.user_tenant_ids())
        and sc.deleted_at is null
        and (sc.name ilike v_pat or sc.code ilike v_pat)
      order by sc.name, sc.code, sc.id
      limit v_limit;

  elsif p_key = 'field-executive' then
    return query
      select fe.id, fe.code, fe.name, fe.mobile
      from public.field_executives fe
      where fe.tenant_id in (select app.user_tenant_ids())
        and fe.deleted_at is null
        and fe.in_active = false
        and (fe.name ilike v_pat or fe.code ilike v_pat)
      order by fe.name, fe.code, fe.id
      limit v_limit;

  else
    raise exception 'Unknown lookup key: %', p_key using errcode = '22023';
  end if;
end
$$;

comment on function public.lookup(text, text, integer) is
  'Shared tenant-safe autocomplete for master pickers. Keys: country, zone, state, destination, pin-code, country-pincode, area, product-type, product, charge, airline, service-center, field-executive. Trigram ILIKE search, stable order, limit clamped to [1,200].';

grant execute on function public.lookup(text, text, integer) to authenticated, service_role;
