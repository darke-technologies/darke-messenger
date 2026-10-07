import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  loadUnreadNotificationCount,
  loadMyNotifications,
  markAllNotificationsRead,
  markNotificationsRead,
  markNotificationsUnread,
  notificationAction,
  notificationsError,
  pickCommentForNotice,
  type DarkeNotification,
  isPendingInviteNotice,
} from "./notifications";
import {
  COMMENT_MAX,
  STATUS_MAX,
  createStatusComment,
  deleteStatusComment,
  deleteStatusUpdate,
  loadReadCounts,
  loadStatusComments,
  loadStatusUpdate,
  loadUserSnippets,
  feedCardTime,
  exactTime,
  relativeTime,
  snippetDisplayName,
  statusError,
  updateStatusComment,
  updateStatusUpdate,
  type StatusComment,
  type StatusUpdate,
  type UserSnippet,
} from "./status";
import { followsError, loadMyFollowingIds, setFollowing } from "./follows";
import {
  acceptPendingInvite,
  blockInviter,
  declinePendingInvite,
  workspaceError,
} from "./workspaces";
import { FollowButton } from "./followsUi";
import { NewsfeedPostResize, useDetailPostHeight } from "./NewsfeedPostResize";
import { IconComment, IconViews } from "./icons";
import { PersonPeek } from "./PersonPeek";
import { loadMyProfile, type DarkeProfile } from "./profile";
import { ProfileViewModal } from "./ProfileViewModal";
import { UserAvatar } from "./UserAvatar";
import { useWorkspacesMaybe } from "./WorkspaceContext";

type Ctx = {
  unread: number;
  rows: DarkeNotification[];
  refresh: () => Promise<void>;
  markRead: (ids: string[]) => Promise<void>;
  markUnread: (ids: string[]) => Promise<void>;
  markAllRead: () => Promise<void>;
};

const NotificationsContext = createContext<Ctx>({
  unread: 0,
  rows: [],
  refresh: async () => {},
  markRead: async () => {},
  markUnread: async () => {},
  markAllRead: async () => {},
});

