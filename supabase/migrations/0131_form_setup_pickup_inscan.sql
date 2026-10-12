-- 0131  Form Setup label matches live Xpresion: "PickUp Inscan"
-- Saved rows that used the previous label "Inscan" move to the live label.
-- Booking and delivery email rows are left in email_configurations.

update public.tenant_settings as old
   set key = 'form_setup:PickUp Inscan'
 where old.key = 'form_setup:Inscan'
   and not exists (
     select 1
       from public.tenant_settings as kept
      where kept.tenant_id = old.tenant_id
        and kept.scope = old.scope
        and kept.branch_id is not distinct from old.branch_id
        and kept.key = 'form_setup:PickUp Inscan'
   );

create or replace function public.get_form_setup(p_module text)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_module text := btrim(coalesce(p_module, ''));
  v_row public.tenant_settings;
begin
  perform app.assert_notification_permission(v_tenant, 'search');
  if v_module not in (
    'AWB Entry','Manifest','Scan','PickUp Inscan','AWB Query','DRS Scan','PickUp','RCP Entry'
  ) then
    raise exception 'Unknown form setup module' using errcode = 'CMS04';
  end if;
  select * into v_row from public.tenant_settings
   where tenant_id = v_tenant and scope = 'TENANT' and branch_id is null
     and key = 'form_setup:' || v_module;
  return jsonb_build_object(
    'module', v_module,
    'fields', coalesce(v_row.value->'fields', '[]'::jsonb),
    'row_version', v_row.row_version);
end
$$;

revoke all on function public.get_form_setup(text) from public;
grant execute on function public.get_form_setup(text) to authenticated, service_role;

create or replace function public.save_form_setup(
  p_module text,
  p_fields jsonb,
  p_row_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_module text := btrim(coalesce(p_module, ''));
begin
  perform app.assert_notification_permission(v_tenant, 'modify');
  if v_module not in (
    'AWB Entry','Manifest','Scan','PickUp Inscan','AWB Query','DRS Scan','PickUp','RCP Entry'
  ) then
    raise exception 'Unknown form setup module' using errcode = 'CMS04';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'array' then
    raise exception 'Form setup fields are required' using errcode = 'CMS04';
  end if;
  perform app.upsert_tenant_setting(
    v_tenant, 'TENANT', null, 'form_setup:' || v_module,
    jsonb_build_object('fields', p_fields), p_row_version);
  return public.get_form_setup(v_module);
end
$$;

revoke all on function public.save_form_setup(text, jsonb, integer) from public;
grant execute on function public.save_form_setup(text, jsonb, integer)
  to authenticated, service_role;

notify pgrst, 'reload schema';
