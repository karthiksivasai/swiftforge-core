-- ===========================================================================
-- 0050  rate update jobs — Phase 6 Milestone 6B
-- ---------------------------------------------------------------------------
-- Bulk recalculation of shipment charge snapshots via existing rating engine
-- (app.run_shipment_rating / calculate_shipment_rating pipeline).
-- Manual execute only. No cron/workers. No zone/tax/fuel UI (later milestones).
-- Status: QUEUED | RUNNING | COMPLETED | FAILED | CANCELLED
-- Permission: utl.rate-update (add|modify|list|search)
-- ===========================================================================

create table if not exists public.rate_update_jobs (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  update_type          text not null default 'AWB_RATE'
                         check (update_type in (
                           'AWB_RATE','VENDOR_RATE','TAX_FUEL','OBC_RATE')),
  filters              jsonb not null default '{}'::jsonb,
  status               text not null default 'QUEUED'
                         check (status in (
                           'QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED')),
  progress             integer not null default 0
                         check (progress >= 0 and progress <= 100),
  total_shipments      integer not null default 0,
  processed_shipments  integer not null default 0,
  updated_shipments    integer not null default 0,
  skipped_shipments    integer not null default 0,
  failed_shipments     integer not null default 0,
  error_message        text,
  created_by           uuid not null default auth.uid(),
  started_at           timestamptz,
  completed_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  row_version          integer not null default 1
);
create index if not exists rate_update_jobs_tenant_created_idx
  on public.rate_update_jobs (tenant_id, created_at desc);
create index if not exists rate_update_jobs_tenant_status_idx
  on public.rate_update_jobs (tenant_id, status, created_at desc);

drop trigger if exists trg_touch_rate_update_jobs on public.rate_update_jobs;
create trigger trg_touch_rate_update_jobs before insert or update on public.rate_update_jobs
  for each row execute function app.tg_touch_row();

alter table public.rate_update_jobs enable row level security;
drop policy if exists rate_update_jobs_select on public.rate_update_jobs;
create policy rate_update_jobs_select on public.rate_update_jobs
  for select using (
    tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin()
  );

