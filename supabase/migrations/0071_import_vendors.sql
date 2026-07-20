-- ===========================================================================
-- 0071  Vendor CSV import (CourierWala Vendor Code / Name / origin / …)
-- ---------------------------------------------------------------------------
-- Dedicated import RPC. Soft state + origin destination FKs. Mobile falls back
-- to phone1/phone2/placeholder. CourierWala "Status" True/False → is_global.
-- ===========================================================================

create or replace function public.import_vendors(p_mode text, p_rows jsonb)
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
  v_code   text;
  v_name   text;
  v_mobile text;
  v_status text;
  v_state  uuid;
  v_dest   uuid;
  v_global boolean;
  v_map_states jsonb := '{}'::jsonb;
  v_map_destinations jsonb := '{}'::jsonb;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  if not app.user_has_permission(v_tenant, 'mst.vendor-master', 'add') then
    raise exception 'Missing permission to import vendors' using errcode = '42501';
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

  v_map_states := app.import_build_code_map(
    v_tenant, 'states',
    app.import_distinct_codes(p_rows, array['state_code']));
  v_map_destinations := app.import_build_code_map(
    v_tenant, 'destinations',
    app.import_distinct_codes(
      p_rows, array['origin_destination_code', 'destination_code', 'origin']));

  if v_mode = 'COMMIT' then
    insert into public.import_jobs
      (tenant_id, import_type, master, mode, status, total_rows, requested_by)
    values
      (v_tenant, 'MASTER_CSV', 'vendors', 'COMMIT', 'RUNNING',
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
    v_code := null;
    v_name := null;
    v_mobile := null;
    v_status := null;
    v_state := null;
    v_dest := null;
    v_global := false;

    begin
      v_code := nullif(btrim(coalesce(v_row->>'code', '')), '');
      v_name := nullif(btrim(coalesce(v_row->>'name', '')), '');
      if v_code is null then
        v_col := 'code';
        raise exception using errcode = 'CMS01', message = 'Vendor Code is required';
      end if;
      if v_name is null then
        v_col := 'name';
        raise exception using errcode = 'CMS01', message = 'Vendor Name is required';
      end if;

      v_mobile := nullif(btrim(coalesce(
        v_row->>'mobile',
        v_row->>'phone1',
        v_row->>'phone',
        v_row->>'phone2',
        ''
      )), '');
      if v_mobile is null then
        v_mobile := '0000000000';
      end if;

      -- CourierWala exports Status as True/False meaning Global; real status stays ACTIVE.
      v_status := lower(btrim(coalesce(v_row->>'status', '')));
      if v_status in ('true', 'false', 't', 'f', 'yes', 'no', 'y', 'n', '1', '0') then
        v_global := app.norm_bool(v_row->>'status', false);
        v_status := 'ACTIVE';
      else
        v_global := app.norm_bool(
          coalesce(v_row->>'is_global', v_row->>'global'),
          false
        );
        v_status := app.norm_enum(
          v_row->>'status', array['ACTIVE', 'INACTIVE'], 'Status', 'ACTIVE');
      end if;

      v_state := app.import_lookup_soft(
        v_map_states,
        coalesce(v_row->>'state_code', v_row->>'state'));
      v_dest := app.import_lookup_soft(
        v_map_destinations,
        coalesce(
          v_row->>'origin_destination_code',
          v_row->>'destination_code',
          v_row->>'origin'
        ));

      insert into public.vendors (
        tenant_id, code, name, contact_person, address1, address2, pin_code, city, state_id,
        phone1, phone2, fax, mobile, email, website, gst_no, mode, vendor_class, fuel_head,
        currency, origin_destination_id, vendor_zip, is_global, gst_applies, vol_weight_round_off, status
      )
      values (
        v_tenant,
        v_code,
        v_name,
        nullif(btrim(coalesce(v_row->>'contact_person', v_row->>'contact', '')), ''),
        nullif(btrim(coalesce(v_row->>'address1', v_row->>'address', '')), ''),
        nullif(btrim(coalesce(v_row->>'address2', '')), ''),
        nullif(btrim(coalesce(v_row->>'pin_code', v_row->>'pincode', '')), ''),
        nullif(btrim(coalesce(v_row->>'city', '')), ''),
        v_state,
        nullif(btrim(coalesce(v_row->>'phone1', v_row->>'phone', '')), ''),
        nullif(btrim(coalesce(v_row->>'phone2', '')), ''),
        nullif(btrim(coalesce(v_row->>'fax', '')), ''),
        v_mobile,
        nullif(btrim(coalesce(v_row->>'email', '')), ''),
        nullif(btrim(coalesce(v_row->>'website', '')), ''),
        nullif(btrim(coalesce(v_row->>'gst_no', v_row->>'gstno', '')), ''),
        upper(replace(coalesce(nullif(btrim(v_row->>'mode'), ''), 'COURIER'), ' ', '_')),
        upper(replace(coalesce(nullif(btrim(v_row->>'vendor_class'), ''), 'VENDOR'), ' ', '_')),
        nullif(btrim(coalesce(v_row->>'fuel_head', '')), ''),
        coalesce(nullif(btrim(v_row->>'currency'), ''), 'INR'),
        v_dest,
        nullif(btrim(coalesce(v_row->>'vendor_zip', '')), ''),
        v_global,
        app.norm_bool(coalesce(v_row->>'gst_applies', v_row->>'gst'), true),
        app.norm_bool(v_row->>'vol_weight_round_off', false),
        v_status
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
    'master', 'vendors',
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

revoke all on function public.import_vendors(text, jsonb) from public;
grant execute on function public.import_vendors(text, jsonb) to authenticated, service_role;

comment on function public.import_vendors(text, jsonb) is
  'Vendor CSV import; soft state/origin FKs; CourierWala Status True/False → is_global.';
