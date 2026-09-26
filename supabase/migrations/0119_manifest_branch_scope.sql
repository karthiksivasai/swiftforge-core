-- ===========================================================================
-- 0119  Allow Mobile Scanning + mandatory manifest branch scope
-- ---------------------------------------------------------------------------
-- Allow Mobile Scanning only opens approved camera/scan workflows. It does
-- not grant txn.awb-entry, txn.bagging, txn.manifest-scan, or status updates.
--
-- Manifest branch scope is always on. The stored users.manifest_branch flag
-- is not a bypass.
--   ADMIN            tenant-wide
--   BRANCH           home branch only
--   HUB              home hub + hub_branch_links + user_branch_access
--   other roles      home branch + user_branch_access
--   cross-branch     handover rows, or txn.manifest-cross-branch
--
-- Direct table reads use RLS. Security-definer RPCs filter and audit inside
-- the function because they bypass RLS. Writes are blocked by triggers.
--
-- Rollback:
--   drop trigger if exists trg_manifests_branch_scope on public.manifests;
--   drop trigger if exists trg_bagging_manifests_branch_scope on public.bagging_manifests;
--   drop trigger if exists trg_manifest_lines_branch_scope on public.manifest_lines;
--   drop trigger if exists trg_manifest_comments_branch_scope on public.manifest_comments;
--   drop trigger if exists trg_manifest_attachments_branch_scope on public.manifest_attachments;
--   drop trigger if exists trg_bagging_awb_lines_branch_scope on public.bagging_awb_lines;
--   drop trigger if exists trg_pickup_inscan_mobile_scan on public.pickup_inscan_events;
--   drop trigger if exists trg_manifest_scan_mobile_scan on public.manifest_scan_events;
--   drop function if exists public.transfer_manifest_run(uuid, uuid, text);
--   drop function if exists app.manifest_visible_and_audit(uuid, uuid, uuid, uuid, boolean, text);
--   drop function if exists app.manifest_branch_visible(uuid, uuid, uuid, boolean);
--   drop function if exists app.manifest_scope_branch_ids(uuid);
--   drop function if exists app.manifest_assigned_branch_ids(uuid);
--   drop function if exists app.user_allows_mobile_scanning();
--   drop table if exists public.hub_branch_links;
-- ===========================================================================

-- ---- Allow Mobile Scanning ------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'mobile_app_lens'
  ) then
    alter table public.users rename column mobile_app_lens to allow_mobile_scanning;
  elsif not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'allow_mobile_scanning'
  ) then
    alter table public.users
      add column allow_mobile_scanning boolean not null default false;
  end if;
end
$$;

comment on column public.users.allow_mobile_scanning is
  'Opens approved mobile camera/scan workflows only. Does not grant shipment, bagging, manifest, or status-update permissions.';

comment on column public.users.manifest_branch is
  'Unused. Manifest branch scope is mandatory and is not controlled by this flag.';

create or replace function app.user_allows_mobile_scanning()
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select coalesce((
    select u.allow_mobile_scanning
    from public.users u
    where u.auth_user_id = auth.uid()
      and u.status = 'ACTIVE'
      and u.deleted_at is null
    limit 1
  ), false)
$$;

comment on function app.user_allows_mobile_scanning() is
  'Camera/scan flag only. Never substitutes for txn.awb-entry, txn.bagging, txn.manifest-scan, or a status update.';

revoke all on function app.user_allows_mobile_scanning() from public;
grant execute on function app.user_allows_mobile_scanning() to authenticated, service_role;

create or replace function app.tg_mobile_scan_gate()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_app text;
begin
  if auth.uid() is null then
    return new;
  end if;

  select s.app into v_app
  from public.sessions s
  where s.auth_user_id = auth.uid()
    and s.revoked_at is null
  order by s.last_seen_at desc nulls last, s.created_at desc
  limit 1;

  if v_app = 'MOBILE' and not app.user_allows_mobile_scanning() then
    raise exception 'Mobile scanning is not enabled for this user'
      using errcode = '42501';
  end if;

  if TG_TABLE_NAME = 'manifest_scan_events' and auth.uid() is not null then
    if not exists (
      select 1
      from public.manifests m
      where m.id = new.manifest_id
        and m.tenant_id = new.tenant_id
        and app.manifest_branch_visible(m.tenant_id, m.origin_branch_id, m.destination_branch_id, m.is_handover)
    ) then
      raise exception 'Manifest is outside your branch scope' using errcode = '42501';
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists trg_pickup_inscan_mobile_scan on public.pickup_inscan_events;
create trigger trg_pickup_inscan_mobile_scan
  before insert on public.pickup_inscan_events
  for each row execute function app.tg_mobile_scan_gate();

drop trigger if exists trg_manifest_scan_mobile_scan on public.manifest_scan_events;
create trigger trg_manifest_scan_mobile_scan
  before insert on public.manifest_scan_events
  for each row execute function app.tg_mobile_scan_gate();

