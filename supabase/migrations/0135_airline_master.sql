-- Airline Master production rules.
-- One product per airline is unchanged until the live Xpresion add form is confirmed.
-- List stays the read gate (0133). Search stays the lookup gate. Names are unique
-- per tenant without regard to case. A delete is refused while Bagging or an AWB
-- still stores that airline name.

-- ---------------------------------------------------------------------------
-- Import: report a duplicate instead of skipping it.
-- ---------------------------------------------------------------------------
create or replace function app.insert_airline_for_import(
  p_tenant uuid,
  p_name text,
  p_product uuid
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_name text := upper(btrim(coalesce(p_name, '')));
begin
  if v_name = '' then
    raise exception using errcode = 'CMS01', message = 'Name is required';
  end if;
  if p_product is null then
    raise exception using errcode = 'CMS01', message = 'Product code is required';
  end if;
  if not exists (
    select 1
    from public.products p
    where p.tenant_id = p_tenant
      and p.id = p_product
      and p.deleted_at is null
  ) then
    raise exception using errcode = 'CMS01', message = 'Product code is not an existing product';
  end if;
  if exists (
    select 1
    from public.airlines a
    where a.tenant_id = p_tenant
      and a.deleted_at is null
      and lower(a.name) = lower(v_name)
  ) then
    raise exception using errcode = 'CMS01',
      message = format('Airline name "%s" already exists', v_name);
  end if;
  insert into public.airlines (tenant_id, name, product_id)
  values (p_tenant, v_name, p_product);
end
$$;

revoke all on function app.insert_airline_for_import(uuid, text, uuid) from public;

do $patch_import$
declare
  v_def text;
  v_old text := $old$insert into public.airlines (tenant_id, name, product_id)
        values (v_tenant, upper(btrim(v_row->>'name')), v_prod)
        on conflict (tenant_id, name) where deleted_at is null do nothing;$old$;
  v_new_sql text := $new$v_col := 'name';
        perform app.insert_airline_for_import(v_tenant, v_row->>'name', v_prod);
        v_col := null;$new$;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'import_master'
    and pg_get_function_identity_arguments(p.oid) = 'p_master text, p_mode text, p_rows jsonb';
  if v_def is null then
    raise exception '0135 could not find public.import_master';
  end if;
  if position('app.insert_airline_for_import' in v_def) > 0 then
    return;
  end if;
  if position(v_old in v_def) = 0 then
    raise exception '0135 could not find the airline import insert';
  end if;
  v_new := replace(v_def, v_old, v_new_sql);
  execute v_new;
end
$patch_import$;

-- ---------------------------------------------------------------------------
-- Lookup: airlines has a name, not a code column. Keep the Search gate 0133
-- injected into public.lookup.
-- ---------------------------------------------------------------------------
do $patch_lookup$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'lookup'
    and pg_get_function_identity_arguments(p.oid) = 'p_key text, p_q text, p_limit integer';
  if v_def is null then
    raise exception '0135 could not find public.lookup';
  end if;
  if position('lookup_permission_slug' in v_def) = 0 then
    raise exception '0135 lookup is missing the Search gate';
  end if;
  if position('al.code' in v_def) = 0 then
    return;
  end if;
  v_new := replace(v_def, 'select al.id, al.code, al.name, null::text', 'select al.id, al.name, al.name, null::text');
  v_new := replace(v_new, 'and (al.name ilike v_pat or al.code ilike v_pat)', 'and al.name ilike v_pat');
  v_new := replace(v_new, 'order by al.name, al.code, al.id', 'order by al.name, al.id');
  if position('al.code' in v_new) > 0 then
    raise exception '0135 airline lookup still references al.code';
  end if;
  execute v_new;
end
$patch_lookup$;

-- ---------------------------------------------------------------------------
-- Case-insensitive name uniqueness, then refuse a delete that is still in use.
-- ---------------------------------------------------------------------------
do $dupes$
declare
  v_dup text;
begin
  select string_agg(format('%s / %s', tenant_id, name), ', ')
  into v_dup
  from (
    select tenant_id, lower(btrim(name)) as name
    from public.airlines
    where deleted_at is null
    group by tenant_id, lower(btrim(name))
    having count(*) > 1
  ) d;
  if v_dup is not null then
    raise exception 'Cannot enforce case-insensitive airline names; duplicates exist: %', v_dup;
  end if;
end
$dupes$;

drop index if exists public.airlines_tenant_name_uq;
create unique index if not exists airlines_tenant_name_ci_uq
  on public.airlines (tenant_id, lower(name))
  where deleted_at is null;

create or replace function app.airlines_guard()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_name text;
  v_bag integer := 0;
  v_awb integer := 0;
  v_used text := '';
begin
  if tg_op in ('INSERT', 'UPDATE') then
    new.name := upper(btrim(coalesce(new.name, '')));
    if new.name = '' then
      raise exception 'Airline Name is required' using errcode = '23502';
    end if;
    if exists (
      select 1
      from public.airlines a
      where a.tenant_id = new.tenant_id
        and a.deleted_at is null
        and lower(a.name) = lower(new.name)
        and a.id is distinct from new.id
    ) then
      raise exception 'Airline name "%" already exists', new.name using errcode = '23505';
    end if;
  end if;

  if tg_op = 'DELETE'
     or (tg_op = 'UPDATE' and old.deleted_at is null and new.deleted_at is not null) then
    v_name := btrim(old.name);
    select count(*) into v_bag
    from public.bagging_manifests bm
    where bm.tenant_id = old.tenant_id
      and bm.deleted_at is null
      and (
        lower(btrim(coalesce(bm.airlines_name, ''))) = lower(v_name)
        or lower(btrim(coalesce(bm.airlines_code, ''))) = lower(v_name)
      );
    select count(*) into v_awb
    from public.shipments s
    where s.tenant_id = old.tenant_id
      and s.deleted_at is null
      and lower(btrim(coalesce(s.airline, ''))) = lower(v_name);
    if v_bag > 0 then
      v_used := format('%s bagging record(s)', v_bag);
    end if;
    if v_awb > 0 then
      v_used := case
        when v_used = '' then format('%s airway bill(s)', v_awb)
        else v_used || format(' and %s airway bill(s)', v_awb)
      end;
    end if;
    if v_used <> '' then
      raise exception 'Cannot delete airline "%". It is still used by %.', v_name, v_used
        using errcode = '23503';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

drop trigger if exists airlines_guard on public.airlines;
create trigger airlines_guard
  before insert or update or delete on public.airlines
  for each row execute function app.airlines_guard();

-- 0133 already rewrites this when the write policies name the slug. Repeat it
-- so a fresh apply of this migration still requires List on airlines.
select app.apply_list_select('airlines', 'mst.airlines');

-- The grid shows the product code. Reading public.products directly would also
-- require Product List, so the airline list carries the label under Airline List.
create or replace function public.list_airlines()
returns table (
  id uuid,
  tenant_id uuid,
  name text,
  product_id uuid,
  product_code text,
  product_name text,
  created_at timestamptz,
  created_by uuid,
  updated_at timestamptz,
  updated_by uuid,
  deleted_at timestamptz,
  row_version integer
)
language sql
stable
security definer
set search_path = public, app
as $$
  select a.id, a.tenant_id, a.name, a.product_id,
         p.code, coalesce(p.name, ''),
         a.created_at, a.created_by, a.updated_at, a.updated_by,
         a.deleted_at, a.row_version
  from public.airlines a
  left join public.products p
    on p.tenant_id = a.tenant_id
   and p.id = a.product_id
  where a.deleted_at is null
    and a.tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(a.tenant_id, 'mst.airlines', 'list')
  order by a.name, a.id
$$;

revoke all on function public.list_airlines() from public;
grant execute on function public.list_airlines() to authenticated, service_role;
