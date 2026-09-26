-- Bagging operations: shared list filter, exact page counts, service center
-- on the list, an event history RPC, and a distinct progress reversal scan.
-- Delete Progress still does not remove the earlier event.

create or replace function app.bagging_visible_manifests(
  p_tenant        uuid,
  p_product_code  text,
  p_vendor_code   text,
  p_search        text,
  p_from_date     date,
  p_to_date       date,
  p_status        text
)
returns setof public.bagging_manifests
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_pat text := '%' || replace(replace(coalesce(btrim(p_search), ''), '%', '\%'), '_', '\_') || '%';
begin
  if p_tenant is null then
    return;
  end if;

  return query
  select bm.*
  from public.bagging_manifests bm
  where bm.tenant_id = p_tenant
    and bm.deleted_at is null
    and app.manifest_visible_and_audit(
      bm.tenant_id, bm.id, bm.service_center_id, bm.destination_branch_id, bm.is_handover, 'bagging_manifests'
    )
    and (p_vendor_code is null or btrim(p_vendor_code) = '' or upper(bm.vendor_code) = upper(btrim(p_vendor_code)))
    and (p_from_date is null or bm.manifest_date >= p_from_date)
    and (p_to_date is null or bm.manifest_date <= p_to_date)
    and (p_status is null or btrim(p_status) = '' or upper(bm.status) = upper(btrim(p_status)))
    and (
      p_product_code is null or btrim(p_product_code) = ''
      or exists (
        select 1
        from public.bagging_awb_lines bal
        join public.shipments s
          on s.id = bal.shipment_id
         and s.tenant_id = bal.tenant_id
         and s.deleted_at is null
        join public.products pr
          on pr.id = s.product_id
         and pr.tenant_id = s.tenant_id
         and pr.deleted_at is null
        where bal.bagging_id = bm.id
          and bal.tenant_id = bm.tenant_id
          and bal.deleted_at is null
          and upper(pr.code) = upper(btrim(p_product_code))
      )
    )
    and (p_search is null or btrim(p_search) = '' or (
      bm.manifest_no ilike v_pat or
      bm.mawb_master_no ilike v_pat or
      bm.origin_city_code ilike v_pat or
      bm.dest_city_code ilike v_pat or
      bm.vendor_name ilike v_pat or
      bm.service_center_code ilike v_pat or
      bm.service_center_name ilike v_pat or
      exists (
        select 1
        from public.bagging_awb_lines bal
        where bal.bagging_id = bm.id
          and bal.tenant_id = bm.tenant_id
          and bal.deleted_at is null
          and (bal.bag_no ilike v_pat or bal.awb_no ilike v_pat)
      )
    ));
end;
$$;

revoke all on function app.bagging_visible_manifests(uuid, text, text, text, date, date, text) from public;

drop function if exists public.list_baggings(text, text, text, integer, integer, date, date, text);

create function public.list_baggings(
  p_product_code  text default null,
  p_vendor_code   text default null,
  p_search        text default null,
  p_limit         integer default 50,
  p_offset        integer default 0,
  p_from_date     date default null,
  p_to_date       date default null,
  p_status        text default null
)
returns table (
  id              uuid,
  manifest_no     text,
  master_awb_no   text,
  manifest_date   date,
  origin          text,
  from_city       text,
  to_city         text,
  destination     text,
  vendor_name     text,
  vendor_code     text,
  total_awbs      integer,
  total_weight    numeric,
  total_bags      integer,
  status          text,
  created_at      timestamptz,
  service_center  text
)
language plpgsql
volatile
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
begin
  if v_tenant is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if not app.user_has_permission(v_tenant, 'txn.bagging', 'list')
     and not app.user_has_permission(v_tenant, 'txn.bagging', 'search') then
    raise exception 'Bagging permission is required' using errcode = '42501';
  end if;

  return query
  select
    bm.id,
    bm.manifest_no,
    coalesce(
      nullif(btrim(concat(bm.master_airlines_prefix, bm.master_awb_no_part, bm.master_no_part3)), ''),
      bm.mawb_master_no,
      ''
    ) as master_awb_no,
    bm.manifest_date,
    coalesce(bm.origin_city_code, bm.origin_city_name, '') as origin,
    coalesce(bm.origin_city_code, bm.origin_city_name, '') as from_city,
    coalesce(bm.dest_city_code, bm.dest_city_name, '') as to_city,
    coalesce(bm.dest_city_code, bm.dest_city_name, '') as destination,
    coalesce(bm.vendor_name, bm.vendor_code, '') as vendor_name,
    coalesce(bm.vendor_code, '') as vendor_code,
    bm.total_awbs,
    bm.total_weight,
    bm.total_bags,
    bm.status,
    bm.created_at,
    coalesce(bm.service_center_code, bm.service_center_name, '') as service_center
  from app.bagging_visible_manifests(
    v_tenant, p_product_code, p_vendor_code, p_search, p_from_date, p_to_date, p_status
  ) bm
  order by bm.manifest_date desc, bm.created_at desc, bm.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 500)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.list_baggings(text, text, text, integer, integer, date, date, text) from public;
grant execute on function public.list_baggings(text, text, text, integer, integer, date, date, text) to authenticated, service_role;

