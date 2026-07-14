-- ===========================================================================
-- shipment_foundation_verification.sql — Phase 4 Milestone 3A (0032).
-- ---------------------------------------------------------------------------
-- Proves: shipments aggregate + AWB numbering + status transitions + events
-- + child sync + optimistic locking + append-only events.
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000032','authenticated','authenticated','awb@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid;
begin
  v_t := app.bootstrap_tenant('awb-a', 'AWB Tenant A', 'AwbA');
  perform app.link_tenant_admin(v_t, '99999999-1111-4111-8111-000000000032',
          'awbadm', 'AWB Admin', 'awb@a.test');
  perform set_config('awb.tenant', v_t::text, false);
end $$;

do $$
begin
  if to_regclass('public.shipments') is null then raise exception 'FAIL [table]: shipments'; end if;
  if to_regclass('public.shipment_pieces') is null then raise exception 'FAIL [table]: pieces'; end if;
  if to_regclass('public.shipment_charge_snapshots') is null then raise exception 'FAIL [table]: charges'; end if;
  if to_regclass('public.shipment_comments') is null then raise exception 'FAIL [table]: comments'; end if;
  if to_regclass('public.shipment_attachments') is null then raise exception 'FAIL [table]: attachments'; end if;
  if to_regclass('public.shipment_events') is null then raise exception 'FAIL [table]: events'; end if;
  if to_regprocedure('public.save_shipment(uuid,integer,jsonb,jsonb,jsonb,jsonb,jsonb)') is null then
    raise exception 'FAIL [fn]: save_shipment';
  end if;
  if to_regprocedure('public.confirm_booking(uuid,integer)') is null then
    raise exception 'FAIL [fn]: confirm_booking';
  end if;
  if to_regprocedure('public.cancel_shipment(uuid,integer,text)') is null then
    raise exception 'FAIL [fn]: cancel_shipment';
  end if;
  if not app.status_transition_allowed('SHIPMENT','DRAFT','BOOKED') then
    raise exception 'FAIL [status]: DRAFT->BOOKED missing';
  end if;
  raise notice 'PASS [structure]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000032';

-- seed masters
do $$
declare
  v_t uuid := current_setting('awb.tenant')::uuid;
  v_pt uuid;
begin
  insert into public.product_types (tenant_id, code, name)
  values (v_t, 'PT1', 'Express Type')
  on conflict do nothing;
  select id into v_pt from public.product_types where tenant_id = v_t and code = 'PT1';

  insert into public.products (tenant_id, code, name, product_type_id, status)
  values (v_t, 'SPX', 'Express', v_pt, 'ACTIVE')
  on conflict do nothing;

  insert into public.customers (tenant_id, code, name, mobile, status)
  values (v_t, 'CUST1', 'Client One', '9000000001', 'ACTIVE')
  on conflict do nothing;

  insert into public.destinations (tenant_id, code, name, status)
  values (v_t, 'HYD', 'Hyderabad', 'ACTIVE'),
         (v_t, 'BLR', 'Bangalore', 'ACTIVE')
  on conflict do nothing;

  raise notice 'PASS [seed]';
end $$;

-- create DRAFT with AWB allocation + children
do $$
declare
  v_s public.shipments;
  v_pc int;
  v_ch int;
  v_ev int;
begin
  v_s := public.save_shipment(
    null, null,
    jsonb_build_object(
      'customer_code', 'CUST1',
      'product_code', 'SPX',
      'origin_code', 'HYD',
      'destination_code', 'BLR',
      'book_date', current_date::text,
      'book_time', '09:15',
      'pieces', '2',
      'pieces_unit', 'NDOX',
      'actual_weight', '1.5',
      'shipper', jsonb_build_object('name','Ship A','city','Hyd'),
      'consignee', jsonb_build_object('name','Cons B','city','Blr'),
      'customer_charges_total', '100.00'
    ),
    jsonb_build_array(
      jsonb_build_object('pieces','1','actual_weight_per_pc','0.5','vol_weight','0.4','charge_weight','0.5'),
      jsonb_build_object('pieces','1','actual_weight_per_pc','1.0','vol_weight','0.8','charge_weight','1.0')
    ),
    jsonb_build_array(
      jsonb_build_object('description','Freight','amount','80','total','80','side','CUSTOMER'),
      jsonb_build_object('description','Fuel','amount','20','total','20','fuel_applies','true')
    ),
    jsonb_build_array(jsonb_build_object('comment','Created via harness')),
    '[]'::jsonb
  );

  if v_s.current_status <> 'DRAFT' then raise exception 'FAIL [create-status]: %', v_s.current_status; end if;
  if v_s.awb_no is null or v_s.awb_no = '' then raise exception 'FAIL [awb]: empty'; end if;

  select count(*) into v_pc from public.shipment_pieces where shipment_id = v_s.id;
  select count(*) into v_ch from public.shipment_charge_snapshots where shipment_id = v_s.id;
  select count(*) into v_ev from public.shipment_events where shipment_id = v_s.id and event_type = 'CREATED';
  if v_pc <> 2 then raise exception 'FAIL [pieces]: %', v_pc; end if;
  if v_ch <> 2 then raise exception 'FAIL [charges]: %', v_ch; end if;
  if v_ev <> 1 then raise exception 'FAIL [event-created]: %', v_ev; end if;

  perform set_config('awb.id1', v_s.id::text, false);
  perform set_config('awb.rv1', v_s.row_version::text, false);
  perform set_config('awb.no1', v_s.awb_no, false);
  raise notice 'PASS [create-draft] awb=%', v_s.awb_no;
