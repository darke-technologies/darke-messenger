import { useCallback, useEffect, useRef, useState } from "react";
import { IdleLockOverlay } from "./IdleLockOverlay";
import { IconBell, IconBookOpen, IconHome, IconPanelLeft, IconPeople, IconSettings } from "./icons";
import { GamesPane } from "./GamesPane";
import { MoviesPane } from "./MoviesPane";
import { BooksPane } from "./BooksPane";
import { NewsfeedDeck } from "./NewsfeedWindow";
import { PeoplePane } from "./PeoplePane";
import { ProfilePane, ProfileEditContext, EditProfileModal, useProfileEdit } from "./ProfilePane";
import { SettingsPane } from "./SettingsPane";
import { ManualPane } from "./ManualPane";
import { signOutOfDarke } from "./signOut";
import { WelcomeModal } from "./WelcomeModal";
import { NotificationsProvider, NotificationsPane, useNotifications } from "./notificationsUi";
import { isDarkenetSocialNotice } from "./notifications";
import { loadMyProfile, type DarkeProfile } from "./profile";
import {
  bannerDismissed,
  dismissNameBanner,
  needsDisplayName,
  rememberPerson,
} from "./personDirectory";
import { UserAvatar } from "./UserAvatar";
import { openExternalUrl } from "./openExternal";
import { HomeStars } from "./HomeStars";
import {
  getIdleTimeoutMin,
  getShowWelcome,
  getStarsBackground,
  IDLE_TIMEOUT_CHANGE,
  STARS_BACKGROUND_CHANGE,
  setShowWelcome,
} from "./welcomePrefs";
import { openProUpgradeModal } from "./useUpgradeModalStore";
import { WorkspaceProvider, useWorkspaces } from "./WorkspaceContext";
import {
  initialBunkerCollapsed,
  initialSection,
  readNavSnapshot,
  writeNavSnapshot,
  type Section,
} from "./navSession";
import { InviteChannelHost } from "./SidebarHeader";
import { DmProvider } from "./DmContext";
import { isP2pJoinPath } from "./teamContainer";
import {
  consumeChatLinkCopiedToast,
  COPY_LINK_TOAST_EVENT,
  copyLinkToastLabel,
  peekSkipWelcomeOnce,
  type CopyLinkKind,
} from "./dmSessions";
import { DownloadsView } from "./DownloadsView";
import { ChatSearchView } from "./ChatSearchView";
import { MessagesPane, MessengerHomeNav } from "./MessagesPane";
import { ProfileViewModal } from "./ProfileViewModal";
import {
  COMPOSE_INTENT_EVENT,
  FEED_INTENT_EVENT,
  PROFILE_INTENT_EVENT,
  WORKSPACE_INTENT_EVENT,
} from "./feedIntent";
import { toSlug } from "./slug";

export type { Section } from "./navSession";

