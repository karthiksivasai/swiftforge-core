-- ===========================================================================
-- 0045  accounts receivable reports — Phase 5 Milestone 5D
-- ---------------------------------------------------------------------------
-- Extends 5A–5C reporting with AR metadata + source entities.
-- Does NOT redesign public execute_report / validate_report_filters signatures.
-- Data: ledger_entries (primary); receipts / customer_payments already posted
-- into the ledger. No invoice allocation schema — open-item ageing is FIFO on
-- ledger debits/credits only.
-- ===========================================================================

alter table public.report_definitions
  drop constraint if exists report_definitions_source_entity_check;

alter table public.report_definitions
  add constraint report_definitions_source_entity_check
  check (source_entity in (
    'SHIPMENTS','MANIFESTS','PICKUPS','LEDGER_ENTRIES','LOGIN_LOGS',
    'DRS','POD_RECORDS','TRACKING_EVENTS',
    'MANIFEST_SCAN_EVENTS','SHIPMENT_SCAN_EVENTS','OPS_MIS_SUMMARY',
    'RECEIPTS','EXPENSE_ENTRIES','CUSTOMER_PAYMENTS',
    'AR_BALANCE_SUMMARY','AR_OUTSTANDING_DETAIL',
    'AR_AGEING_SUMMARY','AR_AGEING_DETAIL'
  ));

-- ---------------------------------------------------------------------------
-- Filter validation: as_on_date may satisfy the date window
-- ---------------------------------------------------------------------------
create or replace function app.validate_report_filters_internal(
  p_def public.report_definitions,
  p_filters jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_f jsonb;
  v_key text;
  v_type text;
  v_req boolean;
  v_from date;
  v_to date;
  v_as_on date;
  v_val text;
  v_opts jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_span integer;
begin
  if p_filters is null or jsonb_typeof(p_filters) <> 'object' then
    raise exception 'filters must be a JSON object' using errcode = '22023';
  end if;

  for v_f in select * from jsonb_array_elements(coalesce(p_def.filter_schema,'[]'::jsonb))
  loop
    v_key := v_f->>'key';
    v_type := v_f->>'type';
    v_req := coalesce((v_f->>'required')::boolean, false);
    v_val := nullif(btrim(coalesce(p_filters->>v_key,'')),'');

    if v_req and v_val is null and v_type <> 'BOOLEAN' and v_type <> 'DATE_RANGE' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field', v_key, 'message', format('%s is required', coalesce(v_f->>'label', v_key))));
    end if;

    if v_type = 'ENUM' and v_val is not null then
      v_opts := coalesce(v_f->'options','[]'::jsonb);
      if not exists (
        select 1 from jsonb_array_elements_text(v_opts) o(x) where o.x = v_val
      ) then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'field', v_key, 'message', format('Invalid value for %s', v_key)));
      end if;
    end if;

    if v_type = 'BOOLEAN' and p_filters ? v_key then
      begin
        perform (p_filters->>v_key)::boolean;
      exception when others then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'field', v_key, 'message', 'Must be boolean'));
      end;
    end if;
  end loop;

  begin
    v_from := nullif(btrim(coalesce(p_filters->>'from_date','')),'')::date;
    v_to := nullif(btrim(coalesce(p_filters->>'to_date','')),'')::date;
    v_as_on := nullif(btrim(coalesce(p_filters->>'as_on_date','')),'')::date;
  exception when others then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field','from_date','message','Invalid date'));
    return jsonb_build_object('ok', false, 'errors', v_errors);
  end;

  -- As-on-date reports may omit from/to; mirror as_on into the window.
  if v_as_on is not null then
    v_from := coalesce(v_from, v_as_on);
    v_to := coalesce(v_to, v_as_on);
  end if;

  if v_from is null or v_to is null then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field','from_date','message','From Date and To Date (or As-On Date) are required'));
  elsif v_to < v_from then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field','to_date','message','To Date must be on or after From Date'));
  else
    v_span := (v_to - v_from);
    if v_span > coalesce(p_def.max_date_span_days, 31) then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'field','to_date',
        'message', format('Date range cannot exceed %s days', p_def.max_date_span_days)));
    end if;
  end if;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_errors) = 0,
    'errors', v_errors,
    'from_date', v_from,
    'to_date', v_to,
    'as_on_date', coalesce(v_as_on, v_to));
end
$$;

-- ---------------------------------------------------------------------------
-- AR helpers (ledger-only; FIFO open-item for ageing — not invoice allocation)
-- ---------------------------------------------------------------------------
create or replace function app.ar_as_on_date(p_filters jsonb, p_to date)
returns date
language sql
immutable
as $$
  select coalesce(
    nullif(btrim(coalesce(p_filters->>'as_on_date','')),'')::date,
    p_to);
$$;

create or replace function app.ar_bucket(p_as_on date, p_entry_date date)
returns text
language sql
immutable
as $$
  select case
    when (p_as_on - p_entry_date) <= 30 then '0-30'
    when (p_as_on - p_entry_date) <= 60 then '31-60'
    when (p_as_on - p_entry_date) <= 90 then '61-90'
    else '90+'
  end;
$$;

