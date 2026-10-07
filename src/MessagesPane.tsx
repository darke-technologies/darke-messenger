import { ChatView } from "./ChatView";
import { ChatSidebar } from "./Sidebar";

export function MessagesPane() {
  return <ChatView />;
}

export function MessengerHomeNav({
  slug,
  onOpenWorkspace: _onOpenWorkspace,
  onJoinWorkspace: _onJoinWorkspace,
  onUpgrade,
  onOpenFeed,
  onOpenCompose,
  onOpenDownloads,
  onOpenSettings,
  onOpenSearch,
  onToggleSidebar,
  onSignOut,
}: {
  slug: string;
  onOpenWorkspace: () => void;
  onJoinWorkspace: () => void;
  onUpgrade: () => void;
  onOpenFeed: () => void;
  onOpenCompose: () => void;
  onOpenDownloads: () => void;
  onOpenSettings: () => void;
  onOpenSearch: () => void;
  onToggleSidebar?: () => void;
  onSignOut: () => void;
}) {
  return (
    <ChatSidebar
      slug={slug}
      onOpenFeed={onOpenFeed}
      onOpenCompose={onOpenCompose}
      onOpenDownloads={onOpenDownloads}
      onOpenSettings={onOpenSettings}
      onOpenUpgrade={onUpgrade}
      onOpenSearch={onOpenSearch}
      onToggleSidebar={onToggleSidebar}
      onSignOut={onSignOut}
    />
  );
}
