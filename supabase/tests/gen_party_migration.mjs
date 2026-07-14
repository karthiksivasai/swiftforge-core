// Generates supabase/migrations/0022_party_masters_simple.sql by extending 0020.
// Run: node supabase/tests/gen_party_migration.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url).pathname;
const src = readFileSync(new URL("../migrations/0020_catalog_masters_aggregate.sql", import.meta.url), "utf8");

const importStart = src.indexOf("-- EXTEND public.import_master (0016/0018/0019)");
const importEnd = src.indexOf("grant execute on function public.import_master", importStart);
let importBlock = src.slice(importStart, importEnd);

importBlock = importBlock.replace(
  "-- EXTEND public.import_master (0016/0018/0019)",
  "-- EXTEND public.import_master (0016–0021) — all prior branches kept verbatim; party\n-- branches (consignees, shippers) appended.",
);
importBlock = importBlock.replace(
  `    when 'field_executives'    then 'mst.field-executive-master'\n    else null end;`,
  `    when 'field_executives'    then 'mst.field-executive-master'\n    -- party simple (0022)\n    when 'consignees'          then 'mst.consignee-master'\n    when 'shippers'            then 'mst.shipper-master'\n    else null end;`,
);
importBlock = importBlock.replace(
  `    when 'field_executives' then\n      v_map_service_centers := app.import_build_code_map(v_tenant, 'service_centers',\n        app.import_distinct_codes(p_rows, array['service_center_code']));\n      v_map_destinations := app.import_build_code_map(v_tenant, 'destinations',\n        app.import_distinct_codes(p_rows, array['destination_code']));\n    else`,
  `    when 'field_executives' then\n      v_map_service_centers := app.import_build_code_map(v_tenant, 'service_centers',\n        app.import_distinct_codes(p_rows, array['service_center_code']));\n      v_map_destinations := app.import_build_code_map(v_tenant, 'destinations',\n        app.import_distinct_codes(p_rows, array['destination_code']));\n    when 'consignees', 'shippers' then\n      v_map_states := app.import_build_code_map(v_tenant, 'states',\n        app.import_distinct_codes(p_rows, array['state_code']));\n      v_map_countries := app.import_build_code_map(v_tenant, 'countries',\n        app.import_distinct_codes(p_rows, array['country_code']));\n    else`,
);

const partyImportArms = `
      -- --------------------------- PARTY (0022) ------------------------
      -- TODO(catalog-split): move to app.import_consignees(v_tenant, v_row, v_map_states, v_map_countries).
      when 'consignees' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        if coalesce(btrim(v_row->>'mobile'),'') = '' then v_col:='mobile'; raise exception using errcode='CMS01', message='Mobile is required'; end if;
        v_col := 'state_code'; v_state := app.import_lookup(v_map_states, v_row->>'state_code', 'State code');
        v_col := 'country_code'; v_country := app.import_lookup(v_map_countries, v_row->>'country_code', 'Country code');
        v_col := null;
        insert into public.consignees
          (tenant_id, code, name, customer_name, mobile, email, address, pin_code, city,
           state_id, country_id, status)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'),
                nullif(btrim(coalesce(v_row->>'customer_name', v_row->>'customer','')),''),
                btrim(v_row->>'mobile'),
                nullif(btrim(coalesce(v_row->>'email','')),''),
                nullif(btrim(coalesce(v_row->>'address','')),''),
                nullif(btrim(coalesce(v_row->>'pin_code', v_row->>'pincode','')),''),
                nullif(btrim(coalesce(v_row->>'city','')),''),
                v_state, v_country,
                app.norm_enum(v_row->>'status', array['ACTIVE','INACTIVE'], 'Status', 'ACTIVE'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;

      -- TODO(catalog-split): move to app.import_shippers(v_tenant, v_row, v_map_states, v_map_countries).
      when 'shippers' then
        if coalesce(btrim(v_row->>'code'),'') = '' then v_col:='code'; raise exception using errcode='CMS01', message='Code is required'; end if;
        if coalesce(btrim(v_row->>'name'),'') = '' then v_col:='name'; raise exception using errcode='CMS01', message='Name is required'; end if;
        if coalesce(btrim(v_row->>'mobile'),'') = '' then v_col:='mobile'; raise exception using errcode='CMS01', message='Mobile is required'; end if;
        v_col := 'state_code'; v_state := app.import_lookup(v_map_states, v_row->>'state_code', 'State code');
        v_col := 'country_code'; v_country := app.import_lookup(v_map_countries, v_row->>'country_code', 'Country code');
        v_col := null;
        insert into public.shippers
          (tenant_id, code, name, customer_name, mobile, email, address, pin_code, city,
           state_id, country_id, status)
        values (v_tenant, btrim(v_row->>'code'), btrim(v_row->>'name'),
                nullif(btrim(coalesce(v_row->>'customer_name', v_row->>'customer','')),''),
                btrim(v_row->>'mobile'),
                nullif(btrim(coalesce(v_row->>'email','')),''),
                nullif(btrim(coalesce(v_row->>'address','')),''),
                nullif(btrim(coalesce(v_row->>'pin_code', v_row->>'pincode','')),''),
                nullif(btrim(coalesce(v_row->>'city','')),''),
                v_state, v_country,
                app.norm_enum(v_row->>'status', array['ACTIVE','INACTIVE'], 'Status', 'ACTIVE'))
        on conflict (tenant_id, code) where deleted_at is null do nothing;
`;

