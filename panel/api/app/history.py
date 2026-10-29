from datetime import datetime, timedelta, timezone

from .state import compute_states

BUCKET_SECONDS = 300
N_BUCKETS = 288


def bucket_start(now):
    ts = int(now.timestamp()) // BUCKET_SECONDS * BUCKET_SECONDS
    return datetime.fromtimestamp(ts, tz=timezone.utc)


def bucket_rows(states, now):
    b = bucket_start(now).isoformat()
    return [{"node_id": nid, "bucket": b, "state": s["state"]} for nid, s in states.items()]


def _pct(buckets, quiet=False):
    """Percent of known buckets online/degraded; None when there are no known buckets (documented in CONTRACT).
    'not_monitored' buckets carry no information and are excluded. For quiet nodes (powered off outside lab
    hours) 'unreachable' buckets are excluded too, so off-hours do not drag the figure down (lab hours are not
    known to the API, so a daytime outage of a quiet node is excluded as well)."""
    skip = {"unknown", "not_monitored"} | ({"unreachable"} if quiet else set())
    known = [b for b in buckets if b["state"] not in skip]
    good = [b for b in known if b["state"] in ("online", "degraded")]
    return round(100.0 * len(good) / len(known), 2) if known else None


def _grid(now):
    end = bucket_start(now)
    return [end - timedelta(seconds=BUCKET_SECONDS * i) for i in range(N_BUCKETS - 1, -1, -1)]


def _dt(t):
    return datetime.fromisoformat(t.replace("Z", "+00:00")) if isinstance(t, str) else t


def build_uptime(rows, now, quiet=False):
    """From the panel's own status_history. 288 buckets; missing -> 'unknown'."""
    by = {bucket_start(_dt(r["bucket"])): r["state"] for r in rows}
    buckets = [{"t": t.isoformat(), "state": by.get(t, "unknown")} for t in _grid(now)]
    return {"buckets": buckets, "uptime_pct": _pct(buckets, quiet), "source": "status_history"}


def uptime_from_logs(node, node_map, log_rows, now):
    """From cto_service_logs aggregates (bucket, service_key, status). Per-bucket node state uses the same
    compute_states (no cross-node cascade; a bucket with no rows is 'unreachable'). Returns None if there
    are no log rows at all so the caller can fall back to status_history."""
    if not log_rows:
        return None
    per = {}
    for r in log_rows:
        t = bucket_start(_dt(r["bucket"]))
        per.setdefault(t, []).append({"service_key": r["service_key"], "status": r["status"]})
    solo = {"id": node["id"], "depends_on": []}
    latest = {}   # service_key -> (bucket time, status), carried forward so slow probes do not alternate down
    buckets = []
    for t in _grid(now):
        for r in per.get(t, []):
            latest[r["service_key"]] = (t, r["status"])
        if not latest:
            buckets.append({"t": t.isoformat(), "state": "unreachable"})
            continue
        rows = [{"service_key": k, "status": st, "updated_at": ts} for k, (ts, st) in latest.items()]
        # evaluated at bucket end; entries with max_age_seconds=None allow one bucket of age
        state = compute_states([solo], node_map, rows, t + timedelta(seconds=BUCKET_SECONDS),
                               stale_seconds=BUCKET_SECONDS)[node["id"]]["state"]
        buckets.append({"t": t.isoformat(), "state": state})
    return {"buckets": buckets, "uptime_pct": _pct(buckets, bool(node.get("quiet"))), "source": "cto_service_logs"}
