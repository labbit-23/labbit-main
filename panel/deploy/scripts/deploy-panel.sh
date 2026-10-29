#!/usr/bin/env bash
set -euo pipefail

# !!! NOT TO BE RUN YET !!!  Requires the explicit user go (see ../RUNBOOK.md).
# Guard: refuses to run unless PANEL_DEPLOY_GO=yes is set by a human.
#
# Scope: ships ONLY the FastAPI panel-api (venv + deps + pm2 start/reload of the app named panel-api).
# It does NOT deploy labit-main's pages (app/panel, app/api/panel): that is scripts/deploy-vps-frontend.sh's job,
# run AFTER this script (order: panel-api first, then labit-main). It never runs `pm2 save`, never restarts any other app,
# and never does git operations (the checkout is updated by the labit-main deploy / by hand).
#
# Usage (on VPS1, after RUNBOOK steps 0-5):  PANEL_DEPLOY_GO=yes bash panel/deploy/scripts/deploy-panel.sh
# Optional env: PANEL_ROOT (CHECK-ME default /opt/labbit-frontend/panel)  PM2_API=panel-api  API_HEALTH_URL=http://127.0.0.1:8100/health

PANEL_ROOT="${PANEL_ROOT:-/opt/labbit-frontend/panel}" # CHECK-ME: confirm on VPS1
PM2_API="${PM2_API:-panel-api}"
API_HEALTH_URL="${API_HEALTH_URL:-http://127.0.0.1:8100/health}"
HEALTHCHECK_RETRIES="${HEALTHCHECK_RETRIES:-20}"
HEALTHCHECK_DELAY_SECONDS="${HEALTHCHECK_DELAY_SECONDS:-3}"
ECOSYSTEM="${PANEL_ROOT}/deploy/pm2/ecosystem.config.js"
API_DIR="${PANEL_ROOT}/api"

if [ "${PANEL_DEPLOY_GO:-}" != "yes" ]; then
  echo "Refusing to run: panel deploy has not been given the explicit go (set PANEL_DEPLOY_GO=yes)."
  exit 1
fi
if [ "${PM2_API}" != "panel-api" ]; then
  echo "ERROR: this script only manages the pm2 app named panel-api."; exit 1
fi

[ -f "${ECOSYSTEM}" ] || { echo "ERROR: ${ECOSYSTEM} not found (check PANEL_ROOT)."; exit 1; }
[ -f "${API_DIR}/requirements.txt" ] || { echo "ERROR: ${API_DIR}/requirements.txt not found."; exit 1; }
[ -f "${API_DIR}/.env" ] || { echo "ERROR: ${API_DIR}/.env missing (RUNBOOK step 3)."; exit 1; }
[ "$(stat -c %a "${API_DIR}/.env")" = "600" ] || { echo "ERROR: ${API_DIR}/.env must be chmod 600."; exit 1; }
grep -Eq '^PANEL_INTERNAL_KEY=.{32,}' "${API_DIR}/.env" || { echo "ERROR: PANEL_INTERNAL_KEY missing/short in .env."; exit 1; }
grep -Eq '^PANEL_DB_DSN=postgresql://' "${API_DIR}/.env" || { echo "ERROR: PANEL_DB_DSN missing in .env."; exit 1; }
grep -q 'CHANGE-ME' "${API_DIR}/.env" && { echo "ERROR: CHANGE-ME placeholder left in .env."; exit 1; }
mkdir -p "$(node -e "console.log(process.env.PANEL_LOG_DIR||'/var/log/labit-panel')")"

echo "==> panel-api: venv + deps"
[ -d "${API_DIR}/.venv" ] || python3 -m venv "${API_DIR}/.venv"
"${API_DIR}/.venv/bin/pip" install --quiet -r "${API_DIR}/requirements.txt"

echo "==> pm2 (panel-api only)"
if pm2 describe "${PM2_API}" >/dev/null 2>&1; then
  pm2 reload "${ECOSYSTEM}" --only panel-api --update-env
else
  pm2 start "${ECOSYSTEM}" --only panel-api
fi
# 'pm2 save' is deliberately NOT run: it persists the whole pm2 dump (other apps too). See RUNBOOK.

echo "==> Health check: ${API_HEALTH_URL}"
for i in $(seq 1 "${HEALTHCHECK_RETRIES}"); do
  if curl -fsS --max-time 5 "${API_HEALTH_URL}" >/dev/null 2>&1; then echo "OK (attempt ${i})"; echo "panel-api up. Next: deploy labit-main (RUNBOOK step 5)."; exit 0; fi
  echo "waiting (attempt ${i}/${HEALTHCHECK_RETRIES})"; sleep "${HEALTHCHECK_DELAY_SECONDS}"
done
echo "ERROR: health check failed. 'pm2 logs panel-api --lines 120'. Rollback: RUNBOOK step 7 (pm2 stop panel-api, only on user go)."
exit 1
