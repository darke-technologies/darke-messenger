import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isLocalOnlySystemNotice } from "./chatService";
import {
  formatBubbleTime,
  NODE_GREETING,
  P2P_ENCLAVE_BODY,
  P2P_ENCLAVE_TITLE,
  type DmMessage,
} from "./dmSessions";
import {
  IconCopy,
  IconEdit,
  IconShareForward,
  IconMoreHorizontal,
  IconPin,
  IconSelect,
  IconTrash,
} from "./icons";
import { memberDisplayName } from "./getChatTitle";
import { UserAvatar } from "./UserAvatar";

function ReplyIcon() {
  return (
    <svg
      className="newsfeed-reply-icon"
      viewBox="0 0 16 16"
      width="12"
      height="12"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M6.2 2.3a.75.75 0 0 1 .05 1.06L4.36 5.5H9.5A4.5 4.5 0 0 1 14 10v1.25a.75.75 0 0 1-1.5 0V10A3 3 0 0 0 9.5 7H4.36l1.89 2.14a.75.75 0 1 1-1.12 1L2.2 7.28a.75.75 0 0 1 0-1.06l2.93-3.14a.75.75 0 0 1 1.06-.05Z"
      />
    </svg>
  );
}

export type ChatPerson = {
  handle: string;
  display: string;
  avatar: string | null;
};

