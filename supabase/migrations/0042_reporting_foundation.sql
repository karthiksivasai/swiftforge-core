-- ===========================================================================
-- 0042  reporting foundation — Phase 5 Milestone 5A
-- ---------------------------------------------------------------------------
-- Generic metadata-driven reporting infrastructure ONLY.
-- No dashboard KPIs, PDF/Excel exports, email scheduler, report_jobs queue,
-- materialized rollups, or the full ~74-report pack.
--
-- Tables: report_categories, report_definitions, report_filters,
--         saved_report_filters
-- RPCs:   get_report_definition, validate_report_filters, execute_report,
--         list_report_definitions
-- Seed:   awb-register, manifest-register, pickup-register,
--         customer-ledger, login-log  (representative subset)
--
-- Execution is source_entity-driven (SHIPMENTS|MANIFESTS|PICKUPS|LEDGER|
-- LOGIN_LOGS) — never stores report-specific SQL in tables.
-- Permissions: reuse existing rpt.* slugs (list/search).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- report_categories (hubs)
-- ---------------------------------------------------------------------------
create table if not exists public.report_categories (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references public.tenants(id) on delete cascade, -- null = global
  code          text not null,
  name          text not null,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  deleted_at    timestamptz,
  row_version   integer not null default 1,
  constraint report_categories_code_uq unique (code)
);
create index if not exists report_categories_sort_idx
  on public.report_categories (sort_order, code) where deleted_at is null;

alter table public.report_categories enable row level security;
drop policy if exists report_categories_select on public.report_categories;
create policy report_categories_select on public.report_categories
  for select using (
    deleted_at is null
    and (tenant_id is null or tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin())
  );

-- ---------------------------------------------------------------------------
-- report_definitions (metadata registry)
-- ---------------------------------------------------------------------------
create table if not exists public.report_definitions (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid references public.tenants(id) on delete cascade, -- null = global
  report_key        text not null,
  category_id       uuid references public.report_categories(id) on delete set null,
  hub               text not null default 'OPERATIONS',
  title             text not null,
  description       text,
  permission_slug   text not null,
  source_entity     text not null
                      check (source_entity in (
                        'SHIPMENTS','MANIFESTS','PICKUPS','LEDGER_ENTRIES','LOGIN_LOGS')),
  date_column       text not null default 'book_date',
  filter_schema     jsonb not null default '[]'::jsonb,
  columns           jsonb not null default '[]'::jsonb,
  allowed_formats   text[] not null default array['JSON']::text[],
  default_sort      jsonb not null default '{"column":"date","dir":"desc"}'::jsonb,
  max_date_span_days integer not null default 31,
  is_active         boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  created_by        uuid,
  updated_at        timestamptz not null default now(),
  updated_by        uuid,
  deleted_at        timestamptz,
  row_version       integer not null default 1,
  constraint report_definitions_key_uq unique (report_key)
);
create index if not exists report_definitions_hub_idx
  on public.report_definitions (hub, sort_order) where deleted_at is null and is_active;
create index if not exists report_definitions_perm_idx
  on public.report_definitions (permission_slug) where deleted_at is null;

alter table public.report_definitions enable row level security;
drop policy if exists report_definitions_select on public.report_definitions;
create policy report_definitions_select on public.report_definitions
  for select using (
    deleted_at is null
    and (tenant_id is null or tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin())
  );

-- ---------------------------------------------------------------------------
-- report_filters (normalized filter metadata — mirrors filter_schema)
-- ---------------------------------------------------------------------------
create table if not exists public.report_filters (
  id              uuid primary key default gen_random_uuid(),
  report_id       uuid not null references public.report_definitions(id) on delete cascade,
  filter_key      text not null,
  label           text not null,
  filter_type     text not null
                    check (filter_type in (
                      'DATE_RANGE','DATE','LOOKUP','ENUM','BOOLEAN','TEXT','NUMBER')),
  required        boolean not null default false,
  lookup_key      text,
  enum_options    jsonb not null default '[]'::jsonb,
  default_value   jsonb,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  constraint report_filters_uq unique (report_id, filter_key)
);
create index if not exists report_filters_report_idx
  on public.report_filters (report_id, sort_order);

