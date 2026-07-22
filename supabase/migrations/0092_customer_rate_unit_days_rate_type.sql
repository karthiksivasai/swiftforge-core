-- ===========================================================================
-- 0092  Customer Rate — unit / days / rate_type (CW Add form)
-- ---------------------------------------------------------------------------
-- Supports CourierWala Customer Rate entry: Unit, Days (transit), Rate Type
-- alongside weight/rate lines (stored as min_weight / rate_per_kg rows).
-- ===========================================================================

alter table public.customer_rates
  add column if not exists unit text,
  add column if not exists transit_days integer,
  add column if not exists rate_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'customer_rates_unit_chk'
  ) then
    alter table public.customer_rates
      add constraint customer_rates_unit_chk
      check (unit is null or unit in ('KG', 'LB', 'CBM', 'PIECE'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'customer_rates_rate_type_chk'
  ) then
    alter table public.customer_rates
      add constraint customer_rates_rate_type_chk
      check (
        rate_type is null
        or rate_type in ('FLAT', 'PER_KG', 'PER_SLAB', 'MINIMUM')
      );
  end if;
end $$;

comment on column public.customer_rates.unit is 'Charge unit: KG | LB | CBM | PIECE';
comment on column public.customer_rates.transit_days is 'Transit days for the rate contract line';
comment on column public.customer_rates.rate_type is 'FLAT | PER_KG | PER_SLAB | MINIMUM';
