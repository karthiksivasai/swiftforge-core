-- ===========================================================================
-- 0047  dashboard & materialized rollups — Phase 5 Milestone 5F
-- ---------------------------------------------------------------------------
-- daily_branch_stats / daily_customer_stats + manual refresh + KPI RPCs.
-- No cron, queues, exports, or PDF/Excel.
-- Source tables: shipments, pickups, manifests, drs, pod_records,
--                receipts, expense_entries, customer_payments (+ customers/vendors counts)
-- Permissions: txn.opertation-dashboard / txn.sales-dashboard (list|search)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- daily_branch_stats
-- ---------------------------------------------------------------------------
create table if not exists public.daily_branch_stats (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  branch_id           uuid, -- null = tenant-wide unassigned branch bucket
  stat_date           date not null,
  bookings            integer not null default 0,
  pickups             integer not null default 0,
  pickups_pending     integer not null default 0,
  in_transit          integer not null default 0,
  delivered           integer not null default 0,
  pods                integer not null default 0,
  manifests           integer not null default 0,
  drs_count           integer not null default 0,
  revenue             numeric(14,2) not null default 0,
  expenses            numeric(14,2) not null default 0,
  receipts_count      integer not null default 0,
  pending_payments    integer not null default 0,
  refreshed_at        timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
-- COALESCE expression so NULL branch is one bucket per date (PG14-compatible).
create unique index if not exists daily_branch_stats_tenant_branch_date_uq
  on public.daily_branch_stats (
    tenant_id,
    (coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    stat_date
  );
create index if not exists daily_branch_stats_tenant_date_idx
  on public.daily_branch_stats (tenant_id, stat_date);
create index if not exists daily_branch_stats_branch_idx
  on public.daily_branch_stats (tenant_id, branch_id, stat_date);

alter table public.daily_branch_stats enable row level security;
drop policy if exists daily_branch_stats_select on public.daily_branch_stats;
create policy daily_branch_stats_select on public.daily_branch_stats
  for select using (
    tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin()
  );

-- ---------------------------------------------------------------------------
-- daily_customer_stats
-- ---------------------------------------------------------------------------
create table if not exists public.daily_customer_stats (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  customer_id         uuid not null,
  stat_date           date not null,
  bookings            integer not null default 0,
  delivered           integer not null default 0,
  revenue             numeric(14,2) not null default 0,
  receipts_count      integer not null default 0,
  payments_count      integer not null default 0,
  payments_amount     numeric(14,2) not null default 0,
  refreshed_at        timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint daily_customer_stats_tenant_cust_date_uq
    unique (tenant_id, customer_id, stat_date),
  constraint daily_customer_stats_customer_fk
    foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete cascade
);
create index if not exists daily_customer_stats_tenant_date_idx
  on public.daily_customer_stats (tenant_id, stat_date);
create index if not exists daily_customer_stats_customer_idx
  on public.daily_customer_stats (tenant_id, customer_id, stat_date);

alter table public.daily_customer_stats enable row level security;
drop policy if exists daily_customer_stats_select on public.daily_customer_stats;
create policy daily_customer_stats_select on public.daily_customer_stats
  for select using (
    tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin()
  );

-- ---------------------------------------------------------------------------
-- Permission helper
-- ---------------------------------------------------------------------------
create or replace function app.assert_dashboard_permission(p_tenant uuid)
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
  if app.user_has_permission(p_tenant, 'txn.opertation-dashboard', 'list')
     or app.user_has_permission(p_tenant, 'txn.opertation-dashboard', 'search')
     or app.user_has_permission(p_tenant, 'txn.sales-dashboard', 'list')
     or app.user_has_permission(p_tenant, 'txn.sales-dashboard', 'search') then
    return;
  end if;
  raise exception 'Permission denied: dashboard' using errcode = '42501';
end
$$;

-- ---------------------------------------------------------------------------
-- Refresh branch rollup for one date
-- ---------------------------------------------------------------------------
create or replace function app.refresh_daily_branch_stats_for_date(
  p_tenant uuid,
  p_date date
)
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_rows integer := 0;
begin
  -- Replace-day semantics (avoids NULL unique / ON CONFLICT edge cases on PG14).
  delete from public.daily_branch_stats
   where tenant_id = p_tenant and stat_date = p_date;

  with branch_keys as (
    select distinct s.branch_id as branch_id
      from public.shipments s
     where s.tenant_id = p_tenant and s.deleted_at is null and s.book_date = p_date
    union
    select distinct p.branch_id
      from public.pickups p
     where p.tenant_id = p_tenant and p.deleted_at is null and p.pickup_date = p_date
    union
    select distinct m.origin_branch_id
      from public.manifests m
     where m.tenant_id = p_tenant and m.deleted_at is null and m.manifest_date = p_date
    union
    select distinct d.branch_id
      from public.drs d
     where d.tenant_id = p_tenant and d.deleted_at is null and d.drs_date = p_date
    union
    select distinct r.branch_id
      from public.receipts r
     where r.tenant_id = p_tenant and r.deleted_at is null and r.receipt_date = p_date
    union
    select distinct e.branch_id
      from public.expense_entries e
     where e.tenant_id = p_tenant and e.deleted_at is null and e.entry_date = p_date
  ),
  calc as (
    select
      bk.branch_id,
      (select count(*)::int from public.shipments s
        where s.tenant_id = p_tenant and s.deleted_at is null and s.book_date = p_date
          and s.branch_id is not distinct from bk.branch_id) as bookings,
      (select count(*)::int from public.pickups p
        where p.tenant_id = p_tenant and p.deleted_at is null and p.pickup_date = p_date
          and p.branch_id is not distinct from bk.branch_id) as pickups,
      (select count(*)::int from public.pickups p
        where p.tenant_id = p_tenant and p.deleted_at is null and p.pickup_date = p_date
          and p.branch_id is not distinct from bk.branch_id
          and p.status in ('OPEN','ASSIGNED')) as pickups_pending,
      (select count(*)::int from public.shipments s
        where s.tenant_id = p_tenant and s.deleted_at is null
          and s.branch_id is not distinct from bk.branch_id
          and s.book_date <= p_date
          and s.current_status in (
            'BOOKED','PICKUP_INSCANNED','BAGGED','MANIFESTED','MANIFEST_INSCANNED',
            'IN_TRANSIT','RECEIVED_AT_HUB','ON_DRS','OUT_FOR_DELIVERY','MISROUTED'
          )) as in_transit,
      (select count(*)::int from public.shipments s
        where s.tenant_id = p_tenant and s.deleted_at is null
          and s.branch_id is not distinct from bk.branch_id
          and s.current_status in ('DELIVERED','DELIVERED_PENDING_POD')
          and coalesce(s.delivered_at::date, s.status_at::date, s.book_date) = p_date
      ) as delivered,
      (select count(*)::int from public.pod_records pod
        join public.shipments s on s.id = pod.shipment_id and s.tenant_id = pod.tenant_id
        where pod.tenant_id = p_tenant and pod.deleted_at is null and pod.pod_date = p_date
          and s.branch_id is not distinct from bk.branch_id) as pods,
      (select count(*)::int from public.manifests m
        where m.tenant_id = p_tenant and m.deleted_at is null and m.manifest_date = p_date
          and m.origin_branch_id is not distinct from bk.branch_id) as manifests,
      (select count(*)::int from public.drs d
        where d.tenant_id = p_tenant and d.deleted_at is null and d.drs_date = p_date
          and d.branch_id is not distinct from bk.branch_id) as drs_count,
      (select coalesce(sum(r.amount),0) from public.receipts r
        where r.tenant_id = p_tenant and r.deleted_at is null and r.receipt_date = p_date
          and r.branch_id is not distinct from bk.branch_id
          and r.status = 'POSTED') as revenue,
      (select coalesce(sum(e.amount),0) from public.expense_entries e
        where e.tenant_id = p_tenant and e.deleted_at is null and e.entry_date = p_date
          and e.branch_id is not distinct from bk.branch_id) as expenses,
      (select count(*)::int from public.receipts r
        where r.tenant_id = p_tenant and r.deleted_at is null and r.receipt_date = p_date
          and r.branch_id is not distinct from bk.branch_id) as receipts_count,
      (select count(*)::int from public.customer_payments cp
        where cp.tenant_id = p_tenant and cp.deleted_at is null
          and cp.declared_date = p_date and cp.status = 'PENDING') as pending_payments
    from branch_keys bk
  )
  insert into public.daily_branch_stats (
    tenant_id, branch_id, stat_date,
    bookings, pickups, pickups_pending, in_transit, delivered, pods,
    manifests, drs_count, revenue, expenses, receipts_count, pending_payments,
    refreshed_at, updated_at)
  select
    p_tenant, c.branch_id, p_date,
    c.bookings, c.pickups, c.pickups_pending, c.in_transit, c.delivered, c.pods,
    c.manifests, c.drs_count, c.revenue, c.expenses, c.receipts_count, c.pending_payments,
    now(), now()
  from calc c;

  get diagnostics v_rows = row_count;
  return coalesce(v_rows, 0);
end
$$;

-- ---------------------------------------------------------------------------
-- Refresh customer rollup for one date
-- ---------------------------------------------------------------------------
create or replace function app.refresh_daily_customer_stats_for_date(
  p_tenant uuid,
  p_date date
)
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_rows integer := 0;
begin
  delete from public.daily_customer_stats
   where tenant_id = p_tenant and stat_date = p_date;

  with cust_keys as (
    select distinct s.customer_id
      from public.shipments s
     where s.tenant_id = p_tenant and s.deleted_at is null
       and s.book_date = p_date and s.customer_id is not null
    union
    select distinct r.customer_id
      from public.receipts r
     where r.tenant_id = p_tenant and r.deleted_at is null
       and r.receipt_date = p_date
    union
    select distinct cp.customer_id
      from public.customer_payments cp
     where cp.tenant_id = p_tenant and cp.deleted_at is null
       and cp.declared_date = p_date
  ),
  calc as (
    select
      ck.customer_id,
      (select count(*)::int from public.shipments s
        where s.tenant_id = p_tenant and s.deleted_at is null
          and s.book_date = p_date and s.customer_id = ck.customer_id) as bookings,
      (select count(*)::int from public.shipments s
        where s.tenant_id = p_tenant and s.deleted_at is null
          and s.customer_id = ck.customer_id
          and s.current_status in ('DELIVERED','DELIVERED_PENDING_POD')
          and coalesce(s.delivered_at::date, s.status_at::date, s.book_date) = p_date
      ) as delivered,
      (select coalesce(sum(r.amount),0) from public.receipts r
        where r.tenant_id = p_tenant and r.deleted_at is null
          and r.receipt_date = p_date and r.customer_id = ck.customer_id
          and r.status = 'POSTED') as revenue,
      (select count(*)::int from public.receipts r
        where r.tenant_id = p_tenant and r.deleted_at is null
          and r.receipt_date = p_date and r.customer_id = ck.customer_id) as receipts_count,
      (select count(*)::int from public.customer_payments cp
        where cp.tenant_id = p_tenant and cp.deleted_at is null
          and cp.declared_date = p_date and cp.customer_id = ck.customer_id) as payments_count,
      (select coalesce(sum(cp.amount),0) from public.customer_payments cp
        where cp.tenant_id = p_tenant and cp.deleted_at is null
          and cp.declared_date = p_date and cp.customer_id = ck.customer_id) as payments_amount
    from cust_keys ck
  )
  insert into public.daily_customer_stats (
    tenant_id, customer_id, stat_date,
    bookings, delivered, revenue, receipts_count, payments_count, payments_amount,
    refreshed_at, updated_at)
  select
    p_tenant, c.customer_id, p_date,
    c.bookings, c.delivered, c.revenue, c.receipts_count, c.payments_count, c.payments_amount,
    now(), now()
  from calc c;

  get diagnostics v_rows = row_count;
  return coalesce(v_rows, 0);
end
$$;

-- ---------------------------------------------------------------------------
-- Public: manual refresh
-- ---------------------------------------------------------------------------
create or replace function public.refresh_dashboard_rollups(
  p_from date default null,
  p_to date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_from date := coalesce(p_from, current_date);
  v_to date := coalesce(p_to, current_date);
  v_d date;
  v_branch_rows integer := 0;
  v_cust_rows integer := 0;
  v_b integer;
  v_c integer;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  perform app.assert_dashboard_permission(v_tenant);

  if v_to < v_from then
    raise exception 'Invalid date range' using errcode = '22023';
  end if;
  if (v_to - v_from) > 62 then
    raise exception 'Refresh range cannot exceed 62 days' using errcode = 'CMS04';
  end if;

  v_d := v_from;
  while v_d <= v_to loop
    v_b := app.refresh_daily_branch_stats_for_date(v_tenant, v_d);
    v_c := app.refresh_daily_customer_stats_for_date(v_tenant, v_d);
    v_branch_rows := v_branch_rows + v_b;
    v_cust_rows := v_cust_rows + v_c;
    v_d := v_d + 1;
  end loop;

  return jsonb_build_object(
    'from_date', v_from,
    'to_date', v_to,
    'branch_rows_touched', v_branch_rows,
    'customer_rows_touched', v_cust_rows,
    'refreshed_at', now());
end
$$;

revoke all on function public.refresh_dashboard_rollups(date, date) from public;
grant execute on function public.refresh_dashboard_rollups(date, date)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Live KPI summary (pending metrics from source tables; today counts live)
-- ---------------------------------------------------------------------------
create or replace function public.get_dashboard_summary(
  p_date date default null,
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_date date := coalesce(p_date, current_date);
  v_ops jsonb;
  v_fin jsonb;
  v_cust jsonb;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  perform app.assert_dashboard_permission(v_tenant);

  select jsonb_build_object(
    'shipments_today', (
      select count(*)::int from public.shipments s
       where s.tenant_id = v_tenant and s.deleted_at is null and s.book_date = v_date
         and (p_branch_id is null or s.branch_id = p_branch_id)),
    'pickups_today', (
      select count(*)::int from public.pickups p
       where p.tenant_id = v_tenant and p.deleted_at is null and p.pickup_date = v_date
         and (p_branch_id is null or p.branch_id = p_branch_id)),
    'deliveries_today', (
      select count(*)::int from public.shipments s
       where s.tenant_id = v_tenant and s.deleted_at is null
         and s.current_status in ('DELIVERED','DELIVERED_PENDING_POD')
         and coalesce(s.delivered_at::date, s.status_at::date, s.book_date) = v_date
         and (p_branch_id is null or s.branch_id = p_branch_id)),
    'pods_today', (
      select count(*)::int from public.pod_records pod
       join public.shipments s on s.id = pod.shipment_id and s.tenant_id = pod.tenant_id
       where pod.tenant_id = v_tenant and pod.deleted_at is null and pod.pod_date = v_date
         and (p_branch_id is null or s.branch_id = p_branch_id)),
    'pending_drs', (
      select count(*)::int from public.drs d
       where d.tenant_id = v_tenant and d.deleted_at is null and d.status = 'DRAFT'
         and (p_branch_id is null or d.branch_id = p_branch_id)),
    'pending_manifest', (
      select count(*)::int from public.manifests m
       where m.tenant_id = v_tenant and m.deleted_at is null and m.status = 'DRAFT'
         and (p_branch_id is null or m.origin_branch_id = p_branch_id)),
    'pending_pickup', (
      select count(*)::int from public.pickups p
       where p.tenant_id = v_tenant and p.deleted_at is null
         and p.status in ('OPEN','ASSIGNED')
         and (p_branch_id is null or p.branch_id = p_branch_id)),
    'active_shipments', (
      select count(*)::int from public.shipments s
       where s.tenant_id = v_tenant and s.deleted_at is null
         and s.current_status not in (
           'DELIVERED','CANCELLED','VOID','RTO_DELIVERED','DRAFT')
         and (p_branch_id is null or s.branch_id = p_branch_id))
  ) into v_ops;

  select jsonb_build_object(
    'receipts_today', (
      select count(*)::int from public.receipts r
       where r.tenant_id = v_tenant and r.deleted_at is null and r.receipt_date = v_date
         and (p_branch_id is null or r.branch_id = p_branch_id)),
    'receipts_amount_today', (
      select coalesce(sum(r.amount),0) from public.receipts r
       where r.tenant_id = v_tenant and r.deleted_at is null and r.receipt_date = v_date
         and r.status = 'POSTED'
         and (p_branch_id is null or r.branch_id = p_branch_id)),
    'expenses_today', (
      select count(*)::int from public.expense_entries e
       where e.tenant_id = v_tenant and e.deleted_at is null and e.entry_date = v_date
         and (p_branch_id is null or e.branch_id = p_branch_id)),
    'expenses_amount_today', (
      select coalesce(sum(e.amount),0) from public.expense_entries e
       where e.tenant_id = v_tenant and e.deleted_at is null and e.entry_date = v_date
         and (p_branch_id is null or e.branch_id = p_branch_id)),
    'pending_customer_payments', (
      select count(*)::int from public.customer_payments cp
       where cp.tenant_id = v_tenant and cp.deleted_at is null and cp.status = 'PENDING')
  ) into v_fin;

  select jsonb_build_object(
    'active_customers', (
      select count(*)::int from public.customers c
       where c.tenant_id = v_tenant and c.deleted_at is null and c.status = 'ACTIVE'),
    'active_vendors', (
      select count(*)::int from public.vendors v
       where v.tenant_id = v_tenant and v.deleted_at is null and v.status = 'ACTIVE')
  ) into v_cust;

  return jsonb_build_object(
    'date', v_date,
    'branch_id', p_branch_id,
    'operations', v_ops,
    'finance', v_fin,
    'customers', v_cust,
    'generated_at', now());
end
$$;

revoke all on function public.get_dashboard_summary(date, uuid) from public;
grant execute on function public.get_dashboard_summary(date, uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Operations series from rollups (manual refresh required first)
-- ---------------------------------------------------------------------------
create or replace function public.get_dashboard_operations_series(
  p_from date default null,
  p_to date default null,
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_from date := coalesce(p_from, current_date - 13);
  v_to date := coalesce(p_to, current_date);
  v_out jsonb;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  perform app.assert_dashboard_permission(v_tenant);

  if v_to < v_from then
    raise exception 'Invalid date range' using errcode = '22023';
  end if;
  if (v_to - v_from) > 62 then
    raise exception 'Series range cannot exceed 62 days' using errcode = 'CMS04';
  end if;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.stat_date), '[]'::jsonb)
    into v_out
    from (
      select
        d.stat_date,
        sum(d.bookings)::int as bookings,
        sum(d.pickups)::int as pickups,
        sum(d.delivered)::int as delivered,
        sum(d.pods)::int as pods,
        sum(d.revenue) as revenue,
        sum(d.in_transit)::int as in_transit
      from public.daily_branch_stats d
      where d.tenant_id = v_tenant
        and d.stat_date between v_from and v_to
        and (p_branch_id is null or d.branch_id = p_branch_id)
      group by d.stat_date
    ) t;

  return jsonb_build_object(
    'from_date', v_from,
    'to_date', v_to,
    'branch_id', p_branch_id,
    'series', v_out);
end
$$;

revoke all on function public.get_dashboard_operations_series(date, date, uuid) from public;
grant execute on function public.get_dashboard_operations_series(date, date, uuid)
  to authenticated, service_role;

comment on function public.refresh_dashboard_rollups(date, date) is
  'Manual refresh of daily_branch_stats and daily_customer_stats for a date range.';
comment on function public.get_dashboard_summary(date, uuid) is
  'Live dashboard KPI snapshot (operations / finance / customers).';
comment on function public.get_dashboard_operations_series(date, date, uuid) is
  'Operations time series from daily_branch_stats rollups.';
