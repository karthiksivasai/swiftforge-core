-- User Setup screen.
-- Extends public.users. Does not drop it.
-- Mobile App Lens is stored in allow_mobile_scanning and does not grant
-- shipment, bagging, manifest, or status permissions.
-- Manifest Branch is stored and does not widen visibility.
-- app.manifest_branch_visible remains the authority.
-- Passwords are validated here and hashed by Supabase Auth. They are never
-- written onto public.users.

-- ---------------------------------------------------------------------------
-- Company and application masters (tenant-owned; the form binds to these)
-- ---------------------------------------------------------------------------
create table if not exists public.companies (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  code        text not null,
  name        text not null,
  status      text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint companies_tenant_id_uq unique (tenant_id, id)
);
create unique index if not exists companies_tenant_code_uq
  on public.companies (tenant_id, lower(code)) where deleted_at is null;
create index if not exists companies_tenant_idx on public.companies (tenant_id);

create table if not exists public.applications (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  code        text not null,
  name        text not null,
  status      text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint applications_tenant_id_uq unique (tenant_id, id)
);
create unique index if not exists applications_tenant_code_uq
  on public.applications (tenant_id, lower(code)) where deleted_at is null;
create index if not exists applications_tenant_idx on public.applications (tenant_id);

alter table public.users
  add column if not exists company_id uuid,
  add column if not exists staff_group text,
  add column if not exists default_application_id uuid,
  add column if not exists additional_emails text,
  add column if not exists vendor_id uuid;

alter table public.users drop constraint if exists users_staff_group_check;
alter table public.users
  add constraint users_staff_group_check
  check (staff_group is null or staff_group in ('BS', 'OPERATION', 'Staff'));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_company_fk') then
    alter table public.users
      add constraint users_company_fk
      foreign key (tenant_id, company_id) references public.companies (tenant_id, id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'users_vendor_setup_fk') then
    alter table public.users
      add constraint users_vendor_setup_fk
      foreign key (tenant_id, vendor_id) references public.vendors (tenant_id, id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'users_default_application_fk') then
    alter table public.users
      add constraint users_default_application_fk
      foreign key (tenant_id, default_application_id) references public.applications (tenant_id, id) on delete set null;
  end if;
end $$;

create table if not exists public.user_applications (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  user_id         uuid not null,
  application_id  uuid not null,
  created_at      timestamptz not null default now(),
  unique (user_id, application_id),
  constraint user_applications_user_fk
    foreign key (tenant_id, user_id) references public.users (tenant_id, id) on delete cascade,
  constraint user_applications_application_fk
    foreign key (tenant_id, application_id) references public.applications (tenant_id, id) on delete cascade
);
create index if not exists user_applications_tenant_idx on public.user_applications (tenant_id, user_id);

alter table public.companies enable row level security;
alter table public.applications enable row level security;
alter table public.user_applications enable row level security;

drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());
drop policy if exists applications_select on public.applications;
create policy applications_select on public.applications
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());
drop policy if exists user_applications_select on public.user_applications;
create policy user_applications_select on public.user_applications
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());

grant select on public.companies to authenticated;
grant select on public.applications to authenticated;
grant select on public.user_applications to authenticated;

comment on column public.users.allow_mobile_scanning is
  'User Setup Mobile App Lens. Camera scanning only. It does not grant shipment, bagging, manifest, or status permissions.';
comment on column public.users.manifest_branch is
  'User Setup Yes/No answer. It does not widen manifest visibility; app.manifest_branch_visible stays in force.';

-- ---------------------------------------------------------------------------
-- Permission. VIEW is list/search. MODIFY is add/modify. Delete also accepts
-- the delete grant. The catalog has no VIEW or MODIFY action names.
-- ---------------------------------------------------------------------------
insert into public.permission_modules (slug, section, name, under_menu, sort_order)
values ('utility.user_setup', 'UTILITIES', 'User Setup', 'Utilities', 143)
on conflict (slug) do nothing;

