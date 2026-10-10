import { useEffect, useRef, useState } from "react";
import { IconChevronDown, IconPlus } from "./icons";
import { loadMyProfile, type DarkeProfile } from "./profile";
import { UserAvatar } from "./UserAvatar";
import { ChannelPeopleModal } from "./CreateChannelModal";
import { useWorkspaces } from "./WorkspaceContext";
import { useDm } from "./DmContext";
import { sessionShareLink } from "./dmSessions";
import { TopNav } from "./TopNav";
import { isChatOwner, chatMemberCount } from "./chatService";
import {
  isProPlan,
  PLAN_PRICE_LABEL,
  type DarkeWorkspace,
} from "./workspaces";

type MenuId = "workspace" | null;

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
  onOpenSettings,
  onOpenUpgrade,
  onOpenWorkspace: _onOpenWorkspace,
  onInviteChannel: _onInviteChannel,
  onCompose,
  onSignOut,
}: {
  slug: string;
  onOpenSettings: () => void;
  onOpenUpgrade: () => void;
  onOpenWorkspace: () => void;
  onInviteChannel: (channelId: string) => void;
  onCompose?: () => void;
  onSignOut: () => void;
}) {
  const {
    active: workspaceList,
    selection,
    workspaces,
    tier,
  } = useWorkspaces();
  const { copyChatLink, copied, draft, active: chat, slug: dmSlug, inviteHandle } = useDm();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRequested, setInviteRequested] = useState(false);
  const [menu, setMenu] = useState<MenuId>(null);
  const [me, setMe] = useState<DarkeProfile | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const pro = isProPlan(tier);

  const selected =
    selection && workspaces.some((row) => row.id === selection.id)
      ? (workspaces.find((row) => row.id === selection.id) ?? null)
      : null;
  const label = currentWorkspaceLabel(selected ? [selected] : workspaceList);

  useEffect(() => {
    let cancelled = false;
    void loadMyProfile()
      .then((row) => {
        if (!cancelled) setMe(row);
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!menu) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  useEffect(() => {
    setInviteRequested(false);
  }, [chat?.id]);

  const avatarUrl = label.workspace?.avatarUrl ?? me?.avatar_url ?? null;
  const avatarName = label.workspace?.name ?? me?.username ?? slug;

  const canCopyInvite = isChatOwner(chat, dmSlug || slug);

  function invitePeople() {
    setMenu(null);
    if (!canCopyInvite) return;
    setInviteOpen(true);
  }

  return (
    <>
    <div className="sidebar-brand-row">
    <div className="sidebar-brand" ref={rootRef}>
        <button
          type="button"
          className={`sidebar-logo-hit${menu === "workspace" ? " is-on" : ""}`}
          aria-haspopup="menu"
          aria-expanded={menu === "workspace"}
          aria-label="Workspace menu"
          onClick={() =>
            setMenu((prev) => (prev === "workspace" ? null : "workspace"))
          }
        >
          <img
            className="sidebar-logo"
            src="/darke.png"
            alt="DARKE"
            draggable={false}
          />
          <IconChevronDown className="sidebar-logo-caret" />
        </button>
        {menu === "workspace" ? (
          <div className="ws-logo-menu" role="menu">
            <div className="ws-logo-menu-who">
              <UserAvatar
                username={avatarName}
                url={avatarUrl}
                className="ws-logo-menu-avatar"
              />
              <div className="ws-logo-menu-who-text">
                <strong>{label.name}</strong>
                <span>{label.url}</span>
              </div>
            </div>
            {!pro ? (
              <>
                <div className="ws-logo-menu-rule" />
                <div className="ws-logo-menu-pro">
                  <p className="ws-logo-menu-pro-title">
                    Get DARKE Pro for only {PLAN_PRICE_LABEL.pro}.
                  </p>
                  <p>Unlimited invites</p>
                  <button
                    type="button"
                    className="ws-logo-menu-unlock"
                    onClick={() => {
                      setMenu(null);
                      onOpenUpgrade();
                    }}
                  >
                    Unlock DARKE PRO
                  </button>
                </div>
              </>
            ) : null}
            <div className="ws-logo-menu-rule" />
            <button
              type="button"
              className="ws-logo-menu-item"
              role="menuitem"
              onClick={invitePeople}
            >
              Invite people
            </button>
            <div className="ws-logo-menu-rule" />
            <button
              type="button"
              className="ws-logo-menu-item"
              role="menuitem"
              onClick={() => {
                setMenu(null);
                onOpenSettings();
              }}
            >
              Settings
            </button>
            <div className="ws-logo-menu-rule" />
            <button
              type="button"
              className="ws-logo-menu-item"
              role="menuitem"
              onClick={() => {
                setMenu(null);
                onSignOut();
              }}
            >
              Sign out
            </button>
          </div>
        ) : null}
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

