-- Labit Control Panel: schema labit_ops. NOT applied anywhere. Idempotent.
-- Run as a Postgres superuser/owner on the self-hosted Supabase (VPS2). Then run 002_labit_ops_role.sql.
-- The API connects as the limited role labit_ops_api (002), NOT the service role, and talks SQL directly
-- (PANEL_DB_DSN), so labit_ops does not need to be an exposed PostgREST schema.
-- anon/authenticated get NO grants here: nothing is readable through the public REST API.
-- Auth is NOT in the database: the panel lives inside labit-main (iron-session, director/director_ceo only)
-- and calls the API over localhost with an internal key. There are no roles/users tables here.

create schema if not exists labit_ops;

create table if not exists labit_ops.nodes (
  id text primary key,
  label text not null,
  kind text not null check (kind in ('local','cloud')),
  host text,                              -- informational (hostname / tailnet address)
  depends_on text[] not null default '{}',
  token_hash text,                        -- optional heartbeat fallback: sha256 hex of node token
  quiet boolean not null default false,   -- UI hint: unreachable is NORMAL at times; do not alert-style it
  expected_offline text,                  -- human note, e.g. 'powered off outside lab hours'
  sort int not null default 0
);

-- Maps public.cto_service_latest rows to panel nodes/services. One row = one panel service.
-- service_key matches exactly, or as a prefix when is_prefix. Worst status of matched rows wins.
-- probe=true: an external probe OF the node (e.g. mirth_lab). Status 'down' on a probe-only node
-- means the node is unreachable. Non-probe rows (collector running ON the node) prove reachability by freshness.
create table if not exists labit_ops.node_service_map (
  id text primary key,
  node_id text not null references labit_ops.nodes(id) on delete cascade,
  service_key text not null,
  is_prefix boolean not null default false,
  label text not null,
  required boolean not null default true,
  probe boolean not null default false,
  informational boolean not null default false,  -- shown as a service but never a health signal (no reachability proof, never required)
  max_age_seconds int check (max_age_seconds is null or max_age_seconds > 0),  -- null => API STALE_SECONDS
  sort int not null default 0
);
alter table labit_ops.node_service_map add column if not exists informational boolean not null default false;
alter table labit_ops.node_service_map add column if not exists max_age_seconds int check (max_age_seconds is null or max_age_seconds > 0);
create index if not exists node_service_map_node_idx on labit_ops.node_service_map(node_id);

-- Optional heartbeat fallback (POST /heartbeat, disabled unless HEARTBEAT_ENABLED=1).
-- Heartbeat services appear to the map as service_key 'hb:<node_id>:<service>'.
create table if not exists labit_ops.heartbeats (
  id bigserial primary key,
  node_id text not null references labit_ops.nodes(id) on delete cascade,
  received_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);
create index if not exists heartbeats_node_received_idx on labit_ops.heartbeats(node_id, received_at desc);

