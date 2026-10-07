import { useEffect, useMemo, useState } from "react";
import { searchInvitePeople } from "./inviteSearch";
import { type DarkeProfile } from "./profile";
import { UserAvatar } from "./UserAvatar";
import { useWorkspaces } from "./WorkspaceContext";
import { type DarkeChannel, type DarkeWorkspace } from "./workspaces";
import { PageStarfield } from "./HomeStars";

type ChannelHit = {
  channel: DarkeChannel;
  workspace: DarkeWorkspace;
};

export function NewMessagePane({
  onOpenChannel,
  onOpenPerson,
}: {
  onOpenChannel: (workspaceId: string, channelId: string) => void;
  onOpenPerson: (username: string) => void;
}) {
  const { channelsByWorkspace, workspaces } = useWorkspaces();
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<DarkeProfile[]>([]);
  const [lookupDone, setLookupDone] = useState(false);

  const channels = useMemo(() => {
    const rows: ChannelHit[] = [];
    for (const workspace of workspaces) {
      for (const channel of channelsByWorkspace[workspace.id] ?? []) {
        rows.push({ channel, workspace });
      }
    }
    return rows;
  }, [channelsByWorkspace, workspaces]);

  const q = query.trim().replace(/^[@#]/, "").toLowerCase();

  const channelHits = useMemo(() => {
    if (!q) return channels.slice(0, 12);
    return channels
      .filter((row) => row.channel.name.toLowerCase().includes(q))
      .slice(0, 12);
  }, [channels, q]);

  useEffect(() => {
    if (q.length < 2) {
      setPeople([]);
      setLookupDone(q.length === 0);
      return;
    }
    let cancelled = false;
    setLookupDone(false);
    const t = window.setTimeout(() => {
      void searchInvitePeople(query)
        .then((hit) => {
          if (cancelled) return;
          setPeople(hit.suggestions);
          setLookupDone(true);
        })
        .catch(() => {
          if (!cancelled) {
            setPeople([]);
            setLookupDone(true);
          }
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query, q.length]);

  const empty =
    lookupDone && channelHits.length === 0 && people.length === 0 && q.length > 0;

  return (
    <section className="page nm-page">
      <PageStarfield className="nm-starfield">
      <header className="page-head nm-head">
        <h2>New message</h2>
      </header>
      <label className="nm-to-label" htmlFor="nm-to">
        To:
      </label>
      <input
        id="nm-to"
        className="nm-to-input"
        value={query}
        autoFocus
        placeholder="#a-channel, @somebody, or somebody@example.com"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          const firstChannel = channelHits[0];
          const firstPerson = people[0];
          if (firstChannel) {
            e.preventDefault();
            onOpenChannel(firstChannel.workspace.id, firstChannel.channel.id);
          } else if (firstPerson) {
            e.preventDefault();
            onOpenPerson(firstPerson.username);
          }
        }}
      />
      <div className="nm-list">
        {channelHits.map((row) => (
          <button
            key={row.channel.id}
            type="button"
            className="nm-hit"
            onClick={() =>
              onOpenChannel(row.workspace.id, row.channel.id)
            }
          >
            <span className="nm-hit-hash">#</span>
            <span className="nm-hit-main">
              <strong>{row.channel.name}</strong>
              <span>{row.workspace.name}</span>
            </span>
          </button>
        ))}
        {people.map((person) => (
          <button
            key={person.id}
            type="button"
            className="nm-hit"
            onClick={() => onOpenPerson(person.username)}
          >
            <UserAvatar
              username={person.username}
              url={person.avatar_url}
              className="nm-hit-avatar"
            />
            <span className="nm-hit-main">
              <strong>{person.display_name?.trim() || person.username}</strong>
              <span>@{person.username}</span>
            </span>
          </button>
        ))}
        {empty ? (
          <p className="muted nm-empty">
            No matching channel or DARKE handle.
          </p>
        ) : null}
        {!q && channelHits.length === 0 ? (
          <p className="muted nm-empty">
            Type a channel name in this workspace, or a username to message.
          </p>
        ) : null}
      </div>
      <p className="muted nm-hint">
        From here, you can message any channel or person on DARKE.
      </p>
      </PageStarfield>
    </section>
  );
}
