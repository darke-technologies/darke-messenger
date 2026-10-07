import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { encodeImageFile } from "./encodeImage";
import { searchInvitePeople } from "./inviteSearch";
import { InviteLinkBar } from "./InviteLinkBar";
import { UserAvatar } from "./UserAvatar";
import { useDm } from "./DmContext";
import { showCopyLinkToast, type DmThread } from "./dmSessions";
import {
  canManageTeam,
  changeTeamSlug,
  findTeam,
  inviteIsLive,
  isTeamOwner,
  isValidTeamSlug,
  logTeamEvent,
  patchTeam,
  rotateTeamInvite,
  setTeamMemberRole,
  slugifyTeamName,
  TEAM_CHANGE_EVENT,
  TEAM_PUBLIC_HOST,
  teamInviteUrl,
  teamCenterPath,
  teamRoleLabel,
  teamSeatCap,
  teamSeatsUsed,
  tryAddTeamMember,
  type DarkeTeam,
  type DarkeTeamActivity,
  type TeamMemberRole,
  FREE_TEAM_SEATS,
} from "./teamContainer";
import { isProPlan } from "./workspaces";
import { useWorkspacesMaybe } from "./WorkspaceContext";
import { openPricingPage, openUpgradeModal } from "./useUpgradeModalStore";
import type { DarkeProfile } from "./profile";
import {
  displayNameFor,
  handleBadge,
  usePersonDirectory,
} from "./personDirectory";

type CenterTab =
  | "overview"
  | "members"
  | "invites"
  | "seats"
  | "security"
  | "audit";

const TABS: { id: CenterTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "members", label: "Members" },
  { id: "invites", label: "Invites" },
  { id: "seats", label: "Seats & billing" },
  { id: "security", label: "Security" },
  { id: "audit", label: "Audit log" },
];

