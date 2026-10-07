import { FormEvent, useRef, useState } from "react";
import { playAccessDeniedSound } from "./gateAudio";
import { LockStars } from "./LockStars";
import { IconEye, IconEyeOff } from "./icons";
import { ACCESS_DENIED } from "./darkeId";
import { useDarkeIdentity } from "./DarkeIdentityContext";
import { completeUsernameLogin } from "./session";
import { gateMessage, supabase } from "./supabase";

type Props = {
  slug: string;
  onUnlock: () => void;
  onBeforeClose?: () => void | Promise<void>;
};

export function IdleLockOverlay({ onUnlock }: Props) {
  const { identity } = useDarkeIdentity();
  const [username, setUsername] = useState(identity?.handle ?? "");
  const [passphrase, setPassphrase] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const op = useRef(0);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !passphrase) {
      playAccessDeniedSound();
      setError(ACCESS_DENIED);
      return;
    }
    const id = ++op.current;
    setError(null);
    setBusy(true);
    try {
      await completeUsernameLogin(username, passphrase);
      if (id !== op.current) return;
      onUnlock();
    } catch (err) {
      if (id !== op.current) return;
      playAccessDeniedSound();
      const shown = gateMessage(err);
      setError(
        shown.toLowerCase().includes("network") ? shown : ACCESS_DENIED,
      );
      void supabase.auth.signOut().catch(() => null);
    } finally {
      if (id === op.current) setBusy(false);
    }
  }

  return (
    <div className="idle-lock" role="dialog" aria-modal="true" aria-label="Time out">
      <div className="idle-lock-chrome">
        <img
          className="titlebar-logo"
          src="/darke.png"
          alt="DARKE"
          draggable={false}
        />
        <div className="idle-lock-chrome-drag" />
      </div>
      <LockStars />
      <form className="idle-lock-card gate-card gate-card-stars" onSubmit={(e) => void onSubmit(e)}>
        <img className="gate-logo" src="/darke.png" alt="" draggable={false} />
        <input
          className="gate-id-input"
          autoComplete="username"
          placeholder="Username"
          aria-label="Username"
          spellCheck={false}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <div className="gate-pass-row">
          <input
            type={showPass ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Password"
            aria-label="Password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
          <button
            type="button"
            className="gate-eye"
            aria-label={showPass ? "Hide password" : "Show password"}
            onClick={() => setShowPass((v) => !v)}
          >
            {showPass ? <IconEyeOff /> : <IconEye />}
          </button>
        </div>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="term-btn term-btn-primary" disabled={busy}>
          {busy ? "Unlocking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}
