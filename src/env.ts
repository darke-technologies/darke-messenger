export function supabaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");
}

export function supabaseAnonKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ""
  ).trim();
}

export function authRedirectUrl(): string {
  return (
    process.env.NEXT_PUBLIC_AUTH_REDIRECT_URL ||
    process.env.VITE_AUTH_REDIRECT_URL ||
    ""
  ).trim();
}

export function tmdbApiKey(): string {
  return (
    process.env.NEXT_PUBLIC_TMDB_API_KEY ||
    process.env.VITE_TMDB_API_KEY ||
    ""
  ).trim();
}

export function openLibraryBase(): string {
  return (
    process.env.NEXT_PUBLIC_OPENLIBRARY_BASE ||
    process.env.VITE_OPENLIBRARY_BASE ||
    "https://openlibrary.org"
  )
    .trim()
    .replace(/\/$/, "");
}

export function openLibraryCovers(): string {
  return (
    process.env.NEXT_PUBLIC_OPENLIBRARY_COVERS ||
    process.env.VITE_OPENLIBRARY_COVERS ||
    "https://covers.openlibrary.org"
  )
    .trim()
    .replace(/\/$/, "");
}

export const PUBLIC_ASSET_BASE = "/";
