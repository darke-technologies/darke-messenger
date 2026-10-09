import { readLocalText, writeLocalText } from "./localStore";

export const JOIN_ORIGIN = "https://darke-messenger-q2d1.vercel.app";
export const JOIN_KEY_STORAGE = "darke.join.session";
export const CHAT_FOCUS_EVENT = "darke-chat-focus";
export const CHAT_SETTINGS_EVENT = "darke-open-chat-settings";

export type ChatFocusDetail = { chatId: string; messageId?: string };

export function focusChatMessage(chatId: string, messageId?: string): void {
  if (typeof window === "undefined" || !chatId) return;
  window.dispatchEvent(
    new CustomEvent<ChatFocusDetail>(CHAT_FOCUS_EVENT, {
      detail: { chatId, messageId },
    }),
  );
}

export function openConversationSettings(chatId: string): void {
  if (typeof window === "undefined" || !chatId) return;
  window.dispatchEvent(
    new CustomEvent<{ chatId: string }>(CHAT_SETTINGS_EVENT, {
      detail: { chatId },
    }),
  );
}

export type PeerConnectionState = "CONNECTED" | "WAITING FOR PEER";

export type DmRelayState = "mailbox" | "purged" | "pending-keys";

export type DmMessage = {
  id: string;
  direction: "sent" | "received";
  body: string;
  at: number;
  e2ee: true;
  relay?: DmRelayState;
  pendingId?: string;
  fileName?: string;
  fileUrl?: string;
  fileSize?: number;
  replyToMessageId?: string;
  replyToSnippet?: string;
  kind?: "user" | "system" | "pin-notice";
  is_system?: boolean;
  is_ephemeral?: boolean;
  shareLink?: string;
  title?: string;
  edited?: boolean;
  pinned?: boolean;
  pinTargetId?: string;
  pinnedBy?: string;
};

export type RoomKind = "team" | "direct";

/** Node-local chat invite. Never consumes organization.seats_used. */
export type ChatGuest = {
  handle: string;
  invitedAt: number;
  source: "link" | "handle";
};

export type DmThread = {
  id: string;
  sessionKey: string;
  displayName: string;
  handle: string;
  peerUsername?: string;
  connectionState: PeerConnectionState;
  messages: DmMessage[];
  createdAt: number;
  roomKind?: RoomKind;
  isHost?: boolean;
  createdBy?: string;
  workspaceId?: string;
  channelId?: string;
  seq?: number;
  autoNamed?: boolean;
  renamed?: boolean;
  invitedHandles?: string[];
  chatGuests?: ChatGuest[];
  pinned?: boolean;
  pinnedMessageId?: string | null;
  pinnedBy?: string | null;
  pinnedUntil?: number | null;
  unread?: number;
  kind?: "founder";
  isGroup?: boolean;
  avatarUrl?: string | null;
  avatarColor?: string | null;
  teamId?: string | null;
  muted?: boolean;
  disappearAfter?: "off" | "24h" | "7d";
  accentColor?: string | null;
  description?: string;
};

export type PinDuration = "24h" | "7d" | "30d" | "forever";

export function pinUntilFromDuration(duration: PinDuration, from = Date.now()): number | null {
  if (duration === "24h") return from + 24 * 60 * 60 * 1000;
  if (duration === "7d") return from + 7 * 24 * 60 * 60 * 1000;
  if (duration === "30d") return from + 30 * 24 * 60 * 60 * 1000;
  return null;
}

export function threadPinIsLive(thread: Pick<DmThread, "pinnedMessageId" | "pinnedUntil">): boolean {
  if (!thread.pinnedMessageId) return false;
  if (thread.pinnedUntil && thread.pinnedUntil <= Date.now()) return false;
  return true;
}

export function makePinNotice(opts: {
  messageId: string;
  by: string;
  at?: number;
}): DmMessage {
  const at = opts.at ?? Date.now();
  return {
    id: `pin-notice-${opts.messageId}-${at}`,
    direction: "received",
    body: "pinned a message",
    at,
    e2ee: true,
    kind: "pin-notice",
    pinTargetId: opts.messageId,
    pinnedBy: opts.by,
  };
}

