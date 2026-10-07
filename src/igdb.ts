export type IgdbGenreId =
  | "trending"
  | "cyberpunk"
  | "shooter"
  | "action-adv"
  | "horror"
  | "sci-fi"
  | "roguelike"
  | "sim"
  | "indie";

export const IGDB_GENRES: { id: IgdbGenreId; label: string }[] = [
  { id: "trending", label: "Trending" },
  { id: "cyberpunk", label: "Cyberpunk" },
  { id: "shooter", label: "Shooter" },
  { id: "action-adv", label: "Action-Adv" },
  { id: "horror", label: "Horror" },
  { id: "sci-fi", label: "Sci-Fi" },
  { id: "roguelike", label: "Roguelike" },
  { id: "sim", label: "Sim" },
  { id: "indie", label: "Indie" },
];

export const IGDB_PROFILE_MAX = 5;

export type IgdbSortId = "all" | "newest" | "oldest" | "top";

export const IGDB_SORTS: { id: IgdbSortId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "newest", label: "Newest" },
  { id: "oldest", label: "Oldest" },
  { id: "top", label: "Top rated" },
];

export type IgdbPlatformName = "PC" | "PlayStation" | "Xbox" | "Linux";

export type IgdbGame = {
  id: number;
  name: string;
  released: string | null;
  coverUrl: string | null;
  rating: number | null;
  platforms: IgdbPlatformName[];
};

export type IgdbTrailer = { kind: "youtube"; id: string } | { kind: "file"; url: string };

export type IgdbGameDetail = IgdbGame & {
  description: string | null;
  trailer: IgdbTrailer | null;
  requirements: { minimum: string | null; recommended: string | null } | null;
};

export type IgdbListPage = {
  items: IgdbGame[];
  page: number;
  totalPages: number;
};

let configuredCache: boolean | null = null;

async function igdbApi<T>(params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params);
  const res = await fetch(`/api/igdb?${qs.toString()}`);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || `IGDB HTTP ${res.status}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("IGDB returned invalid JSON.");
  }
}

export async function igdbConfigured(): Promise<boolean> {
  if (configuredCache != null) return configuredCache;
  try {
    const row = await igdbApi<{ configured: boolean }>({ op: "configured" });
    configuredCache = row.configured === true;
  } catch {
    configuredCache = false;
  }
  return configuredCache;
}

export function igdbError(err: unknown): string {
  if (typeof err === "string" && err.trim()) return err.trim();
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  return "IGDB request failed.";
}

export function cycleIgdbGame(
  items: IgdbGame[],
  current: IgdbGame,
  delta: number,
): IgdbGame {
  if (items.length === 0) return current;
  const i = items.findIndex((row) => row.id === current.id);
  const idx = i < 0 ? 0 : i;
  const n = items.length;
  return items[(((idx + delta) % n) + n) % n];
}

export function formatIgdbReleased(value: string | null): string {
  if (!value) return "TBA";
  const d = Date.parse(value);
  if (!Number.isFinite(d)) return value;
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** IGDB `rating` is 0–100. Show a 10-point badge like Movies. */
export function formatIgdbRating(rating: number | null): string | null {
  if (rating == null || !Number.isFinite(rating) || rating <= 0) return null;
  const scaled = rating > 10 ? rating / 10 : rating;
  return scaled.toFixed(1);
}

export function igdbYearChoices(): number[] {
  const newest = new Date().getFullYear();
  const years: number[] = [];
  for (let y = newest; y >= 1980; y -= 1) years.push(y);
  return years;
}

export async function loadIgdbGames(
  page = 1,
  genre: IgdbGenreId = "trending",
  search = "",
  sort: IgdbSortId = "newest",
  year: number | null = null,
): Promise<IgdbListPage> {
  return igdbApi<IgdbListPage>({
    op: "games",
    page: String(page),
    genre,
    search,
    sort,
    year: year == null ? "" : String(year),
  });
}

export function mergeIgdbGames(prev: IgdbGame[], next: IgdbGame[]): IgdbGame[] {
  const seen = new Set(prev.map((row) => row.id));
  return [...prev, ...next.filter((row) => !seen.has(row.id))];
}

export async function loadIgdbGame(game: IgdbGame): Promise<IgdbGameDetail> {
  return igdbApi<IgdbGameDetail>({ op: "game", id: String(game.id) });
}
