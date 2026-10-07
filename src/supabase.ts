import { createClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "./env";
import { darkeIdAuthLocal, parseDarkeId } from "./darkeId";
import { toSlug } from "./slug";

const url = supabaseUrl();
const anonKey = supabaseAnonKey();

export const supabaseConfigured = Boolean(url && anonKey);

/** Browser fetch to Supabase (and other HTTPS APIs). */
export async function supabaseFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return fetch(input, init);
}

export const supabase = createClient(url ?? "", anonKey ?? "", {
  global: {
    fetch: supabaseFetch,
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

const AUTH_HOST = "darke.local";
const LEGACY_AUTH_HOST = "users.darke.local";

export function syntheticAuthEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${AUTH_HOST}`;
}

function legacyAuthEmail(slug: string): string {
  return `${slug}@${LEGACY_AUTH_HOST}`;
}

function isSyntheticAuthEmail(email: string): boolean {
  return /@(?:users\.)?darke\.local$/i.test(email.trim());
}

export function resolveAuthEmail(
  profileEmail: string | null | undefined,
  authSlug: string,
): string {
  const mail = (profileEmail ?? "").trim();
  if (mail && !isSyntheticAuthEmail(mail)) return mail.toLowerCase();
  return syntheticAuthEmail(authSlug);
}

export function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(
        new Error(
          `${label} timed out after ${ms}ms. Check VITE_SUPABASE_URL and that the app can reach *.supabase.co.`,
        ),
      );
    }, ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function unwrapErrorPayload(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return trimmed;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const message =
      typeof parsed.message === "string" ? parsed.message.trim() : "";
    const code = typeof parsed.code === "string" ? parsed.code.trim() : "";
    if (message && (code === "42501" || /row-level security/i.test(message))) {
      return message;
    }
    if (message) return message;
  } catch {
    /* keep original */
  }
  return trimmed;
}

function errText(err: unknown): string {
  if (typeof err === "string" && err.trim()) return unwrapErrorPayload(err);
  if (err instanceof Error && err.message) {
    return unwrapErrorPayload(err.message);
  }
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    if (typeof o.message === "string" && o.message.trim()) {
      return unwrapErrorPayload(o.message);
    }
    try {
      return unwrapErrorPayload(JSON.stringify(err));
    } catch {
      /* fall through */
    }
  }
  return String(err);
}

/** Fast check that Rust HTTP can reach Supabase Auth. */
export async function probeSupabase(): Promise<void> {
  if (!url || !anonKey) {
    throw new Error("VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing.");
  }
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    throw new Error("VITE_SUPABASE_URL is not a valid URL.");
  }
  try {
    const res = await withTimeout(
      supabaseFetch(`${url.replace(/\/$/, "")}/auth/v1/health`, {
        method: "GET",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
      }),
      15000,
      "probeSupabase",
    );
    console.log("probeSupabase: ok", host, res.status);
  } catch (err) {
    throw new Error(`Cannot reach Supabase (${host}). ${errText(err)}`);
  }
}

export function publicError(err: unknown): string {
  let msg = "Something went wrong.";
  if (typeof err === "string" && err.trim()) {
    msg = err;
  } else if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    const parts = [o.message, o.error_description, o.details, o.hint, o.code]
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean);
    if (parts.length > 0) {
      msg = parts.join(" — ");
    } else {
      try {
        msg = JSON.stringify(err);
      } catch {
        msg = "Something went wrong.";
      }
    }
  }
  const cleaned = unwrapErrorPayload(msg)
    .replace(/[^\s]+@users\.darke\.local/gi, "account")
    .replace(/users\.darke\.local/gi, "")
    .trim();
  return cleaned || "Request failed.";
}

function hideLocalWord(text: string): string {
  return text.replace(/\bvault\b/gi, "account");
}

export function gateMessage(err: unknown): string {
  const raw = publicError(err);
  const lower = raw.toLowerCase();
  if (
    lower.includes("invalid login") ||
    lower.includes("invalid credentials") ||
    lower.includes("wrong passphrase") ||
    lower.includes("wrong password")
  ) {
    return "Wrong password.";
  }
  if (
    lower.includes("already registered") ||
    lower.includes("already been registered") ||
    lower.includes("user already") ||
    lower.includes("duplicate") ||
    lower.includes("taken")
  ) {
    return "already taken — sign in";
  }
  if (
    lower.includes("42p10") ||
    lower.includes("on conflict") ||
    lower.includes("exclusion constraint") ||
    lower.includes("42703") ||
    lower.includes("slug_hash")
  ) {
    return "Team setup on the server needs an update. Run supabase/phase97.sql in the Supabase SQL editor, then try again.";
  }
  if (
    lower.includes("42501") ||
    lower.includes("row-level security") ||
    lower.includes("workspaces")
  ) {
    return "Team setup on the server needs an update. Run supabase/phase95.sql and supabase/phase96.sql, then try again.";
  }
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network") ||
    lower.includes("timed out") ||
    lower.includes("timeout") ||
    lower.includes("load failed") ||
    lower.includes("cannot reach supabase") ||
    lower.includes("request failed")
  ) {
    return hideLocalWord(`Network error. ${raw}`);
  }
  return hideLocalWord(raw);
}

/** True if this handle is free, or already belongs to `exceptUserId`. */
export async function usernameAvailable(
  slug: string,
  exceptUserId?: string | null,
): Promise<boolean> {
  const rpc = await supabase.rpc("username_available", { name: slug });
  if (!rpc.error && typeof rpc.data === "boolean") {
    return rpc.data;
  }

  const clash = await supabase
    .from("profiles")
    .select("id")
    .or(`username.eq.${slug},auth_slug.eq.${slug}`)
    .limit(8);
  if (clash.error) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", slug)
      .maybeSingle();
    if (error) throw error;
    if (data == null) return true;
    if (exceptUserId && data.id === exceptUserId) return true;
    return false;
  }
  const rows = clash.data ?? [];
  return rows.every((row) => exceptUserId && row.id === exceptUserId);
}

export type LoginIdentity = {
  publicUsername: string;
  emails: string[];
  darkeId: string | null;
};

function collectLoginEmails(
  authSlug: string,
  profileEmail?: string | null,
  typedEmail?: string | null,
  darkeId?: string | null,
): string[] {
  const out: string[] = [];
  const add = (value?: string | null) => {
    const mail = (value ?? "").trim().toLowerCase();
    if (!mail.includes("@") || out.includes(mail)) return;
    out.push(mail);
  };
  add(typedEmail);
  if (profileEmail && !isSyntheticAuthEmail(profileEmail)) add(profileEmail);
  if (darkeId) add(syntheticAuthEmail(darkeIdAuthLocal(darkeId)));
  add(syntheticAuthEmail(authSlug));
  add(legacyAuthEmail(authSlug));
  return out;
}

export function loginEmailsForIdentity(ident: LoginIdentity): string[] {
  const slug = toSlug(ident.publicUsername);
  const out = collectLoginEmails(slug, null, null, ident.darkeId);
  for (const email of ident.emails) {
    const mail = email.trim().toLowerCase();
    if (mail.includes("@") && !out.includes(mail)) out.push(mail);
  }
  return out;
}

export async function signInWithPasswordCandidates(
  emails: string[],
  passwords: string | string[],
) {
  const secrets = Array.isArray(passwords) ? passwords : [passwords];
  let lastError: unknown = null;
  for (const password of secrets) {
    for (const email of emails) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (!error && data.session) return data;
      lastError = error ?? new Error("Wrong password.");
    }
  }
  throw lastError ?? new Error("Wrong password.");
}

export async function loginIdentityForUsername(raw: string): Promise<LoginIdentity> {
  const typed = raw.trim().toLowerCase();
  const slug = typed.replace(/[^a-z0-9]/g, "");
  if (!slug) {
    throw new Error("[ACCESS DENIED] Enter a username.");
  }
  const mail = syntheticAuthEmail(slug);
  const fallback: LoginIdentity = {
    publicUsername: slug,
    emails: [
      mail,
      legacyAuthEmail(slug),
      typed.includes("@")
        ? typed
        : syntheticAuthEmail(typed.replace(/[^a-z0-9._-]/g, "")),
    ].filter(
      (value, index, all) => value.includes("@") && all.indexOf(value) === index,
    ),
    darkeId: null,
  };
  const headers = {
    apikey: anonKey ?? "",
    Authorization: `Bearer ${anonKey ?? ""}`,
    Accept: "application/json",
  };
  const base = (url ?? "").replace(/\/$/, "");
  const orParts = [`username.eq.${encodeURIComponent(slug)}`, `auth_slug.eq.${encodeURIComponent(slug)}`];
  if (typed && typed !== slug) {
    orParts.push(`username.eq.${encodeURIComponent(typed)}`);
    orParts.push(`auth_slug.eq.${encodeURIComponent(typed)}`);
  }
  try {
    const res = await withTimeout(
      supabaseFetch(
        `${base}/rest/v1/profiles?select=username,darke_id,auth_slug&or=(${orParts.join(",")})&limit=1`,
        { method: "GET", headers },
      ),
      15000,
      "login identity",
    );
    if (res.ok) {
      const rows: unknown = await res.json();
      const row = Array.isArray(rows) ? rows[0] : null;
      if (row && typeof row === "object") {
        const r = row as {
          username?: unknown;
          darke_id?: unknown;
          auth_slug?: unknown;
        };
        const username =
          typeof r.username === "string" && r.username ? r.username : slug;
        const darkeId =
          typeof r.darke_id === "string" && r.darke_id ? r.darke_id : null;
        const authSlug =
          typeof r.auth_slug === "string" && r.auth_slug
            ? toSlug(r.auth_slug)
            : toSlug(username) || slug;
        return {
          publicUsername: authSlug || slug,
          emails: [
            mail,
            syntheticAuthEmail(authSlug || slug),
            legacyAuthEmail(authSlug || slug),
            legacyAuthEmail(slug),
          ],
          darkeId,
        };
      }
    }
  } catch {
    /* sign in with username email */
  }
  return fallback;
}

/** @deprecated Username login is the default. */
export async function loginIdentityForDarkeId(raw: string): Promise<LoginIdentity> {
  const asDarke = parseDarkeId(raw);
  if (asDarke) {
    const mail = syntheticAuthEmail(darkeIdAuthLocal(asDarke));
    const found = await loginIdentityForUsername(asDarke.replace(/[^a-z0-9]/gi, ""));
    return {
      ...found,
      darkeId: asDarke,
      emails: [...found.emails, mail],
    };
  }
  return loginIdentityForUsername(raw);
}

export type EnsureProfileFields = {
  slug: string;
  displayName?: string;
  email?: string;
  avatarUrl?: string | null;
  darkeId?: string;
  publicKey?: string;
  isPrivate?: boolean;
};

/**
 * Every signed-in session must have public.profiles.
 */
export async function ensureProfile(
  slugOrFields: string | EnsureProfileFields,
): Promise<void> {
  const fields: EnsureProfileFields =
    typeof slugOrFields === "string" ? { slug: slugOrFields } : slugOrFields;
  const slug = fields.slug;
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  const token = sessionData.session?.access_token;
  if (!userId || !token || !url || !anonKey) {
    throw new Error("Not signed in.");
  }

  const read = await withTimeout(
    supabaseFetch(
      `${url.replace(/\/$/, "")}/rest/v1/profiles?select=id&id=eq.${encodeURIComponent(userId)}`,
      {
        method: "GET",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
    ),
    15000,
    "ensureProfile read",
  );
  if (!read.ok) {
    throw new Error(await read.text() || `ensureProfile read HTTP ${read.status}`);
  }
  const existing: unknown = await read.json();
  const body: Record<string, string | boolean> = {
    username: slug,
    auth_slug: slug,
  };
  const display = fields.displayName?.trim();
  if (display) body.display_name = display;
  const mail = fields.email?.trim().toLowerCase();
  if (mail && !isSyntheticAuthEmail(mail)) body.email = mail;
  if (fields.avatarUrl) body.avatar_url = fields.avatarUrl;
  if (fields.darkeId) body.darke_id = fields.darkeId;
  if (fields.publicKey) body.public_key = fields.publicKey;
  if (fields.isPrivate != null) body.is_private = fields.isPrivate;

  if (Array.isArray(existing) && existing.length > 0) {
    if (Object.keys(body).length > 2) {
      const patch = await withTimeout(
        supabaseFetch(
          `${url.replace(/\/$/, "")}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
          {
            method: "PATCH",
            headers: {
              apikey: anonKey,
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              Prefer: "return=minimal",
            },
            body: JSON.stringify(body),
          },
        ),
        15000,
        "ensureProfile patch",
      );
      if (!patch.ok) {
        const text = await patch.text();
        if (!text.toLowerCase().includes("is_private")) {
          throw new Error(text || `ensureProfile patch HTTP ${patch.status}`);
        }
      }
    }
    return;
  }

  const insertBody: Record<string, string | boolean> = {
    id: userId,
    ...body,
  };
  const insert = await withTimeout(
    supabaseFetch(`${url.replace(/\/$/, "")}/rest/v1/profiles`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(insertBody),
    }),
    15000,
    "ensureProfile insert",
  );
  if (!insert.ok) {
    const text = await insert.text();
    if (insert.status === 409 || text.toLowerCase().includes("duplicate")) {
      throw new Error("already taken — sign in");
    }
    if (
      text.toLowerCase().includes("auth_slug") ||
      text.toLowerCase().includes("display_name") ||
      text.toLowerCase().includes("darke_id") ||
      text.toLowerCase().includes("public_key") ||
      text.toLowerCase().includes("pgrst")
    ) {
      const retry = await withTimeout(
        supabaseFetch(`${url.replace(/\/$/, "")}/rest/v1/profiles`, {
          method: "POST",
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ id: userId, username: slug }),
        }),
        15000,
        "ensureProfile insert retry",
      );
      if (!retry.ok) {
        const retryText = await retry.text();
        if (retry.status === 409 || retryText.toLowerCase().includes("duplicate")) {
          throw new Error("already taken — sign in");
        }
        throw new Error(retryText || `ensureProfile insert HTTP ${retry.status}`);
      }
    } else {
      throw new Error(text || `ensureProfile insert HTTP ${insert.status}`);
    }
  }
  console.log("ensureProfile: ok");
}

