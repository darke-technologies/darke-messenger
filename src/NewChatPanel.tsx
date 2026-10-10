import { useEffect, useMemo, useRef, useState } from "react";
import { sidebarPeerHandle, listChatMemberHandles } from "./chatService";
import { threadIsGroup } from "./chatController";
import { useDm } from "./DmContext";
import { loadMyFollowingIds } from "./follows";
import { searchInvitePeople } from "./inviteSearch";
import { CreateRoomModal } from "./CreateRoomModal";
import { IconComment, IconLink, IconPeople, IconSearch } from "./icons";
import { loadProfilesByIds, type DarkeProfile } from "./profile";
import { UserAvatar } from "./UserAvatar";
import { showCopyLinkToast } from "./dmSessions";

type NewChatContact = Pick<
  DarkeProfile,
  "username" | "display_name" | "avatar_url"
>;

export function NewChatPanel({
  slug,
  onClose,
}: {
  slug: string;
  onClose: () => void;
}) {
  const {
    threads,
    setActiveId,
    openNewMessage,
    startEncryptedChat,
    createRoom,
    copyChatLink,
  } = useDm();
  const searchRef = useRef<HTMLInputElement>(null);
  const [screen, setScreen] = useState<"menu" | "chat" | "room">("menu");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<DarkeProfile[]>([]);
  const [following, setFollowing] = useState<NewChatContact[]>([]);

  const self = slug.replace(/^@/, "").trim().toLowerCase();
  const q = query.trim().replace(/^@/, "").toLowerCase();

  const localContacts = useMemo(() => {
    const map = new Map<string, NewChatContact>();
    for (const thread of threads) {
      if (threadIsGroup(thread)) continue;
      const peer = sidebarPeerHandle(thread, slug);
      const handles = peer
        ? [peer]
        : listChatMemberHandles(thread, slug).filter((h) => h !== self);
      for (const handle of handles) {
        const username = handle.replace(/^@/, "").trim().toLowerCase();
        if (!username || username === self) continue;
        if (!map.has(username)) {
          map.set(username, {
            username,
            display_name: null,
            avatar_url: null,
          });
        }
      }
    }
    for (const person of following) {
      const username = person.username.replace(/^@/, "").trim().toLowerCase();
      if (!username || username === self) continue;
      const prev = map.get(username);
      map.set(username, {
        username,
        display_name: person.display_name || prev?.display_name || null,
        avatar_url: person.avatar_url || prev?.avatar_url || null,
      });
    }
    return [...map.values()].sort((a, b) =>
      contactLabel(a).localeCompare(contactLabel(b), undefined, {
        sensitivity: "base",
      }),
    );
  }, [threads, following, slug, self]);

  const visibleContacts = useMemo(() => {
    if (!q) return localContacts;
    return localContacts.filter((row) => {
      const name = contactLabel(row).toLowerCase();
      return name.includes(q) || row.username.toLowerCase().includes(q);
    });
  }, [localContacts, q]);

  useEffect(() => {
    let cancelled = false;
    void loadMyFollowingIds()
      .then((ids) => loadProfilesByIds([...ids]))
      .then((rows) => {
        if (!cancelled) setFollowing(rows);
      })
      .catch(() => {
        if (!cancelled) setFollowing([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (q.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void searchInvitePeople(`@${q}`)
        .then((hit) => {
          if (!cancelled) setHits(hit.suggestions);
        })
        .catch(() => {
          if (!cancelled) setHits([]);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [q]);

  function openDirect(username: string) {
    const handle = username.replace(/^@/, "").trim().toLowerCase();
    if (!handle || handle === self) return;
    const existing = threads.find((thread) => {
      if (threadIsGroup(thread)) return false;
      const peer = sidebarPeerHandle(thread, slug);
      return peer === handle;
    });
    if (existing) setActiveId(existing.id);
    else startEncryptedChat("", undefined, false, "direct", handle);
    onClose();
  }

  async function copyInvite() {
    const link = openNewMessage();
    try {
      await navigator.clipboard.writeText(link);
      showCopyLinkToast("invite");
    } catch {
      void copyChatLink();
    }
  }

  if (screen === "room") {
    return (
      <CreateRoomModal
        onBack={() => setScreen("menu")}
        onCreate={(name, topic) => {
          const id = createRoom(name, topic);
          if (id) onClose();
        }}
      />
    );
  }

  if (screen === "menu") {
    return (
      <div className="new-chat-panel">
        <header className="new-chat-head">
          <button
            type="button"
            className="new-chat-back"
            aria-label="Back"
            onClick={onClose}
          >
            ‹
          </button>
          <h2>Create</h2>
        </header>
        <div className="new-chat-scroll">
          <div className="new-chat-actions">
            <button
              type="button"
              className="new-chat-action"
              onClick={() => {
                setQuery("");
                setScreen("chat");
              }}
            >
              <span className="new-chat-action-icon" aria-hidden>
                <IconComment className="new-chat-action-svg" />
              </span>
              New chat
            </button>
            <button
              type="button"
              className="new-chat-action"
              onClick={() => setScreen("room")}
            >
              <span className="new-chat-action-icon" aria-hidden>
                <IconPeople className="new-chat-action-svg" />
              </span>
              Create Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="new-chat-panel">
      <header className="new-chat-head">
        <button
          type="button"
          className="new-chat-back"
          aria-label="Back"
          onClick={() => {
            setQuery("");
            setScreen("menu");
          }}
        >
          ‹
        </button>
        <h2>New chat</h2>
      </header>
      <div className="new-chat-search-wrap">
        <IconSearch className="new-chat-search-icon" />
        <input
          ref={searchRef}
          className="new-chat-search"
          value={query}
          autoFocus
          placeholder="Search @username..."
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const first = hits[0] ?? visibleContacts[0];
            if (!first) return;
            e.preventDefault();
            openDirect(first.username);
          }}
        />
      </div>
      <div className="new-chat-scroll">
        {q.length < 2 ? (
          <div className="new-chat-actions">
            <button
              type="button"
              className="new-chat-action"
              onClick={() => void copyInvite()}
            >
              <span className="new-chat-action-icon" aria-hidden>
                <IconLink className="new-chat-action-svg" />
              </span>
              Chat Invite Link
            </button>
            <button
              type="button"
              className="new-chat-action"
              onClick={() => searchRef.current?.focus()}
            >
              <span className="new-chat-action-icon is-at" aria-hidden>
                @
              </span>
              Find by username
            </button>
          </div>
        ) : null}
        {q.length >= 2
          ? hits.map((person) => (
              <ContactRow
                key={person.id}
                person={person}
                onOpen={() => openDirect(person.username)}
              />
            ))
          : null}
        <p className="new-chat-section">Contacts</p>
        {visibleContacts.length === 0 ? (
          <p className="muted new-chat-empty">No contacts yet.</p>
        ) : (
          visibleContacts.map((person) => (
            <ContactRow
              key={person.username}
              person={person}
              onOpen={() => openDirect(person.username)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ContactRow({
  person,
  onOpen,
}: {
  person: NewChatContact;
  onOpen: () => void;
}) {
  const handle = norm(person.username);
  return (
    <button type="button" className="new-chat-person" onClick={onOpen}>
      <UserAvatar
        username={person.username}
        url={person.avatar_url}
        className="new-chat-avatar"
        initialsLength={2}
      />
      <span className="new-chat-person-copy">
        <strong>{contactLabel(person)}</strong>
        <span>@{handle}</span>
      </span>
    </button>
  );
}

function norm(username: string): string {
  return username.replace(/^@/, "").trim().toLowerCase();
}

function contactLabel(person: NewChatContact): string {
  return person.display_name?.trim() || person.username.replace(/^@/, "");
}
