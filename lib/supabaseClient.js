//    lib/supabaseClient.js

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// See lib/supabaseServer.js for why this timeout exists (2026-08-11 incident).
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(15000) }),
  },
})
