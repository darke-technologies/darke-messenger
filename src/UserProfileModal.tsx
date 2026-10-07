import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { useDm } from "./DmContext";
import { generateSessionKey } from "./dmSessions";
import { openCompose } from "./feedIntent";
import { loadProfileByUsername, type DarkeProfile } from "./profile";
import { UserAvatar } from "./UserAvatar";

export function UserProfileModal({
  username,
  viewerSlug = "",
  onClose,
}: {
  username: string;
  viewerSlug?: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const { threads, setActiveId, startEncryptedChat, renameActive } = useDm();
  const [person, setPerson] = useState<DarkeProfile | null>(null);
  const handle = username.replace(/^@/, "").trim().toLowerCase();
  const isSelf = Boolean(viewerSlug && handle === viewerSlug.toLowerCase());

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    void loadProfileByUsername(handle)
      .then((row) => {
        if (!cancelled) setPerson(row);
      })
      .catch(() => {
        if (!cancelled) setPerson(null);
      });
    return () => {
      cancelled = true;
    };
  }, [handle]);

  function openMessage() {
    const existing = threads.find((row) => {
      const peer = (row.peerUsername || "").replace(/^@/, "").toLowerCase();
      const name = (row.handle || "").replace(/^@/, "").toLowerCase();
      return peer === handle || name === handle;
    });
    if (existing) {
      setActiveId(existing.id);
    } else {
      startEncryptedChat("", generateSessionKey(), false, "direct", handle);
      window.setTimeout(() => renameActive(`@${handle}`), 0);
    }
    openCompose();
    onClose();
  }

  const display = person?.display_name?.trim() || handle;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="apps-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="apps-modal user-profile-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="apps-modal-x"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>
        <UserAvatar
          username={handle}
          url={person?.avatar_url}
          className="user-profile-avatar"
        />
        <h3 id={titleId}>{display}</h3>
        <p className="user-profile-handle">@{handle}</p>
        {person?.headline ? (
          <p className="user-profile-headline">{person.headline}</p>
        ) : null}
        {person?.bio ? <p className="user-profile-bio">{person.bio}</p> : null}
        {!isSelf ? (
          <button
            type="button"
            className="term-btn term-btn-emerald"
            onClick={openMessage}
          >
            MESSAGE
          </button>
        ) : (
          <p className="muted apps-submit-note">This is your public profile.</p>
        )}
      </div>
    </div>,
    document.body,
  );
}
