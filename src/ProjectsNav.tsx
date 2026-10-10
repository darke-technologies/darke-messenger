import { useState } from "react";
import { createPortal } from "react-dom";
import { useWorkspaces, type WorkspaceSelection } from "./WorkspaceContext";
import {
  acceptWorkspaceInvite,
  isWorkspaceAdmin,
  workspaceError,
} from "./workspaces";
import { CreateChannelModal } from "./CreateChannelModal";
import { IconLock } from "./icons";

const WORKSPACES_LOCK_TIP =
  "100% Encrypted P2P Team — End-to-End Isolated";

export function WorkspacesHeader() {
  return (
    <div className="nav-cat-row nav-cat-row-ws">
      <span className="nav-cat-ws-title">
        <span className="nav-cat">WORKSPACES</span>
        <span
          className="nav-cat-lock"
          title={WORKSPACES_LOCK_TIP}
          aria-label={WORKSPACES_LOCK_TIP}
        >
          <IconLock className="nav-cat-lock-icon" />
        </span>
      </span>
    </div>
  );
}

export function PlanBadge() {
  const { tier } = useWorkspaces();
  const pro = tier !== "free";
  return (
    <span className={`nav-tier-badge nav-tier-badge-foot${pro ? " is-pro" : " is-free"}`}>
      {pro ? "PRO" : "FREE"}
    </span>
  );
}

type TreeProps = {
  onOpen: (sel: WorkspaceSelection) => void;
  onJoin: () => void;
  onUpgrade: () => void;
  hideJoin?: boolean;
};

function teamBadge(name: string) {
  const trimmed = name.trim();
  return trimmed.slice(0, 2).toUpperCase() || "TM";
}

function teamHue(id: string) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % 360;
}

export function WorkspacesTree({
  onOpen,
  onJoin: _onJoin,
  onUpgrade: _onUpgrade,
  hideJoin: _hideJoin = false,
}: TreeProps) {
  const {
    active,
    selection,
    channelsByWorkspace,
    error,
  } = useWorkspaces();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const owned = active.filter((row) => isWorkspaceAdmin(row.myRole));
  const invited = active.filter((row) => !isWorkspaceAdmin(row.myRole));
  const listed = [...owned, ...invited];

  return (
    <div className="ws-tree">
      <ul className="ws-tree-list">
        {error ? (
          <li className="ws-tree-error" role="alert">
            {error}
          </li>
        ) : null}
        {listed.length === 0 && !error ? (
          <li className="ws-tree-empty muted">No workspaces yet.</li>
        ) : null}
        {listed.map((workspace) => {
          const channels = channelsByWorkspace[workspace.id] ?? [];
          const shut = collapsed[workspace.id] ?? false;
          const hue = teamHue(workspace.id);
          const roleTag = isWorkspaceAdmin(workspace.myRole)
            ? "Admin"
            : "Invited";
          return (
            <li key={workspace.id} className="ws-tree-server">
              <button
                type="button"
                className="ws-tree-server-name dm-team-slot"
                onClick={() => {
                  setCollapsed((prev) => ({
                    ...prev,
                    [workspace.id]: !(prev[workspace.id] ?? false),
                  }));
                  const first = channels[0];
                  onOpen({
                    id: workspace.id,
                    module: "channels",
                    channelId: first?.id ?? null,
                  });
                }}
              >
                <span className="ws-tree-chevron" aria-hidden>
                  {shut ? "▸" : "▾"}
                </span>
                {workspace.avatarUrl ? (
                  <img
                    className="dm-team-badge is-img"
                    src={workspace.avatarUrl}
                    alt=""
                  />
                ) : (
                  <span
                    className="dm-team-badge"
                    style={{
                      background: `hsla(${hue}, 42%, 28%, 0.95)`,
                      color: `hsl(${hue}, 70%, 82%)`,
                    }}
                  >
                    {teamBadge(workspace.name)}
                  </span>
                )}
                <span className="dm-team-slot-copy">
                  <span className="dm-team-slot-name">
                    {workspace.name}{" "}
                    <span className="ws-tree-role">({roleTag})</span>
                  </span>
                </span>
              </button>
              {shut ? null : (
                <ul className="ws-tree-channels is-nested">
                  {channels.map((channel) => (
                    <ChannelNavButton
                      key={channel.id}
                      name={channel.name}
                      selected={
                        selection?.id === workspace.id &&
                        selection?.channelId === channel.id
                      }
                      onClick={() =>
                        onOpen({
                          id: workspace.id,
                          module: "channels",
                          channelId: channel.id,
                        })
                      }
                    />
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ChannelNavButton({
  name,
  selected,
  onClick,
}: {
  name: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className={`ws-tree-channel${selected ? " is-on" : ""}`}
        onClick={onClick}
      >
        # {name}
      </button>
    </li>
  );
}

export function WorkspaceCreateFlows({
  onUpgrade,
  onOpened,
}: {
  onUpgrade: () => void;
  onOpened: () => void;
}) {
  const { selection, setSelection, workspaces } = useWorkspaces();

  function closeCreate() {
    setSelection(
      selection
        ? {
            id: selection.id,
            module: selection.module === "tasks" ? "channels" : selection.module,
            channelId: selection.channelId,
          }
        : null,
    );
  }

  if (selection?.creatingChannel) {
    const nested = workspaces.find((row) => row.id === selection.id) ?? null;
    if (!nested) return null;
    return (
      <CreateChannelModal
        workspace={nested}
        onUpgrade={() => {
          closeCreate();
          onUpgrade();
        }}
        onCreated={(channelId) => {
          setSelection({
            id: nested.id,
            module: "channels",
            channelId,
          });
          onOpened();
        }}
        onClose={closeCreate}
      />
    );
  }

  return null;
}

export function CreateWorkspaceModal({
  onClose,
}: {
  onClose: () => void;
  onCreated?: (id: string) => void;
  onUpgrade?: () => void;
}) {
  const { refresh } = useWorkspaces();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");

  async function join() {
    if (busy || !joinCode.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await acceptWorkspaceInvite(joinCode);
      await refresh();
      onClose();
    } catch (err) {
      setError(workspaceError(err));
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="apps-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="apps-modal projects-choice-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-join-title"
      >
        <button
          type="button"
          className="apps-modal-x"
          aria-label="Close"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
        <h3 id="workspace-join-title">Join workspace</h3>
        <p className="muted apps-submit-note">
          Join with an invite key to a channel or workspace.
        </p>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <label className="ws-create-label" htmlFor="workspace-join-code">
          Workspace invite key
        </label>
        <input
          id="workspace-join-code"
          className="ws-create-input"
          value={joinCode}
          disabled={busy}
          autoFocus
          placeholder="Enter workspace invite key..."
          onChange={(e) => setJoinCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void join();
            }
          }}
        />
        <div className="projects-choice-actions">
          <button
            type="button"
            className="projects-choice-btn is-primary"
            disabled={busy || !joinCode.trim()}
            onClick={() => void join()}
          >
            Join workspace
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** @deprecated Use WorkspacesTree */
export function ProjectsAccordion({ onAdd }: { onAdd: () => void }) {
  return (
    <WorkspacesTree
      onOpen={() => onAdd()}
      onJoin={onAdd}
      onUpgrade={onAdd}
    />
  );
}

/** @deprecated Use CreateWorkspaceModal */
export function ProjectChoiceModal({ onClose }: { onClose: () => void }) {
  return (
    <CreateWorkspaceModal
      onClose={onClose}
      onCreated={() => onClose()}
      onUpgrade={onClose}
    />
  );
}
