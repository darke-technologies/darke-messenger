import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  loadMyProfile,
  loadProfileByUsername,
  loadPublicProfiles,
  overlaySavedProfile,
  type DarkeProfile,
} from "./profile";
import { ProfileLayout, profileNavNeighbors } from "./ProfileLayout";
import { useProfileEdit } from "./ProfilePane";
import { toSlug } from "./slug";
import { supabase } from "./supabase";
import { FollowButton, useFollow } from "./followsUi";
import {
  COMPOSE_INTENT_EVENT,
  FEED_INTENT_EVENT,
  WORKSPACE_INTENT_EVENT,
} from "./feedIntent";

type Props = {
  username: string;
  usernames?: string[];
  viewerSlug?: string;
  onBack: () => void;
  backLabel?: string;
  onOpenUrl?: (url: string) => void;
  onUsernameChange?: (username: string) => void;
  onSlugChanged?: (slug: string) => void;
  onEditProfile?: () => void;
  panel?: boolean;
};

export function ProfileViewModal({
  username,
  usernames = [],
  viewerSlug = "",
  onBack,
  backLabel = "Back",
  onOpenUrl: _onOpenUrl,
  onUsernameChange,
  onEditProfile,
  panel = false,
}: Props) {
  const titleId = useId();
  const [person, setPerson] = useState<DarkeProfile | null>(null);
  const [me, setMe] = useState<DarkeProfile | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [peopleRows, setPeopleRows] = useState<DarkeProfile[]>([]);
  const { open: openProfileEditCtx, epoch: profileEpoch, saved: savedProfile } =
    useProfileEdit();
  const [leaving, setLeaving] = useState(false);
  const [entered, setEntered] = useState(false);
  const closeTimer = useRef(0);

  function requestClose() {
    if (leaving) return;
    setLeaving(true);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => onBack(), 720);
  }

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  useEffect(() => {
    let second = 0;
    const first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      window.cancelAnimationFrame(first);
      window.cancelAnimationFrame(second);
    };
  }, []);
  const savedRef = useRef(savedProfile);
  savedRef.current = savedProfile;
  const openProfileEdit = onEditProfile ?? openProfileEditCtx;
  const viewing = toSlug(username);
  const index = usernames.findIndex((name) => toSlug(name) === viewing);
  const canCycle =
    Boolean(onUsernameChange) && usernames.length > 1 && index >= 0;

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setMyId(data.session?.user.id ?? null);
    });
    void loadMyProfile()
      .then((row) => {
        if (!cancelled) setMe(overlaySavedProfile(row, savedRef.current));
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      });
    return () => {
      cancelled = true;
    };
  }, [profileEpoch]);

  useEffect(() => {
    let cancelled = false;
    const viewingSaved =
      savedProfile != null &&
      toSlug(savedProfile.username) === toSlug(username);
    if (viewingSaved) setPerson(savedProfile);
    else setPerson(null);
    void loadProfileByUsername(username)
      .then((row) => {
        if (cancelled) return;
        setPerson(overlaySavedProfile(row, savedRef.current) ?? row);
      })
      .catch(() => {
        if (!cancelled && !viewingSaved) setPerson(null);
      });
    return () => {
      cancelled = true;
    };
  }, [username, profileEpoch, savedProfile]);

  useEffect(() => {
    if (!savedProfile) return;
    if (toSlug(savedProfile.username) === viewing) {
      setPerson(savedProfile);
      setMe(savedProfile);
      return;
    }
    if (myId && savedProfile.id === myId) setMe(savedProfile);
  }, [savedProfile, viewing, myId]);

  useEffect(() => {
    let cancelled = false;
    void loadPublicProfiles()
      .then((rows) => {
        if (!cancelled) setPeopleRows(rows);
      })
      .catch(() => {
        if (!cancelled) setPeopleRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [profileEpoch]);

  function cycle(delta: number) {
    if (!onUsernameChange || usernames.length < 2) return;
    const i = usernames.findIndex((name) => toSlug(name) === toSlug(username));
    const from = i >= 0 ? i : 0;
    const next = (from + delta + usernames.length) % usernames.length;
    const nextName = usernames[next];
    if (toSlug(nextName) === toSlug(username)) return;
    onUsernameChange(nextName);
  }

  useEffect(() => {
    const close = () => requestClose();
    window.addEventListener(FEED_INTENT_EVENT, close);
    window.addEventListener(COMPOSE_INTENT_EVENT, close);
    window.addEventListener(WORKSPACE_INTENT_EVENT, close);
    return () => {
      window.removeEventListener(FEED_INTENT_EVENT, close);
      window.removeEventListener(COMPOSE_INTENT_EVENT, close);
      window.removeEventListener(WORKSPACE_INTENT_EVENT, close);
    };
  }, [onBack]);

  useEffect(() => {
    if (!canCycle) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        cycle(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        cycle(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canCycle, username, usernames, onUsernameChange]);

  const displayName = person?.username || username;
  const photo = person?.avatar_url ?? null;
  const isSelf = Boolean(
    (me && toSlug(me.username) === viewing) ||
      (viewerSlug && viewing === toSlug(viewerSlug)) ||
      (myId && person?.id === myId && toSlug(person.username) === viewing),
  );
  const follow = useFollow(person?.id ?? null, isSelf);

  const neighbors = useMemo(() => {
    const people = [...peopleRows];
    if (person) people.push(person);
    if (me) people.push(me);
    return profileNavNeighbors(username, usernames, people);
  }, [username, usernames, peopleRows, person, me]);

  return createPortal(
    <div
      className={`apps-modal-backdrop is-profile-view${panel ? " is-profile-panel" : ""}${entered && !leaving ? " is-in" : ""}${leaving ? " is-leaving" : ""}`}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div className="apps-modal-stage">
        <div
          className="apps-modal apps-profile-view"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <ProfileLayout
            profile={person}
            username={displayName}
            avatarUrl={photo}
            isSelf={isSelf}
            onEditProfile={openProfileEdit}
            onPrevProfile={!panel && canCycle ? () => cycle(-1) : undefined}
            onNextProfile={!panel && canCycle ? () => cycle(1) : undefined}
            prevProfile={neighbors.prev}
            nextProfile={neighbors.next}
            onBack={requestClose}
            backLabel={backLabel}
            titleId={titleId}
            identityOnly={panel}
            followers={follow.stats.followers}
            actions={
              isSelf ? (
                <button
                  type="button"
                  className="apps-profile-edit-listing"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openProfileEdit();
                  }}
                >
                  Edit Profile
                </button>
              ) : null
            }
            followAction={
              !isSelf && person?.id ? (
                <>
                  <FollowButton
                    isFollowing={follow.stats.isFollowing}
                    busy={follow.busy}
                    onToggle={() => void follow.toggle()}
                  />
                  {follow.error ? (
                    <span className="profile-follow-error" role="alert">
                      {follow.error}
                    </span>
                  ) : null}
                </>
              ) : null
            }
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