export async function sessionPublicUsername(): Promise<string | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  const token = sessionData.session?.access_token;
  if (!userId || !token || !url || !anonKey) return null;
  try {
    const read = await withTimeout(
      supabaseFetch(
        `${url.replace(/\/$/, "")}/rest/v1/profiles?select=username&id=eq.${encodeURIComponent(userId)}`,
        {
          method: "GET",
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        },
      ),
      12000,
      "session username",
    );
    if (!read.ok) return null;
    const rows: unknown = await read.json();
    if (Array.isArray(rows) && rows[0] && typeof (rows[0] as { username?: unknown }).username === "string") {
      const name = String((rows[0] as { username: string }).username).trim().toLowerCase();
      return name || null;
    }
  } catch {
    return null;
  }
  const meta = sessionData.session?.user.user_metadata?.username;
  return typeof meta === "string" && meta.trim() ? meta.trim().toLowerCase() : null;
}

export async function rollbackAuth(): Promise<void> {
  await tryDeleteOwnAuthUser();
  try {
    await withTimeout(supabase.auth.signOut(), 8000, "signOut");
  } catch {
    // Do not block the error shown on the Create card.
  }
}

export async function tryDeleteOwnAuthUser(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token || !url || !anonKey) return;
  try {
    await withTimeout(
      supabaseFetch(`${url.replace(/\/$/, "")}/auth/v1/user`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: anonKey,
        },
      }),
      8000,
      "delete auth user",
    );
  } catch {
    // Best effort. Sign-out still runs after this.
  }
}
