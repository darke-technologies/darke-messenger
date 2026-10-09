import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChatHeader } from "./ChatHeader";
import { ChatInput } from "./ChatInput";
import { ChatMessage, type ChatPerson } from "./ChatMessage";
import { InviteModal } from "./InviteModal";
import { MembersTab } from "./MembersTab";
import { ConversationSettings } from "./ConversationSettings";
import { NodeTyping } from "./NodeTyping";
import {
  chatDayKey,
  chatMemberCount,
  chatOwnerHandle,
  formatSlackDayLabel,
  isFounderThread,
  isNodeGreeting,
  listChatMemberHandles,
  messageHasDisappeared,
  FOUNDER_DISPLAY,
  FOUNDER_HANDLE,
  markNodeGreetingRevealed,
  nodeFingerprint,
  nodeGreetingAlreadyRevealed,
  sidebarPeerHandle,
  messageBubbleCluster,
} from "./chatService";
import {
  CHAT_FOCUS_EVENT,
  sessionShareLink,
  type ChatFocusDetail,
  type DmMessage,
} from "./dmSessions";
import { useChat } from "./useChat";
import { usePeerChannel } from "./usePeerChannel";
import { useTypingSignal } from "./useTypingSignal";
import { TypingBar } from "./TypingBar";
import { loadMyProfile, loadProfileByUsername } from "./profile";
import { rememberPerson, usePersonDirectory } from "./personDirectory";
import { memberDisplayName } from "./getChatTitle";
import { isProPlan } from "./workspaces";
import { useWorkspacesMaybe } from "./WorkspaceContext";
import { listTeams } from "./teamContainer";
import { threadIsGroup } from "./chatController";
import { TeamMoveSeatModal } from "./TeamMoveSeatModal";
import type { TeamMovePreview } from "./teamService";
import { blockPeer, isPeerBlocked } from "./blockedPeers";
import { IconSearch } from "./icons";
import { THEME_CHANGE } from "./theme";
import {
  hasOpenSignalSession,
  initializeX3DHSession,
  isSignalV2Ciphertext,
  unwrapTextPayload,
  wrapTextPayload,
} from "./lib/crypto/signal";

