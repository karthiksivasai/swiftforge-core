-- ===========================================================================
-- 0143  Unlock clears locked_by and locked_at on the AWB.
-- ---------------------------------------------------------------------------
-- Who locked an AWB, and when, stays in the audit log. The shipment columns
-- describe the current lock only, so an unlock clears them. unlocked_by and
-- unlocked_at still record the latest unlock on the row.
-- ===========================================================================

comment on column public.shipments.locked_by is
  'auth.uid() of the user who locked this AWB. Cleared on unlock. History stays in audit_logs.';
comment on column public.shipments.locked_at is
  'When this AWB was locked. Cleared on unlock. History stays in audit_logs.';

create or replace function app.tg_shipments_lock_stamp()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_locked then
      new.locked_by := coalesce(new.locked_by, auth.uid());
      new.locked_at := coalesce(new.locked_at, now());
    else
      new.locked_by := null;
      new.locked_at := null;
    end if;
    return new;
  end if;

  if new.is_locked is true and old.is_locked is distinct from true then
    new.locked_by := auth.uid();
    new.locked_at := now();
  elsif new.is_locked is distinct from true and old.is_locked is true then
    new.unlocked_by := auth.uid();
    new.unlocked_at := now();
    new.locked_by := null;
    new.locked_at := null;
  end if;
  return new;
end
$$;

comment on function app.tg_shipments_lock_stamp() is
  'Stamp the current lock, or clear locked_by/locked_at when the AWB is unlocked.';

create or replace function public.unlock_shipment(p_id uuid)
returns public.shipments
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_s public.shipments;
  v_locked_by uuid;
  v_locked_at timestamptz;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not app.user_has_permission(v_tenant, 'txn.awb-unlock', 'modify') then
    raise exception 'Permission denied: txn.awb-unlock' using errcode = '42501';
  end if;

  select * into v_s
    from public.shipments
   where id = p_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;

  -- Capture the locker before the update. The trigger clears those columns.
  v_locked_by := v_s.locked_by;
  v_locked_at := v_s.locked_at;

  update public.shipments set
    is_locked = false,
    updated_by = auth.uid()
  where id = v_s.id
  returning * into v_s;

  perform app.write_audit_log(
    p_tenant_id => v_tenant,
    p_entity_type => 'shipments',
    p_action => 'MODIFY',
    p_entity_id => v_s.id,
    p_module_slug => 'txn.awb-unlock',
    p_old => jsonb_build_object(
      'is_locked', true,
      'awb_no', v_s.awb_no,
      'locked_by', v_locked_by,
      'locked_at', v_locked_at),
    p_new => jsonb_build_object(
      'change', 'unlock',
      'is_locked', false,
      'awb_no', v_s.awb_no,
      'unlocked_by', v_s.unlocked_by,
      'unlocked_at', v_s.unlocked_at,
      'locked_by', null,
      'locked_at', null));

  return v_s;
end
$$;

comment on function public.unlock_shipment(uuid) is
  'Clear is_locked and the lock actor columns. Requires txn.awb-unlock. The audit row keeps who locked it and when.';

-- Rows already unlocked still carried the old locker. The columns now mean
-- "currently locked", so clear them. Locked rows are left as they are.
update public.shipments
   set locked_by = null,
       locked_at = null
 where coalesce(is_locked, false) = false
   and (locked_by is not null or locked_at is not null);

notify pgrst, 'reload schema';
