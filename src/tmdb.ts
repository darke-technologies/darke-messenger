import { withTimeout } from "./supabase";
import { tmdbApiKey } from "./env";

const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p";

export type TmdbKind = "movie" | "tv";

export type MovieFilter =
  | "popular"
  | "now_playing"
  | "upcoming"
  | "top_rated"
  | "favorites"
  | "watchlist";
export type TvFilter =
  | "popular"
  | "airing_today"
  | "on_the_air"
  | "top_rated"
  | "favorites"
  | "watchlist";

export const MOVIE_FILTERS: { id: MovieFilter; label: string }[] = [
  { id: "popular", label: "Popular" },
  { id: "now_playing", label: "Now Playing" },
  { id: "upcoming", label: "Upcoming" },
  { id: "top_rated", label: "Top Rated" },
  { id: "favorites", label: "Favorites" },
  { id: "watchlist", label: "Watchlist" },
];

export const TV_FILTERS: { id: TvFilter; label: string }[] = [
  { id: "popular", label: "Popular" },
  { id: "airing_today", label: "Airing Today" },
  { id: "on_the_air", label: "On TV" },
  { id: "top_rated", label: "Top Rated" },
  { id: "favorites", label: "Favorites" },
  { id: "watchlist", label: "Watchlist" },
];

export const MOVIE_CATALOG_FILTERS = MOVIE_FILTERS.filter(
  (item) => item.id !== "favorites" && item.id !== "watchlist",
);

export const TV_CATALOG_FILTERS = TV_FILTERS.filter(
  (item) => item.id !== "favorites" && item.id !== "watchlist",
);

export type TmdbTitle = {
  id: number;
  kind: TmdbKind;
  title: string;
  posterPath: string | null;
  posterUrl: string | null;
  year: string | null;
  released: string | null;
  rating: number | null;
};

