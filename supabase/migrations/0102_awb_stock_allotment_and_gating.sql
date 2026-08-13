-- ===========================================================================
-- 0102  branch awb stock allotment and validation
-- ---------------------------------------------------------------------------
-- Implements branch-level AWB series allotment and quota balance controls:
--   * public.branch_awb_allotments — series ranges, limits, used, and balances
--   * public.get_branch_awb_stock_summary — aggregates branch limit/used/balance
--   * public.validate_manual_awb — validates manual AWB range and uniqueness
-- ===========================================================================

create table if not exists public.branch_awb_allotments (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  branch_id      uuid not null references public.branches(id) on delete cascade,
  series_type    text not null default 'AUTO' check (series_type in ('AUTO', 'MANUAL')),
  prefix         text not null default '',
  start_no       bigint not null check (start_no >= 0),
  end_no         bigint not null check (end_no >= start_no),
  used_count     bigint not null default 0 check (used_count >= 0),
  status         text not null default 'ACTIVE' check (status in ('ACTIVE', 'EXHAUSTED', 'CLOSED')),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  created_by     uuid,
  updated_at     timestamptz not null default now(),
  updated_by     uuid,
  deleted_at     timestamptz,
  row_version    integer not null default 1,
  constraint branch_awb_allotments_tenant_id_uq unique (tenant_id, id),
  constraint branch_awb_allotments_range_check check (end_no >= start_no)
);

create index if not exists branch_awb_allotments_branch_idx
  on public.branch_awb_allotments (tenant_id, branch_id, series_type, status)
  where deleted_at is null;

select app.attach_master_triggers('branch_awb_allotments', 'mst.local-branch-master');
alter table public.branch_awb_allotments enable row level security;

drop policy if exists branch_awb_allotments_select on public.branch_awb_allotments;
create policy branch_awb_allotments_select on public.branch_awb_allotments
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());

drop policy if exists branch_awb_allotments_insert on public.branch_awb_allotments;
create policy branch_awb_allotments_insert on public.branch_awb_allotments
  for insert with check (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'mst.local-branch-master', 'add'));

drop policy if exists branch_awb_allotments_update on public.branch_awb_allotments;
create policy branch_awb_allotments_update on public.branch_awb_allotments
  for update using (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'mst.local-branch-master', 'modify'));

-- ---------------------------------------------------------------------------
-- Seed default active AWB allotments for all existing branches (range: 100000-999999)
-- ---------------------------------------------------------------------------
insert into public.branch_awb_allotments (tenant_id, branch_id, series_type, prefix, start_no, end_no, used_count, status)
select
  b.tenant_id,
  b.id as branch_id,
  'AUTO' as series_type,
  coalesce(b.code, '') as prefix,
  100001 as start_no,
  999999 as end_no,
  (
    select count(*)
    from public.shipments s
    where s.tenant_id = b.tenant_id
      and s.branch_id = b.id
      and s.deleted_at is null
  ) as used_count,
  'ACTIVE' as status
from public.branches b
where b.deleted_at is null
on conflict do nothing;

insert into public.branch_awb_allotments (tenant_id, branch_id, series_type, prefix, start_no, end_no, used_count, status)
select
  b.tenant_id,
  b.id as branch_id,
  'MANUAL' as series_type,
  'M' || coalesce(b.code, '') as prefix,
  500001 as start_no,
  899999 as end_no,
  0 as used_count,
  'ACTIVE' as status
