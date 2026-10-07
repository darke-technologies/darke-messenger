import { ChannelsBoard } from "./ChannelsBoard";
import { useWorkspaces } from "./WorkspaceContext";
import { isWorkspaceStaff, type WorkspaceModule } from "./workspaces";
import { WorkspaceMembersPane } from "./WorkspaceMembersPane";
import { IconShield } from "./icons";

export function WorkspacePane({
  slug,
  onOpenUrl,
  onEditProfile,
  onUpgrade,
}: {
  slug: string;
  onOpenUrl?: (url: string) => void;
  onEditProfile?: () => void;
  onUpgrade: () => void;
}) {
  const { workspaces, selection, setSelection, channelsByWorkspace } =
    useWorkspaces();
  const row = workspaces.find((item) => item.id === selection?.id) ?? null;
  const guest = row?.myRole === "guest";
  const module: WorkspaceModule =
    selection?.module === "members" && row && !guest
      ? "members"
      : selection?.module === "tasks"
        ? "tasks"
        : "channels";
  const channels = row ? (channelsByWorkspace[row.id] ?? []) : [];

  if (!row) {
    const listed = [
      ...workspaces.filter((item) => isWorkspaceStaff(item.myRole)),
      ...workspaces.filter((item) => item.myRole === "guest"),
    ];
    return (
      <section className="page ws-pane-page">
        <header className="page-head">
          <h2>All teams</h2>
        </header>
        {listed.length === 0 ? (
          <p className="muted">
            Join a team from the sidebar, or wait for your primary team to load.
          </p>
        ) : (
          <ul className="teams-directory">
            {listed.map((team) => (
              <li key={team.id}>
                <button
                  type="button"
                  className="teams-directory-row"
                  onClick={() => {
                    const first =
                      channelsByWorkspace[team.id]?.[0]?.id ?? null;
                    setSelection({
                      id: team.id,
                      module: "channels",
                      channelId: first,
                    });
                  }}
                >
                  <IconShield className="teams-directory-icon" />
                  <span>{team.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  if (module === "members") {
    return (
      <WorkspaceMembersPane
        workspace={row}
        slug={slug}
        onOpenUrl={onOpenUrl}
        onEditProfile={onEditProfile}
        onUpgrade={onUpgrade}
      />
    );
  }

  return (
    <ChannelsBoard
      workspace={row}
      channels={channels}
      selectedId={selection?.channelId ?? null}
      readOnly={false}
      module={module === "tasks" ? "tasks" : "channels"}
      onModule={(next) =>
        setSelection({
          id: row.id,
          module: next,
          channelId: selection?.channelId,
        })
      }
      onUpgrade={onUpgrade}
      onSelect={(channelId) =>
        setSelection({
          id: row.id,
          module: module === "tasks" ? "tasks" : "channels",
          channelId,
        })
      }
    />
  );
}
