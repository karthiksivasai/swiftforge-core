-- ===========================================================================
-- catalog_masters_verification.sql — proves Phase 3 Catalog Masters (0018).
-- ---------------------------------------------------------------------------
-- Runs in a transaction that ROLLS BACK. Execute as a privileged role:
--   psql "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/catalog_masters_verification.sql
--
-- Proves, for the nine simple catalog masters, that they reuse the frozen
-- framework EXACTLY as the geo slice does:
--   * all nine tables exist, have RLS enabled, and both touch + audit triggers
--   * import_master extends to flat catalogs (banks) with VALIDATE/COMMIT/idem
--   * Product Type is the single source of truth: products.product_type_id is a
--     composite (tenant_id, id) FK resolved by product_type_code on import
--   * enum/bool normalization (delivery_exceptions exc_type hyphen/case; product
--     shipment_type/status/group_type)
--   * lookup extends with `product-type` and `product` keys (product = ACTIVE only)
--   * optimistic locking (stale row_version affects 0 rows) on a catalog table
-- ===========================================================================
\set ON_ERROR_STOP on
begin;

-- ---------- fixtures: auth user + bootstrapped tenant + admin ------------
insert into auth.users (id, aud, role, email) values
  ('55555555-eeee-4eee-8eee-0000000000a1','authenticated','authenticated','catadm@a.test')
on conflict (id) do nothing;

do $$
declare v_t uuid;
begin
  v_t := app.bootstrap_tenant('cat-a', 'Catalog Tenant A', 'CatA');
  perform app.link_tenant_admin(v_t, '55555555-eeee-4eee-8eee-0000000000a1',
          'catadm', 'Catalog Admin', 'catadm@a.test');
  perform set_config('cat.tenant', v_t::text, false);
end $$;

-- =======================================================================
-- 0) Structure: nine tables exist, RLS on, touch + audit triggers wired
-- =======================================================================
do $$
declare
  v_tbl text;
  v_tbls text[] := array[
    'product_types','products','banks','industries','contents',
    'instructions','sales_executives','flights','delivery_exceptions'];
begin
  foreach v_tbl in array v_tbls loop
    if to_regclass('public.' || v_tbl) is null then
      raise exception 'FAIL [table]: public.% missing', v_tbl;
    end if;
    if not (select relrowsecurity from pg_class where oid = ('public.' || v_tbl)::regclass) then
      raise exception 'FAIL [rls]: RLS not enabled on public.%', v_tbl;
    end if;
    if (select count(*) from pg_trigger
          where tgrelid = ('public.' || v_tbl)::regclass
            and tgname in ('trg_touch_' || v_tbl, 'trg_audit_' || v_tbl)) <> 2 then
      raise exception 'FAIL [triggers]: touch+audit triggers missing on public.%', v_tbl;
    end if;
    if (select count(*) from pg_policies
          where schemaname = 'public' and tablename = v_tbl) < 4 then
      raise exception 'FAIL [policies]: expected >=4 RLS policies on public.%', v_tbl;
    end if;
  end loop;
  raise notice 'PASS [structure]: 9 catalog tables, RLS + touch/audit triggers + policies';
end $$;

-- Act as the tenant admin for all RPC calls + assertions.
set local role authenticated;
set local request.jwt.claim.sub = '55555555-eeee-4eee-8eee-0000000000a1';

