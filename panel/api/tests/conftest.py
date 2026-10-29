import hashlib
import os
import sys
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["PANEL_INTERNAL_KEY"] = "test-key"
os.environ["ENABLE_BACKGROUND"] = "0"

from app.main import create_app  # noqa: E402

NOW = datetime.now(timezone.utc)
NODES = [
    {"id": "db-vps", "label": "DB", "kind": "cloud", "depends_on": [], "quiet": False, "expected_offline": None, "sort": 1},
    {"id": "app-vps", "label": "App", "kind": "cloud", "depends_on": ["db-vps"], "quiet": False, "expected_offline": None, "sort": 2},
    {"id": "mirth-lab", "label": "Mirth lab", "kind": "local", "depends_on": ["app-vps"], "quiet": True,
     "expected_offline": "off overnight", "sort": 3},
]
MAP = [
    {"id": "db.host", "node_id": "db-vps", "service_key": "vps_host__vps2", "is_prefix": False, "label": "host", "required": True, "probe": False},
    {"id": "app.core", "node_id": "app-vps", "service_key": "labit_core__vps1", "is_prefix": False, "label": "core", "required": True, "probe": False},
    {"id": "lab.mirth", "node_id": "mirth-lab", "service_key": "mirth_lab", "is_prefix": False, "label": "mirth", "required": True, "probe": True},
]
MENU = [
    {"id": "radiology-dexa", "label": "Radiology", "group_name": "Radiology", "url": "https://r.example/radiology/",
     "admin_console": False, "service_id": None, "sort": 5, "pinned": True, "pin_sort": 10},
    {"id": "labit-one", "label": "Labit One", "group_name": "Ops", "url": "https://labit.sdrc.in/",
     "admin_console": False, "service_id": "app.core", "sort": 10, "pinned": False, "pin_sort": 0},
    {"id": "erpnext", "label": "ERPNext", "group_name": "Admin", "url": "https://tailnet-host:8000/",
     "admin_console": True, "service_id": "db.host", "sort": 20, "pinned": False, "pin_sort": 0},
]


class FakeDb:
    def __init__(self):
        self.hashes = {"app-vps": hashlib.sha256(b"good").hexdigest()}
        self.rows = []          # cto_service_latest rows
        self.hbs = {}
        self.inserted = []
        self.logs = []

    def list_nodes(self): return NODES
    def list_map(self): return MAP
    def latest_rows(self, m): return list(self.rows)
    def log_buckets(self, m, since): return list(self.logs)
    def get_token_hash(self, nid): return self.hashes.get(nid)
    def latest_heartbeats(self, ids): return {k: v for k, v in self.hbs.items() if k in ids}
    def insert_heartbeat(self, nid, payload): self.inserted.append((nid, payload))
    def list_menu(self): return MENU
    def node_exists(self, nid): return nid in {n["id"] for n in NODES}
    def history(self, nid, since): return []
    def upsert_status(self, rows): pass
    def upsert_history(self, rows): pass


def row(key, status="healthy", age=10):
    from datetime import timedelta
    return {"service_key": key, "status": status, "updated_at": NOW - timedelta(seconds=age)}


@pytest.fixture
def db(): return FakeDb()


@pytest.fixture
def client(db): return TestClient(create_app(db))


def auth(sub="u-cto"): return {"X-Panel-Key": "test-key", "X-Panel-User": sub}