alter table public.report_filters enable row level security;
drop policy if exists report_filters_select on public.report_filters;
create policy report_filters_select on public.report_filters
  for select using (
    exists (
      select 1 from public.report_definitions d
       where d.id = report_id and d.deleted_at is null
         and (d.tenant_id is null or d.tenant_id in (select app.user_tenant_ids())
              or app.is_platform_admin())
    )
  );

-- ---------------------------------------------------------------------------
-- saved_report_filters (per-user optional presets)
-- ---------------------------------------------------------------------------
create table if not exists public.saved_report_filters (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  user_id       uuid not null,
  report_key    text not null references public.report_definitions(report_key),
  name          text not null,
  filters       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  deleted_at    timestamptz,
  row_version   integer not null default 1,
  constraint saved_report_filters_uq unique (tenant_id, user_id, report_key, name)
);
create index if not exists saved_report_filters_user_idx
  on public.saved_report_filters (tenant_id, user_id, report_key)
  where deleted_at is null;

alter table public.saved_report_filters enable row level security;
drop policy if exists saved_report_filters_select on public.saved_report_filters;
create policy saved_report_filters_select on public.saved_report_filters
  for select using (
    tenant_id in (select app.user_tenant_ids())
    and (user_id = auth.uid() or app.is_platform_admin())
  );
drop policy if exists saved_report_filters_insert on public.saved_report_filters;
create policy saved_report_filters_insert on public.saved_report_filters
  for insert with check (
    tenant_id in (select app.user_tenant_ids()) and user_id = auth.uid());
drop policy if exists saved_report_filters_update on public.saved_report_filters;
create policy saved_report_filters_update on public.saved_report_filters
  for update using (
    tenant_id in (select app.user_tenant_ids()) and user_id = auth.uid());
drop policy if exists saved_report_filters_delete on public.saved_report_filters;
create policy saved_report_filters_delete on public.saved_report_filters
  for delete using (
    tenant_id in (select app.user_tenant_ids()) and user_id = auth.uid());

-- ===========================================================================
-- Seed categories + representative definitions
-- ===========================================================================
insert into public.report_categories (code, name, sort_order) values
  ('OPERATIONS', 'Operations', 10),
  ('FINANCIAL', 'Financial', 20),
  ('AUDIT', 'Audit / Session', 30)
on conflict (code) do nothing;

