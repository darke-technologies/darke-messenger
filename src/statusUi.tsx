import { FormEvent, useEffect, useMemo, useState } from "react";
import { UserAvatar } from "./UserAvatar";
import type { DarkeProfile } from "./profile";
import {
  COMMENT_MAX,
  STATUS_MAX,
  createStatusComment,
  createStatusUpdate,
  loadCommentCounts,
  loadStatusComments,
  loadStatusUpdates,
  loadFollowingStatusUpdates,
  loadGlobalBeeps,
  loadUserSnippets,
  relativeTime,
  statusError,
  type StatusComment,
  type StatusUpdate,
  type UserSnippet,
} from "./status";

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

export function StatusUpdatesSection({
  userId,
  isOwner,
  owner,
  onOpenPerson,
}: {
  userId: string | null | undefined;
  isOwner: boolean;
  owner?: UserSnippet | null;
  onOpenPerson?: (username: string) => void;
}) {
  const [rows, setRows] = useState<StatusUpdate[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!userId) {
      setRows([]);
      setReady(true);
      return;
    }
    let cancelled = false;
    setReady(false);
    void loadStatusUpdates(userId)
      .then(async (next) => {
        if (cancelled) return;
        setRows(next);
        setError(null);
        const map = await loadCommentCounts(next.map((row) => row.id));
        if (!cancelled) setCounts(map);
      })
      .catch((err) => {
        if (!cancelled) {
          setRows([]);
          setError(statusError(err));
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function onPost(e: FormEvent) {
    e.preventDefault();
    if (busy || !isOwner) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createStatusUpdate(draft);
      setDraft("");
      setRows((prev) => [created, ...prev].slice(0, 10));
    } catch (err) {
      setError(statusError(err));
    } finally {
      setBusy(false);
    }
  }

  if (!userId) return null;
  if (!isOwner && ready && rows.length === 0 && !error) return null;

  return (
    <div className="status-updates">
      <h4 className="profile-layout-h">UPDATES</h4>
      {isOwner ? (
        <form className="status-compose" onSubmit={(e) => void onPost(e)}>
          <input
            type="text"
            value={draft}
            maxLength={STATUS_MAX}
            placeholder="What's new?"
            aria-label="What's new?"
            disabled={busy}
            onChange={(e) => setDraft(e.target.value.slice(0, STATUS_MAX))}
          />
          <div className="status-compose-row">
            <span
              className={`muted${draft.length >= STATUS_MAX ? " beeper-count is-max" : ""}${draft.length > STATUS_MAX ? " is-over" : ""}`}
            >
              {draft.length}/{STATUS_MAX}
            </span>
            <button
              type="submit"
              disabled={
                busy || draft.trim().length === 0 || draft.length > STATUS_MAX
              }
            >
              Post
            </button>
          </div>
        </form>
      ) : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {ready && rows.length === 0 && isOwner ? (
        <p className="muted profile-layout-empty">No updates yet.</p>
      ) : null}
      <ul className="status-list">
        {rows.map((row) => (
          <StatusCard
            key={row.id}
            status={row}
            author={owner ?? null}
            commentCount={counts.get(row.id) ?? 0}
            onCommentCount={(n) =>
              setCounts((prev) => {
                const next = new Map(prev);
                next.set(row.id, n);
                return next;
              })
            }
            onOpenPerson={onOpenPerson}
          />
        ))}
      </ul>
    </div>
  );
}

export function BeepStream({
  followingIds,
  people,
  mode,
  onOpenPerson,
}: {
  followingIds: string[];
  people: DarkeProfile[];
  mode: "following" | "global";
  onOpenPerson?: (username: string) => void;
}) {
  const [rows, setRows] = useState<StatusUpdate[]>([]);
  const [snippets, setSnippets] = useState<Map<string, UserSnippet>>(new Map());
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const byId = useMemo(() => {
    const map = new Map<string, UserSnippet>();
    for (const person of people) map.set(person.id, snippetFromProfile(person));
    for (const [id, snip] of snippets) map.set(id, snip);
    return map;
  }, [people, snippets]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const load =
      mode === "global"
        ? loadGlobalBeeps()
        : loadFollowingStatusUpdates(followingIds);
    void load
      .then(async (next) => {
        if (cancelled) return;
        setRows(next);
        setError(null);
        const [map, users] = await Promise.all([
          loadCommentCounts(next.map((row) => row.id)),
          loadUserSnippets(next.map((row) => row.userId)),
        ]);
        if (cancelled) return;
        setCounts(map);
        setSnippets(users);
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
  }, [mode, followingIds.join("|")]);

  if (loading) return <p className="muted">Loading…</p>;
  if (error) {
    return (
      <p className="error" role="alert">
        {error}
      </p>
    );
  }
  if (mode === "following" && followingIds.length === 0) {
    return <p className="muted">Follow people to hear their Beeps.</p>;
  }
  if (rows.length === 0) {
    return (
      <p className="muted">
        {mode === "global" ? "The network is quiet." : "No Beeps from people you follow yet."}
      </p>
    );
  }

  return (
    <ul className="status-list status-feed">
      {rows.map((row) => (
        <StatusCard
          key={row.id}
          status={row}
          author={byId.get(row.userId) ?? null}
          commentCount={counts.get(row.id) ?? 0}
          onCommentCount={(n) =>
            setCounts((prev) => {
              const next = new Map(prev);
              next.set(row.id, n);
              return next;
            })
          }
          onOpenPerson={onOpenPerson}
          showAuthor
        />
      ))}
    </ul>
  );
}

export function FollowingStatusFeed({
  followingIds,
  people,
  onOpenPerson,
}: {
  followingIds: string[];
  people: DarkeProfile[];
  onOpenPerson?: (username: string) => void;
}) {
  return (
    <BeepStream
      followingIds={followingIds}
      people={people}
      mode="following"
      onOpenPerson={onOpenPerson}
    />
  );
}

function StatusCard({
  status,
  author,
  commentCount,
  onCommentCount,
  onOpenPerson,
  showAuthor = false,
}: {
  status: StatusUpdate;
  author: UserSnippet | null;
  commentCount: number;
  onCommentCount: (n: number) => void;
  onOpenPerson?: (username: string) => void;
  showAuthor?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<StatusComment[] | null>(null);
  const [people, setPeople] = useState<Map<string, UserSnippet>>(new Map());
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ensureComments() {
    if (comments) return comments;
    const rows = await loadStatusComments(status.id);
    const snips = await loadUserSnippets(rows.map((row) => row.userId));
    setComments(rows);
    setPeople(snips);
    onCommentCount(rows.length);
    return rows;
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    setError(null);
    try {
      await ensureComments();
    } catch (err) {
      setError(statusError(err));
    }
  }

  async function onReply(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createStatusComment(status.id, draft);
      setDraft("");
      const snips = await loadUserSnippets([created.userId]);
      setPeople((prev) => {
        const next = new Map(prev);
        const snip = snips.get(created.userId);
        if (snip) next.set(created.userId, snip);
        return next;
      });
      setComments((prev) => [created, ...(prev ?? [])]);
      onCommentCount((comments?.length ?? commentCount) + 1);
    } catch (err) {
      setError(statusError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="status-card">
      {showAuthor && author ? (
        <button
          type="button"
          className="status-author"
          onClick={() => onOpenPerson?.(author.username)}
        >
          <UserAvatar
            username={author.username}
            url={author.avatarUrl}
            className="status-avatar"
          />
          <span>@{author.username}</span>
        </button>
      ) : null}
      <p className="status-content">{status.content}</p>
      <p className="muted status-meta">{relativeTime(status.createdAt)}</p>
      <button
        type="button"
        className="status-comment-count"
        aria-expanded={open}
        onClick={() => void toggle()}
      >
        💬 {commentCount} {commentCount === 1 ? "Reply" : "Replies"}
      </button>
      {open ? (
        <div className="status-thread">
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <ul className="status-comments">
            {(comments ?? []).map((row) => {
              const who = people.get(row.userId);
              return (
                <li key={row.id} className="status-comment">
                  {who ? (
                    <button
                      type="button"
                      className="status-author"
                      onClick={() => onOpenPerson?.(who.username)}
                    >
                      <UserAvatar
                        username={who.username}
                        url={who.avatarUrl}
                        className="status-avatar is-sm"
                      />
                      <span>@{who.username}</span>
                    </button>
                  ) : null}
                  <p>{row.content}</p>
                  <p className="muted status-meta">
                    {relativeTime(row.createdAt)}
                  </p>
                </li>
              );
            })}
          </ul>
          <form className="status-reply" onSubmit={(e) => void onReply(e)}>
            <input
              type="text"
              value={draft}
              maxLength={COMMENT_MAX}
              placeholder="Write a reply"
              aria-label="Write a reply"
              disabled={busy}
              onChange={(e) => setDraft(e.target.value.slice(0, COMMENT_MAX))}
            />
            <div className="status-compose-row">
              <span
                className={`muted${draft.length >= COMMENT_MAX ? " beeper-count is-max" : ""}${draft.length > COMMENT_MAX ? " is-over" : ""}`}
              >
                {draft.length}/{COMMENT_MAX}
              </span>
              <button
                type="submit"
                disabled={
                  busy || draft.trim().length === 0 || draft.length > COMMENT_MAX
                }
              >
                Reply
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </li>
  );
}
