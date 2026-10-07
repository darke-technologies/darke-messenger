import { useEffect, useRef, useState } from "react";
import type { ChatTab } from "./useChat";
import { IconLock } from "./icons";
import type { DarkeTeam } from "./teamContainer";

export function ChatHeader({
  title,
  subtitle,
  handleBadge,
  tab,
  onTab,
  onRename,
  canRename,
  memberCount = 0,
  teams = [],
  onMoveToTeam,
  isGroup = false,
}: {
  title: string;
  subtitle?: string;
  handleBadge?: string;
  tab: ChatTab;
  onTab: (tab: ChatTab) => void;
  onRename: (name: string) => void;
  canRename: boolean;
  memberCount?: number;
  teams?: DarkeTeam[];
  onMoveToTeam?: (teamId?: string) => void;
  isGroup?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [pickOpen, setPickOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  useEffect(() => {
    if (!pickOpen) return;
    function close(event: MouseEvent) {
      if (!pickRef.current?.contains(event.target as Node)) setPickOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [pickOpen]);

  function commit() {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== title) onRename(next);
    else setDraft(title);
  }

  function handleMove() {
    if (!onMoveToTeam) return;
    if (teams.length > 1) {
      setPickOpen((open) => !open);
      return;
    }
    onMoveToTeam(teams[0]?.id);
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
          ) : (
            <button
              type="button"
              className="chat-title-btn"
              onClick={() => {
                if (!canRename) return;
                setDraft(title);
                setEditing(true);
              }}
              title={canRename ? "Rename chat" : undefined}
            >
              <h2>{title}</h2>
              {handleBadge ? (
                <span className="chat-head-handle">{handleBadge}</span>
              ) : null}
            </button>
          )}
          {subtitle ? <p className="chat-head-meta">{subtitle}</p> : null}
        </div>
        <div className="chat-head-actions">
          <span className="chat-sec-pill">
            <IconLock className="chat-sec-pill-icon" />
            P2P · ENCRYPTED
          </span>
          {onMoveToTeam ? (
            <div className="chat-move-wrap" ref={pickRef}>
              <button
                type="button"
                className="chat-move-btn"
                aria-haspopup={teams.length > 1 ? "listbox" : undefined}
                aria-expanded={teams.length > 1 ? pickOpen : undefined}
                onClick={handleMove}
              >
                {isGroup ? "Move Group to Team" : "Move Chat to Team"}
              </button>
              {pickOpen && teams.length > 1 ? (
                <ul className="chat-move-menu" role="listbox" aria-label="Choose a team">
                  {teams.map((team) => (
                    <li key={team.id}>
                      <button
                        type="button"
                        role="option"
                        onClick={() => {
                          setPickOpen(false);
                          onMoveToTeam(team.id);
                        }}
                      >
                        <span>{team.name}</span>
                        <em>
                          {team.ownerHandle ? `@${team.ownerHandle}` : ""}
                        </em>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
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
