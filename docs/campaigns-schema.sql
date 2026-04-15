-- Campaign V1 schema
-- Run in Supabase SQL editor.

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  segment_type text not null,
  date date not null,
  status text not null default 'draft' check (status in ('draft', 'running', 'completed')),
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  mobile text not null,
  mrno text null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  sent_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_campaigns_created_at on public.campaigns(created_at desc);
create index if not exists idx_campaign_recipients_campaign_id on public.campaign_recipients(campaign_id);
create index if not exists idx_campaign_recipients_mobile on public.campaign_recipients(mobile);

-- Keep transactional transport in labs_apis.api_name = 'whatsapp_outbound'.
-- Store marketing template metadata separately in labs_apis.api_name = 'whatsapp_marketing'.
-- Example templates payload for whatsapp_marketing:
-- {
--   "default_template": "trend_campaign_v1",
--   "default_language": "en",
--   "templates": {
--     "trend_campaign_v1": {
--       "template_name": "trend_campaign_v1",
--       "language": "en",
--       "params_order": ["name", "booking_link"]
--     }
--   }
-- }
