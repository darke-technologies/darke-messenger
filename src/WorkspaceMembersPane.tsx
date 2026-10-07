import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { loadProfilesByIds, type DarkeProfile } from "./profile";
import {
  inviteSearchReady,
  looksLikeEmail,
  searchInvitePeople,
} from "./inviteSearch";
import { supabase } from "./supabase";
import { UserAvatar } from "./UserAvatar";
import { ProfileViewModal } from "./ProfileViewModal";
import { PageStarfield } from "./HomeStars";
import { WorkspaceHeaderBar } from "./WorkspaceHub";
import {
  createWorkspaceAccessKey,
  loadWorkspaceMembers,
  teamRoleLabel,
  workspaceError,
  workspaceInviteUrl,
  type DarkeWorkspace,
} from "./workspaces";
import {
  atSeatCap,
  inviteOrganizationMember,
  isPaidSeatRole,
  organizationSeats,
  seatLimitError,
  type OrganizationSeats,
} from "./teamService";
import { generateAccessKey } from "./accessKeys";
import { useWorkspaces } from "./WorkspaceContext";

export function WorkspaceMembersPane({
  workspace,
  slug,
  onOpenUrl,
  onEditProfile,
  onUpgrade,
}: {
  workspace: DarkeWorkspace;
  slug: string;
  onOpenUrl?: (url: string) => void;
  onEditProfile?: () => void;
  onUpgrade: () => void;
}) {
  const { load } = useMemberLoader(workspace.id);
  const { tier } = useWorkspaces();
  const [people, setPeople] = useState<(DarkeProfile & { role: string })[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openUsername, setOpenUsername] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);

  const paid = people.filter((person) => isPaidSeatRole(person.role));
  const seats = organizationSeats(paid, tier);
  const isOwner = meId === workspace.ownerId;
  const usernames = useMemo(() => paid.map((p) => p.username), [paid]);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setMeId(data.session?.user.id ?? null);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const rows = await load();
        if (!cancelled) {
          setPeople(rows);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(workspaceError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  return (
    <PageStarfield className="people-page movies-hub">
      <WorkspaceHeaderBar workspace={workspace} />
      <div className="ws-members-toolbar">
        <h2>Team Members</h2>
        {isOwner ? (
          <button
            type="button"
            className="projects-choice-btn is-primary"
            onClick={() => {
              if (atSeatCap(seats)) {
                onUpgrade();
                return;
              }
              setInviteOpen(true);
            }}
          >
            + Invite Member
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
      ) : paid.length === 0 ? (
        <p className="muted">No members yet.</p>
      ) : (
        <div className="movies-grid">
          {paid.map((person) => (
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
                <h3>{person.username}</h3>
                <p className="people-card-role">{teamRoleLabel(person.role)}</p>
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
          backLabel="Back to Team Members"
          onOpenUrl={onOpenUrl}
          onUsernameChange={setOpenUsername}
          onEditProfile={onEditProfile}
        />
      ) : null}
      {inviteOpen ? (
        <InviteMembersModal
          workspaceId={workspace.id}
          seats={seats}
          onClose={() => setInviteOpen(false)}
          onUpgrade={onUpgrade}
        />
      ) : null}
    </PageStarfield>
  );
}

function useMemberLoader(workspaceId: string) {
  const load = useMemo(() => {
    return async () => {
      const members = await loadWorkspaceMembers(workspaceId);
      const profiles = await loadProfilesByIds(members.map((m) => m.userId));
      const roleById = new Map(members.map((m) => [m.userId, m.role]));
      return profiles.map((p) => ({
        ...p,
        role: roleById.get(p.id) ?? "member",
      }));
    };
  }, [workspaceId]);
  return { load };
}

export function InviteMembersModal({
  workspaceId,
  seats,
  onClose,
  onUpgrade,
}: {
  workspaceId: string;
  seats: OrganizationSeats;
  onClose: () => void;
  onUpgrade: () => void;
}) {
  const [query, setQuery] = useState("");
  const [profile, setProfile] = useState<DarkeProfile | null>(null);
  const [mutuals, setMutuals] = useState<DarkeProfile[]>([]);
  const [link, setLink] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const key = generateAccessKey("workspace");
        await createWorkspaceAccessKey(workspaceId, {
          accessKey: key,
          maxUses: null,
          ttlSeconds: null,
        });
        if (cancelled) return;
        const url = workspaceInviteUrl(key);
        setLink(url);
        try {
          await navigator.clipboard.writeText(url);
          if (!cancelled) setCopied(true);
        } catch {
          if (!cancelled) setCopied(false);
        }
      } catch {
        if (!cancelled) setLink(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (!inviteSearchReady(query)) {
      setProfile(null);
      setMutuals([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      void searchInvitePeople(query)
        .then((hit) => {
          if (cancelled) return;
          setProfile(hit.profile);
          setMutuals(hit.suggestions.length ? hit.suggestions : hit.mutuals);
        })
        .catch(() => {
          if (!cancelled) {
            setProfile(null);
            setMutuals([]);
          }
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query]);

  async function createInvite() {
    if (busy) return;
    if (atSeatCap(seats)) {
      onUpgrade();
      return;
    }
    const emailGuess = looksLikeEmail(query) ? query.trim() : undefined;
    if (!profile && !emailGuess) {
      setError("Select a person or enter an email.");
      return;
    }
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const row = await inviteOrganizationMember(
        workspaceId,
        seats,
        emailGuess,
        profile?.id,
      );
      if (profile && !row.outOfNetwork) {
        setNote(`Added @${profile.username} to the workspace.`);
      } else if (profile) {
        setNote(`Invite sent to @${profile.username}.`);
      } else {
        const url = workspaceInviteUrl(row.token);
        setLink(url);
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }
      window.setTimeout(() => onClose(), 900);
    } catch (err) {
      if (seatLimitError(err)) onUpgrade();
      else setError(workspaceError(err));
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="apps-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="apps-modal projects-choice-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ws-invite-title"
      >
        <button type="button" className="apps-modal-x" onClick={onClose}>
          ×
        </button>
        <h3 id="ws-invite-title">+ Invite Member</h3>
        <p className="muted apps-submit-note">
          Share the encrypted invite link, or search for a person to add.
        </p>
        {link ? (
          <p className="ws-invite-link">
            {copied ? "Copied invite link: " : "Invite link: "}
            {link}
          </p>
        ) : null}
        <label className="ws-create-label" htmlFor="ws-invite-email">
          Email or handle
        </label>
        <input
          id="ws-invite-email"
          className="ws-create-input"
          value={query}
          placeholder="@username or email"
          onChange={(e) => setQuery(e.target.value)}
        />
        {query.trim() && !inviteSearchReady(query) && !looksLikeEmail(query) ? (
          <p className="muted apps-submit-note">
            Type an exact @username or a valid email. Mutuals match after 3
            characters.
          </p>
        ) : null}
        {mutuals.length > 0 ? (
          <div className="ws-invite-mutuals">
            <p className="muted apps-submit-note">Mutual connections</p>
            {mutuals.map((row) => (
              <button
                key={row.id}
                type="button"
                className="ws-scope-btn"
                onClick={() => setQuery(`@${row.username}`)}
              >
                <strong>@{row.username}</strong>
                <span>{row.display_name || "Mutual"}</span>
              </button>
            ))}
          </div>
        ) : null}
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        {note ? <p className="ws-invite-link">{note}</p> : null}
        <div className="projects-choice-actions">
          <button
            type="button"
            className="projects-choice-btn is-primary"
            disabled={busy || (!profile && !looksLikeEmail(query))}
            onClick={() => void createInvite()}
          >
            {busy ? "Inviting…" : "Create / Invite"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
