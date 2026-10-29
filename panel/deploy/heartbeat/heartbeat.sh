#!/usr/bin/env bash
# Labit Control Panel heartbeat agent (for NAT'd machines). Contract: panel/CONTRACT.md.
# Reads /etc/labit-heartbeat.env (0600): NODE_ID, HEARTBEAT_TOKEN, optional PANEL_URL, CHECKS_FILE.
# Probes local services listed in CHECKS_FILE and POSTs {node_id, services, load, disk_pct}.
# The token is never printed, logged, or put on a command line (passed to curl via stdin config).
#
# CHECKS_FILE format (one per line, '#' comments allowed; service_id <svc> must have a labit_ops.node_service_map row with service_key 'hb:<NODE_ID>:<svc>'):
#   <service_id> tcp  <host> <port>
#   <service_id> http <url> [expected_status_regex, default ^[23]]
#   <service_id> https-insecure <url> [regex]      # self-signed local certs (e.g. Mirth 8443)
set -u
umask 077

ENV_FILE="${HEARTBEAT_ENV_FILE:-/etc/labit-heartbeat.env}"
[ -r "$ENV_FILE" ] || { echo "heartbeat: cannot read $ENV_FILE" >&2; exit 2; }
# shellcheck disable=SC1090
. "$ENV_FILE"

# Optional fallback only: primary monitoring reads public.cto_service_latest. Disabled unless HEARTBEAT_ENABLED=1.
[ "${HEARTBEAT_ENABLED:-0}" = 1 ] || { echo "heartbeat: disabled (HEARTBEAT_ENABLED!=1)" >&2; exit 0; }

: "${NODE_ID:?NODE_ID missing in env file}"
: "${HEARTBEAT_TOKEN:?HEARTBEAT_TOKEN missing in env file}"
PANEL_URL="${PANEL_URL:-}"  # no default: panel-api is localhost-only
: "${PANEL_URL:?PANEL_URL not set (heartbeat disabled by default; exposure of panel-api needs a separate decision)}"
CHECKS_FILE="${CHECKS_FILE:-/etc/labit-heartbeat.checks}"
CHECK_TIMEOUT="${CHECK_TIMEOUT:-3}"
POST_TIMEOUT="${POST_TIMEOUT:-10}"
POST_RETRIES="${POST_RETRIES:-3}"
DISK_PATH="${DISK_PATH:-/}"
DRY_RUN="${DRY_RUN:-0}"   # 1 = print payload (no token) and do not POST

case "$NODE_ID" in *[!a-z0-9_-]*|'') echo "heartbeat: invalid NODE_ID" >&2; exit 2;; esac

probe() { # kind target... -> echoes up|down
  local kind="$1"; shift
  case "$kind" in
    tcp)
      if timeout "$CHECK_TIMEOUT" bash -c 'exec 3<>"/dev/tcp/$1/$2"' _ "$1" "$2" 2>/dev/null; then echo up; else echo down; fi ;;
    http|https-insecure)
      local url="$1" re="${2:-^[23]}" opts=(-s -o /dev/null -w '%{http_code}' --max-time "$CHECK_TIMEOUT")
      [ "$kind" = https-insecure ] && opts+=(-k)
      local code; code="$(curl "${opts[@]}" "$url" 2>/dev/null || true)"
      if [[ "$code" =~ $re ]]; then echo up; else echo down; fi ;;
    *) echo down ;;
  esac
}

services_json=""
if [ -r "$CHECKS_FILE" ]; then
  while read -r sid kind a b _; do
    [ -z "${sid:-}" ] && continue
    case "$sid" in \#*) continue;; esac
    case "$sid" in *[!A-Za-z0-9_.-]*) echo "heartbeat: skipping bad service id" >&2; continue;; esac
    if [ "$kind" = tcp ]; then st="$(probe tcp "$a" "$b")"; else st="$(probe "$kind" "$a" "$b")"; fi
    services_json+="${services_json:+,}\"$sid\":\"$st\""
  done < "$CHECKS_FILE"
else
  echo "heartbeat: checks file $CHECKS_FILE not readable; sending empty services" >&2
fi

load="$(cut -d' ' -f1 /proc/loadavg 2>/dev/null || echo 0)"
disk="$(df -P "$DISK_PATH" 2>/dev/null | awk 'NR==2{gsub("%","",$5);print $5}')"
[[ "$load" =~ ^[0-9.]+$ ]] || load=0
[[ "${disk:-}" =~ ^[0-9]+$ ]] || disk=0
payload="{\"node_id\":\"$NODE_ID\",\"services\":{${services_json}},\"load\":${load},\"disk_pct\":${disk}}"

if [ "$DRY_RUN" = 1 ]; then echo "$payload"; exit 0; fi

delay=2
for attempt in $(seq 1 "$POST_RETRIES"); do
  # Token goes through stdin curl-config, so it never appears in ps/argv or logs.
  code="$(printf 'header = "Authorization: Bearer %s"\n' "$HEARTBEAT_TOKEN" |
    curl -sS -K - -o /dev/null -w '%{http_code}' --max-time "$POST_TIMEOUT" \
      -X POST -H 'Content-Type: application/json' --data "$payload" "$PANEL_URL" 2>/dev/null || true)"
  case "$code" in
    204|200) exit 0 ;;
    401|403|413|422) echo "heartbeat: rejected by panel (HTTP $code); not retrying" >&2; exit 3 ;;
  esac
  echo "heartbeat: attempt $attempt/$POST_RETRIES failed (HTTP ${code:-none})" >&2
  [ "$attempt" -lt "$POST_RETRIES" ] && { sleep "$delay"; delay=$((delay*2)); }
done
exit 1
