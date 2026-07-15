-- ===========================================================================
-- 0049  excel import suite — Phase 6 Milestone 6A
-- ---------------------------------------------------------------------------
-- Transactional Excel imports on the existing import_jobs / import_row_errors
-- framework (0016). Public dispatcher: public.import_excel — same VALIDATE /
-- COMMIT contract as public.import_master. Handlers registered in CASE.
--
-- Types: AWB_MERGE | POD_MERGE | FORWARDING_MERGE | AWB_STOCK |
--        OTHER_CHARGES | DATA_UPDATE
--
-- No rate/zone jobs, tax/fuel setup, notifications, or email (later 6.x).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- customer_awb_stock — destination for AWB_STOCK imports
-- ---------------------------------------------------------------------------
create table if not exists public.customer_awb_stock (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  customer_id   uuid not null,
  awb_no        text not null,
  status        text not null default 'AVAILABLE'
                  check (status in ('AVAILABLE','ALLOCATED','USED','VOID')),
  remark        text,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  deleted_at    timestamptz,
  row_version   integer not null default 1,
  constraint customer_awb_stock_tenant_id_uq unique (tenant_id, id),
  constraint customer_awb_stock_customer_fk foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete cascade
);
create unique index if not exists customer_awb_stock_awb_uq
  on public.customer_awb_stock (tenant_id, awb_no) where deleted_at is null;
create index if not exists customer_awb_stock_customer_idx
  on public.customer_awb_stock (tenant_id, customer_id);

drop trigger if exists trg_touch_customer_awb_stock on public.customer_awb_stock;
create trigger trg_touch_customer_awb_stock before insert or update on public.customer_awb_stock
  for each row execute function app.tg_touch_row();

alter table public.customer_awb_stock enable row level security;
drop policy if exists customer_awb_stock_select on public.customer_awb_stock;
create policy customer_awb_stock_select on public.customer_awb_stock
  for select using (
    tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin()
  );

-- ---------------------------------------------------------------------------
-- Handlers — return 'ok' | 'skipped'; raise CMS01 for expected row errors
-- ---------------------------------------------------------------------------

create or replace function app.excel_import_awb_merge(
  p_tenant uuid,
  p_row jsonb,
  p_params jsonb
)
returns text
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_awb text := nullif(btrim(coalesce(p_row->>'awb_no','')),'');
  v_cust_code text := coalesce(
    nullif(btrim(coalesce(p_row->>'customer_code','')),''),
    nullif(btrim(coalesce(p_params->>'customer_code','')),''));
  v_prod_code text := coalesce(
    nullif(btrim(coalesce(p_row->>'product_code','')),''),
    nullif(btrim(coalesce(p_params->>'product_code','')),''));
  v_dest_code text := nullif(btrim(coalesce(p_row->>'destination_code','')),'');
  v_book date;
  v_cust uuid; v_prod uuid; v_dest uuid; v_branch uuid;
  v_ship public.shipments;
  v_pieces int;
  v_weight numeric;
  v_update boolean := coalesce((p_params->>'update_entry')::boolean, false);
  v_delete boolean := coalesce((p_params->>'delete_entry')::boolean, false);
