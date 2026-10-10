import { useEffect, useRef, useState } from "react";
import type { ChatTab } from "./useChat";
import {
  IconCamera,
  IconLock,
  IconMoreHorizontal,
  IconPhone,
  IconSearch,
} from "./icons";
import { UserAvatar } from "./UserAvatar";

export function ChatHeader({
  title,
  subtitle,
  handleBadge,
  tab,
  onTab,
  onRename,
  canRename,
  memberCount = 0,
  isGroup = false,
  signalSession = false,
  peerAvatar = null,
  peerHandle = "",
  onSearch,
  onChatSettings,
  onBlock,
  onDelete,
}: {
  title: string;
  subtitle?: string;
  handleBadge?: string;
  tab: ChatTab;
  onTab: (tab: ChatTab) => void;
  onRename: (name: string) => void;
  canRename: boolean;
  memberCount?: number;
  isGroup?: boolean;
  signalSession?: boolean;
  peerAvatar?: string | null;
  peerHandle?: string;
  onSearch?: () => void;
  onChatSettings?: () => void;
  onBlock?: () => void;
  onDelete?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  useEffect(() => {
    if (!menuOpen) return;
    function close(event: MouseEvent) {
      const node = event.target as Node;
      if (menuRef.current?.contains(node)) return;
      setMenuOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  function commit() {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== title) onRename(next);
    else setDraft(title);
  }

  if (!isGroup) {
    return (
      <header className="dm-chat-head chat-head is-direct">
        <div className="chat-head-bar is-direct">
          <div className="chat-head-identity">
            <UserAvatar
              username={title || peerHandle || "peer"}
              url={peerAvatar}
              className="chat-head-avatar"
              initialsLength={2}
            />
            <div className="chat-head-title">
              <h2>{title}</h2>
            </div>
          </div>
          <div className="chat-head-actions is-direct">
            <button type="button" className="chat-head-icon-btn" aria-label="Camera" title="Camera">
              <IconCamera />
            </button>
            <button type="button" className="chat-head-icon-btn" aria-label="Phone" title="Phone">
              <IconPhone />
            </button>
            <button
              type="button"
              className="chat-head-icon-btn"
              aria-label="Search chat"
              title="Search chat"
              onClick={onSearch}
            >
              <IconSearch />
            </button>
            <div className="chat-head-more" ref={menuRef}>
              <button
                type="button"
                className="chat-head-icon-btn"
                aria-label="Chat options"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <IconMoreHorizontal />
              </button>
              {menuOpen ? (
                <ul className="chat-head-menu" role="menu">
                  <li>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        onChatSettings?.();
                      }}
                    >
                      Chat Settings
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        onBlock?.();
                      }}
                    >
                      Block
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      role="menuitem"
                      className="is-danger"
                      onClick={() => {
                        setMenuOpen(false);
                        onDelete?.();
                      }}
                    >
                      Delete
                    </button>
                  </li>
                </ul>
              ) : null}
            </div>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="dm-chat-head chat-head">
      <div className="chat-head-bar">
        <div className="chat-head-title">
          {editing && canRename ? (
            <input
              ref={inputRef}
              className="chat-title-input"
              value={draft}
              aria-label="Chat name"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commit();
                }
                if (e.key === "Escape") {
                  setDraft(title);
                  setEditing(false);
                }
              }}
            />
          ) : canRename ? (
            <button
              type="button"
              className="chat-title-btn"
              onClick={() => {
                setDraft(title);
                setEditing(true);
              }}
              title="Rename chat"
            >
              <h2>{title}</h2>
              {handleBadge ? (
                <span className="chat-head-handle">{handleBadge}</span>
              ) : null}
            </button>
          ) : (
            <div className="chat-title-btn">
              <h2>{title}</h2>
              {handleBadge ? (
                <span className="chat-head-handle">{handleBadge}</span>
              ) : null}
            </div>
          )}
          {subtitle ? <p className="chat-head-meta">{subtitle}</p> : null}
        </div>
        <div className="chat-head-actions">
          <span
            className={`chat-sec-pill${signalSession ? " is-signal" : ""}`}
            title={
              signalSession
                ? "Signal session active. Messages are end-to-end encrypted."
                : "Peer channel encrypted. Establishing a Signal session…"
            }
          >
            <IconLock className="chat-sec-pill-icon" />
            {signalSession ? "E2EE · Signal" : "P2P · ENCRYPTED"}
          </span>
        </div>
      </div>
      <nav className="chat-head-tabs" aria-label="Chat sections">
        <button
          type="button"
          className={`chat-tab${tab === "messages" ? " is-on" : ""}`}
          onClick={() => onTab("messages")}
        >
          Messages
        </button>
        <button
          type="button"
          className={`chat-tab${tab === "members" ? " is-on" : ""}`}
          onClick={() => onTab("members")}
        >
          Members
          {memberCount > 0 ? (
            <span className="chat-tab-count">{memberCount}</span>
          ) : null}
        </button>
      </nav>
    </header>
  );
}