importBlock = importBlock.replace(
  `        on conflict (tenant_id, code) where deleted_at is null do nothing;\n\n      end case;`,
  `        on conflict (tenant_id, code) where deleted_at is null do nothing;${partyImportArms}\n      end case;`,
);
importBlock = importBlock.replace(
  `'Reusable master CSV import (geo + catalog incl. charges/airlines/service_centers/field_executives):`,
  `'Reusable master CSV import (geo + catalog + party incl. consignees/shippers):`,
);

const lookupStart = src.indexOf("-- EXTEND public.lookup (0017/0018/0019)");
const lookupEnd = src.indexOf("grant execute on function public.lookup", lookupStart);
let lookupBlock = src.slice(lookupStart, lookupEnd);
lookupBlock = lookupBlock.replace(
  "-- EXTEND public.lookup (0017/0018/0019)",
  "-- EXTEND public.lookup (0017–0021) — all prior keys kept verbatim; party keys appended.",
);
const partyLookup = `
  -- --------------------------- PARTY (0022) ------------------------
  elsif p_key = 'consignee' then
    return query
      select c.id, c.code, c.name, c.city
      from public.consignees c
      where c.tenant_id in (select app.user_tenant_ids())
        and c.deleted_at is null
        and c.status = 'ACTIVE'
        and (c.name ilike v_pat or c.code ilike v_pat)
      order by c.name, c.code, c.id
      limit v_limit;

  elsif p_key = 'shipper' then
    return query
      select s.id, s.code, s.name, s.city
      from public.shippers s
      where s.tenant_id in (select app.user_tenant_ids())
        and s.deleted_at is null
        and s.status = 'ACTIVE'
        and (s.name ilike v_pat or s.code ilike v_pat)
      order by s.name, s.code, s.id
      limit v_limit;
`;
lookupBlock = lookupBlock.replace("\n  else\n    raise exception", partyLookup + "\n  else\n    raise exception");
lookupBlock = lookupBlock.replace(
  "service-center, field-executive.",
  "service-center, field-executive, consignee, shipper.",
);

