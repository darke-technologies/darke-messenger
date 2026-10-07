import { useEffect, useMemo, useState } from "react";
import {
  loadMyProfile,
  loadProfileByUsername,
  type DarkeProfile,
} from "./profile";

export const DISPLAY_NAME_MIN = 1;
export const DISPLAY_NAME_MAX = 50;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;

export type PersonName = {
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

const cache = new Map<string, PersonName>();
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version += 1;
  for (const listener of listeners) listener();
}

function norm(handle: string): string {
  return handle.replace(/^@/, "").trim().toLowerCase();
}

export function normalizeUsername(raw: string): string {
  return raw.replace(/^@/, "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}

export function isValidUsername(slug: string): boolean {
  return new RegExp(`^[a-z0-9_]{${USERNAME_MIN},${USERNAME_MAX}}$`).test(slug);
}

export function usernameHint(slug: string, typed: string): string | null {
  if (!typed.trim()) return null;
  if (slug.length < USERNAME_MIN) {
    return `Username must be ${USERNAME_MIN}–${USERNAME_MAX} characters.`;
  }
  if (slug.length > USERNAME_MAX) {
    return `Username must be ${USERNAME_MIN}–${USERNAME_MAX} characters.`;
  }
  if (!isValidUsername(slug)) {
    return "Use letters, numbers, and underscores only.";
  }
  return null;
}

export function normalizeDisplayNameInput(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export function isValidDisplayName(name: string): boolean {
  const value = normalizeDisplayNameInput(name);
  return value.length >= DISPLAY_NAME_MIN && value.length <= DISPLAY_NAME_MAX;
}

export function visibleDisplayName(
  displayName: string | null | undefined,
  username: string,
): string {
  const name = (displayName ?? "").replace(/\s+/g, " ").trim();
  return name || username.replace(/^@/, "").trim();
}

export function handleBadge(username: string): string {
  const id = username.replace(/^@/, "").trim();
  return id ? `@${id}` : "";
}

export function rememberPerson(row: Pick<DarkeProfile, "username" | "display_name" | "avatar_url">): void {
  const username = norm(row.username);
  if (!username) return;
  cache.set(username, {
    username,
    displayName: visibleDisplayName(row.display_name, username),
    avatarUrl: row.avatar_url ?? null,
  });
  emit();
}

export function lookupPerson(handle: string): PersonName | null {
  const id = norm(handle);
  if (!id || id === "__self__") return null;
  return cache.get(id) ?? null;
}

export function displayNameFor(handle: string): string {
  const id = norm(handle);
  if (!id || id === "__self__") return "";
  return lookupPerson(id)?.displayName || id;
}

export function usePersonDirectory(handles: string[]): {
  version: number;
  person: (handle: string) => PersonName | null;
} {
  const key = useMemo(
    () =>
      [...new Set(handles.map(norm).filter((id) => id && id !== "__self__"))]
        .sort()
        .join(","),
    [handles],
  );
  const [stamp, setStamp] = useState(version);

  useEffect(() => {
    const onChange = () => setStamp(version);
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (ids.length === 0) return;
    let cancelled = false;
    void (async () => {
      const mine = await loadMyProfile().catch(() => null);
      if (cancelled) return;
      if (mine) rememberPerson(mine);
      await Promise.all(
        ids.map(async (id) => {
          if (cache.has(id)) return;
          const row = await loadProfileByUsername(id).catch(() => null);
          if (row) rememberPerson(row);
          else {
            cache.set(id, {
              username: id,
              displayName: id,
              avatarUrl: null,
            });
            emit();
          }
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return {
    version: stamp,
    person: lookupPerson,
  };
}

const BANNER_PREFIX = "darke.profile.complete-banner.";

export function needsDisplayName(profile: {
  display_name?: string | null;
  username: string;
} | null): boolean {
  if (!profile) return false;
  return !(profile.display_name ?? "").trim();
}

export function bannerDismissed(slug: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(`${BANNER_PREFIX}${norm(slug)}`) === "1";
  } catch {
    return false;
  }
}

export function dismissNameBanner(slug: string): void {
  try {
    localStorage.setItem(`${BANNER_PREFIX}${norm(slug)}`, "1");
  } catch {
    // ignore
  }
}
