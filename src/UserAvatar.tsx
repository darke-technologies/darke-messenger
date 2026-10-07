import { useEffect, useState } from "react";
import {
  getOrFetchAvatar,
  hashAvatarRef,
  peekCachedAvatar,
} from "./avatarCacheService";

export function usernameInitial(name: string): string {
  const t = name.trim();
  return t ? t[0].toUpperCase() : "?";
}

export function personInitials(name: string): string {
  const clean = name.replace(/^@/, "").trim();
  const parts = clean.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return (clean.slice(0, 2) || "?").toUpperCase();
}

type Props = {
  username: string;
  url?: string | null;
  userId?: string | null;
  hash?: string | null;
  className: string;
  alt?: string;
  initialsLength?: 1 | 2;
};

/** Profile photo from the local avatar cache, or the first letter of the username. */
export function UserAvatar({
  username,
  url,
  userId,
  hash,
  className,
  alt = "",
  initialsLength = 1,
}: Props) {
  const cacheKey = (userId || username).trim().toLowerCase();
  const [src, setSrc] = useState<string | null>(() =>
    hash ? peekCachedAvatar(cacheKey, hash) : null,
  );
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBroken(false);
    if (!url) {
      setSrc(null);
      return;
    }
    void (async () => {
      const nextHash = hash?.trim() || (await hashAvatarRef(url));
      const warm = peekCachedAvatar(cacheKey, nextHash);
      if (warm) {
        if (!cancelled) setSrc(warm);
        return;
      }
      const local = await getOrFetchAvatar(cacheKey, url, nextHash);
      if (!cancelled) setSrc(local || url);
    })().catch(() => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, url, hash]);

  const letter =
    initialsLength === 2 ? personInitials(username) : usernameInitial(username);
  if (src && !broken) {
    return (
      <img
        className={className}
        src={src}
        alt={alt}
        draggable={false}
        decoding="async"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span className={`${className} is-initial`} aria-hidden={alt ? undefined : true}>
      {letter}
    </span>
  );
}

export { UserAvatar as Avatar };
