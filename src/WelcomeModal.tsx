import { useState } from "react";
import { inviteUrlForSlug } from "./invites";

export type WelcomeGo = "home";

type Props = {
  slug: string;
  onClose: (dontShowAgain: boolean, go?: WelcomeGo) => void | Promise<void>;
  onOpenUrl: (url: string) => void;
};

const X_SHARE_TEXT =
  "Chrome is a bloated memory engine designed to track your every move. It's time to take back your desktop. Join the Browser Wars on DARKE:";

export function WelcomeModal({ slug, onClose, onOpenUrl }: Props) {
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const inviteLink = inviteUrlForSlug(slug);

  async function dismiss() {
    if (busy) return;
    setBusy(true);
    try {
      await onClose(dontShowAgain);
    } finally {
      setBusy(false);
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteLink);
    } catch {
      return;
    }
    setToast(true);
    window.setTimeout(() => setToast(false), 2200);
  }

  function shareX() {
    onOpenUrl(
      `https://x.com/intent/tweet?text=${encodeURIComponent(X_SHARE_TEXT)}&url=${encodeURIComponent(inviteLink)}`,
    );
    void dismiss();
  }

  function shareLinkedIn() {
    onOpenUrl(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(inviteLink)}`,
    );
    void dismiss();
  }

  function shareFacebook() {
    onOpenUrl(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(inviteLink)}`,
    );
    void dismiss();
  }

  return (
    <div
      className="welcome-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) void dismiss();
      }}
    >
      <div className="welcome-modal">
        <button
          type="button"
          className="apps-modal-x"
          aria-label="Close"
          disabled={busy}
          onClick={() => void dismiss()}
        >
          ×
        </button>
        {toast ? (
          <p className="welcome-toast" role="status">
            Invite link copied to clipboard.
          </p>
        ) : null}

        <div className="welcome-hero">
          <img
            className="welcome-logo"
            src="/darke.png"
            alt="DARKE"
            draggable={false}
          />
          <h2 id="welcome-title">Welcome, {slug}.</h2>
          <div className="welcome-brief">
            <p className="welcome-lead">
              DARKE is better with others.
              <br />
              Share your invite link.
            </p>
          </div>
        </div>

        <div className="welcome-actions-block">
          <div className="welcome-invite-row">
            <input
              className="welcome-invite-input"
              value={inviteLink}
              readOnly
              aria-label="Invite link"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              className="welcome-copy"
              disabled={busy}
              onClick={() => void copyInvite()}
            >
              Copy invite link
            </button>
          </div>
          <div className="welcome-share" role="group" aria-label="Share invite link">
            <button
              type="button"
              className="welcome-share-btn"
              title="Share on X"
              aria-label="Share on X"
              disabled={busy}
              onClick={shareX}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M18.244 2H21.5l-7.5 8.57L22.5 22h-6.59l-5.16-6.74L4.8 22H1.54l8.02-9.16L1.5 2h6.74l4.66 6.18L18.244 2zm-1.16 18h1.82L7.01 3.94H5.06L17.084 20z"
                />
              </svg>
            </button>
            <button
              type="button"
              className="welcome-share-btn"
              title="Share on LinkedIn"
              aria-label="Share on LinkedIn"
              disabled={busy}
              onClick={shareLinkedIn}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M4.98 3.5A2.5 2.5 0 1 1 4.97 8.5 2.5 2.5 0 0 1 4.98 3.5zM3.5 9.5h3V21h-3zM9 9.5h2.87v1.57h.04c.4-.76 1.38-1.56 2.84-1.56 3.04 0 3.6 2 3.6 4.6V21h-3v-5.13c0-1.22-.02-2.8-1.7-2.8-1.7 0-1.96 1.33-1.96 2.7V21H9z"
                />
              </svg>
            </button>
            <button
              type="button"
              className="welcome-share-btn"
              title="Share on Facebook"
              aria-label="Share on Facebook"
              disabled={busy}
              onClick={shareFacebook}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M14 9h3V6h-3c-2.2 0-4 1.8-4 4v2H8v3h2v7h3v-7h2.6l.4-3H13v-2c0-.6.4-1 1-1z"
                />
              </svg>
            </button>
          </div>
          <label className="welcome-skip">
            <input
              type="checkbox"
              checked={dontShowAgain}
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                if (busy) return;
                setDontShowAgain(true);
                void onClose(true);
              }}
              onChange={() => {
                if (busy) return;
                setDontShowAgain(true);
                void onClose(true);
              }}
            />
            Don&apos;t show again
          </label>
        </div>
      </div>
    </div>
  );
}
