import { threadIsGroup } from "./chatController";
import {
  FOUNDER_DISPLAY,
  FOUNDER_HANDLE,
  isLocalOnlySystemNotice,
  listChatMemberHandles,
} from "./chatService";
import { type DmThread } from "./dmSessions";
import { displayNameFor } from "./personDirectory";

export type ChatTitleMember = {
  id: string;
  username: string;
  display_name: string | null;
};

const NODE_PREVIEW = "DARKE Node established";

function normId(value: string): string {
  return value.replace(/^@/, "").trim().toLowerCase();
}

export function memberDisplayName(handle: string): string {
  const id = normId(handle);
  if (!id || id === "__self__") return "";
  if (id === FOUNDER_HANDLE) return FOUNDER_DISPLAY;
  return displayNameFor(id);
}

export function chatTitleMembers(
  thread: DmThread,
  currentUserId: string,
): ChatTitleMember[] {
  return listChatMemberHandles(thread, currentUserId)
    .filter((handle) => {
      const id = normId(handle);
      return Boolean(id) && id !== "__self__";
    })
    .map((handle) => {
      const username = handle.replace(/^@/, "").trim();
      const id = normId(handle);
      return {
        id,
        username,
        display_name:
          id === FOUNDER_HANDLE ? FOUNDER_DISPLAY : displayNameFor(id) || null,
      };
    });
}

export function resolveChatTitle(
  thread: DmThread,
  currentUserId: string,
  localTitle?: string | null,
): string {
  const override = localTitle?.trim() ?? "";
  if (override) return override;

  if (threadIsGroup(thread)) {
    const named = thread.displayName?.trim() ?? "";
    return named || "Group Node";
  }

  const self = normId(currentUserId);
  const members = chatTitleMembers(thread, currentUserId);
  const peerNames = members
    .filter((row) => row.id !== self)
    .map((row) => row.display_name || row.username)
    .filter(Boolean);
  if (peerNames.length === 1) return peerNames[0];
  if (peerNames.length > 1) return peerNames.join(", ");
  return "Direct Message";
}

function clipPreview(text: string): string {
  const value = text.replace(/\s+/g, " ").trim();
  if (!value) return "";
  return value.length > 88 ? `${value.slice(0, 87)}…` : value;
}

export function resolveChatPreview(
  thread: DmThread,
  currentUserId: string,
): string {
  const last = thread.messages[thread.messages.length - 1];
  if (!last) return "";
  if (isLocalOnlySystemNotice(last)) return NODE_PREVIEW;

  const snip = clipPreview(last.fileName || last.body);
  if (!snip) return "";

  if (last.direction === "sent") return `You: ${snip}`;

  const self = normId(currentUserId);
  const members = chatTitleMembers(thread, currentUserId);
  if (threadIsGroup(thread) || members.length > 2) return snip;

  const peer = members.find((row) => row.id !== self);
  const sender = peer ? peer.display_name || peer.username : "";
  return sender ? `${sender}: ${snip}` : snip;
}
