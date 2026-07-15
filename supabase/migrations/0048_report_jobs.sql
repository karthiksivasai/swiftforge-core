-- ===========================================================================
-- 0048  report jobs & exports — Phase 5 Milestone 5G
-- ---------------------------------------------------------------------------
-- Async report-job infrastructure + manual CSV/XLSX execution.
-- Reuses app.execute_report_source / report_definitions / files.
-- No cron, workers, PDF, email, or Phase 6 utilities.
-- Status: QUEUED | RUNNING | COMPLETED | FAILED | CANCELLED
-- Formats: CSV | XLSX only
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- report_jobs
-- ---------------------------------------------------------------------------
create table if not exists public.report_jobs (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  report_key      text not null,
  filters         jsonb not null default '{}'::jsonb,
  output_format   text not null
                    check (output_format in ('CSV','XLSX')),
  status          text not null default 'QUEUED'
                    check (status in (
                      'QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED')),
  progress        integer not null default 0
                    check (progress >= 0 and progress <= 100),
  file_id         uuid references public.files(id) on delete set null,
  -- SQL-side artifact bytes (no object-storage worker in 5G). Download via RPC.
  result_content  text,
  row_count       integer not null default 0,
  error_message   text,
  requested_by    uuid not null default auth.uid(),
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  row_version     integer not null default 1
);
create index if not exists report_jobs_tenant_created_idx
  on public.report_jobs (tenant_id, created_at desc);
create index if not exists report_jobs_tenant_status_idx
  on public.report_jobs (tenant_id, status, created_at desc);
create index if not exists report_jobs_tenant_report_idx
  on public.report_jobs (tenant_id, report_key, created_at desc);
create index if not exists report_jobs_requested_by_idx
  on public.report_jobs (tenant_id, requested_by, created_at desc);

drop trigger if exists trg_touch_report_jobs on public.report_jobs;
create trigger trg_touch_report_jobs before insert or update on public.report_jobs
  for each row execute function app.tg_touch_row();

alter table public.report_jobs enable row level security;

drop policy if exists report_jobs_select on public.report_jobs;
create policy report_jobs_select on public.report_jobs
  for select using (
    tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin()
  );

-- Writes go through SECURITY DEFINER RPCs only.

-- ---------------------------------------------------------------------------
-- Enable CSV / XLSX on existing report metadata (reuse definitions)
-- ---------------------------------------------------------------------------
update public.report_definitions
   set allowed_formats = array['JSON','CSV','XLSX']::text[],
       updated_at = now()
 where deleted_at is null
   and is_active;

-- ---------------------------------------------------------------------------
-- CSV / Excel helpers
-- ---------------------------------------------------------------------------
create or replace function app.csv_escape(p text)
returns text
language plpgsql
immutable
as $$
begin
  if p is null then return ''; end if;
  if p ~ '[",\n\r]' then
    return '"' || replace(p, '"', '""') || '"';
  end if;
  return p;
end
$$;

