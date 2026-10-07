import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDm } from "./DmContext";
import { threadIsGroup } from "./chatController";
import { listChatMemberHandles, threadLastActivityAt } from "./chatService";
import { useLocalChat } from "./useLocalChat";
import {
  sidebarAvatarNames,
  sidebarRowLabel,
  sidebarRowPreview,
  sidebarThreadBadge,
  sidebarUnreadCount,
} from "./useSidebarStore";
import { NewChatPanel } from "./NewChatPanel";
import { IconBuilding, IconChevronDown, IconChevronRight, IconHome, IconPin, IconSearch } from "./icons";
import { focusChatMessage, openConversationSettings } from "./dmSessions";
import { AppHeader } from "./SidebarHeader";
import { SidebarChatItem } from "./SidebarChatItem";
import { TeamMoveSeatModal } from "./TeamMoveSeatModal";
import type { TeamMovePreview } from "./teamService";
import {
  addTeamSection,
  canManageTeam,
  listTeams,
  loadCollapsedTeams,
  openTeamCenter,
  saveCollapsedTeams,
  TEAM_CHANGE_EVENT,
  teamSeatCap,
  teamSeatsUsed,
  type DarkeTeam,
} from "./teamContainer";
import { isProPlan } from "./workspaces";
import { useWorkspacesMaybe } from "./WorkspaceContext";
import { isPersonalWorkspace, useTeamWorkspace } from "./teamWorkspace";
import { openPricingPage } from "./useUpgradeModalStore";
import type { DmThread } from "./dmSessions";
import { handleBadge, usePersonDirectory } from "./personDirectory";

type StreamFilter = "all" | "dms" | "groups";

