import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IconBack, IconBookmarkFilled, IconBookmarks, IconThumbsUp } from "./icons";
import { youtubeEmbedUrl } from "./youtube";
import {
  formatTmdbBudget,
  loadTmdbDetail,
  tmdbError,
  tmdbReleaseLabel,
  type TmdbDetail,
  type TmdbTitle,
} from "./tmdb";

export function MovieDetailModal({
  item,
  favorited,
  favBusy,
  onToggleFavorite,
  watchlisted,
  watchBusy,
  onToggleWatchlist,
  onClose,
  onPrev,
  onNext,
  overProfile = false,
}: {
  item: TmdbTitle;
  favorited: boolean;
  favBusy: boolean;
  onToggleFavorite: () => void;
  watchlisted: boolean;
  watchBusy: boolean;
  onToggleWatchlist: () => void;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onFeatureChange?: () => void;
  overProfile?: boolean;
}) {
  const [detail, setDetail] = useState<TmdbDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    void loadTmdbDetail(item.kind, item.id)
      .then((row) => {
        if (!cancelled) setDetail(row);
      })
      .catch((err) => {
        if (!cancelled) setError(tmdbError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [item.id, item.kind]);

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

  const title = detail?.title ?? item.title;
  const released = tmdbReleaseLabel(detail ?? item);
  const rating = detail?.rating ?? item.rating;
  const poster = detail?.posterUrl ?? item.posterUrl;

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
        className="apps-modal movies-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="movies-detail-title"
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
          {poster ? (
            <img src={poster} alt="" draggable={false} />
          ) : (
            <div className="movies-poster is-empty" aria-hidden />
          )}
          <div className="movies-detail-copy">
            <h3 id="movies-detail-title">{title}</h3>
            <p className="movies-detail-meta">
              Release date: {released ?? "—"}
            </p>
            <p className="movies-detail-meta">
              Budget:{" "}
              {detail?.budget != null ? formatTmdbBudget(detail.budget) : "—"}
            </p>
            {rating != null ? (
              <p className="movies-rating">Rating: {rating.toFixed(1)} / 10</p>
            ) : null}
            <div className="movies-detail-actions">
              <button
                type="button"
                className={`movies-profile-btn movies-watch-btn${favorited ? " is-on" : ""}`}
                disabled={favBusy}
                aria-label={favorited ? "Unlike" : "Like"}
                aria-pressed={favorited}
                onClick={onToggleFavorite}
              >
                <IconThumbsUp className="movies-watch-icon" />
                {favorited ? "Liked" : "Like"}
              </button>
              <button
                type="button"
                className={`movies-profile-btn movies-watch-btn${watchlisted ? " is-on" : ""}`}
                disabled={watchBusy}
                aria-label={watchlisted ? "Remove from watchlist" : "Add to watchlist"}
                aria-pressed={watchlisted}
                onClick={onToggleWatchlist}
              >
                {watchlisted ? (
                  <IconBookmarkFilled className="movies-watch-icon" />
                ) : (
                  <IconBookmarks className="movies-watch-icon" />
                )}
                {watchlisted ? "In Watchlist" : "Watchlist"}
              </button>
            </div>
            {detail ? (
              <p className="movies-overview">
                {detail.overview || "No overview."}
              </p>
            ) : error ? (
              <p className="error" role="alert">
                {error}
              </p>
            ) : (
              <p className="muted">Loading…</p>
            )}
          </div>
        </div>
        {detail?.trailerKey ? (
          <iframe
            className="movies-trailer"
            src={youtubeEmbedUrl(detail.trailerKey)}
            title={`${title} trailer`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : null}
      </div>
      {onPrev ? (
        <button
          type="button"
          className="apps-modal-nav is-prev"
          onClick={onPrev}
          aria-label="Previous title"
        >
          ‹
        </button>
      ) : null}
      {onNext ? (
        <button
          type="button"
          className="apps-modal-nav is-next"
          onClick={onNext}
          aria-label="Next title"
        >
          ›
        </button>
      ) : null}
      </div>
    </div>,
    document.body,
  );
}