function CopyLinkToast() {
  const [kind, setKind] = useState<CopyLinkKind | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [wave, setWave] = useState(0);

  function present(next: CopyLinkKind) {
    setLeaving(false);
    setKind(next);
    setWave((n) => n + 1);
  }

  useEffect(() => {
    const pending = consumeChatLinkCopiedToast();
    if (pending) present(pending);
    function onShow(event: Event) {
      const next = (event as CustomEvent<CopyLinkKind>).detail;
      present(
        next === "group" || next === "team" || next === "invite" ? next : "chat",
      );
    }
    window.addEventListener(COPY_LINK_TOAST_EVENT, onShow);
    return () => window.removeEventListener(COPY_LINK_TOAST_EVENT, onShow);
  }, []);

  useEffect(() => {
    if (!kind || leaving) return;
    const timer = window.setTimeout(() => setLeaving(true), 2200);
    return () => window.clearTimeout(timer);
  }, [kind, leaving, wave]);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => {
      setKind(null);
      setLeaving(false);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  if (!kind) return null;
  return (
    <p
      className={`shell-copy-toast${leaving ? " is-out" : ""}`}
      role="status"
      onAnimationEnd={() => {
        if (!leaving) return;
        setKind(null);
        setLeaving(false);
      }}
    >
      {copyLinkToastLabel(kind)}
    </p>
  );
}

function NotificationsNavButton({
  active,
  onClick,
  compact = false,
}: {
  active: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  const { rows } = useNotifications();
  const unread = rows.filter(
    (row) => !row.read && isDarkenetSocialNotice(row.type),
  ).length;
  return (
    <button
      className={
        compact
          ? `outer-rail-btn${active ? " is-on" : ""}`
          : active
            ? "active rail-nav"
            : "rail-nav"
      }
      onClick={onClick}
      type="button"
      title={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
    >
      <span className="nav-icon">
        <IconBell />
        {unread > 0 ? (
          <span className="nav-unread" aria-label={`${unread} unread`} />
        ) : null}
      </span>
      {compact ? null : <span className="nav-label">Notifications</span>}
    </button>
  );
}

function AccountNavButton({
  slug,
  active,
  onClick,
  compact = false,
}: {
  slug: string;
  active: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  const { epoch, saved } = useProfileEdit();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(saved?.avatar_url ?? null);

  useEffect(() => {
    if (saved?.avatar_url) setAvatarUrl(saved.avatar_url);
  }, [saved]);

  useEffect(() => {
    let cancelled = false;
    void loadMyProfile()
      .then((row) => {
        if (cancelled) return;
        setAvatarUrl(saved?.avatar_url ?? row?.avatar_url ?? null);
      })
      .catch(() => {
        if (!cancelled) setAvatarUrl(saved?.avatar_url ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, epoch, saved]);

  return (
    <button
      className={
        compact
          ? `outer-rail-btn${active ? " is-on" : ""}`
          : active
            ? "active rail-nav"
            : "rail-nav"
      }
      onClick={onClick}
      type="button"
      title="Profile"
    >
      <span className="nav-icon">
        <UserAvatar username={slug} url={avatarUrl} className="nav-avatar" />
      </span>
      {compact ? null : <span className="nav-label">Profile</span>}
    </button>
  );
}

type Props = {
  slug: string;
  onSignedOut: () => void | Promise<void>;
  onAborted: () => void | Promise<void>;
  onAccountDeleted: () => void | Promise<void>;
  onSlugChanged?: (slug: string) => void;
};

function DeferredWelcome({
  open,
  slug,
  onClose,
  onOpenUrl,
}: {
  open: boolean;
  slug: string;
  onClose: (dontShowAgain: boolean, go?: "home") => void | Promise<void>;
  onOpenUrl: (url: string) => void;
}) {
  const { loading } = useWorkspaces();
  if (!open || loading) return null;
  return (
    <WelcomeModal slug={slug} onClose={onClose} onOpenUrl={onOpenUrl} />
  );
}

function ComposeSection() {
  return <MessagesPane />;
}

function initialWorkspace(slug: string): { section: Section } {
  if (typeof window === "undefined") {
    return { section: "compose" };
  }
  return { section: initialSection(slug) };
}

function MessengerNavBlock({
  slug,
  onOpenWorkspace,
  onJoin,
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
  onJoin: () => void;
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
    <MessengerHomeNav
      slug={slug}
      onOpenWorkspace={onOpenWorkspace}
      onJoinWorkspace={onJoin}
      onUpgrade={onUpgrade}
      onOpenFeed={onOpenFeed}
      onOpenCompose={onOpenCompose}
      onOpenDownloads={onOpenDownloads}
      onOpenSettings={onOpenSettings}
      onOpenSearch={onOpenSearch}
      onToggleSidebar={onToggleSidebar}
      onSignOut={onSignOut}
    />
  );
}

function NavPersistence({
  slug,
  section,
  bunkerCollapsed,
}: {
  slug: string;
  section: Section;
  bunkerCollapsed: boolean;
}) {
  const { selection, setSelection, loading, workspaces, channelsByWorkspace } =
    useWorkspaces();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (loading || ready) return;
    const snap = readNavSnapshot(slug);
    const saved = snap?.selection;
    if (saved) {
      const workspace = workspaces.find((row) => row.id === saved.id);
      if (workspace) {
        const channels = channelsByWorkspace[workspace.id] ?? [];
        const channelId =
          saved.channelId && channels.some((row) => row.id === saved.channelId)
            ? saved.channelId
            : null;
        setSelection({
          id: workspace.id,
          module: saved.module,
          channelId,
        });
      }
    }
    setReady(true);
  }, [loading, ready, workspaces, channelsByWorkspace, slug, setSelection]);

  useEffect(() => {
    if (!ready) return;
    writeNavSnapshot(slug, {
      section,
      bunkerCollapsed,
      selection: selection
        ? {
            id: selection.id,
            module: selection.module,
            channelId: selection.channelId ?? null,
          }
        : null,
    });
  }, [ready, slug, section, bunkerCollapsed, selection]);

  return null;
}

function WorkspaceIntentChat() {
  return null;
}

export function Shell({ slug, onSignedOut, onAborted, onAccountDeleted, onSlugChanged }: Props) {
  const boot = initialWorkspace(slug);
  const [section, setSection] = useState<Section>(() => boot.section);
  const [bunkerCollapsed, setBunkerCollapsed] = useState(() =>
    initialBunkerCollapsed(slug),
  );
  const [inviteChannelId, setInviteChannelId] = useState<string | null>(null);
  const [peekUsername, setPeekUsername] = useState<string | null>(null);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [welcomeReady, setWelcomeReady] = useState(false);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [profileEpoch, setProfileEpoch] = useState(0);
  const [savedProfile, setSavedProfile] = useState<DarkeProfile | null>(null);
  const [nameBanner, setNameBanner] = useState(false);
  const abortingRef = useRef(false);
  const [idleLocked, setIdleLocked] = useState(false);
  const [idleTimeoutMin, setIdleTimeoutMin] = useState(0);
  const [starsOn, setStarsOn] = useState(true);
  const lastActivityRef = useRef(Date.now());
  const idleLockedRef = useRef(false);

  const panelMode: "messenger" | null =
    section === "compose" ||
    section === "feed" ||
    section === "downloads" ||
    section === "search" ||
    section === "home" ||
    section === "workspace"
      ? "messenger"
      : null;

  useEffect(() => {
    idleLockedRef.current = idleLocked;
  }, [idleLocked]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const path = window.location.pathname;
    if (path.startsWith("/teams") || /^\/join\/[^/]+/.test(path)) {
      window.history.replaceState(
        null,
        "",
        `/app${window.location.hash || ""}`,
      );
    }
  }, [slug]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (section === "manual") {
      if (!window.location.pathname.startsWith("/manual")) {
        window.history.replaceState(null, "", "/manual");
      }
      return;
    }
    if (section === "compose") {
      const path = window.location.pathname;
      const onMessenger =
        path.startsWith("/app/chat") ||
        path.startsWith("/messages") ||
        isP2pJoinPath(path);
      if (!onMessenger) {
        window.history.replaceState(
          null,
          "",
          `/app${window.location.hash || ""}`,
        );
      }
      return;
    }
    if (section === "feed") {
      if (!window.location.pathname.startsWith("/app/feed")) {
        window.history.replaceState(null, "", "/app/feed");
      }
      return;
    }
    if (section === "search") {
      if (!window.location.pathname.startsWith("/app/search")) {
        window.history.replaceState(null, "", "/app/search");
      }
      return;
    }
    if (window.location.pathname.startsWith("/manual")) {
      window.history.replaceState(null, "", "/");
    }
  }, [section, slug]);

  useEffect(() => {
    let cancelled = false;
    void loadMyProfile()
      .then((row) => {
        if (cancelled || !row) return;
        rememberPerson(row);
        setSavedProfile(row);
        setNameBanner(needsDisplayName(row) && !bannerDismissed(slug));
      })
      .catch(() => {
        if (!cancelled) setNameBanner(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, profileEpoch]);

  useEffect(() => {
    let cancelled = false;
    void getIdleTimeoutMin()
      .then((min) => {
        if (!cancelled) setIdleTimeoutMin(min);
      })
      .catch(() => null);
    const onPref = (event: Event) => {
      const min = (event as CustomEvent<number>).detail;
      if (typeof min === "number") setIdleTimeoutMin(min);
    };
    window.addEventListener(IDLE_TIMEOUT_CHANGE, onPref);
    return () => {
      cancelled = true;
      window.removeEventListener(IDLE_TIMEOUT_CHANGE, onPref);
    };
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    void getStarsBackground()
      .then((on) => {
        if (!cancelled) setStarsOn(on);
      })
      .catch(() => {
        if (!cancelled) setStarsOn(true);
      });
    const onPref = (event: Event) => {
      const on = (event as CustomEvent<boolean>).detail;
      if (typeof on === "boolean") setStarsOn(on);
    };
    window.addEventListener(STARS_BACKGROUND_CHANGE, onPref);
    return () => {
      cancelled = true;
      window.removeEventListener(STARS_BACKGROUND_CHANGE, onPref);
    };
  }, [slug]);

  useEffect(() => {
    function onPop() {
      const path = window.location.pathname;
      if (path.startsWith("/teams") || /^\/join\/[^/]+/.test(path)) {
        window.history.replaceState(null, "", "/app");
        setSection("compose");
        return;
      }
      if (path.startsWith("/app")) {
        setSection("compose");
      }
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [slug]);

  useEffect(() => {
    lastActivityRef.current = Date.now();
    const bump = () => {
      if (idleLockedRef.current) return;
      lastActivityRef.current = Date.now();
    };
    const events: Array<keyof WindowEventMap> = [
      "pointerdown",
      "pointermove",
      "keydown",
      "wheel",
      "mousemove",
      "touchstart",
    ];
    for (const ev of events) {
      window.addEventListener(ev, bump, { capture: true, passive: true });
    }
    return () => {
      for (const ev of events) {
        window.removeEventListener(ev, bump, { capture: true });
      }
    };
  }, []);

  useEffect(() => {
    if (idleTimeoutMin <= 0 || idleLocked) return;
    const ms = idleTimeoutMin * 60 * 1000;
    const tick = window.setInterval(() => {
      if (idleLockedRef.current || abortingRef.current) return;
      if (Date.now() - lastActivityRef.current >= ms) {
        setIdleLocked(true);
      }
    }, 1000);
    return () => window.clearInterval(tick);
  }, [idleTimeoutMin, idleLocked]);

  useEffect(() => {
    setWelcomeReady(true);
  }, [slug]);

  useEffect(() => {
    const goFeed = () => {
      setSection("feed");
    };
    const goProfile = (event: Event) => {
      const username = (event as CustomEvent<{ username: string }>).detail
        ?.username;
      if (username && toSlug(username) === toSlug(slug)) {
        setSection("profile");
      }
    };
    const goCompose = () => {
      setSection("compose");
    };
    const goWorkspace = () => {
      setSection("compose");
    };
    window.addEventListener(FEED_INTENT_EVENT, goFeed);
    window.addEventListener(PROFILE_INTENT_EVENT, goProfile);
    window.addEventListener(COMPOSE_INTENT_EVENT, goCompose);
    window.addEventListener(WORKSPACE_INTENT_EVENT, goWorkspace);
    return () => {
      window.removeEventListener(FEED_INTENT_EVENT, goFeed);
      window.removeEventListener(PROFILE_INTENT_EVENT, goProfile);
      window.removeEventListener(COMPOSE_INTENT_EVENT, goCompose);
      window.removeEventListener(WORKSPACE_INTENT_EVENT, goWorkspace);
    };
  }, [slug]);

  useEffect(() => {
    if (!welcomeReady) return;
    let cancelled = false;
    void getShowWelcome()
      .then((show) => {
        if (cancelled) return;
        setWelcomeOpen(peekSkipWelcomeOnce() ? false : show);
      })
      .catch(() => {
        if (!cancelled) setWelcomeOpen(peekSkipWelcomeOnce() ? false : true);
      });
    return () => {
      cancelled = true;
    };
  }, [welcomeReady, slug]);

  function openSideSection(id: Section) {
    const next =
      id === "home" || id === "workspace" || id === "teams" ? "compose" : id;
    setSection(next);
    if (typeof window === "undefined") return;
    if (next === "manual") {
      window.history.replaceState(null, "", "/manual");
      return;
    }
    if (next === "compose") {
      window.history.replaceState(null, "", "/app");
      return;
    }
    if (next === "downloads") {
      window.history.replaceState(null, "", "/app/downloads");
      return;
    }
    if (next === "search") {
      window.history.replaceState(null, "", "/app/search");
      return;
    }
    if (next === "feed") {
      window.history.replaceState(null, "", "/app/feed");
      return;
    }
    if (window.location.pathname.startsWith("/manual")) {
      window.history.replaceState(null, "", "/");
    }
  }

  async function abortSession() {
    if (abortingRef.current) return;
    abortingRef.current = true;
    try {
      await signOutOfDarke();
      await onAborted();
    } catch {
      abortingRef.current = false;
    }
  }

  const openUrl = useCallback((url: string) => {
    void openExternalUrl(url).catch(() => null);
  }, []);

  async function dismissWelcome(dontShowAgain: boolean, go?: Section) {
    setWelcomeOpen(false);
    if (dontShowAgain) {
      try {
        await setShowWelcome(false);
      } catch {
        // Still dismissed so sign-in is never blocked.
      }
    }
    if (go) openSideSection(go);
  }

  return (
    <NotificationsProvider>
    <ProfileEditContext.Provider
      value={{
        open: () => setProfileEditOpen(true),
        epoch: profileEpoch,
        saved: savedProfile,
        applySaved: (row) => {
          setSavedProfile(row);
          rememberPerson(row);
          setProfileEpoch((n) => n + 1);
          if (!needsDisplayName(row)) setNameBanner(false);
        },
      }}
    >
    <WorkspaceProvider slug={slug} profile={savedProfile}>
    <DmProvider slug={slug}>
    <div className={`app-frame${section === "feed" || section === "settings" || section === "manual" ? " shell-web" : ""}`}>
      <CopyLinkToast />
      {nameBanner ? (
        <div className="profile-name-banner" role="status">
          <p>
            Add a display name so teammates can tell you apart from your @username.
          </p>
          <button
            type="button"
            className="term-btn term-btn-emerald"
            onClick={() => {
              setProfileEditOpen(true);
              dismissNameBanner(slug);
              setNameBanner(false);
            }}
          >
            Complete profile
          </button>
          <button
            type="button"
            className="projects-choice-btn"
            onClick={() => {
              dismissNameBanner(slug);
              setNameBanner(false);
            }}
          >
            Dismiss
          </button>
        </div>
      ) : null}
      {nameBanner ? (
        <div className="profile-name-banner" role="status">
          <p>
            Add a display name so teammates can tell you apart from your @username.
          </p>
          <button
            type="button"
            className="term-btn term-btn-emerald"
            onClick={() => {
              setProfileEditOpen(true);
              dismissNameBanner(slug);
              setNameBanner(false);
            }}
          >
            Complete profile
          </button>
          <button
            type="button"
            className="projects-choice-btn"
            onClick={() => {
              dismissNameBanner(slug);
              setNameBanner(false);
            }}
          >
            Dismiss
          </button>
        </div>
      ) : null}
      <DeferredWelcome
        open={welcomeOpen}
        slug={slug}
        onClose={(dontShowAgain, go) => void dismissWelcome(dontShowAgain, go)}
        onOpenUrl={openUrl}
      />
      {profileEditOpen ? (
        <EditProfileModal
          slug={slug}
          onClose={() => setProfileEditOpen(false)}
          onSaved={(next, nextSlug) => {
            setProfileEditOpen(false);
            setSavedProfile(next);
            setProfileEpoch((n) => n + 1);
            if (nextSlug && nextSlug !== slug) onSlugChanged?.(nextSlug);
          }}
        />
      ) : null}
      <div
        className={`shell${panelMode ? " is-rail-off" : " is-panel-off"}${bunkerCollapsed && panelMode ? " is-bunker-collapsed" : ""}`}
      >
        <nav
          className="outer-rail"
          aria-label="DARKE"
          hidden={Boolean(panelMode)}
          aria-hidden={Boolean(panelMode)}
        >
          <button
            type="button"
            className={`outer-rail-btn${section === "compose" || section === "home" || section === "search" ? " is-on" : ""}`}
            title="Home"
            onClick={() => openSideSection("compose")}
          >
            <span className="nav-icon">
              <IconHome />
            </span>
          </button>
          <button
            type="button"
            className={`outer-rail-btn${section === "people" ? " is-on" : ""}`}
            title="People"
            onClick={() => openSideSection("people")}
          >
            <span className="nav-icon">
              <IconPeople />
            </span>
          </button>
          <NotificationsNavButton
            compact
            active={section === "notifications"}
            onClick={() => openSideSection("notifications")}
          />
          <AccountNavButton
            compact
            slug={slug}
            active={section === "profile"}
            onClick={() => openSideSection("profile")}
          />
          <span className="outer-rail-spacer" />
          <button
            type="button"
            className={`outer-rail-btn${section === "manual" ? " is-on" : ""}`}
            title="MANUAL"
            onClick={() => openSideSection("manual")}
          >
            <span className="nav-icon">
              <IconBookOpen />
            </span>
          </button>
          <button
            type="button"
            className={`outer-rail-btn${section === "settings" ? " is-on" : ""}`}
            title="Settings"
            onClick={() => openSideSection("settings")}
          >
            <span className="nav-icon">
              <IconSettings />
            </span>
          </button>
        </nav>
        <aside
          className="sidebar bunker"
          aria-label="Messenger"
          hidden={!panelMode}
        >
          <NavPersistence
            slug={slug}
            section={section}
            bunkerCollapsed={bunkerCollapsed}
          />
          <WorkspaceIntentChat />
          {panelMode === "messenger" ? (
            <nav className="side-nav">
              <MessengerNavBlock
                slug={slug}
                onOpenWorkspace={() => setSection("compose")}
                onJoin={() => undefined}
                onUpgrade={() => openProUpgradeModal()}
                onOpenFeed={() => openSideSection("feed")}
                onOpenCompose={() => openSideSection("compose")}
                onOpenDownloads={() => openSideSection("downloads")}
                onOpenSearch={() => openSideSection("search")}
                onToggleSidebar={() => setBunkerCollapsed((on) => !on)}
                onOpenSettings={() => openSideSection("settings")}
                onSignOut={() => void abortSession()}
              />
            </nav>
          ) : null}
        </aside>
        {panelMode && bunkerCollapsed ? (
          <button
            type="button"
            className="sidebar-expand-fab"
            aria-label="Expand sidebar"
            onClick={() => setBunkerCollapsed(false)}
          >
            <IconPanelLeft />
          </button>
        ) : null}

        <div className="workspace">
          <div className="workspace-body">
          <main className="main">
            {starsOn && section !== "profile" ? (
              <div className="app-starfield pane-star-host" aria-hidden>
                <HomeStars />
              </div>
            ) : null}
            <div className="main-sky">
            {section === "feed" ? (
              <div className="home-page">
                <section className="home-feed" aria-label="DARKENET feed">
                  <NewsfeedDeck variant="page" />
                </section>
              </div>
            ) : section === "games" ? (
              <GamesPane />
            ) : section === "movies" ? (
              <MoviesPane />
            ) : section === "books" ? (
              <BooksPane />
            ) : section === "people" ? (
              <PeoplePane
                slug={slug}
                onOpenUrl={openUrl}
                onEditProfile={() => setProfileEditOpen(true)}
                onUpgrade={() => openProUpgradeModal()}
              />
            ) : section === "notifications" ? (
              <NotificationsPane
                slug={slug}
                onOpenUrl={openUrl}
                onEditProfile={() => setProfileEditOpen(true)}
              />
            ) : section === "profile" ? (
              <ProfilePane
                slug={slug}
                onOpenUrl={openUrl}
              />
            ) : section === "workspace" ||
              section === "home" ||
              section === "compose" ? (
              <ComposeSection />
            ) : section === "downloads" ? (
              <DownloadsView />
            ) : section === "search" ? (
              <ChatSearchView />
            ) : section === "settings" ? (
              <SettingsPane
                slug={slug}
                onSignedOut={onSignedOut}
                onAccountDeleted={onAccountDeleted}
              />
            ) : section === "manual" ? (
              <ManualPane onHome={() => openSideSection("compose")} />
            ) : null}
            </div>
          </main>
          </div>
        </div>
      </div>
      {inviteChannelId ? (
        <InviteChannelHost
          channelId={inviteChannelId}
          onClose={() => setInviteChannelId(null)}
          onUpgrade={() => {
            setInviteChannelId(null);
            openProUpgradeModal();
          }}
        />
      ) : null}
      {peekUsername ? (
        <ProfileViewModal
          username={peekUsername}
          viewerSlug={slug}
          onBack={() => setPeekUsername(null)}
          backLabel="Back"
          onOpenUrl={openUrl}
          onEditProfile={() => {
            setPeekUsername(null);
            setProfileEditOpen(true);
          }}
        />
      ) : null}
      {idleLocked ? (
        <IdleLockOverlay
          slug={slug}
          onUnlock={() => {
            lastActivityRef.current = Date.now();
            setIdleLocked(false);
          }}
        />
      ) : null}
    </div>
    </DmProvider>
    </WorkspaceProvider>
    </ProfileEditContext.Provider>
    </NotificationsProvider>
  );
}
