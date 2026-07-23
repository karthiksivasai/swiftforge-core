-- International destinations only (AWB consignee destination picker).

create or replace function public.lookup_international_destinations(
  p_q text default null,
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

  return query
  select d.id, d.code, d.name, d.dest_type
  from public.destinations d
  where d.tenant_id in (select app.user_tenant_ids())
    and d.deleted_at is null
    and d.status = 'ACTIVE'
    and d.dest_type = 'INTERNATIONAL'
    and (d.name ilike v_pat or d.code ilike v_pat)
  order by d.name, d.code, d.id
  limit v_limit;
end;
$$;

revoke all on function public.lookup_international_destinations(text, integer) from public;
grant execute on function public.lookup_international_destinations(text, integer) to authenticated;

comment on function public.lookup_international_destinations(text, integer) is
  'Tenant-safe autocomplete for ACTIVE international destinations only (AWB consignee destination).';