insert into public.group_permissions (
  tenant_id, group_id, module_id, all_access, can_add, can_modify, can_delete, can_list, can_search
)
select gp.tenant_id, gp.group_id, pm_new.id,
       gp.all_access, gp.can_add, gp.can_modify, gp.can_delete, gp.can_list, gp.can_search
from public.group_permissions gp
join public.permission_modules pm_old on pm_old.id = gp.module_id and pm_old.slug = 'utl.user-setup'
join public.permission_modules pm_new on pm_new.slug = 'utility.user_setup'
on conflict (group_id, module_id) do nothing;

create or replace function app.user_setup_can(p_tenant uuid, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select app.user_has_permission(p_tenant, 'utility.user_setup', p_action)
$$;

revoke all on function app.user_setup_can(uuid, text) from public;

create or replace function app.user_setup_uuid(p_value text)
returns uuid
language plpgsql
immutable
as $$
begin
  if p_value is null or btrim(p_value) = '' then
    return null;
  end if;
  if btrim(p_value) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'Select a valid value';
  end if;
  return btrim(p_value)::uuid;
end
$$;

revoke all on function app.user_setup_uuid(text) from public;

create or replace function app.assert_user_setup_password(
  p_password text,
  p_confirm text,
  p_username text,
  p_is_create boolean
)
returns void
language plpgsql
immutable
as $$
begin
  if coalesce(btrim(p_password), '') = '' and coalesce(btrim(p_confirm), '') = '' then
    if p_is_create then
      raise exception 'Password length should be greater or equal to 8 characters.';
    end if;
    return;
  end if;
  if p_password is distinct from p_confirm then
    raise exception 'Confirm Password must equal Password';
  end if;
  if char_length(p_password) < 8 then
    raise exception 'Password length should be greater or equal to 8 characters.';
  end if;
  if p_password !~ '[0-9]' then
    raise exception 'Password must contain one numeric character.';
  end if;
  if p_password !~ '[^A-Za-z0-9]' then
    raise exception 'Password must contain one special character.';
  end if;
  if lower(p_password) = lower(btrim(coalesce(p_username, ''))) then
    raise exception 'UserName and Password cannot be same.';
  end if;
end
$$;

revoke all on function app.assert_user_setup_password(text, text, text, boolean) from public;

create or replace function app.user_setup_require_view(p_tenant uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, app
as $$
begin
  if not app.user_setup_can(p_tenant, 'list')
     and not app.user_setup_can(p_tenant, 'search') then
    raise exception 'User Setup permission is required' using errcode = '42501';
  end if;
end
$$;

revoke all on function app.user_setup_require_view(uuid) from public;

-- ---------------------------------------------------------------------------
-- list_users / count_users — real offset, no fixed 100 cap
-- ---------------------------------------------------------------------------
create or replace function public.list_users(
  p_search text default null,
  p_limit integer default 10,
  p_offset integer default 0
)
returns table (
  id uuid,
  username text,
  user_type text,
  origin text,
  service_center text,
  email text,
  mobile text,
  status text
)
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 500);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_term text := nullif(replace(replace(btrim(coalesce(p_search, '')), '%', ''), '_', ''), '');
begin
  perform app.user_setup_require_view(v_tenant);
  return query
  select u.id, u.username, u.user_type,
         d.name,
         nullif(btrim(concat_ws(' — ', nullif(b.code, ''), nullif(b.name, ''))), ''),
         u.email, u.mobile, u.status
  from public.users u
  left join public.destinations d on d.id = u.origin_id and d.tenant_id = u.tenant_id
  left join public.branches b on b.id = u.home_branch_id and b.tenant_id = u.tenant_id
  where u.tenant_id = v_tenant
    and u.deleted_at is null
    and (
      v_term is null
      or u.username ilike '%' || v_term || '%'
      or coalesce(u.email, '') ilike '%' || v_term || '%'
      or coalesce(u.mobile, '') ilike '%' || v_term || '%'
      or coalesce(d.name, '') ilike '%' || v_term || '%'
      or coalesce(b.name, '') ilike '%' || v_term || '%'
      or coalesce(b.code, '') ilike '%' || v_term || '%'
    )
  order by lower(u.username), u.id
  limit v_limit
  offset v_offset;
end
$$;

create or replace function public.count_users(p_search text default null)
returns bigint
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_term text := nullif(replace(replace(btrim(coalesce(p_search, '')), '%', ''), '_', ''), '');
  v_count bigint;
begin
  perform app.user_setup_require_view(v_tenant);
  select count(*) into v_count
  from public.users u
  left join public.destinations d on d.id = u.origin_id and d.tenant_id = u.tenant_id
  left join public.branches b on b.id = u.home_branch_id and b.tenant_id = u.tenant_id
  where u.tenant_id = v_tenant
    and u.deleted_at is null
    and (
      v_term is null
      or u.username ilike '%' || v_term || '%'
      or coalesce(u.email, '') ilike '%' || v_term || '%'
      or coalesce(u.mobile, '') ilike '%' || v_term || '%'
      or coalesce(d.name, '') ilike '%' || v_term || '%'
      or coalesce(b.name, '') ilike '%' || v_term || '%'
      or coalesce(b.code, '') ilike '%' || v_term || '%'
    );
  return v_count;
end
$$;

create or replace function public.list_user_setup_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
begin
  perform app.user_setup_require_view(v_tenant);
  return jsonb_build_object(
    'userGroups', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) order by g.name)
      from public.user_groups g
      where g.tenant_id = v_tenant and g.deleted_at is null and g.status = 'ACTIVE'
    ), '[]'::jsonb),
    'companies', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'code', c.code, 'name', c.name) order by c.code)
      from public.companies c
      where c.tenant_id = v_tenant and c.deleted_at is null and c.status = 'ACTIVE'
    ), '[]'::jsonb),
    'applications', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'code', a.code, 'name', a.name) order by a.name)
      from public.applications a
      where a.tenant_id = v_tenant and a.deleted_at is null and a.status = 'ACTIVE'
    ), '[]'::jsonb)
  );
