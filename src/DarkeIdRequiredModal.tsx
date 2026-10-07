import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createDarkeAccount } from "./createAccount";
import { IconCopy, IconEye, IconEyeOff } from "./icons";
import {
  estimatePassphraseLocal,
  generatePassphrase,
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
import { gateMessage, usernameAvailable } from "./supabase";

export function DarkeIdRequiredModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (result: {
    slug: string;
    darkeId: string;
    publicKey: string;
    handle: string;
  }) => void;
}) {
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avail, setAvail] = useState<
    "idle" | "checking" | "free" | "taken" | "invalid" | "error"
  >("idle");
  const userRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);
  const estimate = useMemo(
    () => estimatePassphraseLocal(passphrase),
    [passphrase],
  );

  useEffect(() => {
    if (!open) return;
    setPassphrase("");
    setShowPassphrase(false);
    setCopied(false);
    setError(null);
    setBusy(false);
    setHandle("");
    setDisplayName("");
    setAvail("idle");
    const timer = window.setTimeout(() => userRef.current?.focus(), 30);
    return () => {
      window.clearTimeout(timer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const slug = normalizeUsername(handle);
    if (!isValidUsername(slug)) {
      setAvail(handle.trim() ? "invalid" : "idle");
      return;
    }
    setAvail("checking");
    const timer = window.setTimeout(() => {
      void usernameAvailable(slug)
        .then((ok) => setAvail(ok ? "free" : "taken"))
        .catch(() => setAvail("error"));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [open, handle]);

  async function copyPassphrase() {
    if (!passphrase) return;
    try {
      await navigator.clipboard.writeText(passphrase);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy password.");
    }
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    const slug = normalizeUsername(handle);
    if (!isValidDisplayName(displayName)) {
      setError("Display name is required (1–50 characters).");
      return;
    }
    if (!isValidUsername(slug)) {
      setError("Username must be 3–30 letters, numbers, or underscores.");
      return;
    }
    if (passphrase.length < PASSPHRASE_MIN) {
      setError(`Password must be at least ${PASSPHRASE_MIN} characters.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createDarkeAccount({
        passphrase,
        username: handle,
        displayName: normalizeDisplayNameInput(displayName),
      });
      onCreated({ ...created, handle });
    } catch (err) {
      setError(gateMessage(err));
      setBusy(false);
    }
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="apps-modal-backdrop dm-ready-backdrop speed-id-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <form
        className="apps-modal dm-ready-modal speed-id-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="speed-id-title"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <img
          className="speed-id-logo"
          src="/darke.png"
          alt="DARKE"
          draggable={false}
        />
        <p className="darke-login-kicker" id="speed-id-title">
          SET YOUR DARKE LOGIN
        </p>
        <label className="dm-session-label" htmlFor="speed-id-display">
          DISPLAY NAME
        </label>
        <input
          id="speed-id-display"
          autoComplete="name"
          placeholder="e.g. Alex Mercer"
          value={displayName}
          maxLength={DISPLAY_NAME_MAX}
          disabled={busy}
          onChange={(e) => {
            setDisplayName(e.target.value);
            setError(null);
          }}
        />
        <p className="signup-field-help">
          Your real name or team title for internal admin identification
        </p>
        <label className="dm-session-label" htmlFor="speed-id-user">
          CHOOSE A USERNAME
        </label>
        <div className={`profile-username-field is-${avail}`}>
          <input
            id="speed-id-user"
            ref={userRef}
            className="speed-id-handle"
            autoComplete="username"
            spellCheck={false}
            placeholder="@alexm"
            value={handle}
            disabled={busy}
            onChange={(e) => {
              setHandle(e.target.value);
              setError(null);
            }}
          />
          {avail === "free" ? (
            <span className="profile-username-mark is-ok" aria-hidden>
              ✓
            </span>
          ) : null}
          {avail === "taken" || avail === "invalid" ? (
            <span className="profile-username-mark is-bad" aria-hidden>
              ✕
            </span>
          ) : null}
        </div>
        <p className="signup-field-help">
          Unique handle for encrypted mentions and p2p nodes
        </p>
        {avail === "invalid" && handle.trim() ? (
          <p className="profile-username-msg is-bad">
            {usernameHint(normalizeUsername(handle), handle) ||
              "Username must be 3–30 letters, numbers, or underscores."}
          </p>
        ) : null}
        <label className="dm-session-label" htmlFor="speed-id-pass">
          CHOOSE A PASSWORD
        </label>
        <div className="gate-pass-row">
          <input
            id="speed-id-pass"
            ref={passRef}
            type={showPassphrase ? "text" : "password"}
            autoComplete="new-password"
            spellCheck={false}
            placeholder="What password do you want to use?"
            value={passphrase}
            minLength={PASSPHRASE_MIN}
            onChange={(e) => {
              setPassphrase(e.target.value);
              setCopied(false);
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
          {passphrase ? (
            <button
              type="button"
              className="gate-pass-btn"
              disabled={busy}
              title={copied ? "Copied" : "Copy password"}
              aria-label={copied ? "Copied" : "Copy password"}
              onClick={() => void copyPassphrase()}
            >
              <IconCopy />
            </button>
          ) : null}
        </div>
        <button
          type="button"
          className="speed-id-suggest"
          disabled={busy}
          onClick={() => {
            setPassphrase(generatePassphrase());
            setShowPassphrase(true);
            setCopied(false);
            setError(null);
            window.setTimeout(() => passRef.current?.focus(), 0);
          }}
        >
          Suggest a Password.
        </button>
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
        {error ? <p className="copy speed-id-error">{error}</p> : null}
        <button
          type="submit"
          className="term-btn term-btn-emerald speed-id-go"
          disabled={
            busy ||
            !isValidDisplayName(displayName) ||
            !isValidUsername(normalizeUsername(handle)) ||
            avail !== "free" ||
            passphrase.length < PASSPHRASE_MIN
          }
        >
          {busy ? "LAUNCHING…" : "LAUNCH DARKE"}
        </button>
      </form>
    </div>,
    document.body,
  );
}
