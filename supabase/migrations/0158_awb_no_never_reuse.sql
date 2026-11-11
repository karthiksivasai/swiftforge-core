-- Migration 0158: AWB Number Never Reused & Global Unconditional Uniqueness
-- 1. Rename existing soft-deleted duplicate test shipments so their AWB numbers do not conflict
-- 2. Drop partial unique index and create unconditional unique index on public.shipments(tenant_id, awb_no)
-- 3. Update app.claim_awb_no to search across ALL shipments (deleted or active), moving series strictly forward

-- Step 1: Rename the 19 soft-deleted duplicate rows
update public.shipments
   set awb_no = 'OLD_' || awb_no || '_' || substr(id::text, 1, 8)
 where deleted_at is not null
   and exists (
     select 1
       from public.shipments s2
      where s2.tenant_id = shipments.tenant_id
        and s2.awb_no = shipments.awb_no
        and s2.id <> shipments.id
   );

-- Step 2: Drop partial unique index and create unconditional unique index
drop index if exists public.shipments_tenant_awb_uq;
create unique index shipments_tenant_awb_uq on public.shipments (tenant_id, awb_no);

-- Step 3: Replace app.claim_awb_no to never reuse any AWB number (active, cancelled, or deleted)
create or replace function app.claim_awb_no(
  p_tenant    uuid,
  p_branch    uuid,
  p_fin_year  text,
  p_requested text default null
)
returns text
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_series    public.branch_awb_allotments%rowtype;
  v_number    bigint;
  v_awb       text;
  v_width     integer;
  v_requested text := nullif(trim(p_requested), '');
begin
  if p_tenant is null then
    raise exception 'Tenant is required to allocate an AWB' using errcode = '22023';
  end if;

  if v_requested is not null then
    if not (v_requested ~ '^[0-9]+$') then
      raise exception 'Manual AWB % must contain only digits', v_requested
        using errcode = '22023';
    end if;
    if p_branch is null then
      raise exception 'Branch is required to validate a manual AWB' using errcode = '22023';
    end if;

    select * into v_series
      from public.branch_awb_allotments a
     where a.tenant_id = p_tenant
       and a.branch_id = p_branch
       and a.series_type = 'MANUAL'
       and a.is_active
       and a.deleted_at is null
       and a.status = 'ACTIVE'
     order by a.start_no
     limit 1
     for update;
    if v_series.id is null then
      raise exception 'This branch has no manual AWB series' using errcode = 'CMS03';
    end if;
    if v_series.start_no > v_series.end_no
       or v_series.start_no < 500001
       or v_series.end_no > 899999 then
      raise exception 'Manual AWB series must stay inside 500001 to 899999'
        using errcode = '22023';
    end if;

    v_width := length(v_series.end_no::text);
    if length(v_requested) <> v_width then
      raise exception 'Manual AWB must be % digits', v_width using errcode = '22023';
    end if;
    v_number := v_requested::bigint;
    if v_number < v_series.start_no or v_number > v_series.end_no then
      raise exception 'Manual AWB % is outside this branch series % to %',
        v_requested, v_series.start_no, v_series.end_no
        using errcode = '22023';
    end if;
    if exists (
      select 1 from public.branch_awb_allotments a
       where a.tenant_id = p_tenant
         and a.branch_id = p_branch
         and a.series_type = 'AUTO'
         and a.deleted_at is null
         and a.is_active
         and v_number between a.start_no and a.end_no
    ) then
      raise exception 'Manual AWB % overlaps the auto series', v_requested
        using errcode = '22023';
    end if;

    -- Global check across ALL shipments (active, cancelled, or deleted)
    if exists (
      select 1 from public.shipments s
       where s.tenant_id = p_tenant
         and upper(s.awb_no) = upper(v_requested)
    ) then
      raise exception 'AWB % is already used by another shipment', v_requested
        using errcode = '23505';
    end if;
    return v_requested;
  end if;

  if p_branch is null then
    raise exception 'Branch is required to allocate an AWB' using errcode = '22023';
  end if;

  select * into v_series
    from public.branch_awb_allotments a
   where a.tenant_id = p_tenant
     and a.branch_id = p_branch
     and a.series_type = 'AUTO'
     and a.is_active
     and a.deleted_at is null
     and a.status = 'ACTIVE'
   order by a.start_no
   limit 1
   for update;
  if v_series.id is null then
    raise exception 'This branch has no auto AWB series' using errcode = 'CMS03';
  end if;
  if v_series.start_no > v_series.end_no
     or v_series.start_no < 100001
     or v_series.end_no > 499999 then
    raise exception 'Auto AWB series must stay inside 100001 to 499999'
      using errcode = '22023';
  end if;
  if exists (
    select 1 from public.branch_awb_allotments m
     where m.tenant_id = p_tenant
       and m.branch_id = p_branch
       and m.series_type = 'MANUAL'
       and m.deleted_at is null
       and m.is_active
       and m.start_no <= v_series.end_no
       and m.end_no >= v_series.start_no
  ) then
    raise exception 'AUTO and MANUAL AWB series overlap for this branch'
      using errcode = '22023';
  end if;

  v_width := length(v_series.end_no::text);

  -- Seed from max(awb_no) across ALL shipments (deleted or active)
  select coalesce(max(s.awb_no::bigint), v_series.start_no - 1) + 1
    into v_number
    from public.shipments s
   where s.tenant_id = p_tenant
     and s.awb_no ~ '^[0-9]+$'
     and length(s.awb_no) = v_width
     and s.awb_no::bigint between v_series.start_no and v_series.end_no;

  -- Ensure loop checks across ALL shipments (deleted or active)
  loop
    if v_number > v_series.end_no then
      update public.branch_awb_allotments
         set status = 'EXHAUSTED'
       where id = v_series.id;
      raise exception 'No free AWB number is left in this series' using errcode = 'CMS03';
    end if;
    v_awb := lpad(v_number::text, v_width, '0');
    exit when not exists (
      select 1 from public.shipments s
       where s.tenant_id = p_tenant and s.awb_no = v_awb
    );
    v_number := v_number + 1;
  end loop;

  if v_number < 100001 or v_number > 499999 or v_number between 500001 and 899999 then
    raise exception 'Auto AWB % is outside 100001 to 499999', v_awb using errcode = '22023';
  end if;
  if exists (
    select 1 from public.branch_awb_allotments m
     where m.tenant_id = p_tenant
       and m.branch_id = p_branch
       and m.series_type = 'MANUAL'
       and m.deleted_at is null
       and m.is_active
       and v_number between m.start_no and m.end_no
  ) then
    raise exception 'Auto AWB % overlaps the manual series', v_awb using errcode = '22023';
  end if;

  update public.branch_awb_allotments
     set used_count = used_count + 1
   where id = v_series.id;
  return v_awb;
end
$$;
