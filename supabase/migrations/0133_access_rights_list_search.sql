-- ===========================================================================
-- 0133  Access Rights: List is the read gate, Search is its own gate.
-- ---------------------------------------------------------------------------
-- SELECT on permission-controlled business tables requires List (or All
-- Access). Admin / TENANT_ADMIN still pass inside app.user_has_permission.
-- Search no longer satisfies List, and List no longer satisfies Search.
-- A user who can Modify Access Rights may insert a new grant row.
-- Permission-change audit records the module and the six flags.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Catalog rows for menu forms that had no grantable slug.
-- Pin Code and the invoice screens already exist; align their display names
-- with the menu. New slugs use the same path keys as navigation.ts.
-- ---------------------------------------------------------------------------
insert into public.permission_modules (slug, section, name, under_menu, sort_order)
values
  ('utl.integration-configuration', 'UTILITIES', 'Integration Configuration', 'Utilities', 170),
  ('utl.rate-update-jobs', 'UTILITIES', 'Rate Update Jobs', 'Rate / Zone Update', 171),
  ('utl.zone-update-jobs', 'UTILITIES', 'Zone Update Jobs', 'Rate / Zone Update', 172)
on conflict (slug) do update
  set section = excluded.section,
      name = excluded.name,
      under_menu = excluded.under_menu,
      is_active = true;

update public.permission_modules
set name = 'Pin Code'
where slug = 'mst.pincode-master' and name is distinct from 'Pin Code';

update public.permission_modules
set name = 'Invoice Generation'
where slug = 'doc.generate-invoice' and name is distinct from 'Invoice Generation';

update public.permission_modules
set name = 'Invoice Print'
where slug = 'doc.print-invoice' and name is distinct from 'Invoice Print';

insert into public.group_permissions (
  tenant_id, group_id, module_id,
  all_access, can_add, can_modify, can_delete, can_list, can_search
)
select g.tenant_id, g.id, m.id, true, true, true, true, true, true
from public.user_groups g
join public.permission_modules m
  on m.slug in (
    'utl.integration-configuration',
    'utl.rate-update-jobs',
    'utl.zone-update-jobs',
    'mst.pincode-master',
    'doc.generate-invoice',
    'doc.print-invoice',
    'doc.invoice-finalise'
  )
where g.is_system
  and g.name = 'TENANT_ADMIN'
on conflict (group_id, module_id) do update
  set all_access = true,
      can_add = true,
      can_modify = true,
      can_delete = true,
      can_list = true,
      can_search = true;

-- ---------------------------------------------------------------------------
-- Modify on Access Rights may create the first grant row. Add still may.
-- ---------------------------------------------------------------------------
drop policy if exists group_permissions_insert on public.group_permissions;
create policy group_permissions_insert on public.group_permissions
  for insert with check (
    tenant_id in (select app.user_tenant_ids())
    and (
      app.user_has_permission(tenant_id, 'utl.access-rights', 'add')
      or app.user_has_permission(tenant_id, 'utl.access-rights', 'modify')
    )
  );

-- ---------------------------------------------------------------------------
-- Audit: module slug plus old -> new for the six flags.
-- ---------------------------------------------------------------------------
create or replace function app.tg_log_permission_change()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := coalesce(new.tenant_id, old.tenant_id);
  v_module uuid := coalesce(new.module_id, old.module_id);
  v_user public.users;
  v_slug text;
  v_name text;
begin
  select * into v_user
  from public.users
  where auth_user_id = auth.uid()
    and tenant_id = v_tenant
  limit 1;

  select slug, name into v_slug, v_name
  from public.permission_modules
  where id = v_module;

  insert into public.login_logs (tenant_id, user_id, username, event, user_type, detail)
  values (
    v_tenant,
    v_user.id,
    coalesce(v_user.username, 'system'),
    'PERMISSION_CHANGE',
    coalesce(v_user.user_type, 'SYSTEM'),
    format(
      '%s module=%s name=%s id=%s all_access %s->%s add %s->%s modify %s->%s delete %s->%s list %s->%s search %s->%s',
      tg_op,
      coalesce(v_slug, v_module::text),
      coalesce(v_name, ''),
      coalesce(new.id, old.id),
      coalesce(old.all_access::text, '-'), coalesce(new.all_access::text, '-'),
      coalesce(old.can_add::text, '-'), coalesce(new.can_add::text, '-'),
      coalesce(old.can_modify::text, '-'), coalesce(new.can_modify::text, '-'),
      coalesce(old.can_delete::text, '-'), coalesce(new.can_delete::text, '-'),
      coalesce(old.can_list::text, '-'), coalesce(new.can_list::text, '-'),
      coalesce(old.can_search::text, '-'), coalesce(new.can_search::text, '-')
    )
  );
  return coalesce(new, old);
