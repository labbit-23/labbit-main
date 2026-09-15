-- Stop over-notifying patients on intermediate visit-status transitions.
-- Director, 2026-09-15: "We're over communicating... this reaches late,
-- phlebos dont update visits status in real time is the gap." Confirmed
-- via real data: 467 of 764 booking_status sends (61%) were "IN PROGRESS"
-- -- a mid-workflow status ping, frequently stale by the time it arrives
-- since phlebos don't update status in real time -- while `completed`
-- (the one event actually worth telling a patient about) had notify_to=[]
-- and was NOT notifying the patient at all.
--
-- Policy from here: patient gets exactly one status-driven notification,
-- at completion. Every other status stops pinging the patient. Other
-- roles (phlebo/admin) on these statuses are left untouched -- this is
-- about patient noise specifically, not staff notifications.
--
-- Deliberately NOT touching the separate reschedule/update trigger
-- (app/api/visits/route.js, the isVisitDateChanged/isTimeslotChangedForPatient
-- branch, "RESCHEDULED"/"UPDATED") -- that's a different, legitimate event
-- (the visit's actual date/time moved), not status-transition noise, and
-- wasn't flagged as a problem.

update public.visit_statuses set notify_to = '["patient"]'::jsonb where code = 'completed';
update public.visit_statuses set notify_to = '[]'::jsonb where code = 'accepted';
update public.visit_statuses set notify_to = '["phlebo"]'::jsonb where code = 'booked';
update public.visit_statuses set notify_to = '[]'::jsonb where code = 'in_progress';
update public.visit_statuses set notify_to = '["admin"]'::jsonb where code = 'pending';
update public.visit_statuses set notify_to = '["phlebo", "admin"]'::jsonb where code = 'postponed';
update public.visit_statuses set notify_to = '["admin"]'::jsonb where code = 'rejected';
update public.visit_statuses set notify_to = '["admin"]'::jsonb where code = 'disabled';
-- sample_picked, sample_dropped, unassigned already carry no "patient" entry -- untouched.
