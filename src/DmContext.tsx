import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  captureJoinIntent,
  consumeRoomJoinIntent,
  roomShareLink,
  chatIdFromLocation,
  chatRoomPath,
  CHAT_FOCUS_EVENT,
  consumeDemoPayload,
  peekPendingLaunch,
  clearPendingLaunch,
  generateSessionKey,
  lastSnippet,
  loadThreads,
  findStoredThreadBySessionKey,
  mostRecentThread,
  newThread,
  normalizeSessionKey,
  peerUsernameFromHandle,
  readHostSessionKey,
  readLastActiveChatId,
  rememberJoinKey,
  saveThreads,
  sessionShareLink,
  writeLastActiveChatId,
  nodeGreetingMessage,
  applyThreadPin,
  type ChatFocusDetail,
  type DmMessage,
  type DmThread,
  type RoomKind,
  type ThreadPinEvent,
  showCopyLinkToast,
} from "./dmSessions";
import { bootstrapSignalProtocol } from "./lib/crypto/signal";
import { supabase } from "./supabase";
import {
  fetchAndPurgeMailbox,
  listSentMailboxIds,
  queueMailboxControl,
  queueMailboxFile,
  queueMailboxMessage,
  queueRoomJoinRequest,
  queueRoomMessage,
  queueRoomSenderKey,
} from "./mailbox";
import {
  createRoomSenderDistribution,
  isSignalSenderKeyCiphertext,
  processRoomSenderDistribution,
  unwrapRoomSenderKeyPayload,
} from "./lib/crypto/signalRooms";
import {
  addMembersToChat,
  adoptRoomThread,
  createDirectChat,
  createRoomThread,
  threadIsGroup,
  threadIsRoom,
} from "./chatController";
import { useWorkspacesMaybe } from "./WorkspaceContext";
import { isProPlan } from "./workspaces";
import { openUpgradeModal } from "./useUpgradeModalStore";
import {
  migrateChatThreads,
  nextChatSeq,
  createEmptyUntitledThread,
  isFounderThread,
  isChatOwner,
  listChatMemberHandles,
  normalizeChatGuestHandle,
  roomRecipientHandles,
  sidebarPeerHandle,
  standaloneJoinBlocked,
} from "./chatService";
import {
  ensureFounderSidebarNode,
  withThreadRead,
} from "./useSidebarStore";
import { syncChatIndex } from "./searchIndex";
import {
  adoptLegacyThreadTitles,
  hydrateLocalChatTitles,
  setLocalChatTitle,
} from "./localChatTitles";

function syncChatUrl(thread: Pick<DmThread, "sessionKey" | "roomKind">): void {
  if (typeof window === "undefined") return;
  const next = chatRoomPath(thread);
  const now = `${window.location.pathname}${window.location.search}`;
  if (now === next) return;
  window.history.replaceState(null, "", next);
}

type Draft = { sessionKey: string; shareLink: string };

function makeDraft(): Draft {
  const sessionKey = generateSessionKey();
  return { sessionKey, shareLink: sessionShareLink(sessionKey) };
}

type DmContextValue = {
  threads: DmThread[];
  activeId: string | null;
  active: DmThread | null;
  draft: Draft | null;
  copied: boolean;
  joinError: string | null;
  setActiveId: (id: string | null) => void;
  openNewMessage: () => string;
  generateChatLink: () => void;
  startEncryptedChat: (
    body: string,
    existingKey?: string,
    announce?: boolean,
    roomKind?: RoomKind,
    peerUsername?: string,
  ) => boolean;
  roomReady: boolean;
  dismissRoomReady: () => void;
  copyChatLink: () => Promise<void>;
  joinPeer: (raw: string) => boolean;
  sendChat: (
    body: string,
    opts?: {
      mailbox?: boolean;
      file?: File;
      replyToMessageId?: string;
      threadId?: string;
    },
  ) => Promise<void>;
  editMessage: (messageId: string, body: string) => Promise<void>;
  deleteMessages: (messageIds: string[]) => Promise<void>;
  pinMessage: (
    messageId: string,
    pinned?: boolean,
    until?: number | null,
  ) => Promise<void>;
  applyRemotePin: (event: ThreadPinEvent & { sessionKey?: string }) => void;
  forwardMessages: (messageIds: string[], threadIds: string[]) => Promise<void>;
  receivePeerChat: (
    body: string,
    opts?: { replyToMessageId?: string },
  ) => void;
  renameActive: (name: string) => void;
  renameThread: (id: string, name: string) => void;
  pinThread: (id: string, pinned?: boolean) => void;
  patchThread: (id: string, patch: Partial<DmThread>) => void;
  deleteThread: (id: string) => void;
  rotateActiveKeys: () => void;
  revokeActiveShareLink: () => void;
  purgeActiveHistory: () => void;
  inviteHandle: (handle: string) => void;
  createRoom: (name: string, topic?: string) => string | null;
  guest: boolean;
  slug: string;
};

const DmContext = createContext<DmContextValue | null>(null);

