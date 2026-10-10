import { InviteModal } from "./InviteModal";

export function TopNav({
  onInvite: _onInvite,
  inviteOpen,
  shareLink,
  copied,
  onCopy,
  onCloseInvite,
  canCopy = true,
  requested = false,
  onRequest,
  memberCount = 1,
  isGroup = false,
  slug = "",
  takenHandles = [],
  onAdd,
}: {
  onInvite: () => void;
  inviteOpen: boolean;
  shareLink: string;
  copied: boolean;
  onCopy: () => void;
  onCloseInvite: () => void;
  canCopy?: boolean;
  requested?: boolean;
  onRequest?: () => void;
  memberCount?: number;
  isGroup?: boolean;
  slug?: string;
  takenHandles?: string[];
  onAdd?: (handle: string) => void;
}) {
  return (
    <>
      {inviteOpen && canCopy ? (
        <InviteModal
          shareLink={shareLink}
          copied={copied}
          onCopy={onCopy}
          onClose={onCloseInvite}
          canCopy={canCopy}
          requested={requested}
          onRequest={onRequest}
          memberCount={memberCount}
          isGroup={isGroup}
          slug={slug}
          takenHandles={takenHandles}
          onAdd={onAdd}
        />
      ) : null}
    </>
  );
}
