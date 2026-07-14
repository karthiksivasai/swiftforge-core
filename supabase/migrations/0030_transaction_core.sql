-- ===========================================================================
-- 0030  transaction core — reusable framework for ALL transaction tables (Phase 4+).
-- ---------------------------------------------------------------------------
-- This migration adds NO business tables. It installs the shared primitives the
-- pickup/shipment/manifest/DRS/finance modules (0031+) reuse verbatim:
--
--   1. app.status_transitions            — seeded state-machine edges (shipment,
--                                          pickup, manifest, DRS).
--   2. app.status_transition_allowed()   — lookup helper.
--   3. app.assert_status_transition()    — guard that raises on illegal moves.
--   4. app.format_document_no()          — prefix + padded seq + suffix.
--   5. app.allocate_document_no()          — gapless counter allocation (FOR UPDATE).
--   6. app.attach_append_only_guard()    — hard block UPDATE/DELETE on event tables.
--   7. app.attach_transaction_triggers() — touch + audit (delegates to master core).
--   8. app.attach_transaction_policies() — standard tenant + permission RLS.
--   9. app.attach_event_policies()       — SELECT + INSERT only (append-only events).
--
-- Optimistic locking reuses app.tg_touch_row() (0001). Callers enforce the check
-- with `... where id = $1 and row_version = $2` (0 rows => conflict / 409).
--
-- Idempotent: create or replace / on conflict do nothing.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Status transition registry (internal config; not tenant-owned).
-- ---------------------------------------------------------------------------
create table if not exists app.status_transitions (
  entity_kind text not null
    check (entity_kind in ('SHIPMENT','PICKUP','MANIFEST','DRS')),
  from_status text not null,
  to_status   text not null,
  primary key (entity_kind, from_status, to_status)
);

comment on table app.status_transitions is
  'Allowed workflow edges for operational documents. Seeded by 0030; extended only via migration.';

insert into app.status_transitions (entity_kind, from_status, to_status) values
  -- Shipment (AWB) lifecycle — blueprint Part 4 §1.1
  ('SHIPMENT','BOOKED','PICKUP_INSCANNED'),
  ('SHIPMENT','BOOKED','VOID'),
  ('SHIPMENT','PICKUP_INSCANNED','BAGGED'),
  ('SHIPMENT','PICKUP_INSCANNED','MANIFESTED'),
  ('SHIPMENT','BAGGED','MANIFESTED'),
  ('SHIPMENT','MANIFESTED','IN_TRANSIT'),
  ('SHIPMENT','IN_TRANSIT','RECEIVED_AT_HUB'),
  ('SHIPMENT','RECEIVED_AT_HUB','ON_DRS'),
  ('SHIPMENT','RECEIVED_AT_HUB','MISROUTED'),
  ('SHIPMENT','MISROUTED','MANIFESTED'),
  ('SHIPMENT','ON_DRS','OUT_FOR_DELIVERY'),
  ('SHIPMENT','OUT_FOR_DELIVERY','DELIVERED'),
  ('SHIPMENT','OUT_FOR_DELIVERY','UNDELIVERED'),
  ('SHIPMENT','UNDELIVERED','UNDELIVERED_RECEIVED'),
  ('SHIPMENT','UNDELIVERED_RECEIVED','ON_DRS'),
  ('SHIPMENT','UNDELIVERED_RECEIVED','RTO_INITIATED'),
  ('SHIPMENT','RTO_INITIATED','RTO_DELIVERED'),
  -- Pickup — blueprint Part 4 §1.2
  ('PICKUP','OPEN','ASSIGNED'),
  ('PICKUP','OPEN','CANCELLED'),
  ('PICKUP','ASSIGNED','PICKED'),
  ('PICKUP','ASSIGNED','CANCELLED'),
  ('PICKUP','PICKED','CONFIRMED'),
  -- Manifest — blueprint Part 4 §1.3
  ('MANIFEST','OPEN','DISPATCHED'),
  ('MANIFEST','DISPATCHED','ARRIVED'),
  ('MANIFEST','ARRIVED','CLOSED'),
  -- DRS — blueprint Part 4 §1.4
  ('DRS','OPEN','DISPATCHED'),
  ('DRS','DISPATCHED','CLOSED')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. status_transition_allowed(): true when the edge exists in the registry.