-- helper to upsert definition + filters
create or replace function app.seed_report_definition(
  p_key text,
  p_hub text,
  p_title text,
  p_desc text,
  p_slug text,
  p_source text,
  p_date_col text,
  p_filters jsonb,
  p_columns jsonb,
  p_sort integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_id uuid;
  v_cat uuid;
  v_f jsonb;
  v_ord integer := 0;
begin
  select id into v_cat from public.report_categories
   where code = p_hub and deleted_at is null;

  insert into public.report_definitions (
    report_key, category_id, hub, title, description, permission_slug,
    source_entity, date_column, filter_schema, columns, sort_order,
    allowed_formats)
  values (
    p_key, v_cat, p_hub, p_title, p_desc, p_slug,
    p_source, p_date_col, coalesce(p_filters,'[]'::jsonb),
    coalesce(p_columns,'[]'::jsonb), p_sort,
    array['JSON']::text[])
  on conflict (report_key) do update set
    category_id = excluded.category_id,
    hub = excluded.hub,
    title = excluded.title,
    description = excluded.description,
    permission_slug = excluded.permission_slug,
    source_entity = excluded.source_entity,
    date_column = excluded.date_column,
    filter_schema = excluded.filter_schema,
    columns = excluded.columns,
    sort_order = excluded.sort_order,
    updated_at = now()
  returning id into v_id;

  delete from public.report_filters where report_id = v_id;
  for v_f in select * from jsonb_array_elements(coalesce(p_filters,'[]'::jsonb))
  loop
    v_ord := v_ord + 1;
    insert into public.report_filters (
      report_id, filter_key, label, filter_type, required, lookup_key,
      enum_options, default_value, sort_order)
    values (
      v_id,
      v_f->>'key',
      coalesce(v_f->>'label', v_f->>'key'),
      v_f->>'type',
      coalesce((v_f->>'required')::boolean, false),
      nullif(v_f->>'lookup',''),
      coalesce(v_f->'options', '[]'::jsonb),
      v_f->'default',
      coalesce((v_f->>'sort')::integer, v_ord));
  end loop;

  return v_id;
end
$$;

do $$
declare
  v_date_filters jsonb := jsonb_build_array(
    jsonb_build_object('key','from_date','label','From Date','type','DATE','required',true),
    jsonb_build_object('key','to_date','label','To Date','type','DATE','required',true)
  );
begin
  perform app.seed_report_definition(
    'awb-register', 'OPERATIONS', 'AWB Register',
    'Shipment / AWB register (foundation sample).',
    'rpt.awb-report', 'SHIPMENTS', 'book_date',
    v_date_filters || jsonb_build_array(
      jsonb_build_object('key','customer_code','label','Customer','type','LOOKUP','lookup','customer','required',false),
      jsonb_build_object('key','status','label','Status','type','ENUM','required',false,
        'options', jsonb_build_array('DRAFT','BOOKED','MANIFESTED','IN_TRANSIT','DELIVERED','CANCELLED')),
      jsonb_build_object('key','summary','label','Summary','type','BOOLEAN','required',false,'default',false)
    ),
    jsonb_build_array(
      jsonb_build_object('key','awb_no','label','AWB No.'),
      jsonb_build_object('key','book_date','label','Book Date'),
      jsonb_build_object('key','customer_code','label','Customer'),
      jsonb_build_object('key','destination_code','label','Destination'),
      jsonb_build_object('key','status','label','Status'),
      jsonb_build_object('key','charge_weight','label','Charge Wt'),
      jsonb_build_object('key','grand_total','label','Total')
    ), 10);

  perform app.seed_report_definition(
    'manifest-register', 'OPERATIONS', 'Manifest Register',
    'Manifest register (foundation sample).',
    'rpt.manifest-report', 'MANIFESTS', 'manifest_date',
    v_date_filters || jsonb_build_array(
      jsonb_build_object('key','status','label','Status','type','ENUM','required',false,
        'options', jsonb_build_array('DRAFT','CLOSED','CANCELLED'))
    ),
    jsonb_build_array(
      jsonb_build_object('key','manifest_no','label','Manifest No.'),
      jsonb_build_object('key','manifest_date','label','Date'),
      jsonb_build_object('key','origin_code','label','Origin'),
      jsonb_build_object('key','destination_code','label','Destination'),
      jsonb_build_object('key','status','label','Status'),
      jsonb_build_object('key','total_awbs','label','AWBs')
    ), 20);

  perform app.seed_report_definition(
    'pickup-register', 'OPERATIONS', 'Pickup Register',
    'Pickup register (foundation sample).',
    'rpt.operation-report', 'PICKUPS', 'pickup_date',
    v_date_filters || jsonb_build_array(
      jsonb_build_object('key','status','label','Status','type','ENUM','required',false,
        'options', jsonb_build_array('OPEN','ASSIGNED','PICKED','CONFIRMED','CANCELLED'))
    ),
    jsonb_build_array(
      jsonb_build_object('key','pickup_no','label','Pickup No.'),
      jsonb_build_object('key','pickup_date','label','Date'),
      jsonb_build_object('key','customer_code','label','Customer'),
      jsonb_build_object('key','mobile_no','label','Mobile'),
      jsonb_build_object('key','status','label','Status'),
      jsonb_build_object('key','awb_no','label','AWB')
    ), 30);

  perform app.seed_report_definition(
    'customer-ledger', 'FINANCIAL', 'Customer Ledger',
    'AR subledger (foundation sample).',
    'rpt.statement-report', 'LEDGER_ENTRIES', 'entry_date',
    v_date_filters || jsonb_build_array(
      jsonb_build_object('key','customer_code','label','Customer','type','LOOKUP','lookup','customer','required',true),
      jsonb_build_object('key','doc_type','label','Doc Type','type','ENUM','required',false,
        'options', jsonb_build_array('INVOICE','RECEIPT','EXPENSE','CUSTOMER_PAYMENT','DEBIT_NOTE','CREDIT_NOTE','ADJUSTMENT','OPENING'))
    ),
    jsonb_build_array(
      jsonb_build_object('key','entry_date','label','Date'),
      jsonb_build_object('key','doc_type','label','Doc Type'),
      jsonb_build_object('key','narration','label','Narration'),
      jsonb_build_object('key','debit','label','Debit'),
      jsonb_build_object('key','credit','label','Credit'),
      jsonb_build_object('key','balance_after','label','Balance')
    ), 40);

  perform app.seed_report_definition(
    'login-log', 'AUDIT', 'Login Log',
    'Session / login events (foundation sample).',
    'rpt.login-log', 'LOGIN_LOGS', 'created_at',
    v_date_filters || jsonb_build_array(
      jsonb_build_object('key','event','label','Event','type','ENUM','required',false,
        'options', jsonb_build_array('LOGIN_SUCCESS','LOGIN_FAILED','LOGOUT','FORCED_LOGOUT','PERMISSION_CHANGE')),
      jsonb_build_object('key','username','label','Username','type','TEXT','required',false)
    ),
    jsonb_build_array(
      jsonb_build_object('key','created_at','label','At'),
      jsonb_build_object('key','username','label','Username'),
      jsonb_build_object('key','event','label','Event'),
      jsonb_build_object('key','user_type','label','User Type'),
      jsonb_build_object('key','ip_address','label','IP'),
      jsonb_build_object('key','detail','label','Detail')
    ), 50);
end $$;

-- ===========================================================================
-- Engine helpers
-- ===========================================================================

create or replace function app.get_report_def_row(p_key text)
returns public.report_definitions
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_d public.report_definitions;
begin
  select * into v_d from public.report_definitions
   where report_key = p_key and deleted_at is null and is_active;
  if not found then
    raise exception 'Report not found: %', p_key using errcode = 'P0002';
  end if;
  return v_d;
end
$$;

create or replace function app.assert_report_permission(p_tenant uuid, p_slug text)
returns void
language plpgsql
stable
security definer
set search_path = public, app
as $$
begin
  if not (
    app.user_has_permission(p_tenant, p_slug, 'list')
    or app.user_has_permission(p_tenant, p_slug, 'search')
  ) then
    raise exception 'Permission denied: %', p_slug using errcode = '42501';
  end if;
end
$$;

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

  -- DATE pair + 31-day cap
  begin
    v_from := nullif(btrim(coalesce(p_filters->>'from_date','')),'')::date;
    v_to := nullif(btrim(coalesce(p_filters->>'to_date','')),'')::date;
  exception when others then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field','from_date','message','Invalid date'));
    return jsonb_build_object('ok', false, 'errors', v_errors);
  end;

  if v_from is null or v_to is null then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object(
      'field','from_date','message','From Date and To Date are required'));
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