end
$$;

-- ---------------------------------------------------------------------------
-- Future transaction / event tables: SELECT requires List.
-- ---------------------------------------------------------------------------
create or replace function app.attach_transaction_policies(p_table text, p_module_slug text)
returns void
language plpgsql
as $$
begin
  execute format('alter table public.%I enable row level security;', p_table);
  execute format('drop policy if exists %I on public.%I;', p_table || '_select', p_table);
  execute format($p$create policy %I on public.%I
    for select using (
      app.is_platform_admin()
      or (
        tenant_id in (select app.user_tenant_ids())
        and app.user_has_permission(tenant_id, %L, 'list')
      )
    );$p$,
    p_table || '_select', p_table, p_module_slug);

  execute format('drop policy if exists %I on public.%I;', p_table || '_insert', p_table);
  execute format($p$create policy %I on public.%I
    for insert with check (
      tenant_id in (select app.user_tenant_ids())
      and app.user_has_permission(tenant_id, %L, 'add'));$p$,
    p_table || '_insert', p_table, p_module_slug);

  execute format('drop policy if exists %I on public.%I;', p_table || '_update', p_table);
  execute format($p$create policy %I on public.%I
    for update using (
      tenant_id in (select app.user_tenant_ids())
      and app.user_has_permission(tenant_id, %L, 'modify'))
    with check (
      tenant_id in (select app.user_tenant_ids())
      and app.user_has_permission(tenant_id, %L, 'modify'));$p$,
    p_table || '_update', p_table, p_module_slug, p_module_slug);

  execute format('drop policy if exists %I on public.%I;', p_table || '_delete', p_table);
  execute format($p$create policy %I on public.%I
    for delete using (
      tenant_id in (select app.user_tenant_ids())
      and app.user_has_permission(tenant_id, %L, 'delete'));$p$,
    p_table || '_delete', p_table, p_module_slug);
end
$$;

create or replace function app.attach_event_policies(p_table text, p_module_slug text)
returns void
language plpgsql
as $$
begin
  execute format('alter table public.%I enable row level security;', p_table);
  execute format('drop policy if exists %I on public.%I;', p_table || '_select', p_table);
  execute format($p$create policy %I on public.%I
    for select using (
      app.is_platform_admin()
      or (
        tenant_id in (select app.user_tenant_ids())
        and app.user_has_permission(tenant_id, %L, 'list')
      )
    );$p$,
    p_table || '_select', p_table, p_module_slug);

  execute format('drop policy if exists %I on public.%I;', p_table || '_insert', p_table);
  execute format($p$create policy %I on public.%I
    for insert with check (
      tenant_id in (select app.user_tenant_ids())
      and app.user_has_permission(tenant_id, %L, 'add'));$p$,
    p_table || '_insert', p_table, p_module_slug);

  execute format('drop policy if exists %I on public.%I;', p_table || '_update', p_table);
  execute format('drop policy if exists %I on public.%I;', p_table || '_delete', p_table);
end
$$;

create or replace function app.apply_list_select(p_table text, p_slug text)
returns void
language plpgsql
as $$
declare
  v_pol text;
begin
  if p_slug is null or btrim(p_slug) = '' then
    return;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = p_table and column_name = 'tenant_id'
  ) then
    return;
  end if;

  for v_pol in
    select pol.polname
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = p_table
      and pol.polcmd = 'r'
  loop
    execute format('drop policy %I on public.%I', v_pol, p_table);
  end loop;

  execute format(
    $pol$create policy %I on public.%I
      for select using (
        app.is_platform_admin()
        or (
          tenant_id in (select app.user_tenant_ids())
          and app.user_has_permission(tenant_id, %L, 'list')
        )
      )$pol$,
    p_table || '_select',
    p_table,
    p_slug
  );
end
$$;

-- Identity, session, and the Access Rights tables themselves stay readable
-- by a tenant member. Their writes are already permission-gated.
do $list_select$
declare
  r record;
  v_skip text[] := array[
    'users', 'user_groups', 'user_group_members', 'user_branch_access',
    'group_permissions', 'permission_modules', 'sessions', 'login_logs',
    'audit_logs', 'tenants', 'tenant_users', 'files'
  ];
