-- Quickbookings performance indexes
-- Purpose:
-- 1) Speed up pending booking requests load (status null/empty/pending + latest first)
-- 2) Keep history pagination fast (latest first)
--
-- Run in production with a superuser/owner role.
-- NOTE: CREATE INDEX CONCURRENTLY cannot run inside a transaction block.

-- Existing broad index (already present in most environments):
-- create index if not exists idx_quickbookings_created_at
--   on public.quickbookings using btree (created_at desc);

-- Specialized partial index for "pending" queue path used by Admin dashboard.
-- Matches:
--   status is null OR status = '' OR status in ('pending','PENDING')
-- ordered by created_at desc.
create index concurrently if not exists idx_quickbookings_pending_created_at
  on public.quickbookings using btree (created_at desc)
  where (
    status is null
    or btrim(status) = ''
    or lower(btrim(status)) = 'pending'
  );

-- Optional: if you have many non-pending rows and history queries are still slow,
-- this partial index can help non-pending list scans.
create index concurrently if not exists idx_quickbookings_nonpending_created_at
  on public.quickbookings using btree (created_at desc)
  where (
    status is not null
    and btrim(status) <> ''
    and lower(btrim(status)) <> 'pending'
  );

-- Refresh planner stats after index creation.
analyze public.quickbookings;

