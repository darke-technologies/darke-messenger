import { useEffect, useState } from "react";
import { ChannelFeedHeader, ChannelThreadHeader } from "./channel-feed-header";
import { ChannelMembersPane } from "./ChannelMembersPane";
import { ChannelTasksPane } from "./ChannelTasksPane";
import { NewsfeedDeck } from "./NewsfeedWindow";
import { useWorkspaces } from "./WorkspaceContext";
import {
  isWorkspaceAdmin,
  isWorkspaceStaff,
  type DarkeChannel,
  type DarkeWorkspace,
} from "./workspaces";
import { ensureChannelBeep } from "./status";

export function ChannelsBoard({
  workspace,
  channels,
  selectedId,
  readOnly,
  module,
  onModule,
  onSelect,
  onUpgrade,
}: {
  workspace: DarkeWorkspace | null;
  channels: DarkeChannel[];
  selectedId: string | null;
  readOnly: boolean;
  module: "channels" | "tasks";
  onModule: (module: "channels" | "tasks") => void;
  onSelect: (channelId: string) => void;
  onUpgrade: () => void;
}) {
  const { meId } = useWorkspaces();
  const selected =
    channels.find((row) => row.id === selectedId) ?? channels[0] ?? null;
  const staff = workspace
    ? isWorkspaceStaff(workspace.myRole) && !readOnly
    : Boolean(selected && meId && selected.createdBy === meId);
  const canInvite = workspace
    ? isWorkspaceAdmin(workspace.myRole) && !readOnly
    : staff;
  const [channelTab, setChannelTab] = useState<"messages" | "tasks" | "members">(
    module === "tasks" ? "tasks" : "messages",
  );
  const [seedReady, setSeedReady] = useState(false);

  useEffect(() => {
    setChannelTab(module === "tasks" ? "tasks" : "messages");
  }, [selected?.id, module]);

  useEffect(() => {
    if (!selectedId && selected) onSelect(selected.id);
  }, [selectedId, selected?.id, onSelect, selected]);

  useEffect(() => {
    if (!selected) {
      setSeedReady(false);
      return;
    }
    let cancelled = false;
    setSeedReady(false);
    void ensureChannelBeep(
      selected.id,
      workspace?.id ?? selected.workspaceId,
      selected.name,
      selected.description,
    )
      .then(() => {
        if (!cancelled) setSeedReady(true);
      })
      .catch(() => {
        if (!cancelled) setSeedReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [
    selected?.id,
    selected?.name,
    selected?.description,
    selected?.workspaceId,
    workspace?.id,
  ]);

  const header = selected ? (
    <ChannelThreadHeader
      workspace={workspace}
      channel={selected}
      canManage={staff}
      canInvite={canInvite}
      channelTab={channelTab}
      onChannelTab={(next) => {
        setChannelTab(next);
        if (next === "tasks") onModule("tasks");
        else onModule("channels");
      }}
      onUpgrade={onUpgrade}
    />
  ) : null;

  return (
    <div className="home-page">
      <section className="home-feed" aria-label="Channel">
        <div className="newsfeed-panes is-split is-detail is-messages-only">
          <div className="newsfeed-panes-track">
            {!selected ? (
              <div className="newsfeed-pane newsfeed-detail">
                <div className="newsfeed-detail-scroll">
                  <p className="muted newsfeed-comments-empty">
                    Create a channel from the sidebar.
                  </p>
                </div>
              </div>
            ) : channelTab === "tasks" ? (
              <div className="newsfeed-pane newsfeed-detail">
                {header}
                <div className="newsfeed-detail-scroll">
                  <ChannelTasksPane
                    channelId={selected.id}
                    readOnly={readOnly}
                  />
                </div>
              </div>
            ) : channelTab === "members" ? (
              <div className="newsfeed-pane newsfeed-detail">
                {header}
                <div className="newsfeed-detail-scroll">
                  <ChannelMembersPane
                    workspace={workspace}
                    channel={selected}
                    canManage={canInvite}
                  />
                </div>
              </div>
            ) : selected && seedReady ? (
              <NewsfeedDeck
                key={selected.id}
                variant="page"
                workspaceId={workspace?.id ?? selected.workspaceId}
                workspaceName={workspace?.name}
                channelId={selected.id}
                readOnly={readOnly}
                hideWorkspaceBanner
                hideComposer
                detailOnly
                autoOpenFirst
                detailHead={header}
                detailLead={
                  staff ? (
                    <ChannelFeedHeader
                      workspace={workspace}
                      channel={selected}
                      canInvite={canInvite}
                      onUpgrade={onUpgrade}
                    />
                  ) : null
                }
              />
            ) : (
              <div className="newsfeed-pane newsfeed-detail">
                {header}
                <div className="newsfeed-detail-scroll">
                  <p className="muted newsfeed-comments-empty">Loading…</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
