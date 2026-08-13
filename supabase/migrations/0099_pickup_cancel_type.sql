-- ===========================================================================
-- 0099  pickups cancel_type and pickup pass — Phase 4 Parity
-- ---------------------------------------------------------------------------
-- 1. Adds cancel_type ('CALL_CANCEL' | 'ATTEMPT_CANCEL') to distinguish between
--    customer-initiated cancellation and executive on-field attempt failures.
-- 2. Adds passed ('YES' / null), passed_at, passed_by, pass_reason for single
--    pickup reassignment (Pickup Pass).
-- 3. Updates cancel_pickup and creates pass_pickup RPC.
-- ===========================================================================

alter table public.pickups
  add column if not exists cancel_type text
    check (cancel_type is null or cancel_type in ('CALL_CANCEL', 'ATTEMPT_CANCEL')),
  add column if not exists passed text,
  add column if not exists passed_at timestamptz,
  add column if not exists passed_by uuid,
  add column if not exists pass_reason text;

comment on column public.pickups.cancel_type is
  'Type of cancellation: CALL_CANCEL (customer cancelled before attempt) vs ATTEMPT_CANCEL (executive attempted but could not collect).';
comment on column public.pickups.passed is
  'Flag indicating single-record reassignment (YES).';

create index if not exists pickups_tenant_cancel_type_idx
  on public.pickups (tenant_id, cancel_type)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Update cancel_pickup RPC to accept and record cancel_type
-- ---------------------------------------------------------------------------
create or replace function public.cancel_pickup(
  p_id          uuid,
  p_row_version integer,
  p_reason      text default null,
  p_cancel_type text default 'CALL_CANCEL'
)
returns public.pickups
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant      uuid;
  v_p           public.pickups;
  v_cancel_type text;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not (app.user_has_permission(v_tenant, 'txn.pickup-cancel', 'add')
       or app.user_has_permission(v_tenant, 'txn.pickup-cancel', 'modify')
       or app.user_has_permission(v_tenant, 'txn.pickup', 'modify')) then
    raise exception 'Permission denied: txn.pickup-cancel' using errcode = '42501';
  end if;

  v_cancel_type := upper(nullif(btrim(coalesce(p_cancel_type, '')), ''));
  if v_cancel_type is not null and v_cancel_type not in ('CALL_CANCEL', 'ATTEMPT_CANCEL') then
    raise exception 'Invalid cancel_type: must be CALL_CANCEL or ATTEMPT_CANCEL' using errcode = '22023';
  end if;

  select * into v_p from public.pickups
    where id = p_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'Pickup not found' using errcode = 'P0002';
  end if;

  perform app.assert_status_transition('PICKUP', v_p.status, 'CANCELLED');

  update public.pickups set
    status       = 'CANCELLED',
    cancel_type  = coalesce(v_cancel_type, 'CALL_CANCEL'),
    reason       = coalesce(nullif(btrim(coalesce(p_reason,'')),''), reason),
    cancelled_at = now(),
    cancelled_by = auth.uid(),
    edited_by    = auth.uid(),
    updated_by   = auth.uid()
  where id = p_id and tenant_id = v_tenant and deleted_at is null
    and row_version = p_row_version
  returning * into v_p;

  if not found then
    raise exception 'This record was changed by someone else. Reload and try again.'
      using errcode = '40001';
  end if;

  perform app.write_audit_log(
    p_tenant_id   => v_tenant,
    p_entity_type => 'pickups',
    p_action      => 'MODIFY',
    p_entity_id   => v_p.id,
    p_module_slug => 'txn.pickup-cancel',
    p_new         => jsonb_build_object(
      'status', 'CANCELLED',
      'cancel_type', coalesce(v_cancel_type, 'CALL_CANCEL'),
      'pickup_no', v_p.pickup_no));

  return v_p;
end
$$;

revoke all on function public.cancel_pickup(uuid, integer, text, text) from public;
grant execute on function public.cancel_pickup(uuid, integer, text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- pass_pickup — single pickup reassignment to a new field executive
-- ---------------------------------------------------------------------------
create or replace function public.pass_pickup(
  p_id          uuid,
  p_row_version integer,
  p_to_fe_id    uuid,
  p_to_fe_code  text default null,
  p_reason      text default null
)
returns public.pickups
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant      uuid;
  v_p           public.pickups;
  v_to_fe       uuid;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  if not app.user_has_permission(v_tenant, 'txn.pickup', 'modify') then
    raise exception 'Permission denied: txn.pickup modify' using errcode = '42501';
  end if;

  v_to_fe := app.resolve_tenant_row_id(v_tenant, 'field_executives', p_to_fe_id, p_to_fe_code);
  if v_to_fe is null then
    raise exception 'Target Field Executive is required' using errcode = '22023';
  end if;

  select * into v_p from public.pickups
    where id = p_id and tenant_id = v_tenant and deleted_at is null;
  if not found then
    raise exception 'Pickup not found' using errcode = 'P0002';
  end if;
  if v_p.status in ('CANCELLED', 'CONFIRMED') then
    raise exception 'Cannot pass a % pickup', v_p.status using errcode = 'CMS02';
  end if;

  update public.pickups set
    field_executive_id = v_to_fe,
    status             = 'ASSIGNED',
    passed             = 'YES',
    passed_at          = now(),
    passed_by          = auth.uid(),
    pass_reason        = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), pass_reason),
    edited_by          = auth.uid(),
    updated_by         = auth.uid()
  where id = p_id and tenant_id = v_tenant and deleted_at is null
    and row_version = p_row_version
  returning * into v_p;

  if not found then
    raise exception 'This record was changed by someone else. Reload and try again.'
      using errcode = '40001';
  end if;

  perform app.write_audit_log(
    p_tenant_id   => v_tenant,
    p_entity_type => 'pickups',
    p_action      => 'MODIFY',
    p_entity_id   => v_p.id,
    p_module_slug => 'txn.pickup',
    p_new         => jsonb_build_object(
      'action', 'PASS',
      'pickup_no', v_p.pickup_no,
      'from_fe', v_p.field_executive_id,
      'to_fe', v_to_fe,
      'reason', p_reason));

  return v_p;
end
$$;

revoke all on function public.pass_pickup(uuid, integer, uuid, text, text) from public;
grant execute on function public.pass_pickup(uuid, integer, uuid, text, text)
  to authenticated, service_role;
