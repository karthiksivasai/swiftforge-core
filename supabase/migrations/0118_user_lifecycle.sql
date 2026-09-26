-- ===========================================================================
-- 0118  User lifecycle: email identity, invitation, OTP login, audit fields
-- ---------------------------------------------------------------------------
-- Tenant resolution for email login requires one live normalized email across
-- the whole database. The same address cannot belong to two tenants.
-- Existing rows with a null email are left unchanged.
--
-- Rollback (only if 0118 objects are unused):
--   drop trigger if exists trg_users_email_normalized on public.users;
--   drop function if exists app.tg_users_email_normalized();
--   alter table public.password_reset_tokens drop constraint if exists password_reset_tokens_purpose_check;
--   alter table public.password_reset_tokens drop column if exists purpose;
--   drop index if exists users_email_normalized_uq;
--   drop index if exists users_tenant_email_uq;
--   alter table public.users
--     drop column if exists email_normalized,
--     drop column if exists user_subtype,
--     drop column if exists origin_id,
--     drop column if exists mobile_app_lens,
--     drop column if exists manifest_branch,
--     drop column if exists email_verified_at,
--     drop column if exists invitation_sent_at;
-- Do not drop public.users or auth identities.
-- ===========================================================================

alter table public.users
  add column if not exists user_subtype text,
  add column if not exists origin_id uuid,
  add column if not exists mobile_app_lens boolean not null default false,
  add column if not exists manifest_branch boolean not null default false,
  add column if not exists email_verified_at timestamptz,
  add column if not exists invitation_sent_at timestamptz,
  add column if not exists email_normalized text;

alter table public.users drop constraint if exists users_subtype_check;
alter table public.users
  add constraint users_subtype_check
  check (user_subtype is null or user_subtype in ('HUB', 'BRANCH'));

-- Mobile App Lens and Manifest Branch are stored for the User Setup form.
-- No operational rule is applied until the business meaning is confirmed.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_origin_fk'
  ) then
    alter table public.users
      add constraint users_origin_fk
      foreign key (tenant_id, origin_id)
      references public.destinations (tenant_id, id)
      on delete set null;
  end if;
end $$;

create or replace function app.tg_users_email_normalized()
returns trigger
language plpgsql
as $$
begin
  if new.email is null or btrim(new.email) = '' then
    new.email_normalized := null;
  else
    new.email_normalized := lower(btrim(new.email));
  end if;
  return new;
end
$$;

drop trigger if exists trg_users_email_normalized on public.users;
create trigger trg_users_email_normalized
  before insert or update of email, email_normalized on public.users
  for each row execute function app.tg_users_email_normalized();

update public.users
set email = email
where email is not null and btrim(email) <> '';

do $$
declare
  v_dup integer;
begin
  select count(*) into v_dup
  from (
    select email_normalized
    from public.users
    where deleted_at is null
      and email_normalized is not null
    group by email_normalized
    having count(*) > 1
  ) d;
  if v_dup > 0 then
    raise exception
      'Migration 0118 stopped: % duplicate live email addresses. Keep one user per email, then run this migration again.',
      v_dup;
  end if;
end $$;

create unique index if not exists users_email_normalized_uq
  on public.users (email_normalized)
  where deleted_at is null and email_normalized is not null;

create unique index if not exists users_tenant_email_uq
  on public.users (tenant_id, email_normalized)
  where deleted_at is null and email_normalized is not null;

alter table public.password_reset_tokens
  add column if not exists purpose text not null default 'RESET';

alter table public.password_reset_tokens drop constraint if exists password_reset_tokens_purpose_check;
alter table public.password_reset_tokens
  add constraint password_reset_tokens_purpose_check
  check (purpose in ('RESET', 'INVITE'));

create index if not exists password_reset_tokens_hash_idx
  on public.password_reset_tokens (token_hash)
  where used_at is null;

create index if not exists otp_challenges_user_created_idx
  on public.otp_challenges (user_id, created_at desc);
