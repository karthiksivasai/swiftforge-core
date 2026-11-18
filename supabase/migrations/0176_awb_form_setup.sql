-- 0176  AWB Entry Form Setup, one row per user.
-- txn.awb-form-setup modify is the edit permission (awb_form_setup.edit).
-- txn.awb-payment-override modify is the payment-type override permission.

insert into public.permission_modules (slug, section, name, under_menu, sort_order)
select 'txn.awb-form-setup', 'TRANSACTION', 'AWB Form Setup', 'Entry',
       coalesce((select max(sort_order) + 1 from public.permission_modules), 1)
 where not exists (
   select 1 from public.permission_modules where slug = 'txn.awb-form-setup'
 );

insert into public.permission_modules (slug, section, name, under_menu, sort_order)
select 'txn.awb-payment-override', 'TRANSACTION', 'AWB Payment Type Override', 'Entry',
       coalesce((select max(sort_order) + 1 from public.permission_modules), 1)
 where not exists (
   select 1 from public.permission_modules where slug = 'txn.awb-payment-override'
 );

create table if not exists public.awb_form_setup (
  id                          uuid primary key default gen_random_uuid(),
  tenant_id                   uuid not null references public.tenants(id) on delete cascade,
  user_id                     uuid not null references public.users(id) on delete cascade,
  branch_id                   uuid references public.branches(id),
  customer_repeat             boolean not null default false,
  date_repeat                 boolean not null default false,
  content_repeat              boolean not null default false,
  awb_no_plus_1               boolean not null default false,
  product_repeat              boolean not null default false,
  consignee_name_repeat       boolean not null default false,
  instruction_repeat          boolean not null default false,
  allow_consignee_name_blank  boolean not null default false,
  vendor_repeat               boolean not null default false,
  airline_repeat              boolean not null default false,
  airline_not_required        boolean not null default true,
  service_repeat              boolean not null default false,
  destination_repeat          boolean not null default false,
  shipper_details_repeat      boolean not null default false,
  consignee_not_required      boolean not null default false,
  allow_payment_type_override boolean not null default true,
  updated_by                  uuid,
  updated_at                  timestamptz not null default now(),
  created_at                  timestamptz not null default now(),
  constraint awb_form_setup_user_uq unique (tenant_id, user_id)
);

create index if not exists awb_form_setup_tenant_idx
  on public.awb_form_setup (tenant_id);

alter table public.awb_form_setup enable row level security;

drop policy if exists awb_form_setup_select on public.awb_form_setup;
create policy awb_form_setup_select on public.awb_form_setup
  for select using (
    tenant_id in (select app.user_tenant_ids())
    and (
      user_id = app.current_app_user_id(tenant_id)
      or app.is_tenant_admin(tenant_id)
    )
  );

drop policy if exists awb_form_setup_insert on public.awb_form_setup;
create policy awb_form_setup_insert on public.awb_form_setup
  for insert with check (
    tenant_id in (select app.user_tenant_ids())
    and user_id = app.current_app_user_id(tenant_id)
    and app.user_has_permission(tenant_id, 'txn.awb-form-setup', 'modify')
  );

drop policy if exists awb_form_setup_update on public.awb_form_setup;
create policy awb_form_setup_update on public.awb_form_setup
  for update using (
    tenant_id in (select app.user_tenant_ids())
    and user_id = app.current_app_user_id(tenant_id)
    and app.user_has_permission(tenant_id, 'txn.awb-form-setup', 'modify')
  ) with check (
    tenant_id in (select app.user_tenant_ids())
    and user_id = app.current_app_user_id(tenant_id)
    and app.user_has_permission(tenant_id, 'txn.awb-form-setup', 'modify')
  );

grant select, insert, update on public.awb_form_setup to authenticated;

create or replace function app.awb_form_setup_json(p_row public.awb_form_setup)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'customerRepeat', p_row.customer_repeat,
    'dateRepeat', p_row.date_repeat,
    'contentRepeat', p_row.content_repeat,
    'awbNoPlus1', p_row.awb_no_plus_1,
    'productRepeat', p_row.product_repeat,
    'consigneeNameRepeat', p_row.consignee_name_repeat,
    'instructionRepeat', p_row.instruction_repeat,
    'allowConsigneeNameBlank', p_row.allow_consignee_name_blank,
    'vendorRepeat', p_row.vendor_repeat,
    'airlineRepeat', p_row.airline_repeat,
    'airlineNotRequired', p_row.airline_not_required,
    'serviceRepeat', p_row.service_repeat,
    'destinationRepeat', p_row.destination_repeat,
    'shipperDetailsRepeat', p_row.shipper_details_repeat,
    'consigneeNotRequired', p_row.consignee_not_required,
    'allowPaymentTypeOverride', p_row.allow_payment_type_override
  )
