import { readLocalText, writeLocalText } from "./localStore";
import { nodeGreetingMessage, peerUsernameFromHandle, type ChatGuest, type DmMessage, type DmThread } from "./dmSessions";

export { NODE_GREETING } from "./dmSessions";
export type { ChatGuest } from "./dmSessions";

export const UNTITLED_CHAT = "Untitled chat";

const LEGACY_LABELS = new Set([
  "1-on-1 chat",
  "team chat",
  "encrypted peer",
  "encrypted chat",
  "opening node…",
  UNTITLED_CHAT.toLowerCase(),
]);

function createdCountKey(slug: string): string {
  return `darke.dm.created.${slug.trim().toLowerCase() || "session"}`;
}

export function isChatOwner(
  thread: Pick<DmThread, "isHost" | "createdBy"> | null,
  slug?: string | null,
): boolean {
  if (!thread) return false;
  const me = normalizeChatGuestHandle(slug ?? "");
  const owner = normalizeChatGuestHandle(thread.createdBy ?? "");
  if (owner) return Boolean(me) && owner === me;
  return thread.isHost !== false;
}

export function chatOwnerHandle(
  thread: Pick<DmThread, "isHost" | "createdBy" | "peerUsername"> | null,
  slug: string,
): string | null {
  if (!thread) return null;
  const me = normalizeChatGuestHandle(slug);
  if (isChatOwner(thread, me)) return me || null;
  const created = normalizeChatGuestHandle(thread.createdBy ?? "");
  if (created) return created;
  const peer = normalizeChatGuestHandle(thread.peerUsername ?? "");
  return peer || null;
}

/** @deprecated Use isChatOwner. Workspace role no longer grants chat invites. */
export function isChatInviteAdmin(
  thread: Pick<DmThread, "isHost" | "createdBy"> | null,
  _role?: string | null,
  slug?: string | null,
): boolean {
  return isChatOwner(thread, slug);
}

export function normalizeChatGuestHandle(raw: string): string {
  return raw.replace(/^@/, "").trim().toLowerCase();
}

export const STANDALONE_DIRECT_MAX = 1000;
export const STANDALONE_GROUP_MAX = 5_000;
export const STANDALONE_GROUP_LIMIT_NOTE =
  "Limit reached (5,000 members). Upgrade your plan to add more members.";

export const GROUP_CHAT_JOIN_BLOCKED =
  "This node has reached its participant limit.";

const ROOM_RESERVED_HANDLES = new Set([
  "",
  "room",
  "guest",
  "peer",
  "__self__",
]);

export function listChatMemberHandles(
  thread: Pick<
    DmThread,
    "chatGuests" | "invitedHandles" | "peerUsername" | "handle" | "createdBy"
  > | null,
  selfSlug: string,
): string[] {
  const people = new Set<string>();
  const self = normalizeChatGuestHandle(selfSlug);
  if (self) people.add(self);
  else people.add("__self__");
  if (!thread) return [...people];
  const peer = normalizeChatGuestHandle(thread.peerUsername || "");
  if (peer && peer !== self) people.add(peer);
  const owner = normalizeChatGuestHandle(thread.createdBy || "");
  if (owner && owner !== self && !ROOM_RESERVED_HANDLES.has(owner)) {
    people.add(owner);
  }
  const fromHandle = peerUsernameFromHandle(thread.handle || "");
  if (
    fromHandle &&
    fromHandle !== self &&
    !ROOM_RESERVED_HANDLES.has(fromHandle)
  ) {
    people.add(fromHandle);
  }
  for (const guest of listChatGuests(thread)) {
    const handle = normalizeChatGuestHandle(guest.handle);
    if (handle && handle !== self) people.add(handle);
  }
  return [...people];
}

export function roomRecipientHandles(
  thread: Pick<
    DmThread,
    | "chatGuests"
    | "invitedHandles"
    | "peerUsername"
    | "handle"
    | "createdBy"
  > | null,
  selfSlug: string,
): string[] {
  const self = normalizeChatGuestHandle(selfSlug);
  const out = new Set<string>();
  for (const handle of listChatMemberHandles(thread, selfSlug)) {
    if (handle && handle !== self && !ROOM_RESERVED_HANDLES.has(handle)) {
      out.add(handle);
    }
  }
  const owner = normalizeChatGuestHandle(thread?.createdBy ?? "");
  if (owner && owner !== self && !ROOM_RESERVED_HANDLES.has(owner)) {
    out.add(owner);
  }
  return [...out];
}

