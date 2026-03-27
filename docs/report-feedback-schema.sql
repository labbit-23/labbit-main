create table if not exists public.report_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  source text not null check (source in ('kiosk', 'whatsapp_bot')),
  lab_id uuid null,

  reqid text null,
  reqno text null,
  patient_phone text null,

  rating integer not null check (rating between 1 and 5),
  feedback text null,

  actor_user_id uuid null,
  actor_name text null,
  chat_session_id text null,
  metadata jsonb null
);

create index if not exists idx_report_feedback_source_created
  on public.report_feedback (source, created_at desc);

create index if not exists idx_report_feedback_reqid_created
  on public.report_feedback (reqid, created_at desc);

create index if not exists idx_report_feedback_phone_created
  on public.report_feedback (patient_phone, created_at desc);
