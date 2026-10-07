import { useEffect, useMemo, useRef, useState } from "react";
import { IconBookmarkFilled, IconBookmarks, IconThumbsUp } from "./icons";
import { PageStarfield } from "./HomeStars";
import { MovieDetailModal } from "./MovieDetailModal";
import {
  MOVIE_CATALOG_FILTERS,
  TV_CATALOG_FILTERS,
  cycleTmdbTitle,
  loadTmdbList,
  mergeTmdbTitles,
  searchTmdbList,
  tmdbConfigured,
  tmdbError,
  tmdbReleaseLabel,
  tmdbYearChoices,
  type MovieFilter,
  type TmdbKind,
  type TmdbTitle,
  type TvFilter,
} from "./tmdb";
import {
  loadTmdbFavorites,
  tmdbFavKey,
  tmdbFavoritesError,
} from "./tmdbFavorites";
import { setTmdbLike, loadTmdbLikeKeys } from "./mediaLikes";
import {
  loadTmdbWatchlist,
  loadTmdbWatchlistKeys,
  setTmdbWatchlist,
  tmdbWatchlistError,
} from "./tmdbWatchlist";

const YEAR_CHOICES = tmdbYearChoices();

export function MoviesPane() {
  const [kind, setKind] = useState<TmdbKind>("movie");
  const [movieFilter, setMovieFilter] = useState<MovieFilter>("popular");
  const [tvFilter, setTvFilter] = useState<TvFilter>("popular");
  const [year, setYear] = useState<number | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<TmdbTitle[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [favKeys, setFavKeys] = useState<Set<string>>(new Set());
  const [favBusy, setFavBusy] = useState<string | null>(null);
  const [watchKeys, setWatchKeys] = useState<Set<string>>(new Set());
  const [watchBusy, setWatchBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<TmdbTitle | null>(null);
  const [shelf, setShelf] = useState<"catalog" | "favorites" | "watchlist">(
    "catalog",
  );

  const catalogFilter = kind === "movie" ? movieFilter : tvFilter;
  const showingFavorites = shelf === "favorites";
  const showingWatchlist = shelf === "watchlist";
  const filter = showingFavorites
    ? "favorites"
    : showingWatchlist
      ? "watchlist"
      : catalogFilter;
  const showingSaved = showingFavorites || showingWatchlist;
  const searching = search.trim().length > 0;
  const canLoadMore =
    (searching || !showingSaved) && !loading && page < totalPages;
  const queryGen = useRef(0);

  const visibleItems = useMemo(() => {
    let rows = items;
    if (!searching && showingSaved && year != null) {
      const y = String(year);
      rows = rows.filter((row) => row.year === y);
    }
    return rows;
  }, [items, showingSaved, year, searching]);

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    void loadTmdbLikeKeys()
      .then((keys) => {
        if (!cancelled) setFavKeys(keys);
      })
      .catch(() => {
        if (!cancelled) setFavKeys(new Set());
      });
    void loadTmdbWatchlistKeys()
      .then((keys) => {
        if (!cancelled) setWatchKeys(keys);
      })
      .catch(() => {
        if (!cancelled) setWatchKeys(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [showingWatchlist, showingFavorites]);

  useEffect(() => {
    let cancelled = false;
    const gen = ++queryGen.current;
    setLoading(true);
    setError(null);
    setItems([]);
    setPage(1);
    setTotalPages(1);
    const load =
      searching
        ? tmdbConfigured()
          ? searchTmdbList(search, { page: 1 })
          : Promise.reject(
              new Error(
                "TMDB key missing. Add VITE_TMDB_API_KEY to your .env file, then restart DARKE.",
              ),
            )
        : showingFavorites
          ? loadTmdbFavorites(kind).then((rows) => ({
              items: rows,
              page: 1,
              totalPages: 1,
            }))
          : showingWatchlist
            ? loadTmdbWatchlist(kind).then((rows) => ({
                items: rows,
                page: 1,
                totalPages: 1,
              }))
          : !tmdbConfigured()
            ? Promise.reject(
                new Error(
                  "TMDB key missing. Add VITE_TMDB_API_KEY to your .env file, then restart DARKE.",
                ),
              )
            : loadTmdbList(kind, filter, { page: 1, year });
    void load
      .then((result) => {
        if (cancelled || gen !== queryGen.current) return;
        setItems(result.items);
        setPage(result.page);
        setTotalPages(result.totalPages);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setItems([]);
        setError(
          showingWatchlist
            ? tmdbWatchlistError(err)
            : showingFavorites
              ? tmdbFavoritesError(err)
              : tmdbError(err),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, filter, year, showingFavorites, showingWatchlist, searching, search]);

  async function loadMore() {
    if (!canLoadMore || loadingMore) return;
    const gen = queryGen.current;
    setLoadingMore(true);
    setError(null);
    const nextPage = page + 1;
    try {
      const result = searching
        ? await searchTmdbList(search, { page: nextPage })
        : await loadTmdbList(kind, filter, {
            page: nextPage,
            year,
          });
      if (gen !== queryGen.current) return;
      setItems((prev) => mergeTmdbTitles(prev, result.items));
      setPage(result.page);
      setTotalPages(result.totalPages);
    } catch (err) {
      if (gen !== queryGen.current) return;
      setError(tmdbError(err));
    } finally {
      if (gen === queryGen.current) setLoadingMore(false);
    }
  }

  async function toggleFavorite(title: TmdbTitle) {
    const key = tmdbFavKey(title.kind, title.id);
    if (favBusy) return;
    const next = !favKeys.has(key);
    setFavBusy(key);
    setFavKeys((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(key);
      else copy.delete(key);
      return copy;
    });
    if (showingFavorites && !next) {
      setItems((prev) =>
        prev.filter((row) => tmdbFavKey(row.kind, row.id) !== key),
      );
    }
    try {
      await setTmdbLike(title, next);
    } catch (err) {
      setFavKeys((prev) => {
        const copy = new Set(prev);
        if (next) copy.delete(key);
        else copy.add(key);
        return copy;
      });
      setError(tmdbFavoritesError(err));
    } finally {
      setFavBusy(null);
    }
  }

  async function toggleWatchlist(title: TmdbTitle) {
    const key = tmdbFavKey(title.kind, title.id);
    if (watchBusy) return;
    const listed =
      showingWatchlist ||
      watchKeys.has(key) ||
      watchKeys.has(tmdbFavKey(title.kind === "tv" ? "movie" : "tv", title.id));
    const next = !listed;
    setWatchBusy(key);
    try {
      await setTmdbWatchlist(title, next);
      setWatchKeys((prev) => {
        const copy = new Set(prev);
        copy.delete(`movie:${title.id}`);
        copy.delete(`tv:${title.id}`);
        if (next) copy.add(key);
        return copy;
      });
      if (showingWatchlist && !next) {
        setItems((prev) => prev.filter((row) => row.id !== title.id));
      }
    } catch (err) {
      setError(tmdbWatchlistError(err));
    } finally {
      setWatchBusy(null);
    }
  }

  return (
    <PageStarfield className="movies-page movies-hub">
      <div className="movies-filter-row">
        <div className="hub-filter-left">
          <select
            className="movies-year-filter movies-kind-filter"
            value={kind}
            aria-label="Movies or shows"
            onChange={(e) => {
              setKind(e.target.value === "tv" ? "tv" : "movie");
              setOpen(null);
            }}
          >
            <option value="movie">Movies</option>
            <option value="tv">Shows</option>
          </select>
          <select
            className="movies-year-filter movies-kind-filter"
            value={catalogFilter}
            aria-label={kind === "tv" ? "Show list" : "Movie list"}
            onChange={(e) => {
              const next = e.target.value;
              setShelf("catalog");
              if (kind === "movie") setMovieFilter(next as MovieFilter);
              else setTvFilter(next as TvFilter);
              setOpen(null);
            }}
          >
            {(kind === "movie" ? MOVIE_CATALOG_FILTERS : TV_CATALOG_FILTERS).map(
              (item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ),
            )}
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
            className={`games-shelf-btn${showingWatchlist ? " is-on" : ""}`}
            aria-pressed={showingWatchlist}
            onClick={() => {
              setShelf("watchlist");
              setOpen(null);
            }}
          >
            Watchlist
          </button>
          <input
            className="movies-search"
            type="search"
            value={searchInput}
            placeholder={kind === "tv" ? "Search shows" : "Search movies"}
            aria-label={kind === "tv" ? "Search shows" : "Search movies"}
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
        </div>
      </div>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? <p className="muted">Loading…</p> : null}
      {!loading && !error && visibleItems.length === 0 ? (
        <p className="muted">
          {searching
            ? "No titles match that search."
            : showingFavorites
              ? "No liked titles in this list yet."
              : showingWatchlist
                ? "No titles in your watchlist yet."
                : "Nothing in this list right now."}
        </p>
      ) : null}

      <div className="movies-grid">
        {visibleItems.map((item) => {
          const key = tmdbFavKey(item.kind, item.id);
          const favorited = favKeys.has(key);
          const watchlisted =
            showingWatchlist ||
            watchKeys.has(key) ||
            watchKeys.has(tmdbFavKey(item.kind === "tv" ? "movie" : "tv", item.id));
          return (
            <article key={key} className="movies-card">
              <button
                type="button"
                className="movies-card-main"
                title={item.title}
                onClick={() => setOpen(item)}
              >
                {item.posterUrl ? (
                  <img
                    className="movies-poster"
                    src={item.posterUrl}
                    alt=""
                    draggable={false}
                  />
                ) : (
                  <span className="movies-poster is-empty" aria-hidden>
                    {item.title.slice(0, 1)}
                  </span>
                )}
                <h3>{item.title}</h3>
                <p className="movies-year">{tmdbReleaseLabel(item) ?? "—"}</p>
              </button>
              <div className="movies-card-marks">
                <button
                  type="button"
                  className={`movies-watch-mark${watchlisted ? " is-on" : ""}`}
                  disabled={watchBusy === key}
                  aria-label={
                    watchlisted ? "Remove from watchlist" : "Add to watchlist"
                  }
                  aria-pressed={watchlisted}
                  onClick={() => void toggleWatchlist(item)}
                >
                  {watchlisted ? (
                    <IconBookmarkFilled className="movies-card-mark-icon" />
                  ) : (
                    <IconBookmarks className="movies-card-mark-icon" />
                  )}
                </button>
                <button
                  type="button"
                  className={`movies-fav${favorited ? " is-on" : ""}`}
                  disabled={favBusy === key}
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

      {canLoadMore || loadingMore ? (
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
        This product uses the TMDB API but is not endorsed or certified by TMDB.
        {" "}
        <a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer">
          The Movie Database
        </a>
      </p>

      {open ? (
        <MovieDetailModal
          item={open}
          favorited={favKeys.has(tmdbFavKey(open.kind, open.id))}
          favBusy={favBusy === tmdbFavKey(open.kind, open.id)}
          onToggleFavorite={() => void toggleFavorite(open)}
          watchlisted={
            showingWatchlist ||
            watchKeys.has(tmdbFavKey(open.kind, open.id)) ||
            watchKeys.has(
              tmdbFavKey(open.kind === "tv" ? "movie" : "tv", open.id),
            )
          }
          watchBusy={watchBusy === tmdbFavKey(open.kind, open.id)}
          onToggleWatchlist={() => void toggleWatchlist(open)}
          onClose={() => setOpen(null)}
          onPrev={
            visibleItems.length > 1
              ? () =>
                  setOpen((cur) =>
                    cur ? cycleTmdbTitle(visibleItems, cur, -1) : cur,
                  )
              : undefined
          }
          onNext={
            visibleItems.length > 1
              ? () =>
                  setOpen((cur) =>
                    cur ? cycleTmdbTitle(visibleItems, cur, 1) : cur,
                  )
              : undefined
          }
        />
      ) : null}
    </PageStarfield>
  );
}
