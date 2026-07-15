-- ===========================================================================
-- 0043  operational reports — Phase 5 Milestone 5B
-- ---------------------------------------------------------------------------
-- Extends 5A reporting foundation with operational report metadata +
-- source-entity executors. Does NOT redesign public.execute_report().
--
-- No finance / AR / audit packs, dashboard, jobs, PDF/Excel, or email.
-- ===========================================================================

-- Expand source_entity for operational families (keep 5A entities).
alter table public.report_definitions
  drop constraint if exists report_definitions_source_entity_check;

alter table public.report_definitions
  add constraint report_definitions_source_entity_check
  check (source_entity in (
    'SHIPMENTS','MANIFESTS','PICKUPS','LEDGER_ENTRIES','LOGIN_LOGS',
    'DRS','POD_RECORDS','TRACKING_EVENTS',
    'MANIFEST_SCAN_EVENTS','SHIPMENT_SCAN_EVENTS','OPS_MIS_SUMMARY'
  ));

-- ---------------------------------------------------------------------------
-- Shared shipment status option arrays (reuse snapshot values — no new logic)
-- ---------------------------------------------------------------------------
-- Used only in seed metadata ENUM options.

-- ===========================================================================
-- Replace source executor — same signature; add operational entities + filters
-- ===========================================================================
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
begin
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

  elsif p_def.source_entity = 'LEDGER_ENTRIES' then
    if v_cust_code is null then
      raise exception 'Customer is required for customer ledger' using errcode = 'CMS04';
    end if;
    select c.id into v_cust_id from public.customers c
     where c.tenant_id = p_tenant and c.code = v_cust_code and c.deleted_at is null;
    if v_cust_id is null then
      raise exception 'Customer not found: %', v_cust_code using errcode = 'P0002';
    end if;

    select count(*) into v_total
      from public.ledger_entries le
     where le.tenant_id = p_tenant and le.deleted_at is null
       and le.customer_id = v_cust_id
       and le.entry_date between p_from and p_to
       and (v_doc_type is null or le.doc_type = v_doc_type);

    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows
      from (
        select
          le.entry_date,
          le.doc_type,
          le.narration,
          le.debit,
          le.credit,
          le.balance_after
        from public.ledger_entries le
        where le.tenant_id = p_tenant and le.deleted_at is null
          and le.customer_id = v_cust_id
          and le.entry_date between p_from and p_to
          and (v_doc_type is null or le.doc_type = v_doc_type)
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
-- Seed / refresh operational report definitions
-- ===========================================================================
do $$
declare
  v_date jsonb := jsonb_build_array(
    jsonb_build_object('key','from_date','label','From Date','type','DATE','required',true),
    jsonb_build_object('key','to_date','label','To Date','type','DATE','required',true)
  );
  v_ship_status jsonb := jsonb_build_array(
    'DRAFT','BOOKED','PICKUP_INSCANNED','BAGGED','MANIFESTED','MANIFEST_INSCANNED',
    'IN_TRANSIT','RECEIVED_AT_HUB','ON_DRS','MISROUTED','OUT_FOR_DELIVERY',
    'DELIVERED','DELIVERED_PENDING_POD','UNDELIVERED','UNDELIVERED_RECEIVED',
    'RTO_INITIATED','RTO_DELIVERED','CANCELLED','VOID'
  );
begin
  -- Enrich / re-seed registers from 5A
  perform app.seed_report_definition(
    'pickup-register', 'OPERATIONS', 'Pickup Register',
    'Operational pickup register.',
    'rpt.operation-report', 'PICKUPS', 'pickup_date',
    v_date || jsonb_build_array(
      jsonb_build_object('key','customer_code','label','Customer','type','LOOKUP','lookup','customer'),
      jsonb_build_object('key','branch_code','label','Branch','type','TEXT'),
      jsonb_build_object('key','field_executive_code','label','Field Executive','type','LOOKUP','lookup','fieldExecutive'),
      jsonb_build_object('key','sales_executive_code','label','Sales Executive','type','LOOKUP','lookup','salesExecutive'),
      jsonb_build_object('key','pickup_no','label','Pickup No.','type','TEXT'),
      jsonb_build_object('key','awb_no','label','AWB Number','type','TEXT'),
      jsonb_build_object('key','status','label','Status','type','ENUM',
        'options', jsonb_build_array('OPEN','ASSIGNED','PICKED','CONFIRMED','CANCELLED'))
    ),
    jsonb_build_array(
      jsonb_build_object('key','pickup_no','label','Pickup No.'),
      jsonb_build_object('key','pickup_date','label','Date'),
      jsonb_build_object('key','customer_code','label','Customer'),
      jsonb_build_object('key','branch_code','label','Branch'),
      jsonb_build_object('key','mobile_no','label','Mobile'),
      jsonb_build_object('key','status','label','Status'),
      jsonb_build_object('key','awb_no','label','AWB'),
      jsonb_build_object('key','field_executive_code','label','Field Exec'),
      jsonb_build_object('key','sales_executive_code','label','Sales Exec')
    ), 10);

  perform app.seed_report_definition(
    'awb-register', 'OPERATIONS', 'AWB Register',
    'Shipment / AWB operational register.',
    'rpt.awb-report', 'SHIPMENTS', 'book_date',
    v_date || jsonb_build_array(
      jsonb_build_object('key','customer_code','label','Customer','type','LOOKUP','lookup','customer'),
      jsonb_build_object('key','branch_code','label','Branch','type','TEXT'),
      jsonb_build_object('key','destination_code','label','Destination','type','LOOKUP','lookup','destination'),
      jsonb_build_object('key','product_code','label','Product','type','LOOKUP','lookup','product'),
      jsonb_build_object('key','field_executive_code','label','Field Executive','type','LOOKUP','lookup','fieldExecutive'),
      jsonb_build_object('key','awb_no','label','AWB Number','type','TEXT'),
      jsonb_build_object('key','manifest_no','label','Manifest','type','TEXT'),
      jsonb_build_object('key','pickup_no','label','Pickup','type','TEXT'),
      jsonb_build_object('key','drs_no','label','DRS','type','TEXT'),
      jsonb_build_object('key','status','label','Shipment Status','type','ENUM','options', v_ship_status)
    ),
    jsonb_build_array(
      jsonb_build_object('key','awb_no','label','AWB No.'),
      jsonb_build_object('key','book_date','label','Book Date'),
      jsonb_build_object('key','customer_code','label','Customer'),
      jsonb_build_object('key','branch_code','label','Branch'),
      jsonb_build_object('key','destination_code','label','Destination'),
      jsonb_build_object('key','product_code','label','Product'),
      jsonb_build_object('key','status','label','Status'),
      jsonb_build_object('key','charge_weight','label','Charge Wt'),
      jsonb_build_object('key','grand_total','label','Total')
    ), 20);

  perform app.seed_report_definition(
    'manifest-register', 'OPERATIONS', 'Manifest Register',
    'Manifest operational register.',
    'rpt.manifest-report', 'MANIFESTS', 'manifest_date',
    v_date || jsonb_build_array(
      jsonb_build_object('key','branch_code','label','Branch','type','TEXT'),
      jsonb_build_object('key','service_center_code','label','Service Center','type','LOOKUP','lookup','serviceCentre'),
      jsonb_build_object('key','manifest_no','label','Manifest','type','TEXT'),
      jsonb_build_object('key','status','label','Status','type','ENUM',
        'options', jsonb_build_array('DRAFT','CLOSED','CANCELLED','OPEN','DISPATCHED','ARRIVED'))
    ),
    jsonb_build_array(
      jsonb_build_object('key','manifest_no','label','Manifest No.'),
      jsonb_build_object('key','manifest_date','label','Date'),
      jsonb_build_object('key','manifest_kind','label','Kind'),
      jsonb_build_object('key','origin_code','label','Origin'),
      jsonb_build_object('key','destination_code','label','Service Center'),
      jsonb_build_object('key','status','label','Status'),
      jsonb_build_object('key','total_awbs','label','AWBs')
    ), 30);

  perform app.seed_report_definition(
    'manifest-inscan-report', 'OPERATIONS', 'Manifest Inscan Report',
    'Manifest inscan scan events.',
    'rpt.scan-report', 'MANIFEST_SCAN_EVENTS', 'created_at',
    v_date || jsonb_build_array(
      jsonb_build_object('key','manifest_no','label','Manifest','type','TEXT'),
      jsonb_build_object('key','awb_no','label','AWB Number','type','TEXT')
    ),
    jsonb_build_array(
      jsonb_build_object('key','manifest_no','label','Manifest No.'),
      jsonb_build_object('key','awb_no','label','AWB'),
      jsonb_build_object('key','event_type','label','Event'),
      jsonb_build_object('key','scan_mode','label','Mode'),
      jsonb_build_object('key','event_text','label','Text'),
      jsonb_build_object('key','bag_no','label','Bag'),
      jsonb_build_object('key','created_at','label','Scanned At')
    ), 40);

  perform app.seed_report_definition(
    'drs-register', 'OPERATIONS', 'DRS Register',
    'Delivery Run Sheet register.',
    'rpt.drs-report', 'DRS', 'drs_date',
    v_date || jsonb_build_array(
      jsonb_build_object('key','branch_code','label','Branch','type','TEXT'),
      jsonb_build_object('key','destination_code','label','Destination','type','LOOKUP','lookup','destination'),
      jsonb_build_object('key','field_executive_code','label','Field Executive','type','LOOKUP','lookup','fieldExecutive'),
      jsonb_build_object('key','drs_no','label','DRS','type','TEXT'),
      jsonb_build_object('key','status','label','Status','type','ENUM',
        'options', jsonb_build_array('DRAFT','DISPATCHED','COMPLETED','CANCELLED','OPEN','CLOSED'))
    ),
    jsonb_build_array(
      jsonb_build_object('key','drs_no','label','DRS No.'),
      jsonb_build_object('key','drs_date','label','Date'),
      jsonb_build_object('key','branch_code','label','Branch'),
      jsonb_build_object('key','destination_code','label','Destination'),
      jsonb_build_object('key','field_executive_code','label','Field Exec'),
      jsonb_build_object('key','status','label','Status'),
      jsonb_build_object('key','total_awbs','label','AWBs')
    ), 50);

  perform app.seed_report_definition(
    'pod-report', 'OPERATIONS', 'POD Report',
    'Proof of Delivery records.',
    'rpt.manifest-pod-report', 'POD_RECORDS', 'pod_date',
    v_date || jsonb_build_array(
      jsonb_build_object('key','customer_code','label','Customer','type','LOOKUP','lookup','customer'),
      jsonb_build_object('key','destination_code','label','Destination','type','LOOKUP','lookup','destination'),
      jsonb_build_object('key','awb_no','label','AWB Number','type','TEXT'),
      jsonb_build_object('key','status','label','POD Status','type','ENUM',
        'options', jsonb_build_array('DELIVERED','IN_TRANSIT','PENDING'))
    ),
    jsonb_build_array(
      jsonb_build_object('key','awb_no','label','AWB'),
      jsonb_build_object('key','pod_date','label','POD Date'),
      jsonb_build_object('key','receiver_name','label','Receiver'),
      jsonb_build_object('key','pod_status','label','POD Status'),
      jsonb_build_object('key','shipment_status','label','Shipment Status'),
      jsonb_build_object('key','customer_code','label','Customer'),
      jsonb_build_object('key','destination_code','label','Destination'),
      jsonb_build_object('key','source','label','Source'),
      jsonb_build_object('key','remark','label','Remark')
    ), 60);

  perform app.seed_report_definition(
    'tracking-history', 'OPERATIONS', 'Tracking History',
    'Shipment tracking event history.',
    'rpt.delivery-status-report', 'TRACKING_EVENTS', 'event_date',
    v_date || jsonb_build_array(
      jsonb_build_object('key','awb_no','label','AWB Number','type','TEXT'),
      jsonb_build_object('key','status','label','Shipment Status','type','ENUM','options', v_ship_status)
    ),
    jsonb_build_array(
      jsonb_build_object('key','awb_no','label','AWB'),
      jsonb_build_object('key','event_date','label','Date'),
      jsonb_build_object('key','event_time','label','Time'),
      jsonb_build_object('key','status_text','label','Event'),
      jsonb_build_object('key','remark','label','Remark'),
      jsonb_build_object('key','source','label','Source'),
      jsonb_build_object('key','shipment_status','label','Current Status'),
      jsonb_build_object('key','created_at','label','Recorded At')
    ), 70);

  perform app.seed_report_definition(
    'shipment-status-report', 'OPERATIONS', 'Shipment Status Report',
    'Shipments by current status snapshot.',
    'rpt.delivery-status-report', 'SHIPMENTS', 'book_date',
    v_date || jsonb_build_array(
      jsonb_build_object('key','customer_code','label','Customer','type','LOOKUP','lookup','customer'),
      jsonb_build_object('key','branch_code','label','Branch','type','TEXT'),
      jsonb_build_object('key','destination_code','label','Destination','type','LOOKUP','lookup','destination'),
      jsonb_build_object('key','awb_no','label','AWB Number','type','TEXT'),
      jsonb_build_object('key','status','label','Shipment Status','type','ENUM','options', v_ship_status)
    ),
    jsonb_build_array(
      jsonb_build_object('key','awb_no','label','AWB No.'),
      jsonb_build_object('key','book_date','label','Book Date'),
      jsonb_build_object('key','customer_code','label','Customer'),
      jsonb_build_object('key','destination_code','label','Destination'),
      jsonb_build_object('key','status','label','Status'),
      jsonb_build_object('key','charge_weight','label','Charge Wt')
    ), 80);

  perform app.seed_report_definition(
    'undelivered-report', 'OPERATIONS', 'Undelivered Report',
    'Shipments currently UNDELIVERED / UNDELIVERED_RECEIVED (status snapshot).',
    'rpt.undelivery-report', 'SHIPMENTS', 'book_date',
    v_date || jsonb_build_array(
      jsonb_build_object('key','customer_code','label','Customer','type','LOOKUP','lookup','customer'),
      jsonb_build_object('key','branch_code','label','Branch','type','TEXT'),
      jsonb_build_object('key','destination_code','label','Destination','type','LOOKUP','lookup','destination'),
      jsonb_build_object('key','awb_no','label','AWB Number','type','TEXT'),
      jsonb_build_object('key','status','label','Shipment Status','type','ENUM',
        'options', jsonb_build_array('UNDELIVERED','UNDELIVERED_RECEIVED'))
    ),
    jsonb_build_array(
      jsonb_build_object('key','awb_no','label','AWB No.'),
      jsonb_build_object('key','book_date','label','Book Date'),
      jsonb_build_object('key','customer_code','label','Customer'),
      jsonb_build_object('key','destination_code','label','Destination'),
      jsonb_build_object('key','status','label','Status'),
      jsonb_build_object('key','charge_weight','label','Charge Wt')
    ), 90);

  perform app.seed_report_definition(
    'delivery-report', 'OPERATIONS', 'Delivery Report',
    'Delivered / pending-POD shipments (status snapshot).',
    'rpt.ok-delivery', 'SHIPMENTS', 'book_date',
    v_date || jsonb_build_array(
      jsonb_build_object('key','customer_code','label','Customer','type','LOOKUP','lookup','customer'),
      jsonb_build_object('key','branch_code','label','Branch','type','TEXT'),
      jsonb_build_object('key','destination_code','label','Destination','type','LOOKUP','lookup','destination'),
      jsonb_build_object('key','awb_no','label','AWB Number','type','TEXT'),
      jsonb_build_object('key','status','label','Shipment Status','type','ENUM',
        'options', jsonb_build_array('DELIVERED','DELIVERED_PENDING_POD'))
    ),
    jsonb_build_array(
      jsonb_build_object('key','awb_no','label','AWB No.'),
      jsonb_build_object('key','book_date','label','Book Date'),
      jsonb_build_object('key','customer_code','label','Customer'),
      jsonb_build_object('key','destination_code','label','Destination'),
      jsonb_build_object('key','status','label','Status'),
      jsonb_build_object('key','grand_total','label','Total')
    ), 100);

  perform app.seed_report_definition(
    'scan-reconciliation-report', 'OPERATIONS', 'Scan Reconciliation Report',
    'Shipment scan events with current status snapshot.',
    'rpt.scan-report', 'SHIPMENT_SCAN_EVENTS', 'created_at',
    v_date || jsonb_build_array(
      jsonb_build_object('key','awb_no','label','AWB Number','type','TEXT'),
      jsonb_build_object('key','manifest_no','label','Manifest','type','TEXT'),
      jsonb_build_object('key','status','label','Shipment Status','type','ENUM','options', v_ship_status)
    ),
    jsonb_build_array(
      jsonb_build_object('key','awb_no','label','AWB'),
      jsonb_build_object('key','event_type','label','Scan Event'),
      jsonb_build_object('key','event_text','label','Text'),
      jsonb_build_object('key','manifest_no','label','Manifest'),
      jsonb_build_object('key','shipment_status','label','Current Status'),
      jsonb_build_object('key','created_at','label','Scanned At')
    ), 110);

  perform app.seed_report_definition(
    'mis-operational-summary', 'OPERATIONS', 'MIS Operational Summary',
    'Branch × status shipment counts (live aggregate; rollups deferred).',
    'rpt.mis-report', 'OPS_MIS_SUMMARY', 'book_date',
    v_date || jsonb_build_array(
      jsonb_build_object('key','branch_code','label','Branch','type','TEXT')
    ),
    jsonb_build_array(
      jsonb_build_object('key','branch_code','label','Branch'),
      jsonb_build_object('key','status','label','Status'),
      jsonb_build_object('key','shipment_count','label','Count'),
      jsonb_build_object('key','total_charge_weight','label','Charge Wt'),
      jsonb_build_object('key','total_amount','label','Amount')
    ), 120);

  -- Default sort metadata
  update public.report_definitions
     set default_sort = jsonb_build_object('column','book_date','dir','desc'),
         updated_at = now()
   where report_key in ('awb-register','shipment-status-report','undelivered-report','delivery-report');

  update public.report_definitions
     set default_sort = jsonb_build_object('column','pickup_date','dir','desc'),
         updated_at = now()
   where report_key = 'pickup-register';

  update public.report_definitions
     set default_sort = jsonb_build_object('column','manifest_date','dir','desc'),
         updated_at = now()
   where report_key = 'manifest-register';

  update public.report_definitions
     set default_sort = jsonb_build_object('column','drs_date','dir','desc'),
         updated_at = now()
   where report_key = 'drs-register';

  update public.report_definitions
     set default_sort = jsonb_build_object('column','pod_date','dir','desc'),
         updated_at = now()
   where report_key = 'pod-report';

  update public.report_definitions
     set default_sort = jsonb_build_object('column','created_at','dir','desc'),
         updated_at = now()
   where report_key in (
     'manifest-inscan-report','tracking-history',
     'scan-reconciliation-report');

  update public.report_definitions
     set default_sort = jsonb_build_object('column','branch_code','dir','asc'),
         updated_at = now()
   where report_key = 'mis-operational-summary';
end $$;

comment on function app.execute_report_source is
  'Source-entity report executor (5A + 5B operational entities). No per-report SQL in tables.';