export function TeamCommandCenter({
  slug,
  teamId,
  onBack: _onBack,
}: {
  slug: string;
  teamId: string;
  onBack: () => void;
}) {
  const { threads, offboardTeamMember } = useDm();
  const workspaces = useWorkspacesMaybe();
  const pro = isProPlan(workspaces?.tier ?? "free");
  const [team, setTeam] = useState(() => findTeam(slug, teamId));
  const [tab, setTab] = useState<CenterTab>("overview");
  const [name, setName] = useState(team?.name ?? "");
  const [slugDraft, setSlugDraft] = useState(team?.slug ?? "");
  const [slugModal, setSlugModal] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [inviteHandle, setInviteHandle] = useState("");
  const [hits, setHits] = useState<DarkeProfile[]>([]);
  const [copied, setCopied] = useState(false);
  const [expireHours, setExpireHours] = useState("0");
  const [maxUses, setMaxUses] = useState("0");
  const [dragOver, setDragOver] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [memberMenu, setMemberMenu] = useState<{
    handle: string;
    x: number;
    y: number;
  } | null>(null);
  const [exportMenu, setExportMenu] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const inviteInputRef = useRef<HTMLInputElement>(null);
  const people = usePersonDirectory(
    (team?.members ?? []).map((member) => member.handle),
  );

  useEffect(() => {
    function sync() {
      const next = findTeam(slug, teamId);
      setTeam(next);
      if (next) {
        setName(next.name);
        setSlugDraft(next.slug);
      }
    }
    sync();
    window.addEventListener(TEAM_CHANGE_EVENT, sync);
    return () => window.removeEventListener(TEAM_CHANGE_EVENT, sync);
  }, [slug, teamId]);

  useEffect(() => {
    const q = inviteHandle.trim().replace(/^@/, "");
    if (q.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void searchInvitePeople(inviteHandle)
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
  }, [inviteHandle]);

  useEffect(() => {
    function close() {
      setMemberMenu(null);
      setExportMenu(false);
    }
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  if (!team) {
    return (
      <section className="tcc">
        <header className="tcc-hero">
          <h1>Team not found</h1>
        </header>
        <p className="muted apps-submit-note">
          This team is not on this account. Open TEAMS in the sidebar to pick one you own or joined.
        </p>
      </section>
    );
  }

  const manage = canManageTeam(team, slug);
  const owner = isTeamOwner(team, slug);
  const used = teamSeatsUsed(team);
  const cap = teamSeatCap(pro);
  const remaining = Number.isFinite(cap) ? Math.max(0, cap - used) : 0;
  const live = team.invite ? inviteIsLive(team) : false;
  const joinUrl = team.invite?.enabled ? teamInviteUrl(team) : "";
  const audit = team.activity ?? [];

  function refresh() {
    setTeam(findTeam(slug, teamId));
  }

  async function onAvatarFile(file: File | undefined) {
    if (!file || !manage) return;
    try {
      const url = await encodeImageFile(file, 320, 180_000);
      patchTeam(slug, team.id, { avatarUrl: url });
      setNote("Avatar saved.");
      refresh();
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not read that image.");
    }
  }

  function saveName() {
    const next = name.trim();
    if (!next || !manage) return;
    patchTeam(slug, team.id, { name: next });
    setNote("Display name saved.");
    refresh();
  }

  function requestSlugSave() {
    if (!manage) return;
    const next = slugifyTeamName(slugDraft);
    setSlugDraft(next);
    if (!isValidTeamSlug(next)) {
      setNote("Use 2–48 lowercase letters, numbers, and hyphens.");
      return;
    }
    if (next === team.slug) {
      setNote("Team URL is unchanged.");
      return;
    }
    setSlugModal(next);
  }

  function confirmSlugSave() {
    const next = slugModal;
    if (!next || !manage) return;
    const result = changeTeamSlug(slug, team.id, next);
    setSlugModal(null);
    if (!result.ok || !result.team) {
      setNote(result.error || "Could not update team URL.");
      return;
    }
    setSlugDraft(result.team.slug);
    setNote("Team URL updated. Old invite handles redirect here.");
    window.history.pushState(null, "", teamCenterPath(result.team.slug));
    refresh();
  }

  function addPerson(handle: string) {
    const result = tryAddTeamMember(slug, handle, pro, team.id);
    if (result.blocked) {
      openUpgradeModal("team");
      return;
    }
    setInviteHandle("");
    setHits([]);
    setNote(`Invited @${handle.replace(/^@/, "").trim().toLowerCase()}.`);
    refresh();
  }

  async function copyInvite() {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      showCopyLinkToast("team");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  function applyInviteRules() {
    if (!manage) return;
    const hours = Number(expireHours);
    const uses = Number(maxUses);
    patchTeam(slug, team.id, {
      invite: {
        token: team.invite?.token || "",
        enabled: team.invite?.enabled !== false,
        expiresAt:
          Number.isFinite(hours) && hours > 0
            ? Date.now() + hours * 60 * 60 * 1000
            : null,
        maxUses: Number.isFinite(uses) && uses > 0 ? uses : null,
        useCount: team.invite?.useCount ?? 0,
      },
    });
    setNote("Invite rules saved.");
    refresh();
  }

  function memberStatus(handle: string): "online" | "offline" {
    const hit = threads.some(
      (row) =>
        (row.teamId === team.id || team.chatIds.includes(row.id)) &&
        row.connectionState === "CONNECTED" &&
        memberInThread(row, handle, slug),
    );
    return hit ? "online" : "offline";
  }

  function goInvite() {
    setTab("invites");
    window.setTimeout(() => inviteInputRef.current?.focus(), 40);
  }

  function openUpgrade() {
    logTeamEvent(slug, team.id, "Opened Premium seat upgrade.");
    openPricingPage();
  }

  const needle = memberQuery.trim().toLowerCase().replace(/^@/, "");
  const shownMembers = team.members.filter((member) => {
    if (!needle) return true;
    const person = people.person(member.handle);
    const display = (person?.displayName || displayNameFor(member.handle)).toLowerCase();
    const user = member.handle.replace(/^@/, "").trim().toLowerCase();
    return display.includes(needle) || user.includes(needle);
  });

  const membersTable = (
    <MembersTable
      team={team}
      shownMembers={shownMembers}
      people={people}
      slug={slug}
      manage={manage}
      memberStatus={memberStatus}
      memberMenu={memberMenu}
      onOpenMenu={(handle, x, y) => setMemberMenu({ handle, x, y })}
    />
  );

  const emptySeat =
    !pro && remaining > 0 ? (
      <div className="tcc-empty-seat">
        <span>
          {remaining} free seat{remaining === 1 ? "" : "s"} available. Invite a
          teammate to fill {remaining === 1 ? "it" : "them"}.
        </span>
        {manage ? (
          <button type="button" className="tcc-ghost-btn" onClick={goInvite}>
            Invite
          </button>
        ) : null}
      </div>
    ) : null;

  const membersWidget = (
    <section className="tcc-card">
      <div className="tcc-card-head">
        <h2>Members · {team.members.length}</h2>
        <div className="tcc-head-actions">
          <button
            type="button"
            className={`tcc-ghost-btn${filterOpen ? " is-on" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setFilterOpen((open) => !open);
            }}
          >
            Filter
          </button>
          {manage ? (
            <button type="button" className="tcc-solid-btn" onClick={goInvite}>
              Invite member
            </button>
          ) : null}
        </div>
      </div>
      {filterOpen ? (
        <input
          id="tcc-member-search"
          className="dm-admin-link"
          value={memberQuery}
          placeholder="Display name or @username"
          onChange={(e) => setMemberQuery(e.target.value)}
        />
      ) : null}
      {membersTable}
      {emptySeat}
      {shownMembers.length === 0 ? (
        <p className="muted apps-submit-note">No members match that search.</p>
      ) : null}
    </section>
  );

  const auditTable = (rows: DarkeTeamActivity[]) => (
    <div className="tcc-table-wrap">
      <table className="tcc-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Event</th>
            <th>Actor</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3} className="tcc-empty-cell">
                No audit events yet.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={`${row.at}-${row.text}`}>
                <td>{formatAuditTime(row.at)}</td>
                <td>{row.text.replace(/\.$/, "")}</td>
                <td>{row.actor ? handleBadge(row.actor) : "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  const auditWidget = (
    <section className="tcc-card">
      <div className="tcc-card-head">
        <h2>Audit log</h2>
        <div className="tcc-head-actions">
          <button
            type="button"
            className="tcc-ghost-btn"
            onClick={(e) => {
              e.stopPropagation();
              setExportMenu((open) => !open);
            }}
          >
            Export
          </button>
          {exportMenu ? (
            <div className="tcc-export-menu" onClick={(e) => e.stopPropagation()}>
              <button type="button" onClick={() => exportAudit(team, "csv")}>
                CSV
              </button>
              <button type="button" onClick={() => exportAudit(team, "json")}>
                JSON
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {auditTable(audit.slice(0, 8))}
    </section>
  );

  const seatsWidget = (
    <section className="tcc-card tcc-seats-card">
      <div className="tcc-card-head">
        <h2>Seats</h2>
        <span className="tcc-plan-tag">{pro ? "Premium" : "Free plan"}</span>
      </div>
      <p className="tcc-seat-count">
        <strong>{used}</strong>
        {Number.isFinite(cap)
          ? ` of ${cap} free seats used`
          : " Premium seats used"}
      </p>
      <div
        className="tcc-seat-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={Number.isFinite(cap) ? cap : used || 1}
        aria-valuenow={used}
      >
        <span
          style={{
            width: `${
              Number.isFinite(cap) && cap > 0
                ? Math.min(100, (used / cap) * 100)
                : 28
            }%`,
          }}
        />
      </div>
      <p className="muted tcc-hint">
        Free plan includes up to 2 team seats. Upgrade to Premium for 3 or more
        seats.
      </p>
      <button type="button" className="tcc-solid-btn" onClick={openUpgrade}>
        Upgrade / Add seats
      </button>
    </section>
  );

  const inviteLinkWidget = (
    <section className="tcc-card">
      <div className="tcc-card-head">
        <h2>Invite link</h2>
        {manage ? (
          <label className="tcc-active-switch">
            <span>{team.invite?.enabled !== false ? "Active" : "Inactive"}</span>
            <span className="tcc-switch">
              <input
                type="checkbox"
                role="switch"
                checked={Boolean(team.invite?.enabled)}
                onChange={(e) => {
                  patchTeam(slug, team.id, {
                    invite: {
                      token: team.invite?.token || "",
                      enabled: e.target.checked,
                      expiresAt: team.invite?.expiresAt ?? null,
                      maxUses: team.invite?.maxUses ?? null,
                      useCount: team.invite?.useCount ?? 0,
                    },
                  });
                  refresh();
                }}
              />
              <span aria-hidden />
            </span>
          </label>
        ) : null}
      </div>
      {manage ? (
        <>
          <InviteLinkBar
            shareLink={joinUrl}
            copied={copied}
            onCopy={() => void copyInvite()}
            onRotate={() => {
              rotateTeamInvite(slug, team.id);
              setNote("Invite link rotated.");
              refresh();
            }}
            disabled={!live}
            inputId="tcc-invite-link"
            showNote={false}
            copyLabel="Copy"
          />
          <div className="tcc-invite-rules">
            <label>
              Expires
              <select
                value={expireHours}
                onChange={(e) => setExpireHours(e.target.value)}
              >
                <option value="0">No expiry</option>
                <option value="1">1 Hour</option>
                <option value="24">24 Hours</option>
                <option value="168">7 Days</option>
              </select>
            </label>
            <label>
              Max uses
              <select value={maxUses} onChange={(e) => setMaxUses(e.target.value)}>
                <option value="0">Unlimited</option>
                <option value="1">1 Use</option>
                <option value="5">5 Uses</option>
                <option value="10">10 Uses</option>
              </select>
            </label>
            <button type="button" className="tcc-ghost-btn" onClick={applyInviteRules}>
              Save rules
            </button>
          </div>
        </>
      ) : (
        <p className="muted apps-submit-note">
          Only the owner or an admin can issue invites for this team.
        </p>
      )}
    </section>
  );

  const usernameWidget = (
    <section className="tcc-card">
      <h2>Invite by username</h2>
      {manage ? (
        <>
          <div className="tcc-username-row">
            <input
              ref={inviteInputRef}
              id="tcc-manual"
              className="dm-admin-link"
              value={inviteHandle}
              placeholder="@username"
              onChange={(e) => setInviteHandle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && inviteHandle.trim()) {
                  e.preventDefault();
                  addPerson(inviteHandle);
                }
              }}
            />
            <button
              type="button"
              className="tcc-solid-btn"
              disabled={!inviteHandle.trim()}
              onClick={() => addPerson(inviteHandle)}
            >
              Send
            </button>
          </div>
          {hits.length > 0 ? (
            <ul className="members-search-hits">
              {hits.map((person) => (
                <li key={person.id} className="members-search-hit">
                  <UserAvatar
                    username={person.username}
                    url={person.avatar_url}
                    className="members-search-avatar"
                  />
                  <span>
                    <strong>{person.display_name?.trim() || person.username}</strong>
                    <span>@{person.username}</span>
                  </span>
                  <button
                    type="button"
                    className="term-btn term-btn-emerald"
                    onClick={() => addPerson(person.username)}
                  >
                    Add
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {!pro && used >= FREE_TEAM_SEATS ? (
            <p className="invite-capacity is-full">
              Free TEAM seats are full.{" "}
              <button
                type="button"
                className="invite-capacity-upgrade"
                onClick={() => openUpgradeModal("team")}
              >
                Upgrade Plan →
              </button>
            </p>
          ) : null}
        </>
      ) : (
        <p className="muted apps-submit-note">
          Only the owner or an admin can add people by username.
        </p>
      )}
    </section>
  );

  const securityWidget = (
    <section className="tcc-card">
      <h2>Security</h2>
      <div className="tcc-brand">
        <button
          type="button"
          className={`tcc-avatar${dragOver ? " is-drop" : ""}`}
          disabled={!manage}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            if (!manage) return;
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void onAvatarFile(e.dataTransfer.files[0]);
          }}
        >
          {team.avatarUrl ? (
            <img src={team.avatarUrl} alt="" />
          ) : (
            <span>{(team.name.trim().charAt(0) || "T").toUpperCase()}</span>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => void onAvatarFile(e.target.files?.[0])}
        />
        <div className="tcc-brand-fields">
          <label className="chat-settings-label" htmlFor="tcc-name">
            Team Display Name
          </label>
          <div className="chat-settings-row">
            <input
              id="tcc-name"
              className="dm-admin-link"
              value={name}
              disabled={!manage}
              onChange={(e) => setName(e.target.value)}
            />
            <button
              type="button"
              className="tcc-solid-btn"
              disabled={!manage || !name.trim()}
              onClick={saveName}
            >
              Save
            </button>
          </div>
          <label className="chat-settings-label" htmlFor="tcc-slug">
            Team URL Slug
          </label>
          <div className="chat-settings-row tcc-slug-row">
            <span className="tcc-slug-prefix">{TEAM_PUBLIC_HOST}/teams/</span>
            <input
              id="tcc-slug"
              className="dm-admin-link"
              value={slugDraft}
              disabled={!manage}
              spellCheck={false}
              onChange={(e) => setSlugDraft(e.target.value.toLowerCase())}
            />
            <button
              type="button"
              className="tcc-solid-btn"
              disabled={
                !manage || !slugDraft.trim() || slugifyTeamName(slugDraft) === team.slug
              }
              onClick={requestSlugSave}
            >
              Update URL
            </button>
          </div>
          <p className="muted tcc-hint">
            Display name updates instantly. Changing the URL slug keeps old handles
            as redirects.
          </p>
        </div>
      </div>
    </section>
  );

  const overview = (
    <div className="tcc-dash">
      <div className="tcc-dash-main">
        {membersWidget}
        {auditWidget}
      </div>
      <div className="tcc-dash-side">
        {seatsWidget}
        {inviteLinkWidget}
        {usernameWidget}
      </div>
    </div>
  );

  const menuMember = memberMenu
    ? team.members.find((row) => row.handle === memberMenu.handle)
    : null;
  const selfHandle = slug.replace(/^@/, "").trim().toLowerCase();

  return (
    <section className="tcc">
      <header className="tcc-hero">
        <div className="tcc-hero-left">
          <p className="tcc-admin-pill">Team admin</p>
          <div className="tcc-hero-brand">
            {team.avatarUrl ? (
              <img className="tcc-hero-avatar" src={team.avatarUrl} alt="" />
            ) : (
              <span className="tcc-hero-avatar tcc-hero-letter">
                {(team.name.trim().charAt(0) || "T").toUpperCase()}
              </span>
            )}
            <h1>{team.name}</h1>
          </div>
        </div>
        <div className="tcc-hero-right">
          <button type="button" className="tcc-upgrade-btn" onClick={openUpgrade}>
            Upgrade
          </button>
        </div>
      </header>
      {note ? (
        <p className="tcc-note" role="status">
          {note}
        </p>
      ) : null}
      <nav className="tcc-tabs" aria-label="Team sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`tcc-tab${tab === item.id ? " is-on" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {tab === "overview" ? overview : null}
      {tab === "members" ? membersWidget : null}
      {tab === "invites" ? (
        <div className="tcc-dash tcc-dash-invite">
          <div className="tcc-dash-side tcc-dash-invite-col">
            {inviteLinkWidget}
            {usernameWidget}
          </div>
        </div>
      ) : null}
      {tab === "seats" ? seatsWidget : null}
      {tab === "security" ? securityWidget : null}
      {tab === "audit" ? (
        <section className="tcc-card">
          <div className="tcc-card-head">
            <h2>Audit log</h2>
            <div className="tcc-head-actions">
              <button
                type="button"
                className="tcc-ghost-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setExportMenu((open) => !open);
                }}
              >
                Export
              </button>
              {exportMenu ? (
                <div className="tcc-export-menu" onClick={(e) => e.stopPropagation()}>
                  <button type="button" onClick={() => exportAudit(team, "csv")}>
                    CSV
                  </button>
                  <button type="button" onClick={() => exportAudit(team, "json")}>
                    JSON
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          {auditTable(audit)}
        </section>
      ) : null}
      {memberMenu && menuMember && typeof document !== "undefined"
        ? createPortal(
            <div
              className="folder-menu chat-nav-menu"
              style={{ left: memberMenu.x, top: memberMenu.y }}
              onClick={(e) => e.stopPropagation()}
            >
              {manage && menuMember.role !== "owner" ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setTeamMemberRole(
                        slug,
                        team.id,
                        menuMember.handle,
                        menuMember.role === "admin" ? "member" : "admin",
                      );
                      setMemberMenu(null);
                      refresh();
                    }}
                  >
                    {menuMember.role === "admin" ? "Make member" : "Make admin"}
                  </button>
                  {menuMember.handle !== selfHandle ? (
                    <button
                      type="button"
                      onClick={() => {
                        offboardTeamMember(team.id, menuMember.handle);
                        setNote(`Revoked @${menuMember.handle}.`);
                        setMemberMenu(null);
                        refresh();
                      }}
                    >
                      Revoke access
                    </button>
                  ) : null}
                </>
              ) : (
                <button type="button" disabled>
                  {owner ? "Owner controls this seat." : "No actions."}
                </button>
              )}
            </div>,
            document.body,
          )
        : null}
      {slugModal && typeof document !== "undefined"
        ? createPortal(
            <div
              className="apps-modal-backdrop"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setSlugModal(null);
              }}
            >
              <div
                className="apps-modal projects-choice-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="tcc-slug-title"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="apps-modal-x"
                  aria-label="Close"
                  onClick={() => setSlugModal(null)}
                >
                  ×
                </button>
                <h3 id="tcc-slug-title">Update team URL?</h3>
                <p className="muted apps-submit-note">
                  Updating your team URL will set your new handle to{" "}
                  {TEAM_PUBLIC_HOST}/teams/{slugModal}. Existing invite links
                  with the old handle will automatically redirect to the new team
                  URL.
                </p>
                <div className="projects-choice-actions">
                  <button
                    type="button"
                    className="term-btn"
                    onClick={() => setSlugModal(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="term-btn term-btn-emerald"
                    onClick={confirmSlugSave}
                  >
                    Update URL
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}

function MembersTable({
  team,
  shownMembers,
  people,
  slug,
  manage,
  memberStatus,
  memberMenu,
  onOpenMenu,
}: {
  team: DarkeTeam;
  shownMembers: DarkeTeam["members"];
  people: ReturnType<typeof usePersonDirectory>;
  slug: string;
  manage: boolean;
  memberStatus: (handle: string) => "online" | "offline";
  memberMenu: { handle: string } | null;
  onOpenMenu: (handle: string, x: number, y: number) => void;
}) {
  const rows = useMemo(
    () =>
      shownMembers.map((member) => {
        const person = people.person(member.handle);
        const display =
          person?.displayName || displayNameFor(member.handle) || member.handle;
        return { member, person, display };
      }),
    [shownMembers, people],
  );

  return (
    <div className="tcc-table-wrap">
      <table className="tcc-table tcc-members-table">
        <thead>
          <tr>
            <th>Member</th>
            <th>Role</th>
            <th>Status</th>
            <th>Joined</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ member, person, display }) => {
            const status = memberStatus(member.handle);
            return (
              <tr key={member.handle}>
                <td>
                  <div className="tcc-member-cell">
                    <UserAvatar
                      username={member.handle}
                      url={person?.avatarUrl ?? null}
                      className="tcc-member-avatar"
                      initialsLength={1}
                    />
                    <div className="tcc-member-copy">
                      <strong>{display}</strong>
                      <span className="tcc-member-handle">
                        {handleBadge(member.handle)}
                      </span>
                    </div>
                  </div>
                </td>
                <td>
                  <span className={`tcc-role-pill is-${member.role}`}>
                    {teamRoleLabel(member.role)}
                  </span>
                </td>
                <td>
                  <span className={`tcc-status is-${status}`}>
                    <i aria-hidden />
                    {status === "online" ? "Online" : "Offline"}
                  </span>
                </td>
                <td>{new Date(member.joinedAt).toLocaleDateString()}</td>
                <td>
                  {manage ? (
                    <button
                      type="button"
                      className="tcc-more"
                      aria-label={`Actions for ${display}`}
                      aria-expanded={memberMenu?.handle === member.handle}
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        onOpenMenu(member.handle, rect.right - 160, rect.bottom + 6);
                      }}
                    >
                      ⋯
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ul className="tcc-member-cards">
        {rows.map(({ member, person, display }) => {
          const status = memberStatus(member.handle);
          return (
            <li key={`card-${member.handle}`} className="tcc-member-card">
              <div className="tcc-member-cell">
                <UserAvatar
                  username={member.handle}
                  url={person?.avatarUrl ?? null}
                  className="tcc-member-avatar"
                  initialsLength={1}
                />
                <div className="tcc-member-copy">
                  <strong>{display}</strong>
                  <span className="tcc-member-handle">
                    {handleBadge(member.handle)}
                  </span>
                </div>
                {manage ? (
                  <button
                    type="button"
                    className="tcc-more"
                    aria-label={`Actions for ${display}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      onOpenMenu(member.handle, rect.right - 160, rect.bottom + 6);
                    }}
                  >
                    ⋯
                  </button>
                ) : null}
              </div>
              <div className="tcc-member-card-meta">
                <span className={`tcc-role-pill is-${member.role}`}>
                  {teamRoleLabel(member.role)}
                </span>
                <span className={`tcc-status is-${status}`}>
                  <i aria-hidden />
                  {status === "online" ? "Online" : "Offline"}
                </span>
                <span>{new Date(member.joinedAt).toLocaleDateString()}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatAuditTime(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function exportAudit(team: DarkeTeam, format: "csv" | "json") {
  const rows = team.activity ?? [];
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${team.slug || "team"}-audit-${stamp}.${format}`;
  let body = "";
  let type = "application/json";
  if (format === "csv") {
    type = "text/csv";
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    body = [
      "TIME,EVENT,ACTOR",
      ...rows.map((row) =>
        [
          escape(new Date(row.at).toISOString()),
          escape(row.text),
          escape(row.actor ? `@${row.actor}` : ""),
        ].join(","),
      ),
    ].join("\n");
  } else {
    body = JSON.stringify(
      rows.map((row) => ({
        time: new Date(row.at).toISOString(),
        event: row.text,
        actor: row.actor ? `@${row.actor}` : null,
      })),
      null,
      2,
    );
  }
  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function memberInThread(thread: DmThread, handle: string, slug: string): boolean {
  const id = handle.replace(/^@/, "").trim().toLowerCase();
  const self = slug.replace(/^@/, "").trim().toLowerCase();
  if (id === self) return true;
  if ((thread.peerUsername || "").toLowerCase() === id) return true;
  if ((thread.invitedHandles ?? []).some((row) => row.toLowerCase() === id)) return true;
  if ((thread.chatGuests ?? []).some((row) => row.handle.toLowerCase() === id)) {
    return true;
  }
  return false;
}