-- ---------------------------------------------------------------------------
create or replace function app.assert_rate_update_permission(p_tenant uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, app
as $$
begin
  if app.is_platform_admin() or app.is_tenant_admin(p_tenant) then
    return;
  end if;
  if app.user_has_permission(p_tenant, 'utl.rate-update', 'add')
     or app.user_has_permission(p_tenant, 'utl.rate-update', 'modify')
     or app.user_has_permission(p_tenant, 'utl.rate-update', 'list')
     or app.user_has_permission(p_tenant, 'utl.rate-update', 'search') then
    return;
  end if;
  raise exception 'Permission denied: utl.rate-update' using errcode = '42501';
end
$$;

create or replace function app.assert_rate_update_execute_permission(p_tenant uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, app
as $$
begin
  if app.is_platform_admin() or app.is_tenant_admin(p_tenant) then
    return;
  end if;
  if app.user_has_permission(p_tenant, 'utl.rate-update', 'add')
     or app.user_has_permission(p_tenant, 'utl.rate-update', 'modify') then
    return;
  end if;
  raise exception 'Permission denied: utl.rate-update' using errcode = '42501';
end
$$;

-- Resolve optional code filters → ids inside filters jsonb
create or replace function app.normalize_rate_update_filters(
  p_tenant uuid,
  p_filters jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_from date;
  v_to date;
  v_cust uuid;
  v_prod uuid;
  v_dest uuid;
  v_branch uuid;
  v_zone uuid;
  v_code text;
begin
  begin
    v_from := nullif(btrim(coalesce(v_f->>'from_date','')),'')::date;
    v_to := nullif(btrim(coalesce(v_f->>'to_date','')),'')::date;
  exception when others then
    raise exception 'Invalid date range in filters' using errcode = 'CMS04';
  end;
  if v_from is null or v_to is null then
    raise exception 'from_date and to_date are required' using errcode = 'CMS04';
  end if;
  if v_to < v_from then
    raise exception 'Invalid date range' using errcode = 'CMS04';
  end if;
  if (v_to - v_from) > 92 then
    raise exception 'Date range cannot exceed 92 days' using errcode = 'CMS04';
  end if;

  v_cust := nullif(btrim(coalesce(v_f->>'customer_id','')),'')::uuid;
  v_code := nullif(btrim(coalesce(v_f->>'customer_code','')),'');
  if v_cust is null and v_code is not null then
    select id into v_cust from public.customers
     where tenant_id = p_tenant and code = v_code and deleted_at is null;
    if v_cust is null then
      raise exception 'Customer "%" not found', v_code using errcode = 'CMS04';
    end if;
  end if;

  v_prod := nullif(btrim(coalesce(v_f->>'product_id','')),'')::uuid;
  v_code := nullif(btrim(coalesce(v_f->>'product_code','')),'');
  if v_prod is null and v_code is not null then
    select id into v_prod from public.products
     where tenant_id = p_tenant and code = v_code and deleted_at is null;
    if v_prod is null then
      raise exception 'Product "%" not found', v_code using errcode = 'CMS04';
    end if;
  end if;

  v_dest := nullif(btrim(coalesce(v_f->>'destination_id','')),'')::uuid;
  v_code := nullif(btrim(coalesce(v_f->>'destination_code','')),'');
  if v_dest is null and v_code is not null then
    select id into v_dest from public.destinations
     where tenant_id = p_tenant and code = v_code and deleted_at is null;
    if v_dest is null then
      raise exception 'Destination "%" not found', v_code using errcode = 'CMS04';
    end if;
  end if;

  v_branch := nullif(btrim(coalesce(v_f->>'branch_id','')),'')::uuid;
  v_code := nullif(btrim(coalesce(v_f->>'branch_code','')),'');
  if v_branch is null and v_code is not null then
    select id into v_branch from public.branches
     where tenant_id = p_tenant and code = v_code and deleted_at is null;
    if v_branch is null then
      raise exception 'Branch "%" not found', v_code using errcode = 'CMS04';
    end if;
  end if;

  v_zone := nullif(btrim(coalesce(v_f->>'zone_id','')),'')::uuid;
  v_code := nullif(btrim(coalesce(v_f->>'zone_code','')),'');
  if v_zone is null and v_code is not null then
    select id into v_zone from public.zones
     where tenant_id = p_tenant and code = v_code and deleted_at is null;
    if v_zone is null then
      raise exception 'Zone "%" not found', v_code using errcode = 'CMS04';
    end if;
  end if;

  return jsonb_build_object(
    'from_date', v_from,
    'to_date', v_to,
    'customer_id', v_cust,
    'product_id', v_prod,
    'destination_id', v_dest,
    'branch_id', v_branch,
    'zone_id', v_zone);
end
$$;

-- Candidate shipments matching filters (includes skip-eligible rows)
create or replace function app.rate_update_candidate_ids(
  p_tenant uuid,
  p_filters jsonb
)
returns table (shipment_id uuid, row_version integer, skip_reason text)
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_from date := (p_filters->>'from_date')::date;
  v_to date := (p_filters->>'to_date')::date;
  v_cust uuid := nullif(p_filters->>'customer_id','')::uuid;
  v_prod uuid := nullif(p_filters->>'product_id','')::uuid;
  v_dest uuid := nullif(p_filters->>'destination_id','')::uuid;
  v_branch uuid := nullif(p_filters->>'branch_id','')::uuid;
  v_zone uuid := nullif(p_filters->>'zone_id','')::uuid;
begin
  return query
  select
    s.id,
    s.row_version,
    case
      when s.is_locked then 'locked'
      when s.invoice_id is not null then 'invoiced'
      when s.current_status in ('CANCELLED','VOID') then 'cancelled'
      else null
    end as skip_reason
  from public.shipments s
  left join public.destinations d
    on d.id = s.destination_id and d.tenant_id = s.tenant_id
  where s.tenant_id = p_tenant
    and s.deleted_at is null
    and s.book_date between v_from and v_to
    and (v_cust is null or s.customer_id = v_cust)
    and (v_prod is null or s.product_id = v_prod)
    and (v_dest is null or s.destination_id = v_dest)
    and (v_branch is null or s.branch_id = v_branch)
    and (
      v_zone is null
      or d.zone_id = v_zone
      or exists (
        select 1 from public.zone_mappings zm
         where zm.tenant_id = p_tenant
           and zm.deleted_at is null
           and zm.zone_id = v_zone
           and (zm.origin_destination_id is null
                or zm.origin_destination_id is not distinct from s.origin_destination_id)
           and (zm.destination_id is null
                or zm.destination_id is not distinct from s.destination_id)
      )
    )
  order by s.book_date, s.awb_no
  limit 5000;
end
$$;

-- ---------------------------------------------------------------------------
-- create_rate_update_job
-- ---------------------------------------------------------------------------
create or replace function public.create_rate_update_job(
  p_update_type text default 'AWB_RATE',
  p_filters jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_type text := upper(nullif(btrim(coalesce(p_update_type,'AWB_RATE')),''));
  v_filters jsonb;
  v_job public.rate_update_jobs;
  v_total int;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  perform app.assert_rate_update_execute_permission(v_tenant);

  if v_type not in ('AWB_RATE','VENDOR_RATE','TAX_FUEL','OBC_RATE') then
    raise exception 'Unsupported update_type: %', v_type using errcode = 'CMS04';
  end if;

  v_filters := app.normalize_rate_update_filters(v_tenant, p_filters);

  select count(*)::int into v_total
    from app.rate_update_candidate_ids(v_tenant, v_filters);

  insert into public.rate_update_jobs (
    tenant_id, update_type, filters, status, progress,
    total_shipments, created_by)
  values (
    v_tenant, v_type, v_filters, 'QUEUED', 0, coalesce(v_total, 0), auth.uid())
  returning * into v_job;

  return jsonb_build_object(
    'id', v_job.id,
    'update_type', v_job.update_type,
    'status', v_job.status,
    'filters', v_job.filters,
    'total_shipments', v_job.total_shipments,
    'progress', v_job.progress,
    'created_at', v_job.created_at);
end
$$;

revoke all on function public.create_rate_update_job(text, jsonb) from public;
grant execute on function public.create_rate_update_job(text, jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- list / get / cancel
-- ---------------------------------------------------------------------------
create or replace function public.list_rate_update_jobs(
  p_status text default null,
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
  v_total bigint;
  v_rows jsonb;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  perform app.assert_rate_update_permission(v_tenant);

  if v_status is not null and v_status not in (
    'QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED'
  ) then
    raise exception 'Invalid status filter' using errcode = '22023';
  end if;

  v_offset := (v_page - 1) * v_size;

  select count(*) into v_total
    from public.rate_update_jobs j
   where j.tenant_id = v_tenant
     and (v_status is null or j.status = v_status);

  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
    into v_rows
    from (
      select
        j.id, j.update_type, j.filters, j.status, j.progress,
        j.total_shipments, j.processed_shipments, j.updated_shipments,
        j.skipped_shipments, j.failed_shipments, j.error_message,
        j.created_by, j.started_at, j.completed_at, j.created_at, j.updated_at
      from public.rate_update_jobs j
      where j.tenant_id = v_tenant
        and (v_status is null or j.status = v_status)
      order by j.created_at desc
      limit v_size offset v_offset
    ) t;

  return jsonb_build_object(
    'rows', v_rows, 'total', v_total, 'page', v_page, 'page_size', v_size);
end
$$;

revoke all on function public.list_rate_update_jobs(text, integer, integer) from public;
grant execute on function public.list_rate_update_jobs(text, integer, integer)
  to authenticated, service_role;

create or replace function public.get_rate_update_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_job public.rate_update_jobs;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  perform app.assert_rate_update_permission(v_tenant);

  select * into v_job from public.rate_update_jobs
   where id = p_job_id and tenant_id = v_tenant;
  if not found then
    raise exception 'Rate update job not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', v_job.id,
    'update_type', v_job.update_type,
    'filters', v_job.filters,
    'status', v_job.status,
    'progress', v_job.progress,
    'total_shipments', v_job.total_shipments,
    'processed_shipments', v_job.processed_shipments,
    'updated_shipments', v_job.updated_shipments,
    'skipped_shipments', v_job.skipped_shipments,
    'failed_shipments', v_job.failed_shipments,
    'error_message', v_job.error_message,
    'created_by', v_job.created_by,
    'started_at', v_job.started_at,
    'completed_at', v_job.completed_at,
    'created_at', v_job.created_at,
    'updated_at', v_job.updated_at);
end
$$;

revoke all on function public.get_rate_update_job(uuid) from public;
grant execute on function public.get_rate_update_job(uuid)
  to authenticated, service_role;

create or replace function public.cancel_rate_update_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_job public.rate_update_jobs;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  perform app.assert_rate_update_execute_permission(v_tenant);

  select * into v_job from public.rate_update_jobs
   where id = p_job_id and tenant_id = v_tenant
   for update;
  if not found then
    raise exception 'Rate update job not found' using errcode = 'P0002';
  end if;

  if v_job.status not in ('QUEUED','RUNNING') then
    raise exception 'Job cannot be cancelled in status %', v_job.status
      using errcode = 'CMS04';
  end if;

  update public.rate_update_jobs
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

revoke all on function public.cancel_rate_update_job(uuid) from public;
grant execute on function public.cancel_rate_update_job(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- execute_rate_update_job — manual; reuses app.run_shipment_rating
-- ---------------------------------------------------------------------------
create or replace function public.execute_rate_update_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_job public.rate_update_jobs;
  v_cand record;
  v_total int := 0;
  v_processed int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  v_failed int := 0;
  v_status text;
  v_err text;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  perform app.assert_rate_update_execute_permission(v_tenant);

  select * into v_job from public.rate_update_jobs
   where id = p_job_id and tenant_id = v_tenant
   for update;
  if not found then
    raise exception 'Rate update job not found' using errcode = 'P0002';
  end if;

  if v_job.status = 'CANCELLED' then
    raise exception 'Job is cancelled' using errcode = 'CMS04';
  end if;
  if v_job.status = 'COMPLETED' then
    raise exception 'Job already completed' using errcode = 'CMS04';
  end if;
  if v_job.status = 'RUNNING' then
    raise exception 'Job is already running' using errcode = 'CMS04';
  end if;
  if v_job.status not in ('QUEUED','FAILED') then
    raise exception 'Job cannot be executed in status %', v_job.status
      using errcode = 'CMS04';
  end if;

  select count(*)::int into v_total
    from app.rate_update_candidate_ids(v_tenant, v_job.filters);

  update public.rate_update_jobs
     set status = 'RUNNING',
         progress = 0,
         total_shipments = coalesce(v_total, 0),
         processed_shipments = 0,
         updated_shipments = 0,
         skipped_shipments = 0,
         failed_shipments = 0,
         error_message = null,
         started_at = coalesce(started_at, now()),
         completed_at = null,
         updated_at = now()
   where id = v_job.id;

  for v_cand in
    select * from app.rate_update_candidate_ids(v_tenant, v_job.filters)
  loop
    select status into v_status from public.rate_update_jobs where id = v_job.id;
    if v_status = 'CANCELLED' then
      return jsonb_build_object(
        'id', v_job.id,
        'status', 'CANCELLED',
        'processed_shipments', v_processed,
        'updated_shipments', v_updated,
        'skipped_shipments', v_skipped,
        'failed_shipments', v_failed);
    end if;

    v_processed := v_processed + 1;

    if v_cand.skip_reason is not null then
      v_skipped := v_skipped + 1;
    else
      begin
        -- Reuse rating engine exactly (assert + snapshot + rating_audit + audit_log).
        perform app.run_shipment_rating(v_cand.shipment_id, true);
        v_updated := v_updated + 1;
      exception
        when sqlstate 'CMS04' then
          -- locked/invoiced/cancelled race or rating reject → skip
          v_skipped := v_skipped + 1;
        when others then
          v_failed := v_failed + 1;
          v_err := left(SQLERRM, 500);
      end;
    end if;

    update public.rate_update_jobs
       set processed_shipments = v_processed,
           updated_shipments = v_updated,
           skipped_shipments = v_skipped,
           failed_shipments = v_failed,
           progress = case
             when v_total <= 0 then 100
             else least(99, ((v_processed * 100) / v_total))
           end,
           updated_at = now()
     where id = v_job.id;
  end loop;

  update public.rate_update_jobs
     set status = 'COMPLETED',
         progress = 100,
         processed_shipments = v_processed,
         updated_shipments = v_updated,
         skipped_shipments = v_skipped,
         failed_shipments = v_failed,
         error_message = v_err,
         completed_at = now(),
         updated_at = now()
   where id = v_job.id
     and status = 'RUNNING'
   returning * into v_job;

  if v_job.id is null then
    select * into v_job from public.rate_update_jobs where id = p_job_id;
  end if;

  perform app.write_audit_log(
    v_tenant, 'rate_update_jobs', 'MODIFY', v_job.id, 'utl.rate-update', null,
    jsonb_build_object(
      'update_type', v_job.update_type,
      'total', v_job.total_shipments,
      'updated', v_job.updated_shipments,
      'skipped', v_job.skipped_shipments,
      'failed', v_job.failed_shipments));

  return jsonb_build_object(
    'id', v_job.id,
    'status', v_job.status,
    'progress', v_job.progress,
    'total_shipments', v_job.total_shipments,
    'processed_shipments', v_job.processed_shipments,
    'updated_shipments', v_job.updated_shipments,
    'skipped_shipments', v_job.skipped_shipments,
    'failed_shipments', v_job.failed_shipments,
    'error_message', v_job.error_message,
    'completed_at', v_job.completed_at);
end
$$;

revoke all on function public.execute_rate_update_job(uuid) from public;
grant execute on function public.execute_rate_update_job(uuid)
  to authenticated, service_role;

comment on table public.rate_update_jobs is
  'Bulk rate recalculation jobs; execute via execute_rate_update_job (manual).';
comment on function public.create_rate_update_job(text, jsonb) is
  'Queue a rate update job with filter snapshot.';
comment on function public.execute_rate_update_job(uuid) is
  'Manually run rate update: skips locked/invoiced/cancelled; calls app.run_shipment_rating.';
