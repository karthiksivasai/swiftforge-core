-- ===========================================================================
-- 0016  reusable CSV import pipeline for master data (Phase 3, blueprint §2.10)
-- ---------------------------------------------------------------------------
-- Tables:  import_jobs, import_row_errors
-- RPC:     public.import_master(p_master text, p_mode text, p_rows jsonb)
--
-- Transactional contract (per the milestone requirement):
--   * The RPC runs inside the caller's single transaction.
--   * VALIDATE  -> dry run: every row is attempted in a per-row subtransaction
--                 that is ALWAYS rolled back. Nothing is persisted (no job, no
--                 rows, no row_errors). Errors are returned in the result only.
--   * COMMIT    -> valid rows are inserted; EXPECTED per-row problems (missing
--                 field, bad enum, unresolved FK code, constraint violation) are
--                 collected into import_row_errors and the row is skipped.
--                 An UNEXPECTED (system) error is re-raised, aborting the whole
--                 transaction => no partial import. The client then records the
--                 job as FAILED (single-tx Postgres cannot persist a FAILED row
--                 while also rolling the batch back).
--
-- Per-row audit is suppressed during COMMIT (app.suppress_row_audit) and ONE
-- summary audit_logs entry is written for the job (0014 framework).
--
-- Idempotent: create-if-not-exists / create-or-replace; ON CONFLICT DO NOTHING
-- on natural keys makes re-import safe (duplicates counted as skipped).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- import_jobs — one row per COMMIT run (VALIDATE never writes one).
-- ---------------------------------------------------------------------------
create table if not exists public.import_jobs (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  import_type  text not null default 'MASTER_CSV'
                 check (import_type in ('AWB_MERGE','POD_MERGE','FORWARDING_MERGE','AWB_STOCK',
                        'OTHER_CHARGES','DATA_UPDATE','RATE_IMPORT','ZONE_IMPORT','MASTER_CSV')),
  master       text,
  mode         text not null default 'COMMIT' check (mode in ('VALIDATE','COMMIT','UPSERT')),
  format       text,
  params       jsonb not null default '{}'::jsonb,
  file_id      uuid references public.files(id),
  status       text not null default 'QUEUED'
                 check (status in ('QUEUED','RUNNING','DONE','FAILED')),
  total_rows   integer not null default 0,
  ok_rows      integer not null default 0,
  skipped_rows integer not null default 0,
  error_rows   integer not null default 0,
  error        text,
  requested_by uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  row_version  integer not null default 1
);
create index if not exists import_jobs_tenant_created_idx
  on public.import_jobs (tenant_id, created_at desc);

drop trigger if exists trg_touch_import_jobs on public.import_jobs;
create trigger trg_touch_import_jobs before insert or update on public.import_jobs
  for each row execute function app.tg_touch_row();

-- ---------------------------------------------------------------------------
-- import_row_errors — per-row failures for a COMMIT job (cascade with job).
-- ---------------------------------------------------------------------------
create table if not exists public.import_row_errors (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  job_id      uuid not null references public.import_jobs(id) on delete cascade,
  row_no      integer not null,
  column_name text,
  message     text not null,
  raw         jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists import_row_errors_job_idx
  on public.import_row_errors (job_id, row_no);

-- ---------------------------------------------------------------------------
-- RLS — tenant members read; all writes go through the definer RPC (owner
-- bypasses RLS), so no write policies are exposed to normal users.
-- ---------------------------------------------------------------------------
alter table public.import_jobs       enable row level security;
alter table public.import_row_errors enable row level security;

drop policy if exists import_jobs_select on public.import_jobs;
create policy import_jobs_select on public.import_jobs
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());

drop policy if exists import_row_errors_select on public.import_row_errors;
create policy import_row_errors_select on public.import_row_errors
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());

-- ===========================================================================
-- Small parsing/normalization helpers (raise CMS01 on bad input = row error).
-- Custom SQLSTATE 'CMS01' = expected per-row validation error.
-- ===========================================================================
create or replace function app.norm_bool(p text, p_default boolean)
returns boolean language plpgsql immutable as $$
declare v text := lower(nullif(btrim(coalesce(p,'')),''));
begin
  if v is null then return p_default; end if;
  if v in ('true','t','1','yes','y') then return true; end if;
  if v in ('false','f','0','no','n') then return false; end if;
  raise exception using errcode = 'CMS01', message = format('"%s" is not a valid boolean', p);
end $$;

create or replace function app.norm_numeric(p text)
returns numeric language plpgsql immutable as $$
declare v text := nullif(btrim(coalesce(p,'')),'');
begin
  if v is null then return null; end if;
  begin
    return v::numeric;
  exception when others then
    raise exception using errcode = 'CMS01', message = format('"%s" is not a valid number', p);
  end;
end $$;

create or replace function app.norm_enum(p text, p_allowed text[], p_label text, p_default text)
returns text language plpgsql immutable as $$
declare v text := upper(nullif(btrim(coalesce(p,'')),''));
begin
  if v is null then return p_default; end if;
  v := replace(v, 'IN-ACTIVE', 'INACTIVE');   -- UI label alias for status
  if v = any(p_allowed) then return v; end if;
  raise exception using errcode = 'CMS01', message = format('%s "%s" is not valid', p_label, p);
end $$;

-- ---------------------------------------------------------------------------
-- Set-based FK resolution (avoids N+1). Referenced masters are preloaded ONCE
-- per table into an in-memory code->id map; the row loop does O(1) lookups.
-- ---------------------------------------------------------------------------

