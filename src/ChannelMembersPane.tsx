import { useEffect, useState } from "react";
import { loadProfilesByIds, type DarkeProfile } from "./profile";
import { UserAvatar } from "./UserAvatar";
import {
  listChannelPeople,
  removeChannelMember,
  workspaceError,
  type DarkeChannel,
  type DarkeWorkspace,
} from "./workspaces";

function roleLabel(role: string): string {
  if (role === "owner") return "Owner";
  if (role === "guest") return "Guest";
  return "Member";
}

export function ChannelMembersPane({
  workspace,
  channel,
  canManage,
}: {
  workspace: DarkeWorkspace | null;
  channel: DarkeChannel;
  canManage: boolean;
}) {
  const [people, setPeople] = useState<
    (DarkeProfile & { role: "owner" | "member" | "guest" })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const rows = await listChannelPeople(channel, workspace);
        const profiles = await loadProfilesByIds(rows.map((row) => row.userId));
        const byId = new Map(profiles.map((row) => [row.id, row]));
        if (cancelled) return;
        setPeople(
          rows.flatMap((row) => {
            const profile = byId.get(row.userId);
            return profile ? [{ ...profile, role: row.role }] : [];
          }),
        );
        setError(null);
      } catch (err) {
        if (!cancelled) setError(workspaceError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [channel, workspace]);

  async function remove(userId: string) {
    if (!canManage || busyId) return;
    setBusyId(userId);
    try {
      await removeChannelMember(channel.id, userId);
      setPeople((prev) => prev.filter((row) => row.id !== userId));
    } catch (err) {
      setError(workspaceError(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="channel-members">
      <h3>Members</h3>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : people.length === 0 ? (
        <p className="muted">No members in this channel yet.</p>
      ) : (
        <ul className="channel-members-list">
          {people.map((person) => {
            const removable = canManage && person.role === "guest";
            return (
              <li key={person.id} className="channel-members-row">
                <UserAvatar
                  username={person.username}
                  url={person.avatar_url}
                  className="channel-members-avatar"
                />
                <span className="channel-members-meta">
                  <strong>
                    {person.display_name?.trim() || person.username}
                  </strong>
                  <span>@{person.username}</span>
                </span>
                <span className="channel-members-role">
                  {roleLabel(person.role)}
                </span>
                {removable ? (
                  <button
                    type="button"
                    className="channel-members-remove"
                    disabled={busyId === person.id}
                    onClick={() => void remove(person.id)}
                  >
                    {busyId === person.id ? "Removing…" : "Remove"}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
