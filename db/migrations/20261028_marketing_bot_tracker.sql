-- WhatsApp bot automations + patient interaction tracker + staff inbox (see docs/whatsapp-bot-automations.md).
-- Idempotent. NOT applied automatically: run by hand in the Supabase SQL editor after review.
-- Everything ships OFF: with no whatsapp_bot_settings rows the bot runs no automation at all.

-- 1. Settings: key = 'flags' | 'params' | 'texts', value = jsonb (see lib/whatsappBot/settings.js)
create table if not exists public.whatsapp_bot_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by text null,
  updated_at timestamptz not null default now()
);

-- 2. Interaction timeline. Keyed by a salted hash of the phone (never the number itself) + MRN when known.
create table if not exists public.whatsapp_interaction_events (
  id bigint generated always as identity primary key,
  phone_hash text not null,
  mrn text null,
  thread_id uuid null,
  event_type text not null,
  direction text null check (direction in ('in', 'out')),
  intent text null,
  campaign_id uuid null,
  offer_id text null,
  ref_id text null,                         -- reqno or enquiry id the event refers to
  detail jsonb not null default '{}'::jsonb, -- small structured facts only, no message text
  created_at timestamptz not null default now()
);
create index if not exists idx_wa_events_phone_time on public.whatsapp_interaction_events (phone_hash, created_at desc);
create index if not exists idx_wa_events_type_time on public.whatsapp_interaction_events (event_type, created_at desc);
create index if not exists idx_wa_events_campaign on public.whatsapp_interaction_events (campaign_id, created_at desc) where campaign_id is not null;
create index if not exists idx_wa_events_mrn on public.whatsapp_interaction_events (mrn) where mrn is not null;

-- 3. Staff inbox: one live thread per phone; messages and notes hang off it.
create table if not exists public.whatsapp_inbox_threads (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid null,
  phone10 text not null,
  phone_hash text not null,
  mrn text null,
  display_name text null,
  status text not null default 'open' check (status in ('open', 'assigned', 'resolved')),
  reason text null,                          -- unrecognised | low_confidence | complaint | medical_advice | phone_mismatch | ...
  assigned_to text null,
  tags text[] not null default '{}',
  campaign_id uuid null,
  offer_id text null,
  unread_count int not null default 0,
  last_inbound_at timestamptz null,          -- start of the 24 h customer-service window
  last_message_at timestamptz not null default now(),
  last_staff_reply_at timestamptz null,
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_wa_inbox_one_live_thread on public.whatsapp_inbox_threads (phone10) where status <> 'resolved';
create index if not exists idx_wa_inbox_status_time on public.whatsapp_inbox_threads (status, last_message_at desc);
create index if not exists idx_wa_inbox_phone_hash on public.whatsapp_inbox_threads (phone_hash);

create table if not exists public.whatsapp_inbox_messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.whatsapp_inbox_threads(id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  sender text not null check (sender in ('patient', 'bot', 'staff')),
  kind text not null default 'text',
  body text not null default '',
  wa_message_id text null,
  staff_user_id text null,
  created_at timestamptz not null default now()
);
create index if not exists idx_wa_inbox_messages_thread on public.whatsapp_inbox_messages (thread_id, created_at);

create table if not exists public.whatsapp_inbox_notes (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.whatsapp_inbox_threads(id) on delete cascade,
  author_id text null,
  author_name text null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_wa_inbox_notes_thread on public.whatsapp_inbox_notes (thread_id, created_at);

-- Service-role only (the app server); no anon/authenticated policies.
alter table public.whatsapp_bot_settings enable row level security;
alter table public.whatsapp_interaction_events enable row level security;
alter table public.whatsapp_inbox_threads enable row level security;
alter table public.whatsapp_inbox_messages enable row level security;
alter table public.whatsapp_inbox_notes enable row level security;

-- 4. Dedicated permissions (director already has "*").
insert into public.uac_role_permissions (lab_id, role_key, permission, enabled)
select l.id, v.role_key, v.permission, true
from public.labs l
cross join (
  values
    ('admin', 'marketing.bot.view'), ('admin', 'marketing.bot.manage'), ('admin', 'marketing.inbox.view'), ('admin', 'marketing.inbox.reply'), ('admin', 'marketing.tracker.view'),
    ('manager', 'marketing.bot.view'), ('manager', 'marketing.inbox.view'), ('manager', 'marketing.inbox.reply'), ('manager', 'marketing.tracker.view'),
    ('executive', 'marketing.inbox.view'), ('executive', 'marketing.inbox.reply')
) as v(role_key, permission)
on conflict (lab_id, role_key, permission) do update
set enabled = excluded.enabled,
    updated_at = now();
