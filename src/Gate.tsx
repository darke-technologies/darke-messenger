import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ensureProfile,
  gateMessage,
  loginIdentityForDarkeId,
  loginEmailsForIdentity,
  sessionPublicUsername,
  signInWithPasswordCandidates,
  supabase,
  syntheticAuthEmail,
  usernameAvailable,
  withTimeout,
  rollbackAuth,
} from "./supabase";
import {
  authRedirectUrl,
  clearPasswordRecoveryPending,
  isValidEmail,
  normalizeEmail,
} from "./authCallback";
import { saveMyAvatarUrl, uploadProfileAvatar, loadMyProfile } from "./profile";
import { LockStars } from "./LockStars";
import {
  playAbortedSound,
  playAccessDeniedSound,
  playConfirmIdentitySound,
  playIdentityConfirmedSound,
  stopGateSound,
} from "./gateAudio";
import { IconEye, IconEyeOff, IconHelp } from "./icons";
import { PASSPHRASE_MIN, PASSPHRASE_PLACEHOLDER } from "./passphrase";
import { darkeIdAuthLocal, parseDarkeId, formatDarkeIdInput, ACCESS_DENIED, ACCESS_DENIED_FORMAT } from "./darkeId";
import {
  authSecretsForLogin,
  createAndStoreIdentityKeys,
  deriveAuthPassword,
  unlockIdentityKeys,
} from "./darkeKeys";
import { useDarkeIdentity } from "./DarkeIdentityContext";
import { SignupWizard, type SignupPayload } from "./SignupWizard";
import { isValidDisplayName } from "./personDirectory";
import type { AvatarImageBlob } from "./encodeImage";

type Card = "create" | "signin" | "aborted" | "forgot" | "reset";

type Props = {
  startCard?: Card;
  onReady: (slug: string) => void;
  onHome: () => void;
};

