import { useEffect, useState } from "react";
import { IconPlus } from "./icons";
import { ChannelPeopleModal } from "./CreateChannelModal";
import { useWorkspaces } from "./WorkspaceContext";
import { useDm } from "./DmContext";
import { sessionShareLink } from "./dmSessions";
import { TopNav } from "./TopNav";
import { isChatOwner, chatMemberCount } from "./chatService";
import { type DarkeWorkspace } from "./workspaces";

export function currentWorkspaceLabel(active: DarkeWorkspace[]): {
  workspace: DarkeWorkspace | null;
  name: string;
  url: string;
} {
  const workspace = active[0] ?? null;
  if (!workspace) {
    return { workspace: null, name: "DARKE", url: "darke.ai" };
  }
  const slug = workspace.slug?.trim() || "workspace";
  return {
    workspace,
    name: workspace.name.trim() || "DARKE",
    url: `darke.ai/${slug}`,
  };
}

export function AppHeader({
  slug,
  onOpenSettings: _onOpenSettings,
  onOpenUpgrade: _onOpenUpgrade,
  onOpenWorkspace: _onOpenWorkspace,
  onInviteChannel: _onInviteChannel,
  onCompose,
  onSignOut: _onSignOut,
}: {
  slug: string;
  onOpenSettings: () => void;
  onOpenUpgrade: () => void;
  onOpenWorkspace: () => void;
  onInviteChannel: (channelId: string) => void;
  onCompose?: () => void;
  onSignOut: () => void;
}) {
  const { copyChatLink, copied, draft, active: chat, slug: dmSlug, inviteHandle } = useDm();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRequested, setInviteRequested] = useState(false);

  useEffect(() => {
    setInviteRequested(false);
  }, [chat?.id]);

  const canCopyInvite = isChatOwner(chat, dmSlug || slug);

  function invitePeople() {
    if (!canCopyInvite) return;
    setInviteOpen(true);
  }

  return (
    <>
    <div className="sidebar-brand-row">
    <div className="sidebar-brand">
        <img
          className="sidebar-logo"
          src="/darke.png"
          alt="DARKE"
          draggable={false}
        />
      </div>
      {onCompose ? (
        <button
          type="button"
          className="sidebar-head-btn sidebar-compose-btn"
          aria-label="Create"
          onClick={onCompose}
        >
          <IconPlus />
        </button>
      ) : null}
    </div>
      <TopNav
        onInvite={invitePeople}
        inviteOpen={inviteOpen}
        shareLink={
          draft?.shareLink ??
          (chat ? sessionShareLink(chat.sessionKey) : "")
        }
        copied={copied}
        onCopy={() => void copyChatLink()}
        onCloseInvite={() => setInviteOpen(false)}
        canCopy={canCopyInvite}
        requested={inviteRequested}
        onRequest={() => setInviteRequested(true)}
        memberCount={chatMemberCount(chat, dmSlug || slug)}
        isGroup={Boolean(chat && (chat.isGroup || chat.roomKind === "team"))}
        slug={dmSlug || slug}
        takenHandles={
          chat
            ? [
                chat.peerUsername ?? "",
                ...(chat.invitedHandles ?? []),
                ...(chat.chatGuests ?? []).map((g) => g.handle),
              ].filter(Boolean)
            : []
        }
        onAdd={inviteHandle}
      />
    </>
  );
}

export function InviteChannelHost({
  channelId,
  onClose,
  onUpgrade,
}: {
  channelId: string;
  onClose: () => void;
  onUpgrade: () => void;
}) {
  const { channelsByWorkspace, workspaces } =
    useWorkspaces();
  const channel =
    Object.values(channelsByWorkspace)
      .flat()
      .find((row) => row.id === channelId) ?? null;
  const workspace = channel
    ? (workspaces.find((row) => row.id === channel.workspaceId) ?? null)
    : null;
  if (!channel) return null;
  return (
    <ChannelPeopleModal
      workspace={workspace}
      channel={channel}
      onClose={onClose}
      onUpgrade={onUpgrade}
    />
  );
}