export function parseTmdbId(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export function tmdbReleaseLabel(
  item: Pick<TmdbTitle, "released" | "year">,
): string | null {
  return item.released || item.year;
}

export function cycleTmdbTitle(
  items: TmdbTitle[],
  current: TmdbTitle,
  delta: number,
): TmdbTitle {
  if (items.length === 0) return current;
  const i = items.findIndex(
    (row) => row.kind === current.kind && row.id === current.id,
  );
  const idx = i < 0 ? 0 : i;
  const n = items.length;
  return items[(((idx + delta) % n) + n) % n];
}

export type TmdbDetail = TmdbTitle & {
  overview: string;
  trailerKey: string | null;
  budget: number | null;
};

export function formatTmdbBudget(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`;
}

function envKey(): string {
  return tmdbApiKey();
}

export function tmdbConfigured(): boolean {
  return Boolean(envKey());
}

function isJwt(token: string): boolean {
  return token.startsWith("eyJ") || token.split(".").length === 3;
}

function authParts(): { headers: HeadersInit; qs: URLSearchParams } {
  const key = envKey();
  if (!key) {
    throw new Error(
      "TMDB key missing. Add VITE_TMDB_API_KEY to your .env file, then restart DARKE.",
    );
  }
  const qs = new URLSearchParams();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (isJwt(key)) {
    headers.Authorization = `Bearer ${key}`;
  } else {
    qs.set("api_key", key);
  }
  return { headers, qs };
}

export function tmdbPosterUrl(path: unknown): string | null {
  if (typeof path !== "string" || !path.startsWith("/")) return null;
  return `${TMDB_IMG}/w342${path}`;
}

function yearFromDate(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 4) return null;
  const y = value.slice(0, 4);
  return /^\d{4}$/.test(y) ? y : null;
}

function formatReleaseDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/);
  if (!m) return yearFromDate(value);
  const y = Number(m[1]);
  const month = m[2] ? Number(m[2]) : 0;
  const day = m[3] ? Number(m[3]) : 0;
  if (!month) return String(y);
  const date = new Date(Date.UTC(y, month - 1, day || 1));
  if (Number.isNaN(date.getTime())) return String(y);
  return date.toLocaleDateString("en-US", {
    month: "long",
    ...(day ? { day: "numeric" } : {}),
    year: "numeric",
    timeZone: "UTC",
  });
}

function budgetOf(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function ratingOf(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 10) / 10;
}

function asTitle(row: unknown, kind: TmdbKind): TmdbTitle | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const id = parseTmdbId(r.id);
  if (id == null) return null;
  const title =
    kind === "movie"
      ? typeof r.title === "string"
        ? r.title.trim()
        : ""
      : typeof r.name === "string"
        ? r.name.trim()
        : "";
  if (!title) return null;
  const date = kind === "movie" ? r.release_date : r.first_air_date;
  const posterPath =
    typeof r.poster_path === "string" && r.poster_path.startsWith("/")
      ? r.poster_path
      : null;
  return {
    id,
    kind,
    title,
    posterPath,
    posterUrl: tmdbPosterUrl(posterPath),
    year: yearFromDate(date),
    released: formatReleaseDate(date),
    rating: ratingOf(r.vote_average),
  };
}

function youtubeTrailerKey(videos: unknown): string | null {
  if (!videos || typeof videos !== "object") return null;
  const results = (videos as { results?: unknown }).results;
  if (!Array.isArray(results)) return null;
  const clips = results.filter((item): item is Record<string, unknown> => {
    if (!item || typeof item !== "object") return false;
    const r = item as Record<string, unknown>;
    return (
      r.site === "YouTube" &&
      typeof r.key === "string" &&
      r.key.trim().length >= 6
    );
  });
  const trailer =
    clips.find((c) => c.type === "Trailer" && c.official === true) ??
    clips.find((c) => c.type === "Trailer") ??
    clips[0];
  return typeof trailer?.key === "string" ? trailer.key.trim() : null;
}

async function tmdbGet(path: string, extra?: URLSearchParams): Promise<unknown> {
  const { headers, qs } = authParts();
  if (extra) {
    extra.forEach((v, k) => qs.set(k, v));
  }
  const url = `${TMDB_API}${path}${qs.size ? `?${qs}` : ""}`;
  const res = await withTimeout(
    fetch(url, { method: "GET", headers }),
    20000,
    "tmdb",
  );
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new Error("TMDB rejected the key. Check VITE_TMDB_API_KEY.");
    }
    throw new Error(text || `TMDB HTTP ${res.status}`);
  }
  return res.json();
}

export type TmdbListPage = {
  items: TmdbTitle[];
  page: number;
  totalPages: number;
};

const CATALOG_PAGE_SIZE = 47;
const TMDB_PAGE_SIZE = 20;

export function tmdbYearChoices(): number[] {
  const newest = new Date().getFullYear() + 2;
  const years: number[] = [];
  for (let y = newest; y >= 1920; y -= 1) years.push(y);
  return years;
}

function asListPage(data: unknown, kind: TmdbKind): TmdbListPage & {
  totalResults: number;
} {
  const obj =
    data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const results = Array.isArray(obj.results) ? obj.results : [];
  const page = typeof obj.page === "number" && obj.page > 0 ? obj.page : 1;
  const rawPages =
    typeof obj.total_pages === "number" && obj.total_pages > 0
      ? obj.total_pages
      : 1;
  const totalResults =
    typeof obj.total_results === "number" && obj.total_results > 0
      ? obj.total_results
      : results.length;
  return {
    page,
    totalPages: Math.min(rawPages, 500),
    totalResults,
    items: results
      .map((row) => asTitle(row, kind))
      .filter((row): row is TmdbTitle => row != null),
  };
}

/** Match themoviedb.org US English: theatrical dates for this country. */
const TMDB_REGION = "US";
const TMDB_TZ = "America/New_York";

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function listQuery(
  kind: TmdbKind,
  filter: MovieFilter | TvFilter,
  page: number,
): URLSearchParams {
  const qs = new URLSearchParams({
    language: "en-US",
    page: String(page),
  });
  if (kind === "movie" && (filter === "now_playing" || filter === "upcoming")) {
    qs.set("region", TMDB_REGION);
  }
  if (kind === "tv" && (filter === "airing_today" || filter === "on_the_air")) {
    qs.set("timezone", TMDB_TZ);
  }
  return qs;
}

function discoverQuery(
  kind: TmdbKind,
  filter: MovieFilter | TvFilter,
  page: number,
  year: number,
): URLSearchParams {
  const qs = new URLSearchParams({
    language: "en-US",
    include_adult: "false",
    page: String(page),
  });
  if (kind === "movie") {
    qs.set("region", TMDB_REGION);
    qs.set("primary_release_year", String(year));
    if (filter === "top_rated") {
      qs.set("sort_by", "vote_average.desc");
      qs.set("vote_count.gte", "100");
    } else if (filter === "upcoming") {
      qs.set("sort_by", "popularity.desc");
      qs.set("with_release_type", "3");
      if (year >= new Date().getFullYear()) {
        qs.set("release_date.gte", isoToday());
      }
    } else if (filter === "now_playing") {
      qs.set("sort_by", "popularity.desc");
      qs.set("with_release_type", "3");
    } else {
      qs.set("sort_by", "popularity.desc");
    }
  } else {
    qs.set("first_air_date_year", String(year));
    qs.set("watch_region", TMDB_REGION);
    if (filter === "top_rated") {
      qs.set("sort_by", "vote_average.desc");
      qs.set("vote_count.gte", "50");
    } else {
      qs.set("sort_by", "popularity.desc");
    }
  }
  return qs;
}

function useOfficialNowPlaying(
  filter: MovieFilter | TvFilter,
  year: number | null,
): boolean {
  if (filter !== "now_playing" && filter !== "upcoming") return false;
  if (year == null) return true;
  return year === new Date().getFullYear();
}

export function mergeTmdbTitles(
  prev: TmdbTitle[],
  next: TmdbTitle[],
): TmdbTitle[] {
  const seen = new Set(prev.map((row) => `${row.kind}:${row.id}`));
  const extra = next.filter((row) => !seen.has(`${row.kind}:${row.id}`));
  return extra.length === 0 ? prev : [...prev, ...extra];
}

function asSearchTitle(row: unknown): TmdbTitle | null {
  if (!row || typeof row !== "object") return null;
  const media = (row as { media_type?: unknown }).media_type;
  if (media === "tv") return asTitle(row, "tv");
  if (media === "movie") return asTitle(row, "movie");
  if (media != null) return null;
  return asTitle(row, "movie") ?? asTitle(row, "tv");
}

function asSearchPage(data: unknown): TmdbListPage & { totalResults: number } {
  const obj =
    data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const results = Array.isArray(obj.results) ? obj.results : [];
  const page = typeof obj.page === "number" && obj.page > 0 ? obj.page : 1;
  const rawPages =
    typeof obj.total_pages === "number" && obj.total_pages > 0
      ? obj.total_pages
      : 1;
  const totalResults =
    typeof obj.total_results === "number" && obj.total_results > 0
      ? obj.total_results
      : results.length;
  return {
    page,
    totalPages: Math.min(rawPages, 500),
    totalResults,
    items: results
      .map((row) => asSearchTitle(row))
      .filter((row): row is TmdbTitle => row != null),
  };
}

async function tmdbHubPage(
  hubPage: number,
  fetchTmdbPage: (
    tmdbPage: number,
  ) => Promise<TmdbListPage & { totalResults: number }>,
): Promise<TmdbListPage> {
  const page = Math.max(1, hubPage);
  const offset = (page - 1) * CATALOG_PAGE_SIZE;
  const firstTmdb = Math.floor(offset / TMDB_PAGE_SIZE) + 1;
  const skip = offset % TMDB_PAGE_SIZE;
  const collected: TmdbTitle[] = [];
  let totalResults = 0;
  let tmdbPages = 1;
  let tmdbPage = firstTmdb;
  while (collected.length < skip + CATALOG_PAGE_SIZE) {
    if (tmdbPage > 500) break;
    const chunk = await fetchTmdbPage(tmdbPage);
    tmdbPages = chunk.totalPages;
    totalResults = Math.max(totalResults, chunk.totalResults);
    if (chunk.items.length === 0) break;
    collected.push(...chunk.items);
    tmdbPage += 1;
    if (tmdbPage > tmdbPages) break;
  }
  const items = collected.slice(skip, skip + CATALOG_PAGE_SIZE);
  const totalPages = Math.max(
    1,
    Math.ceil(Math.max(totalResults, items.length) / CATALOG_PAGE_SIZE),
  );
  return { items, page, totalPages };
}

export async function searchTmdbList(
  query: string,
  opts?: { page?: number },
): Promise<TmdbListPage> {
  const q = query.trim();
  if (!q) return { items: [], page: 1, totalPages: 1 };
  const page = Math.max(1, opts?.page ?? 1);
  return tmdbHubPage(page, async (tmdbPage) => {
    const qs = new URLSearchParams({
      language: "en-US",
      include_adult: "false",
      query: q,
      page: String(tmdbPage),
    });
    const data = await tmdbGet("/search/multi", qs);
    return asSearchPage(data);
  });
}

export async function loadTmdbList(
  kind: TmdbKind,
  filter: MovieFilter | TvFilter,
  opts?: { page?: number; year?: number | null },
): Promise<TmdbListPage> {
  if (filter === "favorites" || filter === "watchlist") {
    return { items: [], page: 1, totalPages: 1 };
  }
  const page = Math.max(1, opts?.page ?? 1);
  const year = opts?.year ?? null;
  return tmdbHubPage(page, async (tmdbPage) => {
    if (kind === "movie" && useOfficialNowPlaying(filter, year)) {
      const data = await tmdbGet(
        `/movie/${filter}`,
        listQuery(kind, filter, tmdbPage),
      );
      return asListPage(data, kind);
    }
    if (year) {
      const data = await tmdbGet(
        kind === "movie" ? "/discover/movie" : "/discover/tv",
        discoverQuery(kind, filter, tmdbPage, year),
      );
      return asListPage(data, kind);
    }
    const path = kind === "movie" ? `/movie/${filter}` : `/tv/${filter}`;
    const data = await tmdbGet(path, listQuery(kind, filter, tmdbPage));
    return asListPage(data, kind);
  });
}

export async function loadTmdbDetail(
  kind: TmdbKind,
  id: number,
): Promise<TmdbDetail> {
  const extra = new URLSearchParams({
    language: "en-US",
    append_to_response: "videos",
  });
  const data = await tmdbGet(`/${kind}/${id}`, extra);
  const base = asTitle(data, kind);
  if (!base) throw new Error("Could not load that title.");
  const row = data as Record<string, unknown>;
  const overview =
    typeof row.overview === "string" ? row.overview.trim() : "";
  return {
    ...base,
    overview,
    trailerKey: youtubeTrailerKey(row.videos),
    budget: budgetOf(row.budget),
  };
}

export function tmdbError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.toLowerCase().includes("tmdb key missing")) return raw;
  if (raw.toLowerCase().includes("rejected the key")) return raw;
  return raw || "Could not load Movies-Shows.";
}
