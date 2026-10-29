// PM2 definition for panel-api ONLY. NOT applied yet (requires explicit user go).
// Always start with `--only panel-api`. The panel UI/route handlers ship inside labit-main's own deployment.
// Secrets are never inline: uvicorn reads panel/api/.env (0600, untracked) via --env-file (python-dotenv ships with uvicorn[standard]).
const path = require('path');

// CHECK-ME: labit-main's deploy script defaults APP_DIR=/opt/labbit-frontend (PM2 app labbit-frontend). Confirm on VPS1
// that this checkout holds labit-main/panel; override with PANEL_ROOT otherwise.
const ROOT = process.env.PANEL_ROOT || '/opt/labbit-frontend/panel';
const LOG_DIR = process.env.PANEL_LOG_DIR || '/var/log/labit-panel'; // CHECK-ME: must exist and be writable by the pm2 user
const VENV = process.env.PANEL_VENV || path.join(ROOT, 'api', '.venv');
const API_DIR = path.join(ROOT, 'api');

module.exports = {
  apps: [
    {
      name: 'panel-api',
      cwd: API_DIR,
      script: path.join(VENV, 'bin', 'uvicorn'),
      args: `app.main:app --host 127.0.0.1 --port 8100 --env-file ${path.join(API_DIR, '.env')} --workers 1`,
      interpreter: 'none',
      instances: 1, // single worker: in-memory rate limit / background poller must not be duplicated
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '20s',
      exp_backoff_restart_delay: 200,
      kill_timeout: 8000,
      max_memory_restart: '384M',
      merge_logs: true,
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      out_file: path.join(LOG_DIR, 'panel-api.out.log'),
      error_file: path.join(LOG_DIR, 'panel-api.err.log'),
      env: { PYTHONUNBUFFERED: '1' },
    },
  ],
};
