const PAGE_SIZE = 47;
const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const GAMES_URL = "https://api.igdb.com/v4/games";
const COUNT_URL = "https://api.igdb.com/v4/games/count";
const COVER_BASE = "https://images.igdb.com/igdb/image/upload/t_cover_big";
const LIST_FIELDS =
  "fields id, name, cover.image_id, rating, rating_count, first_release_date, summary, videos.video_id, platforms.abbreviation, platforms.name;";

type TokenCache = { access_token: string; expires_at: number };
let tokenCache: TokenCache | null = null;

function twitchCreds(): { id: string; secret: string } | null {
  const id = (process.env.TWITCH_CLIENT_ID ?? "").trim();
  const secret = (process.env.TWITCH_CLIENT_SECRET ?? "").trim();
  if (!id || !secret) return null;
  return { id, secret };
}

export function igdbIsConfigured(): boolean {
  return twitchCreds() != null;
}

async function accessToken(): Promise<{ clientId: string; token: string }> {
  const creds = twitchCreds();
  if (!creds) {
    throw new Error(
      "Twitch IGDB is not configured. Add TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET to .env.",
    );
  }
  if (tokenCache && Date.now() < tokenCache.expires_at) {
    return { clientId: creds.id, token: tokenCache.access_token };
  }
  const qs = new URLSearchParams({
    client_id: creds.id,
    client_secret: creds.secret,
    grant_type: "client_credentials",
  });
  const res = await fetch(`${TOKEN_URL}?${qs}`, { method: "POST" });
  if (!res.ok) {
    throw new Error(`Twitch rejected credentials (HTTP ${res.status}).`);
  }
  const parsed = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!parsed.access_token) throw new Error("Twitch token response was not JSON.");
  const ttl = Math.max((parsed.expires_in ?? 3600) - 60, 30);
  tokenCache = {
    access_token: parsed.access_token,
    expires_at: Date.now() + ttl * 1000,
  };
  return { clientId: creds.id, token: parsed.access_token };
}

async function igdbPost(url: string, body: string): Promise<unknown> {
  const { clientId, token } = await accessToken();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "text/plain",
    },
    body,
  });
  if (res.status === 401) {
    tokenCache = null;
    throw new Error("IGDB rejected the Twitch token. Restart DARKE and try again.");
  }
  if (!res.ok) throw new Error(`IGDB HTTP ${res.status}`);
  return res.json();
}