export function Gate({ startCard = "signin", onReady, onHome }: Props) {
  const { setIdentity } = useDarkeIdentity();
  const [card, setCard] = useState<Card>(startCard);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [idHelp, setIdHelp] = useState(false);
  const op = useRef(0);
  const busyRef = useRef(false);

  useEffect(() => {
    setCard(startCard);
  }, [startCard]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    if (card === "aborted") {
      playAbortedSound();
      return;
    }
    if (card === "signin") {
      playConfirmIdentitySound();
      return;
    }
    stopGateSound();
  }, [card]);

  function beginOp(): number {
    const id = ++op.current;
    setBusy(true);
    busyRef.current = true;
    setStatus(null);
    setError(null);
    return id;
  }

  function still(id: number): boolean {
    return id === op.current;
  }

  function goSignIn(message?: string) {
    setUsername("");
    setPassphrase("");
    setShowPassphrase(false);
    setCard("signin");
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/login");
    }
    if (message) setError(message);
  }

  function goCreate() {
    setError(null);
    setShowPassphrase(false);
    setCard("create");
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/signup?step=1");
    }
  }

  async function assignAvatar(chosen: AvatarImageBlob) {
    const url = await uploadProfileAvatar(chosen.bytes, chosen.contentType);
    await saveMyAvatarUrl(url);
  }

  async function onCreate(payload: SignupPayload) {
    const name = payload.displayName.trim();
    const slug = payload.username;
    if (!isValidDisplayName(name)) {
      setError("Display name is required (1–50 characters).");
      return;
    }
    const idKey = payload.darkeId;
    const passphrase = payload.passphrase;
    const mail = syntheticAuthEmail(darkeIdAuthLocal(idKey));
    const opId = beginOp();
    try {
      setStatus("Deriving keys…");
      const available = await withTimeout(usernameAvailable(slug), 15000, "available");
      if (!still(opId)) return;
      if (!available) {
        goSignIn("already taken — sign in");
        return;
      }

      const { publicKey } = await createAndStoreIdentityKeys(idKey, passphrase);
      const authPassword = await deriveAuthPassword(idKey, passphrase);
      if (!still(opId)) return;
      setStatus("Creating…");

      const { data, error: signError } = await withTimeout(
        Promise.resolve(
          supabase.auth.signUp({
            email: mail,
            password: authPassword,
            options: {
              data: {
                username: slug,
                display_name: name,
                darke_id: idKey,
                handle: slug,
              },
            },
          }),
        ),
        20000,
        "signUp",
      );
      if (!still(opId)) return;
      if (signError) {
        const shown = gateMessage(signError);
        if (shown === "already taken — sign in") {
          goSignIn(shown);
          return;
        }
        throw signError;
      }

      let session = data.session;
      if (data.user && !session) {
        const signed = await withTimeout(
          Promise.resolve(
            supabase.auth.signInWithPassword({
              email: mail,
              password: authPassword,
            }),
          ),
          20000,
          "signIn after signUp",
        );
        if (!still(opId)) return;
        if (signed.error) throw signed.error;
        session = signed.data.session;
      }
      if (!data.user || !session) {
        throw new Error("Could not start a session. Try signing in.");
      }

      let avatarUrl: string | null = null;
      if (payload.avatar.kind === "preset") {
        avatarUrl = payload.avatar.url;
      }

      try {
        await ensureProfile({
          slug,
          displayName: name,
          darkeId: idKey,
          publicKey,
          avatarUrl,
          isPrivate: payload.isPrivate,
        });
      } catch (profileErr) {
        await rollbackAuth();
        const shown = gateMessage(profileErr);
        if (shown === "already taken — sign in") {
          goSignIn(shown);
          return;
        }
        throw profileErr;
      }
      if (!still(opId)) return;

      if (payload.avatar.kind === "upload") {
        try {
          await assignAvatar(payload.avatar.photo);
        } catch (photoErr) {
          await rollbackAuth();
          throw photoErr;
        }
      }
      if (!still(opId)) return;

      setIdentity({
        darkeId: idKey,
        handle: slug,
        displayName: name,
        publicKey,
      });
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", "/app");
      }
      onReady(slug);
    } catch (err) {
      if (!still(opId)) return;
      const shown = gateMessage(err);
      if (shown === "already taken — sign in") {
        goSignIn(shown);
        return;
      }
      setError(shown);
    } finally {
      if (still(opId)) {
        setBusy(false);
        busyRef.current = false;
        setStatus(null);
      }
    }
  }

  async function onSignIn(e: FormEvent) {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const typedId =
      (
        form.elements.namedItem("darke-id-entry") as HTMLInputElement | null
      )?.value ?? username;
    const typedPass =
      (
        form.elements.namedItem("darke-pass-entry") as HTMLInputElement | null
      )?.value ?? passphrase;
    const asDarke = parseDarkeId(typedId);
    if (!asDarke) {
      playAccessDeniedSound();
      setError(ACCESS_DENIED_FORMAT);
      return;
    }
    if (!typedPass) {
      playAccessDeniedSound();
      setError(ACCESS_DENIED);
      return;
    }
    const id = beginOp();
    try {
      setStatus("Unlocking…");
      const ident = await withTimeout(
        loginIdentityForDarkeId(asDarke),
        15000,
        "login identity",
      );
      const resolvedId = ident.darkeId ?? asDarke;
      const secrets = await authSecretsForLogin(typedPass, resolvedId);
      if (!secrets.length) {
        throw new Error(ACCESS_DENIED);
      }
      const data = await withTimeout(
        signInWithPasswordCandidates(
          loginEmailsForIdentity({ ...ident, darkeId: resolvedId }),
          secrets,
        ),
        20000,
        "signIn",
      );
      if (!still(id)) return;
      if (!data.session) {
        throw new Error(ACCESS_DENIED);
      }

      try {
        await ensureProfile(ident.publicUsername);
      } catch {
        // Session is valid; profile sync can fail without blocking entry.
      }
      if (!still(id)) return;

      const unlocked = await unlockIdentityKeys(resolvedId, typedPass).catch(
        () => null,
      );
      const profile = await loadMyProfile().catch(() => null);
      setIdentity({
        darkeId: resolvedId,
        handle: ident.publicUsername,
        displayName: profile?.display_name ?? null,
        publicKey: unlocked?.publicKey ?? profile?.public_key ?? null,
      });

      playIdentityConfirmedSound();
      onReady(ident.publicUsername);
    } catch (err) {
      if (!still(id)) return;
      const shown = gateMessage(err);
      playAccessDeniedSound();
      if (shown === ACCESS_DENIED_FORMAT || shown.includes("requires a valid DARKE ID")) {
        setError(ACCESS_DENIED_FORMAT);
      } else {
        setError(
          shown.toLowerCase().includes("network") ? shown : ACCESS_DENIED,
        );
      }
      void supabase.auth.signOut().catch(() => null);
    } finally {
      if (still(id)) {
        setBusy(false);
        busyRef.current = false;
        setStatus(null);
      }
    }
  }

  async function onForgot(e: FormEvent) {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setError("Enter the email address for this account.");
      return;
    }
    const id = beginOp();
    try {
      const { error: resetError } = await withTimeout(
        Promise.resolve(
          supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
            redirectTo: authRedirectUrl(),
          }),
        ),
        20000,
        "resetPasswordForEmail",
      );
      if (!still(id)) return;
      if (resetError) throw resetError;
      setResetSent(true);
    } catch (err) {
      if (!still(id)) return;
      setError(gateMessage(err));
    } finally {
      if (still(id)) {
        setBusy(false);
        busyRef.current = false;
        setStatus(null);
      }
    }
  }

  async function onReset(e: FormEvent) {
    e.preventDefault();
    if (passphrase.length < PASSPHRASE_MIN) {
      setError(`Password must be at least ${PASSPHRASE_MIN} characters.`);
      return;
    }
    if (passphrase !== confirm) {
      setError("Password and confirmation do not match.");
      return;
    }
    const id = beginOp();
    try {
      const { error: updateError } = await withTimeout(
        Promise.resolve(supabase.auth.updateUser({ password: passphrase })),
        20000,
        "updateUser password",
      );
      if (!still(id)) return;
      if (updateError) throw updateError;
      clearPasswordRecoveryPending();
      const nextSlug = await sessionPublicUsername();
      if (!nextSlug) {
        setCard("signin");
        setError(null);
        return;
      }
      playIdentityConfirmedSound();
      onReady(nextSlug);
    } catch (err) {
      if (!still(id)) return;
      setError(gateMessage(err));
    } finally {
      if (still(id)) {
        setBusy(false);
        busyRef.current = false;
        setStatus(null);
      }
    }
  }

  return (
    <div className={`gate${card === "aborted" ? " gate-aborted" : " gate-stars"}`}>
      {card === "aborted" ? null : <LockStars />}
      <div className={`gate-card${card === "aborted" ? " gate-aborted-card" : " gate-card-stars"}`}>
        {card === "aborted" && (
          <div className="auth-form gate-aborted-panel">
            <p className="gate-aborted-title">You are now a ghost...</p>
            <p className="gate-aborted-copy">
              Signed out on this device. Sign in again with your DARKE ID and
            password.
            </p>
            <button
              type="button"
              className="term-btn term-btn-ghost"
              onClick={() => goSignIn()}
            >
              Sign In
            </button>
          </div>
        )}
        {card === "create" && (
          <SignupWizard
            busy={busy}
            status={status}
            error={error}
            onError={setError}
            onSubmit={onCreate}
            onHome={onHome}
          />
        )}
        {card === "signin" && (
          <form className="auth-form" onSubmit={onSignIn}>
            <img className="gate-logo" src="/darke.png" alt="DARKE" />
            <h1 className="signup-title gate-login-title">Login</h1>
            <div className="gate-id-label-row">
              <label className="gate-id-loc-label" htmlFor="darke-id">
                DARKE ID
              </label>
              <button
                type="button"
                className="gate-id-help"
                disabled={busy}
                onClick={() => setIdHelp(true)}
              >
                <IconHelp />
                What is a DARKE ID?
              </button>
            </div>
            <input
              id="darke-id"
              className="gate-id-input"
              name="darke-id-entry"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              data-lpignore="true"
              data-1p-ignore="true"
              placeholder="DARKE-XXXX-XXXX-XXXX-XXXX"
              aria-label="DARKE ID"
              spellCheck={false}
              value={username}
              onChange={(e) => {
                setUsername(formatDarkeIdInput(e.target.value));
                if (error) setError(null);
              }}
              disabled={busy}
              autoFocus
            />
            <label className="gate-id-loc-label" htmlFor="darke-passphrase">
              Password
            </label>
            <div className="gate-pass-row">
              <input
                id="darke-passphrase"
                type={showPassphrase ? "text" : "password"}
                name="darke-pass-entry"
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore="true"
                placeholder="Password"
                aria-label="Password"
                value={passphrase}
                onChange={(e) => {
                  setPassphrase(e.target.value);
                  if (error) setError(null);
                }}
                disabled={busy}
              />
              <button
                type="button"
                className="gate-pass-btn"
                disabled={busy}
                title={showPassphrase ? "Hide password" : "Show password"}
                aria-label={showPassphrase ? "Hide password" : "Show password"}
                aria-pressed={showPassphrase}
                onClick={() => setShowPassphrase((on) => !on)}
              >
                {showPassphrase ? <IconEyeOff /> : <IconEye />}
              </button>
            </div>
            {error && (
              <p
                className={`error${error.startsWith("[ACCESS DENIED]") ? " gate-denied" : ""}`}
                role="alert"
              >
                {error}
              </p>
            )}
            <button type="submit" className="term-btn term-btn-primary" disabled={busy}>
              {busy ? status || "Logging in…" : "LOGIN"}
            </button>
            <p className="gate-or" aria-hidden>
              ─── OR ───
            </p>
            <button
              type="button"
              className="term-btn term-btn-ghost"
              disabled={busy}
              onClick={() => goCreate()}
            >
              Create Account
            </button>
            <button
              type="button"
              className="text-link"
              disabled={busy}
              onClick={onHome}
            >
              ← BACK TO HOME
            </button>
          </form>
        )}
        {idHelp
          ? createPortal(
              <div
                className="apps-modal-backdrop"
                role="presentation"
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) setIdHelp(false);
                }}
              >
                <div
                  className="apps-modal newsfeed-confirm-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="darke-id-help-title"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <h3 id="darke-id-help-title" className="newsfeed-confirm-title">
                    What is a DARKE ID?
                  </h3>
                  <p className="muted apps-submit-note">
                    Your DARKE ID is a zero-knowledge, cryptographically derived
                    identity string. Combined with your password, it
                    deterministically generates your local encryption keys. No
                    emails, no centralized trackers.
                  </p>
                  <div className="newsfeed-confirm-actions">
                    <button
                      type="button"
                      className="projects-choice-btn is-primary"
                      onClick={() => setIdHelp(false)}
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>,
              document.body,
            )
          : null}
        {card === "forgot" && (
          <form className="auth-form" onSubmit={onForgot}>
            <img className="gate-logo" src="/darke.png" alt="DARKE" />
            <p className="gate-note">
              Enter the email for this account. We will send a reset link.
            </p>
            <input
              type="email"
              autoComplete="email"
              placeholder="Email address"
              aria-label="Email address"
              value={email}
              onChange={(e) => {
                setResetSent(false);
                setEmail(e.target.value);
              }}
              disabled={busy}
              autoFocus
            />
            {resetSent ? (
              <p className="gate-copied" role="status">
                Check your email for a reset link, then return here.
              </p>
            ) : null}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="term-btn term-btn-primary" disabled={busy || resetSent}>
              {busy ? "Sending…" : resetSent ? "Email sent" : "Send reset link"}
            </button>
            <button
              type="button"
              className="term-btn term-btn-ghost"
              disabled={busy}
              onClick={() => {
                setError(null);
                setResetSent(false);
                setCard("signin");
              }}
            >
              Back to sign in
            </button>
          </form>
        )}
        {card === "reset" && (
          <form className="auth-form" onSubmit={onReset}>
            <img className="gate-logo" src="/darke.png" alt="DARKE" />
            <p className="gate-note">Choose a new password for this account.</p>
            <div className="gate-pass-row">
              <input
                type={showPassphrase ? "text" : "password"}
                autoComplete="new-password"
                placeholder={PASSPHRASE_PLACEHOLDER}
                aria-label="New password"
                minLength={PASSPHRASE_MIN}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                disabled={busy}
                autoFocus
              />
              <button
                type="button"
                className="gate-pass-btn"
                disabled={busy}
                title={showPassphrase ? "Hide password" : "Show password"}
                aria-label={showPassphrase ? "Hide password" : "Show password"}
                aria-pressed={showPassphrase}
                onClick={() => setShowPassphrase((on) => !on)}
              >
                {showPassphrase ? <IconEyeOff /> : <IconEye />}
              </button>
            </div>
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Confirm password"
              aria-label="Confirm password"
              minLength={PASSPHRASE_MIN}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={busy}
            />
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="term-btn term-btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save password"}
            </button>
            <button
              type="button"
              className="term-btn term-btn-ghost"
              disabled={busy}
              onClick={() => {
                setError(null);
                setCard("signin");
              }}
            >
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
