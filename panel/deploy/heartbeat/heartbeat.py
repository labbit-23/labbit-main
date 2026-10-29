#!/usr/bin/env python3
"""Python alternative to heartbeat.sh (stdlib only; for hosts without bash /dev/tcp or curl).
Same env file and CHECKS_FILE format as heartbeat.sh. Token is never logged."""
import json, os, shutil, socket, ssl, sys, time, urllib.request, urllib.error, re

def load_env(path):
    for line in open(path):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

def probe(kind, a, b, timeout):
    try:
        if kind == "tcp":
            socket.create_connection((a, int(b)), timeout).close(); return "up"
        if kind in ("http", "https-insecure"):
            ctx = ssl._create_unverified_context() if kind == "https-insecure" else None
            try:
                code = urllib.request.urlopen(a, timeout=timeout, context=ctx).status
            except urllib.error.HTTPError as e:
                code = e.code
            return "up" if re.match(b or r"^[23]", str(code)) else "down"
    except Exception:
        pass
    return "down"

def main():
    load_env(os.environ.get("HEARTBEAT_ENV_FILE", "/etc/labit-heartbeat.env"))
    if os.environ.get("HEARTBEAT_ENABLED", "0") != "1":
        print("heartbeat: disabled (HEARTBEAT_ENABLED!=1)", file=sys.stderr); return
    node, token = os.environ["NODE_ID"], os.environ["HEARTBEAT_TOKEN"]
    if not re.fullmatch(r"[a-z0-9_-]+", node):
        sys.exit("invalid NODE_ID")
    url = os.environ.get("PANEL_URL", "")  # no default: panel-api is localhost-only; set explicitly if ever enabled
    if not url:
        sys.exit("PANEL_URL not set (heartbeat disabled by default; panel-api is localhost-only)")
    checks = os.environ.get("CHECKS_FILE", "/etc/labit-heartbeat.checks")
    ct = float(os.environ.get("CHECK_TIMEOUT", "3"))
    services = {}
    if os.path.exists(checks):
        for line in open(checks):
            p = line.split()
            if len(p) < 3 or p[0].startswith("#") or not re.fullmatch(r"[A-Za-z0-9_.-]+", p[0]):
                continue
            services[p[0]] = probe(p[1], p[2], p[3] if len(p) > 3 else None, ct)
    payload = {"node_id": node, "services": services,
               "load": os.getloadavg()[0],
               "disk_pct": round(shutil.disk_usage(os.environ.get("DISK_PATH", "/")).used * 100 /
                                 shutil.disk_usage(os.environ.get("DISK_PATH", "/")).total)}
    if os.environ.get("DRY_RUN") == "1":
        print(json.dumps(payload)); return
    req = urllib.request.Request(url, json.dumps(payload).encode(), method="POST",
          headers={"Content-Type": "application/json", "Authorization": "Bearer " + token})
    delay = 2
    for i in range(1, int(os.environ.get("POST_RETRIES", "3")) + 1):
        try:
            urllib.request.urlopen(req, timeout=10); return
        except urllib.error.HTTPError as e:
            if e.code in (401, 403, 413, 422):
                sys.exit(f"heartbeat: rejected (HTTP {e.code})")
            err = f"HTTP {e.code}"
        except Exception as e:
            err = type(e).__name__
        print(f"heartbeat: attempt {i} failed ({err})", file=sys.stderr)
        time.sleep(delay); delay *= 2
    sys.exit(1)

main()
