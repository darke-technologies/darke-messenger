import { publicError, supabase, supabaseFetch, withTimeout } from "./supabase";

const TABLE = "profile_favorites";

import { supabaseAnonKey, supabaseUrl } from "./env";
const baseUrl = () => supabaseUrl();
const anonKey = () => supabaseAnonKey();

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in.");
  return token;
}

function authHeaders(token: string): Record<string, string> {
  return {
    apikey: anonKey(),
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
}

export function profileFavoritesError(err: unknown): string {
  const raw = publicError(err);
  const lower = raw.toLowerCase();
  if (
    lower.includes("pgrst205") ||
    lower.includes("schema cache") ||
    lower.includes("could not find the table") ||
    lower.includes("profile_favorites")
  ) {
    return "Profile favorites are not set up yet. Run supabase/phase72.sql in the Supabase SQL editor, then try again.";
  }
  if (lower.includes("profile_favorites_not_self") || lower.includes("check constraint")) {
    return "You cannot favorite your own profile.";
  }
  return raw;
}

export async function loadIsProfileFavorite(profileId: string): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const me = data.session?.user.id;
  if (!me || me === profileId) return false;
  const token = await accessToken();
  const qs = new URLSearchParams({
    select: "profile_id",
    user_id: `eq.${me}`,
    profile_id: `eq.${profileId}`,
    limit: "1",
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${TABLE}?${qs}`, {
      method: "GET",
      headers: authHeaders(token),
    }),
    15000,
    "load profile favorite",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `profile favorite HTTP ${res.status}`);
  }
  const rows: unknown = await res.json();
  return Array.isArray(rows) && rows.length > 0;
}

export async function loadMyFavoriteProfileIds(): Promise<Set<string>> {
  const { data } = await supabase.auth.getSession();
  const me = data.session?.user.id;
  if (!me) return new Set();
  const token = await accessToken();
  const qs = new URLSearchParams({
    select: "profile_id",
    user_id: `eq.${me}`,
    order: "created_at.desc",
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${TABLE}?${qs}`, {
      method: "GET",
      headers: authHeaders(token),
    }),
    15000,
    "load favorite profiles",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `favorite profiles HTTP ${res.status}`);
  }
  const rows: unknown = await res.json();
  const ids = new Set<string>();
  if (!Array.isArray(rows)) return ids;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const id = (row as { profile_id?: unknown }).profile_id;
    if (typeof id === "string" && id) ids.add(id);
  }
  return ids;
}

export async function setProfileFavorite(
  profileId: string,
  favorite: boolean,
): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error("Not signed in.");
  if (uid === profileId) throw new Error("You cannot favorite your own profile.");
  const token = await accessToken();
  if (favorite) {
    const res = await withTimeout(
      supabaseFetch(`${baseUrl()}/rest/v1/${TABLE}?on_conflict=user_id,profile_id`, {
        method: "POST",
        headers: {
          ...authHeaders(token),
          "Content-Type": "application/json",
          Prefer: "resolution=ignore-duplicates",
        },
        body: JSON.stringify({ user_id: uid, profile_id: profileId }),
      }),
      15000,
      "favorite profile",
    );
    if (!res.ok) {
      throw new Error((await res.text()) || `favorite profile HTTP ${res.status}`);
    }
    return;
  }
  const qs = new URLSearchParams({
    user_id: `eq.${uid}`,
    profile_id: `eq.${profileId}`,
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${TABLE}?${qs}`, {
      method: "DELETE",
      headers: authHeaders(token),
    }),
    15000,
    "unfavorite profile",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `unfavorite profile HTTP ${res.status}`);
  }
}
