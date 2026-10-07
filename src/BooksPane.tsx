import { useEffect, useRef, useState } from "react";
import { IconBookmarkFilled, IconBookmarks, IconThumbsUp } from "./icons";
import { PageStarfield } from "./HomeStars";
import { BookDetailModal } from "./BookDetailModal";
import { BookCover } from "./BookCover";
import {
  cycleGbBook,
  GB_GENRES,
  gbBestsellerYears,
  googleBooksError,
  loadGoogleBooksCatalog,
  searchGoogleBooks,
  type GbBook,
  type GbGenreId,
} from "./googleBooks";
import { setBookLike } from "./mediaLikes";
import {
  loadMyLikedBooks,
  loadMyProfileBookKeys,
  profileBooksError,
} from "./profileBooks";
import {
  bookWishlistError,
  loadBookWishlist,
  loadMyBookWishlistKeys,
  setBookWishlist,
} from "./bookWishlist";

const YEAR_CHOICES = gbBestsellerYears();
const DEFAULT_YEAR = YEAR_CHOICES.includes(2026) ? 2026 : YEAR_CHOICES[0] ?? 2026;

type BooksShelf = "catalog" | "favorites" | "wishlist";

export function BooksPane() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [year, setYear] = useState<number | null>(DEFAULT_YEAR);
  const [genre, setGenre] = useState<GbGenreId>("all");
  const [shelf, setShelf] = useState<BooksShelf>("catalog");
  const [catalogItems, setCatalogItems] = useState<GbBook[]>([]);
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogTotal, setCatalogTotal] = useState(1);
  const [searchItems, setSearchItems] = useState<GbBook[]>([]);
  const [searchPage, setSearchPage] = useState(1);
  const [searchTotal, setSearchTotal] = useState(1);
  const [savedItems, setSavedItems] = useState<GbBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<GbBook | null>(null);
  const [likeKeys, setLikeKeys] = useState<Set<string>>(new Set());
  const [likeBusy, setLikeBusy] = useState<string | null>(null);
  const [wishKeys, setWishKeys] = useState<Set<string>>(new Set());
  const [wishBusy, setWishBusy] = useState<string | null>(null);
  const queryGen = useRef(0);

  const q = search.trim();
  const searching = q.length > 0;
  const showingLiked = shelf === "favorites";
  const showingWishlist = shelf === "wishlist";
  const showingSaved = showingLiked || showingWishlist;
  const items = searching ? searchItems : showingSaved ? savedItems : catalogItems;
  const canLoadMore = searching
    ? !loading && searchPage < searchTotal
    : showingSaved
      ? false
      : !loading && catalogPage < catalogTotal;

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    void loadMyProfileBookKeys()
      .then((keys) => {
        if (!cancelled) setLikeKeys(keys);
      })
      .catch(() => {
        if (!cancelled) setLikeKeys(new Set());
      });
    void loadMyBookWishlistKeys()
      .then((keys) => {
        if (!cancelled) setWishKeys(keys);
      })
      .catch(() => {
        if (!cancelled) setWishKeys(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [showingLiked, showingWishlist]);

  useEffect(() => {
    let cancelled = false;
    const gen = ++queryGen.current;
    setError(null);
    setOpen(null);
    setLoading(true);
    const req = searching
      ? searchGoogleBooks(q, 1)
      : showingLiked
        ? loadMyLikedBooks().then((rows) => ({
            items: rows,
            page: 1,
            totalPages: 1,
          }))
        : showingWishlist
          ? loadBookWishlist().then((rows) => ({
              items: rows,
              page: 1,
              totalPages: 1,
            }))
          : loadGoogleBooksCatalog(1, year, genre);
    void req
      .then((res) => {
        if (cancelled || gen !== queryGen.current) return;
        if (searching) {
          setSearchItems(res.items);
          setSearchPage(res.page);
          setSearchTotal(res.totalPages);
        } else if (showingSaved) {
          setSavedItems(res.items);
        } else {
          setCatalogItems(res.items);
          setCatalogPage(res.page);
          setCatalogTotal(res.totalPages);
        }
      })
      .catch((err) => {
        if (cancelled || gen !== queryGen.current) return;
        if (searching) setSearchItems([]);
        else if (showingSaved) setSavedItems([]);
        else setCatalogItems([]);
        setError(
          showingWishlist && !searching
            ? bookWishlistError(err)
            : showingLiked && !searching
              ? profileBooksError(err)
              : googleBooksError(err),
        );
      })
      .finally(() => {
        if (!cancelled && gen === queryGen.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q, year, genre, showingLiked, showingWishlist, searching]);

  async function loadMore() {
    if (!canLoadMore || loadingMore) return;
    setLoadingMore(true);
    try {
      if (searching) {
        const res = await searchGoogleBooks(q, searchPage + 1);
        setSearchItems((prev) => {
          const seen = new Set(prev.map((row) => row.id));
          return [...prev, ...res.items.filter((row) => !seen.has(row.id))];
        });
        setSearchPage(res.page);
        setSearchTotal(res.totalPages);
      } else {
        const res = await loadGoogleBooksCatalog(catalogPage + 1, year, genre);
        setCatalogItems((prev) => {
          const seen = new Set(prev.map((row) => row.id));
          return [...prev, ...res.items.filter((row) => !seen.has(row.id))];
        });
        setCatalogPage(res.page);
        setCatalogTotal(res.totalPages);
      }
    } catch (err) {
      setError(googleBooksError(err));
    } finally {
      setLoadingMore(false);
    }
  }

  async function toggleLike(book: GbBook) {
    if (likeBusy != null) return;
    const next = !likeKeys.has(book.id);
    setLikeBusy(book.id);
    setLikeKeys((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(book.id);
      else copy.delete(book.id);
      return copy;
    });
    if (showingLiked && !next && !searching) {
      setSavedItems((prev) => prev.filter((row) => row.id !== book.id));
    }
    try {
      await setBookLike(book, next);
    } catch (err) {
      setLikeKeys((prev) => {
        const copy = new Set(prev);
        if (next) copy.delete(book.id);
        else copy.add(book.id);
        return copy;
      });
      setError(profileBooksError(err));
    } finally {
      setLikeBusy(null);
    }
  }

  async function toggleWishlist(book: GbBook) {
    if (wishBusy != null) return;
    const next = !wishKeys.has(book.id);
    setWishBusy(book.id);
    try {
      await setBookWishlist(book, next);
      setWishKeys((prev) => {
        const copy = new Set(prev);
        if (next) copy.add(book.id);
        else copy.delete(book.id);
        return copy;
      });
      if (showingWishlist && !next && !searching) {
        setSavedItems((prev) => prev.filter((row) => row.id !== book.id));
      }
    } catch (err) {
      setError(bookWishlistError(err));
    } finally {
      setWishBusy(null);
    }
  }

  return (
    <PageStarfield className="movies-page books-page movies-hub">
      <div className="movies-filter-row">
        <div className="hub-filter-left">
          <select
            className="movies-year-filter movies-kind-filter"
            value={genre}
            aria-label="Book genre"
            onChange={(e) => {
              setShelf("catalog");
              setGenre(e.target.value as GbGenreId);
              setOpen(null);
            }}
          >
            {GB_GENRES.map((item) => (
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
            className={`games-shelf-btn${showingLiked ? " is-on" : ""}`}
            aria-pressed={showingLiked}
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
            placeholder="Search books"
            aria-label="Search books by title or author"
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <select
            className="movies-year-filter"
            value={year ?? ""}
            aria-label="Filter by year"
            onChange={(e) => {
              setShelf("catalog");
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
      {loading ? (
        <p className="muted">{searching ? "Searching…" : "Loading…"}</p>
      ) : items.length === 0 && !error ? (
        <p className="muted">
          {searching
            ? "No books found."
            : showingLiked
              ? "No liked books yet."
              : showingWishlist
                ? "No books on your wishlist yet."
                : "No books in this list."}
        </p>
      ) : items.length > 0 ? (
        <div className="movies-grid">
          {items.map((item) => {
            const liked = likeKeys.has(item.id);
            const wishlisted = wishKeys.has(item.id);
            return (
              <article key={item.id} className="movies-card">
                <button
                  type="button"
                  className="movies-card-main books-card-main"
                  onClick={() => setOpen(item)}
                >
                  <BookCover
                    className="movies-poster"
                    url={item.coverUrl}
                    letter={item.title}
                  />
                  <h3>{item.title}</h3>
                  <p className="movies-year">
                    {[item.authors, item.year].filter(Boolean).join(" · ") || "—"}
                  </p>
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
                    className={`movies-fav${liked ? " is-on" : ""}`}
                    disabled={likeBusy === item.id}
                    aria-label={liked ? "Unlike" : "Like"}
                    aria-pressed={liked}
                    onClick={() => void toggleLike(item)}
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
          className="movies-load-more books-load-more"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      ) : null}
      <p className="movies-attrib">
        Data from{" "}
        <a href="https://openlibrary.org/" target="_blank" rel="noreferrer">
          Open Library
        </a>
        .
      </p>
      {open ? (
        <BookDetailModal
          item={open}
          liked={likeKeys.has(open.id)}
          likeBusy={likeBusy === open.id}
          onToggleLike={() => void toggleLike(open)}
          wishlisted={wishKeys.has(open.id)}
          wishBusy={wishBusy === open.id}
          onToggleWishlist={() => void toggleWishlist(open)}
          onClose={() => setOpen(null)}
          onPrev={
            items.length > 1
              ? () =>
                  setOpen((cur) => (cur ? cycleGbBook(items, cur, -1) : cur))
              : undefined
          }
          onNext={
            items.length > 1
              ? () =>
                  setOpen((cur) => (cur ? cycleGbBook(items, cur, 1) : cur))
              : undefined
          }
        />
      ) : null}
    </PageStarfield>
  );
}
