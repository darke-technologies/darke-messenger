import {
  loadMyMutualFollowIds,
} from "./follows";
import {
  loadProfileByEmail,
  loadProfileByUsername,
  loadProfilesByIds,
  searchProfilesByHandle,
  type DarkeProfile,
} from "./profile";

export const INVITE_SEARCH_MIN = 2;

export type InviteSearchHit = {
  profile: DarkeProfile | null;
  suggestions: DarkeProfile[];
  mutuals: DarkeProfile[];
  ready: boolean;
};

export function looksLikeEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());
}

function inviteQuerySlug(raw: string): { slug: string; exact: boolean } {
  const trimmed = raw.trim();
  const exact = trimmed.startsWith("@");
  const slug = trimmed.replace(/^@/, "").toLowerCase();
  return { slug, exact };
}

export function inviteOutOfNetworkReady(raw: string): boolean {
  if (looksLikeEmail(raw)) return true;
  const { slug } = inviteQuerySlug(raw);
  return slug.length >= INVITE_SEARCH_MIN;
}

export function inviteSearchReady(raw: string): boolean {
  if (looksLikeEmail(raw)) return true;
  const { slug } = inviteQuerySlug(raw);
  return slug.length >= INVITE_SEARCH_MIN;
}

function dedupePeople(rows: DarkeProfile[]): DarkeProfile[] {
  const seen = new Set<string>();
  const out: DarkeProfile[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

export async function searchInvitePeople(raw: string): Promise<InviteSearchHit> {
  const { slug } = inviteQuerySlug(raw);
  if (looksLikeEmail(raw) || !inviteSearchReady(raw)) {
    return {
      profile: null,
      suggestions: [],
      mutuals: [],
      ready: inviteOutOfNetworkReady(raw),
    };
  }

  let mutualPeople: DarkeProfile[] = [];
  try {
    const mutualIds = [...(await loadMyMutualFollowIds())];
    if (mutualIds.length) {
      mutualPeople = (await loadProfilesByIds(mutualIds)).filter((row) => {
        const user = row.username.toLowerCase();
        const display = (row.display_name ?? "").toLowerCase();
        return user.startsWith(slug) || display.startsWith(slug);
      });
    }
  } catch {
    mutualPeople = [];
  }

  let suggestions: DarkeProfile[] = [];
  try {
    suggestions = await searchProfilesByHandle(slug);
  } catch {
    suggestions = [];
  }

  let exactHit =
    suggestions.find((row) => row.username.toLowerCase() === slug) ??
    mutualPeople.find((row) => row.username.toLowerCase() === slug) ??
    null;
  if (!exactHit) {
    try {
      exactHit = await loadProfileByUsername(slug);
    } catch {
      exactHit = null;
    }
  }

  const ranked = dedupePeople(
    [exactHit, ...suggestions, ...mutualPeople].filter(
      (row): row is DarkeProfile => row != null,
    ),
  ).sort((a, b) => {
    const aExact = a.username.toLowerCase() === slug ? 0 : 1;
    const bExact = b.username.toLowerCase() === slug ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    return a.username.localeCompare(b.username);
  });

  return {
    profile: exactHit,
    suggestions: ranked.slice(0, 8),
    mutuals: [],
    ready: true,
  };
}

/** Exact account match for a handle or contact email. */
export async function lookupInviteAccount(
  raw: string,
): Promise<DarkeProfile | null> {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (looksLikeEmail(trimmed)) {
    const byEmail = await loadProfileByEmail(trimmed);
    if (byEmail) return byEmail;
  }
  const hit = await searchInvitePeople(trimmed);
  return hit.profile;
}
