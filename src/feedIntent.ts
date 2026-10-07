export const FEED_INTENT_EVENT = "darke-feed-intent";
export const PROFILE_INTENT_EVENT = "darke-profile-intent";
const FEED_INTENT_KEY = "darke-feed-intent";

export type FeedIntent = {
  postId?: string;
  userId?: string;
  username?: string;
  fromProfile?: string;
  compose?: boolean;
};

function writeFeedParams(intent: FeedIntent): void {
  const url = new URL(window.location.href);
  if (intent.postId) url.searchParams.set("post_id", intent.postId);
  else url.searchParams.delete("post_id");
  if (intent.username) url.searchParams.set("user", intent.username);
  else url.searchParams.delete("user");
  if (intent.fromProfile) url.searchParams.set("from_profile", intent.fromProfile);
  else url.searchParams.delete("from_profile");
  window.history.pushState({}, "", url);
}

export function openFeed(intent: FeedIntent = {}): void {
  try {
    sessionStorage.setItem(FEED_INTENT_KEY, JSON.stringify(intent));
  } catch {
    // ignore
  }
  writeFeedParams(intent);
  window.dispatchEvent(new CustomEvent<FeedIntent>(FEED_INTENT_EVENT, { detail: intent }));
}

export function consumeFeedIntent(): FeedIntent | null {
  try {
    const raw = sessionStorage.getItem(FEED_INTENT_KEY);
    if (raw) {
      sessionStorage.removeItem(FEED_INTENT_KEY);
      const parsed = JSON.parse(raw) as FeedIntent;
      if (
        parsed &&
        (parsed.postId ||
          parsed.userId ||
          parsed.username ||
          parsed.fromProfile ||
          parsed.compose)
      ) {
        return parsed;
      }
    }
  } catch {
    // fall through to URL
  }
  const url = new URL(window.location.href);
  const postId = url.searchParams.get("post_id")?.trim() || undefined;
  const username = url.searchParams.get("user")?.trim() || undefined;
  const fromProfile = url.searchParams.get("from_profile")?.trim() || undefined;
  if (!postId && !username && !fromProfile) return null;
  return { postId, username, fromProfile };
}

export function openProfile(username: string): void {
  const handle = username.trim();
  writeFeedParams({});
  window.dispatchEvent(
    new CustomEvent<{ username: string }>(PROFILE_INTENT_EVENT, {
      detail: { username: handle },
    }),
  );
}

export const COMPOSE_INTENT_EVENT = "darke-compose-intent";
export const WORKSPACE_INTENT_EVENT = "darke-workspace-intent";

export function openCompose(): void {
  if (typeof window === "undefined") return;
  window.history.pushState(null, "", "/app");
  window.dispatchEvent(new Event(COMPOSE_INTENT_EVENT));
}

export function openWorkspacePane(id: string): void {
  if (typeof window === "undefined" || !id) return;
  window.dispatchEvent(
    new CustomEvent<{ id: string }>(WORKSPACE_INTENT_EVENT, {
      detail: { id },
    }),
  );
}