-- Source executors (generic per entity — not per report SQL)
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
  v_cust_id uuid;
  v_dir text := case when lower(coalesce(p_sort_dir,'desc')) = 'asc' then 'asc' else 'desc' end;
begin
  if p_def.source_entity = 'SHIPMENTS' then
    select count(*) into v_total
      from public.shipments s
      left join public.customers c on c.id = s.customer_id and c.tenant_id = s.tenant_id
     where s.tenant_id = p_tenant and s.deleted_at is null
       and s.book_date between p_from and p_to
       and (v_cust_code is null or c.code = v_cust_code)
       and (v_status is null or s.current_status = v_status);

    select coalesce(jsonb_agg(to_jsonb(t) order by t.sort_ts), '[]'::jsonb) into v_rows
      from (
        select
          s.awb_no,
          s.book_date,
          c.code as customer_code,
          d.code as destination_code,
          s.current_status as status,
          s.charge_weight,
          s.grand_total,
          s.book_date::timestamptz as sort_ts
        from public.shipments s
        left join public.customers c on c.id = s.customer_id and c.tenant_id = s.tenant_id
        left join public.destinations d on d.id = s.destination_id and d.tenant_id = s.tenant_id
        where s.tenant_id = p_tenant and s.deleted_at is null
          and s.book_date between p_from and p_to
          and (v_cust_code is null or c.code = v_cust_code)
          and (v_status is null or s.current_status = v_status)
        order by
          case when v_dir = 'asc' then s.book_date end asc nulls last,
          case when v_dir = 'desc' then s.book_date end desc nulls last,
          s.created_at desc
        limit p_limit offset p_offset
      ) t;

  elsif p_def.source_entity = 'MANIFESTS' then
    select count(*) into v_total
      from public.manifests m
     where m.tenant_id = p_tenant and m.deleted_at is null
       and m.manifest_date between p_from and p_to
       and (v_status is null or m.status = v_status);

    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows
      from (
        select
          m.manifest_no,
          m.manifest_date,
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
        order by
          case when v_dir = 'asc' then m.manifest_date end asc,
          case when v_dir = 'desc' then m.manifest_date end desc,
          m.created_at desc
        limit p_limit offset p_offset
      ) t;

  elsif p_def.source_entity = 'PICKUPS' then
    select count(*) into v_total
      from public.pickups p
     where p.tenant_id = p_tenant and p.deleted_at is null
       and p.pickup_date between p_from and p_to
       and (v_status is null or p.status = v_status);

    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_rows
      from (
        select
          p.pickup_no,
          p.pickup_date,
          c.code as customer_code,
          p.mobile_no,
          p.status,
          p.awb_no
        from public.pickups p
        left join public.customers c on c.id = p.customer_id and c.tenant_id = p.tenant_id
        where p.tenant_id = p_tenant and p.deleted_at is null
          and p.pickup_date between p_from and p_to
          and (v_status is null or p.status = v_status)
        order by
          case when v_dir = 'asc' then p.pickup_date end asc,
          case when v_dir = 'desc' then p.pickup_date end desc,
          p.created_at desc
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
-- Public RPCs
-- ===========================================================================

create or replace function public.list_report_definitions(p_hub text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_out jsonb;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'report_key', d.report_key,
      'hub', d.hub,
      'title', d.title,
      'description', d.description,
      'permission_slug', d.permission_slug,
      'allowed_formats', to_jsonb(d.allowed_formats),
      'sort_order', d.sort_order
    ) order by d.sort_order, d.title), '[]'::jsonb)
    into v_out
    from public.report_definitions d
   where d.deleted_at is null and d.is_active
     and (p_hub is null or d.hub = upper(p_hub))
     and (
       app.user_has_permission(v_tenant, d.permission_slug, 'list')
       or app.user_has_permission(v_tenant, d.permission_slug, 'search')
     );

  return v_out;
