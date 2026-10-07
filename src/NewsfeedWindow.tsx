import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { loadMyFollowingIds, setFollowing } from "./follows";
import { FollowButton } from "./followsUi";
import { PersonPeek } from "./PersonPeek";
import { loadMyProfile, loadProfileByUsername, loadPublicProfiles, type DarkeProfile } from "./profile";
import { consumeFeedIntent, FEED_INTENT_EVENT, openProfile, type FeedIntent } from "./feedIntent";
import { toSlug } from "./slug";
import { ProfileViewModal } from "./ProfileViewModal";
import { UserAvatar } from "./UserAvatar";
import { IconComment, IconPaperclip, IconViews } from "./icons";
import {
  CHANNEL_FILE_LIMIT,
  COMMENT_MAX,
  STATUS_MAX,
  channelFileAllowed,
  createStatusComment,
  createStatusUpdate,
  deleteStatusComment,
  deleteStatusUpdate,
  updateStatusComment,
  updateStatusUpdate,
  loadCommentCounts,
  loadReadCounts,
  recordBeepRead,
  loadMyThreadMarks,
  threadMarkFor,
  loadFollowingStatusUpdates,
  loadWorkspaceStatusUpdates,
  loadChannelStatusUpdates,
  loadGlobalBeeps,
  loadBookmarkedStatusUpdates,
  loadMyBookmarkIds,
  setBeepBookmarked,
  loadStatusComments,
  loadStatusUpdate,
  loadStatusUpdates,
  loadUserSnippets,
  feedCardTime,
  exactTime,
  relativeTime,
  snippetDisplayName,
  statusError,
  uploadChannelFile,
  FEED_STATUS_LIMIT,
  type CommentAttachment,
  type StatusComment,
  type StatusUpdate,
  type ThreadMark,
  type UserSnippet,
} from "./status";
import { sessionIsSignedIn } from "./session";
import { hydrateThemeFromVault } from "./welcomePrefs";
import { useNotifications } from "./notificationsUi";
import { NewsfeedPostResize, useDetailPostHeight } from "./NewsfeedPostResize";

export const NEWSFEED_HASH = "#newsfeed";
export const NEWSFEED_LABEL = "newsfeed";
const FLOAT_KEY = "darke-newsfeed-float";

type FloatState = {
  x: number;
  y: number;
  w: number;
  h: number;
  minimized: boolean;
};

function clampFloat(next: FloatState): FloatState {
  const minW = 340;
  const minH = 280;
  const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const w = Math.max(minW, Math.min(next.w, vw - 16));
  const h = Math.max(minH, Math.min(next.h, vh - 16));
  const x = Math.max(8, Math.min(next.x, vw - 80));
  const y = Math.max(36, Math.min(next.y, vh - 48));
  return { ...next, x, y, w, h };
}

function readFloat(): FloatState {
  try {
    const raw = localStorage.getItem(FLOAT_KEY);
    if (!raw) throw new Error("empty");
    const parsed = JSON.parse(raw) as Partial<FloatState>;
    return clampFloat({
      x: typeof parsed.x === "number" ? parsed.x : window.innerWidth - 460,
      y: typeof parsed.y === "number" ? parsed.y : 72,
      w: typeof parsed.w === "number" ? parsed.w : 420,
      h: typeof parsed.h === "number" ? parsed.h : 560,
      minimized: parsed.minimized === true,
    });
  } catch {
    return clampFloat({
      x: 800,
      y: 72,
      w: 420,
      h: 560,
      minimized: false,
    });
  }
}

