export const safeHref = (u) =>
  typeof u === "string" && /^https?:\/\//i.test(u) ? u : null;

const IST = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

// Always IST, never UTC.
export function formatIST(iso) {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return `${IST.format(d)} IST`;
}

export const STATE_COLORS = {
  online: "#22c55e",
  up: "#22c55e",
  degraded: "#f59e0b",
  unreachable: "#94a3b8",
  unreachable_: "#94a3b8",
  service_down: "#ef4444",
  down: "#ef4444",
  not_monitored: "#64748b",
  unknown: "#334155",
};

export const NODE_STATE_LABEL = {
  online: "Online",
  degraded: "Degraded",
  unreachable: "Unreachable",
  service_down: "Service down",
  not_monitored: "Not monitored",
};

export async function panelFetch(path) {
  const res = await fetch(path, { cache: "no-store", credentials: "same-origin" });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Session expired");
  }
  if (res.status === 403) throw new Error("Not permitted");
  if (!res.ok) throw new Error("Failed to load");
  return res.json();
}
