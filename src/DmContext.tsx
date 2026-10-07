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
  teamChatSessionKey,
  writeLastActiveChatId,
  nodeGreetingMessage,
  type ChatFocusDetail,
  type DmMessage,
  type DmThread,
  showCopyLinkToast,
} from "./dmSessions";
import {
  fetchAndPurgeMailbox,
  listSentMailboxIds,
  queueMailboxFile,
  queueMailboxMessage,
} from "./mailbox";
import {
  addMembersToChat,
  createDirectChat,
  createGroupNode,
  threadIsGroup,
  type GroupAvatarChoice,
} from "./chatController";
import {
  migrateChatThreads,
  nextChatSeq,
  upsertChatGuest,
  createEmptyUntitledThread,
  isFounderThread,
  isChatOwner,
  listChatGuests,
  normalizeChatGuestHandle,
} from "./chatService";
import {
  ensureFounderSidebarNode,
  withThreadRead,
} from "./useSidebarStore";
import { syncChatIndex } from "./searchIndex";
import {
  applyMoveMembersToTeam,
  evaluateMoveToTeam,
  joinLinkSeatError,
  loadJoinOrganizationSeats,
  type TeamMovePreview,
} from "./teamService";
import {
  addTeamChat,
  ensureTeam,
  findTeam,
  removeTeamChat,
  revokeTeamMember,
  tryAddTeamMember,
} from "./teamContainer";
import { useWorkspacesMaybe } from "./WorkspaceContext";
import { isProPlan } from "./workspaces";
import { openUpgradeModal } from "./useUpgradeModalStore";
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
  startGroupChat: (
    name: string,
    memberHandles: string[],
    avatar?: GroupAvatarChoice,
    sessionKey?: string,
  ) => string;
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
    opts?: { mailbox?: boolean; file?: File; replyToMessageId?: string },
  ) => Promise<void>;
  renameActive: (name: string) => void;
  renameThread: (id: string, name: string) => void;
  pinThread: (id: string, pinned?: boolean) => void;
  patchThread: (id: string, patch: Partial<DmThread>) => void;
  deleteThread: (id: string) => void;
  rotateActiveKeys: () => void;
  revokeActiveShareLink: () => void;
  purgeActiveHistory: () => void;
  inviteHandle: (handle: string) => void;
  bindChatToTeam: (
    chatId: string,
    teamId?: string | null,
  ) => { ok: boolean; preview: TeamMovePreview | null };
  offboardTeamMember: (teamId: string, handle: string) => void;
  guest: boolean;
  slug: string;
  openTeamChat: (
    workspace: { id: string; name: string; slug?: string },
    channel?: { id: string; name: string; slug?: string } | null,
  ) => void;
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
  const workspaces = useWorkspacesMaybe();
  const pro = isProPlan(workspaces?.tier ?? "free");

  useEffect(() => {
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
  }, [slug]);

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
      const seats = await loadJoinOrganizationSeats();
      if (cancelled) return;
      const existing = threadsRef.current.find((row) => row.sessionKey === key);
      const target = existing ?? findStoredThreadBySessionKey(key);
      const blocked = joinLinkSeatError(target, seats, slug);
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

  const startGroupChat = useCallback(
    (
      name: string,
      memberHandles: string[],
      avatar?: GroupAvatarChoice,
      sessionKey?: string,
    ) => {
      const thread = createGroupNode(
        slug,
        threadsRef.current,
        name,
        memberHandles,
        avatar,
        sessionKey,
      );
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
    },
    [slug],
  );

  const openTeamChat = useCallback(
    (
      workspace: { id: string; name: string; slug?: string },
      channel?: { id: string; name: string; slug?: string } | null,
    ) => {
      const sessionKey = teamChatSessionKey(workspace.id, channel?.id);
      const shareLink = sessionShareLink(sessionKey);
      const handle = channel?.slug || workspace.slug || "team";
      setThreads((rows) => {
        const existing = rows.find(
          (row) =>
            row.sessionKey === sessionKey ||
            (row.workspaceId === workspace.id &&
              (row.channelId ?? null) === (channel?.id ?? null)),
        );
        if (existing) {
          const seq = existing.seq ?? nextChatSeq(slug, rows);
          const next = {
            ...existing,
            sessionKey,
            seq,
            displayName: "",
            renamed: false,
            handle,
            roomKind: "team" as const,
            workspaceId: workspace.id,
            channelId: channel?.id,
            isGroup: false,
          };
          setActiveId(next.id);
          setDraft({ sessionKey, shareLink });
          setRoomReady(false);
          setCopied(false);
          setJoinError(null);
          return rows.map((row) => (row.id === existing.id ? next : row));
        }
        const seq = nextChatSeq(slug, rows);
        const thread: DmThread = {
          ...newThread(sessionKey, false, "team", undefined, seq),
          handle,
          createdBy: slug,
          workspaceId: workspace.id,
          channelId: channel?.id,
          isGroup: false,
        };
        setActiveId(thread.id);
        setDraft({ sessionKey, shareLink });
        setRoomReady(false);
        setCopied(false);
        setJoinError(null);
        return [thread, ...rows];
      });
      if (typeof window !== "undefined") {
        syncChatUrl({ sessionKey, roomKind: "team" });
      }
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
      shareLink: sessionShareLink(row.sessionKey),
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
    const link =
      draft?.shareLink ??
      (row ? sessionShareLink(row.sessionKey) : null);
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      showCopyLinkToast(threadIsGroup(row) ? "group" : "chat");
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
    const existing = threadsRef.current.find((row) => row.sessionKey === key);
    const target = existing ?? findStoredThreadBySessionKey(key);

    function commitJoin() {
      setJoinError(null);
      setThreads((rows) => {
        const found = rows.find((item) => item.sessionKey === key);
        if (found) {
          setActiveId(found.id);
          return rows.map((row) =>
            row.id === found.id
              ? { ...row, connectionState: "CONNECTED" as const }
              : row,
          );
        }
        const thread = newThread(
          key,
          true,
          undefined,
          undefined,
          nextChatSeq(slug, rows),
        );
        setActiveId(thread.id);
        return [thread, ...rows];
      });
    }

    void loadJoinOrganizationSeats()
      .then((seats) => {
        const blocked = joinLinkSeatError(target, seats, slug, pro);
        if (blocked) {
          setJoinError(blocked);
          return;
        }
        commitJoin();
      })
      .catch(() => {
        const blocked = joinLinkSeatError(
          target,
          { seatsUsed: 1, maxSeats: 1 },
          slug,
          pro,
        );
        if (blocked) {
          setJoinError(blocked);
          return;
        }
        commitJoin();
      });
    return true;
  }, [slug, pro]);

  const sendChat = useCallback(
    async (body: string, opts?: { mailbox?: boolean; file?: File; replyToMessageId?: string }) => {
      const file = opts?.file;
      const text = body.trim() || file?.name || "";
      if ((!text && !file) || !activeId) return;
      const localId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const fileUrl = file ? URL.createObjectURL(file) : undefined;
      const thread = threadsRef.current.find((row) => row.id === activeId);
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
        relay: opts?.mailbox ? "mailbox" : undefined,
        replyToMessageId: quoted?.id,
        replyToSnippet: snippet || undefined,
      };
      setThreads((rows) =>
        rows.map((row) =>
          row.id === activeId
            ? { ...row, messages: [...row.messages, optimistic] }
            : row,
        ),
      );
      if (!opts?.mailbox || guest) return;
      const recipient =
        thread?.peerUsername ||
        peerUsernameFromHandle(thread?.handle ?? "");
      const pendingId =
        recipient && thread
          ? file
            ? await queueMailboxFile({
                sender: slug,
                recipient,
                sessionKey: thread.sessionKey,
                file,
              }).catch(() => null)
            : await queueMailboxMessage({
                sender: slug,
                recipient,
                sessionKey: thread.sessionKey,
                body: text,
              }).catch(() => null)
          : null;
      if (!pendingId) {
        setThreads((rows) =>
          rows.map((row) =>
            row.id === activeId
              ? {
                  ...row,
                  messages: row.messages.map((msg) =>
                    msg.id === localId ? { ...msg, relay: undefined } : msg,
                  ),
                }
              : row,
          ),
        );
        return;
      }
      setThreads((rows) =>
        rows.map((row) =>
          row.id === activeId
            ? {
                ...row,
                messages: row.messages.map((msg) =>
                  msg.id === localId ? { ...msg, pendingId } : msg,
                ),
              }
            : row,
        ),
      );
    },
    [activeId, guest, slug],
  );

  const ingestMailbox = useCallback(async () => {
    const incoming = await fetchAndPurgeMailbox(slug).catch(() => []);
    if (!incoming.length) return;
    setThreads((rows) => {
      let next = rows;
      for (const item of incoming) {
        const key = normalizeSessionKey(item.sessionKey) ?? item.sessionKey;
        const message: DmMessage = {
          id: `mb-${item.id}`,
          direction: "received",
          body: item.body,
          at: item.at,
          e2ee: true,
          pendingId: item.id,
          fileName: item.fileName,
          fileUrl: item.fileUrl,
          fileSize: item.fileSize,
        };
        const existing = next.find((row) => row.sessionKey === key);
        if (existing) {
          if (existing.messages.some((msg) => msg.pendingId === item.id)) {
            continue;
          }
          next = next.map((row) =>
            row.sessionKey === key
              ? { ...row, messages: [...row.messages, message] }
              : row,
          );
        } else {
          next = [
            {
              ...newThread(
                key,
                true,
                "direct",
                item.sender,
                nextChatSeq(slug, next),
              ),
              messages: [
                nodeGreetingMessage(key),
                message,
              ],
            },
            ...next,
          ];
        }
      }
      return next;
    });
  }, [slug]);

  useEffect(() => {
    if (guest) return;
    void ingestMailbox();
    const timer = window.setInterval(() => void ingestMailbox(), 12000);
    return () => window.clearInterval(timer);
  }, [guest, ingestMailbox]);

  const hasMailboxQueue = threads.some((row) =>
    row.messages.some(
      (msg) => msg.direction === "sent" && msg.relay === "mailbox",
    ),
  );

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
      removeTeamChat(slug, id);
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
      setThreads((rows) =>
        rows.map((row) => {
          if (row.id !== activeId) return row;
          if (!isChatOwner(row, slug)) return row;
          if (row.teamId) {
            const result = tryAddTeamMember(slug, handle, pro, row.teamId);
            if (result.blocked) {
              openUpgradeModal("team");
              return row;
            }
          }
          return addMembersToChat(row, [handle], slug);
        }),
      );
    },
    [activeId, slug, pro],
  );

  const bindChatToTeam = useCallback(
    (chatId: string, teamId?: string | null) => {
      if (!chatId) return { ok: false, preview: null };
      const thread = threadsRef.current.find((row) => row.id === chatId) ?? null;
      const team = teamId
        ? (findTeam(slug, teamId) ?? ensureTeam(slug))
        : ensureTeam(slug);
      const preview = evaluateMoveToTeam(slug, thread, team.id, pro);
      if (!preview) return { ok: false, preview: null };
      if (preview.blocked) return { ok: false, preview };
      applyMoveMembersToTeam(slug, preview);
      const nextTeam = findTeam(slug, team.id) ?? team;
      const handles = nextTeam.members.map((row) => row.handle);
      setThreads((rows) =>
        rows.map((row) => {
          if (row.id !== chatId) return row;
          const next = { ...row, teamId: nextTeam.id };
          return addMembersToChat(next, handles, slug);
        }),
      );
      addTeamChat(slug, chatId, nextTeam.id);
      return { ok: true, preview };
    },
    [slug, pro],
  );

  const offboardTeamMember = useCallback(
    (teamId: string, handle: string) => {
      const id = normalizeChatGuestHandle(handle);
      if (!teamId || !id) return;
      const { chatIds } = revokeTeamMember(slug, teamId, id);
      setThreads((rows) =>
        rows.map((row) => {
          if (row.teamId !== teamId && !chatIds.includes(row.id)) return row;
          const guests = listChatGuests(row).filter(
            (guest) => normalizeChatGuestHandle(guest.handle) !== id,
          );
          const sessionKey = generateSessionKey();
          return {
            ...row,
            sessionKey,
            chatGuests: guests,
            invitedHandles: guests.map((guest) => guest.handle),
            peerUsername:
              normalizeChatGuestHandle(row.peerUsername ?? "") === id
                ? guests[0]?.handle
                : row.peerUsername,
          };
        }),
      );
    },
    [slug],
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
      startGroupChat,
      generateChatLink,
      startEncryptedChat,
      dismissRoomReady,
      copyChatLink,
      joinPeer,
      sendChat,
      renameActive,
      renameThread,
      pinThread,
      patchThread,
      deleteThread,
      rotateActiveKeys,
      revokeActiveShareLink,
      purgeActiveHistory,
      inviteHandle,
      bindChatToTeam,
      offboardTeamMember,
      guest,
      slug,
      openTeamChat,
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
      startGroupChat,
      generateChatLink,
      startEncryptedChat,
      dismissRoomReady,
      copyChatLink,
      joinPeer,
      sendChat,
      renameActive,
      renameThread,
      pinThread,
      patchThread,
      deleteThread,
      rotateActiveKeys,
      revokeActiveShareLink,
      purgeActiveHistory,
      inviteHandle,
      bindChatToTeam,
      offboardTeamMember,
      guest,
      slug,
      openTeamChat,
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
