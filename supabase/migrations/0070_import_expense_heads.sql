-- ===========================================================================
-- 0070  Expense heads CSV import (CourierWala Name / Is Authorized)
-- ---------------------------------------------------------------------------
-- Dedicated import RPC (same pattern as import_consignees). Name-only CSVs
-- auto-generate code from the expense head name. Also backfills TENANT_ADMIN
-- grants for mst.expense-master when missing.
-- ===========================================================================

-- Heal missing TENANT_ADMIN grant (idempotent; never overwrite custom grants).
insert into public.group_permissions
  (tenant_id, group_id, module_id, all_access, can_add, can_modify, can_delete, can_list, can_search)
select g.tenant_id, g.id, pm.id, true, true, true, true, true, true
from public.user_groups g
join public.permission_modules pm on pm.slug = 'mst.expense-master'
where lower(g.name) = 'tenant_admin' and g.deleted_at is null
on conflict (group_id, module_id) do nothing;

insert into public.group_permissions
  (tenant_id, group_id, module_id, all_access, can_add, can_modify, can_delete, can_list, can_search)
select g.tenant_id, g.id, pm.id, false, false, false, false, true, true
from public.user_groups g
join public.permission_modules pm on pm.slug = 'mst.expense-master'
where lower(g.name) = 'operations' and g.deleted_at is null
on conflict (group_id, module_id) do nothing;

create or replace function public.import_expense_heads(p_mode text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid;
  v_mode   text := upper(coalesce(p_mode, 'VALIDATE'));
  v_job    uuid;
  v_total  int := 0;
  v_ok     int := 0;
  v_skipped int := 0;
  v_errcnt int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_row    jsonb;
  v_idx    int := 0;
  v_rc     int;
  v_col    text;
  v_msg    text;
  v_name   text;
  v_code   text;
  v_kind   text;
begin
  select t into v_tenant from (select app.user_tenant_ids() as t) s limit 1;
  if v_tenant is null then
    raise exception 'No tenant context for the current user' using errcode = '42501';
  end if;

  if not app.user_has_permission(v_tenant, 'mst.expense-master', 'add') then
    raise exception 'Missing permission to import expenses' using errcode = '42501';
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

  if v_mode = 'COMMIT' then
    insert into public.import_jobs
      (tenant_id, import_type, master, mode, status, total_rows, requested_by)
    values
      (v_tenant, 'MASTER_CSV', 'expense_heads', 'COMMIT', 'RUNNING',
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
    v_name := null;
    v_code := null;
    v_kind := null;

    begin
      v_name := nullif(btrim(coalesce(v_row->>'name', '')), '');
      if v_name is null then
        v_col := 'name';
        raise exception using errcode = 'CMS01', message = 'Expense Head / Name is required';
      end if;

      v_code := nullif(btrim(coalesce(v_row->>'code', '')), '');
      if v_code is null then
        v_code := nullif(
          regexp_replace(
            regexp_replace(upper(v_name), '[^A-Z0-9]+', '_', 'g'),
            '^_+|_+$', '', 'g'
          ),
          ''
        );
        if v_code is null then
          v_code := 'EXP';
        end if;
        v_code := left(v_code, 50);
      end if;

      v_kind := upper(btrim(coalesce(v_row->>'kind', 'EXPENSE')));
      if v_kind in ('INC', 'INCOME') or v_kind like 'INC%' then
        v_kind := 'INCOME';
      else
        v_kind := 'EXPENSE';
      end if;

      insert into public.expense_heads (
        tenant_id, code, name, kind, expense_type,
        authorization_required, authorized_ho_amount, authorized_branch_amount,
        document_required, document_required_amount, status
      )
      values (
        v_tenant,
        v_code,
        v_name,
        v_kind,
        coalesce(
          app.norm_enum(
            v_row->>'expense_type',
            array['DIRECT', 'INDIRECT', 'OPERATIONAL', 'ADMINISTRATIVE'],
            'Expense type',
            'OPERATIONAL'
          ),
          'OPERATIONAL'
        ),
        app.norm_bool(
          coalesce(v_row->>'authorization_required', v_row->>'is_authorized'),
          true
        ),
        coalesce(app.norm_numeric(v_row->>'authorized_ho_amount'), 0),
        coalesce(app.norm_numeric(v_row->>'authorized_branch_amount'), 0),
        app.norm_bool(v_row->>'document_required', true),
        coalesce(app.norm_numeric(v_row->>'document_required_amount'), 0),
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
          'row_no', v_idx, 'column_name', v_col, 'message', v_msg);
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
          'row_no', v_idx, 'column_name', v_col, 'message', v_msg);
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
    'master', 'expense_heads',
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

revoke all on function public.import_expense_heads(text, jsonb) from public;
grant execute on function public.import_expense_heads(text, jsonb) to authenticated, service_role;

comment on function public.import_expense_heads(text, jsonb) is
  'Expense head CSV import; auto-generates code from Name when Code is blank.';
