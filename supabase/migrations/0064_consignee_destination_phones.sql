-- ===========================================================================
-- 0064  Consignee master: destination + Address1 / Telephone1/2
-- ---------------------------------------------------------------------------
-- Align with CourierWala Consignee list:
--   Destination Code | Consignee Code | Consignee Name | Address1 |
--   Telephone1 | Telephone2
--
--   * Soft destination_code (always stored) + optional destinations FK
--   * address1 / address2 / telephone1 / telephone2 columns
--   * public.import_consignees — soft destination FK; no hard mobile/country
-- ===========================================================================

alter table public.consignees
  add column if not exists destination_id uuid,
  add column if not exists destination_code text,
  add column if not exists address1 text,
  add column if not exists address2 text,
  add column if not exists telephone1 text,
  add column if not exists telephone2 text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'consignees_destination_fk'
  ) then
    alter table public.consignees
      add constraint consignees_destination_fk
      foreign key (tenant_id, destination_id)
      references public.destinations (tenant_id, id)
      on delete set null;
  end if;
end $$;

create index if not exists consignees_tenant_destination_idx
  on public.consignees (tenant_id, destination_id);
create index if not exists consignees_tenant_destination_code_idx
  on public.consignees (tenant_id, destination_code);

comment on column public.consignees.destination_code is
  'Free-text destination code from import/UI; may exist without destinations FK.';
comment on column public.consignees.address1 is
  'Primary address line (CourierWala Address1).';
comment on column public.consignees.telephone1 is
  'Primary phone (CourierWala Telephone1).';
comment on column public.consignees.telephone2 is
  'Alternate phone (CourierWala Telephone2).';

-- Backfill from legacy columns when new fields are empty.
update public.consignees
set
  address1 = coalesce(nullif(btrim(address1), ''), nullif(btrim(address), '')),
  telephone1 = coalesce(nullif(btrim(telephone1), ''), nullif(btrim(mobile), ''))
where deleted_at is null
  and (
    nullif(btrim(coalesce(address1, '')), '') is null
    or nullif(btrim(coalesce(telephone1, '')), '') is null
  );

