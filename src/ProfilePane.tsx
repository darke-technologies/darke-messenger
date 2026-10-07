import { FormEvent, createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { prepareAvatarImage, type AvatarImageBlob } from "./encodeImage";
import {
  COUNTRIES,
  US_STATES,
  citiesForState,
  isUnitedStates,
  uniqueSorted,
} from "./places";
import { isValidSlug, toSlug } from "./slug";
import {
  DISPLAY_NAME_MAX,
  isValidUsername,
  usernameHint,
} from "./personDirectory";
import { ProfileLayout } from "./ProfileLayout";
import { useFollow } from "./followsUi";
import { UserAvatar } from "./UserAvatar";
import {
  changeMyUsername,
  deleteProfileAvatar,
  loadMyProfile,
  overlaySavedProfile,
  normalizeContactEmail,
  normalizeDisplayName,
  normalizeHeadline,
  normalizeBio,
  normalizeSocialUrl,
  normalizeWebsite,
  PROFILE_BIO_MAX,
  PROFILE_HEADLINE_MAX,
  PROFILE_SOCIALS,
  profileError,
  saveMyProfile,
  uploadProfileAvatar,
  type DarkeProfile,
  type ProfileSocialId,
} from "./profile";
import { supabase, usernameAvailable } from "./supabase";

type Props = {
  slug: string;
  onOpenUrl?: (url: string) => void;
};

export const ProfileEditContext = createContext<{
  open: () => void;
  epoch: number;
  saved: DarkeProfile | null;
  applySaved: (profile: DarkeProfile) => void;
}>({
  open: () => {},
  epoch: 0,
  saved: null,
  applySaved: () => {},
});

export function useProfileEdit() {
  return useContext(ProfileEditContext);
}

export function ProfilePane({
  slug,
  onOpenUrl: _onOpenUrl,
}: Props) {
  const { open: openProfileEdit, epoch: profileEpoch, saved: savedProfile } =
    useProfileEdit();
  const savedRef = useRef(savedProfile);
  savedRef.current = savedProfile;
  const [profile, setProfile] = useState<DarkeProfile | null>(savedProfile);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (savedProfile) setProfile(savedProfile);
  }, [savedProfile]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const me = await loadMyProfile();
        if (cancelled) return;
        setProfile(overlaySavedProfile(me, savedRef.current) ?? me);
        setError(null);
      } catch (profileErr) {
        if (!cancelled) setError(profileError(profileErr));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileEpoch]);

  const avatarUrl = profile?.avatar_url ?? null;
  const follow = useFollow(profile?.id ?? null, true);

  return (
    <section className="page">
      <div className="profile-card">
        <ProfileLayout
          profile={profile}
          username={profile?.username ?? slug}
          avatarUrl={avatarUrl}
          isSelf
          followers={follow.stats.followers}
          onEditProfile={openProfileEdit}
          actions={
            <button
              type="button"
              className="profile-edit-btn"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openProfileEdit();
              }}
            >
              Edit Profile
            </button>
          }
        />
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function FieldCaption({
  children,
  required = false,
}: {
  children: string;
  required?: boolean;
}) {
  return (
    <span>
      {children}
      {required ? (
        <span className="apps-field-required"> (Required)</span>
      ) : null}
    </span>
  );
}

