import { useEffect, useMemo, useState, type ReactNode } from "react";
import { IconCopy, IconStar, IconStarFilled } from "./icons";
import { PROFILE_HEADLINE_MAX, type DarkeProfile } from "./profile";
import { toSlug } from "./slug";
import { loadIsFollowing } from "./follows";
import { ProfileFollowCounts } from "./followsUi";
import {
  loadStatusCount,
  loadUserCommentCount,
  loadProfileInteractions,
  relativeTime,
  type ProfileInteractionKind,
  type ProfileInteractionSummary,
} from "./status";
import { openCompose, openWorkspacePane } from "./feedIntent";
import { UserAvatar } from "./UserAvatar";
import { supabase } from "./supabase";
import {
  loadIsProfileFavorite,
  setProfileFavorite,
} from "./profileFavorites";
import { useDarkeIdentity } from "./DarkeIdentityContext";
import { useDm } from "./DmContext";
import { generateSessionKey } from "./dmSessions";
import { useWorkspacesMaybe } from "./WorkspaceContext";
import { loadWorkspaceMembers, type DarkeWorkspace } from "./workspaces";

function overlayWhen(iso: string): string {
  const rel = relativeTime(iso);
  if (rel === "now") return "just now";
  if (/^\d+[mhd]$/.test(rel)) return `${rel} ago`;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  return `on ${new Date(then).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

function interactionCopy(
  kind: ProfileInteractionKind,
  username: string,
  at: string,
): string {
  const when = overlayWhen(at);
  if (kind === "they_replied") return `Replied to your comment ${when}.`;
  if (kind === "they_commented") return `Commented on your post ${when}.`;
  if (kind === "you_replied") return `You replied to ${username} ${when}.`;
  return `You commented on their post ${when}.`;
}

function ProfilePhotoRelation({
  profileId,
  username,
  isSelf,
}: {
  profileId: string | null | undefined;
  username: string;
  isSelf: boolean;
}) {
  const [followsYou, setFollowsYou] = useState(false);
  const [summary, setSummary] = useState<ProfileInteractionSummary>({
    count: 0,
    latest: null,
  });

  useEffect(() => {
    if (isSelf || !profileId) {
      setFollowsYou(false);
      setSummary({ count: 0, latest: null });
      return;
    }
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      const me = data.session?.user.id ?? null;
      if (!me || me === profileId) return;
      void Promise.all([
        loadIsFollowing(me, profileId).catch(() => false),
        loadProfileInteractions(me, profileId).catch(() => ({
          count: 0,
          latest: null,
        })),
      ]).then(([follows, next]) => {
        if (cancelled) return;
        setFollowsYou(follows);
        setSummary(next);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [isSelf, profileId]);

  if (isSelf || !profileId) return null;
  if (!followsYou && summary.count === 0) return null;
  const latest = summary.latest;

  return (
    <div className="profile-relation">
      {followsYou ? (
        <p className="profile-relation-follow">{username} follows you</p>
      ) : null}
      {latest ? (
        <p className="profile-relation-line">
          {interactionCopy(latest.kind, username, latest.at)}
        </p>
      ) : null}
      {summary.count > 1 ? (
        <p className="profile-relation-count">
          You&apos;ve interacted {summary.count.toLocaleString("en-US")} times
        </p>
      ) : null}
    </div>
  );
}

function ProfileFavToggle({ profileId }: { profileId: string }) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadIsProfileFavorite(profileId)
      .then((next) => {
        if (!cancelled) setOn(next);
      })
      .catch(() => {
        if (!cancelled) setOn(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  return (
    <button
      type="button"
      className={`profile-photo-fav${on ? " is-on" : ""}`}
      disabled={busy}
      aria-label={on ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={on}
      onClick={() => {
        if (busy) return;
        const next = !on;
        setBusy(true);
        setOn(next);
        void setProfileFavorite(profileId, next)
          .catch(() => setOn(!next))
          .finally(() => setBusy(false));
      }}
    >
      {on ? (
        <IconStarFilled className="profile-photo-fav-icon" />
      ) : (
        <IconStar className="profile-photo-fav-icon" />
      )}
    </button>
  );
}

export type ProfileNavPeek = {
  username: string;
  avatarUrl: string | null;
};

export function profileNavNeighbors(
  current: string,
  sequence: string[],
  people: DarkeProfile[],
): { prev: ProfileNavPeek | null; next: ProfileNavPeek | null } {
  const handle = toSlug(current);
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const name of sequence) {
    const slug = toSlug(name);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    unique.push(name);
  }
  if (unique.length < 2) return { prev: null, next: null };
  let i = unique.findIndex((name) => toSlug(name) === handle);
  if (i < 0) i = 0;
  const prevName = unique[(i - 1 + unique.length) % unique.length];
  const nextName = unique[(i + 1) % unique.length];
  const bySlug = new Map(
    people.map((row) => [toSlug(row.username), row] as const),
  );
  function peek(name: string): ProfileNavPeek {
    const row = bySlug.get(toSlug(name));
    return {
      username: row?.username ?? toSlug(name),
      avatarUrl: row?.avatar_url ?? null,
    };
  }
  return { prev: peek(prevName), next: peek(nextName) };
}

function formatFingerprint(raw: string | null | undefined): string {
  const hex = (raw ?? "").replace(/[^0-9a-f]/gi, "").toUpperCase();
  if (!hex) return "";
  return (hex.match(/.{1,4}/g) ?? []).slice(0, 10).join(" ");
}

function ProfileOps({
  profile,
  handle,
  isSelf,
}: {
  profile: DarkeProfile | null;
  handle: string;
  isSelf: boolean;
}) {
  const { identity } = useDarkeIdentity();
  const dm = useDm();
  const workspaces = useWorkspacesMaybe();
  const [copied, setCopied] = useState(false);
  const [listed, setListed] = useState<DarkeWorkspace[]>([]);

  const rawKey =
    profile?.public_key?.trim() ||
    (isSelf ? identity?.publicKey?.trim() || null : null);
  const fingerprint = formatFingerprint(rawKey);

  const nodeLabel = useMemo(() => {
    if (isSelf) return "Online";
    const needle = handle.toLowerCase();
    const thread = dm.threads.find((row) => {
      const rowHandle = row.handle.replace(/^@/, "").toLowerCase();
      return (
        rowHandle === needle ||
        row.displayName.replace(/^@/, "").toLowerCase() === needle
      );
    });
    if (thread?.connectionState === "CONNECTED") return "Peer Connected";
    return "Offline";
  }, [isSelf, handle, dm.threads]);

  useEffect(() => {
    const mine = workspaces?.workspaces ?? [];
    if (isSelf) {
      setListed(mine);
      return;
    }
    const userId = profile?.id;
    if (!userId || mine.length === 0) {
      setListed([]);
      return;
    }
    let cancelled = false;
    void Promise.all(
      mine.slice(0, 12).map(async (row) => {
        const members = await loadWorkspaceMembers(row.id).catch(() => []);
        return members.some((m) => m.userId === userId) ? row : null;
      }),
    ).then((rows) => {
      if (!cancelled) {
        setListed(rows.filter((row): row is DarkeWorkspace => row != null));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isSelf, profile?.id, workspaces?.workspaces]);

  function copyFingerprint() {
    if (!rawKey) return;
    void navigator.clipboard.writeText(rawKey).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    });
  }

  function openDirectChat() {
    dm.startEncryptedChat("", generateSessionKey(), false, "direct", handle);
    window.setTimeout(() => dm.renameActive(`@${handle}`), 0);
    openCompose();
  }

  const nodeClass =
    nodeLabel === "Online"
      ? "is-online"
      : nodeLabel === "Peer Connected"
        ? "is-peer"
        : "is-offline";

  return (
    <section className="profile-layout-col profile-layout-ops" aria-label="Node">
      <div className="profile-ops-block">
        <h4 className="profile-layout-h">P2P Node Status</h4>
        <p className={`profile-ops-status ${nodeClass}`}>
          <span className="profile-ops-dot" aria-hidden />
          {nodeLabel}
        </p>
      </div>
      <div className="profile-ops-block">
        <h4 className="profile-layout-h">Public Verification Key</h4>
        {fingerprint ? (
          <div className="profile-ops-fp-row">
            <code className="profile-ops-fp">{fingerprint}</code>
            <button
              type="button"
              className="gate-pass-btn"
              title={copied ? "Copied" : "Copy fingerprint"}
              aria-label={copied ? "Copied" : "Copy fingerprint"}
              onClick={copyFingerprint}
            >
              <IconCopy />
            </button>
          </div>
        ) : (
          <p className="profile-ops-empty">No public key on this profile.</p>
        )}
      </div>
      <div className="profile-ops-block">
        <h4 className="profile-layout-h">Encrypted Workspaces</h4>
        {listed.length > 0 ? (
          <ul className="profile-ops-ws">
            {listed.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="profile-ops-ws-btn"
                  onClick={() => openWorkspacePane(row.id)}
                >
                  {row.name}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="profile-ops-empty">
            {isSelf
              ? "No active encrypted workspaces."
              : "No shared encrypted workspaces."}
          </p>
        )}
        {!isSelf ? (
          <button
            type="button"
            className="term-btn term-btn-emerald profile-ops-chat"
            onClick={openDirectChat}
          >
            Direct Chat with @{handle}
          </button>
        ) : (
          <button
            type="button"
            className="term-btn term-btn-emerald profile-ops-chat"
            onClick={() => openCompose()}
          >
            Open Encrypted Chat
          </button>
        )}
      </div>
    </section>
  );
}

export function ProfileLayout({
  profile,
  username,
  avatarUrl,
  isSelf = false,
  onEditProfile: _onEditProfile,
  onPrevProfile,
  onNextProfile,
  prevProfile = null,
  nextProfile = null,
  onBack,
  backLabel = "Back",
  actions,
  nameActions,
  followAction,
  titleId,
  followers = 0,
  identityOnly = false,
}: {
  profile: DarkeProfile | null;
  username: string;
  avatarUrl: string | null;
  isSelf?: boolean;
  onEditProfile?: () => void;
  onPrevProfile?: () => void;
  onNextProfile?: () => void;
  prevProfile?: ProfileNavPeek | null;
  nextProfile?: ProfileNavPeek | null;
  onBack?: () => void;
  backLabel?: string;
  actions?: ReactNode;
  nameActions?: ReactNode;
  followAction?: ReactNode;
  titleId?: string;
  followers?: number;
  identityOnly?: boolean;
}) {
  const handle = toSlug(username);
  const shownName = (profile?.display_name ?? "").trim() || handle;
  const headline = (profile?.headline ?? "").trim() || null;
  const [updates, setUpdates] = useState(0);
  const [comments, setComments] = useState(0);

  useEffect(() => {
    const id = profile?.id ?? null;
    if (!id) {
      setUpdates(0);
      setComments(0);
      return;
    }
    let cancelled = false;
    void Promise.all([
      loadStatusCount(id).catch(() => 0),
      loadUserCommentCount(id).catch(() => 0),
    ]).then(([nextUpdates, nextComments]) => {
      if (!cancelled) {
        setUpdates(nextUpdates);
        setComments(nextComments);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  return (
    <div className="profile-shell">
      <div
        className={`profile-layout${identityOnly ? " is-identity-only" : " is-ops"}`}
      >
        <section
          className="profile-layout-col profile-layout-identity"
          aria-label="Profile"
        >
          <div className="profile-layout-carousel">
            <div className="profile-layout-carousel-frame">
              <UserAvatar
                key={avatarUrl ?? "none"}
                username={username}
                url={avatarUrl}
                className="profile-layout-face"
              />
              <ProfilePhotoRelation
                profileId={profile?.id}
                username={handle}
                isSelf={isSelf}
              />
            </div>
            {!isSelf && profile?.id ? (
              <ProfileFavToggle profileId={profile.id} />
            ) : null}
            {actions ? (
              <div className="profile-photo-edit">{actions}</div>
            ) : null}
          </div>
          <div className="profile-layout-id">
            <div className="profile-layout-id-row">
              <h3 className="profile-layout-name" id={titleId}>
                {shownName}
              </h3>
              <span className="profile-layout-name-sep" aria-hidden>
                ·
              </span>
              <span className="profile-layout-handle">@{handle}</span>
            </div>
            {headline ? (
              <p className="profile-layout-title">
                {headline.slice(0, PROFILE_HEADLINE_MAX)}
              </p>
            ) : null}
          </div>
          {nameActions ? (
            <div className="profile-layout-name-row">{nameActions}</div>
          ) : null}
          <div className="profile-layout-meta">
            <ProfileFollowCounts
              followers={followers}
              updates={updates}
              comments={comments}
            />
            {followAction ? (
              <div className="profile-layout-follow">{followAction}</div>
            ) : null}
          </div>
        </section>

        {identityOnly ? null : (
          <ProfileOps
            profile={profile}
            handle={handle}
            isSelf={isSelf}
          />
        )}
      </div>
      {onBack || onPrevProfile || onNextProfile ? (
        <footer className="profile-nav-bar">
          {onPrevProfile && !identityOnly ? (
            <button
              type="button"
              className="profile-nav-btn is-prev"
              aria-label={
                prevProfile
                  ? `Previous profile, @${toSlug(prevProfile.username)}`
                  : "Previous profile"
              }
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onPrevProfile();
              }}
            >
              <span className="profile-nav-chevron" aria-hidden>
                ‹
              </span>
              {prevProfile ? (
                <>
                  <UserAvatar
                    username={prevProfile.username}
                    url={prevProfile.avatarUrl}
                    className="profile-nav-face"
                  />
                  <span className="profile-nav-handle">
                    @{toSlug(prevProfile.username)}
                  </span>
                </>
              ) : null}
            </button>
          ) : (
            <span className="profile-nav-spacer" aria-hidden />
          )}
          <div className="profile-nav-bar-center">
            {onBack ? (
              <button
                type="button"
                className="profile-nav-back"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onBack();
                }}
              >
                {backLabel}
              </button>
            ) : null}
          </div>
          {onNextProfile && !identityOnly ? (
            <button
              type="button"
              className="profile-nav-btn is-next"
              aria-label={
                nextProfile
                  ? `Next profile, @${toSlug(nextProfile.username)}`
                  : "Next profile"
              }
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onNextProfile();
              }}
            >
              {nextProfile ? (
                <>
                  <span className="profile-nav-handle">
                    @{toSlug(nextProfile.username)}
                  </span>
                  <UserAvatar
                    username={nextProfile.username}
                    url={nextProfile.avatarUrl}
                    className="profile-nav-face"
                  />
                </>
              ) : null}
              <span className="profile-nav-chevron" aria-hidden>
                ›
              </span>
            </button>
          ) : (
            <span className="profile-nav-spacer" aria-hidden />
          )}
        </footer>
      ) : null}
    </div>
  );
}
