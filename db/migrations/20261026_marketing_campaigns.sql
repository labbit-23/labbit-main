-- Marketing campaigns v2 (WhatsApp marketing-template blasts to an archive-derived audience).
-- Extends the existing public.campaigns / public.campaign_recipients (docs/campaigns-schema.sql); adds the opt-out list.
-- Apply by hand in the Supabase SQL editor; idempotent.

alter table public.campaigns
  add column if not exists config jsonb not null default '{}'::jsonb,   -- template, segment, limits (see lib/marketingCampaigns)
  add column if not exists lab_id uuid null,
  add column if not exists prepared_at timestamptz null,
  add column if not exists stopped_at timestamptz null;

alter table public.campaigns drop constraint if exists campaigns_status_check;
alter table public.campaigns add constraint campaigns_status_check
  check (status in ('draft', 'prepared', 'running', 'paused', 'stopped', 'completed'));

alter table public.campaign_recipients
  add column if not exists name text null,
  add column if not exists last_visit date null,
  add column if not exists last_package text null,
  add column if not exists skip_reason text null,
  add column if not exists provider_message_id text null,
  add column if not exists error text null,
  add column if not exists delivery_status text null,        -- sent | delivered | read | failed (from Meta status webhooks)
  add column if not exists delivery_error_code text null,
  add column if not exists delivery_updated_at timestamptz null;

alter table public.campaign_recipients drop constraint if exists campaign_recipients_status_check;
alter table public.campaign_recipients add constraint campaign_recipients_status_check
  check (status in ('pending', 'sending', 'sent', 'failed', 'skipped'));

-- One row per phone per campaign; the old run route re-seeded by delete+insert, v2 never does.
create unique index if not exists uq_campaign_recipients_campaign_mobile
  on public.campaign_recipients (campaign_id, mobile);
create index if not exists idx_campaign_recipients_status on public.campaign_recipients (campaign_id, status);
create index if not exists idx_campaign_recipients_provider_message_id
  on public.campaign_recipients (provider_message_id) where provider_message_id is not null;

-- Opt-outs: any phone here is never sent a marketing message (patient replied STOP / tapped the template's stop button).
create table if not exists public.whatsapp_opt_outs (
  phone10 text primary key,                 -- last 10 digits
  source text not null default 'whatsapp_reply',   -- whatsapp_reply | manual | import
  reason text null,
  created_at timestamptz not null default now()
);
