import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { IconSearch } from "./icons";
import {
  canManageTeam,
  createOwnedTeam,
  isTeamOwner,
  joinTeamWithKey,
  listTeams,
  ownedTeam,
  TEAM_CHANGE_EVENT,
  teamPlanLabel,
  teamRoleLabel,
  teamSeatCap,
  teamSeatsUsed,
  type DarkeTeam,
  type TeamPlan,
} from "./teamContainer";
import { isProPlan } from "./workspaces";
import { useWorkspacesMaybe } from "./WorkspaceContext";
import { useTeamWorkspace } from "./teamWorkspace";

export function TeamsDashboard({ slug }: { slug: string }) {
  const { enterTeam } = useTeamWorkspace();
  const workspaces = useWorkspacesMaybe();
  const pro = isProPlan(workspaces?.tier ?? "free");
  const [teams, setTeams] = useState(() => listTeams(slug));
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  useEffect(() => {
    function sync() {
      setTeams(listTeams(slug));
    }
    sync();
    window.addEventListener(TEAM_CHANGE_EVENT, sync);
    return () => window.removeEventListener(TEAM_CHANGE_EVENT, sync);
  }, [slug]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      q
        ? teams.filter((team) => {
            const role = team.members.find(
              (row) => row.handle === slug.replace(/^@/, "").trim().toLowerCase(),
            )?.role;
            return (
              team.name.toLowerCase().includes(q) ||
              team.slug.toLowerCase().includes(q) ||
              (role || "").includes(q)
            );
          })
        : teams,
    [teams, q, slug],
  );
  const owned = visible.filter((team) => isTeamOwner(team, slug));
  const invited = visible.filter((team) => !isTeamOwner(team, slug));

  return (
    <section className="teams-hub">
      <header className="teams-hub-head">
        <div>
          <p className="teams-hub-kicker">Workspaces</p>
          <h1>Teams</h1>
          <p className="muted">
            Air-gapped team workspaces, separate from your personal P2P vault.
          </p>
        </div>
        <div className="teams-hub-actions">
          <button
            type="button"
            className="term-btn term-btn-emerald"
            onClick={() => setCreateOpen(true)}
          >
            + Create New Team
          </button>
          <button
            type="button"
            className="projects-choice-btn"
            onClick={() => setJoinOpen(true)}
          >
            Join Team
          </button>
        </div>
      </header>

      <div className="teams-hub-search">
        <IconSearch className="teams-hub-search-icon" />
        <input
          className="dm-nav-search-input"
          value={query}
          placeholder="Search teams"
          aria-label="Search teams"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {teams.length === 0 ? (
        <ConversionHub onStart={() => setCreateOpen(true)} />
      ) : (
        <div className="teams-hub-grid-wrap">
          <TeamCardGrid
            title="My Teams"
            empty="No owned workspaces."
            teams={owned}
            slug={slug}
            pro={pro}
            onOpen={enterTeam}
          />
          <TeamCardGrid
            title="Teams Invited To"
            empty="No member workspaces yet."
            teams={invited}
            slug={slug}
            pro={pro}
            onOpen={enterTeam}
          />
        </div>
      )}

      {createOpen ? (
        <CreateTeamModal
          slug={slug}
          pro={pro}
          onClose={() => setCreateOpen(false)}
          onCreated={(team) => {
            setCreateOpen(false);
            enterTeam(team);
          }}
        />
      ) : null}
      {joinOpen ? (
        <JoinTeamModal
          slug={slug}
          pro={pro}
          onClose={() => setJoinOpen(false)}
          onJoined={(team) => {
            setJoinOpen(false);
            enterTeam(team);
          }}
        />
      ) : null}
    </section>
  );
}

function ConversionHub({ onStart }: { onStart: () => void }) {
  return (
    <div className="teams-convert">
      <h2>Scale Your Operations with DARKE Teams</h2>
      <p className="muted">
        Isolate enterprise work from personal P2P messages. Seat-based access,
        encrypted audit logs, and folders your admins control.
      </p>
      <ul className="teams-convert-list">
        <li>Multi-user seat management</li>
        <li>Encrypted audit logs</li>
        <li>Air-gapped workspaces</li>
        <li>Team folder organization</li>
      </ul>
      <button type="button" className="term-btn term-btn-emerald" onClick={onStart}>
        Start 14-Day Free Team Trial
      </button>
    </div>
  );
}

