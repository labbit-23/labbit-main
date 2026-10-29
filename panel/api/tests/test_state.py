from datetime import datetime, timedelta, timezone

from app.history import uptime_from_logs, bucket_start
from app.state import compute_states, cto_status_to_service_state

NOW = datetime(2026, 10, 28, 12, 0, tzinfo=timezone.utc)
NODES = [
    {"id": "db", "depends_on": []},
    {"id": "app", "depends_on": ["db"]},
    {"id": "mirth", "depends_on": ["app"]},
    {"id": "solo", "depends_on": []},
    {"id": "lab", "depends_on": []},
]
M = lambda i, n, k, **kw: {"id": i, "node_id": n, "service_key": k, "is_prefix": False, "required": True, "probe": False, **kw}
MAP = [
    M("pg", "db", "vps_host__vps2"),
    M("ui", "app", "labit_core__vps1"), M("opt", "app", "report_sender__vps1", required=False),
    M("m", "mirth", "mirth_dicom", probe=True),
    M("s", "solo", "vps_host__x"), M("sp", "solo", "pm2_", is_prefix=True, required=False),
    M("lm", "lab", "mirth_lab", probe=True),
]


def r(key, status="healthy", age=10):
    return {"service_key": key, "status": status, "updated_at": NOW - timedelta(seconds=age)}


ALL_UP = [r("vps_host__vps2"), r("labit_core__vps1"), r("report_sender__vps1"), r("mirth_dicom"),
          r("vps_host__x"), r("mirth_lab"), r("pm2_a__x")]


def run(rows):
    return compute_states(NODES, MAP, rows, NOW, 180)


def states(res): return {k: v["state"] for k, v in res.items()}


def test_status_vocabulary_mapping():
    assert cto_status_to_service_state("healthy") == "up"
    assert cto_status_to_service_state("degraded") == "degraded"
    assert cto_status_to_service_state("down") == "down"
    assert cto_status_to_service_state("unknown") == "degraded"


def test_all_online():
    assert set(states(run(ALL_UP)).values()) == {"online"}


def test_cascade_offline_node_dependents_unreachable_not_service_down():
    rows = [x for x in ALL_UP if x["service_key"] != "vps_host__vps2"]  # db has no rows -> unreachable
    rows = [r("labit_core__vps1", "down") if x["service_key"] == "labit_core__vps1" else x for x in rows]
    res = run(rows)
    assert res["db"]["state"] == "unreachable"
    assert res["app"]["state"] == "unreachable"      # would otherwise be service_down
    assert res["mirth"]["state"] == "unreachable"    # transitive
    assert set(res["app"]["services"].values()) == {"unreachable"}
    assert res["solo"]["state"] == "online"
    assert "service_down" not in states(res).values()


def test_service_down_required():
    res = run([r("labit_core__vps1", "down") if x["service_key"] == "labit_core__vps1" else x for x in ALL_UP])
    assert res["app"]["state"] == "service_down" and res["app"]["services"]["ui"] == "down"


def test_degraded_optional_down_and_degraded_status():
    rows = [r("report_sender__vps1", "down") if x["service_key"] == "report_sender__vps1" else x for x in ALL_UP]
    assert run(rows)["app"]["state"] == "degraded"
    rows = [r("labit_core__vps1", "degraded") if x["service_key"] == "labit_core__vps1" else x for x in ALL_UP]
    res = run(rows)
    assert res["app"]["state"] == "degraded" and res["app"]["services"]["ui"] == "degraded"


def test_stale_rows_unreachable_and_boundary():
    rows = [r("vps_host__x", age=181) if x["service_key"] == "vps_host__x" else x for x in ALL_UP]
    rows = [x for x in rows if x["service_key"] != "pm2_a__x"] + [r("pm2_a__x", age=900)]
    res = run(rows)
    assert res["solo"]["state"] == "unreachable" and res["solo"]["detail"]["reason"] == "stale"
    rows = [r("vps_host__x", age=180) if x["service_key"] == "vps_host__x" else x for x in ALL_UP]
    assert run(rows)["solo"]["state"] == "online"


def test_service_missing_while_node_reachable_is_down():
    rows = [x for x in ALL_UP if x["service_key"] != "report_sender__vps1"]
    res = run(rows)
    assert res["app"]["services"]["opt"] == "down" and res["app"]["state"] == "degraded"


def test_prefix_match_worst_wins():
    rows = ALL_UP + [r("pm2_b__x", "down")]
    res = run(rows)
    assert res["solo"]["services"]["sp"] == "down" and res["solo"]["state"] == "degraded"


def test_probe_only_node_down_is_unreachable_and_never_seen():
    rows = [r("mirth_lab", "down") if x["service_key"] == "mirth_lab" else x for x in ALL_UP]
    res = run(rows)
    assert res["lab"]["state"] == "unreachable" and res["lab"]["detail"]["reason"] == "probe_down"
    assert run([x for x in ALL_UP if x["service_key"] != "mirth_lab"])["lab"]["detail"]["reason"] == "never_seen"


def test_unmapped_node_not_monitored():
    res = compute_states([{"id": "dev", "depends_on": []}], [], [], NOW, 180)
    assert res["dev"]["state"] == "not_monitored" and res["dev"]["detail"]["reason"] == "unmapped"


def test_cycle_does_not_hang():
    nodes = [{"id": "a", "depends_on": ["b"]}, {"id": "b", "depends_on": ["a"]}]
    mp = [M("ma", "a", "ka"), M("mb", "b", "kb")]
    res = compute_states(nodes, mp, [], NOW, 180)
    assert res["a"]["state"] == res["b"]["state"] == "unreachable"


