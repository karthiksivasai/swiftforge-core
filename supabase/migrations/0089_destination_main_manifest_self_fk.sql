-- ===========================================================================
-- 0089  Destination Main Branch / Manifest Branch → destinations (self-FK)
-- ---------------------------------------------------------------------------
-- CourierWala: Main Branch and Branch Manifest pickers list destination names.
-- Retarget FKs from public.branches to public.destinations and soft-resolve
-- imports against destination code/name.
-- ===========================================================================

alter table public.destinations
  drop constraint if exists destinations_main_branch_fk;
alter table public.destinations
  drop constraint if exists destinations_manifest_branch_fk;

update public.destinations d
   set main_branch_id = null
 where d.main_branch_id is not null
   and not exists (
     select 1 from public.destinations x
      where x.tenant_id = d.tenant_id
        and x.id = d.main_branch_id
        and x.deleted_at is null
   );

update public.destinations d
   set manifest_branch_id = null
 where d.manifest_branch_id is not null
   and not exists (
     select 1 from public.destinations x
      where x.tenant_id = d.tenant_id
        and x.id = d.manifest_branch_id
        and x.deleted_at is null
   );

alter table public.destinations
  add constraint destinations_main_branch_fk
  foreign key (tenant_id, main_branch_id)
  references public.destinations (tenant_id, id)
  on delete restrict;

alter table public.destinations
  add constraint destinations_manifest_branch_fk
  foreign key (tenant_id, manifest_branch_id)
  references public.destinations (tenant_id, id)
  on delete restrict;

