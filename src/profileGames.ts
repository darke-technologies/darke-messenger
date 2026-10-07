import { type IgdbGame } from "./igdb";
import { PROFILE_MEDIA_FETCH } from "./profileMedia";
import { publicError, supabase, supabaseFetch, withTimeout } from "./supabase";

const TABLE = "profile_games";
const LIMIT_MSG =
  "Profile games are capped on the server. Run supabase/phase40.sql in the Supabase SQL editor, then try again.";

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

function asStoredGame(row: unknown): IgdbGame | null {
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

export function profileGamesError(err: unknown): string {
  const raw = publicError(err);
  const lower = raw.toLowerCase();
  if (lower.includes("profile_games_max")) return LIMIT_MSG;
  if (
    lower.includes("profile_games") ||
    lower.includes("pgrst205") ||
    lower.includes("game_id") ||
    (lower.includes("schema cache") && lower.includes("profile_games"))
  ) {
    return "Profile games are not set up yet. Run supabase/phase39.sql in the Supabase SQL editor, then try again.";
  }
  return raw;
}

export { LIMIT_MSG as PROFILE_GAMES_LIMIT_MSG };

export async function loadProfileGames(userId: string): Promise<IgdbGame[]> {
  const uid = userId.trim();
  if (!uid) return [];
  const token = await accessToken();
  const qs = new URLSearchParams({
    select: "game_id,name,cover_url,released,created_at",
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
    "load profile games",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `profile games HTTP ${res.status}`);
  }
  const rows: unknown = await res.json();
  if (!Array.isArray(rows)) return [];
  return rows
    .map(asStoredGame)
    .filter((row): row is IgdbGame => row != null);
}

export async function loadMyProfileGameIds(): Promise<Set<number>> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return new Set();
  const rows = await loadProfileGames(uid);
  return new Set(rows.map((row) => row.id));
}

export async function setProfileGame(
  game: IgdbGame,
  featured: boolean,
): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error("Not signed in.");
  const token = await accessToken();
  if (featured) {
    const current = await loadProfileGames(uid);
    if (current.some((row) => row.id === game.id)) return;
    const res = await withTimeout(
      supabaseFetch(
        `${baseUrl()}/rest/v1/${TABLE}?on_conflict=user_id,game_id`,
        {
          method: "POST",
          headers: {
            ...authHeaders(token),
            "Content-Type": "application/json",
            Prefer: "resolution=ignore-duplicates",
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
      "feature game",
    );
    if (!res.ok) {
      throw new Error((await res.text()) || `feature HTTP ${res.status}`);
    }
    return;
  }
  const qs = new URLSearchParams({
    user_id: `eq.${uid}`,
    game_id: `eq.${game.id}`,
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${TABLE}?${qs}`, {
      method: "DELETE",
      headers: authHeaders(token),
    }),
    15000,
    "unfeature game",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `unfeature HTTP ${res.status}`);
  }
}
