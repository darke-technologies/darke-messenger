import { IconPin } from "./icons";
import { UserAvatar } from "./UserAvatar";

export function SidebarChatItem({
  label,
  preview,
  avatars,
  group,
  peerAvatarUrl,
  active,
  pinned,
  badge,
  unread,
  handle,
  at,
  menuOpen,
  onOpen,
  onMenu,
  onDragStart,
}: {
  label: string;
  preview?: string;
  avatars?: string[];
  group?: boolean;
  peerAvatarUrl?: string | null;
  active: boolean;
  pinned: boolean;
  badge: string | null;
  unread: number;
  handle?: string;
  at?: string;
  menuOpen: boolean;
  onOpen: () => void;
  onMenu: (x: number, y: number) => void;
  onDragStart: () => string;
}) {
  const peer = (avatars ?? []).filter(Boolean)[0] ?? "";
  const faceName = group ? label : peer || label;
  return (
    <div
      className={`dm-nav-row${active ? " is-on" : ""}${menuOpen ? " is-menu" : ""}${unread ? " is-unread" : ""}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/chat-id", onDragStart());
        e.dataTransfer.effectAllowed = "move";
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e.clientX, e.clientY);
      }}
    >
      <button type="button" className="dm-nav-row-main" onClick={onOpen}>
        <UserAvatar
          username={faceName}
          url={group ? null : peerAvatarUrl ?? null}
          className="dm-nav-avatar"
          initialsLength={1}
        />
        <span className="dm-nav-who">
          <span className="dm-nav-who-top">
            <strong>
              {pinned ? <IconPin className="dm-nav-pin" /> : null}
              <span className="dm-nav-title-text">{label}</span>
              {badge ? <span className="dm-nav-badge">{badge}</span> : null}
            </strong>
            {at ? <span className="dm-nav-time">{at}</span> : null}
          </span>
          {handle ? <span className="dm-nav-handle">{handle}</span> : null}
          <span className="dm-nav-who-bottom">
            {preview ? <span className="dm-nav-preview">{preview}</span> : null}
            {unread > 0 ? (
              <span className="dm-nav-unread" aria-label={`${unread} unread`}>
                {unread}
              </span>
            ) : null}
          </span>
        </span>
      </button>
      <button
        type="button"
        className={`dm-nav-more${menuOpen ? " is-open" : ""}`}
        aria-label={`Options for ${label || "chat"}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={(e) => {
          e.stopPropagation();
          const box = e.currentTarget.getBoundingClientRect();
          onMenu(box.right - 8, box.bottom + 4);
        }}
      >
        ⋮
      </button>
    </div>
  );
}