create table if not exists labit_ops.node_status (
  node_id text primary key references labit_ops.nodes(id) on delete cascade,
  state text not null check (state in ('online','degraded','unreachable','service_down','not_monitored')),
  last_seen timestamptz,
  detail jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists labit_ops.status_history (
  node_id text not null references labit_ops.nodes(id) on delete cascade,
  bucket timestamptz not null,
  state text not null check (state in ('online','degraded','unreachable','service_down','not_monitored')),
  primary key (node_id, bucket)
);

create table if not exists labit_ops.menu_systems (
  id text primary key,
  label text not null,
  group_name text not null,
  url text not null check (url ~* '^https?://'),
  admin_console boolean not null default false,
  service_id text references labit_ops.node_service_map(id) on delete set null,
  sort int not null default 0,
  pinned boolean not null default false,
  pin_sort int not null default 0
);
alter table labit_ops.menu_systems add column if not exists pinned boolean not null default false;
alter table labit_ops.menu_systems add column if not exists pin_sort int not null default 0;

alter table labit_ops.nodes            enable row level security;
alter table labit_ops.node_service_map enable row level security;
alter table labit_ops.heartbeats       enable row level security;
alter table labit_ops.node_status      enable row level security;
alter table labit_ops.status_history   enable row level security;
alter table labit_ops.menu_systems     enable row level security;

-- No client grants at all. The API (labit_ops_api, see 002) is the only reader/writer.
revoke all on all tables in schema labit_ops from anon, authenticated;
revoke all on schema labit_ops from anon, authenticated, public;
revoke all on all tables in schema labit_ops from public;
revoke all on all sequences in schema labit_ops from public;
alter default privileges in schema labit_ops revoke all on tables from anon, authenticated;

-- RLS is enabled with NO policy for anon/authenticated = default deny. The only access is labit_ops_api (002).

-- ------------------------------------------------------------------ seed (never overwrites edits)
-- VERIFY at Phase C against live public.cto_service_latest keys (select distinct service_key ...).
insert into labit_ops.nodes (id,label,kind,host,depends_on,quiet,expected_offline,sort) values
 ('db-vps','DB VPS (VPS2, self-hosted Supabase)','cloud','supabase.sdrc.in / 100.112.195.21','{}',false,null,10),
 ('app-vps','App VPS (VPS1)','cloud','ubuntu-4gb-hel1-1','{db-vps}',false,null,20),
 ('mirth-dicom','Mirth Connect (DICOM)','local','sdrc-integrations / 100.103.168.62','{app-vps}',false,null,30),
 ('mirth-lab','Mirth Connect (lab)','local','lab-mirth / 100.71.105.110','{app-vps}',true,'Powered off outside lab hours (hours: verify); unreachable overnight is normal',40),
 ('devserver','Dev server','local','100.65.63.54','{}',false,null,50)
on conflict (id) do nothing;

-- Probe keys come from labit-py monitoring_agent, which ALWAYS appends '__<node_role>' (vps|local):
-- see labit-py/app/monitoring_agent.py append_node_role_to_service_key, services.ini run_on, ecosystem.monitoring.config.cjs.
-- Collector keys are '<normalized pm2 name>__<CTO_NODE_SUFFIX>' (vps1 for VPS1).
-- max_age_seconds = interval_seconds*2 + margin where the probe interval exceeds the default STALE_SECONDS (180).
-- Deliberately NOT mapped (enabled=0 in services.ini, never emit): dicom_worker, ecg_sender, machine_bridge,
-- supabase_rest_probe (placeholder URL), local_delivery_engine, monitoring_agent, auto_send_reports, mirth_channel_*.
insert into labit_ops.node_service_map (id,node_id,service_key,is_prefix,label,required,probe,informational,max_age_seconds,sort) values
 -- db-vps (VPS2, self-hosted Supabase): NO health source yet, so the node is 'not_monitored'. supabase_main__vps
 -- probes the legacy HOSTED Supabase, not VPS2, so it is informational only (tile 'Hosted Supabase') and never
 -- decides db-vps health. When a CTO collector runs on VPS2 (CTO_NODE_SUFFIX=vps2), INSERT non-informational
 -- rows such as ('db.host','db-vps','vps_host__vps2',false,'VPS2 host',true,false,false,null,30),
 -- 'pm2_runtime__vps2', 'docker_runtime__vps2' (this seed never overwrites).
 ('db.supabase_main','db-vps','supabase_main__vps',false,'Hosted Supabase',false,false,true,600,10),
 -- app-vps (VPS1, collector suffix vps1)
 ('app.health','app-vps','labbit_health__vps',false,'Labit health probe',true,true,false,null,10),
 ('app.host','app-vps','vps_host__vps1',false,'VPS1 host',true,false,false,null,20),
 ('app.pm2','app-vps','pm2_runtime__vps1',false,'VPS1 pm2 runtime',true,false,false,null,30),
 ('app.labit_core','app-vps','labit_core__vps1',false,'labit-core',true,false,false,null,40),
 ('app.report_sender','app-vps','report_sender__vps1',false,'Report sender',false,false,false,null,50),
 ('app.enqueue_watch','app-vps','report_enqueue_watch__vps1',false,'Report enqueue watch',false,false,false,null,60),
 ('app.dispatch_queue','app-vps','auto_dispatch_queue__vps1',false,'Auto-dispatch queue',false,false,false,null,70),
 -- mirth-dicom / sdrc-integrations: probes run by the local-role monitoring agent
 ('dicom.mirth','mirth-dicom','mirth_dicom__local',false,'Mirth DICOM',true,true,false,null,10),
 ('dicom.orthanc','mirth-dicom','orthanc_main__local',false,'Orthanc PACS',true,true,false,300,20),
 ('dicom.funnel_public','mirth-dicom','funnel_mirth_public__local',false,'Tailscale Funnel (public)',false,true,false,null,60),
 ('dicom.funnel_health','mirth-dicom','funnel_mirth_health__',true,'Tailscale Funnel (health)',false,true,false,null,70),
 -- mirth-lab (probe only; quiet node)
 ('lab.mirth','mirth-lab','mirth_lab__local',false,'Mirth lab',true,true,false,null,10)
on conflict (id) do nothing;
-- Unmapped but real keys: sophos_firewall__local, oracle_db__vps, tomcat_*__vps. devserver has no known keys
-- (state 'not_monitored' until a signal is mapped or a heartbeat is configured).

insert into labit_ops.menu_systems (id,label,group_name,url,admin_console,service_id,sort,pinned,pin_sort) values
 ('radiology-dexa','Radiology (DEXA reports)','Radiology','https://sdrc-integrations.tail950b5e.ts.net/radiology/',false,null,5,true,10),
 ('labit-one','Labit One ops','Operations','https://labit.sdrc.in/',false,'app.labit_core',10,false,0),
 ('fastapi','FastAPI','Operations','https://labit.sdrc.in/docs',false,'app.health',20,false,0),
 ('dispatch-kiosk','Report dispatch kiosk','Operations','https://labit.sdrc.in/report-dispatch',false,'app.report_sender',30,false,0),
 ('dexa-app','DEXA app','Radiology','https://sdrc-integrations.tail950b5e.ts.net/radiology/',false,null,40,false,0),
 ('sdrc-website','SDRC website','Public','https://sdrc.in/',false,null,50,false,0),
 ('bonvoice-ivr','Bonvoice IVR','Public','https://CHANGE-ME-bonvoice.example/',false,null,60,false,0),
 ('supabase','Hosted Supabase','Admin consoles','https://CHANGE-ME-tailnet-supabase/',true,'db.supabase_main',100,false,0),
 ('mirth-lab','Mirth Connect lab','Admin consoles','https://CHANGE-ME-tailnet-mirth-lab/',true,'lab.mirth',110,false,0),
 ('mirth-dicom','Mirth Connect DICOM','Admin consoles','https://CHANGE-ME-tailnet-mirth-dicom/',true,'dicom.mirth',120,false,0),
 ('erpnext','ERPNext','Admin consoles','https://CHANGE-ME-tailnet-erpnext/',true,null,130,false,0),
 ('orthanc','Orthanc PACS','Admin consoles','https://CHANGE-ME-tailnet-orthanc/',true,'dicom.orthanc',140,false,0)
on conflict (id) do nothing;
-- nodes.token_hash is deliberately NOT seeded.