const ddl = `-- ===========================================================================
-- 0022  simple party masters (Phase 3 — Party Masters, Milestone 10A)
-- ---------------------------------------------------------------------------
-- Two mirrored address-book masters on the frozen framework (0014 + 0015):
--   * consignees — receiver directory (optional customer_name text until the
--                  Customer aggregate ships in 10B; optional state/country FKs)
--   * shippers   — sender directory (same shape)
--
-- Permission slugs already ship in 0010: mst.consignee-master, mst.shipper-master.
-- Import + lookup EXTENDED (not redesigned): public.import_master and public.lookup
-- are re-created with ALL prior branches kept verbatim and party branches appended.
-- Idempotent throughout.
-- ===========================================================================

-- ===========================================================================
-- consignees
-- ===========================================================================
create table if not exists public.consignees (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  code          text not null,
  name          text not null,
  customer_name text,
  mobile        text not null,
  email         text,
  address       text,
  pin_code      text,
  city          text,
  state_id      uuid,
  country_id    uuid,
  status        text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  deleted_at    timestamptz,
  row_version   integer not null default 1,
  constraint consignees_tenant_id_uq unique (tenant_id, id),
  constraint consignees_state_fk foreign key (tenant_id, state_id)
    references public.states (tenant_id, id) on delete set null,
  constraint consignees_country_fk foreign key (tenant_id, country_id)
    references public.countries (tenant_id, id) on delete set null
);
create unique index if not exists consignees_tenant_code_uq
  on public.consignees (tenant_id, code) where deleted_at is null;
create index if not exists consignees_tenant_idx on public.consignees (tenant_id);
create index if not exists consignees_tenant_state_idx on public.consignees (tenant_id, state_id);
create index if not exists consignees_tenant_country_idx on public.consignees (tenant_id, country_id);
create index if not exists consignees_name_trgm
  on public.consignees using gin (name gin_trgm_ops);
create index if not exists consignees_code_trgm
  on public.consignees using gin (code gin_trgm_ops);

-- ===========================================================================
-- shippers  (mirrored shape)
-- ===========================================================================
create table if not exists public.shippers (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  code          text not null,
  name          text not null,
  customer_name text,
  mobile        text not null,
  email         text,
  address       text,
  pin_code      text,
  city          text,
  state_id      uuid,
  country_id    uuid,
  status        text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  deleted_at    timestamptz,
  row_version   integer not null default 1,
  constraint shippers_tenant_id_uq unique (tenant_id, id),
  constraint shippers_state_fk foreign key (tenant_id, state_id)
    references public.states (tenant_id, id) on delete set null,
  constraint shippers_country_fk foreign key (tenant_id, country_id)
    references public.countries (tenant_id, id) on delete set null
);
create unique index if not exists shippers_tenant_code_uq
  on public.shippers (tenant_id, code) where deleted_at is null;
create index if not exists shippers_tenant_idx on public.shippers (tenant_id);
create index if not exists shippers_tenant_state_idx on public.shippers (tenant_id, state_id);
create index if not exists shippers_tenant_country_idx on public.shippers (tenant_id, country_id);
create index if not exists shippers_name_trgm
  on public.shippers using gin (name gin_trgm_ops);
create index if not exists shippers_code_trgm
  on public.shippers using gin (code gin_trgm_ops);

select app.attach_master_triggers('consignees', 'mst.consignee-master');
select app.attach_master_triggers('shippers',   'mst.shipper-master');

do $$
declare r record;
begin
  for r in (
    select * from (values
      ('consignees', 'mst.consignee-master'),
      ('shippers',   'mst.shipper-master')
    ) as t(tbl, slug)
  )
  loop
    execute format('alter table public.%I enable row level security;', r.tbl);

    execute format('drop policy if exists %I on public.%I;', r.tbl || '_select', r.tbl);
    execute format($p$create policy %I on public.%I
      for select using (tenant_id in (select app.user_tenant_ids()) or app.is_platform_admin());$p$,
      r.tbl || '_select', r.tbl);

    execute format('drop policy if exists %I on public.%I;', r.tbl || '_insert', r.tbl);
    execute format($p$create policy %I on public.%I
      for insert with check (
        tenant_id in (select app.user_tenant_ids())
        and app.user_has_permission(tenant_id, %L, 'add'));$p$,
      r.tbl || '_insert', r.tbl, r.slug);

    execute format('drop policy if exists %I on public.%I;', r.tbl || '_update', r.tbl);
    execute format($p$create policy %I on public.%I
      for update using (
        tenant_id in (select app.user_tenant_ids())
        and app.user_has_permission(tenant_id, %L, 'modify'))
      with check (
        tenant_id in (select app.user_tenant_ids())
        and app.user_has_permission(tenant_id, %L, 'modify'));$p$,
      r.tbl || '_update', r.tbl, r.slug, r.slug);

    execute format('drop policy if exists %I on public.%I;', r.tbl || '_delete', r.tbl);
    execute format($p$create policy %I on public.%I
      for delete using (
        tenant_id in (select app.user_tenant_ids())
        and app.user_has_permission(tenant_id, %L, 'delete'));$p$,
      r.tbl || '_delete', r.tbl, r.slug);
  end loop;
end $$;

`;

const out =
  ddl +
  "\n" +
  importBlock +
  "\n" +
  lookupBlock +
  "\ngrant execute on function public.lookup(text, text, integer) to authenticated, service_role;\n";

writeFileSync(new URL("../migrations/0022_party_masters_simple.sql", import.meta.url), out);
console.log(`Wrote ${out.length} chars to 0022_party_masters_simple.sql`);
