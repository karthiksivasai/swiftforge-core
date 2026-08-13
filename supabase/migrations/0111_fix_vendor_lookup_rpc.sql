-- 0111: Fix vendor lookup query in public.lookup()
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

  elsif p_key = 'branch' or p_key = 'service-center' then
    return query
      select b.id, b.code, b.name, b.city
      from public.branches b
      where b.tenant_id in (select app.user_tenant_ids())
        and b.deleted_at is null
        and b.status = 'ACTIVE'
        and (b.name ilike v_pat or b.code ilike v_pat or b.city ilike v_pat)
      order by b.name, b.code, b.id
      limit v_limit;

  elsif p_key = 'customer' then
    return query
      select c.id, c.code, c.name, c.city
      from public.customers c
      where c.tenant_id in (select app.user_tenant_ids())
        and c.deleted_at is null
        and c.status = 'ACTIVE'
        and (c.name ilike v_pat or c.code ilike v_pat or c.city ilike v_pat)
      order by c.name, c.code, c.id
      limit v_limit;

  elsif p_key = 'shipper' then
    return query
      select s.id, s.code, s.name, s.city
      from public.shippers s
      where s.tenant_id in (select app.user_tenant_ids())
        and s.deleted_at is null
        and s.status = 'ACTIVE'
        and (s.name ilike v_pat or s.code ilike v_pat or s.city ilike v_pat)
      order by s.name, s.code, s.id
      limit v_limit;

  elsif p_key = 'field-executive' or p_key = 'fieldExecutive' then
    return query
      select fe.id, fe.code, fe.name, fe.phone
      from public.field_executives fe
      where fe.tenant_id in (select app.user_tenant_ids())
        and fe.deleted_at is null
        and fe.status = 'ACTIVE'
        and (fe.name ilike v_pat or fe.code ilike v_pat)
      order by fe.name, fe.code, fe.id
      limit v_limit;

  elsif p_key = 'sales-executive' or p_key = 'salesExecutive' then
    return query
      select se.id, se.code, se.name, se.phone
      from public.sales_executives se
      where se.tenant_id in (select app.user_tenant_ids())
        and se.deleted_at is null
        and se.status = 'ACTIVE'
        and (se.name ilike v_pat or se.code ilike v_pat)
      order by se.name, se.code, se.id
      limit v_limit;

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

  elsif p_key = 'product' then
    return query
      select pr.id, pr.code, pr.name, pr.product_type
      from public.products pr
      where pr.tenant_id in (select app.user_tenant_ids())
        and pr.deleted_at is null
        and pr.status = 'ACTIVE'
        and (pr.name ilike v_pat or pr.code ilike v_pat)
      order by pr.name, pr.code, pr.id
      limit v_limit;

  elsif p_key = 'area' then
    return query
      select a.id, a.code, a.name, null::text
      from public.areas a
      where a.tenant_id in (select app.user_tenant_ids())
        and a.deleted_at is null
        and (a.name ilike v_pat or a.code ilike v_pat)
      order by a.name, a.code, a.id
      limit v_limit;

  elsif p_key = 'inscan-remark' or p_key = 'inscanRemark' then
    return query
      select ir.id, ir.code, ir.name, ir.category
      from public.inscan_remarks ir
      where ir.tenant_id in (select app.user_tenant_ids())
        and ir.deleted_at is null
        and ir.status = 'ACTIVE'
        and (ir.code ilike v_pat or ir.name ilike v_pat)
      order by ir.code, ir.id
      limit v_limit;

  end if;
end;
$$;

revoke all on function public.lookup(text, text, integer) from public;
grant execute on function public.lookup(text, text, integer) to authenticated, service_role;