begin
  if v_awb is null then
    raise exception using errcode = 'CMS01', message = 'awb_no is required';
  end if;

  begin
    v_book := coalesce((p_row->>'book_date')::date, (p_params->>'book_date')::date, current_date);
  exception when others then
    raise exception using errcode = 'CMS01', message = 'Invalid book_date';
  end;

  begin
    v_pieces := coalesce(nullif(btrim(coalesce(p_row->>'pieces','')),'')::int, 1);
  exception when others then
    raise exception using errcode = 'CMS01', message = 'Invalid pieces';
  end;
  begin
    v_weight := coalesce(nullif(btrim(coalesce(p_row->>'charge_weight','')),'')::numeric, 0);
  exception when others then
    raise exception using errcode = 'CMS01', message = 'Invalid charge_weight';
  end;

  select id into v_ship.id from public.shipments
   where tenant_id = p_tenant and awb_no = v_awb and deleted_at is null;

  if v_delete then
    if v_ship.id is null then return 'skipped'; end if;
    update public.shipments
       set deleted_at = now(), updated_at = now(), updated_by = auth.uid(),
           row_version = row_version + 1
     where id = v_ship.id and tenant_id = p_tenant;
    return 'ok';
  end if;

  if v_cust_code is null then
    raise exception using errcode = 'CMS01', message = 'customer_code is required';
  end if;
  select id into v_cust from public.customers
   where tenant_id = p_tenant and code = v_cust_code and deleted_at is null;
  if v_cust is null then
    raise exception using errcode = 'CMS01', message = format('Customer "%s" not found', v_cust_code);
  end if;

  if v_prod_code is null then
    raise exception using errcode = 'CMS01', message = 'product_code is required';
  end if;
  select id into v_prod from public.products
   where tenant_id = p_tenant and code = v_prod_code and deleted_at is null;
  if v_prod is null then
    raise exception using errcode = 'CMS01', message = format('Product "%s" not found', v_prod_code);
  end if;

  if v_dest_code is not null then
    select id into v_dest from public.destinations
     where tenant_id = p_tenant and code = v_dest_code and deleted_at is null;
    if v_dest is null then
      raise exception using errcode = 'CMS01', message = format('Destination "%s" not found', v_dest_code);
    end if;
  end if;

  select id into v_branch from public.branches
   where tenant_id = p_tenant and deleted_at is null
   order by case when is_head_office then 0 else 1 end limit 1;

  if v_ship.id is not null then
    if not v_update then return 'skipped'; end if;
    update public.shipments
       set book_date = v_book,
           customer_id = v_cust,
           product_id = v_prod,
           destination_id = coalesce(v_dest, destination_id),
           pieces = v_pieces,
           charge_weight = v_weight,
           updated_at = now(),
           updated_by = auth.uid(),
           row_version = row_version + 1
     where id = v_ship.id and tenant_id = p_tenant;
    return 'ok';
  end if;

  insert into public.shipments (
    tenant_id, awb_no, book_date, customer_id, product_id, destination_id,
    branch_id, pieces, charge_weight, current_status, booked_at, booked_by,
    created_by, updated_by)
  values (
    p_tenant, v_awb, v_book, v_cust, v_prod, v_dest,
    v_branch, v_pieces, v_weight, 'BOOKED', now(), auth.uid(),
    auth.uid(), auth.uid());

  return 'ok';
end
$$;

create or replace function app.excel_import_pod_merge(
  p_tenant uuid,
  p_row jsonb,
  p_params jsonb
)
returns text
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_awb text := nullif(btrim(coalesce(p_row->>'awb_no','')),'');
  v_recv text := nullif(btrim(coalesce(p_row->>'receiver_name','')),'');
  v_remark text := nullif(btrim(coalesce(p_row->>'remark','')),'');
  v_date date;
  v_ship public.shipments;
  v_pod_id uuid;
begin
  if v_awb is null then
    raise exception using errcode = 'CMS01', message = 'awb_no is required';
  end if;
  if v_recv is null then
    raise exception using errcode = 'CMS01', message = 'receiver_name is required';
  end if;
  begin
    v_date := coalesce((p_row->>'pod_date')::date, current_date);
  exception when others then
    raise exception using errcode = 'CMS01', message = 'Invalid pod_date';
  end;

  select * into v_ship from public.shipments
   where tenant_id = p_tenant and awb_no = v_awb and deleted_at is null
   for update;
  if not found then
    raise exception using errcode = 'CMS01', message = format('Shipment "%s" not found', v_awb);
  end if;
  if v_ship.current_status in ('CANCELLED','VOID') then
    raise exception using errcode = 'CMS01', message = format('Shipment "%s" is cancelled/void', v_awb);
  end if;

  select id into v_pod_id from public.pod_records
   where tenant_id = p_tenant and shipment_id = v_ship.id
     and deleted_at is null and status = 'DELIVERED';
  if v_pod_id is not null then
    return 'skipped';
  end if;

  insert into public.pod_records (
    tenant_id, shipment_id, awb_no, pod_date, receiver_name, remark,
    status, source, created_by, updated_by)
  values (
    p_tenant, v_ship.id, v_ship.awb_no, v_date, v_recv, v_remark,
    'DELIVERED', 'IMPORT', auth.uid(), auth.uid());

  update public.shipments
     set current_status = 'DELIVERED',
         status_at = now(),
         delivered_at = coalesce(delivered_at, now()),
         updated_at = now(),
         updated_by = auth.uid(),
         row_version = row_version + 1
   where id = v_ship.id and tenant_id = p_tenant;

  return 'ok';
