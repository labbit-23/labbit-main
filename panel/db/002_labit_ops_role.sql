-- Limited Postgres role for the panel API (replaces the Supabase service-role key). NOT applied anywhere.
--
-- RUN (VPS2, superuser; after 001):
--   PW=$(openssl rand -hex 24)        # hex => URI-safe, no quoting problems in PANEL_DB_DSN
--   psql "$ADMIN_DSN" -v ON_ERROR_STOP=1 -v api_password="$PW" -f 002_labit_ops_role.sql
--   # DSN: postgresql://labit_ops_api:$PW@10.0.0.2:5433/postgres?sslmode=prefer   -> env PANEL_DB_DSN
-- Pass the BARE password (no extra quotes). psql's :'api_password' quotes it exactly once.
-- Caller auth is X-Panel-Key (PANEL_INTERNAL_KEY) at the API; this role only reads/writes the panel tables.
--
-- !! This file also ADDS read-only RLS policies on the EXISTING tables public.cto_service_latest and
-- !! public.cto_service_logs, scoped `to labit_ops_api` (only if RLS is enabled there). Needed because the
-- !! CTO RLS migration leaves those tables with no policy for other roles. It does not affect the labit-main
-- !! routes (service role). Do not drop it in a "drop all policies" cleanup or the panel goes blind.

\set ON_ERROR_STOP on
\if :{?api_password}
\else
  \echo 'api_password psql variable is required: -v api_password="$(openssl rand -hex 24)"'
  \quit
\endif

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'labit_ops_api') then
    create role labit_ops_api nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
end $$;

select format('alter role labit_ops_api login password %L', :'api_password') \gexec

alter role labit_ops_api connection limit 10;
alter role labit_ops_api set search_path = labit_ops, public;
alter role labit_ops_api set statement_timeout = '30s';
alter role labit_ops_api set idle_in_transaction_session_timeout = '30s';

revoke all on schema labit_ops from public;
revoke all on all tables in schema labit_ops from public;
revoke all on all functions in schema labit_ops from public;

grant usage on schema labit_ops to labit_ops_api;
grant select on labit_ops.nodes, labit_ops.node_service_map,
                labit_ops.menu_systems to labit_ops_api;
grant select, insert on labit_ops.heartbeats to labit_ops_api;
grant usage, select on sequence labit_ops.heartbeats_id_seq to labit_ops_api;
grant select, insert, update on labit_ops.node_status, labit_ops.status_history to labit_ops_api;

-- CTO pipeline sources (read only). Nothing else in public.
grant usage on schema public to labit_ops_api;
grant select on public.cto_service_latest, public.cto_service_logs to labit_ops_api;

-- labit_ops tables have RLS enabled and the role is NOBYPASSRLS, so it needs explicit policies.
do $$
declare t text;
begin
  foreach t in array array['nodes','node_service_map','menu_systems','heartbeats','node_status','status_history']
  loop
    execute format('drop policy if exists %I on labit_ops.%I', t || '_api_select', t);
    execute format('create policy %I on labit_ops.%I for select to labit_ops_api using (true)', t || '_api_select', t);
  end loop;
  foreach t in array array['heartbeats','node_status','status_history']
  loop
    execute format('drop policy if exists %I on labit_ops.%I', t || '_api_insert', t);
    execute format('create policy %I on labit_ops.%I for insert to labit_ops_api with check (true)', t || '_api_insert', t);
  end loop;
  foreach t in array array['node_status','status_history']
  loop
    execute format('drop policy if exists %I on labit_ops.%I', t || '_api_update', t);
    execute format('create policy %I on labit_ops.%I for update to labit_ops_api using (true) with check (true)', t || '_api_update', t);
  end loop;
  -- EXISTING public CTO tables: additive read-only policy, only if RLS is on (see header)
  foreach t in array array['cto_service_latest','cto_service_logs']
  loop
    if (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      execute format('drop policy if exists %I on public.%I', t || '_panel_api_select', t);
      execute format('create policy %I on public.%I for select to labit_ops_api using (true)', t || '_panel_api_select', t);
    end if;
  end loop;
end $$;
-- Deliberately NOT granted: DELETE anywhere, any patient/LIS table, writes to nodes/map/menu.

-- ---------------------------------------------------------------- post-apply verification (run manually; expect the noted results)
-- select has_schema_privilege('labit_ops_api','labit_core','USAGE');                 -- f  (repeat for every other schema except public/labit_ops)
-- select has_table_privilege('labit_ops_api','public.cto_service_latest','SELECT'); -- t
-- select has_table_privilege('labit_ops_api','public.cto_service_latest','INSERT');  -- f
-- select has_table_privilege('labit_ops_api','labit_ops.nodes','UPDATE');            -- f
-- select has_table_privilege('labit_ops_api','labit_ops.node_status','UPDATE');      -- t
-- select table_schema, table_name, privilege_type from information_schema.role_table_grants
--   where grantee = 'labit_ops_api' order by 1,2,3;                                   -- only labit_ops.* and the two public.cto_* SELECTs
-- select n.nspname, count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
--   where c.relkind in ('r','v','m','p') and has_table_privilege('labit_ops_api', c.oid, 'SELECT')
--     and n.nspname not in ('pg_catalog','information_schema') group by 1;           -- only labit_ops and public (cto_* only; check public count == 2 + any PUBLIC-granted tables)
-- select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and has_function_privilege('labit_ops_api', p.oid, 'EXECUTE');  -- review any PUBLIC-executable function
