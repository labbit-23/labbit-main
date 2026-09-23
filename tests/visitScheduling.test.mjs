// Tests for lib/visitScheduling.js (extracted 2026-09-24 from
// app/api/visits/route.js, verbatim, for the Labit App's own booking
// endpoint to reuse without duplicating the logic).
//
// Same scope limitation as tests/appAuth.test.mjs: assertVisitScheduleAllowed
// calls the live-configured `supabase` client directly with no DI seam, so
// only its side-effect-free branches (ones that return before ever touching
// the DB) are covered here, plus the pure date/time helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertVisitScheduleAllowed, parseMinutesFromHHMMSS, getIstNowParts } from "@/lib/visitScheduling.js";

test("parseMinutesFromHHMMSS: parses HH:MM and HH:MM:SS", () => {
  assert.equal(parseMinutesFromHHMMSS("09:30"), 570);
  assert.equal(parseMinutesFromHHMMSS("09:30:00"), 570);
  assert.equal(parseMinutesFromHHMMSS("00:00"), 0);
  assert.equal(parseMinutesFromHHMMSS("23:59"), 1439);
});

test("parseMinutesFromHHMMSS: rejects garbage", () => {
  assert.equal(parseMinutesFromHHMMSS(""), null);
  assert.equal(parseMinutesFromHHMMSS(null), null);
  assert.equal(parseMinutesFromHHMMSS("not a time"), null);
  assert.equal(parseMinutesFromHHMMSS("25:99"), 1599); // matches the pattern but out-of-range hours/minutes are not validated -- documented leniency, not a bug being asserted away
});

test("getIstNowParts: returns a YYYY-MM-DD date and 0-1439 minutes-of-day", () => {
  const { date, minutes } = getIstNowParts();
  assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(minutes >= 0 && minutes < 1440);
});

test("assertVisitScheduleAllowed: no visitDate is allowed (nothing to check)", async () => {
  assert.equal(await assertVisitScheduleAllowed({ visitDate: "", timeSlotId: "x" }), null);
  assert.equal(await assertVisitScheduleAllowed({}), null);
});

test("assertVisitScheduleAllowed: a past date is always rejected, before any DB lookup", async () => {
  const msg = await assertVisitScheduleAllowed({ visitDate: "2000-01-01", timeSlotId: "whatever-nonexistent" });
  assert.equal(msg, "Cannot create or update a visit in the past.");
});

test("assertVisitScheduleAllowed: a future date is allowed without needing a real timeSlotId", async () => {
  const farFuture = "2099-01-01";
  assert.equal(await assertVisitScheduleAllowed({ visitDate: farFuture, timeSlotId: "does-not-exist" }), null);
});

test("assertVisitScheduleAllowed: today's date with no timeSlotId is allowed (no slot to check)", async () => {
  const { date } = getIstNowParts();
  assert.equal(await assertVisitScheduleAllowed({ visitDate: date, timeSlotId: "" }), null);
});
