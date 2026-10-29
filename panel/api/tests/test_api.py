import json
from datetime import datetime, timezone

from conftest import auth

GOOD = {"Authorization": "Bearer good"}

import pytest


@pytest.fixture(autouse=True)
def hb_on(monkeypatch):
    monkeypatch.setenv("HEARTBEAT_ENABLED", "1")


def hb_body(**kw):
    return json.dumps({"node_id": "app-vps", "services": {"core": "up"}, **kw})


def test_health_open():
    from fastapi.testclient import TestClient
    from conftest import FakeDb
    from app.main import create_app
    r = TestClient(create_app(FakeDb())).get("/health")
    assert r.status_code == 200 and r.json() == {"ok": True}


def test_no_key_401_everywhere(client):
    for path in ["/me", "/menu", "/monitor/nodes", "/monitor/nodes/db-vps/uptime"]:
        assert client.get(path).status_code == 401, path
        assert client.get(path, headers={"X-Panel-Key": "wrong"}).status_code == 401, path
        assert client.get(path, headers={"Authorization": "Bearer test-key"}).status_code == 401, path


def test_fail_closed_when_env_unset(client, monkeypatch):
    monkeypatch.delenv("PANEL_INTERNAL_KEY", raising=False)
    assert client.get("/menu", headers={"X-Panel-Key": ""}).status_code == 401
    assert client.get("/menu", headers={"X-Panel-Key": "test-key"}).status_code == 401
    assert client.get("/health").status_code == 200


def test_me(client):
    assert client.get("/me", headers=auth()).json() == {"role": "cto"}


def test_menu_full_cto_shape(client):
    body = client.get("/menu", headers=auth()).json()
    assert [t["id"] for t in body] == ["radiology-dexa", "labit-one", "erpnext"]
    assert set(body[0]) == {"id", "label", "group", "url", "dot", "pinned", "admin_console"}


def test_cto_menu_all_and_dot(client, db):
    from conftest import row
    db.rows = [row("labit_core__vps1"), row("vps_host__vps2")]
    body = client.get("/menu", headers=auth()).json()
    assert {t["id"] for t in body} == {"radiology-dexa", "labit-one", "erpnext"}
    dots = {t["id"]: t["dot"] for t in body}
    assert dots["labit-one"] == "up" and dots["erpnext"] == "up" and dots["radiology-dexa"] == "unknown"


def test_dot_unknown_when_node_unreachable(client):
    body = client.get("/menu", headers=auth()).json()
    assert body[0]["dot"] == "unknown"


def test_not_monitored_db_does_not_cascade(client, db):
    from conftest import row
    import conftest
    conftest_nodes = conftest.NODES
    # db-vps has no signal at all
    orig = conftest.MAP
    db.list_map = lambda: [m for m in orig if m["node_id"] != "db-vps"]
    db.rows = [row("labit_core__vps1"), row("mirth_lab")]
    nodes = {n["id"]: n for n in client.get("/monitor/nodes", headers=auth()).json()}
    assert nodes["db-vps"]["state"] == "not_monitored"
    assert nodes["app-vps"]["state"] == "online"
    assert nodes["mirth-lab"]["state"] == "online"


def test_cto_monitor_nodes_and_uptime(client):
    r = client.get("/monitor/nodes", headers=auth())
    assert r.status_code == 200
    ids = {n["id"]: n for n in r.json()}
    assert set(ids) == {"db-vps", "app-vps", "mirth-lab"}
    u = client.get("/monitor/nodes/db-vps/uptime", headers=auth()).json()
    assert len(u["buckets"]) == 288 and u["uptime_pct"] is None
    assert client.get("/monitor/nodes/nope/uptime", headers=auth()).status_code == 404


def test_heartbeat_good(client, db):
    r = client.post("/heartbeat", content=hb_body(load=1.2, disk_pct=40), headers=GOOD)
    assert r.status_code == 204
    assert db.inserted[0][0] == "app-vps"
    assert db.inserted[0][1]["services"] == {"core": "up"} and db.inserted[0][1]["disk_pct"] == 40


def test_heartbeat_bad_or_missing_token(client, db):
    assert client.post("/heartbeat", content=hb_body()).status_code == 401
    assert client.post("/heartbeat", content=hb_body(), headers={"Authorization": "Bearer bad"}).status_code == 401
    unknown = json.dumps({"node_id": "ghost", "services": {}})
    assert client.post("/heartbeat", content=unknown, headers=GOOD).status_code == 401
    # the panel key is not a node token
    assert client.post("/heartbeat", content=hb_body(), headers=auth()).status_code == 401
    assert db.inserted == []


