// lib/supabaseServer.js

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('[supabaseServer.js] Missing Supabase environment variables!');
  // Optionally throw error or exit here if critical
}

// 2026-08-11 incident: this client had no request timeout at all, so a slow
// or stuck database response could hang a Next.js request handler
// indefinitely instead of failing fast -- that hang is what took down
// labbit-frontend during the labit-core outage (SocketError: other side
// closed traces in pm2 logs were the lucky ones; other calls just hung).
// AbortSignal.timeout aborts the underlying fetch after 15s so a DB hiccup
// becomes a clean, fast error instead of a silent permanent hang.
const supabase = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      global: {
        fetch: (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(15000) }),
      },
    })
  : null;

export { supabase };
