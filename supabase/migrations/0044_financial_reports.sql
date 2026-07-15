-- ===========================================================================
-- 0044  financial reports — Phase 5 Milestone 5C
-- ---------------------------------------------------------------------------
-- Extends 5A/5B reporting with financial report metadata + source entities.
-- Does NOT redesign public.execute_report(). No invoices/GST/IRN/jobs/exports.
-- Tables used: receipts, expense_entries, customer_payments, ledger_entries
-- ===========================================================================

alter table public.report_definitions
  drop constraint if exists report_definitions_source_entity_check;

alter table public.report_definitions
  add constraint report_definitions_source_entity_check
  check (source_entity in (
    'SHIPMENTS','MANIFESTS','PICKUPS','LEDGER_ENTRIES','LOGIN_LOGS',
    'DRS','POD_RECORDS','TRACKING_EVENTS',
    'MANIFEST_SCAN_EVENTS','SHIPMENT_SCAN_EVENTS','OPS_MIS_SUMMARY',
    'RECEIPTS','EXPENSE_ENTRIES','CUSTOMER_PAYMENTS'
  ));

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
    if p_def.report_key = 'customer-ledger' and v_cust_code is null then
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
  else
    raise exception 'Unsupported source_entity: %', p_def.source_entity using errcode = '22023';
  end if;

  return jsonb_build_object('rows', coalesce(v_rows,'[]'::jsonb), 'total', v_total);
end
$$;


-- ===========================================================================
-- Seed financial report definitions
-- ===========================================================================
do $$
declare
  v_date jsonb := jsonb_build_array(
    jsonb_build_object('key','from_date','label','From Date','type','DATE','required',true),
    jsonb_build_object('key','to_date','label','To Date','type','DATE','required',true)
  );
