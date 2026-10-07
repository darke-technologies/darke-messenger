import { supabase } from "./supabase";
import { authRedirectUrl as envAuthRedirect } from "./env";

const RECOVERY_KEY = "darke.pw-recovery";

export function isValidEmail(value: string): boolean {
  const email = value.trim();
  return (
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    !/@(?:users\.)?darke\.local$/i.test(email)
  );
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function authRedirectUrl(): string {
  const fromEnv = envAuthRedirect();
  if (fromEnv) return fromEnv;
  if (typeof window === "undefined") return "http://localhost:3000/";
  return `${window.location.origin}${window.location.pathname || "/"}`;
}

export function isPasswordRecoveryPending(): boolean {
  try {
    return sessionStorage.getItem(RECOVERY_KEY) === "1";
  } catch {
    return false;
  }
}

export function markPasswordRecoveryPending(): void {
  try {
    sessionStorage.setItem(RECOVERY_KEY, "1");
  } catch {
    // Private mode.
  }
}

export function clearPasswordRecoveryPending(): void {
  try {
    sessionStorage.removeItem(RECOVERY_KEY);
  } catch {
    // Private mode.
  }
}

function paramsFromHref(href: string): URLSearchParams {
  try {
    const u = new URL(href);
    const merged = new URLSearchParams(u.search);
    const hash = u.hash.startsWith("#") ? u.hash.slice(1) : u.hash;
    new URLSearchParams(hash).forEach((value, key) => {
      merged.set(key, value);
    });
    return merged;
  } catch {
    return new URLSearchParams();
  }
}

function stripAuthParamsFromLocation(): void {
  if (typeof window === "undefined" || !window.history?.replaceState) return;
  try {
    const u = new URL(window.location.href);
    const drop = [
      "access_token",
      "refresh_token",
      "expires_in",
      "expires_at",
      "token_type",
      "type",
      "code",
      "token_hash",
      "error",
      "error_description",
    ];
    for (const key of drop) u.searchParams.delete(key);
    u.hash = "";
    window.history.replaceState(window.history.state, "", u.toString());
  } catch {
    // Stay on the current URL.
  }
}

export async function consumeAuthCallback(
  href = typeof window === "undefined" ? "" : window.location.href,
): Promise<"recovery" | "session" | null> {
  if (!href) return isPasswordRecoveryPending() ? "recovery" : null;
  const p = paramsFromHref(href);
  const type = (p.get("type") ?? "").toLowerCase();
  const access = p.get("access_token");
  const refresh = p.get("refresh_token");
  const code = p.get("code");
  const tokenHash = p.get("token_hash");

  if (access && refresh) {
    const { error } = await supabase.auth.setSession({
      access_token: access,
      refresh_token: refresh,
    });
    if (error) throw error;
    stripAuthParamsFromLocation();
    if (type === "recovery") {
      markPasswordRecoveryPending();
      return "recovery";
    }
    return "session";
  }

  if (tokenHash && (type === "recovery" || type === "email" || type === "signup")) {
    const otpType = type === "recovery" ? "recovery" : "email";
    const { error } = await supabase.auth.verifyOtp({
      type: otpType,
      token_hash: tokenHash,
    });
    if (error) throw error;
    stripAuthParamsFromLocation();
    if (type === "recovery") {
      markPasswordRecoveryPending();
      return "recovery";
    }
    return "session";
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    stripAuthParamsFromLocation();
    if (type === "recovery" || isPasswordRecoveryPending()) {
      markPasswordRecoveryPending();
      return "recovery";
    }
    return "session";
  }

  return isPasswordRecoveryPending() ? "recovery" : null;
}