create or replace function app.execute_report_source(
  p_tenant uuid,
  p_def public.report_definitions,
  p_filters jsonb,
  p_from date,
  p_to date,
  p_limit integer,
  p_offset integer,
  p_sort_col text,
  p_sort_dir text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_rows jsonb := '[]'::jsonb;
  v_total bigint := 0;
  v_cust_code text := nullif(btrim(coalesce(p_filters->>'customer_code','')),'');
  v_status text := nullif(btrim(coalesce(p_filters->>'status','')),'');
  v_event text := nullif(btrim(coalesce(p_filters->>'event','')),'');
  v_username text := nullif(btrim(coalesce(p_filters->>'username','')),'');
  v_doc_type text := nullif(btrim(coalesce(p_filters->>'doc_type','')),'');
  v_branch_code text := nullif(btrim(coalesce(p_filters->>'branch_code','')),'');
  v_dest_code text := nullif(btrim(coalesce(p_filters->>'destination_code','')),'');
  v_product_code text := nullif(btrim(coalesce(p_filters->>'product_code','')),'');
  v_awb_no text := nullif(btrim(coalesce(p_filters->>'awb_no','')),'');
  v_manifest_no text := nullif(btrim(coalesce(p_filters->>'manifest_no','')),'');
  v_pickup_no text := nullif(btrim(coalesce(p_filters->>'pickup_no','')),'');
  v_drs_no text := nullif(btrim(coalesce(p_filters->>'drs_no','')),'');
  v_sc_code text := nullif(btrim(coalesce(p_filters->>'service_center_code','')),'');
  v_fe_code text := nullif(btrim(coalesce(p_filters->>'field_executive_code','')),'');
  v_se_code text := nullif(btrim(coalesce(p_filters->>'sales_executive_code','')),'');
  v_cust_id uuid;
  v_dir text := case when lower(coalesce(p_sort_dir,'desc')) = 'asc' then 'asc' else 'desc' end;
  v_status_set text[] := null;
  v_receipt_no text := nullif(btrim(coalesce(p_filters->>'receipt_no','')),'');
  v_mode text := nullif(btrim(coalesce(p_filters->>'payment_mode','')),'');
  v_auth_status text := nullif(btrim(coalesce(p_filters->>'expense_status','')),'');
  v_pay_status text := nullif(btrim(coalesce(p_filters->>'payment_status','')),'');
  v_ledger_account text := nullif(btrim(coalesce(p_filters->>'ledger_account','')),'');
  v_amount_min numeric := null;
  v_amount_max numeric := null;
  v_as_on date;
  v_out_status text := nullif(btrim(coalesce(p_filters->>'outstanding_status','')),'');
  v_age_bucket text := nullif(btrim(coalesce(p_filters->>'ageing_bucket','')),'');
  v_bal_min numeric := null;
  v_bal_max numeric := null;
begin
  begin
    if nullif(btrim(coalesce(p_filters->>'amount_min','')),'') is not null then
      v_amount_min := (p_filters->>'amount_min')::numeric;
    end if;
    if nullif(btrim(coalesce(p_filters->>'amount_max','')),'') is not null then
      v_amount_max := (p_filters->>'amount_max')::numeric;
    end if;
  exception when others then
    raise exception 'Invalid amount range' using errcode = '22023';
  end;

  begin
    if nullif(btrim(coalesce(p_filters->>'balance_min','')),'') is not null then
      v_bal_min := (p_filters->>'balance_min')::numeric;
    end if;
    if nullif(btrim(coalesce(p_filters->>'balance_max','')),'') is not null then
      v_bal_max := (p_filters->>'balance_max')::numeric;
    end if;
  exception when others then
    raise exception 'Invalid balance range' using errcode = '22023';
  end;

  v_as_on := app.ar_as_on_date(p_filters, p_to);

  -- Finance report presets (reuse document status snapshots)
  if p_def.report_key = 'cash-collection-report' and v_mode is null then
    v_mode := 'CASH';
  end if;
  if p_def.report_key = 'expense-authorization-report' and v_auth_status is null then
    v_auth_status := 'UNAUTHORIZED';
  end if;
  if p_def.report_key = 'customer-payment-approval-report' and v_pay_status is null then
    v_pay_status := 'PENDING';
  end if;
  -- Preset status sets for specialized shipment reports (same snapshot column).
  if p_def.report_key = 'undelivered-report' and v_status is null then
    v_status_set := array['UNDELIVERED','UNDELIVERED_RECEIVED'];
  elsif p_def.report_key = 'delivery-report' and v_status is null then
    v_status_set := array['DELIVERED','DELIVERED_PENDING_POD'];
  end if;

  if p_def.source_entity = 'SHIPMENTS' then
    select count(*) into v_total
      from public.shipments s
      left join public.customers c on c.id = s.customer_id and c.tenant_id = s.tenant_id
      left join public.destinations d on d.id = s.destination_id and d.tenant_id = s.tenant_id
      left join public.branches b on b.id = s.branch_id and b.tenant_id = s.tenant_id
      left join public.products pr on pr.id = s.product_id and pr.tenant_id = s.tenant_id
      left join public.field_executives fe
        on fe.id = s.field_executive_id and fe.tenant_id = s.tenant_id
      left join public.pickups pk on pk.id = s.pickup_id and pk.tenant_id = s.tenant_id
     where s.tenant_id = p_tenant and s.deleted_at is null
       and s.book_date between p_from and p_to
       and (v_cust_code is null or c.code = v_cust_code)
       and (v_status is null or s.current_status = v_status)
       and (v_status_set is null or s.current_status = any (v_status_set))
       and (v_branch_code is null or b.code = v_branch_code)
       and (v_dest_code is null or d.code = v_dest_code)
       and (v_product_code is null or pr.code = v_product_code)
       and (v_awb_no is null or s.awb_no ilike '%'||v_awb_no||'%')
       and (v_fe_code is null or fe.code = v_fe_code)
       and (v_pickup_no is null or pk.pickup_no::text = v_pickup_no)
       and (v_manifest_no is null or exists (
             select 1 from public.manifest_lines ml
             join public.manifests m on m.id = ml.manifest_id and m.tenant_id = ml.tenant_id
            where ml.tenant_id = s.tenant_id and ml.shipment_id = s.id
              and ml.deleted_at is null and m.deleted_at is null
              and m.manifest_no = v_manifest_no))
       and (v_drs_no is null or exists (
             select 1 from public.drs_lines dl
             join public.drs dr on dr.id = dl.drs_id and dr.tenant_id = dl.tenant_id
            where dl.tenant_id = s.tenant_id and dl.shipment_id = s.id
              and dl.deleted_at is null and dr.deleted_at is null
              and dr.drs_no = v_drs_no));

    select coalesce(jsonb_agg(to_jsonb(t) - 'sort_ts'), '[]'::jsonb) into v_rows
      from (
        select
          s.awb_no,
          s.book_date,
          c.code as customer_code,
          b.code as branch_code,
          d.code as destination_code,
          pr.code as product_code,
          s.current_status as status,
          s.charge_weight,
          s.grand_total,
          s.pieces,
          fe.code as field_executive_code,
          s.book_date::timestamptz as sort_ts
        from public.shipments s
        left join public.customers c on c.id = s.customer_id and c.tenant_id = s.tenant_id
        left join public.destinations d on d.id = s.destination_id and d.tenant_id = s.tenant_id
        left join public.branches b on b.id = s.branch_id and b.tenant_id = s.tenant_id
        left join public.products pr on pr.id = s.product_id and pr.tenant_id = s.tenant_id
        left join public.field_executives fe
          on fe.id = s.field_executive_id and fe.tenant_id = s.tenant_id
        left join public.pickups pk on pk.id = s.pickup_id and pk.tenant_id = s.tenant_id
        where s.tenant_id = p_tenant and s.deleted_at is null
          and s.book_date between p_from and p_to
          and (v_cust_code is null or c.code = v_cust_code)
          and (v_status is null or s.current_status = v_status)
          and (v_status_set is null or s.current_status = any (v_status_set))
          and (v_branch_code is null or b.code = v_branch_code)
          and (v_dest_code is null or d.code = v_dest_code)
          and (v_product_code is null or pr.code = v_product_code)
          and (v_awb_no is null or s.awb_no ilike '%'||v_awb_no||'%')
          and (v_fe_code is null or fe.code = v_fe_code)
          and (v_pickup_no is null or pk.pickup_no::text = v_pickup_no)
          and (v_manifest_no is null or exists (
                select 1 from public.manifest_lines ml
                join public.manifests m on m.id = ml.manifest_id and m.tenant_id = ml.tenant_id
               where ml.tenant_id = s.tenant_id and ml.shipment_id = s.id
                 and ml.deleted_at is null and m.deleted_at is null
                 and m.manifest_no = v_manifest_no))
          and (v_drs_no is null or exists (
                select 1 from public.drs_lines dl
                join public.drs dr on dr.id = dl.drs_id and dr.tenant_id = dl.tenant_id
               where dl.tenant_id = s.tenant_id and dl.shipment_id = s.id
                 and dl.deleted_at is null and dr.deleted_at is null
                 and dr.drs_no = v_drs_no))
        order by
          case when v_dir = 'asc' then s.book_date end asc nulls last,
          case when v_dir = 'desc' then s.book_date end desc nulls last,
          s.created_at desc
        limit p_limit offset p_offset
      ) t;

  elsif p_def.source_entity = 'MANIFESTS' then
    select count(*) into v_total
      from public.manifests m
      left join public.branches b on b.id = m.origin_branch_id and b.tenant_id = m.tenant_id
      left join public.service_centers sc
        on sc.id = m.to_service_center_id and sc.tenant_id = m.tenant_id
     where m.tenant_id = p_tenant and m.deleted_at is null
       and m.manifest_date between p_from and p_to
       and (v_status is null or m.status = v_status)
       and (v_branch_code is null or b.code = v_branch_code)
       and (v_sc_code is null or sc.code = v_sc_code)
       and (v_manifest_no is null or m.manifest_no = v_manifest_no);

    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows
      from (
        select
          m.manifest_no,
          m.manifest_date,
          m.manifest_kind,
          b.code as origin_code,
          sc.code as destination_code,
          m.status,
          (select count(*) from public.manifest_lines ml
            where ml.tenant_id = m.tenant_id and ml.manifest_id = m.id and ml.deleted_at is null
          )::int as total_awbs
        from public.manifests m
        left join public.branches b on b.id = m.origin_branch_id and b.tenant_id = m.tenant_id
        left join public.service_centers sc
          on sc.id = m.to_service_center_id and sc.tenant_id = m.tenant_id
        where m.tenant_id = p_tenant and m.deleted_at is null
          and m.manifest_date between p_from and p_to
          and (v_status is null or m.status = v_status)
          and (v_branch_code is null or b.code = v_branch_code)
          and (v_sc_code is null or sc.code = v_sc_code)
          and (v_manifest_no is null or m.manifest_no = v_manifest_no)
        order by
          case when v_dir = 'asc' then m.manifest_date end asc,
          case when v_dir = 'desc' then m.manifest_date end desc,
          m.created_at desc
        limit p_limit offset p_offset
      ) t;

  elsif p_def.source_entity = 'PICKUPS' then
    select count(*) into v_total
      from public.pickups p
      left join public.customers c on c.id = p.customer_id and c.tenant_id = p.tenant_id
      left join public.branches b on b.id = p.branch_id and b.tenant_id = p.tenant_id
      left join public.field_executives fe
        on fe.id = p.field_executive_id and fe.tenant_id = p.tenant_id
      left join public.sales_executives se
        on se.id = p.sales_executive_id and se.tenant_id = p.tenant_id
     where p.tenant_id = p_tenant and p.deleted_at is null
       and p.pickup_date between p_from and p_to
       and (v_status is null or p.status = v_status)
       and (v_cust_code is null or c.code = v_cust_code)
       and (v_branch_code is null or b.code = v_branch_code)
       and (v_fe_code is null or fe.code = v_fe_code)
       and (v_se_code is null or se.code = v_se_code)
       and (v_pickup_no is null or p.pickup_no::text = v_pickup_no)
       and (v_awb_no is null or p.awb_no ilike '%'||v_awb_no||'%');

    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows
      from (
        select
          p.pickup_no,
          p.pickup_date,
          c.code as customer_code,
          b.code as branch_code,
          p.mobile_no,
          p.status,
          p.awb_no,
          fe.code as field_executive_code,
          se.code as sales_executive_code
        from public.pickups p
        left join public.customers c on c.id = p.customer_id and c.tenant_id = p.tenant_id
        left join public.branches b on b.id = p.branch_id and b.tenant_id = p.tenant_id
        left join public.field_executives fe
          on fe.id = p.field_executive_id and fe.tenant_id = p.tenant_id
        left join public.sales_executives se
          on se.id = p.sales_executive_id and se.tenant_id = p.tenant_id
        where p.tenant_id = p_tenant and p.deleted_at is null
          and p.pickup_date between p_from and p_to
          and (v_status is null or p.status = v_status)
          and (v_cust_code is null or c.code = v_cust_code)
          and (v_branch_code is null or b.code = v_branch_code)
          and (v_fe_code is null or fe.code = v_fe_code)
          and (v_se_code is null or se.code = v_se_code)
          and (v_pickup_no is null or p.pickup_no::text = v_pickup_no)
          and (v_awb_no is null or p.awb_no ilike '%'||v_awb_no||'%')
        order by
          case when v_dir = 'asc' then p.pickup_date end asc,
          case when v_dir = 'desc' then p.pickup_date end desc,
          p.created_at desc
        limit p_limit offset p_offset
      ) t;

  elsif p_def.source_entity = 'DRS' then
    select count(*) into v_total
      from public.drs dr
      left join public.branches b on b.id = dr.branch_id and b.tenant_id = dr.tenant_id
      left join public.destinations d on d.id = dr.destination_id and d.tenant_id = dr.tenant_id
      left join public.field_executives fe
        on fe.id = dr.delivery_executive_id and fe.tenant_id = dr.tenant_id
     where dr.tenant_id = p_tenant and dr.deleted_at is null
       and dr.drs_date between p_from and p_to
       and (v_status is null or dr.status = v_status)
       and (v_branch_code is null or b.code = v_branch_code)
       and (v_dest_code is null or d.code = v_dest_code)
       and (v_fe_code is null or fe.code = v_fe_code)
       and (v_drs_no is null or dr.drs_no = v_drs_no);

    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows
      from (
        select
          dr.drs_no,
          dr.drs_date,
          b.code as branch_code,
          d.code as destination_code,
          fe.code as field_executive_code,
          dr.status,
          (select count(*) from public.drs_lines dl
            where dl.tenant_id = dr.tenant_id and dl.drs_id = dr.id and dl.deleted_at is null
          )::int as total_awbs
        from public.drs dr
        left join public.branches b on b.id = dr.branch_id and b.tenant_id = dr.tenant_id
        left join public.destinations d on d.id = dr.destination_id and d.tenant_id = dr.tenant_id
        left join public.field_executives fe
          on fe.id = dr.delivery_executive_id and fe.tenant_id = dr.tenant_id
        where dr.tenant_id = p_tenant and dr.deleted_at is null
          and dr.drs_date between p_from and p_to
          and (v_status is null or dr.status = v_status)
          and (v_branch_code is null or b.code = v_branch_code)
          and (v_dest_code is null or d.code = v_dest_code)
          and (v_fe_code is null or fe.code = v_fe_code)
          and (v_drs_no is null or dr.drs_no = v_drs_no)
        order by
          case when v_dir = 'asc' then dr.drs_date end asc,
          case when v_dir = 'desc' then dr.drs_date end desc,
          dr.created_at desc
        limit p_limit offset p_offset
      ) t;

  elsif p_def.source_entity = 'POD_RECORDS' then
    select count(*) into v_total
      from public.pod_records pod
      join public.shipments s on s.id = pod.shipment_id and s.tenant_id = pod.tenant_id
      left join public.customers c on c.id = s.customer_id and c.tenant_id = s.tenant_id
      left join public.destinations d on d.id = s.destination_id and d.tenant_id = s.tenant_id
     where pod.tenant_id = p_tenant and pod.deleted_at is null
       and pod.pod_date between p_from and p_to
       and (v_status is null or pod.status = v_status)
       and (v_cust_code is null or c.code = v_cust_code)
       and (v_dest_code is null or d.code = v_dest_code)
       and (v_awb_no is null or pod.awb_no ilike '%'||v_awb_no||'%');

    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows
      from (
        select
          pod.awb_no,
          pod.pod_date,
          pod.receiver_name,
          pod.status as pod_status,
          s.current_status as shipment_status,
          c.code as customer_code,
          d.code as destination_code,
          pod.source,
          pod.remark
        from public.pod_records pod
        join public.shipments s on s.id = pod.shipment_id and s.tenant_id = pod.tenant_id
        left join public.customers c on c.id = s.customer_id and c.tenant_id = s.tenant_id
        left join public.destinations d on d.id = s.destination_id and d.tenant_id = s.tenant_id
        where pod.tenant_id = p_tenant and pod.deleted_at is null
          and pod.pod_date between p_from and p_to
          and (v_status is null or pod.status = v_status)
          and (v_cust_code is null or c.code = v_cust_code)
          and (v_dest_code is null or d.code = v_dest_code)
          and (v_awb_no is null or pod.awb_no ilike '%'||v_awb_no||'%')
        order by
          case when v_dir = 'asc' then pod.pod_date end asc,
          case when v_dir = 'desc' then pod.pod_date end desc,
          pod.created_at desc
        limit p_limit offset p_offset
      ) t;

  elsif p_def.source_entity = 'TRACKING_EVENTS' then
    select count(*) into v_total
      from public.tracking_events te
      join public.shipments s on s.id = te.shipment_id and s.tenant_id = te.tenant_id
     where te.tenant_id = p_tenant and te.deleted_at is null
       and te.event_date between p_from and p_to
       and (v_awb_no is null or s.awb_no ilike '%'||v_awb_no||'%')
       and (v_status is null or s.current_status = v_status);

    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows
      from (
        select
          s.awb_no,
          te.event_date,
          te.event_time,
          te.status_text,
          te.remark,
          te.source,
          s.current_status as shipment_status,
          te.created_at
        from public.tracking_events te
        join public.shipments s on s.id = te.shipment_id and s.tenant_id = te.tenant_id
        where te.tenant_id = p_tenant and te.deleted_at is null
          and te.event_date between p_from and p_to
          and (v_awb_no is null or s.awb_no ilike '%'||v_awb_no||'%')
          and (v_status is null or s.current_status = v_status)
        order by
          case when v_dir = 'asc' then te.created_at end asc,
          case when v_dir = 'desc' then te.created_at end desc
        limit p_limit offset p_offset
      ) t;

  elsif p_def.source_entity = 'MANIFEST_SCAN_EVENTS' then
    select count(*) into v_total
      from public.manifest_scan_events mse
      join public.manifests m on m.id = mse.manifest_id and m.tenant_id = mse.tenant_id
     where mse.tenant_id = p_tenant and mse.deleted_at is null
       and mse.created_at::date between p_from and p_to
       and (v_manifest_no is null or m.manifest_no = v_manifest_no)
       and (v_awb_no is null or mse.awb_no ilike '%'||v_awb_no||'%');

    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows
      from (
        select
          m.manifest_no,
          mse.awb_no,
          mse.event_type,
          mse.scan_mode,
          mse.event_text,
          mse.bag_no,
          mse.created_at
        from public.manifest_scan_events mse
        join public.manifests m on m.id = mse.manifest_id and m.tenant_id = mse.tenant_id
        where mse.tenant_id = p_tenant and mse.deleted_at is null
          and mse.created_at::date between p_from and p_to
          and (v_manifest_no is null or m.manifest_no = v_manifest_no)
          and (v_awb_no is null or mse.awb_no ilike '%'||v_awb_no||'%')
        order by
          case when v_dir = 'asc' then mse.created_at end asc,
          case when v_dir = 'desc' then mse.created_at end desc
        limit p_limit offset p_offset
      ) t;

  elsif p_def.source_entity = 'SHIPMENT_SCAN_EVENTS' then
    select count(*) into v_total
      from public.shipment_scan_events sse
      join public.shipments s on s.id = sse.shipment_id and s.tenant_id = sse.tenant_id
      left join public.manifests m on m.id = sse.manifest_id and m.tenant_id = sse.tenant_id
     where sse.tenant_id = p_tenant and sse.deleted_at is null
       and sse.created_at::date between p_from and p_to
       and (v_awb_no is null or sse.awb_no ilike '%'||v_awb_no||'%')
       and (v_manifest_no is null or m.manifest_no = v_manifest_no)
       and (v_status is null or s.current_status = v_status);

    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows
      from (
        select
          sse.awb_no,
          sse.event_type,
          sse.event_text,
          m.manifest_no,
          s.current_status as shipment_status,
          sse.created_at
        from public.shipment_scan_events sse
        join public.shipments s on s.id = sse.shipment_id and s.tenant_id = sse.tenant_id
        left join public.manifests m on m.id = sse.manifest_id and m.tenant_id = sse.tenant_id
        where sse.tenant_id = p_tenant and sse.deleted_at is null
          and sse.created_at::date between p_from and p_to
          and (v_awb_no is null or sse.awb_no ilike '%'||v_awb_no||'%')
          and (v_manifest_no is null or m.manifest_no = v_manifest_no)
          and (v_status is null or s.current_status = v_status)
        order by
          case when v_dir = 'asc' then sse.created_at end asc,
          case when v_dir = 'desc' then sse.created_at end desc
        limit p_limit offset p_offset
      ) t;

  elsif p_def.source_entity = 'OPS_MIS_SUMMARY' then
    -- Synchronous summary from shipment snapshots (no materialized rollups).
    select count(*) into v_total
      from (
        select 1
          from public.shipments s
          left join public.branches b on b.id = s.branch_id and b.tenant_id = s.tenant_id
         where s.tenant_id = p_tenant and s.deleted_at is null
           and s.book_date between p_from and p_to
           and (v_branch_code is null or b.code = v_branch_code)
         group by coalesce(b.code, '(none)'), s.current_status
      ) x;

    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows
      from (
        select
          coalesce(b.code, '(none)') as branch_code,
          s.current_status as status,
          count(*)::int as shipment_count,
          coalesce(sum(s.charge_weight), 0) as total_charge_weight,
          coalesce(sum(s.grand_total), 0) as total_amount
        from public.shipments s
        left join public.branches b on b.id = s.branch_id and b.tenant_id = s.tenant_id
        where s.tenant_id = p_tenant and s.deleted_at is null
          and s.book_date between p_from and p_to
          and (v_branch_code is null or b.code = v_branch_code)
        group by coalesce(b.code, '(none)'), s.current_status
        order by
          case when v_dir = 'asc' then coalesce(b.code, '(none)') end asc,
          case when v_dir = 'desc' then coalesce(b.code, '(none)') end desc,
          s.current_status
        limit p_limit offset p_offset
      ) t;


  elsif p_def.source_entity = 'RECEIPTS' then
    select count(*) into v_total
      from public.receipts r
      left join public.customers c on c.id = r.customer_id and c.tenant_id = r.tenant_id
      left join public.branches b on b.id = r.branch_id and b.tenant_id = r.tenant_id
     where r.tenant_id = p_tenant and r.deleted_at is null
       and r.receipt_date between p_from and p_to
       and (v_cust_code is null or c.code = v_cust_code)
       and (v_branch_code is null or b.code = v_branch_code)
       and (v_status is null or r.status = v_status)
       and (v_mode is null or r.mode = v_mode)
       and (v_receipt_no is null or r.receipt_no ilike '%'||v_receipt_no||'%')
       and (v_amount_min is null or r.amount >= v_amount_min)
       and (v_amount_max is null or r.amount <= v_amount_max);

    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows
      from (
        select
          r.receipt_no,
          r.receipt_date,
          c.code as customer_code,
          b.code as branch_code,
          r.mode as payment_mode,
          r.amount,
          r.status,
          r.narration
        from public.receipts r
        left join public.customers c on c.id = r.customer_id and c.tenant_id = r.tenant_id
        left join public.branches b on b.id = r.branch_id and b.tenant_id = r.tenant_id
        where r.tenant_id = p_tenant and r.deleted_at is null
          and r.receipt_date between p_from and p_to
          and (v_cust_code is null or c.code = v_cust_code)
          and (v_branch_code is null or b.code = v_branch_code)
          and (v_status is null or r.status = v_status)
          and (v_mode is null or r.mode = v_mode)
          and (v_receipt_no is null or r.receipt_no ilike '%'||v_receipt_no||'%')
          and (v_amount_min is null or r.amount >= v_amount_min)
          and (v_amount_max is null or r.amount <= v_amount_max)
        order by
          case when v_dir = 'asc' then r.receipt_date end asc,
          case when v_dir = 'desc' then r.receipt_date end desc,
          r.created_at desc
        limit p_limit offset p_offset
      ) t;

  elsif p_def.source_entity = 'EXPENSE_ENTRIES' then
    select count(*) into v_total
      from public.expense_entries e
      left join public.branches b on b.id = e.branch_id and b.tenant_id = e.tenant_id
     where e.tenant_id = p_tenant and e.deleted_at is null
       and e.entry_date between p_from and p_to
       and (v_branch_code is null or b.code = v_branch_code)
       and (v_auth_status is null or e.authorization_status = v_auth_status)
       and (v_mode is null or e.mode = v_mode)
       and (v_ledger_account is null
            or e.expense_head_code = v_ledger_account
            or exists (
              select 1 from public.expense_heads h
               where h.tenant_id = e.tenant_id and h.id = e.expense_head_id
                 and (h.ledger = v_ledger_account or h.gl_account = v_ledger_account
                      or h.code = v_ledger_account)))
       and (v_amount_min is null or e.amount >= v_amount_min)
       and (v_amount_max is null or e.amount <= v_amount_max);

    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows
      from (
        select
          e.entry_no,
          e.entry_date,
          e.kind,
          e.expense_head_code as ledger_account,
          e.expense_head_name,
          b.code as branch_code,
          e.mode as payment_mode,
          e.amount,
          e.authorization_status as expense_status,
          e.description,
          e.awb_no
        from public.expense_entries e
        left join public.branches b on b.id = e.branch_id and b.tenant_id = e.tenant_id
        where e.tenant_id = p_tenant and e.deleted_at is null
          and e.entry_date between p_from and p_to
          and (v_branch_code is null or b.code = v_branch_code)
          and (v_auth_status is null or e.authorization_status = v_auth_status)
          and (v_mode is null or e.mode = v_mode)
          and (v_ledger_account is null
               or e.expense_head_code = v_ledger_account
               or exists (
                 select 1 from public.expense_heads h
                  where h.tenant_id = e.tenant_id and h.id = e.expense_head_id
                    and (h.ledger = v_ledger_account or h.gl_account = v_ledger_account
                         or h.code = v_ledger_account)))
          and (v_amount_min is null or e.amount >= v_amount_min)
          and (v_amount_max is null or e.amount <= v_amount_max)
        order by
          case when v_dir = 'asc' then e.entry_date end asc,
          case when v_dir = 'desc' then e.entry_date end desc,
          e.created_at desc
        limit p_limit offset p_offset
      ) t;

  elsif p_def.source_entity = 'CUSTOMER_PAYMENTS' then
    select count(*) into v_total
      from public.customer_payments cp
      left join public.customers c on c.id = cp.customer_id and c.tenant_id = cp.tenant_id
     where cp.tenant_id = p_tenant and cp.deleted_at is null
       and cp.declared_date between p_from and p_to
       and (v_cust_code is null or c.code = v_cust_code)
       and (v_pay_status is null or cp.status = v_pay_status)
       and (v_amount_min is null or cp.amount >= v_amount_min)
       and (v_amount_max is null or cp.amount <= v_amount_max);

    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows
      from (
        select
          c.code as customer_code,
          cp.declared_date,
          cp.paid_date,
          cp.amount,
          cp.status as payment_status,
          cp.remark,
          cp.reviewed_at
        from public.customer_payments cp
        left join public.customers c on c.id = cp.customer_id and c.tenant_id = cp.tenant_id
        where cp.tenant_id = p_tenant and cp.deleted_at is null
          and cp.declared_date between p_from and p_to
          and (v_cust_code is null or c.code = v_cust_code)
          and (v_pay_status is null or cp.status = v_pay_status)
          and (v_amount_min is null or cp.amount >= v_amount_min)
          and (v_amount_max is null or cp.amount <= v_amount_max)
        order by
          case when v_dir = 'asc' then cp.declared_date end asc,
          case when v_dir = 'desc' then cp.declared_date end desc,
          cp.created_at desc
        limit p_limit offset p_offset
      ) t;

  elsif p_def.source_entity = 'LEDGER_ENTRIES' then
    if p_def.report_key in ('customer-ledger','customer-statement') and v_cust_code is null then
      raise exception 'Customer is required for customer ledger' using errcode = 'CMS04';
    end if;
    v_cust_id := null;
    if v_cust_code is not null then
      select c.id into v_cust_id from public.customers c
       where c.tenant_id = p_tenant and c.code = v_cust_code and c.deleted_at is null;
      if v_cust_id is null then
        raise exception 'Customer not found: %', v_cust_code using errcode = 'P0002';
      end if;
    end if;

    select count(*) into v_total
      from public.ledger_entries le
      left join public.customers c on c.id = le.customer_id and c.tenant_id = le.tenant_id
      left join public.branches b on b.id = le.branch_id and b.tenant_id = le.tenant_id
     where le.tenant_id = p_tenant and le.deleted_at is null
       and le.entry_date between p_from and p_to
       and (v_cust_id is null or le.customer_id = v_cust_id)
       and (v_branch_code is null or b.code = v_branch_code)
       and (v_doc_type is null or le.doc_type = v_doc_type)
       and (v_amount_min is null or (le.debit + le.credit) >= v_amount_min)
       and (v_amount_max is null or (le.debit + le.credit) <= v_amount_max);

    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows
      from (
        select
          le.entry_date,
          c.code as customer_code,
          b.code as branch_code,
          le.doc_type,
          le.narration,
          le.debit,
          le.credit,
          le.balance_after
        from public.ledger_entries le
        left join public.customers c on c.id = le.customer_id and c.tenant_id = le.tenant_id
        left join public.branches b on b.id = le.branch_id and b.tenant_id = le.tenant_id
        where le.tenant_id = p_tenant and le.deleted_at is null
          and le.entry_date between p_from and p_to
          and (v_cust_id is null or le.customer_id = v_cust_id)
          and (v_branch_code is null or b.code = v_branch_code)
          and (v_doc_type is null or le.doc_type = v_doc_type)
          and (v_amount_min is null or (le.debit + le.credit) >= v_amount_min)
          and (v_amount_max is null or (le.debit + le.credit) <= v_amount_max)
        order by
          case when v_dir = 'asc' then le.entry_date end asc,
          case when v_dir = 'desc' then le.entry_date end desc,
          le.created_at
        limit p_limit offset p_offset
      ) t;

  elsif p_def.source_entity = 'LOGIN_LOGS' then
    select count(*) into v_total
      from public.login_logs l
     where l.tenant_id = p_tenant
       and l.created_at::date between p_from and p_to
       and (v_event is null or l.event = v_event)
       and (v_username is null or l.username ilike '%'||v_username||'%');

    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows
      from (
        select
          l.created_at,
          l.username,
          l.event,
          l.user_type,
          host(l.ip_address) as ip_address,
          l.detail
        from public.login_logs l
        where l.tenant_id = p_tenant
          and l.created_at::date between p_from and p_to
          and (v_event is null or l.event = v_event)
          and (v_username is null or l.username ilike '%'||v_username||'%')
        order by
          case when v_dir = 'asc' then l.created_at end asc,
          case when v_dir = 'desc' then l.created_at end desc
        limit p_limit offset p_offset
      ) t;

  elsif p_def.source_entity = 'AR_BALANCE_SUMMARY' then
    -- Net AR balance per customer as of as_on_date (sum debit - credit).
    select count(*) into v_total
      from (
        select le.customer_id
          from public.ledger_entries le
          left join public.customers c on c.id = le.customer_id and c.tenant_id = le.tenant_id
          left join public.branches b on b.id = le.branch_id and b.tenant_id = le.tenant_id
         where le.tenant_id = p_tenant and le.deleted_at is null
           and le.customer_id is not null
           and le.entry_date <= v_as_on
           and (v_cust_code is null or c.code = v_cust_code)
           and (v_branch_code is null or b.code = v_branch_code
                or exists (
                  select 1 from public.ledger_entries le2
                  left join public.branches b2 on b2.id = le2.branch_id and b2.tenant_id = le2.tenant_id
                   where le2.tenant_id = le.tenant_id and le2.customer_id = le.customer_id
                     and le2.deleted_at is null and le2.entry_date <= v_as_on
                     and b2.code = v_branch_code))
         group by le.customer_id, c.code, c.name
        having
          (v_out_status is null
            or v_out_status = 'ALL'
            or (v_out_status = 'OUTSTANDING' and sum(le.debit - le.credit) > 0)
            or (v_out_status = 'CLEARED' and sum(le.debit - le.credit) = 0)
            or (v_out_status = 'CREDIT' and sum(le.debit - le.credit) < 0))
          and (v_bal_min is null or sum(le.debit - le.credit) >= v_bal_min)
          and (v_bal_max is null or sum(le.debit - le.credit) <= v_bal_max)
          and (p_def.report_key <> 'customer-outstanding-report'
               or sum(le.debit - le.credit) > 0)
      ) x;

    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows
      from (
        select
          c.code as customer_code,
          c.name as customer_name,
          v_as_on as as_on_date,
          round(sum(le.debit), 2) as total_debit,
          round(sum(le.credit), 2) as total_credit,
          round(sum(le.debit - le.credit), 2) as balance,
          case
            when sum(le.debit - le.credit) > 0 then 'OUTSTANDING'
            when sum(le.debit - le.credit) < 0 then 'CREDIT'
            else 'CLEARED'
          end as outstanding_status
        from public.ledger_entries le
        join public.customers c on c.id = le.customer_id and c.tenant_id = le.tenant_id
        where le.tenant_id = p_tenant and le.deleted_at is null
          and le.customer_id is not null
          and le.entry_date <= v_as_on
          and (v_cust_code is null or c.code = v_cust_code)
          and (v_branch_code is null or exists (
                select 1 from public.ledger_entries le2
                left join public.branches b2 on b2.id = le2.branch_id and b2.tenant_id = le2.tenant_id
                 where le2.tenant_id = le.tenant_id and le2.customer_id = le.customer_id
                   and le2.deleted_at is null and le2.entry_date <= v_as_on
                   and b2.code = v_branch_code))
        group by c.code, c.name
        having
          (v_out_status is null
            or v_out_status = 'ALL'
            or (v_out_status = 'OUTSTANDING' and sum(le.debit - le.credit) > 0)
            or (v_out_status = 'CLEARED' and sum(le.debit - le.credit) = 0)
            or (v_out_status = 'CREDIT' and sum(le.debit - le.credit) < 0))
          and (v_bal_min is null or sum(le.debit - le.credit) >= v_bal_min)
          and (v_bal_max is null or sum(le.debit - le.credit) <= v_bal_max)
          and (p_def.report_key <> 'customer-outstanding-report'
               or sum(le.debit - le.credit) > 0)
        order by
          case when v_dir = 'asc' then c.code end asc,
          case when v_dir = 'desc' then c.code end desc
        limit p_limit offset p_offset
      ) t;

  elsif p_def.source_entity = 'AR_OUTSTANDING_DETAIL' then
    -- Ledger lines through as_on for customers with non-cleared balance (or filtered).
    select count(*) into v_total
      from public.ledger_entries le
      join public.customers c on c.id = le.customer_id and c.tenant_id = le.tenant_id
      left join public.branches b on b.id = le.branch_id and b.tenant_id = le.tenant_id
     where le.tenant_id = p_tenant and le.deleted_at is null
       and le.entry_date <= v_as_on
       and (v_cust_code is null or c.code = v_cust_code)
       and (v_branch_code is null or b.code = v_branch_code)
       and exists (
         select 1 from public.ledger_entries x
          where x.tenant_id = le.tenant_id and x.customer_id = le.customer_id
            and x.deleted_at is null and x.entry_date <= v_as_on
          group by x.customer_id
         having
           (v_out_status is null or v_out_status = 'ALL'
             or (v_out_status = 'OUTSTANDING' and sum(x.debit - x.credit) > 0)
             or (v_out_status = 'CLEARED' and sum(x.debit - x.credit) = 0)
             or (v_out_status = 'CREDIT' and sum(x.debit - x.credit) < 0))
           and (v_bal_min is null or sum(x.debit - x.credit) >= v_bal_min)
           and (v_bal_max is null or sum(x.debit - x.credit) <= v_bal_max)
           and (p_def.report_key <> 'outstanding-detail'
                or sum(x.debit - x.credit) <> 0)
       );

    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows
      from (
        select
          c.code as customer_code,
          le.entry_date,
          le.doc_type,
          b.code as branch_code,
          le.narration,
          le.debit,
          le.credit,
          le.balance_after,
          v_as_on as as_on_date
        from public.ledger_entries le
        join public.customers c on c.id = le.customer_id and c.tenant_id = le.tenant_id
        left join public.branches b on b.id = le.branch_id and b.tenant_id = le.tenant_id
        where le.tenant_id = p_tenant and le.deleted_at is null
          and le.entry_date <= v_as_on
          and (v_cust_code is null or c.code = v_cust_code)
          and (v_branch_code is null or b.code = v_branch_code)
          and exists (
            select 1 from public.ledger_entries x
             where x.tenant_id = le.tenant_id and x.customer_id = le.customer_id
               and x.deleted_at is null and x.entry_date <= v_as_on
             group by x.customer_id
            having
              (v_out_status is null or v_out_status = 'ALL'
                or (v_out_status = 'OUTSTANDING' and sum(x.debit - x.credit) > 0)
                or (v_out_status = 'CLEARED' and sum(x.debit - x.credit) = 0)
                or (v_out_status = 'CREDIT' and sum(x.debit - x.credit) < 0))
              and (v_bal_min is null or sum(x.debit - x.credit) >= v_bal_min)
              and (v_bal_max is null or sum(x.debit - x.credit) <= v_bal_max)
              and (p_def.report_key <> 'outstanding-detail'
                   or sum(x.debit - x.credit) <> 0)
          )
        order by
          case when v_dir = 'asc' then le.entry_date end asc,
          case when v_dir = 'desc' then le.entry_date end desc,
          le.created_at
        limit p_limit offset p_offset
      ) t;

  elsif p_def.source_entity = 'AR_AGEING_DETAIL' then
    -- FIFO open-item remaining on debits as of as_on_date (ledger only).
    with base as (
      select le.*, c.code as customer_code, c.name as customer_name
        from public.ledger_entries le
        join public.customers c on c.id = le.customer_id and c.tenant_id = le.tenant_id
       where le.tenant_id = p_tenant and le.deleted_at is null
         and le.customer_id is not null
         and le.entry_date <= v_as_on
         and (v_cust_code is null or c.code = v_cust_code)
    ),
    credits as (
      select customer_id, coalesce(sum(credit),0) as total_credit
        from base where credit > 0 group by customer_id
    ),
    debits as (
      select b.*,
             sum(b.debit) over (
               partition by b.customer_id
               order by b.entry_date, b.created_at
               rows between unbounded preceding and current row
             ) as cum_debit
        from base b
       where b.debit > 0
    ),
    open_items as (
      select d.customer_code,
             d.customer_name,
             d.entry_date,
             d.doc_type,
             d.narration,
             d.debit as original_debit,
             greatest(0, d.debit - greatest(0, coalesce(c.total_credit,0) - (d.cum_debit - d.debit))) as open_amount,
             app.ar_bucket(v_as_on, d.entry_date) as ageing_bucket,
             (v_as_on - d.entry_date) as days_outstanding,
             v_as_on as as_on_date
        from debits d
        left join credits c on c.customer_id = d.customer_id
    ),
    filtered as (
      select * from open_items
       where open_amount > 0
         and (v_age_bucket is null or ageing_bucket = v_age_bucket)
         and (v_bal_min is null or open_amount >= v_bal_min)
         and (v_bal_max is null or open_amount <= v_bal_max)
    )
    select
      coalesce((
        select jsonb_agg(to_jsonb(t))
          from (
            select customer_code, customer_name, entry_date, doc_type, narration,
                   original_debit, round(open_amount,2) as open_amount,
                   ageing_bucket, days_outstanding, as_on_date
              from filtered
             order by
               case when v_dir = 'asc' then entry_date end asc,
               case when v_dir = 'desc' then entry_date end desc,
               customer_code
             limit p_limit offset p_offset
          ) t
      ), '[]'::jsonb),
      (select count(*) from filtered)
    into v_rows, v_total;

  elsif p_def.source_entity = 'AR_AGEING_SUMMARY' then
    with base as (
      select le.*, c.code as customer_code, c.name as customer_name
        from public.ledger_entries le
        join public.customers c on c.id = le.customer_id and c.tenant_id = le.tenant_id
       where le.tenant_id = p_tenant and le.deleted_at is null
         and le.customer_id is not null
         and le.entry_date <= v_as_on
         and (v_cust_code is null or c.code = v_cust_code)
    ),
    credits as (
      select customer_id, coalesce(sum(credit),0) as total_credit
        from base where credit > 0 group by customer_id
    ),
    debits as (
      select b.*,
             sum(b.debit) over (
               partition by b.customer_id
               order by b.entry_date, b.created_at
               rows between unbounded preceding and current row
             ) as cum_debit
        from base b
       where b.debit > 0
    ),
    open_items as (
      select d.customer_id, d.customer_code, d.customer_name,
             greatest(0, d.debit - greatest(0, coalesce(c.total_credit,0) - (d.cum_debit - d.debit))) as open_amount,
             app.ar_bucket(v_as_on, d.entry_date) as ageing_bucket
        from debits d
        left join credits c on c.customer_id = d.customer_id
    ),
    pivoted as (
      select customer_code, customer_name,
             round(sum(open_amount) filter (where ageing_bucket = '0-30'), 2) as bucket_0_30,
             round(sum(open_amount) filter (where ageing_bucket = '31-60'), 2) as bucket_31_60,
             round(sum(open_amount) filter (where ageing_bucket = '61-90'), 2) as bucket_61_90,
             round(sum(open_amount) filter (where ageing_bucket = '90+'), 2) as bucket_90_plus,
             round(sum(open_amount), 2) as total_outstanding,
             v_as_on as as_on_date
        from open_items
       where open_amount > 0
       group by customer_code, customer_name
    ),
    filtered as (
      select * from pivoted
       where (v_age_bucket is null
              or (v_age_bucket = '0-30' and bucket_0_30 > 0)
              or (v_age_bucket = '31-60' and bucket_31_60 > 0)
              or (v_age_bucket = '61-90' and bucket_61_90 > 0)
              or (v_age_bucket = '90+' and bucket_90_plus > 0))
         and (v_bal_min is null or total_outstanding >= v_bal_min)
         and (v_bal_max is null or total_outstanding <= v_bal_max)
    )
    select
      coalesce((
        select jsonb_agg(to_jsonb(t))
          from (
            select * from filtered
             order by
               case when v_dir = 'asc' then customer_code end asc,
               case when v_dir = 'desc' then customer_code end desc
             limit p_limit offset p_offset
          ) t
      ), '[]'::jsonb),
      (select count(*) from filtered)
    into v_rows, v_total;

  else
    raise exception 'Unsupported source_entity: %', p_def.source_entity using errcode = '22023';
  end if;

  return jsonb_build_object('rows', coalesce(v_rows,'[]'::jsonb), 'total', v_total);
end
$$;


-- ===========================================================================
-- Seed AR report definitions
-- ===========================================================================
do $$
declare
  v_as_on jsonb := jsonb_build_array(
    jsonb_build_object('key','as_on_date','label','As-On Date','type','DATE','required',true)
  );
  v_date jsonb := jsonb_build_array(
    jsonb_build_object('key','from_date','label','From Date','type','DATE','required',true),
    jsonb_build_object('key','to_date','label','To Date','type','DATE','required',true)
  );
  v_common jsonb := jsonb_build_array(
    jsonb_build_object('key','customer_code','label','Customer','type','LOOKUP','lookup','customer'),
    jsonb_build_object('key','branch_code','label','Branch','type','TEXT'),
    jsonb_build_object('key','outstanding_status','label','Outstanding Status','type','ENUM',
      'options', jsonb_build_array('ALL','OUTSTANDING','CLEARED','CREDIT')),
    jsonb_build_object('key','balance_min','label','Balance Min','type','NUMBER'),
    jsonb_build_object('key','balance_max','label','Balance Max','type','NUMBER')
  );
  v_age_filters jsonb := jsonb_build_array(
    jsonb_build_object('key','ageing_bucket','label','Ageing Bucket','type','ENUM',
      'options', jsonb_build_array('0-30','31-60','61-90','90+')),
    jsonb_build_object('key','balance_min','label','Balance Min','type','NUMBER'),
    jsonb_build_object('key','balance_max','label','Balance Max','type','NUMBER')
  );
begin
  perform app.seed_report_definition(
    'customer-outstanding-report', 'AR', 'Customer Outstanding Report',
    'Customers with positive AR balance as of date.',
    'rpt.ar-report', 'AR_BALANCE_SUMMARY', 'entry_date',
    v_as_on || v_common,
    jsonb_build_array(
      jsonb_build_object('key','customer_code','label','Customer'),
      jsonb_build_object('key','customer_name','label','Name'),
      jsonb_build_object('key','as_on_date','label','As On'),
      jsonb_build_object('key','total_debit','label','Debit'),
      jsonb_build_object('key','total_credit','label','Credit'),
      jsonb_build_object('key','balance','label','Balance'),
      jsonb_build_object('key','outstanding_status','label','Status')
    ), 300);

  perform app.seed_report_definition(
    'outstanding-summary', 'AR', 'Outstanding Summary',
    'Customer AR balances as of date (all statuses unless filtered).',
    'rpt.ar-report', 'AR_BALANCE_SUMMARY', 'entry_date',
    v_as_on || v_common,
    jsonb_build_array(
      jsonb_build_object('key','customer_code','label','Customer'),
      jsonb_build_object('key','customer_name','label','Name'),
      jsonb_build_object('key','as_on_date','label','As On'),
      jsonb_build_object('key','balance','label','Balance'),
      jsonb_build_object('key','outstanding_status','label','Status')
    ), 310);

  perform app.seed_report_definition(
    'outstanding-detail', 'AR', 'Outstanding Detail',
    'Ledger lines through as-on date for customers with non-zero balance.',
    'rpt.ar-report', 'AR_OUTSTANDING_DETAIL', 'entry_date',
    v_as_on || v_common,
    jsonb_build_array(
      jsonb_build_object('key','customer_code','label','Customer'),
      jsonb_build_object('key','entry_date','label','Date'),
      jsonb_build_object('key','doc_type','label','Doc Type'),
      jsonb_build_object('key','branch_code','label','Branch'),
      jsonb_build_object('key','narration','label','Narration'),
      jsonb_build_object('key','debit','label','Debit'),
      jsonb_build_object('key','credit','label','Credit'),
      jsonb_build_object('key','balance_after','label','Balance After')
    ), 320);

  perform app.seed_report_definition(
    'customer-statement', 'AR', 'Customer Statement',
    'Ledger statement for a single customer (date range).',
    'rpt.ar-report', 'LEDGER_ENTRIES', 'entry_date',
    v_date || jsonb_build_array(
      jsonb_build_object('key','customer_code','label','Customer','type','LOOKUP','lookup','customer','required',true),
      jsonb_build_object('key','branch_code','label','Branch','type','TEXT'),
      jsonb_build_object('key','doc_type','label','Doc Type','type','ENUM',
        'options', jsonb_build_array('INVOICE','RECEIPT','EXPENSE','CUSTOMER_PAYMENT','DEBIT_NOTE','CREDIT_NOTE','ADJUSTMENT','OPENING'))
    ),
    jsonb_build_array(
      jsonb_build_object('key','entry_date','label','Date'),
      jsonb_build_object('key','customer_code','label','Customer'),
      jsonb_build_object('key','doc_type','label','Doc Type'),
      jsonb_build_object('key','narration','label','Narration'),
      jsonb_build_object('key','debit','label','Debit'),
      jsonb_build_object('key','credit','label','Credit'),
      jsonb_build_object('key','balance_after','label','Balance')
    ), 330);

  perform app.seed_report_definition(
    'ageing-summary', 'AR', 'Ageing Summary',
    'Customer open AR by ageing bucket (FIFO on ledger debits/credits).',
    'rpt.ar-report', 'AR_AGEING_SUMMARY', 'entry_date',
    v_as_on || jsonb_build_array(
      jsonb_build_object('key','customer_code','label','Customer','type','LOOKUP','lookup','customer')
    ) || v_age_filters,
    jsonb_build_array(
      jsonb_build_object('key','customer_code','label','Customer'),
      jsonb_build_object('key','customer_name','label','Name'),
      jsonb_build_object('key','as_on_date','label','As On'),
      jsonb_build_object('key','bucket_0_30','label','0-30'),
      jsonb_build_object('key','bucket_31_60','label','31-60'),
      jsonb_build_object('key','bucket_61_90','label','61-90'),
      jsonb_build_object('key','bucket_90_plus','label','90+'),
      jsonb_build_object('key','total_outstanding','label','Total')
    ), 340);

  perform app.seed_report_definition(
    'ageing-detail', 'AR', 'Ageing Detail',
    'Open debit lines with ageing bucket after ledger FIFO application.',
    'rpt.ar-report', 'AR_AGEING_DETAIL', 'entry_date',
    v_as_on || jsonb_build_array(
      jsonb_build_object('key','customer_code','label','Customer','type','LOOKUP','lookup','customer')
    ) || v_age_filters,
    jsonb_build_array(
      jsonb_build_object('key','customer_code','label','Customer'),
      jsonb_build_object('key','entry_date','label','Debit Date'),
      jsonb_build_object('key','doc_type','label','Doc Type'),
      jsonb_build_object('key','open_amount','label','Open Amount'),
      jsonb_build_object('key','ageing_bucket','label','Bucket'),
      jsonb_build_object('key','days_outstanding','label','Days'),
      jsonb_build_object('key','narration','label','Narration')
    ), 350);

  perform app.seed_report_definition(
    'as-on-date-outstanding', 'AR', 'As-On-Date Outstanding',
    'Replay customer AR balances as of a specific date.',
    'rpt.ar-report', 'AR_BALANCE_SUMMARY', 'entry_date',
    v_as_on || v_common,
    jsonb_build_array(
      jsonb_build_object('key','customer_code','label','Customer'),
      jsonb_build_object('key','customer_name','label','Name'),
      jsonb_build_object('key','as_on_date','label','As On'),
      jsonb_build_object('key','balance','label','Balance'),
      jsonb_build_object('key','outstanding_status','label','Status')
    ), 360);

  perform app.seed_report_definition(
    'customer-balance-report', 'AR', 'Customer Balance Report',
    'Customer AR balances including cleared (filterable).',
    'rpt.ar-report', 'AR_BALANCE_SUMMARY', 'entry_date',
    v_as_on || v_common,
    jsonb_build_array(
      jsonb_build_object('key','customer_code','label','Customer'),
      jsonb_build_object('key','customer_name','label','Name'),
      jsonb_build_object('key','as_on_date','label','As On'),
      jsonb_build_object('key','total_debit','label','Debit'),
      jsonb_build_object('key','total_credit','label','Credit'),
      jsonb_build_object('key','balance','label','Balance'),
      jsonb_build_object('key','outstanding_status','label','Status')
    ), 370);

  update public.report_definitions
     set default_sort = jsonb_build_object('column','customer_code','dir','asc'),
         max_date_span_days = 31,
         updated_at = now()
   where report_key in (
     'customer-outstanding-report','outstanding-summary','as-on-date-outstanding',
     'customer-balance-report','ageing-summary');

  update public.report_definitions
     set default_sort = jsonb_build_object('column','entry_date','dir','desc'),
         updated_at = now()
   where report_key in ('outstanding-detail','customer-statement','ageing-detail');
end $$;

comment on function app.execute_report_source is
  'Source-entity report executor (5A–5D). AR entities use ledger_entries with FIFO open-item ageing.';