-- ---------------------------------------------------------------------------
create or replace function app.status_transition_allowed(
  p_entity_kind text,
  p_from_status text,
  p_to_status   text
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from app.status_transitions st
    where st.entity_kind = p_entity_kind
      and st.from_status = p_from_status
      and st.to_status   = p_to_status
  );
$$;

comment on function app.status_transition_allowed(text, text, text) is
  'Returns true when p_from_status -> p_to_status is a registered edge for p_entity_kind.';

-- ---------------------------------------------------------------------------
-- 3. assert_status_transition(): guard for RPCs / triggers. Same status is a
--    no-op (allowed). Illegal moves raise SQLSTATE CMS02 (422-style).
-- ---------------------------------------------------------------------------
create or replace function app.assert_status_transition(
  p_entity_kind text,
  p_from_status text,
  p_to_status   text
)
returns void
language plpgsql
as $$
begin
  if p_from_status is not distinct from p_to_status then
    return;
  end if;

  if not app.status_transition_allowed(p_entity_kind, p_from_status, p_to_status) then
    raise exception 'Invalid % status transition: % -> %',
      p_entity_kind, p_from_status, p_to_status
      using errcode = 'CMS02';
  end if;
end
$$;

comment on function app.assert_status_transition(text, text, text) is
  'Raises CMS02 when the status transition is not registered. No-op when from = to.';

-- ---------------------------------------------------------------------------
-- 4. format_document_no(): render a counter row into the display document no.
-- ---------------------------------------------------------------------------
create or replace function app.format_document_no(
  p_prefix    text,
  p_next_no   bigint,
  p_suffix    text default '',
  p_pad_width integer default 6
)
returns text
language sql
immutable
as $$
  select coalesce(p_prefix, '')
      || lpad(greatest(p_next_no, 0)::text, greatest(p_pad_width, 1), '0')
      || coalesce(p_suffix, '');
$$;

comment on function app.format_document_no(text, bigint, text, integer) is
  'Format prefix + zero-padded sequence + suffix for display / storage.';

-- ---------------------------------------------------------------------------
-- 5. allocate_document_no(): gapless allocation from sequence_counters.
--    Locks the counter row FOR UPDATE, returns the allocated number, then bumps
--    next_no. Must run inside a caller transaction for atomicity.
-- ---------------------------------------------------------------------------
create or replace function app.allocate_document_no(
  p_tenant_id   uuid,
  p_doc_type    text,
  p_branch_id   uuid    default null,
  p_fin_year_id uuid    default null,
  p_pad_width   integer default 6
)
returns table (
  counter_id    uuid,
  sequence_no   bigint,
  formatted_no  text
)
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_row public.sequence_counters%rowtype;
  v_branch uuid := coalesce(p_branch_id, '00000000-0000-0000-0000-000000000000'::uuid);
  v_fy     uuid := coalesce(p_fin_year_id, '00000000-0000-0000-0000-000000000000'::uuid);