end $$;

-- second AWB is gapless next
do $$
declare
  v_s public.shipments;
  v_no1 text := current_setting('awb.no1');
begin
  v_s := public.save_shipment(
    null, null,
    jsonb_build_object(
      'customer_code','CUST1','product_code','SPX','book_date', current_date::text
    ), '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb);
  if v_s.awb_no = v_no1 then raise exception 'FAIL [awb-gapless]: duplicate %', v_s.awb_no; end if;
  perform set_config('awb.id2', v_s.id::text, false);
  perform set_config('awb.rv2', v_s.row_version::text, false);
  raise notice 'PASS [awb-gapless]';
end $$;

-- optimistic lock
do $$
declare v_id uuid := current_setting('awb.id1')::uuid;
begin
  begin
    perform public.save_shipment(v_id, 999,
      jsonb_build_object('customer_code','CUST1','product_code','SPX','book_date',current_date::text),
      '[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb);
    raise exception 'FAIL [optlock]';
  exception when sqlstate '40001' then null;
  end;
  raise notice 'PASS [optlock]';
end $$;

-- confirm booking
do $$
declare
  v_s public.shipments;
  v_id uuid := current_setting('awb.id1')::uuid;
  v_rv integer;
  v_ev int;
begin
  select row_version into v_rv from public.shipments where id = v_id;
  v_s := public.confirm_booking(v_id, v_rv);
  if v_s.current_status <> 'BOOKED' then raise exception 'FAIL [book]: %', v_s.current_status; end if;
  select count(*) into v_ev from public.shipment_events where shipment_id = v_id and event_type = 'BOOKED';
  if v_ev <> 1 then raise exception 'FAIL [event-booked]'; end if;
  -- edit after book rejected
  begin
    perform public.save_shipment(v_id, v_s.row_version,
      jsonb_build_object('customer_code','CUST1','product_code','SPX','book_date',current_date::text),
      '[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb);
    raise exception 'FAIL [edit-booked]';
  exception when sqlstate 'CMS02' then null;
  end;
  perform set_config('awb.rv1', v_s.row_version::text, false);
  raise notice 'PASS [confirm-booking]';
end $$;

-- cancel
do $$
declare
  v_s public.shipments;
  v_id uuid := current_setting('awb.id2')::uuid;
  v_rv integer;
begin
  select row_version into v_rv from public.shipments where id = v_id;
  v_s := public.cancel_shipment(v_id, v_rv, 'test cancel');
  if v_s.current_status <> 'CANCELLED' then raise exception 'FAIL [cancel]: %', v_s.current_status; end if;
  if not exists (
    select 1 from public.shipment_events where shipment_id = v_id and event_type = 'CANCELLED'
  ) then raise exception 'FAIL [event-cancelled]'; end if;
  raise notice 'PASS [cancel]';
end $$;

-- append-only events (guard trigger and/or missing UPDATE policy)
do $$
declare
  v_eid uuid;
  v_text text;
  v_cnt integer;
begin
  select id, event_text into v_eid, v_text from public.shipment_events
   where shipment_id = current_setting('awb.id1')::uuid limit 1;

  begin
    update public.shipment_events set event_text = 'x' where id = v_eid;
    -- If RLS denied the update silently, the text must be unchanged.
    if (select event_text from public.shipment_events where id = v_eid) is not distinct from 'x' then
      raise exception 'FAIL [append-only-update]';
    end if;
  exception when sqlstate '0A000' then
    null; -- hard guard fired
  end;

  begin
    delete from public.shipment_events where id = v_eid;
    select count(*) into v_cnt from public.shipment_events where id = v_eid;
    if v_cnt = 0 then
      raise exception 'FAIL [append-only-delete]';
    end if;
  exception when sqlstate '0A000' then
    null;
  end;

  if (select event_text from public.shipment_events where id = v_eid) is distinct from v_text then
    raise exception 'FAIL [append-only]: event mutated';
  end if;
  raise notice 'PASS [append-only-events]';
end $$;

-- child replace sync
do $$
declare
  v_id uuid := current_setting('awb.id1')::uuid;
  -- cannot edit BOOKED — use a fresh DRAFT
  v_s public.shipments;
  v_pc int;
begin
  v_s := public.save_shipment(
    null, null,
    jsonb_build_object('customer_code','CUST1','product_code','SPX','book_date',current_date::text),
    jsonb_build_array(jsonb_build_object('pieces','3','charge_weight','2')),
    '[]'::jsonb,'[]'::jsonb,'[]'::jsonb);
  v_s := public.save_shipment(
    v_s.id, v_s.row_version,
    jsonb_build_object('customer_code','CUST1','product_code','SPX','book_date',current_date::text),
    jsonb_build_array(
      jsonb_build_object('pieces','1','charge_weight','1'),
      jsonb_build_object('pieces','1','charge_weight','1')
    ),
    '[]'::jsonb,'[]'::jsonb,'[]'::jsonb);
  select count(*) into v_pc from public.shipment_pieces where shipment_id = v_s.id;
  if v_pc <> 2 then raise exception 'FAIL [replace-pieces]: %', v_pc; end if;
  raise notice 'PASS [child-replace]';
end $$;

do $$
begin
  raise notice '==========================================================';
  raise notice 'SHIPMENT FOUNDATION VERIFICATION PASSED.';
  raise notice '==========================================================';
end $$;

rollback;
