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
  nodeGreetingMessage,
  type ChatGuest,
  type DmThread,
} from "./dmSessions";

export const GROUP_AVATAR_COLORS = [
  "#3f3f46",
  "#27272a",
  "#52525b",
  "#14532d",
  "#1e3a5f",
  "#4c1d95",
  "#7f1d1d",
  "#854d0e",
] as const;

export type GroupAvatarChoice = {
  avatarUrl?: string | null;
  avatarColor?: string | null;
};

export function threadIsGroup(
  thread: Pick<DmThread, "isGroup" | "roomKind" | "workspaceId"> | null | undefined,
): boolean {
  if (!thread) return false;
  if (typeof thread.isGroup === "boolean") return thread.isGroup;
  return thread.roomKind === "team" && !thread.workspaceId;
}

export function groupInitial(title: string): string {
  const letter = title.replace(/^@/, "").trim().charAt(0);
  return letter ? letter.toUpperCase() : "G";
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

export function createGroupNode(
  slug: string,
  existing: DmThread[],
  name: string,
  memberHandles: string[],
  avatar: GroupAvatarChoice = {},
  sessionKeyHint?: string,
): DmThread {
  const title = name.trim() || "Group Node";
  const handles = [
    ...new Set(memberHandles.map((handle) => normHandle(handle, slug)).filter(Boolean)),
  ];
  const guests = handles.reduce(
    (rows, handle) => upsertChatGuest(rows, handle, "handle"),
    [] as ChatGuest[],
  );
  const sessionKey = sessionKeyHint?.trim() || generateSessionKey();
  return {
    ...newThread(
      sessionKey,
      false,
      "direct",
      handles[0],
      nextChatSeq(slug, existing),
    ),
    createdBy: slug,
    isGroup: true,
    displayName: title,
    autoNamed: false,
    renamed: true,
    messages: [nodeGreetingMessage(sessionKey)],
    chatGuests: guests,
    invitedHandles: guests.map((guest) => guest.handle),
    avatarUrl: avatar.avatarUrl ?? null,
    avatarColor: avatar.avatarColor ?? GROUP_AVATAR_COLORS[0],
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
  let guests = thread.chatGuests ?? thread.invitedHandles;
  for (const handle of accepted) {
    guests = upsertChatGuest(guests, handle, "handle");
  }
  const rows = Array.isArray(guests) ? guests : [];
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
