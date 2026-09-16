-- Bonvoice IVR Phase 1: log every DTMF webhook call, regardless of what
-- action (or none) it triggered. See app/api/webhooks/bonvoice-ivr/route.js
-- and BONVOICE_IVR_PHASE1_OUTLINE.md.

create table if not exists public.ivr_call_log (
  id uuid primary key default gen_random_uuid(),
  call_id text,
  source_number text,
  dtmf text,
  action_taken text,
  whatsapp_status text,
  bonvoice_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ivr_call_log_created_at on public.ivr_call_log (created_at desc);
create index if not exists idx_ivr_call_log_source_number on public.ivr_call_log (source_number);
