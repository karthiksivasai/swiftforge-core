-- ===========================================================================
-- 0073  Service mapping CSV import (CourierWala ServiceMap.xls)
-- ---------------------------------------------------------------------------
-- CourierWala headers: Vendor | Service Type | Billing Vendor | Min/Max Weight
-- | Status. "Service Type" is the service name (e.g. ECONOMY). Vendor is the
-- vendor *name*, not code. Resolve vendor by code OR name; soft billing vendor.
-- ===========================================================================

create or replace function app.import_resolve_vendor_key(p_tenant uuid, p_key text)
returns uuid
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_key text := nullif(btrim(coalesce(p_key, '')), '');
  v_id  uuid;
begin
  if v_key is null then
    return null;
  end if;

  select v.id into v_id
  from public.vendors v
  where v.tenant_id = p_tenant
    and v.deleted_at is null
    and upper(v.code) = upper(v_key)
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  select v.id into v_id
  from public.vendors v
  where v.tenant_id = p_tenant
    and v.deleted_at is null
    and upper(v.name) = upper(v_key)
  limit 1;
  return v_id;
end;
$$;

revoke all on function app.import_resolve_vendor_key(uuid, text) from public;
grant execute on function app.import_resolve_vendor_key(uuid, text) to authenticated, service_role;

create or replace function public.import_service_mappings(p_mode text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_mode   text := upper(coalesce(p_mode, 'VALIDATE'));
  v_job    uuid;
  v_total  int := 0;
  v_ok     int := 0;
  v_skipped int := 0;
  v_errcnt int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_row    jsonb;
  v_idx    int := 0;
  v_rc     int;
  v_col    text;
  v_msg    text;
  v_vendor uuid;
  v_bvendor uuid;
  v_service text;
  v_stype  text;
  v_vkey   text;
  v_bkey   text;
  v_status text;
  v_vendor_name text;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  if not app.user_has_permission(v_tenant, 'mst.service-mapping', 'add') then
    raise exception 'Missing permission to import service mappings' using errcode = '42501';
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

  if v_mode = 'COMMIT' then
    insert into public.import_jobs
      (tenant_id, import_type, master, mode, status, total_rows, requested_by)
    values
      (v_tenant, 'MASTER_CSV', 'service_mappings', 'COMMIT', 'RUNNING',
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
    v_vendor := null;
    v_bvendor := null;
    v_service := null;
    v_stype := null;
    v_vkey := null;
    v_bkey := null;
    v_status := null;
    v_vendor_name := null;

    begin
      v_vkey := nullif(btrim(coalesce(
        v_row->>'vendor_code', v_row->>'vendor', v_row->>'vendor_name', '')), '');
      if v_vkey is null then
        v_col := 'vendor_code';
        raise exception using errcode = 'CMS01', message = 'Vendor is required';
      end if;

      -- CourierWala "Service Type" is the service identifier (ECONOMY, FEDEX PROMO, …).
      v_service := nullif(btrim(coalesce(v_row->>'service', '')), '');
      if v_service is null then
        v_service := nullif(btrim(coalesce(v_row->>'service_type', '')), '');
      end if;
      if v_service is null then
        v_col := 'service';
        raise exception using errcode = 'CMS01', message = 'Service is required';
      end if;

      v_col := 'vendor_code';
      v_vendor := app.import_resolve_vendor_key(v_tenant, v_vkey);
      if v_vendor is null then
        raise exception using errcode = 'CMS01',
          message = format('Vendor "%s" not found', v_vkey);
      end if;

      select v.name into v_vendor_name
      from public.vendors v
      where v.id = v_vendor;

      v_bkey := nullif(btrim(coalesce(
        v_row->>'billing_vendor_code', v_row->>'billing_vendor', '')), '');
      if v_bkey is not null then
        v_col := 'billing_vendor_code';
        v_bvendor := app.import_resolve_vendor_key(v_tenant, v_bkey);
      end if;

      v_stype := nullif(btrim(coalesce(v_row->>'service_type', '')), '');
      if v_stype is null or upper(v_stype) = upper(v_service) then
        v_stype := nullif(btrim(concat_ws(' - ', v_vendor_name, v_service)), '');
      end if;

      v_status := app.norm_enum(
        v_row->>'status', array['ACTIVE', 'INACTIVE'], 'Status', 'ACTIVE');

      v_col := null;

      insert into public.service_mappings
        (tenant_id, vendor_id, service, service_type, billing_vendor_id,
         min_weight, max_weight, vendor_link, is_single_piece, status)
      values (
        v_tenant, v_vendor, v_service, v_stype, v_bvendor,
        coalesce(nullif(btrim(coalesce(v_row->>'min_weight', '')), '')::numeric, 0),
        coalesce(nullif(btrim(coalesce(v_row->>'max_weight', '')), '')::numeric, 99999),
        nullif(btrim(coalesce(v_row->>'vendor_link', '')), ''),
        coalesce(app.norm_bool(v_row->>'is_single_piece', false), false),
        v_status
      )
      on conflict (tenant_id, vendor_id, service) where deleted_at is null do nothing;

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
          'row_no', v_idx, 'column_name', v_col, 'message', v_msg);
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
          'row_no', v_idx, 'column_name', v_col, 'message', v_msg);
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
    'master', 'service_mappings',
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

revoke all on function public.import_service_mappings(text, jsonb) from public;
grant execute on function public.import_service_mappings(text, jsonb) to authenticated, service_role;

comment on function public.import_service_mappings(text, jsonb) is
  'CourierWala ServiceMap import: Vendor/Service Type by name; soft billing vendor.';
