import {
  createEmptyUntitledThread,
  nextChatSeq,
  upsertChatGuest,
  listChatMemberHandles,
  standaloneMemberCap,
} from "./chatService";
import {
  generateSessionKey,
  newThread,
  type DmThread,
} from "./dmSessions";

export function threadIsRoom(
  thread: Pick<DmThread, "isGroup" | "roomKind"> | null | undefined,
): boolean {
  return Boolean(thread && thread.roomKind === "room");
}

export function threadIsGroup(
  thread: Pick<DmThread, "isGroup" | "roomKind" | "workspaceId"> | null | undefined,
): boolean {
  if (!thread) return false;
  if (threadIsRoom(thread)) return true;
  if (typeof thread.isGroup === "boolean") return thread.isGroup;
  return thread.roomKind === "team" && !thread.workspaceId;
}

export function createRoomThread(
  slug: string,
  existing: DmThread[],
  name: string,
  topic?: string,
): DmThread {
  const title = name.trim() || "Room";
  const sessionKey = generateSessionKey();
  return {
    ...newThread(sessionKey, false, "room", undefined, nextChatSeq(slug, existing)),
    createdBy: slug,
    isGroup: true,
    displayName: title,
    autoNamed: false,
    renamed: true,
    description: topic?.trim() || "",
    handle: "room",
    skSharedWith: [],
  };
}

function normHandle(raw: string, self?: string): string {
  const handle = raw.replace(/^@/, "").trim().toLowerCase();
  if (!handle || handle === "__self__") return "";
  if (self && handle === self.replace(/^@/, "").trim().toLowerCase()) return "";
  return handle;
}

export function createDirectChat(
  slug: string,
  existing: DmThread[],
  peerUsername?: string,
): DmThread {
  const peer = peerUsername ? normHandle(peerUsername, slug) : "";
  const sessionKey = generateSessionKey();
  if (peer) {
    return {
      ...newThread(
        sessionKey,
        false,
        "direct",
        peer,
        nextChatSeq(slug, existing),
      ),
      createdBy: slug,
      isGroup: false,
      displayName: "",
    };
  }
  return {
    ...createEmptyUntitledThread(sessionKey, nextChatSeq(slug, existing), slug),
    isGroup: false,
    displayName: "",
  };
}

export function addMembersToChat(
  thread: DmThread,
  rawHandles: string[],
  slug: string,
): DmThread {
  const handles = rawHandles
    .map((handle) => normHandle(handle, slug))
    .filter(Boolean);
  if (handles.length === 0) return thread;
  const cap = standaloneMemberCap(thread);
  const existing = new Set(listChatMemberHandles(thread, slug));
  const room = Number.isFinite(cap)
    ? Math.max(0, cap - existing.size)
    : Number.POSITIVE_INFINITY;
  const accepted: string[] = [];
  for (const handle of handles) {
    if (existing.has(handle)) continue;
    if (accepted.length >= room) break;
    accepted.push(handle);
    existing.add(handle);
  }
  if (accepted.length === 0) return thread;
  let guests = upsertChatGuest(thread.chatGuests ?? thread.invitedHandles, "");
  for (const handle of accepted) {
    guests = upsertChatGuest(guests, handle, "handle");
  }
  const rows = guests;
  const first = rows[0]?.handle;
  return {
    ...thread,
    isGroup: threadIsGroup(thread),
    chatGuests: rows,
    invitedHandles: rows.map((guest) => guest.handle),
    peerUsername: thread.peerUsername || first,
    handle: thread.peerUsername ? thread.handle : first || thread.handle,
  };
}