end
$$;

revoke all on function public.list_report_definitions(text) from public;
grant execute on function public.list_report_definitions(text)
  to authenticated, service_role;

create or replace function public.get_report_definition(p_report_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_d public.report_definitions;
  v_filters jsonb;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  v_d := app.get_report_def_row(p_report_key);
  perform app.assert_report_permission(v_tenant, v_d.permission_slug);

  select coalesce(jsonb_agg(jsonb_build_object(
      'key', f.filter_key,
      'label', f.label,
      'type', f.filter_type,
      'required', f.required,
      'lookup', f.lookup_key,
      'options', f.enum_options,
      'default', f.default_value,
      'sort', f.sort_order
    ) order by f.sort_order), coalesce(v_d.filter_schema,'[]'::jsonb))
    into v_filters
    from public.report_filters f
   where f.report_id = v_d.id;

  return jsonb_build_object(
    'report_key', v_d.report_key,
    'hub', v_d.hub,
    'title', v_d.title,
    'description', v_d.description,
    'permission_slug', v_d.permission_slug,
    'source_entity', v_d.source_entity,
    'filters', v_filters,
    'columns', v_d.columns,
    'allowed_formats', to_jsonb(v_d.allowed_formats),
    'default_sort', v_d.default_sort,
    'max_date_span_days', v_d.max_date_span_days,
    'export_options', jsonb_build_object(
      'formats', to_jsonb(v_d.allowed_formats),
      'note', 'Exports (CSV/PDF/Excel) are deferred to later milestones'
    ));
end
$$;

revoke all on function public.get_report_definition(text) from public;
grant execute on function public.get_report_definition(text)
  to authenticated, service_role;

create or replace function public.validate_report_filters(
  p_report_key text,
  p_filters jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_d public.report_definitions;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;
  v_d := app.get_report_def_row(p_report_key);
  perform app.assert_report_permission(v_tenant, v_d.permission_slug);
  return app.validate_report_filters_internal(v_d, p_filters);
end
$$;

revoke all on function public.validate_report_filters(text, jsonb) from public;
grant execute on function public.validate_report_filters(text, jsonb)
  to authenticated, service_role;

create or replace function public.execute_report(
  p_report_key text,
  p_filters jsonb default '{}'::jsonb,
  p_page integer default 1,
  p_page_size integer default 50,
  p_sort_by text default null,
  p_sort_dir text default 'desc'
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_d public.report_definitions;
  v_val jsonb;
  v_page integer := greatest(coalesce(p_page,1), 1);
  v_size integer := least(greatest(coalesce(p_page_size,50), 1), 500);
  v_offset integer;
  v_data jsonb;
  v_from date;
  v_to date;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  v_d := app.get_report_def_row(p_report_key);
  perform app.assert_report_permission(v_tenant, v_d.permission_slug);

  v_val := app.validate_report_filters_internal(v_d, p_filters);
  if not coalesce((v_val->>'ok')::boolean, false) then
    raise exception 'Filter validation failed: %', v_val->'errors'
      using errcode = 'CMS04';
  end if;

  v_from := (v_val->>'from_date')::date;
  v_to := (v_val->>'to_date')::date;
  v_offset := (v_page - 1) * v_size;

  v_data := app.execute_report_source(
    v_tenant, v_d, p_filters, v_from, v_to, v_size, v_offset,
    p_sort_by, p_sort_dir);

  return jsonb_build_object(
    'report_key', v_d.report_key,
    'title', v_d.title,
    'columns', v_d.columns,
    'rows', v_data->'rows',
    'total', (v_data->>'total')::bigint,
    'page', v_page,
    'page_size', v_size,
    'sort_by', p_sort_by,
    'sort_dir', coalesce(p_sort_dir,'desc'),
    'filters', p_filters);
end
$$;

revoke all on function public.execute_report(text, jsonb, integer, integer, text, text) from public;
grant execute on function public.execute_report(text, jsonb, integer, integer, text, text)
  to authenticated, service_role;

comment on function public.get_report_definition(text) is
  'Return report metadata: filters, columns, permissions, export options.';
comment on function public.validate_report_filters(text, jsonb) is
  'Validate filters against report metadata (dates/lookups/enums/booleans; 31-day cap).';
comment on function public.execute_report(text, jsonb, integer, integer, text, text) is
  'Synchronous metadata-driven report execution with pagination/sorting. No exports/jobs.';
comment on function public.list_report_definitions(text) is
  'Catalog of active report definitions filtered by permission.';
