-- Recalculate proforma line amount and IGST when a shipment is saved.
-- Lines stay in wizard_extras.proforma.lines, which the AWB form already loads.

create or replace function app.to_numeric(p_value text)
returns numeric
language plpgsql
immutable
as $$
begin
  return coalesce(nullif(trim(p_value), '')::numeric, 0);
exception
  when others then
    return 0;
end
$$;

create or replace function app.normalize_shipment_proforma()
returns trigger
language plpgsql
as $$
declare
  v_lines jsonb;
  v_out jsonb := '[]'::jsonb;
  v_line jsonb;
  v_qty numeric;
  v_rate numeric;
  v_igst numeric;
  v_amount numeric;
begin
  if new.wizard_extras is null or jsonb_typeof(new.wizard_extras) <> 'object' then
    return new;
  end if;
  v_lines := new.wizard_extras #> '{proforma,lines}';
  if v_lines is null or jsonb_typeof(v_lines) <> 'array' then
    return new;
  end if;

  for v_line in select value from jsonb_array_elements(v_lines)
  loop
    v_qty := app.to_numeric(v_line->>'quantity');
    v_rate := app.to_numeric(v_line->>'rate');
    v_igst := app.to_numeric(v_line->>'igstPercent');
    v_amount := round(v_qty * v_rate, 2);
    v_out := v_out || jsonb_build_array(
      v_line || jsonb_build_object(
        'amount', trim(to_char(v_amount, '999999990.00')),
        'igstAmount', trim(to_char(round(v_amount * v_igst / 100, 2), '999999990.00'))
      )
    );
  end loop;

  new.wizard_extras := jsonb_set(new.wizard_extras, '{proforma,lines}', v_out, true);
  return new;
end
$$;

drop trigger if exists shipments_normalize_proforma on public.shipments;
create trigger shipments_normalize_proforma
  before insert or update of wizard_extras on public.shipments
  for each row
  execute function app.normalize_shipment_proforma();
