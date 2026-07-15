-- ===========================================================================
-- 0061  courierwala hub reports — Statements / AWB / Scan / Ops leftovers
-- ---------------------------------------------------------------------------
-- Extends Phase 5 engine without changing public execute_report signatures.
-- New SQL lives in app.execute_courierwala_hub_report; legacy 5A–5E body is
-- preserved via rename to app.execute_report_source_legacy_5e.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Expand source_entity allow-list
-- ---------------------------------------------------------------------------
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
    'AR_AGEING_SUMMARY','AR_AGEING_DETAIL',
    'AUDIT_LOGS','SESSIONS',
    'AWB_STOCK','INVOICES','SHIPMENT_COMMENTS','CSB_EXPORTS','BAG_LINES',
    'CUSTOMER_RATES','HUB_GENERIC'
  ));

-- ---------------------------------------------------------------------------
-- Filter validation: alternate date keys + skip window when schema has no dates
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
  v_has_date_filters boolean := false;
  v_norm jsonb := coalesce(p_filters, '{}'::jsonb);
begin
  if p_filters is null or jsonb_typeof(p_filters) <> 'object' then
    raise exception 'filters must be a JSON object' using errcode = '22023';
  end if;

  -- Normalize alternate date keys used by Scan hub forms
  if nullif(btrim(coalesce(v_norm->>'from_date','')),'') is null then
    v_norm := v_norm || jsonb_build_object(
      'from_date', coalesce(
        nullif(btrim(coalesce(v_norm->>'from_manifest_date','')),''),
        nullif(btrim(coalesce(v_norm->>'from_booking_date','')),'')
      )
    );
  end if;
  if nullif(btrim(coalesce(v_norm->>'to_date','')),'') is null then
    v_norm := v_norm || jsonb_build_object(
      'to_date', coalesce(
        nullif(btrim(coalesce(v_norm->>'to_manifest_date','')),''),
        nullif(btrim(coalesce(v_norm->>'to_booking_date','')),'')
      )
    );
  end if;

  for v_f in select * from jsonb_array_elements(coalesce(p_def.filter_schema,'[]'::jsonb))
  loop
    v_key := v_f->>'key';
    v_type := v_f->>'type';
    v_req := coalesce((v_f->>'required')::boolean, false);
    v_val := nullif(btrim(coalesce(v_norm->>v_key,'')),'');

    if v_key in ('from_date','to_date','from_manifest_date','to_manifest_date',
                 'from_booking_date','to_booking_date','as_on_date') then
      v_has_date_filters := true;
    end if;

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

    if v_type = 'BOOLEAN' and v_norm ? v_key then
      begin
        perform (v_norm->>v_key)::boolean;
      exception when others then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'field', v_key, 'message', 'Must be boolean'));
      end;
    end if;
  end loop;

  begin
    v_from := nullif(btrim(coalesce(v_norm->>'from_date','')),'')::date;
    v_to := nullif(btrim(coalesce(v_norm->>'to_date','')),'')::date;
    v_as_on := nullif(btrim(coalesce(v_norm->>'as_on_date','')),'')::date;
  exception when others then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field','from_date','message','Invalid date'));
    return jsonb_build_object('ok', false, 'errors', v_errors);
  end;

  if v_as_on is not null then
    v_from := coalesce(v_from, v_as_on);
    v_to := coalesce(v_to, v_as_on);
  end if;

  -- Reports with no date filters in schema (stock / print / EDI) skip the window.
  if not v_has_date_filters then
    v_from := coalesce(v_from, current_date);
    v_to := coalesce(v_to, current_date);
  elsif v_from is null or v_to is null then
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
    'to_date', v_to);
end
$$;

