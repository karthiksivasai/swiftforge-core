-- ===========================================================================
-- 0031  pickups — Phase 4 Milestone 2 (Pickup document)
-- ---------------------------------------------------------------------------
-- First transactional document on the 0030 framework:
--   * public.pickups            — booking / first-mile pickup requests
--   * public.save_pickup()      — create/update with gapless PICKUP numbering
--   * public.cancel_pickup()    — OPEN|ASSIGNED → CANCELLED (txn.pickup-cancel)
--   * public.confirm_pickup()   — PICKED → CONFIRMED
--   * public.transfer_pickups() — bulk FE reassignment for a date
--   * lookup key sales-executive (needed by the Pickup screen)
--
-- Permission slug: txn.pickup (0010). Cancel uses txn.pickup-cancel.
-- Soft delete; optimistic lock via row_version; status machine via 0030.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- pickups
-- ---------------------------------------------------------------------------
create table if not exists public.pickups (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants(id) on delete cascade,
  pickup_no               bigint not null,
  pickup_date             date not null default (current_date),
  pickup_time             time,
  customer_id             uuid,
  origin_destination_id   uuid,
  mobile_no               text not null,
  shipper_id              uuid,
  shipper_name            text,
  contact                 text,
  address1                text,
  address2                text,
  zip                     text,
  city                    text,
  state                   text,
  pay_option              text,
  consignee_details       boolean not null default false,
  branch_id               uuid,
  vehicle_type            text
                            check (vehicle_type is null or vehicle_type in (
                              'BICYCLE','BIKE','CAR','VAN','TRUCK','TEMPO')),
  area_id                 uuid,
  field_executive_id      uuid,
  sales_executive_id      uuid,
  special_instructions    text,
  reason                  text,
  pickup_ready            boolean not null default true,
  status                  text not null default 'OPEN'
                            check (status in (
                              'OPEN','ASSIGNED','PICKED','CONFIRMED','CANCELLED')),
  awb_id                  uuid,          -- set when shipment exists (later milestone)
  awb_no                  text,          -- denormalized display until awb_id wired
  booked_by               uuid,
  edited_by               uuid,
  cancelled_at            timestamptz,
  cancelled_by            uuid,
  confirmed_at            timestamptz,
  confirmed_by            uuid,
  created_at              timestamptz not null default now(),
  created_by              uuid,
  updated_at              timestamptz not null default now(),
  updated_by              uuid,
  deleted_at              timestamptz,
  row_version             integer not null default 1,
  constraint pickups_tenant_id_uq unique (tenant_id, id),
  constraint pickups_customer_fk foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete set null,
  constraint pickups_origin_fk foreign key (tenant_id, origin_destination_id)
    references public.destinations (tenant_id, id) on delete set null,
  constraint pickups_shipper_fk foreign key (tenant_id, shipper_id)
    references public.shippers (tenant_id, id) on delete set null,
  constraint pickups_branch_fk foreign key (tenant_id, branch_id)
    references public.branches (tenant_id, id) on delete set null,
  constraint pickups_area_fk foreign key (tenant_id, area_id)
    references public.areas (tenant_id, id) on delete set null,
  constraint pickups_field_executive_fk foreign key (tenant_id, field_executive_id)
    references public.field_executives (tenant_id, id) on delete set null,
  constraint pickups_sales_executive_fk foreign key (tenant_id, sales_executive_id)
    references public.sales_executives (tenant_id, id) on delete set null
);

create unique index if not exists pickups_tenant_no_uq
  on public.pickups (tenant_id, pickup_no) where deleted_at is null;
create index if not exists pickups_tenant_idx on public.pickups (tenant_id);
create index if not exists pickups_tenant_date_idx
  on public.pickups (tenant_id, pickup_date) where deleted_at is null;
create index if not exists pickups_tenant_status_idx
  on public.pickups (tenant_id, status) where deleted_at is null;
create index if not exists pickups_tenant_branch_date_idx
  on public.pickups (tenant_id, branch_id, pickup_date) where deleted_at is null;
create index if not exists pickups_tenant_fe_idx
  on public.pickups (tenant_id, field_executive_id) where deleted_at is null;
create index if not exists pickups_mobile_trgm
  on public.pickups using gin (mobile_no gin_trgm_ops);
