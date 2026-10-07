import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IconBack, IconBookmarkFilled, IconBookmarks, IconThumbsUp } from "./icons";
import {
  formatIgdbRating,
  formatIgdbReleased,
  igdbError,
  loadIgdbGame,
  type IgdbGame,
  type IgdbGameDetail,
} from "./igdb";
import { setGameLike } from "./mediaLikes";
import {
  igdbFavoritesError,
  igdbWishlistError,
  loadIgdbFavoriteIds,
  loadIgdbWishlistIds,
  setIgdbWishlist,
} from "./igdbSaved";
import { youtubeEmbedUrl } from "./youtube";

export function GameDetailModal({
  item,
  favorited: favoritedProp,
  favBusy: favBusyProp,
  onToggleFavorite,
  wishlisted: wishlistedProp,
  wishBusy: wishBusyProp,
  onToggleWishlist,
  onClose,
  onPrev,
  onNext,
  onFeatureChange,
  overProfile = false,
}: {
  item: IgdbGame;
  favorited?: boolean;
  favBusy?: boolean;
  onToggleFavorite?: () => void;
  wishlisted?: boolean;
  wishBusy?: boolean;
  onToggleWishlist?: () => void;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onFeatureChange?: () => void;
  overProfile?: boolean;
}) {
  const [detail, setDetail] = useState<IgdbGameDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [featureNote, setFeatureNote] = useState<string | null>(null);
  const [localFavIds, setLocalFavIds] = useState<Set<number>>(new Set());
  const [localFavBusy, setLocalFavBusy] = useState(false);
  const [localWishIds, setLocalWishIds] = useState<Set<number>>(new Set());
  const [localWishBusy, setLocalWishBusy] = useState(false);
  const [pendingLike, setPendingLike] = useState<boolean | null>(null);

  useEffect(() => {
    setPendingLike(null);
  }, [item.id]);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    void loadIgdbGame(item)
      .then((row) => {
        if (!cancelled) setDetail(row);
      })
      .catch((err) => {
        if (!cancelled) {
          setDetail({
            ...item,
            description: null,
            trailer: null,
            requirements: null,
          });
          setError(igdbError(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  useEffect(() => {
    if (onToggleFavorite && onToggleWishlist) return;
    let cancelled = false;
    if (!onToggleFavorite) {
      void loadIgdbFavoriteIds()
        .then((ids) => {
          if (!cancelled) setLocalFavIds(ids);
        })
        .catch(() => {
          if (!cancelled) setLocalFavIds(new Set());
        });
    }
    if (!onToggleWishlist) {
      void loadIgdbWishlistIds()
        .then((ids) => {
          if (!cancelled) setLocalWishIds(ids);
        })
        .catch(() => {
          if (!cancelled) setLocalWishIds(new Set());
        });
    }
    return () => {
      cancelled = true;
    };
  }, [item.id, onToggleFavorite, onToggleWishlist]);

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

  const game = detail ?? {
    ...item,
    description: null,
    trailer: null,
    requirements: null,
  };
  const rating = formatIgdbRating(game.rating);
  const hasPc = game.platforms.includes("PC");
  const trailer = game.trailer;
  const favorited = pendingLike ?? favoritedProp ?? localFavIds.has(item.id);
  const wishlisted = wishlistedProp ?? localWishIds.has(item.id);
  const favBusy = favBusyProp ?? localFavBusy;
  const wishBusy = wishBusyProp ?? localWishBusy;

  async function toggleFavoriteLocal() {
    if (localFavBusy) return;
    const next = !favorited;
    setLocalFavBusy(true);
    setPendingLike(next);
    setFeatureNote(null);
    try {
      await setGameLike(game, next);
      setLocalFavIds((prev) => {
        const copy = new Set(prev);
        if (next) copy.add(item.id);
        else copy.delete(item.id);
        return copy;
      });
      onFeatureChange?.();
    } catch (err) {
      setPendingLike(!next);
      setFeatureNote(igdbFavoritesError(err));
    } finally {
      setLocalFavBusy(false);
    }
  }

  async function toggleWishlistLocal() {
    if (localWishBusy) return;
    setLocalWishBusy(true);
    setFeatureNote(null);
    try {
      await setIgdbWishlist(game, !wishlisted);
      setLocalWishIds((prev) => {
        const next = new Set(prev);
        if (wishlisted) next.delete(game.id);
        else next.add(game.id);
        return next;
      });
    } catch (err) {
      setFeatureNote(igdbWishlistError(err));
    } finally {
      setLocalWishBusy(false);
    }
  }

  return createPortal(
    <div
      className={`apps-modal-backdrop movies-detail-backdrop${overProfile ? " is-over-profile" : ""}`}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="apps-modal-stage">
        <div
          className="apps-modal movies-detail games-detail"
          role="dialog"
          aria-modal="true"
          aria-labelledby="games-detail-title"
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
            {game.coverUrl ? (
              <img
                className="movies-poster games-cover"
                src={game.coverUrl}
                alt=""
                draggable={false}
              />
            ) : (
              <span className="movies-poster games-cover is-empty" aria-hidden>
                {game.name.slice(0, 1)}
              </span>
            )}
            <div className="movies-detail-copy">
              <h3 id="games-detail-title">{game.name}</h3>
              <p className="movies-detail-meta">
                Released {formatIgdbReleased(game.released)}
              </p>
              {rating ? (
                <p className="movies-rating">Rating {rating} / 10</p>
              ) : null}
              {game.platforms.length > 0 ? (
                <p className="games-platforms games-platforms-detail">
                  {game.platforms.join(" · ")}
                </p>
              ) : null}
              <div className="movies-detail-actions">
                <button
                  type="button"
                  className={`movies-profile-btn movies-watch-btn${favorited ? " is-on" : ""}`}
                  disabled={favBusy}
                  aria-label={favorited ? "Unlike" : "Like"}
                  aria-pressed={favorited}
                  onClick={() => {
                    if (favBusy) return;
                    if (onToggleFavorite) {
                      setPendingLike(!favorited);
                      onToggleFavorite();
                      return;
                    }
                    void toggleFavoriteLocal();
                  }}
                >
                  <IconThumbsUp className="movies-watch-icon" />
                  {favorited ? "Liked" : "Like"}
                </button>
                <button
                  type="button"
                  className={`movies-profile-btn movies-watch-btn${wishlisted ? " is-on" : ""}`}
                  disabled={wishBusy}
                  aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
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
            </div>
          </div>
          {trailer?.kind === "youtube" ? (
            <iframe
              key={trailer.id}
              className="movies-trailer"
              src={youtubeEmbedUrl(trailer.id)}
              title={`${game.name} trailer`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : trailer?.kind === "file" ? (
            <video
              key={trailer.url}
              className="movies-trailer"
              src={trailer.url}
              controls
              playsInline
              preload="metadata"
            />
          ) : detail ? (
            <p className="muted games-no-trailer">No trailer available.</p>
          ) : (
            <p className="muted games-no-trailer">Loading trailer…</p>
          )}
          {game.description ? (
            <p className="movies-overview games-overview">{game.description}</p>
          ) : error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : !detail ? (
            <p className="muted">Loading…</p>
          ) : (
            <p className="muted">No description.</p>
          )}
          {hasPc && game.requirements ? (
            <div className="games-reqs">
              <h4>PC system requirements</h4>
              {game.requirements.minimum ? (
                <p>{game.requirements.minimum}</p>
              ) : null}
              {game.requirements.recommended ? (
                <p>{game.requirements.recommended}</p>
              ) : null}
            </div>
          ) : null}
        </div>
        {onPrev ? (
          <button
            type="button"
            className="apps-modal-nav is-prev"
            onClick={onPrev}
            aria-label="Previous game"
          >
            ‹
          </button>
        ) : null}
        {onNext ? (
          <button
            type="button"
            className="apps-modal-nav is-next"
            onClick={onNext}
            aria-label="Next game"
          >
            ›
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
