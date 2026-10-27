-- Marketing engine v3: saved segments, offers, scheduling, pilot, per-recipient offer snapshot, audit trail.
-- Builds on 20261026_marketing_campaigns.sql. Idempotent. NOT applied anywhere: apply by hand in the Supabase SQL editor.

create table if not exists public.marketing_segments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  filter jsonb not null default '{}'::jsonb,   -- labit-core campaign-audience filter, passed through verbatim
  notes text null,
  created_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null
);

create table if not exists public.marketing_offers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  discount_type text not null check (discount_type in ('pct', 'flat')),
  value numeric not null check (value > 0),
  applies_to_packages text[] not null default '{}',
  valid_from date null,
  valid_to date null,
  tier_map jsonb not null default '{}'::jsonb,  -- { "<offer_tier>": { value?, text?, packages? } }
  terms text not null default '',
  code text not null default '',
  created_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null
);

alter table public.campaigns
  add column if not exists template_key text null,
  add column if not exists segment_id uuid null references public.marketing_segments(id),
  add column if not exists offer_id uuid null references public.marketing_offers(id),
  add column if not exists send_after timestamptz null,
  add column if not exists created_by text null;

alter table public.campaigns drop constraint if exists campaigns_status_check;
alter table public.campaigns add constraint campaigns_status_check
  check (status in ('draft', 'prepared', 'scheduled', 'running', 'paused', 'stopped', 'completed'));
create index if not exists idx_campaigns_due on public.campaigns (send_after) where status in ('scheduled', 'running') and send_after is not null;

-- Per-recipient snapshot: what this patient was offered at prepare time (survives later offer edits).
alter table public.campaign_recipients
  add column if not exists offer_id uuid null,
  add column if not exists offer_text text null,
  add column if not exists focus_areas text null,
  add column if not exists offer_tier text null;

-- Audit trail for every admin-panel mutation. No patient identifiers: only counts, ids and settings.
create table if not exists public.marketing_audit (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_user_id text null,
  actor_name text null,
  actor_role text null,
  action text not null,
  campaign_id uuid null,
  details jsonb not null default '{}'::jsonb
);
create index if not exists idx_marketing_audit_created on public.marketing_audit (created_at desc);
create index if not exists idx_marketing_audit_campaign on public.marketing_audit (campaign_id) where campaign_id is not null;

-- Server-side only (service role), like the other campaign tables.
alter table public.marketing_segments enable row level security;
alter table public.marketing_offers enable row level security;
alter table public.marketing_audit enable row level security;
