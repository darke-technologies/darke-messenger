import { FormEvent, useEffect, useMemo, useState } from "react";
import { DARKE_AVATAR_PRESETS } from "./darkeAvatars";
import { generateDarkeId, parseDarkeId } from "./darkeId";
import { IconCopy, IconEye, IconEyeOff } from "./icons";
import {
  estimatePassphraseLocal,
  PASSPHRASE_MIN,
} from "./passphrase";
import {
  DISPLAY_NAME_MAX,
  isValidDisplayName,
  isValidUsername,
  normalizeDisplayNameInput,
  normalizeUsername,
  usernameHint,
} from "./personDirectory";
import { usernameAvailable } from "./supabase";
import type { AvatarImageBlob } from "./encodeImage";

export type SignupAvatar =
  | { kind: "upload"; photo: AvatarImageBlob }
  | { kind: "preset"; url: string };

export type SignupPayload = {
  darkeId: string;
  passphrase: string;
  displayName: string;
  username: string;
  avatar: SignupAvatar;
  isPrivate: boolean;
};

type Step = 1 | 2;

function readSignupStep(): Step {
  if (typeof window === "undefined") return 1;
  const n = Number(new URLSearchParams(window.location.search).get("step"));
  return n === 2 ? 2 : 1;
}

function writeSignupStep(step: Step) {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", `/signup?step=${step}`);
}