$$;

create or replace function app.awb_form_setup_flag(p_settings jsonb, p_key text, p_default boolean)
returns boolean
language sql
immutable
as $$
  select case
    when p_settings is null or jsonb_typeof(p_settings) <> 'object' then p_default
    when p_settings->p_key is null or jsonb_typeof(p_settings->p_key) = 'null' then p_default
    when jsonb_typeof(p_settings->p_key) = 'boolean' then (p_settings->>p_key)::boolean
    else p_default
  end
$$;

create or replace function public.get_awb_form_setup()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_user   uuid;
  v_row    public.awb_form_setup;
begin
  v_tenant := app.current_tenant_id();
  if not app.user_has_permission(v_tenant, 'txn.awb-entry', 'list')
     and not app.user_has_permission(v_tenant, 'txn.awb-entry', 'search') then
    raise exception 'txn.awb-entry list permission is required' using errcode = '42501';
  end if;
  v_user := app.current_app_user_id(v_tenant);
  if v_user is null then
    raise exception 'User profile not found' using errcode = '42501';
  end if;

  select * into v_row
    from public.awb_form_setup s
   where s.tenant_id = v_tenant and s.user_id = v_user;

  if v_row.id is null then
    return jsonb_build_object(
      'stored', false,
      'can_edit', app.user_has_permission(v_tenant, 'txn.awb-form-setup', 'modify'),
      'branch_id', null,
      'settings', jsonb_build_object(
        'customerRepeat', false,
        'dateRepeat', false,
        'contentRepeat', false,
        'awbNoPlus1', false,
        'productRepeat', false,
        'consigneeNameRepeat', false,
        'instructionRepeat', false,
        'allowConsigneeNameBlank', false,
        'vendorRepeat', false,
        'airlineRepeat', false,
        'airlineNotRequired', true,
        'serviceRepeat', false,
        'destinationRepeat', false,
        'shipperDetailsRepeat', false,
        'consigneeNotRequired', false,
        'allowPaymentTypeOverride', true
      )
    );
  end if;

  return jsonb_build_object(
    'stored', true,
    'can_edit', app.user_has_permission(v_tenant, 'txn.awb-form-setup', 'modify'),
    'branch_id', v_row.branch_id,
    'settings', app.awb_form_setup_json(v_row)
  );
end;
$$;

