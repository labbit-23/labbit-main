import { WINDOW_MS } from "./constants.js";

// WhatsApp customer-service window: free-form messages are allowed for 24 h after the patient's last inbound message.
export function windowState(lastInboundAt, now = Date.now()) {
  const t = lastInboundAt ? new Date(lastInboundAt).getTime() : NaN;
  if (!Number.isFinite(t)) return { open: false, closes_at: null, remaining_ms: 0 };
  const closes = t + WINDOW_MS;
  return { open: now < closes, closes_at: new Date(closes).toISOString(), remaining_ms: Math.max(0, closes - now) };
}

export function istHour(now = new Date()) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hourCycle: "h23" }).format(now));
  return Number.isFinite(h) ? h : 0;
}
// Staff hours match the existing bot (07:00-23:00 IST).
export function staffOnline(now = new Date()) {
  const h = istHour(now);
  return h >= 7 && h < 23;
}