export function chatMemberCount(
  thread: Pick<
    DmThread,
    "chatGuests" | "invitedHandles" | "peerUsername" | "handle"
  > | null,
  selfSlug: string,
): number {
  return listChatMemberHandles(thread, selfSlug).length;
}

export function standaloneMemberCap(
  thread: Pick<
    DmThread,
    "isGroup" | "roomKind" | "workspaceId" | "teamId"
  > | null,
): number {
  if (!thread || thread.teamId) return Number.POSITIVE_INFINITY;
  return isGroupChat(thread) ? STANDALONE_GROUP_MAX : STANDALONE_DIRECT_MAX;
}

export function standaloneJoinBlocked(
  thread: Pick<
    DmThread,
    | "chatGuests"
    | "invitedHandles"
    | "peerUsername"
    | "handle"
    | "isGroup"
    | "roomKind"
    | "workspaceId"
    | "teamId"
  > | null,
  viewerSlug: string,
): string | null {
  if (!thread || thread.teamId) return null;
  const self = normalizeChatGuestHandle(viewerSlug);
  const already = listChatMemberHandles(thread, viewerSlug).includes(self);
  if (already) return null;
  const cap = standaloneMemberCap(thread);
  if (chatMemberCount(thread, viewerSlug) >= cap) {
    if (isGroupChat(thread)) return STANDALONE_GROUP_LIMIT_NOTE;
    return `This chat has reached its ${cap.toLocaleString()} participant limit.`;
  }
  return null;
}

export function threadLastActivityAt(thread: DmThread): number {
  return thread.messages.at(-1)?.at ?? thread.createdAt;
}

export function isGroupChat(
  thread: Pick<DmThread, "isGroup" | "roomKind" | "workspaceId"> | null,
  _slug?: string,
): boolean {
  if (!thread) return false;
  if (typeof thread.isGroup === "boolean") return thread.isGroup;
  return thread.roomKind === "team" && !thread.workspaceId;
}

export function sidebarPeerHandle(
  thread: Pick<
    DmThread,
    | "chatGuests"
    | "invitedHandles"
    | "peerUsername"
    | "handle"
    | "isGroup"
    | "roomKind"
    | "workspaceId"
  > | null,
  slug: string,
): string | null {
  if (!thread) return null;
  if (isGroupChat(thread, slug)) return null;
  const me = normalizeChatGuestHandle(slug);
  const named = normalizeChatGuestHandle(thread.peerUsername ?? "");
  if (named && named !== me) return named;
  const fromHandle = peerUsernameFromHandle(thread.handle ?? "");
  if (fromHandle && fromHandle !== me) return fromHandle;
  const members = listChatMemberHandles(thread, slug);
  return members.find((handle) => handle !== me && handle !== "__self__") ?? null;
}

export function listChatGuests(
  thread: Pick<DmThread, "chatGuests" | "invitedHandles"> | null,
): ChatGuest[] {
  if (!thread) return [];
  if (thread.chatGuests?.length) return thread.chatGuests;
  return (thread.invitedHandles ?? []).map((handle) => ({
    handle,
    invitedAt: 0,
    source: "handle" as const,
  }));
}

/** Join-link / @handle chat add. Does not read or increment paid seats. */
export function upsertChatGuest(
  existing: ChatGuest[] | string[] | undefined,
  rawHandle: string,
  source: ChatGuest["source"] = "handle",
): ChatGuest[] {
  const handle = normalizeChatGuestHandle(rawHandle);
  if (!handle) return asChatGuestRows(existing);
  const rows = asChatGuestRows(existing);
  if (rows.some((row) => row.handle === handle)) return rows;
  return [...rows, { handle, invitedAt: Date.now(), source }];
}

function asChatGuestRows(
  existing: ChatGuest[] | string[] | undefined,
): ChatGuest[] {
  if (!existing?.length) return [];
  if (typeof existing[0] === "string") {
    return (existing as string[]).map((handle) => ({
      handle: normalizeChatGuestHandle(handle),
      invitedAt: 0,
      source: "handle" as const,
    }));
  }
  return existing as ChatGuest[];
}

export function untitledChatTitle(): string {
  return UNTITLED_CHAT;
}

