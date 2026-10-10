import { useMemo, useState } from "react";
import { threadIsGroup, threadIsRoom } from "./chatController";
import {
  chatMemberCount,
  isChatOwner,
  listChatMemberHandles,
  nodeFingerprint,
} from "./chatService";
import { useDm } from "./DmContext";
import { InviteModal } from "./InviteModal";
import { IconBell, IconGroupMesh, IconLink, IconLock, IconSearch } from "./icons";
import { useLocalChat } from "./useLocalChat";
import { displayNameFor, handleBadge, usePersonDirectory } from "./personDirectory";
import { UserAvatar } from "./UserAvatar";
import type { DmThread } from "./dmSessions";
import { roomShareLink, sessionShareLink } from "./dmSessions";
import { focusChatMessage } from "./dmSessions";

const COLORS = [
  "#6366f1",
  "#3b82f6",
  "#22c55e",
  "#eab308",
  "#f97316",
  "#ef4444",
  "#a855f7",
  "#71717a",
];

export function ConversationSettings({
  thread,
  slug,
  title,
  onBack,
}: {
  thread: DmThread;
  slug: string;
  title: string;
  onBack: () => void;
}) {
  const {
    patchThread,
    renameThread,
    copyChatLink,
    copied,
    rotateActiveKeys,
    revokeActiveShareLink,
    purgeActiveHistory,
    deleteThread,
    inviteHandle,
    canInvite,
  } = {
    ...useDm(),
    canInvite: isChatOwner(thread, slug),
  };
  const local = useLocalChat(slug);
  const group = threadIsGroup(thread);
  const room = threadIsRoom(thread);
  const [note, setNote] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [nickname, setNickname] = useState(title);
  const [description, setDescription] = useState(thread.description ?? "");
  const handles = useMemo(
    () => listChatMemberHandles(thread, slug),
    [thread, slug],
  );
  const people = usePersonDirectory(handles);
  const peer =
    handles.find(
      (h) => h.replace(/^@/, "").trim().toLowerCase() !== slug.replace(/^@/, "").trim().toLowerCase(),
    ) || thread.peerUsername || "";
  const peerPerson = people.person(peer);
  const youFp = nodeFingerprint(`${thread.sessionKey}:you:${slug}`);
  const peerFp = nodeFingerprint(`${thread.sessionKey}:peer:${peer || "peer"}`);
  const shareLink = room
    ? roomShareLink(thread.sessionKey, thread.createdBy || slug)
    : sessionShareLink(thread.sessionKey);
  const searchHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return thread.messages
      .filter((msg) => (msg.body || "").toLowerCase().includes(q))
      .slice(-8)
      .reverse();
  }, [query, thread.messages]);

  function saveNickname() {
    const next = nickname.trim();
    if (!next) return;
    renameThread(thread.id, next);
    setNote("Name saved.");
  }

  return (
    <section className="convo-settings">
      <header className="convo-settings-head">
        <button type="button" className="convo-settings-back" onClick={onBack}>
          ‹
        </button>
        <h1>
          {room ? "Room settings" : group ? "Group settings" : "Chat settings"}
        </h1>
      </header>

      <div className="convo-settings-scroll">
        <div className="convo-settings-hero">
          {group ? (
            <span className="convo-settings-mark is-group" aria-hidden>
              <IconGroupMesh className="convo-settings-mesh" />
            </span>
          ) : (
            <UserAvatar
              username={peer || title}
              url={peerPerson?.avatarUrl ?? null}
              className="convo-settings-avatar"
            />
          )}
          {group ? (
            <>
              <h2>{local.titleFor(thread)}</h2>
              <textarea
                className="convo-settings-desc"
                value={description}
                placeholder="Add group description…"
                rows={2}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() =>
                  patchThread(thread.id, { description: description.trim() })
                }
              />
            </>
          ) : (
            <h2>
              {peerPerson?.displayName || displayNameFor(peer) || title}
              {peer ? (
                <span className="convo-settings-handle">{handleBadge(peer)}</span>
              ) : null}
            </h2>
          )}
        </div>

        <div className="convo-settings-shortcuts">
          <button
            type="button"
            className={`convo-settings-fab${thread.muted ? " is-on" : ""}`}
            onClick={() => patchThread(thread.id, { muted: !thread.muted })}
          >
            <IconBell />
            {thread.muted ? "Muted" : "Mute"}
          </button>
          <button
            type="button"
            className="convo-settings-fab"
            onClick={() => document.getElementById("convo-settings-search")?.focus()}
          >
            <IconSearch />
            Search
          </button>
        </div>

        <label className="convo-settings-search">
          <IconSearch className="convo-settings-search-icon" />
          <input
            id="convo-settings-search"
            value={query}
            placeholder={group ? "Search this group" : "Search this chat"}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {searchHits.length > 0 ? (
          <div className="convo-settings-hits">
            {searchHits.map((msg) => (
              <button
                key={msg.id}
                type="button"
                onClick={() => {
                  onBack();
                  focusChatMessage(thread.id, msg.id);
                }}
              >
                {msg.body}
              </button>
            ))}
          </div>
        ) : null}

        <div className="convo-settings-card">
          <label className="convo-settings-row">
            <span>
              <strong>Disappearing messages</strong>
              <em>
                When enabled, messages in this {group ? "group" : "chat"} leave
                this device after the chosen time.
              </em>
            </span>
            <select
              value={thread.disappearAfter || "off"}
              onChange={(e) =>
                patchThread(thread.id, {
                  disappearAfter: e.target.value as "off" | "24h" | "7d",
                })
              }
            >
              <option value="off">Off</option>
              <option value="24h">24 hours</option>
              <option value="7d">7 days</option>
            </select>
          </label>

          {!group ? (
            <div className="convo-settings-row is-stack">
              <span>
                <strong>Nickname</strong>
                <em>Only you see this name in DARKE.</em>
              </span>
              <div className="convo-settings-inline">
                <input
                  className="dm-session-field"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                />
                <button type="button" className="projects-choice-btn" onClick={saveNickname}>
                  Save
                </button>
              </div>
            </div>
          ) : null}

          <div className="convo-settings-row is-stack">
            <span>
              <strong>Chat color</strong>
            </span>
            <div className="convo-settings-swatches">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`convo-settings-swatch${
                    (thread.accentColor || thread.avatarColor) === color ? " is-on" : ""
                  }`}
                  style={{ background: color }}
                  aria-label={color}
                  onClick={() => patchThread(thread.id, { accentColor: color })}
                />
              ))}
            </div>
          </div>

          <button
            type="button"
            className="convo-settings-row"
            onClick={() => patchThread(thread.id, { muted: !thread.muted })}
          >
            <span>
              <strong>Notifications</strong>
              <em>{thread.muted ? "Muted" : "On"}</em>
            </span>
            <span className="convo-settings-value">{thread.muted ? "Off" : "On"}</span>
          </button>
        </div>

        {group ? (
          <div className="convo-settings-card">
            <div className="convo-settings-members-head">
              <strong>{chatMemberCount(thread, slug)} member{chatMemberCount(thread, slug) === 1 ? "" : "s"}</strong>
            </div>
            {canInvite ? (
              <button
                type="button"
                className="convo-settings-row"
                onClick={() => setInviteOpen(true)}
              >
                <span>
                  <strong>+ Add members</strong>
                </span>
              </button>
            ) : null}
            {handles.map((handle) => {
              const mine =
                handle.replace(/^@/, "").trim().toLowerCase() ===
                slug.replace(/^@/, "").trim().toLowerCase();
              const admin = isChatOwner(thread, handle) || (mine && canInvite);
              return (
                <div key={handle} className="convo-settings-member">
                  <UserAvatar
                    username={handle}
                    url={people.person(handle)?.avatarUrl ?? null}
                    className="convo-settings-member-avatar"
                  />
                  <span>
                    <strong>
                      {mine
                        ? "You"
                        : people.person(handle)?.displayName ||
                          displayNameFor(handle) ||
                          handle}
                      {admin ? <em className="newsfeed-author-badge">Admin</em> : null}
                    </strong>
                    <span>@{handle.replace(/^@/, "")}</span>
                  </span>
                  {admin ? <span className="convo-settings-value">Admin</span> : null}
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="convo-settings-card">
          {canInvite ? (
            <>
              <button
                type="button"
                className="convo-settings-row"
                onClick={() => void copyChatLink()}
              >
                <span>
                  <IconLink className="convo-settings-row-icon" />
                  <strong>
                    {room
                      ? "Room invite link"
                      : group
                        ? "Group link"
                        : "Chat invite link"}
                  </strong>
                </span>
                <span className="convo-settings-value">{copied ? "Copied" : "Copy"}</span>
              </button>
              <p className="convo-settings-link">{shareLink}</p>
              {room ? (
                <p className="muted apps-submit-note">
                  This link identifies the room and host. Sender Keys stay on
                  device and are delivered over Signal after you admit the
                  joiner.
                </p>
              ) : (
              <button
                type="button"
                className="convo-settings-row"
                onClick={() => {
                  rotateActiveKeys();
                  setNote("Session keys rotated. Share the new join link.");
                }}
              >
                <span>
                  <strong>Rotate keys</strong>
                  <em>Issues a new join link for this chat.</em>
                </span>
              </button>
              )}
              {room ? null : (
              <button
                type="button"
                className="convo-settings-row"
                onClick={() => {
                  revokeActiveShareLink();
                  setNote("Previous share link revoked.");
                }}
              >
                <span>
                  <strong>Revoke share link</strong>
                </span>
              </button>
              )}
            </>
          ) : null}
          {!group ? (
            <div className="convo-settings-row is-stack">
              <span>
                <IconLock className="convo-settings-row-icon" />
                <strong>Safety number</strong>
                <em>Compare these fingerprints with your peer in person.</em>
              </span>
              <code className="convo-settings-fp">
                You {youFp}
                <br />
                Peer {peerFp}
              </code>
            </div>
          ) : canInvite ? (
            <div className="convo-settings-row">
              <span>
                <strong>Permissions</strong>
                <em>Only admins can add members and rotate the group link.</em>
              </span>
            </div>
          ) : null}
          <button
            type="button"
            className="convo-settings-row"
            onClick={() => {
              purgeActiveHistory();
              setNote("Local history purged on this device.");
            }}
          >
            <span>
              <strong>Clear local history</strong>
              <em>Removes messages stored on this device only.</em>
            </span>
          </button>
        </div>

        <div className="convo-settings-card is-danger">
          <button
            type="button"
            className="convo-settings-row is-danger"
            onClick={() => {
              deleteThread(thread.id);
              onBack();
            }}
          >
            <span>
              <strong>
                {group
                  ? canInvite
                    ? "End group"
                    : "Leave group"
                  : "Delete chat"}
              </strong>
            </span>
          </button>
        </div>
        {note ? (
          <p className="chat-settings-note" role="status">
            {note}
          </p>
        ) : null}
      </div>

      {inviteOpen ? (
        <InviteModal
          shareLink={shareLink}
          copied={copied}
          onCopy={() => void copyChatLink()}
          onClose={() => setInviteOpen(false)}
          canCopy={canInvite}
          memberCount={chatMemberCount(thread, slug)}
          isGroup={group}
          slug={slug}
          takenHandles={handles}
          onAdd={inviteHandle}
        />
      ) : null}
    </section>
  );
}
