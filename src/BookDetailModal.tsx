import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  IconBack,
  IconBookmarkFilled,
  IconBookmarks,
  IconThumbsUp,
} from "./icons";
import { BookCover } from "./BookCover";
import {
  googleBooksError,
  gbDetailCoverUrl,
  loadGoogleBook,
  type GbBook,
  type GbBookDetail,
} from "./googleBooks";
import { setBookLike } from "./mediaLikes";
import {
  loadMyProfileBookKeys,
  profileBooksError,
} from "./profileBooks";
import {
  bookWishlistError,
  loadMyBookWishlistKeys,
  setBookWishlist,
} from "./bookWishlist";

export function BookDetailModal({
  item,
  liked: likedProp,
  likeBusy: likeBusyProp,
  onToggleLike,
  wishlisted: wishlistedProp,
  wishBusy: wishBusyProp,
  onToggleWishlist,
  onClose,
  onPrev,
  onNext,
  onFeatureChange,
  overProfile = false,
}: {
  item: GbBook;
  liked?: boolean;
  likeBusy?: boolean;
  onToggleLike?: () => void;
  wishlisted?: boolean;
  wishBusy?: boolean;
  onToggleWishlist?: () => void;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onFeatureChange?: () => void;
  overProfile?: boolean;
}) {
  const [detail, setDetail] = useState<GbBookDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localLikeKeys, setLocalLikeKeys] = useState<Set<string>>(new Set());
  const [localLikeBusy, setLocalLikeBusy] = useState(false);
  const [localWishKeys, setLocalWishKeys] = useState<Set<string>>(new Set());
  const [localWishBusy, setLocalWishBusy] = useState(false);
  const [featureNote, setFeatureNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    void loadGoogleBook(item)
      .then((row) => {
        if (!cancelled) setDetail(row);
      })
      .catch((err) => {
        if (!cancelled) {
          setDetail({ ...item, description: item.snippet });
          setError(googleBooksError(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  useEffect(() => {
    if (!onPrev && !onNext) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onPrev?.();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onNext?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPrev, onNext]);

  useEffect(() => {
    if (onToggleLike && onToggleWishlist) return;
    let cancelled = false;
    if (!onToggleLike) {
      void loadMyProfileBookKeys()
        .then((keys) => {
          if (!cancelled) setLocalLikeKeys(keys);
        })
        .catch(() => {
          if (!cancelled) setLocalLikeKeys(new Set());
        });
    }
    if (!onToggleWishlist) {
      void loadMyBookWishlistKeys()
        .then((keys) => {
          if (!cancelled) setLocalWishKeys(keys);
        })
        .catch(() => {
          if (!cancelled) setLocalWishKeys(new Set());
        });
    }
    return () => {
      cancelled = true;
    };
  }, [item.id, onToggleLike, onToggleWishlist]);

  const book: GbBookDetail = detail ?? { ...item, description: item.snippet };
  const liked = likedProp ?? localLikeKeys.has(book.id);
  const wishlisted = wishlistedProp ?? localWishKeys.has(book.id);
  const likeBusy = likeBusyProp ?? localLikeBusy;
  const wishBusy = wishBusyProp ?? localWishBusy;
  const blurb = book.description || book.snippet;

  async function toggleLikeLocal() {
    if (localLikeBusy) return;
    setLocalLikeBusy(true);
    setFeatureNote(null);
    try {
      await setBookLike(book, !liked);
      setLocalLikeKeys((prev) => {
        const next = new Set(prev);
        if (liked) next.delete(book.id);
        else next.add(book.id);
        return next;
      });
      onFeatureChange?.();
    } catch (err) {
      setFeatureNote(profileBooksError(err));
    } finally {
      setLocalLikeBusy(false);
    }
  }

  async function toggleWishlistLocal() {
    if (localWishBusy) return;
    setLocalWishBusy(true);
    setFeatureNote(null);
    try {
      await setBookWishlist(book, !wishlisted);
      setLocalWishKeys((prev) => {
        const next = new Set(prev);
        if (wishlisted) next.delete(book.id);
        else next.add(book.id);
        return next;
      });
    } catch (err) {
      setFeatureNote(bookWishlistError(err));
    } finally {
      setLocalWishBusy(false);
    }
  }

  return createPortal(
    <div
      className={`apps-modal-backdrop movies-detail-backdrop books-detail-backdrop${overProfile ? " is-over-profile" : ""}`}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="apps-modal-stage">
        <div
          className="apps-modal movies-detail books-detail"
          role="dialog"
          aria-modal="true"
          aria-labelledby="books-detail-title"
        >
          <button
            type="button"
            className="apps-profile-back apps-listing-head-back"
            onClick={onClose}
            aria-label="Back"
          >
            <IconBack />
          </button>
          <div className="movies-detail-hero">
            <BookCover
              className="movies-poster"
              url={gbDetailCoverUrl(book.coverUrl)}
              volumeId={book.id}
              letter={book.title}
            />
            <div className="movies-detail-copy">
              <h3 id="books-detail-title">{book.title}</h3>
              {book.authors ? (
                <p className="movies-detail-meta">{book.authors}</p>
              ) : null}
              <p className="movies-detail-meta">{book.year || "Year unknown"}</p>
              <div className="movies-detail-actions">
                <button
                  type="button"
                  className={`movies-profile-btn movies-watch-btn${liked ? " is-on" : ""}`}
                  disabled={likeBusy}
                  aria-label={liked ? "Unlike" : "Like"}
                  aria-pressed={liked}
                  onClick={() =>
                    onToggleLike ? onToggleLike() : void toggleLikeLocal()
                  }
                >
                  <IconThumbsUp className="movies-watch-icon" />
                  {liked ? "Liked" : "Like"}
                </button>
                <button
                  type="button"
                  className={`movies-profile-btn movies-watch-btn${wishlisted ? " is-on" : ""}`}
                  disabled={wishBusy}
                  aria-label={
                    wishlisted ? "Remove from wishlist" : "Add to wishlist"
                  }
                  aria-pressed={wishlisted}
                  onClick={() =>
                    onToggleWishlist
                      ? onToggleWishlist()
                      : void toggleWishlistLocal()
                  }
                >
                  {wishlisted ? (
                    <IconBookmarkFilled className="movies-watch-icon" />
                  ) : (
                    <IconBookmarks className="movies-watch-icon" />
                  )}
                  {wishlisted ? "In Wishlist" : "Wishlist"}
                </button>
              </div>
              {featureNote ? (
                <p className="error" role="alert">
                  {featureNote}
                </p>
              ) : null}
              {blurb ? (
                <p className="movies-overview">{blurb}</p>
              ) : error ? (
                <p className="error" role="alert">
                  {error}
                </p>
              ) : !detail ? (
                <p className="muted">Loading…</p>
              ) : (
                <p className="muted">No description.</p>
              )}
            </div>
          </div>
        </div>
        {onPrev ? (
          <button
            type="button"
            className="apps-modal-nav is-prev"
            onClick={onPrev}
            aria-label="Previous book"
          >
            ‹
          </button>
        ) : null}
        {onNext ? (
          <button
            type="button"
            className="apps-modal-nav is-next"
            onClick={onNext}
            aria-label="Next book"
          >
            ›
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
