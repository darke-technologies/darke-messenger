import { useEffect, useState, type CSSProperties } from "react";
import { deleteDarkeAccount, signOutOfDarke } from "./signOut";
import { getShowWelcome, setShowWelcome, setThemePref, getIdleTimeoutMin, setIdleTimeoutMin, getStarsBackground, setStarsBackground, getSidebarSections, setSidebarSection, SIDEBAR_SECTIONS_CHANGE, getFeedFontSize, setFeedFontSize, FEED_FONT_MIN, FEED_FONT_MAX, FEED_FONT_DEFAULT, IDLE_TIMEOUT_OPTIONS, getBroadcastTyping, setBroadcastTyping, type SidebarSections } from "./welcomePrefs";
import {
  readStoredTheme,
  THEME_CHANGE,
  THEME_OPTIONS,
  themeOption,
  type ThemeId,
} from "./theme";
import {
  getConfirmIdentityAudio,
  getIdentityConfirmedAudio,
  setConfirmIdentityAudio,
  setIdentityConfirmedAudio,
} from "./gateAudio";
import {
  inviteUrlForSlug,
  invitesError,
  loadMyInviteVisitorCount,
} from "./invites";
import { useDarkeIdentity } from "./DarkeIdentityContext";

type Props = {
  slug: string;
  onSignedOut: () => void | Promise<void>;
  onAccountDeleted: () => void | Promise<void>;
};

