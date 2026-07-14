-- ===========================================================================
-- 0005  audit_logs — append-only change history (tenant-owned).
-- ---------------------------------------------------------------------------
-- Immutable trail feeding the blueprint's Action Log reports. Protections:
--   1. RLS: tenant members may SELECT + INSERT their tenant's rows only.
--   2. NO update/delete policies -> those verbs denied to non-privileged roles.
--   3. A BEFORE UPDATE/DELETE trigger hard-blocks mutation even for the table
--      owner (defense in depth).
--   4. app.write_audit_log(): the safe SECURITY DEFINER write path for backend
--      code / DB triggers to append entries with the correct actor.
-- ===========================================================================

create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  entity_type text not null,
  entity_id   uuid,
  action      text not null
                check (action in ('ADD','MODIFY','DELETE','LOGIN','LOGOUT','ACCESS')),
  module_slug text,
  actor_id    uuid,                            -- auth.users id of who did it
  old_values  jsonb,
  new_values  jsonb,
  ip_address  inet,
  request_id  text,
  created_at  timestamptz not null default now()
);
create index if not exists audit_logs_tenant_created_idx
  on public.audit_logs (tenant_id, created_at desc);
create index if not exists audit_logs_tenant_entity_idx
  on public.audit_logs (tenant_id, entity_type, entity_id);
create index if not exists audit_logs_tenant_module_idx
  on public.audit_logs (tenant_id, module_slug, created_at desc);

-- Append-only hard guard.
drop trigger if exists trg_audit_logs_block_mutations on public.audit_logs;
create trigger trg_audit_logs_block_mutations
  before update or delete on public.audit_logs
  for each row execute function app.tg_block_mutations();

-- Safe write path.
create or replace function app.write_audit_log(
  p_tenant_id   uuid,
  p_entity_type text,
  p_action      text,
  p_entity_id   uuid   default null,
  p_module_slug text   default null,
  p_old         jsonb  default null,
  p_new         jsonb  default null,
  p_ip          inet   default null,
  p_request_id  text   default null
)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_id uuid;
begin
  insert into public.audit_logs (
    tenant_id, entity_type, entity_id, action, module_slug,
    actor_id, old_values, new_values, ip_address, request_id
  ) values (
    p_tenant_id, p_entity_type, p_entity_id, p_action, p_module_slug,
    auth.uid(), p_old, p_new, p_ip, p_request_id
  )
  returning id into v_id;
  return v_id;
end
$$;

comment on function app.write_audit_log(uuid,text,text,uuid,text,jsonb,jsonb,inet,text) is
  'Append an audit_logs row with the current auth.uid() as actor. Append-only.';

alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());

drop policy if exists audit_logs_insert on public.audit_logs;
create policy audit_logs_insert on public.audit_logs
  for insert with check (tenant_id in (select app.user_tenant_ids()));

-- Note: intentionally NO update/delete policies -> denied by RLS, and further
-- blocked by trg_audit_logs_block_mutations.
