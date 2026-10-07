import { PROFILE_MEDIA_FETCH } from "./profileMedia";
import { publicError, supabase, supabaseFetch, withTimeout } from "./supabase";
import { parseTmdbId, tmdbPosterUrl, type TmdbTitle } from "./tmdb";
import { tmdbFavKey } from "./tmdbFavorites";

const TABLE = "tmdb_profile_features";

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

function asFeature(row: unknown): TmdbTitle | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (r.media_type !== "movie" && r.media_type !== "tv") return null;
  const id = parseTmdbId(r.tmdb_id);
  if (id == null || typeof r.title !== "string") return null;
  const posterPath =
    typeof r.poster_path === "string" && r.poster_path.startsWith("/")
      ? r.poster_path
      : null;
  return {
    id,
    kind: r.media_type,
    title: r.title.trim(),
    posterPath,
    posterUrl: tmdbPosterUrl(posterPath),
    year: typeof r.year === "string" && r.year.trim() ? r.year.trim() : null,
    released: null,
    rating: null,
  };
}

export function tmdbProfileError(err: unknown): string {
  const raw = publicError(err);
  const lower = raw.toLowerCase();
  if (lower.includes("tmdb_profile_features_max")) {
    return "Profile movies are capped on the server. Run supabase/phase40.sql in the Supabase SQL editor, then try again.";
  }
  if (
    lower.includes("tmdb_profile_features") ||
    lower.includes("pgrst205") ||
    (lower.includes("schema cache") && lower.includes("tmdb"))
  ) {
    return "Profile movies are not set up yet. Run supabase/phase30.sql in the Supabase SQL editor, then try again.";
  }
  return raw;
}

export async function loadTmdbProfileFeatures(
  userId: string,
): Promise<TmdbTitle[]> {
  const uid = userId.trim();
  if (!uid) return [];
  const token = await accessToken();
  const qs = new URLSearchParams({
    select: "media_type,tmdb_id,title,poster_path,year,created_at",
    user_id: `eq.${uid}`,
    order: "created_at.asc",
    limit: String(PROFILE_MEDIA_FETCH),
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${TABLE}?${qs}`, {
      method: "GET",
      headers: authHeaders(token),
    }),
    15000,
    "load profile movies",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `profile movies HTTP ${res.status}`);
  }
  const rows: unknown = await res.json();
  if (!Array.isArray(rows)) return [];
  return rows
    .map(asFeature)
    .filter((row): row is TmdbTitle => row != null);
}

export async function loadMyTmdbProfileKeys(): Promise<Set<string>> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return new Set();
  const rows = await loadTmdbProfileFeatures(uid);
  return new Set(rows.map((row) => tmdbFavKey(row.kind, row.id)));
}

export async function setTmdbProfileFeature(
  title: TmdbTitle,
  featured: boolean,
): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error("Not signed in.");
  const token = await accessToken();
  if (featured) {
    const current = await loadTmdbProfileFeatures(uid);
    const key = tmdbFavKey(title.kind, title.id);
    if (current.some((row) => tmdbFavKey(row.kind, row.id) === key)) return;
    const res = await withTimeout(
      supabaseFetch(
        `${baseUrl()}/rest/v1/${TABLE}?on_conflict=user_id,media_type,tmdb_id`,
        {
          method: "POST",
          headers: {
            ...authHeaders(token),
            "Content-Type": "application/json",
            Prefer: "resolution=ignore-duplicates",
          },
          body: JSON.stringify({
            user_id: uid,
            media_type: title.kind,
            tmdb_id: title.id,
            title: title.title.slice(0, 300),
            poster_path: title.posterPath,
            year: title.year,
          }),
        },
      ),
      15000,
      "feature movie",
    );
    if (!res.ok) {
      throw new Error((await res.text()) || `feature HTTP ${res.status}`);
    }
    return;
  }
  const qs = new URLSearchParams({
    user_id: `eq.${uid}`,
    media_type: `eq.${title.kind}`,
    tmdb_id: `eq.${title.id}`,
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${TABLE}?${qs}`, {
      method: "DELETE",
      headers: authHeaders(token),
    }),
    15000,
    "unfeature movie",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `unfeature HTTP ${res.status}`);
  }
}