function sanitizeSearch(raw: string): string {
  return raw.replace(/["\\]/g, "").trim().slice(0, 80);
}

function categoryWhere(genre: string): string {
  const extra: Record<string, string> = {
    cyberpunk: "keywords = (121)",
    shooter: "genres = (5)",
    "action-adv": "genres = (31)",
    horror: "themes = (19)",
    "sci-fi": "themes = (18)",
    roguelike: "keywords = (1256)",
    sim: "genres = (13)",
    indie: "genres = (32)",
  };
  const base = "cover != null & game_type = (0,8,9,10,11)";
  const more = extra[genre] ?? "";
  return more ? `${base} & ${more}` : base;
}

function sortClause(sort: string, searching: boolean, trending: boolean): string | null {
  if (searching) return null;
  if (trending && (sort === "newest" || sort === "all" || !sort)) {
    return "sort rating_count desc;";
  }
  if (sort === "oldest") return "sort first_release_date asc;";
  if (sort === "top") return "sort rating desc;";
  if (sort === "all") return null;
  return "sort first_release_date desc;";
}

function dateFilter(year: number | null, searching: boolean): string {
  if (searching) return "";
  const now = Math.floor(Date.now() / 1000);
  if (year != null && year >= 1970 && year < 2100) {
    const start = Date.UTC(year, 0, 1) / 1000;
    const end = Date.UTC(year + 1, 0, 1) / 1000;
    return ` & first_release_date >= ${start} & first_release_date < ${end}`;
  }
  return ` & first_release_date != null & first_release_date <= ${now}`;
}

function catalogWhere(genre: string, search: string, sort: string, year: number | null): string {
  const searching = Boolean(sanitizeSearch(search));
  let where = categoryWhere(genre) + dateFilter(year, searching);
  if (!searching && sort === "top") where += " & rating != null";
  return where;
}

function catalogQuery(
  page: number,
  genre: string,
  search: string,
  sort: string,
  year: number | null,
): string {
  const offset = (Math.max(page, 1) - 1) * PAGE_SIZE;
  const q = sanitizeSearch(search);
  const searching = Boolean(q);
  const trending = !genre || genre === "trending" || genre === "all";
  const lines: string[] = [];
  if (searching) lines.push(`search "${q}";`);
  lines.push(LIST_FIELDS);
  lines.push(`where ${catalogWhere(genre, search, sort, year)};`);
  const sortLine = sortClause(sort, searching, trending);
  if (sortLine) lines.push(sortLine);
  lines.push(`limit ${PAGE_SIZE};`);
  lines.push(`offset ${offset};`);
  return lines.join("\n");
}

function fallbackQuery(page: number, search: string): string {
  const offset = (Math.max(page, 1) - 1) * PAGE_SIZE;
  const q = sanitizeSearch(search);
  const now = Math.floor(Date.now() / 1000);
  const lines: string[] = [];
  if (q) lines.push(`search "${q}";`);
  lines.push(LIST_FIELDS);
  if (!q) {
    lines.push(
      `where cover != null & first_release_date != null & first_release_date <= ${now};`,
    );
    lines.push("sort rating_count desc;");
  } else {
    lines.push("where cover != null;");
  }
  lines.push(`limit ${PAGE_SIZE};`);
  lines.push(`offset ${offset};`);
  return lines.join("\n");
}

function coverFrom(row: Record<string, unknown>): string | null {
  const cover = row.cover as { image_id?: string } | undefined;
  const id = (cover?.image_id ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
  return id ? `${COVER_BASE}/${id}.jpg` : null;
}

function mapPlatform(name: string, abbr: string): string | null {
  const n = name.toLowerCase();
  const a = abbr.toLowerCase();
  if (n.includes("playstation") || a.startsWith("ps")) return "PlayStation";
  if (n.includes("xbox") || a.includes("xbox") || a === "xone") return "Xbox";
  if (n.includes("linux") || a === "linux") return "Linux";
  if (n.includes("windows") || a === "pc") return "PC";
  return null;
}

function platformsFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const r = row as { name?: string; abbreviation?: string };
    const label = mapPlatform(r.name ?? "", r.abbreviation ?? "");
    if (label) seen.add(label);
  }
  return ["PC", "PlayStation", "Xbox", "Linux"].filter((p) => seen.has(p));
}

function asGame(row: unknown) {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const id = typeof r.id === "number" ? r.id : Number(r.id);
  const name = typeof r.name === "string" ? r.name.trim() : "";
  if (!id || !name) return null;
  const unix =
    typeof r.first_release_date === "number" ? r.first_release_date : null;
  const released =
    unix && unix > 0 ? new Date(unix * 1000).toISOString().slice(0, 10) : null;
  const rating = typeof r.rating === "number" && r.rating > 0 ? r.rating : null;
  return {
    id,
    name: name.slice(0, 300),
    released,
    coverUrl: coverFrom(r),
    rating,
    platforms: platformsFrom(r.platforms),
  };
}

function trailerFrom(row: Record<string, unknown>) {
  const videos = row.videos;
  if (!Array.isArray(videos)) return null;
  for (const video of videos) {
    if (!video || typeof video !== "object") continue;
    const id = String((video as { video_id?: string }).video_id ?? "").trim();
    if (/^[\w-]{11}$/.test(id)) return { kind: "youtube" as const, id };
  }
  return null;
}

export async function listIgdbGames(input: {
  page: number;
  genre: string;
  search: string;
  sort: string;
  year: number | null;
}) {
  const page = Math.max(1, input.page);
  const query = catalogQuery(page, input.genre, input.search, input.sort, input.year);
  let rows: unknown[] = [];
  try {
    const data = await igdbPost(GAMES_URL, query);
    rows = Array.isArray(data) ? data : [];
  } catch (err) {
    if (page > 1) throw err;
  }
  if (rows.length === 0 && page <= 1) {
    const data = await igdbPost(GAMES_URL, fallbackQuery(page, input.search));
    rows = Array.isArray(data) ? data : [];
  }
  const items = rows.map(asGame).filter((row): row is NonNullable<typeof row> => row != null);
  let totalPages = items.length === PAGE_SIZE ? page + 1 : Math.max(page, 1);
  const q = sanitizeSearch(input.search);
  const whereClause = catalogWhere(input.genre, input.search, input.sort, input.year);
  const countBody = q
    ? `search "${q}";\nwhere ${whereClause};`
    : `where ${whereClause};`;
  try {
    const countJson = (await igdbPost(COUNT_URL, countBody)) as { count?: number };
    if (typeof countJson.count === "number") {
      totalPages = Math.max(Math.ceil(countJson.count / PAGE_SIZE), 1);
    }
  } catch {
    // keep estimate
  }
  return { items, page, totalPages };
}

export async function loadIgdbGameDetail(id: number) {
  if (id <= 0) throw new Error("Invalid game id.");
  const data = await igdbPost(GAMES_URL, `${LIST_FIELDS}\nwhere id = ${id};`);
  const row = Array.isArray(data) ? data[0] : null;
  const game = asGame(row);
  if (!game || !row || typeof row !== "object") throw new Error("Game not found.");
  const r = row as Record<string, unknown>;
  const summary = typeof r.summary === "string" ? r.summary.trim() : "";
  return {
    ...game,
    description: summary || null,
    trailer: trailerFrom(r),
    requirements: null,
  };
}