const SESSION_KEY_RE = /0x[0-9a-fA-F]{16,64}/;

export function generateSessionKey(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return `0x${hex}`;
}

export function normalizeSessionKey(raw: string): string | null {
  const hit = raw.match(SESSION_KEY_RE);
  if (!hit) return null;
  return `0x${hit[0].slice(2).toUpperCase()}`;
}

export function sessionShareLink(sessionKey: string): string {
  return `${JOIN_ORIGIN}/join#${sessionKey}`;
}

export function readJoinKeyFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const fromHash = normalizeSessionKey(window.location.hash);
  if (fromHash) return fromHash;
  const fromPath = normalizeSessionKey(window.location.href);
  if (fromPath) return fromPath;
  try {
    return normalizeSessionKey(sessionStorage.getItem(JOIN_KEY_STORAGE) ?? "");
  } catch {
    return null;
  }
}

export function rememberJoinKey(key: string | null): void {
  try {
    if (key) sessionStorage.setItem(JOIN_KEY_STORAGE, key);
    else sessionStorage.removeItem(JOIN_KEY_STORAGE);
  } catch {
    /* ignore */
  }
}

export function captureJoinIntent(): string | null {
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/messages")) {
    return null;
  }
  const key = readJoinKeyFromLocation();
  if (key) rememberJoinKey(key);
  return key;
}

export function readHostSessionKey(): string | null {
  if (typeof window === "undefined") return null;
  if (!window.location.pathname.startsWith("/messages")) return null;
  return normalizeSessionKey(window.location.pathname);
}

export const DEMO_PAYLOAD_KEY = "darke.demo.payload";
export const PENDING_LAUNCH_KEY = "darke.pending.launch";
export const SKIP_WELCOME_ONCE = "darke.skip.welcome.once";

export function stashPendingLaunch(
  body: string,
  sessionKey?: string,
  opts?: { quiet?: boolean; roomKind?: RoomKind },
): void {
  try {
    const existing = peekPendingLaunch();
    const key =
      normalizeSessionKey(sessionKey ?? "") ??
      existing?.sessionKey ??
      generateSessionKey();
    sessionStorage.setItem(
      PENDING_LAUNCH_KEY,
      JSON.stringify({
        body: body.trim(),
        sessionKey: key,
        quiet: opts?.quiet === true,
        roomKind: opts?.roomKind ?? existing?.roomKind ?? null,
      }),
    );
    sessionStorage.setItem(SKIP_WELCOME_ONCE, "1");
  } catch {
    /* ignore */
  }
}

export function peekSkipWelcomeOnce(): boolean {
  try {
    return sessionStorage.getItem(SKIP_WELCOME_ONCE) === "1";
  } catch {
    return false;
  }
}

export function peekPendingLaunch(): {
  body: string;
  sessionKey: string;
  quiet: boolean;
  roomKind: RoomKind | null;
} | null {
  try {
    const raw = sessionStorage.getItem(PENDING_LAUNCH_KEY);
    if (!raw) return null;
    if (raw.startsWith("{")) {
      const parsed = JSON.parse(raw) as {
        body?: unknown;
        sessionKey?: unknown;
        quiet?: unknown;
        roomKind?: unknown;
      };
      const body = typeof parsed.body === "string" ? parsed.body.trim() : "";
      const sessionKey =
        typeof parsed.sessionKey === "string"
          ? normalizeSessionKey(parsed.sessionKey)
          : null;
      if (!sessionKey) return null;
      const roomKind =
        parsed.roomKind === "team" || parsed.roomKind === "direct"
          ? parsed.roomKind
          : null;
      return { body, sessionKey, quiet: parsed.quiet === true, roomKind };
    }
    const body = raw.trim();
    if (!body) return null;
    const sessionKey = generateSessionKey();
    sessionStorage.setItem(
      PENDING_LAUNCH_KEY,
      JSON.stringify({ body, sessionKey }),
    );
    return { body, sessionKey, quiet: false, roomKind: null };
  } catch {
    return null;
  }
}