export function EditProfileModal({
  slug,
  onClose,
  onSaved,
}: {
  slug: string;
  onClose: () => void;
  onSaved: (profile: DarkeProfile, slug: string) => void;
}) {
  const titleId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<AvatarImageBlob | null>(null);
  const [removed, setRemoved] = useState(false);
  const [username, setUsername] = useState(slug);
  const [displayName, setDisplayName] = useState("");
  const [headline, setHeadline] = useState("");
  const [about, setAbout] = useState("");
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [avail, setAvail] = useState<"free" | "taken" | "invalid" | "checking" | "error">(
    "free",
  );
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [website, setWebsite] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [socials, setSocials] = useState<Record<ProfileSocialId, string>>({
    signal: "",
    whatsapp: "",
    telegram: "",
    youtube: "",
    facebook: "",
    twitter: "",
    instagram: "",
    tiktok: "",
    linkedin: "",
  });
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [loadedUsername, setLoadedUsername] = useState(slug);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discoverable, setDiscoverable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadMyProfile()
      .then((row) => {
        if (cancelled || !row) return;
        setUsername(row.username || slug);
        setLoadedUsername(row.username || slug);
        setDisplayName(row.display_name ?? "");
        setHeadline((row.headline ?? "").slice(0, PROFILE_HEADLINE_MAX));
        setAbout((row.bio ?? "").slice(0, PROFILE_BIO_MAX));
        setCountry(row.country ?? "");
        setRegion(row.region ?? "");
        setCity(row.city ?? "");
        setWebsite(row.website_url ?? "");
        setContactEmail(row.email ?? "");
        setSocials({
          signal: row.signal ?? "",
          whatsapp: row.whatsapp_url ?? "",
          telegram: row.telegram_url ?? "",
          youtube: row.youtube_url ?? "",
          facebook: row.facebook_url ?? "",
          twitter: row.twitter_url ?? "",
          instagram: row.instagram_url ?? "",
          tiktok: row.tiktok_url ?? "",
          linkedin: row.linkedin_url ?? "",
        });
        setCurrentUrl(row.avatar_url ?? null);
        setDiscoverable(row.is_discoverable === true);
      })
      .catch((err) => {
        if (!cancelled) setError(profileError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const preview = picked?.previewUrl ?? (removed ? null : currentUrl);
  const us = isUnitedStates(country);
  const cityOptions = uniqueSorted(
    [...citiesForState(region), city].filter(Boolean),
  );
  const nextSlug = toSlug(username);
  const currentPublic = toSlug(loadedUsername);
  const usernameChanged = nextSlug !== currentPublic;
  const usernameOk =
    isValidSlug(nextSlug) &&
    (!usernameChanged || isValidUsername(nextSlug)) &&
    avail === "free";

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSessionUserId(data.session?.user.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (usernameChanged && !isValidUsername(nextSlug)) {
      setAvail("invalid");
      return;
    }
    if (!isValidSlug(nextSlug)) {
      setAvail("invalid");
      return;
    }
    if (!usernameChanged) {
      setAvail("free");
      return;
    }
    setAvail("checking");
    const timer = window.setTimeout(() => {
      void usernameAvailable(nextSlug, sessionUserId)
        .then((ok) => setAvail(ok ? "free" : "taken"))
        .catch(() => setAvail("error"));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [nextSlug, usernameChanged, sessionUserId]);

  async function onPick(file: File | null) {
    if (!file) return;
    setError(null);
    try {
      const blob = await prepareAvatarImage(file);
      setPicked(blob);
      setRemoved(false);
    } catch (err) {
      setError(profileError(err));
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (usernameChanged && !usernameOk) {
        throw new Error(
          avail === "taken"
            ? "That username is taken."
            : "Pick an available username.",
        );
      }
      const previous = currentUrl;
      let nextUrl = currentUrl;
      if (picked) {
        nextUrl = await uploadProfileAvatar(picked.bytes, picked.contentType);
      } else if (removed) {
        nextUrl = null;
      }
      if (!nextUrl) {
        throw new Error("Photo is required.");
      }
      const nextCountry = country.trim() || null;
      const nextRegion = us ? region.trim() || null : null;
      const nextCity = us ? city.trim() || null : null;
      let saved = await saveMyProfile({
        avatar_url: nextUrl,
        display_name: normalizeDisplayName(displayName),
        headline: normalizeHeadline(headline),
        bio: normalizeBio(about),
        country: nextCountry,
        region: nextRegion,
        city: nextCity,
        website_url: normalizeWebsite(website),
        email: normalizeContactEmail(contactEmail),
        signal: normalizeSocialUrl(socials.signal, "signal"),
        youtube_url: normalizeSocialUrl(socials.youtube, "youtube"),
        facebook_url: normalizeSocialUrl(socials.facebook, "facebook"),
        twitter_url: normalizeSocialUrl(socials.twitter, "twitter"),
        instagram_url: normalizeSocialUrl(socials.instagram, "instagram"),
        tiktok_url: normalizeSocialUrl(socials.tiktok, "tiktok"),
        linkedin_url: normalizeSocialUrl(socials.linkedin, "linkedin"),
        whatsapp_url: normalizeSocialUrl(socials.whatsapp, "whatsapp"),
        telegram_url: normalizeSocialUrl(socials.telegram, "telegram"),
        is_discoverable: discoverable,
      });
      if (picked && previous && previous !== nextUrl) {
        await deleteProfileAvatar(previous);
      }
      if (removed && previous) {
        await deleteProfileAvatar(previous);
      }
      let nextName = saved.username;
      if (usernameChanged) {
        nextName = await changeMyUsername(saved.username || currentPublic, nextSlug);
        saved = { ...saved, username: nextName };
      }
      onSaved(saved, nextName);
    } catch (err) {
      setError(profileError(err));
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="apps-modal-backdrop is-profile-edit"
      role="presentation"
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget && !busy) onClose();
      }}
    >
      <form
        className="apps-modal apps-profile-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={(e) => void onSave(e)}
      >
        <header className="apps-profile-modal-head">
          <h3 id={titleId}>Edit Profile</h3>
          <div className="apps-submit-actions">
            <button type="button" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                busy ||
                !preview ||
                !displayName.trim() ||
                !isValidSlug(nextSlug) ||
                (usernameChanged && avail !== "free")
              }
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </header>
        <div className="apps-profile-modal-body">
        <div className="profile-switch-field">
          <span className="apps-field-label">Discoverable profile</span>
          <label className="profile-switch">
            <input
              type="checkbox"
              role="switch"
              checked={discoverable}
              disabled={busy}
              aria-checked={discoverable}
              onChange={(e) => setDiscoverable(e.target.checked)}
            />
            <span className="profile-switch-track" aria-hidden />
          </label>
          <p className="apps-field-hint">
            Allow other users to find your profile in the public directory and
            start 1-on-1 chats.
          </p>
        </div>
        <label className="apps-field">
          <FieldCaption required>Photo</FieldCaption>
          <div className="profile-photo-pick">
            <UserAvatar username={slug} url={preview} className="profile-avatar profile-avatar-lg" />
            <div className="profile-photo-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                {preview ? "Replace photo" : "Choose photo"}
              </button>
              {preview ? (
                <button
                  type="button"
                  className="text-link"
                  disabled={busy}
                  onClick={() => {
                    setPicked(null);
                    setRemoved(true);
                  }}
                >
                  Remove photo
                </button>
              ) : null}
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            onChange={(ev) => {
              void onPick(ev.target.files?.[0] ?? null);
              ev.target.value = "";
            }}
          />
        </label>
        <label className="apps-field">
          <FieldCaption required>Display name</FieldCaption>
          <input
            value={displayName}
            disabled={busy}
            autoComplete="name"
            maxLength={DISPLAY_NAME_MAX}
            required
            placeholder="e.g. Alex Mercer"
            onChange={(ev) => setDisplayName(ev.target.value)}
          />
          <p className="signup-field-help">
            Your real name or team title for internal admin identification
          </p>
        </label>
        <label className="apps-field">
          <FieldCaption required>Username</FieldCaption>
          <span className={`profile-username-field is-${avail}`}>
            <input
              value={username}
              disabled={busy}
              autoComplete="username"
              spellCheck={false}
              onChange={(ev) => setUsername(toSlug(ev.target.value))}
              required
            />
            {avail === "free" && isValidSlug(nextSlug) ? (
              <span className="profile-username-mark is-ok" aria-hidden>
                ✓
              </span>
            ) : null}
            {avail === "taken" || avail === "invalid" ? (
              <span className="profile-username-mark is-bad" aria-hidden>
                ✕
              </span>
            ) : null}
          </span>
          <p className="signup-field-help">
            Unique handle for encrypted mentions and p2p nodes
          </p>
          {avail === "taken" ? (
            <span className="profile-username-msg is-bad">
              That username is taken.
            </span>
          ) : null}
          {avail === "invalid" ? (
            <span className="profile-username-msg is-bad">
              {usernameHint(nextSlug, username) ||
                "Username must be 3–30 letters, numbers, or underscores."}
            </span>
          ) : null}
          {avail === "error" ? (
            <span className="profile-username-msg is-bad">
              Could not check that username.
            </span>
          ) : null}
          {avail === "free" && usernameChanged ? (
            <span className="profile-username-msg is-ok">
              username is available
            </span>
          ) : null}
        </label>
        <label className="apps-field">
          Headline / Job title
          <input
            value={headline}
            disabled={busy}
            maxLength={PROFILE_HEADLINE_MAX}
            placeholder="What's your profession?"
            onChange={(ev) =>
              setHeadline(ev.target.value.slice(0, PROFILE_HEADLINE_MAX))
            }
          />
        </label>
        <label className="apps-field">
          About
          <textarea
            value={about}
            disabled={busy}
            maxLength={PROFILE_BIO_MAX}
            rows={5}
            placeholder="A short public about"
            onChange={(ev) =>
              setAbout(ev.target.value.slice(0, PROFILE_BIO_MAX))
            }
          />
        </label>
        <label className="apps-field">
          Contact Email
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={contactEmail}
            disabled={busy}
            onChange={(ev) => setContactEmail(ev.target.value)}
          />
          <span className="apps-field-hint">
            Publicly visible on your profile for direct outreach.
          </span>
        </label>
        <label className="apps-field">
          Website
          <input
            type="text"
            inputMode="url"
            placeholder="https://www.website.com"
            value={website}
            disabled={busy}
            onChange={(ev) => setWebsite(ev.target.value)}
          />
        </label>
        <label className="apps-field">
          Country
          <select
            value={country}
            disabled={busy}
            onChange={(ev) => {
              const next = ev.target.value;
              setCountry(next);
              if (!isUnitedStates(next)) {
                setRegion("");
                setCity("");
              }
            }}
          >
            <option value="">Select country</option>
            {COUNTRIES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {us ? (
          <label className="apps-field">
            State
            <select
              value={region}
              disabled={busy}
              onChange={(ev) => {
                setRegion(ev.target.value);
                setCity("");
              }}
            >
              <option value="">Select state</option>
              {US_STATES.map((st) => (
                <option key={st.code} value={st.code}>
                  {st.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {us && region ? (
          <label className="apps-field">
            City
            <select
              value={city}
              disabled={busy}
              onChange={(ev) => setCity(ev.target.value)}
            >
              <option value="">Select city</option>
              {cityOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="apps-profile-social-break" role="separator" />
        <h4 className="apps-profile-social-title">SOCIAL</h4>
        {PROFILE_SOCIALS.map((row) => (
            <label key={row.id} className="apps-field">
              {row.label}
              <input
                type="text"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder={row.placeholder}
                value={socials[row.id]}
                disabled={busy}
                maxLength={row.maxLen ?? 300}
                onChange={(ev) =>
                  setSocials((prev) => ({ ...prev, [row.id]: ev.target.value }))
                }
              />
            </label>
          ))}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        </div>
      </form>
    </div>,
    document.body,
  );
}