-- =======================================================================
-- 1) Flat catalog (banks): VALIDATE dry-run, then COMMIT + idempotency
-- =======================================================================
do $$
declare v_res jsonb;
begin
  v_res := public.import_master('banks', 'VALIDATE', $j$[
    {"code":"AXI","name":"AXIS BANK","status":"ACTIVE"},
    {"code":"KOT","name":"KOTAK","status":"INACTIVE"},
    {"name":"NoCode"}
  ]$j$::jsonb);
  if (v_res->>'ok')::int <> 2 or (v_res->>'error_count')::int <> 1 then
    raise exception 'FAIL [banks-validate]: %', v_res;
  end if;
  if (select count(*) from public.banks where tenant_id = current_setting('cat.tenant')::uuid) <> 0 then
    raise exception 'FAIL [banks-validate-write]: VALIDATE inserted rows';
  end if;

  v_res := public.import_master('banks', 'COMMIT', $j$[
    {"code":"AXI","name":"AXIS BANK","status":"ACTIVE"},
    {"code":"KOT","name":"KOTAK","status":"INACTIVE"},
    {"name":"NoCode"}
  ]$j$::jsonb);
  if (v_res->>'ok')::int <> 2 or (v_res->>'error_count')::int <> 1 then
    raise exception 'FAIL [banks-commit]: %', v_res;
  end if;
  if (select count(*) from public.banks where tenant_id = current_setting('cat.tenant')::uuid) <> 2 then
    raise exception 'FAIL [banks-commit-rows]: expected 2 banks';
  end if;
  if (select status from public.banks
        where tenant_id = current_setting('cat.tenant')::uuid and code = 'KOT') <> 'INACTIVE' then
    raise exception 'FAIL [banks-enum]: status not normalized to INACTIVE';
  end if;

  -- idempotent re-commit
  v_res := public.import_master('banks', 'COMMIT', $j$[
    {"code":"AXI","name":"AXIS BANK"}
  ]$j$::jsonb);
  if (v_res->>'ok')::int <> 0 or (v_res->>'skipped')::int <> 1 then
    raise exception 'FAIL [banks-idem]: re-import not skipped: %', v_res;
  end if;
  raise notice 'PASS [banks]: validate/commit/enum/idempotency';
end $$;

-- =======================================================================
-- 2) Product Type is the source of truth: products.product_type_id is a
--    composite FK resolved from product_type_code on import.
-- =======================================================================
do $$
declare v_res jsonb; v_pt_d uuid; v_pt_i uuid;
begin
  -- seed the product type master
  v_res := public.import_master('product_types', 'COMMIT', $j$[
    {"code":"D","name":"Domestic"},
    {"code":"I","name":"International"}
  ]$j$::jsonb);
  if (v_res->>'ok')::int <> 2 then
    raise exception 'FAIL [ptype-commit]: %', v_res;
  end if;
  select id into v_pt_d from public.product_types
    where tenant_id = current_setting('cat.tenant')::uuid and code = 'D';
  select id into v_pt_i from public.product_types
    where tenant_id = current_setting('cat.tenant')::uuid and code = 'I';

  -- import products: valid FK (D, I), a no-type row (null allowed), unknown -> error
  v_res := public.import_master('products', 'COMMIT', $j$[
    {"code":"DOX","name":"Documents","product_type_code":"I","shipment_type":"DOX","status":"ACTIVE","group_type":"AIR"},
    {"code":"GRMT","name":"Garments","product_type_code":"D","shipment_type":"NDOX","status":"ACTIVE","group_type":"SURFACE","fuel_charge":"yes"},
    {"code":"MISC","name":"No Type"},
    {"code":"BAD","name":"Bad Type","product_type_code":"ZZ"}
  ]$j$::jsonb);
  if (v_res->>'ok')::int <> 3 or (v_res->>'error_count')::int <> 1 then
    raise exception 'FAIL [products-counts]: %', v_res;
  end if;
  if (select product_type_id from public.products
        where tenant_id = current_setting('cat.tenant')::uuid and code = 'DOX')
     is distinct from v_pt_i then
    raise exception 'FAIL [products-fk]: DOX.product_type_id did not resolve to International';
  end if;
  if (select product_type_id from public.products
        where tenant_id = current_setting('cat.tenant')::uuid and code = 'GRMT')
     is distinct from v_pt_d then
    raise exception 'FAIL [products-fk]: GRMT.product_type_id did not resolve to Domestic';
  end if;
  if (select product_type_id from public.products
        where tenant_id = current_setting('cat.tenant')::uuid and code = 'MISC') is not null then
    raise exception 'FAIL [products-null-fk]: MISC should have null product_type_id';
  end if;
  if (select fuel_charge from public.products
        where tenant_id = current_setting('cat.tenant')::uuid and code = 'GRMT') is not true then
    raise exception 'FAIL [products-bool]: fuel_charge "yes" not normalized to true';
  end if;
  if exists (select 1 from public.products
        where tenant_id = current_setting('cat.tenant')::uuid and code = 'BAD') then
    raise exception 'FAIL [products-bad-fk]: row with unknown product_type_code was inserted';
  end if;
  raise notice 'PASS [products]: composite FK by code; null allowed; bool norm; unknown -> error';
end $$;

