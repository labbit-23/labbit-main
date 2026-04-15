-- Campaign short links for WhatsApp marketing flows.
-- Supports optional TTL via expires_at and optional click cap via max_clicks.

create table if not exists public.campaign_short_links (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  long_url text not null,
  campaign_id uuid null references public.campaigns(id) on delete set null,
  recipient_mobile text null,
  is_active boolean not null default true,
  expires_at timestamptz null,
  max_clicks integer null check (max_clicks is null or max_clicks > 0),
  click_count integer not null default 0 check (click_count >= 0),
  last_clicked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_campaign_short_links_campaign_id
  on public.campaign_short_links (campaign_id);

create index if not exists idx_campaign_short_links_recipient_mobile
  on public.campaign_short_links (recipient_mobile);

create index if not exists idx_campaign_short_links_expires_at
  on public.campaign_short_links (expires_at);

create table if not exists public.campaign_short_link_clicks (
  id uuid primary key default gen_random_uuid(),
  short_link_id uuid not null references public.campaign_short_links(id) on delete cascade,
  clicked_at timestamptz not null default now(),
  user_agent text null,
  referer text null,
  ip_hash text null
);

create index if not exists idx_campaign_short_link_clicks_short_link_id
  on public.campaign_short_link_clicks (short_link_id);

create index if not exists idx_campaign_short_link_clicks_clicked_at
  on public.campaign_short_link_clicks (clicked_at desc);

-- Example record
-- insert into public.campaign_short_links (
--   code, long_url, campaign_id, recipient_mobile, expires_at
-- ) values (
--   'ab12cd34',
--   'https://lab.sdrc.in/patient/reports/trend?mrno=123456',
--   null,
--   '919876543210',
--   now() + interval '30 days'
-- );