begin
  perform app.seed_report_definition(
    'receipt-register', 'FINANCIAL', 'Receipt Register',
    'Posted and draft customer receipts.',
    'rpt.cash-collection-report', 'RECEIPTS', 'receipt_date',
    v_date || jsonb_build_array(
      jsonb_build_object('key','customer_code','label','Customer','type','LOOKUP','lookup','customer'),
      jsonb_build_object('key','branch_code','label','Branch','type','TEXT'),
      jsonb_build_object('key','receipt_no','label','Receipt Number','type','TEXT'),
      jsonb_build_object('key','payment_mode','label','Payment Mode','type','ENUM',
        'options', jsonb_build_array('CASH','BANK')),
      jsonb_build_object('key','status','label','Status','type','ENUM',
        'options', jsonb_build_array('DRAFT','POSTED','ADJUSTED','CANCELLED')),
      jsonb_build_object('key','amount_min','label','Amount Min','type','NUMBER'),
      jsonb_build_object('key','amount_max','label','Amount Max','type','NUMBER')
    ),
    jsonb_build_array(
      jsonb_build_object('key','receipt_no','label','Receipt No.'),
      jsonb_build_object('key','receipt_date','label','Date'),
      jsonb_build_object('key','customer_code','label','Customer'),
      jsonb_build_object('key','branch_code','label','Branch'),
      jsonb_build_object('key','payment_mode','label','Mode'),
      jsonb_build_object('key','amount','label','Amount'),
      jsonb_build_object('key','status','label','Status'),
      jsonb_build_object('key','narration','label','Narration')
    ), 200);

  perform app.seed_report_definition(
    'cash-collection-report', 'FINANCIAL', 'Cash Collection Report',
    'Cash-mode receipts (payment_mode defaults to CASH).',
    'rpt.cash-collection-report', 'RECEIPTS', 'receipt_date',
    v_date || jsonb_build_array(
      jsonb_build_object('key','customer_code','label','Customer','type','LOOKUP','lookup','customer'),
      jsonb_build_object('key','branch_code','label','Branch','type','TEXT'),
      jsonb_build_object('key','receipt_no','label','Receipt Number','type','TEXT'),
      jsonb_build_object('key','payment_mode','label','Payment Mode','type','ENUM',
        'options', jsonb_build_array('CASH','BANK')),
      jsonb_build_object('key','status','label','Status','type','ENUM',
        'options', jsonb_build_array('DRAFT','POSTED','ADJUSTED','CANCELLED')),
      jsonb_build_object('key','amount_min','label','Amount Min','type','NUMBER'),
      jsonb_build_object('key','amount_max','label','Amount Max','type','NUMBER')
    ),
    jsonb_build_array(
      jsonb_build_object('key','receipt_no','label','Receipt No.'),
      jsonb_build_object('key','receipt_date','label','Date'),
      jsonb_build_object('key','customer_code','label','Customer'),
      jsonb_build_object('key','branch_code','label','Branch'),
      jsonb_build_object('key','payment_mode','label','Mode'),
      jsonb_build_object('key','amount','label','Amount'),
      jsonb_build_object('key','status','label','Status')
    ), 210);

  perform app.seed_report_definition(
    'expense-register', 'FINANCIAL', 'Expense Register',
    'Expense / income entries.',
    'rpt.statement-report', 'EXPENSE_ENTRIES', 'entry_date',
    v_date || jsonb_build_array(
      jsonb_build_object('key','branch_code','label','Branch','type','TEXT'),
      jsonb_build_object('key','ledger_account','label','Ledger Account','type','TEXT'),
      jsonb_build_object('key','payment_mode','label','Payment Mode','type','ENUM',
        'options', jsonb_build_array('CASH','BANK')),
      jsonb_build_object('key','expense_status','label','Expense Status','type','ENUM',
        'options', jsonb_build_array('UNAUTHORIZED','AUTHORIZED','REJECTED')),
      jsonb_build_object('key','amount_min','label','Amount Min','type','NUMBER'),
      jsonb_build_object('key','amount_max','label','Amount Max','type','NUMBER')
    ),
    jsonb_build_array(
      jsonb_build_object('key','entry_no','label','Entry No.'),
      jsonb_build_object('key','entry_date','label','Date'),
      jsonb_build_object('key','kind','label','Kind'),
      jsonb_build_object('key','ledger_account','label','Ledger'),
      jsonb_build_object('key','expense_head_name','label','Head'),
      jsonb_build_object('key','branch_code','label','Branch'),
      jsonb_build_object('key','payment_mode','label','Mode'),
      jsonb_build_object('key','amount','label','Amount'),
      jsonb_build_object('key','expense_status','label','Status'),
      jsonb_build_object('key','description','label','Description')
    ), 220);

  perform app.seed_report_definition(
    'expense-authorization-report', 'FINANCIAL', 'Expense Authorization Report',
    'Expenses awaiting / showing authorization status (defaults to UNAUTHORIZED).',
    'rpt.statement-report', 'EXPENSE_ENTRIES', 'entry_date',
    v_date || jsonb_build_array(
      jsonb_build_object('key','branch_code','label','Branch','type','TEXT'),
      jsonb_build_object('key','ledger_account','label','Ledger Account','type','TEXT'),
      jsonb_build_object('key','expense_status','label','Expense Status','type','ENUM',
        'options', jsonb_build_array('UNAUTHORIZED','AUTHORIZED','REJECTED')),
      jsonb_build_object('key','amount_min','label','Amount Min','type','NUMBER'),
      jsonb_build_object('key','amount_max','label','Amount Max','type','NUMBER')
    ),
    jsonb_build_array(
      jsonb_build_object('key','entry_no','label','Entry No.'),
      jsonb_build_object('key','entry_date','label','Date'),
      jsonb_build_object('key','ledger_account','label','Ledger'),
      jsonb_build_object('key','expense_head_name','label','Head'),
      jsonb_build_object('key','amount','label','Amount'),
      jsonb_build_object('key','expense_status','label','Status'),
      jsonb_build_object('key','description','label','Description')
    ), 230);

  perform app.seed_report_definition(
    'customer-payment-register', 'FINANCIAL', 'Customer Payment Register',
    'Customer payment declarations.',
    'rpt.statement-report', 'CUSTOMER_PAYMENTS', 'declared_date',
    v_date || jsonb_build_array(
      jsonb_build_object('key','customer_code','label','Customer','type','LOOKUP','lookup','customer'),
      jsonb_build_object('key','payment_status','label','Payment Status','type','ENUM',
        'options', jsonb_build_array('PENDING','APPROVED','REJECTED')),
      jsonb_build_object('key','amount_min','label','Amount Min','type','NUMBER'),
      jsonb_build_object('key','amount_max','label','Amount Max','type','NUMBER')
    ),
    jsonb_build_array(
      jsonb_build_object('key','customer_code','label','Customer'),
      jsonb_build_object('key','declared_date','label','Declared'),
      jsonb_build_object('key','paid_date','label','Paid'),
      jsonb_build_object('key','amount','label','Amount'),
      jsonb_build_object('key','payment_status','label','Status'),
      jsonb_build_object('key','remark','label','Remark')
    ), 240);

  perform app.seed_report_definition(
    'customer-payment-approval-report', 'FINANCIAL', 'Customer Payment Approval Report',
    'Customer payments pending approval (defaults to PENDING).',
    'rpt.statement-report', 'CUSTOMER_PAYMENTS', 'declared_date',
    v_date || jsonb_build_array(
      jsonb_build_object('key','customer_code','label','Customer','type','LOOKUP','lookup','customer'),
      jsonb_build_object('key','payment_status','label','Payment Status','type','ENUM',
        'options', jsonb_build_array('PENDING','APPROVED','REJECTED')),
      jsonb_build_object('key','amount_min','label','Amount Min','type','NUMBER'),
      jsonb_build_object('key','amount_max','label','Amount Max','type','NUMBER')
    ),
    jsonb_build_array(
      jsonb_build_object('key','customer_code','label','Customer'),
      jsonb_build_object('key','declared_date','label','Declared'),
      jsonb_build_object('key','amount','label','Amount'),
      jsonb_build_object('key','payment_status','label','Status'),
      jsonb_build_object('key','remark','label','Remark')
    ), 250);

  perform app.seed_report_definition(
    'ledger-register', 'FINANCIAL', 'Ledger Register',
    'AR subledger entries across customers (customer optional).',
    'rpt.statement-report', 'LEDGER_ENTRIES', 'entry_date',
    v_date || jsonb_build_array(
      jsonb_build_object('key','customer_code','label','Customer','type','LOOKUP','lookup','customer'),
      jsonb_build_object('key','branch_code','label','Branch','type','TEXT'),
      jsonb_build_object('key','doc_type','label','Doc Type','type','ENUM',
        'options', jsonb_build_array('INVOICE','RECEIPT','EXPENSE','CUSTOMER_PAYMENT','DEBIT_NOTE','CREDIT_NOTE','ADJUSTMENT','OPENING')),
      jsonb_build_object('key','amount_min','label','Amount Min','type','NUMBER'),
      jsonb_build_object('key','amount_max','label','Amount Max','type','NUMBER')
    ),
    jsonb_build_array(
      jsonb_build_object('key','entry_date','label','Date'),
      jsonb_build_object('key','customer_code','label','Customer'),
      jsonb_build_object('key','branch_code','label','Branch'),
      jsonb_build_object('key','doc_type','label','Doc Type'),
      jsonb_build_object('key','narration','label','Narration'),
      jsonb_build_object('key','debit','label','Debit'),
      jsonb_build_object('key','credit','label','Credit'),
      jsonb_build_object('key','balance_after','label','Balance')
    ), 260);

  -- Keep customer-ledger (5A) columns aligned with optional branch display
  perform app.seed_report_definition(
    'customer-ledger', 'FINANCIAL', 'Customer Ledger',
    'AR subledger for a single customer.',
    'rpt.statement-report', 'LEDGER_ENTRIES', 'entry_date',
    v_date || jsonb_build_array(
      jsonb_build_object('key','customer_code','label','Customer','type','LOOKUP','lookup','customer','required',true),
      jsonb_build_object('key','doc_type','label','Doc Type','type','ENUM','required',false,
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
    ), 270);

  update public.report_definitions
     set default_sort = jsonb_build_object('column','receipt_date','dir','desc'),
         updated_at = now()
   where report_key in ('receipt-register','cash-collection-report');

  update public.report_definitions
     set default_sort = jsonb_build_object('column','entry_date','dir','desc'),
         updated_at = now()
   where report_key in ('expense-register','expense-authorization-report','ledger-register','customer-ledger');

  update public.report_definitions
     set default_sort = jsonb_build_object('column','declared_date','dir','desc'),
         updated_at = now()
   where report_key in ('customer-payment-register','customer-payment-approval-report');
end $$;

comment on function app.execute_report_source is
  'Source-entity report executor (5A–5C). Financial entities: RECEIPTS, EXPENSE_ENTRIES, CUSTOMER_PAYMENTS, LEDGER_ENTRIES.';
