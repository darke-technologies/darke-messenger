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

export function adoptRoomThread(
  slug: string,
  existing: DmThread[],
  sessionKey: string,
  host: string,
  name?: string,
): DmThread {
  const owner = host.replace(/^@/, "").trim().toLowerCase();
  const title = name?.trim() || "Room";
  return {
    ...newThread(
      sessionKey,
      true,
      "room",
      owner,
      nextChatSeq(slug, existing),
    ),
    createdBy: owner,
    isGroup: true,
    displayName: title,
    autoNamed: !name?.trim(),
    renamed: Boolean(name?.trim()),
    handle: "room",
    description: "",
    skSharedWith: [],
    messages: [
      {
        id: `${sessionKey}-join-wait`,
        direction: "received",
        body: `Waiting for @${owner} to admit you with Signal room keys.`,
        at: Date.now(),
        e2ee: true,
        kind: "system",
        is_system: true,
      },
    ],
  };
}

function normHandle(raw: string, self?: string): string {
  const handle = raw.replace(/^@/, "").trim().toLowerCase();
  if (!handle || handle === "__self__") return "";
  if (handle === "room" || handle === "guest" || handle === "peer") return "";
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

export function withRoomTitle(
  thread: DmThread,
  title?: string | null,
  topic?: string | null,
): DmThread {
  const named = title?.replace(/\s+/g, " ").trim() ?? "";
  if (!named && topic == null) return thread;
  return {
    ...thread,
    displayName: named || thread.displayName,
    autoNamed: named ? false : thread.autoNamed,
    renamed: named ? true : thread.renamed,
    description: topic ?? thread.description,
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
  const keepRoomHandle = threadIsRoom(thread);
  return {
    ...thread,
    isGroup: threadIsGroup(thread),
    chatGuests: rows,
    invitedHandles: rows.map((guest) => guest.handle),
    peerUsername: thread.peerUsername || first,
    handle: keepRoomHandle
      ? thread.handle || "room"
      : thread.peerUsername
        ? thread.handle
        : first || thread.handle,
  };
}
