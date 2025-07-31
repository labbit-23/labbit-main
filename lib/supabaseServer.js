// lib/supabaseServer.js
import { createClient } from '@supabase/supabase-js';

// ✅ Only initialize the client if we're on the server
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  // ✅ Only log if we're on the server
  if (typeof window === 'undefined') {
    console.error('Missing Supabase service role environment variables');
  }
  // Don't create a client if keys are missing
}

// ✅ Create the client only if both values are present
const supabase = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey)
  : null;

export { supabase };