begin
  if p_tenant_id is null then
    raise exception 'p_tenant_id is required' using errcode = '22023';
  end if;
  if p_doc_type is null or p_doc_type = '' then
    raise exception 'p_doc_type is required' using errcode = '22023';
  end if;

  select *
    into v_row
    from public.sequence_counters sc
   where sc.tenant_id = p_tenant_id
     and coalesce(sc.branch_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_branch
     and coalesce(sc.fin_year_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_fy
     and sc.doc_type = p_doc_type
   for update;

  if not found then
    raise exception 'No sequence counter for tenant % doc_type % (branch %, fin_year %)',
      p_tenant_id, p_doc_type, p_branch_id, p_fin_year_id
      using errcode = 'CMS03';
  end if;

  counter_id   := v_row.id;
  sequence_no  := v_row.next_no;
  formatted_no := app.format_document_no(v_row.prefix, v_row.next_no, v_row.suffix, p_pad_width);

  update public.sequence_counters
     set next_no = v_row.next_no + 1
   where id = v_row.id;

  return next;
end
$$;

comment on function app.allocate_document_no(uuid, text, uuid, uuid, integer) is
  'Atomically allocate the next document number from sequence_counters (FOR UPDATE). Returns formatted_no.';

revoke all on function app.allocate_document_no(uuid, text, uuid, uuid, integer) from public;
grant execute on function app.allocate_document_no(uuid, text, uuid, uuid, integer)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. attach_append_only_guard(): hard block UPDATE/DELETE on event tables.
-- ---------------------------------------------------------------------------
create or replace function app.attach_append_only_guard(p_table text)
returns void
language plpgsql
as $$
begin
  execute format('drop trigger if exists %I on public.%I;',
                 'trg_append_only_' || p_table, p_table);
  execute format(
    'create trigger %I before update or delete on public.%I
       for each row execute function app.tg_block_mutations();',
    'trg_append_only_' || p_table, p_table);
end
$$;

comment on function app.attach_append_only_guard(text) is
  'Install BEFORE UPDATE/DELETE guard on a public append-only table (scan/tracking events).';

-- ---------------------------------------------------------------------------
-- 7. attach_transaction_triggers(): standard touch + audit for mutable txn docs.
--    Delegates to attach_master_triggers (0014) — same contract applies.
-- ---------------------------------------------------------------------------
create or replace function app.attach_transaction_triggers(p_table text, p_module_slug text)
returns void
language plpgsql
as $$
begin
  perform app.attach_master_triggers(p_table, p_module_slug);
end
$$;

comment on function app.attach_transaction_triggers(text, text) is
  'Install touch + audit triggers on a mutable transaction document table. Alias of attach_master_triggers.';

-- ---------------------------------------------------------------------------
-- 8. attach_transaction_policies(): tenant SELECT + permission-gated writes.
-- ---------------------------------------------------------------------------
create or replace function app.attach_transaction_policies(p_table text, p_module_slug text)
returns void
language plpgsql
as $$
begin
  execute format('alter table public.%I enable row level security;', p_table);

  execute format('drop policy if exists %I on public.%I;', p_table || '_select', p_table);
  execute format($p$create policy %I on public.%I
    for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());$p$,
    p_table || '_select', p_table);

  execute format('drop policy if exists %I on public.%I;', p_table || '_insert', p_table);
  execute format($p$create policy %I on public.%I
    for insert with check (
      tenant_id in (select app.user_tenant_ids())
      and app.user_has_permission(tenant_id, %L, 'add'));$p$,
    p_table || '_insert', p_table, p_module_slug);

  execute format('drop policy if exists %I on public.%I;', p_table || '_update', p_table);
  execute format($p$create policy %I on public.%I
    for update using (
      tenant_id in (select app.user_tenant_ids())
      and app.user_has_permission(tenant_id, %L, 'modify'))
    with check (
      tenant_id in (select app.user_tenant_ids())
      and app.user_has_permission(tenant_id, %L, 'modify'));$p$,
    p_table || '_update', p_table, p_module_slug, p_module_slug);

  execute format('drop policy if exists %I on public.%I;', p_table || '_delete', p_table);
  execute format($p$create policy %I on public.%I
    for delete using (
      tenant_id in (select app.user_tenant_ids())
      and app.user_has_permission(tenant_id, %L, 'delete'));$p$,
    p_table || '_delete', p_table, p_module_slug);
end
$$;

comment on function app.attach_transaction_policies(text, text) is
  'Enable RLS + standard tenant/permission policies on a mutable transaction document table.';

-- ---------------------------------------------------------------------------
-- 9. attach_event_policies(): SELECT + INSERT only (append-only event tables).
--    UPDATE/DELETE denied by missing policies + attach_append_only_guard.
-- ---------------------------------------------------------------------------
create or replace function app.attach_event_policies(p_table text, p_module_slug text)
returns void
language plpgsql
as $$
begin
  execute format('alter table public.%I enable row level security;', p_table);

  execute format('drop policy if exists %I on public.%I;', p_table || '_select', p_table);
  execute format($p$create policy %I on public.%I
    for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());$p$,
    p_table || '_select', p_table);

  execute format('drop policy if exists %I on public.%I;', p_table || '_insert', p_table);
  execute format($p$create policy %I on public.%I
    for insert with check (
      tenant_id in (select app.user_tenant_ids())
      and app.user_has_permission(tenant_id, %L, 'add'));$p$,
    p_table || '_insert', p_table, p_module_slug);

  -- Drop stale update/delete policies if re-attaching.
  execute format('drop policy if exists %I on public.%I;', p_table || '_update', p_table);
  execute format('drop policy if exists %I on public.%I;', p_table || '_delete', p_table);
end
$$;

comment on function app.attach_event_policies(text, text) is
  'Enable RLS with SELECT + INSERT only for append-only event tables (scan/tracking).';