def test_uptime_from_logs():
    node = {"id": "app"}
    nm = [m for m in MAP if m["node_id"] == "app"]
    now = NOW
    b = bucket_start(now) - timedelta(seconds=300)
    logs = [{"bucket": b, "service_key": "labit_core__vps1", "status": "healthy"},
            {"bucket": b, "service_key": "report_sender__vps1", "status": "healthy"}]
    res = uptime_from_logs(node, nm, logs, now)
    assert len(res["buckets"]) == 288 and res["source"] == "cto_service_logs"
    states_ = [x["state"] for x in res["buckets"]]
    assert states_.count("online") == 1 and states_.count("unreachable") == 287
    assert uptime_from_logs(node, nm, [], now) is None


def test_probe_up_nonprobe_never_seen_is_reachable():
    # HIGH-2: mapped-but-never-emitted collector key must not make the node unreachable
    nodes = [{"id": "n", "depends_on": []}]
    mp = [M("c", "n", "vps_host__never", required=False), M("p", "n", "probe__vps", probe=True)]
    res = compute_states(nodes, mp, [r("probe__vps")], NOW, 180)
    assert res["n"]["state"] == "degraded"          # optional collector service missing, but reachable
    assert res["n"]["services"] == {"c": "down", "p": "up"}
    res = compute_states(nodes, mp, [r("probe__vps", "down")], NOW, 180)
    assert res["n"]["state"] == "unreachable" and res["n"]["detail"]["reason"] == "probe_down"


def test_unmapped_node_detail_text():
    res = compute_states([{"id": "dev", "depends_on": []}], [], [], NOW, 180)
    d = res["dev"]["detail"]
    assert d["reason"] == "unmapped" and d["cause"] == "self" and "Not monitored" in d["message"]


def test_dependency_cause_and_message():
    rows = [x for x in ALL_UP if x["service_key"] != "vps_host__vps2"]
    d = run(rows)["app"]["detail"]
    assert d["cause"] == "dependency" and d["via"] == "db" and "db" in d["message"]
    assert run(rows)["db"]["detail"]["cause"] == "self"


def test_per_entry_max_age():
    mp = [M("slow", "n", "supabase_main__vps", probe=True, max_age_seconds=600)]
    nodes = [{"id": "n", "depends_on": []}]
    assert compute_states(nodes, mp, [r("supabase_main__vps", age=400)], NOW, 180)["n"]["state"] == "online"
    assert compute_states(nodes, mp, [r("supabase_main__vps", age=601)], NOW, 180)["n"]["state"] == "unreachable"


def test_uptime_slow_probe_does_not_alternate():
    # probe every other bucket, max_age 600: must stay online, not flap
    node = {"id": "n"}
    mp = [M("slow", "n", "supabase_main__vps", probe=True, max_age_seconds=600)]
    end = bucket_start(NOW)
    logs = [{"bucket": end - timedelta(seconds=600 * i), "service_key": "supabase_main__vps", "status": "healthy"}
            for i in range(0, 40)]
    res = uptime_from_logs(node, mp, logs, NOW)
    tail = [b["state"] for b in res["buckets"][-60:]]
    assert set(tail) == {"online"} and "service_down" not in [b["state"] for b in res["buckets"]]


def test_uptime_pct_null_when_no_known_buckets():
    from app.history import build_uptime
    res = build_uptime([], NOW)
    assert res["uptime_pct"] is None and len(res["buckets"]) == 288


def test_not_monitored_does_not_cascade():
    nodes = [{"id": "db", "depends_on": []}, {"id": "app", "depends_on": ["db"]}, {"id": "mx", "depends_on": ["app"]}]
    mp = [M("ui", "app", "labit_core__vps1"), M("m", "mx", "mirth_dicom", probe=True)]
    res = compute_states(nodes, mp, [r("labit_core__vps1"), r("mirth_dicom")], NOW, 180)
    assert res["db"]["state"] == "not_monitored"
    assert res["app"]["state"] == "online" and res["mx"]["state"] == "online"


def test_real_unreachable_db_still_cascades():
    nodes = [{"id": "db", "depends_on": []}, {"id": "app", "depends_on": ["db"]}, {"id": "mx", "depends_on": ["app"]}]
    mp = [M("h", "db", "vps_host__vps2"), M("ui", "app", "labit_core__vps1"), M("m", "mx", "mirth_dicom", probe=True)]
    res = compute_states(nodes, mp, [r("labit_core__vps1"), r("mirth_dicom")], NOW, 180)
    assert res["db"]["state"] == "unreachable"
    assert res["app"]["state"] == res["mx"]["state"] == "unreachable"


def test_informational_entry_is_not_a_signal():
    nodes = [{"id": "db", "depends_on": []}, {"id": "app", "depends_on": ["db"]}]
    mp = [M("hs", "db", "supabase_main__vps", informational=True, required=False), M("ui", "app", "labit_core__vps1")]
    res = compute_states(nodes, mp, [r("supabase_main__vps"), r("labit_core__vps1")], NOW, 180)
    assert res["db"]["state"] == "not_monitored" and res["db"]["services"] == {"hs": "up"}
    assert res["app"]["state"] == "online"
    res = compute_states(nodes, mp, [r("labit_core__vps1")], NOW, 180)
    assert res["db"]["state"] == "not_monitored" and res["db"]["services"] == {"hs": "down"}


def test_quiet_uptime_excludes_off_hours():
    from app.history import _pct
    b = [{"t": "x", "state": "online"}] * 10 + [{"t": "x", "state": "unreachable"}] * 90
    assert _pct(b) == 10.0 and _pct(b, quiet=True) == 100.0
    assert _pct([{"t": "x", "state": "unreachable"}], quiet=True) is None
    assert _pct([{"t": "x", "state": "not_monitored"}]) is None