export function clearPendingLaunch(): void {
  try {
    sessionStorage.removeItem(PENDING_LAUNCH_KEY);
  } catch {
    /* ignore */
  }
}

export const COPY_LINK_TOAST_KEY = "darke.copy.link.toast";
export const COPY_LINK_TOAST_EVENT = "darke-copy-link-toast";

export type CopyLinkKind = "chat" | "group" | "team" | "invite";

export function copyLinkToastLabel(kind: CopyLinkKind): string {
  if (kind === "invite") return "Link copied to clipboard!";
  if (kind === "group") return "Group link copied to clipboard";
  if (kind === "team") return "Team link copied to clipboard";
  return "Chat link copied to clipboard!";
}

export function markChatLinkCopiedToast(kind: CopyLinkKind = "chat"): void {
  try {
    sessionStorage.setItem(COPY_LINK_TOAST_KEY, kind);
  } catch {
    /* ignore */
  }
}

export function consumeChatLinkCopiedToast(): CopyLinkKind | null {
  try {
    const raw = sessionStorage.getItem(COPY_LINK_TOAST_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(COPY_LINK_TOAST_KEY);
    if (raw === "group" || raw === "team" || raw === "chat") return raw;
    return "chat";
  } catch {
    return null;
  }
}

export function showCopyLinkToast(kind: CopyLinkKind = "chat"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<CopyLinkKind>(COPY_LINK_TOAST_EVENT, { detail: kind }),
  );
}

export function stashDemoPayload(body: string, sessionKey: string): void {
  try {
    sessionStorage.setItem(
      DEMO_PAYLOAD_KEY,
      JSON.stringify({ body: body.trim(), sessionKey }),
    );
  } catch {
    /* ignore */
  }
}