create or replace function public.save_awb_form_setup(
  p_settings jsonb,
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_user   uuid;
  v_branch uuid;
  v_old    public.awb_form_setup;
  v_new    public.awb_form_setup;
begin
  v_tenant := app.current_tenant_id();
  if not app.user_has_permission(v_tenant, 'txn.awb-form-setup', 'modify') then
    raise exception 'txn.awb-form-setup modify permission is required' using errcode = '42501';
  end if;
  v_user := app.current_app_user_id(v_tenant);
  if v_user is null then
    raise exception 'User profile not found' using errcode = '42501';
  end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'Form setup settings are required' using errcode = 'CMS04';
  end if;

  if p_branch_id is not null then
    select b.id into v_branch
      from public.branches b
     where b.id = p_branch_id and b.tenant_id = v_tenant and b.deleted_at is null;
    if v_branch is null then
      raise exception 'Branch was not found' using errcode = 'CMS04';
    end if;
  else
    select u.home_branch_id into v_branch
      from public.users u
     where u.id = v_user;
  end if;

  select * into v_old
    from public.awb_form_setup s
   where s.tenant_id = v_tenant and s.user_id = v_user
   for update;

  if v_old.id is null then
    insert into public.awb_form_setup (
      tenant_id, user_id, branch_id,
      customer_repeat, date_repeat, content_repeat, awb_no_plus_1,
      product_repeat, consignee_name_repeat, instruction_repeat, allow_consignee_name_blank,
      vendor_repeat, airline_repeat, airline_not_required, service_repeat,
      destination_repeat, shipper_details_repeat, consignee_not_required, allow_payment_type_override,
      updated_by, updated_at
    ) values (
      v_tenant, v_user, v_branch,
      app.awb_form_setup_flag(p_settings, 'customerRepeat', false),
      app.awb_form_setup_flag(p_settings, 'dateRepeat', false),
      app.awb_form_setup_flag(p_settings, 'contentRepeat', false),
      app.awb_form_setup_flag(p_settings, 'awbNoPlus1', false),
      app.awb_form_setup_flag(p_settings, 'productRepeat', false),
      app.awb_form_setup_flag(p_settings, 'consigneeNameRepeat', false),
      app.awb_form_setup_flag(p_settings, 'instructionRepeat', false),
      app.awb_form_setup_flag(p_settings, 'allowConsigneeNameBlank', false),
      app.awb_form_setup_flag(p_settings, 'vendorRepeat', false),
      app.awb_form_setup_flag(p_settings, 'airlineRepeat', false),
      app.awb_form_setup_flag(p_settings, 'airlineNotRequired', true),
      app.awb_form_setup_flag(p_settings, 'serviceRepeat', false),
      app.awb_form_setup_flag(p_settings, 'destinationRepeat', false),
      app.awb_form_setup_flag(p_settings, 'shipperDetailsRepeat', false),
      app.awb_form_setup_flag(p_settings, 'consigneeNotRequired', false),
      app.awb_form_setup_flag(p_settings, 'allowPaymentTypeOverride', true),
      v_user, now()
    )
    returning * into v_new;

    perform app.write_audit_log(
      p_tenant_id => v_tenant,
      p_entity_type => 'awb_form_setup',
      p_action => 'ADD',
      p_entity_id => v_new.id,
      p_module_slug => 'txn.awb-form-setup',
      p_old => null,
      p_new => app.awb_form_setup_json(v_new)
    );
  else
    update public.awb_form_setup set
      branch_id = coalesce(v_branch, branch_id),
      customer_repeat = app.awb_form_setup_flag(p_settings, 'customerRepeat', customer_repeat),
      date_repeat = app.awb_form_setup_flag(p_settings, 'dateRepeat', date_repeat),
      content_repeat = app.awb_form_setup_flag(p_settings, 'contentRepeat', content_repeat),
      awb_no_plus_1 = app.awb_form_setup_flag(p_settings, 'awbNoPlus1', awb_no_plus_1),
      product_repeat = app.awb_form_setup_flag(p_settings, 'productRepeat', product_repeat),
      consignee_name_repeat = app.awb_form_setup_flag(p_settings, 'consigneeNameRepeat', consignee_name_repeat),
      instruction_repeat = app.awb_form_setup_flag(p_settings, 'instructionRepeat', instruction_repeat),
      allow_consignee_name_blank = app.awb_form_setup_flag(p_settings, 'allowConsigneeNameBlank', allow_consignee_name_blank),
      vendor_repeat = app.awb_form_setup_flag(p_settings, 'vendorRepeat', vendor_repeat),
      airline_repeat = app.awb_form_setup_flag(p_settings, 'airlineRepeat', airline_repeat),
      airline_not_required = app.awb_form_setup_flag(p_settings, 'airlineNotRequired', airline_not_required),
      service_repeat = app.awb_form_setup_flag(p_settings, 'serviceRepeat', service_repeat),
      destination_repeat = app.awb_form_setup_flag(p_settings, 'destinationRepeat', destination_repeat),
      shipper_details_repeat = app.awb_form_setup_flag(p_settings, 'shipperDetailsRepeat', shipper_details_repeat),
      consignee_not_required = app.awb_form_setup_flag(p_settings, 'consigneeNotRequired', consignee_not_required),
      allow_payment_type_override = app.awb_form_setup_flag(p_settings, 'allowPaymentTypeOverride', allow_payment_type_override),
      updated_by = v_user,
      updated_at = now()
    where id = v_old.id
    returning * into v_new;

    perform app.write_audit_log(
      p_tenant_id => v_tenant,
      p_entity_type => 'awb_form_setup',
      p_action => 'MODIFY',
      p_entity_id => v_new.id,
      p_module_slug => 'txn.awb-form-setup',
      p_old => app.awb_form_setup_json(v_old),
      p_new => app.awb_form_setup_json(v_new)
    );
  end if;

  return jsonb_build_object(
    'stored', true,
    'can_edit', true,
    'branch_id', v_new.branch_id,
    'settings', app.awb_form_setup_json(v_new)
  );
end;
$$;

revoke all on function public.get_awb_form_setup() from public;
revoke all on function public.save_awb_form_setup(jsonb, uuid) from public;
grant execute on function public.get_awb_form_setup() to authenticated, service_role;
grant execute on function public.save_awb_form_setup(jsonb, uuid) to authenticated, service_role;

comment on table public.awb_form_setup is
  'One AWB Entry Form Setup row per user. Tenant admins can read every row. Edit requires txn.awb-form-setup modify.';
