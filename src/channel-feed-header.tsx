import { useEffect, useState } from "react";
import { ChannelPeopleModal } from "./CreateChannelModal";
import { ChannelModal, WorkspaceEditModal } from "./WorkspaceHub";
import { type DarkeChannel, type DarkeWorkspace } from "./workspaces";

const CARDS = [
  {
    id: "people",
    title: "Add people to channel.",
    copy: "Invite members or guests.",
  },
  {
    id: "description",
    title: "Name and channel description",
    copy: "Name your channel and write an overview.",
  },
] as const;

type CardId = (typeof CARDS)[number]["id"];

export function ChannelThreadHeader({
  workspace = null,
  channel,
  canManage,
  canInvite,
  channelTab,
  onChannelTab,
  onUpgrade,
}: {
  workspace?: DarkeWorkspace | null;
  channel: DarkeChannel;
  canManage: boolean;
  canInvite: boolean;
  channelTab: "messages" | "tasks" | "members";
  onChannelTab: (tab: "messages" | "tasks" | "members") => void;
  onUpgrade: () => void;
}) {
  const [panel, setPanel] = useState<"people" | "edit" | "workspace" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setPanel(null);
    setMenuOpen(false);
  }, [channel.id]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuOpen]);

  return (
    <>
      <div className="channel-thread-head">
        {canManage ? (
          <button
            type="button"
            className="channel-thread-title is-btn"
            onClick={() => setPanel("edit")}
          >
            # {channel.name}
          </button>
        ) : (
          <h2 className="channel-thread-title"># {channel.name}</h2>
        )}
        {canManage ? (
          <div className="channel-thread-actions">
            <div className="channel-thread-menu">
                <button
                  type="button"
                  className="channel-thread-more"
                  aria-label="Channel options"
                  aria-expanded={menuOpen}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen((open) => !open);
                  }}
                >
                  ···
                </button>
                {menuOpen ? (
                  <div
                    className="newsfeed-menu-pop"
                    role="menu"
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        setPanel("edit");
                      }}
                    >
                      Channel Settings
                    </button>
                    {workspace ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          setPanel("workspace");
                        }}
                      >
                        Team Settings
                      </button>
                    ) : null}
                    {canInvite ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          onChannelTab("members");
                        }}
                      >
                        Members
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
          </div>
        ) : null}
      </div>
      <div className="channel-thread-tabs" role="tablist" aria-label="Channel">
        <button
          type="button"
          role="tab"
          aria-selected={channelTab === "messages"}
          className={channelTab === "messages" ? "is-on" : ""}
          onClick={() => onChannelTab("messages")}
        >
          Messages
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={channelTab === "tasks"}
          className={channelTab === "tasks" ? "is-on" : ""}
          onClick={() => onChannelTab("tasks")}
        >
          Tasks
        </button>
        {canInvite ? (
          <button
            type="button"
            role="tab"
            aria-selected={channelTab === "members"}
            className={channelTab === "members" ? "is-on" : ""}
            onClick={() => onChannelTab("members")}
          >
            Members
          </button>
        ) : null}
      </div>
      {panel === "people" && canInvite ? (
        <ChannelPeopleModal
          workspace={workspace}
          channel={channel}
          onClose={() => setPanel(null)}
          onUpgrade={onUpgrade}
        />
      ) : null}
      {panel === "edit" ? (
        <ChannelModal
          workspace={workspace}
          mode="edit"
          channel={channel}
          onClose={() => setPanel(null)}
          onUpgrade={onUpgrade}
        />
      ) : null}
      {panel === "workspace" && workspace ? (
        <WorkspaceEditModal
          workspace={workspace}
          onClose={() => setPanel(null)}
        />
      ) : null}
    </>
  );
}

function storageKey(channelId: string) {
  return `darke.channelOnboard.v2.${channelId}`;
}

function loadDismissed(channelId: string): Set<CardId> {
  try {
    const raw = localStorage.getItem(storageKey(channelId));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((id): id is CardId =>
        CARDS.some((card) => card.id === id),
      ),
    );
  } catch {
    return new Set();
  }
}

export function ChannelFeedHeader({
  workspace = null,
  channel,
  canInvite = false,
  onUpgrade,
}: {
  workspace?: DarkeWorkspace | null;
  channel: DarkeChannel;
  canInvite?: boolean;
  onUpgrade: () => void;
}) {
  const [dismissed, setDismissed] = useState<Set<CardId>>(() =>
    loadDismissed(channel.id),
  );
  const [panel, setPanel] = useState<CardId | null>(null);

  useEffect(() => {
    setDismissed(loadDismissed(channel.id));
  }, [channel.id]);

  function dismiss(id: CardId) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem(
          storageKey(channel.id),
          JSON.stringify([...next]),
        );
      } catch {
        // Ignore quota / private mode.
      }
      return next;
    });
    setPanel((open) => (open === id ? null : open));
  }

  function openCard(id: CardId) {
    setPanel(id);
  }

  const visible = CARDS.filter((card) => {
    if (card.id === "people" && !canInvite) return false;
    return !dismissed.has(card.id);
  });
  if (visible.length === 0 && !panel) return null;

  return (
    <>
      {visible.length > 0 ? (
        <div className="ws-onboard">
          <div className="ws-onboard-grid">
            {visible.map((card) => (
              <div key={card.id} className="ws-onboard-card">
                <button
                  type="button"
                  className="ws-onboard-x"
                  aria-label={`Dismiss ${card.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    dismiss(card.id);
                  }}
                >
                  ×
                </button>
                <button
                  type="button"
                  className="ws-onboard-open"
                  onClick={() => openCard(card.id)}
                >
                  <strong>{card.title}</strong>
                  <span>{card.copy}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {panel === "people" && canInvite ? (
        <ChannelPeopleModal
          workspace={workspace}
          channel={channel}
          onClose={() => setPanel(null)}
          onUpgrade={onUpgrade}
        />
      ) : null}
      {panel === "description" ? (
        <ChannelModal
          workspace={workspace}
          mode="edit"
          channel={channel}
          onClose={() => setPanel(null)}
          onUpgrade={onUpgrade}
        />
      ) : null}
    </>
  );
}
