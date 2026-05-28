-- visit_activity_log: index for per-visit timeline queries
-- Every visit detail page queries .eq("visit_id", id).order("created_at") —
-- without this, Postgres does a full table scan through all log rows.
create index if not exists idx_visit_activity_log_visit_id_created_at
  on public.visit_activity_log (visit_id, created_at desc);

-- report_feedback: lab_id index for multi-lab analytics filtering
create index if not exists idx_report_feedback_lab_id_created
  on public.report_feedback (lab_id, created_at desc);
