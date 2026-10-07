import { useEffect, useState } from "react";
import { DirectoryView } from "./DirectoryView";
import { loadProfilesByIds, type DarkeProfile } from "./profile";
import { UserAvatar } from "./UserAvatar";
import { ProfileViewModal } from "./ProfileViewModal";
import { useProfileEdit } from "./ProfilePane";
import { PageStarfield } from "./HomeStars";
import { useWorkspaces } from "./WorkspaceContext";
import { InviteMembersModal } from "./WorkspaceMembersPane";
import {
  isWorkspaceAdmin,
  workspaceError,
  type DarkeWorkspace,
} from "./workspaces";
import {
  atSeatCap,
  loadOrganizationMembers,
  organizationSeats,
} from "./teamService";

type Props = {
  slug: string;
  onOpenUrl?: (url: string) => void;
  onEditProfile?: () => void;
  onUpgrade?: () => void;
};

type PeopleTab = "people" | "team";

function rosterRole(
  personId: string,
  role: string,
  ownerId: string,
): "Owner" | "Admin" | "Member" {
  if (personId === ownerId) return "Owner";
  if (role === "owner" || role === "admin") return "Admin";
  return "Member";
}

export function PeopleView({
  slug,
  onOpenUrl,
  onEditProfile,
  onUpgrade,
}: Props) {
  const { active, selection, workspaces, tier, meId } = useWorkspaces();
  const [tab, setTab] = useState<PeopleTab>("people");
  const workspace =
    (selection && workspaces.find((row) => row.id === selection.id)) ||
    active[0] ||
    null;

  return (
    <PageStarfield className="people-page movies-hub">
      <nav className="people-dir-tabs" aria-label="People directory">
        <button
          type="button"
          className={`chat-tab${tab === "people" ? " is-on" : ""}`}
          onClick={() => setTab("people")}
        >
          PEOPLE
        </button>
        <button
          type="button"
          className={`chat-tab${tab === "team" ? " is-on" : ""}`}
          onClick={() => setTab("team")}
        >
          MY TEAM
        </button>
      </nav>
      {tab === "people" ? (
        <DirectoryView slug={slug} />
      ) : (
        <TeamDirectory
          slug={slug}
          workspace={workspace}
          tier={tier}
          meId={meId}
          onOpenUrl={onOpenUrl}
          onEditProfile={onEditProfile}
          onUpgrade={onUpgrade}
        />
      )}
    </PageStarfield>
  );
}

function TeamDirectory({
  slug,
  workspace,
  tier,
  meId,
  onOpenUrl,
  onEditProfile,
  onUpgrade,
}: {
  slug: string;
  workspace: DarkeWorkspace | null;
  tier: string;
  meId: string | null;
  onOpenUrl?: (url: string) => void;
  onEditProfile?: () => void;
  onUpgrade?: () => void;
}) {
  const [people, setPeople] = useState<(DarkeProfile & { role: string })[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(workspace));
  const [openUsername, setOpenUsername] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const { epoch: profileEpoch } = useProfileEdit();
  const admin = isWorkspaceAdmin(workspace?.myRole) || meId === workspace?.ownerId;
  const seats = organizationSeats(people, tier);
  const capLabel = Number.isFinite(seats.maxSeats) ? String(seats.maxSeats) : "∞";
  const q = searchInput.trim().toLowerCase();
  const visible = people.filter((person) => {
    if (!q) return true;
    return (
      person.username.toLowerCase().includes(q) ||
      (person.display_name ?? "").toLowerCase().includes(q)
    );
  });
  const usernames = visible.map((person) => person.username);

  useEffect(() => {
    if (!workspace) {
      setPeople([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const members = await loadOrganizationMembers(workspace.id);
        const profiles = await loadProfilesByIds(members.map((m) => m.userId));
        const roleById = new Map(members.map((m) => [m.userId, m.role]));
        if (cancelled) return;
        setPeople(
          profiles.map((p) => ({
            ...p,
            role: roleById.get(p.id) ?? "member",
          })),
        );
        setError(null);
      } catch (err) {
        if (!cancelled) setError(workspaceError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspace?.id, profileEpoch]);

  if (!workspace) {
    return <p className="muted">No team yet.</p>;
  }

  return (
    <>
      <div className="people-team-toolbar">
        <div className="people-team-toolbar-left">
          <p className="people-seat-count">
            {seats.seatsUsed} / {capLabel} Seats Used
          </p>
          <input
            className="movies-search people-team-search"
            type="search"
            value={searchInput}
            placeholder="Search team..."
            aria-label="Search team"
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        {admin ? (
          <button
            type="button"
            className="people-invite-btn"
            onClick={() => {
              if (atSeatCap(seats)) {
                onUpgrade?.();
                return;
              }
              setInviteOpen(true);
            }}
          >
            + Invite Team Member
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="muted">
          {q ? "No team members match that search." : "No team members yet."}
        </p>
      ) : (
        <div className="movies-grid">
          {visible.map((person) => (
            <article key={person.id} className="movies-card people-card">
              <button
                type="button"
                className="movies-card-main people-card-main"
                onClick={() => setOpenUsername(person.username)}
              >
                <UserAvatar
                  username={person.username}
                  url={person.avatar_url}
                  className="movies-poster people-card-photo"
                />
                <h3>{person.display_name?.trim() || person.username}</h3>
                <p className="people-card-role">
                  {rosterRole(person.id, person.role, workspace.ownerId)}
                </p>
              </button>
            </article>
          ))}
        </div>
      )}
      {openUsername ? (
        <ProfileViewModal
          username={openUsername}
          usernames={usernames}
          viewerSlug={slug}
          onBack={() => setOpenUsername(null)}
          backLabel="Back to My Team"
          onOpenUrl={onOpenUrl}
          onUsernameChange={setOpenUsername}
          onEditProfile={onEditProfile}
        />
      ) : null}
      {inviteOpen && admin ? (
        <InviteMembersModal
          workspaceId={workspace.id}
          seats={seats}
          onClose={() => setInviteOpen(false)}
          onUpgrade={onUpgrade ?? (() => setInviteOpen(false))}
        />
      ) : null}
    </>
  );
}