end
$$;

create or replace function app.excel_import_forwarding_merge(
  p_tenant uuid,
  p_row jsonb,
  p_params jsonb
)
returns text
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_awb text := nullif(btrim(coalesce(p_row->>'awb_no','')),'');
  v_fwd text := nullif(btrim(coalesce(p_row->>'forwarding_awb','')),'');
  v_ship public.shipments;
  v_rv int;
begin
  if v_awb is null then
    raise exception using errcode = 'CMS01', message = 'awb_no is required';
  end if;
  if v_fwd is null then
    raise exception using errcode = 'CMS01', message = 'forwarding_awb is required';
  end if;

  select * into v_ship from public.shipments
   where tenant_id = p_tenant and awb_no = v_awb and deleted_at is null
   for update;
  if not found then
    raise exception using errcode = 'CMS01', message = format('Shipment "%s" not found', v_awb);
  end if;

  if nullif(btrim(coalesce(p_row->>'row_version','')),'') is not null then
    begin
      v_rv := (p_row->>'row_version')::int;
    exception when others then
      raise exception using errcode = 'CMS01', message = 'Invalid row_version';
    end;
    if v_rv is distinct from v_ship.row_version then
      raise exception using errcode = 'CMS01',
        message = format('Optimistic lock failed for AWB %s', v_awb);
    end if;
  end if;

  if v_ship.forwarding_awb is not distinct from v_fwd then
    return 'skipped';
  end if;

  update public.shipments
     set forwarding_awb = v_fwd,
         updated_at = now(),
         updated_by = auth.uid(),
         row_version = row_version + 1
   where id = v_ship.id and tenant_id = p_tenant;

  return 'ok';
end
$$;

create or replace function app.excel_import_awb_stock(
  p_tenant uuid,
  p_row jsonb,
  p_params jsonb
)
returns text
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_awb text := nullif(btrim(coalesce(p_row->>'awb_no','')),'');
  v_cust_code text := coalesce(
    nullif(btrim(coalesce(p_row->>'customer_code','')),''),
    nullif(btrim(coalesce(p_params->>'customer_code','')),''));
  v_status text := upper(coalesce(nullif(btrim(p_row->>'status'),''), 'AVAILABLE'));
  v_cust uuid;
  v_existing uuid;
begin
  if v_awb is null then
    raise exception using errcode = 'CMS01', message = 'awb_no is required';
  end if;
  if v_cust_code is null then
    raise exception using errcode = 'CMS01', message = 'customer_code is required';
  end if;
  if v_status not in ('AVAILABLE','ALLOCATED','USED','VOID') then
    raise exception using errcode = 'CMS01', message = format('Invalid status "%s"', v_status);
  end if;

  select id into v_cust from public.customers
   where tenant_id = p_tenant and code = v_cust_code and deleted_at is null;
  if v_cust is null then
    raise exception using errcode = 'CMS01', message = format('Customer "%s" not found', v_cust_code);
  end if;

  select id into v_existing from public.customer_awb_stock
   where tenant_id = p_tenant and awb_no = v_awb and deleted_at is null;
  if v_existing is not null then
    return 'skipped';
  end if;

  insert into public.customer_awb_stock (
    tenant_id, customer_id, awb_no, status, remark, created_by, updated_by)
  values (
    p_tenant, v_cust, v_awb, v_status,
    nullif(btrim(coalesce(p_row->>'remark','')),''),
    auth.uid(), auth.uid());

  return 'ok';
end
$$;

