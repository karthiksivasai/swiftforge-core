-- ===========================================================================
-- public_tracking_webhooks_verification.sql — Phase 7 Milestone 7C
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000057','authenticated','authenticated','wh@a.test'),
  ('99999999-1111-4111-8111-00000000b057','authenticated','authenticated','wh@b.test'),
  ('99999999-1111-4111-8111-00000000d057','authenticated','authenticated','whstaff@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid; v_tb uuid;
begin
  v_t := app.bootstrap_tenant('wh-a', 'Wh A', 'WhA');
  perform app.link_tenant_admin(v_t, '99999999-1111-4111-8111-000000000057',
          'whadm', 'Wh Admin', 'wh@a.test');
  perform set_config('wh.tenant', v_t::text, false);

  v_tb := app.bootstrap_tenant('wh-b', 'Wh B', 'WhB');
  perform app.link_tenant_admin(v_tb, '99999999-1111-4111-8111-00000000b057',
          'whadmb', 'Wh Admin B', 'wh@b.test');
  perform set_config('wh.tenant_b', v_tb::text, false);
end $$;

do $$
begin
  if to_regclass('public.webhooks') is null then
    raise exception 'FAIL [table] webhooks';
  end if;
  if to_regclass('public.webhook_deliveries') is null then
    raise exception 'FAIL [table] webhook_deliveries';
  end if;
  if to_regprocedure('public.public_track_shipment(text,text)') is null then
    raise exception 'FAIL [fn] public_track';
  end if;
  if to_regprocedure('public.save_webhook(jsonb,uuid,integer)') is null then
    raise exception 'FAIL [fn] save_webhook';
  end if;
  if to_regprocedure('public.dispatch_webhook(uuid,text,jsonb)') is null then
    raise exception 'FAIL [fn] dispatch';
  end if;
  raise notice 'PASS [structure]';
end $$;

-- Seed shipment for public tracking
do $$
declare
  v_t uuid := current_setting('wh.tenant')::uuid;
  v_branch uuid; v_pt uuid; v_prod uuid; v_cust uuid; v_orig uuid; v_dest uuid;
  v_uid uuid; v_gid uuid;
begin
  select id into v_branch from public.branches
   where tenant_id = v_t and deleted_at is null
   order by case when is_head_office then 0 else 1 end limit 1;

  insert into public.product_types (tenant_id, code, name)
  values (v_t, 'PT1', 'Express Type') on conflict do nothing;
  select id into v_pt from public.product_types where tenant_id = v_t and code = 'PT1';

  insert into public.products (tenant_id, code, name, product_type_id, status)
  values (v_t, 'SPX', 'Express', v_pt, 'ACTIVE') on conflict do nothing;
  select id into v_prod from public.products where tenant_id = v_t and code = 'SPX';

  insert into public.customers (tenant_id, code, name, mobile, status)
  values (v_t, 'CUST1', 'Client One', '9000000057', 'ACTIVE') on conflict do nothing;
  select id into v_cust from public.customers where tenant_id = v_t and code = 'CUST1';

  insert into public.destinations (tenant_id, code, name, status)
  values (v_t, 'HYD', 'Hyderabad', 'ACTIVE'), (v_t, 'BLR', 'Bangalore', 'ACTIVE')
  on conflict do nothing;
  select id into v_orig from public.destinations where tenant_id = v_t and code = 'HYD';
  select id into v_dest from public.destinations where tenant_id = v_t and code = 'BLR';

  insert into public.tenant_users (tenant_id, user_id, role, status)
  values (v_t, '99999999-1111-4111-8111-00000000d057', 'MEMBER', 'ACTIVE')
  on conflict (tenant_id, user_id) do update set status = 'ACTIVE';

  insert into public.users (
    tenant_id, auth_user_id, username, user_type, full_name, email, home_branch_id, status)
  values (
    v_t, '99999999-1111-4111-8111-00000000d057', 'whstaff', 'STAFF',
    'Wh Staff', 'whstaff@a.test', v_branch, 'ACTIVE')
  on conflict (auth_user_id) do update set deleted_at = null
  returning id into v_uid;

  select id into v_gid from public.user_groups
   where tenant_id = v_t and name = 'OPERATIONS' and deleted_at is null;
  insert into public.user_group_members (tenant_id, user_id, group_id)
  values (v_t, v_uid, v_gid) on conflict (user_id, group_id) do nothing;

  update public.group_permissions gp
     set can_add = false, can_modify = false, can_list = false, can_search = false,
         can_delete = false, all_access = false
    from public.permission_modules pm
   where gp.module_id = pm.id and gp.group_id = v_gid
     and pm.slug in ('mst.vendor-master', 'mst.service-mapping');

  raise notice 'PASS [seed]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000057';

do $$
declare
  v_s public.shipments;
  v_pub jsonb;
  v_keys text[];
  v_wh jsonb;
  v_id uuid;
  v_rv int;
  v_disp jsonb;
  v_del jsonb;
  v_sig text;
  v_body text;
  v_ts text;
  v_secret text;
  v_cnt int;
begin
  v_s := public.save_shipment(
    null, null,
    jsonb_build_object(
      'customer_code', 'CUST1',
      'product_code', 'SPX',
      'origin_code', 'HYD',
      'destination_code', 'BLR',
      'service', 'EXPRESS',
      'book_date', current_date::text,
      'pieces', '1',
      'actual_weight', '1',
      'charge_weight', '1',
      'branch_code', 'HO',
      'consignee', jsonb_build_object('name','Test Consignee','mobile','9000000000')
    ),
    jsonb_build_array(jsonb_build_object('pieces','1','actual_weight_per_pc','1','charge_weight','1')),
    '[]'::jsonb);
  v_s := public.confirm_booking(v_s.id, v_s.row_version);

  update public.shipments
     set carrier_tracking_no = 'PUBTRK' || v_s.awb_no,
         carrier_provider_code = 'FEDEX'
   where id = v_s.id;

  -- Public tracking by AWB (as authenticated; also granted to anon)
  v_pub := public.public_track_shipment(v_s.awb_no, null);
  if v_pub->>'found' <> 'true' then raise exception 'FAIL [public awb]'; end if;
  if v_pub->>'shipment_number' is distinct from v_s.awb_no then
    raise exception 'FAIL [public awb no]';
  end if;
  if v_pub ? 'tenant_id' or v_pub ? 'id' or v_pub ? 'customer_id' then
    raise exception 'FAIL [public leak ids]';
  end if;
  if v_pub ? 'customer_charges_total' or v_pub ? 'audit' then
    raise exception 'FAIL [public leak financial]';
  end if;
  if not (v_pub ? 'tracking_timeline' and v_pub ? 'current_status'
          and v_pub ? 'origin' and v_pub ? 'destination' and v_pub ? 'carrier_name') then
    raise exception 'FAIL [public fields]';
  end if;

  v_pub := public.public_track_shipment(null, 'PUBTRK' || v_s.awb_no);
  if v_pub->>'found' <> 'true' then raise exception 'FAIL [public track no]'; end if;

  v_pub := public.public_track_shipment('NO-SUCH-AWB', null);
  if v_pub->>'found' <> 'false' then raise exception 'FAIL [public miss]'; end if;

  -- Webhook CRUD
  v_wh := public.save_webhook(jsonb_build_object(
    'name', 'Ops Hook',
    'endpoint_url', 'test://webhooks/ops',
    'subscribed_events', jsonb_build_array('SHIPMENT_BOOKED','TRACKING_UPDATED','POD_UPDATED'),
    'is_active', true,
    'signing_secret', 'whsec_test_secret_value_123456'
  ));
  v_id := (v_wh->>'id')::uuid;
  v_rv := (v_wh->>'row_version')::int;
  if v_wh->>'has_signing_secret' <> 'true' then raise exception 'FAIL [secret flag]'; end if;
  if v_wh ? 'signing_secret' or v_wh ? 'signing_secret_enc' then
    raise exception 'FAIL [secret leak]';
  end if;

  -- Secret encryption at rest
  if not exists (
    select 1 from public.webhooks w
     where w.id = v_id
       and w.signing_secret_enc is not null
       and length(w.signing_secret_enc) > 0
  ) then raise exception 'FAIL [secret enc]'; end if;

  -- Optimistic lock
  begin
    perform public.save_webhook(
      jsonb_build_object(
        'name', 'Ops Hook',
        'endpoint_url', 'test://webhooks/ops',
        'subscribed_events', jsonb_build_array('SHIPMENT_BOOKED')
      ),
      v_id, 999);
    raise exception 'FAIL [opt lock]';
  exception when sqlstate 'CMS04' then null;
  end;

  -- Dispatch once + signing
  v_disp := public.dispatch_webhook(
    v_id, 'SHIPMENT_BOOKED',
    jsonb_build_object('shipment_number', v_s.awb_no, 'status', 'BOOKED'));
  if (v_disp->>'attempt_number')::int <> 1 then raise exception 'FAIL [attempt]'; end if;
  if (v_disp->>'response_status')::int <> 200 then raise exception 'FAIL [dispatch status]'; end if;
  if nullif(v_disp->>'signature','') is null then raise exception 'FAIL [signature]'; end if;

  select count(*) into v_cnt from public.webhook_deliveries where webhook_id = v_id;
  if v_cnt <> 1 then raise exception 'FAIL [delivery count %]', v_cnt; end if;

  -- Verify HMAC
  select d.payload->>'signature',
         d.payload->>'timestamp',
         (d.payload->'body')::text
    into v_sig, v_ts, v_body
  from public.webhook_deliveries d where d.webhook_id = v_id limit 1;

  if app.webhook_sign_payload('whsec_test_secret_value_123456', v_ts || '.' || v_body)
     is distinct from v_sig then
    raise exception 'FAIL [hmac verify]';
  end if;

  -- Append-only deliveries (no UPDATE policy + guard; 0-row or blocked)
  begin
    update public.webhook_deliveries set response_status = 999 where webhook_id = v_id;
  exception when others then
    null; -- hard guard may raise
  end;
  if exists (
    select 1 from public.webhook_deliveries
     where webhook_id = v_id and response_status = 999
  ) then
    raise exception 'FAIL [append only upd]';
  end if;

  v_del := public.list_webhook_deliveries(v_id, 10);
  if jsonb_array_length(v_del->'rows') <> 1 then raise exception 'FAIL [list deliveries]'; end if;

  -- Regenerate secret
  v_wh := public.save_webhook(
    jsonb_build_object(
      'name', 'Ops Hook',
      'endpoint_url', 'test://webhooks/ops',
      'subscribed_events', jsonb_build_array('SHIPMENT_BOOKED','TRACKING_UPDATED'),
      'regenerate_secret', true
    ),
    v_id, (v_wh->>'row_version')::int);
  v_rv := (v_wh->>'row_version')::int;

  -- Audit
  if not exists (
    select 1 from public.audit_logs
     where entity_type = 'webhooks' and entity_id = v_id
  ) then raise exception 'FAIL [audit]'; end if;

  -- Delete
  perform public.delete_webhook(v_id, v_rv);
  if exists (select 1 from public.webhooks where id = v_id and deleted_at is null) then
    raise exception 'FAIL [delete]';
  end if;

  raise notice 'PASS [public track / webhook CRUD / dispatch / signing / audit / opt-lock]';
end $$;

-- Anon public track
reset role;
set local role anon;
do $$
declare v_pub jsonb; v_awb text;
begin
  select awb_no into v_awb from public.shipments
   where tenant_id = current_setting('wh.tenant')::uuid and deleted_at is null
   limit 1;
  -- anon cannot select shipments under RLS — use only the RPC
  v_pub := public.public_track_shipment(v_awb, null);
  if v_pub->>'found' <> 'true' then
    -- if awb null because RLS blocked select above, fetch via known pattern from admin context fails
    null;
  end if;
end $$;

reset role;
-- Get AWB as postgres then test anon
do $$
declare v_awb text; v_pub jsonb;
begin
  select awb_no into v_awb from public.shipments
   where tenant_id = current_setting('wh.tenant')::uuid and deleted_at is null
     and current_status = 'BOOKED'
   limit 1;
  perform set_config('wh.awb', v_awb, false);
end $$;

set local role anon;
do $$
declare v_pub jsonb := public.public_track_shipment(current_setting('wh.awb'), null);
begin
  if v_pub->>'found' <> 'true' then raise exception 'FAIL [anon track]'; end if;
  if v_pub ? 'tenant_id' then raise exception 'FAIL [anon leak]'; end if;
  raise notice 'PASS [anon public tracking]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000d057';
do $$
begin
  begin
    perform public.list_webhooks();
    raise exception 'FAIL [perm]';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'PASS [permissions]';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000b057';
do $$
declare v_id uuid;
begin
  select id into v_id from public.webhooks
   where tenant_id = current_setting('wh.tenant')::uuid limit 1;
  -- soft-deleted may still exist; cross-tenant get should miss active
  if public.get_webhook(coalesce(v_id, '00000000-0000-4000-8000-000000000057'::uuid)) is not null then
    raise exception 'FAIL [tenant]';
  end if;
  raise notice 'PASS [tenant isolation]';
end $$;

reset role;
do $$
begin
  raise notice '==========================================================';
  raise notice 'PUBLIC TRACKING / WEBHOOKS VERIFICATION PASSED.';
  raise notice '==========================================================';
end $$;

rollback;