create or replace function app.xml_escape(p text)
returns text
language sql
immutable
as $$
  select coalesce(
    replace(replace(replace(replace(p, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'),
    '');
$$;

create or replace function app.build_report_csv(
  p_columns jsonb,
  p_rows jsonb
)
returns text
language plpgsql
immutable
as $$
declare
  v_out text := '';
  v_col jsonb;
  v_row jsonb;
  v_first boolean;
  v_key text;
  v_keys text[] := '{}';
begin
  v_first := true;
  for v_col in select * from jsonb_array_elements(coalesce(p_columns, '[]'::jsonb))
  loop
    v_key := coalesce(v_col->>'key', '');
    v_keys := array_append(v_keys, v_key);
    if not v_first then v_out := v_out || ','; end if;
    v_out := v_out || app.csv_escape(coalesce(v_col->>'label', v_key));
    v_first := false;
  end loop;
  v_out := v_out || E'\n';

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    v_first := true;
    foreach v_key in array v_keys
    loop
      if not v_first then v_out := v_out || ','; end if;
      v_out := v_out || app.csv_escape(v_row->>v_key);
      v_first := false;
    end loop;
    v_out := v_out || E'\n';
  end loop;

  return v_out;
end
$$;

create or replace function app.build_report_xlsx_xml(
  p_title text,
  p_columns jsonb,
  p_rows jsonb
)
returns text
language plpgsql
immutable
as $$
declare
  v_out text;
  v_col jsonb;
  v_row jsonb;
  v_key text;
  v_keys text[] := '{}';
  v_cells text;
begin
  -- SpreadsheetML (Excel-openable). Stored as .xlsx export artifact in 5G
  -- without an OOXML zip worker. PDF remains deferred.
  for v_col in select * from jsonb_array_elements(coalesce(p_columns, '[]'::jsonb))
  loop
    v_keys := array_append(v_keys, coalesce(v_col->>'key', ''));
  end loop;

  v_out :=
    '<?xml version="1.0"?>' ||
    '<?mso-application progid="Excel.Sheet"?>' ||
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"' ||
    ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' ||
    '<Worksheet ss:Name="' || app.xml_escape(left(coalesce(nullif(p_title,''),'Report'), 31)) || '">' ||
    '<Table>';

  v_cells := '';
  for v_col in select * from jsonb_array_elements(coalesce(p_columns, '[]'::jsonb))
  loop
    v_cells := v_cells ||
      '<Cell><Data ss:Type="String">' ||
      app.xml_escape(coalesce(v_col->>'label', v_col->>'key')) ||
      '</Data></Cell>';
  end loop;
  v_out := v_out || '<Row>' || v_cells || '</Row>';

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    v_cells := '';
    foreach v_key in array v_keys
    loop
      v_cells := v_cells ||
        '<Cell><Data ss:Type="String">' ||
        app.xml_escape(v_row->>v_key) ||
        '</Data></Cell>';
    end loop;
    v_out := v_out || '<Row>' || v_cells || '</Row>';
  end loop;

  v_out := v_out || '</Table></Worksheet></Workbook>';
  return v_out;
end
$$;

-- ---------------------------------------------------------------------------
-- create_report_job
-- ---------------------------------------------------------------------------
create or replace function public.create_report_job(
  p_report_key text,
  p_filters jsonb default '{}'::jsonb,
  p_output_format text default 'CSV'
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_d public.report_definitions;
  v_val jsonb;
  v_fmt text := upper(nullif(btrim(coalesce(p_output_format,'CSV')),''));
  v_job public.report_jobs;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  if v_fmt not in ('CSV','XLSX') then
    raise exception 'Unsupported export format: % (CSV|XLSX only)', v_fmt
      using errcode = 'CMS04';
  end if;

  v_d := app.get_report_def_row(p_report_key);
  perform app.assert_report_permission(v_tenant, v_d.permission_slug);

  if not (v_fmt = any (v_d.allowed_formats)) then
    raise exception 'Format % is not allowed for report %', v_fmt, p_report_key
      using errcode = 'CMS04';
  end if;

  v_val := app.validate_report_filters_internal(v_d, coalesce(p_filters,'{}'::jsonb));
  if not coalesce((v_val->>'ok')::boolean, false) then
    raise exception 'Filter validation failed: %', v_val->'errors'
      using errcode = 'CMS04';
  end if;

  insert into public.report_jobs (
    tenant_id, report_key, filters, output_format, status, progress, requested_by)
  values (
    v_tenant, v_d.report_key, coalesce(p_filters,'{}'::jsonb), v_fmt,
    'QUEUED', 0, auth.uid())
  returning * into v_job;

  return jsonb_build_object(
    'id', v_job.id,
    'report_key', v_job.report_key,
    'output_format', v_job.output_format,
    'status', v_job.status,
    'progress', v_job.progress,
    'created_at', v_job.created_at);
end
$$;

revoke all on function public.create_report_job(text, jsonb, text) from public;
grant execute on function public.create_report_job(text, jsonb, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- list_report_jobs
-- ---------------------------------------------------------------------------
create or replace function public.list_report_jobs(
  p_status text default null,
  p_report_key text default null,
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_page integer := greatest(coalesce(p_page,1), 1);
  v_size integer := least(greatest(coalesce(p_page_size,20), 1), 100);
  v_offset integer;
  v_status text := nullif(upper(btrim(coalesce(p_status,''))),'');
  v_key text := nullif(btrim(coalesce(p_report_key,'')),'');
  v_total bigint;
  v_rows jsonb;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  if v_status is not null and v_status not in (
    'QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED'
  ) then
    raise exception 'Invalid status filter' using errcode = '22023';
  end if;

  v_offset := (v_page - 1) * v_size;

  select count(*) into v_total
    from public.report_jobs j
   where j.tenant_id = v_tenant
     and (v_status is null or j.status = v_status)
     and (v_key is null or j.report_key = v_key);

  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
    into v_rows
    from (
      select
        j.id,
        j.report_key,
        j.output_format,
        j.status,
        j.progress,
        j.file_id,
        j.row_count,
        j.error_message,
        j.requested_by,
        j.started_at,
        j.completed_at,
        j.created_at,
        j.updated_at,
        d.title as report_title
      from public.report_jobs j
      left join public.report_definitions d
        on d.report_key = j.report_key and d.deleted_at is null
      where j.tenant_id = v_tenant
        and (v_status is null or j.status = v_status)
        and (v_key is null or j.report_key = v_key)
      order by j.created_at desc
      limit v_size offset v_offset
    ) t;

  return jsonb_build_object(
    'rows', v_rows,
    'total', v_total,
    'page', v_page,
    'page_size', v_size);
end
$$;

revoke all on function public.list_report_jobs(text, text, integer, integer) from public;
grant execute on function public.list_report_jobs(text, text, integer, integer)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- get_report_job
-- ---------------------------------------------------------------------------
create or replace function public.get_report_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_job public.report_jobs;
  v_d public.report_definitions;
  v_file public.files;
  v_download jsonb := null;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  select * into v_job from public.report_jobs
   where id = p_job_id and tenant_id = v_tenant;
  if not found then
    raise exception 'Report job not found' using errcode = 'P0002';
  end if;

  begin
    v_d := app.get_report_def_row(v_job.report_key);
    perform app.assert_report_permission(v_tenant, v_d.permission_slug);
  exception when sqlstate '42501' then
    if not (app.is_tenant_admin(v_tenant) or app.is_platform_admin()) then
      raise;
    end if;
  end;

  if v_job.status = 'COMPLETED' and v_job.file_id is not null then
    select * into v_file from public.files
     where id = v_job.file_id and tenant_id = v_tenant and deleted_at is null;
    if found then
      v_download := jsonb_build_object(
        'file_id', v_file.id,
        'original_name', v_file.original_name,
        'mime', v_file.mime,
        'size_bytes', v_file.size_bytes,
        'storage_key', v_file.storage_key,
        'content_base64', case
          when v_job.result_content is not null
            then encode(convert_to(v_job.result_content, 'UTF8'), 'base64')
          else null
        end);
    end if;
  end if;

  return jsonb_build_object(
    'id', v_job.id,
    'report_key', v_job.report_key,
    'report_title', coalesce(v_d.title, v_job.report_key),
    'filters', v_job.filters,
    'output_format', v_job.output_format,
    'status', v_job.status,
    'progress', v_job.progress,
    'file_id', v_job.file_id,
    'row_count', v_job.row_count,
    'error_message', v_job.error_message,
    'requested_by', v_job.requested_by,
    'started_at', v_job.started_at,
    'completed_at', v_job.completed_at,
    'created_at', v_job.created_at,
    'updated_at', v_job.updated_at,
    'download', v_download);
end
$$;

revoke all on function public.get_report_job(uuid) from public;
grant execute on function public.get_report_job(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- cancel_report_job
-- ---------------------------------------------------------------------------
create or replace function public.cancel_report_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_job public.report_jobs;
  v_d public.report_definitions;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  select * into v_job from public.report_jobs
   where id = p_job_id and tenant_id = v_tenant
   for update;
  if not found then
    raise exception 'Report job not found' using errcode = 'P0002';
  end if;

  if v_job.requested_by is distinct from auth.uid()
     and not (app.is_tenant_admin(v_tenant) or app.is_platform_admin()) then
    raise exception 'Permission denied: cancel report job' using errcode = '42501';
  end if;

  v_d := app.get_report_def_row(v_job.report_key);
  perform app.assert_report_permission(v_tenant, v_d.permission_slug);

  if v_job.status not in ('QUEUED','RUNNING') then
    raise exception 'Job cannot be cancelled in status %', v_job.status
      using errcode = 'CMS04';
  end if;

  update public.report_jobs
     set status = 'CANCELLED',
         progress = least(progress, 99),
         completed_at = now(),
         error_message = coalesce(error_message, 'Cancelled by user'),
         updated_at = now()
   where id = v_job.id
   returning * into v_job;

  return jsonb_build_object(
    'id', v_job.id,
    'status', v_job.status,
    'progress', v_job.progress,
    'completed_at', v_job.completed_at);
end
$$;

revoke all on function public.cancel_report_job(uuid) from public;
grant execute on function public.cancel_report_job(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- execute_report_job — manual only; calls existing report engine
-- ---------------------------------------------------------------------------
create or replace function public.execute_report_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_job public.report_jobs;
  v_d public.report_definitions;
  v_val jsonb;
  v_from date;
  v_to date;
  v_data jsonb;
  v_rows jsonb;
  v_total bigint;
  v_content text;
  v_mime text;
  v_ext text;
  v_name text;
  v_file_id uuid;
  v_size bigint;
  v_export_limit integer := 5000;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  select * into v_job from public.report_jobs
   where id = p_job_id and tenant_id = v_tenant
   for update;
  if not found then
    raise exception 'Report job not found' using errcode = 'P0002';
  end if;

  v_d := app.get_report_def_row(v_job.report_key);
  perform app.assert_report_permission(v_tenant, v_d.permission_slug);

  if v_job.status = 'CANCELLED' then
    raise exception 'Job is cancelled' using errcode = 'CMS04';
  end if;
  if v_job.status = 'COMPLETED' then
    raise exception 'Job already completed' using errcode = 'CMS04';
  end if;
  if v_job.status = 'RUNNING' then
    raise exception 'Job is already running' using errcode = 'CMS04';
  end if;
  -- QUEUED or FAILED (retry) allowed
  if v_job.status not in ('QUEUED','FAILED') then
    raise exception 'Job cannot be executed in status %', v_job.status
      using errcode = 'CMS04';
  end if;

  update public.report_jobs
     set status = 'RUNNING',
         progress = 10,
         started_at = coalesce(started_at, now()),
         completed_at = null,
         error_message = null,
         result_content = null,
         file_id = null,
         row_count = 0,
         updated_at = now()
   where id = v_job.id;

  begin
    v_val := app.validate_report_filters_internal(v_d, v_job.filters);
    if not coalesce((v_val->>'ok')::boolean, false) then
      raise exception 'Filter validation failed: %', v_val->'errors'
        using errcode = 'CMS04';
    end if;
    v_from := (v_val->>'from_date')::date;
    v_to := (v_val->>'to_date')::date;

    update public.report_jobs set progress = 30, updated_at = now() where id = v_job.id;

    -- Reuse engine — single large page for export (cap enforced).
    v_data := app.execute_report_source(
      v_tenant, v_d, v_job.filters, v_from, v_to,
      v_export_limit, 0, null, 'desc');

    v_rows := coalesce(v_data->'rows', '[]'::jsonb);
    v_total := coalesce((v_data->>'total')::bigint, 0);

    update public.report_jobs
       set progress = 60, row_count = jsonb_array_length(v_rows), updated_at = now()
     where id = v_job.id;

    -- Bail if cancelled mid-flight
    select status into v_job.status from public.report_jobs where id = v_job.id;
    if v_job.status = 'CANCELLED' then
      return jsonb_build_object('id', v_job.id, 'status', 'CANCELLED');
    end if;

    if v_job.output_format = 'CSV' then
      v_content := app.build_report_csv(v_d.columns, v_rows);
      v_mime := 'text/csv';
      v_ext := 'csv';
    else
      v_content := app.build_report_xlsx_xml(v_d.title, v_d.columns, v_rows);
      v_mime := 'application/vnd.ms-excel';
      v_ext := 'xlsx';
    end if;

    update public.report_jobs set progress = 80, updated_at = now() where id = v_job.id;

    v_name := format('%s-%s.%s', v_d.report_key, to_char(now() at time zone 'utc', 'YYYYMMDD-HH24MISS'), v_ext);
    v_size := octet_length(convert_to(v_content, 'UTF8'));

    insert into public.files (
      tenant_id, storage_bucket, storage_key, original_name, mime, size_bytes,
      scan_status, owner_type, owner_id, uploaded_by, created_by, updated_by)
    values (
      v_tenant,
      'tenant-files',
      format('tenants/%s/reports/%s/%s', v_tenant, v_d.report_key, gen_random_uuid()::text || '-' || v_name),
      v_name,
      v_mime,
      v_size,
      'CLEAN',
      'REPORT_JOB',
      v_job.id,
      auth.uid(),
      auth.uid(),
      auth.uid())
    returning id into v_file_id;

    update public.report_jobs
       set status = 'COMPLETED',
           progress = 100,
           file_id = v_file_id,
           result_content = v_content,
           row_count = jsonb_array_length(v_rows),
           completed_at = now(),
           error_message = case
             when v_total > v_export_limit
               then format('Export capped at %s of %s rows', v_export_limit, v_total)
             else null
           end,
           updated_at = now()
     where id = v_job.id
     returning * into v_job;

  exception when others then
    update public.report_jobs
       set status = 'FAILED',
           progress = least(progress, 99),
           error_message = left(SQLERRM, 2000),
           completed_at = now(),
           updated_at = now()
     where id = p_job_id
       and status = 'RUNNING';
    raise;
  end;

  return jsonb_build_object(
    'id', v_job.id,
    'status', v_job.status,
    'progress', v_job.progress,
    'file_id', v_job.file_id,
    'row_count', v_job.row_count,
    'completed_at', v_job.completed_at,
    'error_message', v_job.error_message);
end
$$;

revoke all on function public.execute_report_job(uuid) from public;
grant execute on function public.execute_report_job(uuid)
  to authenticated, service_role;

-- Refresh export note on get_report_definition (preserve filter_schema join)
create or replace function public.get_report_definition(p_report_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_d public.report_definitions;
  v_filters jsonb;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  v_d := app.get_report_def_row(p_report_key);
  perform app.assert_report_permission(v_tenant, v_d.permission_slug);

  select coalesce(jsonb_agg(jsonb_build_object(
      'key', f.filter_key,
      'label', f.label,
      'type', f.filter_type,
      'required', f.required,
      'lookup', f.lookup_key,
      'options', f.enum_options,
      'default', f.default_value,
      'sort', f.sort_order
    ) order by f.sort_order), coalesce(v_d.filter_schema,'[]'::jsonb))
    into v_filters
    from public.report_filters f
   where f.report_id = v_d.id;

  return jsonb_build_object(
    'report_key', v_d.report_key,
    'hub', v_d.hub,
    'title', v_d.title,
    'description', v_d.description,
    'permission_slug', v_d.permission_slug,
    'source_entity', v_d.source_entity,
    'filters', v_filters,
    'columns', v_d.columns,
    'allowed_formats', to_jsonb(v_d.allowed_formats),
    'default_sort', v_d.default_sort,
    'max_date_span_days', v_d.max_date_span_days,
    'export_options', jsonb_build_object(
      'formats', to_jsonb(v_d.allowed_formats),
      'async_job', true,
      'note', 'CSV/XLSX via create_report_job + execute_report_job (manual). PDF/email deferred.'
    ));
end
$$;

revoke all on function public.get_report_definition(text) from public;
grant execute on function public.get_report_definition(text)
  to authenticated, service_role;

comment on table public.report_jobs is
  'Async report export jobs (CSV/XLSX). Manual execute_report_job only in 5G.';
comment on function public.create_report_job(text, jsonb, text) is
  'Queue a report export job (CSV|XLSX).';
comment on function public.list_report_jobs(text, text, integer, integer) is
  'Tenant-scoped report job list with status/report filters and paging.';
comment on function public.get_report_job(uuid) is
  'Job status, progress, and download metadata/content when completed.';
comment on function public.cancel_report_job(uuid) is
  'Cancel a QUEUED or RUNNING report job.';
comment on function public.execute_report_job(uuid) is
  'Manually run a queued/failed job via existing report engine; write files + complete.';