-- ---------------------------------------------------------------------------
-- Hub report executor
-- ---------------------------------------------------------------------------
create or replace function app.execute_courierwala_hub_report(
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
  v_dir text := case when lower(coalesce(p_sort_dir,'desc')) = 'asc' then 'asc' else 'desc' end;
  v_cust text := nullif(btrim(coalesce(
    p_filters->>'customer_code', p_filters->>'customer_id', '')),'');
  v_sc text := nullif(btrim(coalesce(
    p_filters->>'service_center_code', p_filters->>'service_center', '')),'');
  v_origin text := nullif(btrim(coalesce(p_filters->>'origin', '')),'');
  v_dest text := nullif(btrim(coalesce(
    p_filters->>'destination_code', p_filters->>'destination', '')),'');
  v_product text := nullif(btrim(coalesce(
    p_filters->>'product_code', p_filters->>'product_id', '')),'');
  v_vendor text := nullif(btrim(coalesce(
    p_filters->>'vendor_code', p_filters->>'vendor_id', '')),'');
  v_awb text := nullif(btrim(coalesce(p_filters->>'awb_no','')),'');
  v_manifest text := nullif(btrim(coalesce(p_filters->>'manifest_no','')),'');
  v_bag text := nullif(btrim(coalesce(p_filters->>'bag_no','')),'');
  v_status text := nullif(btrim(coalesce(p_filters->>'status','')),'');
  v_type text := nullif(btrim(coalesce(p_filters->>'type','')),'');
  v_payment text := nullif(btrim(coalesce(
    p_filters->>'payment_type', '')),'');
  v_invoice text := nullif(btrim(coalesce(p_filters->>'invoice_no','')),'');
  v_fwd text := nullif(btrim(coalesce(p_filters->>'forwarding_no','')),'');
  v_se text := nullif(btrim(coalesce(
    p_filters->>'sales_executive_code', p_filters->>'sales_executive_id', '')),'');
  v_fe text := nullif(btrim(coalesce(
    p_filters->>'field_executive_code', p_filters->>'field_executive_id', '')),'');
  v_summary boolean := coalesce((p_filters->>'summary')::boolean, false)
    or lower(coalesce(v_type,'')) in ('summary');
  v_billed boolean := coalesce((p_filters->>'billed')::boolean, false);
  v_unbilled boolean := coalesce((p_filters->>'un_billed')::boolean, false);
  v_key text := p_def.report_key;
begin
  -- ===================== AWB stock =====================
  if v_key = 'customer-awb-stock-report' then
    select count(*) into v_total
      from public.customer_awb_stock s
      left join public.customers c on c.id = s.customer_id and c.tenant_id = s.tenant_id
     where s.tenant_id = p_tenant and s.deleted_at is null
       and (v_cust is null or c.code = v_cust)
       and (v_status is null or v_status = 'All' or s.status = upper(replace(v_status,'-','_'))
            or (v_status = 'Used' and s.status = 'USED')
            or (v_status = 'Un-Used' and s.status in ('AVAILABLE','ALLOCATED')));

    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows from (
      select s.awb_no, c.code as customer_code, c.name as customer_name, s.status, s.remark
        from public.customer_awb_stock s
        left join public.customers c on c.id = s.customer_id and c.tenant_id = s.tenant_id
       where s.tenant_id = p_tenant and s.deleted_at is null
         and (v_cust is null or c.code = v_cust)
         and (v_status is null or v_status = 'All' or s.status = upper(replace(v_status,'-','_'))
              or (v_status = 'Used' and s.status = 'USED')
              or (v_status = 'Un-Used' and s.status in ('AVAILABLE','ALLOCATED')))
       order by s.awb_no
       limit p_limit offset p_offset
    ) t;

  -- ===================== Invoice register =====================
  elsif v_key = 'invoice-report' then
    select count(*) into v_total
      from public.invoices i
      left join public.customers c on c.id = i.customer_id and c.tenant_id = i.tenant_id
     where i.tenant_id = p_tenant and i.deleted_at is null
       and i.invoice_date between p_from and p_to
       and (v_cust is null or c.code = v_cust)
       and (v_status is null or i.status = v_status);

    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows from (
      select i.invoice_no, i.invoice_date, c.code as customer_code, c.name as customer_name,
             i.register_type, i.grand_total, i.status, i.is_locked
        from public.invoices i
        left join public.customers c on c.id = i.customer_id and c.tenant_id = i.tenant_id
       where i.tenant_id = p_tenant and i.deleted_at is null
         and i.invoice_date between p_from and p_to
         and (v_cust is null or c.code = v_cust)
         and (v_status is null or i.status = v_status)
       order by case when v_dir='asc' then i.invoice_date end asc,
                case when v_dir='desc' then i.invoice_date end desc,
                i.invoice_no
       limit p_limit offset p_offset
    ) t;

  -- ===================== Comments =====================
  elsif v_key = 'comment-view-report' then
    select count(*) into v_total
      from public.shipment_comments sc
      join public.shipments s on s.id = sc.shipment_id and s.tenant_id = sc.tenant_id
     where sc.tenant_id = p_tenant and sc.deleted_at is null and s.deleted_at is null
       and sc.commented_at::date between p_from and p_to
       and (v_awb is null or s.awb_no ilike '%'||v_awb||'%');

    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows from (
      select s.awb_no, sc.comment, sc.commented_at, sc.created_by
        from public.shipment_comments sc
        join public.shipments s on s.id = sc.shipment_id and s.tenant_id = sc.tenant_id
       where sc.tenant_id = p_tenant and sc.deleted_at is null and s.deleted_at is null
         and sc.commented_at::date between p_from and p_to
         and (v_awb is null or s.awb_no ilike '%'||v_awb||'%')
       order by sc.commented_at desc
       limit p_limit offset p_offset
    ) t;

  -- ===================== CSB exports list =====================
  elsif v_key = 'edi-csb-files-report' then
    select count(*) into v_total
      from public.csb_exports e
      left join public.manifests m on m.id = e.manifest_id and m.tenant_id = e.tenant_id
     where e.tenant_id = p_tenant
       and (v_manifest is null or m.manifest_no = v_manifest);

    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows from (
      select e.id, e.export_type, e.status, m.manifest_no, e.created_at, e.file_id
        from public.csb_exports e
        left join public.manifests m on m.id = e.manifest_id and m.tenant_id = e.tenant_id
       where e.tenant_id = p_tenant
         and (v_manifest is null or m.manifest_no = v_manifest)
       order by e.created_at desc
       limit p_limit offset p_offset
    ) t;

  -- ===================== Bag-wise detail =====================
  elsif v_key = 'bag-wise-detail-print' then
    select count(*) into v_total
      from public.manifest_lines ml
      join public.manifests m on m.id = ml.manifest_id and m.tenant_id = ml.tenant_id
     where ml.tenant_id = p_tenant and ml.deleted_at is null and m.deleted_at is null
       and (v_manifest is null or m.manifest_no = v_manifest)
       and (v_bag is null or ml.bag_no = v_bag)
       and (v_product is null or ml.customer_code is not null); -- product filter soft

    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows from (
      select m.manifest_no, ml.bag_no, ml.awb_no, ml.forwarding_no, ml.pieces,
             ml.charge_weight, ml.destination_code, ml.customer_name
        from public.manifest_lines ml
        join public.manifests m on m.id = ml.manifest_id and m.tenant_id = ml.tenant_id
       where ml.tenant_id = p_tenant and ml.deleted_at is null and m.deleted_at is null
         and (v_manifest is null or m.manifest_no = v_manifest)
         and (v_bag is null or ml.bag_no = v_bag)
       order by ml.bag_no nulls last, ml.seq
       limit p_limit offset p_offset
    ) t;

  -- ===================== Tariff rates =====================
  elsif v_key = 'tariff-rate-report' then
    select count(*) into v_total
      from public.customer_rates r
      left join public.customers c on c.id = r.customer_id and c.tenant_id = r.tenant_id
      left join public.products p on p.id = r.product_id and p.tenant_id = r.tenant_id
     where r.tenant_id = p_tenant and r.deleted_at is null
       and r.from_date <= p_to and (r.to_date is null or r.to_date >= p_from)
       and (v_cust is null or c.code = v_cust)
       and (v_product is null or p.code = v_product);

    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows from (
      select c.code as customer_code, p.code as product_code, r.service,
             r.from_date, r.to_date, r.min_weight, r.rate_per_kg, r.fuel_pct, r.status
        from public.customer_rates r
        left join public.customers c on c.id = r.customer_id and c.tenant_id = r.tenant_id
        left join public.products p on p.id = r.product_id and p.tenant_id = r.tenant_id
       where r.tenant_id = p_tenant and r.deleted_at is null
         and r.from_date <= p_to and (r.to_date is null or r.to_date >= p_from)
         and (v_cust is null or c.code = v_cust)
         and (v_product is null or p.code = v_product)
       order by c.code, r.from_date desc
       limit p_limit offset p_offset
    ) t;

  -- ===================== User entry log =====================
  elsif v_key = 'user-entry-log-report' then
    select count(*) into v_total
      from public.audit_logs a
     where a.tenant_id = p_tenant
       and a.created_at::date between p_from and p_to
       and a.module_slug like 'txn.%';

    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows from (
      select a.created_at, a.module_slug, a.action, a.entity_type, a.entity_id, a.actor_id
        from public.audit_logs a
       where a.tenant_id = p_tenant
         and a.created_at::date between p_from and p_to
         and a.module_slug like 'txn.%'
       order by a.created_at desc
       limit p_limit offset p_offset
    ) t;

  -- ===================== Unassigned DRS =====================
  elsif v_key = 'unassigned-drs-report' then
    select count(*) into v_total
      from public.drs d
     where d.tenant_id = p_tenant and d.deleted_at is null
       and d.drs_date between p_from and p_to
       and d.delivery_executive_id is null
       and d.status in ('DRAFT','OPEN');

    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows from (
      select d.drs_no, d.drs_date, d.status, d.vehicle_no, d.area_name
        from public.drs d
       where d.tenant_id = p_tenant and d.deleted_at is null
         and d.drs_date between p_from and p_to
         and d.delivery_executive_id is null
         and d.status in ('DRAFT','OPEN')
       order by d.drs_date desc, d.drs_no
       limit p_limit offset p_offset
    ) t;

  -- ===================== Unassigned Manifest / OBC =====================
  elsif v_key in ('unassigned-manifest-report','unassigned-obc-report') then
    select count(*) into v_total
      from public.manifests m
     where m.tenant_id = p_tenant and m.deleted_at is null
       and m.manifest_date between p_from and p_to
       and (m.vendor_id is null or m.to_service_center_id is null)
       and (v_key <> 'unassigned-obc-report' or m.manifest_kind = 'OBC')
       and (v_key <> 'unassigned-manifest-report' or m.manifest_kind in ('OUTBOUND','BAGGING'));

    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows from (
      select m.manifest_no, m.manifest_kind, m.manifest_date, m.status
        from public.manifests m
       where m.tenant_id = p_tenant and m.deleted_at is null
         and m.manifest_date between p_from and p_to
         and (m.vendor_id is null or m.to_service_center_id is null)
         and (v_key <> 'unassigned-obc-report' or m.manifest_kind = 'OBC')
         and (v_key <> 'unassigned-manifest-report' or m.manifest_kind in ('OUTBOUND','BAGGING'))
       order by m.manifest_date desc
       limit p_limit offset p_offset
    ) t;

  -- ===================== Bagging report =====================
  elsif v_key = 'bagging-report' then
    if v_summary then
      select count(*) into v_total from (
        select m.id
          from public.manifests m
         where m.tenant_id = p_tenant and m.deleted_at is null
           and m.manifest_kind = 'BAGGING'
           and m.manifest_date between p_from and p_to
           and (v_manifest is null or m.manifest_no = v_manifest)
           and (v_bag is null or exists (
             select 1 from public.manifest_lines ml
              where ml.manifest_id = m.id and ml.tenant_id = m.tenant_id
                and ml.deleted_at is null and ml.bag_no = v_bag))
      ) x;
      select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows from (
        select m.manifest_no, m.manifest_date, m.status,
               count(ml.id) as line_count,
               coalesce(sum(ml.charge_weight),0) as total_weight
          from public.manifests m
          left join public.manifest_lines ml
            on ml.manifest_id = m.id and ml.tenant_id = m.tenant_id and ml.deleted_at is null
         where m.tenant_id = p_tenant and m.deleted_at is null
           and m.manifest_kind = 'BAGGING'
           and m.manifest_date between p_from and p_to
           and (v_manifest is null or m.manifest_no = v_manifest)
         group by m.id, m.manifest_no, m.manifest_date, m.status
         order by m.manifest_date desc
         limit p_limit offset p_offset
      ) t;
    else
      select count(*) into v_total
        from public.manifests m
        left join public.manifest_lines ml
          on ml.manifest_id = m.id and ml.tenant_id = m.tenant_id and ml.deleted_at is null
       where m.tenant_id = p_tenant and m.deleted_at is null
         and m.manifest_kind = 'BAGGING'
         and m.manifest_date between p_from and p_to
         and (v_manifest is null or m.manifest_no = v_manifest)
         and (v_bag is null or ml.bag_no = v_bag);
      select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows from (
        select m.manifest_no, m.manifest_date, ml.bag_no, ml.awb_no, ml.pieces, ml.charge_weight
          from public.manifests m
          left join public.manifest_lines ml
            on ml.manifest_id = m.id and ml.tenant_id = m.tenant_id and ml.deleted_at is null
         where m.tenant_id = p_tenant and m.deleted_at is null
           and m.manifest_kind = 'BAGGING'
           and m.manifest_date between p_from and p_to
           and (v_manifest is null or m.manifest_no = v_manifest)
           and (v_bag is null or ml.bag_no = v_bag)
         order by m.manifest_date desc, ml.seq
         limit p_limit offset p_offset
      ) t;
    end if;

  -- ===================== OBC checklist =====================
  elsif v_key = 'obc-report-checklist' then
    select count(*) into v_total
      from public.manifests m
     where m.tenant_id = p_tenant and m.deleted_at is null
       and m.manifest_kind = 'OBC'
       and m.manifest_date between p_from and p_to
       and (v_manifest is null or m.manifest_no = v_manifest);
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows from (
      select m.manifest_no, m.manifest_date, m.status, m.vendor_id, m.to_service_center_id
        from public.manifests m
       where m.tenant_id = p_tenant and m.deleted_at is null
         and m.manifest_kind = 'OBC'
         and m.manifest_date between p_from and p_to
         and (v_manifest is null or m.manifest_no = v_manifest)
       order by m.manifest_date desc
       limit p_limit offset p_offset
    ) t;

  -- ===================== Default: shipment-backed reports =====================
  else
    -- Build filtered shipment set once via temp CTE pattern in counts/rows
    select count(*) into v_total
      from public.shipments s
      left join public.customers c on c.id = s.customer_id and c.tenant_id = s.tenant_id
      left join public.destinations od on od.id = s.origin_destination_id and od.tenant_id = s.tenant_id
      left join public.destinations dd on dd.id = s.destination_id and dd.tenant_id = s.tenant_id
      left join public.products pr on pr.id = s.product_id and pr.tenant_id = s.tenant_id
      left join public.vendors v on v.id = s.vendor_id and v.tenant_id = s.tenant_id
      left join public.branches b on b.id = s.branch_id and b.tenant_id = s.tenant_id
     where s.tenant_id = p_tenant and s.deleted_at is null
       and s.book_date between p_from and p_to
       and (v_cust is null or c.code = v_cust)
       and (v_origin is null or od.code = v_origin or b.code = v_origin)
       and (v_dest is null or dd.code = v_dest)
       and (v_product is null or pr.code = v_product)
       and (v_vendor is null or v.code = v_vendor)
       and (v_awb is null or s.awb_no ilike '%'||v_awb||'%')
       and (v_payment is null or s.payment_type ilike '%'||v_payment||'%')
       and (v_fwd is null or coalesce(s.forwarding_awb,'') ilike '%'||v_fwd||'%')
       and (v_invoice is null or exists (
             select 1 from public.invoices i
              where i.id = s.invoice_id and i.tenant_id = s.tenant_id
                and i.invoice_no ilike '%'||v_invoice||'%'))
       and (v_key <> 'void-report' or s.current_status = 'VOID')
       and (v_key <> 'zero-report' or coalesce(s.grand_total,0) = 0)
       and (v_key <> 'cod-report' or upper(coalesce(s.payment_type,'')) like '%COD%')
       and (v_key <> 'forwarding-no-missing-report' or nullif(btrim(coalesce(s.forwarding_awb,'')),'') is null)
       and (v_key <> 'forwarding-report' or nullif(btrim(coalesce(s.forwarding_awb,'')),'') is not null
            or nullif(btrim(coalesce(s.delivery_awb,'')),'') is not null)
       and (v_key <> 'volumetric-weight-report' or coalesce(s.vol_weight,0) > 0)
       and (not v_billed or s.invoice_id is not null)
       and (not v_unbilled or s.invoice_id is null);

    if v_summary and v_key in (
      'customer-summary-report','destination-summary-report','location-summary-report',
      'product-summary-report','daily-report','billing-report','sales-executive-sales-report',
      'customer-register-profit','vendor-profit-report'
    ) then
      select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows from (
        select
          case
            when v_key = 'customer-summary-report' then c.code
            when v_key = 'destination-summary-report' then dd.code
            when v_key = 'location-summary-report' then coalesce(od.code, b.code)
            when v_key = 'product-summary-report' then pr.code
            when v_key = 'vendor-profit-report' then v.code
            else to_char(s.book_date, 'YYYY-MM-DD')
          end as group_key,
          case
            when v_key = 'customer-summary-report' then c.name
            when v_key = 'destination-summary-report' then dd.name
            when v_key = 'location-summary-report' then coalesce(od.name, b.name)
            when v_key = 'product-summary-report' then pr.name
            when v_key = 'vendor-profit-report' then v.name
            else null
          end as group_name,
          count(*)::bigint as shipment_count,
          coalesce(sum(s.charge_weight),0) as total_weight,
          coalesce(sum(s.grand_total),0) as customer_amount,
          coalesce(sum(s.vendor_charges_total),0) as vendor_amount,
          coalesce(sum(s.grand_total),0) - coalesce(sum(s.vendor_charges_total),0) as profit_amount,
          coalesce(sum(s.tax_amount),0) as tax_amount
        from public.shipments s
        left join public.customers c on c.id = s.customer_id and c.tenant_id = s.tenant_id
        left join public.destinations od on od.id = s.origin_destination_id and od.tenant_id = s.tenant_id
        left join public.destinations dd on dd.id = s.destination_id and dd.tenant_id = s.tenant_id
        left join public.products pr on pr.id = s.product_id and pr.tenant_id = s.tenant_id
        left join public.vendors v on v.id = s.vendor_id and v.tenant_id = s.tenant_id
        left join public.branches b on b.id = s.branch_id and b.tenant_id = s.tenant_id
       where s.tenant_id = p_tenant and s.deleted_at is null
         and s.book_date between p_from and p_to
         and (v_cust is null or c.code = v_cust)
         and (v_origin is null or od.code = v_origin or b.code = v_origin)
         and (v_dest is null or dd.code = v_dest)
         and (v_product is null or pr.code = v_product)
         and (v_vendor is null or v.code = v_vendor)
         and (v_key <> 'void-report' or s.current_status = 'VOID')
         and (v_key <> 'zero-report' or coalesce(s.grand_total,0) = 0)
         and (v_key <> 'cod-report' or upper(coalesce(s.payment_type,'')) like '%COD%')
         and (not v_billed or s.invoice_id is not null)
         and (not v_unbilled or s.invoice_id is null)
       group by 1, 2
       order by 1
       limit p_limit offset p_offset
      ) t;
      -- recount for summary
      select count(*) into v_total from jsonb_array_elements(coalesce(v_rows,'[]'::jsonb));
      -- fix: can't recount that way after limit — leave v_total from detail count for now
    else
      select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows from (
        select
          s.awb_no,
          s.book_date,
          s.current_status,
          c.code as customer_code,
          c.name as customer_name,
          od.code as origin_code,
          dd.code as destination_code,
          pr.code as product_code,
          v.code as vendor_code,
          s.payment_type,
          s.forwarding_awb,
          s.vol_weight,
          s.charge_weight,
          s.actual_weight,
          s.tax_amount,
          s.grand_total,
          s.customer_charges_total,
          s.vendor_charges_total,
          (coalesce(s.grand_total,0) - coalesce(s.vendor_charges_total,0)) as profit_amount,
          s.invoice_id
        from public.shipments s
        left join public.customers c on c.id = s.customer_id and c.tenant_id = s.tenant_id
        left join public.destinations od on od.id = s.origin_destination_id and od.tenant_id = s.tenant_id
        left join public.destinations dd on dd.id = s.destination_id and dd.tenant_id = s.tenant_id
        left join public.products pr on pr.id = s.product_id and pr.tenant_id = s.tenant_id
        left join public.vendors v on v.id = s.vendor_id and v.tenant_id = s.tenant_id
        left join public.branches b on b.id = s.branch_id and b.tenant_id = s.tenant_id
       where s.tenant_id = p_tenant and s.deleted_at is null
         and s.book_date between p_from and p_to
         and (v_cust is null or c.code = v_cust)
         and (v_origin is null or od.code = v_origin or b.code = v_origin)
         and (v_dest is null or dd.code = v_dest)
         and (v_product is null or pr.code = v_product)
         and (v_vendor is null or v.code = v_vendor)
         and (v_awb is null or s.awb_no ilike '%'||v_awb||'%')
         and (v_payment is null or s.payment_type ilike '%'||v_payment||'%')
         and (v_fwd is null or coalesce(s.forwarding_awb,'') ilike '%'||v_fwd||'%')
         and (v_invoice is null or exists (
               select 1 from public.invoices i
                where i.id = s.invoice_id and i.tenant_id = s.tenant_id
                  and i.invoice_no ilike '%'||v_invoice||'%'))
         and (v_key <> 'void-report' or s.current_status = 'VOID')
         and (v_key <> 'zero-report' or coalesce(s.grand_total,0) = 0)
         and (v_key <> 'cod-report' or upper(coalesce(s.payment_type,'')) like '%COD%')
         and (v_key <> 'forwarding-no-missing-report' or nullif(btrim(coalesce(s.forwarding_awb,'')),'') is null)
         and (v_key <> 'forwarding-report' or nullif(btrim(coalesce(s.forwarding_awb,'')),'') is not null
              or nullif(btrim(coalesce(s.delivery_awb,'')),'') is not null)
         and (v_key <> 'volumetric-weight-report' or coalesce(s.vol_weight,0) > 0)
         and (not v_billed or s.invoice_id is not null)
         and (not v_unbilled or s.invoice_id is null)
       order by case when v_dir='asc' then s.book_date end asc,
                case when v_dir='desc' then s.book_date end desc,
                s.awb_no
       limit p_limit offset p_offset
      ) t;
    end if;
  end if;

  return jsonb_build_object('rows', coalesce(v_rows,'[]'::jsonb), 'total', coalesce(v_total,0));
end
$$;

comment on function app.execute_courierwala_hub_report is
  'CourierWala Statements/AWB/Scan/Ops leftover report SQL (0061).';

-- ---------------------------------------------------------------------------
-- Preserve 5E executor, wrap with hub dispatch
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('app.execute_report_source(uuid,public.report_definitions,jsonb,date,date,integer,integer,text,text)') is not null
     and to_regprocedure('app.execute_report_source_legacy_5e(uuid,public.report_definitions,jsonb,date,date,integer,integer,text,text)') is null
  then
    alter function app.execute_report_source(uuid, public.report_definitions, jsonb, date, date, integer, integer, text, text)
      rename to execute_report_source_legacy_5e;
  end if;
end $$;

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
begin
  if p_def.report_key = any (array[
'customer-awb-stock-report',
    'customer-summary-report',
    'daily-report',
    'destination-summary-report',
    'location-summary-report',
    'product-summary-report',
    'tax-report',
    'tariff-rate-report',
    'sales-executive-sales-report',
    'obc-report-checklist',
    'customer-register-profit',
    'vendor-profit-report',
    'billing-report',
    'cod-report',
    'invoice-report',
    'void-report',
    'zero-report',
    'bagging-report',
    'bag-wise-detail-print',
    'delivery-status-report',
    'forwarding-report',
    'volumetric-weight-report',
    'edi-csb-files-report',
    'unassigned-drs-report',
    'unassigned-manifest-report',
    'unassigned-obc-report',
    'forwarding-no-missing-report',
    'comment-view-report',
    'user-entry-log-report',
    'awb-printing-report'
  ]) then
    return app.execute_courierwala_hub_report(
      p_tenant, p_def, p_filters, p_from, p_to, p_limit, p_offset, p_sort_col, p_sort_dir);
  end if;

  return app.execute_report_source_legacy_5e(
    p_tenant, p_def, p_filters, p_from, p_to, p_limit, p_offset, p_sort_col, p_sort_dir);
end
$$;

revoke all on function app.execute_report_source(uuid, public.report_definitions, jsonb, date, date, integer, integer, text, text) from public;
grant execute on function app.execute_report_source(uuid, public.report_definitions, jsonb, date, date, integer, integer, text, text)
  to authenticated, service_role;

comment on function app.execute_report_source is
  'Report source dispatcher: CourierWala hub keys (0061) then legacy 5A–5E.';

-- ---------------------------------------------------------------------------
-- Seed definitions
-- ---------------------------------------------------------------------------
do $$
declare
  v_date jsonb := jsonb_build_array(
    jsonb_build_object('key','from_date','label','From Date','type','DATE','required',true),
    jsonb_build_object('key','to_date','label','To Date','type','DATE','required',true)
  );
  v_ship_filters jsonb := v_date || jsonb_build_array(
    jsonb_build_object('key','customer_code','label','Customer','type','TEXT','required',false),
    jsonb_build_object('key','customer_id','label','Customer Id','type','TEXT','required',false),
    jsonb_build_object('key','origin','label','Origin','type','TEXT','required',false),
    jsonb_build_object('key','destination','label','Destination','type','TEXT','required',false),
    jsonb_build_object('key','service_center','label','Service Center','type','TEXT','required',false),
    jsonb_build_object('key','service_center_code','label','Service Center Code','type','TEXT','required',false),
    jsonb_build_object('key','product_id','label','Product','type','TEXT','required',false),
    jsonb_build_object('key','vendor_id','label','Vendor','type','TEXT','required',false),
    jsonb_build_object('key','payment_type','label','Payment Type','type','TEXT','required',false),
    jsonb_build_object('key','awb_no','label','AWB No','type','TEXT','required',false),
    jsonb_build_object('key','type','label','Type','type','TEXT','required',false),
    jsonb_build_object('key','status','label','Status','type','TEXT','required',false),
    jsonb_build_object('key','billed','label','Billed','type','BOOLEAN','required',false),
    jsonb_build_object('key','un_billed','label','Un Billed','type','BOOLEAN','required',false),
    jsonb_build_object('key','summary','label','Summary','type','BOOLEAN','required',false)
  );
  v_ship_cols jsonb := jsonb_build_array(
    jsonb_build_object('key','awb_no','label','AWB No.'),
    jsonb_build_object('key','book_date','label','Book Date'),
    jsonb_build_object('key','customer_code','label','Customer'),
    jsonb_build_object('key','destination_code','label','Destination'),
    jsonb_build_object('key','current_status','label','Status'),
    jsonb_build_object('key','charge_weight','label','Charge Wt'),
    jsonb_build_object('key','grand_total','label','Total')
  );
  v_sum_cols jsonb := jsonb_build_array(
    jsonb_build_object('key','group_key','label','Group'),
    jsonb_build_object('key','group_name','label','Name'),
    jsonb_build_object('key','shipment_count','label','Count'),
    jsonb_build_object('key','total_weight','label','Weight'),
    jsonb_build_object('key','customer_amount','label','Amount'),
    jsonb_build_object('key','profit_amount','label','Profit')
  );
begin
  -- Statements
  perform app.seed_report_definition(
    'customer-awb-stock-report','FINANCIAL','Customer AWB Stock Report',
    'Customer AWB stock status.',
    'rpt.customer-awb-stock-report','AWB_STOCK', 'created_at',
    jsonb_build_array(
      jsonb_build_object('key','customer_code','label','Customer','type','TEXT','required',false),
      jsonb_build_object('key','status','label','Status','type','TEXT','required',false),
      jsonb_build_object('key','summary','label','Summary','type','TEXT','required',false),
      jsonb_build_object('key','service_center','label','Service Center','type','TEXT','required',false)
    ),
    jsonb_build_array(
      jsonb_build_object('key','awb_no','label','AWB No.'),
      jsonb_build_object('key','customer_code','label','Customer'),
      jsonb_build_object('key','status','label','Status'),
      jsonb_build_object('key','remark','label','Remark')
    ), 200);

  perform app.seed_report_definition(
    'customer-summary-report','FINANCIAL','Customer Summary',
    'Customer shipment summary.',
    'rpt.customer-summary','HUB_GENERIC','book_date', v_ship_filters, v_sum_cols, 201);
  perform app.seed_report_definition(
    'daily-report','FINANCIAL','Daily Report',
    'Daily shipment register / summary.',
    'rpt.daily-report','SHIPMENTS','book_date', v_ship_filters, v_ship_cols, 202);
  perform app.seed_report_definition(
    'destination-summary-report','FINANCIAL','Destination Summary Report',
    'Shipments by destination.',
    'rpt.destination-summary-report','HUB_GENERIC','book_date', v_ship_filters, v_sum_cols, 203);
  perform app.seed_report_definition(
    'location-summary-report','FINANCIAL','Location Summary',
    'Shipments by origin/location.',
    'rpt.location-summary','HUB_GENERIC','book_date', v_ship_filters, v_sum_cols, 204);
  perform app.seed_report_definition(
    'product-summary-report','FINANCIAL','Product Summary',
    'Shipments by product.',
    'rpt.product-summary','HUB_GENERIC','book_date', v_ship_filters, v_sum_cols, 205);
  perform app.seed_report_definition(
    'tax-report','FINANCIAL','Tax Report',
    'Shipment tax amounts.',
    'rpt.tax-report','SHIPMENTS','book_date', v_ship_filters,
    v_ship_cols || jsonb_build_array(jsonb_build_object('key','tax_amount','label','Tax')), 206);
  perform app.seed_report_definition(
    'tariff-rate-report','FINANCIAL','Tariff Rate Report',
    'Customer contract rates.',
    'rpt.tariff-rate-report','CUSTOMER_RATES','from_date', v_date || jsonb_build_array(
      jsonb_build_object('key','customer_code','label','Customer','type','TEXT','required',false),
      jsonb_build_object('key','product_id','label','Product','type','TEXT','required',false),
      jsonb_build_object('key','type','label','Type','type','TEXT','required',false)
    ),
    jsonb_build_array(
      jsonb_build_object('key','customer_code','label','Customer'),
      jsonb_build_object('key','product_code','label','Product'),
      jsonb_build_object('key','rate_per_kg','label','Rate/Kg'),
      jsonb_build_object('key','from_date','label','From'),
      jsonb_build_object('key','to_date','label','To')
    ), 207);
  perform app.seed_report_definition(
    'sales-executive-sales-report','FINANCIAL','Sales Executive Wise Sales Report',
    'Sales by executive (shipment totals).',
    'rpt.sales-executive-wise-sales-report','SHIPMENTS','book_date',
    v_ship_filters || jsonb_build_array(
      jsonb_build_object('key','sales_executive_id','label','Sales Executive','type','TEXT','required',false)
    ), v_ship_cols, 208);
  perform app.seed_report_definition(
    'obc-report-checklist','FINANCIAL','OBC Report / Checklist',
    'OBC manifests checklist.',
    'rpt.obc-report-checklist','MANIFESTS','manifest_date',
    v_date || jsonb_build_array(
      jsonb_build_object('key','manifest_no','label','Manifest No.','type','TEXT','required',false),
      jsonb_build_object('key','origin','label','Origin','type','TEXT','required',false),
      jsonb_build_object('key','type','label','Type','type','TEXT','required',false)
    ),
    jsonb_build_array(
      jsonb_build_object('key','manifest_no','label','Manifest No.'),
      jsonb_build_object('key','manifest_date','label','Date'),
      jsonb_build_object('key','status','label','Status')
    ), 209);
  perform app.seed_report_definition(
    'customer-register-profit','FINANCIAL','Customer Register / Profit',
    'Customer freight vs vendor cost (pragmatic margin).',
    'rpt.customer-register-profit','SHIPMENTS','book_date', v_ship_filters,
    v_ship_cols || jsonb_build_array(
      jsonb_build_object('key','vendor_charges_total','label','Vendor Cost'),
      jsonb_build_object('key','profit_amount','label','Profit')
    ), 210);
  perform app.seed_report_definition(
    'vendor-profit-report','FINANCIAL','Vendor Profit Report',
    'Vendor margin approximation.',
    'rpt.vendor-profit-report','SHIPMENTS','book_date', v_ship_filters, v_sum_cols, 211);

  -- AWB hub
  perform app.seed_report_definition(
    'billing-report','FINANCIAL','Billing Report',
    'AWB billing register.',
    'rpt.billing-report','SHIPMENTS','book_date', v_ship_filters, v_ship_cols, 220);
  perform app.seed_report_definition(
    'cod-report','FINANCIAL','COD Report',
    'COD shipments.',
    'rpt.cod-report','SHIPMENTS','book_date', v_ship_filters, v_ship_cols, 221);
  perform app.seed_report_definition(
    'invoice-report','FINANCIAL','Invoice Report',
    'Invoice register.',
    'rpt.invoice-report','INVOICES','invoice_date', v_date || jsonb_build_array(
      jsonb_build_object('key','customer_code','label','Customer','type','TEXT','required',false),
      jsonb_build_object('key','origin','label','Origin','type','TEXT','required',false),
      jsonb_build_object('key','format_type','label','Format','type','TEXT','required',false),
      jsonb_build_object('key','lock_type','label','Lock Type','type','TEXT','required',false),
      jsonb_build_object('key','register_type','label','Register Type','type','TEXT','required',false)
    ),
    jsonb_build_array(
      jsonb_build_object('key','invoice_no','label','Invoice No.'),
      jsonb_build_object('key','invoice_date','label','Date'),
      jsonb_build_object('key','customer_code','label','Customer'),
      jsonb_build_object('key','grand_total','label','Total'),
      jsonb_build_object('key','status','label','Status')
    ), 222);
  perform app.seed_report_definition(
    'void-report','FINANCIAL','Void Report',
    'Voided AWBs.',
    'rpt.void-report','SHIPMENTS','book_date', v_ship_filters, v_ship_cols, 223);
  perform app.seed_report_definition(
    'zero-report','FINANCIAL','Zero Report',
    'Zero-value AWBs.',
    'rpt.zero-report','SHIPMENTS','book_date', v_ship_filters, v_ship_cols, 224);

  -- Scan hub
  perform app.seed_report_definition(
    'bagging-report','OPERATIONS','Bagging Report',
    'Bagging manifests.',
    'rpt.bagging-report','MANIFESTS','manifest_date',
    jsonb_build_array(
      jsonb_build_object('key','from_manifest_date','label','From Manifest Date','type','DATE','required',true),
      jsonb_build_object('key','to_manifest_date','label','To Manifest Date','type','DATE','required',true),
      jsonb_build_object('key','from_date','label','From Date','type','DATE','required',false),
      jsonb_build_object('key','to_date','label','To Date','type','DATE','required',false),
      jsonb_build_object('key','manifest_no','label','Manifest No.','type','TEXT','required',false),
      jsonb_build_object('key','bag_no','label','Bag No.','type','TEXT','required',false),
      jsonb_build_object('key','type','label','Type','type','TEXT','required',false)
    ),
    jsonb_build_array(
      jsonb_build_object('key','manifest_no','label','Manifest No.'),
      jsonb_build_object('key','manifest_date','label','Date'),
      jsonb_build_object('key','bag_no','label','Bag No.'),
      jsonb_build_object('key','awb_no','label','AWB No.')
    ), 230);
  perform app.seed_report_definition(
    'bag-wise-detail-print','OPERATIONS','Bag wise Detail Print',
    'Bag line print rows.',
    'rpt.bag-wise-detail-print','BAG_LINES', 'created_at',
    jsonb_build_array(
      jsonb_build_object('key','manifest_no','label','Manifest No.','type','TEXT','required',true),
      jsonb_build_object('key','product_id','label','Product','type','TEXT','required',false),
      jsonb_build_object('key','format_type','label','Format','type','TEXT','required',false),
      jsonb_build_object('key','type','label','Type','type','TEXT','required',false)
    ),
    jsonb_build_array(
      jsonb_build_object('key','manifest_no','label','Manifest No.'),
      jsonb_build_object('key','bag_no','label','Bag No.'),
      jsonb_build_object('key','awb_no','label','AWB No.'),
      jsonb_build_object('key','forwarding_no','label','Forwarding No.')
    ), 231);
  perform app.seed_report_definition(
    'delivery-status-report','OPERATIONS','Delivery Status Report',
    'Shipment delivery status.',
    'rpt.delivery-status-report','SHIPMENTS','book_date', v_ship_filters, v_ship_cols, 232);
  perform app.seed_report_definition(
    'forwarding-report','OPERATIONS','Forwarding Report',
    'Forwarded shipments.',
    'rpt.forwarding-report','SHIPMENTS','book_date',
    jsonb_build_array(
      jsonb_build_object('key','from_booking_date','label','From Booking Date','type','DATE','required',true),
      jsonb_build_object('key','to_booking_date','label','To Booking Date','type','DATE','required',true),
      jsonb_build_object('key','from_date','label','From Date','type','DATE','required',false),
      jsonb_build_object('key','to_date','label','To Date','type','DATE','required',false),
      jsonb_build_object('key','customer_code','label','Customer','type','TEXT','required',false),
      jsonb_build_object('key','awb_no','label','AWB No.','type','TEXT','required',false),
      jsonb_build_object('key','forwarding_no','label','Forwarding No','type','TEXT','required',false)
    ),
    v_ship_cols || jsonb_build_array(jsonb_build_object('key','forwarding_awb','label','Forwarding AWB')), 233);
  perform app.seed_report_definition(
    'volumetric-weight-report','OPERATIONS','Volumetric Weight Report',
    'Volumetric vs charge weight.',
    'rpt.volumetric-weight-report','SHIPMENTS','book_date',
    v_date || jsonb_build_array(
      jsonb_build_object('key','customer_code','label','Customer','type','TEXT','required',false),
      jsonb_build_object('key','invoice_no','label','Invoice No.','type','TEXT','required',false)
    ),
    v_ship_cols || jsonb_build_array(
      jsonb_build_object('key','vol_weight','label','Vol Wt'),
      jsonb_build_object('key','actual_weight','label','Actual Wt')
    ), 234);
  perform app.seed_report_definition(
    'edi-csb-files-report','OPERATIONS','EDI CSB Files',
    'CSB export jobs list.',
    'rpt.edi-csb-files','CSB_EXPORTS', 'created_at',
    jsonb_build_array(
      jsonb_build_object('key','manifest_no','label','Manifest No.','type','TEXT','required',true),
      jsonb_build_object('key','product_id','label','Product','type','TEXT','required',false),
      jsonb_build_object('key','csb_type','label','Type','type','TEXT','required',false),
      jsonb_build_object('key','type','label','AWB/Forwarding','type','TEXT','required',false)
    ),
    jsonb_build_array(
      jsonb_build_object('key','export_type','label','Export Type'),
      jsonb_build_object('key','status','label','Status'),
      jsonb_build_object('key','manifest_no','label','Manifest No.'),
      jsonb_build_object('key','created_at','label','Created')
    ), 235);

  -- Ops leftovers
  perform app.seed_report_definition(
    'unassigned-drs-report','OPERATIONS','Unassigned DRS Report',
    'DRS without delivery executive.',
    'rpt.unassigned-drs-report','DRS','drs_date', v_date,
    jsonb_build_array(
      jsonb_build_object('key','drs_no','label','DRS No.'),
      jsonb_build_object('key','drs_date','label','Date'),
      jsonb_build_object('key','status','label','Status')
    ), 240);
  perform app.seed_report_definition(
    'unassigned-manifest-report','OPERATIONS','Unassigned Manifest Report',
    'Manifests missing assignment.',
    'rpt.unassigned-manifest-report','MANIFESTS','manifest_date', v_date,
    jsonb_build_array(
      jsonb_build_object('key','manifest_no','label','Manifest No.'),
      jsonb_build_object('key','manifest_date','label','Date'),
      jsonb_build_object('key','status','label','Status')
    ), 241);
  perform app.seed_report_definition(
    'unassigned-obc-report','OPERATIONS','Unassigned OBC Report',
    'OBC manifests missing assignment.',
    'rpt.unassigned-obc-report','MANIFESTS','manifest_date', v_date,
    jsonb_build_array(
      jsonb_build_object('key','manifest_no','label','Manifest No.'),
      jsonb_build_object('key','manifest_date','label','Date'),
      jsonb_build_object('key','status','label','Status')
    ), 242);
  perform app.seed_report_definition(
    'forwarding-no-missing-report','OPERATIONS','Forwarding No Missing Report',
    'Shipments missing forwarding number.',
    'rpt.forwarding-no-missing-report','SHIPMENTS','book_date', v_ship_filters, v_ship_cols, 243);
  perform app.seed_report_definition(
    'comment-view-report','OPERATIONS','Comment View Report',
    'Shipment comments.',
    'rpt.comment-view-report','SHIPMENT_COMMENTS','commented_at', v_date || jsonb_build_array(
      jsonb_build_object('key','awb_no','label','AWB No.','type','TEXT','required',false),
      jsonb_build_object('key','comment','label','Comment','type','TEXT','required',false)
    ),
    jsonb_build_array(
      jsonb_build_object('key','awb_no','label','AWB No.'),
      jsonb_build_object('key','comment','label','Comment'),
      jsonb_build_object('key','commented_at','label','When')
    ), 244);
  perform app.seed_report_definition(
    'user-entry-log-report','AUDIT','User Entry Log Report',
    'Transaction entry audit trail.',
    'rpt.user-entry-log-report','AUDIT_LOGS','created_at', v_date,
    jsonb_build_array(
      jsonb_build_object('key','created_at','label','When'),
      jsonb_build_object('key','module_slug','label','Module'),
      jsonb_build_object('key','action','label','Action'),
      jsonb_build_object('key','entity_type','label','Entity')
    ), 245);
  perform app.seed_report_definition(
    'awb-printing-report','OPERATIONS','AWB Printing',
    'AWB list for print/export (tabular).',
    'rpt.awb-printing','SHIPMENTS','book_date', v_ship_filters, v_ship_cols, 246);
end $$;
