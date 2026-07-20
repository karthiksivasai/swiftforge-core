-- ===========================================================================
-- 0069  Expense heads: CourierWala authorisation / document fields
-- ---------------------------------------------------------------------------
-- List: Name | Is Authorized
-- Form: Expense Type (kind), Expense Head, Authorisation Required,
--       Authorised By HO/Branch Amount, Document Required (+ amount)
-- ===========================================================================

alter table public.expense_heads
  add column if not exists authorization_required boolean not null default true,
  add column if not exists authorized_ho_amount numeric(14,2) not null default 0
    check (authorized_ho_amount >= 0),
  add column if not exists authorized_branch_amount numeric(14,2) not null default 0
    check (authorized_branch_amount >= 0),
  add column if not exists document_required boolean not null default true,
  add column if not exists document_required_amount numeric(14,2) not null default 0
    check (document_required_amount >= 0);

comment on column public.expense_heads.authorization_required is
  'CourierWala Authorisation Required (Yes/No).';
comment on column public.expense_heads.authorized_ho_amount is
  'Authorised By HO Amount threshold.';
comment on column public.expense_heads.authorized_branch_amount is
  'Authorised By Branch Amount threshold.';
comment on column public.expense_heads.document_required is
  'CourierWala Document Required (Yes/No).';
comment on column public.expense_heads.document_required_amount is
  'Document Required For Amount threshold.';

-- Soft-delete uses UPDATE; ensure delete permission can soft-delete via modify/delete.
drop policy if exists expense_heads_delete on public.expense_heads;
create policy expense_heads_delete on public.expense_heads
  for delete using (
    tenant_id in (select app.user_tenant_ids())
    and (
      app.user_has_permission(tenant_id, 'mst.expense-master', 'delete')
      or app.user_has_permission(tenant_id, 'mst.expense-master', 'modify')
    )
  );