export const FOUNDER_HANDLE = "mike";
export const FOUNDER_DISPLAY = "Mike";
export const FOUNDER_BADGE = "Founder";
export const FOUNDER_SESSION_KEY = "0x4441524b45464f554e4445524d494b45";
export const FOUNDER_WELCOME =
  "Hey there. I'm Mike, founder of DARKE. This is your first P2P encrypted message node. Feel free to start your own project, share a join link, or reply back to say hi.";

export function isFounderThread(
  thread: Pick<DmThread, "kind" | "sessionKey" | "handle" | "peerUsername">,
): boolean {
  if (thread.kind === "founder") return true;
  if (thread.sessionKey === FOUNDER_SESSION_KEY) return true;
  const handle = (thread.peerUsername || thread.handle || "").toLowerCase();
  return handle === FOUNDER_HANDLE && thread.kind === "founder";
}

export function createEmptyUntitledThread(
  sessionKey: string,
  seq = 1,
  createdBy?: string,
): DmThread {
  const owner = normalizeChatGuestHandle(createdBy ?? "");
  return {
    id: sessionKey,
    sessionKey,
    displayName: "",
    handle: sessionKey.slice(0, 10).toLowerCase(),
    connectionState: "WAITING FOR PEER",
    messages: [nodeGreetingMessage(sessionKey)],
    createdAt: Date.now(),
    roomKind: "direct",
    isHost: true,
    createdBy: owner || undefined,
    seq: Math.max(1, seq),
    autoNamed: true,
    renamed: false,
    unread: 0,
    isGroup: false,
  };
}

export function createFounderWelcomeThread(at = Date.now()): DmThread {
  return {
    id: FOUNDER_SESSION_KEY,
    sessionKey: FOUNDER_SESSION_KEY,
    displayName: "",
    handle: FOUNDER_HANDLE,
    peerUsername: FOUNDER_HANDLE,
    connectionState: "WAITING FOR PEER",
    messages: [
      {
        id: `${FOUNDER_SESSION_KEY}-welcome`,
        direction: "received",
        body: FOUNDER_WELCOME,
        at,
        e2ee: true,
      },
    ],
    createdAt: at,
    roomKind: "direct",
    isHost: false,
    createdBy: FOUNDER_HANDLE,
    seq: 1,
    autoNamed: true,
    renamed: false,
    kind: "founder",
    unread: 1,
    isGroup: false,
  };
}

/** @deprecated Sequential titles leak volume. Use untitledChatTitle(). */
export function formatChatName(_seq?: number): string {
  return UNTITLED_CHAT;
}