create index if not exists pickups_shipper_name_trgm
  on public.pickups using gin (shipper_name gin_trgm_ops);

select app.attach_transaction_triggers('pickups', 'txn.pickup');
select app.attach_transaction_policies('pickups', 'txn.pickup');

-- ---------------------------------------------------------------------------
-- Helpers: resolve optional FK by id or code within tenant
-- ---------------------------------------------------------------------------
create or replace function app.resolve_tenant_row_id(
  p_tenant uuid,
  p_table  text,
  p_id     uuid,
  p_code   text
)
returns uuid
language plpgsql
stable
as $$
declare
  v_id uuid;
  v_code text := nullif(btrim(coalesce(p_code, '')), '');
begin
  if p_id is not null then
    execute format(
      'select id from public.%I where tenant_id = $1 and id = $2 and deleted_at is null',
      p_table)
      into v_id using p_tenant, p_id;
    return v_id;
  end if;
  if v_code is null then
    return null;
  end if;
  execute format(
    'select id from public.%I where tenant_id = $1 and lower(code) = lower($2) and deleted_at is null limit 1',
    p_table)
    into v_id using p_tenant, v_code;
  return v_id;
end
$$;

comment on function app.resolve_tenant_row_id(uuid, text, uuid, text) is
  'Resolve a tenant-owned master row by id, else by case-insensitive code. Returns null when missing.';

-- ---------------------------------------------------------------------------
-- save_pickup
-- ---------------------------------------------------------------------------
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
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'p_fields must be a JSON object' using errcode = '22023';
  end if;

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
    -- fall back to head office / first active branch for sequence allocation
    select id into v_branch from public.branches
      where tenant_id = v_tenant and deleted_at is null
      order by is_head_office desc, code
      limit 1;
  end if;
  -- areas have no code column; resolve by id or name
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

  -- active financial year for the branch (bootstrap seeds HO+FY counters)
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
      booked_by, edited_by, created_by, updated_by)
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
      auth.uid(), auth.uid(), auth.uid(), auth.uid())
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

    -- Derive next status from FE assignment without skipping the machine.
    v_new_status := v_p.status;
    if v_p.status = 'OPEN' and v_fe is not null then
      perform app.assert_status_transition('PICKUP', v_p.status, 'ASSIGNED');
      v_new_status := 'ASSIGNED';
    elsif v_p.status = 'ASSIGNED' and v_fe is null then
      -- clearing FE keeps ASSIGNED (no reverse edge); leave status as-is
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
  'Create or update a pickup. Allocates gapless pickup_no on insert; enforces txn.pickup permissions and status guards.';