export function SettingsPane({
  slug,
  onSignedOut,
  onAccountDeleted,
}: Props) {
  const [busy, setBusy] = useState<"logout" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showWelcome, setShowWelcomeState] = useState(true);
  const [theme, setThemeState] = useState<ThemeId>(readStoredTheme);
  const [welcomeBusy, setWelcomeBusy] = useState(false);
  const [confirmIdentityAudio, setConfirmIdentityAudioState] = useState(
    getConfirmIdentityAudio,
  );
  const [identityConfirmedAudio, setIdentityConfirmedAudioState] = useState(
    getIdentityConfirmedAudio,
  );
  const [signOutStatus, setSignOutStatus] = useState<string | null>(null);
  const [idleTimeoutMin, setIdleTimeoutMinState] = useState(0);
  const [starsBackground, setStarsBackgroundState] = useState(true);
  const [sidebarSections, setSidebarSectionsState] = useState<SidebarSections>({
    darkenet: true,
    workspaces: true,
    entertainment: true,
  });
  const [feedFontSize, setFeedFontSizeState] = useState(FEED_FONT_DEFAULT);
  const [broadcastTyping, setBroadcastTypingState] = useState(true);
  const [visitors, setVisitors] = useState<number | null>(null);
  const [inviteNote, setInviteNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { identity } = useDarkeIdentity();
  const inviteLink = inviteUrlForSlug(slug);

  useEffect(() => {
    let cancelled = false;
    void loadMyInviteVisitorCount()
      .then((n) => {
        if (!cancelled) {
          setVisitors(n);
          setInviteNote(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setVisitors(null);
          setInviteNote(invitesError(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    void getIdleTimeoutMin()
      .then((min) => {
        if (!cancelled) setIdleTimeoutMinState(min);
      })
      .catch(() => {
        if (!cancelled) setIdleTimeoutMinState(0);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    void getStarsBackground()
      .then((on) => {
        if (!cancelled) setStarsBackgroundState(on);
      })
      .catch(() => {
        if (!cancelled) setStarsBackgroundState(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    void getSidebarSections()
      .then((next) => {
        if (!cancelled) setSidebarSectionsState(next);
      })
      .catch(() => {
        if (!cancelled) {
          setSidebarSectionsState({
            darkenet: true,
            workspaces: true,
            entertainment: true,
          });
        }
      });
    const onPref = (event: Event) => {
      const next = (event as CustomEvent<SidebarSections>).detail;
      if (
        next &&
        typeof next.darkenet === "boolean" &&
        typeof next.workspaces === "boolean" &&
        typeof next.entertainment === "boolean"
      ) {
        setSidebarSectionsState(next);
      }
    };
    window.addEventListener(SIDEBAR_SECTIONS_CHANGE, onPref);
    return () => {
      cancelled = true;
      window.removeEventListener(SIDEBAR_SECTIONS_CHANGE, onPref);
    };
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    void getFeedFontSize()
      .then((px) => {
        if (!cancelled) setFeedFontSizeState(px);
      })
      .catch(() => {
        if (!cancelled) setFeedFontSizeState(FEED_FONT_DEFAULT);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    void getBroadcastTyping()
      .then((on) => {
        if (!cancelled) setBroadcastTypingState(on);
      })
      .catch(() => {
        if (!cancelled) setBroadcastTypingState(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    void getShowWelcome()
      .then((show) => {
        if (!cancelled) setShowWelcomeState(show);
      })
      .catch(() => {
        if (!cancelled) setShowWelcomeState(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const sync = () => setThemeState(readStoredTheme());
    window.addEventListener(THEME_CHANGE, sync);
    return () => window.removeEventListener(THEME_CHANGE, sync);
  }, []);

  async function logOut() {
    setError(null);
    setBusy("logout");
    setSignOutStatus("Signing out…");
    try {
      await signOutOfDarke((message) => setSignOutStatus(message));
      setSignOutStatus("Returning to sign-in…");
      await onSignedOut();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
      setSignOutStatus(null);
    }
  }

  async function onDeleteAccount() {
    setError(null);
    setBusy("delete");
    try {
      await deleteDarkeAccount(slug);
      await onAccountDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
      setConfirmDelete(false);
    }
  }

  async function onIdleTimeoutPick(min: number) {
    setIdleTimeoutMinState(min);
    setError(null);
    try {
      await setIdleTimeoutMin(min);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onFeedFontPick(px: number) {
    const next = Math.min(FEED_FONT_MAX, Math.max(FEED_FONT_MIN, px));
    setFeedFontSizeState(next);
    setError(null);
    try {
      await setFeedFontSize(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onThemePick(next: ThemeId) {
    setThemeState(next);
    setError(null);
    try {
      await setThemePref(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onWelcomeToggle(next: boolean) {
    setWelcomeBusy(true);
    setError(null);
    setShowWelcomeState(next);
    try {
      await setShowWelcome(next);
    } catch (err) {
      setShowWelcomeState(!next);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWelcomeBusy(false);
    }
  }

  return (
    <section className="page settings-page">
      <header className="page-head">
        <h2>Settings</h2>
      </header>

      <section className="settings-card">
        <h3>Security</h3>
        <p className="settings-help">
          Your username and locally derived keys stay on this device. Encryption
          keys are unwrapped with your password — DARKE never stores it.
        </p>
        <input
          className="invite-link settings-darke-id"
          value={identity?.handle || slug || "—"}
          readOnly
          aria-label="Username"
          onFocus={(e) => e.currentTarget.select()}
        />
      </section>

      <section className="settings-card">
        <h3>Privacy</h3>
        <p className="settings-help">
          Typing pings travel only on the encrypted P2P data channel. They are
          never stored in chat history or on the server.
        </p>
        <label className="settings-check settings-switch-row">
          <span>Broadcast Typing Status</span>
          <input
            type="checkbox"
            role="switch"
            className="settings-switch"
            checked={broadcastTyping}
            aria-checked={broadcastTyping}
            onChange={(e) => {
              const next = e.target.checked;
              setBroadcastTypingState(next);
              void setBroadcastTyping(next).catch((err) => {
                setBroadcastTypingState(!next);
                setError(err instanceof Error ? err.message : String(err));
              });
            }}
          />
          <span className="settings-switch-state">
            {broadcastTyping ? "ON" : "OFF"}
          </span>
        </label>
      </section>

      <section className="settings-card">
        <h3>Invites</h3>
        <p className="invite-count">{visitors == null ? "—" : visitors}</p>
        <p className="settings-help">
          Share this link. Friends open darkemessenger.com. Each unique visit is counted.
        </p>
        <div className="invite-row">
          <input
            className="invite-link"
            value={inviteLink}
            readOnly
            aria-label="Invite link"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(inviteLink).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              });
            }}
          >
            {copied ? "Copied" : "Copy invite link"}
          </button>
        </div>
        {inviteNote ? (
          <p className="settings-help" role="status">
            {inviteNote}
          </p>
        ) : null}
      </section>

      <section className="settings-card">
        <h3>Appearance</h3>
        <p className="settings-help">
          Accent color for chrome, type, and glows. Remembered on this PC.
        </p>
        <div
          className="settings-accent-picks"
          role="radiogroup"
          aria-label="Accent color"
        >
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={theme === opt.id}
              aria-label={opt.label}
              title={opt.label}
              className={
                theme === opt.id
                  ? "settings-accent-swatch is-on"
                  : "settings-accent-swatch"
              }
              style={{ "--swatch": opt.hex } as CSSProperties}
              onClick={() => void onThemePick(opt.id)}
            />
          ))}
        </div>
        <p className="settings-accent-current">{themeOption(theme).label}</p>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={starsBackground}
            onChange={(e) => {
              const next = e.target.checked;
              setStarsBackgroundState(next);
              void setStarsBackground(next).catch((err) => {
                setStarsBackgroundState(!next);
                setError(err instanceof Error ? err.message : String(err));
              });
            }}
          />
          Starfield background
        </label>
        <p className="settings-help">
          Twinkling stars and shooting stars behind every page, tinted with the
          accent color above. Remembered on this PC.
        </p>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={sidebarSections.darkenet}
            onChange={(e) => {
              const next = e.target.checked;
              setSidebarSectionsState((prev) => ({ ...prev, darkenet: next }));
              void setSidebarSection("darkenet", next).catch((err) => {
                setSidebarSectionsState((prev) => ({ ...prev, darkenet: !next }));
                setError(err instanceof Error ? err.message : String(err));
              });
            }}
          />
          Show DARKENET in Sidebar
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={sidebarSections.entertainment}
            onChange={(e) => {
              const next = e.target.checked;
              setSidebarSectionsState((prev) => ({ ...prev, entertainment: next }));
              void setSidebarSection("entertainment", next).catch((err) => {
                setSidebarSectionsState((prev) => ({
                  ...prev,
                  entertainment: !next,
                }));
                setError(err instanceof Error ? err.message : String(err));
              });
            }}
          />
          Show Entertainment in Sidebar
        </label>
        <p className="settings-help">
          Hide a section to remove its items and badges from the left sidebar.
          Home always stays on the Terminal.
        </p>
        <div className="settings-font-row">
          <span>Feed post size</span>
          <div className="settings-font-step">
            <button
              type="button"
              aria-label="Decrease feed post size"
              disabled={feedFontSize <= FEED_FONT_MIN}
              onClick={() => void onFeedFontPick(feedFontSize - 1)}
            >
              −
            </button>
            <output aria-live="polite">{feedFontSize} px</output>
            <button
              type="button"
              aria-label="Increase feed post size"
              disabled={feedFontSize >= FEED_FONT_MAX}
              onClick={() => void onFeedFontPick(feedFontSize + 1)}
            >
              +
            </button>
          </div>
        </div>
        <p className="settings-font-preview">This is how feed posts will look.</p>
        <p className="settings-help">
          Size of post and comment text in the newsfeed. {FEED_FONT_MIN}–{FEED_FONT_MAX} px.
          Remembered on this PC.
        </p>
      </section>

      <section className="settings-card">
        <h3>Time Out</h3>
        <p className="settings-help">
          Lock DARKE after inactivity in this window.
        </p>
        <div
          className="settings-idle-picks"
          role="radiogroup"
          aria-label="Idle time out"
        >
          {IDLE_TIMEOUT_OPTIONS.map((opt) => (
            <button
              key={opt.min}
              type="button"
              role="radio"
              aria-checked={idleTimeoutMin === opt.min}
              className={
                idleTimeoutMin === opt.min
                  ? "settings-idle-pick is-on"
                  : "settings-idle-pick"
              }
              onClick={() => void onIdleTimeoutPick(opt.min)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-card">
        <h3>Welcome screen</h3>
        <p className="settings-help">
          Show the feature welcome modal after you sign in. Remembered on this
          PC.
        </p>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={showWelcome}
            disabled={welcomeBusy}
            onChange={(e) => void onWelcomeToggle(e.target.checked)}
          />
          Show welcome screen after sign in
        </label>
      </section>

      <section className="settings-card">
        <h3>Audio</h3>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={confirmIdentityAudio}
            onChange={(e) => {
              const next = e.target.checked;
              setConfirmIdentityAudioState(next);
              setConfirmIdentityAudio(next);
            }}
          />
          Play audio on the sign-in screen
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={identityConfirmedAudio}
            onChange={(e) => {
              const next = e.target.checked;
              setIdentityConfirmedAudioState(next);
              setIdentityConfirmedAudio(next);
            }}
          />
          Play audio after a successful sign-in
        </label>
      </section>

      <section className="settings-card settings-session">
        <h3>Session</h3>
        <button
          type="button"
          className="settings-signout"
          disabled={busy !== null}
          onClick={() => void logOut()}
        >
          {busy === "logout" ? signOutStatus || "Signing out…" : "Sign Out"}
        </button>
        {busy === "logout" ? (
          <p className="settings-help" role="status">
            Signing out of your cloud account on this PC.
          </p>
        ) : (
          <p className="settings-help">
            Sign out of DARKE on this PC.
          </p>
        )}
      </section>

      <section className="settings-card settings-danger">
        <h3>Delete account</h3>
        {!confirmDelete ? (
          <button
            type="button"
            className="danger settings-delete"
            disabled={busy !== null}
            onClick={() => {
              setError(null);
              setConfirmDelete(true);
            }}
          >
            Delete Account
          </button>
        ) : (
          <div className="confirm-box" role="alertdialog" aria-labelledby="delete-account-title">
            <p id="delete-account-title" className="copy">
              Permanently delete your DARKE account? This cannot be undone.
            </p>
            <div className="confirm-actions">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger"
                disabled={busy !== null}
                onClick={() => void onDeleteAccount()}
              >
                {busy === "delete" ? "Deleting…" : "Delete Account"}
              </button>
            </div>
          </div>
        )}
        <p className="settings-help">
          This removes your DARKE account from our servers PERMANENTLY
        </p>
      </section>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
