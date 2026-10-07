import { threadIsGroup } from "./chatController";
import {
  FOUNDER_BADGE,
  FOUNDER_DISPLAY,
  FOUNDER_HANDLE,
  createFounderWelcomeThread,
  isFounderThread,
  listChatMemberHandles,
  normalizeChatGuestHandle,
} from "./chatService";
import type { DmThread } from "./dmSessions";
import { peerUsernameFromHandle } from "./dmSessions";
import { peekLocalChatTitle, setLocalChatTitle } from "./localChatTitles";
import { resolveChatPreview, resolveChatTitle } from "./getChatTitle";

export type SidebarPeerProfile = {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

export {
  FOUNDER_BADGE,
  FOUNDER_DISPLAY,
  FOUNDER_HANDLE,
  FOUNDER_WELCOME,
  FOUNDER_SESSION_KEY,
  isFounderThread,
} from "./chatService";

/** Seed @mike founder welcome into the sidebar without making it the active view. */
export function ensureFounderSidebarNode(
  slug: string,
  threads: DmThread[],
): DmThread[] {
  if (slug.trim().toLowerCase() === FOUNDER_HANDLE) return threads;
  if (threads.some(isFounderThread)) return threads;
  const founder = createFounderWelcomeThread();
  if (!peekLocalChatTitle(slug, founder.id)) {
    setLocalChatTitle(slug, founder.id, FOUNDER_DISPLAY);
  }
  return [...threads, founder];
}

export function sidebarRowLabel(
  thread: DmThread,
  slug: string,
  localTitle?: string | null,
): string {
  return resolveChatTitle(thread, slug, localTitle);
}

export function sidebarRowPreview(
  thread: DmThread,
  slug: string,
): string {
  return resolveChatPreview(thread, slug);
}

export function sidebarAvatarNames(thread: DmThread, slug: string): string[] {
  if (threadIsGroup(thread)) return [];
  const self = normalizeChatGuestHandle(slug);
  const members = listChatMemberHandles(thread, slug);
  const others = members.filter((h) => h !== self && h !== "__self__");
  const peer =
    others[0] ||
    thread.peerUsername?.trim() ||
    peerUsernameFromHandle(thread.handle || "") ||
    "";
  return peer ? [peer] : [];
}

export function sidebarThreadTitle(thread: DmThread, slug: string): string {
  return sidebarRowLabel(thread, slug);
}

export function sidebarThreadBadge(thread: DmThread): string | null {
  return isFounderThread(thread) ? FOUNDER_BADGE : null;
}

export function sidebarUnreadCount(thread: DmThread): number {
  if (thread.muted) return 0;
  const n = thread.unread ?? 0;
  return n > 0 ? n : 0;
}

export function withThreadRead(thread: DmThread): DmThread {
  if (!thread.unread) return thread;
  return { ...thread, unread: 0 };
}