-- ---- Hub to branch map + handover columns --------------------------------
create table if not exists public.hub_branch_links (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  hub_branch_id uuid not null,
  branch_id     uuid not null,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  deleted_at    timestamptz,
  constraint hub_branch_links_hub_fk foreign key (tenant_id, hub_branch_id)
    references public.branches (tenant_id, id) on delete cascade,
  constraint hub_branch_links_branch_fk foreign key (tenant_id, branch_id)
    references public.branches (tenant_id, id) on delete cascade,
  constraint hub_branch_links_distinct check (hub_branch_id <> branch_id)
);

create unique index if not exists hub_branch_links_live_uq
  on public.hub_branch_links (tenant_id, hub_branch_id, branch_id)
  where deleted_at is null;

alter table public.manifests
  add column if not exists destination_branch_id uuid,
  add column if not exists is_handover boolean not null default false;

alter table public.bagging_manifests
  add column if not exists destination_branch_id uuid,
  add column if not exists is_handover boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'manifests_destination_branch_fk'
  ) then
    alter table public.manifests
      add constraint manifests_destination_branch_fk
      foreign key (tenant_id, destination_branch_id)
      references public.branches (tenant_id, id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'bagging_manifests_destination_branch_fk'
  ) then
    alter table public.bagging_manifests
      add constraint bagging_manifests_destination_branch_fk
      foreign key (tenant_id, destination_branch_id)
      references public.branches (tenant_id, id) on delete set null;
  end if;
end
$$;

comment on column public.manifests.is_handover is
  'Transfer/handover record. The other branch may see it when destination_branch_id is in their scope.';
comment on column public.bagging_manifests.is_handover is
  'Transfer/handover record. The other branch may see it when destination_branch_id is in their scope.';

insert into public.permission_modules (slug, section, name, under_menu, sort_order) values
  ('txn.manifest-cross-branch', 'TRANSACTION', 'Manifest Cross Branch', 'Entry', 34)
on conflict (slug) do update set
  name = excluded.name,
  section = excluded.section,
  under_menu = excluded.under_menu;