-- Distinct, trimmed, non-blank codes referenced by p_rows across p_keys.
create or replace function app.import_distinct_codes(p_rows jsonb, p_keys text[])
returns text[] language sql immutable as $$
  select coalesce(array_agg(distinct s.code), array[]::text[])
  from (
    select btrim(r.val ->> k) as code
    from jsonb_array_elements(p_rows) as r(val)
    cross join unnest(p_keys) as k
  ) s
  where nullif(s.code, '') is not null;
$$;

-- Load a referenced master's (code -> id) map for exactly the given codes,
-- once. Tenant-isolated + live rows only (matches per-row resolution exactly).
create or replace function app.import_build_code_map(p_tenant uuid, p_table text, p_codes text[])
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare v_map jsonb;
begin
  if p_codes is null or array_length(p_codes, 1) is null then
    return '{}'::jsonb;
  end if;
  execute format(
    'select coalesce(jsonb_object_agg(code, id), ''{}''::jsonb)
       from public.%I
      where tenant_id = $1 and deleted_at is null and code = any($2)',
    p_table)
  into v_map using p_tenant, p_codes;
  return v_map;
end $$;

-- O(1) lookup against a preloaded map. Blank => null.
-- Provided-but-unresolved => CMS01 (identical message/behavior to before).
create or replace function app.import_lookup(p_map jsonb, p_code text, p_label text)
returns uuid language plpgsql immutable as $$
declare v_code text := nullif(btrim(coalesce(p_code,'')),''); v_id text;
begin
  if v_code is null then return null; end if;
  v_id := p_map ->> v_code;
  if v_id is null then
    raise exception using errcode = 'CMS01', message = format('%s "%s" not found', p_label, v_code);
  end if;
  return v_id::uuid;
end $$;

-- ===========================================================================
-- public.import_master — the reusable import engine.
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
  -- Preloaded referenced-master maps (code -> id), built once before the loop.
  v_map_countries    jsonb := '{}'::jsonb;
  v_map_zones        jsonb := '{}'::jsonb;
  v_map_states       jsonb := '{}'::jsonb;
  v_map_destinations jsonb := '{}'::jsonb;
  v_map_branches     jsonb := '{}'::jsonb;
begin
  -- ---- master -> permission slug (also validates supported master) --------
  v_slug := case p_master
    when 'countries'        then 'mst.country-master'
    when 'zones'            then 'mst.zone-master'
    when 'states'           then 'mst.state-master'
    when 'destinations'     then 'mst.destination-master'
    when 'pincodes'         then 'mst.pincode-master'
    when 'country_pincodes' then 'mst.country-pincodes'
    when 'areas'            then 'mst.area-master'
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
  -- One query per referenced table for the DISTINCT codes present in p_rows.
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
    else
      null;  -- countries / zones have no FK references
  end case;

  -- ---- per-row processing --------------------------------------------------
  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_idx := v_idx + 1;
    v_total := v_total + 1;
    v_col := null; v_msg := null;
    v_country := null; v_state := null; v_zone := null; v_dest := null;
    v_branch := null; v_mbranch := null; v_manbranch := null;

    begin
      -- ============ per-master validate + FK resolve + insert =============
      case p_master

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
        -- intentional VALIDATE rollback: the row is valid (would-insert/-skip).
        if v_rc = 1 then v_ok := v_ok + 1; else v_skipped := v_skipped + 1; end if;

      when sqlstate 'CMS01' then
        -- expected validation / FK-resolution error.
        v_msg := SQLERRM;
        v_errcnt := v_errcnt + 1;
        v_errors := v_errors || jsonb_build_object('row_no', v_idx, 'column', v_col, 'message', v_msg);
        if v_mode = 'COMMIT' then
          insert into public.import_row_errors (tenant_id, job_id, row_no, column_name, message, raw)
          values (v_tenant, v_job, v_idx, v_col, v_msg, v_row);
        end if;

      when unique_violation or check_violation or foreign_key_violation
         or not_null_violation or invalid_text_representation then
        -- expected DATA-level constraint problem.
        v_msg := SQLERRM;
        v_errcnt := v_errcnt + 1;
        v_errors := v_errors || jsonb_build_object('row_no', v_idx, 'column', v_col, 'message', v_msg);
        if v_mode = 'COMMIT' then
          insert into public.import_row_errors (tenant_id, job_id, row_no, column_name, message, raw)
          values (v_tenant, v_job, v_idx, v_col, v_msg, v_row);
        end if;

      -- Any OTHER exception is UNEXPECTED: not caught here -> it propagates,
      -- aborting the whole transaction (COMMIT rolls back entirely).
    end;
  end loop;

  -- ---- finalize ------------------------------------------------------------
  if v_mode = 'COMMIT' then
    update public.import_jobs
       set status = 'DONE', ok_rows = v_ok, skipped_rows = v_skipped, error_rows = v_errcnt
     where id = v_job;
    perform set_config('app.suppress_row_audit', 'off', true);
    -- ONE summary audit entry for the whole batch.
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
  'Reusable master CSV import: VALIDATE (dry-run, no writes) or COMMIT (atomic; row errors -> import_row_errors, unexpected error -> full rollback).';

-- ---- grants --------------------------------------------------------------
grant execute on function public.import_master(text, text, jsonb) to authenticated, service_role;
