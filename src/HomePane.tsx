import { useEffect, useMemo, useState } from "react";
import {
  loadCommentsOnBeeps,
  loadUserSnippets,
  loadWorkspaceStatusUpdates,
  relativeTime,
  snippetDisplayName,
  type StatusUpdate,
} from "./status";
import { useWorkspaces } from "./WorkspaceContext";
import { isWorkspaceAdmin } from "./workspaces";

type Props = {
  slug: string;
  onManageHome: () => void;
  onUpgrade: () => void;
  onInviteChannel: (channelId: string) => void;
  onOpenWorkspace: () => void;
  onCompleteProfile: () => void;
};

type ActivityRow = {
  id: string;
  title: string;
  detail: string;
  when: string;
  workspaceId: string;
  channelId: string;
};

function isSeedBeep(content: string): boolean {
  return content.replace(/\u200b/g, "").trim().length === 0;
}

function mentionsHandle(text: string, slug: string): boolean {
  const handle = `@${slug.trim().toLowerCase()}`;
  if (!handle.slice(1)) return false;
  return text.toLowerCase().includes(handle);
}

export function HomePane({
  slug,
  onManageHome,
  onUpgrade: _onUpgrade,
  onInviteChannel: _onInviteChannel,
  onOpenWorkspace,
  onCompleteProfile,
}: Props) {
  const {
    workspaces,
    channelsByWorkspace,
    meId,
    setSelection,
  } = useWorkspaces();
  const ownedWorkspaces = workspaces.filter((row) =>
    isWorkspaceAdmin(row.myRole),
  );
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  function openChannel(workspaceId: string, channelId: string) {
    setSelection({
      id: workspaceId,
      module: "channels",
      channelId,
    });
    onOpenWorkspace();
  }

  function inviteTeammates() {
    const firstWs = ownedWorkspaces[0] ?? null;
    if (firstWs) {
      setSelection({ id: firstWs.id, module: "members" });
      onOpenWorkspace();
    }
  }

  const shortcuts = useMemo(() => {
    const rows: {
      workspaceId: string;
      workspaceName: string;
      channelId: string;
      channelName: string;
    }[] = [];
    for (const workspace of workspaces) {
      for (const channel of channelsByWorkspace[workspace.id] ?? []) {
        rows.push({
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          channelId: channel.id,
          channelName: channel.name,
        });
        if (rows.length >= 8) return rows;
      }
    }
    return rows;
  }, [workspaces, channelsByWorkspace]);

  useEffect(() => {
    const ids = workspaces.map((row) => row.id);
    if (ids.length === 0) {
      setActivity([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const beeps = await loadWorkspaceStatusUpdates(ids, 40);
        const comments = await loadCommentsOnBeeps(beeps.map((row) => row.id));
        const byBeep = new Map<string, StatusUpdate>();
        for (const beep of beeps) byBeep.set(beep.id, beep);
        const actorIds = [
          ...new Set([
            ...beeps.map((row) => row.userId),
            ...comments.map((row) => row.userId),
          ]),
        ];
        const people = await loadUserSnippets(actorIds);
        const nameOf = (id: string) =>
          snippetDisplayName(people.get(id) ?? null, "teammate");
        const workspaceName = (id: string | null) =>
          workspaces.find((row) => row.id === id)?.name ?? "Team";
        const channelName = (workspaceId: string | null, channelId: string | null) => {
          if (!workspaceId || !channelId) return "channel";
          const hit = (channelsByWorkspace[workspaceId] ?? []).find(
            (row) => row.id === channelId,
          );
          return hit?.name ?? "channel";
        };

        const mentionRows: ActivityRow[] = [];
        for (const comment of comments) {
          if (meId && comment.userId === meId) continue;
          if (!mentionsHandle(comment.content, slug)) continue;
          const beep = byBeep.get(comment.statusId);
          if (!beep?.workspaceId || !beep.channelId) continue;
          mentionRows.push({
            id: comment.id,
            title: `${nameOf(comment.userId)} mentioned you`,
            detail: `#${channelName(beep.workspaceId, beep.channelId)} · ${workspaceName(beep.workspaceId)}`,
            when: relativeTime(comment.createdAt),
            workspaceId: beep.workspaceId,
            channelId: beep.channelId,
          });
        }

        const threadRows: ActivityRow[] = [];
        if (mentionRows.length < 8) {
          for (const beep of beeps) {
            if (!beep.workspaceId || !beep.channelId) continue;
            if (isSeedBeep(beep.content)) continue;
            if (meId && beep.userId === meId) continue;
            threadRows.push({
              id: beep.id,
              title: `${nameOf(beep.userId)} posted in #${channelName(beep.workspaceId, beep.channelId)}`,
              detail: workspaceName(beep.workspaceId),
              when: relativeTime(beep.createdAt),
              workspaceId: beep.workspaceId,
              channelId: beep.channelId,
            });
          }
        }

        const seen = new Set<string>();
        const merged: ActivityRow[] = [];
        for (const row of [...mentionRows, ...threadRows]) {
          if (seen.has(row.id)) continue;
          seen.add(row.id);
          merged.push(row);
          if (merged.length >= 8) break;
        }
        if (!cancelled) setActivity(merged);
      } catch {
        if (!cancelled) setActivity([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaces, channelsByWorkspace, meId, slug]);

  return (
    <div className="home-page terminal-page">
      <header className="page-head terminal-head">
        <h2>Terminal</h2>
        <button
          type="button"
          className="terminal-manage"
          onClick={onManageHome}
        >
          Manage Home
        </button>
      </header>

      <div className="terminal-cards">
        <button type="button" className="terminal-card" onClick={inviteTeammates}>
          <strong>+ Invite Member</strong>
          <span>Share an encrypted invite to your team.</span>
        </button>
        <button type="button" className="terminal-card" onClick={onCompleteProfile}>
          <strong>Complete Profile</strong>
          <span>Name, photo, and public DARKENET details.</span>
        </button>
      </div>

      <section className="terminal-block" aria-label="Activity">
        <h3>Activity</h3>
        {loading ? (
          <p className="muted">Loading workspace activity…</p>
        ) : activity.length === 0 ? (
          <p className="muted">
            No thread mentions yet. Open a channel to pick up conversation.
          </p>
        ) : (
          <ul className="terminal-activity">
            {activity.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="terminal-activity-hit"
                  onClick={() => openChannel(row.workspaceId, row.channelId)}
                >
                  <span className="terminal-activity-main">
                    <strong>{row.title}</strong>
                    <span>{row.detail}</span>
                  </span>
                  <span className="terminal-activity-when">{row.when}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="terminal-block" aria-label="Quick launch">
        <h3>Quick launch</h3>
        {shortcuts.length === 0 ? (
          <p className="muted">Open a channel from TEAMS to pin it here.</p>
        ) : (
          <div className="terminal-shortcuts">
            {shortcuts.map((row) => (
              <button
                key={row.channelId}
                type="button"
                className="terminal-shortcut"
                onClick={() => openChannel(row.workspaceId, row.channelId)}
              >
                <strong>#{row.channelName}</strong>
                <span>{row.workspaceName}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