-- ---- Scope ----------------------------------------------------------------
create or replace function app.manifest_assigned_branch_ids(p_tenant uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public, app
as $$
  select b.id
  from public.branches b
  where b.tenant_id = p_tenant
    and b.deleted_at is null
    and (
      app.is_tenant_admin(p_tenant)
      or exists (
        select 1
        from public.users u
        where u.auth_user_id = auth.uid()
          and u.tenant_id = p_tenant
          and u.status = 'ACTIVE'
          and u.deleted_at is null
          and (
            (u.user_subtype = 'BRANCH' and b.id = u.home_branch_id)
            or (
              u.user_subtype = 'HUB'
              and (
                b.id = u.home_branch_id
                or exists (
                  select 1 from public.hub_branch_links h
                  where h.tenant_id = p_tenant
                    and h.hub_branch_id = u.home_branch_id
                    and h.branch_id = b.id
                    and h.deleted_at is null
                )
                or exists (
                  select 1 from public.user_branch_access uba
                  where uba.tenant_id = p_tenant
                    and uba.user_id = u.id
                    and uba.branch_id = b.id
                )
              )
            )
            or (
              coalesce(u.user_subtype, '') not in ('HUB', 'BRANCH')
              and (
                b.id = u.home_branch_id
                or exists (
                  select 1 from public.user_branch_access uba
                  where uba.tenant_id = p_tenant
                    and uba.user_id = u.id
                    and uba.branch_id = b.id
                )
              )
            )
          )
      )
    )
$$;

create or replace function app.manifest_scope_branch_ids(p_tenant uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public, app
as $$
  select app.manifest_assigned_branch_ids(p_tenant)
  union
  select b.id
  from public.branches b
  where b.tenant_id = p_tenant
    and b.deleted_at is null
    and app.user_has_permission(p_tenant, 'txn.manifest-cross-branch', 'list')
$$;

create or replace function app.manifest_branch_visible(
  p_tenant uuid,
  p_owner uuid,
  p_destination uuid,
  p_handover boolean
)
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select
    app.is_platform_admin()
    or coalesce(auth.role(), '') = 'service_role'
    or app.is_tenant_admin(p_tenant)
    or (
      p_owner is not null
      and p_owner in (select app.manifest_scope_branch_ids(p_tenant))
    )
    or (
      coalesce(p_handover, false)
      and p_destination is not null
      and p_destination in (select app.manifest_assigned_branch_ids(p_tenant))
    )
$$;

create or replace function app.manifest_visible_and_audit(
  p_tenant uuid,
  p_entity_id uuid,
  p_owner uuid,
  p_destination uuid,
  p_handover boolean,
  p_entity text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, app
as $$
declare
  v_visible boolean;
  v_assigned boolean;
begin
  if app.is_platform_admin() or coalesce(auth.role(), '') = 'service_role' then
    return true;
  end if;

  v_visible := app.manifest_branch_visible(p_tenant, p_owner, p_destination, p_handover);
  if not v_visible then
    return false;
  end if;

  v_assigned := p_owner is not null
    and p_owner in (select app.manifest_assigned_branch_ids(p_tenant));
  if not v_assigned then
    perform app.write_audit_log(
      p_tenant,
      p_entity,
      'ACCESS',
      p_entity_id,
      case when p_entity = 'bagging_manifests' then 'txn.bagging' else 'txn.manifest-scan' end,
      null,
      jsonb_build_object(
        'event', 'CROSS_BRANCH_VIEW',
        'owner_branch_id', p_owner,
        'destination_branch_id', p_destination,
        'handover', coalesce(p_handover, false)
      )
    );
  end if;
  return true;
end
$$;

revoke all on function app.manifest_assigned_branch_ids(uuid) from public;
revoke all on function app.manifest_scope_branch_ids(uuid) from public;
revoke all on function app.manifest_branch_visible(uuid, uuid, uuid, boolean) from public;
revoke all on function app.manifest_visible_and_audit(uuid, uuid, uuid, uuid, boolean, text) from public;
grant execute on function app.manifest_assigned_branch_ids(uuid) to authenticated, service_role;
grant execute on function app.manifest_scope_branch_ids(uuid) to authenticated, service_role;
grant execute on function app.manifest_branch_visible(uuid, uuid, uuid, boolean) to authenticated, service_role;
grant execute on function app.manifest_visible_and_audit(uuid, uuid, uuid, uuid, boolean, text) to authenticated, service_role;

-- ---- Write guard + lifecycle audit ----------------------------------------
create or replace function app.tg_manifest_scope_write()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_owner uuid;
  v_dest uuid;
  v_handover boolean;
  v_tenant uuid;
  v_id uuid;
  v_no text;
  v_status text;
  v_entity text := TG_TABLE_NAME;
  v_module text;
  v_assigned boolean;
begin
  if TG_OP = 'DELETE' then
    v_tenant := old.tenant_id;
    v_id := old.id;
    v_no := old.manifest_no;
    v_status := old.status;
    if v_entity = 'bagging_manifests' then
      v_owner := old.service_center_id;
    else
      v_owner := old.origin_branch_id;
    end if;
    v_dest := old.destination_branch_id;
    v_handover := old.is_handover;
  else
    v_tenant := new.tenant_id;
    v_id := new.id;
    v_no := new.manifest_no;
    v_status := new.status;
    if v_entity = 'bagging_manifests' then
      v_owner := new.service_center_id;
    else
      v_owner := new.origin_branch_id;
    end if;
    v_dest := new.destination_branch_id;
    v_handover := new.is_handover;
  end if;

  if auth.uid() is not null then
    if TG_OP = 'UPDATE'
       and current_setting('app.manifest_handover_transfer', true) is distinct from 'on' then
      if v_entity = 'bagging_manifests' then
        if not app.manifest_branch_visible(old.tenant_id, old.service_center_id, old.destination_branch_id, old.is_handover) then
          raise exception 'Manifest is outside your branch scope' using errcode = '42501';
        end if;
      elsif not app.manifest_branch_visible(old.tenant_id, old.origin_branch_id, old.destination_branch_id, old.is_handover) then
        raise exception 'Manifest is outside your branch scope' using errcode = '42501';
      end if;
    end if;
    if TG_OP = 'DELETE' then
      if not app.manifest_branch_visible(v_tenant, v_owner, v_dest, v_handover) then
        raise exception 'Manifest is outside your branch scope' using errcode = '42501';
      end if;
    else
      if not app.manifest_branch_visible(v_tenant, v_owner, v_dest, v_handover) then
        raise exception 'Manifest is outside your branch scope' using errcode = '42501';
      end if;
    end if;
  end if;

  v_module := case when v_entity = 'bagging_manifests' then 'txn.bagging' else 'txn.manifest-scan' end;
  v_assigned := v_owner is not null and (
    auth.uid() is null
    or app.is_tenant_admin(v_tenant)
    or v_owner in (select app.manifest_assigned_branch_ids(v_tenant))
  );

  if auth.uid() is not null and not v_assigned then
    perform app.write_audit_log(
      v_tenant, v_entity, 'ACCESS', v_id, v_module, null,
      jsonb_build_object(
        'event', 'CROSS_BRANCH_EDIT',
        'manifest_no', v_no,
        'owner_branch_id', v_owner,
        'destination_branch_id', v_dest,
        'handover', coalesce(v_handover, false)
      )
    );
  end if;

  perform app.write_audit_log(
    v_tenant,
    v_entity,
    case TG_OP when 'INSERT' then 'ADD' when 'DELETE' then 'DELETE' else 'MODIFY' end,
    v_id,
    v_module,
    null,
    jsonb_build_object(
      'event', case TG_OP
        when 'INSERT' then 'MANIFEST_CREATED'
        when 'DELETE' then 'MANIFEST_DELETED'
        else 'MANIFEST_UPDATED' end,
      'manifest_no', v_no,
      'status', v_status,
      'owner_branch_id', v_owner,
      'destination_branch_id', v_dest,
      'handover', coalesce(v_handover, false)
    )
  );

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

drop trigger if exists trg_manifests_branch_scope on public.manifests;
create trigger trg_manifests_branch_scope
  before insert or update or delete on public.manifests
  for each row execute function app.tg_manifest_scope_write();

drop trigger if exists trg_bagging_manifests_branch_scope on public.bagging_manifests;
create trigger trg_bagging_manifests_branch_scope
  before insert or update or delete on public.bagging_manifests
  for each row execute function app.tg_manifest_scope_write();

create or replace function app.tg_manifest_child_scope()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_ok boolean := true;
  v_tenant uuid;
  v_parent uuid;
begin
  if auth.uid() is null then
    if TG_OP = 'DELETE' then return old; end if;
    return new;
  end if;

  if TG_OP = 'DELETE' then
    v_tenant := old.tenant_id;
  else
    v_tenant := new.tenant_id;
  end if;

  if TG_TABLE_NAME = 'bagging_awb_lines' then
    v_parent := case when TG_OP = 'DELETE' then old.bagging_id else new.bagging_id end;
    select app.manifest_branch_visible(bm.tenant_id, bm.service_center_id, bm.destination_branch_id, bm.is_handover)
      into v_ok
    from public.bagging_manifests bm
    where bm.id = v_parent and bm.tenant_id = v_tenant;
  else
    v_parent := case when TG_OP = 'DELETE' then old.manifest_id else new.manifest_id end;
    select app.manifest_branch_visible(m.tenant_id, m.origin_branch_id, m.destination_branch_id, m.is_handover)
      into v_ok
    from public.manifests m
    where m.id = v_parent and m.tenant_id = v_tenant;
  end if;

  if coalesce(v_ok, false) is not true then
    raise exception 'Manifest is outside your branch scope' using errcode = '42501';
  end if;

  if TG_OP = 'DELETE' then return old; end if;
  return new;
end
$$;

drop trigger if exists trg_manifest_lines_branch_scope on public.manifest_lines;
create trigger trg_manifest_lines_branch_scope
  before insert or update or delete on public.manifest_lines
  for each row execute function app.tg_manifest_child_scope();

drop trigger if exists trg_manifest_comments_branch_scope on public.manifest_comments;
create trigger trg_manifest_comments_branch_scope
  before insert or update or delete on public.manifest_comments
  for each row execute function app.tg_manifest_child_scope();

drop trigger if exists trg_manifest_attachments_branch_scope on public.manifest_attachments;
create trigger trg_manifest_attachments_branch_scope
  before insert or update or delete on public.manifest_attachments
  for each row execute function app.tg_manifest_child_scope();

drop trigger if exists trg_bagging_awb_lines_branch_scope on public.bagging_awb_lines;
create trigger trg_bagging_awb_lines_branch_scope
  before insert or update or delete on public.bagging_awb_lines
  for each row execute function app.tg_manifest_child_scope();

-- ---- Replace SELECT policies so the client cannot filter around them ------
drop policy if exists manifests_select on public.manifests;
create policy manifests_select on public.manifests
  for select using (
    (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin())
    and app.manifest_visible_and_audit(
      tenant_id, id, origin_branch_id, destination_branch_id, is_handover, 'manifests'
    )
  );

drop policy if exists manifests_insert on public.manifests;
create policy manifests_insert on public.manifests
  for insert with check (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'txn.manifest-scan', 'add')
    and app.manifest_branch_visible(tenant_id, origin_branch_id, destination_branch_id, is_handover)
  );

drop policy if exists manifests_update on public.manifests;
create policy manifests_update on public.manifests
  for update using (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'txn.manifest-scan', 'modify')
    and app.manifest_branch_visible(tenant_id, origin_branch_id, destination_branch_id, is_handover)
  ) with check (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'txn.manifest-scan', 'modify')
    and app.manifest_branch_visible(tenant_id, origin_branch_id, destination_branch_id, is_handover)
  );

