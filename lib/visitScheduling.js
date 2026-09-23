// Shared visit-scheduling validation. Extracted verbatim from
// app/api/visits/route.js (2026-09-24, for the Labit App's own booking
// endpoint) -- same "no past dates, no past-cutoff slots today" rule staff
// booking already enforces, now usable from a second caller without
// duplicating the logic. Behavior is unchanged for the staff route: it now
// imports these instead of defining them locally.
import { supabase } from "@/lib/supabaseServer";

export function parseMinutesFromHHMMSS(value) {
  const text = String(value || "").trim();
  const m = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return (hh * 60) + mm;
}

export function getIstNowParts() {
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const timeText = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const [hh, mm] = String(timeText).split(":").map((x) => Number(x));
  const minutes = (Number.isFinite(hh) ? hh : 0) * 60 + (Number.isFinite(mm) ? mm : 0);
  return { date, minutes };
}

export async function assertVisitScheduleAllowed({ visitDate, timeSlotId }) {
  const targetDate = String(visitDate || "").slice(0, 10);
  if (!targetDate) return null;

  const nowIst = getIstNowParts();
  if (targetDate < nowIst.date) {
    return "Cannot create or update a visit in the past.";
  }
  if (targetDate > nowIst.date) return null;
  if (!timeSlotId) return null;

  const { data: slot, error } = await supabase
    .from("visit_time_slots")
    .select("id, slot_name, end_time")
    .eq("id", timeSlotId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to validate visit slot time.");
  }
  if (!slot?.end_time) return null;

  const endMins = parseMinutesFromHHMMSS(slot.end_time);
  if (endMins === null) return null;
  if (nowIst.minutes > endMins) {
    return `Cannot book ${slot.slot_name || "selected slot"} after its end time (${slot.end_time.slice(0, 5)}).`;
  }
  return null;
}
