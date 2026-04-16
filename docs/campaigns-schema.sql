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
-- Store Shivam segment API routing in labs_apis.api_name = 'shivam_marketing'.
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

-- Example templates payload for shivam_marketing:
-- {
--   "segment_endpoints": {
--     "inactive_patients": "/api/marketing/inactive-patients",
--     "lapsed_report_users": "/api/marketing/lapsed-report-users",
--     "not_visited_new_centre": "/api/marketing/not-visited-new-centre",
--     "package_anniversary_recall": "/api/marketing/package-anniversary-recall"
--   },
--   "query_defaults": {
--     "new_centre_start_date": "2025-04-20"
--   }
-- }

-- Example row for shivam_marketing in labs_apis:
-- insert into public.labs_apis (lab_id, api_name, base_url, auth_details, templates)
-- values (
--   '<LAB_ID>',
--   'shivam_marketing',
--   'https://shivam.example.com',
--   '{"bearer_token":"<TOKEN>"}'::jsonb,
--   '{
--     "segment_endpoints": {
--       "inactive_patients": "/api/marketing/inactive-patients",
--       "lapsed_report_users": "/api/marketing/lapsed-report-users",
--       "not_visited_new_centre": "/api/marketing/not-visited-new-centre",
--       "package_anniversary_recall": "/api/marketing/package-anniversary-recall"
--     },
--     "query_defaults": {
--       "new_centre_start_date": "2025-04-20"
--     }
--   }'::jsonb
-- );
