import { useMemo, useState } from "react";
import { threadLastActivityAt } from "./chatService";
import { useDm } from "./DmContext";
import { focusChatMessage, formatThreadTime } from "./dmSessions";
import { openCompose } from "./feedIntent";
import { highlightMatch } from "./searchIndex";
import { IconSearch } from "./icons";
import { useLocalChat } from "./useLocalChat";
import { useLocalSearch } from "./useLocalSearch";

export function ChatSearchView() {
  const { threads, setActiveId, slug } = useDm();
  const local = useLocalChat(slug);
  const [query, setQuery] = useState("");
  const { hits } = useLocalSearch(slug, threads, query);
  const recent = useMemo(
    () =>
      threads
        .slice()
        .sort((a, b) => threadLastActivityAt(b) - threadLastActivityAt(a)),
    [threads],
  );
  const needle = query.trim();

  function openChat(chatId: string, messageId?: string) {
    setActiveId(chatId);
    openCompose();
    focusChatMessage(chatId, messageId);
  }

  return (
    <section className="chat-search-page">
      <label className="chat-search-field">
        <IconSearch className="chat-search-field-icon" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search chats"
          aria-label="Search chats"
          autoFocus
        />
      </label>

      {needle ? (
        <div className="chat-search-list">
          {hits.length === 0 ? (
            <p className="muted chat-search-empty">No local matches.</p>
          ) : (
            hits.map((hit) => {
              const bits = highlightMatch(hit.body, needle);
              return (
                <button
                  key={hit.id}
                  type="button"
                  className="chat-search-hit"
                  onClick={() =>
                    openChat(hit.chatId, hit.messageId || undefined)
                  }
                >
                  <span className="chat-search-hit-copy">
                    <strong>{hit.title}</strong>
                    <span>
                      {bits.map((bit, i) =>
                        bit.toLowerCase() === needle.toLowerCase() ? (
                          <mark key={i}>{bit}</mark>
                        ) : (
                          <span key={i}>{bit}</span>
                        ),
                      )}
                    </span>
                  </span>
                  <time>{formatThreadTime(hit.at)}</time>
                </button>
              );
            })
          )}
        </div>
      ) : (
        <div className="chat-search-list">
          <h2>Recent</h2>
          {recent.length === 0 ? (
            <p className="muted chat-search-empty">No chats yet.</p>
          ) : (
            recent.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className="chat-search-hit"
                onClick={() => openChat(thread.id)}
              >
                <span className="chat-search-hit-copy">
                  <strong>{local.titleFor(thread)}</strong>
                </span>
                <time>{formatThreadTime(threadLastActivityAt(thread))}</time>
              </button>
            ))
          )}
        </div>
      )}
    </section>
  );
}
