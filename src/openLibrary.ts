import { withTimeout } from "./supabase";
import { openLibraryBase, openLibraryCovers } from "./env";

const olBase = () => openLibraryBase();
const coversBase = () => openLibraryCovers();

export const OL_PROFILE_MAX = 5;
/** @deprecated Use OL_PROFILE_MAX */
export const GB_PROFILE_MAX = OL_PROFILE_MAX;

export type OlBook = {
  id: string;
  title: string;
  authors: string | null;
  year: string | null;
  coverUrl: string | null;
  snippet: string | null;
  categories: string[];
  ratingsCount: number;
};

export type GbBook = OlBook;

export type OlBookDetail = OlBook & {
  description: string | null;
};

export type GbBookDetail = OlBookDetail;

export type OlSearchPage = {
  items: OlBook[];
  page: number;
  totalPages: number;
};

function coverFile(path: string): string {
  return `${coversBase()}${path}?default=false`;
}

export function olCoverUrl(
  coverId: number | null,
  size: "S" | "M" | "L" = "M",
): string | null {
  if (coverId == null || coverId <= 0) return null;
  return coverFile(`/b/id/${coverId}-${size}.jpg`);
}

function olOlidCoverUrl(olid: string | null, size: "S" | "M" | "L" = "M"): string | null {
  const id = olid?.trim().match(/^OL\d+M$/i)?.[0];
  if (!id) return null;
  return coverFile(`/b/olid/${id}-${size}.jpg`);
}

function olIsbnCoverUrl(isbn: string | null, size: "S" | "M" | "L" = "M"): string | null {
  const digits = isbn?.replace(/[^0-9Xx]/g, "") ?? "";
  if (digits.length !== 10 && digits.length !== 13) return null;
  return coverFile(`/b/isbn/${digits}-${size}.jpg`);
}

function firstIsbn(row: Record<string, unknown>): string | null {
  const list = Array.isArray(row.isbn) ? row.isbn : [];
  const cleaned = list
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.replace(/[^0-9Xx]/g, ""))
    .filter((v) => v.length === 10 || v.length === 13);
  return cleaned.find((v) => v.length === 13) ?? cleaned[0] ?? null;
}

export function olCoverId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const n = Number(value.trim());
    return n > 0 ? n : null;
  }
  return null;
}

function pickCoverUrl(
  coverId: number | null,
  olid: string | null,
  isbn: string | null,
): string | null {
  return (
    olCoverUrl(coverId, "M") ??
    olOlidCoverUrl(olid) ??
    olIsbnCoverUrl(isbn)
  );
}

export function cycleOlBook(
  items: OlBook[],
  current: OlBook,
  delta: number,
): OlBook {
  if (items.length === 0) return current;
  const i = items.findIndex((row) => row.id === current.id);
  const idx = i < 0 ? 0 : i;
  const n = items.length;
  return items[(((idx + delta) % n) + n) % n];
}

/** @deprecated Use cycleOlBook */
export const cycleGbBook = cycleOlBook;

export function olDetailCoverUrl(url: string | null): string | null {
  if (!url) return null;
  return url.replace(/-(?:S|M)\.jpg(\?|$)/, "-L.jpg$1");
}

export const gbDetailCoverUrl = olDetailCoverUrl;

export function openLibraryError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  return "Open Library request failed.";
}

export const googleBooksError = openLibraryError;

function asText(value: unknown): string | null {
  if (typeof value === "string") {
    const t = value.trim();
    return t || null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const t = asText(item);
      if (t) return t;
    }
    return null;
  }
  if (value && typeof value === "object") {
    return asText((value as { value?: unknown }).value);
  }
  return null;
}

function normalizeWorkKey(raw: string): string | null {
  const m = raw.trim().match(/\/works\/(OL\d+W)/i);
  return m ? `/works/${m[1]}` : null;
}

function asYear(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const y = String(Math.floor(value));
    return y.length <= 8 ? y : null;
  }
  if (typeof value === "string") {
    const m = value.trim().match(/^(\d{1,8})/);
    return m ? m[1] : null;
  }
  return null;
}

function asAuthors(row: Record<string, unknown>): string | null {
  if (Array.isArray(row.author_name)) {
    const name = row.author_name.find(
      (n): n is string => typeof n === "string" && n.trim().length > 0,
    );
    if (name) return name.trim().slice(0, 300);
  }
  if (typeof row.author_name === "string" && row.author_name.trim()) {
    return row.author_name.trim().slice(0, 300);
  }
  return null;
}

function asCategories(row: Record<string, unknown>): string[] {
  const list = Array.isArray(row.subject) ? row.subject : [];
  return list
    .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
    .map((n) => n.trim())
    .slice(0, 12);
}

function asBook(row: unknown): OlBook | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const key = normalizeWorkKey(typeof r.key === "string" ? r.key : "");
  if (!key) return null;
  const title = asText(r.title);
  if (!title) return null;
  const coverId = olCoverId(r.cover_i) ?? olCoverId(r.cover_id);
  const olid =
    typeof r.cover_edition_key === "string" ? r.cover_edition_key : null;
  const want =
    typeof r.want_to_read_count === "number" && Number.isFinite(r.want_to_read_count)
      ? Math.max(0, Math.floor(r.want_to_read_count))
      : 0;
  return {
    id: key.slice(0, 80),
    title: title.slice(0, 300),
    authors: asAuthors(r),
    year: asYear(r.first_publish_year),
    coverUrl: pickCoverUrl(coverId, olid, firstIsbn(r)),
    snippet: asText(r.first_sentence),
    categories: asCategories(r),
    ratingsCount: want,
  };
}

