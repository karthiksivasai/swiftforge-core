-- ===========================================================================
-- 0134  Invoice, debit note, and credit note writes follow the form grant.
-- ---------------------------------------------------------------------------
-- 0133 gated SELECT on List. These tables had no INSERT/UPDATE/DELETE
-- policies, so Add, Modify, and Delete grants could not be enforced: every
-- direct write was rejected. The write now requires the same form slug.
-- ===========================================================================

do $writes$
declare
  r record;
begin
  for r in
    select *
    from (values
      ('invoices', 'doc.generate-invoice'),
      ('debit_notes', 'txn.debit-note'),
      ('credit_notes', 'txn.credit-note')
    ) as forms(tbl, slug)
  loop
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = r.tbl
    ) then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', r.tbl);
    execute format('drop policy if exists %I on public.%I', r.tbl || '_insert', r.tbl);
    execute format('drop policy if exists %I on public.%I', r.tbl || '_update', r.tbl);
    execute format('drop policy if exists %I on public.%I', r.tbl || '_delete', r.tbl);

    execute format(
      $pol$create policy %I on public.%I
        for insert with check (
          tenant_id in (select app.user_tenant_ids())
          and app.user_has_permission(tenant_id, %L, 'add')
        )$pol$,
      r.tbl || '_insert', r.tbl, r.slug
    );
    execute format(
      $pol$create policy %I on public.%I
        for update using (
          tenant_id in (select app.user_tenant_ids())
          and app.user_has_permission(tenant_id, %L, 'modify')
        )
        with check (
          tenant_id in (select app.user_tenant_ids())
          and app.user_has_permission(tenant_id, %L, 'modify')
        )$pol$,
      r.tbl || '_update', r.tbl, r.slug, r.slug
    );
    execute format(
      $pol$create policy %I on public.%I
        for delete using (
          tenant_id in (select app.user_tenant_ids())
          and app.user_has_permission(tenant_id, %L, 'delete')
        )$pol$,
      r.tbl || '_delete', r.tbl, r.slug
    );
  end loop;
end
$writes$;

notify pgrst, 'reload schema';

select c.relname as table_name, pol.polname, pol.polcmd
from pg_policy pol
join pg_class c on c.oid = pol.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('invoices', 'debit_notes', 'credit_notes')
  and pol.polcmd in ('a', 'w', 'd')
order by c.relname, pol.polcmd;
