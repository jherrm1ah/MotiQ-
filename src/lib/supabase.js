import { createClient } from "@supabase/supabase-js";

// The project address and its publishable key are public by design: what anyone can read or
// change is decided by the row level security rules in supabase/migrations.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://qsnooitnvlziladyywho.supabase.co";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || "sb_publishable_QrxhkzmRY5DqQ9D7gSHuoQ_lImw_rGI";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
