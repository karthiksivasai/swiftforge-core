-- ===========================================================================
-- 0152  Retired job runners still check permission before they refuse.
-- ---------------------------------------------------------------------------
-- 0151 made execute_rate_update_job and execute_zone_update_job raise.
-- They stay refused. They now check the same permission first, so a signed-in
-- user without that permission is denied before the retirement message.
-- ===========================================================================

create or replace function public.execute_rate_update_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  perform app.assert_rate_update_execute_permission(v_tenant);
  raise exception 'Rate update jobs are retired. Use Rate Update preview, then confirm.'
    using errcode = 'CMS04';
end
$$;

create or replace function public.execute_zone_update_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  perform app.assert_zone_update_execute_permission(v_tenant);
  raise exception 'Zone update jobs are retired. A zone import does not change booked AWBs.'
    using errcode = 'CMS04';
end
$$;
