import { publicError, supabase, supabaseFetch, withTimeout } from "./supabase";
import { tmdbFavKey } from "./tmdbFavorites";
import { tmdbPosterUrl, parseTmdbId, type TmdbKind, type TmdbTitle } from "./tmdb";

const TABLE = "tmdb_watchlist";

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

function asWatch(row: unknown): TmdbTitle | null {
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

export function tmdbWatchlistError(err: unknown): string {
  const raw = publicError(err);
  const lower = raw.toLowerCase();
  if (
    lower.includes("tmdb_watchlist") ||
    lower.includes("pgrst205") ||
    (lower.includes("schema cache") && lower.includes("tmdb"))
  ) {
    return "Watchlist is not set up yet. Run supabase/phase31.sql in the Supabase SQL editor, then try again.";
  }
  return raw;
}

export async function loadTmdbWatchlist(kind: TmdbKind): Promise<TmdbTitle[]> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return [];
  const token = await accessToken();
  const qs = new URLSearchParams({
    select: "media_type,tmdb_id,title,poster_path,year,created_at",
    user_id: `eq.${uid}`,
    media_type: `eq.${kind}`,
    order: "created_at.desc",
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${TABLE}?${qs}`, {
      method: "GET",
      headers: authHeaders(token),
    }),
    15000,
    "load movie watchlist",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `watchlist HTTP ${res.status}`);
  }
  const rows: unknown = await res.json();
  if (!Array.isArray(rows)) return [];
  return rows
    .map(asWatch)
    .filter((row): row is TmdbTitle => row != null && row.kind === kind);
}

export async function loadTmdbWatchlistKeys(): Promise<Set<string>> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return new Set();
  const token = await accessToken();
  const qs = new URLSearchParams({
    select: "media_type,tmdb_id",
    user_id: `eq.${uid}`,
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${TABLE}?${qs}`, {
      method: "GET",
      headers: authHeaders(token),
    }),
    15000,
    "load movie watchlist ids",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `watchlist HTTP ${res.status}`);
  }
  const rows: unknown = await res.json();
  const ids = new Set<string>();
  if (!Array.isArray(rows)) return ids;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = parseTmdbId(r.tmdb_id);
    if (
      (r.media_type === "movie" || r.media_type === "tv") &&
      id != null
    ) {
      ids.add(tmdbFavKey(r.media_type, id));
    }
  }
  return ids;
}

export async function setTmdbWatchlist(
  title: TmdbTitle,
  watch: boolean,
): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error("Not signed in.");
  const token = await accessToken();
  if (watch) {
    const res = await withTimeout(
      supabaseFetch(`${baseUrl()}/rest/v1/${TABLE}?on_conflict=user_id,media_type,tmdb_id`, {
        method: "POST",
        headers: {
          ...authHeaders(token),
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify({
          user_id: uid,
          media_type: title.kind,
          tmdb_id: title.id,
          title: title.title.slice(0, 300),
          poster_path: title.posterPath,
          year: title.year,
        }),
      }),
      15000,
      "save movie watchlist",
    );
    if (!res.ok) {
      throw new Error((await res.text()) || `watchlist HTTP ${res.status}`);
    }
    return;
  }
  const qs = new URLSearchParams({
    user_id: `eq.${uid}`,
    tmdb_id: `eq.${title.id}`,
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${TABLE}?${qs}`, {
      method: "DELETE",
      headers: authHeaders(token),
    }),
    15000,
    "remove movie watchlist",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `watchlist HTTP ${res.status}`);
  }
}