def test_heartbeat_node_without_hash_rejected(client, db):
    db.hashes["app-vps"] = None
    assert client.post("/heartbeat", content=hb_body(), headers=GOOD).status_code == 401


def test_heartbeat_size_limit(client):
    big = json.dumps({"node_id": "app-vps", "services": {}, "pad": "x" * 5000})
    assert client.post("/heartbeat", content=big, headers=GOOD).status_code == 413


def test_heartbeat_rate_limit(client):
    codes = [client.post("/heartbeat", content=hb_body(), headers=GOOD).status_code for _ in range(8)]
    assert codes[:6] == [204] * 6 and codes[6:] == [429, 429]


def test_heartbeat_bad_body(client):
    assert client.post("/heartbeat", content="not json", headers=GOOD).status_code == 400


def test_admin_console_key(client):
    cto = {t["id"]: t for t in client.get("/menu", headers=auth()).json()}
    assert cto["erpnext"]["admin_console"] is True and cto["labit-one"]["admin_console"] is False


def test_heartbeat_nan_inf_400(client):
    for v in ("NaN", "Infinity"):
        body = '{"node_id":"app-vps","services":{},"load":%s}' % v
        assert client.post("/heartbeat", content=body, headers=GOOD).status_code == 400


def test_pinned_flag(client):
    for who in ("u-a", "u-b"):
        body = {t["id"]: t for t in client.get("/menu", headers=auth(who)).json()}
        assert body["radiology-dexa"]["pinned"] is True and body["labit-one"]["pinned"] is False


def test_heartbeat_404_when_disabled(client, monkeypatch):
    monkeypatch.delenv("HEARTBEAT_ENABLED", raising=False)
    assert client.post("/heartbeat", content=hb_body(), headers=GOOD).status_code == 404
    monkeypatch.setenv("HEARTBEAT_ENABLED", "0")
    assert client.post("/heartbeat", content=hb_body(), headers=GOOD).status_code == 404


def test_monitor_quiet_node_and_cascade(client, db):
    from conftest import row
    db.rows = [row("labit_core__vps1", "down"), row("mirth_lab", "down")]  # db-vps has no rows
    nodes = {n["id"]: n for n in client.get("/monitor/nodes", headers=auth()).json()}
    assert nodes["db-vps"]["state"] == "unreachable"
    assert nodes["app-vps"]["state"] == "unreachable"      # cascade, not service_down
    assert nodes["mirth-lab"]["state"] == "unreachable" and nodes["mirth-lab"]["quiet"] is True
    assert nodes["mirth-lab"]["expected_offline"] is True and nodes["mirth-lab"]["expected_offline_note"]


def test_old_node_ctrls_server_gone(client):
    ids = {n["id"] for n in client.get("/monitor/nodes", headers=auth()).json()}
    assert "ctrls-server" not in ids


def test_expected_offline_false_when_cause_is_dependency(client, db):
    from conftest import row
    db.rows = [row("mirth_lab", "healthy")]   # mirth-lab fine itself; app-vps unreachable
    nodes = {n["id"]: n for n in client.get("/monitor/nodes", headers=auth()).json()}
    assert nodes["mirth-lab"]["state"] == "unreachable" and nodes["mirth-lab"]["detail"]["cause"] == "dependency"
    assert nodes["mirth-lab"]["expected_offline"] is False


def test_uptime_pct_null_ok(client):
    u = client.get("/monitor/nodes/db-vps/uptime", headers=auth()).json()
    assert u["uptime_pct"] is None and u["source"] == "status_history"


def test_menu_urls_sanitised(client, monkeypatch):
    import conftest
    bad = [dict(conftest.MENU[0], id="x1", url="javascript:alert(1)"),
           dict(conftest.MENU[0], id="x2", url="https://CHANGE-ME-tailnet/"),
           dict(conftest.MENU[0], id="x3", url="https://ok.example/")]
    monkeypatch.setattr(conftest.FakeDb, "list_menu", lambda self: bad)
    body = {t["id"]: t["url"] for t in client.get("/menu", headers=auth()).json()}
    assert body == {"x1": None, "x2": None, "x3": "https://ok.example/"}