begin
  for r in
    select distinct on (c.relname)
      c.relname as tbl,
      (regexp_match(
        coalesce(pg_get_expr(p.polwithcheck, p.polrelid), pg_get_expr(p.polqual, p.polrelid)),
        'user_has_permission\([^,]+,\s*''([^'']+)'''
      ))[1] as slug
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and p.polcmd in ('a', 'w', 'd')
      and c.relname <> all (v_skip)
      and coalesce(pg_get_expr(p.polwithcheck, p.polrelid), pg_get_expr(p.polqual, p.polrelid), '')
          like '%user_has_permission%'
    order by c.relname, case p.polcmd when 'a' then 0 when 'w' then 1 else 2 end
  loop
    perform app.apply_list_select(r.tbl, r.slug);
  end loop;

  -- These SELECT policies have no sibling write policy that names a slug.
  perform app.apply_list_select('customers', 'mst.customer-master');
  perform app.apply_list_select('shipments', 'txn.awb-entry');
  perform app.apply_list_select('invoices', 'doc.generate-invoice');
  perform app.apply_list_select('debit_notes', 'txn.debit-note');
  perform app.apply_list_select('credit_notes', 'txn.credit-note');
end
$list_select$;

-- Search is not List. The specific action is the only grant that passes.
create or replace function app.assert_serviceable_pincode_permission(
  p_tenant uuid,
  p_action text
)
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
  if p_action in ('add', 'modify', 'delete', 'list', 'search')
     and app.user_has_permission(p_tenant, 'utl.serviceable-pincode', p_action) then
    return;
  end if;
  raise exception 'Permission denied: utl.serviceable-pincode' using errcode = '42501';
end
$$;

create or replace function app.lookup_permission_slug(p_key text)
returns text
language sql
stable
as $$
  select case lower(btrim(coalesce(p_key, '')))
    when 'country' then 'mst.country-master'
    when 'zone' then 'mst.zone-master'
    when 'state' then 'mst.state-master'
    when 'destination' then 'mst.destination-master'
    when 'pin-code' then 'mst.pincode-master'
    when 'pincode' then 'mst.pincode-master'
    when 'country-pincode' then 'mst.country-pincodes'
    when 'branch' then 'mst.service-center-master'
    when 'service-center' then 'mst.service-center-master'
    when 'customer' then 'mst.customer-master'
    when 'shipper' then 'mst.shipper-master'
    when 'consignee' then 'mst.consignee-master'
    when 'field-executive' then 'mst.field-executive-master'
    when 'fieldexecutive' then 'mst.field-executive-master'
    when 'sales-executive' then 'mst.sales-executive-master'
    when 'salesexecutive' then 'mst.sales-executive-master'
    when 'vendor' then 'mst.vendor-master'
    when 'product' then 'mst.product-master'
    when 'product-type' then 'mst.product-type'
    when 'producttype' then 'mst.product-type'
    when 'charge' then 'mst.charge-master'
    when 'airline' then 'mst.airlines'
    when 'bank' then 'mst.bank-master'
    when 'area' then 'mst.area-master'
    when 'inscan-remark' then 'mst.inscan-remarks'
    when 'inscanremark' then 'mst.inscan-remarks'
    else 'unknown.lookup'
  end
$$;

-- Split combined "list OR search" predicates.
-- lookup_* / search_* keep Search. Every other read keeps List.
do $split$
declare
  r record;
  v_def text;
  v_new text;
  v_action text;
  v_count integer := 0;