end
$$;

create or replace function public.get_user_details(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_row jsonb;
begin
  perform app.user_setup_require_view(v_tenant);
  select jsonb_build_object(
    'id', u.id,
    'userGroupId', g.id,
    'userGroupName', g.name,
    'userType', u.user_type,
    'username', u.username,
    'originId', u.origin_id,
    'originName', d.name,
    'serviceCenterId', u.home_branch_id,
    'serviceCenterName', nullif(btrim(concat_ws(' — ', nullif(b.code, ''), nullif(b.name, ''))), ''),
    'customerId', u.customer_id,
    'customerName', cu.name,
    'staffGroup', u.staff_group,
    'companyId', u.company_id,
    'companyName', co.name,
    'birthDate', to_char(u.birth_date, 'YYYY-MM-DD'),
    'joiningDate', to_char(u.joining_date, 'YYYY-MM-DD'),
    'email', u.email,
    'mobile', u.mobile,
    'status', u.status,
    'applicationType', u.application_type,
    'backdatingModules', to_jsonb(coalesce(u.backdating_modules, '{}')),
    'applicationIds', coalesce((
      select jsonb_agg(ua.application_id)
      from public.user_applications ua
      where ua.user_id = u.id and ua.tenant_id = u.tenant_id
    ), '[]'::jsonb),
    'defaultApplicationId', u.default_application_id,
    'additionalEmails', u.additional_emails,
    'vendorId', u.vendor_id,
    'vendorName', v.name,
    'addEntryOnManifest', u.add_entry_on_manifest,
    'allowLoginWithOtp', u.otp_login_enabled,
    'globalManifest', u.global_manifest,
    'allowChangingAwbNo', u.allow_changing_awb_no,
    'mobileAppLens', u.allow_mobile_scanning,
    'manifestBranch', u.manifest_branch,
    'weightType', u.weight_unit
  )
  into v_row
  from public.users u
  left join lateral (
    select ug.id, ug.name
    from public.user_group_members m
    join public.user_groups ug on ug.id = m.group_id and ug.tenant_id = m.tenant_id
    where m.user_id = u.id and m.tenant_id = u.tenant_id
    order by m.created_at
    limit 1
  ) g on true
  left join public.destinations d on d.id = u.origin_id and d.tenant_id = u.tenant_id
  left join public.branches b on b.id = u.home_branch_id and b.tenant_id = u.tenant_id
  left join public.customers cu on cu.id = u.customer_id and cu.tenant_id = u.tenant_id
  left join public.companies co on co.id = u.company_id and co.tenant_id = u.tenant_id
  left join public.vendors v on v.id = u.vendor_id and v.tenant_id = u.tenant_id
  where u.id = p_id and u.tenant_id = v_tenant and u.deleted_at is null;

  if v_row is null then
    raise exception 'User was not found';
  end if;
  return v_row;
end
$$;

-- ---------------------------------------------------------------------------
-- save_user — profile only. The password is checked and then discarded.
-- ---------------------------------------------------------------------------
create or replace function public.save_user(p_user jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_id uuid := app.user_setup_uuid(p_user->>'id');
  v_creating boolean := v_id is null;
  v_actor uuid := app.current_app_user_id(v_tenant);
  v_auth uuid;
  v_group uuid;
  v_type text;
  v_username text;
  v_origin uuid;
  v_center uuid;
  v_customer uuid;
  v_staff text;
  v_company uuid;
  v_birth date;
  v_joining date;
  v_email text;
  v_mobile text;
  v_status text;
  v_app_type text;
  v_modules text[];
  v_app_ids uuid[];
  v_default uuid;
  v_extra text;
  v_vendor uuid;
  v_weight text;
  v_prev_status text;
  v_part text;
begin
  if v_creating then
    if not app.user_setup_can(v_tenant, 'add') then
      raise exception 'User Setup permission is required' using errcode = '42501';
    end if;
  elsif not app.user_setup_can(v_tenant, 'modify') then
    raise exception 'User Setup permission is required' using errcode = '42501';
  end if;

  v_username := btrim(coalesce(p_user->>'username', ''));
  if v_username = '' then
    raise exception 'Username is required';
  end if;
  perform app.assert_user_setup_password(p_user->>'password', p_user->>'confirmPassword', v_username, v_creating);

  v_group := app.user_setup_uuid(p_user->>'userGroupId');
  if v_group is null or not exists (
    select 1 from public.user_groups g
    where g.id = v_group and g.tenant_id = v_tenant and g.deleted_at is null and g.status = 'ACTIVE'
  ) then
    raise exception 'User Group is required';
  end if;

  v_type := upper(btrim(coalesce(p_user->>'userType', '')));
  if v_type = 'USER' then
    v_type := 'STAFF';
  end if;
  if v_type not in ('ADMIN', 'STAFF') then
    raise exception 'User Type is required';
  end if;

  v_email := lower(btrim(coalesce(p_user->>'email', '')));
  if v_email = ''
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or v_email like '%.cms.local'
     or char_length(v_email) > 254 then
    raise exception 'Enter a valid email address';
  end if;
  if exists (
    select 1 from public.users u
    where u.deleted_at is null
      and u.email_normalized = v_email
      and (v_id is null or u.id <> v_id)
  ) then
    raise exception 'That email is already in use';
  end if;
  if exists (
    select 1 from public.users u
    where u.tenant_id = v_tenant
      and u.deleted_at is null
      and lower(u.username) = lower(v_username)
      and (v_id is null or u.id <> v_id)
  ) then
    raise exception 'Username is already in use';
  end if;

  v_origin := app.user_setup_uuid(p_user->>'originId');
  if v_origin is not null and not exists (
    select 1 from public.destinations d
    where d.id = v_origin and d.tenant_id = v_tenant and d.deleted_at is null
  ) then
    raise exception 'Origin is not in this company';
  end if;

  v_center := app.user_setup_uuid(p_user->>'serviceCenterId');
  if v_center is not null and not exists (
    select 1 from public.branches b
    where b.id = v_center and b.tenant_id = v_tenant and b.deleted_at is null
  ) then
    raise exception 'Service center is not in this company';
  end if;

  v_customer := app.user_setup_uuid(p_user->>'customerId');
  if v_customer is not null and not exists (
    select 1 from public.customers c
    where c.id = v_customer and c.tenant_id = v_tenant and c.deleted_at is null
  ) then
    raise exception 'Customer is not in this company';
  end if;

  v_company := app.user_setup_uuid(p_user->>'companyId');
  if v_company is not null and not exists (
    select 1 from public.companies c
    where c.id = v_company and c.tenant_id = v_tenant and c.deleted_at is null
  ) then
    raise exception 'Company is not in this company';
  end if;

  v_vendor := app.user_setup_uuid(p_user->>'vendorId');
  if v_vendor is not null and not exists (
    select 1 from public.vendors v
    where v.id = v_vendor and v.tenant_id = v_tenant and v.deleted_at is null
  ) then
    raise exception 'Vendor is not in this company';
  end if;

  v_staff := nullif(btrim(coalesce(p_user->>'staffGroup', '')), '');
  if v_staff is not null and v_staff not in ('BS', 'OPERATION', 'Staff') then
    raise exception 'Group must be BS, OPERATION, or Staff';
  end if;

  if nullif(btrim(coalesce(p_user->>'birthDate', '')), '') is not null then
    if btrim(p_user->>'birthDate') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Birth date is invalid';
    end if;
    v_birth := btrim(p_user->>'birthDate')::date;
  end if;
  if nullif(btrim(coalesce(p_user->>'joiningDate', '')), '') is not null then
    if btrim(p_user->>'joiningDate') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Joining date is invalid';
    end if;
    v_joining := btrim(p_user->>'joiningDate')::date;
  end if;

  v_mobile := nullif(btrim(coalesce(p_user->>'mobile', '')), '');
  if v_mobile is not null and v_mobile !~ '^[0-9+\-() ]{6,20}$' then
    raise exception 'Mobile number is invalid';
  end if;

  v_status := upper(replace(btrim(coalesce(p_user->>'status', 'ACTIVE')), '-', ''));
  if v_status not in ('ACTIVE', 'INACTIVE') then
    raise exception 'Status must be Active or In-Active';
  end if;

  v_app_type := upper(btrim(coalesce(p_user->>'applicationType', '')));
  if v_app_type = '' then
    v_app_type := 'PORTAL';
  end if;
  if v_app_type not in ('ALL', 'MOBILE', 'PORTAL') then
    raise exception 'Application type must be All, Mobile, or Portal';
  end if;

  select coalesce(array_agg(picked.module), '{}')
    into v_modules
  from jsonb_array_elements_text(coalesce(p_user->'backdatingModules', '[]'::jsonb)) as picked(module);
  if v_modules is null then
    v_modules := '{}';
  end if;
  if exists (
    select 1 from unnest(v_modules) as module
    where module not in (
      'Inscan', 'Manifest Scan', 'AWB Entry', 'DRS Scan', 'Progress', 'Comments',
      'Receipt Entry', 'Debit Note', 'Credit Note', 'Manifest Inscan'
    )
  ) then
    raise exception 'Allow Changing Date has an unknown module';
  end if;

  select coalesce(array_agg(app.user_setup_uuid(picked.value)), '{}')
    into v_app_ids
  from jsonb_array_elements_text(coalesce(p_user->'applicationIds', '[]'::jsonb)) as picked(value)
  where btrim(picked.value) <> '';
  if v_app_ids is null then
    v_app_ids := '{}';
  end if;
  if exists (
    select 1 from unnest(v_app_ids) as picked(id)
    where not exists (
      select 1 from public.applications a
      where a.id = picked.id and a.tenant_id = v_tenant and a.deleted_at is null
    )
  ) then
    raise exception 'Application is not in this company';
  end if;

  v_default := app.user_setup_uuid(p_user->>'defaultApplicationId');
  if v_default is not null and not (v_default = any(v_app_ids)) then
    raise exception 'Default Application must be one of the selected Applications';
  end if;

  v_extra := nullif(btrim(coalesce(p_user->>'additionalEmails', '')), '');
  if v_extra is not null then
    foreach v_part in array string_to_array(v_extra, ',') loop
      v_part := lower(btrim(v_part));
      if v_part <> '' and (
        v_part !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        or v_part like '%.cms.local'
      ) then
        raise exception 'Enter a valid email address';
      end if;
    end loop;
  end if;

  v_weight := upper(btrim(coalesce(p_user->>'weightType', 'KG')));
  if v_weight in ('KGS', 'KG') then
    v_weight := 'KG';
  elsif v_weight in ('LBS', 'LB') then
    v_weight := 'LB';
  else
    raise exception 'Weight type must be Kgs or Lbs';
  end if;

  if v_creating then
    v_auth := app.user_setup_uuid(p_user->>'authUserId');
    if v_auth is null or not exists (
      select 1 from auth.users au where au.id = v_auth and lower(au.email) = v_email
    ) then
      raise exception 'Could not create the account';
    end if;
    if exists (select 1 from public.users u where u.auth_user_id = v_auth) then
      raise exception 'That email is already in use';
    end if;
    insert into public.users (
      tenant_id, auth_user_id, username, user_type, customer_id, home_branch_id,
      email, mobile, status, application_type, weight_unit,
      otp_login_enabled, global_manifest, allow_changing_awb_no, add_entry_on_manifest,
      backdating_modules, allow_changing_date, birth_date, joining_date,
      origin_id, allow_mobile_scanning, manifest_branch, email_verified_at,
      company_id, staff_group, default_application_id, additional_emails, vendor_id,
      created_by, updated_by
    ) values (
      v_tenant, v_auth, v_username, v_type, v_customer, v_center,
      v_email, v_mobile, v_status, v_app_type, v_weight,
      coalesce((p_user->>'allowLoginWithOtp')::boolean, false),
      coalesce((p_user->>'globalManifest')::boolean, false),
      coalesce((p_user->>'allowChangingAwbNo')::boolean, false),
      coalesce((p_user->>'addEntryOnManifest')::boolean, false),
      v_modules, nullif(array_to_string(v_modules, ', '), ''), v_birth, v_joining,
      v_origin, coalesce((p_user->>'mobileAppLens')::boolean, false),
      coalesce((p_user->>'manifestBranch')::boolean, false), now(),
      v_company, v_staff, v_default, v_extra, v_vendor,
      v_actor, v_actor
    )
    returning id into v_id;
  else
    select u.auth_user_id, u.status
      into v_auth, v_prev_status
    from public.users u
    where u.id = v_id and u.tenant_id = v_tenant and u.deleted_at is null;
    if v_auth is null then
      raise exception 'User was not found';
    end if;
    update public.users set
      username = v_username,
      user_type = v_type,
      customer_id = v_customer,
      home_branch_id = v_center,
      email = v_email,
      mobile = v_mobile,
      status = v_status,
      application_type = v_app_type,
      weight_unit = v_weight,
      otp_login_enabled = coalesce((p_user->>'allowLoginWithOtp')::boolean, false),
      global_manifest = coalesce((p_user->>'globalManifest')::boolean, false),
      allow_changing_awb_no = coalesce((p_user->>'allowChangingAwbNo')::boolean, false),
      add_entry_on_manifest = coalesce((p_user->>'addEntryOnManifest')::boolean, false),
      backdating_modules = v_modules,
      allow_changing_date = nullif(array_to_string(v_modules, ', '), ''),
      birth_date = v_birth,
      joining_date = v_joining,
      origin_id = v_origin,
      allow_mobile_scanning = coalesce((p_user->>'mobileAppLens')::boolean, false),
      manifest_branch = coalesce((p_user->>'manifestBranch')::boolean, false),
      company_id = v_company,
      staff_group = v_staff,
      default_application_id = v_default,
      additional_emails = v_extra,
      vendor_id = v_vendor,
      updated_by = v_actor,
      updated_at = now()
    where id = v_id and tenant_id = v_tenant;
  end if;

  delete from public.user_group_members where user_id = v_id and tenant_id = v_tenant;
  insert into public.user_group_members (tenant_id, user_id, group_id, created_by)
  values (v_tenant, v_id, v_group, v_actor);

  delete from public.user_applications where user_id = v_id and tenant_id = v_tenant;
  insert into public.user_applications (tenant_id, user_id, application_id)
  select v_tenant, v_id, picked.id
  from unnest(v_app_ids) as picked(id);

  begin
    if v_status = 'INACTIVE' then
      update auth.users set banned_until = now() + interval '100 years' where id = v_auth;
    elsif v_prev_status = 'INACTIVE' then
      update auth.users set banned_until = null where id = v_auth;
    end if;
  exception when others then
    null;
  end;

  insert into public.audit_logs (tenant_id, entity_type, entity_id, action, module_slug, actor_id, new_values)
  values (
    v_tenant, 'users', v_id,
    case when v_creating then 'ADD' else 'MODIFY' end,
    'utility.user_setup',
    auth.uid(),
    jsonb_build_object('event', case when v_creating then 'USER_CREATED' else 'USER_UPDATED' end)
  );

  return v_id;
end
$$;

create or replace function public.delete_user(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_auth uuid;
begin
  if not app.user_setup_can(v_tenant, 'modify')
     and not app.user_setup_can(v_tenant, 'delete') then
    raise exception 'User Setup permission is required' using errcode = '42501';
  end if;

  select u.auth_user_id into v_auth
  from public.users u
  where u.id = p_id and u.tenant_id = v_tenant and u.deleted_at is null;
  if v_auth is null then
    raise exception 'User was not found';
  end if;

  update public.users
  set deleted_at = now(),
      status = 'INACTIVE',
      updated_at = now(),
      updated_by = app.current_app_user_id(v_tenant)
  where id = p_id and tenant_id = v_tenant;

  update public.sessions
  set revoked_at = now(), revoke_reason = 'SOFT_DELETED'
  where user_id = p_id and revoked_at is null;

  begin
    update auth.users set banned_until = now() + interval '100 years' where id = v_auth;
  exception when others then
    null;
  end;

  insert into public.audit_logs (tenant_id, entity_type, entity_id, action, module_slug, actor_id, new_values)
  values (
    v_tenant, 'users', p_id, 'DELETE', 'utility.user_setup', auth.uid(),
    jsonb_build_object('event', 'USER_SOFT_DELETED')
  );
end
$$;

revoke all on function public.list_users(text, integer, integer) from public;
revoke all on function public.count_users(text) from public;
revoke all on function public.list_user_setup_options() from public;
revoke all on function public.get_user_details(uuid) from public;
revoke all on function public.save_user(jsonb) from public;
revoke all on function public.delete_user(uuid) from public;

grant execute on function public.list_users(text, integer, integer) to authenticated, service_role;
grant execute on function public.count_users(text) to authenticated, service_role;
grant execute on function public.list_user_setup_options() to authenticated, service_role;
grant execute on function public.get_user_details(uuid) to authenticated, service_role;
grant execute on function public.save_user(jsonb) to authenticated, service_role;
grant execute on function public.delete_user(uuid) to authenticated, service_role;
