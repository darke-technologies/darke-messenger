import { IconGroupMesh, IconPin } from "./icons";
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
  menuOpen: boolean;
  onOpen: () => void;
  onMenu: (x: number, y: number) => void;
  onDragStart: () => string;
}) {
  const peer = (avatars ?? []).filter(Boolean)[0] ?? "";
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
        {group ? (
          <span className="dm-nav-avatar is-group-mesh" aria-hidden>
            <IconGroupMesh className="dm-nav-group-mesh" />
          </span>
        ) : peer ? (
          <UserAvatar
            username={peer}
            url={peerAvatarUrl ?? null}
            className="dm-nav-avatar"
            initialsLength={1}
          />
        ) : (
          <UserAvatar
            username={label}
            url={peerAvatarUrl ?? null}
            className="dm-nav-avatar"
            initialsLength={1}
          />
        )}
        <span className="dm-nav-who">
          <strong>
            {pinned ? <IconPin className="dm-nav-pin" /> : null}
            <span className="dm-nav-title-text">{label}</span>
            {badge ? <span className="dm-nav-badge">{badge}</span> : null}
            {unread > 0 ? (
              <span className="dm-nav-unread" aria-label={`${unread} unread`}>
                {unread}
              </span>
            ) : null}
          </strong>
          {handle ? <span className="dm-nav-handle">{handle}</span> : null}
          {preview ? <span className="dm-nav-preview">{preview}</span> : null}
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
