const MIN_PASSWORD_LENGTH = 6;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function resultOk(session) {
  return {
    ok: true,
    session
  };
}

function resultError(code, message) {
  return {
    ok: false,
    error: {
      code,
      message
    }
  };
}

function validateCredentials(email, password) {
  if (!EMAIL_PATTERN.test(email)) {
    return resultError("invalid_email", "Enter a valid email address.");
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return resultError(
      "password_too_short",
      "Password must contain at least 6 characters."
    );
  }

  return null;
}

function normalizeAuthError(error, fallbackMessage) {
  const message = error?.message || "";
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes("invalid login credentials") ||
    lowerMessage.includes("invalid credentials")
  ) {
    return resultError("invalid_credentials", "Email or password incorrect.");
  }

  if (
    lowerMessage.includes("already registered") ||
    lowerMessage.includes("already exists") ||
    lowerMessage.includes("user already")
  ) {
    return resultError(
      "account_exists",
      "An account already exists for this email."
    );
  }

  if (
    lowerMessage.includes("password") &&
    (lowerMessage.includes("6") || lowerMessage.includes("short"))
  ) {
    return resultError(
      "password_too_short",
      "Password must contain at least 6 characters."
    );
  }

  if (
    lowerMessage.includes("network") ||
    lowerMessage.includes("fetch") ||
    lowerMessage.includes("failed to fetch")
  ) {
    return resultError("network_failure", "Connection failed. Try again.");
  }

  return resultError(error?.code || "auth_error", fallbackMessage);
}

function logTechnicalError(error) {
  if (import.meta.env.DEV) {
    console.error(error);
  }
}

export class AuthController {
  constructor(supabaseClient) {
    if (!supabaseClient) {
      throw new Error("AuthController requires a configured Supabase client.");
    }

    this.supabase = supabaseClient;
  }

  async getSession() {
    const { data, error } = await this.supabase.auth.getSession();

    if (error) {
      logTechnicalError(error);
      return normalizeAuthError(error, "Your session expired. Sign in again.");
    }

    return resultOk(data.session || null);
  }

  async signUp(email, password) {
    const invalid = validateCredentials(email, password);
    if (invalid) {
      return invalid;
    }

    const { data, error } = await this.supabase.auth.signUp({
      email,
      password
    });

    if (error) {
      logTechnicalError(error);
      return normalizeAuthError(error, "Account creation failed. Try again.");
    }

    return resultOk(data.session || null);
  }

  async signIn(email, password) {
    const invalid = validateCredentials(email, password);
    if (invalid) {
      return invalid;
    }

    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      logTechnicalError(error);
      return normalizeAuthError(error, "Email or password incorrect.");
    }

    return resultOk(data.session || null);
  }

  async signOut() {
    const { error } = await this.supabase.auth.signOut();

    if (error) {
      logTechnicalError(error);
      return normalizeAuthError(error, "Sign out failed. Try again.");
    }

    return resultOk(null);
  }

  onAuthStateChange(callback) {
    const { data } = this.supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });

    return () => data.subscription.unsubscribe();
  }
}

