import { useEffect, useMemo, useRef, useState } from "react";
import { IconBookmarkFilled, IconBookmarks, IconThumbsUp } from "./icons";
import { PageStarfield } from "./HomeStars";
import { GameDetailModal } from "./GameDetailModal";
import {
  IGDB_GENRES,
  IGDB_SORTS,
  cycleIgdbGame,
  formatIgdbRating,
  formatIgdbReleased,
  igdbConfigured,
  igdbError,
  igdbYearChoices,
  loadIgdbGames,
  mergeIgdbGames,
  type IgdbGame,
  type IgdbGenreId,
  type IgdbSortId,
} from "./igdb";
import { setGameLike } from "./mediaLikes";
import {
  igdbFavoritesError,
  igdbWishlistError,
  loadIgdbFavoriteIds,
  loadIgdbFavorites,
  loadIgdbWishlist,
  loadIgdbWishlistIds,
  setIgdbWishlist,
} from "./igdbSaved";

const YEAR_CHOICES = igdbYearChoices();

type GamesShelf = "catalog" | "favorites" | "wishlist";

function gameYear(released: string | null): string | null {
  const y = released?.slice(0, 4) ?? "";
  return /^\d{4}$/.test(y) ? y : null;
}

export function GamesPane() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState<IgdbGenreId>("trending");
  const [shelf, setShelf] = useState<GamesShelf>("catalog");
  const [sort, setSort] = useState<IgdbSortId>("newest");
  const [year, setYear] = useState<number | null>(null);
  const [items, setItems] = useState<IgdbGame[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [favIds, setFavIds] = useState<Set<number>>(new Set());
  const [favBusy, setFavBusy] = useState<number | null>(null);
  const [wishIds, setWishIds] = useState<Set<number>>(new Set());
  const [wishBusy, setWishBusy] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<IgdbGame | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const queryGen = useRef(0);
  const q = search.trim();
  const showingFavorites = shelf === "favorites";
  const showingWishlist = shelf === "wishlist";
  const showingSaved = showingFavorites || showingWishlist;
  const searching = q.length > 0;
  const ready = configured === true;
  const canLoadMore =
    (searching || !showingSaved) && ready && !loading && page < totalPages;

  const visibleItems = useMemo(() => {
    if (searching || !showingSaved || year == null) return items;
    const y = String(year);
    return items.filter((row) => gameYear(row.released) === y);
  }, [items, showingSaved, year, searching]);

  useEffect(() => {
    let cancelled = false;
    void igdbConfigured()
      .then((ok) => {
        if (!cancelled) setConfigured(ok);
      })
      .catch(() => {
        if (!cancelled) setConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    void loadIgdbFavoriteIds()
      .then((ids) => {
        if (!cancelled) setFavIds(ids);
      })
      .catch(() => {
        if (!cancelled) setFavIds(new Set());
      });
    void loadIgdbWishlistIds()
      .then((ids) => {
        if (!cancelled) setWishIds(ids);
      })
      .catch(() => {
        if (!cancelled) setWishIds(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [showingFavorites, showingWishlist]);

  useEffect(() => {
    if (!showingSaved && configured !== true) {
      if (configured === false) {
        setItems([]);
        setLoading(false);
        setError(null);
      }
      return;
    }
    if (searching && configured !== true) {
      if (configured === false) {
        setItems([]);
        setLoading(false);
        setError(
          "Games catalog is not configured on the server. Add TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET to the server .env (never NEXT_PUBLIC_*) and restart.",
        );
      }
      return;
    }
    let cancelled = false;
    const gen = ++queryGen.current;
    setLoading(true);
    setError(null);
    setOpen(null);
    const load = searching
      ? loadIgdbGames(1, genre, q, sort, year)
      : showingFavorites
        ? loadIgdbFavorites().then((rows) => ({
            items: rows,
            page: 1,
            totalPages: 1,
          }))
        : showingWishlist
          ? loadIgdbWishlist().then((rows) => ({
              items: rows,
              page: 1,
              totalPages: 1,
            }))
          : loadIgdbGames(1, genre, q, sort, year);
    void load
      .then((res) => {
        if (cancelled || gen !== queryGen.current) return;
        setItems(res.items);
        setPage(res.page);
        setTotalPages(res.totalPages);
      })
      .catch((err) => {
        if (cancelled || gen !== queryGen.current) return;
        setItems([]);
        setError(
          showingWishlist
            ? igdbWishlistError(err)
            : showingFavorites
              ? igdbFavoritesError(err)
              : igdbError(err),
        );
      })
      .finally(() => {
        if (!cancelled && gen === queryGen.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [configured, genre, q, sort, year, showingFavorites, showingWishlist, searching]);

  async function loadMore() {
    if (!canLoadMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await loadIgdbGames(page + 1, genre, q, sort, year);
      setItems((prev) => mergeIgdbGames(prev, res.items));
      setPage(res.page);
      setTotalPages(res.totalPages);
    } catch (err) {
      setError(igdbError(err));
    } finally {
      setLoadingMore(false);
    }
  }

  async function toggleFavorite(game: IgdbGame) {
    if (favBusy != null) return;
    const next = !favIds.has(game.id);
    setFavBusy(game.id);
    setFavIds((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(game.id);
      else copy.delete(game.id);
      return copy;
    });
    if (showingFavorites && !next && !searching) {
      setItems((prev) => prev.filter((row) => row.id !== game.id));
    }
    try {
      await setGameLike(game, next);
    } catch (err) {
      setFavIds((prev) => {
        const copy = new Set(prev);
        if (next) copy.delete(game.id);
        else copy.add(game.id);
        return copy;
      });
      setError(igdbFavoritesError(err));
    } finally {
      setFavBusy(null);
    }
  }

  async function toggleWishlist(game: IgdbGame) {
    if (wishBusy != null) return;
    const next = !wishIds.has(game.id);
    setWishBusy(game.id);
    try {
      await setIgdbWishlist(game, next);
      setWishIds((prev) => {
        const copy = new Set(prev);
        if (next) copy.add(game.id);
        else copy.delete(game.id);
        return copy;
      });
      if (showingWishlist && !next && !searching) {
        setItems((prev) => prev.filter((row) => row.id !== game.id));
      }
    } catch (err) {
      setError(igdbWishlistError(err));
    } finally {
      setWishBusy(null);
    }
  }

  const showCatalogNote = configured === false && !showingSaved && !searching;
  const showSkel =
    loading || (configured === null && !showingSaved && !searching);

  return (
    <PageStarfield className="movies-page games-page movies-hub">
      <div className="movies-filter-row">
        <div className="hub-filter-left">
          <select
            className="movies-year-filter movies-kind-filter"
            value={genre}
            aria-label="Game category"
            onChange={(e) => {
              setShelf("catalog");
              setGenre(e.target.value as IgdbGenreId);
              setOpen(null);
            }}
          >
            {IGDB_GENRES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="games-filter-selects">
          <button
            type="button"
            className={`games-shelf-btn${!showingSaved ? " is-on" : ""}`}
            aria-pressed={!showingSaved}
            onClick={() => {
              setShelf("catalog");
              setOpen(null);
            }}
          >
            All
          </button>
          <button
            type="button"
            className={`games-shelf-btn${showingFavorites ? " is-on" : ""}`}
            aria-pressed={showingFavorites}
            onClick={() => {
              setShelf("favorites");
              setOpen(null);
            }}
          >
            Liked
          </button>
          <button
            type="button"
            className={`games-shelf-btn${showingWishlist ? " is-on" : ""}`}
            aria-pressed={showingWishlist}
            onClick={() => {
              setShelf("wishlist");
              setOpen(null);
            }}
          >
            Wishlist
          </button>
          <input
            className="movies-search"
            type="search"
            value={searchInput}
            placeholder="Search games"
            aria-label="Search games"
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <select
            className="movies-year-filter"
            value={year ?? ""}
            aria-label="Filter by year"
            onChange={(e) => {
              const raw = e.target.value;
              setYear(raw ? Number(raw) : null);
              setOpen(null);
            }}
          >
            <option value="">All</option>
            {YEAR_CHOICES.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select
            className="movies-year-filter"
            value={sort}
            aria-label="Sort games"
            onChange={(e) => {
              setSort(e.target.value as IgdbSortId);
              setOpen(null);
            }}
          >
            {IGDB_SORTS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {showCatalogNote ? (
        <p className="muted games-key-note" role="status">
          Games catalog is not configured on the server. Add{" "}
          <code>TWITCH_CLIENT_ID</code> and <code>TWITCH_CLIENT_SECRET</code> to
          the server <code>.env</code> (never <code>NEXT_PUBLIC_*</code>) and
          restart.
        </p>
      ) : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {showSkel ? (
        <div className="movies-grid games-grid" aria-hidden={ready}>
          {Array.from({ length: 8 }, (_, i) => (
            <article key={i} className="movies-card games-skel">
              <span className="movies-poster games-cover is-empty" />
              <span className="games-skel-line" />
              <span className="games-skel-line is-short" />
            </article>
          ))}
        </div>
      ) : visibleItems.length === 0 && !error ? (
        <p className="muted">
          {q
            ? "No games found."
            : showingFavorites
              ? "No liked games yet."
              : showingWishlist
                ? "No games on your wishlist yet."
                : "No games in this list."}
        </p>
      ) : visibleItems.length > 0 ? (
        <div className="movies-grid games-grid">
          {visibleItems.map((item) => {
            const rating = formatIgdbRating(item.rating);
            const favorited = favIds.has(item.id);
            const wishlisted = wishIds.has(item.id);
            return (
              <article key={item.id} className="movies-card">
                <button
                  type="button"
                  className="movies-card-main games-card-main"
                  onClick={() => setOpen(item)}
                >
                  {item.coverUrl ? (
                    <img
                      className="movies-poster games-cover"
                      src={item.coverUrl}
                      alt=""
                      draggable={false}
                    />
                  ) : (
                    <span className="movies-poster games-cover is-empty" aria-hidden>
                      {item.name.slice(0, 1)}
                    </span>
                  )}
                  {rating ? (
                    <span className="games-rating-badge">{rating}</span>
                  ) : null}
                  <h3>{item.name}</h3>
                  <p className="movies-year">{formatIgdbReleased(item.released)}</p>
                </button>
                <div className="movies-card-marks">
                  <button
                    type="button"
                    className={`movies-watch-mark${wishlisted ? " is-on" : ""}`}
                    disabled={wishBusy === item.id}
                    aria-label={
                      wishlisted ? "Remove from wishlist" : "Add to wishlist"
                    }
                    aria-pressed={wishlisted}
                    onClick={() => void toggleWishlist(item)}
                  >
                    {wishlisted ? (
                      <IconBookmarkFilled className="movies-card-mark-icon" />
                    ) : (
                      <IconBookmarks className="movies-card-mark-icon" />
                    )}
                  </button>
                  <button
                    type="button"
                    className={`movies-fav${favorited ? " is-on" : ""}`}
                    disabled={favBusy === item.id}
                    aria-label={favorited ? "Unlike" : "Like"}
                    aria-pressed={favorited}
                    onClick={() => void toggleFavorite(item)}
                  >
                    <IconThumbsUp className="movies-card-mark-icon" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
      {canLoadMore ? (
        <button
          type="button"
          className="movies-load-more"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      ) : null}
      <p className="movies-attrib">
        Data from{" "}
        <a href="https://www.igdb.com/" target="_blank" rel="noreferrer">
          IGDB
        </a>{" "}
        / Twitch.
      </p>
      {open ? (
        <GameDetailModal
          item={open}
          favorited={favIds.has(open.id)}
          favBusy={favBusy === open.id}
          onToggleFavorite={() => void toggleFavorite(open)}
          wishlisted={wishIds.has(open.id)}
          wishBusy={wishBusy === open.id}
          onToggleWishlist={() => void toggleWishlist(open)}
          onClose={() => setOpen(null)}
          onPrev={
            visibleItems.length > 1
              ? () =>
                  setOpen((cur) =>
                    cur ? cycleIgdbGame(visibleItems, cur, -1) : cur,
                  )
              : undefined
          }
          onNext={
            visibleItems.length > 1
              ? () =>
                  setOpen((cur) =>
                    cur ? cycleIgdbGame(visibleItems, cur, 1) : cur,
                  )
              : undefined
          }
        />
      ) : null}
    </PageStarfield>
  );
}