begin
  for r in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname <> 'user_has_permission'
  loop
    v_def := pg_get_functiondef(r.oid);
    if v_def !~ 'user_has_permission\(' then
      continue;
    end if;
    v_action := case
      when r.proname ~ '^(search_|lookup_)' then 'search'
      else 'list'
    end;
    v_new := regexp_replace(
      v_def,
      $re$if not app\.user_has_permission\s*\(([^,\n]+),\s*('[^']+'),\s*'list'\)\s+and not app\.user_has_permission\s*\(\1,\s*\2,\s*'search'\) then$re$,
      format('if not app.user_has_permission(\1, \2, %L) then', v_action),
      'g'
    );
    if v_new is distinct from v_def then
      execute v_new;
      v_count := v_count + 1;
    end if;
  end loop;

  if v_count < 5 then
    raise exception '0133 expected to split list/search gates, patched % functions', v_count;
  end if;
end
$split$;

do $lookup_gate$
declare
  v_def text;
  v_new text;
  v_anchor text := $a$if app.current_user_id() is null then
    return;
  end if;$a$;
  v_inject text := $a$if app.current_user_id() is null then
    return;
  end if;
  if not app.user_has_permission(app.current_tenant_id(), app.lookup_permission_slug(p_key), 'search') then
    raise exception 'Search permission is required' using errcode = '42501';
  end if;$a$;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'lookup'
    and pg_get_function_identity_arguments(p.oid) = 'p_key text, p_q text, p_limit integer';
  if v_def is null then
    raise exception '0133 could not find public.lookup(text, text, integer)';
  end if;
  if v_def like '%lookup_permission_slug%' then
    return;
  end if;
  if position(v_anchor in v_def) = 0 then
    raise exception '0133 could not find the lookup authentication anchor';
  end if;
  v_new := replace(v_def, v_anchor, v_inject);
  execute v_new;
end
$lookup_gate$;

do $party_gate$
declare
  v_def text;
  v_new text;
  v_anchor text := $a$if v_role not in ('shipper', 'consignee') then
    raise exception 'p_role must be shipper or consignee' using errcode = '22023';
  end if;$a$;
  v_inject text := $a$if v_role not in ('shipper', 'consignee') then
    raise exception 'p_role must be shipper or consignee' using errcode = '22023';
  end if;
  if not app.user_has_permission(
    v_tenant,
    case v_role when 'consignee' then 'mst.consignee-master' else 'mst.shipper-master' end,
    'search'
  ) then
    raise exception 'Search permission is required' using errcode = '42501';
  end if;$a$;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'search_party_contacts'
  order by p.oid desc
  limit 1;
  if v_def is null or v_def like '%Search permission is required%' then
    return;
  end if;
  if position(v_anchor in v_def) = 0 then
    raise exception '0133 could not find the party-contact search anchor';
  end if;
  v_new := replace(v_def, v_anchor, v_inject);
  execute v_new;
end
$party_gate$;

do $postal_gate$
declare
  v_def text;
  v_new text;
  v_anchor text := $a$begin
  if v_prefix is null or length(v_prefix) < 3 then$a$;
  v_inject text := $a$begin
  if not app.user_has_permission(app.current_tenant_id(), 'mst.pincode-master', 'search') then
    raise exception 'Search permission is required' using errcode = '42501';
  end if;
  if v_prefix is null or length(v_prefix) < 3 then$a$;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'search_postal_pincodes'
  order by p.oid desc
  limit 1;
  if v_def is null or position('mst.pincode-master' in v_def) > 0 then
    return;
  end if;
  if position(v_anchor in v_def) = 0 then
    raise exception '0133 could not find the postal pincode search anchor';
  end if;
  v_new := replace(v_def, v_anchor, v_inject);
  execute v_new;
end
$postal_gate$;

do $irn_gate$
declare
  v_def text;
  v_new text;
  v_anchor text := $a$if v_act in ('list', 'search', 'status', 'view') then
    if app.user_has_permission(p_tenant, v_slug, 'list')
       or app.user_has_permission(p_tenant, v_slug, 'search')
       or app.user_has_permission(p_tenant, v_slug, 'add')
       or app.user_has_permission(p_tenant, v_slug, 'modify') then
      return;
    end if;$a$;
  v_inject text := $a$if v_act = 'search' then
    if app.user_has_permission(p_tenant, v_slug, 'search') then
      return;
    end if;
  elsif v_act in ('list', 'status', 'view') then
    if app.user_has_permission(p_tenant, v_slug, 'list') then
      return;
    end if;$a$;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app' and p.proname = 'assert_irn_permission';
  if v_def is null then
    return;
  end if;
  if position(v_anchor in v_def) = 0 then
    if position('v_act = ''search''' in v_def) > 0 then
      return;
    end if;
    raise exception '0133 could not find the IRN list/search gate';
  end if;
  v_new := replace(v_def, v_anchor, v_inject);
  execute v_new;
end
$irn_gate$;

do $product_types$
declare
  v_def text;
  v_new text;
  v_anchor text := $a$if not app.user_has_permission(v_tenant, 'mst.product-master', 'search')
     and not app.user_has_permission(v_tenant, 'mst.product-type', 'search')
     and not app.user_has_permission(v_tenant, 'mst.product-master', 'list')
     and not app.user_has_permission(v_tenant, 'mst.product-type', 'list') then$a$;
  v_inject text := $a$if not app.user_has_permission(v_tenant, 'mst.product-master', 'list')
     and not app.user_has_permission(v_tenant, 'mst.product-type', 'list') then$a$;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'ensure_canonical_product_types'
    and pg_get_function_identity_arguments(p.oid) = '';
  if v_def is null or position(v_anchor in v_def) = 0 then
    return;
  end if;
  v_new := replace(v_def, v_anchor, v_inject);
  execute v_new;
end
$product_types$;

notify pgrst, 'reload schema';

select c.relname as table_name,
       pol.polname as policy_name,
       pg_get_expr(pol.polqual, pol.polrelid) like '%user_has_permission%' as checks_permission,
       pg_get_expr(pol.polqual, pol.polrelid) like '%''list''%' as requires_list
from pg_policy pol
join pg_class c on c.oid = pol.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and pol.polcmd = 'r'
  and c.relname in ('customers', 'shipments', 'invoices')
order by c.relname;
