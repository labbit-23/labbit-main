import asyncio
import hashlib
import hmac
import math
import os
import re
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI, HTTPException, Request, Response

from . import config, poller
from .auth import get_db, require_panel
from .db import Db
from .history import N_BUCKETS, BUCKET_SECONDS, build_uptime, bucket_start, uptime_from_logs

MAX_BODY = 4096
RATE_LIMIT = 6
RATE_WINDOW = 60.0


@asynccontextmanager
async def lifespan(app):
    task = None
    if os.environ.get("ENABLE_BACKGROUND", "1") == "1":
        task = asyncio.create_task(poller.run_forever(app))
    yield
    if task:
        task.cancel()


def safe_url(u):
    """Only http(s) URLs are emitted; CHANGE-ME placeholders and anything else become None ('not configured')."""
    if not isinstance(u, str) or not re.match(r"^https?://", u, re.I) or "change-me" in u.lower():
        return None
    return u


def create_app(db=None):
    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.db = db if db is not None else Db()
    app.state.snap_cache = {}
    app.state.hb_times = {}  # node_id -> [monotonic timestamps]

    def rate_ok(node_id):
        now = time.monotonic()
        q = [t for t in app.state.hb_times.get(node_id, []) if now - t < RATE_WINDOW]
        if len(q) >= RATE_LIMIT:
            app.state.hb_times[node_id] = q
            return False
        q.append(now)
        app.state.hb_times[node_id] = q
        return True

    @app.get("/health")
    def health():
        return {"ok": True}

    @app.post("/heartbeat", status_code=204)
    async def heartbeat(request: Request, db=Depends(get_db)):
        if not config.heartbeat_enabled():
            raise HTTPException(404, "not found")
        h = request.headers.get("authorization", "")
        token = h[7:].strip() if h.lower().startswith("bearer ") else ""
        if not token:
            raise HTTPException(401, "unauthorized")
        try:
            if int(request.headers.get("content-length") or 0) > MAX_BODY:
                raise HTTPException(413, "too large")
        except ValueError:
            raise HTTPException(400, "bad length")
        raw = await request.body()
        if len(raw) > MAX_BODY:
            raise HTTPException(413, "too large")
        try:
            import json
            body = json.loads(raw)
            node_id = body["node_id"]
            assert isinstance(node_id, str) and isinstance(body.get("services", {}), dict)
        except Exception:
            raise HTTPException(400, "bad body")
        expected = db.get_token_hash(node_id) or ""
        got = hashlib.sha256(token.encode()).hexdigest()
        # Always run a constant-time compare (dummy hash if node unknown/no hash).
        # Unknown nodes still cost one DB lookup; nginx per-IP limiting bounds that.
        if not hmac.compare_digest(got, expected or "0" * 64) or not expected:
            raise HTTPException(401, "unauthorized")
        if not rate_ok(node_id):
            raise HTTPException(429, "rate limited")
        payload = {"services": {str(k)[:64]: ("up" if v == "up" else "down")
                                for k, v in list(body.get("services", {}).items())[:50]}}
        for k in ("load", "disk_pct"):
            v = body.get(k)
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                if not math.isfinite(v):
                    raise HTTPException(400, "bad body")
                payload[k] = v
        db.insert_heartbeat(node_id, payload)
        return Response(status_code=204)

    @app.get("/me")
    def me(user=Depends(require_panel)):
        return {"role": user["role"]}

    def live(db):
        ttl = config.snapshot_ttl()
        c = app.state.snap_cache
        if ttl > 0 and c.get("v") is not None and time.monotonic() - c["t"] < ttl:
            return c["v"]
        v = poller.snapshot(db)
        c["v"], c["t"] = v, time.monotonic()
        return v

    def coarse(state):
        # degraded still works => 'up'; unreachable/no service => 'unknown'
        return {"up": "up", "degraded": "up", "down": "down"}.get(state, "unknown")

    @app.get("/menu")
    def menu(user=Depends(require_panel), db=Depends(get_db)):
        rows = db.list_menu()
        svc_state = {}
        if any(r.get("service_id") for r in rows):
            try:
                _, _, states = live(db)
                for ns in states.values():
                    svc_state.update(ns["services"])
            except Exception:
                svc_state = {}
        out = []
        for r in sorted(rows, key=lambda r: r.get("sort", 0)):
            t = {"id": r["id"], "label": r["label"], "group": r["group_name"], "url": safe_url(r["url"]),
                 "dot": coarse(svc_state.get(r.get("service_id"))), "pinned": bool(r.get("pinned")),
                 "admin_console": bool(r["admin_console"])}
            out.append(t)
        return out

    @app.get("/monitor/nodes")
    def monitor_nodes(user=Depends(require_panel), db=Depends(get_db)):
        nodes, services, states = live(db)
        labels = {s["id"]: s["label"] for s in services}
        out = []
        for n in nodes:
            s = states[n["id"]]
            out.append({"id": n["id"], "label": n["label"], "state": s["state"],
                        "last_seen": s["last_seen"].isoformat() if s["last_seen"] else None,
                        "detail": s["detail"], "quiet": bool(n.get("quiet")),
                        "expected_offline": bool(n.get("quiet")) and s["state"] == "unreachable"
                                                and s["detail"].get("cause") == "self",
                        "expected_offline_note": n.get("expected_offline"),
                        "services": [{"id": sid, "label": labels.get(sid, sid), "state": st}
                                     for sid, st in s["services"].items()]})
        return out

    @app.get("/monitor/nodes/{node_id}/uptime")
    def uptime(node_id: str, user=Depends(require_panel), db=Depends(get_db)):
        if not db.node_exists(node_id):
            raise HTTPException(404, "not found")
        now = datetime.now(timezone.utc)
        since = bucket_start(now) - timedelta(seconds=BUCKET_SECONDS * (N_BUCKETS - 1))
        node = next(n for n in db.list_nodes() if n["id"] == node_id)
        node_map = [m for m in db.list_map() if m["node_id"] == node_id]
        res = uptime_from_logs(node, node_map, db.log_buckets(node_map, since), now) if node_map else None
        return res or build_uptime(db.history(node_id, since), now, bool(node.get("quiet")))

    return app


app = create_app()
