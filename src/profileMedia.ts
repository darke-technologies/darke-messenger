export const PROFILE_MEDIA_PREVIEW = 8;
export const PROFILE_TMDB_PREVIEW = 5;
export const PROFILE_MEDIA_PAGE = 24;
export const PROFILE_MEDIA_FETCH = 500;

export type ProfileMediaKind = "tmdb" | "books" | "games";

export function profileMediaTitle(kind: ProfileMediaKind): string {
  if (kind === "books") return "Books";
  if (kind === "games") return "Games";
  return "Movies & TV Shows";
}