drop policy if exists manifests_delete on public.manifests;
create policy manifests_delete on public.manifests
  for delete using (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'txn.manifest-scan', 'delete')
    and app.manifest_branch_visible(tenant_id, origin_branch_id, destination_branch_id, is_handover)
  );

drop policy if exists bagging_manifests_select on public.bagging_manifests;
create policy bagging_manifests_select on public.bagging_manifests
  for select using (
    (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin())
    and app.manifest_visible_and_audit(
      tenant_id, id, service_center_id, destination_branch_id, is_handover, 'bagging_manifests'
    )
  );

drop policy if exists bagging_manifests_insert on public.bagging_manifests;
create policy bagging_manifests_insert on public.bagging_manifests
  for insert with check (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'txn.bagging', 'add')
    and app.manifest_branch_visible(tenant_id, service_center_id, destination_branch_id, is_handover)
  );

drop policy if exists bagging_manifests_update on public.bagging_manifests;
create policy bagging_manifests_update on public.bagging_manifests
  for update using (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'txn.bagging', 'modify')
    and app.manifest_branch_visible(tenant_id, service_center_id, destination_branch_id, is_handover)
  ) with check (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'txn.bagging', 'modify')
    and app.manifest_branch_visible(tenant_id, service_center_id, destination_branch_id, is_handover)
  );