create or replace function app.excel_import_other_charges(
  p_tenant uuid,
  p_row jsonb,
  p_params jsonb
)
returns text
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_cust_code text := coalesce(
    nullif(btrim(coalesce(p_row->>'customer_code','')),''),
    nullif(btrim(coalesce(p_params->>'customer_code','')),''));
  v_charge text := nullif(btrim(coalesce(p_row->>'charge_type','')),'');
  v_amount numeric;
  v_cust uuid;
  v_seq int;
  v_from date;
  v_to date;
begin
  if v_cust_code is null then
    raise exception using errcode = 'CMS01', message = 'customer_code is required';
  end if;
  if v_charge is null then
    raise exception using errcode = 'CMS01', message = 'charge_type is required';
  end if;
  begin
    v_amount := nullif(btrim(coalesce(p_row->>'amount','')),'')::numeric;
  exception when others then
    raise exception using errcode = 'CMS01', message = 'Invalid amount';
  end;
  if v_amount is null then
    raise exception using errcode = 'CMS01', message = 'amount is required';
  end if;

  begin
    v_from := nullif(btrim(coalesce(p_row->>'from_date','')),'')::date;
    v_to := nullif(btrim(coalesce(p_row->>'to_date','')),'')::date;
  exception when others then
    raise exception using errcode = 'CMS01', message = 'Invalid from_date/to_date';
  end;

  select id into v_cust from public.customers
   where tenant_id = p_tenant and code = v_cust_code and deleted_at is null;
  if v_cust is null then
    raise exception using errcode = 'CMS01', message = format('Customer "%s" not found', v_cust_code);
  end if;

  select coalesce(max(seq), 0) + 1 into v_seq
    from public.customer_other_charges
   where tenant_id = p_tenant and customer_id = v_cust;

  insert into public.customer_other_charges (
    tenant_id, customer_id, seq, charge_type, from_date, to_date,
    vendor, service, product, origin, destination, amount, minimum_value)
  values (
    p_tenant, v_cust, v_seq, v_charge, v_from, v_to,
    nullif(btrim(coalesce(p_row->>'vendor','')),''),
    nullif(btrim(coalesce(p_row->>'service','')),''),
    nullif(btrim(coalesce(p_row->>'product','')),''),
    nullif(btrim(coalesce(p_row->>'origin','')),''),
    nullif(btrim(coalesce(p_row->>'destination','')),''),
    v_amount,
    nullif(btrim(coalesce(p_row->>'minimum_value','')),'')::numeric);

  return 'ok';
end
$$;

create or replace function app.excel_import_data_updation(
  p_tenant uuid,
  p_row jsonb,
  p_params jsonb
)
returns text
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_awb text := nullif(btrim(coalesce(p_row->>'awb_no','')),'');
  v_ship public.shipments;
  v_rv int;
  v_dest_code text := nullif(btrim(coalesce(p_row->>'destination_code','')),'');
  v_dest uuid;
  v_pieces int;
  v_weight numeric;
  v_changed boolean := false;