-- =======================================================================
-- 3) A product type in use cannot be hard-deleted (FK restrict) — proves
--    the source-of-truth relationship is enforced at the DB level.
-- =======================================================================
do $$
declare v_pt_i uuid;
begin
  select id into v_pt_i from public.product_types
    where tenant_id = current_setting('cat.tenant')::uuid and code = 'I';
  begin
    delete from public.product_types where id = v_pt_i;
    raise exception 'FAIL [ptype-fk-restrict]: deleted a referenced product type';
  exception when foreign_key_violation then
    raise notice 'PASS [ptype-fk-restrict]: referenced product type delete blocked';
  end;
end $$;

-- =======================================================================
-- 4) delivery_exceptions: exc_type hyphen/case normalization + defaults
-- =======================================================================
do $$
declare v_res jsonb;
begin
  v_res := public.import_master('delivery_exceptions', 'COMMIT', $j$[
    {"code":"ok","name":"Delivered","exc_type":"Delivered","inscan":"yes"},
    {"code":"un","name":"Undelivered","exc_type":"Un-Delivered"},
    {"code":"df","name":"Defaulted"}
  ]$j$::jsonb);
  if (v_res->>'ok')::int <> 3 then
    raise exception 'FAIL [exc-commit]: %', v_res;
  end if;
  if (select exc_type from public.delivery_exceptions
        where tenant_id = current_setting('cat.tenant')::uuid and code = 'OK') <> 'DELIVERED' then
    raise exception 'FAIL [exc-delivered]: "Delivered" not normalized';
  end if;
  if (select exc_type from public.delivery_exceptions
        where tenant_id = current_setting('cat.tenant')::uuid and code = 'UN') <> 'UNDELIVERED' then
    raise exception 'FAIL [exc-hyphen]: "Un-Delivered" not normalized to UNDELIVERED';
  end if;
  if (select exc_type from public.delivery_exceptions
        where tenant_id = current_setting('cat.tenant')::uuid and code = 'DF') <> 'UNDELIVERED' then
    raise exception 'FAIL [exc-default]: missing exc_type not defaulted to UNDELIVERED';
  end if;
  raise notice 'PASS [delivery_exceptions]: exc_type hyphen/case normalization + default';
end $$;

-- =======================================================================
-- 5) lookup extends with product-type + product (product = ACTIVE only)
-- =======================================================================
do $$
declare n int;
begin
  select count(*) into n from public.lookup('product-type', 'dom', 50);
  if n <> 1 then
    raise exception 'FAIL [lookup-ptype]: expected 1 match for "dom", got %', n;
  end if;

  -- add an INACTIVE product; it must NOT appear in the product lookup
  perform public.import_master('products', 'COMMIT', $j$[
    {"code":"OLD","name":"Retired","status":"INACTIVE"}
  ]$j$::jsonb);
  if exists (select 1 from public.lookup('product', 'Retired', 50)) then
    raise exception 'FAIL [lookup-product-active]: INACTIVE product appeared in lookup';
  end if;
  if not exists (select 1 from public.lookup('product', 'Documents', 50)) then
    raise exception 'FAIL [lookup-product]: ACTIVE product missing from lookup';
  end if;
  raise notice 'PASS [lookup]: product-type + product keys (product = ACTIVE only)';
end $$;

-- =======================================================================
-- 6) Optimistic locking on a catalog table (banks): stale rv -> 0 rows
-- =======================================================================
do $$
declare v_id uuid; v_rv integer;
begin
  select id, row_version into v_id, v_rv from public.banks
    where tenant_id = current_setting('cat.tenant')::uuid and code = 'AXI';
  update public.banks set name = 'AXIS BANK LTD' where id = v_id and row_version = v_rv;
  if not found then
    raise exception 'FAIL [optlock-current]: current row_version update did not match';
  end if;
  update public.banks set name = 'STALE' where id = v_id and row_version = v_rv;  -- stale now
  if found then
    raise exception 'FAIL [optlock-stale]: stale row_version update unexpectedly matched';
  end if;
  raise notice 'PASS [optlock]: current rv updates; stale rv affects 0 rows';
end $$;

reset role;

do $$
begin
  raise notice '==========================================================';
  raise notice 'CATALOG MASTERS VERIFICATION PASSED: structure/import/FK/lookup.';
  raise notice '==========================================================';
end $$;

rollback;
