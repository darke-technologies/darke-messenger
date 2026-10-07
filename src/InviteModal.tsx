import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { searchInvitePeople } from "./inviteSearch";
import { InviteLinkBar } from "./InviteLinkBar";
import type { DarkeProfile } from "./profile";
import { UserAvatar } from "./UserAvatar";
import {
  findTeam,
  FREE_TEAM_SEATS,
  teamSeatsUsed,
} from "./teamContainer";
import {
  STANDALONE_DIRECT_MAX,
  STANDALONE_GROUP_MAX,
  STANDALONE_GROUP_LIMIT_NOTE,
} from "./chatService";
import { useWorkspacesMaybe } from "./WorkspaceContext";
import { isProPlan } from "./workspaces";
import { openUpgradeModal } from "./useUpgradeModalStore";

type InviteTab = "link" | "people";

export function InviteModal({
  shareLink,
  copied,
  onCopy,
  onClose,
  canCopy = true,
  requested = false,
  onRequest,
  memberCount = 1,
  teamBound = false,
  isGroup = false,
  teamId = null,
  slug = "",
  takenHandles = [],
  onAdd,
}: {
  shareLink: string;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
  canCopy?: boolean;
  requested?: boolean;
  onRequest?: () => void;
  memberCount?: number;
  teamBound?: boolean;
  isGroup?: boolean;
  teamId?: string | null;
  slug?: string;
  takenHandles?: string[];
  onAdd?: (handle: string) => void;
}) {
  const [tab, setTab] = useState<InviteTab>("link");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<DarkeProfile[]>([]);
  const [added, setAdded] = useState<string | null>(null);
  const workspaces = useWorkspacesMaybe();
  const pro = isProPlan(workspaces?.tier ?? "free");
  const team = slug ? findTeam(slug, teamId) : null;
  const currentMembers =
    teamBound && team ? teamSeatsUsed(team) : Math.max(1, memberCount);
  const full = Boolean(teamBound && !pro && currentMembers >= FREE_TEAM_SEATS);
  const remaining =
    teamBound && !pro ? Math.max(0, FREE_TEAM_SEATS - currentMembers) : null;
  const nodeCap = teamBound
    ? Number.POSITIVE_INFINITY
    : isGroup
      ? STANDALONE_GROUP_MAX
      : STANDALONE_DIRECT_MAX;
  const atNodeCap =
    !teamBound && Number.isFinite(nodeCap) && memberCount >= nodeCap;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const q = query.trim().replace(/^@/, "");
    if (q.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void searchInvitePeople(query)
        .then((hit) => {
          if (!cancelled) setHits(hit.suggestions);
        })
        .catch(() => {
          if (!cancelled) setHits([]);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  if (typeof document === "undefined") return null;

  const taken = new Set(
    [slug, ...takenHandles].map((h) => h.replace(/^@/, "").trim().toLowerCase()),
  );

  const capacityBanner =
    remaining === null ? (
      atNodeCap ? (
        <p className="invite-capacity is-full">
          {isGroup
            ? STANDALONE_GROUP_LIMIT_NOTE
            : `This chat has reached its ${nodeCap.toLocaleString()} participant limit.`}
        </p>
      ) : null
    ) : full ? (
      <p className="invite-capacity is-full">
        TEAM seats reached ({currentMembers}/{FREE_TEAM_SEATS}).{" "}
        <button
          type="button"
          className="invite-capacity-upgrade"
          onClick={() => {
            onClose();
            openUpgradeModal("team");
          }}
        >
          Upgrade Plan →
        </button>
      </p>
    ) : (
      <p className="invite-capacity">
        TEAM seats available: {remaining} of {FREE_TEAM_SEATS}
      </p>
    );

  return createPortal(
    <div
      className="apps-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="apps-modal invite-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Invite people"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {canCopy ? (
          <nav className="invite-modal-tabs" aria-label="Invite options">
            <button
              type="button"
              className={`invite-modal-tab${tab === "link" ? " is-on" : ""}`}
              onClick={() => setTab("link")}
            >
              INVITE LINK
            </button>
            <button
              type="button"
              className={`invite-modal-tab${tab === "people" ? " is-on" : ""}`}
              onClick={() => setTab("people")}
            >
              ADD PEOPLE
            </button>
          </nav>
        ) : null}

        {tab === "link" || !canCopy ? (
          <>
            {canCopy ? (
              <>
                {capacityBanner}
                <InviteLinkBar
                  shareLink={shareLink}
                  copied={copied}
                  onCopy={onCopy}
                  disabled={full || atNodeCap}
                  inputId="invite-join-link"
                  showNote={!full && !atNodeCap}
                />
                {full ? (
                  <p className="invite-capacity-hint">
                    Upgrade your plan to invite additional members to this TEAM.
                  </p>
                ) : atNodeCap && !isGroup ? (
                  <p className="invite-capacity-hint">
                    Remove someone before inviting another participant.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="muted apps-submit-note">
                Only the chat creator or an admin can share this join link.
              </p>
            )}
            <div className="projects-choice-actions">
              {canCopy ? null : (
                <button
                  type="button"
                  className="term-btn term-btn-emerald"
                  onClick={onRequest}
                  disabled={requested}
                >
                  {requested ? "Request sent" : "Request Invite"}
                </button>
              )}
              <button
                type="button"
                className="projects-choice-btn"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            {capacityBanner}
            {full ? (
              <p className="invite-capacity-hint">
                Upgrade to add a third TEAM seat. Existing TEAM members can still
                join this node.
              </p>
            ) : null}
            <label className="members-search invite-people-search">
              <span className="sr-only">Find a DARKE user by username</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
                placeholder="Search @username"
                aria-label="Search DARKE username"
                autoFocus
              />
            </label>
            {hits.length > 0 ? (
              <ul className="members-search-hits">
                {hits.map((person) => {
                  const handle = person.username;
                  const already =
                    taken.has(handle.toLowerCase()) || added === handle;
                  return (
                    <li key={person.id} className="members-search-hit">
                      <UserAvatar
                        username={handle}
                        url={person.avatar_url}
                        className="members-search-avatar"
                      />
                      <span>
                        <strong>
                          {person.display_name?.trim() || handle}
                        </strong>
                        <span>@{handle}</span>
                      </span>
                      <button
                        type="button"
                        className="term-btn term-btn-emerald"
                        disabled={already || atNodeCap}
                        onClick={() => {
                          if (atNodeCap) return;
                          const id = handle.replace(/^@/, "").trim().toLowerCase();
                          const onTeam = Boolean(
                            team?.members.some((row) => row.handle === id),
                          );
                          if (teamBound && !pro && !onTeam && full) {
                            onClose();
                            openUpgradeModal("team");
                            return;
                          }
                          onAdd?.(handle);
                          setAdded(handle);
                          setQuery("");
                          setHits([]);
                        }}
                      >
                        {already ? "ADDED" : "Add"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : query.trim().replace(/^@/, "").length >= 2 ? (
              <p className="muted apps-submit-note">No DARKE users found.</p>
            ) : (
              <p className="muted apps-submit-note">
                Type a username to find someone on DARKE.
              </p>
            )}
            <div className="projects-choice-actions">
              <button
                type="button"
                className="projects-choice-btn"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
