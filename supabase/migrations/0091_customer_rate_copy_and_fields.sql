-- ===========================================================================
-- 0091  Customer Rate — CW fields + copy rates
-- ---------------------------------------------------------------------------
-- Extends customer_rates with contract_no / country / vendor (CourierWala
-- Client Rate filters) and adds copy_customer_rates for Copy Client Rate.
-- ===========================================================================

alter table public.customer_rates
  add column if not exists contract_no text,
  add column if not exists country_id uuid,
  add column if not exists vendor_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'customer_rates_country_fk') then
    alter table public.customer_rates
      add constraint customer_rates_country_fk
      foreign key (tenant_id, country_id)
      references public.countries (tenant_id, id)
      on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'customer_rates_vendor_fk') then
    alter table public.customer_rates
      add constraint customer_rates_vendor_fk
      foreign key (tenant_id, vendor_id)
      references public.vendors (tenant_id, id)
      on delete set null;
  end if;
end $$;

create index if not exists customer_rates_contract_idx
  on public.customer_rates (tenant_id, contract_no)
  where deleted_at is null and contract_no is not null;

-- Copy rates from one filter set to another, optional % increase + round.
create or replace function public.copy_customer_rates(p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_pct numeric := coalesce((p_fields->>'percentage_increase')::numeric, 0);
  v_round boolean := coalesce((p_fields->>'round_rates')::boolean, false);
  v_from jsonb := coalesce(p_fields->'copy_from', '{}'::jsonb);
  v_to jsonb := coalesce(p_fields->'copy_to', '{}'::jsonb);
  v_src record;
  v_copied int := 0;
  v_rate numeric;
  v_to_customer uuid;
  v_to_from_date date;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not app.user_has_permission(v_tenant, 'mst.customer-contract-master', 'add') then
    raise exception 'Permission denied: mst.customer-contract-master add' using errcode = '42501';
  end if;

  if v_pct < 0 or v_pct > 100 then
    raise exception 'Percentage increase must be between 0 and 100' using errcode = 'CMS04';
  end if;

  v_to_customer := nullif(v_to->>'customer_id', '')::uuid;
  if v_to_customer is null then
    raise exception 'Copy To Customer is required' using errcode = 'CMS04';
  end if;

  v_to_from_date := coalesce(nullif(v_to->>'from_date', '')::date, current_date);

  for v_src in
    select r.*
      from public.customer_rates r
     where r.tenant_id = v_tenant
       and r.deleted_at is null
       and r.status = 'ACTIVE'
       and (nullif(v_from->>'customer_id','') is null
            or r.customer_id = (v_from->>'customer_id')::uuid)
       and (nullif(v_from->>'product_id','') is null
            or r.product_id = (v_from->>'product_id')::uuid)
       and (nullif(v_from->>'service','') is null
            or upper(coalesce(r.service,'')) = upper(v_from->>'service'))
       and (nullif(v_from->>'from_date','') is null
            or r.from_date = (v_from->>'from_date')::date)
       and (nullif(v_from->>'zone_id','') is null
            or r.zone_id = (v_from->>'zone_id')::uuid)
       and (nullif(v_from->>'origin_destination_id','') is null
            or r.origin_destination_id = (v_from->>'origin_destination_id')::uuid)
       and (nullif(v_from->>'destination_id','') is null
            or r.destination_id = (v_from->>'destination_id')::uuid)
       and (nullif(v_from->>'country_id','') is null
            or r.country_id = (v_from->>'country_id')::uuid)
       and (nullif(v_from->>'vendor_id','') is null
            or r.vendor_id = (v_from->>'vendor_id')::uuid)
  loop
    v_rate := v_src.rate_per_kg * (1 + (v_pct / 100.0));
    if v_round then
      v_rate := round(v_rate, 0);
    else
      v_rate := round(v_rate, 4);
    end if;

    insert into public.customer_rates (
      tenant_id, customer_id, product_id, service,
      origin_destination_id, destination_id, zone_id,
      country_id, vendor_id, contract_no,
      from_date, to_date, min_weight, rate_per_kg, fuel_pct, other_charges, status
    ) values (
      v_tenant,
      v_to_customer,
      coalesce(nullif(v_to->>'product_id','')::uuid, v_src.product_id),
      coalesce(nullif(btrim(v_to->>'service'), ''), v_src.service),
      coalesce(nullif(v_to->>'origin_destination_id','')::uuid, v_src.origin_destination_id),
      coalesce(nullif(v_to->>'destination_id','')::uuid, v_src.destination_id),
      coalesce(nullif(v_to->>'zone_id','')::uuid, v_src.zone_id),
      coalesce(nullif(v_to->>'country_id','')::uuid, v_src.country_id),
      coalesce(nullif(v_to->>'vendor_id','')::uuid, v_src.vendor_id),
      coalesce(nullif(btrim(v_to->>'contract_no'), ''), v_src.contract_no),
      v_to_from_date,
      v_src.to_date,
      v_src.min_weight,
      v_rate,
      v_src.fuel_pct,
      v_src.other_charges,
      'ACTIVE'
    );
    v_copied := v_copied + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'copied', v_copied,
    'percentage_increase', v_pct,
    'round_rates', v_round
  );
end;
$$;

revoke all on function public.copy_customer_rates(jsonb) from public;
grant execute on function public.copy_customer_rates(jsonb) to authenticated, service_role;

comment on function public.copy_customer_rates(jsonb) is
  'Copy ACTIVE customer rates from filter set to another customer, with optional % increase.';