create or replace function public.import_consignees(p_mode text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant    uuid;
  v_mode      text := upper(coalesce(p_mode, 'VALIDATE'));
  v_job       uuid;
  v_total     int := 0;
  v_ok        int := 0;
  v_skipped   int := 0;
  v_errcnt    int := 0;
  v_errors    jsonb := '[]'::jsonb;
  v_row       jsonb;
  v_idx       int := 0;
  v_rc        int;
  v_col       text;
  v_msg       text;
  v_dest      uuid;
  v_customer  uuid;
  v_state     uuid;
  v_country   uuid;
  v_addr1     text;
  v_addr2     text;
  v_tel1      text;
  v_tel2      text;
  v_mobile    text;
  v_address   text;
  v_dest_code text;
  v_map_destinations jsonb := '{}'::jsonb;
  v_map_customers    jsonb := '{}'::jsonb;
  v_map_states       jsonb := '{}'::jsonb;
  v_map_countries    jsonb := '{}'::jsonb;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  if not app.user_has_permission(v_tenant, 'mst.consignee-master', 'add') then
    raise exception 'Missing permission to import consignees' using errcode = '42501';
  end if;

  if v_mode not in ('VALIDATE', 'COMMIT') then
    raise exception 'p_mode must be VALIDATE or COMMIT' using errcode = '22023';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array' using errcode = '22023';
  end if;

  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'Import batch exceeds the 5000-row limit' using errcode = '22023';
  end if;

  v_map_destinations := app.import_build_code_map(
    v_tenant, 'destinations', app.import_distinct_codes(p_rows, array['destination_code']));
  v_map_customers := app.import_build_code_map(
    v_tenant, 'customers', app.import_distinct_codes(p_rows, array['customer_code']));
  v_map_states := app.import_build_code_map(
    v_tenant, 'states', app.import_distinct_codes(p_rows, array['state_code']));
  v_map_countries := app.import_build_code_map(
    v_tenant, 'countries', app.import_distinct_codes(p_rows, array['country_code']));

  if v_mode = 'COMMIT' then
    insert into public.import_jobs
      (tenant_id, import_type, master, mode, status, total_rows, requested_by)
    values
      (v_tenant, 'MASTER_CSV', 'consignees', 'COMMIT', 'RUNNING',
       jsonb_array_length(p_rows), auth.uid())
    returning id into v_job;
    perform set_config('app.suppress_row_audit', 'on', true);
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_idx := v_idx + 1;
    v_total := v_total + 1;
    v_col := null;
    v_rc := 0;
    v_dest := null;
    v_customer := null;
    v_state := null;
    v_country := null;

    begin
      if coalesce(btrim(v_row->>'code'), '') = '' then
        v_col := 'code';
        raise exception using errcode = 'CMS01', message = 'Consignee Code is required';
      end if;
      if coalesce(btrim(v_row->>'name'), '') = '' then
        v_col := 'name';
        raise exception using errcode = 'CMS01', message = 'Consignee Name is required';
      end if;

      v_dest_code := nullif(upper(btrim(coalesce(v_row->>'destination_code', ''))), '');
      v_dest := app.import_lookup_soft(v_map_destinations, v_row->>'destination_code');
      v_customer := app.import_lookup_soft(v_map_customers, v_row->>'customer_code');
      v_state := app.import_lookup_soft(v_map_states, v_row->>'state_code');
      v_country := app.import_lookup_soft(v_map_countries, v_row->>'country_code');

      v_addr1 := nullif(btrim(coalesce(v_row->>'address1', v_row->>'address', '')), '');
      v_addr2 := nullif(btrim(coalesce(v_row->>'address2', '')), '');
      v_tel1 := nullif(btrim(coalesce(
        v_row->>'telephone1', v_row->>'mobile', v_row->>'phone', '')), '');
      v_tel2 := nullif(btrim(coalesce(v_row->>'telephone2', '')), '');
      v_mobile := coalesce(v_tel1, '0000000000');
      v_address := nullif(btrim(concat_ws(', ', v_addr1, v_addr2)), '');

      insert into public.consignees (
        tenant_id, code, name,
        destination_id, destination_code,
        customer_id, customer_name,
        mobile, email,
        address, address1, address2,
        telephone1, telephone2,
        pin_code, city, state_id, country_id, status
      )
      values (
        v_tenant,
        btrim(v_row->>'code'),
        btrim(v_row->>'name'),
        v_dest,
        v_dest_code,
        v_customer,
        nullif(btrim(coalesce(v_row->>'customer_name', v_row->>'customer', '')), ''),
        v_mobile,
        nullif(btrim(coalesce(v_row->>'email', '')), ''),
        v_address,
        v_addr1,
        v_addr2,
        v_tel1,
        v_tel2,
        nullif(btrim(coalesce(v_row->>'pin_code', v_row->>'pincode', '')), ''),
        nullif(btrim(coalesce(v_row->>'city', '')), ''),
        v_state,
        v_country,
        app.norm_enum(v_row->>'status', array['ACTIVE', 'INACTIVE'], 'Status', 'ACTIVE')
      )
      on conflict (tenant_id, code) where deleted_at is null do nothing;

      get diagnostics v_rc = row_count;

      if v_mode = 'VALIDATE' then
        raise exception using errcode = 'CMS00', message = 'dry-run';
      end if;

      if v_rc = 1 then
        v_ok := v_ok + 1;
      else
        v_skipped := v_skipped + 1;
      end if;

    exception
      when sqlstate 'CMS00' then
        if v_rc = 1 then
          v_ok := v_ok + 1;
        else
          v_skipped := v_skipped + 1;
        end if;

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
           error_rows = v_errcnt
     where id = v_job;
    perform set_config('app.suppress_row_audit', 'off', true);
  end if;

  return jsonb_build_object(
    'master', 'consignees',
    'mode', v_mode,
    'job_id', v_job,
    'total', v_total,
    'ok', v_ok,
    'skipped', v_skipped,
    'error_count', v_errcnt,
    'errors', v_errors
  );
end;
$$;

revoke all on function public.import_consignees(text, jsonb) from public;
grant execute on function public.import_consignees(text, jsonb) to authenticated, service_role;

comment on function public.import_consignees(text, jsonb) is
  'Consignee CSV import with soft destination FK; stores destination_code, address1, telephone1/2.';