drop policy if exists bagging_manifests_delete on public.bagging_manifests;
create policy bagging_manifests_delete on public.bagging_manifests
  for delete using (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'txn.bagging', 'delete')
    and app.manifest_branch_visible(tenant_id, service_center_id, destination_branch_id, is_handover)
  );

drop policy if exists manifest_lines_select on public.manifest_lines;
create policy manifest_lines_select on public.manifest_lines
  for select using (
    tenant_id in (select app.user_tenant_ids())
    and exists (
      select 1 from public.manifests m
      where m.id = manifest_lines.manifest_id
        and m.tenant_id = manifest_lines.tenant_id
        and app.manifest_visible_and_audit(
          m.tenant_id, m.id, m.origin_branch_id, m.destination_branch_id, m.is_handover, 'manifests'
        )
    )
  );

drop policy if exists manifest_comments_select on public.manifest_comments;
create policy manifest_comments_select on public.manifest_comments
  for select using (
    tenant_id in (select app.user_tenant_ids())
    and exists (
      select 1 from public.manifests m
      where m.id = manifest_comments.manifest_id
        and m.tenant_id = manifest_comments.tenant_id
        and app.manifest_branch_visible(m.tenant_id, m.origin_branch_id, m.destination_branch_id, m.is_handover)
    )
  );

drop policy if exists manifest_attachments_select on public.manifest_attachments;
create policy manifest_attachments_select on public.manifest_attachments
  for select using (
    tenant_id in (select app.user_tenant_ids())
    and exists (
      select 1 from public.manifests m
      where m.id = manifest_attachments.manifest_id
        and m.tenant_id = manifest_attachments.tenant_id
        and app.manifest_branch_visible(m.tenant_id, m.origin_branch_id, m.destination_branch_id, m.is_handover)
    )
  );

drop policy if exists bagging_awb_lines_select on public.bagging_awb_lines;
create policy bagging_awb_lines_select on public.bagging_awb_lines
  for select using (
    tenant_id in (select app.user_tenant_ids())
    and exists (
      select 1 from public.bagging_manifests bm
      where bm.id = bagging_awb_lines.bagging_id
        and bm.tenant_id = bagging_awb_lines.tenant_id
        and app.manifest_branch_visible(bm.tenant_id, bm.service_center_id, bm.destination_branch_id, bm.is_handover)
    )
  );

drop policy if exists manifest_events_select on public.manifest_events;
create policy manifest_events_select on public.manifest_events
  for select using (
    tenant_id in (select app.user_tenant_ids())
    and (
      manifest_id is null
      or exists (
        select 1 from public.manifests m
        where m.id = manifest_events.manifest_id
          and m.tenant_id = manifest_events.tenant_id
          and app.manifest_branch_visible(m.tenant_id, m.origin_branch_id, m.destination_branch_id, m.is_handover)
      )
    )
  );

drop policy if exists bagging_events_select on public.bagging_events;
create policy bagging_events_select on public.bagging_events
  for select using (
    tenant_id in (select app.user_tenant_ids())
    and (
      bagging_id is null
      or exists (
        select 1 from public.bagging_manifests bm
        where bm.id = bagging_events.bagging_id
          and bm.tenant_id = bagging_events.tenant_id
          and app.manifest_branch_visible(bm.tenant_id, bm.service_center_id, bm.destination_branch_id, bm.is_handover)
      )
    )
  );

drop policy if exists manifest_scan_events_select on public.manifest_scan_events;
create policy manifest_scan_events_select on public.manifest_scan_events
  for select using (
    tenant_id in (select app.user_tenant_ids())
    and exists (
      select 1 from public.manifests m
      where m.id = manifest_scan_events.manifest_id
        and m.tenant_id = manifest_scan_events.tenant_id
        and app.manifest_branch_visible(m.tenant_id, m.origin_branch_id, m.destination_branch_id, m.is_handover)
    )
  );

