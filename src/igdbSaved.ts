import { type IgdbGame } from "./igdb";
import { publicError, supabase, supabaseFetch, withTimeout } from "./supabase";

const FAV_TABLE = "igdb_favorites";
const WISH_TABLE = "igdb_wishlist";

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

function sanitizeCover(url: string | null | undefined): string | null {
  const raw = url?.trim() ?? "";
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return null;
    if (parsed.hostname !== "images.igdb.com") return null;
    return parsed.href.slice(0, 2000);
  } catch {
    return null;
  }
}

function asGame(row: unknown): IgdbGame | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const id =
    typeof r.game_id === "number"
      ? r.game_id
      : typeof r.game_id === "string"
        ? Number(r.game_id)
        : NaN;
  if (!Number.isInteger(id) || id <= 0) return null;
  if (typeof r.name !== "string" || !r.name.trim()) return null;
  return {
    id,
    name: r.name.trim().slice(0, 300),
    released:
      typeof r.released === "string" && r.released.trim()
        ? r.released.trim().slice(0, 16)
        : null,
    coverUrl: sanitizeCover(
      typeof r.cover_url === "string" ? r.cover_url : null,
    ),
    rating: null,
    platforms: [],
  };
}

function setupError(err: unknown, table: string, sql: string, label: string): string {
  const raw = publicError(err);
  const lower = raw.toLowerCase();
  if (
    lower.includes(table) ||
    lower.includes("pgrst205") ||
    lower.includes("game_id") ||
    (lower.includes("schema cache") && lower.includes("igdb"))
  ) {
    return `${label} is not set up yet. Run supabase/${sql} in the Supabase SQL editor, then try again.`;
  }
  return raw;
}

export function igdbFavoritesError(err: unknown): string {
  return setupError(err, "igdb_favorites", "phase43.sql", "Game favorites");
}

export function igdbWishlistError(err: unknown): string {
  return setupError(err, "igdb_wishlist", "phase43.sql", "Game wishlist");
}

async function loadSaved(table: string): Promise<IgdbGame[]> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return [];
  const token = await accessToken();
  const qs = new URLSearchParams({
    select: "game_id,name,cover_url,released,created_at",
    user_id: `eq.${uid}`,
    order: "created_at.desc",
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${table}?${qs}`, {
      method: "GET",
      headers: authHeaders(token),
    }),
    15000,
    "load saved games",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `saved games HTTP ${res.status}`);
  }
  const rows: unknown = await res.json();
  if (!Array.isArray(rows)) return [];
  return rows.map(asGame).filter((row): row is IgdbGame => row != null);
}

async function loadSavedIds(table: string): Promise<Set<number>> {
  const rows = await loadSaved(table);
  return new Set(rows.map((row) => row.id));
}

async function setSaved(
  table: string,
  game: IgdbGame,
  on: boolean,
): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error("Not signed in.");
  const token = await accessToken();
  if (on) {
    const res = await withTimeout(
      supabaseFetch(
        `${baseUrl()}/rest/v1/${table}?on_conflict=user_id,game_id`,
        {
          method: "POST",
          headers: {
            ...authHeaders(token),
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates",
          },
          body: JSON.stringify({
            user_id: uid,
            game_id: game.id,
            name: game.name.slice(0, 300),
            cover_url: sanitizeCover(game.coverUrl),
            released: game.released?.slice(0, 16) ?? null,
          }),
        },
      ),
      15000,
      "save game",
    );
    if (!res.ok) {
      throw new Error((await res.text()) || `save game HTTP ${res.status}`);
    }
    return;
  }
  const qs = new URLSearchParams({
    user_id: `eq.${uid}`,
    game_id: `eq.${game.id}`,
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${table}?${qs}`, {
      method: "DELETE",
      headers: authHeaders(token),
    }),
    15000,
    "remove saved game",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `remove game HTTP ${res.status}`);
  }
}

export function loadIgdbFavorites(): Promise<IgdbGame[]> {
  return loadSaved(FAV_TABLE);
}

export function loadIgdbFavoriteIds(): Promise<Set<number>> {
  return loadSavedIds(FAV_TABLE);
}

export function setIgdbFavorite(game: IgdbGame, on: boolean): Promise<void> {
  return setSaved(FAV_TABLE, game, on);
}

export function loadIgdbWishlist(): Promise<IgdbGame[]> {
  return loadSaved(WISH_TABLE);
}

export function loadIgdbWishlistIds(): Promise<Set<number>> {
  return loadSavedIds(WISH_TABLE);
}

export function setIgdbWishlist(game: IgdbGame, on: boolean): Promise<void> {
  return setSaved(WISH_TABLE, game, on);
}
