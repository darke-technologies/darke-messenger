import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconEye, IconEyeOff } from "./icons";
import {
  playAccessDeniedSound,
  playConfirmIdentitySound,
  playIdentityConfirmedSound,
} from "./gateAudio";
import { completeUsernameLogin } from "./session";
import { gateMessage, supabase } from "./supabase";
import { readLastUsername, useDarkeIdentity } from "./DarkeIdentityContext";

export function DarkeLoginModal({
  open,
  onClose,
  onLoggedIn,
  inline = false,
}: {
  open: boolean;
  onClose?: () => void;
  onLoggedIn: (slug: string) => void;
  inline?: boolean;
}) {
  const { identity, setIdentity } = useDarkeIdentity();
  const [username, setUsername] = useState(
    () => identity?.handle || readLastUsername(),
  );
  const [passphrase, setPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setPassphrase("");
    setShowPassphrase(false);
    setError(null);
    setBusy(false);
    setUsername(identity?.handle || readLastUsername());
    playConfirmIdentitySound();
    const timer = window.setTimeout(() => passRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open, identity?.handle]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    if (!username.trim()) {
      playAccessDeniedSound();
      setError("Enter your username.");
      return;
    }
    if (!passphrase) {
      playAccessDeniedSound();
      setError("Enter your password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await completeUsernameLogin(username, passphrase);
      setIdentity({
        darkeId: result.darkeId,
        handle: result.slug,
        displayName: result.displayName,
        publicKey: result.publicKey,
      });
      playIdentityConfirmedSound();
      onLoggedIn(result.slug);
    } catch (err) {
      playAccessDeniedSound();
      setError(gateMessage(err));
      setBusy(false);
      void supabase.auth.signOut().catch(() => null);
    }
  }

  if (!open || (!inline && typeof document === "undefined")) return null;

  const form = (
      <form
        className={`speed-id-modal darke-login-modal${inline ? " darke-login-panel" : " apps-modal dm-ready-modal"}`}
        role={inline ? undefined : "dialog"}
        aria-modal={inline ? undefined : true}
        aria-label="Login"
        onMouseDown={inline ? undefined : (e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <img
          className="speed-id-logo"
          src="/darke.png"
          alt="DARKE"
          draggable={false}
        />
        <label className="dm-session-label" htmlFor="darke-login-user">
          USERNAME
        </label>
        <input
          id="darke-login-user"
          className="speed-id-handle"
          autoComplete="username"
          spellCheck={false}
          value={username}
          disabled={busy}
          onChange={(e) => {
            setUsername(e.target.value);
            setError(null);
          }}
        />
        <label className="dm-session-label" htmlFor="darke-login-pass">
          PASSWORD
        </label>
        <div className="gate-pass-row">
          <input
            id="darke-login-pass"
            ref={passRef}
            type={showPassphrase ? "text" : "password"}
            autoComplete="current-password"
            spellCheck={false}
            value={passphrase}
            disabled={busy}
            onChange={(e) => {
              setPassphrase(e.target.value);
              setError(null);
            }}
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
        {error ? <p className="copy speed-id-error">{error}</p> : null}
        <button
          type="submit"
          className="term-btn term-btn-emerald speed-id-go"
          disabled={busy}
        >
          {busy ? "UNLOCKING…" : "LOGIN TO TERMINAL →"}
        </button>
      </form>
  );

  if (inline) return form;

  return createPortal(
    <div
      className="apps-modal-backdrop dm-ready-backdrop speed-id-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose?.();
      }}
    >
      {form}
    </div>,
    document.body,
  );
}
