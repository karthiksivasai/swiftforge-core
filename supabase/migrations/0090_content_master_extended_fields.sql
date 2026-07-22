-- ===========================================================================
-- 0090  Content master — CourierWala extended fields
-- ---------------------------------------------------------------------------
-- Adds HSN, Vendor, Country, and Additional Field block used on
-- Masters → Sales → Content (Clearance / Notification / IGST fields).
-- ===========================================================================

alter table public.contents
  add column if not exists hsn_code text,
  add column if not exists vendor_id uuid,
  add column if not exists country_id uuid,
  add column if not exists clearance_cert_no text,
  add column if not exists notification_sub_type text,
  add column if not exists notification_sub_type1 text,
  add column if not exists notification_no text,
  add column if not exists sr_no text,
  add column if not exists igst_notification text,
  add column if not exists igst_sr_no text,
  add column if not exists igstc_notification text,
  add column if not exists igstc_sr_no text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'contents_vendor_fk'
  ) then
    alter table public.contents
      add constraint contents_vendor_fk
      foreign key (tenant_id, vendor_id)
      references public.vendors (tenant_id, id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'contents_country_fk'
  ) then
    alter table public.contents
      add constraint contents_country_fk
      foreign key (tenant_id, country_id)
      references public.countries (tenant_id, id)
      on delete set null;
  end if;
end $$;

create index if not exists contents_vendor_idx
  on public.contents (tenant_id, vendor_id)
  where deleted_at is null and vendor_id is not null;

create index if not exists contents_country_idx
  on public.contents (tenant_id, country_id)
  where deleted_at is null and country_id is not null;

create index if not exists contents_hsn_trgm
  on public.contents using gin (hsn_code gin_trgm_ops);

-- Dedicated soft-FK import for extended content rows.
create or replace function public.import_contents(p_mode text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant  uuid;
  v_mode    text := upper(coalesce(p_mode, 'VALIDATE'));
  v_job     uuid;
  v_total   int := 0;
  v_ok      int := 0;
  v_skipped int := 0;
  v_errcnt  int := 0;
  v_errors  jsonb := '[]'::jsonb;
  v_row     jsonb;
  v_idx     int := 0;
  v_rc      int;
  v_col     text;
  v_msg     text;
  v_vendor  uuid;
  v_country uuid;
  v_map_vendors   jsonb := '{}'::jsonb;
  v_map_countries jsonb := '{}'::jsonb;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  if not app.user_has_permission(v_tenant, 'mst.content-master', 'add') then
    raise exception 'Missing permission to import contents' using errcode = '42501';
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

  v_map_vendors := app.import_build_code_map(
    v_tenant, 'vendors',
    app.import_distinct_codes(p_rows, array['vendor_code']));
  v_map_countries := app.import_build_code_map(
    v_tenant, 'countries',
    app.import_distinct_codes(p_rows, array['country_code']));

  if v_mode = 'COMMIT' then
    insert into public.import_jobs
      (tenant_id, import_type, master, mode, status, total_rows, requested_by)
    values
      (v_tenant, 'MASTER_CSV', 'contents', 'COMMIT', 'RUNNING',
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
    v_country := null;

    begin
      if coalesce(btrim(v_row->>'code'), '') = '' then
        v_col := 'code';
        raise exception using errcode = 'CMS01', message = 'Code is required';
      end if;
      if coalesce(btrim(v_row->>'name'), '') = '' then
        v_col := 'name';
        raise exception using errcode = 'CMS01', message = 'Name is required';
      end if;

      v_vendor := app.import_lookup_soft(v_map_vendors, v_row->>'vendor_code');
      v_country := app.import_lookup_soft(v_map_countries, v_row->>'country_code');

      insert into public.contents (
        tenant_id, code, name, hsn_code, vendor_id, country_id,
        clearance_cert_no, notification_sub_type, notification_sub_type1,
        notification_no, sr_no, igst_notification, igst_sr_no,
        igstc_notification, igstc_sr_no
      )
      values (
        v_tenant,
        btrim(v_row->>'code'),
        btrim(v_row->>'name'),
        nullif(btrim(coalesce(v_row->>'hsn_code', '')), ''),
        v_vendor,
        v_country,
        nullif(btrim(coalesce(v_row->>'clearance_cert_no', '')), ''),
        nullif(btrim(coalesce(v_row->>'notification_sub_type', '')), ''),
        nullif(btrim(coalesce(v_row->>'notification_sub_type1', '')), ''),
        nullif(btrim(coalesce(v_row->>'notification_no', '')), ''),
        nullif(btrim(coalesce(v_row->>'sr_no', '')), ''),
        nullif(btrim(coalesce(v_row->>'igst_notification', '')), ''),
        nullif(btrim(coalesce(v_row->>'igst_sr_no', '')), ''),
        nullif(btrim(coalesce(v_row->>'igstc_notification', '')), ''),
        nullif(btrim(coalesce(v_row->>'igstc_sr_no', '')), '')
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
    'master', 'contents',
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

revoke all on function public.import_contents(text, jsonb) from public;
grant execute on function public.import_contents(text, jsonb)
  to authenticated, service_role;

comment on function public.import_contents(text, jsonb) is
  'Soft-FK content import including HSN, vendor, country, and additional customs fields.';
