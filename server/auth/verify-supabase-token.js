import { createClient } from "@supabase/supabase-js";

export class AuthVerificationError extends Error {
  constructor(message, code = "unauthorized") {
    super(message);
    this.name = "AuthVerificationError";
    this.code = code;
    this.statusCode = 401;
  }
}

function requireUserId(userId) {
  if (!userId || typeof userId !== "string") {
    throw new AuthVerificationError("Supabase token did not contain a user id.");
  }

  return userId;
}

async function verifyWithGetUser(supabase, accessToken) {
  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data?.user) {
    throw new AuthVerificationError("Invalid or expired Supabase access token.");
  }

  return {
    userId: requireUserId(data.user.id),
    method: "getUser"
  };
}

export function createSupabaseTokenVerifier({
  supabaseUrl,
  supabaseAnonKey,
  supabaseClient = null
}) {
  if (!supabaseClient && (!supabaseUrl || !supabaseAnonKey)) {
    throw new Error(
      "Supabase token verifier requires SUPABASE_URL and SUPABASE_ANON_KEY."
    );
  }

  const supabase =
    supabaseClient ||
    createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });

  return async function verifySupabaseToken(accessToken) {
    if (!accessToken || typeof accessToken !== "string") {
      throw new AuthVerificationError("Missing Supabase access token.");
    }

    if (typeof supabase.auth.getClaims === "function") {
      try {
        const { data, error } = await supabase.auth.getClaims(accessToken);

        if (error) {
          throw error;
        }

        return {
          userId: requireUserId(data?.claims?.sub),
          method: "getClaims"
        };
      } catch {
        // Some Supabase projects cannot complete local claims verification
        // because asymmetric signing keys/JWKS are unavailable. getUser()
        // verifies the token with Supabase Auth and is the supported fallback.
        return verifyWithGetUser(supabase, accessToken);
      }
    }

    return verifyWithGetUser(supabase, accessToken);
  };
}