export function seqFromName(name: string): number | null {
  const hit = name.trim().match(/^Chat #(\d+)$/i);
  if (!hit) return null;
  const n = Number.parseInt(hit[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function isLegacyChatLabel(name: string | undefined): boolean {
  const n = name?.trim() ?? "";
  if (!n) return true;
  if (/^Chat #\d+$/i.test(n)) return true;
  return LEGACY_LABELS.has(n.toLowerCase());
}

export function chatTitle(
  thread: Pick<DmThread, "displayName" | "seq" | "renamed">,
): string {
  const label = thread.displayName?.trim() ?? "";
  if (thread.renamed && label) return label;
  if (label && !isLegacyChatLabel(label)) return label;
  return UNTITLED_CHAT;
}

export function chatHashLabel(title: string): string {
  return title.trim().replace(/^#\s*/, "") || UNTITLED_CHAT;
}

export function formatChatOriginDate(at: number): string {
  const date = new Date(at);
  const month = date.toLocaleDateString("en-US", { month: "long" });
  const day = date.getDate();
  return `${month} ${ordinalDay(day)}`;
}

export function formatSlackDayLabel(at: number): string {
  const date = new Date(at);
  const time = date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return `TODAY · ${time}`;
  const stamp = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return `${stamp.toUpperCase()} · ${time}`;
}

export function chatDayKey(at: number): string {
  const date = new Date(at);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function ordinalDay(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

export function isNodeGreeting(msg: DmMessage): boolean {
  return msg.kind === "system" || msg.is_system === true;
}

export function userMessageCount(thread: Pick<DmThread, "messages"> | null): number {
  if (!thread) return 0;
  return thread.messages.filter((msg) => !isNodeGreeting(msg)).length;
}

export function disappearTtlMs(mode: DmThread["disappearAfter"]): number | null {
  if (mode === "24h") return 24 * 60 * 60 * 1000;
  if (mode === "7d") return 7 * 24 * 60 * 60 * 1000;
  return null;
}

export function messageHasDisappeared(msg: DmMessage, thread: DmThread): boolean {
  if (isNodeGreeting(msg) || msg.kind === "pin-notice") return false;
  const ttl = disappearTtlMs(thread.disappearAfter);
  if (ttl == null) return false;
  return Date.now() - msg.at >= ttl;
}

export function isLocalOnlySystemNotice(msg: DmMessage): boolean {
  return (
    msg.kind === "system" ||
    msg.is_system === true ||
    msg.is_ephemeral === true
  );
}

export type BubbleCluster = {
  isFirst: boolean;
  isMiddle: boolean;
  isLast: boolean;
  showMeta: boolean;
};

const CLUSTER_WINDOW_MS = 60_000;

function isPinNotice(msg: DmMessage): boolean {
  return msg.kind === "pin-notice";
}

function canClusterWith(a: DmMessage | undefined, b: DmMessage | undefined): boolean {
  if (!a || !b) return false;
  if (isLocalOnlySystemNotice(a) || isLocalOnlySystemNotice(b)) return false;
  if (isPinNotice(a) || isPinNotice(b)) return false;
  if (isNodeGreeting(a) || isNodeGreeting(b)) return false;
  if (a.direction !== b.direction) return false;
  if (Math.abs(b.at - a.at) >= CLUSTER_WINDOW_MS) return false;
  if (chatDayKey(a.at) !== chatDayKey(b.at)) return false;
  return true;
}

/** Signal-style grouping: same sender within 1 minute shares a tail. */
export function messageBubbleCluster(
  messages: DmMessage[],
  index: number,
): BubbleCluster {
  const cur = messages[index];
  if (!cur || isLocalOnlySystemNotice(cur) || isNodeGreeting(cur) || cur.kind === "pin-notice") {
    return { isFirst: true, isMiddle: false, isLast: true, showMeta: false };
  }
  const isFirst = !canClusterWith(messages[index - 1], cur);
  const isLast = !canClusterWith(cur, messages[index + 1]);
  return {
    isFirst,
    isMiddle: !isFirst && !isLast,
    isLast,
    showMeta: isLast,
  };
}

function greetingRevealKey(chatId: string): string {
  return `darke.node-greeting.shown.${chatId.trim()}`;
}

export function nodeGreetingAlreadyRevealed(chatId: string): boolean {
  return readLocalText(greetingRevealKey(chatId)) === "1";
}

export function markNodeGreetingRevealed(chatId: string): void {
  writeLocalText(greetingRevealKey(chatId), "1");
}

export function readCreatedCount(slug: string): number {
  const raw = Number.parseInt(readLocalText(createdCountKey(slug)) || "0", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

export function writeCreatedCount(slug: string, count: number): void {
  writeLocalText(createdCountKey(slug), String(Math.max(0, count)));
}

export function nextChatSeq(slug: string, threads: DmThread[]): number {
  const maxSeq = threads.reduce((max, row) => Math.max(max, row.seq ?? 0), 0);
  const next = Math.max(readCreatedCount(slug), maxSeq) + 1;
  writeCreatedCount(slug, next);
  return next;
}

export function nodeFingerprint(material: string): string {
  let hash = 2166136261;
  for (let i = 0; i < material.length; i += 1) {
    hash ^= material.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

export function migrateChatThreads(slug: string, threads: DmThread[]): DmThread[] {
  let maxSeq = Math.max(readCreatedCount(slug), 0);
  const used = new Set<number>();
  const next = threads.map((row) => {
    const named = seqFromName(row.displayName);
    let seq = row.seq && row.seq > 0 ? row.seq : named ?? 0;
    if (!seq || used.has(seq)) {
      maxSeq += 1;
      seq = maxSeq;
    }
    used.add(seq);
    maxSeq = Math.max(maxSeq, seq);
    const renamed = row.renamed === true;
    const displayName = renamed
      ? row.displayName
      : isLegacyChatLabel(row.displayName)
        ? ""
        : row.displayName;
    return {
      ...row,
      seq,
      displayName,
      autoNamed: renamed ? false : true,
      renamed,
      isGroup:
        row.isGroup === true ||
        (row.isGroup !== false &&
          row.roomKind === "team" &&
          !row.workspaceId),
      messages:
        row.messages.length > 0
          ? row.messages
          : [nodeGreetingMessage(row.sessionKey)],
    };
  });
  writeCreatedCount(slug, maxSeq);
  return next;
}
