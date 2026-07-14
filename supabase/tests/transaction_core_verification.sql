-- ===========================================================================
-- transaction_core_verification.sql — proves the Phase 4 transaction-core (0030).
-- ---------------------------------------------------------------------------
-- Runs in a transaction that ROLLS BACK. Execute as a privileged role:
--   psql "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/transaction_core_verification.sql
-- Proves: status transition registry + guards; document numbering; append-only
-- guard; transaction trigger/policy helpers on throwaway probe tables.
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

-- ---------- 0) helper existence -----------------------------------------
do $$
begin
  if to_regclass('app.status_transitions') is null then
    raise exception 'FAIL [tbl]: app.status_transitions missing';
  end if;
  if to_regprocedure('app.status_transition_allowed(text,text,text)') is null then
    raise exception 'FAIL [fn]: app.status_transition_allowed missing';
  end if;
  if to_regprocedure('app.assert_status_transition(text,text,text)') is null then
    raise exception 'FAIL [fn]: app.assert_status_transition missing';
  end if;
  if to_regprocedure('app.format_document_no(text,bigint,text,integer)') is null then
    raise exception 'FAIL [fn]: app.format_document_no missing';
  end if;
  if to_regprocedure('app.allocate_document_no(uuid,text,uuid,uuid,integer)') is null then
    raise exception 'FAIL [fn]: app.allocate_document_no missing';
  end if;
  if to_regprocedure('app.attach_append_only_guard(text)') is null then
    raise exception 'FAIL [fn]: app.attach_append_only_guard missing';
  end if;
  if to_regprocedure('app.attach_transaction_triggers(text,text)') is null then
    raise exception 'FAIL [fn]: app.attach_transaction_triggers missing';
  end if;
  if to_regprocedure('app.attach_transaction_policies(text,text)') is null then
    raise exception 'FAIL [fn]: app.attach_transaction_policies missing';
  end if;
  if to_regprocedure('app.attach_event_policies(text,text)') is null then
    raise exception 'FAIL [fn]: app.attach_event_policies missing';
  end if;
  raise notice 'PASS [core]: all transaction-core helpers present';
end $$;

-- ---------- fixture tenant + sequence counter ----------------------------
insert into public.tenants (id, slug, name, status) values
  ('44444444-dddd-4ddd-8ddd-000000000004','tc-core','Txn Core Tenant','ACTIVE')
on conflict (id) do nothing;

insert into public.sequence_counters (tenant_id, doc_type, prefix, suffix, next_no)
values ('44444444-dddd-4ddd-8ddd-000000000004', 'AWB', 'AWB-', '', 101)
on conflict do nothing;

-- ---------- status transitions ------------------------------------------
do $$
begin
  if not app.status_transition_allowed('SHIPMENT', 'BOOKED', 'PICKUP_INSCANNED') then
    raise exception 'FAIL [status]: BOOKED -> PICKUP_INSCANNED should be allowed';
  end if;
  if app.status_transition_allowed('SHIPMENT', 'BOOKED', 'DELIVERED') then
    raise exception 'FAIL [status]: BOOKED -> DELIVERED should be denied';
  end if;

  perform app.assert_status_transition('SHIPMENT', 'BOOKED', 'BOOKED'); -- no-op

  begin
    perform app.assert_status_transition('SHIPMENT', 'DELIVERED', 'BOOKED');
    raise exception 'FAIL [status-guard]: illegal transition should have raised';
  exception when sqlstate 'CMS02' then
    null;
  end;

  raise notice 'PASS [status]: registry + assert_status_transition guard';
end $$;

-- ---------- format_document_no ------------------------------------------
do $$
declare v_fmt text;
begin
  v_fmt := app.format_document_no('AWB-', 42, '-X', 6);
  if v_fmt <> 'AWB-000042-X' then
    raise exception 'FAIL [format]: expected AWB-000042-X, got %', v_fmt;
  end if;
  raise notice 'PASS [format]: format_document_no renders correctly';
end $$;

-- ---------- allocate_document_no (gapless) ------------------------------
do $$
declare
  r1 record;
  r2 record;
  v_next bigint;
begin
  select * into r1 from app.allocate_document_no(
    '44444444-dddd-4ddd-8ddd-000000000004', 'AWB');
  select * into r2 from app.allocate_document_no(
    '44444444-dddd-4ddd-8ddd-000000000004', 'AWB');

  if r1.sequence_no <> 101 or r1.formatted_no <> 'AWB-000101' then
    raise exception 'FAIL [alloc-1]: expected seq 101 / AWB-000101, got % / %',
      r1.sequence_no, r1.formatted_no;
  end if;
  if r2.sequence_no <> 102 or r2.formatted_no <> 'AWB-000102' then
    raise exception 'FAIL [alloc-2]: expected seq 102 / AWB-000102, got % / %',
      r2.sequence_no, r2.formatted_no;
  end if;

  select next_no into v_next
    from public.sequence_counters
   where tenant_id = '44444444-dddd-4ddd-8ddd-000000000004'
     and doc_type = 'AWB';
  if v_next <> 103 then
    raise exception 'FAIL [alloc-counter]: expected next_no 103, got %', v_next;
  end if;

  raise notice 'PASS [alloc]: gapless document numbering';
end $$;

-- ---------- mutable transaction doc probe (touch + audit) ---------------
create table public.__tc_doc_probe (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  doc_no      text,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  deleted_at  timestamptz,
  row_version integer not null default 1
);
select app.attach_transaction_triggers('__tc_doc_probe', 'txn.__probe');
select app.attach_transaction_policies('__tc_doc_probe', 'txn.__probe');

do $$
begin
  if (select count(*) from pg_trigger
        where tgrelid = 'public.__tc_doc_probe'::regclass
          and tgname in ('trg_touch___tc_doc_probe','trg_audit___tc_doc_probe')) <> 2 then
    raise exception 'FAIL [txn-triggers]: expected touch + audit on doc probe';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.__tc_doc_probe'::regclass) then
    raise exception 'FAIL [txn-policies]: RLS not enabled on doc probe';
  end if;
  raise notice 'PASS [txn-triggers]: touch + audit + RLS installed';
end $$;

-- ---------- append-only event probe ------------------------------------
create table public.__tc_event_probe (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
select app.attach_append_only_guard('__tc_event_probe');
select app.attach_event_policies('__tc_event_probe', 'txn.__probe');

do $$
declare v_id uuid;
begin
  insert into public.__tc_event_probe (tenant_id, payload)
    values ('44444444-dddd-4ddd-8ddd-000000000004', '{"k":1}'::jsonb)
    returning id into v_id;

  begin
    update public.__tc_event_probe set payload = '{"k":2}'::jsonb where id = v_id;
    raise exception 'FAIL [append-only]: UPDATE should have been blocked';
  exception when sqlstate '0A000' then
    null;
  end;

  begin
    delete from public.__tc_event_probe where id = v_id;
    raise exception 'FAIL [append-only]: DELETE should have been blocked';
  exception when sqlstate '0A000' then
    null;
  end;

  raise notice 'PASS [append-only]: UPDATE/DELETE blocked on event probe';
end $$;

drop table public.__tc_event_probe;
drop table public.__tc_doc_probe;

do $$
begin
  raise notice '==========================================================';
  raise notice 'TRANSACTION CORE VERIFICATION PASSED: numbering + guards.';
  raise notice '==========================================================';
end $$;

rollback;
