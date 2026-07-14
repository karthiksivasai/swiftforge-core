-- ===========================================================================
-- 0017  shared lookup RPC for geo masters (Phase 3, blueprint 03 §4)
-- ---------------------------------------------------------------------------
-- One reusable, tenant-safe autocomplete surface for every geo master. The
-- frontend never SELECTs the tables directly for pickers; it calls:
--
--     select * from public.lookup(p_key, p_q, p_limit);
--       -> table(id uuid, code text, name text, hint text)
--
-- Contract & guarantees:
--   * Tenant isolation — results are always filtered to the caller's tenant(s)
--     via app.user_tenant_ids(); an unauthenticated / tenant-less caller gets
--     an empty set (never an error, never another tenant's rows).
--   * SECURITY DEFINER — runs as owner so it does not depend on per-table RLS
--     for reads, but re-imposes the SAME tenant predicate the RLS SELECT policy
--     uses, so it can never leak across tenants. No permission slug is required
--     (pickers must work for any active member filling a form; this mirrors the
--     blueprint's "shared lookups" surface).
--   * Trigram search — q is matched with ILIKE '%q%' against the columns backed
--     by the gin_trgm_ops indexes from 0015 (name / pin_code / pin_name), so
--     partial matches stay index-friendly on large masters (pincodes).
--   * Stable ordering — deterministic ORDER BY (name/code, then id) so repeated
--     calls and paginated UIs return rows in the same order every time.
--   * Result limiting — p_limit is clamped to [1, 200] (default 50) to bound
--     payload size regardless of what the client sends.
--
-- Keys (geo scope only): country, zone, state, destination, pin-code,
-- country-pincode, area. Unknown keys raise (invalid_parameter_value).
--
-- STABLE + read-only: safe to call heavily; no writes, no audit.
-- Idempotent migration: create or replace.
-- ===========================================================================

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
  -- Clamp to a sane window: never < 1, never > 200, default 50.
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  -- ILIKE pattern; wildcards in the user input are escaped so a literal '%'
  -- or '_' is matched as text. Empty/absent q -> '%%' matches everything
  -- (top-N of the master), which the trigram indexes still serve fine.
  v_pat text := '%' ||
    replace(replace(coalesce(btrim(p_q), ''), '%', '\%'), '_', '\_') || '%';
begin
  -- No authenticated user => no tenant context => empty (defensive; the tenant
  -- predicate below already yields nothing, but this avoids needless scanning).
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
    -- Only ACTIVE destinations are selectable in pickers.
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
    -- Areas have no separate code; expose name as both code and name.
    return query
      select a.id, a.name, a.name, null::text
      from public.areas a
      where a.tenant_id in (select app.user_tenant_ids())
        and a.deleted_at is null
        and a.name ilike v_pat
      order by a.name, a.id
      limit v_limit;

  else
    raise exception 'Unknown lookup key: %', p_key using errcode = '22023';
  end if;
end
$$;

comment on function public.lookup(text, text, integer) is
  'Shared tenant-safe autocomplete for geo masters. Keys: country, zone, state, destination, pin-code, country-pincode, area. Trigram ILIKE search, stable order, limit clamped to [1,200].';

-- ---- grants --------------------------------------------------------------
-- Any active member may drive form pickers; service_role for server contexts.
grant execute on function public.lookup(text, text, integer) to authenticated, service_role;