export function SignupWizard({
  busy,
  status,
  error,
  onError,
  onSubmit,
  onHome,
}: {
  busy: boolean;
  status: string | null;
  error: string | null;
  onError: (message: string | null) => void;
  onSubmit: (payload: SignupPayload) => void | Promise<void>;
  onHome: () => void;
}) {
  const [step, setStep] = useState<Step>(() => readSignupStep());
  const [darkeId, setDarkeId] = useState("");
  const [copiedId, setCopiedId] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [handleAvail, setHandleAvail] = useState<
    "idle" | "checking" | "free" | "taken" | "invalid" | "error"
  >("idle");

  const slug = useMemo(() => normalizeUsername(username), [username]);
  const estimate = useMemo(
    () => estimatePassphraseLocal(passphrase),
    [passphrase],
  );
  const hasId = Boolean(parseDarkeId(darkeId));
  const step1Ready =
    hasId && passphrase.length >= PASSPHRASE_MIN && passphrase === confirm;

  useEffect(() => {
    writeSignupStep(step);
  }, [step]);

  useEffect(() => {
    if (step === 2 && !parseDarkeId(darkeId)) setStep(1);
  }, [step, darkeId]);

  useEffect(() => {
    if (step !== 2) return;
    if (!isValidUsername(slug)) {
      setHandleAvail(username.trim() ? "invalid" : "idle");
      return;
    }
    setHandleAvail("checking");
    const timer = window.setTimeout(() => {
      void usernameAvailable(slug)
        .then((ok) => setHandleAvail(ok ? "free" : "taken"))
        .catch(() => setHandleAvail("error"));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [step, slug, username]);

  function go(next: Step) {
    onError(null);
    setStep(next);
  }

  function generateId() {
    setDarkeId(generateDarkeId());
    setCopiedId(false);
    onError(null);
  }

  async function copyId() {
    if (!hasId) return;
    try {
      await navigator.clipboard.writeText(darkeId);
      setCopiedId(true);
      window.setTimeout(() => setCopiedId(false), 2400);
    } catch {
      onError("Could not copy DARKE ID.");
    }
  }

  function continueToProfile() {
    if (!parseDarkeId(darkeId)) {
      onError("Generate a DARKE ID first.");
      return;
    }
    if (passphrase.length < PASSPHRASE_MIN) {
      onError(`Password must be at least ${PASSPHRASE_MIN} characters.`);
      return;
    }
    if (passphrase !== confirm) {
      onError("Password and confirmation do not match.");
      return;
    }
    go(2);
  }

  async function enterDarke(e: FormEvent) {
    e.preventDefault();
    if (step === 1) {
      continueToProfile();
      return;
    }
    const name = normalizeDisplayNameInput(displayName);
    if (!isValidDisplayName(name)) {
      onError("Display name is required (1–50 characters).");
      return;
    }
    if (!isValidUsername(slug)) {
      onError(usernameHint(slug, username) || "Choose a unique username.");
      return;
    }
    if (handleAvail !== "free") {
      onError(
        handleAvail === "taken"
          ? "This username not available"
          : "Wait until the username check finishes.",
      );
      return;
    }
    const idKey = parseDarkeId(darkeId);
    if (!idKey) {
      onError("Generate a DARKE ID first.");
      go(1);
      return;
    }
    const preset =
      DARKE_AVATAR_PRESETS[
        Math.floor(Math.random() * DARKE_AVATAR_PRESETS.length)
      ];
    await onSubmit({
      darkeId: idKey,
      passphrase,
      displayName: name,
      username: slug,
      avatar: { kind: "preset", url: preset.url },
      isPrivate: false,
    });
  }

  return (
    <form className="auth-form signup-wizard" onSubmit={enterDarke}>
      {step === 1 ? (
        <>
          <img className="gate-logo" src="/darke.png" alt="DARKE" />
          <p className="signup-progress">STEP 1 OF 2 • ACCOUNT CREATION</p>
          <h1 className="signup-title">CREATE YOUR ACCOUNT</h1>
          <p className="signup-copy">
            Generate your DARKE ID and choose a password.
          </p>
          <div className="signup-id-row">
            <input
              className="gate-id-input"
              readOnly
              value={darkeId}
              placeholder="DARKE-XXXX-XXXX-XXXX-XXXX"
              aria-label="DARKE ID"
              spellCheck={false}
            />
            <div className="signup-id-wiggle">
              {hasId ? (
                <button
                  type="button"
                  className="term-btn term-btn-emerald signup-id-action is-icon"
                  disabled={busy}
                  title={copiedId ? "Copied" : "Copy DARKE ID"}
                  aria-label={copiedId ? "Copied" : "Copy DARKE ID"}
                  onClick={() => void copyId()}
                >
                  <IconCopy />
                </button>
              ) : (
                <button
                  type="button"
                  className="term-btn term-btn-emerald signup-id-action"
                  disabled={busy}
                  onClick={generateId}
                >
                  GENERATE
                </button>
              )}
            </div>
          </div>
          {hasId ? (
            <p className="signup-id-warn">
              Save your DARKE ID somewhere safe or memorize it. If you lose it,
              we can't help you.
            </p>
          ) : null}
          <div className="gate-pass-row">
            <input
              type={showPassphrase ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Choose Password (6+ characters)"
              aria-label="Choose Password"
              minLength={PASSPHRASE_MIN}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
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
          <div className="gate-pass-row">
            <input
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Confirm Password"
              aria-label="Confirm Password"
              minLength={PASSPHRASE_MIN}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={busy}
            />
            <button
              type="button"
              className="gate-pass-btn"
              disabled={busy}
              title={showConfirm ? "Hide password" : "Show password"}
              aria-label={showConfirm ? "Hide password" : "Show password"}
              aria-pressed={showConfirm}
              onClick={() => setShowConfirm((on) => !on)}
            >
              {showConfirm ? <IconEyeOff /> : <IconEye />}
            </button>
          </div>
          {passphrase ? (
            <div
              className={`gate-crack is-${estimate.rating === "BUNKER-GRADE" ? "bunker" : estimate.rating === "SOLID" ? "solid" : "weak"}`}
              aria-live="polite"
            >
              <div className="gate-crack-bar" aria-hidden />
              <p>ESTIMATED CRACK TIME (GPU CLUSTER): {estimate.crackTime}</p>
              <p>SECURITY RATING: {estimate.rating}</p>
            </div>
          ) : null}
          <button
            type="button"
            className="term-btn term-btn-emerald"
            disabled={busy || !step1Ready}
            onClick={continueToProfile}
          >
            CONTINUE TO PROFILE →
          </button>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <p className="signup-progress">STEP 2 OF 2 • OPERATOR IDENTITY</p>
          <h1 className="signup-title">SET YOUR DISPLAY PROFILE</h1>
          <p className="signup-copy">
            Choose how contacts and networks see you in DARKE Messenger,
            Channels, and feeds.
          </p>
          <label className="gate-id-loc-label" htmlFor="signup-display-name">
            Display Name
          </label>
          <input
            id="signup-display-name"
            autoComplete="name"
            placeholder="e.g. Alex Mercer"
            aria-label="Display Name"
            value={displayName}
            maxLength={DISPLAY_NAME_MAX}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={busy}
            autoFocus
            required
          />
          <p className="signup-field-help">
            Your real name or team title for internal admin identification
          </p>
          <label className="gate-id-loc-label" htmlFor="signup-username">
            Username
          </label>
          <div className={`profile-username-field is-${handleAvail}`}>
            <input
              id="signup-username"
              autoComplete="username"
              placeholder="@alexm"
              aria-label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={busy}
              spellCheck={false}
              required
            />
            {handleAvail === "free" ? (
              <span className="profile-username-mark is-ok" aria-hidden>
                ✓
              </span>
            ) : null}
            {handleAvail === "taken" || handleAvail === "invalid" ? (
              <span className="profile-username-mark is-bad" aria-hidden>
                ✕
              </span>
            ) : null}
          </div>
          <p className="signup-field-help">
            Unique handle for encrypted mentions and p2p nodes
          </p>
          {handleAvail === "taken" ? (
            <p className="profile-username-msg is-bad">
              This username not available
            </p>
          ) : null}
          {handleAvail === "invalid" ? (
            <p className="profile-username-msg is-bad">
              {usernameHint(slug, username) ||
                "Username must be 3–30 letters, numbers, or underscores."}
            </p>
          ) : null}
          {handleAvail === "error" ? (
            <p className="profile-username-msg is-bad">
              Could not check that username.
            </p>
          ) : null}
          <button
            type="submit"
            className="term-btn term-btn-emerald"
            disabled={
              busy ||
              !isValidDisplayName(displayName) ||
              !isValidUsername(slug) ||
              handleAvail !== "free"
            }
          >
            {busy ? status || "Entering…" : "ENTER DARKE"}
          </button>
        </>
      ) : null}

      {copiedId ? (
        <p className="signup-toast" role="status">
          Your DARKE ID is copied!
        </p>
      ) : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        className="text-link"
        disabled={busy}
        onClick={onHome}
      >
        ← BACK TO HOME
      </button>
    </form>
  );
}