async function olGet(url: string, label: string): Promise<unknown> {
  const res = await withTimeout(
    fetch(url, { method: "GET", headers: { Accept: "application/json" } }),
    20000,
    label,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Open Library HTTP ${res.status}`);
  }
  return res.json();
}

const OL_PAGE_SIZE = 47;

async function searchPage(
  q: string,
  page: number,
  extra?: Record<string, string>,
): Promise<OlSearchPage> {
  const p = page > 0 ? page : 1;
  const qs = new URLSearchParams({
    q,
    page: String(p),
    limit: String(OL_PAGE_SIZE),
    fields:
      "key,title,author_name,first_publish_year,cover_i,cover_edition_key,isbn,first_sentence,subject,want_to_read_count",
    ...extra,
  });
  const data = await olGet(`${olBase()}/search.json?${qs}`, "open library search");
  const obj =
    data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const docs = Array.isArray(obj.docs) ? obj.docs : [];
  const numFound =
    typeof obj.numFound === "number" && obj.numFound > 0 ? obj.numFound : docs.length;
  return {
    page: p,
    totalPages: Math.max(1, Math.ceil(numFound / OL_PAGE_SIZE)),
    items: docs.map(asBook).filter((row): row is OlBook => row != null),
  };
}

export async function searchOpenLibrary(
  query: string,
  page = 1,
): Promise<OlSearchPage> {
  const q = query.trim();
  if (!q) return { items: [], page: 1, totalPages: 1 };
  return searchPage(q, page);
}

export const searchGoogleBooks = searchOpenLibrary;

export function olBestsellerYears(): number[] {
  const newest = Math.max(2026, new Date().getFullYear());
  const years: number[] = [];
  for (let y = newest; y >= 1990; y -= 1) years.push(y);
  return years;
}

export const gbBestsellerYears = olBestsellerYears;

export const OL_GENRES = [
  { id: "all", label: "All", subject: null },
  { id: "fiction", label: "Fiction", subject: "fiction" },
  { id: "nonfiction", label: "Non-fiction", subject: "nonfiction" },
  { id: "mystery", label: "Mystery", subject: "mystery" },
  { id: "thriller", label: "Thriller", subject: "thriller" },
  { id: "romance", label: "Romance", subject: "romance" },
  { id: "fantasy", label: "Fantasy", subject: "fantasy" },
  { id: "scifi", label: "Sci-Fi", subject: "science fiction" },
  { id: "horror", label: "Horror", subject: "horror" },
  { id: "history", label: "History", subject: "history" },
  { id: "biography", label: "Biography", subject: "biography" },
  { id: "ya", label: "YA", subject: "young adult" },
] as const;

export const GB_GENRES = OL_GENRES;

export type OlGenreId = (typeof OL_GENRES)[number]["id"];
export type GbGenreId = OlGenreId;

export function olGenreLabel(id: OlGenreId): string {
  return OL_GENRES.find((row) => row.id === id)?.label ?? "All";
}

export const gbGenreLabel = olGenreLabel;

function catalogQuery(year: number | null, genre: OlGenreId): string {
  const y =
    year != null && Number.isFinite(year) && year > 0 ? Math.floor(year) : null;
  const yearBit = y ? ` AND first_publish_year:${y}` : "";
  const coverBit = " AND cover_i:*";
  const row = OL_GENRES.find((item) => item.id === genre);
  const subject = row?.subject ?? null;
  if (!subject) {
    return y
      ? `(subject:"new york times bestseller" OR subject:fiction)${yearBit}${coverBit}`
      : `(subject:"new york times bestseller" OR subject:fiction)${coverBit}`;
  }
  if (genre === "nonfiction") {
    return `(subject:nonfiction OR subject:"non-fiction")${yearBit}${coverBit}`;
  }
  const quoted = subject.includes(" ") ? `"${subject}"` : subject;
  return `subject:${quoted}${yearBit}${coverBit}`;
}

export async function loadOpenLibraryCatalog(
  page = 1,
  year: number | null = 2026,
  genre: OlGenreId = "all",
): Promise<OlSearchPage> {
  const q = catalogQuery(year, genre);
  const primary = await searchPage(q, page, { sort: "readinglog" });
  if (primary.items.length > 0) return primary;
  const retry = await searchPage(q, page, { sort: "new" });
  if (retry.items.length > 0 || genre !== "all") return retry;
  const y =
    year != null && Number.isFinite(year) && year > 0 ? Math.floor(year) : null;
  const fallback = y
    ? `subject:fiction AND first_publish_year:${y} AND cover_i:*`
    : "subject:fiction AND cover_i:*";
  return searchPage(fallback, page, { sort: "readinglog" });
}

export const loadGoogleBooksCatalog = loadOpenLibraryCatalog;

export async function loadOpenLibraryWork(book: OlBook): Promise<OlBookDetail> {
  const key = normalizeWorkKey(book.id);
  if (!key) return { ...book, description: book.snippet };
  try {
    const data = await olGet(`${olBase()}${key}.json`, "open library work");
    const obj =
      data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    const description = asText(obj.description) ?? book.snippet;
    const title = asText(obj.title) ?? book.title;
    const fromWork = Array.isArray(obj.covers)
      ? obj.covers.map((c) => olCoverId(c)).find((id): id is number => id != null) ??
        null
      : null;
    return {
      ...book,
      id: key,
      title: title.slice(0, 300),
      coverUrl: olCoverUrl(fromWork, "L") ?? book.coverUrl,
      description,
    };
  } catch {
    return { ...book, description: book.snippet };
  }
}

export const loadGoogleBook = loadOpenLibraryWork;