create or replace function public.count_baggings(
  p_product_code  text default null,
  p_vendor_code   text default null,
  p_search        text default null,
  p_from_date     date default null,
  p_to_date       date default null,
  p_status        text default null
)
returns bigint
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_count  bigint;
begin
  if v_tenant is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if not app.user_has_permission(v_tenant, 'txn.bagging', 'list')
     and not app.user_has_permission(v_tenant, 'txn.bagging', 'search') then
    raise exception 'Bagging permission is required' using errcode = '42501';
  end if;

  select count(*) into v_count
  from app.bagging_visible_manifests(
    v_tenant, p_product_code, p_vendor_code, p_search, p_from_date, p_to_date, p_status
  );
  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.count_baggings(text, text, text, date, date, text) from public;
grant execute on function public.count_baggings(text, text, text, date, date, text) to authenticated, service_role;

create or replace function public.list_bagging_events(p_bagging_id uuid)
returns table (
  id          uuid,
  event_type  text,
  event_text  text,
  created_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_header public.bagging_manifests%rowtype;
begin
  if v_tenant is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if not app.user_has_permission(v_tenant, 'txn.bagging', 'list')
     and not app.user_has_permission(v_tenant, 'txn.bagging', 'search') then
    raise exception 'Bagging permission is required' using errcode = '42501';
  end if;

  select * into v_header
  from public.bagging_manifests
  where id = p_bagging_id
    and tenant_id = v_tenant
    and deleted_at is null;

  if v_header.id is null then
    return;
  end if;

  if not app.manifest_visible_and_audit(
    v_header.tenant_id, v_header.id, v_header.service_center_id,
    v_header.destination_branch_id, v_header.is_handover, 'bagging_manifests'
  ) then
    return;
  end if;

  return query
  select e.id, e.event_type, e.event_text, e.created_at
  from public.bagging_events e
  where e.tenant_id = v_tenant
    and e.bagging_id = p_bagging_id
  order by e.created_at desc
  limit 200;
end;
$$;

revoke all on function public.list_bagging_events(uuid) from public;
grant execute on function public.list_bagging_events(uuid) to authenticated, service_role;

create or replace function public.record_bagging_progress(
  p_bagging_id          uuid,
  p_bag_no              text,
  p_progress_date       date,
  p_progress_time       text,
  p_service_center_code text,
  p_exception_code      text,
  p_mode                text default 'add'
)
returns boolean
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant   uuid := app.current_tenant_id();
  v_user     uuid := auth.uid();
  v_manifest public.bagging_manifests%rowtype;
  v_delete   boolean := lower(coalesce(p_mode, 'add')) = 'delete';
  v_action   text := case when v_delete then 'Progress Deleted' else 'Progress Added' end;
  v_line     record;
begin
  if v_tenant is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if not app.user_has_permission(v_tenant, 'txn.bagging', 'modify') then
    raise exception 'Bagging permission is required' using errcode = '42501';
  end if;

  select * into v_manifest
  from public.bagging_manifests
  where id = p_bagging_id and tenant_id = v_tenant and deleted_at is null;

  if v_manifest.id is null then
    raise exception 'Bagging manifest not found';
  end if;

  insert into public.bagging_events (
    tenant_id, bagging_id, manifest_no, event_type, event_text, payload, created_by
  ) values (
    v_tenant,
    v_manifest.id,
    v_manifest.manifest_no,
    case when v_delete then 'PROGRESS_DELETED' else 'PROGRESS_RECORDED' end,
    format('%s: %s at %s (%s)', v_action, coalesce(p_exception_code, 'PROGRESS'), p_service_center_code, coalesce(p_bag_no, 'All Bags')),
    jsonb_build_object(
      'bag_no', p_bag_no,
      'date', p_progress_date,
      'time', p_progress_time,
      'service_center', p_service_center_code,
      'exception', p_exception_code,
      'mode', p_mode
    ),
    v_user
  );

  for v_line in
    select awb_no, shipment_id
    from public.bagging_awb_lines
    where bagging_id = p_bagging_id
      and tenant_id = v_tenant
      and deleted_at is null
      and (p_bag_no is null or btrim(p_bag_no) = '' or bag_no = btrim(p_bag_no))
  loop
    if v_line.shipment_id is not null then
      insert into public.shipment_scan_events (
        tenant_id, shipment_id, awb_no, event_type, event_text, payload, created_by, updated_by
      ) values (
        v_tenant,
        v_line.shipment_id,
        v_line.awb_no,
        case when v_delete then 'BAGGING_PROGRESS_REVERSED' else 'BAGGING_PROGRESS' end,
        case
          when v_delete then format('Bagging progress reversed at %s', p_service_center_code)
          else format('Bagging progress: %s at %s', coalesce(p_exception_code, 'IN_TRANSIT'), p_service_center_code)
        end,
        jsonb_build_object(
          'manifest_no', v_manifest.manifest_no,
          'bag_no', p_bag_no,
          'date', p_progress_date,
          'time', p_progress_time,
          'exception', p_exception_code,
          'mode', p_mode
        ),
        v_user,
        v_user
      );
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function public.record_bagging_progress(uuid, text, date, text, text, text, text) from public;
grant execute on function public.record_bagging_progress(uuid, text, date, text, text, text, text) to authenticated, service_role;