export function useNotifications() {
  return useContext(NotificationsContext);
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [unread, setUnread] = useState(0);
  const [rows, setRows] = useState<DarkeNotification[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [n, list] = await Promise.all([
        loadUnreadNotificationCount(),
        loadMyNotifications(),
      ]);
      setUnread(n);
      setRows(list);
    } catch {
      // Tables may not exist until phase50.sql is run.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 30000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const markRead = useCallback(async (ids: string[]) => {
    await markNotificationsRead(ids);
    await refresh();
  }, [refresh]);

  const markUnread = useCallback(async (ids: string[]) => {
    await markNotificationsUnread(ids);
    await refresh();
  }, [refresh]);

  const markAll = useCallback(async () => {
    await markAllNotificationsRead();
    await refresh();
  }, [refresh]);

  return (
    <NotificationsContext.Provider
      value={{ unread, rows, refresh, markRead, markUnread, markAllRead: markAll }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

function InviteActions({
  inviteId,
  actorId,
  busy,
  onAccept,
  onDecline,
  onBlock,
}: {
  inviteId: string;
  actorId: string;
  busy: boolean;
  onAccept: (inviteId: string) => void;
  onDecline: (inviteId: string) => void;
  onBlock: (actorId: string, inviteId: string) => void;
}) {
  return (
    <div className="notify-actions" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="projects-choice-btn is-primary"
        disabled={busy}
        onClick={() => onAccept(inviteId)}
      >
        Accept
      </button>
      <button
        type="button"
        className="newsfeed-confirm-cancel"
        disabled={busy}
        onClick={() => onDecline(inviteId)}
      >
        Decline
      </button>
      <button
        type="button"
        className="notify-block-btn"
        disabled={busy}
        onClick={() => onBlock(actorId, inviteId)}
      >
        Block User from Inviting Me
      </button>
    </div>
  );
}

function FollowActions({
  actorId,
  following,
  busy,
  onFollowBack,
}: {
  actorId: string;
  following: boolean;
  busy: boolean;
  onFollowBack: (actorId: string) => void;
}) {
  return (
    <div className="notify-actions">
      <FollowButton
        isFollowing={following}
        busy={busy}
        followLabel="Follow Back"
        onToggle={() => onFollowBack(actorId)}
      />
    </div>
  );
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
        aria-labelledby="notify-delete-post-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 id="notify-delete-post-title" className="newsfeed-confirm-title">
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
  onEdit,
  onDelete,
}: {
  open: boolean;
  onToggle: (e: MouseEvent) => void;
  onMarkUnread?: () => void;
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

function isThreadRoot(row: StatusComment, comments: StatusComment[]): boolean {
  const parentId = row.parentId ?? null;
  if (!parentId) return true;
  return !comments.some((c) => c.id === parentId);
}

function NotifyThread({
  comments,
  people,
  parentId,
  activeId,
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
  activeId: string | null;
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
  followingIds: Set<string>;
  followBusy: string | null;
  onFollow: (userId: string) => void;
  onVisit: (username: string) => void;
}) {
  const rows = comments
    .filter((row) =>
      parentId
        ? (row.parentId ?? null) === parentId
        : isThreadRoot(row, comments),
    )
    .slice()
    .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
  if (rows.length === 0) return null;
  return (
    <ul className={`newsfeed-thread${parentId ? " is-nested" : ""}`}>
      {rows.map((row) => {
        const who = people.get(row.userId) ?? null;
        const handle = who?.username ?? "unknown";
        const name = snippetDisplayName(who, handle);
        const canFollow = Boolean(meId && meId !== row.userId);
        const highlight = activeId === row.id;
        const parent = row.parentId
          ? comments.find((c) => c.id === row.parentId)
          : null;
        const replyToHandle = parent
          ? (people.get(parent.userId)?.username ?? null)
          : null;
        return (
          <li
            key={row.id}
            className={`newsfeed-comment${highlight ? " is-target" : ""}`}
          >
            <div className="newsfeed-comment-row" data-notify-comment={row.id}>
            <PersonPeek
              person={who}
              showFollow={canFollow}
              isFollowing={followingIds.has(row.userId)}
              followBusy={followBusy === row.userId}
              onFollow={() => onFollow(row.userId)}
              onVisit={onVisit}
            >
              <UserAvatar
                username={handle}
                url={who?.avatarUrl ?? null}
                className="newsfeed-comment-photo"
              />
            </PersonPeek>
            <div className="newsfeed-comment-body">
              <div className="newsfeed-comment-byline">
                <PersonPeek
                  person={who}
                  showFollow={canFollow}
                  isFollowing={followingIds.has(row.userId)}
                  followBusy={followBusy === row.userId}
                  onFollow={() => onFollow(row.userId)}
                  onVisit={onVisit}
                >
                  <span className="newsfeed-card-name">{name}</span>
                </PersonPeek>
                {postAuthorId && row.userId === postAuthorId ? (
                  <span className="newsfeed-author-badge">Author</span>
                ) : null}
                <span className="newsfeed-card-dot" aria-hidden>
                  ·
                </span>
                <span className="newsfeed-card-at">@{handle}</span>
                {canFollow ? (
                  <>
                    <span className="newsfeed-card-dot" aria-hidden>
                      ·
                    </span>
                    <FollowButton
                      isFollowing={followingIds.has(row.userId)}
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
              ) : (
                <p className="newsfeed-comment-text">
                  {replyToHandle ? (
                    <span className="newsfeed-reply-at">@{replyToHandle}</span>
                  ) : null}
                  {row.content}
                </p>
              )}
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
            {comments.some((c) => c.parentId === row.id) ? (
              <NotifyThread
                comments={comments}
                people={people}
                parentId={row.id}
                activeId={activeId}
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

function NotifyCommentPane({
  row,
  me,
  followingIds,
  followBusy,
  onFollow,
  onVisit,
  onPostDeleted,
}: {
  row: DarkeNotification;
  me: DarkeProfile | null;
  followingIds: Set<string>;
  followBusy: string | null;
  onFollow: (userId: string) => void;
  onVisit: (username: string) => void;
  onPostDeleted?: () => void;
}) {
  const { refresh } = useNotifications();
  const [post, setPost] = useState<StatusUpdate | null>(null);
  const [comments, setComments] = useState<StatusComment[]>([]);
  const [people, setPeople] = useState<Map<string, UserSnippet>>(new Map());
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [readCount, setReadCount] = useState(0);
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [ownerMenu, setOwnerMenu] = useState<{
    kind: "post" | "comment";
    id: string;
  } | null>(null);
  const [editing, setEditing] = useState<{
    kind: "post" | "comment";
    id: string;
    draft: string;
  } | null>(null);
  const [pendingDeletePost, setPendingDeletePost] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const commentInput = useRef<HTMLTextAreaElement>(null);
  const threadScroll = useRef<HTMLDivElement>(null);
  const { height: postHeight, persist: persistPostHeight } = useDetailPostHeight(
    row.beepId || null,
  );

  useEffect(() => {
    const beepId = row.beepId;
    setDraft("");
    setReplyTo(null);
    setOwnerMenu(null);
    setEditing(null);
    setPendingDeletePost(false);
    if (!beepId) {
      setPost(null);
      setComments([]);
      setReady(true);
      return;
    }
    let cancelled = false;
    setReady(false);
    void Promise.all([
      loadStatusUpdate(beepId),
      loadStatusComments(beepId),
      loadReadCounts([beepId]).catch(() => new Map<string, number>()),
    ])
      .then(async ([nextPost, nextComments, reads]) => {
        const ids = [
          nextPost?.userId ?? "",
          ...nextComments.map((c) => c.userId),
        ].filter(Boolean);
        const snippets = await loadUserSnippets(ids);
        if (cancelled) return;
        setPost(nextPost);
        setComments(nextComments);
        setPeople(snippets);
        setReadCount(reads.get(beepId) ?? 0);
        const target = pickCommentForNotice(row, nextComments);
        if (target) {
          const who = snippets.get(target.userId) ?? null;
          setReplyTo({
            id: target.id,
            name: snippetDisplayName(who),
          });
        }
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setPost(null);
          setComments([]);
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [row.id, row.beepId, row.commentId]);

  const author = post ? people.get(post.userId) ?? null : null;
  const handle = author?.username ?? "unknown";
  const name = snippetDisplayName(author, handle);
  const headline = author?.headline?.trim() || "";
  const activeId = ready
    ? (pickCommentForNotice(row, comments)?.id ?? row.commentId)
    : null;
  const canFollowPost = Boolean(me?.id && post && me.id !== post.userId);

  useEffect(() => {
    if (!ready || !activeId) return;
    let cancelled = false;
    const jump = () => {
      if (cancelled) return;
      const el = threadScroll.current?.querySelector(
        `[data-notify-comment="${CSS.escape(activeId)}"]`,
      );
      if (el instanceof HTMLElement) {
        el.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    };
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(jump);
    });
    const timer = window.setTimeout(jump, 80);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [ready, activeId, comments.length, row.id]);

  function startReply(comment: StatusComment, who: UserSnippet | null) {
    setReplyTo({
      id: comment.id,
      name: snippetDisplayName(who),
    });
    window.setTimeout(() => commentInput.current?.focus(), 0);
  }

  async function onComment(e: { preventDefault: () => void }) {
    e.preventDefault();
    if (!post || busy) return;
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    try {
      const created = await createStatusComment(
        post.id,
        text,
        replyTo?.id ?? null,
      );
      setComments((prev) => [created, ...prev]);
      setDraft("");
      setReplyTo(null);
      void refresh();
    } catch (err) {
      window.alert(statusError(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!ownerMenu) return;
    const close = () => setOwnerMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [ownerMenu]);

  function collectCommentIds(id: string): string[] {
    const kids = comments.filter((item) => (item.parentId ?? null) === id);
    return [id, ...kids.flatMap((item) => collectCommentIds(item.id))];
  }

  async function saveEdit() {
    if (!editing) return;
    try {
      if (editing.kind === "post") {
        const next = await updateStatusUpdate(editing.id, editing.draft);
        setPost(next);
      } else {
        const next = await updateStatusComment(editing.id, editing.draft);
        setComments((prev) =>
          prev.map((item) => (item.id === next.id ? next : item)),
        );
      }
      setEditing(null);
    } catch (err) {
      window.alert(statusError(err));
    }
  }

  async function removePost() {
    if (!post) return;
    setDeleteBusy(true);
    try {
      await deleteStatusUpdate(post.id);
      setPost(null);
      setComments([]);
      setPendingDeletePost(false);
      setOwnerMenu(null);
      void refresh();
      onPostDeleted?.();
    } catch (err) {
      window.alert(statusError(err));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function removeComment(item: StatusComment) {
    if (!window.confirm("Delete this comment?")) return;
    try {
      await deleteStatusComment(item.id);
      const gone = new Set(collectCommentIds(item.id));
      setComments((prev) => prev.filter((c) => !gone.has(c.id)));
      setOwnerMenu(null);
      if (replyTo && gone.has(replyTo.id)) setReplyTo(null);
      void refresh();
    } catch (err) {
      window.alert(statusError(err));
    }
  }

  const ownPost = Boolean(me?.id && post && me.id === post.userId);

  return (
    <>
      {post ? (
        <div
          className={`newsfeed-original${postHeight ? " is-sized" : ""}`}
          style={
            postHeight
              ? ({ ["--detail-post-h"]: `${postHeight}px` } as CSSProperties)
              : undefined
          }
        >
          <div
            className={`newsfeed-card-inner is-compact${headline ? " has-headline" : ""}`}
          >
              <PersonPeek
                person={author}
                showFollow={canFollowPost}
                isFollowing={followingIds.has(post.userId)}
                followBusy={followBusy === post.userId}
                onFollow={() => onFollow(post.userId)}
                onVisit={onVisit}
              >
                <UserAvatar
                  username={handle}
                  url={author?.avatarUrl ?? null}
                  className="newsfeed-card-photo"
                />
              </PersonPeek>
              <div className="newsfeed-card-main">
                <div className="newsfeed-card-identity">
                  <div className="newsfeed-card-byline">
                    <PersonPeek
                      person={author}
                      showFollow={canFollowPost}
                      isFollowing={followingIds.has(post.userId)}
                      followBusy={followBusy === post.userId}
                      onFollow={() => onFollow(post.userId)}
                      onVisit={onVisit}
                    >
                      <span className="newsfeed-card-name">{name}</span>
                    </PersonPeek>
                    <span className="newsfeed-card-dot" aria-hidden>
                      ·
                    </span>
                    <span className="newsfeed-card-at">@{handle}</span>
                    {canFollowPost ? (
                      <>
                        <span className="newsfeed-card-dot" aria-hidden>
                          ·
                        </span>
                        <FollowButton
                          isFollowing={followingIds.has(post.userId)}
                          busy={followBusy === post.userId}
                          onToggle={() => onFollow(post.userId)}
                          className="newsfeed-follow"
                          variant="text"
                        />
                      </>
                    ) : null}
                  </div>
                  {headline ? (
                    <p className="newsfeed-card-headline">{headline}</p>
                  ) : null}
                </div>
                {editing?.kind === "post" && editing.id === post.id ? (
                  <div
                    className="newsfeed-inline-edit"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <AutoGrowField
                      value={editing.draft}
                      maxLength={STATUS_MAX}
                      onChange={(value) =>
                        setEditing((prev) =>
                          prev ? { ...prev, draft: value } : prev,
                        )
                      }
                    />
                    <div className="newsfeed-inline-edit-actions">
                      <button
                        type="button"
                        className="newsfeed-edit-save"
                        onClick={() => void saveEdit()}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="newsfeed-edit-cancel"
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="newsfeed-post-bubble">
                    <p className="newsfeed-card-text">{post.content}</p>
                  </div>
                )}
                <div className="newsfeed-card-foot">
                  <p className="newsfeed-you-mark">
                    <span
                      className="newsfeed-stat"
                      aria-label={`${comments.length} ${comments.length === 1 ? "comment" : "comments"}`}
                    >
                      <IconComment className="newsfeed-stat-icon" />
                      {comments.length}
                    </span>
                    <span className="newsfeed-card-dot" aria-hidden>
                      ·
                    </span>
                    <span className="newsfeed-stat" aria-label={`Read by ${readCount}`}>
                      <IconViews className="newsfeed-stat-icon" />
                      {readCount}
                    </span>
                  </p>
                </div>
              </div>
              <div className="newsfeed-card-aside">
                <span className="newsfeed-card-time" title={exactTime(post.createdAt)}>
                  {feedCardTime(post.createdAt)}
                </span>
                {ownPost ? (
                  <OwnerMenu
                    open={
                      ownerMenu?.kind === "post" && ownerMenu.id === post.id
                    }
                    onToggle={(e) => {
                      e.stopPropagation();
                      setOwnerMenu((prev) =>
                        prev?.kind === "post" && prev.id === post.id
                          ? null
                          : { kind: "post", id: post.id },
                      );
                    }}
                    onEdit={() => {
                      setOwnerMenu(null);
                      setEditing({
                        kind: "post",
                        id: post.id,
                        draft: post.content.slice(0, STATUS_MAX),
                      });
                    }}
                    onDelete={() => {
                      setOwnerMenu(null);
                      setPendingDeletePost(true);
                    }}
                  />
                ) : null}
              </div>
          </div>
        </div>
      ) : null}
      {post ? <NewsfeedPostResize onHeight={persistPostHeight} /> : null}
      <div className="newsfeed-detail-scroll" ref={threadScroll}>
        {!ready ? (
          <p className="muted newsfeed-comments-empty">Loading…</p>
        ) : comments.length === 0 ? null : (
          <NotifyThread
            comments={comments}
            people={people}
            parentId={null}
            activeId={activeId}
            onReply={startReply}
            postAuthorId={post?.userId ?? null}
            meId={me?.id ?? null}
            menuId={ownerMenu?.kind === "comment" ? ownerMenu.id : null}
            onMenu={(e, id) => {
              e.stopPropagation();
              setOwnerMenu((prev) =>
                prev?.kind === "comment" && prev.id === id
                  ? null
                  : { kind: "comment", id },
              );
            }}
            onEdit={(item) => {
              setOwnerMenu(null);
              setEditing({
                kind: "comment",
                id: item.id,
                draft: item.content.slice(0, COMMENT_MAX),
              });
            }}
            onDelete={(item) => void removeComment(item)}
            editingId={editing?.kind === "comment" ? editing.id : null}
            editDraft={editing?.kind === "comment" ? editing.draft : ""}
            onEditDraft={(value) =>
              setEditing((prev) =>
                prev?.kind === "comment" ? { ...prev, draft: value } : prev,
              )
            }
            onSaveEdit={() => void saveEdit()}
            onCancelEdit={() => setEditing(null)}
            followingIds={followingIds}
            followBusy={followBusy}
            onFollow={onFollow}
            onVisit={onVisit}
          />
        )}
      </div>
      <form className="newsfeed-detail-footer" onSubmit={(e) => void onComment(e)}>
        {replyTo ? (
          <div className="newsfeed-replying">
            <span>Replying to {replyTo.name}</span>
            <button type="button" onClick={() => setReplyTo(null)}>
              Cancel
            </button>
          </div>
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
              value={draft}
              maxLength={COMMENT_MAX}
              rows={draft.includes("\n") ? 2 : 1}
              placeholder="Enter comment..."
              aria-label="Enter comment"
              disabled={busy || !post}
              onChange={(e) => setDraft(e.target.value.slice(0, COMMENT_MAX))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <span className="beeper-count">
              {draft.length}/{COMMENT_MAX}
            </span>
          </div>
          <button
            type="submit"
            className="newsfeed-post-link"
            disabled={busy || !post || !draft.trim()}
          >
            Post
          </button>
        </div>
      </form>
      {pendingDeletePost ? (
        <ConfirmDeletePost
          busy={deleteBusy}
          onCancel={() => {
            if (!deleteBusy) setPendingDeletePost(false);
          }}
          onConfirm={() => void removePost()}
        />
      ) : null}
    </>
  );
}

export function NotificationList({
  onOpenPerson,
  onOpenFollow,
  onSelect,
  selectedId = null,
  showEmpty = false,
  followingIds,
  followBusy,
  onFollowBack,
  onFollow,
  meId,
  inviteBusy,
  onAcceptInvite,
  onDeclineInvite,
  onBlockInviter,
  onlyInvites = false,
}: {
  onOpenPerson?: (username: string) => void;
  onOpenFollow?: (username: string) => void;
  onSelect?: (row: DarkeNotification) => void;
  selectedId?: string | null;
  showEmpty?: boolean;
  followingIds?: Set<string>;
  followBusy?: string | null;
  onFollowBack?: (actorId: string) => void;
  onFollow?: (actorId: string) => void;
  meId?: string | null;
  inviteBusy?: string | null;
  onAcceptInvite?: (inviteId: string) => void;
  onDeclineInvite?: (inviteId: string) => void;
  onBlockInviter?: (actorId: string, inviteId: string) => void;
  onlyInvites?: boolean;
}) {
  const { rows, markRead, markUnread } = useNotifications();
  const [menuId, setMenuId] = useState<string | null>(null);
  const visible = onlyInvites
    ? rows.filter((row) => isPendingInviteNotice(row.type))
    : rows;

  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuId]);

  if (visible.length === 0) {
    if (!showEmpty) return null;
    return (
      <p className="muted newsfeed-comments-empty">
        {onlyInvites ? "No pending invites." : "No notifications yet."}
      </p>
    );
  }

  return (
    <ul className="notify-list">
      {visible.map((row) => {
        const handle = row.actor?.username;
        const isFollow = row.type === "follow";
        const isInvite = isPendingInviteNotice(row.type);
        const kind =
          row.type === "follow"
            ? "follow"
            : isInvite
              ? "invite"
              : row.type === "beep_reply"
                ? "reply"
                : "comment";
        const preview = isFollow || isInvite ? "" : (row.quote?.trim() ?? "");
        return (
          <li key={row.id}>
            <div
              role="button"
              tabIndex={0}
              className={`notify-card is-${kind}${selectedId === row.id ? " is-open" : ""}${row.read ? "" : " is-unread"}`}
              onClick={() => {
                if (!row.read) void markRead([row.id]);
                if (isFollow) {
                  if (handle) (onOpenFollow ?? onOpenPerson)?.(handle);
                  return;
                }
                if (isInvite) return;
                onSelect?.(row);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (!row.read) void markRead([row.id]);
                  if (isFollow) {
                    if (handle) (onOpenFollow ?? onOpenPerson)?.(handle);
                    return;
                  }
                  if (isInvite) return;
                  onSelect?.(row);
                }
              }}
            >
              <PersonPeek
                person={row.actor}
                showFollow={Boolean(
                  row.actorId && onFollow && meId && row.actorId !== meId,
                )}
                isFollowing={followingIds?.has(row.actorId) ?? false}
                followBusy={followBusy === row.actorId}
                onFollow={
                  onFollow ? () => onFollow(row.actorId) : undefined
                }
                onVisit={onOpenPerson}
              >
                <UserAvatar
                  username={handle ?? "user"}
                  url={row.actor?.avatarUrl ?? null}
                  className="notify-card-photo"
                />
              </PersonPeek>
              <div className="notify-card-main">
                <p className="notify-card-action">{notificationAction(row)}</p>
                <div className="notify-card-who">
                  <PersonPeek
                    person={row.actor}
                    showFollow={Boolean(
                      row.actorId && onFollow && meId && row.actorId !== meId,
                    )}
                    isFollowing={followingIds?.has(row.actorId) ?? false}
                    followBusy={followBusy === row.actorId}
                    onFollow={
                      onFollow ? () => onFollow(row.actorId) : undefined
                    }
                    onVisit={onOpenPerson}
                  >
                    <span className="notify-card-name">
                      {snippetDisplayName(row.actor, handle ?? "unknown")}
                    </span>
                  </PersonPeek>
                  <span className="notify-card-at">@{handle ?? "unknown"}</span>
                </div>
                {preview ? (
                  <p className="notify-card-preview">{preview}</p>
                ) : null}
                {isInvite && row.inviteId && onAcceptInvite && onDeclineInvite && onBlockInviter ? (
                  <InviteActions
                    inviteId={row.inviteId}
                    actorId={row.actorId}
                    busy={inviteBusy === row.inviteId}
                    onAccept={onAcceptInvite}
                    onDecline={onDeclineInvite}
                    onBlock={onBlockInviter}
                  />
                ) : isFollow && onFollowBack ? (
                  <FollowActions
                    actorId={row.actorId}
                    following={followingIds?.has(row.actorId) ?? false}
                    busy={followBusy === row.actorId}
                    onFollowBack={onFollowBack}
                  />
                ) : null}
              </div>
              <div className="notify-card-aside">
                <span
                  className="notify-card-time"
                  title={exactTime(row.createdAt)}
                >
                  {feedCardTime(row.createdAt)}
                </span>
                {row.read ? (
                  <OwnerMenu
                    open={menuId === row.id}
                    onToggle={(e) => {
                      e.stopPropagation();
                      setMenuId((prev) => (prev === row.id ? null : row.id));
                    }}
                    onMarkUnread={() => {
                      setMenuId(null);
                      void markUnread([row.id]);
                    }}
                  />
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function NotificationsPane({
  slug,
  onOpenUrl,
  onEditProfile,
}: {
  slug: string;
  onOpenUrl?: (url: string) => void;
  onEditProfile?: () => void;
}) {
  const { rows, unread, markAllRead, refresh } = useNotifications();
  const workspaces = useWorkspacesMaybe();
  const [openUsername, setOpenUsername] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "invites">("all");
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [followBusy, setFollowBusy] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState<string | null>(null);
  const [me, setMe] = useState<DarkeProfile | null>(null);
  const [markError, setMarkError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadMyFollowingIds()
      .then((ids) => {
        if (!cancelled) setFollowingIds(ids);
      })
      .catch(() => {
        if (!cancelled) setFollowingIds(new Set());
      });
    void loadMyProfile()
      .then((row) => {
        if (!cancelled) setMe(row);
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected =
    tab === "all"
      ? (rows.find(
          (row) =>
            row.id === selectedId &&
            row.type !== "follow" &&
            !isPendingInviteNotice(row.type) &&
            Boolean(row.beepId),
        ) ?? null)
      : null;

  useEffect(() => {
    if (tab !== "all") return;
    const first = rows.find(
      (row) =>
        row.type !== "follow" &&
        !isPendingInviteNotice(row.type) &&
        Boolean(row.beepId),
    );
    if (!first) return;
    setSelectedId((cur) => {
      if (
        cur &&
        rows.some(
          (row) =>
            row.id === cur &&
            row.type !== "follow" &&
            !isPendingInviteNotice(row.type) &&
            Boolean(row.beepId),
        )
      ) {
        return cur;
      }
      return first.id;
    });
  }, [tab, rows]);

  const toggleFollow = useCallback(
    async (userId: string) => {
      const next = !followingIds.has(userId);
      setFollowBusy(userId);
      setFollowingIds((prev) => {
        const copy = new Set(prev);
        if (next) copy.add(userId);
        else copy.delete(userId);
        return copy;
      });
      try {
        await setFollowing(userId, next);
      } catch (err) {
        setFollowingIds((prev) => {
          const copy = new Set(prev);
          if (next) copy.delete(userId);
          else copy.add(userId);
          return copy;
        });
        window.alert(followsError(err));
      } finally {
        setFollowBusy(null);
      }
    },
    [followingIds],
  );

  async function runInvite(
    inviteId: string,
    fn: () => Promise<void>,
  ) {
    setInviteBusy(inviteId);
    try {
      await fn();
      await refresh();
      await workspaces?.refresh();
    } catch (err) {
      window.alert(workspaceError(err));
    } finally {
      setInviteBusy(null);
    }
  }

  const openProfile = useCallback((username: string) => {
    setOpenUsername(username);
  }, []);

  return (
    <section className="page has-starfield notify-page">
      <div className="beeper-deck-page">
        <div
          className="newsfeed-panes is-split"
        >
          <div className="newsfeed-panes-track">
            <div className="newsfeed-pane">
              <div className="beeper-toggle" role="tablist" aria-label="Notifications">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "all"}
                  className={tab === "all" ? "is-on" : ""}
                  onClick={() => setTab("all")}
                >
                  All
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "invites"}
                  className={tab === "invites" ? "is-on" : ""}
                  onClick={() => {
                    setTab("invites");
                    setSelectedId(null);
                  }}
                >
                  Pending Invites
                </button>
              </div>
              {tab === "all" ? (
                <div className="newsfeed-sort">
                  {unread > 0 ? (
                    <button
                      type="button"
                      className="newsfeed-sort-btn"
                      onClick={() => {
                        void markAllRead().catch((err) =>
                          setMarkError(notificationsError(err)),
                        );
                      }}
                    >
                      Mark all read
                    </button>
                  ) : (
                    <span className="newsfeed-sort-btn">Notifications</span>
                  )}
                </div>
              ) : (
                <div className="newsfeed-sort">
                  <span className="newsfeed-sort-btn">Pending Invites</span>
                </div>
              )}
              {markError ? (
                <p className="error beeper-error" role="alert">
                  {markError}
                </p>
              ) : null}
              <div className="beeper-stream">
                <NotificationList
                  showEmpty
                  onlyInvites={tab === "invites"}
                  selectedId={selectedId}
                  followingIds={followingIds}
                  followBusy={followBusy}
                  inviteBusy={inviteBusy}
                  onFollowBack={(id) => void toggleFollow(id)}
                  onFollow={(id) => void toggleFollow(id)}
                  meId={me?.id ?? null}
                  onOpenPerson={openProfile}
                  onOpenFollow={openProfile}
                  onSelect={(row) => setSelectedId(row.id)}
                  onAcceptInvite={(id) =>
                    void runInvite(id, () => acceptPendingInvite(id))
                  }
                  onDeclineInvite={(id) =>
                    void runInvite(id, () => declinePendingInvite(id))
                  }
                  onBlockInviter={(actorId, inviteId) =>
                    void runInvite(inviteId, () => blockInviter(actorId))
                  }
                />
              </div>
            </div>
            <div
              className={`newsfeed-pane newsfeed-detail${selected ? "" : " is-idle"}`}
              aria-label="Notification detail"
            >
              {selected ? (
                <NotifyCommentPane
                  row={selected}
                  me={me}
                  followingIds={followingIds}
                  followBusy={followBusy}
                  onFollow={(id) => void toggleFollow(id)}
                  onVisit={openProfile}
                  onPostDeleted={() => setSelectedId(null)}
                />
              ) : (
                <div className="newsfeed-detail-idle" aria-hidden />
              )}
            </div>
          </div>
        </div>
      </div>
      {openUsername ? (
        <ProfileViewModal
          username={openUsername}
          viewerSlug={slug}
          onBack={() => {
            setOpenUsername(null);
          }}
          backLabel="Back to Notifications"
          onOpenUrl={onOpenUrl}
          onUsernameChange={setOpenUsername}
          onEditProfile={onEditProfile}
        />
      ) : null}
    </section>
  );
}
