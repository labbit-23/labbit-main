"""Pure state computation. No I/O.

Source of truth is the existing CTO pipeline (public.cto_service_latest). Rows are matched to panel
services through labit_ops.node_service_map.

compute_states(nodes, svc_map, rows, now, stale_seconds=None) ->
  {node_id: {"state", "last_seen", "detail", "services": {map_id: 'up'|'degraded'|'down'|'unreachable'}}}

nodes:   [{id, depends_on, ...}]
svc_map: [{id, node_id, service_key, is_prefix, required, probe, informational?}]
  informational=true: shown as a service but never counts as a health signal (cannot prove reachability,
  never required). A node with no non-informational entries is 'not_monitored' (not unreachable, no cascade).
rows:    [{service_key, status ('healthy'|'degraded'|'down'|'unknown'), updated_at}]
"""
from datetime import datetime

from . import config

REASON_TEXT = {
    "unmapped": "Not monitored: no health signal is mapped to this node",
    "never_seen": "No data has been received for any mapped service key",
    "stale": "Mapped data is older than the allowed age",
    "probe_down": "Probes report this node down and no collector data is fresh",
}
_RANK = {"up": 0, "degraded": 1, "down": 2}


def cto_status_to_service_state(status):
    """THE single mapping from CTO status vocabulary to panel service state.
    healthy->up, degraded->degraded, down->down; unknown/anything else->degraded (we cannot claim it is up,
    but unknown is not proof of an outage either)."""
    return {"healthy": "up", "degraded": "degraded", "down": "down"}.get(str(status).lower(), "degraded")


def _ts(v):
    if isinstance(v, str):
        return datetime.fromisoformat(v.replace("Z", "+00:00"))
    return v


def _matches(entry, key):
    return key.startswith(entry["service_key"]) if entry.get("is_prefix") else key == entry["service_key"]


def _dependents_closure(nodes, root):
    """All nodes that transitively depend on `root` (cycle safe)."""
    out, frontier = set(), {root}
    while frontier:
        nxt = set()
        for n in nodes:
            if n["id"] not in out and n["id"] != root and set(n.get("depends_on") or []) & frontier:
                nxt.add(n["id"])
        out |= nxt
        frontier = nxt
    return out


def compute_states(nodes, svc_map, rows, now, stale_seconds=None):
    stale = config.stale_seconds() if stale_seconds is None else stale_seconds
    entries_by_node = {}
    for e in svc_map:
        entries_by_node.setdefault(e["node_id"], []).append(e)
    parsed = [{"service_key": r["service_key"], "status": r["status"], "t": _ts(r["updated_at"])} for r in rows]

    def fresh(r, e):
        limit = e.get("max_age_seconds") or stale
        return (now - r["t"]).total_seconds() <= limit

    result, own_unreachable = {}, set()
    for n in nodes:
        nid = n["id"]
        all_entries = entries_by_node.get(nid, [])
        entries = [e for e in all_entries if not e.get("informational")]
        info = [e for e in all_entries if e.get("informational")]
        if not entries:
            # No health signal at all: NOT unreachable, never cascades to dependents.
            isvc = {}
            for e in info:
                fr = [r for r in parsed if _matches(e, r["service_key"]) and fresh(r, e)]
                isvc[e["id"]] = (max((cto_status_to_service_state(r["status"]) for r in fr), key=_RANK.get)
                                 if fr else "down")
            result[nid] = {"state": "not_monitored", "last_seen": None,
                           "detail": {"reason": "unmapped", "cause": "self", "message": REASON_TEXT["unmapped"]},
                           "services": isvc}
            continue
        matched = {e["id"]: [r for r in parsed if _matches(e, r["service_key"])] for e in entries}
        all_rows = [r for rs in matched.values() for r in rs]
        seen = max((r["t"] for r in all_rows), default=None)

        # Reachability: any fresh non-probe row; else any fresh non-down probe row.
        # Mapped keys that never emit therefore cannot make a node unreachable by themselves.
        nonprobe_ok = any(fresh(r, e) for e in entries if not e.get("probe") for r in matched[e["id"]])
        probe_rows = [(e, r) for e in entries if e.get("probe") for r in matched[e["id"]]]
        probe_ok = any(fresh(r, e) and cto_status_to_service_state(r["status"]) != "down" for e, r in probe_rows)
        reachable = nonprobe_ok or probe_ok
        if reachable:
            reason = None
        elif not entries:
            reason = "unmapped"
        elif any(fresh(r, e) for e in entries for r in matched[e["id"]]):
            reason = "probe_down"
        else:
            reason = "stale" if seen else "never_seen"
        detail, svc_states = {}, {}
        if not reachable:
            own_unreachable.add(nid)
            detail["reason"] = reason
            detail["cause"] = "self"
            detail["message"] = REASON_TEXT[reason]
            state = "unreachable"
            svc_states = {e["id"]: "unreachable" for e in entries}
        else:
            down_req, down_opt, degraded = [], [], []
            for e in entries:
                fr = [r for r in matched[e["id"]] if fresh(r, e)]
                if fr:
                    st = max((cto_status_to_service_state(r["status"]) for r in fr), key=_RANK.get)
                else:
                    st = "down"
                svc_states[e["id"]] = st
                if st == "down":
                    (down_req if e.get("required", True) else down_opt).append(e["id"])
                elif st == "degraded":
                    degraded.append(e["id"])
            if down_req:
                state = "service_down"; detail["down_services"] = down_req
            elif down_opt or degraded:
                state = "degraded"; detail["down_services"] = down_opt; detail["degraded_services"] = degraded
            else:
                state = "online"
        for e in info:
            fr = [r for r in parsed if _matches(e, r["service_key"]) and fresh(r, e)]
            svc_states[e["id"]] = (max((cto_status_to_service_state(r["status"]) for r in fr), key=_RANK.get)
                                   if fr else "down")
            if not reachable:
                svc_states[e["id"]] = "unreachable"
        result[nid] = {"state": state, "last_seen": seen, "detail": detail, "services": svc_states}

    # Cascade: dependents of an unreachable node are unreachable, never service_down.
    for root in own_unreachable:
        for dep in _dependents_closure(nodes, root):
            r = result[dep]
            if dep in own_unreachable or result[dep]["state"] == "not_monitored":
                continue  # already unreachable in its own right (keep 'self' cause) / has no signal to judge
            r["state"] = "unreachable"
            r["detail"] = {"reason": "dependency_unreachable", "cause": "dependency", "via": root,
                           "message": f"Dependency {root} is unreachable"}
            r["services"] = {sid: "unreachable" for sid in r["services"]}
    return result