export function ChatMessage({
  msg,
  quoted,
  highlighted,
  connected,
  onReply,
  onOpenQuote,
  onAddPeople: _onAddPeople,
  canInvite: _canInvite = false,
  you,
  peer,
  isAdmin = false,
  isGroup = false,
  cluster,
  selecting = false,
  selected = false,
  onToggleSelect,
  onForward,
  onEdit,
  onSelect,
  onCopy,
  onPin,
  onDelete,
}: {
  msg: DmMessage;
  quoted?: DmMessage | null;
  highlighted?: boolean;
  connected: boolean;
  onReply: (msg: DmMessage) => void;
  onOpenQuote?: (id: string) => void;
  onAddPeople?: () => void;
  canInvite?: boolean;
  you: ChatPerson;
  peer: ChatPerson;
  isAdmin?: boolean;
  isGroup?: boolean;
  cluster?: {
    isFirst: boolean;
    isMiddle: boolean;
    isLast: boolean;
    showMeta: boolean;
  };
  selecting?: boolean;
  selected?: boolean;
  onToggleSelect?: (msg: DmMessage) => void;
  onForward?: (msg: DmMessage) => void;
  onEdit?: (msg: DmMessage) => void;
  onSelect?: (msg: DmMessage) => void;
  onCopy?: (msg: DmMessage) => void;
  onPin?: (msg: DmMessage) => void;
  onDelete?: (msg: DmMessage) => void;
}) {
  const system = isLocalOnlySystemNotice(msg);
  const mine = msg.direction === "sent";
  function handleOf(value: string) {
    return value.replace(/^@/, "").trim().toLowerCase();
  }
  const who = system
    ? { handle: "darke", display: "DARKE Node", avatar: "/darke.png" }
    : mine
      ? you
      : peer;
  const quoteText =
    (quoted?.fileName || quoted?.body || msg.replyToSnippet || "").trim();
  const quoteId = quoted?.id || msg.replyToMessageId;
  const body = msg.fileName ? (
    msg.fileUrl ? (
      <a href={msg.fileUrl} download={msg.fileName}>
        {msg.fileName}
      </a>
    ) : (
      msg.fileName
    )
  ) : (
    msg.body
  );
  void connected;
  const status =
    msg.relay === "pending-keys"
      ? "Waiting for recipient to initialize security keys"
      : null;

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const menuRef = useRef<HTMLDivElement>(null);
  const menuListRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function close(event: MouseEvent) {
      const node = event.target as Node;
      if (menuRef.current?.contains(node)) return;
      if (menuListRef.current?.contains(node)) return;
      setMenuOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuPos(null);
      return;
    }
    const GAP = 8;
    const PAD = 8;
    function place() {
      const btn = menuRef.current?.querySelector("button");
      const menu = menuListRef.current;
      if (!btn || !menu) return;
      const r = btn.getBoundingClientRect();
      const mw = menu.offsetWidth;
      const mh = menu.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const spaceAbove = r.top - PAD;
      const spaceBelow = vh - r.bottom - PAD;
      let top: number;
      if (mh + GAP <= spaceAbove || spaceAbove >= spaceBelow) {
        top = r.top - mh - GAP;
        if (top < PAD) top = PAD;
      } else {
        top = r.bottom + GAP;
        if (top + mh > vh - PAD) top = Math.max(PAD, vh - PAD - mh);
      }
      let left = mine ? r.left : r.right - mw;
      left = Math.min(Math.max(PAD, left), Math.max(PAD, vw - PAD - mw));
      setMenuPos({ top, left });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [menuOpen, mine]);

  const replyBtn = (
    <button
      type="button"
      className="newsfeed-reply-btn"
      onClick={() => onReply(msg)}
    >
      <ReplyIcon />
      Reply
    </button>
  );

  const menuBtn = (
    <div className={`dm-msg-more${menuOpen ? " is-open" : ""}`} ref={menuRef}>
      <button
        type="button"
        className="dm-msg-more-btn"
        aria-label="Message options"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <IconMoreHorizontal />
      </button>
      {menuOpen && typeof document !== "undefined"
        ? createPortal(
            <ul
              ref={menuListRef}
              className="dm-msg-menu is-portaled"
              role="menu"
              style={
                menuPos
                  ? { top: menuPos.top, left: menuPos.left }
                  : { visibility: "hidden" }
              }
            >
              <li>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onForward?.(msg);
                  }}
                >
                  <IconShareForward />
                  Forward
                </button>
              </li>
              {mine ? (
                <li>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onEdit?.(msg);
                    }}
                  >
                    <IconEdit />
                    Edit
                  </button>
                </li>
              ) : null}
              <li>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onSelect?.(msg);
                  }}
                >
                  <IconSelect />
                  Select
                </button>
              </li>
              <li>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onCopy?.(msg);
                  }}
                >
                  <IconCopy />
                  Copy text
                </button>
              </li>
              <li>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onPin?.(msg);
                  }}
                >
                  <IconPin />
                  {msg.pinned ? "Unpin" : "Pin"}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  role="menuitem"
                  className="is-danger"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete?.(msg);
                  }}
                >
                  <IconTrash />
                  Delete
                </button>
              </li>
            </ul>,
            document.body,
          )
        : null}
    </div>
  );

  if (msg.kind === "pin-notice") {
    const by = handleOf(msg.pinnedBy || "");
    const self = handleOf(you.handle);
    const peerId = handleOf(peer.handle);
    const who =
      !by || by === self
        ? "You"
        : by === peerId
          ? peer.display || peer.handle
          : memberDisplayName(msg.pinnedBy || "") || msg.pinnedBy || "Someone";
    return (
      <div className="dm-pin-notice" data-msg-id={msg.id}>
        <p className="dm-pin-notice-line">
          <IconPin className="dm-pin-notice-icon" />
          <span>
            {who} pinned a message
          </span>
        </p>
        <button
          type="button"
          className="dm-pin-notice-go"
          onClick={() => {
            if (msg.pinTargetId) onOpenQuote?.(msg.pinTargetId);
          }}
        >
          Go to message
        </button>
      </div>
    );
  }

  if (system) {
    const title = msg.title?.trim() || P2P_ENCLAVE_TITLE;
    const body =
      msg.body === NODE_GREETING || !msg.body.trim()
        ? P2P_ENCLAVE_BODY
        : msg.body;
    return (
      <article
        data-msg-id={msg.id}
        className={`p2p-enclave-card${highlighted ? " is-search-hit is-target" : ""}`}
      >
        <h3>{title}</h3>
        <p>{body}</p>
      </article>
    );
  }

  const clusterClass = cluster
    ? [
        cluster.isFirst ? "is-cluster-first" : "",
        cluster.isMiddle ? "is-cluster-middle" : "",
        cluster.isLast ? "is-cluster-last" : "",
      ]
        .filter(Boolean)
        .join(" ")
    : "";
  const showMeta = !isGroup && (cluster?.showMeta ?? true);

  return (
    <article
      data-msg-id={msg.id}
      className={`dm-bubble-row${mine ? " is-mine" : " is-theirs"}${highlighted ? " is-search-hit is-target" : ""}${isGroup ? "" : " is-direct"}${clusterClass ? ` ${clusterClass}` : ""}`}
    >
      {!mine && isGroup ? (
        <UserAvatar
          username={who.display || who.handle}
          url={who.avatar}
          className="dm-bubble-avatar"
          initialsLength={2}
        />
      ) : null}
      {selecting ? (
        <button
          type="button"
          className={`dm-msg-pick${selected ? " is-on" : ""}`}
          aria-pressed={selected}
          aria-label={selected ? "Deselect message" : "Select message"}
          onClick={() => onToggleSelect?.(msg)}
        >
          {selected ? "✓" : ""}
        </button>
      ) : null}
      {mine && !selecting ? (
        <>
          {menuBtn}
          {!isGroup ? replyBtn : null}
        </>
      ) : null}
      <div className="dm-bubble-col">
        {!mine && isGroup ? (
          <span className="dm-bubble-name">
            {who.display}
            {isAdmin ? <span className="newsfeed-author-badge">ADMIN</span> : null}
          </span>
        ) : null}
        {quoteId && quoteText ? (
          <button
            type="button"
            className="dm-quote"
            onClick={() => quoteId && onOpenQuote?.(quoteId)}
          >
            {quoteText}
          </button>
        ) : msg.replyToMessageId ? (
          <p className="dm-quote is-missing">Original message unavailable</p>
        ) : null}
        <div
          className={`dm-bubble${mine ? " is-sent" : " is-received"}${clusterClass ? ` ${clusterClass}` : ""}`}
        >
          <p>
            {body}
            {showMeta ? (
              <time
                className="dm-bubble-time"
                dateTime={new Date(msg.at).toISOString()}
              >
                {msg.edited ? "edited · " : ""}
                {formatBubbleTime(msg.at)}
              </time>
            ) : null}
          </p>
        </div>
        {mine && showMeta && status ? (
          <span className="dm-bubble-status">{status}</span>
        ) : null}
        {isGroup ? replyBtn : null}
      </div>
      {!mine && !selecting ? (
        <>
          {!isGroup ? replyBtn : null}
          {menuBtn}
        </>
      ) : null}
    </article>
  );
}
