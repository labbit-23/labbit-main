#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   bash scripts/deploy-vps-frontend.sh
#
# Optional env overrides:
#   APP_DIR=/opt/labbit-frontend
#   BRANCH=main
#   PM2_APP_NAME=labbit-frontend
#   HEALTHCHECK_URL=http://127.0.0.1:3000/api/health

APP_DIR="${APP_DIR:-/opt/labbit-frontend}"
BRANCH="${BRANCH:-main}"
PM2_APP_NAME="${PM2_APP_NAME:-labbit-frontend}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://127.0.0.1:3000/api/health}"
HEALTHCHECK_RETRIES="${HEALTHCHECK_RETRIES:-20}"
HEALTHCHECK_DELAY_SECONDS="${HEALTHCHECK_DELAY_SECONDS:-3}"

echo "==> Deploying frontend from branch '${BRANCH}' in ${APP_DIR}"
cd "${APP_DIR}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "❌ ${APP_DIR} is not a git repository."
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "❌ Working tree is dirty in ${APP_DIR}. Commit/stash/revert changes before deploy."
  git status --short
  exit 1
fi

echo "==> Fetching latest changes"
git fetch origin "${BRANCH}"
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"

echo "==> Installing dependencies"
npm ci

echo "==> Building Next.js app"
npm run build

echo "==> Restarting PM2 app '${PM2_APP_NAME}'"
pm2 restart "${PM2_APP_NAME}" --update-env
pm2 save

echo "==> Health check: ${HEALTHCHECK_URL}"
ok=0
for attempt in $(seq 1 "${HEALTHCHECK_RETRIES}"); do
  if curl -fsS "${HEALTHCHECK_URL}" >/dev/null; then
    ok=1
    echo "✅ Health check passed (attempt ${attempt}/${HEALTHCHECK_RETRIES})."
    break
  fi

  echo "⏳ Health check not ready yet (attempt ${attempt}/${HEALTHCHECK_RETRIES}); waiting ${HEALTHCHECK_DELAY_SECONDS}s..."
  sleep "${HEALTHCHECK_DELAY_SECONDS}"
done

if [ "${ok}" -ne 1 ]; then
  echo "❌ Health check failed after ${HEALTHCHECK_RETRIES} attempts."
  echo "Tip: run 'pm2 logs ${PM2_APP_NAME} --lines 120' to inspect startup errors."
  exit 1
fi

echo "✅ Deploy complete."
