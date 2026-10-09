import { useMemo, useState } from "react";
import { threadIsGroup } from "./chatController";
import { resolveChatTitle } from "./getChatTitle";
import { IconSearch } from "./icons";
import { useLocalChat } from "./useLocalChat";
import { UserAvatar } from "./UserAvatar";
import type { DmThread } from "./dmSessions";

const NOTE_SELF = "__note_self__";

export function ForwardModal({
  slug,
  threads,
  currentId,
  onClose,
  onForward,
  onEnsureNoteSelf,
}: {
  slug: string;
  threads: DmThread[];
  currentId: string | null;
  onClose: () => void;
  onForward: (threadIds: string[]) => void;
  onEnsureNoteSelf: () => string;
}) {
  const local = useLocalChat(slug);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const note = {
      id: NOTE_SELF,
      title: "Note to Self",
      handle: slug,
      group: false,
    };
    const chats = threads
      .filter((thread) => thread.id !== currentId)
      .map((thread) => ({
        id: thread.id,
        title: resolveChatTitle(thread, slug, local.peek(thread.id)),
        handle: thread.peerUsername || thread.handle,
        group: threadIsGroup(thread),
        avatar: null as string | null,
      }));
    const list = [note, ...chats];
    if (!q) return list;
    return list.filter(
      (row) =>
        row.title.toLowerCase().includes(q) ||
        row.handle.replace(/^@/, "").toLowerCase().includes(q),
    );
  }, [currentId, local, query, slug, threads]);

  function toggle(id: string) {
    setPicked((curr) => {
      const next = new Set(curr);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function send() {
    if (!picked.size) return;
    const ids = [...picked].map((id) =>
      id === NOTE_SELF ? onEnsureNoteSelf() : id,
    );
    onForward(ids);
  }

  return (
    <div className="fwd-scrim" role="presentation" onClick={onClose}>
      <section
        className="fwd-modal"
        role="dialog"
        aria-labelledby="fwd-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="fwd-head">
          <h2 id="fwd-title">Forward To</h2>
          <button type="button" className="fwd-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <label className="fwd-search">
          <IconSearch className="fwd-search-icon" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, username, or number"
            aria-label="Search chats"
            autoFocus
          />
        </label>
        <ul className="fwd-list">
          {rows.map((row) => {
            const on = picked.has(row.id);
            return (
              <li key={row.id}>
                <button type="button" className="fwd-row" onClick={() => toggle(row.id)}>
                  {row.group ? (
                    <span className="fwd-avatar is-group" aria-hidden>
                      {row.title.slice(0, 1).toUpperCase()}
                    </span>
                  ) : (
                    <UserAvatar
                      username={row.title || row.handle}
                      className="fwd-avatar"
                      initialsLength={2}
                    />
                  )}
                  <span className="fwd-name">
                    {row.title}
                    {row.id === NOTE_SELF ? (
                      <em className="fwd-note-badge" aria-hidden>
                      ✓
                      </em>
                    ) : null}
                  </span>
                  <span className={`fwd-check${on ? " is-on" : ""}`} aria-hidden>
                    {on ? "✓" : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <footer className="fwd-foot">
          <button
            type="button"
            className="fwd-send"
            disabled={!picked.size}
            aria-label="Forward"
            onClick={send}
          >
            →
          </button>
        </footer>
      </section>
    </div>
  );
}