function writeFloat(state: FloatState) {
  try {
    localStorage.setItem(FLOAT_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export async function focusOrOpenNewsfeedPopout(): Promise<boolean> {
  try {
    await sessionIsSignedIn().catch(() => false);
    const url = `${window.location.origin}${window.location.pathname}?newsfeed=1`;
    const existing = window.open("", NEWSFEED_LABEL);
    if (existing && !existing.closed && existing.location.href !== "about:blank") {
      existing.focus();
      return true;
    }
    const created = window.open(url, NEWSFEED_LABEL, "width=440,height=680");
    newsfeedPopout = created;
    return Boolean(created);
  } catch {
    return false;
  }
}

let newsfeedPopout: Window | null = null;

function snippetFromProfile(row: DarkeProfile): UserSnippet {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    headline: row.headline,
    avatarUrl: row.avatar_url,
    city: row.city,
    region: row.region,
    country: row.country,
    createdAt: row.created_at,
  };
}

function AutoGrowField({
  value,
  maxLength,
  onChange,
}: {
  value: string;
  maxLength: number;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.max(el.scrollHeight, 64)}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      maxLength={maxLength}
      rows={3}
      onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
      onKeyDown={(e) => e.stopPropagation()}
    />
  );
}

function ConfirmDeletePost({
  busy,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return createPortal(
    <div
      className="apps-modal-backdrop is-profile-edit"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        className="apps-modal newsfeed-confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-post-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 id="delete-post-title" className="newsfeed-confirm-title">
          Delete post?
        </h3>
        <p className="newsfeed-confirm-copy">
          This post will be removed for everyone. This can&apos;t be undone.
        </p>
        <div className="newsfeed-confirm-actions">
          <button
            type="button"
            className="newsfeed-confirm-cancel"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="newsfeed-confirm-delete"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Deleting" : "Delete"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function OwnerMenu({
  open,
  onToggle,
  onMarkUnread,
  onBookmark,
  bookmarked = false,
  onEdit,
  onDelete,
}: {
  open: boolean;
  onToggle: (e: MouseEvent) => void;
  onMarkUnread?: () => void;
  onBookmark?: () => void;
  bookmarked?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="newsfeed-owner-menu">
      <button
        type="button"
        className="newsfeed-menu-btn"
        aria-label="Actions"
        aria-expanded={open}
        onClick={onToggle}
      >
        ···
      </button>
      {open ? (
        <div className="newsfeed-menu-pop" role="menu">
          {onBookmark ? (
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                onBookmark();
              }}
            >
              {bookmarked ? "Remove bookmark" : "Bookmark"}
            </button>
          ) : null}
          {onMarkUnread ? (
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                onMarkUnread();
              }}
            >
              Mark as unread
            </button>
          ) : null}
          {onEdit ? (
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
            >
              Edit
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              role="menuitem"
              className="is-danger"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              Delete
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

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

function isImageAttachment(file: { mime: string; name: string }): boolean {
  return (
    file.mime.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp)$/i.test(file.name)
  );
}

function CommentAttachmentList({
  items,
}: {
  items: CommentAttachment[];
}) {
  if (items.length === 0) return null;
  return (
    <ul className="channel-attach-list">
      {items.map((file) => (
        <li key={file.url}>
          {isImageAttachment(file) ? (
            <a href={file.url} target="_blank" rel="noreferrer">
              <img src={file.url} alt={file.name} />
            </a>
          ) : (
            <a href={file.url} target="_blank" rel="noreferrer">
              {file.name}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

export function FeedSortBar({
  value,
  open,
  onToggle,
  onPick,
}: {
  value: "recent" | "top";
  open: boolean;
  onToggle: (e: MouseEvent) => void;
  onPick: (next: "recent" | "top") => void;
}) {
  return (
    <div className="newsfeed-sort">
      <button
        type="button"
        className="newsfeed-sort-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span>Sort by:</span>
        <span className="newsfeed-sort-value">
          {value === "top" ? "Top" : "Recent"}
        </span>
        <span className="newsfeed-sort-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div className="newsfeed-sort-pop" role="menu">
          <button
            type="button"
            role="menuitemradio"
            aria-checked={value === "top"}
            className={value === "top" ? "is-on" : ""}
            onClick={(e) => {
              e.stopPropagation();
              onPick("top");
            }}
          >
            Top
          </button>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={value === "recent"}
            className={value === "recent" ? "is-on" : ""}
            onClick={(e) => {
              e.stopPropagation();
              onPick("recent");
            }}
          >
            Recent
          </button>
        </div>
      ) : null}
    </div>
  );
}

const POST_PREVIEW_CHARS = 210;
const POST_PREVIEW_LINES = 4;

function compactPostPreview(content: string): { preview: string; tooLong: boolean } {
  const lines = content.split(/\r?\n/);
  let cut =
    lines.length > POST_PREVIEW_LINES
      ? lines.slice(0, POST_PREVIEW_LINES).join("\n")
      : content;
  if (cut.length > POST_PREVIEW_CHARS) {
    cut = cut.slice(0, POST_PREVIEW_CHARS);
  }
  if (cut.length >= content.length) {
    return { preview: content, tooLong: false };
  }
  return { preview: `${cut.trimEnd()}…`, tooLong: true };
}

function NewsfeedPostCard({
  post,
  author,
  replyCount,
  viewed = false,
  youMark = null,
  compact = false,
  showYouMark = true,
  readCount = 0,
  showFollow = false,
  isFollowing = false,
  followBusy = false,
  onFollow,
  onVisit,
  isOwner = false,
  menuOpen = false,
  onMenu,
  onMarkUnread,
  onEdit,
  onDelete,
  editing = false,
  editDraft = "",
  onEditDraft,
  onSaveEdit,
  onCancelEdit,
  previewExpanded = false,
  onPreviewExpand,
  bookmarked = false,
  onBookmark,
}: {
  post: StatusUpdate;
  author: UserSnippet | null;
  replyCount: number;
  viewed?: boolean;
  youMark?: ThreadMark | null;
  compact?: boolean;
  showYouMark?: boolean;
  readCount?: number;
  showFollow?: boolean;
  isFollowing?: boolean;
  followBusy?: boolean;
  onFollow?: () => void;
  onVisit?: (username: string) => void;
  isOwner?: boolean;
  menuOpen?: boolean;
  onMenu?: (e: MouseEvent) => void;
  onMarkUnread?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  editing?: boolean;
  editDraft?: string;
  onEditDraft?: (value: string) => void;
  onSaveEdit?: () => void;
  onCancelEdit?: () => void;
  previewExpanded?: boolean;
  onPreviewExpand?: (expanded: boolean) => void;
  bookmarked?: boolean;
  onBookmark?: () => void;
}) {
  const handle = author?.username ?? "unknown";
  const name = snippetDisplayName(author, handle);
  const headline = author?.headline?.trim() || "";
  const [localExpanded, setLocalExpanded] = useState(false);
  useEffect(() => {
    setLocalExpanded(false);
  }, [post.id]);
  const expanded = onPreviewExpand ? previewExpanded : localExpanded;
  const setExpanded = onPreviewExpand ?? setLocalExpanded;
  const preview = compactPostPreview(post.content);
  const tooLong = compact && !editing && preview.tooLong;
  const bodyText = tooLong && !expanded ? preview.preview : post.content;
  const actions =
    onMenu &&
    (onBookmark || onMarkUnread || (isOwner && onEdit && onDelete)) ? (
      <OwnerMenu
        open={menuOpen}
        onToggle={onMenu}
        onBookmark={onBookmark}
        bookmarked={bookmarked}
        onMarkUnread={onMarkUnread}
        onEdit={isOwner ? onEdit : undefined}
        onDelete={isOwner ? onDelete : undefined}
      />
    ) : null;
  const avatar = (
    <PersonPeek
      person={author}
      showFollow={showFollow}
      isFollowing={isFollowing}
      followBusy={followBusy}
      onFollow={onFollow}
      onVisit={onVisit}
    >
      <UserAvatar
        username={handle}
        url={author?.avatarUrl ?? null}
        className="newsfeed-card-photo"
      />
    </PersonPeek>
  );
  const identity = (
    <div className="newsfeed-card-identity">
      <div className="newsfeed-card-byline">
        <PersonPeek
          person={author}
          showFollow={showFollow}
          isFollowing={isFollowing}
          followBusy={followBusy}
          onFollow={onFollow}
          onVisit={onVisit}
        >
          <span className="newsfeed-card-name">{name}</span>
        </PersonPeek>
        <span className="newsfeed-card-dot" aria-hidden>
          ·
        </span>
        <span className="newsfeed-card-at">@{handle}</span>
        {showFollow && onFollow ? (
          <>
            <span className="newsfeed-card-dot" aria-hidden>
              ·
            </span>
            <FollowButton
              isFollowing={isFollowing}
              busy={followBusy}
              onToggle={onFollow}
              className="newsfeed-follow"
              variant="text"
            />
          </>
        ) : null}
      </div>
      {headline ? <p className="newsfeed-card-headline">{headline}</p> : null}
    </div>
  );
  const aside = (
    <div className="newsfeed-card-aside">
      <span className="newsfeed-card-time" title={exactTime(post.createdAt)}>
        {feedCardTime(post.createdAt)}
      </span>
      {actions}
    </div>
  );
  const hasYouLine = showYouMark && Boolean(youMark);
  const foot = (
    <div className="newsfeed-card-foot">
      <p className="newsfeed-you-mark">
        <span
          className="newsfeed-stat"
          aria-label={`${replyCount} ${replyCount === 1 ? "comment" : "comments"}`}
        >
          <IconComment className="newsfeed-stat-icon" />
          {replyCount}
        </span>
        <span className="newsfeed-card-dot" aria-hidden>
          ·
        </span>
        <span className="newsfeed-stat" aria-label={`Read by ${readCount}`}>
          <IconViews className="newsfeed-stat-icon" />
          {readCount}
        </span>
        {hasYouLine ? (
          <span className="newsfeed-card-dot" aria-hidden>
            ·
          </span>
        ) : null}
        {hasYouLine ? (
          <span className="newsfeed-you-kind">
            {youMark?.kind === "replied" ? "You replied" : "You commented"}
          </span>
        ) : null}
        {hasYouLine && youMark?.snippet ? (
          <span className="newsfeed-you-quote">“{youMark.snippet}”</span>
        ) : null}
      </p>
    </div>
  );
  const editBlock = (
    <div className="newsfeed-inline-edit" onClick={(e) => e.stopPropagation()}>
      <AutoGrowField
        value={editDraft}
        maxLength={STATUS_MAX}
        onChange={(value) => onEditDraft?.(value)}
      />
      <div className="newsfeed-inline-edit-actions">
        <span
          className={`beeper-count${editDraft.length >= STATUS_MAX ? " is-max" : ""}${editDraft.length > STATUS_MAX ? " is-over" : ""}`}
        >
          {editDraft.length}/{STATUS_MAX}
        </span>
        <button
          type="button"
          className="newsfeed-edit-save"
          onClick={onSaveEdit}
          disabled={
            editDraft.trim().length === 0 || editDraft.length > STATUS_MAX
          }
        >
          Save
        </button>
        <button type="button" className="newsfeed-edit-cancel" onClick={onCancelEdit}>
          Cancel
        </button>
      </div>
    </div>
  );
  const compactBody = editing ? (
    editBlock
  ) : (
    <div className="newsfeed-post-bubble">
      <p className="newsfeed-card-text">{bodyText}</p>
      {tooLong ? (
        <div className="newsfeed-see-more-row">
          <button
            type="button"
            className="newsfeed-see-more"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? "See less" : "See more"}
          </button>
          {expanded ? (
            <>
              <span className="newsfeed-card-dot" aria-hidden>
                ·
              </span>
              <button
                type="button"
                className="newsfeed-see-more"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(false);
                }}
              >
                View comments
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
  if (compact) {
    return (
      <div
        className={`newsfeed-card-inner is-compact${headline ? " has-headline" : ""}`}
      >
        {avatar}
        <div className="newsfeed-card-main">
          {identity}
          {compactBody}
          {foot}
        </div>
        {aside}
      </div>
    );
  }
  return (
    <div
      className={`newsfeed-card-inner${headline ? " has-headline" : ""}`}
    >
      <span
        className={`newsfeed-card-unread${viewed ? " is-off" : ""}`}
        aria-hidden={viewed}
        aria-label={viewed ? undefined : "Unread post"}
      />
      {avatar}
      <div className="newsfeed-card-body">
        {identity}
        {editing ? (
          editBlock
        ) : (
          <>
            <p className="newsfeed-card-text">{bodyText}</p>
            {tooLong ? (
              <button
                type="button"
                className="newsfeed-see-more"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(!expanded);
                }}
              >
                {expanded ? "See less" : "See more"}
              </button>
            ) : null}
          </>
        )}
      </div>
      {aside}
      {foot}
    </div>
  );
}

function NewsfeedCommentTree({
  comments,
  people,
  parentId,
  replyToId,
  onReply,
  postAuthorId,
  meId,
  menuId,
  onMenu,
  onEdit,
  onDelete,
  editingId,
  editDraft,
  onEditDraft,
  onSaveEdit,
  onCancelEdit,
  followingIds,
  followBusy,
  onFollow,
  onVisit,
}: {
  comments: StatusComment[];
  people: Map<string, UserSnippet>;
  parentId: string | null;
  replyToId: string | null;
  onReply: (comment: StatusComment, who: UserSnippet | null) => void;
  postAuthorId: string | null;
  meId: string | null;
  menuId: string | null;
  onMenu: (e: MouseEvent, id: string) => void;
  onEdit: (row: StatusComment) => void;
  onDelete: (row: StatusComment) => void;
  editingId: string | null;
  editDraft: string;
  onEditDraft: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  followingIds: string[];
  followBusy: string | null;
  onFollow: (userId: string) => void;
  onVisit?: (username: string) => void;
}) {
  const rows = comments
    .filter((row) => (row.parentId ?? null) === parentId)
    .slice()
    .sort((a, b) => {
      const tb = Date.parse(b.createdAt) || 0;
      const ta = Date.parse(a.createdAt) || 0;
      return tb - ta;
    });
  if (rows.length === 0) return null;
  return (
    <ul className={`newsfeed-thread${parentId ? " is-nested" : ""}`}>
      {rows.map((row) => {
        const who = people.get(row.userId) ?? null;
        const kids = comments.some((c) => c.parentId === row.id);
        const parent = row.parentId
          ? comments.find((c) => c.id === row.parentId)
          : null;
        const replyToHandle = parent
          ? (people.get(parent.userId)?.username ?? null)
          : null;
        const handle = who?.username ?? "unknown";
        const name = snippetDisplayName(who, handle);
        const canFollow = Boolean(meId && meId !== row.userId);
        return (
          <li
            key={row.id}
            className={`newsfeed-comment${replyToId === row.id ? " is-target" : ""}`}
          >
            <div className="newsfeed-comment-row">
            <PersonPeek
              person={who}
              showFollow={canFollow}
              isFollowing={followingIds.includes(row.userId)}
              followBusy={followBusy === row.userId}
              onFollow={() => onFollow(row.userId)}
              onVisit={onVisit}
            >
              <UserAvatar
                username={who?.username ?? "user"}
                url={who?.avatarUrl ?? null}
                className="newsfeed-comment-photo"
              />
            </PersonPeek>
            <div className="newsfeed-comment-body">
              <div className="newsfeed-comment-byline">
                <PersonPeek
                  person={who}
                  showFollow={canFollow}
                  isFollowing={followingIds.includes(row.userId)}
                  followBusy={followBusy === row.userId}
                  onFollow={() => onFollow(row.userId)}
                  onVisit={onVisit}
                >
                  <span className="newsfeed-card-name">{name}</span>
                </PersonPeek>
                {postAuthorId && row.userId === postAuthorId ? (
                  <span className="newsfeed-author-badge">Author</span>
                ) : null}
                <span className="newsfeed-card-dot" aria-hidden>·</span>
                <span className="newsfeed-card-at">@{handle}</span>
                {canFollow ? (
                  <>
                    <span className="newsfeed-card-dot" aria-hidden>·</span>
                    <FollowButton
                      isFollowing={followingIds.includes(row.userId)}
                      busy={followBusy === row.userId}
                      onToggle={() => onFollow(row.userId)}
                      className="newsfeed-follow"
                      variant="text"
                    />
                  </>
                ) : null}
              </div>
              {who?.headline ? (
                <p className="newsfeed-card-headline">{who.headline}</p>
              ) : null}
              {editingId === row.id ? (
                <div
                  className="newsfeed-inline-edit"
                  onClick={(e) => e.stopPropagation()}
                >
                  <AutoGrowField
                    value={editDraft}
                    maxLength={COMMENT_MAX}
                    onChange={onEditDraft}
                  />
                  <div className="newsfeed-inline-edit-actions">
                    <button type="button" className="newsfeed-edit-save" onClick={onSaveEdit}>
                      Save
                    </button>
                    <button type="button" className="newsfeed-edit-cancel" onClick={onCancelEdit}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : row.content || replyToHandle ? (
                <p className="newsfeed-comment-text">
                  {replyToHandle ? (
                    <span className="newsfeed-reply-at">@{replyToHandle}</span>
                  ) : null}
                  {row.content}
                </p>
              ) : null}
              <CommentAttachmentList items={row.attachments} />
              <button
                type="button"
                className="newsfeed-reply-btn"
                onClick={() => onReply(row, who)}
              >
                <ReplyIcon />
                Reply
              </button>
            </div>
            <div className="newsfeed-card-aside">
              <span className="newsfeed-card-time" title={exactTime(row.createdAt)}>
                {relativeTime(row.createdAt)}
              </span>
              {meId && row.userId === meId ? (
                <OwnerMenu
                  open={menuId === row.id}
                  onToggle={(e) => onMenu(e, row.id)}
                  onEdit={() => onEdit(row)}
                  onDelete={() => onDelete(row)}
                />
              ) : null}
            </div>
            </div>
            {kids ? (
              <NewsfeedCommentTree
                comments={comments}
                people={people}
                parentId={row.id}
                replyToId={replyToId}
                onReply={onReply}
                postAuthorId={postAuthorId}
                meId={meId}
                menuId={menuId}
                onMenu={onMenu}
                onEdit={onEdit}
                onDelete={onDelete}
                editingId={editingId}
                editDraft={editDraft}
                onEditDraft={onEditDraft}
                onSaveEdit={onSaveEdit}
                onCancelEdit={onCancelEdit}
                followingIds={followingIds}
                followBusy={followBusy}
                onFollow={onFollow}
                onVisit={onVisit}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function NewsfeedDeck({
  variant,
  onPopOut,
  onMinimize,
  onMaximize,
  onClose,
  workspaceId,
  workspaceName,
  channelId,
  readOnly = false,
  hideWorkspaceBanner = false,
  detailOnly = false,
  autoOpenFirst = false,
  hideComposer = false,
  detailLead = null,
  detailHead = null,
}: {
  variant: "page" | "float" | "window";
  onPopOut?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  workspaceId?: string;
  workspaceName?: string;
  channelId?: string;
  readOnly?: boolean;
  hideWorkspaceBanner?: boolean;
  detailOnly?: boolean;
  autoOpenFirst?: boolean;
  hideComposer?: boolean;
  detailLead?: ReactNode;
  detailHead?: ReactNode;
}) {
  const { refresh } = useNotifications();
  const scoped = Boolean(workspaceId);
  const [mode, setMode] = useState<"following" | "all" | "bookmarks">(
    "following",
  );
  const [filterUserId, setFilterUserId] = useState<string | null>(null);
  const [filterUsername, setFilterUsername] = useState<string | null>(null);
  const [fromProfile, setFromProfile] = useState<string | null>(null);
  const pendingPostId = useRef<string | null>(null);
  const [feedSort, setFeedSort] = useState<"recent" | "top">("recent");
  const [sortOpen, setSortOpen] = useState(false);
  const [people, setPeople] = useState<DarkeProfile[]>([]);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<StatusUpdate[]>([]);
  const [snippets, setSnippets] = useState<Map<string, UserSnippet>>(new Map());
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [readCounts, setReadCounts] = useState<Map<string, number>>(new Map());
  const [myMarks, setMyMarks] = useState<Map<string, ThreadMark>>(new Map());
  const [loading, setLoading] = useState(true);
  const [openPost, setOpenPost] = useState<StatusUpdate | null>(null);
  const [detailPreviewExpanded, setDetailPreviewExpanded] = useState(false);
  const { height: detailPostHeight, persist: persistDetailPostHeight } =
    useDetailPostHeight(openPost?.id ?? null);
  const [viewedPostIds, setViewedPostIds] = useState<Set<string>>(() => new Set());
  const [comments, setComments] = useState<StatusComment[]>([]);
  const [commentPeople, setCommentPeople] = useState<Map<string, UserSnippet>>(
    new Map(),
  );
  const [detailReady, setDetailReady] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [replyTo, setReplyTo] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [commentBusy, setCommentBusy] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [fileDrag, setFileDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const allowChannelFiles = Boolean(channelId);

  function addPendingFiles(list: FileList | File[]) {
    if (!allowChannelFiles) return;
    setPendingFiles((prev) => {
      const next = [...prev];
      for (const file of Array.from(list)) {
        const blocked = channelFileAllowed(file);
        if (blocked) {
          setError(blocked);
          continue;
        }
        if (next.length >= CHANNEL_FILE_LIMIT) {
          setError(`Up to ${CHANNEL_FILE_LIMIT} files per message.`);
          break;
        }
        next.push(file);
      }
      return next;
    });
  }
  const [me, setMe] = useState<DarkeProfile | null>(null);
  const [visitUsername, setVisitUsername] = useState<string | null>(null);
  const [followBusy, setFollowBusy] = useState<string | null>(null);
  const [bookmarkBusy, setBookmarkBusy] = useState<string | null>(null);
  const [ownerMenu, setOwnerMenu] = useState<{
    kind: "post" | "comment";
    id: string;
    where?: "feed" | "detail";
  } | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [editing, setEditing] = useState<{
    kind: "post" | "comment";
    id: string;
    draft: string;
    where: "feed" | "detail" | "comment";
  } | null>(null);
  const commentInput = useRef<HTMLTextAreaElement>(null);

  const byId = useCallback(
    (userId: string) => {
      const fromList = people.find((row) => row.id === userId);
      if (fromList) return snippetFromProfile(fromList);
      if (me?.id === userId) return snippetFromProfile(me);
      return snippets.get(userId) ?? null;
    },
    [people, snippets, me],
  );

  const commentAuthors = useMemo(() => {
    const map = new Map(commentPeople);
    for (const [id, snip] of snippets) {
      if (!map.has(id)) map.set(id, snip);
    }
    for (const row of people) map.set(row.id, snippetFromProfile(row));
    if (me) map.set(me.id, snippetFromProfile(me));
    return map;
  }, [commentPeople, snippets, people, me]);

  const feedRows = useMemo(() => {
    if (feedSort === "recent") return rows;
    return [...rows].sort((a, b) => {
      const commentsB = counts.get(b.id) ?? 0;
      const commentsA = counts.get(a.id) ?? 0;
      if (commentsB !== commentsA) return commentsB - commentsA;
      return (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0);
    });
  }, [rows, feedSort, counts]);

  const reloadPeople = useCallback(() => {
    void loadPublicProfiles()
      .then(setPeople)
      .catch(() => setPeople([]));
    void loadMyFollowingIds()
      .then((ids) => setFollowingIds([...ids]))
      .catch(() => setFollowingIds([]));
    void loadMyBookmarkIds()
      .then((ids) => setBookmarkedIds(new Set(ids)))
      .catch(() => setBookmarkedIds(new Set()));
    void loadMyProfile()
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    reloadPeople();
    const t = window.setInterval(reloadPeople, 25000);
    return () => window.clearInterval(t);
  }, [reloadPeople]);

  const countRead = useCallback((postId: string) => {
    void recordBeepRead(postId)
      .then((fresh) => {
        if (!fresh) return;
        setReadCounts((prev) => {
          const next = new Map(prev);
          next.set(postId, (next.get(postId) ?? 0) + 1);
          return next;
        });
      })
      .catch(() => undefined);
  }, []);

  const applyFeedIntent = useCallback((intent: FeedIntent) => {
    const postId = intent.postId?.trim() || null;
    pendingPostId.current = postId;
    setFromProfile(intent.fromProfile?.trim() || null);
    if (intent.userId) {
      setFilterUserId(intent.userId);
      setFilterUsername(intent.username?.trim() || null);
    } else if (intent.username?.trim()) {
      const handle = intent.username.trim();
      setFilterUsername(handle);
      void loadProfileByUsername(handle)
        .then((row) => {
          if (row) setFilterUserId(row.id);
        })
        .catch(() => null);
    } else {
      setFilterUserId(null);
      setFilterUsername(null);
    }
    if (intent.compose) {
      setOpenPost(null);
      setFilterUserId(null);
      setFilterUsername(null);
      window.setTimeout(() => {
        const el = document.getElementById("newsfeed-post");
        if (el instanceof HTMLTextAreaElement) {
          el.focus();
          el.scrollIntoView({ block: "nearest" });
        }
      }, 80);
    }
    if (!postId) return;
    void loadStatusUpdate(postId)
      .then((row) => {
        if (!row) return;
        setRows((prev) =>
          prev.some((item) => item.id === row.id) ? prev : [row, ...prev],
        );
        setOpenPost(row);
        setViewedPostIds((prev) => {
          if (prev.has(row.id)) return prev;
          const seen = new Set(prev);
          seen.add(row.id);
          return seen;
        });
        countRead(row.id);
      })
      .catch(() => null);
  }, [countRead]);

  useEffect(() => {
    if (detailOnly) return;
    const boot = consumeFeedIntent();
    if (boot) applyFeedIntent(boot);
    const onIntent = (event: Event) => {
      const detail = (event as CustomEvent<FeedIntent>).detail;
      if (detail) applyFeedIntent(detail);
    };
    window.addEventListener(FEED_INTENT_EVENT, onIntent);
    return () => window.removeEventListener(FEED_INTENT_EVENT, onIntent);
  }, [applyFeedIntent, detailOnly]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const load = filterUserId
      ? loadStatusUpdates(filterUserId, FEED_STATUS_LIMIT)
      : channelId
        ? loadChannelStatusUpdates(channelId)
        : workspaceId
          ? loadWorkspaceStatusUpdates([workspaceId])
          : mode === "all"
            ? loadGlobalBeeps()
            : mode === "bookmarks"
              ? loadBookmarkedStatusUpdates()
              : loadFollowingStatusUpdates(followingIds);
    void load
      .then(async (next) => {
        if (cancelled) return;
        let list = next;
        const openId = pendingPostId.current;
        if (openId && !list.some((row) => row.id === openId)) {
          const extra = await loadStatusUpdate(openId);
          if (extra && extra.userId) {
            list = [extra, ...list.filter((row) => row.id !== extra.id)];
          }
        }
        if (cancelled) return;
        setRows(list);
        setError(null);
        const [map, reads, users, marks] = await Promise.all([
          loadCommentCounts(list.map((row) => row.id)),
          loadReadCounts(list.map((row) => row.id)).catch(
            () => new Map<string, number>(),
          ),
          loadUserSnippets(list.map((row) => row.userId)),
          me?.id
            ? loadMyThreadMarks(
                list.map((row) => row.id),
                me.id,
              )
            : Promise.resolve(new Map<string, ThreadMark>()),
        ]);
        if (cancelled) return;
        setCounts(map);
        setReadCounts(reads);
        setSnippets(users);
        setMyMarks(marks);
        if (openId) {
          const target = list.find((row) => row.id === openId);
          pendingPostId.current = null;
          if (target) {
            setOpenPost(target);
            setViewedPostIds((prev) => {
              if (prev.has(target.id)) return prev;
              const seen = new Set(prev);
              seen.add(target.id);
              return seen;
            });
            countRead(target.id);
          }
        } else if (autoOpenFirst && list.length > 0) {
          const seed = [...list].sort((a, b) =>
            a.createdAt.localeCompare(b.createdAt),
          )[0];
          if (seed) {
            setOpenPost(seed);
            setViewedPostIds((prev) => {
              if (prev.has(seed.id)) return prev;
              const seen = new Set(prev);
              seen.add(seed.id);
              return seen;
            });
            countRead(seed.id);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setRows([]);
          setError(statusError(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, followingIds.join("|"), me?.id, filterUserId, workspaceId, channelId, autoOpenFirst]);

  useEffect(() => {
    if (!openPost) {
      setComments([]);
      setDetailReady(false);
      setReplyTo(null);
      setCommentDraft("");
      setDetailPreviewExpanded(false);
      return;
    }
    let cancelled = false;
    setDetailReady(false);
    void loadStatusComments(openPost.id)
      .then(async (next) => {
        if (cancelled) return;
        setComments(next);
        if (me?.id) {
          const mark = threadMarkFor(next, me.id);
          setMyMarks((prev) => {
            const map = new Map(prev);
            if (mark) map.set(openPost.id, mark);
            else map.delete(openPost.id);
            return map;
          });
        }
        const users = await loadUserSnippets(next.map((row) => row.userId));
        if (cancelled) return;
        setCommentPeople(users);
        setCounts((prev) => {
          const map = new Map(prev);
          map.set(openPost.id, next.length);
          return map;
        });
      })
      .catch((err) => {
        if (!cancelled) setError(statusError(err));
      })
      .finally(() => {
        if (!cancelled) setDetailReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [openPost?.id]);

  async function onPost(e: FormEvent) {
    e.preventDefault();
    if (busy || readOnly) return;
    if (draft.length > STATUS_MAX) {
      setError(`Keep posts to ${STATUS_MAX} characters.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createStatusUpdate(
        draft,
        workspaceId ?? null,
        channelId ?? null,
      );
      setDraft("");
      setRows((prev) => [created, ...prev]);
      setViewedPostIds((prev) => {
        const next = new Set(prev);
        next.add(created.id);
        return next;
      });
      void refresh();
    } catch (err) {
      setError(statusError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onComment(e: FormEvent) {
    e.preventDefault();
    if (commentBusy || !openPost || readOnly) return;
    if (!commentDraft.trim() && pendingFiles.length === 0) return;
    if (commentDraft.length > COMMENT_MAX) {
      setError(`Keep replies to ${COMMENT_MAX} characters.`);
      return;
    }
    setCommentBusy(true);
    setError(null);
    try {
      const uploaded: CommentAttachment[] = [];
      if (allowChannelFiles) {
        for (const file of pendingFiles) {
          uploaded.push(await uploadChannelFile(file));
        }
      }
      const created = await createStatusComment(
        openPost.id,
        commentDraft,
        replyTo?.id ?? null,
        uploaded,
      );
      setCommentDraft("");
      setPendingFiles([]);
      setReplyTo(null);
      const snips = await loadUserSnippets([created.userId]);
      setCommentPeople((prev) => {
        const next = new Map(prev);
        const snip = snips.get(created.userId);
        if (snip) next.set(created.userId, snip);
        return next;
      });
      setComments((prev) => {
        const next = [created, ...prev];
        if (me?.id) {
          const mark = threadMarkFor(next, me.id);
          setMyMarks((cur) => {
            const map = new Map(cur);
            if (mark) map.set(openPost.id, mark);
            else map.delete(openPost.id);
            return map;
          });
        }
        return next;
      });
      setCounts((prev) => {
        const next = new Map(prev);
        next.set(openPost.id, (next.get(openPost.id) ?? 0) + 1);
        return next;
      });
      void refresh();
    } catch (err) {
      setError(statusError(err));
    } finally {
      setCommentBusy(false);
    }
  }

  const openAuthor = openPost ? byId(openPost.userId) : null;

  function backToProfile() {
    const handle = fromProfile?.trim();
    if (!handle) return;
    const self = Boolean(me && toSlug(handle) === toSlug(me.username));
    setFromProfile(null);
    setOpenPost(null);
    openProfile(handle);
    if (!self) setVisitUsername(handle);
  }

  function openComments(row: StatusUpdate) {
    setOpenPost(row);
    setDetailPreviewExpanded(false);
    setViewedPostIds((prev) => {
      if (prev.has(row.id)) return prev;
      const next = new Set(prev);
      next.add(row.id);
      return next;
    });
    countRead(row.id);
  }

  async function toggleFollow(userId: string) {
    if (!me?.id || me.id === userId || followBusy) return;
    const next = !followingIds.includes(userId);
    setFollowBusy(userId);
    setFollowingIds((prev) =>
      next ? [...prev, userId] : prev.filter((id) => id !== userId),
    );
    try {
      await setFollowing(userId, next);
    } catch {
      setFollowingIds((prev) =>
        next ? prev.filter((id) => id !== userId) : [...prev, userId],
      );
    } finally {
      setFollowBusy(null);
    }
  }

  async function toggleBookmark(postId: string) {
    if (!me?.id || bookmarkBusy) return;
    const next = !bookmarkedIds.has(postId);
    setOwnerMenu(null);
    setBookmarkBusy(postId);
    setBookmarkedIds((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(postId);
      else copy.delete(postId);
      return copy;
    });
    try {
      await setBeepBookmarked(postId, next);
      if (!next && mode === "bookmarks") {
        setRows((prev) => prev.filter((row) => row.id !== postId));
        if (openPost?.id === postId) setOpenPost(null);
      }
    } catch (err) {
      setBookmarkedIds((prev) => {
        const copy = new Set(prev);
        if (next) copy.delete(postId);
        else copy.add(postId);
        return copy;
      });
      setError(statusError(err));
    } finally {
      setBookmarkBusy(null);
    }
  }

  useEffect(() => {
    if (!ownerMenu) return;
    const close = () => setOwnerMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [ownerMenu]);

  useEffect(() => {
    if (!sortOpen) return;
    const close = () => setSortOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [sortOpen]);

  function collectCommentIds(id: string): string[] {
    const kids = comments.filter((row) => (row.parentId ?? null) === id);
    return [id, ...kids.flatMap((row) => collectCommentIds(row.id))];
  }

  async function saveEdit() {
    if (!editing) return;
    try {
      if (editing.kind === "post") {
        const next = await updateStatusUpdate(editing.id, editing.draft);
        setRows((prev) => prev.map((row) => (row.id === next.id ? next : row)));
        setOpenPost((prev) => (prev?.id === next.id ? next : prev));
      } else {
        const next = await updateStatusComment(editing.id, editing.draft);
        setComments((prev) =>
          prev.map((row) => (row.id === next.id ? next : row)),
        );
      }
      setEditing(null);
    } catch (err) {
      setError(statusError(err));
    }
  }

  async function removePost(id: string) {
    setDeleteBusy(true);
    try {
      await deleteStatusUpdate(id);
      setRows((prev) => prev.filter((row) => row.id !== id));
      if (openPost?.id === id) setOpenPost(null);
      setOwnerMenu(null);
      setPendingDeleteId(null);
    } catch (err) {
      setError(statusError(err));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function removeComment(row: StatusComment) {
    if (!window.confirm("Delete this comment?")) return;
    try {
      await deleteStatusComment(row.id);
      const gone = new Set(collectCommentIds(row.id));
      setComments((prev) => {
        const remaining = prev.filter((item) => !gone.has(item.id));
        if (me?.id) {
          const mark = threadMarkFor(remaining, me.id);
          setMyMarks((cur) => {
            const next = new Map(cur);
            if (mark) next.set(row.statusId, mark);
            else next.delete(row.statusId);
            return next;
          });
        }
        return remaining;
      });
      setCounts((prev) => {
        const next = new Map(prev);
        next.set(row.statusId, Math.max(0, (next.get(row.statusId) ?? 1) - gone.size));
        return next;
      });
      setOwnerMenu(null);
    } catch (err) {
      setError(statusError(err));
    }
  }

  return (
    <>
    <div
      className={detailOnly ? undefined : `beeper-deck beeper-deck-${variant}`}
      style={detailOnly ? { display: "contents" } : undefined}
    >
      {variant === "page" || detailOnly ? null : (
        <header
          className="beeper-chrome"
          data-beeper-drag
        >
          <div className="beeper-chrome-copy">
            <strong>{workspaceName ? workspaceName.toUpperCase() : "NEWSFEED"}</strong>
          </div>
          <div className="beeper-chrome-actions">
            {onPopOut ? (
              <button type="button" title="Pop out" onClick={onPopOut}>
                ↗
              </button>
            ) : null}
            {onMinimize ? (
              <button type="button" title="Minimize" onClick={onMinimize}>
                –
              </button>
            ) : null}
            {onMaximize ? (
              <button type="button" title="Maximize" onClick={onMaximize}>
                □
              </button>
            ) : null}
            {onClose ? (
              <button type="button" title="Close" onClick={onClose}>
                ×
              </button>
            ) : null}
          </div>
        </header>
      )}

      <div
        className={
          detailOnly
            ? undefined
            : `newsfeed-panes${variant === "page" ? " is-split" : openPost ? " is-detail" : ""}`
        }
        style={detailOnly ? { display: "contents" } : undefined}
      >
        <div
          className={detailOnly ? undefined : "newsfeed-panes-track"}
          style={detailOnly ? { display: "contents" } : undefined}
        >
          {detailOnly ? null : (
          <div className="newsfeed-pane">
                {scoped && !hideWorkspaceBanner ? (
                  <div className="ws-feed-banner">
                    <strong>{workspaceName ?? "Team"}</strong>
                    <span>Channels</span>
                  </div>
                ) : scoped ? null : (
                <div className="beeper-toggle is-triple" role="tablist" aria-label="Newsfeed">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "following"}
                    className={mode === "following" ? "is-on" : ""}
                    onClick={() => {
                      setFilterUserId(null);
                      setFilterUsername(null);
                      setMode("following");
                    }}
                  >
                    Following
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "all"}
                    className={mode === "all" ? "is-on" : ""}
                    onClick={() => {
                      setFilterUserId(null);
                      setFilterUsername(null);
                      setMode("all");
                    }}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "bookmarks"}
                    className={mode === "bookmarks" ? "is-on" : ""}
                    onClick={() => {
                      setFilterUserId(null);
                      setFilterUsername(null);
                      setMode("bookmarks");
                    }}
                  >
                    Bookmarks
                  </button>
                </div>
                )}

                {!readOnly &&
                !hideComposer &&
                !detailOnly &&
                (scoped || mode === "following" || mode === "all") ? (
                <form className="beeper-transmit" onSubmit={(e) => void onPost(e)}>
                  <div className="beeper-transmit-row">
                    <UserAvatar
                      username={me?.username ?? "you"}
                      url={me?.avatar_url ?? null}
                      className="newsfeed-compose-avatar"
                    />
                    <div className="beeper-transmit-field">
                      <textarea
                        id="newsfeed-post"
                        value={draft}
                        maxLength={STATUS_MAX}
                        rows={draft.includes("\n") ? 2 : 1}
                        placeholder="What's new?"
                        aria-label="What's new?"
                        disabled={busy}
                        onPointerDown={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          setDraft(e.target.value.slice(0, STATUS_MAX))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            e.currentTarget.form?.requestSubmit();
                          }
                        }}
                      />
                      <span
                        className={`beeper-count${draft.length >= STATUS_MAX ? " is-max" : ""}${draft.length > STATUS_MAX ? " is-over" : ""}`}
                      >
                        {draft.length}/{STATUS_MAX}
                      </span>
                    </div>
                    <button
                      type="submit"
                      className="newsfeed-post-link"
                      disabled={
                        busy ||
                        draft.trim().length === 0 ||
                        draft.length > STATUS_MAX
                      }
                    >
                      Post
                    </button>
                  </div>
                </form>
                ) : null}

            <div className="beeper-stream">
              {filterUserId || filterUsername ? (
                <div className="newsfeed-user-filter">
                  <span>
                    Posts from @{filterUsername || "user"}
                  </span>
                  <button
                    type="button"
                    className="newsfeed-user-filter-clear"
                    onClick={() => {
                      setFilterUserId(null);
                      setFilterUsername(null);
                    }}
                  >
                    Clear
                  </button>
                </div>
              ) : null}
              <FeedSortBar
                value={feedSort}
                open={sortOpen}
                onToggle={(e) => {
                  e.stopPropagation();
                  setSortOpen((prev) => !prev);
                }}
                onPick={(next) => {
                  setFeedSort(next);
                  setSortOpen(false);
                }}
              />
              {error && !openPost ? (
                <p className="error beeper-error" role="alert">
                  {error}
                </p>
              ) : null}
              {loading ? (
                <p className="muted">Loading…</p>
              ) : !filterUserId &&
                !scoped &&
                mode === "following" &&
                followingIds.length === 0 ? (
                <p className="muted">Follow people to see their posts.</p>
              ) : rows.length === 0 ? (
                <p className="muted">
                  {filterUserId || filterUsername
                    ? "No posts yet."
                    : scoped
                      ? "No posts in this workspace yet."
                      : mode === "bookmarks"
                        ? "No bookmarked posts yet."
                        : mode === "all"
                          ? "No posts yet."
                          : "No posts from people you follow yet."}
                </p>
              ) : (
                <ul className="status-list status-feed">
                  {feedRows.map((row) => (
                    <li key={row.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        className={`newsfeed-card${openPost?.id === row.id ? " is-open" : ""}`}
                        onClick={() => {
                          if (editing?.kind === "post" && editing.id === row.id) return;
                          openComments(row);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openComments(row);
                          }
                        }}
                      >
                        <NewsfeedPostCard
                          post={
                            editing?.kind === "post" && editing.id === row.id
                              ? { ...row, content: editing.draft }
                              : row
                          }
                          author={byId(row.userId)}
                          replyCount={counts.get(row.id) ?? 0}
                          readCount={readCounts.get(row.id) ?? 0}
                          viewed={viewedPostIds.has(row.id)}
                          youMark={myMarks.get(row.id) ?? null}
                          showFollow={Boolean(me?.id && me.id !== row.userId)}
                          isFollowing={followingIds.includes(row.userId)}
                          followBusy={followBusy === row.userId}
                          onFollow={() => void toggleFollow(row.userId)}
                          onVisit={setVisitUsername}
                          bookmarked={bookmarkedIds.has(row.id)}
                          onBookmark={
                            me?.id
                              ? () => void toggleBookmark(row.id)
                              : undefined
                          }
                          isOwner={me?.id === row.userId}
                          menuOpen={
                            ownerMenu?.kind === "post" &&
                            ownerMenu.id === row.id &&
                            ownerMenu.where === "feed"
                          }
                          onMenu={(e) => {
                            e.stopPropagation();
                            setOwnerMenu((prev) =>
                              prev?.kind === "post" &&
                              prev.id === row.id &&
                              prev.where === "feed"
                                ? null
                                : { kind: "post", id: row.id, where: "feed" },
                            );
                          }}
                          onMarkUnread={
                            viewedPostIds.has(row.id)
                              ? () => {
                                  setOwnerMenu(null);
                                  setViewedPostIds((prev) => {
                                    if (!prev.has(row.id)) return prev;
                                    const next = new Set(prev);
                                    next.delete(row.id);
                                    return next;
                                  });
                                }
                              : undefined
                          }
                          onEdit={() => {
                            setOwnerMenu(null);
                            setEditing({
                              kind: "post",
                              id: row.id,
                              draft: row.content.slice(0, STATUS_MAX),
                              where: "feed",
                            });
                          }}
                          onDelete={() => {
                            setOwnerMenu(null);
                            setPendingDeleteId(row.id);
                          }}
                          editing={
                            editing?.kind === "post" &&
                            editing.id === row.id &&
                            editing.where === "feed"
                          }
                          editDraft={
                            editing?.kind === "post" && editing.id === row.id
                              ? editing.draft
                              : ""
                          }
                          onEditDraft={(value) =>
                            setEditing((prev) =>
                              prev ? { ...prev, draft: value } : prev,
                            )
                          }
                          onSaveEdit={() => void saveEdit()}
                          onCancelEdit={() => setEditing(null)}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          )}

          <div
            className={`newsfeed-pane newsfeed-detail${
              detailOnly
                ? ""
                : `${detailPreviewExpanded ? " is-post-expanded" : ""}${detailPostHeight && !detailPreviewExpanded ? " is-post-sized" : ""}${openPost ? "" : " is-idle"}`
            }`}
          >
            {openPost && fromProfile && !detailOnly ? (
              <button
                type="button"
                className="newsfeed-profile-back"
                onClick={backToProfile}
              >
                ← Back to Profile
              </button>
            ) : openPost && variant !== "page" && !detailOnly ? (
              <button
                type="button"
                className="newsfeed-back"
                onClick={() => setOpenPost(null)}
              >
                ← Back to Feed
              </button>
            ) : null}
            {openPost ? detailHead : null}
            {openPost ? (
              <>
                {detailOnly ? null : (
                <>
                <div
                  className={`newsfeed-original${detailPostHeight && !detailPreviewExpanded ? " is-sized" : ""}`}
                  style={
                    detailPostHeight && !detailPreviewExpanded
                      ? ({
                          ["--detail-post-h"]: `${detailPostHeight}px`,
                        } as CSSProperties)
                      : undefined
                  }
                >
                  <NewsfeedPostCard
                    post={
                      editing?.kind === "post" && editing.id === openPost.id
                        ? { ...openPost, content: editing.draft }
                        : openPost
                    }
                    author={openAuthor}
                    replyCount={
                      detailReady
                        ? comments.length
                        : (counts.get(openPost.id) ?? 0)
                    }
                    readCount={readCounts.get(openPost.id) ?? 0}
                    viewed
                    compact
                    showYouMark={false}
                    previewExpanded={detailPreviewExpanded}
                    onPreviewExpand={(expanded) => {
                      setDetailPreviewExpanded(expanded);
                    }}
                    youMark={myMarks.get(openPost.id) ?? null}
                    showFollow={Boolean(me?.id && me.id !== openPost.userId)}
                    isFollowing={followingIds.includes(openPost.userId)}
                    followBusy={followBusy === openPost.userId}
                    onFollow={() => void toggleFollow(openPost.userId)}
                    onVisit={setVisitUsername}
                    bookmarked={bookmarkedIds.has(openPost.id)}
                    onBookmark={
                      me?.id
                        ? () => void toggleBookmark(openPost.id)
                        : undefined
                    }
                    isOwner={me?.id === openPost.userId}
                    menuOpen={
                      ownerMenu?.kind === "post" &&
                      ownerMenu.id === openPost.id &&
                      ownerMenu.where === "detail"
                    }
                    onMenu={(e) => {
                      e.stopPropagation();
                      setOwnerMenu((prev) =>
                        prev?.kind === "post" &&
                        prev.id === openPost.id &&
                        prev.where === "detail"
                          ? null
                          : { kind: "post", id: openPost.id, where: "detail" },
                      );
                    }}
                    onMarkUnread={() => {
                      setOwnerMenu(null);
                      setViewedPostIds((prev) => {
                        if (!prev.has(openPost.id)) return prev;
                        const next = new Set(prev);
                        next.delete(openPost.id);
                        return next;
                      });
                    }}
                    onEdit={() => {
                      setOwnerMenu(null);
                      setDetailPreviewExpanded(true);
                      setEditing({
                        kind: "post",
                        id: openPost.id,
                        draft: openPost.content.slice(0, STATUS_MAX),
                        where: "detail",
                      });
                    }}
                    onDelete={() => {
                      setOwnerMenu(null);
                      setPendingDeleteId(openPost.id);
                    }}
                    editing={
                      editing?.kind === "post" &&
                      editing.id === openPost.id &&
                      editing.where === "detail"
                    }
                    editDraft={
                      editing?.kind === "post" && editing.id === openPost.id
                        ? editing.draft
                        : ""
                    }
                    onEditDraft={(value) =>
                      setEditing((prev) =>
                        prev ? { ...prev, draft: value } : prev,
                      )
                    }
                    onSaveEdit={() => void saveEdit()}
                    onCancelEdit={() => setEditing(null)}
                  />
                </div>
                <NewsfeedPostResize
                  onHeight={persistDetailPostHeight}
                  onBegin={() => setDetailPreviewExpanded(false)}
                />
                </>
                )}
                <div className="newsfeed-detail-scroll">
                  {detailLead}
                  {error ? (
                    <p className="error beeper-error" role="alert">
                      {error}
                    </p>
                  ) : null}
                  {!detailReady ? (
                    <p className="muted newsfeed-comments-empty">Loading…</p>
                  ) : comments.length === 0 ? null : (
                    <NewsfeedCommentTree
                      comments={comments}
                      people={commentAuthors}
                      parentId={null}
                      replyToId={replyTo?.id ?? null}
                      onReply={(comment, who) => {
                        setReplyTo({
                          id: comment.id,
                          name: snippetDisplayName(who),
                        });
                        window.setTimeout(() => commentInput.current?.focus(), 0);
                      }}
                      postAuthorId={openPost.userId}
                      meId={me?.id ?? null}
                      menuId={
                        ownerMenu?.kind === "comment" ? ownerMenu.id : null
                      }
                      onMenu={(e, id) => {
                        e.stopPropagation();
                        setOwnerMenu((prev) =>
                          prev?.kind === "comment" && prev.id === id
                            ? null
                            : { kind: "comment", id },
                        );
                      }}
                      onEdit={(row) => {
                        setOwnerMenu(null);
                        setEditing({
                          kind: "comment",
                          id: row.id,
                          draft: row.content,
                          where: "comment",
                        });
                      }}
                      onDelete={(row) => void removeComment(row)}
                      editingId={
                        editing?.kind === "comment" ? editing.id : null
                      }
                      editDraft={
                        editing?.kind === "comment" ? editing.draft : ""
                      }
                      onEditDraft={(value) =>
                        setEditing((prev) =>
                          prev ? { ...prev, draft: value } : prev,
                        )
                      }
                      onSaveEdit={() => void saveEdit()}
                      onCancelEdit={() => setEditing(null)}
                      followingIds={followingIds}
                      followBusy={followBusy}
                      onFollow={(userId) => void toggleFollow(userId)}
                      onVisit={setVisitUsername}
                    />
                  )}
                </div>
                {readOnly ? (
                  <p className="muted newsfeed-detail-footer">
                    This workspace is read only.
                  </p>
                ) : (
                <form
                  className={`newsfeed-detail-footer${fileDrag ? " is-drop" : ""}`}
                  onSubmit={(e) => void onComment(e)}
                  onDragOver={
                    allowChannelFiles
                      ? (e) => {
                          e.preventDefault();
                          setFileDrag(true);
                        }
                      : undefined
                  }
                  onDragLeave={
                    allowChannelFiles
                      ? () => setFileDrag(false)
                      : undefined
                  }
                  onDrop={
                    allowChannelFiles
                      ? (e) => {
                          e.preventDefault();
                          setFileDrag(false);
                          addPendingFiles(e.dataTransfer.files);
                        }
                      : undefined
                  }
                >
                  {replyTo ? (
                    <div className="newsfeed-replying">
                      <span>Replying to {replyTo.name}</span>
                      <button
                        type="button"
                        onClick={() => setReplyTo(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : null}
                  {allowChannelFiles && pendingFiles.length > 0 ? (
                    <ul className="channel-attach-pending">
                      {pendingFiles.map((file, i) => (
                        <li key={`${file.name}-${i}`}>
                          <span>{file.name}</span>
                          <button
                            type="button"
                            aria-label={`Remove ${file.name}`}
                            onClick={() =>
                              setPendingFiles((prev) =>
                                prev.filter((_, idx) => idx !== i),
                              )
                            }
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="beeper-transmit-row">
                    <UserAvatar
                      username={me?.username ?? "you"}
                      url={me?.avatar_url ?? null}
                      className="newsfeed-compose-avatar"
                    />
                    <div className="beeper-transmit-field">
                      <textarea
                        ref={commentInput}
                        value={commentDraft}
                        maxLength={COMMENT_MAX}
                        rows={commentDraft.includes("\n") ? 2 : 1}
                        placeholder={
                          allowChannelFiles
                            ? "Message or drop a file..."
                            : "Enter comment..."
                        }
                        aria-label={
                          allowChannelFiles ? "Channel message" : "Enter comment"
                        }
                        disabled={commentBusy}
                        onPointerDown={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          setCommentDraft(e.target.value.slice(0, COMMENT_MAX))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            e.currentTarget.form?.requestSubmit();
                          }
                        }}
                      />
                      <span
                        className={`beeper-count${commentDraft.length >= COMMENT_MAX ? " is-max" : ""}${commentDraft.length > COMMENT_MAX ? " is-over" : ""}`}
                      >
                        {commentDraft.length}/{COMMENT_MAX}
                      </span>
                    </div>
                    {allowChannelFiles ? (
                      <>
                        <input
                          ref={fileInput}
                          type="file"
                          hidden
                          multiple
                          onChange={(e) => {
                            if (e.target.files) addPendingFiles(e.target.files);
                            e.target.value = "";
                          }}
                        />
                        <button
                          type="button"
                          className="channel-attach-btn"
                          aria-label="Attach file"
                          disabled={commentBusy}
                          onClick={() => fileInput.current?.click()}
                        >
                          <IconPaperclip />
                        </button>
                      </>
                    ) : null}
                    <button
                      type="submit"
                      className="newsfeed-post-link"
                      disabled={
                        commentBusy ||
                        commentDraft.length > COMMENT_MAX ||
                        (!commentDraft.trim() && pendingFiles.length === 0)
                      }
                    >
                      Post
                    </button>
                  </div>
                </form>
                )}
              </>
            ) : detailOnly ? (
              <>
                <div className="newsfeed-detail-scroll">
                  {detailLead}
                  {detailLead || detailHead ? null : (
                  <p className="muted newsfeed-comments-empty">
                    Select a channel to read replies.
                  </p>
                  )}
                </div>
                <div className="newsfeed-detail-footer">
                  <div className="beeper-transmit-row">
                    <UserAvatar
                      username={me?.username ?? "you"}
                      url={me?.avatar_url ?? null}
                      className="newsfeed-compose-avatar"
                    />
                    <div className="beeper-transmit-field">
                      <textarea
                        rows={1}
                        placeholder="Enter comment..."
                        aria-label="Enter comment"
                        disabled
                      />
                      <span className="beeper-count">0/{COMMENT_MAX}</span>
                    </div>
                    <button type="button" className="newsfeed-post-link" disabled>
                      Post
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="newsfeed-detail-idle" aria-hidden />
            )}
          </div>
        </div>
      </div>
    </div>
    {pendingDeleteId ? (
      <ConfirmDeletePost
        busy={deleteBusy}
        onCancel={() => {
          if (!deleteBusy) setPendingDeleteId(null);
        }}
        onConfirm={() => void removePost(pendingDeleteId)}
      />
    ) : null}
    {visitUsername ? (
      <ProfileViewModal
        username={visitUsername}
        viewerSlug={me?.username ?? ""}
        onBack={() => setVisitUsername(null)}
        backLabel="Back"
        onUsernameChange={setVisitUsername}
      />
    ) : null}
    </>
  );
}

export function NewsfeedStandalone() {
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  const winClose = useCallback(() => {
    window.close();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await hydrateThemeFromVault().catch(() => null);
        const ok = await sessionIsSignedIn();
        if (cancelled) return;
        if (!ok) {
          setBootError("Not signed in. Close this window and sign in from DARKE.");
        }
      } catch {
        if (!cancelled) {
          setBootError("Not signed in. Close this window and sign in from DARKE.");
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div className="beeper-popout-root">
        <header className="beeper-chrome">
          <div className="beeper-chrome-copy">
            <strong>NEWSFEED</strong>
          </div>
          <div className="beeper-chrome-actions">
            <button type="button" title="Close" onClick={winClose}>
              ×
            </button>
          </div>
        </header>
        <p className="muted" style={{ padding: 16 }}>
          Loading…
        </p>
      </div>
    );
  }

  return (
    <div className="beeper-popout-root">
      {bootError ? (
        <>
          <header className="beeper-chrome">
            <div className="beeper-chrome-copy">
              <strong>NEWSFEED</strong>
            </div>
            <div className="beeper-chrome-actions">
              <button type="button" title="Close" onClick={winClose}>
                ×
              </button>
            </div>
          </header>
          <p className="error" role="alert" style={{ padding: 16 }}>
            {bootError}
          </p>
        </>
      ) : (
        <NewsfeedDeck
          variant="window"
          onClose={winClose}
        />
      )}
    </div>
  );
}

export function NewsfeedWindow({
  open,
  popped,
  onClose,
  onPopped,
  onRestored,
}: {
  open: boolean;
  popped: boolean;
  onClose: () => void;
  onPopped: () => void;
  onRestored: () => void;
}) {
  const [box, setBox] = useState<FloatState>(() => readFloat());
  const drag = useRef<{
    kind: "move" | "resize";
    sx: number;
    sy: number;
    ox: number;
    oy: number;
    ow: number;
    oh: number;
  } | null>(null);

  useEffect(() => {
    writeFloat(box);
  }, [box]);

  useEffect(() => {
    if (!popped) return;
    const tick = window.setInterval(() => {
      if (!newsfeedPopout || newsfeedPopout.closed) onRestored();
    }, 500);
    return () => window.clearInterval(tick);
  }, [popped, onRestored]);

  function onPointerDown(kind: "move" | "resize", e: PointerEvent) {
    const target = e.target as HTMLElement;
    if (kind === "move") {
      if (target.closest("input, textarea, select, button, a")) return;
      if (!target.closest(".beeper-chrome")) return;
      if (target.closest(".beeper-chrome-actions")) return;
    }
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = {
      kind,
      sx: e.clientX,
      sy: e.clientY,
      ox: box.x,
      oy: box.y,
      ow: box.w,
      oh: box.h,
    };
  }

  function onPointerMove(e: PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (d.kind === "move") {
      setBox((prev) => clampFloat({ ...prev, x: d.ox + dx, y: d.oy + dy }));
    } else {
      setBox((prev) =>
        clampFloat({ ...prev, w: d.ow + dx, h: d.oh + dy }),
      );
    }
  }

  function onPointerUp() {
    drag.current = null;
  }

  if (!open || popped) return null;

  return (
    <div
      className={`beeper-float${box.minimized ? " is-min" : ""}`}
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.minimized ? undefined : box.h,
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className="beeper-float-drag"
        onPointerDown={(e) => {
          onPointerDown("move", e);
        }}
      >
        <NewsfeedDeck
          variant="float"
          onPopOut={() => {
            void focusOrOpenNewsfeedPopout().then((ok) => {
              if (ok) onPopped();
            });
          }}
          onMinimize={() =>
            setBox((prev) => ({ ...prev, minimized: !prev.minimized }))
          }
          onClose={onClose}
        />
      </div>
      {!box.minimized ? (
        <div
          className="beeper-resize"
          onPointerDown={(e) => onPointerDown("resize", e)}
        />
      ) : null}
    </div>
  );
}
