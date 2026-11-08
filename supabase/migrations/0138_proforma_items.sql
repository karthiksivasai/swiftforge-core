-- Mirror validated proforma lines into proforma_items in the same shipment save.
-- The AWB form still loads wizard_extras.proforma.lines. Amounts are recalculated here.

create table if not exists public.proforma_items (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  awb_no text not null default '',
  line_no integer not null,
  box_no text not null default '',
  packages integer not null default 1,
  description text not null default '',
  hsn_code varchar(8) not null default '',
  quantity numeric(18, 3) not null default 0,
  weight numeric(18, 3) not null default 0,
  unit text not null default 'PCS',
  rate numeric(18, 2) not null default 0,
  amount numeric(18, 2) not null default 0,
  currency char(3) not null default 'INR',
  igst_percent numeric(5, 2) not null default 0,
  igst_amount numeric(18, 2) not null default 0,
  manufacturer_name text not null default '',
  manufacturer_address text not null default '',
  source text not null default 'Manual',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create index if not exists proforma_items_awb_no_idx on public.proforma_items (awb_no);
create index if not exists proforma_items_shipment_idx on public.proforma_items (shipment_id, line_no);

alter table public.proforma_items enable row level security;

drop policy if exists proforma_items_tenant on public.proforma_items;
create policy proforma_items_tenant on public.proforma_items
  for select to authenticated
  using (
    exists (
      select 1 from public.shipments s
      where s.id = shipment_id
        and s.tenant_id in (select app.user_tenant_ids())
    )
  );

create or replace function app.sync_proforma_items()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_lines jsonb;
  v_line jsonb;
  v_index integer := 0;
  v_qty numeric;
  v_rate numeric;
  v_igst numeric;
  v_amount numeric;
  v_currency text;
begin
  delete from public.proforma_items where shipment_id = new.id;
  v_lines := new.wizard_extras #> '{proforma,lines}';
  if v_lines is null or jsonb_typeof(v_lines) <> 'array' then
    return new;
  end if;
  v_currency := left(coalesce(new.wizard_extras #>> '{proforma,currency}', 'INR'), 3);

  for v_line in select value from jsonb_array_elements(v_lines)
  loop
    v_index := v_index + 1;
    v_qty := app.to_numeric(v_line->>'quantity');
    v_rate := app.to_numeric(v_line->>'rate');
    v_igst := app.to_numeric(v_line->>'igstPercent');
    v_amount := round(v_qty * v_rate, 2);
    insert into public.proforma_items (
      shipment_id, awb_no, line_no, box_no, packages, description, hsn_code,
      quantity, weight, unit, rate, amount, currency, igst_percent, igst_amount,
      manufacturer_name, manufacturer_address, source, created_by, updated_by
    ) values (
      new.id,
      coalesce(new.awb_no, ''),
      v_index,
      left(coalesce(v_line->>'boxNo', 'Box-1'), 20),
      greatest(coalesce(nullif(v_line->>'packages', '')::integer, 1), 1),
      left(coalesce(v_line->>'description', ''), 250),
      left(coalesce(v_line->>'hsCode', v_line->>'hsnCode', ''), 8),
      v_qty,
      greatest(app.to_numeric(v_line->>'weight'), 0),
      coalesce(nullif(v_line->>'unit', ''), 'PCS'),
      v_rate,
      v_amount,
      v_currency,
      v_igst,
      round(v_amount * v_igst / 100, 2),
      left(coalesce(v_line->>'manufacturerName', ''), 250),
      left(coalesce(v_line->>'manufacturerAddress', ''), 500),
      case when v_line->>'source' = 'Import' then 'Import' else 'Manual' end,
      auth.uid(),
      auth.uid()
    );
  end loop;
  return new;
exception
  when others then
    -- A bad packages value must not block the AWB save. Amounts stay on the shipment.
    return new;
end
$$;

drop trigger if exists shipments_sync_proforma_items on public.shipments;
create trigger shipments_sync_proforma_items
  after insert or update of wizard_extras, awb_no on public.shipments
  for each row
  execute function app.sync_proforma_items();