function TeamCardGrid({
  title,
  empty,
  teams,
  slug,
  pro,
  onOpen,
}: {
  title: string;
  empty: string;
  teams: DarkeTeam[];
  slug: string;
  pro: boolean;
  onOpen: (team: DarkeTeam) => void;
}) {
  return (
    <section className="teams-hub-block">
      <h2>{title}</h2>
      {teams.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <div className="teams-hub-grid">
          {teams.map((team) => {
            const used = teamSeatsUsed(team);
            const cap = teamSeatCap(pro);
            const mine = team.members.find(
              (row) => row.handle === slug.replace(/^@/, "").trim().toLowerCase(),
            );
            const manage = canManageTeam(team, slug);
            return (
              <button
                key={team.id}
                type="button"
                className="teams-hub-card"
                onClick={() => onOpen(team)}
              >
                <span className="teams-hub-card-brand">
                  {team.avatarUrl ? (
                    <img src={team.avatarUrl} alt="" className="teams-hub-card-mark" />
                  ) : (
                    <span className="teams-hub-card-mark is-letter">
                      {(team.name.trim().charAt(0) || "T").toUpperCase()}
                    </span>
                  )}
                  <span>
                    <strong>{team.name}</strong>
                    <span className="muted">@{team.slug}</span>
                  </span>
                </span>
                <span className="teams-hub-card-meta">
                  {isTeamOwner(team, slug) ? (
                    <>
                      {used} / {Number.isFinite(cap) ? cap : "∞"} seats
                      <span>{teamPlanLabel(team)}</span>
                    </>
                  ) : (
                    <>
                      {teamRoleLabel(mine?.role || "member")}
                      <span>Member workspace</span>
                    </>
                  )}
                </span>
                {manage ? (
                  <span className="teams-hub-card-link">Open Team Admin</span>
                ) : (
                  <span className="teams-hub-card-link">Open workspace</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function CreateTeamModal({
  slug,
  pro,
  onClose,
  onCreated,
}: {
  slug: string;
  pro: boolean;
  onClose: () => void;
  onCreated: (team: DarkeTeam) => void;
}) {
  const existing = ownedTeam(slug);
  const [name, setName] = useState("");
  const [plan, setPlan] = useState<TeamPlan>(pro ? "premium" : "free");
  const [error, setError] = useState<string | null>(null);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="apps-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="apps-modal teams-setup-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-team-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 id="create-team-title">Create New Team</h3>
        {existing ? (
          <>
            <p className="muted">
              This account already owns {existing.name}. DARKE includes one owned
              team per account.
            </p>
            <div className="projects-choice-actions">
              <button type="button" className="projects-choice-btn" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="term-btn term-btn-emerald"
                onClick={() => onCreated(existing)}
              >
                Open {existing.name}
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="teams-setup-label">
              Team name
              <input
                className="dm-session-field"
                value={name}
                autoFocus
                placeholder="Victory Consulting"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <p className="teams-setup-label">Seat tier</p>
            <div className="teams-setup-tiers">
              <button
                type="button"
                className={`teams-setup-tier${plan === "free" ? " is-on" : ""}`}
                onClick={() => setPlan("free")}
              >
                <strong>Free</strong>
                <span>2 seats included</span>
              </button>
              <button
                type="button"
                className={`teams-setup-tier${plan === "premium" ? " is-on" : ""}`}
                onClick={() => setPlan("premium")}
              >
                <strong>Premium</strong>
                <span>$10 / seat</span>
              </button>
            </div>
            {error ? <p className="error">{error}</p> : null}
            <div className="projects-choice-actions">
              <button type="button" className="projects-choice-btn" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="term-btn term-btn-emerald"
                disabled={!name.trim()}
                onClick={() => {
                  const result = createOwnedTeam(slug, name, plan);
                  if (!result.team) {
                    setError("Could not create the team.");
                    return;
                  }
                  onCreated(result.team);
                }}
              >
                Create team
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function JoinTeamModal({
  slug,
  pro,
  onClose,
  onJoined,
}: {
  slug: string;
  pro: boolean;
  onClose: () => void;
  onJoined: (team: DarkeTeam) => void;
}) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="apps-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="apps-modal teams-setup-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="join-team-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 id="join-team-title">Join Team</h3>
        <p className="muted">Paste an encrypted invite key or team invite URL.</p>
        <textarea
          className="dm-session-field teams-join-field"
          value={key}
          autoFocus
          rows={3}
          placeholder="https://darke.app/teams/…?join="
          onChange={(e) => setKey(e.target.value)}
        />
        {error ? <p className="error">{error}</p> : null}
        <div className="projects-choice-actions">
          <button type="button" className="projects-choice-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="term-btn term-btn-emerald"
            disabled={!key.trim()}
            onClick={() => {
              const result = joinTeamWithKey(slug, key, pro);
              if (!result.ok || !result.team) {
                setError(result.error || "Could not join that team.");
                return;
              }
              onJoined(result.team);
            }}
          >
            Join
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
