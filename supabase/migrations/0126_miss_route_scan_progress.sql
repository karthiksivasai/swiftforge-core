-- Miss Route Scan saves through the existing add_tracking_progress function.
-- A user with txn.miss-route-scan add may record only a MISROUTED status change.
-- Other progress updates keep the previous permission checks.

create or replace function public.add_tracking_progress(
  p_awb_no text,
  p_fields jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_ship public.shipments;
  v_exc public.delivery_exceptions;
  v_branch uuid;
  v_date date;
  v_time time;
  v_remark text;
  v_status_text text;
  v_to_status text;
  v_allow_delivered boolean;
  v_tev uuid;
  v_sev uuid;
  v_from text;
  v_raw text;
  v_digits text;
  v_module text := 'txn.progress-comments-update';
  v_progress_allowed boolean;
  v_miss_route boolean;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  v_progress_allowed :=
    app.user_has_permission(v_tenant, 'txn.progress-comments-update', 'add')
    or app.user_has_permission(v_tenant, 'txn.progress-comments-update', 'modify')
    or app.user_has_permission(v_tenant, 'txn.awb-query-progress-update', 'add')
    or app.user_has_permission(v_tenant, 'txn.awb-query-progress-update', 'modify');
  v_miss_route :=
    upper(btrim(coalesce(p_fields->>'to_status', ''))) = 'MISROUTED'
    and app.user_has_permission(v_tenant, 'txn.miss-route-scan', 'add');

  if not (v_progress_allowed or v_miss_route) then
    raise exception 'Permission denied: txn.progress-comments-update' using errcode = '42501';
  end if;
  if v_miss_route and not v_progress_allowed then
    v_module := 'txn.miss-route-scan';
  end if;

  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'p_fields must be a JSON object' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_awb_no,'')),'') is null then
    raise exception 'AWB No is required' using errcode = '22023';
  end if;

  select * into v_ship from public.shipments
   where tenant_id = v_tenant and awb_no = btrim(p_awb_no) and deleted_at is null
   for update;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;

  if v_ship.current_status in ('CANCELLED','VOID') then
    raise exception 'Cancelled/void shipments cannot receive progress (AWB %)', v_ship.awb_no
      using errcode = 'CMS04';
  end if;

  v_allow_delivered := coalesce((p_fields->>'allow_if_delivered')::boolean, false);
  if v_ship.current_status = 'DELIVERED' and not v_allow_delivered then
    raise exception 'Progress on delivered shipments requires allow_if_delivered (AWB %)',
      v_ship.awb_no using errcode = 'CMS04';
  end if;

  begin
    v_date := coalesce((p_fields->>'event_date')::date, (p_fields->>'date')::date, current_date);
  exception when others then
    raise exception 'Invalid event date' using errcode = '22023';
  end;

  begin
    v_raw := coalesce(
      nullif(btrim(coalesce(p_fields->>'event_time','')),''),
      nullif(btrim(coalesce(p_fields->>'time','')),''));
    if v_raw is null then
      v_time := (now()::time);
    else
      v_digits := regexp_replace(v_raw, '[^0-9]', '', 'g');
      if length(v_digits) = 4 then
        v_time := (substr(v_digits, 1, 2) || ':' || substr(v_digits, 3, 2) || ':00')::time;
      else
        v_time := v_raw::time;
      end if;
    end if;
  exception when others then
    raise exception 'Invalid event time' using errcode = '22023';
  end;

  v_remark := nullif(btrim(coalesce(p_fields->>'remark','')),'');

  if nullif(btrim(coalesce(p_fields->>'exception_id','')),'') is not null then
    select * into v_exc from public.delivery_exceptions
     where id = (p_fields->>'exception_id')::uuid
       and tenant_id = v_tenant and deleted_at is null;
  elsif nullif(btrim(coalesce(p_fields->>'exception_code','')),'') is not null then
    select * into v_exc from public.delivery_exceptions
     where tenant_id = v_tenant
       and code = upper(btrim(p_fields->>'exception_code'))
       and deleted_at is null;
  end if;

  if nullif(btrim(coalesce(p_fields->>'branch_id','')),'') is not null then
    v_branch := (p_fields->>'branch_id')::uuid;
  elsif nullif(btrim(coalesce(p_fields->>'branch_code','')),'') is not null then
    select b.id into v_branch from public.branches b
     where b.tenant_id = v_tenant and b.code = btrim(p_fields->>'branch_code')
       and b.deleted_at is null;
  elsif nullif(btrim(coalesce(p_fields->>'service_center_code','')),'') is not null then
    select b.id into v_branch from public.branches b
     where b.tenant_id = v_tenant
       and b.code = btrim(p_fields->>'service_center_code')
       and b.deleted_at is null;
  end if;

  v_status_text := coalesce(
    nullif(btrim(coalesce(p_fields->>'status_text','')),''),
    nullif(btrim(coalesce(v_exc.name,'')),''),
    nullif(btrim(coalesce(v_exc.code,'')),''),
    'Progress Update');

  v_to_status := upper(nullif(btrim(coalesce(p_fields->>'to_status','')),''));
  if v_to_status is null and v_exc.code is not null
     and exists (
       select 1 from app.status_transitions st
        where st.entity_kind = 'SHIPMENT'
          and st.from_status = v_ship.current_status
          and st.to_status = upper(v_exc.code)
     ) then
    v_to_status := upper(v_exc.code);
  end if;

  v_from := v_ship.current_status;

  if v_to_status is not null and v_to_status is distinct from v_ship.current_status then
    if v_ship.is_hold then
      raise exception 'Held shipments cannot change status until released (AWB %)',
        v_ship.awb_no using errcode = 'CMS04';
    end if;
    if v_ship.current_status = 'DELIVERED' and not v_allow_delivered then
      raise exception 'Status change on delivered shipment requires allow_if_delivered'
        using errcode = 'CMS04';
    end if;
    perform app.assert_status_transition('SHIPMENT', v_ship.current_status, v_to_status);
    update public.shipments set
      current_status = v_to_status,
      status_at = now(),
      updated_by = auth.uid()
    where id = v_ship.id and tenant_id = v_tenant;
    v_ship.current_status := v_to_status;
  end if;

  v_tev := app.append_tracking_event(
    v_tenant, v_ship.id, v_status_text, v_remark, 'MANUAL',
    jsonb_build_object(
      'awb_no', v_ship.awb_no,
      'from_status', v_from,
      'to_status', v_to_status,
      'exception_code', v_exc.code,
      'service_center_code', nullif(btrim(coalesce(p_fields->>'service_center_code','')),'')),
    v_branch, v_exc.id, v_date, v_time);

  v_sev := app.append_shipment_event(
    v_tenant, v_ship.id, 'PROGRESS',
    coalesce(v_status_text, 'Progress Update'),
    jsonb_build_object(
      'tracking_event_id', v_tev,
      'from_status', v_from,
      'to_status', coalesce(v_to_status, v_from),
      'remark', v_remark));

  perform app.write_audit_log(
    p_tenant_id => v_tenant, p_entity_type => 'shipments', p_action => 'MODIFY',
    p_entity_id => v_ship.id, p_module_slug => v_module,
    p_new => jsonb_build_object(
      'awb_no', v_ship.awb_no, 'progress', v_status_text,
      'from_status', v_from, 'to_status', coalesce(v_to_status, v_from)));

  return jsonb_build_object(
    'ok', true,
    'awb_no', v_ship.awb_no,
    'shipment_id', v_ship.id,
    'from_status', v_from,
    'to_status', v_ship.current_status,
    'status_text', v_status_text,
    'tracking_event_id', v_tev,
    'shipment_event_id', v_sev,
    'row_version', (select row_version from public.shipments where id = v_ship.id)
  );
end
$$;

comment on function public.add_tracking_progress(text, jsonb) is
  'Append tracking progress; optional status transition via assert_status_transition. Miss Route Scan may set MISROUTED only.';

revoke all on function public.add_tracking_progress(text, jsonb) from public;
grant execute on function public.add_tracking_progress(text, jsonb)
  to authenticated, service_role;
