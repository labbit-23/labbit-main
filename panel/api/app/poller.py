"""Background cycle: read the CTO pipeline, compute states, persist node_status + 5-min history bucket."""
import asyncio
import logging
from datetime import datetime, timezone

from . import config
from .history import bucket_rows
from .state import compute_states

log = logging.getLogger("panel.cycle")


def collect_rows(db, nodes, svc_map):
    """cto_service_latest rows, plus (only if HEARTBEAT_ENABLED) heartbeats as 'hb:<node>:<svc>' rows."""
    rows = list(db.latest_rows(svc_map))
    if config.heartbeat_enabled():
        for nid, hb in db.latest_heartbeats([n["id"] for n in nodes]).items():
            for sid, st in ((hb.get("payload") or {}).get("services") or {}).items():
                rows.append({"service_key": f"hb:{nid}:{sid}",
                             "status": "healthy" if st == "up" else "down", "updated_at": hb["received_at"]})
    return rows


def snapshot(db, now=None):
    now = now or datetime.now(timezone.utc)
    nodes, svc_map = db.list_nodes(), db.list_map()
    rows = collect_rows(db, nodes, svc_map)
    return nodes, svc_map, compute_states(nodes, svc_map, rows, now)


def persist(db, states, now=None):
    now = now or datetime.now(timezone.utc)
    db.upsert_status([{"node_id": nid, "state": s["state"], "last_seen": s["last_seen"],
                       "detail": s["detail"], "updated_at": now} for nid, s in states.items()])
    db.upsert_history(bucket_rows(states, now))


async def run_forever(app):
    while True:
        try:
            _, _, states = await asyncio.to_thread(snapshot, app.state.db)
            await asyncio.to_thread(persist, app.state.db, states)
        except Exception:
            log.exception("status cycle failed")
        await asyncio.sleep(config.poll_interval())