drop policy if exists manifest_scan_events_insert on public.manifest_scan_events;
create policy manifest_scan_events_insert on public.manifest_scan_events
  for insert with check (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'txn.manifest-in-scan', 'add')
    and exists (
      select 1 from public.manifests m
      where m.id = manifest_scan_events.manifest_id
        and m.tenant_id = manifest_scan_events.tenant_id
        and app.manifest_branch_visible(m.tenant_id, m.origin_branch_id, m.destination_branch_id, m.is_handover)
    )
  );

alter table public.hub_branch_links enable row level security;
drop policy if exists hub_branch_links_select on public.hub_branch_links;
create policy hub_branch_links_select on public.hub_branch_links
  for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());
drop policy if exists hub_branch_links_insert on public.hub_branch_links;
create policy hub_branch_links_insert on public.hub_branch_links
  for insert with check (
    tenant_id in (select app.user_tenant_ids())
    and app.is_tenant_admin(tenant_id)
  );
drop policy if exists hub_branch_links_update on public.hub_branch_links;
create policy hub_branch_links_update on public.hub_branch_links
  for update using (
    tenant_id in (select app.user_tenant_ids())
    and app.is_tenant_admin(tenant_id)
  ) with check (
    tenant_id in (select app.user_tenant_ids())
    and app.is_tenant_admin(tenant_id)
  );

grant select, insert, update on public.hub_branch_links to authenticated, service_role;

-- ---- Bagging list/detail stay inside the scope (they bypass RLS) ----------
create or replace function public.list_baggings(
  p_product_code  text default null,
  p_vendor_code   text default null,
  p_search        text default null,
  p_limit         integer default 50,
  p_offset        integer default 0
)
returns table (
  id              uuid,
  manifest_no     text,
  master_awb_no   text,
  manifest_date   date,
  origin          text,
  from_city       text,
  to_city         text,
  destination     text,
  vendor_name     text,
  vendor_code     text,
  total_awbs      integer,
  total_weight    numeric,
  total_bags      integer,
  status          text,
  created_at      timestamptz
)
language plpgsql
volatile
security definer
set search_path = public, app
as $$
declare
  v_tenant  uuid := app.current_tenant_id();
  v_pat     text := '%' || replace(replace(coalesce(btrim(p_search), ''), '%', '\%'), '_', '\_') || '%';
