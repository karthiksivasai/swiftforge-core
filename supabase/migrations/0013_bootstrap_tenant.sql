-- ===========================================================================
-- 0013  Production-safe initial tenant bootstrap (privileged; service role only)
-- ---------------------------------------------------------------------------
-- Fixes the deployment bootstrap gap: a live project has no tenant, and
-- supabase/seed.sql is development-only and must never run remotely.
--
-- app.bootstrap_tenant(...) idempotently creates the full tenant scaffold that
-- Phase 1/2 require BEFORE app.link_tenant_admin(...) can attach an admin:
--   plan (if needed) -> tenant -> subscription -> head-office branch ->
--   financial year -> sequence counters -> required tenant settings ->
--   RBAC default groups/permissions (via the existing app.provision_tenant_rbac).
--
-- Does NOT create migrations that alter earlier files, does NOT weaken RLS, and
-- does NOT create the auth admin (that stays a separate, documented step so no
-- service-role credential is ever needed in the browser). Re-running with the
-- same slug returns the SAME tenant and creates no duplicates.
-- ===========================================================================

create or replace function app.bootstrap_tenant(
  p_slug          text,
  p_name          text,
  p_short_name    text  default null,
  p_support_email text  default null,
  p_support_phone text  default null,
  p_status        text  default 'ACTIVE',
  p_branch_code   text  default 'HO',
  p_branch_name   text  default 'Head Office',
  p_fy_label      text  default null,   -- e.g. '2026-27' (auto-derived if null)
  p_fy_from       date  default null,
  p_fy_to         date  default null,
  p_plan_code     text  default 'STANDARD',
  p_plan_name     text  default 'Standard'
)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_plan     uuid;
  v_tenant   uuid;
  v_branch   uuid;
  v_fy       uuid;
  v_from     date;
  v_to       date;
  v_label    text;
  v_doc      text;
  v_doc_types text[] := array[
    'INVOICE','FREEFORM_INVOICE','DEBIT_NOTE','CREDIT_NOTE','RECEIPT','EXPENSE',
    'MANIFEST','DRS','PICKUP','BAG_MANIFEST','OBC','AWB'];
begin
  if p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$' then
    raise exception 'Invalid tenant slug %, must match ^[a-z0-9][a-z0-9-]{1,62}$', p_slug;
  end if;
  if coalesce(p_status,'ACTIVE') not in ('TRIAL','ACTIVE','SUSPENDED','CLOSED') then
    raise exception 'Invalid tenant status %', p_status;
  end if;

  -- ---- plan (global catalog; idempotent on unique code) -------------------
  insert into public.plans (code, name, is_active)
  values (p_plan_code, p_plan_name, true)
  on conflict (code) do nothing;
  select id into v_plan from public.plans where code = p_plan_code;

  -- ---- tenant (idempotent by slug; partial unique -> select-then-insert) --
  select id into v_tenant from public.tenants
    where slug = p_slug and deleted_at is null;
  if v_tenant is null then
    insert into public.tenants (slug, name, short_name, logo_initials,
                                support_email, support_phone, status, plan_id)
    values (p_slug, p_name, p_short_name,
            upper(left(regexp_replace(coalesce(p_short_name, p_name), '[^A-Za-z]', '', 'g'), 2)),
            p_support_email, p_support_phone, coalesce(p_status,'ACTIVE'), v_plan)
    returning id into v_tenant;
  end if;

  -- ---- subscription (one active row per tenant) ---------------------------
  if not exists (
    select 1 from public.tenant_subscriptions
    where tenant_id = v_tenant and deleted_at is null
  ) then
    insert into public.tenant_subscriptions
      (tenant_id, plan_id, status, current_period_start, current_period_end)
    values (v_tenant, v_plan, 'ACTIVE', now(), now() + interval '1 year');
  end if;

  -- ---- head-office branch (idempotent by tenant+code) ---------------------
  select id into v_branch from public.branches
    where tenant_id = v_tenant and code = p_branch_code and deleted_at is null;
  if v_branch is null then
    insert into public.branches (tenant_id, code, name, is_head_office, status)
    values (v_tenant, p_branch_code, p_branch_name, true, 'ACTIVE')
    returning id into v_branch;
  end if;

  -- ---- financial year (Indian FY derived if not supplied) -----------------
  v_from := coalesce(p_fy_from,
    case when extract(month from now()) >= 4
         then make_date(extract(year from now())::int, 4, 1)
         else make_date(extract(year from now())::int - 1, 4, 1) end);
  v_to    := coalesce(p_fy_to, (v_from + interval '1 year - 1 day')::date);
  v_label := coalesce(p_fy_label, to_char(v_from, 'YYYY') || '-' || to_char(v_to, 'YY'));

  select id into v_fy from public.financial_years
    where tenant_id = v_tenant and branch_id = v_branch
      and label = v_label and deleted_at is null;
  if v_fy is null then
    insert into public.financial_years (tenant_id, branch_id, label, from_date, to_date, is_active)
    values (v_tenant, v_branch, v_label, v_from, v_to, true)
    returning id into v_fy;
  end if;

  -- ---- sequence counters (one per doc type; full unique -> ON CONFLICT) ---
  foreach v_doc in array v_doc_types loop
    insert into public.sequence_counters (tenant_id, branch_id, fin_year_id, doc_type, next_no)
    values (v_tenant, v_branch, v_fy, v_doc, 1)
    on conflict (tenant_id,
                 coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
                 coalesce(fin_year_id, '00000000-0000-0000-0000-000000000000'::uuid),
                 doc_type)
    do nothing;
  end loop;

  -- ---- required tenant settings (TENANT scope; full unique -> ON CONFLICT)-
  insert into public.tenant_settings (tenant_id, scope, key, value) values
    (v_tenant, 'TENANT', 'password_policy', jsonb_build_object(
        'min_length', 8, 'require_special', true, 'require_numeric', true,
        'username_not_password', true, 'history', 5,
        'lockout_attempts', 5, 'lockout_minutes', 15)),
    (v_tenant, 'TENANT', 'miscellaneous', jsonb_build_object(
        'weight_unit', 'KG', 'date_format', 'dd/MM/yyyy', 'currency', 'INR')),
    (v_tenant, 'TENANT', 'active_financial_year', jsonb_build_object(
        'financial_year_id', v_fy, 'label', v_label))
  on conflict (tenant_id, scope,
               coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), key)
  do nothing;

  -- ---- RBAC default groups + grants (existing Phase 2 provisioner) --------
  perform app.provision_tenant_rbac(v_tenant);

  return v_tenant;
end
$$;

comment on function app.bootstrap_tenant(text, text, text, text, text, text, text, text, text, date, date, text, text) is
  'Idempotent, service-role-only first-tenant bootstrap: plan, tenant, subscription, head-office branch, financial year, sequence counters, required settings, and RBAC default groups. Returns the tenant id. Pair with app.link_tenant_admin to attach the first admin.';

-- Privileged provisioning — never callable by normal (anon/authenticated) users.
revoke all on function app.bootstrap_tenant(text, text, text, text, text, text, text, text, text, date, date, text, text) from public;
grant execute on function app.bootstrap_tenant(text, text, text, text, text, text, text, text, text, date, date, text, text) to service_role;
