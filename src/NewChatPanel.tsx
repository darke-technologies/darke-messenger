import { useEffect, useMemo, useRef, useState } from "react";
import { CreateGroupModal, type NewChatContact } from "./CreateGroupModal";
import { sidebarPeerHandle, listChatMemberHandles } from "./chatService";
import { threadIsGroup } from "./chatController";
import { useDm } from "./DmContext";
import { loadMyFollowingIds } from "./follows";
import { searchInvitePeople } from "./inviteSearch";
import {
  IconComment,
  IconLink,
  IconPeople,
  IconSearch,
} from "./icons";
import { loadProfilesByIds, type DarkeProfile } from "./profile";
import { UserAvatar } from "./UserAvatar";
import {
  generateSessionKey,
  sessionShareLink,
  showCopyLinkToast,
} from "./dmSessions";

type CreateScreen = "menu" | "chat" | "group-members" | "group-name";

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
    startGroupChat,
    copyChatLink,
  } = useDm();
  const searchRef = useRef<HTMLInputElement>(null);
  const [screen, setScreen] = useState<CreateScreen>("menu");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<DarkeProfile[]>([]);
  const [following, setFollowing] = useState<NewChatContact[]>([]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [groupKey, setGroupKey] = useState("");

  const self = slug.replace(/^@/, "").trim().toLowerCase();
  const q = query.trim().replace(/^@/, "").toLowerCase();

  const localContacts = useMemo(() => {
    const map = new Map<string, NewChatContact>();
    for (const thread of threads) {
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
    if (q.length < 2 || screen === "menu") {
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
  }, [q, screen]);

  function goMenu() {
    setQuery("");
    setScreen("menu");
  }

  function openGroupMembers() {
    setQuery("");
    setGroupKey((curr) => curr || generateSessionKey());
    setScreen("group-members");
  }

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

  function toggleMember(username: string) {
    const handle = username.replace(/^@/, "").trim().toLowerCase();
    if (!handle || handle === self) return;
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(handle)) next.delete(handle);
      else next.add(handle);
      return next;
    });
  }

  async function copyInvite(kind: "chat" | "group") {
    let link = "";
    if (kind === "chat") {
      link = openNewMessage();
      try {
        await navigator.clipboard.writeText(link);
        showCopyLinkToast("invite");
      } catch {
        void copyChatLink();
      }
      return;
    }
    const key = groupKey || generateSessionKey();
    if (!groupKey) setGroupKey(key);
    link = sessionShareLink(key);
    try {
      await navigator.clipboard.writeText(link);
      showCopyLinkToast("invite");
    } catch {
      showCopyLinkToast("invite");
    }
  }

  if (screen === "group-name") {
    return (
      <CreateGroupModal
        contacts={localContacts}
        members={[...picked]}
        onBack={() => setScreen("group-members")}
        onCreate={(name, members, avatar) => {
          startGroupChat(name, members, avatar, groupKey);
          onClose();
        }}
      />
    );
  }

  const picking = screen === "group-members";
  const title =
    screen === "menu" ? "Create" : picking ? "Add members" : "New chat";

  return (
    <div className="new-chat-panel">
      <header className="new-chat-head">
        <button
          type="button"
          className="new-chat-back"
          aria-label="Back"
          onClick={() => {
            if (screen === "menu") onClose();
            else goMenu();
          }}
        >
          ‹
        </button>
        <h2>{title}</h2>
      </header>

      {screen === "menu" ? (
        <div className="new-chat-scroll">
          <div className="new-chat-actions">
            <button
              type="button"
              className="new-chat-action"
              onClick={openGroupMembers}
            >
              <span className="new-chat-action-icon" aria-hidden>
                <IconPeople className="new-chat-action-svg" />
              </span>
              New group
            </button>
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
          </div>
        </div>
      ) : (
        <>
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
                if (picking) toggleMember(first.username);
                else openDirect(first.username);
              }}
            />
          </div>
          <div className="new-chat-scroll">
            {q.length < 2 ? (
              <div className="new-chat-actions">
                <button
                  type="button"
                  className="new-chat-action"
                  onClick={() => void copyInvite(picking ? "group" : "chat")}
                >
                  <span className="new-chat-action-icon" aria-hidden>
                    <IconLink className="new-chat-action-svg" />
                  </span>
                  {picking ? "Group Invite Link" : "Chat Invite Link"}
                </button>
                {picking ? null : (
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
                )}
              </div>
            ) : null}
            {q.length >= 2
              ? hits.map((person) => (
                  <ContactRow
                    key={person.id}
                    person={person}
                    picking={picking}
                    on={picked.has(norm(person.username))}
                    onOpen={() =>
                      picking
                        ? toggleMember(person.username)
                        : openDirect(person.username)
                    }
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
                  picking={picking}
                  on={picked.has(norm(person.username))}
                  onOpen={() =>
                    picking
                      ? toggleMember(person.username)
                      : openDirect(person.username)
                  }
                />
              ))
            )}
          </div>
          {picking ? (
            <button
              type="button"
              className="term-btn term-btn-emerald new-chat-create"
              onClick={() => setScreen("group-name")}
            >
              {picked.size > 0 ? "Next" : "Skip"}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

function ContactRow({
  person,
  picking,
  on,
  onOpen,
}: {
  person: NewChatContact;
  picking: boolean;
  on: boolean;
  onOpen: () => void;
}) {
  const handle = norm(person.username);
  return (
    <button
      type="button"
      className={`new-chat-person${on ? " is-on" : ""}`}
      onClick={onOpen}
    >
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
      {picking ? (
        <span className="new-chat-check" aria-hidden>
          {on ? "●" : "○"}
        </span>
      ) : null}
    </button>
  );
}

function norm(username: string): string {
  return username.replace(/^@/, "").trim().toLowerCase();
}

function contactLabel(person: NewChatContact): string {
  return person.display_name?.trim() || person.username.replace(/^@/, "");
}
