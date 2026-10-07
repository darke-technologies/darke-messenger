import { setIgdbFavorite } from "./igdbSaved";
import type { IgdbGame } from "./igdb";
import type { GbBook } from "./googleBooks";
import { setProfileBook } from "./profileBooks";
import { setProfileGame } from "./profileGames";
import { loadTmdbFavoriteKeys, setTmdbFavorite } from "./tmdbFavorites";
import { loadMyTmdbProfileKeys, setTmdbProfileFeature } from "./tmdbProfile";
import type { TmdbTitle } from "./tmdb";

export async function loadTmdbLikeKeys(): Promise<Set<string>> {
  const [favs, featured] = await Promise.all([
    loadTmdbFavoriteKeys().catch(() => new Set<string>()),
    loadMyTmdbProfileKeys().catch(() => new Set<string>()),
  ]);
  const keys = new Set(favs);
  for (const key of featured) keys.add(key);
  return keys;
}

/** Like a title: private like + public profile row. Unlike removes both. */
export async function setTmdbLike(title: TmdbTitle, on: boolean): Promise<void> {
  await setTmdbFavorite(title, on);
  try {
    await setTmdbProfileFeature(title, on);
  } catch {
    // Profile table may be missing; the like still saved.
  }
}

export async function setGameLike(game: IgdbGame, on: boolean): Promise<void> {
  await setIgdbFavorite(game, on);
  try {
    await setProfileGame(game, on);
  } catch {
    // Profile table may be missing; the like still saved.
  }
}

export async function setBookLike(book: GbBook, on: boolean): Promise<void> {
  await setProfileBook(book, on);
}