import { useEffect, useMemo, useState } from "react";
import {
  chatOwnerHandle,
  listChatGuests,
  nodeFingerprint,
  normalizeChatGuestHandle,
  roomRecipientHandles,
} from "./chatService";
import type { DmThread } from "./dmSessions";
import type { PeerConnectionState } from "./dmSessions";
import { loadMyProfile, loadProfileByUsername } from "./profile";
import { displayNameFor, usePersonDirectory } from "./personDirectory";
import { UserAvatar } from "./UserAvatar";

export function MembersTab({
  slug,
  active,
  connected,
  live,
  youFp,
  peerFp,
}: {
  slug: string;
  active: DmThread | null;
  connected: boolean;
  live: PeerConnectionState;
  youFp: string;
  peerFp: string;
  onAdd?: (handle: string) => void;
  canInvite?: boolean;
  requested?: boolean;
  onRequest?: () => void;
}) {
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});

  const invited = useMemo(
    () =>
      listChatGuests(active)
        .map((guest) => guest.handle)
        .filter((handle) => {
          const key = normalizeChatGuestHandle(handle);
          return (
            key !== normalizeChatGuestHandle(slug) &&
            key !== normalizeChatGuestHandle(active?.peerUsername ?? "")
          );
        }),
    [active, slug],
  );
  const peer =
    active?.peerUsername && active.peerUsername !== slug
      ? active.peerUsername
      : null;
  const handles = useMemo(() => {
    if (active?.roomKind === "room") {
      return [
        ...new Set([slug, ...roomRecipientHandles(active, slug)].filter(Boolean)),
      ];
    }
    const rows = [slug];
    if (peer) rows.push(peer);
    rows.push(...invited);
    return rows;
  }, [slug, peer, invited, active]);

  const people = usePersonDirectory(handles);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next: Record<string, string | null> = {};
      const mine = await loadMyProfile().catch(() => null);
      if (mine?.username) {
        next[mine.username.toLowerCase()] = mine.avatar_url;
      }
      await Promise.all(
        handles.map(async (handle) => {
          const key = handle.toLowerCase();
          if (mine?.username && key === mine.username.toLowerCase()) return;
          const row = await loadProfileByUsername(handle).catch(() => null);
          next[key] = row?.avatar_url ?? null;
        }),
      );
      if (!cancelled) setAvatars(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [handles]);

  if (!active) {
    return (
      <div className="chat-panel chat-members">
        <p className="dm-stream-empty">Open a chat to see nodes.</p>
      </div>
    );
  }

  const owner = chatOwnerHandle(active, slug);

  function row(
    handle: string,
    label: string,
    extras: { status: string; on: boolean; meta: string[]; fp: string },
  ) {
    const isOwner = owner === normalizeChatGuestHandle(handle);
    return (
      <li key={handle} className="chat-member">
        <div className="chat-member-head">
          <UserAvatar
            username={handle}
            url={avatars[handle.toLowerCase()] ?? null}
            className="chat-member-avatar"
          />
          <span className="chat-member-who">
            <strong>
              {people.person(handle)?.displayName ||
                displayNameFor(handle) ||
                (handle === slug ? "You" : label)}
              {isOwner ? (
                <span className="newsfeed-author-badge">Admin</span>
              ) : null}
            </strong>
            <span className="chat-member-handle">
              @{handle.replace(/^@/, "")}
            </span>
          </span>
        </div>
        <span className={`chat-member-status${extras.on ? " is-on" : ""}`}>
          {extras.status}
        </span>
        {extras.meta.map((line) => (
          <span key={line} className="chat-member-meta">
            {line}
          </span>
        ))}
        <span className="chat-member-meta">Key fingerprint {extras.fp}</span>
      </li>
    );
  }

  return (
    <div className="chat-panel chat-members">
      <ul className="chat-member-list">
        {row(slug, "You", {
          status: "CONNECTED",
          on: true,
          meta: ["Endpoint: local node (no public IP bound)"],
          fp: youFp,
        })}
        {peer
          ? row(peer, "Peer", {
              status: live,
              on: connected,
              meta: [
                `Endpoint: ${connected ? "P2P direct" : "waiting for ICE"}`,
              ],
              fp: peerFp,
            })
          : null}
        {invited.map((handle) =>
          row(handle, "Guest", {
            status: "WAITING FOR PEER",
            on: false,
            meta: ["Added by handle. Share the join link so they can connect."],
            fp: nodeFingerprint(`${active.sessionKey}:peer:${handle}`),
          }),
        )}
      </ul>
    </div>
  );
}