revoke all on function public.save_pickup(uuid, integer, jsonb) from public;
grant execute on function public.save_pickup(uuid, integer, jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- cancel_pickup
-- ---------------------------------------------------------------------------
create or replace function public.cancel_pickup(
  p_id          uuid,
  p_row_version integer,
  p_reason      text default null
)
returns public.pickups
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_p      public.pickups;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not (app.user_has_permission(v_tenant, 'txn.pickup-cancel', 'add')
       or app.user_has_permission(v_tenant, 'txn.pickup-cancel', 'modify')
       or app.user_has_permission(v_tenant, 'txn.pickup', 'modify')) then
    raise exception 'Permission denied: txn.pickup-cancel' using errcode = '42501';
  end if;

  select * into v_p from public.pickups
    where id = p_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'Pickup not found' using errcode = 'P0002';
  end if;

  perform app.assert_status_transition('PICKUP', v_p.status, 'CANCELLED');

  update public.pickups set
    status       = 'CANCELLED',
    reason       = coalesce(nullif(btrim(coalesce(p_reason,'')),''), reason),
    cancelled_at = now(),
    cancelled_by = auth.uid(),
    edited_by    = auth.uid(),
    updated_by   = auth.uid()
  where id = p_id and tenant_id = v_tenant and deleted_at is null
    and row_version = p_row_version
  returning * into v_p;

  if not found then
    raise exception 'This record was changed by someone else. Reload and try again.'
      using errcode = '40001';
  end if;

  perform app.write_audit_log(
    p_tenant_id   => v_tenant,
    p_entity_type => 'pickups',
    p_action      => 'MODIFY',
    p_entity_id   => v_p.id,
    p_module_slug => 'txn.pickup-cancel',
    p_new         => jsonb_build_object('status', 'CANCELLED', 'pickup_no', v_p.pickup_no));

  return v_p;
end
$$;

revoke all on function public.cancel_pickup(uuid, integer, text) from public;
grant execute on function public.cancel_pickup(uuid, integer, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- confirm_pickup (PICKED → CONFIRMED; AWB link will set PICKED later)
-- ---------------------------------------------------------------------------
create or replace function public.confirm_pickup(
  p_id          uuid,
  p_row_version integer
)
returns public.pickups
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_p      public.pickups;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not app.user_has_permission(v_tenant, 'txn.pickup', 'modify') then
    raise exception 'Permission denied: txn.pickup modify' using errcode = '42501';
  end if;

  select * into v_p from public.pickups
    where id = p_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'Pickup not found' using errcode = 'P0002';
  end if;

  perform app.assert_status_transition('PICKUP', v_p.status, 'CONFIRMED');

  update public.pickups set
    status       = 'CONFIRMED',
    confirmed_at = now(),
    confirmed_by = auth.uid(),
    edited_by    = auth.uid(),
    updated_by   = auth.uid()
  where id = p_id and tenant_id = v_tenant and deleted_at is null
    and row_version = p_row_version
  returning * into v_p;

  if not found then
    raise exception 'This record was changed by someone else. Reload and try again.'
      using errcode = '40001';
  end if;

  return v_p;
end
$$;

revoke all on function public.confirm_pickup(uuid, integer) from public;
grant execute on function public.confirm_pickup(uuid, integer)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- transfer_pickups — reassign field executive for pickups on a date
-- ---------------------------------------------------------------------------
create or replace function public.transfer_pickups(
  p_date              date,
  p_from_fe_id        uuid,
  p_to_fe_id          uuid,
  p_from_fe_code      text default null,
  p_to_fe_code        text default null
)
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_from   uuid;
  v_to     uuid;
  v_count  integer := 0;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not app.user_has_permission(v_tenant, 'txn.pickup', 'modify') then
    raise exception 'Permission denied: txn.pickup modify' using errcode = '42501';
  end if;
  if p_date is null then
    raise exception 'Date is required' using errcode = '22023';
  end if;

  v_from := app.resolve_tenant_row_id(v_tenant, 'field_executives', p_from_fe_id, p_from_fe_code);
  v_to   := app.resolve_tenant_row_id(v_tenant, 'field_executives', p_to_fe_id, p_to_fe_code);
  if v_from is null then
    raise exception 'From Field Executive is required' using errcode = '22023';
  end if;
  if v_to is null then
    raise exception 'To Field Executive is required' using errcode = '22023';
  end if;

  update public.pickups set
    field_executive_id = v_to,
    status = case when status = 'OPEN' then 'ASSIGNED' else status end,
    edited_by = auth.uid(),
    updated_by = auth.uid()
  where tenant_id = v_tenant
    and deleted_at is null
    and pickup_date = p_date
    and field_executive_id = v_from
    and status in ('OPEN', 'ASSIGNED');

  get diagnostics v_count = row_count;

  perform app.write_audit_log(
    p_tenant_id   => v_tenant,
    p_entity_type => 'pickups',
    p_action      => 'MODIFY',
    p_module_slug => 'txn.pickup',
    p_new         => jsonb_build_object(
      'transfer_date', p_date, 'from_fe', v_from, 'to_fe', v_to, 'count', v_count));

  return v_count;
end
$$;

revoke all on function public.transfer_pickups(date, uuid, uuid, text, text) from public;
grant execute on function public.transfer_pickups(date, uuid, uuid, text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Extend public.lookup with sales-executive (Pickup screen dependency)
-- ---------------------------------------------------------------------------
create or replace function public.lookup(
  p_key   text,
  p_q     text default null,
  p_limit integer default 50
)
returns table (id uuid, code text, name text, hint text)
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_pat text := '%' ||
    replace(replace(coalesce(btrim(p_q), ''), '%', '\%'), '_', '\_') || '%';
begin
  if app.current_user_id() is null then
    return;
  end if;

  if p_key = 'country' then
    return query
      select c.id, c.code, c.name, c.currency
      from public.countries c
      where c.tenant_id in (select app.user_tenant_ids())
        and c.deleted_at is null
        and (c.name ilike v_pat or c.code ilike v_pat)
      order by c.name, c.code, c.id
      limit v_limit;

  elsif p_key = 'zone' then
    return query
      select z.id, z.code, z.name, null::text
      from public.zones z
      where z.tenant_id in (select app.user_tenant_ids())
        and z.deleted_at is null
        and (z.name ilike v_pat or z.code ilike v_pat)
      order by z.name, z.code, z.id
      limit v_limit;

  elsif p_key = 'state' then
    return query
      select s.id, s.code, s.name, s.gst_alias
      from public.states s
      where s.tenant_id in (select app.user_tenant_ids())
        and s.deleted_at is null
        and (s.name ilike v_pat or s.code ilike v_pat)
      order by s.name, s.code, s.id
      limit v_limit;

  elsif p_key = 'destination' then
    return query
      select d.id, d.code, d.name, d.dest_type
      from public.destinations d
      where d.tenant_id in (select app.user_tenant_ids())
        and d.deleted_at is null
        and d.status = 'ACTIVE'
        and (d.name ilike v_pat or d.code ilike v_pat)
      order by d.name, d.code, d.id
      limit v_limit;

  elsif p_key = 'pin-code' then
    return query
      select p.id,
             p.pin_code,
             coalesce(p.pin_name, p.pin_code),
             nullif(concat_ws(' · ',
               case when p.is_oda then 'ODA' end,
               case when not p.is_serviceable then 'Non-serviceable' end), '')
      from public.pincodes p
      where p.tenant_id in (select app.user_tenant_ids())
        and p.deleted_at is null
        and (p.pin_code ilike v_pat or p.pin_name ilike v_pat)
      order by p.pin_code, p.id
      limit v_limit;

  elsif p_key = 'country-pincode' then
    return query
      select cp.id,
             cp.pin_code,
             coalesce(nullif(cp.city_name, ''), cp.pin_code),
             cp.state_name
      from public.country_pincodes cp
      where cp.tenant_id in (select app.user_tenant_ids())
        and cp.deleted_at is null
        and (cp.pin_code ilike v_pat or cp.city_name ilike v_pat)
      order by cp.pin_code, cp.id
      limit v_limit;

  elsif p_key = 'area' then
    return query
      select a.id, a.name, a.name, null::text
      from public.areas a
      where a.tenant_id in (select app.user_tenant_ids())
        and a.deleted_at is null
        and a.name ilike v_pat
      order by a.name, a.id
      limit v_limit;

  -- --------------------------- CATALOG (0018) ------------------------
  elsif p_key = 'product-type' then
    return query
      select pt.id, pt.code, pt.name, null::text
      from public.product_types pt
      where pt.tenant_id in (select app.user_tenant_ids())
        and pt.deleted_at is null
        and (pt.name ilike v_pat or pt.code ilike v_pat)
      order by pt.name, pt.code, pt.id
      limit v_limit;

  elsif p_key = 'product' then
    return query
      select pr.id, pr.code, coalesce(nullif(pr.name, ''), pr.code), pr.shipment_type
      from public.products pr
      where pr.tenant_id in (select app.user_tenant_ids())
        and pr.deleted_at is null
        and pr.status = 'ACTIVE'
        and (pr.name ilike v_pat or pr.code ilike v_pat)
      order by pr.name, pr.code, pr.id
      limit v_limit;

  -- --------------------------- CATALOG (0019) ------------------------
  elsif p_key = 'charge' then
    return query
      select ch.id, ch.code, ch.name, ch.charge_type
      from public.charges ch
      where ch.tenant_id in (select app.user_tenant_ids())
        and ch.deleted_at is null
        and (ch.name ilike v_pat or ch.code ilike v_pat)
      order by ch.name, ch.code, ch.id
      limit v_limit;

  elsif p_key = 'airline' then
    return query
      select al.id, al.name, al.name, null::text
      from public.airlines al
      where al.tenant_id in (select app.user_tenant_ids())
        and al.deleted_at is null
        and al.name ilike v_pat
      order by al.name, al.id
      limit v_limit;

  -- --------------------------- CATALOG (0020) ------------------------
  elsif p_key = 'service-center' then
    return query
      select sc.id, sc.code, sc.name, sc.branch
      from public.service_centers sc
      where sc.tenant_id in (select app.user_tenant_ids())
        and sc.deleted_at is null
        and (sc.name ilike v_pat or sc.code ilike v_pat)
      order by sc.name, sc.code, sc.id
      limit v_limit;

  elsif p_key = 'field-executive' then
    return query
      select fe.id, fe.code, fe.name, fe.mobile
      from public.field_executives fe
      where fe.tenant_id in (select app.user_tenant_ids())
        and fe.deleted_at is null
        and fe.in_active = false
        and (fe.name ilike v_pat or fe.code ilike v_pat)
      order by fe.name, fe.code, fe.id
      limit v_limit;

  -- --------------------------- PARTY (0022) ------------------------
  elsif p_key = 'consignee' then
    return query
      select c.id, c.code, c.name, c.city
      from public.consignees c
      where c.tenant_id in (select app.user_tenant_ids())
        and c.deleted_at is null
        and c.status = 'ACTIVE'
        and (c.name ilike v_pat or c.code ilike v_pat)
      order by c.name, c.code, c.id
      limit v_limit;

  elsif p_key = 'shipper' then
    return query
      select s.id, s.code, s.name, s.city
      from public.shippers s
      where s.tenant_id in (select app.user_tenant_ids())
        and s.deleted_at is null
        and s.status = 'ACTIVE'
        and (s.name ilike v_pat or s.code ilike v_pat)
      order by s.name, s.code, s.id
      limit v_limit;

  -- ---------------------- CUSTOMER AGGREGATE (0023) --------------------
  elsif p_key = 'customer' then
    return query
      select c.id, c.code, c.name, c.branch
      from public.customers c
      where c.tenant_id in (select app.user_tenant_ids())
        and c.deleted_at is null
        and c.status = 'ACTIVE'
        and (c.name ilike v_pat or c.code ilike v_pat)
      order by c.name, c.code, c.id
      limit v_limit;

  -- ---------------------- VENDOR AGGREGATE (0025) --------------------
  elsif p_key = 'vendor' then
    return query
      select v.id, v.code, v.name, v.mode
      from public.vendors v
      where v.tenant_id in (select app.user_tenant_ids())
        and v.deleted_at is null
        and v.status = 'ACTIVE'
        and (v.name ilike v_pat or v.code ilike v_pat)
      order by v.name, v.code, v.id
      limit v_limit;

  elsif p_key = 'bank' then
    return query
      select b.id, b.code, b.name, null::text
      from public.banks b
      where b.tenant_id in (select app.user_tenant_ids())
        and b.deleted_at is null
        and b.status = 'ACTIVE'
        and (b.name ilike v_pat or b.code ilike v_pat)
      order by b.name, b.code, b.id
      limit v_limit;

  elsif p_key = 'branch' then
    return query
      select br.id, br.code, br.name, br.sub_name
      from public.branches br
      where br.tenant_id in (select app.user_tenant_ids())
        and br.deleted_at is null
        and br.status = 'ACTIVE'
        and (br.name ilike v_pat or br.code ilike v_pat)
      order by br.name, br.code, br.id
      limit v_limit;

  elsif p_key = 'local-branch' then
    return query
      select lb.id, lb.code, lb.name, lb.city
      from public.local_branches lb
      where lb.tenant_id in (select app.user_tenant_ids())
        and lb.deleted_at is null
        and lb.status = 'ACTIVE'
        and (lb.name ilike v_pat or lb.code ilike v_pat)
      order by lb.name, lb.code, lb.id
      limit v_limit;

  elsif p_key = 'sales-executive' then
    return query
      select se.id, se.code, se.name, null::text
      from public.sales_executives se
      where se.tenant_id in (select app.user_tenant_ids())
        and se.deleted_at is null
        and (se.name ilike v_pat or se.code ilike v_pat)
      order by se.name, se.code, se.id
      limit v_limit;

  else
    raise exception 'Unknown lookup key: %', p_key using errcode = '22023';
  end if;
end
$$;


comment on function public.lookup(text, text, integer) is
  'Shared tenant-safe autocomplete for master pickers. Keys include sales-executive (0031). Trigram ILIKE search, stable order, limit clamped to [1,200].';

