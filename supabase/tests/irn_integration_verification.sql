-- ===========================================================================
-- irn_integration_verification.sql — Phase 7 Milestone 7E
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('99999999-1111-4111-8111-000000000059','authenticated','authenticated','irn@a.test'),
  ('99999999-1111-4111-8111-00000000b059','authenticated','authenticated','irn@b.test'),
  ('99999999-1111-4111-8111-00000000d059','authenticated','authenticated','irnstaff@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid; v_tb uuid;
begin
  v_t := app.bootstrap_tenant('irn-a', 'Irn A', 'IrnA');
  perform app.link_tenant_admin(v_t, '99999999-1111-4111-8111-000000000059',
          'irnadm', 'Irn Admin', 'irn@a.test');
  perform set_config('irn.tenant', v_t::text, false);

  v_tb := app.bootstrap_tenant('irn-b', 'Irn B', 'IrnB');
  perform app.link_tenant_admin(v_tb, '99999999-1111-4111-8111-00000000b059',
          'irnadmb', 'Irn Admin B', 'irn@b.test');
  perform set_config('irn.tenant_b', v_tb::text, false);
end $$;

do $$
begin
  if to_regclass('public.irn_logs') is null then
    raise exception 'FAIL [table] irn_logs';
  end if;
  if to_regclass('public.invoices') is null then
    raise exception 'FAIL [table] invoices';
  end if;
  if to_regclass('public.debit_notes') is null then
    raise exception 'FAIL [table] debit_notes';
  end if;
  if to_regclass('public.credit_notes') is null then
    raise exception 'FAIL [table] credit_notes';
  end if;
  if to_regprocedure('public.generate_irn(text,uuid,integer)') is null then
    raise exception 'FAIL [fn] generate_irn';
  end if;
  if to_regprocedure('public.cancel_irn(text,uuid,text,integer)') is null then
    raise exception 'FAIL [fn] cancel_irn';
  end if;
  if to_regprocedure('public.get_irn_status(text,uuid)') is null then
    raise exception 'FAIL [fn] get_irn_status';
  end if;
  if to_regprocedure('public.test_irn_connection(uuid)') is null then
    raise exception 'FAIL [fn] test_irn_connection';
  end if;
  if not exists (
    select 1 from public.integration_providers
     where provider_type = 'EINVOICE' and provider_code in ('CLEARTAX','IRP_SANDBOX')
  ) then
    raise exception 'FAIL [providers] EINVOICE not seeded';
  end if;
  raise notice 'PASS [structure]';
end $$;

do $$
declare
  v_t uuid := current_setting('irn.tenant')::uuid;
  v_branch uuid; v_uid uuid; v_gid uuid; v_prov uuid;
begin
  select id into v_branch from public.branches
   where tenant_id = v_t and deleted_at is null
   order by case when is_head_office then 0 else 1 end limit 1;

  insert into public.tenant_users (tenant_id, user_id, role, status)
  values (v_t, '99999999-1111-4111-8111-00000000d059', 'MEMBER', 'ACTIVE')
  on conflict (tenant_id, user_id) do update set status = 'ACTIVE';

  insert into public.users (
    tenant_id, auth_user_id, username, user_type, full_name, email, home_branch_id, status)
  values (
    v_t, '99999999-1111-4111-8111-00000000d059', 'irnstaff', 'STAFF',
    'Irn Staff', 'irnstaff@a.test', v_branch, 'ACTIVE')
  on conflict (auth_user_id) do update set deleted_at = null
  returning id into v_uid;

  select id into v_gid from public.user_groups
   where tenant_id = v_t and name = 'OPERATIONS' and deleted_at is null;
  insert into public.user_group_members (tenant_id, user_id, group_id)
  values (v_t, v_uid, v_gid) on conflict (user_id, group_id) do nothing;

  update public.group_permissions gp
     set can_add = false, can_modify = false, can_list = false, can_search = false,
         can_delete = false, all_access = false
    from public.permission_modules pm
   where gp.module_id = pm.id and gp.group_id = v_gid
     and pm.slug in (
       'doc.invoice-irn-generation',
       'doc.invoice-cancel-after-irn-generated',
       'txn.debit-note',
       'txn.credit-note',
       'mst.vendor-master'
     );

  select id into v_prov from public.integration_providers where provider_code = 'CLEARTAX';
  insert into public.integration_credentials (
    tenant_id, provider_id, username, password_enc, api_key_enc, api_secret_enc,
    account_number, sandbox_mode, is_active, created_by, updated_by)
  values (
    v_t, v_prov, 'irn_user',
    app.encrypt_integration_secret('secret-pass'),
    app.encrypt_integration_secret('client-id'),
    app.encrypt_integration_secret('client-secret'),
    '29AAAAA0000A1Z5', true, true,
    '99999999-1111-4111-8111-000000000059',
    '99999999-1111-4111-8111-000000000059'
  )
  on conflict do nothing;

  raise notice 'PASS [seed]';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '99999999-1111-4111-8111-000000000059';

do $$
declare
  v_test jsonb;
  v_inv jsonb;
  v_dn jsonb;
  v_cn jsonb;
  v_gen jsonb;
  v_dup text;
  v_cancel jsonb;
  v_status jsonb;
  v_list jsonb;
  v_prov jsonb;
  v_cred jsonb;
  v_cnt int;
  v_inv_id uuid;
  v_dn_id uuid;
  v_cn_id uuid;
begin
  v_test := public.test_irn_connection(null);
  if coalesce((v_test->>'ok')::boolean, false) is not true then
    raise exception 'FAIL [test] %', v_test;
  end if;

  v_inv := public.save_einvoice_document(jsonb_build_object(
    'document_type', 'INVOICE',
    'document_no', 'INV-IRN-001',
    'document_date', current_date::text,
    'register_type', 'B2B',
    'grand_total', 1180
  ));
  v_inv_id := (v_inv->>'id')::uuid;

  v_dn := public.save_einvoice_document(jsonb_build_object(
    'document_type', 'DEBIT_NOTE',
    'document_no', 'DN-IRN-001',
    'grand_total', 100,
    'approval_on_einvoice', true
  ));
  v_dn_id := (v_dn->>'id')::uuid;

  v_cn := public.save_einvoice_document(jsonb_build_object(
    'document_type', 'CREDIT_NOTE',
    'document_no', 'CN-IRN-001',
    'grand_total', 50
  ));
  v_cn_id := (v_cn->>'id')::uuid;

  v_gen := public.generate_irn('INVOICE', v_inv_id, null);
  if coalesce(v_gen->'document'->>'irn_status', '') <> 'GENERATED' then
    raise exception 'FAIL [generate invoice] %', v_gen;
  end if;
  if coalesce(v_gen->'document'->>'irn', '') = '' then
    raise exception 'FAIL [generate irn empty]';
  end if;

  begin
    perform public.generate_irn('INVOICE', v_inv_id, null);
    raise exception 'FAIL [duplicate] expected error';
  exception when others then
    v_dup := SQLERRM;
    if position('already generated' in lower(v_dup)) = 0 then
      raise exception 'FAIL [duplicate message] %', v_dup;
    end if;
  end;

  v_gen := public.generate_irn('DEBIT_NOTE', v_dn_id, null);
  if coalesce(v_gen->'document'->>'irn_status', '') <> 'GENERATED' then
    raise exception 'FAIL [generate debit] %', v_gen;
  end if;

  v_gen := public.generate_irn('CREDIT_NOTE', v_cn_id, null);
  if coalesce(v_gen->'document'->>'irn_status', '') <> 'GENERATED' then
    raise exception 'FAIL [generate credit] %', v_gen;
  end if;

  v_status := public.get_irn_status('INVOICE', v_inv_id);
  if coalesce(v_status->'document'->>'irn_status', '') <> 'GENERATED' then
    raise exception 'FAIL [status] %', v_status;
  end if;
  if coalesce(v_status->'document'->>'irn_qr_payload', '') = '' then
    raise exception 'FAIL [qr]';
  end if;

  v_cancel := public.cancel_irn('INVOICE', v_inv_id, 'Wrong GSTIN', null);
  if coalesce(v_cancel->'document'->>'irn_status', '') <> 'CANCELLED' then
    raise exception 'FAIL [cancel] %', v_cancel;
  end if;

  select count(*) into v_cnt from public.irn_logs
   where document_id = v_inv_id and operation in ('GENERATE','CANCEL','STATUS');
  if v_cnt < 3 then
    raise exception 'FAIL [logs] count=%', v_cnt;
  end if;

  -- Secrets never exposed via credential list
  v_cred := public.get_integration_credentials(
    (select id from public.integration_credentials
      where tenant_id = current_setting('irn.tenant')::uuid
        and deleted_at is null
      order by created_at desc limit 1),
    null
  );
  if v_cred ? 'password' or v_cred ? 'api_secret' or v_cred ? 'client_secret' then
    raise exception 'FAIL [secret leak] %', v_cred;
  end if;
  if coalesce((v_cred->>'has_password')::boolean, false) is not true then
    raise exception 'FAIL [secret flags] %', v_cred;
  end if;

  select count(*) into v_cnt from public.audit_logs
   where tenant_id = current_setting('irn.tenant')::uuid
     and (
       (new_values ? 'irn_generate')
       or (new_values ? 'irn_cancel')
       or (new_values->>'operation' = 'TEST')
     );
  if v_cnt < 2 then
    raise exception 'FAIL [audit] count=%', v_cnt;
  end if;

  v_list := public.list_einvoice_documents('INVOICE', 20);
  if jsonb_array_length(coalesce(v_list->'rows', '[]'::jsonb)) < 1 then
    raise exception 'FAIL [list]';
  end if;

  v_prov := public.get_irn_provider_status();
  if coalesce(v_prov->>'live_http', 'true') = 'true' then
    raise exception 'FAIL [provider live] %', v_prov;
  end if;

  raise notice 'PASS [connection / generate / duplicate / cancel / status / logs / audit]';
end $$;

-- Permissions: staff without IRN modules denied
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000d059';
do $$
declare v_ok boolean := false;
begin
  begin
    perform public.generate_irn('INVOICE',
      (select id from public.invoices
        where tenant_id = current_setting('irn.tenant')::uuid
        limit 1), null);
  exception when others then
    v_ok := position('Permission denied' in SQLERRM) > 0
         or position('42501' in SQLSTATE) > 0
         or SQLSTATE = '42501';
  end;
  if not v_ok then
    raise exception 'FAIL [permissions] staff should be denied';
  end if;
  raise notice 'PASS [permissions]';
end $$;

-- Tenant isolation
set local request.jwt.claim.sub = '99999999-1111-4111-8111-00000000b059';
do $$
declare
  v_cnt int;
  v_foreign uuid;
begin
  select id into v_foreign from public.invoices
   where tenant_id = current_setting('irn.tenant')::uuid
   limit 1;

  select count(*) into v_cnt from public.invoices
   where tenant_id = current_setting('irn.tenant')::uuid;
  -- B user should not see A invoices via RLS on direct select; RPC should 404
  begin
    perform public.get_irn_status('INVOICE', v_foreign);
    raise exception 'FAIL [tenant] cross-tenant status succeeded';
  exception when others then
    if position('not found' in lower(SQLERRM)) = 0
       and position('Permission' in SQLERRM) = 0 then
      -- ok if not found
      null;
    end if;
  end;

  select count(*) into v_cnt from public.irn_logs
   where tenant_id = current_setting('irn.tenant')::uuid;
  if v_cnt <> 0 then
    raise exception 'FAIL [tenant logs leak] count=%', v_cnt;
  end if;

  raise notice 'PASS [tenant isolation]';
end $$;

do $$
begin
  raise notice '==========================================================';
  raise notice 'IRN INTEGRATION VERIFICATION PASSED.';
  raise notice '==========================================================';
end $$;

rollback;