export function ChatSidebar({
  slug,
  onOpenFeed: _onOpenFeed,
  onOpenCompose,
  onOpenDownloads: _onOpenDownloads,
  onOpenSettings,
  onOpenUpgrade,
  onOpenSearch: _onOpenSearch,
  onToggleSidebar: _onToggleSidebar,
  onSignOut,
}: {
  slug: string;
  onOpenFeed: () => void;
  onOpenCompose: () => void;
  onOpenDownloads: () => void;
  onOpenSettings: () => void;
  onOpenUpgrade: () => void;
  onOpenSearch: () => void;
  onToggleSidebar?: () => void;
  onSignOut: () => void;
}) {
  const {
    threads,
    activeId,
    setActiveId,
    dismissRoomReady,
    renameThread,
    pinThread,
    deleteThread,
    bindChatToTeam,
  } = useDm();
  const localChat = useLocalChat(slug);
  const workspaces = useWorkspacesMaybe();
  const { workspaceId, hubOpen, activeTeam, openHub, enterPersonal } =
    useTeamWorkspace();
  const pro = isProPlan(workspaces?.tier ?? "free");
  const [teams, setTeams] = useState(() => listTeams(slug));
  const vaultTeam =
    !isPersonalWorkspace(workspaceId)
      ? teams.find((row) => row.id === workspaceId) ?? activeTeam
      : null;
  const teamMode = Boolean(vaultTeam);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [stream, setStream] = useState<StreamFilter>("all");
  const [expanded, setExpanded] = useState(() => loadCollapsedTeams(slug));
  const [sectionDraft, setSectionDraft] = useState("");
  const [menu, setMenu] = useState<{
    chatId: string;
    x: number;
    y: number;
    pickTeam?: boolean;
  } | null>(null);
  const [moveBlock, setMoveBlock] = useState<TeamMovePreview | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const menuThread = menu
    ? threads.find((row) => row.id === menu.chatId) ?? null
    : null;
  const renameThreadRow = renameId
    ? threads.find((row) => row.id === renameId) ?? null
    : null;

  useEffect(() => {
    function sync() {
      setTeams(listTeams(slug));
    }
    sync();
    setExpanded(loadCollapsedTeams(slug));
    window.addEventListener(TEAM_CHANGE_EVENT, sync);
    return () => window.removeEventListener(TEAM_CHANGE_EVENT, sync);
  }, [slug, threads]);

  useEffect(() => {
    if (!activeId) return;
    const row = threads.find((thread) => thread.id === activeId);
    const teamId = row?.teamId;
    if (!teamId) return;
    setExpanded((curr) => {
      if (curr.has(teamId)) return curr;
      const next = new Set(curr);
      next.add(teamId);
      saveCollapsedTeams(slug, next);
      return next;
    });
  }, [activeId, threads, slug]);

  useEffect(() => {
    function close() {
      setMenu(null);
    }
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const assigned = useMemo(() => {
    const ids = new Set<string>();
    for (const team of teams) {
      for (const id of team.chatIds) ids.add(id);
    }
    return ids;
  }, [teams]);

  const recent = useMemo(
    () =>
      threads
        .filter((thread) => !assigned.has(thread.id) && !thread.teamId)
        .slice()
        .sort((a, b) => threadLastActivityAt(b) - threadLastActivityAt(a)),
    [threads, assigned],
  );
  const q = query.trim().toLowerCase();
  const directoryHandles = useMemo(() => {
    const rows = [slug];
    for (const thread of threads) {
      rows.push(...listChatMemberHandles(thread, slug));
    }
    return rows;
  }, [threads, slug]);
  const people = usePersonDirectory(directoryHandles);
  void people.version;

  function chatMatches(thread: DmThread) {
    if (!q) return true;
    const label = sidebarRowLabel(thread, slug, localChat.peek(thread.id)).toLowerCase();
    const preview = sidebarRowPreview(thread, slug).toLowerCase();
    const handles = listChatMemberHandles(thread, slug);
    const names = handles.some((handle) => {
      const person = people.person(handle);
      const display = (person?.displayName || handle).toLowerCase();
      const user = handle.replace(/^@/, "").trim().toLowerCase();
      return display.includes(q) || user.includes(q) || `@${user}`.includes(q);
    });
    return label.includes(q) || preview.includes(q) || names;
  }

  const visibleRecent = (q ? recent.filter(chatMatches) : recent).filter(
    matchesStream,
  );

  const teamUnread = useMemo(() => {
    return threads.reduce((sum, thread) => {
      if (!assigned.has(thread.id) && !thread.teamId) return sum;
      return sum + sidebarUnreadCount(thread);
    }, 0);
  }, [threads, assigned]);

  function matchesStream(thread: DmThread) {
    if (stream === "all") return true;
    const group = threadIsGroup(thread);
    return stream === "groups" ? group : !group;
  }

  function chatsForTeam(team: DarkeTeam) {
    const ids = new Set(team.chatIds);
    return threads
      .filter((thread) => ids.has(thread.id) || thread.teamId === team.id)
      .filter(chatMatches)
      .filter(matchesStream)
      .slice()
      .sort((a, b) => threadLastActivityAt(b) - threadLastActivityAt(a));
  }

  function renderChatRow(thread: DmThread) {
    const label = sidebarRowLabel(thread, slug, localChat.peek(thread.id));
    return (
      <SidebarChatItem
        key={thread.id}
        label={label}
        preview={sidebarRowPreview(thread, slug)}
        avatars={sidebarAvatarNames(thread, slug)}
        group={threadIsGroup(thread)}
        peerAvatarUrl={
          threadIsGroup(thread)
            ? null
            : people.person(sidebarAvatarNames(thread, slug)[0] || "")
                ?.avatarUrl ?? null
        }
        active={thread.id === activeId}
        pinned={Boolean(thread.pinned)}
        badge={sidebarThreadBadge(thread)}
        handle={
          threadIsGroup(thread)
            ? undefined
            : handleBadge(
                sidebarAvatarNames(thread, slug)[0] ||
                  listChatMemberHandles(thread, slug).find(
                    (h) => h !== slug.replace(/^@/, "").trim().toLowerCase(),
                  ) ||
                  "",
              )
        }
        menuOpen={menu?.chatId === thread.id}
        unread={sidebarUnreadCount(thread)}
        onOpen={() => openChat(thread.id)}
        onMenu={(x, y) => openMenu(thread.id, x, y)}
        onDragStart={() => thread.id}
      />
    );
  }

  function openChat(id: string, messageId?: string) {
    onOpenCompose();
    dismissRoomReady();
    setActiveId(id);
    focusChatMessage(id, messageId);
    setMenu(null);
  }

  function refreshTeams() {
    setTeams(listTeams(slug));
  }

  function tryMoveToTeam(chatId: string, teamId?: string) {
    if (!chatId) return;
    const thread = threads.find((row) => row.id === chatId);
    if (!thread) return;
    const roster = listTeams(slug);
    if (!teamId && roster.length > 1) {
      setMenu((curr) =>
        curr?.chatId === chatId
          ? { ...curr, pickTeam: true }
          : { chatId, x: 160, y: 160, pickTeam: true },
      );
      return;
    }
    const result = bindChatToTeam(chatId, teamId ?? roster[0]?.id);
    if (!result.ok && result.preview?.blocked) {
      setMoveBlock(result.preview);
      return;
    }
    refreshTeams();
  }

  function toggleTeam(id: string) {
    setExpanded((curr) => {
      const next = new Set(curr);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveCollapsedTeams(slug, next);
      return next;
    });
  }

  function openMenu(chatId: string, x: number, y: number) {
    const left = Math.min(x, window.innerWidth - 240);
    const top = Math.min(y, window.innerHeight - 280);
    setMenu({ chatId, x: left, y: top });
  }

  return (
    <div className="dm-nav">
      {newChatOpen ? (
        <NewChatPanel slug={slug} onClose={() => setNewChatOpen(false)} />
      ) : null}
      {moveBlock ? (
        <TeamMoveSeatModal preview={moveBlock} onClose={() => setMoveBlock(null)} />
      ) : null}
      <div className="dm-nav-head">
        <AppHeader
          slug={slug}
          onOpenSettings={onOpenSettings}
          onOpenUpgrade={onOpenUpgrade}
          onOpenWorkspace={onOpenCompose}
          onInviteChannel={() => undefined}
          onCompose={() => {
            onOpenCompose();
            setNewChatOpen(true);
          }}
          onSignOut={onSignOut}
        />
        <div className="dm-nav-stream" role="tablist" aria-label="Stream filter">
          {(
            [
              ["all", "ALL"],
              ["dms", "DMs"],
              ["groups", "GROUPS"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={stream === id}
              className={`dm-nav-stream-btn${stream === id ? " is-on" : ""}`}
              onClick={() => setStream(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="dm-nav-search">
          <IconSearch className="dm-nav-search-icon" />
          <input
            className="dm-nav-search-input"
            value={query}
            placeholder="Search"
            aria-label="Search chats"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="dm-nav-scroll">
      {teamMode && vaultTeam ? (
        <TeamVaultNav
          slug={slug}
          team={vaultTeam}
          chats={chatsForTeam(vaultTeam)}
          query={q}
          sectionDraft={sectionDraft}
          setSectionDraft={setSectionDraft}
          expanded={expanded}
          toggleTeam={toggleTeam}
          renderChatRow={renderChatRow}
          onBack={enterPersonal}
          onOpenCenter={() => openTeamCenter(vaultTeam)}
        />
      ) : (
        <>
      <div className="dm-nav-section dm-nav-folders">
        <button
          type="button"
          className={`dm-nav-teams-entry${hubOpen ? " is-on" : ""}`}
          onClick={() => openHub()}
        >
          <IconBuilding className="dm-nav-teams-entry-icon" />
          <span>Teams</span>
          {teamUnread > 0 ? (
            <span className="dm-nav-unread" aria-label={`${teamUnread} unread`}>
              {teamUnread > 99 ? "99+" : teamUnread}
            </span>
          ) : null}
        </button>
      </div>

      <div className="dm-nav-section dm-nav-section-chats">
        <span className="nav-cat dm-nav-label">RECENTS</span>
        <div className="dm-nav-list">
          {visibleRecent.length === 0 ? (
            <p className="muted msg-nav-empty">
              {q ? "No matching chats." : "No standalone chats."}
            </p>
          ) : (
            visibleRecent.map((thread) => renderChatRow(thread))
          )}
        </div>
      </div>
        </>
      )}
      </div>

      {menu && menuThread ? (
        <div
          className="folder-menu chat-nav-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.pickTeam ? (
            <>
              {teams.map((team) => (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => {
                    tryMoveToTeam(menu.chatId, team.id);
                    setMenu(null);
                  }}
                >
                  {team.name}
                </button>
              ))}
            </>
          ) : (
            <>
          <button
            type="button"
            onClick={() => {
              pinThread(menu.chatId);
              setMenu(null);
            }}
          >
            <IconPin className="chat-nav-menu-icon" />
            {menuThread.pinned ? "Unpin" : "Pin"}
          </button>
          <button
            type="button"
            onClick={() => {
              setRenameId(menu.chatId);
              setMenu(null);
            }}
          >
            <span aria-hidden>✎</span>
            Rename
          </button>
          <button
            type="button"
            onClick={() => {
              onOpenCompose();
              dismissRoomReady();
              setActiveId(menu.chatId);
              openConversationSettings(menu.chatId);
              setMenu(null);
            }}
          >
            <span aria-hidden>⚙</span>
            {menuThread && threadIsGroup(menuThread)
              ? "Group settings"
              : "Chat settings"}
          </button>
          {menuThread.teamId ? null : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (teams.length > 1) {
                setMenu({ ...menu, pickTeam: true });
                return;
              }
              tryMoveToTeam(menu.chatId, teams[0]?.id);
              setMenu(null);
            }}
          >
            <span aria-hidden>📓</span>
            {menuThread && threadIsGroup(menuThread)
              ? "Move Group to Team"
              : "Move Chat to Team"}
          </button>
          )}
          <button
            type="button"
            className="chat-nav-menu-danger"
            onClick={() => {
              const id = menu.chatId;
              deleteThread(id);
              refreshTeams();
              setMenu(null);
            }}
          >
            <span aria-hidden>🗑</span>
            Delete
          </button>
            </>
          )}
        </div>
      ) : null}

      {renameThreadRow ? (
        <RenameChatModal
          title={localChat.peek(renameThreadRow.id) ?? ""}
          onClose={() => setRenameId(null)}
          onRename={(name) => {
            renameThread(renameThreadRow.id, name);
            setRenameId(null);
          }}
        />
      ) : null}

      {teamMode && vaultTeam ? (
      <div className="dm-nav-foot">
        <div className="dm-nav-seats">
          <div className="dm-nav-seats-copy">
            <span>{pro || vaultTeam.plan === "premium" ? "TEAM seats" : "Free TEAM seats"}</span>
            <strong>
              {teamSeatsUsed(vaultTeam)} of{" "}
              {Number.isFinite(teamSeatCap(pro)) ? teamSeatCap(pro) : "∞"}
            </strong>
          </div>
          <div className="dm-nav-seats-bar" aria-hidden>
            <span
              style={{
                width: `${Math.min(
                  100,
                  (teamSeatsUsed(vaultTeam) /
                    Math.max(
                      Number.isFinite(teamSeatCap(pro))
                        ? teamSeatCap(pro)
                        : teamSeatsUsed(vaultTeam),
                      1,
                    )) *
                    100,
                )}%`,
              }}
            />
          </div>
        </div>
        <button
          type="button"
          className="dm-nav-seats-add"
          onClick={() => openPricingPage()}
        >
          Add seats · Premium
        </button>
      </div>
      ) : null}
    </div>
  );
}

function TeamVaultNav({
  slug,
  team,
  chats,
  query,
  sectionDraft,
  setSectionDraft,
  expanded,
  toggleTeam,
  renderChatRow,
  onBack,
  onOpenCenter,
}: {
  slug: string;
  team: DarkeTeam;
  chats: DmThread[];
  query: string;
  sectionDraft: string;
  setSectionDraft: (value: string) => void;
  expanded: Set<string>;
  toggleTeam: (id: string) => void;
  renderChatRow: (thread: DmThread) => ReactNode;
  onBack: () => void;
  onOpenCenter: () => void;
}) {
  const manage = canManageTeam(team, slug);
  const sections = team.sections ?? [];
  const sectionChatIds = new Set(sections.flatMap((row) => row.chatIds));
  const leftover = chats.filter((thread) => !sectionChatIds.has(thread.id));
  const groups = leftover.filter((thread) => threadIsGroup(thread));
  const dms = leftover.filter((thread) => !threadIsGroup(thread));

  function sectionChats(sectionId: string) {
    const ids = new Set(
      sections.find((row) => row.id === sectionId)?.chatIds ?? [],
    );
    return chats.filter((thread) => ids.has(thread.id));
  }

  return (
    <div className="dm-nav-section dm-nav-team-vault">
      <button type="button" className="dm-nav-vault-back" onClick={onBack}>
        ← Back to Personal Vault
      </button>
      <div className={`dm-nav-row dm-nav-team-head${manage ? " has-home" : ""}`}>
        <button
          type="button"
          className="folder-toggle dm-nav-team-toggle dm-nav-row-main"
          onClick={onOpenCenter}
        >
          {team.avatarUrl ? (
            <img className="dm-nav-team-mark" src={team.avatarUrl} alt="" />
          ) : (
            <span className="dm-nav-team-mark is-letter" aria-hidden>
              {(team.name.trim().charAt(0) || "T").toUpperCase()}
            </span>
          )}
          <span className="dm-nav-team-title">
            <span className="dm-nav-team-name">{team.name}</span>
          </span>
        </button>
        {manage ? (
          <button
            type="button"
            className="dm-nav-team-home"
            aria-label={`Open Team Admin for ${team.name}`}
            title="Team Admin"
            onClick={onOpenCenter}
          >
            <IconHome className="dm-nav-team-home-icon" />
          </button>
        ) : null}
      </div>

      {sections.map((section) => {
        const open = query ? true : expanded.has(section.id);
        const rows = sectionChats(section.id);
        return (
          <div key={section.id} className="folder-tree dm-nav-team">
            <button
              type="button"
              className="folder-toggle dm-nav-team-toggle dm-nav-row-main"
              onClick={() => toggleTeam(section.id)}
            >
              <span className="dm-nav-team-title">
                <span className="dm-nav-team-name">{section.name}</span>
                <span className="dm-nav-team-chevron" aria-hidden>
                  {open ? (
                    <IconChevronDown className="dm-nav-team-chevron-icon" />
                  ) : (
                    <IconChevronRight className="dm-nav-team-chevron-icon" />
                  )}
                </span>
              </span>
            </button>
            {open ? (
              <div className="dm-nav-list dm-nav-team-chats">
                {rows.length === 0 ? (
                  <p className="muted msg-nav-empty">No chats in this section.</p>
                ) : (
                  rows.map((thread) => renderChatRow(thread))
                )}
              </div>
            ) : null}
          </div>
        );
      })}

      {manage ? (
        <form
          className="dm-nav-section-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (!sectionDraft.trim()) return;
            addTeamSection(slug, team.id, sectionDraft);
            setSectionDraft("");
          }}
        >
          <input
            className="dm-nav-search-input"
            value={sectionDraft}
            placeholder="New section"
            aria-label="New section name"
            onChange={(e) => setSectionDraft(e.target.value)}
          />
          <button type="submit" className="dm-nav-section-add-btn" disabled={!sectionDraft.trim()}>
            Add
          </button>
        </form>
      ) : null}

      <span className="nav-cat dm-nav-label">Team groups</span>
      <div className="dm-nav-list">
        {groups.length === 0 ? (
          <p className="muted msg-nav-empty">
            {query ? "No matching groups." : "No team groups yet."}
          </p>
        ) : (
          groups.map((thread) => renderChatRow(thread))
        )}
      </div>
      <span className="nav-cat dm-nav-label">Team DMs</span>
      <div className="dm-nav-list">
        {dms.length === 0 ? (
          <p className="muted msg-nav-empty">
            {query ? "No matching DMs." : "No team DMs yet."}
          </p>
        ) : (
          dms.map((thread) => renderChatRow(thread))
        )}
      </div>
    </div>
  );
}

function RenameChatModal({
  title,
  onClose,
  onRename,
}: {
  title: string;
  onClose: () => void;
  onRename: (name: string) => void;
}) {
  const [value, setValue] = useState(title);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  const trimmed = value.trim();
  return createPortal(
    <div
      className="apps-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="apps-modal chat-rename-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-rename-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 id="chat-rename-title">Rename this chat</h3>
        <input
          className="dm-session-field"
          value={value}
          autoFocus
          spellCheck={false}
          aria-label="Chat name"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && trimmed) onRename(trimmed);
          }}
        />
        <div className="projects-choice-actions">
          <button type="button" className="projects-choice-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="term-btn term-btn-emerald"
            disabled={!trimmed}
            onClick={() => onRename(trimmed)}
          >
            Rename
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