export function DmProvider({
  slug,
  guest = false,
  children,
}: {
  slug: string;
  guest?: boolean;
  children: ReactNode;
}) {
  const [threads, setThreads] = useState<DmThread[]>(() =>
    migrateChatThreads(slug, loadThreads(slug)),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [copied, setCopied] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [roomReady, setRoomReady] = useState(false);
  const threadsRef = useRef(threads);
  threadsRef.current = threads;
  const sendingIdsRef = useRef(new Set<string>());
  const workspaces = useWorkspacesMaybe();
  const enterprise = isProPlan(workspaces?.tier ?? "free");

  useEffect(() => {
    if (!guest) void bootstrapSignalProtocol().catch(() => null);
    setThreads(migrateChatThreads(slug, loadThreads(slug)));
    setActiveId(null);
    setDraft(null);
    setRoomReady(false);
    let cancelled = false;
    void hydrateLocalChatTitles(slug).then(() => {
      if (cancelled) return;
      setThreads((rows) => adoptLegacyThreadTitles(slug, rows));
    });
    return () => {
      cancelled = true;
    };
  }, [slug, guest]);

  useEffect(() => {
    saveThreads(slug, threads);
    void syncChatIndex(slug, threads);
  }, [slug, threads]);

  useEffect(() => {
    const onFocus = (event: Event) => {
      const chatId = (event as CustomEvent<ChatFocusDetail>).detail?.chatId;
      if (chatId) setActiveId(chatId);
    };
    window.addEventListener(CHAT_FOCUS_EVENT, onFocus);
    return () => window.removeEventListener(CHAT_FOCUS_EVENT, onFocus);
  }, []);

  useEffect(() => {
    const demo = guest ? consumeDemoPayload() : null;
    const hostKey = readHostSessionKey() ?? demo?.sessionKey ?? null;
    if (hostKey) {
      setThreads((rows) => {
        const existing = rows.find((row) => row.sessionKey === hostKey);
        const message: DmMessage | null = demo?.body
          ? {
              id: `${Date.now()}-demo`,
              direction: "sent",
              body: demo.body,
              at: Date.now(),
              e2ee: true,
            }
          : null;
        const seeded: DmThread = existing
          ? message && existing.messages.length === 0
            ? { ...existing, messages: [message] }
            : existing
          : {
              ...newThread(
                hostKey,
                false,
                undefined,
                undefined,
                nextChatSeq(slug, rows),
              ),
              createdBy: guest ? undefined : slug,
              messages: message
                ? [nodeGreetingMessage(hostKey), message]
                : [nodeGreetingMessage(hostKey)],
            };
        setActiveId(seeded.id);
        setDraft({
          sessionKey: hostKey,
          shareLink: sessionShareLink(hostKey),
        });
        if (guest) setRoomReady(true);
        if (existing) {
          return rows.map((row) => (row.id === seeded.id ? seeded : row));
        }
        return [seeded, ...rows];
      });
      return;
    }
    const key = captureJoinIntent();
    if (!key) return;
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      const existing = threadsRef.current.find((row) => row.sessionKey === key);
      const target = existing ?? findStoredThreadBySessionKey(key);
      const blocked = standaloneJoinBlocked(target, slug);
      if (blocked) {
        setJoinError(blocked);
        rememberJoinKey(null);
        return;
      }
      rememberJoinKey(null);
      if (!guest && typeof window !== "undefined") {
        window.history.replaceState(null, "", "/app");
      }
      setJoinError(null);
      setThreads((rows) => {
        const found = rows.find((row) => row.sessionKey === key);
        if (found) {
          setActiveId(found.id);
          return rows.map((row) =>
            row.id === found.id
              ? {
                  ...row,
                  connectionState: "CONNECTED" as const,
                  displayName: guest ? "Guest" : row.displayName,
                  handle: guest ? "guest" : row.handle,
                }
              : row,
          );
        }
        const thread = guest
          ? { ...newThread(key, true), displayName: "Guest", handle: "guest" }
          : newThread(key, true, undefined, undefined, nextChatSeq(slug, rows));
        setActiveId(thread.id);
        return [thread, ...rows];
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, guest]);

  useEffect(() => {
    if (guest) return;
    const invite = consumeRoomJoinIntent();
    if (!invite) return;
    const host = invite.host.replace(/^@/, "").trim().toLowerCase();
    const key = invite.sessionKey;
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/app");
    }
    setThreads((rows) => {
      const found =
        rows.find((row) => row.sessionKey === key && threadIsRoom(row)) ??
        rows.find((row) => row.sessionKey === key);
      if (found) {
        const next = threadIsRoom(found)
          ? found
          : { ...found, roomKind: "room" as const, isGroup: true, handle: "room" };
        setActiveId(found.id);
        setDraft({
          sessionKey: key,
          shareLink: roomShareLink(key, found.createdBy || host),
        });
        return rows.map((row) => (row.id === found.id ? next : row));
      }
      const thread = adoptRoomThread(slug, rows, key, host);
      setActiveId(thread.id);
      setDraft({ sessionKey: key, shareLink: roomShareLink(key, host) });
      return [thread, ...rows];
    });
    if (host && host !== slug) {
      void queueRoomJoinRequest({
        sender: slug,
        recipient: host,
        sessionKey: key,
      });
    }
  }, [guest, slug]);

  const generateChatLink = useCallback(() => {
    setDraft(makeDraft());
    setCopied(false);
  }, []);

  const startEncryptedChat = useCallback((
    body: string,
    existingKey?: string,
    announce = true,
    roomKind?: RoomKind,
    peerUsername?: string,
  ) => {
    const text = body.trim();
    const sessionKey = existingKey
      ? normalizeSessionKey(existingKey) ?? generateSessionKey()
      : generateSessionKey();
    const shareLink = sessionShareLink(sessionKey);
    const message: DmMessage | null = text
      ? {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          direction: "sent",
          body: text,
          at: Date.now(),
          e2ee: true,
        }
      : null;
    setThreads((rows) => {
      const existing = rows.find((row) => row.sessionKey === sessionKey);
      if (existing) {
        const withPeer = peerUsername
          ? {
              ...existing,
              peerUsername: peerUsername.replace(/^@/, "").trim().toLowerCase(),
              handle: peerUsername.replace(/^@/, "").trim().toLowerCase(),
              isGroup: existing.isGroup === true,
            }
          : existing;
        const seeded =
          message && withPeer.messages.length === 0
            ? { ...withPeer, messages: [message] }
            : withPeer;
        setActiveId(seeded.id);
        setDraft({ sessionKey, shareLink });
        setRoomReady(announce);
        setCopied(false);
        setJoinError(null);
        return rows.map((row) => (row.id === seeded.id ? seeded : row));
      }
        const thread: DmThread = {
        ...newThread(
          sessionKey,
          false,
          roomKind === "team" ? "team" : "direct",
          peerUsername,
          nextChatSeq(slug, rows),
        ),
        createdBy: slug,
        isGroup: false,
        messages: message
          ? [nodeGreetingMessage(sessionKey), message]
          : [nodeGreetingMessage(sessionKey)],
      };
      setActiveId(thread.id);
      setDraft({ sessionKey, shareLink });
      setRoomReady(announce);
      setCopied(false);
      setJoinError(null);
      return [thread, ...rows.filter((row) => row.id !== thread.id)];
    });
    if (typeof window !== "undefined") {
      syncChatUrl({ sessionKey, roomKind });
    }
    return true;
  }, [slug]);

  const openNewMessage = useCallback(() => {
    const thread = createDirectChat(slug, threadsRef.current);
    const shareLink = sessionShareLink(thread.sessionKey);
    setThreads((rows) => {
      setActiveId(thread.id);
      setDraft({ sessionKey: thread.sessionKey, shareLink });
      setRoomReady(false);
      setCopied(false);
      setJoinError(null);
      return [thread, ...rows];
    });
    if (typeof window !== "undefined") {
      syncChatUrl({ sessionKey: thread.sessionKey, roomKind: "direct" });
    }
    return shareLink;
  }, [slug]);

  const createRoom = useCallback(
    (name: string, topic?: string) => {
      const title = name.trim();
      if (!title) return null;
      const owned = threadsRef.current.filter(
        (row) => threadIsRoom(row) && isChatOwner(row, slug),
      ).length;
      if (!enterprise && owned >= 1) {
        openUpgradeModal("rooms");
        return null;
      }
      const thread = createRoomThread(slug, threadsRef.current, title, topic);
      setThreads((rows) => {
        setActiveId(thread.id);
        setDraft({
          sessionKey: thread.sessionKey,
          shareLink: roomShareLink(thread.sessionKey, slug),
        });
        setRoomReady(false);
        setCopied(false);
        setJoinError(null);
        return [thread, ...rows];
      });
      if (typeof window !== "undefined") {
        syncChatUrl({ sessionKey: thread.sessionKey, roomKind: "room" });
      }
      void createRoomSenderDistribution(thread.sessionKey, slug);
      return thread.id;
    },
    [enterprise, slug],
  );

  const shareRoomSenderKey = useCallback(
    async (thread: DmThread, recipients: string[]) => {
      const distribution = await createRoomSenderDistribution(
        thread.sessionKey,
        slug,
      );
      if (!distribution) return;
      const members = roomRecipientHandles(thread, slug);
      const already = new Set(
        (thread.skSharedWith ?? []).map((row) =>
          normalizeChatGuestHandle(row),
        ),
      );
      const sent: string[] = [];
      for (const raw of recipients) {
        const handle = normalizeChatGuestHandle(raw);
        if (!handle || handle === slug || already.has(handle)) continue;
        const queued = await queueRoomSenderKey({
          sender: slug,
          recipient: handle,
          sessionKey: thread.sessionKey,
          distribution,
          title: thread.displayName,
          topic: thread.description,
          members,
        });
        if (queued.ok) sent.push(handle);
      }
      if (!sent.length) return;
      setThreads((rows) =>
        rows.map((row) =>
          row.id === thread.id
            ? {
                ...row,
                skSharedWith: [...(row.skSharedWith ?? []), ...sent],
              }
            : row,
        ),
      );
    },
    [slug],
  );

  useEffect(() => {
    if (guest) return;
    const pending = peekPendingLaunch();
    if (pending) {
      startEncryptedChat(
        pending.body,
        pending.sessionKey,
        !pending.quiet,
        pending.roomKind ?? undefined,
      );
    }
  }, [guest, slug, startEncryptedChat]);

  useEffect(() => {
    if (guest) return;
    const current = threadsRef.current.find((row) => row.id === activeId);
    if (current) return;
    const seeded = ensureFounderSidebarNode(slug, threadsRef.current);
    const fromUrl = chatIdFromLocation();
    const rows = seeded;
    const byUrl = fromUrl
      ? rows.find(
          (row) => row.sessionKey === fromUrl || row.id === fromUrl,
        )
      : null;
    const lastId = readLastActiveChatId(slug);
    const byLast = lastId
      ? rows.find((row) => row.id === lastId || row.sessionKey === lastId)
      : null;
    const others = rows.filter((row) => !isFounderThread(row));
    const recent = mostRecentThread(others);
    const pick = byUrl ?? byLast ?? recent;
    if (pick) {
      if (seeded !== threadsRef.current) setThreads(seeded);
      setActiveId(pick.id);
      setDraft({
        sessionKey: pick.sessionKey,
        shareLink: sessionShareLink(pick.sessionKey),
      });
      return;
    }
    const thread = createEmptyUntitledThread(
      generateSessionKey(),
      nextChatSeq(slug, rows),
      slug,
    );
    setThreads([thread, ...rows]);
    setActiveId(thread.id);
    setDraft({
      sessionKey: thread.sessionKey,
      shareLink: sessionShareLink(thread.sessionKey),
    });
  }, [guest, slug, activeId]);

  useEffect(() => {
    if (guest || !activeId) return;
    const row = threadsRef.current.find((item) => item.id === activeId);
    if (!row) return;
    writeLastActiveChatId(slug, row.id);
    setDraft({
      sessionKey: row.sessionKey,
      shareLink: threadIsRoom(row)
        ? roomShareLink(row.sessionKey, row.createdBy || slug)
        : sessionShareLink(row.sessionKey),
    });
    syncChatUrl(row);
  }, [guest, slug, activeId]);

  const dismissRoomReady = useCallback(() => {
    setRoomReady(false);
    clearPendingLaunch();
  }, []);

  const copyChatLink = useCallback(async () => {
    const row = threadsRef.current.find((item) => item.id === activeId);
    if (!isChatOwner(row ?? null, slug)) return;
    const link = row
      ? threadIsRoom(row)
        ? roomShareLink(row.sessionKey, row.createdBy || slug)
        : sessionShareLink(row.sessionKey)
      : draft?.shareLink;
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      showCopyLinkToast(
        threadIsRoom(row) ? "room" : threadIsGroup(row) ? "group" : "chat",
      );
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }, [draft, activeId, slug]);

  const joinPeer = useCallback((raw: string) => {
    const key = normalizeSessionKey(raw.trim());
    if (!key) {
      setJoinError("Enter a chat key or link like 0x…");
      return false;
    }
    const sessionKey = key;
    setJoinError(null);
    setThreads((rows) => {
      const found = rows.find((item) => item.sessionKey === sessionKey);
      if (found) {
        setActiveId(found.id);
        return rows.map((row) =>
          row.id === found.id
            ? { ...row, connectionState: "CONNECTED" as const }
            : row,
        );
      }
      const thread = newThread(
        sessionKey,
        true,
        undefined,
        undefined,
        nextChatSeq(slug, rows),
      );
      setActiveId(thread.id);
      return [thread, ...rows];
    });
    return true;
  }, [slug]);

  const sendChat = useCallback(
    async (body: string, opts?: { mailbox?: boolean; file?: File; replyToMessageId?: string; threadId?: string }) => {
      const file = opts?.file;
      const text = body.trim() || file?.name || "";
      const targetId = opts?.threadId || activeId;
      if ((!text && !file) || !targetId) return;
      const localId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const fileUrl = file ? URL.createObjectURL(file) : undefined;
      const thread = threadsRef.current.find((row) => row.id === targetId);
      if (thread && threadIsRoom(thread) && file) return;
      const quoted = opts?.replyToMessageId
        ? thread?.messages.find((msg) => msg.id === opts.replyToMessageId)
        : undefined;
      const snippet = quoted
        ? (quoted.fileName || quoted.body).replace(/\s+/g, " ").trim().slice(0, 140)
        : "";
      const optimistic: DmMessage = {
        id: localId,
        direction: "sent",
        body: text,
        at: Date.now(),
        e2ee: true,
        fileName: file?.name,
        fileUrl,
        fileSize: file?.size,
        relay: opts?.mailbox ? "pending-keys" : undefined,
        replyToMessageId: quoted?.id,
        replyToSnippet: snippet || undefined,
      };
      setThreads((rows) =>
        rows.map((row) =>
          row.id === targetId
            ? { ...row, messages: [...row.messages, optimistic] }
            : row,
        ),
      );
      if (!opts?.mailbox || guest) return;
      sendingIdsRef.current.add(localId);
      if (thread && threadIsRoom(thread)) {
        const members = roomRecipientHandles(thread, slug);
        await shareRoomSenderKey(thread, members);
        let ok = false;
        for (const recipient of members) {
          const queued = await queueRoomMessage({
            sender: slug,
            recipient,
            sessionKey: thread.sessionKey,
            body: text,
            messageId: localId,
          }).catch((): { ok: false; reason: "error" } => ({
            ok: false,
            reason: "error",
          }));
          if (queued.ok) ok = true;
        }
        sendingIdsRef.current.delete(localId);
        setThreads((rows) =>
          rows.map((row) =>
            row.id === targetId
              ? {
                  ...row,
                  messages: row.messages.map((msg) =>
                    msg.id === localId
                      ? {
                          ...msg,
                          relay: ok
                            ? ("mailbox" as const)
                            : ("pending-keys" as const),
                        }
                      : msg,
                  ),
                }
              : row,
          ),
        );
        return;
      }
      const recipient =
        (thread ? sidebarPeerHandle(thread, slug) : null) ||
        thread?.peerUsername ||
        peerUsernameFromHandle(thread?.handle ?? "");
      const selfNote = Boolean(recipient && recipient === slug);
      if (!thread || !recipient || selfNote) {
        sendingIdsRef.current.delete(localId);
        return;
      }
      const queued = file
        ? await queueMailboxFile({
            sender: slug,
            recipient,
            sessionKey: thread.sessionKey,
            file,
          }).catch((): { ok: false; reason: "error" } => ({
            ok: false,
            reason: "error",
          }))
        : await queueMailboxMessage({
            sender: slug,
            recipient,
            sessionKey: thread.sessionKey,
            body: text,
            messageId: localId,
          }).catch((): { ok: false; reason: "error" } => ({
            ok: false,
            reason: "error",
          }));
      if (!queued.ok) {
        setThreads((rows) =>
          rows.map((row) =>
            row.id === targetId
              ? {
                  ...row,
                  messages: row.messages.map((msg) =>
                    msg.id === localId
                      ? { ...msg, relay: "pending-keys" as const }
                      : msg,
                  ),
                }
              : row,
          ),
        );
        sendingIdsRef.current.delete(localId);
        return;
      }
      setThreads((rows) =>
        rows.map((row) =>
          row.id === targetId
            ? {
                ...row,
                messages: row.messages.map((msg) =>
                  msg.id === localId
                    ? { ...msg, pendingId: queued.id, relay: "mailbox" as const }
                    : msg,
                ),
              }
            : row,
        ),
      );
      sendingIdsRef.current.delete(localId);
    },
    [activeId, guest, shareRoomSenderKey, slug],
  );

  const peersForThread = useCallback(
    (thread: DmThread): string[] => {
      if (threadIsGroup(thread)) {
        return listChatMemberHandles(thread, slug)
          .map((handle) => normalizeChatGuestHandle(handle))
          .filter((handle) => handle && handle !== slug && handle !== "__self__");
      }
      const peer =
        sidebarPeerHandle(thread, slug) ||
        thread.peerUsername ||
        peerUsernameFromHandle(thread.handle ?? "");
      if (!peer || peer === slug) return [];
      return [peer];
    },
    [slug],
  );

  const editMessage = useCallback(
    async (messageId: string, body: string) => {
      const text = body.trim();
      if (!text || !activeId) return;
      const thread = threadsRef.current.find((row) => row.id === activeId);
      const current = thread?.messages.find((msg) => msg.id === messageId);
      if (!thread || !current || current.direction !== "sent") return;
      setThreads((rows) =>
        rows.map((row) =>
          row.id === activeId
            ? {
                ...row,
                messages: row.messages.map((msg) =>
                  msg.id === messageId ? { ...msg, body: text, edited: true } : msg,
                ),
              }
            : row,
        ),
      );
      if (guest) return;
      await Promise.all(
        peersForThread(thread).map((recipient) =>
          queueMailboxControl({
            sender: slug,
            recipient,
            sessionKey: thread.sessionKey,
            kind: "edit",
            messageId,
            body: text,
          }).catch(() => null),
        ),
      );
    },
    [activeId, guest, peersForThread, slug],
  );

  const deleteMessages = useCallback(
    async (messageIds: string[]) => {
      const ids = [...new Set(messageIds.filter(Boolean))];
      if (!ids.length || !activeId) return;
      const thread = threadsRef.current.find((row) => row.id === activeId);
      if (!thread) return;
      setThreads((rows) =>
        rows.map((row) =>
          row.id === activeId
            ? {
                ...row,
                messages: row.messages.filter((msg) => !ids.includes(msg.id)),
                pinnedMessageId: ids.includes(row.pinnedMessageId ?? "")
                  ? null
                  : row.pinnedMessageId,
                pinnedBy: ids.includes(row.pinnedMessageId ?? "")
                  ? null
                  : row.pinnedBy,
                pinnedUntil: ids.includes(row.pinnedMessageId ?? "")
                  ? null
                  : row.pinnedUntil,
              }
            : row,
        ),
      );
      if (guest) return;
      await Promise.all(
        ids.flatMap((messageId) =>
          peersForThread(thread).map((recipient) =>
            queueMailboxControl({
              sender: slug,
              recipient,
              sessionKey: thread.sessionKey,
              kind: "delete",
              messageId,
            }).catch(() => null),
          ),
        ),
      );
    },
    [activeId, guest, peersForThread, slug],
  );

  const findPinThread = useCallback(
    (rows: DmThread[], sessionKey: string | undefined, sender: string) => {
      const key =
        normalizeSessionKey(sessionKey || "") ?? sessionKey ?? "";
      const who = sender.replace(/^@/, "").trim().toLowerCase();
      return (
        rows.find(
          (row) =>
            key &&
            (normalizeSessionKey(row.sessionKey) ?? row.sessionKey) === key,
        ) ??
        rows.find(
          (row) =>
            !threadIsGroup(row) && sidebarPeerHandle(row, slug) === who,
        ) ??
        rows.find((row) => {
          if (threadIsGroup(row)) return false;
          const peer = (row.peerUsername || row.handle || "")
            .replace(/^@/, "")
            .trim()
            .toLowerCase();
          return Boolean(who) && peer === who;
        }) ??
        null
      );
    },
    [slug],
  );

  const pinMessage = useCallback(
    async (messageId: string, pinned = true, until: number | null = null) => {
      if (!activeId) return;
      const thread = threadsRef.current.find((row) => row.id === activeId);
      if (!thread) return;
      const who = slug.replace(/^@/, "").trim().toLowerCase();
      const current = thread.messages.find((msg) => msg.id === messageId);
      const snippet = (current?.fileName || current?.body || "")
        .replace(/\s+/g, " ")
        .trim();
      const event: ThreadPinEvent = {
        pinned,
        by: who,
        messageId,
        pinUntil: pinned ? until : null,
        snippet,
        pinAt: current?.at,
      };
      setThreads((rows) =>
        rows.map((row) =>
          row.id === activeId ? applyThreadPin(row, event) : row,
        ),
      );
      if (guest) return;
      await Promise.all(
        peersForThread(thread).map((recipient) =>
          queueMailboxControl({
            sender: slug,
            recipient,
            sessionKey: thread.sessionKey,
            kind: "pin",
            messageId,
            body: snippet,
            pinned,
            pinUntil: pinned ? until : null,
            pinAt: current?.at,
          }).catch(() => null),
        ),
      );
    },
    [activeId, guest, peersForThread, slug],
  );

  const applyRemotePin = useCallback(
    (event: ThreadPinEvent & { sessionKey?: string }) => {
      const who = event.by.replace(/^@/, "").trim().toLowerCase();
      if (!who || who === slug.replace(/^@/, "").trim().toLowerCase()) return;
      setThreads((rows) => {
        const existing = findPinThread(rows, event.sessionKey, who);
        if (!existing) return rows;
        return rows.map((row) =>
          row.id === existing.id
            ? applyThreadPin(row, { ...event, by: who })
            : row,
        );
      });
    },
    [findPinThread, slug],
  );

  const forwardMessages = useCallback(
    async (messageIds: string[], threadIds: string[]) => {
      const source = threadsRef.current.find((row) => row.id === activeId);
      const texts = (source?.messages ?? [])
        .filter((msg) => messageIds.includes(msg.id))
        .map((msg) => msg.body.trim())
        .filter(Boolean);
      if (!texts.length) return;
      for (const threadId of threadIds) {
        for (const text of texts) {
          await sendChat(text, { mailbox: true, threadId });
        }
      }
    },
    [activeId, sendChat],
  );

  const receivePeerChat = useCallback(
    (body: string, opts?: { replyToMessageId?: string }) => {
      const text = body.trim();
      if (!text || !activeId) return;
      const thread = threadsRef.current.find((row) => row.id === activeId);
      const quoted = opts?.replyToMessageId
        ? thread?.messages.find((msg) => msg.id === opts.replyToMessageId)
        : undefined;
      const snippet = quoted
        ? (quoted.fileName || quoted.body).replace(/\s+/g, " ").trim().slice(0, 140)
        : "";
      const message: DmMessage = {
        id: `p2p-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        direction: "received",
        body: text,
        at: Date.now(),
        e2ee: true,
        replyToMessageId: quoted?.id,
        replyToSnippet: snippet || undefined,
      };
      setThreads((rows) =>
        rows.map((row) =>
          row.id === activeId
            ? { ...row, messages: [...row.messages, message] }
            : row,
        ),
      );
    },
    [activeId],
  );

  const ingestMailbox = useCallback(async () => {
    const incoming = await fetchAndPurgeMailbox(slug).catch(() => []);
    if (!incoming.length) return;
    for (const item of incoming) {
      if (item.kind !== "skdm") continue;
      const key = normalizeSessionKey(item.sessionKey) ?? item.sessionKey;
      await processRoomSenderDistribution(key, item.sender, item.body);
    }
    const roomPlain = new Map<string, string>();
    for (const item of incoming) {
      if (item.kind !== "room") continue;
      const key = normalizeSessionKey(item.sessionKey) ?? item.sessionKey;
      const opened = await unwrapRoomSenderKeyPayload(
        key,
        item.sender,
        item.body,
      );
      if (opened) roomPlain.set(item.id, opened);
    }
    setThreads((rows) => {
      let next = rows;
      for (const item of incoming) {
        const key = normalizeSessionKey(item.sessionKey) ?? item.sessionKey;
        const sender = item.sender.replace(/^@/, "").trim().toLowerCase();
        if (item.kind === "room-join") {
          const found = next.find(
            (row) => threadIsRoom(row) && row.sessionKey === key,
          );
          if (!found || !isChatOwner(found, slug)) continue;
          const admitted = addMembersToChat(found, [sender], slug);
          next = next.map((row) => (row.id === found.id ? admitted : row));
          void shareRoomSenderKey(admitted, [sender]);
          continue;
        }
        if (item.kind === "skdm") {
          const members = [
            ...new Set(
              [sender, slug, ...(item.members ?? [])].map((row) =>
                normalizeChatGuestHandle(row),
              ),
            ),
          ].filter(Boolean);
          const found = next.find(
            (row) =>
              (normalizeSessionKey(row.sessionKey) ?? row.sessionKey) === key ||
              row.id === key,
          );
          if (found) {
            next = next.map((row) =>
              row.id === found.id
                ? addMembersToChat(
                    {
                      ...row,
                      displayName: item.title?.trim() || row.displayName,
                      description: item.topic ?? row.description,
                      roomKind: "room",
                      isGroup: true,
                    },
                    members,
                    slug,
                  )
                : row,
            );
          } else {
            const seeded = addMembersToChat(
              {
                ...createRoomThread(
                  slug,
                  next,
                  item.title?.trim() || "Room",
                  item.topic,
                ),
                id: key,
                sessionKey: key,
              },
              members,
              slug,
            );
            next = [seeded, ...next];
          }
          const live =
            next.find((row) => row.sessionKey === key || row.id === key) ??
            null;
          if (live) void shareRoomSenderKey(live, members);
          continue;
        }
        if (item.kind === "room") {
          const plain = roomPlain.get(item.id) ?? item.body;
          if (!plain || isSignalSenderKeyCiphertext(plain)) continue;
          let innerBody = plain;
          let innerId = item.messageId;
          try {
            const parsed = JSON.parse(plain) as {
              body?: string;
              messageId?: string;
            };
            if (typeof parsed.body === "string") innerBody = parsed.body;
            if (typeof parsed.messageId === "string") innerId = parsed.messageId;
          } catch {
            innerBody = plain;
          }
          const sameKey = (row: DmThread) =>
            (normalizeSessionKey(row.sessionKey) ?? row.sessionKey) === key ||
            row.id === key;
          let found = next.find(sameKey);
          if (!found) {
            found = addMembersToChat(
              {
                ...createRoomThread(slug, next, item.title?.trim() || "Room"),
                id: key,
                sessionKey: key,
              },
              [sender],
              slug,
            );
            next = [found, ...next];
          }
          if (
            found.messages.some(
              (msg) =>
                msg.pendingId === item.id || (innerId && msg.id === innerId),
            )
          ) {
            continue;
          }
          const message: DmMessage = {
            id: innerId || `mb-${item.id}`,
            direction: "received",
            body: innerBody,
            at: item.at,
            e2ee: true,
            pendingId: item.id,
          };
          const activeHere = found.id === activeId;
          next = next.map((row) =>
            row.id === found.id
              ? {
                  ...row,
                  messages: [...row.messages, message],
                  unread: activeHere ? 0 : (row.unread ?? 0) + 1,
                }
              : row,
          );
          continue;
        }
        const existing =
          next.find((row) => row.sessionKey === key) ??
          next.find(
            (row) =>
              !threadIsGroup(row) && sidebarPeerHandle(row, slug) === sender,
          );
        if (item.kind === "edit" || item.kind === "delete") {
          if (!existing || !item.messageId) continue;
          next = next.map((row) => {
            if (row.id !== existing.id) return row;
            if (item.kind === "delete") {
              return {
                ...row,
                messages: row.messages.filter((msg) => msg.id !== item.messageId),
                pinnedMessageId:
                  row.pinnedMessageId === item.messageId
                    ? null
                    : row.pinnedMessageId,
                pinnedBy:
                  row.pinnedMessageId === item.messageId ? null : row.pinnedBy,
                pinnedUntil:
                  row.pinnedMessageId === item.messageId
                    ? null
                    : row.pinnedUntil,
              };
            }
            return {
              ...row,
              messages: row.messages.map((msg) =>
                msg.id === item.messageId
                  ? { ...msg, body: item.body || msg.body, edited: true }
                  : msg,
              ),
            };
          });
          continue;
        }
        if (item.kind === "pin") {
          const thread =
            existing ?? findPinThread(next, item.sessionKey, sender);
          if (!thread) continue;
          next = next.map((row) =>
            row.id === thread.id
              ? applyThreadPin(row, {
                  pinned: item.pinned !== false,
                  by: sender,
                  messageId: item.messageId,
                  pinUntil: item.pinUntil,
                  snippet: item.body,
                  pinAt: item.pinAt,
                })
              : row,
          );
          continue;
        }
        const message: DmMessage = {
          id: item.messageId || `mb-${item.id}`,
          direction: "received",
          body: item.body,
          at: item.at,
          e2ee: true,
          pendingId: item.id,
          fileName: item.fileName,
          fileUrl: item.fileUrl,
          fileSize: item.fileSize,
        };
        if (existing) {
          if (
            next.some((row) =>
              row.messages.some((msg) => msg.pendingId === item.id),
            )
          ) {
            continue;
          }
          const activeHere = existing.id === activeId;
          next = next.map((row) =>
            row.id === existing.id
              ? {
                  ...row,
                  peerUsername: row.peerUsername || sender,
                  handle: row.peerUsername ? row.handle : sender,
                  messages: [...row.messages, message],
                  unread: activeHere ? 0 : (row.unread ?? 0) + 1,
                }
              : row,
          );
        } else {
          const collision = next.some(
            (row) => row.id === key || row.sessionKey === key,
          );
          const threadKey = collision ? generateSessionKey() : key;
          next = [
            {
              ...newThread(
                threadKey,
                false,
                "direct",
                sender,
                nextChatSeq(slug, next),
              ),
              messages: [nodeGreetingMessage(threadKey), message],
              unread: 1,
            },
            ...next,
          ];
        }
      }
      return next;
    });
  }, [slug, activeId, findPinThread, shareRoomSenderKey]);

  useEffect(() => {
    if (guest) return;
    void ingestMailbox();
    const timer = window.setInterval(() => void ingestMailbox(), 4000);
    const channel = supabase
      .channel(`mailbox:${slug}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "pending_messages",
          filter: `recipient_username=eq.${slug}`,
        },
        () => {
          void ingestMailbox();
        },
      )
      .subscribe();
    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [guest, ingestMailbox, slug]);

  const hasMailboxQueue = threads.some((row) =>
    row.messages.some(
      (msg) => msg.direction === "sent" && msg.relay === "mailbox",
    ),
  );

  const hasPendingKeys = threads.some((row) =>
    row.messages.some(
      (msg) => msg.direction === "sent" && msg.relay === "pending-keys",
    ),
  );

  useEffect(() => {
    if (guest || !hasPendingKeys) return;
    let cancelled = false;
    const inflight = new Set<string>();
    async function flush() {
      for (const thread of threadsRef.current) {
        if (threadIsRoom(thread)) {
          const recipients = roomRecipientHandles(thread, slug);
          if (!recipients.length) continue;
          await shareRoomSenderKey(thread, recipients);
          for (const msg of thread.messages) {
            if (cancelled) return;
            if (msg.direction !== "sent" || msg.relay !== "pending-keys") continue;
            if (sendingIdsRef.current.has(msg.id)) continue;
            if (Date.now() - msg.at < 4000) continue;
            if (inflight.has(msg.id)) continue;
            inflight.add(msg.id);
            try {
              let ok = false;
              let queuedId: string | undefined;
              for (const recipient of recipients) {
                const queued = await queueRoomMessage({
                  sender: slug,
                  recipient,
                  sessionKey: thread.sessionKey,
                  body: msg.body,
                  messageId: msg.id,
                });
                if (queued.ok) {
                  ok = true;
                  queuedId = queued.id;
                }
              }
              if (cancelled || !ok) {
                inflight.delete(msg.id);
                continue;
              }
              setThreads((rows) =>
                rows.map((row) =>
                  row.id === thread.id
                    ? {
                        ...row,
                        messages: row.messages.map((item) =>
                          item.id === msg.id
                            ? {
                                ...item,
                                pendingId: queuedId,
                                relay: "mailbox" as const,
                              }
                            : item,
                        ),
                      }
                    : row,
                ),
              );
            } catch {
              inflight.delete(msg.id);
            }
          }
          continue;
        }
        const recipient =
          sidebarPeerHandle(thread, slug) ||
          thread.peerUsername ||
          peerUsernameFromHandle(thread.handle ?? "");
        if (!recipient) continue;
        for (const msg of thread.messages) {
          if (cancelled) return;
          if (msg.direction !== "sent" || msg.relay !== "pending-keys") continue;
          if (sendingIdsRef.current.has(msg.id)) continue;
          if (Date.now() - msg.at < 4000) continue;
          if (inflight.has(msg.id)) continue;
          inflight.add(msg.id);
          try {
            const queued =
              msg.fileName && msg.fileUrl
                ? await (async () => {
                    const blob = await fetch(msg.fileUrl as string).then((r) =>
                      r.blob(),
                    );
                    return queueMailboxFile({
                      sender: slug,
                      recipient,
                      sessionKey: thread.sessionKey,
                      file: new File([blob], msg.fileName as string, {
                        type: blob.type,
                      }),
                    });
                  })()
                : await queueMailboxMessage({
                    sender: slug,
                    recipient,
                    sessionKey: thread.sessionKey,
                    body: msg.body,
                  });
            if (cancelled || !queued.ok) {
              inflight.delete(msg.id);
              continue;
            }
            setThreads((rows) =>
              rows.map((row) =>
                row.id === thread.id
                  ? {
                      ...row,
                      messages: row.messages.map((item) =>
                        item.id === msg.id
                          ? {
                              ...item,
                              pendingId: queued.id,
                              relay: "mailbox" as const,
                            }
                          : item,
                      ),
                    }
                  : row,
              ),
            );
          } catch {
            inflight.delete(msg.id);
          }
        }
      }
    }
    const timer = window.setInterval(() => void flush(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [guest, slug, hasPendingKeys, shareRoomSenderKey]);

  useEffect(() => {
    if (guest || !hasMailboxQueue) return;
    let cancelled = false;
    async function poll() {
      const live = await listSentMailboxIds(slug).catch(() => new Set<string>());
      if (cancelled) return;
      setThreads((rows) =>
        rows.map((row) => ({
          ...row,
          messages: row.messages.map((msg) => {
            if (msg.direction !== "sent" || msg.relay !== "mailbox") return msg;
            if (msg.pendingId && live.has(msg.pendingId)) return msg;
            if (!msg.pendingId) return msg;
            return { ...msg, relay: "purged" as const };
          }),
        })),
      );
    }
    void poll();
    const timer = window.setInterval(() => void poll(), 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [guest, slug, hasMailboxQueue]);

  const renameThread = useCallback((id: string, name: string) => {
    const next = name.trim();
    if (!next || !id) return;
    setLocalChatTitle(slug, id, next);
  }, [slug]);

  const renameActive = useCallback(
    (name: string) => {
      if (!activeId) return;
      renameThread(activeId, name);
    },
    [activeId, renameThread],
  );

  const pinThread = useCallback((id: string, pinned?: boolean) => {
    setThreads((rows) =>
      rows.map((row) =>
        row.id === id
          ? { ...row, pinned: pinned ?? !row.pinned }
          : row,
      ),
    );
  }, []);

  const patchThread = useCallback((id: string, patch: Partial<DmThread>) => {
    if (!id) return;
    setThreads((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch, id: row.id } : row)),
    );
  }, []);

  const deleteThread = useCallback(
    (id: string) => {
      setThreads((rows) => {
        const next = rows.filter((row) => row.id !== id);
        if (activeId === id) {
          const fallback = next[0]?.id ?? null;
          setActiveId(fallback);
        }
        return next;
      });
    },
    [activeId, slug],
  );

  const rotateActiveKeys = useCallback(() => {
    if (!activeId) return;
    const current = threadsRef.current.find((row) => row.id === activeId);
    const sessionKey = generateSessionKey();
    const shareLink = sessionShareLink(sessionKey);
    setThreads((rows) =>
      rows.map((row) =>
        row.id === activeId ? { ...row, sessionKey } : row,
      ),
    );
    setDraft({ sessionKey, shareLink });
    setCopied(false);
    syncChatUrl({ sessionKey, roomKind: current?.roomKind });
  }, [activeId]);

  const revokeActiveShareLink = useCallback(() => {
    rotateActiveKeys();
  }, [rotateActiveKeys]);

  const purgeActiveHistory = useCallback(() => {
    if (!activeId) return;
    setThreads((rows) =>
      rows.map((row) =>
        row.id === activeId
          ? { ...row, messages: [nodeGreetingMessage(row.sessionKey)] }
          : row,
      ),
    );
  }, [activeId]);

  const inviteHandle = useCallback(
    (raw: string) => {
      const handle = raw.replace(/^@/, "").trim().toLowerCase();
      if (!handle || !activeId) return;
      const current = threadsRef.current.find((row) => row.id === activeId);
      setThreads((rows) =>
        rows.map((row) => {
          if (row.id !== activeId) return row;
          if (!isChatOwner(row, slug)) return row;
          return addMembersToChat(row, [handle], slug);
        }),
      );
      if (current && threadIsRoom(current)) {
        const next = addMembersToChat(current, [handle], slug);
        void shareRoomSenderKey(next, [handle]);
      }
    },
    [activeId, shareRoomSenderKey, slug],
  );

  const selectThread = useCallback((id: string | null) => {
    setActiveId(id);
    if (!id) return;
    setThreads((rows) =>
      rows.map((row) => (row.id === id ? withThreadRead(row) : row)),
    );
  }, []);

  const active = useMemo(
    () => threads.find((row) => row.id === activeId) ?? null,
    [threads, activeId],
  );

  const value = useMemo(
    () => ({
      threads: [...threads].sort((a, b) => {
        if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
        const at = a.messages.at(-1)?.at ?? a.createdAt;
        const bt = b.messages.at(-1)?.at ?? b.createdAt;
        return bt - at;
      }),
      activeId,
      active,
      draft,
      copied,
      joinError,
      roomReady,
      setActiveId: selectThread,
      openNewMessage,
      generateChatLink,
      startEncryptedChat,
      dismissRoomReady,
      copyChatLink,
      joinPeer,
      sendChat,
      editMessage,
      deleteMessages,
      pinMessage,
      applyRemotePin,
      forwardMessages,
      receivePeerChat,
      renameActive,
      renameThread,
      pinThread,
      patchThread,
      deleteThread,
      rotateActiveKeys,
      revokeActiveShareLink,
      purgeActiveHistory,
      inviteHandle,
      createRoom,
      guest,
      slug,
    }),
    [
      threads,
      activeId,
      active,
      draft,
      copied,
      joinError,
      roomReady,
      selectThread,
      openNewMessage,
      generateChatLink,
      startEncryptedChat,
      dismissRoomReady,
      copyChatLink,
      joinPeer,
      sendChat,
      editMessage,
      deleteMessages,
      pinMessage,
      applyRemotePin,
      forwardMessages,
      receivePeerChat,
      renameActive,
      renameThread,
      pinThread,
      patchThread,
      deleteThread,
      rotateActiveKeys,
      revokeActiveShareLink,
      purgeActiveHistory,
      inviteHandle,
      createRoom,
      guest,
      slug,
    ],
  );

  return <DmContext.Provider value={value}>{children}</DmContext.Provider>;
}

export function useDm(): DmContextValue {
  const ctx = useContext(DmContext);
  if (!ctx) throw new Error("useDm must be used inside DmProvider");
  return ctx;
}

export function threadPreview(thread: DmThread): string {
  return lastSnippet(thread);
}