from public.branches b
where b.deleted_at is null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- public.get_branch_awb_stock_summary(p_branch_id uuid)
-- ---------------------------------------------------------------------------
create or replace function public.get_branch_awb_stock_summary(p_branch_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant       uuid;
  v_branch       uuid := p_branch_id;
  v_branch_code  text := 'HYD';
  v_limit        bigint := 0;
  v_used         bigint := 0;
  v_balance      bigint := 0;
  v_loc_balance  bigint := 0;
  v_auto_start   bigint := 0;
  v_auto_end     bigint := 0;
  v_manual_start bigint := 0;
  v_manual_end   bigint := 0;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  if v_branch is null then
    select b.id, b.code into v_branch, v_branch_code
    from public.branches b
    where b.tenant_id = v_tenant and b.deleted_at is null
    order by b.is_head_office desc, b.code asc limit 1;
  else
    select b.code into v_branch_code
    from public.branches b
    where b.id = v_branch and b.tenant_id = v_tenant and b.deleted_at is null;
  end if;

  -- Compute Auto series metrics
  select
    coalesce(sum(a.end_no - a.start_no + 1), 0),
    coalesce(sum(a.used_count), 0),
    coalesce(min(a.start_no), 0),
    coalesce(max(a.end_no), 0)
  into v_limit, v_used, v_auto_start, v_auto_end
  from public.branch_awb_allotments a
  where a.tenant_id = v_tenant
    and a.branch_id = v_branch
    and a.series_type = 'AUTO'
    and a.deleted_at is null
    and a.is_active = true;

  if v_limit = 0 then
    v_limit := 50000;
    v_used := (
      select count(*)
      from public.shipments s
      where s.tenant_id = v_tenant and s.branch_id = v_branch and s.deleted_at is null
    );
  end if;

  v_balance := greatest(0, v_limit - v_used);
  v_loc_balance := v_balance;

  -- Manual series bounds
  select
    coalesce(min(a.start_no), 0),
    coalesce(max(a.end_no), 0)
  into v_manual_start, v_manual_end
  from public.branch_awb_allotments a
  where a.tenant_id = v_tenant
    and a.branch_id = v_branch
    and a.series_type = 'MANUAL'
    and a.deleted_at is null
    and a.is_active = true;

  return jsonb_build_object(
    'branch_id', v_branch,
    'branch_code', coalesce(v_branch_code, 'HYD'),
    'limit', v_limit,
    'used', v_used,
    'balance', v_balance,
    'location_balance', v_loc_balance,
    'auto_start', v_auto_start,
    'auto_end', v_auto_end,
    'manual_start', v_manual_start,
    'manual_end', v_manual_end,
    'is_exhausted', (v_balance <= 0)
  );
end;
$$;

revoke all on function public.get_branch_awb_stock_summary(uuid) from public;
grant execute on function public.get_branch_awb_stock_summary(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- public.validate_manual_awb(p_branch_id uuid, p_awb_no text)
-- ---------------------------------------------------------------------------
create or replace function public.validate_manual_awb(
  p_branch_id uuid,
  p_awb_no    text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant     uuid;
  v_clean_awb  text := trim(p_awb_no);
  v_numeric_no bigint;
  v_allotment  public.branch_awb_allotments%rowtype;
  v_exists     boolean;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  if v_clean_awb is null or v_clean_awb = '' then
    return jsonb_build_object(
      'valid', false,
      'message', 'AWB Number is required'
    );
  end if;

  -- 1. Check uniqueness: AWB cannot be used in any active shipment
  select exists (
    select 1
    from public.shipments s
    where s.tenant_id = v_tenant
      and upper(s.awb_no) = upper(v_clean_awb)
      and s.deleted_at is null
  ) into v_exists;

  if v_exists then
    return jsonb_build_object(
      'valid', false,
      'message', 'AWB ' || v_clean_awb || ' is already used by an existing shipment'
    );
  end if;

  -- 2. Extract numeric portion if possible
  begin
    v_numeric_no := regexp_replace(v_clean_awb, '\D', '', 'g')::bigint;
  exception when others then
    v_numeric_no := null;
  end;

  -- 3. Check against branch allotments if active manual series exists
  if v_numeric_no is not null and p_branch_id is not null then
    select * into v_allotment
    from public.branch_awb_allotments a
    where a.tenant_id = v_tenant
      and a.branch_id = p_branch_id
      and a.is_active = true
      and a.deleted_at is null
      and v_numeric_no between a.start_no and a.end_no
    order by case when a.series_type = 'MANUAL' then 0 else 1 end
    limit 1;

    if v_allotment.id is null and exists (
      select 1 from public.branch_awb_allotments a
      where a.tenant_id = v_tenant and a.branch_id = p_branch_id and a.is_active = true and a.deleted_at is null
    ) then
      return jsonb_build_object(
        'valid', false,
        'message', 'Manual AWB ' || v_clean_awb || ' falls outside the branch allotted series'
      );
    end if;

    if v_allotment.id is not null and v_allotment.status = 'EXHAUSTED' then
      return jsonb_build_object(
        'valid', false,
        'message', 'The allotted series range for this branch is exhausted'
      );
    end if;
  end if;

  return jsonb_build_object(
    'valid', true,
    'awb_no', v_clean_awb,
    'message', 'AWB ' || v_clean_awb || ' is available for manual booking'
  );
end;
$$;

revoke all on function public.validate_manual_awb(uuid, text) from public;
grant execute on function public.validate_manual_awb(uuid, text) to authenticated, service_role;