begin
  if v_awb is null then
    raise exception using errcode = 'CMS01', message = 'awb_no is required';
  end if;

  select * into v_ship from public.shipments
   where tenant_id = p_tenant and awb_no = v_awb and deleted_at is null
   for update;
  if not found then
    raise exception using errcode = 'CMS01', message = format('Shipment "%s" not found', v_awb);
  end if;

  if nullif(btrim(coalesce(p_row->>'row_version','')),'') is not null then
    begin
      v_rv := (p_row->>'row_version')::int;
    exception when others then
      raise exception using errcode = 'CMS01', message = 'Invalid row_version';
    end;
    if v_rv is distinct from v_ship.row_version then
      raise exception using errcode = 'CMS01',
        message = format('Optimistic lock failed for AWB %s', v_awb);
    end if;
  end if;

  if v_dest_code is not null then
    select id into v_dest from public.destinations
     where tenant_id = p_tenant and code = v_dest_code and deleted_at is null;
    if v_dest is null then
      raise exception using errcode = 'CMS01', message = format('Destination "%s" not found', v_dest_code);
    end if;
    if v_dest is distinct from v_ship.destination_id then
      v_ship.destination_id := v_dest;
      v_changed := true;
    end if;
  end if;

  if nullif(btrim(coalesce(p_row->>'pieces','')),'') is not null then
    begin
      v_pieces := (p_row->>'pieces')::int;
    exception when others then
      raise exception using errcode = 'CMS01', message = 'Invalid pieces';
    end;
    if v_pieces is distinct from v_ship.pieces then
      v_ship.pieces := v_pieces;
      v_changed := true;
    end if;
  end if;

  if nullif(btrim(coalesce(p_row->>'charge_weight','')),'') is not null then
    begin
      v_weight := (p_row->>'charge_weight')::numeric;
    exception when others then
      raise exception using errcode = 'CMS01', message = 'Invalid charge_weight';
    end;
    if v_weight is distinct from v_ship.charge_weight then
      v_ship.charge_weight := v_weight;
      v_changed := true;
    end if;
  end if;

  if nullif(btrim(coalesce(p_row->>'actual_weight','')),'') is not null then
    begin
      v_weight := (p_row->>'actual_weight')::numeric;
    exception when others then
      raise exception using errcode = 'CMS01', message = 'Invalid actual_weight';
    end;
    if v_weight is distinct from v_ship.actual_weight then
      v_ship.actual_weight := v_weight;
      v_changed := true;
    end if;
  end if;

  if not v_changed then
    return 'skipped';
  end if;

  update public.shipments
     set destination_id = v_ship.destination_id,
         pieces = v_ship.pieces,
         charge_weight = v_ship.charge_weight,
         actual_weight = v_ship.actual_weight,
         updated_at = now(),
         updated_by = auth.uid(),
         row_version = row_version + 1
   where id = v_ship.id and tenant_id = p_tenant;

  return 'ok';
end
$$;

