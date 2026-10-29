-- Operational review state for Bonvoice calls. Raw webhook evidence remains
-- immutable in ivr_call_log; staff workflow belongs in this companion table.
create table if not exists public.ivr_call_reviews (
  call_id text primary key,
  status text not null default 'new'
    check (status in ('new', 'reviewed', 'follow_up', 'closed')),
  follow_up_owner text,
  notes text,
  reviewed_by text,
  reviewed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_ivr_call_reviews_status
  on public.ivr_call_reviews (status, updated_at desc);

