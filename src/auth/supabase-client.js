import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../config.js";

function validateSupabaseConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return {
      code: "missing_supabase_config",
      message:
        "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
    };
  }

  try {
    new URL(SUPABASE_URL);
  } catch {
    return {
      code: "invalid_supabase_url",
      message: "VITE_SUPABASE_URL must be a valid Supabase project URL."
    };
  }

  return null;
}

export const supabaseConfigError = validateSupabaseConfig();
export const supabase = supabaseConfigError
  ? null
  : createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

