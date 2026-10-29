"""Thin direct-SQL layer (psycopg 3) connecting as the limited role labit_ops_api via PANEL_DB_DSN.
Every DB need is a method here so tests substitute a fake with the same interface. A fresh short-lived
connection per call keeps this simple; volume is tiny."""
import os
from contextlib import contextmanager
from datetime import datetime, timezone

MAX_ROWS = 20000  # hard cap on any unbounded-looking select


def _like_escape(s):
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


class Db:
    def __init__(self, dsn=None, lab_id=None):
        self.dsn = dsn or os.environ.get("PANEL_DB_DSN", "")
        self.lab_id = lab_id or os.environ.get("PANEL_LAB_ID") or None
        self._pool = None

    def _get_pool(self):
        if not self.dsn:  # fail closed: never fall back to libpq PG* env / local socket
            raise RuntimeError("PANEL_DB_DSN is not set")
        if self._pool is None:
            from psycopg.rows import dict_row
            from psycopg_pool import ConnectionPool
            self._pool = ConnectionPool(self.dsn, min_size=1, max_size=4, open=True, timeout=5,
                                        kwargs={"row_factory": dict_row, "connect_timeout": 5})
        return self._pool

    @contextmanager
    def _cur(self):
        with self._get_pool().connection() as conn:
            with conn.cursor() as cur:
                yield cur

    def _all(self, sql, args=()):
        with self._cur() as cur:
            cur.execute(sql, args)
            return cur.fetchall()

    def _exec(self, sql, args=()):
        with self._cur() as cur:
            cur.execute(sql, args)

    def list_nodes(self):
        return self._all("select id,label,kind,host,depends_on,quiet,expected_offline,sort "
                         "from labit_ops.nodes order by sort,id")

    def list_map(self):
        return self._all("select id,node_id,service_key,is_prefix,label,required,probe,informational,max_age_seconds,sort "
                         "from labit_ops.node_service_map order by sort,id")

    def _key_filter(self, svc_map):
        exact = [m["service_key"] for m in svc_map if not m["is_prefix"]]
        pref = [_like_escape(m["service_key"]) + "%" for m in svc_map if m["is_prefix"]]
        return exact, pref

    def latest_rows(self, svc_map):
        """Rows of public.cto_service_latest relevant to the map (bounded, deterministic)."""
        exact, pref = self._key_filter(svc_map)
        if not exact and not pref:
            return []
        sql = ("select service_key,status,updated_at from public.cto_service_latest "
               "where (service_key = any(%s) or service_key like any(%s)) "
               + ("and lab_id = %s " if self.lab_id else "") + "order by service_key limit %s")
        args = [exact, pref] + ([self.lab_id] if self.lab_id else []) + [MAX_ROWS]
        return self._all(sql, args)

    def log_buckets(self, node_map, since):
        """Per 5-min bucket and service_key, worst status from public.cto_service_logs (aggregated in SQL)."""
        exact, pref = self._key_filter(node_map)
        if not exact and not pref:
            return []
        sql = ("select date_bin('5 minutes', checked_at, timestamptz 'epoch') as bucket, service_key, "
               "(array_agg(status order by case status when 'down' then 0 when 'degraded' then 1 "
               "when 'unknown' then 2 else 3 end))[1] as status "
               "from public.cto_service_logs where checked_at >= %s "
               "and (service_key = any(%s) or service_key like any(%s)) "
               + ("and lab_id = %s " if self.lab_id else "") +
               "group by 1,2 order by 1 desc limit %s")
        args = [since, exact, pref] + ([self.lab_id] if self.lab_id else []) + [MAX_ROWS]
        return self._all(sql, args)

    # --- heartbeat fallback
    def get_token_hash(self, node_id):
        rows = self._all("select token_hash from labit_ops.nodes where id = %s", (node_id,))
        return rows[0]["token_hash"] if rows else None

    def insert_heartbeat(self, node_id, payload):
        import json
        self._exec("insert into labit_ops.heartbeats(node_id,payload) values (%s,%s::jsonb)",
                   (node_id, json.dumps(payload)))

    def latest_heartbeats(self, node_ids):
        rows = self._all("select distinct on (node_id) node_id,received_at,payload from labit_ops.heartbeats "
                         "where node_id = any(%s) order by node_id, received_at desc", (list(node_ids),))
        return {r["node_id"]: r for r in rows}

    # --- panel's own status
    def upsert_status(self, rows):
        import json
        for r in rows:
            self._exec("insert into labit_ops.node_status(node_id,state,last_seen,detail,updated_at) "
                       "values (%s,%s,%s,%s::jsonb,%s) on conflict (node_id) do update set state=excluded.state,"
                       "last_seen=excluded.last_seen,detail=excluded.detail,updated_at=excluded.updated_at",
                       (r["node_id"], r["state"], r["last_seen"], json.dumps(r["detail"]), r["updated_at"]))

    def upsert_history(self, rows):
        for r in rows:
            self._exec("insert into labit_ops.status_history(node_id,bucket,state) values (%s,%s,%s) "
                       "on conflict (node_id,bucket) do update set state=excluded.state",
                       (r["node_id"], r["bucket"], r["state"]))

    def history(self, node_id, since):
        return self._all("select bucket,state from labit_ops.status_history where node_id=%s and bucket>=%s "
                         "order by bucket limit 1000", (node_id, since))

    def list_menu(self):
        return self._all("select * from labit_ops.menu_systems order by sort,id")

    def node_exists(self, node_id):
        return bool(self._all("select 1 from labit_ops.nodes where id=%s", (node_id,)))