-- Soft lookup: match destination by code OR name (CourierWala imports use names).
create or replace function app.import_build_destination_ref_map(
  p_tenant uuid,
  p_keys text[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_map jsonb := '{}'::jsonb;
  v_key text;
  v_id uuid;
begin
  if p_keys is null then
    return v_map;
  end if;

  foreach v_key in array p_keys
  loop
    if coalesce(btrim(v_key), '') = '' then
      continue;
    end if;
    select d.id into v_id
      from public.destinations d
     where d.tenant_id = p_tenant
       and d.deleted_at is null
       and (
         upper(d.code) = upper(btrim(v_key))
         or upper(d.name) = upper(btrim(v_key))
       )
     order by
       case when upper(d.code) = upper(btrim(v_key)) then 0 else 1 end,
       d.name
     limit 1;
    if v_id is not null then
      v_map := v_map || jsonb_build_object(upper(btrim(v_key)), v_id);
    end if;
  end loop;

  return v_map;
end;
$$;

revoke all on function app.import_build_destination_ref_map(uuid, text[]) from public;
grant execute on function app.import_build_destination_ref_map(uuid, text[])
  to authenticated, service_role;

-- Reuse 0063 import_destinations body; only main/manifest maps change to destinations.
create or replace function public.import_destinations(p_mode text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant    uuid;
  v_mode      text := upper(coalesce(p_mode, 'VALIDATE'));
  v_job       uuid;
  v_total     int := 0;
  v_ok        int := 0;
  v_skipped   int := 0;
  v_errcnt    int := 0;
  v_errors    jsonb := '[]'::jsonb;
  v_row       jsonb;
  v_idx       int := 0;
  v_rc        int;
  v_col       text;
  v_msg       text;
  v_country   uuid;
  v_state     uuid;
  v_zone      uuid;
  v_mbranch   uuid;
  v_manbranch uuid;
  v_map_countries jsonb := '{}'::jsonb;
  v_map_states    jsonb := '{}'::jsonb;
  v_map_zones     jsonb := '{}'::jsonb;
  v_map_dest_refs jsonb := '{}'::jsonb;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  if not app.user_has_permission(v_tenant, 'mst.destination-master', 'add') then
    raise exception 'Missing permission to import destinations' using errcode = '42501';
  end if;

  if v_mode not in ('VALIDATE', 'COMMIT') then
    raise exception 'p_mode must be VALIDATE or COMMIT' using errcode = '22023';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array' using errcode = '22023';
  end if;

  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'Import batch exceeds the 5000-row limit' using errcode = '22023';
  end if;

  v_map_countries := app.import_build_code_map(
    v_tenant, 'countries', app.import_distinct_codes(p_rows, array['country_code']));
  v_map_states := app.import_build_code_map(
    v_tenant, 'states', app.import_distinct_codes(p_rows, array['state_code']));
  v_map_zones := app.import_build_code_map(
    v_tenant, 'zones', app.import_distinct_codes(p_rows, array['zone_code']));
  v_map_dest_refs := app.import_build_destination_ref_map(
    v_tenant,
    app.import_distinct_codes(p_rows, array['main_branch_code', 'manifest_branch_code']));

  if v_mode = 'COMMIT' then
    insert into public.import_jobs
      (tenant_id, import_type, master, mode, status, total_rows, requested_by)
    values
      (v_tenant, 'MASTER_CSV', 'destinations', 'COMMIT', 'RUNNING',
       jsonb_array_length(p_rows), auth.uid())
    returning id into v_job;
    perform set_config('app.suppress_row_audit', 'on', true);
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_idx := v_idx + 1;
    v_total := v_total + 1;
    v_col := null;
    v_rc := 0;
    v_country := null;
    v_state := null;
    v_zone := null;
    v_mbranch := null;
    v_manbranch := null;

    begin
      if coalesce(btrim(v_row->>'code'), '') = '' then
        v_col := 'code';
        raise exception using errcode = 'CMS01', message = 'Code is required';
      end if;
      if coalesce(btrim(v_row->>'name'), '') = '' then
        v_col := 'name';
        raise exception using errcode = 'CMS01', message = 'Name is required';
      end if;

      v_country := app.import_lookup_soft(v_map_countries, v_row->>'country_code');
      v_state := app.import_lookup_soft(v_map_states, v_row->>'state_code');
      v_zone := app.import_lookup_soft(v_map_zones, v_row->>'zone_code');
      v_mbranch := app.import_lookup_soft(v_map_dest_refs, v_row->>'main_branch_code');
      v_manbranch := app.import_lookup_soft(v_map_dest_refs, v_row->>'manifest_branch_code');

      insert into public.destinations (
        tenant_id, dest_type, code, name,
        country_id, state_id, zone_id,
        country_code, state_code,
        service_type, main_branch_id, manifest_branch_id,
        email, mobile, status
      )
      values (
        v_tenant,
        app.norm_enum(
          v_row->>'dest_type',
          array['DOMESTIC', 'INTERNATIONAL', 'LOCAL'],
          'Destination type',
          'DOMESTIC'
        ),
        btrim(v_row->>'code'),
        btrim(v_row->>'name'),
        v_country,
        v_state,
        v_zone,
        nullif(upper(btrim(coalesce(v_row->>'country_code', ''))), ''),
        nullif(upper(btrim(coalesce(v_row->>'state_code', ''))), ''),
        app.norm_enum(
          nullif(btrim(replace(coalesce(v_row->>'service_type', ''), E'\u00a0', '')), ''),
          array['REGULAR', 'METRO', 'REMOTE'],
          'Service type',
          null
        ),
        v_mbranch,
        v_manbranch,
        nullif(btrim(coalesce(v_row->>'email', '')), ''),
        nullif(btrim(coalesce(v_row->>'mobile', '')), ''),
        app.norm_enum(
          v_row->>'status',
          array['ACTIVE', 'INACTIVE'],
          'Status',
          'ACTIVE'
        )
      )
      on conflict (tenant_id, code) where deleted_at is null do nothing;

      get diagnostics v_rc = row_count;

      if v_mode = 'VALIDATE' then
        raise exception using errcode = 'CMS00', message = 'dry-run';
      end if;

      if v_rc = 1 then
        v_ok := v_ok + 1;
      else
        v_skipped := v_skipped + 1;
      end if;

    exception
      when sqlstate 'CMS00' then
        if v_rc = 1 then
          v_ok := v_ok + 1;
        else
          v_skipped := v_skipped + 1;
        end if;

      when sqlstate 'CMS01' then
        v_msg := SQLERRM;
        v_errcnt := v_errcnt + 1;
        v_errors := v_errors || jsonb_build_object(
          'row_no', v_idx, 'column', v_col, 'message', v_msg);
        if v_mode = 'COMMIT' then
          insert into public.import_row_errors
            (tenant_id, job_id, row_no, column_name, message, raw)
          values (v_tenant, v_job, v_idx, v_col, v_msg, v_row);
        end if;

      when unique_violation or check_violation or foreign_key_violation
         or not_null_violation or invalid_text_representation then
        v_msg := SQLERRM;
        v_errcnt := v_errcnt + 1;
        v_errors := v_errors || jsonb_build_object(
          'row_no', v_idx, 'column', v_col, 'message', v_msg);
        if v_mode = 'COMMIT' then
          insert into public.import_row_errors
            (tenant_id, job_id, row_no, column_name, message, raw)
          values (v_tenant, v_job, v_idx, v_col, v_msg, v_row);
        end if;
    end;
  end loop;

  if v_mode = 'COMMIT' then
    update public.import_jobs
       set status = 'DONE',
           ok_rows = v_ok,
           skipped_rows = v_skipped,
           error_rows = v_errcnt
     where id = v_job;
    perform set_config('app.suppress_row_audit', 'off', true);
  end if;

  return jsonb_build_object(
    'master', 'destinations',
    'mode', v_mode,
    'job_id', v_job,
    'total', v_total,
    'ok', v_ok,
    'skipped', v_skipped,
    'error_count', v_errcnt,
    'errors', v_errors
  );
end;
$$;

comment on function public.import_destinations(text, jsonb) is
  'Soft-FK destination import. Main/Manifest branch resolve to destinations by code or name.';
