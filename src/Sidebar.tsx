import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useDm } from "./DmContext";
import { threadIsGroup, threadIsRoom } from "./chatController";
import { listChatMemberHandles, threadLastActivityAt } from "./chatService";
import { useLocalChat } from "./useLocalChat";
import {
  sidebarAvatarNames,
  sidebarRowLabel,
  sidebarRowPreview,
  sidebarThreadBadge,
  sidebarUnreadCount,
} from "./useSidebarStore";
import { NewChatPanel } from "./NewChatPanel";
import { IconPin } from "./icons";
import { focusChatMessage, openConversationSettings } from "./dmSessions";
import { AppHeader } from "./SidebarHeader";
import { SidebarChatItem } from "./SidebarChatItem";
import type { DmThread } from "./dmSessions";
import { handleBadge, usePersonDirectory } from "./personDirectory";

export function ChatSidebar({
  slug,
  onOpenFeed: _onOpenFeed,
  onOpenCompose,
  onOpenDownloads: _onOpenDownloads,
  onOpenSettings,
  onOpenUpgrade,
  onOpenSearch: _onOpenSearch,
  onToggleSidebar: _onToggleSidebar,
  onSignOut,
}: {
  slug: string;
  onOpenFeed: () => void;
  onOpenCompose: () => void;
  onOpenDownloads: () => void;
  onOpenSettings: () => void;
  onOpenUpgrade: () => void;
  onOpenSearch: () => void;
  onToggleSidebar?: () => void;
  onSignOut: () => void;
}) {
  const {
    threads,
    activeId,
    setActiveId,
    dismissRoomReady,
    renameThread,
    pinThread,
    deleteThread,
  } = useDm();
  const localChat = useLocalChat(slug);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [lane, setLane] = useState<"messages" | "rooms">("messages");
  const [menu, setMenu] = useState<{
    chatId: string;
    x: number;
    y: number;
  } | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const menuThread = menu
    ? threads.find((row) => row.id === menu.chatId) ?? null
    : null;
  const renameThreadRow = renameId
    ? threads.find((row) => row.id === renameId) ?? null
    : null;

  useEffect(() => {
    function close() {
      setMenu(null);
    }
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const recent = useMemo(
    () =>
      threads
        .slice()
        .sort((a, b) => threadLastActivityAt(b) - threadLastActivityAt(a)),
    [threads],
  );
  const directoryHandles = useMemo(() => {
    const rows = [slug];
    for (const thread of threads) {
      rows.push(...listChatMemberHandles(thread, slug));
    }
    return rows;
  }, [threads, slug]);
  const people = usePersonDirectory(directoryHandles);
  void people.version;

  const visibleRecent = recent.filter((thread) =>
    lane === "rooms" ? threadIsRoom(thread) : !threadIsGroup(thread),
  );

  function renderChatRow(thread: DmThread) {
    const label = sidebarRowLabel(thread, slug, localChat.peek(thread.id));
    return (
      <SidebarChatItem
        key={thread.id}
        label={label}
        preview={sidebarRowPreview(thread, slug)}
        avatars={sidebarAvatarNames(thread, slug)}
        group={threadIsGroup(thread)}
        peerAvatarUrl={
          threadIsGroup(thread)
            ? null
            : people.person(sidebarAvatarNames(thread, slug)[0] || "")
                ?.avatarUrl ?? null
        }
        active={thread.id === activeId}
        pinned={Boolean(thread.pinned)}
        badge={sidebarThreadBadge(thread)}
        handle={
          threadIsGroup(thread)
            ? undefined
            : handleBadge(
                sidebarAvatarNames(thread, slug)[0] ||
                  listChatMemberHandles(thread, slug).find(
                    (h) => h !== slug.replace(/^@/, "").trim().toLowerCase(),
                  ) ||
                  "",
              )
        }
        menuOpen={menu?.chatId === thread.id}
        unread={sidebarUnreadCount(thread)}
        onOpen={() => openChat(thread.id)}
        onMenu={(x, y) => openMenu(thread.id, x, y)}
        onDragStart={() => thread.id}
      />
    );
  }

  function openChat(id: string, messageId?: string) {
    onOpenCompose();
    dismissRoomReady();
    setActiveId(id);
    focusChatMessage(id, messageId);
    setMenu(null);
  }

  function openMenu(chatId: string, x: number, y: number) {
    const left = Math.min(x, window.innerWidth - 240);
    const top = Math.min(y, window.innerHeight - 280);
    setMenu({ chatId, x: left, y: top });
  }

  return (
    <div className="dm-nav">
      {newChatOpen ? (
        <NewChatPanel slug={slug} onClose={() => setNewChatOpen(false)} />
      ) : null}
      <div className="dm-nav-head">
        <AppHeader
          slug={slug}
          onOpenSettings={onOpenSettings}
          onOpenUpgrade={onOpenUpgrade}
          onOpenWorkspace={onOpenCompose}
          onInviteChannel={() => undefined}
          onCompose={() => {
            onOpenCompose();
            setNewChatOpen(true);
          }}
          onSignOut={onSignOut}
        />
        <div className="dm-nav-stream" role="tablist" aria-label="Chat lists">
          {(
            [
              ["messages", "MESSAGES"],
              ["rooms", "ROOMS"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={lane === id}
              className={`dm-nav-stream-btn${lane === id ? " is-on" : ""}`}
              onClick={() => setLane(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="dm-nav-scroll">
      <div className="dm-nav-section dm-nav-section-chats">
        <div className="dm-nav-list">
          {visibleRecent.length === 0 ? (
            <p className="muted msg-nav-empty">
              {lane === "rooms" ? "No rooms yet." : "No chats yet."}
            </p>
          ) : (
            visibleRecent.map((thread) => renderChatRow(thread))
          )}
        </div>
      </div>
      </div>

      {menu && menuThread ? (
        <div
          className="folder-menu chat-nav-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              pinThread(menu.chatId);
              setMenu(null);
            }}
          >
            <IconPin className="chat-nav-menu-icon" />
            {menuThread.pinned ? "Unpin" : "Pin"}
          </button>
          <button
            type="button"
            onClick={() => {
              setRenameId(menu.chatId);
              setMenu(null);
            }}
          >
            <span aria-hidden>✎</span>
            Rename
          </button>
          <button
            type="button"
            onClick={() => {
              onOpenCompose();
              dismissRoomReady();
              setActiveId(menu.chatId);
              openConversationSettings(menu.chatId);
              setMenu(null);
            }}
          >
            <span aria-hidden>⚙</span>
            Chat settings
          </button>
          <button
            type="button"
            className="chat-nav-menu-danger"
            onClick={() => {
              deleteThread(menu.chatId);
              setMenu(null);
            }}
          >
            <span aria-hidden>🗑</span>
            Delete
          </button>
        </div>
      ) : null}

      {renameThreadRow ? (
        <RenameChatModal
          title={localChat.peek(renameThreadRow.id) ?? ""}
          onClose={() => setRenameId(null)}
          onRename={(name) => {
            renameThread(renameThreadRow.id, name);
            setRenameId(null);
          }}
        />
      ) : null}
    </div>
  );
}

function RenameChatModal({
  title,
  onClose,
  onRename,
}: {
  title: string;
  onClose: () => void;
  onRename: (name: string) => void;
}) {
  const [value, setValue] = useState(title);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  const trimmed = value.trim();
  return createPortal(
    <div
      className="apps-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="apps-modal chat-rename-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-rename-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 id="chat-rename-title">Rename this chat</h3>
        <input
          className="dm-session-field"
          value={value}
          autoFocus
          spellCheck={false}
          aria-label="Chat name"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && trimmed) onRename(trimmed);
          }}
        />
        <div className="projects-choice-actions">
          <button type="button" className="projects-choice-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="term-btn term-btn-emerald"
            disabled={!trimmed}
            onClick={() => onRename(trimmed)}
          >
            Rename
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
