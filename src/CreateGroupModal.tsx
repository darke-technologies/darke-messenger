import { useMemo, useRef, useState } from "react";
import {
  GROUP_AVATAR_COLORS,
  groupInitial,
  type GroupAvatarChoice,
} from "./chatController";
import { UserAvatar } from "./UserAvatar";
import type { DarkeProfile } from "./profile";

export type NewChatContact = Pick<
  DarkeProfile,
  "username" | "display_name" | "avatar_url"
>;

export function CreateGroupModal({
  contacts,
  members,
  onBack,
  onCreate,
}: {
  contacts: NewChatContact[];
  members: string[];
  onBack: () => void;
  onCreate: (
    name: string,
    members: string[],
    avatar: GroupAvatarChoice,
  ) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(GROUP_AVATAR_COLORS[0]);
  const [image, setImage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const picked = useMemo(
    () => contacts.filter((row) => members.includes(norm(row.username))),
    [contacts, members],
  );

  function onPickFile(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") setImage(result);
    };
    reader.readAsDataURL(file);
  }

  const title = name.trim();
  const canCreate = title.length > 0;

  return (
    <div className="new-chat-panel">
      <header className="new-chat-head">
        <button
          type="button"
          className="new-chat-back"
          aria-label="Back"
          onClick={onBack}
        >
          ‹
        </button>
        <h2>Name this group</h2>
      </header>
      <label className="new-chat-label" htmlFor="new-group-name">
        Group name
      </label>
      <input
        id="new-group-name"
        className="new-chat-search"
        value={name}
        autoFocus
        placeholder="Hangar Ops"
        onChange={(e) => setName(e.target.value)}
      />
      <p className="new-chat-label">Group avatar</p>
      <div className="group-avatar-setup">
        {image ? (
          <img className="group-avatar-preview" src={image} alt="" />
        ) : (
          <span
            className="group-avatar-preview is-letter"
            style={{ background: color }}
          >
            {groupInitial(title || "G")}
          </span>
        )}
        <div className="group-avatar-tools">
          <div className="group-avatar-colors">
            {GROUP_AVATAR_COLORS.map((value) => (
              <button
                key={value}
                type="button"
                className={`group-avatar-swatch${color === value && !image ? " is-on" : ""}`}
                style={{ background: value }}
                aria-label={`Avatar color ${value}`}
                onClick={() => {
                  setColor(value);
                  setImage(null);
                }}
              />
            ))}
          </div>
          <button
            type="button"
            className="group-avatar-upload"
            onClick={() => fileRef.current?.click()}
          >
            Upload image
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => onPickFile(e.target.files?.[0])}
          />
        </div>
      </div>
      <p className="new-chat-section">Members</p>
      <div className="new-chat-scroll">
        {picked.length === 0 ? (
          <p className="muted new-chat-empty">No members selected. You can add people after Create.</p>
        ) : (
          picked.map((person) => (
            <div key={person.username} className="new-chat-person">
              <UserAvatar
                username={person.username}
                url={person.avatar_url}
                className="new-chat-avatar"
                initialsLength={2}
              />
              <span className="new-chat-person-copy">
                <strong>{contactLabel(person)}</strong>
                <span>@{norm(person.username)}</span>
              </span>
            </div>
          ))
        )}
      </div>
      <button
        type="button"
        className="term-btn term-btn-emerald new-chat-create"
        disabled={!canCreate}
        onClick={() =>
          onCreate(title, members, {
            avatarUrl: image,
            avatarColor: image ? null : color,
          })
        }
      >
        Create
      </button>
    </div>
  );
}

function norm(username: string): string {
  return username.replace(/^@/, "").trim().toLowerCase();
}

function contactLabel(person: NewChatContact): string {
  return person.display_name?.trim() || person.username.replace(/^@/, "");
}
