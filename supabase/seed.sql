-- ===========================================================================
-- seed.sql — DEVELOPMENT seed data ONLY.
-- ---------------------------------------------------------------------------
-- Runs via `supabase db reset` / `supabase start` (service role, bypasses RLS).
-- Kept OUT of the versioned migrations so it never touches production.
-- Idempotent: fixed UUIDs + ON CONFLICT DO NOTHING.
--
-- Creates exactly one dev: plan, tenant, branch, financial year.
-- Tenant membership (tenant_users) is intentionally NOT seeded here because it
-- requires a real auth.users id — create a dev user in Supabase Auth, then run
-- the snippet in docs/phase-1-setup.md to link them to this tenant.
-- ===========================================================================

insert into public.plans (id, code, name, price_monthly, price_yearly, currency, limits, features, is_active)
values (
  '11111111-1111-1111-1111-111111111111',
  'DEV',
  'Development Plan',
  0, 0, 'INR',
  '{"max_users": 50, "max_branches": 25, "max_shipments_month": 100000, "storage_gb": 50}'::jsonb,
  '{"reports": true, "imports": true, "api": true}'::jsonb,
  true
)
on conflict (id) do nothing;

insert into public.tenants (id, slug, name, short_name, logo_initials, support_email, support_phone, status, plan_id)
values (
  '22222222-2222-2222-2222-222222222222',
  'devco',
  'Dev Courier Co',
  'DevCo',
  'DC',
  'support@devco.test',
  '+91 00000 00000',
  'ACTIVE',
  '11111111-1111-1111-1111-111111111111'
)
on conflict (id) do nothing;

insert into public.tenant_subscriptions (id, tenant_id, plan_id, status, current_period_start, current_period_end)
values (
  '2a222222-2222-2222-2222-222222222222',
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'ACTIVE',
  now(),
  now() + interval '1 year'
)
on conflict (id) do nothing;

insert into public.branches (id, tenant_id, code, name, is_head_office, status)
values (
  '33333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222',
  'HO',
  'Head Office',
  true,
  'ACTIVE'
)
on conflict (id) do nothing;

insert into public.financial_years (id, tenant_id, branch_id, label, from_date, to_date, is_active)
values (
  '44444444-4444-4444-4444-444444444444',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '2026-27',
  '2026-04-01',
  '2027-03-31',
  true
)
on conflict (id) do nothing;