-- ---------------------------------------------------------------------------
-- public.import_excel — dispatcher (mirrors import_master contract)
-- ---------------------------------------------------------------------------
create or replace function public.import_excel(
  p_import_type text,
  p_mode text,
  p_rows jsonb,
  p_params jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant   uuid;
  v_slug     text;
  v_type     text := upper(nullif(btrim(coalesce(p_import_type,'')),''));
  v_mode     text := upper(coalesce(p_mode, 'VALIDATE'));
  v_job      uuid;
  v_total    int := 0;
  v_ok       int := 0;
  v_skipped  int := 0;
  v_errcnt   int := 0;
  v_errors   jsonb := '[]'::jsonb;
  v_row      jsonb;
  v_idx      int := 0;
  v_col      text;
  v_msg      text;
  v_result   text;
  v_params   jsonb := coalesce(p_params, '{}'::jsonb);
begin
  v_slug := case v_type
    when 'AWB_MERGE' then 'utl.awb-merging'
    when 'POD_MERGE' then 'utl.pod-merging'
    when 'FORWARDING_MERGE' then 'utl.forwarding-merging'
    when 'AWB_STOCK' then 'utl.customer-awb-stock-merging'
    when 'OTHER_CHARGES' then 'utl.other-charges-import'
    when 'DATA_UPDATE' then 'utl.data-updation'
    else null end;

  if v_slug is null then
    raise exception 'Unsupported import type: %', p_import_type using errcode = '22023';
  end if;
  if v_mode not in ('VALIDATE','COMMIT') then
    raise exception 'Unsupported mode: % (expected VALIDATE or COMMIT)', p_mode
      using errcode = '22023';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'Too many rows (max 5000 per call); chunk the import'
      using errcode = '54000';
  end if;

  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  if not app.user_has_permission(v_tenant, v_slug, 'add') then
    raise exception 'Permission denied: % add', v_slug using errcode = '42501';
  end if;

  if v_mode = 'COMMIT' then
    insert into public.import_jobs
      (tenant_id, import_type, master, mode, status, total_rows, params, requested_by)
    values
      (v_tenant, v_type, v_type, 'COMMIT', 'RUNNING',
       jsonb_array_length(p_rows), v_params, auth.uid())
    returning id into v_job;
    perform set_config('app.suppress_row_audit', 'on', true);
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_idx := v_idx + 1;
    v_total := v_total + 1;
    v_col := null; v_msg := null; v_result := null;

    begin
      v_result := case v_type
        when 'AWB_MERGE' then app.excel_import_awb_merge(v_tenant, v_row, v_params)
        when 'POD_MERGE' then app.excel_import_pod_merge(v_tenant, v_row, v_params)
        when 'FORWARDING_MERGE' then app.excel_import_forwarding_merge(v_tenant, v_row, v_params)
        when 'AWB_STOCK' then app.excel_import_awb_stock(v_tenant, v_row, v_params)
        when 'OTHER_CHARGES' then app.excel_import_other_charges(v_tenant, v_row, v_params)
        when 'DATA_UPDATE' then app.excel_import_data_updation(v_tenant, v_row, v_params)
      end;

      if v_mode = 'VALIDATE' then
        raise exception using errcode = 'CMS00', message = 'dry-run';
      end if;

      if v_result = 'ok' then v_ok := v_ok + 1; else v_skipped := v_skipped + 1; end if;

    exception
      when sqlstate 'CMS00' then
        if v_result = 'ok' then v_ok := v_ok + 1; else v_skipped := v_skipped + 1; end if;

      when sqlstate 'CMS01' then
        v_msg := SQLERRM;
        v_errcnt := v_errcnt + 1;
        v_errors := v_errors || jsonb_build_object(
          'row_no', v_idx, 'column', v_col, 'message', v_msg);
        if v_mode = 'COMMIT' then
          insert into public.import_row_errors
            (tenant_id, job_id, row_no, column_name, message, raw)
          values (v_tenant, v_job, v_idx, v_col, v_msg, v_row);
        end if;

      when unique_violation or check_violation or foreign_key_violation
         or not_null_violation or invalid_text_representation then
        v_msg := SQLERRM;
        v_errcnt := v_errcnt + 1;
        v_errors := v_errors || jsonb_build_object(
          'row_no', v_idx, 'column', v_col, 'message', v_msg);
        if v_mode = 'COMMIT' then
          insert into public.import_row_errors
            (tenant_id, job_id, row_no, column_name, message, raw)
          values (v_tenant, v_job, v_idx, v_col, v_msg, v_row);
        end if;
    end;
  end loop;

  if v_mode = 'COMMIT' then
    update public.import_jobs
       set status = 'DONE',
           ok_rows = v_ok,
           skipped_rows = v_skipped,
           error_rows = v_errcnt,
           updated_at = now()
     where id = v_job;
    perform set_config('app.suppress_row_audit', 'off', true);
    perform app.write_audit_log(
      v_tenant, 'import_jobs', 'ADD', v_job, v_slug, null,
      jsonb_build_object(
        'import_type', v_type, 'mode', 'COMMIT',
        'total', v_total, 'ok', v_ok, 'skipped', v_skipped, 'errors', v_errcnt));
  end if;

  return jsonb_build_object(
    'import_type', v_type,
    'mode', v_mode,
    'job_id', v_job,
    'total', v_total,
    'ok', v_ok,
    'skipped', v_skipped,
    'error_count', v_errcnt,
    'errors', v_errors
  );
end
$$;

revoke all on function public.import_excel(text, text, jsonb, jsonb) from public;
grant execute on function public.import_excel(text, text, jsonb, jsonb)
  to authenticated, service_role;

comment on function public.import_excel(text, text, jsonb, jsonb) is
  'Excel import suite dispatcher (6A): VALIDATE dry-run or COMMIT via registered handlers; row errors -> import_row_errors; fatal -> full rollback.';
comment on function app.excel_import_awb_merge(uuid, jsonb, jsonb) is 'AWB Merge import handler';
comment on function app.excel_import_pod_merge(uuid, jsonb, jsonb) is 'POD Merge import handler';
comment on function app.excel_import_forwarding_merge(uuid, jsonb, jsonb) is 'Forwarding Merge import handler';
comment on function app.excel_import_awb_stock(uuid, jsonb, jsonb) is 'Customer AWB Stock import handler';
comment on function app.excel_import_other_charges(uuid, jsonb, jsonb) is 'Other Charges import handler';
comment on function app.excel_import_data_updation(uuid, jsonb, jsonb) is 'Data Updation import handler';
