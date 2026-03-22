create table if not exists public.whatsapp_agent_locks (
  id uuid primary key default gen_random_uuid(),
  lab_id text not null,
  session_id text not null,
  phone text not null,
  agent_id text,
  agent_name text,
  agent_role text,
  typing boolean not null default true,
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 seconds'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_whatsapp_agent_locks_lab_session
  on public.whatsapp_agent_locks (lab_id, session_id);

create index if not exists idx_whatsapp_agent_locks_expires_at
  on public.whatsapp_agent_locks (expires_at desc);

create index if not exists idx_whatsapp_agent_locks_lab_phone
  on public.whatsapp_agent_locks (lab_id, phone);