begin
  if not app.user_has_permission(v_tenant, 'txn.bagging', 'list')
     and not app.user_has_permission(v_tenant, 'txn.bagging', 'search') then
    raise exception 'Bagging permission is required' using errcode = '42501';
  end if;

  return query
  select
    bm.id,
    bm.manifest_no,
    coalesce(
      nullif(btrim(concat(bm.master_airlines_prefix, bm.master_awb_no_part, bm.master_no_part3)), ''),
      bm.mawb_master_no,
      ''
    ) as master_awb_no,
    bm.manifest_date,
    coalesce(bm.origin_city_code, bm.origin_city_name, '') as origin,
    coalesce(bm.origin_city_code, bm.origin_city_name, '') as from_city,
    coalesce(bm.dest_city_code, bm.dest_city_name, '') as to_city,
    coalesce(bm.dest_city_code, bm.dest_city_name, '') as destination,
    coalesce(bm.vendor_name, bm.vendor_code, '') as vendor_name,
    coalesce(bm.vendor_code, '') as vendor_code,
    bm.total_awbs,
    bm.total_weight,
    bm.total_bags,
    bm.status,
    bm.created_at
  from public.bagging_manifests bm
  where bm.tenant_id = v_tenant
    and bm.deleted_at is null
    and app.manifest_visible_and_audit(
      bm.tenant_id, bm.id, bm.service_center_id, bm.destination_branch_id, bm.is_handover, 'bagging_manifests'
    )
    and (p_vendor_code is null or btrim(p_vendor_code) = '' or upper(bm.vendor_code) = upper(btrim(p_vendor_code)))
    and (p_search is null or btrim(p_search) = '' or (
      bm.manifest_no ilike v_pat or
      bm.mawb_master_no ilike v_pat or
      bm.origin_city_code ilike v_pat or
      bm.dest_city_code ilike v_pat or
      bm.vendor_name ilike v_pat
    ))
  order by bm.manifest_date desc, bm.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.get_bagging_details(p_bagging_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app
as $$
declare
  v_tenant  uuid := app.current_tenant_id();
  v_header  public.bagging_manifests%rowtype;
  v_lines   jsonb;
begin
  if not app.user_has_permission(v_tenant, 'txn.bagging', 'list')
     and not app.user_has_permission(v_tenant, 'txn.bagging', 'search') then
    raise exception 'Bagging permission is required' using errcode = '42501';
  end if;

  select * into v_header
  from public.bagging_manifests
  where id = p_bagging_id
    and tenant_id = v_tenant
    and deleted_at is null;

  if v_header.id is null then
    return null;
  end if;

  if not app.manifest_visible_and_audit(
    v_header.tenant_id, v_header.id, v_header.service_center_id,
    v_header.destination_branch_id, v_header.is_handover, 'bagging_manifests'
  ) then
    return null;
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id',           bal.id,
      'bagNo',        bal.bag_no,
      'awbNo',        bal.awb_no,
      'crnMhbsNo',    coalesce(bal.crn_mhbs_no, ''),
      'forwardingNo', coalesce(bal.forwarding_no, ''),
      'weight',       to_char(bal.weight, 'FM999990.000'),
      'pcs',          bal.pcs::text,
      'shipper',      coalesce(bal.shipper, ''),
      'consignee',    coalesce(bal.consignee, ''),
      'vendor',       coalesce(bal.vendor, ''),
      'airline',      coalesce(bal.airline, ''),
      'service',      coalesce(bal.service, ''),
      'destination',  coalesce(bal.destination, '')
    ) order by bal.created_at asc
  ) into v_lines
  from public.bagging_awb_lines bal
  where bal.bagging_id = p_bagging_id
    and bal.tenant_id = v_tenant
    and bal.deleted_at is null;

  return jsonb_build_object(
    'id',                     v_header.id,
    'manifestNo',             v_header.manifest_no,
    'date',                   v_header.manifest_date::text,
    'originCity',             jsonb_build_object('code', coalesce(v_header.origin_city_code, ''), 'name', coalesce(v_header.origin_city_name, '')),
    'originCountry',          jsonb_build_object('code', coalesce(v_header.origin_country_code, ''), 'name', coalesce(v_header.origin_country_name, '')),
    'airlinesCode',           jsonb_build_object('code', coalesce(v_header.airlines_code, ''), 'name', coalesce(v_header.airlines_name, '')),
    'arrivalAirport',         coalesce(v_header.arrival_airport, ''),
    'masterAirlinesPrefix',   coalesce(v_header.master_airlines_prefix, ''),
    'masterAwbNoPart',        coalesce(v_header.master_awb_no_part, ''),
    'masterNoPart3',          coalesce(v_header.master_no_part3, ''),
    'mawbMasterNo',           coalesce(v_header.mawb_master_no, ''),
    'vendor',                 jsonb_build_object('code', coalesce(v_header.vendor_code, ''), 'name', coalesce(v_header.vendor_name, '')),
    'cdNo',                   coalesce(v_header.cd_no, ''),
    'ediMasterNo',            coalesce(v_header.edi_master_no, ''),
    'baggingRemark',          coalesce(v_header.bagging_remark, ''),
    'serviceCenter',          jsonb_build_object('code', coalesce(v_header.service_center_code, ''), 'name', coalesce(v_header.service_center_name, '')),
    'destCountry',            jsonb_build_object('code', coalesce(v_header.dest_country_code, ''), 'name', coalesce(v_header.dest_country_name, '')),
    'destCity',               jsonb_build_object('code', coalesce(v_header.dest_city_code, ''), 'name', coalesce(v_header.dest_city_name, '')),
    'flightNo1',              jsonb_build_object('code', coalesce(v_header.flight_no1_code, ''), 'name', coalesce(v_header.flight_no1_name, '')),
    'flightNo2',              jsonb_build_object('code', coalesce(v_header.flight_no2_code, ''), 'name', coalesce(v_header.flight_no2_name, '')),
    'arrivalDate',            coalesce(v_header.arrival_date::text, ''),
    'arrivalTime',            coalesce(v_header.arrival_time, ''),
    'destVendor',             jsonb_build_object('code', coalesce(v_header.dest_vendor_code, ''), 'name', coalesce(v_header.dest_vendor_name, '')),
    'isForwarding',           v_header.is_forwarding,
    'manifestType',           coalesce(v_header.manifest_type, ''),
    'transferToUk',           v_header.transfer_to_uk,
    'totalBags',              v_header.total_bags,
    'totalPieces',            v_header.total_pieces,
    'totalWeight',            to_char(v_header.total_weight, 'FM999990.000'),
    'totalAwbs',              v_header.total_awbs,
    'status',                 v_header.status,
    'awbLines',               coalesce(v_lines, '[]'::jsonb)
  );
end;
$$;

