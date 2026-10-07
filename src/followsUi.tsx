import { useCallback, useEffect, useState } from "react";
import {
  followsError,
  loadFollowStats,
  setFollowing,
  type FollowStats,
} from "./follows";

const EMPTY: FollowStats = {
  followers: 0,
  following: 0,
  isFollowing: false,
  followsYou: false,
};

export function useFollow(targetUserId: string | null, isSelf: boolean) {
  const [stats, setStats] = useState<FollowStats>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!targetUserId) {
      setStats(EMPTY);
      setError(null);
      return;
    }
    let cancelled = false;
    void loadFollowStats(targetUserId)
      .then((next) => {
        if (!cancelled) {
          setStats(next);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setStats(EMPTY);
          setError(followsError(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [targetUserId]);

  const toggle = useCallback(async () => {
    if (!targetUserId || isSelf || busy) return;
    const next = !stats.isFollowing;
    setBusy(true);
    setError(null);
    setStats((prev) => ({
      ...prev,
      isFollowing: next,
      followers: Math.max(0, prev.followers + (next ? 1 : -1)),
    }));
    try {
      await setFollowing(targetUserId, next);
    } catch (err) {
      setStats((prev) => ({
        ...prev,
        isFollowing: !next,
        followers: Math.max(0, prev.followers + (next ? -1 : 1)),
      }));
      setError(followsError(err));
    } finally {
      setBusy(false);
    }
  }, [busy, isSelf, stats.isFollowing, targetUserId]);

  return { stats, busy, error, toggle };
}

export function ProfileFollowCounts({
  followers,
  updates = 0,
  comments = 0,
}: {
  followers: number;
  updates?: number;
  comments?: number;
}) {
  return (
    <p className="profile-follow-counts">
      <span>
        <strong>{followers}</strong> Followers
      </span>
      <span className="profile-follow-counts-dot" aria-hidden>
        ·
      </span>
      <span>
        <strong>{updates}</strong> Updates
      </span>
      <span className="profile-follow-counts-dot" aria-hidden>
        ·
      </span>
      <span>
        <strong>{comments}</strong> Comments
      </span>
    </p>
  );
}

export function FollowButton({
  isFollowing,
  busy,
  onToggle,
  className = "profile-follow-btn",
  followLabel = "Follow",
  followingLabel = "Following",
  variant = "pill",
}: {
  isFollowing: boolean;
  busy: boolean;
  onToggle: () => void;
  className?: string;
  followLabel?: string;
  followingLabel?: string;
  variant?: "pill" | "text";
}) {
  const isText = variant === "text";
  return (
    <button
      type="button"
      className={`${isText ? "" : "follow-pill "}${className}${isFollowing ? " is-on" : ""}`}
      disabled={busy}
      aria-pressed={isFollowing}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
    >
      {isText
        ? isFollowing
          ? "Unfollow"
          : followLabel
        : isFollowing ? (
        <>
          <span className="follow-pill-idle">
            <FollowCheckIcon />
            {followingLabel}
          </span>
          <span className="follow-pill-swap">Unfollow</span>
        </>
      ) : (
        <>
          <FollowPlusIcon />
          {followLabel}
        </>
      )}
    </button>
  );
}

function FollowPlusIcon() {
  return (
    <svg
      className="follow-pill-icon"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M8 2.25a.75.75 0 0 1 .75.75v4.25H13a.75.75 0 0 1 0 1.5H8.75V13a.75.75 0 0 1-1.5 0V8.75H3a.75.75 0 0 1 0-1.5h4.25V3A.75.75 0 0 1 8 2.25Z"
      />
    </svg>
  );
}

function FollowCheckIcon() {
  return (
    <svg
      className="follow-pill-icon"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M13.53 4.22a.75.75 0 0 1 0 1.06l-6.25 6.25a.75.75 0 0 1-1.06 0L2.47 7.78a.75.75 0 0 1 1.06-1.06l3.22 3.22 5.72-5.72a.75.75 0 0 1 1.06 0Z"
      />
    </svg>
  );
}