export function ChatView() {
  const {
    active,
    sendChat,
    receivePeerChat,
    copyChatLink,
    copied,
    slug,
    tab,
    setTab,
    title,
    renameActive,
    inviteHandle,
    bindChatToTeam,
    canInvite,
    joinError,
    deleteThread,
  } = useChat();
  const channel = usePeerChannel(
    active?.sessionKey ?? null,
    active?.connectionState ?? "WAITING FOR PEER",
    (
      (active ? sidebarPeerHandle(active, slug) : null) ||
      active?.peerUsername ||
      active?.handle ||
      ""
    )
      .replace(/^@/, "")
      .trim()
      .toLowerCase() || null,
    slug,
  );
  const live = channel.connectionState;
  const connected = live === "CONNECTED";
  const p2pLive = channel.p2pLive;
  const { typingUsers, notifyTyping, stopTyping } = useTypingSignal({
    channel,
    handle: slug,
    connected,
  });
  const [composer, setComposer] = useState("");
  const [hitId, setHitId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<DmMessage | null>(null);
  const [nodeTyping, setNodeTyping] = useState(false);
  const [inviteRequested, setInviteRequested] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [moveBlock, setMoveBlock] = useState<TeamMovePreview | null>(null);
  const workspaces = useWorkspacesMaybe();
  const pro = isProPlan(workspaces?.tier ?? "free");
  const planLabel = pro ? "Premium" : "Free";
  const moveTeams = listTeams(slug);
  const [me, setMe] = useState<ChatPerson>({
    handle: slug,
    display: slug,
    avatar: null,
  });
  const [peer, setPeer] = useState<ChatPerson>({
    handle: "peer",
    display: "Peer",
    avatar: null,
  });
  const [signalSession, setSignalSession] = useState(false);
  const [dayMenu, setDayMenu] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [chatQuery, setChatQuery] = useState("");
  const [blockedTick, setBlockedTick] = useState(0);
  const streamRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const roster = usePersonDirectory(
    active ? listChatMemberHandles(active, slug) : [slug],
  );

  useEffect(() => {
    setReplyTo(null);
    setInviteRequested(false);
    setDayMenu(null);
    setSearchOpen(false);
    setChatQuery("");
  }, [active?.id]);

  useEffect(() => {
    if (tab !== "messages" || !active) return;
    const el = areaRef.current;
    if (!el || el.disabled) return;
    requestAnimationFrame(() => el.focus());
  }, [active?.id, tab]);

  useEffect(() => {
    let cancelled = false;
    void loadMyProfile()
      .then((row) => {
        if (cancelled || !row) return;
        rememberPerson(row);
        setMe({
          handle: row.username || slug,
          display: row.display_name?.trim() || row.username || slug,
          avatar: row.avatar_url,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setMe({ handle: slug, display: slug, avatar: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    const founderThread = Boolean(active && isFounderThread(active));
    const handle = founderThread
      ? FOUNDER_HANDLE
      : (active?.peerUsername || active?.handle || "peer").replace(/^@/, "");
    const display = founderThread
      ? FOUNDER_DISPLAY
      : active?.peerUsername || active?.handle || "Peer";
    setPeer({ handle, display, avatar: null });
    if (!active || !handle || handle === "peer") return;
    let cancelled = false;
    void loadProfileByUsername(handle)
      .then((row) => {
        if (cancelled || !row) return;
        rememberPerson(row);
        setPeer({
          handle: row.username || handle,
          display: row.display_name?.trim() || row.username || display,
          avatar: row.avatar_url,
        });
      })
      .catch(() => {
        /* keep handle fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [active?.id, active?.peerUsername, active?.handle]);

  useEffect(() => {
    if (!active) {
      setNodeTyping(false);
      return;
    }
    const greeting = active.messages.some(isNodeGreeting);
    const hasUser = active.messages.some((msg) => !isNodeGreeting(msg));
    const fresh =
      greeting &&
      !hasUser &&
      !nodeGreetingAlreadyRevealed(active.id) &&
      Date.now() - active.createdAt < 12_000;
    if (!fresh) {
      setNodeTyping(false);
      if (greeting) markNodeGreetingRevealed(active.id);
      return;
    }
    markNodeGreetingRevealed(active.id);
    setNodeTyping(true);
    const timer = window.setTimeout(() => setNodeTyping(false), 1000);
    return () => window.clearTimeout(timer);
  }, [active?.id]);

  useEffect(() => {
    const node = streamRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [active?.id, active?.messages.length, tab]);

  useEffect(() => {
    const onFocus = (event: Event) => {
      const detail = (event as CustomEvent<ChatFocusDetail>).detail;
      if (!detail?.chatId) return;
      setTab("messages");
      setHitId(detail.messageId || null);
    };
    window.addEventListener(CHAT_FOCUS_EVENT, onFocus);
    return () => window.removeEventListener(CHAT_FOCUS_EVENT, onFocus);
  }, [setTab]);

  useEffect(() => {
    if (!hitId || tab !== "messages") return;
    const node = streamRef.current?.querySelector(
      `[data-msg-id="${CSS.escape(hitId)}"]`,
    );
    node?.scrollIntoView({ block: "center" });
  }, [hitId, active?.id, tab]);

  const signalPeer = useMemo(() => {
    if (!active || threadIsGroup(active)) return "";
    return (
      sidebarPeerHandle(active, slug) ||
      (active.peerUsername || active.handle || "")
        .replace(/^@/, "")
        .trim()
        .toLowerCase()
    );
  }, [active, slug]);

  useEffect(() => {
    let cancelled = false;
    if (!signalPeer) {
      setSignalSession(false);
      return;
    }
    void (async () => {
      await initializeX3DHSession(signalPeer);
      const live = await hasOpenSignalSession(signalPeer);
      if (!cancelled) setSignalSession(live);
    })();
    return () => {
      cancelled = true;
    };
  }, [signalPeer, connected, active?.id]);

  useEffect(() => {
    return channel.onMessage((payload, replyToMessageId) => {
      void (async () => {
        if (!signalPeer || !isSignalV2Ciphertext(payload)) return;
        const text = await unwrapTextPayload(signalPeer, payload);
        if (!text) return;
        receivePeerChat(text, { replyToMessageId });
        setSignalSession(await hasOpenSignalSession(signalPeer));
      })();
    });
  }, [channel, receivePeerChat, signalPeer]);

  function send(e?: FormEvent) {
    e?.preventDefault();
    const text = composer.trim();
    if (!text || !active) return;
    const replyId = replyTo?.id;
    if (p2pLive && signalPeer) {
      void (async () => {
        const payload = await wrapTextPayload(signalPeer, text);
        if (!payload || !isSignalV2Ciphertext(payload)) return;
        channel.sendMessage(payload, replyId);
        setSignalSession(await hasOpenSignalSession(signalPeer));
      })();
    }
    void sendChat(text, {
      mailbox: !p2pLive,
      replyToMessageId: replyId,
    });
    stopTyping();
    setComposer("");
    setReplyTo(null);
    requestAnimationFrame(() => {
      if (areaRef.current) {
        areaRef.current.style.height = "auto";
      }
    });
  }

  function attachFile(file: File | undefined) {
    if (!file || !active) return;
    void sendChat("", { mailbox: !p2pLive, file });
  }

  const youFp = nodeFingerprint(`${active?.sessionKey ?? ""}:you:${slug}`);
  const peerFp = nodeFingerprint(
    `${active?.sessionKey ?? ""}:peer:${active?.handle ?? "peer"}`,
  );
  const ownerHandle = chatOwnerHandle(active, slug);
  const isGroup = Boolean(active && threadIsGroup(active));
  const isDirect = Boolean(active && !isGroup);
  const viewTab = isDirect && tab === "members" ? "messages" : tab;
  const headerTitle = isDirect
    ? peer.display?.trim() || peer.handle || title
    : title;
  const peerBlocked =
    isDirect &&
    Boolean(peer.handle) &&
    peer.handle !== "peer" &&
    isPeerBlocked(slug, peer.handle);
  void blockedTick;
  const searchHits = useMemo(() => {
    const q = chatQuery.trim().toLowerCase();
    if (q.length < 2 || !active) return [];
    return active.messages.filter((msg) =>
      (msg.body || msg.fileName || "").toLowerCase().includes(q),
    );
  }, [active, chatQuery]);

  useLayoutEffect(() => {
    const root = streamRef.current;
    if (!root || viewTab !== "messages") return;

    const paint = () => {
      const box = root.getBoundingClientRect();
      const span = Math.max(box.height, 1);
      root.querySelectorAll<HTMLElement>(".dm-bubble.is-sent").forEach((el) => {
        const top = el.getBoundingClientRect().top;
        el.style.backgroundImage =
          "linear-gradient(180deg, var(--hud-bubble-from) 0%, var(--hud-bubble-to) 100%)";
        el.style.backgroundRepeat = "no-repeat";
        el.style.backgroundSize = `100% ${span}px`;
        el.style.backgroundPosition = `center ${box.top - top}px`;
      });
    };

    paint();
    root.addEventListener("scroll", paint, { passive: true });
    window.addEventListener("resize", paint);
    window.addEventListener(THEME_CHANGE, paint);
    const ro = new ResizeObserver(paint);
    ro.observe(root);
    return () => {
      root.removeEventListener("scroll", paint);
      window.removeEventListener("resize", paint);
      window.removeEventListener(THEME_CHANGE, paint);
      ro.disconnect();
    };
  }, [active?.id, active?.messages.length, viewTab]);

  useEffect(() => {
    if (!searchOpen || chatQuery.trim().length < 2) return;
    const hit = searchHits[searchHits.length - 1];
    if (!hit) return;
    setHitId(hit.id);
  }, [searchOpen, chatQuery, searchHits]);
  const visibleMessages = (active?.messages ?? []).filter(
    (msg) => !active || !messageHasDisappeared(msg, active),
  );
  const userMessageCount = visibleMessages.filter(
    (msg) => !isNodeGreeting(msg),
  ).length;
  const showIceNudge = Boolean(active && canInvite && userMessageCount === 0);
  const iceChips = !showIceNudge
    ? []
    : threadIsGroup(active)
      ? ["👋 Welcome everyone!", "🚀 Group set up and ready to go."]
      : [
          "⚡ Hey! DARKE is better than Signal. Let's chat here.",
          "👋 Hey!",
          "💬 What's up?",
        ];
  const dayOptions = useMemo(() => {
    const seen = new Set<string>();
    const rows: { key: string; label: string }[] = [];
    for (const msg of visibleMessages) {
      const key = chatDayKey(msg.at);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ key, label: formatSlackDayLabel(msg.at) });
    }
    return rows;
  }, [visibleMessages]);

  function jumpToDay(key: string) {
    setDayMenu(null);
    const node = streamRef.current?.querySelector(
      `[data-day="${CSS.escape(key)}"]`,
    );
    node?.scrollIntoView({ block: "start" });
  }

  if (viewTab === "settings" && active) {
    return (
      <section className="dm-pane">
        <ConversationSettings
          thread={active}
          slug={slug}
          title={title}
          onBack={() => setTab("messages")}
        />
      </section>
    );
  }

  return (
    <section className={`dm-pane${isDirect ? " is-direct" : ""}`}>
      <ChatHeader
        title={headerTitle}
        subtitle={
          isGroup && active
            ? `${chatMemberCount(active, slug)} seats · ${planLabel} · ${listChatMemberHandles(active, slug)
                .map((h) => {
                  const id = h.replace(/^@/, "").trim().toLowerCase();
                  if (id === slug.replace(/^@/, "").trim().toLowerCase()) {
                    return "You";
                  }
                  return (
                    roster.person(h)?.displayName ||
                    memberDisplayName(h) ||
                    h
                  );
                })
                .join(", ")}`
            : undefined
        }
        tab={viewTab}
        onTab={setTab}
        onRename={renameActive}
        canRename={Boolean(active)}
        memberCount={chatMemberCount(active, slug)}
        handleBadge={undefined}
        teams={moveTeams}
        isGroup={isGroup}
        signalSession={signalSession}
        peerAvatar={peer.avatar}
        peerHandle={peer.handle}
        onSearch={() => setSearchOpen((open) => !open)}
        onChatSettings={() => setTab("settings")}
        onBlock={() => {
          if (!peer.handle || peer.handle === "peer") return;
          blockPeer(slug, peer.handle);
          setBlockedTick((n) => n + 1);
        }}
        onDelete={() => {
          if (active) deleteThread(active.id);
        }}
        onMoveToTeam={
          isGroup && active && !active.teamId
            ? (teamId) => {
                const result = bindChatToTeam(active.id, teamId);
                if (!result.ok && result.preview?.blocked) {
                  setMoveBlock(result.preview);
                }
              }
            : undefined
        }
      />

      {isDirect && searchOpen ? (
        <div className="chat-inline-search">
          <IconSearch className="chat-inline-search-icon" />
          <input
            value={chatQuery}
            onChange={(e) => setChatQuery(e.target.value)}
            placeholder="Search this chat"
            aria-label="Search this chat"
            autoFocus
          />
          {searchHits.length > 0 ? (
            <span className="chat-inline-search-count">{searchHits.length}</span>
          ) : null}
        </div>
      ) : null}

      {viewTab === "members" && isGroup ? (
        <MembersTab
          slug={slug}
          active={active}
          connected={connected}
          live={live}
          youFp={youFp}
          peerFp={peerFp}
          onAdd={inviteHandle}
          canInvite={canInvite}
          requested={inviteRequested}
          onRequest={() => setInviteRequested(true)}
        />
      ) : null}

      {viewTab === "messages" ? (
        <>
          <div className="dm-stream is-feed" ref={streamRef}>
            {joinError ? (
              <p className="error" role="alert">
                {joinError}
              </p>
            ) : null}
            {!active ? (
              <p className="dm-stream-empty">Opening your latest chat room.</p>
            ) : null}
            {nodeTyping ? <NodeTyping /> : null}
            {visibleMessages.map((msg, index) => {
              const day = chatDayKey(msg.at);
              const prev = visibleMessages[index - 1];
              const showDay = !prev || chatDayKey(prev.at) !== day;
              const mine = msg.direction === "sent";
              const cluster = isDirect
                ? messageBubbleCluster(visibleMessages, index)
                : undefined;
              return (
                <div key={msg.id}>
                  {showDay ? (
                    <ChatDayRule
                      dayKey={day}
                      label={formatSlackDayLabel(msg.at)}
                      days={dayOptions}
                      open={dayMenu === day}
                      onToggle={() =>
                        setDayMenu((curr) => (curr === day ? null : day))
                      }
                      onJump={jumpToDay}
                    />
                  ) : null}
                  <div
                    className={`dm-msg-wrap${mine ? " is-mine" : " is-theirs"}${
                      cluster
                        ? cluster.isLast
                          ? " is-break"
                          : " is-tight"
                        : ""
                    }`}
                  >
                  <ChatMessage
                    msg={msg}
                    you={me}
                    peer={peer}
                    isGroup={isGroup}
                    cluster={cluster}
                    isAdmin={
                      isGroup &&
                      msg.kind !== "system" &&
                      ownerHandle ===
                        (msg.direction === "sent"
                          ? me.handle
                          : peer.handle
                        )
                          .replace(/^@/, "")
                          .trim()
                          .toLowerCase()
                    }
                    quoted={
                      msg.replyToMessageId
                        ? (active?.messages.find(
                            (row) => row.id === msg.replyToMessageId,
                          ) ?? null)
                        : null
                    }
                    highlighted={
                      hitId === msg.id ||
                      (chatQuery.trim().length >= 2 &&
                        (msg.body || "")
                          .toLowerCase()
                          .includes(chatQuery.trim().toLowerCase()))
                    }
                    connected={connected}
                    canInvite={canInvite}
                    onAddPeople={() => setInviteOpen(true)}
                    onReply={(row) => {
                      setReplyTo(row);
                      requestAnimationFrame(() => areaRef.current?.focus());
                    }}
                    onOpenQuote={(id) => {
                      setHitId(id);
                      const node = streamRef.current?.querySelector(
                        `[data-msg-id="${CSS.escape(id)}"]`,
                      );
                      node?.scrollIntoView({ block: "center" });
                    }}
                  />
                  </div>
                </div>
              );
            })}
          </div>

          <TypingBar handles={typingUsers} />
          {showIceNudge ? (
            <p className="dm-ice-nudge" role="status">
              💡 Break the ice! Send the first message so your peer or team
              isn&apos;t greeting an empty room.
            </p>
          ) : null}
          {iceChips.length > 0 ? (
            <div className="dm-ice-chips" role="group" aria-label="Quick first messages">
              {iceChips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className="dm-ice-chip"
                  onClick={() => {
                    setComposer(chip);
                    requestAnimationFrame(() => areaRef.current?.focus());
                  }}
                >
                  {chip}
                </button>
              ))}
            </div>
          ) : null}
          {peerBlocked ? (
            <p className="dm-blocked-note" role="status">
              You blocked this person. You can still read this chat.
            </p>
          ) : null}
          <ChatInput
            value={composer}
            onChange={setComposer}
            onSubmit={send}
            onTyping={notifyTyping}
            onStopTyping={stopTyping}
            disabled={!active || peerBlocked}
            placeholder={`Message ${headerTitle || "chat"}`}
            replyLabel={
              replyTo
                ? (replyTo.fileName || replyTo.body)
                    .replace(/\s+/g, " ")
                    .trim()
                    .slice(0, 80) || "message"
                : null
            }
            onCancelReply={() => setReplyTo(null)}
            onAttach={attachFile}
            areaRef={areaRef}
          />
        </>
      ) : null}
      {inviteOpen && canInvite && active ? (
        <InviteModal
          shareLink={sessionShareLink(active.sessionKey)}
          copied={copied}
          onCopy={() => void copyChatLink()}
          onClose={() => setInviteOpen(false)}
          canCopy
          memberCount={chatMemberCount(active, slug)}
          teamBound={Boolean(active.teamId)}
          isGroup={threadIsGroup(active)}
          teamId={active.teamId}
          slug={slug}
          takenHandles={[
            active.peerUsername ?? "",
            ...(active.invitedHandles ?? []),
            ...(active.chatGuests ?? []).map((g) => g.handle),
          ].filter(Boolean)}
          onAdd={inviteHandle}
        />
      ) : null}
      {moveBlock ? (
        <TeamMoveSeatModal preview={moveBlock} onClose={() => setMoveBlock(null)} />
      ) : null}
    </section>
  );
}

function ChatDayRule({
  dayKey,
  label,
  days,
  open,
  onToggle,
  onJump,
}: {
  dayKey: string;
  label: string;
  days: { key: string; label: string }[];
  open: boolean;
  onToggle: () => void;
  onJump: (key: string) => void;
}) {
  return (
    <div className="dm-day-rule" data-day={dayKey}>
      <span className="dm-day-line" />
      <div className="dm-day-chip-wrap">
        <button
          type="button"
          className="dm-day-chip"
          aria-expanded={open}
          onClick={onToggle}
        >
          {label}
          <span aria-hidden>▾</span>
        </button>
        {open ? (
          <ul className="dm-day-menu" role="listbox">
            {days.map((day) => (
              <li key={day.key}>
                <button type="button" onClick={() => onJump(day.key)}>
                  {day.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <span className="dm-day-line" />
    </div>
  );
}