export function consumeDemoPayload(): { body: string; sessionKey: string } | null {
  try {
    const raw = sessionStorage.getItem(DEMO_PAYLOAD_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(DEMO_PAYLOAD_KEY);
    const parsed = JSON.parse(raw) as { body?: unknown; sessionKey?: unknown };
    const sessionKey =
      typeof parsed.sessionKey === "string"
        ? normalizeSessionKey(parsed.sessionKey)
        : null;
    const body = typeof parsed.body === "string" ? parsed.body.trim() : "";
    if (!sessionKey || !body) return null;
    return { body, sessionKey };
  } catch {
    return null;
  }
}

function storageKey(slug: string): string {
  return `darke.dm.${slug.trim().toLowerCase() || "session"}`;
}

function lastActiveStorageKey(slug: string): string {
  return `darke.dm.active.${slug.trim().toLowerCase() || "session"}`;
}

export function loadThreads(slug: string): DmThread[] {
  const raw = readLocalText(storageKey(slug));
  if (!raw) return [];
  try {
    const rows = JSON.parse(raw) as DmThread[];
    if (!Array.isArray(rows)) return [];
    return rows.filter((row) => row && typeof row.sessionKey === "string");
  } catch {
    return [];
  }
}

export function findStoredThreadBySessionKey(
  sessionKey: string,
): DmThread | null {
  const key = normalizeSessionKey(sessionKey);
  if (!key || typeof window === "undefined") return null;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const name = window.localStorage.key(i);
      if (!name?.startsWith("darke.dm.")) continue;
      if (
        name.startsWith("darke.dm.active.") ||
        name.startsWith("darke.dm.created.")
      ) {
        continue;
      }
      const raw = window.localStorage.getItem(name);
      if (!raw) continue;
      try {
        const rows = JSON.parse(raw) as DmThread[];
        if (!Array.isArray(rows)) continue;
        const hit = rows.find((row) => row?.sessionKey === key);
        if (hit) return hit;
      } catch {
        /* ignore bad row */
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function saveThreads(slug: string, threads: DmThread[]): void {
  writeLocalText(storageKey(slug), JSON.stringify(threads));
}

export function readLastActiveChatId(slug: string): string | null {
  const id = readLocalText(lastActiveStorageKey(slug))?.trim() || "";
  return id || null;
}

export function writeLastActiveChatId(slug: string, id: string | null): void {
  if (id) writeLocalText(lastActiveStorageKey(slug), id);
}

export function mostRecentThread(threads: DmThread[]): DmThread | null {
  if (threads.length === 0) return null;
  return [...threads].sort((a, b) => {
    const at = a.messages.at(-1)?.at ?? a.createdAt;
    const bt = b.messages.at(-1)?.at ?? b.createdAt;
    return bt - at;
  })[0];
}

export function teamChatSessionKey(
  workspaceId: string,
  channelId?: string | null,
): string {
  const a = workspaceId.replace(/-/g, "").toLowerCase().slice(0, 32);
  const b = (channelId ?? "general").replace(/-/g, "").toLowerCase().slice(0, 16);
  const hex = `${a}${b}`.replace(/[^0-9a-f]/g, "0").padEnd(16, "0").slice(0, 40);
  return `0x${hex.toUpperCase()}`;
}

export function chatRoomPath(
  thread: Pick<DmThread, "sessionKey" | "roomKind">,
): string {
  const type = thread.roomKind === "team" ? "team" : "direct";
  return `/app/chat/${encodeURIComponent(thread.sessionKey)}?type=${type}`;
}

export function chatIdFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const path = window.location.pathname;
  const hit = path.match(/^\/(?:app\/)?chat\/([^/]+)$/);
  if (!hit?.[1]) return null;
  const raw = decodeURIComponent(hit[1]);
  return normalizeSessionKey(raw) ?? raw;
}

export function lastSnippet(thread: DmThread): string {
  const last = thread.messages[thread.messages.length - 1];
  if (!last) return "";
  const text = (last.fileName || last.body).replace(/\s+/g, " ").trim();
  return text.length > 88 ? `${text.slice(0, 87)}…` : text;
}

export function formatThreadTime(at: number): string {
  const date = new Date(at);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function formatBubbleTime(at: number): string {
  return new Date(at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function peerUsernameFromHandle(handle: string): string | null {
  const raw = handle.replace(/^@/, "").trim().toLowerCase();
  if (!raw || raw.startsWith("0x") || raw.length < 2) return null;
  return raw;
}

export const NODE_GREETING =
  "Encrypted P2P node established. All communications are zero-knowledge and stored locally.";

export const P2P_ENCLAVE_TITLE = "🔒 Zero-Knowledge P2P Enclave Active";

export const P2P_ENCLAVE_BODY =
  "Messages in this conversation are encrypted end-to-end and transmitted directly between peer nodes. Only key holders in this chat can decrypt content.";

export function nodeGreetingMessage(sessionKey: string): DmMessage {
  return {
    id: `${sessionKey}-greeting`,
    direction: "received",
    body: P2P_ENCLAVE_BODY,
    title: P2P_ENCLAVE_TITLE,
    at: Date.now(),
    e2ee: true,
    kind: "system",
    is_system: true,
    is_ephemeral: true,
    shareLink: sessionShareLink(sessionKey),
  };
}

export function newThread(
  sessionKey: string,
  joined: boolean,
  roomKind?: RoomKind,
  peerUsername?: string,
  seq = 1,
): DmThread {
  const short = sessionKey.slice(0, 10);
  const peer = peerUsername?.replace(/^@/, "").trim().toLowerCase();
  return {
    id: sessionKey,
    sessionKey,
    displayName: "",
    handle: peer || short.toLowerCase(),
    peerUsername: peer || undefined,
    connectionState: joined ? "CONNECTED" : "WAITING FOR PEER",
    messages: [nodeGreetingMessage(sessionKey)],
    createdAt: Date.now(),
    roomKind,
    isHost: !joined,
    seq: Math.max(1, seq),
    autoNamed: true,
    renamed: false,
    isGroup: false,
  };
}
