import { publicError, supabase, supabaseFetch, withTimeout } from "./supabase";
import { type GbBook } from "./googleBooks";
import { PROFILE_MEDIA_FETCH } from "./profileMedia";

const TABLE = "book_wishlist";

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

function asStoredBook(row: unknown): GbBook | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.volume_id !== "string" || typeof r.title !== "string") return null;
  const id = r.volume_id.trim();
  if (!id) return null;
  return {
    id,
    title: r.title.trim(),
    authors:
      typeof r.authors === "string" && r.authors.trim() ? r.authors.trim() : null,
    year: typeof r.year === "string" && r.year.trim() ? r.year.trim() : null,
    coverUrl:
      typeof r.cover_url === "string" && r.cover_url.trim()
        ? r.cover_url.trim()
        : null,
    snippet: null,
    categories: [],
    ratingsCount: 0,
  };
}

export function bookWishlistError(err: unknown): string {
  const raw = publicError(err);
  const lower = raw.toLowerCase();
  if (
    lower.includes("book_wishlist") ||
    lower.includes("pgrst205") ||
    lower.includes("volume_id") ||
    (lower.includes("schema cache") && lower.includes("book_wishlist"))
  ) {
    return "Book wishlist is not set up yet. Run supabase/phase59.sql in the Supabase SQL editor, then try again.";
  }
  return raw;
}

export async function loadBookWishlist(): Promise<GbBook[]> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return [];
  const token = await accessToken();
  const qs = new URLSearchParams({
    select: "volume_id,title,authors,cover_url,year,created_at",
    user_id: `eq.${uid}`,
    order: "created_at.desc",
    limit: String(PROFILE_MEDIA_FETCH),
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${TABLE}?${qs}`, {
      method: "GET",
      headers: authHeaders(token),
    }),
    15000,
    "load book wishlist",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `book wishlist HTTP ${res.status}`);
  }
  const rows: unknown = await res.json();
  if (!Array.isArray(rows)) return [];
  return rows
    .map(asStoredBook)
    .filter((row): row is GbBook => row != null);
}

export async function loadMyBookWishlistKeys(): Promise<Set<string>> {
  const rows = await loadBookWishlist();
  return new Set(rows.map((row) => row.id));
}

export async function setBookWishlist(
  book: GbBook,
  on: boolean,
): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error("Not signed in.");
  const token = await accessToken();
  if (on) {
    const res = await withTimeout(
      supabaseFetch(
        `${baseUrl()}/rest/v1/${TABLE}?on_conflict=user_id,volume_id`,
        {
          method: "POST",
          headers: {
            ...authHeaders(token),
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates",
          },
          body: JSON.stringify({
            user_id: uid,
            volume_id: book.id.slice(0, 80),
            title: book.title.slice(0, 300),
            authors: book.authors?.slice(0, 300) ?? null,
            cover_url: book.coverUrl?.slice(0, 2000) ?? null,
            year: book.year,
          }),
        },
      ),
      15000,
      "save book wishlist",
    );
    if (!res.ok) {
      throw new Error((await res.text()) || `book wishlist HTTP ${res.status}`);
    }
    return;
  }
  const qs = new URLSearchParams({
    user_id: `eq.${uid}`,
    volume_id: `eq.${book.id}`,
  });
  const res = await withTimeout(
    supabaseFetch(`${baseUrl()}/rest/v1/${TABLE}?${qs}`, {
      method: "DELETE",
      headers: authHeaders(token),
    }),
    15000,
    "remove book wishlist",
  );
  if (!res.ok) {
    throw new Error((await res.text()) || `remove book wishlist HTTP ${res.status}`);
  }
}
