-- postal_pincodes is reference data; avoid app.tg_touch_row() which requires row_version.

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
