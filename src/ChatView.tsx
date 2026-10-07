import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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

export function ChatView() {
  const {
    active,
    sendChat,
    copyChatLink,
    copied,
    slug,
    tab,
    setTab,
    title,
    isAdmin,
    renameActive,
    rotateActiveKeys,
    revokeActiveShareLink,
    purgeActiveHistory,
    inviteHandle,
    bindChatToTeam,
    canInvite,
    joinError,
  } = useChat();
  const channel = usePeerChannel(
    active?.sessionKey ?? null,
    active?.connectionState ?? "WAITING FOR PEER",
  );
  const live = channel.connectionState;
  const connected = live === "CONNECTED";
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
  const [dayMenu, setDayMenu] = useState<string | null>(null);
  const streamRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const roster = usePersonDirectory(
    active ? listChatMemberHandles(active, slug) : [slug],
  );

  useEffect(() => {
    setReplyTo(null);
    setInviteRequested(false);
    setDayMenu(null);
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

  useEffect(() => {
    return channel.onMessage(() => {
      /* DataChannel inbound payloads attach here. */
    });
  }, [channel]);

  function send(e?: FormEvent) {
    e?.preventDefault();
    const text = composer.trim();
    if (!text || !active) return;
    if (connected) {
      channel.sendMessage(text, replyTo?.id);
      void sendChat(text, { replyToMessageId: replyTo?.id });
    } else {
      void sendChat(text, { mailbox: true, replyToMessageId: replyTo?.id });
    }
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
    if (connected) {
      void sendChat("", { file });
    } else {
      void sendChat("", { mailbox: true, file });
    }
  }

  const youFp = nodeFingerprint(`${active?.sessionKey ?? ""}:you:${slug}`);
  const peerFp = nodeFingerprint(
    `${active?.sessionKey ?? ""}:peer:${active?.handle ?? "peer"}`,
  );
  const ownerHandle = chatOwnerHandle(active, slug);
  const visibleMessages = (nodeTyping
    ? (active?.messages.filter((msg) => !isNodeGreeting(msg)) ?? [])
    : (active?.messages ?? [])
  ).filter((msg) => !active || !messageHasDisappeared(msg, active));
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

  if (tab === "settings" && active) {
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
    <section className="dm-pane">
      <ChatHeader
        title={title}
        subtitle={
          active
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
        tab={tab}
        onTab={setTab}
        onRename={renameActive}
        canRename={Boolean(active)}
        memberCount={chatMemberCount(active, slug)}
        handleBadge={
          active && !threadIsGroup(active) && peer.handle && peer.handle !== "peer"
            ? `@${peer.handle.replace(/^@/, "")}`
            : undefined
        }
        teams={moveTeams}
        isGroup={Boolean(active && threadIsGroup(active))}
        onMoveToTeam={
          active && !active.teamId
            ? (teamId) => {
                const result = bindChatToTeam(active.id, teamId);
                if (!result.ok && result.preview?.blocked) {
                  setMoveBlock(result.preview);
                }
              }
            : undefined
        }
      />

      {tab === "members" ? (
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

      {tab === "messages" ? (
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
                  <ChatMessage
                    msg={msg}
                    you={me}
                    peer={peer}
                    isAdmin={
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
                    highlighted={hitId === msg.id}
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
              );
            })}
          </div>

          <TypingBar handles={typingUsers} />
          <ChatInput
            value={composer}
            onChange={setComposer}
            onSubmit={send}
            onTyping={notifyTyping}
            disabled={!active}
            placeholder={`Message ${title || "chat"}`}
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
