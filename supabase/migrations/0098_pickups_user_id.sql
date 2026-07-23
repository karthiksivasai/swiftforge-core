-- ===========================================================================
-- 0098  pickups.user_id — booking user login for Pick Up register grid
-- ---------------------------------------------------------------------------
-- Stores public.users.username at create time (denormalized for list display).
-- ===========================================================================

alter table public.pickups
  add column if not exists user_id text;

comment on column public.pickups.user_id is
  'Booking user login (public.users.username) captured when the pickup is created.';

update public.pickups p
set user_id = u.username
from public.users u
where p.user_id is null
  and p.booked_by is not null
  and u.auth_user_id = p.booked_by
  and u.tenant_id = p.tenant_id
  and u.deleted_at is null;

create or replace function public.save_pickup(
  p_id          uuid,
  p_row_version integer,
  p_fields      jsonb
)
returns public.pickups
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant   uuid;
  v_p        public.pickups;
  v_alloc    record;
  v_branch   uuid;
  v_fy       uuid;
  v_customer uuid;
  v_origin   uuid;
  v_shipper  uuid;
  v_area     uuid;
  v_fe       uuid;
  v_se       uuid;
  v_vehicle  text;
  v_status   text;
  v_new_status text;
  v_mobile   text;
  v_shipper_name text;
  v_date     date;
  v_time     time;
  v_user_id  text;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'p_fields must be a JSON object' using errcode = '22023';
  end if;

  select u.username into v_user_id
  from public.users u
  where u.tenant_id = v_tenant
    and u.auth_user_id = auth.uid()
    and u.deleted_at is null
  limit 1;

  v_mobile := btrim(coalesce(p_fields->>'mobile_no', ''));
  if v_mobile = '' then
    raise exception 'Mobile No. is required' using errcode = '22023';
  end if;

  v_shipper_name := nullif(btrim(coalesce(p_fields->>'shipper_name', '')), '');
  v_shipper := app.resolve_tenant_row_id(
    v_tenant, 'shippers',
    nullif(btrim(coalesce(p_fields->>'shipper_id','')),'')::uuid,
    p_fields->>'shipper_code');
  if v_shipper is not null and v_shipper_name is null then
    select name into v_shipper_name from public.shippers
      where id = v_shipper and tenant_id = v_tenant;
  end if;
  if v_shipper_name is null and v_shipper is null then
    raise exception 'Shipper Name is required' using errcode = '22023';
  end if;

  v_customer := app.resolve_tenant_row_id(
    v_tenant, 'customers',
    nullif(btrim(coalesce(p_fields->>'customer_id','')),'')::uuid,
    p_fields->>'customer_code');
  v_origin := app.resolve_tenant_row_id(
    v_tenant, 'destinations',
    nullif(btrim(coalesce(p_fields->>'origin_destination_id','')),'')::uuid,
    p_fields->>'origin_code');
  v_branch := app.resolve_tenant_row_id(
    v_tenant, 'branches',
    nullif(btrim(coalesce(p_fields->>'branch_id','')),'')::uuid,
    p_fields->>'branch_code');
  if v_branch is null then
    select id into v_branch from public.branches
      where tenant_id = v_tenant and deleted_at is null
      order by is_head_office desc, code
      limit 1;
  end if;
  if nullif(btrim(coalesce(p_fields->>'area_id','')),'') is not null then
    v_area := app.resolve_tenant_row_id(
      v_tenant, 'areas',
      nullif(btrim(p_fields->>'area_id'),'')::uuid,
      null);
  elsif nullif(btrim(coalesce(p_fields->>'area_code','')),'') is not null
     or nullif(btrim(coalesce(p_fields->>'area_name','')),'') is not null then
    select a.id into v_area
      from public.areas a
     where a.tenant_id = v_tenant and a.deleted_at is null
       and lower(a.name) = lower(coalesce(
             nullif(btrim(coalesce(p_fields->>'area_name','')),''),
             nullif(btrim(coalesce(p_fields->>'area_code','')),'')))
     limit 1;
  end if;
  v_fe := app.resolve_tenant_row_id(
    v_tenant, 'field_executives',
    nullif(btrim(coalesce(p_fields->>'field_executive_id','')),'')::uuid,
    p_fields->>'field_executive_code');
  v_se := app.resolve_tenant_row_id(
    v_tenant, 'sales_executives',
    nullif(btrim(coalesce(p_fields->>'sales_executive_id','')),'')::uuid,
    p_fields->>'sales_executive_code');

  v_vehicle := upper(replace(nullif(btrim(coalesce(p_fields->>'vehicle_type','')),''), ' ', '_'));
  if v_vehicle is not null and v_vehicle not in ('BICYCLE','BIKE','CAR','VAN','TRUCK','TEMPO') then
    raise exception 'Invalid vehicle type: %', v_vehicle using errcode = '22023';
  end if;

  begin
    v_date := coalesce((p_fields->>'pickup_date')::date, current_date);
  exception when others then
    raise exception 'Invalid pickup_date' using errcode = '22023';
  end;
  begin
    v_time := nullif(btrim(coalesce(p_fields->>'pickup_time','')),'')::time;
  exception when others then
    raise exception 'Invalid pickup_time' using errcode = '22023';
  end;

  select fy.id into v_fy
    from public.financial_years fy
   where fy.tenant_id = v_tenant
     and fy.deleted_at is null
     and fy.is_active
     and (fy.branch_id is not distinct from v_branch or fy.branch_id is null)
   order by case when fy.branch_id = v_branch then 0 else 1 end, fy.from_date desc
   limit 1;

  if p_id is null then
    if not app.user_has_permission(v_tenant, 'txn.pickup', 'add') then
      raise exception 'Permission denied: txn.pickup add' using errcode = '42501';
    end if;

    select * into v_alloc
      from app.allocate_document_no(v_tenant, 'PICKUP', v_branch, v_fy);

    v_status := case when v_fe is not null then 'ASSIGNED' else 'OPEN' end;

    insert into public.pickups (
      tenant_id, pickup_no, pickup_date, pickup_time,
      customer_id, origin_destination_id, mobile_no,
      shipper_id, shipper_name, contact, address1, address2, zip, city, state,
      pay_option, consignee_details, branch_id, vehicle_type,
      area_id, field_executive_id, sales_executive_id,
      special_instructions, reason, pickup_ready, status,
      user_id, booked_by, edited_by, created_by, updated_by)
    values (
      v_tenant, v_alloc.sequence_no, v_date, v_time,
      v_customer, v_origin, v_mobile,
      v_shipper, v_shipper_name,
      nullif(btrim(coalesce(p_fields->>'contact','')),''),
      nullif(btrim(coalesce(p_fields->>'address1','')),''),
      nullif(btrim(coalesce(p_fields->>'address2','')),''),
      nullif(btrim(coalesce(p_fields->>'zip','')),''),
      nullif(btrim(coalesce(p_fields->>'city','')),''),
      nullif(btrim(coalesce(p_fields->>'state','')),''),
      nullif(btrim(coalesce(p_fields->>'pay_option','')),''),
      coalesce((p_fields->>'consignee_details')::boolean, false),
      v_branch, v_vehicle,
      v_area, v_fe, v_se,
      nullif(btrim(coalesce(p_fields->>'special_instructions','')),''),
      nullif(btrim(coalesce(p_fields->>'reason','')),''),
      coalesce((p_fields->>'pickup_ready')::boolean, true),
      v_status,
      v_user_id, auth.uid(), auth.uid(), auth.uid(), auth.uid())
    returning * into v_p;

    perform app.write_audit_log(
      p_tenant_id   => v_tenant,
      p_entity_type => 'pickups',
      p_action      => 'ADD',
      p_entity_id   => v_p.id,
      p_module_slug => 'txn.pickup',
      p_new         => jsonb_build_object(
        'pickup_no', v_p.pickup_no, 'status', v_p.status,
        'formatted_no', v_alloc.formatted_no));
  else
    if not app.user_has_permission(v_tenant, 'txn.pickup', 'modify') then
      raise exception 'Permission denied: txn.pickup modify' using errcode = '42501';
    end if;

    select * into v_p from public.pickups
      where id = p_id and tenant_id = v_tenant and deleted_at is null;
    if not found then
      raise exception 'Pickup not found' using errcode = 'P0002';
    end if;
    if v_p.status in ('CANCELLED', 'CONFIRMED') then
      raise exception 'Cannot edit a % pickup', v_p.status using errcode = 'CMS02';
    end if;

    v_new_status := v_p.status;
    if v_p.status = 'OPEN' and v_fe is not null then
      perform app.assert_status_transition('PICKUP', v_p.status, 'ASSIGNED');
      v_new_status := 'ASSIGNED';
    elsif v_p.status = 'ASSIGNED' and v_fe is null then
      v_new_status := v_p.status;
    end if;

    update public.pickups set
      pickup_date           = v_date,
      pickup_time           = v_time,
      customer_id           = v_customer,
      origin_destination_id = v_origin,
      mobile_no             = v_mobile,
      shipper_id            = v_shipper,
      shipper_name          = v_shipper_name,
      contact               = nullif(btrim(coalesce(p_fields->>'contact','')),''),
      address1              = nullif(btrim(coalesce(p_fields->>'address1','')),''),
      address2              = nullif(btrim(coalesce(p_fields->>'address2','')),''),
      zip                   = nullif(btrim(coalesce(p_fields->>'zip','')),''),
      city                  = nullif(btrim(coalesce(p_fields->>'city','')),''),
      state                 = nullif(btrim(coalesce(p_fields->>'state','')),''),
      pay_option            = nullif(btrim(coalesce(p_fields->>'pay_option','')),''),
      consignee_details     = coalesce((p_fields->>'consignee_details')::boolean, consignee_details),
      branch_id             = v_branch,
      vehicle_type          = v_vehicle,
      area_id               = v_area,
      field_executive_id    = v_fe,
      sales_executive_id    = v_se,
      special_instructions  = nullif(btrim(coalesce(p_fields->>'special_instructions','')),''),
      reason                = nullif(btrim(coalesce(p_fields->>'reason','')),''),
      pickup_ready          = coalesce((p_fields->>'pickup_ready')::boolean, pickup_ready),
      status                = v_new_status,
      edited_by             = auth.uid(),
      updated_by            = auth.uid()
    where id = p_id and tenant_id = v_tenant and deleted_at is null
      and row_version = p_row_version
    returning * into v_p;

    if not found then
      raise exception 'This record was changed by someone else. Reload and try again.'
        using errcode = '40001';
    end if;
  end if;

  return v_p;
end
$$;

comment on function public.save_pickup(uuid, integer, jsonb) is
  'Create or update a pickup. Allocates gapless pickup_no on insert; stores booking user_id username.';

revoke all on function public.save_pickup(uuid, integer, jsonb) from public;
grant execute on function public.save_pickup(uuid, integer, jsonb)
  to authenticated, service_role;
