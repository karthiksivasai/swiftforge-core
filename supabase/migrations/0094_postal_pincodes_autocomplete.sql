-- ===========================================================================
-- 0094  India Post reference dataset for pincode prefix autocomplete (AWB)
-- ---------------------------------------------------------------------------
-- Separate from tenant-scoped public.pincodes (operational master in 0015).
-- Populated via scripts/import-postal-pincodes.mjs from India Post CSV export.
-- ===========================================================================

create table if not exists public.postal_pincodes (
  id            bigserial primary key,
  country_code  text not null default 'IN',
  pincode       text not null,
  city          text not null default '',
  district      text not null default '',
  state         text not null default '',
  country       text not null default 'India',
  latitude      numeric(10, 7),
  longitude     numeric(10, 7),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint postal_pincodes_country_pin_uq unique (country_code, pincode)
);

create index if not exists postal_pincodes_pin_idx
  on public.postal_pincodes (pincode);

create index if not exists postal_pincodes_city_idx
  on public.postal_pincodes (city);

create index if not exists postal_pincodes_state_idx
  on public.postal_pincodes (state);

create index if not exists postal_pincodes_prefix_idx
  on public.postal_pincodes (country_code, pincode text_pattern_ops);

create or replace function public.tg_postal_pincodes_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_touch_postal_pincodes on public.postal_pincodes;
create trigger trg_touch_postal_pincodes
  before insert or update on public.postal_pincodes
  for each row execute function public.tg_postal_pincodes_touch();

alter table public.postal_pincodes enable row level security;

drop policy if exists postal_pincodes_read on public.postal_pincodes;
create policy postal_pincodes_read on public.postal_pincodes
  for select to authenticated
  using (is_active);

-- Prefix search for autocomplete (min 3 digits, max 15 rows).
create or replace function public.search_postal_pincodes(
  p_prefix text,
  p_country_code text default 'IN',
  p_limit integer default 15
)
returns table (
  id bigint,
  pincode text,
  city text,
  district text,
  state text,
  country text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_prefix text := nullif(trim(p_prefix), '');
  v_country text := upper(coalesce(nullif(trim(p_country_code), ''), 'IN'));
  v_limit integer := least(greatest(coalesce(p_limit, 15), 1), 100);
begin
  if v_prefix is null or length(v_prefix) < 3 then
    return;
  end if;

  if v_prefix !~ '^[0-9]+$' then
    return;
  end if;

  return query
  select
    p.id,
    p.pincode,
    p.city,
    p.district,
    p.state,
    p.country
  from public.postal_pincodes p
  where p.is_active
    and p.country_code = v_country
    and p.pincode like v_prefix || '%'
  order by p.pincode
  limit v_limit;
end;
$$;

revoke all on function public.search_postal_pincodes(text, text, integer) from public;
grant execute on function public.search_postal_pincodes(text, text, integer) to authenticated;