-- ---- Transfer marks both sides as a handover the other branch can see -----
create or replace function public.transfer_manifest_run(
  p_source_manifest_id uuid,
  p_dest_manifest_id uuid,
  p_bag_no text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_src public.manifests%rowtype;
  v_dest public.manifests%rowtype;
  v_src_bag public.bagging_manifests%rowtype;
  v_dest_bag public.bagging_manifests%rowtype;
  v_moved integer := 0;
begin
  if not app.user_has_permission(v_tenant, 'txn.manifest-scan', 'modify') then
    return jsonb_build_object('success', false, 'error', 'Manifest permission is required');
  end if;

  select * into v_src
  from public.manifests
  where id = p_source_manifest_id and tenant_id = v_tenant and deleted_at is null;

  select * into v_dest
  from public.manifests
  where id = p_dest_manifest_id and tenant_id = v_tenant and deleted_at is null;

  if v_src.id is null and v_dest.id is null then
    select * into v_src_bag
    from public.bagging_manifests
    where id = p_source_manifest_id and tenant_id = v_tenant and deleted_at is null;
    select * into v_dest_bag
    from public.bagging_manifests
    where id = p_dest_manifest_id and tenant_id = v_tenant and deleted_at is null;

    if v_src_bag.id is null or v_dest_bag.id is null then
      return jsonb_build_object('success', false, 'error', 'Source manifest not found');
    end if;
    if not app.user_has_permission(v_tenant, 'txn.bagging', 'modify') then
      return jsonb_build_object('success', false, 'error', 'Bagging permission is required');
    end if;
    if not app.manifest_branch_visible(v_src_bag.tenant_id, v_src_bag.service_center_id, v_src_bag.destination_branch_id, v_src_bag.is_handover) then
      return jsonb_build_object('success', false, 'error', 'Source manifest is outside your branch scope');
    end if;

    perform set_config('app.manifest_handover_transfer', 'on', true);
    update public.bagging_manifests
    set is_handover = true,
        destination_branch_id = v_src_bag.service_center_id,
        updated_at = now(),
        updated_by = auth.uid()
    where id = v_dest_bag.id and tenant_id = v_tenant;
    update public.bagging_manifests
    set is_handover = true,
        destination_branch_id = v_dest_bag.service_center_id,
        updated_at = now(),
        updated_by = auth.uid()
    where id = v_src_bag.id and tenant_id = v_tenant;
    perform set_config('app.manifest_handover_transfer', 'off', true);

    update public.bagging_awb_lines
    set bagging_id = v_dest_bag.id,
        updated_at = now(),
        updated_by = auth.uid()
    where tenant_id = v_tenant
      and bagging_id = v_src_bag.id
      and deleted_at is null
      and (p_bag_no is null or btrim(p_bag_no) = '' or bag_no = btrim(p_bag_no));
    get diagnostics v_moved = row_count;

    perform app.write_audit_log(
      v_tenant, 'bagging_manifests', 'MODIFY', v_src_bag.id, 'txn.bagging', null,
      jsonb_build_object(
        'event', 'MANIFEST_TRANSFER',
        'source_manifest_id', v_src_bag.id,
        'destination_manifest_id', v_dest_bag.id,
        'bag_no', p_bag_no,
        'moved_lines', v_moved
      )
    );
    return jsonb_build_object('success', true, 'transferred_count', greatest(v_moved, 1));
  end if;

  if v_src.id is null or v_dest.id is null then
    return jsonb_build_object('success', false, 'error', 'Source manifest not found');
  end if;

  if not app.manifest_branch_visible(v_src.tenant_id, v_src.origin_branch_id, v_src.destination_branch_id, v_src.is_handover) then
    return jsonb_build_object('success', false, 'error', 'Source manifest is outside your branch scope');
  end if;

  perform set_config('app.manifest_handover_transfer', 'on', true);

  update public.manifests
  set is_handover = true,
      destination_branch_id = v_src.origin_branch_id,
      updated_at = now(),
      updated_by = auth.uid()
  where id = v_dest.id and tenant_id = v_tenant;

  update public.manifests
  set is_handover = true,
      destination_branch_id = v_dest.origin_branch_id,
      updated_at = now(),
      updated_by = auth.uid()
  where id = v_src.id and tenant_id = v_tenant;

  perform set_config('app.manifest_handover_transfer', 'off', true);

  update public.manifest_lines
  set manifest_id = v_dest.id,
      updated_at = now(),
      updated_by = auth.uid()
  where tenant_id = v_tenant
    and manifest_id = v_src.id
    and deleted_at is null
    and (p_bag_no is null or btrim(p_bag_no) = '' or bag_no = btrim(p_bag_no));
  get diagnostics v_moved = row_count;

  perform app.write_audit_log(
    v_tenant, 'manifests', 'MODIFY', v_src.id, 'txn.manifest-scan', null,
    jsonb_build_object(
      'event', 'MANIFEST_TRANSFER',
      'source_manifest_id', v_src.id,
      'destination_manifest_id', v_dest.id,
      'bag_no', p_bag_no,
      'moved_lines', v_moved
    )
  );

  return jsonb_build_object('success', true, 'transferred_count', greatest(v_moved, 1));
end
$$;

revoke all on function public.transfer_manifest_run(uuid, uuid, text) from public;
grant execute on function public.transfer_manifest_run(uuid, uuid, text) to authenticated, service_role;
